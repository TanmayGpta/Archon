"use client";
import { EditorState, Extension } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  HighlightStyle, syntaxHighlighting, foldGutter, foldKeymap, indentOnInput, bracketMatching,
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';

/* -- Editor theme, built from the design tokens in globals.css ---- */
const tint = (token: string, pct: number) => `color-mix(in oklab, var(--color-${token}) ${pct}%, transparent)`;

const archonTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--color-canvas)',
    color: 'var(--color-fg-soft)',
    fontSize: 'var(--text-base)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '20px' },
  '.cm-content': { caretColor: 'var(--color-accent-fg)', padding: '12px 0' },
  '.cm-content:focus-visible': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-accent-fg)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: tint('accent', 30),
  },
  '.cm-activeLine': { backgroundColor: tint('selected', 25) },
  '.cm-gutters': {
    backgroundColor: 'var(--color-canvas)',
    color: 'var(--color-fg-subtle)',
    borderRight: '1px solid var(--color-line-subtle)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-accent-fg)' },
  '.cm-foldPlaceholder': {
    backgroundColor: tint('selected', 60),
    border: '1px solid ' + tint('accent', 30),
    color: 'var(--color-accent-fg)',
  },
  '.cm-matchingBracket': { backgroundColor: tint('accent', 25), outline: '1px solid ' + tint('accent', 50) },
  '.cm-searchMatch': { backgroundColor: tint('warning', 25) },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: tint('warning', 45) },
  '.cm-selectionMatch': { backgroundColor: tint('accent', 15) },
  '.cm-panels': { backgroundColor: 'var(--color-surface)', color: 'var(--color-fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-line)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--color-line)' },
  '.cm-textfield': {
    backgroundColor: 'var(--color-raised)',
    border: '1px solid var(--color-line)',
    color: 'var(--color-fg)',
    borderRadius: '6px',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--color-raised)',
    border: '1px solid var(--color-line)',
    color: 'var(--color-fg-soft)',
    borderRadius: '6px',
  },
  '.cm-tooltip': { backgroundColor: 'var(--color-raised)', border: '1px solid var(--color-line)' },

  // Diff review (@codemirror/merge unified view)
  '.cm-changedLine': { backgroundColor: tint('success', 10) },
  '.cm-changedText': { backgroundColor: tint('success', 30) },
  '.cm-insertedLine': { backgroundColor: tint('success', 12) },
  '.cm-deletedChunk': { backgroundColor: tint('danger', 12) },
  '.cm-deletedChunk .cm-deletedText': { backgroundColor: tint('danger', 30) },
  '.cm-changeGutter': { width: '3px', paddingLeft: '1px' },
  '.cm-changedLineGutter, .cm-insertedLineGutter': { backgroundColor: 'var(--color-success)' },
  '.cm-deletedLineGutter': { backgroundColor: 'var(--color-danger)' },
  '.cm-chunkButtons button': {
    border: 'none',
    borderRadius: '6px',
    padding: '1px 8px',
    marginLeft: '4px',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
  },
  '.cm-chunkButtons button[name=accept]': { backgroundColor: 'var(--color-success)', color: 'var(--color-canvas)' },
  '.cm-chunkButtons button[name=reject]': { backgroundColor: 'var(--color-danger)', color: 'var(--color-fg-strong)' },
}, { dark: true });

const archonHighlight = HighlightStyle.define([
  { tag: t.comment, color: 'var(--color-fg-subtle)', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--color-syntax-string)' },
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier], color: 'var(--color-syntax-keyword)', fontWeight: '600' },
  { tag: [t.bool, t.null, t.number, t.atom, t.self, t.attributeName], color: 'var(--color-syntax-constant)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], color: 'var(--color-syntax-function)' },
  { tag: [t.standard(t.variableName), t.typeName, t.className, t.namespace], color: 'var(--color-syntax-builtin)' },
  { tag: [t.punctuation, t.operator, t.bracket, t.separator], color: 'var(--color-syntax-punct)' },
  { tag: [t.variableName, t.propertyName], color: 'var(--color-fg-soft)' },
  { tag: t.tagName, color: 'var(--color-danger-fg)' },
  { tag: t.heading, color: 'var(--color-accent-fg)', fontWeight: '700' },
  { tag: t.link, color: 'var(--color-info)', textDecoration: 'underline' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.invalid, color: 'var(--color-danger)' },
]);

/* -- Language support by file extension ---------------------------- */
export function languageFor(path: string): Extension {
  switch (path.split('.').pop()?.toLowerCase()) {
    case 'py': case 'pyi': return python();
    case 'js': case 'mjs': case 'cjs': return javascript();
    case 'jsx': return javascript({ jsx: true });
    case 'ts': case 'mts': case 'cts': return javascript({ typescript: true });
    case 'tsx': return javascript({ jsx: true, typescript: true });
    case 'json': return json();
    case 'md': case 'markdown': return markdown();
    default: return [];
  }
}

/* -- Everything an IDE editor needs: gutters, folding, search, history, keys - */
export function editorExtensions({ path, onSave }: { path: string; onSave: () => void }): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    history(),
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => { onSave(); return true; } },
      indentWithTab,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
    ]),
    syntaxHighlighting(archonHighlight),
    languageFor(path),
    archonTheme,
  ];
}
