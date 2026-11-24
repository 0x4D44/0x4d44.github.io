import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildShed, FRONT_CANOPY, FRONT_FASCIA_TEXT, FRONT_RELIEF, fasciaLevels, paintFascia } from '../src/shed.ts';
import { HAND_OUTLINE, handGeometry, HANDS } from '../src/clocks.ts';
import { GROUND_Y } from '../src/world.ts';

// Round 7 (the dial-text-1b score, section 5): the fascia lettering at distance (A3), broad spade hands (A4), the cornice's shadow line and
// the great arches' impost (A2), and the shadow-pass budget won back first (the canopy lamps' stems no longer cast).
const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
const group = buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const named = (n: string): THREE.Mesh => { const o = group.getObjectByName(n) as THREE.Mesh | undefined; assert.ok(o, `${n} is built`); return o!; };
const X0 = layout.spine - SHED_SPAN_WIDTH, FW = 2 * SHED_SPAN_WIDTH;
const first = (o: THREE.Vector3, d: THREE.Vector3, targets: THREE.Object3D[], far = 40): THREE.Intersection | undefined =>
  new THREE.Raycaster(group.localToWorld(o.clone()), d.clone().transformDirection(group.matrixWorld), 0, far).intersectObjects(targets, true)[0];

test('the canopy lamps\' stems are the entrances\' charcoal frames (which do not cast), not the porch\'s steel (which does)', () => {
  const porch = named('shed-front-porch-arches'), infill = named('shed-front-infill');
  const top = GROUND_Y + FRONT_CANOPY.top, d = FRONT_CANOPY.depth, y = top - FRONT_CANOPY.fascia - 0.02; // under the west end's fascia, over the lamps
  for (const row of FRONT_CANOPY.lightRows) {
    const h = first(new THREE.Vector3(X0 - 2, y, d * row), new THREE.Vector3(1, 0, 0), [porch, infill], 10);
    assert.ok(h && h.object === infill && h.face?.materialIndex === 1, `a stem at row ${row} is the frames' (${h?.object.name})`);
  }
});

test('A3: the fascia\'s white capitals are 0.5 to 0.6 of the board, with an arrow, and every mip level is painted (the middle ones outlined, the smallest a pale band)', () => {
  const record = (w: number, h: number) => {
    const rec = { fills: [] as { s: unknown; r: number[] }[], texts: [] as string[], strokes: 0, font: '' };
    const g = {
      fillStyle: '' as unknown, strokeStyle: '' as unknown, lineWidth: 1, lineJoin: '' as unknown, font: '', textAlign: '' as unknown, textBaseline: '' as unknown,
      fillRect(x: number, y: number, ww: number, hh: number) { rec.fills.push({ s: this.fillStyle, r: [x, y, ww, hh] }); },
      fillText(t: string) { rec.texts.push(t); rec.font = this.font; }, strokeText() { rec.strokes++; },
      measureText(t: string) { return { width: t.length * 0.6 * Number(/(\d+)px/.exec(this.font)?.[1] ?? 0) }; },
    };
    paintFascia(g as never, w, h);
    return rec;
  };
  const big = record(1024, 64), px = Number(/(\d+)px/.exec(big.font)?.[1] ?? 0);
  assert.ok(px >= 0.5 * 64 && px <= 0.6 * 64 && /sans/.test(big.font), `sans capitals ${px} px on a 64 px board`);
  assert.ok(FRONT_FASCIA_TEXT.ink === '#ffffff' && /[←-⇿]/.test(big.texts[0] ?? ''), `white, with an arrow: ${big.texts[0]}`);
  const levels = fasciaLevels();
  assert.ok(levels[0]![0] === 1024 && levels[0]![1] === 64 && levels.at(-1)!.join() === '1,1' && levels.every(([w, h], i) => i === 0 || (w === Math.max(1, levels[i - 1]![0] >> 1) && h === Math.max(1, levels[i - 1]![1] >> 1))), 'a full mip chain');
  const mid = record(256, 16);
  // re-pinned 2026-11-24 (round 8: the board carries two sides' words, as R-kx-front-b's): each side outlined, a band for each on the smallest
  const sides = FRONT_FASCIA_TEXT.sides.length;
  assert.ok(sides === 2 && mid.texts.length === sides && mid.strokes === sides, 'a middle level: the letters outlined heavier');
  const small = record(64, 4), navy = small.fills[0]!.s as string, band = small.fills[1];
  const bands = small.fills.slice(1);
  assert.ok(small.texts.length === 0 && band && bands.length === sides && new THREE.Color(band.s as string).getHSL({ h: 0, s: 0, l: 0 }).l > new THREE.Color(navy).getHSL({ h: 0, s: 0, l: 0 }).l + 0.15 && bands.reduce((s, b) => s + b.r[2]!, 0) >= 0.2 * 64, 'the smallest: a pale band where the words are');
});

test('A4: the hands are broad at the boss, 0.06 to 0.08 of the radius, a narrower shaft, and a spade near the tip', () => {
  for (const s of [HANDS.hour, HANDS.minute]) assert.ok(s.width >= 0.06 && s.width <= 0.08, `boss width ${s.width}`);
  const halfAt = (y: number): number => { // the outline's half-width at y (its right side)
    const right = HAND_OUTLINE.filter(([x]) => x >= 0).sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < right.length; i++) { const [x0, y0] = right[i - 1]!, [x1, y1] = right[i]!; if (y >= y0 && y <= y1) return y1 > y0 ? x0 + ((x1 - x0) * (y - y0)) / (y1 - y0) : Math.max(x0, x1); }
    return 0;
  };
  for (const s of [HANDS.hour, HANDS.minute]) assert.ok(halfAt(s.tail / (s.length + s.tail)) >= 0.49, 'the full width at the centre, the boss');
  assert.ok(halfAt(0.5) <= 0.25 && halfAt(0.84) >= 0.45 && halfAt(0.99) < 0.05, `a shaft ${halfAt(0.5)}, a spade ${halfAt(0.84)}, a point`);
  const g = handGeometry(); g.computeBoundingBox();
  const b = g.boundingBox!;
  assert.ok(b.min.x >= -0.5 - 1e-9 && b.max.x <= 0.5 + 1e-9 && b.min.y >= -1e-9 && b.max.y <= 1 + 1e-9 && b.min.z >= -1e-9 && b.max.z <= 1 + 1e-9, 'in the unit box clocks.ts scales');
});

test('A2: the cornice has a dark soffit and shadow line, and the great arches\' orders stop on a proud stone impost at the springing', () => {
  const front = named('shed-front'), stone = named('shed-stone'), infill = named('shed-front-infill');
  const top = Math.max(...front.geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1));
  const x = X0 + 2; // clear of the great arches' orders, which rise to about 15 m here
  const up = first(new THREE.Vector3(x, top - 1.6, 0.5), new THREE.Vector3(0, 1, 0), [front, stone, infill]);
  assert.ok(up && up.object === infill && Math.abs(up.point.y - (top - 0.9)) < 0.05, `the cornice's soffit is dark: ${up?.object.name} at ${up?.point.y.toFixed(2)}, top ${top.toFixed(2)}, springing ${layout.springing.toFixed(2)}`);
  const yb = top - 0.9 - FRONT_RELIEF.bedMould.height;
  const face = first(new THREE.Vector3(x, yb - 0.1, 5), new THREE.Vector3(0, 0, -1), [front, stone, infill]);
  assert.ok(face && face.object === infill, 'a dark shadow line on the wall under the bed mould');
  const sp = layout.springing;
  for (const xe of [X0 + 0.7, X0 + FW - 0.7]) {
    const h = first(new THREE.Vector3(xe, sp + FRONT_RELIEF.impost.height / 2, 5), new THREE.Vector3(0, 0, -1), [front, stone]);
    const z = h ? group.worldToLocal(h.point.clone()).z : -9;
    assert.ok(h?.object === stone && z >= FRONT_RELIEF.orders * FRONT_RELIEF.orderStep + 0.05, `an impost at x=${xe.toFixed(1)} ${z.toFixed(2)} m proud, prouder than the outer order`);
    const above = first(new THREE.Vector3(xe, sp + FRONT_RELIEF.impost.height + 0.3, 5), new THREE.Vector3(0, 0, -1), [front, stone]);
    const za = above ? group.worldToLocal(above.point.clone()).z : 9;
    assert.ok(above && za < z - 0.3, `and the end pier stands back on it above (${za.toFixed(2)} m)`);
  }
});
