"use client";

/**
 * LlmSetupModal — first-launch onboarding + "LLM Settings" re-entrant modal.
 *
 * Shows automatically on first visit (localStorage key "arcgen:llm:configured").
 * Can also be opened at any time via the ⚙ button in the ArcGenStudio toolbar.
 *
 * Mode A – Local (Ollama): pings the Ollama health endpoint, shows available
 *           models, and saves provider = "ollama" to the ArcGen settings API.
 * Mode B – API: shows Groq + OmniKey key fields (same logic as ArcGenLlmSettings
 *           but surfaced more prominently with a guided flow).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";

// ── types ──────────────────────────────────────────────────────────────────────

type ProviderId = "omnikey" | "groq" | "ollama";
type Choice = "auto" | ProviderId;

interface ProviderStatus {
  label: string;
  needs_key: boolean;
  configured: boolean;
  key_source: "ui" | "env" | null;
  masked_key: string;
  model: string;
  default_model: string;
  model_is_default: boolean;
  host?: string;
}

interface LlmStatus {
  provider: Choice;
  providers: Record<ProviderId, ProviderStatus>;
  chain: { provider: ProviderId; model: string }[];
  error: string | null;
}

interface TestResult {
  ok: boolean;
  message: string;
  latency_ms: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const CONFIGURED_KEY = "arcgen:llm:configured";

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.text();
      const j = JSON.parse(body);
      detail = j?.detail ?? body.slice(0, 200);
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ── sub-components ─────────────────────────────────────────────────────────────

function StatusDot({ ok, loading }: { ok?: boolean; loading?: boolean }) {
  if (loading) return <span className="w-2 h-2 rounded-full bg-info/60 animate-pulse inline-block" />;
  if (ok === undefined) return <span className="w-2 h-2 rounded-full bg-fg-subtle inline-block" />;
  return <span className={`w-2 h-2 rounded-full inline-block ${ok ? "bg-success-fg" : "bg-warning-fg"}`} />;
}

// ── main component ─────────────────────────────────────────────────────────────

export interface LlmSetupModalProps {
  /** Base URL for the ArcGen service, e.g. http://localhost:8004 */
  apiBase: string;
  /**
   * Force the modal open (e.g. from a settings button).
   * When false the modal auto-opens only on first visit.
   */
  forceOpen?: boolean;
  /** Called when the modal is closed / dismissed. */
  onClose?: () => void;
}

type Mode = "local" | "api" | null; // null = not chosen yet (welcome screen)

export function LlmSetupModal({ apiBase, forceOpen, onClose }: LlmSetupModalProps) {
  const base = `${apiBase}/api/arcgen/llm`;

  // ── visibility ──────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (forceOpen) { setOpen(true); return; }
    // Show on first visit only
    try {
      if (!localStorage.getItem(CONFIGURED_KEY)) setOpen(true);
    } catch { setOpen(true); }
  }, [forceOpen]);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(CONFIGURED_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
    onClose?.();
  }, [onClose]);

  // ── step state ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>(null);
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Groq / OmniKey key inputs
  const [groqKey, setGroqKey] = useState("");
  const [omniKey, setOmniKey] = useState("");
  const [saveStatus, setSaveStatus] = useState<Record<string, string>>({});

  // Test results per provider
  const [testGroq, setTestGroq] = useState<TestResult | null>(null);
  const [testOmni, setTestOmni] = useState<TestResult | null>(null);
  const [testOllama, setTestOllama] = useState<TestResult | null>(null);

  // Ollama models list
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  // ── load current status on open ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setError("");

    // Read stored keys from browser localStorage
    let storedGroq = "";
    let storedOmni = "";
    try {
      storedGroq = localStorage.getItem("archon:key:groq") || "";
      storedOmni = localStorage.getItem("archon:key:omnikey") || "";
      if (storedGroq) setGroqKey(storedGroq);
      if (storedOmni) setOmniKey(storedOmni);
    } catch {}

    apiFetch<LlmStatus>(base)
      .then(async s => {
        // If keys exist in localStorage but not on server (e.g. after container restart), auto-restore
        if (storedGroq && !s.providers.groq.configured) {
          try {
            s = await apiFetch<LlmStatus>(`${base}/keys/groq`, {
              method: "PUT",
              body: JSON.stringify({ api_key: storedGroq.trim() }),
            });
          } catch {}
        }
        if (storedOmni && !s.providers.omnikey.configured) {
          try {
            s = await apiFetch<LlmStatus>(`${base}/keys/omnikey`, {
              method: "PUT",
              body: JSON.stringify({ api_key: storedOmni.trim() }),
            });
          } catch {}
        }

        setStatus(s);
        // Pre-detect mode from saved provider
        if (s.provider === "ollama") setMode("local");
        else if (s.provider !== "auto" || s.providers.groq.configured || s.providers.omnikey.configured) setMode("api");
      })
      .catch(() => { /* service may not be up yet */ });
  }, [open, base]);

  // ── actions ─────────────────────────────────────────────────────────────────
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  /** Save a key then reload status */
  const saveKey = async (provider: ProviderId, key: string) => {
    const s = await apiFetch<LlmStatus>(`${base}/keys/${provider}`, {
      method: "PUT",
      body: JSON.stringify({ api_key: key.trim() }),
    });
    try {
      localStorage.setItem(`archon:key:${provider}`, key.trim());
    } catch {}
    setStatus(s);
  };

  const handleSaveGroq = () => run(async () => {
    if (!groqKey.trim()) return;
    await saveKey("groq", groqKey);
    setSaveStatus(prev => ({ ...prev, groq: "Saved!" }));
    setTimeout(() => setSaveStatus(prev => ({ ...prev, groq: "" })), 3000);
  });

  const handleSaveOmni = () => run(async () => {
    if (!omniKey.trim()) return;
    await saveKey("omnikey", omniKey);
    setSaveStatus(prev => ({ ...prev, omnikey: "Saved!" }));
    setTimeout(() => setSaveStatus(prev => ({ ...prev, omnikey: "" })), 3000);
  });

  /** Set active provider and reload status */
  const setProvider = async (provider: Choice) => {
    const s = await apiFetch<LlmStatus>(base, {
      method: "PUT",
      body: JSON.stringify({ provider }),
    });
    setStatus(s);
  };

  const testProvider = async (provider: ProviderId, key?: string): Promise<TestResult> => {
    return apiFetch<TestResult>(`${base}/test`, {
      method: "POST",
      body: JSON.stringify({ provider, api_key: key?.trim() || null }),
    });
  };

  const handleTestOllama = () => run(async () => {
    setTestOllama(null);
    setOllamaModels(null);
    const t = await testProvider("ollama");
    setTestOllama(t);
    if (t.ok) {
      const r = await apiFetch<{ models: string[] }>(`${base}/models/ollama`);
      setOllamaModels(r.models);
    }
  });

  const handleTestGroq = () => run(async () => {
    setTestGroq(null);
    const t = await testProvider("groq", groqKey || undefined);
    setTestGroq(t);
  });

  const handleTestOmni = () => run(async () => {
    setTestOmni(null);
    const t = await testProvider("omnikey", omniKey || undefined);
    setTestOmni(t);
  });

  /** Final confirmation: save keys + set provider, then close */
  const confirmLocal = () => run(async () => {
    await setProvider("ollama");
    dismiss();
  });

  const confirmApi = () => run(async () => {
    // Save whichever keys were entered
    if (groqKey.trim()) await saveKey("groq", groqKey);
    if (omniKey.trim()) await saveKey("omnikey", omniKey);
    // Reload to pick up configured flags
    const s = await apiFetch<LlmStatus>(base);
    setStatus(s);
    // Set provider: prefer groq if configured, else omnikey, else auto
    const provider: Choice = s.providers.groq.configured ? "groq"
      : s.providers.omnikey.configured ? "omnikey"
      : "auto";
    await setProvider(provider);
    dismiss();
  });

  // ── keyboard close (Escape) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, dismiss]);

  if (!open) return null;

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="LLM Setup"
      onClick={e => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg mx-4 bg-surface border border-line-strong rounded-panel shadow-2xl flex flex-col"
        style={{ maxHeight: "calc(100vh - 48px)" }}
      >
        {/* ── header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line-strong shrink-0">
          <div>
            <h2 className="font-mono font-bold text-fg-strong text-sm uppercase tracking-wider">
              LLM Setup
            </h2>
            <p className="text-xs text-fg-muted mt-0.5">
              Choose how Archon should power its AI generation &amp; jury.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-fg-subtle hover:text-fg-strong cursor-pointer text-lg leading-none px-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── scrollable body ── */}
        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* ── STEP 1: mode picker ── */}
          {mode === null && (
            <WelcomeScreen onPick={setMode} />
          )}

          {/* ── STEP 2a: LOCAL mode ── */}
          {mode === "local" && (
            <LocalPanel
              ollamaHost={status?.providers?.ollama?.host}
              testResult={testOllama}
              ollamaModels={ollamaModels}
              busy={busy}
              onTest={handleTestOllama}
              onBack={() => setMode(null)}
            />
          )}

          {/* ── STEP 2b: API mode ── */}
          {mode === "api" && (
            <ApiPanel
              status={status}
              groqKey={groqKey}
              omniKey={omniKey}
              testGroq={testGroq}
              testOmni={testOmni}
              busy={busy}
              saveStatus={saveStatus}
              onGroqKeyChange={setGroqKey}
              onOmniKeyChange={setOmniKey}
              onTestGroq={handleTestGroq}
              onTestOmni={handleTestOmni}
              onSaveGroq={handleSaveGroq}
              onSaveOmni={handleSaveOmni}
              onBack={() => setMode(null)}
            />
          )}

          {error && (
            <div className="text-xs text-danger-fg bg-danger/10 border border-danger/30 rounded-control px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* ── footer ── */}
        {mode !== null && (
          <div className="px-5 py-4 border-t border-line-strong flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-fg-subtle hover:text-fg-strong cursor-pointer"
            >
              Skip for now
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={mode === "local" ? confirmLocal : confirmApi}
              className="px-4 py-2 rounded-control bg-info-strong text-white text-xs font-semibold hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {busy && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {mode === "local" ? "Use Local Ollama" : "Save & Use API"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WelcomeScreen ─────────────────────────────────────────────────────────────

function WelcomeScreen({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted text-center">
        How would you like to run the AI models?
      </p>
      <div className="grid grid-cols-2 gap-3">
        <ModeCard
          emoji="🏠"
          title="Local (Ollama)"
          subtitle="Run models on your own machine. Free &amp; private — needs Ollama installed."
          highlights={["No API keys needed", "Fully offline", "Needs GPU / CPU RAM"]}
          onClick={() => onPick("local")}
        />
        <ModeCard
          emoji="☁️"
          title="Cloud API"
          subtitle="Use Groq or OmniKey. Fast, no GPU needed — pay-per-token or free tier."
          highlights={["Groq free tier available", "Instant setup", "Tokens consumed per run"]}
          onClick={() => onPick("api")}
        />
      </div>
      <p className="text-xs text-fg-subtle text-center">
        You can change this any time from the ⚙ settings button.
      </p>
    </div>
  );
}

function ModeCard({
  emoji, title, subtitle, highlights, onClick,
}: {
  emoji: string; title: string; subtitle: string; highlights: string[]; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 p-4 rounded-panel border-2 border-line-strong hover:border-info/60 hover:bg-info/5 cursor-pointer text-left transition-colors"
    >
      <span className="text-2xl">{emoji}</span>
      <span className="font-semibold text-fg-strong text-sm">{title}</span>
      <span className="text-xs text-fg-muted leading-snug">{subtitle}</span>
      <ul className="mt-1 flex flex-col gap-0.5">
        {highlights.map(h => (
          <li key={h} className="text-xs text-fg-subtle flex gap-1.5 items-start">
            <span className="text-info shrink-0 mt-px">✓</span>
            {h}
          </li>
        ))}
      </ul>
    </button>
  );
}

// ── LocalPanel ────────────────────────────────────────────────────────────────

function LocalPanel({
  ollamaHost, testResult, ollamaModels, busy, onTest, onBack,
}: {
  ollamaHost?: string;
  testResult: TestResult | null;
  ollamaModels: string[] | null;
  busy: boolean;
  onTest: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-xs text-fg-subtle hover:text-fg-strong cursor-pointer">
          ← Back
        </button>
        <h3 className="font-semibold text-fg-strong text-sm">🏠 Local Ollama Setup</h3>
      </div>

      <div className="bg-raised border border-line-strong rounded-panel p-3 flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-fg-muted font-mono">Ollama endpoint</span>
          <span className="font-mono text-fg-strong">{ollamaHost ?? "http://localhost:11434"}</span>
        </div>
        <p className="text-fg-subtle">
          Make sure Ollama is running and you have at least one model pulled.
          The jury needs 3–5 models (e.g. <code className="bg-raised border border-line-strong rounded px-1">ollama pull llama3.2:3b</code>).
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={busy}
          className="px-3 py-1.5 rounded-control border border-line-strong text-xs text-fg-soft hover:text-info cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy && <span className="w-3 h-3 border-2 border-fg-subtle/40 border-t-fg-subtle rounded-full animate-spin" />}
          Test connection
        </button>
        {testResult && (
          <span className={`text-xs font-mono flex items-center gap-1.5 ${testResult.ok ? "text-success-fg" : "text-warning-fg"}`}>
            <StatusDot ok={testResult.ok} />
            {testResult.message} · {testResult.latency_ms} ms
          </span>
        )}
      </div>

      {ollamaModels !== null && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted font-mono uppercase tracking-wider">
            Available models ({ollamaModels.length})
          </span>
          {ollamaModels.length === 0 ? (
            <p className="text-xs text-warning-fg">
              No models found. Pull some with <code className="bg-raised border border-line-strong rounded px-1">ollama pull &lt;model&gt;</code>.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {ollamaModels.map(m => (
                <span key={m} className="px-2 py-0.5 rounded-control bg-raised border border-line-strong text-xs font-mono text-fg-soft">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-info/5 border border-info/20 rounded-panel px-3 py-2 text-xs text-fg-muted">
        <strong className="text-fg-strong">Jury note:</strong> The bias jury runs 5 models concurrently.
        On a single GPU, calls are serialised automatically (semaphore = 1).
        You can raise <code className="font-mono">JURY_MAX_CONCURRENT</code> in .env if you have more VRAM.
      </div>
    </div>
  );
}

// ── ApiPanel ──────────────────────────────────────────────────────────────────

function ApiPanel({
  status, groqKey, omniKey, testGroq, testOmni, busy, saveStatus,
  onGroqKeyChange, onOmniKeyChange, onTestGroq, onTestOmni, onSaveGroq, onSaveOmni, onBack,
}: {
  status: LlmStatus | null;
  groqKey: string;
  omniKey: string;
  testGroq: TestResult | null;
  testOmni: TestResult | null;
  busy: boolean;
  saveStatus?: Record<string, string>;
  onGroqKeyChange: (v: string) => void;
  onOmniKeyChange: (v: string) => void;
  onTestGroq: () => void;
  onTestOmni: () => void;
  onSaveGroq?: () => void;
  onSaveOmni?: () => void;
  onBack: () => void;
}) {
  const groqConfigured = status?.providers?.groq?.configured;
  const groqMasked = status?.providers?.groq?.masked_key;
  const omniConfigured = status?.providers?.omnikey?.configured;
  const omniMasked = status?.providers?.omnikey?.masked_key;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-xs text-fg-subtle hover:text-fg-strong cursor-pointer">
          ← Back
        </button>
        <h3 className="font-semibold text-fg-strong text-sm">☁️ Cloud API Setup</h3>
      </div>

      {/* Groq card */}
      <ApiKeyCard
        label="Groq Cloud"
        badge="Free tier · recommended"
        badgeColor="text-success-fg"
        helpUrl="https://console.groq.com/keys"
        helpText="Get a free Groq API key"
        placeholder="gsk_..."
        configured={!!groqConfigured}
        maskedKey={groqMasked}
        value={groqKey}
        testResult={testGroq}
        busy={busy}
        savedLabel={saveStatus?.groq}
        onChange={onGroqKeyChange}
        onTest={onTestGroq}
        onSave={onSaveGroq}
      />

      {/* OmniKey card */}
      <ApiKeyCard
        label="OmniKey (Gemini gateway)"
        badge="Unified key for Gemini models"
        badgeColor="text-info"
        helpUrl="https://omnikey-ai-unified-key-manager.onrender.com"
        helpText="Get OmniKey"
        placeholder="ok_..."
        configured={!!omniConfigured}
        maskedKey={omniMasked}
        value={omniKey}
        testResult={testOmni}
        busy={busy}
        savedLabel={saveStatus?.omnikey}
        onChange={onOmniKeyChange}
        onTest={onTestOmni}
        onSave={onSaveOmni}
      />

      <div className="bg-info/5 border border-info/20 rounded-panel px-3 py-2 text-xs text-fg-muted">
        <strong className="text-fg-strong">Token tips:</strong> The jury uses small fast models (8B) with
        a 512-token output cap — cost is minimal. Groq's free tier supports ~1 000 jury sittings/day.
        Keys are stored server-side and only returned masked.
      </div>
    </div>
  );
}

function ApiKeyCard({
  label, badge, badgeColor, helpUrl, helpText,
  placeholder, configured, maskedKey, value, testResult, busy, savedLabel,
  onChange, onTest, onSave,
}: {
  label: string; badge: string; badgeColor: string; helpUrl: string; helpText: string;
  placeholder: string; configured: boolean; maskedKey?: string;
  value: string; testResult: TestResult | null; busy: boolean; savedLabel?: string;
  onChange: (v: string) => void; onTest: () => void; onSave?: () => void;
}) {
  return (
    <div className="border border-line-strong rounded-panel p-3 flex flex-col gap-2 bg-raised">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-strong">{label}</span>
        <span className={`text-xs ${badgeColor}`}>{badge}</span>
      </div>

      {configured && !value && (
        <div className="flex items-center gap-1.5 text-xs text-success-fg">
          <StatusDot ok={true} />
          Key saved: {maskedKey}
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={configured ? "Paste a new key to replace it" : placeholder}
          disabled={busy}
          className="flex-1 min-w-0 bg-surface border border-line-strong rounded-control px-2 py-1.5 text-xs font-mono text-fg-strong placeholder-fg-subtle focus:outline-none focus:border-info/60"
        />
        <button
          type="button"
          onClick={onTest}
          disabled={busy || (!configured && !value.trim())}
          className="px-2.5 py-1.5 rounded-control border border-line-strong text-xs text-fg-soft hover:text-info cursor-pointer disabled:opacity-50 flex items-center gap-1"
        >
          {busy && <span className="w-2.5 h-2.5 border-2 border-fg-subtle/40 border-t-fg-subtle rounded-full animate-spin" />}
          Test
        </button>
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !value.trim()}
            className="px-3 py-1.5 rounded-control bg-info-strong text-white text-xs font-semibold hover:brightness-110 cursor-pointer disabled:opacity-40 flex items-center gap-1"
          >
            {savedLabel || "Save"}
          </button>
        )}
      </div>

      {savedLabel && (
        <div className="text-xs font-mono text-success-fg flex items-center gap-1">
          <span>✓</span> Key saved securely to server and browser!
        </div>
      )}

      {testResult && (
        <div className={`text-xs font-mono flex items-center gap-1.5 ${testResult.ok ? "text-success-fg" : "text-warning-fg"}`}>
          <StatusDot ok={testResult.ok} />
          {testResult.message} · {testResult.latency_ms} ms
        </div>
      )}

      <a
        href={helpUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-info hover:underline"
      >
        {helpText} ↗
      </a>
    </div>
  );
}
