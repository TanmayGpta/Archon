export type LayoutMode = 'network' | 'orbit' | 'clusters' | 'flow' | 'violations';

export interface ConformanceViolation {
  source_module: string;
  target_module: string;
  source_layer: string;
  target_layer: string;
  severity: 'minor' | 'major' | 'critical' | string;
  reason: string;
  line_number?: number;
  code_snippet?: string;
  explanation?: string;
  remediation?: string;
  source_file?: string;
  trace?: ViolationTrace | null;
}

// One allow rule of the blueprint, with the ArcGen edges it was compiled from
export interface TraceRule {
  source: string;
  target: string;
  arcgenEdges: string[];
  justification: string;
  requirements: string[];
}

// Blueprint context for a violation: the allowed route between the two groups, or (when there is
// none) everything the source group may depend on
export interface ViolationTrace {
  kind: 'indirect_route' | 'allowed_from_source';
  route: string[] | null;
  rules: TraceRule[];
  fromArcgen: boolean;
}

export interface ConformanceNode {
  id: string;
  label: string;
  fullPath: string;
  layer: string;
  // How an internal file got its group (absent for stdlib / external)
  mappedBy?: 'pattern' | 'classifier' | 'unclassified' | null;
  nodeType: 'internal' | 'stdlib' | 'external';
  color: string;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
  violationsCount: number;
  isCycle: boolean;
  radius: number;
  // Physics & Simulation coordinates
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  targetX?: number;
  targetY?: number;
  orbitAngle?: number;
  orbitRadius?: number;
  ph?: number;
}

export interface ConformanceEdge {
  id: string;
  source: string;
  target: string;
  sourceLayer: string;
  targetLayer: string;
  lineNumber?: number;
  codeSnippet?: string;
  isViolation: boolean;
  isCycle: boolean;
  severity: string;
  violation?: ConformanceViolation;
}

export interface ConformanceMetrics {
  healthScore: number;
  // % of the codebase's own files mapped to a blueprint group (older snapshots lack these)
  coverage?: number;
  classifiedModules?: number;
  unclassifiedModules?: number;
  checkedDependencies?: number;
  excludedDependencies?: number;
  totalModules: number;
  internalModules: number;
  stdlibModules: number;
  externalModules: number;
  totalDependencies: number;
  totalViolations: number;
  cyclesCount: number;
  layerDistribution: Record<string, number>;
}

export interface LayerInfo {
  name: string;
  color: string;
  count: number;
}

export interface BlueprintInfo {
  id: string;
  name: string;
  description: string;
  // shared_fixtures (built-in) | arcgen_synthesis | custom (imported)
  source?: string;
  // Only on the audited blueprint: layer order and allowed [source, target] layer pairs
  layers?: string[];
  allowed?: [string, string][];
}

export interface ConformanceAuditResult {
  status: string;
  targetPath: string;
  blueprint: BlueprintInfo;
  metrics: ConformanceMetrics;
  nodes: ConformanceNode[];
  edges: ConformanceEdge[];
  violations: ConformanceViolation[];
  cycles: string[][];
  layers: LayerInfo[];
  availableBlueprints: BlueprintInfo[];
  // Which classifier labelled the modules no blueprint pattern matched (absent in older snapshots)
  classifier?: { requested: string; used: string; detail: string };
}

export type ClassifierId = 'heuristic' | 'kev-precise' | 'kev-efficient';
