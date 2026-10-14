"use client";

import React, { useRef, useEffect, useCallback } from 'react';
import { ConformanceNode, ConformanceEdge, LayoutMode } from './types';

interface ConformanceCanvasProps {
  nodes: ConformanceNode[];
  edges: ConformanceEdge[];
  mode: LayoutMode;
  selectedNode: ConformanceNode | null;
  selectedEdge: ConformanceEdge | null;
  highlightLayer: string | null;
  filterLayers: Set<string>;
  onSelectNode: (node: ConformanceNode | null) => void;
  onSelectEdge: (edge: ConformanceEdge | null) => void;
}

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

function computeFitT(
  pts: Array<{ x?: number; y?: number }>,
  canvasW: number,
  canvasH: number,
  pad: number = 80
) {
  if (!pts || pts.length === 0) return { x: 0, y: 0, zoom: 0.85 };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  pts.forEach(p => {
    if (p.x !== undefined && p.y !== undefined) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
  });
  if (!isFinite(x0)) return { x: 0, y: 0, zoom: 0.85 };

  const spanW = Math.max(120, x1 - x0);
  const spanH = Math.max(120, y1 - y0);

  const avW = Math.max(150, canvasW - pad * 2);
  const avH = Math.max(150, canvasH - pad * 2);

  // Balanced fit zoom factor: airy margins, no over-magnification
  const k = Math.max(0.35, Math.min(1.05, Math.min(avW / spanW, avH / spanH)));
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
  filterLayers,
  onSelectNode,
  onSelectEdge
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Camera State
  const cameraRef = useRef({ x: 0, y: 0, zoom: 0.85 });
  const hasFittedInitialCameraRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
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
  const edgeCurvesRef = useRef<Map<string, { cx: number; cy: number; isStraight: boolean }>>(new Map());

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

    // ── 65-Tick Physics Relaxation (Ethereal Constellation & Zero-Overlap Guarantees) ──
    const totalTicks = 65;
    for (let tick = 0; tick < totalTicks; tick++) {
      const alpha = Math.pow(1 - tick / totalTicks, 1.3) * 0.85 + 0.04;

      // 1. Direct Link Springs with Degree-Normalized Damping (avoids super-hub collapse)
      visibleEdges.forEach(e => {
        const s = nMap.get(e.source);
        const t = nMap.get(e.target);
        if (!s || !t || s.x === undefined || t.x === undefined) return;

        const isSatellite = s.totalDegree < 10 || t.totalDegree < 10;
        const targetD = isSatellite ? 95 : 155;

        const sDeg = Math.max(1, s.totalDegree);
        const tDeg = Math.max(1, t.totalDegree);
        const kSpring = 0.04 * alpha;

        const dx = t.x - s.x;
        const dy = t.y! - s.y!;
        const d = Math.hypot(dx, dy) || 1;
        const force = ((d - targetD) / d) * kSpring;

        s.vx = (s.vx || 0) + (dx * force) / Math.sqrt(sDeg);
        s.vy = (s.vy || 0) + (dy * force) / Math.sqrt(sDeg);
        t.vx = (t.vx || 0) - (dx * force) / Math.sqrt(tDeg);
        t.vy = (t.vy || 0) - (dy * force) / Math.sqrt(tDeg);
      });

      // 2. Wide Electrostatic Repulsion & Guaranteed Collision Separation
      for (let i = 0; i < newSimNodes.length; i++) {
        const n1 = newSimNodes[i];

        for (let j = i + 1; j < newSimNodes.length; j++) {
          const n2 = newSimNodes[j];
          const dx = n2.x! - n1.x!;
          const dy = n2.y! - n1.y!;
          const distSq = dx * dx + dy * dy + 9;
          const dist = Math.sqrt(distSq);

          // Elastic Non-Superimposing Collision Barrier (Guaranteed clear breathing space)
          const rMin = n1.radius + n2.radius + 28;
          if (dist < rMin) {
            const overlap = (rMin - dist) * 0.45 * alpha;
            const nx = dx / dist;
            const ny = dy / dist;
            n1.vx = (n1.vx || 0) - nx * overlap;
            n1.vy = (n1.vy || 0) - ny * overlap;
            n2.vx = (n2.vx || 0) + nx * overlap;
            n2.vy = (n2.vy || 0) + ny * overlap;
          } else if (distSq < 200000) {
            const rep = (340.0 / (distSq + 49)) * alpha;
            n1.vx = (n1.vx || 0) - (dx / dist) * rep;
            n1.vy = (n1.vy || 0) - (dy / dist) * rep;
            n2.vx = (n2.vx || 0) + (dx / dist) * rep;
            n2.vy = (n2.vy || 0) + (dy / dist) * rep;
          }
        }

        // 3. Gentle Center of Mass Centering (prevents drift without crushing clusters)
        n1.vx = (n1.vx || 0) - n1.x! * 0.0016 * alpha;
        n1.vy = (n1.vy || 0) - n1.y! * 0.0016 * alpha;

        // Velocity clamp and integration
        const maxV = 16 * alpha;
        const vLen = Math.hypot(n1.vx || 0, n1.vy || 0);
        if (vLen > maxV) {
          n1.vx = ((n1.vx || 0) / vLen) * maxV;
          n1.vy = ((n1.vy || 0) / vLen) * maxV;
        }

        n1.vx! *= 0.74;
        n1.vy! *= 0.74;
        n1.x! += n1.vx!;
        n1.y! += n1.vy!;
      }
    }

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

    // Precompute Bézier control points (bl00d.money organic filaments: straight vs curved)
    const curvesMap = new Map<string, { cx: number; cy: number; isStraight: boolean }>();
    visibleEdges.forEach(e => {
      const s = nMap.get(e.source);
      const t = nMap.get(e.target);
      if (!s || !t || s.x === undefined || t.x === undefined) return;

      const hash = Math.abs(hashString(e.id));
      // ~25% of filaments remain clean straight lines, remainder curve organically
      const isStraight = (hash % 4) === 0;

      const mx = (s.x + t.x) / 2;
      const my = (s.y! + t.y!) / 2;
      const dx = t.x - s.x;
      const dy = t.y! - s.y!;
      const len = Math.hypot(dx, dy) || 1;

      // Perpendicular normal vector
      const nx = -dy / len;
      const ny = dx / len;

      // Hash-based lateral bend: range roughly [-17px, +17px]
      const bend = ((hash % 9) - 4) * 4.2;

      curvesMap.set(e.id, {
        cx: isStraight ? mx : mx + nx * bend,
        cy: isStraight ? my : my + ny * bend,
        isStraight
      });
    });
    edgeCurvesRef.current = curvesMap;

    simNodesRef.current = newSimNodes;
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
        speed: e.isViolation ? 0.0012 : 0.0006 + (i % 4) * 0.00012,
        isViolation: e.isViolation,
        color: e.isViolation ? '#ff3b30' : sNode?.color || '#4f9dff'
      });
    }
    particlesRef.current = newParticles;

    // Reset initial camera fit flag on data change so settled constellation is framed immediately
    hasFittedInitialCameraRef.current = false;
  }, [nodes, edges, filterLayers]);

  // Layout mode transition with cubic easing and camera auto-fit
  useEffect(() => {
    const currentNodes = simNodesRef.current;
    if (!currentNodes || currentNodes.length === 0) return;

    const netPos = networkPositionsRef.current;
    const targets = computeLayoutTargets(mode, currentNodes, simEdgesRef.current, netPos, selectedNode);

    const starts = new Map<string, { x: number; y: number }>();
    currentNodes.forEach(n => starts.set(n.id, { x: n.x || 0, y: n.y || 0 }));

    layoutTweenRef.current = {
      t0: performance.now(),
      dur: 950,
      starts,
      targets
    };

    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const targetCam = computeFitT(Array.from(targets.values()), rect.width, rect.height, 80);
        cameraTweenRef.current = {
          t0: performance.now(),
          dur: 950,
          startX: cameraRef.current.x,
          startY: cameraRef.current.y,
          startZoom: cameraRef.current.zoom,
          targetX: targetCam.x,
          targetY: targetCam.y,
          targetZoom: targetCam.zoom
        };
      }
    }
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
        const cssWidth = canvas.clientWidth || 1200;
        const cssHeight = canvas.clientHeight || 800;

        // Synchronize internal canvas bitmap resolution directly on render frame without ResizeObserver loops
        const targetW = Math.round(cssWidth * dpr);
        const targetH = Math.round(cssHeight * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const cam = cameraRef.current;
        const currentNodes = simNodesRef.current;
        const currentEdges = simEdgesRef.current;

        const nodeMap = new Map<string, ConformanceNode>();
        currentNodes.forEach(n => nodeMap.set(n.id, n));

        // ── 1. AMBIENT DRIFT, LAYOUT TWEEN, & CAMERA TWEEN ──
        const now = performance.now();
        const clock = now * 0.001;

        // Handle Initial Camera Fit on first valid render frame
        if (!hasFittedInitialCameraRef.current && currentNodes.length > 0 && cssWidth > 50) {
          cameraRef.current = computeFitT(currentNodes, cssWidth, cssHeight, 75);
          hasFittedInitialCameraRef.current = true;
        }

        // Handle Layout Tweening (Cubic Easing between modes)
        if (layoutTweenRef.current) {
          const tween = layoutTweenRef.current;
          const el = now - tween.t0;
          const p = Math.min(1, el / tween.dur);
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

        // Ambient solar system cosmic rotation (paused while hovering or dragging)
        if (!isDraggingRef.current && !hoveredNodeRef.current && !hoveredEdgeRef.current) {
          ambientRotationRef.current += 0.00022;
        }

        // ── Precision High-DPI Mouse Spatial Raycasting (Every Frame Synchronized) ──
        const rot = mode === 'network' ? ambientRotationRef.current : 0;
        if (mousePosRef.current.isInside && !isDraggingRef.current) {
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

            const hitRadius = Math.max(12, n.radius * cam.zoom + 8);
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

        const hasActiveFocus = activeNode !== null || selectedEdge !== null;

        // ── 3. CANVAS RENDERING ─────────────────────────────────────
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Background: Deep OLED Obsidian #080808
        ctx.fillStyle = '#080808';
        ctx.fillRect(0, 0, cssWidth, cssHeight);

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
          ctx.fillStyle = '#6b7280';
          ctx.font = 'bold 11px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('SCANNING CODEBASE ARCHITECTURAL GRAPH...', cssWidth / 2, cssHeight / 2);
          animFrameIdRef.current = requestAnimationFrame(render);
          return;
        }

        // Apply Surreal Solar System Cosmic Rotation to the graph network (network mode only)
        if (mode === 'network') {
          ctx.rotate(rot);
        }

        // Mode Guides (Orbit Rings / Cluster Labels)
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
              edgeCurves.set(e.id, {
                isStraight: preGeom.isStraight,
                isDashed: e.isViolation,
                cx: preGeom.cx,
                cy: preGeom.cy
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

          let lineWidth = isHot ? 1.5 : (geom.isDashed ? 0.6 : 0.65);
          let alpha = 0.22;

          if (e.isViolation) {
            alpha = hasActiveFocus ? (isHot ? 1.0 : 0.60) : 0.95;
            lineWidth = isHot ? 2.4 : 2.0;
          } else if (hasActiveFocus) {
            if (isHot) {
              alpha = 0.95;
              lineWidth = 1.5;
            } else {
              alpha = 0.06;
            }
          } else if (mode === 'violations') {
            alpha = 0.04;
          }

          let strokeStyle: string;
          if (e.isViolation) {
            strokeStyle = '#ff3b30';
          } else if (isHot) {
            strokeStyle = isSelected ? '#e8ff00' : s.color;
          } else {
            strokeStyle = s.color;
          }

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

          if (e.isViolation) {
            ctx.shadowColor = '#ff3b30';
            ctx.shadowBlur = 8;
            ctx.setLineDash([5, 4]);
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

          // Directional glowing chevrons on hot edges
          if (isHot) {
            let bx = 0, by = 0, angle = 0;
            if (geom.isStraight) {
              angle = Math.atan2(t.y! - s.y!, t.x! - s.x!);
              bx = s.x! + 0.88 * (t.x! - s.x!);
              by = s.y! + 0.88 * (t.y! - s.y!);
            } else {
              const tPos = 0.86;
              const ax = (1 - tPos) * (1 - tPos) * s.x! + 2 * (1 - tPos) * tPos * geom.cx + tPos * tPos * t.x!;
              const ay = (1 - tPos) * (1 - tPos) * s.y! + 2 * (1 - tPos) * tPos * geom.cy + tPos * tPos * t.y!;
              const tNext = 0.90;
              bx = (1 - tNext) * (1 - tNext) * s.x! + 2 * (1 - tNext) * tNext * geom.cx + tNext * tNext * t.x!;
              by = (1 - tNext) * (1 - tNext) * s.y! + 2 * (1 - tNext) * tNext * geom.cy + tNext * tNext * t.y!;
              angle = Math.atan2(by - ay, bx - ax);
            }

            ctx.fillStyle = e.isViolation ? '#ff3b30' : s.color;
            ctx.shadowColor = e.isViolation ? '#ff3b30' : s.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(bx - 7 * Math.cos(angle - 0.45), by - 7 * Math.sin(angle - 0.45));
            ctx.lineTo(bx - 7 * Math.cos(angle + 0.45), by - 7 * Math.sin(angle + 0.45));
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;

            // bl00d.money Badge Pill on Hot Connected Edges
            if (activeNode) {
              const otherId = e.source === activeNode.id ? e.target : e.source;
              const otherNode = nodeMap.get(otherId);
              if (otherNode) {
                const badgeText = e.isViolation ? 'VIOLATION' : otherNode.label;
                const tPos = 0.58;
                let px = 0, py = 0;
                if (geom.isStraight) {
                  px = (1 - tPos) * s.x! + tPos * t.x!;
                  py = (1 - tPos) * s.y! + tPos * t.y!;
                } else {
                  px = (1 - tPos) * (1 - tPos) * s.x! + 2 * (1 - tPos) * tPos * geom.cx + tPos * tPos * t.x!;
                  py = (1 - tPos) * (1 - tPos) * s.y! + 2 * (1 - tPos) * tPos * geom.cy + tPos * tPos * t.y!;
                }

                ctx.font = 'bold 9px ui-monospace, monospace';
                const metrics = ctx.measureText(badgeText);
                const bw = metrics.width + 12;
                const bh = 17;
                const bx = px - bw / 2;
                const by = py - bh / 2;

                ctx.fillStyle = 'rgba(10, 12, 16, 0.94)';
                ctx.strokeStyle = e.isViolation ? '#ff3b30' : (isSelected ? '#e8ff00' : otherNode.color);
                ctx.lineWidth = 1;

                ctx.beginPath();
                const rad = 3;
                ctx.moveTo(bx + rad, by);
                ctx.lineTo(bx + bw - rad, by);
                ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rad);
                ctx.lineTo(bx + bw, by + bh - rad);
                ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rad, by + bh);
                ctx.lineTo(bx + rad, by + bh);
                ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rad);
                ctx.lineTo(bx, by + rad);
                ctx.quadraticCurveTo(bx, by, bx + rad, by);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = e.isViolation ? '#ff3b30' : '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(badgeText, px, py);
              }
            }
          }
        });
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
        ctx.setLineDash([]);

        // ── Draw Slow, Graceful Particle Pulses Along Lines & Curves ────────
        particlesRef.current.forEach(p => {
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
          const particleAlpha = hasActiveFocus ? (isHot ? 1.0 : 0.20) : 0.90;

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
            nodeAlpha = isHot ? 1.0 : 0.45;
          } else if (mode === 'violations' && n.violationsCount === 0) {
            nodeAlpha = 0.12;
          } else if (highlightLayer && n.layer !== highlightLayer) {
            nodeAlpha = 0.25;
          }

          // Ethereal visual hierarchy matching bl00d.money
          const baseR = n.totalDegree >= 16 ? 9.2 : n.totalDegree >= 8 ? 7.0 : n.totalDegree >= 4 ? 5.0 : 3.5;
          let radius = baseR * Math.max(0.75, Math.min(1.35, Math.sqrt(cam.zoom)));
          if (isSelected) radius = radius * 1.35 + 2;
          else if (isHovered) radius = radius * 1.25 + 1;

          ctx.globalAlpha = nodeAlpha;

          const isExternal = n.nodeType === 'external';

          // Luminous Atmospheric Corona Glow (subtle for diamonds, soft celestial for circles)
          const coronaRadius = isHovered ? radius + 7 : (isExternal ? radius + 1.2 : radius + 4.0);
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, coronaRadius, 0, Math.PI * 2);
          ctx.fillStyle = n.violationsCount > 0 
            ? 'rgba(255, 59, 48, 0.40)' 
            : hexA(n.color, isHovered ? 0.45 : (isExternal ? 0.16 : 0.22));
          ctx.fill();

          // Draw Shape Based on Node Type
          const isViolation = n.violationsCount > 0;
          const needsShadow = isHovered || isSelected || isViolation;

          if (needsShadow) {
            ctx.shadowColor = isViolation ? '#ff3b30' : (isHovered ? '#e8ff00' : n.color);
            ctx.shadowBlur = isViolation ? 22 : 16;
          }

          if (isViolation) {
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#ff3b30';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius + 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff3b30';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius + 7.5, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 1.0;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (n.nodeType === 'external') {
            // Delicate, crisp jewel diamonds scaled proportionally
            const dBase = Math.min(4.8, Math.max(2.4, radius * 0.45));
            const dSize = isSelected ? dBase + 2.0 : isHovered ? dBase + 1.2 : dBase;
            ctx.beginPath();
            ctx.moveTo(n.x!, n.y! - dSize);
            ctx.lineTo(n.x! + dSize, n.y!);
            ctx.lineTo(n.x!, n.y! + dSize);
            ctx.lineTo(n.x! - dSize, n.y!);
            ctx.closePath();
            ctx.fillStyle = n.color;
            ctx.fill();
            ctx.strokeStyle = isHovered ? '#e8ff00' : '#141413';
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

          if (needsShadow) {
            ctx.shadowBlur = 0;
          }

          if (isSelected || isHovered) {
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, radius + 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#e8ff00';
            ctx.lineWidth = 1.8;
            ctx.stroke();
          }

          // bl00d.money Declutter: Landmark hubs only on overview; full labels on hover / zoom
          const isTopLandmark = n.totalDegree >= 18;
          const shouldShowLabel =
            isSelected ||
            isHovered ||
            (hasActiveFocus && isHot) ||
            n.violationsCount > 0 ||
            (cam.zoom >= 2.0) ||
            (cam.zoom >= 1.5 && n.totalDegree >= 10) ||
            (cam.zoom >= 0.85 && isTopLandmark);

          if (isHovered) {
            ctx.font = 'bold 12px ui-sans-serif, system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const textX = n.x! + radius + 9;
            const textY = n.y!;

            ctx.lineWidth = 3.5;
            ctx.strokeStyle = 'rgba(8, 8, 8, 0.95)';
            ctx.strokeText(n.label.toUpperCase(), textX, textY);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(n.label.toUpperCase(), textX, textY);
          } else if (shouldShowLabel) {
            ctx.font = `${isSelected ? 'bold 10px' : '9px'} ui-monospace, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const textY = n.y! + radius + 7;

            ctx.lineWidth = 2.5;
            ctx.strokeStyle = 'rgba(8, 8, 8, 0.90)';
            ctx.strokeText(n.label, n.x!, textY);
            ctx.fillStyle = isSelected ? '#e8ff00' : n.violationsCount > 0 ? '#ff5c2b' : '#d1d5db';
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

    render();

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [mode, selectedNode, selectedEdge, highlightLayer]);

  // Window resize listener
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || (window.innerHeight - 56);
      if (w > 0 && h > 0 && simNodesRef.current.length > 0) {
        cameraRef.current = computeFitT(simNodesRef.current, w, h, 75);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Precision High-DPI Mouse Spatial Raycasting with Cosmic Rotation ──
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const rot = ambientRotationRef.current;
    const mx = (clientX - rect.left - rect.width / 2 - cam.x) / cam.zoom;
    const my = (clientY - rect.top - rect.height / 2 - cam.y) / cam.zoom;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    return {
      x: mx * cos + my * sin,
      y: -mx * sin + my * cos
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const nodesList = simNodesRef.current;
    const rot = ambientRotationRef.current;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    // High-Precision Screen-Space Raycasting: Find true closest node accounting for rotation
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
      const screenDist = Math.sqrt(sDx * sDx + sDy * sDy);

      const hitRadius = Math.max(9, n.radius * cam.zoom + 4);
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
        onSelectEdge(edge);
        onSelectNode(null);
        return;
      }
    }

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    onSelectNode(null);
    onSelectEdge(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
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
    mousePosRef.current.isInside = false;
    hoveredNodeRef.current = null;
    hoveredEdgeRef.current = null;
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  // Native non-passive wheel listener for smooth zoom without browser warnings
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      cameraRef.current.zoom = Math.min(3.5, Math.max(0.18, cameraRef.current.zoom * zoomFactor));
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[#080808]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing block"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      />
    </div>
  );
};
