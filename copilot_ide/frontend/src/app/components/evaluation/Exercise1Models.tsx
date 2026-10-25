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
      <div className="p-6 rounded-2xl bg-raised border border-line-strong space-y-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/40 text-accent-fg text-xs font-mono font-bold">
              EXERCISE 1
            </span>
            <h2 className="text-lg font-bold text-fg-strong font-mono">
              Evaluate Multiple LLM / Code Models
            </h2>
          </div>
          <span className="text-xs font-mono text-success bg-success/15 px-3 py-1 rounded-full border border-success/30">
            ✓ Condition Invariance Verified (3 Models)
          </span>
        </div>

        <blockquote className="border-l-2 border-accent pl-3 py-1.5 bg-canvas rounded-r text-xs text-fg-muted font-mono leading-relaxed">
          &ldquo;Evaluate your application using <strong>AT LEAST 3 different LLM/code models</strong>... Keep the application, prompts, questions/tasks, knowledge base, and evaluation conditions identical to understand how model choice affects performance.&rdquo;
          <span className="text-fg-subtle block mt-1">— Lab 4 Exercise 1 Specification</span>
        </blockquote>
      </div>

      {/* 3 Model Profiles Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">
          Evaluated Model Architectural Profiles
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Gemma 3 4B Profile */}
          <div className="rounded-2xl bg-surface border border-line-strong p-5 space-y-4 hover:border-accent/60 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-fg font-mono font-bold text-xs">
                    G3
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-fg-strong font-mono">gemma3:4b</h4>
                    <span className="text-xs text-fg-subtle font-mono">Google DeepMind</span>
                  </div>
                </div>
                <span className="text-xs font-mono bg-accent/15 text-accent-fg px-2 py-0.5 rounded border border-accent/30">
                  Instruction Tuned
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Parameter Size:</span>
                  <span className="text-fg font-semibold">4.0 Billion</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Quantization:</span>
                  <span className="text-fg">Q4_K_M (4-bit Medium)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Context Window:</span>
                  <span className="text-fg">8,192 tokens</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Serving Runtime:</span>
                  <span className="text-fg">Ollama Local Engine</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-fg-subtle">Architecture:</span>
                  <span className="text-info">Gemma-3 Transformer</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line space-y-1.5 text-xs text-fg-muted">
                <div className="text-xs font-mono text-fg-soft font-semibold">Key Capabilities:</div>
                <p className="text-sm leading-relaxed">
                  Excels in instruction adherence, concise factual summarization, and rapid token generation without verbosity runaway.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-line text-xs font-mono text-success flex items-center justify-between">
              <span>Avg Correctness: <strong>{((gemmaSummary?.average_correctness ?? 0.4808) * 100).toFixed(1)}%</strong></span>
              <span className="text-accent-fg">Latency: <strong>{(gemmaSummary?.average_latency_seconds ?? 33.21).toFixed(2)}s</strong></span>
            </div>
          </div>

          {/* CodeLlama 7B Profile */}
          <div className="rounded-2xl bg-surface border border-line-strong p-5 space-y-4 hover:border-info-strong/60 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-info-strong/20 border border-info-strong/40 flex items-center justify-center text-info font-mono font-bold text-xs">
                    CL
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-fg-strong font-mono">codellama:7b</h4>
                    <span className="text-xs text-fg-subtle font-mono">Meta AI</span>
                  </div>
                </div>
                <span className="text-xs font-mono bg-info-strong/15 text-info px-2 py-0.5 rounded border border-info-strong/30">
                  Code + Instruct
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Parameter Size:</span>
                  <span className="text-fg font-semibold">6.7 Billion</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Quantization:</span>
                  <span className="text-fg">Q4_K_M (4-bit Medium)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Context Window:</span>
                  <span className="text-fg">16,384 tokens</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Serving Runtime:</span>
                  <span className="text-fg">Ollama Local Engine</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-fg-subtle">Architecture:</span>
                  <span className="text-info">Llama-2 Auto-regressive</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line space-y-1.5 text-xs text-fg-muted">
                <div className="text-xs font-mono text-fg-soft font-semibold">Key Capabilities:</div>
                <p className="text-sm leading-relaxed">
                  Specialized in Python AST structure, complex request body schemas, unit tests, and multi-parameter API workflows.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-line text-xs font-mono text-success flex items-center justify-between">
              <span>Avg Correctness: <strong>{((codellamaSummary?.average_correctness ?? 0.4090) * 100).toFixed(1)}%</strong></span>
              <span className="text-accent-fg">Latency: <strong>{(codellamaSummary?.average_latency_seconds ?? 47.89).toFixed(2)}s</strong></span>
            </div>
          </div>

          {/* StarCoder2 3B Profile */}
          <div className="rounded-2xl bg-surface border border-line-strong p-5 space-y-4 hover:border-[#d97706]/60 transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#d97706]/20 border border-[#d97706]/40 flex items-center justify-center text-warning-fg font-mono font-bold text-xs">
                    SC
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-fg-strong font-mono">starcoder2:3b</h4>
                    <span className="text-xs text-fg-subtle font-mono">BigCode / ServiceNow</span>
                  </div>
                </div>
                <span className="text-xs font-mono bg-[#d97706]/15 text-warning-fg px-2 py-0.5 rounded border border-[#d97706]/30">
                  Base Completion
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Parameter Size:</span>
                  <span className="text-fg font-semibold">3.0 Billion</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Quantization:</span>
                  <span className="text-fg">Q4_0 (Standard 4-bit)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Context Window:</span>
                  <span className="text-fg">16,384 tokens</span>
                </div>
                <div className="flex justify-between py-1 border-b border-line-subtle">
                  <span className="text-fg-subtle">Serving Runtime:</span>
                  <span className="text-fg">Ollama Local Engine</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-fg-subtle">Architecture:</span>
                  <span className="text-info">StarCoder-2 (Fill-In-Middle)</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line space-y-1.5 text-xs text-fg-muted">
                <div className="text-xs font-mono text-fg-soft font-semibold">Key Capabilities &amp; Limitations:</div>
                <p className="text-sm leading-relaxed">
                  Raw code-completion model without conversational instruction tuning. Loops repeatedly, hallucinating multi-choice quizzes or hitting 60s timeouts on open Q&amp;A.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-line text-xs font-mono text-danger-fg flex items-center justify-between">
              <span>Avg Correctness: <strong>{((starcoderSummary?.average_correctness ?? 0.0962) * 100).toFixed(1)}%</strong></span>
              <span className="text-warning-fg">Latency: <strong>{(starcoderSummary?.average_latency_seconds ?? 32.93).toFixed(2)}s</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Experimental Invariants & Control Environment */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">
          Experimental Controls &amp; Invariant Checklist
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Prompt Template Invariant */}
          <div className="p-5 rounded-2xl bg-surface border border-line space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-fg flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent-fg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  <span>Identical Standardized Prompt Template</span>
                </span>
                <button
                  onClick={handleCopyPrompt}
                  className="text-xs font-mono text-accent-fg hover:text-[#93c5fd] bg-raised px-2 py-0.5 rounded border border-line-strong cursor-pointer"
                >
                  {copiedPrompt ? '✓ Copied' : 'Copy Template'}
                </button>
              </div>
              <p className="text-xs text-fg-subtle leading-relaxed mb-3">
                Applied uniformly to all 78 evaluation runs across all 3 models without model-specific prompt engineering.
              </p>
              <pre className="p-3 bg-canvas border border-line-subtle rounded-xl text-xs font-mono text-[#93c5fd] leading-relaxed overflow-x-auto custom-scrollbar">
                <code>{standardizedPrompt}</code>
              </pre>
            </div>

            <div className="mt-3 pt-2 text-xs font-mono text-fg-subtle flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span>Zero few-shot bias; pure zero-shot grounded retrieval evaluation.</span>
            </div>
          </div>

          {/* RAG & Hardware Invariants */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-surface border border-line space-y-2">
              <div className="text-xs font-mono font-bold text-fg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span>Knowledge Base Invariant (Corpus)</span>
              </div>
              <p className="text-xs text-fg-muted leading-relaxed">
                21 total enterprise API documentation files indexed in ChromaDB:
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-fg-soft mt-2">
                <div className="p-2 bg-surface rounded-lg border border-line">
                  • 10 OpenAPI 3.0 Specs
                </div>
                <div className="p-2 bg-surface rounded-lg border border-line">
                  • 9 Architecture Guides
                </div>
                <div className="p-2 bg-surface rounded-lg border border-line">
                  • 2 Postman Collections
                </div>
                <div className="p-2 bg-surface rounded-lg border border-line">
                  • 103 BGE-Small Chunks
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface border border-line space-y-2">
              <div className="text-xs font-mono font-bold text-fg flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span>Retrieval Pipeline &amp; Hyperparameter Invariants</span>
              </div>
              <div className="space-y-1.5 text-xs text-fg-muted font-mono">
                <div className="flex justify-between py-0.5 border-b border-line-subtle">
                  <span className="text-fg-subtle">Search Strategy:</span>
                  <span className="text-fg">Hybrid (BM25 + ChromaDB Dense)</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-line-subtle">
                  <span className="text-fg-subtle">Re-Ranker Model:</span>
                  <span className="text-fg">ms-marco-MiniLM-L-6-v2</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-line-subtle">
                  <span className="text-fg-subtle">Top-k Context Depth:</span>
                  <span className="text-fg">k = 5 Chunks</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-fg-subtle">LLM Generation Temp:</span>
                  <span className="text-fg">0.2 (Deterministic)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
