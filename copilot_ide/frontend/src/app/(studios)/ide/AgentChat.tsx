"use client";
import React from 'react';
import { Icons } from '../../components/Icons';
import { FormattedMarkdown } from '../../components/markdown/FormattedMarkdown';
import { detectTargetFilename } from '../../components/markdown/CodeBlock';
import ContextFileChips from '../../components/ContextFileChips';
import { useIde } from './IdeContext';

/* -- Agent chat panel - */
export function AgentChat() {
  const {
    activeTab,
    agentInput,
    agentLoading,
    agentMessages,
    apiBase,
    autoApplyEdits,
    chatScrollRef,
    contextFiles,
    fetchApiKeyStatus,
    handleAddContextFile,
    handleApplyCodeToEditor,
    handleApplyDiff,
    handleCreateAndOpenFile,
    handleRemoveContextFile,
    handleSendAgentMessage,
    includeFileContext,
    isDraggingOverChat,
    knowledgeGraphData,
    models,
    selectedModel,
    setActiveFlowSequence,
    setActiveFlowSteps,
    setAgentInput,
    setAgentMessages,
    setAutoApplyEdits,
    setIncludeFileContext,
    setIsDraggingOverChat,
    setKnowledgeGraphData,
    setSelectedModel,
    setShowApiKeysModal,
    setShowKnowledgeGraph,
    setSuggestedFiles,
    suggestedFiles,
  } = useIde();

  return (
    <>
      {/* ── 4. Archon Agent Chat Panel (Right, 380px) ───────────── */}
      <div className="w-[380px] bg-[#0c0e12] border-l border-[#161922] flex flex-col flex-shrink-0 overflow-hidden select-none">
        
        <div className="px-3 py-2 border-b border-[#161922] bg-[#090b0e] flex justify-between items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div className="w-5 h-5 rounded bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-0.5 shadow-sm flex-shrink-0">
              <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
            </div>
            <span className="text-[12px] font-mono font-bold text-[#e2e5ea] tracking-tight whitespace-nowrap flex-shrink-0">
              Archon Agent
            </span>
            <span 
              className="text-[10px] font-mono text-[#60a5fa] px-1.5 py-0.2 bg-[#3b82f6]/10 rounded border border-[#3b82f6]/20 truncate max-w-[110px] inline-block"
              title={selectedModel}
            >
              {selectedModel}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setAutoApplyEdits(!autoApplyEdits)}
              title="Toggle automatic application of AI code edits directly to active file"
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all flex items-center gap-1 cursor-pointer border whitespace-nowrap ${
                autoApplyEdits
                  ? 'bg-[#3b82f6]/20 text-[#60a5fa] border-[#3b82f6]/40 font-bold'
                  : 'bg-[#12151c] text-[#64748b] border-[#1e232e] hover:text-[#94a3b8]'
              }`}
            >
              <Icons.Sparkles />
              <span>Auto-Apply: {autoApplyEdits ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={() => setAgentMessages([{ id: 'cleared', role: 'assistant', content: "Chat history cleared. How can I help you?" }])}
              title="Clear Chat History"
              className="text-[#64748b] hover:text-[#cbd5e1] text-[11px] font-mono p-1 rounded hover:bg-[#161922] cursor-pointer flex-shrink-0"
            >
              <Icons.Trash />
            </button>
          </div>
        </div>

        <div className="px-3 py-1.5 bg-[#08090a] border-b border-[#161922]/60 flex items-center justify-between text-[11px] font-mono">
          <label className="flex items-center gap-1.5 cursor-pointer text-[#8b949e]">
            <input
              type="checkbox"
              checked={includeFileContext}
              onChange={(e) => setIncludeFileContext(e.target.checked)}
              className="rounded border-[#1e232e] bg-[#12151c] text-[#3b82f6] focus:ring-0 cursor-pointer"
            />
            <span>Include active file in context</span>
          </label>
          {activeTab && includeFileContext && (
            <span className="text-[#60a5fa] truncate max-w-[130px] font-medium flex items-center gap-1" title={activeTab.path}>
              <Icons.FileCode />
              <span className="truncate">{activeTab.name}</span>
            </span>
          )}
        </div>

        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar select-text">
          {agentMessages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-lg border text-[12px] font-mono leading-relaxed select-text transition-all ${
                msg.role === 'user'
                  ? 'bg-[#121620] border-[#222a3a] text-[#e2e5ea]'
                  : 'bg-[#0a0c10] border-[#161922] text-[#cbd5e1]'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5 text-[10.5px] font-mono font-bold select-none border-b border-[#161922]/60 pb-1">
                {msg.role === 'user' ? (
                  <span className="text-[#60a5fa] flex items-center gap-1.5">
                    <Icons.User />
                    <span>Developer</span>
                  </span>
                ) : (
                  <span className="text-[#10b981] flex items-center gap-1.5">
                    <Icons.ArchonAI />
                    <span>Archon Agent</span>
                  </span>
                )}

                {msg.status ? (
                  <span className="text-[10px] text-[#60a5fa] font-mono flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#60a5fa]" />
                    <span>{msg.status}</span>
                  </span>
                ) : msg.role === 'assistant' && msg.content.includes('```') && (
                  <button
                    onClick={() => {
                      const codeMatch = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/.exec(msg.content);
                      if (codeMatch && codeMatch[1]) {
                        const detected = detectTargetFilename(codeMatch[1]);
                        const current = activeTab?.name;
                        if (detected && current && detected.toLowerCase() !== current.toLowerCase()) {
                          handleCreateAndOpenFile(detected, codeMatch[1].trim());
                        } else {
                          handleApplyCodeToEditor(codeMatch[1].trim());
                        }
                      }
                    }}
                    className="text-[#60a5fa] hover:text-[#93c5fd] bg-[#1e293b]/70 hover:bg-[#1e293b] px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border border-[#3b82f6]/30 cursor-pointer"
                  >
                    <Icons.Sparkles />
                    <span>Apply Code</span>
                  </button>
                )}
              </div>

              {/* ── RAG Citations with Interactive Hover Tooltip ──── */}
              {msg.rag_sources && msg.rag_sources.length > 0 && (
                <div className="mb-3 p-2 bg-[#090b0e] border border-[#161922] rounded-lg">
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono text-[#64748b] uppercase tracking-wider font-semibold select-none">
                    <Icons.Book />
                    <span>Retrieved Enterprise API Sources (Hybrid RAG):</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {msg.rag_sources.map((src, sIdx) => (
                      <div key={sIdx} className="relative group/src">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] text-[10.5px] font-mono cursor-pointer hover:bg-[#10b981]/20 transition-colors">
                          <Icons.FileCode />
                          <span>{src.file || src.title}</span>
                          <span className="text-[9px] bg-[#10b981]/25 px-1 py-0.2 rounded font-bold">{src.score}</span>
                        </div>

                        {/* Hover Popover showing exact extracted chunk */}
                        <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover/src:block z-50 w-[320px] p-3 rounded-lg bg-[#0c0e12] border border-[#1e293b] shadow-2xl text-[11px] font-mono text-[#cbd5e1] animate-fade-in pointer-events-auto">
                          <div className="flex justify-between items-center pb-1.5 mb-1.5 border-b border-[#1e293b]">
                            <span className="font-bold text-[#10b981] truncate max-w-[200px]" title={src.title}>{src.title}</span>
                            <span className="text-[9px] text-[#60a5fa] font-semibold">Match: {src.score}</span>
                          </div>
                          <div className="text-[10px] text-[#64748b] mb-1">
                            Source Spec: <span className="text-[#cbd5e1]">{src.file}</span>
                          </div>
                          <div className="text-[10.5px] text-[#94a3b8] leading-relaxed max-h-[160px] overflow-y-auto custom-scrollbar whitespace-pre-wrap bg-[#08090a] p-2 rounded border border-[#161922]">
                            {src.text}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Synaptic Architecture Flow Trace ──────────────── */}
              {msg.flowSequence && msg.flowSequence.length > 0 && (
                <div className="mb-3 p-2.5 bg-[#090b0e] border border-[#f59e0b]/30 rounded-lg flex items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f59e0b] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#f59e0b]"></span>
                    </span>
                    <span className="text-[11px] font-mono text-[#cbd5e1]">
                      Synaptic Path Traced: <strong className="text-[#f59e0b]">{msg.flowSequence.length} nodes</strong> across architecture
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      if (!knowledgeGraphData) {
                        try {
                          const r = await fetch(`${apiBase}/api/workspace/graph`);
                          if (r.ok) {
                            const d = await r.json();
                            setKnowledgeGraphData(d);
                          }
                        } catch (e) {}
                      }
                      setActiveFlowSequence(msg.flowSequence || null);
                      setActiveFlowSteps(msg.flowSteps || null);
                      setShowKnowledgeGraph(true);
                    }}
                    className="px-2.5 py-1 rounded bg-[#f59e0b]/15 hover:bg-[#f59e0b]/25 border border-[#f59e0b]/35 hover:border-[#f59e0b]/60 text-[#fbbf24] text-[11px] font-mono font-medium flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <span>⚡ Trace Synaptic Path in Graph</span>
                    <span>→</span>
                  </button>
                </div>
              )}

              {msg.content ? (
                <FormattedMarkdown
                  content={msg.content}
                  onApplyCode={handleApplyCodeToEditor}
                  onApplyDiff={handleApplyDiff}
                  onCreateNewFile={handleCreateAndOpenFile}
                  activeFileName={activeTab?.name}
                />
              ) : msg.status ? (
                <div className="py-3 flex items-center gap-2.5 text-[11.5px] text-[#64748b] font-mono">
                  <div className="w-3.5 h-3.5 border-2 border-[#1a1e26] border-t-[#60a5fa] rounded-full animate-spin flex-shrink-0" />
                  <span>{msg.status}</span>
                </div>
              ) : null}
            </div>
          ))}

          {agentLoading && (
            <div className="p-3 bg-[#08090a] border border-[#161922] rounded-lg text-[12px] font-mono text-[#60a5fa] flex items-center gap-2 animate-pulse">
              <Icons.Sparkles />
              <span>Archon Agent synthesizing solution...</span>
            </div>
          )}
        </div>

        {activeTab && (
          <div className="p-2 border-t border-[#161922]/60 bg-[#08090a] flex items-center gap-1.5 overflow-x-auto custom-scrollbar select-none">
            <button
              onClick={() => handleSendAgentMessage(`Refactor ${activeTab.path} to improve code cleanliness, maintainability, and error handling. Output the updated code.`)}
              className="whitespace-nowrap px-2 py-1 rounded text-[10.5px] font-mono bg-[#12151c] hover:bg-[#1a1e26] text-[#8b949e] hover:text-[#60a5fa] border border-[#1a1e26] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Icons.Bolt />
              <span>Refactor & Apply</span>
            </button>
            <button
              onClick={() => handleSendAgentMessage(`Review ${activeTab.path} for any bugs or edge cases, fix them, and provide the updated complete implementation.`)}
              className="whitespace-nowrap px-2 py-1 rounded text-[10.5px] font-mono bg-[#12151c] hover:bg-[#1a1e26] text-[#8b949e] hover:text-[#60a5fa] border border-[#1a1e26] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Icons.Diagnostics />
              <span>Fix Bugs</span>
            </button>
            <button
              onClick={() => handleSendAgentMessage(`Explain what ${activeTab.path} does and summarize its key methods.`)}
              className="whitespace-nowrap px-2 py-1 rounded text-[10.5px] font-mono bg-[#12151c] hover:bg-[#1a1e26] text-[#8b949e] hover:text-[#60a5fa] border border-[#1a1e26] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Icons.Search />
              <span>Explain</span>
            </button>
          </div>
        )}

        <div 
          className="p-3 border-t border-[#161922] bg-[#090b0e]"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOverChat(true);
          }}
          onDragLeave={() => setIsDraggingOverChat(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOverChat(false);
            try {
              const dataStr = e.dataTransfer.getData("application/json");
              if (dataStr) {
                const data = JSON.parse(dataStr);
                if (data.path) {
                  handleAddContextFile(data.path, data.name);
                }
              }
            } catch {}
          }}
        >
          <div className="relative border border-[#1e232e] focus-within:border-[#3b82f6]/50 rounded-lg bg-[#08090a] transition-all overflow-hidden">
            <ContextFileChips
              contextFiles={contextFiles}
              onRemoveFile={handleRemoveContextFile}
              suggestedFiles={suggestedFiles}
              onAddSuggestedFile={(sug) => {
                handleAddContextFile(sug.path);
                setSuggestedFiles(prev => prev.filter(s => s.path !== sug.path));
              }}
              isDraggingOver={isDraggingOverChat}
            />
            <textarea
              value={agentInput}
              onChange={(e) => setAgentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendAgentMessage();
                }
              }}
              placeholder="Ask Archon Agent (Enter to send, Shift+Enter for newline)..."
              rows={2}
              className="w-full bg-transparent text-[#cbd5e1] p-2.5 text-[12px] font-mono focus:outline-none resize-none custom-scrollbar placeholder-[#475569] select-text"
            />
            <div className="flex justify-between items-center gap-2 px-2.5 pb-2 select-none min-w-0">
              <div className="min-w-0 flex-1 max-w-[200px] flex items-center gap-1.5">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-[#12151c] hover:bg-[#161a24] text-[#8b949e] hover:text-[#c8ccd0] text-[10.5px] font-mono rounded px-2 py-1 border border-[#1e232e] focus:outline-none cursor-pointer truncate"
                  title={selectedModel}
                >
                  {models.map(m => (
                    <option key={m} value={m} className="bg-[#0c0e12]">{m}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setShowApiKeysModal(true); fetchApiKeyStatus(); }}
                  title="Configure Cloud LLM API Keys"
                  className="flex-shrink-0 text-[#64748b] hover:text-[#60a5fa] bg-[#12151c] hover:bg-[#1e293b] p-1 rounded border border-[#1e232e] cursor-pointer transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                </button>
              </div>

              <button
                onClick={() => handleSendAgentMessage()}
                disabled={!agentInput.trim() || agentLoading}
                className={`flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  agentInput.trim() && !agentLoading
                    ? 'bg-[#3b82f6] hover:bg-[#2563eb] text-white shadow-md shadow-[#3b82f6]/20'
                    : 'bg-[#1e293b] text-[#64748b] cursor-not-allowed'
                }`}
              >
                <span>Send</span>
                <span className="text-[9.5px] opacity-75">↵</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
