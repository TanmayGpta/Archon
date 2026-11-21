import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  SimulationNodeDatum,
} from 'd3-force';

/** Layer anchor regions for natural architectural constellation. */
export const LAYER_ANCHORS: Record<string, { x: number; y: number; r: number }> = {
  Domain: { x: -70, y: 40, r: 160 },
  Application: { x: 220, y: -120, r: 240 },
  Presentation: { x: -260, y: -240, r: 180 },
  Infrastructure: { x: 240, y: 220, r: 190 },
  Observability: { x: -260, y: 240, r: 150 },
  External: { x: 400, y: 40, r: 210 },
  Stdlib: { x: -400, y: -50, r: 210 },
  Unclassified: { x: 0, y: -340, r: 120 },
};

/** Deterministic hash for subtle curve offset. */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/** Node radius in screen pixels so hubs read clearly and leaves remain visible. */
export function nodeScreenR(deg: number): number {
  return Math.min(17, 2.4 + Math.sqrt(Math.max(0, deg)) * 2.3);
}

export interface LayoutNodeInput {
  id: string;
  layer: string;
  totalDegree: number;
  x: number;
  y: number;
}

export interface LayoutEdgeInput {
  id: string;
  source: string;
  target: string;
}

export interface ForceLayoutOutput {
  positions: Array<[string, { x: number; y: number }]>;
  curves: Array<[string, { along: number; perp: number }]>;
}

interface SimPt extends SimulationNodeDatum {
  kind: 'e' | 'f';
  id?: string;
  layer?: string;
  totalDegree?: number;
}

/** Builds a steppable d3-force simulation shared between the Web Worker and main-thread fallback. */
export function createForceLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  totalTicks = 160
) {
  const realPts = new Map<string, SimPt>();
  nodes.forEach(n =>
    realPts.set(n.id, {
      kind: 'e',
      id: n.id,
      layer: n.layer,
      totalDegree: n.totalDegree,
      x: n.x,
      y: n.y,
    })
  );

  const bendPts = new Map<string, SimPt>();
  const simLinks: { source: SimPt; target: SimPt; d: number }[] = [];
  edges.forEach(e => {
    const s = realPts.get(e.source);
    const t = realPts.get(e.target);
    if (!s || !t || s === t) return;
    const h = Math.abs(hashString(e.id));
    const f: SimPt = {
      kind: 'f',
      x: (s.x! + t.x!) / 2 + ((h % 21) - 10),
      y: (s.y! + t.y!) / 2 + (((h >> 5) % 21) - 10),
    };
    bendPts.set(e.id, f);
    const half = s.totalDegree! < 6 || t.totalDegree! < 6 ? 22 : 34;
    simLinks.push({ source: s, target: f, d: half }, { source: f, target: t, d: half });
  });

  const anchorOf = (p: SimPt) => (p.layer ? LAYER_ANCHORS[p.layer] : undefined) || { x: 0, y: 0, r: 0 };
  const sim = forceSimulation<SimPt>([...realPts.values(), ...bendPts.values()])
    .alphaDecay(0.035)
    .force('link', forceLink<SimPt, { source: SimPt; target: SimPt; d: number }>(simLinks).distance(l => l.d).strength(0.35))
    .force(
      'charge',
      forceManyBody<SimPt>()
        .strength(p => (p.kind === 'e' ? -110 - Math.min(40, p.totalDegree!) * 7 : -7))
        .distanceMax(480)
    )
    .force('collide', forceCollide<SimPt>(p => (p.kind === 'e' ? nodeScreenR(p.totalDegree!) + 4 : 1.5)))
    .force('x', forceX<SimPt>(p => anchorOf(p).x * 0.35).strength(p => (p.kind === 'e' ? 0.045 : 0.01)))
    .force('y', forceY<SimPt>(p => anchorOf(p).y * 0.35).strength(p => (p.kind === 'e' ? 0.045 : 0.01)))
    .stop();

  let ticks = 0;

  const step = (maxMs: number): boolean => {
    const t0 = performance.now();
    while (ticks < totalTicks && performance.now() - t0 < maxMs) {
      sim.tick();
      ticks++;
    }
    return ticks >= totalTicks;
  };

  const finish = (): ForceLayoutOutput => {
    let meanX = 0;
    let meanY = 0;
    realPts.forEach(p => {
      meanX += p.x!;
      meanY += p.y!;
    });
    meanX /= Math.max(1, realPts.size);
    meanY /= Math.max(1, realPts.size);

    const centered = new Map<string, { x: number; y: number }>();
    const positions: Array<[string, { x: number; y: number }]> = [];
    realPts.forEach((p, id) => {
      const pos = { x: p.x! - meanX, y: p.y! - meanY };
      centered.set(id, pos);
      positions.push([id, pos]);
    });

    const curves: Array<[string, { along: number; perp: number }]> = [];
    edges.forEach(e => {
      const s = centered.get(e.source);
      const t = centered.get(e.target);
      const f = bendPts.get(e.id);
      if (!s || !t || !f) return;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len2 = dx * dx + dy * dy || 1;
      const ox = f.x! - meanX - (s.x + t.x) / 2;
      const oy = f.y! - meanY - (s.y + t.y) / 2;
      curves.push([
        e.id,
        {
          along: Math.max(-0.3, Math.min(0.3, (ox * dx + oy * dy) / len2)),
          perp: Math.max(-0.22, Math.min(0.22, (oy * dx - ox * dy) / len2)),
        },
      ]);
    });

    return { positions, curves };
  };

  const runAll = (): ForceLayoutOutput => {
    while (ticks < totalTicks) {
      sim.tick();
      ticks++;
    }
    return finish();
  };

  return { step, finish, runAll };
}
