"use client";
import React, { useEffect, useRef, useState } from 'react';
import { API_BASE, EVALUATION_API_BASE } from '@/lib/api';
import { healthLevel, serviceRows, type HealthLevel, type Probe, type ServiceRow } from '@/lib/serviceHealth';

const POLL_MS = 30_000;

async function probe(base: string): Promise<Probe> {
  const started = performance.now();
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    const ms = Math.round(performance.now() - started);
    return { ok: res.ok, ms, body: res.ok ? await res.json().catch(() => undefined) : undefined };
  } catch {
    return { ok: false };
  }
}

const DOT: Record<HealthLevel, string> = {
  checking: 'bg-fg-subtle',
  ok: 'bg-success',
  degraded: 'bg-warning',
  down: 'bg-danger',
};
const BADGE: Record<HealthLevel, string> = {
  checking: 'bg-raised border-line text-fg-muted',
  ok: 'bg-success/10 border-success/25 text-success',
  degraded: 'bg-warning/10 border-warning/30 text-warning-fg',
  down: 'bg-danger/10 border-danger/30 text-danger-fg',
};
const ROW_STATE: Record<ServiceRow['state'], { dot: string; text: string }> = {
  up: { dot: 'bg-success', text: 'Up' },
  down: { dot: 'bg-danger', text: 'Down' },
  unknown: { dot: 'bg-fg-subtle', text: 'Unknown' },
};

/* -- Header badge: overall backend health, with a per-service popover -
 * Polls every 30 s while the tab is visible, and again on refocus.
 */
export function ServiceStatus({ appVersion }: { appVersion: string }) {
  const [probes, setProbes] = useState<{ orchestrator: Probe | null; evaluation: Probe | null; at: Date | null }>({
    orchestrator: null,
    evaluation: null,
    at: null,
  });
  const [checking, setChecking] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    setChecking(true);
    const [orchestrator, evaluation] = await Promise.all([
      probe(API_BASE),
      EVALUATION_API_BASE ? probe(EVALUATION_API_BASE) : Promise.resolve(null),
    ]);
    setProbes({ orchestrator, evaluation, at: new Date() });
    setChecking(false);
  };
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refreshRef.current();
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const rows = serviceRows(probes.orchestrator, probes.evaluation);
  const { level, label } = healthLevel(rows);

  // Place the popover under the badge, right-aligned
  const onToggle = (e: React.ToggleEvent<HTMLDivElement>) => {
    if (e.newState !== 'open') return;
    const button = buttonRef.current?.getBoundingClientRect();
    const pop = popoverRef.current;
    if (!button || !pop) return;
    pop.style.top = `${button.bottom + 8}px`;
    pop.style.right = `${Math.max(8, window.innerWidth - button.right)}px`;
  };

  return (
    <>
      <button
        ref={buttonRef}
        popoverTarget="service-status"
        aria-label={`Service status: ${label}`}
        className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-control text-xs font-mono cursor-pointer ${BADGE[level]}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${DOT[level]} ${level === 'ok' ? 'animate-pulse' : ''}`} />
        <span className="sr-only sm:not-sr-only">{label}</span>
      </button>
      <div
        ref={popoverRef}
        id="service-status"
        popover="auto"
        onToggle={onToggle}
        className="fixed inset-auto m-0 w-[min(360px,calc(100vw-16px))] rounded-panel border border-line-strong bg-surface p-0 text-fg-soft shadow-raised"
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
          <span className="text-sm font-semibold text-fg-strong">Services</span>
          <button
            onClick={refresh}
            disabled={checking}
            className="text-xs text-accent-fg hover:underline disabled:opacity-50 cursor-pointer"
          >
            {checking ? 'Checking…' : 'Check now'}
          </button>
        </div>
        <ul className="divide-y divide-line-subtle">
          {rows.map(row => (
            <li key={row.id} className="px-4 py-2 flex items-start gap-2.5">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${ROW_STATE[row.state].dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-fg">
                    {row.name} <span className="font-mono text-xs text-fg-subtle">:{row.port}</span>
                  </span>
                  <span className="text-xs font-mono text-fg-muted whitespace-nowrap">
                    {ROW_STATE[row.state].text}
                    {row.latencyMs !== undefined && ` · ${row.latencyMs} ms`}
                    {row.version && ` · v${row.version.replace(/^v/, '')}`}
                  </span>
                </div>
                {row.note && <p className="text-xs text-fg-subtle">{row.note}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="px-4 py-2 border-t border-line text-xs text-fg-subtle flex justify-between">
          <span>Archon Copilot {appVersion}</span>
          <span>{probes.at ? `Checked ${probes.at.toLocaleTimeString()}` : 'Checking…'}</span>
        </div>
      </div>
    </>
  );
}
