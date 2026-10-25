"use client";
import React, { useState, useEffect } from 'react';
import { DEFAULT_ABLATION_DATA, AblationReport, QuestionComparisonItem } from './ablationReportData';
import { EVALUATION_API_BASE } from '@/lib/api';

export function AblationTab() {
  const [report, setReport] = useState<AblationReport>(DEFAULT_ABLATION_DATA);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>('CQ1');
  const [isRunningLive, setIsRunningLive] = useState<boolean>(false);
  const [liveStatus, setLiveStatus] = useState<string>('');

  // Attempt to fetch latest live report from backend
  useEffect(() => {
    async function loadLatestReport() {
      try {
        const res = await fetch(`${EVALUATION_API_BASE}/api/evaluate/ablation/latest`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.aggregate_deltas) {
            setReport(data);
          }
        }
      } catch (e) {
        // Fallback gracefully to DEFAULT_ABLATION_DATA
      }
    }
    loadLatestReport();
  }, []);

  const handleRunLiveAblation = async () => {
    setIsRunningLive(true);
    setLiveStatus('Starting ablation study on gemma3:4b...');
    try {
      const res = await fetch(`${EVALUATION_API_BASE}/api/evaluate/ablation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemma3:4b', judge_model: 'qwen2.5:7b' })
      });
      if (res.ok) {
        const initData = await res.json();
        const ablationId = initData.ablation_id;
        setLiveStatus(`Running Phase 1 (Baseline No-SCIP)... [${ablationId.slice(0, 8)}]`);

        // Poll status every 4 seconds
        const poller = setInterval(async () => {
          try {
            const stRes = await fetch(`${EVALUATION_API_BASE}/api/evaluate/ablation/status/${ablationId}`);
            if (stRes.ok) {
              const stData = await stRes.json();
              if (stData.status === 'completed') {
                clearInterval(poller);
                setIsRunningLive(false);
                setLiveStatus('Ablation benchmark completed!');
                const repRes = await fetch(`${EVALUATION_API_BASE}/api/evaluate/ablation/report/${ablationId}`);
                if (repRes.ok) {
                  const repData = await repRes.json();
                  setReport(repData);
                }
              } else if (stData.status === 'failed') {
                clearInterval(poller);
                setIsRunningLive(false);
                setLiveStatus(`Run failed: ${stData.error_msg || 'Unknown error'}`);
              } else {
                setLiveStatus(`Ablation running: ${stData.status}...`);
              }
            }
          } catch (err) {
            // keep polling
          }
        }, 4000);
      } else {
        setIsRunningLive(false);
        setLiveStatus('Failed to start run. Is evaluation service running on port 8003?');
      }
    } catch (e: any) {
      setIsRunningLive(false);
      setLiveStatus(`Error: ${e?.message || e}`);
    }
  };

  const categories = ['All', 'Architecture & Flow', 'Code Symbol Lookup', 'Cross-File Dependency', 'Hard Negative'];

  const filteredQuestions = selectedCategory === 'All'
    ? report.question_comparisons
    : report.question_comparisons.filter(q => q.category === selectedCategory);

  const { aggregate_deltas: agg, retrieval_distribution: rDist } = report;

  const getQualityBadge = (quality: string) => {
    switch (quality) {
      case 'correct':
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-success/15 text-success border border-success/30">CORRECT</span>;
      case 'partial':
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-warning/15 text-warning border border-warning/30">PARTIAL</span>;
      case 'wrong':
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-danger/15 text-danger border border-danger/30">WRONG</span>;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* ── Hero Banner ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-raised via-surface to-canvas border border-line-strong p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-info-strong/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-success/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2.5 max-w-3xl">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full bg-info-strong/20 border border-info-strong/40 text-info text-xs font-mono font-bold tracking-wide">
                SCIP ABLATION STUDY
              </span>
              <span className="text-xs font-mono text-fg-subtle">
                • Model: <strong className="text-info">{report.model}</strong> • Judge: <strong className="text-fg-soft">qwen2.5:7b (CoT)</strong>
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold text-fg-strong tracking-tight font-sans">
              Code Intelligence Impact: SCIP vs Raw Spec Baseline
            </h1>

            <p className="text-sm md:text-lg text-fg-muted leading-relaxed">
              Controlled A/B benchmark evaluating the quantitative delta of indexing AST-extracted code symbols (<code className="text-info bg-raised px-1.5 py-0.5 rounded">classes</code>, <code className="text-info bg-raised px-1.5 py-0.5 rounded">functions</code>, <code className="text-info bg-raised px-1.5 py-0.5 rounded">routes</code>) across <span className="text-white font-semibold">10 TedxBMU codebase queries</span>. Proving that precise code chunks eliminate context bloat, reduce token consumption, and eradicate parametric hallucination.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 flex-shrink-0">
            <button
              onClick={handleRunLiveAblation}
              disabled={isRunningLive}
              className="px-5 py-2.5 rounded-xl bg-info-strong hover:bg-[#0369a1] disabled:bg-selected text-white disabled:text-fg-subtle text-xs font-mono font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-cyan-900/30"
            >
              {isRunningLive ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Running Ablation Benchmark...</span>
                </>
              ) : (
                <>
                  <span>⚡ Run Live Ablation (gemma3:4b)</span>
                </>
              )}
            </button>
            {liveStatus && (
              <span className="text-xs font-mono text-cyan-400 text-center animate-pulse">
                {liveStatus}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Top 4 KPI Delta Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Correctness */}
        <div className="rounded-2xl bg-surface border border-line-strong p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-fg-subtle">
            <span>FACTUAL CORRECTNESS</span>
            <span className="px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 font-bold text-xs">
              ▲ +{agg.correctness.percent_improvement}%
            </span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-fg-strong">
              {(agg.correctness.with_scip * 100).toFixed(1)}%
            </div>
            <div className="text-xs font-mono text-fg-subtle mt-1">
              Baseline: {(agg.correctness.baseline * 100).toFixed(1)}% (<strong className="text-success">+{((agg.correctness.delta) * 100).toFixed(1)}%</strong>)
            </div>
          </div>
          <div className="text-xs text-fg-muted">
            Ground-truth code symbols eliminate speculative guesswork.
          </div>
        </div>

        {/* Card 2: Input Prompt Tokens */}
        <div className="rounded-2xl bg-surface border border-line-strong p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-fg-subtle">
            <span>INPUT PROMPT TOKENS</span>
            <span className="px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 font-bold text-xs">
              ▼ -{((agg.prompt_tokens.tokens_saved || 0) / agg.prompt_tokens.baseline * 100).toFixed(1)}%
            </span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-info">
              {agg.prompt_tokens.with_scip.toFixed(0)} <span className="text-sm font-normal text-fg-subtle">avg</span>
            </div>
            <div className="text-xs font-mono text-fg-subtle mt-1">
              Baseline: {agg.prompt_tokens.baseline.toFixed(0)} (<strong className="text-success">-{agg.prompt_tokens.tokens_saved?.toFixed(0)} saved</strong>)
            </div>
          </div>
          <div className="text-xs text-fg-muted">
            Targeted code chunks drop redundant spec boilerplate.
          </div>
        </div>

        {/* Card 3: Generation Latency */}
        <div className="rounded-2xl bg-surface border border-line-strong p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-fg-subtle">
            <span>WALL-CLOCK LATENCY</span>
            <span className="px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 font-bold text-xs">
              ▼ -{((agg.latency_seconds.speedup_seconds || 0) / agg.latency_seconds.baseline * 100).toFixed(1)}%
            </span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-[#a855f7]">
              {agg.latency_seconds.with_scip.toFixed(2)}s
            </div>
            <div className="text-xs font-mono text-fg-subtle mt-1">
              Baseline: {agg.latency_seconds.baseline.toFixed(2)}s (<strong className="text-success">-{agg.latency_seconds.speedup_seconds?.toFixed(2)}s faster</strong>)
            </div>
          </div>
          <div className="text-xs text-fg-muted">
            Fewer prompt tokens + grounded context speeds up inference.
          </div>
        </div>

        {/* Card 4: Retrieval Precision */}
        <div className="rounded-2xl bg-surface border border-line-strong p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono text-fg-subtle">
            <span>RETRIEVAL ACCURACY</span>
            <span className="px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 font-bold text-xs">
              ▲ +{((rDist.with_scip.correct - rDist.baseline.correct) / Math.max(rDist.baseline.correct, 1) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="my-3">
            <div className="text-3xl font-bold font-mono text-warning">
              {(rDist.with_scip.correct / report.question_count * 100).toFixed(0)}%
            </div>
            <div className="text-xs font-mono text-fg-subtle mt-1">
              Baseline: {(rDist.baseline.correct / report.question_count * 100).toFixed(0)}% (<strong className="text-success">+{rDist.with_scip.correct - rDist.baseline.correct} queries</strong>)
            </div>
          </div>
          <div className="text-xs text-fg-muted">
            Surfaces actual JavaScript / TypeScript implementation files.
          </div>
        </div>
      </div>

      {/* ── Diagnostic Visualizations (Side-by-Side Charts) ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart A: Retrieval Quality Distribution */}
        <div className="rounded-2xl bg-surface border border-line-strong p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold font-mono text-fg-strong uppercase tracking-wider">
              Retrieval Quality Distribution
            </h3>
            <span className="text-xs font-mono text-fg-subtle">Top-3 Cross-Encoder Chunks</span>
          </div>

          <div className="space-y-4 pt-2">
            {/* Baseline Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-fg-soft font-semibold">Baseline (No-SCIP)</span>
                <span className="text-danger">70% Wrong Chunks</span>
              </div>
              <div className="h-6 w-full rounded-lg bg-overlay flex overflow-hidden p-0.5 border border-line-strong">
                <div style={{ width: `${(rDist.baseline.correct / 10) * 100}%` }} className="bg-success h-full flex items-center justify-center text-xs font-mono font-bold text-white" title="Correct (10%)">
                  {rDist.baseline.correct > 0 ? `${rDist.baseline.correct}` : ''}
                </div>
                <div style={{ width: `${(rDist.baseline.partial / 10) * 100}%` }} className="bg-warning h-full flex items-center justify-center text-xs font-mono font-bold text-white" title="Partial (20%)">
                  {rDist.baseline.partial}
                </div>
                <div style={{ width: `${(rDist.baseline.wrong / 10) * 100}%` }} className="bg-danger h-full flex items-center justify-center text-xs font-mono font-bold text-white" title="Wrong (70%)">
                  {rDist.baseline.wrong} (70%)
                </div>
              </div>
            </div>

            {/* With-SCIP Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-info font-semibold">With SCIP Code Intelligence</span>
                <span className="text-success">80% Correct Chunks</span>
              </div>
              <div className="h-6 w-full rounded-lg bg-overlay flex overflow-hidden p-0.5 border border-line-strong">
                <div style={{ width: `${(rDist.with_scip.correct / 10) * 100}%` }} className="bg-success h-full flex items-center justify-center text-xs font-mono font-bold text-white" title="Correct (80%)">
                  {rDist.with_scip.correct} (80%)
                </div>
                <div style={{ width: `${(rDist.with_scip.partial / 10) * 100}%` }} className="bg-warning h-full flex items-center justify-center text-xs font-mono font-bold text-white" title="Partial (10%)">
                  {rDist.with_scip.partial}
                </div>
                <div style={{ width: `${(rDist.with_scip.wrong / 10) * 100}%` }} className="bg-danger h-full flex items-center justify-center text-xs font-mono font-bold text-white" title="Wrong (10%)">
                  {rDist.with_scip.wrong}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs font-mono text-fg-muted pt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-success" />
                <span>Correct (Expected Files)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                <span>Partial Match</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-danger" />
                <span>Wrong / Irrelevant</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart B: Token Consumption & Context Size */}
        <div className="rounded-2xl bg-surface border border-line-strong p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold font-mono text-fg-strong uppercase tracking-wider">
              Token Efficiency &amp; Context Size
            </h3>
            <span className="text-xs font-mono text-success">358 Tokens Saved per Query</span>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="p-3.5 rounded-xl bg-raised border border-line-strong space-y-2">
              <span className="text-xs font-mono text-fg-subtle uppercase">Avg Prompt Tokens</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-info">
                  {agg.prompt_tokens.with_scip.toFixed(0)}
                </span>
                <span className="text-xs font-mono text-danger line-through">
                  {agg.prompt_tokens.baseline.toFixed(0)}
                </span>
              </div>
              <div className="w-full bg-selected h-1.5 rounded-full overflow-hidden">
                <div style={{ width: `${(agg.prompt_tokens.with_scip / agg.prompt_tokens.baseline) * 100}%` }} className="bg-info h-full" />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-raised border border-line-strong space-y-2">
              <span className="text-xs font-mono text-fg-subtle uppercase">Injected Context Chars</span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-success">
                  {agg.context_chars.with_scip.toFixed(0)}
                </span>
                <span className="text-xs font-mono text-danger line-through">
                  {agg.context_chars.baseline.toFixed(0)}
                </span>
              </div>
              <div className="w-full bg-selected h-1.5 rounded-full overflow-hidden">
                <div style={{ width: `${(agg.context_chars.with_scip / agg.context_chars.baseline) * 100}%` }} className="bg-success h-full" />
              </div>
            </div>
          </div>

          <p className="text-xs text-fg-muted font-sans leading-relaxed pt-1">
            Without SCIP, the retriever pulls full architecture markdown guides (<code className="text-fg-soft">3,412 chars</code>) that flood the context with unrelated text. With SCIP, it injects compact code snippets (<code className="text-info">1,845 chars</code>) directly pinpointing function signatures.
          </p>
        </div>
      </div>

      {/* ── 10-Question Granular Comparison Table ───────────────────── */}
      <div className="rounded-2xl bg-surface border border-line-strong shadow-xl overflow-hidden">
        <div className="p-5 border-b border-line-strong flex flex-wrap items-center justify-between gap-4 bg-raised">
          <div>
            <h2 className="text-base font-bold font-mono text-white flex items-center gap-2">
              <span>📋</span>
              <span>10-Question Granular Benchmark Comparison</span>
            </h2>
            <p className="text-xs text-fg-muted font-mono mt-0.5">
              Side-by-side evaluation per query on {report.model}
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-info-strong/20 border border-info-strong/50 text-info font-bold'
                    : 'bg-overlay text-fg-muted hover:text-fg-soft border border-line'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-line-strong bg-surface text-fg-subtle">
                <th className="py-3 px-4 w-14">ID</th>
                <th className="py-3 px-4 w-1/3">Question</th>
                <th className="py-3 px-4 text-center">Baseline Quality</th>
                <th className="py-3 px-4 text-center">SCIP Quality</th>
                <th className="py-3 px-4 text-center">Baseline Correct</th>
                <th className="py-3 px-4 text-center">SCIP Correct</th>
                <th className="py-3 px-4 text-center">Tokens Δ</th>
                <th className="py-3 px-4 text-center">Latency Δ</th>
                <th className="py-3 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredQuestions.map((q) => {
                const isExpanded = expandedQuestionId === q.question_id;
                return (
                  <React.Fragment key={q.question_id}>
                    <tr className={`hover:bg-raised transition-colors ${isExpanded ? 'bg-raised' : ''}`}>
                      <td className="py-3 px-4 font-bold text-info">
                        {q.question_id}
                      </td>
                      <td className="py-3 px-4 text-white font-sans font-medium">
                        <div className="line-clamp-2">{q.question}</div>
                        <div className="text-xs text-fg-subtle font-mono mt-0.5">{q.tag}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getQualityBadge(q.baseline.retrieval_quality)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getQualityBadge(q.with_scip.retrieval_quality)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-fg-soft">
                        {(q.baseline.correctness * 100).toFixed(0)}%
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-success">
                        {(q.with_scip.correctness * 100).toFixed(0)}%
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-success">
                        {q.deltas.prompt_tokens_delta} tok
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-info">
                        {q.deltas.latency_delta_seconds.toFixed(1)}s
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setExpandedQuestionId(isExpanded ? null : q.question_id)}
                          className="px-2.5 py-1 rounded bg-selected hover:bg-selected text-cyan-400 text-xs font-mono cursor-pointer transition-colors"
                        >
                          {isExpanded ? 'Hide ▲' : 'Diff ▼'}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Inspection Drawer */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} className="bg-canvas p-5 border-y border-line-strong">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
                            {/* Baseline Column */}
                            <div className="p-4 rounded-xl bg-raised border border-danger/30 space-y-3">
                              <div className="flex items-center justify-between pb-2 border-b border-line">
                                <span className="text-danger font-bold uppercase tracking-wider flex items-center gap-1.5">
                                  <span>❌</span>
                                  <span>Baseline (No-SCIP)</span>
                                </span>
                                <span className="text-fg-subtle">{q.baseline.prompt_tokens} prompt tok • {q.baseline.latency_seconds.toFixed(2)}s</span>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-fg-subtle uppercase">Retrieved Chunks &amp; Injected Context:</span>
                                <div className="p-2.5 rounded bg-canvas border border-line text-fg-muted text-xs max-h-36 overflow-y-auto whitespace-pre-wrap font-sans">
                                  {q.baseline.response_snippet}
                                </div>
                              </div>
                            </div>

                            {/* With-SCIP Column */}
                            <div className="p-4 rounded-xl bg-raised border border-success/30 space-y-3">
                              <div className="flex items-center justify-between pb-2 border-b border-line">
                                <span className="text-success font-bold uppercase tracking-wider flex items-center gap-1.5">
                                  <span>✅</span>
                                  <span>With SCIP Code Intelligence</span>
                                </span>
                                <span className="text-fg-subtle">{q.with_scip.prompt_tokens} prompt tok • {q.with_scip.latency_seconds.toFixed(2)}s</span>
                              </div>
                              <div className="space-y-1">
                                <span className="text-xs text-fg-subtle uppercase">Retrieved Code Symbols &amp; Context:</span>
                                <div className="p-2.5 rounded bg-canvas border border-line text-fg text-xs max-h-36 overflow-y-auto whitespace-pre-wrap font-sans">
                                  {q.with_scip.response_snippet}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Key Discoveries & Architectural Takeaways ───────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl bg-surface border border-line-strong shadow-xl space-y-2.5">
          <div className="w-8 h-8 rounded-lg bg-info/15 border border-info/30 flex items-center justify-center text-info font-bold text-sm">
            💡
          </div>
          <h3 className="text-sm font-bold font-mono text-white">
            Context Bloat Elimination
          </h3>
          <p className="text-xs text-fg-muted font-sans leading-relaxed">
            Without SCIP, the retriever pulls full Markdown documentation guides (<code className="text-fg-soft">3,412 chars</code>) that drown the LLM in irrelevant text. With SCIP, precise function signatures save <strong className="text-success">358 input tokens per query</strong> (-37.6%).
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-line-strong shadow-xl space-y-2.5">
          <div className="w-8 h-8 rounded-lg bg-success/15 border border-success/30 flex items-center justify-center text-success font-bold text-sm">
            🎯
          </div>
          <h3 className="text-sm font-bold font-mono text-white">
            +178.9% Factual Accuracy
          </h3>
          <p className="text-xs text-fg-muted font-sans leading-relaxed">
            When code symbols like <code className="text-info">EmailService</code> and <code className="text-info">generateCertificateEmail()</code> are in ChromaDB, the LLM quotes exact parameters instead of hallucinating fictional SendGrid REST endpoints.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-line-strong shadow-xl space-y-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#a855f7]/15 border border-[#a855f7]/30 flex items-center justify-center text-[#a855f7] font-bold text-sm">
            ⚡
          </div>
          <h3 className="text-sm font-bold font-mono text-white">
            11.6s Speedup per Query
          </h3>
          <p className="text-xs text-fg-muted font-sans leading-relaxed">
            Shorter prompts directly translate to reduced prompt evaluation time (<code className="text-[#a855f7]">prompt_eval_count</code>) on local Ollama GPU/CPU hardware, dropping end-to-end response latency from 44.8s to 33.2s.
          </p>
        </div>
      </div>
    </div>
  );
}
