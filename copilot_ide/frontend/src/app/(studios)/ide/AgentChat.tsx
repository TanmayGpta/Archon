"use client";
import React from 'react';
import { Icons } from '../../components/Icons';
import { FormattedMarkdown } from '../../components/markdown/FormattedMarkdown';
import { detectTargetFilename } from '../../components/markdown/CodeBlock';
import ContextFileChips from '../../components/ContextFileChips';
import { useIde } from './IdeContext';
import { ResizeHandle, usePanelSize } from '../../components/ResizeHandle';

/* -- Agent chat panel - */
export function AgentChat() {
  const {
    activeTab,
    agentEdits,
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
    openTabs,
    revertAgentEdit,
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
  const panel = usePanelSize('ide.chat', { initial: 380, min: 300, max: 760 });

  return (
    <>
      <ResizeHandle
        edge="left"
        label="Resize agent chat"
        size={panel.size}
        min={300}
        max={() => Math.min(760, window.innerWidth * 0.5)}
        onResize={panel.setSize}
        onReset={panel.reset}
      />
      {/* ── 4. Archon Agent Chat Panel (Right, resizable) ─────────── */}
      <div style={{ width: panel.size }} className="bg-surface border-l border-line-subtle flex flex-col flex-shrink-0 overflow-hidden select-none">
        
        <div className="px-3 py-2 border-b border-line-subtle bg-canvas flex justify-between items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div className="w-5 h-5 rounded bg-raised border border-line flex items-center justify-center p-0.5 shadow-sm flex-shrink-0">
              <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
            </div>
            <span className="text-sm font-mono font-bold text-fg tracking-tight whitespace-nowrap flex-shrink-0">
              Archon Agent
            </span>
            <span 
              className="text-xs font-mono text-accent-fg px-1.5 py-0.2 bg-accent/10 rounded border border-accent/20 truncate max-w-[110px] inline-block"
              title={selectedModel}
            >
              {selectedModel}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => setAutoApplyEdits(!autoApplyEdits)}
              title="Toggle automatic application of AI code edits directly to active file"
              className={`px-2 py-0.5 rounded text-xs font-mono transition-all flex items-center gap-1 cursor-pointer border whitespace-nowrap ${
                autoApplyEdits
                  ? 'bg-accent/20 text-accent-fg border-accent/40 font-bold'
                  : 'bg-raised text-fg-subtle border-line hover:text-fg-muted'
              }`}
            >
              <Icons.Sparkles />
              <span>Auto-Apply: {autoApplyEdits ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={() => setAgentMessages([{ id: 'cleared', role: 'assistant', content: "Chat history cleared. How can I help you?" }])}
              title="Clear Chat History" aria-label="Clear Chat History"
              className="text-fg-subtle hover:text-fg-soft text-xs font-mono p-1 rounded hover:bg-overlay cursor-pointer flex-shrink-0"
            >
              <Icons.Trash />
            </button>
          </div>
        </div>

        {/* Agent edits applied this session, newest first, each revertible */}
        {agentEdits.length > 0 && (
          <details className="px-3 py-1.5 bg-surface border-b border-line-subtle text-xs">
            <summary className="cursor-pointer text-fg-muted select-none">
              Edits this session ({agentEdits.length})
            </summary>
            <ul className="mt-1.5 space-y-1 max-h-[140px] overflow-y-auto custom-scrollbar">
              {[...agentEdits].reverse().map(edit => {
                const tab = openTabs.find(t => t.path === edit.path);
                const canRevert = !edit.reverted && tab?.content === edit.after;
                const why = !tab
                  ? `Open ${edit.name} to revert this edit`
                  : canRevert
                    ? `Restore ${edit.name} to how it was before this edit`
                    : 'The file changed after this edit; use Ctrl+Z in the editor';
                return (
                  <li key={edit.id} className="flex items-center justify-between gap-2">
                    <span className="truncate" title={edit.path}>
                      <span className="font-mono text-fg-soft">{edit.name}</span>
                      <span className="text-fg-subtle"> · {edit.summary}</span>
                    </span>
                    {edit.reverted ? (
                      <span className="text-fg-subtle flex-shrink-0">Reverted</span>
                    ) : (
                      <button
                        onClick={() => revertAgentEdit(edit.id)}
                        disabled={!canRevert}
                        title={why}
                        className="flex-shrink-0 px-2 py-0.5 rounded-md border border-line text-fg-soft hover:border-danger/50 hover:text-danger-fg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Revert
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        <div className="px-3 py-1.5 bg-canvas border-b border-line-subtle/60 flex items-center justify-between text-xs font-mono">
          <label className="flex items-center gap-1.5 cursor-pointer text-fg-muted">
            <input
              type="checkbox"
              checked={includeFileContext}
              onChange={(e) => setIncludeFileContext(e.target.checked)}
              className="rounded border-line bg-raised text-accent focus:ring-0 cursor-pointer"
            />
            <span>Include active file in context</span>
          </label>
          {activeTab && includeFileContext && (
            <span className="text-accent-fg truncate max-w-[130px] font-medium flex items-center gap-1" title={activeTab.path}>
              <Icons.FileCode />
              <span className="truncate">{activeTab.name}</span>
            </span>
          )}
        </div>

        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar select-text">
          {agentMessages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-lg border text-sm font-mono leading-relaxed select-text transition-all ${
                msg.role === 'user'
                  ? 'bg-raised border-line-strong text-fg'
                  : 'bg-surface border-line-subtle text-fg-soft'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5 text-xs font-mono font-bold select-none border-b border-line-subtle/60 pb-1">
                {msg.role === 'user' ? (
                  <span className="text-accent-fg flex items-center gap-1.5">
                    <Icons.User />
                    <span>Developer</span>
                  </span>
                ) : (
                  <span className="text-success flex items-center gap-1.5">
                    <Icons.ArchonAI />
                    <span>Archon Agent</span>
                  </span>
                )}

                {msg.status ? (
                  <span className="text-xs text-accent-fg font-mono flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-fg" />
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
                    className="text-accent-fg hover:text-[#93c5fd] bg-selected/70 hover:bg-selected px-2 py-0.5 rounded text-xs font-mono flex items-center gap-1 border border-accent/30 cursor-pointer"
                  >
                    <Icons.Sparkles />
                    <span>Apply Code</span>
                  </button>
                )}
              </div>

              {/* ── RAG Citations with Interactive Hover Tooltip ──── */}
              {msg.rag_sources && msg.rag_sources.length > 0 && (
                <div className="mb-3 p-2 bg-canvas border border-line-subtle rounded-lg">
                  <div className="flex items-center gap-1.5 mb-1 text-xs font-mono text-fg-subtle uppercase tracking-wider font-semibold select-none">
                    <Icons.Book />
                    <span>Retrieved Enterprise API Sources (Hybrid RAG):</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {msg.rag_sources.map((src, sIdx) => (
                      <div key={sIdx} className="relative group/src">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-success/10 border border-success/30 text-success text-xs font-mono cursor-pointer hover:bg-success/20 transition-colors">
                          <Icons.FileCode />
                          <span>{src.file || src.title}</span>
                          <span className="text-xs bg-success/25 px-1 py-0.2 rounded font-bold">{src.score}</span>
                        </div>

                        {/* Hover Popover showing exact extracted chunk */}
                        <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover/src:block z-50 w-[320px] p-3 rounded-lg bg-surface border border-line-strong shadow-2xl text-xs font-mono text-fg-soft animate-fade-in pointer-events-auto">
                          <div className="flex justify-between items-center pb-1.5 mb-1.5 border-b border-line-strong">
                            <span className="font-bold text-success truncate max-w-[200px]" title={src.title}>{src.title}</span>
                            <span className="text-xs text-accent-fg font-semibold">Match: {src.score}</span>
                          </div>
                          <div className="text-xs text-fg-subtle mb-1">
                            Source Spec: <span className="text-fg-soft">{src.file}</span>
                          </div>
                          <div className="text-xs text-fg-muted leading-relaxed max-h-[160px] overflow-y-auto custom-scrollbar whitespace-pre-wrap bg-canvas p-2 rounded border border-line-subtle">
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
                <div className="mb-3 p-2.5 bg-canvas border border-warning/30 rounded-lg flex items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-warning"></span>
                    </span>
                    <span className="text-xs font-mono text-fg-soft">
                      Synaptic Path Traced: <strong className="text-warning">{msg.flowSequence.length} nodes</strong> across architecture
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
                    className="px-2.5 py-1 rounded bg-warning/15 hover:bg-warning/25 border border-warning/35 hover:border-warning/60 text-warning-fg text-xs font-mono font-medium flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
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
                <div className="py-3 flex items-center gap-2.5 text-sm text-fg-subtle font-mono">
                  <div className="w-3.5 h-3.5 border-2 border-line border-t-accent-fg rounded-full animate-spin flex-shrink-0" />
                  <span>{msg.status}</span>
                </div>
              ) : null}
            </div>
          ))}

          {agentLoading && (
            <div className="p-3 bg-canvas border border-line-subtle rounded-lg text-sm font-mono text-accent-fg flex items-center gap-2 animate-pulse">
              <Icons.Sparkles />
              <span>Archon Agent synthesizing solution...</span>
            </div>
          )}
        </div>

        {activeTab && (
          <div className="p-2 border-t border-line-subtle/60 bg-canvas flex items-center gap-1.5 overflow-x-auto custom-scrollbar select-none">
            <button
              onClick={() => handleSendAgentMessage(`Refactor ${activeTab.path} to improve code cleanliness, maintainability, and error handling. Output the updated code.`)}
              className="whitespace-nowrap px-2 py-1 rounded text-xs font-mono bg-raised hover:bg-overlay text-fg-muted hover:text-accent-fg border border-line transition-colors cursor-pointer flex items-center gap-1"
            >
              <Icons.Bolt />
              <span>Refactor & Apply</span>
            </button>
            <button
              onClick={() => handleSendAgentMessage(`Review ${activeTab.path} for any bugs or edge cases, fix them, and provide the updated complete implementation.`)}
              className="whitespace-nowrap px-2 py-1 rounded text-xs font-mono bg-raised hover:bg-overlay text-fg-muted hover:text-accent-fg border border-line transition-colors cursor-pointer flex items-center gap-1"
            >
              <Icons.Diagnostics />
              <span>Fix Bugs</span>
            </button>
            <button
              onClick={() => handleSendAgentMessage(`Explain what ${activeTab.path} does and summarize its key methods.`)}
              className="whitespace-nowrap px-2 py-1 rounded text-xs font-mono bg-raised hover:bg-overlay text-fg-muted hover:text-accent-fg border border-line transition-colors cursor-pointer flex items-center gap-1"
            >
              <Icons.Search />
              <span>Explain</span>
            </button>
          </div>
        )}

        <div 
          className="p-3 border-t border-line-subtle bg-canvas"
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
          <div className="relative border border-line focus-within:border-accent/50 rounded-lg bg-canvas transition-all overflow-hidden">
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
              className="w-full bg-transparent text-fg-soft p-2.5 text-sm font-mono focus:outline-none resize-none custom-scrollbar placeholder-fg-subtle select-text"
            />
            <div className="flex justify-between items-center gap-2 px-2.5 pb-2 select-none min-w-0">
              <div className="min-w-0 flex-1 max-w-[200px] flex items-center gap-1.5">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-raised hover:bg-overlay text-fg-muted hover:text-fg-soft text-xs font-mono rounded px-2 py-1 border border-line focus:outline-none cursor-pointer truncate"
                  title={selectedModel}
                >
                  {models.map(m => (
                    <option key={m} value={m} className="bg-surface">{m}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setShowApiKeysModal(true); fetchApiKeyStatus(); }}
                  title="Configure Cloud LLM API Keys" aria-label="Configure Cloud LLM API Keys"
                  className="flex-shrink-0 text-fg-subtle hover:text-accent-fg bg-raised hover:bg-selected p-1 rounded border border-line cursor-pointer transition-colors"
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
                className={`flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  agentInput.trim() && !agentLoading
                    ? 'bg-accent hover:bg-accent-strong text-white shadow-md shadow-[#3b82f6]/20'
                    : 'bg-selected text-fg-subtle cursor-not-allowed'
                }`}
              >
                <span>Send</span>
                <span className="text-xs opacity-75">↵</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
