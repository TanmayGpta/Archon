"use client";
import React, { useMemo, useState } from 'react';
import data from './classifierBenchmarkData.json';

// Layer-classifier benchmark (experiments/classifier_eval, regenerate with export_benchmark.py).
// One sequential hue encodes magnitude; family is a text label, never a colour.

type Metric = 'f1' | 'precision' | 'recall';
interface LayerScore { precision: number; recall: number; f1: number; support: number }
interface Candidate {
  id: string; label: string; family: string; level: string; input: string; fineTuned: boolean; note: string;
  macroF1: number; ci: number[]; accuracy: number; perLayer: Record<string, LayerScore>;
  tokensPerFile: number; msPerFile: number | null;
  gain?: number; gainCi?: number[]; passes?: boolean;
}

const META = data.meta;
const CANDIDATES = data.candidates as Candidate[];
const FAMILIES = ['All', 'Kev', 'Groq', 'Laya', 'Floor'];
const HUE = '56, 189, 248';   // info blue, one hue for all magnitudes

const cellBg = (v: number) => ({ backgroundColor: `rgba(${HUE}, ${(0.06 + 0.42 * Math.max(0, v)).toFixed(3)})` });
const fmt = (v: number) => v.toFixed(3);
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}`;

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-panel bg-surface border border-line-strong p-5">
      <div className="text-xs font-mono text-fg-subtle uppercase tracking-wide">{label}</div>
      <div className="text-3xl font-bold text-fg-strong font-mono my-2">{value}</div>
      <div className="text-xs font-mono text-fg-muted">{sub}</div>
    </div>
  );
}

export function ClassifierBenchmarkTab() {
  const [family, setFamily] = useState('All');
  const [metric, setMetric] = useState<Metric>('f1');
  const [selectedId, setSelectedId] = useState('kev-9b-ft-L3');

  const rows = useMemo(
    () => CANDIDATES.filter(c => family === 'All' || c.family === family).sort((a, b) => b.macroF1 - a.macroF1),
    [family]
  );
  const selected = CANDIDATES.find(c => c.id === selectedId) || CANDIDATES[0];
  const best = (fam: string) => CANDIDATES.filter(c => c.family === fam).sort((a, b) => b.macroF1 - a.macroF1)[0];
  const precise = CANDIDATES.find(c => c.id === 'kev-9b-ft-L3')!;
  const efficient = CANDIDATES.find(c => c.id === 'kev-9b-ftL3-L2')!;
  const groq = best('Groq');
  const laya = best('Laya');
  const baseline = CANDIDATES.find(c => c.id === META.baseline)!;

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <div className="rounded-panel bg-gradient-to-br from-raised via-surface to-canvas border border-line-strong p-6 md:p-8 space-y-3">
        <span className="px-2.5 py-0.5 rounded-full bg-info-strong/20 border border-info-strong/40 text-info text-xs font-mono font-bold tracking-wide">
          CONFORMANCE · LAYER CLASSIFIER
        </span>
        <h1 className="text-2xl md:text-3xl font-bold text-fg-strong tracking-tight">Kev vs Groq vs Laya</h1>
        <p className="text-sm md:text-base text-fg-muted leading-relaxed max-w-4xl">
          Which model should decide a module&apos;s architectural layer? {META.evalFiles} files from {META.testRepos} held-out
          GitHub repos, labelled by their layer-named folders, with every layer word masked so the model has to read the
          code. Kev was fine-tuned on {META.trainFiles.toLocaleString()} files from {META.trainRepos} other repos. A candidate
          passes only if the lower 95% bound of its macro-F1 gain over production ({baseline.label}) exceeds +{META.minGain}.
        </p>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Kev-9B · precise" value={fmt(precise.macroF1)} sub={`macro-F1 · ~${precise.tokensPerFile} tokens/file · ${precise.msPerFile} ms`} />
        <Tile label="Kev-9B · token-efficient" value={fmt(efficient.macroF1)} sub={`macro-F1 · ~${efficient.tokensPerFile} tokens/file · ${efficient.msPerFile} ms`} />
        <Tile label="Best Groq" value={fmt(groq.macroF1)} sub={`${groq.label} (${groq.input})`} />
        <Tile label="Best Laya" value={fmt(laya.macroF1)} sub={`${laya.label} (${laya.input})`} />
      </div>

      {/* Filters: one row above both tables */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-fg-subtle">Family</span>
          {FAMILIES.map(f => (
            <button key={f} onClick={() => setFamily(f)}
              className={`px-3 py-1 rounded-control text-xs font-mono border cursor-pointer ${family === f ? 'bg-selected text-accent-fg border-accent/40 font-bold' : 'bg-raised text-fg-muted border-line hover:text-fg-soft'}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-fg-subtle">Per-layer metric</span>
          {(['f1', 'precision', 'recall'] as Metric[]).map(m => (
            <button key={m} onClick={() => setMetric(m)}
              className={`px-3 py-1 rounded-control text-xs font-mono border cursor-pointer ${metric === m ? 'bg-selected text-accent-fg border-accent/40 font-bold' : 'bg-raised text-fg-muted border-line hover:text-fg-soft'}`}>
              {m === 'f1' ? 'F1' : m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Leaderboard + per-layer heat table */}
      <div className="rounded-panel bg-surface border border-line-strong overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead className="text-fg-subtle">
            <tr className="border-b border-line">
              <th className="text-left p-3">Candidate</th>
              <th className="text-left p-3">Input</th>
              <th className="text-left p-3 min-w-[200px]">Macro-F1 [95% CI]</th>
              <th className="text-left p-3">Gain vs production [95% CI]</th>
              <th className="text-left p-3">Gate</th>
              {META.layers.map(l => (
                <th key={l} className="text-right p-3" title={`${l}: ${META.support[l as keyof typeof META.support]} files`}>
                  {l.slice(0, 5)} {metric === 'f1' ? 'F1' : metric === 'precision' ? 'P' : 'R'}
                </th>
              ))}
              <th className="text-right p-3">Acc</th>
              <th className="text-right p-3">Tokens/file</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id} onClick={() => setSelectedId(c.id)}
                className={`border-b border-line/60 cursor-pointer ${c.id === selectedId ? 'bg-selected' : 'hover:bg-raised'}`}>
                <td className="p-3">
                  <div className="text-fg-strong font-bold">{c.label}</div>
                  <div className="text-fg-subtle">{c.family}{c.fineTuned ? ' · fine-tuned' : ''}{c.note ? ` · ${c.note}` : ''}</div>
                </td>
                <td className="p-3 text-fg-muted whitespace-nowrap">{c.level} {c.input}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2" title={`macro-F1 ${fmt(c.macroF1)}, 95% CI ${fmt(c.ci[0])} to ${fmt(c.ci[1])}`}>
                    <span className="text-fg-strong w-11">{fmt(c.macroF1)}</span>
                    {/* bar from 0, CI as a thin whisker */}
                    <div className="relative flex-1 h-3">
                      <div className="absolute inset-y-0 left-0 rounded-r" style={{ width: `${c.macroF1 * 100}%`, backgroundColor: `rgba(${HUE}, 0.55)` }} />
                      <div className="absolute top-1/2 h-px bg-fg-soft" style={{ left: `${c.ci[0] * 100}%`, width: `${(c.ci[1] - c.ci[0]) * 100}%` }} />
                    </div>
                  </div>
                </td>
                <td className="p-3 whitespace-nowrap text-fg-soft">
                  {c.gain !== undefined ? `${signed(c.gain)} [${signed(c.gainCi![0])}, ${signed(c.gainCi![1])}]` : 'baseline'}
                </td>
                <td className="p-3 whitespace-nowrap">
                  {c.passes === undefined ? <span className="text-fg-subtle">—</span> : c.passes ? (
                    <span className="px-2 py-0.5 rounded-control font-bold bg-success/15 text-success border border-success/30">✓ PASS</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-control font-bold bg-danger/15 text-danger border border-danger/30">✗ FAIL</span>
                  )}
                </td>
                {META.layers.map(l => {
                  const s = c.perLayer[l];
                  return (
                    <td key={l} className="p-3 text-right text-fg-strong" style={cellBg(s[metric])}
                      title={`${l} · precision ${fmt(s.precision)} · recall ${fmt(s.recall)} · F1 ${fmt(s.f1)} · ${s.support} files`}>
                      {fmt(s[metric])}
                    </td>
                  );
                })}
                <td className="p-3 text-right text-fg-soft">{fmt(c.accuracy)}</td>
                <td className="p-3 text-right text-fg-soft">{c.tokensPerFile || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected candidate: precision, recall and F1 side by side */}
      <div className="rounded-panel bg-surface border border-line-strong p-5 space-y-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-bold text-fg-strong">{selected.label}</h2>
          <span className="text-xs font-mono text-fg-muted">{selected.level} {selected.input} · macro-F1 {fmt(selected.macroF1)} · accuracy {fmt(selected.accuracy)}{selected.msPerFile ? ` · ${selected.msPerFile} ms/file on the GPU slice` : ''}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {META.layers.map(l => {
            const s = selected.perLayer[l];
            return (
              <div key={l} className="rounded-panel bg-raised border border-line p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-fg-strong font-bold">{l}</span>
                  <span className="text-fg-subtle">{s.support} files</span>
                </div>
                {(['precision', 'recall', 'f1'] as Metric[]).map(m => (
                  <div key={m} className="flex items-center gap-2 text-xs font-mono" title={`${l} ${m} ${fmt(s[m])}`}>
                    <span className="w-16 text-fg-muted">{m === 'f1' ? 'F1' : m[0].toUpperCase() + m.slice(1)}</span>
                    <div className="relative flex-1 h-2.5 rounded bg-line/40">
                      <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${s[m] * 100}%`, backgroundColor: `rgba(${HUE}, ${m === 'f1' ? 0.8 : 0.5})` }} />
                    </div>
                    <span className="w-11 text-right text-fg-strong">{fmt(s[m])}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <p className="text-xs font-mono text-fg-subtle leading-relaxed">
          Precision: of the files the model put in this layer, the share that belong there. Recall: of the files that belong
          in this layer, the share it found. F1 is their harmonic mean; macro-F1 averages the four layers equally.
        </p>
      </div>
    </div>
  );
}
