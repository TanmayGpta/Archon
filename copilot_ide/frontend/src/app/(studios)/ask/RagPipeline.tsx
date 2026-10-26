"use client";
import React, { useState } from 'react';

/* -- Strategy Info Definitions ------------------------------- */
export const PIPELINE_STAGES = [
  { 
    id: 0, 
    key: 'query',
    label: 'Query', 
    targetTab: 'terminal',
    highlightKey: null,
    sub: 'Tokenizing input',
    description: 'Prepares raw prompt tokens and dispatches dual-stream retrieval across lexical and vector indices.'
  },
  { 
    id: 1, 
    key: 'bm25',
    label: 'BM25', 
    targetTab: 'search',
    highlightKey: 'bm25',
    sub: 'Lexical index',
    description: 'Exact keyword matching via Okapi BM25 scoring over inverted document index tokens.'
  },
  { 
    id: 2, 
    key: 'dense',
    label: 'Dense Vector', 
    targetTab: 'search',
    highlightKey: 'dense',
    sub: 'Semantic embedding',
    description: 'Transforms query into 384-dimensional dense vectors (BAAI/bge-small-en-v1.5) and measures cosine/L2 proximity in ChromaDB.'
  },
  { 
    id: 3, 
    key: 'cross_encoder',
    label: 'Cross-Encoder', 
    targetTab: 'search',
    highlightKey: 'cross_encoder',
    sub: 'Deep attention re-rank',
    description: 'Performs full cross-attention over [Query, Document] pairs using ms-marco-MiniLM-L-6-v2 to score true semantic alignment.'
  },
  { 
    id: 4, 
    key: 'llm',
    label: 'LLM Synthesis', 
    targetTab: 'terminal',
    highlightKey: null,
    sub: 'Streaming tokens',
    description: 'Injects top re-ranked context into local model via Ollama with real-time token streaming.'
  },
];

/* -- Interactive RAG Pipeline Visualization ------------------ */
export function RagPipeline({ 
  currentStage, 
  onNavigateStage 
}: { 
  currentStage: number; 
  onNavigateStage: (stage: typeof PIPELINE_STAGES[0]) => void;
}) {
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  return (
    <div className="border border-line bg-canvas rounded-panel p-5 mb-8 relative overflow-hidden transition-all duration-500 animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />
          <span className="text-xs font-mono text-fg-subtle tracking-[0.2em] uppercase font-semibold">
            Interactive Retrieval Pipeline
          </span>
        </div>
        <span className="text-xs font-mono text-fg-subtle">
          Click any stage node to jump to diagnostic inspector
        </span>
      </div>

      <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
        {PIPELINE_STAGES.map((s, i) => {
          const isActive = currentStage === s.id;
          const isDone = currentStage > s.id;
          const isHovered = hoveredNode === s.id;

          return (
            <React.Fragment key={s.id}>
              <button
                type="button"
                onClick={() => onNavigateStage(s)}
                onMouseEnter={() => setHoveredNode(s.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className={`group flex-1 min-w-[130px] p-3 rounded-control border text-left transition-all duration-300 cursor-pointer relative ${
                  isActive
                    ? 'bg-accent/10 border-accent/50 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-accent/30'
                    : isDone
                      ? 'bg-success/5 border-success/30 hover:border-success/50'
                      : isHovered
                        ? 'bg-surface border-line-strong '
                        : 'bg-canvas border-line hover:border-line-strong'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-mono font-bold tracking-wider uppercase ${
                    isActive ? 'text-accent-fg' : isDone ? 'text-success' : 'text-fg-subtle'
                  }`}>
                    0{s.id + 1}
                  </span>
                  <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    isActive ? 'bg-accent animate-ping' : isDone ? 'bg-success' : 'bg-overlay group-hover:bg-[#4a5060]'
                  }`} />
                </div>
                <div className={`text-sm font-mono font-semibold truncate transition-colors duration-300 ${
                  isActive ? 'text-fg' : isDone ? 'text-fg-soft' : 'text-fg-muted group-hover:text-fg'
                }`}>
                  {s.label}
                </div>
                <div className="text-xs font-mono text-fg-subtle truncate mt-0.5">
                  {s.sub}
                </div>
              </button>
              {i < PIPELINE_STAGES.length - 1 && (
                <div className="w-4 h-px relative flex-shrink-0">
                  <div className={`h-full transition-all duration-700 ${
                    currentStage > i ? 'bg-success/60' : 'bg-overlay'
                  }`} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
