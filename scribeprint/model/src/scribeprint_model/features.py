from __future__ import annotations

import math
import re
from collections import Counter
from typing import Sequence

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.base import BaseEstimator, TransformerMixin

_WORD = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)?")
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
_TRANSITIONS = {
    "additionally", "consequently", "furthermore", "however", "moreover",
    "nevertheless", "nonetheless", "overall", "therefore", "thus",
}
_HEDGES = {"arguably", "generally", "likely", "may", "might", "perhaps", "potentially", "typically"}


def _safe_std(values: Sequence[float]) -> float:
    return float(np.std(values)) if len(values) > 1 else 0.0


def stylometric_vector(text: str) -> list[float]:
    words = _WORD.findall(text.casefold())
    sentences = [part.strip() for part in _SENTENCE.split(text) if part.strip()]
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
    sentence_lengths = [len(_WORD.findall(sentence)) for sentence in sentences] or [0]
    paragraph_lengths = [len(_WORD.findall(paragraph)) for paragraph in paragraphs] or [0]
    counts = Counter(words)
    unique_ratio = len(counts) / max(1, len(words))
    repeated_ratio = sum(count - 1 for count in counts.values() if count > 1) / max(1, len(words))
    punctuation_total = sum(text.count(mark) for mark in ",;:!?—-()[]\"")
    digit_tokens = sum(bool(re.search(r"\d", word)) for word in words)
    uppercase_tokens = sum(token.isupper() and len(token) > 1 for token in re.findall(r"\b\w+\b", text))
    transition_count = sum(word in _TRANSITIONS for word in words)
    hedge_count = sum(word in _HEDGES for word in words)
    contractions = len(re.findall(r"\b\w+(?:n't|'re|'ve|'ll|'d|'m|'s)\b", text.casefold()))
    first_person = sum(word in {"i", "me", "my", "mine", "we", "our", "ours", "us"} for word in words)
    quotes = text.count('"') + text.count("“") + text.count("”") + text.count("‘") + text.count("’")
    citations = len(re.findall(r"\[[0-9,;\s-]+\]|\([A-Z][A-Za-z-]+,?\s+\d{4}[a-z]?\)", text))
    headings = len(re.findall(r"(?m)^\s*(?:#{1,6}\s+|[A-Z][A-Z0-9 :–—-]{3,}$)", text))
    list_lines = len(re.findall(r"(?m)^\s*(?:[-*•]|\d+[.)])\s+", text))
    opening_words = [(_WORD.findall(sentence.casefold()) or [""])[0] for sentence in sentences]
    opening_diversity = len(set(opening_words)) / max(1, len(opening_words))

    scale = max(1, len(words))
    return [
        math.log1p(len(words)),
        float(np.mean(sentence_lengths)),
        _safe_std(sentence_lengths),
        float(np.mean(paragraph_lengths)),
        _safe_std(paragraph_lengths),
        unique_ratio,
        repeated_ratio,
        punctuation_total / scale,
        digit_tokens / scale,
        uppercase_tokens / scale,
        transition_count / scale,
        hedge_count / scale,
        contractions / scale,
        first_person / scale,
        quotes / scale,
        citations / max(1, len(sentences)),
        headings / max(1, len(paragraphs)),
        list_lines / max(1, len(paragraphs)),
        opening_diversity,
        text.count("\n") / max(1, len(sentences)),
    ]


class StylometricTransformer(BaseEstimator, TransformerMixin):
    """Small interpretable feature block for the Phase-0 baseline."""

    def fit(self, X, y=None):  # noqa: N803 - sklearn API
        return self

    def transform(self, X):  # noqa: N803 - sklearn API
        return csr_matrix(np.asarray([stylometric_vector(str(text)) for text in X], dtype=np.float64))
