'use client';

import { useMemo, useRef } from 'react';

const KEYWORDS = new Set(('False None True and as assert async await break class continue def del elif else except finally for ' +
  'from global if import in is lambda nonlocal not or pass raise return try while with yield self').split(' '));

/** Minimal token-level Python highlighter (same overlay approach as the Copilot IDE editor). */
function highlight(line: string) {
  const out: React.ReactNode[] = [];
  const re = /(#.*$)|("""|'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|(@\w+)|(\b[A-Za-z_]\w*\b)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [tok] = m;
    let cls = '';
    if (m[1]) cls = 'text-zinc-500 italic';
    else if (m[2]) cls = 'text-emerald-400';
    else if (m[3]) cls = 'text-orange-300';
    else if (m[4]) cls = 'text-yellow-300';
    else if (KEYWORDS.has(tok)) cls = 'text-fuchsia-400';
    else if (/^[A-Z]/.test(tok)) cls = 'text-sky-300';
    out.push(cls ? <span key={m.index} className={cls}>{tok}</span> : tok);
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function CodeEditor({
  value, onChange, markers,
}: {
  value: string;
  onChange: (v: string) => void;
  markers: Record<number, string>; // 1-based line -> tooltip (violations)
}) {
  const gutter = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLPreElement>(null);
  const lines = useMemo(() => value.split('\n'), [value]);

  const onScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (gutter.current) gutter.current.scrollTop = scrollTop;
    if (layer.current) { layer.current.scrollTop = scrollTop; layer.current.scrollLeft = scrollLeft; }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const t = e.currentTarget;
      const { selectionStart: s, selectionEnd: end } = t;
      onChange(value.slice(0, s) + '    ' + value.slice(end));
      requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 4; });
    }
  };

  const font = 'font-mono text-[12.5px] leading-[20px]';
  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden bg-[#0b0d11]">
      <div ref={gutter} className={`${font} select-none overflow-hidden text-right text-zinc-600 py-2 w-14 shrink-0 border-r border-[#1a1e26]`}>
        {lines.map((_, i) => (
          <div key={i} className={`pr-2 ${markers[i + 1] ? 'bg-rose-500/20 text-rose-300' : ''}`} title={markers[i + 1]}>
            {markers[i + 1] ? '● ' : ''}{i + 1}
          </div>
        ))}
      </div>
      <div className="relative flex-1 min-w-0">
        <pre ref={layer} aria-hidden className={`${font} absolute inset-0 m-0 p-2 overflow-hidden whitespace-pre text-zinc-300 pointer-events-none`}>
          {lines.map((l, i) => (
            <div key={i} className={`h-[20px] ${markers[i + 1] ? 'bg-rose-500/10' : ''}`}>{l ? highlight(l) : ' '}</div>
          ))}
        </pre>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          spellCheck={false}
          className={`${font} absolute inset-0 w-full h-full p-2 bg-transparent text-transparent caret-zinc-200 resize-none outline-none whitespace-pre overflow-auto`}
        />
      </div>
    </div>
  );
}
