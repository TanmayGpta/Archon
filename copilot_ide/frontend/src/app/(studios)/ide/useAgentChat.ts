"use client";
import { useEffect } from 'react';
import { detectTargetFilename } from '../../components/markdown/CodeBlock';
import { parseDiffBlocks } from '@/lib/diff';
import type { IdeProps } from './IdeContext';
import type { IdeStore } from './useIdeStore';
import type { EditorApi } from './useEditorActions';
import type { AgentMessage } from './types';
import type { ContextFileItem } from '../../components/ContextFileChips';

/* -- Agent chat: context files, file suggestions, streamed replies, auto-apply - */
export function useAgentChat(ide: IdeProps & IdeStore & EditorApi) {
  const {
    activeTab,
    activeTabPath,
    agentInput,
    agentLoading,
    agentMessages,
    apiBase,
    autoApplyEdits,
    chatScrollRef,
    contextFiles,
    editorContent,
    handleApplyCodeToEditor,
    handleApplyDiff,
    handleCreateAndOpenFile,
    includeFileContext,
    openTabs,
    selectedModel,
    setAgentInput,
    setAgentLoading,
    setAgentMessages,
    setContextFiles,
    setSuggestedFiles,
  } = ide;

  const handleAddContextFile = async (path: string, name?: string) => {
    if (contextFiles.some(f => f.path === path)) return;
    const fileName = name || path.split('/').pop() || path;
    const item: ContextFileItem = { path, name: fileName };
    setContextFiles(prev => [...prev, item]);

    try {
      const res = await fetch(`${apiBase}/api/workspace/file?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setContextFiles(prev => prev.map(f => f.path === path ? { ...f, content: data.content } : f));
      }
    } catch (e) {
      console.error("Failed to read context file content", e);
    }
  };

  const handleRemoveContextFile = (path: string) => {
    setContextFiles(prev => prev.filter(f => f.path !== path));
  };

  // Debounced 95/2 Rule Pre-Prompt Suggestion via OmniKey
  useEffect(() => {
    const trimmed = agentInput.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);

    // Fire after 1+ words with at least 3 chars AND 1.5s pause
    if (words.length < 1 || trimmed.length < 3) {
      setSuggestedFiles([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const activeTab = openTabs.find(t => t.path === activeTabPath);
        const res = await fetch(`${apiBase}/api/agent/suggest-files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmed,
            active_file_path: activeTab?.path || null,
            attached_files: contextFiles.map(c => c.path)
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.suggestions)) {
            setSuggestedFiles(data.suggestions);
          }
        }
      } catch (err) {
        console.error("Failed to fetch file suggestions", err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [agentInput, activeTabPath, contextFiles, apiBase, openTabs, setSuggestedFiles]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [agentMessages, chatScrollRef]);

  // Send Archon Agent Message (Multi-turn SSE Stream with Line-Buffer & ID-based state)
  const handleSendAgentMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || agentInput;
    if (!textToSend.trim() || agentLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now() + 1}`;

    const userMsg: AgentMessage = { id: userMsgId, role: 'user', content: textToSend };
    const assistantMsg: AgentMessage = { 
      id: assistantMsgId, 
      role: 'assistant', 
      content: '', 
      status: includeFileContext && activeTab ? `Inspecting ${activeTab.name} & generating response...` : 'Connecting to Archon Agent...' 
    };

    const newHistory = [...agentMessages, userMsg];
    setAgentMessages(prev => [...prev, userMsg, assistantMsg]);
    setAgentInput('');
    setSuggestedFiles([]);
    setAgentLoading(true);

    try {
      const activeTab = openTabs.find(t => t.path === activeTabPath);
      const res = await fetch(`${apiBase}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
          active_file_path: includeFileContext && activeTab ? activeTab.path : null,
          active_file_content: includeFileContext && activeTab ? editorContent : null,
          context_files: contextFiles.map(cf => ({ path: cf.path, content: cf.content })),
          model: selectedModel
        })
      });

      if (!res.ok) {
        setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: '❌ **Error:** Failed to connect to Agent service.', status: undefined } : m));
        setAgentLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = '';
      let streamedResponse = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                // RAG Source Citations event
                if (data.rag_sources) {
                  setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    rag_sources: data.rag_sources,
                    status: 'Synthesizing solution with retrieved documentation...'
                  } : m));
                }

                // Synaptic Flow Trace event
                if (data.flow_sequence && data.flow_steps) {
                  setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    flowSequence: data.flow_sequence,
                    flowSteps: data.flow_steps,
                  } : m));
                }

                // Token streaming
                if (data.token) {
                  streamedResponse += data.token;
                  setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    content: streamedResponse,
                    status: undefined
                  } : m));
                }

                if (data.done) {
                  setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    status: undefined
                  } : m));

                  // If auto-apply is turned ON, extract diff or code block and apply
                  if (autoApplyEdits) {
                    const diffBlocks = parseDiffBlocks(streamedResponse);
                    if (diffBlocks.length > 0) {
                      handleApplyDiff(streamedResponse);
                    } else {
                      const codeMatch = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/.exec(streamedResponse);
                      if (codeMatch && codeMatch[1]) {
                        const detected = detectTargetFilename(codeMatch[1]);
                        const current = activeTab?.name;
                        if (detected && current && detected.toLowerCase() !== current.toLowerCase()) {
                          handleCreateAndOpenFile(detected, codeMatch[1].trim());
                        } else {
                          handleApplyCodeToEditor(codeMatch[1].trim());
                        }
                      }
                    }
                  }
                  break;
                }

                if (data.error) {
                  streamedResponse += `\n\n> ⚠️ **Error:** ${data.error}`;
                  setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    content: streamedResponse,
                    status: undefined
                  } : m));
                  break;
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {
      setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: '❌ **Error:** Connection lost.', status: undefined } : m));
    }
    setAgentLoading(false);
  };

  return {
    handleAddContextFile,
    handleRemoveContextFile,
    handleSendAgentMessage,
  };
}

export type AgentApi = ReturnType<typeof useAgentChat>;
