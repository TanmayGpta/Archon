'use client';

import { useEffect, useState } from 'react';
import { ConformanceStudio } from '../components/conformance/ConformanceStudio';
import { EditorWindow } from './EditorWindow';
import { EventFeed } from './EventFeed';
import { AGAI_API, useAgaiSession } from './useAgaiSession';

type Win = 'editor' | 'conformance';

export default function ArchonGuardPage() {
  const s = useAgaiSession();
  const [win, setWin] = useState<Win>('editor');
  const [showTrace, setShowTrace] = useState(true);

  useEffect(() => { s.start(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          {s.sessionId ?? 'connecting…'}{s.state?.cost ? ` · $${s.state.cost.total_usd.toFixed(4)}` : ''}
        </span>
        <button onClick={() => s.start(s.state?.codebase_path, s.state?.blueprint_id)}
          className="ml-2 text-[11px] text-zinc-500 hover:text-zinc-200">New session</button>
      </header>

      {s.error && !s.sessionId && (
        <div className="p-4 text-[12px] text-rose-400">
          {s.error}<br />Start it with: <code className="text-zinc-300">uvicorn archon_agai.gateway:app --port 8100</code>
        </div>
      )}

      {/* Both windows stay mounted so state (open file, canvas camera) survives tab switches. */}
      <main className={`flex-1 min-h-0 ${win === 'editor' ? 'flex' : 'hidden'}`}>
        <EditorWindow s={s} />
      </main>
      <main className={`flex-1 min-h-0 relative ${win === 'conformance' ? 'flex' : 'hidden'}`}>
        <div className="flex-1 min-w-0 relative">
          {s.state && (
            <ConformanceStudio key={s.canvasKey} apiBase={AGAI_API}
              initialPath={s.state.codebase_path} initialBlueprintId={s.state.blueprint_id} />
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
