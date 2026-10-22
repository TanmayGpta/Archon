'use client';

import { useEffect, useState } from 'react';
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

  // Jump to the patches tab when a new healing report arrives (derived during render, no effect).
  const reportKey = report ? `${report.request_id}:${report.attempts}:${report.status}` : '';
  const [seenReport, setSeenReport] = useState(reportKey);
  if (reportKey !== seenReport) {
    setSeenReport(reportKey);
    if (report?.patches.length) setPanel('patches');
  }

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
          <button disabled={!!s.busy || !s.sessionId} onClick={() => s.audit(prompt)}
            className="flex-1 py-1.5 rounded text-[12px] bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white">
            {s.busy === 'audit' ? 'Auditing…' : '1 · Audit (ADK)'}
          </button>
          {s.state?.healable !== false && (
            <button disabled={!!s.busy || !audit?.violations.length} onClick={s.heal}
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

        {panel === 'patches' && (report ? (
          <>
            <VerificationCard report={report} />
            {report.patches.map((p) => (
              <div key={p.path + p.operation} className={`rounded border ${selectedPatch === p ? 'border-sky-600' : 'border-[#1a1e26]'}`}>
                <button
                  onClick={() => {
                    const next = selectedPatch === p ? null : p;
                    setSelectedPatch(next);
                    if (!s.state?.applied?.length) onPreviewPatch(next);
                    else if (next) onOpenFile(p.path);
                  }}
                  title={s.state?.applied?.length ? 'Applied: open the file to see it' : 'Preview this patch in the editor'}
                  className="block w-full text-left p-2 hover:bg-white/5">
                  <div className="font-mono text-[11px] text-zinc-200">{p.operation === 'create' ? '+ ' : '~ '}{p.path}</div>
                  <div className="text-zinc-500">{p.rationale}</div>
                </button>
                {selectedPatch === p && <PatchDiff patch={p} onOpen={() => { onPreviewPatch(null); onOpenFile(p.path); }} />}
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button disabled={!!s.busy || !report.patches.length || !!s.state?.applied?.length} onClick={() => s.apply()}
                className="flex-1 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white">
                {s.state?.applied?.length ? 'Applied ✓' : 'Apply all patches'}
              </button>
              <button disabled={!!s.busy || !s.state?.applied?.length} onClick={s.revert}
                className="px-3 py-1.5 rounded border border-[#282e3a] text-zinc-300 disabled:opacity-40">Revert</button>
            </div>
          </>
        ) : <Empty text="Heal to get verified patches." />)}

        {panel === 'report' && (s.sessionId ? <ReportView sid={s.sessionId} refreshKey={s.canvasKey} /> : <Empty text="No session." />)}

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

function ReportView({ sid, refreshKey }: { sid: string; refreshKey: number }) {
  const [md, setMd] = useState('');
  useEffect(() => {
    fetch(`${AGAI_API}/api/agai/sessions/${sid}/report.md`).then((r) => r.text()).then(setMd).catch(() => {});
  }, [sid, refreshKey]);
  return (
    <div className="prose prose-invert prose-sm max-w-none [&_table]:text-[11px] [&_td]:border [&_td]:border-[#1a1e26] [&_td]:px-1 [&_th]:px-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  );
}
