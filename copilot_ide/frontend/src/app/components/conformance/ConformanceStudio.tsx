"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ConformanceCanvas } from './ConformanceCanvas';
import {
  ConformanceAuditResult,
  ConformanceNode,
  ConformanceEdge,
  LayoutMode,
  BlueprintInfo,
  ConformanceViolation
} from './types';

interface ConformanceStudioProps {
  apiBase: string;
  initialPath?: string;
  initialBlueprintId?: string;
}

const getMockAuditData = (blueprintId: string): ConformanceAuditResult => ({
  status: 'preview',
  targetPath: 'C:\\Users\\krish\\OneDrive\\Desktop\\Archon (Interactive Preview)',
  blueprint: {
    id: blueprintId,
    name: 'Archon System Architecture',
    description: 'Interactive architectural reality graph preview'
  },
  metrics: {
    healthScore: 92.4,
    totalModules: 14,
    internalModules: 10,
    stdlibModules: 2,
    externalModules: 2,
    totalDependencies: 18,
    totalViolations: 2,
    cyclesCount: 0,
    layerDistribution: {
      Presentation: 2,
      Application: 3,
      Domain: 4,
      Infrastructure: 3,
      Observability: 2
    }
  },
  nodes: [
    { id: 'app.web', label: 'app.web', fullPath: 'app.web', layer: 'Presentation', nodeType: 'internal', color: '#e8ff00', inDegree: 0, outDegree: 3, totalDegree: 3, violationsCount: 1, isCycle: false, radius: 5.2 },
    { id: 'cli.main', label: 'cli.main', fullPath: 'cli.main', layer: 'Presentation', nodeType: 'internal', color: '#e8ff00', inDegree: 0, outDegree: 2, totalDegree: 2, violationsCount: 0, isCycle: false, radius: 4.6 },
    { id: 'generation.agent', label: 'generation.agent', fullPath: 'generation.agent', layer: 'Application', nodeType: 'internal', color: '#4f9dff', inDegree: 1, outDegree: 2, totalDegree: 3, violationsCount: 0, isCycle: false, radius: 5.2 },
    { id: 'healing.service', label: 'healing.service', fullPath: 'healing.service', layer: 'Application', nodeType: 'internal', color: '#4f9dff', inDegree: 1, outDegree: 2, totalDegree: 3, violationsCount: 0, isCycle: false, radius: 5.2 },
    { id: 'conformance.service', label: 'conformance.service', fullPath: 'conformance.service', layer: 'Application', nodeType: 'internal', color: '#4f9dff', inDegree: 1, outDegree: 2, totalDegree: 3, violationsCount: 0, isCycle: false, radius: 5.2 },
    { id: 'conformance.checker', label: 'conformance.checker', fullPath: 'conformance.checker', layer: 'Domain', nodeType: 'internal', color: '#6fd38a', inDegree: 2, outDegree: 1, totalDegree: 3, violationsCount: 0, isCycle: false, radius: 5.2 },
    { id: 'conformance.graph', label: 'conformance.graph', fullPath: 'conformance.graph', layer: 'Domain', nodeType: 'internal', color: '#6fd38a', inDegree: 2, outDegree: 1, totalDegree: 3, violationsCount: 0, isCycle: false, radius: 5.2 },
    { id: 'conformance.extraction', label: 'conformance.extraction', fullPath: 'conformance.extraction', layer: 'Domain', nodeType: 'internal', color: '#6fd38a', inDegree: 1, outDegree: 1, totalDegree: 2, violationsCount: 0, isCycle: false, radius: 4.6 },
    { id: 'domain.schema', label: 'domain.schema', fullPath: 'domain.schema', layer: 'Domain', nodeType: 'internal', color: '#6fd38a', inDegree: 4, outDegree: 1, totalDegree: 5, violationsCount: 1, isCycle: false, radius: 6.3 },
    { id: 'infra.database', label: 'infra.database', fullPath: 'infra.database', layer: 'Infrastructure', nodeType: 'internal', color: '#b48cff', inDegree: 2, outDegree: 0, totalDegree: 2, violationsCount: 1, isCycle: false, radius: 4.6 },
    { id: 'infra.redis', label: 'infra.redis', fullPath: 'infra.redis', layer: 'Infrastructure', nodeType: 'internal', color: '#b48cff', inDegree: 1, outDegree: 0, totalDegree: 1, violationsCount: 1, isCycle: false, radius: 3.7 },
    { id: 'infra.llm_client', label: 'infra.llm_client', fullPath: 'infra.llm_client', layer: 'Infrastructure', nodeType: 'internal', color: '#b48cff', inDegree: 2, outDegree: 0, totalDegree: 2, violationsCount: 0, isCycle: false, radius: 4.6 },
    { id: 'telemetry.metrics', label: 'telemetry.metrics', fullPath: 'telemetry.metrics', layer: 'Observability', nodeType: 'internal', color: '#a7d8e0', inDegree: 2, outDegree: 0, totalDegree: 2, violationsCount: 0, isCycle: false, radius: 4.6 },
    { id: 'telemetry.tracer', label: 'telemetry.tracer', fullPath: 'telemetry.tracer', layer: 'Observability', nodeType: 'internal', color: '#a7d8e0', inDegree: 1, outDegree: 0, totalDegree: 1, violationsCount: 0, isCycle: false, radius: 3.7 }
  ],
  edges: [
    { id: 'app.web->generation.agent', source: 'app.web', target: 'generation.agent', sourceLayer: 'Presentation', targetLayer: 'Application', isViolation: false, isCycle: false, severity: 'none' },
    { id: 'app.web->conformance.service', source: 'app.web', target: 'conformance.service', sourceLayer: 'Presentation', targetLayer: 'Application', isViolation: false, isCycle: false, severity: 'none' },
    { id: 'app.web->infra.database', source: 'app.web', target: 'infra.database', sourceLayer: 'Presentation', targetLayer: 'Infrastructure', lineNumber: 42, codeSnippet: 'from infra.database import db_session', isViolation: true, isCycle: false, severity: 'critical', violation: { source_module: 'app.web', target_module: 'infra.database', source_layer: 'Presentation', target_layer: 'Infrastructure', severity: 'critical', reason: 'Direct Presentation-to-Infrastructure Coupling', line_number: 42, code_snippet: 'from infra.database import db_session', explanation: 'Presentation layer directly queries persistence drivers, bypassing application use cases and business rules.', remediation: 'Introduce an Application use-case or service in app.web and delegate execution.' } },
    { id: 'cli.main->healing.service', source: 'cli.main', target: 'healing.service', sourceLayer: 'Presentation', targetLayer: 'Application', isViolation: false, isCycle: false, severity: 'none' },
    { id: 'generation.agent->domain.schema', source: 'generation.agent', target: 'domain.schema', sourceLayer: 'Application', targetLayer: 'Domain', isViolation: false, isCycle: false, severity: 'none' },
    { id: 'generation.agent->infra.llm_client', source: 'generation.agent', target: 'infra.llm_client', sourceLayer: 'Application', targetLayer: 'Infrastructure', isViolation: false, isCycle: false, severity: 'none' },
    { id: 'conformance.service->conformance.checker', source: 'conformance.service', target: 'conformance.checker', sourceLayer: 'Application', targetLayer: 'Domain', isViolation: false, isCycle: false, severity: 'none' },
    { id: 'conformance.service->conformance.graph', source: 'conformance.service', target: 'conformance.graph', sourceLayer: 'Application', targetLayer: 'Domain', isViolation: false, isCycle: false, severity: 'none' },
    { id: 'conformance.checker->conformance.extraction', source: 'conformance.checker', target: 'conformance.extraction', sourceLayer: 'Domain', targetLayer: 'Domain', isViolation: false, isCycle: false, severity: 'none' },
    { id: 'domain.schema->infra.redis', source: 'domain.schema', target: 'infra.redis', sourceLayer: 'Domain', targetLayer: 'Infrastructure', lineNumber: 18, codeSnippet: 'import redis; client = redis.Redis()', isViolation: true, isCycle: false, severity: 'critical', violation: { source_module: 'domain.schema', target_module: 'infra.redis', source_layer: 'Domain', target_layer: 'Infrastructure', severity: 'critical', reason: 'Domain Entity Contamination', line_number: 18, code_snippet: 'import redis; client = redis.Redis()', explanation: 'Pure enterprise domain entity connects directly to caching/I/O infrastructure. Domain models must remain pure.', remediation: 'Apply Dependency Inversion (DIP): define an abstract cache repository interface in Domain and inject it at runtime.' } },
    { id: 'conformance.checker->telemetry.metrics', source: 'conformance.checker', target: 'telemetry.metrics', sourceLayer: 'Domain', targetLayer: 'Observability', isViolation: false, isCycle: false, severity: 'none' }
  ],
  violations: [
    { source_module: 'app.web', target_module: 'infra.database', source_layer: 'Presentation', target_layer: 'Infrastructure', severity: 'critical', reason: 'Direct Presentation-to-Infrastructure Coupling: UI routes directly query database drivers.', line_number: 42, code_snippet: 'from infra.database import db_session', explanation: 'Presentation layer directly queries persistence drivers, bypassing application use cases and business rules.', remediation: 'Introduce an Application use-case or service in app.web and delegate execution.' },
    { source_module: 'domain.schema', target_module: 'infra.redis', source_layer: 'Domain', target_layer: 'Infrastructure', severity: 'critical', reason: 'Domain Entity Contamination: Pure business entity connects to external Redis cache.', line_number: 18, code_snippet: 'import redis; client = redis.Redis()', explanation: 'Pure enterprise domain entity connects directly to caching/I/O infrastructure. Domain models must remain pure.', remediation: 'Apply Dependency Inversion (DIP): define an abstract cache repository interface in Domain and inject it at runtime.' }
  ],
  cycles: [],
  layers: [
    { name: 'Presentation', color: '#e8ff00', count: 2 },
    { name: 'Application', color: '#4f9dff', count: 3 },
    { name: 'Domain', color: '#6fd38a', count: 4 },
    { name: 'Infrastructure', color: '#b48cff', count: 3 },
    { name: 'Observability', color: '#a7d8e0', count: 2 },
    { name: 'External', color: '#ff5c2b', count: 2 },
    { name: 'Stdlib', color: '#e2e2da', count: 2 }
  ],
  availableBlueprints: [
    { id: 'archon_architecture', name: 'Archon System Architecture', description: 'Production Archon architecture verified against multi-layer rules.' },
    { id: 'clean_architecture', name: 'Clean Architecture Standard', description: 'Strict Onion/Hexagonal Clean Architecture ruleset.' },
    { id: 'mvc_architecture', name: 'MVC 3-Tier Pattern', description: 'Model-View-Controller strict separation of concerns.' },
    { id: 'layered_architecture', name: 'Layered Architecture', description: 'N-Tier Enterprise Layered pattern.' }
  ]
});

export const ConformanceStudio: React.FC<ConformanceStudioProps> = ({ apiBase, initialPath, initialBlueprintId }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [auditData, setAuditData] = useState<ConformanceAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBackendOffline, setIsBackendOffline] = useState<boolean>(false);

  // Target Codebase Path State
  const [targetPath, setTargetPath] = useState<string>(initialPath || '');

  // View & Filter States
  const [mode, setMode] = useState<LayoutMode>('network');
  const [selectedNode, setSelectedNode] = useState<ConformanceNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<ConformanceEdge | null>(null);
  const [highlightLayer, setHighlightLayer] = useState<string | null>(null);
  const [filterLayers, setFilterLayers] = useState<Set<string>>(new Set());
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>(initialBlueprintId || 'archon_architecture');
  const [includeExternal, setIncludeExternal] = useState<boolean>(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<ConformanceNode[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Left rail collapse
  const [isRailOpen, setIsRailOpen] = useState<boolean>(true);

  // Fetch / Run Audit
  const runAudit = async (blueprintId?: string, customPath?: string) => {
    setLoading(true);
    setError(null);
    const bp = blueprintId || selectedBlueprintId;
    const pathToScan = customPath !== undefined ? customPath : targetPath;

    try {
      const res = await fetch(`${apiBase}/api/conformance/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_path: pathToScan.trim() ? pathToScan.trim() : undefined,
          blueprint_id: bp,
          include_external: includeExternal
        })
      });

      if (!res.ok) {
        throw new Error(`Audit failed with status ${res.status}`);
      }

      const data: ConformanceAuditResult = await res.json();
      setAuditData(data);
      setIsBackendOffline(false);

      const layersSet = new Set(data.layers.map(l => l.name));
      setFilterLayers(layersSet);
      setSelectedNode(null);
      setSelectedEdge(null);
    } catch (err: any) {
      console.warn('Backend unavailable, activating interactive preview:', err);
      setIsBackendOffline(true);
      const mock = getMockAuditData(bp);
      setAuditData(mock);
      setFilterLayers(new Set(mock.layers.map(l => l.name)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, [includeExternal]);

  // Keyboard shortcut '/' to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setIsSearchFocused(false);
        setSelectedEdge(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle Search Input
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q.trim() || !auditData) {
      setSearchResults([]);
      return;
    }
    const qLower = q.toLowerCase();
    const hits = auditData.nodes
      .filter(n => n.label.toLowerCase().includes(qLower) || n.id.toLowerCase().includes(qLower))
      .slice(0, 12);
    setSearchResults(hits);
  };

  // Toggle Layer Filter
  const toggleLayerFilter = (layerName: string) => {
    setFilterLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerName)) {
        next.delete(layerName);
      } else {
        next.add(layerName);
      }
      return next;
    });
  };

  // Find incoming/outgoing edges for selected node
  const nodeConnections = useMemo(() => {
    if (!selectedNode || !auditData) return { incoming: [], outgoing: [] };
    const incoming = auditData.edges.filter(e => e.target === selectedNode.id);
    const outgoing = auditData.edges.filter(e => e.source === selectedNode.id);
    return { incoming, outgoing };
  }, [selectedNode, auditData]);

  // Find violations for selected node
  const nodeViolations = useMemo(() => {
    if (!selectedNode || !auditData) return [];
    return auditData.violations.filter(
      v => v.source_module === selectedNode.id || v.target_module === selectedNode.id
    );
  }, [selectedNode, auditData]);

  return (
    <div className="relative w-full h-[calc(100vh-56px)] bg-[#080808] text-[#e0e0e0] font-sans overflow-hidden flex flex-col">
      {/* ── TOP HUD HEADER ────────────────────────────────────────── */}
      <header className="h-12 border-b border-[#1f1f1e] bg-[#0c0c0b]/90 backdrop-blur-md px-4 flex items-center justify-between z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsRailOpen(!isRailOpen)}
            className="p-1.5 rounded border border-[#343434] hover:border-[#e8ff00] text-[#a0a0a0] hover:text-[#e8ff00] transition-colors"
            title="Toggle Left Rail"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#e8ff00] animate-pulse" />
            <b className="font-mono text-xs tracking-wider text-white">ARCHON // CONFORMANCE STUDIO</b>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#1f1f1e] text-[#8b8b86] uppercase">
              Reality Graph
            </span>
          </div>
        </div>

        {/* Global Module Search */}
        <div className="relative w-72">
          <div className="relative flex items-center">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search module... (Press /)"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              className="w-full bg-[#141413] border border-[#2b2b2a] focus:border-[#e8ff00] rounded px-3 py-1 text-xs font-mono text-white placeholder-[#5a5a58] outline-none transition-colors"
            />
            <span className="absolute right-2 text-[10px] font-mono text-[#5a5a58] pointer-events-none">/</span>
          </div>

          {/* Search Results Dropdown */}
          {isSearchFocused && searchResults.length > 0 && (
            <div className="absolute top-9 left-0 right-0 bg-[#0e0e0d] border border-[#343434] rounded shadow-2xl z-50 max-h-60 overflow-y-auto">
              {searchResults.map(n => (
                <button
                  key={n.id}
                  onClick={() => {
                    setSelectedNode(n);
                    setSelectedEdge(null);
                    setIsSearchFocused(false);
                    setSearchQuery('');
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-[#1a1a19] flex items-center justify-between border-b border-[#1f1f1e] last:border-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: n.color }} />
                    <span className="font-mono text-xs text-white">{n.label}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#8b8b86]">{n.layer}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Target Project Path Selector */}
        <div className="flex items-center gap-1.5 bg-[#141413] border border-[#2b2b2a] rounded px-2.5 py-1">
          <span className="text-[10px] font-mono text-[#8b8b86]">📁 PATH:</span>
          <input
            type="text"
            placeholder="Default: Workspace Root"
            value={targetPath}
            onChange={e => setTargetPath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runAudit(undefined, targetPath)}
            className="w-44 md:w-56 bg-transparent text-xs font-mono text-[#e8ff00] placeholder-[#5a5a58] outline-none"
            title="Type or paste any codebase folder path to audit (Press Enter to scan)"
          />
          {targetPath && (
            <button
              onClick={() => {
                setTargetPath('');
                runAudit(undefined, '');
              }}
              className="text-[10px] font-mono text-[#8b8b86] hover:text-white"
              title="Reset to Workspace Root"
            >
              ✕
            </button>
          )}
          <button
            onClick={() => runAudit(selectedBlueprintId, targetPath)}
            className="px-2 py-0.5 rounded bg-[#e8ff00]/15 hover:bg-[#e8ff00] text-[#e8ff00] hover:text-black font-mono text-[10px] font-bold border border-[#e8ff00]/40 transition-all cursor-pointer"
            title="Scan this codebase folder"
          >
            SCAN
          </button>
        </div>

        {/* Blueprint & Audit Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-[#8b8b86]">Blueprint:</span>
            <select
              value={selectedBlueprintId}
              onChange={e => {
                setSelectedBlueprintId(e.target.value);
                runAudit(e.target.value, targetPath);
              }}
              className="bg-[#141413] border border-[#2b2b2a] text-white text-xs font-mono rounded px-2.5 py-1 outline-none focus:border-[#e8ff00]"
            >
              {(auditData?.availableBlueprints || [
                { id: 'archon_architecture', name: 'Archon System Architecture' },
                { id: 'clean_architecture', name: 'Clean Architecture' },
                { id: 'mvc_architecture', name: 'MVC Architecture' },
                { id: 'layered_architecture', name: 'Layered Architecture' }
              ]).map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIncludeExternal(!includeExternal)}
            className={`px-2.5 py-1 rounded text-xs font-mono border transition-all ${
              includeExternal
                ? 'bg-[#1a1a19] border-[#e8ff00] text-[#e8ff00]'
                : 'bg-transparent border-[#343434] text-[#8b8b86]'
            }`}
          >
            {includeExternal ? 'Stdlib + 3rd-Party: ON' : 'Internal Only'}
          </button>

          <button
            onClick={() => runAudit(selectedBlueprintId, targetPath)}
            disabled={loading}
            className="px-3 py-1 rounded bg-[#e8ff00] text-black font-mono text-xs font-bold hover:bg-[#d6ec00] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" strokeWidth="4" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeWidth="4" />
                </svg>
                <span>Auditing...</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                <span>Run Audit</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── GATEWAY STATUS BANNER ─────────────────────────────────── */}
      {isBackendOffline && (
        <div className="bg-[#1b1700] border-b border-[#e8ff00]/30 px-4 py-1.5 flex items-center justify-between text-xs font-mono text-[#e8ff00] z-20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse" />
            <span>PREVIEW MODE: Orchestrator service offline on port 8000. Exploring interactive architectural demo. Start backend to scan live local files.</span>
          </div>
          <span className="text-[10px] text-[#8b8b86]">Run: cd copilot_ide && docker compose up orchestrator-service</span>
        </div>
      )}

      {/* ── MAIN WORKSPACE VIEWPORT ───────────────────────────────── */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* ── LEFT RAIL: FILTERS & PRESETS ─────────────────────────── */}
        {isRailOpen && (
          <aside className="w-64 bg-[#0e0e0d]/95 border-r border-[#1f1f1e] backdrop-blur-md z-10 flex flex-col justify-between flex-shrink-0 overflow-y-auto">
            <div className="p-4 space-y-5">
              {/* Layer Filters */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono tracking-wider text-[#8b8b86] uppercase">
                    ARCHITECTURAL LAYERS
                  </span>
                  <span className="text-[10px] font-mono text-[#8b8b86]">
                    {auditData?.layers.length || 0}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {(auditData?.layers || []).map(layer => {
                    const isVisible = filterLayers.has(layer.name);
                    const isHl = highlightLayer === layer.name;
                    return (
                      <div
                        key={layer.name}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded border transition-all ${
                          isHl
                            ? 'bg-[#1f1f1e] border-[#e8ff00]'
                            : 'bg-[#141413] border-[#222221] hover:border-[#343434]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleLayerFilter(layer.name)}
                            className="w-3 h-3 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                            style={{
                              backgroundColor: isVisible ? layer.color : 'transparent',
                              border: `1.5px solid ${layer.color}`
                            }}
                            title={isVisible ? 'Hide layer' : 'Show layer'}
                          />
                          <button
                            onClick={() => setHighlightLayer(isHl ? null : layer.name)}
                            className="text-xs font-mono text-left hover:text-white transition-colors"
                            style={{ color: isHl ? '#e8ff00' : isVisible ? '#e0e0e0' : '#6b7280' }}
                          >
                            {layer.name}
                          </button>
                        </div>
                        <span className="text-[10px] font-mono text-[#6b7280]">{layer.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Preset Case Studies */}
              <div>
                <span className="text-[10px] font-mono tracking-wider text-[#8b8b86] uppercase block mb-2">
                  CASE PRESETS
                </span>
                <div className="space-y-1.5">
                  {[
                    { id: 'archon_architecture', name: 'Archon Core (100% Conforming)', tag: 'VERIFIED' },
                    { id: 'clean_architecture', name: 'Clean Architecture Rules', tag: 'STRICT' },
                    { id: 'mvc_architecture', name: 'MVC 3-Tier Pattern', tag: 'STANDARD' }
                  ].map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        setSelectedBlueprintId(preset.id);
                        runAudit(preset.id);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded border text-xs font-mono flex items-center justify-between transition-all ${
                        selectedBlueprintId === preset.id
                          ? 'bg-[#1b1b1a] border-[#e8ff00] text-[#e8ff00]'
                          : 'bg-[#141413] border-[#222221] text-[#a0a0a0] hover:text-white hover:border-[#343434]'
                      }`}
                    >
                      <span className="truncate pr-1">{preset.name}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-[#1f1f1e] text-[#8b8b86]">
                        {preset.tag}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Left Rail Footer Info */}
            <div className="p-4 border-t border-[#1f1f1e] text-[10px] font-mono text-[#5a5a58] space-y-1">
              <div>AST PARSER: Python 3.12</div>
              <div>SIMULATION: HTML5 60 FPS Canvas</div>
              <div>GRAPH: NetworkX DiGraph</div>
            </div>
          </aside>
        )}

        {/* ── CANVAS ENGINE (FULL BLEED) ───────────────────────────── */}
        <div className="relative flex-1 h-full bg-[#080808]">
          <ConformanceCanvas
            nodes={auditData?.nodes || []}
            edges={auditData?.edges || []}
            mode={mode}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            highlightLayer={highlightLayer}
            filterLayers={filterLayers}
            onSelectNode={setSelectedNode}
            onSelectEdge={setSelectedEdge}
          />

          {/* ── FLOATING EDGE INSPECTOR MODAL (#insp) ────────────────── */}
          {selectedEdge && (
            <div className="absolute top-4 left-4 max-w-md bg-[#0e0e0d]/95 border border-[#343434] rounded-lg p-4 shadow-2xl backdrop-blur-md z-30 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#1f1f1e]">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selectedEdge.isViolation ? 'bg-[#ff3b30]' : 'bg-[#10b981]'
                    }`}
                  />
                  <b className="text-white">
                    {selectedEdge.isViolation ? 'ARCHITECTURAL VIOLATION' : 'CONFORMING DEPENDENCY'}
                  </b>
                </div>
                <button
                  onClick={() => setSelectedEdge(null)}
                  className="text-[#8b8b86] hover:text-white px-1.5 py-0.5 rounded hover:bg-[#1f1f1e]"
                >
                  ✕
                </button>
              </div>

              {/* Source -> Target Vector */}
              <div className="space-y-1 mb-3 bg-[#141413] p-2.5 rounded border border-[#1f1f1e]">
                <div className="text-[#8b8b86] text-[10px]">VECTOR:</div>
                <div className="text-white font-bold truncate">
                  {selectedEdge.source} <span className="text-[#e8ff00]">───▶</span> {selectedEdge.target}
                </div>
                <div className="text-[10px] text-[#a0a0a0] flex gap-2 pt-1">
                  <span>Layer: <b className="text-[#e8ff00]">{selectedEdge.sourceLayer}</b></span>
                  <span>Target: <b className="text-[#4f9dff]">{selectedEdge.targetLayer}</b></span>
                </div>
              </div>

              {/* Code Snippet & Line Number */}
              {selectedEdge.codeSnippet && (
                <div className="mb-3">
                  <div className="text-[10px] text-[#8b8b86] mb-1">
                    OFFENDING CODE {selectedEdge.lineNumber ? `(LINE ${selectedEdge.lineNumber})` : ''}:
                  </div>
                  <pre className="p-2 bg-[#050505] border border-[#222221] rounded text-[11px] text-[#f87171] overflow-x-auto">
                    {selectedEdge.codeSnippet}
                  </pre>
                </div>
              )}

              {/* XAI Explanation & Remediation */}
              {selectedEdge.violation && (
                <div className="space-y-2 text-[11px]">
                  {selectedEdge.violation.explanation && (
                    <div className="p-2 rounded bg-[#ff3b30]/10 border border-[#ff3b30]/30 text-[#fca5a5]">
                      <b className="block text-[#ff5c2b] text-[10px] uppercase mb-0.5">Architectural Hazard:</b>
                      {selectedEdge.violation.explanation}
                    </div>
                  )}
                  {selectedEdge.violation.remediation && (
                    <div className="p-2 rounded bg-[#10b981]/10 border border-[#10b981]/30 text-[#6ee7b7]">
                      <b className="block text-[#10b981] text-[10px] uppercase mb-0.5">Recommended Remediation:</b>
                      {selectedEdge.violation.remediation}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── BOTTOM MODE SWITCHER PILL BAR (#modes) ──────────────── */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20">
            <div className="flex items-center gap-1 bg-[#0e0e0d]/90 border border-[#343434] p-1 rounded-lg backdrop-blur-md shadow-2xl">
              {[
                { id: 'network', label: 'NETWORK' },
                { id: 'orbit', label: 'ORBIT' },
                { id: 'clusters', label: 'CLUSTERS' },
                { id: 'flow', label: 'FLOW' },
                { id: 'violations', label: 'VIOLATIONS' }
              ].map(item => {
                const isActive = mode === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setMode(item.id as LayoutMode)}
                    className={`px-3 py-1.5 rounded text-[11px] font-mono tracking-wider transition-all flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-[#e8ff00]/15 text-[#e8ff00] border border-[#e8ff00]/40 font-bold'
                        : 'text-[#8b8b86] hover:text-white hover:bg-[#1f1f1e] border border-transparent'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isActive ? 'bg-[#e8ff00]' : 'bg-transparent border border-[#8b8b86]'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT DOSSIER: INTELLIGENCE PANEL (#dossier) ─────────── */}
        <aside className="w-80 bg-[#0e0e0d]/95 border-l border-[#1f1f1e] backdrop-blur-md z-10 flex flex-col justify-between flex-shrink-0 overflow-y-auto">
          {selectedNode ? (
            /* Selected Module Dossier */
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#1f1f1e]">
                <span className="text-[10px] font-mono text-[#8b8b86] tracking-wider uppercase">
                  MODULE DOSSIER
                </span>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-xs text-[#8b8b86] hover:text-white px-1.5 py-0.5 rounded hover:bg-[#1f1f1e]"
                >
                  ✕
                </button>
              </div>

              <div>
                <b className="text-base text-white font-mono break-all block">{selectedNode.label}</b>
                <span className="text-[11px] font-mono text-[#8b8b86] break-all block mt-0.5">
                  {selectedNode.fullPath}
                </span>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
                    style={{ backgroundColor: `${selectedNode.color}25`, color: selectedNode.color }}
                  >
                    {selectedNode.layer}
                  </span>
                  <span className="text-[10px] font-mono text-[#8b8b86]">
                    TYPE: {selectedNode.nodeType.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Module Metrics */}
              <div className="grid grid-cols-2 gap-2 bg-[#141413] p-3 rounded border border-[#1f1f1e] text-center font-mono">
                <div>
                  <div className="text-lg font-bold text-white">{selectedNode.inDegree}</div>
                  <div className="text-[9px] text-[#8b8b86]">INBOUND (CALLERS)</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-white">{selectedNode.outDegree}</div>
                  <div className="text-[9px] text-[#8b8b86]">OUTBOUND (CALLEES)</div>
                </div>
              </div>

              {/* Violations associated with this module */}
              {nodeViolations.length > 0 ? (
                <div>
                  <span className="text-[10px] font-mono text-[#ff3b30] tracking-wider uppercase block mb-1.5">
                    FLAGGED VIOLATIONS ({nodeViolations.length})
                  </span>
                  <div className="space-y-1.5">
                    {nodeViolations.map((v, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded bg-[#ff3b30]/10 border border-[#ff3b30]/30 text-xs font-mono space-y-1"
                      >
                        <div className="text-[#ff5c2b] font-bold">
                          {v.source_module} ──▶ {v.target_module}
                        </div>
                        <div className="text-[11px] text-[#fca5a5]">{v.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded bg-[#10b981]/10 border border-[#10b981]/25 text-xs font-mono text-[#6ee7b7] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                  <span>No architectural violations detected on this module.</span>
                </div>
              )}

              {/* Dependencies List */}
              <div className="space-y-3 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-[#8b8b86] uppercase block mb-1">
                    INCOMING DEPENDENCIES ({nodeConnections.incoming.length})
                  </span>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {nodeConnections.incoming.map(e => (
                      <div
                        key={e.id}
                        onClick={() => setSelectedEdge(e)}
                        className="px-2 py-1 rounded bg-[#141413] hover:bg-[#1f1f1e] cursor-pointer text-[11px] truncate flex items-center justify-between"
                      >
                        <span className="truncate">{e.source}</span>
                        <span className="text-[9px] text-[#8b8b86]">{e.sourceLayer}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-[#8b8b86] uppercase block mb-1">
                    OUTGOING DEPENDENCIES ({nodeConnections.outgoing.length})
                  </span>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {nodeConnections.outgoing.map(e => (
                      <div
                        key={e.id}
                        onClick={() => setSelectedEdge(e)}
                        className="px-2 py-1 rounded bg-[#141413] hover:bg-[#1f1f1e] cursor-pointer text-[11px] truncate flex items-center justify-between"
                      >
                        <span className="truncate">{e.target}</span>
                        <span className="text-[9px] text-[#8b8b86]">{e.targetLayer}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* System Overview Dossier */
            <div className="p-4 space-y-5">
              <div>
                <span className="text-[10px] font-mono text-[#8b8b86] tracking-wider uppercase block mb-1">
                  ARCHITECTURAL HEALTH SCORE
                </span>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-4xl font-mono font-bold ${
                      (auditData?.metrics.healthScore || 0) >= 90
                        ? 'text-[#e8ff00]'
                        : (auditData?.metrics.healthScore || 0) >= 70
                        ? 'text-[#f59e0b]'
                        : 'text-[#ff3b30]'
                    }`}
                  >
                    {auditData?.metrics.healthScore?.toFixed(1) || '0.0'}%
                  </span>
                  <span className="text-xs font-mono text-[#8b8b86]">CONFORMANCE</span>
                </div>
              </div>

              {/* Metric Blocks (.kv grid) */}
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="p-2.5 rounded bg-[#141413] border border-[#1f1f1e]">
                  <div className="text-[10px] text-[#8b8b86]">TOTAL MODULES</div>
                  <div className="text-lg font-bold text-white mt-0.5">
                    {auditData?.metrics.totalModules || 0}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#141413] border border-[#1f1f1e]">
                  <div className="text-[10px] text-[#8b8b86]">DEPENDENCIES</div>
                  <div className="text-lg font-bold text-white mt-0.5">
                    {auditData?.metrics.totalDependencies || 0}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#141413] border border-[#1f1f1e]">
                  <div className="text-[10px] text-[#8b8b86]">VIOLATIONS</div>
                  <div
                    className={`text-lg font-bold mt-0.5 ${
                      (auditData?.metrics.totalViolations || 0) > 0 ? 'text-[#ff3b30]' : 'text-[#10b981]'
                    }`}
                  >
                    {auditData?.metrics.totalViolations || 0}
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#141413] border border-[#1f1f1e]">
                  <div className="text-[10px] text-[#8b8b86]">CYCLES</div>
                  <div
                    className={`text-lg font-bold mt-0.5 ${
                      (auditData?.metrics.cyclesCount || 0) > 0 ? 'text-[#ff3b30]' : 'text-[#10b981]'
                    }`}
                  >
                    {auditData?.metrics.cyclesCount || 0}
                  </div>
                </div>
              </div>

              {/* Blueprint Summary */}
              {auditData?.blueprint && (
                <div className="p-3 rounded bg-[#141413] border border-[#1f1f1e] font-mono text-xs space-y-1">
                  <div className="text-[10px] text-[#8b8b86] uppercase">ACTIVE BLUEPRINT</div>
                  <div className="text-white font-bold">{auditData.blueprint.name}</div>
                  <div className="text-[11px] text-[#a0a0a0] leading-relaxed">
                    {auditData.blueprint.description}
                  </div>
                </div>
              )}

              {/* Violations List */}
              {(auditData?.violations || []).length > 0 && (
                <div>
                  <span className="text-[10px] font-mono text-[#ff3b30] uppercase block mb-1.5">
                    VIOLATIONS SUMMARY
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {auditData?.violations.map((v, i) => (
                      <div
                        key={i}
                        className="p-2 rounded bg-[#ff3b30]/10 border border-[#ff3b30]/30 font-mono text-xs space-y-0.5"
                      >
                        <div className="text-white font-bold truncate">
                          {v.source_module} ──▶ {v.target_module}
                        </div>
                        <div className="text-[10px] text-[#fca5a5]">{v.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dossier Footer */}
          <div className="p-4 border-t border-[#1f1f1e] font-mono text-[10px] text-[#5a5a58]">
            CLICK A NODE TO OPEN DOSSIER · CLICK AN EDGE TO INSPECT HAZARDS
          </div>
        </aside>
      </div>
    </div>
  );
};
