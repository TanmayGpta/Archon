"use client";
import React, { useState, useMemo } from 'react';
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
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-[#1d2436] space-y-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#60a5fa] text-xs font-mono font-bold">
              EXERCISE 5
            </span>
            <h2 className="text-lg font-bold text-[#f1f5f9] font-mono">
              RAG Pipeline Impact &amp; 4-Stage Trace Inspector
            </h2>
          </div>
          <span className="text-xs font-mono text-[#06b6d4] bg-[#06b6d4]/15 px-3 py-1 rounded-full border border-[#06b6d4]/30">
            15 Full Execution Traces
          </span>
        </div>

        <blockquote className="border-l-2 border-[#3b82f6] pl-3 py-1.5 bg-[#080a0f] rounded-r text-xs text-[#94a3b8] font-mono leading-relaxed">
          &ldquo;Analyse how retrieval affects the final LLM response. Record: <strong>QUESTION → RETRIEVED CONTEXT → LLM RESPONSE</strong>. Identify examples where relevant info was retrieved, irrelevant info was retrieved, important info was missed, and hallucination occurred.&rdquo;
          <span className="text-[#64748b] block mt-1">— Lab 4 Exercise 5 Specification</span>
        </blockquote>
      </div>

      {/* RAG Pipeline Flow Diagram */}
      <div className="p-5 rounded-2xl bg-[#0a0d14] border border-[#1a2233] space-y-3">
        <div className="text-xs font-mono font-bold text-[#cbd5e1] uppercase tracking-wider">
          End-to-End Pipeline Execution Flow
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-center text-xs font-mono">
          <div className="p-3 bg-[#0c1018] rounded-xl border border-[#1c2436] space-y-1">
            <div className="text-[10px] text-[#60a5fa] font-bold uppercase">Stage 1</div>
            <div className="font-bold text-[#e2e5ea]">Developer Prompt</div>
            <div className="text-[10.5px] text-[#64748b]">Exact User Query</div>
          </div>

          <div className="p-3 bg-[#0c1018] rounded-xl border border-[#1c2436] space-y-1">
            <div className="text-[10px] text-[#38bdf8] font-bold uppercase">Stage 2</div>
            <div className="font-bold text-[#e2e5ea]">Hybrid Retriever</div>
            <div className="text-[10.5px] text-[#64748b]">BM25 + ChromaDB + Cross-Enc</div>
          </div>

          <div className="p-3 bg-[#0c1018] rounded-xl border border-[#1c2436] space-y-1">
            <div className="text-[10px] text-[#a78bfa] font-bold uppercase">Stage 3</div>
            <div className="font-bold text-[#e2e5ea]">Injected Context</div>
            <div className="text-[10.5px] text-[#64748b]">Top-5 Grounded Chunks</div>
          </div>

          <div className="p-3 bg-[#0c1018] rounded-xl border border-[#1c2436] space-y-1">
            <div className="text-[10px] text-[#10b981] font-bold uppercase">Stage 4</div>
            <div className="font-bold text-[#e2e5ea]">LLM Synthesis</div>
            <div className="text-[10.5px] text-[#64748b]">Side-by-Side Model Outputs</div>
          </div>
        </div>
      </div>

      {/* Case Study Question Selector Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#cbd5e1] font-mono uppercase tracking-wider">
            Select Deep-Dive Case Study Question
          </h3>
          <span className="text-xs font-mono text-[#64748b]">
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
                className={`p-3 rounded-xl border text-left font-mono transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#1a2336] border-[#3b82f6] text-white shadow-lg shadow-blue-900/20'
                    : 'bg-[#090c12] border-[#161c28] text-[#8b949e] hover:text-[#e2e5ea] hover:bg-[#0e131d]'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${isSelected ? 'text-[#60a5fa]' : 'text-[#64748b]'}`}>
                    {qid}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#06080c] text-[#94a3b8]">
                    3 Models
                  </span>
                </div>
                <div className="text-[11px] font-sans truncate font-medium">
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
          <div className="p-5 rounded-2xl bg-[#0a0d14] border border-[#1c2436] space-y-2.5 shadow-lg">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-[#3b82f6]/20 border border-[#3b82f6]/40 flex items-center justify-center text-[#60a5fa] font-bold text-[11px]">
                  1
                </span>
                <span className="font-bold text-[#e2e5ea]">STAGE 1: DEVELOPER QUERY</span>
              </div>
              <span className="text-[#64748b] bg-[#121622] px-2.5 py-0.5 rounded border border-[#1a2233]">
                {sampleTrace.group}
              </span>
            </div>

            <div className="p-3.5 bg-[#07090e] rounded-xl border border-[#141a26] text-sm text-[#f1f5f9] font-medium leading-relaxed">
              {sampleTrace.question}
            </div>
          </div>

          {/* Stage 2: Retriever Performance */}
          <div className="p-5 rounded-2xl bg-[#0a0d14] border border-[#1c2436] space-y-3 shadow-lg">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-[#38bdf8]/20 border border-[#38bdf8]/40 flex items-center justify-center text-[#38bdf8] font-bold text-[11px]">
                  2
                </span>
                <span className="font-bold text-[#e2e5ea]">STAGE 2: HYBRID RETRIEVER ASSESSMENT</span>
              </div>
              <span className={`px-2.5 py-0.5 rounded border text-[10.5px] font-bold uppercase ${
                sampleTrace.retrieval_quality === 'correct'
                  ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                  : sampleTrace.retrieval_quality === 'partial'
                  ? 'bg-[#3b82f6]/15 text-[#60a5fa] border-[#3b82f6]/30'
                  : 'bg-[#fbbf24]/15 text-[#fbbf24] border-[#fbbf24]/30'
              }`}>
                Retrieval: {sampleTrace.retrieval_quality.replace('_', ' ')}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              {/* Expected Sources */}
              <div className="p-3.5 bg-[#07090e] rounded-xl border border-[#141a26] space-y-2">
                <span className="text-[#64748b] text-[10.5px] uppercase tracking-wider block">
                  Expected Canonical Sources:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sampleTrace.expected_sources.map((src, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-[#111622] text-[#38bdf8] border border-[#1b2538] text-[11.5px]">
                      📄 {src}
                    </span>
                  ))}
                </div>
              </div>

              {/* Retrieved Sources */}
              <div className="p-3.5 bg-[#07090e] rounded-xl border border-[#141a26] space-y-2">
                <span className="text-[#64748b] text-[10.5px] uppercase tracking-wider block">
                  Top-k Sources Retrieved:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sampleTrace.sources_retrieved.map((src, i) => {
                    const isExpected = sampleTrace.expected_sources.includes(src);
                    return (
                      <span
                        key={i}
                        className={`px-2.5 py-1 rounded-lg border text-[11.5px] flex items-center gap-1 ${
                          isExpected
                            ? 'bg-[#10b981]/10 text-[#34d399] border-[#10b981]/30'
                            : 'bg-[#d97706]/10 text-[#fbbf24] border-[#d97706]/30'
                        }`}
                      >
                        <span>{isExpected ? '✓' : '⚠️'}</span>
                        <span>{src}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Stage 3: Injected Context */}
          <div className="p-5 rounded-2xl bg-[#0a0d14] border border-[#1c2436] space-y-2.5 shadow-lg">
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-[#a78bfa]/20 border border-[#a78bfa]/40 flex items-center justify-center text-[#a78bfa] font-bold text-[11px]">
                  3
                </span>
                <span className="font-bold text-[#e2e5ea]">STAGE 3: RAW CONTEXT INJECTED INTO PROMPT</span>
              </div>
              <span className="text-[#64748b] text-[11px]">
                {sampleTrace.context_injected.length} characters
              </span>
            </div>

            <pre className="p-4 bg-[#07090e] rounded-xl border border-[#141a26] text-[11px] font-mono text-[#93c5fd] leading-relaxed max-h-56 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
              <code>{sampleTrace.context_injected}</code>
            </pre>
          </div>

          {/* Stage 4: Multi-Model Side-by-Side Response Comparison */}
          <div className="p-5 rounded-2xl bg-[#0a0d14] border border-[#1c2436] space-y-4 shadow-xl">
            <div className="flex items-center justify-between text-xs font-mono border-b border-[#161c28] pb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-[#10b981]/20 border border-[#10b981]/40 flex items-center justify-center text-[#10b981] font-bold text-[11px]">
                  4
                </span>
                <span className="font-bold text-[#e2e5ea]">STAGE 4: SIDE-BY-SIDE MODEL SYNTHESIS COMPARISON</span>
              </div>
              <span className="text-[#64748b]">Identical Injected Context Chunks</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Gemma 3 4B Response */}
              <div className="p-4 rounded-xl bg-[#07090e] border border-[#1e283d] space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-[#141a26]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" />
                      <span className="font-bold text-xs font-mono text-[#e2e5ea]">gemma3:4b</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#34d399]">
                      Score: {((gemmaTrace?.correctness_score || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {gemmaTrace?.hallucination_flag === 1 && (
                    <div className="mt-2 p-2 rounded bg-[#ef4444]/15 border border-[#ef4444]/30 text-[10.5px] font-mono text-[#f87171]">
                      ⚠️ Hallucination Flagged: {gemmaTrace.hallucination_notes}
                    </div>
                  )}

                  <div className="mt-3 text-xs font-mono text-[#cbd5e1] leading-relaxed max-h-80 overflow-y-auto custom-scrollbar p-2 bg-[#050608] rounded-lg border border-[#10141e] whitespace-pre-wrap">
                    {gemmaTrace?.llm_response || 'No response captured'}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#141a26] text-[10.5px] font-mono text-[#64748b] flex justify-between">
                  <span>Adherence: High</span>
                  <span className="text-[#34d399]">Factual Precision</span>
                </div>
              </div>

              {/* CodeLlama 7B Response */}
              <div className="p-4 rounded-xl bg-[#07090e] border border-[#1e283d] space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-[#141a26]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#38bdf8]" />
                      <span className="font-bold text-xs font-mono text-[#e2e5ea]">codellama:7b</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#38bdf8]">
                      Score: {((codellamaTrace?.correctness_score || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {codellamaTrace?.hallucination_flag === 1 && (
                    <div className="mt-2 p-2 rounded bg-[#ef4444]/15 border border-[#ef4444]/30 text-[10.5px] font-mono text-[#f87171]">
                      ⚠️ Hallucination Flagged: {codellamaTrace.hallucination_notes}
                    </div>
                  )}

                  <div className="mt-3 text-xs font-mono text-[#cbd5e1] leading-relaxed max-h-80 overflow-y-auto custom-scrollbar p-2 bg-[#050608] rounded-lg border border-[#10141e] whitespace-pre-wrap">
                    {codellamaTrace?.llm_response || 'No response captured'}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#141a26] text-[10.5px] font-mono text-[#64748b] flex justify-between">
                  <span>Code Syntax: Strict</span>
                  <span className="text-[#38bdf8]">Detailed Schema</span>
                </div>
              </div>

              {/* StarCoder2 3B Response */}
              <div className="p-4 rounded-xl bg-[#07090e] border border-[#1e283d] space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-[#141a26]">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24]" />
                      <span className="font-bold text-xs font-mono text-[#e2e5ea]">starcoder2:3b</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#f87171]">
                      Score: {((starcoderTrace?.correctness_score || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {starcoderTrace?.hallucination_flag === 1 && (
                    <div className="mt-2 p-2 rounded bg-[#ef4444]/15 border border-[#ef4444]/30 text-[10.5px] font-mono text-[#f87171]">
                      ⚠️ Hallucination Flagged: {starcoderTrace.hallucination_notes}
                    </div>
                  )}

                  <div className="mt-3 text-xs font-mono text-[#cbd5e1] leading-relaxed max-h-80 overflow-y-auto custom-scrollbar p-2 bg-[#050608] rounded-lg border border-[#10141e] whitespace-pre-wrap">
                    {starcoderTrace?.llm_response || 'No response captured'}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#141a26] text-[10.5px] font-mono text-[#64748b] flex justify-between">
                  <span>Limitation: Raw Completion</span>
                  <span className="text-[#f87171]">Hallucinated Quizzes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
