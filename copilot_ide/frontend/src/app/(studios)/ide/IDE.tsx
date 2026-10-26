"use client";
import React, { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseIdeLink, replaceQuery } from '@/lib/deepLinks';
import { Icons } from '../../components/Icons';
import CodeKnowledgeGraph from '../../components/CodeKnowledgeGraph';
import SourcegraphIndexDrawer from '../../components/SourcegraphIndexDrawer';
import GitHubOpenModal from '../../components/GitHubOpenModal';
import AutoForkPromptModal from '../../components/AutoForkPromptModal';
import { useModels } from '../ModelsContext';
import { API_BASE } from '@/lib/api';
import { IdeContext, Ide, IdeProps } from './IdeContext';
import { useIdeStore } from './useIdeStore';
import { useApiKeys } from './useApiKeys';
import { useEditorActions } from './useEditorActions';
import { useProjectActions } from './useProjectActions';
import { useTerminalActions } from './useTerminalActions';
import { useAgentChat } from './useAgentChat';
import { Sidebar } from './Sidebar';
import { EditorPane } from './EditorPane';
import { AgentChat } from './AgentChat';
import { IdeDialogs } from './IdeDialogs';
import { useCommand } from '../../components/commandsContext';

/* -- VS Code Style Archon Agent IDE Workspace ---------------- */
function VSCodeAgentIDE(props: IdeProps) {
  const store = useIdeStore();
  const base = { ...props, ...store };
  const apiKeys = useApiKeys(base);
  const editor = useEditorActions(base);
  const project = useProjectActions({ ...base, ...apiKeys, ...editor });
  const terminal = useTerminalActions(base);
  const agent = useAgentChat({ ...base, ...editor });
  const ide: Ide = { ...base, ...apiKeys, ...editor, ...project, ...terminal, ...agent };

  const {
    activeFlowSequence,
    activeFlowSteps,
    activeTab,
    apiBase,
    currentGitHubBranch,
    currentProjectName,
    currentProjectPath,
    cursorPos,
    gitBranch,
    githubRepoInfo,
    githubToken,
    handleOpenFile,
    isGitHubWorkspace,
    knowledgeGraphData,
    selectedModel,
    setActiveFlowSequence,
    setActiveFlowSteps,
    setActiveTabPath,
    setCurrentGitHubBranch,
    setCurrentProjectName,
    setEditorContent,
    setGitBranch,
    setGithubRepoInfo,
    setGithubToken,
    setIsGitHubWorkspace,
    setKnowledgeGraphData,
    setOpenTabs,
    setShowAutoForkModal,
    setShowBottomPanel,
    setShowGitHubModal,
    setShowIndexDrawer,
    setShowKnowledgeGraph,
    setWorkspaceTree,
    showAutoForkModal,
    showBottomPanel,
    showGitHubModal,
    showIndexDrawer,
    showKnowledgeGraph,
  } = ide;

  // Deep link: open the file (and line) once its project has loaded
  const deepLinkDone = useRef(!props.deepLink?.file);
  const { activeTabPath, loadingTree, setPendingReveal } = ide;
  useEffect(() => {
    const link = props.deepLink;
    if (deepLinkDone.current || !link?.file || !currentProjectPath || loadingTree) return;
    deepLinkDone.current = true;
    handleOpenFile(link.file).then(opened => {
      if (opened && link.line) setPendingReveal({ path: opened, line: link.line });
    });
  }, [currentProjectPath, loadingTree, props.deepLink, handleOpenFile, setPendingReveal]);

  // Keep the URL pointing at what's open, so it can be copied or bookmarked
  useEffect(() => {
    if (!deepLinkDone.current || isGitHubWorkspace) return;
    replaceQuery({ project: currentProjectPath || undefined, file: activeTabPath || undefined });
  }, [currentProjectPath, activeTabPath, isGitHubWorkspace]);

  useCommand('workspace.openFolder', { run: () => ide.setShowOpenProjectModal(true) });
  useCommand('workspace.openGitHub', { run: () => setShowGitHubModal(true) });
  useCommand('workspace.quickOpen', { run: () => ide.setShowQuickOpen(true) });
  useCommand('workspace.index', { run: () => setShowIndexDrawer(true) });
  useCommand('workspace.graph', { run: () => setShowKnowledgeGraph(true) });
  useCommand('editor.save', { run: () => ide.handleSaveFile() });
  useCommand('editor.closeTab', { run: () => activeTabPath && ide.handleCloseTab(activeTabPath) });
  useCommand('terminal.toggle', { run: () => setShowBottomPanel(!showBottomPanel) });
  useCommand('chat.new', { run: () => ide.handleNewChat() });
  useCommand('chat.focus', { run: () => ide.agentInputRef.current?.focus() });
  useCommand('settings.apiKeys', {
    run: () => {
      ide.setShowApiKeysModal(true);
      ide.fetchApiKeyStatus();
    },
  });

  return (
    <IdeContext.Provider value={ide}>
    <div className="flex flex-col h-full w-full bg-canvas text-fg-soft overflow-hidden border-0">
      
      {/* Main Workspace Row */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <EditorPane />
        <AgentChat />
      </div>

      {/* ── 5. Status Bar (Bottom, 24px) ──────────────────────────── */}
      <div className="h-[24px] bg-canvas border-t border-line-subtle px-3 flex justify-between items-center text-xs font-mono text-fg-subtle flex-shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span className="text-accent-fg flex items-center gap-1 font-medium">
            ⎇ {gitBranch} ({currentProjectName})
          </span>
          {activeTab && (
            <span>
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
          )}
          <span>UTF-8</span>
          <span>Spaces: 2</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowBottomPanel(!showBottomPanel)}
            className="hover:text-fg-soft cursor-pointer flex items-center gap-1"
          >
            <Icons.Terminal />
            <span>{showBottomPanel ? '▾ Panel' : '▸ Panel'}</span>
          </button>
          <span className="text-success flex items-center gap-1">
            ● Archon: {selectedModel} (GPU)
          </span>
        </div>
      </div>

      <IdeDialogs />

      {/* ── Sourcegraph SCIP Indexing Drawer ───────────────────────── */}
      <SourcegraphIndexDrawer
        isOpen={showIndexDrawer}
        onClose={() => setShowIndexDrawer(false)}
        projectName={currentProjectName}
        apiBase={apiBase}
        workspacePath={currentProjectPath}
        isGitHubWorkspace={isGitHubWorkspace}
        githubRepoInfo={githubRepoInfo}
        githubToken={githubToken}
        currentGitHubBranch={currentGitHubBranch}
        onIndexingComplete={(data) => {
          setKnowledgeGraphData(data);
        }}
        onOpenGraph={() => setShowKnowledgeGraph(true)}
      />

      {/* ── Interactive 60fps Canvas Knowledge Graph Visualizer ────── */}
      {showKnowledgeGraph && (
        <CodeKnowledgeGraph
          graphData={knowledgeGraphData}
          onClose={() => {
            setShowKnowledgeGraph(false);
            setActiveFlowSequence(null);
            setActiveFlowSteps(null);
          }}
          onOpenFile={(path) => {
            handleOpenFile(path);
          }}
          activeFlowSequence={activeFlowSequence}
          activeFlowSteps={activeFlowSteps}
        />
      )}

      {/* ── Remote GitHub Workspace Modal ─────────────────────────── */}
      <GitHubOpenModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        apiBase={apiBase}
        onOpenRepo={(info, branch, tree, token) => {
          setGithubRepoInfo(info);
          setGithubToken(token);
          setIsGitHubWorkspace(true);
          setCurrentGitHubBranch(branch);
          setCurrentProjectName(info.full_name);
          setGitBranch(branch);
          setWorkspaceTree(tree);
          setOpenTabs([]);
          setActiveTabPath('');
          setEditorContent('');
        }}
        onForkNeeded={(info, token) => {
          setGithubRepoInfo(info);
          setGithubToken(token);
          setShowAutoForkModal(true);
        }}
      />

      {/* ── Auto-Fork Prompt Modal ─────────────────────────────────── */}
      <AutoForkPromptModal
        isOpen={showAutoForkModal}
        onClose={() => setShowAutoForkModal(false)}
        repoInfo={githubRepoInfo}
        token={githubToken}
        apiBase={apiBase}
        onForkSuccess={async (forkOwner, forkRepo, defaultBranch) => {
          try {
            const res = await fetch(`${apiBase}/api/github/open-repo`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                repo_url: `${forkOwner}/${forkRepo}`,
                token: githubToken,
                branch: defaultBranch
              })
            });
            if (res.ok) {
              const data = await res.json();
              setGithubRepoInfo(data.repo_info);
              setIsGitHubWorkspace(true);
              setCurrentGitHubBranch(data.branch);
              setCurrentProjectName(data.repo_info.full_name);
              setGitBranch(data.branch);
              setWorkspaceTree(data.tree);
              setOpenTabs([]);
              setActiveTabPath('');
              setEditorContent('');
            }
          } catch (e) {
            console.error("Failed to open forked repository", e);
          }
        }}
        onContinueReadOnly={async () => {
          if (githubRepoInfo) {
            try {
              const res = await fetch(`${apiBase}/api/github/open-repo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  repo_url: githubRepoInfo.full_name,
                  token: githubToken || undefined,
                  branch: githubRepoInfo.default_branch
                })
              });
              if (res.ok) {
                const data = await res.json();
                setIsGitHubWorkspace(true);
                setCurrentGitHubBranch(data.branch);
                setCurrentProjectName(data.repo_info.full_name);
                setGitBranch(data.branch);
                setWorkspaceTree(data.tree);
                setOpenTabs([]);
                setActiveTabPath('');
                setEditorContent('');
              }
            } catch (e) {
              console.error("Failed to open read-only repository", e);
            }
          }
        }}
      />
    </div>
    </IdeContext.Provider>
  );
}

/* -- IDE route: the agent IDE bound to the shared model selection - */
export function IdeStudio() {
  const { models, setModels, selectedModel, setSelectedModel } = useModels();
  const searchParams = useSearchParams();
  // Read once: later URL updates come from the IDE itself
  const [deepLink] = React.useState(() => parseIdeLink(searchParams));
  return (
    <VSCodeAgentIDE
      apiBase={API_BASE}
      deepLink={deepLink}
      models={models}
      setModels={setModels}
      selectedModel={selectedModel}
      setSelectedModel={setSelectedModel}
    />
  );
}
