"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { unifiedMergeView, getChunks, getOriginalDoc } from '@codemirror/merge';
import { editorExtensions } from './codemirror';
import type { PendingEdit } from './types';

export interface FileHealActions {
  label: string;
  busy?: boolean;
  onAccept: (keptText: string) => void;
  onReject: () => void;
  onAcceptAll?: () => void;
  onClosePreview?: () => void;
}

/* -- Review an agent edit as an inline diff --------------------------
 * Each change has Accept / Reject buttons. When none are left, or on
 * Accept all / Reject all, onFinish gets the text the user kept.
 * Render with key={edit.id} so every new edit starts a fresh review.
 */
export function EditReview({
  edit,
  onFinish,
  healActions,
}: {
  edit: PendingEdit;
  onFinish: (text: string) => void;
  healActions?: FileHealActions;
}) {
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
    const firstChunk = getChunks(view.state)?.chunks[0];
    if (firstChunk) {
      view.dispatch({ effects: EditorView.scrollIntoView(firstChunk.fromB, { y: 'center' }) });
    }
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5 bg-ai/10 border-b border-ai/30 text-xs select-none">
        <div className="flex items-center gap-2 min-w-[180px] flex-1 overflow-hidden">
          <span className={`font-semibold whitespace-nowrap ${healActions ? 'text-[#4ade80]' : 'text-ai'}`}>
            {healActions ? 'Patch preview' : 'Review agent edit'}
          </span>
          {healActions && (
            <span className="text-[11px] font-mono text-fg-muted whitespace-nowrap">
              {healActions.label}
            </span>
          )}
          <span className="text-fg-muted truncate">
            {edit.name} · {edit.summary}
            {` · ${changesLeft} ${changesLeft === 1 ? 'change' : 'changes'} left`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {healActions ? (
            <>
              <button
                onClick={() => {
                  if (finished.current) return;
                  finished.current = true;
                  const kept = viewRef.current?.state.doc.toString() ?? edit.after;
                  healActions.onAccept(kept);
                }}
                disabled={healActions.busy}
                className="px-2 py-0.5 rounded-control text-[11px] font-semibold bg-[#16a34a] hover:bg-[#22c55e] text-white cursor-pointer disabled:opacity-50"
              >
                {healActions.busy ? 'Applying...' : '✓ Accept'}
              </button>
              <button
                onClick={() => {
                  if (finished.current) return;
                  finished.current = true;
                  healActions.onReject();
                }}
                disabled={healActions.busy}
                className="px-2 py-0.5 rounded-control text-[11px] font-semibold bg-[#991b1b] hover:bg-[#b91c1c] text-white cursor-pointer disabled:opacity-50"
              >
                ✕ Deny
              </button>
              {healActions.onAcceptAll && (
                <button
                  onClick={() => {
                    if (finished.current) return;
                    finished.current = true;
                    healActions.onAcceptAll?.();
                  }}
                  disabled={healActions.busy}
                  className="px-2 py-0.5 rounded-control text-[11px] border border-[#16a34a] text-[#4ade80] hover:bg-[#16a34a]/20 cursor-pointer disabled:opacity-50"
                >
                  Accept all
                </button>
              )}
              {healActions.onClosePreview && (
                <button
                  onClick={healActions.onClosePreview}
                  disabled={healActions.busy}
                  className="px-1.5 py-0.5 rounded-control text-[11px] text-fg-muted hover:text-fg cursor-pointer disabled:opacity-50"
                >
                  Close ✕
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={rejectAll}
                className="px-2.5 py-1 rounded-control text-xs border border-danger/40 text-danger-fg hover:bg-danger/15 cursor-pointer"
              >
                Reject all
              </button>
              <button
                onClick={acceptAll}
                className="px-2.5 py-1 rounded-control text-xs font-semibold bg-success text-canvas hover:bg-success-fg cursor-pointer"
              >
                Accept all
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <div ref={hostRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
