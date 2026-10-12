"use client";
import React, { useState } from 'react';
import { EVALUATION_DATA } from './evaluationData';

export function Exercise6MultiHop() {
  const multihops = EVALUATION_DATA.exercise_6.multihop_evaluations;
  const [selectedHopIndex, setSelectedHopIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'matrix' | 'graph' | 'repo_intel'>('matrix');

  const activeHop = multihops[selectedHopIndex] || multihops[0];

  const q15ChainNodes = [
    {
      step: 1,
      title: "1. GitHub Push Event",
      file: "github_webhooks_api.yaml",
      endpoint: "POST /webhooks/github/push",
      desc: "Receives commit payload, SHA, and pusher.email from GitHub webhook reverse proxy."
    },
    {
      step: 2,
      title: "2. CI/CD Deployment Trigger",
      file: "ci_cd_deployment_guide.md",
      endpoint: "Deployment Runner",
      desc: "Extracts pusher.email, triggers containerized build pipeline, and monitors health."
    },
    {
      step: 3,
      title: "3. Alerting Ingestion",
      file: "alerting_service_api.yaml",
      endpoint: "POST /alerts",
      desc: "Dispatches critical severity failure event with service name and error traceback."
    },
    {
      step: 4,
      title: "4. Incident Escalation",
      file: "incident_response_workflow.md",
      endpoint: "Escalation Policy",
      desc: "Routes critical alerts to on-call engineer via SMS (Twilio) and dev team channel."
    },
    {
      step: 5,
      title: "5. Slack Notification",
      file: "slack_v1.yaml",
      endpoint: "POST /chat.postMessage",
      desc: "Posts formatted Slack deployment summary and error traceback to #deployments."
    }
  ];

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Exercise Briefing Header */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-[#1d2436] space-y-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#60a5fa] text-xs font-mono font-bold">
              EXERCISE 6
            </span>
            <h2 className="text-lg font-bold text-[#f1f5f9] font-mono">
              Multi-Hop Reasoning &amp; Repository-Level Intelligence
            </h2>
          </div>
          <span className="text-xs font-mono text-[#f43f5e] bg-[#f43f5e]/15 px-3 py-1 rounded-full border border-[#f43f5e]/30">
            Multi-File Chains (Q15–Q19)
          </span>
        </div>

        <blockquote className="border-l-2 border-[#3b82f6] pl-3 py-1.5 bg-[#080a0f] rounded-r text-xs text-[#94a3b8] font-mono leading-relaxed">
          &ldquo;Investigate whether your current LLM + RAG system can answer questions that require <strong>understanding MULTIPLE FILES, MODULES, OR COMPONENTS</strong>... begin thinking about <strong>REPOSITORY-LEVEL CODE UNDERSTANDING</strong>.&rdquo;
          <span className="text-[#64748b] block mt-1">— Lab 4 Exercise 6 Specification</span>
        </blockquote>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[#1a2233] pb-3 text-xs font-mono">
        {[
          { id: 'matrix', label: '1. Multi-Hop Chain Completeness Matrix' },
          { id: 'graph', label: '2. Q15 Visual 5-Hop Architecture Flow' },
          { id: 'repo_intel', label: '3. Vector RAG Limitations vs Graph RAG' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#1e2738] text-[#60a5fa] border border-[#3b82f6]/40 font-semibold shadow-sm'
                : 'text-[#8b949e] hover:text-[#e2e5ea] hover:bg-[#10141e]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* View 1: Multi-Hop Completeness Matrix */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs font-mono text-[#64748b]">
            <span>Empirical Evaluation of Multi-File Cross-Service Reasoning (Questions Q15 through Q19)</span>
            <span className="text-[#f43f5e]">Vector RAG Top-5 Truncation Bottleneck</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#1a2233] bg-[#090c12] custom-scrollbar shadow-xl">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-[#0e121a] border-b border-[#1a2233] text-[#64748b] uppercase tracking-wider text-[10.5px]">
                  <th className="py-3 px-3 w-14">QID</th>
                  <th className="py-3 px-3 w-28">Model</th>
                  <th className="py-3 px-4">Multi-Hop Query</th>
                  <th className="py-3 px-3 w-48">Expected Specs (Chain)</th>
                  <th className="py-3 px-3 w-44">Retrieved Specs</th>
                  <th className="py-3 px-3 w-28 text-center">Chain Complete</th>
                  <th className="py-3 px-3 w-20 text-right">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141a26]">
                {multihops.map((hop, idx) => {
                  const isSelected = selectedHopIndex === idx;
                  return (
                    <tr
                      key={idx}
                      onClick={() => setSelectedHopIndex(idx)}
                      className={`hover:bg-[#101520] transition-colors cursor-pointer ${
                        isSelected ? 'bg-[#141b28] border-l-2 border-[#3b82f6]' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-bold text-[#60a5fa]">{hop.question_id}</td>
                      <td className="py-3 px-3 text-[#38bdf8] font-medium">{hop.model}</td>
                      <td className="py-3 px-4 text-[#cbd5e1] font-sans text-xs font-medium leading-relaxed">
                        {hop.question}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {hop.expected_sources.map((src, sIdx) => (
                            <span key={sIdx} className="text-[9.5px] px-1.5 py-0.2 rounded bg-[#131924] text-[#94a3b8] border border-[#1c2436] truncate max-w-[170px]" title={src}>
                              {src}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {hop.multihop_sources_found.map((src, sIdx) => (
                            <span key={sIdx} className="text-[9.5px] px-1.5 py-0.2 rounded bg-[#10b981]/10 text-[#34d399] border border-[#10b981]/20 truncate max-w-[160px]" title={src}>
                              ✓ {src}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          hop.multihop_chain_complete
                            ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                            : 'bg-[#ef4444]/15 text-[#f87171] border border-[#ef4444]/30'
                        }`}>
                          {hop.multihop_chain_complete ? 'Complete' : 'Broken (Partial)'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#34d399]">
                        {(hop.correctness_score * 100).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Selected Multi-Hop Detail Card */}
          {activeHop && (
            <div className="p-5 rounded-2xl bg-[#0a0d14] border border-[#1a2233] space-y-3">
              <div className="flex items-center justify-between border-b border-[#161c28] pb-2 text-xs font-mono">
                <span className="text-[#60a5fa] font-bold">
                  Detailed Trace: {activeHop.question_id} ({activeHop.model})
                </span>
                <span className="text-[#64748b]">
                  {activeHop.multihop_sources_found.length} of {activeHop.expected_sources.length} sources retrieved
                </span>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="text-[#e2e5ea] font-sans font-medium">{activeHop.question}</div>
                <div className="p-3 bg-[#07090e] rounded-xl border border-[#141a26] max-h-48 overflow-y-auto custom-scrollbar text-[#cbd5e1] leading-relaxed whitespace-pre-wrap">
                  {activeHop.llm_response}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* View 2: Q15 Visual 5-Hop Architecture Flow */}
      {activeTab === 'graph' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-[#0a0d14] border border-[#1a2233] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#cbd5e1] font-mono uppercase tracking-wider">
                Q15: 5-Hop End-to-End Deployment Alerting Architecture
              </h3>
              <span className="text-xs font-mono text-[#60a5fa] bg-[#3b82f6]/10 px-2.5 py-1 rounded-lg border border-[#3b82f6]/25">
                5 Heterogeneous Services &amp; Guides
              </span>
            </div>
            <p className="text-xs text-[#94a3b8] leading-relaxed font-sans">
              Trace from GitHub push to Slack message delivery. When a flat similarity search operates on top-5 chunks, it often drops intermediate architectural bridge files.
            </p>

            {/* Interactive Node Graph */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-3">
              {q15ChainNodes.map((node, i) => (
                <div key={i} className="relative p-4 rounded-xl bg-[#080b10] border border-[#1a2336] space-y-2 hover:border-[#3b82f6] transition-all flex flex-col justify-between group shadow-sm">
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#64748b] mb-1">
                      <span className="font-bold text-[#60a5fa]">STEP {node.step}</span>
                      <span>Link {i < 4 ? '→' : '●'}</span>
                    </div>
                    <div className="text-xs font-bold text-[#f1f5f9] font-mono group-hover:text-[#60a5fa] transition-colors">
                      {node.title}
                    </div>
                    <div className="text-[10.5px] font-mono text-[#38bdf8] mt-1 truncate" title={node.file}>
                      📄 {node.file}
                    </div>
                    <div className="text-[10px] font-mono text-[#10b981] mt-0.5 truncate" title={node.endpoint}>
                      ⚡ {node.endpoint}
                    </div>
                    <p className="text-[11px] text-[#8b949e] font-sans mt-2 leading-relaxed">
                      {node.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View 3: Vector RAG Limitations vs Repository Code Intelligence */}
      {activeTab === 'repo_intel' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Vector RAG Failure Modes */}
          <div className="p-6 rounded-2xl bg-[#0a0d14] border border-[#1a2233] space-y-4 shadow-xl">
            <div className="text-sm font-bold font-mono text-[#f87171] flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Why Vector RAG Fails on Multi-Hop Chains</span>
            </div>

            <div className="space-y-3 text-xs text-[#94a3b8] leading-relaxed font-sans">
              <div className="p-3.5 bg-[#07090e] rounded-xl border border-[#141a26] space-y-1">
                <strong className="text-[#f1f5f9] font-mono block">1. Top-k Context Window Truncation:</strong>
                <p>
                  In a 5-step workflow (e.g. Q15 requiring 5 distinct specs), retrieving <code className="text-[#60a5fa] font-mono">top_k = 5</code> often fills the context window with multiple chunks from the single most lexically dense document, omitting intermediate linkage steps (e.g. <code className="text-[#fbbf24] font-mono">ci_cd_deployment_guide.md</code>).
                </p>
              </div>

              <div className="p-3.5 bg-[#07090e] rounded-xl border border-[#141a26] space-y-1">
                <strong className="text-[#f1f5f9] font-mono block">2. Loss of Relational Topology:</strong>
                <p>
                  Flat vector embeddings evaluate chunks in semantic isolation. They lack awareness of call graphs, foreign key references, and event dispatch pipelines connecting service A to service B.
                </p>
              </div>
            </div>
          </div>

          {/* Graph RAG & Sourcegraph Bridge */}
          <div className="p-6 rounded-2xl bg-[#0a0d14] border border-[#1a2233] space-y-4 shadow-xl">
            <div className="text-sm font-bold font-mono text-[#10b981] flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <span>Bridge to Repository-Level Code Intelligence</span>
            </div>

            <div className="space-y-3 text-xs text-[#94a3b8] leading-relaxed font-sans">
              <div className="p-3.5 bg-[#07090e] rounded-xl border border-[#141a26] space-y-1">
                <strong className="text-[#f1f5f9] font-mono block">1. SCIP / LSIF Symbol Indexing (Sourcegraph Bridge):</strong>
                <p>
                  Transitioning from naive chunk-level RAG to structural symbol indexing allows traversing precise definition-to-reference edges (<code className="text-[#38bdf8] font-mono">def POST /orders -&gt; calls stripe.Charge.create()</code>) across repositories.
                </p>
              </div>

              <div className="p-3.5 bg-[#07090e] rounded-xl border border-[#141a26] space-y-1">
                <strong className="text-[#f1f5f9] font-mono block">2. Graph RAG Hybrid Index:</strong>
                <p>
                  By combining dense vector retrieval for semantic intent with a knowledge graph for cross-service topology, the copilot can deterministically retrieve all 5 hops in complex microservice architectures.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
