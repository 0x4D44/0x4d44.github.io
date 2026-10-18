import json
from pathlib import Path

import pytest

from scribeprint_model.human_benchmark import (
    BenchmarkProfile,
    BenchmarkRecord,
    BenchmarkSourceSpec,
    _candidate_from_row,
    _iter_fce_xml,
    audit_records,
    build_benchmark,
    near_duplicate_pairs,
)
from scribeprint_model.human_sources import _prepare_huggingface_stream


def prose(topic: str, index: int, words: int = 140) -> str:
    vocabulary = [
        topic,
        "observation",
        "workshop",
        "weather",
        "memory",
        "practice",
        "detail",
        "question",
        "example",
        "decision",
        "neighbour",
        "result",
        "conversation",
        "revision",
        "evidence",
    ]
    tokens = []
    for position in range(words):
        token = vocabulary[(position * (index + 3) + index) % len(vocabulary)]
        tokens.append(f"{token}{position % 11}" if position % 17 == 0 else token)
    return " ".join(tokens) + "."


def local_profile(path_env: str = "TEST_HUMAN_ROWS") -> BenchmarkProfile:
    return BenchmarkProfile.model_validate(
        {
            "benchmark_id": "fixture-human-benchmark",
            "description": "fixture",
            "pre_llm_cutoff": "2021-12-31T23:59:59Z",
            "minimum_total": 4,
            "near_duplicate_threshold": 0.92,
            "required_domains": {"creative": 4},
            "production_required_writer_populations": {"native_student": 1},
            "sources": [
                {
                    "id": "fixture",
                    "adapter": "local_jsonl",
                    "dataset": "fixture/data",
                    "path_env": path_env,
                    "domain": "creative",
                    "writer_population": "published_general",
                    "target": 4,
                    "max_scan": 10,
                    "oversample": 2,
                    "text_field": "text",
                    "id_field": "id",
                    "date_field": "date",
                    "author_fields": ["author"],
                    "licence_field": "licence",
                    "url_field": "url",
                    "stratum_field": "section",
                    "licence_allow": ["Public Domain"],
                    "max_per_author": 2,
                    "max_per_stratum": 2,
                    "min_words": 100,
                    "max_words": 220,
                    "target_words_min": 120,
                    "target_words_max": 180,
                }
            ],
        }
    )


def write_fixture(path: Path) -> None:
    rows = []
    for index in range(8):
        rows.append(
            {
                "id": f"doc-{index}",
                "text": prose(f"topic{index}", index),
                "date": "2018-05-01",
                "author": f"author-{index // 2}",
                "section": f"section-{index % 4}",
                "licence": "Public Domain",
                "url": f"https://example.test/{index}",
            }
        )
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def test_build_is_deterministic_and_keeps_text_out_of_lock(tmp_path, monkeypatch):
    source = tmp_path / "rows.jsonl"
    write_fixture(source)
    monkeypatch.setenv("TEST_HUMAN_ROWS", str(source))
    profile = local_profile()

    outputs = []
    for run in ("one", "two"):
        output = tmp_path / f"{run}.jsonl"
        result = build_benchmark(
            profile,
            profile_sha256="a" * 64,
            output_path=output,
            manifest_path=tmp_path / f"{run}.manifest.json",
            lock_path=tmp_path / f"{run}.lock.jsonl",
            audit_path=tmp_path / f"{run}.audit.json",
        )
        outputs.append(output.read_text(encoding="utf-8"))
        assert result["manifest"]["rows"] == 4
        assert result["manifest"]["construction_ready"]
        assert not result["manifest"]["production_coverage_ready"]
        lock_text = (tmp_path / f"{run}.lock.jsonl").read_text(encoding="utf-8")
        assert prose("topic0", 0) not in lock_text
        assert '"text"' not in lock_text
    assert outputs[0] == outputs[1]


def test_post_cutoff_and_ai_markers_are_rejected():
    profile = local_profile()
    spec = profile.sources[0]
    base = {
        "id": "row",
        "text": prose("history", 3),
        "author": "writer",
        "section": "one",
        "licence": "Public Domain",
        "url": "https://example.test/row",
    }
    candidate, reason = _candidate_from_row({**base, "date": "2023-01-01"}, spec, profile)
    assert candidate is None and reason == "post_cutoff"

    candidate, reason = _candidate_from_row(
        {
            **base,
            "date": "2018-01-01",
            "text": "As an AI language model, " + prose("history", 4),
        },
        spec,
        profile,
    )
    assert candidate is None and reason == "explicit_ai_marker"


def make_record(identifier: str, text: str) -> BenchmarkRecord:
    return BenchmarkRecord(
        id=identifier,
        text=text,
        source_id=identifier,
        source_dataset="fixture",
        source_revision="deadbeef",
        benchmark_source="fixture",
        source_licence="Public Domain",
        redistributable=True,
        domain="creative",
        writer_population="published_general",
        pre_llm_basis="historical fixture",
        word_count=len(text.split()),
        text_sha256=__import__("hashlib").sha256(
            " ".join(text.split()).casefold().encode()
        ).hexdigest(),
    )


def test_near_duplicate_audit_finds_reworded_copy():
    original = " ".join(f"token{index}" for index in range(240))
    changed = original.replace("token120", "different120").replace("token180", "different180")
    unrelated = " ".join(f"other{index}" for index in range(240))
    pairs = near_duplicate_pairs(
        [make_record("a", original), make_record("b", changed), make_record("c", unrelated)],
        threshold=0.90,
    )
    assert len(pairs) == 1
    assert {pairs[0]["left_id"], pairs[0]["right_id"]} == {"a", "b"}


def test_fce_xml_keeps_learner_form_not_correction(tmp_path, monkeypatch):
    root = tmp_path / "fce"
    root.mkdir()
    (root / "essay.xml").write_text(
        """<learner sortkey="candidate-1"><head><candidate><personnel>
<language>Spanish</language><age>20</age></personnel><score>72</score></candidate>
<text><answer1><question_number>1</question_number><coded_answer><p>I <ns type="RV"><i>goed</i><c>went</c></ns> to the market and wrote a long account of the day. The account contains personal detail, uneven sentences, and several ordinary observations about friends, buses, food, weather, plans, mistakes, and an unexpected delay.</p></coded_answer></answer1></text></head></learner>""",
        encoding="utf-8",
    )
    monkeypatch.setenv("FCE_FIXTURE", str(root))
    spec = BenchmarkSourceSpec.model_validate(
        {
            "id": "fce",
            "adapter": "fce_xml",
            "dataset": "licensed/fce",
            "path_env": "FCE_FIXTURE",
            "domain": "student",
            "writer_population": "learner_english",
            "target": 1,
            "max_scan": 2,
            "historic_pre_llm": True,
            "pre_llm_basis": "released in 2011",
            "fixed_licence": "FCE local research licence",
            "min_words": 20,
            "max_words": 300,
            "target_words_min": 50,
            "target_words_max": 200,
        }
    )
    rows = list(_iter_fce_xml(spec).rows)
    assert len(rows) == 1
    assert "goed" in rows[0]["text"]
    assert "went" not in rows[0]["text"]
    assert rows[0]["metadata"]["native_language"] == "Spanish"


def test_audit_requires_population_supplements():
    profile = local_profile()
    records = [make_record(str(index), prose(f"x{index}", index)) for index in range(4)]
    report = audit_records(records, profile)
    assert report["construction_checks"]["minimum_total"]
    assert report["construction_checks"]["required_domains"]
    assert not report["production_checks"]["writer_population_coverage"]
    assert not report["production_checks"]["production_coverage_ready"]


def test_training_overlap_uses_frozen_text_hash(tmp_path):
    from scribeprint_model.human_benchmark import training_overlap_report

    text = prose("heldout", 9)
    record = make_record("benchmark-row", text)
    lock = [record.lock_row()]
    training = tmp_path / "training.jsonl"
    training.write_text(
        json.dumps({
            "id": "training-row",
            "text": text,
            "label": "human",
            "split": "train",
            "source_id": "unrelated-source-id"
        }) + "\n",
        encoding="utf-8",
    )
    report = training_overlap_report(lock, training)
    assert not report["ok"]
    assert report["exact_text_overlaps"][0]["benchmark_id"] == "benchmark-row"


def test_large_raw_document_is_bounded_deterministically():
    from scribeprint_model.human_benchmark import (
        BenchmarkSourceSpec,
        _bounded_raw_text,
    )

    spec = BenchmarkSourceSpec(
        id="huge",
        dataset="fixture",
        domain="professional",
        writer_population="professional",
        target=1,
        max_scan=1,
        maximum_raw_characters=50_000,
        raw_slice_characters=20_000,
    )
    text = "paragraph line\n\n" * 10_000
    first = _bounded_raw_text(text, "doc-1", spec, 17)
    second = _bounded_raw_text(text, "doc-1", spec, 17)
    assert first == second
    assert len(first) <= 20_000
    assert first.startswith("paragraph")


def test_fce_adapter_uses_head_sortkey_and_redacts_local_path(tmp_path, monkeypatch):
    from scribeprint_model.human_benchmark import BenchmarkSourceSpec, _iter_fce_xml

    xml = """<learner><head sortkey="candidate-007"><candidate><personnel><language>Spanish</language></personnel></candidate></head><text><answer1><coded_answer><p>I <NS type="R"><i>go</i><c>went</c></NS> home yesterday.</p></coded_answer></answer1></text></learner>"""
    (tmp_path / "essay.xml").write_text(xml, encoding="utf-8")
    monkeypatch.setenv("FCE_FIXTURE_DIR", str(tmp_path))
    spec = BenchmarkSourceSpec(
        id="fce",
        adapter="fce_xml",
        dataset="licensed/fce",
        path_env="FCE_FIXTURE_DIR",
        domain="student",
        writer_population="learner_english",
        target=1,
        max_scan=1,
        historic_pre_llm=True,
        pre_llm_basis="fixture",
        fixed_licence="local licence",
    )
    result = _iter_fce_xml(spec)
    row = next(iter(result.rows))
    assert row["metadata"]["author_id"] == "candidate-007"
    assert row["text"] == "I go home yesterday."
    assert str(tmp_path) not in result.source_reference
    assert result.source_reference == "environment variable FCE_FIXTURE_DIR"

def test_huggingface_shards_are_interleaved_before_bounded_scan():
    class FakeShard:
        def __init__(self, index):
            self.index = index
            self.shuffle_args = None

        def shuffle(self, **kwargs):
            self.shuffle_args = kwargs
            return self

    class FakeStream:
        n_shards = 3

        def __init__(self):
            self.shard_args = []
            self.shards = []

        def shard(self, **kwargs):
            self.shard_args.append(kwargs)
            shard = FakeShard(kwargs["index"])
            self.shards.append(shard)
            return shard

    spec = local_profile().sources[0].model_copy(
        update={"interleave_shards": True, "shuffle_buffer": 900}
    )
    stream = FakeStream()
    observed = {}

    def fake_interleave(shards, **kwargs):
        observed["shards"] = shards
        observed["kwargs"] = kwargs
        return "interleaved"

    result = _prepare_huggingface_stream(stream, spec, 17, fake_interleave)

    assert result == "interleaved"
    assert [args["index"] for args in stream.shard_args] == [0, 1, 2]
    assert all(args["num_shards"] == 3 and args["contiguous"] for args in stream.shard_args)
    assert all(shard.shuffle_args["buffer_size"] == 300 for shard in stream.shards)
    assert len({shard.shuffle_args["seed"] for shard in stream.shards}) == 3
    assert observed["kwargs"] == {"stopping_strategy": "first_exhausted"}

