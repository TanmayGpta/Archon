'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const AGAI_API = process.env.NEXT_PUBLIC_AGAI_API_URL || 'http://127.0.0.1:8100';

export interface AgentEvent {
  session_id: string;
  framework: 'adk' | 'crewai' | 'gateway' | 'a2a' | 'guardrail';
  kind: string;
  agent?: string | null;
  message: string;
  data: Record<string, unknown>;
  ts: string;
}

export interface Violation {
  id: string;
  source_module: string;
  target_module: string;
  source_layer: string;
  target_layer: string;
  severity: string;
  reason: string;
  file_path?: string | null;
  line_number?: number | null;
  code_snippet?: string | null;
  explanation?: string | null;
  remediation?: string | null;
}

export interface AuditResult {
  codebase: string;
  blueprint_id: string;
  metrics: { health_score: number; total_edges_checked: number; total_violations: number; total_cycles: number };
  violations: Violation[];
  cycles: string[][];
}

export interface FilePatch {
  path: string;
  operation: 'modify' | 'create';
  edits: { search: string; replace: string }[];
  content?: string | null;
  violation_ids: string[];
  rationale: string;
}

export interface Verification {
  passed: boolean;
  health_before: number;
  health_after: number;
  violations_before: number;
  violations_after: number;
  resolved_violation_ids: string[];
  new_violation_ids: string[];
  syntax_errors: string[];
  guardrail_rejections: string[];
  tests_passed?: boolean | null;
  test_output: string;
}

export interface HealingReport {
  request_id: string;
  patches: FilePatch[];
  verification?: Verification | null;
  attempts: number;
  status: 'healed' | 'partial' | 'failed';
  summary_markdown: string;
}

export interface SessionState {
  session_id: string;
  codebase_path: string;
  blueprint_id: string;
  audit_result?: AuditResult | null;
  audit_narrative?: { summary: string; rationales: { violation_id: string; why_it_matters: string; prescribed_fix: string }[]; roadmap: string[] } | null;
  healing_report?: HealingReport | null;
  applied?: string[];
  audit_after_apply?: AuditResult | null;
  timings?: Record<string, number>;
  cost?: { total_usd: number; adk: { input_tokens: number; output_tokens: number; usd: number }; crewai: { input_tokens: number; output_tokens: number; usd: number } };
  guardrail_blocked?: string[];
}

type Busy = null | 'audit' | 'heal' | 'apply';

export function useAgaiSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async (sid?: string) => {
    const id = sid || sessionId;
    if (!id) return;
    const res = await fetch(`${AGAI_API}/api/agai/sessions/${id}`);
    if (res.ok) setState(await res.json());
  }, [sessionId]);

  const start = useCallback(async (codebasePath?: string, blueprintId?: string) => {
    setError(null);
    try {
      const res = await fetch(`${AGAI_API}/api/agai/sessions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codebase_path: codebasePath || null, blueprint_id: blueprintId || null }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEvents([]);
      setSessionId(data.session_id);
      await refresh(data.session_id);
    } catch (e) {
      setError(`Gateway unreachable at ${AGAI_API}: ${(e as Error).message}`);
    }
  }, [refresh]);

  // Live event stream (ADK / CrewAI / A2A / guardrail callbacks)
  useEffect(() => {
    if (!sessionId) return;
    esRef.current?.close();
    const es = new EventSource(`${AGAI_API}/api/agai/stream/${sessionId}`);
    es.onmessage = (m) => {
      const ev: AgentEvent = JSON.parse(m.data);
      setEvents((prev) => [...prev, ev]);
      if (['audit_done', 'heal_done', 'applied', 'reverted'].includes(ev.kind)) {
        setBusy(null);
        refresh(sessionId);
        setCanvasKey((k) => k + 1);
      }
      if (['tool_end', 'verification', 'a2a_result'].includes(ev.kind)) refresh(sessionId);
    };
    esRef.current = es;
    return () => es.close();
  }, [sessionId, refresh]);

  const post = useCallback(async (path: string, body: object) => {
    const res = await fetch(`${AGAI_API}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail ?? data));
    return data;
  }, []);

  const run = useCallback(async (kind: Exclude<Busy, null>, path: string, body: object) => {
    if (!sessionId) return;
    setError(null);
    setBusy(kind);
    try {
      await post(path, { session_id: sessionId, ...body });
      if (kind === 'apply') { setBusy(null); await refresh(); setCanvasKey((k) => k + 1); }
    } catch (e) {
      setBusy(null);
      setError((e as Error).message);
    }
  }, [sessionId, post, refresh]);

  return {
    sessionId, state, events, busy, error, canvasKey, start, refresh,
    audit: (prompt: string) => run('audit', '/api/agai/audit', { prompt }),
    heal: () => run('heal', '/api/agai/heal', { max_attempts: 3 }),
    apply: (paths?: string[]) => run('apply', '/api/agai/apply', { paths: paths ?? null }),
    revert: () => run('apply', '/api/agai/revert', {}),
  };
}
