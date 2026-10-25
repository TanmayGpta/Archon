"use client";
import React from 'react';
import { Icons } from '../../components/Icons';
import { RagPipeline } from './RagPipeline';
import { AskContext } from './AskContext';
import { useAskState } from './useAskState';
import { AskDialogs } from './AskDialogs';
import { AskResults } from './AskResults';

/* -- Ask route: RAG over your API docs ---------------------- */
export function AskStudio() {
  const ask = useAskState();
  const {
    models,
    selectedModel,
    setSelectedModel,
    comparisonModel,
    setComparisonModel,
    compareMode,
    setCompareMode,
    setShowConfigModal,
    searchStrategy,
    query,
    setQuery,
    loading,
    pipelineStage,
    activeTab,
    setActiveTab,
    uploading,
    inputFocused,
    setInputFocused,
    fileInputRef,
    handleProcess,
    handleNavigateStage,
    handleUpload,
    tabs,
  } = ask;

  return (
    <AskContext.Provider value={ask}>
    <main className="min-h-[calc(100vh-56px)] p-6 md:p-10">
      
      <AskDialogs />

      <div className="max-w-[1200px] mx-auto">
        
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-[#1a1e26]">
            <div>
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse" />
                <span className="text-[10px] font-mono font-medium text-[#4a5060] tracking-[0.2em] uppercase">RAG Engine Live</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-1.5 shadow-sm">
                  <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
                </div>
                <h1 className="text-[28px] font-semibold text-[#e2e5ea] tracking-[-0.02em] leading-tight">
                  Ask
                </h1>
              </div>
              <p className="text-[13px] text-[#4a5060] mt-1.5 font-mono">
                {searchStrategy === 'hybrid'
                  ? 'Hybrid retrieval (BM25 + Dense + Cross-Encoder) & Code Synthesis'
                  : searchStrategy === 'dense'
                    ? 'ChromaDB Dense Vector Embedding Search & Code Synthesis'
                    : 'Okapi BM25 Lexical Keyword Search & Code Synthesis'}
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2.5 items-end">
              {/* Upload Button */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono font-medium text-[#4a5060] tracking-wider uppercase">Ingest Spec</label>
                <div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleUpload} 
                    className="hidden" 
                    id="file-upload"
                    accept=".json,.yaml,.yml,.md" 
                  />
                  <label 
                    htmlFor="file-upload" 
                    className="cursor-pointer flex items-center gap-2 bg-[#0e1015] border border-[#1a1e26] hover:border-[#282e3a] text-[#6b7280] hover:text-[#c8ccd0] px-3.5 py-2 rounded-lg text-[12.5px] font-mono transition-all duration-300"
                  >
                    {uploading ? (
                      <span className="flex items-center gap-2"><span className="animate-spin text-[#3b82f6]">⟳</span>Ingesting</span>
                    ) : (
                      <><span className="text-[#4a5060]">↑</span>Upload</>
                    )}
                  </label>
                </div>
              </div>

              {/* Active Model Selector A */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono font-medium text-[#4a5060] tracking-wider uppercase">Active Model</label>
                <select 
                  value={selectedModel} 
                  onChange={e => setSelectedModel(e.target.value)}
                  className="bg-[#0e1015] border border-[#1a1e26] hover:border-[#282e3a] text-[#c8ccd0] py-2 px-3.5 rounded-lg text-[12.5px] font-mono outline-none focus:border-[#3b82f6]/50 transition-all duration-300 cursor-pointer max-w-[190px] truncate"
                  title={selectedModel}
                >
                  {models.map(m => (
                    <option key={m} value={m} className="bg-[#0e1015]">{m}</option>
                  ))}
                </select>
              </div>

              {/* Model B Selector (When Comparison is Active) */}
              {compareMode && (
                <div className="flex flex-col gap-1.5 animate-fade-in">
                  <label className="text-[10px] font-mono font-medium text-[#a78bfa] tracking-wider uppercase">Compare Model</label>
                  <select 
                    value={comparisonModel} 
                    onChange={e => setComparisonModel(e.target.value)}
                    className="bg-[#0e1015] border border-[#a78bfa]/40 text-[#a78bfa] py-2 px-3.5 rounded-lg text-[12.5px] font-mono outline-none focus:border-[#a78bfa] transition-all duration-300 cursor-pointer max-w-[190px] truncate shadow-sm"
                    title={comparisonModel}
                  >
                    {models.map(m => (
                      <option key={m} value={m} className="bg-[#0e1015]">{m}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Side-by-Side Model Comparison Toggle Switch */}
              <button
                type="button"
                onClick={() => setCompareMode(!compareMode)}
                title="Toggle Side-by-Side Dual Model Comparison"
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-mono transition-all duration-200 cursor-pointer border ${
                  compareMode
                    ? 'bg-[#3b82f6]/20 text-[#60a5fa] border-[#3b82f6]/50 shadow-md font-bold'
                    : 'bg-[#0e1015] border-[#1a1e26] hover:border-[#282e3a] text-[#6b7280] hover:text-[#c8ccd0]'
                }`}
              >
                <Icons.Compare />
                <span>Compare: {compareMode ? 'ON' : 'OFF'}</span>
              </button>

              {/* Configure Option Button */}
              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                title="Configure Chunking & Retrieval Strategy"
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-mono bg-[#0e1015] border border-[#1a1e26] hover:border-[#282e3a] text-[#6b7280] hover:text-[#c8ccd0] transition-all duration-200 cursor-pointer"
              >
                <Icons.Settings />
                <span>Configure</span>
              </button>
            </div>
          </div>
        </header>

        {/* Global Interactive Pipeline Visualizer */}
        <RagPipeline 
          currentStage={pipelineStage} 
          onNavigateStage={handleNavigateStage} 
        />

        {/* Command Input Bar */}
        <div className={`mb-6 transition-all duration-500 ${inputFocused ? 'scale-[1.003]' : ''}`}>
          <div className={`bg-[#0e1015] border rounded-xl p-1.5 pl-5 flex items-center transition-all duration-500 ${inputFocused ? 'border-[#3b82f6]/50 shadow-[0_0_30px_rgba(59,130,246,0.08)]' : 'border-[#1a1e26]'}`}>
            <span className="text-[#3b82f6] mr-3 font-mono text-sm select-none">▸</span>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={e => e.key === 'Enter' && handleProcess()}
              placeholder="Ask any API question… e.g. How do I create a customer charge in Stripe?"
              className="bg-transparent border-none outline-none text-[#e2e5ea] placeholder-[#4a5060] flex-1 text-sm font-mono leading-relaxed"
            />
            <button
              onClick={handleProcess}
              disabled={loading || !query.trim()}
              className={`px-5 py-2.5 rounded-lg text-xs font-mono font-medium transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                loading || !query.trim() 
                  ? 'bg-transparent text-[#282e3a] cursor-not-allowed' 
                  : 'bg-[#1a1e26] text-[#c8ccd0] hover:bg-[#282e3a] hover:text-white border border-[#282e3a]/50 shadow-sm'
              }`}
            >
              {loading ? (
                <><span className="animate-spin text-[#3b82f6]">⟳</span>Processing</>
              ) : (
                <>Execute<span className="text-[10px] text-[#4a5060]">↵</span></>
              )}
            </button>
          </div>

          {/* Sample Queries */}
          <div className="flex gap-2 mt-2.5 overflow-x-auto pb-1 text-[11px] font-mono text-[#4a5060] custom-scrollbar">
            <span className="text-[#333a48] select-none py-0.5">Try:</span>
            {[
              "How to charge a card in Stripe?",
              "Twilio send SMS endpoint & parameters",
              "SendGrid v3 mail send cURL",
              "Slack chat.postMessage payload"
            ].map((sample, i) => (
              <button
                key={i}
                onClick={() => setQuery(sample)}
                className="hover:text-[#8b92a0] transition-colors duration-300 whitespace-nowrap bg-[#0a0c10] hover:bg-[#0e1015] px-2.5 py-0.5 rounded border border-[#14171e] hover:border-[#1a1e26] cursor-pointer"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>

        {/* Strategy Tabs & Display Panel */}
        <div className="bg-[#0e1015] border border-[#1a1e26] rounded-xl overflow-hidden shadow-2xl">
          
          {/* Tab Bar */}
          <div className="flex border-b border-[#1a1e26] bg-[#0a0c10]">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-3.5 text-xs font-mono transition-all duration-300 relative cursor-pointer ${
                  activeTab === tab.id
                    ? 'text-[#e2e5ea] bg-[#0e1015] font-medium'
                    : 'text-[#4a5060] hover:text-[#8b92a0] hover:bg-[#0c0e12]'
                }`}
              >
                <span className={`text-[10px] ${activeTab === tab.id ? 'text-[#3b82f6]' : 'text-[#282e3a]'}`}>
                  {tab.icon}
                </span>
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                )}
              </button>
            ))}
          </div>

          <AskResults />

        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-between items-center text-[10px] font-mono text-[#282e3a]">
          <span>v1.0.0-archon</span>
          <span>Archon Copilot · Multi-Strategy Diagnostic Portal</span>
        </div>
      </div>
    </main>
    </AskContext.Provider>
  );
}
