import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {createAtmosphere, surfaceUniforms} from '../src/atmosphere.ts';
import {createPlatformLamps, urbanLampOptions} from '../src/station-lamps.ts';
import {createStreetLights} from '../src/streetlights.ts';
import {forcedObservation, weatherState} from '../src/weather.ts';
import {addWorld} from '../src/world.ts';
import {lampHaloProbe} from './lamp-halo-probe.ts';

const fog = {near: -17.986, far: 210.019, amount: .8963541094861764};
const receiver = {background: [.14, .13, .12], depth: 100, fogColour: [.352, .2926, .2607]};

function eye(y = 4): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1.6, .1, 20000);
  camera.position.set(0, y, 50);
  camera.lookAt(0, 8, 0);
  camera.updateMatrixWorld();
  return camera;
}

test('scattered roof light adds with a soft shoulder over both dark and already bright surfaces', () => {
  const heads = Array.from({length: 16}, (_, i) => [(i % 4 - 1.5) * 1.1, 8 + .08 * i, -3 * i]).flat();
  for (const station of ['kx', 'wv'] as const) {
    const layer = createPlatformLamps(heads, [], 0, station, true);
    try {
      surfaceUniforms.fog.value = fog.amount;
      layer.setLevel(1);
      const points = layer.group.getObjectByName('street-lamp-halos') as THREE.Points;
      const material = points.material as THREE.PointsMaterial;
      assert.equal(material.blending, THREE.CustomBlending);
      assert.equal(material.blendSrc, THREE.OneFactor);
      assert.equal(material.blendDst, THREE.OneMinusSrcColorFactor);
      const p = lampHaloProbe(points, eye(), fog);
      const dark = p.composeAt(640, 406, receiver);
      assert.ok(dark.rgb[0]! > dark.background[0]! + .18 && Math.max(...dark.rgb) < 250 / 255);
      const bright = p.composeAt(640, 406, {...receiver, background: [.9, .9, .9], fogColour: [.9, .9, .9]});
      assert.ok(bright.rgb.every((value, i) => value > bright.background[i]! && value < 1));
    } finally {
      layer.dispose();
      surfaceUniforms.fog.value = 0;
    }
  }
});

test('dense roof fog leaves several bright core pixels on each isolated source', () => {
  for (const station of ['kx', 'wv'] as const) {
    const layer = createPlatformLamps([0, 8, 0], [], 0, station, true);
    try {
      const halo = layer.group.getObjectByName('street-lamp-halos') as THREE.Points;
      const cores = layer.group.getObjectByName('street-lamp-cores') as THREE.Points;
      const camera = eye();
      layer.setLevel(1);
      const clear = lampHaloProbe(halo, camera, {near: 100, far: 2600, amount: 0}, cores);
      const clearCore = cores.material;
      const head = clear.entries[0]!;
      surfaceUniforms.fog.value = fog.amount;
      layer.setLevel(1);
      const mist = lampHaloProbe(halo, camera, fog, cores);
      let peaks = 0;
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
        if (Math.max(...mist.composeAt(head.x+x, head.y+y, receiver).rgb) >= 240 / 255) peaks++;
      }
      assert.ok(peaks >= 4 && peaks <= 24, `${station} bright core pixels: ${peaks}`);
      if (station === 'wv') {
        const at = (p: typeof mist) => Math.max(...p.composeAt(head.x, head.y+2, receiver).rgb);
        assert.ok(at(mist) >= at(clear), 'fog preserves the pendant glow');
      }
      for (const amount of [0, .0912, .26]) {
        surfaceUniforms.fog.value = amount;
        layer.setLevel(1);
        assert.equal(cores.material, clearCore);
      }
    } finally {
      layer.dispose();
      surfaceUniforms.fog.value = 0;
    }
  }
});

test('the mast adds light around the full 10–30px ring while its 60–80px background recedes', () => {
  const layer = createStreetLights([{x:0, y:0, z:0, height:10, yaw:0, kind:2, mast:true, slope:[0,0]}],
    {...urbanLampOptions(), softFog:true, kxOptics:true});
  try {
    layer.setLevel(1);
    const points = layer.group.getObjectByName('street-lamp-halos') as THREE.Points;
    const camera = eye(26);
    const plain = lampHaloProbe(points, camera, fog);
    surfaceUniforms.fog.value = fog.amount;
    layer.setLevel(1);
    const dense = lampHaloProbe(points, camera, fog);
    const centre = dense.entries.find(p => p.haze)!;
    const darkPaving = {...receiver, background:[.02,.02,.02], fogColour:[.10,.08,.07], maxPointSize:511};
    const ring = (p: typeof dense, radius: number) => {
      let sum = 0;
      for (let i = 0; i < 32; i++) {
        const a = i * Math.PI / 16;
        const [r,g,b] = p.composeAt(centre.x+radius*Math.cos(a), centre.y+radius*Math.sin(a),
          darkPaving).rgb;
        sum += .2126*r!+.7152*g!+.0722*b!;
      }
      return sum * 255 / 32;
    };
    const outer = (p: typeof dense) => [60,70,80].reduce((sum, r) => sum + ring(p, r), 0)/3;
    const plainOuter = outer(plain), denseOuter = outer(dense);
    assert.ok(denseOuter <= plainOuter + 3, 'the lobe must fall off before the background ring');
    for (const radius of [10,20,30]) {
      const gain = ring(dense,radius)-denseOuter-ring(plain,radius)+plainOuter;
      assert.ok(gain >= 12, `${radius}px full-ring contrast gain: ${gain}`);
    }
  } finally {
    layer.dispose();
    surfaceUniforms.fog.value = 0;
  }
});

test('dense fog has a visible display gradient and a smooth lamp-group lift on the dome', () => {
  for (const kx of [true, false]) {
    const scene = new THREE.Scene();
    const world = addWorld(scene, {grid: false});
    const camera = eye();
    const a = createAtmosphere({scene, world, sites: null, kingsCrossNightFog: kx,
      cityFogTint: kx ? [.320, .266, .237] : [.215, .185, .16], litFogCloud: true});
    try {
      a.update({camera, target: new THREE.Vector3(), timeMs: Date.parse('2026-11-20T22:30:00Z'),
        wallMs: 1000, weather: weatherState(forcedObservation('fog'))});
      const p = world.sky.geometry.getAttribute('position');
      const c = world.sky.geometry.getAttribute('color');
      const group = new THREE.Vector2(kx ? 45 : 40, (kx ? 15 : -150)-50).normalize();
      const bands = [[], [], [], []] as number[][];
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / 5200;
        const dir = new THREE.Vector2(p.getX(i), p.getZ(i)).normalize().dot(group);
        const colour = new THREE.Color().fromBufferAttribute(c, i).convertLinearToSRGB();
        const luma = 255 * (.2126*colour.r + .7152*colour.g + .0722*colour.b);
        if (Math.abs(t) < .005 && dir < -.96) bands[0]!.push(luma);
        if (t > .19 && t < .20 && dir < -.96) bands[1]!.push(luma);
        if (t > .19 && t < .20 && dir > .95) bands[2]!.push(luma);
        if (t > .38 && t < .39) bands[3]!.push(luma);
      }
      assert.ok(bands.every(band => band.length > 0));
      const [horizon, high, lit, top] = bands.map(band => Math.max(...band));
      assert.ok(horizon!-high! >= 5 && horizon!-high! <= 10, `horizon rise ${horizon!-high!}`);
      assert.ok(lit!-high! >= 3, `lamp-group lift ${lit!-high!}`);
      assert.ok(top!-Math.min(...bands[3]!) < .03, 'higher fog remains smooth');
    } finally {
      a.dispose();
    }
  }
});
