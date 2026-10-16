'use client';

import { useEffect, useRef } from 'react';
import type { AgentEvent } from './useAgaiSession';

const FW_COLOR: Record<AgentEvent['framework'], string> = {
  adk: 'text-sky-400',
  crewai: 'text-amber-400',
  a2a: 'text-fuchsia-400',
  guardrail: 'text-rose-400',
  gateway: 'text-zinc-500',
};

export function EventFeed({ events, compact = false }: { events: AgentEvent[]; compact?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [events.length]);

  if (!events.length) {
    return <div className="p-3 text-xs text-zinc-600">No agent activity yet. Run an audit to see the live trace.</div>;
  }
  return (
    <div className="font-mono text-[11px] leading-5 p-2 space-y-0.5">
      {events.map((e, i) => (
        <div key={i} className={`flex gap-2 ${e.kind === 'error' || e.kind === 'guardrail_block' ? 'bg-rose-950/30' : ''}`}>
          {!compact && <span className="text-zinc-600 shrink-0">{e.ts.slice(11, 19)}</span>}
          <span className={`${FW_COLOR[e.framework]} shrink-0 w-16`}>{e.framework}</span>
          <span className="text-zinc-400 shrink-0 w-28 truncate">{e.kind}</span>
          {e.agent && <span className="text-zinc-500 shrink-0">{e.agent}</span>}
          <span className="text-zinc-300 truncate" title={e.message}>{e.message}</span>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
