"use client";

import React, { useEffect, useMemo, useState } from 'react';
import type { ConformanceEdge, ConformanceNode } from './types';

// Inspector body for a flagged edge: a flow graph of the importing module's neighbourhood
// (from the audit's AST edges, never the LLM) and the LLM's review of the dependency.

interface Assessment {
  summary: string;
  hazard: string;
  advantages: string[];
  verdict: 'fix' | 'acceptable_deviation' | 'blueprint_gap';
  recommendation: string;
}

interface ViolationInsightProps {
  edge: ConformanceEdge;
  nodes: ConformanceNode[];
  edges: ConformanceEdge[];
  apiBase: string;
  targetPath: string;
  blueprintId?: string;
  offline: boolean;
}

const MAX_PER_SIDE = 8;
const LAYER_ORDER = ['Presentation', 'Application', 'Domain', 'Infrastructure'];
const VERDICT = {
  fix: { label: 'FIX: BLUEPRINT IS RIGHT', color: '#ff3b30' },
  acceptable_deviation: { label: 'ACCEPTABLE DEVIATION', color: '#f5a524' },
  blueprint_gap: { label: 'BLUEPRINT GAP', color: '#4f9dff' },
} as const;

// One review per edge per audit; the inspector unmounts on close, so the cache lives here
const reviewCache = new Map<string, Assessment>();

const shortName = (id: string) => id.split('.').slice(-2).join('.').replace(/["[\](){}<>]/g, '');

export function buildMermaid(edge: ConformanceEdge, nodes: ConformanceNode[], edges: ConformanceEdge[]): string {
  const focus = edge.source;
  const internal = new Set(nodes.filter(n => n.nodeType === 'internal').map(n => n.id));
  // Violations first, so the cap never hides one
  const pick = (list: ConformanceEdge[]) =>
    [...list].sort((a, b) => Number(b.isViolation) - Number(a.isViolation)).slice(0, MAX_PER_SIDE);
  const outgoing = pick(edges.filter(e => e.source === focus && internal.has(e.target)));
  const incoming = pick(edges.filter(e => e.target === focus && internal.has(e.source)));
  const shown = [...outgoing, ...incoming];
  if (!shown.some(e => e.id === edge.id)) shown.unshift(edge);

  const layerOf = new Map(nodes.map(n => [n.id, n.layer]));
  const colorOf = new Map(nodes.map(n => [n.id, n.color]));
  const ids = new Map<string, string>();
  [focus, ...shown.flatMap(e => [e.source, e.target])].forEach(m => {
    if (!ids.has(m)) ids.set(m, `n${ids.size}`);
  });

  const byLayer = new Map<string, string[]>();
  ids.forEach((_, m) => {
    const layer = layerOf.get(m) || (m === edge.source ? edge.sourceLayer : edge.targetLayer) || 'Unclassified';
    byLayer.set(layer, [...(byLayer.get(layer) || []), m]);
  });
  const layers = [...byLayer.keys()].sort(
    (a, b) => (LAYER_ORDER.indexOf(a) + 1 || 99) - (LAYER_ORDER.indexOf(b) + 1 || 99)
  );

  const lines = ['flowchart LR'];
  layers.forEach((layer, i) => {
    lines.push(`  subgraph L${i}["${layer}"]`);
    byLayer.get(layer)!.forEach(m => lines.push(`    ${ids.get(m)}["${shortName(m)}"]`));
    lines.push('  end');
  });
  shown.forEach(e => lines.push(`  ${ids.get(e.source)} ${e.isViolation ? '-- ✗ -->' : '-->'} ${ids.get(e.target)}`));

  lines.push('  classDef focus fill:#3b0d0b,stroke:#ff3b30,stroke-width:2.5px,color:#ffffff');
  ids.forEach((id, m) => {
    if (m !== focus) lines.push(`  style ${id} fill:#141413,stroke:${colorOf.get(m) || '#343434'},color:#d4d4d0`);
  });
  lines.push(`  class ${ids.get(focus)} focus`);
  shown.forEach((e, i) => {
    if (e.id === edge.id) lines.push(`  linkStyle ${i} stroke:#ff3b30,stroke-width:3px`);
    else if (e.isViolation) lines.push(`  linkStyle ${i} stroke:#ff3b30,stroke-width:1.5px,stroke-dasharray:4`);
    else lines.push(`  linkStyle ${i} stroke:#5a5a56,stroke-width:1px`);
  });
  return lines.join('\n');
}

export const ViolationInsight: React.FC<ViolationInsightProps> = ({
  edge, nodes, edges, apiBase, targetPath, blueprintId, offline,
}) => {
  const source = useMemo(() => buildMermaid(edge, nodes, edges), [edge, nodes, edges]);
  const [svg, setSvg] = useState('');
  const cacheKey = `${blueprintId}|${targetPath}|${edge.id}`;
  // Results are tagged with their edge so a stale answer never shows on another edge
  const [result, setResult] = useState<{ key: string; review?: Assessment; error?: string } | null>(null);
  const review = reviewCache.get(cacheKey) || (result?.key === cacheKey ? result.review : undefined) || null;
  const reviewError = result?.key === cacheKey ? result.error : undefined;

  useEffect(() => {
    let cancelled = false;
    import('mermaid')
      .then(m => {
        m.default.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
          fontFamily: 'monospace',
          htmlLabels: false,
          themeVariables: { background: '#0e0e0d', clusterBkg: '#0a0a09', clusterBorder: '#2b2b2a', fontSize: '11px' },
        });
        return m.default.render(`viol-${Math.random().toString(36).slice(2, 9)}`, source);
      })
      .then(({ svg }) => { if (!cancelled) setSvg(svg); })
      .catch(() => { if (!cancelled) setSvg('error'); });
    return () => { cancelled = true; };
  }, [source]);

  useEffect(() => {
    if (reviewCache.has(cacheKey) || offline || !edge.violation) return;
    let cancelled = false;
    const neighbours = edges
      .filter(e => e.source === edge.source && e.id !== edge.id)
      .slice(0, 30)
      .map(e => `${e.target} (${e.targetLayer})${e.isViolation ? ' [also flagged]' : ''}`);
    fetch(`${apiBase}/api/conformance/assess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        violation: edge.violation,
        neighbours,
        target_path: targetPath || undefined,
        blueprint_id: blueprintId,
      }),
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.status !== 'success') throw new Error(data.detail || data.error || `HTTP ${res.status}`);
        reviewCache.set(cacheKey, data.assessment);
        if (!cancelled) setResult({ key: cacheKey, review: data.assessment });
      })
      .catch(err => { if (!cancelled) setResult({ key: cacheKey, error: String(err.message || err) }); });
    return () => { cancelled = true; };
  }, [cacheKey, offline, apiBase, targetPath, blueprintId, edge, edges]);

  const verdict = review ? VERDICT[review.verdict] : null;

  return (
    <div className="space-y-2 text-xs">
      {/* Flow graph: importing module in red, flagged imports red */}
      <div className="rounded border border-[#1f1f1e] bg-[#0a0a09] p-2">
        <div className="text-[#8b8b86] mb-1">MODULE FLOW ({shortName(edge.source)}):</div>
        {svg === 'error' ? (
          <div className="text-[#5a5a56] py-6 text-center">graph unavailable</div>
        ) : svg ? (
          <div className="overflow-auto max-h-56 [&_svg]:max-w-full [&_svg]:h-auto" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="text-[#5a5a56] py-6 text-center">rendering…</div>
        )}
      </div>

      {review ? (
        <>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded font-bold border" style={{ color: verdict!.color, borderColor: `${verdict!.color}66`, backgroundColor: `${verdict!.color}1a` }}>
              {verdict!.label}
            </span>
            <span className="text-[#8b8b86]">AI review</span>
          </div>
          <p className="text-[#d4d4d0]">{review.summary}</p>
          <div className="p-2 rounded bg-[#ff3b30]/10 border border-[#ff3b30]/30 text-[#fca5a5]">
            <b className="block text-[#ff5c2b] uppercase mb-0.5">Architectural Hazard:</b>
            {review.hazard}
          </div>
          <div className="p-2 rounded bg-[#4f9dff]/10 border border-[#4f9dff]/30 text-[#bcd7ff]">
            <b className="block text-[#4f9dff] uppercase mb-0.5">Better than the blueprint:</b>
            {review.advantages.length ? (
              <ul className="list-disc pl-4 space-y-0.5">{review.advantages.map((a, i) => <li key={i}>{a}</li>)}</ul>
            ) : (
              <span className="text-[#8b8b86]">Nothing here. The blueprint&apos;s structure is the better choice.</span>
            )}
          </div>
          <div className="p-2 rounded bg-[#10b981]/10 border border-[#10b981]/30 text-[#6ee7b7]">
            <b className="block text-[#10b981] uppercase mb-0.5">Recommended Remediation:</b>
            {review.recommendation}
          </div>
        </>
      ) : (
        <>
          {/* Rule-based text until the review arrives, or if it can't */}
          {edge.violation?.explanation && (
            <div className="p-2 rounded bg-[#ff3b30]/10 border border-[#ff3b30]/30 text-[#fca5a5]">
              <b className="block text-[#ff5c2b] uppercase mb-0.5">Architectural Hazard:</b>
              {edge.violation.explanation}
            </div>
          )}
          {edge.violation?.remediation && (
            <div className="p-2 rounded bg-[#10b981]/10 border border-[#10b981]/30 text-[#6ee7b7]">
              <b className="block text-[#10b981] uppercase mb-0.5">Recommended Remediation:</b>
              {edge.violation.remediation}
            </div>
          )}
          <div className="text-[#8b8b86]">
            {offline ? 'AI review needs the orchestrator.' : reviewError ? `AI review unavailable: ${reviewError}` : 'AI review loading…'}
          </div>
        </>
      )}
    </div>
  );
};
