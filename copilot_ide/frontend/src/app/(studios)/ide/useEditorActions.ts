"use client";
import React, { useEffect } from 'react';
import { detectTargetFilename } from '../../components/markdown/CodeBlock';
import { parseDiffBlocks, applyDiffBlocks } from '@/lib/diff';
import { errorDetail } from '@/lib/api';
import type { IdeProps } from './IdeContext';
import type { IdeStore } from './useIdeStore';
import type { PendingEdit } from './types';
import { useFeedback } from '../../components/Feedback';

/* -- Tabs and editor buffer: open, close, edit, save, apply agent edits, shortcuts - */
export function useEditorActions(ide: IdeProps & IdeStore) {
  const { toast } = useFeedback();
  const {
    activeTabPath,
    agentEdits,
    apiBase,
    currentGitHubBranch,
    editorContent,
    editorStates,
    githubRepoInfo,
    githubToken,
    isGitHubWorkspace,
    openTabs,
    remoteFileShas,
    setActiveTabPath,
    setCursorPos,
    setAgentEdits,
    setEditorContent,
    setInlineCreateState,
    setIsDirty,
    setLastAppliedNotice,
    setOpenTabs,
    setPendingEdit,
    setRemoteFileShas,
    setSaveStatus,
    setShowOpenProjectModal,
    setShowQuickOpen,
    setWorkspaceTree,
    pendingEdit,
  } = ide;

  // Open a file from explorer (Local or Remote GitHub)
  const handleOpenFile = async (path: string) => {
    const existing = openTabs.find(t => t.path === path);
    if (existing) {
      setActiveTabPath(path);
      setEditorContent(existing.content);
      setIsDirty(existing.content !== existing.original);
      return;
    }

    // Remote GitHub Workspace file fetch
    if (isGitHubWorkspace && githubRepoInfo) {
      try {
        const url = `${apiBase}/api/github/file?owner=${githubRepoInfo.owner}&repo=${githubRepoInfo.repo}&path=${encodeURIComponent(path)}&branch=${currentGitHubBranch}${githubToken ? `&token=${encodeURIComponent(githubToken)}` : ''}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.sha) {
            setRemoteFileShas(prev => ({ ...prev, [path]: data.sha }));
          }
          const newTab = {
            path: data.path,
            name: path.split('/').pop() || path,
            content: data.content,
            original: data.content
          };
          editorStates.current.delete(data.path);
          setOpenTabs(prev => [...prev, newTab]);
          setActiveTabPath(data.path);
          setEditorContent(data.content);
          setIsDirty(false);
          return;
        }
      } catch (err) {
        console.error("Could not read remote GitHub file", err);
      }
    }

    // Local workspace file fetch
    try {
      const res = await fetch(`${apiBase}/api/workspace/file?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        const newTab = {
          path: data.path,
          name: data.filename,
          content: data.content,
          original: data.content
        };
        editorStates.current.delete(data.path);
        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabPath(data.path);
        setEditorContent(data.content);
        setIsDirty(false);
      }
    } catch (e) {
      console.error("Could not read file", e);
    }
  };

  // Create and open a new file in workspace
  const handleCreateAndOpenFile = async (filename: string, content: string) => {
    try {
      const res = await fetch(`${apiBase}/api/workspace/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filename, content: content })
      });
      if (res.ok) {
        const newTab = { path: filename, name: filename, content: content, original: content };
        editorStates.current.delete(filename);
        setOpenTabs(prev => {
          const idx = prev.findIndex(t => t.path === filename);
          if (idx >= 0) {
            const clone = [...prev];
            clone[idx] = newTab;
            return clone;
          }
          return [...prev, newTab];
        });
        setActiveTabPath(filename);
        setEditorContent(content);
        setIsDirty(false);
        toast({ tone: 'success', title: `Created ${filename}` });

        // Refresh File Tree
        const treeRes = await fetch(`${apiBase}/api/workspace/tree`);
        if (treeRes.ok) {
          const treeData = await treeRes.json();
          setWorkspaceTree(treeData.tree || []);
        }
      }
    } catch (e) {
      console.error("Failed to create file", e);
    }
  };

  // Close tab
  const handleCloseTab = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const filtered = openTabs.filter(t => t.path !== path);
    setOpenTabs(filtered);
    editorStates.current.delete(path);
    if (pendingEdit?.path === path) setPendingEdit(null);
    if (activeTabPath === path) {
      if (filtered.length > 0) {
        const next = filtered[filtered.length - 1];
        setActiveTabPath(next.path);
        setEditorContent(next.content);
        setIsDirty(next.content !== next.original);
      } else {
        setActiveTabPath('');
        setEditorContent('');
        setIsDirty(false);
      }
    }
  };

  // Update editor content
  const handleEditorChange = (val: string) => {
    setEditorContent(val);
    const active = openTabs.find(t => t.path === activeTabPath);
    if (active) {
      setIsDirty(val !== active.original);
      setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: val } : t));
    }
  };

  // Track cursor position
  const handleCursorChange = (line: number, col: number) => {
    setCursorPos({ line, col });
  };

  // Save file to backend or GitHub commit (Ctrl+S)
  const handleSaveFile = async () => {
    if (!activeTabPath) return;

    // Direct commit to remote GitHub repository without local cloning
    if (isGitHubWorkspace && githubRepoInfo) {
      setSaveStatus('Committing to GitHub...');
      try {
        const res = await fetch(`${apiBase}/api/github/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: githubRepoInfo.owner,
            repo: githubRepoInfo.repo,
            path: activeTabPath,
            content: editorContent,
            commit_message: `Update ${activeTabPath} via Archon Copilot`,
            branch: currentGitHubBranch,
            sha: remoteFileShas[activeTabPath] || undefined,
            token: githubToken || undefined
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.new_file_sha) {
            setRemoteFileShas(prev => ({ ...prev, [activeTabPath]: data.new_file_sha }));
          }
          setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, original: editorContent } : t));
          setIsDirty(false);
          setSaveStatus('');
          setLastAppliedNotice(null);
          toast({
            tone: 'success',
            title: `Committed ${activeTabPath}`,
            detail: `${githubRepoInfo.full_name} on ${currentGitHubBranch}`,
          });
          return;
        } else {
          const errData = await res.text();
          setSaveStatus('');
          toast({
            tone: 'error',
            title: `Couldn't commit ${activeTabPath} to GitHub`,
            detail: `${errorDetail(errData)} Your changes are still in the editor. Check the token can write to the repo, then press Ctrl+S again.`,
          });
          return;
        }
      } catch (e: any) {
        setSaveStatus('');
        toast({
          tone: 'error',
          title: `Couldn't reach the server to commit ${activeTabPath}`,
          detail: `${e?.message || e}. Your changes are still in the editor; press Ctrl+S to retry.`,
        });
        return;
      }
    }

    // Local workspace save
    setSaveStatus('Saving...');
    try {
      const res = await fetch(`${apiBase}/api/workspace/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeTabPath, content: editorContent })
      });
      if (res.ok) {
        setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, original: editorContent } : t));
        setIsDirty(false);
        setSaveStatus('');
        setLastAppliedNotice(null);
      } else {
        setSaveStatus('');
        toast({
          tone: 'error',
          title: `Couldn't save ${activeTabPath}`,
          detail: `${errorDetail(await res.text())} Your changes are still in the editor; press Ctrl+S to try again.`,
        });
      }
    } catch (e) {
      setSaveStatus('');
      toast({
        tone: 'error',
        title: `Couldn't save ${activeTabPath}`,
        detail: `The orchestrator service (${apiBase}) isn't responding. Your changes are still in the editor; press Ctrl+S to try again.`,
      });
    }
  };

  // Global Shortcut Listener (Ctrl+P Quick Open, Ctrl+W Close Tab, Ctrl+S Save, Escape)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setShowQuickOpen(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (activeTabPath) {
          handleCloseTab(activeTabPath);
        }
      } else if (e.key === 'Escape') {
        setShowQuickOpen(false);
        setInlineCreateState(null);
        setShowOpenProjectModal(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeTabPath, openTabs]);

  // Put new text into a tab's buffer; the editor takes it in as one undo step
  const setTabContent = (path: string, content: string) => {
    const tab = openTabs.find(t => t.path === path);
    if (!tab) return;
    setOpenTabs(prev => prev.map(t => t.path === path ? { ...t, content } : t));
    if (path === activeTabPath) {
      setEditorContent(content);
      setIsDirty(content !== tab.original);
    }
  };

  // Apply an agent edit and log it, so Ctrl+Z or Revert in the chat panel undoes it
  const commitAgentEdit = (edit: PendingEdit) => {
    setTabContent(edit.path, edit.after);
    setAgentEdits(prev => [...prev, edit]);
  };

  // Review the edit as a diff, or (auto-apply) apply it straight away
  const deliverAgentEdit = (edit: Omit<PendingEdit, 'id'>, notice: string, review: boolean) => {
    if (edit.after === edit.before) return;
    const withId = { ...edit, id: `edit-${Date.now()}` };
    if (review) {
      setPendingEdit(withId);
      return;
    }
    commitAgentEdit(withId);
    setLastAppliedNotice(notice);
  };

  // Close the diff review with the text the user kept
  const finishReview = (keptText: string) => {
    if (!pendingEdit) return;
    const edit = pendingEdit;
    setPendingEdit(null);
    if (keptText === edit.before) return;
    commitAgentEdit({ ...edit, after: keptText });
    setLastAppliedNotice(`✓ Applied reviewed edit to ${edit.name} • (Ctrl+S to save)`);
  };

  // Restore a file to how it was before an agent edit (only while the edit is still the latest text)
  const revertAgentEdit = (id: string) => {
    const edit = agentEdits.find(e => e.id === id);
    if (!edit) return;
    setTabContent(edit.path, edit.before);
    setAgentEdits(prev => prev.map(e => e.id === id ? { ...e, reverted: true } : e));
  };

  // Surgically apply Diff blocks to active editor buffer (review first unless auto-applying)
  const handleApplyDiff = (diffSnippet: string, { review = true } = {}) => {
    const active = openTabs.find(t => t.path === activeTabPath);
    if (!active) {
      toast({ tone: 'warning', title: 'Open the file first', detail: 'Open the file this diff is for in the editor, then press Apply again.' });
      return;
    }

    // Safety Guard: Block lazy placeholder code from being applied
    const lazyPatterns = [
      /\/\/\s*\.{3}\s*(rest|remaining|unchanged|continues|code remains)/i,
      /\/\*\s*\.{3}\s*(rest|remaining|unchanged|continues)/i,
      /#\s*\.{3}\s*(rest|remaining|unchanged|continues)/i,
      /\/\/\s*\(rest of/i,
      /\/\/\s*\.\.\./,
    ];
    if (lazyPatterns.some(p => p.test(diffSnippet))) {
      toast({
        tone: 'warning',
        title: 'Edit not applied: the reply has placeholder code',
        detail: 'It contains lines like "// ... rest of code unchanged", which would delete code. Ask the agent for the complete change.',
      });
      return;
    }

    // Protection for empty / new files: if editor is empty, populate full code directly
    if (editorContent.trim().length < 15) {
      const blocks = parseDiffBlocks(diffSnippet);
      if (blocks.length > 0) {
        const codeToUse = (blocks[0].replace.trim().length > 0 && blocks[0].replace.trim() !== '>>>>>>> REPLACE')
          ? blocks[0].replace
          : blocks[0].search;
        if (codeToUse.trim().length > 0) {
          deliverAgentEdit(
            { path: active.path, name: active.name, before: editorContent, after: codeToUse, summary: 'filled an empty file' },
            `✓ Populated ${active.name} with code • (Ctrl+S to save)`, review,
          );
          return;
        }
      }
    }

    const result = applyDiffBlocks(editorContent, diffSnippet);
    if (result.success) {
      const edits = `${result.appliedCount} diff ${result.appliedCount === 1 ? 'edit' : 'edits'}`;
      deliverAgentEdit(
        { path: active.path, name: active.name, before: editorContent, after: result.newContent, summary: edits },
        `✓ Surgically applied ${edits} to ${active.name} • (Ctrl+S to save)`, review,
      );
    } else {
      const errDetail = result.errors.join(' ');
      toast({
        tone: 'error',
        title: `Couldn't apply the diff to ${active.name}`,
        detail: `${errDetail} The file is unchanged; copy the code from the reply or ask the agent to retry.`,
      });
    }
  };

  // Apply AI code snippet into active editor buffer (review first unless auto-applying)
  const handleApplyCodeToEditor = (snippet: string, { review = true } = {}) => {
    const active = openTabs.find(t => t.path === activeTabPath);
    if (active) {
      deliverAgentEdit(
        { path: active.path, name: active.name, before: editorContent, after: snippet, summary: 'replaced the file' },
        `Archon Agent applied edits to ${active.name} • (Ctrl+S to save)`, review,
      );
    } else {
      const tempPath = detectTargetFilename(snippet) || 'solution.py';
      handleCreateAndOpenFile(tempPath, snippet);
    }
  };

  return {
    handleOpenFile,
    handleCreateAndOpenFile,
    handleCloseTab,
    handleEditorChange,
    handleCursorChange,
    handleSaveFile,
    finishReview,
    revertAgentEdit,
    handleApplyDiff,
    handleApplyCodeToEditor,
  };
}

export type EditorApi = ReturnType<typeof useEditorActions>;
