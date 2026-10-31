// People art contracts (A4, R3-007 and R3-019).
// The people assets are Draco-packed GLB files made by tools/blender/people_build.py + people_tex.py, which no node test can run (Blender), so the visual proof is the lab
// (labs/a4/people.html, shots.mjs). What these tests pin are the couplings between the two Python files that a later edit could break without anything turning red:
//   - no fringe ends below the painted brows (every fringed head had no brows),
//   - the painted upper lash line sits on the edge of the modelled upper lid (else the eye loses its lashes, or the lid its line),
//   - the glasses rims are upright ovals in front of the eyes (they were horizontal rings: one black bar above the eyes),
//   - the mesh vest and its reflective bands use the torso's own segment count and no forward shift (they tore into grey blocks from behind).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../tools/blender/${f}`, import.meta.url), 'utf8');
const BUILD = read('people_build.py'), TEX = read('people_tex.py');
const grab = (re, src, what) => { const m = re.exec(src); assert.ok(m, `${what}: the pattern ${re} is not in the source any more (the test needs a look)`); return m; };
const num = (re, src, what) => Number(grab(re, src, what)[1]);

test('R3-007: no fringe ends below the painted brows', () => {
  const FRINGE = num(/^FRINGE = ([0-9.]+)/m, BUILD, 'FRINGE'), SHORT = num(/^FRINGE_SHORT = ([0-9.]+)/m, BUILD, 'FRINGE_SHORT');
  // the highest the painted brow reaches on the face tile (v, 0 = chin): the eye row + the brow offset + half of the thickest band + the arch
  const eyeV = num(/eye_v = ([0-9.]+)/, TEX, 'eye_v');
  const off = grab(/by = V\(eye_v \+ \(([0-9.]+) if not fem else ([0-9.]+)\)\)/, TEX, 'the brow offsets');
  const th = grab(/thick = ([0-9.]+) \* S \* \(([0-9.]+) if fem else 1\.0\)/, TEX, 'the brow thickness');
  const arch = num(/\* ([0-9.]+) \* S \+ 0\.010 \* S \* t\)/, TEX, 'the brow arch');
  const top = Math.max(eyeV + Number(off[1]) + Number(th[1]) / 2 + arch, eyeV + Number(off[2]) + Number(th[1]) * Number(th[2]) / 2 + arch);
  assert.ok(top > 0.6 && top < 0.7, `the brow top is ${top}: the face tile geometry changed, re-derive this test`);
  const calls = [...BUILD.matchAll(/cards_ring\(\[fr \+ math\.radians\(d\) for d in range\([^)]*\)\], ([0-9.]+), ([^,]+), [0-9.]+, [0-9.]+, \d+, [0-9.]+, \d+, [0-9.]+, ([0-9.]+)(?:, \d+)?\)/g)];
  assert.ok(calls.length >= 9, `9 front fringes (short, bob, long, pony, bun, sidepart x2, topknot, braid, pigtails): found ${calls.length}`);
  for (const [line, , expr, lenvar] of calls) {
    const f1 = new Function('FRINGE', 'FRINGE_SHORT', `return (${expr});`)(FRINGE, SHORT);
    const lowest = f1 * (1 - Number(lenvar));
    assert.ok(lowest >= top + 0.01, `a fringe ends at ${f1} (lowest tooth ${lowest.toFixed(3)}) but the brows reach ${top.toFixed(3)}: ${line.slice(0, 90)}`);
  }
});

test('R3-007: the painted upper lash line sits on the edge of the modelled upper lid', () => {
  const cosEdge = num(/math\.acos\(([0-9.]+)\), 14, 3, fab_='face'\)\s*# upper lid/, BUILD, 'the upper lid edge');
  const er = num(/\ber = ([0-9.]+) \* hh/, BUILD, 'the eyeball radius'), shell = num(/zone\(pb, ec, er \* ([0-9.]+), 'head', 0\.06, math\.acos/, BUILD, 'the lid shell');
  const eyeZ = num(/eye_z = P\['chin'\] \+ hh \* ([0-9.]+)/, BUILD, 'the eye height'), eyeV = num(/eye_v = ([0-9.]+)/, TEX, 'eye_v');
  const up = num(/cyu = V\(eye_v \+ ([0-9.]+)\)/, TEX, 'LID_UP'), half = num(/cyu - 0\.011 \* S, cx \+ 0\.070 \* S, cyu \+ ([0-9.]+) \* S/, TEX, 'the lash arc');
  assert.equal(eyeZ, eyeV, 'the eyes are modelled at the height the face tile paints them');
  const edge = shell * er * cosEdge, line = up + half;          // both as a fraction of the head height above the eye row
  assert.ok(Math.abs(edge - line) <= 0.003, `the lid edge is ${edge.toFixed(4)} above the eye row, the painted lash line ${line.toFixed(4)}`);
  assert.ok(cosEdge >= 0.3, `the upper lid edge at ${cosEdge} of the ball's radius hides the iris (half-asleep faces); a relaxed open eye is 0.3 to 0.45`);
});

test('R3-007: the glasses rims are upright ovals in front of the eyes, not horizontal rings', () => {
  const rim = grab(/rim_o = \[\(ex_g \+ ([0-9.]+) \* hh \* math\.cos\(a_\), yg_, eye_z \+ ([0-9.]+) \* hh \* math\.sin\(a_\)\) for a_ in angs_g\]/, BUILD, 'the outer rim');
  assert.ok(Number(rim[1]) >= 0.05 && Number(rim[2]) >= 0.05, `a rim of ${rim[1]} x ${rim[2]} of the head height is too small to read`);
  grab(/rim_i = \[\(ex_g \+ \(([0-9.]+) \* hh - 0\.0028\) \* math\.cos\(a_\), yg_, eye_z \+ \(([0-9.]+) \* hh - 0\.0028\) \* math\.sin\(a_\)\) for a_ in angs_g\]/, BUILD, 'the inner rim (the frame has a width)');
});

test('R3-019: the mesh vest and its bands use the torso segments and no forward shift', () => {
  const torso = num(/rs\.append\(ring\(0, cy \+ lean\(z\) \+ y_off, z, rx \* scale \+ extra_rx, ry \* scale \+ extra_rx \* 0\.8, (\d+)\)\)/, BUILD, 'the torso rings');
  const vest = grab(/ring\(0, rows\[i\]\[3\] \+ lean\(rows\[i\]\[0\]\), rows\[i\]\[0\], rows\[i\]\[1\] \* ([0-9.]+), rows\[i\]\[2\] \* ([0-9.]+), (\d+)\) for i in range\(3, 13\)/, BUILD, 'the vest rings');
  const band = grab(/ring\(0, rows\[i\]\[3\] \+ lean\(rows\[i\]\[0\]\), rows\[i\]\[0\], rows\[i\]\[1\] \* ([0-9.]+), rows\[i\]\[2\] \* ([0-9.]+), (\d+)\) for i in \(zi, zi \+ 1\)/, BUILD, 'the band rings');
  assert.equal(Number(vest[3]), torso, 'the vest has as many sides as the torso, so their vertices meet at the back');
  assert.equal(Number(band[3]), torso, 'the bands have as many sides as the torso');
  assert.ok(Number(band[1]) > Number(vest[1]) && Number(band[2]) > Number(vest[2]), 'the bands stand outside the vest');
  assert.ok(Number(vest[1]) > 1.04 && Number(vest[2]) > 1.04, 'the vest stands clear of the shirt layer (1.012 to 1.03)');
});
