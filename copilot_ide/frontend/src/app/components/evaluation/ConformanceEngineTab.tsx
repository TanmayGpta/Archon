"use client";
import React, { useEffect, useMemo, useState } from 'react';

// How a conformance audit works, stage by stage, drawn and animated: AST import extraction,
// dependency graph, Tarjan SCCs (cycle search), layer mapping, rule check, health score.
// Data is test_codebases/ecommerce_platform under the Clean Architecture blueprint (15 internal
// edges, 6 violations, 60.0%); the Tarjan stage uses a small graph with two seeded cycles,
// because the demo codebase has none.

const LAYER = { Presentation: '#e8ff00', Application: '#4f9dff', Domain: '#6fd38a', Infrastructure: '#b48cff' } as const;
type Layer = keyof typeof LAYER;
const OK = '#10b981', BAD = '#ff3b30', MUTED = '#5a5a58';

// ── Demo codebase ─────────────────────────────────────────────────────────────
const NODES: { id: string; layer: Layer; x: number; y: number }[] = [
  { id: 'presentation.api', layer: 'Presentation', x: 90, y: 50 },
  { id: 'presentation.order_routes', layer: 'Presentation', x: 250, y: 50 },
  { id: 'presentation.controllers', layer: 'Presentation', x: 410, y: 50 },
  { id: 'presentation.auth_middleware', layer: 'Presentation', x: 570, y: 50 },
  { id: 'main', layer: 'Application', x: 175, y: 145 },
  { id: 'application.order_service', layer: 'Application', x: 360, y: 145 },
  { id: 'application.inventory_service', layer: 'Application', x: 545, y: 145 },
  { id: 'domain.models', layer: 'Domain', x: 90, y: 240 },
  { id: 'domain.order_calculator', layer: 'Domain', x: 250, y: 240 },
  { id: 'domain.fraud_checker', layer: 'Domain', x: 410, y: 240 },
  { id: 'domain.payment_rule', layer: 'Domain', x: 570, y: 240 },
  { id: 'infrastructure.database', layer: 'Infrastructure', x: 90, y: 335 },
  { id: 'infrastructure.audit_logger', layer: 'Infrastructure', x: 250, y: 335 },
  { id: 'infrastructure.kafka_producer', layer: 'Infrastructure', x: 410, y: 335 },
  { id: 'infrastructure.stripe_client', layer: 'Infrastructure', x: 570, y: 335 },
];
const POS = new Map(NODES.map(n => [n.id, n]));
const EDGES: [string, string][] = [
  ['main', 'presentation.api'], ['main', 'application.order_service'], ['main', 'infrastructure.database'],
  ['presentation.api', 'presentation.order_routes'], ['application.order_service', 'domain.models'],
  ['application.order_service', 'domain.order_calculator'], ['domain.order_calculator', 'domain.models'],
  ['domain.fraud_checker', 'domain.models'], ['domain.fraud_checker', 'infrastructure.database'],
  ['domain.payment_rule', 'domain.models'], ['domain.payment_rule', 'presentation.controllers'],
  ['infrastructure.audit_logger', 'presentation.auth_middleware'], ['presentation.order_routes', 'application.order_service'],
  ['presentation.order_routes', 'infrastructure.database'], ['presentation.order_routes', 'presentation.controllers'],
];
const ALLOWED: [Layer, Layer][] = [
  ['Application', 'Domain'], ['Presentation', 'Application'], ['Infrastructure', 'Application'],
  ['Presentation', 'Domain'], ['Infrastructure', 'Domain'],
];
const verdict = ([s, t]: [string, string]) => {
  const a = POS.get(s)!.layer, b = POS.get(t)!.layer;
  if (a === b) return 'same layer';
  return ALLOWED.some(([x, y]) => x === a && y === b) ? 'allowed' : 'violation';
};

const SOURCE = [
  'from fastapi import APIRouter',
  'from application.order_service import OrderService',
  'from infrastructure.database import DatabaseConnection',
  'from presentation.controllers import ResponseFormatter',
  '',
  'router = APIRouter()',
  '',
  '@router.get("/{order_id}")',
  'def get_order_details(order_id: str):',
  '    db = DatabaseConnection()',
];
// top-level statements ast.walk meets, in order: [line, node, imported module | null]
const AST_STEPS: [number, string, string | null][] = [
  [1, 'ImportFrom', 'fastapi'], [2, 'ImportFrom', 'application.order_service'],
  [3, 'ImportFrom', 'infrastructure.database'], [4, 'ImportFrom', 'presentation.controllers'],
  [6, 'Assign', null], [9, 'FunctionDef', null],
];

// ── Tarjan on a small graph with two cycles ───────────────────────────────────
const T_NODES: { id: string; x: number; y: number }[] = [
  { id: 'orders.api', x: 80, y: 70 }, { id: 'orders.service', x: 260, y: 70 }, { id: 'orders.repo', x: 260, y: 200 },
  { id: 'billing.invoice', x: 450, y: 70 }, { id: 'billing.tax', x: 600, y: 140 }, { id: 'billing.ledger', x: 450, y: 210 },
  { id: 'auth.session', x: 80, y: 220 }, { id: 'utils.time', x: 600, y: 290 },
];
const T_POS = new Map(T_NODES.map(n => [n.id, n]));
const T_EDGES: [string, string][] = [
  ['orders.api', 'orders.service'], ['orders.api', 'auth.session'], ['orders.service', 'orders.repo'],
  ['orders.repo', 'orders.service'], ['orders.service', 'billing.invoice'], ['billing.invoice', 'billing.tax'],
  ['billing.tax', 'billing.invoice'], ['billing.tax', 'billing.ledger'], ['billing.ledger', 'billing.invoice'],
  ['billing.ledger', 'utils.time'],
];
const SCC_COLORS = ['#ff5c2b', '#b48cff', '#4f9dff', '#6fd38a', '#e8ff00', '#e2e2da'];

type TEvent =
  | { k: 'visit'; v: string; index: number }
  | { k: 'edge'; v: string; w: string; kind: 'tree' | 'back' | 'done' }
  | { k: 'low'; v: string; low: number; via: string }
  | { k: 'scc'; members: string[] };

function tarjanTrace(): TEvent[] {
  const ev: TEvent[] = [];
  const index = new Map<string, number>(), low = new Map<string, number>(), on = new Set<string>(), stack: string[] = [];
  let next = 0;
  const adj = (v: string) => T_EDGES.filter(([a]) => a === v).map(([, b]) => b);
  const visit = (v: string) => {
    index.set(v, next); low.set(v, next); next++; stack.push(v); on.add(v);
    ev.push({ k: 'visit', v, index: index.get(v)! });
    for (const w of adj(v)) {
      if (!index.has(w)) {
        ev.push({ k: 'edge', v, w, kind: 'tree' });
        visit(w);
        if (low.get(w)! < low.get(v)!) { low.set(v, low.get(w)!); ev.push({ k: 'low', v, low: low.get(v)!, via: w }); }
      } else if (on.has(w)) {
        ev.push({ k: 'edge', v, w, kind: 'back' });
        if (index.get(w)! < low.get(v)!) { low.set(v, index.get(w)!); ev.push({ k: 'low', v, low: low.get(v)!, via: w }); }
      } else {
        ev.push({ k: 'edge', v, w, kind: 'done' });
      }
    }
    if (low.get(v) === index.get(v)) {
      const members: string[] = [];
      let w: string;
      do { w = stack.pop()!; on.delete(w); members.push(w); } while (w !== v);
      ev.push({ k: 'scc', members });
    }
  };
  T_NODES.forEach(n => { if (!index.has(n.id)) visit(n.id); });
  return ev;
}
const TRACE = tarjanTrace();

function tarjanState(upto: number) {
  const index = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [];
  const scc = new Map<string, number>(); const sccs: string[][] = [];
  const edgeKind = new Map<string, string>();
  let current: TEvent | null = null;
  TRACE.slice(0, upto).forEach(e => {
    current = e;
    if (e.k === 'visit') { index.set(e.v, e.index); low.set(e.v, e.index); stack.push(e.v); }
    if (e.k === 'edge') edgeKind.set(`${e.v}>${e.w}`, e.kind);
    if (e.k === 'low') low.set(e.v, e.low);
    if (e.k === 'scc') {
      e.members.forEach(m => { scc.set(m, sccs.length); stack.splice(stack.indexOf(m), 1); });
      sccs.push(e.members);
    }
  });
  return { index, low, stack, scc, sccs, edgeKind, current: current as TEvent | null };
}

const describe = (e: TEvent | null): string => {
  if (!e) return 'Start: every module unvisited, empty stack. DFS from the first module.';
  switch (e.k) {
    case 'visit': return `Visit ${e.v}: index = lowlink = ${e.index}, push it on the stack.`;
    case 'edge': return e.kind === 'tree' ? `Edge ${e.v} → ${e.w}: unvisited, recurse into it.`
      : e.kind === 'back' ? `Edge ${e.v} → ${e.w}: ${e.w} is still on the stack, so it is an ancestor: a cycle closes here.`
        : `Edge ${e.v} → ${e.w}: already in a finished component, ignore.`;
    case 'low': return `lowlink(${e.v}) drops to ${e.low} (via ${e.via}): it can reach an older node on the stack.`;
    case 'scc': return e.members.length > 1
      ? `lowlink = index at the root: pop ${e.members.length} modules as one SCC {${e.members.join(', ')}}. That is a dependency cycle.`
      : `${e.members[0]} is its own root with no way back: a single-module SCC, no cycle.`;
  }
};

// ── Shared drawing helpers ────────────────────────────────────────────────────
const short = (id: string) => id.split('.').pop()!;

function Arrow({ x1, y1, x2, y2, color, width = 1.5, dashed = false, r = 16 }: {
  x1: number; y1: number; x2: number; y2: number; color: string; width?: number; dashed?: boolean; r?: number;
}) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const sx = x1 + (dx / len) * r, sy = y1 + (dy / len) * r, ex = x2 - (dx / len) * (r + 4), ey = y2 - (dy / len) * (r + 4);
  return (
    <g>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeWidth={width} strokeDasharray={dashed ? '4 3' : undefined} />
      <polygon points="0,-3.5 7,0 0,3.5" fill={color}
        transform={`translate(${ex},${ey}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI})`} />
    </g>
  );
}

function ModuleGraph({ shownEdges, edgeColor, nodeColor, highlight, badge }: {
  shownEdges: number; edgeColor: (i: number) => string; nodeColor: (id: string) => string;
  highlight?: number; badge?: (id: string) => string | null;
}) {
  return (
    <svg viewBox="0 0 660 380" className="w-full h-full">
      {(['Presentation', 'Application', 'Domain', 'Infrastructure'] as Layer[]).map((l, i) => (
        <text key={l} x={6} y={22 + i * 95} fontSize={9} fill={MUTED} fontFamily="monospace">{l.toUpperCase()}</text>
      ))}
      {EDGES.slice(0, shownEdges).map(([s, t], i) => {
        const a = POS.get(s)!, b = POS.get(t)!;
        return <Arrow key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} color={edgeColor(i)} width={i === highlight ? 3 : 1.5} />;
      })}
      {NODES.map(n => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={14} fill="#0e0e0d" stroke={nodeColor(n.id)} strokeWidth={2} />
          <text x={n.x} y={n.y + 27} fontSize={9.5} textAnchor="middle" fill="#d4d4d0" fontFamily="monospace">{short(n.id)}</text>
          {badge?.(n.id) && (
            <text x={n.x} y={n.y + 3.5} fontSize={10} textAnchor="middle" fill={nodeColor(n.id)} fontFamily="monospace" fontWeight="bold">
              {badge(n.id)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ── Stages ────────────────────────────────────────────────────────────────────
interface Stage {
  id: string; title: string; sub: string; frames: number; files: string[];
  draw: (f: number) => React.ReactNode; explain: (f: number) => React.ReactNode;
}

const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-fg-muted leading-relaxed">{children}</p>;
const C = ({ children }: { children: React.ReactNode }) => <code className="text-info bg-raised px-1 rounded-control text-xs">{children}</code>;

const STAGES: Stage[] = [
  {
    id: 'ast', title: 'Parse', sub: 'AST imports', frames: AST_STEPS.length + 1, files: ['conformance/extraction.py · extract_imports_from_file'],
    draw: f => {
      const done = AST_STEPS.slice(0, f);
      const cur = AST_STEPS[f - 1];
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 h-full font-mono text-xs">
          <div className="rounded-panel bg-[#050505] border border-line p-3 overflow-hidden">
            <div className="text-fg-subtle mb-2">presentation/order_routes.py</div>
            {SOURCE.map((line, i) => {
              const step = done.find(([l]) => l === i + 1);
              const isCur = cur && cur[0] === i + 1;
              return (
                <div key={i} className={`flex gap-3 px-1 rounded ${isCur ? 'bg-[#e8ff00]/15' : ''}`}>
                  <span className="text-fg-subtle w-4 text-right">{i + 1}</span>
                  <span style={{ color: step?.[2] ? '#e8ff00' : step ? '#a0a0a0' : '#6b7280' }}>{line || ' '}</span>
                </div>
              );
            })}
          </div>
          <div className="rounded-panel bg-[#050505] border border-line p-3 overflow-hidden space-y-1">
            <div className="text-fg-subtle mb-1">ast.parse() → tree</div>
            <div className="text-fg-strong">Module</div>
            {done.map(([line, node, mod], i) => (
              <div key={i} className="pl-4 flex items-center gap-2">
                <span className="text-fg-subtle">├─</span>
                <span style={{ color: mod ? '#e8ff00' : '#6b7280' }}>{node}</span>
                {mod && <span className="text-fg-muted">module=&apos;{mod}&apos; lineno={line}</span>}
              </div>
            ))}
            {f > 0 && (
              <div className="pt-2 mt-2 border-t border-line text-fg-muted">
                <div className="text-fg-subtle">imports extracted:</div>
                {done.filter(([, , m]) => m).map(([line, , mod]) => (
                  <div key={mod}><span className="text-info">&quot;{mod}&quot;</span>: {'{'}line_number: {line}{'}'}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    },
    explain: () => (
      <>
        <P>Each <C>.py</C> file is parsed into an abstract syntax tree with Python&apos;s own <C>ast.parse</C>, so the result is exactly what the interpreter would import. Text search would trip on strings, comments and multi-line imports.</P>
        <P><C>ast.walk</C> visits every node. Only <C>Import</C> and <C>ImportFrom</C> matter: each gives the imported module plus its line number and source line, kept for the violation report. Other nodes (assignments, functions) are skipped.</P>
        <P>The file&apos;s own module name comes from its path: <C>presentation/order_routes.py</C> → <C>presentation.order_routes</C>.</P>
      </>
    ),
  },
  {
    id: 'graph', title: 'Graph', sub: 'NetworkX DiGraph', frames: EDGES.length + 1, files: ['conformance/graph.py · build_dependency_graph'],
    draw: f => <ModuleGraph shownEdges={f} highlight={f - 1} edgeColor={i => (i === f - 1 ? '#e8ff00' : '#6b7280')} nodeColor={() => '#8b8b86'} />,
    explain: f => (
      <>
        <P>Every import becomes a directed edge <C>importer → imported</C> in a NetworkX <C>DiGraph</C>. Edge {Math.min(f, EDGES.length)} of {EDGES.length}{f > 0 ? <>: <C>{EDGES[f - 1][0]} → {EDGES[f - 1][1]}</C></> : null}.</P>
        <P>Targets are typed: <b className="text-fg-soft">internal</b> (a module in this codebase), <b className="text-fg-soft">stdlib</b> or <b className="text-fg-soft">external</b> (third-party, e.g. <C>fastapi</C>). Sub-modules collapse to their root package (<C>os.path</C> → <C>os</C>).</P>
        <P>Only internal → internal edges are judged later; stdlib and third-party nodes are drawn for context. Shown: the demo&apos;s 15 internal edges.</P>
      </>
    ),
  },
  {
    id: 'tarjan', title: 'Cycles', sub: "Tarjan's SCC", frames: TRACE.length + 1, files: ['conformance/graph.py · find_cycles (nx.simple_cycles)'],
    draw: f => {
      const st = tarjanState(f);
      const cur = st.current;
      const active = cur && cur.k === 'edge' ? `${cur.v}>${cur.w}` : null;
      return (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_9.5rem] gap-3 h-full">
          <svg viewBox="0 0 680 330" className="w-full h-full">
            {T_EDGES.map(([a, b]) => {
              const p = T_POS.get(a)!, q = T_POS.get(b)!;
              const kind = st.edgeKind.get(`${a}>${b}`);
              const color = `${a}>${b}` === active ? '#e8ff00' : kind === 'back' ? BAD : kind === 'tree' ? '#a0a0a0' : kind ? '#4a4a48' : '#2b2b2a';
              // the two opposite edges of a 2-cycle are offset so both stay visible
              const twin = T_EDGES.some(([x, y]) => x === b && y === a);
              const off = twin ? (a < b ? 7 : -7) : 0;
              const nx = -(q.y - p.y), ny = q.x - p.x, nl = Math.hypot(nx, ny) || 1;
              return <Arrow key={`${a}>${b}`} x1={p.x + (nx / nl) * off} y1={p.y + (ny / nl) * off} x2={q.x + (nx / nl) * off} y2={q.y + (ny / nl) * off}
                color={color} width={`${a}>${b}` === active ? 3 : 1.6} dashed={kind === 'back'} r={22} />;
            })}
            {T_NODES.map(n => {
              const s = st.scc.get(n.id);
              const onStack = st.stack.includes(n.id);
              const stroke = s !== undefined ? (st.sccs[s].length > 1 ? SCC_COLORS[s % SCC_COLORS.length] : '#6b7280') : onStack ? '#e8ff00' : '#343434';
              const isCur = cur && ((cur.k === 'visit' && cur.v === n.id) || (cur.k === 'low' && cur.v === n.id));
              return (
                <g key={n.id}>
                  <circle cx={n.x} cy={n.y} r={20} fill={s !== undefined && st.sccs[s].length > 1 ? `${stroke}22` : '#0e0e0d'}
                    stroke={stroke} strokeWidth={isCur ? 3.5 : 2} />
                  <text x={n.x} y={n.y + 4} fontSize={10} textAnchor="middle" fill="#f0f0ec" fontFamily="monospace">
                    {st.index.has(n.id) ? `${st.index.get(n.id)}/${st.low.get(n.id)}` : '·'}
                  </text>
                  <text x={n.x} y={n.y + 34} fontSize={10} textAnchor="middle" fill="#d4d4d0" fontFamily="monospace">{n.id}</text>
                </g>
              );
            })}
          </svg>
          <div className="rounded-panel bg-[#050505] border border-line p-2 font-mono text-xs flex flex-col gap-1 min-h-0">
            <div className="text-fg-subtle">stack (top ↑)</div>
            <div className="flex flex-col-reverse gap-1 flex-1 justify-end">
              {st.stack.map(s => <div key={s} className="px-1.5 py-0.5 rounded border border-[#e8ff00]/40 text-[#e8ff00] truncate">{s}</div>)}
            </div>
            <div className="text-fg-subtle pt-1 border-t border-line">SCCs found</div>
            {st.sccs.map((c, i) => (
              <div key={i} className="truncate" style={{ color: c.length > 1 ? SCC_COLORS[i % SCC_COLORS.length] : '#6b7280' }}>
                {c.length > 1 ? '⟳ ' : ''}{c.map(short).join(', ')}
              </div>
            ))}
          </div>
        </div>
      );
    },
    explain: f => {
      const st = tarjanState(f);
      return (
        <>
          <div className="rounded-panel bg-[#e8ff00]/10 border border-[#e8ff00]/30 p-2.5 text-sm text-fg-soft">{describe(st.current)}</div>
          <P>A strongly connected component (SCC) is a set of modules that can all reach each other. Any SCC with more than one module is a circular import.</P>
          <P>Tarjan does one depth-first search. Each module gets an <b className="text-fg-soft">index</b> (visit order) and a <b className="text-fg-soft">lowlink</b> (the oldest stacked module it can reach), drawn as <C>index/lowlink</C>. A dashed red edge goes back to a module still on the stack. When a module&apos;s lowlink equals its index, everything above it on the stack is one SCC.</P>
          <P>Archon calls <C>nx.simple_cycles</C> on the internal modules (Johnson&apos;s algorithm). It starts from these SCCs and then lists each elementary cycle inside them, e.g. <C>invoice → tax → invoice</C> and <C>invoice → tax → ledger → invoice</C>. The demo codebase has no cycles, so this graph is illustrative.</P>
        </>
      );
    },
  },
  {
    id: 'layers', title: 'Layers', sub: 'module → layer', frames: 5, files: ['conformance/studio/service.py · run_audit step 4', 'conformance/kev_classifier.py'],
    draw: f => {
      const order: Layer[] = ['Presentation', 'Application', 'Domain', 'Infrastructure'];
      const shown = new Set(order.slice(0, f));
      return (
        <ModuleGraph shownEdges={EDGES.length} edgeColor={() => '#2b2b2a'}
          nodeColor={id => (shown.has(POS.get(id)!.layer) && (id !== 'main' || f >= 5) ? LAYER[POS.get(id)!.layer] : '#5a5a58')}
          badge={id => (id === 'main' && f < 5 ? '?' : null)} />
      );
    },
    explain: f => (
      <>
        <P>Rules speak in layers, so each internal module needs one. The cascade:</P>
        <ol className="text-sm text-fg-muted leading-relaxed list-decimal pl-5 space-y-1">
          <li className={f >= 1 ? 'text-fg-soft' : ''}>Blueprint glob patterns from the ruleset JSON (e.g. <C>*.domain.*</C>).</li>
          <li className={f >= 2 ? 'text-fg-soft' : ''}>A layer-named package: <C>domain/</C>, <C>presentation/</C>, …</li>
          <li className={f >= 5 ? 'text-fg-soft' : ''}>Anything left (here <C>main</C>) goes to the classifier: keyword rules, or Kev-9B on the GPU (precise reads source, efficient reads signatures), with Groq as fallback. Keyword rules say Application; Kev says Presentation.</li>
        </ol>
        <P>The graph itself never comes from an LLM. The classifier only names layers.</P>
      </>
    ),
  },
  {
    id: 'rules', title: 'Rules', sub: 'edge vs blueprint', frames: EDGES.length + 1, files: ['conformance/checker.py · check_architecture'],
    draw: f => (
      <ModuleGraph shownEdges={EDGES.length} highlight={f - 1}
        edgeColor={i => (i >= f ? '#2b2b2a' : verdict(EDGES[i]) === 'violation' ? BAD : OK)}
        nodeColor={id => LAYER[POS.get(id)!.layer]} />
    ),
    explain: f => {
      const checked = EDGES.slice(0, f);
      const bad = checked.filter(e => verdict(e) === 'violation').length;
      const cur = f > 0 ? EDGES[f - 1] : null;
      return (
        <>
          {cur && (
            <div className={`rounded-panel p-2.5 text-sm border ${verdict(cur) === 'violation' ? 'bg-[#ff3b30]/10 border-[#ff3b30]/30 text-[#fca5a5]' : 'bg-[#10b981]/10 border-[#10b981]/30 text-[#6ee7b7]'}`}>
              <C>{cur[0]}</C> → <C>{cur[1]}</C>: {POS.get(cur[0])!.layer} → {POS.get(cur[1])!.layer}, <b>{verdict(cur)}</b>
            </div>
          )}
          <P>Each internal edge is checked against the blueprint&apos;s allow rules. Same layer is always fine. Otherwise the pair must be listed:</P>
          <div className="flex flex-wrap gap-1.5">
            {ALLOWED.map(([a, b]) => <span key={a + b} className="px-1.5 py-0.5 rounded-control bg-raised border border-line text-xs font-mono text-fg-soft">{a} → {b}</span>)}
          </div>
          <P>Anything else is a violation, with its line and source kept from the AST. Checked {checked.length} / {EDGES.length}, violations {bad}.</P>
        </>
      );
    },
  },
  {
    id: 'score', title: 'Score', sub: 'health %', frames: 4, files: ['conformance/checker.py · score'],
    draw: f => {
      const bad = EDGES.filter(e => verdict(e) === 'violation').length;
      const target = 100 - (bad / EDGES.length) * 100;
      const val = f >= 3 ? target : f === 2 ? 100 - (bad / EDGES.length) * 50 : 100;
      const arc = (val / 100) * 2 * Math.PI * 70;
      return (
        <div className="h-full flex flex-col md:flex-row items-center justify-center gap-8 font-mono">
          <svg viewBox="-90 -90 180 180" className="w-52 h-52">
            <circle r={70} fill="none" stroke="#1f1f1e" strokeWidth={10} />
            <circle r={70} fill="none" stroke={val >= 90 ? '#e8ff00' : val >= 70 ? '#f5a524' : BAD} strokeWidth={10}
              strokeDasharray={`${arc} 999`} transform="rotate(-90)" style={{ transition: 'stroke-dasharray .6s ease' }} />
            <text y={8} textAnchor="middle" fontSize={26} fill="#f0f0ec" fontWeight="bold">{val.toFixed(1)}%</text>
          </svg>
          <div className="text-sm space-y-2 text-fg-soft">
            <div className={f >= 1 ? '' : 'opacity-30'}>internal edges checked: <b>{EDGES.length}</b></div>
            <div className={f >= 1 ? '' : 'opacity-30'}>violations: <b className="text-[#ff8a80]">{bad}</b></div>
            <div className={f >= 2 ? '' : 'opacity-30'}>100 − {bad} / {EDGES.length} × 100</div>
            <div className={f >= 3 ? 'text-lg' : 'opacity-30 text-lg'}>= <b>{target.toFixed(1)}%</b></div>
          </div>
        </div>
      );
    },
    explain: () => (
      <>
        <P>The health score is the share of checked internal edges that obey the blueprint: <C>100 − violations / edges_checked × 100</C>, floored at 0. The demo: 6 of 15 edges break a rule, so 60.0%.</P>
        <P>Cycles from the Tarjan stage are reported next to it but do not change this number. Conformance Studio shows the score, the violations (each with its blueprint-vs-actual view and AI review) and the cycles.</P>
      </>
    ),
  },
];

export function ConformanceEngineTab() {
  const [stageIdx, setStageIdx] = useState(0);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const stage = STAGES[stageIdx];
  const last = stage.frames - 1;

  // Autoplay: step frames, then hold and move on to the next stage
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (frame < last) setFrame(frame + 1);
      else if (stageIdx < STAGES.length - 1) { setStageIdx(stageIdx + 1); setFrame(0); }
      else setPlaying(false);
    }, (frame < last ? (stage.id === 'tarjan' ? 900 : 700) : 2200) / speed);
    return () => clearTimeout(t);
  }, [playing, frame, last, stageIdx, speed, stage.id]);

  const go = (i: number) => { setStageIdx(i); setFrame(0); };
  const drawn = useMemo(() => stage.draw(frame), [stage, frame]);

  return (
    <div className="space-y-4 animate-fade-in pb-8">
      {/* Title + pipeline strip */}
      <div className="rounded-panel bg-surface border border-line-strong p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-fg-strong">How a conformance audit works</h1>
            <p className="text-xs font-mono text-fg-subtle">test_codebases/ecommerce_platform · Clean Architecture blueprint · graphs from the AST, never from an LLM</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <button onClick={() => setFrame(Math.max(0, frame - 1))} className="px-2 py-1 rounded-control bg-raised border border-line text-fg-soft hover:text-fg-strong cursor-pointer" aria-label="Step back">◀</button>
            <button onClick={() => setPlaying(p => !p)} className="px-3 py-1 rounded-control bg-info-strong text-white font-semibold cursor-pointer min-w-16">{playing ? '❚❚ Pause' : '▶ Play'}</button>
            <button onClick={() => setFrame(Math.min(last, frame + 1))} className="px-2 py-1 rounded-control bg-raised border border-line text-fg-soft hover:text-fg-strong cursor-pointer" aria-label="Step forward">▶</button>
            <button onClick={() => { go(0); setPlaying(true); }} className="px-2 py-1 rounded-control bg-raised border border-line text-fg-soft hover:text-fg-strong cursor-pointer">Restart</button>
            <select value={speed} onChange={e => setSpeed(Number(e.target.value))} className="bg-raised border border-line rounded-control px-1.5 py-1 text-fg-soft" aria-label="Speed">
              {[0.5, 1, 2].map(s => <option key={s} value={s}>{s}×</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
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

      {/* Stage: drawing + explanation side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <div className="rounded-panel bg-surface border border-line-strong p-3 h-[22rem] md:h-[26rem]">{drawn}</div>
        <div className="rounded-panel bg-surface border border-line-strong p-4 space-y-3 lg:h-[26rem] lg:overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-fg-strong">{stageIdx + 1}. {stage.title}: {stage.sub}</h2>
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
