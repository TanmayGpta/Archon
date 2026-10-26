/* -- Command registry --------------------------------------------------
 * Every top-level action, as data: an id, a title, search keywords, the
 * studio that runs it and any arguments. No UI here. The web palette
 * (Ctrl+K) lists these; a CLI can map the same ids to slash commands
 * (`studio.conformance` -> `/conformance`, `model.select` -> `/model <name>`).
 * Keep ids stable once shipped. Studios attach the code that runs each one.
 */

export type StudioRoute = '/ask' | '/ide' | '/evaluation' | '/architect' | '/conformance';

export interface CommandArg {
  name: string;
  kind: 'choice' | 'text';
  title: string;
}

export interface CommandSpec {
  id: string;
  title: string;
  group: 'Go to' | 'Workspace' | 'Editor' | 'Agent' | 'Ask' | 'Architect' | 'Conformance' | 'Settings';
  keywords?: string[];
  /** Studio whose page runs the command; the palette navigates there first. */
  route?: StudioRoute;
  args?: CommandArg[];
  /** Keyboard binding, e.g. 'Mod+P' (Mod = Ctrl, or Cmd on a Mac). Runs only while its studio is open. */
  keys?: string;
}

export const COMMANDS: CommandSpec[] = [
  { id: 'studio.ask', title: 'Go to Ask', group: 'Go to', keywords: ['rag', 'search', 'docs', 'question'] },
  { id: 'studio.ide', title: 'Go to IDE', group: 'Go to', keywords: ['editor', 'code', 'agent'] },
  { id: 'studio.evaluation', title: 'Go to Evaluation', group: 'Go to', keywords: ['benchmark', 'metrics', 'dashboard'] },
  { id: 'studio.architect', title: 'Go to Architect', group: 'Go to', keywords: ['arcgen', 'srs', 'design'] },
  { id: 'studio.conformance', title: 'Go to Conformance', group: 'Go to', keywords: ['audit', 'layers', 'violations'] },

  { id: 'workspace.openFolder', title: 'Open folder…', group: 'Workspace', route: '/ide', keywords: ['project', 'workspace', 'switch'] },
  { id: 'workspace.openGitHub', title: 'Open from GitHub…', group: 'Workspace', route: '/ide', keywords: ['repo', 'clone', 'remote'] },
  { id: 'workspace.quickOpen', title: 'Go to file…', group: 'Workspace', route: '/ide', keywords: ['quick open', 'find file'], keys: 'Mod+P' },
  { id: 'workspace.index', title: 'Index codebase (SCIP)', group: 'Workspace', route: '/ide', keywords: ['sourcegraph', 'knowledge graph'] },
  { id: 'workspace.graph', title: 'Show knowledge graph', group: 'Workspace', route: '/ide', keywords: ['dependencies', 'visualize'] },

  { id: 'editor.save', title: 'Save file', group: 'Editor', route: '/ide', keywords: ['write', 'commit'], keys: 'Mod+S' },
  { id: 'editor.closeTab', title: 'Close editor tab', group: 'Editor', route: '/ide', keywords: ['tab', 'file'], keys: 'Alt+W' },
  { id: 'terminal.toggle', title: 'Toggle terminal', group: 'Editor', route: '/ide', keywords: ['panel', 'shell', 'console'], keys: 'Mod+`' },

  { id: 'chat.new', title: 'New chat', group: 'Agent', route: '/ide', keywords: ['clear', 'conversation', 'reset'] },
  { id: 'chat.focus', title: 'Ask the agent…', group: 'Agent', route: '/ide', keywords: ['chat', 'prompt', 'message'] },

  { id: 'ask.upload', title: 'Upload API document…', group: 'Ask', route: '/ask', keywords: ['ingest', 'openapi', 'spec'] },
  { id: 'ask.settings', title: 'Retrieval settings…', group: 'Ask', route: '/ask', keywords: ['chunking', 'top k', 'strategy'] },

  { id: 'architect.generate', title: 'Generate architecture', group: 'Architect', route: '/architect', keywords: ['arcgen', 'srs', 'phase b'] },

  { id: 'conformance.run', title: 'Run conformance check', group: 'Conformance', route: '/conformance', keywords: ['audit', 'scan', 'violations'] },

  { id: 'model.select', title: 'Select model…', group: 'Settings', keywords: ['llm', 'ollama', 'gpt', 'gemini'], args: [{ name: 'model', kind: 'choice', title: 'Model' }] },
  { id: 'settings.apiKeys', title: 'Configure API keys…', group: 'Settings', route: '/ide', keywords: ['openai', 'anthropic', 'gemini', 'cloud'] },
];

export const commandById = (id: string) => COMMANDS.find(c => c.id === id);

/** How well `query` matches: higher is better, null means no match. */
export function scoreCommand(query: string, cmd: Pick<CommandSpec, 'title' | 'group' | 'keywords'>): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = cmd.title.toLowerCase();
  const words = [title, cmd.group.toLowerCase(), ...(cmd.keywords ?? []).map(k => k.toLowerCase())].join(' ');
  if (title.startsWith(q)) return 100;
  if (new RegExp(`(^|[\\s.(])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(words)) return 80;
  if (words.includes(q)) return 60;
  // Letters in order inside the title ("rcc" -> "Run conformance check"), tighter is better
  let at = -1;
  let gaps = 0;
  for (const ch of q.replace(/\s+/g, '')) {
    const next = title.indexOf(ch, at + 1);
    if (next < 0) return null;
    if (at >= 0) gaps += next - at - 1;
    at = next;
  }
  return Math.max(1, 40 - gaps);
}

/** Matching commands, best first; ties keep registry order. */
export function searchCommands<T extends Pick<CommandSpec, 'title' | 'group' | 'keywords'>>(query: string, list: T[]): T[] {
  return list
    .map((cmd, i) => ({ cmd, i, score: scoreCommand(query, cmd) }))
    .filter((r): r is { cmd: T; i: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(r => r.cmd);
}

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

// e.code for a key, so Alt combinations still match on a Mac (where Alt+W types '∑')
const codeFor = (key: string) =>
  /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^[0-9]$/.test(key) ? `Digit${key}` : key === '`' ? 'Backquote' : '';

/** Whether a key event is exactly this binding (no extra modifiers). */
export function matchesKeys(e: KeyEventLike, keys: string, isMac = false): boolean {
  const parts = keys.split('+');
  const key = parts.pop()!.toLowerCase();
  const mod = isMac ? e.metaKey : e.ctrlKey;
  const otherMod = isMac ? e.ctrlKey : e.metaKey;
  if (mod !== parts.includes('Mod') || otherMod || e.altKey !== parts.includes('Alt') || e.shiftKey !== parts.includes('Shift')) return false;
  return e.key.toLowerCase() === key || (!!codeFor(key) && e.code === codeFor(key));
}

/** A binding as people read it: 'Ctrl+P' on Windows/Linux, '⌘P' on a Mac. */
export function formatKeys(keys: string, isMac = false): string {
  const parts = keys.split('+');
  const key = parts.pop()!.toUpperCase();
  const names = isMac ? { Mod: '⌘', Alt: '⌥', Shift: '⇧' } : { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift' };
  const mods = parts.map(p => names[p as keyof typeof names] ?? p);
  return isMac ? [...mods, key].join('') : [...mods, key].join('+');
}
