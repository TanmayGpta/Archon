"""Turns raw juror output into verdicts and combines them. Plain Python, no LLM.

Rules (agreed design):
- A juror answers yes/no per rubric item. A 'no' counts only if it cites at least one ID that
  exists in that juror's case; uncited or invented citations cannot fail an item.
- A 'no' must also be specific: citing more than half of everything citable (and more than two
  IDs) is a shotgun answer, not evidence, so it does not count either.
- An item fails when its counted 'no' votes are a strict majority of the jurors who voted.
- A checkpoint passes when no item fails. Failing items route the work back (rubric 'route').
"""

from collections import Counter
import re
from typing import List, Optional

from app.jury.case import Case, raw_lines
from app.jury.models import (
    Checkpoint,
    CheckpointName,
    CheckpointResult,
    ItemAnswer,
    ItemTally,
    JurorSpec,
    JurorVerdict,
)
from app.llm import clean_thinking, safe_parse_json

ROUTE_ORDER = ["normalize", "pattern", "nodes", "edges"]
_YES = {"yes", "y", "true", "pass", "passed", "ok", "correct", "passedcheck"}
_NO = {"no", "n", "false", "fail", "failed", "incorrect", "problem", "issue", "failedcheck"}


def _as_bool(v) -> Optional[bool]:
    if isinstance(v, bool):
        return v
    s = re.sub(r"[^a-z]", "", str(v or "").lower())
    if s in _YES:
        return True
    if s in _NO:
        return False
    return None


def _as_list(v) -> List[str]:
    if v is None:
        return []
    if isinstance(v, str):
        return [p.strip() for p in v.replace(";", ",").split(",") if p.strip()]
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return [str(v)]


def parse_verdict(
    raw: str, checkpoint: Checkpoint, case: Case, seat: str, spec: JurorSpec, seconds: float = 0.0
) -> JurorVerdict:
    """Parses one juror's JSON or formatted answer. Anything unusable becomes ok=False (the juror abstains)."""
    base = dict(juror=seat, model=spec.model, family=spec.family, seconds=round(seconds, 1))
    cleaned_raw = clean_thinking(raw or "").strip()
    data = None
    try:
        data = safe_parse_json(cleaned_raw)
    except Exception:
        data = None

    rows = None
    if isinstance(data, dict):
        rows = data.get("answers")
        if rows is None:
            # Tolerate {"N1": {...}, "N2": {...}} or {"N1": "yes", ...}
            rows = [dict(v, item=k) if isinstance(v, dict) else {"item": k, "verdict": v} for k, v in data.items()]
    elif isinstance(data, list):
        rows = data

    items = {it.id: it for it in checkpoint.items}
    answers: List[ItemAnswer] = []
    seen = set()

    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue
            item_id = str(row.get("item") or row.get("id") or row.get("item_id") or row.get("question") or "").strip().upper()
            if item_id not in items or item_id in seen:
                continue
            passed = _as_bool(row.get("verdict", row.get("answer", row.get("passed", row.get("result")))))
            if passed is None:
                continue
            seen.add(item_id)
            cites = [c.upper() for c in _as_list(row.get("cite", row.get("cited", row.get("ids"))))]
            valid = case.valid_ids.get(items[item_id].cite, set())
            good = list(dict.fromkeys(c for c in cites if c in valid))
            bad = [c for c in cites if c not in valid]
            shotgun = len(good) > 2 and len(good) * 2 > len(valid)
            answers.append(
                ItemAnswer(
                    item_id=item_id,
                    passed=passed,
                    cited=good,
                    rejected_cites=bad,
                    reason=str(row.get("reason", ""))[:400],
                    counted=passed or (bool(good) and not shotgun),
                )
            )

    # Regex fallback if structured parsing failed or returned no items
    if not answers:
        for item_id, it in items.items():
            if item_id in seen:
                continue
            m = re.search(
                rf"(?:\b|\*){item_id}(?:\b|\*)[\s\S]*?[:\-]\s*(\b(?:yes|no|pass|fail|true|false)\b)([\s\S]*?)(?=(?:\b|\*)[NA][1-9]|\Z)",
                cleaned_raw,
                re.IGNORECASE,
            )
            if not m:
                continue
            passed = _as_bool(m.group(1))
            if passed is None:
                continue
            seen.add(item_id)
            snippet = m.group(2).strip()
            cites = [c.upper() for c in re.findall(r"\b[A-Za-z0-9_\-]+(?:-[0-9]+)?\b", snippet)]
            valid = case.valid_ids.get(it.cite, set())
            good = list(dict.fromkeys(c for c in cites if c in valid))
            bad = [c for c in cites if c not in valid]
            shotgun = len(good) > 2 and len(good) * 2 > len(valid)
            answers.append(
                ItemAnswer(
                    item_id=item_id,
                    passed=passed,
                    cited=good,
                    rejected_cites=bad,
                    reason=snippet[:400],
                    counted=passed or (bool(good) and not shotgun),
                )
            )

    if not answers:
        return JurorVerdict(**base, ok=False, error=f"no usable answers in: {cleaned_raw[:160]!r}")
    return JurorVerdict(**base, answers=answers)


def _feedback_line(item, tally: ItemTally, raw_source: str) -> str:
    ids = [i for i, _ in sorted(tally.cited_counts.items(), key=lambda kv: (-kv[1], kv[0]))]
    if item.cite == "raw_lines":
        lines = raw_lines(raw_source)
        shown = []
        for i in ids:
            n = int(i[1:])
            shown.append(f'{i} "{lines[n - 1][:160]}"' if 0 < n <= len(lines) else i)
        ids = shown
    return f"[{item.id}] {item.fix}: {', '.join(ids)}"


def aggregate(
    checkpoint_name: CheckpointName,
    checkpoint: Checkpoint,
    verdicts: List[JurorVerdict],
    attempt: int,
    excluded_families: List[str],
    raw_source: str = "",
) -> CheckpointResult:
    voting = [v for v in verdicts if v.ok]
    n = len(voting)
    tallies: List[ItemTally] = []
    for item in checkpoint.items:
        t = ItemTally(item_id=item.id, question=item.question, severity=item.severity, route=item.route)
        cites: Counter = Counter()
        for v in voting:
            ans = next((a for a in v.answers if a.item_id == item.id), None)
            if ans is None:
                t.abstain += 1
            elif ans.passed:
                t.yes += 1
            elif ans.counted:
                t.no += 1
                cites.update(set(ans.cited))
                if ans.reason:
                    t.reasons.append(f"{v.juror}: {ans.reason}")
            else:
                t.uncited_no += 1
        t.cited_counts = dict(cites)
        t.failed = n > 0 and t.no * 2 > n
        tallies.append(t)

    failing = [t for t in tallies if t.failed]
    items = {it.id: it for it in checkpoint.items}
    routes = sorted({t.route for t in failing}, key=ROUTE_ORDER.index)
    return CheckpointResult(
        checkpoint=checkpoint_name,
        attempt=attempt,
        passed=n > 0 and not failing,
        voting_jurors=n,
        low_independence=len({v.family for v in voting}) < 3,
        excluded_families=excluded_families,
        verdicts=verdicts,
        tallies=tallies,
        routes=routes,
        feedback=[_feedback_line(items[t.item_id], t, raw_source) for t in failing],
    )
