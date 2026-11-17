"use client";
import type { IdeProps } from './IdeContext';
import type { IdeStore } from './useIdeStore';
import { errorMessage } from '@/lib/api';

/* -- Cloud LLM API keys: status, save, clear, test - */
export function useApiKeys(ide: IdeProps & IdeStore) {
  const {
    apiBase,
    apiKeyInputs,
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
        setApiKeys(data.providers || {});
        // Auto-sync stored keys from browser if server restarted
        for (const prov of ['openai', 'anthropic', 'gemini', 'groq']) {
          try {
            const stored = localStorage.getItem(`archon:key:${prov}`);
            if (stored && !data.providers?.[prov]?.configured) {
              await fetch(`${apiBase}/api/cloud/keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: prov, api_key: stored })
              });
            }
          } catch {}
        }
      }
    } catch (e) {}
  };

  const handleSaveApiKey = async (provider: string) => {
    const key = apiKeyInputs[provider]?.trim();
    if (!key) return;
    try {
      const res = await fetch(`${apiBase}/api/cloud/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: key })
      });
      if (res.ok) {
        try { localStorage.setItem(`archon:key:${provider}`, key); } catch {}
        setApiKeySaveStatus(prev => ({ ...prev, [provider]: 'Saved' }));
        setApiKeyInputs(prev => ({ ...prev, [provider]: '' }));
        fetchApiKeyStatus();
        // Refresh models list to include cloud models
        try {
          const modelsRes = await fetch(`${apiBase}/api/models`);
          if (modelsRes.ok) {
            const modelsData = await modelsRes.json();
            if (setModels) setModels(modelsData.models || []);
          }
        } catch (e) {}
        setTimeout(() => setApiKeySaveStatus(prev => ({ ...prev, [provider]: '' })), 2000);
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
        fetchApiKeyStatus();
        // Refresh models
        try {
          const modelsRes = await fetch(`${apiBase}/api/models`);
          if (modelsRes.ok) {
            const modelsData = await modelsRes.json();
            if (setModels) setModels(modelsData.models || []);
          }
        } catch (e) {}
      }
    } catch (e) {}
  };

  const handleTestApiKey = async (provider: string) => {
    setApiKeyTestStatus(prev => ({ ...prev, [provider]: { status: 'testing' } }));
    try {
      const res = await fetch(`${apiBase}/api/cloud/keys/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKeyInputs[provider] || undefined })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setApiKeyTestStatus(prev => ({ ...prev, [provider]: { status: 'ok', latency: data.latency_ms } }));
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
