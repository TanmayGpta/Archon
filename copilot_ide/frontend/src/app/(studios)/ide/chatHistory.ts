import type { AgentMessage } from './types';

/* -- Agent conversations, saved per project ----------------------------
 * Kept in localStorage (wrapped: storage can be missing or full). Only the
 * last MAX_SAVED messages are kept, and in-flight status lines are dropped.
 */

export const WELCOME_MESSAGE: AgentMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Ask for a change, or drag files here to add context.',
};

const PREFIX = 'archon.chat.v1:';
const MAX_SAVED = 100;

/** The conversation saved for a project, or null if there is none. */
export function readChat(projectKey: string): AgentMessage[] | null {
  if (!projectKey) return null;
  try {
    const raw = localStorage.getItem(PREFIX + projectKey);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? (parsed as AgentMessage[]) : null;
  } catch {
    return null;
  }
}

export function writeChat(projectKey: string, messages: AgentMessage[]) {
  if (!projectKey) return;
  const keep = messages.filter(m => m.id !== WELCOME_MESSAGE.id).slice(-MAX_SAVED).map(m => ({ ...m, status: undefined }));
  try {
    if (keep.length) localStorage.setItem(PREFIX + projectKey, JSON.stringify(keep));
    else localStorage.removeItem(PREFIX + projectKey);
  } catch {
    // storage unavailable or full: the conversation stays in memory only
  }
}
