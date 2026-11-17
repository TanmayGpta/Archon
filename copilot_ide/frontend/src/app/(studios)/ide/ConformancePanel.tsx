"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useIde } from './IdeContext';
import { API_BASE } from '@/lib/api';
import { Icons, Glyph } from '../../components/Icons';

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
    totalDependencies?: number;
  };
  violations?: ViolationItem[];
}

export function ConformancePanel() {
  const { currentProjectPath, handleOpenFile, setPendingReveal } = useIde();
  const [session, setSession] = useState<AuditSessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Fetch the latest session recorded by orchestrator
  const fetchSession = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/conformance/session`);
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
          // Expand all files by default
          if (data.session.violations) {
            const files = new Set<string>();
            data.session.violations.forEach((v: ViolationItem) => {
              files.add(v.source_file || v.source_module);
            });
            setExpandedFiles(files);
          }
        }
      }
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, []);

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
        setSession(data);
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

  const toggleFile = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const handleViolationClick = async (v: ViolationItem) => {
    const fileToOpen = v.source_file || v.source_module;
    const opened = await handleOpenFile(fileToOpen);
    if (opened && v.line_number) {
      setPendingReveal({ path: opened, line: v.line_number });
    }
  };

  const score = session?.metrics?.healthScore ?? 100;
  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400';
  const scoreBorder = score >= 80 ? 'border-emerald-500/30' : score >= 60 ? 'border-yellow-500/30' : 'border-red-500/30';

  return (
    <div className="flex-1 flex flex-col h-full bg-surface text-xs font-mono overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-line-subtle bg-canvas flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <Glyph name="zap" />
          <span>CONFORMANCE</span>
        </div>
        <a
          href={`/conformance${currentProjectPath ? `?path=${encodeURIComponent(currentProjectPath)}` : ''}`}
          className="text-[11px] text-[#e8ff00] hover:underline flex items-center gap-1"
          title="Open interactive 3D reality graph in Conformance Studio"
        >
          <span>Open Graph</span>
          <span>➔</span>
        </a>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {/* Score Card */}
        <div className={`p-3 rounded-panel bg-canvas border ${scoreBorder} space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="text-fg-subtle text-[11px] uppercase tracking-wider">Health Score</span>
            <span className={`text-xl font-bold font-mono ${scoreColor}`}>
              {Math.round(score)}%
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

          <div className="text-[11px] text-fg-subtle">
            Violations: <span className={session?.metrics?.totalViolations ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
              {session?.metrics?.totalViolations ?? 0}
            </span>
          </div>

          {/* Re-Audit Action Button */}
          <button
            onClick={runReaudit}
            disabled={auditing}
            className="w-full mt-2 py-1.5 px-3 rounded bg-[#e8ff00] hover:bg-[#d6ec00] text-black font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Icons.Refresh />
            <span>{auditing ? 'Scanning Codebase...' : 'Re-Audit Architecture'}</span>
          </button>
        </div>

        {/* Violations List */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider flex items-center justify-between">
            <span>Violations by File</span>
            <span className="text-fg-muted font-normal">
              {groupedViolations.length} file{groupedViolations.length === 1 ? '' : 's'}
            </span>
          </div>

          {groupedViolations.length === 0 ? (
            <div className="p-3 rounded bg-canvas border border-line-subtle text-emerald-400 text-center space-y-1">
              <div className="font-bold">✓ 100% Conforming</div>
              <div className="text-[11px] text-fg-subtle">No architectural violations found.</div>
            </div>
          ) : (
            groupedViolations.map(({ file, items }) => {
              const isOpen = expandedFiles.has(file);
              return (
                <div key={file} className="border border-line rounded-control bg-canvas overflow-hidden">
                  <div
                    onClick={() => toggleFile(file)}
                    className="p-2 flex items-center justify-between cursor-pointer hover:bg-raised transition-colors"
                  >
                    <div className="flex items-center gap-1.5 truncate max-w-[190px]" title={file}>
                      <span className="text-fg-subtle">{isOpen ? '▾' : '▸'}</span>
                      <span className="text-fg font-medium truncate">{file.split('/').pop()}</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/15 text-red-400 border border-red-500/30 font-bold">
                      {items.length}
                    </span>
                  </div>

                  {isOpen && (
                    <div className="border-t border-line-subtle divide-y divide-line-subtle/50">
                      {items.map((v, i) => (
                        <div
                          key={i}
                          onClick={() => handleViolationClick(v)}
                          className="p-2 hover:bg-raised/70 cursor-pointer transition-colors space-y-1"
                          title="Click to jump to line in editor"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-yellow-400 font-semibold text-[11px]">
                              {v.source_layer} → {v.target_layer}
                            </span>
                            {v.line_number && (
                              <span className="text-fg-muted text-[10px] bg-canvas px-1 rounded border border-line">
                                L:{v.line_number}
                              </span>
                            )}
                          </div>

                          <div className="text-fg-subtle text-[11px] line-clamp-2">
                            {v.reason}
                          </div>

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
