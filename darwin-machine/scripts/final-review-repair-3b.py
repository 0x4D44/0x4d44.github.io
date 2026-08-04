from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


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


core = ROOT / "darwin-machine/rust/crates/darwin-core/src/lib.rs"
core_replacements = [
    (
        '''pub const MAX_IMPORT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_WORLD_CELLS: usize = 256 * 256;''',
        '''pub const MAX_IMPORT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_STATS_SAMPLES_HARD: u32 = 10_000;
pub const MAX_FOSSILS_HARD: u32 = 4_096;
pub const MAX_INTERVENTIONS_HARD: usize = 10_000;
pub const MAX_WORLD_CELLS: usize = 256 * 256;''',
        "hard history limits",
    ),
    (
        '''        for rate in [
            self.mutation.substitution_ppm,
            self.mutation.insertion_ppm,
            self.mutation.deletion_ppm,
        ] {
            if rate > 1_000_000 {
                return Err("mutation rates are expressed in parts per million".into());
            }
        }
        Ok(())''',
        '''        for rate in [
            self.mutation.substitution_ppm,
            self.mutation.insertion_ppm,
            self.mutation.deletion_ppm,
        ] {
            if rate > 1_000_000 {
                return Err("mutation rates are expressed in parts per million".into());
            }
        }
        if self.max_samples > MAX_STATS_SAMPLES_HARD || self.max_fossils > MAX_FOSSILS_HARD {
            return Err("history limits exceed the supported safety caps".into());
        }
        Ok(())''',
        "configuration history caps",
    ),
    (
        '''    pub fn new(config: WorldConfig, seed: u64, preset_id: &str) -> Result<Self, String> {
        config.validate()?;''',
        '''    pub fn new(config: WorldConfig, seed: u64, preset_id: &str) -> Result<Self, String> {
        config.validate()?;
        if !valid_identifier(preset_id, 64) {
            return Err("preset identifier is invalid".into());
        }''',
        "new-world preset identifier boundary",
    ),
    (
        '''    pub fn apply_intervention(&mut self, kind: &str, value: u32) -> Result<(), String> {
        let id = self.next_intervention_id;''',
        '''    pub fn apply_intervention(&mut self, kind: &str, value: u32) -> Result<(), String> {
        if self.interventions.len() >= MAX_INTERVENTIONS_HARD {
            return Err("intervention history has reached its safety cap".into());
        }
        if self.next_intervention_id == u64::MAX {
            return Err("intervention identifier space is exhausted".into());
        }
        let id = self.next_intervention_id;''',
        "bounded intervention history",
    ),
    (
        '''        if self.build_id.len() > 128 || !self.build_id.starts_with("darwin-") {
            return Err("checkpoint build provenance is invalid".into());
        }
        let expected_cells''',
        '''        if self.build_id.len() > 128 || !self.build_id.starts_with("darwin-") {
            return Err("checkpoint build provenance is invalid".into());
        }
        if !valid_identifier(&self.preset_id, 64) {
            return Err("checkpoint preset identifier is invalid".into());
        }
        if self.next_birth_id == u64::MAX
            || self.next_lineage_id == u64::MAX
            || self.next_intervention_id == u64::MAX
        {
            return Err("checkpoint identifier space is exhausted".into());
        }
        let expected_cells''',
        "checkpoint identifier boundaries",
    ),
    (
        '''            || self.stats.len() > self.config.max_samples as usize
            || self.interventions.len() > 100_000''',
        '''            || self.stats.len() > self.config.max_samples as usize
            || self.interventions.len() > MAX_INTERVENTIONS_HARD''',
        "checkpoint hard intervention cap",
    ),
    (
        '''                || genotype.active_count != active_by_genotype[index]
                || self.genotype_lookup.get(&genotype.bytes) != Some(&genotype.id)''',
        '''                || genotype.hash != hash_genome(&genotype.bytes)
                || genotype.active_count != active_by_genotype[index]
                || genotype.total_deaths.saturating_add(u64::from(genotype.active_count))
                    != genotype.total_births
                || self.genotype_lookup.get(&genotype.bytes) != Some(&genotype.id)''',
        "genotype identity and accounting validation",
    ),
    (
        '''        if self
            .fossils
            .iter()
            .any(|fossil| fossil.genotype_id as usize >= self.genotypes.len())
            || self
                .last_dominant
                .is_some_and(|id| id as usize >= self.genotypes.len())
        {
            return Err("checkpoint history references a missing genotype".into());
        }
        Ok(())''',
        '''        for fossil in &self.fossils {
            let Some(genotype) = self.genotypes.get(fossil.genotype_id as usize) else {
                return Err("checkpoint history references a missing genotype".into());
            };
            if fossil.update > self.update
                || fossil.lineage_id >= self.next_lineage_id
                || fossil.reason.len() > 128
                || fossil.genome != genotype.bytes
                || u64::from(fossil.active_count) > genotype.total_births
            {
                return Err("checkpoint contains an invalid fossil record".into());
            }
        }
        if self
            .last_dominant
            .is_some_and(|id| id as usize >= self.genotypes.len())
        {
            return Err("checkpoint history references a missing genotype".into());
        }

        let mut previous_sample_update = 0u64;
        for (index, sample) in self.stats.iter().enumerate() {
            if sample.update > self.update
                || sample.instructions > self.instructions
                || sample.population as usize > expected_cells
                || sample.genotype_count > sample.population
                || sample.lineage_count > sample.population
                || sample.genotype_count > self.config.max_genotypes
                || sample.retired_genotype_count > self.retired_genotypes
                || sample.dominant_share_ppm > 1_000_000
                || sample.median_genome_length > self.config.max_genome
                || sample.median_energy > self.config.max_energy
                || sample
                    .dominant_genotype_id
                    .is_some_and(|id| id as usize >= self.genotypes.len())
                || (index > 0 && sample.update < previous_sample_update)
            {
                return Err("checkpoint contains an invalid statistics sample".into());
            }
            previous_sample_update = sample.update;
        }

        let mut intervention_ids = BTreeSet::new();
        let mut max_intervention_id: Option<u64> = None;
        let mut previous_intervention_update = 0u64;
        for (index, intervention) in self.interventions.iter().enumerate() {
            if intervention.update > self.update
                || (index > 0 && intervention.update < previous_intervention_update)
                || !matches!(
                    intervention.kind.as_str(),
                    "mutation"
                        | "bottleneck"
                        | "catastrophe"
                        | "resource-pulse"
                        | "logic"
                        | "seasons"
                )
                || (intervention.kind == "mutation" && intervention.value > 100_000)
                || !intervention_ids.insert(intervention.id)
            {
                return Err("checkpoint contains an invalid intervention record".into());
            }
            previous_intervention_update = intervention.update;
            max_intervention_id = Some(
                max_intervention_id.map_or(intervention.id, |current| current.max(intervention.id)),
            );
        }
        if max_intervention_id.is_some_and(|id| self.next_intervention_id <= id) {
            return Err("checkpoint intervention identifiers moved backwards".into());
        }
        Ok(())''',
        "checkpoint history record validation",
    ),
    (
        '''            hash_pair_bytes(&mut a, &mut b, &genotype.bytes);
        }
        for fossil in &self.fossils {
            hash_pair(&mut a, &mut b, fossil.update);''',
        '''            hash_pair_bytes(&mut a, &mut b, &genotype.bytes);
        }
        hash_pair(&mut a, &mut b, self.fossils.len() as u64);
        for fossil in &self.fossils {
            hash_pair(&mut a, &mut b, fossil.update);''',
        "fossil vector length checksum",
    ),
    (
        '''        for sample in &self.stats {
            for value in [
                sample.update,
                sample.instructions,
                u64::from(sample.population),
                u64::from(sample.genotype_count),''',
        '''        hash_pair(&mut a, &mut b, self.stats.len() as u64);
        for sample in &self.stats {
            for value in [
                sample.update,
                sample.instructions,
                u64::from(sample.population),
                u64::from(sample.genotype_count),
                sample.retired_genotype_count,''',
        "statistics vector and retired-history checksum",
    ),
    (
        '''            hash_pair_option(&mut a, &mut b, sample.dominant_genotype_id.map(u64::from));
        }
        for intervention in &self.interventions {
            hash_pair(&mut a, &mut b, intervention.id);''',
        '''            hash_pair_option(&mut a, &mut b, sample.dominant_genotype_id.map(u64::from));
        }
        hash_pair(&mut a, &mut b, self.interventions.len() as u64);
        for intervention in &self.interventions {
            hash_pair(&mut a, &mut b, intervention.id);''',
        "intervention vector length checksum",
    ),
    (
        '''fn bincode_options() -> impl Options {''',
        '''fn valid_identifier(value: &str, max_len: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn bincode_options() -> impl Options {''',
        "bounded public identifier helper",
    ),
    (
        '''    #[test]
    fn checksum_covers_future_affecting_state() {''',
        '''    #[test]
    fn checksum_covers_retired_history_metadata_and_vector_boundaries() {
        let mut world = World::from_preset("first-replicator", 5).unwrap();
        world.run_updates(20);
        assert!(!world.stats.is_empty());
        let baseline = world.checksum_hex();

        let mut retired = world.clone();
        retired.stats[0].retired_genotype_count =
            retired.stats[0].retired_genotype_count.saturating_add(1);
        assert_ne!(retired.checksum_hex(), baseline);

        let mut intervention = world.clone();
        intervention.interventions.push(InterventionRecord {
            id: intervention.next_intervention_id,
            update: intervention.update,
            kind: "logic".into(),
            value: 1,
        });
        assert_ne!(intervention.checksum_hex(), baseline);
    }

    #[test]
    fn checkpoint_validation_rejects_forged_history_and_identity() {
        let world = World::from_preset("first-replicator", 31).unwrap();

        let mut forged_genotype = world.clone();
        forged_genotype.genotypes[0].hash ^= 1;
        assert!(World::import_checkpoint(&forged_genotype.export_checkpoint().unwrap()).is_err());

        let mut forged_fossil = world.clone();
        forged_fossil.fossils[0].genome[0] ^= 1;
        assert!(World::import_checkpoint(&forged_fossil.export_checkpoint().unwrap()).is_err());

        let mut forged_preset = world.clone();
        forged_preset.preset_id = "../../not-a-preset".into();
        assert!(World::import_checkpoint(&forged_preset.export_checkpoint().unwrap()).is_err());

        let mut forged_intervention = world;
        forged_intervention.interventions.push(InterventionRecord {
            id: 7,
            update: 0,
            kind: "unknown".into(),
            value: 0,
        });
        forged_intervention.next_intervention_id = 8;
        assert!(World::import_checkpoint(&forged_intervention.export_checkpoint().unwrap()).is_err());
    }

    #[test]
    fn configured_history_limits_have_hard_caps() {
        let mut config = WorldConfig::default();
        config.max_samples = MAX_STATS_SAMPLES_HARD + 1;
        assert!(config.validate().is_err());
        config.max_samples = WorldConfig::default().max_samples;
        config.max_fossils = MAX_FOSSILS_HARD + 1;
        assert!(config.validate().is_err());
    }

    #[test]
    fn checksum_covers_future_affecting_state() {''',
        "checkpoint and checksum regression tests",
    ),
]
for old, new, label in core_replacements:
    replace_once(core, old, new, label)


worker = ROOT / "darwin-machine/worker.js"
replace_once(
    worker,
    '''function exportCheckpoint() {
  const bytes = world.exportCheckpoint();
  const summary = JSON.parse(world.summaryJson());
  self.postMessage({
    type: "checkpoint-export",
    filename: `darwin-${summary.preset_id}-u${summary.update}-s${summary.seed}.darwin`,''',
    '''function exportCheckpoint() {
  const bytes = world.exportCheckpoint();
  const summary = JSON.parse(world.summaryJson());
  const safePreset = String(summary.preset_id)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "experiment";
  self.postMessage({
    type: "checkpoint-export",
    filename: `darwin-${safePreset}-u${summary.update}-s${summary.seed}.darwin`,''',
    "safe checkpoint export filename",
)


app = ROOT / "darwin-machine/app.js"
app_replacements = [
    (
        '''  const visible = samples.slice(-360);
  for (let si = 0; si < series.length; si += 1) {
    const spec = series[si];
    const values = visible.map((sample) => Number(sample[spec.key] || 0));
    const max = Math.max(1, ...values);''',
        '''  const visible = samples.slice(-360);
  const valuesBySeries = series.map((spec) => visible.map((sample) => Number(sample[spec.key] || 0)));
  const primaryMax = Math.max(1, ...valuesBySeries.filter((_, index) => !series[index].secondary).flat());
  const secondaryMax = Math.max(1, ...valuesBySeries.filter((_, index) => series[index].secondary).flat());
  for (let si = 0; si < series.length; si += 1) {
    const spec = series[si];
    const values = valuesBySeries[si];
    const max = spec.secondary ? secondaryMax : primaryMax;''',
        "honest chart scale grouping",
    ),
    (
        '''dom.share.addEventListener("click", async () => {
  await navigator.clipboard.writeText(location.href);
  showNotice("Copied this preset and seed to the clipboard.", "ok");
});''',
        '''dom.share.addEventListener("click", async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable");
    await navigator.clipboard.writeText(location.href);
    showNotice("Copied this preset and seed to the clipboard.", "ok");
  } catch (error) {
    showNotice(`Could not copy the link: ${error.message}`, "warn");
  }
});''',
        "recoverable clipboard failure",
    ),
    (
        '''dom.save.addEventListener("click", () => {
  dom.saveName.value = `${PRESETS[summary?.preset_id || dom.preset.value].name} · update ${formatNumber(summary?.update || 0)}`;''',
        '''dom.save.addEventListener("click", () => {
  const presetName = PRESETS[summary?.preset_id]?.name
    ?? PRESETS[dom.preset.value]?.name
    ?? "Imported experiment";
  dom.saveName.value = `${presetName} · update ${formatNumber(summary?.update || 0)}`;''',
        "imported-preset save fallback",
    ),
]
for old, new, label in app_replacements:
    replace_once(app, old, new, label)


html = ROOT / "darwin-machine/index.html"
html_replacements = [
    (
        '''<figcaption><strong>Population and diversity</strong><span><i class="key-a"></i> population <i class="key-b"></i> genotypes</span></figcaption>''',
        '''<figcaption><strong>Population and diversity</strong><span>shared count scale · <i class="key-a"></i> population <i class="key-b"></i> genotypes</span></figcaption>''',
        "population chart scale disclosure",
    ),
    (
        '''<figcaption><strong>Genome and replication cost</strong><span><i class="key-a"></i> median bytes <i class="key-b"></i> instructions</span></figcaption>''',
        '''<figcaption><strong>Genome and replication cost</strong><span>separate scales · <i class="key-a"></i> median bytes <i class="key-b"></i> instructions</span></figcaption>''',
        "genome chart scale disclosure",
    ),
    (
        '''aria-label="Median genome length and mean replication instruction count over recent updates"''',
        '''aria-label="Median genome length and mean replication instruction count over recent updates, drawn on separate scales"''',
        "genome chart accessible scale disclosure",
    ),
]
for old, new, label in html_replacements:
    replace_once(html, old, new, label)


science = ROOT / "darwin-machine/SCIENCE.md"
science_replacements = [
    (
        "- **lineage**: descent from one founder, regardless of later genotype;",
        "- **lineage**: a mutation-defined genealogical branch; exact-copy children retain their parent lineage, while a birth with a recorded mutation opens a new branch;",
        "operational lineage definition",
    ),
    (
        "- **genotype**: an exact genome byte sequence;",
        "- **genotype**: an exact genome byte sequence; the displayed `G#` is a compact current-table reference and may be remapped when extinct history is pruned, while the genome hash is the stable identity;",
        "stable genotype identity definition",
    ),
    (
        "Private child buffers prevent incomplete offspring from executing, but also prevent genuine Tierra-style parasites. `The Blue Nutrient` discloses an XOR reaction that grants energy; this is an imposed environmental law and must not be presented as an organism independently inventing XOR for its own sake.",
        "Private child buffers prevent incomplete offspring from executing, but also prevent genuine Tierra-style parasites. `The Blue Nutrient` discloses an XOR reaction that grants energy; this is an imposed environmental law and must not be presented as an organism independently inventing XOR for its own sake. Local uptake, sharing, signals and toxin actions take effect in the disclosed seeded visit order; birth and movement conflicts alone are deferred and resolved together at update end.",
        "schedule-mediated local action disclosure",
    ),
]
for old, new, label in science_replacements:
    replace_once(science, old, new, label)


design = ROOT / "darwin-machine/DESIGN.md"
replace_once(
    design,
    "- **lineage:** a genealogical branch descended from an ancestor;",
    "- **lineage:** a mutation-defined genealogical branch; exact-copy descendants remain on the branch and recorded mutations open a new one;",
    "design lineage definition",
)


review = ROOT / "darwin-machine/reports/adversarial-implementation-review.md"
review_replacements = [
    (
        "The state checksum now covers version identity, every world law, cells, organisms, child construction, free-slot order, genotype/history records, interventions and interval state.",
        "The state checksum now covers semantic version identity, every world law, cells, organisms, child construction, free-slot order, genotype/history records (including vector boundaries and retired-history counters), interventions and interval state. Asset-build provenance is deliberately excluded because it cannot affect a future simulation step.",
        "checksum disposition correction",
    ),
    (
        "The core deterministically retains active genotypes, active parents, fossils, the current dominant branch and the newest extinct records up to a configured cap.",
        "The core deterministically retains active genotypes, active parents, fossils, the current dominant branch and the newest extinct records up to a hard-bounded configured cap, enforcing it at every externally observable update rather than only at chart-sampling boundaries.",
        "history-bound disposition correction",
    ),
    (
        "Two-second heartbeats trigger a visible fatal recovery panel after eight seconds. The Worker writes an automatic IndexedDB checkpoint every thirty seconds, and manual local saves plus file export are available.",
        "Two-second heartbeats trigger a visible fatal recovery panel after eight seconds. User-data failures such as a corrupt checkpoint or missing browser save remain recoverable warnings rather than killing a healthy engine. The Worker writes an automatic IndexedDB checkpoint every thirty seconds, and manual local saves plus file export are available.",
        "Worker recovery disposition correction",
    ),
    (
        "Birth and move requests are gathered and resolved at update end. Contention keys depend on stable identities, not vector insertion order.",
        "Birth and move requests are gathered and resolved at update end. Contention keys depend on stable identities, not vector insertion order. Local resource capture and signalling remain deliberately schedule-mediated and are disclosed as substrate physics rather than claimed to be simultaneous.",
        "scheduler disposition precision",
    ),
]
for old, new, label in review_replacements:
    replace_once(review, old, new, label)


static_test = ROOT / "darwin-machine/tests/validate-static.mjs"
replace_once(
    static_test,
    '''assert.match(worker, /16 \\* 1024 \\* 1024/, "Worker import cap missing");''',
    '''assert.match(worker, /16 \\* 1024 \\* 1024/, "Worker import cap missing");
assert.match(worker, /RECOVERABLE_COMMANDS/, "recoverable user-data error boundary missing");
assert.match(app, /18_446_744_073_709_551_615n/, "page seed must be bounded to Rust u64");
assert.match(worker, /18_446_744_073_709_551_615n/, "Worker seed must be bounded to Rust u64");''',
    "static product hardening guards",
)

print("Final checkpoint, UI evidence and scientific-language invariants are materialised.")
