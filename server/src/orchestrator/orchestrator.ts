// M1.4: Command Orchestrator
// @see docs/phases/phase-1.md
// @see docs/DECISIONS.md (ADR-013)

import type { ZodSchema } from 'zod';
import { BaseService } from '../services/base-service.js';
import type { ConnectionManager, ExecResult } from '../ssh/connection-manager.js';
import type { ParsingPipeline } from '../parsers/pipeline.js';

export interface CommandStep {
  id: string;
  command: string;
  schema: ZodSchema;
  fallbackCommands?: string[];
  optional?: boolean;
  dependsOn?: string[];
  timeout?: number;
}

export interface ExecutionPlan {
  steps: CommandStep[];
  parallel?: boolean;
}

export interface StepResult {
  stepId: string;
  success: boolean;
  data?: unknown;
  parsedBy?: 'deterministic' | 'llm' | 'cache';
  error?: string;
  latencyMs: number;
  command: string;       // The command that actually succeeded
  retries: number;
}

export interface ExecutionResult<T> {
  data: T;
  steps: StepResult[];
  totalLatencyMs: number;
}

const MAX_RETRIES = 2;

export class CommandOrchestrator extends BaseService {
  private ssh!: ConnectionManager;
  private pipeline!: ParsingPipeline;

  protected async _init(): Promise<void> {
    this.ssh = this.services.get<ConnectionManager>('ssh');
    this.pipeline = this.services.get<ParsingPipeline>('parser');
  }

  async execute<T>(
    serverId: string,
    plan: ExecutionPlan,
    aggregator: (results: Map<string, unknown>) => T,
  ): Promise<ExecutionResult<T>> {
    const start = Date.now();
    const stepResults: StepResult[] = [];
    const dataMap = new Map<string, unknown>();
    const completedSteps = new Set<string>();

    if (plan.parallel) {
      // All independent steps run in parallel
      const independentSteps = plan.steps.filter(s => !s.dependsOn?.length);
      const dependentSteps = plan.steps.filter(s => s.dependsOn?.length);

      // Wave 1: independent steps
      const results = await Promise.allSettled(
        independentSteps.map(step => this.executeStep(serverId, step))
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i]!;
        const step = independentSteps[i]!;

        if (result.status === 'fulfilled') {
          stepResults.push(result.value);
          if (result.value.success) {
            dataMap.set(step.id, result.value.data);
            completedSteps.add(step.id);
          }
        } else {
          const failResult: StepResult = {
            stepId: step.id,
            success: false,
            error: result.reason?.message ?? 'Unknown error',
            latencyMs: 0,
            command: step.command,
            retries: 0,
          };
          stepResults.push(failResult);

          if (!step.optional) {
            throw new Error(`Required step "${step.id}" failed: ${failResult.error}`);
          }
        }
      }

      // Wave 2+: dependent steps (run sequentially for now)
      for (const step of dependentSteps) {
        const depsReady = step.dependsOn!.every(dep => completedSteps.has(dep));
        if (!depsReady) {
          if (step.optional) continue;
          throw new Error(`Dependencies not met for step "${step.id}"`);
        }

        try {
          const result = await this.executeStep(serverId, step);
          stepResults.push(result);
          if (result.success) {
            dataMap.set(step.id, result.data);
            completedSteps.add(step.id);
          }
        } catch (err) {
          if (!step.optional) throw err;
        }
      }
    } else {
      // Sequential execution
      for (const step of plan.steps) {
        const result = await this.executeStep(serverId, step);
        stepResults.push(result);
        if (result.success) {
          dataMap.set(step.id, result.data);
          completedSteps.add(step.id);
        } else if (!step.optional) {
          throw new Error(`Required step "${step.id}" failed: ${result.error}`);
        }
      }
    }

    return {
      data: aggregator(dataMap),
      steps: stepResults,
      totalLatencyMs: Date.now() - start,
    };
  }

  // ── Execute a single step with retry + fallback ───────

  private async executeStep(serverId: string, step: CommandStep): Promise<StepResult> {
    const start = Date.now();
    let retries = 0;
    let lastError: string | undefined;

    // Try primary command + fallbacks
    const commands = [step.command, ...(step.fallbackCommands ?? [])];

    for (const command of commands) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const execResult: ExecResult = await this.ssh.exec(serverId, command, step.timeout);

          if (execResult.exitCode !== 0) {
            lastError = `Exit code ${execResult.exitCode}: ${execResult.stderr.slice(0, 200)}`;
            // Try next command in fallback chain
            break;
          }

          const parseResult = await this.pipeline.parse(
            command,
            execResult.stdout,
            step.schema,
            serverId,
          );

          return {
            stepId: step.id,
            success: true,
            data: parseResult.data,
            parsedBy: parseResult.parsedBy,
            latencyMs: Date.now() - start,
            command,
            retries,
          };
        } catch (err) {
          retries++;
          lastError = (err as Error).message;

          // If it's a Zod validation error, retry with context
          if (lastError.includes('Expected') || lastError.includes('Required')) {
            // The pipeline will retry with error context on next LLM call
            continue;
          }

          // Non-validation error — don't retry, try fallback instead
          break;
        }
      }
    }

    return {
      stepId: step.id,
      success: false,
      error: lastError ?? 'All commands failed',
      latencyMs: Date.now() - start,
      command: step.command,
      retries,
    };
  }
}
