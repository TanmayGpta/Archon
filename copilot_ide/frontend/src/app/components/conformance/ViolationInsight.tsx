"use client";

import React, { useEffect, useState } from 'react';
import type { ConformanceEdge, ConformanceNode } from './types';
import { BlueprintVsActual } from './BlueprintVsActual';

// Inspector body for a flagged edge: blueprint route vs the actual import (from the blueprint's
// rules and the AST edges, never the LLM), then the LLM's review of the dependency.

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
  blueprintLayers?: string[];
  allowed?: [string, string][];
  offline: boolean;
}

const VERDICT = {
  fix: { label: 'FIX: BLUEPRINT IS RIGHT', color: '#ff3b30' },
  acceptable_deviation: { label: 'ACCEPTABLE DEVIATION', color: '#f5a524' },
  blueprint_gap: { label: 'BLUEPRINT GAP', color: '#4f9dff' },
} as const;

// One review per edge per audit; the inspector unmounts on close, so the cache lives here.
// In-flight requests are shared too, so a re-run effect (React dev double-invoke) never asks twice.
const reviewCache = new Map<string, Assessment>();
const inFlight = new Map<string, Promise<Assessment>>();

export const ViolationInsight: React.FC<ViolationInsightProps> = ({
  edge, nodes, edges, apiBase, targetPath, blueprintId, blueprintLayers, allowed, offline,
}) => {
  const cacheKey = `${blueprintId}|${targetPath}|${edge.id}`;
  // Results are tagged with their edge so a stale answer never shows on another edge
  const [result, setResult] = useState<{ key: string; review?: Assessment; error?: string } | null>(null);
  const review = reviewCache.get(cacheKey) || (result?.key === cacheKey ? result.review : undefined) || null;
  const reviewError = result?.key === cacheKey ? result.error : undefined;

  useEffect(() => {
    if (reviewCache.has(cacheKey) || offline || !edge.violation) return;
    let cancelled = false;
    const neighbours = edges
      .filter(e => e.source === edge.source && e.id !== edge.id)
      .slice(0, 30)
      .map(e => `${e.target} (${e.targetLayer})${e.isViolation ? ' [also flagged]' : ''}`);
    let request = inFlight.get(cacheKey);
    if (!request) {
      request = fetch(`${apiBase}/api/conformance/assess`, {
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
          return data.assessment as Assessment;
        })
        .finally(() => inFlight.delete(cacheKey));
      inFlight.set(cacheKey, request);
    }
    request
      .then(review => { if (!cancelled) setResult({ key: cacheKey, review }); })
      .catch(err => { if (!cancelled) setResult({ key: cacheKey, error: String(err.message || err) }); });
    return () => { cancelled = true; };
  }, [cacheKey, offline, apiBase, targetPath, blueprintId, edge, edges]);

  const verdict = review ? VERDICT[review.verdict] : null;

  return (
    <div className="space-y-2 text-xs">
      <div className="rounded border border-[#1f1f1e] bg-[#0a0a09] p-3">
        <BlueprintVsActual edge={edge} nodes={nodes} edges={edges} blueprintLayers={blueprintLayers} allowed={allowed} />
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
