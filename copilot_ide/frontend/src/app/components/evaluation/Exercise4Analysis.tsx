"use client";
import React from 'react';
import { EVALUATION_DATA } from './evaluationData';
import { HallucinationExplainer } from './HallucinationExplainer';

interface Exercise4AnalysisProps {
  onNavigateTab?: (tabIndex: number) => void;
}

export function Exercise4Analysis({ onNavigateTab }: Exercise4AnalysisProps) {
  const ex4 = EVALUATION_DATA.exercise_4;

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Exercise Briefing Header */}
      <div className="p-6 rounded-2xl bg-raised border border-line-strong space-y-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-accent/20 border border-accent/40 text-accent-fg text-xs font-mono font-bold">
              EXERCISE 4
            </span>
            <h2 className="text-lg font-bold text-fg-strong font-mono">
              Cross-Model Analysis, Trade-Offs &amp; Routing Strategy
            </h2>
          </div>
          <span className="text-xs font-mono text-warning bg-warning/15 px-3 py-1 rounded-full border border-warning/30">
            Pareto Frontier &amp; Dispatcher Architecture
          </span>
        </div>

        <blockquote className="border-l-2 border-accent pl-3 py-1.5 bg-canvas rounded-r text-xs text-fg-muted font-mono leading-relaxed">
          &ldquo;Do not stop at preparing a comparison table. Analyse questions such as: <strong>Which model provides better accuracy? Fewer hallucinations? Higher code test-pass rate? Lower response latency? Is there a quality–latency–resource trade-off?</strong>&rdquo;
          <span className="text-fg-subtle block mt-1">— Lab 4 Exercise 4 Specification</span>
        </blockquote>
      </div>

      {/* Category Winners & Champions Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">
          Category Champions &amp; Empirical Winners
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Best Accuracy */}
          <div className="p-5 rounded-2xl bg-surface border-2 border-success/40 space-y-3 shadow-lg hover:border-success transition-all">
            <div className="flex items-center justify-between">
              <span className="text-2xl">🎯</span>
              <span className="text-xs font-mono font-bold bg-success/15 text-success px-2 py-0.5 rounded border border-success/30">
                QUALITY WINNER
              </span>
            </div>
            <div>
              <div className="text-xs font-mono text-fg-subtle">Best Accuracy / Correctness</div>
              <div className="text-base font-bold text-fg-strong font-mono mt-0.5">
                {ex4.best_accuracy.model}
              </div>
              <div className="text-xl font-bold font-mono text-success-fg mt-1">
                {(ex4.best_accuracy.avg_score * 100).toFixed(1)}%
              </div>
            </div>
            <p className="text-xs text-fg-muted leading-relaxed pt-2 border-t border-line">
              Superior instruction adherence and exact factual keyword matching across 26 API tasks.
            </p>
          </div>

          {/* Fewest Hallucinations */}
          <div className="p-5 rounded-2xl bg-surface border-2 border-accent/40 space-y-3 shadow-lg hover:border-accent transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-2xl">🛡️</span>
                <span className="text-xs font-mono font-bold bg-accent/15 text-accent-fg px-2 py-0.5 rounded border border-accent/30">
                  FIDELITY WINNER
                </span>
              </div>
              <div className="mt-2">
                <div className="text-xs font-mono text-fg-subtle">Fewest Hallucinations</div>
                <div className="text-base font-bold text-fg-strong font-mono mt-0.5">
                  {ex4.fewest_hallucinations.model}
                </div>
                <div className="text-xl font-bold font-mono text-accent-fg mt-1">
                  {ex4.fewest_hallucinations.count} flagged
                </div>
              </div>
              <p className="text-xs text-fg-muted leading-relaxed pt-2 border-t border-line mt-2">
                Strictly refrained from fabricating non-existent OpenAPI endpoints or imaginary routes.
              </p>
            </div>
            <div className="pt-2 border-t border-line">
              <HallucinationExplainer triggerText="Explore Detection & Prevention Architecture" compact />
            </div>
          </div>

          {/* Highest Code Pass */}
          <div className="p-5 rounded-2xl bg-surface border-2 border-info-strong/40 space-y-3 shadow-lg hover:border-info-strong transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-2xl">💻</span>
                <span className="text-xs font-mono font-bold bg-info-strong/15 text-info px-2 py-0.5 rounded border border-info-strong/30">
                  SYNTHESIS WINNER
                </span>
              </div>
              <div className="mt-2">
                <div className="text-xs font-mono text-fg-subtle">Highest Code Test-Pass</div>
                <div className="text-base font-bold text-fg-strong font-mono mt-0.5">
                  {ex4.highest_code_pass.model}
                </div>
                <div className="text-xl font-bold font-mono text-info mt-1">
                  {(ex4.highest_code_pass.rate * 100).toFixed(1)}%
                </div>
              </div>
              <p className="text-xs text-fg-muted leading-relaxed pt-2 border-t border-line mt-2">
                Produced clean self-contained Python scripts adhering to expected endpoint parameters.
              </p>
            </div>
          </div>

          {/* Lowest Latency */}
          <div className="p-5 rounded-2xl bg-surface border-2 border-warning-fg/40 space-y-3 shadow-lg hover:border-warning-fg transition-all flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-2xl">⚡</span>
                <span className="text-xs font-mono font-bold bg-warning-fg/15 text-warning-fg px-2 py-0.5 rounded border border-warning-fg/30">
                  SPEED WINNER
                </span>
              </div>
              <div className="mt-2">
                <div className="text-xs font-mono text-fg-subtle">Lowest Response Latency</div>
                <div className="text-base font-bold text-fg-strong font-mono mt-0.5">
                  {ex4.lowest_latency.model}
                </div>
                <div className="text-xl font-bold font-mono text-warning-fg mt-1">
                  {ex4.lowest_latency.avg_latency_seconds.toFixed(2)}s
                </div>
              </div>
              <p className="text-xs text-fg-muted leading-relaxed pt-2 border-t border-line mt-2">
                Fastest average wall-clock latency, closely matched by gemma3:4b (33.21s).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Pareto Frontier Diagram */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-fg-soft font-mono uppercase tracking-wider">
          Pareto Efficiency Frontier (Accuracy vs Latency Trade-Off)
        </h3>

        <div className="p-6 rounded-2xl bg-surface border border-line space-y-6 shadow-xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono">
            <span className="text-fg-muted">
              Optimal Models reside in the top-left quadrant (<strong className="text-success-fg">High Accuracy</strong> + <strong className="text-accent-fg">Low Latency</strong>):
            </span>
            <span className="text-warning-fg bg-warning-fg/10 px-3 py-1 rounded-lg border border-warning-fg/30">
              Pareto Frontier: gemma3:4b (Fast Q&amp;A) &amp; codellama:7b (Code Synth)
            </span>
          </div>

          {/* Pareto Visual 2D Plane */}
          <div className="relative h-64 w-full bg-canvas border border-line rounded-xl p-4 flex flex-col justify-between select-none">
            {/* Background Grid Lines */}
            <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 pointer-events-none opacity-20">
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
            </div>

            {/* Optimal Zone Callout */}
            <div className="absolute top-3 left-4 text-xs font-mono text-success bg-success/10 px-2 py-1 rounded border border-success/25">
              ★ Pareto Optimal Region (High Accuracy, Low Latency)
            </div>

            {/* Gemma 3 4B Plot Point */}
            <div
              className="absolute group cursor-pointer"
              style={{ left: '40%', top: '25%' }}
            >
              <div className="w-5 h-5 rounded-full bg-success border-2 border-white shadow-lg animate-pulse" />
              <div className="absolute left-6 -top-2 bg-surface border border-success/60 px-2.5 py-1 rounded-lg text-xs font-mono text-fg whitespace-nowrap shadow-xl">
                <span className="text-success font-bold">gemma3:4b</span> (48.1%, 33.2s) 🏆
              </div>
            </div>

            {/* CodeLlama 7B Plot Point */}
            <div
              className="absolute group cursor-pointer"
              style={{ left: '62%', top: '38%' }}
            >
              <div className="w-5 h-5 rounded-full bg-info border-2 border-white shadow-lg" />
              <div className="absolute left-6 -top-2 bg-surface border border-info/60 px-2.5 py-1 rounded-lg text-xs font-mono text-fg whitespace-nowrap shadow-xl">
                <span className="text-info font-bold">codellama:7b</span> (40.9%, 47.9s, Multi-Hop Pro)
              </div>
            </div>

            {/* StarCoder2 3B Plot Point */}
            <div
              className="absolute group cursor-pointer"
              style={{ left: '39%', top: '78%' }}
            >
              <div className="w-5 h-5 rounded-full bg-danger border-2 border-white shadow-lg" />
              <div className="absolute right-6 -top-2 bg-surface border border-danger/60 px-2.5 py-1 rounded-lg text-xs font-mono text-fg whitespace-nowrap shadow-xl">
                <span className="text-danger-fg font-bold">starcoder2:3b</span> (9.6%, 32.9s, 8 Timeouts) ⚠️
              </div>
            </div>

            {/* Axis Labels */}
            <div className="flex justify-between text-xs font-mono text-fg-subtle pt-2 border-t border-line mt-auto">
              <span>← Fast (0s Latency)</span>
              <span>Response Latency (Seconds)</span>
              <span>Slow (70s+ Latency) →</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Category-by-Category Best Model Breakdown & Rationale ── */}
      <div className="p-6 rounded-2xl bg-surface border border-line-strong space-y-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-strong pb-4">
          <div>
            <h3 className="text-base font-bold text-fg-strong font-mono flex items-center gap-2">
              <span>🏆 Category-by-Category Winner Breakdown &amp; Analysis</span>
            </h3>
            <p className="text-xs text-fg-subtle font-mono mt-0.5">
              Empirical examination of which model performed best on each question type and the underlying architectural reasons
            </p>
          </div>
          <span className="text-xs font-mono text-success bg-success/15 px-2.5 py-1 rounded border border-success/30">
            Validated by Local Qwen 2.5 7B CoT
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 font-mono">
          {/* Group 1 */}
          <div className="p-4 rounded-xl bg-canvas border border-line-strong space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-xs text-info font-bold uppercase tracking-wider">Group 1: Single-File</div>
              <div className="text-xs text-fg-muted font-sans mt-1">Single-file endpoint &amp; parameter queries</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-success font-bold">
                  <span>gemma3:4b</span>
                  <span>47.1% 🏆</span>
                </div>
                <div className="flex justify-between text-fg-subtle">
                  <span>codellama:7b</span>
                  <span>28.6%</span>
                </div>
                <div className="flex justify-between text-fg-subtle">
                  <span>starcoder2:3b</span>
                  <span>14.3%</span>
                </div>
              </div>
            </div>
            <p className="text-xs font-sans text-fg-muted border-t border-line-strong pt-2 mt-2 leading-relaxed">
              <strong>Why Gemma Won:</strong> Precise keyword extraction from single OpenAPI chunks without generating prompt continuations or unnecessary code wrappers.
            </p>
          </div>

          {/* Group 2 */}
          <div className="p-4 rounded-xl bg-canvas border border-line-strong space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-xs text-ai font-bold uppercase tracking-wider">Group 2: Two-File Cross</div>
              <div className="text-xs text-fg-muted font-sans mt-1">Cross-referencing disjoint spec files</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-success font-bold">
                  <span>gemma3:4b</span>
                  <span>46.4% 🏆</span>
                </div>
                <div className="flex justify-between text-info font-semibold">
                  <span>codellama:7b</span>
                  <span>44.8%</span>
                </div>
                <div className="flex justify-between text-fg-subtle">
                  <span>starcoder2:3b</span>
                  <span>14.3%</span>
                </div>
              </div>
            </div>
            <p className="text-xs font-sans text-fg-muted border-t border-line-strong pt-2 mt-2 leading-relaxed">
              <strong>Why Tied:</strong> Both Gemma and CodeLlama successfully cross-correlated disparate authentication guides with endpoint schemas.
            </p>
          </div>

          {/* Group 3 */}
          <div className="p-4 rounded-xl bg-canvas border border-line-strong space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-xs text-[#fb7185] font-bold uppercase tracking-wider">Group 3: Multi-Hop</div>
              <div className="text-xs text-fg-muted font-sans mt-1">3+ file sequential dependency traces</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-success font-bold">
                  <span>codellama:7b</span>
                  <span>50.0% 🏆</span>
                </div>
                <div className="flex justify-between text-fg-subtle">
                  <span>gemma3:4b</span>
                  <span>30.0%</span>
                </div>
                <div className="flex justify-between text-fg-subtle">
                  <span>starcoder2:3b</span>
                  <span>0.0%</span>
                </div>
              </div>
            </div>
            <p className="text-xs font-sans text-fg-muted border-t border-line-strong pt-2 mt-2 leading-relaxed">
              <strong>Why CodeLlama Won:</strong> Larger 6.7B parameter capacity and 16k context window maintained multi-stage dependency chains (e.g. GitHub push → CI/CD → Slack alert).
            </p>
          </div>

          {/* Group 4 */}
          <div className="p-4 rounded-xl bg-canvas border border-line-strong space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-xs text-warning-fg font-bold uppercase tracking-wider">Group 4: Decoy &amp; Failure</div>
              <div className="text-xs text-fg-muted font-sans mt-1">Hard negatives &amp; conflicting params</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-success font-bold">
                  <span>gemma3:4b</span>
                  <span>61.3% 🏆</span>
                </div>
                <div className="flex justify-between text-fg-subtle">
                  <span>codellama:7b</span>
                  <span>37.5%</span>
                </div>
                <div className="flex justify-between text-fg-subtle">
                  <span>starcoder2:3b</span>
                  <span>0.0%</span>
                </div>
              </div>
            </div>
            <p className="text-xs font-sans text-fg-muted border-t border-line-strong pt-2 mt-2 leading-relaxed">
              <strong>Why Gemma Won:</strong> Followed negative constraints; correctly recognized missing information instead of hallucinating fictitious routes.
            </p>
          </div>

          {/* Group 5 */}
          <div className="p-4 rounded-xl bg-canvas border border-line-strong space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-xs text-success-fg font-bold uppercase tracking-wider">Group 5: Code Gen</div>
              <div className="text-xs text-fg-muted font-sans mt-1">Executable Python &amp; test assertions</div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between text-success font-bold">
                  <span>gemma3:4b</span>
                  <span>66.7% 🏆</span>
                </div>
                <div className="flex justify-between text-fg-subtle">
                  <span>codellama:7b</span>
                  <span>50.0%</span>
                </div>
                <div className="flex justify-between text-fg-subtle">
                  <span>starcoder2:3b</span>
                  <span>16.7%</span>
                </div>
              </div>
            </div>
            <p className="text-xs font-sans text-fg-muted border-t border-line-strong pt-2 mt-2 leading-relaxed">
              <strong>Why Gemma Won:</strong> Produced clean, self-contained Python scripts adhering to parameter types and passing unit assertion tests.
            </p>
          </div>
        </div>
      </div>

      {/* ── StarCoder2 3B Failure Mode Deep-Dive ── */}
      <div className="p-6 rounded-2xl bg-surface border border-[#3b191e] space-y-4 shadow-xl">
        <div className="flex items-center gap-2.5 text-sm font-bold font-mono text-danger-fg">
          <span className="text-lg">⚠️</span>
          <span>Architectural Failure Analysis: Why StarCoder2 3B Failed Open API Queries</span>
        </div>

        <p className="text-xs text-[#fca5a5] leading-relaxed font-sans">
          In our standardized benchmark, <code className="text-warning-fg bg-raised px-1.5 py-0.5 rounded font-mono">starcoder2:3b</code> scored only <strong>9.62% correctness</strong> with 21 zero-scores and 8 hard timeouts. Our output audit revealed 3 fundamental root causes:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
          <div className="p-4 rounded-xl bg-canvas border border-[#2b1216] space-y-1.5">
            <span className="font-bold text-warning-fg font-mono block">1. Base Completion vs. Instruction Tuned</span>
            <p className="text-fg-muted leading-relaxed">
              StarCoder2 is a pure <em>Fill-In-the-Middle (FIM)</em> code completion model, not instruction fine-tuned. When given developer questions, it treated the prompt as code comments and hallucinated multiple-choice quizzes (e.g. <code className="text-xs font-mono text-danger-fg">- [ ] email - [x] name</code>) instead of answering.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-canvas border border-[#2b1216] space-y-1.5">
            <span className="font-bold text-danger-fg font-mono block">2. Infinite Loops &amp; 60s Timeouts</span>
            <p className="text-fg-muted leading-relaxed">
              Without conversational stop token discipline (<code className="text-xs font-mono text-danger-fg">&lt;|endoftext|&gt;</code>), StarCoder repeatedly looped prompt text until hitting our 60.0s safety cutoff on 8 questions (Q4, Q5, Q7, Q8, Q9, Q14, Q15, Q26) with zero usable tokens.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-canvas border border-[#2b1216] space-y-1.5">
            <span className="font-bold text-ai font-mono block">3. Ungrounded Imports Regurgitation</span>
            <p className="text-fg-muted leading-relaxed">
              On Q18 and Q21, rather than synthesizing grounded cURL or requests calls, it regurgitated generic JavaScript boilerplate (<code className="text-xs font-mono text-ai">import &#123; get &#125; from 'lodash'</code>) completely disconnected from the retrieved OpenAPI YAML specs.
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Architectural Trade-Offs & Production Router */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Architectural Trade-Offs */}
        <div className="p-6 rounded-2xl bg-surface border border-line space-y-4">
          <div className="text-sm font-bold font-mono text-accent-fg flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Architectural Trade-Off Synthesis</span>
          </div>

          <div className="space-y-3 text-xs text-fg-muted leading-relaxed">
            <div className="p-3.5 bg-canvas rounded-xl border border-line-subtle space-y-1">
              <strong className="text-fg-strong block">1. Instruction-Tuned vs Completion Architecture:</strong>
              <p>
                Instruction fine-tuning (<code className="text-accent-fg">gemma3:4b</code>, <code className="text-info">codellama:7b</code>) is mandatory for enterprise RAG. Raw completion models (<code className="text-warning-fg">starcoder2:3b</code>) fail because they treat prompts as document continuations rather than instructions to be executed.
              </p>
            </div>

            <div className="p-3.5 bg-canvas rounded-xl border border-line-subtle space-y-1">
              <strong className="text-fg-strong block">2. Parameter Scaling vs Latency Overhead:</strong>
              <p>
                Scaling from 4B (<code className="text-accent-fg">gemma3:4b</code>) to 7B (<code className="text-info">codellama:7b</code>) adds <strong className="text-white">+9.34 seconds</strong> (59% latency increase) per query, but is indispensable when strict syntactic code compilation is required.
              </p>
            </div>
          </div>
        </div>

        {/* Enterprise Dispatcher Routing Plan */}
        <div className="p-6 rounded-2xl bg-surface border border-line space-y-4">
          <div className="text-sm font-bold font-mono text-success flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span>Archon Enterprise Dynamic Router</span>
          </div>

          <div className="p-3.5 bg-canvas rounded-xl border border-line-subtle space-y-3 text-xs">
            <p className="text-fg-muted leading-relaxed">
              Instead of standardizing on a single model across all tasks, the production deployment employs a dynamic query dispatcher:
            </p>

            <div className="space-y-2 font-mono text-xs">
              <div className="p-2.5 rounded-lg bg-raised border border-line-strong flex items-center justify-between">
                <div>
                  <span className="text-accent-fg font-bold block">Developer Q&amp;A / Workflow Queries</span>
                  <span className="text-xs text-fg-subtle">Route to <strong>gemma3:4b</strong></span>
                </div>
                <span className="text-xs bg-accent/20 text-accent-fg px-2 py-0.5 rounded font-bold">
                  15.7s • 82.6% Correct
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-raised border border-line flex items-center justify-between">
                <div>
                  <span className="text-success-fg font-bold block">Code Synthesis &amp; Test Writing (Q24-26)</span>
                  <span className="text-xs text-fg-subtle">Route to <strong>codellama:7b</strong></span>
                </div>
                <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded font-bold">
                  100% Code Pass
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
