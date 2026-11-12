'use client';

/* Interactive architecture graph: laid out by mermaid (so it reads like a proper flowchart, with
 * arrows and layer groups), then made interactive on the rendered SVG:
 *   hover a component  → card with its role, connections and traced requirements; its links light up
 *   hover a connection → card with protocol, payload and why it exists
 *   click a component  → opens the inspector (owned by the parent viewer)
 * Node/edge DOM ids come from our own short ids (n0, n1, …), so matching never depends on names. */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ArchEdge, ArchNode } from './ArchitectureDiagramViewer';

interface Props {
  nodes: ArchNode[];
  edges: ArchEdge[];
  added?: string[];      // component names new in this draft (highlighted)
  removed?: string[];    // component names dropped in this draft (listed)
  changesLabel?: string;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  zoom: number;
  pan: { x: number; y: number };
}

/** Pointer position relative to the viewport, plus the viewport size (to keep the card inside). */
type Pos = { x: number; y: number; w: number; h: number };
type Hover = ({ kind: 'node'; id: string } | { kind: 'edge'; index: number }) & Pos;

const LAYER_ORDER = ['Presentation', 'Application', 'Domain', 'Infrastructure'];

function layerOf(n: ArchNode): string {
  if (n.layer) return n.layer;
  const t = (n.node_type || '').toLowerCase();
  if (t === 'gateway') return 'Presentation';
  if (t === 'datastore' || t === 'queue' || t === 'cache') return 'Infrastructure';
  return 'Application';
}

/** Node type → visual class (fill/stroke picked from the app palette). */
function kindOf(type: string): 'gateway' | 'store' | 'messaging' | 'module' | 'service' {
  const t = (type || '').toLowerCase();
  if (t === 'gateway') return 'gateway';
  if (t === 'datastore' || t === 'database') return 'store';
  if (t === 'queue' || t === 'cache' || t === 'broker') return 'messaging';
  if (t === 'module' || t === 'usecase') return 'module';
  return 'service';
}

const KIND_STYLE = {
  gateway: { fill: '#0b2536', stroke: '#38bdf8', label: 'Gateway / entry point' },
  service: { fill: '#151a30', stroke: '#818cf8', label: 'Service' },
  module: { fill: '#1d1733', stroke: '#a78bfa', label: 'Module' },
  store: { fill: '#2a1f0b', stroke: '#f59e0b', label: 'Data store' },
  messaging: { fill: '#0b261f', stroke: '#10b981', label: 'Queue / cache' },
} as const;

const clean = (s: string) => (s || '').replace(/["`|<>{}[\]]/g, '').replace(/\s+/g, ' ').trim();

function buildMermaid(nodes: ArchNode[], edges: ArchEdge[], addedNames: Set<string>) {
  const key = new Map<string, string>();      // node_id -> n0
  nodes.forEach((n, i) => key.set(n.node_id, `n${i}`));
  const lines = ['flowchart TB'];

  const byLayer = new Map<string, ArchNode[]>();
  nodes.forEach(n => {
    const l = layerOf(n);
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(n);
  });
  const layers = [...byLayer.keys()].sort((a, b) => {
    const ia = LAYER_ORDER.indexOf(a), ib = LAYER_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  layers.forEach((layer, li) => {
    lines.push(`  subgraph L${li}["${clean(layer)}"]`);
    lines.push('    direction LR');
    byLayer.get(layer)!.forEach(n => {
      const k = key.get(n.node_id)!;
      const label = `<b>${clean(n.name)}</b><br/><span style='font-size:11px;opacity:.65'>${clean(n.node_type || 'component')}</span>`;
      const kind = kindOf(n.node_type);
      const shape = kind === 'store' ? `[("${label}")]` : kind === 'messaging' ? `[["${label}"]]` : kind === 'gateway' ? `(["${label}"])` : `["${label}"]`;
      lines.push(`    ${k}${shape}`);
    });
    lines.push('  end');
  });

  // Edge DOM ids look like L_<from>_<to>_<counter>. The counter is not consecutive for repeated
  // pairs (0, 2, …), so edges are matched per pair in counter order, not by computing the id.
  const edgesByPair = new Map<string, number[]>();
  edges.forEach((e, i) => {
    const s = key.get(e.source), t = key.get(e.target);
    if (!s || !t) return;
    const pair = `${s}_${t}`;
    edgesByPair.set(pair, [...(edgesByPair.get(pair) ?? []), i]);
    const text = clean(e.protocol || '');
    const arrow = (e.edge_type || '').includes('async') ? '-.->' : '-->';
    lines.push(`  ${s} ${arrow}${text ? `|"${text}"|` : ''} ${t}`);
  });

  (Object.keys(KIND_STYLE) as (keyof typeof KIND_STYLE)[]).forEach(k => {
    lines.push(`  classDef ${k} fill:${KIND_STYLE[k].fill},stroke:${KIND_STYLE[k].stroke},stroke-width:1.5px,color:#f8fafc`);
  });
  lines.push('  classDef added stroke:#34d399,stroke-width:3px,stroke-dasharray:6 3');
  nodes.forEach(n => {
    const k = key.get(n.node_id)!;
    lines.push(`  class ${k} ${kindOf(n.node_type)}`);
    if (addedNames.has(n.name.trim().toLowerCase())) lines.push(`  class ${k} added`);
  });
  lines.push('  classDef layer fill:#0c0e12,stroke:#1e293b,color:#7d8799');
  layers.forEach((_, li) => lines.push(`  class L${li} layer`));

  const nodeIdByKey = new Map([...key.entries()].map(([id, k]) => [k, id]));
  return { source: lines.join('\n'), nodeIdByKey, edgesByPair };
}

/** Card position next to the pointer, flipped to stay inside the viewport. */
function cardPos(p: Pos) {
  return {
    left: p.x + 300 > p.w ? Math.max(8, p.x - 312) : p.x + 14,
    top: Math.min(p.y + 14, Math.max(8, p.h - 200)),
  };
}

const NONE: string[] = []; // stable default: a fresh [] per render would rebuild and re-render the graph

export function ArchitectureGraph({ nodes, edges, added = NONE, removed = NONE, changesLabel, selectedNodeId, onSelectNode, zoom, pan }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  // Render result tagged with the source it came from, so a stale layout is never shown
  const [rendered, setRendered] = useState<{ source: string; svg?: string; error?: string }>({ source: '' });
  // What is hovered, and where the pointer entered. Moving within the same element does not touch
  // React state: the card follows the pointer through cardRef, so hover never re-renders the graph.
  const [hover, setHover] = useState<Hover | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const addedKey = added.map(n => n.trim().toLowerCase()).join('\n');
  const graph = useMemo(() => buildMermaid(nodes, edges, new Set(addedKey ? addedKey.split('\n') : [])), [nodes, edges, addedKey]);
  const graphRef = useRef(graph);
  useEffect(() => { graphRef.current = graph; }, [graph]);
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.node_id, n])), [nodes]);
  const current = rendered.source === graph.source;
  const svg = current ? rendered.svg ?? '' : '';
  const error = current ? rendered.error ?? '' : '';

  // Lay out with mermaid, once per distinct graph source
  const source = graph.source;
  useEffect(() => {
    if (!nodes.length) return;
    let cancelled = false;
    import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          flowchart: { htmlLabels: true, curve: 'basis', nodeSpacing: 28, rankSpacing: 48, padding: 10 },
          themeVariables: {
            darkMode: true,
            background: '#08090a',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
            fontSize: '13px',
            primaryColor: '#151a30',
            primaryTextColor: '#f8fafc',
            primaryBorderColor: '#818cf8',
            lineColor: '#64748b',
            clusterBkg: '#0c0e12',
            clusterBorder: '#1e293b',
            titleColor: '#7d8799',
            edgeLabelBackground: '#0c0e12',
          },
        });
        return mermaid.render(`archgraph-${Math.random().toString(36).slice(2, 9)}`, source);
      })
      .then(({ svg }) => { if (!cancelled) setRendered({ source, svg }); })
      .catch(err => { if (!cancelled) setRendered({ source, error: String(err?.message || err) }); });
    return () => { cancelled = true; };
  }, [source, nodes.length]);

  // Latest callbacks for the DOM listeners bound below
  const onSelectNodeRef = useRef(onSelectNode);
  const selectedRef = useRef(selectedNodeId);
  useEffect(() => { onSelectNodeRef.current = onSelectNode; selectedRef.current = selectedNodeId; }, [onSelectNode, selectedNodeId]);

  // Element lookups on the rendered SVG, rebuilt per render
  const els = useRef<{ nodes: Map<string, Element>; edges: Map<number, Element[]> }>({ nodes: new Map(), edges: new Map() });

  useEffect(() => {
    const host = svgHostRef.current;
    if (!host || !svg) return;
    host.innerHTML = svg;
    const graph = graphRef.current;
    // Fit the panel width, but never below 75% so labels stay readable (zoom/drag for the rest).
    // Mermaid's own width="100%" shrinks a wide graph without limit.
    const svgEl = host.querySelector('svg');
    const vb = svgEl?.viewBox?.baseVal;
    if (svgEl && vb && vb.width) {
      const avail = (wrapRef.current?.clientWidth ?? vb.width) - 48;
      const scale = Math.min(1, Math.max(0.75, avail / vb.width));
      svgEl.removeAttribute('width');
      svgEl.style.width = `${vb.width * scale}px`;
      svgEl.style.height = `${vb.height * scale}px`;
    }
    const nodeMap = new Map<string, Element>();
    const edgeMap = new Map<number, Element[]>();
    const rel = (ev: MouseEvent) => {
      const r = wrapRef.current!.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
    };
    const follow = (ev: Event) => {
      const card = cardRef.current;
      if (!card) return;
      const p = rel(ev as MouseEvent);
      const { left, top } = cardPos(p);
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    };

    host.querySelectorAll('g.node').forEach(g => {
      const dataId = g.getAttribute('data-id');
      const k = dataId && /^n\d+$/.test(dataId) ? dataId : g.id.match(/flowchart-(n\d+)-\d+$/)?.[1];
      const id = k ? graph.nodeIdByKey.get(k) : undefined;
      if (!id) return;
      nodeMap.set(id, g);
      (g as HTMLElement).style.cursor = 'pointer';
      g.addEventListener('mouseenter', ev => setHover({ kind: 'node', id, ...rel(ev as MouseEvent) }));
      g.addEventListener('mousemove', follow);
      g.addEventListener('mouseleave', () => setHover(h => (h && h.kind === 'node' && h.id === id ? null : h)));
      g.addEventListener('click', ev => {
        const e = ev as MouseEvent;
        const d = downAt.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return; // that was a drag
        onSelectNodeRef.current(selectedRef.current === id ? null : id);
      });
    });

    const bindEdge = (el: Element, index: number) => {
      el.addEventListener('mouseenter', ev => setHover({ kind: 'edge', index, ...rel(ev as MouseEvent) }));
      el.addEventListener('mousemove', follow);
      el.addEventListener('mouseleave', () => setHover(h => (h && h.kind === 'edge' && h.index === index ? null : h)));
    };
    const edgeKey = (el: Element) => (el.getAttribute('data-id') || el.id || '').match(/L_(n\d+_n\d+)_(\d+)$/);
    // DOM edge id -> our edge index: per node pair, k-th lowest counter = k-th edge defined for that pair
    const counters = new Map<string, Set<number>>();
    host.querySelectorAll('path[data-edge="true"], path.flowchart-link').forEach(path => {
      const m = edgeKey(path);
      if (m) counters.set(m[1], (counters.get(m[1]) ?? new Set()).add(Number(m[2])));
    });
    const indexById = new Map<string, number>();
    counters.forEach((set, pair) => {
      const defined = graph.edgesByPair.get(pair) ?? [];
      [...set].sort((a, b) => a - b).forEach((c, k) => { if (k < defined.length) indexById.set(`${pair}_${c}`, defined[k]); });
    });
    const edgeIndex = (el: Element) => {
      const m = edgeKey(el);
      return m ? indexById.get(`${m[1]}_${m[2]}`) : undefined;
    };
    host.querySelectorAll('path[data-edge="true"], path.flowchart-link').forEach(path => {
      const index = edgeIndex(path);
      if (index === undefined) return;
      // Wide invisible twin so a 1.5px line is easy to hover
      const hit = path.cloneNode(false) as SVGPathElement;
      hit.removeAttribute('id');
      hit.removeAttribute('marker-end');
      hit.removeAttribute('marker-start');
      hit.removeAttribute('style');
      hit.setAttribute('class', 'arch-hit');
      path.parentNode?.insertBefore(hit, path.nextSibling);
      bindEdge(hit, index);
      edgeMap.set(index, [...(edgeMap.get(index) ?? []), path]);
    });
    host.querySelectorAll('g.edgeLabel').forEach(g => {
      const label = g.querySelector('[data-id]') ?? g;
      const index = edgeIndex(label);
      if (index === undefined) return;
      bindEdge(g, index);
      edgeMap.set(index, [...(edgeMap.get(index) ?? []), g]);
    });
    els.current = { nodes: nodeMap, edges: edgeMap };
  }, [svg]);

  // Spotlight: the hovered/selected component and its links stay bright, the rest fades.
  // Keyed on *what* is focused, not the pointer position.
  const focusKey = hover ? (hover.kind === 'node' ? `n:${hover.id}` : `e:${hover.index}`) : '';
  useEffect(() => {
    const host = svgHostRef.current;
    if (!host) return;
    const { nodes: nodeMap, edges: edgeMap } = els.current;
    host.querySelectorAll('.is-on').forEach(el => el.classList.remove('is-on'));
    const focusNode = focusKey.startsWith('n:') ? focusKey.slice(2) : focusKey ? null : selectedNodeId;
    const focusEdge = focusKey.startsWith('e:') ? Number(focusKey.slice(2)) : null;
    const on = (el?: Element) => el?.classList.add('is-on');
    if (focusNode) {
      on(nodeMap.get(focusNode));
      edges.forEach((e, i) => {
        if (e.source !== focusNode && e.target !== focusNode) return;
        edgeMap.get(i)?.forEach(on);
        on(nodeMap.get(e.source));
        on(nodeMap.get(e.target));
      });
    } else if (focusEdge !== null) {
      const e = edges[focusEdge];
      edgeMap.get(focusEdge)?.forEach(on);
      on(nodeMap.get(e.source));
      on(nodeMap.get(e.target));
    }
    host.classList.toggle('has-focus', !!(focusNode || focusEdge !== null));
  }, [focusKey, selectedNodeId, edges, svg]);

  const degree = (id: string) => ({
    inbound: edges.filter(e => e.target === id).length,
    outbound: edges.filter(e => e.source === id).length,
  });

  // Hover card, kept inside the viewport
  let card: React.ReactNode = null;
  if (hover) {
    const { left, top } = cardPos(hover);
    let body: React.ReactNode = null;
    if (hover.kind === 'node') {
      const n = nodeById.get(hover.id);
      if (n) {
        const k = KIND_STYLE[kindOf(n.node_type)];
        const d = degree(n.node_id);
        body = (
          <>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: k.stroke }} />
              <span className="text-sm font-semibold text-fg-strong leading-tight">{n.name}</span>
            </div>
            <div className="text-xs text-fg-subtle mt-0.5">{n.node_type || 'component'} · {layerOf(n)} layer</div>
            {n.description && <p className="text-xs text-fg-soft mt-2 leading-relaxed line-clamp-3">{n.description}</p>}
            <div className="text-xs text-fg-muted mt-2">{d.inbound} incoming · {d.outbound} outgoing</div>
            {n.traced_requirements?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {n.traced_requirements.slice(0, 6).map(r => <span key={r} className="px-1.5 py-0.5 rounded-control bg-raised border border-line-strong text-[10px] font-mono text-fg-muted">{r}</span>)}
                {n.traced_requirements.length > 6 && <span className="text-[10px] text-fg-subtle">+{n.traced_requirements.length - 6}</span>}
              </div>
            )}
            <div className="text-[10px] text-fg-subtle mt-2">Click for full details</div>
          </>
        );
      }
    } else {
      const e = edges[hover.index];
      if (e) {
        body = (
          <>
            <div className="text-sm font-semibold text-fg-strong leading-tight">
              {nodeById.get(e.source)?.name ?? e.source} <span className="text-fg-subtle">→</span> {nodeById.get(e.target)?.name ?? e.target}
            </div>
            <div className="text-xs text-fg-subtle mt-0.5">{[e.protocol, (e.edge_type || '').replace(/_/g, ' ')].filter(Boolean).join(' · ')}</div>
            {e.payload_description && <p className="text-xs text-fg-soft mt-2"><span className="text-fg-subtle">Carries: </span>{e.payload_description}</p>}
            {e.justification && <p className="text-xs text-fg-soft mt-1.5 leading-relaxed line-clamp-4"><span className="text-fg-subtle">Why: </span>{e.justification}</p>}
            {e.traced_requirements?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {e.traced_requirements.slice(0, 6).map(r => <span key={r} className="px-1.5 py-0.5 rounded-control bg-raised border border-line-strong text-[10px] font-mono text-fg-muted">{r}</span>)}
              </div>
            )}
          </>
        );
      }
    }
    if (body) {
      card = (
        <div ref={cardRef} className="absolute z-30 w-72 pointer-events-none bg-surface/95 backdrop-blur border border-line-strong rounded-panel shadow-raised p-3" style={{ left, top }}>
          {body}
        </div>
      );
    }
  }

  return (
    <div ref={wrapRef} className="absolute inset-0" onMouseDownCapture={e => { downAt.current = { x: e.clientX, y: e.clientY }; }}>
      <style>{`
        .arch-svg svg { max-width: none !important; margin: 0 auto; display: block; }
        .arch-svg .arch-hit { fill: none; stroke: transparent; stroke-width: 14px; pointer-events: stroke; cursor: help; }
        .arch-svg g.node, .arch-svg path[data-edge], .arch-svg path.flowchart-link, .arch-svg g.edgeLabel { transition: opacity .15s ease; }
        .arch-svg g.node:hover rect, .arch-svg g.node:hover path, .arch-svg g.node:hover polygon { filter: brightness(1.35); }
        .arch-svg.has-focus g.node:not(.is-on) { opacity: .22; }
        .arch-svg.has-focus path[data-edge]:not(.is-on), .arch-svg.has-focus path.flowchart-link:not(.is-on), .arch-svg.has-focus g.edgeLabel:not(.is-on) { opacity: .1; }
        .arch-svg path.is-on { stroke: #38bdf8 !important; stroke-width: 2.5px !important; }
        .arch-svg g.edgeLabel.is-on { opacity: 1; }
      `}</style>

      <div className="absolute inset-0 overflow-visible origin-top-left" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <div ref={svgHostRef} className="arch-svg p-6 min-w-[640px]" />
      </div>

      {!svg && !error && <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">Laying out the diagram…</div>}
      {error && (
        <div className="absolute inset-x-6 top-6 p-3 rounded-panel border border-danger/40 bg-danger/10 text-xs text-danger-fg">
          Couldn&apos;t lay out the diagram: {error.slice(0, 200)}. The Mermaid and PlantUML tabs show the same graph.
        </div>
      )}

      {(added.length > 0 || removed.length > 0) && (
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 text-xs bg-surface/90 border border-line-strong rounded-panel px-3 py-1.5 max-w-[70%]">
          <span className="text-fg-subtle">Changes {changesLabel}:</span>
          {added.length > 0 && <span className="text-success-fg">{added.length} new (green dashed outline)</span>}
          {removed.map(n => <span key={n} className="px-1.5 py-0.5 rounded-control border border-dashed border-line-strong text-fg-subtle line-through" title="Removed in this draft">{n}</span>)}
        </div>
      )}

      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle bg-surface/90 border border-line-strong rounded-panel px-3 py-1.5">
        {(Object.keys(KIND_STYLE) as (keyof typeof KIND_STYLE)[]).filter(k => nodes.some(n => kindOf(n.node_type) === k)).map(k => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border" style={{ background: KIND_STYLE[k].fill, borderColor: KIND_STYLE[k].stroke }} />
            {KIND_STYLE[k].label}
          </span>
        ))}
        {edges.some(e => (e.edge_type || '').includes('async')) && <span>- - → async</span>}
        <span className="text-fg-subtle/80">Hover for details · click to inspect · drag to move</span>
      </div>

      {card}
    </div>
  );
}
