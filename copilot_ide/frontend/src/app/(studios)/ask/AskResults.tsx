"use client";
import React from 'react';
import { FormattedMarkdown } from '../../components/markdown/FormattedMarkdown';
import { useAsk } from './AskContext';
import type { RetrievalHit } from './useAskState';

/* -- Result tabs: code synthesis, search diagnostics, knowledge base - */
export function AskResults() {
  const {
    selectedModel,
    comparisonModel,
    compareMode,
    dbData,
    topK,
    generationA,
    generationB,
    loading,
    metricsA,
    metricsB,
    activeTab,
    searchData,
    highlightStrategy,
    outputRefA,
    outputRefB,
  } = useAsk();

  return (
    <>
      {/* Tab 1: Code Synthesis Output / Side-by-Side Comparison */}
      {activeTab === 'terminal' && (
        <div className="p-6">
          {compareMode ? (
            /* ── Side-by-Side Dual Model Comparison Panels ── */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Left Column: Model A */}
              <div className="bg-canvas border border-line rounded-panel overflow-hidden flex flex-col">
                <div className="flex justify-between items-center px-4 py-2.5 border-b border-line bg-surface/80">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-accent-fg">{selectedModel}</span>
                    <span className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.2 rounded-control border border-accent/20">Model A</span>
                  </div>
                  {metricsA && (
                    <div className="text-xs font-mono text-fg-subtle flex items-center gap-2">
                      <span>{metricsA.tokens} tokens</span>
                      <span>·</span>
                      <span>{metricsA.latencyMs}ms</span>
                    </div>
                  )}
                </div>
                <div ref={outputRefA} className="p-5 overflow-y-auto custom-scrollbar" style={{ minHeight: generationA || loading ? '240px' : '180px', maxHeight: '550px' }}>
                  {generationA ? (
                    <FormattedMarkdown content={generationA} />
                  ) : loading ? (
                    <div className="flex flex-col items-center justify-center h-[180px] text-fg-subtle font-mono text-xs space-y-3">
                      <div className="w-5 h-5 border-2 border-line border-t-accent rounded-full animate-spin" />
                      <span>Generating with {selectedModel}…</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[140px] text-fg-subtle font-mono text-xs">
                      Enter a query above to execute comparison synthesis.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Model B */}
              <div className="bg-canvas border border-line rounded-panel overflow-hidden flex flex-col">
                <div className="flex justify-between items-center px-4 py-2.5 border-b border-line bg-surface/80">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-ai">{comparisonModel}</span>
                    <span className="text-xs font-mono text-ai bg-ai/10 px-1.5 py-0.2 rounded-control border border-ai/20">Model B</span>
                  </div>
                  {metricsB && (
                    <div className="text-xs font-mono text-fg-subtle flex items-center gap-2">
                      <span>{metricsB.tokens} tokens</span>
                      <span>·</span>
                      <span>{metricsB.latencyMs}ms</span>
                    </div>
                  )}
                </div>
                <div ref={outputRefB} className="p-5 overflow-y-auto custom-scrollbar" style={{ minHeight: generationB || loading ? '240px' : '180px', maxHeight: '550px' }}>
                  {generationB ? (
                    <FormattedMarkdown content={generationB} />
                  ) : loading ? (
                    <div className="flex flex-col items-center justify-center h-[180px] text-fg-subtle font-mono text-xs space-y-3">
                      <div className="w-5 h-5 border-2 border-line border-t-ai rounded-full animate-spin" />
                      <span>Generating with {comparisonModel}…</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[140px] text-fg-subtle font-mono text-xs">
                      Enter a query above to execute comparison synthesis.
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            /* ── Single Model Synthesis View ── */
            <div className="bg-canvas border border-line rounded-panel overflow-hidden">
              <div className="flex justify-between items-center px-4 py-2.5 border-b border-line bg-surface/60">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-overlay" />
                  <div className="w-2.5 h-2.5 rounded-full bg-overlay" />
                  <div className="w-2.5 h-2.5 rounded-full bg-overlay" />
                  <span className="text-xs font-mono text-fg-subtle ml-2">archon-copilot ~ output</span>
                </div>
                <div className="flex items-center gap-3">
                  {loading && (
                    <div className="flex items-center gap-1.5 text-xs font-mono text-accent">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      Streaming…
                    </div>
                  )}
                  {metricsA && (
                    <span className="text-xs font-mono text-fg-subtle">
                      {metricsA.tokens} tokens · {metricsA.latencyMs}ms
                    </span>
                  )}
                  <span className="text-xs font-mono text-fg-subtle">{selectedModel}</span>
                </div>
              </div>
              <div ref={outputRefA} className="p-6 min-h-[350px] max-h-[550px] overflow-y-auto custom-scrollbar">
                {generationA ? (
                  <FormattedMarkdown content={generationA} />
                ) : loading ? (
                  <div className="flex flex-col items-center justify-center h-[300px] text-fg-subtle font-mono text-xs space-y-3">
                    <div className="w-6 h-6 border-2 border-line border-t-accent rounded-full animate-spin" />
                    <span>Generating endpoint synthesis…</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[300px] text-fg-subtle font-mono text-xs space-y-2">
                    <span>$ Enter a query above to execute hybrid search & synthesis.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 3-Column Search Diagnostics */}
      {activeTab === 'search' && (
        <div className="p-6">
          {!searchData ? (
            <div className="text-center py-20 text-fg-subtle font-mono text-xs">
              Run a query to inspect live ranking diagnostics across BM25, Dense Vectors, and Cross-Encoder.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              
              {/* BM25 Column */}
              <div className={`bg-canvas rounded-panel flex flex-col transition-all duration-500 border ${
                highlightStrategy === 'bm25'
                  ? 'border-accent shadow-[0_0_30px_rgba(59,130,246,0.2)] ring-1 ring-accent/50'
                  : 'border-line hover:border-line-strong'
              }`}>
                <div className="border-b border-line px-4 py-3.5 flex justify-between items-center bg-surface">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-accent font-bold">01</span>
                      <h3 className="text-sm font-mono font-semibold text-fg-soft tracking-wide">Okapi BM25</h3>
                    </div>
                    <p className="text-xs text-fg-subtle mt-0.5 font-mono">Lexical keyword matching</p>
                  </div>
                  <span className="text-xs font-mono font-medium tracking-[0.15em] text-fg-subtle bg-raised px-2 py-0.5 rounded-control border border-line">TOP {topK}</span>
                </div>
                <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                  {Array.isArray(searchData.bm25) ? searchData.bm25.map((item: RetrievalHit, i: number) => (
                    <div key={i} className="bg-surface border border-line rounded-control p-3.5 hover:border-line-strong transition-colors duration-300">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono font-bold text-fg-subtle bg-canvas px-1.5 py-0.5 rounded-control">#{item.rank}</span>
                        <span className="text-xs font-mono font-medium text-info">{item.score}</span>
                      </div>
                      <pre className="text-sm text-fg-subtle font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                    </div>
                  )) : <div className="text-fg-subtle text-xs font-mono p-3">{typeof searchData.bm25 === 'string' ? searchData.bm25 : 'No results'}</div>}
                </div>
              </div>

              {/* Dense Vector Column */}
              <div className={`bg-canvas rounded-panel flex flex-col transition-all duration-500 border ${
                highlightStrategy === 'dense'
                  ? 'border-ai shadow-[0_0_30px_rgba(167,139,250,0.2)] ring-1 ring-ai/50'
                  : 'border-line hover:border-line-strong'
              }`}>
                <div className="border-b border-line px-4 py-3.5 flex justify-between items-center bg-surface">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-ai font-bold">02</span>
                      <h3 className="text-sm font-mono font-semibold text-fg-soft tracking-wide">Dense Vectors</h3>
                    </div>
                    <p className="text-xs text-fg-subtle mt-0.5 font-mono">BGE-small (ChromaDB)</p>
                  </div>
                  <span className="text-xs font-mono font-medium tracking-[0.15em] text-fg-subtle bg-raised px-2 py-0.5 rounded-control border border-line">TOP {topK}</span>
                </div>
                <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                  {Array.isArray(searchData.dense) ? searchData.dense.map((item: RetrievalHit, i: number) => (
                    <div key={i} className="bg-surface border border-line rounded-control p-3.5 hover:border-line-strong transition-colors duration-300">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono font-bold text-fg-subtle bg-canvas px-1.5 py-0.5 rounded-control">#{item.rank}</span>
                        <span className="text-xs font-mono font-medium text-purple-400/80">{item.score}</span>
                      </div>
                      <pre className="text-sm text-fg-subtle font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                    </div>
                  )) : <div className="text-fg-subtle text-xs font-mono p-3">{typeof searchData.dense === 'string' ? searchData.dense : 'No results'}</div>}
                </div>
              </div>

              {/* Cross-Encoder Column */}
              <div className={`bg-canvas rounded-panel flex flex-col relative overflow-hidden transition-all duration-500 border ${
                highlightStrategy === 'cross_encoder'
                  ? 'border-success shadow-[0_0_30px_rgba(16,185,129,0.2)] ring-1 ring-success/50'
                  : 'border-success/20 hover:border-success/35'
              }`}>
                <div className="border-b border-success/15 px-4 py-3.5 flex justify-between items-center bg-success/5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-success font-bold">03</span>
                      <h3 className="text-sm font-mono font-semibold text-success tracking-wide">Cross-Encoder</h3>
                    </div>
                    <p className="text-xs text-success/60 mt-0.5 font-mono">MS-Marco Deep Re-Ranking</p>
                  </div>
                  <span className="text-xs font-mono font-medium tracking-[0.15em] text-success/60 bg-success/10 px-2 py-0.5 rounded-control border border-success/20">TOP {topK}</span>
                </div>
                <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                  {Array.isArray(searchData.cross_encoder) ? searchData.cross_encoder.map((item: RetrievalHit, i: number) => (
                    <div key={i} className={`bg-surface border rounded-control p-3.5 transition-all duration-300 ${i === 0 ? 'border-success/30 shadow-[0_0_12px_rgba(16,185,129,0.06)]' : 'border-line hover:border-line-strong'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded-control ${i === 0 ? 'text-success bg-success/10 border border-success/20' : 'text-fg-subtle bg-canvas'}`}>#{item.rank}</span>
                        <span className={`text-xs font-mono font-medium ${i === 0 ? 'text-success' : 'text-success/50'}`}>{item.score}</span>
                      </div>
                      <pre className="text-sm text-fg-muted font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                    </div>
                  )) : <div className="text-fg-subtle text-xs font-mono p-3">{typeof searchData.cross_encoder === 'string' ? searchData.cross_encoder : 'No results'}</div>}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Tab 3: Knowledge Base Viewer */}
      {activeTab === 'db' && (
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-4 bg-selected rounded-full" />
                  <h3 className="text-base font-mono font-medium text-fg-subtle tracking-wide">Legacy Fixed Chunks</h3>
                </div>
                <span className="text-xs font-mono font-medium tracking-[0.15em] text-fg-subtle bg-raised px-2.5 py-1 rounded-control uppercase border border-line">Static</span>
              </div>
              <div className="bg-canvas border border-line rounded-panel p-4 h-[420px] overflow-y-auto space-y-2.5 custom-scrollbar">
                {dbData?.fixed_chunks?.map((chunk: string, i: number) => (
                  <div key={i} className="p-3.5 bg-surface rounded-control border border-line font-mono text-sm text-fg-subtle leading-[1.7] hover:border-line-strong transition-colors duration-300 cursor-default">
                    {chunk}
                  </div>
                )) || (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-fg-subtle font-mono text-xs">Awaiting data snapshot…</span>
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-4 bg-accent/50 rounded-full" />
                  <h3 className="text-base font-mono font-medium text-fg-subtle tracking-wide">Semantic Vector Chunks</h3>
                </div>
                <span className="text-xs font-mono font-medium tracking-[0.15em] text-accent/70 bg-accent/10 px-2.5 py-1 rounded-control uppercase border border-accent/20">Smart Chunks</span>
              </div>
              <div className="bg-canvas border border-line rounded-panel p-4 h-[420px] overflow-y-auto space-y-2.5 custom-scrollbar">
                {dbData?.semantic_chunks?.map((chunk: string, i: number) => (
                  <div key={i} className="p-3.5 bg-surface rounded-control border border-line font-mono text-sm text-fg-muted leading-[1.7] hover:border-accent/20 transition-colors duration-300 whitespace-pre-wrap cursor-default">
                    {chunk}
                  </div>
                )) || (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-fg-subtle font-mono text-xs">Awaiting data snapshot…</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
