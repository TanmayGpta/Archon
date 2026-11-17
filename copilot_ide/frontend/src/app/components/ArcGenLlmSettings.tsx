"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { errorDetail, errorMessage } from '@/lib/api';

/** Generator LLM picker for ArcGen: provider, model and API keys, saved by the ArcGen service
 *  (/api/arcgen/llm). Keys go to the service once and only come back masked. */

type ProviderId = 'groq' | 'omnikey' | 'ollama';
type Choice = 'auto' | ProviderId;

interface ProviderStatus {
  label: string;
  needs_key: boolean;
  configured: boolean;
  key_source: 'ui' | 'env' | null;
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

interface TestResult { ok: boolean; message: string; latency_ms: number }

const ORDER: ProviderId[] = ['groq', 'omnikey', 'ollama'];
const SHORT: Record<ProviderId, string> = {
  groq: 'Groq Cloud (Fast)',
  omnikey: 'Google Gemini',
  ollama: 'Local Ollama',
};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(errorDetail(await res.text()));
  return res.json() as Promise<T>;
}

export function ArcGenLlmSettings({ apiBase, disabled = false }: { apiBase: string; disabled?: boolean }) {
  const base = `${apiBase}/api/arcgen/llm`;
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [loadError, setLoadError] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>('');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => call<LlmStatus>(base).then(
    s => { setStatus(s); setLoadError(''); },
    e => setLoadError(errorMessage(e)),
  ), [base]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let s = await call<LlmStatus>(base);
        try {
          const storedGroq = localStorage.getItem('archon:key:groq') || '';
          let storedOmni = localStorage.getItem('archon:key:omnikey') || '';

          // Auto-clean: if user mistakenly put a Groq key into omnikey, purge it
          if (storedOmni && storedOmni.startsWith('gsk_')) {
            localStorage.removeItem('archon:key:omnikey');
            storedOmni = '';
            try { await call<LlmStatus>(`${base}/keys/omnikey`, { method: 'DELETE' }); } catch {}
          }

          if (storedGroq && !s.providers.groq.configured && !storedGroq.startsWith('AIza')) {
            s = await call<LlmStatus>(`${base}/keys/groq`, { method: 'PUT', body: JSON.stringify({ api_key: storedGroq.trim() }) });
          }
          if (storedOmni && !s.providers.omnikey.configured && !storedOmni.startsWith('gsk_')) {
            s = await call<LlmStatus>(`${base}/keys/omnikey`, { method: 'PUT', body: JSON.stringify({ api_key: storedOmni.trim() }) });
          }
        } catch {}
        if (live) { setStatus(s); setLoadError(''); }
      } catch (e) {
        if (live) setLoadError(errorMessage(e));
      }
    })();
    return () => { live = false; };
  }, [base]);

  const run = async (fn: () => Promise<LlmStatus>) => {
    setBusy(true);
    setActionError('');
    try {
      setStatus(await fn());
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const choose = (provider: Choice) =>
    run(() => call<LlmStatus>(base, { method: 'PUT', body: JSON.stringify({ provider }) }));

  const summary = status
    ? status.chain.length
      ? status.chain.map(t => `${SHORT[t.provider] || t.provider} ${t.model}`).join(' → ')
      : status.error ?? 'not configured'
    : loadError ? 'service unreachable' : 'loading…';

  // When a specific provider is chosen, display that provider first, with toggle for others
  const visibleProviders = status && status.provider !== 'auto' && !showAll
    ? [status.provider]
    : ORDER;

  return (
    <div className="border border-line-strong rounded-panel bg-raised">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-surface/50 transition-colors"
      >
        <span className="font-mono font-bold text-fg-strong uppercase tracking-wider shrink-0 flex items-center gap-1.5">
          <span>⚙</span> Generator LLM
        </span>
        <span className="font-mono text-fg-muted truncate" title={summary}>
          {status?.provider === 'auto' && status.chain.length > 1 ? 'Auto · ' : ''}{summary}
        </span>
        <span className="text-fg-subtle shrink-0">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-3 border-t border-line-strong/70 pt-3">
          {loadError && (
            <div className="text-xs text-danger-fg">
              Couldn&apos;t reach the ArcGen service: {loadError}{' '}
              <button type="button" onClick={() => { load(); }} className="underline cursor-pointer">Retry</button>
            </div>
          )}

          {status && (
            <>
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-fg-subtle block mb-1.5">
                  Select Provider:
                </label>
                <div role="radiogroup" aria-label="Generator provider" className="flex flex-wrap gap-1 text-xs font-mono">
                  {(['auto', ...ORDER] as Choice[]).map(c => {
                    const p = c === 'auto' ? null : status.providers[c];
                    const unavailable = !!p && !p.configured;
                    const active = status.provider === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={disabled || busy || unavailable}
                        onClick={() => !active && choose(c)}
                        title={unavailable ? 'Add an API key below first' : c === 'auto' ? 'Try Groq, then Gemini, then local Ollama' : `Use only ${SHORT[c] || p?.label}`}
                        className={`px-2.5 py-1.5 rounded-control border cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 transition-all ${
                          active ? 'bg-selected border-info text-info font-semibold shadow-sm' : 'border-line-strong text-fg-soft hover:text-fg-strong bg-surface'
                        }`}
                      >
                        {c === 'auto' ? '⚡ Auto (fallback)' : SHORT[c]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-xs text-fg-subtle bg-surface/50 border border-line-strong/40 rounded px-2.5 py-1.5">
                {status.provider === 'auto'
                  ? '⚡ Auto tries Groq Cloud → Google Gemini → Ollama in order.'
                  : `🔒 Only ${SHORT[status.provider] || status.providers[status.provider].label} is used. If it fails, generation fails.`}
                {' '}Changes apply to the next generation.
              </p>

              <div className="flex flex-col gap-2.5">
                {visibleProviders.map(id => (
                  <ProviderCard
                    key={`${id}:${status.providers[id].model_is_default ? '' : status.providers[id].model}`}
                    id={id}
                    base={base}
                    p={status.providers[id]}
                    disabled={disabled || busy}
                    onSaved={setStatus}
                    onError={setActionError}
                  />
                ))}
              </div>

              {status.provider !== 'auto' && (
                <button
                  type="button"
                  onClick={() => setShowAll(s => !s)}
                  className="text-xs text-info hover:underline text-left cursor-pointer pt-0.5"
                >
                  {showAll ? '▲ Show only active provider settings' : '▼ Configure other providers (Google Gemini, Local Ollama)...'}
                </button>
              )}

              {actionError && <div className="text-xs text-danger-fg bg-danger/10 border border-danger/30 rounded p-2">{actionError}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderCard({ id, base, p, disabled, onSaved, onError }: {
  id: ProviderId;
  base: string;
  p: ProviderStatus;
  disabled: boolean;
  onSaved: (s: LlmStatus) => void;
  onError: (msg: string) => void;
}) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState(p.model_is_default ? '' : p.model);
  const [models, setModels] = useState<string[] | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [working, setWorking] = useState(false);
  const [crossKeyWarning, setCrossKeyWarning] = useState('');

  const displayTitle = id === 'groq'
    ? 'Groq Cloud (Recommended - Free Tier)'
    : id === 'omnikey'
    ? 'Google Gemini (Optional)'
    : 'Local Ollama (Offline)';

  const helpUrl = id === 'groq'
    ? 'https://console.groq.com/keys'
    : id === 'omnikey'
    ? 'https://aistudio.google.com/app/apikey'
    : 'https://ollama.com';

  const helpText = id === 'groq'
    ? 'Get a free Groq API key (starts with gsk_)'
    : id === 'omnikey'
    ? 'Get a Gemini API key (starts with AIza)'
    : 'Download Ollama';

  const onKeyChange = (val: string) => {
    setKey(val);
    const trimmed = val.trim();
    if (id === 'omnikey' && trimmed.startsWith('gsk_')) {
      setCrossKeyWarning("⚠️ That's a Groq key (starts with 'gsk_'). Please paste it into the Groq Cloud card!");
    } else if (id === 'groq' && trimmed.startsWith('AIza')) {
      setCrossKeyWarning("⚠️ That's a Google Gemini key (starts with 'AIza'). Please paste it into Google Gemini!");
    } else {
      setCrossKeyWarning('');
    }
  };

  const loadModels = async () => {
    if (models) return;
    try {
      const r = await call<{ models: string[] }>(`${base}/models/${id}`);
      setModels(r.models);
    } catch {
      setModels([]);
    }
  };

  const act = async (fn: () => Promise<void>) => {
    setWorking(true);
    onError('');
    try { await fn(); } catch (e) { onError(errorMessage(e)); } finally { setWorking(false); }
  };

  const save = () => act(async () => {
    if (crossKeyWarning) return;
    let s: LlmStatus | null = null;
    if (key.trim()) {
      s = await call<LlmStatus>(`${base}/keys/${id}`, { method: 'PUT', body: JSON.stringify({ api_key: key.trim() }) });
      try {
        localStorage.setItem(`archon:key:${id}`, key.trim());
      } catch {}
      setKey('');
      setModels(null);
    }
    const current = s ?? await call<LlmStatus>(base);
    const wanted = model.trim();
    if (wanted !== (current.providers[id].model_is_default ? '' : current.providers[id].model)) {
      s = await call<LlmStatus>(base, { method: 'PUT', body: JSON.stringify({ provider: current.provider, models: { [id]: wanted } }) });
    }
    if (s) onSaved(s);
    setTest(null);
  });

  const clearKey = () => act(async () => {
    onSaved(await call<LlmStatus>(`${base}/keys/${id}`, { method: 'DELETE' }));
    try {
      localStorage.removeItem(`archon:key:${id}`);
    } catch {}
    setModels(null);
    setTest(null);
  });

  const runTest = () => act(async () => {
    setTest(await call<TestResult>(`${base}/test`, {
      method: 'POST',
      body: JSON.stringify({ provider: id, model: model.trim() || null, api_key: key.trim() || null }),
    }));
  });

  const dirty = (!!key.trim() && !crossKeyWarning) || model.trim() !== (p.model_is_default ? '' : p.model);
  const listId = `arcgen-models-${id}`;
  const keyState = !p.needs_key ? (p.host ?? '')
    : p.key_source === 'ui' ? `key ${p.masked_key} · saved`
    : p.key_source === 'env' ? `key ${p.masked_key} · from .env`
    : 'no key';

  return (
    <div className="border border-line-strong/80 rounded-panel p-3 flex flex-col gap-2.5 bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-fg-strong">{displayTitle}</span>
          {p.configured && <span className="text-[10px] bg-success/15 text-success-fg px-1.5 py-0.2 rounded font-mono">Ready ✓</span>}
        </div>
        <span className={`font-mono text-[11px] truncate ${p.configured ? 'text-fg-muted' : 'text-warning-fg'}`} title={keyState}>{keyState}</span>
      </div>

      {p.needs_key && (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1.5">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={e => onKeyChange(e.target.value)}
              placeholder={p.key_source ? 'Paste a new key to replace saved key' : id === 'groq' ? 'Paste Groq key (gsk_...)' : 'Paste Gemini key (AIza...)'}
              aria-label={`${p.label} API key`}
              disabled={disabled || working}
              className={`flex-1 min-w-0 bg-raised border rounded-control px-2.5 py-1.5 text-xs font-mono text-fg-strong placeholder-fg-subtle focus:outline-none ${
                crossKeyWarning ? 'border-warning-fg focus:border-warning-fg' : 'border-line-strong focus:border-info/60'
              }`}
            />
            {p.key_source === 'ui' && (
              <button
                type="button"
                onClick={clearKey}
                disabled={disabled || working}
                title="Forget the key saved here"
                className="px-2.5 py-1.5 rounded-control border border-line-strong text-xs text-fg-soft hover:text-danger-fg cursor-pointer disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          {crossKeyWarning && (
            <div className="text-xs text-warning-fg font-medium bg-warning/10 border border-warning/30 rounded px-2 py-1">
              {crossKeyWarning}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1.5">
        <input
          list={listId}
          value={model}
          onChange={e => setModel(e.target.value)}
          onFocus={loadModels}
          placeholder={`${p.default_model} (default model)`}
          aria-label={`${p.label} model`}
          disabled={disabled || working}
          className="flex-1 min-w-0 bg-raised border border-line-strong rounded-control px-2.5 py-1.5 text-xs font-mono text-fg-strong placeholder-fg-subtle focus:outline-none focus:border-info/60"
        />
        <datalist id={listId}>
          {(models ?? []).map(m => <option key={m} value={m} />)}
        </datalist>
        <button
          type="button"
          onClick={runTest}
          disabled={disabled || working || (p.needs_key && !p.configured && !key.trim())}
          className="px-3 py-1.5 rounded-control border border-line-strong text-xs text-fg-soft hover:text-info cursor-pointer disabled:opacity-50"
        >
          Test
        </button>
        <button
          type="button"
          onClick={save}
          disabled={disabled || working || !dirty || !!crossKeyWarning}
          className="px-3.5 py-1.5 rounded-control bg-info-strong text-white text-xs font-semibold hover:brightness-110 cursor-pointer disabled:opacity-40"
        >
          Save
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px] pt-0.5">
        <a
          href={helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-info hover:underline"
        >
          {helpText} ↗
        </a>
        {test && (
          <span className={`font-mono ${test.ok ? 'text-success-fg' : 'text-warning-fg'}`}>
            {test.ok ? '✓ Connected' : '✗ Failed'} · {test.latency_ms} ms
          </span>
        )}
      </div>
    </div>
  );
}
