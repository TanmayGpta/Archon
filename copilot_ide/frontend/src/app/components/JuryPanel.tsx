"use client";

/* Review panel for the ArcGen bias jury (POST /api/arcgen/generate/stream).
 *
 * Written for someone who has never seen the pipeline: it opens with the outcome in plain words,
 * explains what was checked, shows each reviewer's answer with its reason and evidence inline, and
 * says why each new draft of the design was made. The raw rubric IDs stay available but secondary. */

import React, { useEffect, useMemo, useState } from 'react';
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
/** A review step can cover several checkpoints judged in one sitting. */
export interface Step { label: string; status: StepStatus; startedAt: number; endedAt?: number; sittingKeys?: string[]; sittingKey?: string }

export interface JuryState {
  running: boolean; stage: string; startedAt: number; endedAt?: number;
  steps: Step[]; sittings: Sitting[]; iterations: IterationRecord[]; trace?: JuryTrace; error?: string;
}

export const initialJuryState = (): JuryState => ({ running: true, stage: 'Starting', startedAt: Date.now(), steps: [], sittings: [], iterations: [] });

// ── Plain-language vocabulary ───────────────────────────────────────────────
const CHECK = {
  normalization: {
    name: 'Requirements check',
    what: 'Did the AI read your requirements correctly? Reviewers compare the requirement list it extracted with what you actually wrote.',
  },
  architecture: {
    name: 'Design check',
    what: 'Does the generated architecture fit those requirements, without missing pieces or over-engineering?',
  },
} as const;

/** Rubric item → short title, plain question, and the name of the problem when it fails. */
const ITEM: Record<string, { title: string; ask: string; problem: string }> = {
  N1: { title: 'Nothing missing', ask: 'Is everything you wrote captured in the extracted requirements?', problem: 'Requirements missing' },
  N2: { title: 'Nothing invented', ask: 'Is every extracted requirement backed by your text, with nothing made up or exaggerated?', problem: 'Invented requirements' },
  N3: { title: 'Key requirements justified', ask: 'Is every requirement marked as key (ASR) backed by a concrete statement about scale, speed, consistency, availability, security, deployment or cost?', problem: 'Unjustified key requirements' },
  A1: { title: 'Key requirements covered', ask: 'Does some component actually deliver each key requirement?', problem: 'Key requirement not covered' },
  A2: { title: 'Style fits', ask: 'Does the chosen architecture style suit every key requirement?', problem: "Architecture style doesn't fit" },
  A3: { title: 'No unneeded technology', ask: 'Is every piece of infrastructure (broker, cache, queue, gateway…) needed by a requirement, not just added because it is popular?', problem: 'Unneeded technology' },
  A4: { title: 'Right-sized', ask: 'Is the number of components proportionate to the stated scale?', problem: 'Over-engineered' },
  A5: { title: 'Connections justified', ask: 'Does every connection stand for a real call or data flow a requirement needs?', problem: 'Unneeded connections' },
};

const shortModel = (m: string) => m.split(':')[0];

/** Backend findings are worded for the generator LLM; make them readable. */
function plainFinding(f: string): { id: string; title: string; text: string } {
  const m = f.match(/^\[([A-Z]\d+)\]\s*([\s\S]*)$/);
  const id = m?.[1] ?? '';
  const text = (m?.[2] ?? f)
    .replace(/\bthe raw SRS\b/gi, 'your input')
    .replace(/\braw SRS\b/gi, 'your input')
    .replace(/\bnormalized (requirements|list)\b/gi, 'extracted requirements')
    .replace(/\bL(\d+)\b/g, 'line $1');
  return { id, title: ITEM[id]?.problem ?? id, text };
}

/** "pattern step-down: A -> B; regenerate components: [A1], [A3]" → sentences. */
function plainReason(reason: string): string[] {
  if (!reason || reason === 'initial') return ['First draft, built straight from the requirements.'];
  return reason.split('; ').map(part => {
    const ids = (part.match(/\[([A-Z]\d+)\]/g) ?? []).map(x => x.slice(1, -1));
    const names = ids.map(i => ITEM[i]?.problem.toLowerCase() ?? i).join(', ');
    if (part.startsWith('pattern step-down:')) {
      const [from, to] = part.replace('pattern step-down:', '').split('->').map(s => s.trim());
      return `Reviewers said the ${from} style doesn't fit, so this draft switches to ${to}, the next best match.`;
    }
    if (part.startsWith('regenerate components')) return `Components rebuilt to fix: ${names || 'reviewer findings'}.`;
    if (part.startsWith('regenerate connections')) return `Connections redrawn to fix: ${names || 'reviewer findings'}.`;
    if (part.startsWith('re-normalized SRS')) return 'Your requirements were re-read after the requirements check failed, so the design was rebuilt on the corrected list.';
    return part;
  });
}

type Vote =
  | { kind: 'pending' } | { kind: 'abstain'; why: string } | { kind: 'skipped' }
  | { kind: 'ok'; reason: string } | { kind: 'problem'; reason: string; cited: string[] }
  | { kind: 'ignored'; reason: string; why: string };

function voteOf(v: JurorVerdict | undefined, itemId: string): Vote {
  if (!v) return { kind: 'pending' };
  if (!v.ok) return { kind: 'abstain', why: v.error ?? 'no usable answer' };
  const a = v.answers.find(x => x.item_id === itemId);
  if (!a) return { kind: 'skipped' };
  if (a.passed) return { kind: 'ok', reason: a.reason };
  if (a.counted) return { kind: 'problem', reason: a.reason, cited: a.cited };
  return {
    kind: 'ignored', reason: a.reason,
    why: a.cited.length ? 'it flagged almost everything instead of naming the specific problem' : "it didn't point to the requirement or component that is wrong",
  };
}

/** Explain an abstention in words a user can act on. */
function abstainHint(error: string): string {
  const e = (error || '').toLowerCase();
  if (e.includes('not found') || e.includes('pull')) return 'model is not installed in Ollama';
  if (e.includes('timeout') || e.includes('timed out')) return 'took too long to answer';
  if (e.includes('connect') || e.includes('econnrefused')) return "couldn't reach Ollama / API";
  if (e.includes('rate_limit') || e.includes('429') || e.includes('quota') || e.includes('tpm') || e.includes('rpm')) return 'API rate limit reached';
  if (e.includes('auth') || e.includes('api_key') || e.includes('api key') || e.includes('401') || e.includes('403') || e.includes('invalid_argument')) return 'API key is missing or invalid';
  if (e.includes('no response')) return 'never answered';
  return 'gave an answer that could not be read';
}

// ── Reducer ─────────────────────────────────────────────────────────────────
const keysOf = (st: Step) => st.sittingKeys ?? (st.sittingKey ? [st.sittingKey] : []);

function closeActive(steps: Step[]): Step[] {
  const now = Date.now();
  return steps.map(s => (s.status === 'active' && keysOf(s).length === 0 ? { ...s, status: 'done' as StepStatus, endedAt: now } : s));
}

function push(steps: Step[], label: string): Step[] {
  const last = steps[steps.length - 1];
  if (last && last.label === label && last.status === 'active') return steps;
  return [...closeActive(steps), { label, status: 'active', startedAt: Date.now() }];
}

/** Pipeline stage messages (app/jury/pipeline.py) → timeline steps. Others only update the caption. */
function stepForStage(message: string): string | null {
  if (message.startsWith('Normalizing')) return 'Read your requirements';
  if (message.startsWith('Re-normalizing')) return 'Re-read requirements with reviewer feedback';
  if (message.startsWith('Scoring architecture patterns')) return 'Rank architecture styles';
  if (message.startsWith('Jury rejected the style')) return 'Switch architecture style';
  const m = message.match(/^v(\d+): generating (components|connections)/);
  return m ? `Draft v${m[1]}` : null;
}

function reviewLabel(sittings: Sitting[], keys: string[]): string {
  const parts = keys.map(k => sittings.find(s => s.key === k)).filter(Boolean).map(s =>
    s!.checkpoint === 'normalization'
      ? `requirements${s!.attempt > 1 ? ` (attempt ${s!.attempt})` : ''}`
      : `design v${s!.attempt}`);
  return `Review: ${parts.join(' + ')}`;
}

export function juryReducer(s: JuryState, e: JuryEvent): JuryState {
  switch (e.type) {
    case 'stage': {
      const label = stepForStage(e.message);
      return { ...s, stage: e.message, steps: label ? push(s.steps, label) : s.steps };
    }
    case 'panel': {
      const key = `${e.checkpoint}-${e.attempt}`;
      const sittings = [...s.sittings, { key, checkpoint: e.checkpoint, attempt: e.attempt, jurors: e.jurors, excluded: e.excluded_families, replaced: e.replaced ?? [], verdicts: [] }];
      const last = s.steps[s.steps.length - 1];
      let steps: Step[];
      if (last && last.status === 'active' && keysOf(last).length > 0) {
        // Same sitting: the pipeline seats every changed checkpoint together.
        const keys = [...keysOf(last), key];
        steps = [...s.steps.slice(0, -1), { ...last, sittingKeys: keys, label: reviewLabel(sittings, keys) }];
      } else {
        steps = [...closeActive(s.steps), { label: reviewLabel(sittings, [key]), status: 'active', startedAt: Date.now(), sittingKeys: [key] }];
      }
      return { ...s, stage: 'Reviewers are checking the work', steps, sittings };
    }
    case 'verdict':
      return { ...s, sittings: s.sittings.map(x => x.key === `${e.checkpoint}-${e.attempt}` ? { ...x, verdicts: [...x.verdicts, e.verdict] } : x) };
    case 'checkpoint': {
      const key = `${e.result.checkpoint}-${e.result.attempt}`;
      const sittings = s.sittings.map(x => x.key === key ? { ...x, result: e.result } : x);
      const now = Date.now();
      const steps = s.steps.map(st => {
        const keys = keysOf(st);
        if (!keys.includes(key)) return st;
        const results = keys.map(k => sittings.find(x => x.key === k)?.result);
        if (results.some(r => !r)) return st;
        return { ...st, status: (results.every(r => r!.passed) ? 'pass' : 'fail') as StepStatus, endedAt: now };
      });
      return {
        ...s, steps, sittings,
        iterations: e.result.checkpoint === 'architecture'
          ? s.iterations.map(it => it.version === e.result.attempt ? { ...it, result: e.result } : it)
          : s.iterations,
      };
    }
    case 'iteration':
      return { ...s, iterations: [...s.iterations, e.record] };
    case 'complete':
      return { ...s, running: false, stage: 'Done', endedAt: Date.now(), steps: closeActive(s.steps), trace: e.result?.jury };
    case 'error':
      return { ...s, running: false, endedAt: Date.now(), steps: closeActive(s.steps), error: e.detail };
  }
}

// ── Outcome ─────────────────────────────────────────────────────────────────
interface Outcome { tone: 'pass' | 'warn' | 'fail' | 'neutral' | 'running'; headline: string; detail: string; findings: string[] }

export function juryOutcome(state: JuryState): Outcome {
  if (state.error) return { tone: 'fail', headline: 'Review stopped with an error', detail: state.error, findings: [] };
  const lastOf = (cp: string) => [...state.sittings].reverse().find(s => s.checkpoint === cp && s.result)?.result;
  const norm = lastOf('normalization');
  const arch = lastOf('architecture');
  const drafts = state.iterations.length;
  if (state.running) {
    return { tone: 'running', headline: 'Reviewing…', detail: 'The design appears in the diagram as soon as each draft exists. You can look around while the reviewers work.', findings: [] };
  }
  const verdict = state.trace?.verdict;
  if (verdict === 'PASS') {
    return { tone: 'pass', headline: 'Approved', detail: `The reviewers agreed your requirements were read correctly and the design fits them${drafts > 1 ? ` (after ${drafts} drafts)` : ' on the first draft'}.`, findings: [] };
  }
  if (verdict === 'NO_JURY') {
    return { tone: 'neutral', headline: 'Not reviewed', detail: "None of the reviewer models gave a usable answer, so the design wasn't checked. Check your API key or ensure Ollama is running.", findings: [] };
  }
  if (arch?.passed && norm && !norm.passed) {
    const tries = state.sittings.filter(s => s.checkpoint === 'normalization').length;
    return {
      tone: 'warn', headline: 'Design approved, but the requirement list is still disputed',
      detail: `The design passed. The extracted requirements did not: after ${tries} attempt${tries > 1 ? 's' : ''}, reviewers still think they don't fully match what you wrote. The diagram is usable; check these points against your input:`,
      findings: norm.feedback,
    };
  }
  if (arch && !arch.passed) {
    return {
      tone: 'fail', headline: 'Not approved',
      detail: `After ${drafts} draft${drafts > 1 ? 's' : ''} (the retry limit), reviewers still found problems in the design. The last draft is shown in the diagram. Open issues:`,
      findings: [...arch.feedback, ...(norm && !norm.passed ? norm.feedback : [])],
    };
  }
  return { tone: 'neutral', headline: 'Review finished', detail: '', findings: [] };
}

const TONE: Record<Outcome['tone'], string> = {
  pass: 'border-success/40 bg-success/10',
  warn: 'border-warning/40 bg-warning/10',
  fail: 'border-danger/40 bg-danger/10',
  neutral: 'border-line-strong bg-surface',
  running: 'border-info/40 bg-info/10',
};
const TONE_TEXT: Record<Outcome['tone'], string> = {
  pass: 'text-success-fg', warn: 'text-warning-fg', fail: 'text-danger-fg', neutral: 'text-fg-strong', running: 'text-info',
};

function Findings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((f, i) => {
        const p = plainFinding(f);
        return (
          <li key={i} className="text-xs leading-relaxed">
            <span className="font-semibold text-fg-strong">{p.title}: </span>
            <span className="text-fg-soft">{p.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────
function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

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
  const text = running ? 'Under review' : verdict === 'PASS' ? 'Review: approved' : verdict === 'FAIL' ? 'Review: open issues' : verdict === 'NO_JURY' ? 'Not reviewed' : 'Review: —';
  const cls = `px-2 py-0.5 rounded-control text-xs font-semibold border ${tone}`;
  return onClick
    ? <button onClick={onClick} className={`${cls} cursor-pointer hover:brightness-110`} title="Open the review">{text}</button>
    : <span className={cls}>{text}</span>;
}

/** Compact outcome strip shown above the diagram once a review has finished. */
export function JuryResultBanner({ state, onOpen }: { state: JuryState; onOpen: () => void }) {
  const o = juryOutcome(state);
  if (o.tone === 'running') return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-panel border px-4 py-2.5 ${TONE[o.tone]}`}>
      <div className="min-w-0">
        <div className={`text-sm font-semibold ${TONE_TEXT[o.tone]}`}>{o.headline}</div>
        {o.findings.length > 0 && (
          <div className="text-xs text-fg-soft truncate">
            {o.findings.length} open point{o.findings.length > 1 ? 's' : ''}: {o.findings.map(f => plainFinding(f).title).join(' · ')}
          </div>
        )}
      </div>
      <button onClick={onOpen} className="shrink-0 px-3 py-1.5 rounded-control text-xs font-medium border border-line-strong bg-surface text-fg-soft hover:text-info hover:border-info/40 cursor-pointer">
        See the review →
      </button>
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────
function Timeline({ state }: { state: JuryState }) {
  const now = useNow(state.running);
  return (
    <section className="bg-surface border border-line-strong rounded-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-fg-strong">What happened</h3>
        <span className="text-xs text-fg-subtle font-mono">{fmt((state.endedAt ?? now) - state.startedAt)} total</span>
      </div>
      <ol className="relative border-l border-line-strong ml-1.5 space-y-2.5">
        {state.steps.map((st, i) => {
          const keys = keysOf(st);
          const sittings = keys.map(k => state.sittings.find(s => s.key === k)).filter(Boolean) as Sitting[];
          const dot = st.status === 'active' ? 'bg-info animate-pulse' : st.status === 'pass' ? 'bg-success' : st.status === 'fail' ? 'bg-warning' : 'bg-fg-subtle';
          return (
            <li key={`${st.label}-${i}`} className="pl-4 relative">
              <span className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ${dot}`} />
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-xs ${st.status === 'active' ? 'text-info font-medium' : 'text-fg-soft'}`}>{st.label}</span>
                <span className="text-xs text-fg-subtle font-mono shrink-0">{fmt((st.endedAt ?? now) - st.startedAt)}</span>
              </div>
              {sittings.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                  {sittings.map(s => (
                    <span key={s.key} className={!s.result ? 'text-fg-subtle' : s.result.passed ? 'text-success-fg' : 'text-warning-fg'}>
                      {CHECK[s.checkpoint as keyof typeof CHECK]?.name ?? s.checkpoint}:{' '}
                      {!s.result ? `${s.verdicts.length}/${s.jurors.length} reviewers answered` : s.result.passed ? 'passed' : `problems found (${s.result.tallies.filter(t => t.failed).length})`}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {state.steps.length === 0 && <li className="pl-4 text-xs text-fg-subtle">Starting…</li>}
      </ol>
    </section>
  );
}

// ── Reviewers ───────────────────────────────────────────────────────────────
function Reviewers({ state }: { state: JuryState }) {
  const latest = state.sittings[state.sittings.length - 1];
  if (!latest) return null;
  const replaced = latest.replaced;
  return (
    <section className="bg-surface border border-line-strong rounded-panel p-4">
      <h3 className="text-xs font-semibold text-fg-strong mb-2">The reviewers</h3>
      <div className="flex flex-wrap gap-2">
        {latest.jurors.map(j => {
          const answers = state.sittings.flatMap(s => s.verdicts.filter(v => v.juror === j.seat && v.model === j.model));
          const failed = answers.filter(v => !v.ok);
          const silent = answers.length > 0 && failed.length === answers.length;
          return (
            <div key={j.seat} className={`px-2.5 py-1.5 rounded-control border text-xs ${silent ? 'border-warning/40 bg-warning/10' : 'border-line-strong bg-raised'}`}>
              <div className="font-medium text-fg-strong">{shortModel(j.model)}</div>
              <div className={silent ? 'text-warning-fg' : 'text-fg-subtle'}>
                {silent ? `No answers: ${abstainHint(failed[0].error ?? '')}` : failed.length ? `Missed ${failed.length} of ${answers.length} checks` : `${j.family} family`}
              </div>
            </div>
          );
        })}
      </div>
      {replaced.length > 0 && (
        <p className="mt-2 text-xs text-fg-subtle">
          {replaced.map(r => `${shortModel(r.model)} was swapped for ${shortModel(r.by)}`).join('; ')}, because it comes from the same model family as the generator and might go easy on its own work.
        </p>
      )}
      {latest.jurors.some(j => state.sittings.flatMap(s => s.verdicts).some(v => v.model === j.model && !v.ok && abstainHint(v.error ?? '') === 'model is not installed in Ollama')) && (
        <p className="mt-2 text-xs text-warning-fg">
          Install missing reviewers with <code className="bg-raised border border-line-strong rounded px-1">ollama pull &lt;model&gt;</code>; fewer reviewers make the majority less reliable.
        </p>
      )}
    </section>
  );
}

// ── Drafts ──────────────────────────────────────────────────────────────────
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
  if (empty) return <div className="text-xs text-fg-subtle">Same structure as the previous draft.</div>;
  return (
    <div className="space-y-1.5">
      {d.style_changed && <div className="text-xs text-info">Style changed: {d.style_changed.replace('->', '→')}</div>}
      <DiffRow sign="+" items={d.nodes_added} tone="bg-success/15 text-success-fg border-success/30" />
      <DiffRow sign="−" items={d.nodes_removed} tone="bg-warning/20 text-warning-fg border-warning/30" />
      <DiffRow sign="+" items={d.edges_added} tone="bg-success/10 text-success-fg border-success/30" />
      <DiffRow sign="−" items={d.edges_removed} tone="bg-warning/10 text-warning-fg border-warning/30" />
    </div>
  );
}

function Drafts({ state, onShowVersion }: { state: JuryState; onShowVersion?: (r: IterationRecord) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const its = state.iterations;
  if (!its.length) return null;
  const current = its.find(i => i.version === selected) ?? its[its.length - 1];
  const normFails = state.sittings.filter(s => s.checkpoint === 'normalization' && s.result && !s.result.passed).length;
  return (
    <section className="bg-surface border border-line-strong rounded-panel p-4">
      <h3 className="text-xs font-semibold text-fg-strong mb-2">Design drafts</h3>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {its.map((it, i) => (
          <React.Fragment key={it.version}>
            {i > 0 && <span className="text-fg-subtle">→</span>}
            <button
              onClick={() => setSelected(it.version)}
              className={`px-2.5 py-1 rounded-control text-xs border cursor-pointer ${current.version === it.version ? 'bg-selected text-info border-info/40' : 'border-line-strong text-fg-muted hover:text-fg-soft'}`}
            >
              Draft {it.version} · {it.style}
              {it.result && <span className={`ml-1.5 ${it.result.passed ? 'text-success-fg' : 'text-warning-fg'}`}>{it.result.passed ? '✓ approved' : '✗ issues'}</span>}
            </button>
          </React.Fragment>
        ))}
      </div>
      <div className="space-y-2">
        <div className="text-xs text-fg-soft space-y-0.5">{plainReason(current.reason).map(r => <p key={r}>{r}</p>)}</div>
        <div className="text-xs text-fg-subtle">{current.graph.nodes.length} components · {current.graph.edges.length} connections</div>
        {current.diff && <DiffView d={current.diff} />}
        {its.length === 1 && !state.running && current.result?.passed && (
          <p className="text-xs text-fg-subtle">
            Only one draft was needed: the design passed its first review.
            {normFails > 0 && ' The problems listed below are about the extracted requirement list, which is checked separately and does not change the diagram by itself.'}
          </p>
        )}
        {onShowVersion && (
          <button onClick={() => onShowVersion(current)} className="px-2.5 py-1 rounded-control text-xs border border-line-strong text-fg-soft hover:text-info hover:border-info/40 cursor-pointer">
            Open draft {current.version} in the diagram{current.diff ? ' (changes highlighted)' : ''}
          </button>
        )}
      </div>
    </section>
  );
}

// ── One review (a checkpoint sitting) ──────────────────────────────────────
const VOTE_STYLE: Record<Vote['kind'], { icon: string; cls: string; label: string }> = {
  pending: { icon: '…', cls: 'border-line-strong text-fg-subtle animate-pulse', label: 'Still reviewing' },
  abstain: { icon: '–', cls: 'border-dashed border-line-strong text-fg-subtle', label: 'No answer' },
  skipped: { icon: '–', cls: 'border-dashed border-line-strong text-fg-subtle', label: 'Skipped this question' },
  ok: { icon: '✓', cls: 'border-success/40 bg-success/15 text-success-fg', label: 'Looks fine' },
  problem: { icon: '✗', cls: 'border-warning/50 bg-warning/20 text-warning-fg', label: 'Found a problem' },
  ignored: { icon: '✗', cls: 'border-line-strong text-fg-subtle line-through', label: 'Objected without evidence (not counted)' },
};

function QuestionRow({ id, tally, jurors, byJuror, voters }: {
  id: string; tally?: ItemTally; jurors: Seat[]; byJuror: Map<string, JurorVerdict>; voters: number;
}) {
  const [open, setOpen] = useState(!!tally?.failed);
  const meta = ITEM[id];
  const votes = jurors.map(j => ({ j, vote: voteOf(byJuror.get(j.seat), id) }));
  const problems = votes.filter(x => x.vote.kind === 'problem').length;
  const oks = votes.filter(x => x.vote.kind === 'ok').length;
  const ignored = votes.filter(x => x.vote.kind === 'ignored').length;
  const ok = 'bg-success/15 text-success-fg border-success/30';
  const verdict = !tally ? null
    : voters === 0 ? { cls: 'bg-raised text-fg-subtle border-line-strong', text: 'Not reviewed' }
    : tally.failed ? { cls: 'bg-warning/20 text-warning-fg border-warning/40', text: `Problem: ${problems} of ${voters} reviewers agree` }
    : problems > 0 ? { cls: ok, text: `Passed: only ${problems} of ${voters} saw a problem` }
    : oks === voters ? { cls: ok, text: `Passed: all ${voters} agree` }
    : { cls: ok, text: 'Passed: no valid objection' };

  return (
    <li className={`border-b border-line-strong/50 last:border-0 ${tally?.failed ? 'bg-warning/5' : ''}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-3 py-2.5 flex items-start gap-3 cursor-pointer hover:bg-raised/60" aria-expanded={open}>
        <span className="text-fg-subtle text-xs mt-0.5 w-3">{open ? '▾' : '▸'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold ${tally?.failed ? 'text-warning-fg' : 'text-fg-strong'}`}>{meta?.title ?? id}</span>
            <span className="text-[10px] font-mono text-fg-subtle">{id}</span>
          </div>
          <div className="text-xs text-fg-muted leading-snug">{meta?.ask ?? tally?.question}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0" aria-hidden="true">
          {votes.map(({ j, vote }) => (
            <span key={j.seat} title={`${shortModel(j.model)}: ${VOTE_STYLE[vote.kind].label}`}
              className={`inline-flex items-center justify-center w-5 h-5 rounded-control border text-[10px] font-bold ${VOTE_STYLE[vote.kind].cls}`}>
              {VOTE_STYLE[vote.kind].icon}
            </span>
          ))}
        </div>
        {verdict && <span className={`shrink-0 px-2 py-0.5 rounded-control border text-xs font-medium ${verdict.cls}`}>{verdict.text}</span>}
      </button>
      {open && (
        <div className="px-3 pb-3 pl-9 space-y-1.5">
          {votes.map(({ j, vote }) => (
            <div key={j.seat} className="flex items-start gap-2 text-xs">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-control border text-[10px] font-bold shrink-0 ${VOTE_STYLE[vote.kind].cls}`}>{VOTE_STYLE[vote.kind].icon}</span>
              <div className="min-w-0">
                <span className="font-medium text-fg-strong">{shortModel(j.model)}</span>
                <span className="text-fg-subtle"> · {VOTE_STYLE[vote.kind].label}</span>
                {vote.kind === 'problem' && vote.cited.length > 0 && (
                  <span className="text-fg-subtle"> · points to {vote.cited.map(c => c.replace(/^L(\d+)$/, 'line $1')).join(', ')}</span>
                )}
                {(vote.kind === 'ok' || vote.kind === 'problem' || vote.kind === 'ignored') && vote.reason && (
                  <div className="text-fg-soft leading-snug">&ldquo;{vote.reason}&rdquo;</div>
                )}
                {vote.kind === 'ignored' && <div className="text-fg-subtle">Not counted because {vote.why}.</div>}
                {vote.kind === 'abstain' && <div className="text-fg-subtle">{abstainHint(vote.why)}</div>}
              </div>
            </div>
          ))}
          {ignored > 0 && tally && !tally.failed && problems + ignored > oks && (
            <p className="text-xs text-fg-subtle">More reviewers objected than approved, but {ignored} of the objections gave no evidence, so they didn&apos;t count.</p>
          )}
        </div>
      )}
    </li>
  );
}

function ReviewCard({ s, defaultOpen }: { s: Sitting; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const check = CHECK[s.checkpoint as keyof typeof CHECK];
  const tallies = s.result?.tallies ?? [];
  const byJuror = new Map(s.verdicts.map(v => [v.juror, v]));
  const ids = tallies.length ? tallies.map(t => t.item_id) : (s.verdicts.find(v => v.ok)?.answers.map(a => a.item_id) ?? []);
  const voters = s.result?.voting_jurors ?? s.verdicts.filter(v => v.ok).length;
  const failed = tallies.filter(t => t.failed).length;
  const status = !s.result
    ? { cls: 'bg-info/15 text-info border-info/30 animate-pulse', text: `${s.verdicts.length} of ${s.jurors.length} reviewers answered` }
    : s.result.passed
      ? { cls: 'bg-success/15 text-success-fg border-success/30', text: 'Passed' }
      : { cls: 'bg-warning/20 text-warning-fg border-warning/40', text: `${failed} problem${failed !== 1 ? 's' : ''} found` };
  const what = s.checkpoint === 'architecture' ? `design draft ${s.attempt}` : s.attempt > 1 ? `attempt ${s.attempt}` : 'first attempt';

  return (
    <section className="bg-surface border border-line-strong rounded-panel overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left px-4 py-3 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-raised/60" aria-expanded={open}>
        <div className="flex items-center gap-2">
          <span className="text-fg-subtle text-xs w-3">{open ? '▾' : '▸'}</span>
          <span className="text-xs font-semibold text-fg-strong">{check?.name ?? s.checkpoint}</span>
          <span className="text-xs text-fg-subtle">· {what}</span>
        </div>
        <span className={`px-2 py-0.5 rounded-control border text-xs font-medium ${status.cls}`}>{status.text}</span>
      </button>
      {open && (
        <div className="border-t border-line-strong">
          {check && <p className="px-4 pt-3 text-xs text-fg-muted">{check.what}</p>}
          <ul className="mt-2">
            {(ids.length ? ids : []).map(id => (
              <QuestionRow key={id} id={id} tally={tallies.find(t => t.item_id === id)} jurors={s.jurors} byJuror={byJuror} voters={voters} />
            ))}
            {ids.length === 0 && <li className="px-4 py-3 text-xs text-fg-subtle">Waiting for the first answer…</li>}
          </ul>
          {s.result && s.result.feedback.length > 0 && (
            <div className="px-4 py-3 border-t border-line-strong bg-raised/40">
              <div className="text-xs font-medium text-fg-strong">
                Sent back to the generator to fix{s.checkpoint === 'normalization' ? ' (it re-reads your requirements)' : ''}:
              </div>
              <Findings items={s.result.feedback} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── How it works ────────────────────────────────────────────────────────────
function HowItWorks({ generator }: { generator: string }) {
  return (
    <details className="group bg-surface border border-line-strong rounded-panel">
      <summary className="px-4 py-2.5 text-xs font-medium text-fg-soft cursor-pointer select-none list-none flex items-center gap-2 hover:text-fg-strong">
        <span className="text-fg-subtle group-open:rotate-90 transition-transform">▸</span> How the review works
      </summary>
      <ol className="px-4 pb-3 space-y-1.5 text-xs text-fg-muted list-decimal list-inside">
        <li>The generator{generator ? ` (${generator})` : ''} turns your text into a requirement list, then drafts an architecture from it.</li>
        <li>Five reviewer models from <em>other</em> model families answer a fixed set of yes/no questions about that work, each on its own, without seeing the others.</li>
        <li>An objection only counts if the reviewer names the exact line, requirement or component that is wrong. Vague or made-up objections are dropped. That&apos;s why one reviewer can object to everything and still be outvoted.</li>
        <li>A question fails when most of the reviewers who answered found a problem. Votes are tallied by plain code, not by an AI.</li>
        <li>Failed work goes back to the generator with the findings, for up to 3 rounds. Whatever is left after that is listed as open issues.</li>
      </ol>
    </details>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────
export function JuryPanel({ state, onShowVersion, onShowDiagram }: {
  state: JuryState; onShowVersion?: (record: IterationRecord) => void; onShowDiagram?: () => void;
}) {
  const o = juryOutcome(state);
  const generator = state.trace?.generator_models.join(', ') ?? '';
  // Newest reviews first; the latest one starts expanded.
  const reviews = useMemo(() => [...state.sittings].reverse(), [state.sittings]);

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
      <section className={`rounded-panel border p-4 ${TONE[o.tone]}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-fg-subtle mb-0.5">Review result</div>
            <h2 className={`text-base font-semibold ${TONE_TEXT[o.tone]}`}>{o.headline}</h2>
            {o.tone === 'running' && <div className="text-xs text-info mt-0.5">{state.stage}</div>}
            {o.detail && <p className="text-xs text-fg-soft mt-1 leading-relaxed max-w-2xl">{o.detail}</p>}
            <Findings items={o.findings} />
          </div>
          {onShowDiagram && state.iterations.length > 0 && (
            <button onClick={onShowDiagram} className="shrink-0 px-3 py-1.5 rounded-control text-xs font-medium bg-info-strong text-white hover:brightness-110 cursor-pointer">
              {state.running ? 'View current draft' : 'View final architecture'} →
            </button>
          )}
        </div>
      </section>

      <HowItWorks generator={generator} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Timeline state={state} />
        <div className="flex flex-col gap-3">
          <Drafts state={state} onShowVersion={onShowVersion} />
          <Reviewers state={state} />
        </div>
      </div>

      {reviews.length > 0 && <h3 className="text-xs font-semibold text-fg-strong mt-1">Reviews, newest first</h3>}
      {reviews.map((s, i) => <ReviewCard key={s.key} s={s} defaultOpen={i === 0 || (!s.result?.passed && i < 2)} />)}

      {state.trace && state.trace.notes.filter(n => !n.startsWith('Trace saved')).length > 0 && (
        <section className="bg-surface border border-line-strong rounded-panel p-4 text-xs space-y-1 text-fg-muted">
          {state.trace.notes.filter(n => !n.startsWith('Trace saved')).map(n => <p key={n}>{n}</p>)}
        </section>
      )}
    </div>
  );
}
