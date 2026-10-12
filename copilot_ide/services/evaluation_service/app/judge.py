import json
import httpx
from typing import List, Tuple
from .config import OLLAMA_URL, JUDGE_MODEL

def score_correctness(
    question: str,
    llm_response: str,
    expected_keywords: List[str],
    scoring_mode: str = "keyword",
    judge_model: str = JUDGE_MODEL,
    current_model: str = ""
) -> Tuple[float, str]:
    """
    Computes correctness score (0.0 to 1.0) and records method used.
    """
    if scoring_mode == "llm":
        try:
            judge_prompt = f"""You are a strict factual and logical evaluator.
A developer asked:
QUESTION: {question}

A model responded:
ANSWER: {llm_response}

Expected key facts that MUST appear in a correct answer:
{json.dumps(expected_keywords)}

You must evaluate if the answer contains these expected key facts AND if it contains any hallucinated, irrelevant, or factually incorrect information.
Follow this Chain of Thought reasoning process:
1. Identify if all expected key facts are present in the model's response.
2. Identify if there are any hallucinated parameters, incorrect endpoints, or unsupported external knowledge used in the answer.
3. Based on the above, score the answer from 0.0 to 1.0:
   - 1.0 = All key facts present, no hallucinated/false information.
   - 0.5 = Partially correct, some key facts present, or minor hallucinated details.
   - 0.0 = Missing all key facts, entirely hallucinated, or factually wrong.

Reply ONLY with valid JSON in this exact format: {{"reason": "<step-by-step CoT reasoning>", "score": <float 0.0-1.0>}}"""

            with httpx.Client(timeout=45.0) as client:
                resp = client.post(
                    f"{OLLAMA_URL}/api/generate",
                    json={
                        "model": "qwen2.5:7b",
                        "prompt": judge_prompt,
                        "stream": False,
                        "format": "json",
                        "options": {
                            "temperature": 0.1
                        }
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    res_text = data.get("response", "").strip()
                    if res_text.startswith("```json"):
                        res_text = res_text[7:]
                    if res_text.startswith("```"):
                        res_text = res_text[3:]
                    if res_text.endswith("```"):
                        res_text = res_text[:-3]
                    parsed = json.loads(res_text.strip())
                    score = float(parsed.get("score", 0.0))
                    score = max(0.0, min(1.0, score))
                    return round(score, 4), "llm"
                else:
                    print(f"Judge Ollama Error: {resp.status_code} {resp.text}")
                    return _keyword_score(llm_response, expected_keywords), "keyword_fallback"
        except Exception as e:
            print(f"Judge: LLM evaluation error: {e}. Falling back to keyword scoring.")
            return _keyword_score(llm_response, expected_keywords), "keyword_fallback"

    return _keyword_score(llm_response, expected_keywords), "keyword"

def _keyword_score(llm_response: str, expected_keywords: List[str]) -> float:
    if not expected_keywords:
        return 1.0
    if not llm_response:
        return 0.0

    resp_lower = llm_response.lower()
    matched = sum(1 for kw in expected_keywords if kw.lower() in resp_lower)
    return round(matched / len(expected_keywords), 4)
