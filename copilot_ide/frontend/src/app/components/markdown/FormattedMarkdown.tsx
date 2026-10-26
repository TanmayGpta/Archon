"use client";
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { preprocessMarkdownDiffs } from '@/lib/diff';

/* -- Rich Markdown Renderer (Hydration Safe) ----------------- */
export function FormattedMarkdown({ 
  content, 
  onApplyCode,
  onApplyDiff,
  onCreateNewFile, 
  activeFileName 
}: { 
  content: string; 
  onApplyCode?: (code: string) => void;
  onApplyDiff?: (diffText: string) => void;
  onCreateNewFile?: (filename: string, code: string) => void;
  activeFileName?: string;
}) {
  const processedContent = useMemo(() => preprocessMarkdownDiffs(content), [content]);

  return (
    <div className="markdown-body space-y-2 font-sans leading-relaxed text-fg-muted text-base">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          p: ({ children }) => (
            <div className="leading-[1.8] my-2 text-fg-muted">
              {children}
            </div>
          ),
          h1: ({ children }) => (
            <h1 className="text-xl font-semibold text-fg border-b border-line pb-2 mt-6 mb-3 tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold text-fg-soft border-b border-line/60 pb-1.5 mt-5 mb-2.5 tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-medium text-fg-soft mt-4 mb-2 tracking-tight">
              {children}
            </h3>
          ),
          strong: ({ children }) => (
            <strong className="text-fg font-semibold">
              {children}
            </strong>
          ),
          code: ({ node, inline, className, children, ...props }: any) => {
            const hasLang = /language-(\w+)/.test(className || '');
            const textContent = String(children);
            const isDiff = textContent.includes('SEARCH') && (textContent.includes('<<<<') || textContent.includes('===='));
            
            if (!inline && (hasLang || isDiff || textContent.includes('\n'))) {
              return (
                <CodeBlock 
                  className={className || (isDiff ? 'language-diff' : '')} 
                  onApplyCode={onApplyCode}
                  onApplyDiff={onApplyDiff}
                  onCreateNewFile={onCreateNewFile}
                  activeFileName={activeFileName}
                >
                  {children}
                </CodeBlock>
              );
            }
            return (
              <code
                className="bg-raised text-accent-fg border border-line px-1.5 py-0.5 rounded-control text-sm font-mono font-medium"
                {...props}
              >
                {children}
              </code>
            );
          },
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 text-fg-muted">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 text-fg-muted">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent/40 pl-3 py-1 my-2 bg-surface rounded-r text-fg-subtle text-base italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-line my-4" />
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
