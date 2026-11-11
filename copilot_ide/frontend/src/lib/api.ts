/* ── Service base URLs ─────────────────────────────────────────
 * The one place the frontend decides where each backend lives.
 * Set NEXT_PUBLIC_API_URL / NEXT_PUBLIC_EVALUATION_API_URL / NEXT_PUBLIC_ARCGEN_API_URL to override.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function resolveServiceBase(configured: string | undefined, defaultPort: number): string {
  const base = (configured || `http://127.0.0.1:${defaultPort}`).replace(/\/+$/, '');
  if (typeof window === 'undefined') return base;

  const pageHost = window.location.hostname;
  if (!pageHost || LOOPBACK_HOSTS.has(pageHost)) return base;

  // Opened from another host (e.g. a WSL or LAN IP): a loopback URL would point at the
  // viewer's own machine, so reach the service on the host that served the page instead.
  try {
    const url = new URL(base);
    if (!LOOPBACK_HOSTS.has(url.hostname)) return base;
    url.hostname = pageHost;
    return url.origin;
  } catch {
    return base;
  }
}

/** Orchestrator gateway: RAG, workspace, agent and conformance routes. */
export const API_BASE = resolveServiceBase(process.env.NEXT_PUBLIC_API_URL, 8000);

/** Evaluation service (benchmarks and SCIP ablation runs). */
export const EVALUATION_API_BASE = resolveServiceBase(process.env.NEXT_PUBLIC_EVALUATION_API_URL, 8003);

/** ArcGen service (requirement elicitation and architecture generation). */
export const ARCGEN_API_BASE = resolveServiceBase(process.env.NEXT_PUBLIC_ARCGEN_API_URL, 8004);

/** The readable part of an error response body: FastAPI's {"detail": "..."} or the raw text. */
export function errorDetail(body: string): string {
  try {
    const detail = JSON.parse(body)?.detail;
    if (typeof detail === 'string' && detail) return /[.!?]$/.test(detail) ? detail : `${detail}.`;
  } catch {
    // not JSON
  }
  const text = body.trim().slice(0, 200);
  return text || 'The server returned an error.';
}

/** A caught value as a readable message (errors thrown by fetch, JSON parsing, or our own code). */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : String(e);
}
