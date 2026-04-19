// EX3-C.4: Multi-Step Executor Prompt — guides agent to build views incrementally
// Instead of generating the entire view in one LLM call, this prompt instructs
// the agent to use mutation tools (add_widget, replace_widget, add_tab) to
// build the view step-by-step, enabling progressive rendering.
// @see docs/phases/phase-ex3.md

/**
 * Generate the multi-step executor system prompt.
 * This prompt is used when the agent builds a view incrementally
 * via the WorkingView mutation tools.
 */
export function buildMultiStepPrompt(opts: {
  skeleton: string;
  classification: string;
  terminalOutput: string;
  patternName: string;
  populationRules: string[];
  expectedWidgets: string[];
  useVisualization: boolean;
}): string {
  const rulesText = opts.populationRules.map((r, i) => `  ${i + 1}. ${r}`).join('\n');
  const widgetsText = opts.expectedWidgets.join(', ');

  return `You are a progressive UI builder for HeadlessOS. You have a layout skeleton with empty sections.
Your job is to fill each section with real widgets using mutation tools, one at a time.

## Current Skeleton
\`\`\`json
${opts.skeleton}
\`\`\`

## Classification Result
${opts.classification}

## Terminal Output to Visualize
\`\`\`
${opts.terminalOutput.slice(0, 8000)}
\`\`\`

## Build Order (FOLLOW THIS SEQUENCE)

1. **Summary first** — Fill stat-cards, key-value pairs, or alert widgets at the root level.
   These provide the "at a glance" overview. Use add_widget for section "main".
2. **Primary content** — Fill the main data widget (table, card-list, badge-grid).
   This is the largest widget and carries the most information.
3. **Secondary content** — Fill tabs, additional tables, or supporting widgets.
   Use add_tab if the pattern uses tabs. Each tab should have one primary widget.
4. **Final polish** — Add alerts/warnings if the data contains issues worth highlighting.
   Place alerts ABOVE the content they relate to.

## Population Rules for Pattern: ${opts.patternName}
${rulesText}

## Expected Widget Types
${widgetsText}

## Available Mutation Tools

- **add_widget(sectionId, widget)** — Add a widget to a section's children. Use for stat-cards, tables, key-value, alerts, progress-bars.
- **replace_widget(sectionId, index, widget)** — Replace an existing widget at a specific position. Use to swap placeholders with populated widgets.
- **add_tab(sectionId, tab)** — Add a new tab to a tabs layout. Each tab needs: id, label, optional icon/count, and children array with widgets.
- **update_metadata(title, description, icon)** — Update the view title, description, or icon.

## Rules

- Call ONE tool at a time. Each call updates the view shown to the user in real-time.
- Extract REAL data from the terminal output — never invent values.
- Follow the widget selection matrix:
  - Single number → stat-card
  - Percentage → progress-bar (or gauge if useVisualization: true)
  - Name:value pairs → key-value
  - List of items → table (with filters if >10 rows)
  - Status flags → badge-grid
  - Raw config → code-block
${opts.useVisualization ? '- Chart/gauge IS approved for this view (useVisualization: true)' : '- Do NOT add chart or gauge (useVisualization: false)'}
- stat-cards MUST go in a grid layout with autoFit:true, NEVER stack vertically.
- Maximum 10 widgets per view total.
- Do NOT create empty tabs or placeholder widgets.

## Completion

When all sections are populated, stop calling tools. The system will finalize the view.`;
}

/**
 * Generate a concise classification context string for injection into the prompt.
 */
export function formatClassification(classification: {
  contentType: string;
  layoutPattern: string;
  expectedWidgets: string[];
  sectionCount: number;
  designNotes: string;
  useVisualization: boolean;
  visualizationReason?: string | null;
}): string {
  return [
    `Content Type: ${classification.contentType}`,
    `Layout Pattern: ${classification.layoutPattern}`,
    `Expected Widgets: ${classification.expectedWidgets.join(', ')}`,
    `Sections: ${classification.sectionCount}`,
    `Visualization: ${classification.useVisualization ? `YES (${classification.visualizationReason ?? 'approved'})` : 'NO'}`,
    `Notes: ${classification.designNotes}`,
  ].join('\n');
}
