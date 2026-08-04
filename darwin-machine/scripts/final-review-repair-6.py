from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "darwin-machine/rust/crates/darwin-core/src/lib.rs"


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    source = path.read_text(encoding="utf-8")
    old_count = source.count(old)
    new_count = source.count(new)
    if old_count == 1:
        path.write_text(source.replace(old, new), encoding="utf-8")
        print(f"Applied {label}.")
    elif old_count == 0 and new_count == 1:
        print(f"{label} already materialised.")
    else:
        raise SystemExit(
            f"Expected one {label} site or its corrected form in {path}; "
            f"old={old_count} new={new_count}"
        )


replace_once(
    CORE,
    '''        encode(23, 0),
        encode(23, 0), // redundant head reset
        encode(1, 1),
        encode(0, 1),
        encode(0, 0),
        encode(24, 2),
        encode(25, 2),''',
    '''        encode(23, 0),
        encode(23, 0), // redundant head reset
        encode(1, 1),
        encode(0, 1),
        encode(0, 0),
        // Unlike the 16-byte ancestor, this intentionally bloated genome
        // cannot fund 64 copy passes from one energy charge. Foraging inside
        // the loop makes it genuinely viable while remaining conspicuously
        // inefficient and evolutionarily improvable.
        encode(29, 0),
        encode(24, 2),
        encode(25, 2),''',
    "in-loop foraging for the clumsy ancestor",
)

replace_once(
    CORE,
    '''        assert!(result.divided, "clumsy ancestor never divided: {result:?}");
        assert!(
            result.child_divided,
            "clumsy child did not divide: {result:?}"
        );''',
    '''        assert!(result.divided, "clumsy ancestor never divided: {result:?}");
        assert!(
            result.first_division_instructions.is_some_and(|count| count < 2_000),
            "clumsy ancestor divided outside its intended energy regime: {result:?}"
        );
        assert!(
            result.child_divided,
            "clumsy child did not divide: {result:?}"
        );''',
    "clumsy-ancestor energy-regime oracle",
)

replace_once(
    ROOT / "darwin-machine/SCIENCE.md",
    "The public release supplies a viable ancestor. It can test how heredity, mutation, finite resources, spatial contention and death alter descendant populations. A takeover is evidence only about this versioned substrate and configuration.",
    "The public release supplies viable ancestors. It can test how heredity, mutation, finite resources, spatial contention and death alter descendant populations. A takeover is evidence only about this versioned substrate and configuration.\n\nThe 64-byte clumsy ancestor is padded and redundant, with deliberately repeated foraging inside its copy loop. That foraging is necessary to fund a 64-byte exact copy under the published energy law; it also leaves abundant room for deletions and shorter replication times.",
    "clumsy-ancestor scientific disclosure",
)

print("The public clumsy ancestor now has a viable, disclosed energy budget.")
