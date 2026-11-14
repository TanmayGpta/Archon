'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent } from './useAgaiSession';

// ---------------------------------------------------------------------------------------------- model
// The SSE event log is folded into one card per agent. Pure, so it re-derives safely on every new event.

type Group = 'engine' | 'adk' | 'crewai';
type Status = 'waiting' | 'working' | 'done' | 'error' | 'skipped';

export interface Step {
  kind: string;
  title: string;
  result?: string;        // tool_end message merged into its tool_start
  events: AgentEvent[];
}

interface Card {
  id: string;
  label: string;
  sub: string;
  group: Group;
  events: AgentEvent[];
  steps: Step[];
  retries: number;
  tools: number;
  error: boolean;
  until?: string;         // when the next agent took over (single-event cards would otherwise read 0s)
}

interface Pipeline {
  cards: Card[];
  gateway: AgentEvent[];
  pipelinePrompt: string | null;
  a2a: AgentEvent[];
  current: Partial<Record<Group, string>>;
  done: Record<Group, boolean>;
  healthBefore: number | null;
  healthAfter: number | null;
}

const SLOTS: { id: string; label: string; sub: string; group: Group; match?: RegExp }[] = [
  { id: 'engine', label: 'Archon Engine', sub: 'deterministic AST scan', group: 'engine' },
  { id: 'AuditAgent', label: 'AuditAgent', sub: 'ADK · MCP tool use', group: 'adk' },
  { id: 'ReportAgent', label: 'ReportAgent', sub: 'ADK · structured output', group: 'adk' },
  { id: 'purist', label: 'Purist', sub: 'CrewAI · debate', group: 'crewai', match: /purist/i },
  { id: 'pragmatist', label: 'Pragmatist', sub: 'CrewAI · debate', group: 'crewai', match: /pragmatist/i },
  { id: 'arbiter', label: 'Chief Architect', sub: 'CrewAI · arbiter / planner', group: 'crewai', match: /arbiter|architect|chief/i },
  { id: 'specialist', label: 'Refactoring Specialist', sub: 'CrewAI · patch writer', group: 'crewai', match: /specialist|refactor/i },
  { id: 'verifier', label: 'Conformance Verifier', sub: 'CrewAI · sandbox evaluator', group: 'crewai', match: /verifier|conformance/i },
];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function buildPipeline(events: AgentEvent[]): Pipeline {
  const cards = new Map<string, Card>();
  const fresh = (s: { id: string; label: string; sub: string; group: Group }): Card =>
    ({ ...s, events: [], steps: [], retries: 0, tools: 0, error: false });
  const resetGroup = (groups: Group[]) => {
    for (const s of SLOTS) if (groups.includes(s.group)) cards.set(s.id, fresh(s));
    for (const [id, c] of cards) if (groups.includes(c.group) && !SLOTS.some((s) => s.id === id)) cards.delete(id);
  };
  resetGroup(['engine', 'adk', 'crewai']);

  const p: Pipeline = {
    cards: [], gateway: [], pipelinePrompt: null, a2a: [], current: {},
    done: { engine: false, adk: false, crewai: false }, healthBefore: null, healthAfter: null,
  };

  const crewSlot = (agent?: string | null) => agent ? SLOTS.find((s) => s.match?.test(agent))?.id : undefined;

  let lastCard: string | undefined;
  const handOff = (ts: string, to?: string) => {
    const prev = lastCard ? cards.get(lastCard) : undefined;
    if (prev && lastCard !== to) prev.until = ts;
    lastCard = to;
  };

  const push = (id: string, e: AgentEvent) => {
    handOff(e.ts, id);
    let c = cards.get(id);
    if (!c) { c = fresh({ id, label: id, sub: e.framework.toUpperCase(), group: e.framework === 'crewai' ? 'crewai' : 'adk' }); cards.set(id, c); }
    c.until = undefined;
    c.events.push(e);
    if (e.kind === 'error' || e.kind === 'guardrail_block' || e.kind === 'tool_output_invalid') c.error = true;
    if (e.kind === 'tool_end') {
      const open = [...c.steps].reverse().find((s) => s.kind === 'tool_start' && s.result === undefined);
      if (open) { open.result = e.message; open.events.push(e); return; }
    }
    if (e.kind === 'tool_start' || e.kind === 'tool_call') c.tools += 1;
    c.steps.push({ kind: e.kind, title: e.message, events: [e] });
    p.current[c.group] = id;
  };

  for (const e of events) {
    switch (e.framework) {
      case 'gateway':
        if (e.kind === 'audit_scan') {
          resetGroup(['engine', 'adk', 'crewai']);   // a new audit discards the previous heal (as the gateway does)
          lastCard = undefined; p.a2a = []; p.current = {};
          p.done.engine = true; p.done.adk = false; p.done.crewai = false; p.pipelinePrompt = null;
          const h = /health=([\d.]+)/.exec(e.message);
          p.healthBefore = h ? Number(h[1]) : null; p.healthAfter = null;
          push('engine', e);
        } else if (e.kind === 'audit_done') {
          p.done.adk = true; handOff(e.ts);
        } else if (e.kind === 'heal_done') {
          p.done.crewai = true; handOff(e.ts);
        } else if (e.kind === 'info' && p.current.adk) {
          push(p.current.adk, e);       // the narrative-synthesis note belongs to the ADK run it describes
        } else if (e.kind !== 'heartbeat' || !p.current.crewai) {
          p.gateway.push(e);
        }
        break;
      case 'adk':
        if (/pipeline/i.test(e.agent ?? '')) {
          if (e.kind === 'agent_start') p.pipelinePrompt = e.message;
          break;
        }
        push(e.agent || p.current.adk || 'AuditAgent', e);
        break;
      case 'a2a':
        if (e.kind === 'a2a_send') {
          resetGroup(['crewai']);
          p.a2a = []; p.done.crewai = false; p.current.crewai = undefined;
        }
        p.a2a.push(e);
        break;
      case 'crewai': {
        let id = crewSlot(e.agent);
        if (!id && (e.kind === 'verification' || (e.kind === 'retry' && e.message.startsWith('Verifier rejected')))) id = 'verifier';
        if (!id) id = p.current.crewai ?? 'arbiter';
        if (e.kind === 'retry' && id === 'verifier') cards.get('verifier')!.retries += 1;
        if (e.kind === 'verification') {
          p.healthBefore = num(e.data?.health_before) ?? p.healthBefore;
          p.healthAfter = num(e.data?.health_after);
        }
        if (e.kind === 'flow_end') { p.done.crewai = true; handOff(e.ts); break; }
        push(id, e);
        break;
      }
      case 'guardrail': {
        const target = (e.agent && (crewSlot(e.agent) ?? (cards.has(e.agent) ? e.agent : undefined)))
          ?? p.current.crewai ?? p.current.adk;
        if (target) push(target, e); else p.gateway.push(e);
        break;
      }
    }
  }
  p.cards = [...cards.values()];
  return p;
}

const statusOf = (c: Card, p: Pipeline): Status => {
  if (c.error) return 'error';
  if (!c.events.length) return p.done[c.group] ? 'skipped' : 'waiting';
  return !p.done[c.group] && p.current[c.group] === c.id ? 'working' : 'done';
};

const summaryOf = (c: Card): string => {
  const lastTool = [...c.steps].reverse().find((s) => s.result);
  if (lastTool) return `${lastTool.title} → ${lastTool.result}`;
  return c.events[c.events.length - 1]?.message ?? '';
};

const secs = (a: string, b: string) => Math.max(0, (Date.parse(b) - Date.parse(a)) / 1000);

// ----------------------------------------------------------------------------------------------- view

const STEP_STYLE: Record<string, { icon: string; cls: string }> = {
  model_start: { icon: '◆', cls: 'text-sky-400' },
  model_end: { icon: '↳', cls: 'text-sky-300/70' },
  tool_start: { icon: '⚙', cls: 'text-violet-300' },
  tool_call: { icon: '⚙', cls: 'text-violet-300' },
  guardrail_block: { icon: '⚠', cls: 'text-rose-400' },
  tool_output_invalid: { icon: '⚠', cls: 'text-rose-400' },
  error: { icon: '✕', cls: 'text-rose-400' },
  retry: { icon: '↻', cls: 'text-amber-300' },
  verification: { icon: '✓', cls: 'text-emerald-400' },
  task_end: { icon: '■', cls: 'text-amber-300' },
};

const DOT: Record<Status, string> = {
  waiting: 'bg-zinc-700',
  working: 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.7)]',
  done: 'bg-emerald-500',
  error: 'bg-rose-500',
  skipped: 'border border-zinc-600 bg-transparent',
};

const GROUP_STYLE: Record<Group, { title: string; text: string; border: string }> = {
  engine: { title: 'Ground truth', text: 'text-zinc-400', border: 'border-zinc-700/60' },
  adk: { title: 'Google ADK · audit', text: 'text-sky-400', border: 'border-sky-900/60' },
  crewai: { title: 'CrewAI · healing flow', text: 'text-amber-400', border: 'border-amber-900/60' },
};

function EventDetail({ e }: { e: AgentEvent }) {
  const hasData = e.data && Object.keys(e.data).length > 0;
  return (
    <div className="mt-1 mb-1.5 ml-4 rounded bg-black/40 border border-white/5 p-2 text-[10.5px] leading-4">
      <div className="text-zinc-500 mb-1">{e.ts.slice(11, 19)} · {e.framework} · {e.kind}{e.agent ? ` · ${e.agent}` : ''}</div>
      <div className="text-zinc-200 whitespace-pre-wrap break-words">{e.message || '—'}</div>
      {hasData && (
        <pre className="mt-1.5 max-h-60 overflow-auto text-zinc-400 whitespace-pre-wrap break-all">{JSON.stringify(e.data, null, 2)}</pre>
      )}
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  const st = STEP_STYLE[step.kind] ?? { icon: '·', cls: 'text-zinc-500' };
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full flex gap-2 text-left hover:bg-white/5 rounded px-1 py-0.5">
        <span className={`${st.cls} shrink-0 w-3 text-center`}>{st.icon}</span>
        <span className={`flex-1 min-w-0 ${open ? 'whitespace-pre-wrap break-words' : 'truncate'} text-zinc-300`}>
          {step.title || step.kind}
          {step.result !== undefined && <span className="text-emerald-300/90"> → {step.result}</span>}
        </span>
      </button>
      {open && step.events.map((e, i) => <EventDetail key={i} e={e} />)}
    </div>
  );
}

function AgentCard({ c, p, open, onToggle, now }: { c: Card; p: Pipeline; open: boolean; onToggle: () => void; now: number }) {
  const status = statusOf(c, p);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (status === 'working') ref.current?.scrollIntoView({ block: 'nearest' }); }, [status]);
  const first = c.events[0]?.ts;
  const last = c.events[c.events.length - 1]?.ts;
  const elapsed = first ? (status === 'working' ? Math.max(0, (now - Date.parse(first)) / 1000) : secs(first, c.until ?? last!)) : null;
  return (
    <div ref={ref} className={`rounded-md border transition-colors ${
      status === 'working' ? 'border-amber-500/40 bg-amber-500/[0.04]'
        : status === 'error' ? 'border-rose-800/60 bg-rose-950/20'
          : open ? 'border-white/15 bg-white/[0.03]' : 'border-white/[0.06] bg-white/[0.015]'}`}>
      <button onClick={onToggle} disabled={!c.events.length}
        className="w-full text-left px-2.5 py-1.5 disabled:cursor-default">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[status]}`} />
          <span className={`text-[12px] font-medium ${status === 'waiting' || status === 'skipped' ? 'text-zinc-600' : 'text-zinc-100'}`}>{c.label}</span>
          {c.retries > 0 && <span className="text-[9.5px] px-1 rounded bg-amber-500/15 text-amber-300">retry ×{c.retries}</span>}
          {c.error && <span className="text-[9.5px] px-1 rounded bg-rose-500/15 text-rose-300">blocked</span>}
          <span className="flex-1" />
          {c.tools > 0 && <span className="text-[10px] text-zinc-500">{c.tools} tool{c.tools > 1 ? 's' : ''}</span>}
          {elapsed !== null && <span className="text-[10px] text-zinc-500 tabular-nums">{elapsed.toFixed(1)}s</span>}
          {c.events.length > 0 && <span className="text-[10px] text-zinc-600">{open ? '▾' : '▸'}</span>}
        </div>
        <div className={`mt-0.5 pl-4 text-[10.5px] truncate ${status === 'waiting' || status === 'skipped' ? 'text-zinc-700' : 'text-zinc-500'}`}>
          {status === 'waiting' ? c.sub : status === 'skipped' ? `skipped · ${c.sub}`
            : status === 'working' ? `working… ${summaryOf(c)}` : summaryOf(c)}
        </div>
      </button>
      {open && (
        <div className="px-2 pb-2 pt-0.5 border-t border-white/5 font-mono text-[10.5px] leading-5">
          {c.steps.map((s, i) => <StepRow key={i} step={s} />)}
        </div>
      )}
    </div>
  );
}

function CountUp({ start: initial, value }: { start: number; value: number }) {
  const [shown, setShown] = useState(initial);
  const current = useRef(initial);   // last painted value; a re-run (or StrictMode remount) resumes from here
  useEffect(() => {
    const start = current.current;
    if (start === value) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1200);
      current.current = start + (value - start) * (1 - Math.pow(1 - k, 3));
      setShown(current.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown.toFixed(1)}</>;
}

const healthCls = (h: number) => (h >= 90 ? 'text-emerald-400' : h >= 70 ? 'text-amber-400' : 'text-rose-400');

function A2AConnector({ events, crewStarted }: { events: AgentEvent[]; crewStarted: boolean }) {
  const [open, setOpen] = useState(false);
  const sent = events.some((e) => e.kind === 'a2a_send');
  const back = events.some((e) => e.kind === 'a2a_result');
  const live = sent && !back;
  return (
    <div className="flex flex-col items-center py-1">
      <button onClick={() => events.length && setOpen(!open)}
        className={`flex items-center gap-2 text-[10px] px-2 py-0.5 rounded-full border ${
          live ? 'border-fuchsia-500/50 text-fuchsia-300 animate-pulse' : sent ? 'border-fuchsia-900/60 text-fuchsia-400/80' : 'border-white/5 text-zinc-700'}`}>
        <span>⇣</span>
        <span className="font-mono">A2A · HealingRequest{back ? ' ⇄ HealingReport ✓' : live && crewStarted ? ' → crew working' : live ? ' → sending' : ''}</span>
      </button>
      {open && <div className="w-full">{events.map((e, i) => <EventDetail key={i} e={e} />)}</div>}
    </div>
  );
}

export function AgentPipeline({ events }: { events: AgentEvent[] }) {
  const p = useMemo(() => buildPipeline(events), [events]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [gwOpen, setGwOpen] = useState(false);
  const anyWorking = p.cards.some((c) => statusOf(c, p) === 'working');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anyWorking) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [anyWorking]);

  if (!events.length) {
    return <div className="p-3 text-xs text-zinc-600">No agent activity yet. Run an audit to see the agents work.</div>;
  }

  const crewStarted = p.cards.some((c) => c.group === 'crewai' && c.events.length);
  // The healing crew only appears once a heal is dispatched (A2A send), not as a preview during the audit.
  const groups: Group[] = p.a2a.length || crewStarted ? ['engine', 'adk', 'crewai'] : ['engine', 'adk'];
  const lastGw = p.gateway[p.gateway.length - 1];

  return (
    <div className="p-2 space-y-1.5 text-[11px]">
      {lastGw && (
        <div>
          <button onClick={() => setGwOpen(!gwOpen)} className="w-full flex gap-2 text-left text-[10px] text-zinc-600 hover:text-zinc-400 px-1">
            <span className="shrink-0">gateway</span>
            <span className="truncate flex-1">{lastGw.kind} · {lastGw.message}</span>
            <span>{gwOpen ? '▾' : `▸ ${p.gateway.length}`}</span>
          </button>
          {gwOpen && p.gateway.map((e, i) => <EventDetail key={i} e={e} />)}
        </div>
      )}

      {groups.map((g) => (
        <div key={g}>
          {g === 'crewai' && <A2AConnector events={p.a2a} crewStarted={crewStarted} />}
          <div className={`rounded-lg border ${GROUP_STYLE[g].border} p-1.5 space-y-1`}>
            <div className={`px-1 text-[9.5px] uppercase tracking-wider ${GROUP_STYLE[g].text}`}>
              {GROUP_STYLE[g].title}
            </div>
            {g === 'adk' && p.pipelinePrompt && (
              <div className="px-1 text-[10px] text-zinc-500 truncate" title={p.pipelinePrompt}>
                SequentialAgent · “{p.pipelinePrompt}”
              </div>
            )}
            {p.cards.filter((c) => c.group === g).map((c) => (
              <AgentCard key={c.id} c={c} p={p} now={now}
                open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
            ))}
          </div>
        </div>
      ))}

      {p.healthBefore !== null && (
        <div className="flex items-center justify-between rounded-md border border-white/[0.06] px-2.5 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {p.healthAfter !== null ? 'Sandbox health' : 'Audit health'}
          </span>
          <span className="font-mono text-[13px]">
            <span className={healthCls(p.healthBefore)}>{p.healthBefore.toFixed(1)}</span>
            {p.healthAfter !== null && (
              <>
                <span className="text-zinc-600"> ──▶ </span>
                <b className={healthCls(p.healthAfter)}><CountUp start={p.healthBefore} value={p.healthAfter} /></b>
                {p.healthAfter > p.healthBefore && <span className="text-emerald-400"> ✓</span>}
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
