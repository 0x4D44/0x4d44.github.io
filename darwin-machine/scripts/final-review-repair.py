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
        'pub const BUILD_ID: &str = "darwin-2026.08.01.1";',
        'pub const BUILD_ID: &str = "darwin-2026.08.02.1";',
        "release build identity bump",
    ),
    (
        '''            "first-replicator" => {
                let mut config = WorldConfig::default();
                config.width = 48;
                config.height = 32;
                config.mutation = MutationConfig {
                    substitution_ppm: 0,
                    insertion_ppm: 0,
                    deletion_ppm: 0,
                };
                config.occupancy_policy = OccupancyPolicy::EmptyOnly;''',
        '''            "first-replicator" => {
                let config = WorldConfig {
                    width: 48,
                    height: 32,
                    mutation: MutationConfig {
                        substitution_ppm: 0,
                        insertion_ppm: 0,
                        deletion_ppm: 0,
                    },
                    occupancy_policy: OccupancyPolicy::EmptyOnly,
                    ..WorldConfig::default()
                };''',
        "first-replicator preset construction",
    ),
    (
        '''            "mutation-meltdown" => {
                let mut config = WorldConfig::default();
                config.width = 96;
                config.height = 64;
                config.mutation = MutationConfig {
                    substitution_ppm: 28_000,
                    insertion_ppm: 12_000,
                    deletion_ppm: 12_000,
                };''',
        '''            "mutation-meltdown" => {
                let config = WorldConfig {
                    width: 96,
                    height: 64,
                    mutation: MutationConfig {
                        substitution_ppm: 28_000,
                        insertion_ppm: 12_000,
                        deletion_ppm: 12_000,
                    },
                    ..WorldConfig::default()
                };''',
        "mutation-meltdown preset construction",
    ),
    (
        '''            "bottleneck" => {
                let mut config = WorldConfig::default();
                config.width = 96;
                config.height = 64;
                config.mutation = MutationConfig {
                    substitution_ppm: 2_000,
                    insertion_ppm: 2_500,
                    deletion_ppm: 2_500,
                };''',
        '''            "bottleneck" => {
                let config = WorldConfig {
                    width: 96,
                    height: 64,
                    mutation: MutationConfig {
                        substitution_ppm: 2_000,
                        insertion_ppm: 2_500,
                        deletion_ppm: 2_500,
                    },
                    ..WorldConfig::default()
                };''',
        "bottleneck preset construction",
    ),
    (
        '''            "blue-nutrient" => {
                let mut config = WorldConfig::default();
                config.width = 96;
                config.height = 64;
                config.capabilities = CAP_LOGIC | CAP_MOVE | CAP_SIGNAL | CAP_SHARE;
                config.resource_replenish = 2;
                config.logic_reward = 120;
                config.seasonal_period = 600;''',
        '''            "blue-nutrient" => {
                let config = WorldConfig {
                    width: 96,
                    height: 64,
                    capabilities: CAP_LOGIC | CAP_MOVE | CAP_SIGNAL | CAP_SHARE,
                    resource_replenish: 2,
                    logic_reward: 120,
                    seasonal_period: 600,
                    ..WorldConfig::default()
                };''',
        "blue-nutrient preset construction",
    ),
    (
        "            15 | 16 | 17 => {",
        "            15..=17 => {",
        "conditional opcode range",
    ),
    (
        '''pub fn sandbox_trace(genome: &[u8], steps: u32) -> Result<SandboxTrace, String> {
    let mut config = WorldConfig::default();
    config.width = 3;
    config.height = 3;
    config.instructions_per_update = 1;
    config.mutation = MutationConfig {
        substitution_ppm: 0,
        insertion_ppm: 0,
        deletion_ppm: 0,
    };
    config.occupancy_policy = OccupancyPolicy::EmptyOnly;
    config.min_genome = 1;
    config.max_genome = MAX_GENOME_HARD as u16;''',
        '''pub fn sandbox_trace(genome: &[u8], steps: u32) -> Result<SandboxTrace, String> {
    let config = WorldConfig {
        width: 3,
        height: 3,
        instructions_per_update: 1,
        mutation: MutationConfig {
            substitution_ppm: 0,
            insertion_ppm: 0,
            deletion_ppm: 0,
        },
        occupancy_policy: OccupancyPolicy::EmptyOnly,
        min_genome: 1,
        max_genome: MAX_GENOME_HARD as u16,
        ..WorldConfig::default()
    };''',
        "sandbox configuration construction",
    ),
    (
        '''        let mut config = WorldConfig::default();
        config.width = 8;
        config.height = 8;
        config.max_fossils = 4;
        config.max_genotypes = 132;
        let mut world = World::new(config, 9, "prune-test").unwrap();''',
        '''        let config = WorldConfig {
            width: 8,
            height: 8,
            max_fossils: 4,
            max_genotypes: 132,
            ..WorldConfig::default()
        };
        let mut world = World::new(config, 9, "prune-test").unwrap();''',
        "bounded-history test configuration",
    ),
    (
        '''        if self.engine_version != ENGINE_VERSION
            || self.build_id != BUILD_ID
            || self.isa_version != ISA_VERSION''',
        '''        if self.engine_version != ENGINE_VERSION
            || self.isa_version != ISA_VERSION''',
        "semantic checkpoint compatibility boundary",
    ),
    (
        '''        let expected_cells = usize::from(self.config.width) * usize::from(self.config.height);''',
        '''        if self.build_id.len() > 128 || !self.build_id.starts_with("darwin-") {
            return Err("checkpoint build provenance is invalid".into());
        }
        let expected_cells = usize::from(self.config.width) * usize::from(self.config.height);''',
        "bounded checkpoint build provenance",
    ),
    (
        '''        hash_pair_str(&mut a, &mut b, &self.build_id);
''',
        "",
        "non-semantic build provenance checksum exclusion",
    ),
    (
        '''    #[test]
    fn structurally_inconsistent_but_well_hashed_saves_are_rejected() {''',
        '''    #[test]
    fn checkpoints_survive_asset_only_build_changes_but_not_semantic_changes() {
        let mut world = World::from_preset("first-replicator", 17).unwrap();
        world.build_id = "darwin-previous-asset-build".into();
        let checksum = world.checksum_hex();
        let bytes = world.export_checkpoint().unwrap();
        let restored = World::import_checkpoint(&bytes).unwrap();
        assert_eq!(restored.build_id, "darwin-previous-asset-build");
        assert_eq!(restored.checksum_hex(), checksum);

        let mut incompatible = world;
        incompatible.physics_version = incompatible.physics_version.saturating_add(1);
        let bytes = incompatible.export_checkpoint().unwrap();
        assert!(World::import_checkpoint(&bytes).is_err());
    }

    #[test]
    fn structurally_inconsistent_but_well_hashed_saves_are_rejected() {''',
        "checkpoint compatibility regression test",
    ),
]
for old, new, label in core_replacements:
    replace_once(core, old, new, label)


worker = ROOT / "darwin-machine/worker.js"
worker_replacements = [
    (
        '''self.addEventListener("message", (event) => {
  handle(event.data).catch(reportFatal);
});''',
        '''const RECOVERABLE_COMMANDS = new Set([
  "save-local", "list-saves", "load-local", "delete-local",
  "export", "import", "recover", "sandbox",
]);

self.addEventListener("message", (event) => {
  handle(event.data).catch((error) => reportCommandError(event.data, error));
});''',
        "recoverable Worker command routing",
    ),
    (
        "  void listSaves();",
        "  void listSaves().catch((error) => reportCommandError({ type: \"list-saves\" }, error));",
        "initial save-list error handling",
    ),
    (
        '''function reportFatal(error) {
  fatal = true;''',
        '''function reportCommandError(message, error) {
  if (!RECOVERABLE_COMMANDS.has(message?.type)) {
    reportFatal(error);
    return;
  }
  const labels = {
    "save-local": "Save",
    "list-saves": "Saved-experiment list",
    "load-local": "Load",
    "delete-local": "Delete",
    export: "Export",
    import: "Import",
    recover: "Recovery",
    sandbox: "Sandbox trace",
  };
  self.postMessage({
    type: "notice",
    level: "warn",
    text: `${labels[message.type] || "Command"} failed: ${error?.message || String(error)}`,
  });
}

function reportFatal(error) {
  fatal = true;''',
        "non-fatal user-data error reporting",
    ),
    (
        '''function normaliseSeed(value) {
  const text = String(value ?? "1").trim();
  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(text)) return "1";
  return text;
}''',
        '''function normaliseSeed(value) {
  const text = String(value ?? "1").trim();
  if (text.length > 20 || !/^(?:0x[0-9a-f]+|\d+)$/i.test(text)) return "1";
  try {
    const seed = BigInt(text);
    return seed <= 18_446_744_073_709_551_615n ? seed.toString() : "1";
  } catch {
    return "1";
  }
}''',
        "Worker u64 seed validation",
    ),
]
for old, new, label in worker_replacements:
    replace_once(worker, old, new, label)


app = ROOT / "darwin-machine/app.js"
replace_once(
    app,
    '''function normaliseSeed(value) {
  const text = String(value).trim();
  if (/^0x[0-9a-f]+$/i.test(text)) return BigInt(text).toString();
  if (/^\d+$/.test(text)) return BigInt(text).toString();
  return "1";
}''',
    '''function normaliseSeed(value) {
  const text = String(value).trim();
  if (text.length > 20 || !/^(?:0x[0-9a-f]+|\d+)$/i.test(text)) return "1";
  try {
    const seed = BigInt(text);
    return seed <= 18_446_744_073_709_551_615n ? seed.toString() : "1";
  } catch {
    return "1";
  }
}''',
    "page u64 seed validation",
)


html = ROOT / "darwin-machine/index.html"
replace_once(
    html,
    '<input id="seed" inputmode="numeric" autocomplete="off" spellcheck="false" value="1" aria-describedby="seed-note">',
    '<input id="seed" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="20" value="1" aria-describedby="seed-note">',
    "seed input length boundary",
)


browser = ROOT / "darwin-machine/tests/browser.test.mjs"
browser_replacements = [
    (
        '''    await evaluate(`document.getElementById("reset").click()`);
    await poll("reset after determinism vector", () => evaluate(`window.__darwinSummary?.update === 0 && window.__darwinSummary?.population === 1`), 8_000);''',
        '''    await evaluate(`document.getElementById("reset").click()`);
    await poll("reset after determinism vector", () => evaluate(`window.__darwinSummary?.update === 0 && window.__darwinSummary?.population === 1`), 8_000);

    await evaluate(`document.getElementById("seed").value = "18446744073709551616"; document.getElementById("reset").click()`);
    await poll("out-of-range seed normalisation", () => evaluate(`window.__darwinSummary?.seed === 1 && window.__darwinSummary?.update === 0`), 8_000);
    assert.equal(await evaluate(`document.getElementById("fatal").hidden`), true, `${width}: an out-of-range seed killed the Worker`);''',
        "out-of-range seed browser oracle",
    ),
    (
        '''    if (width === VIEWPORTS[0][0]) {
      trace("checking IndexedDB save and offline restart");''',
        '''    if (width === VIEWPORTS[0][0]) {
      trace("checking corrupt-checkpoint recovery, IndexedDB save and offline restart");
      const beforeCorruptImport = await evaluate(`window.__darwinSummary.update`);
      await evaluate(`(() => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([Uint8Array.of(1, 2, 3, 4)], "corrupt.darwin", {type:"application/x-darwin-machine"}));
        const input = document.getElementById("file");
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", {bubbles:true}));
      })()`);
      await poll("recoverable corrupt-checkpoint warning", () => evaluate(`(() => {
        const notice = document.getElementById("notice");
        return !notice.hidden && /Import failed/i.test(notice.textContent);
      })()`), 8_000);
      assert.equal(await evaluate(`document.getElementById("fatal").hidden`), true, "corrupt user data stopped the engine");
      await evaluate(`window.__darwinTestRun(1)`);
      await poll("engine progress after rejected checkpoint", () => evaluate(`window.__darwinSummary?.update > ${beforeCorruptImport}`), 8_000);''',
        "recoverable checkpoint browser oracle",
    ),
    (
        "      let min=255,max=0;",
        "      let min=Infinity,max=0;",
        "canvas variance minimum",
    ),
    (
        '''    assert.ok(painted.max > painted.min, `${width}: dish appears blank`);''',
        '''    assert.ok(painted.max - painted.min > 10, `${width}: dish lacks meaningful pixel variance (${painted.min}..${painted.max})`);''',
        "meaningful dish-painting oracle",
    ),
]
for old, new, label in browser_replacements:
    replace_once(browser, old, new, label)


build_info = ROOT / "darwin-machine/build-info.js"
replace_once(
    build_info,
    'export const APP_BUILD_ID = "darwin-2026.08.01.1";',
    'export const APP_BUILD_ID = "darwin-2026.08.02.1";',
    "page build identity bump",
)


service_worker = ROOT / "darwin-machine/sw.js"
replace_once(
    service_worker,
    'const BUILD_ID = "darwin-2026.08.01.1";',
    'const BUILD_ID = "darwin-2026.08.02.1";',
    "offline cache identity bump",
)


security = ROOT / "darwin-machine/SECURITY.md"
replace_once(
    security,
    "- build/substrate/ISA/RNG/physics versions checked;",
    "- semantic engine/substrate/ISA/RNG/physics versions checked; the asset build ID is bounded provenance, not a reason to strand an otherwise compatible experiment;",
    "checkpoint compatibility documentation",
)


readme = ROOT / "darwin-machine/README.md"
replace_once(
    readme,
    "All authoritative simulation values are integers. A build identity handshake rejects stale combinations of page JavaScript, Worker JavaScript and Wasm. Checkpoints carry engine, ISA, RNG, physics, substrate and save-format versions plus a 128-bit state checksum.",
    "All authoritative simulation values are integers. A build identity handshake rejects stale combinations of page JavaScript, Worker JavaScript and Wasm. Checkpoints carry semantic engine, ISA, RNG, physics, substrate and save-format versions plus a 128-bit state checksum; an asset-only release ID remains bounded provenance and does not make a compatible saved experiment unloadable.",
    "checkpoint compatibility explanation",
)


static_test = ROOT / "darwin-machine/tests/validate-static.mjs"
replace_once(
    static_test,
    '''assert.equal(swBuildId, buildId, "service-worker/page build id mismatch");
assert.match(worker, /wasmId !== APP_BUILD_ID/, "Worker/Wasm handshake missing");''',
    '''assert.equal(swBuildId, buildId, "service-worker/page build id mismatch");
assert.doesNotMatch(core, /self\\.build_id != BUILD_ID/, "asset build id must not strand semantically compatible checkpoints");
assert.doesNotMatch(core, /hash_pair_str\\(&mut a, &mut b, &self\\.build_id\\)/, "asset provenance must not perturb the authoritative state checksum");
assert.match(worker, /wasmId !== APP_BUILD_ID/, "Worker/Wasm handshake missing");''',
    "static checkpoint compatibility guards",
)

print("Final adversarial review corrections are materialised.")
