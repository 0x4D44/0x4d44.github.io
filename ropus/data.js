// Content for the ropus site

window.ROPUS_DATA = {
  modes: [
    {
      key: "silk",
      title: "SILK",
      sub: "Speech / low-bitrate",
      desc: "Inherited from the Skype codec. Linear-predictive, optimized for voice. Handles narrowband through wideband at low bitrates with FEC and DTX. Inside ropus, it lives at silk/ with the largest module surface — common.rs, tables.rs, encoder.rs, decoder.rs.",
      rates: { 8: true, 12: true, 16: true, 24: false, 48: false },
      labels: { 8: "NB", 12: "MB", 16: "WB", 24: "—", 48: "—" }
    },
    {
      key: "hybrid",
      title: "Hybrid",
      sub: "SILK + CELT",
      desc: "Splits the spectrum: SILK below ~8 kHz, CELT above. Used for super-wideband and full-band speech where you need clarity at the bottom of the band and air at the top. The CELT↔SILK info handoff has its own parity bugs documented in the changelog.",
      rates: { 8: false, 12: false, 16: false, 24: true, 48: true },
      labels: { 8: "—", 12: "—", 16: "—", 24: "SWB", 48: "FB" }
    },
    {
      key: "celt",
      title: "CELT",
      sub: "Music / full-band",
      desc: "Constrained Energy Lapped Transform — an MDCT-based codec for music and general audio. Range-coded entropy, vector-quantised bands, pitch prefilter. ropus's CELT folder spans range_coder, fft, mdct, bands, pitch, quant_bands, vq, rate, modes, encoder, decoder.",
      rates: { 8: true, 12: true, 16: true, 24: true, 48: true },
      labels: { 8: "NB", 12: "MB", 16: "WB", 24: "SWB", 48: "FB" }
    }
  ],

  modules: {
    CELT: [
      { i: 1, name: "range_coder", t: "t1", d: "Arithmetic coding primitives — the entropy layer the entire codec sits on. Bit-exact tier-1 against the C reference." },
      { i: 2, name: "math_ops + lpc", t: "t1", d: "Fixed-point math helpers and linear-predictive utilities. Q-format types from arch.h ported into types.rs." },
      { i: 3, name: "cwrs", t: "t1", d: "Combinatorial coding for pyramid vector quantization." },
      { i: 4, name: "bands", t: "t1", d: "Band processing — energy split, anti-collapse, theta-RDO stereo encoding." },
      { i: 5, name: "fft + mdct", t: "t1", d: "Fast Fourier transform and modified DCT. Uses uc! / uc_set! unchecked-indexing macros restored in 0.5.0 after a 9% safe-indexing regression." },
      { i: 6, name: "pitch", t: "t1", d: "Pitch detection and prefilter — the comb filter that bug-hunting taught us must always run, even when gain1 == 0." },
      { i: 7, name: "quant_bands", t: "t1", d: "Energy quantization across bands." },
      { i: 8, name: "vq", t: "t1", d: "Vector quantization for shape coding." },
      { i: 9, name: "rate", t: "t1", d: "Rate allocation and bit splitting." },
      { i: 10, name: "modes", t: "t1", d: "Mode configuration — the static mode tables driving frame size and band layout." },
      { i: 11, name: "decoder", t: "t1", d: "CELT decoder — byte-exact." },
      { i: 12, name: "encoder", t: "t1", d: "CELT encoder — byte-exact, with redundancy + final-range bookkeeping fixed in late April." }
    ],
    SILK: [
      { i: 13, name: "common + tables", t: "t1", d: "Shared resamplers, scaling, codebook tables." },
      { i: 14, name: "decoder", t: "t1", d: "SILK decoder — byte-exact." },
      { i: 15, name: "encoder", t: "t1", d: "SILK encoder including NSQ (noise-shaping quantizer). One of the longest divergence hunts of the port." }
    ],
    Opus: [
      { i: 16, name: "decoder", t: "t1", d: "Top-level Opus decoder — toc parsing, frame dispatch, PLC entry." },
      { i: 17, name: "encoder", t: "t1", d: "Top-level Opus encoder — mode selection, prefill, redundancy." },
      { i: 18, name: "multistream", t: "t1", d: "Multi-channel Opus (Vorbis-style channel mappings). Five setter-sequence divergences fixed in 0.12.18." },
      { i: 19, name: "repacketizer", t: "t1", d: "Stitch and split Opus packets without re-encoding." }
    ],
    DNN: [
      { i: 20, name: "core", t: "t1", d: "Neural inference engine — dense, conv, GRU primitives." },
      { i: 21, name: "lpcnet", t: "t2", d: "LPCNet PLC path. Tier-2 SNR-bounded against the C-float reference (50 dB gate, 42 dB classical ceiling)." },
      { i: 22, name: "fargan", t: "t2", d: "FARGAN generative PLC. Wired into decoder PLC path." },
      { i: 23, name: "lossgen", t: "t2", d: "Loss generation for harness testing — gated off in conformance builds." },
      { i: 24, name: "pitchdnn", t: "t2", d: "Neural pitch tracker. Feat18-residual and xcorr-features cascade fixes in May." },
      { i: 25, name: "rdovae", t: "t1", d: "RDOVAE forward pass — bit-exact tier-1 on the encoder-side latent." },
      { i: 26, name: "dred", t: "t1", d: "Deep REDundancy: encoder + decoder-parse + decoder-process. Final FARGAN PCM reconstruction deferred." }
    ]
  },

  tests: [
    {
      n: "01",
      title: "Per-module unit tests",
      desc: "Inline #[cfg(test)] modules across celt/, silk/, opus/, dnn/. Hand-specified expected values, fast feedback during development."
    },
    {
      n: "02",
      title: "Differential FFI harness",
      desc: "harness/build.rs compiles 89 xiph C files into libopus_ref and links it into the same Rust binary. ropus-compare runs encode/decode/roundtrip and compares output byte-for-byte. ~100 ms feedback loop."
    },
    {
      n: "03",
      title: "Parameterized differential grid",
      desc: "Sweep across bitrate × channels × frame size × complexity = 280 configurations. The harness's mature truth-source for routine regression."
    },
    {
      n: "04",
      title: "cargo-fuzz campaigns",
      desc: "Nine overnight + 24h fuzz campaigns documented in wrk_journals/. Targets: encode_multiframe, multistream, repacketizer_seq, dnn_blob, decode_plc_seq, mode-transition. The C reference is the oracle inside the fuzz loop."
    },
    {
      n: "05",
      title: "xiph/opus conformance tests",
      desc: "All 7 reference test binaries — padding, decode, api, encode, extensions, ietf_vectors, projection — compile unmodified against the capi/ shim and pass with --test-threads=1."
    },
    {
      n: "06",
      title: "IETF RFC 6716 / 8251 vectors",
      desc: "The spec-level oracle. 12 reference bitstreams × {mono, stereo} = 24 subtests, run through opus_demo -d + opus_compare (both upstream .c files compiled verbatim) at the RFC-mandated quality threshold. All 24 pass."
    },
    {
      n: "07",
      title: "Ambisonics projection roundtrip",
      desc: "First- through fifth-order ambisonic fixtures encoded and decoded through channel_mapping == 3. Byte-exact encode, sample-exact decode."
    },
    {
      n: "08",
      title: "Release-preflight gate matrix",
      desc: "Distinguishes exact byte parity, exact PCM parity, bounded drift, SNR-gated, recovery-only, and asset-skipped lanes. Performance threshold (decode 1.26×) and platform/sanitizer breadth (x86_64 + cargo-fuzz ASan) are release-blocking."
    }
  ],

  perf: {
    encode: [
      { v: "SILK NB 8k mono noise", r: 1.05 },
      { v: "SILK WB 16k mono noise", r: 1.14 },
      { v: "Hybrid 24k mono noise", r: 1.11 },
      { v: "CELT FB 48k mono noise", r: 1.08 },
      { v: "CELT FB 48k stereo noise", r: 1.04 },
      { v: "CELT 48k sine 1k loud", r: 0.94 },
      { v: "CELT 48k sweep", r: 0.96 },
      { v: "CELT 48k square 1k", r: 1.03 },
      { v: "SPEECH 48k mono (TTS)", r: 0.84 },
      { v: "MUSIC 48k stereo", r: 1.01 }
    ],
    decode: [
      { v: "SILK NB 8k mono noise", r: 0.69 },
      { v: "SILK WB 16k mono noise", r: 0.89 },
      { v: "Hybrid 24k mono noise", r: 0.90 },
      { v: "CELT FB 48k mono noise", r: 0.92 },
      { v: "CELT FB 48k stereo noise", r: 0.94 },
      { v: "CELT 48k sine 1k loud", r: 1.05 },
      { v: "CELT 48k sweep", r: 0.99 },
      { v: "CELT 48k square 1k", r: 1.03 },
      { v: "SPEECH 48k mono (TTS)", r: 0.98 },
      { v: "MUSIC 48k stereo", r: 0.98 }
    ]
  },

  timeline: [
    {
      pos: 0,
      date: "27 March 2026",
      title: "Day 0 — bulk import",
      desc: "First public commit de682e3: 53,852-line drop. 22 of 26 modules ported. Compiles, but very little of it is correct yet — the gap between 'modules exist' and 'modules are right' is the rest of the story."
    },
    {
      pos: 12,
      date: "29 March – 4 April",
      title: "Trace-fix grind",
      desc: "Pick a failing config (silence at 48 kHz is easiest), find the first divergent byte, instrument both C and Rust at matching points, bisect upstream until the bug collapses to one function. The NSQ Q14 LPC bug took six cascading fixes across a week."
    },
    {
      pos: 28,
      date: "4 April",
      title: "Dynalloc parallel session",
      desc: "Seven named agents in parallel against a related-bug cluster. 25+ bugs found, 14 tests flipped in a day. Also: agents step on each other. The note 'Need better isolation between sessions' lands."
    },
    {
      pos: 38,
      date: "5 April — 2 AM",
      title: "The QCONST32 unlock",
      desc: "A devil's advocate agent reframes the hunt: stop looking in functions, look at the constants feeding them. QCONST32(0.70710678f, 31) in C uses f32 — ropus used f64. A 23-count delta in Q31, rippling through the stereo encoder's RDO loop. One-line fix. 31 tests flip green."
    },
    {
      pos: 42,
      date: "5 April — VICTORY.md",
      title: "280 / 280 on the harness",
      desc: "The journal calls it victory. It is, narrowly. The harness sweep passes end-to-end. But IETF vectors haven't run yet, regression tests haven't run yet, and 298 more commits sit between here and shippable."
    },
    {
      pos: 55,
      date: "8 April",
      title: "Six near-duplicate plans",
      desc: "wrk_docs/ sprouts six coverage-improvement plans, written in parallel by agents who didn't know the others existed. The cost of dispatching without a canonical artifact, fixed by hand."
    },
    {
      pos: 70,
      date: "18 April",
      title: "Encoder bookkeeping bugs K–P",
      desc: "Five named bugs in get_final_range bookkeeping. The bytes are right. Both decoders agree on the stream. Only the encoder's internal self-consistency check fails. The worst kind of bug — you can be byte-exact on outputs and still wrong on state."
    },
    {
      pos: 78,
      date: "19 April",
      title: "Stage-10 project audit",
      desc: "An audit finds commit 5abd1a9, a 'remove feature flags' refactor, silently deleted the DNN integration that landed 11 days earlier. Nobody noticed for a week and a half. Re-wire, journal, ADR the lesson."
    },
    {
      pos: 84,
      date: "19 April",
      title: "First crates.io publish",
      desc: "0.3.0. Library carved out into ropus/, harness/ stays publish=false. README, LICENSE, real metadata. The crate is now consumable: cargo add ropus."
    },
    {
      pos: 92,
      date: "29 April – 11 May",
      title: "Integration round-trip hardening",
      desc: "0.12.7 through 0.12.18: multistream setter family unification, SILK prefill structural fix, CELT decoder PLC default state, gain-fade fixed-point parity, DRED bitrate plumbing (15-vector FFI fixture, 5–120 kbps × 8/16/24/48 kHz). 11 fuzz crash classes triaged and pinned."
    },
    {
      pos: 100,
      date: "Ongoing",
      title: "Long tail",
      desc: "Bug L (usize underflow in re-enabled analysis path), fuzz campaign 9, mutation testing audit revival, performance threshold gates. A port is never done — there is only a declining defect rate and a shipping decision."
    }
  ],

  lessons: [
    { n: "01", title: "Build the oracle before the port", body: "Front-loading the differential harness would have compressed 24 days into closer to ten. Every bug found post-VICTORY was a bug bisection could have surfaced on the day the code was written." },
    { n: "02", title: "Differential-wrap each module on landing", body: "Bottom-up by dependency, but with a trivial differential smoke test around every module the day it lands — not held off until the harness phase." },
    { n: "03", title: "V1 HLD → parallel CR + DA → V2 → implement", body: "Sessions that wrote a V2 HLD before any code had an order-of-magnitude better hit rate than 'write a plan, implement, review after.' The overhead is real; the rework saved is larger." },
    { n: "04", title: "Be suspicious of refactors", body: "A 'clean up feature flags' commit silently deleted the DNN integration. Any refactor touching integration surface gets a DA whose only job is to list what the commit could be silently deleting." },
    { n: "05", title: "Track cost from day one", body: "Token spend on a 24-day multi-agent codec port is not free. Estimate: low thousands of dollars in API. Future-you wants to know the real number." },
    { n: "06", title: "Don't redefine the oracle without a flag day", body: "Tier-2 SNR-bounded acceptance for DNN paths is a reasonable engineering call. Sliding it in via an HLD without an ADR makes 'bit-exact with C' mean different things in different stages." }
  ]
};
