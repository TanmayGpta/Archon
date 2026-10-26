"use client";
import React, { useState, useMemo } from 'react';
import { Dialog } from '../Dialog';
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
    <Dialog onClose={onClose} label="Raw JSON data" className="flex items-center justify-center p-4 md:p-8 animate-fade-in" backdrop="backdrop:bg-black/85 backdrop:backdrop-blur-md">
      <div 
        className="bg-surface border border-line rounded-2xl max-w-5xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-raised border-b border-line flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-fg">
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
                <h3 className="text-sm font-semibold text-fg font-mono">
                  evaluation_report.json
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 bg-success/15 text-success border border-success/30 rounded-full font-semibold">
                  STATUS: {EVALUATION_DATA.status.toUpperCase()}
                </span>
              </div>
              <p className="text-xs font-mono text-fg-subtle mt-0.5">
                Run ID: {EVALUATION_DATA.run_id} • Evaluated 78 Runs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-lg text-xs font-mono bg-overlay hover:bg-selected text-fg-muted hover:text-fg border border-line-strong transition-all flex items-center gap-1.5 cursor-pointer"
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
                  ? 'bg-success/20 text-success border-success/40'
                  : 'bg-accent-strong hover:bg-accent-hover text-white border-accent/50'
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

            <button aria-label="Close"
              onClick={onClose}
              className="p-1.5 text-fg-subtle hover:text-fg rounded-lg hover:bg-overlay transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Section Filters & Search */}
        <div className="px-6 py-2.5 bg-surface border-b border-line-subtle flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
            <span className="text-fg-subtle text-xs mr-1">Section:</span>
            {(['all', 'exercise_1', 'exercise_2', 'exercise_3', 'exercise_4', 'exercise_5', 'exercise_6'] as const).map(sec => (
              <button
                key={sec}
                onClick={() => setSelectedSection(sec)}
                className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer whitespace-nowrap ${
                  selectedSection === sec
                    ? 'bg-selected text-accent-fg border border-accent/40 font-semibold'
                    : 'bg-raised text-fg-muted hover:text-fg-soft border border-line'
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
              className="w-full bg-raised border border-line focus:border-accent/60 rounded-lg px-3 py-1 text-xs text-fg placeholder-fg-subtle focus:outline-none"
            />
            {searchQuery && (
              <button aria-label="Close"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1.5 text-fg-subtle hover:text-fg-soft text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* JSON Code Window */}
        <div className="flex-1 p-4 bg-canvas overflow-y-auto custom-scrollbar select-text font-mono text-sm leading-relaxed text-[#93c5fd]">
          {searchQuery ? (
            <div>
              <div className="text-fg-subtle mb-2 text-xs">
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
        <div className="px-6 py-2.5 bg-raised border-t border-line flex items-center justify-between text-xs font-mono text-fg-subtle">
          <span>Generated: {new Date(EVALUATION_DATA.created_at).toLocaleString()}</span>
          <span>Archon Lab 4 Evaluation Inspector</span>
        </div>
      </div>
    </Dialog>
  );
}
