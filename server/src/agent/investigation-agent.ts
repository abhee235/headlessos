// M11.5: ReAct Investigation Agent
// @see docs/DECISIONS.md (ADR-013, ADR-014)
//
// A read-only AI agent that investigates server issues by iteratively:
// 1. Thinking about what to check next
// 2. Running a command (from the read-only allowlist)
// 3. Observing the output
// 4. Deciding whether to continue or give an answer

import { z } from 'zod';
import type { ConnectionManager, ExecResult } from '../ssh/connection-manager.js';
import type { LLMProvider } from '../llm/provider.js';
import { EventEmitter } from 'events';

// ── Agent allowlist (ADR-014) ───────────────────────────

const AGENT_READ_ONLY_ALLOWLIST: RegExp[] = [
  // System info
  /^cat\s+\/proc\/(cpuinfo|meminfo|loadavg|version|stat|uptime|filesystems|mounts|swaps)$/,
  /^cat\s+\/etc\/(os-release|hostname|hosts|resolv\.conf|fstab|passwd|group|shadow|sudoers)$/,
  /^head\s+-n\s+\d+\s+/,
  /^tail\s+-n\s+\d+\s+/,
  /^tail\s+-f?\s+-n\s+\d+\s+/,
  /^wc\s+(-[lcw]\s+)?/,
  /^grep\s+(-[rinlcEP]+\s+)*('|")?.+\2\s+/,
  /^find\s+\/[^\s;|&]*\s+/,
  /^ls\s+(-[laRhtr1]+\s+)*(\/[^\s;|&]*)?$/,
  /^stat\s+/,
  /^file\s+/,

  // Disk & storage
  /^df\s+(-[hHTPi]+\s*)+$/,
  /^du\s+(-[shx]+\s+)*(\/[^\s;|&]*)?$/,
  /^lsblk(\s+(-[flo]+))?$/,
  /^findmnt(\s+(-[lnr]+))?/,
  /^swapon\s+--show/,

  // Memory & CPU
  /^free\s+(-[mhgb]+\s*)+$/,
  /^vmstat(\s+\d+\s+\d+)?$/,
  /^iostat(\s+-[dxc]+)?(\s+\d+\s+\d+)?$/,
  /^top\s+-b\s*-?n\s*1/,
  /^top\s+-bn\s*1/,
  /^uptime$/,

  // Processes
  /^ps\s+(aux|ef|axo\s+)/,
  /^pgrep\s+/,

  // Network
  /^ip\s+((-brief\s+)?addr|route|link|neigh)/,
  /^ss\s+(-[tlunpa46]+\s*)+/,
  /^netstat\s+(-[tlunpa]+\s*)+$/,
  /^nslookup\s+/,
  /^dig\s+/,
  /^ping\s+-c\s*[1-5]\s+/,
  /^curl\s+(-[sISLkvH]+\s+)*https?:\/\//,
  /^wget\s+(-q\s+)?-O\s*-\s+/,

  // System
  /^hostname$/,
  /^uname\s+-[a-z]+$/,
  /^who(\s+-[a-z]+)*$/,
  /^w$/,
  /^last(\s+-\d+)?(\s+-[a-z]+)*$/,
  /^dmesg(\s+--time-format=\S+)?(\s+\|\s+tail\s+-n\s+\d+)?$/,

  // Logs
  /^journalctl\s+--no-pager/,
  /^journalctl\s+(-b|--boot)(\s+--no-pager)?/,
  /^journalctl\s+-u\s+\S+/,
  /^tail\s+-n\s+\d+\s+\/var\/log\//,
  /^cat\s+\/var\/log\//,

  // Docker (read-only)
  /^docker\s+ps(\s+-[a]+)?(\s+--format\s+\S+)?$/,
  /^docker\s+images(\s+--format\s+\S+)?$/,
  /^docker\s+inspect\s+/,
  /^docker\s+logs\s+(--tail\s+\d+\s+)?/,
  /^docker\s+stats\s+--no-stream/,
  /^docker\s+compose\s+(ps|ls|config)/,

  // Systemd (read-only)
  /^systemctl\s+(status|list-units|list-unit-files|is-active|is-enabled|show)\s+/,
  /^systemctl\s+list-units(\s+--type=\S+)?(\s+--state=\S+)?$/,
  /^systemctl\s+--failed$/,
  /^systemctl\s+list-units\s+--state=failed$/,

  // Nginx (read-only)
  /^nginx\s+-t/,
  /^nginx\s+-T$/,

  // Git (read-only)
  /^git\s+(log|status|branch|remote|diff|show)/,
];

const BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+(-[rfdi]+\s+)*\//,
  /mkfs/,
  /dd\s+if=/,
  /shutdown/,
  /reboot/,
  /init\s+[06]/,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,
  /chmod\s+(-R\s+)?777\s+\//,
  />\s*\/dev\/sd/,
  /wget.*\|\s*(sh|bash)/,
  /curl.*\|\s*(sh|bash)/,
  /\brm\b.*--no-preserve-root/,
  />\s*\/etc\//,
  /sudo\s+su/,
  /passwd/,
];

export function isCommandAllowed(cmd: string): boolean {
  const trimmed = cmd.trim();

  // Check blocked patterns first
  for (const blocked of BLOCKED_PATTERNS) {
    if (blocked.test(trimmed)) return false;
  }

  // Check allowlist — support piped commands (each segment must be allowed or a safe filter)
  const segments = trimmed.split(/\s*\|\s*/);
  const PIPE_FILTERS = [
    /^grep\s+/,
    /^head\s+/,
    /^tail\s+/,
    /^sort(\s+-[a-zA-Z0-9]+)*$/,
    /^uniq(\s+-[cd]+)?$/,
    /^wc\s+/,
    /^awk\s+/,
    /^sed\s+/,
    /^cut\s+/,
    /^tr\s+/,
    /^column\s+/,
    /^less$/,
    /^cat$/,
  ];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!.trim();
    if (i === 0) {
      // First command must be in allowlist
      const allowed = AGENT_READ_ONLY_ALLOWLIST.some(re => re.test(seg));
      if (!allowed) return false;
    } else {
      // Piped commands can be safe filters
      const isFilter = PIPE_FILTERS.some(re => re.test(seg));
      if (!isFilter) return false;
    }
  }

  return true;
}

// ── Agent Step Schema (for structured LLM output) ───────

const AgentThoughtSchema = z.object({
  thought: z.string().describe('Your reasoning about what to investigate next'),
  command: z.string().nullable().describe('The Linux command to run (null if you have enough info to answer)'),
  answer: z.string().nullable().describe('Your final answer/diagnosis (only set this when you are confident you have the answer, null otherwise)'),
  decision: z.enum(['run_command', 'answer']).describe('"run_command" to execute the command, "answer" to provide your final response'),
});

type AgentThought = z.infer<typeof AgentThoughtSchema>;

// ── Agent Step (public) ─────────────────────────────────

export interface AgentStep {
  stepNumber: number;
  thought: string;
  command?: string;
  output?: string;
  observation?: string;
  decision: 'continue' | 'answer' | 'error';
}

export interface AgentResult {
  sessionId: string;
  question: string;
  steps: AgentStep[];
  answer: string;
  totalSteps: number;
  totalTokens: number;
  totalLatencyMs: number;
  status: 'completed' | 'aborted' | 'error' | 'max_steps_reached';
}

export interface AgentOptions {
  maxSteps?: number;
  readOnly?: boolean;
  commandTimeout?: number;
}

// ── ReAct Agent ─────────────────────────────────────────

const DEFAULT_MAX_STEPS = 10;
const DEFAULT_CMD_TIMEOUT = 15_000;

const AGENT_SYSTEM_PROMPT = `You are an expert Linux system administrator AI agent. You investigate server issues by running read-only diagnostic commands and analyzing the output.

## How You Work (ReAct Loop)
1. **Think**: Analyze what you know and what you need to find out next
2. **Act**: Choose a command to run for diagnosis
3. **Observe**: Review the command output
4. Repeat until you have enough information to give a confident answer

## Rules
- You can ONLY run read-only diagnostic commands (no writes, no modifications)
- Available commands include: cat, head, tail, grep, find, ls, stat, df, du, free, vmstat, iostat, top, ps, uptime, hostname, uname, who, w, last, ss, netstat, ip, docker ps/inspect/logs, systemctl status, journalctl, etc.
- Keep commands simple and focused — one diagnostic check at a time
- After each command output, explain what you learned (observation)
- When you have enough evidence, provide a clear diagnosis and actionable recommendations
- Maximum steps: you'll be told the limit. Use your steps wisely.
- If a command fails, try an alternative
- Be specific in your diagnosis — cite actual values from command outputs`;

export class InvestigationAgent {
  private abortedSessions = new Set<string>();
  public events = new EventEmitter();

  constructor(
    private ssh: ConnectionManager,
    private llmProvider: LLMProvider | null,
  ) {}

  setLLMProvider(provider: LLMProvider | null): void {
    this.llmProvider = provider;
  }

  abort(sessionId: string): void {
    this.abortedSessions.add(sessionId);
  }

  async investigate(
    serverId: string,
    question: string,
    options: AgentOptions = {},
  ): Promise<AgentResult> {
    if (!this.llmProvider) {
      return {
        sessionId: crypto.randomUUID(),
        question,
        steps: [],
        answer: 'LLM provider is not configured. Please set up an API key in Settings > AI/LLM.',
        totalSteps: 0,
        totalTokens: 0,
        totalLatencyMs: 0,
        status: 'error',
      };
    }

    const sessionId = crypto.randomUUID();
    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    const cmdTimeout = options.commandTimeout ?? DEFAULT_CMD_TIMEOUT;
    const steps: AgentStep[] = [];
    let totalTokens = 0;
    const startTime = Date.now();
    let finalAnswer = '';
    let status: AgentResult['status'] = 'completed';

    // Build conversation history for the LLM
    const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
      {
        role: 'user',
        content: `Investigate this server issue:\n\n${question}\n\nYou have up to ${maxSteps} steps. Use diagnostic commands to gather evidence, then provide your diagnosis.`,
      },
    ];

    for (let step = 1; step <= maxSteps; step++) {
      // Check abort
      if (this.abortedSessions.has(sessionId)) {
        status = 'aborted';
        finalAnswer = 'Investigation aborted by user.';
        break;
      }

      // Ask LLM for next action
      let thought: AgentThought;
      try {
        const userPrompt = conversationHistory
          .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n') + `\n\nStep ${step}/${maxSteps}. Respond with your next thought, command to run, or final answer.`;

        const parseResult = await this.llmProvider.parseText({
          rawOutput: '',
          command: 'agent-investigate',
          schema: AgentThoughtSchema,
          systemPrompt: AGENT_SYSTEM_PROMPT,
          userPrompt,
        });

        thought = parseResult.data;
        totalTokens += parseResult.tokensUsed.input + parseResult.tokensUsed.output;
      } catch (err) {
        steps.push({
          stepNumber: step,
          thought: 'LLM call failed',
          decision: 'error',
        });
        status = 'error';
        finalAnswer = `LLM error: ${err instanceof Error ? err.message : 'Unknown error'}`;
        break;
      }

      // Emit step progress
      this.events.emit(`step:${sessionId}`, { step, thought: thought.thought, decision: thought.decision });

      // If agent decided to answer
      if (thought.decision === 'answer' && thought.answer) {
        steps.push({
          stepNumber: step,
          thought: thought.thought,
          decision: 'answer',
        });
        finalAnswer = thought.answer;
        break;
      }

      // Agent wants to run a command
      if (thought.decision === 'run_command' && thought.command) {
        const cmd = thought.command.trim();

        // Validate command against allowlist
        if (!isCommandAllowed(cmd)) {
          const blockMsg = `Command blocked: "${cmd}" is not in the read-only allowlist.`;
          steps.push({
            stepNumber: step,
            thought: thought.thought,
            command: cmd,
            output: blockMsg,
            observation: 'Command was blocked by security policy',
            decision: 'continue',
          });
          conversationHistory.push(
            { role: 'assistant', content: `Thought: ${thought.thought}\nAction: ${cmd}` },
            { role: 'user', content: `Observation: ${blockMsg}\nTry a different command.` },
          );
          continue;
        }

        // Execute command
        let execResult: ExecResult;
        try {
          execResult = await this.ssh.exec(serverId, cmd, cmdTimeout);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Command execution failed';
          steps.push({
            stepNumber: step,
            thought: thought.thought,
            command: cmd,
            output: errMsg,
            observation: 'Command execution failed',
            decision: 'continue',
          });
          conversationHistory.push(
            { role: 'assistant', content: `Thought: ${thought.thought}\nAction: ${cmd}` },
            { role: 'user', content: `Observation: Command failed with error: ${errMsg}` },
          );
          continue;
        }

        // Truncate very long output to keep context window manageable
        const output = execResult.stdout.length > 4000
          ? execResult.stdout.substring(0, 4000) + '\n...(output truncated)...'
          : execResult.stdout;

        const stderr = execResult.stderr.length > 500
          ? execResult.stderr.substring(0, 500) + '...'
          : execResult.stderr;

        const fullOutput = stderr ? `STDOUT:\n${output}\nSTDERR:\n${stderr}` : output;

        steps.push({
          stepNumber: step,
          thought: thought.thought,
          command: cmd,
          output: fullOutput,
          decision: 'continue',
        });

        // Emit progress
        this.events.emit(`step:${sessionId}`, {
          step,
          thought: thought.thought,
          command: cmd,
          outputPreview: fullOutput.substring(0, 200),
        });

        conversationHistory.push(
          { role: 'assistant', content: `Thought: ${thought.thought}\nAction: ${cmd}` },
          { role: 'user', content: `Observation:\n${fullOutput}\n\nAnalyze this output and decide your next step.` },
        );
      }

      // If we've reached max steps (moved inside to count tokens, but also handled after loop)
      if (step === maxSteps && !finalAnswer) {
        status = 'max_steps_reached';
      }
    }

    // After loop: if no answer yet, ask for a final summary
    if (!finalAnswer && status !== 'aborted') {
      if (status !== 'max_steps_reached' && status !== 'error') {
        status = 'max_steps_reached';
      }
      try {
        conversationHistory.push({
          role: 'user',
          content: 'You have reached the maximum number of steps. Please provide your best diagnosis based on what you have gathered so far.',
        });

        const finalPrompt = conversationHistory
          .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n') + '\n\nYou have reached the maximum number of steps. Provide your best diagnosis now based on what you have gathered.';

        const finalResult = await this.llmProvider!.parseText({
          rawOutput: '',
          command: 'agent-final-answer',
          schema: AgentThoughtSchema,
          systemPrompt: AGENT_SYSTEM_PROMPT,
          userPrompt: finalPrompt,
        });
        finalAnswer = finalResult.data.answer ?? finalResult.data.thought;
        totalTokens += finalResult.tokensUsed.input + finalResult.tokensUsed.output;
      } catch {
        finalAnswer = 'Investigation reached maximum steps without a conclusive answer. Review the steps above for partial findings.';
      }
    }

    this.abortedSessions.delete(sessionId);

    return {
      sessionId,
      question,
      steps,
      answer: finalAnswer,
      totalSteps: steps.length,
      totalTokens,
      totalLatencyMs: Date.now() - startTime,
      status,
    };
  }
}
