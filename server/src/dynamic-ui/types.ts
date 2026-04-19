// EX1.7 + EX3-A.2: Template Library & Layout Pattern type definitions
// @see docs/phases/phase-ex1.md, docs/phases/phase-ex3.md

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
  /** EX3-A.2: Layout pattern this template follows */
  layoutPattern?: string;
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

// ── EX3-A.2: Layout Pattern Library types ───────────────

/**
 * A slot in a layout pattern where widgets should be placed.
 * Guides the LLM generator on what widgets go where.
 */
export interface WidgetSlot {
  /** Slot identifier (e.g., 'summary-stats', 'main-table') */
  id: string;
  /** Where this slot lives — 'root' or a section/tab ID */
  location: string;
  /** Allowed widget types for this slot */
  widgetTypes: string[];
  /** Layout mode for widgets in this slot */
  layout?: 'grid-auto-fit' | 'grid-2' | 'grid-3' | 'grid-4' | 'stack';
  /** Whether the slot must be filled */
  required: boolean;
  /** Maximum widgets allowed in this slot */
  maxCount?: number;
}

/**
 * A named layout pattern — structural blueprint that the LLM fills with real data.
 * Each pattern defines the layout skeleton, which widget types go where,
 * and rules the LLM must follow when populating.
 */
export interface LayoutPattern {
  /** Unique pattern ID (e.g., 'dashboard-metrics') */
  id: string;
  /** Human-readable name */
  name: string;
  /** When to use this pattern */
  description: string;
  /** Which contentType classifications map to this pattern */
  contentTypes: string[];

  /** Structural skeleton — layout hierarchy with widget slots */
  skeleton: {
    /** Root layout type */
    layout: 'stack' | 'grid' | 'tabs';
    /** Optional sections for tabbed patterns */
    sections?: { id: string; label: string; icon?: string }[];
    /** Where widgets should be placed */
    widgetSlots: WidgetSlot[];
  };

  /** Rules the LLM MUST follow when populating this pattern */
  populationRules: string[];
  /** Widget types that work well in this pattern */
  recommendedWidgets: string[];
  /** Widget types that should NOT be used in this pattern */
  discouragedWidgets: string[];
}
