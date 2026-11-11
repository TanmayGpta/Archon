'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EventFeed } from './EventFeed';
import { AGAI_API, type FilePatch, useAgaiSession } from './useAgaiSession';

type Session = ReturnType<typeof useAgaiSession>;

/** Archon Guard tab in the IDE's right panel: audit (ADK) → heal (CrewAI) → apply/revert, plus live trace. */
export function GuardPanel({ s, onOpenFile, onPreviewPatch }: {
  s: Session;
  onOpenFile: (path: string, line?: number | null) => void;
  onPreviewPatch: (p: FilePatch | null) => void; // shows the patch as a red/green diff in the editor
}) {
  const [prompt, setPrompt] = useState('Audit this codebase for Clean Architecture violations.');
  const [panel, setPanel] = useState<'violations' | 'patches' | 'report' | 'trace'>('violations');
  const [selectedPatch, setSelectedPatch] = useState<FilePatch | null>(null);

  const audit = s.state?.audit_result;
  const report = s.state?.healing_report;

  // Jump to the patches tab as soon as a new healing report with patches arrives
  const prevReportRef = useRef<string>('');
  useEffect(() => {
    if (report?.patches?.length) {
      const key = `${report.request_id}:${report.attempts}:${report.status}:${report.patches.length}`;
      if (prevReportRef.current !== key) {
        prevReportRef.current = key;
        setPanel('patches');
      }
    }
  }, [report]);

  const handleAudit = () => {
    setPanel('trace');
    s.audit(prompt);
  };

  const handleHeal = () => {
    setPanel('trace');
    s.heal();
  };

  const health = (s.state?.applied?.length ? s.state.audit_after_apply?.metrics.health_score : undefined)
    ?? audit?.metrics.health_score;

  return (
    <div className="flex flex-col flex-1 min-h-0 text-zinc-300">
      <div className="p-3 space-y-2 border-b border-[#161922]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-mono text-zinc-500 truncate" title={s.state?.codebase_path}>
            {s.busy === 'import' ? 'Importing from GitHub…' : s.state?.codebase_path.split(/[\\/]/).pop() ?? 'no session'}
            {s.state && <span className="text-zinc-600"> · {s.state.blueprint_id}</span>}
          </span>
          {health !== undefined && (
            <span className={`text-lg font-semibold shrink-0 ${health >= 90 ? 'text-emerald-400' : health >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
              {health.toFixed(1)}<span className="text-[11px] text-zinc-500"> / 100</span>
            </span>
          )}
        </div>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
          className="w-full text-[12px] bg-[#0b0d11] border border-[#1a1e26] rounded p-2 text-zinc-300 outline-none focus:border-sky-700 resize-none" />
        <div className="flex gap-2">
          <button disabled={!!s.busy || !s.sessionId} onClick={handleAudit}
            className="flex-1 py-1.5 rounded text-[12px] bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white">
            {s.busy === 'audit' ? 'Auditing…' : '1 · Audit (ADK)'}
          </button>
          {s.state?.healable !== false && (
            <button disabled={!!s.busy || !audit?.violations.length} onClick={handleHeal}
              className="flex-1 py-1.5 rounded text-[12px] bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white">
              {s.busy === 'heal' ? 'Healing…' : '2 · Heal (CrewAI)'}
            </button>
          )}
        </div>
        {s.state?.healable === false && (
          <div className="text-[11px] text-zinc-500">Read-only codebase: audit only. Open a project under the allowed roots, or import one from GitHub, to heal.</div>
        )}
        {s.error && <div className="text-[11px] text-rose-400 break-words">{s.error}</div>}
        {s.state?.guardrail_blocked && <div className="text-[11px] text-rose-400">Blocked: {s.state.guardrail_blocked.join('; ')}</div>}
      </div>

      <div className="flex text-[11px] border-b border-[#161922]">
        {(['violations', 'patches', 'report', 'trace'] as const).map((p) => (
          <button key={p} onClick={() => setPanel(p)}
            className={`flex-1 py-1.5 capitalize ${panel === p ? 'text-zinc-100 border-b border-sky-500' : 'text-zinc-500'}`}>
            {p}{p === 'violations' && audit ? ` (${audit.violations.length})` : ''}{p === 'patches' && report ? ` (${report.patches.length})` : ''}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3 text-[12px] space-y-2">
        {panel === 'violations' && (audit ? audit.violations.map((v) => {
          const why = s.state?.audit_narrative?.rationales.find((r) => r.violation_id === v.id);
          return (
            <button key={v.id} onClick={() => v.file_path && onOpenFile(v.file_path, v.line_number)}
              className="block w-full text-left p-2 rounded border border-[#1a1e26] hover:border-rose-800 bg-rose-950/10">
              <div className="text-rose-300 font-mono text-[11px]">{v.source_layer} → {v.target_layer} · {v.severity}</div>
              <div className="text-zinc-300 font-mono text-[11px] truncate">{v.file_path}:{v.line_number}</div>
              <div className="text-zinc-500 truncate">{v.code_snippet}</div>
              {why && <div className="text-zinc-400 mt-1">{why.prescribed_fix}</div>}
            </button>
          );
        }) : <Empty text="Run an audit to list violations." />)}

        {panel === 'patches' && (report ? (() => {
          const isApplied = !!s.state?.applied?.length;
          const cleanPath = (p?: string | null) => (p || '').replace(/\\/g, '/').replace(/^\.\//, '').trim().toLowerCase();
          const unhealedFilePaths = (s.state?.audit_after_apply?.violations ?? [])
            .map((v) => cleanPath(v.file_path))
            .filter(Boolean);

          return (
            <>
              <VerificationCard report={report} />
              {report.patches.map((p) => {
                const patchPath = cleanPath(p.path);
                const patchBase = patchPath.split('/').pop() || patchPath;
                const hasRemainingViolations = isApplied && unhealedFilePaths.some((u) => {
                  const uBase = u.split('/').pop() || u;
                  return u === patchPath || u.endsWith('/' + patchPath) || patchPath.endsWith('/' + u) || (patchBase === uBase && patchBase === 'main.py');
                });
                const isHealed = isApplied && !hasRemainingViolations;

                return (
                  <div
                    key={p.path + p.operation}
                    className={`rounded border transition-colors ${
                      hasRemainingViolations
                        ? 'border-rose-600/90 bg-rose-950/25 shadow-sm shadow-rose-950/40'
                        : isHealed
                        ? 'border-emerald-600/40 bg-emerald-950/15'
                        : selectedPatch === p
                        ? 'border-sky-600'
                        : 'border-[#1a1e26]'
                    }`}
                  >
                    <button
                      onClick={() => {
                        const next = selectedPatch === p ? null : p;
                        setSelectedPatch(next);
                        if (!s.state?.applied?.length) onPreviewPatch(next);
                        else if (next) onOpenFile(p.path);
                      }}
                      title={
                        hasRemainingViolations
                          ? 'Applied, but violations remain unresolved'
                          : s.state?.applied?.length
                          ? 'Applied: open the file to see it'
                          : 'Preview this patch in the editor'
                      }
                      className="block w-full text-left p-2 hover:bg-white/5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-mono text-[11px] truncate ${
                            hasRemainingViolations
                              ? 'text-rose-400 font-semibold'
                              : isHealed
                              ? 'text-emerald-300 font-medium'
                              : 'text-zinc-200'
                          }`}
                        >
                          {p.operation === 'create' ? '+ ' : '~ '}{p.path}
                        </span>
                        {hasRemainingViolations && (
                          <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-200 border border-rose-700/60 shrink-0">
                            Not healed
                          </span>
                        )}
                        {isHealed && (
                          <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-700/40 shrink-0">
                            Healed ✓
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          hasRemainingViolations ? 'text-rose-300/80' : 'text-zinc-500'
                        }`}
                      >
                        {p.rationale}
                      </div>
                    </button>
                    {selectedPatch === p && (
                      <PatchDiff patch={p} onOpen={() => { onPreviewPatch(null); onOpenFile(p.path); }} />
                    )}
                  </div>
                );
              })}
              <div className="flex gap-2 pt-1">
                <button disabled={!!s.busy || !report.patches.length || !!s.state?.applied?.length} onClick={() => s.apply()}
                  className="flex-1 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white">
                  {s.state?.applied?.length ? 'Applied ✓' : 'Apply all patches'}
                </button>
                <button disabled={!!s.busy || !s.state?.applied?.length} onClick={s.revert}
                  className="px-3 py-1.5 rounded border border-[#282e3a] text-zinc-300 disabled:opacity-40">Revert</button>
              </div>
            </>
          );
        })() : <Empty text="Heal to get verified patches." />)}

        {panel === 'report' && (s.sessionId ? <ReportView sid={s.sessionId} s={s} refreshKey={s.canvasKey} /> : <Empty text="No session." />)}

        {panel === 'trace' && <div className="-m-3"><EventFeed events={s.events} compact /></div>}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-zinc-600">{text}</div>;
}

function VerificationCard({ report }: { report: NonNullable<ReturnType<typeof useAgaiSession>['state']>['healing_report'] }) {
  const v = report?.verification;
  if (!report || !v) return <div className="text-rose-400">Healing {report?.status}: no verification result.</div>;
  return (
    <div className={`p-2 rounded border ${v.passed ? 'border-emerald-800 bg-emerald-950/20' : 'border-amber-800 bg-amber-950/20'}`}>
      <div className="flex justify-between">
        <span className={v.passed ? 'text-emerald-300' : 'text-amber-300'}>{report.status.toUpperCase()} · {report.attempts} attempt(s)</span>
        <span className="text-zinc-300">{v.health_before} → <b>{v.health_after}</b></span>
      </div>
      <div className="text-zinc-400 text-[11px] mt-1">
        violations {v.violations_before} → {v.violations_after} · tests {v.tests_passed ? 'pass' : 'fail'}
        {v.new_violation_ids.length > 0 && ` · new: ${v.new_violation_ids.join(', ')}`}
      </div>
      {[...v.guardrail_rejections, ...v.syntax_errors].map((r, i) => <div key={i} className="text-rose-400 text-[11px]">✕ {r}</div>)}
    </div>
  );
}

function PatchDiff({ patch, onOpen }: { patch: FilePatch; onOpen: () => void }) {
  return (
    <div className="font-mono text-[11px] leading-5 bg-[#0b0d11] border-t border-[#1a1e26] overflow-x-auto">
      <div className="flex items-center gap-2 px-2 py-1 text-zinc-500">
        <span className="truncate">{patch.violation_ids.join(', ')}</span>
        <div className="flex-1" />
        {patch.operation === 'modify' && <button onClick={onOpen} className="text-sky-400 hover:text-sky-300 shrink-0">Open file</button>}
      </div>
      {patch.operation === 'create' ? (
        <pre className="m-0 p-2 text-emerald-300 bg-emerald-950/20 whitespace-pre">{patch.content}</pre>
      ) : patch.edits.map((e, i) => (
        <div key={i} className="border-t border-[#1a1e26]">
          {e.search.split('\n').map((l, j) => <div key={'s' + j} className="px-2 bg-rose-950/30 text-rose-300 whitespace-pre">- {l}</div>)}
          {e.replace.split('\n').map((l, j) => <div key={'r' + j} className="px-2 bg-emerald-950/30 text-emerald-300 whitespace-pre">+ {l}</div>)}
        </div>
      ))}
    </div>
  );
}

function ReportView({ sid, s, refreshKey }: { sid: string; s: Session; refreshKey: number }) {
  const [md, setMd] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    fetch(`${AGAI_API}/api/agai/sessions/${sid}/report.md`)
      .then((r) => r.text())
      .then(setMd)
      .catch(() => {});
  }, [sid, refreshKey]);

  const handleDownload = () => {
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `archon-report-${sid}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full space-y-2">
      <div className="flex items-center justify-between p-2 rounded bg-[#0b0e14] border border-[#1a1f2c]">
        <div className="text-[11px] text-zinc-400 font-medium flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          <span>Report Overview</span>
        </div>
        <button
          onClick={() => setIsMaximized(true)}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-sky-300 bg-sky-950/60 hover:bg-sky-900/70 border border-sky-700/60 rounded transition-colors"
          title="Maximize report in 75% popup window"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          Maximize Report
        </button>
      </div>

      <div className="prose prose-invert prose-sm max-w-none [&_table]:text-[11px] [&_td]:border [&_td]:border-[#1a1e26] [&_td]:px-1.5 [&_td]:py-1 [&_th]:px-1.5 [&_th]:py-1 [&_th]:border [&_th]:border-[#1a1e26] [&_th]:bg-[#121620] overflow-auto flex-1">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
      </div>

      {isMaximized && (
        <MaximizedReportModal
          md={md}
          sid={sid}
          state={s.state}
          onClose={() => setIsMaximized(false)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}

function MaximizedReportModal({
  md,
  sid,
  state,
  onClose,
  onDownload,
}: {
  md: string;
  sid: string;
  state: ReturnType<typeof useAgaiSession>['state'];
  onClose: () => void;
  onDownload: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const health = (state?.applied?.length ? state.audit_after_apply?.metrics.health_score : undefined)
    ?? state?.audit_result?.metrics.health_score;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[75vw] h-[75vh] min-w-[320px] max-w-[1400px] max-h-[92vh] bg-[#0c0f17] border border-[#232b3d] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#1c2333] bg-[#0f131d] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-sky-950/60 border border-sky-800/50 text-sky-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-zinc-100 tracking-tight">Archon Conformance & Healing Report</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#161c28] text-zinc-400 border border-[#242e42]">{sid}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-zinc-400 mt-0.5">
                <span className="truncate" title={state?.codebase_path}>
                  Path: <span className="font-mono text-zinc-300">{state?.codebase_path.split(/[\\/]/).pop()}</span>
                </span>
                <span>·</span>
                <span>Blueprint: <span className="font-mono text-zinc-300">{state?.blueprint_id}</span></span>
                {health !== undefined && (
                  <>
                    <span>·</span>
                    <span className={`font-semibold ${health >= 90 ? 'text-emerald-400' : health >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                      Health: {health.toFixed(1)} / 100
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onDownload}
              className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium bg-[#1a2233] hover:bg-[#222c42] border border-[#2b3752] text-zinc-200 hover:text-white flex items-center gap-1.5 transition-colors shadow-sm"
              title="Download Markdown report"
            >
              <svg className="w-4 h-4 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Report (.md)
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#141822] hover:bg-[#202738] border border-[#222a3b] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
              title="Cancel / Close (Esc)"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Modal Body with Structured Report Typography */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#090b10]">
          <div className="max-w-5xl mx-auto prose prose-invert max-w-none
            [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-zinc-100 [&_h1]:pb-3 [&_h1]:border-b [&_h1]:border-[#202738] [&_h1]:mb-6
            [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-sky-300 [&_h2]:pt-6 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-[#192130] [&_h2]:mb-4
            [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-300 [&_h3]:mt-4 [&_h3]:mb-2
            [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_table]:rounded-lg [&_table]:overflow-hidden [&_table]:border [&_table]:border-[#22293b]
            [&_thead]:bg-[#121723] [&_th]:text-left [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-[12px] [&_th]:font-semibold [&_th]:text-zinc-300 [&_th]:border-b [&_th]:border-[#22293b]
            [&_tbody_tr]:border-b [&_tbody_tr]:border-[#181d2a] [&_tbody_tr:last-child]:border-0 [&_tbody_tr:nth-child(even)]:bg-[#0d1017] [&_tbody_tr:hover]:bg-[#141a27]
            [&_td]:px-4 [&_td]:py-2.5 [&_td]:text-[12px] [&_td]:text-zinc-300
            [&_code]:font-mono [&_code]:text-[11px] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-[#151b27] [&_code]:text-sky-300 [&_code]:border [&_code]:border-[#253045]
            [&_hr]:my-8 [&_hr]:border-t-2 [&_hr]:border-[#1e2535]
            [&_ul]:my-3 [&_ul]:pl-5 [&_li]:text-[13px] [&_li]:text-zinc-300 [&_li]:my-1
            [&_p]:text-[13px] [&_p]:leading-relaxed [&_p]:text-zinc-300 [&_p]:my-2
            [&_blockquote]:border-l-4 [&_blockquote]:border-sky-500/60 [&_blockquote]:bg-sky-950/20 [&_blockquote]:p-3 [&_blockquote]:rounded-r [&_blockquote]:italic
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
