"use client";
import React, { useState, useMemo } from 'react';
import { EVALUATION_DATA, QuestionEntry } from './evaluationData';

interface Exercise2DatasetProps {
  onSelectTraceQuestion?: (questionId: string) => void;
  onNavigateTab?: (tabIndex: number) => void;
}

const GROUP_PERFORMANCE_INSIGHTS: Record<string, { winner: string; score: string; why: string; tagColor: string }> = {
  "Group 1: Single-File Retrieval": {
    winner: "gemma3:4b",
    score: "47.1%",
    why: "Precise grounded extraction from single-file YAML snippets without prompt echoing or filler text.",
    tagColor: "text-[#38bdf8] border-[#0284c7]/40 bg-[#0284c7]/10"
  },
  "Group 2: Two-File Cross-Referencing": {
    winner: "gemma3:4b (46.4%) & codellama:7b (44.8%)",
    score: "46.4%",
    why: "Both models effectively cross-correlated disjoint auth specs (slack_dev_guide) with transactional endpoints.",
    tagColor: "text-[#a78bfa] border-[#7c3aed]/40 bg-[#7c3aed]/10"
  },
  "Group 3: Multi-File / Multi-Hop": {
    winner: "codellama:7b",
    score: "50.0%",
    why: "Larger 6.7B context memory preserves multi-step sequential dependencies (GitHub push -> CI/CD -> Slack).",
    tagColor: "text-[#fb7185] border-[#f43f5e]/40 bg-[#f43f5e]/10"
  },
  "Group 4: Retrieval Failure / Decoy": {
    winner: "gemma3:4b",
    score: "61.3%",
    why: "Superior adherence to negative constraints; explicitly noted missing data rather than hallucinating routes.",
    tagColor: "text-[#fbbf24] border-[#d97706]/40 bg-[#d97706]/10"
  },
  "Group 5: Code Generation": {
    winner: "gemma3:4b",
    score: "66.7%",
    why: "Clean self-contained Python scripts meeting exact test assertions without extraneous boilerplate.",
    tagColor: "text-[#34d399] border-[#10b981]/40 bg-[#10b981]/10"
  }
};

export function Exercise2Dataset({ onSelectTraceQuestion, onNavigateTab }: Exercise2DatasetProps) {
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedQuestion, setSelectedQuestion] = useState<QuestionEntry | null>(null);

  const questions = EVALUATION_DATA.exercise_2.questions;

  const groups = useMemo(() => [
    { id: 'all', label: 'All Questions', count: questions.length },
    { id: 'Group 1', label: 'Group 1: Single-File', count: questions.filter(q => q.group.includes('Group 1')).length },
    { id: 'Group 2', label: 'Group 2: Two-File Cross-Ref', count: questions.filter(q => q.group.includes('Group 2')).length },
    { id: 'Group 3', label: 'Group 3: Multi-Hop', count: questions.filter(q => q.group.includes('Group 3')).length },
    { id: 'Group 4', label: 'Group 4: Decoy & Failure', count: questions.filter(q => q.group.includes('Group 4')).length },
    { id: 'Group 5', label: 'Group 5: Code Generation', count: questions.filter(q => q.group.includes('Group 5')).length },
  ], [questions]);

  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      const matchesGroup = selectedGroup === 'all' || q.group.toLowerCase().includes(selectedGroup.toLowerCase());
      if (!matchesGroup) return false;

      if (!searchQuery.trim()) return true;
      const queryLower = searchQuery.toLowerCase();
      const textMatch = q.question.toLowerCase().includes(queryLower);
      const idMatch = q.id.toLowerCase().includes(queryLower);
      const tagMatch = q.tag.toLowerCase().includes(queryLower);
      const keywordMatch = q.expected_keywords.some(kw => kw.toLowerCase().includes(queryLower));
      const sourceMatch = q.expected_sources.some(src => src.toLowerCase().includes(queryLower));

      return textMatch || idMatch || tagMatch || keywordMatch || sourceMatch;
    });
  }, [questions, selectedGroup, searchQuery]);

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Exercise Briefing Header */}
      <div className="p-6 rounded-2xl bg-[#0d111a] border border-[#1d2436] space-y-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#60a5fa] text-xs font-mono font-bold">
              EXERCISE 2
            </span>
            <h2 className="text-lg font-bold text-[#f1f5f9] font-mono">
              Representative Evaluation Dataset &amp; Ground Truth
            </h2>
          </div>
          <span className="text-xs font-mono text-[#a78bfa] bg-[#a78bfa]/15 px-3 py-1 rounded-full border border-[#a78bfa]/30">
            26 Standardized Questions
          </span>
        </div>

        <blockquote className="border-l-2 border-[#3b82f6] pl-3 py-1.5 bg-[#080a0f] rounded-r text-xs text-[#94a3b8] font-mono leading-relaxed">
          &ldquo;Prepare approximately <strong>20–30 representative questions/tasks</strong> related to the actual use case of your application... The <strong>SAME questions/tasks must be used for ALL THREE MODELS</strong>.&rdquo;
          <span className="text-[#64748b] block mt-1">— Lab 4 Exercise 2 Specification</span>
        </blockquote>
      </div>

      {/* Dataset Summary Scorecards with Category Winners & Why */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {[
          { 
            groupKey: "Group 1: Single-File Retrieval",
            label: "Single-File Retrieval", 
            count: 7, 
            desc: "Exact BM25/Dense lookups", 
            color: "text-[#38bdf8] border-[#0284c7]/30",
            winner: "gemma3:4b (47.1%)",
            why: "Direct factual grounding in single YAML docs."
          },
          { 
            groupKey: "Group 2: Two-File Cross-Referencing",
            label: "Two-File Cross-Ref", 
            count: 7, 
            desc: "Relational cross-spec joins", 
            color: "text-[#a78bfa] border-[#7c3aed]/30",
            winner: "gemma3:4b / codellama:7b",
            why: "Correlating separate auth guides & endpoints."
          },
          { 
            groupKey: "Group 3: Multi-File / Multi-Hop",
            label: "Multi-Hop Reasoning", 
            count: 5, 
            desc: "3+ files pipeline chains", 
            color: "text-[#fb7185] border-[#f43f5e]/30",
            winner: "codellama:7b (50.0%)",
            why: "6.7B context retains multi-step sequence order."
          },
          { 
            groupKey: "Group 4: Retrieval Failure / Decoy",
            label: "Decoy & Failures", 
            count: 4, 
            desc: "Hard negatives & glossaries", 
            color: "text-[#fbbf24] border-[#d97706]/30",
            winner: "gemma3:4b (61.3%)",
            why: "Resists adversarial distractor documents."
          },
          { 
            groupKey: "Group 5: Code Generation",
            label: "Code Generation", 
            count: 3, 
            desc: "Executable Python & tests", 
            color: "text-[#34d399] border-[#059669]/30",
            winner: "gemma3:4b (66.7%)",
            why: "Executable scripts passing unit assertions."
          }
        ].map((cat, i) => (
          <div key={i} className={`p-3.5 rounded-xl bg-[#090c12] border ${cat.color} text-center space-y-2 flex flex-col justify-between`}>
            <div>
              <div className="text-[11px] font-mono text-[#64748b] truncate">{cat.label}</div>
              <div className={`text-xl font-bold font-mono ${cat.color.split(' ')[0]} mt-0.5`}>{cat.count}</div>
              <div className="text-[10px] text-[#475569] truncate">{cat.desc}</div>
            </div>
            <div className="pt-2 border-t border-[#161c28] text-left">
              <div className="text-[9.5px] font-mono font-bold text-[#10b981] truncate">
                🏆 Best: {cat.winner}
              </div>
              <div className="text-[9px] text-[#8b949e] font-sans line-clamp-2 mt-0.5">
                {cat.why}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#0a0d14] p-3 rounded-2xl border border-[#1a2233]">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 md:pb-0">
            {groups.map(grp => (
              <button
                key={grp.id}
                onClick={() => setSelectedGroup(grp.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  selectedGroup === grp.id
                    ? 'bg-[#1e2738] text-[#60a5fa] border border-[#3b82f6]/40 font-semibold shadow-sm'
                    : 'bg-[#10141e] text-[#8b949e] hover:text-[#e2e5ea] border border-[#161c28]'
                }`}
              >
                <span>{grp.label}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#080a0f] text-[#64748b]">
                  {grp.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[260px]">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search ID, text, keywords, specs..."
              className="w-full bg-[#10141e] border border-[#1a2233] focus:border-[#3b82f6]/60 rounded-xl px-3.5 py-1.5 text-xs text-[#e2e5ea] placeholder-[#475569] focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-[#64748b] hover:text-[#cbd5e1] text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Results Counter */}
        <div className="flex items-center justify-between text-xs font-mono text-[#64748b] px-1">
          <span>Showing {filteredQuestions.length} of {questions.length} questions</span>
          <span>Click any row for Ground Truth details</span>
        </div>
      </div>

      {/* Questions Interactive Table */}
      <div className="overflow-x-auto rounded-2xl border border-[#1a2233] bg-[#090c12] custom-scrollbar shadow-xl">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="bg-[#0e121a] border-b border-[#1a2233] text-[#64748b] uppercase tracking-wider text-[10.5px]">
              <th className="py-3 px-3 w-16">ID</th>
              <th className="py-3 px-3 w-32">Type Tag</th>
              <th className="py-3 px-4">Question Text</th>
              <th className="py-3 px-3 w-52">Expected Sources</th>
              <th className="py-3 px-3 w-52">Expected Keywords</th>
              <th className="py-3 px-3 w-28 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#141a26]">
            {filteredQuestions.map((q) => (
              <tr
                key={q.id}
                onClick={() => setSelectedQuestion(q)}
                className="hover:bg-[#101520] transition-colors cursor-pointer group"
              >
                {/* ID */}
                <td className="py-3 px-3 font-bold text-[#60a5fa]">
                  <span className="px-2 py-0.5 rounded bg-[#3b82f6]/10 border border-[#3b82f6]/20">
                    {q.id}
                  </span>
                </td>

                {/* Tag */}
                <td className="py-3 px-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${
                    q.tag.includes('FAILURE')
                      ? 'bg-[#ef4444]/10 text-[#f87171] border-[#ef4444]/30'
                      : q.tag.includes('CROSS-3+')
                      ? 'bg-[#f43f5e]/10 text-[#fb7185] border-[#f43f5e]/30'
                      : q.tag.includes('CROSS-2')
                      ? 'bg-[#a78bfa]/10 text-[#c084fc] border-[#a78bfa]/30'
                      : 'bg-[#0284c7]/10 text-[#38bdf8] border-[#0284c7]/30'
                  }`}>
                    {q.tag}
                  </span>
                </td>

                {/* Question Text */}
                <td className="py-3 px-4 text-[#cbd5e1] font-sans text-xs group-hover:text-white transition-colors leading-relaxed">
                  <div className="font-medium">{q.question}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {q.is_code_question && (
                      <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                        Code Gen (Q24-26)
                      </span>
                    )}
                    {q.exercise_5_candidate && (
                      <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-[#06b6d4]/15 text-[#22d3ee] border border-[#06b6d4]/30">
                        Ex 5 Trace
                      </span>
                    )}
                    {q.exercise_6_multihop && (
                      <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-[#f43f5e]/15 text-[#fb7185] border border-[#f43f5e]/30">
                        Ex 6 Multi-Hop
                      </span>
                    )}
                    {GROUP_PERFORMANCE_INSIGHTS[q.group] && (
                      <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-[#10b981]/10 text-[#34d399] border border-[#10b981]/25">
                        🏆 Best: {GROUP_PERFORMANCE_INSIGHTS[q.group].winner.split(' ')[0]}
                      </span>
                    )}
                  </div>
                </td>

                {/* Expected Sources */}
                <td className="py-3 px-3">
                  <div className="flex flex-wrap gap-1">
                    {q.expected_sources.map((src, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#131924] text-[#94a3b8] border border-[#1c2436] truncate max-w-[190px]"
                        title={src}
                      >
                        {src}
                      </span>
                    ))}
                  </div>
                </td>

                {/* Expected Keywords */}
                <td className="py-3 px-3">
                  <div className="flex flex-wrap gap-1">
                    {q.expected_keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-[#151d1a] text-[#34d399] border border-[#10b981]/25"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </td>

                {/* Action */}
                <td className="py-3 px-3 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedQuestion(q);
                    }}
                    className="text-[11px] font-mono text-[#60a5fa] hover:text-[#93c5fd] bg-[#141b28] hover:bg-[#1e273a] px-2.5 py-1 rounded-lg border border-[#232f48] transition-all cursor-pointer"
                  >
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Question Inspector Detail Drawer / Modal */}
      {selectedQuestion && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedQuestion(null)}
        >
          <div
            className="bg-[#0b0e14] border border-[#1f293d] rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#192132] pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/20 border border-[#3b82f6]/40 text-[#60a5fa] font-mono font-bold text-xs">
                  {selectedQuestion.id}
                </span>
                <h3 className="text-sm font-bold text-[#e2e5ea] font-mono">
                  {selectedQuestion.group}
                </h3>
              </div>
              <button
                onClick={() => setSelectedQuestion(null)}
                className="text-[#64748b] hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-[#64748b] uppercase tracking-wider text-[10.5px]">Standardized Developer Query:</span>
                <p className="text-sm font-sans font-medium text-[#f1f5f9] bg-[#07090e] p-3 rounded-xl border border-[#141a26]">
                  {selectedQuestion.question}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[#64748b] uppercase tracking-wider text-[10.5px]">Ground Truth Source Documents:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedQuestion.expected_sources.map((src, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-[#141b28] text-[#38bdf8] border border-[#1e2a40] text-xs">
                      📄 {src}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[#64748b] uppercase tracking-wider text-[10.5px]">Ground Truth Keywords &amp; Signatures:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedQuestion.expected_keywords.map((kw, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-[#111915] text-[#34d399] border border-[#10b981]/30 text-xs">
                      ✓ {kw}
                    </span>
                  ))}
                </div>
              </div>

              {GROUP_PERFORMANCE_INSIGHTS[selectedQuestion.group] && (
                <div className="p-3.5 rounded-xl bg-[#091218] border border-[#10b981]/30 space-y-1.5">
                  <div className="text-xs font-bold font-mono text-[#10b981] flex items-center gap-1.5">
                    <span>🏆 Best Model for this Question Group:</span>
                    <span className="text-white">{GROUP_PERFORMANCE_INSIGHTS[selectedQuestion.group].winner}</span>
                  </div>
                  <p className="text-[11.5px] text-[#94a3b8] font-sans leading-relaxed">
                    <strong className="text-[#cbd5e1]">Why it excelled:</strong> {GROUP_PERFORMANCE_INSIGHTS[selectedQuestion.group].why}
                  </p>
                </div>
              )}

              <div className="pt-2 border-t border-[#192132] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[#64748b]">Classification:</span>
                  <span className="text-[#e2e5ea]">{selectedQuestion.tag}</span>
                </div>

                {selectedQuestion.exercise_5_candidate && onNavigateTab && onSelectTraceQuestion && (
                  <button
                    onClick={() => {
                      onSelectTraceQuestion(selectedQuestion.id);
                      onNavigateTab(5);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-mono font-semibold transition-all cursor-pointer"
                  >
                    View in Ex 5 Trace Inspector →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
