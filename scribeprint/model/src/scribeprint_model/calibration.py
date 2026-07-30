from __future__ import annotations

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import logsumexp
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression


class IdentityCalibrator:
    def fit(self, scores, labels):
        return self

    def predict(self, scores):
        return np.clip(np.asarray(scores, dtype=float), 0, 1)


class SigmoidCalibrator:
    """Platt-style scalar calibration fitted only on the frozen calibration split."""

    def __init__(self):
        self.model = LogisticRegression(C=1.0, solver="lbfgs")

    def fit(self, scores, labels):
        values = np.asarray(scores, dtype=float).reshape(-1, 1)
        self.model.fit(values, np.asarray(labels, dtype=int))
        return self

    def predict(self, scores):
        values = np.asarray(scores, dtype=float).reshape(-1, 1)
        return self.model.predict_proba(values)[:, 1]


class IsotonicCalibrator:
    def __init__(self):
        self.model = IsotonicRegression(out_of_bounds="clip")

    def fit(self, scores, labels):
        self.model.fit(np.asarray(scores, dtype=float), np.asarray(labels, dtype=int))
        return self

    def predict(self, scores):
        return np.clip(self.model.predict(np.asarray(scores, dtype=float)), 0, 1)


def fit_calibrator(scores, labels, method: str = "sigmoid"):
    labels = np.asarray(labels, dtype=int)
    if len(labels) < 20 or len(np.unique(labels)) < 2:
        return IdentityCalibrator().fit(scores, labels)
    if method == "identity":
        return IdentityCalibrator().fit(scores, labels)
    if method == "isotonic":
        # Isotonic needs substantially more data than a smoke run; callers
        # should reserve it for large calibration sets.
        if len(labels) < 200:
            return SigmoidCalibrator().fit(scores, labels)
        return IsotonicCalibrator().fit(scores, labels)
    if method == "sigmoid":
        return SigmoidCalibrator().fit(scores, labels)
    raise ValueError(f"unknown calibration method {method!r}")


def _validate_logits(logits, labels=None) -> tuple[np.ndarray, np.ndarray | None]:
    values = np.asarray(logits, dtype=np.float64)
    if values.ndim != 2 or values.shape[1] != 2:
        raise ValueError("binary transformer logits must have shape (rows, 2)")
    if not np.isfinite(values).all():
        raise ValueError("logits must be finite")
    if labels is None:
        return values, None
    targets = np.asarray(labels, dtype=np.int64)
    if targets.ndim != 1 or len(targets) != len(values):
        raise ValueError("labels must be a one-dimensional array matching logits")
    if not np.isin(targets, [0, 1]).all():
        raise ValueError("labels must be binary 0/1")
    return values, targets


def logits_to_ai_probability(logits, temperature: float = 1.0) -> np.ndarray:
    """Convert two-class logits to P(AI), optionally applying temperature scaling."""

    values, _ = _validate_logits(logits)
    temperature = float(temperature)
    if not np.isfinite(temperature) or temperature <= 0:
        raise ValueError("temperature must be finite and greater than zero")
    scaled = values / temperature
    log_probabilities = scaled - logsumexp(scaled, axis=1, keepdims=True)
    return np.exp(log_probabilities[:, 1])


def multiclass_negative_log_likelihood(logits, labels, temperature: float = 1.0) -> float:
    """Mean NLL for two-class logits, used to validate temperature fitting."""

    values, targets = _validate_logits(logits, labels)
    temperature = float(temperature)
    if not np.isfinite(temperature) or temperature <= 0:
        raise ValueError("temperature must be finite and greater than zero")
    scaled = values / temperature
    log_probabilities = scaled - logsumexp(scaled, axis=1, keepdims=True)
    return float(-np.mean(log_probabilities[np.arange(len(targets)), targets]))


def fit_temperature(logits, labels, *, minimum_rows: int = 20) -> float:
    """Fit one positive temperature on a reserved calibration split.

    Optimising log-temperature keeps the parameter positive and avoids the
    common mistake of choosing calibration hyperparameters on the test set. For
    tiny plumbing fixtures, or a single-class split, identity temperature is
    returned rather than pretending calibration was possible.
    """

    values, targets = _validate_logits(logits, labels)
    if len(targets) < minimum_rows or len(np.unique(targets)) < 2:
        return 1.0

    def objective(log_temperature: float) -> float:
        return multiclass_negative_log_likelihood(values, targets, float(np.exp(log_temperature)))

    result = minimize_scalar(
        objective,
        bounds=(float(np.log(0.05)), float(np.log(20.0))),
        method="bounded",
        options={"xatol": 1e-5},
    )
    if not result.success or not np.isfinite(result.x):
        return 1.0
    return float(np.clip(np.exp(result.x), 0.05, 20.0))
