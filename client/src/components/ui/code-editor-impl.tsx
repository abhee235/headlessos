// EX8.8: Monaco-backed code editor (lazy chunk — import CodeEditor from
// ./code-editor instead of this file).
// @see docs/phases/phase-ex8.md

import { useEffect, useRef } from 'react';
import { monaco, applyLumenEditorTheme } from '@/lib/monaco-setup';
import { languageForFile } from '@/lib/code-language';
import type { CodeEditorProps } from './code-editor';

let modelSeq = 0;

export default function CodeEditorImpl({ value, onChange, path, onSave, readOnly = false, className }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // Latest callbacks without re-creating the editor
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // Create once per file
  useEffect(() => {
    if (!hostRef.current) return;
    const themeName = applyLumenEditorTheme();
    // A unique URI per editor (two windows may open the same file); the path
    // keeps the file name for Monaco's own language features.
    const uri = monaco.Uri.from({ scheme: 'headlessos', path: path.startsWith('/') ? path : `/${path}`, query: String(++modelSeq) });
    const model = monaco.editor.createModel(value, languageForFile(path), uri);
    const editor = monaco.editor.create(hostRef.current, {
      model,
      theme: themeName,
      readOnly,
      automaticLayout: true,
      fontFamily: "'Geist Mono Variable', 'Geist Mono', ui-monospace, 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 20,
      fontLigatures: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      renderLineHighlight: 'line',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      roundedSelection: true,
      fixedOverflowWidgets: true,
      tabSize: 2,
      detectIndentation: true,
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: true,
      stickyScroll: { enabled: false },
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
      bracketPairColorization: { enabled: false },
      guides: { indentation: true, bracketPairs: false },
      'semanticHighlighting.enabled': false,
    });
    editorRef.current = editor;

    const sub = model.onDidChangeContent(() => onChangeRef.current?.(model.getValue()));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.());

    // Geist Mono may finish loading after Monaco measured the fallback font
    void document.fonts?.ready.then(() => monaco.editor.remeasureFonts());

    // Follow light/dark and accent changes on <html>
    const observer = new MutationObserver(() => applyLumenEditorTheme());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-accent'] });

    return () => {
      observer.disconnect();
      sub.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value is synced below; re-create only per file
  }, [path]);

  // Controlled value: push external changes (load, revert) into the model
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model && model.getValue() !== value) model.setValue(value);
  }, [value]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  return <div ref={hostRef} className={className} data-testid="code-editor" />;
}
