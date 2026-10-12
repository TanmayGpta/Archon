"use client";
import React, { useState, useMemo } from 'react';
import { EVALUATION_DATA } from './evaluationData';

interface JsonDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JsonDataModal({ isOpen, onClose }: JsonDataModalProps) {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<'all' | 'exercise_1' | 'exercise_2' | 'exercise_3' | 'exercise_4' | 'exercise_5' | 'exercise_6'>('all');

  const jsonString = useMemo(() => {
    let dataToDisplay: any = EVALUATION_DATA;
    if (selectedSection !== 'all') {
      dataToDisplay = EVALUATION_DATA[selectedSection];
    }
    return JSON.stringify(dataToDisplay, null, 2);
  }, [selectedSection]);

  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return jsonString.split('\n');
    const queryLower = searchQuery.toLowerCase();
    return jsonString.split('\n').filter(line => line.toLowerCase().includes(queryLower));
  }, [jsonString, searchQuery]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(EVALUATION_DATA, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation_report_${EVALUATION_DATA.run_id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 md:p-8 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-[#0b0d12] border border-[#1e232e] rounded-2xl max-w-5xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#0e1118] border-b border-[#1a1e28] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#3b82f6]/15 border border-[#3b82f6]/30 flex items-center justify-center text-[#60a5fa]">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[#e2e5ea] font-mono">
                  evaluation_report.json
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 rounded-full font-semibold">
                  STATUS: {EVALUATION_DATA.status.toUpperCase()}
                </span>
              </div>
              <p className="text-[11px] font-mono text-[#64748b] mt-0.5">
                Run ID: {EVALUATION_DATA.run_id} • Evaluated 78 Runs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-lg text-xs font-mono bg-[#161b26] hover:bg-[#202738] text-[#94a3b8] hover:text-[#e2e5ea] border border-[#222a3a] transition-all flex items-center gap-1.5 cursor-pointer"
              title="Download Raw JSON File"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download</span>
            </button>

            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center gap-1.5 cursor-pointer border ${
                copied
                  ? 'bg-[#10b981]/20 text-[#10b981] border-[#10b981]/40'
                  : 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white border-[#3b82f6]/50'
              }`}
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Copied JSON</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy Full JSON</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-[#64748b] hover:text-[#e2e5ea] rounded-lg hover:bg-[#1a1e28] transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Section Filters & Search */}
        <div className="px-6 py-2.5 bg-[#090b0f] border-b border-[#161a22] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
            <span className="text-[#64748b] text-[11px] mr-1">Section:</span>
            {(['all', 'exercise_1', 'exercise_2', 'exercise_3', 'exercise_4', 'exercise_5', 'exercise_6'] as const).map(sec => (
              <button
                key={sec}
                onClick={() => setSelectedSection(sec)}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-all cursor-pointer whitespace-nowrap ${
                  selectedSection === sec
                    ? 'bg-[#1e293b] text-[#60a5fa] border border-[#3b82f6]/40 font-semibold'
                    : 'bg-[#12151c] text-[#8b949e] hover:text-[#cbd5e1] border border-[#1a1e26]'
                }`}
              >
                {sec === 'all' ? 'All (Full Root)' : sec.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search JSON text..."
              className="w-full bg-[#12151c] border border-[#1e232e] focus:border-[#3b82f6]/60 rounded-lg px-3 py-1 text-xs text-[#e2e5ea] placeholder-[#475569] focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1.5 text-[#64748b] hover:text-[#cbd5e1] text-[10px]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* JSON Code Window */}
        <div className="flex-1 p-4 bg-[#07080b] overflow-y-auto custom-scrollbar select-text font-mono text-[11.5px] leading-relaxed text-[#93c5fd]">
          {searchQuery ? (
            <div>
              <div className="text-[#64748b] mb-2 text-[11px]">
                Showing {filteredLines.length} matching lines for &ldquo;{searchQuery}&rdquo;:
              </div>
              <pre className="whitespace-pre-wrap">
                <code>
                  {filteredLines.join('\n')}
                </code>
              </pre>
            </div>
          ) : (
            <pre className="whitespace-pre">
              <code>{jsonString}</code>
            </pre>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-2.5 bg-[#0e1118] border-t border-[#1a1e28] flex items-center justify-between text-[11px] font-mono text-[#64748b]">
          <span>Generated: {new Date(EVALUATION_DATA.created_at).toLocaleString()}</span>
          <span>Archon Lab 4 Evaluation Inspector</span>
        </div>
      </div>
    </div>
  );
}
