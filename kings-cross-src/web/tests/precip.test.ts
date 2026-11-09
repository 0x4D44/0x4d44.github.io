// web/src/precip.ts: rain and snow as two bounded GPU draws. What matters here is the budget (a few thousand vertices, two draw calls
// at the very most, none when it is dry, nothing rewritten by the CPU per frame), that the amount shown follows the weather, and that
// the box of drops follows what the viewer is looking at at a size that suits the distance.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { coverUniforms } from '../src/cover.ts';
import { createPrecip, MAX_WIDTH, RAIN_STREAKS, SNOW_FLAKES, SNOW_SCALE } from '../src/precip.ts';
import type { PrecipFrame } from '../src/precip.ts';

const frame = (over: Partial<PrecipFrame> = {}): PrecipFrame => ({ timeS: 12.5, target: new THREE.Vector3(40, 0, -150), camera: new THREE.Vector3(250, 380, 420), distance: 450, rain: 0, snow: 0, windMs: 0, daylight: 1, ...over });
const shader = (o: THREE.LineSegments | THREE.Points): THREE.ShaderMaterial => o.material as THREE.ShaderMaterial;
const uniforms = (o: THREE.LineSegments | THREE.Points): Record<string, THREE.IUniform> => shader(o).uniforms;

test('the budget: a few thousand vertices, one draw call for rain and one for snow, none when it is dry', () => {
  const p = createPrecip();
  assert.ok(RAIN_STREAKS <= 4000 && SNOW_FLAKES <= 4000, 'a few thousand drops at most');
  assert.equal(p.rain.geometry.getAttribute('position').count, RAIN_STREAKS * 2, 'a streak is two vertices');
  assert.equal(p.snow.geometry.getAttribute('position').count, SNOW_FLAKES);
  assert.ok(p.rain.geometry.getAttribute('position').count + p.snow.geometry.getAttribute('position').count <= 10_000);
  assert.ok(p.rain instanceof THREE.LineSegments && p.snow instanceof THREE.Points, 'one LineSegments and one Points: a draw each');
  assert.deepEqual(p.group.children, [p.rain, p.snow], 'and nothing else');
  assert.deepEqual(p.stats(), { rainVertices: 0, snowPoints: 0, drawCalls: 0 }, 'dry on creation');
  p.update(frame());
  assert.equal(p.rain.visible || p.snow.visible, false, 'a dry frame draws nothing at all');
  assert.deepEqual(p.stats(), { rainVertices: 0, snowPoints: 0, drawCalls: 0 });
  p.update(frame({ rain: 1 }));
  assert.deepEqual(p.stats(), { rainVertices: RAIN_STREAKS * 2, snowPoints: 0, drawCalls: 1 });
  p.update(frame({ snow: 1 }));
  assert.deepEqual(p.stats(), { rainVertices: 0, snowPoints: SNOW_FLAKES, drawCalls: 1 }, 'rain stops being drawn when it stops');
  p.update(frame({ rain: 1, snow: 1 }));
  assert.deepEqual(p.stats(), { rainVertices: RAIN_STREAKS * 2, snowPoints: SNOW_FLAKES, drawCalls: 2 }, 'sleet is two draws, the most there ever are');
  p.dispose();
});

test('the amount drawn follows the weather: half the rain is half the streaks, and out-of-range amounts are clamped', () => {
  const p = createPrecip();
  p.update(frame({ rain: 0.5 }));
  assert.equal(p.stats().rainVertices, RAIN_STREAKS, 'half of the streaks, two vertices each');
  p.update(frame({ rain: 0.25 }));
  assert.equal(p.stats().rainVertices, RAIN_STREAKS / 2);
  p.update(frame({ rain: 7 }));
  assert.equal(p.stats().rainVertices, RAIN_STREAKS * 2);
  p.update(frame({ rain: -3 }));
  assert.equal(p.stats().drawCalls, 0);
  p.update(frame({ snow: 0.5 }));
  assert.equal(p.stats().snowPoints, SNOW_FLAKES / 2);
  p.update(frame({ snow: 0.0001 }));
  assert.equal(p.stats().drawCalls, 0, 'a trace rounds to no drops and no draw');
  let last = 0;
  for (let r = 0; r <= 1.0001; r += 0.05) {
    p.update(frame({ rain: r }));
    assert.ok(p.stats().rainVertices >= last, 'more rain never shows fewer streaks');
    last = p.stats().rainVertices;
  }
  p.dispose();
});

test('nothing is uploaded per frame: the drops\' seeds are written once and the shader places them from the clock', () => {
  const p = createPrecip();
  const versions = (): number[] => [p.rain.geometry.getAttribute('position'), p.rain.geometry.getAttribute('aRand'), p.snow.geometry.getAttribute('position'),
    p.snow.geometry.getAttribute('aRand')].map((a) => (a as THREE.BufferAttribute).version);
  const before = versions();
  for (let i = 0; i < 100; i++) p.update(frame({ rain: 0.8, snow: 0.8, timeS: i * 0.016, distance: 20 + i * 5 }));
  assert.deepEqual(versions(), before, 'no attribute was marked for upload');
  assert.equal(p.rain.frustumCulled, false, 'the shader moves the drops, so the (seed-sized) bounds are not theirs');
  assert.equal(p.snow.frustumCulled, false);
  assert.equal(shader(p.rain).transparent, true);
  assert.equal(shader(p.rain).depthWrite, false, 'drops do not write depth, so they never hide each other or the scene');
  const again = createPrecip();
  assert.deepEqual(Array.from(again.rain.geometry.getAttribute('position').array.slice(0, 600)), Array.from(p.rain.geometry.getAttribute('position').array.slice(0, 600)),
    'the same rain on every load');
  p.dispose();
  again.dispose();
});

test('the box of drops lies between the camera and what it looks at, and its size follows the distance: near a train it is small, from the default view it is wide', () => {
  const p = createPrecip();
  const target = new THREE.Vector3(12, 3, -90);
  const camera = new THREE.Vector3(12, 3, -85);
  p.update(frame({ rain: 1, snow: 1, target, camera, distance: 5, timeS: 3.25 }));
  for (const o of [p.rain, p.snow]) {
    const u = uniforms(o);
    assert.deepEqual((u.uCentre as { value: THREE.Vector3 }).value.toArray(), [12, 0, -87.5], `${o.name}: the box is centred halfway between the camera and what is looked at, on the ground`);
    assert.equal((u.uTime as { value: number }).value, 3.25);
    assert.deepEqual((u.uBox as { value: THREE.Vector3 }).value.toArray(), [16, 12.8, 16], `${o.name}: the smallest box is sixteen metres across`);
  }
  p.update(frame({ rain: 1, snow: 1, distance: 3000 }));
  assert.deepEqual((uniforms(p.rain).uBox as { value: THREE.Vector3 }).value.toArray(), [MAX_WIDTH, MAX_WIDTH * 0.8, MAX_WIDTH], `and the widest ${MAX_WIDTH}`);
  const snowWide = MAX_WIDTH * SNOW_SCALE;
  assert.deepEqual((uniforms(p.snow).uBox as { value: THREE.Vector3 }).value.toArray(), [snowWide, snowWide * 0.8, snowWide], 'snow falls in a narrower box, so it is denser where it is seen');
  p.update(frame({ rain: 1, snow: 1, distance: 100 }));
  assert.deepEqual((uniforms(p.rain).uBox as { value: THREE.Vector3 }).value.toArray(), [120, 96, 120], 'in between: a fifth wider than the view is deep');
  assert.ok(Math.abs((uniforms(p.snow).uBox as { value: THREE.Vector3 }).value.x - 72) < 1e-9);
  const centreFor = (camera: number[], target: number[], distance: number): number[] => {
    p.update(frame({ rain: 1, camera: new THREE.Vector3(...camera), target: new THREE.Vector3(...target), distance }));
    return (uniforms(p.rain).uCentre as { value: THREE.Vector3 }).value.toArray();
  };
  assert.deepEqual(centreFor([0, 3, 0], [40, 0, 30], 50), [20, 0, 15], 'a view that fits the box: halfway');
  const far = centreFor([0, 3, 0], [3000, 0, 0], 3000);
  assert.ok(far[0]! > 0 && far[0]! <= 0.45 * MAX_WIDTH + 1e-9 && far[2] === 0, `a view deeper than the box keeps the camera well inside it: ${far}`);
  assert.deepEqual(centreFor([5, 400, 7], [5, 0, 7], 400), [5, 0, 7], 'looking straight down: under the camera, and no division by nothing');
  const fall = (d: number): number => { p.update(frame({ rain: 1, distance: d })); return (uniforms(p.rain).uFall as { value: number }).value; };
  assert.ok(fall(400) > fall(40) && fall(40) >= 9, 'a wider box falls faster, so the rain looks about the same near and far');
  const length = (d: number): number => { p.update(frame({ rain: 1, distance: d })); return (uniforms(p.rain).uLen as { value: number }).value; };
  assert.ok(length(1) >= 0.5 && length(100000) <= 9 && length(400) > length(40), 'streaks are longer when seen from far away, within limits');
  p.dispose();
});

test('the look follows the weather: heavier rain is denser, night rain is dimmer, the wind leans the streaks, and the wind is capped', () => {
  const p = createPrecip();
  const opacity = (over: Partial<PrecipFrame>): number => { p.update(frame({ rain: 0.5, ...over })); return (uniforms(p.rain).uOpacity as { value: number }).value; };
  assert.ok(opacity({ rain: 1 }) > opacity({ rain: 0.3 }), 'heavier rain is more opaque');
  assert.ok(opacity({ daylight: 0 }) < opacity({ daylight: 1 }), 'and dimmer at night');
  assert.ok(opacity({ rain: 1 }) <= 0.6, 'never a solid sheet');
  const colour = (daylight: number): number[] => { p.update(frame({ rain: 1, daylight })); return (uniforms(p.rain).uColor as { value: THREE.Vector3 }).value.toArray(); };
  assert.ok((colour(1)[0] as number) > (colour(0)[0] as number), 'lighter by day');
  p.update(frame({ rain: 1, windMs: 4 }));
  const wind = (uniforms(p.rain).uWind as { value: THREE.Vector2 }).value.toArray();
  assert.ok(wind[0]! > 0 && wind[1]! > 0, 'leaning with the wind');
  p.update(frame({ rain: 1, windMs: 400 }));
  assert.deepEqual((uniforms(p.rain).uWind as { value: THREE.Vector2 }).value.toArray(), [4, 2.4], 'a gale is capped at 8 m/s');
  p.update(frame({ rain: 1, windMs: -5 }));
  assert.deepEqual((uniforms(p.rain).uWind as { value: THREE.Vector2 }).value.toArray(), [0, 0]);
  p.dispose();
});

test('the shaders are well-formed for every GPU: no smoothstep with its edges reversed (undefined in GLSL), the uniforms they read are all supplied', () => {
  const p = createPrecip();
  for (const o of [p.rain, p.snow]) {
    const m = shader(o);
    for (const source of [m.vertexShader, m.fragmentShader]) {
      for (const match of source.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) {
        assert.ok(Number(match[1]) < Number(match[2]), `${o.name}: smoothstep(${match[1]}, ${match[2]}, ...) has its edges reversed`);
      }
    }
    for (const match of m.vertexShader.matchAll(/^uniform\s+\w+\s+(\w+);/gm)) assert.ok(match[1] as string in m.uniforms, `${o.name}: uniform ${match[1]} is declared but not supplied`);
    for (const match of m.fragmentShader.matchAll(/^uniform\s+\w+\s+(\w+);/gm)) assert.ok(match[1] as string in m.uniforms, `${o.name}: uniform ${match[1]} is declared but not supplied`);
    for (const key of Object.keys(m.uniforms)) assert.ok(new RegExp(`\\b${key}\\b`).test(m.vertexShader + m.fragmentShader), `${o.name}: uniform ${key} is supplied but never read`);
    assert.ok(/dropFade\(world, cycle\)/.test(m.vertexShader) && !/\bd\s*=\s*length\(world/.test(m.vertexShader.split('void main')[1] ?? ''), `${o.name}: one shared fade, applied`);
    // the fade is what stops a drop popping at the box's edge, at the far end of the view, at the lens, and as it enters and leaves
    for (const term of ['smoothstep(0.7, 1.0, max(off.x, off.y))', 'smoothstep(0.7 * reach, reach, d)', 'smoothstep(0.5, 3.0, d)', 'smoothstep(0.0, 0.04, cycle)', 'smoothstep(0.96, 1.0, cycle)']) {
      assert.ok(m.vertexShader.includes(term), `${o.name}: the fade has lost ${term}`);
    }
    assert.ok(/attribute vec2 aRand/.test(m.vertexShader) && o.geometry.getAttribute('aRand').itemSize === 2);
  }
  p.dispose();
});

test('both drops are held back by the roofs: the cover read is in each vertex shader once, and the map they read is the one shared map', () => {
  const p = createPrecip();
  for (const o of [p.rain, p.snow]) {
    const m = shader(o);
    assert.equal(m.vertexShader.split('float coverAt(').length - 1, 1, `${o.name}: the cover read is in the shader once`);
    assert.ok(m.vertexShader.indexOf('float coverAt(') < m.vertexShader.indexOf('void main'), `${o.name}: and declared above where it is used`);
    for (const name of ['uCoverMap', 'uCoverSoft', 'uCoverRect', 'uCoverScale'] as const) assert.ok(m.uniforms[name] === coverUniforms[name], `${o.name}: ${name} is the shared one`);
    assert.equal(m.fragmentShader.includes('coverAt'), false, `${o.name}: the vertex shader decides, so a streak is wholly there or wholly gone`);
  }
  p.dispose();
});

test('dispose frees the geometries and materials', () => {
  const p = createPrecip();
  const freed: string[] = [];
  for (const o of [p.rain, p.snow]) {
    o.geometry.addEventListener('dispose', () => freed.push(`${o.name} geometry`));
    shader(o).addEventListener('dispose', () => freed.push(`${o.name} material`));
  }
  p.dispose();
  assert.deepEqual(freed.sort(), ['rain geometry', 'rain material', 'snow geometry', 'snow material']);
});
