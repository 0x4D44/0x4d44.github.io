use darwin_core::{
    assess_viability, clumsy_ancestor, keyed_random, neighbourhood_report, rng_golden_vectors,
    World, MINIMAL_ANCESTOR,
};
use serde_json::json;
use std::env;
use std::fs;
use std::time::Instant;

fn main() {
    if let Err(error) = run() {
        eprintln!("darwin-cli: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        Some("trace") => trace(),
        Some("neighbourhood") => neighbourhood(args.next().as_deref()),
        Some("assay") => assay(args.next().as_deref().unwrap_or("all")),
        Some("search") => search(),
        Some("benchmark") => benchmark(),
        Some("vectors") => vectors(),
        Some("verify") => verify(),
        _ => {
            eprintln!(
                "usage: darwin-cli <trace|neighbourhood [minimal|clumsy]|assay [all|selection|meltdown|bottleneck]|search|benchmark|vectors|verify>"
            );
            Ok(())
        }
    }
}

fn trace() -> Result<(), String> {
    let minimal = assess_viability(&MINIMAL_ANCESTOR, 20_000);
    let clumsy = assess_viability(&clumsy_ancestor(), 40_000);
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "minimal": minimal,
            "clumsy": clumsy,
        }))
        .unwrap()
    );
    if !minimal.child_divided
        || !minimal.exact_child
        || !clumsy.child_divided
        || !clumsy.exact_child
    {
        return Err(
            "one or more supplied ancestors failed the exact two-generation contract".into(),
        );
    }
    Ok(())
}

fn neighbourhood(which: Option<&str>) -> Result<(), String> {
    let mut reports = Vec::new();
    match which {
        Some("minimal") => reports.push(neighbourhood_report("minimal-v1", &MINIMAL_ANCESTOR)),
        Some("clumsy") => reports.push(neighbourhood_report("clumsy-v1", &clumsy_ancestor())),
        _ => {
            reports.push(neighbourhood_report("minimal-v1", &MINIMAL_ANCESTOR));
            reports.push(neighbourhood_report("clumsy-v1", &clumsy_ancestor()));
        }
    }
    let value = serde_json::to_string_pretty(&reports).unwrap();
    println!("{value}");
    if let Ok(path) = env::var("DARWIN_REPORT_JSON") {
        fs::write(path, &value).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
struct RunOutcome {
    preset: String,
    seed: u64,
    updates: u32,
    population: u32,
    genotypes: u32,
    dominant_share_ppm: u32,
    median_genome_length: u16,
    checksum: String,
}

fn one_run(preset: &str, seed: u64, updates: u32) -> Result<RunOutcome, String> {
    let mut world = World::from_preset(preset, seed)?;
    world.run_updates(updates);
    let summary = world.summary();
    Ok(RunOutcome {
        preset: preset.into(),
        seed,
        updates,
        population: summary.population,
        genotypes: summary.genotype_count,
        dominant_share_ppm: summary.dominant_share_ppm,
        median_genome_length: summary
            .stats
            .last()
            .map_or(0, |sample| sample.median_genome_length),
        checksum: summary.checksum,
    })
}

fn assay(which: &str) -> Result<(), String> {
    let mut rows = Vec::new();
    if which == "all" || which == "selection" {
        for seed in 1..=6 {
            rows.push(one_run("faster-smaller", seed, 600)?);
        }
    }
    if which == "all" || which == "meltdown" {
        for seed in 101..=106 {
            rows.push(one_run("mutation-meltdown", seed, 600)?);
        }
    }
    if which == "all" || which == "bottleneck" {
        for seed in 201..=206 {
            let mut world = World::from_preset("bottleneck", seed)?;
            world.run_updates(300);
            world.apply_intervention("bottleneck", 8)?;
            world.run_updates(300);
            let summary = world.summary();
            rows.push(RunOutcome {
                preset: "bottleneck".into(),
                seed,
                updates: 600,
                population: summary.population,
                genotypes: summary.genotype_count,
                dominant_share_ppm: summary.dominant_share_ppm,
                median_genome_length: summary.stats.last().map_or(0, |s| s.median_genome_length),
                checksum: summary.checksum,
            });
        }
    }
    let output = serde_json::to_string_pretty(&rows).unwrap();
    println!("{output}");
    if let Ok(path) = env::var("DARWIN_ASSAY_JSON") {
        fs::write(path, &output).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn search() -> Result<(), String> {
    const SEARCH_SEED: u64 = 0x0d1e_a5e5_5eed_2026;
    const TRIALS_PER_EDIT: u32 = 128;
    const RANDOM_TRIALS: u32 = 512;
    const HORIZON: u64 = 8_000;

    let ancestor = clumsy_ancestor();
    let mut damaged = Vec::new();
    for edits in 1..=4_u32 {
        let mut divided = 0_u32;
        let mut second_generation = 0_u32;
        let mut exact = 0_u32;
        for trial in 0..TRIALS_PER_EDIT {
            let mut candidate = ancestor.clone();
            for edit in 0..edits {
                let roll = keyed_random(
                    SEARCH_SEED,
                    0x4441_4d41_4745_445f,
                    u64::from(edits),
                    u64::from(trial),
                    u64::from(edit),
                );
                let index = (roll as usize) % candidate.len();
                match (roll >> 61) & 3 {
                    0 if candidate.len() > 8 => {
                        candidate.remove(index);
                    }
                    1 if candidate.len() < 96 => {
                        candidate.insert(index, (roll >> 24) as u8);
                    }
                    _ => {
                        let original = candidate[index];
                        let mut replacement = (roll >> 32) as u8;
                        if replacement == original {
                            replacement ^= 0x80;
                        }
                        candidate[index] = replacement;
                    }
                }
            }
            let result = assess_viability(&candidate, HORIZON);
            divided += u32::from(result.divided);
            second_generation += u32::from(result.child_divided);
            exact += u32::from(result.exact_child);
        }
        damaged.push(json!({
            "edits": edits,
            "trials": TRIALS_PER_EDIT,
            "divided": divided,
            "child_divided": second_generation,
            "exact_child": exact,
        }));
    }

    let mut random_divided = 0_u32;
    let mut random_second_generation = 0_u32;
    let mut first_random_replicator: Option<String> = None;
    for trial in 0..RANDOM_TRIALS {
        let length = 8
            + (keyed_random(SEARCH_SEED, 0x5241_4e44_4f4d_4c45, u64::from(trial), 0, 0) % 57)
                as usize;
        let genome: Vec<u8> = (0..length)
            .map(|index| {
                keyed_random(
                    SEARCH_SEED,
                    0x5241_4e44_4f4d_4259,
                    u64::from(trial),
                    index as u64,
                    length as u64,
                ) as u8
            })
            .collect();
        let result = assess_viability(&genome, HORIZON);
        random_divided += u32::from(result.divided);
        random_second_generation += u32::from(result.child_divided);
        if result.child_divided && first_random_replicator.is_none() {
            first_random_replicator = Some(
                genome
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<Vec<_>>()
                    .join(""),
            );
        }
    }

    let output = json!({
        "seed": SEARCH_SEED,
        "horizon_instructions": HORIZON,
        "damaged_ancestor": damaged,
        "random_programs": {
            "trials": RANDOM_TRIALS,
            "length_range": [8, 64],
            "divided": random_divided,
            "child_divided": random_second_generation,
            "first_child_dividing_genome_hex": first_random_replicator,
            "interpretation": "A zero is evidence only for this finite private-genome search, not evidence that replication cannot emerge.",
        }
    });
    let value = serde_json::to_string_pretty(&output).unwrap();
    println!("{value}");
    if let Ok(path) = env::var("DARWIN_SEARCH_JSON") {
        fs::write(path, &value).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn benchmark() -> Result<(), String> {
    let mut world = World::from_preset("faster-smaller", 0x5eed)?;
    let start = Instant::now();
    let before = world.instructions;
    world.run_updates(1_000);
    let elapsed = start.elapsed();
    let executed = world.instructions - before;
    eprintln!(
        "native benchmark: {executed} instructions in {:.2} ms ({:.0} instructions/s)",
        elapsed.as_secs_f64() * 1_000.0,
        executed as f64 / elapsed.as_secs_f64().max(0.000_001),
    );
    // Stdout is deliberately deterministic so generated evidence can be
    // rebuild-and-diff checked. Timing remains in the CI log, where machine
    // variation belongs.
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "updates": 1_000,
            "instructions": executed,
            "population": world.population(),
            "checksum": world.checksum_hex(),
        }))
        .unwrap()
    );
    Ok(())
}

fn vectors() -> Result<(), String> {
    let cases = [
        ("first-replicator", 311_991_u64, 10_u32),
        ("faster-smaller", 0x5eed_u64, 40_u32),
    ];
    let mut worlds = Vec::new();
    for (preset, seed, updates) in cases {
        let mut world = World::from_preset(preset, seed)?;
        world.run_updates(updates);
        worlds.push(json!({
            "preset": preset,
            "seed": seed,
            "updates": updates,
            "checksum": world.checksum_hex(),
            "population": world.population(),
        }));
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "rng": rng_golden_vectors(),
            "worlds": worlds,
        }))
        .unwrap()
    );
    Ok(())
}

fn verify() -> Result<(), String> {
    let mut a = World::from_preset("faster-smaller", 0x1234_5678)?;
    let mut b = a.clone();
    a.run_updates(800);
    for _ in 0..800 {
        let _ = b.summary();
        b.run_one_update();
    }
    if a.checksum_hex() != b.checksum_hex() {
        return Err("summary queries perturbed authoritative evolution".into());
    }
    let bytes = a.export_checkpoint()?;
    let mut c = World::import_checkpoint(&bytes)?;
    if a.checksum_hex() != c.checksum_hex() {
        return Err("checkpoint round-trip diverged".into());
    }
    a.run_updates(200);
    c.run_updates(200);
    if a.checksum_hex() != c.checksum_hex() {
        return Err("checkpoint continuation diverged".into());
    }
    println!("determinism verified: {}", a.checksum_hex());
    Ok(())
}
