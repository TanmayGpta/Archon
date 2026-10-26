"use client";
import { createContext, useContext, useEffect, useRef } from 'react';
import type React from 'react';

/* -- Commands context ---------------------------------------------------
 * Studios attach code to command ids (lib/commands.ts) with useCommand.
 * The provider and palette live in (studios)/CommandPalette.tsx. Outside a
 * provider (e.g. a page that embeds a studio on its own) useCommand does nothing.
 */

export interface CommandHandler {
  run: (args: Record<string, string>) => void;
  /** Values for a 'choice' argument; the palette shows them as a second step. */
  choices?: () => string[];
}

export interface Registry {
  register: (id: string, handler: React.RefObject<CommandHandler>) => () => void;
  open: () => void;
}

export const CommandsContext = createContext<Registry | null>(null);

/** Attach code to a command id while this component is mounted. No-op outside the studios. */
export function useCommand(id: string, handler: CommandHandler) {
  const registry = useContext(CommandsContext);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => registry?.register(id, ref), [registry, id]);
}

export function useOpenCommandPalette() {
  return useContext(CommandsContext)?.open;
}
