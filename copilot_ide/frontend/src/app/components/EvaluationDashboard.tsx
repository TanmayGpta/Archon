"use client";
import React, { useState } from 'react';
import { Glyph, type GlyphName } from './Icons';
import { EVALUATION_DATA } from './evaluation/evaluationData';
import { JsonDataModal } from './evaluation/JsonDataModal';
import { ExecutiveOverview } from './evaluation/ExecutiveOverview';
import { Exercise1Models } from './evaluation/Exercise1Models';
import { Exercise2Dataset } from './evaluation/Exercise2Dataset';
import { Exercise3Metrics } from './evaluation/Exercise3Metrics';
import { Exercise4Analysis } from './evaluation/Exercise4Analysis';
import { Exercise5Traces } from './evaluation/Exercise5Traces';
import { Exercise6MultiHop } from './evaluation/Exercise6MultiHop';
import { AblationTab } from './evaluation/AblationTab';
import { ClassifierBenchmarkTab } from './evaluation/ClassifierBenchmarkTab';
import { ConformanceEngineTab } from './evaluation/ConformanceEngineTab';
import { JuryEvaluationTab } from './evaluation/JuryEvaluationTab';

export function EvaluationDashboard() {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [selectedTraceQuestionId, setSelectedTraceQuestionId] = useState<string>('Q12');
  const [isJsonModalOpen, setIsJsonModalOpen] = useState<boolean>(false);

  const tabs = [
    { id: 0, label: 'Overview', sub: 'Executive Summary', icon: 'trophy' as GlyphName },
    { id: 1, label: 'Models', sub: 'Profiles & Invariants', icon: 'bot' as GlyphName },
    { id: 2, label: 'Dataset', sub: '26-Question Bank', icon: 'clipboard' as GlyphName },
    { id: 3, label: 'Metrics', sub: 'Formulas & Charts', icon: 'chart' as GlyphName },
    { id: 4, label: 'Trade-offs', sub: 'Trade-offs & Router', icon: 'scale' as GlyphName },
    { id: 5, label: 'Traces', sub: 'RAG Pipeline Flow', icon: 'search' as GlyphName },
    { id: 6, label: 'Multi-hop', sub: 'Repository Graph', icon: 'network' as GlyphName },
    { id: 7, label: 'SCIP ablation', sub: 'Code Intelligence Δ', icon: 'zap' as GlyphName },
    { id: 8, label: 'Layer classifier', sub: 'Kev vs Groq vs Laya', icon: 'network' as GlyphName },
    { id: 9, label: 'Conformance engine', sub: 'AST → graph → Tarjan → rules', icon: 'search' as GlyphName },
    { id: 10, label: 'Bias jury', sub: '5 local jurors · majority vote', icon: 'scale' as GlyphName },
  ];

  return (
    <div className="min-h-full bg-canvas text-fg-soft font-sans antialiased pb-16">
      {/* Top Banner with Navigation & Controls */}
      <div className="border-b border-line-subtle bg-surface/95 backdrop-blur-md sticky top-[56px] z-40">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-panel bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-fg font-bold text-sm">
              <Glyph name="chart" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-fg-strong font-mono tracking-tight">
                  Evaluation &amp; Benchmark Dashboard
                </span>
                <span className="text-xs font-mono px-2 py-0.2 rounded-full bg-success/15 text-success border border-success/30 font-semibold">
                  OFFLINE SNAPSHOT
                </span>
              </div>
              <p className="text-xs font-mono text-fg-subtle">
                Benchmarking 3 Open-Weights LLMs Across 26 Enterprise API Queries
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsJsonModalOpen(true)}
              className="px-3.5 py-1.5 rounded-control bg-overlay hover:bg-selected text-[#93c5fd] hover:text-white border border-line-strong text-xs font-mono font-semibold transition-all flex items-center gap-2 cursor-pointer"
              title="Inspect complete evaluation_report.json data"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>View Raw JSON</span>
            </button>
          </div>
        </div>

        {/* Stepper Navigation Tabs */}
        <div className="max-w-[1440px] mx-auto px-4 md:px-8">
          <div className="flex flex-wrap items-center gap-1 py-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.sub}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-2.5 py-1 rounded-control text-xs font-mono transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-selected text-accent-fg border border-accent/40 font-bold '
                      : 'bg-raised text-fg-muted hover:text-fg-soft hover:bg-overlay border border-line'
                  }`}
                >
                  <span className="text-sm"><Glyph name={tab.icon} /></span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Tab Content Viewport */}
      <main className="max-w-[1440px] mx-auto px-4 md:px-8 pt-8">
        {activeTab === 0 && (
          <ExecutiveOverview
            onNavigateTab={setActiveTab}
            onOpenJson={() => setIsJsonModalOpen(true)}
          />
        )}
        {activeTab === 1 && <Exercise1Models />}
        {activeTab === 2 && (
          <Exercise2Dataset
            onSelectTraceQuestion={setSelectedTraceQuestionId}
            onNavigateTab={setActiveTab}
          />
        )}
        {activeTab === 3 && <Exercise3Metrics />}
        {activeTab === 4 && <Exercise4Analysis onNavigateTab={setActiveTab} />}
        {activeTab === 5 && (
          <Exercise5Traces initialQuestionId={selectedTraceQuestionId} />
        )}
        {activeTab === 6 && <Exercise6MultiHop />}
        {activeTab === 7 && <AblationTab />}
        {activeTab === 8 && <ClassifierBenchmarkTab />}
        {activeTab === 9 && <ConformanceEngineTab />}
        {activeTab === 10 && <JuryEvaluationTab />}
      </main>

      {/* Raw JSON Explorer Modal */}
      <JsonDataModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
      />
    </div>
  );
}
