"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { unifiedMergeView, getChunks, getOriginalDoc } from '@codemirror/merge';
import { editorExtensions } from './codemirror';
import type { PendingEdit } from './types';

/* -- Review an agent edit as an inline diff --------------------------
 * Each change has Accept / Reject buttons. When none are left, or on
 * Accept all / Reject all, onFinish gets the text the user kept.
 * Render with key={edit.id} so every new edit starts a fresh review.
 */
export function EditReview({ edit, onFinish }: { edit: PendingEdit; onFinish: (text: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const finished = useRef(false);
  const initialChanges = useMemo(
    () => getChunks(EditorState.create({ doc: edit.after, extensions: unifiedMergeView({ original: edit.before }) }))?.chunks.length ?? 0,
    [edit],
  );
  const [remaining, setRemaining] = useState<number | null>(null);
  const changesLeft = remaining ?? initialChanges;

  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  });

  const finish = (text: string) => {
    if (finished.current) return;
    finished.current = true;
    finishRef.current(text);
  };

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: edit.after,
        extensions: [
          editorExtensions({ path: edit.path, onSave: () => {} }),
          unifiedMergeView({ original: edit.before, mergeControls: true, gutter: true }),
          EditorView.updateListener.of(update => {
            const chunks = getChunks(update.state)?.chunks.length ?? 0;
            setRemaining(chunks);
            if (chunks === 0) finish(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [edit]);

  const acceptAll = () => {
    const view = viewRef.current;
    if (view) finish(view.state.doc.toString());
  };
  const rejectAll = () => {
    const view = viewRef.current;
    if (view) finish(getOriginalDoc(view.state).toString());
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-ai/10 border-b border-ai/30 text-sm select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-ai whitespace-nowrap">Review agent edit</span>
          <span className="text-fg-muted truncate">
            {edit.name} · {edit.summary}
            {` · ${changesLeft} ${changesLeft === 1 ? 'change' : 'changes'} left`}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={rejectAll}
            className="px-2.5 py-1 rounded-md text-xs border border-danger/40 text-danger-fg hover:bg-danger/15 cursor-pointer"
          >
            Reject all
          </button>
          <button
            onClick={acceptAll}
            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-success text-canvas hover:bg-success-fg cursor-pointer"
          >
            Accept all
          </button>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <div ref={hostRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
