"use client";
import React from 'react';
import { Icons } from '../../components/Icons';
import { FileTreeNode } from './FileTree';
import { useIde } from './IdeContext';

/* -- Activity bar and file explorer - */
export function Sidebar() {
  const {
    activeActivity,
    activeTabPath,
    currentProjectName,
    currentProjectPath,
    fetchProjectsAndTree,
    filterQuery,
    handleConfirmInlineCreate,
    handleDeleteItem,
    handleOpenFile,
    handleRenameItem,
    inlineCreateName,
    inlineCreateState,
    loadingTree,
    setActiveActivity,
    setFilterQuery,
    setInlineCreateName,
    setInlineCreateState,
    setProjectPathInput,
    setShowGitHubModal,
    setShowIndexDrawer,
    setShowKnowledgeGraph,
    setShowOpenProjectModal,
    setShowQuickOpen,
    workspaceTree,
  } = useIde();

  return (
    <>
      {/* ── 1. Activity Bar (Left, 46px) ────────────────────────── */}
      <div className="w-[46px] bg-[#060708] border-r border-[#161922] flex flex-col items-center py-2.5 justify-between z-10 flex-shrink-0 select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-1 shadow-sm" title="Archon Workspace">
            <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
          </div>
          <button
            onClick={() => setActiveActivity('explorer')}
            title="File Explorer (Ctrl+Shift+E)"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              activeActivity === 'explorer'
                ? 'bg-[#12151c] text-[#60a5fa] border border-[#3b82f6]/30 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#0e1015]'
            }`}
          >
            <Icons.Explorer />
          </button>
          <button
            onClick={() => setActiveActivity('search')}
            title="Search Workspace (Ctrl+Shift+F)"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              activeActivity === 'search'
                ? 'bg-[#12151c] text-[#60a5fa] border border-[#3b82f6]/30'
                : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#0e1015]'
            }`}
          >
            <Icons.Search />
          </button>
          <button
            onClick={() => setActiveActivity('copilot')}
            title="Archon Agent Chat"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              activeActivity === 'copilot'
                ? 'bg-[#12151c] text-[#60a5fa] border border-[#3b82f6]/30'
                : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#0e1015]'
            }`}
          >
            <Icons.ArchonAI />
          </button>
          <button
            onClick={() => setActiveActivity('diagnostics')}
            title="Health & Diagnostics"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              activeActivity === 'diagnostics'
                ? 'bg-[#12151c] text-[#60a5fa] border border-[#3b82f6]/30'
                : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#0e1015]'
            }`}
          >
            <Icons.Diagnostics />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" title="online" />
        </div>
      </div>


      {/* ── 2. Sidebar (Explorer / Search, 260px) ────────────────── */}
      <div className="w-[260px] bg-[#0c0e12] border-r border-[#161922] flex flex-col flex-shrink-0 overflow-hidden select-none">
        
        {/* Project Title Bar & Explorer Actions Toolbar */}
        <div className="px-3 py-2 border-b border-[#161922] flex justify-between items-center bg-[#090b0e]">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-[11px] font-mono font-bold tracking-wider text-[#e2e5ea] uppercase truncate max-w-[105px]" title={currentProjectPath}>
              {currentProjectName || 'No folder open'}
            </span>
          </div>
          
          {/* VS Code Style Action Icons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setInlineCreateState({ parentPath: '', isDir: false });
                setInlineCreateName('');
              }}
              title="New File..."
              className="text-[#64748b] hover:text-[#60a5fa] p-1 rounded hover:bg-[#161922] cursor-pointer"
            >
              <Icons.FilePlus />
            </button>
            <button
              onClick={() => {
                setInlineCreateState({ parentPath: '', isDir: true });
                setInlineCreateName('');
              }}
              title="New Folder..."
              className="text-[#64748b] hover:text-[#60a5fa] p-1 rounded hover:bg-[#161922] cursor-pointer"
            >
              <Icons.FolderPlus />
            </button>
            <button
              onClick={() => fetchProjectsAndTree()}
              title="Refresh Explorer"
              className="text-[#64748b] hover:text-[#cbd5e1] p-1 rounded hover:bg-[#161922] cursor-pointer"
            >
              <Icons.Refresh />
            </button>
            <button
              onClick={() => {
                setProjectPathInput(currentProjectPath);
                setShowOpenProjectModal(true);
              }}
              title="Open Folder / Switch Workspace..."
              className="text-[#64748b] hover:text-[#60a5fa] p-1 rounded hover:bg-[#161922] cursor-pointer ml-0.5"
            >
              <Icons.FolderClosed />
            </button>
            <button
              onClick={() => setShowGitHubModal(true)}
              title="Open Remote GitHub Repository (Clone-Free)"
              className="text-[#64748b] hover:text-white p-1 rounded hover:bg-[#161922] cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </button>
            <button
              onClick={() => setShowIndexDrawer(true)}
              title="Index Codebase with SCIP & Knowledge Graph"
              className="text-cyan-400 hover:text-cyan-300 p-1 rounded hover:bg-[#161922] cursor-pointer"
            >
              ⚡
            </button>
            <button
              onClick={() => setShowKnowledgeGraph(true)}
              title="View Codebase Knowledge Graph"
              className="text-slate-400 hover:text-cyan-400 p-1 rounded hover:bg-[#161922] cursor-pointer"
            >
              🌐
            </button>
          </div>
        </div>

        {/* Quick Filter Input & Quick Open Ctrl+P Trigger */}
        <div className="p-2 border-b border-[#161922]/60 flex items-center gap-1.5">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter files..."
            className="flex-1 bg-[#08090a] border border-[#1a1e26] rounded px-2.5 py-1 text-[11px] font-mono text-[#cbd5e1] focus:outline-none focus:border-[#3b82f6]/50 placeholder-[#475569]"
          />
          <button
            onClick={() => setShowQuickOpen(true)}
            title="Quick Open File (Ctrl+P)"
            className="bg-[#12151c] hover:bg-[#1a1e26] text-[#64748b] hover:text-[#60a5fa] px-1.5 py-1 rounded text-[10px] font-mono border border-[#1e232e] cursor-pointer flex-shrink-0"
          >
            Ctrl+P
          </button>
        </div>

        {/* Inline Creation Prompt at Root */}
        {inlineCreateState && inlineCreateState.parentPath === '' && (
          <div className="p-2 bg-[#12151c] border-b border-[#3b82f6]/30 flex items-center gap-1.5">
            <span className="text-[#60a5fa]">
              {inlineCreateState.isDir ? <Icons.FolderPlus /> : <Icons.FilePlus />}
            </span>
            <input
              type="text"
              autoFocus
              value={inlineCreateName}
              onChange={(e) => setInlineCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmInlineCreate();
                if (e.key === 'Escape') setInlineCreateState(null);
              }}
              placeholder={inlineCreateState.isDir ? "Folder name..." : "File name..."}
              className="flex-1 bg-[#08090a] border border-[#3b82f6]/60 rounded px-2 py-0.5 text-[11px] font-mono text-white focus:outline-none"
            />
            <button
              onClick={handleConfirmInlineCreate}
              className="text-[10px] bg-[#3b82f6] text-white px-2 py-0.5 rounded font-mono cursor-pointer"
            >
              ✓
            </button>
            <button
              onClick={() => setInlineCreateState(null)}
              className="text-[10px] text-[#64748b] hover:text-white px-1 font-mono cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* File Tree List */}
        <div className="flex-1 overflow-y-auto p-1.5 custom-scrollbar">
          {loadingTree ? (
            <div className="p-4 text-[11px] font-mono text-[#64748b] flex items-center gap-2">
              <span className="animate-spin">⟳</span> Loading workspace...
            </div>
          ) : workspaceTree.length > 0 ? (
            workspaceTree.map(node => (
              <FileTreeNode
                key={node.path}
                node={node}
                activePath={activeTabPath}
                onSelectFile={handleOpenFile}
                onDelete={handleDeleteItem}
                onRename={handleRenameItem}
                onNewFileInDir={(p) => {
                  setInlineCreateState({ parentPath: p, isDir: false });
                  setInlineCreateName('');
                }}
                onNewFolderInDir={(p) => {
                  setInlineCreateState({ parentPath: p, isDir: true });
                  setInlineCreateName('');
                }}
              />
            ))
          ) : (
            <div className="p-4 text-[11px] font-mono text-[#64748b]">
              No files found in workspace.
            </div>
          )}
        </div>
      </div>

    </>
  );
}
