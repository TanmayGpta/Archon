"use client";
import React, { useState } from 'react';
import { EVALUATION_DATA } from './evaluationData';

export function Exercise1Models() {
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const gemmaSummary = EVALUATION_DATA.exercise_1.models.find(m => m.model === 'gemma3:4b');
  const codellamaSummary = EVALUATION_DATA.exercise_1.models.find(m => m.model === 'codellama:7b');
  const starcoderSummary = EVALUATION_DATA.exercise_1.models.find(m => m.model === 'starcoder2:3b');

  const standardizedPrompt = `You are an Enterprise API Copilot, an expert AI assistant specializing in API integrations, endpoint specifications, and developer code synthesis.
Answer the developer's question accurately, completely, and concisely based on the provided API documentation context below.
Provide production-ready code examples (e.g. cURL, Python, TypeScript) with correct endpoints, parameters, and headers where applicable.

### API Documentation Context:
{retrieved_context_chunks}

### Developer Query:
{developer_question}

### Assistant Response:`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(standardizedPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Exercise Briefing Header */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-[#1d2436] space-y-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#60a5fa] text-xs font-mono font-bold">
              EXERCISE 1
            </span>
            <h2 className="text-lg font-bold text-[#f1f5f9] font-mono">
              Evaluate Multiple LLM / Code Models
            </h2>
          </div>
          <span className="text-xs font-mono text-[#10b981] bg-[#10b981]/15 px-3 py-1 rounded-full border border-[#10b981]/30">
            ✓ Condition Invariance Verified (3 Models)
          </span>
        </div>

        <blockquote className="border-l-2 border-[#3b82f6] pl-3 py-1.5 bg-[#080a0f] rounded-r text-xs text-[#94a3b8] font-mono leading-relaxed">
          &ldquo;Evaluate your application using <strong>AT LEAST 3 different LLM/code models</strong>... Keep the application, prompts, questions/tasks, knowledge base, and evaluation conditions identical to understand how model choice affects performance.&rdquo;
          <span className="text-[#64748b] block mt-1">— Lab 4 Exercise 1 Specification</span>
        </blockquote>
      </div>

      {/* 3 Model Profiles Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-[#cbd5e1] font-mono uppercase tracking-wider">
          Evaluated Model Architectural Profiles
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Gemma 3 4B Profile */}
          <div className="rounded-2xl bg-[#0a0d14] border border-[#1f293d] p-5 space-y-4 hover:border-[#3b82f6]/60 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#161c2b]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#3b82f6]/20 border border-[#3b82f6]/40 flex items-center justify-center text-[#60a5fa] font-mono font-bold text-xs">
                    G3
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#f1f5f9] font-mono">gemma3:4b</h4>
                    <span className="text-[10.5px] text-[#64748b] font-mono">Google DeepMind</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono bg-[#3b82f6]/15 text-[#60a5fa] px-2 py-0.5 rounded border border-[#3b82f6]/30">
                  Instruction Tuned
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Parameter Size:</span>
                  <span className="text-[#e2e5ea] font-semibold">4.0 Billion</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Quantization:</span>
                  <span className="text-[#e2e5ea]">Q4_K_M (4-bit Medium)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Context Window:</span>
                  <span className="text-[#e2e5ea]">8,192 tokens</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Serving Runtime:</span>
                  <span className="text-[#e2e5ea]">Ollama Local Engine</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#64748b]">Architecture:</span>
                  <span className="text-[#38bdf8]">Gemma-3 Transformer</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#161c2b] space-y-1.5 text-xs text-[#94a3b8]">
                <div className="text-[11px] font-mono text-[#cbd5e1] font-semibold">Key Capabilities:</div>
                <p className="text-[11.5px] leading-relaxed">
                  Excels in instruction adherence, concise factual summarization, and rapid token generation without verbosity runaway.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#161c2b] text-[11px] font-mono text-[#10b981] flex items-center justify-between">
              <span>Avg Correctness: <strong>{((gemmaSummary?.average_correctness ?? 0.4808) * 100).toFixed(1)}%</strong></span>
              <span className="text-[#60a5fa]">Latency: <strong>{(gemmaSummary?.average_latency_seconds ?? 33.21).toFixed(2)}s</strong></span>
            </div>
          </div>

          {/* CodeLlama 7B Profile */}
          <div className="rounded-2xl bg-[#0a0d14] border border-[#1f293d] p-5 space-y-4 hover:border-[#0284c7]/60 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#161c2b]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0284c7]/20 border border-[#0284c7]/40 flex items-center justify-center text-[#38bdf8] font-mono font-bold text-xs">
                    CL
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#f1f5f9] font-mono">codellama:7b</h4>
                    <span className="text-[10.5px] text-[#64748b] font-mono">Meta AI</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono bg-[#0284c7]/15 text-[#38bdf8] px-2 py-0.5 rounded border border-[#0284c7]/30">
                  Code + Instruct
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Parameter Size:</span>
                  <span className="text-[#e2e5ea] font-semibold">6.7 Billion</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Quantization:</span>
                  <span className="text-[#e2e5ea]">Q4_K_M (4-bit Medium)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Context Window:</span>
                  <span className="text-[#e2e5ea]">16,384 tokens</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Serving Runtime:</span>
                  <span className="text-[#e2e5ea]">Ollama Local Engine</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#64748b]">Architecture:</span>
                  <span className="text-[#38bdf8]">Llama-2 Auto-regressive</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#161c2b] space-y-1.5 text-xs text-[#94a3b8]">
                <div className="text-[11px] font-mono text-[#cbd5e1] font-semibold">Key Capabilities:</div>
                <p className="text-[11.5px] leading-relaxed">
                  Specialized in Python AST structure, complex request body schemas, unit tests, and multi-parameter API workflows.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#161c2b] text-[11px] font-mono text-[#10b981] flex items-center justify-between">
              <span>Avg Correctness: <strong>{((codellamaSummary?.average_correctness ?? 0.4090) * 100).toFixed(1)}%</strong></span>
              <span className="text-[#60a5fa]">Latency: <strong>{(codellamaSummary?.average_latency_seconds ?? 47.89).toFixed(2)}s</strong></span>
            </div>
          </div>

          {/* StarCoder2 3B Profile */}
          <div className="rounded-2xl bg-[#0a0d14] border border-[#1f293d] p-5 space-y-4 hover:border-[#d97706]/60 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#161c2b]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#d97706]/20 border border-[#d97706]/40 flex items-center justify-center text-[#fbbf24] font-mono font-bold text-xs">
                    SC
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#f1f5f9] font-mono">starcoder2:3b</h4>
                    <span className="text-[10.5px] text-[#64748b] font-mono">BigCode / ServiceNow</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono bg-[#d97706]/15 text-[#fbbf24] px-2 py-0.5 rounded border border-[#d97706]/30">
                  Base Completion
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Parameter Size:</span>
                  <span className="text-[#e2e5ea] font-semibold">3.0 Billion</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Quantization:</span>
                  <span className="text-[#e2e5ea]">Q4_0 (Standard 4-bit)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Context Window:</span>
                  <span className="text-[#e2e5ea]">16,384 tokens</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#121622]">
                  <span className="text-[#64748b]">Serving Runtime:</span>
                  <span className="text-[#e2e5ea]">Ollama Local Engine</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[#64748b]">Architecture:</span>
                  <span className="text-[#38bdf8]">StarCoder-2 (Fill-In-Middle)</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#161c2b] space-y-1.5 text-xs text-[#94a3b8]">
                <div className="text-[11px] font-mono text-[#cbd5e1] font-semibold">Key Capabilities &amp; Limitations:</div>
                <p className="text-[11.5px] leading-relaxed">
                  Raw code-completion model without conversational instruction tuning. Loops repeatedly, hallucinating multi-choice quizzes or hitting 60s timeouts on open Q&amp;A.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#161c2b] text-[11px] font-mono text-[#f87171] flex items-center justify-between">
              <span>Avg Correctness: <strong>{((starcoderSummary?.average_correctness ?? 0.0962) * 100).toFixed(1)}%</strong></span>
              <span className="text-[#fbbf24]">Latency: <strong>{(starcoderSummary?.average_latency_seconds ?? 32.93).toFixed(2)}s</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Experimental Invariants & Control Environment */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-[#cbd5e1] font-mono uppercase tracking-wider">
          Experimental Controls &amp; Invariant Checklist
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Prompt Template Invariant */}
          <div className="p-5 rounded-2xl bg-[#090c12] border border-[#1a2233] space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-[#e2e5ea] flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#60a5fa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  <span>Identical Standardized Prompt Template</span>
                </span>
                <button
                  onClick={handleCopyPrompt}
                  className="text-[11px] font-mono text-[#60a5fa] hover:text-[#93c5fd] bg-[#121722] px-2 py-0.5 rounded border border-[#1e2738] cursor-pointer"
                >
                  {copiedPrompt ? '✓ Copied' : 'Copy Template'}
                </button>
              </div>
              <p className="text-xs text-[#64748b] leading-relaxed mb-3">
                Applied uniformly to all 78 evaluation runs across all 3 models without model-specific prompt engineering.
              </p>
              <pre className="p-3 bg-[#06070a] border border-[#141926] rounded-xl text-[11px] font-mono text-[#93c5fd] leading-relaxed overflow-x-auto custom-scrollbar">
                <code>{standardizedPrompt}</code>
              </pre>
            </div>

            <div className="mt-3 pt-2 text-[10.5px] font-mono text-[#64748b] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10b981]" />
              <span>Zero few-shot bias; pure zero-shot grounded retrieval evaluation.</span>
            </div>
          </div>

          {/* RAG & Hardware Invariants */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#090c12] border border-[#1a2233] space-y-2">
              <div className="text-xs font-mono font-bold text-[#e2e5ea] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                <span>Knowledge Base Invariant (Corpus)</span>
              </div>
              <p className="text-xs text-[#94a3b8] leading-relaxed">
                21 total enterprise API documentation files indexed in ChromaDB:
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[#cbd5e1] mt-2">
                <div className="p-2 bg-[#0c1018] rounded-lg border border-[#172030]">
                  • 10 OpenAPI 3.0 Specs
                </div>
                <div className="p-2 bg-[#0c1018] rounded-lg border border-[#172030]">
                  • 9 Architecture Guides
                </div>
                <div className="p-2 bg-[#0c1018] rounded-lg border border-[#172030]">
                  • 2 Postman Collections
                </div>
                <div className="p-2 bg-[#0c1018] rounded-lg border border-[#172030]">
                  • 103 BGE-Small Chunks
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#090c12] border border-[#1a2233] space-y-2">
              <div className="text-xs font-mono font-bold text-[#e2e5ea] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                <span>Retrieval Pipeline &amp; Hyperparameter Invariants</span>
              </div>
              <div className="space-y-1.5 text-xs text-[#94a3b8] font-mono">
                <div className="flex justify-between py-0.5 border-b border-[#141a26]">
                  <span className="text-[#64748b]">Search Strategy:</span>
                  <span className="text-[#e2e5ea]">Hybrid (BM25 + ChromaDB Dense)</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-[#141a26]">
                  <span className="text-[#64748b]">Re-Ranker Model:</span>
                  <span className="text-[#e2e5ea]">ms-marco-MiniLM-L-6-v2</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-[#141a26]">
                  <span className="text-[#64748b]">Top-k Context Depth:</span>
                  <span className="text-[#e2e5ea]">k = 5 Chunks</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[#64748b]">LLM Generation Temp:</span>
                  <span className="text-[#e2e5ea]">0.2 (Deterministic)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
