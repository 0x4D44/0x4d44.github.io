// Content data for MDRLL Deep Dive

const PIPELINE_STAGES = [
  {
    id: 'parse',
    name: 'tr_file.rs',
    title: 'Parse .tr file header',
    body: 'A Gesswein-format <code>.tr</code> file starts with magic <code>EE 4D 46 4D 0D 0A 1A 00</code>, then a version word, geometry (cyl × head), a 200 MHz sample rate, an embedded command-line string, and a CRC-32 trailer over the whole header. Gzip is detected by peeking the first two bytes — not the extension. Tracks are then streamed one at a time, never buffered.',
    viz: 'header'
  },
  {
    id: 'unpack',
    name: 'tr_file.rs',
    title: 'Unpack variable-width deltas',
    body: 'Each track is a packed stream of inter-transition delta values, in 200 MHz tick units (5 ns each). First byte 0-253 is a direct u8; 254 is followed by a u16; 255 by a u24 — yielding ranges up to 16,777,215 ticks. After every track come 4 bytes of CRC-32 (same poly as the header) so corruption is caught early.',
    viz: 'deltas'
  },
  {
    id: 'histogram',
    name: 'decode.rs',
    title: 'Histogram → detect encoding & T',
    body: 'A histogram of the deltas yields a few sharp peaks at integer multiples of the bit-cell period T. MFM has 3 peaks at 2T, 3T, 4T (≈40, 60, 80 ticks). RLL 2,7 has 6 peaks at 3T-8T (≈40, 53, 67, 80, 93, 107). The position of the second peak (60 vs 53) decides the encoding unambiguously — and divides out to give the per-track T estimate, since spindle RPM drifts.',
    viz: 'histogram'
  },
  {
    id: 'pll',
    name: 'decode.rs',
    title: 'Recover the clock (PLL)',
    body: 'Real flux has jitter — ±2-3 samples at 200 MHz — and T drifts within a track. A fixed <code>round(delta / T)</code> quantizer accumulates phase error and loses alignment. The fix is a tracking PLL: after each transition, nudge T by a fraction of the error. Three variants live in <code>decode.rs</code>: <code>recover_clock</code> (Type-I default), <code>recover_clock_type2</code> (Phase-4 for drift-heavy zones), and <code>recover_clock_fixed</code> (Phase-5 fallback).',
    viz: 'pll'
  },
  {
    id: 'sync',
    name: 'decode.rs',
    title: 'Find sync marks',
    body: 'For MFM, the decoder searches the raw bit stream — not the byte stream — for <code>0x4489</code> three times in a row. This is an A1 byte with clock bit C2 suppressed; it violates the MFM clock rule and cannot occur in valid data. Finding it both establishes <strong>phase</strong> (clock vs data alignment) and marks a sector boundary. For RLL, the cue is a delta below 3T — an illegal short spacing that punctuates ID / DATA fields.',
    viz: 'sync'
  },
  {
    id: 'decode',
    name: 'decode.rs',
    title: 'Bits → bytes per controller',
    body: 'After sync, decode the segment. MFM strips the clock half-bits. RLL 2,7 does greedy prefix matching against a 7-entry codebook — proven prefix-free by exhaustive check. Each controller may have its own twist: EC1841 has a 4→2 nibble decode after a secondary <code>0x49</code> sync; Xebec 104527 reuses EC1841 framing but the data marker is <code>01 00 C9</code>; DTC7287 has a cylinder LUT.',
    viz: 'decode'
  },
  {
    id: 'sector',
    name: 'sector.rs',
    title: 'Parse ID + data fields',
    body: 'Each <code>DecodedSegment</code> is either an ID field (<code>FE [cyl] [head/cyl_hi] [sec] [size]</code>) or a data field (<code>FB [payload] [CRC] [ECC]</code>). The parser pairs them, verifies CRC, and emits <code>SectorData</code>. Ten different parsers live here — one per supported controller. Some hand-roll a 24-bit CRC (Wang 2275); WD1006 has a 56-bit Reed-Solomon-style ECC.',
    viz: 'sector'
  },
  {
    id: 'image',
    name: 'image.rs',
    title: 'Build CHS-ordered image',
    body: 'Sectors are collected into a flat <code>.ima</code> file in CHS order. Geometry is <em>discovered</em> from the ID fields actually read, not from the <code>.tr</code> header — captures often disagree. Duplicates (from track wrap-around capturing slightly more than a revolution) are resolved by CRC preference. Missing sectors are zero-filled. The summary stats go to stderr.',
    viz: 'image'
  }
];

const MODULES = [
  {
    file: 'tr_file.rs',
    loc: '~1100',
    title: 'Capture file parser',
    desc: 'Reads the Gesswein .tr / .raw / .tr.gz format. Streaming iterator — peak memory is O(one track), typically 50-100 KB of deltas.',
    items: ['Magic + header CRC', 'Variable-width delta unpack', 'Gzip auto-detect via peek', 'Per-track CRC-32 verify']
  },
  {
    file: 'decode.rs',
    loc: '~4600',
    title: 'Signal processing',
    desc: 'Histogram → encoding detection → PLL clock recovery → bit-stream sync → byte decode. The bulk of the project lives here.',
    items: ['MFM 0x4489 sync (bit-level)', 'RLL 2,7 greedy prefix match', '3 clock-recovery PLLs', 'EC1841 / Xebec 4→2 decode']
  },
  {
    file: 'sector.rs',
    loc: '~7000',
    title: 'Sector parsing + CRC',
    desc: 'Largest single file. Ten controller-specific parsers, three CRC polynomial families, the 56-bit WD ECC, address-mark dispatch.',
    items: ['Hand-rolled CRC-16/32/24/56', 'Auto-detect CRC by trying candidates', 'Wrap-around dedup', 'Per-controller framing rules']
  },
  {
    file: 'image.rs',
    loc: '~600',
    title: 'Image builder',
    desc: 'Collects sectors, discovers true geometry, deduplicates, writes a flat CHS-ordered .ima with zero-fill for missing slots.',
    items: ['Geometry discovery', 'Sector base 0 vs 1 detect', 'CRC-preferring dedup', 'Optional decoded-bitmap export']
  },
  {
    file: 'main.rs',
    loc: '~1800',
    title: 'CLI + orchestration',
    desc: 'Clap-based CLI. Bootstrap loop tries up to 4 early tracks to fix encoding + CRC config, then streams the rest. Controller auto-detection by scoring 5 candidate parsers.',
    items: ['Controller probe scorer', 'EC1841 variant merge', 'iSBC-214 slip-zone retry', 'Per-sector merge of 3 decode passes']
  },
  {
    file: 'lib.rs',
    loc: '~50',
    title: 'Shared types',
    desc: 'Module declarations plus the eight-variant DecodeError enum used as the unified failure type across the crate.',
    items: ['Io, BadMagic, CorruptHeader', 'EncodingAmbiguous', 'CrcDetectionFailed', 'InvalidFormat(String)']
  }
];

const CONTROLLERS = [
  {
    id: 'ibmwd', name: 'Generic IBM-WD', sub: 'The 1981 default',
    enc: 'MFM', cat: 'default',
    specs: { 'sectors/trk': '17', 'sector size': '512', 'CRC poly': '0x1021', 'AM': 'FE / FB' },
    detail: 'The IBM PC/AT and WD1010 lineage. Address marks 0xFE (ID) and 0xFB (DATA), preceded by 3× 0xA1 sync. ID layout <code>[cyl_lo, head|cyl_hi, sec, size]</code>. CRC-16 poly 0x1021 init 0xFFFF on 5 bytes (AM + 4 ID). Where everything else is measured from.'
  },
  {
    id: 'isbc214', name: 'Intel iSBC-214', sub: '8086-era multibus controller',
    enc: 'MFM', cat: 'mfm',
    specs: { 'sectors/trk': '17', 'sector size': '512', 'data CRC': '32-bit', 'AM': 'F8 / F9' },
    detail: 'Single 0xA1 sync (not three). 4-byte ID. The infamous slip-zone: on head 1 cylinders 316-337 the spindle drifts by ~4.5% within a track — too fast for the Type-I PLL. Phase-4 added a Type-II PLL; Phase-5 added a fixed-T fallback; <code>decode_and_parse_track</code> merges three passes per-sector.'
  },
  {
    id: 'wd1006', name: 'WD1006', sub: 'WD1006V-SR2, the workhorse',
    enc: 'MFM/RLL', cat: 'mfm',
    specs: { 'sectors/trk': '17', 'sector size': '512', 'ECC': '5-byte / 56-bit', 'CRC': '0x140A0445' },
    detail: 'Same lineage as IBM-WD but with a 6-byte ID body (no separate size_code) and a 56-bit Reed-Solomon-style ECC over <code>[A1, AM, data]</code>. Used for both MFM and RLL captures. Wang XT-2190 and Maxtor drives ride on this parser unchanged.'
  },
  {
    id: 'ec1841', name: 'EC1841', sub: 'Soviet PC clone (1986)',
    enc: 'MFM', cat: 'mfm',
    specs: { 'sectors/trk': '17', 'sector size': '512', 'CRC': '32-bit', 'sync': '3×0x4489 + 0x49' },
    detail: 'Three 0x4489 primary syncs followed by a secondary 0x49, then a 4→2 nibble decode. Header layout begins <code>[00, 00, 0xC2, ...]</code>. The decoder runs a variant bank and merges results — uniform-payload tracks are repaired across all 17 sectors from a single good copy.'
  },
  {
    id: 'rodime', name: 'Rodime RO202', sub: '5 MB ST-506 (1983)',
    enc: 'MFM', cat: 'mfm',
    specs: { 'sectors/trk': '17', 'CRC poly': 'unknown', 'ID': '[FE cyl head sec]', 'sectors/disk': '321×4' },
    detail: 'The unsolved one. ID frame is <code>[FE, cyl, head, sec, ...]</code> with no size_code byte. The CRC polynomial is still unknown after months of RE work — parsers report <code>header_crc_ok = data_crc_ok = false</code>. RO202 capture is degraded; output image is ~99.86% zero-filled but byte-identical between auto-detect and explicit <code>--format Rodime</code>.'
  },
  {
    id: 'convergent', name: 'CMI CM5410-C', sub: 'Convergent AWS workstation',
    enc: 'MFM', cat: 'mfm',
    specs: { 'sectors/trk': '32', 'sector size': '256', 'CRC': 'CCITT-16', 'sync': '3×0xA1' },
    detail: 'Standard IBM-MFM sync. 256-byte sectors at 32 sectors/track. CRC-CCITT-16 (poly 0x1021, init 0x0000) for both ID and DATA. ID carries cyl_lo + 4-bit head, so cylinders 256-511 alias by low 8 bits — the validator checks cyl_lo against physical track.'
  },
  {
    id: 'xt2190', name: 'Wang XT-2190', sub: 'Maxtor / Wang Microvp',
    enc: 'MFM', cat: 'mfm',
    specs: { 'sectors/trk': '17', 'data rate': '10 Mbit/s', 'data CRC': '0x140A0445', 'parser': 'WD1006' },
    detail: 'Empirically the generic MFM decoder + WD1006 parser yields 100% good-CRC on the canonical capture. This arm exists only to bind the controller identity, force MFM bootstrap on stubborn captures, and capture per-capture data-CRC poly metadata from the command-line.'
  },
  {
    id: 'xebec', name: 'Xebec 104527', sub: 'ExSirius / Sirius (1985)',
    enc: 'MFM', cat: 'mfm',
    specs: { 'sectors/trk': '17', 'sector size': '512', 'CRC': '0x00A00805 (32-bit)', 'oracle': '320/320' },
    detail: 'Reuses the EC1841 header sub-pipeline (3×0x4489 + secondary 0x49 + 4→2 nibble decode) but diverges at the data field marker (<code>01 00 C9</code> instead of <code>01 00 00</code>) and CRC scope (<code>[0xC9, 512]</code>). 320/320 byte-exact across 5 cylinders × 4 heads in probe v2.'
  },
  {
    id: 'st11m', name: 'Seagate ST11M', sub: 'OSICom 8810',
    enc: 'MFM', cat: 'mfm',
    specs: { 'sectors/trk': '17', 'CRC poly': '0x41044185', 'ECC bytes': '5', 'oracle': '99.25%' },
    detail: 'Same address marks as ST21M (FE/F8), same Seagate CRC poly, same 5-byte ECC trailer. Whole-disk probe sweep produces 41,508 / 41,820 = 99.25% byte-exact against the .ima oracle under the existing Generic + St21M parser.'
  },
  {
    id: 'wang2275', name: 'WANG 2275', sub: 'Wang PC Num3',
    enc: 'MFM', cat: 'mfm',
    specs: { 'geometry': '612×4×32×256', 'header': '8-bit sumcheck', 'data CRC': '24-bit / 0x3E4012', 'sync': '3×0xA1' },
    detail: 'The exotic one. Header is 8-byte <code>[FE, cyl_lo, (cyl_hi&lt;&lt;4)|head, sec, sumcheck, 4E, 4E, flags]</code> with an 8-bit <em>additive</em> sumcheck — no CRC. Data is 256 B + 24-bit CRC (poly 0x3E4012 init 0x223808). Pinned by brute-force probe at 830/896 hits.'
  },
  {
    id: 'st21r', name: 'Seagate ST21R', sub: 'The format-mismatch lesson',
    enc: 'RLL', cat: 'rll',
    specs: { 'sectors/trk': '26', 'AM': 'none', 'CRC poly': '0x41044185', 'framing': 'preamble-based' },
    detail: 'The wake-up call. Original design assumed FE/FB address marks universally — ST21R uses none. Sector boundaries are defined entirely by preamble/gap structure: 4T×35 VFO preamble, 3T break, 4T×20 VFO, 3T+8T marks. Drove the entire pivot to controller-specific format dispatch.'
  },
  {
    id: 'dtc7287', name: 'DTC7287', sub: 'NGEN workstation',
    enc: 'RLL', cat: 'rll',
    specs: { 'sectors/trk': '26', 'sync': 'short preamble + cyl LUT', 'cosmetic': '2200/2400 gap', 'AM': 'FA family' },
    detail: 'Cylinder number is encoded via a lookup table, not directly. The controller emits duplicate AM candidates ~2056 spacings after each paired record (probe-measured, zero variance); the parser suppresses these within an empirically-pinned <code>DTC7287_ARTEFACT_GAP = 2200</code> window — pure cosmetic, the data is already correctly paired.'
  },
  {
    id: 'adaptec', name: 'Adaptec ACB-2370/2', sub: '278R bridge controller',
    enc: 'RLL', cat: 'rll',
    specs: { 'sectors/trk': '26', 'sector size': '512', 'parser': 'WD1006', 'stages': '2-stage dispatch' },
    detail: 'Routes through SectorFormat::Wd1006 — Adaptec uses standard WD-compatible framing once past sync. Stage-2 dispatch was the fix for the ACB-2372 (278R) residual: differentiate the per-capture data CRC by sniffing the header pattern, not just the controller token.'
  },
  {
    id: 'omti', name: 'OMTI-8247', sub: 'Western RLL controller',
    enc: 'RLL', cat: 'rll',
    specs: { 'sectors/trk': '26', 'sync': '4T-pattern', 'pattern': 'distinctive', 'CRC': 'Seagate-family' },
    detail: 'Has a unique 4T-pattern sync signature counted separately from the 3T-family controllers (Seagate ST21R, Adaptec). The OMTI scanner counts 4T-sync hits as a discriminator during controller probing.'
  }
];

const TIMELINE = [
  { date: '2026-03-28', ver: '0.1.0', major: true, title: 'Project starts: 4 HLD design iterations',
    body: 'Four HLD versions reviewed by 4 agents each (16 total reviews) before any code is written. Key bets that survived: bit-level 0x4489 sync, greedy prefix-match for RLL, streaming track iterator, no traits, no CRC crate.' },
  { date: '2026-03-29', ver: '0.3.0', major: true, title: 'Status report: pipeline works, real data fails',
    body: '4,168 lines across 5 modules, 88 tests passing, 0 clippy warnings. But run on a real BitSavers RLL capture: 0% CRC pass rate. Two root causes identified — controller-specific framing (ST21R has no FE/FB) and quantization jitter at the bit-cell layer.' },
  { date: '2026-03-29', ver: '0.3.1', title: 'PLL clock-recovery addendum',
    body: 'Fixed-T <code>round(delta / T)</code> replaced with a tracking PLL. Each transition nudges T by a fraction of the observed error, tracking spindle drift. ~10 lines of code; the foundation everything else builds on.' },
  { date: '2026-04-03', ver: '0.4.0', title: 'EC1841 (Soviet PC clone) format path',
    body: 'First non-IBM-WD controller. Introduced the variant-bank pattern: decode the track multiple ways and merge results. Also introduced "uniform-payload track repair" — fill the rest of a track from a single good copy.' },
  { date: '2026-04-25', ver: '0.5.0', title: 'RLL parser refactor (4 HLD versions)',
    body: 'Three iterations of HLDs over a single day to nail the RLL bit-layer and raw-mode capture parser. The codebase commits to per-controller sector parsers from this point.' },
  { date: '2026-04-28', ver: '0.5.5', title: 'Multi-controller wave: Adaptec, OMTI, Q540',
    body: 'Four HLDs in one day adding Adaptec ACB-2372, OMTI-8247, the Q540 zero-fill flag, and header track-context validation. The probe corpus in examples/ starts to balloon.' },
  { date: '2026-04-29', ver: '0.6.0', major: true, title: 'DTC7287 cylinder LUT + ST21M + ST21R',
    body: 'Three controllers in one day, each with its own quirks. DTC7287 needs a cylinder lookup table; ST21M and ST21R are Seagate cousins with subtly different framing. The "cosmetic" suppression patterns get pinned with empirical measurements (2200, 2056, 2342).' },
  { date: '2026-04-30', ver: '0.6.5', title: 'Convergent AWS + 278R Stage-2',
    body: 'CMI CM5410-C added: 256-byte sectors, 32 spt, CCITT-16. Adaptec ACB-2372 gets a Stage-2 dispatch fix to differentiate per-capture data CRCs by header sniffing.' },
  { date: '2026-05-02', ver: '0.7.0', title: 'Rodime CRC RE + Wang XT-2190 + Differential harness',
    body: 'Five HLDs in one day. Rodime CRC reverse-engineering begins (still unsolved). XT-2190 wired through WD1006. <code>tests/differential_harness.rs</code> added as a cross-controller regression net.' },
  { date: '2026-05-03', ver: '0.7.5', title: 'DT-PLL Phase 4 (Type-II for iSBC-214)',
    body: 'The iSBC-214 slip-zone (head 1, cylinders 316-337) drifts ~4.5% within a track, too fast for the Type-I PLL. A Type-II PLL recovers it. Sirius / Xebec104527 wiring added the same day.' },
  { date: '2026-05-04', ver: '0.8.0', title: 'WD ECC + ST11M + WANG 2275 + DT-PLL Phase 5',
    body: 'Five-byte WD ECC integration finalized. Seagate ST11M (OSICom 8810) at 99.25% byte-exact. Wang PC Num3 with its 8-bit additive sumcheck and 24-bit data CRC. Phase 5 adds a fixed-T fallback merged per-sector with Phase 4.' },
  { date: '2026-05-15', ver: '0.8.3', title: 'Byte-exact promotion + sync revival',
    body: 'Wang2275 promoted to byte-exact. Rodime sync-recovery revival pass. WD_1006 floor-test reduction. The push reaches "boring" — most changes are evidence-driven small tweaks.' },
  { date: '2026-05-16', ver: '0.8.4', title: 'Build & quality hygiene sweep',
    body: 'Repository-wide cleanup: clippy lints promoted into Cargo.toml so <code>--all-targets -- -D warnings</code> stays at zero across the example/probe corpus. Rodime path-hygiene. Wang2275 cmdline fallback + auto-detect.' },
  { date: '2026-05-17', ver: '0.8.5', major: true, title: 'Rodime auto-detect + analyze-fallback',
    body: 'RO202 captures with no explicit flags now produce an 11.2 MB image (byte-identical to <code>--format Rodime</code>) instead of exit-1. The probe scorer adds a 5th candidate. Image is 99.86% zero-filled — honest improvement, not a real decode. CRC poly still unknown.' }
];

const STRENGTHS = [
  { title: 'Rigorous design-then-build',
    body: 'Four HLD versions reviewed by four agents each before a line of code. The orchestration pseudocode in V4 still reads like the actual main loop two months later.' },
  { title: 'Empirically pinned constants',
    body: 'Every magic number (DTC7287_ARTEFACT_GAP = 2200, slip-zone cyl 316-337) traces to a probe measurement in examples/ and a HLD with the methodology. No guesses.' },
  { title: 'Streaming O(track) memory',
    body: 'The .tr iterator yields one track at a time. Peak memory is ~100 KB regardless of file size; the 167 MB ST21R sample decodes without buffering.' },
  { title: 'Auto-detection that fails loudly',
    body: 'Encoding, CRC config, and controller all auto-detect — but each detector exits with a specific error rather than guessing. EncodingAmbiguous suggests <code>--encoding</code>; CrcDetectionFailed dumps raw bytes for the user.' },
  { title: 'Test coverage scales with format complexity',
    body: '241 lib tests, 102 real-data regression tests, 6 differential-harness tests. Each new controller arm gets matching unit + integration coverage; zero clippy warnings repo-wide.' },
  { title: 'Paper trail for every decision',
    body: '60+ HLDs in wrk_docs/ pair with 60+ journals in wrk_journals/. Each push has a hypothesis, evidence, calibration data, and an honest "carry-forwards" section.' }
];

const IMPROVEMENTS = [
  { title: 'sector.rs is 7,028 lines',
    body: 'Ten controller parsers, four CRC families, and the ECC code all share one file. The module is monolithic enough that even the AGENTS.md guide warns about <code>src/sector.rs:1734</code> by line number.' },
  { title: '120+ probe binaries in examples/',
    body: 'Each reverse-engineering session leaves a single-use <code>probe_*.rs</code> behind. These ship with the crate, compile under <code>cargo clippy --all-targets</code>, and accumulate bit-rot. No mechanism to retire them.' },
  { title: 'Magic constants pinned to specific captures',
    body: 'DTC7287_ARTEFACT_GAP = 2200 is "probe-measured intra-pair gap exactly 2056 on both DTC7287 captures." A third capture could shift this — the safety belt is one number wide.' },
  { title: 'Rodime CRC still unknown after months',
    body: 'Five HLDs and many probes in. The RO202 path now succeeds but flags every sector as bad-CRC; the resulting image is 99.86% zero-filled. The codebase honestly labels this an "honest improvement, not a decode."' },
  { title: 'No ECC correction yet',
    body: 'WD\'s 56-bit Reed-Solomon-style ECC bytes are recognized and verified, but errors aren\'t corrected. Sectors that fail CRC could often be recovered; current design explicitly defers.' },
  { title: 'Platform paths baked into tests',
    body: 'Integration tests reference <code>C:\\tmp\\MFM disk images\\</code> directly; AGENTS.md notes they only run when the data is present. Wraps the rigor in a Windows-only escape hatch.' }
];

const STATS = {
  loc: '15,180',
  files: '6',
  probes: '120+',
  hlds: '64',
  journals: '63',
  tests: '349',
  controllers: '12',
  version: '0.8.5'
};

// ── Physical & encoding layer (deep dive) ────────────────────────────
const TECH_TABS = [
  {
    id: 'flux',
    label: 'Flux & ST-506',
    title: 'What\'s actually on the platter',
    lede: 'A hard disk stores no voltages, no bits, and no bytes — just regions of magnetic polarity. Reading is the art of noticing where the polarity flips.',
    body: `
      <p>Inside the drive, the platter spins at ~3,600 RPM under a read/write head whose air-gap is roughly 200 nm. The head is a tiny inductive coil: when the magnetic field below it changes direction, the changing flux induces a voltage spike across the coil. A <em>transition</em> is one such polarity reversal. The absence of a transition is information too — a stretch of constant polarity carries data just as much as a flip does.</p>

      <p>The drive's analog electronics amplify these spikes, square them up with a peak-detector, and emit a clean digital pulse on the ST-506 interface's <strong style="color:var(--amber)">RDATA</strong> line — one pulse per detected transition. <strong style="color:var(--text)">That is the only signal the controller sees.</strong> The drive knows nothing about bits, bytes, sectors, or even what encoding is in use; it is a dumb flux-to-pulse transducer. Every interpretation above the pulse train happens in the controller.</p>

      <p>This is why mdrll exists at all: the Gesswein <code>.tr</code> file is just the timestamps of those pulses, captured at 200 MHz. The controller's interpretation is gone. To rebuild the disk image, mdrll has to <em>be</em> the controller — and replicate the exact decoding logic of whichever vendor's chip originally produced the data.</p>

      <p><strong style="color:var(--phosphor)">Key insight</strong> — Information lives in the <em>spacing between</em> transitions, not in the transitions themselves. Both MFM and RLL are families of rules that say "given a sequence of data bits, here's the timing pattern of transitions you should produce."</p>
    `,
    diagram: 'flux'
  },
  {
    id: 'mfm',
    label: 'MFM',
    title: 'Modified Frequency Modulation',
    lede: 'Each data bit gets a 2T-wide bit-cell with two slots: clock (C) and data (D). Transitions go in the slots, following a rule designed to keep them never too close and never too far.',
    body: `
      <p>MFM divides time into <strong style="color:var(--amber)">bit-cells</strong>, each 2T wide where T is one code-bit period (T = 100 ns @ 5 Mbit/s on standard ST-506). Inside each cell are two slots: a clock slot at position 0 and a data slot at position T. A transition may appear in either slot, neither, or both — determined entirely by the data bits and one rule:</p>

      <pre class="code" style="margin:14px 0;font-size:12.5px;line-height:1.7;">
<span class="com">// MFM transition placement rule</span>
<span class="kw">if</span> data_bit == <span class="num">1</span> {
    transition_at(<span class="fn">D</span>);              <span class="com">// 1 → flip mid-cell</span>
} <span class="kw">else if</span> prev_data_bit == <span class="num">0</span> {
    transition_at(<span class="fn">C</span>);              <span class="com">// 00 → flip at cell boundary</span>
}                                  <span class="com">// 10 → no transition</span></pre>

      <p>The consequence: consecutive transitions are always separated by 2T, 3T, or 4T — never less, never more. <strong style="color:var(--text)">2T</strong> = "1, 1" (two D slots in a row). <strong style="color:var(--text)">3T</strong> = "1, 0, 1" or "0, 0" patterns. <strong style="color:var(--text)">4T</strong> = "1, 0, 0, 1". This is what produces MFM's three-peak histogram. A pulse spacing of 1T or 5T cannot occur in valid MFM — and the decoder exploits exactly that for sync detection.</p>

      <p>One byte takes 16 cells (16T = 1.6 μs at 5 Mbit/s). Of those, only 8 slots carry data; the other 8 carry clocks. MFM is 50% efficient — half the channel bandwidth is spent on guaranteeing clock recovery. That redundancy is what RLL 2,7 reclaims.</p>
    `,
    diagram: 'mfm'
  },
  {
    id: 'rll',
    label: 'RLL 2,7',
    title: 'Run-Length Limited (d=2, k=7)',
    lede: 'A density code: 50% more data per transition than MFM, at the cost of giving up the one-bit-per-cell mental model.',
    body: `
      <p>RLL 2,7 throws out the bit-cell entirely. Instead, it speaks in terms of <strong style="color:var(--amber)">runs</strong> — the number of zeros between consecutive ones in a stream of <em>code bits</em>. The (d, k) = (2, 7) constraint says: between any two 1s, there must be at least <strong style="color:var(--text)">2 zeros</strong> and at most <strong style="color:var(--text)">7 zeros</strong>.</p>

      <p>That constraint lets you safely <em>shrink</em> the bit-cell: if no two transitions can be closer than 3 code-bits apart, you can push the code-bit period down to 2/3 of MFM's T without transitions colliding. Net result: at the same physical flux frequency, you fit 1.5× as many user bits.</p>

      <p>The price is encoding complexity. Data bits don't map 1:1 to code bits — they map through a small, variable-length codebook. mdrll's table:</p>

      <pre class="code" style="margin:14px 0;font-size:12px;line-height:1.65;">
<span class="com">// (2,7) RLL codebook — 7 entries, proven prefix-free</span>
data → code           transitions
<span class="num">10</span>   → <span class="str">0100</span>             1
<span class="num">11</span>   → <span class="str">1000</span>             1
<span class="num">000</span>  → <span class="str">000100</span>           1
<span class="num">010</span>  → <span class="str">100100</span>           2  <span class="com">// not 1:1!</span>
<span class="num">011</span>  → <span class="str">001000</span>           1
<span class="num">0010</span> → <span class="str">00100100</span>         2
<span class="num">0011</span> → <span class="str">00001000</span>         1</pre>

      <p>Decoding is <strong style="color:var(--text)">greedy left-to-right prefix matching</strong> against the reversed table. mdrll's design doc proved the table is prefix-free by exhaustive boundary check (49 pairs), which guarantees this greedy algorithm finds the unique correct parse — no backtracking needed.</p>

      <p>The histogram of inter-transition spacings now shows <strong style="color:var(--text)">six peaks</strong> instead of three — at 3T, 4T, 5T, 6T, 7T, 8T code-bit units — because the minimum is 3 (zeros between 1s) and the maximum is 8 (seven zeros plus the trailing 1).</p>
    `,
    diagram: 'rll'
  },
  {
    id: 'sync',
    label: 'Sync & framing',
    title: 'How a controller finds a sector at all',
    lede: 'Before parsing anything, the controller has to know <em>where</em> in the bit stream a sector begins — and which half of each cell is the data half. Both questions are answered by one trick: a deliberately illegal bit pattern.',
    body: `
      <p>A sector field begins with a <strong style="color:var(--amber)">sync mark</strong>: three copies of the byte <code>0xA1</code> back-to-back, followed by an address-mark byte (<code>0xFE</code> for ID fields, <code>0xFB</code> for DATA fields). But this is harder than it sounds — A1 is just data, and data containing the bytes <code>A1 A1 A1 FE</code> shouldn't trigger a false sync.</p>

      <p>The trick: when the controller <em>writes</em> the sync A1, it deliberately omits one of the clock-slot transitions. A normal A1 byte under MFM encoding produces the 16-bit pattern <strong class="mono" style="color:var(--text)">0x44A9</strong>. The sync A1 instead produces <strong class="mono" style="color:var(--amber)">0x4489</strong> — identical except clock bit C2 is suppressed. This is a violation of the MFM rule and <strong style="color:var(--text)">cannot appear in any legally-written data</strong>.</p>

      <p>The reader's job: scan the raw bit stream — <em>not</em> the byte stream, which doesn't yet exist because phase hasn't been established — for three consecutive 0x4489s. When found, this single event answers two questions simultaneously:</p>

      <ul style="color:var(--text-dim);font-size:14px;line-height:1.7;margin:14px 0 14px 22px;padding:0;">
        <li><strong style="color:var(--text)">Phase</strong> — we now know which half-cells are clocks and which are data. Decoding can begin.</li>
        <li><strong style="color:var(--text)">Boundary</strong> — the byte immediately following the third 0x4489 is the address mark; the rest of the field follows in known order.</li>
      </ul>

      <p>RLL controllers don't all use 0x4489. The Seagate ST21R uses no address marks at all — its sectors are bounded by preamble/gap patterns. The DTC7287 uses short preambles plus a cylinder lookup table. The Wang 2275 uses an 8-bit additive sumcheck where you'd expect a CRC. Each one needed reverse-engineering.</p>
    `,
    diagram: 'sync'
  },
  {
    id: 'crc',
    label: 'CRC',
    title: 'Cyclic Redundancy Check',
    lede: 'A CRC is polynomial long division done in GF(2). It catches every burst error shorter than the polynomial\'s degree — which is most read errors on magnetic media.',
    body: `
      <p>Treat the sector\'s bytes as the coefficients of a polynomial over GF(2) — the finite field where addition and subtraction are both XOR. Divide that polynomial by a fixed <strong style="color:var(--amber)">generator polynomial</strong>; the remainder is the CRC. Append it. On read, divide the whole thing again — if the remainder is zero, no error was detected.</p>

      <p>The standard IBM/WD header CRC is <strong class="mono" style="color:var(--text)">CRC-16</strong> with polynomial <code>0x1021</code> = x¹⁶ + x¹² + x⁵ + 1, initial value <code>0xFFFF</code>. Implemented in hardware as a 16-bit shift register with XOR taps at the polynomial\'s nonzero terms — about 15 lines of Rust in <code>sector.rs</code>:</p>

      <pre class="code" style="margin:14px 0;font-size:12px;line-height:1.65;">
<span class="kw">fn</span> <span class="fn">crc16_update</span>(crc: u16, data: &amp;[u8]) -&gt; u16 {
    <span class="kw">let mut</span> crc = crc;
    <span class="kw">for</span> &amp;byte <span class="kw">in</span> data {
        crc ^= (byte <span class="kw">as</span> u16) &lt;&lt; <span class="num">8</span>;
        <span class="kw">for</span> _ <span class="kw">in</span> <span class="num">0</span>..<span class="num">8</span> {
            <span class="kw">if</span> crc &amp; <span class="num">0x8000</span> != <span class="num">0</span> {
                crc = (crc &lt;&lt; <span class="num">1</span>) ^ <span class="num">0x1021</span>;
            } <span class="kw">else</span> { crc &lt;&lt;= <span class="num">1</span>; }
        }
    }
    crc
}</pre>

      <p>mdrll carries <strong style="color:var(--text)">four CRC families</strong> for different controllers: WD (CRC-16, 0x1021), WD32 (CRC-32, 0x140A0445 over the data field), Seagate (CRC-32, 0x41044185), and a 24-bit CRC for Wang 2275 (0x3E4012). Plus the 56-bit ECC width discussed next. Detection is by trial — on the first decodable sector, mdrll runs each candidate poly and keeps the one that leaves a zero remainder.</p>

      <p>A CRC catches errors but cannot correct them — the remainder tells you <em>that</em> something flipped, not <em>which bit</em>. For correction you need redundancy beyond the minimum: an Error-Correcting Code.</p>
    `,
    diagram: 'crc'
  },
  {
    id: 'ecc',
    label: 'ECC',
    title: 'Error-Correcting Codes',
    lede: 'WD\'s controllers append 5 trailing bytes — 56 bits — after each sector\'s data CRC. Those bytes are not a CRC. They\'re a Reed-Solomon-style code that lets the controller <em>fix</em> a short error burst, not just detect it.',
    body: `
      <p>The WD1006V-SR2 ECC is a 56-bit polynomial check using generator <code>0x140A0445000101</code> with initial value all-ones, computed over the scope <code>[0xA1, AM, 512_data]</code>. mdrll implements it via a width-parameterized CRC primitive in <code>sector.rs</code>:</p>

      <pre class="code" style="margin:14px 0;font-size:12px;line-height:1.65;">
<span class="com">// width can be any 8..=56 — same primitive serves both CRC and ECC</span>
<span class="kw">fn</span> <span class="fn">crc_update_n</span>(crc: u64, data: &amp;[u8], poly: u64, width: u8) -&gt; u64 {
    <span class="kw">let</span> mask = (<span class="num">1u64</span> &lt;&lt; width) - <span class="num">1</span>;
    <span class="kw">let</span> topbit = <span class="num">1u64</span> &lt;&lt; (width - <span class="num">1</span>);
    <span class="kw">let</span> shift = (width - <span class="num">8</span>) <span class="kw">as</span> u32;
    <span class="kw">for</span> &amp;byte <span class="kw">in</span> data { <span class="com">/* … */</span> }
    crc &amp; mask
}</pre>

      <p>What ECC gives you that CRC doesn't: if the corrupted byte position is within the code\'s correction capability (~1-2 bursts of a few bits each for the WD code), the syndrome — the nonzero remainder — encodes <em>both</em> the position and the magnitude of the error. The controller XORs the correction in, and the sector reads clean.</p>

      <p><strong style="color:var(--amber)">mdrll does not currently correct.</strong> It recognizes the trailing ECC bytes, knows their width, and computes the syndrome — but it stops at flagging the sector as CRC-failed. The HLDs note this as deferred work; recovering ECC correction would lift the data-recovery yield meaningfully on degraded captures (RO202\'s 99.86% zero-fill is the canonical worst case).</p>

      <p>Some controllers go further. Seagate's ST21M / ST11M use a 5-byte trailer over a Seagate CRC poly. Wang 2275 has no ECC at all — the 24-bit data CRC stands alone. The number of trailing bytes is detected on the first decodable sector and fixed for the rest of the disk.</p>
    `,
    diagram: 'ecc'
  }
];

// MFM and RLL synthetic histograms (idealized for the demo)
const MFM_HIST = (() => {
  // peaks at ~40, 60, 80 (T=20)
  const bins = new Array(120).fill(0);
  const peaks = [[40, 200], [60, 280], [80, 180]];
  for (let i = 0; i < bins.length; i++) {
    let v = 0;
    for (const [c, amp] of peaks) {
      const d = (i - c);
      v += amp * Math.exp(-d * d / 18);
    }
    bins[i] = v + Math.random() * 3;
  }
  return bins;
})();

const RLL_HIST = (() => {
  // peaks at ~40, 53, 67, 80, 93, 107 (T=13.33)
  const bins = new Array(120).fill(0);
  const peaks = [[40, 220], [53, 230], [67, 200], [80, 170], [93, 130], [107, 90]];
  for (let i = 0; i < bins.length; i++) {
    let v = 0;
    for (const [c, amp] of peaks) {
      const d = (i - c);
      v += amp * Math.exp(-d * d / 14);
    }
    bins[i] = v + Math.random() * 3;
  }
  return bins;
})();
