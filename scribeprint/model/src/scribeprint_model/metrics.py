from __future__ import annotations

import math
from collections import defaultdict
from typing import Sequence

import numpy as np
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score


def _arrays(labels: Sequence[int], scores: Sequence[float]) -> tuple[np.ndarray, np.ndarray]:
    y = np.asarray(labels, dtype=np.int64)
    s = np.asarray(scores, dtype=np.float64)
    if y.ndim != 1 or s.ndim != 1 or len(y) != len(s):
        raise ValueError("labels and scores must be equal-length one-dimensional arrays")
    if len(y) == 0:
        raise ValueError("metrics need at least one row")
    if not np.isin(y, [0, 1]).all():
        raise ValueError("labels must be binary 0/1")
    if not np.isfinite(s).all():
        raise ValueError("scores must be finite")
    return y, np.clip(s, 0.0, 1.0)


def threshold_at_fpr(labels: Sequence[int], scores: Sequence[float], target_fpr: float) -> float:
    """Lowest AI threshold whose empirical human false-positive rate is <= target."""

    y, s = _arrays(labels, scores)
    negatives = s[y == 0]
    if not len(negatives):
        raise ValueError("cannot select an FPR threshold without human examples")
    candidates = np.unique(np.concatenate(([np.nextafter(negatives.max(), np.inf)], negatives)))
    valid = [float(t) for t in candidates if float(np.mean(negatives >= t)) <= target_fpr]
    if not valid:
        return float(np.nextafter(negatives.max(), np.inf))
    return min(valid)


def threshold_at_fnr(labels: Sequence[int], scores: Sequence[float], target_fnr: float) -> float:
    """Highest human threshold whose empirical AI false-negative rate is <= target."""

    y, s = _arrays(labels, scores)
    positives = s[y == 1]
    if not len(positives):
        raise ValueError("cannot select an FNR threshold without AI examples")
    candidates = np.unique(np.concatenate(([np.nextafter(positives.min(), -np.inf)], positives)))
    valid = [float(t) for t in candidates if float(np.mean(positives <= t)) <= target_fnr]
    if not valid:
        return float(np.nextafter(positives.min(), -np.inf))
    return max(valid)


def select_abstention_thresholds(
    labels: Sequence[int],
    scores: Sequence[float],
    *,
    target_fpr: float = 0.005,
    target_fnr: float = 0.05,
) -> dict[str, float]:
    if not 0 <= target_fpr < 1 or not 0 <= target_fnr < 1:
        raise ValueError("target rates must be in [0, 1)")
    ai_min = threshold_at_fpr(labels, scores, target_fpr)
    human_max = threshold_at_fnr(labels, scores, target_fnr)
    if human_max >= ai_min:
        human_max = float(np.nextafter(ai_min, -np.inf))
    return {
        "human_max": human_max,
        "ai_min": ai_min,
        "target_fpr": target_fpr,
        "target_fnr": target_fnr,
    }


def expected_calibration_error(labels: Sequence[int], scores: Sequence[float], bins: int = 15) -> float:
    y, s = _arrays(labels, scores)
    edges = np.linspace(0, 1, bins + 1)
    error = 0.0
    for index in range(bins):
        left, right = edges[index], edges[index + 1]
        mask = (s >= left) & (s < right if index < bins - 1 else s <= right)
        if not mask.any():
            continue
        error += float(mask.mean()) * abs(float(y[mask].mean()) - float(s[mask].mean()))
    return error


def ppv_at_prevalence(recall: float, false_positive_rate: float, prevalence: float) -> float:
    numerator = recall * prevalence
    denominator = numerator + false_positive_rate * (1 - prevalence)
    return numerator / denominator if denominator else 0.0


def binary_metrics(labels: Sequence[int], scores: Sequence[float], threshold: float) -> dict:
    y, s = _arrays(labels, scores)
    prediction = (s >= threshold).astype(np.int64)
    tp = int(np.sum((prediction == 1) & (y == 1)))
    tn = int(np.sum((prediction == 0) & (y == 0)))
    fp = int(np.sum((prediction == 1) & (y == 0)))
    fn = int(np.sum((prediction == 0) & (y == 1)))

    def ratio(a: float, b: float) -> float:
        return a / b if b else 0.0

    recall = ratio(tp, tp + fn)
    specificity = ratio(tn, tn + fp)
    precision = ratio(tp, tp + fp)
    fpr = ratio(fp, fp + tn)
    metrics = {
        "rows": len(y),
        "threshold": float(threshold),
        "confusion": {"tp": tp, "tn": tn, "fp": fp, "fn": fn},
        "accuracy": ratio(tp + tn, len(y)),
        "precision": precision,
        "recall": recall,
        "specificity": specificity,
        "false_positive_rate": fpr,
        "false_negative_rate": ratio(fn, fn + tp),
        "f1": ratio(2 * precision * recall, precision + recall),
        "brier": float(brier_score_loss(y, s)),
        "ece_15": expected_calibration_error(y, s, bins=15),
        "ppv_at_1_percent_prevalence": ppv_at_prevalence(recall, fpr, 0.01),
        "ppv_at_5_percent_prevalence": ppv_at_prevalence(recall, fpr, 0.05),
    }
    metrics["roc_auc"] = float(roc_auc_score(y, s)) if len(np.unique(y)) == 2 else math.nan
    metrics["pr_auc"] = float(average_precision_score(y, s)) if len(np.unique(y)) == 2 else math.nan
    return metrics


def abstention_metrics(labels: Sequence[int], scores: Sequence[float], thresholds: dict[str, float]) -> dict:
    y, s = _arrays(labels, scores)
    human = s <= thresholds["human_max"]
    ai = s >= thresholds["ai_min"]
    conclusive = human | ai
    predicted = np.where(ai, 1, 0)
    correct = (predicted == y) & conclusive
    return {
        "coverage": float(conclusive.mean()),
        "abstention_rate": float((~conclusive).mean()),
        "selective_accuracy": float(correct.sum() / conclusive.sum()) if conclusive.any() else 0.0,
        "human_calls": int(human.sum()),
        "ai_calls": int(ai.sum()),
        "inconclusive": int((~conclusive).sum()),
    }


def sliced_metrics(
    labels: Sequence[int],
    scores: Sequence[float],
    slices: Sequence[str],
    threshold: float,
    *,
    minimum_rows: int = 2,
) -> dict[str, dict]:
    buckets: dict[str, list[int]] = defaultdict(list)
    for index, value in enumerate(slices):
        buckets[str(value or "unknown")].append(index)
    output = {}
    for name, indices in sorted(buckets.items()):
        if len(indices) < minimum_rows:
            continue
        output[name] = binary_metrics(
            [labels[index] for index in indices],
            [scores[index] for index in indices],
            threshold,
        )
    return output


def bootstrap_metric_interval(
    labels: Sequence[int],
    scores: Sequence[float],
    groups: Sequence[str],
    *,
    threshold: float,
    metric: str,
    iterations: int = 500,
    seed: int = 4433,
) -> dict[str, float]:
    """Group bootstrap so windows from one source are never treated as independent."""

    if not (len(labels) == len(scores) == len(groups)):
        raise ValueError("labels, scores and groups must have equal length")
    by_group: dict[str, list[int]] = defaultdict(list)
    for index, group in enumerate(groups):
        by_group[str(group)].append(index)
    names = np.asarray(list(by_group), dtype=object)
    rng = np.random.default_rng(seed)
    values = []
    for _ in range(iterations):
        sampled = rng.choice(names, size=len(names), replace=True)
        indices = [index for name in sampled for index in by_group[str(name)]]
        value = binary_metrics(
            [labels[index] for index in indices],
            [scores[index] for index in indices],
            threshold,
        ).get(metric)
        if value is not None and np.isfinite(value):
            values.append(float(value))
    if not values:
        return {"low": math.nan, "median": math.nan, "high": math.nan}
    return {
        "low": float(np.quantile(values, 0.025)),
        "median": float(np.quantile(values, 0.5)),
        "high": float(np.quantile(values, 0.975)),
    }


def positive_slice_metrics(
    labels: Sequence[int],
    scores: Sequence[float],
    slices: Sequence[str],
    threshold: float,
    *,
    minimum_rows: int = 2,
) -> dict[str, dict]:
    """Recall and score distribution for AI-only slices such as generator or attack."""

    y, s = _arrays(labels, scores)
    buckets: dict[str, list[int]] = defaultdict(list)
    for index, value in enumerate(slices):
        if y[index] == 1:
            buckets[str(value or "unknown")].append(index)
    output = {}
    for name, indices in sorted(buckets.items()):
        if len(indices) < minimum_rows:
            continue
        values = s[indices]
        output[name] = {
            "rows": len(indices),
            "recall": float(np.mean(values >= threshold)),
            "mean_score": float(np.mean(values)),
            "p10_score": float(np.quantile(values, 0.10)),
            "median_score": float(np.median(values)),
        }
    return output


def negative_slice_metrics(
    labels: Sequence[int],
    scores: Sequence[float],
    slices: Sequence[str],
    threshold: float,
    *,
    minimum_rows: int = 2,
) -> dict[str, dict]:
    """False-positive rate and score distribution for human-only writer slices."""

    y, s = _arrays(labels, scores)
    buckets: dict[str, list[int]] = defaultdict(list)
    for index, value in enumerate(slices):
        if y[index] == 0:
            buckets[str(value or "unknown")].append(index)
    output = {}
    for name, indices in sorted(buckets.items()):
        if len(indices) < minimum_rows:
            continue
        values = s[indices]
        output[name] = {
            "rows": len(indices),
            "false_positive_rate": float(np.mean(values >= threshold)),
            "mean_score": float(np.mean(values)),
            "p90_score": float(np.quantile(values, 0.90)),
            "median_score": float(np.median(values)),
        }
    return output
