"use client";
import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { editorExtensions, setViolationsEffect, type LineAnnotation } from './codemirror';
import { minimalChange } from '@/lib/textChange';
import type { ViolationMarker } from './useIdeStore';
import { pathHits } from './violationUtils';

/* -- CodeMirror 6 editor for the active tab -------------------------
 * One EditorState per tab lives in `states`, so undo history, folds and the
 * cursor survive tab switches. Text changed outside the editor (agent edits,
 * reverts) arrives through `value` and is applied as a single undo step.
 */
export function CodeEditor({
  path,
  value,
  states,
  onChange,
  onCursor,
  onSave,
  revealLine,
  onRevealed,
  violationMarkers = [],
}: {
  path: string;
  value: string;
  states: React.RefObject<Map<string, EditorState>>;
  onChange: (value: string) => void;
  onCursor: (line: number, col: number) => void;
  onSave: () => void;
  /** Move the cursor to this line (1-based) and scroll it into view, then call onRevealed */
  revealLine?: number;
  onRevealed?: () => void;
  violationMarkers?: ViolationMarker[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef(path);

  // The editor outlives renders; it always calls the latest handlers through this ref
  const handlers = useRef({ onChange, onCursor, onSave, onRevealed });
  useEffect(() => {
    handlers.current = { onChange, onCursor, onSave, onRevealed };
  });

  const createState = (statePath: string, doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        editorExtensions({ path: statePath, onSave: () => handlers.current.onSave() }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            handlers.current.onCursor(line.number, head - line.from + 1);
          }
        }),
      ],
    });

  // Mount once
  useEffect(() => {
    const cache = states.current;
    const view = new EditorView({
      parent: hostRef.current!,
      state: cache.get(pathRef.current) ?? createState(pathRef.current, value),
    });
    viewRef.current = view;
    return () => {
      cache.set(pathRef.current, view.state);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch tabs, then take in any outside change to the text
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (pathRef.current !== path) {
      states.current.set(pathRef.current, view.state);
      view.setState(states.current.get(path) ?? createState(path, value));
      pathRef.current = path;
    }
    const doc = view.state.doc.toString();
    if (doc !== value) {
      view.dispatch({ changes: minimalChange(doc, value), annotations: isolateHistory.of('full') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, value]);

  // Synchronize architectural violation & cycle squiggles + inline annotations
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const lineMarkers = new Map<number, LineAnnotation[]>();
    if (violationMarkers && violationMarkers.length > 0) {
      for (const m of violationMarkers) {
        if (m.line && pathHits(path, m.path)) {
          const list = lineMarkers.get(m.line) ?? [];
          list.push({ kind: m.kind === 'cycle' ? 'cycle' : 'violation', text: m.message });
          lineMarkers.set(m.line, list);
        }
      }
    }
    view.dispatch({ effects: setViolationsEffect.of(lineMarkers) });
  }, [path, value, violationMarkers]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !revealLine) return;
    const line = view.state.doc.line(Math.min(revealLine, view.state.doc.lines));
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    view.focus();
    handlers.current.onRevealed?.();
  }, [path, revealLine]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
