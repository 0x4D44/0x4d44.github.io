//! Deterministic artificial-life core for The Darwin Machine.
//!
//! The crate has no browser dependencies.  The same authoritative state is
//! exercised by the native assay CLI and by the WebAssembly wrapper.

use bincode::Options;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};

pub const BUILD_ID: &str = "darwin-2026.08.02.1";
pub const ENGINE_VERSION: &str = "0.1.0";
pub const ISA_VERSION: u16 = 1;
pub const RNG_VERSION: u16 = 1;
pub const PHYSICS_VERSION: u16 = 2;
pub const SAVE_VERSION: u16 = 1;
pub const GRID_STRIDE: usize = 8;
pub const MAX_IMPORT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_STATS_SAMPLES_HARD: u32 = 10_000;
pub const MAX_FOSSILS_HARD: u32 = 4_096;
pub const MAX_INTERVENTIONS_HARD: usize = 10_000;
pub const MAX_WORLD_CELLS: usize = 256 * 256;
pub const MAX_GENOME_HARD: usize = 1024;

const DOMAIN_SCHEDULER: u64 = 0x5343_4845_4455_4c45;
const DOMAIN_ALLOC: u64 = 0x414c_4c4f_4341_5445;
const DOMAIN_COPY_MUTATION: u64 = 0x434f_5059_4d55_5441;
const DOMAIN_DIV_MUTATION: u64 = 0x4449_564d_5554_4154;
const DOMAIN_VM_RAND: u64 = 0x564d_5f52_414e_445f;
const DOMAIN_CONTENTION: u64 = 0x434f_4e54_454e_5449;
const DOMAIN_INTERVENTION: u64 = 0x494e_5445_5256_454e;
const DOMAIN_INPUT: u64 = 0x494e_5055_545f_5f5f;
const DOMAIN_MOVE: u64 = 0x4d4f_5645_5f5f_5f5f;

pub const CAP_MOVE: u32 = 1 << 0;
pub const CAP_SIGNAL: u32 = 1 << 1;
pub const CAP_LOGIC: u32 = 1 << 2;
pub const CAP_SHARE: u32 = 1 << 3;

pub const MINIMAL_ANCESTOR: [u8; 16] = [
    encode(29, 0), // UPTAKE 0
    encode(21, 0), // SYSTEM genome length
    encode(22, 0), // ALLOC random neighbour
    encode(23, 0), // HEAD reset
    encode(1, 1),  // ZERO r1
    encode(0, 1),  // NOP-B target
    encode(0, 0),  // NOP-A target
    encode(24, 2), // READ_SELF r2
    encode(25, 2), // WRITE_CHILD r2
    encode(2, 1),  // INC r1
    encode(14, 1), // CMP r1,r0
    encode(16, 0), // IF_NE
    encode(18, 1), // JUMP backward
    encode(0, 0),  // NOP-A local template
    encode(0, 1),  // NOP-B local template
    encode(26, 0), // DIVIDE
];

pub fn clumsy_ancestor() -> Vec<u8> {
    let mut bytes = vec![
        encode(29, 0), // redundant uptake
        encode(29, 0),
        encode(21, 0),
        encode(22, 0),
        encode(23, 0),
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
        encode(25, 2),
        encode(2, 1),
        encode(14, 1),
        encode(16, 0),
        encode(18, 1),
        encode(0, 0),
        encode(0, 1),
        encode(26, 0),
    ];
    while bytes.len() < 64 {
        // NOP-C cannot accidentally satisfy the A/B loop template.
        bytes.push(encode(0, 2));
    }
    bytes
}

pub const fn encode(op: u8, arg: u8) -> u8 {
    (op & 0x1f) | ((arg & 0x07) << 5)
}

pub const fn decode(byte: u8) -> (u8, u8) {
    (byte & 0x1f, byte >> 5)
}

pub fn mnemonic(op: u8) -> &'static str {
    match op & 0x1f {
        0 => "NOP",
        1 => "ZERO",
        2 => "INC",
        3 => "DEC",
        4 => "NOT",
        5 => "MOV",
        6 => "SWAP",
        7 => "ADD",
        8 => "SUB",
        9 => "XOR",
        10 => "NAND",
        11 => "SHL",
        12 => "SHR",
        13 => "RAND",
        14 => "CMP",
        15 => "IF_EQ",
        16 => "IF_NE",
        17 => "IF_LT",
        18 => "JUMP",
        19 => "CALL",
        20 => "RETURN",
        21 => "SYSTEM",
        22 => "ALLOC",
        23 => "HEAD",
        24 => "READ_SELF",
        25 => "WRITE_CHILD",
        26 => "DIVIDE",
        27 => "SENSE",
        28 => "MOVE",
        29 => "UPTAKE",
        30 => "SIGNAL",
        31 => "ACT",
        _ => unreachable!(),
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum OccupancyPolicy {
    EmptyOnly,
    LocalReplacement,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CompareFlag {
    Less,
    Equal,
    Greater,
}

impl Default for CompareFlag {
    fn default() -> Self {
        Self::Equal
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[repr(u8)]
pub enum StatusCode {
    Ok = 0,
    Disabled = 1,
    NoChild = 2,
    InvalidLength = 3,
    IncompleteChild = 4,
    InsufficientEnergy = 5,
    TemplateNotFound = 6,
    StackEmpty = 7,
    StackFull = 8,
    TargetBlocked = 9,
    BirthPending = 10,
    NoResource = 11,
    TaskFailed = 12,
    TaskSucceeded = 13,
    MovePending = 14,
}

impl Default for StatusCode {
    fn default() -> Self {
        Self::Ok
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MutationConfig {
    /// Probability per copied byte, in parts per million.
    pub substitution_ppm: u32,
    /// Probability per division, in parts per million.
    pub insertion_ppm: u32,
    /// Probability per division, in parts per million.
    pub deletion_ppm: u32,
}

impl Default for MutationConfig {
    fn default() -> Self {
        Self {
            substitution_ppm: 1_500,
            insertion_ppm: 2_000,
            deletion_ppm: 2_000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldConfig {
    pub width: u16,
    pub height: u16,
    pub instructions_per_update: u8,
    pub min_genome: u16,
    pub max_genome: u16,
    pub max_energy: u16,
    pub initial_energy: u16,
    pub child_energy: u16,
    pub maintenance_cost: u16,
    pub allocation_cost: u16,
    pub division_cost: u16,
    pub resource_cap: u16,
    pub resource_replenish: u16,
    pub uptake_packet: u16,
    pub logic_reward: u16,
    pub occupancy_policy: OccupancyPolicy,
    pub mutation: MutationConfig,
    pub capabilities: u32,
    pub sample_period: u32,
    pub max_samples: u32,
    pub max_fossils: u32,
    pub max_genotypes: u32,
    pub seasonal_period: u32,
}

impl Default for WorldConfig {
    fn default() -> Self {
        Self {
            width: 96,
            height: 64,
            instructions_per_update: 8,
            min_genome: 8,
            max_genome: 256,
            max_energy: 1_024,
            initial_energy: 900,
            child_energy: 600,
            maintenance_cost: 1,
            allocation_cost: 8,
            division_cost: 16,
            resource_cap: 512,
            resource_replenish: 10,
            uptake_packet: 512,
            logic_reward: 96,
            occupancy_policy: OccupancyPolicy::LocalReplacement,
            mutation: MutationConfig::default(),
            capabilities: 0,
            sample_period: 20,
            max_samples: 1_200,
            max_fossils: 256,
            max_genotypes: 20_000,
            seasonal_period: 0,
        }
    }
}

impl WorldConfig {
    pub fn validate(&self) -> Result<(), String> {
        let cells = usize::from(self.width) * usize::from(self.height);
        if self.width == 0 || self.height == 0 || cells > MAX_WORLD_CELLS {
            return Err("world dimensions are outside the supported range".into());
        }
        if self.instructions_per_update == 0 || self.instructions_per_update > 64 {
            return Err("instructions_per_update must be 1..=64".into());
        }
        if self.min_genome < 1
            || self.max_genome < self.min_genome
            || usize::from(self.max_genome) > MAX_GENOME_HARD
        {
            return Err("genome bounds are invalid".into());
        }
        if self.max_energy == 0
            || self.initial_energy > self.max_energy
            || self.child_energy > self.max_energy
        {
            return Err("energy bounds are invalid".into());
        }
        let required_genotypes = cells
            .saturating_mul(2)
            .saturating_add(self.max_fossils as usize);
        if (self.max_genotypes as usize) < required_genotypes || self.max_genotypes > 200_000 {
            return Err("max_genotypes cannot retain active organisms, parents and fossils".into());
        }
        for rate in [
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
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cell {
    pub occupant: Option<u32>,
    pub resource: u16,
    pub signal: i16,
    pub toxin: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChildBuffer {
    pub bytes: Vec<u8>,
    pub written: Vec<u8>,
    pub distinct_written: u16,
    pub target_cell: u32,
    pub write_count: u32,
    pub substitutions: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BirthMutation {
    pub substitutions: u16,
    pub insertions: u16,
    pub deletions: u16,
}

impl BirthMutation {
    fn total(&self) -> u32 {
        u32::from(self.substitutions) + u32::from(self.insertions) + u32::from(self.deletions)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organism {
    pub slot_id: u32,
    pub birth_id: u64,
    pub parent_birth_id: Option<u64>,
    pub parent_genotype_id: Option<u32>,
    pub lineage_id: u64,
    pub genotype_id: u32,
    pub genome: Vec<u8>,
    pub ip: u16,
    pub registers: [u32; 8],
    pub compare: CompareFlag,
    pub read_head: u16,
    pub write_head: u16,
    pub call_stack: [u16; 8],
    pub call_stack_len: u8,
    pub energy: u16,
    pub age_instructions: u64,
    pub age_updates: u32,
    pub generation: u32,
    pub orientation: u8,
    pub child: Option<ChildBuffer>,
    pub vm_rand_counter: u32,
    pub successful_children: u32,
    pub last_replication_instructions: u32,
    pub instructions_since_birth: u32,
    pub tasks_succeeded: u32,
    pub tasks_failed: u32,
    pub last_status: StatusCode,
    pub birth_mutation: BirthMutation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenotypeRecord {
    pub id: u32,
    pub hash: u64,
    pub bytes: Vec<u8>,
    pub first_seen_update: u64,
    pub active_count: u32,
    pub total_births: u64,
    pub total_deaths: u64,
    pub parent_genotype_id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FossilRecord {
    pub update: u64,
    pub genotype_id: u32,
    pub lineage_id: u64,
    pub reason: String,
    pub active_count: u32,
    pub genome: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsSample {
    pub update: u64,
    pub instructions: u64,
    pub population: u32,
    pub genotype_count: u32,
    pub retired_genotype_count: u64,
    pub lineage_count: u32,
    pub dominant_genotype_id: Option<u32>,
    pub dominant_share_ppm: u32,
    pub median_genome_length: u16,
    pub median_energy: u16,
    pub births: u32,
    pub deaths: u32,
    pub mean_mutations_milli: u32,
    pub mean_replication_instructions: u32,
    pub tasks_succeeded: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterventionRecord {
    pub id: u64,
    pub update: u64,
    pub kind: String,
    pub value: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct World {
    pub engine_version: String,
    pub build_id: String,
    pub isa_version: u16,
    pub rng_version: u16,
    pub physics_version: u16,
    pub substrate_id: String,
    pub preset_id: String,
    pub config: WorldConfig,
    pub seed: u64,
    pub update: u64,
    pub instructions: u64,
    pub cells: Vec<Cell>,
    pub organisms: Vec<Option<Organism>>,
    pub free_slots: Vec<u32>,
    pub next_birth_id: u64,
    pub next_lineage_id: u64,
    pub genotype_lookup: BTreeMap<Vec<u8>, u32>,
    pub genotypes: Vec<GenotypeRecord>,
    pub fossils: Vec<FossilRecord>,
    pub stats: Vec<StatsSample>,
    pub interventions: Vec<InterventionRecord>,
    pub next_intervention_id: u64,
    pub births_interval: u32,
    pub deaths_interval: u32,
    pub mutations_interval: u64,
    pub replication_instructions_interval: u64,
    pub replications_interval: u32,
    pub tasks_interval: u32,
    pub last_dominant: Option<u32>,
    pub retired_genotypes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldSummary {
    pub build_id: String,
    pub engine_version: String,
    pub preset_id: String,
    pub seed: u64,
    pub width: u16,
    pub height: u16,
    pub update: u64,
    pub instructions: u64,
    pub population: u32,
    pub genotype_count: u32,
    pub retired_genotype_count: u64,
    pub lineage_count: u32,
    pub dominant_genotype_id: Option<u32>,
    pub dominant_share_ppm: u32,
    pub mutation: MutationConfig,
    pub expected_substitutions_milli_minimal: u32,
    pub checksum: String,
    pub stats: Vec<StatsSample>,
    pub fossils: Vec<FossilRecord>,
    pub top_genotypes: Vec<GenotypeSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenotypeSummary {
    pub id: u32,
    pub hash_hex: String,
    pub active_count: u32,
    pub total_births: u64,
    pub genome_length: u16,
    pub first_seen_update: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstructionView {
    pub address: u16,
    pub byte: u8,
    pub op: u8,
    pub arg: u8,
    pub mnemonic: String,
    pub operand: String,
    pub current: bool,
    pub read_head: bool,
    pub template: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrganismView {
    pub cell_index: u32,
    pub x: u16,
    pub y: u16,
    pub birth_id: u64,
    pub parent_birth_id: Option<u64>,
    pub lineage_id: u64,
    pub genotype_id: u32,
    pub genotype_hash_hex: String,
    pub generation: u32,
    pub age_instructions: u64,
    pub age_updates: u32,
    pub energy: u16,
    pub max_energy: u16,
    pub genome_length: u16,
    pub genome: Vec<u8>,
    pub parent_genome: Option<Vec<u8>>,
    pub ip: u16,
    pub registers: [u32; 8],
    pub compare: CompareFlag,
    pub read_head: u16,
    pub write_head: u16,
    pub child_length: u16,
    pub child_written: u16,
    pub successful_children: u32,
    pub last_replication_instructions: u32,
    pub tasks_succeeded: u32,
    pub last_status: StatusCode,
    pub birth_mutation: BirthMutation,
    pub local_resource: u16,
    pub disassembly: Vec<InstructionView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxTrace {
    pub genome: Vec<u8>,
    pub steps: Vec<SandboxStep>,
    pub divided: bool,
    pub child: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxStep {
    pub step: u32,
    pub ip: u16,
    pub byte: u8,
    pub mnemonic: String,
    pub registers: [u32; 8],
    pub read_head: u16,
    pub write_head: u16,
    pub energy: u16,
    pub status: StatusCode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViabilityResult {
    pub genome_length: u16,
    pub divided: bool,
    pub child_divided: bool,
    pub first_division_instructions: Option<u64>,
    pub exact_child: bool,
    pub final_status: StatusCode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeighbourhoodReport {
    pub ancestor: String,
    pub genome_length: u16,
    pub substitutions_tested: u32,
    pub substitutions_divided: u32,
    pub substitutions_child_divided: u32,
    pub substitutions_faster: u32,
    pub deletions_tested: u32,
    pub deletions_divided: u32,
    pub deletions_child_divided: u32,
    pub insertions_tested: u32,
    pub insertions_divided: u32,
    pub insertions_child_divided: u32,
    pub baseline_division_instructions: Option<u64>,
}

#[derive(Debug, Clone)]
struct BirthIntent {
    target_cell: usize,
    parent_slot: u32,
    parent_birth_id: u64,
    parent_genotype_id: u32,
    parent_lineage_id: u64,
    generation: u32,
    genome: Vec<u8>,
    mutation: BirthMutation,
    contention_key: u64,
}

#[derive(Debug, Clone)]
struct MoveIntent {
    source_cell: usize,
    target_cell: usize,
    slot_id: u32,
    contention_key: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExecSignal {
    Continue,
    Yield,
}

impl World {
    pub fn from_preset(preset: &str, seed: u64) -> Result<Self, String> {
        match preset {
            "first-replicator" => {
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
                };
                let mut world = Self::new(config, seed, preset)?;
                world.seed_organism(
                    usize::from(world.config.width / 2),
                    usize::from(world.config.height / 2),
                    MINIMAL_ANCESTOR.to_vec(),
                )?;
                Ok(world)
            }
            "mutation-meltdown" => {
                let config = WorldConfig {
                    width: 96,
                    height: 64,
                    mutation: MutationConfig {
                        substitution_ppm: 28_000,
                        insertion_ppm: 12_000,
                        deletion_ppm: 12_000,
                    },
                    ..WorldConfig::default()
                };
                let mut world = Self::new(config, seed, preset)?;
                world.seed_cluster(&clumsy_ancestor(), 6, 4)?;
                Ok(world)
            }
            "bottleneck" => {
                let config = WorldConfig {
                    width: 96,
                    height: 64,
                    mutation: MutationConfig {
                        substitution_ppm: 2_000,
                        insertion_ppm: 2_500,
                        deletion_ppm: 2_500,
                    },
                    ..WorldConfig::default()
                };
                let mut world = Self::new(config, seed, preset)?;
                world.seed_cluster(&clumsy_ancestor(), 10, 6)?;
                Ok(world)
            }
            "blue-nutrient" => {
                let config = WorldConfig {
                    width: 96,
                    height: 64,
                    capabilities: CAP_LOGIC | CAP_MOVE | CAP_SIGNAL | CAP_SHARE,
                    resource_replenish: 2,
                    logic_reward: 120,
                    seasonal_period: 600,
                    ..WorldConfig::default()
                };
                let mut world = Self::new(config, seed, preset)?;
                world.seed_cluster(&clumsy_ancestor(), 6, 4)?;
                Ok(world)
            }
            _ => {
                let config = WorldConfig::default();
                let mut world = Self::new(config, seed, "faster-smaller")?;
                world.seed_cluster(&clumsy_ancestor(), 6, 4)?;
                Ok(world)
            }
        }
    }

    pub fn new(config: WorldConfig, seed: u64, preset_id: &str) -> Result<Self, String> {
        config.validate()?;
        if !valid_identifier(preset_id, 64) {
            return Err("preset identifier is invalid".into());
        }
        let len = usize::from(config.width) * usize::from(config.height);
        let cells = (0..len)
            .map(|idx| Cell {
                occupant: None,
                resource: initial_resource(seed, idx, config.resource_cap),
                signal: 0,
                toxin: 0,
            })
            .collect();
        Ok(Self {
            engine_version: ENGINE_VERSION.to_string(),
            build_id: BUILD_ID.to_string(),
            isa_version: ISA_VERSION,
            rng_version: RNG_VERSION,
            physics_version: PHYSICS_VERSION,
            substrate_id: "grid-private-child-v1".into(),
            preset_id: preset_id.into(),
            config,
            seed,
            update: 0,
            instructions: 0,
            cells,
            organisms: Vec::new(),
            free_slots: Vec::new(),
            next_birth_id: 1,
            next_lineage_id: 1,
            genotype_lookup: BTreeMap::new(),
            genotypes: Vec::new(),
            fossils: Vec::new(),
            stats: Vec::new(),
            interventions: Vec::new(),
            next_intervention_id: 1,
            births_interval: 0,
            deaths_interval: 0,
            mutations_interval: 0,
            replication_instructions_interval: 0,
            replications_interval: 0,
            tasks_interval: 0,
            last_dominant: None,
            retired_genotypes: 0,
        })
    }

    pub fn seed_cluster(
        &mut self,
        genome: &[u8],
        columns: usize,
        rows: usize,
    ) -> Result<(), String> {
        let start_x = usize::from(self.config.width).saturating_sub(columns) / 2;
        let start_y = usize::from(self.config.height).saturating_sub(rows) / 2;
        for y in 0..rows {
            for x in 0..columns {
                self.seed_organism(start_x + x, start_y + y, genome.to_vec())?;
            }
        }
        Ok(())
    }

    pub fn seed_organism(&mut self, x: usize, y: usize, genome: Vec<u8>) -> Result<u64, String> {
        if genome.len() < usize::from(self.config.min_genome)
            || genome.len() > usize::from(self.config.max_genome)
        {
            return Err("seed genome length is outside world limits".into());
        }
        let cell_index = self.cell_index(x, y);
        if self.cells[cell_index].occupant.is_some() {
            return Err("seed cell is occupied".into());
        }
        let genotype_id = self.intern_genotype(genome.clone(), None);
        let birth_id = self.next_birth_id;
        self.next_birth_id += 1;
        let lineage_id = self.next_lineage_id;
        self.next_lineage_id += 1;
        let slot_id = self.alloc_slot();
        let organism = Organism {
            slot_id,
            birth_id,
            parent_birth_id: None,
            parent_genotype_id: None,
            lineage_id,
            genotype_id,
            genome,
            ip: 0,
            registers: [0; 8],
            compare: CompareFlag::Equal,
            read_head: 0,
            write_head: 0,
            call_stack: [0; 8],
            call_stack_len: 0,
            energy: self.config.initial_energy,
            age_instructions: 0,
            age_updates: 0,
            generation: 0,
            orientation: 0,
            child: None,
            vm_rand_counter: 0,
            successful_children: 0,
            last_replication_instructions: 0,
            instructions_since_birth: 0,
            tasks_succeeded: 0,
            tasks_failed: 0,
            last_status: StatusCode::Ok,
            birth_mutation: BirthMutation {
                substitutions: 0,
                insertions: 0,
                deletions: 0,
            },
        };
        self.organisms[slot_id as usize] = Some(organism);
        self.cells[cell_index].occupant = Some(slot_id);
        self.genotypes[genotype_id as usize].active_count += 1;
        self.genotypes[genotype_id as usize].total_births += 1;
        self.maybe_fossil(genotype_id, lineage_id, "founder");
        Ok(birth_id)
    }

    pub fn run_updates(&mut self, count: u32) {
        for _ in 0..count {
            self.run_one_update();
        }
    }

    pub fn run_one_update(&mut self) {
        self.advance_environment();
        let n = self.cells.len();
        let (start, step) = scheduler_params(self.seed, self.update, n);
        let mut births = Vec::new();
        let mut moves = Vec::new();

        for visit in 0..n {
            let cell_index = (start + visit.wrapping_mul(step)) % n;
            let Some(slot_id) = self.cells[cell_index].occupant else {
                continue;
            };
            let Some(mut organism) = self.organisms[slot_id as usize].take() else {
                self.cells[cell_index].occupant = None;
                continue;
            };

            organism.age_updates = organism.age_updates.saturating_add(1);
            organism.energy = organism.energy.saturating_sub(self.config.maintenance_cost);
            if organism.energy == 0 {
                self.finish_death(cell_index, organism);
                continue;
            }

            for _ in 0..self.config.instructions_per_update {
                let signal =
                    self.execute_instruction(cell_index, &mut organism, &mut births, &mut moves);
                if organism.energy == 0 || signal == ExecSignal::Yield {
                    break;
                }
            }

            if organism.energy == 0 {
                self.finish_death(cell_index, organism);
            } else {
                self.organisms[slot_id as usize] = Some(organism);
            }
        }

        self.commit_moves(moves);
        self.commit_births(births);
        // Keep the checkpoint invariant true at every externally observable
        // update, not only when the statistics sampler happens to run.
        self.prune_genotypes();
        self.update = self.update.wrapping_add(1);

        if self.config.sample_period > 0 && self.update % u64::from(self.config.sample_period) == 0
        {
            self.sample_stats();
        }
    }

    fn execute_instruction(
        &mut self,
        cell_index: usize,
        organism: &mut Organism,
        births: &mut Vec<BirthIntent>,
        moves: &mut Vec<MoveIntent>,
    ) -> ExecSignal {
        if organism.genome.is_empty() {
            organism.energy = 0;
            return ExecSignal::Yield;
        }
        let len = organism.genome.len();
        let ip = usize::from(organism.ip) % len;
        let byte = organism.genome[ip];
        let (op, arg) = decode(byte);
        let mut next_ip = (ip + 1) % len;

        organism.energy = organism.energy.saturating_sub(1);
        organism.age_instructions = organism.age_instructions.wrapping_add(1);
        organism.instructions_since_birth = organism.instructions_since_birth.wrapping_add(1);
        self.instructions = self.instructions.wrapping_add(1);

        match op {
            0 => {}
            1 => organism.registers[arg as usize] = 0,
            2 => {
                let r = &mut organism.registers[arg as usize];
                *r = r.wrapping_add(1);
            }
            3 => {
                let r = &mut organism.registers[arg as usize];
                *r = r.wrapping_sub(1);
            }
            4 => organism.registers[arg as usize] = !organism.registers[arg as usize],
            5 => {
                let dst = arg as usize;
                let src = (dst + 7) & 7;
                organism.registers[dst] = organism.registers[src];
            }
            6 => {
                let a = arg as usize;
                let b = (a + 7) & 7;
                organism.registers.swap(a, b);
            }
            7 => binary_wrapping(organism, arg, u32::wrapping_add),
            8 => binary_wrapping(organism, arg, u32::wrapping_sub),
            9 => binary_wrapping(organism, arg, |a, b| a ^ b),
            10 => binary_wrapping(organism, arg, |a, b| !(a & b)),
            11 => {
                let r = &mut organism.registers[arg as usize];
                *r = r.wrapping_shl(1);
            }
            12 => organism.registers[arg as usize] >>= 1,
            13 => {
                let value = keyed_random(
                    self.seed,
                    DOMAIN_VM_RAND,
                    organism.birth_id,
                    u64::from(organism.vm_rand_counter),
                    0,
                );
                organism.vm_rand_counter = organism.vm_rand_counter.wrapping_add(1);
                organism.registers[arg as usize] = value as u32;
            }
            14 => {
                let a = arg as usize;
                let b = (a + 7) & 7;
                organism.compare = match organism.registers[a].cmp(&organism.registers[b]) {
                    Ordering::Less => CompareFlag::Less,
                    Ordering::Equal => CompareFlag::Equal,
                    Ordering::Greater => CompareFlag::Greater,
                };
            }
            15..=17 => {
                let execute = match op {
                    15 => organism.compare == CompareFlag::Equal,
                    16 => organism.compare != CompareFlag::Equal,
                    17 => organism.compare == CompareFlag::Less,
                    _ => false,
                };
                if !execute {
                    next_ip =
                        (next_ip + complete_instruction_extra(&organism.genome, next_ip)) % len;
                }
            }
            18 | 19 => {
                let (template, after_template) = local_template(&organism.genome, ip);
                next_ip = after_template;
                if template.is_empty() {
                    organism.last_status = StatusCode::TemplateNotFound;
                } else if let Some(target) = find_template(
                    &organism.genome,
                    ip,
                    after_template,
                    &template,
                    arg & 1 == 1,
                ) {
                    if op == 19 {
                        if organism.call_stack_len as usize >= organism.call_stack.len() {
                            organism.last_status = StatusCode::StackFull;
                        } else {
                            organism.call_stack[organism.call_stack_len as usize] =
                                after_template as u16;
                            organism.call_stack_len += 1;
                            next_ip = target;
                            organism.last_status = StatusCode::Ok;
                        }
                    } else {
                        next_ip = target;
                        organism.last_status = StatusCode::Ok;
                    }
                } else {
                    organism.last_status = StatusCode::TemplateNotFound;
                }
            }
            20 => {
                if organism.call_stack_len == 0 {
                    organism.last_status = StatusCode::StackEmpty;
                } else {
                    organism.call_stack_len -= 1;
                    next_ip =
                        usize::from(organism.call_stack[organism.call_stack_len as usize]) % len;
                    organism.last_status = StatusCode::Ok;
                }
            }
            21 => {
                organism.registers[0] = match arg {
                    0 => len as u32,
                    1 => u32::from(organism.energy),
                    2 => organism.age_updates,
                    3 => organism.generation,
                    4 => organism.child.as_ref().map_or(0, |c| c.bytes.len() as u32),
                    5 => organism
                        .child
                        .as_ref()
                        .map_or(0, |c| u32::from(c.distinct_written)),
                    6 => u32::from(self.cells[cell_index].resource),
                    _ => organism.last_status as u32,
                };
            }
            22 => {
                let requested = organism.registers[0] as usize;
                if requested < usize::from(self.config.min_genome)
                    || requested > usize::from(self.config.max_genome)
                {
                    organism.last_status = StatusCode::InvalidLength;
                } else if organism.energy <= self.config.allocation_cost {
                    organism.last_status = StatusCode::InsufficientEnergy;
                } else {
                    let target = self.allocation_target(cell_index, arg, organism);
                    organism.energy = organism.energy.saturating_sub(self.config.allocation_cost);
                    organism.child = Some(ChildBuffer {
                        bytes: vec![encode(0, 0); requested],
                        written: vec![0; requested],
                        distinct_written: 0,
                        target_cell: target as u32,
                        write_count: 0,
                        substitutions: 0,
                    });
                    organism.read_head = 0;
                    organism.write_head = 0;
                    organism.last_status = StatusCode::Ok;
                }
            }
            23 => match arg {
                0 => {
                    organism.read_head = 0;
                    organism.write_head = 0;
                    organism.last_status = StatusCode::Ok;
                }
                1 => {
                    organism.read_head = (organism.registers[0] as usize % len) as u16;
                    organism.last_status = StatusCode::Ok;
                }
                2 => {
                    if let Some(child) = organism.child.as_ref() {
                        organism.write_head =
                            (organism.registers[0] as usize % child.bytes.len()) as u16;
                        organism.last_status = StatusCode::Ok;
                    } else {
                        organism.last_status = StatusCode::NoChild;
                    }
                }
                3 => organism.registers[0] = u32::from(organism.read_head),
                4 => organism.registers[0] = u32::from(organism.write_head),
                5 => organism.read_head = ((usize::from(organism.read_head) + 1) % len) as u16,
                6 => {
                    if let Some(child) = organism.child.as_ref() {
                        organism.write_head =
                            ((usize::from(organism.write_head) + 1) % child.bytes.len()) as u16;
                    } else {
                        organism.last_status = StatusCode::NoChild;
                    }
                }
                _ => {
                    if organism.child.is_some() {
                        std::mem::swap(&mut organism.read_head, &mut organism.write_head);
                        organism.read_head %= len as u16;
                        if let Some(child) = organism.child.as_ref() {
                            organism.write_head %= child.bytes.len() as u16;
                        }
                        organism.last_status = StatusCode::Ok;
                    } else {
                        organism.last_status = StatusCode::NoChild;
                    }
                }
            },
            24 => {
                let idx = usize::from(organism.read_head) % len;
                organism.registers[arg as usize] = u32::from(organism.genome[idx]);
                organism.read_head = ((idx + 1) % len) as u16;
            }
            25 => {
                if let Some(child) = organism.child.as_mut() {
                    let idx = usize::from(organism.write_head) % child.bytes.len();
                    let intended = organism.registers[arg as usize] as u8;
                    let mut written = intended;
                    let roll = keyed_random(
                        self.seed,
                        DOMAIN_COPY_MUTATION,
                        organism.birth_id,
                        u64::from(organism.successful_children),
                        u64::from(child.write_count),
                    );
                    if chance(roll, self.config.mutation.substitution_ppm) {
                        let delta = ((roll >> 32) as u8).wrapping_add(1);
                        written = intended.wrapping_add(delta);
                        if written == intended {
                            written ^= 0x80;
                        }
                        child.substitutions = child.substitutions.saturating_add(1);
                    }
                    child.bytes[idx] = written;
                    if child.written[idx] == 0 {
                        child.written[idx] = 1;
                        child.distinct_written = child.distinct_written.saturating_add(1);
                    }
                    child.write_count = child.write_count.wrapping_add(1);
                    organism.write_head = ((idx + 1) % child.bytes.len()) as u16;
                    organism.last_status = StatusCode::Ok;
                } else {
                    organism.last_status = StatusCode::NoChild;
                }
            }
            26 => {
                let Some(child) = organism.child.take() else {
                    organism.last_status = StatusCode::NoChild;
                    organism.ip = next_ip as u16;
                    return ExecSignal::Continue;
                };
                if usize::from(child.distinct_written) != child.bytes.len() {
                    organism.last_status = StatusCode::IncompleteChild;
                    organism.ip = next_ip as u16;
                    return ExecSignal::Continue;
                }
                let required = self
                    .config
                    .division_cost
                    .saturating_add(self.config.child_energy);
                if organism.energy < required {
                    organism.last_status = StatusCode::InsufficientEnergy;
                    organism.ip = next_ip as u16;
                    return ExecSignal::Continue;
                }
                organism.energy -= required;
                let (child_genome, mutation) = self.apply_division_mutation(
                    child.bytes,
                    child.substitutions,
                    organism.birth_id,
                    organism.successful_children,
                );
                if child_genome.len() < usize::from(self.config.min_genome)
                    || child_genome.len() > usize::from(self.config.max_genome)
                {
                    organism.last_status = StatusCode::InvalidLength;
                    organism.ip = next_ip as u16;
                    return ExecSignal::Yield;
                }
                let key = keyed_random(
                    self.seed,
                    DOMAIN_CONTENTION,
                    self.update,
                    u64::from(child.target_cell),
                    organism.birth_id,
                );
                births.push(BirthIntent {
                    target_cell: child.target_cell as usize,
                    parent_slot: organism.slot_id,
                    parent_birth_id: organism.birth_id,
                    parent_genotype_id: organism.genotype_id,
                    parent_lineage_id: organism.lineage_id,
                    generation: organism.generation.saturating_add(1),
                    genome: child_genome,
                    mutation,
                    contention_key: key,
                });
                organism.last_replication_instructions = organism.instructions_since_birth;
                organism.instructions_since_birth = 0;
                organism.last_status = StatusCode::BirthPending;
                organism.ip = next_ip as u16;
                return ExecSignal::Yield;
            }
            27 => {
                let (x, y) = self.xy(cell_index);
                let inputs = environmental_inputs(self.seed, self.update, cell_index as u64);
                organism.registers[0] = match arg {
                    0 => u32::from(self.cells[cell_index].resource),
                    1 => x as u32,
                    2 => y as u32,
                    3 => inputs.0,
                    4 => inputs.1,
                    5 => self.season_bit() as u32,
                    6 => self.neighbour_occupancy(cell_index),
                    _ => u32::from(self.cells[cell_index].toxin),
                };
            }
            28 => {
                if self.config.capabilities & CAP_MOVE == 0 {
                    organism.last_status = StatusCode::Disabled;
                } else {
                    let target = self.direction_target(cell_index, arg, organism.orientation);
                    moves.push(MoveIntent {
                        source_cell: cell_index,
                        target_cell: target,
                        slot_id: organism.slot_id,
                        contention_key: keyed_random(
                            self.seed,
                            DOMAIN_MOVE,
                            self.update,
                            target as u64,
                            organism.birth_id,
                        ),
                    });
                    organism.last_status = StatusCode::MovePending;
                    organism.ip = next_ip as u16;
                    return ExecSignal::Yield;
                }
            }
            29 => {
                let cell = &mut self.cells[cell_index];
                let amount = cell.resource.min(self.config.uptake_packet);
                if amount == 0 {
                    organism.last_status = StatusCode::NoResource;
                } else {
                    cell.resource -= amount;
                    let toxin_cost = cell.toxin.min(amount / 2);
                    organism.energy = organism
                        .energy
                        .saturating_add(amount.saturating_sub(toxin_cost))
                        .min(self.config.max_energy);
                    organism.last_status = StatusCode::Ok;
                }
            }
            30 => {
                if self.config.capabilities & CAP_SIGNAL == 0 {
                    organism.last_status = StatusCode::Disabled;
                } else {
                    let target = if arg & 4 == 0 {
                        cell_index
                    } else {
                        self.direction_target(cell_index, arg & 3, organism.orientation)
                    };
                    self.cells[target].signal = (organism.registers[0] as i32)
                        .clamp(i16::MIN as i32, i16::MAX as i32)
                        as i16;
                    organism.last_status = StatusCode::Ok;
                }
            }
            31 => self.execute_action(cell_index, organism, arg),
            _ => unreachable!(),
        }

        organism.ip = next_ip as u16;
        ExecSignal::Continue
    }

    fn execute_action(&mut self, cell_index: usize, organism: &mut Organism, arg: u8) {
        match arg {
            0 | 1 => {
                if self.config.capabilities & CAP_LOGIC == 0 {
                    organism.last_status = StatusCode::Disabled;
                    return;
                }
                let (a, b) = environmental_inputs(self.seed, self.update, cell_index as u64);
                let expected = if arg == 0 { a ^ b } else { !a };
                if organism.registers[0] == expected {
                    organism.energy = organism
                        .energy
                        .saturating_add(self.config.logic_reward)
                        .min(self.config.max_energy);
                    organism.tasks_succeeded = organism.tasks_succeeded.saturating_add(1);
                    self.tasks_interval = self.tasks_interval.saturating_add(1);
                    organism.last_status = StatusCode::TaskSucceeded;
                } else {
                    organism.tasks_failed = organism.tasks_failed.saturating_add(1);
                    organism.last_status = StatusCode::TaskFailed;
                }
            }
            2 => {
                organism.orientation = organism.orientation.wrapping_add(1) & 3;
                organism.last_status = StatusCode::Ok;
            }
            3 => {
                if self.config.capabilities & CAP_SHARE == 0 {
                    organism.last_status = StatusCode::Disabled;
                    return;
                }
                let target = self.direction_target(cell_index, 0, organism.orientation);
                let amount = (organism.registers[0] as u16).min(organism.energy / 2);
                if let Some(target_slot) = self.cells[target].occupant {
                    if let Some(other) = self.organisms[target_slot as usize].as_mut() {
                        organism.energy -= amount;
                        other.energy = other
                            .energy
                            .saturating_add(amount)
                            .min(self.config.max_energy);
                        organism.last_status = StatusCode::Ok;
                    }
                }
            }
            4 => {
                // A disclosed, deterministic toxin secretion interaction.
                let amount = (organism.registers[0] as u16).min(32);
                if organism.energy >= amount {
                    organism.energy -= amount;
                    self.cells[cell_index].toxin =
                        self.cells[cell_index].toxin.saturating_add(amount);
                    organism.last_status = StatusCode::Ok;
                } else {
                    organism.last_status = StatusCode::InsufficientEnergy;
                }
            }
            _ => organism.last_status = StatusCode::Disabled,
        }
    }

    fn apply_division_mutation(
        &mut self,
        mut genome: Vec<u8>,
        copy_substitutions: u16,
        parent_birth_id: u64,
        child_index: u32,
    ) -> (Vec<u8>, BirthMutation) {
        let mut mutation = BirthMutation {
            substitutions: copy_substitutions,
            insertions: 0,
            deletions: 0,
        };
        // Copy substitutions have already happened and are inferred later from
        // parent/child bytes.  Count them here for the birth record.
        // Alignment is exact before insertion/deletion, so a byte-wise count is
        // meaningful at this point.
        // The parent bytes are not passed here; the caller fills this below.

        let ins_roll = keyed_random(
            self.seed,
            DOMAIN_DIV_MUTATION,
            parent_birth_id,
            u64::from(child_index),
            0,
        );
        if chance(ins_roll, self.config.mutation.insertion_ppm)
            && genome.len() < usize::from(self.config.max_genome)
        {
            let boundary = ((ins_roll >> 24) as usize) % (genome.len() + 1);
            let byte = (ins_roll >> 48) as u8;
            genome.insert(boundary, byte);
            mutation.insertions = 1;
        }

        let del_roll = keyed_random(
            self.seed,
            DOMAIN_DIV_MUTATION,
            parent_birth_id,
            u64::from(child_index),
            1,
        );
        if chance(del_roll, self.config.mutation.deletion_ppm)
            && genome.len() > usize::from(self.config.min_genome)
        {
            let position = ((del_roll >> 24) as usize) % genome.len();
            genome.remove(position);
            mutation.deletions = 1;
        }
        (genome, mutation)
    }

    fn commit_moves(&mut self, moves: Vec<MoveIntent>) {
        let mut winners: BTreeMap<usize, MoveIntent> = BTreeMap::new();
        for intent in moves {
            if self.cells[intent.target_cell].occupant.is_some() {
                continue;
            }
            winners
                .entry(intent.target_cell)
                .and_modify(|old| {
                    if (intent.contention_key, intent.slot_id) < (old.contention_key, old.slot_id) {
                        *old = intent.clone();
                    }
                })
                .or_insert(intent);
        }
        for (_, intent) in winners {
            if self.cells[intent.source_cell].occupant != Some(intent.slot_id)
                || self.cells[intent.target_cell].occupant.is_some()
            {
                continue;
            }
            self.cells[intent.source_cell].occupant = None;
            self.cells[intent.target_cell].occupant = Some(intent.slot_id);
        }
    }

    fn commit_births(&mut self, births: Vec<BirthIntent>) {
        let mut winners: BTreeMap<usize, BirthIntent> = BTreeMap::new();
        for intent in births {
            if intent.target_cell >= self.cells.len() {
                continue;
            }
            if self.config.occupancy_policy == OccupancyPolicy::EmptyOnly
                && self.cells[intent.target_cell].occupant.is_some()
            {
                continue;
            }
            winners
                .entry(intent.target_cell)
                .and_modify(|old| {
                    if (intent.contention_key, intent.parent_birth_id)
                        < (old.contention_key, old.parent_birth_id)
                    {
                        *old = intent.clone();
                    }
                })
                .or_insert(intent);
        }

        for (_, mut intent) in winners {
            if intent.mutation.substitutions == 0 {
                if let Some(parent) = self
                    .organisms
                    .get(intent.parent_slot as usize)
                    .and_then(Option::as_ref)
                {
                    if parent.genome.len() == intent.genome.len() {
                        intent.mutation.substitutions = parent
                            .genome
                            .iter()
                            .zip(&intent.genome)
                            .filter(|(a, b)| a != b)
                            .count()
                            .min(u16::MAX as usize)
                            as u16;
                    }
                }
            }

            if let Some(victim_slot) = self.cells[intent.target_cell].occupant {
                if self.config.occupancy_policy == OccupancyPolicy::EmptyOnly {
                    continue;
                }
                if let Some(victim) = self.organisms[victim_slot as usize].take() {
                    self.record_death(victim);
                    self.free_slots.push(victim_slot);
                }
            }

            let mutation_total = intent.mutation.total();
            let lineage_id = if mutation_total == 0 {
                intent.parent_lineage_id
            } else {
                let id = self.next_lineage_id;
                self.next_lineage_id += 1;
                id
            };
            let genotype_id =
                self.intern_genotype(intent.genome.clone(), Some(intent.parent_genotype_id));
            let slot_id = self.alloc_slot();
            let birth_id = self.next_birth_id;
            self.next_birth_id += 1;
            let organism = Organism {
                slot_id,
                birth_id,
                parent_birth_id: Some(intent.parent_birth_id),
                parent_genotype_id: Some(intent.parent_genotype_id),
                lineage_id,
                genotype_id,
                genome: intent.genome,
                ip: 0,
                registers: [0; 8],
                compare: CompareFlag::Equal,
                read_head: 0,
                write_head: 0,
                call_stack: [0; 8],
                call_stack_len: 0,
                energy: self.config.child_energy,
                age_instructions: 0,
                age_updates: 0,
                generation: intent.generation,
                orientation: 0,
                child: None,
                vm_rand_counter: 0,
                successful_children: 0,
                last_replication_instructions: 0,
                instructions_since_birth: 0,
                tasks_succeeded: 0,
                tasks_failed: 0,
                last_status: StatusCode::Ok,
                birth_mutation: intent.mutation.clone(),
            };
            self.organisms[slot_id as usize] = Some(organism);
            self.cells[intent.target_cell].occupant = Some(slot_id);
            self.genotypes[genotype_id as usize].active_count += 1;
            self.genotypes[genotype_id as usize].total_births += 1;
            self.births_interval = self.births_interval.saturating_add(1);
            self.mutations_interval = self
                .mutations_interval
                .saturating_add(u64::from(mutation_total));

            if let Some(parent) = self
                .organisms
                .get_mut(intent.parent_slot as usize)
                .and_then(Option::as_mut)
            {
                parent.successful_children = parent.successful_children.saturating_add(1);
                self.replication_instructions_interval = self
                    .replication_instructions_interval
                    .saturating_add(u64::from(parent.last_replication_instructions));
                self.replications_interval = self.replications_interval.saturating_add(1);
            }

            if mutation_total > 0 && self.fossils.len() < self.config.max_fossils as usize {
                self.maybe_fossil(genotype_id, lineage_id, "new mutation branch");
            }
        }
    }

    fn finish_death(&mut self, cell_index: usize, organism: Organism) {
        let slot = organism.slot_id;
        self.cells[cell_index].occupant = None;
        self.record_death(organism);
        self.free_slots.push(slot);
    }

    fn record_death(&mut self, organism: Organism) {
        if let Some(genotype) = self.genotypes.get_mut(organism.genotype_id as usize) {
            genotype.active_count = genotype.active_count.saturating_sub(1);
            genotype.total_deaths = genotype.total_deaths.saturating_add(1);
        }
        self.deaths_interval = self.deaths_interval.saturating_add(1);
    }

    fn advance_environment(&mut self) {
        let seasonal = self.season_bit();
        for (idx, cell) in self.cells.iter_mut().enumerate() {
            let mut replenish = self.config.resource_replenish;
            if self.config.seasonal_period > 0 {
                let (x, _) = xy_for(idx, usize::from(self.config.width));
                let east = x >= usize::from(self.config.width) / 2;
                if east == seasonal {
                    replenish = replenish.saturating_mul(2);
                } else {
                    replenish /= 2;
                }
            }
            cell.resource = cell
                .resource
                .saturating_add(replenish)
                .min(self.config.resource_cap);
            if cell.signal > 0 {
                cell.signal -= 1;
            } else if cell.signal < 0 {
                cell.signal += 1;
            }
            cell.toxin = cell.toxin.saturating_sub(1);
        }
    }

    fn sample_stats(&mut self) {
        let mut population = 0u32;
        let mut lineages = BTreeSet::new();
        let mut lengths = Vec::new();
        let mut energies = Vec::new();
        for organism in self.organisms.iter().flatten() {
            population += 1;
            lineages.insert(organism.lineage_id);
            lengths.push(organism.genome.len() as u16);
            energies.push(organism.energy);
        }
        lengths.sort_unstable();
        energies.sort_unstable();
        let dominant = self
            .genotypes
            .iter()
            .filter(|g| g.active_count > 0)
            .max_by_key(|g| (g.active_count, std::cmp::Reverse(g.id)));
        let dominant_id = dominant.map(|g| g.id);
        let dominant_share_ppm = dominant
            .map(|g| {
                if population == 0 {
                    0
                } else {
                    ((u64::from(g.active_count) * 1_000_000) / u64::from(population)) as u32
                }
            })
            .unwrap_or(0);
        let genotype_count = self.genotypes.iter().filter(|g| g.active_count > 0).count() as u32;
        let sample = StatsSample {
            update: self.update,
            instructions: self.instructions,
            population,
            genotype_count,
            retired_genotype_count: self.retired_genotypes,
            lineage_count: lineages.len() as u32,
            dominant_genotype_id: dominant_id,
            dominant_share_ppm,
            median_genome_length: median(&lengths),
            median_energy: median(&energies),
            births: self.births_interval,
            deaths: self.deaths_interval,
            mean_mutations_milli: if self.births_interval == 0 {
                0
            } else {
                ((self.mutations_interval * 1_000) / u64::from(self.births_interval)) as u32
            },
            mean_replication_instructions: if self.replications_interval == 0 {
                0
            } else {
                (self.replication_instructions_interval / u64::from(self.replications_interval))
                    as u32
            },
            tasks_succeeded: self.tasks_interval,
        };
        self.stats.push(sample);
        if self.stats.len() > self.config.max_samples as usize {
            let drain = self.stats.len() - self.config.max_samples as usize;
            self.stats.drain(0..drain);
        }
        if dominant_id != self.last_dominant {
            if let Some(id) = dominant_id {
                let lineage = self
                    .organisms
                    .iter()
                    .flatten()
                    .find(|o| o.genotype_id == id)
                    .map(|o| o.lineage_id)
                    .unwrap_or(0);
                self.maybe_fossil(id, lineage, "became dominant");
            }
            self.last_dominant = dominant_id;
        }
        self.prune_genotypes();
        self.births_interval = 0;
        self.deaths_interval = 0;
        self.mutations_interval = 0;
        self.replication_instructions_interval = 0;
        self.replications_interval = 0;
        self.tasks_interval = 0;
    }

    pub fn summary(&self) -> WorldSummary {
        let population = self.population();
        let dominant = self
            .genotypes
            .iter()
            .filter(|g| g.active_count > 0)
            .max_by_key(|g| (g.active_count, std::cmp::Reverse(g.id)));
        let dominant_share_ppm = dominant
            .map(|g| {
                if population == 0 {
                    0
                } else {
                    ((u64::from(g.active_count) * 1_000_000) / u64::from(population)) as u32
                }
            })
            .unwrap_or(0);
        let mut top: Vec<_> = self
            .genotypes
            .iter()
            .filter(|g| g.active_count > 0)
            .map(|g| GenotypeSummary {
                id: g.id,
                hash_hex: format!("{:016x}", g.hash),
                active_count: g.active_count,
                total_births: g.total_births,
                genome_length: g.bytes.len() as u16,
                first_seen_update: g.first_seen_update,
            })
            .collect();
        top.sort_by_key(|g| (std::cmp::Reverse(g.active_count), g.id));
        top.truncate(12);
        WorldSummary {
            build_id: self.build_id.clone(),
            engine_version: self.engine_version.clone(),
            preset_id: self.preset_id.clone(),
            seed: self.seed,
            width: self.config.width,
            height: self.config.height,
            update: self.update,
            instructions: self.instructions,
            population,
            genotype_count: self.genotypes.iter().filter(|g| g.active_count > 0).count() as u32,
            retired_genotype_count: self.retired_genotypes,
            lineage_count: self
                .organisms
                .iter()
                .flatten()
                .map(|o| o.lineage_id)
                .collect::<BTreeSet<_>>()
                .len() as u32,
            dominant_genotype_id: dominant.map(|g| g.id),
            dominant_share_ppm,
            mutation: self.config.mutation.clone(),
            expected_substitutions_milli_minimal: ((u64::from(
                self.config.mutation.substitution_ppm,
            ) * MINIMAL_ANCESTOR.len() as u64)
                / 1_000) as u32,
            checksum: self.checksum_hex(),
            stats: self.stats.clone(),
            fossils: self.fossils.clone(),
            top_genotypes: top,
        }
    }

    pub fn grid_snapshot(&self) -> Vec<u8> {
        let mut out = vec![0u8; self.cells.len() * GRID_STRIDE];
        for (idx, cell) in self.cells.iter().enumerate() {
            let base = idx * GRID_STRIDE;
            out[base + 4] = scale_u16(cell.resource, self.config.resource_cap);
            out[base + 6] = scale_u16(cell.toxin, 128);
            if let Some(slot) = cell.occupant {
                if let Some(organism) = self.organisms[slot as usize].as_ref() {
                    let colour = mix64(organism.lineage_id ^ 0x9e37_79b9_7f4a_7c15);
                    out[base] = 1;
                    out[base + 1] = colour as u8;
                    out[base + 2] = (colour >> 8) as u8;
                    out[base + 3] = scale_u16(organism.energy, self.config.max_energy);
                    out[base + 5] = if organism.child.is_some() { 1 } else { 0 }
                        | if organism.last_status == StatusCode::TaskSucceeded {
                            2
                        } else {
                            0
                        }
                        | if organism.energy < self.config.max_energy / 8 {
                            4
                        } else {
                            0
                        };
                    out[base + 7] = organism.genome.len().min(255) as u8;
                }
            }
        }
        out
    }

    pub fn inspect_cell(&self, cell_index: usize) -> Option<OrganismView> {
        let cell = self.cells.get(cell_index)?;
        let slot = cell.occupant?;
        let organism = self.organisms.get(slot as usize)?.as_ref()?;
        let genotype = &self.genotypes[organism.genotype_id as usize];
        let parent_genome = organism
            .parent_genotype_id
            .and_then(|id| self.genotypes.get(id as usize))
            .map(|g| g.bytes.clone());
        let (x, y) = self.xy(cell_index);
        Some(OrganismView {
            cell_index: cell_index as u32,
            x: x as u16,
            y: y as u16,
            birth_id: organism.birth_id,
            parent_birth_id: organism.parent_birth_id,
            lineage_id: organism.lineage_id,
            genotype_id: organism.genotype_id,
            genotype_hash_hex: format!("{:016x}", genotype.hash),
            generation: organism.generation,
            age_instructions: organism.age_instructions,
            age_updates: organism.age_updates,
            energy: organism.energy,
            max_energy: self.config.max_energy,
            genome_length: organism.genome.len() as u16,
            genome: organism.genome.clone(),
            parent_genome,
            ip: organism.ip,
            registers: organism.registers,
            compare: organism.compare,
            read_head: organism.read_head,
            write_head: organism.write_head,
            child_length: organism.child.as_ref().map_or(0, |c| c.bytes.len() as u16),
            child_written: organism.child.as_ref().map_or(0, |c| c.distinct_written),
            successful_children: organism.successful_children,
            last_replication_instructions: organism.last_replication_instructions,
            tasks_succeeded: organism.tasks_succeeded,
            last_status: organism.last_status,
            birth_mutation: organism.birth_mutation.clone(),
            local_resource: cell.resource,
            disassembly: disassemble(&organism.genome, organism.ip, organism.read_head),
        })
    }

    pub fn apply_intervention(&mut self, kind: &str, value: u32) -> Result<(), String> {
        if self.interventions.len() >= MAX_INTERVENTIONS_HARD {
            return Err("intervention history has reached its safety cap".into());
        }
        if self.next_intervention_id == u64::MAX {
            return Err("intervention identifier space is exhausted".into());
        }
        let id = self.next_intervention_id;
        match kind {
            "mutation" => {
                if value > 100_000 {
                    return Err("interactive mutation control is capped at 10% per byte".into());
                }
                self.config.mutation.substitution_ppm = value;
            }
            "bottleneck" => self.bottleneck(value.max(1) as usize),
            "catastrophe" => self.catastrophe(value.min(100)),
            "resource-pulse" => {
                let add = value.min(u16::MAX as u32) as u16;
                for cell in &mut self.cells {
                    cell.resource = cell
                        .resource
                        .saturating_add(add)
                        .min(self.config.resource_cap);
                }
            }
            "logic" => {
                if value == 0 {
                    self.config.capabilities &= !CAP_LOGIC;
                } else {
                    self.config.capabilities |= CAP_LOGIC;
                }
            }
            "seasons" => self.config.seasonal_period = value,
            _ => return Err("unknown intervention".into()),
        }
        // The same ID is both recorded and fed into deterministic
        // intervention randomness. Rejected commands consume no state.
        self.next_intervention_id += 1;
        self.interventions.push(InterventionRecord {
            id,
            update: self.update,
            kind: kind.into(),
            value,
        });
        Ok(())
    }

    fn bottleneck(&mut self, survivors: usize) {
        let mut candidates: Vec<_> = self
            .cells
            .iter()
            .enumerate()
            .filter_map(|(idx, cell)| {
                cell.occupant.map(|slot| {
                    let birth = self.organisms[slot as usize]
                        .as_ref()
                        .map_or(0, |o| o.birth_id);
                    let score = keyed_random(
                        self.seed,
                        DOMAIN_INTERVENTION,
                        self.next_intervention_id,
                        idx as u64,
                        birth,
                    );
                    (score, idx, slot)
                })
            })
            .collect();
        candidates.sort_by_key(|c| (c.0, c.1));
        for (_, idx, slot) in candidates.into_iter().skip(survivors) {
            if self.cells[idx].occupant == Some(slot) {
                self.cells[idx].occupant = None;
                if let Some(organism) = self.organisms[slot as usize].take() {
                    self.record_death(organism);
                    self.free_slots.push(slot);
                }
            }
        }
    }

    fn catastrophe(&mut self, percent: u32) {
        let threshold = u64::from(percent) * (u64::MAX / 100);
        let mut victims = Vec::new();
        for (idx, cell) in self.cells.iter().enumerate() {
            if let Some(slot) = cell.occupant {
                let birth = self.organisms[slot as usize]
                    .as_ref()
                    .map_or(0, |o| o.birth_id);
                let roll = keyed_random(
                    self.seed,
                    DOMAIN_INTERVENTION,
                    self.next_intervention_id,
                    idx as u64,
                    birth,
                );
                if roll <= threshold {
                    victims.push((idx, slot));
                }
            }
        }
        // Never let a catastrophe silently turn into an impossible empty-world
        // state when the user asked for less than 100%.
        if percent < 100 && victims.len() == self.population() as usize && !victims.is_empty() {
            victims.pop();
        }
        for (idx, slot) in victims {
            if self.cells[idx].occupant == Some(slot) {
                self.cells[idx].occupant = None;
                if let Some(organism) = self.organisms[slot as usize].take() {
                    self.record_death(organism);
                    self.free_slots.push(slot);
                }
            }
        }
    }

    pub fn export_checkpoint(&self) -> Result<Vec<u8>, String> {
        let payload = bincode_options()
            .serialize(self)
            .map_err(|e| format!("serialize checkpoint: {e}"))?;
        if payload.len() > MAX_IMPORT_BYTES - 32 {
            return Err("checkpoint exceeds the browser safety cap".into());
        }
        let mut out = Vec::with_capacity(payload.len() + 32);
        out.extend_from_slice(b"DWM1");
        out.extend_from_slice(&SAVE_VERSION.to_le_bytes());
        out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        out.extend_from_slice(&payload_checksum(&payload));
        out.extend_from_slice(&payload);
        Ok(out)
    }

    pub fn import_checkpoint(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() < 26 || bytes.len() > MAX_IMPORT_BYTES {
            return Err("checkpoint size is invalid".into());
        }
        if &bytes[0..4] != b"DWM1" {
            return Err("checkpoint magic is invalid".into());
        }
        let version = u16::from_le_bytes([bytes[4], bytes[5]]);
        if version != SAVE_VERSION {
            return Err(format!("save version {version} is not supported"));
        }
        let payload_len = u32::from_le_bytes([bytes[6], bytes[7], bytes[8], bytes[9]]) as usize;
        if payload_len != bytes.len() - 26 {
            return Err("checkpoint length field is invalid".into());
        }
        let expected = &bytes[10..26];
        let payload = &bytes[26..];
        if payload_checksum(payload).as_slice() != expected {
            return Err("checkpoint payload checksum mismatch".into());
        }
        let world: Self = bincode_options()
            .deserialize(payload)
            .map_err(|e| format!("decode checkpoint: {e}"))?;
        world.validate_loaded()?;
        Ok(world)
    }

    fn validate_loaded(&self) -> Result<(), String> {
        self.config.validate()?;
        if self.engine_version != ENGINE_VERSION
            || self.isa_version != ISA_VERSION
            || self.rng_version != RNG_VERSION
            || self.physics_version != PHYSICS_VERSION
            || self.substrate_id != "grid-private-child-v1"
        {
            return Err("checkpoint belongs to incompatible engine semantics".into());
        }
        if self.build_id.len() > 128 || !self.build_id.starts_with("darwin-") {
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
        let expected_cells = usize::from(self.config.width) * usize::from(self.config.height);
        if self.cells.len() != expected_cells {
            return Err("checkpoint cell count is inconsistent".into());
        }
        if self.organisms.len() > expected_cells.saturating_mul(4)
            || self.genotypes.len() > self.config.max_genotypes as usize
            || self.genotype_lookup.len() != self.genotypes.len()
            || self.fossils.len() > self.config.max_fossils as usize
            || self.stats.len() > self.config.max_samples as usize
            || self.interventions.len() > MAX_INTERVENTIONS_HARD
        {
            return Err("checkpoint object counts exceed safety limits".into());
        }

        let mut occupied_slots = vec![false; self.organisms.len()];
        for cell in &self.cells {
            if cell.resource > self.config.resource_cap {
                return Err("checkpoint contains an over-cap resource cell".into());
            }
            if let Some(slot) = cell.occupant {
                let slot = slot as usize;
                if slot >= self.organisms.len()
                    || self.organisms[slot].is_none()
                    || occupied_slots[slot]
                {
                    return Err("checkpoint cell/organism occupancy is inconsistent".into());
                }
                occupied_slots[slot] = true;
            }
        }

        let mut active_by_genotype = vec![0u32; self.genotypes.len()];
        let mut max_birth = 0u64;
        let mut max_lineage = 0u64;
        for (slot, organism) in self.organisms.iter().enumerate() {
            let Some(organism) = organism else {
                continue;
            };
            if !occupied_slots[slot] || organism.slot_id as usize != slot {
                return Err("checkpoint contains a detached or misnumbered organism".into());
            }
            if organism.genome.len() < usize::from(self.config.min_genome)
                || organism.genome.len() > usize::from(self.config.max_genome)
                || organism.genome.len() > MAX_GENOME_HARD
                || organism.energy > self.config.max_energy
                || organism.call_stack_len as usize > organism.call_stack.len()
                || organism.genotype_id as usize >= self.genotypes.len()
                || organism
                    .parent_genotype_id
                    .is_some_and(|id| id as usize >= self.genotypes.len())
            {
                return Err("checkpoint contains an invalid organism".into());
            }
            active_by_genotype[organism.genotype_id as usize] =
                active_by_genotype[organism.genotype_id as usize].saturating_add(1);
            max_birth = max_birth.max(organism.birth_id);
            max_lineage = max_lineage.max(organism.lineage_id);
            if let Some(child) = organism.child.as_ref() {
                let written = child.written.iter().filter(|&&value| value == 1).count();
                if child.bytes.len() != child.written.len()
                    || child.bytes.len() < usize::from(self.config.min_genome)
                    || child.bytes.len() > usize::from(self.config.max_genome)
                    || child.bytes.len() > MAX_GENOME_HARD
                    || child.written.iter().any(|&value| value > 1)
                    || written != usize::from(child.distinct_written)
                    || child.target_cell as usize >= self.cells.len()
                {
                    return Err("checkpoint contains an invalid child buffer".into());
                }
            }
        }
        if self.next_birth_id <= max_birth || self.next_lineage_id <= max_lineage {
            return Err("checkpoint monotonic identifiers moved backwards".into());
        }

        let mut free_seen = BTreeSet::new();
        for &slot in &self.free_slots {
            let index = slot as usize;
            if index >= self.organisms.len()
                || self.organisms[index].is_some()
                || !free_seen.insert(slot)
            {
                return Err("checkpoint free-slot list is inconsistent".into());
            }
        }
        for (slot, organism) in self.organisms.iter().enumerate() {
            if organism.is_none() && !free_seen.contains(&(slot as u32)) {
                return Err("checkpoint has an unreachable empty organism slot".into());
            }
        }

        for (index, genotype) in self.genotypes.iter().enumerate() {
            if genotype.id as usize != index
                || genotype.bytes.len() < usize::from(self.config.min_genome)
                || genotype.bytes.len() > usize::from(self.config.max_genome)
                || genotype
                    .parent_genotype_id
                    .is_some_and(|id| id as usize >= self.genotypes.len())
                || genotype.hash != hash_genome(&genotype.bytes)
                || genotype.active_count != active_by_genotype[index]
                || genotype
                    .total_deaths
                    .saturating_add(u64::from(genotype.active_count))
                    != genotype.total_births
                || self.genotype_lookup.get(&genotype.bytes) != Some(&genotype.id)
            {
                return Err("checkpoint genotype index is inconsistent".into());
            }
        }
        for fossil in &self.fossils {
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
        Ok(())
    }

    pub fn checksum_hex(&self) -> String {
        let bytes = self.checksum_bytes();
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    /// A deterministic digest of every state component that can affect future
    /// execution or the exact retained history.  It is intentionally not a
    /// cryptographic authenticator; the checkpoint envelope separately hashes
    /// the raw payload before decoding.
    pub fn checksum_bytes(&self) -> [u8; 16] {
        let mut a = 0xcbf2_9ce4_8422_2325u64;
        let mut b = 0x8422_2325_cbf2_9ce4u64;
        hash_pair_str(&mut a, &mut b, &self.engine_version);
        hash_pair(&mut a, &mut b, u64::from(self.isa_version));
        hash_pair(&mut a, &mut b, u64::from(self.rng_version));
        hash_pair(&mut a, &mut b, u64::from(self.physics_version));
        hash_pair_str(&mut a, &mut b, &self.substrate_id);
        hash_pair_str(&mut a, &mut b, &self.preset_id);
        hash_pair(&mut a, &mut b, self.seed);
        hash_pair(&mut a, &mut b, self.update);
        hash_pair(&mut a, &mut b, self.instructions);
        hash_pair(&mut a, &mut b, self.next_birth_id);
        hash_pair(&mut a, &mut b, self.next_lineage_id);
        hash_pair(&mut a, &mut b, self.next_intervention_id);
        hash_pair(&mut a, &mut b, self.retired_genotypes);

        let c = &self.config;
        for value in [
            u64::from(c.width),
            u64::from(c.height),
            u64::from(c.instructions_per_update),
            u64::from(c.min_genome),
            u64::from(c.max_genome),
            u64::from(c.max_energy),
            u64::from(c.initial_energy),
            u64::from(c.child_energy),
            u64::from(c.maintenance_cost),
            u64::from(c.allocation_cost),
            u64::from(c.division_cost),
            u64::from(c.resource_cap),
            u64::from(c.resource_replenish),
            u64::from(c.uptake_packet),
            u64::from(c.logic_reward),
            match c.occupancy_policy {
                OccupancyPolicy::EmptyOnly => 0,
                OccupancyPolicy::LocalReplacement => 1,
            },
            u64::from(c.mutation.substitution_ppm),
            u64::from(c.mutation.insertion_ppm),
            u64::from(c.mutation.deletion_ppm),
            u64::from(c.capabilities),
            u64::from(c.sample_period),
            u64::from(c.max_samples),
            u64::from(c.max_fossils),
            u64::from(c.max_genotypes),
            u64::from(c.seasonal_period),
        ] {
            hash_pair(&mut a, &mut b, value);
        }

        hash_pair(&mut a, &mut b, self.cells.len() as u64);
        for (index, cell) in self.cells.iter().enumerate() {
            hash_pair(&mut a, &mut b, index as u64);
            hash_pair_option(&mut a, &mut b, cell.occupant.map(u64::from));
            hash_pair(&mut a, &mut b, u64::from(cell.resource));
            hash_pair(&mut a, &mut b, u64::from(cell.signal as u16));
            hash_pair(&mut a, &mut b, u64::from(cell.toxin));
        }

        hash_pair(&mut a, &mut b, self.organisms.len() as u64);
        for (slot, maybe) in self.organisms.iter().enumerate() {
            hash_pair(&mut a, &mut b, slot as u64);
            let Some(organism) = maybe else {
                hash_pair(&mut a, &mut b, u64::MAX);
                continue;
            };
            hash_pair(&mut a, &mut b, u64::from(organism.slot_id));
            hash_pair(&mut a, &mut b, organism.birth_id);
            hash_pair_option(&mut a, &mut b, organism.parent_birth_id);
            hash_pair_option(&mut a, &mut b, organism.parent_genotype_id.map(u64::from));
            hash_pair(&mut a, &mut b, organism.lineage_id);
            hash_pair(&mut a, &mut b, u64::from(organism.genotype_id));
            hash_pair_bytes(&mut a, &mut b, &organism.genome);
            hash_pair(&mut a, &mut b, u64::from(organism.ip));
            for &register in &organism.registers {
                hash_pair(&mut a, &mut b, u64::from(register));
            }
            hash_pair(
                &mut a,
                &mut b,
                match organism.compare {
                    CompareFlag::Less => 0,
                    CompareFlag::Equal => 1,
                    CompareFlag::Greater => 2,
                },
            );
            hash_pair(&mut a, &mut b, u64::from(organism.read_head));
            hash_pair(&mut a, &mut b, u64::from(organism.write_head));
            for &return_ip in &organism.call_stack {
                hash_pair(&mut a, &mut b, u64::from(return_ip));
            }
            hash_pair(&mut a, &mut b, u64::from(organism.call_stack_len));
            hash_pair(&mut a, &mut b, u64::from(organism.energy));
            hash_pair(&mut a, &mut b, organism.age_instructions);
            hash_pair(&mut a, &mut b, u64::from(organism.age_updates));
            hash_pair(&mut a, &mut b, u64::from(organism.generation));
            hash_pair(&mut a, &mut b, u64::from(organism.orientation));
            if let Some(child) = organism.child.as_ref() {
                hash_pair(&mut a, &mut b, 1);
                hash_pair_bytes(&mut a, &mut b, &child.bytes);
                hash_pair_bytes(&mut a, &mut b, &child.written);
                hash_pair(&mut a, &mut b, u64::from(child.distinct_written));
                hash_pair(&mut a, &mut b, u64::from(child.target_cell));
                hash_pair(&mut a, &mut b, u64::from(child.write_count));
                hash_pair(&mut a, &mut b, u64::from(child.substitutions));
            } else {
                hash_pair(&mut a, &mut b, 0);
            }
            for value in [
                u64::from(organism.vm_rand_counter),
                u64::from(organism.successful_children),
                u64::from(organism.last_replication_instructions),
                u64::from(organism.instructions_since_birth),
                u64::from(organism.tasks_succeeded),
                u64::from(organism.tasks_failed),
                u64::from(organism.last_status as u8),
                u64::from(organism.birth_mutation.substitutions),
                u64::from(organism.birth_mutation.insertions),
                u64::from(organism.birth_mutation.deletions),
            ] {
                hash_pair(&mut a, &mut b, value);
            }
        }
        hash_pair(&mut a, &mut b, self.free_slots.len() as u64);
        for &slot in &self.free_slots {
            hash_pair(&mut a, &mut b, u64::from(slot));
        }

        hash_pair(&mut a, &mut b, self.genotypes.len() as u64);
        for genotype in &self.genotypes {
            for value in [
                u64::from(genotype.id),
                genotype.hash,
                genotype.first_seen_update,
                u64::from(genotype.active_count),
                genotype.total_births,
                genotype.total_deaths,
            ] {
                hash_pair(&mut a, &mut b, value);
            }
            hash_pair_option(&mut a, &mut b, genotype.parent_genotype_id.map(u64::from));
            hash_pair_bytes(&mut a, &mut b, &genotype.bytes);
        }
        hash_pair(&mut a, &mut b, self.fossils.len() as u64);
        for fossil in &self.fossils {
            hash_pair(&mut a, &mut b, fossil.update);
            hash_pair(&mut a, &mut b, u64::from(fossil.genotype_id));
            hash_pair(&mut a, &mut b, fossil.lineage_id);
            hash_pair_str(&mut a, &mut b, &fossil.reason);
            hash_pair(&mut a, &mut b, u64::from(fossil.active_count));
            hash_pair_bytes(&mut a, &mut b, &fossil.genome);
        }
        hash_pair(&mut a, &mut b, self.stats.len() as u64);
        for sample in &self.stats {
            for value in [
                sample.update,
                sample.instructions,
                u64::from(sample.population),
                u64::from(sample.genotype_count),
                sample.retired_genotype_count,
                u64::from(sample.lineage_count),
                u64::from(sample.dominant_share_ppm),
                u64::from(sample.median_genome_length),
                u64::from(sample.median_energy),
                u64::from(sample.births),
                u64::from(sample.deaths),
                u64::from(sample.mean_mutations_milli),
                u64::from(sample.mean_replication_instructions),
                u64::from(sample.tasks_succeeded),
            ] {
                hash_pair(&mut a, &mut b, value);
            }
            hash_pair_option(&mut a, &mut b, sample.dominant_genotype_id.map(u64::from));
        }
        hash_pair(&mut a, &mut b, self.interventions.len() as u64);
        for intervention in &self.interventions {
            hash_pair(&mut a, &mut b, intervention.id);
            hash_pair(&mut a, &mut b, intervention.update);
            hash_pair_str(&mut a, &mut b, &intervention.kind);
            hash_pair(&mut a, &mut b, u64::from(intervention.value));
        }
        for value in [
            u64::from(self.births_interval),
            u64::from(self.deaths_interval),
            self.mutations_interval,
            self.replication_instructions_interval,
            u64::from(self.replications_interval),
            u64::from(self.tasks_interval),
        ] {
            hash_pair(&mut a, &mut b, value);
        }
        hash_pair_option(&mut a, &mut b, self.last_dominant.map(u64::from));

        let mut out = [0u8; 16];
        out[..8].copy_from_slice(&mix64(a).to_le_bytes());
        out[8..].copy_from_slice(&mix64(b).to_le_bytes());
        out
    }

    pub fn population(&self) -> u32 {
        self.organisms.iter().filter(|o| o.is_some()).count() as u32
    }

    fn allocation_target(&self, cell_index: usize, arg: u8, organism: &Organism) -> usize {
        if arg == 0 {
            let roll = keyed_random(
                self.seed,
                DOMAIN_ALLOC,
                organism.birth_id,
                u64::from(organism.successful_children),
                self.update,
            );
            self.direction_target(cell_index, ((roll >> 61) & 7) as u8, organism.orientation)
        } else {
            self.direction_target(cell_index, arg - 1, organism.orientation)
        }
    }

    fn direction_target(&self, cell_index: usize, direction: u8, orientation: u8) -> usize {
        let dirs = [
            (0isize, -1isize),
            (1, 0),
            (0, 1),
            (-1, 0),
            (1, -1),
            (1, 1),
            (-1, 1),
            (-1, -1),
        ];
        let dir = if direction < 4 {
            (direction + orientation) & 3
        } else {
            direction & 7
        };
        let (dx, dy) = dirs[dir as usize];
        let (x, y) = self.xy(cell_index);
        let w = isize::try_from(self.config.width).unwrap_or(1);
        let h = isize::try_from(self.config.height).unwrap_or(1);
        let nx = (x as isize + dx).rem_euclid(w) as usize;
        let ny = (y as isize + dy).rem_euclid(h) as usize;
        self.cell_index(nx, ny)
    }

    fn neighbour_occupancy(&self, cell_index: usize) -> u32 {
        (0..8)
            .filter(|&d| {
                self.cells[self.direction_target(cell_index, d, 0)]
                    .occupant
                    .is_some()
            })
            .count() as u32
    }

    fn season_bit(&self) -> bool {
        self.config.seasonal_period > 0
            && (self.update / u64::from(self.config.seasonal_period.max(1))) & 1 == 1
    }

    fn alloc_slot(&mut self) -> u32 {
        if let Some(slot) = self.free_slots.pop() {
            slot
        } else {
            let slot = self.organisms.len() as u32;
            self.organisms.push(None);
            slot
        }
    }

    fn prune_genotypes(&mut self) {
        let cap = self.config.max_genotypes as usize;
        if self.genotypes.len() <= cap {
            return;
        }

        // The live state, one-generation parent diffs, fossils and the current
        // dominant branch are never discarded.  Remaining budget retains the
        // newest extinct records.  This affects observability only; organism
        // genomes and execution state are untouched.
        let mut retain = BTreeSet::new();
        for organism in self.organisms.iter().flatten() {
            retain.insert(organism.genotype_id);
            if let Some(parent) = organism.parent_genotype_id {
                retain.insert(parent);
            }
        }
        for fossil in &self.fossils {
            retain.insert(fossil.genotype_id);
        }
        if let Some(id) = self.last_dominant {
            retain.insert(id);
        }
        if retain.len() > cap {
            // WorldConfig validation makes this unreachable for valid worlds,
            // but refusing to prune required records is safer than corrupting
            // the ancestry skeleton.
            return;
        }
        for genotype in self.genotypes.iter().rev() {
            if retain.len() >= cap {
                break;
            }
            retain.insert(genotype.id);
        }

        let mut remap = vec![None; self.genotypes.len()];
        let mut next = Vec::with_capacity(retain.len());
        for old in retain.iter().copied() {
            if let Some(record) = self.genotypes.get(old as usize) {
                let new_id = next.len() as u32;
                remap[old as usize] = Some(new_id);
                let mut cloned = record.clone();
                cloned.id = new_id;
                next.push(cloned);
            }
        }
        let removed = self.genotypes.len().saturating_sub(next.len());
        if removed == 0 {
            return;
        }

        for record in &mut next {
            record.parent_genotype_id = record
                .parent_genotype_id
                .and_then(|old| remap.get(old as usize).and_then(|id| *id));
        }
        for organism in self.organisms.iter_mut().flatten() {
            organism.genotype_id = remap[organism.genotype_id as usize]
                .expect("active genotype retained during deterministic pruning");
            organism.parent_genotype_id = organism
                .parent_genotype_id
                .and_then(|old| remap.get(old as usize).and_then(|id| *id));
        }
        for fossil in &mut self.fossils {
            fossil.genotype_id = remap[fossil.genotype_id as usize]
                .expect("fossilised genotype retained during deterministic pruning");
        }
        for sample in &mut self.stats {
            sample.dominant_genotype_id = sample
                .dominant_genotype_id
                .and_then(|old| remap.get(old as usize).and_then(|id| *id));
        }
        self.last_dominant = self
            .last_dominant
            .and_then(|old| remap.get(old as usize).and_then(|id| *id));
        self.genotypes = next;
        self.genotype_lookup.clear();
        for record in &self.genotypes {
            self.genotype_lookup.insert(record.bytes.clone(), record.id);
        }
        self.retired_genotypes = self.retired_genotypes.saturating_add(removed as u64);
    }

    fn intern_genotype(&mut self, bytes: Vec<u8>, parent: Option<u32>) -> u32 {
        if let Some(id) = self.genotype_lookup.get(&bytes) {
            return *id;
        }
        let id = self.genotypes.len() as u32;
        let hash = hash_genome(&bytes);
        self.genotype_lookup.insert(bytes.clone(), id);
        self.genotypes.push(GenotypeRecord {
            id,
            hash,
            bytes,
            first_seen_update: self.update,
            active_count: 0,
            total_births: 0,
            total_deaths: 0,
            parent_genotype_id: parent,
        });
        id
    }

    fn maybe_fossil(&mut self, genotype_id: u32, lineage_id: u64, reason: &str) {
        if self.fossils.len() >= self.config.max_fossils as usize
            || self
                .fossils
                .iter()
                .any(|f| f.genotype_id == genotype_id && f.reason == reason)
        {
            return;
        }
        if let Some(genotype) = self.genotypes.get(genotype_id as usize) {
            self.fossils.push(FossilRecord {
                update: self.update,
                genotype_id,
                lineage_id,
                reason: reason.into(),
                active_count: genotype.active_count,
                genome: genotype.bytes.clone(),
            });
        }
    }

    fn cell_index(&self, x: usize, y: usize) -> usize {
        (y % usize::from(self.config.height)) * usize::from(self.config.width)
            + (x % usize::from(self.config.width))
    }

    fn xy(&self, index: usize) -> (usize, usize) {
        xy_for(index, usize::from(self.config.width))
    }
}

pub fn sandbox_trace(genome: &[u8], steps: u32) -> Result<SandboxTrace, String> {
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
    };
    let mut world = World::new(config, 1, "sandbox")?;
    world.seed_organism(1, 1, genome.to_vec())?;
    let mut trace = Vec::new();
    let mut divided = false;
    let mut child = None;
    for step in 0..steps {
        let cell = world.cell_index(1, 1);
        let Some(slot) = world.cells[cell].occupant else {
            break;
        };
        let Some(org) = world.organisms[slot as usize].as_ref() else {
            break;
        };
        let ip = org.ip;
        let byte = org.genome[usize::from(ip) % org.genome.len()];
        trace.push(SandboxStep {
            step,
            ip,
            byte,
            mnemonic: mnemonic(decode(byte).0).into(),
            registers: org.registers,
            read_head: org.read_head,
            write_head: org.write_head,
            energy: org.energy,
            status: org.last_status,
        });
        let before = world.population();
        world.run_one_update();
        if world.population() > before {
            divided = true;
            child = world
                .organisms
                .iter()
                .flatten()
                .find(|o| o.parent_birth_id.is_some())
                .map(|o| o.genome.clone());
            break;
        }
    }
    Ok(SandboxTrace {
        genome: genome.to_vec(),
        steps: trace,
        divided,
        child,
    })
}

pub fn assess_viability(genome: &[u8], max_instructions: u64) -> ViabilityResult {
    let mut config = WorldConfig::default();
    config.width = 5;
    config.height = 5;
    config.instructions_per_update = 16;
    config.mutation = MutationConfig {
        substitution_ppm: 0,
        insertion_ppm: 0,
        deletion_ppm: 0,
    };
    config.occupancy_policy = OccupancyPolicy::EmptyOnly;
    config.min_genome = 1;
    config.max_genome = MAX_GENOME_HARD as u16;
    config.initial_energy = config.max_energy;
    config.child_energy = 600;
    config.resource_replenish = config.resource_cap;
    let mut world = match World::new(config, 7, "viability") {
        Ok(w) => w,
        Err(_) => {
            return ViabilityResult {
                genome_length: genome.len().min(u16::MAX as usize) as u16,
                divided: false,
                child_divided: false,
                first_division_instructions: None,
                exact_child: false,
                final_status: StatusCode::InvalidLength,
            }
        }
    };
    if world.seed_organism(2, 2, genome.to_vec()).is_err() {
        return ViabilityResult {
            genome_length: genome.len().min(u16::MAX as usize) as u16,
            divided: false,
            child_divided: false,
            first_division_instructions: None,
            exact_child: false,
            final_status: StatusCode::InvalidLength,
        };
    }
    let mut first = None;
    let mut exact = false;
    let mut child_birth = None;
    while world.instructions < max_instructions {
        let before_pop = world.population();
        world.run_one_update();
        // Extinction is a terminal assay result. Without this guard the
        // instruction counter can no longer advance and a dead mutant loops
        // forever, exactly the common case in neighbourhood and random search.
        if world.population() == 0 {
            break;
        }
        if first.is_none() && world.population() > before_pop {
            first = Some(world.instructions);
            if let Some(child) = world
                .organisms
                .iter()
                .flatten()
                .find(|o| o.parent_birth_id.is_some())
            {
                exact = child.genome == genome;
                child_birth = Some(child.birth_id);
            }
        }
        if let Some(id) = child_birth {
            if world
                .organisms
                .iter()
                .flatten()
                .any(|o| o.parent_birth_id == Some(id))
            {
                let status = world
                    .organisms
                    .iter()
                    .flatten()
                    .next()
                    .map_or(StatusCode::Ok, |o| o.last_status);
                return ViabilityResult {
                    genome_length: genome.len() as u16,
                    divided: true,
                    child_divided: true,
                    first_division_instructions: first,
                    exact_child: exact,
                    final_status: status,
                };
            }
        }
    }
    let status = world
        .organisms
        .iter()
        .flatten()
        .next()
        .map_or(StatusCode::InsufficientEnergy, |o| o.last_status);
    ViabilityResult {
        genome_length: genome.len().min(u16::MAX as usize) as u16,
        divided: first.is_some(),
        child_divided: false,
        first_division_instructions: first,
        exact_child: exact,
        final_status: status,
    }
}

pub fn neighbourhood_report(name: &str, ancestor: &[u8]) -> NeighbourhoodReport {
    let baseline = assess_viability(ancestor, 8_000);
    let baseline_time = baseline.first_division_instructions;
    let mut report = NeighbourhoodReport {
        ancestor: name.into(),
        genome_length: ancestor.len() as u16,
        substitutions_tested: 0,
        substitutions_divided: 0,
        substitutions_child_divided: 0,
        substitutions_faster: 0,
        deletions_tested: 0,
        deletions_divided: 0,
        deletions_child_divided: 0,
        insertions_tested: 0,
        insertions_divided: 0,
        insertions_child_divided: 0,
        baseline_division_instructions: baseline_time,
    };
    for i in 0..ancestor.len() {
        for byte in 0u16..=255 {
            if byte as u8 == ancestor[i] {
                continue;
            }
            let mut candidate = ancestor.to_vec();
            candidate[i] = byte as u8;
            let result = assess_viability(&candidate, 8_000);
            report.substitutions_tested += 1;
            report.substitutions_divided += result.divided as u32;
            report.substitutions_child_divided += result.child_divided as u32;
            if let (Some(candidate_time), Some(base_time)) =
                (result.first_division_instructions, baseline_time)
            {
                report.substitutions_faster += (candidate_time < base_time) as u32;
            }
        }
    }
    for i in 0..ancestor.len() {
        let mut candidate = ancestor.to_vec();
        candidate.remove(i);
        let result = assess_viability(&candidate, 8_000);
        report.deletions_tested += 1;
        report.deletions_divided += result.divided as u32;
        report.deletions_child_divided += result.child_divided as u32;
    }
    // Exhaustive over eight representative inserted bytes at every boundary.
    let representatives = [0u8, 1, 31, 32, 64, 127, 191, 255];
    for i in 0..=ancestor.len() {
        for byte in representatives {
            let mut candidate = ancestor.to_vec();
            candidate.insert(i, byte);
            let result = assess_viability(&candidate, 8_000);
            report.insertions_tested += 1;
            report.insertions_divided += result.divided as u32;
            report.insertions_child_divided += result.child_divided as u32;
        }
    }
    report
}

pub fn disassemble(genome: &[u8], ip: u16, read_head: u16) -> Vec<InstructionView> {
    let mut template_positions = BTreeSet::new();
    for idx in 0..genome.len() {
        let (op, _) = decode(genome[idx]);
        if op == 18 || op == 19 {
            let (_, after) = local_template(genome, idx);
            let mut pos = (idx + 1) % genome.len();
            while pos != after {
                template_positions.insert(pos);
                pos = (pos + 1) % genome.len();
            }
        }
    }
    genome
        .iter()
        .enumerate()
        .map(|(idx, &byte)| {
            let (op, arg) = decode(byte);
            InstructionView {
                address: idx as u16,
                byte,
                op,
                arg,
                mnemonic: mnemonic(op).into(),
                operand: operand_text(op, arg),
                current: idx == usize::from(ip) % genome.len(),
                read_head: idx == usize::from(read_head) % genome.len(),
                template: template_positions.contains(&idx),
            }
        })
        .collect()
}

fn operand_text(op: u8, arg: u8) -> String {
    match op {
        0 => format!("{}", (b'A' + arg) as char),
        1..=14 | 24 | 25 => format!("r{arg}"),
        18 | 19 => {
            if arg & 1 == 1 {
                "backward".into()
            } else {
                "forward".into()
            }
        }
        21 => [
            "genome length",
            "energy",
            "age",
            "generation",
            "child length",
            "child written",
            "resource",
            "status",
        ][arg as usize]
            .into(),
        22 => {
            if arg == 0 {
                "random neighbour".into()
            } else {
                format!("neighbour {}", arg - 1)
            }
        }
        23 => [
            "reset",
            "set read",
            "set write",
            "get read",
            "get write",
            "advance read",
            "advance write",
            "swap heads",
        ][arg as usize]
            .into(),
        27 => format!("sensor {arg}"),
        28 => format!("direction {arg}"),
        29 => format!("resource {arg}"),
        30 => format!("signal {arg}"),
        31 => format!("action {arg}"),
        _ => String::new(),
    }
}

fn binary_wrapping<F: FnOnce(u32, u32) -> u32>(organism: &mut Organism, arg: u8, f: F) {
    let a = arg as usize;
    let b = (a + 7) & 7;
    organism.registers[a] = f(organism.registers[a], organism.registers[b]);
}

fn complete_instruction_extra(genome: &[u8], start: usize) -> usize {
    let len = genome.len();
    let (op, _) = decode(genome[start % len]);
    if op != 18 && op != 19 {
        return 1;
    }
    let mut consumed = 1;
    for offset in 1..=4 {
        if decode(genome[(start + offset) % len]).0 == 0 {
            consumed += 1;
        } else {
            break;
        }
    }
    consumed
}

fn local_template(genome: &[u8], ip: usize) -> (Vec<u8>, usize) {
    let len = genome.len();
    let mut template = Vec::new();
    let mut pos = (ip + 1) % len;
    for _ in 0..4 {
        let (op, arg) = decode(genome[pos]);
        if op != 0 {
            break;
        }
        template.push(arg ^ 1);
        pos = (pos + 1) % len;
    }
    (template, pos)
}

fn find_template(
    genome: &[u8],
    branch_ip: usize,
    after_local: usize,
    complement: &[u8],
    backward: bool,
) -> Option<usize> {
    let len = genome.len();
    let local_positions: BTreeSet<_> = circular_range(branch_ip, after_local, len).collect();
    for distance in 1..=len {
        let candidate = if backward {
            (branch_ip + len - (distance % len)) % len
        } else {
            (after_local + distance - 1) % len
        };
        if local_positions.contains(&candidate) {
            continue;
        }
        let mut ok = true;
        for (offset, wanted) in complement.iter().enumerate() {
            let pos = (candidate + offset) % len;
            if local_positions.contains(&pos) {
                ok = false;
                break;
            }
            let (op, arg) = decode(genome[pos]);
            if op != 0 || arg != *wanted {
                ok = false;
                break;
            }
        }
        if ok {
            return Some((candidate + complement.len()) % len);
        }
    }
    None
}

fn circular_range(start: usize, end: usize, len: usize) -> impl Iterator<Item = usize> {
    let count = if end >= start {
        end - start
    } else {
        len - start + end
    };
    (0..count).map(move |i| (start + i) % len)
}

fn scheduler_params(seed: u64, update: u64, n: usize) -> (usize, usize) {
    if n <= 1 {
        return (0, 1);
    }
    let start = keyed_random(seed, DOMAIN_SCHEDULER, update, 0, 0) as usize % n;
    let mut step = (keyed_random(seed, DOMAIN_SCHEDULER, update, 1, 0) as usize % (n - 1)) + 1;
    while gcd(step, n) != 1 {
        step += 1;
        if step >= n {
            step = 1;
        }
    }
    (start, step)
}

fn gcd(mut a: usize, mut b: usize) -> usize {
    while b != 0 {
        let r = a % b;
        a = b;
        b = r;
    }
    a
}

fn valid_identifier(value: &str, max_len: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn bincode_options() -> impl Options {
    bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .reject_trailing_bytes()
        .with_limit(MAX_IMPORT_BYTES as u64)
}

fn payload_checksum(payload: &[u8]) -> [u8; 16] {
    let mut a = 0x6a09_e667_f3bc_c908u64;
    let mut b = 0xbb67_ae85_84ca_a73bu64;
    hash_pair(&mut a, &mut b, payload.len() as u64);
    hash_pair_bytes(&mut a, &mut b, payload);
    let mut out = [0u8; 16];
    out[..8].copy_from_slice(&mix64(a).to_le_bytes());
    out[8..].copy_from_slice(&mix64(b).to_le_bytes());
    out
}

fn hash_pair(a: &mut u64, b: &mut u64, value: u64) {
    hash_u64(a, value);
    hash_u64(b, value.rotate_left(29) ^ 0xa5a5_5a5a_d3c1_b7e9);
}

fn hash_pair_option(a: &mut u64, b: &mut u64, value: Option<u64>) {
    match value {
        Some(value) => {
            hash_pair(a, b, 1);
            hash_pair(a, b, value);
        }
        None => hash_pair(a, b, 0),
    }
}

fn hash_pair_bytes(a: &mut u64, b: &mut u64, bytes: &[u8]) {
    hash_pair(a, b, bytes.len() as u64);
    for &byte in bytes {
        hash_pair(a, b, u64::from(byte));
    }
}

fn hash_pair_str(a: &mut u64, b: &mut u64, value: &str) {
    hash_pair_bytes(a, b, value.as_bytes());
}

pub fn keyed_random(seed: u64, domain: u64, a: u64, b: u64, c: u64) -> u64 {
    let x = seed
        ^ mix64(domain)
        ^ mix64(a.wrapping_add(0x9e37_79b9_7f4a_7c15))
        ^ mix64(b.wrapping_add(0xbf58_476d_1ce4_e5b9))
        ^ mix64(c.wrapping_add(0x94d0_49bb_1331_11eb));
    mix64(x)
}

pub fn rng_golden_vectors() -> Vec<u64> {
    (0..8)
        .map(|i| keyed_random(0x0123_4567_89ab_cdef, DOMAIN_VM_RAND, 42, i, 7))
        .collect()
}

fn chance(random: u64, ppm: u32) -> bool {
    if ppm == 0 {
        return false;
    }
    if ppm >= 1_000_000 {
        return true;
    }
    (random % 1_000_000) < u64::from(ppm)
}

fn mix64(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9e37_79b9_7f4a_7c15);
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
}

fn hash_genome(bytes: &[u8]) -> u64 {
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    for &byte in bytes {
        h ^= u64::from(byte);
        h = h.wrapping_mul(0x100_0000_01b3);
    }
    mix64(h ^ bytes.len() as u64)
}

fn hash_u64(hash: &mut u64, value: u64) {
    for byte in value.to_le_bytes() {
        *hash ^= u64::from(byte);
        *hash = hash.wrapping_mul(0x100_0000_01b3);
    }
}

fn initial_resource(seed: u64, idx: usize, cap: u16) -> u16 {
    let _ = (seed, idx);
    cap
}

fn environmental_inputs(seed: u64, update: u64, cell: u64) -> (u32, u32) {
    let a = keyed_random(seed, DOMAIN_INPUT, update / 8, cell, 0) as u32;
    let b = keyed_random(seed, DOMAIN_INPUT, update / 8, cell, 1) as u32;
    (a, b)
}

fn xy_for(index: usize, width: usize) -> (usize, usize) {
    (index % width, index / width)
}

fn scale_u16(value: u16, max: u16) -> u8 {
    if max == 0 {
        0
    } else {
        ((u32::from(value) * 255) / u32::from(max)).min(255) as u8
    }
}

fn median(values: &[u16]) -> u16 {
    values.get(values.len() / 2).copied().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_byte_decodes_to_a_named_instruction() {
        for byte in 0u16..=255 {
            let (op, arg) = decode(byte as u8);
            assert!(op < 32);
            assert!(arg < 8);
            assert!(!mnemonic(op).is_empty());
        }
    }

    #[test]
    fn minimal_ancestor_replicates_exactly() {
        let result = assess_viability(&MINIMAL_ANCESTOR, 40_000);
        assert!(result.divided, "minimal ancestor never divided: {result:?}");
        assert!(
            result.child_divided,
            "minimal child did not divide: {result:?}"
        );
        assert!(
            result.exact_child,
            "minimal ancestor copied incorrectly: {result:?}"
        );
    }

    #[test]
    fn clumsy_ancestor_replicates_exactly() {
        let genome = clumsy_ancestor();
        let result = assess_viability(&genome, 120_000);
        assert!(result.divided, "clumsy ancestor never divided: {result:?}");
        assert!(
            result
                .first_division_instructions
                .is_some_and(|count| count < 2_000),
            "clumsy ancestor divided outside its intended energy regime: {result:?}"
        );
        assert!(
            result.child_divided,
            "clumsy child did not divide: {result:?}"
        );
        assert!(
            result.exact_child,
            "clumsy ancestor copied incorrectly: {result:?}"
        );
    }

    #[test]
    fn extinct_viability_assays_terminate() {
        let result = assess_viability(&[0], 100_000);
        assert!(!result.divided);
        assert!(!result.child_divided);
        assert_eq!(result.first_division_instructions, None);
    }

    #[test]
    fn arbitrary_genomes_do_not_panic() {
        for length in 1..=96 {
            for seed in 0..16u64 {
                let genome: Vec<u8> = (0..length)
                    .map(|i| keyed_random(seed, DOMAIN_INPUT, i as u64, length as u64, 99) as u8)
                    .collect();
                let _ = assess_viability(&genome, 2_000);
            }
        }
    }

    #[test]
    fn save_round_trip_preserves_checksum() {
        let mut world = World::from_preset("faster-smaller", 1234).unwrap();
        world.run_updates(200);
        let before = world.checksum_hex();
        let bytes = world.export_checkpoint().unwrap();
        let loaded = World::import_checkpoint(&bytes).unwrap();
        assert_eq!(loaded.checksum_hex(), before);
        assert_eq!(loaded.summary().population, world.summary().population);
    }

    #[test]
    fn scheduler_visits_every_cell_once() {
        for n in 2..500 {
            let (start, step) = scheduler_params(1, n as u64, n);
            let seen: BTreeSet<_> = (0..n).map(|i| (start + i * step) % n).collect();
            assert_eq!(seen.len(), n, "n={n}, start={start}, step={step}");
        }
    }

    #[test]
    fn template_jump_survives_prefix_insertion() {
        let mut inserted = MINIMAL_ANCESTOR.to_vec();
        inserted.insert(0, encode(0, 2));
        let result = assess_viability(&inserted, 50_000);
        assert!(
            result.divided,
            "prefix insertion broke template branch: {result:?}"
        );
    }

    #[test]
    fn malformed_saves_are_rejected() {
        assert!(World::import_checkpoint(b"not a save").is_err());
        let mut world = World::from_preset("first-replicator", 1).unwrap();
        world.run_updates(3);
        let mut bytes = world.export_checkpoint().unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        assert!(World::import_checkpoint(&bytes).is_err());
    }

    #[test]
    fn mutation_is_domain_separated_from_summary_queries() {
        let mut a = World::from_preset("faster-smaller", 77).unwrap();
        let mut b = a.clone();
        for _ in 0..100 {
            a.run_one_update();
            let _ = a.summary();
            let _ = a.grid_snapshot();
            b.run_one_update();
        }
        assert_eq!(a.checksum_hex(), b.checksum_hex());
    }

    #[test]
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
        assert!(
            World::import_checkpoint(&forged_intervention.export_checkpoint().unwrap()).is_err()
        );
    }

    #[test]
    fn configured_history_limits_have_hard_caps() {
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
    }

    #[test]
    fn checksum_covers_future_affecting_state() {
        let world = World::from_preset("first-replicator", 5).unwrap();
        let baseline = world.checksum_hex();

        let mut signal = world.clone();
        signal.cells[0].signal = 7;
        assert_ne!(signal.checksum_hex(), baseline);

        let mut heads = world.clone();
        let slot = heads.cells.iter().find_map(|cell| cell.occupant).unwrap();
        heads.organisms[slot as usize].as_mut().unwrap().read_head = 3;
        assert_ne!(heads.checksum_hex(), baseline);

        let mut config = world.clone();
        config.config.logic_reward = config.config.logic_reward.saturating_add(1);
        assert_ne!(config.checksum_hex(), baseline);
    }

    #[test]
    fn genotype_history_is_bounded_without_losing_live_records() {
        let config = WorldConfig {
            width: 8,
            height: 8,
            max_fossils: 4,
            max_genotypes: 132,
            ..WorldConfig::default()
        };
        let mut world = World::new(config, 9, "prune-test").unwrap();
        world
            .seed_organism(4, 4, MINIMAL_ANCESTOR.to_vec())
            .unwrap();
        let founder_hash = world.genotypes[0].hash;
        for i in 0..220u16 {
            let mut genome = vec![encode(0, 2); 8];
            genome[0] = i as u8;
            genome[1] = (i >> 8) as u8;
            world.intern_genotype(genome, None);
        }
        assert!(world.genotypes.len() > world.config.max_genotypes as usize);
        world.run_one_update();
        assert!(world.genotypes.len() <= world.config.max_genotypes as usize);
        assert!(world
            .genotypes
            .iter()
            .any(|record| record.hash == founder_hash && record.active_count == 1));
        assert!(world.retired_genotypes > 0);
        world.validate_loaded().unwrap();
        let checkpoint = world.export_checkpoint().unwrap();
        let restored = World::import_checkpoint(&checkpoint).unwrap();
        assert_eq!(restored.checksum_hex(), world.checksum_hex());
    }

    #[test]
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
    fn structurally_inconsistent_but_well_hashed_saves_are_rejected() {
        let mut world = World::from_preset("first-replicator", 1).unwrap();
        world.cells[0].occupant = Some(999_999);
        let bytes = world.export_checkpoint().unwrap();
        assert!(World::import_checkpoint(&bytes).is_err());
    }

    #[test]
    fn bottleneck_is_deterministic() {
        let mut a = World::from_preset("bottleneck", 88).unwrap();
        let mut b = a.clone();
        a.run_updates(100);
        b.run_updates(100);
        a.apply_intervention("bottleneck", 5).unwrap();
        b.apply_intervention("bottleneck", 5).unwrap();
        assert_eq!(a.checksum_hex(), b.checksum_hex());
        assert!(a.population() <= 5);
    }
}
