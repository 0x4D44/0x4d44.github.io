// The lit windows of round seven (night lighting): web/src/materials.ts `WIN_NIGHT_GLSL` (run here by tests/glsl.ts, not read), the materials that carry it (the city's facades, the window decals, the Midland Grand's
// pane, the Scottish city's walls) and the numbers they are lit by. By day nothing glows; after dark each window is lit or dark for good, by a number of its own, so nothing flickers.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CITY_PAINTERS, CITY_TEXTURES, cityMaterial, DECAL_GLASS, FACADE_GLASS, litPane, litWalls, material, PAINTERS, PANE_UV, paneUv, TEXTURES, WALL_CELL, WALL_RECT, windowNight } from '../src/materials.ts';
import type { CityMaterialName } from '../src/materials.ts';
import { Glsl } from './glsl.ts';
import type { Env, Value } from './glsl.ts';

const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const lambertShader = () => ({ uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader });
const compile = (m: THREE.Material) => {
  const s = lambertShader();
  m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return s;
};
/** The numbers of a `vec4( a, b, c, d )` define, as the materials write them. */
const numbers = (define: string | undefined): number[] => {
  const m = /^vec\d\( ([^)]*) \)$/.exec(define ?? '');
  assert.ok(m, `a vector literal: ${define}`);
  return (m[1] as string).split(', ').map(Number);
};

// The night's GLSL as the shaders carry it: from its first function to the next include, in the shader of any lit facade.
const block = ((): string => {
  const f = compile(cityMaterial('stock')).fragmentShader;
  const a = f.indexOf('float winHash(');
  assert.ok(a > 0, 'the night functions are in the shader');
  return f.slice(a, f.indexOf('#include', a));
})();
const glsl = new Glsl(block);
const env: Env = { vars: {} };
const call = (name: string, ...args: Value[]): number[] => {
  const v = glsl.call(name, args, env);
  return (Array.isArray(v) ? v : [v as number]) as number[];
};

const defineOf = (m: THREE.Material, name: string): string | undefined => (m.defines as Record<string, string> | undefined)?.[name];
const HOUSE = numbers(defineOf(cityMaterial('stock'), 'WIN_MODE'));
const CURTAIN = numbers(defineOf(cityMaterial('glass'), 'WIN_MODE'));
const SHOP = numbers(defineOf(cityMaterial('shop'), 'WIN_MODE'));
const STOCK_RECT = [...FACADE_GLASS.stock];
/** One window of a facade lit by `winTile`: its cell, where in the cell, the pixel's span in cells (small: the window's own light; large: the far mean), the building's seed, the night's level. */
const tile = (cell: [number, number], o: { f?: [number, number]; w?: number; seed?: number; night?: number; rect?: number[]; mode?: number[]; glass?: number } = {}): number[] =>
  call('winTile', [cell[0] + (o.f?.[0] ?? 0.5), cell[1] + (o.f?.[1] ?? 0.5)], [o.w ?? 0.001, o.w ?? 0.001], o.seed ?? 0.37, o.night ?? 1, o.rect ?? STOCK_RECT, o.mode ?? HOUSE, o.glass ?? 1);
const level = (c: number[]): number => Math.max(...c);
/** The glow of a block of a building's wall, `cols` by `rows` windows. */
const wall = (seed: number, mode: number[], cols = 50, rows = 60, night = 1): number[][][] => Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => tile([c, r], { seed, mode, night })));
/** The seed whose share of lit windows is `f` of the way from the fewest to the most (`fract( seed * 3.71 + 0.29 )`). */
const seedFor = (f: number): number => (f - 0.29 + 1) / 3.71;

test('the night\'s uniform is one shared object, 0 by day, and every lit material reads it; nothing in the shader reads a clock', () => {
  assert.deepEqual(windowNight, { value: 0 }, 'dark until atmosphere.ts sets it');
  const lit: [string, THREE.Material][] = [
    ...(['stock', 'red', 'stone', 'panel', 'glass', 'shop'] as const).map((k): [string, THREE.Material] => [k, cityMaterial(k)]),
    ...(['sash', 'sashArch', 'window', 'windowArch'] as const).map((k): [string, THREE.Material] => [k, material(k)]),
    ['pane', litPane(new THREE.MeshLambertMaterial())],
    ['walls', (() => { const m = new THREE.MeshLambertMaterial(); litWalls(m, [1.2, 0.6]); return m; })()],
  ];
  for (const [name, m] of lit) {
    const s = compile(m);
    assert.equal(s.uniforms.uWinNight, windowNight, `${name}: the uniform IS the shared object, so setting windowNight.value reaches the shader`);
    assert.ok(s.fragmentShader.includes('uniform float uWinNight;'), `${name}: declared`);
    assert.equal(s.fragmentShader.split('uniform float uWinNight;').length, 2, `${name}: declared once`);
    assert.ok(s.fragmentShader.includes('if ( uWinNight > 0.003 )') || s.fragmentShader.includes('uWinNight > 0.003 )'), `${name}: by day (under a few thousandths) the glow is not computed at all`);
    assert.ok(!/\b(uTime|uClock|time|iTime)\b/.test(s.fragmentShader), `${name}: no clock in the shader, so no window can flicker`);
    assert.ok(s.fragmentShader.indexOf('totalEmissiveRadiance +=') > 0, `${name}: the light is an emissive term, no lamp in the scene`);
  }
});

test('each kind of facade is lit as its own sort of wall: the panes the painters draw, a house\'s windows mostly warm, a tower\'s by floors with some empty, a shop\'s the open ones', () => {
  const texel = (m: THREE.Material): Record<string, string> => ((m as THREE.MeshLambertMaterial).defines ?? {}) as Record<string, string>;
  for (const key of ['stock', 'red', 'stone', 'panel', 'glass', 'shop'] as const) {
    const d = texel(cityMaterial(key));
    FACADE_GLASS[key].forEach((n, i) => close(numbers(d.WIN_RECT)[i] as number, n, 1e-6, `${key}: its glass`));
    assert.equal(d.WIN_GAIN, key === 'shop' ? '0.45' : key === 'glass' ? '0.35' : '0.8', `${key}: how bright`);
    assert.deepEqual(numbers(d.WIN_MODE), key === 'glass' ? [0.4, 0.4, 0.4, 0.5] : key === 'shop' ? [0.3, 0.35, 0, 0.15] : [0.14, 0.5, 0.12, 0.18], `${key}: how lit`);
  }
  for (const key of ['sash', 'sashArch', 'window', 'windowArch'] as const) {
    const d = texel(material(key));
    DECAL_GLASS.forEach((n, i) => close(numbers(d.WIN_RECT)[i] as number, n, 1e-6, `${key}: its glass`));
    assert.equal(d.WIN_GAIN, '0.8');
    assert.equal(d.WIN_MODE, undefined, 'a decal is lit by its own numbers, not a building\'s');
  }
  // the program keys: a lit facade, a curtain wall, a decal and the Midland's pane are four programs, and the plain walls are none of them
  assert.deepEqual(['stock', 'glass', 'shop'].map((k) => cityMaterial(k as CityMaterialName).customProgramCacheKey()), ['glassVaries-tile', 'glassVaries-curtain', 'glassVaries-tile']);
  assert.equal(material('sash').customProgramCacheKey(), 'glassVaries-quad');
  assert.equal(litPane(new THREE.MeshLambertMaterial()).customProgramCacheKey(), 'litPane');
});

test('winHash: a number of 0 to 1 from a cell, a seed and a salt, repeatable and spread evenly, with a stream of its own for each salt', () => {
  const h = (x: number, y: number, seed: number, salt: number): number => call('winHash', [x, y], seed, salt)[0] as number;
  const values: number[] = [];
  for (let x = 0; x < 60; x++) for (let y = 0; y < 60; y++) values.push(h(x, y, 0.37, 1));
  assert.ok(values.every((v) => v >= 0 && v < 1));
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  close(mean, 0.5, 0.03, 'the mean');
  close(sd, Math.sqrt(1 / 12), 0.03, 'the spread of an even stream');
  assert.equal(h(3, 4, 0.37, 1), h(3, 4, 0.37, 1), 'repeatable');
  assert.notEqual(h(3, 4, 0.37, 1), h(3, 4, 0.37, 2), 'a salt of its own');
  assert.notEqual(h(3, 4, 0.37, 1), h(3, 4, 0.9, 1), 'and a seed');
  let alike = 0;
  for (let x = 1; x < 60; x++) if (Math.abs(h(x, 7, 0.37, 1) - h(x - 1, 7, 0.37, 1)) < 0.05) alike++;
  assert.ok(alike < 12, `neighbours differ: ${alike} of 59 within 0.05`);
});

test('by day no window is lit: a window at night 0 is dark whatever its cell, building or distance (round seven: no glow by day)', () => {
  for (const seed of [0.11, 0.37, 0.83]) for (const w of [0.001, 0.05, 0.4, 0.9]) for (const mode of [HOUSE, CURTAIN, SHOP]) for (let c = 0; c < 12; c++) for (let r = 0; r < 12; r++) {
    assert.deepEqual(tile([c, r], { seed, w, mode, night: 0 }), [0, 0, 0], `seed ${seed}, span ${w}, cell ${c},${r}`);
  }
  // a trace of dusk lights none: the first window comes on at 0.04 (windowNight's own cut-off at the shader is 0.003)
  for (let c = 0; c < 30; c++) for (let r = 0; r < 30; r++) assert.deepEqual(tile([c, r], { night: 0.03 }), [0, 0, 0], 'the dusk has not begun');
});

test('a building has its own share of its windows lit, 14 to 64 in a hundred in a house, the same share all the way round it, and no two buildings alike', () => {
  const lit = (grid: number[][][]): { share: number; dark: number } => {
    const rows = grid.map((row) => row.filter((c) => level(c) > 0.01).length);
    const live = rows.filter((n) => n > 0);
    return { share: live.reduce((s, n) => s + n, 0) / (live.length * grid[0]!.length), dark: 1 - live.length / rows.length };
  };
  const shares: number[] = [];
  for (const f of [0.01, 0.25, 0.5, 0.75, 0.99]) {
    const { share } = lit(wall(seedFor(f), HOUSE));
    const want = (HOUSE[0] as number) + (HOUSE[1] as number) * f;
    close(share, want, 0.05, `a house at ${f} of the way from the fewest lit to the most`);
    shares.push(share);
  }
  assert.ok(shares[0]! < 0.2 && shares[4]! > 0.58, `from a few lit to most: ${shares}`);
  assert.ok(shares.every((s, i) => i === 0 || s > shares[i - 1]!), 'rising with the building\'s own number');
  // a tower's offices: more of them lit, 40 to 80 in a hundred; the open shops 30 to 65
  close(lit(wall(seedFor(0.01), CURTAIN)).share, 0.4, 0.06, 'a tower\'s least');
  close(lit(wall(seedFor(0.99), CURTAIN)).share, 0.8, 0.06, 'and most');
  close(lit(wall(seedFor(0.01), SHOP)).share, 0.3, 0.06, 'the shops\' least');
  // two buildings are two patterns: a good part of the cells differ
  const a = wall(0.37, HOUSE, 30, 30), b = wall(0.4, HOUSE, 30, 30);
  let differ = 0;
  a.forEach((row, r) => row.forEach((c, i) => { if ((level(c) > 0.01) !== (level(b[r]![i] as number[]) > 0.01)) differ++; }));
  assert.ok(differ > 150, `${differ} of 900 windows differ between two buildings`);
});

test('some floors are dark the whole way round a building (a house 12 in a hundred, a tower 40, a shop none), each floor by its own number', () => {
  const darkFloors = (mode: number[], seeds: number[]): number => {
    let dark = 0, total = 0;
    for (const seed of seeds) for (const row of wall(seed, mode, 60, 40)) { total++; if (row.every((c) => level(c) <= 0.01)) dark++; }
    return dark / total;
  };
  const seeds = [0.11, 0.37, 0.55, 0.83, 1.4, 2.2];
  close(darkFloors(HOUSE, seeds), HOUSE[2] as number, 0.06, 'a house');
  close(darkFloors(CURTAIN, seeds), CURTAIN[2] as number, 0.1, 'a tower');
  assert.equal(darkFloors(SHOP, seeds), 0, 'a row of shops has no dark floor (a window of it is dark by its own luck)');
  // a floor's number does not depend on the column: the whole row is dark or none of it is wholly
  const grid = wall(0.37, HOUSE, 80, 40);
  grid.forEach((row, r) => {
    const n = row.filter((c) => level(c) > 0.01).length;
    assert.ok(n === 0 || n >= 5, `floor ${r}: ${n} lit of 80 (a floor is dark or has its share)`);
  });
});

test('the lit windows are warm and a few cool, each its own brightness: the share of cool white is the mode\'s (18 in a hundred in a house, half in a tower)', () => {
  const stats = (mode: number[], seed: number): { cool: number; lo: number; hi: number; sd: number } => {
    const on = wall(seed, mode, 60, 60).flat().filter((c) => level(c) > 0.01);
    const cool = on.filter((c) => (c[2] as number) > (c[0] as number)).length / on.length;
    const levels = on.map(level);
    const mean = levels.reduce((s, v) => s + v, 0) / levels.length;
    return { cool, lo: Math.min(...levels), hi: Math.max(...levels), sd: Math.sqrt(levels.reduce((s, v) => s + (v - mean) ** 2, 0) / levels.length) };
  };
  for (const [name, mode] of [['house', HOUSE], ['tower', CURTAIN], ['shop', SHOP]] as const) {
    const s = stats(mode, 0.7);
    close(s.cool, mode[3] as number, 0.06, `${name}: the share of cool white`);
    assert.ok(s.lo > 0.3 && s.hi <= 1 + 1e-9, `${name}: bright, not blinding: ${s.lo} to ${s.hi}`);
    assert.ok(s.sd > 0.07, `${name}: each window its own brightness, sd ${s.sd}`);
  }
  // a warm window is red over green over blue, a cool one is blue over green over red, and the warm tones run from orange to a pale tungsten
  const on = wall(0.7, HOUSE, 60, 60).flat().filter((c) => level(c) > 0.01);
  for (const c of on) {
    if (c[2]! > c[0]!) assert.ok(c[2]! > c[1]! && c[1]! > c[0]!, `a cool window: ${c}`);
    else assert.ok(c[0]! >= c[1]! && c[1]! > c[2]!, `a warm window: ${c}`);
  }
  assert.ok(on.some((c) => c[1]! / c[0]! < 0.65) && on.some((c) => c[1]! / c[0]! > 0.78 && c[0]! >= c[2]!), 'some orange, some pale');
});

test('the windows come on one by one through the dusk, each at its own hour, and never go off again: the level only ever adds light, and by full night every lit window is on', () => {
  const cells: [number, number][] = [];
  for (let c = 0; c < 40; c++) for (let r = 0; r < 20; r++) cells.push([c, r]);
  const levels = Array.from({ length: 21 }, (_, i) => i / 20);
  const at = (n: number): number[] => cells.map((cell) => level(tile(cell, { night: n, seed: 0.7 })));
  const grid = levels.map(at);
  grid.forEach((row, k) => { if (k > 0) row.forEach((v, i) => assert.ok(v >= (grid[k - 1]![i] as number) - 1e-12, `cell ${cells[i]} is dimmer at ${levels[k]} than at ${levels[k - 1]}`)); });
  const count = (row: number[]): number => row.filter((v) => v > 0.01).length;
  assert.equal(count(grid[0] as number[]), 0, 'none at the start');
  assert.equal(count(grid[1] as number[]), 0, 'none at 0.05, before the first window\'s hour');
  const counts = grid.map(count);
  assert.ok(counts[10]! > 0 && counts[10]! < counts[20]! * 0.9, `half way through the dusk some are on and some not: ${counts[10]} of ${counts[20]}`);
  assert.ok(counts[5]! > 0 && counts[10]! > counts[5]!, `more as it gets darker: ${counts[5]} at 0.25, ${counts[10]} at 0.5`);
  assert.equal(counts[18], counts[20], 'every lit window is on by 0.9 of the night');
  // each window's onset is a ramp of its own: some windows are fully on while others are still dark, at the same moment
  const mid = grid[8] as number[], full = grid[20] as number[];
  assert.ok(mid.some((v, i) => v > 0.01 && v < 0.9 * (full[i] as number)), 'some are part way up');
  assert.ok(mid.some((v, i) => (full[i] as number) > 0.01 && v < 0.01), 'while others have not started');
});

test('only the glass is lit: inside the pane the window glows, outside it (the stone, the sash bars, the wall) nothing does, the pane\'s room is darker at its sill, and a pixel over the bars is a third of the light', () => {
  // a lit window: scan for one
  let lit: [number, number] | null = null;
  for (let c = 0; c < 40 && !lit; c++) if (level(tile([c, 3])) > 0.2) lit = [c, 3];
  assert.ok(lit, 'a lit window to measure');
  const [x0, x1, y0, y1] = STOCK_RECT as [number, number, number, number];
  const full = tile(lit as [number, number]);
  assert.ok(level(full) > 0.2);
  for (const f of [[x0 - 0.05, 0.5], [x1 + 0.05, 0.5], [0.5, y0 - 0.05], [0.5, y1 + 0.03], [0.02, 0.02], [0.98, 0.98]] as [number, number][]) {
    assert.deepEqual(tile(lit as [number, number], { f }), [0, 0, 0], `outside the pane at ${f}: the wall is dark`);
  }
  const inside = [[x0 + 0.05, y0 + 0.05], [x1 - 0.05, y1 - 0.05], [0.5, 0.5]] as [number, number][];
  for (const f of inside) assert.ok(level(tile(lit as [number, number], { f })) > 0.15, `inside the pane at ${f}`);
  // the edge of the pane is a pixel wide: half lit on the line
  const edge = level(tile(lit as [number, number], { f: [x0, 0.5], w: 0.01 }));
  assert.ok(edge > 0 && edge < level(tile(lit as [number, number], { f: [0.5, 0.5], w: 0.01 })), `a soft edge: ${edge}`);
  // the room is dimmer at the sill than at the head (a room is lit from above): 0.72 of it at the foot of the glass
  const sill = level(tile(lit as [number, number], { f: [0.5, y0 + 0.01] })), head = level(tile(lit as [number, number], { f: [0.5, y1 - 0.01] }));
  assert.ok(sill < head && sill / head > 0.65 && sill / head < 0.85, `the room is brighter toward the head: ${sill} to ${head}`);
  // over the bars (the texture is not glass there: the glass share is 0) a near pixel takes 0.3 of the light; a far one the same as ever
  for (const f of [[0.5, 0.5], [x0 + 0.05, y0 + 0.05]] as [number, number][]) {
    const glass = tile(lit as [number, number], { f, glass: 1 }), bar = tile(lit as [number, number], { f, glass: 0 });
    glass.forEach((v, i) => close(bar[i] as number, 0.3 * v, 1e-12, 'a third of the light over the bars'));
  }
  const farGlass = tile(lit as [number, number], { w: 0.9, glass: 1 }), farBar = tile(lit as [number, number], { w: 0.9, glass: 0 });
  assert.deepEqual(farBar, farGlass, 'from far the texture is washed out and the bars make no difference');
  // a pane that is a different rectangle is lit as that: the tower's glass is almost the whole tile, so the edge of the stock facade's pane is inside it
  const tower = [...FACADE_GLASS.glass];
  assert.deepEqual(tile(lit as [number, number], { f: [x0 - 0.05, 0.5] }), [0, 0, 0]);
  assert.ok(level(tile(lit as [number, number], { f: [x0 - 0.05, 0.5], rect: tower })) > 0, 'where a curtain wall\'s glass runs on');
});

test('from far, a window\'s light is the mean of its building\'s: one steady glow for a whole block and no shimmer, rising with the night and the share lit', () => {
  const mean = (seed: number, night: number, mode = HOUSE, rect = STOCK_RECT): number[] => call('winMean', night, (HOUSE[0] as number) + (HOUSE[1] as number) * ((seed * 3.71 + 0.29) % 1), mode[2] as number, mode[3] as number).map((v) => v * ((rect[1]! - rect[0]!) * (rect[3]! - rect[2]!) * 0.86));
  for (const seed of [0.11, 0.37, 0.83]) {
    const want = mean(seed, 1);
    for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) {
      const far = tile([c, r], { w: 0.7, seed });
      far.forEach((v, i) => close(v, want[i] as number, 1e-9, `seed ${seed}, cell ${c},${r}: every window of a distant building is the same glow`));
    }
  }
  // the mean takes no light until the dusk is well on, then rises with the night, and a building with more lit windows is brighter
  const m = (night: number, share: number): number[] => call('winMean', night, share, 0.1, 0.2);
  assert.deepEqual(m(0, 0.5), [0, 0, 0]);
  assert.deepEqual(m(0.15, 0.5), [0, 0, 0], 'none before 0.15');
  assert.ok(level(m(0.5, 0.5)) > 0 && level(m(0.5, 0.5)) < level(m(1, 0.5)), 'rising');
  assert.ok(level(m(1, 0.6)) > level(m(1, 0.2)), 'and with the share lit');
  assert.ok(level(m(1, 0.5)) < 0.5, 'a faint glow, not a lit sheet');
  // in between, near to far, the light moves smoothly from the window's own to the mean: no step at any span
  let last = level(tile([2, 2], { w: 0.001 }));
  for (const w of [0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8]) {
    const v = level(tile([2, 2], { w }));
    assert.ok(Math.abs(v - last) < 0.7, `no jump at span ${w}: ${last} to ${v}`);
    last = v;
  }
});

test('a decal window (a sash drawn once over a quad) is lit from four smooth numbers of its corner: its share lit is its area\'s, a blind brightens it, and the arcsine of a sine is made even', () => {
  const decal = (g: number[], night: number, blind = 0, f: [number, number] = [0.5, 0.5], w = 0.001): number[] => call('winDecal', f, [w, w], g, night, [...DECAL_GLASS], 1, blind);
  // winUni turns the arcsine of a sine back into an even spread
  const uni = (a: number): number => call('winUni', a)[0] as number;
  close(uni(0), 0, 1e-9);
  close(uni(1), 1, 1e-5);
  close(uni(0.5), 0.5, 1e-4, 'the middle of the range maps to itself');
  let n = 0, onShare = 0;
  const t0 = 0.0123;
  for (let i = 0; i < 2000; i++) {
    const g = 0.5 + 0.5 * Math.sin(t0 + i * 0.6283 * 1.0731);
    n++;
    if (level(decal([g, 0.5, 0.5, 0.5], 1)) > 0.01) onShare++;
  }
  close(onShare / n, 0.5, 0.06, 'half of the windows of a building with an area number of 0.5 are lit');
  let low = 0, high = 0;
  for (let i = 0; i < 2000; i++) {
    const g = 0.5 + 0.5 * Math.sin(t0 + i * 0.6283 * 1.0731);
    if (level(decal([g, 0.5, 0.5, 0.0], 1)) > 0.01) low++;
    if (level(decal([g, 0.5, 0.5, 1.0], 1)) > 0.01) high++;
  }
  close(low / 2000, 0.3, 0.06, 'a quiet area lights 0.3');
  close(high / 2000, 0.7, 0.06, 'and a busy one 0.7');
  assert.deepEqual(decal([0.5, 0.5, 0.5, 0.5], 0), [0, 0, 0], 'none by day');
  // a blind is a lit window with a net or a blind drawn: brighter (1 against 0.55)
  const bare = level(decal([0, 0.5, 0.5, 0.5], 1, 0)), blinded = level(decal([0, 0.5, 0.5, 0.5], 1, 1));
  close(bare / blinded, 0.55, 1e-9, 'the room without a blind');
  // only the glass
  assert.deepEqual(decal([0, 0.5, 0.5, 0.5], 1, 0, [DECAL_GLASS[0] - 0.05, 0.5]), [0, 0, 0], 'the surround is stone');
});

test('the Midland Grand\'s lit pane: a window\'s number is floor( u ), the same all over its glass, about three in ten are lit, and the windows of a pane differ from one another', () => {
  const lit = (u: number, v: number, night = 1, share: number = PANE_UV.share, w = 0.001): number[] => call('winPaneLit', [u, v], [w, w], night, share);
  let on = 0;
  const ids = PANE_UV.numbers;
  const seen = new Set<string>();
  for (let id = 0; id < ids; id++) {
    const [u0, v0] = paneUv(id, 0.5, 0.5);
    const centre = lit(u0, v0);
    if (level(centre) > 0.01) on++;
    seen.add(centre.map((n) => n.toFixed(3)).join());
    // the number is floor( u ): the same window all across the glass, to its very edges, and nothing of it changes with u
    for (const across of [0, 0.25, 0.75, 1]) {
      const [u, v] = paneUv(id, across, 0.5);
      assert.deepEqual(lit(u, v), centre, `window ${id}: its light at ${across} of the way across the glass`);
    }
  }
  close(on / ids, PANE_UV.share, 0.04, 'the share of the pane\'s windows that are lit');
  assert.ok(seen.size > 300, `${seen.size} different lights across the windows`);
  assert.deepEqual(lit(...paneUv(5, 0.5, 0.5), 0), [0, 0, 0], 'none by day');
  // a window whose number says dark is dark at every height; the room is brighter at the head (v of -2) than at the sill (v of -1)
  let lamp = -1;
  for (let id = 0; id < ids && lamp < 0; id++) if (level(lit(...paneUv(id, 0.5, 0.5))) > 0.3) lamp = id;
  const sill = level(lit(...paneUv(lamp, 0.5, 0))), head = level(lit(...paneUv(lamp, 0.5, 1)));
  assert.ok(head > sill && sill / head > 0.7 && sill / head < 0.74, `the room's gradient: ${sill} to ${head}`);
  // a share of one lights them all, of zero none (the share is the one thing the material gives it)
  assert.ok(level(lit(...paneUv(7, 0.5, 0.5), 1, 1)) > 0.01 && level(lit(...paneUv(9, 0.5, 0.5), 1, 1)) > 0.01);
  assert.deepEqual(lit(...paneUv(7, 0.5, 0.5), 1, 0), [0, 0, 0]);
});

test('paneUv: a window\'s number and its way across the glass in u, minus one minus its way up in v; a number is the whole part of u all across the glass, to the last pixel', () => {
  for (const id of [0, 1, 777, PANE_UV.numbers - 1]) {
    for (const across of [0, 0.001, 0.5, 0.999, 1]) {
      for (const up of [0, 0.5, 1]) {
        const [u, v] = paneUv(id, across, up);
        assert.equal(Math.floor(u), id, `${id} at ${across}`);
        close(u - id, PANE_UV.margin + (1 - 2 * PANE_UV.margin) * across, 1e-12);
        assert.equal(v, -1 - up);
        assert.ok(v <= -1 && v >= -2, 'a window is a v under zero: nothing else the pane\'s material wears has one');
      }
    }
  }
  assert.ok(PANE_UV.margin > 0 && PANE_UV.margin < 0.5 && PANE_UV.numbers >= 1024 && PANE_UV.share > 0 && PANE_UV.share < 1);
  assert.ok(PANE_UV.numbers * 2 < 16_000_000, 'a whole number in u, exact in a 24-bit mantissa, with the margin and the pixel to spare');
});

test('litPane: only a window (v under zero) is lit, the rest of the material is as it was; it reads the window number from the pane\'s own UVs and takes the share from the material', () => {
  const m = litPane(new THREE.MeshLambertMaterial());
  const s = compile(m);
  assert.ok(s.vertexShader.includes('varying vec2 vWinUv;') && s.vertexShader.includes('vWinUv = uv;'), 'the vertex shader hands the UV on');
  assert.ok(s.fragmentShader.includes('if ( vWinUv.y < -0.5 && uWinNight > 0.003 )'), 'only where v is under zero, and only at night');
  assert.ok(s.fragmentShader.includes(`winPaneLit( vWinUv, wSpan, uWinNight, ${PANE_UV.share.toFixed(1)} )`), 'with the share the pane\'s windows are lit by');
  assert.ok(s.fragmentShader.indexOf('#include <map_fragment>') < s.fragmentShader.indexOf('totalEmissiveRadiance += WIN_GAIN'), 'after the map, so the emissive term is the last word');
  assert.equal((m.defines as Record<string, string>).WIN_GAIN, '0.8');
  assert.equal(m.customProgramCacheKey(), 'litPane');
  // the pixel's span is the number's own units: u is spread over 0.8 of a window's number, so a window is 0.8 wide in u
  assert.ok(s.fragmentShader.includes('vWinUv.x / 0.8'), 'the span of a pane, in windows');
});

test('FACADE_GLASS is the glass the painters draw (the lit windows fill it), tile by tile; the red facade\'s is to half way up its arch', () => {
  const record = (draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): { op: string; args: unknown[]; style: unknown }[] => {
    const calls: { op: string; args: unknown[]; style: unknown }[] = [];
    const state: Record<string, unknown> = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1 };
    const g = new Proxy({} as Record<string, unknown>, {
      get(_t, prop: string) {
        if (prop in state) return state[prop];
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ gradient: true, stops: [] as unknown[], addColorStop(o: number, c: string) { this.stops.push([o, c]); } });
        return (...args: unknown[]) => { calls.push({ op: prop, args, style: state.fillStyle }); };
      },
      set(_t, prop: string, v) { state[prop] = v; return true; },
    });
    draw(g as unknown as CanvasRenderingContext2D, w, h);
    return calls;
  };
  const isGradient = (v: unknown): boolean => typeof v === 'object' && v !== null && 'gradient' in v;
  for (const key of ['stock', 'red', 'stone', 'panel', 'glass', 'shop'] as const) {
    const [w, h] = CITY_TEXTURES[key].px;
    const calls = record(CITY_PAINTERS[key], w, h);
    const panes = calls.filter((c) => c.op === 'fillRect' && isGradient(c.style));
    assert.ok(panes.length >= 1, `${key}: a pane of glass`);
    const best = panes.reduce((a, b) => ((a.args[2] as number) * (a.args[3] as number) >= (b.args[2] as number) * (b.args[3] as number) ? a : b));
    const [x, y, rw, rh] = best.args as number[];
    const [left, right, bottom, top] = FACADE_GLASS[key];
    close((x as number) / w, left, 1e-3, `${key}: the pane's left`);
    close(((x as number) + (rw as number)) / w, right, 1e-3, `${key}: its right`);
    close((h - ((y as number) + (rh as number))) / h, bottom, 1e-3, `${key}: its sill`);
    if (key !== 'red') {
      close((h - (y as number)) / h, top, 1e-3, `${key}: its head`);
      continue;
    }
    // the red facade's head is an arch: the glass is clipped to a path (moveTo the foot, lineTo the springing, a curve to the other side)
    const at = calls.findIndex((c, i) => c.op === 'moveTo' && Math.abs((c.args[0] as number) - (x as number)) < 0.5 && calls[i + 2]?.op === 'quadraticCurveTo');
    assert.ok(at >= 0, 'red: the arch the glass is clipped to');
    const springing = (calls[at + 1] as { args: number[] }).args[1] as number;
    const [, control, , end] = (calls[at + 2] as { args: number[] }).args as number[];
    const crown = 0.25 * springing + 0.5 * (control as number) + 0.25 * (end as number);
    close(top, (h - (springing + crown) / 2) / h, 2e-3, 'red: the rectangle runs to half way up the arch');
    assert.ok(top < (h - crown) / h && top > (h - springing) / h, 'between the springing and the crown');
  }
});

test('DECAL_GLASS is the glass a window decal draws, in the quad: the flat one\'s rectangle, the arched one\'s path (round to its top)', () => {
  const record = (draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): { op: string; args: number[] }[] => {
    const calls: { op: string; args: number[] }[] = [];
    const g = new Proxy({} as Record<string, unknown>, {
      get(_t, prop: string) {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
        return (...args: number[]) => { calls.push({ op: prop, args }); };
      },
      set() { return true; },
    });
    draw(g as unknown as CanvasRenderingContext2D, w, h);
    return calls;
  };
  const [w, h] = TEXTURES.window.px;
  const [left, right, bottom, top] = DECAL_GLASS;
  // the sash: surround, reveal, glass (for the fill) and glass (for the clip) are four rects; the glass is the third
  const flat = record(PAINTERS.window, w, h).filter((c) => c.op === 'rect');
  assert.equal(flat.length, 4);
  const [x, y, rw, rh] = (flat[2] as { args: number[] }).args as [number, number, number, number];
  close(x / w, left, 1e-9, 'flat: left');
  close((x + rw) / w, right, 1e-9, 'flat: right');
  close((h - (y + rh)) / h, bottom, 1e-9, 'flat: the foot of the glass is above the sill\'s reveal');
  close((h - y) / h, top, 1e-9, 'flat: the head');
  assert.deepEqual((flat[3] as { args: number[] }).args, [x, y, rw, rh], 'the clip is the same rectangle');
  // the arched one: the glass path is the third moveTo (surround, reveal, glass) and its third arc, whose top is the glass's top
  const arch = record(PAINTERS.windowArch, w, h);
  const move = arch.filter((c) => c.op === 'moveTo')[2] as { args: number[] };
  const arc = arch.filter((c) => c.op === 'arc')[2] as { args: number[] };
  close(move.args[0] as number / w, left, 1e-9, 'arched: left');
  close((h - (move.args[1] as number)) / h, bottom, 1e-9, 'arched: the foot of the glass');
  close((h - ((arc.args[1] as number) - (arc.args[2] as number))) / h, top, 1e-9, 'arched: the crown of the glass');
  close(1 - (arc.args[0] as number - (arc.args[2] as number)) / w, right, 1e-9, 'arched: right');
});

test('litWalls: a plain wall\'s windows are lit from its map\'s UVs and its building\'s vertex colour, only where the face looks sideways, and the function it returns puts the material back as it was', () => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  let priorRan = 0;
  m.onBeforeCompile = () => { priorRan++; };
  const priorKey = m.customProgramCacheKey(); // three's default is the text of the patch itself
  m.defines = { PRIOR: '1' };
  const undo = litWalls(m, [1.2, 0.6]);
  assert.deepEqual(Object.keys(m.defines).sort(), ['PRIOR', 'WALL_TILE', 'WALL_WIN', 'WIN_GAIN', 'WIN_MODE', 'WIN_RECT']);
  assert.deepEqual(numbers(defineOf(m, 'WALL_TILE')), [1.2 / WALL_CELL[0], 0.6 / WALL_CELL[1]], 'the map\'s tile over the window\'s cell');
  assert.deepEqual(numbers(defineOf(m, 'WIN_RECT')), [...WALL_RECT]);
  assert.deepEqual(numbers(defineOf(m, 'WIN_MODE')), HOUSE, 'lit as a house');
  assert.equal(defineOf(m, 'WIN_GAIN'), '0.8');
  assert.equal(m.customProgramCacheKey(), `${priorKey}+litWalls`, 'its own program');
  const s = compile(m);
  assert.equal(priorRan, 1, 'the patch it had runs first');
  assert.equal(s.uniforms.uWinNight, windowNight);
  assert.ok(s.fragmentShader.indexOf('#include <emissivemap_fragment>') < s.fragmentShader.indexOf('totalEmissiveRadiance += ('), 'after the emissive colour is read');
  assert.ok(s.fragmentShader.includes('float winHash(') && s.fragmentShader.split('float winHash(').length === 2, 'the night functions, once');
  // the same material patched twice by another patch that declares the uniform itself (roof shade) is not declared twice: the guard is on the text
  const again = compile(m);
  assert.equal(again.fragmentShader.split('uniform float uWinNight;').length, 2);
  undo();
  assert.deepEqual(m.defines, { PRIOR: '1' }, 'the defines are back');
  assert.equal(m.customProgramCacheKey(), priorKey, 'and the key');
  priorRan = 0;
  const plain = compile(m);
  assert.equal(priorRan, 1, 'and the prior patch alone');
  assert.ok(!plain.fragmentShader.includes('winHash'), 'no trace of the windows');
});

test('litWalls, run: the wall\'s windows are in cells of 3 by 3.3 m, a building\'s own number from its colour, lit only on a side wall and only at night', () => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  litWalls(m, [1.2, 0.6]);
  const f = compile(m).fragmentShader;
  const start = f.indexOf('#if defined( WALL_WIN )');
  const snippet = f.slice(start, f.indexOf('#endif', f.indexOf('#endif', start) + 1) + '#endif'.length);
  // a preprocessor for the lines of the snippet: its defines are the material's, and USE_MAP and USE_COLOR are what the real material would add
  const defines = { ...(m.defines as Record<string, string>), USE_MAP: '', USE_COLOR: '' };
  const keep: boolean[] = [true];
  const body: string[] = [];
  for (const line of snippet.split('\n')) {
    const t = line.trim();
    if (t.startsWith('#if defined(')) keep.push(keep[keep.length - 1]! && [...t.matchAll(/defined\( (\w+) \)/g)].every((x) => (x[1] as string) in defines));
    else if (t.startsWith('#ifdef ')) keep.push(keep[keep.length - 1]! && t.slice(7).trim() in defines);
    else if (t === '#else') keep[keep.length - 1] = keep[keep.length - 2]! && !keep[keep.length - 1]!;
    else if (t === '#endif') keep.pop();
    else if (keep[keep.length - 1]) body.push(line);
  }
  let text = body.join('\n');
  for (const [k, v] of Object.entries(defines)) if (v !== '') text = text.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
  text = text.replace('viewMatrix[ 1 ].xyz', 'uUp').replace('fwidth( wv )', 'uSpan');
  assert.ok(!text.includes('#'), `a snippet with no preprocessor left: ${text}`);
  const run = (over: { night?: number; colour?: number; map?: [number, number]; normal?: number[]; span?: number }): number[] => {
    const vars: Record<string, Value> = { uWinNight: over.night ?? 1, vColor: [over.colour ?? 0.55, 0.5, 0.5], vMapUv: over.map ?? [0.5, 0.5], normal: over.normal ?? [1, 0, 0], uUp: [0, 1, 0], uSpan: [over.span ?? 0.001, over.span ?? 0.001], totalEmissiveRadiance: [0, 0, 0] };
    glsl.run(text, { vars });
    return vars.totalEmissiveRadiance as number[];
  };
  // the cell is metres over 3 x 3.3: the stone tile is 1.2 x 0.6, so a cell is 2.5 x 5.5 tiles
  const cellAt = (cx: number, cy: number): number[] => run({ map: [(cx + 0.5) * WALL_CELL[0] / 1.2, (cy + 0.5) * WALL_CELL[1] / 0.6] });
  let lit = 0;
  const cells: number[][] = [];
  for (let c = 0; c < 20; c++) for (let r = 0; r < 20; r++) { const v = cellAt(c, r); cells.push(v); if (level(v) > 0.01) lit++; }
  assert.ok(lit > 20 && lit < 300, `some windows are lit and some are dark: ${lit} of 400`);
  // the same windows as winTile's own, for the same cell, seed and mode (the seed is the colour's red quantised to a hundredth, then its golden-ratio fraction)
  const seed = (Math.floor(0.55 * 100 + 0.5) * 0.6180339) % 1;
  for (const [c, r] of [[3, 4], [10, 2], [7, 9]] as const) {
    const want = tile([c, r], { seed, rect: [...WALL_RECT], mode: HOUSE }).map((v) => v * 0.8);
    cellAt(c, r).forEach((v, i) => close(v, want[i] as number, 1e-9, `cell ${c},${r}: lit as a house by winTile`));
  }
  // not at day, not on a roof or a floor, and each building by its colour
  assert.deepEqual(run({ night: 0 }), [0, 0, 0], 'dark by day');
  assert.deepEqual(run({ night: 0.003 }).map((v) => v > 0), [false, false, false]);
  for (const normal of [[0, 1, 0], [0, -1, 0]]) assert.deepEqual(cells.map((_, i) => run({ normal, map: [(Math.floor(i / 20) + 0.5) * 2.5, (i % 20 + 0.5) * 5.5] })).flat().filter((v) => v > 0).length, 0, `no windows on a face looking ${normal}`);
  // a face that looks a little up is lit less, from a fifth of a unit up (0.2) to none at 0.4 (a roof or a floor of the same mesh has no windows); looking down as much counts the same
  const litCell = cells.findIndex((c) => level(c) > 0.2);
  assert.ok(litCell >= 0);
  const at = (normal: number[]): number[] => run({ normal, map: [(Math.floor(litCell / 20) + 0.5) * 2.5, ((litCell % 20) + 0.5) * 5.5] });
  const sideOn = at([1, 0, 0]);
  for (const [y, share] of [[0.1, 1], [0.2, 1], [0.3, 0.5], [0.4, 0], [0.9, 0], [-0.3, 0.5], [-1, 0]] as const) {
    at([Math.sqrt(1 - y * y), y, 0]).forEach((v, i) => close(v, share * (sideOn[i] as number), 1e-9, `a face looking ${y} up has ${share} of the light`));
  }
  let other = 0;
  for (let i = 0; i < 400; i++) if ((level(cells[i] as number[]) > 0.01) !== (level(run({ colour: 0.31, map: [((i % 20) + 0.5) * 2.5, (Math.floor(i / 20) + 0.5) * 5.5] })) > 0.01)) other++;
  assert.ok(other > 50, `another building, another pattern: ${other} of 400 differ`);
  // the number is quantised: a tone that wanders by a thousandth is the same building
  assert.deepEqual(run({ colour: 0.5502, map: [3, 3] }), run({ colour: 0.5498, map: [3, 3] }));
  // far away the windows are the building's mean glow, the same in every cell
  const farRun = (c: number, r: number): number[] => run({ map: [(c + 0.5) * 2.5, (r + 0.5) * 5.5], span: 0.9 });
  assert.deepEqual(farRun(1, 1), farRun(6, 8), 'the same glow for every window of a distant block');
  assert.ok(level(farRun(1, 1)) > 0, 'and it is a glow');
});
