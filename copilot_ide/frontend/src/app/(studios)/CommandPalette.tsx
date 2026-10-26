"use client";
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { COMMANDS, searchCommands, type CommandSpec } from '@/lib/commands';
import { Dialog } from '../components/Dialog';
import { useModels } from './ModelsContext';
import { CommandsContext, type CommandHandler, type Registry } from '../components/commandsContext';

/* -- Command palette (Ctrl/Cmd+K, Ctrl+Shift+P) ------------------------
 * Commands are data in lib/commands.ts. Studios attach the code that runs
 * them with useCommand(id, { run }). Running a command whose studio isn't
 * open navigates there and runs it once that studio registers it.
 */

const isMacPlatform = () => /Mac|iPhone|iPad/.test(navigator.platform);
const noSubscribe = () => () => {};
export function usePaletteShortcut() {
  return useSyncExternalStore(noSubscribe, () => (isMacPlatform() ? '⌘K' : 'Ctrl K'), () => 'Ctrl K');
}

export function CommandsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { models, selectedModel, setSelectedModel } = useModels();
  const handlers = useRef(new Map<string, React.RefObject<CommandHandler>>());
  const pending = useRef<{ id: string; args: Record<string, string> } | null>(null);
  const [open, setOpen] = useState(false);

  const [registry] = useState<Registry>(() => ({
    register: (id, handler) => {
      handlers.current.set(id, handler);
      if (pending.current?.id === id) {
        const { args } = pending.current;
        pending.current = null;
        setTimeout(() => handler.current.run(args));
      }
      return () => {
        if (handlers.current.get(id) === handler) handlers.current.delete(id);
      };
    },
    open: () => setOpen(true),
  }));

  // Built-in commands: studio navigation and the shared model choice
  const builtIn = (spec: CommandSpec): CommandHandler | null => {
    if (spec.id.startsWith('studio.')) return { run: () => router.push(`/${spec.id.slice('studio.'.length)}`) };
    if (spec.id === 'model.select') return { run: args => setSelectedModel(args.model), choices: () => models };
    return null;
  };

  const handlerFor = (spec: CommandSpec) => builtIn(spec) ?? handlers.current.get(spec.id)?.current ?? null;

  const run = (spec: CommandSpec, args: Record<string, string>) => {
    const handler = handlerFor(spec);
    if (handler) {
      handler.run(args);
    } else if (spec.route) {
      pending.current = { id: spec.id, args };
      router.push(spec.route);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && ((key === 'k' && !e.shiftKey) || (key === 'p' && e.shiftKey))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(o => !o);
      }
    };
    // Capture phase, so the editor and studio shortcuts (Ctrl+P quick open) don't see it
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <CommandsContext.Provider value={registry}>
      {children}
      {open && (
        <Palette
          onClose={() => setOpen(false)}
          choicesFor={spec => handlerFor(spec)?.choices?.() ?? []}
          current={{ 'model.select': selectedModel }}
          onRun={(spec, args) => {
            setOpen(false);
            // After the palette has closed and handed focus back
            setTimeout(() => run(spec, args));
          }}
        />
      )}
    </CommandsContext.Provider>
  );
}

function Palette({
  onClose,
  onRun,
  choicesFor,
  current,
}: {
  onClose: () => void;
  onRun: (spec: CommandSpec, args: Record<string, string>) => void;
  choicesFor: (spec: CommandSpec) => string[];
  current: Record<string, string>;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<{ spec: CommandSpec; choices: string[] } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  type Item = { key: string; title: string; group: CommandSpec['group']; keywords?: string[]; hint?: string };
  const items: Item[] = step
    ? searchCommands(
        query,
        step.choices.map(c => ({ key: c, title: c, group: step.spec.group, hint: c === current[step.spec.id] ? 'current' : undefined })),
      )
    : searchCommands(query, COMMANDS.map(c => ({ key: c.id, title: c.title, group: c.group, keywords: c.keywords, hint: c.shortcut })));
  const active = Math.min(index, Math.max(items.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    if (step) {
      const arg = step.spec.args?.[0]?.name ?? 'value';
      onRun(step.spec, { [arg]: item.key });
      return;
    }
    const spec = COMMANDS.find(c => c.id === item.key)!;
    if (spec.args?.some(a => a.kind === 'choice')) {
      setStep({ spec, choices: choicesFor(spec) });
      setQuery('');
      setIndex(0);
      return;
    }
    onRun(spec, {});
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex(items.length ? (active + 1) % items.length : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex(items.length ? (active - 1 + items.length) % items.length : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Backspace' && !query && step) {
      e.preventDefault();
      setStep(null);
      setIndex(0);
    }
  };

  return (
    <Dialog onClose={onClose} label="Command palette" className="flex items-start justify-center pt-24 p-4" backdrop="backdrop:bg-black/60 backdrop:backdrop-blur-xs">
      <div className="w-full max-w-[620px] bg-surface border border-line-strong rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-3 border-b border-line">
          {step && <span className="text-xs text-fg-muted whitespace-nowrap">{step.spec.title.replace('…', '')} ›</span>}
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items.length ? `palette-opt-${active}` : undefined}
            aria-label={step ? step.spec.args?.[0]?.title ?? 'Choose' : 'Type a command'}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={step ? `Choose ${step.spec.args?.[0]?.title.toLowerCase() ?? 'a value'}…` : 'Type a command…'}
            className="flex-1 bg-transparent py-3 text-base text-fg-strong placeholder-fg-subtle focus:outline-none"
          />
        </div>
        <ul id="palette-list" role="listbox" ref={listRef} className="max-h-[50vh] overflow-y-auto custom-scrollbar py-1">
          {items.length === 0 && <li className="px-4 py-3 text-sm text-fg-muted">No matching commands</li>}
          {items.map((item, i) => (
            <li
              key={item.key}
              id={`palette-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setIndex(i)}
              onClick={() => choose(item)}
              className={`mx-1 px-3 py-2 rounded-md flex items-center justify-between gap-3 cursor-pointer text-sm ${
                i === active ? 'bg-selected text-fg-strong' : 'text-fg-soft'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                {!step && <span className="text-xs text-fg-subtle w-20 flex-shrink-0">{item.group}</span>}
                <span className="truncate">{item.title}</span>
              </span>
              {item.hint && <kbd className="text-xs font-mono text-fg-muted flex-shrink-0">{item.hint}</kbd>}
            </li>
          ))}
        </ul>
        <div className="px-3 py-1.5 border-t border-line text-xs text-fg-subtle flex gap-4">
          <span>↑↓ move</span>
          <span>Enter run</span>
          <span>Esc close</span>
          {step && <span>Backspace back</span>}
        </div>
      </div>
    </Dialog>
  );
}
