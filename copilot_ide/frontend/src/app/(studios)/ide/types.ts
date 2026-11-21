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
  /** Files sent with a user message: the open file (if included) and attached context files */
  context?: { path: string; name: string }[];
  /** The reply was stopped before it finished */
  stopped?: boolean;
}

/* -- Agent edits: proposed for review, or applied and logged so they can be reverted - */
export interface PendingEdit {
  id: string;
  path: string;
  name: string;
  before: string;
  after: string;
  summary: string;
  /** Optional custom handler (used by multi-file healing diff reviews). */
  onDecision?: (keptText: string, accepted: boolean) => void | Promise<void>;
}

export interface AgentEdit extends PendingEdit {
  reverted?: boolean;
}

export interface PendingHealPatch {
  path: string;
  name: string;
  operation: 'modify' | 'create';
  before: string;
  after: string;
  summary: string;
  status: 'pending' | 'applied' | 'rejected' | 'reverted';
}

export interface HealReviewActions {
  acceptFile: (path: string, keptText?: string) => Promise<void>;
  rejectFile: (path: string) => Promise<void>;
  acceptAll: () => Promise<void>;
}
