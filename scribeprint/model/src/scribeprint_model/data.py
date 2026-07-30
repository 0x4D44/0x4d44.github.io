from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable, Iterator, Sequence

from .schema import Example, Split, canonical_example


def read_examples(path: str | Path) -> list[Example]:
    path = Path(path)
    suffix = path.suffix.casefold()
    if suffix in {".jsonl", ".ndjson"}:
        rows = _read_jsonl(path)
    elif suffix == ".csv":
        rows = _read_csv(path)
    else:
        raise ValueError(f"unsupported dataset format {suffix!r}; use JSONL or CSV")
    examples = [canonical_example(row, index) for index, row in enumerate(rows, start=1)]
    if not examples:
        raise ValueError("dataset contains no examples")
    return examples


def _read_jsonl(path: Path) -> Iterator[dict]:
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            source = line.strip()
            if not source or source.startswith("#"):
                continue
            try:
                row = json.loads(source)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number}: each row must be an object")
            yield row


def _read_csv(path: Path) -> Iterator[dict]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        yield from csv.DictReader(handle)


def write_jsonl(examples: Iterable[Example], path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for example in examples:
            handle.write(example.model_dump_json(exclude_none=True))
            handle.write("\n")


def stable_fraction(seed: int, value: str) -> float:
    digest = hashlib.sha256(f"{seed}:{value}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


class _DisjointSet:
    def __init__(self, size: int):
        self.parent = list(range(size))
        self.rank = [0] * size

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: int, right: int) -> None:
        left_root, right_root = self.find(left), self.find(right)
        if left_root == right_root:
            return
        if self.rank[left_root] < self.rank[right_root]:
            left_root, right_root = right_root, left_root
        self.parent[right_root] = left_root
        if self.rank[left_root] == self.rank[right_root]:
            self.rank[left_root] += 1


def component_keys(examples: Sequence[Example]) -> list[str]:
    """Return connected split components across every available identity.

    A simple priority key is insufficient: a human row may carry an author and
    source while its generated mirror carries only the source. Connected
    components preserve both the author boundary and the mirror boundary.
    """

    if not examples:
        return []
    dsu = _DisjointSet(len(examples))
    seen: dict[str, int] = {}
    tokens_by_index: list[list[str]] = []
    for index, example in enumerate(examples):
        tokens = []
        for namespace, value in (
            ("split", example.split_group),
            ("author", example.author_id_hash),
            ("source", example.source_id),
            ("pair", example.pair_id),
            ("exact", example.exact_text_hash),
        ):
            if not value:
                continue
            token = f"{namespace}:{value}"
            tokens.append(token)
            previous = seen.setdefault(token, index)
            dsu.union(index, previous)
        if not tokens:
            tokens.append(f"row:{example.id}")
        tokens_by_index.append(tokens)

    members: dict[int, list[int]] = defaultdict(list)
    for index in range(len(examples)):
        members[dsu.find(index)].append(index)

    priorities = ("split:", "author:", "source:", "pair:", "exact:", "row:")
    key_by_root = {}
    for root, indices in members.items():
        tokens = sorted({token for index in indices for token in tokens_by_index[index]})
        selected = None
        for prefix in priorities:
            candidates = [token for token in tokens if token.startswith(prefix)]
            if candidates:
                selected = candidates[0]
                break
        key_by_root[root] = selected or f"component:{min(examples[index].id for index in indices)}"
    return [key_by_root[dsu.find(index)] for index in range(len(examples))]


def assign_splits(
    examples: Sequence[Example],
    *,
    seed: int = 4433,
    train_ratio: float = 0.80,
    validation_ratio: float = 0.10,
    calibration_ratio: float = 0.05,
    preserve_existing: bool = True,
) -> list[Example]:
    if min(train_ratio, validation_ratio, calibration_ratio) < 0:
        raise ValueError("split ratios cannot be negative")
    if train_ratio + validation_ratio + calibration_ratio >= 1:
        raise ValueError("train + validation + calibration ratios must be below 1")

    boundaries = (
        train_ratio,
        train_ratio + validation_ratio,
        train_ratio + validation_ratio + calibration_ratio,
    )
    components = component_keys(examples)
    explicit: dict[str, set[Split]] = defaultdict(set)
    if preserve_existing:
        for example, component in zip(examples, components):
            if example.split:
                explicit[component].add(example.split)
    conflicts = {component: splits for component, splits in explicit.items() if len(splits) > 1}
    if conflicts:
        rendered = ", ".join(f"{component}={sorted(splits)}" for component, splits in conflicts.items())
        raise ValueError(f"split leakage in connected identity components: {rendered}")

    assigned_by_component: dict[str, Split] = {}
    for component in sorted(set(components)):
        if explicit.get(component):
            assigned_by_component[component] = next(iter(explicit[component]))
            continue
        value = stable_fraction(seed, component)
        if value < boundaries[0]:
            assigned = "train"
        elif value < boundaries[1]:
            assigned = "validation"
        elif value < boundaries[2]:
            assigned = "calibration"
        else:
            assigned = "test"
        assigned_by_component[component] = assigned

    return [
        example.model_copy(update={"split": assigned_by_component[component]})
        for example, component in zip(examples, components)
    ]


def leakage_report(examples: Sequence[Example]) -> dict:
    """Return exact and metadata-group leakage across splits.

    This is intentionally strict. A production corpus should additionally run a
    large-scale MinHash/semantic near-duplicate audit before fitting.
    """

    key_maps: dict[str, dict[str, set[str]]] = {
        "group_key": defaultdict(set),
        "source_id": defaultdict(set),
        "pair_id": defaultdict(set),
        "author_id_hash": defaultdict(set),
        "exact_text_hash": defaultdict(set),
    }
    for example in examples:
        if not example.split:
            continue
        key_maps["group_key"][example.group_key].add(example.split)
        key_maps["exact_text_hash"][example.exact_text_hash].add(example.split)
        for name in ("source_id", "pair_id", "author_id_hash"):
            value = getattr(example, name)
            if value:
                key_maps[name][value].add(example.split)

    leaked = {
        name: sorted(key for key, splits in values.items() if len(splits) > 1)
        for name, values in key_maps.items()
    }
    return {
        "ok": not any(leaked.values()),
        "leaked": leaked,
        "counts": {name: len(keys) for name, keys in leaked.items()},
    }


def assert_no_leakage(examples: Sequence[Example]) -> None:
    report = leakage_report(examples)
    if report["ok"]:
        return
    details = ", ".join(f"{name}={count}" for name, count in report["counts"].items() if count)
    raise ValueError(f"dataset leaks across splits ({details})")


def dataset_manifest(examples: Sequence[Example]) -> dict:
    by_split = Counter(example.split or "unassigned" for example in examples)
    by_label = Counter(example.label for example in examples)
    by_domain = Counter(example.domain for example in examples)
    by_generator = Counter(example.generator_family or example.generator_model or "human/unknown" for example in examples)
    return {
        "rows": len(examples),
        "splits": dict(sorted(by_split.items())),
        "labels": dict(sorted(by_label.items())),
        "domains": dict(sorted(by_domain.items())),
        "generators": dict(sorted(by_generator.items())),
        "groups": len(set(component_keys(examples))),
        "exact_texts": len({example.exact_text_hash for example in examples}),
    }


def subset(examples: Sequence[Example], split: str, *, binary_only: bool = True) -> list[Example]:
    result = [example for example in examples if example.split == split]
    if binary_only:
        result = [example for example in result if example.label in {"human", "ai"}]
    return result
