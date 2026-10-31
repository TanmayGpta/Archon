import numpy as np
import pytest

from kube_pred.detectors import MAX_SCORE, score_series

RNG = np.random.default_rng(0)
NOISE = 10 + RNG.normal(0, 0.5, 200)


@pytest.mark.parametrize("method", ["zscore", "mad", "ewma"])
def test_noise_is_not_flagged(method):
    scores = score_series(NOISE, method)
    assert np.max(np.abs(scores)) < 5


@pytest.mark.parametrize("method", ["zscore", "mad", "ewma"])
def test_spike_on_latest_point_is_flagged(method):
    values = np.append(NOISE, 20.0)
    assert score_series(values, method)[-1] > 3.5


@pytest.mark.parametrize("method", ["zscore", "mad", "ewma"])
def test_drop_gives_negative_score(method):
    values = np.append(NOISE, 0.0)
    assert score_series(values, method)[-1] < -3.5


@pytest.mark.parametrize("method", ["zscore", "mad", "ewma"])
def test_flat_zero_baseline_then_restart_is_clipped_not_inf(method):
    values = np.append(np.zeros(100), 1.0)
    assert score_series(values, method)[-1] == MAX_SCORE


def test_flat_baseline_ignores_tiny_jitter():
    # 0.1% wobble on a flat memory series is below the 1% scale floor.
    values = np.append(np.full(100, 1e8), 1e8 * 1.001)
    assert abs(score_series(values, "mad")[-1]) < 1


@pytest.mark.parametrize("method", ["zscore", "mad", "ewma"])
def test_short_series_scores_zero(method):
    assert not np.any(score_series([1.0, 50.0, 2.0], method))


def test_mad_is_robust_to_earlier_spike():
    values = NOISE.copy()
    values[150] = 100.0  # earlier outlier inside the baseline window
    values = np.append(values, 13.0)
    assert score_series(values, "mad")[-1] > 3.5
    assert score_series(values, "zscore")[-1] < 3.5  # mean/std got inflated by the spike


def test_unknown_detector():
    with pytest.raises(ValueError):
        score_series([1.0], "prophet")


def test_sparse_signal_small_blip_below_min_scale_is_not_flagged():
    # Throttle ratio sits at 0 with occasional 0.5% blips: noise, not an incident.
    values = np.append(np.zeros(100), 0.005)
    assert score_series(values, "mad")[-1] == MAX_SCORE  # default floor: any blip maxes out
    assert score_series(values, "mad", min_scale=0.02)[-1] < 1


def test_restart_still_flagged_with_signal_min_scale():
    values = np.append(np.zeros(100), 1.0)
    assert score_series(values, "mad", min_scale=0.25)[-1] == 4.0
