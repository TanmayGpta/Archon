"use client";
import React, { useState } from 'react';
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

export function EvaluationDashboard() {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [selectedTraceQuestionId, setSelectedTraceQuestionId] = useState<string>('Q12');
  const [isJsonModalOpen, setIsJsonModalOpen] = useState<boolean>(false);

  const tabs = [
    { id: 0, label: 'Overview', sub: 'Executive Summary', icon: '🏆' },
    { id: 1, label: 'Ex 1: Models', sub: 'Profiles & Invariants', icon: '🤖' },
    { id: 2, label: 'Ex 2: Dataset', sub: '26-Question Bank', icon: '📋' },
    { id: 3, label: 'Ex 3: Metrics', sub: 'Formulas & Charts', icon: '📊' },
    { id: 4, label: 'Ex 4: Analysis', sub: 'Trade-offs & Router', icon: '⚖️' },
    { id: 5, label: 'Ex 5: Traces', sub: 'RAG Pipeline Flow', icon: '🔍' },
    { id: 6, label: 'Ex 6: Multi-Hop', sub: 'Repository Graph', icon: '🕸️' },
    { id: 7, label: 'SCIP Ablation', sub: 'Code Intelligence Δ', icon: '⚡' },
  ];

  return (
    <div className="min-h-full bg-[#07080b] text-[#cbd5e1] font-sans antialiased pb-16">
      {/* Top Banner with Navigation & Controls */}
      <div className="border-b border-[#161a24] bg-[#090c12]/95 backdrop-blur-md sticky top-[56px] z-40">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#3b82f6]/15 border border-[#3b82f6]/30 flex items-center justify-center text-[#60a5fa] font-bold text-sm">
              📊
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#f1f5f9] font-mono tracking-tight">
                  Lab 4 Evaluation &amp; Benchmark Dashboard
                </span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 font-semibold">
                  OFFLINE SNAPSHOT
                </span>
              </div>
              <p className="text-[11px] font-mono text-[#64748b]">
                Benchmarking 3 Open-Weights LLMs Across 26 Enterprise API Queries
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsJsonModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[#141a26] hover:bg-[#1e2638] text-[#93c5fd] hover:text-white border border-[#222c40] text-xs font-mono font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
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
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-mono transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                    isActive
                      ? 'bg-[#1e2738] text-[#60a5fa] border border-[#3b82f6]/40 font-bold shadow-md'
                      : 'bg-[#0e121a] text-[#8b949e] hover:text-[#cbd5e1] hover:bg-[#141924] border border-[#161c28]'
                  }`}
                >
                  <span className="text-sm">{tab.icon}</span>
                  <div className="text-left">
                    <div className="leading-tight">{tab.label}</div>
                    <div className={`text-[9.5px] font-normal leading-tight ${isActive ? 'text-[#93c5fd]' : 'text-[#505a6e]'}`}>
                      {tab.sub}
                    </div>
                  </div>
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
      </main>

      {/* Raw JSON Explorer Modal */}
      <JsonDataModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
      />
    </div>
  );
}
