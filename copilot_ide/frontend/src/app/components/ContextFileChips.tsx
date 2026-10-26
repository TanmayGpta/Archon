'use client';

import React from 'react';
import { Glyph } from './Icons';

export interface ContextFileItem {
  path: string;
  name: string;
  content?: string;
  size?: number;
}

export interface SuggestedFileItem {
  path: string;
  reason: string;
  confidence?: number;
}

interface Props {
  contextFiles: ContextFileItem[];
  onRemoveFile: (path: string) => void;
  suggestedFiles: SuggestedFileItem[];
  onAddSuggestedFile: (suggestion: SuggestedFileItem) => void;
  isDraggingOver?: boolean;
}

export default function ContextFileChips({
  contextFiles,
  onRemoveFile,
  suggestedFiles,
  onAddSuggestedFile,
  isDraggingOver
}: Props) {
  const hasItems = contextFiles.length > 0 || suggestedFiles.length > 0 || isDraggingOver;

  if (!hasItems) return null;

  return (
    <div className="flex flex-col gap-2 p-2 px-3 bg-surface border-b border-line text-xs font-mono select-none animate-in fade-in-50 duration-200">
      
      {/* Drag & Drop Visual Indicator */}
      {isDraggingOver && (
        <div className="p-3 border-2 border-dashed border-cyan-400 bg-cyan-950/40 rounded-panel flex items-center justify-center gap-2 text-cyan-300 font-semibold text-xs animate-pulse">
          <span><Glyph name="inbox" /></span>
          <span>Drop file to pin as surgical context chip</span>
        </div>
      )}

      {/* Pinned Context Files Bar */}
      {contextFiles.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase font-bold text-slate-400 flex items-center gap-1">
            <span><Glyph name="paperclip" /> Attached Context:</span>
          </span>
          {contextFiles.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-panel bg-overlay border border-cyan-700/40 text-fg text-xs hover:border-cyan-500/60 transition-all group"
              title={`Attached: ${file.path} (Full file injected for surgical edits)`}
            >
              <span className="text-cyan-400"><Glyph name="file" /></span>
              <span className="font-semibold text-white">{file.name}</span>
              <span className="text-xs text-slate-400 max-w-[120px] truncate">({file.path})</span>
              <button
                type="button"
                onClick={() => onRemoveFile(file.path)}
                className="ml-1 text-slate-400 hover:text-rose-400 cursor-pointer transition-colors p-0.5"
                title="Remove context chip" aria-label="Remove context chip"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* OmniKey Pre-Prompt Minimal Recommendations (95/2 Rule) */}
      {suggestedFiles.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-0.5">
          <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
            <span><Glyph name="lightbulb" /> OmniKey 95/2 Suggestion:</span>
          </span>
          {suggestedFiles.map((sug) => {
            const fileName = sug.path.split('/').pop() || sug.path;
            return (
              <button
                type="button"
                key={sug.path}
                onClick={() => onAddSuggestedFile(sug)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-amber-950/40 hover:bg-amber-900/60 border border-amber-700/50 text-amber-200 text-xs transition-all cursor-pointer group hover:scale-[1.02]"
                title={sug.reason || 'Click to add as context'}
              >
                <span className="text-amber-400 font-bold"><Glyph name="plus" /></span>
                <span className="font-semibold text-white">{fileName}</span>
                <span className="text-xs text-amber-300/80 max-w-[200px] truncate">
                  ({sug.reason})
                </span>
                {sug.confidence && (
                  <span className="text-xs px-1 py-0.2 rounded-control bg-amber-900/80 text-amber-200 font-mono">
                    {Math.round(sug.confidence * 100)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
