// EX8.8: Monaco editor setup — bundled locally (no CDN: Electron runs offline),
// imported only by the lazy code-editor chunk.
// @see docs/phases/phase-ex8.md
//
// Workers: the core editor worker plus JSON / CSS / HTML / TypeScript language
// workers. Vite emits each as its own file, fetched the first time a model of
// that language opens. Colours come from Monaco's Monarch grammars (main thread).

import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json': return new JsonWorker();
      case 'css': case 'scss': case 'less': return new CssWorker();
      case 'html': case 'handlebars': case 'razor': return new HtmlWorker();
      case 'typescript': case 'javascript': return new TsWorker();
      default: return new EditorWorker();
    }
  },
};

// A single file from a server has no project around it, so "cannot find
// module" style semantic errors would be noise. Keep syntax errors.
const quietTs = { noSemanticValidation: true, noSyntaxValidation: false, noSuggestionDiagnostics: true };
monaco.typescript.typescriptDefaults.setDiagnosticsOptions(quietTs);
monaco.typescript.javascriptDefaults.setDiagnosticsOptions(quietTs);

// ── Lumen themes ────────────────────────────────────────

/** Fixed syntax palette — the viz hues, deepened for light glass */
const SYNTAX = {
  dark: {
    comment: '8C99A3', keyword: 'B9A2FF', string: '7FD3A0', number: 'F5B83D',
    type: '6FB6FF', fn: '8FD0FF', regexp: 'FF8F84', tag: '6FB6FF', attr: 'F5B83D',
    key: '8FC2FF', delimiter: 'A9B4BC', fg: 'E6ECF0', invalid: 'FF6B5E',
  },
  light: {
    comment: '667480', keyword: '5E3BE6', string: '1D7A45', number: '9A5B00',
    type: '1F63C4', fn: '0B6FA8', regexp: 'B8322A', tag: '1F63C4', attr: '9A5B00',
    key: '1F63C4', delimiter: '4A5860', fg: '14232B', invalid: 'C4372B',
  },
};

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

/** (Re)define the Lumen theme for the current light/dark mode and accent */
export function applyLumenEditorTheme(): string {
  const dark = document.documentElement.classList.contains('dark');
  const s = dark ? SYNTAX.dark : SYNTAX.light;
  const accent = cssVar('--lumen-accent', dark ? '#B9A2FF' : '#6A4FB0');
  const name = dark ? 'lumen-dark' : 'lumen-light';
  monaco.editor.defineTheme(name, {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: s.fg },
      { token: 'comment', foreground: s.comment, fontStyle: 'italic' },
      { token: 'keyword', foreground: s.keyword },
      { token: 'storage', foreground: s.keyword },
      { token: 'string', foreground: s.string },
      { token: 'string.escape', foreground: s.regexp },
      { token: 'number', foreground: s.number },
      { token: 'constant', foreground: s.number },
      { token: 'type', foreground: s.type },
      { token: 'type.identifier', foreground: s.type },
      { token: 'predefined', foreground: s.fn },
      { token: 'regexp', foreground: s.regexp },
      { token: 'tag', foreground: s.tag },
      { token: 'metatag', foreground: s.keyword },
      { token: 'attribute.name', foreground: s.attr },
      { token: 'attribute.value', foreground: s.string },
      { token: 'string.key.json', foreground: s.key },
      { token: 'string.value.json', foreground: s.string },
      { token: 'variable', foreground: s.fn },
      { token: 'variable.predefined', foreground: s.fn },
      { token: 'delimiter', foreground: s.delimiter },
      { token: 'operator', foreground: s.delimiter },
      { token: 'invalid', foreground: s.invalid },
    ],
    colors: {
      // Transparent: the editor sits on the window's paper pane
      'editor.background': '#00000000',
      'editorGutter.background': '#00000000',
      'minimap.background': '#00000000',
      'editor.foreground': `#${s.fg}`,
      'editorLineNumber.foreground': dark ? '#FFFFFF59' : '#10202A73',
      'editorLineNumber.activeForeground': dark ? '#FFFFFFD9' : '#10202AE0',
      'editor.lineHighlightBackground': dark ? '#FFFFFF0A' : '#10202A0A',
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': accent,
      'editor.selectionBackground': `${accent}4D`,
      'editor.inactiveSelectionBackground': `${accent}2E`,
      'editor.selectionHighlightBackground': `${accent}24`,
      'editor.findMatchBackground': `${accent}66`,
      'editor.findMatchHighlightBackground': `${accent}33`,
      // Brackets stay the delimiter colour (no rainbow pairs)
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`editorBracketHighlight.foreground${n}`, `#${s.delimiter}`])),
      'editorBracketHighlight.unexpectedBracket.foreground': `#${s.invalid}`,
      'editorBracketMatch.background': `${accent}26`,
      'editorBracketMatch.border': `${accent}99`,
      'editorIndentGuide.background1': dark ? '#FFFFFF14' : '#10202A14',
      'editorIndentGuide.activeBackground1': dark ? '#FFFFFF33' : '#10202A33',
      'editorWhitespace.foreground': dark ? '#FFFFFF26' : '#10202A26',
      'scrollbarSlider.background': dark ? '#FFFFFF1F' : '#10202A1F',
      'scrollbarSlider.hoverBackground': dark ? '#FFFFFF33' : '#10202A33',
      'scrollbarSlider.activeBackground': dark ? '#FFFFFF4D' : '#10202A4D',
      'editorWidget.background': dark ? '#23262D' : '#F7F8FA',
      'editorWidget.border': dark ? '#FFFFFF1F' : '#10202A1F',
      'editorSuggestWidget.background': dark ? '#23262D' : '#F7F8FA',
      'editorSuggestWidget.selectedBackground': `${accent}33`,
      'input.background': dark ? '#FFFFFF0F' : '#FFFFFF',
      'focusBorder': `${accent}99`,
    },
  });
  monaco.editor.setTheme(name);
  return name;
}

export { monaco };
