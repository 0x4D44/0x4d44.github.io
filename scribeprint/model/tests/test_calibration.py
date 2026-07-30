import numpy as np

from scribeprint_model.calibration import (
    fit_temperature,
    logits_to_ai_probability,
    multiclass_negative_log_likelihood,
)


def test_temperature_scaling_reduces_nll_for_overconfident_logits():
    labels = np.asarray(([0] * 10) + ([1] * 10), dtype=int)
    logits = []
    for index, label in enumerate(labels):
        correct = index not in {2, 7, 12, 17}
        predicted = label if correct else 1 - label
        logits.append([6.0, -6.0] if predicted == 0 else [-6.0, 6.0])
    logits = np.asarray(logits)

    temperature = fit_temperature(logits, labels)
    assert temperature > 1.0
    assert (
        multiclass_negative_log_likelihood(logits, labels, temperature)
        < multiclass_negative_log_likelihood(logits, labels)
    )


def test_logits_to_ai_probability_is_stable_and_monotonic():
    logits = np.asarray([
        [1000.0, -1000.0],
        [0.0, 0.0],
        [-1000.0, 1000.0],
    ])
    scores = logits_to_ai_probability(logits, temperature=2.0)
    assert np.isfinite(scores).all()
    assert scores[0] < scores[1] < scores[2]
    assert scores[1] == 0.5


def test_tiny_temperature_fit_returns_identity():
    logits = np.asarray([[2.0, -2.0], [-2.0, 2.0]])
    assert fit_temperature(logits, [0, 1]) == 1.0
