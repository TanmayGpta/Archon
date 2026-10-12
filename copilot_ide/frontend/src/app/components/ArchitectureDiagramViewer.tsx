'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';

export interface ArchNode {
  node_id: string;
  name: string;
  node_type: string;
  layer?: string;
  description: string;
  responsibilities: string[];
  traced_requirements: string[];
  kb_citations: string[];
}

export interface ArchEdge {
  edge_id: string;
  source: string;
  target: string;
  edge_type: string;
  protocol?: string;
  payload_description?: string;
  traced_requirements: string[];
  kb_citations: string[];
  justification: string;
}

interface ArchitectureDiagramViewerProps {
  projectName: string;
  style: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  plantuml?: string;
  mermaid?: string;
}

// ── PlantUML 64-bit Encoder ───────────────────────────────────────────
function encode64(data: Uint8Array): string {
  let r = '';
  for (let i = 0; i < data.length; i += 3) {
    if (i + 2 === data.length) {
      r += append3bytes(data[i], data[i + 1], 0);
    } else if (i + 1 === data.length) {
      r += append3bytes(data[i], 0, 0);
    } else {
      r += append3bytes(data[i], data[i + 1], data[i + 2]);
    }
  }
  return r;
}

function append3bytes(b1: number, b2: number, b3: number): string {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3f;
  return encode6bit(c1 & 0x3f) + encode6bit(c2 & 0x3f) + encode6bit(c3 & 0x3f) + encode6bit(c4 & 0x3f);
}

function encode6bit(b: number): string {
  if (b < 10) return String.fromCharCode(48 + b);
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  if (b === 0) return '-';
  if (b === 1) return '_';
  return '?';
}

async function encodePlantUML(pumlText: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pumlText);
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  return '~1' + encode64(merged);
}

export function ArchitectureDiagramViewer({
  projectName,
  style,
  nodes,
  edges,
  plantuml = '',
  mermaid = '',
}: ArchitectureDiagramViewerProps) {
  // View mode: 'canvas' | 'mermaid' | 'plantuml'
  const [viewMode, setViewMode] = useState<'canvas' | 'mermaid' | 'plantuml'>('canvas');
  // Raw code vs Rendered SVG toggle (for mermaid & plantuml)
  const [showCode, setShowCode] = useState<boolean>(false);

  // Zoom & Pan
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Interactive selection & spotlighting
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string>('');

  // PlantUML URL & SVG state
  const [pumlUrl, setPumlUrl] = useState<string>('');
  const [pumlLoading, setPumlLoading] = useState<boolean>(false);

  // Mermaid SVG state
  const [mermaidSvg, setMermaidSvg] = useState<string>('');
  const [mermaidLoading, setMermaidLoading] = useState<boolean>(false);
  const [mermaidError, setMermaidError] = useState<string>('');

  // Synthesize fallback Mermaid if not pre-rendered in JSON
  const effectiveMermaid = useMemo(() => {
    if (mermaid && mermaid.trim()) return mermaid;
    if (!nodes || nodes.length === 0) return '';
    const lines: string[] = ['flowchart TD'];
    const layers: Record<string, ArchNode[]> = {};
    const noLayer: ArchNode[] = [];

    nodes.forEach(n => {
      const l = n.layer || (n.node_type === 'gateway' ? 'Presentation' : n.node_type === 'datastore' || n.node_type === 'queue' ? 'Infrastructure' : 'Application');
      if (!layers[l]) layers[l] = [];
      layers[l].push(n);
    });

    Object.entries(layers).forEach(([layerName, layerNodes]) => {
      const safeId = layerName.replace(/\s+/g, '_');
      lines.push(`    subgraph ${safeId}["${layerName}"]`);
      layerNodes.forEach(node => {
        const cleanName = node.name.replace(/["']/g, '');
        const type = (node.node_type || '').toLowerCase();
        if (type === 'datastore') {
          lines.push(`        ${node.node_id}[(" ${cleanName} ")]`);
        } else if (type === 'queue' || type === 'cache') {
          lines.push(`        ${node.node_id}{{" ${cleanName} "}}`);
        } else {
          lines.push(`        ${node.node_id}[" ${cleanName} "]`);
        }
      });
      lines.push('    end');
      lines.push('');
    });

    noLayer.forEach(node => {
      const cleanName = node.name.replace(/["']/g, '');
      lines.push(`    ${node.node_id}[" ${cleanName} "]`);
    });

    lines.push('');
    edges.forEach(e => {
      const arrow = e.edge_type === 'async_pubsub' ? '-.->' : '-->';
      const labelText = (e.protocol || e.edge_type || '').replace(/["']/g, '');
      const label = labelText ? `|"${labelText}"|` : '';
      lines.push(`    ${e.source} ${arrow}${label} ${e.target}`);
    });

    return lines.join('\n');
  }, [mermaid, nodes, edges]);

  // Synthesize fallback PlantUML if not pre-rendered in JSON
  const effectivePlantUML = useMemo(() => {
    if (plantuml && plantuml.trim()) return plantuml;
    if (!nodes || nodes.length === 0) return '';
    const lines = ['@startuml', 'skinparam componentStyle uml2', ''];
    lines.push(`title Architecture: ${projectName || 'System'} (${style || 'Component Architecture'})\n`);

    const layers: Record<string, ArchNode[]> = {};
    const noLayer: ArchNode[] = [];
    nodes.forEach(n => {
      const l = n.layer || (n.node_type === 'gateway' ? 'Presentation' : n.node_type === 'datastore' || n.node_type === 'queue' ? 'Infrastructure' : 'Application');
      if (!layers[l]) layers[l] = [];
      layers[l].push(n);
    });

    Object.entries(layers).forEach(([layerName, layerNodes]) => {
      lines.push(`package "${layerName}" {`);
      layerNodes.forEach(node => {
        lines.push(`  [${node.name}] as ${node.node_id} <<${node.node_type}>>`);
      });
      lines.push('}');
      lines.push('');
    });

    noLayer.forEach(node => {
      lines.push(`[${node.name}] as ${node.node_id} <<${node.node_type}>>`);
    });

    lines.push('');
    edges.forEach(e => {
      const arrow = e.edge_type === 'async_pubsub' ? '..>' : '-->';
      const label = `: ${e.protocol || e.edge_type}`;
      lines.push(`${e.source} ${arrow} ${e.target} ${label}`);
    });

    lines.push('');
    lines.push('@enduml');
    return lines.join('\n');
  }, [plantuml, projectName, style, nodes, edges]);

  // Encode PlantUML whenever effectivePlantUML changes
  useEffect(() => {
    if (!effectivePlantUML) return;
    let cancelled = false;
    setPumlLoading(true);
    encodePlantUML(effectivePlantUML)
      .then(enc => {
        if (!cancelled) {
          setPumlUrl(`https://www.plantuml.com/plantuml/svg/${enc}`);
          setPumlLoading(false);
        }
      })
      .catch(err => {
        console.warn('PlantUML encode error:', err);
        if (!cancelled) setPumlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectivePlantUML]);

  // Render Mermaid client-side whenever effectiveMermaid changes
  useEffect(() => {
    if (!effectiveMermaid || viewMode !== 'mermaid') return;
    let cancelled = false;
    setMermaidLoading(true);
    setMermaidError('');

    import('mermaid')
      .then(m => {
        const mermaidApi = m.default;
        mermaidApi.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'monospace',
          themeVariables: {
            darkMode: true,
            background: '#090d14',
            primaryColor: '#1e293b',
            primaryTextColor: '#f8fafc',
            primaryBorderColor: '#38bdf8',
            lineColor: '#38bdf8',
            secondaryColor: '#0f172a',
            tertiaryColor: '#111827',
          },
        });
        const id = 'mermaid-svg-' + Math.random().toString(36).substring(2, 9);
        return mermaidApi.render(id, effectiveMermaid);
      })
      .then(({ svg }) => {
        if (!cancelled) {
          setMermaidSvg(svg);
          setMermaidLoading(false);
        }
      })
      .catch(err => {
        console.warn('Mermaid render error:', err);
        if (!cancelled) {
          setMermaidError(String(err?.message || err));
          setMermaidLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveMermaid, viewMode]);

  // Pan interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleExportSvg = () => {
    let svgContent = '';
    let filename = `${projectName.toLowerCase().replace(/\s+/g, '_')}_architecture.svg`;

    if (viewMode === 'mermaid' && mermaidSvg) {
      svgContent = mermaidSvg;
    } else if (viewMode === 'plantuml' && pumlUrl) {
      window.open(pumlUrl, '_blank');
      return;
    }

    if (svgContent) {
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // Group nodes by Layer for sublime swimlane visualization
  const layers = ['Presentation', 'Application', 'Domain', 'Infrastructure'];
  const nodesByLayer: Record<string, ArchNode[]> = {
    Presentation: [],
    Application: [],
    Domain: [],
    Infrastructure: [],
  };

  nodes.forEach(n => {
    const l = n.layer || (n.node_type === 'gateway' ? 'Presentation' : n.node_type === 'datastore' || n.node_type === 'queue' ? 'Infrastructure' : 'Application');
    if (nodesByLayer[l]) {
      nodesByLayer[l].push(n);
    } else {
      nodesByLayer['Application'].push(n);
    }
  });

  // Calculate connected edges for spotlighting
  const activeSpotlightNodeId = hoveredNodeId || selectedNodeId;
  const connectedEdgeIds = new Set<string>();
  const connectedNodeIds = new Set<string>();

  if (activeSpotlightNodeId) {
    connectedNodeIds.add(activeSpotlightNodeId);
    edges.forEach(e => {
      if (e.source === activeSpotlightNodeId || e.target === activeSpotlightNodeId) {
        connectedEdgeIds.add(e.edge_id);
        connectedNodeIds.add(e.source);
        connectedNodeIds.add(e.target);
      }
    });
  }

  // Selected node details
  const selectedNode = nodes.find(n => n.node_id === selectedNodeId);

  // Stereotype badge styling
  const getNodeStereotypeStyle = (type: string) => {
    switch (type.toLowerCase()) {
      case 'gateway':
        return 'bg-[#0284c7]/20 text-[#38bdf8] border-[#0284c7]/40';
      case 'datastore':
        return 'bg-[#f59e0b]/20 text-[#fcd34d] border-[#f59e0b]/40';
      case 'queue':
        return 'bg-[#10b981]/20 text-[#34d399] border-[#10b981]/40';
      case 'module':
      case 'usecase':
        return 'bg-[#8b5cf6]/20 text-[#c4b5fd] border-[#8b5cf6]/40';
      default:
        return 'bg-[#6366f1]/20 text-[#a5b4fc] border-[#6366f1]/40';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#07090e] border border-[#1e293b] rounded-xl overflow-hidden relative select-none">
      {/* ── TOP CONTROL TOOLBAR ────────────────────────────────────── */}
      <div className="bg-[#0c1017] border-b border-[#1e293b] px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
        {/* Left: Diagram View Tabs */}
        <div className="flex items-center gap-1 bg-[#07090e] p-1 border border-[#1e293b] rounded-lg">
          <button
            onClick={() => {
              setViewMode('canvas');
              setShowCode(false);
            }}
            className={`px-3 py-1 rounded transition-all cursor-pointer ${
              viewMode === 'canvas' ? 'bg-[#1e293b] text-[#38bdf8] font-bold shadow-sm' : 'text-[#64748b] hover:text-[#cbd5e1]'
            }`}
          >
            Interactive Canvas
          </button>
          <button
            onClick={() => setViewMode('mermaid')}
            className={`px-3 py-1 rounded transition-all cursor-pointer ${
              viewMode === 'mermaid' ? 'bg-[#1e293b] text-[#38bdf8] font-bold shadow-sm' : 'text-[#64748b] hover:text-[#cbd5e1]'
            }`}
          >
            Mermaid (.mmd)
          </button>
          <button
            onClick={() => setViewMode('plantuml')}
            className={`px-3 py-1 rounded transition-all cursor-pointer ${
              viewMode === 'plantuml' ? 'bg-[#1e293b] text-[#38bdf8] font-bold shadow-sm' : 'text-[#64748b] hover:text-[#cbd5e1]'
            }`}
          >
            PlantUML (.puml)
          </button>
        </div>

        {/* Center: Secondary Code / Render Toggle (when in Mermaid or PlantUML) */}
        {viewMode !== 'canvas' && (
          <div className="flex items-center gap-1 bg-[#07090e] p-1 border border-[#1e293b] rounded-lg">
            <button
              onClick={() => setShowCode(false)}
              className={`px-2.5 py-0.5 rounded text-[11px] transition-all cursor-pointer ${
                !showCode ? 'bg-[#1e293b] text-[#38bdf8] font-semibold' : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              Rendered Graphic
            </button>
            <button
              onClick={() => setShowCode(true)}
              className={`px-2.5 py-0.5 rounded text-[11px] transition-all cursor-pointer ${
                showCode ? 'bg-[#1e293b] text-[#38bdf8] font-semibold' : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              Source Code
            </button>
          </div>
        )}

        {/* Right: Zoom & Export Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-[#07090e] border border-[#1e293b] rounded-lg px-1.5 py-0.5">
            <button
              onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
              className="text-[#94a3b8] hover:text-white px-1 cursor-pointer font-bold"
              title="Zoom Out"
            >
              -
            </button>
            <span className="text-[10px] text-[#64748b] px-1 min-w-[38px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
              className="text-[#94a3b8] hover:text-white px-1 cursor-pointer font-bold"
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={handleResetZoom}
              className="text-[10px] text-[#38bdf8] hover:underline px-1 cursor-pointer ml-0.5"
              title="Reset Zoom & Pan"
            >
              Reset
            </button>
          </div>

          {/* Copy Code */}
          <button
            onClick={() =>
              handleCopy(
                viewMode === 'plantuml' ? effectivePlantUML : viewMode === 'mermaid' ? effectiveMermaid : JSON.stringify({ nodes, edges }, null, 2),
                'diagram_text'
              )
            }
            className="px-2.5 py-1 rounded bg-[#1e293b] text-[#94a3b8] hover:text-[#f8fafc] text-xs cursor-pointer border border-[#334155] transition-all"
          >
            {copiedKey === 'diagram_text' ? 'Copied' : 'Copy Code'}
          </button>

          {/* Export SVG */}
          {((viewMode === 'mermaid' && mermaidSvg) || (viewMode === 'plantuml' && pumlUrl)) && (
            <button
              onClick={handleExportSvg}
              className="px-2.5 py-1 rounded bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs cursor-pointer transition-all font-semibold"
            >
              {viewMode === 'plantuml' ? 'Open High-Res' : 'Export SVG'}
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN CANVAS / RENDER VIEWPORT ─────────────────────────── */}
      <div
        className="flex-1 relative overflow-hidden bg-[#07090e] cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {/* VIEW 1: SUBLIME INTERACTIVE CANVAS */}
        {viewMode === 'canvas' && (
          <div
            className="w-full h-full p-8 transition-transform duration-75 origin-top-left flex flex-col gap-8 min-w-[900px]"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {layers.map(layerName => {
              const layerNodes = nodesByLayer[layerName] || [];
              if (layerNodes.length === 0) return null;

              return (
                <div
                  key={layerName}
                  className="bg-[#0b0f19]/70 border border-[#1e293b] rounded-2xl p-4 shadow-xl backdrop-blur-sm relative"
                >
                  {/* Layer Header Pill */}
                  <div className="flex items-center justify-between mb-3 border-b border-[#1e293b]/50 pb-2">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#38bdf8]">
                      {layerName} Layer
                    </span>
                    <span className="text-[10px] font-mono text-[#64748b]">
                      {layerNodes.length} {layerNodes.length === 1 ? 'component' : 'components'}
                    </span>
                  </div>

                  {/* Components Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {layerNodes.map(node => {
                      const isHovered = hoveredNodeId === node.node_id;
                      const isSelected = selectedNodeId === node.node_id;
                      const isConnected = connectedNodeIds.has(node.node_id);
                      const isDimmed = activeSpotlightNodeId && !isConnected;

                      return (
                        <div
                          key={node.node_id}
                          onMouseEnter={() => setHoveredNodeId(node.node_id)}
                          onMouseLeave={() => setHoveredNodeId(null)}
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedNodeId(selectedNodeId === node.node_id ? null : node.node_id);
                          }}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                            isSelected
                              ? 'bg-[#0e172a] border-[#38bdf8] ring-2 ring-[#38bdf8]/50 shadow-lg shadow-[#0284c7]/20'
                              : isHovered
                              ? 'bg-[#0f172a] border-[#38bdf8]/80 shadow-md shadow-[#0284c7]/10'
                              : isDimmed
                              ? 'bg-[#080d16]/40 border-[#1e293b]/40 opacity-30'
                              : 'bg-[#0b101c] border-[#1e293b] hover:border-[#334155]'
                          }`}
                        >
                          {/* Node Header */}
                          <div className="flex items-center justify-between gap-1.5 mb-1.5">
                            <span className="font-mono text-xs font-bold text-[#f8fafc] truncate">
                              {node.name}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-semibold border ${getNodeStereotypeStyle(
                                node.node_type
                              )}`}
                            >
                              {node.node_type}
                            </span>
                          </div>

                          {/* Node Description */}
                          <p className="text-[11px] text-[#94a3b8] line-clamp-2 leading-relaxed mb-2.5">
                            {node.description}
                          </p>

                          {/* Requirements Traceability */}
                          <div className="flex items-center gap-1 flex-wrap">
                            {node.traced_requirements.slice(0, 3).map(req => (
                              <span
                                key={req}
                                className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#0284c7]/15 text-[#38bdf8] border border-[#0284c7]/25"
                              >
                                {req}
                              </span>
                            ))}
                            {node.traced_requirements.length > 3 && (
                              <span className="text-[9px] font-mono text-[#64748b]">
                                +{node.traced_requirements.length - 3}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW 2: MERMAID LIVE SVG RENDERER */}
        {viewMode === 'mermaid' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-6">
            {showCode ? (
              <pre className="w-full h-full bg-[#05070b] p-6 text-xs font-mono text-[#34d399] overflow-auto rounded-xl border border-[#1e293b]">
                {effectiveMermaid || 'No Mermaid specification generated.'}
              </pre>
            ) : mermaidLoading ? (
              <div className="flex flex-col items-center gap-3 text-xs text-[#38bdf8] font-mono">
                <svg className="w-6 h-6 animate-spin text-[#38bdf8]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Synthesizing vector graph with Mermaid.js...</span>
              </div>
            ) : mermaidError ? (
              <div className="max-w-md bg-[#1f1315] border border-[#f43f5e]/40 p-4 rounded-xl text-xs text-[#fca5a5] font-mono">
                <div className="font-bold text-[#f43f5e] mb-1">Mermaid Render Notice:</div>
                <div className="mb-3 text-[11px] leading-relaxed">{mermaidError}</div>
                <button
                  onClick={() => setShowCode(true)}
                  className="px-2.5 py-1 rounded bg-[#331b20] text-[#fca5a5] hover:text-white border border-[#f43f5e]/30 text-xs cursor-pointer"
                >
                  Inspect Raw .mmd Source
                </button>
              </div>
            ) : (
              <div
                className="w-full h-full flex items-center justify-center transition-transform origin-center"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
                dangerouslySetInnerHTML={{ __html: mermaidSvg }}
              />
            )}
          </div>
        )}

        {/* VIEW 3: PLANTUML LIVE VECTOR RENDERER */}
        {viewMode === 'plantuml' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-6">
            {showCode ? (
              <pre className="w-full h-full bg-[#05070b] p-6 text-xs font-mono text-[#a5b4fc] overflow-auto rounded-xl border border-[#1e293b]">
                {effectivePlantUML || 'No PlantUML specification generated.'}
              </pre>
            ) : pumlLoading ? (
              <div className="flex flex-col items-center gap-3 text-xs text-[#38bdf8] font-mono">
                <svg className="w-6 h-6 animate-spin text-[#38bdf8]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Compressing & fetching PlantUML SVG vector...</span>
              </div>
            ) : pumlUrl ? (
              <div
                className="w-full h-full flex items-center justify-center transition-transform origin-center"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pumlUrl}
                  alt="Rendered PlantUML Architecture Diagram"
                  className="max-w-none max-h-none shadow-2xl rounded-lg border border-[#1e293b]/60 bg-[#07090e]"
                  onError={() => {
                    console.warn('Failed to load PlantUML SVG, falling back to source view');
                    setShowCode(true);
                  }}
                />
              </div>
            ) : (
              <pre className="w-full h-full bg-[#05070b] p-6 text-xs font-mono text-[#a5b4fc] overflow-auto rounded-xl border border-[#1e293b]">
                {effectivePlantUML}
              </pre>
            )}
          </div>
        )}

        {/* ── SLIDE-OVER NODE CONTRACT INSPECTOR DRAWER ──────────────── */}
        {selectedNode && (
          <div
            className="absolute top-4 right-4 bottom-4 w-96 bg-[#090d16]/95 border border-[#38bdf8]/40 rounded-2xl shadow-2xl backdrop-blur-md p-5 flex flex-col gap-4 overflow-y-auto z-20"
            onClick={e => e.stopPropagation()}
          >
            {/* Inspector Header */}
            <div className="flex items-start justify-between border-b border-[#1e293b] pb-3">
              <div>
                <span className="text-[10px] font-mono text-[#38bdf8] font-bold block mb-1">
                  {selectedNode.node_id} • {selectedNode.layer || 'Application'}
                </span>
                <h3 className="text-base font-bold text-[#f8fafc] leading-snug">
                  {selectedNode.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-[#64748b] hover:text-[#cbd5e1] text-sm p-1 cursor-pointer"
                title="Close Inspector"
              >
                ✕
              </button>
            </div>

            {/* Description */}
            <div>
              <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider block mb-1">
                Architectural Role:
              </span>
              <p className="text-xs text-[#cbd5e1] leading-relaxed">
                {selectedNode.description}
              </p>
            </div>

            {/* Responsibilities */}
            {selectedNode.responsibilities && selectedNode.responsibilities.length > 0 && (
              <div>
                <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider block mb-1.5">
                  Responsibilities:
                </span>
                <ul className="space-y-1">
                  {selectedNode.responsibilities.map((resp, i) => (
                    <li key={i} className="text-xs text-[#94a3b8] flex items-start gap-2 leading-snug">
                      <span className="text-[#38bdf8] font-bold mt-0.5">•</span>
                      <span>{resp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Connected Relations (Inbound & Outbound) */}
            <div>
              <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider block mb-1.5">
                Connected Data Flows:
              </span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {edges
                  .filter(e => e.source === selectedNode.node_id || e.target === selectedNode.node_id)
                  .map(e => {
                    const isSource = e.source === selectedNode.node_id;
                    const otherNodeId = isSource ? e.target : e.source;
                    const otherNode = nodes.find(n => n.node_id === otherNodeId);

                    return (
                      <div
                        key={e.edge_id}
                        className="p-2 rounded-lg bg-[#0f172a] border border-[#1e293b] text-[11px] font-mono flex items-center justify-between"
                      >
                        <div>
                          <span className={isSource ? 'text-[#38bdf8]' : 'text-[#34d399]'}>
                            {isSource ? '→ OUT: ' : '← IN: '}
                          </span>
                          <span className="text-[#f1f5f9] font-semibold">
                            {otherNode?.name || otherNodeId}
                          </span>
                          {e.protocol && (
                            <span className="text-[10px] text-[#64748b] block mt-0.5">
                              {e.protocol}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#38bdf8] bg-[#0284c7]/20 px-1.5 py-0.5 rounded border border-[#0284c7]/30">
                          {e.edge_type}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Traced Requirements */}
            {selectedNode.traced_requirements && selectedNode.traced_requirements.length > 0 && (
              <div>
                <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider block mb-1">
                  Traced Requirements:
                </span>
                <div className="flex flex-wrap gap-1">
                  {selectedNode.traced_requirements.map(req => (
                    <span
                      key={req}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0284c7]/15 text-[#38bdf8] border border-[#0284c7]/30 font-semibold"
                    >
                      {req}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* KB Citations */}
            {selectedNode.kb_citations && selectedNode.kb_citations.length > 0 && (
              <div className="pt-2 border-t border-[#1e293b]/60">
                <span className="text-[10px] font-mono text-[#64748b] uppercase tracking-wider block mb-1">
                  Pattern Citations:
                </span>
                <div className="flex flex-wrap gap-1">
                  {selectedNode.kb_citations.map(cit => (
                    <span
                      key={cit}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#10b981]/15 text-[#34d399] border border-[#10b981]/30"
                    >
                      {cit}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
