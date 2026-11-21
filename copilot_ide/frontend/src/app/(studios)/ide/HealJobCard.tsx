"use client";
import React from 'react';
import { HealTraceView, type HealTraceEvent } from './HealTraceView';

export interface HealPreview {
  path: string;
  name: string;
  operation: 'modify' | 'create';
  before: string;
  after: string;
  summary: string;
}

export interface HealVerification {
  passed: boolean;
  health_before: number;
  health_after: number;
  violations_before: number;
  violations_after: number;
  resolved_violation_ids: string[];
  new_violation_ids: string[];
  syntax_errors: string[];
  guardrail_rejections: string[];
  tests_passed: boolean | null;
  test_output: string;
}

export interface HealReport {
  status: 'healed' | 'partial' | 'failed';
  codebase: string;
  blueprint_id: string;
  target_violation_ids: string[];
  skipped_violations: Array<{ id: string; reason: string }>;
  previews: HealPreview[];
  verification: HealVerification | null;
  attempts: number;
  summary: string;
}

export type PreviewStatus = 'pending' | 'applied' | 'rejected' | 'reverted';

const PIPELINE_STEPS = [
  { id: 'gather', label: 'Gather' },
  { id: 'plan', label: 'Plan' },
  { id: 'patch', label: 'Patch' },
  { id: 'verify', label: 'Verify' },
] as const;

interface HealJobCardProps {
  running: boolean;
  phase: string;
  events: HealTraceEvent[];
  error: string | null;
  report: HealReport | null;
  statuses: Record<string, PreviewStatus>;
  applying: boolean;
  onReview: (preview: HealPreview) => void;
  onOpenFile: (preview: HealPreview) => void;
  onAcceptOne: (preview: HealPreview) => void;
  onRejectOne: (preview: HealPreview) => void;
  onRevertOne: (preview: HealPreview) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onRevertAll: () => void;
  onHide: () => void;
}

/** Live LangGraph healing progress & diff-review card shown in the IDE Conformance panel. */
export function HealJobCard({
  running,
  phase,
  events,
  error,
  report,
  statuses,
  applying,
  onReview,
  onOpenFile,
  onAcceptOne,
  onRejectOne,
  onRevertOne,
  onAcceptAll,
  onRejectAll,
  onRevertAll,
  onHide,
}: HealJobCardProps) {
  const activeIdx = PIPELINE_STEPS.findIndex(s => s.id === phase || (phase === 'retry' && s.id === 'patch'));
  const previews = report?.previews || [];
  const visiblePreviews = previews.filter(p => statuses[p.path] !== 'reverted');
  const pendingCount = visiblePreviews.filter(p => (statuses[p.path] || 'pending') === 'pending').length;
  const appliedCount = visiblePreviews.filter(p => statuses[p.path] === 'applied').length;
  const revertedOnly = previews.length > 0 && visiblePreviews.length === 0;
  const ver = report?.verification;
  const failureReasons = ver && !ver.passed
    ? [
        ...(ver.syntax_errors || []),
        ...(ver.guardrail_rejections || []),
        ...(ver.new_violation_ids || []).map(id => `Introduced new violation: ${id}`),
        ...(ver.tests_passed === false && ver.test_output ? [`Tests failed: ${ver.test_output}`] : []),
      ]
    : [];
  const titleText = running
    ? 'Healing in Sandbox...'
    : revertedOnly
      ? 'Reverted to Pre-Heal'
      : report
        ? report.status === 'healed'
          ? 'Patches Verified'
          : report.status === 'partial'
            ? 'Partial Fix Ready'
            : 'Heal Failed'
        : 'Heal Failed';

  return (
    <div className="border border-emerald-500/40 rounded-control bg-canvas overflow-hidden space-y-2 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
          <span className={`w-2 h-2 rounded-full ${running ? 'bg-amber-400 animate-pulse' : revertedOnly ? 'bg-zinc-400' : error || report?.status === 'failed' ? 'bg-red-400' : 'bg-emerald-400'}`} />
          <span>{titleText}</span>
        </div>
        <button
          onClick={onHide}
          title="Collapse this card (keeps your trace and revert controls accessible)"
          className="text-[10px] text-fg-muted hover:text-fg px-1.5 py-0.5 rounded border border-line cursor-pointer"
        >
          Hide
        </button>
      </div>

      {/* Pipeline step bar */}
      <div className="grid grid-cols-4 gap-1">
        {PIPELINE_STEPS.map((step, idx) => {
          const isCurrent = running && activeIdx === idx;
          const isDone = !running ? Boolean(report) : activeIdx > idx || phase === 'awaiting_approval';
          return (
            <div
              key={step.id}
              className={`text-center py-0.5 rounded text-[10px] border ${
                isCurrent
                  ? 'bg-amber-500/20 text-amber-200 border-amber-400/50 font-bold'
                  : isDone
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-surface text-fg-muted border-line-subtle'
              }`}
            >
              {step.label}
            </div>
          );
        })}
      </div>

      {/* Live agai-style agent trace viewer */}
      {events.length > 0 && <HealTraceView events={events} running={running} />}

      {failureReasons.length > 0 && (
        <div className="text-[10px] text-red-200 bg-red-950/35 border border-red-500/35 rounded p-2 space-y-0.5">
          <div className="font-bold text-red-300 uppercase tracking-wider">Why Verification Failed</div>
          {failureReasons.slice(0, 3).map((r, i) => (
            <div key={i} className="break-words">{r}</div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-[11px] text-red-300 bg-red-950/30 border border-red-500/30 rounded p-2">
          {error}
        </div>
      )}

      {ver && (
        <div className="text-[11px] flex items-center justify-between bg-surface px-2 py-1 rounded border border-line-subtle">
          <span className="text-fg-subtle">
            Score: <span className="text-fg font-bold">{ver.health_before}%</span> →{' '}
            <span className={ver.health_after > ver.health_before ? 'text-emerald-400 font-bold' : 'text-fg font-bold'}>
              {ver.health_after}%
            </span>
          </span>
          <span className="text-fg-subtle">
            Tests: <span className={ver.tests_passed ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
              {ver.tests_passed ? 'Pass' : ver.tests_passed === false ? 'Fail' : '--'}
            </span>
          </span>
        </div>
      )}

      {report?.skipped_violations && report.skipped_violations.length > 0 && (
        <div className="text-[10px] text-fg-muted">
          Skipped {report.skipped_violations.length} violation(s): {report.skipped_violations[0].reason}
        </div>
      )}

      {/* Per-file diff review items */}
      {visiblePreviews.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-fg-subtle font-bold">
            Verified Patches ({visiblePreviews.length} file{visiblePreviews.length === 1 ? '' : 's'})
          </div>
          {visiblePreviews.map(preview => {
            const st = statuses[preview.path] || 'pending';
            return (
              <div
                key={preview.path}
                className="p-2 rounded bg-surface/80 border border-line-subtle space-y-1.5"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-fg font-semibold text-[11px] truncate" title={preview.path}>
                    {preview.path}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase flex-shrink-0 ${
                      st === 'applied'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : st === 'rejected' || st === 'reverted'
                          ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                          : preview.operation === 'create'
                            ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                            : 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
                    }`}
                  >
                    {st === 'pending' ? preview.operation : st}
                  </span>
                </div>

                {st === 'pending' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onReview(preview)}
                      disabled={applying}
                      className="flex-1 py-1 px-2 rounded bg-canvas hover:bg-raised text-fg border border-line text-[10px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Review Diff
                    </button>
                    <button
                      onClick={() => onAcceptOne(preview)}
                      disabled={applying}
                      className="py-1 px-2 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => onRejectOne(preview)}
                      disabled={applying}
                      className="py-1 px-2 rounded bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30 text-[10px] cursor-pointer disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {st === 'rejected' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onOpenFile(preview)}
                      disabled={applying}
                      className="flex-1 py-1 px-2 rounded bg-canvas hover:bg-raised text-fg border border-line text-[10px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Open
                    </button>
                  </div>
                )}

                {st === 'applied' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onOpenFile(preview)}
                      disabled={applying}
                      className="flex-1 py-1 px-2 rounded bg-canvas hover:bg-raised text-fg border border-line text-[10px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => onRevertOne(preview)}
                      disabled={applying || running}
                      title="Restore this file on disk to its pre-heal state"
                      className="py-1 px-2.5 rounded border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 text-[10px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Revert
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {(pendingCount > 0 || appliedCount > 0) && (
            <div className="flex items-center gap-1.5 pt-1">
              {pendingCount > 0 && (
                <>
                  <button
                    onClick={onAcceptAll}
                    disabled={applying}
                    className="flex-1 py-1.5 px-2 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[11px] cursor-pointer disabled:opacity-50"
                  >
                    {applying ? 'Applying...' : 'Accept All & Re-Audit'}
                  </button>
                  <button
                    onClick={onRejectAll}
                    disabled={applying}
                    className="py-1.5 px-2 rounded border border-red-500/40 text-red-300 hover:bg-red-500/15 text-[11px] cursor-pointer disabled:opacity-50"
                  >
                    Reject All
                  </button>
                </>
              )}
              {appliedCount > 0 && (
                <button
                  onClick={onRevertAll}
                  disabled={applying || running}
                  title="Restore modified files on disk and remove newly created files from this heal"
                  className={`${pendingCount === 0 ? 'w-full' : ''} py-1.5 px-2.5 rounded border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 font-bold text-[11px] cursor-pointer disabled:opacity-50`}
                >
                  {applying ? 'Reverting...' : `Revert All (${appliedCount})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
