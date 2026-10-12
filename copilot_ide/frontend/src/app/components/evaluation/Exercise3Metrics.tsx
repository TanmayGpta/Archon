"use client";
import React, { useState } from 'react';
import { EVALUATION_DATA } from './evaluationData';
import { HallucinationExplainer } from './HallucinationExplainer';

export function Exercise3Metrics() {
  const [activeChartTab, setActiveChartTab] = useState<'accuracy' | 'latency' | 'tokens' | 'resources'>('accuracy');

  const gemma = EVALUATION_DATA.exercise_3.per_model_aggregates["gemma3:4b"];
  const codellama = EVALUATION_DATA.exercise_3.per_model_aggregates["codellama:7b"];
  const starcoder = EVALUATION_DATA.exercise_3.per_model_aggregates["starcoder2:3b"];

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'N/A';
    return `${(val * 100).toFixed(1)}%`;
  };

  const formatNumber = (val: number | null | undefined, decimals = 1) => {
    if (val === null || val === undefined) return 'N/A';
    return val.toFixed(decimals);
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Exercise Briefing Header */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-[#1d2436] space-y-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#60a5fa] text-xs font-mono font-bold">
              EXERCISE 3
            </span>
            <h2 className="text-lg font-bold text-[#f1f5f9] font-mono">
              Quantitative Metrics, Calculations &amp; Benchmark Matrix
            </h2>
          </div>
          <span className="text-xs font-mono text-[#10b981] bg-[#10b981]/15 px-3 py-1 rounded-full border border-[#10b981]/30">
            6 Quality + 6 Performance Metrics
          </span>
        </div>

        <blockquote className="border-l-2 border-[#3b82f6] pl-3 py-1.5 bg-[#080a0f] rounded-r text-xs text-[#94a3b8] font-mono leading-relaxed">
          &ldquo;Evaluate all three models using <strong>ALL Quality and Performance metrics</strong>... <strong>Clearly define HOW each metric is calculated</strong> rather than simply reporting a value.&rdquo;
          <span className="text-[#64748b] block mt-1">— Lab 4 Exercise 3 Specification</span>
        </blockquote>
      </div>

      {/* Metric Calculation Definitions & Mathematical Formulas */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-[#cbd5e1] font-mono uppercase tracking-wider">
          Precise Metric Calculation Formulas
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Accuracy Formula */}
          <div className="p-4 rounded-xl bg-[#0a0d14] border border-[#1c2436] space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-[#60a5fa]">1. Accuracy / Correctness</span>
              <span className="text-[10px] text-[#64748b] bg-[#121622] px-2 py-0.5 rounded">Quality</span>
            </div>
            <div className="p-2.5 bg-[#07090e] rounded-lg border border-[#141a26] text-center font-mono text-xs text-[#38bdf8]">
              Score = |K<sub>found</sub> ∩ K<sub>expected</sub>| / |K<sub>expected</sub>|
            </div>
            <p className="text-[11px] text-[#8b949e] leading-relaxed">
              Fraction of canonical ground truth keywords, parameter names, and endpoints present in the synthesized LLM output.
            </p>
          </div>

          {/* Context Relevance Formula */}
          <div className="p-4 rounded-xl bg-[#0a0d14] border border-[#1c2436] space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-[#a78bfa]">2. Context Relevance</span>
              <span className="text-[10px] text-[#64748b] bg-[#121622] px-2 py-0.5 rounded">Quality</span>
            </div>
            <div className="p-2.5 bg-[#07090e] rounded-lg border border-[#141a26] text-center font-mono text-xs text-[#c084fc]">
              Jaccard = |V<sub>ctx</sub> ∩ V<sub>resp</sub>| / |V<sub>ctx</sub> ∪ V<sub>resp</sub>|
            </div>
            <p className="text-[11px] text-[#8b949e] leading-relaxed">
              Vocabulary Jaccard index measuring factual grounding between injected retrieval chunks and the LLM response.
            </p>
          </div>

          {/* Hallucination Detection */}
          <div className="p-4 rounded-xl bg-[#0a0d14] border border-[#1c2436] space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-[#f43f5e]">3. Hallucination Detection</span>
                <span className="text-[10px] text-[#64748b] bg-[#121622] px-2 py-0.5 rounded">Quality</span>
              </div>
              <div className="p-2.5 bg-[#07090e] rounded-lg border border-[#141a26] text-center font-mono text-[11px] text-[#fb7185] my-2">
                Flag = 1 if ∃ (e ∉ OpenAPI<sub>74</sub>), else 0
              </div>
              <p className="text-[11px] text-[#8b949e] leading-relaxed">
                Regex endpoint extraction (<code className="text-[#fb7185]">(GET|POST) /path</code>) validated against 74 canonical OpenAPI endpoints.
              </p>
            </div>
            <div className="pt-2 border-t border-[#141a26]">
              <HallucinationExplainer triggerText="View Detection & Judge Anti-Hallucination Safeguards" compact />
            </div>
          </div>

          {/* Code Test-Pass Rate */}
          <div className="p-4 rounded-xl bg-[#0a0d14] border border-[#1c2436] space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-[#10b981]">4. Code Test-Pass Rate</span>
              <span className="text-[10px] text-[#64748b] bg-[#121622] px-2 py-0.5 rounded">Execution</span>
            </div>
            <div className="p-2.5 bg-[#07090e] rounded-lg border border-[#141a26] text-center font-mono text-xs text-[#34d399]">
              PassRate = |Tests<sub>passed</sub>| / |Tests<sub>total</sub>|
            </div>
            <p className="text-[11px] text-[#8b949e] leading-relaxed">
              Python AST compilation (<code className="text-[#34d399]">compile(code, &apos;&lt;string&gt;&apos;, &apos;exec&apos;)</code>) and execution assertion verification (Q24–Q26).
            </p>
          </div>

          {/* Latency Measurement */}
          <div className="p-4 rounded-xl bg-[#0a0d14] border border-[#1c2436] space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-[#38bdf8]">5. Wall-Clock Latency</span>
              <span className="text-[10px] text-[#64748b] bg-[#121622] px-2 py-0.5 rounded">Performance</span>
            </div>
            <div className="p-2.5 bg-[#07090e] rounded-lg border border-[#141a26] text-center font-mono text-xs text-[#38bdf8]">
              Latency = t<sub>end</sub> - t<sub>start</sub> (seconds)
            </div>
            <p className="text-[11px] text-[#8b949e] leading-relaxed">
              High-resolution timing (<code className="text-[#38bdf8]">time.perf_counter()</code>) spanning prompt dispatch to stream completion.
            </p>
          </div>

          {/* System Resources */}
          <div className="p-4 rounded-xl bg-[#0a0d14] border border-[#1c2436] space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-[#fbbf24]">6. CPU % &amp; RAM (RSS)</span>
              <span className="text-[10px] text-[#64748b] bg-[#121622] px-2 py-0.5 rounded">Resource</span>
            </div>
            <div className="p-2.5 bg-[#07090e] rounded-lg border border-[#141a26] text-center font-mono text-xs text-[#fbbf24]">
              RSS = psutil.Process().memory_info().rss
            </div>
            <p className="text-[11px] text-[#8b949e] leading-relaxed">
              Process memory resident set size in megabytes and percentage CPU load polled during inference generation.
            </p>
          </div>
        </div>
      </div>

      {/* Comparative Benchmark Matrix Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#cbd5e1] font-mono uppercase tracking-wider">
            Comparative Benchmark Matrix (All 3 Models)
          </h3>
          <span className="text-[11px] font-mono text-[#64748b]">
            Min / Average / Max across 26 questions
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#1a2233] bg-[#090c12] custom-scrollbar shadow-xl">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-[#0e121a] border-b border-[#1a2233] text-[#64748b] uppercase tracking-wider text-[10.5px]">
                <th className="py-3.5 px-4 font-bold text-[#e2e5ea] w-64">Metric Dimension</th>
                <th className="py-3.5 px-4 text-[#60a5fa] border-l border-[#1a2233]">
                  <div className="font-bold">gemma3:4b</div>
                  <div className="text-[9.5px] font-normal text-[#64748b]">4B Params • Instruct</div>
                </th>
                <th className="py-3.5 px-4 text-[#38bdf8] border-l border-[#1a2233]">
                  <div className="font-bold">codellama:7b</div>
                  <div className="text-[9.5px] font-normal text-[#64748b]">7B Params • Code Instruct</div>
                </th>
                <th className="py-3.5 px-4 text-[#fbbf24] border-l border-[#1a2233]">
                  <div className="font-bold">starcoder2:3b</div>
                  <div className="text-[9.5px] font-normal text-[#64748b]">3B Params • Completion</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141a26]">
              {/* Quality Metrics */}
              <tr className="bg-[#0c1018] text-[#94a3b8] font-bold text-[11px]">
                <td colSpan={4} className="py-2 px-4 uppercase tracking-wider text-[#60a5fa]">
                  Quality &amp; Fidelity Metrics
                </td>
              </tr>

              <tr className="hover:bg-[#101520] transition-colors">
                <td className="py-3 px-4 font-medium text-[#e2e5ea]">
                  Accuracy / Correctness Score
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#34d399] font-bold text-sm">{formatPercent(gemma?.correctness.avg)}</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">(min: {formatPercent(gemma?.correctness.min)}, max: {formatPercent(gemma?.correctness.max)})</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#38bdf8] font-bold text-sm">{formatPercent(codellama?.correctness.avg)}</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">(min: {formatPercent(codellama?.correctness.min)}, max: {formatPercent(codellama?.correctness.max)})</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#f87171] font-bold text-sm">{formatPercent(starcoder?.correctness.avg)}</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">(min: {formatPercent(starcoder?.correctness.min)}, max: {formatPercent(starcoder?.correctness.max)})</span>
                </td>
              </tr>

              <tr className="hover:bg-[#101520] transition-colors">
                <td className="py-3 px-4 font-medium text-[#e2e5ea]">
                  Context Relevance (Jaccard)
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#cbd5e1] font-bold">{formatPercent(gemma?.relevance.avg)}</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">(max: {formatPercent(gemma?.relevance.max)})</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#38bdf8] font-bold">{formatPercent(codellama?.relevance.avg)}</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">(max: {formatPercent(codellama?.relevance.max)})</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#cbd5e1] font-bold">{formatPercent(starcoder?.relevance.avg)}</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">(max: {formatPercent(starcoder?.relevance.max)})</span>
                </td>
              </tr>

              <tr className="hover:bg-[#101520] transition-colors">
                <td className="py-3 px-4 font-medium text-[#e2e5ea]">
                  Code Test-Pass Rate (Q24–Q26)
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#fbbf24] font-bold">{formatPercent(gemma?.code_pass_rate)} (2/3)</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#10b981] font-bold text-sm bg-[#10b981]/15 px-2 py-0.5 rounded border border-[#10b981]/30">
                    {formatPercent(codellama?.code_pass_rate)} (3/3 🏆)
                  </span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#f87171] font-bold">{formatPercent(starcoder?.code_pass_rate)} (1/3)</span>
                </td>
              </tr>

              <tr className="hover:bg-[#101520] transition-colors">
                <td className="py-3 px-4 font-medium text-[#e2e5ea]">
                  <HallucinationExplainer triggerText="Total Hallucinations Flagged" />
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <HallucinationExplainer badgeCount={`${gemma?.total_hallucinations ?? 6} flagged`} compact />
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <HallucinationExplainer badgeCount={`${codellama?.total_hallucinations ?? 7} flagged`} compact />
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <HallucinationExplainer badgeCount={`${starcoder?.total_hallucinations ?? 9} flagged`} compact />
                </td>
              </tr>

              {/* Performance Metrics */}
              <tr className="bg-[#0c1018] text-[#94a3b8] font-bold text-[11px]">
                <td colSpan={4} className="py-2 px-4 uppercase tracking-wider text-[#38bdf8]">
                  Performance &amp; Latency Metrics
                </td>
              </tr>

              <tr className="hover:bg-[#101520] transition-colors">
                <td className="py-3 px-4 font-medium text-[#e2e5ea]">
                  Response Latency (Seconds)
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#10b981] font-bold text-sm bg-[#10b981]/15 px-2 py-0.5 rounded border border-[#10b981]/30">
                    {formatNumber(gemma?.latency_seconds.avg, 2)}s 🏆
                  </span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">[{formatNumber(gemma?.latency_seconds.min, 1)}s – {formatNumber(gemma?.latency_seconds.max, 1)}s]</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#38bdf8] font-bold">{formatNumber(codellama?.latency_seconds.avg, 2)}s</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">[{formatNumber(codellama?.latency_seconds.min, 1)}s – {formatNumber(codellama?.latency_seconds.max, 1)}s]</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#f87171] font-bold">{formatNumber(starcoder?.latency_seconds.avg, 2)}s</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">[{formatNumber(starcoder?.latency_seconds.min, 1)}s – {formatNumber(starcoder?.latency_seconds.max, 1)}s]</span>
                </td>
              </tr>

              <tr className="hover:bg-[#101520] transition-colors">
                <td className="py-3 px-4 font-medium text-[#e2e5ea]">
                  Average Token Throughput
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#cbd5e1] font-bold">{formatNumber(gemma?.total_tokens.avg, 0)} total</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">({formatNumber(gemma?.prompt_tokens.avg, 0)} prompt / {formatNumber(gemma?.completion_tokens.avg, 0)} comp)</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#cbd5e1] font-bold">{formatNumber(codellama?.total_tokens.avg, 0)} total</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">({formatNumber(codellama?.prompt_tokens.avg, 0)} prompt / {formatNumber(codellama?.completion_tokens.avg, 0)} comp)</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#fca5a5] font-bold">{formatNumber(starcoder?.total_tokens.avg, 0)} total</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">({formatNumber(starcoder?.prompt_tokens.avg, 0)} prompt / {formatNumber(starcoder?.completion_tokens.avg, 0)} comp)</span>
                </td>
              </tr>

              {/* Resource Metrics */}
              <tr className="bg-[#0c1018] text-[#94a3b8] font-bold text-[11px]">
                <td colSpan={4} className="py-2 px-4 uppercase tracking-wider text-[#fbbf24]">
                  Process &amp; Memory Consumption
                </td>
              </tr>

              <tr className="hover:bg-[#101520] transition-colors">
                <td className="py-3 px-4 font-medium text-[#e2e5ea]">
                  Average CPU Utilization
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#cbd5e1] font-bold">{formatNumber(gemma?.avg_cpu_percent.avg, 2)}%</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">(peak: {formatNumber(gemma?.peak_cpu_percent.avg, 1)}%)</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#cbd5e1] font-bold">{formatNumber(codellama?.avg_cpu_percent.avg, 2)}%</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">(peak: {formatNumber(codellama?.peak_cpu_percent.avg, 1)}%)</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#cbd5e1] font-bold">{formatNumber(starcoder?.avg_cpu_percent.avg, 2)}%</span>
                  <span className="text-[#64748b] text-[10.5px] ml-1.5">(peak: {formatNumber(starcoder?.peak_cpu_percent.avg, 1)}%)</span>
                </td>
              </tr>

              <tr className="hover:bg-[#101520] transition-colors">
                <td className="py-3 px-4 font-medium text-[#e2e5ea]">
                  Resident RAM Footprint (RSS)
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#cbd5e1] font-bold">{formatNumber(gemma?.avg_ram_mb.avg, 1)} MB</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#cbd5e1] font-bold">{formatNumber(codellama?.avg_ram_mb.avg, 1)} MB</span>
                </td>
                <td className="py-3 px-4 border-l border-[#1a2233]">
                  <span className="text-[#cbd5e1] font-bold">{formatNumber(starcoder?.avg_ram_mb.avg, 1)} MB</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Visual Comparison Charts */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#cbd5e1] font-mono uppercase tracking-wider">
            Visual Comparison Charts
          </h3>

          <div className="flex items-center gap-1.5 bg-[#0a0d14] p-1 rounded-xl border border-[#1a2233]">
            {[
              { id: 'accuracy', label: 'Accuracy & Relevance' },
              { id: 'latency', label: 'Latency Ranges' },
              { id: 'tokens', label: 'Token Distribution' },
              { id: 'resources', label: 'Resource Load' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveChartTab(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                  activeChartTab === tab.id
                    ? 'bg-[#1e2738] text-[#60a5fa] border border-[#3b82f6]/40 font-semibold'
                    : 'text-[#8b949e] hover:text-[#e2e5ea]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart Viewport */}
        <div className="p-6 rounded-2xl bg-[#0a0d14] border border-[#1c2436] space-y-6 shadow-xl">
          {/* Chart 1: Accuracy & Relevance */}
          {activeChartTab === 'accuracy' && (
            <div className="space-y-5">
              <div className="flex justify-between items-center text-xs font-mono text-[#64748b]">
                <span>Factual Correctness vs Jaccard Context Relevance</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#10b981]" /> Correctness</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#3b82f6]" /> Relevance</span>
                </div>
              </div>

              {[
                { name: 'gemma3:4b', correctness: 82.56, relevance: 22.85, codePass: 66.7, color: '#3b82f6' },
                { name: 'codellama:7b', correctness: 81.79, relevance: 26.65, codePass: 100.0, color: '#0284c7' },
                { name: 'starcoder2:3b', correctness: 50.58, relevance: 22.87, codePass: 33.3, color: '#d97706' },
              ].map(m => (
                <div key={m.name} className="space-y-2 p-3 bg-[#07090e] rounded-xl border border-[#141a26]">
                  <div className="flex justify-between items-center text-xs font-mono font-bold text-[#e2e5ea]">
                    <span>{m.name}</span>
                    <span className="text-[#34d399]">{m.correctness}% Accuracy</span>
                  </div>

                  {/* Correctness Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10.5px] font-mono text-[#64748b]">
                      <span>Correctness / Factual Precision</span>
                      <span className="text-[#34d399] font-bold">{m.correctness}%</span>
                    </div>
                    <div className="w-full bg-[#141a26] h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#10b981] h-full rounded-full transition-all duration-700"
                        style={{ width: `${m.correctness}%` }}
                      />
                    </div>
                  </div>

                  {/* Relevance Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10.5px] font-mono text-[#64748b]">
                      <span>Context Vocabulary Overlap (Relevance)</span>
                      <span className="text-[#60a5fa] font-bold">{m.relevance}%</span>
                    </div>
                    <div className="w-full bg-[#141a26] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#3b82f6] h-full rounded-full transition-all duration-700"
                        style={{ width: `${m.relevance * 2}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Chart 2: Latency Ranges */}
          {activeChartTab === 'latency' && (
            <div className="space-y-5">
              <div className="flex justify-between items-center text-xs font-mono text-[#64748b]">
                <span>Wall-Clock Response Latency in Seconds (Min / Avg / Max)</span>
                <span className="text-[#10b981]">Lower is Better</span>
              </div>

              {[
                { name: 'gemma3:4b', min: 8.6, avg: 15.75, max: 26.8, barWidth: 26.8 / 3 },
                { name: 'codellama:7b', min: 7.0, avg: 25.09, max: 74.1, barWidth: 74.1 / 3 },
                { name: 'starcoder2:3b', min: 4.3, avg: 63.25, max: 300.1, barWidth: 100 },
              ].map(m => (
                <div key={m.name} className="space-y-1.5 p-3.5 bg-[#07090e] rounded-xl border border-[#141a26]">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="font-bold text-[#e2e5ea]">{m.name}</span>
                    <span className="text-[#60a5fa] font-bold">{m.avg}s average (max: {m.max}s)</span>
                  </div>

                  <div className="w-full bg-[#141a26] h-3 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        m.avg < 20 ? 'bg-[#10b981]' : m.avg < 30 ? 'bg-[#3b82f6]' : 'bg-[#ef4444]'
                      }`}
                      style={{ width: `${Math.min(100, (m.avg / 65) * 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] font-mono text-[#64748b]">
                    <span>Min: {m.min}s</span>
                    <span>Max: {m.max}s</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Chart 3: Token Distribution */}
          {activeChartTab === 'tokens' && (
            <div className="space-y-5">
              <div className="flex justify-between items-center text-xs font-mono text-[#64748b]">
                <span>Token Distribution (Prompt Tokens vs Generated Completion Tokens)</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#3b82f6]" /> Prompt</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#a78bfa]" /> Completion</span>
                </div>
              </div>

              {[
                { name: 'gemma3:4b', prompt: 610.7, completion: 431.7, total: 1042.4 },
                { name: 'codellama:7b', prompt: 700.4, completion: 315.8, total: 1016.2 },
                { name: 'starcoder2:3b', prompt: 579.8, completion: 1173.9, total: 1753.8 },
              ].map(m => {
                const promptPct = (m.prompt / m.total) * 100;
                const compPct = (m.completion / m.total) * 100;
                return (
                  <div key={m.name} className="space-y-2 p-3.5 bg-[#07090e] rounded-xl border border-[#141a26]">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="font-bold text-[#e2e5ea]">{m.name}</span>
                      <span className="text-[#cbd5e1]">{m.total.toFixed(0)} Avg Total Tokens</span>
                    </div>

                    <div className="w-full bg-[#141a26] h-3 rounded-full overflow-hidden flex">
                      <div
                        className="bg-[#3b82f6] h-full"
                        style={{ width: `${promptPct}%` }}
                        title={`Prompt: ${m.prompt.toFixed(0)} tok`}
                      />
                      <div
                        className="bg-[#a78bfa] h-full"
                        style={{ width: `${compPct}%` }}
                        title={`Completion: ${m.completion.toFixed(0)} tok`}
                      />
                    </div>

                    <div className="flex justify-between text-[10px] font-mono text-[#64748b]">
                      <span>Prompt: {m.prompt.toFixed(0)} ({promptPct.toFixed(0)}%)</span>
                      <span>Completion: {m.completion.toFixed(0)} ({compPct.toFixed(0)}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Chart 4: Resource Load */}
          {activeChartTab === 'resources' && (
            <div className="space-y-5">
              <div className="flex justify-between items-center text-xs font-mono text-[#64748b]">
                <span>Process Resource Consumption (Average CPU % &amp; Resident Memory RSS)</span>
                <span className="text-[#38bdf8]">WSL2 Container Environment</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: 'gemma3:4b', cpu: 1.85, peakCpu: 33.2, ram: 69.5, color: '#3b82f6' },
                  { name: 'codellama:7b', cpu: 2.30, peakCpu: 36.7, ram: 69.6, color: '#0284c7' },
                  { name: 'starcoder2:3b', cpu: 2.39, peakCpu: 38.6, ram: 69.8, color: '#d97706' },
                ].map(m => (
                  <div key={m.name} className="p-4 bg-[#07090e] rounded-xl border border-[#141a26] space-y-3 text-xs font-mono">
                    <div className="font-bold text-[#e2e5ea] pb-2 border-b border-[#141a26]">{m.name}</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[#64748b]">
                        <span>Avg CPU:</span>
                        <span className="text-[#38bdf8] font-bold">{m.cpu}%</span>
                      </div>
                      <div className="flex justify-between text-[#64748b]">
                        <span>Peak CPU:</span>
                        <span className="text-[#fbbf24] font-bold">{m.peakCpu}%</span>
                      </div>
                      <div className="flex justify-between text-[#64748b]">
                        <span>Process RAM:</span>
                        <span className="text-[#10b981] font-bold">{m.ram} MB</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
