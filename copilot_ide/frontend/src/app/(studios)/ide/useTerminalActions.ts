"use client";
import React, { useEffect } from 'react';
import type { IdeProps } from './IdeContext';
import type { IdeStore } from './useIdeStore';
import type { TerminalTab } from './types';

/* -- Terminal tabs and command execution - */
export function useTerminalActions(ide: IdeProps & IdeStore) {
  const {
    activeTermId,
    apiBase,
    currentProjectPath,
    executingCmd,
    setActiveTermId,
    setCurrentProjectName,
    setCurrentProjectPath,
    setExecutingCmd,
    setGitBranch,
    setTerminalCopied,
    setTerminals,
    setWorkspaceTree,
    termScrollRef,
    terminals,
  } = ide;

  // Terminal: Add new terminal tab
  const handleAddTerminal = () => {
    const nextNum = terminals.length + 1;
    const newId = `term-${Date.now()}`;
    const newTerm: TerminalTab = {
      id: newId,
      name: `bash ${nextNum}`,
      history: [
        { type: 'system', text: `Session bash ${nextNum} started in ${currentProjectPath}` }
      ],
      commandHistory: [],
      historyIndex: -1,
      input: '',
      cwd: currentProjectPath
    };
    setTerminals(prev => [...prev, newTerm]);
    setActiveTermId(newId);
  };

  // Terminal: Close terminal tab
  const handleCloseTerminal = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (terminals.length <= 1) return;
    const remaining = terminals.filter(t => t.id !== id);
    setTerminals(remaining);
    if (activeTermId === id) {
      setActiveTermId(remaining[remaining.length - 1].id);
    }
  };

  // Terminal: Copy buffer text
  const handleCopyTerminalBuffer = () => {
    const currentTerm = terminals.find(t => t.id === activeTermId);
    if (!currentTerm) return;
    const allText = currentTerm.history.map(h => h.text).join('\n');
    navigator.clipboard.writeText(allText);
    setTerminalCopied(true);
    setTimeout(() => setTerminalCopied(false), 2000);
  };

  // Terminal: Run command
  const handleRunTerminalCommand = async () => {
    const currentTerm = terminals.find(t => t.id === activeTermId);
    if (!currentTerm) return;
    const rawCmd = currentTerm.input.trim();
    if (!rawCmd || executingCmd) return;

    // Handle clear
    if (rawCmd === 'clear') {
      setTerminals(prev => prev.map(t => t.id === activeTermId ? {
        ...t,
        history: [],
        commandHistory: [...t.commandHistory, rawCmd],
        historyIndex: -1,
        input: ''
      } : t));
      return;
    }

    const nextHistory = [
      ...currentTerm.history,
      { type: 'input' as const, text: `$ ${rawCmd}` }
    ];

    setTerminals(prev => prev.map(t => t.id === activeTermId ? {
      ...t,
      history: nextHistory,
      commandHistory: [...t.commandHistory, rawCmd],
      historyIndex: -1,
      input: ''
    } : t));

    setExecutingCmd(true);

    try {
      const res = await fetch(`${apiBase}/api/terminal/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: rawCmd,
          terminal_id: activeTermId,
          cwd: currentTerm.cwd
        })
      });

      if (res.ok) {
        const data = await res.json();
        const outputItems: Array<{ type: 'stdout' | 'stderr'; text: string }> = [];
        if (data.stdout) outputItems.push({ type: 'stdout', text: data.stdout });
        if (data.stderr) outputItems.push({ type: 'stderr', text: data.stderr });

        if (data.git_branch) {
          setGitBranch(data.git_branch);
        }

        // If directory changed via cd or command
        if (data.project_name) {
          setCurrentProjectName(data.project_name);
        }
        if (data.cwd) {
          setCurrentProjectPath(data.cwd);
        }

        // Always refresh file explorer tree so created/deleted/renamed files or branch checkouts show up immediately
        try {
          const treeRes = await fetch(`${apiBase}/api/workspace/tree`);
          if (treeRes.ok) {
            const treeData = await treeRes.json();
            setWorkspaceTree(treeData.tree || []);
            if (treeData.root) setCurrentProjectName(treeData.root);
            if (treeData.root_path) setCurrentProjectPath(treeData.root_path);
          }
        } catch (e) {}

        setTerminals(prev => prev.map(t => t.id === activeTermId ? {
          ...t,
          history: [...t.history, ...outputItems],
          cwd: data.cwd || t.cwd
        } : t));
      } else {
        setTerminals(prev => prev.map(t => t.id === activeTermId ? {
          ...t,
          history: [...t.history, { type: 'stderr', text: 'Error: Terminal subprocess failed.' }]
        } : t));
      }
    } catch (e) {
      setTerminals(prev => prev.map(t => t.id === activeTermId ? {
        ...t,
        history: [...t.history, { type: 'stderr', text: 'Connection to terminal service failed.' }]
      } : t));
    }

    setExecutingCmd(false);
  };

  // Terminal: History navigation
  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentTerm = terminals.find(t => t.id === activeTermId);
    if (!currentTerm) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      handleRunTerminalCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentTerm.commandHistory.length === 0) return;
      const nextIdx = currentTerm.historyIndex === -1 ? currentTerm.commandHistory.length - 1 : Math.max(0, currentTerm.historyIndex - 1);
      const cmd = currentTerm.commandHistory[nextIdx];
      setTerminals(prev => prev.map(t => t.id === activeTermId ? { ...t, input: cmd, historyIndex: nextIdx } : t));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentTerm.historyIndex === -1) return;
      const nextIdx = currentTerm.historyIndex + 1;
      if (nextIdx >= currentTerm.commandHistory.length) {
        setTerminals(prev => prev.map(t => t.id === activeTermId ? { ...t, input: '', historyIndex: -1 } : t));
      } else {
        const cmd = currentTerm.commandHistory[nextIdx];
        setTerminals(prev => prev.map(t => t.id === activeTermId ? { ...t, input: cmd, historyIndex: nextIdx } : t));
      }
    }
  };

  // Auto-scroll terminal
  useEffect(() => {
    if (termScrollRef.current) {
      termScrollRef.current.scrollTop = termScrollRef.current.scrollHeight;
    }
  }, [terminals, executingCmd, termScrollRef]);

  return {
    handleAddTerminal,
    handleCloseTerminal,
    handleCopyTerminalBuffer,
    handleRunTerminalCommand,
    handleTerminalKeyDown,
  };
}

export type TerminalApi = ReturnType<typeof useTerminalActions>;
