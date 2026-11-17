/* ── Service base URLs ─────────────────────────────────────────
 * The one place the frontend decides where each backend lives.
 * Set NEXT_PUBLIC_API_URL / NEXT_PUBLIC_EVALUATION_API_URL / NEXT_PUBLIC_ARCGEN_API_URL to override.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function resolveServiceBase(configured: string | undefined, defaultPort: number): string {
  // If explicitly configured, respect it (and upgrade to https if page is loaded on https)
  if (configured && configured.trim() !== '') {
    const clean = configured.trim().replace(/\/+$/, '');
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && clean.startsWith('http://') && !LOOPBACK_HOSTS.has(new URL(clean).hostname)) {
      return clean.replace(/^http:\/\//, 'https://');
    }
    return clean;
  }

  if (typeof window === 'undefined') return `http://127.0.0.1:${defaultPort}`;

  const pageHost = window.location.hostname;
  const isLoopback = !pageHost || LOOPBACK_HOSTS.has(pageHost);

  // If running locally (localhost / loopback), use local ports
  if (isLoopback) {
    return `http://127.0.0.1:${defaultPort}`;
  }

  // If opened on LAN IP (e.g. 192.168.x.x or 10.x.x.x), use same host with defaultPort
  const isPrivateIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(pageHost);
  if (isPrivateIp) {
    const proto = window.location.protocol;
    return `${proto}//${pageHost}:${defaultPort}`;
  }

  // On remote cloud domains (e.g. azurecontainerapps.io or custom domains):
  // Never construct arbitrary unexposed ports like :8003 or insecure http:// URLs!
  if (defaultPort === 8003) {
    return '';
  }

  return window.location.origin;
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
