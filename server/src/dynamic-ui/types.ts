// EX1.7: Template Library — type definitions
// @see docs/phases/phase-ex1.md

import type { DynamicView } from 'headlessos-shared/schemas/dynamic-view';

/**
 * A curated UI template for a common CLI output pattern.
 * Templates are pre-validated DynamicView JSON that can be used as-is
 * or as hints/examples for LLM generation.
 */
export interface UITemplate {
  /** Unique template identifier (e.g. 'system-overview') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Short description of what this template visualizes */
  description: string;
  /** Searchable tags for categorization */
  tags: string[];
  /** Regex patterns to match against command strings (e.g. 'df -h', 'docker ps') */
  matchPatterns: string[];
  /** The template DynamicView JSON — must validate against DynamicViewSchema */
  schema: DynamicView;
}

/**
 * Result of matching a command against the template library.
 */
export interface TemplateMatch {
  template: UITemplate;
  /** Which pattern matched */
  matchedPattern: string;
  /** Confidence: 1.0 for exact match, lower for partial */
  confidence: number;
}
