import re
from typing import List, Dict, Any, Tuple, Optional, Set

STOP_WORDS: Set[str] = {
    "the", "a", "an", "is", "in", "of", "to", "and", "or", "for", "with",
    "that", "this", "it", "be", "by", "on", "at", "as", "from", "are", "was",
    "were", "will", "would", "can", "could", "should", "if", "then", "else",
    "when", "where", "which", "who", "whom", "what", "how", "why", "into"
}

def compute_relevance(context_text: str, llm_response: str) -> float:
    """Calculates Jaccard vocabulary similarity between context and response."""
    if not context_text or not llm_response:
        return 0.0

    ctx_tokens = set(re.findall(r'\b[a-zA-Z0-9_\-]+\b', context_text.lower())) - STOP_WORDS
    resp_tokens = set(re.findall(r'\b[a-zA-Z0-9_\-]+\b', llm_response.lower())) - STOP_WORDS

    union = ctx_tokens | resp_tokens
    if not union:
        return 0.0

    intersection = ctx_tokens & resp_tokens
    return round(len(intersection) / len(union), 4)

def classify_retrieval(ce_results: List[Dict[str, Any]], expected_sources: List[str]) -> str:
    """
    Categorical classification of retrieval quality:
    - "decoy_surfaced": billing_glossary.md in top-3 CE when not expected
    - "correct": all expected_sources found in retrieved CE sources (top-5)
    - "partial": at least one but not all expected_sources found
    - "wrong": none of expected_sources found
    """
    top3_sources = {r.get("source", "") for r in ce_results[:3] if r.get("source")}
    retrieved_sources = {r.get("source", "") for r in ce_results if r.get("source")}
    expected_set = set(expected_sources)

    # Decoy check
    if "billing_glossary.md" in top3_sources and "billing_glossary.md" not in expected_set:
        return "decoy_surfaced"

    if not expected_set:
        return "correct"

    if expected_set.issubset(retrieved_sources):
        return "correct"

    if any(s in retrieved_sources for s in expected_set):
        return "partial"

    return "wrong"

def _normalize_endpoint(ep: str) -> str:
    # Replace {param_name} with {*} or normalize
    ep_clean = ep.strip()
    return re.sub(r'\{[^}]+\}', '{*}', ep_clean)

def detect_hallucination(llm_response: str, corpus_endpoints: frozenset) -> Tuple[int, str]:
    """
    Detects if the LLM asserts an HTTP endpoint that does not exist in the corpus.
    Returns (1, explanation) if hallucination detected, otherwise (0, notes).
    """
    if not corpus_endpoints:
        return 0, "No corpus endpoints loaded for verification"

    matches = re.findall(r'\b(GET|POST|PUT|DELETE|PATCH)\s+([/\w{}\-_]+)', llm_response)
    if not matches:
        return 0, "No HTTP endpoints found in response"

    normalized_corpus = {_normalize_endpoint(ep).lower() for ep in corpus_endpoints}
    corpus_lower = {ep.lower() for ep in corpus_endpoints}

    unrecognized = []
    for method, path in matches:
        full_ep = f"{method} {path}".strip()
        norm_ep = _normalize_endpoint(full_ep).lower()

        # Direct match or normalized match
        if full_ep.lower() in corpus_lower or norm_ep in normalized_corpus:
            continue

        # Check path parameter wildcard match
        matched_any = False
        path_parts = path.strip("/").split("/")
        for c_ep in corpus_endpoints:
            c_parts = c_ep.split(" ", 1)
            if len(c_parts) == 2 and c_parts[0].upper() == method.upper():
                c_path_parts = c_parts[1].strip("/").split("/")
                if len(c_path_parts) == len(path_parts):
                    match_seg = True
                    for cp, pp in zip(c_path_parts, path_parts):
                        if cp.startswith("{") and cp.endswith("}"):
                            continue
                        if cp.lower() != pp.lower():
                            match_seg = False
                            break
                    if match_seg:
                        matched_any = True
                        break
        if not matched_any:
            unrecognized.append(full_ep)

    if unrecognized:
        return 1, f"Unrecognized endpoint(s): {', '.join(unrecognized[:3])}"

    return 0, "All cited endpoints match corpus"

def test_code(llm_response: str, question_id: str) -> Tuple[int, str]:
    """
    Checks python syntax and semantic requirements for Q24, Q25, Q26.
    """
    blocks = re.findall(r'```python\s*(.*?)\s*```', llm_response, re.DOTALL)
    if not blocks:
        blocks = re.findall(r'```\s*(.*?)\s*```', llm_response, re.DOTALL)

    if not blocks:
        return 0, "No code block found in response"

    code_str = blocks[0].strip()

    # Syntax check
    try:
        compile(code_str, "<string>", "exec")
    except Exception as e:
        return 0, f"Python syntax compilation failed: {e}"

    code_lower = code_str.lower()

    if question_id == "Q24":
        if "requests.post" not in code_lower and "post" not in code_lower:
            return 0, "Code missing POST request call"
        if "order" not in code_lower and "customer_id" not in code_lower:
            return 0, "Code missing order body fields"

    elif question_id == "Q25":
        if "charge_id" not in code_lower:
            return 0, "Code missing charge_id bridging logic"
        if "refund" not in code_lower:
            return 0, "Code missing refund logic"

    elif question_id == "Q26":
        if "assert" not in code_lower and "unittest" not in code_lower and "pytest" not in code_lower:
            return 0, "Code missing unit test assertions"
        if "channels_notified" not in code_lower:
            return 0, "Code missing channels_notified assertion"

    return 1, "Code passed syntax compilation and semantic checks"

def aggregate_samples(samples: List[Dict[str, Any]]) -> Tuple[
    Optional[float], Optional[float], Optional[float], Optional[float],
    Optional[float], Optional[float], Optional[float], Optional[float]
]:
    """Computes avg and peak metrics from resource sample list."""
    if not samples:
        return None, None, None, None, None, None, None, None

    cpu_vals = [s["cpu_percent"] for s in samples if s.get("cpu_percent") is not None]
    ram_vals = [s["ram_mb"] for s in samples if s.get("ram_mb") is not None]
    gpu_vals = [s["gpu_util"] for s in samples if s.get("gpu_util") is not None]
    gmem_vals = [s["gpu_mem_mb"] for s in samples if s.get("gpu_mem_mb") is not None]

    avg_cpu = round(sum(cpu_vals) / len(cpu_vals), 2) if cpu_vals else None
    peak_cpu = round(max(cpu_vals), 2) if cpu_vals else None

    avg_ram = round(sum(ram_vals) / len(ram_vals), 2) if ram_vals else None
    peak_ram = round(max(ram_vals), 2) if ram_vals else None

    avg_gpu = round(sum(gpu_vals) / len(gpu_vals), 2) if gpu_vals else None
    peak_gpu = round(max(gpu_vals), 2) if gpu_vals else None

    avg_gmem = round(sum(gmem_vals) / len(gmem_vals), 2) if gmem_vals else None
    peak_gmem = round(max(gmem_vals), 2) if gmem_vals else None

    return avg_cpu, peak_cpu, avg_ram, peak_ram, avg_gpu, peak_gpu, avg_gmem, peak_gmem

def classify_retrieval_outcome(
    ce_results: List[Dict[str, Any]],
    expected_sources: List[str],
    hallucination_flag: int
) -> str:
    """Classifies outcome for Ex 5: relevant | irrelevant | missed | hallucinated."""
    if hallucination_flag == 1:
        return "hallucinated"

    retrieved_sources = {r.get("source", "") for r in ce_results if r.get("source")}
    expected_set = set(expected_sources)

    if not expected_set:
        return "relevant"

    if expected_set.issubset(retrieved_sources) or any(s in retrieved_sources for s in expected_set):
        return "relevant"

    if not retrieved_sources:
        return "missed"

    return "irrelevant"

def check_multihop(
    ce_results: List[Dict[str, Any]],
    expected_sources: List[str]
) -> Tuple[List[str], int]:
    """Checks multi-hop chain completeness for Ex 6."""
    retrieved_sources = {r.get("source", "") for r in ce_results if r.get("source")}
    found = [s for s in expected_sources if s in retrieved_sources]
    complete = 1 if len(found) == len(expected_sources) and len(expected_sources) > 0 else 0
    return found, complete
