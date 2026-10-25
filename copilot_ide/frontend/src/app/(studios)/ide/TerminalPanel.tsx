"use client";
import React from 'react';
import { Icons } from '../../components/Icons';
import { useIde } from './IdeContext';

/* -- Bottom panel: terminals, output, diagnostics - */
export function TerminalPanel() {
  const {
    activeTabPath,
    activeTermId,
    apiBase,
    bottomTab,
    currentProjectName,
    currentProjectPath,
    currentTerm,
    editorContent,
    executingCmd,
    gitBranch,
    handleAddTerminal,
    handleCloseTerminal,
    handleCopyTerminalBuffer,
    handleTerminalKeyDown,
    isDirty,
    rawLines,
    selectedModel,
    setActiveTermId,
    setBottomTab,
    setShowBottomPanel,
    setTerminals,
    showBottomPanel,
    termInputRef,
    termScrollRef,
    terminalCopied,
    terminals,
  } = useIde();

  return (
    <>
      {/* ── Interactive Multi-Tab Terminal & Diagnostics Panel ── */}
      {showBottomPanel && (
        <div className="h-[180px] bg-[#07080a] border-t border-[#161922] flex flex-col flex-shrink-0">
          
          {/* Bottom Tab Bar with + New Terminal & Copy Button */}
          <div className="flex justify-between items-center px-3 py-1 bg-[#090b0e] border-b border-[#161922] text-[11px] font-mono select-none">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setBottomTab('terminal')}
                className={`cursor-pointer transition-colors flex items-center gap-1.5 pb-0.5 ${bottomTab === 'terminal' ? 'text-[#60a5fa] font-bold border-b-2 border-[#3b82f6]' : 'text-[#64748b] hover:text-[#94a3b8]'}`}
              >
                <Icons.Terminal />
                <span>TERMINAL</span>
              </button>
              <button
                onClick={() => setBottomTab('output')}
                className={`cursor-pointer transition-colors pb-0.5 ${bottomTab === 'output' ? 'text-[#60a5fa] font-bold border-b-2 border-[#3b82f6]' : 'text-[#64748b] hover:text-[#94a3b8]'}`}
              >
                OUTPUT
              </button>
              <button
                onClick={() => setBottomTab('diagnostics')}
                className={`cursor-pointer transition-colors pb-0.5 ${bottomTab === 'diagnostics' ? 'text-[#60a5fa] font-bold border-b-2 border-[#3b82f6]' : 'text-[#64748b] hover:text-[#94a3b8]'}`}
              >
                DIAGNOSTICS
              </button>
            </div>

            <div className="flex items-center gap-2">
              {bottomTab === 'terminal' && (
                <div className="flex items-center gap-1.5 mr-3">
                  {terminals.map(t => (
                    <div
                      key={t.id}
                      onClick={() => setActiveTermId(t.id)}
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer text-[10px] font-mono transition-colors ${
                        activeTermId === t.id
                          ? 'bg-[#1e293b] text-[#60a5fa] border border-[#3b82f6]/30'
                          : 'text-[#64748b] hover:bg-[#12151c] hover:text-[#cbd5e1]'
                      }`}
                    >
                      <span>{t.name}</span>
                      {terminals.length > 1 && (
                        <button
                          onClick={(e) => handleCloseTerminal(t.id, e)}
                          className="hover:text-[#ef4444] p-0.5"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={handleAddTerminal}
                    title="Add New Terminal"
                    className="text-[#60a5fa] hover:text-[#93c5fd] bg-[#12151c] hover:bg-[#1e293b] px-1.5 py-0.5 rounded border border-[#1e232e] cursor-pointer flex items-center gap-1 text-[10px]"
                  >
                    <Icons.Plus />
                    <span>New</span>
                  </button>
                  <button
                    onClick={handleCopyTerminalBuffer}
                    title="Copy All Terminal Output"
                    className="text-[#94a3b8] hover:text-[#cbd5e1] bg-[#12151c] hover:bg-[#1e293b] px-2 py-0.5 rounded border border-[#1e232e] cursor-pointer flex items-center gap-1 text-[10px]"
                  >
                    <Icons.Copy />
                    <span>{terminalCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowBottomPanel(false)}
                className="text-[#64748b] hover:text-[#cbd5e1] cursor-pointer"
              >
                <Icons.Close />
              </button>
            </div>
          </div>

          {/* Tab 1: Live Interactive Terminal (Full Selectable Text) */}
          {bottomTab === 'terminal' && (
            <div className="flex-1 flex flex-col p-2.5 overflow-hidden font-mono text-[11.5px] bg-[#07080a] select-text">
              <div
                ref={termScrollRef}
                className="flex-1 overflow-y-auto space-y-1 custom-scrollbar text-[#c9d1d9] pb-1 select-text"
              >
                {currentTerm.history.map((item, i) => (
                  <div key={i} className="leading-relaxed select-text">
                    {item.type === 'input' && (
                      <div className="text-[#60a5fa] font-bold select-text">{item.text}</div>
                    )}
                    {item.type === 'stdout' && (
                      <pre className="text-[#a0a6b5] whitespace-pre-wrap select-text font-mono">{item.text}</pre>
                    )}
                    {item.type === 'stderr' && (
                      <pre className="text-[#f87171] whitespace-pre-wrap select-text font-mono">{item.text}</pre>
                    )}
                    {item.type === 'system' && (
                      <div className="text-[#10b981] select-text">{item.text}</div>
                    )}
                  </div>
                ))}
                {executingCmd && (
                  <div className="text-[#60a5fa] flex items-center gap-2 animate-pulse select-text">
                    <span className="animate-spin">⟳</span> Running command...
                  </div>
                )}
              </div>

              {/* Interactive Terminal Prompt Input */}
              <div className="flex items-center gap-2 pt-1.5 border-t border-[#161922] text-[11.5px] font-mono">
                <span className="text-[#10b981] flex items-center gap-1 select-none font-bold">
                  archon@{currentProjectName}:~
                </span>
                <span className="text-[#60a5fa] select-none font-bold">$</span>
                <input
                  ref={termInputRef}
                  type="text"
                  value={currentTerm.input}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTerminals(prev => prev.map(t => t.id === activeTermId ? { ...t, input: val } : t));
                  }}
                  onKeyDown={handleTerminalKeyDown}
                  placeholder="Type shell command (e.g. ls, git status, cd .., mkdir new-dir)..."
                  className="flex-1 bg-transparent text-[#e2e5ea] focus:outline-none placeholder-[#475569] select-text"
                />
              </div>
            </div>
          )}

          {/* Tab 2: System Output Logs */}
          {bottomTab === 'output' && (
            <div className="flex-1 p-2.5 overflow-y-auto font-mono text-[11.5px] leading-[1.6] custom-scrollbar text-[#94a3b8] select-text">
              <div>
                <span className="text-[#475569] select-none">[{new Date().toLocaleTimeString()}]</span> Archon Agent IDE workspace initialized.
              </div>
              <div>
                <span className="text-[#475569] select-none">[{new Date().toLocaleTimeString()}]</span> Microservices Mesh connected on {apiBase}
              </div>
              <div>
                <span className="text-[#475569] select-none">[{new Date().toLocaleTimeString()}]</span> GPU Model loaded: {selectedModel}
              </div>
              {activeTabPath && (
                <div>
                  <span className="text-[#475569] select-none">[{new Date().toLocaleTimeString()}]</span> Active Editor Buffer: {activeTabPath}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Diagnostics */}
          {bottomTab === 'diagnostics' && (
            <div className="flex-1 p-2.5 overflow-y-auto font-mono text-[11.5px] leading-[1.6] custom-scrollbar text-[#cbd5e1] select-text">
              <span>Project Root: {currentProjectPath}</span><br />
              <span>Git Branch: {gitBranch}</span><br />
              <span>Active File: {activeTabPath || 'None'}</span><br />
              <span>Line Count: {rawLines.length} | Characters: {editorContent.length}</span><br />
              <span>Unsaved Buffer: {isDirty ? 'Yes' : 'No'}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
