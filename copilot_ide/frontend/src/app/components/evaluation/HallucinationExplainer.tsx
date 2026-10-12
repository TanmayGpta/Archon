"use client";
import React, { useState } from 'react';

interface HallucinationExplainerProps {
  children?: React.ReactNode;
  triggerText?: string;
  badgeCount?: number | string;
  compact?: boolean;
}

export function HallucinationExplainer({
  children,
  triggerText = "Hallucinations",
  badgeCount,
  compact = false
}: HallucinationExplainerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      <div 
        className="relative inline-block"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center gap-1.5 cursor-pointer text-left group transition-all ${
            compact 
              ? 'text-[11px] font-mono text-[#94a3b8] hover:text-[#60a5fa]' 
              : 'text-xs font-mono text-[#cbd5e1] hover:text-white'
          }`}
          title="Click to view detailed Hallucination Detection & Judge Anti-Hallucination Protocol"
        >
          {children ? children : (
            <>
              <span className="underline decoration-dotted decoration-[#60a5fa]/50 underline-offset-4 group-hover:decoration-[#60a5fa]">
                {triggerText}
              </span>
              {badgeCount !== undefined && (
                <span className="px-1.5 py-0.2 rounded bg-[#3b82f6]/15 text-[#60a5fa] border border-[#3b82f6]/30 font-bold text-[10px]">
                  {badgeCount}
                </span>
              )}
              <span className="text-[10px] text-[#60a5fa] bg-[#3b82f6]/10 px-1 rounded">ℹ</span>
            </>
          )}
        </button>

        {/* Hover Tooltip Card */}
        {isHovered && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 bg-[#0d121c] border border-[#2b374e] rounded-xl shadow-2xl z-50 pointer-events-none text-left animate-fade-in font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-[#1b2333] mb-2">
              <span className="text-[11px] font-mono font-bold text-[#60a5fa] flex items-center gap-1.5">
                <span>🛡️</span> Hallucination Architecture
              </span>
              <span className="text-[9px] font-mono text-[#10b981] bg-[#10b981]/15 px-1.5 py-0.5 rounded border border-[#10b981]/30">
                Verified
              </span>
            </div>
            <div className="space-y-2 text-[11px] leading-relaxed text-[#94a3b8]">
              <div>
                <strong className="text-[#f1f5f9] block font-mono text-[10.5px]">1. Detection Protocol:</strong>
                Regex scans model responses for HTTP endpoints and cross-checks them against our manifest of 74 genuine OpenAPI endpoints.
              </div>
              <div>
                <strong className="text-[#f1f5f9] block font-mono text-[10.5px]">2. Judge Anti-Hallucination:</strong>
                Judge runs at Temp=0.0 with golden reference keywords injected as hard anchors and enforces strict Chain-of-Thought JSON output.
              </div>
            </div>
            <div className="mt-2 pt-1.5 border-t border-[#1b2333] text-[9.5px] font-mono text-[#60a5fa] text-center">
              Click to view complete methodology &amp; architecture →
            </div>
          </div>
        )}
      </div>

      {/* Full Modal Dialog */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="bg-[#0c1018] border border-[#253047] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-6 shadow-2xl text-left"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#1b253b]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#3b82f6]/20 border border-[#3b82f6]/40 flex items-center justify-center text-[#60a5fa] text-xl">
                  🛡️
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#f1f5f9] font-mono">
                    Hallucination Detection &amp; Judge Safeguards
                  </h3>
                  <p className="text-xs text-[#64748b] font-mono">
                    Comprehensive methodology for measurement, grounding &amp; LLM-as-a-Judge reliability
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#141a28] hover:bg-[#1f283d] text-[#94a3b8] hover:text-white flex items-center justify-center transition-colors cursor-pointer text-sm font-mono"
              >
                ✕
              </button>
            </div>

            {/* Pillar 1: How We Detected Model Hallucinations */}
            <div className="p-5 rounded-xl bg-[#090d15] border border-[#1d273c] space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
                <h4 className="text-sm font-bold text-[#38bdf8] font-mono uppercase tracking-wide">
                  Pillar 1: Corpus Manifest Endpoint Verification
                </h4>
              </div>
              <p className="text-xs text-[#94a3b8] leading-relaxed">
                In API integrations, hallucinated endpoints cause catastrophic 404/500 production failures. We built a deterministic verification engine rather than guessing:
              </p>
              <div className="space-y-2 text-xs font-mono text-[#cbd5e1] pl-2 border-l-2 border-[#38bdf8]/40">
                <div>
                  <strong className="text-[#60a5fa]">1. Authoritative Corpus Extraction:</strong> Pre-extracted all 74 genuine HTTP endpoints across our 8 OpenAPI/Postman specs (<code className="text-[#38bdf8] bg-[#0c1322] px-1 py-0.5 rounded">corpus_loader.get_corpus_endpoints()</code>).
                </div>
                <div>
                  <strong className="text-[#60a5fa]">2. Regex Path Extraction:</strong> Scanned candidate model responses using regex to capture all declared routes: <code className="text-[#38bdf8] bg-[#0c1322] px-1 py-0.5 rounded">(?:GET|POST|PUT|DELETE)\s+(/[a-zA-Z0-9_\-/{}.]+)</code>.
                </div>
                <div>
                  <strong className="text-[#60a5fa]">3. Grounding Verification:</strong> If a model recommended a fictitious endpoint (e.g. <code className="text-[#f87171] bg-[#1a0f12] px-1 py-0.5 rounded">POST /orders/refund-all</code> not present in the spec), it was immediately flagged as a hallucination with the fabricated path logged in SQLite.
                </div>
              </div>
            </div>

            {/* Pillar 2: How We Prevented LLM-as-a-Judge from Hallucinating */}
            <div className="p-5 rounded-xl bg-[#090d15] border border-[#1d273c] space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                <h4 className="text-sm font-bold text-[#10b981] font-mono uppercase tracking-wide">
                  Pillar 2: LLM-as-a-Judge Anti-Hallucination Architecture
                </h4>
              </div>
              <p className="text-xs text-[#94a3b8] leading-relaxed">
                LLM judges can be prone to hallucinating their own opinions or generating arbitrary scores. We used four strict architectural controls in <code className="text-[#10b981] bg-[#0c1b14] px-1 py-0.5 rounded">judge.py</code>:
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-lg bg-[#06080d] border border-[#162033] space-y-1.5">
                  <div className="text-xs font-mono font-bold text-[#60a5fa] flex items-center gap-1.5">
                    <span>⚓ Ground-Truth Anchor Priming</span>
                  </div>
                  <p className="text-[11px] text-[#8b949e] leading-relaxed">
                    The judge is <strong>never asked open-ended questions</strong>. The expected reference facts &amp; keywords from the golden dataset are injected directly into the judge prompt as factual anchors.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#06080d] border border-[#162033] space-y-1.5">
                  <div className="text-xs font-mono font-bold text-[#10b981] flex items-center gap-1.5">
                    <span>❄️ Deterministic Decoding (Temp=0.0)</span>
                  </div>
                  <p className="text-[11px] text-[#8b949e] leading-relaxed">
                    Temperature is clamped to <strong>0.0</strong> to eliminate stochastic drift. The judge evaluates strictly deterministically without creative embellishments.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#06080d] border border-[#162033] space-y-1.5">
                  <div className="text-xs font-mono font-bold text-[#fbbf24] flex items-center gap-1.5">
                    <span>🧠 Forced Chain-of-Thought (CoT)</span>
                  </div>
                  <p className="text-[11px] text-[#8b949e] leading-relaxed">
                    The judge is required to produce a detailed rational sentence proving keyword presence before assigning a score: <code className="text-[10px] text-[#fbbf24] bg-[#161205] px-1 rounded">{`{"reason": "...", "score": 1.0}`}</code>.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#06080d] border border-[#162033] space-y-1.5">
                  <div className="text-xs font-mono font-bold text-[#a78bfa] flex items-center gap-1.5">
                    <span>🛡️ Syntax Fallback &amp; Clamping</span>
                  </div>
                  <p className="text-[11px] text-[#8b949e] leading-relaxed">
                    Output is strictly deserialized via Python <code className="text-[10px] text-[#a78bfa] bg-[#150f1f] px-1 rounded">json.loads</code> with score clamping [0.0, 1.0]. Any parse error triggers an automatic keyword fallback verification.
                  </p>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsOpen(false)}
                className="px-5 py-2 rounded-xl bg-[#1e2738] hover:bg-[#28354c] text-[#f1f5f9] text-xs font-mono font-semibold transition-all cursor-pointer"
              >
                Close Explanation
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
