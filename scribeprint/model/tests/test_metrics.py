import math

from scribeprint_model.metrics import (
    abstention_metrics,
    binary_metrics,
    select_abstention_thresholds,
    threshold_at_fpr,
)


def test_threshold_respects_tied_human_scores():
    labels = [0, 0, 0, 0, 1, 1]
    scores = [0.1, 0.6, 0.6, 0.7, 0.8, 0.9]
    threshold = threshold_at_fpr(labels, scores, 0.25)
    observed = binary_metrics(labels, scores, threshold)["false_positive_rate"]
    assert observed <= 0.25
    # A threshold of 0.6 would incorrectly admit both tied negatives.
    assert threshold > 0.6


def test_two_threshold_policy_leaves_abstention_band():
    labels = [0] * 10 + [1] * 10
    scores = [
        0.01, 0.02, 0.03, 0.04, 0.05, 0.08, 0.11, 0.2, 0.3, 0.4,
        0.35, 0.5, 0.65, 0.75, 0.8, 0.85, 0.9, 0.94, 0.97, 0.99,
    ]
    thresholds = select_abstention_thresholds(
        labels, scores, target_fpr=0.1, target_fnr=0.1
    )
    assert thresholds["human_max"] < thresholds["ai_min"]
    result = abstention_metrics(labels, scores, thresholds)
    assert 0 <= result["coverage"] <= 1
    assert result["inconclusive"] >= 0


def test_binary_metrics_include_calibration_and_prevalence():
    result = binary_metrics([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9], 0.5)
    assert result["confusion"] == {"tp": 2, "tn": 2, "fp": 0, "fn": 0}
    assert math.isclose(result["roc_auc"], 1.0)
    assert "ppv_at_1_percent_prevalence" in result
