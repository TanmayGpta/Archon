"use client";
import { useEffect } from 'react';
import { readLastProject, writeLastProject } from './lastProject';
import { useFeedback } from '../../components/Feedback';
import { errorDetail } from '@/lib/api';
import type { IdeProps } from './IdeContext';
import type { IdeStore } from './useIdeStore';
import type { ApiKeysApi } from './useApiKeys';
import type { EditorApi } from './useEditorActions';

/* -- Workspace: open project, recent list, file tree, create/rename/delete, quick-open file list - */
export function useProjectActions(ide: IdeProps & IdeStore & ApiKeysApi & EditorApi) {
  const { toast, confirmDialog } = useFeedback();
  const {
    activeTabPath,
    apiBase,
    currentProjectPath,
    fetchApiKeyStatus,
    handleOpenFile,
    inlineCreateName,
    inlineCreateState,
    isGitHubWorkspace,
    quickOpenInputRef,
    renameTarget,
    renameValue,
    setActiveTabPath,
    setAllFiles,
    setCurrentProjectName,
    setCurrentProjectPath,
    setEditorContent,
    editorStates,
    setGitBranch,
    setInlineCreateName,
    setInlineCreateState,
    setKnowledgeGraphData,
    setLoadingTree,
    setOpenTabs,
    setQuickOpenIndex,
    setQuickOpenQuery,
    setRecentProjects,
    setRenameTarget,
    setRenameValue,
    setWorkspaceError,
    setShowOpenProjectModal,
    setTerminals,
    setWorkspaceTree,
    showQuickOpen,
    setGithubRepoInfo,
    setIsGitHubWorkspace,
  } = ide;

  // Open Any Custom Folder / Project (with create_if_missing)
  // quiet: used when reopening a remembered folder on load; a failure just forgets it
  const serviceDown = `The orchestrator service (${apiBase}) isn't responding. Start it with: docker compose up -d orchestrator-service`;

  const handleOpenProject = async (targetPath: string, shouldCreate: boolean = false, { quiet = false, openReadme = true } = {}) => {
    if (!targetPath.trim()) return;
    try {
      const res = await fetch(`${apiBase}/api/workspace/open-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath.trim(), create_if_missing: shouldCreate })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentProjectName(data.current_project);
        setCurrentProjectPath(data.project_path);
        setGitBranch(data.git_branch || 'main');
        setRecentProjects(data.recent_projects || []);
        if (!data.project_path?.includes('test_codebases/imported')) {
          setIsGitHubWorkspace(false);
          setGithubRepoInfo(null);
        } else {
          setIsGitHubWorkspace(true);
          const parts = (data.current_project || '').split('__');
          if (parts.length === 2) {
            setGithubRepoInfo({
              owner: parts[0],
              repo: parts[1],
              full_name: `${parts[0]}/${parts[1]}`,
              default_branch: data.git_branch || 'main',
              can_push: false,
              is_fork: false,
              stars: 0
            });
          }
        }
        setShowOpenProjectModal(false);
        setOpenTabs([]);
        setActiveTabPath('');
        setEditorContent('');
        editorStates.current.clear();
        setTerminals(prev => prev.map(t => ({ ...t, cwd: data.project_path })));
        
        // Refresh File Explorer Tree immediately
        const treeRes = await fetch(`${apiBase}/api/workspace/tree`);
        if (treeRes.ok) {
          const treeData = await treeRes.json();
          setWorkspaceTree(treeData.tree || []);
        }

        // Open README.md if present
        if (openReadme) setTimeout(async () => {
          try {
            const readmeRes = await fetch(`${apiBase}/api/workspace/file?path=README.md`);
            if (readmeRes.ok) {
              const fileData = await readmeRes.json();
              const newTab = {
                path: fileData.path,
                name: fileData.filename,
                content: fileData.content,
                original: fileData.content
              };
              setOpenTabs([newTab]);
              setActiveTabPath(fileData.path);
              setEditorContent(fileData.content);
            }
          } catch (err) {}
        }, 150);
      } else {
        const detail = errorDetail(await res.text());
        if (!quiet) toast({
          tone: 'error',
          title: `Couldn't open ${targetPath.trim()}`,
          detail: `${detail} Check the path, or pick a recent project.`,
        });
      }
    } catch {
      if (!quiet) toast({
        tone: 'error',
        title: `Couldn't open ${targetPath.trim()}`,
        detail: serviceDown,
        action: { label: 'Retry', run: () => handleOpenProject(targetPath, shouldCreate) },
      });
    }
  };

  // Load the recent list, plus the open project's branch and tree. With no project open, only the recent list loads.
  const fetchProjectsAndTree = async () => {
    const linked = ide.deepLink?.project;
    const projectPath = currentProjectPath || linked || readLastProject();
    setLoadingTree(true);
    try {
      const projRes = await fetch(`${apiBase}/api/workspace/projects`);
      setWorkspaceError(projRes.ok ? null : `The workspace service answered ${projRes.status}. ${errorDetail(await projRes.clone().text())}`);
      if (projRes.ok) {
        const projData = await projRes.json();
        setRecentProjects(projData.recent_projects || []);

        if (projectPath && projData.project_path !== projectPath) {
          // The service restarted or switched folders since this project was opened: reopen it.
          setLoadingTree(false);
          // A link the user followed should say if its folder can't be opened
          await handleOpenProject(projectPath, false, { quiet: projectPath !== linked, openReadme: !ide.deepLink?.file });
          return;
        }

        const activePath = projectPath || (projData.project_path && projData.project_path !== '/workspace' ? projData.project_path : '');
        if (activePath) {
          setCurrentProjectName(projData.current_project || '');
          setCurrentProjectPath(projData.project_path || activePath);
          setGitBranch(projData.git_branch || 'main');
          setTerminals(prev => prev.map(t => ({ ...t, cwd: projData.project_path || t.cwd })));
          if (projData.project_path?.includes('test_codebases/imported')) {
            setIsGitHubWorkspace(true);
            const parts = (projData.current_project || '').split('__');
            if (parts.length === 2) {
              setGithubRepoInfo({
                owner: parts[0],
                repo: parts[1],
                full_name: `${parts[0]}/${parts[1]}`,
                default_branch: projData.git_branch || 'main',
                can_push: false,
                is_fork: false,
                stars: 0
              });
            }
          }

          const treeRes = await fetch(`${apiBase}/api/workspace/tree`);
          if (treeRes.ok) {
            const treeData = await treeRes.json();
            setWorkspaceTree(treeData.tree || []);
          }
        }
      }
    } catch (e) {
      setWorkspaceError(serviceDown);
    }
    setLoadingTree(false);
  };

  // Remember the open folder so a refresh or tab switch reopens it
  useEffect(() => {
    if (currentProjectPath) writeLastProject(currentProjectPath);
  }, [currentProjectPath]);

  useEffect(() => {
    fetchProjectsAndTree();
    fetchApiKeyStatus();
    // Fetch cached Knowledge Graph if present
    fetch(`${apiBase}/api/workspace/graph`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.nodes && d.nodes.length > 0) {
          setKnowledgeGraphData(d);
        }
      })
      .catch(() => {});
  }, [apiBase]);

  // Fetch all searchable files for Quick Open
  const fetchAllFiles = async () => {
    try {
      const res = await fetch(`${apiBase}/api/workspace/all-files`);
      if (res.ok) {
        const data = await res.json();
        setAllFiles(data.files || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (showQuickOpen) {
      fetchAllFiles();
      setQuickOpenQuery('');
      setQuickOpenIndex(0);
      setTimeout(() => quickOpenInputRef.current?.focus(), 50);
    }
  }, [showQuickOpen]);

  // Delete File or Directory
  const handleDeleteItem = async (targetPath: string, isDir: boolean) => {
    const name = targetPath.split('/').pop() || targetPath;
    const confirmed = await confirmDialog({
      title: `Delete ${name}?`,
      body: (
        <>
          <span className="font-mono text-fg-soft break-all">{targetPath}</span>
          {isDir ? ' and everything in it' : ''} will be removed from disk. This can&apos;t be undone.
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`${apiBase}/api/workspace/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath })
      });
      if (res.ok) {
        setOpenTabs(prev => prev.filter(t => isDir ? !t.path.startsWith(targetPath) : t.path !== targetPath));
        if (isDir ? activeTabPath.startsWith(targetPath) : activeTabPath === targetPath) {
          setActiveTabPath('');
          setEditorContent('');
        }
        fetchProjectsAndTree();
      } else {
        toast({ tone: 'error', title: `Couldn't delete ${name}`, detail: errorDetail(await res.text()) });
      }
    } catch {
      toast({ tone: 'error', title: `Couldn't delete ${name}`, detail: serviceDown });
    }
  };

  // Rename File or Directory: show the inline name input on the row
  const handleRenameItem = (oldPath: string, oldName: string) => {
    setInlineCreateState(null);
    setRenameTarget(oldPath);
    setRenameValue(oldName);
  };

  const cancelRename = () => {
    setRenameTarget(null);
    setRenameValue('');
  };

  const handleConfirmRename = async () => {
    const oldPath = renameTarget;
    if (!oldPath) return;
    const oldName = oldPath.split('/').pop() || oldPath;
    const newName = renameValue;
    if (!newName.trim() || newName.trim() === oldName) {
      cancelRename();
      return;
    }

    const parts = oldPath.split('/');
    parts[parts.length - 1] = newName.trim();
    const newPath = parts.join('/');

    try {
      const res = await fetch(`${apiBase}/api/workspace/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_path: oldPath, new_path: newPath })
      });
      if (res.ok) {
        setOpenTabs(prev => prev.map(t => {
          if (t.path === oldPath) {
            return { ...t, path: newPath, name: newName.trim() };
          }
          if (t.path.startsWith(oldPath + '/')) {
            const updated = newPath + t.path.substring(oldPath.length);
            return { ...t, path: updated };
          }
          return t;
        }));
        if (activeTabPath === oldPath) {
          setActiveTabPath(newPath);
        }
        cancelRename();
        fetchProjectsAndTree();
      } else {
        toast({ tone: 'error', title: `Couldn't rename ${oldName}`, detail: `${errorDetail(await res.text())} Pick another name or press Esc.` });
      }
    } catch {
      toast({ tone: 'error', title: `Couldn't rename ${oldName}`, detail: serviceDown });
    }
  };

  // Confirm inline creation of file or folder
  const handleConfirmInlineCreate = async () => {
    if (!inlineCreateState || !inlineCreateName.trim()) {
      setInlineCreateState(null);
      setInlineCreateName('');
      return;
    }
    const { parentPath, isDir } = inlineCreateState;
    const cleanName = inlineCreateName.trim();
    const fullPath = parentPath ? `${parentPath}/${cleanName}` : cleanName;

    try {
      const res = await fetch(`${apiBase}/api/workspace/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath, is_directory: isDir })
      });
      if (res.ok) {
        setInlineCreateState(null);
        setInlineCreateName('');
        fetchProjectsAndTree();
        if (!isDir) {
          handleOpenFile(fullPath);
        }
      } else {
        toast({ tone: 'error', title: `Couldn't create ${cleanName}`, detail: `${errorDetail(await res.text())} Pick another name or press Esc.` });
      }
    } catch {
      toast({ tone: 'error', title: `Couldn't create ${cleanName}`, detail: serviceDown });
    }
  };

  return {
    fetchProjectsAndTree,
    handleOpenProject,
    fetchAllFiles,
    handleDeleteItem,
    handleRenameItem,
    handleConfirmRename,
    cancelRename,
    handleConfirmInlineCreate,
  };
}

export type ProjectApi = ReturnType<typeof useProjectActions>;
