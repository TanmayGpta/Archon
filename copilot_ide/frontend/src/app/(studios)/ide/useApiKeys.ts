"use client";
import type { IdeProps } from './IdeContext';
import type { IdeStore } from './useIdeStore';
import { errorMessage } from '@/lib/api';

/* -- Cloud LLM API keys: status, save, clear, test - */
export function useApiKeys(ide: IdeProps & IdeStore) {
  const {
    apiBase,
    apiKeys,
    apiKeyInputs,
    selectedModel,
    setSelectedModel,
    setApiKeyInputs,
    setApiKeySaveStatus,
    setApiKeyTestStatus,
    setApiKeys,
    setModels,
  } = ide;

  // Fetch cloud API key status
  const fetchApiKeyStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/api/cloud/keys`);
      if (res.ok) {
        const data = await res.json();
        const providers = data.providers || {};
        setApiKeys(providers);
        const fl = providers.freellmapi;
        if (fl) {
          setApiKeyInputs(prev => ({
            ...prev,
            freellmapi_base_url: fl.base_url || prev.freellmapi_base_url || 'http://host.docker.internal:31415/v1',
            freellmapi_model: fl.model || prev.freellmapi_model || 'auto',
          }));
        }
        // Auto-sync stored keys from browser if server restarted
        let synced = false;
        for (const prov of ['openai', 'anthropic', 'gemini', 'groq']) {
          try {
            const stored = localStorage.getItem(`archon:key:${prov}`);
            if (stored && !providers?.[prov]?.configured) {
              const syncRes = await fetch(`${apiBase}/api/cloud/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: prov, api_key: stored })
              });
              if (syncRes.ok) synced = true;
            }
          } catch {}
        }
        if (synced) {
          const refreshed = await fetch(`${apiBase}/api/cloud/keys`);
          if (refreshed.ok) {
            const refreshedData = await refreshed.json();
            setApiKeys(refreshedData.providers || {});
          }
          await refreshModels();
        }
      }
    } catch (e) {}
  };

  const refreshModels = async (preferModel?: string) => {
    try {
      const modelsRes = await fetch(`${apiBase}/api/models`);
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        const nextModels: string[] = modelsData.models || [];
        if (setModels) setModels(nextModels);
        if (setSelectedModel && nextModels.length > 0) {
          if (preferModel && nextModels.includes(preferModel)) {
            setSelectedModel(preferModel);
          } else if (selectedModel && !nextModels.includes(selectedModel)) {
            setSelectedModel(nextModels[0]);
          }
        }
      }
    } catch (e) {}
  };

  const handleSaveApiKey = async (provider: string) => {
    const key = apiKeyInputs[provider]?.trim() || '';
    if (provider !== 'freellmapi' && !key) return;
    if (provider === 'freellmapi' && !key && !apiKeys?.freellmapi?.configured) return;

    const payload =
      provider === 'freellmapi'
        ? {
            provider,
            api_key: key || undefined,
            base_url: apiKeyInputs.freellmapi_base_url?.trim() || '',
            model: apiKeyInputs.freellmapi_model?.trim() || 'auto',
          }
        : { provider, api_key: key };

    try {
      const res = await fetch(`${apiBase}/api/cloud/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        if (key) {
          try { localStorage.setItem(`archon:key:${provider}`, key); } catch {}
        }
        const saved = await res.json().catch(() => ({}));
        setApiKeySaveStatus(prev => ({ ...prev, [provider]: 'Saved' }));
        setApiKeyInputs(prev => ({ ...prev, [provider]: '' }));
        await fetchApiKeyStatus();
        await refreshModels(
          provider === 'freellmapi' ? `freellmapi:${saved.model || apiKeyInputs.freellmapi_model?.trim() || 'auto'}` : undefined
        );
        setTimeout(() => setApiKeySaveStatus(prev => ({ ...prev, [provider]: '' })), 2000);
      } else {
        setApiKeySaveStatus(prev => ({ ...prev, [provider]: 'Error' }));
      }
    } catch (e) {
      setApiKeySaveStatus(prev => ({ ...prev, [provider]: 'Error' }));
    }
  };

  const handleClearApiKey = async (provider: string) => {
    try {
      const res = await fetch(`${apiBase}/api/cloud/keys/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      if (res.ok) {
        try { localStorage.removeItem(`archon:key:${provider}`); } catch {}
        await fetchApiKeyStatus();
        await refreshModels();
      }
    } catch (e) {}
  };

  const handleTestApiKey = async (provider: string) => {
    setApiKeyTestStatus(prev => ({ ...prev, [provider]: { status: 'testing' } }));
    const payload =
      provider === 'freellmapi'
        ? {
            provider,
            api_key: apiKeyInputs.freellmapi?.trim() || undefined,
            base_url: apiKeyInputs.freellmapi_base_url?.trim() || undefined,
            model: apiKeyInputs.freellmapi_model?.trim() || undefined,
          }
        : { provider, api_key: apiKeyInputs[provider] || undefined };
    try {
      const res = await fetch(`${apiBase}/api/cloud/keys/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setApiKeyTestStatus(prev => ({
          ...prev,
          [provider]: { status: 'ok', latency: data.latency_ms, model: data.model }
        }));
      } else {
        setApiKeyTestStatus(prev => ({ ...prev, [provider]: { status: 'error', message: data.message || 'Connection failed' } }));
      }
    } catch (e) {
      setApiKeyTestStatus(prev => ({ ...prev, [provider]: { status: 'error', message: errorMessage(e) || 'Network error' } }));
    }
  };

  return {
    fetchApiKeyStatus,
    handleSaveApiKey,
    handleClearApiKey,
    handleTestApiKey,
  };
}

export type ApiKeysApi = ReturnType<typeof useApiKeys>;
