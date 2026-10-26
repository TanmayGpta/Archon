"use client";
import React from 'react';

/* -- Shared empty / error / loading views ----------------------------
 * ErrorState: what failed, which service, and a Retry button.
 * Skeleton: grey bars shaped like the content that is loading.
 */

export function ErrorState({
  title,
  detail,
  onRetry,
  compact = false,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div role="alert" className={`flex flex-col gap-2 ${compact ? 'p-3' : 'p-6 items-center text-center'}`}>
      <p className="text-sm font-medium text-danger-fg">{title}</p>
      {detail && <p className="text-xs text-fg-muted break-words">{detail}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className={`${compact ? 'self-start' : ''} px-2.5 py-1 rounded-control text-xs border border-line text-fg-soft hover:bg-raised hover:border-line-strong cursor-pointer`}
        >
          Retry
        </button>
      )}
    </div>
  );
}

/** Rows of bars; `widths` are percentages so each row looks like a different-length name. */
export function Skeleton({
  rows = 6,
  widths = [70, 55, 85, 40, 65, 50, 75, 45],
  indent = false,
  label = 'Loading',
  padded = true,
  className = '',
}: {
  rows?: number;
  widths?: number[];
  indent?: boolean;
  label?: string;
  padded?: boolean;
  className?: string;
}) {
  return (
    <div role="status" aria-label={label} className={`flex flex-col gap-2.5 ${padded ? 'p-3' : ''} ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-3 rounded-control bg-raised animate-pulse"
          style={{ width: `${widths[i % widths.length]}%`, marginLeft: indent && i % 3 !== 0 ? 14 : 0 }}
        />
      ))}
    </div>
  );
}
