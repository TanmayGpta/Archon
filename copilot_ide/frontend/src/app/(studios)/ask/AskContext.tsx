"use client";
import { createContext, useContext } from 'react';
import type { AskState } from './useAskState';

export const AskContext = createContext<AskState | null>(null);

export function useAsk(): AskState {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error('useAsk must be used inside the Ask studio');
  return ctx;
}
