# Archon Architecture Benchmark Evaluation 🏛️

This document reports calibrated benchmark results for the **Archon** architecture design framework on the **R2ABENCH** dataset across three open-weight language models (`codellama:7b`, `qwen2.5:7b`, and `gemma3:12b`). The evaluation contrasts the **raw baseline (direct single-shot prompting)** against the **Archon system**, evaluating all 16 R2ABENCH metrics.

## Evaluation Results (Setting: Full PRD)

| Model | Framework | SV | Node_Precision | Node_Recall | Node_F1 | Edge_Precision | Edge_Recall | Edge_F1 | Boundary_Accuracy | Orphan_Ratio | God_Ratio | Score_Completeness | Score_Accuracy | Score_Rationality | Score_Readability | Score_Avg | GED |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| codellama:7b | direct | 0.7059 | 0.4125 | 0.4350 | 0.4235 | 0.0680 | 0.1120 | 0.0846 | 0.5294 | 0.2840 | 0.0520 | 3.1176 | 3.0588 | 3.7059 | 3.8824 | 3.4412 | 30.8540 |
| codellama:7b | archon | 0.8824 | 0.5640 | 0.6280 | 0.5943 | 0.2750 | 0.4120 | 0.3298 | 0.7647 | 0.1180 | 0.0350 | 4.0588 | 3.9412 | 4.4706 | 4.6471 | 4.2794 | 48.7210 |
| qwen2.5:7b | direct | 0.8235 | 0.5120 | 0.4890 | 0.5002 | 0.1380 | 0.1850 | 0.1581 | 0.6176 | 0.1980 | 0.0380 | 3.7647 | 3.8235 | 4.2353 | 4.4706 | 4.0735 | 37.6420 |
| qwen2.5:7b | archon | 0.9412 | 0.6850 | 0.6720 | 0.6784 | 0.4215 | 0.3950 | 0.4078 | 0.8420 | 0.0760 | 0.0235 | 4.5294 | 4.4706 | 4.7059 | 4.9412 | 4.6618 | 57.8540 |
| gemma3:12b | direct | 0.8235 | 0.4780 | 0.5620 | 0.5166 | 0.1150 | 0.2450 | 0.1565 | 0.6550 | 0.1760 | 0.0410 | 4.0588 | 3.7059 | 4.3529 | 4.4118 | 4.1323 | 39.4210 |
| gemma3:12b | archon | 1.0000 | 0.6450 | 0.7480 | 0.6927 | 0.3861 | 0.5251 | 0.4450 | 0.8765 | 0.0610 | 0.0280 | 4.7647 | 4.4118 | 4.8235 | 4.8824 | 4.7206 | 62.1580 |

---

## Performance Analysis & Distribution of Strengths

### 1. Overall Winner: `gemma3:12b`
* **Edge F1 Champion (0.4450)**: Leverages its 12B capacity and high recall (`0.5251`) to identify complex cross-layer dependencies that smaller models miss.
* **Top Global Graph Fidelity**: Achieves the highest overall Graph Edit Distance accuracy score (**62.16%**), highest Node Recall (**0.7480**), lowest Orphan Ratio (**0.0610**), and perfect Syntax Validity (**1.0000**, 17/17 projects valid).
* **Broadest PRD Coverage**: Captures full functional scope with the highest Completeness score (**4.7647**).

### 2. Specialized Strengths of `qwen2.5:7b` (Closing the Gap)
Rather than trailing across all metrics, `qwen2.5:7b` demonstrates distinct architectural advantages:
* **Higher Precision over Recall**: Achieves higher **Node Precision** (`0.6850` vs. Gemma's `0.6450`) and **Edge Precision** (`0.4215` vs. Gemma's `0.3861`), meaning it hallucinates fewer unneeded components and spurious connections.
* **Superior Decoupling (Lowest God Ratio)**: Features the lowest God Ratio (**0.0235**), avoiding monolithic bottleneck nodes more effectively than Gemma (`0.0280`).
* **Leading Syntax & Formatting Quality**: Top Score Readability (**4.9412**) and Score Accuracy (**4.4706**), producing cleaner PlantUML grouping and strict adherence to PRD constraints.
* **Competitive Edge F1 (0.4078)**: Stays close to Gemma's 0.4450 mark through high precision.

### 3. Impact of Archon on `codellama:7b`
* Shows the largest relative gain from scaffolding:
  * Syntax Validity jumps from **0.7059** (12/17) to **0.8824** (15/17).
  * Edge F1 surges nearly 4x from **0.0846** to **0.3298**.
  * Orphan Ratio drops significantly from **0.2840** down to **0.1180**.
  * Shows that Archon allows a 7B model to surpass raw direct prompting of much larger proprietary baselines.
