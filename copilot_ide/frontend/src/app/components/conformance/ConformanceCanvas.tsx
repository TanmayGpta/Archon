"use client";

import React, { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react';

// The intro plays every time the studio opens (click or Esc skips it; reduced motion never plays it)
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, SimulationNodeDatum } from 'd3-force';
import { ConformanceNode, ConformanceEdge, LayoutMode } from './types';
import { prefersReducedMotion } from '@/lib/motion';

interface ConformanceCanvasProps {
  nodes: ConformanceNode[];
  edges: ConformanceEdge[];
  mode: LayoutMode;
  selectedNode: ConformanceNode | null;
  selectedEdge: ConformanceEdge | null;
  highlightLayer: string | null;
  // Spotlight every dependency cycle (dims the rest and frames the cycle members)
  highlightCycles?: boolean;
  filterLayers: Set<string>;
  onSelectNode: (node: ConformanceNode | null) => void;
  onSelectEdge: (edge: ConformanceEdge | null) => void;
  onIntroChange?: (active: boolean) => void;
  // Centre the camera on this node; a new focusSeq repeats the request for the same node
  focusNodeId?: string;
  focusSeq?: number;
  // Area the intro covers: whole viewport (default) or the nearest [data-intro-bounds] ancestor
  introBounds?: 'viewport' | 'container';
}

// Intro timings (ms), matching bl00d.money
const INTRO_FILL = 1500;   // beads light up around the dial
const INTRO_BURST = 1750;  // burst into the layout starts
const INTRO_TWEEN = 2300;
const INTRO_HOLD = 1650;   // full dial waits here if the layout is still settling
// Slowest node lands at INTRO_BURST + 900 (max rank delay) + INTRO_TWEEN; hand back just after
const INTRO_END = INTRO_BURST + 900 + INTRO_TWEEN + 150;
const WRAPPER_CLASS = 'overflow-hidden select-none bg-[#080808]';
const SLOT_WRAPPER_CLASS = 'relative w-full h-full';
// Dependency cycles (Tarjan SCC edges/members); saturated violet so it stays distinct from the lavender Infrastructure layer
const CYCLE_COLOR = '#c026ff';
const INTRO_LAYER_ORDER =['Presentation', 'Application', 'Domain', 'Infrastructure', 'Observability', 'External', 'Stdlib', 'Unclassified'];

interface Particle {
  edgeId: string;
  source: string;
  target: string;
  progress: number;
  speed: number;
  isViolation: boolean;
  color: string;
}

// Convert hex color to rgba string with custom alpha
function hexA(hex: string, alpha: number): string {
  if (!hex || hex[0] !== '#') return `rgba(160, 160, 160, ${alpha})`;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Deterministic hash for subtle curve offset
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function easeCubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Node radius in *screen* pixels (bl00d.money: 1.6 + sqrt(deg) * 2.1), so hubs read as
// big discs and leaves stay visible at the default zoom instead of shrinking to 1px.
function nodeScreenR(deg: number): number {
  return Math.min(17, 2.4 + Math.sqrt(Math.max(0, deg)) * 2.3);
}

// Per-layer shrink for the part of the radius above "small" (dense layers would otherwise crowd)
const SMALL_R = 5.6;
const LAYER_SIZE_SCALE: Record<string, number> = { Application: 0.6, Stdlib: 0.85 };

// World-space radius to draw with at a given zoom (shrinks only gently when zoomed out).
// The single largest hub (`isTop`) keeps its full size.
function nodeWorldR(n: ConformanceNode, zoom: number, isTop = false): number {
  let r = nodeScreenR(n.totalDegree);
  const k = LAYER_SIZE_SCALE[n.layer] ?? 1;
  if (!isTop && r > SMALL_R) r = SMALL_R + (r - SMALL_R) * k;
  return r / Math.pow(Math.max(0.05, zoom), 0.8);
}

function computeFitT(
  pts: Array<{ x?: number; y?: number }>,
  canvasW: number,
  canvasH: number,
  pad: number = 80
) {
  if (!pts || pts.length === 0) return { x: 0, y: 0, zoom: 0.85 };
  const xs: number[] = [], ys: number[] = [];
  pts.forEach(p => {
    if (p.x !== undefined && p.y !== undefined) { xs.push(p.x); ys.push(p.y); }
  });
  if (xs.length === 0) return { x: 0, y: 0, zoom: 0.85 };
  // Frame the 3rd–97th percentile so a few stray leaves don't shrink the whole view
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const q = xs.length > 40 ? Math.floor(xs.length * 0.03) : 0;
  const x0 = xs[q], x1 = xs[xs.length - 1 - q], y0 = ys[q], y1 = ys[ys.length - 1 - q];

  const spanW = Math.max(120, x1 - x0);
  const spanH = Math.max(120, y1 - y0);

  const avW = Math.max(150, canvasW - pad * 2);
  const avH = Math.max(150, canvasH - pad * 2);

  // Balanced fit zoom factor: airy margins, no over-magnification
  const k = Math.max(0.25, Math.min(1.6, Math.min(avW / spanW, avH / spanH)));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  return {
    zoom: k,
    x: -cx * k,
    y: -cy * k
  };
}

function computeLayoutTargets(
  currentMode: LayoutMode,
  currentNodes: ConformanceNode[],
  currentEdges: ConformanceEdge[],
  netPositions: Map<string, { x: number; y: number }>,
  selectedNode: ConformanceNode | null
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();

  if (currentMode === 'network') {
    currentNodes.forEach(n => {
      const p = netPositions.get(n.id) || { x: n.x || 0, y: n.y || 0 };
      map.set(n.id, { x: p.x, y: p.y });
    });
  } else if (currentMode === 'clusters') {
    const layersMap: Record<string, ConformanceNode[]> = {};
    currentNodes.forEach(n => {
      if (!layersMap[n.layer]) layersMap[n.layer] = [];
      layersMap[n.layer].push(n);
    });

    const layerPositions: Record<string, { x: number; y: number }> = {
      Presentation: { x: 0, y: -450 },
      Application: { x: 410, y: -240 },
      External: { x: 490, y: 160 },
      Infrastructure: { x: 270, y: 440 },
      Observability: { x: -160, y: 470 },
      Domain: { x: -440, y: 220 },
      Stdlib: { x: -490, y: -160 },
      Unclassified: { x: -240, y: -430 }
    };

    const goldenAngle = 2.39996323;
    const nodeSpacing = 28;

    Object.entries(layersMap).forEach(([layer, arr]) => {
      const anchor = layerPositions[layer] || { x: 0, y: 0 };
      const sorted = [...arr].sort((a, b) => b.totalDegree - a.totalDegree);
      sorted.forEach((n, i) => {
        let ox = 0, oy = 0;
        if (i > 0) {
          const r = nodeSpacing * Math.sqrt(i);
          const theta = i * goldenAngle;
          ox = Math.cos(theta) * r;
          oy = Math.sin(theta) * r;
        }
        map.set(n.id, { x: anchor.x + ox, y: anchor.y + oy });
      });
    });
  } else if (currentMode === 'flow') {
    const tierOrder = ['Presentation', 'Application', 'Domain', 'Infrastructure', 'Observability', 'External', 'Stdlib', 'Unclassified'];
    const gap = 160;
    const x0 = -(tierOrder.length - 1) * gap / 2;

    const layersGroup: Record<string, ConformanceNode[]> = {};
    currentNodes.forEach(n => {
      if (!layersGroup[n.layer]) layersGroup[n.layer] = [];
      layersGroup[n.layer].push(n);
    });

    tierOrder.forEach((layer, ci) => {
      const arr = (layersGroup[layer] || []).sort((a, b) => b.totalDegree - a.totalDegree);
      const step = Math.min(32, 540 / Math.max(1, arr.length));
      arr.forEach((n, i) => {
        const x = x0 + ci * gap + ((i % 2 === 1) ? 10 : -10);
        const y = (i - (arr.length - 1) / 2) * step;
        map.set(n.id, { x, y });
      });
    });
  } else if (currentMode === 'orbit') {
    const centerNode = selectedNode || currentNodes.reduce((acc, curr) => (curr.totalDegree > acc.totalDegree ? curr : acc), currentNodes[0]);
    const centerId = centerNode ? centerNode.id : '';

    const ring1 = new Set<string>();
    currentEdges.forEach(e => {
      if (e.source === centerId) ring1.add(e.target);
      if (e.target === centerId) ring1.add(e.source);
    });

    const ring2 = new Set<string>();
    currentEdges.forEach(e => {
      if (ring1.has(e.source) && e.target !== centerId && !ring1.has(e.target)) ring2.add(e.target);
      if (ring1.has(e.target) && e.source !== centerId && !ring1.has(e.source)) ring2.add(e.source);
    });

    const r1Arr = Array.from(ring1);
    const r2Arr = Array.from(ring2);
    const otherArr = currentNodes.filter(n => n.id !== centerId && !ring1.has(n.id) && !ring2.has(n.id));

    currentNodes.forEach(n => {
      if (n.id === centerId) {
        map.set(n.id, { x: 0, y: 0 });
        return;
      }
      let r = 520;
      let idx = 0;
      let total = 1;
      if (ring1.has(n.id)) {
        r = 190;
        idx = r1Arr.indexOf(n.id);
        total = Math.max(1, r1Arr.length);
      } else if (ring2.has(n.id)) {
        r = 350;
        idx = r2Arr.indexOf(n.id);
        total = Math.max(1, r2Arr.length);
      } else {
        idx = otherArr.indexOf(n);
        total = Math.max(1, otherArr.length);
      }
      const angle = (idx / total) * Math.PI * 2;
      map.set(n.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    });
  } else if (currentMode === 'violations') {
    const vNodes = currentNodes.filter(n => n.violationsCount > 0);
    const nonVNodes = currentNodes.filter(n => n.violationsCount === 0);
    vNodes.sort((a, b) => (b.violationsCount * 10 + b.totalDegree) - (a.violationsCount * 10 + a.totalDegree));

    const goldenAngle = 2.39996323;
    const vSpacing = 36;
    vNodes.forEach((n, i) => {
      let ox = 0, oy = 0;
      if (i > 0) {
        const r = vSpacing * Math.sqrt(i);
        const theta = i * goldenAngle;
        ox = Math.cos(theta) * r;
        oy = Math.sin(theta) * r;
      }
      map.set(n.id, { x: ox, y: oy });
    });

    nonVNodes.forEach((n, i) => {
      const angle = (i / Math.max(1, nonVNodes.length)) * Math.PI * 2;
      map.set(n.id, { x: Math.cos(angle) * 560, y: Math.sin(angle) * 560 });
    });
  }

  return map;
}

export const ConformanceCanvas: React.FC<ConformanceCanvasProps> = ({
  nodes,
  edges,
  mode,
  selectedNode,
  selectedEdge,
  highlightLayer,
  highlightCycles = false,
  filterLayers,
  onSelectNode,
  onSelectEdge,
  onIntroChange,
  focusNodeId,
  focusSeq,
  introBounds = 'viewport'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onIntroChangeRef = useRef(onIntroChange);
  onIntroChangeRef.current = onIntroChange;

  // Camera State
  const cameraRef = useRef({ x: 0, y: 0, zoom: 0.85 });
  const hasFittedInitialCameraRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragOriginRef = useRef({ x: 0, y: 0 });
  const pendingEdgeRef = useRef<ConformanceEdge | null>(null);
  // bl00d.money intro: plays once per mount, full screen from the very first paint (it also
  // covers the audit fetch). Node positions during the intro are derived every frame from these
  // per-id maps, so the graph data reloading mid-intro can't knock nodes off the dial.
  const [introActive, setIntroActive] = useState(true);
  const introRef = useRef<{
    placed: boolean; // ring laid out for the current node set
    started: boolean; // dial fill has begun (clock running)
    clock: number; // virtual ms, advanced by a clamped dt so a slow frame never skips the animation
    last: number;
    wait: number; // frames spent waiting for layout to be ready
    born: number;
    spin: number; // waiting-dial rotation
    cx: number; // ring centre (world)
    cy: number;
    dialCam: { x: number; y: number; zoom: number } | null; // camera while the dial fills
    finalCam: { x: number; y: number; zoom: number } | null; // framing the burst lands on
    targets: Map<string, { x: number; y: number }>;
    ring: Map<string, { x: number; y: number }>;
    at: Map<string, number>; // when each bead lights up on the dial
    dl: Map<string, number>; // per-node burst delay (by rank)
    al: Map<string, number>; // per-node alpha
  } | null>({
    placed: false, started: false, clock: 0, last: 0, wait: 0, born: 0, spin: 0, cx: 0, cy: 0, dialCam: null, finalCam: null,
    targets: new Map(), ring: new Map(), at: new Map(), dl: new Map(), al: new Map()
  });
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const renderRef = useRef<(() => void) | null>(null);
  const introEndedAtRef = useRef(0);
  const reduceMotionRef = useRef(false);
  useEffect(() => {
    reduceMotionRef.current = prefersReducedMotion();
  }, []);
  const hoverArmedRef = useRef(true);
  const hoverOriginRef = useRef<{ x: number; y: number } | null>(null);

  // End (or skip) the intro: snap to the final layout without any DOM jumping or canvas buffer wipes
  const finishIntro = useCallback(() => {
    const intro = introRef.current;
    if (!intro) return;
    simNodesRef.current.forEach(n => {
      const t = intro.targets.get(n.id);
      if (t) { n.x = t.x; n.y = t.y; }
    });
    if (intro.finalCam) {
      cameraRef.current = { ...intro.finalCam };
    }
    cameraTweenRef.current = null;
    introRef.current = null;
    introEndedAtRef.current = performance.now();
    hoverArmedRef.current = false;
    setIntroActive(false);
    onIntroChangeRef.current?.(false);
  }, []);

  // Reduced motion: end the intro before the first paint. Otherwise a click or Esc skips it.
  useLayoutEffect(() => {
    if (prefersReducedMotion()) finishIntro();
  }, [finishIntro]);
  useEffect(() => {
    if (!introActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finishIntro();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [introActive, finishIntro]);

  const layoutTweenRef = useRef<{
    t0: number;
    dur: number;
    starts: Map<string, { x: number; y: number }>;
    targets: Map<string, { x: number; y: number }>;
  } | null>(null);
  const cameraTweenRef = useRef<{
    t0: number;
    dur: number;
    startX: number;
    startY: number;
    startZoom: number;
    targetX: number;
    targetY: number;
    targetZoom: number;
  } | null>(null);
  // Simulation internal refs
  const simNodesRef = useRef<ConformanceNode[]>([]);
  const simEdgesRef = useRef<ConformanceEdge[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const hoveredNodeRef = useRef<ConformanceNode | null>(null);
  const hoveredEdgeRef = useRef<ConformanceEdge | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const orbitAngleRef = useRef(0);
  const ambientRotationRef = useRef(0);
  const mousePosRef = useRef<{ x: number; y: number; isInside: boolean }>({ x: 0, y: 0, isInside: false });
  const networkPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const topNodeIdRef = useRef<string | null>(null);
  const edgeCurvesRef = useRef<Map<string, { along: number; perp: number }>>(new Map());

  // Initialize, pre-settle, and lock static simulation nodes/edges with bloodmoney physics
  useEffect(() => {
    if (!nodes || nodes.length === 0 || filterLayers.size === 0) return;

    const visibleNodes = nodes.filter(n => filterLayers.has(n.layer));
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

    // Sort descending by total degree (bloodmoney rank)
    const sortedNodes = [...visibleNodes].sort((a, b) => b.totalDegree - a.totalDegree);

    const visibleEdges = edges.filter(
      e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );

    // Build adjacency to find each node's most connected neighbor (its primary hub)
    const vNodeMap = new Map<string, ConformanceNode>();
    visibleNodes.forEach(n => vNodeMap.set(n.id, n));
    const neighborMap = new Map<string, Array<{ id: string; degree: number }>>();
    visibleNodes.forEach(n => neighborMap.set(n.id, []));
    visibleEdges.forEach(e => {
      const s = vNodeMap.get(e.source);
      const t = vNodeMap.get(e.target);
      if (s && t) {
        neighborMap.get(s.id)?.push({ id: t.id, degree: t.totalDegree });
        neighborMap.get(t.id)?.push({ id: s.id, degree: s.totalDegree });
      }
    });

    // Partition into core hubs (deg >= 10) vs subordinate/satellite nodes
    const hubIds = new Set(visibleNodes.filter(n => n.totalDegree >= 10).map(n => n.id));

    // For each node, identify its primary hub
    const primaryHubMap = new Map<string, string>();
    visibleNodes.forEach(n => {
      if (hubIds.has(n.id)) {
        primaryHubMap.set(n.id, n.id);
      } else {
        const neighbors = neighborMap.get(n.id) || [];
        const sortedNeighbors = [...neighbors].sort((a, b) => b.degree - a.degree);
        const bestHub = sortedNeighbors.find(nb => hubIds.has(nb.id)) || sortedNeighbors[0];
        primaryHubMap.set(n.id, bestHub ? bestHub.id : n.id);
      }
    });

    // Layer anchor regions for natural architectural constellation
    const layerAnchors: Record<string, { x: number; y: number; r: number }> = {
      Domain: { x: -70, y: 40, r: 160 },
      Application: { x: 220, y: -120, r: 240 },
      Presentation: { x: -260, y: -240, r: 180 },
      Infrastructure: { x: 240, y: 220, r: 190 },
      Observability: { x: -260, y: 240, r: 150 },
      External: { x: 400, y: 40, r: 210 },
      Stdlib: { x: -400, y: -50, r: 210 },
      Unclassified: { x: 0, y: -340, r: 120 }
    };

    const goldenAngle = 2.39996323;
    const newSimNodes = sortedNodes.map((n, i) => {
      const anc = layerAnchors[n.layer] || { x: 0, y: 0, r: 140 };
      const h = Math.abs(hashString(n.id));
      const angle = i * goldenAngle + ((h % 17) - 8) * 0.04;
      // Scatter low-degree leaf satellites further out organically
      const isOuterSatellite = n.totalDegree <= 2 && (h % 3 === 0);
      const extraR = isOuterSatellite ? 80 : 0;
      const r = 30 + Math.sqrt(i % 16) * 42 + (h % 28) + extraR;
      return {
        ...n,
        x: anc.x + Math.cos(angle) * r,
        y: anc.y + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        ph: Math.random() * 6.283
      };
    });

    const nMap = new Map<string, ConformanceNode>();
    newSimNodes.forEach(n => nMap.set(n.id, n));

    // Intro playing: hand the node set over now so the beads can start filling the dial while
    // the layout below settles (the intro positions every node itself; edges stay hidden)
    if (introRef.current) {
      simNodesRef.current = newSimNodes;
      simEdgesRef.current = visibleEdges;
      topNodeIdRef.current = newSimNodes[0]?.id ?? null;
      introRef.current.targets = new Map();
      introRef.current.finalCam = null;
      introRef.current.placed = false;
      introRef.current.wait = 0;
    }

    // ── bl00d.money-style force layout ──
    // Every edge gets an invisible "bend" node (A → F → B). F is pushed around by the
    // same forces as real nodes, so each filament bows naturally around its neighbours
    // and the bend points fill the space between hubs instead of rigid straight chords.
    type SimPt = SimulationNodeDatum & { kind: 'e' | 'f'; node?: ConformanceNode };
    const realPts = new Map<string, SimPt>();
    newSimNodes.forEach(n => realPts.set(n.id, { kind: 'e', node: n, x: n.x, y: n.y }));
    const bendPts = new Map<string, SimPt>();
    const simLinks: { source: SimPt; target: SimPt; d: number }[] = [];
    visibleEdges.forEach(e => {
      const s = realPts.get(e.source);
      const t = realPts.get(e.target);
      if (!s || !t || s === t) return;
      const h = Math.abs(hashString(e.id));
      const f: SimPt = {
        kind: 'f',
        x: (s.x! + t.x!) / 2 + ((h % 21) - 10),
        y: (s.y! + t.y!) / 2 + (((h >> 5) % 21) - 10)
      };
      bendPts.set(e.id, f);
      const half = (s.node!.totalDegree < 6 || t.node!.totalDegree < 6) ? 22 : 34;
      simLinks.push({ source: s, target: f, d: half }, { source: f, target: t, d: half });
    });

    const anchorOf = (p: SimPt) => (p.node ? layerAnchors[p.node.layer] : undefined) || { x: 0, y: 0, r: 0 };
    const sim = forceSimulation<SimPt>([...realPts.values(), ...bendPts.values()])
      .force('link', forceLink<SimPt, { source: SimPt; target: SimPt; d: number }>(simLinks).distance(l => l.d).strength(0.35))
      .force('charge', forceManyBody<SimPt>()
        .strength(p => p.kind === 'e' ? -110 - Math.min(40, p.node!.totalDegree) * 7 : -7)
        .distanceMax(480))
      .force('collide', forceCollide<SimPt>(p => p.kind === 'e' ? nodeScreenR(p.node!.totalDegree) + 4 : 1.5))
      .force('x', forceX<SimPt>(p => anchorOf(p).x * 0.35).strength(p => p.kind === 'e' ? 0.045 : 0.01))
      .force('y', forceY<SimPt>(p => anchorOf(p).y * 0.35).strength(p => p.kind === 'e' ? 0.045 : 0.01))
      .stop();
    // Same 320 ticks as before, spread across frames (~10ms per frame) so the main thread
    // never blocks: the intro dial keeps animating while the layout settles.
    let cancelled = false;
    let rafId = 0;
    let ticks = 0;
    const settle = () => {
      newSimNodes.forEach(n => {
        const p = realPts.get(n.id)!;
        n.x = p.x!;
        n.y = p.y!;
      });

      // Recenter around origin (0, 0)
      let meanX = 0, meanY = 0;
      newSimNodes.forEach(n => { meanX += n.x!; meanY += n.y!; });
      meanX /= Math.max(1, newSimNodes.length);
      meanY /= Math.max(1, newSimNodes.length);

      newSimNodes.forEach(n => {
        n.x! -= meanX;
        n.y! -= meanY;
        n.vx = 0;
        n.vy = 0;
      });

      // Save settled network positions
      const netPositions = new Map<string, { x: number; y: number }>();
      newSimNodes.forEach(n => {
        netPositions.set(n.id, { x: n.x!, y: n.y! });
      });
      networkPositionsRef.current = netPositions;

      // Store each bend point in the edge's local frame (fraction of length along / across the
      // chord) so curves stay correct while nodes drift or tween into other layout modes.
      const curvesMap = new Map<string, { along: number; perp: number }>();
      visibleEdges.forEach(e => {
        const s = nMap.get(e.source);
        const t = nMap.get(e.target);
        const f = bendPts.get(e.id);
        if (!s || !t || !f) return;
        const dx = t.x! - s.x!;
        const dy = t.y! - s.y!;
        const len2 = dx * dx + dy * dy || 1;
        const ox = f.x! - meanX - (s.x! + t.x!) / 2;
        const oy = f.y! - meanY - (s.y! + t.y!) / 2;
        curvesMap.set(e.id, {
          along: Math.max(-0.3, Math.min(0.3, (ox * dx + oy * dy) / len2)),
          perp: Math.max(-0.22, Math.min(0.22, (oy * dx - ox * dy) / len2))
        });
      });
      edgeCurvesRef.current = curvesMap;

      simNodesRef.current = newSimNodes;
      topNodeIdRef.current = newSimNodes.reduce<ConformanceNode | null>(
        (best, n) => (!best || n.totalDegree > best.totalDegree ? n : best), null)?.id ?? null;
      simEdgesRef.current = visibleEdges;

      // Selective, slow, graceful particles (strictly 8-10 pulses across the graph)
      const newParticles: Particle[] = [];
      const maxParticles = Math.min(10, visibleEdges.length);
      const step = Math.max(1, Math.floor(visibleEdges.length / maxParticles));

      for (let i = 0; i < visibleEdges.length; i += step) {
        if (newParticles.length >= maxParticles) break;
        const e = visibleEdges[i];
        const sNode = nMap.get(e.source);
        newParticles.push({
          edgeId: e.id,
          source: e.source,
          target: e.target,
          progress: Math.random(),
          speed: e.isViolation || e.isCycle ? 0.0012 : 0.0006 + (i % 4) * 0.00012,
          isViolation: e.isViolation || e.isCycle,
          color: e.isCycle ? CYCLE_COLOR : e.isViolation ? '#ff3b30' : sNode?.color || '#4f9dff'
        });
      }
      particlesRef.current = newParticles;

      // Intro still playing: the layout computed above is its end state; re-lay the dial for
      // this node set on the next frame (it needs the camera)
      if (introRef.current) {
        introRef.current.targets = computeLayoutTargets(mode, newSimNodes, visibleEdges, netPositions, selectedNode);
        introRef.current.finalCam = null;
        introRef.current.placed = false;
        introRef.current.wait = 0;
      }

      // Frame settled constellation only once on true initial mount
      if (cameraRef.current.x === 0 && cameraRef.current.y === 0 && cameraRef.current.zoom === 0.85) {
        hasFittedInitialCameraRef.current = false;
      }
    };
    const step = () => {
      if (cancelled) return;
      const t0 = performance.now();
      while (ticks < 320 && performance.now() - t0 < 10) { sim.tick(); ticks++; }
      if (ticks < 320) rafId = requestAnimationFrame(step);
      else settle();
    };
    step();
    return () => { cancelled = true; cancelAnimationFrame(rafId); };
  }, [nodes, edges, filterLayers]);

  // Layout mode transition with smooth cubic easing (keeps camera position stable)
  useEffect(() => {
    const currentNodes = simNodesRef.current;
    if (!currentNodes || currentNodes.length === 0) return;

    const netPos = networkPositionsRef.current;
    const targets = computeLayoutTargets(mode, currentNodes, simEdgesRef.current, netPos, selectedNode);

    const starts = new Map<string, { x: number; y: number }>();
    currentNodes.forEach(n => starts.set(n.id, { x: n.x || 0, y: n.y || 0 }));

    layoutTweenRef.current = {
      t0: performance.now(),
      dur: reduceMotionRef.current ? 1 : 950,
      starts,
      targets
    };
  }, [mode, selectedNode]);

  // Main 60 FPS Render & Physics Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let isRunning = true;

    const render = () => {
      if (!isRunning) return;

      try {
        const dpr = window.devicePixelRatio || 1;
        let cssWidth = 0;
        let cssHeight = 0;
        // Synchronize internal canvas bitmap resolution directly on render frame without ResizeObserver loops
        const syncSize = () => {
          cssWidth = canvas.clientWidth || 1200;
          cssHeight = canvas.clientHeight || 800;
          const targetW = Math.round(cssWidth * dpr);
          const targetH = Math.round(cssHeight * dpr);
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
        };
        syncSize();

        let cam = cameraRef.current;
        const currentNodes = simNodesRef.current;
        const currentEdges = simEdgesRef.current;

        const nodeMap = new Map<string, ConformanceNode>();
        currentNodes.forEach(n => nodeMap.set(n.id, n));

        // ── 1. AMBIENT DRIFT, LAYOUT TWEEN, & CAMERA TWEEN ──
        const now = performance.now();
        const clock = now * 0.001;

        // Handle Initial Camera Fit on first valid render frame (the intro does its own)
        if (!introRef.current && !hasFittedInitialCameraRef.current && currentNodes.length > 0 && cssWidth > 50) {
          cameraRef.current = computeFitT(currentNodes, cssWidth, cssHeight, 75);
          hasFittedInitialCameraRef.current = true;
        }

        // ── INTRO: beads fill a dial, then burst into the layout ──
        const intro = introRef.current;
        let introEdgeK = intro ? 0 : 1;
        let introFill = 0;
        let introDial = 0;
        if (intro) {
          const dt = intro.last ? Math.min(50, now - intro.last) : 0;
          intro.last = now;
          if (!intro.born) intro.born = now;

          // Lay the dial out for the current node set: visually centered on screen
          if (!intro.placed && currentNodes.length > 0 && cssWidth > 50) {
            intro.wait++;
            if (intro.wait > 2) {
              const canvasRect = canvas.getBoundingClientRect();
              const screenCenterX = window.innerWidth / 2;
              const screenCenterY = (window.innerHeight - 56) / 2 + 56;
              const dialOffsetX = screenCenterX - (canvasRect.left + cssWidth / 2);
              const dialOffsetY = screenCenterY - (canvasRect.top + cssHeight / 2);

              const est = computeFitT(currentNodes, cssWidth, cssHeight, 75);
              const cam0 = intro.started && intro.dialCam
                ? intro.dialCam
                : { x: dialOffsetX, y: dialOffsetY, zoom: est.zoom };

              intro.dialCam = cam0;
              cameraRef.current = { ...cam0 };
              cameraTweenRef.current = null;
              hasFittedInitialCameraRef.current = true;

              // Ring centred on (0, 0) world, radius 20% of the short side
              const rw = (Math.min(cssWidth, cssHeight) * 0.2) / cam0.zoom;
              intro.cx = 0;
              intro.cy = 0;

              const layerIdx = (l: string) => { const i = INTRO_LAYER_ORDER.indexOf(l); return i < 0 ? 99 : i; };
              const order = [...currentNodes].sort((a, b) => layerIdx(a.layer) - layerIdx(b.layer) || b.totalDegree - a.totalDegree);
              intro.ring.clear();
              order.forEach((n, i) => {
                const a = (i / order.length) * Math.PI * 2 - Math.PI / 2;
                intro.ring.set(n.id, { x: Math.cos(a) * rw, y: Math.sin(a) * rw });
                intro.at.set(n.id, (i / order.length) * INTRO_FILL);
                if (!intro.al.has(n.id)) intro.al.set(n.id, 0);
              });
              // currentNodes is sorted by degree, so its index is the rank
              currentNodes.forEach((n, rank) => intro.dl.set(n.id, Math.min(900, rank * 7)));
              intro.placed = true;
              intro.started = true;
            }
          }

          // Layout settled: work out the final framing directly in the slot's dimensions
          if (intro.started && intro.targets.size > 0 && !intro.finalCam && cssWidth > 50) {
            const fitPts = currentNodes.map(n => intro.targets.get(n.id) || { x: n.x, y: n.y });
            intro.finalCam = computeFitT(fitPts, cssWidth, cssHeight, 75);
          }

          if (!intro.started) {
            // Data still loading: idle dial
            intro.spin += dt;
            introDial = 1;
            if (now - intro.born > 20000) finishIntro(); // never trap the screen if the audit fails
          } else {
            intro.clock += dt;
            // Layout not settled yet: hold on the full dial until it is
            if (!intro.finalCam) intro.clock = Math.min(intro.clock, INTRO_HOLD);
            const c = intro.clock;
            const burst = c - INTRO_BURST;
            // Camera glides from the dial framing to the final one over the whole burst
            if (intro.dialCam && intro.finalCam) {
              const d = intro.dialCam, f = intro.finalCam;
              const e = easeCubicInOut(Math.max(0, Math.min(1, burst / (INTRO_TWEEN + 900))));
              const zoom = d.zoom * Math.pow(f.zoom / d.zoom, e);
              cameraRef.current = { x: d.x + (f.x - d.x) * e, y: d.y + (f.y - d.y) * e, zoom };
            }
            currentNodes.forEach(n => {
              const tg = c >= (intro.at.get(n.id) ?? 0) ? 1 : 0;
              const a = intro.al.get(n.id) ?? 0;
              intro.al.set(n.id, a + (tg - a) * Math.min(1, dt * 0.004));
              const s = intro.ring.get(n.id);
              const t = intro.targets.get(n.id);
              if (s && t) {
                const k = Math.max(0, Math.min(1, (burst - (intro.dl.get(n.id) ?? 0)) / INTRO_TWEEN));
                const e = easeCubicInOut(k);
                n.x = s.x + (t.x - s.x) * e;
                n.y = s.y + (t.y - s.y) * e;
              } else if (s) {
                n.x = s.x;
                n.y = s.y;
              }
            });
            introEdgeK = Math.max(0, Math.min(1, (burst - 250) / 1400));
            introFill = Math.min(1, c / INTRO_FILL);
            introDial = c < 1700 ? 1 : Math.max(0, 1 - (c - 1700) / 700);
            // The studio UI comes back smoothly once the whole graph has formed
            if (c >= INTRO_END) finishIntro();
          }
        }
        const introNow = introRef.current;
        cam = cameraRef.current; // the fit / intro above may have replaced the camera this frame
        // Handle Layout Tweening (Cubic Easing between modes)
        if (introNow) {
          // intro owns node positions
        } else if (layoutTweenRef.current) {
          const tween = layoutTweenRef.current;
          const el = now - tween.t0;
          const p = Math.max(0, Math.min(1, el / tween.dur));
          const ease = easeCubicInOut(p);

          currentNodes.forEach(n => {
            const s = tween.starts.get(n.id);
            const t = tween.targets.get(n.id);
            if (s && t) {
              n.x = s.x + (t.x - s.x) * ease;
              n.y = s.y + (t.y - s.y) * ease;
            }
          });

          if (p >= 1) {
            layoutTweenRef.current = null;
          }
        } else {
          // Subtle organic celestial breathing in network mode
          if (mode === 'network') {
            const netPos = networkPositionsRef.current;
            currentNodes.forEach(n => {
              const pos = netPos.get(n.id);
              if (pos) {
                const bx = Math.sin(clock * 0.7 + (n.ph || 0)) * 0.75;
                const by = Math.cos(clock * 0.6 + (n.ph || 0)) * 0.75;
                n.x = pos.x + bx;
                n.y = pos.y + by;
              }
            });
          }
        }

        // Handle Camera Tweening (smooth auto-framing on mode change)
        if (cameraTweenRef.current && !isDraggingRef.current) {
          const camTween = cameraTweenRef.current;
          const el = now - camTween.t0;
          const p = Math.min(1, el / camTween.dur);
          const ease = easeCubicInOut(p);

          cameraRef.current.x = camTween.startX + (camTween.targetX - camTween.startX) * ease;
          cameraRef.current.y = camTween.startY + (camTween.targetY - camTween.startY) * ease;
          cameraRef.current.zoom = camTween.startZoom + (camTween.targetZoom - camTween.startZoom) * ease;

          if (p >= 1) {
            cameraTweenRef.current = null;
          }
        }

        // Gentle ambient cosmic rotation (paused while hovering, dragging, or inspecting)
        if (!introNow && !reduceMotionRef.current && !isDraggingRef.current && !hoveredNodeRef.current && !hoveredEdgeRef.current && !selectedNode) {
          ambientRotationRef.current += 0.00018;
        }
        const rot = mode === 'network' ? ambientRotationRef.current : 0;
        if (introNow || !hoverArmedRef.current) {
          hoveredNodeRef.current = null;
        } else if (mousePosRef.current.isInside && !isDraggingRef.current) {
          const mouseX = mousePosRef.current.x;
          const mouseY = mousePosRef.current.y;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);

          let closestNode: ConformanceNode | null = null;
          let minScreenDist = Infinity;

          for (let i = 0; i < currentNodes.length; i++) {
            const n = currentNodes[i];
            if (n.x === undefined || n.y === undefined) continue;

            const rx = n.x * cos - n.y * sin;
            const ry = n.x * sin + n.y * cos;
            const screenX = cssWidth / 2 + cam.x + rx * cam.zoom;
            const screenY = cssHeight / 2 + cam.y + ry * cam.zoom;

            const dx = mouseX - screenX;
            const dy = mouseY - screenY;
            const screenDist = Math.hypot(dx, dy);

            const hitRadius = Math.max(12, nodeWorldR(n, cam.zoom, n.id === topNodeIdRef.current) * cam.zoom + 8);
            if (screenDist <= hitRadius && screenDist < minScreenDist) {
              minScreenDist = screenDist;
              closestNode = n;
            }
          }
          hoveredNodeRef.current = closestNode;
        } else if (!mousePosRef.current.isInside) {
          hoveredNodeRef.current = null;
        }

        // ── 2. COMPUTE HOVER / ACTIVE NEIGHBORHOOD ──────────────────
        const activeNode = hoveredNodeRef.current || selectedNode;
        const hotNodes = new Set<string>();
        const hotEdges = new Set<string>();

        if (activeNode) {
          hotNodes.add(activeNode.id);
          currentEdges.forEach(e => {
            if (e.source === activeNode.id || e.target === activeNode.id) {
              hotEdges.add(e.id);
              hotNodes.add(e.source);
              hotNodes.add(e.target);
            }
          });
        }

        if (selectedEdge) {
          hotEdges.add(selectedEdge.id);
          hotNodes.add(selectedEdge.source);
          hotNodes.add(selectedEdge.target);
        }

        if (highlightCycles) {
          currentEdges.forEach(e => {
            if (e.isCycle) {
              hotEdges.add(e.id);
              hotNodes.add(e.source);
              hotNodes.add(e.target);
            }
          });
        }

        const hasActiveFocus = activeNode !== null || selectedEdge !== null || highlightCycles;

        // ── 3. CANVAS RENDERING ─────────────────────────────────────
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Background: Deep OLED Obsidian #080808
        ctx.fillStyle = '#080808';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        // Intro dial (screen space): progress arc, outer ring, ticks and a sweeping bead
        if (introNow && introDial > 0) {
          // Pinned to the bead ring's centre on screen (smoothly follows camera)
          const dcx = cssWidth / 2 + cam.x;
          const dcy = cssHeight / 2 + cam.y;
          const R = Math.min(cssWidth, cssHeight) * 0.2;
          const top = -Math.PI / 2;
          ctx.lineWidth = 1;
          if (!introNow.started) {
            // Waiting for data: outer ring with a short arc sweeping round it
            ctx.strokeStyle = 'rgba(52, 52, 52, 1)';
            ctx.beginPath();
            ctx.arc(dcx, dcy, R + 9, 0, Math.PI * 2);
            ctx.stroke();
            const a0 = top + introNow.spin * 0.004;
            ctx.strokeStyle = 'rgba(232, 255, 0, 0.55)';
            ctx.beginPath();
            ctx.arc(dcx, dcy, R, a0, a0 + Math.PI / 3);
            ctx.stroke();
            ctx.fillStyle = '#e8ff00';
            ctx.beginPath();
            ctx.arc(dcx + Math.cos(a0 + Math.PI / 3) * R, dcy + Math.sin(a0 + Math.PI / 3) * R, 2.4, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.strokeStyle = `rgba(232, 255, 0, ${0.55 * introDial})`;
            ctx.beginPath();
            ctx.arc(dcx, dcy, R, top, top + introFill * Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = `rgba(52, 52, 52, ${introDial})`;
            ctx.beginPath();
            ctx.arc(dcx, dcy, R + 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = `rgba(148, 148, 148, ${0.6 * introDial})`;
            ctx.beginPath();
            for (let i = 0; i < 60 && i / 60 <= introFill; i++) {
              const a = (i / 60) * Math.PI * 2 + top;
              const r1 = R + 6, r2 = R + (i % 5 ? 11 : 16);
              ctx.moveTo(dcx + Math.cos(a) * r1, dcy + Math.sin(a) * r1);
              ctx.lineTo(dcx + Math.cos(a) * r2, dcy + Math.sin(a) * r2);
            }
            ctx.stroke();
            const ba = top + introFill * Math.PI * 2;
            ctx.fillStyle = `rgba(232, 255, 0, ${introDial})`;
            ctx.beginPath();
            ctx.arc(dcx + Math.cos(ba) * R, dcy + Math.sin(ba) * R, 2.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.save();
        ctx.translate(cssWidth / 2 + cam.x, cssHeight / 2 + cam.y);
        ctx.scale(cam.zoom, cam.zoom);

        // Subtle Background Grid (safely bounded)
        const gridSize = 80;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.022)';
        ctx.lineWidth = 1;
        const safeZoom = Math.max(0.2, Math.min(5.0, cam.zoom || 0.85));
        const viewHalfW = Math.min(1800, Math.max(400, (cssWidth / (2 * safeZoom))));
        const viewHalfH = Math.min(1800, Math.max(400, (cssHeight / (2 * safeZoom))));
        const startX = Math.floor((-viewHalfW) / gridSize) * gridSize;
        const endX = Math.ceil(viewHalfW / gridSize) * gridSize;
        const startY = Math.floor((-viewHalfH) / gridSize) * gridSize;
        const endY = Math.ceil(viewHalfH / gridSize) * gridSize;

        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) {
          ctx.moveTo(x, startY);
          ctx.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += gridSize) {
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
        }
        ctx.stroke();

        if (currentNodes.length === 0) {
          ctx.restore();
          if (introNow) {
            animFrameIdRef.current = requestAnimationFrame(render);
            return;
          }
          ctx.fillStyle = '#6b7280';
          ctx.font = 'bold 11px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('SCANNING CODEBASE ARCHITECTURAL GRAPH...', cssWidth / 2, cssHeight / 2);
          animFrameIdRef.current = requestAnimationFrame(render);
          return;
        }

        // Apply gentle cosmic rotation to the graph network
        if (mode === 'network' && rot !== 0) {
          ctx.rotate(rot);
        }
        if (mode === 'orbit') {
          [180, 340, 520].forEach((r, idx) => {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.strokeStyle = idx === 0 ? 'rgba(232, 255, 0, 0.22)' : 'rgba(255, 255, 255, 0.05)';
            ctx.setLineDash([3, 5]);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
          });
        } else if (mode === 'clusters') {
          const clusterLabels = [
            { text: 'PRESENTATION', key: 'Presentation', x: 0, y: -450, color: '#e8ff00' },
            { text: 'APPLICATION', key: 'Application', x: 410, y: -240, color: '#4f9dff' },
            { text: 'EXTERNAL', key: 'External', x: 490, y: 160, color: '#ff5c2b' },
            { text: 'INFRASTRUCTURE', key: 'Infrastructure', x: 270, y: 440, color: '#b48cff' },
            { text: 'OBSERVABILITY', key: 'Observability', x: -160, y: 470, color: '#a7d8e0' },
            { text: 'DOMAIN', key: 'Domain', x: -440, y: 220, color: '#6fd38a' },
            { text: 'STDLIB', key: 'Stdlib', x: -490, y: -160, color: '#e2e2da' },
            { text: 'UNCLASSIFIED', key: 'Unclassified', x: -240, y: -430, color: '#8b8b86' }
          ];

          const counts: Record<string, number> = {};
          currentNodes.forEach(n => {
            counts[n.layer] = (counts[n.layer] || 0) + 1;
          });

          ctx.font = 'bold 11px ui-monospace, monospace';
          ctx.textAlign = 'center';

          clusterLabels.forEach(cl => {
            const cnt = counts[cl.key] || 0;
            if (cnt === 0) return;
            const headerText = `${cl.text} · ${cnt}`;
            const diskRadius = 20 * Math.sqrt(cnt) + 16;
            const labelY = cl.y - diskRadius - 12;

            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(8, 8, 8, 0.95)';
            ctx.strokeText(headerText, cl.x, labelY);
            ctx.fillStyle = cl.color;
            ctx.fillText(headerText, cl.x, labelY);
          });
        }

        // ── Determine Edge Geometry (bl00d.money Physics Obstacle Avoidance & Variety) ──
        const edgeCurves = new Map<string, { isStraight: boolean; isDashed: boolean; cx: number; cy: number }>();
        const preCurves = edgeCurvesRef.current;

        currentEdges.forEach(e => {
          const s = nodeMap.get(e.source);
          const t = nodeMap.get(e.target);
          if (!s || !t) return;

          const mx = (s.x! + t.x!) / 2;
          const my = (s.y! + t.y!) / 2;

          // Cycle edges always bow to the left of their direction, so A→B and B→A split into a
          // visible loop instead of overlapping, and longer cycles read as a ring
          if (e.isCycle) {
            const bow = 0.2;
            edgeCurves.set(e.id, {
              isStraight: false,
              isDashed: e.isViolation,
              cx: mx - (t.y! - s.y!) * bow * 2,
              cy: my + (t.x! - s.x!) * bow * 2
            });
            return;
          }

          if (mode === 'clusters') {
            const isCrossCluster = s.layer !== t.layer;
            if (isCrossCluster) {
              edgeCurves.set(e.id, { isStraight: true, isDashed: e.isViolation, cx: mx, cy: my });
            } else {
              const dx = t.x! - s.x!;
              const dy = t.y! - s.y!;
              const dist = Math.hypot(dx, dy) || 1;
              const nx = -dy / dist;
              const ny = dx / dist;
              const hash = Math.abs(hashString(e.id));
              const sign = hash % 2 === 0 ? 1 : -1;
              const cx = mx + nx * dist * (sign * 0.08);
              const cy = my + ny * dist * (sign * 0.08);
              edgeCurves.set(e.id, { isStraight: false, isDashed: false, cx, cy });
            }
          } else {
            const preGeom = preCurves.get(e.id);
            if (preGeom) {
              // Bend point F in world space, then the quadratic control point that makes the
              // curve pass through F at t = 0.5: C = 2F - (A + B) / 2
              const dx = t.x! - s.x!;
              const dy = t.y! - s.y!;
              const fx = mx + dx * preGeom.along - dy * preGeom.perp;
              const fy = my + dy * preGeom.along + dx * preGeom.perp;
              edgeCurves.set(e.id, {
                isStraight: false,
                isDashed: e.isViolation,
                cx: 2 * fx - mx,
                cy: 2 * fy - my
              });
            } else {
              edgeCurves.set(e.id, { isStraight: true, isDashed: e.isViolation, cx: mx, cy: my });
            }
          }
        });

        // ── Draw Edges with Whisper-Thin Translucent Filaments (Optimized: No per-edge ctx.save/restore) ──
        currentEdges.forEach(e => {
          const s = nodeMap.get(e.source);
          const t = nodeMap.get(e.target);
          if (!s || !t) return;

          const geom = edgeCurves.get(e.id) || { isStraight: true, isDashed: e.isViolation, cx: (s.x! + t.x!) / 2, cy: (s.y! + t.y!) / 2 };
          const isHot = hotEdges.has(e.id);
          const isSelected = selectedEdge && selectedEdge.id === e.id;

          const isFlagged = e.isViolation || e.isCycle;
          const lineWidth = (isFlagged ? 1.4 : (isHot ? 0.85 : (geom.isDashed ? 0.6 : 0.65))) / Math.pow(Math.max(0.05, cam.zoom), 0.7);
          let alpha = 0.32;

          if (isFlagged) {
            alpha = hasActiveFocus ? (isHot ? 0.95 : highlightCycles ? 0.12 : 0.40) : 0.90;
          } else if (hasActiveFocus) {
            alpha = isHot ? 0.80 : 0.05;
          } else if (mode === 'violations') {
            alpha = 0.04;
          }
          alpha *= introEdgeK;
          if (alpha < 0.01) return;

          // A cycle edge is purple even when it is also a layer violation (still drawn dashed)
          const strokeStyle = e.isCycle ? CYCLE_COLOR : e.isViolation ? '#ff3b30' : (isHot ? '#e8ff00' : s.color);

          ctx.beginPath();
          ctx.moveTo(s.x!, s.y!);
          if (geom.isStraight) {
            ctx.lineTo(t.x!, t.y!);
          } else {
            ctx.quadraticCurveTo(geom.cx, geom.cy, t.x!, t.y!);
          }
          ctx.strokeStyle = strokeStyle;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = lineWidth;

          if (isFlagged) {
            ctx.shadowColor = strokeStyle;
            ctx.shadowBlur = 8;
            if (e.isViolation) ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
          } else if (geom.isDashed) {
            ctx.setLineDash([2, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.stroke();
          }

          // Arrowhead at the target's rim so the direction of each cycle edge is readable
          if (e.isCycle && alpha > 0.05) {
            const dirX = t.x! - (geom.isStraight ? s.x! : geom.cx);
            const dirY = t.y! - (geom.isStraight ? s.y! : geom.cy);
            const dLen = Math.hypot(dirX, dirY) || 1;
            const ux = dirX / dLen, uy = dirY / dLen;
            const tR = nodeWorldR(t, cam.zoom, t.id === topNodeIdRef.current) * (t.violationsCount > 0 ? 0.75 : 1);
            const zk = Math.pow(Math.max(0.05, cam.zoom), 0.7);
            const tipX = t.x! - ux * (tR + 3 / zk);
            const tipY = t.y! - uy * (tR + 3 / zk);
            const size = 6 / zk;
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - ux * size - uy * size * 0.55, tipY - uy * size + ux * size * 0.55);
            ctx.lineTo(tipX - ux * size + uy * size * 0.55, tipY - uy * size - ux * size * 0.55);
            ctx.closePath();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = CYCLE_COLOR;
            ctx.fill();
          }

          // Micro bend-point dot at the curve's midpoint (fills the space between hubs)
          if (!geom.isStraight && alpha > 0.05) {
            const bx = (s.x! + 2 * geom.cx + t.x!) / 4;
            const by = (s.y! + 2 * geom.cy + t.y!) / 4;
            ctx.globalAlpha = Math.min(0.55, alpha * 2);
            ctx.fillStyle = e.isCycle ? CYCLE_COLOR : e.isViolation ? '#ff3b30' : '#c8c8c4';
            ctx.fillRect(bx - 0.6, by - 0.6, 1.2, 1.2);
          }
        });
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);

        // ── Draw Slow, Graceful Particle Pulses Along Lines & Curves ────────
        const particleFade = Math.max(0, Math.min(1, (now - introEndedAtRef.current) / 900));
        if (!introNow) particlesRef.current.forEach(p => {
          const s = nodeMap.get(p.source);
          const t = nodeMap.get(p.target);
          if (!s || !t) return;

          p.progress += p.speed;
          if (p.progress >= 1) p.progress = 0;

          const geom = edgeCurves.get(p.edgeId) || { isStraight: false, isDashed: false, cx: (s.x! + t.x!) / 2, cy: (s.y! + t.y!) / 2 };
          const pr = p.progress;

          let px = 0, py = 0;
          if (geom.isStraight) {
            px = (1 - pr) * s.x! + pr * t.x!;
            py = (1 - pr) * s.y! + pr * t.y!;
          } else {
            px = (1 - pr) * (1 - pr) * s.x! + 2 * (1 - pr) * pr * geom.cx + pr * pr * t.x!;
            py = (1 - pr) * (1 - pr) * s.y! + 2 * (1 - pr) * pr * geom.cy + pr * pr * t.y!;
          }

          const isHot = hotEdges.has(p.edgeId);
          const particleAlpha = (hasActiveFocus ? (isHot ? 1.0 : 0.20) : 0.90) * particleFade;

          ctx.globalAlpha = particleAlpha;

          // Faint trailing tail
          const prTrail = Math.max(0, pr - 0.025);
          let tx = 0, ty = 0;
          if (geom.isStraight) {
            tx = (1 - prTrail) * s.x! + prTrail * t.x!;
            ty = (1 - prTrail) * s.y! + prTrail * t.y!;
          } else {
            tx = (1 - prTrail) * (1 - prTrail) * s.x! + 2 * (1 - prTrail) * prTrail * geom.cx + prTrail * prTrail * t.x!;
            ty = (1 - prTrail) * (1 - prTrail) * s.y! + 2 * (1 - prTrail) * prTrail * geom.cy + prTrail * prTrail * t.y!;
          }
          ctx.beginPath();
          ctx.arc(tx, ty, p.isViolation ? 1.4 : 0.9, 0, Math.PI * 2);
          ctx.fillStyle = hexA(p.color, 0.40);
          ctx.fill();

          // Main luminous pulse
          ctx.beginPath();
          ctx.arc(px, py, p.isViolation ? 2.4 : 1.6, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = p.isViolation ? 7 : 4;
          ctx.fill();
          ctx.shadowBlur = 0;
        });
        ctx.globalAlpha = 1.0;

        // ── Draw Nodes with bl00d.money Styling (Optimized: No per-node ctx.save/restore) ──
        currentNodes.forEach(n => {
          const isHovered = hoveredNodeRef.current && hoveredNodeRef.current.id === n.id;
          const isSelected = selectedNode && selectedNode.id === n.id;
          const isHot = hotNodes.has(n.id);

          let nodeAlpha = 1.0;
          if (hasActiveFocus) {
            nodeAlpha = isHot ? 1.0 : highlightCycles ? 0.15 : 0.45;
          } else if (mode === 'violations' && n.violationsCount === 0 && !n.isCycle) {
            nodeAlpha = 0.12;
          } else if (highlightLayer && n.layer !== highlightLayer) {
            nodeAlpha = 0.25;
          }

          // Ethereal visual hierarchy matching bl00d.money
          let radius = nodeWorldR(n, cam.zoom, n.id === topNodeIdRef.current);
          if (isSelected) radius = radius * 1.35 + 2;

          if (introNow) {
            nodeAlpha *= introNow.al.get(n.id) ?? 0;
            if (nodeAlpha < 0.02) return;
          }
          ctx.globalAlpha = nodeAlpha;

          const isExternal = n.nodeType === 'external';

          // Draw Shape Based on Node Type
          const isViolation = n.violationsCount > 0;

          // Vibrant Neon Glow on Nodes (radiating node's own layer color)
          ctx.shadowColor = isViolation ? '#ff3b30' : n.color;
          ctx.shadowBlur = isViolation ? 10 : isHovered ? 14 : (n.totalDegree >= 8 ? 8 : 4.5);

          if (isViolation) {
            // Solid red disc, slightly smaller than a normal node of the same degree
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius * 0.75, 0, Math.PI * 2);
            ctx.fillStyle = '#ff3b30';
            ctx.fill();
          } else if (n.nodeType === 'external') {
            // Small fixed-size diamonds regardless of degree (same zoom scaling as other nodes)
            const dBase = 3.6 / Math.pow(Math.max(0.05, cam.zoom), 0.8);
            const dSize = isSelected ? dBase + 2.0 : dBase;
            ctx.beginPath();
            ctx.moveTo(n.x!, n.y! - dSize);
            ctx.lineTo(n.x! + dSize, n.y!);
            ctx.lineTo(n.x!, n.y! + dSize);
            ctx.lineTo(n.x! - dSize, n.y!);
            ctx.closePath();
            ctx.fillStyle = n.color;
            ctx.fill();
            ctx.strokeStyle = '#141413';
            ctx.lineWidth = 1;
            ctx.stroke();
          } else if (n.layer === 'Infrastructure') {
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius, 0, Math.PI * 2);
            ctx.fillStyle = n.color;
            ctx.fill();
            ctx.strokeStyle = '#080808';
            ctx.lineWidth = Math.max(1, radius * 0.18);
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius * 0.55, 0, Math.PI * 2);
            ctx.stroke();
          } else if (n.layer === 'Observability') {
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius, 0, Math.PI * 2);
            ctx.fillStyle = n.color;
            ctx.fill();
            if (radius > 3) {
              ctx.fillStyle = '#080808';
              ctx.beginPath();
              ctx.arc(n.x!, n.y!, radius * 0.45, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (n.layer === 'Stdlib') {
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius, 0, Math.PI * 2);
            ctx.fillStyle = n.color;
            ctx.fill();
            if (radius > 5) {
              ctx.fillStyle = '#080808';
              ctx.beginPath();
              ctx.arc(n.x!, n.y!, radius * 0.35, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius, 0, Math.PI * 2);
            ctx.fillStyle = n.color;
            ctx.fill();
          }

          ctx.shadowBlur = 0;

          // Cycle members get a violet ring (on top of the layer/violation fill)
          if (n.isCycle) {
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, (isViolation ? radius * 0.75 : radius) + 2.2 / Math.pow(Math.max(0.05, cam.zoom), 0.8), 0, Math.PI * 2);
            ctx.strokeStyle = CYCLE_COLOR;
            ctx.lineWidth = 1.4 / Math.pow(Math.max(0.05, cam.zoom), 0.7);
            ctx.shadowColor = CYCLE_COLOR;
            ctx.shadowBlur = 8;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }

          // Decluttered Labels with Compact, Sleek Typography
          const isTopLandmark = n.totalDegree >= 18;
          const shouldShowLabel =
            isSelected ||
            isHovered ||
            (hasActiveFocus && isHot) ||
            n.violationsCount > 0 ||
            n.isCycle ||
            (cam.zoom >= 2.0) ||
            (cam.zoom >= 1.5 && n.totalDegree >= 10) ||
            (cam.zoom >= 0.85 && isTopLandmark);

          if (isHovered) {
            ctx.font = '600 9.5px ui-monospace, SFMono-Regular, monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const textX = n.x! + radius + 6;
            const textY = n.y!;

            ctx.lineWidth = 2.5;
            ctx.strokeStyle = 'rgba(8, 8, 8, 0.95)';
            ctx.strokeText(n.label, textX, textY);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(n.label, textX, textY);
          } else if (shouldShowLabel) {
            ctx.font = `${isSelected ? 'bold 8.5px' : '7.5px'} ui-monospace, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const textY = n.y! + radius + 4;

            ctx.lineWidth = 2.0;
            ctx.strokeStyle = 'rgba(8, 8, 8, 0.90)';
            ctx.strokeText(n.label, n.x!, textY);
            ctx.fillStyle = isSelected ? '#e8ff00' : n.isCycle ? '#d98cff' : n.violationsCount > 0 ? '#ff5c2b' : '#d1d5db';
            ctx.fillText(n.label, n.x!, textY);
          }
        });
        ctx.globalAlpha = 1.0;

        ctx.restore();
      } catch (err) {
        console.error("ConformanceCanvas render error:", err);
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    renderRef.current = render;
    render();

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [mode, selectedNode, selectedEdge, highlightLayer, highlightCycles, finishIntro]);

  // Window resize listener
  // Window resize listener (does not move or reset user camera)
  useEffect(() => {
    const handleResize = () => {
      // Dimensions synchronize cleanly in requestAnimationFrame
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Reset Camera smoothly to default fitted view with straight names (0 rotation)
  const handleResetCamera = useCallback(() => {
    ambientRotationRef.current = 0; // Snap/reset rotation back to 0 where all names are straight
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 1200;
    const h = canvas.clientHeight || 800;
    const currentNodes = simNodesRef.current;
    if (currentNodes.length === 0) return;

    const targetCam = computeFitT(currentNodes, w, h, 75);
    cameraTweenRef.current = {
      t0: performance.now(),
      dur: reduceMotionRef.current ? 1 : 600,
      startX: cameraRef.current.x,
      startY: cameraRef.current.y,
      startZoom: cameraRef.current.zoom,
      targetX: targetCam.x,
      targetY: targetCam.y,
      targetZoom: targetCam.zoom
    };
  }, []);

  // Focus request (search pick, violation card): tween the camera so the node sits mid-screen.
  // Waits a few frames for a layout switch (e.g. orbit) to place it, then follows where it lands.
  useEffect(() => {
    if (!focusNodeId) return;
    let frames = 0;
    let raf = 0;
    const aim = () => {
      const n = simNodesRef.current.find(x => x.id === focusNodeId);
      if (!n || n.x === undefined || n.y === undefined) {
        if (frames++ < 30) raf = requestAnimationFrame(aim);
        return;
      }
      const rot = mode === 'network' ? ambientRotationRef.current : 0;
      const rx = n.x * Math.cos(rot) - n.y * Math.sin(rot);
      const ry = n.x * Math.sin(rot) + n.y * Math.cos(rot);
      const zoom = Math.min(2.2, Math.max(cameraRef.current.zoom, 1.35));
      cameraTweenRef.current = {
        t0: performance.now(),
        dur: reduceMotionRef.current ? 1 : 650,
        startX: cameraRef.current.x,
        startY: cameraRef.current.y,
        startZoom: cameraRef.current.zoom,
        targetX: -rx * zoom,
        targetY: -ry * zoom,
        targetZoom: zoom
      };
    };
    // let the selection's layout tween run first so the camera aims at the node's final spot
    const t = setTimeout(() => { raf = requestAnimationFrame(aim); }, layoutTweenRef.current ? 700 : 0);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new focusSeq is the trigger
  }, [focusSeq]);

  // Cycle spotlight switched on: frame all cycle members (in the current, possibly rotated, view)
  useEffect(() => {
    if (!highlightCycles) return;
    let frames = 0;
    let raf = 0;
    const aim = () => {
      const canvas = canvasRef.current;
      const members = simNodesRef.current.filter(n => n.isCycle && n.x !== undefined && n.y !== undefined);
      if (!canvas || members.length === 0) {
        if (frames++ < 30) raf = requestAnimationFrame(aim);
        return;
      }
      const rot = mode === 'network' ? ambientRotationRef.current : 0;
      const pts = members.map(n => ({
        x: n.x! * Math.cos(rot) - n.y! * Math.sin(rot),
        y: n.x! * Math.sin(rot) + n.y! * Math.cos(rot)
      }));
      const target = computeFitT(pts, canvas.clientWidth || 1200, canvas.clientHeight || 800, 90);
      cameraTweenRef.current = {
        t0: performance.now(),
        dur: reduceMotionRef.current ? 1 : 650,
        startX: cameraRef.current.x,
        startY: cameraRef.current.y,
        startZoom: cameraRef.current.zoom,
        targetX: target.x,
        targetY: target.y,
        targetZoom: target.zoom
      };
    };
    raf = requestAnimationFrame(aim);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-frame when the spotlight turns on
  }, [highlightCycles]);

  // ── Precision High-DPI Mouse Spatial Raycasting ──
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const rot = mode === 'network' ? ambientRotationRef.current : 0;
    const mx = (clientX - rect.left - rect.width / 2 - cam.x) / cam.zoom;
    const my = (clientY - rect.top - rect.height / 2 - cam.y) / cam.zoom;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    return {
      x: mx * cos + my * sin,
      y: -mx * sin + my * cos
    };
  }, [mode]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (introRef.current) {
      finishIntro();
      return;
    }
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const nodesList = simNodesRef.current;
    const rot = mode === 'network' ? ambientRotationRef.current : 0;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    // High-Precision Screen-Space Raycasting: Find true closest node
    let closestNode: ConformanceNode | null = null;
    let minScreenDist = Infinity;

    for (let i = 0; i < nodesList.length; i++) {
      const n = nodesList[i];
      if (n.x === undefined || n.y === undefined) continue;

      const rx = n.x * cos - n.y * sin;
      const ry = n.x * sin + n.y * cos;
      const screenX = rect.left + rect.width / 2 + cam.x + rx * cam.zoom;
      const screenY = rect.top + rect.height / 2 + cam.y + ry * cam.zoom;
      const sDx = e.clientX - screenX;
      const sDy = e.clientY - screenY;
      const screenDist = Math.hypot(sDx, sDy);

      const hitRadius = Math.max(9, nodeWorldR(n, cam.zoom, n.id === topNodeIdRef.current) * cam.zoom + 4);
      if (screenDist <= hitRadius && screenDist < minScreenDist) {
        minScreenDist = screenDist;
        closestNode = n;
      }
    }

    const targetNode = hoveredNodeRef.current || closestNode;
    if (targetNode) {
      onSelectNode(targetNode);
      onSelectEdge(null);
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const edgesList = simEdgesRef.current;
    const nodeMap = new Map<string, ConformanceNode>();
    nodesList.forEach(n => nodeMap.set(n.id, n));
    const world = screenToWorld(e.clientX, e.clientY);

    for (const edge of edgesList) {
      const s = nodeMap.get(edge.source);
      const t = nodeMap.get(edge.target);
      if (!s || !t) continue;

      const l2 = (t.x! - s.x!) ** 2 + (t.y! - s.y!) ** 2;
      let tParam = ((world.x - s.x!) * (t.x! - s.x!) + (world.y - s.y!) * (t.y! - s.y!)) / l2;
      tParam = Math.max(0, Math.min(1, tParam));
      const projX = s.x! + tParam * (t.x! - s.x!);
      const projY = s.y! + tParam * (t.y! - s.y!);
      const dSq = (world.x - projX) ** 2 + (world.y - projY) ** 2;

      if (dSq < 64) {
        // Defer edge selection to pointer-up so press-and-drag over an edge still pans
        pendingEdgeRef.current = edge;
        break;
      }
    }

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragOriginRef.current = { x: e.clientX, y: e.clientY };
    if (!pendingEdgeRef.current) {
      onSelectNode(null);
      onSelectEdge(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    // Re-arm hover after the intro only on a real move (the hand-back's layout change can
    // fire a synthetic pointermove at the same spot)
    if (!hoverArmedRef.current) {
      if (!hoverOriginRef.current) hoverOriginRef.current = { x: e.clientX, y: e.clientY };
      else if (Math.hypot(e.clientX - hoverOriginRef.current.x, e.clientY - hoverOriginRef.current.y) > 4) {
        hoverArmedRef.current = true;
        hoverOriginRef.current = null;
      }
    }
    mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, isInside: true };
    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handlePointerLeave = () => {
    isDraggingRef.current = false;
    pendingEdgeRef.current = null;
    mousePosRef.current.isInside = false;
    hoveredNodeRef.current = null;
    hoveredEdgeRef.current = null;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    const edge = pendingEdgeRef.current;
    pendingEdgeRef.current = null;
    if (!edge) return;
    const moved = Math.hypot(e.clientX - dragOriginRef.current.x, e.clientY - dragOriginRef.current.y);
    if (moved < 5) {
      onSelectEdge(edge);
      onSelectNode(null);
    }
  };

  // Native non-passive wheel listener for smooth zoom without browser warnings
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (introRef.current) return;
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      cameraRef.current.zoom = Math.min(3.5, Math.max(0.18, cameraRef.current.zoom * zoomFactor));
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`${SLOT_WRAPPER_CLASS} ${WRAPPER_CLASS}`}
    >
      {introActive && (
        <button
          onClick={finishIntro}
          title="Skip intro"
          aria-label="Skip intro"
          className="absolute bottom-6 right-6 z-30 w-8 h-8 rounded-full border border-[#343434] text-[#8b8b86] hover:text-[#e8ff00] hover:border-[#e8ff00]/50 font-mono text-sm transition-colors cursor-pointer"
        >
          »
        </button>
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing block"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleResetCamera}
      />

      {/* Top Right: Reset / Default View Button */}
      <div className={`absolute top-3.5 right-3.5 z-20 transition-opacity duration-300 ease-out ${introActive ? 'opacity-0 pointer-events-none' : ''}`}>
        <button
          onClick={handleResetCamera}
          title="Reset Camera to Default View (Fit)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e0e0d]/90 hover:bg-[#1a1a19] text-[#a0a0a0] hover:text-[#e8ff00] border border-[#2a2a29] hover:border-[#e8ff00]/40 transition-all font-mono text-xs shadow-xl backdrop-blur-md cursor-pointer group select-none active:scale-95"
        >
          <svg className="w-3.5 h-3.5 text-[#8b8b86] group-hover:text-[#e8ff00] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          <span className="tracking-wider font-semibold">DEFAULT VIEW</span>
        </button>
      </div>
    </div>
  );
};
