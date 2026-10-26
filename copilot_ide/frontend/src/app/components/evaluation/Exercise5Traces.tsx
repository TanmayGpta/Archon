"use client";
import React, { useState, useMemo } from 'react';
import { Glyph } from '../Icons';
import { EVALUATION_DATA, TraceRecord } from './evaluationData';

interface Exercise5TracesProps {
  initialQuestionId?: string;
}

export function Exercise5Traces({ initialQuestionId }: Exercise5TracesProps) {
  const traces = EVALUATION_DATA.exercise_5.traces;

  // Extract unique candidate question IDs
  const candidateQuestionIds = useMemo(() => {
    return Array.from(new Set(traces.map(t => t.question_id))).sort();
  }, [traces]);

  const [selectedQId, setSelectedQId] = useState<string>(
    initialQuestionId && candidateQuestionIds.includes(initialQuestionId)
      ? initialQuestionId
      : candidateQuestionIds[0] || 'Q12'
  );

  const [activeStage, setActiveStage] = useState<'all' | 'stage1' | 'stage2' | 'stage3' | 'stage4'>('all');

  // Filter traces for the active question
  const currentTraces = useMemo(() => {
    return traces.filter(t => t.question_id === selectedQId);
  }, [traces, selectedQId]);

  const sampleTrace = currentTraces[0] || traces[0];

  const getTraceForModel = (modelName: string): TraceRecord | undefined => {
    return currentTraces.find(t => t.model.toLowerCase().includes(modelName.toLowerCase()));
  };

  const gemmaTrace = getTraceForModel('gemma');
  const codellamaTrace = getTraceForModel('codellama');
  const starcoderTrace = getTraceForModel('starcoder');

  const questionTitles: Record<string, string> = {
    'Q4': 'Q4: Incident Escalation & Twilio Notification (Workflow)',
    'Q8': 'Q8: Stripe Endpoint in Order Management (Cross-File)',
    'Q12': 'Q12: API Gateway Routing & Internal Exclusions (Security)',
    'Q20': 'Q20: Billing Glossary Decoy vs Stripe Spec (Hard Negative)',
    'Q21': 'Q21: Customer Support Refund Flow (Decoy Surfaced)'
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Exercise Briefing Header */}
      <div className="p-6 rounded-panel bg-raised border border-line-strong space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-panel bg-accent/20 border border-accent/40 text-accent-fg text-xs font-mono font-bold">
              EXERCISE 5
            </span>
            <h2 className="text-lg font-bold text-fg-strong font-mono">
              RAG Pipeline Impact &amp; 4-Stage Trace Inspector
            </h2>
          </div>
          <span className="text-xs font-mono text-[#06b6d4] bg-[#06b6d4]/15 px-3 py-1 rounded-full border border-[#06b6d4]/30">
            15 Full Execution Traces
          </span>
        </div>

        <blockquote className="border-l-2 border-accent pl-3 py-1.5 bg-canvas rounded-r text-xs text-fg-muted font-mono leading-relaxed">
          &ldquo;Analyse how retrieval affects the final LLM response. Record: <strong>QUESTION → RETRIEVED CONTEXT → LLM RESPONSE</strong>. Identify examples where relevant info was retrieved, irrelevant info was retrieved, important info was missed, and hallucination occurred.&rdquo;
          <span className="text-fg-subtle block mt-1">— Lab 4 Exercise 5 Specification</span>
        </blockquote>
      </div>

      {/* RAG Pipeline Flow Diagram */}
      <div className="p-5 rounded-panel bg-surface border border-line space-y-3">
        <div className="text-xs font-mono font-bold text-fg-soft uppercase tracking-wider">
          End-to-End Pipeline Execution Flow
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-center text-xs font-mono">
          <div className="p-3 bg-surface rounded-panel border border-line space-y-1">
            <div className="text-xs text-accent-fg font-bold uppercase">Stage 1</div>
            <div className="font-bold text-fg">Developer Prompt</div>
            <div className="text-xs text-fg-subtle">Exact User Query</div>
          </div>

          <div className="p-3 bg-surface rounded-panel border border-line space-y-1">
            <div className="text-xs text-info font-bold uppercase">Stage 2</div>
            <div className="font-bold text-fg">Hybrid Retriever</div>
            <div className="text-xs text-fg-subtle">BM25 + ChromaDB + Cross-Enc</div>
          </div>

          <div className="p-3 bg-surface rounded-panel border border-line space-y-1">
            <div className="text-xs text-ai font-bold uppercase">Stage 3</div>
            <div className="font-bold text-fg">Injected Context</div>
            <div className="text-xs text-fg-subtle">Top-5 Grounded Chunks</div>
          </div>

          <div className="p-3 bg-surface rounded-panel border border-line space-y-1">
            <div className="text-xs text-success font-bold uppercase">Stage 4</div>
            <div className="font-bold text-fg">LLM Synthesis</div>
            <div className="text-xs text-fg-subtle">Side-by-Side Model Outputs</div>
          </div>
        </div>
      </div>

      {/* Case Study Question Selector Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">
            Select Deep-Dive Case Study Question
          </h3>
          <span className="text-xs font-mono text-fg-subtle">
            Comparing 3 models on identical context
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {candidateQuestionIds.map(qid => {
            const isSelected = selectedQId === qid;
            return (
              <button
                key={qid}
                onClick={() => setSelectedQId(qid)}
                className={`p-3 rounded-control border text-left font-mono transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-selected border-accent text-white shadow-blue-900/20'
                    : 'bg-surface border-line text-fg-muted hover:text-fg hover:bg-raised'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${isSelected ? 'text-accent-fg' : 'text-fg-subtle'}`}>
                    {qid}
                  </span>
                  <span className="text-xs px-1.5 py-0.2 rounded-control bg-canvas text-fg-muted">
                    3 Models
                  </span>
                </div>
                <div className="text-xs font-sans truncate font-medium">
                  {questionTitles[qid] || qid}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4-Stage Trace Inspector Layout */}
      {sampleTrace && (
        <div className="space-y-6">
          {/* Stage 1: Developer Query */}
          <div className="p-5 rounded-panel bg-surface border border-line space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-control bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-fg font-bold text-xs">
                  1
                </span>
                <span className="font-bold text-fg">STAGE 1: DEVELOPER QUERY</span>
              </div>
              <span className="text-fg-subtle bg-raised px-2.5 py-0.5 rounded-control border border-line">
                {sampleTrace.group}
              </span>
            </div>

            <div className="p-3.5 bg-canvas rounded-panel border border-line-subtle text-sm text-fg-strong font-medium leading-relaxed">
              {sampleTrace.question}
            </div>
          </div>

          {/* Stage 2: Retriever Performance */}
          <div className="p-5 rounded-panel bg-surface border border-line space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-control bg-info/20 border border-info/40 flex items-center justify-center text-info font-bold text-xs">
                  2
                </span>
                <span className="font-bold text-fg">STAGE 2: HYBRID RETRIEVER ASSESSMENT</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-control border text-xs font-bold uppercase ${
                sampleTrace.retrieval_quality === 'correct'
                  ? 'bg-success/15 text-success border-success/30'
                  : sampleTrace.retrieval_quality === 'partial'
                  ? 'bg-accent/15 text-accent-fg border-accent/30'
                  : 'bg-warning-fg/15 text-warning-fg border-warning-fg/30'
              }`}>
                Retrieval: {sampleTrace.retrieval_quality.replace('_', ' ')}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              {/* Expected Sources */}
              <div className="p-3.5 bg-canvas rounded-panel border border-line-subtle space-y-2">
                <span className="text-fg-subtle text-xs uppercase tracking-wider block">
                  Expected Canonical Sources:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sampleTrace.expected_sources.map((src, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-panel bg-raised text-info border border-line-strong text-sm">
                      <Glyph name="file" /> {src}
                    </span>
                  ))}
                </div>
              </div>

              {/* Retrieved Sources */}
              <div className="p-3.5 bg-canvas rounded-panel border border-line-subtle space-y-2">
                <span className="text-fg-subtle text-xs uppercase tracking-wider block">
                  Top-k Sources Retrieved:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sampleTrace.sources_retrieved.map((src, i) => {
                    const isExpected = sampleTrace.expected_sources.includes(src);
                    return (
                      <span
                        key={i}
                        className={`px-2.5 py-1 rounded-panel border text-sm flex items-center gap-1 ${
                          isExpected
                            ? 'bg-success/10 text-success-fg border-success/30'
                            : 'bg-[#d97706]/10 text-warning-fg border-[#d97706]/30'
                        }`}
                      >
                        <span>{isExpected ? '✓' : <Glyph name="alert" />}</span>
                        <span>{src}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Stage 3: Injected Context */}
          <div className="p-5 rounded-panel bg-surface border border-line space-y-2.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-control bg-ai/20 border border-ai/40 flex items-center justify-center text-ai font-bold text-xs">
                  3
                </span>
                <span className="font-bold text-fg">STAGE 3: RAW CONTEXT INJECTED INTO PROMPT</span>
              </div>
              <span className="text-fg-subtle text-xs">
                {sampleTrace.context_injected.length} characters
              </span>
            </div>

            <pre className="p-4 bg-canvas rounded-panel border border-line-subtle text-xs font-mono text-[#93c5fd] leading-relaxed max-h-56 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
              <code>{sampleTrace.context_injected}</code>
            </pre>
          </div>

          {/* Stage 4: Multi-Model Side-by-Side Response Comparison */}
          <div className="p-5 rounded-panel bg-surface border border-line space-y-4">
            <div className="flex items-center justify-between text-xs font-mono border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-control bg-success/20 border border-success/40 flex items-center justify-center text-success font-bold text-xs">
                  4
                </span>
                <span className="font-bold text-fg">STAGE 4: SIDE-BY-SIDE MODEL SYNTHESIS COMPARISON</span>
              </div>
              <span className="text-fg-subtle">Identical Injected Context Chunks</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Gemma 3 4B Response */}
              <div className="p-4 rounded-panel bg-canvas border border-line-strong space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-line-subtle">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                      <span className="font-bold text-xs font-mono text-fg">gemma3:4b</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-success-fg">
                      Score: {((gemmaTrace?.correctness_score || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {gemmaTrace?.hallucination_flag === 1 && (
                    <div className="mt-2 p-2 rounded-control bg-danger/15 border border-danger/30 text-xs font-mono text-danger-fg">
                      <Glyph name="alert" /> Hallucination Flagged: {gemmaTrace.hallucination_notes}
                    </div>
                  )}

                  <div className="mt-3 text-xs font-mono text-fg-soft leading-relaxed max-h-80 overflow-y-auto custom-scrollbar p-2 bg-canvas rounded-panel border border-line-subtle whitespace-pre-wrap">
                    {gemmaTrace?.llm_response || 'No response captured'}
                  </div>
                </div>

                <div className="pt-2 border-t border-line-subtle text-xs font-mono text-fg-subtle flex justify-between">
                  <span>Adherence: High</span>
                  <span className="text-success-fg">Factual Precision</span>
                </div>
              </div>

              {/* CodeLlama 7B Response */}
              <div className="p-4 rounded-panel bg-canvas border border-line-strong space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-line-subtle">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-info" />
                      <span className="font-bold text-xs font-mono text-fg">codellama:7b</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-info">
                      Score: {((codellamaTrace?.correctness_score || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {codellamaTrace?.hallucination_flag === 1 && (
                    <div className="mt-2 p-2 rounded-control bg-danger/15 border border-danger/30 text-xs font-mono text-danger-fg">
                      <Glyph name="alert" /> Hallucination Flagged: {codellamaTrace.hallucination_notes}
                    </div>
                  )}

                  <div className="mt-3 text-xs font-mono text-fg-soft leading-relaxed max-h-80 overflow-y-auto custom-scrollbar p-2 bg-canvas rounded-panel border border-line-subtle whitespace-pre-wrap">
                    {codellamaTrace?.llm_response || 'No response captured'}
                  </div>
                </div>

                <div className="pt-2 border-t border-line-subtle text-xs font-mono text-fg-subtle flex justify-between">
                  <span>Code Syntax: Strict</span>
                  <span className="text-info">Detailed Schema</span>
                </div>
              </div>

              {/* StarCoder2 3B Response */}
              <div className="p-4 rounded-panel bg-canvas border border-line-strong space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-line-subtle">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-warning-fg" />
                      <span className="font-bold text-xs font-mono text-fg">starcoder2:3b</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-danger-fg">
                      Score: {((starcoderTrace?.correctness_score || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {starcoderTrace?.hallucination_flag === 1 && (
                    <div className="mt-2 p-2 rounded-control bg-danger/15 border border-danger/30 text-xs font-mono text-danger-fg">
                      <Glyph name="alert" /> Hallucination Flagged: {starcoderTrace.hallucination_notes}
                    </div>
                  )}

                  <div className="mt-3 text-xs font-mono text-fg-soft leading-relaxed max-h-80 overflow-y-auto custom-scrollbar p-2 bg-canvas rounded-panel border border-line-subtle whitespace-pre-wrap">
                    {starcoderTrace?.llm_response || 'No response captured'}
                  </div>
                </div>

                <div className="pt-2 border-t border-line-subtle text-xs font-mono text-fg-subtle flex justify-between">
                  <span>Limitation: Raw Completion</span>
                  <span className="text-danger-fg">Hallucinated Quizzes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
