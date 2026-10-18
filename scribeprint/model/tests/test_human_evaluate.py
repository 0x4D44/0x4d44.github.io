import math

from scribeprint_model.human_evaluate import one_sided_binomial_upper


def test_zero_false_positive_bound_matches_exact_binomial():
    observed = one_sided_binomial_upper(0, 10_000, 0.95)
    expected = 1 - 0.05 ** (1 / 10_000)
    assert math.isclose(observed, expected, rel_tol=1e-10)
    assert observed < 0.0003


def test_bound_grows_with_false_positives():
    assert one_sided_binomial_upper(2, 10_000) > one_sided_binomial_upper(0, 10_000)
