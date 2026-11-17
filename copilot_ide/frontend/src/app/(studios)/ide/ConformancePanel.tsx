"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useIde } from './IdeContext';
import { API_BASE } from '@/lib/api';
import { Icons, Glyph } from '../../components/Icons';
import { edgeSourceFile, mapSessionMarkers, sessionMatchesProject, type RawCycleEdge } from './violationUtils';

interface ViolationItem {
  source_module: string;
  target_module: string;
  source_layer: string;
  target_layer: string;
  severity: string;
  reason: string;
  line_number?: number;
  code_snippet?: string;
  explanation?: string;
  remediation?: string;
  source_file?: string;
  trace?: {
    kind?: string;
    route?: string[];
    rules?: Array<{ source: string; target: string; justification?: string; arcgenEdges?: string[]; requirements?: string[] }>;
  };
}

interface AuditSessionData {
  sessionId?: string;
  savedAt?: number;
  targetPath?: string;
  blueprint?: { id: string; name: string; description: string };
  metrics?: {
    healthScore: number;
    coverage?: number;
    totalModules?: number;
    totalViolations?: number;
    cyclesCount?: number;
    totalDependencies?: number;
  };
  violations?: ViolationItem[];
  edges?: RawCycleEdge[];
  cycles?: string[][];
}

export function ConformancePanel() {
  const { currentProjectPath, handleOpenFile, setPendingReveal, setViolationMarkers } = useIde();
  const [session, setSession] = useState<AuditSessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [expandedCycles, setExpandedCycles] = useState<Set<number>>(new Set());

  const applySession = useCallback((next: AuditSessionData | null) => {
    setSession(next);
    setViolationMarkers(mapSessionMarkers(next));
    if (next?.violations) {
      setExpandedFiles(new Set(next.violations.map(v => v.source_file || v.source_module)));
    } else {
      setExpandedFiles(new Set());
    }
    if (next?.cycles?.length) {
      setExpandedCycles(new Set(next.cycles.map((_, idx) => idx)));
    } else {
      setExpandedCycles(new Set());
    }
  }, [setViolationMarkers]);

  // Fetch the latest session recorded by orchestrator, only applying if it matches current workspace
  const fetchSession = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/conformance/session`);
      if (res.ok) {
        const data = await res.json();
        if (data.session && sessionMatchesProject(data.session.targetPath, currentProjectPath)) {
          applySession(data.session);
        } else {
          applySession(null);
        }
      }
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, [applySession, currentProjectPath]);

  // Re-audit current project
  const runReaudit = async () => {
    setAuditing(true);
    try {
      const res = await fetch(`${API_BASE}/api/conformance/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_path: currentProjectPath || undefined,
        })
      });
      if (res.ok) {
        const data = await res.json();
        applySession(data);
        // Notify other tabs (e.g. Conformance Studio graph page)
        try {
          localStorage.setItem('archon.conformance.updated', String(Date.now()));
        } catch {}
      }
    } catch (e) {
      console.error('Re-audit failed:', e);
    } finally {
      setAuditing(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Sync across tabs: listen for storage event when Conformance Studio runs an audit
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'archon.conformance.updated') {
        fetchSession();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [fetchSession]);

  // Group violations by file
  const groupedViolations = useMemo(() => {
    if (!session?.violations) return [];
    const groups: { [file: string]: ViolationItem[] } = {};
    for (const v of session.violations) {
      const key = v.source_file || v.source_module;
      if (!groups[key]) groups[key] = [];
      groups[key].push(v);
    }
    return Object.entries(groups).map(([file, items]) => ({ file, items }));
  }, [session]);

  // Build clickable cycle cards from session.cycles + cycle edges
  const cycleCards = useMemo(() => {
    const cycles = session?.cycles ?? [];
    if (!cycles.length) return [];
    const cycleEdges = (session?.edges ?? []).filter(e => e.isCycle);
    return cycles.map((members, idx) => {
      const memberSet = new Set(members);
      const edges = cycleEdges.filter(e => memberSet.has(e.source) && memberSet.has(e.target));
      return { idx, members, edges };
    });
  }, [session]);

  const toggleFile = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const toggleCycle = (idx: number) => {
    setExpandedCycles(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const jumpToLocation = async (fileToOpen: string, lineNumber?: number) => {
    const opened = await handleOpenFile(fileToOpen);
    if (opened && lineNumber) {
      setPendingReveal({ path: opened, line: lineNumber });
    }
  };

  const cyclesCount = session ? (session.metrics?.cyclesCount ?? cycleCards.length) : 0;

  const score = session?.metrics?.healthScore ?? null;
  const scoreColor = score === null ? 'text-fg-muted' : score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400';
  const scoreBorder = score === null ? 'border-line' : score >= 80 ? 'border-emerald-500/30' : score >= 60 ? 'border-yellow-500/30' : 'border-red-500/30';

  return (
    <div className="flex-1 flex flex-col h-full bg-surface text-xs font-mono overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-line-subtle bg-canvas flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <Glyph name="zap" />
          <span>CONFORMANCE</span>
        </div>
        <Link
          href={`/conformance${currentProjectPath ? `?path=${encodeURIComponent(currentProjectPath)}` : ''}`}
          className="text-[11px] text-[#e8ff00] hover:underline flex items-center gap-1"
          title="Open interactive 3D reality graph in Conformance Studio"
        >
          <span>Open Graph</span>
          <span>➔</span>
        </Link>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {/* Score Card */}
        <div className={`p-3 rounded-panel bg-canvas border ${scoreBorder} space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-fg-subtle text-[11px] uppercase tracking-wider">Health Score</span>
            <span className={`text-xl font-bold font-mono ${scoreColor}`}>
              {score === null ? '--%' : `${Math.round(score)}%`}
            </span>
          </div>

          <div className="text-[11px] text-fg-subtle truncate" title={session?.blueprint?.name || 'Default Blueprint'}>
            Blueprint: <span className="text-fg">{session?.blueprint?.name || 'Archon Architecture'}</span>
          </div>

          {session?.metrics?.coverage !== undefined && (
            <div className="text-[11px] text-fg-subtle">
              Coverage: <span className="text-fg">{session.metrics.coverage}%</span> of files verified
            </div>
          )}

          <div className="flex items-center gap-4 text-[11px] text-fg-subtle">
            <span>
              Violations: <span className={session?.metrics?.totalViolations ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                {session ? (session.metrics?.totalViolations ?? 0) : '--'}
              </span>
            </span>
            <span>
              Cycles: <span className={cyclesCount > 0 ? 'text-[#d8b4fe] font-bold' : 'text-emerald-400 font-bold'}>
                {session ? cyclesCount : '--'}
              </span>
            </span>
          </div>

          {/* Re-Audit Action Button */}
          <button
            onClick={runReaudit}
            disabled={auditing}
            className="w-full mt-2 py-1.5 px-3 rounded bg-[#e8ff00] hover:bg-[#d6ec00] text-black font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Icons.Refresh />
            <span>{auditing ? 'Scanning Codebase...' : session ? 'Re-Audit Architecture' : 'Scan Workspace'}</span>
          </button>
        </div>

        {/* Dependency Cycles (purple) */}
        {session && cycleCards.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-[#d8b4fe] uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#c026ff] shadow-[0_0_6px_#c026ff]" />
                <span>Dependency Cycles</span>
              </span>
              <span className="text-fg-muted font-normal">
                {cycleCards.length} cycle{cycleCards.length === 1 ? '' : 's'}
              </span>
            </div>

            {cycleCards.map(({ idx, members, edges }) => {
              const isOpen = expandedCycles.has(idx);
              const chainLabel = [...members, members[0]].map(m => m.split('.').pop()).join(' → ');
              return (
                <div key={idx} className="border border-[#c026ff]/40 rounded-control bg-canvas overflow-hidden">
                  <div
                    onClick={() => toggleCycle(idx)}
                    className="p-2 flex items-center justify-between cursor-pointer hover:bg-[#c026ff]/10 transition-colors gap-2"
                    title={[...members, members[0]].join(' → ')}
                  >
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      <span className="text-[#d8b4fe]">{isOpen ? '▾' : '▸'}</span>
                      <span className="text-[#e9d5ff] font-medium truncate">{chainLabel}</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#c026ff]/15 text-[#d8b4fe] border border-[#c026ff]/40 font-bold flex-shrink-0">
                      {members.length} mods
                    </span>
                  </div>

                  {isOpen && (
                    <div className="border-t border-[#c026ff]/25 divide-y divide-line-subtle/50">
                      {edges.map((edge, i) => {
                        const filePath = edgeSourceFile(edge);
                        return (
                          <div
                            key={edge.id || i}
                            onClick={() => jumpToLocation(filePath, edge.lineNumber)}
                            className="p-2 hover:bg-[#c026ff]/10 cursor-pointer transition-colors space-y-1"
                            title="Click to jump to circular import line"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[#d8b4fe] font-semibold text-[11px] truncate">
                                {filePath}
                              </span>
                              {edge.lineNumber && (
                                <span className="text-[#e9d5ff] text-[10px] bg-[#c026ff]/15 px-1 rounded border border-[#c026ff]/30 flex-shrink-0">
                                  L:{edge.lineNumber}
                                </span>
                              )}
                            </div>
                            <div className="text-fg-subtle text-[11px] truncate">
                              {edge.sourceLayer} → {edge.targetLayer} ({edge.target})
                            </div>
                            {edge.codeSnippet && (
                              <div className="text-[10px] text-[#c084fc] truncate bg-surface/60 px-1.5 py-0.5 rounded border border-[#c026ff]/20">
                                {edge.codeSnippet}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Violations List (red) */}
        <div className="space-y-2">
          <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${groupedViolations.length > 0 ? 'text-[#fca5a5]' : 'text-fg-subtle'}`}>
            <span className="flex items-center gap-1.5">
              {groupedViolations.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-[#ef4444] shadow-[0_0_6px_#ef4444]" />
              )}
              <span>Violations by File</span>
            </span>
            <span className="text-fg-muted font-normal">
              {groupedViolations.length} file{groupedViolations.length === 1 ? '' : 's'}
            </span>
          </div>

          {!session ? (
            <div className="p-3 rounded bg-canvas border border-line-subtle text-fg-subtle text-center space-y-1">
              <div className="font-bold text-fg-soft">{loading ? 'Loading audit...' : 'No audit for this workspace'}</div>
              <div className="text-[11px]">Click Scan Workspace above to highlight architectural violations.</div>
            </div>
          ) : groupedViolations.length === 0 ? (
            <div className="p-3 rounded bg-canvas border border-line-subtle text-emerald-400 text-center space-y-1">
              <div className="font-bold">{cyclesCount > 0 ? '✓ Zero Layer Violations' : '✓ 100% Conforming'}</div>
              <div className="text-[11px] text-fg-subtle">
                {cyclesCount > 0 ? 'No forbidden layer rules triggered, but dependency cycles exist above.' : 'No architectural violations found.'}
              </div>
            </div>
          ) : (
            groupedViolations.map(({ file, items }) => {
              const isOpen = expandedFiles.has(file);
              return (
                <div key={file} className="border border-[#ef4444]/40 rounded-control bg-canvas overflow-hidden">
                  <div
                    onClick={() => toggleFile(file)}
                    className="p-2 flex items-center justify-between cursor-pointer hover:bg-[#ef4444]/10 transition-colors gap-2"
                  >
                    <div className="flex items-center gap-1.5 truncate min-w-0" title={file}>
                      <span className="text-[#fca5a5]">{isOpen ? '▾' : '▸'}</span>
                      <span className="text-[#fecaca] font-medium truncate">{file.split('/').pop()}</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#ef4444]/15 text-[#fca5a5] border border-[#ef4444]/40 font-bold flex-shrink-0">
                      {items.length}
                    </span>
                  </div>

                  {isOpen && (
                    <div className="border-t border-[#ef4444]/25 divide-y divide-line-subtle/50">
                      {items.map((v, i) => (
                        <div
                          key={i}
                          onClick={() => jumpToLocation(v.source_file || v.source_module, v.line_number)}
                          className="p-2 hover:bg-[#ef4444]/10 cursor-pointer transition-colors space-y-1"
                          title="Click to jump to line in editor"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#fca5a5] font-semibold text-[11px] truncate">
                              {v.source_layer} → {v.target_layer}
                            </span>
                            {v.line_number && (
                              <span className="text-[#fecaca] text-[10px] bg-[#ef4444]/15 px-1 rounded border border-[#ef4444]/30 flex-shrink-0">
                                L:{v.line_number}
                              </span>
                            )}
                          </div>

                          <div className="text-fg-subtle text-[11px] line-clamp-2">
                            {v.reason}
                          </div>

                          {v.code_snippet && (
                            <div
                              className="text-[10px] text-[#f87171] truncate bg-surface/60 px-1.5 py-0.5 rounded border border-[#ef4444]/20"
                              title={v.code_snippet}
                            >
                              {v.code_snippet}
                            </div>
                          )}

                          {v.trace?.route && (
                            <div className="text-[10px] text-blue-400 truncate">
                              Route: {v.trace.route.join(' → ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
