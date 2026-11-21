"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../../components/Dialog';

export interface HealTraceEvent {
  type: string;
  kind?: string;
  agent?: string;
  message: string;
  ts: number;
  seq?: number;
  data?: Record<string, unknown>;
}

interface AgentStep {
  kind: string;
  title: string;
  result?: string;
  events: HealTraceEvent[];
}

interface AgentCardModel {
  id: string;
  label: string;
  sub: string;
  steps: AgentStep[];
  events: HealTraceEvent[];
  retries: number;
  error: boolean;
  untilTs?: number;
}

type CardStatus = 'waiting' | 'working' | 'done' | 'error' | 'skipped';

const AGENT_SLOTS: Array<{ id: string; label: string; sub: string; optional?: boolean }> = [
  { id: 'AssessorFilter', label: 'Assessor & Audit', sub: 'baseline + eligibility', optional: true },
  { id: 'ContextGatherer', label: 'Context Gatherer', sub: 'source files + rules' },
  { id: 'DIPPlanner', label: 'DIP Planner', sub: 'LLM port & injection design' },
  { id: 'PatchWriter', label: 'Patch Writer', sub: 'LLM search/replace diffs' },
  { id: 'SandboxVerifier', label: 'Sandbox Verifier', sub: 'guardrails + audit + tests' },
];

const AGENT_FOR_TYPE: Record<string, string> = {
  start: 'AssessorFilter',
  assess: 'AssessorFilter',
  eligible: 'AssessorFilter',
  gather: 'ContextGatherer',
  plan: 'DIPPlanner',
  patch: 'PatchWriter',
  verify: 'SandboxVerifier',
  retry: 'SandboxVerifier',
  awaiting_approval: 'SandboxVerifier',
  verified_failed: 'SandboxVerifier',
  decision: 'SandboxVerifier',
};

const STEP_STYLE: Record<string, { icon: string; cls: string }> = {
  model_start: { icon: '◆', cls: 'text-sky-400' },
  model_end: { icon: '↳', cls: 'text-sky-300' },
  tool_start: { icon: '⚙', cls: 'text-violet-300' },
  tool_end: { icon: '↳', cls: 'text-violet-300' },
  guardrail_block: { icon: '⚠', cls: 'text-rose-400' },
  error: { icon: '✕', cls: 'text-rose-400' },
  retry: { icon: '↻', cls: 'text-amber-300' },
  verification: { icon: '✓', cls: 'text-emerald-400' },
  task_end: { icon: '■', cls: 'text-emerald-300' },
  agent_start: { icon: '▶', cls: 'text-zinc-400' },
  agent_end: { icon: '✓', cls: 'text-emerald-300' },
};

const STATUS_DOT: Record<CardStatus, string> = {
  waiting: 'bg-zinc-600',
  working: 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.75)]',
  done: 'bg-emerald-500',
  error: 'bg-rose-500',
  skipped: 'border border-zinc-600 bg-transparent',
};

function fmtClock(tsSec: number): string {
  if (!Number.isFinite(tsSec)) return '--:--:--';
  return new Date(tsSec * 1000).toISOString().slice(11, 19);
}

function visibleData(data?: Record<string, unknown>): Record<string, unknown> | null {
  if (!data) return null;
  const entries = Object.entries(data).filter(([k]) => !k.startsWith('_'));
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function buildAgentCards(events: HealTraceEvent[], running: boolean): { cards: AgentCardModel[]; activeId: string | null } {
  const map = new Map<string, AgentCardModel>();
  for (const s of AGENT_SLOTS) {
    map.set(s.id, { ...s, steps: [], events: [], retries: 0, error: false });
  }

  let activeId: string | null = null;
  for (const ev of events) {
    const id: string = ev.agent || AGENT_FOR_TYPE[ev.type] || activeId || 'DIPPlanner';
    let card = map.get(id);
    if (!card) {
      card = { id, label: id, sub: 'healing step', steps: [], events: [], retries: 0, error: false };
      map.set(id, card);
    }

    if (activeId && activeId !== id) {
      const prev = map.get(activeId);
      if (prev && prev.untilTs === undefined) prev.untilTs = ev.ts;
    }
    activeId = id;
    card.untilTs = undefined;
    card.events.push(ev);

    const kind = ev.kind || ev.type;
    if (kind === 'retry') card.retries += 1;
    if (kind === 'error' || kind === 'guardrail_block' || ev.type === 'verified_failed') card.error = true;

    if (kind === 'model_end' || kind === 'tool_end') {
      const openKind = kind === 'model_end' ? 'model_start' : 'tool_start';
      const open = [...card.steps].reverse().find(s => s.kind === openKind && s.result === undefined);
      if (open) {
        open.result = ev.message;
        open.events.push(ev);
        continue;
      }
    }
    card.steps.push({ kind, title: ev.message || kind, events: [ev] });
  }

  const cards = Array.from(map.values()).filter(c => c.events.length > 0 || !AGENT_SLOTS.find(s => s.id === c.id)?.optional);
  return { cards, activeId: running ? activeId : null };
}

function EventJsonBlock({ e }: { e: HealTraceEvent }) {
  const clean = visibleData(e.data);
  return (
    <div className="mt-1 mb-1 ml-3 rounded bg-black/45 border border-line-subtle p-1.5 text-[10px] leading-4">
      <div className="text-fg-muted mb-0.5">
        {fmtClock(e.ts)} · {e.agent || e.type} · {e.kind || e.type}
      </div>
      <div className="text-fg whitespace-pre-wrap break-words">{e.message || '—'}</div>
      {clean && (
        <pre className="mt-1 max-h-52 overflow-auto text-fg-subtle whitespace-pre-wrap break-all">
          {JSON.stringify(clean, null, 2)}
        </pre>
      )}
    </div>
  );
}

function StepRow({ step }: { step: AgentStep }) {
  const [open, setOpen] = useState(false);
  const st = STEP_STYLE[step.kind] ?? { icon: '·', cls: 'text-fg-muted' };
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex gap-1.5 text-left hover:bg-raised/60 rounded px-1 py-0.5 cursor-pointer"
      >
        <span className={`${st.cls} shrink-0 w-3 text-center`}>{st.icon}</span>
        <span className={`flex-1 min-w-0 ${open ? 'whitespace-pre-wrap break-words' : 'truncate'} text-fg-soft`}>
          {step.title}
          {step.result && <span className="text-sky-300"> → {step.result}</span>}
        </span>
      </button>
      {open && step.events.map((e, i) => <EventJsonBlock key={i} e={e} />)}
    </div>
  );
}

function TraceFeedBody({
  events,
  running,
  view,
  expandedModal,
}: {
  events: HealTraceEvent[];
  running: boolean;
  view: 'agents' | 'raw';
  expandedModal?: boolean;
}) {
  const { cards, activeId } = useMemo(() => buildAgentCards(events, running), [events, running]);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [openRawIdx, setOpenRawIdx] = useState<number | null>(null);
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running || !activeId) return;
    const id = setInterval(() => setNowSec(Date.now() / 1000), 250);
    return () => clearInterval(id);
  }, [running, activeId]);

  useEffect(() => {
    if (view === 'raw' && running) endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [events.length, view, running]);

  if (!events.length) {
    return <div className="p-2 text-[10px] text-fg-muted">Waiting for healing events...</div>;
  }

  if (view === 'raw') {
    return (
      <div className={`font-mono text-[10px] leading-4 p-1.5 space-y-0.5 overflow-y-auto ${expandedModal ? 'max-h-[65vh]' : 'max-h-56'}`}>
        {events.map((e, i) => {
          const isOpen = openRawIdx === i;
          const kind = e.kind || e.type;
          const clean = visibleData(e.data);
          const isErr = kind === 'error' || kind === 'guardrail_block' || e.type === 'verified_failed';
          return (
            <div key={i} className={isErr ? 'bg-red-950/35 rounded' : ''}>
              <button
                type="button"
                onClick={() => setOpenRawIdx(isOpen ? null : i)}
                className="w-full flex gap-1.5 text-left hover:bg-raised/60 rounded px-1 py-0.5 cursor-pointer"
              >
                <span className="text-fg-muted shrink-0">{fmtClock(e.ts)}</span>
                <span className="text-emerald-400/90 shrink-0 w-24 truncate">{e.agent || e.type}</span>
                <span className={`shrink-0 w-20 truncate ${isErr ? 'text-rose-400' : 'text-sky-300'}`}>{kind}</span>
                <span className={`min-w-0 flex-1 ${isOpen ? 'whitespace-pre-wrap break-words' : 'truncate'} text-fg-soft`}>
                  {e.message}
                </span>
              </button>
              {isOpen && clean && (
                <pre className="ml-2 mb-1 max-h-52 overflow-auto rounded bg-black/45 border border-line-subtle p-1.5 text-[10px] text-fg-subtle whitespace-pre-wrap break-all">
                  {JSON.stringify(clean, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    );
  }

  return (
    <div className={`p-1.5 space-y-1 overflow-y-auto ${expandedModal ? 'max-h-[65vh]' : 'max-h-60'}`}>
      {cards.map(c => {
        const status: CardStatus =
          c.events.length === 0
            ? running
              ? 'waiting'
              : 'skipped'
            : activeId === c.id
              ? 'working'
              : c.error
                ? 'error'
                : 'done';
        const firstTs = c.events[0]?.ts;
        const lastTs = c.untilTs ?? c.events[c.events.length - 1]?.ts;
        const elapsed =
          firstTs !== undefined
            ? Math.max(0, (status === 'working' ? nowSec : (lastTs ?? firstTs)) - firstTs)
            : null;
        const isOpen = openCard === c.id || (status === 'error' && !running && openCard === null && c.id === 'SandboxVerifier');
        const lastStep = c.steps[c.steps.length - 1];
        const summary =
          status === 'waiting'
            ? c.sub
            : status === 'skipped'
              ? `skipped · ${c.sub}`
              : lastStep
                ? `${lastStep.title}${lastStep.result ? ` → ${lastStep.result}` : ''}`
                : c.sub;

        return (
          <div
            key={c.id}
            className={`rounded border transition-colors ${
              status === 'working'
                ? 'border-amber-500/45 bg-amber-500/[0.06]'
                : status === 'error'
                  ? 'border-rose-700/60 bg-rose-950/20'
                  : 'border-line-subtle bg-surface/60'
            }`}
          >
            <button
              type="button"
              disabled={!c.events.length}
              onClick={() => setOpenCard(isOpen ? '' : c.id)}
              className="w-full text-left px-2 py-1 disabled:cursor-default cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                <span className={`text-[11px] font-semibold truncate ${status === 'waiting' || status === 'skipped' ? 'text-fg-muted' : 'text-fg'}`}>
                  {c.label}
                </span>
                {c.retries > 0 && (
                  <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300">retry ×{c.retries}</span>
                )}
                {c.error && <span className="text-[9px] px-1 rounded bg-rose-500/20 text-rose-300">blocked</span>}
                <span className="flex-1" />
                {elapsed !== null && (
                  <span className="text-[10px] text-fg-muted tabular-nums">{elapsed.toFixed(1)}s</span>
                )}
                {c.events.length > 0 && <span className="text-[10px] text-fg-muted">{isOpen ? '▾' : '▸'}</span>}
              </div>
              <div className="mt-0.5 pl-3 text-[10px] truncate text-fg-subtle" title={summary}>
                {summary}
              </div>
            </button>
            {isOpen && c.steps.length > 0 && (
              <div className="px-1.5 pb-1.5 pt-1 border-t border-line-subtle/70 font-mono text-[10px] space-y-0.5">
                {c.steps.map((s, i) => (
                  <StepRow key={i} step={s} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Live agai-style LangGraph healing trace feed with Agents/Raw toggle and expandable modal. */
export function HealTraceView({ events, running }: { events: HealTraceEvent[]; running: boolean }) {
  const [view, setView] = useState<'agents' | 'raw'>('agents');
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="rounded border border-line-subtle bg-surface/50 overflow-hidden">
      <div className="flex items-center gap-1 px-1.5 py-1 bg-canvas border-b border-line-subtle">
        {(['agents', 'raw'] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
              view === v ? 'bg-raised text-fg font-bold' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {v === 'agents' ? 'Agents' : 'Raw trace'}
          </button>
        ))}
        <span className="flex-1" />
        <span className="text-[10px] text-fg-muted tabular-nums">{events.length} events</span>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          title="Open expanded trace inspector"
          className="text-[10px] px-1.5 py-0.5 rounded border border-line-subtle text-fg-muted hover:text-fg cursor-pointer"
        >
          Expand
        </button>
      </div>

      <TraceFeedBody events={events} running={running} view={view} />

      {modalOpen && (
        <Dialog
          onClose={() => setModalOpen(false)}
          label="Healing Agent Trace"
          className="flex items-center justify-center p-4"
          backdrop="backdrop:bg-black/75 backdrop:backdrop-blur-xs"
        >
          <div
            className="bg-surface border border-line rounded-dialog max-w-[780px] w-full shadow-raised overflow-hidden flex flex-col font-mono"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 border-b border-line-subtle bg-canvas flex items-center gap-2">
              <span className="text-xs font-bold text-fg uppercase tracking-wider">Healing Agent Trace</span>
              <div className="flex items-center gap-1 ml-2">
                {(['agents', 'raw'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                      view === v ? 'bg-raised text-fg font-bold' : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    {v === 'agents' ? 'Agents' : 'Raw trace'}
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              <span className="text-[11px] text-fg-muted tabular-nums">{events.length} events</span>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-xs text-fg-muted hover:text-fg px-2 py-0.5 rounded border border-line cursor-pointer"
              >
                Close ✕
              </button>
            </div>
            <TraceFeedBody events={events} running={running} view={view} expandedModal />
          </div>
        </Dialog>
      )}
    </div>
  );
}
