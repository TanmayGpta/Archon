"use client";
import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react';

// Open modal dialogs, innermost last. Everything outside the top one is inert,
// so app-wide overlays (toasts) render inside it to stay clickable.
const openDialogs: HTMLDialogElement[] = [];
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const notify = () => listeners.forEach(fn => fn());

export function useTopDialog(): HTMLDialogElement | null {
  return useSyncExternalStore(subscribe, () => openDialogs.at(-1) ?? null, () => null);
}

/* -- Modal dialog on the native <dialog> element ---------------------
 * showModal() gives a focus trap, inert background, Esc and the top layer
 * for free. Esc and backdrop clicks call onClose; the parent decides whether
 * to close. Focus goes back to whatever had it before the dialog opened.
 *
 * The dialog fills the viewport; `className` lays out the panel inside it
 * (centred by default), so existing panel markup moves in unchanged.
 * Name it with `label` (aria-label) or `labelledBy` (id of its heading).
 */
export function Dialog({
  open = true,
  onClose,
  label,
  labelledBy,
  className = 'flex items-center justify-center p-4',
  backdrop = 'backdrop:bg-black/80 backdrop:backdrop-blur-sm',
  closeOnBackdrop = true,
  children,
}: {
  open?: boolean;
  onClose: () => void;
  label?: string;
  labelledBy?: string;
  className?: string;
  backdrop?: string;
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    openDialogs.push(dialog);
    notify();
    return () => {
      openDialogs.splice(openDialogs.indexOf(dialog), 1);
      notify();
      if (dialog.open) dialog.close();
      if (restoreTo?.isConnected) restoreTo.focus();
    };
  }, [open]);

  if (!open) return null;

  // Only a press that starts and ends on the backdrop closes; a text selection dragged out of the panel doesn't
  const isBackdrop = (e: React.MouseEvent) => e.target === e.currentTarget;

  return (
    <dialog
      ref={ref}
      aria-label={label}
      aria-labelledby={labelledBy}
      onCancel={e => {
        e.preventDefault();
        onClose();
      }}
      className={`fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-inherit ${backdrop}`}
    >
      <div
        className={`h-full w-full overflow-auto ${className}`}
        onMouseDown={e => {
          pressedOnBackdrop.current = isBackdrop(e);
        }}
        onClick={e => {
          if (closeOnBackdrop && pressedOnBackdrop.current && isBackdrop(e)) onClose();
        }}
      >
        {children}
      </div>
    </dialog>
  );
}
