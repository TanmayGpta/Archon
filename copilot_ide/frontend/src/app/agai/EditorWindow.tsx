'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeEditor } from './CodeEditor';
import { EventFeed } from './EventFeed';
import { AGAI_API, type FilePatch, useAgaiSession } from './useAgaiSession';

type Session = ReturnType<typeof useAgaiSession>;

export function EditorWindow({ s }: { s: Session }) {
  const codebase = s.state?.codebase_path;
  const [files, setFiles] = useState<string[]>([]);
  const [open, setOpen] = useState<{ path: string; content: string; original: string } | null>(null);
  const [prompt, setPrompt] = useState('Audit this codebase for Clean Architecture violations.');
  const [panel, setPanel] = useState<'violations' | 'patches' | 'report'>('violations');
  const [selectedPatch, setSelectedPatch] = useState<FilePatch | null>(null);

  const openFile = useCallback((path: string) => {
    if (!codebase) return;
    fetch(`${AGAI_API}/api/agai/file?codebase=${encodeURIComponent(codebase)}&path=${encodeURIComponent(path)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setOpen({ path: d.path, content: d.content, original: d.content }); });
  }, [codebase]);

  // Reload tree and the open file whenever the codebase changes on disk (apply / revert).
  const openPath = open?.path;
  useEffect(() => {
    if (!codebase) return;
    fetch(`${AGAI_API}/api/agai/tree?codebase=${encodeURIComponent(codebase)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setFiles(d.files); });
    if (openPath) openFile(openPath);
  }, [codebase, s.canvasKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!open || !codebase) return;
    await fetch(`${AGAI_API}/api/agai/file`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codebase, path: open.path, content: open.content }),
    });
    setOpen({ ...open, original: open.content });
  };

  const audit = s.state?.audit_result;
  const report = s.state?.healing_report;
  const markers = useMemo(() => {
    const m: Record<number, string> = {};
    audit?.violations.filter((v) => v.file_path === open?.path && v.line_number)
      .forEach((v) => { m[v.line_number!] = `${v.source_layer} → ${v.target_layer}: ${v.reason}`; });
    return m;
  }, [audit, open?.path]);

  // Jump to the patches tab when a new healing report arrives (derived during render, no effect).
  const reportKey = report ? `${report.request_id}:${report.attempts}:${report.status}` : '';
  const [seenReport, setSeenReport] = useState(reportKey);
  if (reportKey !== seenReport) {
    setSeenReport(reportKey);
    if (report?.patches.length) setPanel('patches');
  }

  const health = (s.state?.applied?.length ? s.state.audit_after_apply?.metrics.health_score : undefined)
    ?? audit?.metrics.health_score;
  const dirty = open && open.content !== open.original;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Explorer */}
      <aside className="w-56 shrink-0 border-r border-[#1a1e26] flex flex-col min-h-0">
        <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">Explorer</div>
        <div className="px-3 pb-2 text-[11px] text-zinc-400 truncate" title={codebase}>{codebase?.split(/[\\/]/).pop()}</div>
        <div className="flex-1 overflow-auto text-[12px]">
          {files.map((f) => {
            const hasV = audit?.violations.some((v) => v.file_path === f);
            return (
              <button key={f} onClick={() => openFile(f)}
                className={`block w-full text-left px-3 py-0.5 truncate hover:bg-white/5 ${open?.path === f ? 'bg-white/10 text-zinc-100' : 'text-zinc-400'}`}
                style={{ paddingLeft: 12 + (f.split('/').length - 1) * 12 }} title={f}>
                {hasV && <span className="text-rose-400 mr-1">●</span>}{f.split('/').pop()}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Editor */}
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="h-9 shrink-0 flex items-center gap-3 px-3 border-b border-[#1a1e26] text-[12px]">
          <span className="text-zinc-300 truncate">{open?.path ?? 'No file open'}{dirty ? ' •' : ''}</span>
          <div className="flex-1" />
          {dirty && <button onClick={save} className="px-2 py-0.5 rounded bg-sky-600/80 hover:bg-sky-600 text-white">Save</button>}
        </div>
        {selectedPatch ? (
          <PatchDiff patch={selectedPatch} onClose={() => setSelectedPatch(null)} />
        ) : open ? (
          <CodeEditor value={open.content} onChange={(v) => setOpen({ ...open, content: v })} markers={markers} />
        ) : (
          <div className="flex-1 grid place-items-center text-zinc-600 text-sm">Open a file from the explorer</div>
        )}
        <div className="h-40 shrink-0 border-t border-[#1a1e26] overflow-auto bg-[#0a0b0e]">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-500 sticky top-0 bg-[#0a0b0e]">Agent trace (callbacks)</div>
          <EventFeed events={s.events} />
        </div>
      </section>

      {/* Archon Guard panel */}
      <aside className="w-[380px] shrink-0 border-l border-[#1a1e26] flex flex-col min-h-0">
        <div className="p-3 space-y-2 border-b border-[#1a1e26]">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium text-zinc-200">Archon Guard</span>
            {health !== undefined && (
              <span className={`text-lg font-semibold ${health >= 90 ? 'text-emerald-400' : health >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                {health.toFixed(1)}<span className="text-[11px] text-zinc-500"> / 100</span>
              </span>
            )}
          </div>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
            className="w-full text-[12px] bg-[#0b0d11] border border-[#1a1e26] rounded p-2 text-zinc-300 outline-none focus:border-sky-700 resize-none" />
          <div className="flex gap-2">
            <button disabled={!!s.busy} onClick={() => s.audit(prompt)}
              className="flex-1 py-1.5 rounded text-[12px] bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white">
              {s.busy === 'audit' ? 'Auditing…' : '1 · Audit (ADK)'}
            </button>
            <button disabled={!!s.busy || !audit?.violations.length} onClick={s.heal}
              className="flex-1 py-1.5 rounded text-[12px] bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white">
              {s.busy === 'heal' ? 'Healing…' : '2 · Heal (CrewAI)'}
            </button>
          </div>
          {s.error && <div className="text-[11px] text-rose-400 break-words">{s.error}</div>}
          {s.state?.guardrail_blocked && <div className="text-[11px] text-rose-400">Blocked: {s.state.guardrail_blocked.join('; ')}</div>}
        </div>

        <div className="flex text-[11px] border-b border-[#1a1e26]">
          {(['violations', 'patches', 'report'] as const).map((p) => (
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
              <button key={v.id} onClick={() => v.file_path && openFile(v.file_path)}
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
                <button key={p.path + p.operation} onClick={() => setSelectedPatch(p)}
                  className={`block w-full text-left p-2 rounded border ${selectedPatch === p ? 'border-sky-600' : 'border-[#1a1e26]'} hover:border-sky-700`}>
                  <div className="font-mono text-[11px] text-zinc-200">{p.operation === 'create' ? '+ ' : '~ '}{p.path}</div>
                  <div className="text-zinc-500">{p.rationale}</div>
                </button>
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
        </div>
      </aside>
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

function PatchDiff({ patch, onClose }: { patch: FilePatch; onClose: () => void }) {
  return (
    <div className="flex-1 overflow-auto font-mono text-[12px] leading-5 bg-[#0b0d11]">
      <div className="sticky top-0 flex items-center gap-3 px-3 py-1.5 bg-[#0e1015] border-b border-[#1a1e26] text-zinc-300">
        <span>{patch.operation === 'create' ? 'New file' : 'Patch'}: {patch.path}</span>
        <span className="text-zinc-500 truncate">{patch.violation_ids.join(', ')}</span>
        <div className="flex-1" />
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">Close diff ✕</button>
      </div>
      {patch.operation === 'create' ? (
        <pre className="m-0 p-2 text-emerald-300 bg-emerald-950/20 whitespace-pre">{patch.content}</pre>
      ) : patch.edits.map((e, i) => (
        <div key={i} className="border-b border-[#1a1e26]">
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
