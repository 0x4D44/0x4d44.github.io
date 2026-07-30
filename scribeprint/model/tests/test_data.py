from scribeprint_model.data import assign_splits, leakage_report
from scribeprint_model.schema import Example


def test_matched_pair_stays_in_one_split():
    rows = [
        Example(id="h", text="Human text.", label="human", source_id="same"),
        Example(id="a", text="AI text.", label="ai", source_id="same", generator_model="x"),
    ]
    assigned = assign_splits(rows, seed=7)
    assert assigned[0].split == assigned[1].split
    assert leakage_report(assigned)["ok"]


def test_exact_text_across_splits_is_leakage():
    rows = [
        Example(id="one", text="The same document.", label="human", split="train"),
        Example(id="two", text="  the SAME   document. ", label="human", split="test"),
    ]
    report = leakage_report(rows)
    assert not report["ok"]
    assert report["counts"]["exact_text_hash"] == 1


def test_connected_components_bridge_author_source_and_mirror():
    rows = [
        Example(
            id="human-one", text="Human one.", label="human",
            author_id_hash="writer", source_id="source-a",
        ),
        Example(
            id="mirror-one", text="Mirror one.", label="ai",
            source_id="source-a", generator_model="x",
        ),
        Example(
            id="human-two", text="Human two.", label="human",
            author_id_hash="writer", source_id="source-b",
        ),
    ]
    assigned = assign_splits(rows, seed=91)
    assert len({row.split for row in assigned}) == 1
