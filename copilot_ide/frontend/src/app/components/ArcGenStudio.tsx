"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Glyph } from './Icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArchitectureDiagramViewer, type DiagramChanges } from './ArchitectureDiagramViewer';
import { QualitativeAnalysisView } from './QualitativeAnalysisView';
import { AtamTradeoffMatrixView } from './AtamTradeoffMatrixView';
import { JuryPanel, JuryResultBanner, VerdictBadge, juryReducer, initialJuryState, type IterationRecord, type JuryEvent, type JuryState } from './JuryPanel';
import { ErrorState, Skeleton } from './StateViews';
import { ArcGenLlmSettings } from './ArcGenLlmSettings';
import { LlmSetupModal } from './LlmSetupModal';
import { errorDetail, errorMessage } from '@/lib/api';
import { useCommand } from './commandsContext';
import { replaceQuery, type ArchitectView } from '@/lib/deepLinks';
import { useSessionState } from '@/lib/sessionState';

/** A generation running on the ArcGen service (see services/arcgen_service/app/jobs.py). */
interface ActiveJob { id: string; kind: 'jury' | 'plain' }
class JobGone extends Error {}
class JobFailed extends Error {}

interface ArcGenStudioProps {
  apiBase: string;
  onOpenInIDE?: (filePath?: string) => void;
  // Deep link: open on this output tab and keep ?view= in step with it
  initialView?: ArchitectView;
  syncUrl?: boolean;
}

interface PatternInfo {
  pattern_id: string;
  name: string;
  topology_type: string;
  role: string;
  catalog_source?: string;
  summary: string;
  forces_resolved: string[];
  forces_unresolved: string[];
  anti_requisites: string[];
  limits: {
    supported_consistency: string[];
    min_team_size: number;
    operational_complexity: number;
    cost_factor: number;
    max_scale_rps?: number | null;
  };
}

interface ASRSlot {
  filled: boolean;
  weight: number;
  value: string | null;
}

interface ASRSummary {
  turn_count: number;
  coverage_ratio: number;
  coverage_percentage: number;
  filled_count: number;
  total_slots: number;
  slots: Record<string, ASRSlot>;
}

interface QuestionItem {
  question_id: string;
  target_dimension: string;
  question_text: string;
  why_it_matters: string;
  suggested_options: string[];
}

export interface ArchNode {
  node_id: string;
  name: string;
  node_type: string;
  layer?: string;
  description: string;
  responsibilities: string[];
  traced_requirements: string[];
  kb_citations: string[];
}

export interface ArchEdge {
  edge_id: string;
  source: string;
  target: string;
  edge_type: string;
  protocol?: string;
  payload_description?: string;
  traced_requirements: string[];
  kb_citations: string[];
  justification: string;
}

interface ArchitectureGraphData {
  project_name: string;
  style: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  plantuml?: string;
  mermaid?: string;
  tradeoff_table?: string;
  validation_report?: {
    total_nodes: number;
    total_edges: number;
    valid_edges_count: number;
    rejected_edges_count: number;
    rejected_reasons: string[];
    orphan_nodes: string[];
    orphan_ratio: number;
    covered_requirement_ids: string[];
    uncovered_requirement_ids: string[];
    requirement_coverage_pct: number;
    is_valid: boolean;
  };
}

/** What a jury regeneration changed, in the shape the diagram canvas highlights. */
function changesOf(record: IterationRecord): DiagramChanges | null {
  if (!record.diff) return null;
  return { label: `v${record.version} vs v${record.version - 1}`, added: record.diff.nodes_added, removed: record.diff.nodes_removed };
}

export function ArcGenStudio({ apiBase, onOpenInIDE, initialView, syncUrl = false }: ArcGenStudioProps) {
  // Main Studio Mode: 'elicitation' | 'direct_srs' | 'patterns_catalog' | 'qualitative_analysis'
  const [studioMode, setStudioMode] = useSessionState<'elicitation' | 'direct_srs' | 'patterns_catalog' | 'qualitative_analysis'>('arcgen:mode', 'elicitation');

  // LLM Setup Modal: shown on first visit; can be forced open via ⚙ button
  const [llmModalOpen, setLlmModalOpen] = useState(false);
  // Architecture Output Sub-tab
  const [activeOutputTab, setActiveOutputTab] = useState<'diagram' | 'components' | 'couplings' | 'atam_tradeoffs' | 'validation' | 'jury'>(
    initialView === 'atam' ? 'atam_tradeoffs' : initialView ?? 'diagram',
  );
  useEffect(() => {
    if (syncUrl) replaceQuery({ view: activeOutputTab === 'atam_tradeoffs' ? 'atam' : activeOutputTab === 'diagram' ? undefined : activeOutputTab });
  }, [syncUrl, activeOutputTab]);

  // Elicitation State
  const [prompt, setPrompt] = useSessionState<string>('arcgen:prompt', '');
  const [sessionId, setSessionId] = useSessionState<string>('arcgen:session', '');
  const [asrSummary, setAsrSummary] = useSessionState<ASRSummary | null>('arcgen:asr', null);
  const [currentQuestion, setCurrentQuestion] = useSessionState<QuestionItem | null>('arcgen:question', null);
  const [userAnswer, setUserAnswer] = useSessionState<string>('arcgen:answer', '');
  const [shouldStop, setShouldStop] = useSessionState<boolean>('arcgen:stop', false);
  // Coverage criterion met: generation unlocked, but the interview continues until 100%.
  const [readyToGenerate, setReadyToGenerate] = useSessionState<boolean>('arcgen:ready', false);
  const [stopReason, setStopReason] = useSessionState<string>('arcgen:stopReason', '');
  const [isEliciting, setIsEliciting] = useState<boolean>(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isSkipping, setIsSkipping] = useState<boolean>(false);
  // Kept across studio tab switches / reloads: the job keeps running on the service and we re-attach.
  const [activeJob, setActiveJob] = useSessionState<ActiveJob | null>('arcgen:job', null);
  const [isGenerating, setIsGenerating] = useState<boolean>(() => activeJob !== null);
  const [statusMsg, setStatusMsg] = useSessionState<string>('arcgen:status', '');

  // Direct SRS Mode
  const [srsText, setSrsText] = useSessionState<string>('arcgen:srs', '');

  // Generated Architecture Graph
  const [generatedArch, setGeneratedArch] = useSessionState<ArchitectureGraphData | null>('arcgen:arch', null);

  // Bias jury: on by default, so every architecture is judged unless deliberately skipped
  const [juryEnabled, setJuryEnabled] = useSessionState<boolean>('arcgen:juryOn', true);
  const [jury, setJury] = useSessionState<JuryState | null>('arcgen:jury', null);
  // Components added/removed by a jury regeneration, highlighted on the diagram canvas
  const [diagramChanges, setDiagramChanges] = useSessionState<DiagramChanges | null>('arcgen:changes', null);

  // Pattern Catalog
  const [patterns, setPatterns] = useState<PatternInfo[]>([]);
  const [patternFilter, setPatternFilter] = useState<string>('all');

  // Examples & Templates
  const [exampleTemplates, setExampleTemplates] = useState<{ id: string; title: string; prompt: string }[]>([]);
  const [preGeneratedSamples, setPreGeneratedSamples] = useState<{ id: string; name: string; style: string; nodes_count: number; edges_count: number; data: any }[]>([]);

  // Notification / Copy state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // Presets load from the ArcGen service; null = still loading
  const [presetsState, setPresetsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const srsFileRef = React.useRef<HTMLInputElement>(null);

  // apiBase arrives already resolved for the page's host (see lib/api.ts)
  const effectiveApiBase = apiBase;

  // Defensive parser for options so multiple benchmark targets never collapse into one single button
  const currentOptions = useMemo(() => {
    if (!currentQuestion?.suggested_options) return [];
    const raw = Array.isArray(currentQuestion.suggested_options)
      ? currentQuestion.suggested_options
      : [String(currentQuestion.suggested_options)];

    const list: string[] = [];
    raw.forEach(entry => {
      if (!entry) return;
      const text = String(entry).trim();
      if (!text) return;

      // 1. If contains newlines, split each line
      if (text.includes('\n')) {
        text
          .split('\n')
          .map(l => l.replace(/^[-*•\d.)\s]+/, '').trim())
          .filter(Boolean)
          .forEach(l => list.push(l));
        return;
      }

      // 2. If contains numbered markers (e.g. "1. ... 2. ..." or "Option 1: ... Option 2: ...")
      const splitPattern = /(?:\s+|^)(?:(?:Option\s+\d+:?)|(?:\d+[\.\)]))\s*/gi;
      const parts = text
        .split(splitPattern)
        .map(s => s.trim().replace(/^[,;.-]+/, '').replace(/[,;.-]+$/, ''))
        .filter(Boolean);

      if (parts.length > 1) {
        list.push(...parts);
      } else {
        list.push(text);
      }
    });

    return list.filter(opt => opt.length > 1);
  }, [currentQuestion?.suggested_options]);

  const loadData = React.useCallback(async () => {
    let reached = false;
    try {
      const pRes = await fetch(`${effectiveApiBase}/api/arcgen/patterns`);
      reached = true;
      if (pRes.ok) {
        const pData = await pRes.json();
        if (pData.patterns && pData.patterns.length > 0) {
          setPatterns(pData.patterns);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch patterns:", err);
    }

    try {
      const eRes = await fetch(`${effectiveApiBase}/api/arcgen/examples`);
      reached = true;
      if (eRes.ok) {
        const eData = await eRes.json();
        if (eData.prompt_templates && eData.prompt_templates.length > 0) {
          setExampleTemplates(eData.prompt_templates);
          setPrompt(prev => prev ? prev : (eData.prompt_templates[0]?.prompt || ''));
        }
        if (eData.pre_generated && eData.pre_generated.length > 0) {
          setPreGeneratedSamples(eData.pre_generated);
          setGeneratedArch(prev => prev ? prev : (eData.pre_generated[0]?.data || null));
        }
      }
    } catch (err) {
      console.warn("Failed to fetch examples:", err);
    }
    setPresetsState(prev => (reached ? 'ready' : prev === 'ready' ? prev : 'error'));
  }, [effectiveApiBase, setGeneratedArch, setPrompt]);

  const retryLoad = () => {
    setPresetsState('loading');
    loadData();
  };

  // Read a local .txt / .md SRS into the editor (nothing is uploaded until Generate)
  const handleSrsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setSrsText(await file.text());
      setStatusMsg(`Loaded ${file.name}. Review it, then generate.`);
    } catch {
      setStatusMsg(`Couldn't read ${file.name}. Use a plain-text (.txt or .md) file.`);
    }
  };

  // Load Patterns and Examples on mount with automatic retry
  useEffect(() => {
    loadData();
    const timer = setTimeout(() => {
      loadData();
    }, 2000);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Automatically restore API keys from browser localStorage to the backend if the backend lost them (e.g. after container restart)
  useEffect(() => {
    try {
      const groq = localStorage.getItem('archon:key:groq') || '';
      let omni = localStorage.getItem('archon:key:omnikey') || '';
      // Clean up accidental cross-provider keys: Groq key in omnikey
      if (omni && omni.startsWith('gsk_')) {
        localStorage.removeItem('archon:key:omnikey');
        omni = '';
        fetch(`${effectiveApiBase}/api/arcgen/llm/keys/omnikey`, { method: 'DELETE' }).catch(() => {});
      }
      if (!groq && !omni) return;
      fetch(`${effectiveApiBase}/api/arcgen/llm`)
        .then(r => (r.ok ? r.json() : null))
        .then(s => {
          if (!s?.providers) return;
          if (groq && !s.providers.groq?.configured && !groq.startsWith('AIza')) {
            fetch(`${effectiveApiBase}/api/arcgen/llm/keys/groq`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ api_key: groq.trim() }),
            }).catch(() => {});
          }
          if (omni && !s.providers.omnikey?.configured && !omni.startsWith('gsk_')) {
            fetch(`${effectiveApiBase}/api/arcgen/llm/keys/omnikey`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ api_key: omni.trim() }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    } catch {}
  }, [effectiveApiBase]);

  // Start Elicitation
  const handleStartElicitation = async () => {
    if (!prompt.trim()) return;
    setIsEliciting(true);
    setStatusMsg("Analyzing initial requirements & extracting architectural drivers...");
    try {
      const res = await fetch(`${effectiveApiBase}/api/arcgen/elicit/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(errorDetail(await res.text()));
      const data = await res.json();
      setSessionId(data.session_id);
      setAsrSummary(data.summary);
      setCurrentQuestion(data.first_question);
      setShouldStop(data.should_stop);
      setReadyToGenerate(data.ready_to_generate ?? data.should_stop);
      setStopReason(data.stop_reason || "");
      setUserAnswer("");
      setStatusMsg(data.should_stop ? "All drivers captured. Ready to generate."
        : data.ready_to_generate ? "Enough to generate. Keep answering to reach 100%." : "Phase A interview active.");
    } catch (err) {
      console.error(err);
      setStatusMsg(err instanceof TypeError ? `Error: the ArcGen service (${effectiveApiBase}) isn't responding.` : `Error: ${errorMessage(err)}`);
    } finally {
      setIsEliciting(false);
    }
  };

  // Submit Answer to current question
  const handleAnswerQuestion = async (skip: boolean = false, customAnswer?: string) => {
    if (!sessionId || !currentQuestion) return;
    const finalAnswer = customAnswer !== undefined ? customAnswer : userAnswer;
    if (!skip && !finalAnswer.trim()) return;

    if (customAnswer !== undefined) {
      setSelectedOption(customAnswer);
    } else if (skip) {
      setIsSkipping(true);
    }

    setIsEliciting(true);
    setStatusMsg(skip ? "Skipping and applying sensible default..." : `Evaluating "${finalAnswer}" & updating ASR matrix...`);
    try {
      const res = await fetch(`${effectiveApiBase}/api/arcgen/elicit/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          target_dimension: currentQuestion.target_dimension,
          answer: finalAnswer,
          question_text: currentQuestion.question_text,
          skip,
        }),
      });
      if (!res.ok) throw new Error(errorDetail(await res.text()));
      const data = await res.json();
      setAsrSummary(data.summary);
      setCurrentQuestion(data.next_question);
      setShouldStop(data.should_stop);
      setReadyToGenerate(data.ready_to_generate ?? data.should_stop);
      setStopReason(data.stop_reason || "");
      setUserAnswer("");
      setStatusMsg(data.should_stop ? "All drivers captured. Ready to generate."
        : data.ready_to_generate ? "Enough to generate. Keep answering to reach 100%." : "Next question formulated.");
    } catch (err) {
      console.error(err);
      setStatusMsg(err instanceof TypeError ? `Error: the ArcGen service (${effectiveApiBase}) isn't responding.` : `Error: ${errorMessage(err)}`);
    } finally {
      setIsEliciting(false);
      setSelectedOption(null);
      setIsSkipping(false);
    }
  };

  // Follow a job's event stream from the start, rebuilding the derived state. Resolves on 'complete';
  // throws JobFailed on 'error', JobGone if the service forgot the job, anything else = connection lost.
  const followJob = async (job: ActiveJob, signal: AbortSignal) => {
    const res = await fetch(`${effectiveApiBase}/api/arcgen/jobs/${job.id}/stream`, { signal });
    if (res.status === 404) throw new JobGone();
    if (!res.ok || !res.body) throw new Error(errorDetail(await res.text()));
    let state = initialJuryState();
    if (job.kind === 'jury') setJury(state);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const line = chunk.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as JuryEvent;
        if (event.type === 'error') throw new JobFailed(event.detail);
        if (job.kind === 'plain') {
          if (event.type === 'stage') setStatusMsg(`Generating architecture: ${event.message}...`);
          if (event.type === 'complete') {
            setGeneratedArch(event.result);
            setActiveOutputTab('diagram');
            setStatusMsg("Architecture graph generated & validated with zero orphans!");
            return;
          }
          continue;
        }
        state = juryReducer(state, event);
        setJury(state);
        if (event.type === 'iteration') {
          // Show each version as soon as it exists, while the jury deliberates. Open the review once,
          // on the first draft; later drafts don't pull the user away from where they are.
          setGeneratedArch(prev => ({ ...(prev ?? {}), ...event.record.graph }));
          if (event.record.version === 1) setActiveOutputTab('jury');
        } else if (event.type === 'complete') {
          setGeneratedArch(event.result);
          // Final version: highlight what the last regeneration changed (nothing for a first-time pass)
          const versions = event.result?.jury?.iterations ?? [];
          setDiagramChanges(versions.length > 1 ? changesOf(versions[versions.length - 1]) : null);
          // Done: land on the result. The banner above the diagram summarises the review.
          setActiveOutputTab('diagram');
          const verdict = event.result?.jury?.verdict;
          setStatusMsg(verdict === 'PASS' ? "Architecture generated and approved by the reviewers."
            : verdict === 'NO_JURY' ? "Architecture generated, but no reviewer model answered (check API key or Ollama connection)."
            : "Architecture generated with open review issues. See the banner above the diagram.");
          return;
        }
      }
    }
    throw new Error("the event stream ended before a result arrived");
  };

  // Stay attached to a job until it finishes. A dropped connection (browser put the tab to sleep,
  // network blip) re-attaches and replays; leaving the page aborts only the stream, not the job.
  const jobAbort = React.useRef<AbortController | null>(null);
  const runJob = async (job: ActiveJob) => {
    jobAbort.current?.abort();
    const ctrl = new AbortController();
    jobAbort.current = ctrl;
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          await followJob(job, ctrl.signal);
          break;
        } catch (err) {
          if (ctrl.signal.aborted) return; // page left; the job keeps running on the service
          if (err instanceof JobGone || err instanceof JobFailed || attempt >= 30) throw err;
          setStatusMsg(`Connection to the ArcGen service lost; re-attaching to the running generation (try ${attempt})...`);
          await new Promise(r => setTimeout(r, Math.min(2000 * attempt, 10000)));
          if (ctrl.signal.aborted) return;
        }
      }
    } catch (err) {
      setStatusMsg(err instanceof JobGone
        ? "The running generation was lost because the ArcGen service restarted. Generate again."
        : `Generation error: ${errorMessage(err)}`);
      setJury(j => (j && j.running ? { ...j, running: false, error: errorMessage(err) } : j));
    }
    setActiveJob(null);
    setIsGenerating(false);
  };

  // Re-attach to a generation that was still running when this page was last open.
  const resumeJob = React.useRef(activeJob);
  useEffect(() => {
    if (resumeJob.current) void runJob(resumeJob.current);
    return () => jobAbort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Generate Architecture (Phase B): starts a job on the service, then follows it
  const handleGenerateArchitecture = async () => {
    if (activeJob) return;
    setIsGenerating(true);
    setDiagramChanges(null);
    setStatusMsg(juryEnabled
      ? "Bias jury in session: 5 local models judge the requirements, then each architecture version..."
      : "Generating architecture: pattern scoring, components, connections, validation...");
    const payload: Record<string, unknown> = { jury: juryEnabled };
    if (studioMode === 'elicitation' && sessionId) payload.session_id = sessionId;
    else payload.srs_text = srsText.trim() ? srsText : prompt;

    let job: ActiveJob;
    try {
      const res = await fetch(`${effectiveApiBase}/api/arcgen/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorDetail(await res.text()));
      const info = await res.json();
      job = { id: info.job_id, kind: info.kind };
    } catch (err) {
      console.error(err);
      setStatusMsg(err instanceof TypeError ? `Generation error: the ArcGen service (${effectiveApiBase}) isn't responding.` : `Generation error: ${errorMessage(err)}`);
      setIsGenerating(false);
      return;
    }
    if (job.kind === 'jury') setGeneratedArch(null);
    else setJury(null);
    setActiveJob(job);
    await runJob(job);
  };

  const juryToggle = (
    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
      <span
        className="font-mono text-fg-soft"
        title="5 local models from different families judge the requirements and every architecture version, blind, against a fixed rubric. Slower: about 5 minutes or more."
      >
        Bias jury <span className="text-fg-subtle">· ~5 min · ⓘ</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={juryEnabled}
        aria-label="Bias jury"
        onClick={() => setJuryEnabled(v => !v)}
        disabled={isGenerating}
        className={`relative w-9 h-5 rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${juryEnabled ? 'bg-success/80 border-success' : 'bg-raised border-line-strong'}`}
      >
        <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${juryEnabled ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
  useCommand('architect.generate', { run: () => { if (!isGenerating) handleGenerateArchitecture(); } });

  // Save to Workspace
  const handleSaveToWorkspace = async () => {
    if (!generatedArch) return;
    try {
      const res = await fetch(`${effectiveApiBase}/api/arcgen/save-to-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_name: generatedArch.project_name,
          architecture: generatedArch,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg(`Saved to workspace: ${data.saved_files.filter(Boolean).join(", ")}`);
      }
    } catch (err) {
      console.error(err);
      setStatusMsg(`Save error: ${errorMessage(err)}`);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Filtered patterns
  // Real validation results (absent for pre-generated samples and while a jury run is mid-way)
  const report = generatedArch?.validation_report;

  const filteredPatterns = useMemo(() => {
    if (patternFilter === 'all') return patterns;
    return patterns.filter(p => p.topology_type.toLowerCase() === patternFilter.toLowerCase() || p.role.toLowerCase() === patternFilter.toLowerCase());
  }, [patterns, patternFilter]);

  // Dimension color mapping
  const getDimensionColor = (dim: string) => {
    switch (dim) {
      case "Throughput / Scale": return "text-info border-info/40 bg-info/10";
      case "Latency Budget": return "text-warning border-warning/40 bg-warning/10";
      case "Data Consistency Model": return "text-danger border-danger/40 bg-danger/10";
      case "Availability / Fault Tolerance": return "text-success border-success/40 bg-success/10";
      case "Security / Compliance": return "text-[#a855f7] border-[#a855f7]/40 bg-[#a855f7]/10";
      case "Deployment Target": return "text-[#06b6d4] border-[#06b6d4]/40 bg-[#06b6d4]/10";
      case "Cost Constraint": return "text-[#84cc16] border-[#84cc16]/40 bg-[#84cc16]/10";
      default: return "text-fg-muted border-[#94a3b8]/40 bg-[#94a3b8]/10";
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-56px)] bg-canvas text-fg-strong flex flex-col font-sans select-text">

      {/* ── LLM Setup Modal (auto-opens first visit; ⚙ button re-opens) ─ */}
      <LlmSetupModal
        apiBase={effectiveApiBase}
        forceOpen={llmModalOpen}
        onClose={() => setLlmModalOpen(false)}
      />

      {/* ── TOP HEADER BANNER ────────────────────────────────────────── */}
      <div className="border-b border-line-strong bg-surface px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-panel bg-gradient-to-br from-info-strong to-accent-strong flex items-center justify-center border border-info/30">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-fg-strong tracking-tight">ArcGen Studio</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-info/15 text-info border border-info/30">
                Stage 1 • Architecture Synthesis
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-success/15 text-success border border-success/30">
                20 Curated Patterns
              </span>
            </div>
            <p className="text-xs text-fg-subtle">
              Interactive ASR Elicitation • Stopping Criteria • Relational Graph Generation (Edge F1 &gt; 0.40) • ATAM Decision Tradeoffs
            </p>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center bg-raised border border-line-strong rounded-panel p-1 gap-1">
          <button
            onClick={() => setStudioMode('elicitation')}
            className={`px-3 py-1.5 rounded-control text-xs font-medium transition-all ${
              studioMode === 'elicitation'
                ? 'bg-selected text-info font-semibold border border-info/30 '
                : 'text-fg-muted hover:text-fg-strong'
            }`}
          >
            Interactive ASR Elicitation
          </button>
          <button
            onClick={() => setStudioMode('direct_srs')}
            className={`px-3 py-1.5 rounded-control text-xs font-medium transition-all ${
              studioMode === 'direct_srs'
                ? 'bg-selected text-info font-semibold border border-info/30 '
                : 'text-fg-muted hover:text-fg-strong'
            }`}
          >
            Direct SRS Document
          </button>
          <button
            onClick={() => setStudioMode('patterns_catalog')}
            className={`px-3 py-1.5 rounded-control text-xs font-medium transition-all ${
              studioMode === 'patterns_catalog'
                ? 'bg-selected text-info font-semibold border border-info/30 '
                : 'text-fg-muted hover:text-fg-strong'
            }`}
          >
            Pattern Knowledge Base ({patterns.length})
          </button>
          <button
            onClick={() => setStudioMode('qualitative_analysis')}
            className={`px-3 py-1.5 rounded-control text-xs font-medium transition-all ${
              studioMode === 'qualitative_analysis'
                ? 'bg-selected text-info font-semibold border border-info/30 '
                : 'text-fg-muted hover:text-fg-strong'
            }`}
          >
            Qualitative Analysis
          </button>
        </div>

        {/* ⚙ LLM Settings button */}
        <button
          type="button"
          onClick={() => setLlmModalOpen(true)}
          title="LLM Settings — switch between local Ollama and cloud API"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-line-strong text-xs text-fg-soft hover:text-fg-strong hover:border-info/40 cursor-pointer transition-colors"
        >
          <span className="text-sm">⚙</span>
          <span className="hidden sm:inline font-mono">LLM</span>
        </button>
      </div>

      {/* ── STATUS BAR NOTIFICATION ──────────────────────────────────── */}
      {statusMsg && (
        <div className="bg-overlay border-b border-line-strong px-6 py-1.5 flex items-center justify-between text-xs text-fg-muted">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-info animate-pulse"></span>
            <span className="font-mono text-fg-soft">{statusMsg}</span>
          </div>
          <button aria-label="Close" onClick={() => setStatusMsg('')} className="text-fg-subtle hover:text-fg-soft">✕</button>
        </div>
      )}

      {/* ── MAIN WORKSPACE CONTENT ───────────────────────────────────── */}
      {studioMode === 'patterns_catalog' ? (
        /* ── VIEW 3: PATTERN KNOWLEDGE BASE CATALOG ─────────────────── */
        <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-bold text-fg-strong">ISO/IEC 25010 Architectural Pattern Catalog</h2>
              <p className="text-xs text-fg-subtle mt-0.5">
                Curated enterprise patterns with forces resolved, limits, and calibrated quality attribute impact ratings
              </p>
            </div>
            <div className="flex items-center gap-2 bg-surface p-1 border border-line-strong rounded-panel text-xs font-mono">
              <span className="text-fg-subtle px-2">Filter:</span>
              {['all', 'monolithic', 'distributed', 'macrostyle', 'companion'].map(f => (
                <button
                  key={f}
                  onClick={() => setPatternFilter(f)}
                  className={`px-2.5 py-1 rounded-control text-xs capitalize ${
                    patternFilter === f ? 'bg-selected text-info font-semibold' : 'text-fg-muted hover:text-fg-strong'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPatterns.map(p => (
              <div key={p.pattern_id} className="bg-raised border border-line-strong rounded-panel p-5 hover:border-info/40 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded-control text-xs font-mono bg-info/15 text-info border border-info/25 font-bold">
                      {p.pattern_id}
                    </span>
                    <span className="px-2 py-0.5 rounded-control text-xs font-mono bg-selected text-fg-soft">
                      {p.topology_type} • {p.role}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-fg-strong mb-1.5">{p.name}</h3>
                  <p className="text-xs text-fg-muted mb-3 leading-relaxed">{p.summary}</p>
                  
                  {p.catalog_source && (
                    <div className="text-xs font-mono text-fg-subtle mb-3">
                      Source: {p.catalog_source}
                    </div>
                  )}

                  <div className="mb-3">
                    <span className="text-xs font-mono text-fg-subtle uppercase tracking-wider block mb-1">Forces Resolved:</span>
                    <div className="flex flex-wrap gap-1">
                      {p.forces_resolved.slice(0, 3).map((f, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded-control text-xs bg-success/10 text-success-fg border border-success/20">
                          ✓ {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-line-strong/70 flex items-center justify-between text-xs font-mono text-fg-subtle">
                  <span>Complexity: <strong className="text-fg-strong">{p.limits.operational_complexity}/5</strong></span>
                  <span>Cost: <strong className="text-fg-strong">{p.limits.cost_factor}/5</strong></span>
                  <span>Consistency: <strong className="text-info">{p.limits.supported_consistency.join(", ")}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : studioMode === 'qualitative_analysis' ? (
        /* ── VIEW 4: QUALITATIVE & EMPIRICAL ARCHITECTURE BENCHMARK ──── */
        <QualitativeAnalysisView />
      ) : (
        /* ── VIEW 1 & 2: 2-COLUMN STUDIO WORKSPACE ───────────────────── */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-[calc(100vh-105px)]">
          
          {/* ── LEFT COLUMN: INPUT & ELICITATION PANEL (5 COLS) ───────── */}
          <div className="lg:col-span-5 border-r border-line-strong bg-surface p-5 flex flex-col gap-4 overflow-y-auto">

            <ArcGenLlmSettings apiBase={effectiveApiBase} disabled={isGenerating} />

            {/* Quick Templates Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-fg-strong uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <span>Architecture Requirements Prompt</span>
                </label>
                <span className="text-xs text-fg-subtle">Presets:</span>
              </div>
              {presetsState === 'error' && (
                <ErrorState
                  compact
                  title="Couldn't load presets and patterns"
                  detail={`The ArcGen service (${effectiveApiBase}) isn't responding. You can still type requirements below.`}
                  onRetry={retryLoad}
                />
              )}
              {presetsState === 'loading' && exampleTemplates.length === 0 && (
                <Skeleton rows={2} widths={[60, 45]} label="Loading presets" padded={false} className="mb-2.5" />
              )}
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {exampleTemplates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setPrompt(t.prompt);
                      setSessionId('');
                      setAsrSummary(null);
                      setCurrentQuestion(null);
                      setShouldStop(false);
                      setReadyToGenerate(false);
                    }}
                    className="px-2 py-1 rounded-control text-xs bg-raised border border-line-strong text-fg-soft hover:border-info/50 hover:text-info transition-all cursor-pointer font-mono"
                  >
                    {t.title}
                  </button>
                ))}
              </div>

              {studioMode === 'elicitation' ? (
                <div>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={4}
                    placeholder="Describe your software system requirements, scale, or business concept..."
                    className="w-full bg-raised border border-line-strong rounded-control p-3 text-xs text-fg-strong placeholder-fg-subtle focus:outline-none focus:border-info/60 focus:ring-1 focus:ring-info/40 font-mono transition-all resize-none"
                  />
                  {!sessionId && (
                    <button
                      onClick={handleStartElicitation}
                      disabled={isEliciting || !prompt.trim()}
                      className="mt-2 w-full py-2.5 px-4 rounded-control bg-gradient-to-r from-info-strong to-accent-strong text-white text-xs font-semibold hover:brightness-110 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isEliciting ? "Extracting Drivers..." : "Start Interactive ASR Elicitation (Phase A)"}
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <input ref={srsFileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" className="hidden" onChange={handleSrsFile} />
                  {!srsText.trim() && (
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      <span>No SRS yet.</span>
                      <button
                        onClick={() => srsFileRef.current?.click()}
                        className="px-2.5 py-1 rounded-control border border-line-strong text-fg-soft hover:border-info/50 hover:text-info cursor-pointer"
                      >
                        Upload SRS
                      </button>
                      {exampleTemplates.length > 0 && (
                        <button
                          onClick={() => setSrsText(exampleTemplates[0].prompt)}
                          className="px-2.5 py-1 rounded-control border border-line-strong text-fg-soft hover:border-info/50 hover:text-info cursor-pointer"
                        >
                          Use example
                        </button>
                      )}
                    </div>
                  )}
                  <textarea
                    value={srsText}
                    onChange={e => setSrsText(e.target.value)}
                    rows={6}
                    placeholder="Paste full Software Requirements Specification (SRS) text or capability statements..."
                    className="w-full bg-raised border border-line-strong rounded-control p-3 text-xs text-fg-strong placeholder-fg-subtle focus:outline-none focus:border-info/60 font-mono transition-all resize-none"
                  />
                  {juryToggle}
                  <button
                    onClick={handleGenerateArchitecture}
                    disabled={isGenerating || !srsText.trim()}
                    className="mt-2 w-full py-2.5 px-4 rounded-control bg-success text-white text-xs font-semibold hover:brightness-110 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isGenerating ? "Synthesizing Architecture..." : <><Glyph name="zap" /> Generate Architecture Directly (Phase B)</>}
                  </button>
                </div>
              )}
            </div>

            {/* ASR Coverage Tracker (Live Slot Progress) */}
            {asrSummary && (
              <div className="bg-raised border border-line-strong rounded-panel p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono uppercase text-info">ASR Coverage Metric</span>
                    <span className="text-xs text-fg-subtle font-mono">Turn {asrSummary.turn_count}</span>
                  </div>
                  <span className={`text-sm font-bold font-mono ${
                    asrSummary.coverage_ratio >= 0.85 ? 'text-success-fg' : 'text-info'
                  }`}>
                    {asrSummary.coverage_percentage.toFixed(1)}%
                  </span>
                </div>

                {/* Progress bar; the tick marks where generation unlocks */}
                <div className="relative mb-4">
                  <div className="w-full h-2 rounded-full bg-selected overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        readyToGenerate || asrSummary.coverage_ratio >= 0.85 ? 'bg-gradient-to-r from-success to-success-fg' : 'bg-gradient-to-r from-info-strong to-info'
                      }`}
                      style={{ width: `${Math.min(100, asrSummary.coverage_percentage)}%` }}
                    />
                  </div>
                  <div className="absolute top-[-2px] h-3 w-px bg-fg-muted" style={{ left: '85%' }} aria-hidden="true" />
                  <span className="absolute top-3 text-[10px] font-mono text-fg-subtle -translate-x-1/2" style={{ left: '85%' }}>
                    ready
                  </span>
                </div>

                {/* 7 Driver Dimension Slot Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {Object.entries(asrSummary.slots).map(([dimName, slot]) => (
                    <div
                      key={dimName}
                      className={`p-2 rounded-panel border text-xs flex items-center justify-between ${
                        slot.filled ? 'bg-success/5 border-success/30 text-fg-strong' : 'bg-raised/40 border-line-strong text-fg-subtle'
                      }`}
                    >
                      <div className="overflow-hidden pr-2">
                        <span className="font-semibold block truncate">{dimName}</span>
                        {slot.filled && slot.value && (
                          <span className="text-xs text-success-fg font-mono truncate block">
                            ✓ {slot.value}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded-control bg-selected text-fg-muted flex-shrink-0">
                        w: {slot.weight}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generation unlocked, interview still open */}
            {readyToGenerate && !shouldStop && (
              <div className="bg-success/10 border border-success/40 rounded-panel p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-success-fg">✓ Enough to generate</div>
                    <p className="text-xs text-fg-soft leading-relaxed">
                      {asrSummary ? `${asrSummary.coverage_percentage.toFixed(0)}% covered. ` : ""}
                      Generate now, or answer the remaining {asrSummary ? asrSummary.total_slots - asrSummary.filled_count : ""} question(s) below to reach 100%.
                    </p>
                  </div>
                  <button
                    onClick={handleGenerateArchitecture}
                    disabled={isGenerating || isEliciting}
                    className="shrink-0 py-2 px-3 rounded-control bg-success hover:brightness-110 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    {isGenerating ? "Synthesizing..." : <><Glyph name="zap" /> Generate now</>}
                  </button>
                </div>
                <div className="mt-1">{juryToggle}</div>
              </div>
            )}

            {/* Current Elicitation Question Card */}
            {currentQuestion && !shouldStop && (
              <div className="bg-overlay border border-info/40 rounded-panel p-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded-control text-xs font-mono font-bold border ${getDimensionColor(currentQuestion.target_dimension)}`}>
                    {currentQuestion.target_dimension}
                  </span>
                  <span className="text-xs font-mono text-fg-subtle">
                    {currentQuestion.question_id}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-fg-strong mb-2 leading-snug">
                  {currentQuestion.question_text}
                </h3>

                {currentQuestion.why_it_matters && (
                  <div className="mb-3 text-xs text-fg-muted bg-raised p-2.5 rounded-panel border border-line-strong">
                    <span className="font-semibold text-info font-mono">Why it matters: </span>
                    {currentQuestion.why_it_matters}
                  </div>
                )}

                {/* Suggested options chips */}
                {currentOptions.length > 0 && (
                  <div className="mb-3">
                    <span className="text-xs font-mono text-fg-subtle block mb-1.5 uppercase tracking-wider">
                      Suggested benchmark targets:
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {currentOptions.map((opt, i) => {
                        const isSelected = selectedOption === opt;
                        return (
                          <button
                            key={i}
                            onClick={() => handleAnswerQuestion(false, opt)}
                            disabled={isEliciting}
                            className={`w-full text-left px-3 py-2 rounded-control text-xs transition-all font-mono flex items-start gap-2.5 ${
                              isSelected
                                ? 'bg-info-strong/25 text-fg-strong border-2 border-info ring-1 ring-info/50 '
                                : isEliciting
                                ? 'bg-raised/40 text-fg-subtle border border-line-strong cursor-not-allowed opacity-30 pointer-events-none'
                                : 'bg-raised/80 hover:bg-selected hover:text-info hover:border-info/40 text-fg-soft border border-line-strong cursor-pointer'
                            }`}
                          >
                            {isSelected ? (
                              <svg className="w-3.5 h-3.5 mt-0.5 text-info animate-spin flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-info/60 mt-1.5 flex-shrink-0"></span>
                            )}
                            <span className="flex-1 leading-relaxed text-xs">{opt}</span>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 rounded-control text-xs font-mono font-bold bg-info text-fg-subtle uppercase tracking-wider flex-shrink-0">
                                Evaluating
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Custom response input */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={userAnswer}
                    onChange={e => setUserAnswer(e.target.value)}
                    placeholder={isEliciting ? "Evaluation in progress..." : "Or type custom specification..."}
                    disabled={isEliciting}
                    onKeyDown={e => e.key === 'Enter' && !isEliciting && handleAnswerQuestion(false)}
                    className="flex-1 bg-raised border border-line-strong rounded-control px-3 py-1.5 text-xs text-fg-strong focus:outline-none focus:border-info/60 font-mono disabled:opacity-40"
                  />
                  <button
                    onClick={() => handleAnswerQuestion(false)}
                    disabled={isEliciting || !userAnswer.trim()}
                    className="px-3.5 py-1.5 rounded-control bg-info-strong hover:brightness-110 text-white text-xs font-medium cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {isEliciting && !selectedOption && !isSkipping && (
                      <svg className="w-3 h-3 text-white animate-spin flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    <span>Submit</span>
                  </button>
                  <button
                    onClick={() => handleAnswerQuestion(true)}
                    disabled={isEliciting}
                    className="px-2.5 py-1.5 rounded-control bg-selected hover:bg-overlay text-fg-muted text-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                    title="Accept sensible architectural default"
                  >
                    {isSkipping && (
                      <svg className="w-3 h-3 text-fg-muted animate-spin flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    <span>Skip</span>
                  </button>
                </div>

                {/* Real-time Elicitation Inference Spinner Banner */}
                {isEliciting && (
                  <div className="mt-3 p-3 rounded-panel bg-raised border border-info-strong/50 flex items-center justify-between text-xs text-info">
                    <div className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-info animate-spin flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <div>
                        <div className="font-semibold text-fg-strong text-xs">
                          {selectedOption ? "Calibrating requirement selection" : isSkipping ? "Applying architectural default" : "Processing specification"}
                        </div>
                        <div className="text-xs text-fg-muted font-mono">
                          Evaluating ISO/IEC 25010 metrics and synthesizing next question...
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded-control bg-selected text-info border border-info-strong/30 uppercase tracking-wider animate-pulse flex-shrink-0">
                      Inference Active
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Stopping Condition Notification & Generation Trigger */}
            {shouldStop && (
              <div className="bg-success/10 border border-success/40 rounded-panel p-4 text-center">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/20 text-success-fg text-xs font-mono font-semibold mb-2">
                  ✓ All Drivers Captured
                </div>
                <p className="text-xs text-fg-soft mb-3 leading-relaxed">
                  {stopReason || "Every architectural driver has an answer (100% coverage)."}
                </p>
                <div className="text-left mb-2">{juryToggle}</div>
                <button
                  onClick={handleGenerateArchitecture}
                  disabled={isGenerating}
                  className="w-full py-3 px-4 rounded-control bg-success hover:brightness-110 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isGenerating ? "Synthesizing Architecture..." : <><Glyph name="zap" /> Generate Formally Grounded Architecture (Phase B)</>}
                </button>
              </div>
            )}

            {/* Quick Load Pre-Generated Samples */}
            <div className="mt-auto pt-3 border-t border-line-strong/70">
              <span className="text-xs font-mono text-fg-subtle uppercase block mb-1.5">Load Pre-Generated Reference Graphs:</span>
              <div className="flex flex-wrap gap-2">
                {preGeneratedSamples.map(sample => (
                  <button
                    key={sample.id}
                    onClick={() => {
                      setGeneratedArch(sample.data);
                      setDiagramChanges(null);
                      setActiveOutputTab('diagram');
                    }}
                    className="px-2.5 py-1 rounded-control text-xs bg-overlay border border-line-strong text-fg-muted hover:text-info hover:border-info/40 transition-all font-mono cursor-pointer"
                  >
                    {sample.name} ({sample.nodes_count}n, {sample.edges_count}e)
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* ── RIGHT COLUMN: MULTI-VIEW ARCHITECTURE STUDIO (7 COLS) ──── */}
          <div className="lg:col-span-7 bg-canvas p-5 flex flex-col overflow-y-auto">
            
            {generatedArch ? (
              <div className="flex-1 flex flex-col gap-4">
                
                {/* Architecture Header Info Card */}
                <div className="bg-surface border border-line-strong rounded-panel p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-fg-strong">{generatedArch.project_name}</h2>
                      <span className="px-2 py-0.5 rounded-control text-xs font-mono bg-info/15 text-info border border-info/30 font-semibold">
                        {generatedArch.style}
                      </span>
                      {jury && (
                        <VerdictBadge verdict={jury.trace?.verdict} running={jury.running} onClick={() => setActiveOutputTab('jury')} />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-fg-subtle font-mono mt-1">
                      <span>Nodes: <strong className="text-fg-strong">{generatedArch.nodes.length}</strong></span>
                      <span>•</span>
                      <span>Edges: <strong className="text-fg-strong">{generatedArch.edges.length}</strong></span>
                      {report && (
                        <>
                          <span>•</span>
                          <span>Orphans: <strong className={report.orphan_nodes.length ? 'text-warning-fg' : 'text-success-fg'}>{report.orphan_nodes.length}</strong></span>
                          <span>•</span>
                          <span>Coverage: <strong className={report.requirement_coverage_pct >= 100 ? 'text-success-fg' : 'text-warning-fg'}>{Math.round(report.requirement_coverage_pct)}%</strong></span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSaveToWorkspace}
                      className="px-3 py-1.5 rounded-control bg-selected hover:bg-overlay text-xs font-mono text-fg-soft border border-line-strong transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Save to Workspace</span>
                    </button>
                    {onOpenInIDE && (
                      <button
                        onClick={() => onOpenInIDE()}
                        className="px-3 py-1.5 rounded-control bg-gradient-to-r from-info-strong to-accent-strong text-white text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <span>Open in IDE</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-Tabs Selector */}
                <div className="flex items-center border-b border-line-strong gap-2 pb-2">
                  {[
                    { id: 'diagram', label: 'Graph & Diagram' },
                    { id: 'components', label: `Components (${generatedArch.nodes.length})` },
                    { id: 'couplings', label: `Connections (${generatedArch.edges.length})` },
                    { id: 'atam_tradeoffs', label: 'ATAM Tradeoffs' },
                    { id: 'validation', label: 'Validation' },
                    ...(jury ? [{ id: 'jury', label: jury.running ? 'Review (in progress)'
                      : jury.error ? 'Review · error'
                      : `Review · ${({ PASS: 'approved', FAIL: 'open issues', NO_JURY: 'not reviewed', SKIPPED: 'skipped' } as Record<string, string>)[jury.trace?.verdict ?? ''] ?? '…'}` }] : []),
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveOutputTab(tab.id as typeof activeOutputTab)}
                      className={`px-3 py-1.5 rounded-control text-xs font-mono font-medium transition-all cursor-pointer ${
                        activeOutputTab === tab.id
                          ? 'bg-selected text-info font-semibold border border-info/40'
                          : 'text-fg-subtle hover:text-fg-soft'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* TAB 1: GRAPH & DIAGRAM VIEW */}
                {activeOutputTab === 'diagram' && jury && !jury.running && (
                  <JuryResultBanner state={jury} onOpen={() => setActiveOutputTab('jury')} />
                )}
                {activeOutputTab === 'diagram' && (
                  <ArchitectureDiagramViewer
                    projectName={generatedArch.project_name}
                    style={generatedArch.style}
                    nodes={generatedArch.nodes}
                    edges={generatedArch.edges}
                    plantuml={generatedArch.plantuml}
                    mermaid={generatedArch.mermaid}
                    changes={diagramChanges}
                  />
                )}

                {/* TAB 2: COMPONENT BREAKDOWN TABLE */}
                {activeOutputTab === 'components' && (
                  <div className="flex-1 bg-surface border border-line-strong rounded-panel overflow-hidden flex flex-col">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-surface text-fg-subtle font-mono uppercase text-xs border-b border-line-strong">
                          <tr>
                            <th className="p-3">Node ID</th>
                            <th className="p-3">Component Name</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Layer</th>
                            <th className="p-3">Traced Reqs</th>
                            <th className="p-3">KB Citations</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line-strong/60 font-mono">
                          {generatedArch.nodes.map(n => (
                            <tr key={n.node_id} className="hover:bg-raised/50">
                              <td className="p-3 font-bold text-info">{n.node_id}</td>
                              <td className="p-3 font-semibold text-fg-strong font-sans">{n.name}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded-control text-xs bg-selected text-fg-soft">
                                  {n.node_type}
                                </span>
                              </td>
                              <td className="p-3 text-fg-muted">{n.layer || '—'}</td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                  {Array.from(new Set(n.traced_requirements || [])).map((r, rIdx) => (
                                    <span key={`${n.node_id}-req-${r}-${rIdx}`} className="px-1.5 py-0.5 rounded-control text-xs bg-info-strong/15 text-info border border-info-strong/30">
                                      {r}
                                    </span>
                                  ))}
                                </div>

                              </td>
                              <td className="p-3 text-fg-subtle text-xs">
                                {n.kb_citations.join(", ") || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB 3: RELATIONAL COUPLINGS (EDGES) */}
                {activeOutputTab === 'couplings' && (
                  <div className="flex-1 bg-surface border border-line-strong rounded-panel overflow-hidden flex flex-col">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-surface text-fg-subtle font-mono uppercase text-xs border-b border-line-strong">
                          <tr>
                            <th className="p-3">Edge ID</th>
                            <th className="p-3">Path (Source → Target)</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Protocol</th>
                            <th className="p-3">Architectural Justification</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line-strong/60 font-mono">
                          {generatedArch.edges.map(e => (
                            <tr key={e.edge_id} className="hover:bg-raised/50">
                              <td className="p-3 font-bold text-info">{e.edge_id}</td>
                              <td className="p-3 text-fg-strong whitespace-nowrap">
                                <span className="text-info">{e.source}</span> → <span className="text-success-fg">{e.target}</span>
                              </td>
                              <td className="p-3">
                                <span className="px-1.5 py-0.5 rounded-control text-xs bg-selected text-warning">
                                  {e.edge_type}
                                </span>
                              </td>
                              <td className="p-3 text-fg-muted text-xs whitespace-nowrap">{e.protocol || '—'}</td>
                              <td className="p-3 text-fg-soft font-sans text-xs max-w-xs">{e.justification}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB 4: ATAM TRADEOFF MATRIX */}
                {activeOutputTab === 'atam_tradeoffs' && (
                  <AtamTradeoffMatrixView
                    tradeoffTableMarkdown={generatedArch.tradeoff_table}
                    projectName={generatedArch.project_name}
                    architectureStyle={generatedArch.style}
                  />
                )}


                {/* TAB 6: BIAS JURY (votes, findings, iteration timeline) */}
                {activeOutputTab === 'jury' && jury && (
                  <JuryPanel
                    state={jury}
                    onShowDiagram={() => setActiveOutputTab('diagram')}
                    onShowVersion={record => {
                      setGeneratedArch(prev => ({ ...(prev ?? {}), ...record.graph }));
                      setDiagramChanges(changesOf(record));
                      setActiveOutputTab('diagram');
                    }}
                  />
                )}

                {/* TAB 5: VALIDATION (real numbers from the edge/citation validator) */}
                {activeOutputTab === 'validation' && (
                  <div className="flex-1 bg-surface border border-line-strong rounded-panel p-5 overflow-y-auto font-mono text-xs">
                    {!report ? (
                      <div className="text-fg-muted font-sans">
                        No validation report for this graph (pre-generated samples and in-progress jury versions don&apos;t carry one). Generate an architecture to see real validation results.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                          {[
                            { label: 'Components', value: String(report.total_nodes), tone: 'text-fg-strong' },
                            { label: 'Connections kept', value: `${report.valid_edges_count} / ${report.total_edges}`, tone: report.rejected_edges_count ? 'text-warning-fg' : 'text-success-fg' },
                            { label: 'Orphan components', value: String(report.orphan_nodes.length), tone: report.orphan_nodes.length ? 'text-warning-fg' : 'text-success-fg' },
                            { label: 'Requirement coverage', value: `${Math.round(report.requirement_coverage_pct)}%`, tone: report.requirement_coverage_pct >= 100 ? 'text-success-fg' : 'text-warning-fg' },
                          ].map(card => (
                            <div key={card.label} className="bg-raised p-3 rounded-panel border border-line-strong">
                              <span className="text-fg-subtle text-xs block">{card.label}</span>
                              <span className={`text-base font-bold ${card.tone}`}>{card.value}</span>
                            </div>
                          ))}
                        </div>

                        <div className={`p-4 rounded-panel border mb-4 ${report.is_valid ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10'}`}>
                          <div className={`font-bold mb-1 ${report.is_valid ? 'text-success-fg' : 'text-warning-fg'}`}>
                            {report.is_valid ? '✓ Graph passed validation' : '✗ Graph has validation problems'}
                          </div>
                          <p className="text-fg-muted font-sans leading-relaxed">
                            Every connection must cite a requirement ID and join two existing components; uncited or dangling connections are rejected. Orphans are components with no connection at all.
                          </p>
                        </div>

                        {report.rejected_reasons.length > 0 && (
                          <div className="mb-4">
                            <div className="text-fg-subtle uppercase mb-1">Rejected connections ({report.rejected_edges_count})</div>
                            <ul className="space-y-0.5 text-fg-soft">{report.rejected_reasons.map((r, i) => <li key={i}>• {r}</li>)}</ul>
                          </div>
                        )}
                        {report.orphan_nodes.length > 0 && (
                          <div className="mb-4">
                            <div className="text-fg-subtle uppercase mb-1">Orphan components</div>
                            <div className="flex flex-wrap gap-1">{report.orphan_nodes.map(n => <span key={n} className="px-1.5 py-0.5 rounded-control border border-warning/40 text-warning-fg">{n}</span>)}</div>
                          </div>
                        )}
                        {report.uncovered_requirement_ids.length > 0 && (
                          <div>
                            <div className="text-fg-subtle uppercase mb-1">Requirements no component traces</div>
                            <div className="flex flex-wrap gap-1">{report.uncovered_requirement_ids.map(r => <span key={r} className="px-1.5 py-0.5 rounded-control border border-warning/40 text-warning-fg">{r}</span>)}</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

              </div>
            ) : jury ? (
              /* Jury in session before the first architecture version exists (checkpoint 1) */
              <JuryPanel state={jury} />
            ) : (
              /* Empty state before generation */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-line-strong rounded-panel">
                <div className="w-16 h-16 rounded-panel bg-raised border border-line-strong flex items-center justify-center mb-4 text-info">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-fg-strong mb-1">No Architecture Generated Yet</h3>
                <p className="text-xs text-fg-subtle max-w-md mb-4">
                  Select a template on the left and start interactive elicitation, or load one of our pre-generated reference models (FleetMonitor-IoT or ASPERA-3 APAF).
                </p>
                <div className="flex items-center gap-2">
                  {preGeneratedSamples.map(sample => (
                    <button
                      key={sample.id}
                      onClick={() => { setGeneratedArch(sample.data); setDiagramChanges(null); }}
                      className="px-3 py-1.5 rounded-control bg-selected hover:bg-overlay text-xs font-mono text-fg-soft border border-line-strong cursor-pointer"
                    >
                      Load {sample.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
}

export default ArcGenStudio;
