"""
Statistical anomaly detectors (Tier 1).

Every detector returns a signed, z-like score per point: 0 is normal and |score| >= ~3 is unusual.
Each point is scored only against the points before it, so the latest score is safe to alert on.
Scores are clipped to +/-MAX_SCORE so a perfectly flat baseline (e.g. 0 restarts) does not give inf.
"""
from typing import Callable, Dict, Sequence

import numpy as np

MAX_SCORE = 50.0
# A flat baseline has zero spread. Use at least 1% of its level, or `min_scale` in the signal's own
# units, so that small jitter on a flat series is not reported as a huge anomaly.
# Sparse signals that sit at 0 (throttling, restarts) need a per-signal `min_scale` from the config.
REL_SCALE_FLOOR = 0.01
ABS_SCALE_FLOOR = 1e-6


def _score(x: float, center: float, scale: float, min_scale: float = ABS_SCALE_FLOOR) -> float:
    floor = max(REL_SCALE_FLOOR * abs(center), min_scale)
    return float(np.clip((x - center) / max(scale, floor), -MAX_SCORE, MAX_SCORE))


def _rolling(values: np.ndarray, baseline: int, min_baseline: int, stat: Callable, min_scale: float) -> np.ndarray:
    scores = np.zeros(len(values))
    for i in range(min_baseline, len(values)):
        center, scale = stat(values[max(0, i - baseline):i])
        scores[i] = _score(values[i], center, scale, min_scale)
    return scores


def _mean_std(hist: np.ndarray):
    return hist.mean(), hist.std()


def _median_mad(hist: np.ndarray):
    median = np.median(hist)
    # 1.4826 makes MAD comparable to a standard deviation for normal data.
    return median, 1.4826 * np.median(np.abs(hist - median))


def zscore(values: Sequence[float], baseline: int = 120, min_baseline: int = 20,
           min_scale: float = ABS_SCALE_FLOOR, **_) -> np.ndarray:
    """Rolling mean/std. Simple, but one spike inflates the std for the next `baseline` points."""
    return _rolling(np.asarray(values, dtype=float), baseline, min_baseline, _mean_std, min_scale)


def mad(values: Sequence[float], baseline: int = 120, min_baseline: int = 20,
        min_scale: float = ABS_SCALE_FLOOR, **_) -> np.ndarray:
    """Rolling median/MAD. Robust to earlier spikes; the default first choice."""
    return _rolling(np.asarray(values, dtype=float), baseline, min_baseline, _median_mad, min_scale)


def ewma(values: Sequence[float], min_baseline: int = 20, span: int = 40,
         min_scale: float = ABS_SCALE_FLOOR, **_) -> np.ndarray:
    """Exponentially weighted mean/variance. Adapts to slow drift; reacts fast to sudden change."""
    x = np.asarray(values, dtype=float)
    scores = np.zeros(len(x))
    if len(x) == 0:
        return scores
    alpha = 2.0 / (span + 1)
    mean, var = x[0], 0.0
    for i in range(1, len(x)):
        if i >= min_baseline:
            scores[i] = _score(x[i], mean, np.sqrt(var), min_scale)
        diff = x[i] - mean
        mean += alpha * diff
        var = (1 - alpha) * (var + alpha * diff * diff)
    return scores


DETECTORS: Dict[str, Callable[..., np.ndarray]] = {"zscore": zscore, "mad": mad, "ewma": ewma}


def score_series(values: Sequence[float], method: str, **params) -> np.ndarray:
    if method not in DETECTORS:
        raise ValueError(f"Unknown detector '{method}'. Choose from {sorted(DETECTORS)}")
    return DETECTORS[method](values, **params)
