'use client';

import React, { useState } from 'react';
import { KnowledgeGraphData } from './CodeKnowledgeGraph';

interface IndexResult {
  status: string;
  project: string;
  files_scanned: number;
  endpoints_count: number;
  functions_count: number;
  classes_count: number;
  total_chunks: number;
  graph_nodes_count: number;
  graph_edges_count: number;
  duration_ms: number;
  graph?: KnowledgeGraphData;
  stats?: Record<string, number>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  apiBase: string;
  workspacePath?: string;
  isGitHubWorkspace?: boolean;
  githubRepoInfo?: any;
  githubToken?: string;
  currentGitHubBranch?: string;
  onIndexingComplete?: (data: KnowledgeGraphData) => void;
  onOpenGraph?: () => void;
  onTestQuery?: (query: string) => void;
}

export default function SourcegraphIndexDrawer({
  isOpen,
  onClose,
  projectName,
  apiBase,
  workspacePath,
  isGitHubWorkspace,
  githubRepoInfo,
  githubToken,
  currentGitHubBranch,
  onIndexingComplete,
  onOpenGraph,
  onTestQuery
}: Props) {
  const [stage, setStage] = useState<'idle' | 'scanning' | 'extracting' | 'embedding' | 'complete' | 'error'>('idle');
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [indexResult, setIndexResult] = useState<IndexResult | null>(null);
  const [testQueryText, setTestQueryText] = useState('');
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  if (!isOpen) return null;

  const handleStartIndexing = async () => {
    setStage('scanning');
    setProgressLog(['[Phase 1] Scanning project files across workspace tree...']);
    setIndexResult(null);
    setTestResults(null);

    try {
      // Simulate visual stage progression
      setTimeout(() => {
        setStage('extracting');
        setProgressLog(prev => [...prev, '[Phase 2] Executing Local Sourcegraph SCIP AST symbol extractor (Python, TS, JS, Go)...']);
      }, 700);

      setTimeout(() => {
        setStage('embedding');
        setProgressLog(prev => [...prev, '[Phase 3] High-signal semantic chunking & ChromaDB dense embedding + Okapi BM25 rebuild...']);
      }, 1500);

      const bodyPayload = {
        workspace_path: workspacePath || null,
        is_github: isGitHubWorkspace || false,
        github_owner: githubRepoInfo?.owner || null,
        github_repo: githubRepoInfo?.repo || null,
        github_branch: currentGitHubBranch || 'main',
        github_token: githubToken || null
      };

      const res = await fetch(`${apiBase}/api/workspace/index-codebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setIndexResult(data);
      setStage('complete');
      setProgressLog(prev => [
        ...prev,
        `[Phase 4] Indexing Complete! Scanned ${data.files_scanned} files.`,
        `[Knowledge Graph] Extracted ${data.endpoints_count} API endpoints, ${data.functions_count} functions, ${data.classes_count} classes.`,
        `[ChromaDB] Persisted ${data.total_chunks} high-signal chunks in ${data.duration_ms}ms.`
      ]);

      if (onIndexingComplete && data.graph) {
        onIndexingComplete(data.graph);
      }
    } catch (e: any) {
      setStage('error');
      setProgressLog(prev => [...prev, `[Error] Indexing failed: ${e?.message || e}`]);
    }
  };

  const handleRunTestQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQueryText.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${apiBase}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testQueryText.trim(), top_k: 4 })
      });
      if (res.ok) {
        const data = await res.json();
        setTestResults(data.cross_encoder || data.dense || []);
      }
    } catch (err) {
      console.error(err);
    }
    setSearching(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-[#0c0f17] border border-[#1e2638] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#e2e5ea]">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-[#192132] flex items-center justify-between bg-[#090b10]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-700/40 flex items-center justify-center text-cyan-400 font-mono text-base shadow-sm">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">
                  Index Codebase for RAG & Knowledge Graph
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40 text-cyan-300">
                  Sourcegraph SCIP
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Active Project: <span className="text-cyan-300 font-mono">{projectName || 'Current Workspace'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg p-1.5 rounded-lg hover:bg-[#161c28] transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-5 text-xs font-sans">
          
          {/* Explanation Banner */}
          <div className="p-3.5 rounded-xl bg-[#111624] border border-[#1e2638] flex items-start gap-3">
            <span className="text-base">🧠</span>
            <p className="text-slate-300 leading-relaxed text-[11.5px]">
              Extracts high-signal code intelligence across all languages using the <strong>Sourcegraph SCIP AST method</strong>. Strips comments and boilerplate, populating <strong>ChromaDB</strong> and building a connected <strong>Knowledge Graph</strong> of all APIs, functions, classes, and call dependencies.
            </p>
          </div>

          {/* Action Trigger or Progress State */}
          {stage === 'idle' ? (
            <div className="py-6 flex flex-col items-center justify-center gap-4 bg-[#080a0f] rounded-xl border border-[#161d2b]">
              <div className="text-center max-w-md">
                <h4 className="text-sm font-semibold text-white mb-1">
                  Ready to map and index {projectName}
                </h4>
                <p className="text-slate-400 text-xs">
                  Scans workspace files, resolves symbol definitions, and indexes clean code chunks for unified retrieval.
                </p>
              </div>
              <button
                onClick={handleStartIndexing}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono text-xs font-semibold shadow-lg shadow-cyan-900/30 transition-all cursor-pointer flex items-center gap-2"
              >
                <span>⚡ Start 1-Click Codebase Indexing</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Progress Stepper Bar */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'scanning', label: '1. Scan Files', icon: '📁' },
                  { id: 'extracting', label: '2. SCIP AST', icon: '🧠' },
                  { id: 'embedding', label: '3. Chunker', icon: '✂️' },
                  { id: 'complete', label: '4. Vector DB', icon: '⚡' }
                ].map((s, idx) => {
                  const isDone = (stage === 'complete') || (stage === 'embedding' && idx < 2) || (stage === 'extracting' && idx === 0);
                  const isCurrent = stage === s.id;
                  return (
                    <div
                      key={s.id}
                      className={`p-2 rounded-lg border flex items-center gap-1.5 text-[10.5px] font-mono transition-all ${
                        isDone
                          ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300'
                          : isCurrent
                          ? 'bg-cyan-950/60 border-cyan-600 text-cyan-300 animate-pulse'
                          : 'bg-[#111624] border-[#1e2638] text-slate-500'
                      }`}
                    >
                      <span>{isDone ? '✓' : s.icon}</span>
                      <span className="truncate">{s.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Progress Console Stream */}
              <div className="p-3.5 rounded-xl bg-[#08090d] border border-[#182030] font-mono text-[11px] flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                {progressLog.map((line, idx) => (
                  <span
                    key={idx}
                    className={line.includes('Error') ? 'text-rose-400' : line.includes('Complete') ? 'text-emerald-300 font-semibold' : 'text-slate-300'}
                  >
                    {line}
                  </span>
                ))}
                {stage !== 'complete' && stage !== 'error' && (
                  <span className="text-cyan-400 flex items-center gap-1.5 animate-pulse">
                    <span>⏳</span> Processing AST symbols...
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Success Statistics & Graph Launch Button */}
          {stage === 'complete' && indexResult && (
            <div className="flex flex-col gap-4 animate-in fade-in-50 duration-300">
              {/* Metric Badges */}
              <div className="grid grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-[#111624] border border-[#1e2638] flex flex-col">
                  <span className="text-[10px] font-mono text-slate-400 uppercase">Files Scanned</span>
                  <span className="text-base font-semibold text-white font-mono">{indexResult.files_scanned}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#111624] border border-amber-800/30 flex flex-col">
                  <span className="text-[10px] font-mono text-amber-400 uppercase">API Routes</span>
                  <span className="text-base font-semibold text-amber-300 font-mono">{indexResult.endpoints_count}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#111624] border border-cyan-800/30 flex flex-col">
                  <span className="text-[10px] font-mono text-cyan-400 uppercase">Functions</span>
                  <span className="text-base font-semibold text-cyan-300 font-mono">{indexResult.functions_count}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#111624] border border-emerald-800/30 flex flex-col">
                  <span className="text-[10px] font-mono text-emerald-400 uppercase">Total Chunks</span>
                  <span className="text-base font-semibold text-emerald-300 font-mono">{indexResult.total_chunks}</span>
                </div>
              </div>

              {/* View Knowledge Graph CTA */}
              {onOpenGraph && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/40 to-indigo-950/40 border border-cyan-700/40 flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-semibold text-white">Interactive Knowledge Graph Ready</h5>
                    <p className="text-[11px] text-slate-300">
                      Explore {indexResult.graph_nodes_count} nodes & {indexResult.graph_edges_count} call edges in the 60fps canvas visualizer.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenGraph();
                    }}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-semibold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🌐 Open Graph</span>
                  </button>
                </div>
              )}

              {/* Live Retrieval Test Bar */}
              <div className="p-4 rounded-xl bg-[#090b10] border border-[#1a2233] flex flex-col gap-3">
                <span className="text-[10.5px] font-mono text-slate-400 uppercase font-semibold">
                  ⚡ Test Immediate RAG Retrieval Against Indexed Codebase
                </span>
                <form onSubmit={handleRunTestQuery} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 'how does agent_chat handle citations?' or 'find refund endpoint'"
                    value={testQueryText}
                    onChange={(e) => setTestQueryText(e.target.value)}
                    className="flex-1 h-8 bg-[#121622] border border-[#252f44] rounded-lg px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={searching || !testQueryText.trim()}
                    className="h-8 px-4 rounded-lg bg-[#1e273a] hover:bg-[#28354f] border border-[#2e3c58] text-cyan-300 font-mono text-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {searching ? 'Testing...' : 'Test Search'}
                  </button>
                </form>

                {/* Test Results Output */}
                {testResults && (
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                    {testResults.length === 0 ? (
                      <span className="text-slate-500 font-mono text-xs">No matching symbols found.</span>
                    ) : (
                      testResults.map((r, i) => (
                        <div key={i} className="p-2.5 rounded-lg bg-[#111624] border border-[#1e273a] flex flex-col gap-1">
                          <div className="flex items-center justify-between font-mono text-[10.5px]">
                            <span className="text-cyan-400 font-semibold truncate max-w-[280px]">
                              {r.symbol_name || r.endpoint || r.source}
                            </span>
                            <span className="text-emerald-400">{r.score}</span>
                          </div>
                          <pre className="text-[10px] text-slate-300 font-mono bg-[#07090e] p-2 rounded max-h-16 overflow-hidden text-ellipsis whitespace-pre-wrap">
                            {r.text}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#192132] flex items-center justify-end gap-2 bg-[#090b10]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#141926] hover:bg-[#1e2538] border border-[#222b3e] text-slate-300 text-xs font-mono transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
