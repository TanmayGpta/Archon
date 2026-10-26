/* -- Local runner -------------------------------------------------------
 * `archon` on the user's own machine (shared/runner) serves a real shell over
 * a WebSocket and keeps the GitHub token, on 127.0.0.1:7337 by default. The
 * IDE works without it: the terminal falls back to the container's one-shot
 * shell and the token lives only in memory for the tab.
 */

export const RUNNER_URL = (process.env.NEXT_PUBLIC_RUNNER_URL || 'http://127.0.0.1:7337').replace(/\/+$/, '');

export interface RunnerInfo {
  runner: 'archon';
  version: string;
  cwd: string;
  shell: string;
  platform: string;
  github: { connected: boolean; login: string | null };
}

export type RunnerState =
  | { status: 'checking' }
  | { status: 'offline' }
  | { status: 'online'; info: RunnerInfo };

/* -- PTY socket protocol: JSON text frames in, raw output bytes + JSON events out */

export function ptyUrl(cols: number, rows: number, base = RUNNER_URL): string {
  return `${base.replace(/^http/, 'ws')}/pty?cols=${cols}&rows=${rows}`;
}

export const inputMessage = (data: string) => JSON.stringify({ type: 'input', data });
export const resizeMessage = (cols: number, rows: number) => JSON.stringify({ type: 'resize', cols, rows });

export type PtyEvent =
  | { type: 'ready'; shell: string; cwd: string; pid: number }
  | { type: 'exit'; code: number | null }
  | { type: 'error'; message: string };

export function parsePtyEvent(text: string): PtyEvent | null {
  try {
    const m = JSON.parse(text);
    if (m?.type === 'ready' || m?.type === 'exit' || m?.type === 'error') return m as PtyEvent;
  } catch {}
  return null;
}

/* -- Status, shared by every component that asks */

let state: RunnerState = { status: 'checking' };
const listeners = new Set<() => void>();
let inflight: Promise<RunnerState> | null = null;

function publish(next: RunnerState) {
  state = next;
  listeners.forEach(l => l());
}

export const getRunnerState = () => state;

export function subscribeRunner(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isRunnerInfo(data: unknown): data is RunnerInfo {
  const d = data as RunnerInfo | null;
  return !!d && d.runner === 'archon' && typeof d.cwd === 'string' && typeof d.github?.connected === 'boolean';
}

/** Ask the runner whether it is there; concurrent callers share one request. */
export function refreshRunner(): Promise<RunnerState> {
  inflight ??= (async () => {
    try {
      const res = await fetch(`${RUNNER_URL}/status`, { signal: AbortSignal.timeout(2000), cache: 'no-store' });
      const data = res.ok ? await res.json() : null;
      publish(isRunnerInfo(data) ? { status: 'online', info: data } : { status: 'offline' });
    } catch {
      publish({ status: 'offline' });
    } finally {
      inflight = null;
    }
    return state;
  })();
  return inflight;
}

async function runnerError(res: Response): Promise<Error> {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return new Error(body.detail);
  } catch {}
  return new Error(`The runner answered HTTP ${res.status}`);
}

/** Hand a token to the runner, which checks it with GitHub and keeps it. Resolves to the GitHub login. */
export async function saveGitHubToken(token: string): Promise<string> {
  const res = await fetch(`${RUNNER_URL}/github/token`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw await runnerError(res);
  const { login } = await res.json();
  await refreshRunner();
  return login;
}

export async function forgetGitHubToken(): Promise<void> {
  const res = await fetch(`${RUNNER_URL}/github/token`, { method: 'DELETE' });
  if (!res.ok) throw await runnerError(res);
  await refreshRunner();
}

/* -- Tokens saved by older versions in localStorage */

const LEGACY_TOKEN_KEY = 'archon_github_token';

/** Remove the token older versions left in localStorage and return it ('' if none). */
export function takeLegacyToken(storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined = globalThis.localStorage): string {
  try {
    const token = storage?.getItem(LEGACY_TOKEN_KEY) ?? '';
    if (token) storage?.removeItem(LEGACY_TOKEN_KEY);
    return token;
  } catch {
    return '';
  }
}
