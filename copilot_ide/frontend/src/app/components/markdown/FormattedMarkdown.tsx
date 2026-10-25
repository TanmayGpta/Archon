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
    <div className="markdown-body space-y-2 font-sans leading-relaxed text-[#a0a6b5] text-[13.5px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          p: ({ children }) => (
            <div className="leading-[1.8] my-2 text-[#9da5b4]">
              {children}
            </div>
          ),
          h1: ({ children }) => (
            <h1 className="text-[20px] font-semibold text-[#e2e5ea] border-b border-[#1a1e26] pb-2 mt-6 mb-3 tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[17px] font-semibold text-[#d0d5dd] border-b border-[#1a1e26]/60 pb-1.5 mt-5 mb-2.5 tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[15px] font-medium text-[#c0c6d4] mt-4 mb-2 tracking-tight">
              {children}
            </h3>
          ),
          strong: ({ children }) => (
            <strong className="text-[#e2e5ea] font-semibold">
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
                className="bg-[#12151c] text-[#60a5fa] border border-[#1e232e] px-1.5 py-0.5 rounded text-[11.5px] font-mono font-medium"
                {...props}
              >
                {children}
              </code>
            );
          },
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 text-[#9da5b4]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 text-[#9da5b4]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#3b82f6]/40 pl-3 py-1 my-2 bg-[#0e1015] rounded-r text-[#8892a0] text-[12.5px] italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-[#1a1e26] my-4" />
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
