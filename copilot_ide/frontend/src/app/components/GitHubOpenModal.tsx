'use client';

import React, { useState, useEffect } from 'react';
import { Dialog } from './Dialog';
import { errorMessage } from '@/lib/api';
import { githubAuth, githubFetch, type GitHubAuth } from '@/lib/github';
import { forgetGitHubToken, saveGitHubToken } from '@/lib/runner';
import { useRunner } from './useRunner';

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  full_name: string;
  default_branch: string;
  description?: string;
  can_push: boolean;
  stars?: number;
  is_fork?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
  /** Token typed earlier this session (memory only) */
  sessionToken: string;
  /** `token` is what to keep in memory for this tab: '' when the runner holds it */
  onOpenRepo: (info: GitHubRepoInfo, branch: string, tree: any[], token: string) => void;
  onForkNeeded?: (info: GitHubRepoInfo, token: string) => void;
}

export default function GitHubOpenModal({
  isOpen,
  onClose,
  apiBase,
  sessionToken,
  onOpenRepo,
  onForkNeeded
}: Props) {
  const [repoUrl, setRepoUrl] = useState('');
  const [token, setToken] = useState(sessionToken);
  const [seenSessionToken, setSeenSessionToken] = useState(sessionToken);
  if (seenSessionToken !== sessionToken) {
    setSeenSessionToken(sessionToken);
    setToken(sessionToken);
  }
  // With the runner: keep a new token there (OS keychain) instead of only in this tab
  const [keepInRunner, setKeepInRunner] = useState(true);
  const [replacingToken, setReplacingToken] = useState(false);
  const runner = useRunner();
  const live = runner.status === 'online' ? runner.info : null;
  const signedInAs = live?.github.connected ? live.github.login ?? 'GitHub' : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentRepos, setRecentRepos] = useState<string[]>([]);

  useEffect(() => {
    try {
      const recents = JSON.parse(localStorage.getItem('archon_recent_repos') || '[]');
      if (Array.isArray(recents)) setRecentRepos(recents);
    } catch {}
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const typed = signedInAs && !replacingToken ? '' : token.trim();
      // What to keep in memory for this tab ('' when the runner holds the token)
      let keep = typed;
      let auth: GitHubAuth = githubAuth(typed, runner);
      if (typed && live && keepInRunner) {
        await saveGitHubToken(typed); // GitHub checks it first; a bad token stops here
        keep = '';
        auth = { token: '', viaRunner: true };
        setToken('');
        setReplacingToken(false);
      }

      const res = await githubFetch('openRepo', apiBase, auth, { body: { repo_url: repoUrl.trim() } });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Failed to open repository (HTTP ${res.status})`);
      }

      const data = await res.json();
      const repoInfo: GitHubRepoInfo = data.repo_info;

      // Update recent repos in localStorage
      const updatedRecents = [repoInfo.full_name, ...recentRepos.filter(r => r !== repoInfo.full_name)].slice(0, 5);
      setRecentRepos(updatedRecents);
      localStorage.setItem('archon_recent_repos', JSON.stringify(updatedRecents));

      onClose();

      // Check if user has write access
      if (!repoInfo.can_push && onForkNeeded) {
        onForkNeeded(repoInfo, keep);
      } else {
        onOpenRepo(repoInfo, data.branch, data.tree, keep);
      }
    } catch (err) {
      setError(errorMessage(err) || 'Error opening repository');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setError(null);
    try {
      await forgetGitHubToken();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog onClose={onClose} label="Open a GitHub repository" className="flex items-center justify-center p-4 select-none" backdrop="backdrop:bg-black/80 backdrop:backdrop-blur-sm" closeOnBackdrop={false}>
      <div className="w-full max-w-lg bg-surface border border-line-strong rounded-dialog shadow-raised overflow-hidden flex flex-col text-fg animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-line flex items-center justify-between bg-canvas">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-panel bg-overlay border border-line-strong flex items-center justify-center text-white text-base">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Open Clone-Free GitHub Repository</h3>
              <p className="text-xs text-slate-400">Direct tree browsing, editing, and commits via GitHub API</p>
            </div>
          </div>
          <button aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white p-1 text-base cursor-pointer">
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 text-xs font-sans">
          {error && (
            <div className="p-3 rounded-panel bg-rose-950/40 border border-rose-800/50 text-rose-300 font-mono text-xs">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono text-slate-300">
              Repository URL or Owner/Repo:
            </label>
            <input
              type="text"
              placeholder="e.g. facebook/react or https://github.com/fastapi/fastapi"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="h-9 bg-raised border border-line-strong rounded-control px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              autoFocus
            />
          </div>

          {signedInAs && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-panel bg-raised border border-line text-xs">
              <span className="text-slate-300">
                Signed in as <span className="font-mono text-white">@{signedInAs}</span>
                <span className="block text-slate-500 mt-0.5">The token is kept by the local runner; this page never sees it.</span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => setReplacingToken(r => !r)}
                  aria-pressed={replacingToken}
                  className="px-2.5 py-1 rounded-control bg-overlay hover:bg-selected border border-line-strong text-slate-300 cursor-pointer"
                >
                  {replacingToken ? 'Keep this one' : 'Use another token'}
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="px-2.5 py-1 rounded-control bg-overlay hover:bg-selected border border-line-strong text-slate-300 cursor-pointer"
                >
                  Sign out
                </button>
              </span>
            </div>
          )}

          {(!signedInAs || replacingToken) && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="github-token" className="text-xs font-mono text-slate-300">
                  Personal Access Token (PAT):
                </label>
                <span className="text-xs text-slate-500">Optional for public repos</span>
              </div>
              <input
                id="github-token"
                type="password"
                autoComplete="off"
                placeholder="ghp_... (needed for private repos or committing)"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="h-9 bg-raised border border-line-strong rounded-control px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
              {live ? (
                <label className="flex items-center gap-2 text-xs text-slate-400 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepInRunner}
                    onChange={(e) => setKeepInRunner(e.target.checked)}
                    className="rounded-control border-line-strong text-cyan-500 focus:ring-0"
                  />
                  <span>Keep it in the local runner (your OS keychain), not in this browser</span>
                </label>
              ) : (
                <p className="text-xs text-slate-500 mt-1">
                  Kept in this tab until you reload. To keep it between visits without storing it in the browser,
                  run <code className="font-mono text-slate-300">archon</code> on your machine.
                </p>
              )}
            </div>
          )}

          {/* Recent Repos */}
          {recentRepos.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-xs font-mono text-slate-400 uppercase">Recent Repositories:</span>
              <div className="flex flex-wrap gap-1.5">
                {recentRepos.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRepoUrl(r)}
                    className="px-2.5 py-1 rounded-control bg-overlay hover:bg-selected border border-line-strong text-cyan-300 text-xs font-mono transition-all cursor-pointer"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-line mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-control bg-overlay hover:bg-selected border border-line-strong text-slate-300 text-xs font-mono transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !repoUrl.trim()}
              className="px-5 py-2 rounded-control bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-mono text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⟳</span>
                  <span>Fetching Tree...</span>
                </>
              ) : (
                <span>Open Remote Repo</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
