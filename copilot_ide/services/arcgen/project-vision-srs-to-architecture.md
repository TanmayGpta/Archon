# Project Vision: Requirement-Grounded Architecture Generation System

## 1. What I Want to Build

A system that takes either of two inputs:
- A proper SRS document, **or**
- A single vague, natural-language prompt with no formal requirements

...and produces a **grounded, traceable architecture document** as output.

If the input is insufficient (case 2, or an incomplete SRS), the system does not guess — it interactively questions the user until it has gathered the specific information needed to make sound architecture decisions, then generates the architecture.

**Explicitly out of scope for now:** checking whether an already-built codebase conforms to the generated architecture. That is a separate, later-stage problem (and overlaps with existing capstone work on architecture conformance checking) — deliberately deferred so this project can hyper-focus on generation quality first. conformance is already been worked on by my friend in a seperate folder

---

## 2. Why This, Not Just "Prompt an LLM With the SRS"

This isn't a novel problem space by default — it needed to be checked against existing literature before committing to a plan. What that check found:

- **Bare SRS → architecture generation is already a benchmarked, saturated task.** A 2026 benchmark (R2ABench) tested this exact task across frontier models and agent frameworks (MetaGPT, OpenHands, Mini-SWE). Result: component identification is decent, but **relation/dependency recovery is the industry-wide weak point** (Edge F1 never exceeded 0.18 across every model/framework tested), and the dominant semantic failures are **architecturally-significant-requirement (ASR) omission** and **weak traceability**. Structural quality and semantic quality don't even correlate with each other. A plain "SRS in, architecture out" wrapper has nothing new to say here — it's the exact thing just measured and found weak.
- **Interactive elicitation from vague prompts is a separate, also-unsolved problem.** LLMs don't proactively ask clarifying questions by default even when they internally register ambiguity (documented in "Knowing but Not Showing," and in the CLAMBER benchmark, which found models can't reliably assess their own knowledge boundaries). When systems are explicitly built to ask, they fail in measured ways: one 2026 study found some models over-clarify (38% of trials asked excessive questions) while others under-clarify (31% of trials missed needed information).
- **Existing multi-agent "interview" systems stop short.** REprompt and iReDev both use an Interviewer-style agent to gather requirements through dialogue — but neither produces an architecture document, and **neither has an actual computed stopping criterion.** Both fall back to a human clicking "confirm" to decide when enough information has been gathered. That's an open gap, not a solved problem to copy.

**The actual gap, stated precisely:** an elicitation front-end that targets architecturally-significant information specifically (not generic requirements completeness) with a real, computed stopping condition — feeding into an architecture generator that is grounded in cited, real architectural knowledge and explicitly enforces traceability and relation-recovery rigor. This combination does not appear to exist as a published system.

---

## 3. Two-Phase Scope

### Phase A — Requirement Elicitation ("grill until sufficient")
- Accepts either a full SRS or a single prompt.
- Detects missing information and asks targeted questions aimed specifically at **architecturally significant requirements** (scale, consistency needs, deployment target, team size, latency budget, cost constraints) — not generic product-manager-style questions.
- Needs an explicit, **measurable** stopping criterion (e.g., coverage of required ASR categories), not just a human "confirm" button — this is the most defensible original contribution, precisely because prior work hasn't solved it.
- Deliberately designed to avoid the two documented failure modes: asking too much (interrogation fatigue) and asking too little (architecting on missing constraints).

### Phase B — Architecture Generation (from a now-complete SRS)
1. **Normalize input into a fixed schema**: FRs, NFRs, technical constraints, domain rules, actors, data objects, external systems, and ASRs tagged as a distinct category.
2. **Output as a structured, parseable graph** (nodes = components, edges = directed dependency/data-flow relations) — not prose. This is required for any objective evaluation later, and matches how the current benchmark evaluates this task.
3. **Ground every pattern/technology choice in a small, curated, cited knowledge base** (ISO/IEC 25010 quality dimensions + architecture-specific dimensions like scale, consistency model, deployment target), rather than trusting the model's raw memory — this directly targets a documented failure mode where ungrounded generation invents unsupported infrastructure (e.g., adding Kafka/Redis/a service mesh with no justification).
4. **Match requirements to patterns via deterministic structured lookup**, not naive semantic/embedding search — encode both the extracted requirement profile and each KB pattern's tradeoff profile in the same fixed schema, and score with a weighted, auditable function. (Naive RAG has shown *mixed* effects on pattern adherence in prior studies — it's not a safe default.)
5. **Enforce citation discipline everywhere**: every generated node, edge, and pattern choice must trace to a specific requirement ID and/or KB source. Anything that can't be traced gets flagged, not silently kept.
6. **Dedicated reasoning + validation pass for relation/edge recovery specifically**, since it's the single worst-performing dimension in current benchmarks — paired with a validator that rejects uncited or unsupported edges and forces justification, not just a second free-form prompt.
7. **Output a tradeoff table for comparative decisions** (ADD/ATAM-style: candidate pattern × quality attribute × score × citation), instead of a single unexplained recommendation.

---

## 4. Evaluation Plan

- **Baseline first**: a direct single-prompt generator, before adding any multi-agent complexity — the current benchmark's best-performing configuration was direct prompting, which beat every agentic wrapper tested. Complexity must earn its place by beating this baseline on a specific, measured weakness.
- **Reference-free metrics** (usable immediately, no ground truth needed): syntax/parse validity, requirement coverage %, ASR coverage %, orphan-node ratio.
- **Small hand-authored reference set** (5–10 SRS docs with a manually designed architecture each) for structural comparison (node/edge matching against the current bottleneck metric).
- **Complexity gradient in the test set**: at least one simple CRUD-style system and one with real distributed-systems complexity — pattern adherence is documented to degrade specifically as complexity increases.
- **Real baseline comparison** (direct prompt + an adapted MetaGPT-style multi-agent pipeline) — a large share of prior work in this space is criticized for lacking any baseline at all.

---

## 5. What This Deliberately Does Not Try to Solve

- **Tacit/contextual architectural judgment** — high-stakes, ambiguous business tradeoffs remain a human architect's responsibility. This is stated explicitly even by the authors of the closest prior work (MAAD); no current system, including this one, should claim otherwise.
- **Conformance checking against a built codebase** — a separate, later-stage problem, intentionally out of scope here.
- **Full quantitative performance simulation** (e.g., Palladio-style modeling) — out of scope given project timeframe; the structured, cited tradeoff table is the lighter-weight substitute.

---

## 6. Key Sources Grounding This Plan

- **R2ABench** — *Benchmarking Requirement-to-Architecture Generation with Hybrid Evaluation* (2026): defines the task's current state of the art, edge/relation metric, and documented failure modes (edge recovery, ASR omission, traceability).
- **MAAD** — *Bridging Requirements and Architecture: Multi-Agent Orchestration with External Knowledge and Hierarchical Memory*: closest existing system; motivates RAG-grounding and documents the "tacit knowledge" boundary.
- **REprompt** (2026) and **iReDev** (2025): closest existing interview/elicitation-style multi-agent systems; both stop short of architecture generation and both rely on human confirmation rather than a computed stopping criterion.
- **Elicitron** (2024), **CLAMBER**, **AbstentionBench**, **"Knowing but Not Showing"**, and the 2026 clarifying-question failure-rate study: establish that proactive, well-calibrated clarifying-question generation is itself an open, measured problem.
- **ISO/IEC 25010** and the NFR-classification study (80.4% LLM/expert agreement on quality-attribute classification): basis for the fixed schema used in both requirement extraction and the pattern knowledge base, with an honest error margin.
- **Bass, Clements & Kazman** (*Software Architecture in Practice*), **Richards & Ford** (*Fundamentals of Software Architecture*), **microservices.io**: sourcing for the curated architecture-pattern knowledge base.
