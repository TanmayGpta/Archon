'use client';

import { useEffect, useRef, useState } from 'react';
import { AgentPipeline } from './AgentPipeline';
import type { AgentEvent } from './useAgaiSession';

const FW_COLOR: Record<AgentEvent['framework'], string> = {
  adk: 'text-sky-400',
  crewai: 'text-amber-400',
  a2a: 'text-fuchsia-400',
  guardrail: 'text-rose-400',
  gateway: 'text-zinc-500',
};

type View = 'pipeline' | 'raw';
const VIEW_KEY = 'archon.trace.view';

// Live trace: agent cards (default) or the raw callback log. The choice is remembered per browser.
export function EventFeed({ events, compact = false }: { events: AgentEvent[]; compact?: boolean }) {
  // Only ever mounted client-side (inside the IDE / a toggled sidebar), so reading storage here can't mismatch SSR.
  const [view, setView] = useState<View>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(VIEW_KEY) === 'raw' ? 'raw' : 'pipeline'; }
    catch { return 'pipeline'; }
  });
  const choose = (v: View) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ }
  };

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-1 px-2 py-1 bg-[#0a0b0e]/95 backdrop-blur border-b border-white/5">
        {(['pipeline', 'raw'] as const).map((v) => (
          <button key={v} onClick={() => choose(v)}
            className={`px-2 py-0.5 rounded text-[10.5px] ${view === v ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {v === 'pipeline' ? 'Agents' : 'Raw trace'}
          </button>
        ))}
        <span className="flex-1" />
        <span className="text-[10px] text-zinc-600 tabular-nums">{events.length} events</span>
      </div>
      {view === 'pipeline' ? <AgentPipeline events={events} /> : <RawFeed events={events} compact={compact} />}
    </div>
  );
}

function RawFeed({ events, compact }: { events: AgentEvent[]; compact: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [events.length]);

  if (!events.length) {
    return <div className="p-3 text-xs text-zinc-600">No agent activity yet. Run an audit to see the live trace.</div>;
  }
  return (
    <div className="font-mono text-[11px] leading-5 p-2 space-y-0.5">
      {events.map((e, i) => {
        const isOpen = open === i;
        const hasData = e.data && Object.keys(e.data).length > 0;
        return (
          <div key={i} className={e.kind === 'error' || e.kind === 'guardrail_block' ? 'bg-rose-950/30' : ''}>
            <button onClick={() => setOpen(isOpen ? null : i)} className="w-full flex gap-2 text-left hover:bg-white/5 rounded">
              {!compact && <span className="text-zinc-600 shrink-0">{e.ts.slice(11, 19)}</span>}
              <span className={`${FW_COLOR[e.framework]} shrink-0 w-16`}>{e.framework}</span>
              <span className="text-zinc-400 shrink-0 w-28 truncate">{e.kind}</span>
              {e.agent && <span className="text-zinc-500 shrink-0">{e.agent}</span>}
              <span className={`text-zinc-300 min-w-0 ${isOpen ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>{e.message}</span>
            </button>
            {isOpen && hasData && (
              <pre className="ml-2 mb-1 max-h-60 overflow-auto rounded bg-black/40 border border-white/5 p-2 text-[10.5px] leading-4 text-zinc-400 whitespace-pre-wrap break-all">
                {JSON.stringify(e.data, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}
