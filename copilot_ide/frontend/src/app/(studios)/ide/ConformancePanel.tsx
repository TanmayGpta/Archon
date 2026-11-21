"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useIde } from './IdeContext';
import { API_BASE, errorDetail, errorMessage } from '@/lib/api';
import { Icons, Glyph } from '../../components/Icons';
import { edgeSourceFile, mapSessionMarkers, pathHits, sessionMatchesProject, type RawCycleEdge } from './violationUtils';
import { HealJobCard, type HealPreview, type HealReport, type PreviewStatus } from './HealJobCard';
import type { HealTraceEvent } from './HealTraceView';

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
  customRuleset?: Record<string, unknown> | null;
  availableBlueprints?: Array<{ id: string; name: string; description?: string; source?: string }>;
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
  const {
    currentProjectPath,
    selectedModel,
    handleOpenFile,
    handleCloseTab,
    openScratchTab,
    applyPersistedEdit,
    revertPersistedChanges,
    fetchProjectsAndTree,
    healApplying,
    setHealApplying,
    setPendingHealPatches,
    setDismissedHealPreviewPaths,
    healActionsRef,
    setPendingReveal,
    setViolationMarkers,
  } = useIde();
  const [session, setSession] = useState<AuditSessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [expandedCycles, setExpandedCycles] = useState<Set<number>>(new Set());

  // Healing state (LangGraph sandbox loop + multi-file diff queue synced to EditorPane)
  const [healActive, setHealActive] = useState(false);
  const [healCollapsed, setHealCollapsed] = useState(false);
  const [healRunning, setHealRunning] = useState(false);
  const [healPhase, setHealPhase] = useState<string>('gather');
  const [healEvents, setHealEvents] = useState<HealTraceEvent[]>([]);
  const [healError, setHealError] = useState<string | null>(null);
  const [healReport, setHealReport] = useState<HealReport | null>(null);
  const [previewStatuses, setPreviewStatuses] = useState<Record<string, PreviewStatus>>({});
  const [healTargets, setHealTargets] = useState<{ mode: 'single' | 'all'; violationId?: string } | null>(null);

  const healJobIdRef = useRef<string | null>(null);
  const healReportRef = useRef<HealReport | null>(null);
  const statusesRef = useRef<Record<string, PreviewStatus>>({});
  const streamAbortRef = useRef<AbortController | null>(null);

  const updateStatuses = useCallback((next: Record<string, PreviewStatus>) => {
    statusesRef.current = next;
    setPreviewStatuses(next);
    const previews = healReportRef.current?.previews || [];
    setPendingHealPatches(previews.map(p => ({ ...p, status: next[p.path] || 'pending' })));
  }, [setPendingHealPatches]);

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

  const runAuditForBlueprint = useCallback(async (bpId?: string, customRs?: Record<string, unknown> | null) => {
    setAuditing(true);
    try {
      const res = await fetch(`${API_BASE}/api/conformance/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_path: currentProjectPath || undefined,
          blueprint_id: bpId || undefined,
          custom_ruleset: bpId === 'custom' && customRs ? customRs : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        applySession(data);
        try {
          localStorage.setItem('archon.conformance.updated', String(Date.now()));
        } catch {}
      }
    } catch (e) {
      console.error('Re-audit failed:', e);
    } finally {
      setAuditing(false);
    }
  }, [applySession, currentProjectPath]);

  // Fetch the latest session recorded by orchestrator, only applying if it matches current workspace
  const fetchSession = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/conformance/session`);
      if (res.ok) {
        const data = await res.json();
        if (data.session && sessionMatchesProject(data.session.targetPath, currentProjectPath)) {
          // Recover automatically if an ad-hoc 'custom' session was saved without its ruleset JSON (e.g. test artifact).
          const isStaleCustom =
            data.session.blueprint?.id === 'custom' &&
            !data.session.customRuleset &&
            currentProjectPath?.toLowerCase().includes('ecommerce_platform');
          if (isStaleCustom) {
            await runAuditForBlueprint('clean_architecture');
          } else {
            applySession(data.session);
          }
        } else {
          applySession(null);
        }
      }
    } catch {
      // offline
    } finally {
      setLoading(false);
    }
  }, [applySession, currentProjectPath, runAuditForBlueprint]);

  const defaultBlueprintForPath = useMemo(() => {
    if (session?.blueprint?.id === 'custom' && !session.customRuleset) {
      return currentProjectPath?.toLowerCase().includes('ecommerce_platform') ? 'clean_architecture' : 'archon_architecture';
    }
    if (session?.blueprint?.id) return session.blueprint.id;
    return currentProjectPath?.toLowerCase().includes('ecommerce_platform') ? 'clean_architecture' : undefined;
  }, [currentProjectPath, session?.blueprint?.id, session?.customRuleset]);

  // Re-audit current project (preserving active blueprint)
  const runReaudit = useCallback(async () => {
    await runAuditForBlueprint(
      defaultBlueprintForPath,
      defaultBlueprintForPath === 'custom' ? session?.customRuleset : undefined,
    );
  }, [defaultBlueprintForPath, runAuditForBlueprint, session?.customRuleset]);

  useEffect(() => {
    setHealActive(false);
    setHealCollapsed(false);
    setHealTargets(null);
    setPendingHealPatches([]);
    setDismissedHealPreviewPaths([]);
  }, [currentProjectPath, setDismissedHealPreviewPaths, setPendingHealPatches]);

  useEffect(() => {
    fetchSession();
    return () => {
      streamAbortRef.current?.abort();
    };
  }, [fetchSession]);

  const finalizeDecision = useCallback(
    async (statusesMap: Record<string, PreviewStatus>) => {
      const report = healReportRef.current;
      const jobId = healJobIdRef.current;
      const appliedFiles = (report?.previews || [])
        .filter(p => statusesMap[p.path] === 'applied')
        .map(p => p.path);
      if (jobId) {
        try {
          await fetch(`${API_BASE}/api/conformance/heal/jobs/${jobId}/decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approved: appliedFiles.length > 0, applied_files: appliedFiles }),
          });
        } catch {}
      }
      if (appliedFiles.length > 0) {
        await fetchProjectsAndTree();
        await runReaudit();
      }
    },
    [fetchProjectsAndTree, runReaudit],
  );

  const focusHealFile = useCallback(async (preview: HealPreview) => {
    setDismissedHealPreviewPaths(prev => prev.filter(x => !pathHits(x, preview.path)));
    if (preview.operation === 'modify') {
      const opened = await handleOpenFile(preview.path);
      if (opened) return;
    }
    openScratchTab(preview.path, preview.name, preview.before);
  }, [handleOpenFile, openScratchTab, setDismissedHealPreviewPaths]);

  const handleAcceptOne = useCallback(async (preview: HealPreview, keptText?: string) => {
    setHealApplying(true);
    const ok = await applyPersistedEdit(
      preview.path,
      preview.name,
      preview.before,
      keptText ?? preview.after,
      preview.summary || 'Architectural heal patch',
    );
    setHealApplying(false);
    if (!ok) return;
    const nextMap = { ...statusesRef.current, [preview.path]: 'applied' as PreviewStatus };
    updateStatuses(nextMap);
    // Drop stale pre-heal violation markers for the accepted file before refreshing the audit.
    setViolationMarkers(prev => prev.filter(m => !pathHits(m.path, preview.path)));
    await fetchProjectsAndTree();
    const previews = healReportRef.current?.previews || [];
    const nextPending = previews.find(p => (nextMap[p.path] || 'pending') === 'pending');
    if (nextPending) {
      await focusHealFile(nextPending);
      await runReaudit();
    } else {
      await finalizeDecision(nextMap);
    }
  }, [applyPersistedEdit, fetchProjectsAndTree, finalizeDecision, focusHealFile, runReaudit, setHealApplying, setViolationMarkers, updateStatuses]);

  const handleRejectOne = useCallback(async (preview: HealPreview) => {
    if (preview.operation === 'create') {
      handleCloseTab(preview.path);
    }
    const nextMap = { ...statusesRef.current, [preview.path]: 'rejected' as PreviewStatus };
    updateStatuses(nextMap);
    const previews = healReportRef.current?.previews || [];
    const nextPending = previews.find(p => (nextMap[p.path] || 'pending') === 'pending');
    if (nextPending) {
      await focusHealFile(nextPending);
    } else {
      await finalizeDecision(nextMap);
    }
  }, [finalizeDecision, focusHealFile, handleCloseTab, updateStatuses]);

  const handleAcceptAll = useCallback(async () => {
    const previews = healReportRef.current?.previews || [];
    setHealApplying(true);
    const nextMap = { ...statusesRef.current };
    for (const preview of previews) {
      if ((nextMap[preview.path] || 'pending') !== 'pending') continue;
      const ok = await applyPersistedEdit(
        preview.path,
        preview.name,
        preview.before,
        preview.after,
        preview.summary || 'Architectural heal patch',
      );
      if (ok) nextMap[preview.path] = 'applied';
    }
    updateStatuses(nextMap);
    setHealApplying(false);
    await finalizeDecision(nextMap);
  }, [applyPersistedEdit, finalizeDecision, setHealApplying, updateStatuses]);

  const handleRejectAll = useCallback(async () => {
    const previews = healReportRef.current?.previews || [];
    const nextMap = { ...statusesRef.current };
    for (const preview of previews) {
      if ((nextMap[preview.path] || 'pending') === 'pending') {
        if (preview.operation === 'create') handleCloseTab(preview.path);
        nextMap[preview.path] = 'rejected';
      }
    }
    updateStatuses(nextMap);
    await finalizeDecision(nextMap);
  }, [finalizeDecision, handleCloseTab, updateStatuses]);

  const openPreviewFile = useCallback((preview: HealPreview) => {
    const st = statusesRef.current[preview.path] || 'pending';
    if (preview.operation === 'modify' || st === 'applied') {
      void handleOpenFile(preview.path);
    } else {
      openScratchTab(preview.path, preview.name, preview.after);
    }
  }, [handleOpenFile, openScratchTab]);

  const revertHealPreviews = useCallback(async (targets: HealPreview[], revertWholeHeal: boolean) => {
    if (!targets.length) return;
    setHealApplying(true);
    const ok = await revertPersistedChanges(
      targets.map(p => ({ path: p.path, name: p.name, operation: p.operation, before: p.before })),
    );
    if (ok) {
      const nextMap = { ...statusesRef.current };
      for (const p of targets) nextMap[p.path] = 'reverted';
      if (revertWholeHeal) {
        for (const p of healReportRef.current?.previews || []) {
          if (p.operation === 'create' && (nextMap[p.path] || 'pending') === 'pending') {
            handleCloseTab(p.path);
          }
          nextMap[p.path] = 'reverted';
        }
      }
      updateStatuses(nextMap);
      await fetchProjectsAndTree();
      await runReaudit();
    }
    setHealApplying(false);
  }, [fetchProjectsAndTree, handleCloseTab, revertPersistedChanges, runReaudit, setHealApplying, updateStatuses]);

  const handleRevertOne = useCallback(async (preview: HealPreview) => {
    await revertHealPreviews([preview], false);
  }, [revertHealPreviews]);

  const handleRevertAll = useCallback(async () => {
    const previews = healReportRef.current?.previews || [];
    const applied = previews.filter(p => statusesRef.current[p.path] === 'applied');
    await revertHealPreviews(applied, true);
  }, [revertHealPreviews]);

  useEffect(() => {
    healActionsRef.current = {
      acceptFile: async (path, keptText) => {
        const preview = (healReportRef.current?.previews || []).find(p => p.path === path);
        if (preview) await handleAcceptOne(preview, keptText);
      },
      rejectFile: async path => {
        const preview = (healReportRef.current?.previews || []).find(p => p.path === path);
        if (preview) await handleRejectOne(preview);
      },
      acceptAll: handleAcceptAll,
    };
  }, [handleAcceptAll, handleAcceptOne, handleRejectOne, healActionsRef]);

  const startHeal = async (mode: 'single' | 'all', violationId?: string) => {
    streamAbortRef.current?.abort();
    const ctrl = new AbortController();
    streamAbortRef.current = ctrl;

    setHealActive(true);
    setHealCollapsed(false);
    setHealTargets({ mode, violationId });
    setHealRunning(true);
    setHealPhase('gather');
    setHealEvents([
      {
        type: 'start',
        kind: 'agent_start',
        agent: 'AssessorFilter',
        message: mode === 'single' ? `Starting heal for ${violationId}...` : 'Starting Heal All with assessor filter...',
        ts: Date.now() / 1000,
      },
    ]);
    setHealError(null);
    setHealReport(null);
    healReportRef.current = null;
    healJobIdRef.current = null;
    setDismissedHealPreviewPaths([]);
    updateStatuses({});

    const activeBpId = defaultBlueprintForPath || 'archon_architecture';
    try {
      const startRes = await fetch(`${API_BASE}/api/conformance/heal/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          codebase_path: currentProjectPath || session?.targetPath || undefined,
          blueprint_id: activeBpId,
          custom_ruleset: activeBpId === 'custom' && session?.customRuleset ? session.customRuleset : undefined,
          model: selectedModel || undefined,
          mode,
          violation_id: violationId,
        }),
      });
      if (!startRes.ok) {
        throw new Error(errorDetail(await startRes.text()));
      }
      const { job_id } = await startRes.json();
      healJobIdRef.current = job_id;

      const streamRes = await fetch(`${API_BASE}/api/conformance/heal/jobs/${job_id}/stream?start=0`, {
        signal: ctrl.signal,
      });
      if (!streamRes.ok || !streamRes.body) {
        throw new Error('Could not open healing stream.');
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const line = frame.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          const evt: HealTraceEvent = JSON.parse(line.slice(6));
          if (evt.type && evt.type !== 'trace') setHealPhase(evt.type);
          setHealEvents(prev => [...prev, evt]);
          if (evt.type === 'error') {
            setHealError(evt.message || 'Healing failed.');
          }
          if (evt.type === 'complete' && evt.data?.report) {
            const report = evt.data.report as HealReport;
            healReportRef.current = report;
            setHealReport(report);
            const initMap: Record<string, PreviewStatus> = {};
            for (const p of report.previews || []) initMap[p.path] = 'pending';
            updateStatuses(initMap);
            if (report.previews?.length) {
              await focusHealFile(report.previews[0]);
            }
          }
        }
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        setHealError(errorMessage(e));
      }
    } finally {
      setHealRunning(false);
    }
  };

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

  // Group remaining violations by file, hiding any currently moved into the active heal card.
  const groupedViolations = useMemo(() => {
    if (!session?.violations) return [];
    const previews = healReport?.previews || [];
    const activePreviews = previews.filter(p => (previewStatuses[p.path] || 'pending') !== 'reverted');
    const revertedPaths = previews.filter(p => previewStatuses[p.path] === 'reverted').map(p => p.path);
    const activeTargetIds = new Set(healReport?.target_violation_ids || []);

    const isMovedToHeal = (v: ViolationItem): boolean => {
      if (!healActive) return false;
      const vid = `${v.source_module}->${v.target_module}`;
      if (healRunning) {
        if (healTargets?.mode === 'all') return true;
        return Boolean(healTargets?.mode === 'single' && healTargets.violationId === vid);
      }
      if (!healReport || !previews.length || healReport.status === 'failed' || activePreviews.length === 0) {
        return false;
      }
      const src = v.source_file || v.source_module;
      const wasReverted = v.source_file
        ? revertedPaths.some(rp => pathHits(rp, v.source_file!))
        : revertedPaths.some(rp => rp.replace(/\.py$/, '').replace(/\//g, '.') === v.source_module);
      if (wasReverted) return false;
      return activeTargetIds.has(vid) || activePreviews.some(ap => pathHits(ap.path, src));
    };

    const groups: { [file: string]: ViolationItem[] } = {};
    for (const v of session.violations) {
      if (isMovedToHeal(v)) continue;
      const key = v.source_file || v.source_module;
      if (!groups[key]) groups[key] = [];
      groups[key].push(v);
    }
    return Object.entries(groups).map(([file, items]) => ({ file, items }));
  }, [healActive, healReport, healRunning, healTargets, previewStatuses, session]);

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

          {session?.availableBlueprints && session.availableBlueprints.length > 0 ? (
            <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
              <span className="shrink-0">Blueprint:</span>
              <select
                value={defaultBlueprintForPath || ''}
                disabled={auditing || healRunning}
                onChange={e => void runAuditForBlueprint(e.target.value)}
                className="flex-1 min-w-0 bg-raised text-fg text-[11px] font-mono rounded px-1.5 py-0.5 border border-line focus:outline-none cursor-pointer truncate disabled:opacity-50"
                title={session?.blueprint?.name || 'Select Architecture Blueprint'}
              >
                {session?.blueprint?.id === 'custom' && session.customRuleset && (
                  <option value="custom">{session.blueprint.name} (Custom)</option>
                )}
                {session.availableBlueprints.map(bp => (
                  <option key={bp.id} value={bp.id}>{bp.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-[11px] text-fg-subtle truncate" title={session?.blueprint?.name || 'Default Blueprint'}>
              Blueprint: <span className="text-fg">{session?.blueprint?.name || 'Archon Architecture'}</span>
            </div>
          )}

          {selectedModel && (
            <div className="text-[10px] text-fg-muted truncate" title="Follows the LLM selector in API Copilot">
              Heal LLM: <span className="text-fg-soft">{selectedModel}</span>
            </div>
          )}

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

          {/* Re-Audit & Heal All Action Buttons */}
          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={runReaudit}
              disabled={auditing || healRunning}
              className="flex-1 py-1.5 px-2.5 rounded bg-[#e8ff00] hover:bg-[#d6ec00] text-black font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Icons.Refresh />
              <span>{auditing ? 'Scanning...' : session ? 'Re-Audit' : 'Scan Workspace'}</span>
            </button>
            {session && (session.metrics?.totalViolations || 0) > 0 && (
              <button
                onClick={() => startHeal('all')}
                disabled={healRunning || auditing}
                title="Run Assessor + LangGraph DIP Healing for all fixable violations"
                className="py-1.5 px-2.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
              >
                {healRunning ? 'Healing...' : 'Heal All'}
              </button>
            )}
          </div>
        </div>

        {/* LangGraph Healing Live Progress, Trace & Diff Review */}
        {healActive && (
          healCollapsed ? (
            <div className="border border-emerald-500/35 rounded-control bg-canvas px-2.5 py-1.5 flex items-center gap-2 text-[11px]">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  healRunning
                    ? 'bg-amber-400 animate-pulse'
                    : healError || healReport?.status === 'failed'
                      ? 'bg-red-400'
                      : 'bg-emerald-400'
                }`}
              />
              <span className="text-fg-soft truncate flex-1 font-mono text-[10px]">
                {healRunning
                  ? `Healing (${healPhase})...`
                  : healReport?.previews?.length
                    ? `Last Heal · ${healReport.previews.length} file(s)`
                    : healError || healReport?.summary || 'Heal Trace'}
              </span>
              {Object.values(previewStatuses).filter(s => s === 'applied').length > 0 && (
                <button
                  type="button"
                  disabled={healApplying || healRunning}
                  onClick={() => void handleRevertAll()}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/50 text-amber-200 hover:bg-amber-500/15 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  Revert All
                </button>
              )}
              <button
                type="button"
                onClick={() => setHealCollapsed(false)}
                className="text-[10px] px-1.5 py-0.5 rounded border border-line text-fg hover:bg-raised cursor-pointer shrink-0"
              >
                Show Trace
              </button>
            </div>
          ) : (
            <HealJobCard
              running={healRunning}
              phase={healPhase}
              events={healEvents}
              error={healError}
              report={healReport}
              statuses={previewStatuses}
              applying={healApplying}
              onReview={focusHealFile}
              onOpenFile={openPreviewFile}
              onAcceptOne={p => void handleAcceptOne(p)}
              onRejectOne={p => void handleRejectOne(p)}
              onRevertOne={p => void handleRevertOne(p)}
              onAcceptAll={() => void handleAcceptAll()}
              onRejectAll={() => void handleRejectAll()}
              onRevertAll={() => void handleRevertAll()}
              onHide={() => setHealCollapsed(true)}
            />
          )
        )}

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
            (session.violations?.length || 0) > 0 ? (
              <div className="p-2.5 rounded bg-canvas border border-line-subtle text-fg-subtle text-center text-[11px]">
                Remaining violations are in the active heal panel above.
              </div>
            ) : (
              <div className="p-3 rounded bg-canvas border border-line-subtle text-emerald-400 text-center space-y-1">
                <div className="font-bold">{cyclesCount > 0 ? '✓ Zero Layer Violations' : '✓ 100% Conforming'}</div>
                <div className="text-[11px] text-fg-subtle">
                  {cyclesCount > 0 ? 'No forbidden layer rules triggered, but dependency cycles exist above.' : 'No architectural violations found.'}
                </div>
              </div>
            )
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
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {v.line_number && (
                                <span className="text-[#fecaca] text-[10px] bg-[#ef4444]/15 px-1 rounded border border-[#ef4444]/30">
                                  L:{v.line_number}
                                </span>
                              )}
                              {v.target_layer !== 'External' && v.target_layer !== 'Stdlib' && (
                                <button
                                  type="button"
                                  disabled={healRunning || auditing}
                                  onClick={e => {
                                    e.stopPropagation();
                                    void startHeal('single', `${v.source_module}->${v.target_module}`);
                                  }}
                                  title="Heal this violation in sandbox and review diff"
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 cursor-pointer disabled:opacity-40"
                                >
                                  Heal
                                </button>
                              )}
                            </div>
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
