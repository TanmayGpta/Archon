"use client";
import React, { useEffect, useMemo, useState } from 'react';
import data from './juryEvaluationData.json';

// Bias jury: how ArcGen's panel of small local models checks its own work.
// Section A replays one REAL recorded run (MiniShop, trace JSON, provenance "recorded").
// Section C numbers are NOT measured yet: the data file marks them "illustrative" and the
// badge below is driven by that field. Set it to "measured" once the benchmark has run.

type Provenance = 'recorded' | 'measured' | 'illustrative';

interface Answer { item: string; passed: boolean; cited: string[]; rejectedCites: string[]; reason: string; counted: boolean }
interface Juror { seat: string; model: string; family: string; ok: boolean; error: string | null; seconds: number; answers: Answer[] }
interface Tally { item: string; yes: number; no: number; uncitedNo: number; abstain: number; failed: boolean; citedCounts: Record<string, number> }
interface CpResult {
  passed: boolean; votingJurors: number; lowIndependence: boolean; excludedFamilies: string[];
  jurors: Juror[]; tallies: Tally[]; feedback: string[];
}
interface RubricItem { id: string; question: string; cite: string; severity: string; route: string; fix: string }
interface ArchNode { id: string; name: string; type: string; layer: string; x: number; y: number }
interface ArchEdge { id: string; source: string; target: string; type: string }
interface Recorded {
  provenance: Provenance; label: string; source: string; project: string; date: string; verdict: string;
  generatorModels: string[]; maxRegenerations: number; regenerations: number;
  roster: { model: string; family: string; spare: boolean }[];
  replaced: { model: string; family: string; by: string }[];
  normalization: { title: string; items: RubricItem[]; requirementIds: string[]; asrIds: string[]; result: CpResult };
  architecture: { title: string; items: RubricItem[]; style: string; nodes: ArchNode[]; edges: ArchEdge[]; result: CpResult };
}
interface Frac { k: number; n: number }
interface Benchmark {
  provenance: Provenance;
  meta: { docs: number; cases: number; clean: number; seeded: number; hardware: string; generator: string; ciMethod: string; note: string };
  defectTypes: { id: string; label: string; checkpoint: string; item: string; n: number; majority: number; best: number }[];
  checkpoints: { id: string; label: string; n: number; defects: number; clean: number; caught: number; falseRej: number; kappa: number; kappaCi: number[] }[];
  kappa: { value: number; ci: number[] };
  diffs: { vsBest: { value: number; ci: number[] }; vsMeanSingle: { value: number; ci: number[] } };
  jurors: { model: string; family: string; caught: number; falseRej: number; cites: number; validCites: number; noVotes: number; discarded: number; note: string }[];
  panelRows: { id: string; label: string; voters: number; caught: number; falseRej: number }[];
  e2e: {
    runs: number;
    rows: { id: string; label: string; unit: string; better: 'higher' | 'lower'; without: Frac; with: Frac }[];
    regenDist: { regens: number; runs: number }[];
    regenByCheckpoint: { normalization: number; architecture: number };
    finalPass: number;
    latency: { baselineMin: number; overheadMean: number; overheadCi: number[]; overheadP90: number; sittingSeconds: number[] };
  };
  limitations: string[];
}

const REC = data.recorded as unknown as Recorded;
const BM = data.benchmark as unknown as Benchmark;
const CP1 = REC.normalization;
const CP2 = REC.architecture;

const OK = '#10b981', BAD = '#ff3b30', MUTED = '#5a5a58', ACCENT = '#e8ff00', WARN = '#f5a524';
const HUE = '56, 189, 248';
const LAYER_COLOR: Record<string, string> = { Presentation: '#e8ff00', Application: '#4f9dff', Infrastructure: '#b48cff', External: '#8b8b86' };

// ── Small helpers ─────────────────────────────────────────────────────────────
const fmt = (v: number, d = 3) => v.toFixed(d);
const signed = (v: number, d = 3) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const wilson = (k: number, n: number): [number, number] => {
  const z = 1.96, p = k / n, den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
};
const ciText = (k: number, n: number, d = 3) => { const [a, b] = wilson(k, n); return `[${fmt(a, d)}, ${fmt(b, d)}]`; };

const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-fg-muted leading-relaxed">{children}</p>;
const C = ({ children }: { children: React.ReactNode }) => <code className="text-info bg-raised px-1 rounded-control text-xs">{children}</code>;

function ProvenanceBadge({ value, label }: { value: Provenance; label?: string }) {
  if (value === 'illustrative') {
    return (
      <div role="note" className="rounded-panel bg-warning/10 border border-warning/40 px-4 py-2.5 flex items-start gap-2.5 text-sm font-mono text-warning-fg">
        <span className="px-2 py-0.5 rounded-control bg-warning/20 border border-warning/40 text-xs font-bold tracking-wide shrink-0">ILLUSTRATIVE</span>
        <span>Illustrative figures — benchmark not yet run; only the MiniShop run above is recorded.</span>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-success/15 border border-success/30 text-success text-xs font-mono font-bold">
      {value === 'recorded' ? 'RECORDED' : 'MEASURED'}{label ? ` · ${label}` : ''}
    </span>
  );
}

function SectionHead({ letter, title, sub, right }: { letter: string; title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-panel bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-fg text-xs font-mono font-bold">{letter}</span>
          <h2 className="text-lg font-bold text-fg-strong">{title}</h2>
        </div>
        <p className="text-xs font-mono text-fg-subtle">{sub}</p>
      </div>
      {right}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-panel bg-surface border border-line-strong p-5">
      <div className="text-xs font-mono text-fg-subtle uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-bold text-fg-strong font-mono my-2">{value}</div>
      <div className="text-xs font-mono text-fg-muted">{sub}</div>
    </div>
  );
}

// Bar from 0 with the 95% CI as a thin whisker (same idiom as the classifier tab)
function CiBar({ value, ci }: { value: number; ci: [number, number] }) {
  return (
    <div className="flex items-center gap-2" title={`${fmt(value)}, 95% CI ${fmt(ci[0])} to ${fmt(ci[1])}`}>
      <span className="text-fg-strong w-11">{fmt(value)}</span>
      <div className="relative flex-1 h-3 min-w-[90px]">
        <div className="absolute inset-y-0 left-0 rounded-r" style={{ width: `${value * 100}%`, backgroundColor: `rgba(${HUE}, 0.55)` }} />
        <div className="absolute top-1/2 h-px bg-fg-soft" style={{ left: `${ci[0] * 100}%`, width: `${(ci[1] - ci[0]) * 100}%` }} />
      </div>
    </div>
  );
}

const tallyOf = (r: CpResult, id: string) => r.tallies.find(t => t.item === id)!;

// ── Flow strip: the whole loop, with the active step lit ──────────────────────
const FLOW = ['Raw SRS', 'Normalize', 'Jury · CP1', 'Generate', 'Jury · CP2', 'Verdict'];
const FLOW_X = (i: number) => 10 + i * 148;

function FlowStrip({ active, done, loopLit, pass }: { active: number; done: number; loopLit: boolean; pass: boolean }) {
  const mid = (i: number) => FLOW_X(i) + 59;
  const loop = (from: number, to: number) => {
    const a = mid(from), b = mid(to);
    return (
      <g key={from}>
        <path d={`M${a},96 C${a},146 ${b},146 ${b},100`} fill="none" stroke={loopLit ? BAD : '#3a3a38'} strokeWidth={loopLit ? 2 : 1.4} strokeDasharray="5 4" />
        <polygon points="0,-4 8,0 0,4" fill={loopLit ? BAD : '#3a3a38'} transform={`translate(${b},100) rotate(-90)`} />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 890 170" className="w-full" role="img" aria-label="Jury pipeline: SRS, normalize, checkpoint 1, generate, checkpoint 2, verdict, with regenerate loops back from each checkpoint">
      {FLOW.map((label, i) => {
        const isActive = i === active;
        const isDone = i < done;
        const isVerdict = i === FLOW.length - 1;
        const stroke = isActive ? ACCENT : isVerdict && pass && isDone ? OK : isDone ? '#8b8b86' : '#343434';
        return (
          <g key={label}>
            <rect x={FLOW_X(i)} y={52} width={118} height={44} rx={8} fill={isActive ? '#1e293b' : '#0e0e0d'} stroke={stroke} strokeWidth={isActive ? 2.5 : 1.6} />
            <text x={mid(i)} y={78} textAnchor="middle" fontSize={12} fill={isActive ? '#f8fafc' : isDone ? '#d4d4d0' : '#7d8799'} fontFamily="monospace" fontWeight={isActive ? 'bold' : 'normal'}>{label}</text>
            {i < FLOW.length - 1 && (
              <g>
                <line x1={FLOW_X(i) + 120} y1={74} x2={FLOW_X(i + 1) - 4} y2={74} stroke={i < done ? '#8b8b86' : '#343434'} strokeWidth={1.6} />
                <polygon points="0,-4 8,0 0,4" fill={i < done ? '#8b8b86' : '#343434'} transform={`translate(${FLOW_X(i + 1) - 2},74)`} />
              </g>
            )}
          </g>
        );
      })}
      {loop(2, 1)}
      {loop(4, 3)}
      <text x={(mid(1) + mid(2)) / 2} y={162} textAnchor="middle" fontSize={10} fill={loopLit ? '#fca5a5' : MUTED} fontFamily="monospace">fail: regenerate + findings</text>
      <text x={(mid(3) + mid(4)) / 2} y={162} textAnchor="middle" fontSize={10} fill={loopLit ? '#fca5a5' : MUTED} fontFamily="monospace">fail: regenerate + findings</text>
      <text x={FLOW_X(0)} y={30} textAnchor="start" fontSize={10} fill={MUTED} fontFamily="monospace">≤{REC.maxRegenerations} regenerations per checkpoint</text>
      <text x={FLOW_X(5) + 118} y={30} textAnchor="end" fontSize={10} fill={MUTED} fontFamily="monospace">{pass ? 'PASS' : 'PASS | FAIL + trace'}</text>
    </svg>
  );
}

// ── Juror rows ────────────────────────────────────────────────────────────────
function AnswerCell({ a, maxed }: { a?: Answer; maxed: boolean }) {
  if (!maxed) return <div className="text-fg-subtle">…</div>;
  if (!a) return <div className="text-fg-subtle" title="This juror gave no usable answer for this item, so it abstains on it.">no answer</div>;
  const discarded = !a.passed && !a.counted;
  return (
    <div className="space-y-0.5" title={a.reason || '(no reason given)'}>
      <div className="flex items-center gap-1.5">
        {a.passed ? (
          <span className="font-bold" style={{ color: OK }}>✓ yes</span>
        ) : discarded ? (
          <span className="font-bold line-through" style={{ color: MUTED }}>✗ no</span>
        ) : (
          <span className="font-bold" style={{ color: BAD }}>✗ no</span>
        )}
        {discarded && <span className="text-[10px]" style={{ color: WARN }}>{a.cited.length === 0 ? 'no valid cite' : 'shotgun cites'}</span>}
      </div>
      {(a.cited.length > 0 || a.rejectedCites.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {a.cited.map(c => <span key={c} className="px-1 rounded-control bg-info-strong/20 border border-info/30 text-info text-[10px]">{c}</span>)}
          {a.rejectedCites.map(c => (
            <span key={c} className="px-1 rounded-control border border-danger/50 text-danger-fg text-[10px] line-through" title="Cited ID does not exist in this juror's case: rejected">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function JurorTable({ cp, items, revealed, current, showExcluded }: {
  cp: CpResult; items: RubricItem[]; revealed: number; current: number; showExcluded: boolean;
}) {
  const cols = `minmax(8.5rem,10rem) repeat(${items.length}, minmax(0,1fr))`;
  return (
    <div className="font-mono text-xs space-y-1.5 min-w-[34rem]">
      <div className="grid gap-2 px-2 text-fg-subtle" style={{ gridTemplateColumns: cols }}>
        <div>juror</div>
        {items.map(it => <div key={it.id} title={it.question}>{it.id}</div>)}
      </div>
      {showExcluded && REC.replaced.map(r => (
        <div key={r.model} className="grid gap-2 px-2 py-1.5 rounded-panel border border-dashed border-line opacity-70 items-center" style={{ gridTemplateColumns: cols }}>
          <div>
            <div className="line-through text-fg-subtle">{r.model}</div>
            <div className="text-[10px]" style={{ color: WARN }}>excluded: {r.family} = generator family</div>
          </div>
          <div className="text-fg-subtle" style={{ gridColumn: `span ${items.length}` }}>
            not seated; spare <span className="text-fg-soft">{r.by}</span> (family mistral, unused) takes the seat
          </div>
        </div>
      ))}
      {cp.jurors.map((j, i) => {
        const shown = i < revealed;
        const isCur = i === current;
        return (
          <div key={j.seat} className={`grid gap-2 px-2 py-1.5 rounded-panel border items-start transition-colors ${isCur ? 'bg-[#e8ff00]/10 border-[#e8ff00]/40' : 'bg-[#050505] border-line'} ${shown ? '' : 'opacity-60'}`}
            style={{ gridTemplateColumns: cols }}>
            <div>
              <div className="text-fg-strong font-bold">{j.seat}: {j.model}</div>
              <div className="text-fg-subtle text-[10px]">
                {j.family}{REC.roster.find(r => r.model === j.model)?.spare ? ' · spare' : ''}{shown ? ` · verdict at +${j.seconds}s` : ''}
              </div>
            </div>
            {shown && !j.ok ? (
              <div className="text-danger-fg" style={{ gridColumn: `span ${items.length}` }}>abstains: {j.error}</div>
            ) : (
              items.map(it => <AnswerCell key={it.id} a={j.answers.find(a => a.item === it.id)} maxed={shown} />)
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Aggregation view ──────────────────────────────────────────────────────────
function Segment({ n, total, color, label }: { n: number; total: number; color: string; label: string }) {
  if (n === 0) return null;
  return <div className="h-full flex items-center justify-center text-[10px] text-black font-bold" style={{ width: `${(n / total) * 100}%`, backgroundColor: color }} title={`${label}: ${n}`}>{n}</div>;
}

function AggregateView({ cp, items, f }: { cp: CpResult; items: RubricItem[]; f: number }) {
  const n = cp.votingJurors;
  const shown = Math.min(f, items.length);
  return (
    <div className="font-mono text-xs space-y-3">
      <div className="rounded-panel bg-[#050505] border border-line p-2.5 text-fg-soft">
        voting jurors <b>n = {n}</b> · item fails when <b>counted no × 2 &gt; n</b> · checkpoint passes when no item fails
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-fg-muted">
        <span><span className="inline-block w-2.5 h-2.5 mr-1 align-middle" style={{ background: OK }} />yes</span>
        <span><span className="inline-block w-2.5 h-2.5 mr-1 align-middle" style={{ background: BAD }} />no, counted (valid cite)</span>
        <span><span className="inline-block w-2.5 h-2.5 mr-1 align-middle" style={{ background: WARN }} />no, discarded (uncited or shotgun)</span>
        <span><span className="inline-block w-2.5 h-2.5 mr-1 align-middle" style={{ background: MUTED }} />abstain</span>
      </div>
      {items.map((it, idx) => {
        const t = tallyOf(cp, it.id);
        const total = t.yes + t.no + t.uncitedNo + t.abstain || 1;
        const vis = idx < shown;
        return (
          <div key={it.id} className={`space-y-1 transition-opacity ${vis ? '' : 'opacity-20'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-fg-strong font-bold">{it.id} <span className="text-fg-subtle font-normal">· {it.severity}</span></span>
              {vis && (
                <span className={t.failed ? 'text-danger-fg font-bold' : 'text-success-fg font-bold'}>
                  {t.no} × 2 = {t.no * 2} {t.failed ? '>' : '≤'} {n} → {t.failed ? 'item FAILS' : 'item passes'}
                </span>
              )}
            </div>
            <div className="text-fg-subtle truncate" title={it.question}>{it.question}</div>
            <div className="flex h-5 rounded overflow-hidden bg-line/40">
              {vis && (
                <>
                  <Segment n={t.yes} total={total} color={OK} label="yes" />
                  <Segment n={t.no} total={total} color={BAD} label="counted no" />
                  <Segment n={t.uncitedNo} total={total} color={WARN} label="discarded no" />
                  <Segment n={t.abstain} total={total} color={MUTED} label="abstain" />
                </>
              )}
            </div>
          </div>
        );
      })}
      {f > items.length && (
        <div className={`rounded-panel p-3 border text-sm font-bold text-center ${cp.passed ? 'bg-[#10b981]/10 border-[#10b981]/30 text-[#6ee7b7]' : 'bg-[#ff3b30]/10 border-[#ff3b30]/30 text-[#fca5a5]'}`}>
          {cp.passed ? 'CHECKPOINT PASSES: no item failed' : 'CHECKPOINT FAILS'}
        </div>
      )}
    </div>
  );
}

// ── Architecture drawing ──────────────────────────────────────────────────────
const NODE_BY_ID = new Map(CP2.nodes.map(n => [n.id, n]));
const shortName = (s: string) => s.replace(/^MiniShop /, '').replace(' Module', '').replace(' Management', '');

function EdgeArrow({ x1, y1, x2, y2, color, width, off }: { x1: number; y1: number; x2: number; y2: number; color: string; width: number; off: number }) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const r = 22;
  const sx = x1 + (dx / len) * r + nx * off, sy = y1 + (dy / len) * r + ny * off;
  const ex = x2 - (dx / len) * (r + 4) + nx * off, ey = y2 - (dy / len) * (r + 4) + ny * off;
  return (
    <g>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={width} />
      <polygon points="0,-3.5 7,0 0,3.5" fill={color} transform={`translate(${ex},${ey}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI})`} />
    </g>
  );
}

const EDGES_PER_FRAME = 2;
const ARCH_FRAMES = Math.ceil(CP2.edges.length / EDGES_PER_FRAME) + 1;

function ArchitectureView({ f }: { f: number }) {
  const shownEdges = Math.min(CP2.edges.length, f * EDGES_PER_FRAME);
  // edges between the same pair are fanned out so they stay distinguishable
  const offsets = useMemo(() => {
    const groups = new Map<string, string[]>();
    CP2.edges.forEach(e => {
      const k = [e.source, e.target].sort().join('|');
      groups.set(k, [...(groups.get(k) ?? []), e.id]);
    });
    const out = new Map<string, number>();
    CP2.edges.forEach(e => {
      const k = [e.source, e.target].sort().join('|');
      const g = groups.get(k)!;
      const dir = e.source < e.target ? 1 : -1;
      out.set(e.id, (g.indexOf(e.id) - (g.length - 1) / 2) * 9 * dir);
    });
    return out;
  }, []);
  return (
    <svg viewBox="0 0 660 300" className="w-full h-full">
      {['Presentation', 'Application', 'Infrastructure / External'].map((l, i) => (
        <text key={l} x={6} y={20 + i * 100} fontSize={9} fill={MUTED} fontFamily="monospace">{l.toUpperCase()}</text>
      ))}
      {CP2.edges.slice(0, shownEdges).map((e, i) => {
        const a = NODE_BY_ID.get(e.source)!, b = NODE_BY_ID.get(e.target)!;
        const fresh = i >= shownEdges - EDGES_PER_FRAME && f < ARCH_FRAMES - 1;
        return <EdgeArrow key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} color={fresh ? ACCENT : '#6b7280'} width={fresh ? 2.5 : 1.4} off={offsets.get(e.id) ?? 0} />;
      })}
      {CP2.nodes.map(n => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={18} fill="#0e0e0d" stroke={LAYER_COLOR[n.layer] ?? '#8b8b86'} strokeWidth={2} />
          <text x={n.x} y={n.y + 3.5} fontSize={9} textAnchor="middle" fill="#f0f0ec" fontFamily="monospace">{n.id.replace('COMP-', 'C')}</text>
          <text x={n.x} y={n.y + 32} fontSize={9.5} textAnchor="middle" fill="#d4d4d0" fontFamily="monospace">{shortName(n.name)}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Loop stage (not taken in the recorded run) ────────────────────────────────
const ROUTES: { route: string; items: string; action: string }[] = [
  { route: 'normalize', items: 'N1 N2 N3', action: 'Re-run normalization with the findings as feedback' },
  { route: 'pattern', items: 'A2', action: 'Step down to the next-ranked macro style from the ATAM scoring (never chosen by a juror)' },
  { route: 'nodes', items: 'A1 A3 A4', action: 'Regenerate components and connections with the findings' },
  { route: 'edges', items: 'A5', action: 'Keep the components, regenerate only the connections' },
];
const A5_FEEDBACK = (() => {
  // Same format as aggregate._feedback_line, built from the cites jurors really made on A5
  const t = tallyOf(CP2.result, 'A5');
  const ids = Object.keys(t.citedCounts).sort();
  const item = CP2.items.find(i => i.id === 'A5')!;
  return `[A5] ${item.fix}: ${ids.join(', ')}`;
})();

function LoopView({ f }: { f: number }) {
  const activeRoute = f >= 1 ? 3 : -1;
  const a5 = tallyOf(CP2.result, 'A5');
  return (
    <div className="font-mono text-xs space-y-3">
      <div className="rounded-panel border px-3 py-2 text-[11px]" style={{ borderColor: `${WARN}66`, color: '#fcd34d', background: `${WARN}14` }}>
        NOT TAKEN in the recorded run ({REC.regenerations} regenerations). What follows is what the code would do if A5 had failed.
      </div>
      <div className="rounded-panel bg-[#050505] border border-line p-2.5 space-y-1">
        <div className="text-fg-subtle">A5 in the recorded run</div>
        <div className="text-fg-soft">counted no = {a5.no} of {CP2.result.votingJurors} voters. It would need {Math.floor(CP2.result.votingJurors / 2) + 1}.</div>
        {f >= 0 && <div className={f >= 0 ? 'text-fg-muted' : 'opacity-30'}>Suppose it had: item A5 fails, checkpoint 2 fails.</div>}
      </div>
      <div className="space-y-1">
        <div className="text-fg-subtle">route (from rubric.json, plain Python)</div>
        {ROUTES.map((r, i) => (
          <div key={r.route} className={`grid grid-cols-[4.5rem_4.5rem_1fr] gap-2 px-2 py-1 rounded border ${i === activeRoute ? 'bg-[#ff3b30]/10 border-[#ff3b30]/40 text-fg-strong' : 'bg-[#050505] border-line text-fg-muted'}`}>
            <span className="font-bold">{r.route}</span><span>{r.items}</span><span>{r.action}</span>
          </div>
        ))}
      </div>
      {f >= 2 && (
        <div className="rounded-panel bg-[#050505] border border-line p-2.5 space-y-1">
          <div className="text-fg-subtle">feedback injected into the generator prompt</div>
          <div className="text-[#fca5a5] break-words">{A5_FEEDBACK}</div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-fg-subtle">regenerations</span>
        {Array.from({ length: REC.maxRegenerations }, (_, i) => (
          <span key={i} className="w-6 h-6 rounded-full border flex items-center justify-center font-bold"
            style={{ borderColor: f >= 3 + i ? BAD : '#343434', color: f >= 3 + i ? '#fca5a5' : '#5a5a58' }}>{i + 1}</span>
        ))}
        <span className="text-fg-muted">of {REC.maxRegenerations}</span>
        {f >= 5 && <span className="text-danger-fg font-bold">→ ships verdict FAIL with full trace</span>}
      </div>
    </div>
  );
}

// ── Stages ────────────────────────────────────────────────────────────────────
interface Stage {
  id: string; title: string; sub: string; frames: number; flow: number; done: number; files: string[];
  draw: (f: number) => React.ReactNode; explain: (f: number) => React.ReactNode;
}

const cp1Seconds = CP1.result.jurors[CP1.result.jurors.length - 1].seconds;
const cp2Seconds = CP2.result.jurors[CP2.result.jurors.length - 1].seconds;
const ids = CP1.requirementIds;

function voteExplain(cp: CpResult, f: number, which: 1 | 2) {
  const cur = f >= 1 ? cp.jurors[f - 1] : null;
  return (
    <>
      {cur && (
        <div className="rounded-panel bg-[#e8ff00]/10 border border-[#e8ff00]/30 p-2.5 text-sm text-fg-soft space-y-1">
          <div><b>{cur.seat}</b> ({cur.model}, {cur.family}) at +{cur.seconds}s</div>
          {!cur.ok ? <div className="text-danger-fg">No usable answer: {cur.error}. The juror abstains; the panel shrinks.</div> : (
            cur.answers.map(a => (
              <div key={a.item} className="text-xs text-fg-muted">
                <b className="text-fg-soft">{a.item}</b> {a.passed ? 'yes' : 'no'}: {a.reason || '(no reason given)'}
                {!a.passed && !a.counted && <span style={{ color: WARN }}> Not counted: {a.cited.length === 0 ? 'no valid cited ID' : 'cites most of the case (shotgun)'}.</span>}
              </div>
            ))
          )}
          {cur.ok && cur.answers.length < (which === 1 ? CP1.items.length : CP2.items.length) && (
            <div className="text-xs" style={{ color: WARN }}>Answered {cur.answers.length} of {which === 1 ? CP1.items.length : CP2.items.length} items; the rest count as abstentions.</div>
          )}
        </div>
      )}
      <P>Each juror gets its own copy of the case in a shuffled order, with no history and no sight of other jurors, and answers yes or no per rubric item. The panel runs under an ADK <C>ParallelAgent</C>; local Ollama holds one small model at a time, so calls are gated one by one.</P>
      <P>A <b className="text-fg-soft">no</b> only counts if it cites at least one ID that exists in that juror&apos;s case. Invented IDs are struck through and rejected, and citing more than half of everything citable (and over two IDs) is a shotgun answer that does not count either.</P>
      {which === 1 && (
        <P>The generator was <C>{REC.generatorModels.join(', ')}</C>, so the google-family juror (gemma3:4b) sits out and the spare mistral:7b takes its seat. Seconds are measured from the start of the sitting: {cp1Seconds}s for all five.</P>
      )}
      {which === 2 && (
        <P>Same exclusion as checkpoint 1. Here only {cp.votingJurors} of 5 seats vote: granite3.3:2b returned nothing usable and llama3.2:3b answered only A5. Sitting length {cp2Seconds}s.</P>
      )}
    </>
  );
}

const STAGES: Stage[] = [
  {
    id: 'normalize', title: 'Normalize', sub: 'raw SRS → requirements', frames: ids.length + 1, flow: 1, done: 1,
    files: ['app/main.py · normalizer (generator LLM)', 'app/jury/case.py · normalization_case'],
    draw: f => (
      <div className="h-full font-mono text-xs flex flex-col gap-3">
        <div className="rounded-panel bg-[#050505] border border-line p-3 text-fg-muted">
          <div className="text-fg-subtle mb-1">RAW SRS (project {REC.project}, lines L1…Ln)</div>
          <div>free text, as the user wrote it. The raw text is not stored in the trace; its line numbers (L4, …) are what jurors cite.</div>
        </div>
        <div className="text-center text-fg-subtle">↓ generator: {REC.generatorModels.join(', ')}</div>
        <div className="rounded-panel bg-[#050505] border border-line p-3 flex-1">
          <div className="text-fg-subtle mb-2">NORMALIZED REQUIREMENTS ({Math.min(f, ids.length)} of {ids.length})</div>
          <div className="flex flex-wrap gap-2">
            {ids.slice(0, f).map(id => (
              <span key={id} className="px-2 py-1 rounded-control border font-bold"
                style={{ borderColor: id.startsWith('ASR') ? ACCENT : '#4a4a48', color: id.startsWith('ASR') ? ACCENT : '#d4d4d0', background: id.startsWith('ASR') ? '#e8ff0014' : 'transparent' }}>{id}</span>
            ))}
          </div>
          {f >= ids.length && <div className="mt-3 text-fg-muted">{CP1.asrIds.length} of {ids.length} are marked ASR (architecturally significant): they will drive the architecture.</div>}
        </div>
      </div>
    ),
    explain: () => (
      <>
        <P>ArcGen first normalizes the free-text SRS into numbered requirements: functional (<C>FR-</C>), non-functional and architecturally significant (<C>ASR-</C>). Everything downstream builds on this list, so a mistake here propagates.</P>
        <P>This is where a generator&apos;s bias shows: it can silently drop a requirement, invent one that sounds plausible, or promote a requirement to ASR without a stated driver. Checkpoint 1 exists to catch exactly those three.</P>
        <P>Recorded run: {ids.length} requirements, {CP1.asrIds.length} of them ASRs, produced by <C>{REC.generatorModels.join(', ')}</C>.</P>
      </>
    ),
  },
  {
    id: 'cp1', title: 'Checkpoint 1', sub: 'jurors vote N1–N3', frames: CP1.result.jurors.length + 1, flow: 2, done: 2,
    files: ['app/jury/roster.py · select_panel', 'app/jury/panel.py', 'app/jury/aggregate.py · parse_verdict'],
    draw: f => (
      <div className="h-full overflow-auto">
        <div className="text-xs font-mono text-fg-subtle mb-2">{CP1.title}</div>
        <JurorTable cp={CP1.result} items={CP1.items} revealed={f} current={f - 1} showExcluded />
      </div>
    ),
    explain: f => (
      <>
        <div className="space-y-1">
          {CP1.items.map(it => (
            <div key={it.id} className="text-xs text-fg-muted"><b className="text-fg-soft">{it.id}</b> {it.question}</div>
          ))}
        </div>
        {voteExplain(CP1.result, f, 1)}
      </>
    ),
  },
  {
    id: 'agg1', title: 'Aggregate', sub: 'majority in code', frames: CP1.items.length + 2, flow: 2, done: 3,
    files: ['app/jury/aggregate.py · aggregate'],
    draw: f => <div className="h-full overflow-auto"><AggregateView cp={CP1.result} items={CP1.items} f={f} /></div>,
    explain: f => {
      const n3 = tallyOf(CP1.result, 'N3');
      return (
        <>
          <P>The votes are combined by a few lines of Python, never by an LLM: an item fails only when its <b className="text-fg-soft">counted</b> no votes are a strict majority of the jurors who voted.</P>
          <P>Four of five jurors said no to something at checkpoint 1, yet nothing failed. Look at N3: {n3.no} counted no, {n3.uncitedNo} discarded (one cited all four ASRs, the other cited an ID that does not exist), so {n3.no} × 2 = {n3.no * 2} is not above {CP1.result.votingJurors}. Strict, cited, majority rules make the panel hard to push over the line with sloppy objections.</P>
          {f > CP1.items.length && <P>Checkpoint 1 passes with {CP1.result.votingJurors} voters, so normalization is accepted on attempt 1 and architecture generation starts.</P>}
        </>
      );
    },
  },
  {
    id: 'gen', title: 'Generate', sub: 'architecture', frames: ARCH_FRAMES, flow: 3, done: 3,
    files: ['app/generator.py · rank_macro_patterns (deterministic ATAM)', 'app/phase_b/node_generator.py', 'app/phase_b/edge_generator.py'],
    draw: f => <ArchitectureView f={f} />,
    explain: f => (
      <>
        <P>Pattern ranking is deterministic (ATAM scoring of the ASRs against the knowledge base); the top pattern here is <C>{CP2.style}</C>. Then the generator proposes components and connections, and a validator checks every one carries requirement traces and knowledge-base citations.</P>
        <P>Drawn from the recorded graph: {CP2.nodes.length} components, {CP2.edges.length} connections{f > 0 ? <>, {Math.min(CP2.edges.length, f * EDGES_PER_FRAME)} shown so far</> : null}. Edge IDs start at EDGE-002 in this version; each pair that talks both ways or by two channels is drawn as parallel lines.</P>
        <P>Only now does the second checkpoint look at the result. The generator never sees its own verdict until the jury has voted.</P>
      </>
    ),
  },
  {
    id: 'cp2', title: 'Checkpoint 2', sub: 'jurors vote A1–A5', frames: CP2.result.jurors.length + 1, flow: 4, done: 4,
    files: ['app/jury/case.py · architecture_case', 'app/jury/panel.py'],
    draw: f => (
      <div className="h-full overflow-auto">
        <div className="text-xs font-mono text-fg-subtle mb-2">{CP2.title}</div>
        <JurorTable cp={CP2.result} items={CP2.items} revealed={f} current={f - 1} showExcluded />
      </div>
    ),
    explain: f => (
      <>
        <div className="space-y-1">
          {CP2.items.map(it => (
            <div key={it.id} className="text-xs text-fg-muted"><b className="text-fg-soft">{it.id}</b> {it.question}</div>
          ))}
        </div>
        {voteExplain(CP2.result, f, 2)}
      </>
    ),
  },
  {
    id: 'agg2', title: 'Verdict', sub: 'PASS', frames: CP2.items.length + 2, flow: 5, done: 5,
    files: ['app/jury/aggregate.py', 'app/jury/pipeline.py · JuryRun.run'],
    draw: f => <div className="h-full overflow-auto"><AggregateView cp={CP2.result} items={CP2.items} f={f} /></div>,
    explain: f => (
      <>
        <P>With {CP2.result.votingJurors} voters, an item needs {Math.floor(CP2.result.votingJurors / 2) + 1} counted no votes to fail. A1 got 1 (qwen3:4b: no component traces ASR-003 or ASR-004), A4 got 1 (mistral:7b), A5 got 1 (llama3.2:3b). None reached the line.</P>
        <P>Both checkpoints passed with zero regenerations, so the run&apos;s verdict is <b className="text-success-fg">{REC.verdict}</b>. {CP2.result.lowIndependence ? 'Fewer than 3 families voted: flagged low independence.' : 'At least 3 distinct families voted, so independence is not flagged.'}</P>
        {f > CP2.items.length && <P>Wall time of the two sittings: {cp1Seconds}s + {cp2Seconds}s, about {((cp1Seconds + cp2Seconds) / 60).toFixed(1)} minutes of jury time for this run.</P>}
      </>
    ),
  },
  {
    id: 'loop', title: 'Regenerate', sub: 'feedback loop', frames: 6, flow: 4, done: 4,
    files: ['app/jury/pipeline.py · route the rejection', 'app/jury/aggregate.py · _feedback_line'],
    draw: f => <div className="h-full overflow-auto"><LoopView f={f} /></div>,
    explain: f => (
      <>
        <P>When a checkpoint fails, the rubric says where the work goes back to (<C>route</C>), and the failing items become feedback lines naming the exact IDs jurors cited, most-cited first. The generator is re-run with those lines in its prompt.</P>
        <P>Each checkpoint allows <b className="text-fg-soft">{REC.maxRegenerations}</b> regenerations. Every attempt gets a fresh sitting, with newly shuffled cases. After the last one, the output ships with verdict FAIL and the full trace rather than looping forever.</P>
        <P>{f >= 3 ? 'Connections-only regeneration keeps the approved components, so a small defect does not throw away a good result.' : 'The loop is drawn in red on the strip above.'} Every style step-down is recorded in the trace (<C>pattern_stepdowns</C>, empty in this run).</P>
      </>
    ),
  },
];

// ── Section A: walkthrough ────────────────────────────────────────────────────
function Walkthrough() {
  const [stageIdx, setStageIdx] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const stage = STAGES[stageIdx];
  const last = stage.frames - 1;

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (frame < last) setFrame(frame + 1);
      else if (stageIdx < STAGES.length - 1) { setStageIdx(stageIdx + 1); setFrame(0); }
      else setPlaying(false);
    }, (frame < last ? (stage.id === 'cp1' || stage.id === 'cp2' ? 1500 : 900) : 2400) / speed);
    return () => clearTimeout(t);
  }, [playing, frame, last, stageIdx, speed, stage.id]);

  const go = (i: number) => { setStageIdx(i); setFrame(0); };
  const drawn = useMemo(() => stage.draw(frame), [stage, frame]);
  const verdictShown = stage.id === 'agg2' && frame > CP2.items.length;
  const btn = 'px-2 py-1 rounded-control bg-raised border border-line text-fg-soft hover:text-fg-strong cursor-pointer';

  return (
    <div className="space-y-4">
      <div className="rounded-panel bg-surface border border-line-strong p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1.5">
            <ProvenanceBadge value={REC.provenance} label={REC.label} />
            <p className="text-xs font-mono text-fg-subtle">
              generator {REC.generatorModels.join(', ')} · verdict {REC.verdict} · {REC.regenerations} regenerations · source {REC.source.split('/').pop()}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <button onClick={() => setFrame(Math.max(0, frame - 1))} className={btn} aria-label="Step back">◀</button>
            <button onClick={() => setPlaying(p => !p)} className="px-3 py-1 rounded-control bg-info-strong text-white font-semibold cursor-pointer min-w-16">{playing ? '❚❚ Pause' : '▶ Play'}</button>
            <button onClick={() => setFrame(Math.min(last, frame + 1))} className={btn} aria-label="Step forward">▶</button>
            <button onClick={() => { go(0); setPlaying(true); }} className={btn}>Restart</button>
            <select value={speed} onChange={e => setSpeed(Number(e.target.value))} className="bg-raised border border-line rounded-control px-1.5 py-1 text-fg-soft" aria-label="Speed">
              {[0.5, 1, 2].map(s => <option key={s} value={s}>{s}×</option>)}
            </select>
          </div>
        </div>
        <FlowStrip active={stage.flow} done={stage.done} loopLit={stage.id === 'loop'} pass={verdictShown} />
        <div className="grid grid-cols-2 md:grid-cols-7 gap-1.5">
          {STAGES.map((s, i) => (
            <button key={s.id} onClick={() => go(i)}
              className={`relative text-left px-2.5 py-1.5 rounded-control border text-xs font-mono cursor-pointer ${i === stageIdx ? 'bg-selected border-accent/40 text-accent-fg' : i < stageIdx ? 'bg-raised border-line text-fg-soft' : 'bg-raised border-line text-fg-subtle hover:text-fg-soft'}`}>
              <div className="font-bold">{i + 1}. {s.title}</div>
              <div className="opacity-70 truncate">{s.sub}</div>
              {i === stageIdx && <div className="absolute left-0 bottom-0 h-0.5 bg-info transition-all" style={{ width: `${(frame / Math.max(1, last)) * 100}%` }} />}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <div className="rounded-panel bg-surface border border-line-strong p-3 h-[26rem] md:h-[30rem] overflow-hidden">{drawn}</div>
        <div className="rounded-panel bg-surface border border-line-strong p-4 space-y-3 lg:h-[30rem] lg:overflow-y-auto">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-fg-strong">{stageIdx + 1}. {stage.title}: {stage.sub}</h3>
            <span className="text-xs font-mono text-fg-subtle">step {frame}/{last}</span>
          </div>
          {stage.explain(frame)}
          <div className="pt-2 border-t border-line text-xs font-mono text-fg-subtle space-y-0.5">
            {stage.files.map(f => <div key={f}>↳ {f}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section B: metrics ────────────────────────────────────────────────────────
interface Metric { name: string; kind: string; color: string; formula: React.ReactNode; measures: string; why: string; how: string }

const METRICS: Metric[] = [
  {
    name: 'Seeded-defect recall', kind: 'Detection', color: 'text-info',
    formula: <>Recall<sub>type</sub> = |caught<sub>type</sub>| / |seeded<sub>type</sub>|</>,
    measures: 'Share of outputs with a deliberately injected defect that the jury rejects, per defect type: dropped requirement (N1), invented requirement (N2), unjustified ASR (N3), unrealized ASR (A1), uncited edge (A5).',
    why: 'A bias jury is only worth its latency if it catches what a generator quietly gets wrong. Seeding makes the ground truth known, so a miss is unambiguous.',
    how: 'A script edits a clean normalization or architecture: deletes a requirement, adds an invented one, marks an ASR with no driver, removes the only component realizing an ASR, strips the requirement traces off a connection. Caught means the checkpoint fails.',
  },
  {
    name: 'False-rejection rate', kind: 'Cost', color: 'text-danger-fg',
    formula: <>FRR = |clean rejected| / |clean|</>,
    measures: 'Share of clean, defect-free outputs that the jury wrongly fails.',
    why: 'Every false rejection triggers a regeneration: minutes of extra latency and a risk of making a good output worse. A strict jury that rejects everything has perfect recall and is useless.',
    how: 'The same pipeline run over unmodified outputs that were checked by hand to have no defect. Reported with a Wilson interval because the clean set is small.',
  },
  {
    name: 'Inter-juror agreement (Fleiss’ κ)', kind: 'Reliability', color: 'text-ai',
    formula: <>κ = (P̄ − P̄<sub>e</sub>) / (1 − P̄<sub>e</sub>), P<sub>i</sub> = (Σ<sub>j</sub> n<sub>ij</sub>² − n) / (n(n−1))</>,
    measures: 'How much more the jurors agree than chance would predict. 1 is perfect agreement, 0 is chance. Landis and Koch call 0.41 to 0.60 moderate.',
    why: 'If jurors agree only by chance, a majority is noise. If they agree perfectly they are redundant and add no independence. Moderate agreement is the useful middle.',
    how: 'Each rubric item on each case is one subject; each juror contributes pass or counted-fail. Computed over items that every seated juror answered, per checkpoint and overall, with a bootstrap interval over cases.',
  },
  {
    name: 'Majority vs best single juror', kind: 'Value of the panel', color: 'text-success-fg',
    formula: <>Δ = Acc<sub>majority</sub> − max<sub>j</sub> Acc<sub>j</sub></>,
    measures: 'Case-level accuracy (defects rejected plus clean accepted) of the majority rule against the best individual juror, using the same cases.',
    why: 'Five models cost five times the time. The panel justifies itself only if it beats simply trusting the best model, and the best model is not known in advance on a new SRS.',
    how: 'Accuracy of each juror alone and of the production majority over all cases, with a paired bootstrap on the difference (2,000 resamples). A CI that includes 0 means the gain is not established.',
  },
  {
    name: 'Cite validity rate', kind: 'Grounding', color: 'text-warning-fg',
    formula: <>Valid = |cited IDs that exist in the case| / |all cited IDs|</>,
    measures: 'Share of the IDs jurors cite on “no” votes that actually exist in their case, plus the share of “no” votes discarded for no valid cite or shotgun citing.',
    why: 'The rule “every no must cite IDs” turns vague objections into checkable claims. A juror with low cite validity is hallucinating evidence, and its votes are the ones that get discarded.',
    how: 'Counted from the trace: for each “no”, cited versus rejected_cites. Reported per juror and overall.',
  },
  {
    name: 'Regenerations per run', kind: 'Loop cost', color: 'text-info',
    formula: <>R̄ = (1/N) Σ<sub>r</sub> (regens<sub>norm,r</sub> + regens<sub>arch,r</sub>), each ≤ {REC.maxRegenerations}</>,
    measures: 'Average number of regenerations per ArcGen run, and the share of runs that still end in FAIL after the cap.',
    why: 'It is the price of feedback: each regeneration repeats a generation and a full jury sitting. It also shows whether feedback converges, since runs that need 3 or 4 are the ones that hit the cap.',
    how: 'Counted from the iteration and normalization records of each run trace.',
  },
  {
    name: 'Requirement coverage %', kind: 'Outcome', color: 'text-success-fg',
    formula: <>Coverage = |stated requirements represented| / |stated requirements|</>,
    measures: 'Share of the requirements actually stated in the raw SRS that appear in the normalized list.',
    why: 'This is the dropped-requirement failure measured end to end rather than on seeded cases: a requirement the normalizer loses is never architected.',
    how: 'A hand-labelled gold list of stated requirements per SRS, matched against the normalized output, with and without the jury.',
  },
  {
    name: 'Unsupported-requirement rate', kind: 'Outcome', color: 'text-danger-fg',
    formula: <>Unsupported = |normalized with no raw-SRS support| / |normalized|</>,
    measures: 'Share of normalized requirements that the raw SRS does not actually support (invented or exaggerated).',
    why: 'Invented requirements are the quiet bias: they make the architecture look better justified than the SRS allows. It is the invented-requirement defect measured on real generations.',
    how: 'Each normalized requirement is checked by hand against the raw SRS and labelled supported or not, with and without the jury.',
  },
  {
    name: 'Latency overhead', kind: 'Cost', color: 'text-warning-fg',
    formula: <>ΔT = T<sub>with jury</sub> − T<sub>without</sub> = Σ sittings + Σ regenerations</>,
    measures: 'Extra wall-clock time per ArcGen run: jury sittings plus any regeneration they trigger.',
    why: 'Five small models run one after another on local hardware. The accuracy gain is only a good trade if the extra minutes are acceptable for a one-off design step.',
    how: 'Wall clock from the start of each sitting to each juror’s verdict (the trace records it, e.g. +114.2s for the last of five at checkpoint 1 of the recorded run), summed with regeneration time and compared against the same SRS run without the jury.',
  },
];

function MetricsExplained() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {METRICS.map((m, i) => (
        <div key={m.name} className="p-4 rounded-panel bg-surface border border-line space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono gap-2">
            <span className={`font-bold ${m.color}`}>{i + 1}. {m.name}</span>
            <span className="text-xs text-fg-subtle bg-raised px-2 py-0.5 rounded-control shrink-0">{m.kind}</span>
          </div>
          <div className="p-2.5 bg-canvas rounded-panel border border-line-subtle text-center font-mono text-xs text-info">{m.formula}</div>
          <dl className="space-y-1.5 text-xs leading-relaxed">
            <div><dt className="inline font-mono font-bold text-fg-soft">Measures. </dt><dd className="inline text-fg-muted">{m.measures}</dd></div>
            <div><dt className="inline font-mono font-bold text-fg-soft">Why for a bias jury. </dt><dd className="inline text-fg-muted">{m.why}</dd></div>
            <div><dt className="inline font-mono font-bold text-fg-soft">How measured. </dt><dd className="inline text-fg-muted">{m.how}</dd></div>
          </dl>
        </div>
      ))}
    </div>
  );
}

// ── Section C: benchmark ──────────────────────────────────────────────────────
const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => <th className={`p-3 ${right ? 'text-right' : 'text-left'}`}>{children}</th>;

function Benchmark() {
  const n = BM.meta.cases, clean = BM.meta.clean, seeded = BM.meta.seeded;
  const acc = (caught: number, fr: number) => caught + clean - fr;
  const maj = BM.panelRows.find(r => r.id === 'maj5')!;
  const best = BM.panelRows.find(r => r.id === 'best')!;
  const majAcc = acc(maj.caught, maj.falseRej);
  const meanSingle = BM.jurors.reduce((s, j) => s + acc(j.caught, j.falseRej), 0) / BM.jurors.length / n;
  const byId = (id: string) => BM.e2e.rows.find(r => r.id === id)!;
  const unsup = byId('unsupported'), cov = byId('coverage');
  const regenTotal = BM.e2e.regenDist.reduce((s, r) => s + r.regens * r.runs, 0);
  const runs = BM.e2e.runs;
  const lat = BM.e2e.latency;
  const totalCites = BM.jurors.reduce((s, j) => s + j.cites, 0);
  const validCites = BM.jurors.reduce((s, j) => s + j.validCites, 0);
  const rate = (f: Frac) => f.k / f.n;

  return (
    <div className="space-y-5">
      <ProvenanceBadge value={BM.provenance} />

      <p className="text-sm text-fg-muted leading-relaxed max-w-4xl">
        {BM.provenance === 'illustrative' ? 'Planned protocol: ' : 'Protocol: '}{BM.meta.docs} SRS documents, each with a clean output and seeded variants: {BM.meta.cases} judged cases ({clean} clean,
        {' '}{seeded} with one injected defect). Every document is also generated end to end once
        without and once with the jury ({runs} runs per arm, generator {BM.meta.generator}). Hardware: {BM.meta.hardware}. Intervals: {BM.meta.ciMethod}. {BM.meta.note}
      </p>

      {/* Headline tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Majority accuracy" value={fmt(majAcc / n)} sub={`${ciText(majAcc, n)} · n=${n} · mean single juror ${fmt(meanSingle)}`} />
        <Tile label="Fleiss κ" value={fmt(BM.kappa.value, 2)} sub={`[${fmt(BM.kappa.ci[0], 2)}, ${fmt(BM.kappa.ci[1], 2)}] · moderate agreement`} />
        <Tile label="False-rejection rate" value={fmt(maj.falseRej / clean)} sub={`${maj.falseRej} of ${clean} clean outputs · ${ciText(maj.falseRej, clean)}`} />
        <Tile label="Unsupported requirements" value={`${pct(rate(unsup.without))} → ${pct(rate(unsup.with))}`} sub={`${unsup.without.k}/${unsup.without.n} → ${unsup.with.k}/${unsup.with.n} · without → with jury`} />
        <Tile label="Requirement coverage" value={`${pct(rate(cov.without))} → ${pct(rate(cov.with))}`} sub={`${cov.without.k}/${cov.without.n} → ${cov.with.k}/${cov.with.n} stated requirements`} />
        <Tile label="Regenerations per run" value={fmt(regenTotal / runs, 2)} sub={`${regenTotal} in ${runs} runs · ${BM.e2e.finalPass}/${runs} end PASS`} />
        <Tile label="Cite validity" value={pct(validCites / totalCites)} sub={`${validCites} of ${totalCites} cited IDs exist · ${ciText(validCites, totalCites)}`} />
        <Tile label="Latency overhead" value={`+${lat.overheadMean.toFixed(1)} min`} sub={`CI [${lat.overheadCi[0]}, ${lat.overheadCi[1]}] · P90 +${lat.overheadP90} min · baseline ${lat.baselineMin} min`} />
      </div>

      {/* Single vs majority */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">Single juror vs 5-juror majority</h3>
        <div className="rounded-panel bg-surface border border-line-strong overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="text-fg-subtle">
              <tr className="border-b border-line">
                <TH>Configuration</TH><TH>Voters</TH><TH>Accuracy [95% CI]</TH>
                <TH right>Defect recall</TH><TH right>False rejection</TH><TH>Δ accuracy vs best single [95% CI]</TH>
              </tr>
            </thead>
            <tbody>
              {BM.panelRows.map(r => {
                const a = acc(r.caught, r.falseRej);
                const isMaj = r.id === 'maj5';
                return (
                  <tr key={r.id} className={`border-b border-line/60 ${isMaj ? 'bg-selected' : ''}`}>
                    <td className="p-3 text-fg-strong font-bold">{r.label}</td>
                    <td className="p-3 text-fg-muted">{r.voters}</td>
                    <td className="p-3 min-w-[200px]"><CiBar value={a / n} ci={wilson(a, n)} /></td>
                    <td className="p-3 text-right text-fg-soft">{fmt(r.caught / seeded)} <span className="text-fg-subtle">({r.caught}/{seeded})</span></td>
                    <td className="p-3 text-right" style={{ color: r.falseRej / clean > 0.2 ? BAD : undefined }}>{fmt(r.falseRej / clean)} <span className="text-fg-subtle">({r.falseRej}/{clean})</span></td>
                    <td className="p-3 whitespace-nowrap text-fg-soft">
                      {r.id === 'best' ? 'baseline' : r.id === 'maj5'
                        ? `${signed(BM.diffs.vsBest.value)} [${signed(BM.diffs.vsBest.ci[0])}, ${signed(BM.diffs.vsBest.ci[1])}]`
                        : `${signed(a / n - best_acc(best))}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs font-mono text-fg-subtle leading-relaxed">
          Majority beats the mean single juror by {signed(BM.diffs.vsMeanSingle.value)} [{signed(BM.diffs.vsMeanSingle.ci[0])}, {signed(BM.diffs.vsMeanSingle.ci[1])}] but its edge over the
          best single juror is {signed(BM.diffs.vsBest.value)} with an interval that includes 0: the panel is the safer choice, not a proven winner over gemma3:4b. Switching the cite rule off roughly doubles false rejections.
        </p>
      </div>

      {/* Per juror */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">Per juror</h3>
        <div className="rounded-panel bg-surface border border-line-strong overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="text-fg-subtle">
              <tr className="border-b border-line">
                <TH>Juror</TH><TH>Accuracy [95% CI]</TH><TH right>Defect recall</TH><TH right>False rejection</TH>
                <TH right>Cite validity</TH><TH right>“No” discarded</TH><TH>Weakness</TH>
              </tr>
            </thead>
            <tbody>
              {BM.jurors.map(j => {
                const a = acc(j.caught, j.falseRej);
                const fr = j.falseRej / clean, cv = j.validCites / j.cites;
                return (
                  <tr key={j.model} className="border-b border-line/60">
                    <td className="p-3"><div className="text-fg-strong font-bold">{j.model}</div><div className="text-fg-subtle">{j.family}</div></td>
                    <td className="p-3 min-w-[200px]"><CiBar value={a / n} ci={wilson(a, n)} /></td>
                    <td className="p-3 text-right text-fg-soft">{fmt(j.caught / seeded)}</td>
                    <td className="p-3 text-right font-bold" style={{ color: fr > 0.25 ? BAD : undefined }}>{fmt(fr)}</td>
                    <td className="p-3 text-right font-bold" style={{ color: cv < 0.8 ? WARN : undefined }}>{pct(cv)}</td>
                    <td className="p-3 text-right text-fg-soft">{j.discarded}/{j.noVotes}</td>
                    <td className="p-3 text-fg-muted min-w-[220px]">{j.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seeded defects + per checkpoint */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">Seeded-defect recall by type</h3>
          <div className="rounded-panel bg-surface border border-line-strong overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="text-fg-subtle">
                <tr className="border-b border-line"><TH>Defect</TH><TH right>n</TH><TH>Majority recall [95% CI]</TH><TH right>Best single</TH></tr>
              </thead>
              <tbody>
                {BM.defectTypes.map(d => (
                  <tr key={d.id} className="border-b border-line/60">
                    <td className="p-3"><div className="text-fg-strong font-bold">{d.label}</div><div className="text-fg-subtle">{d.item} · {d.checkpoint}</div></td>
                    <td className="p-3 text-right text-fg-muted">{d.n}</td>
                    <td className="p-3 min-w-[190px]"><CiBar value={d.majority / d.n} ci={wilson(d.majority, d.n)} /></td>
                    <td className="p-3 text-right text-fg-soft">{fmt(d.best / d.n)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">Per checkpoint (majority)</h3>
          <div className="rounded-panel bg-surface border border-line-strong overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="text-fg-subtle">
                <tr className="border-b border-line"><TH>Checkpoint</TH><TH right>n</TH><TH>Accuracy [95% CI]</TH><TH right>Recall</TH><TH right>False rej.</TH><TH right>κ [CI]</TH></tr>
              </thead>
              <tbody>
                {BM.checkpoints.map(c => {
                  const a = acc(c.caught, c.falseRej);
                  return (
                    <tr key={c.id} className="border-b border-line/60">
                      <td className="p-3 text-fg-strong font-bold">{c.label}</td>
                      <td className="p-3 text-right text-fg-muted">{c.n}</td>
                      <td className="p-3 min-w-[190px]"><CiBar value={a / c.n} ci={wilson(a, c.n)} /></td>
                      <td className="p-3 text-right text-fg-soft">{fmt(c.caught / c.defects)}</td>
                      <td className="p-3 text-right text-fg-soft">{fmt(c.falseRej / c.clean)}</td>
                      <td className="p-3 text-right text-fg-soft whitespace-nowrap">{fmt(c.kappa, 2)} [{fmt(c.kappaCi[0], 2)}, {fmt(c.kappaCi[1], 2)}]</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* End to end */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">ArcGen without jury vs with jury ({runs} runs per arm)</h3>
        <div className="rounded-panel bg-surface border border-line-strong overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="text-fg-subtle">
              <tr className="border-b border-line">
                <TH>Measure</TH><TH>Without jury [95% CI]</TH><TH>With jury [95% CI]</TH><TH right>Change</TH>
              </tr>
            </thead>
            <tbody>
              {BM.e2e.rows.map(r => {
                const w0 = rate(r.without), w1 = rate(r.with);
                const good = r.better === 'higher' ? w1 > w0 : w1 < w0;
                return (
                  <tr key={r.id} className="border-b border-line/60">
                    <td className="p-3"><div className="text-fg-strong font-bold">{r.label}</div><div className="text-fg-subtle">{r.unit} · {r.better} is better</div></td>
                    <td className="p-3"><div className="text-fg-soft">{pct(w0)} <span className="text-fg-subtle">({r.without.k}/{r.without.n})</span></div><div className="text-fg-subtle">{ciText(r.without.k, r.without.n)}</div></td>
                    <td className="p-3"><div className="text-fg-strong">{pct(w1)} <span className="text-fg-subtle">({r.with.k}/{r.with.n})</span></div><div className="text-fg-subtle">{ciText(r.with.k, r.with.n)}</div></td>
                    <td className="p-3 text-right font-bold whitespace-nowrap" style={{ color: good ? OK : BAD }}>{signed((w1 - w0) * 100, 1)} pts</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs font-mono text-fg-subtle">Several intervals overlap for the smaller counts (ASR and edge rates); the coverage and unsupported-requirement gaps are the clearest.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-panel bg-surface border border-line-strong p-5 space-y-3">
          <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">Regenerations per run</h3>
          {BM.e2e.regenDist.map(r => (
            <div key={r.regens} className="flex items-center gap-2 text-xs font-mono">
              <span className="w-16 text-fg-muted">{r.regens} regen{r.regens === 1 ? '' : 's'}</span>
              <div className="relative flex-1 h-2.5 rounded bg-line/40">
                <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(r.runs / runs) * 100}%`, backgroundColor: `rgba(${HUE}, 0.6)` }} />
              </div>
              <span className="w-14 text-right text-fg-strong">{r.runs} runs</span>
            </div>
          ))}
          <p className="text-xs font-mono text-fg-subtle leading-relaxed">
            Mean {fmt(regenTotal / runs, 2)} ({BM.e2e.regenByCheckpoint.normalization} at checkpoint 1, {BM.e2e.regenByCheckpoint.architecture} at checkpoint 2). {runs - BM.e2e.finalPass} of {runs} runs hit the cap and shipped with verdict FAIL.
          </p>
        </div>
        <div className="rounded-panel bg-surface border border-line-strong p-5 space-y-2">
          <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">Latency</h3>
          <p className="text-sm text-fg-muted leading-relaxed">
            Baseline ArcGen run: about {lat.baselineMin} min. One jury pass over both checkpoints, as in the recorded MiniShop run, takes {lat.sittingSeconds[0]}s + {lat.sittingSeconds[1]}s
            (about {((lat.sittingSeconds[0] + lat.sittingSeconds[1]) / 60).toFixed(1)} min). Add regenerations and the mean overhead is +{lat.overheadMean} min [{lat.overheadCi[0]}, {lat.overheadCi[1]}], with the P90 run
            paying +{lat.overheadP90} min. That is acceptable for a design step done once per project, and too slow for an interactive loop.
          </p>
        </div>
      </div>

      {/* Limitations */}
      <div className="rounded-panel bg-warning/10 border border-warning/30 p-5 space-y-2">
        <h3 className="text-sm font-bold text-warning-fg font-mono uppercase tracking-wider">Limitations / failure modes</h3>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-fg-muted leading-relaxed">
          {BM.limitations.map(l => <li key={l}>{l}</li>)}
        </ul>
      </div>
    </div>
  );
}

const best_acc = (r: { caught: number; falseRej: number }) => (r.caught + BM.meta.clean - r.falseRej) / BM.meta.cases;

// ── Why / how it improved ─────────────────────────────────────────────────────
function WhyImproved() {
  const nocite = BM.panelRows.find(r => r.id === 'nocite')!;
  const maj = BM.panelRows.find(r => r.id === 'maj5')!;
  const maj4 = BM.panelRows.find(r => r.id === 'maj4')!;
  const unsup = BM.e2e.rows.find(r => r.id === 'unsupported')!;
  const cov = BM.e2e.rows.find(r => r.id === 'coverage')!;
  const mechanisms = [
    {
      title: 'Independent families',
      body: `A generator tends to approve its own family's habits, so jurors from the generator's family sit out and each remaining juror is a different family with its own shuffled case and no shared history. In the recorded run google/gemma was excluded and mistral took the seat. Dropping to 4 voters costs about ${((maj.caught + 24 - maj.falseRej - (maj4.caught + 24 - maj4.falseRej)) / BM.meta.cases * 100).toFixed(1)} accuracy points here, which is the price of independence.`,
    },
    {
      title: 'Mandatory cites for “no”',
      body: `An objection that names no existing ID cannot fail anything. With the cite rule switched off, false rejections go from ${maj.falseRej} to ${nocite.falseRej} of ${BM.meta.clean} clean outputs. It also made findings usable: the feedback line lists the exact requirement, component or connection IDs.`,
    },
    {
      title: 'Majority in plain Python',
      body: 'The tally is a few lines of code with a fixed threshold (counted no × 2 > voters), so one over-strict or confused small model cannot decide alone and no LLM judges the judges. In the recorded run four of five jurors objected to something at checkpoint 1 and the rules still correctly held the line.',
    },
    {
      title: 'Feedback-driven regeneration',
      body: `A failed checkpoint does not just reject: the cited IDs go back into the generator's prompt and the rubric routes the work to the right stage. That is what moves the end-to-end numbers: unsupported requirements ${pct(unsup.without.k / unsup.without.n)} to ${pct(unsup.with.k / unsup.with.n)} and coverage ${pct(cov.without.k / cov.without.n)} to ${pct(cov.with.k / cov.with.n)}, at an average of ${(BM.e2e.regenDist.reduce((s, r) => s + r.regens * r.runs, 0) / BM.e2e.runs).toFixed(1)} regenerations per run, capped at ${REC.maxRegenerations}.`,
    },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mechanisms.map((m, i) => (
          <div key={m.title} className="p-4 rounded-panel bg-surface border border-line space-y-1.5">
            <div className="text-xs font-mono font-bold text-accent-fg">{i + 1}. {m.title}</div>
            <p className="text-sm text-fg-muted leading-relaxed">{m.body}</p>
          </div>
        ))}
      </div>
      {BM.provenance === 'illustrative' && (
        <p className="text-xs font-mono text-warning-fg">The numbers quoted in this narrative come from the illustrative benchmark figures above, not from a measured run.</p>
      )}
    </div>
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────────
export function JuryEvaluationTab() {
  return (
    <div className="space-y-10 animate-fade-in pb-12">
      <div className="rounded-panel bg-gradient-to-br from-raised via-surface to-canvas border border-line-strong p-6 md:p-8 space-y-3">
        <span className="px-2.5 py-0.5 rounded-full bg-info-strong/20 border border-info-strong/40 text-info text-xs font-mono font-bold tracking-wide">
          ARCGEN · BIAS JURY
        </span>
        <h1 className="text-2xl md:text-3xl font-bold text-fg-strong tracking-tight">Five small models check the generator</h1>
        <p className="text-sm md:text-base text-fg-muted leading-relaxed max-w-4xl">
          After ArcGen normalizes an SRS and again after it generates the architecture, a panel of five small local Ollama models
          (qwen3:4b, llama3.2:3b, gemma3:4b, phi4-mini, granite3.3:2b; spare mistral:7b) answers yes or no rubric items. Every no must
          cite IDs, jurors from the generator&apos;s own family are excluded, votes are combined by majority in plain Python, and a failure
          sends the work back with the jury&apos;s findings, up to {REC.maxRegenerations} times.
        </p>
      </div>

      <section className="space-y-4">
        <SectionHead letter="A" title="Walkthrough" sub="Real MiniShop trace: every vote, cite and timing below comes from the recorded JSON" />
        <Walkthrough />
      </section>

      <section className="space-y-4">
        <SectionHead letter="B" title="Metrics explained" sub="What each number means, why a bias jury needs it, how it is measured" />
        <MetricsExplained />
      </section>

      <section className="space-y-4">
        <SectionHead letter="C" title="Benchmark results" sub="ArcGen without vs with the jury; single juror vs 5-juror majority" />
        <Benchmark />
      </section>

      <section className="space-y-4">
        <SectionHead letter="D" title="Why and how it improved" sub="Each effect traced to a mechanism" />
        <WhyImproved />
      </section>
    </div>
  );
}
