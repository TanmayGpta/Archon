"use client";
import React, { useState } from 'react';
import { Glyph } from '../Icons';
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
      <div className="p-6 rounded-panel bg-raised border border-line-strong space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-panel bg-accent/20 border border-accent/40 text-accent-fg text-xs font-mono font-bold">
              EXERCISE 3
            </span>
            <h2 className="text-lg font-bold text-fg-strong font-mono">
              Quantitative Metrics, Calculations &amp; Benchmark Matrix
            </h2>
          </div>
          <span className="text-xs font-mono text-success bg-success/15 px-3 py-1 rounded-full border border-success/30">
            6 Quality + 6 Performance Metrics
          </span>
        </div>

        <blockquote className="border-l-2 border-accent pl-3 py-1.5 bg-canvas rounded-r text-xs text-fg-muted font-mono leading-relaxed">
          &ldquo;Evaluate all three models using <strong>ALL Quality and Performance metrics</strong>... <strong>Clearly define HOW each metric is calculated</strong> rather than simply reporting a value.&rdquo;
          <span className="text-fg-subtle block mt-1">— Lab 4 Exercise 3 Specification</span>
        </blockquote>
      </div>

      {/* Metric Calculation Definitions & Mathematical Formulas */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">
          Precise Metric Calculation Formulas
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Accuracy Formula */}
          <div className="p-4 rounded-panel bg-surface border border-line space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-accent-fg">1. Accuracy / Correctness</span>
              <span className="text-xs text-fg-subtle bg-raised px-2 py-0.5 rounded-control">Quality</span>
            </div>
            <div className="p-2.5 bg-canvas rounded-panel border border-line-subtle text-center font-mono text-xs text-info">
              Score = |K<sub>found</sub> ∩ K<sub>expected</sub>| / |K<sub>expected</sub>|
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              Fraction of canonical ground truth keywords, parameter names, and endpoints present in the synthesized LLM output.
            </p>
          </div>

          {/* Context Relevance Formula */}
          <div className="p-4 rounded-panel bg-surface border border-line space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-ai">2. Context Relevance</span>
              <span className="text-xs text-fg-subtle bg-raised px-2 py-0.5 rounded-control">Quality</span>
            </div>
            <div className="p-2.5 bg-canvas rounded-panel border border-line-subtle text-center font-mono text-xs text-[#c084fc]">
              Jaccard = |V<sub>ctx</sub> ∩ V<sub>resp</sub>| / |V<sub>ctx</sub> ∪ V<sub>resp</sub>|
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              Vocabulary Jaccard index measuring factual grounding between injected retrieval chunks and the LLM response.
            </p>
          </div>

          {/* Hallucination Detection */}
          <div className="p-4 rounded-panel bg-surface border border-line space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-[#f43f5e]">3. Hallucination Detection</span>
                <span className="text-xs text-fg-subtle bg-raised px-2 py-0.5 rounded-control">Quality</span>
              </div>
              <div className="p-2.5 bg-canvas rounded-panel border border-line-subtle text-center font-mono text-xs text-[#fb7185] my-2">
                Flag = 1 if ∃ (e ∉ OpenAPI<sub>74</sub>), else 0
              </div>
              <p className="text-xs text-fg-muted leading-relaxed">
                Regex endpoint extraction (<code className="text-[#fb7185]">(GET|POST) /path</code>) validated against 74 canonical OpenAPI endpoints.
              </p>
            </div>
            <div className="pt-2 border-t border-line-subtle">
              <HallucinationExplainer triggerText="View Detection & Judge Anti-Hallucination Safeguards" compact />
            </div>
          </div>

          {/* Code Test-Pass Rate */}
          <div className="p-4 rounded-panel bg-surface border border-line space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-success">4. Code Test-Pass Rate</span>
              <span className="text-xs text-fg-subtle bg-raised px-2 py-0.5 rounded-control">Execution</span>
            </div>
            <div className="p-2.5 bg-canvas rounded-panel border border-line-subtle text-center font-mono text-xs text-success-fg">
              PassRate = |Tests<sub>passed</sub>| / |Tests<sub>total</sub>|
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              Python AST compilation (<code className="text-success-fg">compile(code, &apos;&lt;string&gt;&apos;, &apos;exec&apos;)</code>) and execution assertion verification (Q24–Q26).
            </p>
          </div>

          {/* Latency Measurement */}
          <div className="p-4 rounded-panel bg-surface border border-line space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-info">5. Wall-Clock Latency</span>
              <span className="text-xs text-fg-subtle bg-raised px-2 py-0.5 rounded-control">Performance</span>
            </div>
            <div className="p-2.5 bg-canvas rounded-panel border border-line-subtle text-center font-mono text-xs text-info">
              Latency = t<sub>end</sub> - t<sub>start</sub> (seconds)
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              High-resolution timing (<code className="text-info">time.perf_counter()</code>) spanning prompt dispatch to stream completion.
            </p>
          </div>

          {/* System Resources */}
          <div className="p-4 rounded-panel bg-surface border border-line space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-warning-fg">6. CPU % &amp; RAM (RSS)</span>
              <span className="text-xs text-fg-subtle bg-raised px-2 py-0.5 rounded-control">Resource</span>
            </div>
            <div className="p-2.5 bg-canvas rounded-panel border border-line-subtle text-center font-mono text-xs text-warning-fg">
              RSS = psutil.Process().memory_info().rss
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              Process memory resident set size in megabytes and percentage CPU load polled during inference generation.
            </p>
          </div>
        </div>
      </div>

      {/* Comparative Benchmark Matrix Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">
            Comparative Benchmark Matrix (All 3 Models)
          </h3>
          <span className="text-xs font-mono text-fg-subtle">
            Min / Average / Max across 26 questions
          </span>
        </div>

        <div className="overflow-x-auto rounded-panel border border-line bg-surface custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-raised border-b border-line text-fg-subtle uppercase tracking-wider text-xs">
                <th className="py-3.5 px-4 font-bold text-fg w-64">Metric Dimension</th>
                <th className="py-3.5 px-4 text-accent-fg border-l border-line">
                  <div className="font-bold">gemma3:4b</div>
                  <div className="text-xs font-normal text-fg-subtle">4B Params • Instruct</div>
                </th>
                <th className="py-3.5 px-4 text-info border-l border-line">
                  <div className="font-bold">codellama:7b</div>
                  <div className="text-xs font-normal text-fg-subtle">7B Params • Code Instruct</div>
                </th>
                <th className="py-3.5 px-4 text-warning-fg border-l border-line">
                  <div className="font-bold">starcoder2:3b</div>
                  <div className="text-xs font-normal text-fg-subtle">3B Params • Completion</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {/* Quality Metrics */}
              <tr className="bg-surface text-fg-muted font-bold text-xs">
                <td colSpan={4} className="py-2 px-4 uppercase tracking-wider text-accent-fg">
                  Quality &amp; Fidelity Metrics
                </td>
              </tr>

              <tr className="hover:bg-raised transition-colors">
                <td className="py-3 px-4 font-medium text-fg">
                  Accuracy / Correctness Score
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-success-fg font-bold text-sm">{formatPercent(gemma?.correctness.avg)}</span>
                  <span className="text-fg-subtle text-xs ml-1.5">(min: {formatPercent(gemma?.correctness.min)}, max: {formatPercent(gemma?.correctness.max)})</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-info font-bold text-sm">{formatPercent(codellama?.correctness.avg)}</span>
                  <span className="text-fg-subtle text-xs ml-1.5">(min: {formatPercent(codellama?.correctness.min)}, max: {formatPercent(codellama?.correctness.max)})</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-danger-fg font-bold text-sm">{formatPercent(starcoder?.correctness.avg)}</span>
                  <span className="text-fg-subtle text-xs ml-1.5">(min: {formatPercent(starcoder?.correctness.min)}, max: {formatPercent(starcoder?.correctness.max)})</span>
                </td>
              </tr>

              <tr className="hover:bg-raised transition-colors">
                <td className="py-3 px-4 font-medium text-fg">
                  Context Relevance (Jaccard)
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-fg-soft font-bold">{formatPercent(gemma?.relevance.avg)}</span>
                  <span className="text-fg-subtle text-xs ml-1.5">(max: {formatPercent(gemma?.relevance.max)})</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-info font-bold">{formatPercent(codellama?.relevance.avg)}</span>
                  <span className="text-fg-subtle text-xs ml-1.5">(max: {formatPercent(codellama?.relevance.max)})</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-fg-soft font-bold">{formatPercent(starcoder?.relevance.avg)}</span>
                  <span className="text-fg-subtle text-xs ml-1.5">(max: {formatPercent(starcoder?.relevance.max)})</span>
                </td>
              </tr>

              <tr className="hover:bg-raised transition-colors">
                <td className="py-3 px-4 font-medium text-fg">
                  Code Test-Pass Rate (Q24–Q26)
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-warning-fg font-bold">{formatPercent(gemma?.code_pass_rate)} (2/3)</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-success font-bold text-sm bg-success/15 px-2 py-0.5 rounded-control border border-success/30">
                    {formatPercent(codellama?.code_pass_rate)} (3/3 <Glyph name="trophy" />)
                  </span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-danger-fg font-bold">{formatPercent(starcoder?.code_pass_rate)} (1/3)</span>
                </td>
              </tr>

              <tr className="hover:bg-raised transition-colors">
                <td className="py-3 px-4 font-medium text-fg">
                  <HallucinationExplainer triggerText="Total Hallucinations Flagged" />
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <HallucinationExplainer badgeCount={`${gemma?.total_hallucinations ?? 6} flagged`} compact />
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <HallucinationExplainer badgeCount={`${codellama?.total_hallucinations ?? 7} flagged`} compact />
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <HallucinationExplainer badgeCount={`${starcoder?.total_hallucinations ?? 9} flagged`} compact />
                </td>
              </tr>

              {/* Performance Metrics */}
              <tr className="bg-surface text-fg-muted font-bold text-xs">
                <td colSpan={4} className="py-2 px-4 uppercase tracking-wider text-info">
                  Performance &amp; Latency Metrics
                </td>
              </tr>

              <tr className="hover:bg-raised transition-colors">
                <td className="py-3 px-4 font-medium text-fg">
                  Response Latency (Seconds)
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-success font-bold text-sm bg-success/15 px-2 py-0.5 rounded-control border border-success/30">
                    {formatNumber(gemma?.latency_seconds.avg, 2)}s <Glyph name="trophy" />
                  </span>
                  <span className="text-fg-subtle text-xs ml-1.5">[{formatNumber(gemma?.latency_seconds.min, 1)}s – {formatNumber(gemma?.latency_seconds.max, 1)}s]</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-info font-bold">{formatNumber(codellama?.latency_seconds.avg, 2)}s</span>
                  <span className="text-fg-subtle text-xs ml-1.5">[{formatNumber(codellama?.latency_seconds.min, 1)}s – {formatNumber(codellama?.latency_seconds.max, 1)}s]</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-danger-fg font-bold">{formatNumber(starcoder?.latency_seconds.avg, 2)}s</span>
                  <span className="text-fg-subtle text-xs ml-1.5">[{formatNumber(starcoder?.latency_seconds.min, 1)}s – {formatNumber(starcoder?.latency_seconds.max, 1)}s]</span>
                </td>
              </tr>

              <tr className="hover:bg-raised transition-colors">
                <td className="py-3 px-4 font-medium text-fg">
                  Average Token Throughput
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-fg-soft font-bold">{formatNumber(gemma?.total_tokens.avg, 0)} total</span>
                  <span className="text-fg-subtle text-xs ml-1.5">({formatNumber(gemma?.prompt_tokens.avg, 0)} prompt / {formatNumber(gemma?.completion_tokens.avg, 0)} comp)</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-fg-soft font-bold">{formatNumber(codellama?.total_tokens.avg, 0)} total</span>
                  <span className="text-fg-subtle text-xs ml-1.5">({formatNumber(codellama?.prompt_tokens.avg, 0)} prompt / {formatNumber(codellama?.completion_tokens.avg, 0)} comp)</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-[#fca5a5] font-bold">{formatNumber(starcoder?.total_tokens.avg, 0)} total</span>
                  <span className="text-fg-subtle text-xs ml-1.5">({formatNumber(starcoder?.prompt_tokens.avg, 0)} prompt / {formatNumber(starcoder?.completion_tokens.avg, 0)} comp)</span>
                </td>
              </tr>

              {/* Resource Metrics */}
              <tr className="bg-surface text-fg-muted font-bold text-xs">
                <td colSpan={4} className="py-2 px-4 uppercase tracking-wider text-warning-fg">
                  Process &amp; Memory Consumption
                </td>
              </tr>

              <tr className="hover:bg-raised transition-colors">
                <td className="py-3 px-4 font-medium text-fg">
                  Average CPU Utilization
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-fg-soft font-bold">{formatNumber(gemma?.avg_cpu_percent.avg, 2)}%</span>
                  <span className="text-fg-subtle text-xs ml-1.5">(peak: {formatNumber(gemma?.peak_cpu_percent.avg, 1)}%)</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-fg-soft font-bold">{formatNumber(codellama?.avg_cpu_percent.avg, 2)}%</span>
                  <span className="text-fg-subtle text-xs ml-1.5">(peak: {formatNumber(codellama?.peak_cpu_percent.avg, 1)}%)</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-fg-soft font-bold">{formatNumber(starcoder?.avg_cpu_percent.avg, 2)}%</span>
                  <span className="text-fg-subtle text-xs ml-1.5">(peak: {formatNumber(starcoder?.peak_cpu_percent.avg, 1)}%)</span>
                </td>
              </tr>

              <tr className="hover:bg-raised transition-colors">
                <td className="py-3 px-4 font-medium text-fg">
                  Resident RAM Footprint (RSS)
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-fg-soft font-bold">{formatNumber(gemma?.avg_ram_mb.avg, 1)} MB</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-fg-soft font-bold">{formatNumber(codellama?.avg_ram_mb.avg, 1)} MB</span>
                </td>
                <td className="py-3 px-4 border-l border-line">
                  <span className="text-fg-soft font-bold">{formatNumber(starcoder?.avg_ram_mb.avg, 1)} MB</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Visual Comparison Charts */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">
            Visual Comparison Charts
          </h3>

          <div className="flex items-center gap-1.5 bg-surface p-1 rounded-panel border border-line">
            {[
              { id: 'accuracy', label: 'Accuracy & Relevance' },
              { id: 'latency', label: 'Latency Ranges' },
              { id: 'tokens', label: 'Token Distribution' },
              { id: 'resources', label: 'Resource Load' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveChartTab(tab.id as typeof activeChartTab)}
                className={`px-3 py-1 rounded-control text-xs font-mono transition-all cursor-pointer ${
                  activeChartTab === tab.id
                    ? 'bg-selected text-accent-fg border border-accent/40 font-semibold'
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart Viewport */}
        <div className="p-6 rounded-panel bg-surface border border-line space-y-6">
          {/* Chart 1: Accuracy & Relevance */}
          {activeChartTab === 'accuracy' && (
            <div className="space-y-5">
              <div className="flex justify-between items-center text-xs font-mono text-fg-subtle">
                <span>Factual Correctness vs Jaccard Context Relevance</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-control bg-success" /> Correctness</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-control bg-accent" /> Relevance</span>
                </div>
              </div>

              {[
                { name: 'gemma3:4b', correctness: 82.56, relevance: 22.85, codePass: 66.7, color: '#3b82f6' },
                { name: 'codellama:7b', correctness: 81.79, relevance: 26.65, codePass: 100.0, color: '#0284c7' },
                { name: 'starcoder2:3b', correctness: 50.58, relevance: 22.87, codePass: 33.3, color: '#d97706' },
              ].map(m => (
                <div key={m.name} className="space-y-2 p-3 bg-canvas rounded-panel border border-line-subtle">
                  <div className="flex justify-between items-center text-xs font-mono font-bold text-fg">
                    <span>{m.name}</span>
                    <span className="text-success-fg">{m.correctness}% Accuracy</span>
                  </div>

                  {/* Correctness Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono text-fg-subtle">
                      <span>Correctness / Factual Precision</span>
                      <span className="text-success-fg font-bold">{m.correctness}%</span>
                    </div>
                    <div className="w-full bg-overlay h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-success h-full rounded-full transition-all duration-700"
                        style={{ width: `${m.correctness}%` }}
                      />
                    </div>
                  </div>

                  {/* Relevance Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-mono text-fg-subtle">
                      <span>Context Vocabulary Overlap (Relevance)</span>
                      <span className="text-accent-fg font-bold">{m.relevance}%</span>
                    </div>
                    <div className="w-full bg-overlay h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-accent h-full rounded-full transition-all duration-700"
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
              <div className="flex justify-between items-center text-xs font-mono text-fg-subtle">
                <span>Wall-Clock Response Latency in Seconds (Min / Avg / Max)</span>
                <span className="text-success">Lower is Better</span>
              </div>

              {[
                { name: 'gemma3:4b', min: 8.6, avg: 15.75, max: 26.8, barWidth: 26.8 / 3 },
                { name: 'codellama:7b', min: 7.0, avg: 25.09, max: 74.1, barWidth: 74.1 / 3 },
                { name: 'starcoder2:3b', min: 4.3, avg: 63.25, max: 300.1, barWidth: 100 },
              ].map(m => (
                <div key={m.name} className="space-y-1.5 p-3.5 bg-canvas rounded-panel border border-line-subtle">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <span className="font-bold text-fg">{m.name}</span>
                    <span className="text-accent-fg font-bold">{m.avg}s average (max: {m.max}s)</span>
                  </div>

                  <div className="w-full bg-overlay h-3 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        m.avg < 20 ? 'bg-success' : m.avg < 30 ? 'bg-accent' : 'bg-danger'
                      }`}
                      style={{ width: `${Math.min(100, (m.avg / 65) * 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs font-mono text-fg-subtle">
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
              <div className="flex justify-between items-center text-xs font-mono text-fg-subtle">
                <span>Token Distribution (Prompt Tokens vs Generated Completion Tokens)</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-control bg-accent" /> Prompt</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-control bg-ai" /> Completion</span>
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
                  <div key={m.name} className="space-y-2 p-3.5 bg-canvas rounded-panel border border-line-subtle">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="font-bold text-fg">{m.name}</span>
                      <span className="text-fg-soft">{m.total.toFixed(0)} Avg Total Tokens</span>
                    </div>

                    <div className="w-full bg-overlay h-3 rounded-full overflow-hidden flex">
                      <div
                        className="bg-accent h-full"
                        style={{ width: `${promptPct}%` }}
                        title={`Prompt: ${m.prompt.toFixed(0)} tok`}
                      />
                      <div
                        className="bg-ai h-full"
                        style={{ width: `${compPct}%` }}
                        title={`Completion: ${m.completion.toFixed(0)} tok`}
                      />
                    </div>

                    <div className="flex justify-between text-xs font-mono text-fg-subtle">
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
              <div className="flex justify-between items-center text-xs font-mono text-fg-subtle">
                <span>Process Resource Consumption (Average CPU % &amp; Resident Memory RSS)</span>
                <span className="text-info">WSL2 Container Environment</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: 'gemma3:4b', cpu: 1.85, peakCpu: 33.2, ram: 69.5, color: '#3b82f6' },
                  { name: 'codellama:7b', cpu: 2.30, peakCpu: 36.7, ram: 69.6, color: '#0284c7' },
                  { name: 'starcoder2:3b', cpu: 2.39, peakCpu: 38.6, ram: 69.8, color: '#d97706' },
                ].map(m => (
                  <div key={m.name} className="p-4 bg-canvas rounded-panel border border-line-subtle space-y-3 text-xs font-mono">
                    <div className="font-bold text-fg pb-2 border-b border-line-subtle">{m.name}</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-fg-subtle">
                        <span>Avg CPU:</span>
                        <span className="text-info font-bold">{m.cpu}%</span>
                      </div>
                      <div className="flex justify-between text-fg-subtle">
                        <span>Peak CPU:</span>
                        <span className="text-warning-fg font-bold">{m.peakCpu}%</span>
                      </div>
                      <div className="flex justify-between text-fg-subtle">
                        <span>Process RAM:</span>
                        <span className="text-success font-bold">{m.ram} MB</span>
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
