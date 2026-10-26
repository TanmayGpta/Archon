/* -- Backend service health ------------------------------------------
 * The browser can reach two services directly: the orchestrator (:8000),
 * whose /health also reports RAG, ingestion and Ollama, and the evaluation
 * service (:8003). ArcGen and conformance are routes inside the orchestrator.
 * This module turns those two replies into one row per service plus an
 * overall level; fetching lives in the component.
 */

export type ServiceState = 'up' | 'down' | 'unknown';

export interface Probe {
  ok: boolean;
  ms?: number;
  body?: unknown;
}

export interface ServiceRow {
  id: string;
  name: string;
  port: number;
  state: ServiceState;
  latencyMs?: number;
  version?: string;
  note?: string;
}

export type HealthLevel = 'checking' | 'ok' | 'degraded' | 'down';

const field = (body: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), body);

const version = (body: unknown) => {
  const v = field(body, 'version');
  return typeof v === 'string' ? v : undefined;
};

export function serviceRows(orchestrator: Probe | null, evaluation: Probe | null): ServiceRow[] {
  const viaOrchestrator = (key: string): ServiceState => {
    if (!orchestrator) return 'unknown';
    if (!orchestrator.ok) return 'unknown';
    const v = field(orchestrator.body, 'services', key);
    return v === true ? 'up' : v === false ? 'down' : 'unknown';
  };
  const direct = (p: Probe | null): ServiceState => (!p ? 'unknown' : p.ok ? 'up' : 'down');
  const relayNote = orchestrator && !orchestrator.ok ? 'Checked through the orchestrator, which is down' : undefined;

  return [
    { id: 'orchestrator', name: 'Orchestrator', port: 8000, state: direct(orchestrator), latencyMs: orchestrator?.ok ? orchestrator.ms : undefined, version: version(orchestrator?.body) },
    { id: 'rag', name: 'RAG', port: 8001, state: viaOrchestrator('rag_service'), note: relayNote },
    { id: 'ingestion', name: 'Ingestion', port: 8002, state: viaOrchestrator('ingestion_service'), note: relayNote },
    { id: 'evaluation', name: 'Evaluation', port: 8003, state: direct(evaluation), latencyMs: evaluation?.ok ? evaluation.ms : undefined, version: version(evaluation?.body) },
    { id: 'arcgen', name: 'ArcGen & Conformance', port: 8000, state: direct(orchestrator), note: 'Routes inside the orchestrator' },
    { id: 'ollama', name: 'Ollama', port: 11434, state: viaOrchestrator('ollama_gpu'), note: relayNote ?? 'Local models; cloud models still work without it' },
  ];
}

export function healthLevel(rows: ServiceRow[]): { level: HealthLevel; label: string } {
  const orchestrator = rows.find(r => r.id === 'orchestrator');
  if (!orchestrator || orchestrator.state === 'unknown') return { level: 'checking', label: 'Checking services' };
  if (orchestrator.state === 'down') return { level: 'down', label: 'Backend offline' };
  const down = rows.filter(r => r.state === 'down').length;
  if (down === 0) return { level: 'ok', label: 'All services up' };
  return { level: 'degraded', label: `${down} ${down === 1 ? 'service' : 'services'} down` };
}
