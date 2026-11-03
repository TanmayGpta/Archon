"use client";

/* Bias Jury panel: live view of the ArcGen jury (POST /api/arcgen/generate/stream).
 * Shows each checkpoint sitting as a juror × rubric grid, the findings that sent work back,
 * and the iteration timeline (v1 → v2 → …) with per-version graph diffs. */

import React, { useState } from 'react';
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

export type JuryEvent =
  | { type: 'stage'; message: string }
  | { type: 'panel'; checkpoint: string; attempt: number; excluded_families: string[]; jurors: { seat: string; model: string; family: string }[] }
  | { type: 'verdict'; checkpoint: string; attempt: number; verdict: JurorVerdict }
  | { type: 'checkpoint'; result: CheckpointResult }
  | { type: 'iteration'; record: IterationRecord }
  | { type: 'complete'; result: JuryGraph & { jury?: JuryTrace; [key: string]: unknown } }
  | { type: 'error'; detail: string };

interface Sitting {
  key: string; checkpoint: string; attempt: number;
  jurors: { seat: string; model: string; family: string }[];
  excluded: string[]; verdicts: JurorVerdict[]; result?: CheckpointResult;
}

export interface JuryState { running: boolean; stage: string; sittings: Sitting[]; iterations: IterationRecord[]; trace?: JuryTrace; error?: string }

export const initialJuryState = (): JuryState => ({ running: true, stage: 'Starting', sittings: [], iterations: [] });

export function juryReducer(s: JuryState, e: JuryEvent): JuryState {
  switch (e.type) {
    case 'stage':
      return { ...s, stage: e.message };
    case 'panel':
      return {
        ...s, stage: `Jury sitting: ${e.checkpoint} (attempt ${e.attempt})`,
        sittings: [...s.sittings, { key: `${e.checkpoint}-${e.attempt}`, checkpoint: e.checkpoint, attempt: e.attempt, jurors: e.jurors, excluded: e.excluded_families, verdicts: [] }],
      };
    case 'verdict':
      return { ...s, sittings: s.sittings.map(x => x.key === `${e.checkpoint}-${e.attempt}` ? { ...x, verdicts: [...x.verdicts, e.verdict] } : x) };
    case 'checkpoint': {
      const key = `${e.result.checkpoint}-${e.result.attempt}`;
      return {
        ...s,
        sittings: s.sittings.map(x => x.key === key ? { ...x, result: e.result } : x),
        iterations: e.result.checkpoint === 'architecture'
          ? s.iterations.map(it => it.version === e.result.attempt ? { ...it, result: e.result } : it)
          : s.iterations,
      };
    }
    case 'iteration':
      return { ...s, iterations: [...s.iterations, e.record] };
    case 'complete':
      return { ...s, running: false, stage: 'Done', trace: e.result?.jury };
    case 'error':
      return { ...s, running: false, error: e.detail };
  }
}

// ── View ──────────────────────────────────────────────────────────────────
const CHECKPOINT_TITLE: Record<string, string> = {
  normalization: 'Checkpoint 1 · Requirements vs. raw SRS',
  architecture: 'Checkpoint 2 · Architecture vs. requirements',
};

function VerdictBadge({ verdict, running }: { verdict?: string; running: boolean }) {
  if (running) return <span className="px-2 py-0.5 rounded-control text-xs font-mono font-semibold bg-info/15 text-info border border-info/30 animate-pulse">IN SESSION</span>;
  const tone = verdict === 'PASS' ? 'bg-success/20 text-success-fg border-success/40'
    : verdict === 'FAIL' ? 'bg-warning/20 text-warning-fg border-warning/40'
    : 'bg-raised text-fg-muted border-line-strong';
  return <span className={`px-2 py-0.5 rounded-control text-xs font-mono font-semibold border ${tone}`}>{verdict ?? '—'}</span>;
}

function Cell({ v, itemId }: { v?: JurorVerdict; itemId: string }) {
  if (!v) return <span className="text-fg-subtle animate-pulse">…</span>;
  if (!v.ok) return <span className="text-fg-subtle" title={v.error ?? 'abstained'}>abst.</span>;
  const a = v.answers.find(x => x.item_id === itemId);
  if (!a) return <span className="text-fg-subtle" title="no answer">–</span>;
  if (a.passed) return <span className="text-success-fg font-semibold" title={a.reason}>yes</span>;
  if (!a.counted) {
    const why = a.cited.length ? 'cites too much to be specific' : 'no valid citation';
    return <span className="text-fg-subtle line-through" title={`'no' ignored: ${why}. ${a.reason}`}>no</span>;
  }
  return (
    <span className="text-warning-fg font-semibold" title={a.reason}>
      no <span className="font-normal text-fg-muted">{a.cited.slice(0, 3).join(', ')}{a.cited.length > 3 ? '…' : ''}</span>
    </span>
  );
}

function SittingCard({ s }: { s: Sitting }) {
  const items = s.result?.tallies ?? [];
  const byJuror = new Map(s.verdicts.map(v => [v.juror, v]));
  const itemIds = items.length ? items.map(t => t.item_id) : (s.verdicts[0]?.answers.map(a => a.item_id) ?? []);
  return (
    <div className="bg-surface border border-line-strong rounded-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-xs font-bold text-fg-strong">
          {CHECKPOINT_TITLE[s.checkpoint] ?? s.checkpoint} <span className="font-mono text-fg-subtle">· attempt {s.attempt}</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          {s.excluded.length > 0 && <span className="text-fg-subtle">excluded family: {s.excluded.join(', ')}</span>}
          {s.result?.low_independence && <span className="text-warning-fg">low independence</span>}
          {s.result ? <VerdictBadge verdict={s.result.passed ? 'PASS' : 'FAIL'} running={false} /> : <VerdictBadge running />}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="text-fg-subtle border-b border-line-strong">
            <tr>
              <th className="p-2">Item</th>
              {s.jurors.map(j => (
                <th key={j.seat} className="p-2 whitespace-nowrap">
                  {j.seat}<div className="font-normal text-fg-subtle">{j.model}{byJuror.get(j.seat) ? ` · ${byJuror.get(j.seat)!.seconds}s` : ''}</div>
                </th>
              ))}
              <th className="p-2">Votes</th>
            </tr>
          </thead>
          <tbody>
            {(itemIds.length ? itemIds : ['…']).map(id => {
              const t = items.find(x => x.item_id === id);
              return (
                <tr key={id} className={`border-b border-line-strong/50 ${t?.failed ? 'bg-warning/10' : ''}`}>
                  <td className="p-2 align-top" title={t?.question}>
                    <span className="font-semibold text-fg-strong">{id}</span>
                    {t && <div className="font-sans text-fg-muted max-w-xs">{t.question}</div>}
                  </td>
                  {s.jurors.map(j => <td key={j.seat} className="p-2 align-top"><Cell v={byJuror.get(j.seat)} itemId={id} /></td>)}
                  <td className="p-2 align-top whitespace-nowrap">
                    {t ? <span className={t.failed ? 'text-warning-fg font-semibold' : 'text-fg-muted'}>{t.no} no / {t.yes} yes{t.failed ? ` → ${t.route}` : ''}</span> : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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

export function JuryPanel({ state, onShowVersion }: { state: JuryState; onShowVersion?: (graph: JuryGraph) => void }) {
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
                <button onClick={() => onShowVersion(current.graph)} className="px-2.5 py-1 rounded-control text-xs font-mono border border-line-strong text-fg-soft hover:text-info hover:border-info/40 cursor-pointer">
                  Show v{current.version} in the diagram
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
