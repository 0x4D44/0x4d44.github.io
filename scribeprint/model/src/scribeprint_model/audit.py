from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors

from .data import assign_splits, leakage_report, read_examples


def near_duplicate_report(
    examples,
    *,
    threshold: float = 0.92,
    neighbours: int = 5,
    max_rows: int = 20_000,
) -> dict:
    if len(examples) > max_rows:
        raise ValueError(
            f"near-duplicate audit is capped at {max_rows:,} rows; "
            "shard by domain or use a distributed MinHash/LSH job"
        )
    if len(examples) < 2:
        return {"threshold": threshold, "pairs": [], "rows": len(examples)}

    vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(5, 5),
        min_df=1,
        sublinear_tf=True,
        dtype=np.float32,
    )
    matrix = vectorizer.fit_transform([example.text for example in examples])
    count = min(max(2, neighbours + 1), len(examples))
    model = NearestNeighbors(
        n_neighbors=count,
        metric="cosine",
        algorithm="brute",
        n_jobs=-1,
    )
    model.fit(matrix)
    distances, indices = model.kneighbors(matrix)
    pairs = {}
    for left, (row_distances, row_indices) in enumerate(zip(distances, indices)):
        for distance, right in zip(row_distances[1:], row_indices[1:]):
            if examples[left].split == examples[right].split:
                continue
            similarity = 1 - float(distance)
            if similarity < threshold:
                continue
            key = tuple(sorted((left, int(right))))
            pairs[key] = max(pairs.get(key, 0), similarity)
    rendered = [
        {
            "left_id": examples[left].id,
            "left_split": examples[left].split,
            "right_id": examples[right].id,
            "right_split": examples[right].split,
            "similarity": round(similarity, 6),
        }
        for (left, right), similarity in sorted(
            pairs.items(), key=lambda item: item[1], reverse=True
        )
    ]
    return {"threshold": threshold, "pairs": rendered, "rows": len(examples)}


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Audit Scribeprint split leakage and medium-corpus near duplicates"
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--output")
    parser.add_argument("--threshold", type=float, default=0.92)
    parser.add_argument("--neighbours", type=int, default=5)
    parser.add_argument("--max-rows", type=int, default=20_000)
    args = parser.parse_args(argv)

    examples = assign_splits(read_examples(args.input), preserve_existing=True)
    report = {
        "exact_and_group": leakage_report(examples),
        "near_duplicates": near_duplicate_report(
            examples,
            threshold=args.threshold,
            neighbours=args.neighbours,
            max_rows=args.max_rows,
        ),
    }
    report["ok"] = (
        report["exact_and_group"]["ok"]
        and not report["near_duplicates"]["pairs"]
    )
    rendered = json.dumps(report, indent=2)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    print(rendered)
    if not report["ok"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
