from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "darwin-machine/rust/crates/darwin-core/src/lib.rs"


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    source = path.read_text(encoding="utf-8")
    old_count = source.count(old)
    new_count = source.count(new) if new else 0
    if old_count == 1:
        path.write_text(source.replace(old, new), encoding="utf-8")
        print(f"Applied {label}.")
    elif old_count == 0 and new and new_count == 1:
        print(f"{label} already materialised.")
    elif old_count == 0 and not new:
        print(f"{label} already materialised.")
    else:
        raise SystemExit(
            f"Expected one {label} site or its corrected form in {path}; "
            f"old={old_count} new={new_count}"
        )


replacements = [
    (
        "pub const PHYSICS_VERSION: u16 = 1;",
        "pub const PHYSICS_VERSION: u16 = 2;",
        "intervention-physics version bump",
    ),
    (
        '''        self.commit_moves(moves);
        self.commit_births(births);
        self.update = self.update.wrapping_add(1);''',
        '''        self.commit_moves(moves);
        self.commit_births(births);
        // Keep the checkpoint invariant true at every externally observable
        // update, not only when the statistics sampler happens to run.
        self.prune_genotypes();
        self.update = self.update.wrapping_add(1);''',
        "per-update genotype-history bound",
    ),
    (
        '''    pub fn apply_intervention(&mut self, kind: &str, value: u32) -> Result<(), String> {
        let id = self.next_intervention_id;
        self.next_intervention_id += 1;
        match kind {''',
        '''    pub fn apply_intervention(&mut self, kind: &str, value: u32) -> Result<(), String> {
        let id = self.next_intervention_id;
        match kind {''',
        "transactional intervention preamble",
    ),
    (
        '''        self.interventions.push(InterventionRecord {
            id,''',
        '''        // The same ID is both recorded and fed into deterministic
        // intervention randomness. Rejected commands consume no state.
        self.next_intervention_id += 1;
        self.interventions.push(InterventionRecord {
            id,''',
        "successful intervention commit",
    ),
    (
        '''        assert!(world.genotypes.len() > world.config.max_genotypes as usize);
        world.prune_genotypes();
        assert!(world.genotypes.len() <= world.config.max_genotypes as usize);''',
        '''        assert!(world.genotypes.len() > world.config.max_genotypes as usize);
        world.run_one_update();
        assert!(world.genotypes.len() <= world.config.max_genotypes as usize);''',
        "observable-update genotype pruning test",
    ),
    (
        '''        assert!(world.retired_genotypes > 0);
        world.validate_loaded().unwrap();
    }

    #[test]
    fn checkpoints_survive_asset_only_build_changes_but_not_semantic_changes() {''',
        '''        assert!(world.retired_genotypes > 0);
        world.validate_loaded().unwrap();
        let checkpoint = world.export_checkpoint().unwrap();
        let restored = World::import_checkpoint(&checkpoint).unwrap();
        assert_eq!(restored.checksum_hex(), world.checksum_hex());
    }

    #[test]
    fn checkpoints_survive_asset_only_build_changes_but_not_semantic_changes() {''',
        "between-sample checkpoint round-trip test",
    ),
    (
        '''    #[test]
    fn checksum_covers_future_affecting_state() {''',
        '''    #[test]
    fn rejected_interventions_do_not_perturb_future_history() {
        let mut world = World::from_preset("bottleneck", 23).unwrap();
        let before = world.checksum_hex();
        let next_id = world.next_intervention_id;
        assert!(world.apply_intervention("unknown", 1).is_err());
        assert!(world.apply_intervention("mutation", 100_001).is_err());
        assert_eq!(world.next_intervention_id, next_id);
        assert!(world.interventions.is_empty());
        assert_eq!(world.checksum_hex(), before);
    }

    #[test]
    fn successful_intervention_records_the_randomness_identity_it_used() {
        let mut world = World::from_preset("bottleneck", 29).unwrap();
        let id = world.next_intervention_id;
        world.apply_intervention("bottleneck", 8).unwrap();
        assert_eq!(world.interventions.last().unwrap().id, id);
        assert_eq!(world.next_intervention_id, id + 1);
    }

    #[test]
    fn checksum_covers_future_affecting_state() {''',
        "intervention transaction regression tests",
    ),
]

for old, new, label in replacements:
    replace_once(CORE, old, new, label)

science = ROOT / "darwin-machine/SCIENCE.md"
replace_once(
    science,
    "6. Birth and move intents resolve at update end. Conflict draws use stable identities, not vector order.",
    "6. Birth and move intents resolve at update end. Conflict and intervention draws use the exact stable identity recorded in the replay log, not vector order or a pre-incremented counter.",
    "intervention identity scientific contract",
)

print("Deterministic state-invariant corrections are materialised.")
