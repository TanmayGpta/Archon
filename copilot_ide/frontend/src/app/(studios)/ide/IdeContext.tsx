"use client";
import { createContext, useContext } from 'react';
import type { IdeStore } from './useIdeStore';
import type { ApiKeysApi } from './useApiKeys';
import type { EditorApi } from './useEditorActions';
import type { ProjectApi } from './useProjectActions';
import type { TerminalApi } from './useTerminalActions';
import type { AgentApi } from './useAgentChat';

export interface IdeProps {
  apiBase: string;
  models: string[];
  setModels?: (m: string[]) => void;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
}

/** Everything the IDE panels read: props, state and actions. */
export type Ide = IdeProps & IdeStore & ApiKeysApi & EditorApi & ProjectApi & TerminalApi & AgentApi;

export const IdeContext = createContext<Ide | null>(null);

export function useIde(): Ide {
  const ctx = useContext(IdeContext);
  if (!ctx) throw new Error('useIde must be used inside the IDE');
  return ctx;
}
