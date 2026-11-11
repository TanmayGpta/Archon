"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';

/* ── Model selection shared by Ask and the IDE ─────────────────
 * Lives in the studios layout, so the choice survives switching routes.
 */
interface ModelsState {
  models: string[];
  setModels: (m: string[]) => void;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  comparisonModel: string;
  setComparisonModel: (m: string) => void;
}

const ModelsContext = createContext<ModelsState | null>(null);

export function ModelsProvider({ children }: { children: React.ReactNode }) {
  const [models, setModels] = useState<string[]>(["gemma3:4b", "gemma3:12b", "codellama:7b-instruct"]);
  const [selectedModel, setSelectedModel] = useState<string>("gemma3:4b");
  const [comparisonModel, setComparisonModel] = useState<string>("codellama:7b-instruct");

  // Resilient model list loading with automatic retry
  useEffect(() => {
    let isMounted = true;

    const fetchModels = async (retries = 3) => {
      try {
        const res = await fetch(`${API_BASE}/api/models`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted && data.models && data.models.length > 0) {
          setModels(data.models);
          setSelectedModel(prev => (prev && data.models.includes(prev) ? prev : data.models[0]));
          if (data.models.length > 1) {
            setComparisonModel(prev => (prev && data.models.includes(prev) ? prev : data.models[1]));
          }
        }
      } catch {
        if (retries > 0) {
          setTimeout(() => fetchModels(retries - 1), 2000);
        }
      }
    };

    fetchModels();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ModelsContext.Provider
      value={{ models, setModels, selectedModel, setSelectedModel, comparisonModel, setComparisonModel }}
    >
      {children}
    </ModelsContext.Provider>
  );
}

export function useModels(): ModelsState {
  const ctx = useContext(ModelsContext);
  if (!ctx) throw new Error('useModels must be used inside <ModelsProvider>');
  return ctx;
}
