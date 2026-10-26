"use client";
import { useEffect, useSyncExternalStore } from 'react';
import { getRunnerState, refreshRunner, subscribeRunner, type RunnerState } from '@/lib/runner';
import { githubAuth, type GitHubAuth } from '@/lib/github';

const CHECKING: RunnerState = { status: 'checking' };
let lastCheck = 0;

function check() {
  lastCheck = Date.now();
  void refreshRunner();
}

/** Whether `archon` is running on this machine. Checked on first use and when the window regains focus. */
export function useRunner(): RunnerState {
  const state = useSyncExternalStore(subscribeRunner, getRunnerState, () => CHECKING);
  useEffect(() => {
    if (Date.now() - lastCheck > 2000) check();
    // Started or stopped `archon` in another window: notice when the user comes back
    const onFocus = () => { if (Date.now() - lastCheck > 5000) check(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  return state;
}

/** How GitHub calls get their token: from this tab's memory, or from the runner. */
export function useGitHubAuth(sessionToken: string): GitHubAuth {
  return githubAuth(sessionToken, useRunner());
}
