'use client';

import React, { useState, useEffect } from 'react';

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
  onOpenRepo: (info: GitHubRepoInfo, branch: string, tree: any[], token: string) => void;
  onForkNeeded?: (info: GitHubRepoInfo, token: string) => void;
}

export default function GitHubOpenModal({
  isOpen,
  onClose,
  apiBase,
  onOpenRepo,
  onForkNeeded
}: Props) {
  const [repoUrl, setRepoUrl] = useState('');
  const [token, setToken] = useState('');
  const [rememberToken, setRememberToken] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentRepos, setRecentRepos] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedToken = localStorage.getItem('archon_github_token') || '';
      if (savedToken) setToken(savedToken);

      try {
        const recents = JSON.parse(localStorage.getItem('archon_recent_repos') || '[]');
        if (Array.isArray(recents)) setRecentRepos(recents);
      } catch {}
    }
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      if (rememberToken && token.trim()) {
        localStorage.setItem('archon_github_token', token.trim());
      }

      const res = await fetch(`${apiBase}/api/github/open-repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_url: repoUrl.trim(),
          token: token.trim() || undefined
        })
      });

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
        onForkNeeded(repoInfo, token.trim());
      } else {
        onOpenRepo(repoInfo, data.branch, data.tree, token.trim());
      }
    } catch (err: any) {
      setError(err?.message || 'Error opening repository');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#0c0e14] border border-[#1e273a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-[#e2e5ea] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-[#182030] flex items-center justify-between bg-[#080a0f]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#141a29] border border-[#222c44] flex items-center justify-center text-white text-base shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Open Clone-Free GitHub Repository</h3>
              <p className="text-[11px] text-slate-400">Direct tree browsing, editing, and commits via GitHub API</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 text-base cursor-pointer">
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4 text-xs font-sans">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 font-mono text-[11px]">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-mono text-slate-300">
              Repository URL or Owner/Repo:
            </label>
            <input
              type="text"
              placeholder="e.g. facebook/react or https://github.com/fastapi/fastapi"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="h-9 bg-[#121622] border border-[#252f44] rounded-lg px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-slate-300">
                Personal Access Token (PAT):
              </label>
              <span className="text-[10px] text-slate-500">Optional for public repos</span>
            </div>
            <input
              type="password"
              placeholder="ghp_... (needed for private repos or committing)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="h-9 bg-[#121622] border border-[#252f44] rounded-lg px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <label className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberToken}
                onChange={(e) => setRememberToken(e.target.checked)}
                className="rounded border-[#252f44] text-cyan-500 focus:ring-0"
              />
              <span>Remember token in local browser storage</span>
            </label>
          </div>

          {/* Recent Repos */}
          {recentRepos.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Recent Repositories:</span>
              <div className="flex flex-wrap gap-1.5">
                {recentRepos.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRepoUrl(r)}
                    className="px-2.5 py-1 rounded bg-[#141926] hover:bg-[#1d2538] border border-[#20293d] text-cyan-300 text-[11px] font-mono transition-all cursor-pointer"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#182030] mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#141926] hover:bg-[#1e2538] border border-[#222b3e] text-slate-300 text-xs font-mono transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !repoUrl.trim()}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-mono text-xs font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
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
    </div>
  );
}
