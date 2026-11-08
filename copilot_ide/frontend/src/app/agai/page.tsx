'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConformanceStudio } from '../components/conformance/ConformanceStudio';
import { VSCodeAgentIDE, type IdeHandle, type IdeMarker, type IdeProject } from '../components/ide/VSCodeAgentIDE';
import { EventFeed } from './EventFeed';
import { GuardPanel } from './GuardPanel';
import { AGAI_API, type FilePatch, useAgaiSession } from './useAgaiSession';

// The full Archon IDE (explorer, tabs, terminal, agent chat, GitHub open) talks to the orchestrator;
// Archon Guard (audit/heal/apply) talks to the AGAI gateway.
const IDE_API = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_AGAI_API_URL || 'http://127.0.0.1:8100';

type Win = 'editor' | 'conformance';
type Builtin = { label: string; path: string; blueprint_id: string; paths: string[] };

export default function ArchonGuardPage() {
  const s = useAgaiSession();
  const [win, setWin] = useState<Win>('editor');
  const [showTrace, setShowTrace] = useState(false);
  // Conformance (graph fetch + loading animation) mounts on first open, then stays mounted to keep its camera.
  const [conformanceOpened, setConformanceOpened] = useState(false);
  if (win === 'conformance' && !conformanceOpened) setConformanceOpened(true);
  const [models, setModels] = useState<string[]>(['gemma3:4b']);
  const [selectedModel, setSelectedModel] = useState('gemma3:4b');
  const ide = useRef<IdeHandle | null>(null);
  const guardedPath = useRef<string | null>(null);
  // Built-ins (Archon, e-commerce demo) come from the gateway; the IDE mounts once they've loaded (or failed)
  // so it opens Archon by default instead of the orchestrator's last project.
  const [builtins, setBuiltins] = useState<Builtin[] | null>(null);

  useEffect(() => {
    fetch(`${IDE_API}/api/models`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.models?.length) { setModels(d.models); setSelectedModel(d.models[0]); }
    }).catch(() => {});
    fetch(`${AGAI_API}/api/agai/builtins`).then((r) => (r.ok ? r.json() : [])).catch(() => []).then(setBuiltins);
  }, []);

  // Violations of the current audit (post-apply audit once patches are applied), painted into the IDE.
  const markers = useMemo<IdeMarker[]>(() => {
    const a = (s.state?.applied?.length ? s.state.audit_after_apply : null) ?? s.state?.audit_result;
    return (a?.violations ?? []).filter((v) => v.file_path).map((v) => ({
      path: v.file_path!, line: v.line_number,
      message: `${v.source_layer} → ${v.target_layer} (${v.severity}): ${v.reason || v.target_module}`,
    }));
  }, [s.state]);

  // Whatever the IDE opens becomes the guarded codebase. GitHub repos are cloned locally first,
  // because audit / sandbox verification / apply all need real files; the IDE then switches to the clone.
  const onProjectChange = useCallback(async (p: IdeProject) => {
    if (p.kind === 'github') {
      const local = await s.importGitHub(p.repo, p.branch, p.token);
      // A Dockerised orchestrator reports container paths and needs the clone's container path too.
      const dockerised = /^\/(workspace|archon|mnt)\//.test(`${guardedPath.current}/`);
      if (local) ide.current?.openProject(dockerised ? local.container_path : local.codebase_path);
      return;
    }
    if (p.path === guardedPath.current) return;
    guardedPath.current = p.path;
    s.start(p.path);
  }, [s.importGitHub, s.start]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proposed patch shown as a red/green diff in the editor. Tagged with canvasKey so it lapses
  // automatically once an apply/revert/audit changes the files.
  const [previewState, setPreviewState] = useState<{ p: FilePatch; key: number } | null>(null);
  const preview = previewState?.key === s.canvasKey ? previewState.p : null;
  const setPreview = useCallback((p: FilePatch | null) => setPreviewState(p ? { p, key: s.canvasKey } : null), [s.canvasKey]);

  // Healing patches and reverts write to disk behind the IDE's back; pull them into the open tabs.
  useEffect(() => { ide.current?.reload(); }, [s.canvasKey]);

  const openFile = useCallback((path: string, line?: number | null) => {
    setWin('editor');
    setPreview(null);
    ide.current?.openFile(path, line);
  }, [setPreview]);

  const previewPatch = useCallback((p: FilePatch | null) => {
    if (p) setWin('editor');
    setPreview(p);
  }, [setPreview]);

  // Copilot-style review: when healing finishes, open the first patch as an inline diff; Accept/Reject steps
  // through the files, and once every file is decided the accepted ones are applied in one verified batch.
  const report = s.state?.healing_report;
  const reportKey = report ? `${report.request_id}:${report.attempts}:${report.status}` : '';
  const reviewing = !!report?.patches.length && !s.state?.applied?.length;
  const [decisions, setDecisions] = useState<{ key: string; d: Record<string, boolean> }>({ key: '', d: {} });
  const decided = decisions.key === reportKey ? decisions.d : {};

  useEffect(() => {
    if (reviewing && report) previewPatch(report.patches[0]);
  }, [reportKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = (p: FilePatch, accept: boolean) => {
    if (!report) return;
    const d = { ...decided, [p.path]: accept };
    setDecisions({ key: reportKey, d });
    const next = report.patches.find((q) => !(q.path in d));
    if (next) { previewPatch(next); return; }
    setPreview(null);
    const accepted = report.patches.filter((q) => d[q.path]).map((q) => q.path);
    if (accepted.length) s.apply(accepted);
  };

  const acceptAll = () => {
    if (!report) return;
    setPreview(null);
    const paths = report.patches.filter((q) => decided[q.path] !== false).map((q) => q.path);
    if (paths.length) s.apply(paths);
  };

  const patchActions = (p: { path: string }) => {
    const idx = report ? report.patches.findIndex((q) => q.path === p.path) : -1;
    if (!reviewing || s.busy || idx < 0 || report!.patches[idx].path in decided) return null;
    return {
      label: `File ${idx + 1} of ${report!.patches.length}${report!.status === 'healed' ? '' : ` · verification ${report!.status}`}`,
      onAccept: () => decide(report!.patches[idx], true),
      onReject: () => decide(report!.patches[idx], false),
      onAcceptAll: report!.patches.length > 1 ? acceptAll : undefined,
    };
  };
  // Explorer: diff on open while under review, green "M" on patched files (rejected ones drop out).
  const pendingPatches = reviewing ? report!.patches.filter((q) => decided[q.path] !== false) : [];
  const modifiedPaths = reviewing ? pendingPatches.map((q) => q.path) : (s.state?.applied ?? []);

  return (
    <div className="h-screen flex flex-col bg-[#08090a] text-zinc-300">
      <header className="h-10 shrink-0 flex items-center gap-1 px-3 border-b border-[#1a1e26]">
        <span className="text-[13px] font-semibold text-zinc-100 mr-4">Archon Guard</span>
        {([['editor', 'Code Editor'], ['conformance', 'Conformance']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setWin(id)}
            className={`px-3 py-1 rounded text-[12px] ${win === id ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[11px] text-zinc-600 font-mono">
          {s.sessionId ?? 'no session'}{s.state?.cost ? ` · $${s.state.cost.total_usd.toFixed(4)}` : ''}
        </span>
        <button onClick={() => s.start(s.state?.codebase_path ?? guardedPath.current ?? undefined, s.state?.blueprint_id)}
          className="ml-2 text-[11px] text-zinc-500 hover:text-zinc-200">New session</button>
      </header>

      {/* Both windows stay mounted so state (open tabs, terminals, canvas camera) survives tab switches. */}
      <main className={`flex-1 min-h-0 ${win === 'editor' ? 'flex' : 'hidden'}`}>
        {builtins ? (
          <VSCodeAgentIDE
            apiBase={IDE_API}
            models={models}
            setModels={setModels}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            onProjectChange={onProjectChange}
            ideRef={ide}
            markers={markers}
            builtinProjects={builtins}
            defaultProject={builtins[0]}
            patchPreview={preview}
            patchActions={patchActions}
            pendingPatches={pendingPatches}
            modifiedPaths={modifiedPaths}
            onClosePreview={() => setPreview(null)}
            extraPanel={{ label: 'Archon Guard', node: <GuardPanel s={s} onOpenFile={openFile} onPreviewPatch={previewPatch} /> }}
          />
        ) : <div className="p-4 text-[12px] text-zinc-500">Loading workspace…</div>}
      </main>
      <main className={`flex-1 min-h-0 relative ${win === 'conformance' ? 'flex' : 'hidden'}`}>
        <div className="flex-1 min-w-0 relative">
          {/* Defaults to the guarded project (Archon unless you open something else); no session → Archon snapshot. */}
          {conformanceOpened && <ConformanceStudio key={`${s.canvasKey}:${s.state?.codebase_path ?? ''}`} apiBase={AGAI_API}
            initialPath={s.state?.codebase_path} initialBlueprintId={s.state?.blueprint_id}
            presets={(builtins ?? []).map((b) => ({ label: b.label, path: b.path, blueprintId: b.blueprint_id }))} />}
          {!s.state && s.error && (
            <div className="absolute bottom-3 left-3 max-w-[520px] p-2 rounded bg-black/80 border border-rose-900 text-[11px] text-rose-300">
              {s.error} · Gateway: <code>uvicorn archon_agai.gateway:app --port 8100</code>
            </div>
          )}
        </div>
        <aside className={`${showTrace ? 'w-[420px]' : 'w-8'} shrink-0 border-l border-[#1a1e26] bg-[#0a0b0e] flex flex-col min-h-0 transition-all`}>
          <button onClick={() => setShowTrace(!showTrace)} className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 py-1.5 text-left">
            {showTrace ? 'Live diagnostics ⟩' : '⟨'}
          </button>
          {showTrace && <div className="flex-1 overflow-auto"><EventFeed events={s.events} compact /></div>}
        </aside>
      </main>
    </div>
  );
}
