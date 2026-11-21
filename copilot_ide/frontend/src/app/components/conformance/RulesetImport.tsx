"use client";

import React, { useEffect, useRef, useState } from 'react';

// Import your own ruleset: paste or pick a JSON file, check it, save it. The orchestrator validates
// it against the ruleset schema (/api/conformance/rulesets) and stores it as a file, so it shows up
// in the blueprint list from then on. A saved ArcGen architecture file is accepted too and compiled.

interface CheckResult {
  valid: boolean;
  errors: string[];
  name?: string;
  layers?: string[];
  rules?: number;
}

interface RulesetImportProps {
  apiBase: string;
  offline: boolean;
  // Called with the new blueprint id once the ruleset is saved
  onImported: (blueprintId: string) => void;
}

export const RulesetImport: React.FC<RulesetImportProps> = ({ apiBase, offline, onImported }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Close the panel on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const edit = (value: string) => {
    setText(value);
    setCheck(null);
  };

  const parse = (): unknown | undefined => {
    try {
      return JSON.parse(text);
    } catch (e) {
      setCheck({ valid: false, errors: [`Not valid JSON: ${(e as Error).message}`] });
      return undefined;
    }
  };

  const loadTemplate = async () => {
    try {
      const res = await fetch(`${apiBase}/api/conformance/rulesets/template`);
      edit(JSON.stringify(await res.json(), null, 2));
    } catch {
      setCheck({ valid: false, errors: ['Could not reach the orchestrator to load the template.'] });
    }
  };

  const pickFile = async (file?: File) => {
    if (!file) return;
    edit(await file.text());
    if (fileInput.current) fileInput.current.value = '';
  };

  const validate = async () => {
    const ruleset = parse();
    if (ruleset === undefined) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/conformance/rulesets/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleset }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCheck(await res.json());
    } catch (e) {
      setCheck({ valid: false, errors: [`Could not check the ruleset: ${(e as Error).message}`] });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const ruleset = parse();
    if (ruleset === undefined) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/conformance/rulesets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleset, name: name.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data?.detail;
        setCheck({ valid: false, errors: detail?.errors || [typeof detail === 'string' ? detail : `HTTP ${res.status}`] });
        return;
      }
      setOpen(false);
      setText('');
      setName('');
      setCheck(null);
      onImported(data.id);
    } catch (e) {
      setCheck({ valid: false, errors: [`Could not save the ruleset: ${(e as Error).message}`] });
    } finally {
      setBusy(false);
    }
  };

  if (offline) return null;
  const small = 'px-2 py-0.5 rounded border border-[#343434] text-xs font-mono text-[#8b8b86] hover:text-white hover:border-[#5a5a58] transition-colors cursor-pointer';

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-2.5 py-1 rounded text-xs font-mono border border-[#343434] text-[#8b8b86] hover:text-white hover:border-[#e8ff00] transition-colors cursor-pointer"
        title="Check a codebase against your own ruleset"
        aria-expanded={open}
      >
        Import ruleset
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-[min(92vw,30rem)] rounded border border-[#2b2b2a] bg-[#141413] p-3 shadow-xl">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-mono font-bold text-white">Import a ruleset</span>
            <div className="flex items-center gap-1.5">
              <button onClick={loadTemplate} className={small} title="Fill the box with a starter ruleset to edit">Use template</button>
              <button onClick={() => fileInput.current?.click()} className={small}>Open file…</button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={e => pickFile(e.target.files?.[0])}
              />
            </div>
          </div>

          <textarea
            value={text}
            onChange={e => edit(e.target.value)}
            spellCheck={false}
            placeholder={'Paste ruleset JSON: layers (name, description, match_patterns) and allow rules between them.\nA saved ArcGen architecture file also works.'}
            className="w-full h-56 resize-y rounded border border-[#2b2b2a] bg-[#0d0d0c] p-2 text-xs font-mono text-[#e2e2da] placeholder-[#5a5a58] outline-none focus:border-[#e8ff00]"
            aria-label="Ruleset JSON"
          />

          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Name (optional, defaults to project_name)"
            className="mt-2 w-full rounded border border-[#2b2b2a] bg-[#0d0d0c] px-2 py-1 text-xs font-mono text-white placeholder-[#5a5a58] outline-none focus:border-[#e8ff00]"
            aria-label="Ruleset name"
          />

          {check && !check.valid && (
            <ul className="mt-2 max-h-32 overflow-y-auto rounded border border-[#ff3b30]/40 bg-[#ff3b30]/10 p-2 text-xs font-mono text-[#ff8a80] space-y-1" role="alert">
              {check.errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          )}
          {check?.valid && (
            <div className="mt-2 rounded border border-[#10b981]/40 bg-[#10b981]/10 p-2 text-xs font-mono text-[#6fd38a]">
              Valid: {check.name} · {check.layers?.length} layers ({check.layers?.join(', ')}) · {check.rules} rules
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-[#5a5a58]">Saving under an existing name replaces it.</span>
            <div className="flex items-center gap-1.5">
              <button onClick={validate} disabled={busy || !text.trim()} className={`${small} disabled:opacity-40`}>Check</button>
              <button
                onClick={save}
                disabled={busy || !text.trim()}
                className="px-2.5 py-0.5 rounded bg-[#e8ff00] text-black font-mono text-xs font-bold hover:bg-[#d6ec00] transition-colors cursor-pointer disabled:opacity-40"
              >
                {busy ? 'Working…' : 'Save & audit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
