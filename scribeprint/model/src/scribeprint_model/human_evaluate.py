from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any, Sequence

import numpy as np
from scipy.stats import beta

from .baseline import load_artifact, predict_scores
from .data import read_examples

REPORT_SCHEMA = "scribeprint.human-fpr-evaluation.v1"


def one_sided_binomial_upper(successes: int, trials: int, confidence: float = 0.95) -> float:
    """Clopper-Pearson one-sided upper bound for a binomial rate."""

    if trials <= 0:
        raise ValueError("trials must be positive")
    if not 0 <= successes <= trials:
        raise ValueError("successes must be in [0, trials]")
    if not 0 < confidence < 1:
        raise ValueError("confidence must be in (0, 1)")
    if successes == trials:
        return 1.0
    return float(beta.ppf(confidence, successes + 1, trials - successes))


def _slice_report(scores: np.ndarray, indices: list[int], thresholds: dict[str, float]) -> dict[str, Any]:
    values = scores[indices]
    ai = values >= thresholds["ai_min"]
    human = values <= thresholds["human_max"]
    inconclusive = ~(ai | human)
    false_positives = int(ai.sum())
    count = len(indices)
    return {
        "rows": count,
        "false_positives": false_positives,
        "false_positive_rate": false_positives / count if count else math.nan,
        "false_positive_rate_upper_95": (
            one_sided_binomial_upper(false_positives, count) if count else math.nan
        ),
        "human_calls": int(human.sum()),
        "inconclusive": int(inconclusive.sum()),
        "inconclusive_rate": float(inconclusive.mean()) if count else math.nan,
        "score": {
            "minimum": float(values.min()) if count else math.nan,
            "median": float(np.median(values)) if count else math.nan,
            "p90": float(np.quantile(values, 0.90)) if count else math.nan,
            "p95": float(np.quantile(values, 0.95)) if count else math.nan,
            "p99": float(np.quantile(values, 0.99)) if count else math.nan,
            "maximum": float(values.max()) if count else math.nan,
        },
    }


def _grouped(rows, field, metadata_field: bool = False) -> dict[str, list[int]]:
    groups: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        value = row.metadata.get(field) if metadata_field else getattr(row, field, None)
        groups[str(value or "unknown")].append(index)
    return dict(groups)


def evaluate_human_benchmark(artifact: dict, rows) -> dict[str, Any]:
    if not rows:
        raise ValueError("human benchmark contains no rows")
    non_human = [row.id for row in rows if row.label != "human"]
    if non_human:
        raise ValueError(f"human benchmark contains non-human labels: {non_human[:5]}")
    scores = predict_scores(artifact, [row.text for row in rows])
    thresholds = artifact["thresholds"]
    overall = _slice_report(scores, list(range(len(rows))), thresholds)

    report: dict[str, Any] = {
        "schema": REPORT_SCHEMA,
        "model_id": artifact["model_id"],
        "calibration_id": artifact["calibration_id"],
        "thresholds": thresholds,
        "overall": overall,
        "by_domain": {
            key: _slice_report(scores, indices, thresholds)
            for key, indices in sorted(_grouped(rows, "domain").items())
        },
        "by_writer_population": {
            key: _slice_report(scores, indices, thresholds)
            for key, indices in sorted(_grouped(rows, "writer_population").items())
        },
        "by_benchmark_source": {
            key: _slice_report(scores, indices, thresholds)
            for key, indices in sorted(
                _grouped(rows, "benchmark_source", metadata_field=True).items()
            )
        },
    }
    ranked = sorted(
        (
            {
                "id": row.id,
                "score": float(score),
                "domain": row.domain,
                "writer_population": row.writer_population,
                "benchmark_source": row.metadata.get("benchmark_source"),
                "text_sha256": row.metadata.get("text_sha256"),
            }
            for row, score in zip(rows, scores)
        ),
        key=lambda item: item["score"],
        reverse=True,
    )
    report["highest_risk_rows"] = ranked[:100]
    report["release_interpretation"] = {
        "zero_false_positive_upper_bound_percent": (
            one_sided_binomial_upper(0, len(rows)) * 100
        ),
        "note": (
            "The one-sided 95% binomial bound assumes benchmark source groups are "
            "sufficiently independent. Per-source and per-population slices remain mandatory."
        ),
    }
    return report


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate a frozen Scribeprint model on the human-only benchmark"
    )
    parser.add_argument("--model", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output")
    parser.add_argument(
        "--maximum-fpr-upper-95",
        type=float,
        help="optional release gate expressed as a rate, e.g. 0.005 for 0.5%",
    )
    args = parser.parse_args(argv)

    artifact = load_artifact(args.model)
    rows = read_examples(args.input)
    report = evaluate_human_benchmark(artifact, rows)
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    print(rendered)
    if (
        args.maximum_fpr_upper_95 is not None
        and report["overall"]["false_positive_rate_upper_95"]
        > args.maximum_fpr_upper_95
    ):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
