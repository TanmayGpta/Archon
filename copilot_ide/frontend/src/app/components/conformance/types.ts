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
}

export interface ConformanceNode {
  id: string;
  label: string;
  fullPath: string;
  layer: string;
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
}
