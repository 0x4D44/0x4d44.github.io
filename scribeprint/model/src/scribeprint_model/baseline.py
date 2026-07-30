from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Sequence

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import MaxAbsScaler

from .calibration import fit_calibrator
from .data import assert_no_leakage, assign_splits, dataset_manifest, read_examples, subset
from .features import StylometricTransformer
from .metrics import abstention_metrics, binary_metrics, select_abstention_thresholds
from .schema import Example

ARTIFACT_SCHEMA = "scribeprint.baseline.v1"


def build_estimator(seed: int = 4433, max_features: int = 120_000) -> Pipeline:
    char_features = TfidfVectorizer(
        analyzer="char_wb", ngram_range=(3, 5), min_df=2, max_df=0.995,
        max_features=max_features, sublinear_tf=True, dtype=np.float32,
    )
    word_features = TfidfVectorizer(
        analyzer="word", ngram_range=(1, 2), min_df=2, max_df=0.995,
        max_features=max_features // 2, sublinear_tf=True,
        strip_accents="unicode", dtype=np.float32,
    )
    style_features = Pipeline([
        ("extract", StylometricTransformer()),
        ("scale", MaxAbsScaler()),
    ])
    union = FeatureUnion([
        ("char", char_features),
        ("word", word_features),
        ("style", style_features),
    ])
    classifier = LogisticRegression(
        C=3.0, max_iter=2_000, class_weight="balanced",
        solver="liblinear", random_state=seed,
    )
    return Pipeline([("features", union), ("classifier", classifier)])


def _xy(examples: Sequence[Example]) -> tuple[list[str], np.ndarray]:
    return [example.text for example in examples], np.asarray(
        [example.binary_label for example in examples], dtype=int
    )


def _require_classes(examples: Sequence[Example], split_name: str, allow_tiny: bool) -> None:
    labels = [example.binary_label for example in examples]
    counts = {label: labels.count(label) for label in (0, 1)}
    minimum = 2 if allow_tiny else 50
    if min(counts.values()) < minimum:
        raise ValueError(
            f"{split_name} needs at least {minimum} human and {minimum} AI rows; got {counts}. "
            "Use --allow-tiny only for plumbing tests, never for an accuracy claim."
        )


def train_baseline(
    examples: Sequence[Example],
    *,
    seed: int = 4433,
    target_fpr: float = 0.005,
    target_fnr: float = 0.05,
    calibration_method: str = "sigmoid",
    allow_tiny: bool = False,
    max_features: int = 120_000,
) -> dict:
    assigned = assign_splits(examples, seed=seed, preserve_existing=True)
    assert_no_leakage(assigned)
    train = subset(assigned, "train")
    validation = subset(assigned, "validation")
    calibration = subset(assigned, "calibration") or validation
    test = subset(assigned, "test")

    for name, rows in (("train", train), ("calibration", calibration), ("test", test)):
        _require_classes(rows, name, allow_tiny)

    estimator = build_estimator(seed=seed, max_features=max_features)
    train_x, train_y = _xy(train)
    estimator.fit(train_x, train_y)

    cal_x, cal_y = _xy(calibration)
    raw_cal = estimator.predict_proba(cal_x)[:, 1]
    calibrator = fit_calibrator(raw_cal, cal_y, calibration_method)
    calibrated = calibrator.predict(raw_cal)
    thresholds = select_abstention_thresholds(
        cal_y, calibrated, target_fpr=target_fpr, target_fnr=target_fnr
    )

    test_x, test_y = _xy(test)
    raw_test = estimator.predict_proba(test_x)[:, 1]
    test_scores = calibrator.predict(raw_test)
    metrics = binary_metrics(test_y, test_scores, thresholds["ai_min"])
    metrics["abstention"] = abstention_metrics(test_y, test_scores, thresholds)

    trained_at = datetime.now(UTC).isoformat()
    return {
        "schema": ARTIFACT_SCHEMA,
        "model_id": f"scribeprint-charword-style-{trained_at[:10]}",
        "calibration_id": f"cal-{trained_at[:19]}",
        "trained_at": trained_at,
        "estimator": estimator,
        "calibrator": calibrator,
        "thresholds": thresholds,
        "metrics": metrics,
        "dataset": dataset_manifest(assigned),
        "training": {
            "seed": seed,
            "calibration_method": calibration_method,
            "max_features": max_features,
            "notes": "Phase-0 baseline; not the production neural architecture.",
        },
    }


def predict_raw_scores(artifact: dict, texts: Sequence[str]) -> np.ndarray:
    return np.asarray(artifact["estimator"].predict_proba(list(texts))[:, 1], dtype=float)


def predict_scores(artifact: dict, texts: Sequence[str]) -> np.ndarray:
    raw = predict_raw_scores(artifact, texts)
    return np.asarray(artifact["calibrator"].predict(raw), dtype=float)


def classify_score(artifact: dict, score: float) -> tuple[str, list[str]]:
    thresholds = artifact["thresholds"]
    if score >= thresholds["ai_min"]:
        return "ai", ["ai"]
    if score <= thresholds["human_max"]:
        return "human", ["human"]
    return "inconclusive", ["human", "ai"]


def save_artifact(artifact: dict, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, path, compress=3)
    metadata = {
        key: value for key, value in artifact.items()
        if key not in {"estimator", "calibrator"}
    }
    path.with_suffix(path.suffix + ".json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )


def load_artifact(path: str | Path) -> dict:
    artifact = joblib.load(path)
    if artifact.get("schema") != ARTIFACT_SCHEMA:
        raise ValueError(f"unsupported artifact schema {artifact.get('schema')!r}")
    return artifact


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Train or run the transparent Scribeprint Phase-0 baseline"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    train = sub.add_parser("train", help="fit a baseline artifact")
    train.add_argument("--input", required=True)
    train.add_argument("--output", required=True)
    train.add_argument("--seed", type=int, default=4433)
    train.add_argument("--target-fpr", type=float, default=0.005)
    train.add_argument("--target-fnr", type=float, default=0.05)
    train.add_argument(
        "--calibration", choices=["identity", "sigmoid", "isotonic"], default="sigmoid"
    )
    train.add_argument("--max-features", type=int, default=120_000)
    train.add_argument("--allow-tiny", action="store_true")

    predict = sub.add_parser("predict", help="score text using a fitted artifact")
    predict.add_argument("--model", required=True)
    group = predict.add_mutually_exclusive_group(required=True)
    group.add_argument("--text")
    group.add_argument("--file")
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    args = _build_parser().parse_args(argv)
    if args.command == "train":
        examples = read_examples(args.input)
        artifact = train_baseline(
            examples,
            seed=args.seed,
            target_fpr=args.target_fpr,
            target_fnr=args.target_fnr,
            calibration_method=args.calibration,
            allow_tiny=args.allow_tiny,
            max_features=args.max_features,
        )
        save_artifact(artifact, args.output)
        print(json.dumps({
            key: value for key, value in artifact.items()
            if key not in {"estimator", "calibrator"}
        }, indent=2))
        return

    artifact = load_artifact(args.model)
    text = args.text if args.text is not None else Path(args.file).read_text(encoding="utf-8")
    score = float(predict_scores(artifact, [text])[0])
    label, prediction_set = classify_score(artifact, score)
    print(json.dumps({
        "score": score * 100,
        "label": label,
        "prediction_set": prediction_set,
    }, indent=2))


if __name__ == "__main__":
    main()
