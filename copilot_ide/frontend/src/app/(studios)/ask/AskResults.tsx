"use client";
import React from 'react';
import { FormattedMarkdown } from '../../components/markdown/FormattedMarkdown';
import { useAsk } from './AskContext';

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
              <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg overflow-hidden flex flex-col">
                <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#1a1e26] bg-[#0a0c10]/80">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-[#60a5fa]">{selectedModel}</span>
                    <span className="text-[9.5px] font-mono text-[#3b82f6] bg-[#3b82f6]/10 px-1.5 py-0.2 rounded border border-[#3b82f6]/20">Model A</span>
                  </div>
                  {metricsA && (
                    <div className="text-[10px] font-mono text-[#4a5060] flex items-center gap-2">
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
                    <div className="flex flex-col items-center justify-center h-[180px] text-[#4a5060] font-mono text-xs space-y-3">
                      <div className="w-5 h-5 border-2 border-[#1a1e26] border-t-[#3b82f6] rounded-full animate-spin" />
                      <span>Generating with {selectedModel}…</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[140px] text-[#333a48] font-mono text-xs">
                      Enter a query above to execute comparison synthesis.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Model B */}
              <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg overflow-hidden flex flex-col">
                <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#1a1e26] bg-[#0a0c10]/80">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-[#a78bfa]">{comparisonModel}</span>
                    <span className="text-[9.5px] font-mono text-[#a78bfa] bg-[#a78bfa]/10 px-1.5 py-0.2 rounded border border-[#a78bfa]/20">Model B</span>
                  </div>
                  {metricsB && (
                    <div className="text-[10px] font-mono text-[#4a5060] flex items-center gap-2">
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
                    <div className="flex flex-col items-center justify-center h-[180px] text-[#4a5060] font-mono text-xs space-y-3">
                      <div className="w-5 h-5 border-2 border-[#1a1e26] border-t-[#a78bfa] rounded-full animate-spin" />
                      <span>Generating with {comparisonModel}…</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[140px] text-[#333a48] font-mono text-xs">
                      Enter a query above to execute comparison synthesis.
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            /* ── Single Model Synthesis View ── */
            <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg overflow-hidden">
              <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#1a1e26] bg-[#0a0c10]/60">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#1a1e26]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#1a1e26]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#1a1e26]" />
                  <span className="text-[11px] font-mono text-[#333a48] ml-2">archon-copilot ~ output</span>
                </div>
                <div className="flex items-center gap-3">
                  {loading && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#3b82f6]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
                      Streaming…
                    </div>
                  )}
                  {metricsA && (
                    <span className="text-[10px] font-mono text-[#4a5060]">
                      {metricsA.tokens} tokens · {metricsA.latencyMs}ms
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-[#282e3a]">{selectedModel}</span>
                </div>
              </div>
              <div ref={outputRefA} className="p-6 min-h-[350px] max-h-[550px] overflow-y-auto custom-scrollbar">
                {generationA ? (
                  <FormattedMarkdown content={generationA} />
                ) : loading ? (
                  <div className="flex flex-col items-center justify-center h-[300px] text-[#333a48] font-mono text-xs space-y-3">
                    <div className="w-6 h-6 border-2 border-[#1a1e26] border-t-[#3b82f6] rounded-full animate-spin" />
                    <span>Generating endpoint synthesis…</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[300px] text-[#282e3a] font-mono text-xs space-y-2">
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
            <div className="text-center py-20 text-[#282e3a] font-mono text-xs">
              Run a query to inspect live ranking diagnostics across BM25, Dense Vectors, and Cross-Encoder.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              
              {/* BM25 Column */}
              <div className={`bg-[#08090a] rounded-lg flex flex-col transition-all duration-500 border ${
                highlightStrategy === 'bm25'
                  ? 'border-[#3b82f6] shadow-[0_0_30px_rgba(59,130,246,0.2)] ring-1 ring-[#3b82f6]/50'
                  : 'border-[#1a1e26] hover:border-[#282e3a]'
              }`}>
                <div className="border-b border-[#1a1e26] px-4 py-3.5 flex justify-between items-center bg-[#0a0c10]">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-[#3b82f6] font-bold">01</span>
                      <h3 className="text-[12px] font-mono font-semibold text-[#c8ccd0] tracking-wide">Okapi BM25</h3>
                    </div>
                    <p className="text-[10px] text-[#4a5060] mt-0.5 font-mono">Lexical keyword matching</p>
                  </div>
                  <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#4a5060] bg-[#12151c] px-2 py-0.5 rounded border border-[#1a1e26]">TOP {topK}</span>
                </div>
                <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                  {Array.isArray(searchData.bm25) ? searchData.bm25.map((item: any, i: number) => (
                    <div key={i} className="bg-[#0e1015] border border-[#1a1e26] rounded-md p-3.5 hover:border-[#282e3a] transition-colors duration-300">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[9px] font-mono font-bold text-[#6b7280] bg-[#08090a] px-1.5 py-0.5 rounded">#{item.rank}</span>
                        <span className="text-[10px] font-mono font-medium text-[#38bdf8]">{item.score}</span>
                      </div>
                      <pre className="text-[11.5px] text-[#6b7280] font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                    </div>
                  )) : <div className="text-[#4a5060] text-xs font-mono p-3">{typeof searchData.bm25 === 'string' ? searchData.bm25 : 'No results'}</div>}
                </div>
              </div>

              {/* Dense Vector Column */}
              <div className={`bg-[#08090a] rounded-lg flex flex-col transition-all duration-500 border ${
                highlightStrategy === 'dense'
                  ? 'border-[#a78bfa] shadow-[0_0_30px_rgba(167,139,250,0.2)] ring-1 ring-[#a78bfa]/50'
                  : 'border-[#1a1e26] hover:border-[#282e3a]'
              }`}>
                <div className="border-b border-[#1a1e26] px-4 py-3.5 flex justify-between items-center bg-[#0a0c10]">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-[#a78bfa] font-bold">02</span>
                      <h3 className="text-[12px] font-mono font-semibold text-[#c8ccd0] tracking-wide">Dense Vectors</h3>
                    </div>
                    <p className="text-[10px] text-[#4a5060] mt-0.5 font-mono">BGE-small (ChromaDB)</p>
                  </div>
                  <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#4a5060] bg-[#12151c] px-2 py-0.5 rounded border border-[#1a1e26]">TOP {topK}</span>
                </div>
                <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                  {Array.isArray(searchData.dense) ? searchData.dense.map((item: any, i: number) => (
                    <div key={i} className="bg-[#0e1015] border border-[#1a1e26] rounded-md p-3.5 hover:border-[#282e3a] transition-colors duration-300">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[9px] font-mono font-bold text-[#6b7280] bg-[#08090a] px-1.5 py-0.5 rounded">#{item.rank}</span>
                        <span className="text-[10px] font-mono font-medium text-purple-400/80">{item.score}</span>
                      </div>
                      <pre className="text-[11.5px] text-[#6b7280] font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                    </div>
                  )) : <div className="text-[#4a5060] text-xs font-mono p-3">{typeof searchData.dense === 'string' ? searchData.dense : 'No results'}</div>}
                </div>
              </div>

              {/* Cross-Encoder Column */}
              <div className={`bg-[#08090a] rounded-lg flex flex-col relative overflow-hidden transition-all duration-500 border ${
                highlightStrategy === 'cross_encoder'
                  ? 'border-[#10b981] shadow-[0_0_30px_rgba(16,185,129,0.2)] ring-1 ring-[#10b981]/50'
                  : 'border-[#10b981]/20 hover:border-[#10b981]/35'
              }`}>
                <div className="border-b border-[#10b981]/15 px-4 py-3.5 flex justify-between items-center bg-[#10b981]/5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-[#10b981] font-bold">03</span>
                      <h3 className="text-[12px] font-mono font-semibold text-[#10b981] tracking-wide">Cross-Encoder</h3>
                    </div>
                    <p className="text-[10px] text-[#10b981]/60 mt-0.5 font-mono">MS-Marco Deep Re-Ranking</p>
                  </div>
                  <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#10b981]/60 bg-[#10b981]/10 px-2 py-0.5 rounded border border-[#10b981]/20">TOP {topK}</span>
                </div>
                <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                  {Array.isArray(searchData.cross_encoder) ? searchData.cross_encoder.map((item: any, i: number) => (
                    <div key={i} className={`bg-[#0e1015] border rounded-md p-3.5 transition-all duration-300 ${i === 0 ? 'border-[#10b981]/30 shadow-[0_0_12px_rgba(16,185,129,0.06)]' : 'border-[#1a1e26] hover:border-[#282e3a]'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${i === 0 ? 'text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/20' : 'text-[#6b7280] bg-[#08090a]'}`}>#{item.rank}</span>
                        <span className={`text-[10px] font-mono font-medium ${i === 0 ? 'text-[#10b981]' : 'text-[#10b981]/50'}`}>{item.score}</span>
                      </div>
                      <pre className="text-[11.5px] text-[#8b92a0] font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                    </div>
                  )) : <div className="text-[#4a5060] text-xs font-mono p-3">{typeof searchData.cross_encoder === 'string' ? searchData.cross_encoder : 'No results'}</div>}
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
                  <div className="w-1 h-4 bg-[#282e3a] rounded-full" />
                  <h3 className="text-[13px] font-mono font-medium text-[#6b7280] tracking-wide">Legacy Fixed Chunks</h3>
                </div>
                <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#4a5060] bg-[#13161c] px-2.5 py-1 rounded uppercase border border-[#1a1e26]">Static</span>
              </div>
              <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg p-4 h-[420px] overflow-y-auto space-y-2.5 custom-scrollbar">
                {dbData?.fixed_chunks?.map((chunk: string, i: number) => (
                  <div key={i} className="p-3.5 bg-[#0e1015] rounded-md border border-[#1a1e26] font-mono text-[12px] text-[#6b7280] leading-[1.7] hover:border-[#282e3a] transition-colors duration-300 cursor-default">
                    {chunk}
                  </div>
                )) || (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-[#282e3a] font-mono text-xs">Awaiting data snapshot…</span>
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-4 bg-[#3b82f6]/50 rounded-full" />
                  <h3 className="text-[13px] font-mono font-medium text-[#6b7280] tracking-wide">Semantic Vector Chunks</h3>
                </div>
                <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#3b82f6]/70 bg-[#3b82f6]/10 px-2.5 py-1 rounded uppercase border border-[#3b82f6]/20">Smart Chunks</span>
              </div>
              <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg p-4 h-[420px] overflow-y-auto space-y-2.5 custom-scrollbar">
                {dbData?.semantic_chunks?.map((chunk: string, i: number) => (
                  <div key={i} className="p-3.5 bg-[#0e1015] rounded-md border border-[#1a1e26] font-mono text-[12px] text-[#8b92a0] leading-[1.7] hover:border-[#3b82f6]/20 transition-colors duration-300 whitespace-pre-wrap cursor-default">
                    {chunk}
                  </div>
                )) || (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-[#282e3a] font-mono text-xs">Awaiting data snapshot…</span>
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
