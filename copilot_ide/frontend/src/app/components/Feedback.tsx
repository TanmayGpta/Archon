"use client";
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, useTopDialog } from './Dialog';
import { Icons } from './Icons';

/* -- Toasts and confirm dialogs for the whole app --------------------
 * toast(): for results that happen out of sight (a commit, a failed request).
 *   Errors stay until dismissed; everything else fades after a few seconds,
 *   paused while hovered or focused.
 * confirmDialog(): resolves true when the user picks the confirm button.
 */

type Tone = 'error' | 'warning' | 'success' | 'info';

export interface ToastOptions {
  tone?: Tone;
  title: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

export interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface Feedback {
  toast: (options: ToastOptions) => void;
  confirmDialog: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<Feedback | null>(null);

export function useFeedback(): Feedback {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}

type ToastItem = ToastOptions & { id: number };
const MAX_TOASTS = 4;

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const dismiss = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const [feedback] = useState<Feedback>(() => ({
    toast: options => {
      const id = nextId.current++;
      const item: ToastItem = { tone: 'info', ...options, id };
      setToasts(prev => [...prev, item].slice(-MAX_TOASTS));
    },
    confirmDialog: options =>
      new Promise<boolean>(resolve => {
        setPending({ ...options, resolve });
      }),
  }));

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={feedback}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      {pending && (
        <Dialog onClose={() => answer(false)} labelledBy="confirm-title">
          <div className="w-full max-w-md bg-surface border border-line-strong rounded-dialog shadow-raised p-5">
            <h2 id="confirm-title" className="text-lg font-semibold text-fg-strong">
              {pending.title}
            </h2>
            {pending.body && <div className="mt-2 text-base text-fg-muted">{pending.body}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                autoFocus
                onClick={() => answer(false)}
                className="px-3 py-1.5 rounded-control text-sm border border-line text-fg-soft hover:bg-raised cursor-pointer"
              >
                {pending.cancelLabel ?? 'Cancel'}
              </button>
              <button
                onClick={() => answer(true)}
                className={`px-3 py-1.5 rounded-control text-sm font-semibold cursor-pointer ${
                  pending.danger
                    ? 'bg-danger text-white hover:bg-danger/80'
                    : 'bg-accent-strong text-white hover:bg-accent-hover'
                }`}
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </FeedbackContext.Provider>
  );
}

const TONE_STYLE: Record<Tone, { bar: string; icon: string }> = {
  error: { bar: 'border-l-danger', icon: 'text-danger-fg' },
  warning: { bar: 'border-l-warning', icon: 'text-warning-fg' },
  success: { bar: 'border-l-success', icon: 'text-success-fg' },
  info: { bar: 'border-l-accent', icon: 'text-accent-fg' },
};

/* The stack is a manual popover, so it sits in the top layer above open dialogs.
 * While a modal is open it renders inside that modal: the rest of the page is
 * inert then, and a toast outside it could be seen but not clicked. */
function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const host = useTopDialog();
  const newest = toasts.at(-1)?.id;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.showPopover) return;
    if (el.matches(':popover-open')) el.hidePopover();
    if (newest !== undefined) el.showPopover(); // re-show so it lands above any dialog opened since
  }, [newest, host]);

  const stack = (
    <div
      ref={ref}
      popover="manual"
      aria-label="Notifications"
      className="fixed inset-auto bottom-4 right-4 m-0 p-0 border-0 bg-transparent overflow-visible w-[min(380px,calc(100vw-32px))] flex-col gap-2 [&:popover-open]:flex"
    >
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
  return host ? createPortal(stack, host) : stack;
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const tone = toast.tone ?? 'info';
  const [paused, setPaused] = useState(false);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (tone === 'error' || paused) return;
    const timer = setTimeout(() => dismissRef.current(), 5000);
    return () => clearTimeout(timer);
  }, [tone, paused]);

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`flex items-start gap-2.5 rounded-panel border border-line-strong border-l-4 ${TONE_STYLE[tone].bar} bg-overlay px-3 py-2.5 shadow-raised animate-fade-in`}
    >
      <span className={`mt-0.5 flex-shrink-0 ${TONE_STYLE[tone].icon}`}>
        {tone === 'success' ? <Icons.Check /> : tone === 'error' ? <Icons.Close /> : <Icons.Diagnostics />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-fg-strong">{toast.title}</p>
        {toast.detail && <p className="mt-0.5 text-sm text-fg-muted break-words">{toast.detail}</p>}
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.run();
              onDismiss();
            }}
            className="mt-1.5 text-sm font-medium text-accent-fg hover:underline cursor-pointer"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="flex-shrink-0 rounded-control p-0.5 text-fg-subtle hover:text-fg-soft cursor-pointer"
      >
        <Icons.Close />
      </button>
    </div>
  );
}
