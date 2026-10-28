"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';

// One-click Kev GPU control: status pill + panel with Start / Stop. Talks to the orchestrator's
// /api/conformance/gpu/* proxy, which forwards to the kev-agent service (pod, model, tunnel).

interface GpuStatus {
  agent: boolean;
  phase: 'ready' | 'connecting' | 'loading model' | 'pod starting' | 'starting' | 'off' | 'no agent' | string;
  reachable?: boolean;
  busy?: boolean;
  error?: string;
  hint?: string;
  remote?: { pod?: string; server?: string; forward?: string };
  log?: string[];
}

const TONE: Record<string, string> = {
  ready: '#10b981', connecting: '#f5a524', 'loading model': '#f5a524', 'pod starting': '#f5a524', starting: '#f5a524',
  off: '#8b8b86', 'no agent': '#ff3b30',
};
const BUSY = new Set(['connecting', 'loading model', 'pod starting', 'starting']);

export const GpuControl: React.FC<{ apiBase: string; offline: boolean }> = ({ apiBase, offline }) => {
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [acting, setActing] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const call = useCallback(async (method: 'GET' | 'POST', path: string) => {
    try {
      const res = await fetch(`${apiBase}/api/conformance/gpu/${path}`, { method });
      setStatus(await res.json());
    } catch {
      setStatus({ agent: false, phase: 'no agent', error: 'orchestrator unreachable' });
    }
  }, [apiBase]);

  // Poll: fast while something is starting, slow otherwise
  const phase = status?.phase || '';
  useEffect(() => {
    if (offline) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await call('GET', 'status');
      if (!stop) timer = setTimeout(tick, BUSY.has(phase) || status?.busy ? 5000 : 20000);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-arm only when the phase class changes
  }, [offline, call, BUSY.has(phase), status?.busy]);

  // Close the panel on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const act = async (path: 'start' | 'stop') => {
    setActing(true);
    await call('POST', path);
    setActing(false);
  };

  if (offline) return null;
  const tone = TONE[phase] || '#8b8b86';
  const label = !status ? 'GPU …' : phase === 'ready' ? 'GPU ready' : phase === 'off' ? 'GPU off' : phase === 'no agent' ? 'GPU agent down' : `GPU: ${phase}`;

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#2b2b2a] bg-[#141413] hover:border-[#e8ff00] text-xs font-mono text-white cursor-pointer"
        title="Kev-9B on the college GPU: start, stop, status"
      >
        <span className={`w-2 h-2 rounded-full ${BUSY.has(phase) ? 'animate-pulse' : ''}`} style={{ backgroundColor: tone }} />
        {label}
      </button>

      {open && (
        <div className="absolute right-0 sm:left-0 sm:right-auto top-9 z-50 w-[min(22rem,90vw)] bg-[#0e0e0d] border border-[#343434] rounded-lg shadow-2xl p-3 font-mono text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <b className="text-white">Kev-9B GPU server</b>
            <span style={{ color: tone }}>{phase || '…'}</span>
          </div>

          {status?.agent ? (
            <>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                {[['pod', status.remote?.pod || 'none'], ['model', status.remote?.server || '—'], ['tunnel', status.reachable ? 'up' : 'down']].map(([k, v]) => (
                  <div key={k} className="rounded bg-[#141413] border border-[#1f1f1e] py-1.5">
                    <div className="text-[#8b8b86]">{k}</div>
                    <div className="text-white">{v}</div>
                  </div>
                ))}
              </div>
              {phase === 'loading model' && (
                <p className="text-[#a0a0a0]">A fresh pod downloads the 18 GB base model first: about 15–25 min. Audits use Groq until it is ready.</p>
              )}
              {status.error && <p className="text-[#ff8a80]">{status.error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => act('start')}
                  disabled={acting || phase === 'ready' || BUSY.has(phase)}
                  className="flex-1 px-3 py-1.5 rounded bg-[#e8ff00] text-black font-bold disabled:opacity-40 cursor-pointer"
                >
                  {phase === 'ready' ? 'Running' : BUSY.has(phase) ? 'Starting…' : 'Start GPU + Kev'}
                </button>
                <button
                  onClick={() => act('stop')}
                  disabled={acting || phase === 'off'}
                  className="px-3 py-1.5 rounded border border-[#ff3b30]/50 text-[#ff8a80] hover:bg-[#ff3b30]/10 disabled:opacity-40 cursor-pointer"
                  title="Delete the pod and free the GPU slice"
                >
                  Stop
                </button>
              </div>
              {!!status.log?.length && (
                <pre className="max-h-28 overflow-y-auto bg-[#050505] border border-[#1f1f1e] rounded p-2 text-[#8b8b86] whitespace-pre-wrap">
                  {status.log.join('\n')}
                </pre>
              )}
            </>
          ) : (
            <div className="space-y-1.5 text-[#a0a0a0]">
              <p className="text-[#ff8a80]">The GPU agent is not running, so Kev cannot be started from here.</p>
              <p>{status?.hint || 'Set COMPOSE_PROFILES=gpu, CLF_HOST and KEV_SSH_DIR in copilot_ide/.env, then run docker compose up -d.'}</p>
            </div>
          )}
          <p className="text-[#5a5a58]">The pod deletes itself 8 h after it starts. Stop frees the slice sooner.</p>
        </div>
      )}
    </div>
  );
};
