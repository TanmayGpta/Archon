# ArcGen: Why We Chose This Approach (In Plain English)

This document explains the core decisions behind the architecture of **ArcGen** without academic jargon.

---

## 1. Why NOT Traditional "Vector RAG" (No Vector DB / Embeddings)?

In a normal RAG setup:
1. You split text into chunks and convert them into vectors (numbers).
2. When a user asks a question, you find chunks with "similar meanings" using cosine similarity.

### Why that breaks down for software architecture:
* **Vector similarity doesn't understand hard constraints:**
  * If your requirement says: *"Must maintain strict ACID transactions with zero eventual consistency lag"*, a vector search might see the words "transactions" and "high scale" and retrieve an **Event-Driven Broker** pattern.
  * In architecture, that is disastrous. An event-driven broker fundamentally contradicts strict immediate ACID consistency across services.
* **Vector RAG causes "Tech Hallucinations":**
  * Models often add Redis, Kafka, or Kubernetes just because those words appear often in the vector database, not because the requirements actually justify them.

### What we do instead: Deterministic Structured Catalog
* We store architecture patterns (e.g., Microservices, Modular Monolith, Event-Driven) as **structured JSON files**.
* Each pattern has:
  * **Anti-requisites (Hard Deal-breakers):** e.g., *"If strong ACID consistency is required, REJECT this pattern."*
  * **Tradeoff Ratings:** e.g., Latency (+1), Throughput (+2), Cost (-2).
* **Pure Python math** scores the patterns against the requirements. No vector fuzziness, 100% predictable, and 100% explainable.

---

## 2. Why Build Phase B (Generation) Before Phase A (Elicitation)?

* **Phase A** is the "Interviewer" (asks clarifying questions if the prompt is vague).
* **Phase B** is the "Architect" (takes complete requirements and builds the diagram).

If we built the Interviewer first:
* We wouldn't be able to verify whether the questions it asks actually produce a working, high-quality architecture.
* We would have no end-to-end output to inspect.

By building the **Architect (Phase B)** first:
* We already have **10 real-world, complete SRS documents** in the repo (under `generation/obselete/MAAD/Requirements dataset/`, like `C2C.txt`).
* We can immediately run, test, and score Phase B from day one.
* Once Phase B is rock-solid, Phase A simply plugs into the front to feed it.

---

## 3. Why Two Separate Passes for Nodes and Edges?

In 2026, researchers published **R2ABench**, testing frontier LLMs on generating architectures from requirements:
* **Components (Nodes):** LLMs scored ~0.65–0.75 F1 score (pretty good).
* **Relations/Dependencies (Edges):** LLMs scored **under 0.18 F1 score** across every single model tested.

When asked to generate the whole system at once, models guess connections wildly or forget dependencies entirely.

### Our Solution:
1. **Pass 1 (Nodes):** Identify services and datastores based on the selected architectural style.
2. **Pass 2 (Edges + Validator):** Dedicated only to finding data flows and connections. Every single edge is forced to answer:
   * *Which requirement ID demands this connection?*
   * *What protocol is used (REST, gRPC, Pub/Sub)?*
   * If an edge has no requirement citation, the validator **rejects it**.

---

## Summary of the Whole System

```
[SRS Requirements]
       │
       ▼
[1. Deterministic Matcher] ──> Math filters out bad patterns and scores the best fit.
       │
       ▼
[2. Pass 1: Node Generator] ──> Creates components with requirement IDs.
       │
       ▼
[3. Pass 2: Edge Generator] ──> Connects components with citations and data flows.
       │
       ▼
[4. Citation Validator] ──> Rejects any uncited components or hallucinated links.
       │
       ▼
[Output: Graph + Tradeoff Table]
```
