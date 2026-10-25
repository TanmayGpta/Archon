"use client";
import React, { useState } from 'react';
import { Icons } from '../Icons';
import { parseDiffBlocks } from '@/lib/diff';

/* -- Helper to detect target filename from code content & hints - */
export function detectTargetFilename(code: string, lang?: string): string | null {
  const firstLines = code.split('\n').slice(0, 6).join('\n');
  const match = /(?:#|\/\/|\/\*|<!--)\s*(?:filename|file|target):\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i.exec(firstLines);
  if (match && match[1]) return match[1].trim();

  // Deduce from code semantics
  if (lang === 'python' || lang === 'py' || code.includes('import requests') || code.includes('import os') || code.includes('def ')) {
    if (code.includes('refund') && code.includes('slack')) return 'refund_slack.py';
    if (code.includes('refund')) return 'refund.py';
    if (code.includes('slack')) return 'slack_notify.py';
    if (code.includes('stripe') || code.includes('charge')) return 'stripe_charge.py';
    return 'script.py';
  }
  if (lang === 'typescript' || lang === 'ts' || lang === 'tsx') return 'app.ts';
  if (lang === 'javascript' || lang === 'js' || lang === 'jsx') return 'index.js';
  if (lang === 'markdown' || lang === 'md' || code.startsWith('# ')) return 'README.md';
  if (lang === 'yaml' || lang === 'yml') return 'openapi.yaml';
  if (lang === 'json') return 'config.json';
  if (lang === 'html') return 'index.html';
  if (lang === 'css') return 'styles.css';

  return null;
}

/* -- Code Block with Clean Header, Visual Diff Preview & Surgical Apply -- */
export function CodeBlock({ 
  children, 
  className,
  onApplyCode,
  onApplyDiff,
  onCreateNewFile,
  activeFileName
}: { 
  children: any; 
  className?: string;
  onApplyCode?: (code: string) => void;
  onApplyDiff?: (diffText: string) => void;
  onCreateNewFile?: (filename: string, code: string) => void;
  activeFileName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [created, setCreated] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : 'code';
  const text = String(children).replace(/\n$/, '');

  const diffBlocks = parseDiffBlocks(text);
  const isDiffBlock = diffBlocks.length > 0;
  const detectedFile = detectTargetFilename(text, lang);
  const isDifferentFromActive = detectedFile && activeFileName && detectedFile.toLowerCase() !== activeFileName.toLowerCase();

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    if (isDiffBlock && onApplyDiff) {
      onApplyDiff(text);
      setApplied(true);
      setTimeout(() => setApplied(false), 2500);
    } else if (onApplyCode) {
      onApplyCode(text);
      setApplied(true);
      setTimeout(() => setApplied(false), 2500);
    }
  };

  const handleCreateFile = () => {
    if (onCreateNewFile && detectedFile) {
      onCreateNewFile(detectedFile, text);
      setCreated(true);
      setTimeout(() => setCreated(false), 2500);
    }
  };

  return (
    <div className="my-3 bg-surface border border-line rounded-lg overflow-hidden group shadow-md flex flex-col">
      {/* Top Header */}
      <div className="flex justify-between items-center px-3 py-1.5 bg-surface border-b border-line text-xs font-mono text-fg-subtle select-none">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
          {isDiffBlock ? (
            <span className="text-xs bg-accent/20 text-accent-fg px-2 py-0.5 rounded border border-accent/40 font-bold flex items-center gap-1.5">
              <Icons.Bolt />
              <span>Surgical Diff Edit • {diffBlocks.length} {diffBlocks.length === 1 ? 'block' : 'blocks'}</span>
            </span>
          ) : (
            <span className="uppercase tracking-wider text-fg-muted font-bold text-xs bg-overlay px-1.5 py-0.5 rounded border border-line-strong flex-shrink-0">
              {lang}
            </span>
          )}
          {detectedFile && (
            <span className="text-xs text-accent-fg bg-raised px-2 py-0.5 rounded border border-line truncate font-medium flex items-center gap-1.5" title={detectedFile}>
              <Icons.FileCode />
              <span className="truncate">{detectedFile}</span>
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="text-fg-muted hover:text-fg bg-overlay hover:bg-selected px-2 py-0.5 rounded transition-colors text-xs font-mono flex items-center gap-1 cursor-pointer border border-line-strong flex-shrink-0"
        >
          {copied ? <span className="text-success flex items-center gap-1"><Icons.Check /> Copied</span> : <span className="flex items-center gap-1"><Icons.Copy /> Copy</span>}
        </button>
      </div>

      {/* Code / Diff Window */}
      <div className="p-3.5 overflow-x-auto custom-scrollbar bg-canvas">
        {isDiffBlock ? (
          <div className="space-y-3 font-mono text-sm leading-[1.65]">
            {diffBlocks.map((blk, idx) => (
              <div key={idx} className="border border-line rounded-md overflow-hidden">
                <div className="bg-danger/10 border-b border-danger/20 px-2.5 py-1 text-xs text-danger font-semibold flex items-center gap-1">
                  <span>- ORIGINAL (SEARCH)</span>
                </div>
                <pre className="p-2.5 bg-surface text-[#fca5a5] overflow-x-auto custom-scrollbar whitespace-pre">
                  <code>{blk.search}</code>
                </pre>
                <div className="bg-success/10 border-y border-success/20 px-2.5 py-1 text-xs text-success font-semibold flex items-center gap-1">
                  <span>+ REPLACEMENT (REPLACE)</span>
                </div>
                <pre className="p-2.5 bg-surface text-[#86efac] overflow-x-auto custom-scrollbar whitespace-pre">
                  <code>{blk.replace}</code>
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <pre className="text-sm font-mono leading-[1.65] text-[#93c5fd] selection:bg-accent/30">
            <code>{text}</code>
          </pre>
        )}
      </div>

      {/* Action Toolbar */}
      {(onApplyDiff || onApplyCode || (isDifferentFromActive && onCreateNewFile && detectedFile)) && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-surface border-t border-line-subtle select-none">
          {/* Create & Open new file button */}
          {!isDiffBlock && isDifferentFromActive && onCreateNewFile && detectedFile && (
            <button
              onClick={handleCreateFile}
              className="flex-1 min-w-[130px] text-success hover:text-white bg-success/15 hover:bg-success px-2.5 py-1 rounded text-xs font-mono flex items-center justify-center gap-1.5 cursor-pointer border border-success/30 transition-all font-semibold shadow-sm"
              title={`Create new file ${detectedFile} in workspace without overwriting ${activeFileName}`}
            >
              <span>{created ? <Icons.Check /> : <Icons.Sparkles />}</span>
              <span className="truncate">{created ? `Created ${detectedFile}` : `Create & Open ${detectedFile}`}</span>
            </button>
          )}

          {/* Apply Diff or Full Code to Active File button */}
          {(isDiffBlock ? onApplyDiff : onApplyCode) && (
            <button
              onClick={handleApply}
              className={`flex-1 min-w-[110px] text-white px-2.5 py-1.5 rounded text-xs font-mono flex items-center justify-center gap-1.5 cursor-pointer transition-all font-semibold shadow-sm ${
                isDiffBlock
                  ? 'bg-accent-strong hover:bg-accent-hover border border-accent/50 shadow-[#3b82f6]/20'
                  : 'bg-selected/80 hover:bg-accent-strong border border-accent/30 text-accent-fg hover:text-white'
              }`}
              title={isDiffBlock ? `Surgically apply ${diffBlocks.length} edits into ${activeFileName || 'active editor'}` : `Apply code into ${activeFileName || 'active editor'}`}
            >
              <span>{applied ? <Icons.Check /> : <Icons.Bolt />}</span>
              <span className="truncate">
                {applied 
                  ? '✓ Applied to Editor' 
                  : isDiffBlock 
                    ? `⚡ Apply Diff (${diffBlocks.length}) to ${activeFileName || 'Editor'}` 
                    : `Apply to ${activeFileName || 'File'}`}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
