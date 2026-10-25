"use client";
import React from 'react';
import { Icons } from '../../components/Icons';
import { useAsk } from './AskContext';

/* -- Upload preview and retrieval settings dialogs - */
export function AskDialogs() {
  const {
    showConfigModal,
    setShowConfigModal,
    chunkingStrategy,
    setChunkingStrategy,
    searchStrategy,
    setSearchStrategy,
    topK,
    setTopK,
    uploadChunks,
    showModal,
    setShowModal,
  } = useAsk();

  return (
    <>
      {/* Upload Spec Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-surface border border-line rounded-xl max-w-3xl w-full max-h-[75vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-line flex justify-between items-center">
              <div>
                <h3 className="text-base font-semibold text-fg tracking-tight">Document Ingested</h3>
                <p className="text-xs text-fg-subtle mt-1 font-mono">{uploadChunks.length} semantic segments extracted</p>
              </div>
              <button aria-label="Close" 
                onClick={() => setShowModal(false)} 
                className="text-fg-subtle hover:text-fg-soft transition-colors duration-300 w-8 h-8 flex items-center justify-center rounded-md hover:bg-overlay cursor-pointer"
              >
                <Icons.Close />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
              {uploadChunks.map((chunk, i) => (
                <div key={i} className="bg-canvas border border-line rounded-lg p-4 hover:border-line-strong transition-colors duration-300">
                  <div className="text-xs font-mono font-medium text-fg-subtle mb-2.5 tracking-wider uppercase">Segment {i + 1}</div>
                  <pre className="text-base text-fg-muted whitespace-pre-wrap font-mono leading-relaxed">{chunk}</pre>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-line flex justify-end">
              <button 
                onClick={() => setShowModal(false)} 
                className="bg-overlay hover:bg-selected text-fg-soft px-6 py-2 rounded-lg text-sm font-medium transition-all duration-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Configure Strategy & Hyperparameters Modal ─────────── */}
      {showConfigModal && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setShowConfigModal(false)}
        >
          <div 
            className="bg-surface border border-line rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Icons.Settings />
                <h3 className="text-lg font-mono font-semibold text-fg">
                  RAG Retrieval Configuration
                </h3>
              </div>
              <button aria-label="Close" 
                onClick={() => setShowConfigModal(false)}
                className="text-fg-subtle hover:text-fg-soft p-1 cursor-pointer rounded hover:bg-overlay"
              >
                <Icons.Close />
              </button>
            </div>

            {/* Chunking Strategy Option */}
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-fg-subtle font-semibold">
                Chunking Strategy
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'semantic', label: 'Semantic', desc: 'Context-aware splits' },
                  { id: 'fixed', label: 'Fixed Window', desc: '500-token chunks' },
                  { id: 'openapi', label: 'OpenAPI Spec', desc: 'Endpoint boundaries' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setChunkingStrategy(opt.id as any)}
                    className={`p-2.5 rounded-lg border text-left font-mono transition-all cursor-pointer ${
                      chunkingStrategy === opt.id
                        ? 'border-accent bg-accent/10 text-fg shadow-sm'
                        : 'border-line bg-canvas text-fg-subtle hover:text-fg-muted hover:border-line-strong'
                    }`}
                  >
                    <div className="text-xs font-semibold">{opt.label}</div>
                    <div className="text-xs text-fg-subtle mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Search Strategy Option */}
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-fg-subtle font-semibold">
                Retrieval & Ranking Strategy
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'hybrid', label: 'Hybrid Re-Rank', desc: 'BM25 + Dense + Cross' },
                  { id: 'dense', label: 'Dense Vector', desc: 'ChromaDB BGE-small' },
                  { id: 'bm25', label: 'BM25 Lexical', desc: 'Exact keyword match' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSearchStrategy(opt.id as any)}
                    className={`p-2.5 rounded-lg border text-left font-mono transition-all cursor-pointer ${
                      searchStrategy === opt.id
                        ? 'border-accent bg-accent/10 text-fg shadow-sm'
                        : 'border-line bg-canvas text-fg-subtle hover:text-fg-muted hover:border-line-strong'
                    }`}
                  >
                    <div className="text-xs font-semibold">{opt.label}</div>
                    <div className="text-xs text-fg-subtle mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Top-K Slider */}
            <div className="space-y-2 pt-2 border-t border-line">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-fg-subtle uppercase tracking-wider font-semibold">Top-K Context Chunks</span>
                <span className="text-accent-fg font-bold">{topK}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={topK}
                onChange={(e) => setTopK(parseInt(e.target.value))}
                className="w-full h-1.5 bg-overlay rounded-lg appearance-none cursor-pointer accent-[#3b82f6]"
              />
              <div className="flex justify-between text-xs font-mono text-fg-subtle">
                <span>1 (High Precision)</span>
                <span>10 (Broad Context)</span>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-line">
              <button
                onClick={() => setShowConfigModal(false)}
                className="bg-selected hover:bg-[#334155] text-fg px-5 py-2 rounded-lg text-sm font-mono font-semibold transition-all cursor-pointer border border-[#334155]"
              >
                Apply Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
