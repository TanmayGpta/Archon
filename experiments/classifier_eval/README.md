# Classifier eval: should `classifier_agent.py` change?

Decides, with held-out evidence, whether a decision model (Kev / Laya) or richer input
beats the current Groq classifier. Nothing ships unless it passes the gate in `score.py`.

## Data
`mine.py` clones public Clean/Hexagonal/DDD Python repos (licensed, non-fork), labels each
file by its layer-named directory (`vocab.py`), then **masks every layer word** in paths and
import lines so a model must infer the layer from the code. Split is by repo (60/20/20);
the eval subset is ≤20 files per held-out repo. `test_codebases/ecommerce_platform` is always test.

## Candidates (same layer descriptions from `shared/fixtures/clean_architecture.json`)
| Input level | Contents |
|---|---|
| L0 | module path (what production sends) |
| L1 | + imports |
| L2 | + signatures / docstrings |
| L3 | + source (truncated) |

```bash
.venv/Scripts/python.exe -I mine.py                          # -> data/dataset.jsonl
.venv/Scripts/python.exe predict_simple.py                   # majority + import-rule floors
.venv/Scripts/python.exe predict_llm.py --mode prod          # baseline: real classify_modules, L0 (needs GROQ_API_KEY)
.venv/Scripts/python.exe predict_llm.py --mode rich --level L2
gpu/pod.sh push && gpu/pod.sh run 'bash experiments/classifier_eval/gpu/run_zeroshot.sh' && gpu/pod.sh pull
.venv/Scripts/python.exe score.py --baseline groq-prod-L0
```

## Gate
Repo-level paired bootstrap on macro-F1. A candidate **PASS**es only if the lower 95% bound
of its gain over the baseline exceeds `--min-gain` (default +0.03). Otherwise production stays as is.

## Zero-shot results (2026-10-27, 507 files / 27 held-out repos)
| Candidate | macro-F1 | Gain vs `groq-prod-L0` [95% CI] | Gate |
|---|---|---|---|
| Groq + imports (L1) | 0.772 | +0.094 [+0.039, +0.157] | PASS |
| Kev-9B, L3 | 0.762 | +0.084 [+0.018, +0.163] | fail (lower bound < +0.03) |
| Kev-9B, L2 | 0.743 | +0.064 [−0.004, +0.143] | fail |
| Kev-4B, L3 | 0.698 | +0.020 | fail |
| **Production: Groq, names only (L0)** | 0.678 | — | baseline |
| Best Laya (`laya-typed`, L3) | 0.411 | −0.267 | fail |
| Import-keyword rule | 0.392 | −0.286 | floor |

Every model gains from richer input; names-only input is the main bottleneck.

## Fine-tuned Kev-9B (2026-10-28)
Delta fine-tune from `jaredpalmer/kev-9b` at L3 (`gpu/run_finetune.sh`: 1 epoch, lr 2e-5, 4,695 train
files from 86 repos, ~85 min on the MIG slice). Config fixed before training; test scored once.

| Candidate | macro-F1 | Gain vs production [95% CI] | Gain vs Groq + imports [95% CI] |
|---|---|---|---|
| **Kev-9B fine-tuned, L3** | **0.817** [0.761, 0.869] | **+0.139 [+0.090, +0.190] PASS** | +0.045 [−0.007, +0.094] (not conclusive) |

Same recipe trained separately at each level (one model per level, scored once):

| Kev-9B fine-tuned on | macro-F1 | Gain vs production [95% CI] | Gate | Zero-shot, same level |
|---|---|---|---|---|
| L3 (+ source) | 0.817 | +0.139 [+0.090, +0.190] | PASS | 0.762 |
| L2 (+ signatures) | 0.787 | +0.109 [+0.063, +0.159] | PASS | 0.743 |
| L1 (+ imports) | 0.754 | +0.076 [+0.033, +0.120] | PASS | 0.648 |
| L0 (path only) | 0.671 | −0.007 [−0.045, +0.030] | fail | 0.547 |

Fine-tuning adds +0.05 to +0.12 at every level, but on names alone it only ties production. Input
matters more than the model. The L3 model run on L2 input scores the same as the L2 model (0.787), but
on L1 or L0 input it falls well behind the models trained at those levels (0.700 / 0.634).

Its confidence is usable for `unclassified_policy`: at confidence ≥ 0.8 it keeps 72% of modules at
92.1% accuracy (≥ 0.9: 63% at 94.4%). Checkpoints (LoRA + head, 193 MB each) saved to
`~/.cache/archon_clf/runs/archon-9b-L{0,1,2,3}`; serving it also needs `Qwen/Qwen3.5-9B-Base` and ~17 GB GPU.

## In production (2026-10-28)
Conformance can classify with the fine-tuned Kev-9B (`conformance/kev_classifier.py`): Studio's
*Classifier* picker, `archon check --provider kev-precise|kev-efficient`, or the Streamlit provider list.
One server (the L3 checkpoint) serves both modes: **precise** sends source (0.817), **token-efficient**
sends signatures only (0.787, same as the L2-trained model, ~¼ the tokens). If the server is down,
the audit falls back to Groq on names with `GROQ_API_KEY_2` (else `GROQ_API_KEY`).

**One click (Docker stack):** the `kev-agent` compose service (`copilot_ide/services/kev_agent`, profile
`gpu`) owns the pod, the model and the ssh tunnel; Conformance Studio's **GPU** button starts / stops it.
It needs `CLF_HOST=<user>@<head node>`, `KEV_SSH_DIR=<folder with id_ed25519 + known_hosts>` and
`COMPOSE_PROFILES=gpu` in `copilot_ide/.env`. It syncs `gpu/kev_serve.sh` + `gpu/pod.yaml` to the head node.

By hand, on the head node (checkpoints in `~/archon_clf/runs`, copied from `gpu/`):
```bash
bash ~/archon_clf/kev_serve.sh start L3     # pod + Kev on :8009 + port-forward (fresh pod downloads the 18 GB base)
bash ~/archon_clf/kev_serve.sh status       # pod=<phase> server=<ready|loading|stopped> forward=<up|down>
bash ~/archon_clf/kev_serve.sh stop
python3 ~/archon_clf/kev_classify.py <dir>   # classify a codebase right there
```
Without the agent: `ssh -N -L 8009:127.0.0.1:8009 <head node>`; Archon reads `KEV_URL` (default
`http://127.0.0.1:8009`, Docker `http://host.docker.internal:8009`). The pod still expires after 8 h.
`export_benchmark.py` regenerates the Evaluation dashboard's *Layer classifier* tab data.

## Why Laya was dropped (not fine-tuned)
1. **Zero-shot is at the floor.** Best variant 0.411, level with the import-keyword rule (0.392);
   `laya` 0.324, `laya-ml8k` 0.271. Its model card calls base zero-shot "near chance", and it is.
   A fine-tune would have to climb past 0.772 (Groq + imports) to matter, versus Kev-9B starting at 0.762.
2. **Context too short for the inputs that help.** `laya` reads 512 tokens and `laya-typed` 1,024,
   so most L3 source is truncated. Only `laya-multilingual` takes 8k, and it scored worst.
3. **No training CLI.** Fine-tuning ships only as a Kaggle notebook, so it would need a hand-written
   training script (~1 h) before any GPU time. Kev has `kev.train` with a documented delta recipe.
4. **One GPU slice.** The quota is a single MIG 2g.35gb, and Kev-9B was the better use of it.

**What would reopen it:** Laya is the only candidate that would run on a laptop GPU (421M params,
17–90 ms/file), and its own typed-decisions fine-tune went 0.36 → 0.77 on its benchmark. If local,
offline classification becomes a requirement, fine-tune `laya-typed` at L2 (signatures fit its
1,024-token window) and score it once against the same gate.

## Cluster
`gpu/pod.yaml` holds the account's one MIG 2g.35gb slice (H200, 35 GB) and self-deletes after 8h.
Kev-27B (~66 GB) does not fit; Kev-4B/9B and all Laya variants do.
