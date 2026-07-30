from __future__ import annotations

import hashlib
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Label = Literal["human", "ai", "mixed"]
Split = Literal["train", "validation", "calibration", "test"]


class SpanLabel(BaseModel):
    """Half-open character span [start, end) with an authorship label."""

    model_config = ConfigDict(extra="forbid")

    start: int = Field(ge=0)
    end: int = Field(gt=0)
    label: Label

    @model_validator(mode="after")
    def validate_bounds(self) -> "SpanLabel":
        if self.end <= self.start:
            raise ValueError("span end must be greater than start")
        return self


class Example(BaseModel):
    """Canonical training row.

    Metadata fields are deliberately explicit because provenance and split
    discipline matter more than squeezing every corpus into two columns.
    """

    model_config = ConfigDict(extra="allow", str_strip_whitespace=True)

    id: str
    text: str = Field(min_length=1)
    label: Label
    split: Split | None = None
    split_group: str | None = None

    source_id: str | None = None
    pair_id: str | None = None
    author_id_hash: str | None = None
    prompt_family: str | None = None

    domain: str = "general"
    subdomain: str | None = None
    language: str = "en"
    writer_population: str | None = None
    created_at: str | None = None

    human_provenance: str | None = None
    licence: str | None = None

    generator_family: str | None = None
    generator_model: str | None = None
    generator_version: str | None = None
    generator_date: str | None = None
    decoding: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    repetition_penalty: float | None = None

    attack: str | None = None
    edit_chain: list[str] = Field(default_factory=list)
    ai_fraction: float | None = Field(default=None, ge=0, le=1)
    spans: list[SpanLabel] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("label", mode="before")
    @classmethod
    def normalize_label(cls, value: Any) -> str:
        if value in (0, False, "0", "human", "real"):
            return "human"
        if value in (1, True, "1", "ai", "generated", "machine", "fake"):
            return "ai"
        if str(value).lower() in {"mixed", "hybrid", "coauthored", "co-authored"}:
            return "mixed"
        return str(value).lower()

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        value = value.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n").strip()
        if not value:
            raise ValueError("text is empty after normalization")
        return value

    @model_validator(mode="after")
    def validate_spans(self) -> "Example":
        for span in self.spans:
            if span.end > len(self.text):
                raise ValueError(f"span {span.start}:{span.end} exceeds text length {len(self.text)}")
        if self.label == "mixed" and self.ai_fraction is None and not self.spans:
            raise ValueError("mixed rows need ai_fraction or span labels")
        return self

    @property
    def binary_label(self) -> int:
        if self.label == "human":
            return 0
        if self.label == "ai":
            return 1
        raise ValueError("mixed rows do not have a single binary label")

    @property
    def group_key(self) -> str:
        # Author-level grouping is strongest when available. RAID-style source_id
        # then keeps a human source and all of its generated mirrors together.
        return (
            self.split_group
            or (f"author:{self.author_id_hash}" if self.author_id_hash else None)
            or (f"source:{self.source_id}" if self.source_id else None)
            or (f"pair:{self.pair_id}" if self.pair_id else None)
            or f"row:{self.id}"
        )

    @property
    def exact_text_hash(self) -> str:
        normalized = re.sub(r"\s+", " ", self.text).strip().casefold()
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def canonical_example(row: dict[str, Any], line_number: int | None = None) -> Example:
    """Map common corpus conventions, including RAID, into :class:`Example`."""

    mapped = dict(row)
    if "text" not in mapped and "generation" in mapped:
        mapped["text"] = mapped["generation"]

    model = str(mapped.get("model", "")).strip()
    if "label" not in mapped:
        mapped["label"] = "human" if model.casefold() in {"human", "real"} else "ai"

    mapped.setdefault("generator_model", mapped.get("generator") or (None if mapped["label"] == "human" else model or None))
    mapped.setdefault("source_id", mapped.get("source"))
    mapped.setdefault("pair_id", mapped.get("source_id") or mapped.get("source"))
    mapped.setdefault("domain", mapped.get("genre") or "general")
    mapped.setdefault("attack", mapped.get("attack"))
    mapped.setdefault("decoding", mapped.get("decoding"))

    if not mapped.get("id"):
        basis = f"{mapped.get('source_id','')}\0{mapped.get('generator_model','')}\0{mapped.get('text','')}"
        mapped["id"] = hashlib.sha256(basis.encode("utf-8")).hexdigest()[:24]

    try:
        return Example.model_validate(mapped)
    except Exception as exc:  # pragma: no cover - message wrapper
        where = f" at input row {line_number}" if line_number is not None else ""
        raise ValueError(f"invalid Scribeprint example{where}: {exc}") from exc
