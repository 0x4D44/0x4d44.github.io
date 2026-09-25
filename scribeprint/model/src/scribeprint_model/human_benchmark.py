from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

# Re-export the stable construction API from a small CLI facade. The implementation
# is split by responsibility so provenance, source adapters, deduplication and release
# gates can be reviewed independently.
from .human_build import (
    _default_output_paths,
    audit_records,
    build_benchmark,
    read_benchmark,
    read_lock,
    training_overlap_report,
)
from .human_dedupe import NearDuplicateIndex, near_duplicate_pairs
from .human_schema import (
    AUDIT_SCHEMA,
    LOCK_SCHEMA,
    MANIFEST_SCHEMA,
    PROFILE_SCHEMA,
    RECORD_SCHEMA,
    AdapterResult,
    BenchmarkProfile,
    BenchmarkRecord,
    BenchmarkSourceSpec,
    Candidate,
    FilterSpec,
    load_profile,
)
from .human_sources import (
    _bounded_raw_text,
    _candidate_from_row,
    _iter_fce_xml,
    _iter_huggingface,
    _iter_local_jsonl,
)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build and audit the Scribeprint human false-positive benchmark"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="build a benchmark from a frozen profile")
    build.add_argument("--profile", required=True)
    build.add_argument("--output", required=True)
    build.add_argument("--manifest")
    build.add_argument("--lock")
    build.add_argument("--audit")

    audit = sub.add_parser("audit", help="audit an existing benchmark JSONL")
    audit.add_argument("--profile", required=True)
    audit.add_argument("--input", required=True)
    audit.add_argument("--output")

    overlap = sub.add_parser(
        "overlap", help="fail if a future training corpus overlaps the frozen benchmark"
    )
    overlap.add_argument("--lock", required=True)
    overlap.add_argument("--training", required=True)
    overlap.add_argument("--output")
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    args = _build_parser().parse_args(argv)
    if args.command == "overlap":
        report = training_overlap_report(read_lock(args.lock), args.training)
        rendered = json.dumps(report, indent=2, sort_keys=True)
        if args.output:
            Path(args.output).write_text(rendered, encoding="utf-8")
        print(rendered)
        if not report["ok"]:
            raise SystemExit(2)
        return

    profile, profile_sha = load_profile(args.profile)
    if args.command == "build":
        output = Path(args.output)
        default_manifest, default_lock, default_audit = _default_output_paths(output)
        result = build_benchmark(
            profile,
            profile_sha256=profile_sha,
            output_path=output,
            manifest_path=args.manifest or default_manifest,
            lock_path=args.lock or default_lock,
            audit_path=args.audit or default_audit,
        )
        print(json.dumps(result["manifest"], indent=2, sort_keys=True))
        return

    records = read_benchmark(args.input)
    report = audit_records(records, profile)
    rendered = json.dumps(report, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    print(rendered)
    if not report["production_checks"]["construction_ready"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
