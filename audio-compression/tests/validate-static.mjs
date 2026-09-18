// Static guards for "Throwing Sound Away".
//
// The checks that do not need a browser: file hygiene, the house conventions
// every page of this study shares, the wiring into the almanac catalogue, and
// the numerical soundness of the shared DSP kit (which is loaded here as a
// plain script into a fake `window`, exactly as the pages load it).
//
// The browser-only checks — layout overflow, the Almanac pill, console errors
// — live in tests/browser.test.mjs.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = resolve(HERE, "..");
const ROOT = resolve(DOC, "..");
const SLUG = "audio-compression";

const read = (p) => readFileSync(p, "utf8");

const PAGES = [
  ["00", "index.html"], ["01", "1-sound.html"], ["02", "2-ear.html"],
  ["03", "3-masking.html"], ["04", "4-transform.html"], ["05", "5-quantize.html"],
  ["06", "6-entropy.html"], ["07", "7-mp3.html"], ["08", "8-aac.html"],
  ["09", "9-opus.html"], ["10", "10-lossless.html"], ["11", "11-artifacts.html"],
  ["12", "12-choosing.html"], ["13", "lexicon.html"],
];
const html = Object.fromEntries(PAGES.map(([, f]) => [f, read(join(DOC, f))]));
const css = read(join(DOC, "assets/site.css"));
const siteJs = read(join(DOC, "assets/site.js"));

// The shared kit, loaded the way a browser loads it.
function loadKit() {
  const w = {};
  w.window = w;
  w.addEventListener = () => {};
  w.document = { documentElement: {}, querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, body: { getAttribute: () => null }, addEventListener: () => {} };
  new Function("window", read(join(DOC, "assets/dsp.js")))(w);
  new Function("window", read(join(DOC, "assets/audio.js")))(w);
  return w;
}
const W = loadKit();
const D = W.DSP;
const A = W.AUD;

// ============================================================
// File hygiene and house conventions, page by page
// ============================================================

test("every chapter of the study exists", () => {
  for (const [, f] of PAGES) assert.ok(html[f].length > 2000, `${f} is empty or tiny`);
});

test("no page loads anything from an external origin", () => {
  for (const [, f] of PAGES) {
    const tags = [...html[f].matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*>/gi)].map((m) => m[0]);
    const external = tags.filter((t) => /\b(?:src|href)="(?:https?:)?\/\//i.test(t));
    assert.deepEqual(external, [], `${f} loads an external subresource: ${external.join(", ")}`);
    assert.ok(!/type="text\/babel"/.test(html[f]), `${f}: no in-browser Babel — this study has no build step`);
  }
});

test("every page carries the shared almanac back button exactly once", () => {
  for (const [, f] of PAGES) {
    const hits = html[f].match(/<script defer src="\/almanac-back\.js"><\/script>/g) || [];
    assert.equal(hits.length, 1, `${f} has ${hits.length} back-button includes, expected 1`);
  }
});

test("catalogue links stay in the same tab", () => {
  for (const [, f] of PAGES) {
    assert.ok(!/target="_blank"/.test(html[f]), `${f} opens a new tab`);
  }
});

// The scripts a page actually loads, in document order. Matching on the raw
// text would also match a page that merely *mentions* assets/audio.js inside a
// <code> element, which several of them do.
const scriptsOf = (f) =>
  [...html[f].matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);

test("every page declares its chapter and mounts the shared chrome", () => {
  for (const [n, f] of PAGES) {
    assert.match(html[f], new RegExp(`<body data-chapter="${n}"`), `${f} must set data-chapter="${n}"`);
    assert.match(html[f], /<div id="topbar"><\/div>/, `${f} must mount the top bar`);
    assert.match(html[f], /<div class="pager" data-pager><\/div>/, `${f} must have the prev/next pager`);
    assert.match(html[f], /<link rel="stylesheet" href="assets\/site\.css">/, `${f} must link assets/site.css`);
    const loaded = scriptsOf(f);
    for (const asset of ["assets/dsp.js", "assets/audio.js", "assets/site.js"]) {
      assert.ok(loaded.includes(asset), `${f} must load ${asset}`);
    }
  }
});

test("the scripts load in an order where the helpers exist before the figures", () => {
  for (const [, f] of PAGES) {
    const loaded = scriptsOf(f);
    const order = ["assets/dsp.js", "assets/audio.js", "assets/site.js"].map((a) => loaded.indexOf(a));
    assert.ok(order[0] < order[1] && order[1] < order[2],
      `${f}: dsp.js, audio.js and site.js must load in that order, got ${loaded.join(", ")}`);
    assert.equal(loaded[loaded.length - 1], "/almanac-back.js",
      `${f}: the back pill must be the last script on the page`);
  }
});

test("the chapter table in site.js matches the files on disk", () => {
  for (const [n, f] of PAGES) {
    assert.match(siteJs, new RegExp(`n: "${n}"[^}]*href: "${f}"`), `site.js is missing ${n} -> ${f}`);
  }
  const listed = [...siteJs.matchAll(/href: "([^"]+\.html)"/g)].map((m) => m[1]);
  assert.deepEqual(listed.sort(), PAGES.map(([, f]) => f).sort(), "site.js lists a page that does not exist");
});

test("every rail anchor points at a section that exists on the same page", () => {
  for (const [, f] of PAGES) {
    const rail = html[f].match(/<nav class="rail"[\s\S]*?<\/nav>/);
    if (!rail) { assert.fail(`${f} has no section rail`); return; }
    const ids = [...rail[0].matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(ids.length >= 4, `${f}: only ${ids.length} rail entries`);
    for (const id of ids) {
      assert.ok(new RegExp(`id="${id}"`).test(html[f]), `${f}: rail links to #${id}, which does not exist`);
    }
  }
});

test("every internal chapter link resolves to a file in the study", () => {
  const known = new Set(PAGES.map(([, f]) => f));
  for (const [, f] of PAGES) {
    const links = [...html[f].matchAll(/href="([^"#:]+\.html)(?:#[^"]*)?"/g)].map((m) => m[1]);
    for (const l of links) {
      if (l.startsWith("/")) continue;             // absolute links into the wider almanac
      assert.ok(known.has(l), `${f} links to ${l}, which is not part of this study`);
    }
  }
});

test("each page has real figures, not just prose", () => {
  for (const [n, f] of PAGES) {
    if (f === "lexicon.html") continue;            // the lexicon is a reference, not a lab
    const figures = (html[f].match(/<figure class="figure/g) || []).length;
    const canvases = (html[f].match(/<canvas/g) || []).length;
    assert.ok(figures >= (n === "00" ? 1 : 4), `${f} has only ${figures} figures`);
    assert.ok(canvases >= 1, `${f} has no canvas`);
  }
});

test("every canvas referenced by a page's script is declared in its markup", () => {
  for (const [, f] of PAGES) {
    const declared = new Set([...html[f].matchAll(/<canvas[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
    const used = [...html[f].matchAll(/new AC\.Plot\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
    for (const id of used) assert.ok(declared.has(id), `${f}: AC.Plot("${id}") has no such canvas`);
  }
});

test("no page ships debugging output", () => {
  for (const [, f] of PAGES) {
    assert.ok(!/console\.log\(/.test(html[f]), `${f} still has a console.log`);
    assert.ok(!/\bdebugger\b/.test(html[f]), `${f} still has a debugger statement`);
  }
});

test("no stray audio or binary media crept into the document", () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
  const media = walk(DOC).filter((p) => /\.(mp3|wav|ogg|opus|m4a|aac|flac|mp4|webm)$/i.test(p));
  assert.deepEqual(media, [], `this study synthesises everything: ${media.join(", ")}`);
});

// ============================================================
// The design system's own invariants
// ============================================================

test("the top bar is inset clear of the Almanac back pill", () => {
  // /almanac-back.js pins its pill to [0,0 109x41] at every viewport width, so
  // the inset must be unconditional and at least 112px.
  const m = css.match(/\.topbar-inner\s*\{[^}]*padding:\s*0\s+\d+px\s+0\s+(\d+)px/s);
  assert.ok(m, "expected .topbar-inner to declare its padding");
  assert.ok(Number(m[1]) >= 112, `.topbar-inner left inset is ${m[1]}px, needs >= 112px`);
});

test("no rule hides real horizontal overflow", () => {
  assert.ok(!/^\s*(?:html|body)[^{]*\{[^}]*overflow-x:\s*hidden/ms.test(css),
    "html/body must not set overflow-x:hidden — it paints over layout bugs instead of fixing them");
});

test("no grid track inside a media query is a bare 1fr", () => {
  // A bare 1fr floors at min-content, so a "collapsed" column springs back open
  // around any long unbreakable token and the page scrolls sideways on a phone.
  for (const block of css.match(/@media[^{]*\{[\s\S]*?\n\}/g) || []) {
    const bad = [...block.matchAll(/grid-template-columns:\s*([^;]+);/g)]
      .map((m) => m[1])
      .filter((v) => /(^|\s|\()1fr/.test(v));
    assert.deepEqual(bad, [], `bare 1fr inside a media query: ${bad.join(" | ")}`);
  }
});

test("wide content has somewhere to scroll", () => {
  assert.match(css, /\.scroller\s*\{[^}]*overflow-x:\s*auto/s, ".scroller must scroll its contents");
  for (const [, f] of PAGES) {
    const tables = (html[f].match(/<table/g) || []).length;
    const scrolled = (html[f].match(/<div class="scroller">\s*<table/g) || []).length;
    assert.equal(tables, scrolled, `${f}: ${tables - scrolled} table(s) are not inside a .scroller`);
  }
});

// ============================================================
// The shared kit is numerically correct
// ============================================================

test("the MDCT and its inverse reconstruct the signal (TDAC)", () => {
  const L = 2048, N = 64, x = new Float64Array(L);
  for (let i = 0; i < L; i++) x[i] = Math.sin(i * 0.037) * 0.6 + Math.sin(i * 0.31) * 0.3;
  for (const win of ["sine", "kbd"]) {
    const y = D.mdctRoundTrip(x, N, null, win);
    let err = 0;
    for (let i = 2 * N; i < L - 2 * N; i++) err = Math.max(err, Math.abs(y[i] - x[i]));
    assert.ok(err < 1e-6, `${win} window: overlap-add error ${err}, expected < 1e-6`);
  }
});

test("the MDCT/IMDCT windows satisfy the Princen-Bradley condition", () => {
  for (const win of ["sine", "kbd"]) {
    const w = D.WIN[win](128);
    for (let n = 0; n < 64; n++) {
      const s = w[n] * w[n] + w[n + 64] * w[n + 64];
      assert.ok(Math.abs(s - 1) < 1e-9, `${win}[${n}]^2 + ${win}[${n + 64}]^2 = ${s}, expected 1`);
    }
  }
});

test("the window figures quoted in the study are the ones the code produces", () => {
  // Harris (1978), rounded: these are the numbers the transform chapter tabulates.
  const expect = {
    rect: { enbw: 1.0, side: -13.3 },
    hann: { enbw: 1.5, side: -31.5 },
    hamming: { enbw: 1.36, side: -42.7 },
    blackman: { enbw: 1.73, side: -58.1 },
  };
  for (const [name, want] of Object.entries(expect)) {
    const s = D.windowStats(D.WIN[name](64));
    assert.ok(Math.abs(s.enbw - want.enbw) < 0.02, `${name} ENBW ${s.enbw}, expected ${want.enbw}`);
    assert.ok(Math.abs(s.sidelobeDb - want.side) < 1.0, `${name} sidelobe ${s.sidelobeDb}, expected ${want.side}`);
  }
});

test("the psychoacoustic maps agree with their published values", () => {
  assert.ok(Math.abs(D.ath(1000) - 3.37) < 0.5, `ATH(1 kHz) = ${D.ath(1000)} dB SPL`);
  assert.ok(D.ath(3300) < 0, "the threshold dips below 0 dB SPL around 3-4 kHz");
  assert.ok(D.ath(20) > 60 && D.ath(16000) > 40, "the threshold rises steeply at both ends");
  assert.ok(Math.abs(D.hzToBark(1000) - 8.5) < 0.2, `Bark(1 kHz) = ${D.hzToBark(1000)}`);
  assert.ok(Math.abs(D.barkToHz(D.hzToBarkT(1000)) - 1000) < 5, "the Bark map must round-trip");
  assert.ok(Math.abs(D.erb(1000) - 132.6) < 1, `ERB(1 kHz) = ${D.erb(1000)} Hz, expected 132.6`);
  assert.equal(D.BARK_EDGES.length, 25, "24 critical bands means 25 edges");
  assert.equal(D.BARK_CENTERS.length, 24);
  // Greenwood: the human cochlea spans about 20 Hz to 20.6 kHz over 35 mm.
  assert.ok(Math.abs(D.greenwood(0) - 19.8) < 1, `apex = ${D.greenwood(0)} Hz`);
  assert.ok(Math.abs(D.greenwood(1) - 20673) < 200, `base = ${D.greenwood(1)} Hz`);
  // Schroeder's spreading function peaks at the masker and falls away either side
  assert.ok(Math.abs(D.spreadSchroeder(0)) < 0.05);
  assert.ok(D.spreadSchroeder(3) < -18 && D.spreadSchroeder(-2) < -24);
});

test("the coding primitives are right", () => {
  assert.ok(Math.abs(D.quantSnrDb(16) - 98.08) < 0.01, "6.02N + 1.76 dB");
  const h = D.huffman([{ sym: "a", w: 45 }, { sym: "b", w: 13 }, { sym: "c", w: 12 },
    { sym: "d", w: 16 }, { sym: "e", w: 9 }, { sym: "f", w: 5 }]);
  // The textbook example: entropy 2.22 bits, Huffman 2.24 bits.
  assert.ok(Math.abs(h.entropy - 2.2195) < 0.001, `entropy ${h.entropy}`);
  assert.ok(Math.abs(h.avg - 2.24) < 0.005, `average code length ${h.avg}`);
  assert.ok(h.avg >= h.entropy && h.avg < h.entropy + 1, "Huffman sits between H and H+1");
  const can = D.canonical(h.lengths);
  assert.equal(new Set(Object.values(can)).size, 6, "canonical codes must be distinct");
  // V(N,K), the PVQ codebook size: V(8,4) = 2816 is the worked example in the Opus chapter.
  assert.equal(D.pvqV(8, 4), 2816);
  assert.equal(D.pvqV(1, 5), 2);            // +-5
  assert.equal(D.pvqV(4, 0), 1);
  const y = D.pvqSearch([0.8, -0.5, 0.3, 0.1], 6);
  assert.equal(y.reduce((s, v) => s + Math.abs(v), 0), 6, "PVQ output must land on the pyramid");
  // Rice coding of a smooth ramp: the fixed order-2 predictor flattens it.
  const res = D.fixedResidual(new Int32Array([0, 10, 21, 29, 41, 50, 60, 71]), 2);
  const best = D.bestRiceK(res);
  assert.ok(best.bits < D.riceBits(res, 0), "the optimal Rice parameter must beat k = 0");
});

test("the power-law quantiser and its dequantiser are inverses", () => {
  // The standard divides by the step BEFORE raising to 3/4. Getting that order
  // wrong is only wrong by a factor of 2^((210-gain)/12) — exactly 1 at
  // gain = 210, which is why it survived a spot check and had to be caught by
  // sweeping the gain. See the note on quantPow in assets/dsp.js.
  for (const gain of [120, 150, 180, 210, 240, 255]) {
    for (const x of [0.5, 5, 50, 500]) {
      const q = D.quantPow(x, gain, 0);
      if (Math.abs(q) < 8) continue;                // too coarse to say anything
      const back = D.dequantPow(q, gain);
      const rel = Math.abs(back - x) / x;
      assert.ok(rel < 0.05,
        `quantPow/dequantPow are not inverses at gain ${gain}, x = ${x}: got ${back}`);
    }
    assert.equal(D.quantPow(-4, gain, 0) <= 0, true, "the quantiser must keep the sign");
  }
  // A 3/4 power law does NOT hold relative error constant — that is the common
  // misconception chapter 05 corrects. The error must SHRINK as the level rises.
  const err = (x) => {
    const q = D.quantPow(x, 180, 0);
    return Math.abs(D.dequantPow(q, 180) - x) / x;
  };
  assert.ok(err(1) > err(100), "relative error must fall as the level rises");
  // and the step itself is 1.5 dB per unit of global_gain
  const ratio = D.dequantPow(100, 181) / D.dequantPow(100, 180);
  assert.ok(Math.abs(20 * Math.log10(ratio) - 1.505) < 0.01,
    `one step of global_gain should be about 1.5 dB, got ${20 * Math.log10(ratio)}`);
});

test("chapter 10's hand-written Rice codeword table is arithmetically right", () => {
  // This table shipped with four wrong cells and was caught only by rechecking
  // the arithmetic. A Rice codeword for folded value u with parameter k is
  // (u >> k) ones-or-zeros of unary, one terminator, and k raw bits, so it is
  // always (u >> k) + 1 + k bits long. Every cell is checked against that,
  // whether it is spelled as a literal codeword or as a bit count.
  const table = html["10-lossless.html"].match(/<caption>[^<]*Rice codewords[\s\S]*?<\/table>/);
  assert.ok(table, "chapter 10 must still carry the Rice codeword table");
  const ks = [...table[0].matchAll(/<th[^>]*>\s*<i>k<\/i>\s*=\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(ks, [0, 1, 2, 4], `unexpected k columns: ${ks}`);

  const rows = [...table[0].matchAll(/<tr>(?:(?!<\/tr>)[\s\S])*<\/tr>/g)]
    .map((m) => [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]*>/g, "").trim()))
    .filter((cells) => cells.length === 2 + ks.length);
  assert.ok(rows.length >= 6, `only parsed ${rows.length} rows of the Rice table`);

  for (const cells of rows) {
    const u = Number(cells[1]);
    assert.ok(Number.isFinite(u), `unreadable folded value: ${cells[1]}`);
    // the fold itself: e >= 0 -> 2e, e < 0 -> -2e - 1
    const e = Number(cells[0].replace("\u2212", "-"));
    assert.equal(u, e >= 0 ? 2 * e : -2 * e - 1, `zig-zag fold wrong for e = ${e}`);
    ks.forEach((k, i) => {
      const cell = cells[2 + i];
      const want = (u >> k) + 1 + k;
      const asCount = /^(\d+)\s*bits?$/.exec(cell);
      const got = asCount ? Number(asCount[1]) : cell.replace(/[^01]/g, "").length;
      assert.equal(got, want,
        `Rice(u = ${u}, k = ${k}) should be ${want} bits, table says ${cell}`);
    });
  }
});

test("the toy codec is a real rate-controlled coder", () => {
  const sr = 48000;
  const sig = A.src.music(1.2, { sr });
  const an = A.analyze(sig, { sr, N: 512, masking: true });
  let previousSnr = -Infinity;
  for (const kbps of [48, 96, 192, 320]) {
    const r = A.codec(sig, { analysis: an, bitrate: kbps });
    assert.ok(Math.abs(r.kbps - kbps) < 2, `asked for ${kbps} kbit/s, got ${r.kbps}`);
    assert.ok(Array.from(r.out).every(Number.isFinite), `${kbps} kbit/s produced a non-finite sample`);
    assert.ok(r.snrDb > previousSnr, `more bits must not mean less accuracy (${kbps} kbit/s)`);
    previousSnr = r.snrDb;
    assert.ok(r.out.length === sig.length);
  }
  // With the masking model switched off the coder spends its bits evenly: the
  // measured SNR goes UP even though the result sounds worse. That inversion is
  // the whole argument of chapter 05, so it must actually hold.
  const flat = A.analyze(sig, { sr, N: 512, masking: false });
  const withMask = A.codec(sig, { analysis: an, bitrate: 64 }).snrDb;
  const withoutMask = A.codec(sig, { analysis: flat, bitrate: 64 }).snrDb;
  assert.ok(withoutMask > withMask + 4,
    `flat allocation should measure better (${withoutMask} vs ${withMask} dB)`);
});

test("every synthesised source produces finite, audible, bounded audio", () => {
  const sr = 48000;
  for (const name of ["tone", "harmonics", "sweep", "noise", "castanets", "pluck",
    "bell", "music", "vowel", "speech", "applause"]) {
    const x = A.src[name](1.0, { sr });
    assert.ok(x.length === sr, `${name} produced ${x.length} samples, expected ${sr}`);
    assert.ok(Array.from(x).every(Number.isFinite), `${name} produced a non-finite sample`);
    assert.ok(D.peak(x) > 0.05 && D.peak(x) <= 1.0, `${name} peaks at ${D.peak(x)}`);
    assert.ok(D.rms(x) > 0.001, `${name} is effectively silent`);
  }
});

test("dither trades distortion for a noise floor, as the sampling chapter claims", () => {
  const sr = 48000;
  // A tone well below one LSB of a 6-bit quantiser disappears entirely without
  // dither, and survives as a modulated noise floor with it.
  const t = A.src.tone(0.2, { sr, f: 1000, amp: 0.004 });
  assert.ok(D.rms(A.quantize(t, 6, { dither: false })) < 1e-9, "undithered, a sub-LSB tone vanishes");
  assert.ok(D.rms(A.quantize(t, 6, { dither: true })) > 1e-3, "dithered, something survives");
});

test("the ABX harness computes the binomial p-value correctly", () => {
  const a = A.abx(() => [0], () => [0]);
  a.state.trial = 8; a.state.correct = 8;
  assert.ok(Math.abs(a.pValue() - 1 / 256) < 1e-9, "8 of 8 by luck is 1 in 256");
  a.state.trial = 16; a.state.correct = 12;
  assert.ok(Math.abs(a.pValue() - 0.0384) < 0.001, "12 of 16 is p = 0.038");
  a.state.trial = 10; a.state.correct = 5;
  assert.ok(a.pValue() > 0.5, "chance performance is not significant");
});

// ============================================================
// Wiring into the almanac
// ============================================================

test("the document is in the catalogue, on a shelf, with an icon that exists", () => {
  const data = read(join(ROOT, "data.js"));
  const root = read(join(ROOT, "index.html"));
  assert.match(data, new RegExp(`slug: "${SLUG}"`), "data.js has no entry for this document");
  assert.match(data, new RegExp(`url: "https://0x4d44\\.github\\.io/${SLUG}/"`));
  const entry = data.slice(data.indexOf(`slug: "${SLUG}"`), data.indexOf(`slug: "${SLUG}"`) + 900);
  const ill = entry.match(/illustration: "([^"]+)"/);
  assert.ok(ill, "the entry needs an illustration");
  assert.ok(new RegExp(`<symbol id="${ill[1]}"`).test(root), `${ill[1]} is not in the sprite`);
  const collections = data.slice(data.indexOf("window.COLLECTIONS"));
  assert.ok(new RegExp(`"${SLUG}"`).test(collections), "the document is not on any shelf");
  // every tag it claims must be one the filter row actually renders
  const groups = data.slice(data.indexOf("window.TAG_GROUPS"), data.indexOf("window.TAGS"));
  const known = new Set([...groups.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
  const tags = (entry.match(/tags:\s*\[([^\]]*)\]/) || entry.match(/tag:\s*("[^"]+")/) || [])[1] || "";
  for (const t of [...tags.matchAll(/"([^"]+)"/g)].map((m) => m[1])) {
    assert.ok(known.has(t), `tag "${t}" has no chip in TAG_GROUPS`);
  }
});
