// After dark the trains' passenger windows glow warm and their headlight and tail lamp lenses glow in their own colour
// (web/src/train-geom.ts `trainNight`, tagged per vertex by `Soup.emit`). By day a lit lens keeps a floor (LENS_GLOW.day), so a lamp that is on reads as on in daylight;
// the windows glow only after dark and an unlit lens is the paint it always was. No new meshes: the tag rides in the existing detail mesh.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { TRAIN_KINDS } from '../../core/train.ts';
import { LENS, buildTrain } from '../src/train.ts';
import { col, LENS_GLOW, plain, Soup, trainNight } from '../src/train-geom.ts';
import { Glsl } from './glsl.ts';
import type { Value } from './glsl.ts';

const TRI: [[number, number, number], [number, number, number], [number, number, number]] = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
const UP: [[number, number, number], [number, number, number], [number, number, number]] = [[0, 0, 1], [0, 0, 1], [0, 0, 1]];

test('a Soup tags its vertices with the lamp state in force when they were added, and carries aGlow only if something is lit', () => {
  const dark = new Soup();
  dark.tri(TRI, UP, col(0x808080));
  assert.equal(dark.build().getAttribute('aGlow'), undefined, 'an unlit soup has no aGlow attribute at all');

  const lit = new Soup();
  lit.tri(TRI, UP, col(0x808080));
  lit.emit = 1;
  lit.tri(TRI, UP, col(0xffffff));
  lit.emit = 2;
  lit.tri(TRI, UP, col(0xff0000));
  lit.emit = 0;
  lit.tri(TRI, UP, col(0x808080));
  const g = lit.build();
  const glow = g.getAttribute('aGlow') as THREE.BufferAttribute;
  assert.equal(glow.itemSize, 1);
  assert.equal(glow.count, g.getAttribute('position').count, 'one tag for every vertex');
  assert.deepEqual(Array.from(glow.array), [0, 0, 0, 1, 1, 1, 2, 2, 2, 0, 0, 0]);
});

test('every kind of train has lit passenger windows and glowing lamp lenses after dark, in the one detail mesh it already had', () => {
  assert.ok(TRAIN_KINDS.length >= 4);
  for (const kind of TRAIN_KINDS) {
    const train = buildTrain(kind);
    let windows = 0, lenses = 0, meshes = 0;
    train.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      const glow = mesh.geometry.getAttribute('aGlow');
      if (!glow) return;
      assert.equal(mesh.name, 'body-detail', `${kind}: only the detail mesh carries the tag`);
      assert.equal(mesh.material, plain(), `${kind}: and it uses the shared material that lights it`);
      for (let i = 0; i < glow.count; i++) {
        const v = glow.getX(i);
        assert.ok(v === 0 || v === 1 || v === 2, `${kind}: tag ${v}`);
        if (v === 1) windows++;
        if (v === 2) lenses++;
      }
    });
    assert.ok(windows >= 30, `${kind}: ${windows} lit window vertices`);
    assert.ok(lenses >= 6, `${kind}: ${lenses} lamp lens vertices`);
    assert.ok(windows > lenses, `${kind}: windows far outnumber lamps`);
    assert.ok(meshes > 0);
  }
});

test('the shared train material lights the tagged vertices after lighting, by the shared trainNight uniform, and leaves untagged ones alone', () => {
  assert.equal(trainNight.value, 0, 'by day the uniform is 0: the windows do not glow (a lit lens keeps its floor, below)');
  const m = plain();
  assert.ok(m.isMeshLambertMaterial && m.vertexColors, 'the same material every train always used');
  assert.equal(plain(), m, 'one shared material');
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  assert.equal(shader.uniforms.uNight, trainNight, 'the uniform IS the shared object, so setting trainNight.value reaches the shader');
  assert.match(shader.vertexShader, /attribute float aGlow;\s*varying float vGlow;/);
  assert.match(shader.vertexShader, /#include <begin_vertex>\s*vGlow = aGlow;/);
  assert.match(shader.fragmentShader, /uniform float uNight;\s*varying float vGlow;/);
  const glowAt = shader.fragmentShader.indexOf('outgoingLight += uNight');
  assert.ok(glowAt > shader.fragmentShader.indexOf('outgoingLight = '), 'added after the lighting has been summed');
  assert.ok(glowAt < shader.fragmentShader.indexOf('#include <opaque_fragment>'), 'and before the colour is written');
  assert.match(shader.fragmentShader, /step\( 0\.5, vGlow \) \* \( 1\.0 - step\( 1\.5, vGlow \) \)/, 'a window is tag 1 only');
  assert.match(shader.fragmentShader, /uNight \* step\( 0\.5, vGlow \) \* \( 1\.0 - step\( 1\.5, vGlow \) \) \* vec3\(/, 'and its glow is scaled by uNight alone: it is night-only');
  assert.match(shader.fragmentShader, /step\( 1\.5, vGlow \) \* vColor\.rgb/, 'a lens is tag 2 and glows its own colour');
  assert.ok(shader.fragmentShader.includes(`step( 1.5, vGlow ) * vColor.rgb * mix( ${LENS_GLOW.day.toFixed(2)}, ${LENS_GLOW.night.toFixed(2)}, uNight )`), 'by the floor by day, rising to the night\'s glow with uNight');
  assert.equal((shader.fragmentShader.match(/#include <opaque_fragment>/g) ?? []).length, 1);
  assert.equal((shader.vertexShader.match(/vGlow = aGlow;/g) ?? []).length, 1);
});

test('the added line is type-correct against three\'s own declarations (the GPU refused a vec4 vertex colour added to a vec3 light sum)', () => {
  const declared = /varying vec(\d) vColor;/.exec(THREE.ShaderChunk.color_pars_fragment);
  assert.ok(declared, 'three declares the vertex colour varying the glow reads');
  const components = Number(declared[1]);
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  plain().onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const added = /outgoingLight \+= uNight[^;]*;/.exec(shader.fragmentShader);
  assert.ok(added, 'the glow line is there');
  const uses = [...added[0].matchAll(/vColor(\.[a-z]+)?/g)];
  assert.ok(uses.length > 0);
  for (const use of uses) {
    const width = use[1] === undefined ? components : use[1].length - 1;
    assert.equal(width, 3, `${use[0]} has ${width} components, but outgoingLight is a vec3 (three declares vColor as vec${components})`);
  }
  // a plain vec3 literal times a float, and scalars, are the other terms: no other varying or attribute is read
  assert.deepEqual([...new Set([...added[0].matchAll(/\b(v[A-Z]\w*|a[A-Z]\w*|u[A-Z]\w*)\b/g)].map((m) => m[1]))].sort(), ['uNight', 'vColor', 'vGlow']);
});

/**
 * The lamp glow as the GPU writes it: plain()'s added lines, run in the GLSL interpreter on a pixel of colour `hex` and lamp tag `glow` (2: a lit lens, 1: a lit window, 0: neither)
 * at `night` (the trainNight uniform), from a lit sum of `light` times its colour (0.6: dusk; 0.1: a lens in deep shade), then clamped per channel as the colour write does.
 */
const glowPixel = (hex: number, { light = 0.6, glow = 2, night = 1 }: { light?: number; glow?: number; night?: number } = {}): number[] => {
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  plain().onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = shader.fragmentShader, a = f.indexOf('outgoingLight += uNight');
  const c = col(hex), rgb = [c.r, c.g, c.b];
  const vars: Record<string, Value> = { outgoingLight: rgb.map((v) => v * light), uNight: night, vGlow: glow, vColor: [...rgb, 1] };
  new Glsl('').run(f.slice(a, f.indexOf('#include <opaque_fragment>', a)), { vars });
  return (vars.outgoingLight as number[]).map((v) => Math.min(1, Math.max(0, v)));
};
const lensPixel = (hex: number, light = 0.6): number[] => glowPixel(hex, { light });

test('a lit lens keeps its hue after dark: the glow scales all three channels together, so a red tail lamp stays red and a white head lamp white', () => {
  const tail = col(LENS.tailOn), [r, g, b] = lensPixel(LENS.tailOn);
  // channel clipping took red to 1 while green and blue kept climbing, washing the lamp pink; scaled together the lens keeps its own ratios
  assert.ok(r > 0.99, `the tail lamp is at full red: ${r}`);
  for (const [name, v, own] of [['green', g, tail.g], ['blue', b, tail.b]] as const) {
    assert.ok(v <= (own / tail.r) * 1.05 + 1e-6, `${name} ${v.toFixed(3)} stays at the lens's own share of red (${(own / tail.r).toFixed(3)}), well below it`);
  }
  const head = col(LENS.headOn), white = lensPixel(LENS.headOn);
  // LENS.headOn is a warm white (0xfff3c4, linear 1 / 0.90 / 0.55): it stays at full brightness and that warm white, not yellow
  assert.ok(Math.max(...white) > 0.99 && Math.min(...white) >= 0.5, `the head lamp stays a bright warm white: ${white.map((v) => v.toFixed(3))}`);
  white.forEach((v, k) => assert.ok(Math.abs(v - [head.r, head.g, head.b][k]! / Math.max(head.r, head.g, head.b)) < 0.02, `head lamp channel ${k} keeps its share`));
});

test('a lit lens reads lit by day too: never under its floor, far brighter than the same lens unlit, at its own hue and not blown out to white', () => {
  assert.ok(LENS_GLOW.day > 0 && LENS_GLOW.day < LENS_GLOW.night, `the day floor ${LENS_GLOW.day} is something, and under the night's ${LENS_GLOW.night}`);
  // (a vertex colour carries col()'s lighting gain, 1.5: a lit lens's own colour is up to 1.5 before the glow caps its brightest channel at 1)
  for (const [name, on, off] of [['head', LENS.headOn, LENS.headOff], ['tail', LENS.tailOn, LENS.tailOff], ['marker', LENS.markerOn, LENS.tailOff]] as const) {
    const own = col(on), ownRgb = [own.r, own.g, own.b], peak = Math.max(...ownRgb);
    for (const light of [0.1, 0.3, 0.6, 1.1]) {
      const lit = glowPixel(on, { light, night: 0 }), top = Math.max(...lit);
      const floor = Math.min(1, peak * LENS_GLOW.day);
      assert.ok(top >= floor - 1e-6, `${name} lens at light ${light} by day: brightest channel ${top.toFixed(3)} is under the floor ${floor.toFixed(3)}`);
      assert.ok(lit.every((v) => v <= 1 + 1e-9), `${name} lens at light ${light} by day: no channel over 1`);
      lit.forEach((v, k) => assert.ok(Math.abs(v / top - (ownRgb[k] as number) / peak) < 1e-6, `${name} lens at light ${light} by day keeps its hue (channel ${k}: ${(v / top).toFixed(3)} of its brightest, its own ${((ownRgb[k] as number) / peak).toFixed(3)})`));
      const unlit = Math.max(...glowPixel(off, { light, glow: 0, night: 0 }));
      assert.ok(top > unlit * 1.5, `${name} lens at light ${light} by day: lit ${top.toFixed(3)} is not clearly over the same lens unlit ${unlit.toFixed(3)}`);
    }
  }
  // the head lamp in shade reads lit: a warm white at the top of the scale, its blue well under its red, so it is never the pure white of a blown-out one
  const shade = glowPixel(LENS.headOn, { light: 0.1, night: 0 });
  assert.ok(Math.max(...shade) >= 0.9, `a lit head lamp in shade: ${shade.map((v) => v.toFixed(3))}`);
  assert.ok(shade[2]! < shade[0]! - 0.3, `and still warm, not white: ${shade.map((v) => v.toFixed(3))}`);
  // the tail lamp in shade is a clear red a good way up the scale, not the near-black red of the paint
  const tail = glowPixel(LENS.tailOn, { light: 0.1, night: 0 });
  assert.ok(tail[0]! >= 0.6 && tail[1]! < 0.1 && tail[2]! < 0.1, `a lit tail lamp in shade: ${tail.map((v) => v.toFixed(3))}`);
});

test('by day a lit window stays dark and an unlit lens stays its paint: only a lit lens keeps a floor, and the windows glow after dark alone', () => {
  const window = 0xffffff;
  for (const light of [0.1, 0.6]) {
    const own = col(window), want = [own.r, own.g, own.b].map((v) => Math.min(1, v * light));
    const day = glowPixel(window, { light, glow: 1, night: 0 }), dusk = glowPixel(window, { light, glow: 1, night: 1 });
    day.forEach((v, k) => assert.ok(Math.abs(v - want[k]!) < 1e-6, `a window by day at light ${light}: channel ${k} ${v} is the lit sum ${want[k]}, with nothing added`));
    assert.ok(dusk.every((v, k) => v > day[k]! + 0.1), `a window after dark at light ${light} glows: ${dusk.map((v) => v.toFixed(2))} over ${day.map((v) => v.toFixed(2))}`);
  }
  for (const [name, hex] of [['head', LENS.headOff], ['tail', LENS.tailOff]] as const) {
    const own = col(hex), want = [own.r, own.g, own.b].map((v) => v * 0.3);
    for (const night of [0, 0.5, 1]) {
      glowPixel(hex, { light: 0.3, glow: 0, night }).forEach((v, k) => assert.ok(Math.abs(v - want[k]!) < 1e-6, `an unlit ${name} lens at night ${night}: channel ${k} ${v} is its paint ${want[k]}, untouched`));
    }
  }
});

test('a lit lens does not dim as night falls: from its day floor it rises to the night\'s glow, the brightest channel capped at 1', () => {
  // (the tail lamp: a head lamp's colour is already over 1 with the floor in shade, so it is at its cap by day and cannot show the rise)
  const hex = LENS.tailOn, own = col(hex), peak = Math.max(own.r, own.g, own.b);
  let last = 0;
  for (const night of [0, 0.25, 0.5, 0.75, 1]) {
    const top = Math.max(...glowPixel(hex, { light: 0.1, night }));
    assert.ok(top >= last - 1e-9, `at night ${night} the lens (${top.toFixed(3)}) is not dimmer than at the night before it (${last.toFixed(3)})`);
    last = top;
  }
  const day = Math.max(...glowPixel(hex, { light: 0.1, night: 0 })), dark = Math.max(...glowPixel(hex, { light: 0.1, night: 1 }));
  assert.ok(Math.abs(day - peak * (0.1 + LENS_GLOW.day)) < 1e-6, `by day, in shade, it is the floor over the paint: ${day}`);
  assert.ok(Math.abs(dark - 1) < 1e-9, `after dark it is at full brightness: ${dark}`);
  assert.ok(dark > day + 0.1, 'and after dark it is clearly brighter than by day');
});

test('two trains share the material and the lamps add no meshes: the detail mesh count per car is what it was', () => {
  const a = buildTrain('lner9');
  const b = buildTrain('lner5');
  const detail = (root: THREE.Object3D): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    root.traverse((o) => { if (o.name === 'body-detail') out.push(o as THREE.Mesh); });
    return out;
  };
  assert.ok(detail(a).length >= 8 && detail(b).length >= 4);
  assert.ok([...detail(a), ...detail(b)].every((mesh) => mesh.material === plain()));
  // a car's window panes and lamp lenses are triangles of its one detail mesh, not meshes of their own
  const names = new Set<string>();
  a.traverse((o) => { if ((o as THREE.Mesh).isMesh) names.add(o.name.replace(/\d+/g, '#')); });
  assert.ok(![...names].some((n) => /lamp|lens|window|pane/i.test(n)), `no lamp or window meshes: ${[...names]}`);
});
