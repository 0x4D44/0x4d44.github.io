from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from .data import assign_splits, dataset_manifest, leakage_report, write_jsonl
from .schema import Example

M4_REPOSITORY = "https://github.com/mbzuai-nlp/M4"
DEFAULT_LICENCE_NOTE = (
    "M4 research dataset; redistribution and downstream use remain subject to "
    "the M4 repository and each underlying human source's terms."
)


def _normalise(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _text_hash(text: str) -> str:
    normalised = _normalise(text).casefold()
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-") or "unknown"


def _word_count(text: str) -> int:
    return len(re.findall(r"\b\w+(?:['’-]\w+)*\b", text, flags=re.UNICODE))


def generator_family(model: str) -> str:
    lower = model.casefold()
    if "gpt-3.5" in lower or "chatgpt" in lower:
        return "openai-gpt-3.5"
    if "davinci" in lower:
        return "openai-davinci"
    if "cohere" in lower or "command" in lower:
        return "cohere"
    if "dolly" in lower:
        return "databricks-dolly"
    if "bloom" in lower:
        return "bigscience-bloomz"
    if "flan" in lower or "t5" in lower:
        return "google-flan-t5"
    if "llama" in lower:
        return "meta-llama"
    return _slug(model)


@dataclass(frozen=True)
class M4Pair:
    source_key: str
    source: str
    source_id: str
    prompt: str
    human_text: str
    machine_text: str
    model: str
    input_name: str
    line_number: int


def _iter_pairs(path: Path) -> Iterable[M4Pair]:
    """Read both the documented M4 schema and historical file variants."""

    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            raw = line.strip()
            if not raw:
                continue
            try:
                row = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number}: row must be a JSON object")

            # Historical BloomZ files use abstract/machine_abstract, several
            # files use source_id, and some FLAN rows leave source blank.
            human_text = row.get("human_text") or row.get("abstract")
            machine_text = row.get("machine_abstract") or row.get("machine_text")
            source_id = row.get("source_ID")
            if source_id in (None, ""):
                source_id = row.get("source_id")
            model = row.get("model")
            source = _normalise(row.get("source")) or path.stem.split("_", 1)[0]

            missing = [
                name
                for name, value in (
                    ("human_text/abstract", human_text),
                    ("machine_text/machine_abstract", machine_text),
                    ("model", model),
                    ("source_ID/source_id", source_id),
                )
                if value in (None, "")
            ]
            if missing:
                raise ValueError(
                    f"{path}:{line_number}: missing M4 fields: {', '.join(missing)}"
                )

            source_id_text = _normalise(source_id)
            yield M4Pair(
                source_key=f"m4:{source}:{source_id_text}",
                source=source,
                source_id=source_id_text,
                prompt=_normalise(row.get("prompt")),
                human_text=str(human_text).strip(),
                machine_text=str(machine_text).strip(),
                model=_normalise(model),
                input_name=path.name,
                line_number=line_number,
            )


def _matches_holdout(model: str, holdout: str) -> bool:
    target = holdout.casefold().strip()
    return target in {model.casefold(), generator_family(model).casefold()}


def import_m4(
    paths: Sequence[str | Path],
    *,
    dataset_revision: str,
    seed: int = 4433,
    max_sources: int | None = None,
    min_words: int = 50,
    holdout_generator: str | None = None,
    train_ratio: float = 0.70,
    validation_ratio: float = 0.10,
    calibration_ratio: float = 0.10,
    licence_note: str = DEFAULT_LICENCE_NOTE,
) -> tuple[list[Example], dict]:
    """Convert paired M4 JSONL files into leakage-safe canonical examples.

    Source identities and exact duplicate texts are connected *before* split
    assignment. With ``holdout_generator``, test components retain only that
    generator while train/validation/calibration retain every other generator.
    Human rows are retained on both sides, but never for the same source.
    """

    if not dataset_revision.strip():
        raise ValueError("dataset_revision must pin the exact M4 commit")
    if min(train_ratio, validation_ratio, calibration_ratio) < 0:
        raise ValueError("split ratios cannot be negative")
    if train_ratio + validation_ratio + calibration_ratio >= 1:
        raise ValueError("train + validation + calibration ratios must be below 1")
    if max_sources is not None and max_sources < 1:
        raise ValueError("max_sources must be positive")
    if min_words < 1:
        raise ValueError("min_words must be positive")

    resolved = [Path(path) for path in paths]
    if not resolved:
        raise ValueError("at least one M4 JSONL input is required")
    for path in resolved:
        if not path.is_file():
            raise FileNotFoundError(path)

    pairs: list[M4Pair] = []
    input_counts: Counter[str] = Counter()
    for path in resolved:
        for pair in _iter_pairs(path):
            pairs.append(pair)
            input_counts[path.name] += 1
    if not pairs:
        raise ValueError("M4 inputs contain no rows")

    # Deterministic source-level subsampling keeps a pilot repeatable.
    source_keys = sorted(
        {pair.source_key for pair in pairs},
        key=lambda key: (
            hashlib.sha256(f"{seed}:sample:{key}".encode("utf-8")).hexdigest(),
            key,
        ),
    )
    if max_sources is not None:
        source_keys = source_keys[:max_sources]
    selected = set(source_keys)
    pairs = [pair for pair in pairs if pair.source_key in selected]

    human_by_source: dict[str, M4Pair] = {}
    human_hash_by_source: dict[str, str] = {}
    ai_by_source: dict[str, list[M4Pair]] = defaultdict(list)
    ai_seen: set[tuple[str, str, str]] = set()
    skipped: Counter[str] = Counter()

    for pair in pairs:
        human_hash = _text_hash(pair.human_text)
        previous_hash = human_hash_by_source.get(pair.source_key)
        if previous_hash is not None and previous_hash != human_hash:
            previous = human_by_source[pair.source_key]
            raise ValueError(
                f"M4 source {pair.source_key!r} has conflicting human_text values "
                f"({previous.input_name} and {pair.input_name})"
            )
        human_hash_by_source[pair.source_key] = human_hash
        human_by_source.setdefault(pair.source_key, pair)

        key = (pair.source_key, pair.model.casefold(), _text_hash(pair.machine_text))
        if key in ai_seen:
            skipped["duplicate_ai_rows"] += 1
            continue
        ai_seen.add(key)
        ai_by_source[pair.source_key].append(pair)

    # Build every row before splitting so exact duplicates across source IDs
    # become one connected component in data.assign_splits().
    provisional: list[Example] = []
    for source_key in source_keys:
        human = human_by_source[source_key]
        prompt_hash = (
            hashlib.sha256(human.prompt.encode("utf-8")).hexdigest()
            if human.prompt
            else None
        )
        provisional.append(
            Example(
                id=f"{source_key}:human",
                text=human.human_text,
                label="human",
                source_id=source_key,
                pair_id=source_key,
                prompt_family=prompt_hash,
                domain=human.source,
                language="en",
                human_provenance=f"M4 human field; original source={human.source}",
                licence=licence_note,
                metadata={
                    "dataset": "M4",
                    "dataset_revision": dataset_revision,
                    "dataset_repository": M4_REPOSITORY,
                    "input_file": human.input_name,
                    "input_line": human.line_number,
                    "original_source_id": human.source_id,
                    "role": "human-source",
                },
            )
        )
        for ai in ai_by_source.get(source_key, []):
            ai_hash = _text_hash(ai.machine_text)[:12]
            provisional.append(
                Example(
                    id=f"{source_key}:ai:{_slug(ai.model)}:{ai_hash}",
                    text=ai.machine_text,
                    label="ai",
                    source_id=source_key,
                    pair_id=source_key,
                    prompt_family=(
                        hashlib.sha256(ai.prompt.encode("utf-8")).hexdigest()
                        if ai.prompt
                        else prompt_hash
                    ),
                    domain=ai.source,
                    language="en",
                    licence=licence_note,
                    generator_family=generator_family(ai.model),
                    generator_model=ai.model,
                    metadata={
                        "dataset": "M4",
                        "dataset_revision": dataset_revision,
                        "dataset_repository": M4_REPOSITORY,
                        "input_file": ai.input_name,
                        "input_line": ai.line_number,
                        "original_source_id": ai.source_id,
                        "role": "machine-mirror",
                    },
                )
            )

    assigned = assign_splits(
        provisional,
        seed=seed,
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
        calibration_ratio=calibration_ratio,
        preserve_existing=False,
    )
    rows_by_source: dict[str, list[Example]] = defaultdict(list)
    for example in assigned:
        rows_by_source[example.source_id or example.id].append(example)

    holdout = (holdout_generator or "").strip()
    holdout_matches = 0
    output: list[Example] = []
    source_counts: Counter[str] = Counter()

    for source_key in source_keys:
        rows = rows_by_source[source_key]
        if not rows:
            continue
        split = rows[0].split
        human_rows = [row for row in rows if row.label == "human"]
        ai_rows = [row for row in rows if row.label == "ai"]
        if holdout:
            if split == "test":
                ai_rows = [
                    row
                    for row in ai_rows
                    if row.generator_model
                    and _matches_holdout(row.generator_model, holdout)
                ]
                holdout_matches += len(ai_rows)
            else:
                ai_rows = [
                    row
                    for row in ai_rows
                    if not row.generator_model
                    or not _matches_holdout(row.generator_model, holdout)
                ]
        if not human_rows or not ai_rows:
            skipped[f"source_without_required_pair_{split}"] += 1
            continue
        if _word_count(human_rows[0].text) < min_words:
            skipped["short_human_sources"] += 1
            continue
        long_ai = [row for row in ai_rows if _word_count(row.text) >= min_words]
        skipped["short_ai_rows"] += len(ai_rows) - len(long_ai)
        if not long_ai:
            skipped[f"source_without_long_ai_{split}"] += 1
            continue
        output.extend(human_rows)
        output.extend(long_ai)
        source_counts[split or "unassigned"] += 1

    if holdout and holdout_matches == 0:
        available = sorted({pair.model for pair in pairs})
        raise ValueError(
            f"holdout generator {holdout_generator!r} matched no rows; available={available}"
        )
    if not output:
        raise ValueError("all M4 rows were filtered out")

    leakage = leakage_report(output)
    if not leakage["ok"]:
        raise ValueError(f"import produced split leakage: {json.dumps(leakage)}")

    split_labels: dict[str, Counter[str]] = defaultdict(Counter)
    for example in output:
        split_labels[example.split or "unassigned"][example.label] += 1
    for split, counts in split_labels.items():
        if counts["human"] == 0 or counts["ai"] == 0:
            raise ValueError(f"split {split!r} lacks a binary class: {dict(counts)}")

    manifest = {
        "schema": "scribeprint.m4-import.v1",
        "source_dataset": "M4",
        "source_repository": M4_REPOSITORY,
        "source_revision": dataset_revision,
        "protocol": (
            "source-disjoint-generator-holdout" if holdout else "source-grouped"
        ),
        "holdout_generator": holdout_generator,
        "seed": seed,
        "minimum_words": min_words,
        "maximum_sources": max_sources,
        "ratios": {
            "train": train_ratio,
            "validation": validation_ratio,
            "calibration": calibration_ratio,
            "test": 1 - train_ratio - validation_ratio - calibration_ratio,
        },
        "inputs": [
            {
                "path": str(path),
                "name": path.name,
                "sha256": _file_hash(path),
                "rows": input_counts[path.name],
            }
            for path in resolved
        ],
        "source_groups_by_split": dict(sorted(source_counts.items())),
        "skipped": dict(sorted((key, value) for key, value in skipped.items() if value)),
        "dataset": dataset_manifest(output),
        "leakage": leakage,
        "licence_note": licence_note,
        "redistribution": "The workflow deletes canonical source text before artifact upload.",
        "accuracy_status": "Pilot recipe only; no production accuracy claim.",
    }
    return output, manifest


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Import paired M4 JSONL into the canonical Scribeprint schema"
    )
    parser.add_argument(
        "--input",
        action="append",
        required=True,
        help="repeat for each M4 domain/model JSONL file",
    )
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest")
    parser.add_argument("--dataset-revision", required=True)
    parser.add_argument("--seed", type=int, default=4433)
    parser.add_argument("--max-sources", type=int)
    parser.add_argument("--min-words", type=int, default=50)
    parser.add_argument("--holdout-generator")
    parser.add_argument("--train-ratio", type=float, default=0.70)
    parser.add_argument("--validation-ratio", type=float, default=0.10)
    parser.add_argument("--calibration-ratio", type=float, default=0.10)
    parser.add_argument("--licence-note", default=DEFAULT_LICENCE_NOTE)
    args = parser.parse_args(argv)

    examples, manifest = import_m4(
        args.input,
        dataset_revision=args.dataset_revision,
        seed=args.seed,
        max_sources=args.max_sources,
        min_words=args.min_words,
        holdout_generator=args.holdout_generator,
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
        calibration_ratio=args.calibration_ratio,
        licence_note=args.licence_note,
    )
    output = Path(args.output)
    write_jsonl(examples, output)
    manifest["output"] = str(output)
    manifest["output_sha256"] = _file_hash(output)
    manifest_path = Path(args.manifest or f"{output}.manifest.json")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
