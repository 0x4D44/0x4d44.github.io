// After dark the trains' passenger windows glow warm and their headlight and tail lamp lenses glow in their own colour
// (web/src/train-geom.ts `trainNight`, tagged per vertex by `Soup.emit`). No new meshes: the tag rides in the existing detail mesh.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { TRAIN_KINDS } from '../../core/train.ts';
import { buildTrain } from '../src/train.ts';
import { col, plain, Soup, trainNight } from '../src/train-geom.ts';

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
  assert.equal(trainNight.value, 0, 'by day nothing glows');
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
  assert.match(shader.fragmentShader, /step\( 1\.5, vGlow \) \* vColor\.rgb/, 'a lens is tag 2 and glows its own colour');
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
