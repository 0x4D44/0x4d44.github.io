import json
from collections import defaultdict

import pytest

from scribeprint_model.import_m4 import generator_family, import_m4


def _write(path, model: str, *, mutate_human: bool = False) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for index in range(100):
            human = (
                f"Human source {index} records a laboratory observation in uneven detail. "
                "The researcher notes a failed run, a changed instrument setting, and a result "
                "that did not fit the original expectation. This sentence supplies enough words "
                "for the importer while preserving a recognisably authored account."
            )
            if mutate_human and index == 7:
                human += " Conflicting copy."
            machine = (
                f"This generated abstract {index} presents a comprehensive analysis of the topic. "
                f"The {model} system outlines the methodology, highlights the principal findings, "
                "and concludes that the proposed framework offers a robust foundation for future work. "
                "Furthermore, the results demonstrate the importance of a systematic approach."
            )
            handle.write(json.dumps({
                "prompt": f"Write abstract {index}",
                "human_text": human,
                "machine_text": machine,
                "model": model,
                "source": "arxiv",
                "source_ID": f"paper-{index}",
            }) + "\n")


def test_import_deduplicates_humans_and_holds_out_generator(tmp_path):
    chatgpt = tmp_path / "arxiv_chatGPT.jsonl"
    cohere = tmp_path / "arxiv_cohere.jsonl"
    _write(chatgpt, "gpt-3.5-turbo")
    _write(cohere, "command-xlarge-nightly")

    examples, manifest = import_m4(
        [chatgpt, cohere],
        dataset_revision="a" * 40,
        min_words=20,
        holdout_generator="gpt-3.5-turbo",
    )
    by_source = defaultdict(list)
    for example in examples:
        by_source[example.source_id].append(example)

    assert manifest["leakage"]["ok"]
    assert manifest["protocol"] == "source-disjoint-generator-holdout"
    assert len([row for row in examples if row.label == "human"]) == len(by_source)
    for rows in by_source.values():
        assert len({row.split for row in rows}) == 1
        models = {row.generator_model for row in rows if row.label == "ai"}
        if rows[0].split == "test":
            assert models == {"gpt-3.5-turbo"}
        else:
            assert models == {"command-xlarge-nightly"}


def test_import_rejects_conflicting_human_copies(tmp_path):
    first = tmp_path / "one.jsonl"
    second = tmp_path / "two.jsonl"
    _write(first, "gpt-3.5-turbo")
    _write(second, "command-xlarge-nightly", mutate_human=True)
    with pytest.raises(ValueError, match="conflicting human_text"):
        import_m4([first, second], dataset_revision="b" * 40, min_words=20)


def test_generator_family_normalisation():
    assert generator_family("gpt-3.5-turbo") == "openai-gpt-3.5"
    assert generator_family("text-davinci-003") == "openai-davinci"
    assert generator_family("google/flan-t5-xxl") == "google-flan-t5"
    assert generator_family("command-xlarge-nightly") == "cohere"


def test_import_accepts_historical_bloomz_schema(tmp_path):
    path = tmp_path / "arxiv_bloomz.jsonl"
    with path.open("w", encoding="utf-8") as handle:
        for index in range(120):
            handle.write(json.dumps({
                "prompt": f"Write abstract {index}",
                "abstract": (
                    f"Human abstract {index} contains irregular observations and enough words "
                    "to pass the deliberately small fixture threshold."
                ),
                "machine_abstract": (
                    f"Generated abstract {index} presents systematic conclusions and enough words "
                    "to pass the deliberately small fixture threshold."
                ),
                "machine_text": "PROMPT TEXT THAT MUST NOT BECOME THE TRAINING EXAMPLE",
                "model": "bigscience/bloomz",
                "source": "",
                "source_id": 7000 + index,
            }) + "\n")
    examples, _ = import_m4([path], dataset_revision="c" * 40, min_words=8)
    ai = next(example for example in examples if example.label == "ai")
    assert ai.domain == "arxiv"
    assert "PROMPT TEXT" not in ai.text
    assert ai.generator_family == "bigscience-bloomz"


def test_exact_duplicate_generations_remain_in_one_split(tmp_path):
    path = tmp_path / "arxiv_flant5.jsonl"
    with path.open("w", encoding="utf-8") as handle:
        for index in range(140):
            machine = (
                "Repeated generated passage with enough words for the threshold and a duplicated output."
                if index in {3, 97}
                else f"Generated passage {index} with enough words for the threshold and a unique output."
            )
            handle.write(json.dumps({
                "prompt": f"Title {index}",
                "human_text": (
                    f"Human passage {index} contains enough words for the threshold and remains "
                    "unique across source records."
                ),
                "machine_text": machine,
                "model": "flan-t5",
                "source": "",
                "source_ID": index,
            }) + "\n")
    examples, manifest = import_m4(
        [path], dataset_revision="d" * 40, min_words=8
    )
    rows = [
        row for row in examples
        if row.source_id in {"m4:arxiv:3", "m4:arxiv:97"}
    ]
    assert len({row.split for row in rows}) == 1
    assert manifest["leakage"]["ok"]
