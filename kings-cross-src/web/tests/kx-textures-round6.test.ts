import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { shedLayout } from '../../core/station.ts';
import { buildShed, FRONT_COLOURS, FRONT_FASCIA_TEXT, GLASS_STRUCTURE, glassStructure, paintFascia } from '../src/shed.ts';
import { buildingNightMaterialsOf, material } from '../src/materials.ts';
import { GROUND_Y } from '../src/world.ts';

// Round 6, textures only (the dial-reveal score, sections 2 and 5): the entrances' fascia lettering and glass structure (A3, R-kx-front-a),
// and the tower's darker brick stock (A4, R-kx-front-c). The canvases are painted only in a browser, so their painters are tested on a mock.
const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
const group = buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
const mats = infill.material as THREE.MeshLambertMaterial[];
/** luminance of the colour as displayed (sRGB) */
const lum = (c: THREE.Color): number => { const s = c.getRGB(new THREE.Color(), THREE.SRGBColorSpace); return 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b; };

test('A3: each entrance\'s navy fascia carries pale capitals across its face, inside its ends', () => {
  const fills: { style: unknown; rect?: number[] }[] = [], texts: { t: string; w: number; style: unknown }[] = [];
  const g = {
    fillStyle: '' as unknown, font: '', textAlign: '' as unknown, textBaseline: '' as unknown,
    fillRect(x: number, y: number, w: number, h: number) { fills.push({ style: this.fillStyle, rect: [x, y, w, h] }); },
    fillText(t: string, _x: number, _y: number, w: number) { texts.push({ t, w, style: this.fillStyle }); },
  };
  paintFascia(g as never, 1024, 72);
  assert.ok(fills[0]?.style === '#' + new THREE.Color(FRONT_COLOURS.fascia).getHexString() && fills[0]!.rect![2] === 1024, 'a navy board');
  assert.ok(texts.length === 1 && /[A-Z]{4,}/.test(texts[0]!.t) && texts[0]!.w <= 1024 * 0.9, `lettering inside the board's ends: ${texts[0]?.t}`);
  assert.ok(lum(new THREE.Color(texts[0]!.style as string)) > 0.6 && FRONT_FASCIA_TEXT.height >= 0.4, 'pale, and big enough to read');
  // the board's face carries the whole lettering: its uvs run 0 to 1 across it
  const fascia = infill.geometry.groups.find(gr => gr.materialIndex === 2)!, uv = infill.geometry.getAttribute('uv'), nrm = infill.geometry.getAttribute('normal');
  const idx = (i: number): number => (infill.geometry.index ? infill.geometry.index.getX(i) : i);
  let faces = 0;
  for (let i = fascia.start; i < fascia.start + fascia.count; i += 3) {
    const vs = [0, 1, 2].map(k => idx(i + k));
    if (vs.every(v => nrm.getZ(v) > 0.99) && vs.every(v => uv.getX(v) >= -1e-6 && uv.getX(v) <= 1 + 1e-6 && uv.getY(v) >= -1e-6 && uv.getY(v) <= 1 + 1e-6)) faces++;
  }
  assert.ok(faces >= 12, `six boards' faces mapped 0 to 1: ${faces} triangles`);
});

test('A3: the entrance glass is structured, darker low behind the doors, a lit ceiling band over them, paler in the arch head; the night glow follows it', () => {
  const col = glassStructure(64), at = (y: number): number => col[Math.min(63, Math.floor((y / GLASS_STRUCTURE.height) * 64))]!;
  assert.ok(at(1.0) < 0.8 && at(2.9) > 0.95 && at(4.2) > at(1.0) + 0.15, `low ${at(1).toFixed(2)}, ceiling ${at(2.9).toFixed(2)}, head ${at(4.2).toFixed(2)}`);
  const glass = mats[0]!;
  assert.ok(glass.map instanceof THREE.DataTexture && glass.defines?.KX_GLOW_BY_MAP !== undefined, 'the glass wears the structure and its glow is shaped by it');
  const lib = THREE.ShaderLib.lambert;
  const shaderOf = (m: THREE.Material) => { const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader }; m.onBeforeCompile(s as never, undefined as never); return s.fragmentShader; };
  assert.ok(/KX_GLOW_BY_MAP[\s\S]*frontGlowAdd \*= texture2D\( map, vMapUv \)/.test(shaderOf(glass)), 'the glow is multiplied by the map');
  assert.ok(mats[2]!.defines?.KX_GLOW_BY_MAP === undefined, 'the fascia\'s glow is not masked by its lettering');
  // the map runs up the openings: the glass's uv is metres, so the texture's v transform takes the openings' foot to 0
  glass.map!.updateMatrix();
  const v = (y: number): number => new THREE.Vector3(0, y, 1).applyMatrix3(glass.map!.matrix).y;
  const foot = GROUND_Y + 0.2; // SOUTH_FRONT_ARCADES.footAboveGround
  assert.ok(Math.abs(v(foot)) < 1e-6 && Math.abs(v(foot + GLASS_STRUCTURE.height) - 1) < 1e-6, 'from the openings\' foot to the arch head');
});

test('A4: the tower is a darker yellow stock than the front, by day and at night, on the same texture and program', () => {
  const brick = material('brickFoot') as THREE.MeshLambertMaterial;
  const tower = group.getObjectByName('tower-brick') as THREE.Mesh, day = tower.material as THREE.MeshLambertMaterial;
  const night = buildingNightMaterialsOf(tower)!.night as THREE.MeshLambertMaterial, frontNight = buildingNightMaterialsOf(group.getObjectByName('shed-front') as THREE.Mesh)!.night as THREE.MeshLambertMaterial;
  assert.ok(day !== brick && day.map === brick.map && day.customProgramCacheKey() === brick.customProgramCacheKey(), 'a clone on the same texture and program');
  for (const [t, f, when] of [[day, brick, 'by day'], [night, frontNight, 'at night']] as const) {
    const ratio = lum(t.color) / lum(f.color);
    assert.ok(ratio <= 0.8 && ratio >= 0.55, `${when}: the tower's brick ${ratio.toFixed(2)} of the front's`);
    const warm = (c: THREE.Color): number => c.r / Math.max(c.b, 1e-6);
    assert.ok(t.color.r >= t.color.g && t.color.g >= t.color.b && warm(t.color) >= 0.95 * warm(f.color), `${when}: still a yellow stock, no bluer than the front's`);
  }
});
