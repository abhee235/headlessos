// EX2.2: Agent Tool Registry
// @see docs/phases/phase-ex2.md — EX2.2

import type { AgentTool } from './types.js';

/**
 * Registry for agent tools. Provides registration, lookup, and listing.
 * Used by the reactive executor to find tools by name when processing
 * LLM tool_calls responses.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  /**
   * Register a single tool. Throws if a tool with the same name already exists.
   */
  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools at once.
   */
  registerAll(tools: AgentTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name. Returns undefined if not found.
   */
  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered by name.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools.
   */
  getAll(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all registered tool names.
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tools filtered by security tier.
   */
  getByTier(tier: AgentTool['securityTier']): AgentTool[] {
    return this.getAll().filter(t => t.securityTier === tier);
  }

  /**
   * Number of registered tools.
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Remove all registered tools (for testing).
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Create a pre-populated tool registry with all default agent tools.
 */
export function createDefaultToolRegistry(): ToolRegistry {
  // Lazy import to avoid circular deps
  const registry = new ToolRegistry();

  // Tools are registered by the orchestrator during init
  // This factory just creates an empty registry — tools are
  // registered externally so tests can control which tools exist.
  return registry;
}
