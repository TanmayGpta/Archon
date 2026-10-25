"use client";
import { useState, useRef } from 'react';
import type { KnowledgeGraphData, FlowStep } from '../../components/CodeKnowledgeGraph';
import type { GitHubRepoInfo } from '../../components/GitHubOpenModal';
import type { ContextFileItem, SuggestedFileItem } from '../../components/ContextFileChips';
import type { TreeNode } from './FileTree';
import type { TerminalTab, AgentMessage } from './types';

/* -- All IDE state in one place; the action hooks and panels read it through IdeContext - */
export function useIdeStore() {
  // Project & Workspace State
  // No project until the user opens one (or a remembered one is reopened on load)
  const [currentProjectName, setCurrentProjectName] = useState('');
  const [currentProjectPath, setCurrentProjectPath] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [showOpenProjectModal, setShowOpenProjectModal] = useState(false);
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [showIndexDrawer, setShowIndexDrawer] = useState(false);
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false);
  const [knowledgeGraphData, setKnowledgeGraphData] = useState<KnowledgeGraphData | null>(null);
  const [activeFlowSequence, setActiveFlowSequence] = useState<string[] | null>(null);
  const [activeFlowSteps, setActiveFlowSteps] = useState<FlowStep[] | null>(null);
  
  // Remote Clone-Free GitHub Workspace State
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [showAutoForkModal, setShowAutoForkModal] = useState(false);
  const [githubRepoInfo, setGithubRepoInfo] = useState<GitHubRepoInfo | null>(null);
  const [githubToken, setGithubToken] = useState('');
  const [isGitHubWorkspace, setIsGitHubWorkspace] = useState(false);
  const [currentGitHubBranch, setCurrentGitHubBranch] = useState('main');
  const [remoteFileShas, setRemoteFileShas] = useState<Record<string, string>>({});

  const [apiKeys, setApiKeys] = useState<{[provider: string]: {configured: boolean; masked_key: string}}>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<{[provider: string]: string}>({openai: '', anthropic: '', gemini: ''});
  const [apiKeySaveStatus, setApiKeySaveStatus] = useState<{[provider: string]: string}>({});
  const [apiKeyTestStatus, setApiKeyTestStatus] = useState<{[provider: string]: {status: 'testing'|'ok'|'error'; latency?: number; message?: string}}>({});
  const [projectPathInput, setProjectPathInput] = useState('');
  
  // File Explorer State
  const [workspaceTree, setWorkspaceTree] = useState<TreeNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [inlineCreateState, setInlineCreateState] = useState<{ parentPath: string; isDir: boolean } | null>(null);
  const [inlineCreateName, setInlineCreateName] = useState('');
  
  // Quick Open (Ctrl+P) State
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [allFiles, setAllFiles] = useState<Array<{ name: string; path: string; extension: string }>>([]);
  const [quickOpenIndex, setQuickOpenIndex] = useState(0);
  const quickOpenInputRef = useRef<HTMLInputElement>(null);
  
  // Tabbed Editor State
  const [openTabs, setOpenTabs] = useState<{ path: string; name: string; content: string; original: string }[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string>('');
  const [editorContent, setEditorContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [foldedLines, setFoldedLines] = useState<Record<number, boolean>>({});
  const [lastAppliedNotice, setLastAppliedNotice] = useState<string | null>(null);
  
  // Synchronized Scroll Refs
  const gutterRef = useRef<HTMLDivElement>(null);
  const syntaxRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Layout & Activity State
  const [activeActivity, setActiveActivity] = useState<'explorer' | 'search' | 'copilot' | 'diagnostics'>('explorer');
  const [showBottomPanel, setShowBottomPanel] = useState<boolean>(true);
  const [bottomTab, setBottomTab] = useState<'terminal' | 'output' | 'diagnostics'>('terminal');

  // Interactive Multi-Terminal State
  const [terminals, setTerminals] = useState<TerminalTab[]>([
    {
      id: 'term-1',
      name: 'bash 1',
      history: [
        { type: 'system', text: `Archon Interactive Shell v2.0 initialized. Type any command (e.g. ls, git status, npm test, python)...` }
      ],
      commandHistory: [],
      historyIndex: -1,
      input: '',
      cwd: ''
    }
  ]);
  const [activeTermId, setActiveTermId] = useState('term-1');
  const [executingCmd, setExecutingCmd] = useState(false);
  const [terminalCopied, setTerminalCopied] = useState(false);
  const termScrollRef = useRef<HTMLDivElement>(null);
  const termInputRef = useRef<HTMLInputElement>(null);

  // Archon Agent Multi-Turn Chat & Auto-Apply State
  const [autoApplyEdits, setAutoApplyEdits] = useState<boolean>(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Ask for a change, or drag files here to add context."
    }
  ]);

  const [agentInput, setAgentInput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [includeFileContext, setIncludeFileContext] = useState(true);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Attached Context Files & OmniKey 95/2 File Suggestions
  const [contextFiles, setContextFiles] = useState<ContextFileItem[]>([]);
  const [suggestedFiles, setSuggestedFiles] = useState<SuggestedFileItem[]>([]);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);

  // Derived each render
  const rawLines = editorContent.split('\n');
  const activeTab = openTabs.find(t => t.path === activeTabPath);
  const currentTerm = terminals.find(t => t.id === activeTermId) || terminals[0];

  return {
    currentProjectName,
    setCurrentProjectName,
    currentProjectPath,
    setCurrentProjectPath,
    gitBranch,
    setGitBranch,
    recentProjects,
    setRecentProjects,
    showOpenProjectModal,
    setShowOpenProjectModal,
    showApiKeysModal,
    setShowApiKeysModal,
    showIndexDrawer,
    setShowIndexDrawer,
    showKnowledgeGraph,
    setShowKnowledgeGraph,
    knowledgeGraphData,
    setKnowledgeGraphData,
    activeFlowSequence,
    setActiveFlowSequence,
    activeFlowSteps,
    setActiveFlowSteps,
    showGitHubModal,
    setShowGitHubModal,
    showAutoForkModal,
    setShowAutoForkModal,
    githubRepoInfo,
    setGithubRepoInfo,
    githubToken,
    setGithubToken,
    isGitHubWorkspace,
    setIsGitHubWorkspace,
    currentGitHubBranch,
    setCurrentGitHubBranch,
    remoteFileShas,
    setRemoteFileShas,
    apiKeys,
    setApiKeys,
    apiKeyInputs,
    setApiKeyInputs,
    apiKeySaveStatus,
    setApiKeySaveStatus,
    apiKeyTestStatus,
    setApiKeyTestStatus,
    projectPathInput,
    setProjectPathInput,
    workspaceTree,
    setWorkspaceTree,
    loadingTree,
    setLoadingTree,
    filterQuery,
    setFilterQuery,
    inlineCreateState,
    setInlineCreateState,
    inlineCreateName,
    setInlineCreateName,
    showQuickOpen,
    setShowQuickOpen,
    quickOpenQuery,
    setQuickOpenQuery,
    allFiles,
    setAllFiles,
    quickOpenIndex,
    setQuickOpenIndex,
    quickOpenInputRef,
    openTabs,
    setOpenTabs,
    activeTabPath,
    setActiveTabPath,
    editorContent,
    setEditorContent,
    isDirty,
    setIsDirty,
    cursorPos,
    setCursorPos,
    saveStatus,
    setSaveStatus,
    foldedLines,
    setFoldedLines,
    lastAppliedNotice,
    setLastAppliedNotice,
    gutterRef,
    syntaxRef,
    textareaRef,
    activeActivity,
    setActiveActivity,
    showBottomPanel,
    setShowBottomPanel,
    bottomTab,
    setBottomTab,
    terminals,
    setTerminals,
    activeTermId,
    setActiveTermId,
    executingCmd,
    setExecutingCmd,
    terminalCopied,
    setTerminalCopied,
    termScrollRef,
    termInputRef,
    autoApplyEdits,
    setAutoApplyEdits,
    agentMessages,
    setAgentMessages,
    agentInput,
    setAgentInput,
    agentLoading,
    setAgentLoading,
    includeFileContext,
    setIncludeFileContext,
    chatScrollRef,
    contextFiles,
    setContextFiles,
    suggestedFiles,
    setSuggestedFiles,
    isDraggingOverChat,
    setIsDraggingOverChat,
    rawLines,
    activeTab,
    currentTerm,
  };
}

export type IdeStore = ReturnType<typeof useIdeStore>;
