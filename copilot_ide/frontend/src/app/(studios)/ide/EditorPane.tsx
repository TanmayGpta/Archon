"use client";
import React from 'react';
import { Icons } from '../../components/Icons';
import { getFileIcon } from './FileTree';
import { ARCHON_ASCII_ART, highlightCodeLine } from './editorText';
import { useIde } from './IdeContext';
import { TerminalPanel } from './TerminalPanel';

/* -- Tabs, editor and the bottom panel - */
export function EditorPane() {
  const {
    activeTab,
    activeTabPath,
    currentProjectName,
    currentProjectPath,
    cursorPos,
    editorContent,
    foldedLines,
    gitBranch,
    gutterRef,
    handleCloseTab,
    handleEditorChange,
    handleEditorScroll,
    handleEditorSelection,
    handleKeyDown,
    handleOpenFile,
    handleOpenProject,
    handleSaveFile,
    isDirty,
    isGitHubWorkspace,
    knowledgeGraphData,
    lastAppliedNotice,
    openTabs,
    rawLines,
    recentProjects,
    saveStatus,
    setActiveTabPath,
    setEditorContent,
    setIsDirty,
    setLastAppliedNotice,
    setProjectPathInput,
    setShowGitHubModal,
    setShowIndexDrawer,
    setShowKnowledgeGraph,
    setShowOpenProjectModal,
    syntaxRef,
    textareaRef,
    toggleFold,
  } = useIde();

  return (
    <>
      {/* ── 3. Central Code Editor Panel (Flex-1) ────────────────── */}
      <div className="flex-1 flex flex-col bg-canvas overflow-hidden">
        
        {/* Tab Bar */}
        <div className="flex items-center bg-canvas border-b border-line-subtle overflow-x-auto custom-scrollbar flex-shrink-0 h-[38px] select-none">
          {openTabs.map(tab => {
            const isActive = tab.path === activeTabPath;
            const dirty = tab.content !== tab.original;
            return (
              <div
                key={tab.path}
                onClick={() => {
                  setActiveTabPath(tab.path);
                  setEditorContent(tab.content);
                  setIsDirty(dirty);
                }}
                className={`flex items-center gap-2 px-3.5 h-full border-r border-line-subtle cursor-pointer text-sm font-mono transition-colors relative group ${
                  isActive
                    ? 'bg-surface text-fg border-t-2 border-t-accent'
                    : 'text-fg-subtle hover:bg-surface hover:text-fg-muted'
                }`}
              >
                {getFileIcon(tab.name)}
                <span className="truncate max-w-[140px]">{tab.name}</span>
                {dirty && <span className="w-2 h-2 rounded-full bg-accent ml-1" title="Unsaved changes" />}
                <button aria-label={`Close ${tab.name}`}
                  onClick={(e) => handleCloseTab(tab.path, e)}
                  className="opacity-0 group-hover:opacity-100 hover:text-danger p-0.5 rounded transition-opacity ml-1"
                >
                  <Icons.Close />
                </button>
              </div>
            );
          })}
          {openTabs.length === 0 && (
            <div className="px-4 text-xs font-mono text-fg-subtle italic">
              Select a file from the explorer to open in editor
            </div>
          )}
        </div>

        {/* Archon Agent Auto-Apply Notification Bar */}
        {lastAppliedNotice && (
          <div className="bg-success/15 border-b border-success/30 px-4 py-1.5 text-sm font-mono text-success flex justify-between items-center animate-fade-in select-none">
            <div className="flex items-center gap-2">
              <span className="text-success flex items-center"><Icons.Sparkles /></span>
              <span>{lastAppliedNotice}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveFile}
                className="bg-success/20 hover:bg-success/35 text-success px-2 py-0.5 rounded border border-success/40 text-xs cursor-pointer font-semibold"
              >
                Save (Ctrl+S)
              </button>
              <button aria-label="Dismiss" onClick={() => setLastAppliedNotice(null)} className="hover:text-white cursor-pointer px-1">✕</button>
            </div>
          </div>
        )}

        {/* Breadcrumbs & Quick Toolbar */}
        {activeTab && (
          <div className="flex justify-between items-center px-4 py-1.5 bg-surface border-b border-line-subtle text-xs font-mono text-fg-subtle select-none">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-accent">{currentProjectName}</span>
              {activeTab.path.split('/').map((seg, i, arr) => (
                <React.Fragment key={i}>
                  <span>›</span>
                  <span className={i === arr.length - 1 ? 'text-fg font-medium' : ''}>{seg}</span>
                </React.Fragment>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {saveStatus && (
                <span className="text-xs text-success font-mono font-medium">
                  {saveStatus}
                </span>
              )}
              {isDirty && (
                <span className="text-xs text-warning font-mono flex items-center gap-1">
                  ● Unsaved
                </span>
              )}
              <button
                onClick={() => setShowIndexDrawer(true)}
                title="Index Codebase with SCIP & Knowledge Graph"
                className="bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 px-2.5 py-1 rounded text-xs font-mono transition-colors border border-cyan-800/40 cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <span>⚡ Index Codebase</span>
              </button>
              <button
                onClick={() => setShowKnowledgeGraph(true)}
                title="Open Knowledge Graph Visualizer"
                className="bg-raised hover:bg-overlay text-slate-300 px-2.5 py-1 rounded text-xs font-mono transition-colors border border-line-strong cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <span>🌐 Graph</span>
                {knowledgeGraphData?.nodes?.length ? (
                  <span className="text-xs px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                    {knowledgeGraphData.nodes.length}
                  </span>
                ) : null}
              </button>
              <button
                onClick={handleSaveFile}
                title="Save (Ctrl+S)"
                className="bg-selected hover:bg-[#334155] text-fg-soft px-2.5 py-1 rounded text-xs font-mono transition-colors border border-[#334155] cursor-pointer flex items-center gap-1.5"
              >
                <Icons.Save />
                <span>Save</span>
              </button>
            </div>
          </div>
        )}

        {/* Code Textarea & Gutter with Synchronized Scrolling */}
        {activeTab ? (
          <div className="flex-1 flex overflow-hidden relative font-mono text-base leading-[20px]">
            {/* Line Gutter with Folding Arrows */}
            <div
              ref={gutterRef}
              className="w-[54px] bg-canvas border-r border-line-subtle text-right py-3 px-1 text-sm font-mono text-fg-subtle select-none overflow-hidden leading-[20px] flex-shrink-0"
            >
              {rawLines.map((lineText, i) => {
                const isFoldable = /^(?:\s*)(?:def|class|function|async\s+function|const\s+\w+\s*=\s*(?:async\s*)?\(|if|elif|else|for|while|try|catch).*(?:\{|:)\s*$/.test(lineText);
                const isFolded = foldedLines[i];
                return (
                  <div key={i} className="flex items-center justify-end gap-1 px-1 h-[20px]">
                    {isFoldable ? (
                      <button
                        onClick={() => toggleFold(i)}
                        title={isFolded ? "Unfold block" : "Fold block"}
                        className="hover:text-accent-fg cursor-pointer text-xs p-0.5"
                      >
                        {isFolded ? '▸' : '▾'}
                      </button>
                    ) : (
                      <span className="w-2.5 inline-block" />
                    )}
                    <span className={cursorPos.line === i + 1 ? 'text-accent-fg font-bold' : ''}>
                      {i + 1}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Code Editor Container */}
            <div className="flex-1 relative overflow-hidden bg-canvas">
              {/* Syntax Highlight Overlay (Synchronized with Textarea Scroll) */}
              <div
                ref={syntaxRef}
                aria-hidden="true"
                className="absolute inset-0 p-3 pointer-events-none whitespace-pre overflow-hidden leading-[20px] select-none text-base font-mono font-normal"
              >
                {rawLines.map((lineText, i) => (
                  <div
                    key={i}
                    className={`h-[20px] leading-[20px] ${cursorPos.line === i + 1 ? 'bg-selected/25 rounded-sm' : ''}`}
                  >
                    {foldedLines[i] ? (
                      <span>
                        {highlightCodeLine(lineText)}
                        <span className="text-accent bg-selected/60 px-1.5 py-0.2 rounded border border-accent/30 ml-2 text-xs select-none">
                          ... folded
                        </span>
                      </span>
                    ) : (
                      highlightCodeLine(lineText)
                    )}
                  </div>
                ))}
              </div>

              {/* Actual Typing Input Textarea */}
              <textarea
                ref={textareaRef}
                value={editorContent}
                onChange={handleEditorChange}
                onScroll={handleEditorScroll}
                onKeyDown={handleKeyDown}
                onSelect={handleEditorSelection}
                onClick={handleEditorSelection}
                onKeyUp={handleEditorSelection}
                spellCheck={false}
                className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-accent-fg p-3 text-base font-mono leading-[20px] resize-none focus:outline-none custom-scrollbar select-text overflow-y-auto whitespace-pre tab-4 z-10 font-normal"
              />
            </div>
          </div>
        ) : !currentProjectPath && !isGitHubWorkspace ? (
          /* No project yet: offer the ways to open one */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-canvas select-none overflow-y-auto custom-scrollbar">
            <h3 className="text-lg font-semibold text-fg mb-1">No folder open</h3>
            <p className="text-sm text-fg-muted mb-5">Open a folder or a GitHub repository to start.</p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setProjectPathInput('');
                  setShowOpenProjectModal(true);
                }}
                className="bg-accent-strong hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm transition-all cursor-pointer font-semibold flex items-center gap-2 shadow-md"
              >
                <Icons.FolderClosed />
                <span>Open folder</span>
              </button>
              <button
                onClick={() => setShowGitHubModal(true)}
                className="bg-raised hover:bg-overlay text-fg-soft border border-line hover:border-accent/30 px-4 py-2 rounded-lg text-sm transition-all cursor-pointer flex items-center gap-2"
              >
                <Icons.GitHub />
                <span>Open from GitHub</span>
              </button>
            </div>

            {recentProjects.length > 0 && (
              <div className="mt-6 w-full max-w-[420px] text-left">
                <div className="text-xs text-fg-muted uppercase tracking-wider mb-2">Recent</div>
                <div className="space-y-1.5">
                  {recentProjects.map(p => (
                    <button
                      key={p}
                      onClick={() => handleOpenProject(p, false)}
                      className="w-full text-left p-2 rounded bg-canvas hover:bg-raised border border-line hover:border-accent/40 text-sm font-mono text-fg-muted hover:text-accent-fg transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Icons.FolderClosed />
                      <span className="truncate">{p}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-canvas select-none overflow-y-auto custom-scrollbar">
            {/* Pure Clean ASCII Art Display */}
            <div className="mb-4 flex justify-center items-center">
              <pre className="text-[8.5px] sm:text-[9.5px] md:text-[10px] font-mono font-bold leading-[11px] sm:leading-[12px] text-info/85 hover:text-info transition-colors select-none">
                {ARCHON_ASCII_ART}
              </pre>
            </div>

            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-mono font-bold text-fg">
                {currentProjectName} Workspace
              </h3>
              <span className="text-xs font-mono text-accent-fg px-1.5 py-0.2 bg-accent/10 rounded border border-accent/20">
                ⎇ {gitBranch}
              </span>
            </div>

            <p className="text-sm font-mono text-fg-subtle max-w-[420px] leading-relaxed mb-5 truncate" title={currentProjectPath}>
              Path: <span className="text-fg-muted">{currentProjectPath}</span>
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowOpenProjectModal(true)}
                className="bg-accent-strong hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-mono transition-all cursor-pointer font-semibold flex items-center gap-2 shadow-md"
              >
                <Icons.FolderPlus />
                <span>Open or Create Project...</span>
              </button>
              <button
                onClick={() => handleOpenFile('README.md')}
                className="bg-raised hover:bg-overlay text-fg-soft border border-line hover:border-accent/30 px-4 py-2 rounded-lg text-sm font-mono transition-all cursor-pointer flex items-center gap-2"
              >
                <Icons.FileCode />
                <span>Open README.md</span>
              </button>
            </div>
          </div>
        )}

        <TerminalPanel />
      </div>
    </>
  );
}
