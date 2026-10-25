"use client";
import React from 'react';
import { Icons } from '../../components/Icons';
import { getFileIcon } from './FileTree';
import { useIde } from './IdeContext';

/* -- Open project, API keys and quick-open dialogs - */
export function IdeDialogs() {
  const {
    allFiles,
    apiKeyInputs,
    apiKeySaveStatus,
    apiKeyTestStatus,
    apiKeys,
    handleClearApiKey,
    handleOpenFile,
    handleOpenProject,
    handleSaveApiKey,
    handleTestApiKey,
    projectPathInput,
    quickOpenIndex,
    quickOpenInputRef,
    quickOpenQuery,
    recentProjects,
    setApiKeyInputs,
    setProjectPathInput,
    setQuickOpenIndex,
    setQuickOpenQuery,
    setShowApiKeysModal,
    setShowOpenProjectModal,
    setShowQuickOpen,
    showApiKeysModal,
    showOpenProjectModal,
    showQuickOpen,
  } = useIde();

  return (
    <>
      {/* ── Open / Create Project Workspace Modal ─────────────────── */}
      {showOpenProjectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-xl max-w-[550px] w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded bg-raised border border-line flex items-center justify-center p-0.5 shadow-sm">
                  <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
                </div>
                <h3 className="text-lg font-mono font-bold text-fg">
                  Open or Create Folder / Project Workspace
                </h3>
              </div>
              <button aria-label="Close"
                onClick={() => setShowOpenProjectModal(false)}
                className="text-fg-subtle hover:text-fg-soft p-1 cursor-pointer"
              >
                <Icons.Close />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-mono text-fg-muted">
                Enter local folder path:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={projectPathInput}
                  onChange={(e) => setProjectPathInput(e.target.value)}
                  placeholder="e.g. C:/projects/my-app or /home/me/my-app"
                  className="flex-1 bg-canvas border border-line rounded-lg px-3 py-2 text-sm font-mono text-fg focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => handleOpenProject(projectPathInput, false)}
                  className="bg-selected hover:bg-[#334155] text-fg-soft px-3.5 py-2 rounded-lg text-sm font-mono font-semibold transition-all cursor-pointer border border-[#334155]"
                >
                  Open
                </button>
                <button
                  onClick={() => handleOpenProject(projectPathInput, true)}
                  title="Create folder and initialize project if missing"
                  className="bg-accent-strong hover:bg-accent-hover text-white px-3.5 py-2 rounded-lg text-sm font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Icons.Sparkles />
                  <span>Create & Open</span>
                </button>
              </div>
            </div>

            {recentProjects.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-line-subtle">
                <div className="text-xs font-mono text-fg-subtle uppercase tracking-wider">
                  Recent Workspaces:
                </div>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
                  {recentProjects.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => handleOpenProject(p, false)}
                      className="w-full text-left p-2 rounded bg-canvas hover:bg-raised border border-line hover:border-accent/40 text-sm font-mono text-fg-muted hover:text-accent-fg transition-colors truncate flex items-center gap-2 cursor-pointer"
                    >
                      <Icons.FolderClosed />
                      <span className="truncate">{p}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowOpenProjectModal(false)}
                className="bg-raised hover:bg-overlay text-fg-muted px-4 py-1.5 rounded-lg text-sm font-mono cursor-pointer border border-line"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cloud LLM API Keys Settings Modal ──────────────────── */}
      {showApiKeysModal && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setShowApiKeysModal(false)}
        >
          <div 
            className="bg-surface border border-line rounded-xl max-w-[520px] w-full shadow-2xl overflow-hidden shadow-black/80 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-line-subtle bg-canvas flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span className="text-base font-mono font-bold text-fg">Cloud LLM API Keys</span>
              </div>
              <button aria-label="Close" onClick={() => setShowApiKeysModal(false)} className="text-fg-subtle hover:text-fg-soft cursor-pointer">
                <Icons.Close />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[480px] overflow-y-auto custom-scrollbar">
              <p className="text-xs font-mono text-fg-subtle leading-relaxed">
                Configure API keys for cloud LLM providers. Keys are stored persistently on the server and remain until manually cleared.
              </p>

              {/* OpenAI */}
              <div className="border border-line rounded-lg p-3 bg-canvas space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
                    <span className="text-sm font-mono font-bold text-fg">OpenAI</span>
                    <span className="text-xs font-mono text-fg-subtle">gpt-4.1 / o3 / o4-mini</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKeyTestStatus.openai?.status === 'ok' && (
                      <span className="text-xs font-mono text-success bg-success/10 px-2 py-0.5 rounded">Connected ({apiKeyTestStatus.openai.latency}ms)</span>
                    )}
                    {apiKeyTestStatus.openai?.status === 'error' && (
                      <span className="text-xs font-mono text-danger bg-danger/10 px-2 py-0.5 rounded max-w-[180px] truncate" title={apiKeyTestStatus.openai.message}>{apiKeyTestStatus.openai.message}</span>
                    )}
                    {apiKeys.openai?.configured && !apiKeyTestStatus.openai?.status && (
                      <span className="text-xs font-mono text-success bg-success/10 px-2 py-0.5 rounded">Active: {apiKeys.openai.masked_key}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeyInputs.openai || ''}
                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, openai: e.target.value }))}
                    placeholder={apiKeys.openai?.configured ? 'Key configured — enter new to replace' : 'sk-...'}
                    className="flex-1 bg-raised text-xs font-mono text-fg px-2.5 py-1.5 rounded border border-line focus:outline-none focus:border-accent placeholder-fg-subtle"
                  />
                  <button onClick={() => handleSaveApiKey('openai')} className="text-xs font-mono bg-selected hover:bg-accent text-accent-fg hover:text-white px-3 py-1.5 rounded border border-accent/40 cursor-pointer transition-colors">
                    {apiKeySaveStatus.openai || 'Save'}
                  </button>
                  <button 
                    onClick={() => handleTestApiKey('openai')}
                    disabled={apiKeyTestStatus.openai?.status === 'testing' || (!apiKeys.openai?.configured && !apiKeyInputs.openai?.trim())}
                    className="text-xs font-mono bg-raised hover:bg-selected text-fg-muted hover:text-fg disabled:opacity-40 px-2.5 py-1.5 rounded border border-line cursor-pointer transition-colors"
                  >
                    {apiKeyTestStatus.openai?.status === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  {apiKeys.openai?.configured && (
                    <button onClick={() => handleClearApiKey('openai')} className="text-xs font-mono text-danger hover:bg-danger/10 px-2 py-1.5 rounded border border-danger/30 cursor-pointer transition-colors">Clear</button>
                  )}
                </div>
              </div>

              {/* Anthropic */}
              <div className="border border-line rounded-lg p-3 bg-canvas space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                    <span className="text-sm font-mono font-bold text-fg">Anthropic</span>
                    <span className="text-xs font-mono text-fg-subtle">claude-sonnet-4 / claude-haiku-4</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKeyTestStatus.anthropic?.status === 'ok' && (
                      <span className="text-xs font-mono text-success bg-success/10 px-2 py-0.5 rounded">Connected ({apiKeyTestStatus.anthropic.latency}ms)</span>
                    )}
                    {apiKeyTestStatus.anthropic?.status === 'error' && (
                      <span className="text-xs font-mono text-danger bg-danger/10 px-2 py-0.5 rounded max-w-[180px] truncate" title={apiKeyTestStatus.anthropic.message}>{apiKeyTestStatus.anthropic.message}</span>
                    )}
                    {apiKeys.anthropic?.configured && !apiKeyTestStatus.anthropic?.status && (
                      <span className="text-xs font-mono text-warning bg-warning/10 px-2 py-0.5 rounded">Active: {apiKeys.anthropic.masked_key}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeyInputs.anthropic || ''}
                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, anthropic: e.target.value }))}
                    placeholder={apiKeys.anthropic?.configured ? 'Key configured — enter new to replace' : 'sk-ant-...'}
                    className="flex-1 bg-raised text-xs font-mono text-fg px-2.5 py-1.5 rounded border border-line focus:outline-none focus:border-accent placeholder-fg-subtle"
                  />
                  <button onClick={() => handleSaveApiKey('anthropic')} className="text-xs font-mono bg-selected hover:bg-accent text-accent-fg hover:text-white px-3 py-1.5 rounded border border-accent/40 cursor-pointer transition-colors">
                    {apiKeySaveStatus.anthropic || 'Save'}
                  </button>
                  <button 
                    onClick={() => handleTestApiKey('anthropic')}
                    disabled={apiKeyTestStatus.anthropic?.status === 'testing' || (!apiKeys.anthropic?.configured && !apiKeyInputs.anthropic?.trim())}
                    className="text-xs font-mono bg-raised hover:bg-selected text-fg-muted hover:text-fg disabled:opacity-40 px-2.5 py-1.5 rounded border border-line cursor-pointer transition-colors"
                  >
                    {apiKeyTestStatus.anthropic?.status === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  {apiKeys.anthropic?.configured && (
                    <button onClick={() => handleClearApiKey('anthropic')} className="text-xs font-mono text-danger hover:bg-danger/10 px-2 py-1.5 rounded border border-danger/30 cursor-pointer transition-colors">Clear</button>
                  )}
                </div>
              </div>

              {/* Google Gemini */}
              <div className="border border-line rounded-lg p-3 bg-canvas space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    <span className="text-sm font-mono font-bold text-fg">Google Gemini</span>
                    <span className="text-xs font-mono text-fg-subtle">gemini-3.7-flash / gemini-3.1-pro / gemini-3.5-flash</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKeyTestStatus.gemini?.status === 'ok' && (
                      <span className="text-xs font-mono text-success bg-success/10 px-2 py-0.5 rounded">Connected ({apiKeyTestStatus.gemini.latency}ms)</span>
                    )}
                    {apiKeyTestStatus.gemini?.status === 'error' && (
                      <span className="text-xs font-mono text-danger bg-danger/10 px-2 py-0.5 rounded max-w-[180px] truncate" title={apiKeyTestStatus.gemini.message}>{apiKeyTestStatus.gemini.message}</span>
                    )}
                    {apiKeys.gemini?.configured && !apiKeyTestStatus.gemini?.status && (
                      <span className="text-xs font-mono text-[#818cf8] bg-[#818cf8]/10 px-2 py-0.5 rounded">Active: {apiKeys.gemini.masked_key}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeyInputs.gemini || ''}
                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, gemini: e.target.value }))}
                    placeholder={apiKeys.gemini?.configured ? 'Key configured — enter new to replace' : 'AIza...'}
                    className="flex-1 bg-raised text-xs font-mono text-fg px-2.5 py-1.5 rounded border border-line focus:outline-none focus:border-accent placeholder-fg-subtle"
                  />
                  <button onClick={() => handleSaveApiKey('gemini')} className="text-xs font-mono bg-selected hover:bg-accent text-accent-fg hover:text-white px-3 py-1.5 rounded border border-accent/40 cursor-pointer transition-colors">
                    {apiKeySaveStatus.gemini || 'Save'}
                  </button>
                  <button 
                    onClick={() => handleTestApiKey('gemini')}
                    disabled={apiKeyTestStatus.gemini?.status === 'testing' || (!apiKeys.gemini?.configured && !apiKeyInputs.gemini?.trim())}
                    className="text-xs font-mono bg-raised hover:bg-selected text-fg-muted hover:text-fg disabled:opacity-40 px-2.5 py-1.5 rounded border border-line cursor-pointer transition-colors"
                  >
                    {apiKeyTestStatus.gemini?.status === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  {apiKeys.gemini?.configured && (
                    <button onClick={() => handleClearApiKey('gemini')} className="text-xs font-mono text-danger hover:bg-danger/10 px-2 py-1.5 rounded border border-danger/30 cursor-pointer transition-colors">Clear</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Open (Ctrl+P) Search Modal ────────────────────── */}
      {showQuickOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-start justify-center pt-24 p-4"
          onClick={() => setShowQuickOpen(false)}
        >
          <div 
            className="bg-surface border border-line rounded-xl max-w-[620px] w-full shadow-2xl overflow-hidden shadow-black/80 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-line-subtle bg-canvas flex items-center gap-2">
              <span className="text-accent-fg"><Icons.Search /></span>
              <input
                ref={quickOpenInputRef}
                type="text"
                value={quickOpenQuery}
                onChange={(e) => {
                  setQuickOpenQuery(e.target.value);
                  setQuickOpenIndex(0);
                }}
                onKeyDown={(e) => {
                  const filtered = allFiles.filter(f => 
                    !quickOpenQuery.trim() || 
                    f.path.toLowerCase().includes(quickOpenQuery.toLowerCase()) || 
                    f.name.toLowerCase().includes(quickOpenQuery.toLowerCase())
                  );
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setQuickOpenIndex(prev => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setQuickOpenIndex(prev => Math.max(0, prev - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filtered.length > 0 && filtered[quickOpenIndex]) {
                      handleOpenFile(filtered[quickOpenIndex].path);
                      setShowQuickOpen(false);
                    } else if (quickOpenQuery.trim()) {
                      handleOpenFile(quickOpenQuery.trim());
                      setShowQuickOpen(false);
                    }
                  } else if (e.key === 'Escape') {
                    setShowQuickOpen(false);
                  }
                }}
                placeholder="Type a file name or path across all drives (e.g. main.py, C:/projects/app/test.py)..."
                className="w-full bg-transparent text-base font-mono text-fg focus:outline-none placeholder-fg-subtle"
              />
              <span className="text-xs font-mono text-fg-subtle bg-raised px-2 py-0.5 rounded border border-line">
                ESC to close
              </span>
            </div>

            <div className="max-h-[340px] overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
              {(() => {
                const filtered = allFiles.filter(f => 
                  !quickOpenQuery.trim() || 
                  f.path.toLowerCase().includes(quickOpenQuery.toLowerCase()) || 
                  f.name.toLowerCase().includes(quickOpenQuery.toLowerCase())
                );
                if (filtered.length === 0) {
                  return (
                    <div className="p-4 text-center text-sm font-mono text-fg-subtle space-y-2">
                      <div>No matching files found in workspace tree.</div>
                      {quickOpenQuery.trim() && (
                        <button
                          onClick={() => {
                            handleOpenFile(quickOpenQuery.trim());
                            setShowQuickOpen(false);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-selected hover:bg-accent text-accent-fg hover:text-white border border-accent/40 transition-colors text-xs cursor-pointer"
                        >
                          <Icons.FileCode />
                          <span>Open "{quickOpenQuery.trim()}" from disk</span>
                        </button>
                      )}
                    </div>
                  );
                }
                return filtered.slice(0, 50).map((file, idx) => {
                  const isSelected = idx === quickOpenIndex;
                  return (
                    <div
                      key={file.path}
                      onClick={() => {
                        handleOpenFile(file.path);
                        setShowQuickOpen(false);
                      }}
                      onMouseEnter={() => setQuickOpenIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer font-mono text-sm transition-colors ${
                        isSelected 
                          ? 'bg-selected text-accent-fg border border-accent/30' 
                          : 'text-fg-muted hover:bg-raised hover:text-fg'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {getFileIcon(file.name)}
                        <span className="font-medium text-fg">{file.name}</span>
                        <span className="text-xs text-fg-subtle truncate">{file.path}</span>
                      </div>
                      <span className="text-xs text-fg-subtle uppercase font-bold">{file.extension || 'file'}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

    </>
  );
}
