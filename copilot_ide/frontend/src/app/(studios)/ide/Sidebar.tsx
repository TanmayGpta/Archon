"use client";
import React from 'react';
import { Icons, Glyph } from '../../components/Icons';
import { FileTree, InlineNameInput, type InlineNameEdit } from './FileTree';
import { useIde } from './IdeContext';
import { ResizeHandle, usePanelSize } from '../../components/ResizeHandle';
import { ErrorState, Skeleton } from '../../components/StateViews';

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
    isGitHubWorkspace,
    handleConfirmRename,
    cancelRename,
    renameTarget,
    renameValue,
    setRenameValue,
    workspaceError,
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
  const inlineEdit: InlineNameEdit | null = renameTarget
    ? {
        mode: 'rename',
        path: renameTarget,
        isDir: false,
        value: renameValue,
        onChange: setRenameValue,
        onConfirm: handleConfirmRename,
        onCancel: cancelRename,
      }
    : inlineCreateState
      ? {
          mode: 'create',
          path: inlineCreateState.parentPath,
          isDir: inlineCreateState.isDir,
          value: inlineCreateName,
          onChange: setInlineCreateName,
          onConfirm: handleConfirmInlineCreate,
          onCancel: () => setInlineCreateState(null),
        }
      : null;
  const startCreate = (parentPath: string, isDir: boolean) => {
    cancelRename();
    setInlineCreateState({ parentPath, isDir });
    setInlineCreateName('');
  };
  const panel = usePanelSize('ide.sidebar', { initial: 260, min: 180, max: 560 });

  return (
    <>
      {/* ── 1. Activity Bar (Left, 46px) ────────────────────────── */}
      <div className="w-[46px] bg-canvas border-r border-line-subtle flex flex-col items-center py-2.5 justify-between z-10 flex-shrink-0 select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-panel bg-raised border border-line flex items-center justify-center p-1" title="Archon Workspace">
            <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
          </div>
          <button
            onClick={() => setActiveActivity('explorer')}
            title="File Explorer (Ctrl+Shift+E)" aria-label="File Explorer (Ctrl+Shift+E)"
            className={`w-8 h-8 rounded-control flex items-center justify-center transition-all cursor-pointer ${
              activeActivity === 'explorer'
                ? 'bg-raised text-accent-fg border border-accent/30 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                : 'text-fg-subtle hover:text-fg-soft hover:bg-surface'
            }`}
          >
            <Icons.Explorer />
          </button>
          <button
            onClick={() => setActiveActivity('search')}
            title="Search Workspace (Ctrl+Shift+F)" aria-label="Search Workspace (Ctrl+Shift+F)"
            className={`w-8 h-8 rounded-control flex items-center justify-center transition-all cursor-pointer ${
              activeActivity === 'search'
                ? 'bg-raised text-accent-fg border border-accent/30'
                : 'text-fg-subtle hover:text-fg-soft hover:bg-surface'
            }`}
          >
            <Icons.Search />
          </button>
          <button
            onClick={() => setActiveActivity('copilot')}
            title="Archon Agent Chat" aria-label="Archon Agent Chat"
            className={`w-8 h-8 rounded-control flex items-center justify-center transition-all cursor-pointer ${
              activeActivity === 'copilot'
                ? 'bg-raised text-accent-fg border border-accent/30'
                : 'text-fg-subtle hover:text-fg-soft hover:bg-surface'
            }`}
          >
            <Icons.ArchonAI />
          </button>
          <button
            onClick={() => setActiveActivity('diagnostics')}
            title="Health & Diagnostics" aria-label="Health & Diagnostics"
            className={`w-8 h-8 rounded-control flex items-center justify-center transition-all cursor-pointer ${
              activeActivity === 'diagnostics'
                ? 'bg-raised text-accent-fg border border-accent/30'
                : 'text-fg-subtle hover:text-fg-soft hover:bg-surface'
            }`}
          >
            <Icons.Diagnostics />
          </button>
        </div>

      </div>


      {/* ── 2. Sidebar (Explorer / Search, resizable) ──────────────── */}
      <div style={{ width: panel.size }} className="bg-surface border-r border-line-subtle flex flex-col flex-shrink-0 overflow-hidden select-none">
        
        {/* Project Title Bar & Explorer Actions Toolbar */}
        <div className="px-3 py-2 border-b border-line-subtle flex justify-between items-center bg-canvas">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-xs font-mono font-bold tracking-wider text-fg uppercase truncate max-w-[105px]" title={currentProjectPath}>
              {currentProjectName || 'No folder open'}
            </span>
          </div>
          
          {/* VS Code Style Action Icons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => startCreate('', false)}
              title="New File..." aria-label="New File..."
              className="text-fg-subtle hover:text-accent-fg p-1 rounded-control hover:bg-overlay cursor-pointer"
            >
              <Icons.FilePlus />
            </button>
            <button
              onClick={() => startCreate('', true)}
              title="New Folder..." aria-label="New Folder..."
              className="text-fg-subtle hover:text-accent-fg p-1 rounded-control hover:bg-overlay cursor-pointer"
            >
              <Icons.FolderPlus />
            </button>
            <button
              onClick={() => fetchProjectsAndTree()}
              title="Refresh Explorer" aria-label="Refresh Explorer"
              className="text-fg-subtle hover:text-fg-soft p-1 rounded-control hover:bg-overlay cursor-pointer"
            >
              <Icons.Refresh />
            </button>
            <button
              onClick={() => {
                setProjectPathInput(currentProjectPath);
                setShowOpenProjectModal(true);
              }}
              title="Open Folder / Switch Workspace..." aria-label="Open Folder / Switch Workspace..."
              className="text-fg-subtle hover:text-accent-fg p-1 rounded-control hover:bg-overlay cursor-pointer ml-0.5"
            >
              <Icons.FolderClosed />
            </button>
            <button
              onClick={() => setShowGitHubModal(true)}
              title="Open Remote GitHub Repository (Clone-Free)" aria-label="Open Remote GitHub Repository (Clone-Free)"
              className="text-fg-subtle hover:text-white p-1 rounded-control hover:bg-overlay cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </button>
            <button
              onClick={() => setShowIndexDrawer(true)}
              title="Index Codebase with SCIP & Knowledge Graph" aria-label="Index Codebase with SCIP & Knowledge Graph"
              className="text-cyan-400 hover:text-cyan-300 p-1 rounded-control hover:bg-overlay cursor-pointer"
            >
              <Glyph name="zap" />
            </button>
            <button
              onClick={() => setShowKnowledgeGraph(true)}
              title="View Codebase Knowledge Graph" aria-label="View Codebase Knowledge Graph"
              className="text-slate-400 hover:text-cyan-400 p-1 rounded-control hover:bg-overlay cursor-pointer"
            >
              <Glyph name="globe" />
            </button>
          </div>
        </div>

        {/* Quick Filter Input & Quick Open Ctrl+P Trigger */}
        <div className="p-2 border-b border-line-subtle/60 flex items-center gap-1.5">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter files..."
            className="flex-1 bg-canvas border border-line rounded-control px-2.5 py-1 text-xs font-mono text-fg-soft focus:outline-none focus:border-accent/50 placeholder-fg-subtle"
          />
          <button
            onClick={() => setShowQuickOpen(true)}
            title="Quick Open File (Ctrl+P)"
            className="bg-raised hover:bg-overlay text-fg-subtle hover:text-accent-fg px-1.5 py-1 rounded-control text-xs font-mono border border-line cursor-pointer flex-shrink-0"
          >
            Ctrl+P
          </button>
        </div>

        {/* Inline Creation Prompt at Root */}
        {inlineEdit?.mode === 'create' && inlineEdit.path === '' && (
          <div className="p-2 bg-raised border-b border-accent/30 flex items-center gap-1.5">
            <span className="text-accent-fg">
              {inlineEdit.isDir ? <Icons.FolderPlus /> : <Icons.FilePlus />}
            </span>
            <InlineNameInput edit={inlineEdit} />
          </div>
        )}

        {/* File Tree List */}
        <div className="flex-1 overflow-y-auto p-1.5 custom-scrollbar">
          {workspaceError && !loadingTree ? (
            <ErrorState compact title="Couldn't load the workspace" detail={workspaceError} onRetry={fetchProjectsAndTree} />
          ) : loadingTree && workspaceTree.length === 0 ? (
            <Skeleton rows={9} indent label="Loading files" />
          ) : workspaceTree.length > 0 ? (
            <FileTree
                nodes={workspaceTree}
                activePath={activeTabPath}
                inlineEdit={inlineEdit}
                onSelectFile={handleOpenFile}
                onDelete={handleDeleteItem}
                onRename={handleRenameItem}
                onNewFileInDir={p => startCreate(p, false)}
                onNewFolderInDir={p => startCreate(p, true)}
              />
          ) : (
            <div className="p-3 flex flex-col gap-2 text-xs text-fg-muted">
              {currentProjectPath || isGitHubWorkspace ? (
                <span>This folder is empty. Use the New File button above to add one.</span>
              ) : (
                <>
                  <span>No folder open.</span>
                  <button
                    onClick={() => setShowOpenProjectModal(true)}
                    className="self-start px-2.5 py-1 rounded-control border border-line text-fg-soft hover:bg-raised cursor-pointer"
                  >
                    Open folder
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <ResizeHandle
        edge="right"
        label="Resize explorer"
        size={panel.size}
        min={180}
        max={() => Math.min(560, window.innerWidth * 0.4)}
        onResize={panel.setSize}
        onReset={panel.reset}
      />

    </>
  );
}
