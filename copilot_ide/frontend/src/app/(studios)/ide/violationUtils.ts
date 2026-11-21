import type { ViolationMarker } from './useIdeStore';

export const normPath = (p: string): string =>
  p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

const isAbsPath = (p: string): boolean =>
  p.startsWith('/') || /^[A-Za-z]:\//.test(p);

/**
 * Match a tree/tab path against a violation file path without false cross-directory matches
 * (e.g. root `main.py` must not match `backend/app/main.py`).
 */
export function pathHits(nodePath: string, rel: string): boolean {
  const n = normPath(nodePath);
  const r = normPath(rel);
  if (!n || !r) return false;
  if (n === r) return true;
  if (isAbsPath(n) !== isAbsPath(r)) {
    return n.endsWith('/' + r) || r.endsWith('/' + n);
  }
  return false;
}

const canonicalProjectPath = (raw: string): string => {
  const n = normPath(raw);
  if (!n || n === '/workspace' || n.endsWith('/Archon')) return '/workspace';
  const idx = n.indexOf('/Archon/');
  if (idx >= 0) return '/workspace/' + n.slice(idx + '/Archon/'.length);
  return n;
};

/** Ensure a conformance session's violations actually belong to the currently open IDE workspace. */
export function sessionMatchesProject(sessionTarget: string | undefined, projectPath: string): boolean {
  const s = canonicalProjectPath(sessionTarget || '');
  const p = canonicalProjectPath(projectPath || '');
  return s === p;
}

export interface RawViolationItem {
  source_file?: string;
  source_module: string;
  target_module: string;
  source_layer: string;
  target_layer: string;
  severity: string;
  reason?: string;
  line_number?: number;
}

export interface RawCycleEdge {
  id: string;
  source: string;
  target: string;
  sourceLayer: string;
  targetLayer: string;
  sourceFile?: string;
  lineNumber?: number;
  codeSnippet?: string;
  isViolation?: boolean;
  isCycle?: boolean;
}

export interface RawConformanceSession {
  violations?: RawViolationItem[];
  edges?: RawCycleEdge[];
}

export const edgeSourceFile = (edge: Pick<RawCycleEdge, 'source' | 'sourceFile'>): string =>
  edge.sourceFile || `${edge.source.replace(/\./g, '/')}.py`;

export function mapSessionMarkers(session?: RawConformanceSession | null): ViolationMarker[] {
  if (!session) return [];
  const out: ViolationMarker[] = [];

  for (const v of session.violations ?? []) {
    out.push({
      kind: 'violation',
      path: v.source_file || v.source_module,
      line: v.line_number,
      message: `${v.source_layer} → ${v.target_layer}: ${v.reason || `${v.source_module} imports ${v.target_module}`}`,
      source_layer: v.source_layer,
      target_layer: v.target_layer,
      severity: v.severity,
    });
  }

  for (const e of session.edges ?? []) {
    if (!e.isCycle) continue;
    out.push({
      kind: 'cycle',
      path: edgeSourceFile(e),
      line: e.lineNumber,
      message: `Circular dependency: ${e.source} → ${e.target}`,
      source_layer: e.sourceLayer,
      target_layer: e.targetLayer,
    });
  }

  return out;
}
