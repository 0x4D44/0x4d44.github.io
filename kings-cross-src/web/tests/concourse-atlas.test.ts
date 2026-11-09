import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, shedLayout, stationBuilding } from '../../core/station.ts';
import { ATLAS, buildConcourse } from '../src/concourse.ts';

// The sign atlas is painted on a canvas, and Node has none, so the other tests never see its colours. Here a recording stand-in for the canvas lets the test read what the atlas is
// painted with: every filled rectangle, in order, with its style. Round 6 (C5, R-b): the lit interiors of the Range's openings are dark glazed doors with the lit plate over them, not
// bright flat cards, and the shop's goods are muted tones, not a toy shop's primaries.
interface Fill { style: string; x: number; y: number; w: number; h: number }
const canvases: { width: number; height: number; fills: Fill[] }[] = [];
function fakeCanvas(): unknown {
  const fills: Fill[] = [], base: Record<string, unknown> = {
    fillStyle: '',
    fillRect(this: { fillStyle: unknown }, x: number, y: number, w: number, h: number): void { fills.push({ style: String(this.fillStyle), x, y, w, h }); },
  };
  // anything else the painters call (text, strokes, gradients) does nothing; a gradient or a measure answers with an inert object
  const context = new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : (): unknown => ({ addColorStop(): void { /* inert */ }, width: 8 })), set: (t, k: string, v) => { t[k] = v; return true; } });
  const canvas = { width: 0, height: 0, fills, getContext: (): unknown => context };
  canvases.push(canvas);
  return canvas;
}
(globalThis as { document?: unknown }).document = { createElement: fakeCanvas };

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const station = stationBuilding(data) as NonNullable<ReturnType<typeof stationBuilding>>;
const hotel = data.buildings.find(b => b.id === 46821177)!;
buildConcourse(concourseCanopy(data), station.pts, shedLayout(data), [hotel.pts]);
const atlas = canvases.find(c => c.width === ATLAS.width && c.height === ATLAS.height);

/** Linear luminance of an '#rrggbb' style, which is what the lights multiply. */
const linear = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('atlas: the canvas stand-in is painted on, so that the tests below read the atlas and not nothing', () => {
  assert.ok(atlas, `no canvas of ${ATLAS.width} x ${ATLAS.height} was painted`);
  assert.ok(atlas.fills.length > 40, `${atlas.fills.length} rectangles painted`);
  assert.ok(canvases.length >= 2, 'the other textures of the concourse are painted on the stand-in too');
});

test('atlas: the five lit interiors are dark glazed doors, each shaded darker toward the floor, not bright cards (R-b)', () => {
  assert.ok(atlas, 'the atlas is painted');
  assert.equal(ATLAS.uses.length, 5);
  const tones = ATLAS.uses.map(([x, y, w, h], i) => {
    const base = atlas.fills.find(f => f.x === x && f.y === y && f.w === w && f.h === h);
    assert.ok(base && /^#[0-9a-f]{6}$/.test(base.style), `interior ${i} is painted one base tone`);
    const tone = linear(base.style);
    assert.ok(tone < 0.2, `interior ${i} is painted ${base.style}, linear ${tone.toFixed(2)}: a dark tone, not a bright card`);
    // a shade across the lower part of the opening, painted after the tone: black at 30 % or more
    const shade = atlas.fills.find(f => f.x === x && Math.abs(f.y - (y + h * 0.72)) < 1e-6 && f.w === w && Math.abs(f.h - h * 0.28) < 1e-6);
    assert.ok(shade && atlas.fills.indexOf(shade) > atlas.fills.indexOf(base), `interior ${i} is shaded across its lower part, after its tone`);
    assert.ok(/^#000[0-9a-f]$/.test(shade.style) && parseInt(shade.style.slice(4), 16) / 15 >= 0.3, `the shade of interior ${i} is ${shade.style}: black at 30 % or more`);
    return tone;
  });
  assert.ok(tones.reduce((s, t) => s + t, 0) / tones.length < 0.1, `the interiors average ${(tones.reduce((s, t) => s + t, 0) / tones.length).toFixed(3)} in linear light: dark on the whole`);
});

test('atlas: the shop\'s goods are 18 muted tones, three shelves of six', () => {
  assert.ok(atlas, 'the atlas is painted');
  const goods = atlas.fills.filter(f => f.style.startsWith('hsl('));
  assert.equal(goods.length, 18, 'three shelves of six');
  for (const g of goods) {
    const [, s, l] = /^hsl\(\d+,(\d+)%,(\d+)%\)$/.exec(g.style)!.map(Number) as [number, number, number];
    assert.ok(s <= 45 && l <= 55, `goods painted ${g.style}: muted, at most 45 % saturated and 55 % light`);
  }
});
