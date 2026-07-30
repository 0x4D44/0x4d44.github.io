from scribeprint_model.schema import Example, canonical_example


def test_raid_row_maps_to_canonical_ai_example():
    row = {
        "id": "raid-1",
        "generation": "Generated prose for a benchmark.",
        "model": "model-family-x",
        "source_id": "source-9",
        "domain": "news",
        "attack": "none",
    }
    example = canonical_example(row)
    assert example.label == "ai"
    assert example.generator_model == "model-family-x"
    assert example.pair_id == "source-9"
    assert example.group_key == "source:source-9"


def test_mixed_example_requires_fraction_or_spans():
    try:
        Example(id="bad", text="Mixed text", label="mixed")
    except Exception as exc:
        assert "ai_fraction or span labels" in str(exc)
    else:
        raise AssertionError("mixed row should have failed validation")
