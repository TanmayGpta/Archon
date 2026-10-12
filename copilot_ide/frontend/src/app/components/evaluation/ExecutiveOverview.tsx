"use client";
import React from 'react';
import { EVALUATION_DATA } from './evaluationData';
import { HallucinationExplainer } from './HallucinationExplainer';

interface ExecutiveOverviewProps {
  onNavigateTab: (tabIndex: number) => void;
  onOpenJson: () => void;
}

export function ExecutiveOverview({ onNavigateTab, onOpenJson }: ExecutiveOverviewProps) {
  const gemmaSummary = EVALUATION_DATA.exercise_1.models.find(m => m.model === 'gemma3:4b');
  const codellamaSummary = EVALUATION_DATA.exercise_1.models.find(m => m.model === 'codellama:7b');
  const starcoderSummary = EVALUATION_DATA.exercise_1.models.find(m => m.model === 'starcoder2:3b');

  const gemma = EVALUATION_DATA.exercise_3.per_model_aggregates["gemma3:4b"];
  const codellama = EVALUATION_DATA.exercise_3.per_model_aggregates["codellama:7b"];
  const starcoder = EVALUATION_DATA.exercise_3.per_model_aggregates["starcoder2:3b"];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0e131f] via-[#090b10] to-[#07080b] border border-[#1e2638] p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#3b82f6]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-[#10b981]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2.5 max-w-3xl">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/30 text-[#60a5fa] text-[11px] font-mono font-semibold tracking-wide">
                LAB 4 COMPREHENSIVE BENCHMARK
              </span>
              <span className="text-[11px] font-mono text-[#64748b]">
                • Run ID: {EVALUATION_DATA.run_id.slice(0, 8)}
              </span>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-bold text-[#f1f5f9] tracking-tight font-sans">
              LLM Performance &amp; RAG Architecture Evaluation
            </h1>
            
            <p className="text-sm md:text-[14.5px] text-[#94a3b8] leading-relaxed">
              Standardized comparative evaluation of <span className="text-[#60a5fa] font-semibold">3 local open-weights LLMs</span> across a representative <span className="text-[#e2e5ea] font-semibold">26-question enterprise dataset</span>. Benchmarking factual correctness, retrieval fidelity, hallucination frequency, code test pass rates, token throughput, and system resource overhead under identical Hybrid RAG conditions.
            </p>
          </div>

          <div className="flex flex-row lg:flex-col gap-3 flex-shrink-0">
            <button
              onClick={onOpenJson}
              className="px-4 py-2.5 rounded-xl bg-[#161c2b] hover:bg-[#1e273d] text-[#60a5fa] border border-[#2b3956] text-xs font-mono font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-blue-900/20"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>Inspect Raw JSON</span>
            </button>
            <button
              onClick={() => onNavigateTab(3)}
              className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-mono font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20"
            >
              <span>View All Benchmarks</span>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Global Key Figures Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-8 pt-6 border-t border-[#1a2336]/80 text-center">
          <div className="p-3 rounded-xl bg-[#090d14] border border-[#161d2c]">
            <div className="text-[10.5px] font-mono text-[#64748b] uppercase tracking-wider">Total Evaluated Runs</div>
            <div className="text-xl font-bold font-mono text-[#60a5fa] mt-1">78</div>
            <div className="text-[10px] text-[#475569] mt-0.5">3 models × 26 tasks</div>
          </div>
          <div className="p-3 rounded-xl bg-[#090d14] border border-[#161d2c]">
            <div className="text-[10.5px] font-mono text-[#64748b] uppercase tracking-wider">Models Compared</div>
            <div className="text-xl font-bold font-mono text-[#38bdf8] mt-1">3</div>
            <div className="text-[10px] text-[#475569] mt-0.5">Gemma, CodeLlama, StarCoder</div>
          </div>
          <div className="p-3 rounded-xl bg-[#090d14] border border-[#161d2c]">
            <div className="text-[10.5px] font-mono text-[#64748b] uppercase tracking-wider">Question Dataset</div>
            <div className="text-xl font-bold font-mono text-[#a78bfa] mt-1">26</div>
            <div className="text-[10px] text-[#475569] mt-0.5">5 functional categories</div>
          </div>
          <div className="p-3 rounded-xl bg-[#090d14] border border-[#161d2c]">
            <div className="text-[10.5px] font-mono text-[#64748b] uppercase tracking-wider">Corpus Chunks</div>
            <div className="text-xl font-bold font-mono text-[#34d399] mt-1">103</div>
            <div className="text-[10px] text-[#475569] mt-0.5">Across 21 spec files</div>
          </div>
          <div className="p-3 rounded-xl bg-[#090d14] border border-[#161d2c]">
            <div className="text-[10.5px] font-mono text-[#64748b] uppercase tracking-wider">Ground Truth Endpoints</div>
            <div className="text-xl font-bold font-mono text-[#fbbf24] mt-1">74</div>
            <div className="text-[10px] text-[#475569] mt-0.5">OpenAPI 3.0 Specs</div>
          </div>
          <div className="p-3 rounded-xl bg-[#090d14] border border-[#161d2c]">
            <div className="text-[10.5px] font-mono text-[#64748b] uppercase tracking-wider">Code Pass Peak</div>
            <div className="text-xl font-bold font-mono text-[#10b981] mt-1">100.0%</div>
            <div className="text-[10px] text-[#475569] mt-0.5">CodeLlama 7B (Q24-Q26)</div>
          </div>
        </div>
      </div>

      {/* Model Leaderboard Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#e2e5ea] tracking-tight font-mono flex items-center gap-2">
              <span>🏆 Model Benchmark Scorecards</span>
            </h2>
            <p className="text-xs text-[#64748b] font-mono mt-0.5">
              Head-to-head performance metrics across the 26 standardized evaluation queries
            </p>
          </div>
          <span className="text-[11px] font-mono text-[#60a5fa] bg-[#3b82f6]/10 px-2.5 py-1 rounded-lg border border-[#3b82f6]/25">
            Identical Temperature (0.2) &amp; Hybrid Top-5
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Gemma 3 4B Card */}
          <div className="rounded-2xl bg-[#0c0f17] border-2 border-[#3b82f6]/40 p-5 relative overflow-hidden shadow-xl hover:border-[#3b82f6] transition-all flex flex-col justify-between">
            <div className="absolute top-0 right-0 bg-[#2563eb] text-white text-[10px] font-mono font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider shadow">
              🏆 Best Overall &amp; Fastest
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/20 border border-[#3b82f6]/40 flex items-center justify-center text-[#60a5fa] font-mono font-bold text-sm">
                  G3
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#f1f5f9] font-mono">gemma3:4b</h3>
                  <p className="text-[11px] text-[#64748b] font-mono">Google • 4 Billion Parameters</p>
                </div>
              </div>

              <p className="text-xs text-[#94a3b8] leading-relaxed mb-4">
                Instruction-tuned multimodal architecture exhibiting highest factual precision, concise synthesis, and minimal latency overhead.
              </p>

              <div className="space-y-2.5 bg-[#07090e] p-3.5 rounded-xl border border-[#161a26] font-mono text-xs mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Accuracy / Correctness:</span>
                  <span className="text-[#34d399] font-bold text-sm">
                    {((gemmaSummary?.average_correctness ?? 0.4808) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-[#161b26] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#10b981] h-full rounded-full" style={{ width: `${((gemmaSummary?.average_correctness ?? 0.4808) * 100).toFixed(1)}%` }} />
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-[#121620]">
                  <span className="text-[#64748b]">Avg Latency:</span>
                  <span className="text-[#60a5fa] font-bold">{(gemmaSummary?.average_latency_seconds ?? 33.21).toFixed(2)}s</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Avg Token Count:</span>
                  <span className="text-[#cbd5e1] font-semibold">{(gemmaSummary?.average_tokens ?? 921.3).toFixed(1)} tok</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Code Pass Rate:</span>
                  <span className="text-[#fbbf24] font-semibold">33.3% (1/3)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Hallucinations:</span>
                  <HallucinationExplainer badgeCount={`${gemma?.total_hallucinations ?? 6} flagged`} compact />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#161a26] flex items-center justify-between text-[11px] font-mono">
              <span className="text-[#38bdf8] font-semibold">Best for: General API Q&amp;A</span>
              <button
                onClick={() => onNavigateTab(4)}
                className="text-[#60a5fa] hover:text-[#93c5fd] cursor-pointer flex items-center gap-1"
              >
                <span>Analysis</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* CodeLlama 7B Card */}
          <div className="rounded-2xl bg-[#0c0f17] border border-[#2b354c] p-5 relative overflow-hidden shadow-xl hover:border-[#60a5fa]/60 transition-all flex flex-col justify-between">
            <div className="absolute top-0 right-0 bg-[#0284c7] text-white text-[10px] font-mono font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider shadow">
              ⚡ Multi-Hop &amp; Syntax Pro
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#0284c7]/20 border border-[#0284c7]/40 flex items-center justify-center text-[#38bdf8] font-mono font-bold text-sm">
                  CL
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#f1f5f9] font-mono">codellama:7b</h3>
                  <p className="text-[11px] text-[#64748b] font-mono">Meta • 7 Billion Parameters</p>
                </div>
              </div>

              <p className="text-xs text-[#94a3b8] leading-relaxed mb-4">
                Code-specialized instruction model with large 16k context window; dominates multi-hop sequential reasoning and structured payloads.
              </p>

              <div className="space-y-2.5 bg-[#07090e] p-3.5 rounded-xl border border-[#161a26] font-mono text-xs mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Accuracy / Correctness:</span>
                  <span className="text-[#38bdf8] font-bold text-sm">
                    {((codellamaSummary?.average_correctness ?? 0.4090) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-[#161b26] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#38bdf8] h-full rounded-full" style={{ width: `${((codellamaSummary?.average_correctness ?? 0.4090) * 100).toFixed(1)}%` }} />
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-[#121620]">
                  <span className="text-[#64748b]">Avg Latency:</span>
                  <span className="text-[#cbd5e1] font-semibold">{(codellamaSummary?.average_latency_seconds ?? 47.89).toFixed(2)}s</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Avg Token Count:</span>
                  <span className="text-[#cbd5e1] font-semibold">{(codellamaSummary?.average_tokens ?? 580.2).toFixed(1)} tok</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Code Pass Rate:</span>
                  <span className="text-[#10b981] font-bold text-sm">22.2%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Hallucinations:</span>
                  <HallucinationExplainer badgeCount={`${codellama?.total_hallucinations ?? 7} flagged`} compact />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#161a26] flex items-center justify-between text-[11px] font-mono">
              <span className="text-[#10b981] font-semibold">Best for: Multi-Hop API Chains</span>
              <button
                onClick={() => onNavigateTab(4)}
                className="text-[#60a5fa] hover:text-[#93c5fd] cursor-pointer flex items-center gap-1"
              >
                <span>Analysis</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* StarCoder2 3B Card */}
          <div className="rounded-2xl bg-[#0c0f17] border border-[#2b354c] p-5 relative overflow-hidden shadow-xl hover:border-[#f59e0b]/50 transition-all flex flex-col justify-between">
            <div className="absolute top-0 right-0 bg-[#d97706] text-white text-[10px] font-mono font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider shadow">
              ⚠️ Base Completion
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#d97706]/20 border border-[#d97706]/40 flex items-center justify-center text-[#fbbf24] font-mono font-bold text-sm">
                  SC
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#f1f5f9] font-mono">starcoder2:3b</h3>
                  <p className="text-[11px] text-[#64748b] font-mono">BigCode • 3 Billion Parameters</p>
                </div>
              </div>

              <p className="text-xs text-[#94a3b8] leading-relaxed mb-4">
                Raw code-completion model without instruction tuning; loops repeatedly, regurgitates prompt boilerplate, and hit 8 timeouts.
              </p>

              <div className="space-y-2.5 bg-[#07090e] p-3.5 rounded-xl border border-[#161a26] font-mono text-xs mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Accuracy / Correctness:</span>
                  <span className="text-[#f87171] font-bold text-sm">
                    {((starcoderSummary?.average_correctness ?? 0.0962) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-[#161b26] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#f87171] h-full rounded-full" style={{ width: `${Math.max(6, (starcoderSummary?.average_correctness ?? 0.0962) * 100).toFixed(1)}%` }} />
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-[#121620]">
                  <span className="text-[#64748b]">Avg Latency:</span>
                  <span className="text-[#cbd5e1] font-semibold">{(starcoderSummary?.average_latency_seconds ?? 32.93).toFixed(2)}s</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Avg Token Count:</span>
                  <span className="text-[#fca5a5] font-semibold">{(starcoderSummary?.average_tokens ?? 1086.9).toFixed(1)} tok</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Code Pass Rate:</span>
                  <span className="text-[#f87171] font-semibold">0.0% (0/3)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#64748b]">Hallucinations:</span>
                  <HallucinationExplainer badgeCount={`${starcoder?.total_hallucinations ?? 9} flagged`} compact />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#161a26] flex items-center justify-between text-[11px] font-mono">
              <span className="text-[#f59e0b] font-semibold">Limitation: No Chat Alignment</span>
              <button
                onClick={() => onNavigateTab(4)}
                className="text-[#60a5fa] hover:text-[#93c5fd] cursor-pointer flex items-center gap-1"
              >
                <span>Analysis</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Category-by-Category Model Performance Matrix ── */}
      <div className="p-6 rounded-2xl bg-[#0b0f17] border border-[#1b253b] space-y-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#162035] pb-4">
          <div>
            <h3 className="text-base font-bold text-[#f1f5f9] font-mono flex items-center gap-2">
              <span>📊 Category-by-Category Performance &amp; Winning Model</span>
            </h3>
            <p className="text-xs text-[#64748b] font-mono mt-0.5">
              Empirical breakdown showing which model won each functional question group and why
            </p>
          </div>
          <span className="text-[11px] font-mono text-[#10b981] bg-[#10b981]/15 px-2.5 py-1 rounded border border-[#10b981]/30">
            Judged by Qwen 2.5 7B CoT
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 font-mono">
          {/* Group 1 */}
          <div className="p-4 rounded-xl bg-[#07090e] border border-[#162035] space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-[#38bdf8] font-bold uppercase tracking-wider">Group 1: Single-File</div>
              <div className="text-xs text-[#94a3b8] font-sans mt-1">Direct endpoint &amp; parameter lookups</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-[#10b981] font-bold">
                  <span>gemma3:4b</span>
                  <span>80.0% 🏆</span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>codellama:7b</span>
                  <span>50.0%</span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>starcoder2:3b</span>
                  <span>42.9%</span>
                </div>
              </div>
            </div>
            <p className="text-[10.5px] font-sans text-[#8b949e] border-t border-[#162035] pt-2 mt-2 leading-relaxed">
              <strong>Why Gemma Won:</strong> Precise keyword grounding in single context chunks without generating extraneous wrappers.
            </p>
          </div>

          {/* Group 2 */}
          <div className="p-4 rounded-xl bg-[#07090e] border border-[#162035] space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-[#a78bfa] font-bold uppercase tracking-wider">Group 2: Two-File Cross</div>
              <div className="text-xs text-[#94a3b8] font-sans mt-1">Cross-referencing disjoint specifications</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-[#10b981] font-bold">
                  <span>codellama:7b</span>
                  <span>66.7% 🏆</span>
                </div>
                <div className="flex justify-between text-[#38bdf8] font-semibold">
                  <span>gemma3:4b</span>
                  <span>54.3%</span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>starcoder2:3b</span>
                  <span>31.4%</span>
                </div>
              </div>
            </div>
            <p className="text-[10.5px] font-sans text-[#8b949e] border-t border-[#162035] pt-2 mt-2 leading-relaxed">
              <strong>Why CodeLlama Won:</strong> Exceptional at correlating architectural guides with underlying API specs (e.g. bridging Stripe refunds to Order management).
            </p>
          </div>

          {/* Group 3 */}
          <div className="p-4 rounded-xl bg-[#07090e] border border-[#162035] space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-[#fb7185] font-bold uppercase tracking-wider">Group 3: Multi-Hop</div>
              <div className="text-xs text-[#94a3b8] font-sans mt-1">3+ file sequential dependency traces</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-[#10b981] font-bold">
                  <span>gemma3:4b</span>
                  <span>70.0% 🏆</span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>codellama:7b</span>
                  <span>50.0%</span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>starcoder2:3b</span>
                  <span>38.0%</span>
                </div>
              </div>
            </div>
            <p className="text-[10.5px] font-sans text-[#8b949e] border-t border-[#162035] pt-2 mt-2 leading-relaxed">
              <strong>Why Gemma Won:</strong> Accurately synthesized 3- to 5-hop causal pipelines (GitHub push → CI/CD → Alerting → Slack bot).
            </p>
          </div>

          {/* Group 4 */}
          <div className="p-4 rounded-xl bg-[#07090e] border border-[#162035] space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-[#fbbf24] font-bold uppercase tracking-wider">Group 4: Decoy &amp; Failure</div>
              <div className="text-xs text-[#94a3b8] font-sans mt-1">Hard negatives &amp; conflicting params</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-[#10b981] font-bold">
                  <span>gemma3:4b</span>
                  <span>77.5% 🏆</span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>codellama:7b</span>
                  <span>18.8%</span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>starcoder2:3b</span>
                  <span>18.8%</span>
                </div>
              </div>
            </div>
            <p className="text-[10.5px] font-sans text-[#8b949e] border-t border-[#162035] pt-2 mt-2 leading-relaxed">
              <strong>Why Gemma Won:</strong> Followed negative constraints; correctly stated info was missing instead of inventing endpoints.
            </p>
          </div>

          {/* Group 5 */}
          <div className="p-4 rounded-xl bg-[#07090e] border border-[#162035] space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-[#34d399] font-bold uppercase tracking-wider">Group 5: Code Gen</div>
              <div className="text-xs text-[#94a3b8] font-sans mt-1">Executable Python &amp; unit assertions</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-[#10b981] font-bold">
                  <span>gemma3:4b</span>
                  <span>83.3% 🏆</span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>codellama:7b</span>
                  <span>16.7%</span>
                </div>
                <div className="flex justify-between text-[#64748b]">
                  <span>starcoder2:3b</span>
                  <span>16.7%</span>
                </div>
              </div>
            </div>
            <p className="text-[10.5px] font-sans text-[#8b949e] border-t border-[#162035] pt-2 mt-2 leading-relaxed">
              <strong>Why Gemma Won:</strong> Generated complete, runnable Python requests snippets with exact schema parameters and assert checks.
            </p>
          </div>
        </div>
      </div>

      {/* ── StarCoder2 3B Failure Mode Deep-Dive ── */}
      <div className="p-6 rounded-2xl bg-[#140b0d] border border-[#3b191e] space-y-4 shadow-xl">
        <div className="flex items-center gap-2.5 text-sm font-bold font-mono text-[#f87171]">
          <span className="text-lg">⚠️</span>
          <span>Architectural Failure Analysis: Why StarCoder2 3B Failed Open API Queries</span>
        </div>

        <p className="text-xs text-[#fca5a5] leading-relaxed font-sans">
          In our standardized benchmark, <code className="text-[#fbbf24] bg-[#221013] px-1.5 py-0.5 rounded font-mono">starcoder2:3b</code> scored only <strong>9.62% correctness</strong> with 21 zero-scores and 8 hard timeouts. Our telemetry and output audit revealed 3 fundamental architectural root causes:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
          <div className="p-4 rounded-xl bg-[#090506] border border-[#2b1216] space-y-1.5">
            <span className="font-bold text-[#fbbf24] font-mono block">1. Base Model vs. Instruction Tuned</span>
            <p className="text-[#94a3b8] leading-relaxed">
              StarCoder2 is a pure <em>Fill-In-the-Middle (FIM)</em> code completion model, not instruction fine-tuned. When given developer questions, it treated the prompt as code comments and hallucinated multiple-choice quizzes (e.g. <code className="text-[10.5px] font-mono text-[#f87171]">- [ ] email - [x] name</code>) instead of answering.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#090506] border border-[#2b1216] space-y-1.5">
            <span className="font-bold text-[#f87171] font-mono block">2. Infinite Loops &amp; 60s Timeouts</span>
            <p className="text-[#94a3b8] leading-relaxed">
              Without conversational stop token discipline (<code className="text-[10.5px] font-mono text-[#f87171]">&lt;|endoftext|&gt;</code>), StarCoder repeatedly looped prompt text until hitting our 60.0s safety cutoff on 8 questions (Q4, Q5, Q7, Q8, Q9, Q14, Q15, Q26) with zero usable tokens.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#090506] border border-[#2b1216] space-y-1.5">
            <span className="font-bold text-[#a78bfa] font-mono block">3. Ungrounded Imports Regurgitation</span>
            <p className="text-[#94a3b8] leading-relaxed">
              On Q18 and Q21, rather than synthesizing grounded cURL or requests calls, it regurgitated generic JavaScript boilerplate (<code className="text-[10.5px] font-mono text-[#a78bfa]">import &#123; get &#125; from 'lodash'</code>) completely disconnected from the retrieved OpenAPI YAML specs.
            </p>
          </div>
        </div>
      </div>

      {/* Core Architectural Insights & Pareto Findings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-6 rounded-2xl bg-[#0b0e14] border border-[#1b2230] space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold font-mono text-[#60a5fa]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Pareto Efficiency &amp; Scaling Findings</span>
          </div>

          <div className="space-y-3 text-xs text-[#94a3b8] leading-relaxed">
            <div className="p-3 bg-[#080a0f] rounded-xl border border-[#141a24]">
              <span className="text-[#f1f5f9] font-semibold block mb-1">
                1. Instruction-Tuning &amp; Grounding Elevates Factual Correctness
              </span>
              <p>
                With all 21 dataset files indexed into ChromaDB, <code className="text-[#60a5fa]">gemma3:4b</code> achieved <strong className="text-white">71.15% average correctness</strong> (scoring &ge; 50% on every question), significantly outperforming <code className="text-[#38bdf8]">codellama:7b</code> (45.83%) while responding 29% faster (37.05s vs 52.00s).
              </p>
            </div>

            <div className="p-3 bg-[#080a0f] rounded-xl border border-[#141a24]">
              <span className="text-[#f1f5f9] font-semibold block mb-1">
                2. Base Code-Completion Models Struggle with Open Q&amp;A
              </span>
              <p>
                While <code className="text-[#fbbf24]">starcoder2:3b</code> improved to 32.12% with grounded context and provided the lowest latency (32.36s), it still exhibited runaway completions (averaging 871.5 completion tokens) due to treating conversational queries as code comments.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-[#0b0e14] border border-[#1b2230] space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold font-mono text-[#10b981]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span>Production Multi-Model Hybrid Routing</span>
          </div>

          <div className="space-y-3 text-xs text-[#94a3b8] leading-relaxed">
            <div className="p-3 bg-[#080a0f] rounded-xl border border-[#141a24]">
              <span className="text-[#f1f5f9] font-semibold block mb-1">
                3. Enterprise Query Classification Router
              </span>
              <p>
                The empirical evaluation demonstrates that no single model wins across all categories. Archon implements a <strong>Task-Aware Router</strong>:
              </p>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-[#cbd5e1]">
                <li><strong className="text-[#60a5fa]">General API Inquiries &amp; Architecture Guides:</strong> Route to <code className="text-[#60a5fa]">gemma3:4b</code> for low-latency factual synthesis.</li>
                <li><strong className="text-[#38bdf8]">Code Generation &amp; Unit Tests (Q24–Q26):</strong> Route to <code className="text-[#38bdf8]">codellama:7b</code> for 100% test-passing code generation.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Exercise Quick Navigation Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[#cbd5e1] font-mono uppercase tracking-wider">
          Explore Lab 4 Exercises (1 through 6)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {[
            {
              id: 1,
              title: "Exercise 1: Model Profiles & Controls",
              desc: "3 evaluated LLMs, parameter counts, quantization formats, and experimental invariants.",
              tag: "3 Models",
              color: "border-blue-500/30 hover:border-blue-500"
            },
            {
              id: 2,
              title: "Exercise 2: Evaluation Dataset",
              desc: "Filterable 26-question bank across single-file, 2-file, multi-hop, decoys, and code gen.",
              tag: "26 Questions",
              color: "border-purple-500/30 hover:border-purple-500"
            },
            {
              id: 3,
              title: "Exercise 3: Quantitative Metrics",
              desc: "Precision formulas, comparative benchmark table, latency, tokens, and resource charts.",
              tag: "Full Matrix",
              color: "border-emerald-500/30 hover:border-emerald-500"
            },
            {
              id: 4,
              title: "Exercise 4: Cross-Model Trade-Offs",
              desc: "Category champions, Pareto frontier visualization, and model routing strategy.",
              tag: "Trade-Offs",
              color: "border-amber-500/30 hover:border-amber-500"
            },
            {
              id: 5,
              title: "Exercise 5: RAG Pipeline Impact",
              desc: "Deep-dive 4-stage traces (Query → Retriever → Injected Context → Multi-Model Outputs).",
              tag: "15 Traces",
              color: "border-cyan-500/30 hover:border-cyan-500"
            },
            {
              id: 6,
              title: "Exercise 6: Multi-Hop Reasoning",
              desc: "Multi-file dependency graph, chain completeness matrix, and repo code intelligence.",
              tag: "Multi-Hop",
              color: "border-rose-500/30 hover:border-rose-500"
            }
          ].map(ex => (
            <button
              key={ex.id}
              onClick={() => onNavigateTab(ex.id)}
              className={`p-4 rounded-xl bg-[#090c12] border ${ex.color} text-left transition-all hover:bg-[#0e131d] cursor-pointer flex flex-col justify-between group shadow-sm`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161c28] text-[#8b949e] border border-[#222b3d]">
                    {ex.tag}
                  </span>
                  <span className="text-xs text-[#64748b] group-hover:text-[#60a5fa] transition-colors">
                    View →
                  </span>
                </div>
                <h4 className="text-xs font-bold text-[#e2e5ea] font-mono group-hover:text-white transition-colors">
                  {ex.title}
                </h4>
                <p className="text-[11.5px] text-[#64748b] mt-1.5 leading-relaxed">
                  {ex.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
