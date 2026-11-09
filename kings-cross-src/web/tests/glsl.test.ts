// web/tests/glsl.ts: the small GLSL interpreter the shader tests run the page's real shaders in (Node has no GPU). It is only arithmetic, so what is
// held here is that it does what GLSL does (the maths, the matrix order, the swizzles, the control flow) and that it is as strict as a GPU's
// compiler where that matters: a test that runs a shader must not pass because the interpreter let through what a driver would refuse.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Glsl, Mat, Sampler, toValue } from './glsl.ts';
import type { Env, Value } from './glsl.ts';

const call = (source: string, fn: string, args: Value[] = [], vars: Record<string, Value> = {}, fns: Env['fns'] = {}): Value | undefined => new Glsl(source).call(fn, args, { vars, fns });
const num = (v: Value | undefined): number => { assert.equal(typeof v, 'number', `a float, not ${JSON.stringify(v)}`); return v as number; };
const near = (actual: Value | undefined, want: number | number[], eps = 1e-12): void => {
  const a = Array.isArray(actual) ? actual : [actual as number];
  const w = Array.isArray(want) ? want : [want];
  assert.equal(a.length, w.length, `${JSON.stringify(actual)} against ${JSON.stringify(want)}`);
  a.forEach((x, i) => assert.ok(Math.abs(x - (w[i] as number)) <= eps, `component ${i}: ${x} against ${w[i]}`));
};
const expr = (e: string, vars: Record<string, Value> = {}): Value => new Glsl('').evaluate(e, { vars });

test('arithmetic follows GLSL: precedence, unary minus, comparisons, the ternary, and && and || that stop at the left side', () => {
  assert.equal(expr('1.0 + 2.0 * 3.0 - 4.0 / 2.0'), 5);
  assert.equal(expr('(1.0 + 2.0) * 3.0'), 9);
  assert.equal(expr('-2.0 * -3.0'), 6);
  assert.equal(expr('10.0 - 4.0 - 3.0'), 3, 'left to right');
  assert.equal(expr('8.0 / 4.0 / 2.0'), 1);
  assert.equal(expr('1e1 + .5 + 2.'), 12.5, 'every way of writing a float');
  assert.equal(expr('1.0 < 2.0'), true);
  assert.equal(expr('2.0 <= 1.0'), false);
  assert.equal(expr('3.0 >= 3.0 && 1.0 != 2.0'), true);
  assert.equal(expr('1.0 == 2.0 || 2.0 == 2.0'), true);
  assert.equal(expr('!(1.0 > 2.0)'), true);
  assert.equal(expr('1.0 > 2.0 ? 10.0 : 20.0'), 20);
  assert.equal(expr('true ? 1.0 : 2.0'), 1);
  assert.equal(expr('false && missing > 0.0'), false, 'the right side of && is not evaluated when the left is false');
  assert.equal(expr('true || missing > 0.0'), true, 'nor the right side of || when the left is true');
  assert.throws(() => expr('true && missing > 0.0'), /missing is not defined/, 'but it is when it has to be');
});

test('vectors: constructors, swizzles in all three alphabets, component-wise maths with scalars, and the built-ins at known values', () => {
  assert.deepEqual(expr('vec3(1.0, 2.0, 3.0)'), [1, 2, 3]);
  assert.deepEqual(expr('vec3(2.0)'), [2, 2, 2], 'one number fills it');
  assert.deepEqual(expr('vec4(vec3(1.0, 2.0, 3.0), 4.0)'), [1, 2, 3, 4]);
  assert.deepEqual(expr('vec4(vec2(1.0, 2.0), vec2(3.0, 4.0))'), [1, 2, 3, 4]);
  const v: Record<string, Value> = { v: [1, 2, 3, 4] };
  assert.equal(expr('v.y', v), 2);
  assert.deepEqual(expr('v.zx', v), [3, 1]);
  assert.deepEqual(expr('v.rgb', v), [1, 2, 3]);
  assert.deepEqual(expr('v.wzyx', v), [4, 3, 2, 1]);
  assert.deepEqual(expr('v.stp', v), [1, 2, 3]);
  assert.deepEqual(expr('v.xx', v), [1, 1], 'a component may be read twice');
  assert.deepEqual(expr('v * 2.0', v), [2, 4, 6, 8]);
  assert.deepEqual(expr('2.0 - v', v), [1, 0, -1, -2]);
  assert.deepEqual(expr('v / v', v), [1, 1, 1, 1]);
  assert.deepEqual(expr('-v.xy', v), [-1, -2]);
  assert.equal(expr('length(vec3(2.0, 3.0, 6.0))'), 7);
  assert.equal(expr('length(-4.0)'), 4);
  assert.equal(expr('dot(vec3(1.0, 2.0, 3.0), vec3(4.0, 5.0, 6.0))'), 32);
  near(expr('normalize(vec3(0.0, 3.0, 4.0))'), [0, 0.6, 0.8]);
  assert.deepEqual(expr('abs(vec2(-1.5, 2.0))'), [1.5, 2]);
  assert.equal(expr('floor(-0.5)'), -1);
  assert.equal(expr('fract(-0.25)'), 0.75, 'fract is x - floor(x), not the part after the point');
  assert.equal(expr('fract(2.75)'), 0.75);
  assert.deepEqual(expr('min(vec3(1.0, 5.0, 3.0), 2.0)'), [1, 2, 2], 'a scalar stands in for a vector');
  assert.deepEqual(expr('max(vec2(1.0, 5.0), vec2(3.0, 4.0))'), [3, 5]);
  assert.equal(expr('clamp(7.0, 0.0, 5.0)'), 5);
  assert.deepEqual(expr('clamp(vec2(-1.0, 0.5), 0.0, 1.0)'), [0, 0.5]);
  assert.deepEqual(expr('mix(vec3(0.0, 10.0, 20.0), vec3(10.0, 20.0, 40.0), 0.25)'), [2.5, 12.5, 25]);
  assert.equal(expr('mix(2.0, 4.0, 0.5)'), 3);
  assert.equal(expr('step(0.5, 0.49)'), 0);
  assert.equal(expr('step(0.5, 0.5)'), 1, 'step is 1 at the edge');
  assert.equal(expr('pow(2.0, 10.0)'), 1024);
  assert.equal(expr('sqrt(81.0)'), 9);
  near(expr('sin(0.0) + cos(0.0)'), 1);
  assert.equal(expr('smoothstep(0.0, 1.0, 0.25)'), 0.15625, '3t^2 - 2t^3 at a quarter');
  assert.equal(expr('smoothstep(0.0, 1.0, 0.5)'), 0.5);
  assert.equal(expr('smoothstep(2.0, 4.0, 1.0)'), 0, 'below the lower edge');
  assert.equal(expr('smoothstep(2.0, 4.0, 9.0)'), 1, 'and above the upper');
  assert.deepEqual(expr('smoothstep(0.0, 1.0, vec2(0.25, 0.5))'), [0.15625, 0.5]);
});

test('matrices are column-major as in GLSL: M * v is the matrix applied, v * M its transpose, and mat3(mat4) the upper left block', () => {
  const rotated = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.4, -1.1, 0.7)).setPosition(3, -5, 8);
  const m = toValue(rotated);
  assert.ok(m instanceof Mat && m.n === 4);
  const p = new THREE.Vector4(1.5, -2, 4, 1);
  const want = p.clone().applyMatrix4(rotated);
  near(expr('m * p', { m, p: toValue(p) }), [want.x, want.y, want.z, want.w], 1e-9);
  // a column-major mat4 holds its translation in elements 12..14: the last column
  near(expr('m * vec4(0.0, 0.0, 0.0, 1.0)', { m }), [3, -5, 8, 1]);
  near(expr('m * vec4(1.0, 0.0, 0.0, 0.0)', { m }), [rotated.elements[0] as number, rotated.elements[1] as number, rotated.elements[2] as number, 0], 1e-12);
  // v * M is M-transposed times v; for a rotation that is its inverse
  const turned = expr('v * mat3(m)', { v: [0.3, 0.6, -0.9], m }) as number[];
  const back = new THREE.Vector3(0.3, 0.6, -0.9).applyMatrix3(new THREE.Matrix3().setFromMatrix4(rotated).transpose());
  near(turned, [back.x, back.y, back.z], 1e-9);
  const there = expr('mat3(m) * v', { v: [0.3, 0.6, -0.9], m }) as number[];
  near(expr('v * mat3(m)', { v: there, m }), [0.3, 0.6, -0.9], 1e-9);
  const other = new THREE.Matrix4().makeScale(2, 3, 4).setPosition(1, 1, 1);
  const product = expr('(a * b) * vec4(1.0, 2.0, 3.0, 1.0)', { a: m, b: toValue(other) }) as number[];
  const direct = new THREE.Vector4(1, 2, 3, 1).applyMatrix4(rotated.clone().multiply(other));
  near(product, [direct.x, direct.y, direct.z, direct.w], 1e-9);
  near(expr('a * (b * vec4(1.0, 2.0, 3.0, 1.0))', { a: m, b: toValue(other) }), [direct.x, direct.y, direct.z, direct.w], 1e-9);
  assert.throws(() => expr('mat3(m) * vec4(1.0)', { m }), /mat3 \* vec4/);
  assert.throws(() => expr('mat3(vec3(1.0))'), /cannot make a mat3/);
});

test('a camera\'s view matrix gives back the world position from the view-space one: cameraPosition - vViewPosition * mat3(viewMatrix)', () => {
  // the Lambert vertex shader sets vViewPosition = -(viewMatrix * model * position).xyz, and the fragment shader has viewMatrix and cameraPosition
  const views: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(10, 40, 90), new THREE.Vector3(0, 0, 0)], [new THREE.Vector3(-250, 3, 12), new THREE.Vector3(40, 2, -150)], [new THREE.Vector3(0.5, 1.7, 0.5), new THREE.Vector3(0.5, 1.7, -40)],
  ];
  for (const [at, look] of views) {
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.5, 9000);
    camera.position.copy(at);
    camera.lookAt(look);
    camera.updateMatrixWorld(true);
    const world = new THREE.Vector3(37.25, 1.5, -88.5);
    const view = world.clone().applyMatrix4(camera.matrixWorldInverse).negate();
    const vars: Record<string, Value> = { viewMatrix: toValue(camera.matrixWorldInverse), cameraPosition: toValue(camera.position), vViewPosition: [view.x, view.y, view.z] };
    near(expr('cameraPosition - vViewPosition * mat3(viewMatrix)', vars), [world.x, world.y, world.z], 1e-9);
    // and the other order, which is a different (wrong) point unless the camera is not turned at all
    const wrong = expr('cameraPosition - mat3(viewMatrix) * vViewPosition', vars) as number[];
    if (camera.quaternion.angleTo(new THREE.Quaternion()) > 1e-3) assert.ok(Math.hypot(wrong[0]! - world.x, wrong[1]! - world.y, wrong[2]! - world.z) > 1e-3, 'the order of the product matters');
  }
});

test('functions, statements and assignment: locals, if and else, early returns, nested calls, swizzle writes, compound assignment', () => {
  const source = `
    uniform float uK;
    varying float vOut;
    float half1(float x) { return x * 0.5; }
    float classify(float x) {
      if (x < 0.0) return -1.0;
      else if (x == 0.0) { return 0.0; }
      float y = half1(x) + uK;
      return y;
    }
    vec4 paint(vec4 c) {
      c.rgb *= 0.5;
      c.a = 1.0;
      c.xy = vec2(c.y, c.x);
      c.z += 10.0;
      return c;
    }
    void main() { vOut = classify(4.0); }
  `;
  const g = new Glsl(source);
  const env = { vars: { uK: 1 } as Record<string, Value> };
  assert.equal(g.call('classify', [-3], env), -1);
  assert.equal(g.call('classify', [0], env), 0);
  assert.equal(g.call('classify', [4], env), 3, 'half of 4, and the uniform');
  assert.deepEqual(g.call('paint', [[1, 2, 3, 0.25]], env), [1, 0.5, 11.5, 1], 'the swizzles, in order');
  assert.deepEqual(g.call('paint', [[1, 2, 3, 0.25]], env), [1, 0.5, 11.5, 1], 'and the argument is the caller\'s own: nothing is left behind');
  const input = [1, 2, 3, 0.25];
  g.call('paint', [input], env);
  assert.deepEqual(input, [1, 2, 3, 0.25], 'a call does not change its caller\'s vector');
  g.call('main', [], env);
  assert.equal(env.vars.vOut, 3, 'a varying written by main lands in the environment');
  const run = g.snippet('float a = 2.0; vec3 b = vec3(a, a * 2.0, 1.0); { float inner = b.y + uK; b.x = inner; } vOut = b.x;');
  const locals = run(env);
  assert.deepEqual(locals.b, [5, 4, 1]);
  assert.equal(locals.inner, 5);
  assert.equal(env.vars.vOut, 5);
  assert.ok(!('vOut' in locals), 'what the snippet assigns to the environment is not one of its locals');
  assert.deepEqual(run(env).b, [5, 4, 1], 'a read snippet runs again from scratch');
});

test('it is strict where a GPU compiler is: no mixing of sizes or types, no wrong argument counts, no unknown names, no reversed smoothstep', () => {
  const bad = (statement: string, message: RegExp): void => assert.throws(() => new Glsl('').snippet(statement)({ vars: { v3: [1, 2, 3], v4: [1, 2, 3, 4], f: 1 } }), message, statement);
  bad('vec3 a = v3 + v4;', /vec3 \+ vec4/);
  bad('float a = v3;', /a is a float, not a vec3/);
  bad('vec3 a = 1.0;', /a is a vec3, not a float/);
  bad('float a = nope;', /nope is not defined/);
  bad('float a = nope(1.0);', /no function nope/);
  bad('float a = smoothstep(1.0, 0.0, 0.5);', /edges the wrong way round/);
  bad('float a = smoothstep(0.5, 0.5, 0.5);', /edges the wrong way round/);
  bad('float a = v3.w;', /past the end of a vec3/);
  bad('float a = v3.xq;', /not a swizzle/);
  bad('float a = f.x;', /\.x on a float/);
  bad('float a = 1.0; float a = 2.0;', /a is declared twice/);
  bad('v3.xx = vec2(1.0, 2.0);', /cannot be assigned to/);
  bad('v3.w = 1.0;', /past the end of a vec3/);
  bad('v3.xy = 1.0;', /\.xy is a vec2, not a float/);
  bad('f = v3;', /f is a float, not a vec3/);
  bad('typo = 1.0;', /typo is not declared/);
  bad('typo += 1.0;', /typo is not set/);
  bad('if (f) f = 2.0;', /if wants a bool/);
  bad('float a = 2.0 + (1.0 > 0.0);', /float \+ bool/);
  bad('float a = length(1.0, 2.0);', /length takes 1 arguments, not 2/);
  bad('float a = smoothstep(0.0, 1.0);', /smoothstep takes 3 arguments, not 2/);
  bad('float a = dot(v3, v4);', /dot wants two vectors of one size/);
  bad('float a = vec3(1.0, 2.0);', /vec3\(\) was given 2 numbers/);
  bad('float a = int(1.0);', /int\(\) is not supported/);
  assert.throws(() => new Glsl('#define X 1\nfloat f() { return 1.0; }'), /cannot read "#define/, 'preprocessor lines are not shaders this interpreter runs');
  const fn = (body: string): Glsl => new Glsl(body);
  assert.throws(() => fn('float f(float x) { return x; }').call('f', [1, 2], { vars: {} }), /f takes 1 arguments, not 2/);
  assert.throws(() => fn('float f(float x) { return x; }').call('f', [[1, 2]], { vars: {} }), /f's x is a float, not a vec2/);
  assert.throws(() => fn('float f(float x) { if (x > 0.0) return 1.0; }').call('f', [-1], { vars: {} }), /reaches its end without returning/);
  assert.throws(() => fn('float f(float x) { return vec2(x); }').call('f', [1], { vars: {} }), /f returns a float/);
  assert.throws(() => fn('float g() { return f(); }\nfloat f() { return 1.0; }'), /g calls f before it is defined/, 'a function is defined above where it is called');
  assert.throws(() => fn('float f(float x) { return f(x); }'), /f calls f before it is defined/, 'and does not call itself');
  assert.throws(() => fn('float f() { return 1.0 }'), /expected ";"/);
  assert.throws(() => fn('float f() { return 1.0; '), /expected a name/);
  assert.throws(() => new Glsl('mat3 m;').evaluate('m * 2.0', { vars: { m: new Mat(3, [1, 0, 0, 0, 1, 0, 0, 0, 1]) } }), /mat3 \* float/);
});

test('what a shader is given: THREE values become GLSL ones, and the rest is a sampler the environment answers for', () => {
  assert.equal(toValue(3.5), 3.5);
  assert.deepEqual(toValue(new THREE.Vector2(1, 2)), [1, 2]);
  assert.deepEqual(toValue(new THREE.Vector3(1, 2, 3)), [1, 2, 3]);
  assert.deepEqual(toValue(new THREE.Vector4(1, 2, 3, 4)), [1, 2, 3, 4]);
  assert.deepEqual(toValue(new THREE.Color(0.25, 0.5, 0.75)), [0.25, 0.5, 0.75]);
  const m = toValue(new THREE.Matrix4().makeTranslation(1, 2, 3));
  assert.ok(m instanceof Mat && m.n === 4 && m.e[12] === 1 && m.e[13] === 2 && m.e[14] === 3);
  const m3 = toValue(new THREE.Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9));
  assert.ok(m3 instanceof Mat && m3.n === 3 && m3.e.join() === '1,4,7,2,5,8,3,6,9', 'column-major, as THREE keeps it');
  const texture = new THREE.DataTexture(new Uint8Array([7]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
  const sampler = toValue(texture);
  assert.ok(sampler instanceof Sampler && sampler.data === texture);
  const g = new Glsl('uniform sampler2D uMap;\nfloat read(vec2 uv) { return texture2D(uMap, uv).r * 255.0; }');
  const seen: Value[] = [];
  const fns = { texture2D: (s: Value, uv: Value): Value => { seen.push(uv); return [(((s as Sampler).data as THREE.DataTexture).image.data as Uint8Array)[0]! / 255, 0, 0, 1]; } };
  assert.equal(num(g.call('read', [[0.25, 0.75]], { vars: { uMap: sampler }, fns })), 7, 'texture2D is the environment\'s, and .r is its first channel');
  assert.deepEqual(seen, [[0.25, 0.75]]);
  assert.deepEqual([...g.globals], [['uMap', 'sampler2D']]);
});
