"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ConformanceEdge, ConformanceNode } from './types';

// "Allowed by blueprint" vs "Actual code" for one flagged import, drawn as ArcGen-style layer
// swimlanes. The allowed route comes from the blueprint's allow rules; the actual route is the
// AST edge. Arrows are an SVG overlay measured from the cards.

const LANE_ORDER = ['Presentation', 'Application', 'Domain', 'Infrastructure'];
const RED = '#ff3b30';
const GREEN = '#10b981';

interface Card { key: string; layer: string; title: string; note: string; tone: 'violation' | 'normal' | 'proposed' }
interface Arrow { from: string; to: string; color: string; label: string; dashed?: boolean; side?: 'left' | 'right' }
interface Plan { kind: 'path' | 'inversion' | 'none'; cards: Card[]; arrows: Arrow[]; caption: string }

function laneOrder(blueprintLayers: string[], extra: string[]): string[] {
  const all = [...new Set([...blueprintLayers, ...extra])];
  return all.sort((a, b) => (LANE_ORDER.indexOf(a) + 1 || 99) - (LANE_ORDER.indexOf(b) + 1 || 99));
}

// Shortest allowed layer path, BFS over the allow rules
function route(allowed: [string, string][], from: string, to: string): string[] | null {
  const prev = new Map<string, string>([[from, '']]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) {
      const path = [to];
      while (prev.get(path[0])) path.unshift(prev.get(path[0])!);
      return path;
    }
    allowed.filter(([s]) => s === cur).forEach(([, t]) => {
      if (!prev.has(t)) { prev.set(t, cur); queue.push(t); }
    });
  }
  return null;
}

const pascal = (s: string) => s.split(/[_\-.]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');

function planAllowed(edge: ConformanceEdge, nodes: ConformanceNode[], edges: ConformanceEdge[],
                     layers: string[], allowed: [string, string][]): Plan {
  const src = edge.source, tgt = edge.target, sl = edge.sourceLayer, tl = edge.targetLayer;
  const imports = (a: string, b: string) => edges.some(e => e.source === a && e.target === b);
  const srcCard: Card = { key: 'b:src', layer: sl, title: src, note: 'same module', tone: 'normal' };
  const tgtCard: Card = { key: 'b:tgt', layer: tl, title: tgt, note: 'same module', tone: 'normal' };

  // 1. A permitted route through other layers: name real modules on it where the code has them
  const path = route(allowed, sl, tl);
  if (path && path.length > 2) {
    const cards = [srcCard];
    const arrows: Arrow[] = [];
    let prevKey = srcCard.key;
    let prevMod = src;
    path.slice(1, -1).forEach((layer, i) => {
      const existing = nodes.find(n => n.layer === layer && imports(prevMod, n.id) && imports(n.id, tgt))
        || nodes.find(n => n.layer === layer && imports(prevMod, n.id));
      const key = `b:via${i}`;
      cards.push(existing
        ? { key, layer, title: existing.id, note: `existing ${layer.toLowerCase()} module: route the call through it`, tone: 'proposed' }
        : { key, layer, title: `new ${layer.toLowerCase()} service`, note: `wraps ${tgt.split('.').pop()}`, tone: 'proposed' });
      arrows.push({ from: prevKey, to: key, color: GREEN, label: 'calls' });
      prevKey = key;
      prevMod = existing?.id || '';
    });
    cards.push(tgtCard);
    arrows.push({ from: prevKey, to: tgtCard.key, color: GREEN, label: 'calls' });
    return { kind: 'path', cards, arrows, caption: `Allowed route: ${path.join(' → ')}` };
  }

  // 2. Dependency inversion: both sides depend on a port in a layer each may import
  const shared = layers
    .map(x => ({ x, a: route(allowed, sl, x), b: route(allowed, tl, x) }))
    .filter(c => c.x !== tl && c.a && c.b)   // x === sl: the port lives beside the source (classic DIP)
    .sort((p, q) => (p.a!.length + p.b!.length) - (q.a!.length + q.b!.length)
      || (LANE_ORDER.indexOf(p.x) - LANE_ORDER.indexOf(q.x)));
  if (shared.length) {
    const x = shared[0].x;
    const owner = nodes.find(n => n.layer === x && imports(src, n.id));
    const port: Card = {
      key: 'b:port', layer: x, title: `«port» ${pascal(tgt.split('.').pop() || 'Target')}Port`,
      note: owner ? `interface next to ${owner.id}` : `interface in the ${x} layer`, tone: 'proposed',
    };
    return {
      kind: 'inversion',
      cards: [srcCard, port, tgtCard],
      arrows: [
        { from: srcCard.key, to: port.key, color: GREEN, label: 'calls the port' },
        { from: tgtCard.key, to: port.key, color: GREEN, label: 'implements', dashed: true, side: 'right' },
      ],
      caption: `No ${sl} → ${tl} route exists: invert it. ${sl} depends on a ${x} port; ${tl} implements it.`,
    };
  }

  // 3. Nothing permitted links the two layers
  return {
    kind: 'none', cards: [srcCard, tgtCard], arrows: [],
    caption: `The blueprint allows no route between ${sl} and ${tl}. Move this code into a layer that may use ${tl}.`,
  };
}

function planActual(edge: ConformanceEdge, lanes: string[]): { cards: Card[]; arrows: Arrow[]; bypassed: string[] } {
  const i = lanes.indexOf(edge.sourceLayer), j = lanes.indexOf(edge.targetLayer);
  const bypassed = i >= 0 && j >= 0 ? lanes.slice(Math.min(i, j) + 1, Math.max(i, j)) : [];
  const line = edge.lineNumber ? ` (line ${edge.lineNumber})` : '';
  return {
    cards: [
      { key: 'a:src', layer: edge.sourceLayer, title: edge.source, note: 'flagged module', tone: 'violation' },
      { key: 'a:tgt', layer: edge.targetLayer, title: edge.target, note: edge.codeSnippet || 'imported directly', tone: 'normal' },
    ],
    arrows: [{ from: 'a:src', to: 'a:tgt', color: RED, label: `✗ imports${line}`, side: 'left' }],
    bypassed,
  };
}

function Lane({ name, cards, bypassed, register, colorOf }: {
  name: string; cards: Card[]; bypassed?: boolean;
  register: (key: string) => (el: HTMLDivElement | null) => void; colorOf: (layer: string) => string;
}) {
  return (
    <div className={`rounded-panel p-2.5 border ${bypassed ? 'border-dashed border-[#ff3b30]/40 bg-[#ff3b30]/5' : 'border-line-strong bg-surface/70'}`}>
      <div className="flex items-center justify-between mb-1.5 border-b border-line-strong/50 pb-1">
        <span className="text-xs font-mono font-bold uppercase tracking-wider" style={{ color: colorOf(name) }}>{name} Layer</span>
        {bypassed && <span className="text-xs font-mono text-[#ff8a80]">bypassed</span>}
      </div>
      {cards.length ? (
        <div className="flex flex-col gap-1.5">
          {cards.map(c => (
            <div key={c.key} ref={register(c.key)}
              className={`px-2.5 py-1.5 rounded-panel border text-xs font-mono ${
                c.tone === 'violation' ? 'bg-[#3b0d0b] border-[#ff3b30] text-white'
                  : c.tone === 'proposed' ? 'bg-[#10b981]/10 border-dashed border-[#10b981]/60 text-fg-strong'
                    : 'bg-raised border-line-strong text-fg-strong'}`}>
              <div className="font-bold truncate" title={c.title}>{c.title}</div>
              <div className="text-fg-muted truncate" title={c.note}>{c.note}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs font-mono text-fg-subtle py-1">{bypassed ? 'skipped by the import' : '·'}</div>
      )}
    </div>
  );
}

function Column({ title, tone, lanes, cards, arrows, bypassed, caption, colorOf }: {
  title: string; tone: string; lanes: string[]; cards: Card[]; arrows: Arrow[]; bypassed: string[];
  caption: string; colorOf: (layer: string) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLDivElement>());
  const [paths, setPaths] = useState<{ d: string; color: string; label: string; lx: number; ly: number; dashed?: boolean; vertical?: boolean }[]>([]);
  const register = (key: string) => (el: HTMLDivElement | null) => { if (el) els.current.set(key, el); else els.current.delete(key); };

  useLayoutEffect(() => {
    const measure = () => {
      const root = box.current?.getBoundingClientRect();
      if (!root) return;
      setPaths(arrows.flatMap(a => {
        const f = els.current.get(a.from)?.getBoundingClientRect();
        const t = els.current.get(a.to)?.getBoundingClientRect();
        if (!f || !t) return [];
        const down = t.top > f.top;
        if (a.side) {
          // along a gutter, so cards and skipped lanes in between stay visible
          const right = a.side === 'right';
          const x = right ? Math.max(f.right, t.right) - root.left + 14 : Math.min(f.left, t.left) - root.left - 14;
          const y1 = f.top - root.top + f.height / 2, y2 = t.top - root.top + t.height / 2;
          const x1 = (right ? f.right : f.left) - root.left, x2 = (right ? t.right : t.left) - root.left;
          return [{ d: `M ${x1} ${y1} H ${x} V ${y2} H ${x2 + (right ? 2 : -2)}`, color: a.color, label: a.label,
                    lx: right ? x + 7 : x - 7, ly: (y1 + y2) / 2, dashed: a.dashed, vertical: true }];
        }
        const x1 = f.left - root.left + f.width / 2, x2 = t.left - root.left + t.width / 2;
        const y1 = (down ? f.bottom : f.top) - root.top, y2 = (down ? t.top : t.bottom) - root.top;
        const my = (y1 + y2) / 2;
        return [{ d: `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2 + (down ? -2 : 2)}`, color: a.color, label: a.label,
                  lx: (x1 + x2) / 2 + 6, ly: my, dashed: a.dashed }];
      }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [arrows, cards]);

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="text-xs font-mono font-bold tracking-wider" style={{ color: tone }}>{title}</div>
      <div ref={box} className="relative flex flex-col gap-2 px-5">
        {lanes.map(l => (
          <Lane key={l} name={l} cards={cards.filter(c => c.layer === l)} bypassed={bypassed.includes(l)} register={register} colorOf={colorOf} />
        ))}
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
          {paths.map((p, i) => (
            <g key={i}>
              <defs>
                <marker id={`ah-${title.length}-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={p.color} />
                </marker>
              </defs>
              <path d={p.d} fill="none" stroke={p.color} strokeWidth={2} strokeDasharray={p.dashed ? '5 4' : undefined}
                markerEnd={`url(#ah-${title.length}-${i})`} />
              {/* side arrows run along the gutter, so their label runs along it too */}
              <text x={p.lx} y={p.ly} fill={p.color} fontSize="10" fontFamily="monospace" dominantBaseline="middle"
                textAnchor={p.vertical ? 'middle' : 'start'} transform={p.vertical ? `rotate(-90 ${p.lx} ${p.ly})` : undefined}
                paintOrder="stroke" stroke="#0e0e0d" strokeWidth={3}>{p.label}</text>
            </g>
          ))}
        </svg>
      </div>
      <p className="text-xs font-mono text-fg-muted leading-relaxed">{caption}</p>
    </div>
  );
}

export const BlueprintVsActual: React.FC<{
  edge: ConformanceEdge; nodes: ConformanceNode[]; edges: ConformanceEdge[];
  blueprintLayers?: string[]; allowed?: [string, string][];
}> = ({ edge, nodes, edges, blueprintLayers, allowed }) => {
  const lanes = useMemo(
    () => laneOrder(blueprintLayers?.length ? blueprintLayers : LANE_ORDER, [edge.sourceLayer, edge.targetLayer]),
    [blueprintLayers, edge.sourceLayer, edge.targetLayer]
  );
  const plan = useMemo(
    () => planAllowed(edge, nodes, edges, lanes, allowed || []),
    [edge, nodes, edges, lanes, allowed]
  );
  const actual = useMemo(() => planActual(edge, lanes), [edge, lanes]);
  const colorOf = (layer: string) => nodes.find(n => n.layer === layer)?.color || '#8b8b86';

  if (!allowed) {
    return <div className="text-xs font-mono text-fg-subtle">Re-run the audit to see the blueprint route (older result without rules).</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-4">
      <Column title="ALLOWED BY BLUEPRINT" tone={GREEN} lanes={lanes} cards={plan.cards} arrows={plan.arrows} bypassed={[]}
        caption={plan.caption} colorOf={colorOf} />
      <Column title="ACTUAL CODE" tone={RED} lanes={lanes} cards={actual.cards} arrows={actual.arrows} bypassed={actual.bypassed}
        caption={actual.bypassed.length
          ? `${edge.source} reaches ${edge.targetLayer} directly, skipping ${actual.bypassed.join(', ')}.`
          : `${edge.source} imports ${edge.target}, which no ${edge.sourceLayer} → ${edge.targetLayer} rule allows.`}
        colorOf={colorOf} />
    </div>
  );
};
