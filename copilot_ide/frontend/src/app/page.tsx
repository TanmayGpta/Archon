"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { EvaluationDashboard } from './components/EvaluationDashboard';
import CodeKnowledgeGraph, { KnowledgeGraphData, FlowStep } from './components/CodeKnowledgeGraph';
import SourcegraphIndexDrawer from './components/SourcegraphIndexDrawer';
import ContextFileChips, { ContextFileItem, SuggestedFileItem } from './components/ContextFileChips';
import GitHubOpenModal, { GitHubRepoInfo } from './components/GitHubOpenModal';
import AutoForkPromptModal from './components/AutoForkPromptModal';
import { ArcGenStudio } from './components/ArcGenStudio';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

/* ── Professional Sleek SVG Icon Library ───────────────────── */
const Icons = {
  Chart: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Explorer: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" />
    </svg>
  ),
  Search: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  ArchonAI: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  Architecture: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Diagnostics: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Terminal: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  FolderOpen: () => (
    <svg className="w-3.5 h-3.5 text-[#e2b86b] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  FolderClosed: () => (
    <svg className="w-3.5 h-3.5 text-[#e2b86b] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  ),
  FileCode: () => (
    <svg className="w-3.5 h-3.5 text-[#9ca3af] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  FolderPlus: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  ),
  FilePlus: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  ),
  Edit: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  Collapse: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  ),
  Save: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  ),
  Trash: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Copy: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  Bolt: () => (
    <svg className="w-3.5 h-3.5 text-[#60a5fa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Compare: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M12 3v18" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
    </svg>
  ),
  Sparkles: () => (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  ),
  Check: () => (
    <svg className="w-3 h-3 text-[#10b981]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Close: () => (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  User: () => (
    <svg className="w-3.5 h-3.5 text-[#60a5fa]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Book: () => (
    <svg className="w-3 h-3 text-[#10b981]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-3 h-3 text-[#64748b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  ChevronDown: () => (
    <svg className="w-3 h-3 text-[#64748b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
};


/* -- Helper to detect target filename from code content & hints - */
function detectTargetFilename(code: string, lang?: string): string | null {
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

/* -- Strategy Info Definitions ------------------------------- */
const PIPELINE_STAGES = [
  { 
    id: 0, 
    key: 'query',
    label: 'Query', 
    targetTab: 'terminal',
    highlightKey: null,
    sub: 'Tokenizing input',
    description: 'Prepares raw prompt tokens and dispatches dual-stream retrieval across lexical and vector indices.'
  },
  { 
    id: 1, 
    key: 'bm25',
    label: 'BM25', 
    targetTab: 'search',
    highlightKey: 'bm25',
    sub: 'Lexical index',
    description: 'Exact keyword matching via Okapi BM25 scoring over inverted document index tokens.'
  },
  { 
    id: 2, 
    key: 'dense',
    label: 'Dense Vector', 
    targetTab: 'search',
    highlightKey: 'dense',
    sub: 'Semantic embedding',
    description: 'Transforms query into 384-dimensional dense vectors (BAAI/bge-small-en-v1.5) and measures cosine/L2 proximity in ChromaDB.'
  },
  { 
    id: 3, 
    key: 'cross_encoder',
    label: 'Cross-Encoder', 
    targetTab: 'search',
    highlightKey: 'cross_encoder',
    sub: 'Deep attention re-rank',
    description: 'Performs full cross-attention over [Query, Document] pairs using ms-marco-MiniLM-L-6-v2 to score true semantic alignment.'
  },
  { 
    id: 4, 
    key: 'llm',
    label: 'LLM Synthesis', 
    targetTab: 'terminal',
    highlightKey: null,
    sub: 'Streaming tokens',
    description: 'Injects top re-ranked context into local model via Ollama with real-time token streaming.'
  },
];

/* -- File Icon Helper with Clean Badges & SVGs --------------- */
function getFileIcon(filename: string, isDirectory: boolean = false, isOpen: boolean = false) {
  if (isDirectory) {
    return isOpen ? <Icons.FolderOpen /> : <Icons.FolderClosed />;
  }
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (filename === 'Dockerfile' || filename.startsWith('docker-compose')) {
    return <span className="text-[#38bdf8] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#0284c7]/15 rounded border border-[#0284c7]/30">DOCKER</span>;
  }
  switch (ext) {
    case 'ts':
    case 'tsx':
      return <span className="text-[#38bdf8] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#0284c7]/15 rounded border border-[#0284c7]/30">TS</span>;
    case 'js':
    case 'jsx':
    case 'mjs':
      return <span className="text-[#facc15] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#eab308]/15 rounded border border-[#eab308]/30">JS</span>;
    case 'py':
      return <span className="text-[#60a5fa] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#2563eb]/15 rounded border border-[#2563eb]/30">PY</span>;
    case 'json':
      return <span className="text-[#fbbf24] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#f59e0b]/15 rounded border border-[#f59e0b]/30">JSON</span>;
    case 'yaml':
    case 'yml':
      return <span className="text-[#f87171] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#dc2626]/15 rounded border border-[#dc2626]/30">YML</span>;
    case 'md':
      return <span className="text-[#c084fc] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#9333ea]/15 rounded border border-[#9333ea]/30">MD</span>;
    case 'css':
      return <span className="text-[#38bdf8] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#06b6d4]/15 rounded border border-[#06b6d4]/30">CSS</span>;
    case 'sh':
      return <span className="text-[#4ade80] text-[9.5px] font-bold font-mono px-1 py-0.2 bg-[#16a34a]/15 rounded border border-[#16a34a]/30">SH</span>;
    default:
      return <Icons.FileCode />;
  }
}

const ARCHON_ASCII_ART = `                      @%*+-::..::+@                          
                  %-++:.....-.....=%=-=+#@@@@@               
                %-....:--=*=*=.:-.=.:::::*-..+#@             
             @%%........-:+=.::...=-++*-:...::::#@           
            %-.-....:==#.:%..+.:-:.:::+@:..=@#==*@           
           %.=...#..=-=..:%-..::-*#+*%@@=-+%%..::+@          
          @=-:.=:=...##:.:-%+-:-*@@@@@%#*=:-:.:+%-#          
          @*+::::-:...*%+===%@@@@@@%*-.:-=----+%%*+@@        
         @@=-=-.-%#-::...-%@@@@*-.:.....::#@@@#+%*=@@        
        %---.....:@%++*#%%=..............--*@@@@@%#@@        
       @-...::...-.::*%#:...:::-===:......::+@@@@@@@@        
       @:.:%%##=::-+%@+::::-=**#%@@@%+..::--*@@@@@@@         
       @+-:#*%###%%@@+....=*=---+@@@@#:.:%@@@@@@@@@          
        @+*%=%@@#==+#..:......:::##+:...:@@@@@@@@            
         @##-:*@%*#%+...::..............:@@@@@@@             
         @=-*..=%=::.....:..............:@@@@                
         @#=%=...........::::...........-@@@@                
          +..+%+=+..........::..........-@@@@                
          @--=+#@%...........::....+%%#+#@@@                 
           @*.=%*.:.........::::=-=+=%@@@@@@                 
            %*#%:..+::.....:::::.:::=@@@@@@                  
             *=+=...#=-::..:::...:=#@@@@@@                   
              %#*:...+%+-:::::......-%@@@                    
                @::...:%@%=-:-:....::%@@                     
                @-::....+@@@@%+---=#@@@@@                    
                 *::......%@@@@@@@@@@@@@@@                   
                 %:::......=@@@@@@@@@@@@@@@@                 
                 @-::.......:%@@@@@@@@@@@@@@@@@@             
                 @=:::.......-*%@@@@@@@@@@@@@@@              
                  #:::.....:::-+*%@@@@@@@@@@@                
                  @#-::......::-=++#%@@@@@@@                 
                    @*=-......::::=+++*#@                    
                       @*-:...:==+**#@                       `;

/* -- 3-Tier Resilient Search & Replace Diff Engine ----------- */
interface DiffBlock {
  search: string;
  replace: string;
}

function parseDiffBlocks(text: string): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  if (!text) return blocks;

  const regex = /<{3,9}\s*SEARCH\r?\n([\s\S]*?)\r?\n={3,9}\r?\n([\s\S]*?)(?:\r?\n>{0,9}\s*REPLACE|\r?\n(?=<{3,9}\s*SEARCH)|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let search = match[1].trimEnd();
    let replace = match[2].trimEnd();

    // Strip any trailing delimiter artifacts
    replace = replace.replace(/\r?\n>{0,9}\s*REPLACE\s*$/, '').trimEnd();
    if (replace === '>>>>>>> REPLACE' || replace === '>>>> REPLACE' || replace === 'REPLACE') {
      replace = '';
    }
    
    // Strip leading SEARCH markers if present
    search = search.replace(/^<{3,9}\s*SEARCH\r?\n/, '').trimEnd();

    if (search.length > 0 || replace.length > 0) {
      blocks.push({ search, replace });
    }
  }
  return blocks;
}

function preprocessMarkdownDiffs(content: string): string {
  if (!content) return '';
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map(part => {
    if (part.startsWith('```')) return part;
    if (part.includes('SEARCH') && (part.includes('<<<<') || part.includes('===='))) {
      return part.replace(
        /((?:<{3,9}\s*SEARCH[\s\S]*?(?:>{0,9}\s*REPLACE|\n(?=<{3,9}\s*SEARCH)|$))+)/g,
        '\n```diff\n$1\n```\n'
      );
    }
    return part;
  }).join('');
}

function applyDiffBlocks(originalContent: string, diffText: string): { success: boolean; newContent: string; appliedCount: number; errors: string[] } {
  const blocks = parseDiffBlocks(diffText);
  if (blocks.length === 0) {
    return { success: false, newContent: originalContent, appliedCount: 0, errors: ["No valid <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks found."] };
  }

  let currentContent = originalContent;
  let appliedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const { search, replace } = blocks[i];
    if (!search.trim()) continue;

    // ── Tier 1: Exact Substring Match ──
    if (currentContent.includes(search)) {
      currentContent = currentContent.replace(search, replace);
      appliedCount++;
      continue;
    }

    // ── Tier 2: Line-by-Line Whitespace/Indentation-Tolerant Match ──
    const fileLines = currentContent.split('\n');
    const searchLines = search.split('\n').map(l => l.trimEnd());
    const searchLinesTrimmed = searchLines.map(l => l.trim());
    
    let matchedStartIdx = -1;
    for (let fIdx = 0; fIdx <= fileLines.length - searchLines.length; fIdx++) {
      let isMatch = true;
      for (let sIdx = 0; sIdx < searchLines.length; sIdx++) {
        if (fileLines[fIdx + sIdx].trim() !== searchLinesTrimmed[sIdx]) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) {
        matchedStartIdx = fIdx;
        break;
      }
    }

    if (matchedStartIdx !== -1) {
      const matchedFirstLine = fileLines[matchedStartIdx];
      const matchIndent = matchedFirstLine.match(/^(\s*)/)?.[1] || '';
      
      const searchFirstLine = search.split('\n')[0] || '';
      const searchIndent = searchFirstLine.match(/^(\s*)/)?.[1] || '';

      const replaceLines = replace.split('\n').map(line => {
        if (!line.trim()) return line;
        if (line.startsWith(searchIndent)) {
          return matchIndent + line.substring(searchIndent.length);
        }
        return matchIndent + line.trimStart();
      });

      fileLines.splice(matchedStartIdx, searchLines.length, ...replaceLines);
      currentContent = fileLines.join('\n');
      appliedCount++;
      continue;
    }

    // ── Tier 3: Anchor Match (First & Last Line Match with bounded interior) ──
    if (searchLinesTrimmed.length >= 3) {
      const firstSearchLine = searchLinesTrimmed[0];
      const lastSearchLine = searchLinesTrimmed[searchLinesTrimmed.length - 1];

      let anchorStart = -1;
      let anchorEnd = -1;

      for (let fIdx = 0; fIdx < fileLines.length; fIdx++) {
        if (fileLines[fIdx].trim() === firstSearchLine) {
          for (let look = fIdx + 1; look < Math.min(fileLines.length, fIdx + searchLines.length + 6); look++) {
            if (fileLines[look].trim() === lastSearchLine) {
              anchorStart = fIdx;
              anchorEnd = look;
              break;
            }
          }
          if (anchorStart !== -1) break;
        }
      }

      if (anchorStart !== -1 && anchorEnd !== -1) {
        const replaceLines = replace.split('\n');
        fileLines.splice(anchorStart, anchorEnd - anchorStart + 1, ...replaceLines);
        currentContent = fileLines.join('\n');
        appliedCount++;
        continue;
      }
    }

    errors.push(`Diff block #${i + 1} could not be matched in active file.`);
  }

  return {
    success: appliedCount > 0,
    newContent: currentContent,
    appliedCount,
    errors
  };
}

/* -- Code Block with Clean Header, Visual Diff Preview & Surgical Apply -- */
function CodeBlock({ 
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
    <div className="my-3 bg-[#0a0c10] border border-[#1a1e26] rounded-lg overflow-hidden group shadow-md flex flex-col">
      {/* Top Header */}
      <div className="flex justify-between items-center px-3 py-1.5 bg-[#0e1015] border-b border-[#1a1e26] text-[11px] font-mono text-[#4a5060] select-none">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
          {isDiffBlock ? (
            <span className="text-[10px] bg-[#3b82f6]/20 text-[#60a5fa] px-2 py-0.5 rounded border border-[#3b82f6]/40 font-bold flex items-center gap-1.5">
              <Icons.Bolt />
              <span>Surgical Diff Edit • {diffBlocks.length} {diffBlocks.length === 1 ? 'block' : 'blocks'}</span>
            </span>
          ) : (
            <span className="uppercase tracking-wider text-[#94a3b8] font-bold text-[10px] bg-[#161922] px-1.5 py-0.5 rounded border border-[#222734] flex-shrink-0">
              {lang}
            </span>
          )}
          {detectedFile && (
            <span className="text-[10px] text-[#60a5fa] bg-[#12151c] px-2 py-0.5 rounded border border-[#1e232e] truncate font-medium flex items-center gap-1.5" title={detectedFile}>
              <Icons.FileCode />
              <span className="truncate">{detectedFile}</span>
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="text-[#8b949e] hover:text-[#e2e5ea] bg-[#161922] hover:bg-[#222734] px-2 py-0.5 rounded transition-colors text-[10.5px] font-mono flex items-center gap-1 cursor-pointer border border-[#222734] flex-shrink-0"
        >
          {copied ? <span className="text-[#10b981] flex items-center gap-1"><Icons.Check /> Copied</span> : <span className="flex items-center gap-1"><Icons.Copy /> Copy</span>}
        </button>
      </div>

      {/* Code / Diff Window */}
      <div className="p-3.5 overflow-x-auto custom-scrollbar bg-[#08090a]">
        {isDiffBlock ? (
          <div className="space-y-3 font-mono text-[12px] leading-[1.65]">
            {diffBlocks.map((blk, idx) => (
              <div key={idx} className="border border-[#1e232e] rounded-md overflow-hidden">
                <div className="bg-[#ef4444]/10 border-b border-[#ef4444]/20 px-2.5 py-1 text-[10.5px] text-[#ef4444] font-semibold flex items-center gap-1">
                  <span>- ORIGINAL (SEARCH)</span>
                </div>
                <pre className="p-2.5 bg-[#140a0c] text-[#fca5a5] overflow-x-auto custom-scrollbar whitespace-pre">
                  <code>{blk.search}</code>
                </pre>
                <div className="bg-[#10b981]/10 border-y border-[#10b981]/20 px-2.5 py-1 text-[10.5px] text-[#10b981] font-semibold flex items-center gap-1">
                  <span>+ REPLACEMENT (REPLACE)</span>
                </div>
                <pre className="p-2.5 bg-[#081510] text-[#86efac] overflow-x-auto custom-scrollbar whitespace-pre">
                  <code>{blk.replace}</code>
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <pre className="text-[12px] font-mono leading-[1.65] text-[#93c5fd] selection:bg-[#3b82f6]/30">
            <code>{text}</code>
          </pre>
        )}
      </div>

      {/* Action Toolbar */}
      {(onApplyDiff || onApplyCode || (isDifferentFromActive && onCreateNewFile && detectedFile)) && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-[#0c0e12] border-t border-[#161922] select-none">
          {/* Create & Open new file button */}
          {!isDiffBlock && isDifferentFromActive && onCreateNewFile && detectedFile && (
            <button
              onClick={handleCreateFile}
              className="flex-1 min-w-[130px] text-[#10b981] hover:text-white bg-[#10b981]/15 hover:bg-[#10b981] px-2.5 py-1 rounded text-[11px] font-mono flex items-center justify-center gap-1.5 cursor-pointer border border-[#10b981]/30 transition-all font-semibold shadow-sm"
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
              className={`flex-1 min-w-[110px] text-white px-2.5 py-1.5 rounded text-[11px] font-mono flex items-center justify-center gap-1.5 cursor-pointer transition-all font-semibold shadow-sm ${
                isDiffBlock
                  ? 'bg-[#2563eb] hover:bg-[#1d4ed8] border border-[#3b82f6]/50 shadow-[#3b82f6]/20'
                  : 'bg-[#1e293b]/80 hover:bg-[#2563eb] border border-[#3b82f6]/30 text-[#60a5fa] hover:text-white'
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

/* -- Rich Markdown Renderer (Hydration Safe) ----------------- */
function FormattedMarkdown({ 
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

/* -- Interactive RAG Pipeline Visualization ------------------ */
function RagPipeline({ 
  currentStage, 
  onNavigateStage 
}: { 
  currentStage: number; 
  onNavigateStage: (stage: typeof PIPELINE_STAGES[0]) => void;
}) {
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  return (
    <div className="border border-[#1a1e26] bg-[#090b0e] rounded-xl p-5 mb-8 relative overflow-hidden transition-all duration-500 animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse-slow" />
          <span className="text-[10px] font-mono text-[#4a5060] tracking-[0.2em] uppercase font-semibold">
            Interactive Retrieval Pipeline
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#333a48]">
          Click any stage node to jump to diagnostic inspector
        </span>
      </div>

      <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
        {PIPELINE_STAGES.map((s, i) => {
          const isActive = currentStage === s.id;
          const isDone = currentStage > s.id;
          const isHovered = hoveredNode === s.id;

          return (
            <React.Fragment key={s.id}>
              <button
                type="button"
                onClick={() => onNavigateStage(s)}
                onMouseEnter={() => setHoveredNode(s.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className={`group flex-1 min-w-[130px] p-3 rounded-lg border text-left transition-all duration-300 cursor-pointer relative ${
                  isActive
                    ? 'bg-[#3b82f6]/10 border-[#3b82f6]/50 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-[#3b82f6]/30'
                    : isDone
                      ? 'bg-[#10b981]/5 border-[#10b981]/30 hover:border-[#10b981]/50'
                      : isHovered
                        ? 'bg-[#0e1015] border-[#282e3a] shadow-lg'
                        : 'bg-[#08090a] border-[#1a1e26] hover:border-[#282e3a]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[9px] font-mono font-bold tracking-wider uppercase ${
                    isActive ? 'text-[#60a5fa]' : isDone ? 'text-[#10b981]' : 'text-[#4a5060]'
                  }`}>
                    0{s.id + 1}
                  </span>
                  <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    isActive ? 'bg-[#3b82f6] animate-ping' : isDone ? 'bg-[#10b981]' : 'bg-[#1a1e26] group-hover:bg-[#4a5060]'
                  }`} />
                </div>
                <div className={`text-[12px] font-mono font-semibold truncate transition-colors duration-300 ${
                  isActive ? 'text-[#e2e5ea]' : isDone ? 'text-[#c8ccd0]' : 'text-[#8b92a0] group-hover:text-[#e2e5ea]'
                }`}>
                  {s.label}
                </div>
                <div className="text-[10px] font-mono text-[#4a5060] truncate mt-0.5">
                  {s.sub}
                </div>
              </button>
              {i < PIPELINE_STAGES.length - 1 && (
                <div className="w-4 h-px relative flex-shrink-0">
                  <div className={`h-full transition-all duration-700 ${
                    currentStage > i ? 'bg-[#10b981]/60' : 'bg-[#1a1e26]'
                  }`} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* -- File Explorer Tree Node --------------------------------- */
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  size?: number;
  children?: TreeNode[];
}

function FileTreeNode({
  node,
  activePath,
  onSelectFile,
  onDelete,
  onRename,
  onNewFileInDir,
  onNewFolderInDir,
  depth = 0
}: {
  node: TreeNode;
  activePath: string;
  onSelectFile: (path: string) => void;
  onDelete?: (path: string, isDir: boolean) => void;
  onRename?: (path: string, oldName: string) => void;
  onNewFileInDir?: (parentPath: string) => void;
  onNewFolderInDir?: (parentPath: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.type === 'directory';
  const isActive = node.path === activePath;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDir) {
      setExpanded(!expanded);
    } else {
      onSelectFile(node.path);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        draggable={!isDir}
        onDragStart={(e) => {
          if (!isDir) {
            e.dataTransfer.setData("application/json", JSON.stringify({ path: node.path, name: node.name }));
            e.dataTransfer.effectAllowed = "copy";
          }
        }}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer text-[12px] font-mono select-none transition-colors group relative ${
          isActive
            ? 'bg-[#1d222e] text-[#60a5fa] font-medium'
            : 'text-[#9ca3af] hover:bg-[#12151c] hover:text-[#e2e5ea]'
        }`}
      >
        <span className="w-3.5 flex items-center justify-center flex-shrink-0">
          {isDir ? (expanded ? <Icons.ChevronDown /> : <Icons.ChevronRight />) : null}
        </span>
        {getFileIcon(node.name, isDir, expanded)}
        <span className="truncate flex-1 ml-0.5" title={node.path}>{node.name}</span>

        {/* Hover Action Buttons */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 bg-[#0c0e12]/90 rounded px-1 flex-shrink-0">
          {isDir && onNewFileInDir && (
            <button
              onClick={(e) => { e.stopPropagation(); onNewFileInDir(node.path); }}
              title="New File inside folder"
              className="text-[#64748b] hover:text-[#60a5fa] p-0.5 rounded cursor-pointer"
            >
              <Icons.FilePlus />
            </button>
          )}
          {isDir && onNewFolderInDir && (
            <button
              onClick={(e) => { e.stopPropagation(); onNewFolderInDir(node.path); }}
              title="New Folder inside folder"
              className="text-[#64748b] hover:text-[#60a5fa] p-0.5 rounded cursor-pointer"
            >
              <Icons.FolderPlus />
            </button>
          )}
          {onRename && (
            <button
              onClick={(e) => { e.stopPropagation(); onRename(node.path, node.name); }}
              title="Rename"
              className="text-[#64748b] hover:text-[#cbd5e1] p-0.5 rounded cursor-pointer"
            >
              <Icons.Edit />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node.path, isDir); }}
              title="Delete"
              className="text-[#64748b] hover:text-[#ef4444] p-0.5 rounded cursor-pointer"
            >
              <Icons.Trash />
            </button>
          )}
        </div>
      </div>

      {isDir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              activePath={activePath}
              onSelectFile={onSelectFile}
              onDelete={onDelete}
              onRename={onRename}
              onNewFileInDir={onNewFileInDir}
              onNewFolderInDir={onNewFolderInDir}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -- Syntax Highlighting Engine (Token-level) ---------------- */
function highlightCodeLine(line: string) {
  if (!line) return <span>&nbsp;</span>;
  
  const tokens: React.ReactNode[] = [];
  const regex = /(\/\/.*$|#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:def|function|const|let|var|class|import|from|export|return|if|else|elif|for|while|try|except|catch|finally|async|await|type|interface|extends|implements|new|this|self|null|undefined|true|false|None|True|False)\b|\b(?:print|console|log|require|fetch|len|range|str|int|dict|list|set|open|useState|useEffect|useRef)\b|\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\()|\b\d+\.?\d*\b|[{}()\[\].,;+\-*\/=<>!&|?:%])/g;
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(<span key={lastIndex} className="text-[#c9d1d9]">{line.substring(lastIndex, match.index)}</span>);
    }

    const token = match[0];
    if (token.startsWith('//') || token.startsWith('#')) {
      tokens.push(<span key={match.index} className="text-[#6a737d] italic">{token}</span>);
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      tokens.push(<span key={match.index} className="text-[#9ece6a]">{token}</span>);
    } else if (/^\b(?:def|function|const|let|var|class|import|from|export|return|if|else|elif|for|while|try|except|catch|finally|async|await|type|interface|extends|implements|new)\b$/.test(token)) {
      tokens.push(<span key={match.index} className="text-[#bb9af7] font-semibold">{token}</span>);
    } else if (/^\b(?:this|self|null|undefined|true|false|None|True|False)\b$/.test(token)) {
      tokens.push(<span key={match.index} className="text-[#ff9e64]">{token}</span>);
    } else if (/^\b(?:print|console|log|require|fetch|len|range|str|int|dict|list|set|open|useState|useEffect|useRef)\b$/.test(token)) {
      tokens.push(<span key={match.index} className="text-[#7dcfff]">{token}</span>);
    } else if (/^\d+\.?\d*$/.test(token)) {
      tokens.push(<span key={match.index} className="text-[#ff9e64]">{token}</span>);
    } else if (/^[{}()\[\].,;+\-*\/=<>!&|?:%]$/.test(token)) {
      tokens.push(<span key={match.index} className="text-[#89ddff]">{token}</span>);
    } else {
      tokens.push(<span key={match.index} className="text-[#7aa2f7]">{token}</span>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push(<span key={lastIndex} className="text-[#c9d1d9]">{line.substring(lastIndex)}</span>);
  }

  return tokens;
}

/* -- Interactive Multi-Tab Terminal State --------------------- */
interface TerminalTab {
  id: string;
  name: string;
  history: Array<{ type: 'input' | 'stdout' | 'stderr' | 'system'; text: string }>;
  commandHistory: string[];
  historyIndex: number;
  input: string;
  cwd: string;
}

interface RAGSource {
  title: string;
  file: string;
  score: string | number;
  rank: number;
  text: string;
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rag_sources?: RAGSource[];
  status?: string;
  flowSequence?: string[];
  flowSteps?: FlowStep[];
}

/* -- VS Code Style Archon Agent IDE Workspace ---------------- */
function VSCodeAgentIDE({
  apiBase,
  models,
  setModels,
  selectedModel,
  setSelectedModel,
}: {
  apiBase: string;
  models: string[];
  setModels?: (m: string[]) => void;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
}) {
  // Project & Workspace State
  const [currentProjectName, setCurrentProjectName] = useState('AIDeV');
  const [currentProjectPath, setCurrentProjectPath] = useState('D:/AIDeV');
  const [gitBranch, setGitBranch] = useState('main');
  const [recentProjects, setRecentProjects] = useState<string[]>(['D:/AIDeV', 'C:/Users/gaura']);
  const [showOpenProjectModal, setShowOpenProjectModal] = useState(false);
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [showIndexDrawer, setShowIndexDrawer] = useState(false);
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false);
  const [knowledgeGraphData, setKnowledgeGraphData] = useState<KnowledgeGraphData | null>(null);
  const [activeFlowSequence, setActiveFlowSequence] = useState<string[] | null>(null);
  const [activeFlowSteps, setActiveFlowSteps] = useState<FlowStep[] | null>(null);
  
  // Remote Clone-Free GitHub Workspace State
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [showAutoForkModal, setShowAutoForkModal] = useState(false);
  const [githubRepoInfo, setGithubRepoInfo] = useState<GitHubRepoInfo | null>(null);
  const [githubToken, setGithubToken] = useState('');
  const [isGitHubWorkspace, setIsGitHubWorkspace] = useState(false);
  const [currentGitHubBranch, setCurrentGitHubBranch] = useState('main');
  const [remoteFileShas, setRemoteFileShas] = useState<Record<string, string>>({});

  const [apiKeys, setApiKeys] = useState<{[provider: string]: {configured: boolean; masked_key: string}}>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<{[provider: string]: string}>({openai: '', anthropic: '', gemini: ''});
  const [apiKeySaveStatus, setApiKeySaveStatus] = useState<{[provider: string]: string}>({});
  const [apiKeyTestStatus, setApiKeyTestStatus] = useState<{[provider: string]: {status: 'testing'|'ok'|'error'; latency?: number; message?: string}}>({});
  const [projectPathInput, setProjectPathInput] = useState('');
  
  // File Explorer State
  const [workspaceTree, setWorkspaceTree] = useState<TreeNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [inlineCreateState, setInlineCreateState] = useState<{ parentPath: string; isDir: boolean } | null>(null);
  const [inlineCreateName, setInlineCreateName] = useState('');
  
  // Quick Open (Ctrl+P) State
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [allFiles, setAllFiles] = useState<Array<{ name: string; path: string; extension: string }>>([]);
  const [quickOpenIndex, setQuickOpenIndex] = useState(0);
  const quickOpenInputRef = useRef<HTMLInputElement>(null);
  
  // Tabbed Editor State
  const [openTabs, setOpenTabs] = useState<{ path: string; name: string; content: string; original: string }[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string>('');
  const [editorContent, setEditorContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [foldedLines, setFoldedLines] = useState<Record<number, boolean>>({});
  const [lastAppliedNotice, setLastAppliedNotice] = useState<string | null>(null);
  
  // Synchronized Scroll Refs
  const gutterRef = useRef<HTMLDivElement>(null);
  const syntaxRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Layout & Activity State
  const [activeActivity, setActiveActivity] = useState<'explorer' | 'search' | 'copilot' | 'diagnostics'>('explorer');
  const [showBottomPanel, setShowBottomPanel] = useState<boolean>(true);
  const [bottomTab, setBottomTab] = useState<'terminal' | 'output' | 'diagnostics'>('terminal');

  // Interactive Multi-Terminal State
  const [terminals, setTerminals] = useState<TerminalTab[]>([
    {
      id: 'term-1',
      name: 'bash 1',
      history: [
        { type: 'system', text: `Archon Interactive Shell v2.0 initialized in ${currentProjectPath}. Type any command (e.g. ls, git status, npm test, python)...` }
      ],
      commandHistory: [],
      historyIndex: -1,
      input: '',
      cwd: 'D:/AIDeV'
    }
  ]);
  const [activeTermId, setActiveTermId] = useState('term-1');
  const [executingCmd, setExecutingCmd] = useState(false);
  const [terminalCopied, setTerminalCopied] = useState(false);
  const termScrollRef = useRef<HTMLDivElement>(null);
  const termInputRef = useRef<HTMLInputElement>(null);

  // Archon Agent Multi-Turn Chat & Auto-Apply State
  const [autoApplyEdits, setAutoApplyEdits] = useState<boolean>(false);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "**Archon Agent ready.**\n\nI have context of your workspace files and integrated Hybrid RAG API documentation. Ask me to generate API code, refactor functions, write tests, or optimize endpoints. You can apply generated code blocks directly into your editor or enable Auto-Apply."
    }
  ]);

  const [agentInput, setAgentInput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [includeFileContext, setIncludeFileContext] = useState(true);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Attached Context Files & OmniKey 95/2 File Suggestions
  const [contextFiles, setContextFiles] = useState<ContextFileItem[]>([]);
  const [suggestedFiles, setSuggestedFiles] = useState<SuggestedFileItem[]>([]);
  const [isDraggingOverChat, setIsDraggingOverChat] = useState(false);

  const handleAddContextFile = async (path: string, name?: string) => {
    if (contextFiles.some(f => f.path === path)) return;
    const fileName = name || path.split('/').pop() || path;
    const item: ContextFileItem = { path, name: fileName };
    setContextFiles(prev => [...prev, item]);

    try {
      const res = await fetch(`${apiBase}/api/workspace/file?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setContextFiles(prev => prev.map(f => f.path === path ? { ...f, content: data.content } : f));
      }
    } catch (e) {
      console.error("Failed to read context file content", e);
    }
  };

  const handleRemoveContextFile = (path: string) => {
    setContextFiles(prev => prev.filter(f => f.path !== path));
  };

  // Debounced 95/2 Rule Pre-Prompt Suggestion via OmniKey
  useEffect(() => {
    const trimmed = agentInput.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);

    // Fire after 1+ words with at least 3 chars AND 1.5s pause
    if (words.length < 1 || trimmed.length < 3) {
      setSuggestedFiles([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const activeTab = openTabs.find(t => t.path === activeTabPath);
        const res = await fetch(`${apiBase}/api/agent/suggest-files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmed,
            active_file_path: activeTab?.path || null,
            attached_files: contextFiles.map(c => c.path)
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.suggestions)) {
            setSuggestedFiles(data.suggestions);
          }
        }
      } catch (err) {
        console.error("Failed to fetch file suggestions", err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [agentInput, activeTabPath, contextFiles, apiBase, openTabs]);

  // Synchronized Editor Scrolling (Textarea -> Gutter & Syntax Highlight Layer)
  const handleEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    if (gutterRef.current) {
      gutterRef.current.scrollTop = target.scrollTop;
    }
    if (syntaxRef.current) {
      syntaxRef.current.scrollTop = target.scrollTop;
      syntaxRef.current.scrollLeft = target.scrollLeft;
    }
  };

  // Load Projects, Git Branch, and Workspace Tree
  const fetchProjectsAndTree = async () => {
    setLoadingTree(true);
    try {
      const projRes = await fetch(`${apiBase}/api/workspace/projects`);
      if (projRes.ok) {
        const projData = await projRes.json();
        setCurrentProjectName(projData.current_project || 'AIDeV');
        setCurrentProjectPath(projData.project_path || 'D:/AIDeV');
        setGitBranch(projData.git_branch || 'main');
        setRecentProjects(projData.recent_projects || ['D:/AIDeV']);
        setTerminals(prev => prev.map(t => ({ ...t, cwd: projData.project_path || t.cwd })));
      }

      const treeRes = await fetch(`${apiBase}/api/workspace/tree`);
      if (treeRes.ok) {
        const treeData = await treeRes.json();
        setWorkspaceTree(treeData.tree || []);
      }
    } catch (e) {
      console.error("Failed to load workspace", e);
    }
    setLoadingTree(false);
  };

  useEffect(() => {
    fetchProjectsAndTree();
    fetchApiKeyStatus();
    // Fetch cached Knowledge Graph if present
    fetch(`${apiBase}/api/workspace/graph`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.nodes && d.nodes.length > 0) {
          setKnowledgeGraphData(d);
        }
      })
      .catch(() => {});
  }, [apiBase]);

  // Open Any Custom Folder / Project (with create_if_missing)
  const handleOpenProject = async (targetPath: string, shouldCreate: boolean = false) => {
    if (!targetPath.trim()) return;
    try {
      const res = await fetch(`${apiBase}/api/workspace/open-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath.trim(), create_if_missing: shouldCreate })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentProjectName(data.current_project);
        setCurrentProjectPath(data.project_path);
        setGitBranch(data.git_branch || 'main');
        setRecentProjects(data.recent_projects || []);
        setShowOpenProjectModal(false);
        setOpenTabs([]);
        setActiveTabPath('');
        setEditorContent('');
        setFoldedLines({});
        setTerminals(prev => prev.map(t => ({ ...t, cwd: data.project_path })));
        
        // Refresh File Explorer Tree immediately
        const treeRes = await fetch(`${apiBase}/api/workspace/tree`);
        if (treeRes.ok) {
          const treeData = await treeRes.json();
          setWorkspaceTree(treeData.tree || []);
        }

        // Open README.md if present
        setTimeout(async () => {
          try {
            const readmeRes = await fetch(`${apiBase}/api/workspace/file?path=README.md`);
            if (readmeRes.ok) {
              const fileData = await readmeRes.json();
              const newTab = {
                path: fileData.path,
                name: fileData.filename,
                content: fileData.content,
                original: fileData.content
              };
              setOpenTabs([newTab]);
              setActiveTabPath(fileData.path);
              setEditorContent(fileData.content);
            }
          } catch (err) {}
        }, 150);
      } else {
        const err = await res.json();
        alert(`Could not open folder: ${err.detail || 'Directory not found'}`);
      }
    } catch (e) {
      alert("Failed to connect to workspace service.");
    }
  };

  // Terminal: Add new terminal tab
  const handleAddTerminal = () => {
    const nextNum = terminals.length + 1;
    const newId = `term-${Date.now()}`;
    const newTerm: TerminalTab = {
      id: newId,
      name: `bash ${nextNum}`,
      history: [
        { type: 'system', text: `Session bash ${nextNum} started in ${currentProjectPath}` }
      ],
      commandHistory: [],
      historyIndex: -1,
      input: '',
      cwd: currentProjectPath
    };
    setTerminals(prev => [...prev, newTerm]);
    setActiveTermId(newId);
  };

  // Terminal: Close terminal tab
  const handleCloseTerminal = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (terminals.length <= 1) return;
    const remaining = terminals.filter(t => t.id !== id);
    setTerminals(remaining);
    if (activeTermId === id) {
      setActiveTermId(remaining[remaining.length - 1].id);
    }
  };

  // Terminal: Copy buffer text
  const handleCopyTerminalBuffer = () => {
    const currentTerm = terminals.find(t => t.id === activeTermId);
    if (!currentTerm) return;
    const allText = currentTerm.history.map(h => h.text).join('\n');
    navigator.clipboard.writeText(allText);
    setTerminalCopied(true);
    setTimeout(() => setTerminalCopied(false), 2000);
  };

  // Terminal: Run command
  const handleRunTerminalCommand = async () => {
    const currentTerm = terminals.find(t => t.id === activeTermId);
    if (!currentTerm) return;
    const rawCmd = currentTerm.input.trim();
    if (!rawCmd || executingCmd) return;

    // Handle clear
    if (rawCmd === 'clear') {
      setTerminals(prev => prev.map(t => t.id === activeTermId ? {
        ...t,
        history: [],
        commandHistory: [...t.commandHistory, rawCmd],
        historyIndex: -1,
        input: ''
      } : t));
      return;
    }

    const nextHistory = [
      ...currentTerm.history,
      { type: 'input' as const, text: `$ ${rawCmd}` }
    ];

    setTerminals(prev => prev.map(t => t.id === activeTermId ? {
      ...t,
      history: nextHistory,
      commandHistory: [...t.commandHistory, rawCmd],
      historyIndex: -1,
      input: ''
    } : t));

    setExecutingCmd(true);

    try {
      const res = await fetch(`${apiBase}/api/terminal/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: rawCmd,
          terminal_id: activeTermId,
          cwd: currentTerm.cwd
        })
      });

      if (res.ok) {
        const data = await res.json();
        const outputItems: Array<{ type: 'stdout' | 'stderr'; text: string }> = [];
        if (data.stdout) outputItems.push({ type: 'stdout', text: data.stdout });
        if (data.stderr) outputItems.push({ type: 'stderr', text: data.stderr });

        if (data.git_branch) {
          setGitBranch(data.git_branch);
        }

        // If directory changed via cd or command
        if (data.project_name) {
          setCurrentProjectName(data.project_name);
        }
        if (data.cwd) {
          setCurrentProjectPath(data.cwd);
        }

        // Always refresh file explorer tree so created/deleted/renamed files or branch checkouts show up immediately
        try {
          const treeRes = await fetch(`${apiBase}/api/workspace/tree`);
          if (treeRes.ok) {
            const treeData = await treeRes.json();
            setWorkspaceTree(treeData.tree || []);
            if (treeData.root) setCurrentProjectName(treeData.root);
            if (treeData.root_path) setCurrentProjectPath(treeData.root_path);
          }
        } catch (e) {}

        setTerminals(prev => prev.map(t => t.id === activeTermId ? {
          ...t,
          history: [...t.history, ...outputItems],
          cwd: data.cwd || t.cwd
        } : t));
      } else {
        setTerminals(prev => prev.map(t => t.id === activeTermId ? {
          ...t,
          history: [...t.history, { type: 'stderr', text: 'Error: Terminal subprocess failed.' }]
        } : t));
      }
    } catch (e) {
      setTerminals(prev => prev.map(t => t.id === activeTermId ? {
        ...t,
        history: [...t.history, { type: 'stderr', text: 'Connection to terminal service failed.' }]
      } : t));
    }

    setExecutingCmd(false);
  };

  // Terminal: History navigation
  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentTerm = terminals.find(t => t.id === activeTermId);
    if (!currentTerm) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      handleRunTerminalCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentTerm.commandHistory.length === 0) return;
      const nextIdx = currentTerm.historyIndex === -1 ? currentTerm.commandHistory.length - 1 : Math.max(0, currentTerm.historyIndex - 1);
      const cmd = currentTerm.commandHistory[nextIdx];
      setTerminals(prev => prev.map(t => t.id === activeTermId ? { ...t, input: cmd, historyIndex: nextIdx } : t));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentTerm.historyIndex === -1) return;
      const nextIdx = currentTerm.historyIndex + 1;
      if (nextIdx >= currentTerm.commandHistory.length) {
        setTerminals(prev => prev.map(t => t.id === activeTermId ? { ...t, input: '', historyIndex: -1 } : t));
      } else {
        const cmd = currentTerm.commandHistory[nextIdx];
        setTerminals(prev => prev.map(t => t.id === activeTermId ? { ...t, input: cmd, historyIndex: nextIdx } : t));
      }
    }
  };

  // Auto-scroll terminal
  useEffect(() => {
    if (termScrollRef.current) {
      termScrollRef.current.scrollTop = termScrollRef.current.scrollHeight;
    }
  }, [terminals, executingCmd]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [agentMessages]);

  // Open a file from explorer (Local or Remote GitHub)
  const handleOpenFile = async (path: string) => {
    const existing = openTabs.find(t => t.path === path);
    if (existing) {
      setActiveTabPath(path);
      setEditorContent(existing.content);
      setIsDirty(existing.content !== existing.original);
      return;
    }

    // Remote GitHub Workspace file fetch
    if (isGitHubWorkspace && githubRepoInfo) {
      try {
        const url = `${apiBase}/api/github/file?owner=${githubRepoInfo.owner}&repo=${githubRepoInfo.repo}&path=${encodeURIComponent(path)}&branch=${currentGitHubBranch}${githubToken ? `&token=${encodeURIComponent(githubToken)}` : ''}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.sha) {
            setRemoteFileShas(prev => ({ ...prev, [path]: data.sha }));
          }
          const newTab = {
            path: data.path,
            name: path.split('/').pop() || path,
            content: data.content,
            original: data.content
          };
          setOpenTabs(prev => [...prev, newTab]);
          setActiveTabPath(data.path);
          setEditorContent(data.content);
          setIsDirty(false);
          setFoldedLines({});
          return;
        }
      } catch (err) {
        console.error("Could not read remote GitHub file", err);
      }
    }

    // Local workspace file fetch
    try {
      const res = await fetch(`${apiBase}/api/workspace/file?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        const newTab = {
          path: data.path,
          name: data.filename,
          content: data.content,
          original: data.content
        };
        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabPath(data.path);
        setEditorContent(data.content);
        setIsDirty(false);
        setFoldedLines({});
      }
    } catch (e) {
      console.error("Could not read file", e);
    }
  };

  // Create and open a new file in workspace
  const handleCreateAndOpenFile = async (filename: string, content: string) => {
    try {
      const res = await fetch(`${apiBase}/api/workspace/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filename, content: content })
      });
      if (res.ok) {
        const newTab = { path: filename, name: filename, content: content, original: content };
        setOpenTabs(prev => {
          const idx = prev.findIndex(t => t.path === filename);
          if (idx >= 0) {
            const clone = [...prev];
            clone[idx] = newTab;
            return clone;
          }
          return [...prev, newTab];
        });
        setActiveTabPath(filename);
        setEditorContent(content);
        setIsDirty(false);
        setLastAppliedNotice(`Created & opened ${filename} in workspace`);
        setTimeout(() => setLastAppliedNotice(null), 5000);

        // Refresh File Tree
        const treeRes = await fetch(`${apiBase}/api/workspace/tree`);
        if (treeRes.ok) {
          const treeData = await treeRes.json();
          setWorkspaceTree(treeData.tree || []);
        }
      }
    } catch (e) {
      console.error("Failed to create file", e);
    }
  };

  // Close tab
  const handleCloseTab = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const filtered = openTabs.filter(t => t.path !== path);
    setOpenTabs(filtered);
    if (activeTabPath === path) {
      if (filtered.length > 0) {
        const next = filtered[filtered.length - 1];
        setActiveTabPath(next.path);
        setEditorContent(next.content);
        setIsDirty(next.content !== next.original);
      } else {
        setActiveTabPath('');
        setEditorContent('');
        setIsDirty(false);
      }
    }
  };

  // Update editor content
  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditorContent(val);
    const active = openTabs.find(t => t.path === activeTabPath);
    if (active) {
      setIsDirty(val !== active.original);
      setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: val } : t));
    }
  };

  // Track cursor position
  const handleEditorSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const pos = target.selectionStart;
    const textBefore = target.value.substring(0, pos);
    const lines = textBefore.split('\n');
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1
    });
  };

  // Save file to backend or GitHub commit (Ctrl+S)
  const handleSaveFile = async () => {
    if (!activeTabPath) return;

    // Direct commit to remote GitHub repository without local cloning
    if (isGitHubWorkspace && githubRepoInfo) {
      setSaveStatus('Committing to GitHub...');
      try {
        const res = await fetch(`${apiBase}/api/github/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: githubRepoInfo.owner,
            repo: githubRepoInfo.repo,
            path: activeTabPath,
            content: editorContent,
            commit_message: `Update ${activeTabPath} via Archon Copilot`,
            branch: currentGitHubBranch,
            sha: remoteFileShas[activeTabPath] || undefined,
            token: githubToken || undefined
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.new_file_sha) {
            setRemoteFileShas(prev => ({ ...prev, [activeTabPath]: data.new_file_sha }));
          }
          setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, original: editorContent } : t));
          setIsDirty(false);
          setSaveStatus('✓ Committed to GitHub');
          setLastAppliedNotice(null);
          setTimeout(() => setSaveStatus(''), 2500);
          return;
        } else {
          const errData = await res.text();
          setSaveStatus('❌ Commit Failed');
          alert(`GitHub Commit Failed: ${errData}`);
          return;
        }
      } catch (e: any) {
        setSaveStatus('❌ Commit Failed');
        alert(`GitHub Commit Error: ${e?.message || e}`);
        return;
      }
    }

    // Local workspace save
    setSaveStatus('Saving...');
    try {
      const res = await fetch(`${apiBase}/api/workspace/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activeTabPath, content: editorContent })
      });
      if (res.ok) {
        setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, original: editorContent } : t));
        setIsDirty(false);
        setSaveStatus('✓ Saved');
        setLastAppliedNotice(null);
        setTimeout(() => setSaveStatus(''), 2000);
      } else {
        setSaveStatus('❌ Error');
      }
    } catch (e) {
      setSaveStatus('❌ Failed');
    }
  };

  // Code Folding Toggle
  const toggleFold = (lineIndex: number) => {
    setFoldedLines(prev => ({ ...prev, [lineIndex]: !prev[lineIndex] }));
  };

  // Global Shortcut Listener (Ctrl+P Quick Open, Ctrl+W Close Tab, Ctrl+S Save, Escape)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setShowQuickOpen(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        if (activeTabPath) {
          handleCloseTab(activeTabPath);
        }
      } else if (e.key === 'Escape') {
        setShowQuickOpen(false);
        setInlineCreateState(null);
        setShowOpenProjectModal(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeTabPath, openTabs]);

  // Fetch cloud API key status
  const fetchApiKeyStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/api/cloud/keys`);
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.providers || {});
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
    } catch (e: any) {
      setApiKeyTestStatus(prev => ({ ...prev, [provider]: { status: 'error', message: e.message || 'Network error' } }));
    }
  };

  // Fetch all searchable files for Quick Open
  const fetchAllFiles = async () => {
    try {
      const res = await fetch(`${apiBase}/api/workspace/all-files`);
      if (res.ok) {
        const data = await res.json();
        setAllFiles(data.files || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (showQuickOpen) {
      fetchAllFiles();
      setQuickOpenQuery('');
      setQuickOpenIndex(0);
      setTimeout(() => quickOpenInputRef.current?.focus(), 50);
    }
  }, [showQuickOpen]);

  // Delete File or Directory
  const handleDeleteItem = async (targetPath: string, isDir: boolean) => {
    const confirmed = window.confirm(`Are you sure you want to delete ${isDir ? 'folder' : 'file'} "${targetPath}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`${apiBase}/api/workspace/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath })
      });
      if (res.ok) {
        setOpenTabs(prev => prev.filter(t => isDir ? !t.path.startsWith(targetPath) : t.path !== targetPath));
        if (isDir ? activeTabPath.startsWith(targetPath) : activeTabPath === targetPath) {
          setActiveTabPath('');
          setEditorContent('');
        }
        fetchProjectsAndTree();
      } else {
        const err = await res.json();
        alert(`Failed to delete: ${err.detail || 'Error'}`);
      }
    } catch (e) {
      alert("Error connecting to workspace service.");
    }
  };

  // Rename File or Directory
  const handleRenameItem = async (oldPath: string, oldName: string) => {
    const newName = window.prompt(`Rename "${oldName}" to:`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    const parts = oldPath.split('/');
    parts[parts.length - 1] = newName.trim();
    const newPath = parts.join('/');

    try {
      const res = await fetch(`${apiBase}/api/workspace/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_path: oldPath, new_path: newPath })
      });
      if (res.ok) {
        setOpenTabs(prev => prev.map(t => {
          if (t.path === oldPath) {
            return { ...t, path: newPath, name: newName.trim() };
          }
          if (t.path.startsWith(oldPath + '/')) {
            const updated = newPath + t.path.substring(oldPath.length);
            return { ...t, path: updated };
          }
          return t;
        }));
        if (activeTabPath === oldPath) {
          setActiveTabPath(newPath);
        }
        fetchProjectsAndTree();
      } else {
        const err = await res.json();
        alert(`Failed to rename: ${err.detail || 'Error'}`);
      }
    } catch (e) {
      alert("Error connecting to workspace service.");
    }
  };

  // Confirm inline creation of file or folder
  const handleConfirmInlineCreate = async () => {
    if (!inlineCreateState || !inlineCreateName.trim()) {
      setInlineCreateState(null);
      setInlineCreateName('');
      return;
    }
    const { parentPath, isDir } = inlineCreateState;
    const cleanName = inlineCreateName.trim();
    const fullPath = parentPath ? `${parentPath}/${cleanName}` : cleanName;

    try {
      const res = await fetch(`${apiBase}/api/workspace/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath, is_directory: isDir })
      });
      if (res.ok) {
        setInlineCreateState(null);
        setInlineCreateName('');
        fetchProjectsAndTree();
        if (!isDir) {
          handleOpenFile(fullPath);
        }
      } else {
        const err = await res.json();
        alert(`Failed to create: ${err.detail || 'Error'}`);
      }
    } catch (e) {
      alert("Failed to connect to workspace service.");
    }
  };

  // Keyboard shortcut handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSaveFile();
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      const nextVal = val.substring(0, start) + '  ' + val.substring(end);
      setEditorContent(nextVal);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Surgically apply Diff blocks to active editor buffer
  const handleApplyDiff = (diffSnippet: string) => {
    const active = openTabs.find(t => t.path === activeTabPath);
    if (!active) {
      alert("Please open a file in the editor to apply this surgical diff.");
      return;
    }

    // Safety Guard: Block lazy placeholder code from being applied
    const lazyPatterns = [
      /\/\/\s*\.{3}\s*(rest|remaining|unchanged|continues|code remains)/i,
      /\/\*\s*\.{3}\s*(rest|remaining|unchanged|continues)/i,
      /#\s*\.{3}\s*(rest|remaining|unchanged|continues)/i,
      /\/\/\s*\(rest of/i,
      /\/\/\s*\.\.\./,
    ];
    if (lazyPatterns.some(p => p.test(diffSnippet))) {
      alert('Blocked: The AI model generated incomplete placeholder code (e.g. "// ... rest of code unchanged"). Refusing to overwrite your file to prevent data loss. Please re-prompt the agent with more specific instructions.');
      return;
    }

    // Protection for empty / new files: if editor is empty, populate full code directly
    if (editorContent.trim().length < 15) {
      const blocks = parseDiffBlocks(diffSnippet);
      if (blocks.length > 0) {
        const codeToUse = (blocks[0].replace.trim().length > 0 && blocks[0].replace.trim() !== '>>>>>>> REPLACE')
          ? blocks[0].replace
          : blocks[0].search;
        if (codeToUse.trim().length > 0) {
          setEditorContent(codeToUse);
          setIsDirty(codeToUse !== active.original);
          setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: codeToUse } : t));
          setLastAppliedNotice(`✓ Populated ${active.name} with code • (Ctrl+S to save)`);
          setTimeout(() => setLastAppliedNotice(null), 5000);
          return;
        }
      }
    }

    const result = applyDiffBlocks(editorContent, diffSnippet);
    if (result.success) {
      setEditorContent(result.newContent);
      setIsDirty(result.newContent !== active.original);
      setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: result.newContent } : t));
      setLastAppliedNotice(`✓ Surgically applied ${result.appliedCount} diff ${result.appliedCount === 1 ? 'edit' : 'edits'} to ${active.name} • (Ctrl+S to save)`);
      setTimeout(() => setLastAppliedNotice(null), 6000);
    } else {
      const errDetail = result.errors.join(' ');
      alert(`Could not apply diff surgically: ${errDetail}\n\nFalling back to manual inspection.`);
    }
  };

  // Apply AI code snippet into active editor buffer
  const handleApplyCodeToEditor = (snippet: string) => {
    const active = openTabs.find(t => t.path === activeTabPath);
    if (active) {
      setEditorContent(snippet);
      setIsDirty(snippet !== active.original);
      setOpenTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: snippet } : t));
      setLastAppliedNotice(`Archon Agent applied edits to ${active.name} • (Ctrl+S to save)`);
      setTimeout(() => setLastAppliedNotice(null), 5000);
    } else {
      const tempPath = detectTargetFilename(snippet) || 'solution.py';
      handleCreateAndOpenFile(tempPath, snippet);
    }
  };

  // Send Archon Agent Message (Multi-turn SSE Stream with Line-Buffer & ID-based state)
  const handleSendAgentMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || agentInput;
    if (!textToSend.trim() || agentLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now() + 1}`;

    const userMsg: AgentMessage = { id: userMsgId, role: 'user', content: textToSend };
    const assistantMsg: AgentMessage = { 
      id: assistantMsgId, 
      role: 'assistant', 
      content: '', 
      status: includeFileContext && activeTab ? `Inspecting ${activeTab.name} & generating response...` : 'Connecting to Archon Agent...' 
    };

    const newHistory = [...agentMessages, userMsg];
    setAgentMessages(prev => [...prev, userMsg, assistantMsg]);
    setAgentInput('');
    setSuggestedFiles([]);
    setAgentLoading(true);

    try {
      const activeTab = openTabs.find(t => t.path === activeTabPath);
      const res = await fetch(`${apiBase}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
          active_file_path: includeFileContext && activeTab ? activeTab.path : null,
          active_file_content: includeFileContext && activeTab ? editorContent : null,
          context_files: contextFiles.map(cf => ({ path: cf.path, content: cf.content })),
          model: selectedModel
        })
      });

      if (!res.ok) {
        setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: '❌ **Error:** Failed to connect to Agent service.', status: undefined } : m));
        setAgentLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = '';
      let streamedResponse = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                // RAG Source Citations event
                if (data.rag_sources) {
                  setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    rag_sources: data.rag_sources,
                    status: 'Synthesizing solution with retrieved documentation...'
                  } : m));
                }

                // Synaptic Flow Trace event
                if (data.flow_sequence && data.flow_steps) {
                  setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    flowSequence: data.flow_sequence,
                    flowSteps: data.flow_steps,
                  } : m));
                }

                // Token streaming
                if (data.token) {
                  streamedResponse += data.token;
                  setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    content: streamedResponse,
                    status: undefined
                  } : m));
                }

                if (data.done) {
                  setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    status: undefined
                  } : m));

                  // If auto-apply is turned ON, extract diff or code block and apply
                  if (autoApplyEdits) {
                    const diffBlocks = parseDiffBlocks(streamedResponse);
                    if (diffBlocks.length > 0) {
                      handleApplyDiff(streamedResponse);
                    } else {
                      const codeMatch = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/.exec(streamedResponse);
                      if (codeMatch && codeMatch[1]) {
                        const detected = detectTargetFilename(codeMatch[1]);
                        const current = activeTab?.name;
                        if (detected && current && detected.toLowerCase() !== current.toLowerCase()) {
                          handleCreateAndOpenFile(detected, codeMatch[1].trim());
                        } else {
                          handleApplyCodeToEditor(codeMatch[1].trim());
                        }
                      }
                    }
                  }
                  break;
                }

                if (data.error) {
                  streamedResponse += `\n\n> ⚠️ **Error:** ${data.error}`;
                  setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? {
                    ...m,
                    content: streamedResponse,
                    status: undefined
                  } : m));
                  break;
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {
      setAgentMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: '❌ **Error:** Connection lost.', status: undefined } : m));
    }
    setAgentLoading(false);
  };

  const rawLines = editorContent.split('\n');
  const activeTab = openTabs.find(t => t.path === activeTabPath);
  const currentTerm = terminals.find(t => t.id === activeTermId) || terminals[0];

  return (
    <div className="flex flex-col h-full w-full bg-[#08090a] text-[#c9d1d9] overflow-hidden border-0">
      
      {/* Main Workspace Row */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* ── 1. Activity Bar (Left, 46px) ────────────────────────── */}
        <div className="w-[46px] bg-[#060708] border-r border-[#161922] flex flex-col items-center py-2.5 justify-between z-10 flex-shrink-0 select-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-1 shadow-sm" title="Archon Workspace">
              <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
            </div>
            <button
              onClick={() => setActiveActivity('explorer')}
              title="File Explorer (Ctrl+Shift+E)"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                activeActivity === 'explorer'
                  ? 'bg-[#12151c] text-[#60a5fa] border border-[#3b82f6]/30 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                  : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#0e1015]'
              }`}
            >
              <Icons.Explorer />
            </button>
            <button
              onClick={() => setActiveActivity('search')}
              title="Search Workspace (Ctrl+Shift+F)"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                activeActivity === 'search'
                  ? 'bg-[#12151c] text-[#60a5fa] border border-[#3b82f6]/30'
                  : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#0e1015]'
              }`}
            >
              <Icons.Search />
            </button>
            <button
              onClick={() => setActiveActivity('copilot')}
              title="Archon Agent Chat"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                activeActivity === 'copilot'
                  ? 'bg-[#12151c] text-[#60a5fa] border border-[#3b82f6]/30'
                  : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#0e1015]'
              }`}
            >
              <Icons.ArchonAI />
            </button>
            <button
              onClick={() => setActiveActivity('diagnostics')}
              title="Health & Diagnostics"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                activeActivity === 'diagnostics'
                  ? 'bg-[#12151c] text-[#60a5fa] border border-[#3b82f6]/30'
                  : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#0e1015]'
              }`}
            >
              <Icons.Diagnostics />
            </button>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" title="online" />
          </div>
        </div>


        {/* ── 2. Sidebar (Explorer / Search, 260px) ────────────────── */}
        <div className="w-[260px] bg-[#0c0e12] border-r border-[#161922] flex flex-col flex-shrink-0 overflow-hidden select-none">
          
          {/* Project Title Bar & Explorer Actions Toolbar */}
          <div className="px-3 py-2 border-b border-[#161922] flex justify-between items-center bg-[#090b0e]">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-[11px] font-mono font-bold tracking-wider text-[#e2e5ea] uppercase truncate max-w-[105px]" title={currentProjectPath}>
                {currentProjectName}
              </span>
            </div>
            
            {/* VS Code Style Action Icons */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  setInlineCreateState({ parentPath: '', isDir: false });
                  setInlineCreateName('');
                }}
                title="New File..."
                className="text-[#64748b] hover:text-[#60a5fa] p-1 rounded hover:bg-[#161922] cursor-pointer"
              >
                <Icons.FilePlus />
              </button>
              <button
                onClick={() => {
                  setInlineCreateState({ parentPath: '', isDir: true });
                  setInlineCreateName('');
                }}
                title="New Folder..."
                className="text-[#64748b] hover:text-[#60a5fa] p-1 rounded hover:bg-[#161922] cursor-pointer"
              >
                <Icons.FolderPlus />
              </button>
              <button
                onClick={fetchProjectsAndTree}
                title="Refresh Explorer"
                className="text-[#64748b] hover:text-[#cbd5e1] p-1 rounded hover:bg-[#161922] cursor-pointer"
              >
                <Icons.Refresh />
              </button>
              <button
                onClick={() => {
                  setProjectPathInput(currentProjectPath);
                  setShowOpenProjectModal(true);
                }}
                title="Open Folder / Switch Workspace..."
                className="text-[#64748b] hover:text-[#60a5fa] p-1 rounded hover:bg-[#161922] cursor-pointer ml-0.5"
              >
                <Icons.FolderClosed />
              </button>
              <button
                onClick={() => setShowGitHubModal(true)}
                title="Open Remote GitHub Repository (Clone-Free)"
                className="text-[#64748b] hover:text-white p-1 rounded hover:bg-[#161922] cursor-pointer"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              </button>
              <button
                onClick={() => setShowIndexDrawer(true)}
                title="Index Codebase with SCIP & Knowledge Graph"
                className="text-cyan-400 hover:text-cyan-300 p-1 rounded hover:bg-[#161922] cursor-pointer"
              >
                ⚡
              </button>
              <button
                onClick={() => setShowKnowledgeGraph(true)}
                title="View Codebase Knowledge Graph"
                className="text-slate-400 hover:text-cyan-400 p-1 rounded hover:bg-[#161922] cursor-pointer"
              >
                🌐
              </button>
            </div>
          </div>

          {/* Quick Filter Input & Quick Open Ctrl+P Trigger */}
          <div className="p-2 border-b border-[#161922]/60 flex items-center gap-1.5">
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter files..."
              className="flex-1 bg-[#08090a] border border-[#1a1e26] rounded px-2.5 py-1 text-[11px] font-mono text-[#cbd5e1] focus:outline-none focus:border-[#3b82f6]/50 placeholder-[#475569]"
            />
            <button
              onClick={() => setShowQuickOpen(true)}
              title="Quick Open File (Ctrl+P)"
              className="bg-[#12151c] hover:bg-[#1a1e26] text-[#64748b] hover:text-[#60a5fa] px-1.5 py-1 rounded text-[10px] font-mono border border-[#1e232e] cursor-pointer flex-shrink-0"
            >
              Ctrl+P
            </button>
          </div>

          {/* Inline Creation Prompt at Root */}
          {inlineCreateState && inlineCreateState.parentPath === '' && (
            <div className="p-2 bg-[#12151c] border-b border-[#3b82f6]/30 flex items-center gap-1.5">
              <span className="text-[#60a5fa]">
                {inlineCreateState.isDir ? <Icons.FolderPlus /> : <Icons.FilePlus />}
              </span>
              <input
                type="text"
                autoFocus
                value={inlineCreateName}
                onChange={(e) => setInlineCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmInlineCreate();
                  if (e.key === 'Escape') setInlineCreateState(null);
                }}
                placeholder={inlineCreateState.isDir ? "Folder name..." : "File name..."}
                className="flex-1 bg-[#08090a] border border-[#3b82f6]/60 rounded px-2 py-0.5 text-[11px] font-mono text-white focus:outline-none"
              />
              <button
                onClick={handleConfirmInlineCreate}
                className="text-[10px] bg-[#3b82f6] text-white px-2 py-0.5 rounded font-mono cursor-pointer"
              >
                ✓
              </button>
              <button
                onClick={() => setInlineCreateState(null)}
                className="text-[10px] text-[#64748b] hover:text-white px-1 font-mono cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* File Tree List */}
          <div className="flex-1 overflow-y-auto p-1.5 custom-scrollbar">
            {loadingTree ? (
              <div className="p-4 text-[11px] font-mono text-[#64748b] flex items-center gap-2">
                <span className="animate-spin">⟳</span> Loading workspace...
              </div>
            ) : workspaceTree.length > 0 ? (
              workspaceTree.map(node => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  activePath={activeTabPath}
                  onSelectFile={handleOpenFile}
                  onDelete={handleDeleteItem}
                  onRename={handleRenameItem}
                  onNewFileInDir={(p) => {
                    setInlineCreateState({ parentPath: p, isDir: false });
                    setInlineCreateName('');
                  }}
                  onNewFolderInDir={(p) => {
                    setInlineCreateState({ parentPath: p, isDir: true });
                    setInlineCreateName('');
                  }}
                />
              ))
            ) : (
              <div className="p-4 text-[11px] font-mono text-[#64748b]">
                No files found in workspace.
              </div>
            )}
          </div>
        </div>

        {/* ── 3. Central Code Editor Panel (Flex-1) ────────────────── */}
        <div className="flex-1 flex flex-col bg-[#090b0e] overflow-hidden">
          
          {/* Tab Bar */}
          <div className="flex items-center bg-[#07080a] border-b border-[#161922] overflow-x-auto custom-scrollbar flex-shrink-0 h-[38px] select-none">
            {openTabs.map(tab => {
              const isActive = tab.path === activeTabPath;
              const dirty = tab.content !== tab.original;
              return (
                <div
                  key={tab.path}
                  onClick={() => {
                    setActiveTabPath(tab.path);
                    setEditorContent(tab.content);
                    setIsDirty(dirty);
                  }}
                  className={`flex items-center gap-2 px-3.5 h-full border-r border-[#161922] cursor-pointer text-[12px] font-mono transition-colors relative group ${
                    isActive
                      ? 'bg-[#0e1015] text-[#e2e5ea] border-t-2 border-t-[#3b82f6]'
                      : 'text-[#6b7280] hover:bg-[#0a0c10] hover:text-[#94a3b8]'
                  }`}
                >
                  {getFileIcon(tab.name)}
                  <span className="truncate max-w-[140px]">{tab.name}</span>
                  {dirty && <span className="w-2 h-2 rounded-full bg-[#3b82f6] ml-1" title="Unsaved changes" />}
                  <button
                    onClick={(e) => handleCloseTab(tab.path, e)}
                    className="opacity-0 group-hover:opacity-100 hover:text-[#ef4444] p-0.5 rounded transition-opacity ml-1"
                  >
                    <Icons.Close />
                  </button>
                </div>
              );
            })}
            {openTabs.length === 0 && (
              <div className="px-4 text-[11px] font-mono text-[#475569] italic">
                Select a file from the explorer to open in editor
              </div>
            )}
          </div>

          {/* Archon Agent Auto-Apply Notification Bar */}
          {lastAppliedNotice && (
            <div className="bg-[#10b981]/15 border-b border-[#10b981]/30 px-4 py-1.5 text-[11.5px] font-mono text-[#10b981] flex justify-between items-center animate-fade-in select-none">
              <div className="flex items-center gap-2">
                <span className="text-[#10b981] flex items-center"><Icons.Sparkles /></span>
                <span>{lastAppliedNotice}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveFile}
                  className="bg-[#10b981]/20 hover:bg-[#10b981]/35 text-[#10b981] px-2 py-0.5 rounded border border-[#10b981]/40 text-[10.5px] cursor-pointer font-semibold"
                >
                  Save (Ctrl+S)
                </button>
                <button onClick={() => setLastAppliedNotice(null)} className="hover:text-white cursor-pointer px-1">✕</button>
              </div>
            </div>
          )}

          {/* Breadcrumbs & Quick Toolbar */}
          {activeTab && (
            <div className="flex justify-between items-center px-4 py-1.5 bg-[#0a0c10] border-b border-[#161922] text-[11px] font-mono text-[#64748b] select-none">
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-[#3b82f6]">{currentProjectName}</span>
                {activeTab.path.split('/').map((seg, i, arr) => (
                  <React.Fragment key={i}>
                    <span>›</span>
                    <span className={i === arr.length - 1 ? 'text-[#e2e5ea] font-medium' : ''}>{seg}</span>
                  </React.Fragment>
                ))}
              </div>
              <div className="flex items-center gap-3">
                {saveStatus && (
                  <span className="text-[11px] text-[#10b981] font-mono font-medium">
                    {saveStatus}
                  </span>
                )}
                {isDirty && (
                  <span className="text-[10.5px] text-[#f59e0b] font-mono flex items-center gap-1">
                    ● Unsaved
                  </span>
                )}
                <button
                  onClick={() => setShowIndexDrawer(true)}
                  title="Index Codebase with SCIP & Knowledge Graph"
                  className="bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 px-2.5 py-1 rounded text-[11px] font-mono transition-colors border border-cyan-800/40 cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <span>⚡ Index Codebase</span>
                </button>
                <button
                  onClick={() => setShowKnowledgeGraph(true)}
                  title="Open Knowledge Graph Visualizer"
                  className="bg-[#121622] hover:bg-[#1a2030] text-slate-300 px-2.5 py-1 rounded text-[11px] font-mono transition-colors border border-[#252f44] cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <span>🌐 Graph</span>
                  {knowledgeGraphData?.nodes?.length ? (
                    <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                      {knowledgeGraphData.nodes.length}
                    </span>
                  ) : null}
                </button>
                <button
                  onClick={handleSaveFile}
                  title="Save (Ctrl+S)"
                  className="bg-[#1e293b] hover:bg-[#334155] text-[#cbd5e1] px-2.5 py-1 rounded text-[11px] font-mono transition-colors border border-[#334155] cursor-pointer flex items-center gap-1.5"
                >
                  <Icons.Save />
                  <span>Save</span>
                </button>
              </div>
            </div>
          )}

          {/* Code Textarea & Gutter with Synchronized Scrolling */}
          {activeTab ? (
            <div className="flex-1 flex overflow-hidden relative font-mono text-[12.5px] leading-[20px]">
              {/* Line Gutter with Folding Arrows */}
              <div
                ref={gutterRef}
                className="w-[54px] bg-[#07080a] border-r border-[#161922] text-right py-3 px-1 text-[11.5px] font-mono text-[#475569] select-none overflow-hidden leading-[20px] flex-shrink-0"
              >
                {rawLines.map((lineText, i) => {
                  const isFoldable = /^(?:\s*)(?:def|class|function|async\s+function|const\s+\w+\s*=\s*(?:async\s*)?\(|if|elif|else|for|while|try|catch).*(?:\{|:)\s*$/.test(lineText);
                  const isFolded = foldedLines[i];
                  return (
                    <div key={i} className="flex items-center justify-end gap-1 px-1 h-[20px]">
                      {isFoldable ? (
                        <button
                          onClick={() => toggleFold(i)}
                          title={isFolded ? "Unfold block" : "Fold block"}
                          className="hover:text-[#60a5fa] cursor-pointer text-[9px] p-0.5"
                        >
                          {isFolded ? '▸' : '▾'}
                        </button>
                      ) : (
                        <span className="w-2.5 inline-block" />
                      )}
                      <span className={cursorPos.line === i + 1 ? 'text-[#60a5fa] font-bold' : ''}>
                        {i + 1}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Code Editor Container */}
              <div className="flex-1 relative overflow-hidden bg-[#090b0e]">
                {/* Syntax Highlight Overlay (Synchronized with Textarea Scroll) */}
                <div
                  ref={syntaxRef}
                  aria-hidden="true"
                  className="absolute inset-0 p-3 pointer-events-none whitespace-pre overflow-hidden leading-[20px] select-none text-[12.5px] font-mono font-normal"
                >
                  {rawLines.map((lineText, i) => (
                    <div
                      key={i}
                      className={`h-[20px] leading-[20px] ${cursorPos.line === i + 1 ? 'bg-[#1e293b]/25 rounded-sm' : ''}`}
                    >
                      {foldedLines[i] ? (
                        <span>
                          {highlightCodeLine(lineText)}
                          <span className="text-[#3b82f6] bg-[#1e293b]/60 px-1.5 py-0.2 rounded border border-[#3b82f6]/30 ml-2 text-[10px] select-none">
                            ... folded
                          </span>
                        </span>
                      ) : (
                        highlightCodeLine(lineText)
                      )}
                    </div>
                  ))}
                </div>

                {/* Actual Typing Input Textarea */}
                <textarea
                  ref={textareaRef}
                  value={editorContent}
                  onChange={handleEditorChange}
                  onScroll={handleEditorScroll}
                  onKeyDown={handleKeyDown}
                  onSelect={handleEditorSelection}
                  onClick={handleEditorSelection}
                  onKeyUp={handleEditorSelection}
                  spellCheck={false}
                  className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-[#60a5fa] p-3 text-[12.5px] font-mono leading-[20px] resize-none focus:outline-none custom-scrollbar select-text overflow-y-auto whitespace-pre tab-4 z-10 font-normal"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#090b0e] select-none overflow-y-auto custom-scrollbar">
              {/* Pure Clean ASCII Art Display */}
              <div className="mb-4 flex justify-center items-center">
                <pre className="text-[8.5px] sm:text-[9.5px] md:text-[10px] font-mono font-bold leading-[11px] sm:leading-[12px] text-[#38bdf8]/85 hover:text-[#38bdf8] transition-colors select-none">
                  {ARCHON_ASCII_ART}
                </pre>
              </div>

              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[15px] font-mono font-bold text-[#e2e5ea]">
                  {currentProjectName} Workspace
                </h3>
                <span className="text-[10px] font-mono text-[#60a5fa] px-1.5 py-0.2 bg-[#3b82f6]/10 rounded border border-[#3b82f6]/20">
                  ⎇ {gitBranch}
                </span>
              </div>

              <p className="text-[11.5px] font-mono text-[#64748b] max-w-[420px] leading-relaxed mb-5 truncate" title={currentProjectPath}>
                Path: <span className="text-[#94a3b8]">{currentProjectPath}</span>
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowOpenProjectModal(true)}
                  className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-2 rounded-lg text-[11.5px] font-mono transition-all cursor-pointer font-semibold flex items-center gap-2 shadow-md"
                >
                  <Icons.FolderPlus />
                  <span>Open or Create Project...</span>
                </button>
                <button
                  onClick={() => handleOpenFile('README.md')}
                  className="bg-[#12151c] hover:bg-[#1a1e26] text-[#cbd5e1] border border-[#1e232e] hover:border-[#3b82f6]/30 px-4 py-2 rounded-lg text-[11.5px] font-mono transition-all cursor-pointer flex items-center gap-2"
                >
                  <Icons.FileCode />
                  <span>Open README.md</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Interactive Multi-Tab Terminal & Diagnostics Panel ── */}
          {showBottomPanel && (
            <div className="h-[180px] bg-[#07080a] border-t border-[#161922] flex flex-col flex-shrink-0">
              
              {/* Bottom Tab Bar with + New Terminal & Copy Button */}
              <div className="flex justify-between items-center px-3 py-1 bg-[#090b0e] border-b border-[#161922] text-[11px] font-mono select-none">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setBottomTab('terminal')}
                    className={`cursor-pointer transition-colors flex items-center gap-1.5 pb-0.5 ${bottomTab === 'terminal' ? 'text-[#60a5fa] font-bold border-b-2 border-[#3b82f6]' : 'text-[#64748b] hover:text-[#94a3b8]'}`}
                  >
                    <Icons.Terminal />
                    <span>TERMINAL</span>
                  </button>
                  <button
                    onClick={() => setBottomTab('output')}
                    className={`cursor-pointer transition-colors pb-0.5 ${bottomTab === 'output' ? 'text-[#60a5fa] font-bold border-b-2 border-[#3b82f6]' : 'text-[#64748b] hover:text-[#94a3b8]'}`}
                  >
                    OUTPUT
                  </button>
                  <button
                    onClick={() => setBottomTab('diagnostics')}
                    className={`cursor-pointer transition-colors pb-0.5 ${bottomTab === 'diagnostics' ? 'text-[#60a5fa] font-bold border-b-2 border-[#3b82f6]' : 'text-[#64748b] hover:text-[#94a3b8]'}`}
                  >
                    DIAGNOSTICS
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {bottomTab === 'terminal' && (
                    <div className="flex items-center gap-1.5 mr-3">
                      {terminals.map(t => (
                        <div
                          key={t.id}
                          onClick={() => setActiveTermId(t.id)}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer text-[10px] font-mono transition-colors ${
                            activeTermId === t.id
                              ? 'bg-[#1e293b] text-[#60a5fa] border border-[#3b82f6]/30'
                              : 'text-[#64748b] hover:bg-[#12151c] hover:text-[#cbd5e1]'
                          }`}
                        >
                          <span>{t.name}</span>
                          {terminals.length > 1 && (
                            <button
                              onClick={(e) => handleCloseTerminal(t.id, e)}
                              className="hover:text-[#ef4444] p-0.5"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={handleAddTerminal}
                        title="Add New Terminal"
                        className="text-[#60a5fa] hover:text-[#93c5fd] bg-[#12151c] hover:bg-[#1e293b] px-1.5 py-0.5 rounded border border-[#1e232e] cursor-pointer flex items-center gap-1 text-[10px]"
                      >
                        <Icons.Plus />
                        <span>New</span>
                      </button>
                      <button
                        onClick={handleCopyTerminalBuffer}
                        title="Copy All Terminal Output"
                        className="text-[#94a3b8] hover:text-[#cbd5e1] bg-[#12151c] hover:bg-[#1e293b] px-2 py-0.5 rounded border border-[#1e232e] cursor-pointer flex items-center gap-1 text-[10px]"
                      >
                        <Icons.Copy />
                        <span>{terminalCopied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => setShowBottomPanel(false)}
                    className="text-[#64748b] hover:text-[#cbd5e1] cursor-pointer"
                  >
                    <Icons.Close />
                  </button>
                </div>
              </div>

              {/* Tab 1: Live Interactive Terminal (Full Selectable Text) */}
              {bottomTab === 'terminal' && (
                <div className="flex-1 flex flex-col p-2.5 overflow-hidden font-mono text-[11.5px] bg-[#07080a] select-text">
                  <div
                    ref={termScrollRef}
                    className="flex-1 overflow-y-auto space-y-1 custom-scrollbar text-[#c9d1d9] pb-1 select-text"
                  >
                    {currentTerm.history.map((item, i) => (
                      <div key={i} className="leading-relaxed select-text">
                        {item.type === 'input' && (
                          <div className="text-[#60a5fa] font-bold select-text">{item.text}</div>
                        )}
                        {item.type === 'stdout' && (
                          <pre className="text-[#a0a6b5] whitespace-pre-wrap select-text font-mono">{item.text}</pre>
                        )}
                        {item.type === 'stderr' && (
                          <pre className="text-[#f87171] whitespace-pre-wrap select-text font-mono">{item.text}</pre>
                        )}
                        {item.type === 'system' && (
                          <div className="text-[#10b981] select-text">{item.text}</div>
                        )}
                      </div>
                    ))}
                    {executingCmd && (
                      <div className="text-[#60a5fa] flex items-center gap-2 animate-pulse select-text">
                        <span className="animate-spin">⟳</span> Running command...
                      </div>
                    )}
                  </div>

                  {/* Interactive Terminal Prompt Input */}
                  <div className="flex items-center gap-2 pt-1.5 border-t border-[#161922] text-[11.5px] font-mono">
                    <span className="text-[#10b981] flex items-center gap-1 select-none font-bold">
                      archon@{currentProjectName}:~
                    </span>
                    <span className="text-[#60a5fa] select-none font-bold">$</span>
                    <input
                      ref={termInputRef}
                      type="text"
                      value={currentTerm.input}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTerminals(prev => prev.map(t => t.id === activeTermId ? { ...t, input: val } : t));
                      }}
                      onKeyDown={handleTerminalKeyDown}
                      placeholder="Type shell command (e.g. ls, git status, cd .., mkdir new-dir)..."
                      className="flex-1 bg-transparent text-[#e2e5ea] focus:outline-none placeholder-[#475569] select-text"
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: System Output Logs */}
              {bottomTab === 'output' && (
                <div className="flex-1 p-2.5 overflow-y-auto font-mono text-[11.5px] leading-[1.6] custom-scrollbar text-[#94a3b8] select-text">
                  <div>
                    <span className="text-[#475569] select-none">[{new Date().toLocaleTimeString()}]</span> Archon Agent IDE workspace initialized.
                  </div>
                  <div>
                    <span className="text-[#475569] select-none">[{new Date().toLocaleTimeString()}]</span> Microservices Mesh connected on {apiBase}
                  </div>
                  <div>
                    <span className="text-[#475569] select-none">[{new Date().toLocaleTimeString()}]</span> GPU Model loaded: {selectedModel}
                  </div>
                  {activeTabPath && (
                    <div>
                      <span className="text-[#475569] select-none">[{new Date().toLocaleTimeString()}]</span> Active Editor Buffer: {activeTabPath}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Diagnostics */}
              {bottomTab === 'diagnostics' && (
                <div className="flex-1 p-2.5 overflow-y-auto font-mono text-[11.5px] leading-[1.6] custom-scrollbar text-[#cbd5e1] select-text">
                  <span>Project Root: {currentProjectPath}</span><br />
                  <span>Git Branch: {gitBranch}</span><br />
                  <span>Active File: {activeTabPath || 'None'}</span><br />
                  <span>Line Count: {rawLines.length} | Characters: {editorContent.length}</span><br />
                  <span>Unsaved Buffer: {isDirty ? 'Yes' : 'No'}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 4. Archon Agent Chat Panel (Right, 380px) ───────────── */}
        <div className="w-[380px] bg-[#0c0e12] border-l border-[#161922] flex flex-col flex-shrink-0 overflow-hidden select-none">
          
          <div className="px-3 py-2 border-b border-[#161922] bg-[#090b0e] flex justify-between items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div className="w-5 h-5 rounded bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-0.5 shadow-sm flex-shrink-0">
                <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
              </div>
              <span className="text-[12px] font-mono font-bold text-[#e2e5ea] tracking-tight whitespace-nowrap flex-shrink-0">
                Archon Agent
              </span>
              <span 
                className="text-[10px] font-mono text-[#60a5fa] px-1.5 py-0.2 bg-[#3b82f6]/10 rounded border border-[#3b82f6]/20 truncate max-w-[110px] inline-block"
                title={selectedModel}
              >
                {selectedModel}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setAutoApplyEdits(!autoApplyEdits)}
                title="Toggle automatic application of AI code edits directly to active file"
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all flex items-center gap-1 cursor-pointer border whitespace-nowrap ${
                  autoApplyEdits
                    ? 'bg-[#3b82f6]/20 text-[#60a5fa] border-[#3b82f6]/40 font-bold'
                    : 'bg-[#12151c] text-[#64748b] border-[#1e232e] hover:text-[#94a3b8]'
                }`}
              >
                <Icons.Sparkles />
                <span>Auto-Apply: {autoApplyEdits ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={() => setAgentMessages([{ id: 'cleared', role: 'assistant', content: "Chat history cleared. How can I help you?" }])}
                title="Clear Chat History"
                className="text-[#64748b] hover:text-[#cbd5e1] text-[11px] font-mono p-1 rounded hover:bg-[#161922] cursor-pointer flex-shrink-0"
              >
                <Icons.Trash />
              </button>
            </div>
          </div>

          <div className="px-3 py-1.5 bg-[#08090a] border-b border-[#161922]/60 flex items-center justify-between text-[11px] font-mono">
            <label className="flex items-center gap-1.5 cursor-pointer text-[#8b949e]">
              <input
                type="checkbox"
                checked={includeFileContext}
                onChange={(e) => setIncludeFileContext(e.target.checked)}
                className="rounded border-[#1e232e] bg-[#12151c] text-[#3b82f6] focus:ring-0 cursor-pointer"
              />
              <span>Include active file in context</span>
            </label>
            {activeTab && includeFileContext && (
              <span className="text-[#60a5fa] truncate max-w-[130px] font-medium flex items-center gap-1" title={activeTab.path}>
                <Icons.FileCode />
                <span className="truncate">{activeTab.name}</span>
              </span>
            )}
          </div>

          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar select-text">
            {agentMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg border text-[12px] font-mono leading-relaxed select-text transition-all ${
                  msg.role === 'user'
                    ? 'bg-[#121620] border-[#222a3a] text-[#e2e5ea]'
                    : 'bg-[#0a0c10] border-[#161922] text-[#cbd5e1]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5 text-[10.5px] font-mono font-bold select-none border-b border-[#161922]/60 pb-1">
                  {msg.role === 'user' ? (
                    <span className="text-[#60a5fa] flex items-center gap-1.5">
                      <Icons.User />
                      <span>Developer</span>
                    </span>
                  ) : (
                    <span className="text-[#10b981] flex items-center gap-1.5">
                      <Icons.ArchonAI />
                      <span>Archon Agent</span>
                    </span>
                  )}

                  {msg.status ? (
                    <span className="text-[10px] text-[#60a5fa] font-mono flex items-center gap-1.5 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#60a5fa]" />
                      <span>{msg.status}</span>
                    </span>
                  ) : msg.role === 'assistant' && msg.content.includes('```') && (
                    <button
                      onClick={() => {
                        const codeMatch = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/.exec(msg.content);
                        if (codeMatch && codeMatch[1]) {
                          const detected = detectTargetFilename(codeMatch[1]);
                          const current = activeTab?.name;
                          if (detected && current && detected.toLowerCase() !== current.toLowerCase()) {
                            handleCreateAndOpenFile(detected, codeMatch[1].trim());
                          } else {
                            handleApplyCodeToEditor(codeMatch[1].trim());
                          }
                        }
                      }}
                      className="text-[#60a5fa] hover:text-[#93c5fd] bg-[#1e293b]/70 hover:bg-[#1e293b] px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 border border-[#3b82f6]/30 cursor-pointer"
                    >
                      <Icons.Sparkles />
                      <span>Apply Code</span>
                    </button>
                  )}
                </div>

                {/* ── RAG Citations with Interactive Hover Tooltip ──── */}
                {msg.rag_sources && msg.rag_sources.length > 0 && (
                  <div className="mb-3 p-2 bg-[#090b0e] border border-[#161922] rounded-lg">
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono text-[#64748b] uppercase tracking-wider font-semibold select-none">
                      <Icons.Book />
                      <span>Retrieved Enterprise API Sources (Hybrid RAG):</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {msg.rag_sources.map((src, sIdx) => (
                        <div key={sIdx} className="relative group/src">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#10b981]/10 border border-[#10b981]/30 text-[#10b981] text-[10.5px] font-mono cursor-pointer hover:bg-[#10b981]/20 transition-colors">
                            <Icons.FileCode />
                            <span>{src.file || src.title}</span>
                            <span className="text-[9px] bg-[#10b981]/25 px-1 py-0.2 rounded font-bold">{src.score}</span>
                          </div>

                          {/* Hover Popover showing exact extracted chunk */}
                          <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover/src:block z-50 w-[320px] p-3 rounded-lg bg-[#0c0e12] border border-[#1e293b] shadow-2xl text-[11px] font-mono text-[#cbd5e1] animate-fade-in pointer-events-auto">
                            <div className="flex justify-between items-center pb-1.5 mb-1.5 border-b border-[#1e293b]">
                              <span className="font-bold text-[#10b981] truncate max-w-[200px]" title={src.title}>{src.title}</span>
                              <span className="text-[9px] text-[#60a5fa] font-semibold">Match: {src.score}</span>
                            </div>
                            <div className="text-[10px] text-[#64748b] mb-1">
                              Source Spec: <span className="text-[#cbd5e1]">{src.file}</span>
                            </div>
                            <div className="text-[10.5px] text-[#94a3b8] leading-relaxed max-h-[160px] overflow-y-auto custom-scrollbar whitespace-pre-wrap bg-[#08090a] p-2 rounded border border-[#161922]">
                              {src.text}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Synaptic Architecture Flow Trace ──────────────── */}
                {msg.flowSequence && msg.flowSequence.length > 0 && (
                  <div className="mb-3 p-2.5 bg-[#090b0e] border border-[#f59e0b]/30 rounded-lg flex items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f59e0b] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#f59e0b]"></span>
                      </span>
                      <span className="text-[11px] font-mono text-[#cbd5e1]">
                        Synaptic Path Traced: <strong className="text-[#f59e0b]">{msg.flowSequence.length} nodes</strong> across architecture
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        if (!knowledgeGraphData) {
                          try {
                            const r = await fetch(`${apiBase}/api/workspace/graph`);
                            if (r.ok) {
                              const d = await r.json();
                              setKnowledgeGraphData(d);
                            }
                          } catch (e) {}
                        }
                        setActiveFlowSequence(msg.flowSequence || null);
                        setActiveFlowSteps(msg.flowSteps || null);
                        setShowKnowledgeGraph(true);
                      }}
                      className="px-2.5 py-1 rounded bg-[#f59e0b]/15 hover:bg-[#f59e0b]/25 border border-[#f59e0b]/35 hover:border-[#f59e0b]/60 text-[#fbbf24] text-[11px] font-mono font-medium flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <span>⚡ Trace Synaptic Path in Graph</span>
                      <span>→</span>
                    </button>
                  </div>
                )}

                {msg.content ? (
                  <FormattedMarkdown
                    content={msg.content}
                    onApplyCode={handleApplyCodeToEditor}
                    onApplyDiff={handleApplyDiff}
                    onCreateNewFile={handleCreateAndOpenFile}
                    activeFileName={activeTab?.name}
                  />
                ) : msg.status ? (
                  <div className="py-3 flex items-center gap-2.5 text-[11.5px] text-[#64748b] font-mono">
                    <div className="w-3.5 h-3.5 border-2 border-[#1a1e26] border-t-[#60a5fa] rounded-full animate-spin flex-shrink-0" />
                    <span>{msg.status}</span>
                  </div>
                ) : null}
              </div>
            ))}

            {agentLoading && (
              <div className="p-3 bg-[#08090a] border border-[#161922] rounded-lg text-[12px] font-mono text-[#60a5fa] flex items-center gap-2 animate-pulse">
                <Icons.Sparkles />
                <span>Archon Agent synthesizing solution...</span>
              </div>
            )}
          </div>

          {activeTab && (
            <div className="p-2 border-t border-[#161922]/60 bg-[#08090a] flex items-center gap-1.5 overflow-x-auto custom-scrollbar select-none">
              <button
                onClick={() => handleSendAgentMessage(`Refactor ${activeTab.path} to improve code cleanliness, maintainability, and error handling. Output the updated code.`)}
                className="whitespace-nowrap px-2 py-1 rounded text-[10.5px] font-mono bg-[#12151c] hover:bg-[#1a1e26] text-[#8b949e] hover:text-[#60a5fa] border border-[#1a1e26] transition-colors cursor-pointer flex items-center gap-1"
              >
                <Icons.Bolt />
                <span>Refactor & Apply</span>
              </button>
              <button
                onClick={() => handleSendAgentMessage(`Review ${activeTab.path} for any bugs or edge cases, fix them, and provide the updated complete implementation.`)}
                className="whitespace-nowrap px-2 py-1 rounded text-[10.5px] font-mono bg-[#12151c] hover:bg-[#1a1e26] text-[#8b949e] hover:text-[#60a5fa] border border-[#1a1e26] transition-colors cursor-pointer flex items-center gap-1"
              >
                <Icons.Diagnostics />
                <span>Fix Bugs</span>
              </button>
              <button
                onClick={() => handleSendAgentMessage(`Explain what ${activeTab.path} does and summarize its key methods.`)}
                className="whitespace-nowrap px-2 py-1 rounded text-[10.5px] font-mono bg-[#12151c] hover:bg-[#1a1e26] text-[#8b949e] hover:text-[#60a5fa] border border-[#1a1e26] transition-colors cursor-pointer flex items-center gap-1"
              >
                <Icons.Search />
                <span>Explain</span>
              </button>
            </div>
          )}

          <div 
            className="p-3 border-t border-[#161922] bg-[#090b0e]"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOverChat(true);
            }}
            onDragLeave={() => setIsDraggingOverChat(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOverChat(false);
              try {
                const dataStr = e.dataTransfer.getData("application/json");
                if (dataStr) {
                  const data = JSON.parse(dataStr);
                  if (data.path) {
                    handleAddContextFile(data.path, data.name);
                  }
                }
              } catch {}
            }}
          >
            <div className="relative border border-[#1e232e] focus-within:border-[#3b82f6]/50 rounded-lg bg-[#08090a] transition-all overflow-hidden">
              <ContextFileChips
                contextFiles={contextFiles}
                onRemoveFile={handleRemoveContextFile}
                suggestedFiles={suggestedFiles}
                onAddSuggestedFile={(sug) => {
                  handleAddContextFile(sug.path);
                  setSuggestedFiles(prev => prev.filter(s => s.path !== sug.path));
                }}
                isDraggingOver={isDraggingOverChat}
              />
              <textarea
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendAgentMessage();
                  }
                }}
                placeholder="Ask Archon Agent (Enter to send, Shift+Enter for newline)..."
                rows={2}
                className="w-full bg-transparent text-[#cbd5e1] p-2.5 text-[12px] font-mono focus:outline-none resize-none custom-scrollbar placeholder-[#475569] select-text"
              />
              <div className="flex justify-between items-center gap-2 px-2.5 pb-2 select-none min-w-0">
                <div className="min-w-0 flex-1 max-w-[200px] flex items-center gap-1.5">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full bg-[#12151c] hover:bg-[#161a24] text-[#8b949e] hover:text-[#c8ccd0] text-[10.5px] font-mono rounded px-2 py-1 border border-[#1e232e] focus:outline-none cursor-pointer truncate"
                    title={selectedModel}
                  >
                    {models.map(m => (
                      <option key={m} value={m} className="bg-[#0c0e12]">{m}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { setShowApiKeysModal(true); fetchApiKeyStatus(); }}
                    title="Configure Cloud LLM API Keys"
                    className="flex-shrink-0 text-[#64748b] hover:text-[#60a5fa] bg-[#12151c] hover:bg-[#1e293b] p-1 rounded border border-[#1e232e] cursor-pointer transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                    </svg>
                  </button>
                </div>

                <button
                  onClick={() => handleSendAgentMessage()}
                  disabled={!agentInput.trim() || agentLoading}
                  className={`flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    agentInput.trim() && !agentLoading
                      ? 'bg-[#3b82f6] hover:bg-[#2563eb] text-white shadow-md shadow-[#3b82f6]/20'
                      : 'bg-[#1e293b] text-[#64748b] cursor-not-allowed'
                  }`}
                >
                  <span>Send</span>
                  <span className="text-[9.5px] opacity-75">↵</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Status Bar (Bottom, 24px) ──────────────────────────── */}
      <div className="h-[24px] bg-[#060708] border-t border-[#161922] px-3 flex justify-between items-center text-[11px] font-mono text-[#64748b] flex-shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span className="text-[#60a5fa] flex items-center gap-1 font-medium">
            ⎇ {gitBranch} ({currentProjectName})
          </span>
          {activeTab && (
            <span>
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
          )}
          <span>UTF-8</span>
          <span>Spaces: 2</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowBottomPanel(!showBottomPanel)}
            className="hover:text-[#cbd5e1] cursor-pointer flex items-center gap-1"
          >
            <Icons.Terminal />
            <span>{showBottomPanel ? '▾ Panel' : '▸ Panel'}</span>
          </button>
          <span className="text-[#10b981] flex items-center gap-1">
            ● Archon: {selectedModel} (GPU)
          </span>
        </div>
      </div>

      {/* ── Open / Create Project Workspace Modal ─────────────────── */}
      {showOpenProjectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0e12] border border-[#1a1e26] rounded-xl max-w-[550px] w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-[#1a1e26] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-0.5 shadow-sm">
                  <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
                </div>
                <h3 className="text-[14px] font-mono font-bold text-[#e2e5ea]">
                  Open or Create Folder / Project Workspace
                </h3>
              </div>
              <button
                onClick={() => setShowOpenProjectModal(false)}
                className="text-[#64748b] hover:text-[#cbd5e1] p-1 cursor-pointer"
              >
                <Icons.Close />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono text-[#8b949e]">
                Enter local folder path:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={projectPathInput}
                  onChange={(e) => setProjectPathInput(e.target.value)}
                  placeholder="e.g. D:/AIDeV/my-new-app or C:/Users/gaura/projects/demo"
                  className="flex-1 bg-[#08090a] border border-[#1a1e26] rounded-lg px-3 py-2 text-[12px] font-mono text-[#e2e5ea] focus:outline-none focus:border-[#3b82f6]"
                />
                <button
                  onClick={() => handleOpenProject(projectPathInput, false)}
                  className="bg-[#1e293b] hover:bg-[#334155] text-[#cbd5e1] px-3.5 py-2 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer border border-[#334155]"
                >
                  Open
                </button>
                <button
                  onClick={() => handleOpenProject(projectPathInput, true)}
                  title="Create folder and initialize project if missing"
                  className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-3.5 py-2 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Icons.Sparkles />
                  <span>Create & Open</span>
                </button>
              </div>
            </div>

            {recentProjects.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#161922]">
                <div className="text-[11px] font-mono text-[#64748b] uppercase tracking-wider">
                  Recent Workspaces:
                </div>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar">
                  {recentProjects.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => handleOpenProject(p, false)}
                      className="w-full text-left p-2 rounded bg-[#08090a] hover:bg-[#12151c] border border-[#1a1e26] hover:border-[#3b82f6]/40 text-[11.5px] font-mono text-[#8b949e] hover:text-[#60a5fa] transition-colors truncate flex items-center gap-2 cursor-pointer"
                    >
                      <Icons.FolderClosed />
                      <span className="truncate">{p}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowOpenProjectModal(false)}
                className="bg-[#12151c] hover:bg-[#1a1e26] text-[#8b949e] px-4 py-1.5 rounded-lg text-[12px] font-mono cursor-pointer border border-[#1e232e]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cloud LLM API Keys Settings Modal ──────────────────── */}
      {showApiKeysModal && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setShowApiKeysModal(false)}
        >
          <div 
            className="bg-[#0c0e12] border border-[#1e232e] rounded-xl max-w-[520px] w-full shadow-2xl overflow-hidden shadow-black/80 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#161922] bg-[#090b0e] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span className="text-[13px] font-mono font-bold text-[#e2e5ea]">Cloud LLM API Keys</span>
              </div>
              <button onClick={() => setShowApiKeysModal(false)} className="text-[#64748b] hover:text-[#cbd5e1] cursor-pointer">
                <Icons.Close />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[480px] overflow-y-auto custom-scrollbar">
              <p className="text-[11px] font-mono text-[#64748b] leading-relaxed">
                Configure API keys for cloud LLM providers. Keys are stored persistently on the server and remain until manually cleared.
              </p>

              {/* OpenAI */}
              <div className="border border-[#1e232e] rounded-lg p-3 bg-[#090b0e] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/></svg>
                    <span className="text-[12px] font-mono font-bold text-[#e2e5ea]">OpenAI</span>
                    <span className="text-[9px] font-mono text-[#475569]">gpt-4.1 / o3 / o4-mini</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKeyTestStatus.openai?.status === 'ok' && (
                      <span className="text-[9px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded">Connected ({apiKeyTestStatus.openai.latency}ms)</span>
                    )}
                    {apiKeyTestStatus.openai?.status === 'error' && (
                      <span className="text-[9px] font-mono text-[#ef4444] bg-[#ef4444]/10 px-2 py-0.5 rounded max-w-[180px] truncate" title={apiKeyTestStatus.openai.message}>{apiKeyTestStatus.openai.message}</span>
                    )}
                    {apiKeys.openai?.configured && !apiKeyTestStatus.openai?.status && (
                      <span className="text-[9px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded">Active: {apiKeys.openai.masked_key}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeyInputs.openai || ''}
                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, openai: e.target.value }))}
                    placeholder={apiKeys.openai?.configured ? 'Key configured — enter new to replace' : 'sk-...'}
                    className="flex-1 bg-[#12151c] text-[11px] font-mono text-[#e2e5ea] px-2.5 py-1.5 rounded border border-[#1e232e] focus:outline-none focus:border-[#3b82f6] placeholder-[#475569]"
                  />
                  <button onClick={() => handleSaveApiKey('openai')} className="text-[10px] font-mono bg-[#1e293b] hover:bg-[#3b82f6] text-[#60a5fa] hover:text-white px-3 py-1.5 rounded border border-[#3b82f6]/40 cursor-pointer transition-colors">
                    {apiKeySaveStatus.openai || 'Save'}
                  </button>
                  <button 
                    onClick={() => handleTestApiKey('openai')}
                    disabled={apiKeyTestStatus.openai?.status === 'testing' || (!apiKeys.openai?.configured && !apiKeyInputs.openai?.trim())}
                    className="text-[10px] font-mono bg-[#12151c] hover:bg-[#1e293b] text-[#94a3b8] hover:text-[#e2e5ea] disabled:opacity-40 px-2.5 py-1.5 rounded border border-[#1e232e] cursor-pointer transition-colors"
                  >
                    {apiKeyTestStatus.openai?.status === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  {apiKeys.openai?.configured && (
                    <button onClick={() => handleClearApiKey('openai')} className="text-[10px] font-mono text-[#ef4444] hover:bg-[#ef4444]/10 px-2 py-1.5 rounded border border-[#ef4444]/30 cursor-pointer transition-colors">Clear</button>
                  )}
                </div>
              </div>

              {/* Anthropic */}
              <div className="border border-[#1e232e] rounded-lg p-3 bg-[#090b0e] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                    <span className="text-[12px] font-mono font-bold text-[#e2e5ea]">Anthropic</span>
                    <span className="text-[9px] font-mono text-[#475569]">claude-sonnet-4 / claude-haiku-4</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKeyTestStatus.anthropic?.status === 'ok' && (
                      <span className="text-[9px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded">Connected ({apiKeyTestStatus.anthropic.latency}ms)</span>
                    )}
                    {apiKeyTestStatus.anthropic?.status === 'error' && (
                      <span className="text-[9px] font-mono text-[#ef4444] bg-[#ef4444]/10 px-2 py-0.5 rounded max-w-[180px] truncate" title={apiKeyTestStatus.anthropic.message}>{apiKeyTestStatus.anthropic.message}</span>
                    )}
                    {apiKeys.anthropic?.configured && !apiKeyTestStatus.anthropic?.status && (
                      <span className="text-[9px] font-mono text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded">Active: {apiKeys.anthropic.masked_key}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeyInputs.anthropic || ''}
                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, anthropic: e.target.value }))}
                    placeholder={apiKeys.anthropic?.configured ? 'Key configured — enter new to replace' : 'sk-ant-...'}
                    className="flex-1 bg-[#12151c] text-[11px] font-mono text-[#e2e5ea] px-2.5 py-1.5 rounded border border-[#1e232e] focus:outline-none focus:border-[#3b82f6] placeholder-[#475569]"
                  />
                  <button onClick={() => handleSaveApiKey('anthropic')} className="text-[10px] font-mono bg-[#1e293b] hover:bg-[#3b82f6] text-[#60a5fa] hover:text-white px-3 py-1.5 rounded border border-[#3b82f6]/40 cursor-pointer transition-colors">
                    {apiKeySaveStatus.anthropic || 'Save'}
                  </button>
                  <button 
                    onClick={() => handleTestApiKey('anthropic')}
                    disabled={apiKeyTestStatus.anthropic?.status === 'testing' || (!apiKeys.anthropic?.configured && !apiKeyInputs.anthropic?.trim())}
                    className="text-[10px] font-mono bg-[#12151c] hover:bg-[#1e293b] text-[#94a3b8] hover:text-[#e2e5ea] disabled:opacity-40 px-2.5 py-1.5 rounded border border-[#1e232e] cursor-pointer transition-colors"
                  >
                    {apiKeyTestStatus.anthropic?.status === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  {apiKeys.anthropic?.configured && (
                    <button onClick={() => handleClearApiKey('anthropic')} className="text-[10px] font-mono text-[#ef4444] hover:bg-[#ef4444]/10 px-2 py-1.5 rounded border border-[#ef4444]/30 cursor-pointer transition-colors">Clear</button>
                  )}
                </div>
              </div>

              {/* Google Gemini */}
              <div className="border border-[#1e232e] rounded-lg p-3 bg-[#090b0e] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    <span className="text-[12px] font-mono font-bold text-[#e2e5ea]">Google Gemini</span>
                    <span className="text-[9px] font-mono text-[#475569]">gemini-3.7-flash / gemini-3.1-pro / gemini-3.5-flash</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {apiKeyTestStatus.gemini?.status === 'ok' && (
                      <span className="text-[9px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded">Connected ({apiKeyTestStatus.gemini.latency}ms)</span>
                    )}
                    {apiKeyTestStatus.gemini?.status === 'error' && (
                      <span className="text-[9px] font-mono text-[#ef4444] bg-[#ef4444]/10 px-2 py-0.5 rounded max-w-[180px] truncate" title={apiKeyTestStatus.gemini.message}>{apiKeyTestStatus.gemini.message}</span>
                    )}
                    {apiKeys.gemini?.configured && !apiKeyTestStatus.gemini?.status && (
                      <span className="text-[9px] font-mono text-[#818cf8] bg-[#818cf8]/10 px-2 py-0.5 rounded">Active: {apiKeys.gemini.masked_key}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={apiKeyInputs.gemini || ''}
                    onChange={(e) => setApiKeyInputs(prev => ({ ...prev, gemini: e.target.value }))}
                    placeholder={apiKeys.gemini?.configured ? 'Key configured — enter new to replace' : 'AIza...'}
                    className="flex-1 bg-[#12151c] text-[11px] font-mono text-[#e2e5ea] px-2.5 py-1.5 rounded border border-[#1e232e] focus:outline-none focus:border-[#3b82f6] placeholder-[#475569]"
                  />
                  <button onClick={() => handleSaveApiKey('gemini')} className="text-[10px] font-mono bg-[#1e293b] hover:bg-[#3b82f6] text-[#60a5fa] hover:text-white px-3 py-1.5 rounded border border-[#3b82f6]/40 cursor-pointer transition-colors">
                    {apiKeySaveStatus.gemini || 'Save'}
                  </button>
                  <button 
                    onClick={() => handleTestApiKey('gemini')}
                    disabled={apiKeyTestStatus.gemini?.status === 'testing' || (!apiKeys.gemini?.configured && !apiKeyInputs.gemini?.trim())}
                    className="text-[10px] font-mono bg-[#12151c] hover:bg-[#1e293b] text-[#94a3b8] hover:text-[#e2e5ea] disabled:opacity-40 px-2.5 py-1.5 rounded border border-[#1e232e] cursor-pointer transition-colors"
                  >
                    {apiKeyTestStatus.gemini?.status === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  {apiKeys.gemini?.configured && (
                    <button onClick={() => handleClearApiKey('gemini')} className="text-[10px] font-mono text-[#ef4444] hover:bg-[#ef4444]/10 px-2 py-1.5 rounded border border-[#ef4444]/30 cursor-pointer transition-colors">Clear</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Open (Ctrl+P) Search Modal ────────────────────── */}
      {showQuickOpen && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-start justify-center pt-24 p-4"
          onClick={() => setShowQuickOpen(false)}
        >
          <div 
            className="bg-[#0c0e12] border border-[#1e232e] rounded-xl max-w-[620px] w-full shadow-2xl overflow-hidden shadow-black/80 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-[#161922] bg-[#090b0e] flex items-center gap-2">
              <span className="text-[#60a5fa]"><Icons.Search /></span>
              <input
                ref={quickOpenInputRef}
                type="text"
                value={quickOpenQuery}
                onChange={(e) => {
                  setQuickOpenQuery(e.target.value);
                  setQuickOpenIndex(0);
                }}
                onKeyDown={(e) => {
                  const filtered = allFiles.filter(f => 
                    !quickOpenQuery.trim() || 
                    f.path.toLowerCase().includes(quickOpenQuery.toLowerCase()) || 
                    f.name.toLowerCase().includes(quickOpenQuery.toLowerCase())
                  );
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setQuickOpenIndex(prev => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setQuickOpenIndex(prev => Math.max(0, prev - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filtered.length > 0 && filtered[quickOpenIndex]) {
                      handleOpenFile(filtered[quickOpenIndex].path);
                      setShowQuickOpen(false);
                    } else if (quickOpenQuery.trim()) {
                      handleOpenFile(quickOpenQuery.trim());
                      setShowQuickOpen(false);
                    }
                  } else if (e.key === 'Escape') {
                    setShowQuickOpen(false);
                  }
                }}
                placeholder="Type a file name or path across all drives (e.g. main.py, C:/Users/gaura/test.py)..."
                className="w-full bg-transparent text-[12.5px] font-mono text-[#e2e5ea] focus:outline-none placeholder-[#475569]"
              />
              <span className="text-[10px] font-mono text-[#64748b] bg-[#12151c] px-2 py-0.5 rounded border border-[#1e232e]">
                ESC to close
              </span>
            </div>

            <div className="max-h-[340px] overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
              {(() => {
                const filtered = allFiles.filter(f => 
                  !quickOpenQuery.trim() || 
                  f.path.toLowerCase().includes(quickOpenQuery.toLowerCase()) || 
                  f.name.toLowerCase().includes(quickOpenQuery.toLowerCase())
                );
                if (filtered.length === 0) {
                  return (
                    <div className="p-4 text-center text-[11.5px] font-mono text-[#64748b] space-y-2">
                      <div>No matching files found in workspace tree.</div>
                      {quickOpenQuery.trim() && (
                        <button
                          onClick={() => {
                            handleOpenFile(quickOpenQuery.trim());
                            setShowQuickOpen(false);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1e293b] hover:bg-[#3b82f6] text-[#60a5fa] hover:text-white border border-[#3b82f6]/40 transition-colors text-[11px] cursor-pointer"
                        >
                          <Icons.FileCode />
                          <span>Open "{quickOpenQuery.trim()}" from disk</span>
                        </button>
                      )}
                    </div>
                  );
                }
                return filtered.slice(0, 50).map((file, idx) => {
                  const isSelected = idx === quickOpenIndex;
                  return (
                    <div
                      key={file.path}
                      onClick={() => {
                        handleOpenFile(file.path);
                        setShowQuickOpen(false);
                      }}
                      onMouseEnter={() => setQuickOpenIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer font-mono text-[12px] transition-colors ${
                        isSelected 
                          ? 'bg-[#1a2234] text-[#60a5fa] border border-[#3b82f6]/30' 
                          : 'text-[#9ca3af] hover:bg-[#12151c] hover:text-[#e2e5ea]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {getFileIcon(file.name)}
                        <span className="font-medium text-[#e2e5ea]">{file.name}</span>
                        <span className="text-[10.5px] text-[#64748b] truncate">{file.path}</span>
                      </div>
                      <span className="text-[9.5px] text-[#475569] uppercase font-bold">{file.extension || 'file'}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Sourcegraph SCIP Indexing Drawer ───────────────────────── */}
      <SourcegraphIndexDrawer
        isOpen={showIndexDrawer}
        onClose={() => setShowIndexDrawer(false)}
        projectName={currentProjectName}
        apiBase={apiBase}
        workspacePath={currentProjectPath}
        isGitHubWorkspace={isGitHubWorkspace}
        githubRepoInfo={githubRepoInfo}
        githubToken={githubToken}
        currentGitHubBranch={currentGitHubBranch}
        onIndexingComplete={(data) => {
          setKnowledgeGraphData(data);
        }}
        onOpenGraph={() => setShowKnowledgeGraph(true)}
      />

      {/* ── Interactive 60fps Canvas Knowledge Graph Visualizer ────── */}
      {showKnowledgeGraph && (
        <CodeKnowledgeGraph
          graphData={knowledgeGraphData}
          onClose={() => {
            setShowKnowledgeGraph(false);
            setActiveFlowSequence(null);
            setActiveFlowSteps(null);
          }}
          onOpenFile={(path) => {
            handleOpenFile(path);
          }}
          activeFlowSequence={activeFlowSequence}
          activeFlowSteps={activeFlowSteps}
        />
      )}

      {/* ── Remote GitHub Workspace Modal ─────────────────────────── */}
      <GitHubOpenModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        apiBase={apiBase}
        onOpenRepo={(info, branch, tree, token) => {
          setGithubRepoInfo(info);
          setGithubToken(token);
          setIsGitHubWorkspace(true);
          setCurrentGitHubBranch(branch);
          setCurrentProjectName(info.full_name);
          setGitBranch(branch);
          setWorkspaceTree(tree);
          setOpenTabs([]);
          setActiveTabPath('');
          setEditorContent('');
        }}
        onForkNeeded={(info, token) => {
          setGithubRepoInfo(info);
          setGithubToken(token);
          setShowAutoForkModal(true);
        }}
      />

      {/* ── Auto-Fork Prompt Modal ─────────────────────────────────── */}
      <AutoForkPromptModal
        isOpen={showAutoForkModal}
        onClose={() => setShowAutoForkModal(false)}
        repoInfo={githubRepoInfo}
        token={githubToken}
        apiBase={apiBase}
        onForkSuccess={async (forkOwner, forkRepo, defaultBranch) => {
          try {
            const res = await fetch(`${apiBase}/api/github/open-repo`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                repo_url: `${forkOwner}/${forkRepo}`,
                token: githubToken,
                branch: defaultBranch
              })
            });
            if (res.ok) {
              const data = await res.json();
              setGithubRepoInfo(data.repo_info);
              setIsGitHubWorkspace(true);
              setCurrentGitHubBranch(data.branch);
              setCurrentProjectName(data.repo_info.full_name);
              setGitBranch(data.branch);
              setWorkspaceTree(data.tree);
              setOpenTabs([]);
              setActiveTabPath('');
              setEditorContent('');
            }
          } catch (e) {
            console.error("Failed to open forked repository", e);
          }
        }}
        onContinueReadOnly={async () => {
          if (githubRepoInfo) {
            try {
              const res = await fetch(`${apiBase}/api/github/open-repo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  repo_url: githubRepoInfo.full_name,
                  token: githubToken || undefined,
                  branch: githubRepoInfo.default_branch
                })
              });
              if (res.ok) {
                const data = await res.json();
                setIsGitHubWorkspace(true);
                setCurrentGitHubBranch(data.branch);
                setCurrentProjectName(data.repo_info.full_name);
                setGitBranch(data.branch);
                setWorkspaceTree(data.tree);
                setOpenTabs([]);
                setActiveTabPath('');
                setEditorContent('');
              }
            } catch (e) {
              console.error("Failed to open read-only repository", e);
            }
          }
        }}
      />
    </div>
  );
}

/* -- Main Application Component ------------------------------ */
export default function Home() {
  const [appMode, setAppMode] = useState<'api_copilot' | 'copilot_agent' | 'evaluation' | 'arcgen'>('api_copilot');

  // Shared Global State
  const [models, setModels] = useState<string[]>(["gemma3:4b", "gemma3:12b", "codellama:7b-instruct"]);
  const [selectedModel, setSelectedModel] = useState<string>("gemma3:4b");
  const [comparisonModel, setComparisonModel] = useState<string>("codellama:7b-instruct");
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [dbData, setDbData] = useState<{ fixed_chunks: string[], semantic_chunks: string[] }>({ fixed_chunks: [], semantic_chunks: [] });
  
  // Configuration Settings State
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [chunkingStrategy, setChunkingStrategy] = useState<'semantic' | 'fixed' | 'openapi'>('semantic');
  const [searchStrategy, setSearchStrategy] = useState<'hybrid' | 'bm25' | 'dense'>('hybrid');
  const [topK, setTopK] = useState<number>(5);

  // RAG View State
  const [query, setQuery] = useState('');
  const [generationA, setGenerationA] = useState('');
  const [generationB, setGenerationB] = useState('');
  const [loading, setLoading] = useState(false);
  const [metricsA, setMetricsA] = useState<{ latencyMs: number; tokens: number } | null>(null);
  const [metricsB, setMetricsB] = useState<{ latencyMs: number; tokens: number } | null>(null);
  const [pipelineStage, setPipelineStage] = useState<number>(-1);
  const [activeTab, setActiveTab] = useState<'terminal' | 'search' | 'db'>('terminal');
  const [searchData, setSearchData] = useState<{ bm25: any[]; dense: any[]; cross_encoder: any[] } | null>(null);
  const [highlightStrategy, setHighlightStrategy] = useState<string | null>(null);
  
  const [uploading, setUploading] = useState(false);
  const [uploadChunks, setUploadChunks] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRefA = useRef<HTMLDivElement>(null);
  const outputRefB = useRef<HTMLDivElement>(null);

  // Resilient Data Loading with Automatic Retry
  useEffect(() => {
    let isMounted = true;

    const fetchModels = async (retries = 3) => {
      try {
        const res = await fetch(`${API_BASE}/api/models`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted && data.models && data.models.length > 0) {
          setModels(data.models);
          if (!selectedModel || !data.models.includes(selectedModel)) {
            setSelectedModel(data.models[0]);
          }
          if (data.models.length > 1 && (!comparisonModel || !data.models.includes(comparisonModel))) {
            setComparisonModel(data.models[1]);
          }
        }
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => fetchModels(retries - 1), 2000);
        }
      }
    };

    const fetchDatabase = async (retries = 3) => {
      try {
        const res = await fetch(`${API_BASE}/api/database`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted) setDbData(data);
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => fetchDatabase(retries - 1), 2000);
        }
      }
    };

    fetchModels();
    fetchDatabase();

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-scroll outputs when tokens stream in
  useEffect(() => {
    if (outputRefA.current) {
      outputRefA.current.scrollTop = outputRefA.current.scrollHeight;
    }
  }, [generationA]);

  useEffect(() => {
    if (outputRefB.current) {
      outputRefB.current.scrollTop = outputRefB.current.scrollHeight;
    }
  }, [generationB]);

  // Stream reader helper for model generation
  const streamModelGeneration = async (
    targetModel: string,
    onToken: (fullText: string) => void,
    onComplete: (metrics: { latencyMs: number; tokens: number }) => void,
    onError: (err: string) => void
  ) => {
    const startTime = performance.now();
    let tokenCount = 0;
    let accumulatedText = '';

    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          model: targetModel,
          top_k: topK,
          search_strategy: searchStrategy
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: 'Service unreachable' }));
        onError(errData.detail || 'Model generation failed.');
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.token) {
                  tokenCount++;
                  accumulatedText += data.token;
                  onToken(accumulatedText);
                }
                if (data.done) break;
                if (data.error) {
                  accumulatedText += `\n\n> ⚠️ **Error:** ${data.error}`;
                  onToken(accumulatedText);
                  break;
                }
              } catch (e) {}
            }
          }
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      onComplete({ latencyMs: elapsed, tokens: tokenCount });
    } catch (e: any) {
      onError(`Connection error to ${targetModel}`);
    }
  };

  const handleProcess = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearchData(null);
    setGenerationA('');
    setGenerationB('');
    setMetricsA(null);
    setMetricsB(null);
    setPipelineStage(0);
    setActiveTab('terminal');

    try {
      // Stage 1: BM25 Lexical
      setPipelineStage(1);
      const searchRes = await fetch(`${API_BASE}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, model: selectedModel, top_k: topK })
      });
      const searchDataResult = await searchRes.json();
      
      // Stage 2: Dense Vector Proximity
      setPipelineStage(2);
      await new Promise(r => setTimeout(r, 200));
      
      // Stage 3: Cross-Encoder Re-Ranking
      setPipelineStage(3);
      setSearchData(searchDataResult);
      await new Promise(r => setTimeout(r, 200));

      // Stage 4: LLM Generation
      setPipelineStage(4);

      if (compareMode) {
        // Run Model A and Model B in Parallel Side-by-Side
        await Promise.all([
          streamModelGeneration(
            selectedModel,
            (text) => setGenerationA(text),
            (m) => setMetricsA(m),
            (err) => setGenerationA(`❌ **Error (${selectedModel}):** ${err}`)
          ),
          streamModelGeneration(
            comparisonModel,
            (text) => setGenerationB(text),
            (m) => setMetricsB(m),
            (err) => setGenerationB(`❌ **Error (${comparisonModel}):** ${err}`)
          )
        ]);
      } else {
        // Single Model Stream
        await streamModelGeneration(
          selectedModel,
          (text) => setGenerationA(text),
          (m) => setMetricsA(m),
          (err) => setGenerationA(`❌ **Error:** ${err}`)
        );
      }

      setPipelineStage(-1);
    } catch (e) {
      setGenerationA(`❌ **Connection error:** Could not reach API Gateway on \`${API_BASE}\`.`);
      setPipelineStage(-1);
    }
    setLoading(false);
  };

  const handleNavigateStage = (stage: typeof PIPELINE_STAGES[0]) => {
    setActiveTab(stage.targetTab as 'terminal' | 'search' | 'db');
    if (stage.highlightKey) {
      setHighlightStrategy(stage.highlightKey);
      setTimeout(() => setHighlightStrategy(null), 3000);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    const formData = new FormData();
    formData.append('file', file);
    
    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setUploadChunks(data.chunks || []);
      setShowModal(true);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Document upload failed.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const tabs = [
    { id: 'terminal', label: compareMode ? 'Model Comparison' : 'Code Synthesis', icon: '▸' },
    { id: 'search', label: 'Search Diagnostics', icon: '◈' },
    { id: 'db', label: 'Knowledge Base', icon: '◆' },
  ];

  return (
    <div className="min-h-screen bg-[#08090a] text-[#c8ccd0] font-sans antialiased selection:bg-[#2563eb]/30 selection:text-white">
      
      {/* ── Top Universal Header & Mode Switcher ──────────────────── */}
      <header className="border-b border-[#161922] bg-[#07080a]/95 backdrop-blur-md sticky top-0 z-50 select-none">
        <div className="max-w-[1400px] mx-auto px-6 h-[56px] flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-1.5 shadow-sm">
              <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-[#e2e5ea] tracking-tight">
                  Archon Copilot
                </span>
                <span className="text-[9.5px] font-mono font-medium px-1.5 py-0.2 bg-[#12151c] border border-[#1e232e] text-[#60a5fa] rounded">
                  v2.0
                </span>
              </div>
            </div>
          </div>

          {/* Center Mode Switcher */}
          <div className="flex items-center p-1 bg-[#0c0e12] border border-[#1a1e26] rounded-xl shadow-inner gap-1">
            <button
              onClick={() => setAppMode('api_copilot')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer ${
                appMode === 'api_copilot'
                  ? 'bg-[#1e293b] text-[#60a5fa] border border-[#3b82f6]/30 shadow-md'
                  : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              <Icons.Bolt />
              <span>Archon RAG</span>
            </button>
            <button
              onClick={() => setAppMode('copilot_agent')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer ${
                appMode === 'copilot_agent'
                  ? 'bg-[#1e293b] text-[#60a5fa] border border-[#3b82f6]/30 shadow-md'
                  : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              <Icons.ArchonAI />
              <span>Archon Agent (IDE)</span>
            </button>
            <button
              onClick={() => setAppMode('evaluation')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer ${
                appMode === 'evaluation'
                  ? 'bg-[#1e293b] text-[#34d399] border border-[#10b981]/40 shadow-md'
                  : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              <Icons.Chart />
              <span>Lab 4 Evaluation</span>
            </button>
            <button
              onClick={() => setAppMode('arcgen')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer ${
                appMode === 'arcgen'
                  ? 'bg-[#1e293b] text-[#a78bfa] border border-[#8b5cf6]/40 shadow-md'
                  : 'text-[#64748b] hover:text-[#cbd5e1]'
              }`}
            >
              <Icons.Architecture />
              <span>ArcGen Studio</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#10b981]/10 border border-[#10b981]/25 rounded-lg text-[11px] font-mono text-[#10b981]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
            <span>online</span>
          </div>
        </div>
      </header>

      {/* ── VIEWPORT CONTENT SWITCHER ─────────────────────────────── */}
      {appMode === 'evaluation' ? (
        <main className="w-full min-h-[calc(100vh-56px)]">
          <EvaluationDashboard />
        </main>
      ) : appMode === 'arcgen' ? (
        <main className="w-full min-h-[calc(100vh-56px)] bg-[#090b0e]">
          <ArcGenStudio
            apiBase={API_BASE}
            onOpenInIDE={() => setAppMode('copilot_agent')}
          />
        </main>
      ) : appMode === 'copilot_agent' ? (
        <main className="w-full h-[calc(100vh-56px)] overflow-hidden">
          <VSCodeAgentIDE
            apiBase={API_BASE}
            models={models}
            setModels={setModels}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
          />
        </main>
      ) : (
        <main className="min-h-[calc(100vh-56px)] p-6 md:p-10">
          
          {/* Upload Spec Modal */}
          {showModal && (
            <div 
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
              onClick={() => setShowModal(false)}
            >
              <div 
                className="bg-[#0e1015] border border-[#1a1e26] rounded-xl max-w-3xl w-full max-h-[75vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="px-6 py-5 border-b border-[#1a1e26] flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-semibold text-[#e2e5ea] tracking-tight">Document Ingested</h3>
                    <p className="text-xs text-[#4a5060] mt-1 font-mono">{uploadChunks.length} semantic segments extracted</p>
                  </div>
                  <button 
                    onClick={() => setShowModal(false)} 
                    className="text-[#4a5060] hover:text-[#c8ccd0] transition-colors duration-300 w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#1a1e26] cursor-pointer"
                  >
                    <Icons.Close />
                  </button>
                </div>
                <div className="p-5 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
                  {uploadChunks.map((chunk, i) => (
                    <div key={i} className="bg-[#08090a] border border-[#1a1e26] rounded-lg p-4 hover:border-[#282e3a] transition-colors duration-300">
                      <div className="text-[10px] font-mono font-medium text-[#4a5060] mb-2.5 tracking-wider uppercase">Segment {i + 1}</div>
                      <pre className="text-[12.5px] text-[#8b92a0] whitespace-pre-wrap font-mono leading-relaxed">{chunk}</pre>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 border-t border-[#1a1e26] flex justify-end">
                  <button 
                    onClick={() => setShowModal(false)} 
                    className="bg-[#1a1e26] hover:bg-[#282e3a] text-[#c8ccd0] px-6 py-2 rounded-lg text-sm font-medium transition-all duration-300 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Configure Strategy & Hyperparameters Modal ─────────── */}
          {showConfigModal && (
            <div 
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
              onClick={() => setShowConfigModal(false)}
            >
              <div 
                className="bg-[#0e1015] border border-[#1a1e26] rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center pb-3 border-b border-[#1a1e26]">
                  <div className="flex items-center gap-2">
                    <Icons.Settings />
                    <h3 className="text-[14px] font-mono font-semibold text-[#e2e5ea]">
                      RAG Retrieval Configuration
                    </h3>
                  </div>
                  <button 
                    onClick={() => setShowConfigModal(false)}
                    className="text-[#4a5060] hover:text-[#c8ccd0] p-1 cursor-pointer rounded hover:bg-[#1a1e26]"
                  >
                    <Icons.Close />
                  </button>
                </div>

                {/* Chunking Strategy Option */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] font-semibold">
                    Chunking Strategy
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'semantic', label: 'Semantic', desc: 'Context-aware splits' },
                      { id: 'fixed', label: 'Fixed Window', desc: '500-token chunks' },
                      { id: 'openapi', label: 'OpenAPI Spec', desc: 'Endpoint boundaries' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setChunkingStrategy(opt.id as any)}
                        className={`p-2.5 rounded-lg border text-left font-mono transition-all cursor-pointer ${
                          chunkingStrategy === opt.id
                            ? 'border-[#3b82f6] bg-[#3b82f6]/10 text-[#e2e5ea] shadow-sm'
                            : 'border-[#1a1e26] bg-[#08090a] text-[#64748b] hover:text-[#8b92a0] hover:border-[#282e3a]'
                        }`}
                      >
                        <div className="text-[11px] font-semibold">{opt.label}</div>
                        <div className="text-[9.5px] text-[#475569] mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Strategy Option */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-[#64748b] font-semibold">
                    Retrieval & Ranking Strategy
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'hybrid', label: 'Hybrid Re-Rank', desc: 'BM25 + Dense + Cross' },
                      { id: 'dense', label: 'Dense Vector', desc: 'ChromaDB BGE-small' },
                      { id: 'bm25', label: 'BM25 Lexical', desc: 'Exact keyword match' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSearchStrategy(opt.id as any)}
                        className={`p-2.5 rounded-lg border text-left font-mono transition-all cursor-pointer ${
                          searchStrategy === opt.id
                            ? 'border-[#3b82f6] bg-[#3b82f6]/10 text-[#e2e5ea] shadow-sm'
                            : 'border-[#1a1e26] bg-[#08090a] text-[#64748b] hover:text-[#8b92a0] hover:border-[#282e3a]'
                        }`}
                      >
                        <div className="text-[11px] font-semibold">{opt.label}</div>
                        <div className="text-[9.5px] text-[#475569] mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Top-K Slider */}
                <div className="space-y-2 pt-2 border-t border-[#1a1e26]">
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-[#64748b] uppercase tracking-wider font-semibold">Top-K Context Chunks</span>
                    <span className="text-[#60a5fa] font-bold">{topK}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={topK}
                    onChange={(e) => setTopK(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#161b24] rounded-lg appearance-none cursor-pointer accent-[#3b82f6]"
                  />
                  <div className="flex justify-between text-[9.5px] font-mono text-[#475569]">
                    <span>1 (High Precision)</span>
                    <span>10 (Broad Context)</span>
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-[#1a1e26]">
                  <button
                    onClick={() => setShowConfigModal(false)}
                    className="bg-[#1e293b] hover:bg-[#334155] text-[#e2e5ea] px-5 py-2 rounded-lg text-[12px] font-mono font-semibold transition-all cursor-pointer border border-[#334155]"
                  >
                    Apply Configuration
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="max-w-[1200px] mx-auto">
            
            {/* Header */}
            <header className="mb-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-[#1a1e26]">
                <div>
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-2 h-2 rounded-full bg-[#3b82f6] animate-pulse" />
                    <span className="text-[10px] font-mono font-medium text-[#4a5060] tracking-[0.2em] uppercase">RAG Engine Live</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#12151c] border border-[#1e232e] flex items-center justify-center p-1.5 shadow-sm">
                      <img src="/aionlabs.svg" alt="Archon" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-[28px] font-semibold text-[#e2e5ea] tracking-[-0.02em] leading-tight">
                      Archon RAG
                    </h1>
                  </div>
                  <p className="text-[13px] text-[#4a5060] mt-1.5 font-mono">
                    {searchStrategy === 'hybrid'
                      ? 'Hybrid retrieval (BM25 + Dense + Cross-Encoder) & Code Synthesis'
                      : searchStrategy === 'dense'
                        ? 'ChromaDB Dense Vector Embedding Search & Code Synthesis'
                        : 'Okapi BM25 Lexical Keyword Search & Code Synthesis'}
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2.5 items-end">
                  {/* Upload Button */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono font-medium text-[#4a5060] tracking-wider uppercase">Ingest Spec</label>
                    <div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleUpload} 
                        className="hidden" 
                        id="file-upload"
                        accept=".json,.yaml,.yml,.md" 
                      />
                      <label 
                        htmlFor="file-upload" 
                        className="cursor-pointer flex items-center gap-2 bg-[#0e1015] border border-[#1a1e26] hover:border-[#282e3a] text-[#6b7280] hover:text-[#c8ccd0] px-3.5 py-2 rounded-lg text-[12.5px] font-mono transition-all duration-300"
                      >
                        {uploading ? (
                          <span className="flex items-center gap-2"><span className="animate-spin text-[#3b82f6]">⟳</span>Ingesting</span>
                        ) : (
                          <><span className="text-[#4a5060]">↑</span>Upload</>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* Active Model Selector A */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono font-medium text-[#4a5060] tracking-wider uppercase">Active Model</label>
                    <select 
                      value={selectedModel} 
                      onChange={e => setSelectedModel(e.target.value)}
                      className="bg-[#0e1015] border border-[#1a1e26] hover:border-[#282e3a] text-[#c8ccd0] py-2 px-3.5 rounded-lg text-[12.5px] font-mono outline-none focus:border-[#3b82f6]/50 transition-all duration-300 cursor-pointer max-w-[190px] truncate"
                      title={selectedModel}
                    >
                      {models.map(m => (
                        <option key={m} value={m} className="bg-[#0e1015]">{m}</option>
                      ))}
                    </select>
                  </div>

                  {/* Model B Selector (When Comparison is Active) */}
                  {compareMode && (
                    <div className="flex flex-col gap-1.5 animate-fade-in">
                      <label className="text-[10px] font-mono font-medium text-[#a78bfa] tracking-wider uppercase">Compare Model</label>
                      <select 
                        value={comparisonModel} 
                        onChange={e => setComparisonModel(e.target.value)}
                        className="bg-[#0e1015] border border-[#a78bfa]/40 text-[#a78bfa] py-2 px-3.5 rounded-lg text-[12.5px] font-mono outline-none focus:border-[#a78bfa] transition-all duration-300 cursor-pointer max-w-[190px] truncate shadow-sm"
                        title={comparisonModel}
                      >
                        {models.map(m => (
                          <option key={m} value={m} className="bg-[#0e1015]">{m}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Side-by-Side Model Comparison Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => setCompareMode(!compareMode)}
                    title="Toggle Side-by-Side Dual Model Comparison"
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-mono transition-all duration-200 cursor-pointer border ${
                      compareMode
                        ? 'bg-[#3b82f6]/20 text-[#60a5fa] border-[#3b82f6]/50 shadow-md font-bold'
                        : 'bg-[#0e1015] border-[#1a1e26] hover:border-[#282e3a] text-[#6b7280] hover:text-[#c8ccd0]'
                    }`}
                  >
                    <Icons.Compare />
                    <span>Compare: {compareMode ? 'ON' : 'OFF'}</span>
                  </button>

                  {/* Configure Option Button */}
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(true)}
                    title="Configure Chunking & Retrieval Strategy"
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[12px] font-mono bg-[#0e1015] border border-[#1a1e26] hover:border-[#282e3a] text-[#6b7280] hover:text-[#c8ccd0] transition-all duration-200 cursor-pointer"
                  >
                    <Icons.Settings />
                    <span>Configure</span>
                  </button>
                </div>
              </div>
            </header>

            {/* Global Interactive Pipeline Visualizer */}
            <RagPipeline 
              currentStage={pipelineStage} 
              onNavigateStage={handleNavigateStage} 
            />

            {/* Command Input Bar */}
            <div className={`mb-6 transition-all duration-500 ${inputFocused ? 'scale-[1.003]' : ''}`}>
              <div className={`bg-[#0e1015] border rounded-xl p-1.5 pl-5 flex items-center transition-all duration-500 ${inputFocused ? 'border-[#3b82f6]/50 shadow-[0_0_30px_rgba(59,130,246,0.08)]' : 'border-[#1a1e26]'}`}>
                <span className="text-[#3b82f6] mr-3 font-mono text-sm select-none">▸</span>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onKeyDown={e => e.key === 'Enter' && handleProcess()}
                  placeholder="Ask any API question… e.g. How do I create a customer charge in Stripe?"
                  className="bg-transparent border-none outline-none text-[#e2e5ea] placeholder-[#4a5060] flex-1 text-sm font-mono leading-relaxed"
                />
                <button
                  onClick={handleProcess}
                  disabled={loading || !query.trim()}
                  className={`px-5 py-2.5 rounded-lg text-xs font-mono font-medium transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                    loading || !query.trim() 
                      ? 'bg-transparent text-[#282e3a] cursor-not-allowed' 
                      : 'bg-[#1a1e26] text-[#c8ccd0] hover:bg-[#282e3a] hover:text-white border border-[#282e3a]/50 shadow-sm'
                  }`}
                >
                  {loading ? (
                    <><span className="animate-spin text-[#3b82f6]">⟳</span>Processing</>
                  ) : (
                    <>Execute<span className="text-[10px] text-[#4a5060]">↵</span></>
                  )}
                </button>
              </div>

              {/* Sample Queries */}
              <div className="flex gap-2 mt-2.5 overflow-x-auto pb-1 text-[11px] font-mono text-[#4a5060] custom-scrollbar">
                <span className="text-[#333a48] select-none py-0.5">Try:</span>
                {[
                  "How to charge a card in Stripe?",
                  "Twilio send SMS endpoint & parameters",
                  "SendGrid v3 mail send cURL",
                  "Slack chat.postMessage payload"
                ].map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(sample)}
                    className="hover:text-[#8b92a0] transition-colors duration-300 whitespace-nowrap bg-[#0a0c10] hover:bg-[#0e1015] px-2.5 py-0.5 rounded border border-[#14171e] hover:border-[#1a1e26] cursor-pointer"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            {/* Strategy Tabs & Display Panel */}
            <div className="bg-[#0e1015] border border-[#1a1e26] rounded-xl overflow-hidden shadow-2xl">
              
              {/* Tab Bar */}
              <div className="flex border-b border-[#1a1e26] bg-[#0a0c10]">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-6 py-3.5 text-xs font-mono transition-all duration-300 relative cursor-pointer ${
                      activeTab === tab.id
                        ? 'text-[#e2e5ea] bg-[#0e1015] font-medium'
                        : 'text-[#4a5060] hover:text-[#8b92a0] hover:bg-[#0c0e12]'
                    }`}
                  >
                    <span className={`text-[10px] ${activeTab === tab.id ? 'text-[#3b82f6]' : 'text-[#282e3a]'}`}>
                      {tab.icon}
                    </span>
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                    )}
                  </button>
                ))}
              </div>

              {/* Tab 1: Code Synthesis Output / Side-by-Side Comparison */}
              {activeTab === 'terminal' && (
                <div className="p-6">
                  {compareMode ? (
                    /* ── Side-by-Side Dual Model Comparison Panels ── */
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      
                      {/* Left Column: Model A */}
                      <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#1a1e26] bg-[#0a0c10]/80">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-[#60a5fa]">{selectedModel}</span>
                            <span className="text-[9.5px] font-mono text-[#3b82f6] bg-[#3b82f6]/10 px-1.5 py-0.2 rounded border border-[#3b82f6]/20">Model A</span>
                          </div>
                          {metricsA && (
                            <div className="text-[10px] font-mono text-[#4a5060] flex items-center gap-2">
                              <span>{metricsA.tokens} tokens</span>
                              <span>·</span>
                              <span>{metricsA.latencyMs}ms</span>
                            </div>
                          )}
                        </div>
                        <div ref={outputRefA} className="p-5 overflow-y-auto custom-scrollbar" style={{ minHeight: generationA || loading ? '240px' : '180px', maxHeight: '550px' }}>
                          {generationA ? (
                            <FormattedMarkdown content={generationA} />
                          ) : loading ? (
                            <div className="flex flex-col items-center justify-center h-[180px] text-[#4a5060] font-mono text-xs space-y-3">
                              <div className="w-5 h-5 border-2 border-[#1a1e26] border-t-[#3b82f6] rounded-full animate-spin" />
                              <span>Generating with {selectedModel}…</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-[140px] text-[#333a48] font-mono text-xs">
                              Enter a query above to execute comparison synthesis.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Column: Model B */}
                      <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#1a1e26] bg-[#0a0c10]/80">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-[#a78bfa]">{comparisonModel}</span>
                            <span className="text-[9.5px] font-mono text-[#a78bfa] bg-[#a78bfa]/10 px-1.5 py-0.2 rounded border border-[#a78bfa]/20">Model B</span>
                          </div>
                          {metricsB && (
                            <div className="text-[10px] font-mono text-[#4a5060] flex items-center gap-2">
                              <span>{metricsB.tokens} tokens</span>
                              <span>·</span>
                              <span>{metricsB.latencyMs}ms</span>
                            </div>
                          )}
                        </div>
                        <div ref={outputRefB} className="p-5 overflow-y-auto custom-scrollbar" style={{ minHeight: generationB || loading ? '240px' : '180px', maxHeight: '550px' }}>
                          {generationB ? (
                            <FormattedMarkdown content={generationB} />
                          ) : loading ? (
                            <div className="flex flex-col items-center justify-center h-[180px] text-[#4a5060] font-mono text-xs space-y-3">
                              <div className="w-5 h-5 border-2 border-[#1a1e26] border-t-[#a78bfa] rounded-full animate-spin" />
                              <span>Generating with {comparisonModel}…</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center h-[140px] text-[#333a48] font-mono text-xs">
                              Enter a query above to execute comparison synthesis.
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  ) : (
                    /* ── Single Model Synthesis View ── */
                    <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg overflow-hidden">
                      <div className="flex justify-between items-center px-4 py-2.5 border-b border-[#1a1e26] bg-[#0a0c10]/60">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#1a1e26]" />
                          <div className="w-2.5 h-2.5 rounded-full bg-[#1a1e26]" />
                          <div className="w-2.5 h-2.5 rounded-full bg-[#1a1e26]" />
                          <span className="text-[11px] font-mono text-[#333a48] ml-2">archon-copilot ~ output</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {loading && (
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#3b82f6]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
                              Streaming…
                            </div>
                          )}
                          {metricsA && (
                            <span className="text-[10px] font-mono text-[#4a5060]">
                              {metricsA.tokens} tokens · {metricsA.latencyMs}ms
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[#282e3a]">{selectedModel}</span>
                        </div>
                      </div>
                      <div ref={outputRefA} className="p-6 min-h-[350px] max-h-[550px] overflow-y-auto custom-scrollbar">
                        {generationA ? (
                          <FormattedMarkdown content={generationA} />
                        ) : loading ? (
                          <div className="flex flex-col items-center justify-center h-[300px] text-[#333a48] font-mono text-xs space-y-3">
                            <div className="w-6 h-6 border-2 border-[#1a1e26] border-t-[#3b82f6] rounded-full animate-spin" />
                            <span>Generating endpoint synthesis…</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-[300px] text-[#282e3a] font-mono text-xs space-y-2">
                            <span>$ Enter a query above to execute hybrid search & synthesis.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: 3-Column Search Diagnostics */}
              {activeTab === 'search' && (
                <div className="p-6">
                  {!searchData ? (
                    <div className="text-center py-20 text-[#282e3a] font-mono text-xs">
                      Run a query to inspect live ranking diagnostics across BM25, Dense Vectors, and Cross-Encoder.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      
                      {/* BM25 Column */}
                      <div className={`bg-[#08090a] rounded-lg flex flex-col transition-all duration-500 border ${
                        highlightStrategy === 'bm25'
                          ? 'border-[#3b82f6] shadow-[0_0_30px_rgba(59,130,246,0.2)] ring-1 ring-[#3b82f6]/50'
                          : 'border-[#1a1e26] hover:border-[#282e3a]'
                      }`}>
                        <div className="border-b border-[#1a1e26] px-4 py-3.5 flex justify-between items-center bg-[#0a0c10]">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-[#3b82f6] font-bold">01</span>
                              <h3 className="text-[12px] font-mono font-semibold text-[#c8ccd0] tracking-wide">Okapi BM25</h3>
                            </div>
                            <p className="text-[10px] text-[#4a5060] mt-0.5 font-mono">Lexical keyword matching</p>
                          </div>
                          <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#4a5060] bg-[#12151c] px-2 py-0.5 rounded border border-[#1a1e26]">TOP {topK}</span>
                        </div>
                        <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                          {Array.isArray(searchData.bm25) ? searchData.bm25.map((item: any, i: number) => (
                            <div key={i} className="bg-[#0e1015] border border-[#1a1e26] rounded-md p-3.5 hover:border-[#282e3a] transition-colors duration-300">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-[9px] font-mono font-bold text-[#6b7280] bg-[#08090a] px-1.5 py-0.5 rounded">#{item.rank}</span>
                                <span className="text-[10px] font-mono font-medium text-[#38bdf8]">{item.score}</span>
                              </div>
                              <pre className="text-[11.5px] text-[#6b7280] font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                            </div>
                          )) : <div className="text-[#4a5060] text-xs font-mono p-3">{typeof searchData.bm25 === 'string' ? searchData.bm25 : 'No results'}</div>}
                        </div>
                      </div>

                      {/* Dense Vector Column */}
                      <div className={`bg-[#08090a] rounded-lg flex flex-col transition-all duration-500 border ${
                        highlightStrategy === 'dense'
                          ? 'border-[#a78bfa] shadow-[0_0_30px_rgba(167,139,250,0.2)] ring-1 ring-[#a78bfa]/50'
                          : 'border-[#1a1e26] hover:border-[#282e3a]'
                      }`}>
                        <div className="border-b border-[#1a1e26] px-4 py-3.5 flex justify-between items-center bg-[#0a0c10]">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-[#a78bfa] font-bold">02</span>
                              <h3 className="text-[12px] font-mono font-semibold text-[#c8ccd0] tracking-wide">Dense Vectors</h3>
                            </div>
                            <p className="text-[10px] text-[#4a5060] mt-0.5 font-mono">BGE-small (ChromaDB)</p>
                          </div>
                          <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#4a5060] bg-[#12151c] px-2 py-0.5 rounded border border-[#1a1e26]">TOP {topK}</span>
                        </div>
                        <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                          {Array.isArray(searchData.dense) ? searchData.dense.map((item: any, i: number) => (
                            <div key={i} className="bg-[#0e1015] border border-[#1a1e26] rounded-md p-3.5 hover:border-[#282e3a] transition-colors duration-300">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-[9px] font-mono font-bold text-[#6b7280] bg-[#08090a] px-1.5 py-0.5 rounded">#{item.rank}</span>
                                <span className="text-[10px] font-mono font-medium text-purple-400/80">{item.score}</span>
                              </div>
                              <pre className="text-[11.5px] text-[#6b7280] font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                            </div>
                          )) : <div className="text-[#4a5060] text-xs font-mono p-3">{typeof searchData.dense === 'string' ? searchData.dense : 'No results'}</div>}
                        </div>
                      </div>

                      {/* Cross-Encoder Column */}
                      <div className={`bg-[#08090a] rounded-lg flex flex-col relative overflow-hidden transition-all duration-500 border ${
                        highlightStrategy === 'cross_encoder'
                          ? 'border-[#10b981] shadow-[0_0_30px_rgba(16,185,129,0.2)] ring-1 ring-[#10b981]/50'
                          : 'border-[#10b981]/20 hover:border-[#10b981]/35'
                      }`}>
                        <div className="border-b border-[#10b981]/15 px-4 py-3.5 flex justify-between items-center bg-[#10b981]/5">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-[#10b981] font-bold">03</span>
                              <h3 className="text-[12px] font-mono font-semibold text-[#10b981] tracking-wide">Cross-Encoder</h3>
                            </div>
                            <p className="text-[10px] text-[#10b981]/60 mt-0.5 font-mono">MS-Marco Deep Re-Ranking</p>
                          </div>
                          <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#10b981]/60 bg-[#10b981]/10 px-2 py-0.5 rounded border border-[#10b981]/20">TOP {topK}</span>
                        </div>
                        <div className="p-3 flex-1 overflow-y-auto h-[440px] space-y-2.5 custom-scrollbar">
                          {Array.isArray(searchData.cross_encoder) ? searchData.cross_encoder.map((item: any, i: number) => (
                            <div key={i} className={`bg-[#0e1015] border rounded-md p-3.5 transition-all duration-300 ${i === 0 ? 'border-[#10b981]/30 shadow-[0_0_12px_rgba(16,185,129,0.06)]' : 'border-[#1a1e26] hover:border-[#282e3a]'}`}>
                              <div className="flex justify-between items-center mb-2">
                                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${i === 0 ? 'text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/20' : 'text-[#6b7280] bg-[#08090a]'}`}>#{item.rank}</span>
                                <span className={`text-[10px] font-mono font-medium ${i === 0 ? 'text-[#10b981]' : 'text-[#10b981]/50'}`}>{item.score}</span>
                              </div>
                              <pre className="text-[11.5px] text-[#8b92a0] font-mono whitespace-pre-wrap leading-[1.6]">{item.text}</pre>
                            </div>
                          )) : <div className="text-[#4a5060] text-xs font-mono p-3">{typeof searchData.cross_encoder === 'string' ? searchData.cross_encoder : 'No results'}</div>}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Knowledge Base Viewer */}
              {activeTab === 'db' && (
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-1 h-4 bg-[#282e3a] rounded-full" />
                          <h3 className="text-[13px] font-mono font-medium text-[#6b7280] tracking-wide">Legacy Fixed Chunks</h3>
                        </div>
                        <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#4a5060] bg-[#13161c] px-2.5 py-1 rounded uppercase border border-[#1a1e26]">Static</span>
                      </div>
                      <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg p-4 h-[420px] overflow-y-auto space-y-2.5 custom-scrollbar">
                        {dbData?.fixed_chunks?.map((chunk: string, i: number) => (
                          <div key={i} className="p-3.5 bg-[#0e1015] rounded-md border border-[#1a1e26] font-mono text-[12px] text-[#6b7280] leading-[1.7] hover:border-[#282e3a] transition-colors duration-300 cursor-default">
                            {chunk}
                          </div>
                        )) || (
                          <div className="flex items-center justify-center h-full">
                            <span className="text-[#282e3a] font-mono text-xs">Awaiting data snapshot…</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-1 h-4 bg-[#3b82f6]/50 rounded-full" />
                          <h3 className="text-[13px] font-mono font-medium text-[#6b7280] tracking-wide">Semantic Vector Chunks</h3>
                        </div>
                        <span className="text-[9px] font-mono font-medium tracking-[0.15em] text-[#3b82f6]/70 bg-[#3b82f6]/10 px-2.5 py-1 rounded uppercase border border-[#3b82f6]/20">Smart Chunks</span>
                      </div>
                      <div className="bg-[#08090a] border border-[#1a1e26] rounded-lg p-4 h-[420px] overflow-y-auto space-y-2.5 custom-scrollbar">
                        {dbData?.semantic_chunks?.map((chunk: string, i: number) => (
                          <div key={i} className="p-3.5 bg-[#0e1015] rounded-md border border-[#1a1e26] font-mono text-[12px] text-[#8b92a0] leading-[1.7] hover:border-[#3b82f6]/20 transition-colors duration-300 whitespace-pre-wrap cursor-default">
                            {chunk}
                          </div>
                        )) || (
                          <div className="flex items-center justify-center h-full">
                            <span className="text-[#282e3a] font-mono text-xs">Awaiting data snapshot…</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="mt-8 flex justify-between items-center text-[10px] font-mono text-[#282e3a]">
              <span>v2.0.0-archon</span>
              <span>Archon Copilot · Multi-Strategy Diagnostic Portal</span>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}


