// EX1.7: Template Registry — stores templates, provides matching
// @see docs/phases/phase-ex1.md

import type { UITemplate, TemplateMatch } from './types.js';

/**
 * In-memory registry of UI templates.
 * Templates are registered at boot and matched by command patterns.
 */
export class TemplateRegistry {
  private templates = new Map<string, UITemplate>();

  /** Register a template. Replaces existing if same id. */
  register(template: UITemplate): void {
    this.templates.set(template.id, template);
  }

  /** Register multiple templates at once. */
  registerAll(templates: UITemplate[]): void {
    for (const t of templates) {
      this.register(t);
    }
  }

  /** Get a template by exact ID. */
  getById(id: string): UITemplate | undefined {
    return this.templates.get(id);
  }

  /** List all registered templates. */
  listAll(): UITemplate[] {
    return Array.from(this.templates.values());
  }

  /** Search templates by tag (OR — any matching tag returns the template). */
  searchByTag(tag: string): UITemplate[] {
    const lowerTag = tag.toLowerCase();
    return this.listAll().filter((t) =>
      t.tags.some((tt) => tt.toLowerCase() === lowerTag),
    );
  }

  /** Search templates by free-text query against name, description, and tags. */
  search(query: string): UITemplate[] {
    const lower = query.toLowerCase();
    return this.listAll().filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.description.toLowerCase().includes(lower) ||
        t.tags.some((tag) => tag.toLowerCase().includes(lower)),
    );
  }

  /**
   * Match a command string against all template matchPatterns.
   * Returns matching templates sorted by confidence (highest first).
   */
  matchCommand(command: string): TemplateMatch[] {
    const results: TemplateMatch[] = [];
    const trimmed = command.trim();

    for (const template of this.templates.values()) {
      for (const pattern of template.matchPatterns) {
        try {
          const regex = new RegExp(pattern, 'i');
          const match = regex.exec(trimmed);
          if (match) {
            // Confidence: full match of the command gives 1.0, partial match gives less
            const matchLength = match[0].length;
            const confidence = Math.min(1.0, matchLength / trimmed.length);
            results.push({
              template,
              matchedPattern: pattern,
              confidence,
            });
            break; // Only one match per template
          }
        } catch {
          // Invalid regex pattern — skip silently
        }
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  /** Get count of registered templates. */
  get size(): number {
    return this.templates.size;
  }
}

/** Singleton instance */
let _registry: TemplateRegistry | null = null;

/** Get or create the singleton TemplateRegistry. */
export function getTemplateRegistry(): TemplateRegistry {
  if (!_registry) {
    _registry = new TemplateRegistry();
  }
  return _registry;
}

/** Reset the singleton (for testing). */
export function resetTemplateRegistry(): void {
  _registry = null;
}
