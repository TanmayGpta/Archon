import type { JuryEvent } from '@/app/components/JuryPanel';

export type LiveChannel = 'PHASE_B' | 'TOOL' | 'VALIDATOR' | 'ADK_JURY' | 'TALLY' | 'ROUTER' | 'SYSTEM';
export type StageStatus = 'idle' | 'running' | 'tool_call' | 'retrying' | 'passed' | 'done' | 'error';

export interface BackendTraceEvent {
  type: 'trace';
  offset_ms?: number;
  channel: string;
  agent: string;
  hook: string;
  message: string;
  level?: 'info' | 'success' | 'warn' | 'error';
  agent_id?: string;
  status?: StageStatus;
  tool?: {
    name: string;
    kind: string;
    caller: string;
    args: string;
    latency_ms: number;
    summary: string;
  };
  state?: Record<string, unknown>;
}

export type StreamEvent = JuryEvent | BackendTraceEvent;

export interface LiveLogEntry {
  id: string;
  offsetMs: number;
  channel: LiveChannel;
  agent: string;
  hook: string;
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface LiveToolCall {
  id: string;
  offsetMs: number;
  name: string;
  kind: string;
  caller: string;
  args: string;
  latencyMs: number;
  summary: string;
}

export interface LiveAgentCard {
  id: string;
  name: string;
  group: 'pipeline' | 'juror';
  role: string;
  status: StageStatus;
  action: string;
  seconds?: number;
}

export interface LiveJobStateSnapshot {
  job_id: string;
  kind: 'jury' | 'plain';
  project_name: string;
  round: number;
  generator_models: string;
  requirements: string;
  style: string;
  nodes: string;
  edges: string;
  orphans: string;
  coverage_pct: string;
  excluded_families: string;
  cp1: string;
  cp2: string;
  verdict: string;
  trace_path: string;
}

export interface LiveObservabilityState {
  jobId: string;
  kind: 'jury' | 'plain';
  running: boolean;
  startedAt: number;
  endedAt?: number;
  elapsedMs: number;
  stageLabel: string;
  error?: string;
  logs: LiveLogEntry[];
  tools: LiveToolCall[];
  agents: LiveAgentCard[];
  state: LiveJobStateSnapshot;
}

const BASE_AGENTS: LiveAgentCard[] = [
  { id: 'normalizer', name: 'SRS Normalizer', group: 'pipeline', role: 'Phase B · ISO 25010', status: 'idle', action: 'Queued' },
  { id: 'atam', name: 'ATAM Pattern Matcher', group: 'pipeline', role: 'Deterministic · 20 patterns', status: 'idle', action: 'Queued' },
  { id: 'nodes', name: 'Node Generator', group: 'pipeline', role: 'Pass 1 · Components', status: 'idle', action: 'Queued' },
  { id: 'edges', name: 'Edge Generator', group: 'pipeline', role: 'Pass 2 · Connections & Tools', status: 'idle', action: 'Queued' },
  { id: 'validator', name: 'Graph Validator', group: 'pipeline', role: 'Deterministic · Citations/Orphans', status: 'idle', action: 'Queued' },
  { id: 'jury', name: 'ADK ParallelAgent Jury', group: 'pipeline', role: 'Google ADK · Blind Panel', status: 'idle', action: 'Awaiting draft' },
  { id: 'tally', name: 'Deterministic Tally', group: 'pipeline', role: 'Python Majority & Router', status: 'idle', action: 'Awaiting verdicts' },
];

export function initialLiveObservability(jobId: string, kind: 'jury' | 'plain'): LiveObservabilityState {
  const now = Date.now();
  return {
    jobId,
    kind,
    running: true,
    startedAt: now,
    elapsedMs: 0,
    stageLabel: `Connected to ArcGen job ${jobId} (SSE stream live)…`,
    logs: [
      {
        id: 'log-0',
        offsetMs: 0,
        channel: 'SYSTEM',
        agent: 'ArcGen Service',
        hook: 'POST /api/arcgen/jobs',
        message: `Started real backend job ${jobId} (mode=${kind}). Listening to SSE stream…`,
        level: 'info',
      },
    ],
    tools: [],
    agents: BASE_AGENTS.map(a => ({ ...a })),
    state: {
      job_id: jobId,
      kind,
      project_name: '—',
      round: 1,
      generator_models: '—',
      requirements: '—',
      style: '—',
      nodes: '—',
      edges: '—',
      orphans: '—',
      coverage_pct: '—',
      excluded_families: '—',
      cp1: '—',
      cp2: '—',
      verdict: 'running',
      trace_path: '—',
    },
  };
}

function normalizeChannel(ch: string): LiveChannel {
  const valid: LiveChannel[] = ['PHASE_B', 'TOOL', 'VALIDATOR', 'ADK_JURY', 'TALLY', 'ROUTER', 'SYSTEM'];
  return (valid.includes(ch as LiveChannel) ? ch : 'SYSTEM') as LiveChannel;
}

function upsertAgent(agents: LiveAgentCard[], patch: LiveAgentCard): LiveAgentCard[] {
  const idx = agents.findIndex(a => a.id === patch.id);
  if (idx === -1) return [...agents, patch];
  const next = [...agents];
  next[idx] = { ...next[idx], ...patch };
  return next;
}

function updateAgentStatus(
  agents: LiveAgentCard[],
  id: string,
  status: StageStatus,
  action: string,
  seconds?: number,
): LiveAgentCard[] {
  return agents.map(a => (a.id === id ? { ...a, status, action, seconds: seconds ?? a.seconds } : a));
}

export function liveObservabilityReducer(
  prev: LiveObservabilityState,
  event: StreamEvent,
): LiveObservabilityState {
  const elapsedMs = Date.now() - prev.startedAt;
  const pushLog = (
    channel: LiveChannel,
    agent: string,
    hook: string,
    message: string,
    level: 'info' | 'success' | 'warn' | 'error' = 'info',
    offsetOverride?: number,
  ): LiveLogEntry[] => [
    ...prev.logs,
    {
      id: `log-${prev.logs.length + 1}`,
      offsetMs: offsetOverride ?? elapsedMs,
      channel,
      agent,
      hook,
      message,
      level,
    },
  ];

  if (event.type === 'trace') {
    const offsetMs = typeof event.offset_ms === 'number' ? event.offset_ms : elapsedMs;
    const ch = normalizeChannel(event.channel);
    let agents = prev.agents;
    if (event.agent_id && event.status) {
      agents = updateAgentStatus(agents, event.agent_id, event.status, event.message);
    }
    const tools = event.tool
      ? [
          ...prev.tools,
          {
            id: `tool-${prev.tools.length + 1}`,
            offsetMs,
            name: event.tool.name,
            kind: event.tool.kind,
            caller: event.tool.caller,
            args: event.tool.args,
            latencyMs: event.tool.latency_ms,
            summary: event.tool.summary,
          },
        ]
      : prev.tools;
    const nextState = { ...prev.state };
    if (event.state) {
      for (const [k, v] of Object.entries(event.state)) {
        if (k === 'generator_models' && Array.isArray(v)) nextState.generator_models = v.join(', ');
        else if (k === 'round' && typeof v === 'number') nextState.round = v;
        else if (k in nextState) (nextState as Record<string, unknown>)[k] = String(v);
      }
    }
    return {
      ...prev,
      elapsedMs: Math.max(prev.elapsedMs, offsetMs),
      logs: pushLog(ch, event.agent, event.hook, event.message, event.level ?? 'info', offsetMs),
      tools,
      agents,
      state: nextState,
    };
  }

  switch (event.type) {
    case 'stage':
      return {
        ...prev,
        elapsedMs,
        stageLabel: event.message,
        logs: pushLog('SYSTEM', 'Pipeline', 'stage', event.message),
      };

    case 'panel': {
      let agents = updateAgentStatus(
        prev.agents,
        'jury',
        'running',
        `Sitting ${event.checkpoint} (attempt ${event.attempt}) · ${event.jurors.length} jurors`,
      );
      for (const seat of event.jurors) {
        agents = upsertAgent(agents, {
          id: `juror:${seat.seat}`,
          name: `${seat.seat} · ${seat.model}`,
          group: 'juror',
          role: `ADK LlmAgent · family=${seat.family}`,
          status: 'running',
          action: `Judging ${event.checkpoint} (attempt ${event.attempt})…`,
        });
      }
      const replacedText = event.replaced?.length
        ? ` · swapped ${event.replaced.map(r => `${r.model} → ${r.by}`).join(', ')}`
        : '';
      return {
        ...prev,
        elapsedMs,
        stageLabel: `ADK Bias Jury judging ${event.checkpoint} (${event.jurors.length} jurors)`,
        agents,
        state: {
          ...prev.state,
          excluded_families: event.excluded_families.join(', ') || 'none',
        },
        logs: pushLog(
          'ADK_JURY',
          'ADK ParallelAgent',
          `panel.${event.checkpoint}`,
          `Seated ${event.jurors.length} juror(s) for ${event.checkpoint} attempt ${event.attempt}${replacedText}.`,
        ),
      };
    }

    case 'verdict': {
      const v = event.verdict;
      const jurorId = `juror:${v.juror}`;
      const passedCount = v.answers.filter(a => a.passed).length;
      const failedCount = v.answers.filter(a => !a.passed && a.counted).length;
      const status: StageStatus = !v.ok ? 'error' : failedCount > 0 ? 'retrying' : 'passed';
      const action = !v.ok
        ? `Abstained: ${v.error ?? 'unusable output'}`
        : `${event.checkpoint}: ${passedCount} yes, ${failedCount} no (${v.seconds.toFixed(1)}s)`;
      const agents = upsertAgent(prev.agents, {
        id: jurorId,
        name: `${v.juror} · ${v.model}`,
        group: 'juror',
        role: `ADK LlmAgent · family=${v.family}`,
        status,
        action,
        seconds: v.seconds,
      });
      const cites = v.answers.flatMap(a => a.cited).filter(Boolean).slice(0, 6);
      const citeNote = cites.length ? ` · cited [${cites.join(', ')}]` : '';
      return {
        ...prev,
        elapsedMs,
        agents,
        logs: pushLog(
          'ADK_JURY',
          `${v.juror} (${v.model})`,
          `verdict.${event.checkpoint}`,
          v.ok
            ? `${v.model} returned ${passedCount} yes / ${failedCount} no on ${event.checkpoint} in ${v.seconds.toFixed(1)}s${citeNote}.`
            : `${v.model} abstained on ${event.checkpoint} (${v.seconds.toFixed(1)}s): ${v.error ?? 'error'}`,
          !v.ok ? 'warn' : failedCount > 0 ? 'warn' : 'success',
        ),
      };
    }

    case 'checkpoint': {
      const r = event.result;
      const key = r.checkpoint === 'normalization' ? 'cp1' : 'cp2';
      return {
        ...prev,
        elapsedMs,
        agents: updateAgentStatus(
          prev.agents,
          'tally',
          r.passed ? 'passed' : 'retrying',
          `${r.checkpoint} ${r.passed ? 'PASSED' : 'FAILED'} (${r.voting_jurors} voters)`,
        ),
        state: {
          ...prev.state,
          [key]: `${r.passed ? 'PASS' : 'FAIL'} (${r.voting_jurors} voters)`,
        },
        logs: pushLog(
          'TALLY',
          'Deterministic Tally',
          `checkpoint.${r.checkpoint}`,
          `${r.checkpoint} attempt ${r.attempt}: ${r.passed ? 'PASSED' : 'FAILED'} (${r.voting_jurors} voting jurors)${r.routes.length ? ` · routes: ${r.routes.join(', ')}` : ''}.`,
          r.passed ? 'success' : 'warn',
        ),
      };
    }

    case 'iteration': {
      const rec = event.record;
      return {
        ...prev,
        elapsedMs,
        state: {
          ...prev.state,
          project_name: rec.graph.project_name || prev.state.project_name,
          round: rec.version,
          style: rec.style,
          nodes: String(rec.graph.nodes.length),
          edges: String(rec.graph.edges.length),
        },
        logs: pushLog(
          'ROUTER',
          'ArcGen Generator',
          `iteration.v${rec.version}`,
          `Published draft v${rec.version} (${rec.style}): ${rec.graph.nodes.length} nodes, ${rec.graph.edges.length} edges (reason: ${rec.reason}).`,
          'info',
        ),
      };
    }

    case 'complete': {
      const verdict = event.result?.jury?.verdict ?? 'DONE';
      return {
        ...prev,
        running: false,
        endedAt: Date.now(),
        elapsedMs,
        stageLabel: `Complete · verdict=${verdict}`,
        state: {
          ...prev.state,
          verdict,
          project_name: event.result.project_name || prev.state.project_name,
          style: event.result.style || prev.state.style,
          nodes: String(event.result.nodes?.length ?? prev.state.nodes),
          edges: String(event.result.edges?.length ?? prev.state.edges),
        },
        logs: pushLog(
          'SYSTEM',
          'ArcGen Service',
          'sse.complete',
          `Job ${prev.jobId} completed in ${(elapsedMs / 1000).toFixed(1)}s (verdict: ${verdict}).`,
          verdict === 'PASS' || verdict === 'DONE' ? 'success' : 'warn',
        ),
      };
    }

    case 'error':
      return {
        ...prev,
        running: false,
        endedAt: Date.now(),
        elapsedMs,
        error: event.detail,
        stageLabel: `Error: ${event.detail}`,
        logs: pushLog('SYSTEM', 'ArcGen Service', 'sse.error', event.detail, 'error'),
      };

    default:
      return prev;
  }
}
