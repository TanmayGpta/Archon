"use client";
import React, { useRef, useSyncExternalStore } from 'react';
import { clamp, clearSize, readSize, subscribeSizes, writeSize } from '@/lib/panelSize';

type Limits = { initial: number; min: number; max: number };

/* -- A panel size remembered across reloads --------------------------
 * The server render and the first client render use `initial`; the stored
 * size takes over right after hydration.
 */
export function usePanelSize(key: string, { initial, min, max }: Limits) {
  const stored = useSyncExternalStore(subscribeSizes, () => readSize(key, initial), () => initial);
  return {
    size: clamp(stored, min, max),
    setSize: (size: number) => writeSize(key, clamp(size, min, max)),
    reset: () => clearSize(key),
  };
}

// Literal class names so Tailwind generates them
const TONES = {
  accent: 'hover:bg-accent/60 focus-visible:bg-accent/60 active:bg-accent/60',
  conformance: 'hover:bg-[#e8ff00]/50 focus-visible:bg-[#e8ff00]/50 active:bg-[#e8ff00]/50',
};

/* -- Drag handle on one edge of a panel ------------------------------
 * `edge` is the side of the panel the handle sits on, so dragging away from
 * the panel makes it bigger. `max` may be a function, read when a drag or
 * key press starts, to keep room for the neighbouring panel.
 * Keyboard: arrows resize (Shift for bigger steps), Home/End jump to the
 * limits, double-click or Enter restores the default size.
 */
export function ResizeHandle({
  edge,
  size,
  min,
  max,
  onResize,
  onReset,
  label,
  tone = 'accent',
  className = '',
}: {
  edge: 'left' | 'right' | 'top';
  size: number;
  min: number;
  max: number | ((handle: HTMLElement) => number);
  onResize: (size: number) => void;
  onReset: () => void;
  label: string;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const drag = useRef<{ start: number; size: number; max: number } | null>(null);
  const vertical = edge === 'top';
  const sign = edge === 'left' || edge === 'top' ? -1 : 1;
  const staticMax = typeof max === 'number' ? max : undefined;
  const maxFor = (el: HTMLElement) => Math.max(min, typeof max === 'number' ? max : max(el));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: vertical ? e.clientY : e.clientX, size, max: maxFor(e.currentTarget) };
    document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = ((vertical ? e.clientY : e.clientX) - d.start) * sign;
    onResize(clamp(d.size + delta, min, d.max));
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const grow = vertical ? 'ArrowUp' : edge === 'left' ? 'ArrowLeft' : 'ArrowRight';
    const shrink = vertical ? 'ArrowDown' : edge === 'left' ? 'ArrowRight' : 'ArrowLeft';
    const step = e.shiftKey ? 64 : 16;
    const limit = maxFor(e.currentTarget);
    let next: number | null = null;
    if (e.key === grow) next = size + step;
    else if (e.key === shrink) next = size - step;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = limit;
    else if (e.key === 'Enter') {
      e.preventDefault();
      onReset();
      return;
    }
    if (next === null) return;
    e.preventDefault();
    onResize(clamp(next, min, limit));
  };

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'horizontal' : 'vertical'}
      aria-label={label}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={staticMax}
      tabIndex={0}
      title={`${label} (double-click to reset)`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={`relative z-20 flex-shrink-0 touch-none transition-colors ${TONES[tone]} ${
        vertical ? 'h-[6px] -my-[3px] w-full cursor-row-resize' : 'w-[6px] -mx-[3px] cursor-col-resize'
      } ${className}`}
    />
  );
}
