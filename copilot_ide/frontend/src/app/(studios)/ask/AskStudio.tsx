"use client";
import React from 'react';
import { Icons } from '../../components/Icons';
import { RagPipeline } from './RagPipeline';
import { AskContext } from './AskContext';
import { useAskState } from './useAskState';
import { AskDialogs } from './AskDialogs';
import { AskResults } from './AskResults';
import { useCommand } from '../../components/commandsContext';

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

  useCommand('ask.upload', { run: () => fileInputRef.current?.click() });
  useCommand('ask.settings', { run: () => setShowConfigModal(true) });

  return (
    <AskContext.Provider value={ask}>
    <main className="min-h-[calc(100vh-56px)] p-6 md:p-10">
      
      <AskDialogs />

      <div className="max-w-[1200px] mx-auto">
        
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-line">
            <div>
              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-xs font-mono font-medium text-fg-subtle tracking-[0.2em] uppercase">RAG Engine Live</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-raised border border-line flex items-center justify-center p-1.5 shadow-sm">
                  <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
                </div>
                <h1 className="text-xl font-semibold text-fg tracking-[-0.02em] leading-tight">
                  Ask
                </h1>
              </div>
              <p className="text-base text-fg-subtle mt-1.5 font-mono">
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
                <label className="text-xs font-mono font-medium text-fg-subtle tracking-wider uppercase">Ingest Spec</label>
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
                    className="cursor-pointer flex items-center gap-2 bg-surface border border-line hover:border-line-strong text-fg-subtle hover:text-fg-soft px-3.5 py-2 rounded-lg text-base font-mono transition-all duration-300"
                  >
                    {uploading ? (
                      <span className="flex items-center gap-2"><span className="animate-spin text-accent">⟳</span>Ingesting</span>
                    ) : (
                      <><span className="text-fg-subtle">↑</span>Upload</>
                    )}
                  </label>
                </div>
              </div>

              {/* Active Model Selector A */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono font-medium text-fg-subtle tracking-wider uppercase">Active Model</label>
                <select 
                  value={selectedModel} 
                  onChange={e => setSelectedModel(e.target.value)}
                  className="bg-surface border border-line hover:border-line-strong text-fg-soft py-2 px-3.5 rounded-lg text-base font-mono outline-none focus:border-accent/50 transition-all duration-300 cursor-pointer max-w-[190px] truncate"
                  title={selectedModel}
                >
                  {models.map(m => (
                    <option key={m} value={m} className="bg-surface">{m}</option>
                  ))}
                </select>
              </div>

              {/* Model B Selector (When Comparison is Active) */}
              {compareMode && (
                <div className="flex flex-col gap-1.5 animate-fade-in">
                  <label className="text-xs font-mono font-medium text-ai tracking-wider uppercase">Compare Model</label>
                  <select 
                    value={comparisonModel} 
                    onChange={e => setComparisonModel(e.target.value)}
                    className="bg-surface border border-ai/40 text-ai py-2 px-3.5 rounded-lg text-base font-mono outline-none focus:border-ai transition-all duration-300 cursor-pointer max-w-[190px] truncate shadow-sm"
                    title={comparisonModel}
                  >
                    {models.map(m => (
                      <option key={m} value={m} className="bg-surface">{m}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Side-by-Side Model Comparison Toggle Switch */}
              <button
                type="button"
                onClick={() => setCompareMode(!compareMode)}
                title="Toggle Side-by-Side Dual Model Comparison"
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-mono transition-all duration-200 cursor-pointer border ${
                  compareMode
                    ? 'bg-accent/20 text-accent-fg border-accent/50 shadow-md font-bold'
                    : 'bg-surface border-line hover:border-line-strong text-fg-subtle hover:text-fg-soft'
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
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-mono bg-surface border border-line hover:border-line-strong text-fg-subtle hover:text-fg-soft transition-all duration-200 cursor-pointer"
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
          <div className={`bg-surface border rounded-xl p-1.5 pl-5 flex items-center transition-all duration-500 ${inputFocused ? 'border-accent/50 shadow-[0_0_30px_rgba(59,130,246,0.08)]' : 'border-line'}`}>
            <span className="text-accent mr-3 font-mono text-sm select-none">▸</span>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={e => e.key === 'Enter' && handleProcess()}
              placeholder="Ask any API question… e.g. How do I create a customer charge in Stripe?"
              className="bg-transparent border-none outline-none text-fg placeholder-fg-subtle flex-1 text-sm font-mono leading-relaxed"
            />
            <button
              onClick={handleProcess}
              disabled={loading || !query.trim()}
              className={`px-5 py-2.5 rounded-lg text-xs font-mono font-medium transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                loading || !query.trim() 
                  ? 'bg-transparent text-fg-subtle cursor-not-allowed' 
                  : 'bg-overlay text-fg-soft hover:bg-selected hover:text-white border border-line-strong/50 shadow-sm'
              }`}
            >
              {loading ? (
                <><span className="animate-spin text-accent">⟳</span>Processing</>
              ) : (
                <>Execute<span className="text-xs text-fg-subtle">↵</span></>
              )}
            </button>
          </div>

          {/* Sample Queries */}
          <div className="flex gap-2 mt-2.5 overflow-x-auto pb-1 text-xs font-mono text-fg-subtle custom-scrollbar">
            <span className="text-fg-subtle select-none py-0.5">Try:</span>
            {[
              "How to charge a card in Stripe?",
              "Twilio send SMS endpoint & parameters",
              "SendGrid v3 mail send cURL",
              "Slack chat.postMessage payload"
            ].map((sample, i) => (
              <button
                key={i}
                onClick={() => setQuery(sample)}
                className="hover:text-fg-muted transition-colors duration-300 whitespace-nowrap bg-surface hover:bg-surface px-2.5 py-0.5 rounded border border-line-subtle hover:border-line cursor-pointer"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>

        {/* Strategy Tabs & Display Panel */}
        <div className="bg-surface border border-line rounded-xl overflow-hidden shadow-2xl">
          
          {/* Tab Bar */}
          <div className="flex border-b border-line bg-surface">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-3.5 text-xs font-mono transition-all duration-300 relative cursor-pointer ${
                  activeTab === tab.id
                    ? 'text-fg bg-surface font-medium'
                    : 'text-fg-subtle hover:text-fg-muted hover:bg-surface'
                }`}
              >
                <span className={`text-xs ${activeTab === tab.id ? 'text-accent' : 'text-fg-subtle'}`}>
                  {tab.icon}
                </span>
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                )}
              </button>
            ))}
          </div>

          <AskResults />

        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-between items-center text-xs font-mono text-fg-subtle">
          <span>v1.0.0-archon</span>
          <span>Archon Copilot · Multi-Strategy Diagnostic Portal</span>
        </div>
      </div>
    </main>
    </AskContext.Provider>
  );
}
