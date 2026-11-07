from __future__ import annotations

import heapq
from collections import Counter, defaultdict
from typing import Any, Sequence

from .human_schema import BenchmarkRecord, _WORD, _stable_int


def _word_shingles(text: str, width: int = 5) -> set[int]:
    tokens = [word.casefold() for word in _WORD.findall(text)]
    if len(tokens) < width:
        return {_stable_int(*tokens)} if tokens else set()
    return {
        _stable_int(*tokens[index : index + width])
        for index in range(len(tokens) - width + 1)
    }


def _bottom_k_signature(shingles: set[int], k: int = 64) -> tuple[int, ...]:
    if len(shingles) <= k:
        return tuple(sorted(shingles))
    return tuple(heapq.nsmallest(k, shingles))


class NearDuplicateIndex:
    """Incremental 5-gram near-duplicate guard used during selection."""

    def __init__(self, threshold: float, signature_size: int = 64, minimum_shared: int = 8):
        self.threshold = threshold
        self.signature_size = signature_size
        self.minimum_shared = minimum_shared
        self._anchors: dict[int, list[int]] = defaultdict(list)
        self._shingles: list[set[int]] = []
        self._ids: list[str] = []

    def _candidate_indices(self, signature: tuple[int, ...]) -> Counter[int]:
        counts: Counter[int] = Counter()
        for anchor in signature:
            indices = self._anchors.get(anchor, ())
            if len(indices) > 250:
                continue
            counts.update(indices)
        return counts

    def find(self, text: str) -> str | None:
        shingles = _word_shingles(text)
        signature = _bottom_k_signature(shingles, self.signature_size)
        for index, shared in self._candidate_indices(signature).most_common():
            if shared < self.minimum_shared:
                break
            existing = self._shingles[index]
            union = len(existing | shingles)
            similarity = len(existing & shingles) / union if union else 0.0
            if similarity >= self.threshold:
                return self._ids[index]
        return None

    def add(self, record_id: str, text: str) -> None:
        shingles = _word_shingles(text)
        signature = _bottom_k_signature(shingles, self.signature_size)
        index = len(self._ids)
        self._ids.append(record_id)
        self._shingles.append(shingles)
        for anchor in signature:
            self._anchors[anchor].append(index)


def near_duplicate_pairs(
    records: Sequence[BenchmarkRecord],
    *,
    threshold: float = 0.90,
    signature_size: int = 64,
    bands: int = 8,
) -> list[dict[str, Any]]:
    """Find likely copies with a bottom-k shingle index, then exact Jaccard.

    Each signature value is an anchor in an inverted index. High-overlap texts
    share many anchors even when a strict fixed-band LSH partition happens to
    miss them. Only pairs sharing several anchors receive the more expensive
    exact 5-gram comparison.
    """

    if not records:
        return []
    if signature_size < 8 or bands < 1:
        raise ValueError("signature_size must be at least 8 and bands positive")
    minimum_shared = max(2, signature_size // bands)
    anchor_buckets: dict[int, list[int]] = defaultdict(list)
    shingle_cache: dict[int, set[int]] = {}

    for index, record in enumerate(records):
        shingles = _word_shingles(record.text)
        shingle_cache[index] = shingles
        signature = _bottom_k_signature(shingles, signature_size)
        for anchor in signature:
            anchor_buckets[anchor].append(index)

    shared_counts: Counter[tuple[int, int]] = Counter()
    for indices in anchor_buckets.values():
        unique = sorted(set(indices))
        # Very common boilerplate anchors add little discriminatory value.
        if len(unique) > 250:
            continue
        for left_pos in range(len(unique)):
            for right_pos in range(left_pos + 1, len(unique)):
                shared_counts[(unique[left_pos], unique[right_pos])] += 1

    output = []
    for (left, right), shared in shared_counts.items():
        if shared < minimum_shared:
            continue
        left_set, right_set = shingle_cache[left], shingle_cache[right]
        union = len(left_set | right_set)
        similarity = len(left_set & right_set) / union if union else 0.0
        if similarity < threshold:
            continue
        output.append(
            {
                "left_id": records[left].id,
                "right_id": records[right].id,
                "left_source": records[left].benchmark_source,
                "right_source": records[right].benchmark_source,
                "shared_signature_anchors": shared,
                "jaccard_5gram": round(similarity, 6),
            }
        )
    return sorted(output, key=lambda row: row["jaccard_5gram"], reverse=True)
