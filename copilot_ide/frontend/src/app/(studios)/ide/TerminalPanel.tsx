"use client";
import React, { useState } from 'react';
import { Icons } from '../../components/Icons';
import { useIde } from './IdeContext';
import { ResizeHandle, usePanelSize } from '../../components/ResizeHandle';
import { useRunner } from '../../components/useRunner';
import { refreshRunner } from '@/lib/runner';
import { XtermView, terminalText } from './XtermView';

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
    setTerminalCopied,
    setTerminals,
    showBottomPanel,
    termInputRef,
    termScrollRef,
    terminalCopied,
    terminals,
  } = useIde();
  const panel = usePanelSize('ide.terminal', { initial: 180, min: 90, max: 1200 });
  // `archon` running on this machine: real shells, one per tab. Otherwise the container's one-shot shell.
  // Once a real shell has been seen, keep the terminals even if the runner stops:
  // they say the connection dropped and Enter reconnects.
  const runner = useRunner();
  const [liveShell, setLiveShell] = useState<string | null>(null);
  if (runner.status === 'online' && runner.info.shell !== liveShell) setLiveShell(runner.info.shell);
  const live = liveShell !== null;

  const copyLiveTerminal = () => {
    navigator.clipboard.writeText(terminalText(activeTermId)).then(() => {
      setTerminalCopied(true);
      setTimeout(() => setTerminalCopied(false), 2000);
    }, () => {});
  };

  return (
    <>
      {/* ── Interactive Multi-Tab Terminal & Diagnostics Panel ── */}
      {showBottomPanel && (
        <ResizeHandle
          edge="top"
          label="Resize terminal"
          size={panel.size}
          min={90}
          max={handle => (handle.parentElement?.clientHeight ?? 600) - 120}
          onResize={panel.setSize}
          onReset={panel.reset}
        />
      )}
      {/* Stays mounted while hidden, so shells keep running */}
      <div style={{ height: panel.size }} className={`bg-canvas border-t border-line-subtle flex flex-col flex-shrink-0 ${showBottomPanel ? '' : 'hidden'}`}>
        
        {/* Bottom Tab Bar with + New Terminal & Copy Button */}
        <div className="flex justify-between items-center px-3 py-1 bg-canvas border-b border-line-subtle text-xs font-mono select-none">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setBottomTab('terminal')}
              className={`cursor-pointer transition-colors flex items-center gap-1.5 pb-0.5 ${bottomTab === 'terminal' ? 'text-accent-fg font-bold border-b-2 border-accent' : 'text-fg-subtle hover:text-fg-muted'}`}
            >
              <Icons.Terminal />
              <span>TERMINAL</span>
            </button>
            <button
              onClick={() => setBottomTab('output')}
              className={`cursor-pointer transition-colors pb-0.5 ${bottomTab === 'output' ? 'text-accent-fg font-bold border-b-2 border-accent' : 'text-fg-subtle hover:text-fg-muted'}`}
            >
              OUTPUT
            </button>
            <button
              onClick={() => setBottomTab('diagnostics')}
              className={`cursor-pointer transition-colors pb-0.5 ${bottomTab === 'diagnostics' ? 'text-accent-fg font-bold border-b-2 border-accent' : 'text-fg-subtle hover:text-fg-muted'}`}
            >
              DIAGNOSTICS
            </button>
          </div>

          <div className="flex items-center gap-2">
            {bottomTab === 'terminal' && (
              <div className="flex items-center gap-1.5 mr-3">
                {terminals.map((t, i) => (
                  <div
                    key={t.id}
                    onClick={() => setActiveTermId(t.id)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded-control cursor-pointer text-xs font-mono transition-colors ${
                      activeTermId === t.id
                        ? 'bg-selected text-accent-fg border border-accent/30'
                        : 'text-fg-subtle hover:bg-raised hover:text-fg-soft'
                    }`}
                  >
                    <span>{live ? `${liveShell} ${i + 1}` : t.name}</span>
                    {terminals.length > 1 && (
                      <button aria-label={`Close ${t.name}`}
                        onClick={(e) => handleCloseTerminal(t.id, e)}
                        className="hover:text-danger p-0.5"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={handleAddTerminal}
                  title="Add New Terminal"
                  className="text-accent-fg hover:text-[#93c5fd] bg-raised hover:bg-selected px-1.5 py-0.5 rounded-control border border-line cursor-pointer flex items-center gap-1 text-xs"
                >
                  <Icons.Plus />
                  <span>New</span>
                </button>
                <button
                  onClick={live ? copyLiveTerminal : handleCopyTerminalBuffer}
                  title="Copy All Terminal Output"
                  className="text-fg-muted hover:text-fg-soft bg-raised hover:bg-selected px-2 py-0.5 rounded-control border border-line cursor-pointer flex items-center gap-1 text-xs"
                >
                  <Icons.Copy />
                  <span>{terminalCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            )}

            <button aria-label="Hide panel"
              onClick={() => setShowBottomPanel(false)}
              className="text-fg-subtle hover:text-fg-soft cursor-pointer"
            >
              <Icons.Close />
            </button>
          </div>
        </div>

        {/* Tab 1: real shells through the local runner (kept mounted across tabs) */}
        {live && (
          <div className={`flex-1 min-h-0 pl-2.5 pt-1.5 bg-canvas ${bottomTab === 'terminal' ? '' : 'hidden'}`}>
            {terminals.map(t => (
              <XtermView key={t.id} id={t.id} active={showBottomPanel && bottomTab === 'terminal' && t.id === activeTermId} />
            ))}
          </div>
        )}

        {/* Tab 1, without the runner: one command at a time in the container */}
        {!live && bottomTab === 'terminal' && (
          <div className="flex-1 flex flex-col p-2.5 overflow-hidden font-mono text-sm bg-canvas select-text">
            {runner.status === 'offline' && (
              <div role="note" className="mb-2 flex items-start justify-between gap-3 rounded-control border border-line bg-raised px-3 py-2 font-sans text-xs text-fg-muted">
                <span>
                  Basic shell in the Archon container: one command at a time, no colours, no Ctrl+C.
                  For a real terminal on your machine, run <code className="font-mono text-fg-soft">archon</code> in your project folder
                  {' '}(first time: <code className="font-mono text-fg-soft">pip install -e &quot;.[runner]&quot;</code>).
                </span>
                <button onClick={() => void refreshRunner()} className="shrink-0 rounded-control border border-line-strong px-2 py-0.5 text-fg-soft hover:bg-selected cursor-pointer">
                  Check again
                </button>
              </div>
            )}
            <div
              ref={termScrollRef}
              className="flex-1 overflow-y-auto space-y-1 custom-scrollbar text-fg-soft pb-1 select-text"
            >
              {currentTerm.history.map((item, i) => (
                <div key={i} className="leading-relaxed select-text">
                  {item.type === 'input' && (
                    <div className="text-accent-fg font-bold select-text">{item.text}</div>
                  )}
                  {item.type === 'stdout' && (
                    <pre className="text-fg-muted whitespace-pre-wrap select-text font-mono">{item.text}</pre>
                  )}
                  {item.type === 'stderr' && (
                    <pre className="text-danger-fg whitespace-pre-wrap select-text font-mono">{item.text}</pre>
                  )}
                  {item.type === 'system' && (
                    <div className="text-success select-text">{item.text}</div>
                  )}
                </div>
              ))}
              {executingCmd && (
                <div className="text-accent-fg flex items-center gap-2 animate-pulse select-text">
                  <span className="animate-spin">⟳</span> Running command...
                </div>
              )}
            </div>

            {/* Interactive Terminal Prompt Input */}
            <div className="flex items-center gap-2 pt-1.5 border-t border-line-subtle text-sm font-mono">
              <span className="text-success flex items-center gap-1 select-none font-bold">
                archon@{currentProjectName}:~
              </span>
              <span className="text-accent-fg select-none font-bold">$</span>
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
                className="flex-1 bg-transparent text-fg focus:outline-none placeholder-fg-subtle select-text"
              />
            </div>
          </div>
        )}

        {/* Tab 2: System Output Logs */}
        {bottomTab === 'output' && (
          <div className="flex-1 p-2.5 overflow-y-auto font-mono text-sm leading-[1.6] custom-scrollbar text-fg-muted select-text">
            <div>
              <span className="text-fg-subtle select-none">[{new Date().toLocaleTimeString()}]</span> Archon Agent IDE workspace initialized.
            </div>
            <div>
              <span className="text-fg-subtle select-none">[{new Date().toLocaleTimeString()}]</span> Microservices Mesh connected on {apiBase}
            </div>
            <div>
              <span className="text-fg-subtle select-none">[{new Date().toLocaleTimeString()}]</span> GPU Model loaded: {selectedModel}
            </div>
            {activeTabPath && (
              <div>
                <span className="text-fg-subtle select-none">[{new Date().toLocaleTimeString()}]</span> Active Editor Buffer: {activeTabPath}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Diagnostics */}
        {bottomTab === 'diagnostics' && (
          <div className="flex-1 p-2.5 overflow-y-auto font-mono text-sm leading-[1.6] custom-scrollbar text-fg-soft select-text">
            <span>Project Root: {currentProjectPath}</span><br />
            <span>Git Branch: {gitBranch}</span><br />
            <span>Active File: {activeTabPath || 'None'}</span><br />
            <span>Line Count: {rawLines.length} | Characters: {editorContent.length}</span><br />
            <span>Unsaved Buffer: {isDirty ? 'Yes' : 'No'}</span>
          </div>
        )}
      </div>
    </>
  );
}
