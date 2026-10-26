"use client";
import React, { useState } from 'react';
import { Glyph } from '../Icons';
import { Dialog } from '../Dialog';

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
              ? 'text-xs font-mono text-fg-muted hover:text-accent-fg' 
              : 'text-xs font-mono text-fg-soft hover:text-white'
          }`}
          title="Click to view detailed Hallucination Detection & Judge Anti-Hallucination Protocol"
        >
          {children ? children : (
            <>
              <span className="underline decoration-dotted decoration-accent-fg/50 underline-offset-4 group-hover:decoration-accent-fg">
                {triggerText}
              </span>
              {badgeCount !== undefined && (
                <span className="px-1.5 py-0.2 rounded-control bg-accent/15 text-accent-fg border border-accent/30 font-bold text-xs">
                  {badgeCount}
                </span>
              )}
              <span className="text-xs text-accent-fg bg-accent/10 px-1 rounded-control">ℹ</span>
            </>
          )}
        </button>

        {/* Hover Tooltip Card */}
        {isHovered && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3 bg-raised border border-[#2b374e] rounded-panel shadow-raised z-50 pointer-events-none text-left animate-fade-in font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-line-strong mb-2">
              <span className="text-xs font-mono font-bold text-accent-fg flex items-center gap-1.5">
                <span><Glyph name="shield" /></span> Hallucination Architecture
              </span>
              <span className="text-xs font-mono text-success bg-success/15 px-1.5 py-0.5 rounded-control border border-success/30">
                Verified
              </span>
            </div>
            <div className="space-y-2 text-xs leading-relaxed text-fg-muted">
              <div>
                <strong className="text-fg-strong block font-mono text-xs">1. Detection Protocol:</strong>
                Regex scans model responses for HTTP endpoints and cross-checks them against our manifest of 74 genuine OpenAPI endpoints.
              </div>
              <div>
                <strong className="text-fg-strong block font-mono text-xs">2. Judge Anti-Hallucination:</strong>
                Judge runs at Temp=0.0 with golden reference keywords injected as hard anchors and enforces strict Chain-of-Thought JSON output.
              </div>
            </div>
            <div className="mt-2 pt-1.5 border-t border-line-strong text-xs font-mono text-accent-fg text-center">
              Click to view complete methodology &amp; architecture →
            </div>
          </div>
        )}
      </div>

      {/* Full Modal Dialog */}
      {isOpen && (
        <Dialog onClose={() => setIsOpen(false)} label="How hallucination is measured" className="flex items-center justify-center p-4 animate-fade-in" backdrop="backdrop:bg-black/80 backdrop:backdrop-blur-sm">
          <div 
            className="bg-surface border border-line-strong rounded-dialog max-w-2xl w-full max-h-[85vh] overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-6 shadow-raised text-left"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-line-strong">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-panel bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-fg text-xl">
                  <Glyph name="shield" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-fg-strong font-mono">
                    Hallucination Detection &amp; Judge Safeguards
                  </h3>
                  <p className="text-xs text-fg-subtle font-mono">
                    Comprehensive methodology for measurement, grounding &amp; LLM-as-a-Judge reliability
                  </p>
                </div>
              </div>
              <button aria-label="Close"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-control bg-overlay hover:bg-selected text-fg-muted hover:text-white flex items-center justify-center transition-colors cursor-pointer text-sm font-mono"
              >
                ✕
              </button>
            </div>

            {/* Pillar 1: How We Detected Model Hallucinations */}
            <div className="p-5 rounded-panel bg-surface border border-line-strong space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-info" />
                <h4 className="text-sm font-bold text-info font-mono uppercase tracking-wide">
                  Pillar 1: Corpus Manifest Endpoint Verification
                </h4>
              </div>
              <p className="text-xs text-fg-muted leading-relaxed">
                In API integrations, hallucinated endpoints cause catastrophic 404/500 production failures. We built a deterministic verification engine rather than guessing:
              </p>
              <div className="space-y-2 text-xs font-mono text-fg-soft pl-2 border-l-2 border-info/40">
                <div>
                  <strong className="text-accent-fg">1. Authoritative Corpus Extraction:</strong> Pre-extracted all 74 genuine HTTP endpoints across our 8 OpenAPI/Postman specs (<code className="text-info bg-raised px-1 py-0.5 rounded-control">corpus_loader.get_corpus_endpoints()</code>).
                </div>
                <div>
                  <strong className="text-accent-fg">2. Regex Path Extraction:</strong> Scanned candidate model responses using regex to capture all declared routes: <code className="text-info bg-raised px-1 py-0.5 rounded-control">(?:GET|POST|PUT|DELETE)\s+(/[a-zA-Z0-9_\-/{}.]+)</code>.
                </div>
                <div>
                  <strong className="text-accent-fg">3. Grounding Verification:</strong> If a model recommended a fictitious endpoint (e.g. <code className="text-danger-fg bg-surface px-1 py-0.5 rounded-control">POST /orders/refund-all</code> not present in the spec), it was immediately flagged as a hallucination with the fabricated path logged in SQLite.
                </div>
              </div>
            </div>

            {/* Pillar 2: How We Prevented LLM-as-a-Judge from Hallucinating */}
            <div className="p-5 rounded-panel bg-surface border border-line-strong space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success" />
                <h4 className="text-sm font-bold text-success font-mono uppercase tracking-wide">
                  Pillar 2: LLM-as-a-Judge Anti-Hallucination Architecture
                </h4>
              </div>
              <p className="text-xs text-fg-muted leading-relaxed">
                LLM judges can be prone to hallucinating their own opinions or generating arbitrary scores. We used four strict architectural controls in <code className="text-success bg-raised px-1 py-0.5 rounded-control">judge.py</code>:
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-panel bg-canvas border border-line space-y-1.5">
                  <div className="text-xs font-mono font-bold text-accent-fg flex items-center gap-1.5">
                    <span><Glyph name="anchor" /> Ground-Truth Anchor Priming</span>
                  </div>
                  <p className="text-xs text-fg-muted leading-relaxed">
                    The judge is <strong>never asked open-ended questions</strong>. The expected reference facts &amp; keywords from the golden dataset are injected directly into the judge prompt as factual anchors.
                  </p>
                </div>

                <div className="p-3.5 rounded-panel bg-canvas border border-line space-y-1.5">
                  <div className="text-xs font-mono font-bold text-success flex items-center gap-1.5">
                    <span><Glyph name="snowflake" /> Deterministic Decoding (Temp=0.0)</span>
                  </div>
                  <p className="text-xs text-fg-muted leading-relaxed">
                    Temperature is clamped to <strong>0.0</strong> to eliminate stochastic drift. The judge evaluates strictly deterministically without creative embellishments.
                  </p>
                </div>

                <div className="p-3.5 rounded-panel bg-canvas border border-line space-y-1.5">
                  <div className="text-xs font-mono font-bold text-warning-fg flex items-center gap-1.5">
                    <span><Glyph name="brain" /> Forced Chain-of-Thought (CoT)</span>
                  </div>
                  <p className="text-xs text-fg-muted leading-relaxed">
                    The judge is required to produce a detailed rational sentence proving keyword presence before assigning a score: <code className="text-xs text-warning-fg bg-surface px-1 rounded-control">{`{"reason": "...", "score": 1.0}`}</code>.
                  </p>
                </div>

                <div className="p-3.5 rounded-panel bg-canvas border border-line space-y-1.5">
                  <div className="text-xs font-mono font-bold text-ai flex items-center gap-1.5">
                    <span><Glyph name="shield" /> Syntax Fallback &amp; Clamping</span>
                  </div>
                  <p className="text-xs text-fg-muted leading-relaxed">
                    Output is strictly deserialized via Python <code className="text-xs text-ai bg-raised px-1 rounded-control">json.loads</code> with score clamping [0.0, 1.0]. Any parse error triggers an automatic keyword fallback verification.
                  </p>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsOpen(false)}
                className="px-5 py-2 rounded-control bg-selected hover:bg-selected text-fg-strong text-xs font-mono font-semibold transition-all cursor-pointer"
              >
                Close Explanation
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
