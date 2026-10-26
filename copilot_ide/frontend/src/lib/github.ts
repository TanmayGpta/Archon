/* -- Orchestrator calls that use a GitHub token --------------------------
 * When the local runner holds the token, these go through it
 * (`/proxy/<path>`) and it adds the token, so the page never sees it.
 * Otherwise they go straight to the orchestrator with the token kept in
 * memory for this tab, if any. Keep in step with GITHUB_ROUTES in
 * shared/runner/server.py.
 */
import { RUNNER_URL, type RunnerState } from './runner.ts';

export const GITHUB_CALLS = {
  openRepo: { method: 'POST', path: 'api/github/open-repo', token: ['body', 'token'] },
  file: { method: 'GET', path: 'api/github/file', token: ['query', 'token'] },
  save: { method: 'POST', path: 'api/github/save', token: ['body', 'token'] },
  fork: { method: 'POST', path: 'api/github/fork', token: ['body', 'token'] },
  index: { method: 'POST', path: 'api/workspace/index-codebase', token: ['body', 'github_token'] },
} as const;

export type GitHubCall = keyof typeof GITHUB_CALLS;

export interface GitHubAuth {
  /** Token typed this session and kept in memory only ('' if none) */
  token: string;
  /** The runner holds a token and adds it for us */
  viaRunner: boolean;
}

export const NO_GITHUB_AUTH: GitHubAuth = { token: '', viaRunner: false };

/** A token typed this session wins; otherwise use the runner's if it has one. */
export function githubAuth(sessionToken: string, runner: RunnerState): GitHubAuth {
  return {
    token: sessionToken,
    viaRunner: !sessionToken && runner.status === 'online' && runner.info.github.connected,
  };
}

export const hasGitHubToken = (auth: GitHubAuth) => auth.viaRunner || !!auth.token;

type Params = { query?: Record<string, string>; body?: Record<string, unknown> };

export function githubRequest(call: GitHubCall, apiBase: string, auth: GitHubAuth, { query = {}, body }: Params = {}) {
  const spec = GITHUB_CALLS[call];
  const [where, field] = spec.token;
  const q: Record<string, string> = { ...query };
  let b = body;
  if (!auth.viaRunner && auth.token) {
    if (where === 'query') q[field] = auth.token;
    else b = { ...(b ?? {}), [field]: auth.token };
  }
  const base = auth.viaRunner ? `${RUNNER_URL}/proxy` : apiBase.replace(/\/+$/, '');
  const search = new URLSearchParams(q).toString();
  const init: RequestInit = { method: spec.method };
  if (spec.method !== 'GET') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(b ?? {});
  }
  return { url: `${base}/${spec.path}${search ? `?${search}` : ''}`, init };
}

export function githubFetch(call: GitHubCall, apiBase: string, auth: GitHubAuth, params?: Params): Promise<Response> {
  const { url, init } = githubRequest(call, apiBase, auth, params);
  return fetch(url, init);
}
