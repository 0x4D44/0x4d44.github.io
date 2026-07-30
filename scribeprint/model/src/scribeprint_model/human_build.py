from __future__ import annotations

import datetime as dt
import hashlib
import heapq
import json
import statistics
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Sequence

from .data import read_examples
from .human_dedupe import NearDuplicateIndex, near_duplicate_pairs
from .human_schema import (
    AUDIT_SCHEMA,
    LOCK_SCHEMA,
    MANIFEST_SCHEMA,
    BenchmarkProfile,
    BenchmarkRecord,
    BenchmarkSourceSpec,
    Candidate,
    _parse_datetime,
    _sha256,
    _text_hash,
    _word_count,
)
from .human_sources import _adapter, _candidate_from_row


def _author_hash(benchmark_id: str, author: str) -> str:
    return _sha256(f"{benchmark_id}\0{author}")[:20]


def _candidate_heap_push(
    heap: list[tuple[int, int, Candidate]],
    candidate: Candidate,
    pool_size: int,
    sequence: int,
) -> None:
    item = (-candidate.priority, sequence, candidate)
    if len(heap) < pool_size:
        heapq.heappush(heap, item)
    elif item > heap[0]:
        heapq.heapreplace(heap, item)


def _build_source(
    spec: BenchmarkSourceSpec,
    profile: BenchmarkProfile,
    global_source_ids: set[str],
    global_hashes: set[str],
    near_index: "NearDuplicateIndex",
) -> tuple[list[BenchmarkRecord], dict[str, Any]]:
    adapter = _adapter(spec, profile.seed)
    if adapter.resolved_revision == "missing":
        return [], {
            "id": spec.id,
            "status": "optional-source-missing",
            "target": spec.target,
            "selected": 0,
            "revision": "missing",
        }

    pool_size = max(spec.target, spec.target * spec.oversample)
    heap: list[tuple[int, int, Candidate]] = []
    skipped: Counter[str] = Counter()
    scanned = 0
    eligible = 0
    for scanned, row in enumerate(adapter.rows, start=1):
        if scanned > spec.max_scan:
            scanned -= 1
            break
        candidate, reason = _candidate_from_row(row, spec, profile)
        if candidate is None:
            skipped[reason or "unknown"] += 1
            continue
        eligible += 1
        _candidate_heap_push(heap, candidate, pool_size, scanned)

    candidates = sorted((item[2] for item in heap), key=lambda item: (item.priority, item.source_id))
    selected: list[BenchmarkRecord] = []
    author_counts: Counter[str] = Counter()
    stratum_counts: Counter[str] = Counter()
    local_source_ids: set[str] = set()
    local_hashes: set[str] = set()

    for candidate in candidates:
        qualified_source = f"{spec.dataset}:{candidate.source_id}"
        if qualified_source in global_source_ids or qualified_source in local_source_ids:
            skipped["duplicate_source_id"] += 1
            continue
        if candidate.text_sha256 in global_hashes or candidate.text_sha256 in local_hashes:
            skipped["duplicate_text"] += 1
            continue
        duplicate_of = near_index.find(candidate.text)
        if duplicate_of is not None:
            skipped["near_duplicate"] += 1
            continue
        if spec.max_per_author and candidate.authors:
            if any(author_counts[author] >= spec.max_per_author for author in candidate.authors):
                skipped["author_cap"] += 1
                continue
        stratum_key = candidate.stratum or "unknown"
        if spec.max_per_stratum and stratum_counts[stratum_key] >= spec.max_per_stratum:
            skipped["stratum_cap"] += 1
            continue

        record_id = f"hb-{spec.id}-{_sha256(qualified_source)[:18]}"
        record = BenchmarkRecord(
            id=record_id,
            text=candidate.text,
            source_id=candidate.source_id,
            source_dataset=spec.dataset,
            source_revision=adapter.resolved_revision,
            benchmark_source=spec.id,
            source_url=candidate.source_url,
            source_licence=candidate.licence,
            redistributable=spec.redistributable,
            domain=spec.domain,
            subdomain=spec.subdomain,
            writer_population=spec.writer_population,
            document_date=(candidate.document_date.isoformat() if candidate.document_date else None),
            pre_llm_basis=(
                spec.pre_llm_basis
                if spec.historic_pre_llm
                else f"document date no later than {profile.pre_llm_cutoff.date().isoformat()}"
            ),
            author_hashes=[_author_hash(profile.benchmark_id, author) for author in candidate.authors],
            stratum=candidate.stratum,
            word_count=_word_count(candidate.text),
            text_sha256=candidate.text_sha256,
        )
        selected.append(record)
        near_index.add(record.id, record.text)
        local_source_ids.add(qualified_source)
        local_hashes.add(candidate.text_sha256)
        for author in candidate.authors:
            author_counts[author] += 1
        stratum_counts[stratum_key] += 1
        if len(selected) >= spec.target:
            break

    if len(selected) < spec.target and spec.required:
        diagnostic = {
            "source": spec.id,
            "selected": len(selected),
            "target": spec.target,
            "scanned": scanned,
            "eligible": eligible,
            "pool": len(candidates),
            "skipped": dict(skipped.most_common()),
        }
        raise RuntimeError(f"source quota not met: {json.dumps(diagnostic, sort_keys=True)}")

    global_source_ids.update(local_source_ids)
    global_hashes.update(local_hashes)
    report = {
        "id": spec.id,
        "status": "complete" if len(selected) >= spec.target else "short-optional",
        "adapter": spec.adapter,
        "dataset": spec.dataset,
        "requested_revision": spec.revision,
        "resolved_revision": adapter.resolved_revision,
        "source_reference": adapter.source_reference,
        "target": spec.target,
        "selected": len(selected),
        "scanned": scanned,
        "eligible": eligible,
        "candidate_pool": len(candidates),
        "skipped": dict(sorted(skipped.items())),
        "strata": dict(stratum_counts.most_common()),
        "author_groups": len(author_counts),
    }
    return selected, report


def _counts(records: Sequence[BenchmarkRecord], field: str) -> dict[str, int]:
    return dict(sorted(Counter(str(getattr(record, field) or "unknown") for record in records).items()))


def audit_records(
    records: Sequence[BenchmarkRecord],
    profile: BenchmarkProfile,
    source_reports: Sequence[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    ids = [record.id for record in records]
    source_ids = [f"{record.source_dataset}:{record.source_id}" for record in records]
    hashes = [record.text_sha256 for record in records]
    post_cutoff = [
        record.id
        for record in records
        if record.document_date
        and (_parse_datetime(record.document_date) or dt.datetime.max.replace(tzinfo=dt.timezone.utc))
        > profile.pre_llm_cutoff
    ]
    licence_missing = [record.id for record in records if not record.source_licence]
    text_hash_mismatch = [record.id for record in records if _text_hash(record.text) != record.text_sha256]
    word_count_mismatch = [record.id for record in records if _word_count(record.text) != record.word_count]
    near = near_duplicate_pairs(records, threshold=profile.near_duplicate_threshold)

    domains = Counter(record.domain for record in records)
    populations = Counter(record.writer_population for record in records)
    required_domains = {
        domain: {
            "required": required,
            "observed": domains.get(domain, 0),
            "ok": domains.get(domain, 0) >= required,
        }
        for domain, required in sorted(profile.required_domains.items())
    }
    production_populations = {
        population: {
            "required": required,
            "observed": populations.get(population, 0),
            "ok": populations.get(population, 0) >= required,
        }
        for population, required in sorted(profile.production_required_writer_populations.items())
    }

    construction_checks = {
        "minimum_total": len(records) >= profile.minimum_total,
        "unique_ids": len(ids) == len(set(ids)),
        "unique_source_documents": len(source_ids) == len(set(source_ids)),
        "unique_exact_texts": len(hashes) == len(set(hashes)),
        "near_duplicate_free": not near,
        "pre_llm_cutoff": not post_cutoff,
        "licences_present": not licence_missing,
        "text_hashes_valid": not text_hash_mismatch,
        "word_counts_valid": not word_count_mismatch,
        "required_domains": all(value["ok"] for value in required_domains.values()),
    }
    production_checks = {
        "construction_ready": all(construction_checks.values()),
        "writer_population_coverage": all(
            value["ok"] for value in production_populations.values()
        ),
    }
    production_checks["production_coverage_ready"] = all(production_checks.values())

    return {
        "schema": AUDIT_SCHEMA,
        "benchmark_id": profile.benchmark_id,
        "rows": len(records),
        "counts": {
            "domains": dict(sorted(domains.items())),
            "writer_populations": dict(sorted(populations.items())),
            "sources": _counts(records, "benchmark_source"),
            "licences": _counts(records, "source_licence"),
        },
        "required_domains": required_domains,
        "production_required_writer_populations": production_populations,
        "construction_checks": construction_checks,
        "production_checks": production_checks,
        "violations": {
            "post_cutoff": post_cutoff[:100],
            "licence_missing": licence_missing[:100],
            "text_hash_mismatch": text_hash_mismatch[:100],
            "word_count_mismatch": word_count_mismatch[:100],
            "near_duplicates": near[:100],
        },
        "source_reports": list(source_reports or []),
    }


def _write_jsonl(rows: Iterable[dict[str, Any]], path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            line = json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
            handle.write(line)
            digest.update(line.encode("utf-8"))
    return digest.hexdigest()


def build_benchmark(
    profile: BenchmarkProfile,
    *,
    profile_sha256: str,
    output_path: str | Path,
    manifest_path: str | Path,
    lock_path: str | Path,
    audit_path: str | Path,
) -> dict[str, Any]:
    records: list[BenchmarkRecord] = []
    source_reports: list[dict[str, Any]] = []
    global_source_ids: set[str] = set()
    global_hashes: set[str] = set()
    near_index = NearDuplicateIndex(profile.near_duplicate_threshold)
    for spec in profile.sources:
        source_records, report = _build_source(
            spec,
            profile,
            global_source_ids,
            global_hashes,
            near_index,
        )
        records.extend(source_records)
        source_reports.append(report)

    records.sort(key=lambda record: (record.domain, record.benchmark_source, record.id))
    audit = audit_records(records, profile, source_reports)
    if not audit["production_checks"]["construction_ready"]:
        raise RuntimeError(
            "benchmark construction gates failed: "
            + json.dumps(audit["construction_checks"], sort_keys=True)
        )

    output = Path(output_path)
    lock = Path(lock_path)
    audit_file = Path(audit_path)
    manifest_file = Path(manifest_path)
    benchmark_sha = _write_jsonl(
        (record.as_example().model_dump(exclude_none=True) for record in records), output
    )
    lock_sha = _write_jsonl((record.lock_row() for record in records), lock)
    audit_file.parent.mkdir(parents=True, exist_ok=True)
    audit_file.write_text(json.dumps(audit, indent=2, sort_keys=True), encoding="utf-8")

    word_counts = [record.word_count for record in records]
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "benchmark_id": profile.benchmark_id,
        "description": profile.description,
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "seed": profile.seed,
        "profile_sha256": profile_sha256,
        "pre_llm_cutoff": profile.pre_llm_cutoff.isoformat(),
        "rows": len(records),
        "benchmark_jsonl_sha256": benchmark_sha,
        "selection_lock_sha256": lock_sha,
        "text_committed_to_repository": False,
        "text_safe_for_automatic_artifact_upload": False,
        "source_reports": source_reports,
        "counts": audit["counts"],
        "word_count": {
            "minimum": min(word_counts),
            "median": statistics.median(word_counts),
            "mean": statistics.fmean(word_counts),
            "maximum": max(word_counts),
        },
        "construction_ready": audit["production_checks"]["construction_ready"],
        "production_coverage_ready": audit["production_checks"]["production_coverage_ready"],
        "known_coverage_gap": (
            None
            if audit["production_checks"]["production_coverage_ready"]
            else "Licensed native-student and learner-English supplements are still required."
        ),
    }
    manifest_file.parent.mkdir(parents=True, exist_ok=True)
    manifest_file.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return {"manifest": manifest, "audit": audit, "records": records}


def read_benchmark(path: str | Path) -> list[BenchmarkRecord]:
    records = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            source = line.strip()
            if not source:
                continue
            row = json.loads(source)
            metadata = row.get("metadata", {})
            records.append(
                BenchmarkRecord(
                    id=row["id"],
                    text=row["text"],
                    source_id=str(row.get("source_id", "")).split(":", 1)[-1],
                    source_dataset=metadata["source_dataset"],
                    source_revision=metadata["source_revision"],
                    benchmark_source=metadata["benchmark_source"],
                    source_url=metadata.get("source_url"),
                    source_licence=metadata["source_licence"],
                    redistributable=bool(metadata.get("redistributable", False)),
                    domain=row.get("domain", "general"),
                    subdomain=row.get("subdomain"),
                    writer_population=row.get("writer_population", "unknown"),
                    language=row.get("language", "en"),
                    document_date=row.get("created_at"),
                    pre_llm_basis=metadata["pre_llm_basis"],
                    author_hashes=metadata.get("author_hashes", []),
                    stratum=metadata.get("stratum"),
                    word_count=int(metadata["word_count"]),
                    text_sha256=metadata["text_sha256"],
                    transform_version=metadata.get("transform_version", "human-benchmark-v1"),
                )
            )
    return records


def read_lock(path: str | Path) -> list[dict[str, Any]]:
    rows = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            source = line.strip()
            if not source:
                continue
            row = json.loads(source)
            if row.get("schema") != LOCK_SCHEMA:
                raise ValueError(f"{path}:{line_number}: unsupported lock schema")
            rows.append(row)
    return rows


def training_overlap_report(lock_rows: Sequence[dict[str, Any]], training_path: str | Path) -> dict[str, Any]:
    """Detect exact-text or declared source-document overlap with future training data."""

    lock_hash_to_id = {str(row["text_sha256"]): str(row["id"]) for row in lock_rows}
    lock_source_to_id = {
        f"{row['source_dataset']}:{row['source_id']}": str(row["id"])
        for row in lock_rows
    }
    exact = []
    source = []
    training = read_examples(training_path)
    for example in training:
        benchmark_id = lock_hash_to_id.get(example.exact_text_hash)
        if benchmark_id:
            exact.append({"benchmark_id": benchmark_id, "training_id": example.id})
        if example.source_id:
            benchmark_id = lock_source_to_id.get(str(example.source_id))
            if benchmark_id:
                source.append({"benchmark_id": benchmark_id, "training_id": example.id})
    return {
        "schema": "scribeprint.human-benchmark-overlap.v1",
        "benchmark_rows": len(lock_rows),
        "training_rows": len(training),
        "ok": not exact and not source,
        "exact_text_overlaps": exact[:1000],
        "source_document_overlaps": source[:1000],
    }


def _default_output_paths(output: Path) -> tuple[Path, Path, Path]:
    return (
        output.with_suffix(output.suffix + ".manifest.json"),
        output.with_suffix(output.suffix + ".lock.jsonl"),
        output.with_suffix(output.suffix + ".audit.json"),
    )
