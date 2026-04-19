// EX3-B.4: FakeLLM Generator — deterministic view generation from templates
// Generates DynamicView JSON from templates + fixture/mock data without LLM calls.
// Used for testing, playground iteration, and visual regression.
// @see docs/phases/phase-ex3.md

import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';
import { DynamicViewSchema } from 'headlessos-shared/schemas/dynamic-view';
import { ALL_TEMPLATES } from './templates/index.js';
import type { UITemplate } from './types.js';
import { TemplateRegistry } from './template-registry.js';

/**
 * A deterministic view generator that uses templates + sample data
 * to produce valid DynamicView JSON without any LLM calls.
 */
export class FakeLLMGenerator {
  private templates: Map<string, UITemplate>;
  private registry: TemplateRegistry;

  constructor(templates?: UITemplate[]) {
    const tpls = templates ?? ALL_TEMPLATES;
    this.templates = new Map(tpls.map((t) => [t.id, t]));
    this.registry = new TemplateRegistry();
    this.registry.registerAll(tpls);
  }

  /**
   * Generate a DynamicView from a template by name.
   * Returns the template schema directly (already valid DynamicView).
   */
  generate(templateName: string): DynamicView {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: "${templateName}". Available: ${[...this.templates.keys()].join(', ')}`);
    }
    // Templates are pre-validated DynamicView — return directly
    const parsed = DynamicViewSchema.parse(template.schema);
    return parsed;
  }

  /**
   * Auto-select a template based on mock command output patterns
   * and return the generated view.
   */
  generateFromCommand(command: string): DynamicView | null {
    const matches = this.registry.matchCommand(command);
    if (matches.length === 0) return null;
    return this.generate(matches[0].template.id);
  }

  /**
   * Generate views for ALL templates. Useful for playground rendering
   * and visual regression testing.
   * Returns array of { templateId, view } objects.
   */
  generateAll(): Array<{ templateId: string; templateName: string; view: DynamicView }> {
    const results: Array<{ templateId: string; templateName: string; view: DynamicView }> = [];
    for (const template of this.templates.values()) {
      try {
        const view = this.generate(template.id);
        results.push({
          templateId: template.id,
          templateName: template.name,
          view,
        });
      } catch {
        // Skip templates that fail validation
      }
    }
    return results;
  }

  /**
   * Get a list of all available template IDs.
   */
  getAvailableTemplates(): string[] {
    return [...this.templates.keys()];
  }

  /**
   * Check if a template exists.
   */
  hasTemplate(templateName: string): boolean {
    return this.templates.has(templateName);
  }

  /**
   * Get the total number of templates.
   */
  get size(): number {
    return this.templates.size;
  }
}
