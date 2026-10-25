"use client";
import React, { useEffect } from 'react';
import { detectTargetFilename } from '../../components/markdown/CodeBlock';
import { parseDiffBlocks, applyDiffBlocks } from '@/lib/diff';
import type { IdeProps } from './IdeContext';
import type { IdeStore } from './useIdeStore';

/* -- Tabs and editor buffer: open, close, edit, save, apply agent edits, shortcuts - */
export function useEditorActions(ide: IdeProps & IdeStore) {
  const {
    activeTabPath,
    apiBase,
    currentGitHubBranch,
    editorContent,
    githubRepoInfo,
    githubToken,
    gutterRef,
    isGitHubWorkspace,
    openTabs,
    remoteFileShas,
    setActiveTabPath,
    setCursorPos,
    setEditorContent,
    setFoldedLines,
    setInlineCreateState,
    setIsDirty,
    setLastAppliedNotice,
    setOpenTabs,
    setRemoteFileShas,
    setSaveStatus,
    setShowOpenProjectModal,
    setShowQuickOpen,
    setWorkspaceTree,
    syntaxRef,
  } = ide;

  // Synchronized Editor Scrolling (Textarea -> Gutter & Syntax Highlight Layer)
  const handleEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    if (gutterRef.current) {
      gutterRef.current.scrollTop = target.scrollTop;
    }
    if (syntaxRef.current) {
      syntaxRef.current.scrollTop = target.scrollTop;
      syntaxRef.current.scrollLeft = target.scrollLeft;
    }
  };

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
          setOpenTabs(prev => [...prev, newTab]);
          setActiveTabPath(data.path);
          setEditorContent(data.content);
          setIsDirty(false);
          setFoldedLines({});
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
        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabPath(data.path);
        setEditorContent(data.content);
        setIsDirty(false);
        setFoldedLines({});
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
        setLastAppliedNotice(`Created & opened ${filename} in workspace`);
        setTimeout(() => setLastAppliedNotice(null), 5000);

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
  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditorContent(val);
    const active = openTabs.find(t => t.path === activeTabPath);
    if (active) {
      setIsDirty(val !== active.original);
      setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: val } : t));
    }
  };

  // Track cursor position
  const handleEditorSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const pos = target.selectionStart;
    const textBefore = target.value.substring(0, pos);
    const lines = textBefore.split('\n');
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1
    });
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
          setSaveStatus('✓ Committed to GitHub');
          setLastAppliedNotice(null);
          setTimeout(() => setSaveStatus(''), 2500);
          return;
        } else {
          const errData = await res.text();
          setSaveStatus('❌ Commit Failed');
          alert(`GitHub Commit Failed: ${errData}`);
          return;
        }
      } catch (e: any) {
        setSaveStatus('❌ Commit Failed');
        alert(`GitHub Commit Error: ${e?.message || e}`);
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
        setSaveStatus('✓ Saved');
        setLastAppliedNotice(null);
        setTimeout(() => setSaveStatus(''), 2000);
      } else {
        setSaveStatus('❌ Error');
      }
    } catch (e) {
      setSaveStatus('❌ Failed');
    }
  };

  // Code Folding Toggle
  const toggleFold = (lineIndex: number) => {
    setFoldedLines(prev => ({ ...prev, [lineIndex]: !prev[lineIndex] }));
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

  // Keyboard shortcut handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSaveFile();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      const nextVal = val.substring(0, start) + '  ' + val.substring(end);
      setEditorContent(nextVal);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Surgically apply Diff blocks to active editor buffer
  const handleApplyDiff = (diffSnippet: string) => {
    const active = openTabs.find(t => t.path === activeTabPath);
    if (!active) {
      alert("Please open a file in the editor to apply this surgical diff.");
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
      alert('Blocked: The AI model generated incomplete placeholder code (e.g. "// ... rest of code unchanged"). Refusing to overwrite your file to prevent data loss. Please re-prompt the agent with more specific instructions.');
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
          setEditorContent(codeToUse);
          setIsDirty(codeToUse !== active.original);
          setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: codeToUse } : t));
          setLastAppliedNotice(`✓ Populated ${active.name} with code • (Ctrl+S to save)`);
          setTimeout(() => setLastAppliedNotice(null), 5000);
          return;
        }
      }
    }

    const result = applyDiffBlocks(editorContent, diffSnippet);
    if (result.success) {
      setEditorContent(result.newContent);
      setIsDirty(result.newContent !== active.original);
      setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: result.newContent } : t));
      setLastAppliedNotice(`✓ Surgically applied ${result.appliedCount} diff ${result.appliedCount === 1 ? 'edit' : 'edits'} to ${active.name} • (Ctrl+S to save)`);
      setTimeout(() => setLastAppliedNotice(null), 6000);
    } else {
      const errDetail = result.errors.join(' ');
      alert(`Could not apply diff surgically: ${errDetail}\n\nFalling back to manual inspection.`);
    }
  };

  // Apply AI code snippet into active editor buffer
  const handleApplyCodeToEditor = (snippet: string) => {
    const active = openTabs.find(t => t.path === activeTabPath);
    if (active) {
      setEditorContent(snippet);
      setIsDirty(snippet !== active.original);
      setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: snippet } : t));
      setLastAppliedNotice(`Archon Agent applied edits to ${active.name} • (Ctrl+S to save)`);
      setTimeout(() => setLastAppliedNotice(null), 5000);
    } else {
      const tempPath = detectTargetFilename(snippet) || 'solution.py';
      handleCreateAndOpenFile(tempPath, snippet);
    }
  };

  return {
    handleEditorScroll,
    handleOpenFile,
    handleCreateAndOpenFile,
    handleCloseTab,
    handleEditorChange,
    handleEditorSelection,
    handleSaveFile,
    toggleFold,
    handleKeyDown,
    handleApplyDiff,
    handleApplyCodeToEditor,
  };
}

export type EditorApi = ReturnType<typeof useEditorActions>;
