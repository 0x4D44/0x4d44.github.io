from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterator, Sequence
from xml.etree import ElementTree

from .human_schema import (
    AdapterResult,
    BenchmarkProfile,
    BenchmarkSourceSpec,
    Candidate,
    FilterSpec,
    _AI_MARKER,
    _IRC_PREFIX,
    _URL,
    _WORD,
    _canonical_space,
    _extract_host,
    _find_stackexchange_host,
    _flatten_strings,
    _get_path,
    _normalise_author,
    _parse_datetime,
    _sha256,
    _stable_int,
    _text_hash,
    _word_count,
)


def _filter_value(row: dict[str, Any], candidate_fields: dict[str, Any], field: str) -> Any:
    if field.startswith("$"):
        return candidate_fields.get(field[1:])
    return _get_path(row, field)


def _matches_filter(actual: Any, spec: FilterSpec) -> bool:
    values = _flatten_strings(actual)
    expected = spec.value
    if spec.op == "exists":
        return bool(values) == bool(expected)
    if spec.op in {"eq", "neq"}:
        match = str(actual).casefold() == str(expected).casefold()
        return match if spec.op == "eq" else not match
    if spec.op in {"in", "not_in"}:
        choices = {str(value).casefold() for value in (expected if isinstance(expected, list) else [expected])}
        match = any(value.casefold() in choices for value in values)
        return match if spec.op == "in" else not match
    if spec.op in {"contains", "not_contains"}:
        needle = str(expected).casefold()
        match = any(needle in value.casefold() for value in values)
        return match if spec.op == "contains" else not match
    if spec.op in {"regex", "not_regex"}:
        pattern = re.compile(str(expected), flags=re.IGNORECASE)
        match = any(pattern.search(value) for value in values)
        return bool(match) if spec.op == "regex" else not bool(match)
    raise ValueError(f"unsupported filter operation {spec.op!r}")


def _apply_transforms(text: str, transforms: Sequence[str]) -> str:
    transformed = text
    for name in transforms:
        if name == "normalise":
            transformed = _canonical_space(transformed)
        elif name == "irc_dialogue":
            transformed = _IRC_PREFIX.sub("\n", transformed)
            transformed = re.sub(r"(?m)^\s*(?:-!-|===|\*\*\*)[^\n]*$", "", transformed)
            transformed = _canonical_space(transformed)
        elif name == "pep_body":
            # Remove RFC-style metadata while retaining the authored rationale.
            match = re.search(
                r"(?im)^\s*(?:abstract|motivation|rationale|introduction)\s*$",
                transformed,
            )
            if match:
                transformed = transformed[match.end() :]
            transformed = _canonical_space(transformed)
        else:  # pragma: no cover - Pydantic prevents this
            raise ValueError(f"unknown transform {name!r}")
    return _canonical_space(transformed)


def _bounded_raw_text(text: str, source_key: str, spec: BenchmarkSourceSpec, seed: int) -> str:
    """Bound preprocessing work for exceptionally large source documents.

    Some Regulations.gov rows contain book-length attachments. Holding the row is
    unavoidable when it arrives from Arrow, but duplicating a hundred-megabyte
    string into token lists is not. A deterministic interior character slice is
    taken before normalisation; the later word window remains source-stable.
    """

    if len(text) <= spec.maximum_raw_characters:
        return text
    width = min(spec.raw_slice_characters, len(text))
    max_start = len(text) - width
    start = _stable_int(seed, spec.id, source_key, "raw-slice") % (max_start + 1)
    end = start + width
    # Prefer paragraph boundaries without scanning the whole source.
    left = text.find("\n\n", start, min(end, start + 4_000))
    if left >= 0:
        start = left + 2
    right = text.rfind("\n\n", max(start, end - 4_000), end)
    if right > start:
        end = right
    return text[start:end]


def _sentence_aligned_window(text: str, start: int, end: int, spec: BenchmarkSourceSpec) -> str:
    before = text[max(0, start - 320) : start]
    boundaries = list(re.finditer(r"(?:[.!?][\"'’”)]?\s+|\n\s*\n)", before))
    aligned_start = max(0, start - len(before) + boundaries[-1].end()) if boundaries else start

    after = text[end : min(len(text), end + 320)]
    match = re.search(r"(?:[.!?][\"'’”)]?(?=\s|$)|\n\s*\n)", after)
    aligned_end = end + match.end() if match else end
    candidate = text[aligned_start:aligned_end].strip()
    words = _word_count(candidate)
    if spec.min_words <= words <= spec.max_words:
        return candidate
    return text[start:end].strip()


def _window_text(text: str, source_key: str, spec: BenchmarkSourceSpec, seed: int) -> str:
    # Keep spans rather than both a word-string list and a second match list.
    matches = list(_WORD.finditer(text))
    if len(matches) <= spec.max_words:
        return text
    range_width = spec.target_words_max - spec.target_words_min + 1
    desired = spec.target_words_min + (_stable_int(seed, spec.id, source_key, "length") % range_width)
    desired = min(desired, spec.max_words, len(matches))

    max_start = max(0, len(matches) - desired)
    start_word = _stable_int(seed, spec.id, source_key, "window") % (max_start + 1)
    start = matches[start_word].start()
    end = matches[start_word + desired - 1].end()
    window = _sentence_aligned_window(text, start, end, spec)
    return _canonical_space(window)


def _quality_reason(text: str, spec: BenchmarkSourceSpec) -> str | None:
    words = _WORD.findall(text)
    count = len(words)
    if count < spec.min_words:
        return "short"
    if count > spec.max_words:
        return "long_after_window"
    if _AI_MARKER.search(text):
        return "explicit_ai_marker"
    nonspace = [char for char in text if not char.isspace()]
    if nonspace:
        alpha_ratio = sum(char.isalpha() for char in nonspace) / len(nonspace)
        if alpha_ratio < spec.minimum_alpha_ratio:
            return "low_alpha_ratio"
    if len(_URL.findall(text)) / max(1, count) > spec.maximum_url_density:
        return "high_url_density"
    lines = [line.strip().casefold() for line in text.splitlines() if len(line.strip()) >= 20]
    if len(lines) >= 4:
        duplicate_ratio = 1 - len(set(lines)) / len(lines)
        if duplicate_ratio > spec.maximum_duplicate_line_ratio:
            return "duplicate_lines"
    token_set = {word.casefold() for word in words}
    if count >= 100 and len(token_set) / count < 0.08:
        return "low_lexical_diversity"
    return None


def _resolve_stratum(row: dict[str, Any], spec: BenchmarkSourceSpec) -> str | None:
    value = _get_path(row, spec.stratum_field) if spec.stratum_field else None
    if spec.stratum_transform == "stackexchange_host":
        return _find_stackexchange_host(row.get("metadata"))
    if spec.stratum_transform == "host":
        return _extract_host(value)
    strings = _flatten_strings(value)
    if not strings:
        return None
    result = strings[0]
    return result.casefold() if spec.stratum_transform == "lower" else result


def _extract_authors(row: dict[str, Any], fields: Sequence[str]) -> list[str]:
    authors: list[str] = []
    for field in fields:
        authors.extend(_flatten_strings(_get_path(row, field)))
    normalised = []
    seen = set()
    for author in authors:
        key = _normalise_author(author)
        if not key or key in seen:
            continue
        # URLs are useful for Stack Exchange site discovery but should not count
        # as a second author identity when a display name is also present.
        seen.add(key)
        normalised.append(key)
    return normalised


def _licence_allowed(licence: str, allow: Sequence[str]) -> bool:
    if not licence:
        return False
    if not allow:
        return True
    lower = licence.casefold()
    return any(pattern.casefold() in lower for pattern in allow)


def _candidate_from_row(
    row: dict[str, Any],
    spec: BenchmarkSourceSpec,
    profile: BenchmarkProfile,
) -> tuple[Candidate | None, str | None]:
    raw_id = _get_path(row, spec.id_field)
    raw_text = _get_path(row, spec.text_field)
    if raw_id in (None, ""):
        return None, "missing_id"
    if not isinstance(raw_text, str) or not raw_text.strip():
        return None, "missing_text"
    source_id = str(raw_id).strip()
    document_date = _parse_datetime(_get_path(row, spec.date_field)) if spec.date_field else None
    licence = spec.fixed_licence or str(_get_path(row, spec.licence_field, "") or "").strip()
    source_url = str(_get_path(row, spec.url_field, "") or "").strip() or None
    authors = _extract_authors(row, spec.author_fields)
    stratum = _resolve_stratum(row, spec)

    derived = {
        "date": document_date.isoformat() if document_date else None,
        "licence": licence,
        "source_id": source_id,
        "stratum": stratum,
        "text": raw_text,
    }
    for filter_spec in spec.filters:
        if not _matches_filter(_filter_value(row, derived, filter_spec.field), filter_spec):
            return None, f"filter:{filter_spec.field}:{filter_spec.op}"

    if not _licence_allowed(licence, spec.licence_allow):
        return None, "licence"
    if not spec.historic_pre_llm:
        if document_date is None:
            return None, "missing_date"
        if document_date > profile.pre_llm_cutoff:
            return None, "post_cutoff"

    bounded = _bounded_raw_text(raw_text, source_id, spec, profile.seed)
    transformed = _apply_transforms(bounded, spec.transforms)
    transformed = _window_text(transformed, source_id, spec, profile.seed)
    reason = _quality_reason(transformed, spec)
    if reason:
        return None, reason
    return Candidate(
        source_id=source_id,
        text=transformed,
        text_sha256=_text_hash(transformed),
        document_date=document_date,
        authors=authors,
        licence=licence,
        source_url=source_url,
        stratum=stratum,
        priority=_stable_int(profile.seed, spec.id, source_id, "priority"),
    ), None


def _iter_huggingface(spec: BenchmarkSourceSpec, seed: int) -> AdapterResult:
    try:
        from datasets import load_dataset  # type: ignore
        from huggingface_hub import HfApi  # type: ignore
    except ImportError as exc:  # pragma: no cover - integration path
        raise RuntimeError(
            "Hugging Face sources require `pip install -e './scribeprint/model[benchmark]'`"
        ) from exc

    info = HfApi().dataset_info(spec.dataset, revision=spec.revision)
    revision = info.sha or spec.revision
    stream = load_dataset(
        spec.dataset,
        split=spec.split,
        revision=revision,
        streaming=True,
    )
    stream = stream.shuffle(
        seed=_stable_int(seed, spec.id, "shuffle") % (2**31 - 1),
        buffer_size=spec.shuffle_buffer,
    )
    return AdapterResult(
        rows=(dict(row) for row in stream),
        resolved_revision=revision,
        source_reference=f"https://huggingface.co/datasets/{spec.dataset}/tree/{revision}",
    )


def _iter_local_jsonl(spec: BenchmarkSourceSpec) -> AdapterResult:
    assert spec.path_env
    configured = os.environ.get(spec.path_env)
    if not configured:
        if spec.required:
            raise RuntimeError(f"required source {spec.id} needs environment variable {spec.path_env}")
        return AdapterResult(rows=(), resolved_revision="missing", source_reference=spec.path_env)
    path = Path(configured)
    if not path.is_file():
        raise FileNotFoundError(path)

    def rows() -> Iterator[dict[str, Any]]:
        with path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                source = line.strip()
                if not source:
                    continue
                try:
                    row = json.loads(source)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{path}:{line_number}: invalid JSON") from exc
                if not isinstance(row, dict):
                    raise ValueError(f"{path}:{line_number}: row must be an object")
                yield row

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return AdapterResult(
        rows=rows(),
        resolved_revision=digest.hexdigest(),
        source_reference=f"environment variable {spec.path_env}",
    )


def _learner_text(node: ElementTree.Element) -> str:
    parts: list[str] = []
    if node.text:
        parts.append(node.text)
    for child in node:
        tag = child.tag.rsplit("}", 1)[-1].casefold()
        if tag != "c":
            parts.append(_learner_text(child))
        if child.tail:
            parts.append(child.tail)
    return "".join(parts)


def _iter_fce_xml(spec: BenchmarkSourceSpec) -> AdapterResult:
    assert spec.path_env
    configured = os.environ.get(spec.path_env)
    if not configured:
        if spec.required:
            raise RuntimeError(f"required source {spec.id} needs environment variable {spec.path_env}")
        return AdapterResult(rows=(), resolved_revision="missing", source_reference=spec.path_env)
    root = Path(configured)
    if not root.exists():
        raise FileNotFoundError(root)
    xml_paths = sorted(root.rglob("*.xml"))
    if not xml_paths:
        raise ValueError(f"{root}: no FCE XML files found")

    def rows() -> Iterator[dict[str, Any]]:
        for path in xml_paths:
            document = ElementTree.parse(path).getroot()
            relative = path.relative_to(root).as_posix()
            head = document.find(".//head")
            sortkey = (head.attrib.get("sortkey") if head is not None else None) or relative
            language = document.findtext(".//candidate/personnel/language") or "unknown"
            age = document.findtext(".//candidate/personnel/age")
            score = document.findtext(".//candidate/score")
            for answer in document.findall(".//answer1") + document.findall(".//answer2"):
                coded = answer.find("coded_answer")
                if coded is None:
                    continue
                answer_tag = answer.tag.rsplit("}", 1)[-1]
                text = _canonical_space(_learner_text(coded))
                if not text:
                    continue
                yield {
                    "id": f"{relative}#{answer_tag}",
                    "text": text,
                    "metadata": {
                        "author_id": sortkey,
                        "native_language": language,
                        "age": age,
                        "score": score,
                        "question_number": answer.findtext("question_number"),
                        "exam_score": answer.findtext("exam_score"),
                        "license": spec.fixed_licence or "FCE licensed research use",
                    },
                }

    digest = hashlib.sha256()
    for path in xml_paths:
        digest.update(path.relative_to(root).as_posix().encode("utf-8"))
        digest.update(path.read_bytes())
    return AdapterResult(
        rows=rows(),
        resolved_revision=digest.hexdigest(),
        source_reference=f"environment variable {spec.path_env}",
    )


def _adapter(spec: BenchmarkSourceSpec, seed: int) -> AdapterResult:
    if spec.adapter == "huggingface":
        return _iter_huggingface(spec, seed)
    if spec.adapter == "local_jsonl":
        return _iter_local_jsonl(spec)
    if spec.adapter == "fce_xml":
        return _iter_fce_xml(spec)
    raise ValueError(f"unknown adapter {spec.adapter}")
