"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useModels } from '../ModelsContext';
import { API_BASE, errorDetail } from '@/lib/api';
import { useFeedback } from '../../components/Feedback';
import { PIPELINE_STAGES } from './RagPipeline';

/* -- Ask studio state and actions: retrieval, streaming generation, uploads - */
/** One ranked chunk from a retrieval stage */
export interface RetrievalHit {
  rank: number;
  score: number;
  text: string;
}

export function useAskState() {
  const { toast } = useFeedback();
  // Model selection is shared with the IDE (see ModelsContext)
  const { models, selectedModel, setSelectedModel, comparisonModel, setComparisonModel } = useModels();
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
  const [searchData, setSearchData] = useState<{ bm25: RetrievalHit[]; dense: RetrievalHit[]; cross_encoder: RetrievalHit[] } | null>(null);
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
    } catch {
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
      if (!res.ok) {
        toast({ tone: 'error', title: `Couldn't index ${file.name}`, detail: errorDetail(await res.text()) });
      } else {
        const data = await res.json();
        setUploadChunks(data.chunks || []);
        setShowModal(true);
      }
    } catch {
      toast({
        tone: 'error',
        title: `Couldn't upload ${file.name}`,
        detail: `The orchestrator service (${API_BASE}) isn't responding, so the ingestion service can't be reached. Start the stack with docker compose up -d, then upload again.`,
      });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const tabs = [
    { id: 'terminal', label: compareMode ? 'Model Comparison' : 'Code Synthesis', icon: '▸' },
    { id: 'search', label: 'Search Diagnostics', icon: '◈' },
    { id: 'db', label: 'Knowledge Base', icon: '◆' },
  ];

  return {
    models,
    selectedModel,
    setSelectedModel,
    comparisonModel,
    setComparisonModel,
    compareMode,
    setCompareMode,
    dbData,
    setDbData,
    showConfigModal,
    setShowConfigModal,
    chunkingStrategy,
    setChunkingStrategy,
    searchStrategy,
    setSearchStrategy,
    topK,
    setTopK,
    query,
    setQuery,
    generationA,
    setGenerationA,
    generationB,
    setGenerationB,
    loading,
    setLoading,
    metricsA,
    setMetricsA,
    metricsB,
    setMetricsB,
    pipelineStage,
    setPipelineStage,
    activeTab,
    setActiveTab,
    searchData,
    setSearchData,
    highlightStrategy,
    setHighlightStrategy,
    uploading,
    setUploading,
    uploadChunks,
    setUploadChunks,
    showModal,
    setShowModal,
    inputFocused,
    setInputFocused,
    fileInputRef,
    outputRefA,
    outputRefB,
    streamModelGeneration,
    handleProcess,
    handleNavigateStage,
    handleUpload,
    tabs,
  };
}

export type AskState = ReturnType<typeof useAskState>;
