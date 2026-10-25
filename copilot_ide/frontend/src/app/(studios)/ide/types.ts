import { FlowStep } from '../../components/CodeKnowledgeGraph';


/* -- Interactive Multi-Tab Terminal State --------------------- */
export interface TerminalTab {
  id: string;
  name: string;
  history: Array<{ type: 'input' | 'stdout' | 'stderr' | 'system'; text: string }>;
  commandHistory: string[];
  historyIndex: number;
  input: string;
  cwd: string;
}

export interface RAGSource {
  title: string;
  file: string;
  score: string | number;
  rank: number;
  text: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rag_sources?: RAGSource[];
  status?: string;
  flowSequence?: string[];
  flowSteps?: FlowStep[];
}
