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
          <div className="bg-[#0c0e12] border border-[#1a1e26] rounded-xl max-w-[550px] w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-[#1a1e26] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-0.5 shadow-sm">
                  <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
                </div>
                <h3 className="text-[14px] font-mono font-bold text-[#e2e5ea]">
                  Open or Create Folder / Project Workspace
                </h3>
              </div>
              <button
                onClick={() => setShowOpenProjectModal(false)}
                className="text-[#64748b] hover:text-[#cbd5e1] p-1 cursor-pointer"
              >
                <Icons.Close />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-[#8b949e]">
                Enter local folder path:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={projectPathInput}
                  onChange={(e) => setProjectPathInput(e.target.value)}
                  placeholder="e.g. C:/projects/my-app or /home/me/my-app"
                  className="flex-1 bg-[#08090a] border border-[#1a1e26] rounded-lg px-3 py-2 text-[12px] font-mono text-[#e2e5ea] focus:outline-none focus:border-[#3b82f6]"
                />
                <button
                  onClick={() => handleOpenProject(projectPathInput, false)}
                  className="bg-[#1e293b] hover:bg-[#334155] text-[#cbd5e1] px-3.5 py-2 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer border border-[#334155]"
                >
                  Open
                </button>
                <button
                  onClick={() => handleOpenProject(projectPathInput, true)}
                  title="Create folder and initialize project if missing"
                  className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-3.5 py-2 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Icons.Sparkles />
                  <span>Create & Open</span>
                </button>
              </div>
            </div>

            {recentProjects.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#161922]">
                <div className="text-[11px] font-mono text-[#64748b] uppercase tracking-wider">
                  Recent Workspaces:
                </div>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
                  {recentProjects.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => handleOpenProject(p, false)}
                      className="w-full text-left p-2 rounded bg-[#08090a] hover:bg-[#12151c] border border-[#1a1e26] hover:border-[#3b82f6]/40 text-[11.5px] font-mono text-[#8b949e] hover:text-[#60a5fa] transition-colors truncate flex items-center gap-2 cursor-pointer"
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
                className="bg-[#12151c] hover:bg-[#1a1e26] text-[#8b949e] px-4 py-1.5 rounded-lg text-[12px] font-mono cursor-pointer border border-[#1e232e]"
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
            className="bg-[#0c0e12] border border-[#1e232e] rounded-xl max-w-[520px] w-full shadow-2xl overflow-hidden shadow-black/80 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#161922] bg-[#090b0e] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span className="text-[13px] font-mono font-bold text-[#e2e5ea]">Cloud LLM API Keys</span>
              </div>
              <button onClick={() => setShowApiKeysModal(false)} className="text-[#64748b] hover:text-[#cbd5e1] cursor-pointer">
                <Icons.Close />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[480px] overflow-y-auto custom-scrollbar">
              <p className="text-[11px] font-mono text-[#64748b] leading-relaxed">
                Configure API keys for cloud LLM providers. Keys are stored persistently on the server and remain until manually cleared.
              </p>

              {/* OpenAI */}
              <div className="border border-[#1e232e] rounded-lg p-3 bg-[#090b0e] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
                    <span className="text-[12px] font-mono font-bold text-[#e2e5ea]">OpenAI</span>
                    <span className="text-[9px] font-mono text-[#475569]">gpt-4.1 / o3 / o4-mini</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKeyTestStatus.openai?.status === 'ok' && (
                      <span className="text-[9px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded">Connected ({apiKeyTestStatus.openai.latency}ms)</span>
                    )}
                    {apiKeyTestStatus.openai?.status === 'error' && (
                      <span className="text-[9px] font-mono text-[#ef4444] bg-[#ef4444]/10 px-2 py-0.5 rounded max-w-[180px] truncate" title={apiKeyTestStatus.openai.message}>{apiKeyTestStatus.openai.message}</span>
                    )}
                    {apiKeys.openai?.configured && !apiKeyTestStatus.openai?.status && (
                      <span className="text-[9px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded">Active: {apiKeys.openai.masked_key}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeyInputs.openai || ''}
                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, openai: e.target.value }))}
                    placeholder={apiKeys.openai?.configured ? 'Key configured — enter new to replace' : 'sk-...'}
                    className="flex-1 bg-[#12151c] text-[11px] font-mono text-[#e2e5ea] px-2.5 py-1.5 rounded border border-[#1e232e] focus:outline-none focus:border-[#3b82f6] placeholder-[#475569]"
                  />
                  <button onClick={() => handleSaveApiKey('openai')} className="text-[10px] font-mono bg-[#1e293b] hover:bg-[#3b82f6] text-[#60a5fa] hover:text-white px-3 py-1.5 rounded border border-[#3b82f6]/40 cursor-pointer transition-colors">
                    {apiKeySaveStatus.openai || 'Save'}
                  </button>
                  <button 
                    onClick={() => handleTestApiKey('openai')}
                    disabled={apiKeyTestStatus.openai?.status === 'testing' || (!apiKeys.openai?.configured && !apiKeyInputs.openai?.trim())}
                    className="text-[10px] font-mono bg-[#12151c] hover:bg-[#1e293b] text-[#94a3b8] hover:text-[#e2e5ea] disabled:opacity-40 px-2.5 py-1.5 rounded border border-[#1e232e] cursor-pointer transition-colors"
                  >
                    {apiKeyTestStatus.openai?.status === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  {apiKeys.openai?.configured && (
                    <button onClick={() => handleClearApiKey('openai')} className="text-[10px] font-mono text-[#ef4444] hover:bg-[#ef4444]/10 px-2 py-1.5 rounded border border-[#ef4444]/30 cursor-pointer transition-colors">Clear</button>
                  )}
                </div>
              </div>

              {/* Anthropic */}
              <div className="border border-[#1e232e] rounded-lg p-3 bg-[#090b0e] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                    <span className="text-[12px] font-mono font-bold text-[#e2e5ea]">Anthropic</span>
                    <span className="text-[9px] font-mono text-[#475569]">claude-sonnet-4 / claude-haiku-4</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKeyTestStatus.anthropic?.status === 'ok' && (
                      <span className="text-[9px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded">Connected ({apiKeyTestStatus.anthropic.latency}ms)</span>
                    )}
                    {apiKeyTestStatus.anthropic?.status === 'error' && (
                      <span className="text-[9px] font-mono text-[#ef4444] bg-[#ef4444]/10 px-2 py-0.5 rounded max-w-[180px] truncate" title={apiKeyTestStatus.anthropic.message}>{apiKeyTestStatus.anthropic.message}</span>
                    )}
                    {apiKeys.anthropic?.configured && !apiKeyTestStatus.anthropic?.status && (
                      <span className="text-[9px] font-mono text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded">Active: {apiKeys.anthropic.masked_key}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeyInputs.anthropic || ''}
                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, anthropic: e.target.value }))}
                    placeholder={apiKeys.anthropic?.configured ? 'Key configured — enter new to replace' : 'sk-ant-...'}
                    className="flex-1 bg-[#12151c] text-[11px] font-mono text-[#e2e5ea] px-2.5 py-1.5 rounded border border-[#1e232e] focus:outline-none focus:border-[#3b82f6] placeholder-[#475569]"
                  />
                  <button onClick={() => handleSaveApiKey('anthropic')} className="text-[10px] font-mono bg-[#1e293b] hover:bg-[#3b82f6] text-[#60a5fa] hover:text-white px-3 py-1.5 rounded border border-[#3b82f6]/40 cursor-pointer transition-colors">
                    {apiKeySaveStatus.anthropic || 'Save'}
                  </button>
                  <button 
                    onClick={() => handleTestApiKey('anthropic')}
                    disabled={apiKeyTestStatus.anthropic?.status === 'testing' || (!apiKeys.anthropic?.configured && !apiKeyInputs.anthropic?.trim())}
                    className="text-[10px] font-mono bg-[#12151c] hover:bg-[#1e293b] text-[#94a3b8] hover:text-[#e2e5ea] disabled:opacity-40 px-2.5 py-1.5 rounded border border-[#1e232e] cursor-pointer transition-colors"
                  >
                    {apiKeyTestStatus.anthropic?.status === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  {apiKeys.anthropic?.configured && (
                    <button onClick={() => handleClearApiKey('anthropic')} className="text-[10px] font-mono text-[#ef4444] hover:bg-[#ef4444]/10 px-2 py-1.5 rounded border border-[#ef4444]/30 cursor-pointer transition-colors">Clear</button>
                  )}
                </div>
              </div>

              {/* Google Gemini */}
              <div className="border border-[#1e232e] rounded-lg p-3 bg-[#090b0e] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    <span className="text-[12px] font-mono font-bold text-[#e2e5ea]">Google Gemini</span>
                    <span className="text-[9px] font-mono text-[#475569]">gemini-3.7-flash / gemini-3.1-pro / gemini-3.5-flash</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKeyTestStatus.gemini?.status === 'ok' && (
                      <span className="text-[9px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded">Connected ({apiKeyTestStatus.gemini.latency}ms)</span>
                    )}
                    {apiKeyTestStatus.gemini?.status === 'error' && (
                      <span className="text-[9px] font-mono text-[#ef4444] bg-[#ef4444]/10 px-2 py-0.5 rounded max-w-[180px] truncate" title={apiKeyTestStatus.gemini.message}>{apiKeyTestStatus.gemini.message}</span>
                    )}
                    {apiKeys.gemini?.configured && !apiKeyTestStatus.gemini?.status && (
                      <span className="text-[9px] font-mono text-[#818cf8] bg-[#818cf8]/10 px-2 py-0.5 rounded">Active: {apiKeys.gemini.masked_key}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeyInputs.gemini || ''}
                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, gemini: e.target.value }))}
                    placeholder={apiKeys.gemini?.configured ? 'Key configured — enter new to replace' : 'AIza...'}
                    className="flex-1 bg-[#12151c] text-[11px] font-mono text-[#e2e5ea] px-2.5 py-1.5 rounded border border-[#1e232e] focus:outline-none focus:border-[#3b82f6] placeholder-[#475569]"
                  />
                  <button onClick={() => handleSaveApiKey('gemini')} className="text-[10px] font-mono bg-[#1e293b] hover:bg-[#3b82f6] text-[#60a5fa] hover:text-white px-3 py-1.5 rounded border border-[#3b82f6]/40 cursor-pointer transition-colors">
                    {apiKeySaveStatus.gemini || 'Save'}
                  </button>
                  <button 
                    onClick={() => handleTestApiKey('gemini')}
                    disabled={apiKeyTestStatus.gemini?.status === 'testing' || (!apiKeys.gemini?.configured && !apiKeyInputs.gemini?.trim())}
                    className="text-[10px] font-mono bg-[#12151c] hover:bg-[#1e293b] text-[#94a3b8] hover:text-[#e2e5ea] disabled:opacity-40 px-2.5 py-1.5 rounded border border-[#1e232e] cursor-pointer transition-colors"
                  >
                    {apiKeyTestStatus.gemini?.status === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  {apiKeys.gemini?.configured && (
                    <button onClick={() => handleClearApiKey('gemini')} className="text-[10px] font-mono text-[#ef4444] hover:bg-[#ef4444]/10 px-2 py-1.5 rounded border border-[#ef4444]/30 cursor-pointer transition-colors">Clear</button>
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
            className="bg-[#0c0e12] border border-[#1e232e] rounded-xl max-w-[620px] w-full shadow-2xl overflow-hidden shadow-black/80 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-[#161922] bg-[#090b0e] flex items-center gap-2">
              <span className="text-[#60a5fa]"><Icons.Search /></span>
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
                className="w-full bg-transparent text-[12.5px] font-mono text-[#e2e5ea] focus:outline-none placeholder-[#475569]"
              />
              <span className="text-[10px] font-mono text-[#64748b] bg-[#12151c] px-2 py-0.5 rounded border border-[#1e232e]">
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
                    <div className="p-4 text-center text-[11.5px] font-mono text-[#64748b] space-y-2">
                      <div>No matching files found in workspace tree.</div>
                      {quickOpenQuery.trim() && (
                        <button
                          onClick={() => {
                            handleOpenFile(quickOpenQuery.trim());
                            setShowQuickOpen(false);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1e293b] hover:bg-[#3b82f6] text-[#60a5fa] hover:text-white border border-[#3b82f6]/40 transition-colors text-[11px] cursor-pointer"
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
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer font-mono text-[12px] transition-colors ${
                        isSelected 
                          ? 'bg-[#1a2234] text-[#60a5fa] border border-[#3b82f6]/30' 
                          : 'text-[#9ca3af] hover:bg-[#12151c] hover:text-[#e2e5ea]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {getFileIcon(file.name)}
                        <span className="font-medium text-[#e2e5ea]">{file.name}</span>
                        <span className="text-[10.5px] text-[#64748b] truncate">{file.path}</span>
                      </div>
                      <span className="text-[9.5px] text-[#475569] uppercase font-bold">{file.extension || 'file'}</span>
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
