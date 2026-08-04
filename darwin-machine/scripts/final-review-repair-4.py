from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


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
    ROOT / "darwin-machine/rust/crates/darwin-cli/Cargo.toml",
    '''[dependencies]
darwin-core = { path = "../darwin-core" }
serde_json.workspace = true
''',
    '''[dependencies]
darwin-core = { path = "../darwin-core" }
serde.workspace = true
serde_json.workspace = true
''',
    "missing CLI serde dependency",
)

replace_once(
    ROOT / "darwin-machine/rust/crates/darwin-core/src/lib.rs",
    '''    fn configured_history_limits_have_hard_caps() {
        let mut config = WorldConfig::default();
        config.max_samples = MAX_STATS_SAMPLES_HARD + 1;
        assert!(config.validate().is_err());
        config.max_samples = WorldConfig::default().max_samples;
        config.max_fossils = MAX_FOSSILS_HARD + 1;
        assert!(config.validate().is_err());
    }''',
    '''    fn configured_history_limits_have_hard_caps() {
        let excessive_samples = WorldConfig {
            max_samples: MAX_STATS_SAMPLES_HARD + 1,
            ..WorldConfig::default()
        };
        assert!(excessive_samples.validate().is_err());

        let excessive_fossils = WorldConfig {
            max_fossils: MAX_FOSSILS_HARD + 1,
            ..WorldConfig::default()
        };
        assert!(excessive_fossils.validate().is_err());
    }''',
    "Clippy-clean history-cap tests",
)

print("Clean-build findings are materialised.")
