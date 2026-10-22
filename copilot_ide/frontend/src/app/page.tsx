"use client";
import React, { useState, useEffect, useRef } from 'react';
import { EvaluationDashboard } from './components/EvaluationDashboard';
import { ArcGenStudio } from './components/ArcGenStudio';
import { ConformanceStudio } from './components/conformance/ConformanceStudio';
import { Icons, PIPELINE_STAGES, FormattedMarkdown, RagPipeline, VSCodeAgentIDE } from './components/ide/VSCodeAgentIDE';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/* -- Main Application Component ------------------------------ */
export default function Home() {
  const [appMode, setAppMode] = useState<'api_copilot' | 'copilot_agent' | 'evaluation' | 'arcgen' | 'conformance'>('api_copilot');

  // Shared Global State
  const [models, setModels] = useState<string[]>(["gemma3:4b", "gemma3:12b", "codellama:7b-instruct"]);
  const [selectedModel, setSelectedModel] = useState<string>("gemma3:4b");
  const [comparisonModel, setComparisonModel] = useState<string>("codellama:7b-instruct");
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [dbData, setDbData] = useState<{ fixed_chunks: string[], semantic_chunks: string[] }>({ fixed_chunks: [], semantic_chunks: [] });
  
  // Configuration Settings State
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [chunkingStrategy, setChunkingStrategy] = useState<'semantic' | 'fixed' | 'openapi'>('semantic');
  const [searchStrategy, setSearchStrategy] = useState<'hybrid' | 'bm25' | 'dense'>('hybrid');
  const [topK, setTopK] = useState<number>(5);

  // RAG View State
  const [query, setQuery] = useState('');
  const [generationA, setGenerationA] = useState('');
  const [generationB, setGenerationB] = useState('');
  const [loading, setLoading] = useState(false);
  const [metricsA, setMetricsA] = useState<{ latencyMs: number; tokens: number } | null>(null);
  const [metricsB, setMetricsB] = useState<{ latencyMs: number; tokens: number } | null>(null);
  const [pipelineStage, setPipelineStage] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<'terminal' | 'search' | 'db'>('terminal');
  const [searchData, setSearchData] = useState<{ bm25: any[]; dense: any[]; cross_encoder: any[] } | null>(null);
  const [highlightStrategy, setHighlightStrategy] = useState<string | null>(null);
  
  const [uploading, setUploading] = useState(false);
  const [uploadChunks, setUploadChunks] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRefA = useRef<HTMLDivElement>(null);
  const outputRefB = useRef<HTMLDivElement>(null);

  // Resilient Data Loading with Automatic Retry
  useEffect(() => {
    let isMounted = true;

    const fetchModels = async (retries = 3) => {
      try {
        const res = await fetch(`${API_BASE}/api/models`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted && data.models && data.models.length > 0) {
          setModels(data.models);
          if (!selectedModel || !data.models.includes(selectedModel)) {
            setSelectedModel(data.models[0]);
          }
          if (data.models.length > 1 && (!comparisonModel || !data.models.includes(comparisonModel))) {
            setComparisonModel(data.models[1]);
          }
        }
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => fetchModels(retries - 1), 2000);
        }
      }
    };

    const fetchDatabase = async (retries = 3) => {
      try {
        const res = await fetch(`${API_BASE}/api/database`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted) setDbData(data);
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => fetchDatabase(retries - 1), 2000);
        }
      }
    };

    fetchModels();
    fetchDatabase();

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-scroll outputs when tokens stream in
  useEffect(() => {
    if (outputRefA.current) {
      outputRefA.current.scrollTop = outputRefA.current.scrollHeight;
    }
  }, [generationA]);

  useEffect(() => {
    if (outputRefB.current) {
      outputRefB.current.scrollTop = outputRefB.current.scrollHeight;
    }
  }, [generationB]);

  // Stream reader helper for model generation
  const streamModelGeneration = async (
    targetModel: string,
    onToken: (fullText: string) => void,
    onComplete: (metrics: { latencyMs: number; tokens: number }) => void,
    onError: (err: string) => void
  ) => {
    const startTime = performance.now();
    let tokenCount = 0;
    let accumulatedText = '';

    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          model: targetModel,
          top_k: topK,
          search_strategy: searchStrategy
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: 'Service unreachable' }));
        onError(errData.detail || 'Model generation failed.');
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.token) {
                  tokenCount++;
                  accumulatedText += data.token;
                  onToken(accumulatedText);
                }
                if (data.done) break;
                if (data.error) {
                  accumulatedText += `\n\n> ⚠️ **Error:** ${data.error}`;
                  onToken(accumulatedText);
                  break;
                }
              } catch (e) {}
            }
          }
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      onComplete({ latencyMs: elapsed, tokens: tokenCount });
    } catch (e: any) {
      onError(`Connection error to ${targetModel}`);
    }
  };

  const handleProcess = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearchData(null);
    setGenerationA('');
    setGenerationB('');
    setMetricsA(null);
    setMetricsB(null);
    setPipelineStage(0);
    setActiveTab('terminal');

    try {
      // Stage 1: BM25 Lexical
      setPipelineStage(1);
      const searchRes = await fetch(`${API_BASE}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, model: selectedModel, top_k: topK })
      });
      const searchDataResult = await searchRes.json();
      
      // Stage 2: Dense Vector Proximity
      setPipelineStage(2);
      await new Promise(r => setTimeout(r, 200));
      
      // Stage 3: Cross-Encoder Re-Ranking
      setPipelineStage(3);
      setSearchData(searchDataResult);
      await new Promise(r => setTimeout(r, 200));

      // Stage 4: LLM Generation
      setPipelineStage(4);

      if (compareMode) {
        // Run Model A and Model B in Parallel Side-by-Side
        await Promise.all([
          streamModelGeneration(
            selectedModel,
            (text) => setGenerationA(text),
            (m) => setMetricsA(m),
            (err) => setGenerationA(`❌ **Error (${selectedModel}):** ${err}`)
          ),
          streamModelGeneration(
            comparisonModel,
            (text) => setGenerationB(text),
            (m) => setMetricsB(m),
            (err) => setGenerationB(`❌ **Error (${comparisonModel}):** ${err}`)
          )
        ]);
      } else {
        // Single Model Stream
        await streamModelGeneration(
          selectedModel,
          (text) => setGenerationA(text),
          (m) => setMetricsA(m),
          (err) => setGenerationA(`❌ **Error:** ${err}`)
        );
      }

      setPipelineStage(-1);
    } catch (e) {
      setGenerationA(`❌ **Connection error:** Could not reach API Gateway on \`${API_BASE}\`.`);
      setPipelineStage(-1);
    }
    setLoading(false);
  };

  const handleNavigateStage = (stage: typeof PIPELINE_STAGES[0]) => {
    setActiveTab(stage.targetTab as 'terminal' | 'search' | 'db');
    if (stage.highlightKey) {
      setHighlightStrategy(stage.highlightKey);
      setTimeout(() => setHighlightStrategy(null), 3000);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    const formData = new FormData();
    formData.append('file', file);
    
    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setUploadChunks(data.chunks || []);
      setShowModal(true);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Document upload failed.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const tabs = [
    { id: 'terminal', label: compareMode ? 'Model Comparison' : 'Code Synthesis', icon: '▸' },
    { id: 'search', label: 'Search Diagnostics', icon: '◈' },
    { id: 'db', label: 'Knowledge Base', icon: '◆' },
  ];

  return (
    <div className="min-h-screen bg-[#08090a] text-[#c8ccd0] font-sans antialiased selection:bg-[#2563eb]/30 selection:text-white">
      
      {/* ── Top Universal Header & Mode Switcher ──────────────────── */}
      <header className="border-b border-[#161922] bg-[#07080a]/95 backdrop-blur-md sticky top-0 z-50 select-none">
        <div className="max-w-[1400px] mx-auto px-6 h-[56px] flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-1.5 shadow-sm">
              <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-[#e2e5ea] tracking-tight">
                  Archon Copilot
                </span>
                <span className="text-[9.5px] font-mono font-medium px-1.5 py-0.2 bg-[#12151c] border border-[#1e232e] text-[#60a5fa] rounded">
                  v1.0
                </span>
              </div>
            </div>
          </div>

          {/* Center Mode Switcher */}
          <div className="flex items-center p-1 bg-[#0c0e12] border border-[#1a1e26] rounded-xl shadow-inner gap-1">
            <button
              onClick={() => setAppMode('api_copilot')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer ${
                appMode === 'api_copilot'
                  ? 'bg-[#1e293b] text-[#60a5fa] border border-[#3b82f6]/30 shadow-md'
                  : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              <Icons.Bolt />
              <span>Archon RAG</span>
            </button>
            <button
              onClick={() => setAppMode('copilot_agent')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer ${
                appMode === 'copilot_agent'
                  ? 'bg-[#1e293b] text-[#60a5fa] border border-[#3b82f6]/30 shadow-md'
                  : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              <Icons.ArchonAI />
              <span>Archon Agent (IDE)</span>
            </button>
            <button
              onClick={() => setAppMode('evaluation')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer ${
                appMode === 'evaluation'
                  ? 'bg-[#1e293b] text-[#34d399] border border-[#10b981]/40 shadow-md'
                  : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              <Icons.Chart />
              <span>Lab 4 Evaluation</span>
            </button>
            <button
              onClick={() => setAppMode('arcgen')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer ${
                appMode === 'arcgen'
                  ? 'bg-[#1e293b] text-[#a78bfa] border border-[#8b5cf6]/40 shadow-md'
                  : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              <Icons.Architecture />
              <span>ArcGen Studio</span>
            </button>
            <button
              onClick={() => setAppMode('conformance')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer ${
                appMode === 'conformance'
                  ? 'bg-[#1b1b1a] text-[#e8ff00] border border-[#e8ff00]/50 shadow-md'
                  : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              <Icons.Conformance />
              <span>Conformance Studio</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#10b981]/10 border border-[#10b981]/25 rounded-lg text-[11px] font-mono text-[#10b981]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
            <span>online</span>
          </div>
        </div>
      </header>

      {/* ── VIEWPORT CONTENT SWITCHER ─────────────────────────────── */}
      {appMode === 'evaluation' ? (
        <main className="w-full min-h-[calc(100vh-56px)]">
          <EvaluationDashboard />
        </main>
      ) : appMode === 'arcgen' ? (
        <main className="w-full min-h-[calc(100vh-56px)] bg-[#090b0e]">
          <ArcGenStudio
            apiBase={API_BASE}
            onOpenInIDE={() => setAppMode('copilot_agent')}
          />
        </main>
      ) : appMode === 'conformance' ? (
        <main className="w-full min-h-[calc(100vh-56px)] bg-[#080808]">
          <ConformanceStudio
            apiBase={API_BASE}
          />
        </main>
      ) : appMode === 'copilot_agent' ? (
        <main className="w-full h-[calc(100vh-56px)] overflow-hidden">
          <VSCodeAgentIDE
            apiBase={API_BASE}
            models={models}
            setModels={setModels}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
          />
        </main>
      ) : (
        <main className="min-h-[calc(100vh-56px)] p-6 md:p-10">
          
          {/* Upload Spec Modal */}
          {showModal && (
            <div 
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
              onClick={() => setShowModal(false)}
            >
              <div 
                className="bg-[#0e1015] border border-[#1a1e26] rounded-xl max-w-3xl w-full max-h-[75vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="px-6 py-5 border-b border-[#1a1e26] flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-semibold text-[#e2e5ea] tracking-tight">Document Ingested</h3>
                    <p className="text-xs text-[#4a5060] mt-1 font-mono">{uploadChunks.length} semantic segments extracted</p>
                  </div>
                  <button 
                    onClick={() => setShowModal(false)} 
                    className="text-[#4a5060] hover:text-[#c8ccd0] transition-colors duration-300 w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#1a1e26] cursor-pointer"
                  >
                    <Icons.Close />
                  </button>
                </div>
                <div className="p-5 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
                  {uploadChunks.map((chunk, i) => (
                    <div key={i} className="bg-[#08090a] border border-[#1a1e26] rounded-lg p-4 hover:border-[#282e3a] transition-colors duration-300">
                      <div className="text-[10px] font-mono font-medium text-[#4a5060] mb-2.5 tracking-wider uppercase">Segment {i + 1}</div>
                      <pre className="text-[12.5px] text-[#8b92a0] whitespace-pre-wrap font-mono leading-relaxed">{chunk}</pre>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 border-t border-[#1a1e26] flex justify-end">
                  <button 
                    onClick={() => setShowModal(false)} 
                    className="bg-[#1a1e26] hover:bg-[#282e3a] text-[#c8ccd0] px-6 py-2 rounded-lg text-sm font-medium transition-all duration-300 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Configure Strategy & Hyperparameters Modal ─────────── */}
          {showConfigModal && (
            <div 
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
              onClick={() => setShowConfigModal(false)}
            >
              <div 
                className="bg-[#0e1015] border border-[#1a1e26] rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center pb-3 border-b border-[#1a1e26]">
                  <div className="flex items-center gap-2">
                    <Icons.Settings />
                    <h3 className="text-[14px] font-mono font-semibold text-[#e2e5ea]">
                      RAG Retrieval Configuration
                    </h3>
                  </div>
                  <button 
                    onClick={() => setShowConfigModal(false)}
                    className="text-[#4a5060] hover:text-[#c8ccd0] p-1 cursor-pointer rounded hover:bg-[#1a1e26]"
                  >
                    <Icons.Close />
                  </button>
                </div>

                {/* Chunking Strategy Option */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] font-semibold">
                    Chunking Strategy
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'semantic', label: 'Semantic', desc: 'Context-aware splits' },
                      { id: 'fixed', label: 'Fixed Window', desc: '500-token chunks' },
                      { id: 'openapi', label: 'OpenAPI Spec', desc: 'Endpoint boundaries' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setChunkingStrategy(opt.id as any)}
                        className={`p-2.5 rounded-lg border text-left font-mono transition-all cursor-pointer ${
                          chunkingStrategy === opt.id
                            ? 'border-[#3b82f6] bg-[#3b82f6]/10 text-[#e2e5ea] shadow-sm'
                            : 'border-[#1a1e26] bg-[#08090a] text-[#64748b] hover:text-[#8b92a0] hover:border-[#282e3a]'
                        }`}
                      >
                        <div className="text-[11px] font-semibold">{opt.label}</div>
                        <div className="text-[9.5px] text-[#475569] mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Strategy Option */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] font-semibold">
                    Retrieval & Ranking Strategy
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'hybrid', label: 'Hybrid Re-Rank', desc: 'BM25 + Dense + Cross' },
                      { id: 'dense', label: 'Dense Vector', desc: 'ChromaDB BGE-small' },
                      { id: 'bm25', label: 'BM25 Lexical', desc: 'Exact keyword match' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSearchStrategy(opt.id as any)}
                        className={`p-2.5 rounded-lg border text-left font-mono transition-all cursor-pointer ${
                          searchStrategy === opt.id
                            ? 'border-[#3b82f6] bg-[#3b82f6]/10 text-[#e2e5ea] shadow-sm'
                            : 'border-[#1a1e26] bg-[#08090a] text-[#64748b] hover:text-[#8b92a0] hover:border-[#282e3a]'
                        }`}
                      >
                        <div className="text-[11px] font-semibold">{opt.label}</div>
                        <div className="text-[9.5px] text-[#475569] mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Top-K Slider */}
                <div className="space-y-2 pt-2 border-t border-[#1a1e26]">
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-[#64748b] uppercase tracking-wider font-semibold">Top-K Context Chunks</span>
                    <span className="text-[#60a5fa] font-bold">{topK}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={topK}
                    onChange={(e) => setTopK(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#161b24] rounded-lg appearance-none cursor-pointer accent-[#3b82f6]"
                  />
                  <div className="flex justify-between text-[9.5px] font-mono text-[#475569]">
                    <span>1 (High Precision)</span>
                    <span>10 (Broad Context)</span>
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-[#1a1e26]">
                  <button
                    onClick={() => setShowConfigModal(false)}
                    className="bg-[#1e293b] hover:bg-[#334155] text-[#e2e5ea] px-5 py-2 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer border border-[#334155]"
                  >
                    Apply Configuration
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="max-w-[1200px] mx-auto">
            
            {/* Header */}
            <header className="mb-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-[#1a1e26]">
                <div>
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse" />
                    <span className="text-[10px] font-mono font-medium text-[#4a5060] tracking-[0.2em] uppercase">RAG Engine Live</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-1.5 shadow-sm">
                      <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-[28px] font-semibold text-[#e2e5ea] tracking-[-0.02em] leading-tight">
                      Archon RAG
                    </h1>
                  </div>
                  <p className="text-[13px] text-[#4a5060] mt-1.5 font-mono">
                    {searchStrategy === 'hybrid'
                      ? 'Hybrid retrieval (BM25 + Dense + Cross-Encoder) & Code Synthesis'
                      : searchStrategy === 'dense'
                        ? 'ChromaDB Dense Vector Embedding Search & Code Synthesis'
                        : 'Okapi BM25 Lexical Keyword Search & Code Synthesis'}
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2.5 items-end">
                  {/* Upload Button */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono font-medium text-[#4a5060] tracking-wider uppercase">Ingest Spec</label>
                    <div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleUpload} 
                        className="hidden" 
                        id="file-upload"
                        accept=".json,.yaml,.yml,.md" 
                      />
                      <label 
                        htmlFor="file-upload" 
                        className="cursor-pointer flex items-center gap-2 bg-[#0e1015] border border-[#1a1e26] hover:border-[#282e3a] text-[#6b7280] hover:text-[#c8ccd0] px-3.5 py-2 rounded-lg text-[12.5px] font-mono transition-all duration-300"
                      >
                        {uploading ? (
                          <span className="flex items-center gap-2"><span className="animate-spin text-[#3b82f6]">⟳</span>Ingesting</span>
                        ) : (
                          <><span className="text-[#4a5060]">↑</span>Upload</>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* Active Model Selector A */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono font-medium text-[#4a5060] tracking-wider uppercase">Active Model</label>
                    <select 
                      value={selectedModel} 
                      onChange={e => setSelectedModel(e.target.value)}
                      className="bg-[#0e1015] border border-[#1a1e26] hover:border-[#282e3a] text-[#c8ccd0] py-2 px-3.5 rounded-lg text-[12.5px] font-mono outline-none focus:border-[#3b82f6]/50 transition-all duration-300 cursor-pointer max-w-[190px] truncate"
                      title={selectedModel}
                    >
                      {models.map(m => (
                        <option key={m} value={m} className="bg-[#0e1015]">{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* Model B Selector (When Comparison is Active) */}
                  {compareMode && (
                    <div className="flex flex-col gap-1.5 animate-fade-in">
                      <label className="text-[10px] font-mono font-medium text-[#a78bfa] tracking-wider uppercase">Compare Model</label>
                      <select 
                        value={comparisonModel} 
                        onChange={e => setComparisonModel(e.target.value)}
                        className="bg-[#0e1015] border border-[#a78bfa]/40 text-[#a78bfa] py-2 px-3.5 rounded-lg text-[12.5px] font-mono outline-none focus:border-[#a78bfa] transition-all duration-300 cursor-pointer max-w-[190px] truncate shadow-sm"
                        title={comparisonModel}
                      >
                        {models.map(m => (
                          <option key={m} value={m} className="bg-[#0e1015]">{m}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Side-by-Side Model Comparison Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => setCompareMode(!compareMode)}
                    title="Toggle Side-by-Side Dual Model Comparison"
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-mono transition-all duration-200 cursor-pointer border ${
                      compareMode
                        ? 'bg-[#3b82f6]/20 text-[#60a5fa] border-[#3b82f6]/50 shadow-md font-bold'
                        : 'bg-[#0e1015] border-[#1a1e26] hover:border-[#282e3a] text-[#6b7280] hover:text-[#c8ccd0]'
                    }`}
                  >
                    <Icons.Compare />
                    <span>Compare: {compareMode ? 'ON' : 'OFF'}</span>
                  </button>

                  {/* Configure Option Button */}
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(true)}
                    title="Configure Chunking & Retrieval Strategy"
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-mono bg-[#0e1015] border border-[#1a1e26] hover:border-[#282e3a] text-[#6b7280] hover:text-[#c8ccd0] transition-all duration-200 cursor-pointer"
                  >
                    <Icons.Settings />
                    <span>Configure</span>
                  </button>
                </div>
              </div>
            </header>

            {/* Global Interactive Pipeline Visualizer */}
            <RagPipeline 
              currentStage={pipelineStage} 
              onNavigateStage={handleNavigateStage} 
            />

            {/* Command Input Bar */}
            <div className={`mb-6 transition-all duration-500 ${inputFocused ? 'scale-[1.003]' : ''}`}>
              <div className={`bg-[#0e1015] border rounded-xl p-1.5 pl-5 flex items-center transition-all duration-500 ${inputFocused ? 'border-[#3b82f6]/50 shadow-[0_0_30px_rgba(59,130,246,0.08)]' : 'border-[#1a1e26]'}`}>
                <span className="text-[#3b82f6] mr-3 font-mono text-sm select-none">▸</span>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onKeyDown={e => e.key === 'Enter' && handleProcess()}
                  placeholder="Ask any API question… e.g. How do I create a customer charge in Stripe?"
                  className="bg-transparent border-none outline-none text-[#e2e5ea] placeholder-[#4a5060] flex-1 text-sm font-mono leading-relaxed"
                />
                <button
                  onClick={handleProcess}
                  disabled={loading || !query.trim()}
                  className={`px-5 py-2.5 rounded-lg text-xs font-mono font-medium transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                    loading || !query.trim() 
                      ? 'bg-transparent text-[#282e3a] cursor-not-allowed' 
                      : 'bg-[#1a1e26] text-[#c8ccd0] hover:bg-[#282e3a] hover:text-white border border-[#282e3a]/50 shadow-sm'
                  }`}
                >
                  {loading ? (
                    <><span className="animate-spin text-[#3b82f6]">⟳</span>Processing</>
                  ) : (
                    <>Execute<span className="text-[10px] text-[#4a5060]">↵</span></>
                  )}
                </button>
              </div>

              {/* Sample Queries */}
              <div className="flex gap-2 mt-2.5 overflow-x-auto pb-1 text-[11px] font-mono text-[#4a5060] custom-scrollbar">
                <span className="text-[#333a48] select-none py-0.5">Try:</span>
                {[
                  "How to charge a card in Stripe?",
                  "Twilio send SMS endpoint & parameters",
                  "SendGrid v3 mail send cURL",
                  "Slack chat.postMessage payload"
                ].map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(sample)}
                    className="hover:text-[#8b92a0] transition-colors duration-300 whitespace-nowrap bg-[#0a0c10] hover:bg-[#0e1015] px-2.5 py-0.5 rounded border border-[#14171e] hover:border-[#1a1e26] cursor-pointer"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            {/* Strategy Tabs & Display Panel */}
            <div className="bg-[#0e1015] border border-[#1a1e26] rounded-xl overflow-hidden shadow-2xl">
              
              {/* Tab Bar */}
              <div className="flex border-b border-[#1a1e26] bg-[#0a0c10]">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-6 py-3.5 text-xs font-mono transition-all duration-300 relative cursor-pointer ${
                      activeTab === tab.id
                        ? 'text-[#e2e5ea] bg-[#0e1015] font-medium'
                        : 'text-[#4a5060] hover:text-[#8b92a0] hover:bg-[#0c0e12]'
                    }`}
                  >
                    <span className={`text-[10px] ${activeTab === tab.id ? 'text-[#3b82f6]' : 'text-[#282e3a]'}`}>
                      {tab.icon}
                    </span>
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab 1: Code Synthesis Output / Side-by-Side Comparison */}
              {activeTab === 'terminal' && (
                <div className="p-6">
                  {compareMode ? (
                    /* ── Side-by-Side Dual Model Comparison Panels ── */
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      
                      {/* Left Column: Model A */}
                      <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#1a1e26] bg-[#0a0c10]/80">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-[#60a5fa]">{selectedModel}</span>
                            <span className="text-[9.5px] font-mono text-[#3b82f6] bg-[#3b82f6]/10 px-1.5 py-0.2 rounded border border-[#3b82f6]/20">Model A</span>
                          </div>
                          {metricsA && (
                            <div className="text-[10px] font-mono text-[#4a5060] flex items-center gap-2">
                              <span>{metricsA.tokens} tokens</span>
                              <span>·</span>
                              <span>{metricsA.latencyMs}ms</span>
                            </div>
                          )}
                        </div>
                        <div ref={outputRefA} className="p-5 overflow-y-auto custom-scrollbar" style={{ minHeight: generationA || loading ? '240px' : '180px', maxHeight: '550px' }}>
                          {generationA ? (
                            <FormattedMarkdown content={generationA} />
                          ) : loading ? (
                            <div className="flex flex-col items-center justify-center h-[180px] text-[#4a5060] font-mono text-xs space-y-3">
                              <div className="w-5 h-5 border-2 border-[#1a1e26] border-t-[#3b82f6] rounded-full animate-spin" />
                              <span>Generating with {selectedModel}…</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-[140px] text-[#333a48] font-mono text-xs">
                              Enter a query above to execute comparison synthesis.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Column: Model B */}
                      <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#1a1e26] bg-[#0a0c10]/80">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-[#a78bfa]">{comparisonModel}</span>
                            <span className="text-[9.5px] font-mono text-[#a78bfa] bg-[#a78bfa]/10 px-1.5 py-0.2 rounded border border-[#a78bfa]/20">Model B</span>
                          </div>
                          {metricsB && (
                            <div className="text-[10px] font-mono text-[#4a5060] flex items-center gap-2">
                              <span>{metricsB.tokens} tokens</span>
                              <span>·</span>
                              <span>{metricsB.latencyMs}ms</span>
                            </div>
                          )}
                        </div>
                        <div ref={outputRefB} className="p-5 overflow-y-auto custom-scrollbar" style={{ minHeight: generationB || loading ? '240px' : '180px', maxHeight: '550px' }}>
                          {generationB ? (
                            <FormattedMarkdown content={generationB} />
                          ) : loading ? (
                            <div className="flex flex-col items-center justify-center h-[180px] text-[#4a5060] font-mono text-xs space-y-3">
                              <div className="w-5 h-5 border-2 border-[#1a1e26] border-t-[#a78bfa] rounded-full animate-spin" />
                              <span>Generating with {comparisonModel}…</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-[140px] text-[#333a48] font-mono text-xs">
                              Enter a query above to execute comparison synthesis.
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  ) : (
                    /* ── Single Model Synthesis View ── */
                    <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg overflow-hidden">
                      <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#1a1e26] bg-[#0a0c10]/60">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#1a1e26]" />
                          <div className="w-2.5 h-2.5 rounded-full bg-[#1a1e26]" />
                          <div className="w-2.5 h-2.5 rounded-full bg-[#1a1e26]" />
                          <span className="text-[11px] font-mono text-[#333a48] ml-2">archon-copilot ~ output</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {loading && (
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#3b82f6]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
                              Streaming…
                            </div>
                          )}
                          {metricsA && (
                            <span className="text-[10px] font-mono text-[#4a5060]">
                              {metricsA.tokens} tokens · {metricsA.latencyMs}ms
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[#282e3a]">{selectedModel}</span>
                        </div>
                      </div>
                      <div ref={outputRefA} className="p-6 min-h-[350px] max-h-[550px] overflow-y-auto custom-scrollbar">
                        {generationA ? (
                          <FormattedMarkdown content={generationA} />
                        ) : loading ? (
                          <div className="flex flex-col items-center justify-center h-[300px] text-[#333a48] font-mono text-xs space-y-3">
                            <div className="w-6 h-6 border-2 border-[#1a1e26] border-t-[#3b82f6] rounded-full animate-spin" />
                            <span>Generating endpoint synthesis…</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-[300px] text-[#282e3a] font-mono text-xs space-y-2">
                            <span>$ Enter a query above to execute hybrid search & synthesis.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: 3-Column Search Diagnostics */}
              {activeTab === 'search' && (
                <div className="p-6">
                  {!searchData ? (
                    <div className="text-center py-20 text-[#282e3a] font-mono text-xs">
                      Run a query to inspect live ranking diagnostics across BM25, Dense Vectors, and Cross-Encoder.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      
                      {/* BM25 Column */}
                      <div className={`bg-[#08090a] rounded-lg flex flex-col transition-all duration-500 border ${
                        highlightStrategy === 'bm25'
                          ? 'border-[#3b82f6] shadow-[0_0_30px_rgba(59,130,246,0.2)] ring-1 ring-[#3b82f6]/50'
                          : 'border-[#1a1e26] hover:border-[#282e3a]'
                      }`}>
                        <div className="border-b border-[#1a1e26] px-4 py-3.5 flex justify-between items-center bg-[#0a0c10]">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-[#3b82f6] font-bold">01</span>
                              <h3 className="text-[12px] font-mono font-semibold text-[#c8ccd0] tracking-wide">Okapi BM25</h3>
                            </div>
                            <p className="text-[10px] text-[#4a5060] mt-0.5 font-mono">Lexical keyword matching</p>
                          </div>
                          <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#4a5060] bg-[#12151c] px-2 py-0.5 rounded border border-[#1a1e26]">TOP {topK}</span>
                        </div>
                        <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                          {Array.isArray(searchData.bm25) ? searchData.bm25.map((item: any, i: number) => (
                            <div key={i} className="bg-[#0e1015] border border-[#1a1e26] rounded-md p-3.5 hover:border-[#282e3a] transition-colors duration-300">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-[9px] font-mono font-bold text-[#6b7280] bg-[#08090a] px-1.5 py-0.5 rounded">#{item.rank}</span>
                                <span className="text-[10px] font-mono font-medium text-[#38bdf8]">{item.score}</span>
                              </div>
                              <pre className="text-[11.5px] text-[#6b7280] font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                            </div>
                          )) : <div className="text-[#4a5060] text-xs font-mono p-3">{typeof searchData.bm25 === 'string' ? searchData.bm25 : 'No results'}</div>}
                        </div>
                      </div>

                      {/* Dense Vector Column */}
                      <div className={`bg-[#08090a] rounded-lg flex flex-col transition-all duration-500 border ${
                        highlightStrategy === 'dense'
                          ? 'border-[#a78bfa] shadow-[0_0_30px_rgba(167,139,250,0.2)] ring-1 ring-[#a78bfa]/50'
                          : 'border-[#1a1e26] hover:border-[#282e3a]'
                      }`}>
                        <div className="border-b border-[#1a1e26] px-4 py-3.5 flex justify-between items-center bg-[#0a0c10]">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-[#a78bfa] font-bold">02</span>
                              <h3 className="text-[12px] font-mono font-semibold text-[#c8ccd0] tracking-wide">Dense Vectors</h3>
                            </div>
                            <p className="text-[10px] text-[#4a5060] mt-0.5 font-mono">BGE-small (ChromaDB)</p>
                          </div>
                          <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#4a5060] bg-[#12151c] px-2 py-0.5 rounded border border-[#1a1e26]">TOP {topK}</span>
                        </div>
                        <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                          {Array.isArray(searchData.dense) ? searchData.dense.map((item: any, i: number) => (
                            <div key={i} className="bg-[#0e1015] border border-[#1a1e26] rounded-md p-3.5 hover:border-[#282e3a] transition-colors duration-300">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-[9px] font-mono font-bold text-[#6b7280] bg-[#08090a] px-1.5 py-0.5 rounded">#{item.rank}</span>
                                <span className="text-[10px] font-mono font-medium text-purple-400/80">{item.score}</span>
                              </div>
                              <pre className="text-[11.5px] text-[#6b7280] font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                            </div>
                          )) : <div className="text-[#4a5060] text-xs font-mono p-3">{typeof searchData.dense === 'string' ? searchData.dense : 'No results'}</div>}
                        </div>
                      </div>

                      {/* Cross-Encoder Column */}
                      <div className={`bg-[#08090a] rounded-lg flex flex-col relative overflow-hidden transition-all duration-500 border ${
                        highlightStrategy === 'cross_encoder'
                          ? 'border-[#10b981] shadow-[0_0_30px_rgba(16,185,129,0.2)] ring-1 ring-[#10b981]/50'
                          : 'border-[#10b981]/20 hover:border-[#10b981]/35'
                      }`}>
                        <div className="border-b border-[#10b981]/15 px-4 py-3.5 flex justify-between items-center bg-[#10b981]/5">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-[#10b981] font-bold">03</span>
                              <h3 className="text-[12px] font-mono font-semibold text-[#10b981] tracking-wide">Cross-Encoder</h3>
                            </div>
                            <p className="text-[10px] text-[#10b981]/60 mt-0.5 font-mono">MS-Marco Deep Re-Ranking</p>
                          </div>
                          <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#10b981]/60 bg-[#10b981]/10 px-2 py-0.5 rounded border border-[#10b981]/20">TOP {topK}</span>
                        </div>
                        <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                          {Array.isArray(searchData.cross_encoder) ? searchData.cross_encoder.map((item: any, i: number) => (
                            <div key={i} className={`bg-[#0e1015] border rounded-md p-3.5 transition-all duration-300 ${i === 0 ? 'border-[#10b981]/30 shadow-[0_0_12px_rgba(16,185,129,0.06)]' : 'border-[#1a1e26] hover:border-[#282e3a]'}`}>
                              <div className="flex justify-between items-center mb-2">
                                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${i === 0 ? 'text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/20' : 'text-[#6b7280] bg-[#08090a]'}`}>#{item.rank}</span>
                                <span className={`text-[10px] font-mono font-medium ${i === 0 ? 'text-[#10b981]' : 'text-[#10b981]/50'}`}>{item.score}</span>
                              </div>
                              <pre className="text-[11.5px] text-[#8b92a0] font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                            </div>
                          )) : <div className="text-[#4a5060] text-xs font-mono p-3">{typeof searchData.cross_encoder === 'string' ? searchData.cross_encoder : 'No results'}</div>}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Knowledge Base Viewer */}
              {activeTab === 'db' && (
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-1 h-4 bg-[#282e3a] rounded-full" />
                          <h3 className="text-[13px] font-mono font-medium text-[#6b7280] tracking-wide">Legacy Fixed Chunks</h3>
                        </div>
                        <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#4a5060] bg-[#13161c] px-2.5 py-1 rounded uppercase border border-[#1a1e26]">Static</span>
                      </div>
                      <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg p-4 h-[420px] overflow-y-auto space-y-2.5 custom-scrollbar">
                        {dbData?.fixed_chunks?.map((chunk: string, i: number) => (
                          <div key={i} className="p-3.5 bg-[#0e1015] rounded-md border border-[#1a1e26] font-mono text-[12px] text-[#6b7280] leading-[1.7] hover:border-[#282e3a] transition-colors duration-300 cursor-default">
                            {chunk}
                          </div>
                        )) || (
                          <div className="flex items-center justify-center h-full">
                            <span className="text-[#282e3a] font-mono text-xs">Awaiting data snapshot…</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-1 h-4 bg-[#3b82f6]/50 rounded-full" />
                          <h3 className="text-[13px] font-mono font-medium text-[#6b7280] tracking-wide">Semantic Vector Chunks</h3>
                        </div>
                        <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#3b82f6]/70 bg-[#3b82f6]/10 px-2.5 py-1 rounded uppercase border border-[#3b82f6]/20">Smart Chunks</span>
                      </div>
                      <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg p-4 h-[420px] overflow-y-auto space-y-2.5 custom-scrollbar">
                        {dbData?.semantic_chunks?.map((chunk: string, i: number) => (
                          <div key={i} className="p-3.5 bg-[#0e1015] rounded-md border border-[#1a1e26] font-mono text-[12px] text-[#8b92a0] leading-[1.7] hover:border-[#3b82f6]/20 transition-colors duration-300 whitespace-pre-wrap cursor-default">
                            {chunk}
                          </div>
                        )) || (
                          <div className="flex items-center justify-center h-full">
                            <span className="text-[#282e3a] font-mono text-xs">Awaiting data snapshot…</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="mt-8 flex justify-between items-center text-[10px] font-mono text-[#282e3a]">
              <span>v1.0.0-archon</span>
              <span>Archon Copilot · Multi-Strategy Diagnostic Portal</span>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}


