"use client";

import React, { useEffect, useRef, useState } from 'react';
import type {
  LiveChannel,
  LiveObservabilityState,
  StageStatus,
} from '@/lib/archonObservability';

interface AgentObservabilityPanelProps {
  state: LiveObservabilityState;
  onOpenJury?: () => void;
  onOpenDiagram?: () => void;
}

const CHANNEL_STYLE: Record<LiveChannel, string> = {
  PHASE_B: 'bg-accent/15 text-accent-fg border-accent/30',
  TOOL: 'bg-success/15 text-success-fg border-success/30',
  VALIDATOR: 'bg-info/15 text-info border-info/30',
  ADK_JURY: 'bg-ai/15 text-ai border-ai/35',
  TALLY: 'bg-warning/15 text-warning-fg border-warning/35',
  ROUTER: 'bg-info-strong/20 text-info border-info-strong/40',
  SYSTEM: 'bg-selected text-fg-soft border-line-strong',
};

const STATUS_META: Record<StageStatus, { label: string; dot: string; badge: string }> = {
  idle: { label: 'IDLE', dot: 'bg-fg-subtle', badge: 'text-fg-subtle border-line bg-raised' },
  running: { label: 'RUNNING', dot: 'bg-info animate-pulse', badge: 'text-info border-info/40 bg-info/10' },
  tool_call: { label: 'TOOL CALL', dot: 'bg-success animate-pulse', badge: 'text-success-fg border-success/40 bg-success/10' },
  retrying: { label: 'REVISING', dot: 'bg-warning animate-pulse', badge: 'text-warning-fg border-warning/40 bg-warning/10' },
  passed: { label: 'PASSED', dot: 'bg-success', badge: 'text-success-fg border-success/40 bg-success/15' },
  done: { label: 'DONE', dot: 'bg-accent-fg', badge: 'text-accent-fg border-accent/35 bg-accent/10' },
  error: { label: 'ERROR', dot: 'bg-danger', badge: 'text-danger-fg border-danger/40 bg-danger/10' },
};

const fmtOffset = (ms: number) => `+${(ms / 1000).toFixed(2).padStart(5, '0')}s`;

export function AgentObservabilityPanel({
  state,
  onOpenJury,
  onOpenDiagram,
}: AgentObservabilityPanelProps) {
  const [channelFilter, setChannelFilter] = useState<'ALL' | LiveChannel>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [rightTab, setRightTab] = useState<'tools' | 'state'>('tools');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 200);
    return () => clearInterval(id);
  }, [state.running]);

  const liveElapsedMs = state.running
    ? Math.max(state.elapsedMs, nowMs - state.startedAt)
    : state.endedAt
    ? state.endedAt - state.startedAt
    : state.elapsedMs;

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [state.logs.length, autoScroll]);

  const filteredLogs = channelFilter === 'ALL'
    ? state.logs
    : state.logs.filter(l => l.channel === channelFilter);

  const pipelineAgents = state.agents.filter(a => a.group === 'pipeline');
  const jurorAgents = state.agents.filter(a => a.group === 'juror');

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
      {/* Top Telemetry Bar */}
      <div className="rounded-panel bg-surface border border-line-strong p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold border flex items-center gap-1.5 ${
                state.error
                  ? 'bg-danger/15 text-danger-fg border-danger/40'
                  : state.running
                  ? 'bg-info/15 text-info border-info/40'
                  : 'bg-success/15 text-success-fg border-success/35'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  state.error ? 'bg-danger' : state.running ? 'bg-info animate-pulse' : 'bg-success'
                }`}
              />
              {state.error ? 'JOB ERROR' : state.running ? 'LIVE BACKEND SSE' : 'JOB COMPLETE'}
            </span>
            <span className="text-xs font-mono text-fg-subtle">job:{state.jobId}</span>
            <span className="px-2 py-0.5 rounded-control bg-raised border border-line text-xs font-mono text-ai">
              ArcGen Phase B + Google ADK Jury
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
            {onOpenJury && (
              <button
                onClick={onOpenJury}
                className="px-2.5 py-1 rounded-control bg-raised hover:bg-overlay border border-line-strong text-fg-soft cursor-pointer"
              >
                Jury Votes
              </button>
            )}
            {onOpenDiagram && !state.running && !state.error && (
              <button
                onClick={onOpenDiagram}
                className="px-2.5 py-1 rounded-control bg-selected hover:bg-overlay border border-info/40 text-info font-semibold cursor-pointer"
              >
                Open Diagram
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line text-xs font-mono">
          <div className="text-fg-strong truncate">
            <span className="text-fg-subtle mr-1.5">STAGE:</span>
            {state.stageLabel}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-fg-muted shrink-0">
            <span>Elapsed <strong className="text-fg-strong">{(liveElapsedMs / 1000).toFixed(1)}s</strong></span>
            <span>Events <strong className="text-fg-strong">{state.logs.length}</strong></span>
            <span>Tool / Check Calls <strong className="text-success-fg">{state.tools.length}</strong></span>
            <span>Round <strong className="text-info">v{state.state.round}</strong></span>
            <span>Verdict <strong className="text-fg-strong">{state.state.verdict}</strong></span>
          </div>
        </div>
      </div>

      {/* Live Pipeline Stages & Real ADK Juror Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="rounded-panel bg-surface border border-line-strong p-3 space-y-2">
          <div className="text-xs font-mono font-bold uppercase tracking-wide text-accent-fg">
            ArcGen Phase B &amp; Deterministic Engine
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pipelineAgents.map(agent => {
              const meta = STATUS_META[agent.status];
              return (
                <div
                  key={agent.id}
                  className={`rounded-control border p-2.5 transition-all ${
                    agent.status === 'running' || agent.status === 'tool_call' || agent.status === 'retrying'
                      ? 'bg-selected/80 border-info/50'
                      : 'bg-raised border-line'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-fg-strong truncate">{agent.name}</span>
                    <span className={`px-1.5 py-0.5 rounded-control border text-[10px] font-mono font-bold flex items-center gap-1 shrink-0 ${meta.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-fg-muted font-mono truncate mt-1" title={agent.action}>
                    {agent.action}
                  </div>
                  <div className="text-[10px] font-mono text-fg-subtle mt-1 truncate">{agent.role}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-panel bg-surface border border-line-strong p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wide text-ai">
              Google ADK ParallelAgent Jurors (Live Seats)
            </span>
            <span className="text-[11px] font-mono text-fg-subtle">
              Excluded: {state.state.excluded_families}
            </span>
          </div>
          {jurorAgents.length === 0 ? (
            <div className="rounded-control bg-raised border border-dashed border-line-strong p-6 text-center text-xs font-mono text-fg-subtle">
              {state.kind === 'plain'
                ? 'Bias jury disabled for this run.'
                : 'Waiting for ADK ParallelAgent to seat jurors after Phase B draft completes…'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {jurorAgents.map(agent => {
                const meta = STATUS_META[agent.status];
                return (
                  <div
                    key={agent.id}
                    className={`rounded-control border p-2.5 transition-all ${
                      agent.status === 'running' ? 'bg-selected/80 border-ai/50' : 'bg-raised border-line'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-fg-strong truncate" title={agent.name}>{agent.name}</span>
                      <span className={`px-1.5 py-0.5 rounded-control border text-[10px] font-mono font-bold flex items-center gap-1 shrink-0 ${meta.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-fg-muted font-mono truncate mt-1" title={agent.action}>
                      {agent.action}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-fg-subtle mt-1">
                      <span className="truncate">{agent.role}</span>
                      {agent.seconds !== undefined && <span className="shrink-0 ml-1">{agent.seconds.toFixed(1)}s</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Split: Live Backend Event Log + Tools / Job State */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 flex-1 min-h-[340px]">
        <div className="xl:col-span-7 rounded-panel bg-surface border border-line-strong flex flex-col overflow-hidden min-h-[340px]">
          <div className="px-3.5 py-2.5 border-b border-line flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {(['ALL', 'PHASE_B', 'TOOL', 'VALIDATOR', 'ADK_JURY', 'TALLY', 'ROUTER', 'SYSTEM'] as const).map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className={`px-2 py-0.5 rounded-control text-[11px] font-mono border cursor-pointer ${
                    channelFilter === ch
                      ? 'bg-selected text-accent-fg border-accent/40 font-bold'
                      : 'bg-raised text-fg-muted border-line hover:text-fg-soft'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-mono text-fg-subtle cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={e => setAutoScroll(e.target.checked)}
                className="accent-info"
              />
              Auto-scroll
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-canvas font-mono text-xs max-h-[420px] custom-scrollbar">
            {filteredLogs.map(log => (
              <div
                key={log.id}
                className="rounded-control bg-surface/80 border border-line px-2.5 py-2 space-y-1"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-fg-subtle">{fmtOffset(log.offsetMs)}</span>
                  <span className={`px-1.5 py-0.2 rounded-control border text-[10px] font-bold ${CHANNEL_STYLE[log.channel]}`}>
                    {log.channel}
                  </span>
                  <span className="text-fg-strong font-bold">{log.agent}</span>
                  <span className="text-fg-subtle">·</span>
                  <span className="text-info">{log.hook}</span>
                </div>
                <div
                  className={`font-sans text-xs leading-relaxed ${
                    log.level === 'success'
                      ? 'text-success-fg'
                      : log.level === 'warn'
                      ? 'text-warning-fg'
                      : log.level === 'error'
                      ? 'text-danger-fg'
                      : 'text-fg-soft'
                  }`}
                >
                  {log.message}
                </div>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        <div className="xl:col-span-5 rounded-panel bg-surface border border-line-strong flex flex-col overflow-hidden min-h-[340px]">
          <div className="px-3.5 py-2.5 border-b border-line flex items-center gap-2">
            <button
              onClick={() => setRightTab('tools')}
              className={`px-2.5 py-1 rounded-control text-xs font-mono border cursor-pointer ${
                rightTab === 'tools'
                  ? 'bg-selected text-success-fg border-success/40 font-bold'
                  : 'bg-raised text-fg-muted border-line hover:text-fg-soft'
              }`}
            >
              Tools &amp; Checks ({state.tools.length})
            </button>
            <button
              onClick={() => setRightTab('state')}
              className={`px-2.5 py-1 rounded-control text-xs font-mono border cursor-pointer ${
                rightTab === 'state'
                  ? 'bg-selected text-accent-fg border-accent/40 font-bold'
                  : 'bg-raised text-fg-muted border-line hover:text-fg-soft'
              }`}
            >
              Live Job State
            </button>
          </div>

          {rightTab === 'tools' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[420px] custom-scrollbar">
              {state.tools.length === 0 ? (
                <div className="text-xs font-mono text-fg-subtle py-8 text-center">
                  No tool or deterministic check calls emitted yet…
                </div>
              ) : (
                state.tools.map(t => (
                  <div key={t.id} className="rounded-control bg-raised border border-line p-2.5 space-y-1 font-mono text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-info font-bold">{t.name}()</span>
                      <span className="text-fg-subtle">{t.latencyMs} ms · {fmtOffset(t.offsetMs)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="px-1.5 py-0.2 rounded-control bg-surface border border-line text-fg-soft">{t.kind}</span>
                      <span className="text-fg-muted">by {t.caller}</span>
                    </div>
                    <div className="text-[11px] text-fg-subtle truncate" title={t.args}>args: {t.args}</div>
                    <div className="text-xs font-sans text-fg-soft pt-0.5">{t.summary}</div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[420px] custom-scrollbar font-mono text-xs">
              <div className="rounded-control bg-raised border border-line p-3 space-y-1.5">
                <div className="text-accent-fg font-bold uppercase text-[11px]">ArcGen Job Runtime State</div>
                {Object.entries(state.state).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2 border-t border-line/60 pt-1">
                    <span className="text-info shrink-0">{k}</span>
                    <span className="text-fg-soft text-right truncate" title={String(v)}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
