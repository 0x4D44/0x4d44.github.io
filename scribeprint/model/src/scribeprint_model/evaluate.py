from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from .baseline import load_artifact, predict_scores
from .data import assign_splits, component_keys, read_examples, subset
from .metrics import (
    abstention_metrics,
    binary_metrics,
    bootstrap_metric_interval,
    negative_slice_metrics,
    positive_slice_metrics,
    sliced_metrics,
)


def _length_band(text: str) -> str:
    words = len(text.split())
    if words < 100:
        return "under-100"
    if words < 300:
        return "100-299"
    if words < 800:
        return "300-799"
    return "800-plus"


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Evaluate a Scribeprint baseline artifact")
    parser.add_argument("--model", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument(
        "--split", default="test",
        choices=["train", "validation", "calibration", "test"],
    )
    parser.add_argument("--output")
    parser.add_argument("--bootstrap", type=int, default=500)
    args = parser.parse_args(argv)

    artifact = load_artifact(args.model)
    examples = assign_splits(read_examples(args.input), preserve_existing=True)
    rows = subset(examples, args.split)
    if not rows:
        raise SystemExit(f"no binary rows in split {args.split!r}")
    scores = predict_scores(artifact, [row.text for row in rows]).tolist()
    labels = [row.binary_label for row in rows]
    groups = component_keys(rows)
    threshold = artifact["thresholds"]["ai_min"]
    report = {
        "model_id": artifact["model_id"],
        "calibration_id": artifact["calibration_id"],
        "split": args.split,
        "overall": binary_metrics(labels, scores, threshold),
        "abstention": abstention_metrics(labels, scores, artifact["thresholds"]),
        "by_domain": sliced_metrics(
            labels, scores, [row.domain for row in rows], threshold
        ),
        "ai_recall_by_generator": positive_slice_metrics(
            labels,
            scores,
            [row.generator_family or row.generator_model or "unknown" for row in rows],
            threshold,
        ),
        "ai_recall_by_attack": positive_slice_metrics(
            labels,
            scores,
            [row.attack or "clean" for row in rows],
            threshold,
        ),
        "human_fpr_by_writer_population": negative_slice_metrics(
            labels,
            scores,
            [row.writer_population or "unspecified" for row in rows],
            threshold,
        ),
        "by_length": sliced_metrics(
            labels, scores, [_length_band(row.text) for row in rows], threshold
        ),
        "group_bootstrap_95_ci": {
            metric: bootstrap_metric_interval(
                labels,
                scores,
                groups,
                threshold=threshold,
                metric=metric,
                iterations=args.bootstrap,
            )
            for metric in ("false_positive_rate", "recall", "precision")
        },
    }
    rendered = json.dumps(report, indent=2)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
