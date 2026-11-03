"use client";

/* Bias Jury panel: live view of the ArcGen jury (POST /api/arcgen/generate/stream).
 * Shows a progress stepper, each checkpoint sitting as a juror × rubric vote grid, the
 * findings that sent work back, and the iteration timeline (v1 → v2 → …) with graph diffs. */

import React, { useEffect, useState } from 'react';
import type { ArchEdge, ArchNode } from './ArcGenStudio';

// ── Stream event shapes (mirror app/jury/models.py) ─────────────────────────
export interface ItemAnswer { item_id: string; passed: boolean; cited: string[]; rejected_cites: string[]; reason: string; counted: boolean }
export interface JurorVerdict { juror: string; model: string; family: string; ok: boolean; error?: string | null; answers: ItemAnswer[]; seconds: number }
export interface ItemTally { item_id: string; question: string; severity: string; route: string; yes: number; no: number; uncited_no: number; abstain: number; failed: boolean; cited_counts: Record<string, number> }
export interface CheckpointResult {
  checkpoint: 'normalization' | 'architecture'; attempt: number; passed: boolean; voting_jurors: number;
  low_independence: boolean; excluded_families: string[]; verdicts: JurorVerdict[]; tallies: ItemTally[]; routes: string[]; feedback: string[];
}
export interface GraphDiff { nodes_added: string[]; nodes_removed: string[]; edges_added: string[]; edges_removed: string[]; style_changed?: string | null }
export interface JuryGraph { project_name: string; style: string; nodes: ArchNode[]; edges: ArchEdge[]; mermaid?: string }
export interface IterationRecord { version: number; reason: string; style: string; graph: JuryGraph; diff?: GraphDiff | null; result?: CheckpointResult | null }
export interface JuryTrace { project_name: string; verdict: 'PASS' | 'FAIL' | 'NO_JURY' | 'SKIPPED'; generator_models: string[]; iterations: IterationRecord[]; pattern_stepdowns: string[]; notes: string[] }

interface Seat { seat: string; model: string; family: string }
interface Replacement { model: string; family: string; by: string }

export type JuryEvent =
  | { type: 'stage'; message: string }
  | { type: 'panel'; checkpoint: string; attempt: number; excluded_families: string[]; replaced?: Replacement[]; jurors: Seat[] }
  | { type: 'verdict'; checkpoint: string; attempt: number; verdict: JurorVerdict }
  | { type: 'checkpoint'; result: CheckpointResult }
  | { type: 'iteration'; record: IterationRecord }
  | { type: 'complete'; result: JuryGraph & { jury?: JuryTrace; [key: string]: unknown } }
  | { type: 'error'; detail: string };

interface Sitting {
  key: string; checkpoint: string; attempt: number; jurors: Seat[];
  excluded: string[]; replaced: Replacement[]; verdicts: JurorVerdict[]; result?: CheckpointResult;
}

type StepStatus = 'active' | 'done' | 'pass' | 'fail';
export interface Step { label: string; status: StepStatus; startedAt: number; endedAt?: number; sittingKey?: string }

export interface JuryState {
  running: boolean; stage: string; startedAt: number; endedAt?: number;
  steps: Step[]; sittings: Sitting[]; iterations: IterationRecord[]; trace?: JuryTrace; error?: string;
}

export const initialJuryState = (): JuryState => ({ running: true, stage: 'Starting', startedAt: Date.now(), steps: [], sittings: [], iterations: [] });

/** Close the active step (keeping a pass/fail outcome) and optionally open a new one. */
function advance(steps: Step[], next?: Omit<Step, 'status' | 'startedAt'>): Step[] {
  const now = Date.now();
  const closed = steps.map(s => (s.status === 'active' ? { ...s, status: 'done' as StepStatus, endedAt: now } : s));
  return next ? [...closed, { ...next, status: 'active', startedAt: now }] : closed;
}

/** Stage messages from app/jury/pipeline.py -> stepper labels (unrecognised messages only update the caption). */
function stepForStage(message: string): string | null {
  if (message.startsWith('Normalizing')) return 'Normalize';
  if (message.startsWith('Re-normalizing')) return 'Re-normalize';
  if (message.startsWith('Scoring architecture patterns')) return 'Pattern scoring';
  if (message.startsWith('Jury rejected the style')) return 'Pattern step-down';
  const m = message.match(/^v(\d+): generating components/);
  return m ? `Generate v${m[1]}` : null;
}

export function juryReducer(s: JuryState, e: JuryEvent): JuryState {
  switch (e.type) {
    case 'stage': {
      const label = stepForStage(e.message);
      return { ...s, stage: e.message, steps: label ? advance(s.steps, { label }) : s.steps };
    }
    case 'panel': {
      const key = `${e.checkpoint}-${e.attempt}`;
      const label = e.checkpoint === 'normalization'
        ? `Checkpoint 1${e.attempt > 1 ? ` · retry ${e.attempt - 1}` : ''}`
        : `Checkpoint 2 · v${e.attempt}`;
      return {
        ...s,
        stage: `Jury sitting: ${label}`,
        steps: advance(s.steps, { label, sittingKey: key }),
        sittings: [...s.sittings, { key, checkpoint: e.checkpoint, attempt: e.attempt, jurors: e.jurors, excluded: e.excluded_families, replaced: e.replaced ?? [], verdicts: [] }],
      };
    }
    case 'verdict':
      return { ...s, sittings: s.sittings.map(x => x.key === `${e.checkpoint}-${e.attempt}` ? { ...x, verdicts: [...x.verdicts, e.verdict] } : x) };
    case 'checkpoint': {
      const key = `${e.result.checkpoint}-${e.result.attempt}`;
      const now = Date.now();
      return {
        ...s,
        steps: s.steps.map(st => st.sittingKey === key ? { ...st, status: e.result.passed ? 'pass' : 'fail', endedAt: now } : st),
        sittings: s.sittings.map(x => x.key === key ? { ...x, result: e.result } : x),
        iterations: e.result.checkpoint === 'architecture'
          ? s.iterations.map(it => it.version === e.result.attempt ? { ...it, result: e.result } : it)
          : s.iterations,
      };
    }
    case 'iteration':
      return { ...s, iterations: [...s.iterations, e.record] };
    case 'complete':
      return { ...s, running: false, stage: 'Done', endedAt: Date.now(), steps: advance(s.steps), trace: e.result?.jury };
    case 'error':
      return { ...s, running: false, endedAt: Date.now(), steps: advance(s.steps), error: e.detail };
  }
}

// ── Small pieces ────────────────────────────────────────────────────────────
const CHECKPOINT_TITLE: Record<string, string> = {
  normalization: 'Checkpoint 1 · Requirements vs. raw SRS',
  architecture: 'Checkpoint 2 · Architecture vs. requirements',
};

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Re-renders every second while active so elapsed times tick. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function VerdictBadge({ verdict, running, onClick }: { verdict?: string; running: boolean; onClick?: () => void }) {
  const tone = running ? 'bg-info/15 text-info border-info/30 animate-pulse'
    : verdict === 'PASS' ? 'bg-success/20 text-success-fg border-success/40'
    : verdict === 'FAIL' ? 'bg-warning/20 text-warning-fg border-warning/40'
    : 'bg-raised text-fg-muted border-line-strong';
  const text = running ? 'JURY IN SESSION' : verdict === 'PASS' ? 'JURY: PASS' : verdict === 'FAIL' ? 'JURY: FAIL' : verdict === 'NO_JURY' ? 'NO JURY' : 'JURY: —';
  const cls = `px-2 py-0.5 rounded-control text-xs font-mono font-semibold border ${tone}`;
  return onClick
    ? <button onClick={onClick} className={`${cls} cursor-pointer hover:brightness-110`} title="Open the Bias Jury tab">{text}</button>
    : <span className={cls}>{text}</span>;
}

/** Stepper: Normalize → Checkpoint 1 → Pattern scoring → Generate v1 → Checkpoint 2 · v1 → … */
export function JuryProgress({ state }: { state: JuryState }) {
  const now = useNow(state.running);
  const active = state.sittings.find(x => x.key === state.steps.find(st => st.status === 'active')?.sittingKey);
  return (
    <div className="bg-surface border border-line-strong rounded-panel p-4">
      <div className="flex items-center justify-between mb-3 text-xs font-mono">
        <span className="text-fg-subtle uppercase">Progress</span>
        <span className="text-fg-muted">{fmt((state.endedAt ?? now) - state.startedAt)} total</span>
      </div>
      <ol className="flex flex-wrap items-center gap-y-2">
        {state.steps.map((st, i) => {
          const tone = st.status === 'active' ? 'border-info/60 text-info bg-info/10'
            : st.status === 'pass' ? 'border-success/40 text-success-fg bg-success/10'
            : st.status === 'fail' ? 'border-warning/40 text-warning-fg bg-warning/10'
            : 'border-line-strong text-fg-muted';
          const icon = st.status === 'active' ? '●' : st.status === 'pass' ? '✓' : st.status === 'fail' ? '✗' : '✓';
          return (
            <li key={`${st.label}-${i}`} className="flex items-center">
              {i > 0 && <span className="mx-1.5 text-fg-subtle">→</span>}
              <span className={`px-2 py-1 rounded-control border text-xs font-mono whitespace-nowrap ${tone} ${st.status === 'active' ? 'animate-pulse' : ''}`}>
                {icon} {st.label} <span className="text-fg-subtle">{fmt((st.endedAt ?? now) - st.startedAt)}</span>
              </span>
            </li>
          );
        })}
        {state.steps.length === 0 && <li className="text-xs text-fg-subtle font-mono">Starting…</li>}
      </ol>
      {active && (
        <div className="mt-3 flex items-center gap-2 text-xs font-mono text-fg-muted">
          <span>Jurors</span>
          {active.jurors.map(j => {
            const v = active.verdicts.find(x => x.juror === j.seat);
            const dot = !v ? 'bg-line-strong animate-pulse' : v.ok ? 'bg-info' : 'bg-fg-subtle';
            return <span key={j.seat} title={`${j.seat} · ${j.model}${v ? (v.ok ? ' · voted' : ' · abstained') : ' · deliberating'}`} className={`w-2.5 h-2.5 rounded-full ${dot}`} />;
          })}
          <span>{active.verdicts.length}/{active.jurors.length} voted</span>
        </div>
      )}
    </div>
  );
}

function VoteCell({ v, itemId }: { v?: JurorVerdict; itemId: string }) {
  const box = 'inline-flex items-center justify-center w-7 h-7 rounded-control text-xs font-mono font-bold border';
  if (!v) return <span className={`${box} border-line-strong text-fg-subtle animate-pulse`} title="deliberating">…</span>;
  if (!v.ok) return <span className={`${box} border-dashed border-line-strong text-fg-subtle`} title={`abstained: ${v.error ?? 'no usable answer'}`}>–</span>;
  const a = v.answers.find(x => x.item_id === itemId);
  if (!a) return <span className={`${box} border-dashed border-line-strong text-fg-subtle`} title="did not answer this item">–</span>;
  if (a.passed) return <span className={`${box} bg-success/20 border-success/40 text-success-fg`} title={a.reason || 'yes'}>✓</span>;
  if (!a.counted) {
    const why = a.cited.length ? 'cited too much to be specific' : 'no valid citation';
    return <span className={`${box} border-warning/40 text-warning-fg/60 line-through`} title={`'no' ignored (${why}). ${a.reason}`}>✗</span>;
  }
  return (
    <span className={`${box} bg-warning/25 border-warning/50 text-warning-fg`} title={`no: ${a.cited.join(', ')}${a.reason ? ` — ${a.reason}` : ''}`}>✗</span>
  );
}

/** One segment per voting juror: amber = counted 'no', green = 'yes', grey = ignored/abstained. */
function VoteBar({ t, voters }: { t: ItemTally; voters: number }) {
  const segs = [
    ...Array(t.no).fill('bg-warning'),
    ...Array(t.yes).fill('bg-success'),
    ...Array(Math.max(0, voters - t.no - t.yes)).fill('bg-line-strong'),
  ];
  return (
    <div className="flex gap-0.5" title={`${t.no} counted no · ${t.yes} yes · ${t.uncited_no} ignored no · ${t.abstain} no answer`}>
      {segs.map((c, i) => <span key={i} className={`w-3 h-2 rounded-sm ${c}`} />)}
    </div>
  );
}

function SittingCard({ s }: { s: Sitting }) {
  const items = s.result?.tallies ?? [];
  const byJuror = new Map(s.verdicts.map(v => [v.juror, v]));
  const itemIds = items.length ? items.map(t => t.item_id) : (s.verdicts.find(v => v.ok)?.answers.map(a => a.item_id) ?? []);
  const voters = s.result?.voting_jurors ?? s.verdicts.filter(v => v.ok).length;
  return (
    <div className="bg-surface border border-line-strong rounded-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-xs font-bold text-fg-strong">
          {CHECKPOINT_TITLE[s.checkpoint] ?? s.checkpoint} <span className="font-mono text-fg-subtle">· attempt {s.attempt}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {s.replaced.map(r => (
            <span key={r.model} className="px-1.5 py-0.5 rounded-control border border-info/30 bg-info/10 text-info"
              title={`${r.model} shares the ${r.family} family with the generator, so a spare from another family sits instead`}>
              {r.model} → {r.by} (same family as generator)
            </span>
          ))}
          {s.replaced.length === 0 && s.excluded.length > 0 && <span className="text-fg-subtle">excluded family: {s.excluded.join(', ')}</span>}
          {s.result?.low_independence && <span className="text-warning-fg">low independence</span>}
          {s.result
            ? <span className={`px-2 py-0.5 rounded-control border font-semibold ${s.result.passed ? 'bg-success/20 text-success-fg border-success/40' : 'bg-warning/20 text-warning-fg border-warning/40'}`}>{s.result.passed ? 'PASS' : 'FAIL'}</span>
            : <span className="px-2 py-0.5 rounded-control border bg-info/15 text-info border-info/30 animate-pulse">voting {s.verdicts.length}/{s.jurors.length}</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="text-fg-subtle border-b border-line-strong">
            <tr>
              <th className="p-2 font-normal">Rubric item</th>
              {s.jurors.map(j => {
                const v = byJuror.get(j.seat);
                return (
                  <th key={j.seat} className="p-2 font-normal text-center whitespace-nowrap" title={v ? `${v.seconds}s` : undefined}>
                    <div className="text-fg-soft">{j.seat.replace('Juror ', 'J')}</div>
                    <div className="text-fg-subtle">{j.model.split(':')[0]}</div>
                  </th>
                );
              })}
              <th className="p-2 font-normal">Votes</th>
            </tr>
          </thead>
          <tbody>
            {(itemIds.length ? itemIds : ['…']).map(id => {
              const t = items.find(x => x.item_id === id);
              return (
                <tr key={id} className={`border-b border-line-strong/50 ${t?.failed ? 'bg-warning/10' : ''}`}>
                  <td className="p-2 align-middle">
                    <span className={`font-semibold ${t?.failed ? 'text-warning-fg' : 'text-fg-strong'}`}>{id}</span>
                    {t && <div className="font-sans text-fg-muted max-w-xs leading-snug">{t.question}</div>}
                  </td>
                  {s.jurors.map(j => <td key={j.seat} className="p-2 text-center align-middle"><VoteCell v={byJuror.get(j.seat)} itemId={id} /></td>)}
                  <td className="p-2 align-middle whitespace-nowrap">
                    {t && (
                      <div className="flex flex-col gap-1">
                        <VoteBar t={t} voters={voters} />
                        {t.failed && <span className="text-warning-fg">majority no → {t.route}</span>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-fg-subtle font-mono">
        <span><span className="text-success-fg">✓</span> yes</span>
        <span><span className="text-warning-fg">✗</span> no (cited)</span>
        <span><span className="line-through">✗</span> no ignored (uncited / unspecific)</span>
        <span>– abstained</span>
        <span>hover a cell for citations</span>
      </div>
      {s.result && s.result.feedback.length > 0 && (
        <div className="mt-3 text-xs">
          <div className="font-mono text-fg-subtle uppercase mb-1">Majority findings · sent back to {s.result.routes.join(', ')}</div>
          <ul className="space-y-1">
            {s.result.feedback.map((f, i) => <li key={i} className="text-fg-soft">{f}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function DiffRow({ sign, items, tone }: { sign: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(x => <span key={sign + x} className={`px-1.5 py-0.5 rounded-control border text-xs font-mono ${tone}`}>{sign} {x}</span>)}
    </div>
  );
}

function DiffView({ d }: { d: GraphDiff }) {
  const empty = !d.style_changed && !d.nodes_added.length && !d.nodes_removed.length && !d.edges_added.length && !d.edges_removed.length;
  if (empty) return <div className="text-xs text-fg-subtle font-mono">No structural change from the previous version.</div>;
  return (
    <div className="space-y-1.5">
      {d.style_changed && <div className="text-xs font-mono text-info">style: {d.style_changed}</div>}
      <DiffRow sign="+" items={d.nodes_added} tone="bg-success/15 text-success-fg border-success/30" />
      <DiffRow sign="−" items={d.nodes_removed} tone="bg-warning/20 text-warning-fg border-warning/30" />
      <DiffRow sign="+" items={d.edges_added} tone="bg-success/10 text-success-fg border-success/30" />
      <DiffRow sign="−" items={d.edges_removed} tone="bg-warning/10 text-warning-fg border-warning/30" />
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────
export function JuryPanel({ state, onShowVersion }: { state: JuryState; onShowVersion?: (record: IterationRecord) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const its = state.iterations;
  const current = its.find(i => i.version === selected) ?? its[its.length - 1];
  const norm = state.sittings.filter(s => s.checkpoint === 'normalization');
  const arch = state.sittings.filter(s => s.checkpoint === 'architecture');

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
      <div className="bg-surface border border-line-strong rounded-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold font-mono uppercase text-info">Bias Jury</span>
            <VerdictBadge verdict={state.trace?.verdict} running={state.running} />
          </div>
          <div className="text-xs text-fg-subtle font-mono mt-1">
            {state.error ? <span className="text-danger-fg">{state.error}</span> : state.running ? state.stage : `Generator: ${state.trace?.generator_models.join(', ') || '—'}`}
          </div>
        </div>
        <div className="text-xs text-fg-muted max-w-md font-sans">
          Five local models from different families judge blind against a fixed rubric. A finding counts only with a valid citation; votes are combined by majority in code, never by an LLM.
        </div>
      </div>

      <JuryProgress state={state} />

      {its.length > 0 && (
        <div className="bg-surface border border-line-strong rounded-panel p-4">
          <div className="text-xs font-mono text-fg-subtle uppercase mb-2">Iterations</div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {its.map((it, i) => (
              <React.Fragment key={it.version}>
                {i > 0 && <span className="text-fg-subtle">→</span>}
                <button
                  onClick={() => setSelected(it.version)}
                  className={`px-2.5 py-1 rounded-control text-xs font-mono border cursor-pointer ${current?.version === it.version ? 'bg-selected text-info border-info/40' : 'border-line-strong text-fg-muted hover:text-fg-soft'}`}
                >
                  v{it.version} · {it.style}
                  {it.result && <span className={`ml-1.5 ${it.result.passed ? 'text-success-fg' : 'text-warning-fg'}`}>{it.result.passed ? '✓' : '✗'}</span>}
                </button>
              </React.Fragment>
            ))}
          </div>
          {current && (
            <div className="space-y-2">
              <div className="text-xs text-fg-soft"><span className="font-mono text-fg-subtle">why: </span>{current.reason}</div>
              <div className="text-xs font-mono text-fg-subtle">{current.graph.nodes.length} components · {current.graph.edges.length} connections</div>
              {current.diff && <DiffView d={current.diff} />}
              {onShowVersion && (
                <button onClick={() => onShowVersion(current)} className="px-2.5 py-1 rounded-control text-xs font-mono border border-line-strong text-fg-soft hover:text-info hover:border-info/40 cursor-pointer">
                  Show v{current.version} in the diagram{current.diff ? ' (changes highlighted)' : ''}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {[...norm, ...arch].map(s => <SittingCard key={s.key} s={s} />)}

      {state.trace && (state.trace.pattern_stepdowns.length > 0 || state.trace.notes.length > 0) && (
        <div className="bg-surface border border-line-strong rounded-panel p-4 text-xs space-y-1">
          {state.trace.pattern_stepdowns.map(p => <div key={p} className="text-info font-mono">pattern step-down: {p}</div>)}
          {state.trace.notes.map(n => <div key={n} className="text-fg-muted">{n}</div>)}
        </div>
      )}
    </div>
  );
}
