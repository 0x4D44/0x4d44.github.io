from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "darwin-machine/rust/crates/darwin-core/src/lib.rs"


def replace_once(old: str, new: str, label: str) -> None:
    source = CORE.read_text(encoding="utf-8")
    old_count = source.count(old)
    new_count = source.count(new)
    if old_count == 1:
        CORE.write_text(source.replace(old, new), encoding="utf-8")
        print(f"Applied {label}.")
    elif old_count == 0 and new_count == 1:
        print(f"{label} already materialised.")
    else:
        raise SystemExit(
            f"Expected one {label} site or its corrected form; "
            f"old={old_count} new={new_count}"
        )


replace_once(
    '''    while world.instructions < max_instructions {
        let before_pop = world.population();
        world.run_one_update();
        if first.is_none() && world.population() > before_pop {''',
    '''    while world.instructions < max_instructions {
        let before_pop = world.population();
        world.run_one_update();
        // Extinction is a terminal assay result. Without this guard the
        // instruction counter can no longer advance and a dead mutant loops
        // forever, exactly the common case in neighbourhood and random search.
        if world.population() == 0 {
            break;
        }
        if first.is_none() && world.population() > before_pop {''',
    "extinct-assay termination",
)

replace_once(
    '''    #[test]
    fn arbitrary_genomes_do_not_panic() {''',
    '''    #[test]
    fn extinct_viability_assays_terminate() {
        let result = assess_viability(&[0], 100_000);
        assert!(!result.divided);
        assert!(!result.child_divided);
        assert_eq!(result.first_division_instructions, None);
    }

    #[test]
    fn arbitrary_genomes_do_not_panic() {''',
    "extinct-assay regression test",
)

print("Extinct viability assays now terminate deterministically.")
