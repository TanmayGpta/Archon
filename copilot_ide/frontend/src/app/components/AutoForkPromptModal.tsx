'use client';

import React, { useState } from 'react';
import { GitHubRepoInfo } from './GitHubOpenModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  repoInfo: GitHubRepoInfo | null;
  token: string;
  apiBase: string;
  onForkSuccess: (forkOwner: string, forkRepo: string, defaultBranch: string) => void;
  onContinueReadOnly: () => void;
}

export default function AutoForkPromptModal({
  isOpen,
  onClose,
  repoInfo,
  token,
  apiBase,
  onForkSuccess,
  onContinueReadOnly
}: Props) {
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !repoInfo) return null;

  const handleFork = async () => {
    if (!token.trim()) {
      setError('A GitHub Personal Access Token (PAT) is required to fork this repository.');
      return;
    }

    setForking(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/api/github/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repoInfo.owner,
          repo: repoInfo.repo,
          token: token.trim()
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Fork failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      onClose();
      onForkSuccess(data.fork_owner, data.fork_repo, data.default_branch || repoInfo.default_branch);
    } catch (e: any) {
      setError(e?.message || 'Failed to fork repository');
      setForking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#0c0e14] border border-[#1e273a] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-[#e2e5ea] animate-in zoom-in-95 duration-200">
        
        {/* Header with Fork Icon */}
        <div className="p-5 border-b border-[#182030] flex items-center gap-3 bg-[#080a0f]">
          <div className="w-10 h-10 rounded-xl bg-amber-950/50 border border-amber-600/40 flex items-center justify-center text-amber-400 font-mono text-lg shadow-sm">
            🍴
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Read-Only Repository Detected
            </h3>
            <span className="text-[11px] font-mono text-amber-300/90">
              {repoInfo.full_name}
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-4 text-xs font-sans">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 font-mono text-[11px]">
              {error}
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-[#111624] border border-[#1e273a] flex flex-col gap-1.5">
            <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">
              Repository Access Level:
            </span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="font-semibold text-white">Public / Read-Only</span>
              <span className="text-slate-400 font-mono">({repoInfo.stars} ★)</span>
            </div>
            {repoInfo.description && (
              <p className="text-[11.5px] text-slate-300 italic pt-1 line-clamp-2">
                &ldquo;{repoInfo.description}&rdquo;
              </p>
            )}
          </div>

          <p className="text-slate-300 leading-relaxed text-[11.5px]">
            You do not have push permissions to <strong>{repoInfo.full_name}</strong>. Would you like Archon to automatically fork this repository to your GitHub account so you can edit and commit directly?
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleFork}
              disabled={forking}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-mono text-xs font-semibold shadow-lg shadow-blue-900/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {forking ? (
                <>
                  <span className="animate-spin">⟳</span>
                  <span>Forking repository to your account...</span>
                </>
              ) : (
                <>
                  <span>🍴 1-Click Fork & Start Editing</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                onClose();
                onContinueReadOnly();
              }}
              disabled={forking}
              className="w-full py-2 rounded-xl bg-[#141926] hover:bg-[#1e2538] border border-[#222b3e] text-slate-300 text-xs font-mono transition-all cursor-pointer"
            >
              👁️ Continue in Read-Only Mode
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
