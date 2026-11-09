// core/daylight.ts: the look of the sky and the light for a sun elevation and a weather. The rules that matter: the page's own rig is
// the high-sun clear-sky answer, dusk and dawn are smooth (nothing pops as the sun crosses the horizon), the lamps are fully on by the
// end of civil twilight (-6 degrees) and off in daylight, cloud dims and greys, rain darkens, fog pulls the scene in and flattens the sky.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CLEAR, CLEAR_FOG, CLOUD_EXPOSURE, CLOUD_EXPOSURE_DRY, cloudDeck, DAY_EXPOSURE, DAYLIGHT_FLOOR, describeSun, fogAmount, fogRange, lampLevelFor, MOON_INTENSITY, NIGHT_EXPOSURE, skyRig, smoothstep } from '../daylight.ts';
import type { ReferenceRig, Rgb, SkyRig, SkyWeather } from '../daylight.ts';

// web/src/world.ts DAYLIGHT, spelled out (web/tests/atmosphere.test.ts holds the two together): a bright sun over a softer sky with a
// warm bounce off the paving, the physical light of a clear London day, drawn through a filmic tone map (web/src/lighting.ts)
const REFERENCE: ReferenceRig = {
  sun: { colour: 0xffe8c2, intensity: 3.0 },
  hemisphere: { sky: 0xc4d6ff, ground: 0x6e6860, intensity: 1.0 },
  fills: [{ colour: 0xfff0d8, intensity: 0.6 }, { colour: 0xfff0d8, intensity: 0.25 }],
};
const hex = (h: number): Rgb => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const rig = (elevation: number, weather: Partial<SkyWeather> = {}, azimuth = 200): SkyRig => skyRig(elevation, azimuth, { ...CLEAR, ...weather }, REFERENCE);
const luma = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const spread = (c: Rgb): number => Math.max(...c) - Math.min(...c);
const near = (a: readonly number[], b: readonly number[], tol: number, what: string): void => a.forEach((v, i) => assert.ok(Math.abs(v - (b[i] as number)) <= tol, `${what}: ${a} vs ${b}`));

test('a high sun in a clear sky is the page\'s own rig: the reference numbers, unchanged', () => {
  const r = rig(25);
  assert.equal(r.sun.intensity, REFERENCE.sun.intensity);
  near(r.sun.colour, hex(0xffe8c2), 1e-12, 'sun colour');
  assert.equal(r.hemisphere.intensity, REFERENCE.hemisphere.intensity);
  near(r.hemisphere.sky, hex(0xc4d6ff), 1e-12, 'sky');
  near(r.hemisphere.ground, hex(0x6e6860), 1e-12, 'ground');
  assert.deepEqual(r.fills.map((f) => f.intensity), [0.6, 0.25]);
  for (const f of r.fills) near(f.colour, hex(0xfff0d8), 1e-12, 'fill colour');
  assert.equal(r.lampLevel, 0);
  assert.equal(r.stars, 0);
  assert.equal(r.moon.intensity, 0);
  assert.equal(r.daylight, 1);
  assert.equal(r.fogAmount, 0);
});

test('the page\'s old fixed dusk is one moment of the evening: at 8 degrees below the horizon the horizon is the old 0x35465e', () => {
  near(rig(-8).dome.horizon, hex(0x35465e), 1e-12, 'horizon at -8 degrees');
  assert.equal(rig(-8).sun.intensity, 0, 'no direct sun then');
});

test('the lamps are fully on by the end of civil twilight (-6 degrees) and off by +2, easing between', () => {
  assert.equal(lampLevelFor(-6), 1);
  assert.equal(lampLevelFor(-30), 1);
  assert.equal(lampLevelFor(2), 0);
  assert.equal(lampLevelFor(60), 0);
  assert.ok(Math.abs(lampLevelFor(-2) - 0.5) < 1e-12, 'half-way at the half-way elevation');
  let previous = 1;
  for (let e = -20; e <= 40; e += 0.1) {
    const l = rig(e).lampLevel;
    assert.ok(l <= previous + 1e-12, `the lamps came up as the sun rose, at ${e}`);
    assert.ok(l >= 0 && l <= 1);
    previous = l;
  }
  assert.equal(rig(-6.01).lampLevel, 1);
  assert.equal(rig(-10).lampLevel, 1);
  assert.equal(rig(2.01).lampLevel, 0);
  assert.equal(rig(12).lampLevel, 0);
});

test('nothing pops through dusk and dawn: every number moves smoothly as the sun crosses the horizon', () => {
  const scalars = (r: SkyRig): number[] => [r.sun.intensity, r.moon.intensity, Math.max(r.sun.intensity, r.moon.intensity), r.hemisphere.intensity, r.daylight, r.lampLevel,
    r.stars, r.glow.strength, ...r.fills.map((f) => f.intensity), ...r.sun.colour, ...r.hemisphere.sky, ...r.hemisphere.ground, ...r.dome.zenith, ...r.dome.horizon,
    ...r.fog, ...r.glow.colour, ...r.fills.flatMap((f) => f.colour)];
  for (const weather of [{}, { cloud: 1 }, { cloud: 1, rain: 1 }, { visibilityM: 300 }, { cloud: 1, snow: 1 }]) {
    let previous = scalars(rig(60, weather));
    for (let e = 59.95; e >= -30; e -= 0.05) {
      const now = scalars(rig(e, weather));
      now.forEach((v, i) => assert.ok(Math.abs(v - (previous[i] as number)) < 0.02, `${JSON.stringify(weather)}: number ${i} moved ${(previous[i] as number).toFixed(4)} to ${v.toFixed(4)} at ${e.toFixed(2)} degrees`));
      previous = now;
    }
  }
});

test('the night key is the stylised moon: it takes over where the sun\'s key has gone, never overlapping it, and is gone by day', () => {
  for (let e = -40; e <= 60; e += 0.1) {
    const r = rig(e);
    assert.ok(r.moon.intensity === 0 || r.sun.intensity === 0, `sun ${r.sun.intensity} and moon ${r.moon.intensity} both shine at ${e}`);
  }
  assert.equal(rig(0).moon.intensity, 0);
  assert.equal(rig(-4).moon.intensity, 0);
  assert.equal(rig(-4).sun.intensity, 0, 'the sun\'s key is spent by -4 degrees');
  assert.ok(rig(-1).sun.intensity > 0 && rig(-1).sun.intensity < 0.25 * rig(25).sun.intensity, 'a dim reddened sun just under the horizon');
  assert.equal(rig(-10).moon.intensity, MOON_INTENSITY);
  assert.equal(rig(-30).moon.intensity, MOON_INTENSITY);
  assert.ok(rig(-7).moon.intensity > 0 && rig(-7).moon.intensity < MOON_INTENSITY);
  assert.ok(MOON_INTENSITY <= 0.4 * REFERENCE.sun.intensity, 'the moon is a small fraction of the sun');
  assert.ok(rig(-20, { cloud: 1 }).moon.intensity < 0.35 * rig(-20).moon.intensity, 'cloud hides most of the moon');
  const [x, y, z] = rig(-20).moon.direction;
  assert.ok(y > 0.5 && x < 0 && z > 0, 'a cool light from the south-west, well up');
  assert.ok(luma(rig(-20).moon.colour) > 0 && rig(-20).moon.colour[2] > rig(-20).moon.colour[0], 'blue-grey');
  assert.equal(rig(-30).daylight, DAYLIGHT_FLOOR, 'the daylight stand-ins keep their floor all night, and never go quite dead');
  assert.equal(rig(-30, { cloud: 1 }).daylight, DAYLIGHT_FLOOR * 0.65, 'cloud takes a third from it');
});

test('the sun\'s direction follows the elevation and azimuth: the scene frame has east +x, up +y, south +z', () => {
  const [x, y, z] = rig(30, {}, 90).sun.direction;
  near([x, y, z], [Math.cos(Math.PI / 6), 0.5, -Math.cos(Math.PI / 2) * Math.cos(Math.PI / 6)], 1e-12, 'due east at 30 degrees');
  const [sx, sy, sz] = rig(10, {}, 225).sun.direction;
  assert.ok(sx < 0 && sz > 0 && sy > 0, `the south-west sun is at ${[sx, sy, sz]}`);
});

test('cloud takes the sun away and greys the sky; the ambient light stays, so the scene is soft rather than dark', () => {
  const clear = rig(40), overcast = rig(40, { cloud: 1 });
  assert.ok(overcast.sun.intensity < 0.2 * clear.sun.intensity, `overcast sun ${overcast.sun.intensity} against ${clear.sun.intensity}`);
  assert.ok(overcast.hemisphere.intensity > 0.9 * clear.hemisphere.intensity, 'the sky light is nearly as strong');
  assert.ok(spread(overcast.hemisphere.sky) < spread(clear.hemisphere.sky), 'a greyer ambient');
  assert.ok(spread(overcast.dome.zenith) < 0.5 * spread(clear.dome.zenith), 'a greyer sky overhead');
  assert.ok(spread(overcast.sun.colour) < spread(clear.sun.colour));
  assert.ok(overcast.daylight < clear.daylight && overcast.daylight > 0.5, 'the daylight stand-ins dim a little');
  assert.equal(overcast.lampLevel > 0 && overcast.lampLevel < 0.3, true, 'a heavy overcast brings the lamps up a little in the day');
  let previous = Infinity;
  for (let cloud = 0; cloud <= 1.0001; cloud += 0.05) {
    const s = rig(40, { cloud }).sun.intensity;
    assert.ok(s <= previous + 1e-12, 'more cloud never brightens the sun');
    previous = s;
  }
  assert.equal(rig(40, { cloud: 5 }).sun.intensity, rig(40, { cloud: 1 }).sun.intensity, 'cloud above 1 is clamped');
  assert.equal(rig(40, { cloud: -2 }).sun.intensity, clear.sun.intensity, 'cloud below 0 is clamped');
});

test('an overcast day\'s sky is the pale cool white of a bright overcast, not a dark grey, and it stays dusk-dark in the evening', () => {
  // R-lighting-materials-d (an overcast morning on the south front, 2026-06): the sky is (212, 219, 235) high up and (228, 233, 245) toward the
  // horizon, sRGB, so a pale white with a little blue, brighter at the horizon than overhead
  const noon = rig(40, { cloud: 1 });
  assert.ok(luma(noon.dome.zenith) > 0.78, `a bright zenith: ${luma(noon.dome.zenith)}`);
  assert.ok(luma(noon.dome.horizon) > 0.85, `a brighter horizon: ${luma(noon.dome.horizon)}`);
  assert.ok(luma(noon.dome.horizon) > luma(noon.dome.zenith), 'the horizon is the paler');
  assert.ok(noon.dome.zenith[2] > noon.dome.zenith[0] && spread(noon.dome.zenith) < 0.16, `a little blue, not a colour: ${noon.dome.zenith}`);
  assert.ok(luma(noon.dome.zenith) > luma(rig(40).dome.zenith), 'a cloud sky is brighter than the clear blue');
  // the lift is for dry cloud: in rain (from an amount of 0.5) the sky is the dull grey it always was, darker than the clear sky
  const rainy = rig(40, { cloud: 1, rain: 0.6 });
  assert.ok(luma(rainy.dome.horizon) < luma(rig(40).dome.horizon), `a rainy horizon is duller than the clear one: ${luma(rainy.dome.horizon)}`);
  assert.ok(luma(rainy.dome.zenith) < 0.45, `and so is its zenith: ${luma(rainy.dome.zenith)}`);
  assert.ok(luma(rig(40, { cloud: 1, rain: 0.2 }).dome.zenith) > luma(rainy.dome.zenith), 'a drizzle keeps some of the lift');
  // the dusk with cloud keeps the dusk's dark sky (the lift is the day's), and the lift comes in smoothly with the sun
  assert.ok(luma(rig(-8, { cloud: 1 }).dome.zenith) < 0.1, `a cloudy dusk is dark: ${luma(rig(-8, { cloud: 1 }).dome.zenith)}`);
  let previous = luma(rig(-8, { cloud: 1 }).dome.zenith);
  for (let e = -8; e <= 40; e += 0.5) {
    const now = luma(rig(e, { cloud: 1 }).dome.zenith);
    assert.ok(now >= previous - 1e-9 && now - previous < 0.06, `the cloud sky brightens smoothly with the sun: ${previous} to ${now} at ${e}`);
    previous = now;
  }
});

test('rain darkens the sky and the light and brings the lamps on in the afternoon; heavier rain is darker', () => {
  const dry = rig(35, { cloud: 1 }), light = rig(35, { cloud: 1, rain: 0.35 }), heavy = rig(35, { cloud: 1, rain: 1 });
  assert.ok(luma(heavy.dome.zenith) < luma(light.dome.zenith) && luma(light.dome.zenith) < luma(dry.dome.zenith));
  assert.ok(luma(heavy.dome.horizon) < luma(dry.dome.horizon));
  assert.ok(heavy.hemisphere.intensity < dry.hemisphere.intensity);
  assert.ok(heavy.sun.intensity < dry.sun.intensity);
  assert.ok(heavy.lampLevel > light.lampLevel && light.lampLevel > dry.lampLevel, 'the gloom of rain brings the lamps on');
  assert.ok(heavy.lampLevel <= 0.55, 'but not to the full brightness of night');
  assert.equal(rig(35).lampLevel, 0, 'a clear afternoon needs none');
  assert.ok(heavy.daylight < dry.daylight || dry.daylight === heavy.daylight);
});

test('rain darkens the dome by a share of its own colour, a seventh at full rain, in a clear sky and at dusk under cloud (where the day\'s lift of a cloud sky does not also change)', () => {
  // (by day under cloud the sky also loses its lift as the rain comes, which darkens it too, so only these cases show the darkening itself)
  for (const [e, cloud] of [[55, 0], [10, 0], [-8, 1], [-8, 0.5], [-12, 1]] as const) {
    const dry = rig(e, { cloud });
    for (const [rain, share] of [[0.5, 0.07], [1, 0.14]] as const) {
      const wet = rig(e, { cloud, rain });
      near(wet.dome.zenith, dry.dome.zenith.map((v) => v * (1 - share)), 1e-9, `the zenith at ${e} degrees, cloud ${cloud}, rain ${rain}`);
      near(wet.dome.horizon, dry.dome.horizon.map((v) => v * (1 - share)), 1e-9, `the horizon at ${e} degrees, cloud ${cloud}, rain ${rain}`);
    }
  }
});

test('snow lightens the ground\'s share of the ambient by day and not at night', () => {
  assert.ok(luma(rig(30, { cloud: 1, snow: 1 }).hemisphere.ground) > 1.5 * luma(rig(30, { cloud: 1 }).hemisphere.ground), 'snow on the ground lights the underside of things');
  near(rig(-30, { snow: 1 }).hemisphere.ground, rig(-30).hemisphere.ground, 1e-12, 'night ground');
});

test('fog: 0 at ten kilometres, 1 at two hundred metres, and the scene fog comes in with the visibility', () => {
  assert.equal(fogAmount(Infinity), 0);
  assert.equal(fogAmount(24_140), 0);
  assert.equal(fogAmount(10_000), 0);
  assert.equal(fogAmount(200), 1);
  assert.equal(fogAmount(50), 1);
  assert.equal(fogAmount(NaN), 0, 'an unknown visibility is no fog');
  let previous = 0;
  for (let v = 10_000; v >= 100; v *= 0.97) {
    const f = fogAmount(v);
    assert.ok(f >= previous - 1e-12 && f >= 0 && f <= 1, `fog thinned as the visibility fell, at ${v}`);
    previous = f;
  }
  // clear London air is hazy at distance: the far city fades into the horizon from 100 m and is gone at 2.6 km (R-lighting-materials-d: the
  // buildings beyond the foreground lose contrast and pale toward the sky's horizon). The amounts are ASSUMED, judged by eye against that photograph
  // (and, in round three, against a scorer who found the far third of the overview nearly as contrasty as its foreground at 2.8 km; in round five against one who found 2 km a
  // flat grey wash for a clear day, so the far plane went out to 2.6 km, still under the weather's own 2.8 km).
  assert.deepEqual({ ...CLEAR_FOG }, { near: 100, far: 2600 });
  assert.deepEqual(fogRange(Infinity), { ...CLEAR_FOG }, 'clear air is the haze');
  assert.deepEqual(fogRange(30_000, 500), { ...CLEAR_FOG });
  const mist = fogRange(1800), fog = fogRange(300), dense = fogRange(40);
  const weather = fogRange(10_000); // the weather's own haze, the cap on every thinner one (the clear air's haze is a separate, hazier thing: CLEAR_FOG)
  assert.ok(mist.far < weather.far && mist.far > fog.far && fog.far > dense.far, 'denser fog, nearer far plane');
  assert.ok(fog.far <= 400, `300 m of visibility shows about 400 m at most: ${fog.far}`);
  assert.equal(dense.far, 60, 'never closer than sixty metres');
  for (const v of [40, 300, 1800, 8000]) {
    const { near: n, far } = fogRange(v);
    assert.ok(n > 0 && n < far, `near ${n} is inside far ${far} at ${v} m`);
    assert.ok(fogRange(v, 300).far > fogRange(v, 0).far || fogRange(v, 0).far === weather.far, 'a camera high above the fog layer sees further');
  }
  assert.equal(fogRange(300, -50).far, fogRange(300, 0).far, 'below ground level is ground level');
});

test('in dense fog the sky, the horizon and the fog become one colour, so the edge of the world has no seam', () => {
  const foggy = rig(30, { visibilityM: 250 });
  near(foggy.fog, foggy.dome.horizon, 0.03, 'fog against horizon');
  near(foggy.dome.zenith, foggy.dome.horizon, 0.2, 'the zenith is a little darker than the horizon, as in real fog, but not a different sky');
  assert.ok(luma(foggy.dome.zenith) < luma(foggy.dome.horizon));
  assert.ok(foggy.fogAmount > 0.9);
  assert.ok(foggy.glow.strength < 0.05, 'no sun glow in a fog');
  assert.ok(rig(30, { visibilityM: 250 }).sun.intensity < 0.5 * rig(30).sun.intensity, 'fog takes the sun\'s edge away');
  const clear = rig(30);
  assert.ok(spread(clear.dome.zenith) > 0.2 && spread(foggy.dome.zenith) < 0.6 * spread(clear.dome.zenith), 'and the sky loses its blue');
  assert.deepEqual(rig(30).fog, rig(30).dome.horizon, 'in clear air the fog colour is the horizon colour');
});

test('stars show on dark clear nights only', () => {
  assert.equal(rig(0).stars, 0);
  assert.equal(rig(-6).stars, 0);
  assert.equal(rig(-16).stars, 1);
  assert.equal(rig(-40).stars, 1);
  assert.ok(rig(-12).stars > 0 && rig(-12).stars < 1);
  assert.equal(rig(-40, { cloud: 1 }).stars, 0);
  assert.equal(rig(-40, { rain: 1 }).stars, 0);
  assert.equal(rig(-40, { visibilityM: 200 }).stars, 0);
  assert.ok(rig(-40, { cloud: 0.3 }).stars < 1 && rig(-40, { cloud: 0.3 }).stars > 0, 'thin cloud dims them');
});

test('the sun\'s glow shows near sunrise and sunset, not at noon or at night, and not under cloud', () => {
  assert.equal(rig(40).glow.strength, 0);
  assert.equal(rig(-8).glow.strength, 0);
  assert.ok(rig(1).glow.strength > 0.3 && rig(1).glow.strength <= 0.6);
  assert.equal(rig(1, { cloud: 1 }).glow.strength, 0);
});

test('smoothstep and the status wording', () => {
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(smoothstep(-5, -10, -7.5), 0.5, 'reversed edges run the other way');
  assert.equal(describeSun(23.4), 'sun 23° up (day)');
  assert.equal(describeSun(-3), 'sun 3° below the horizon (civil twilight)');
  assert.equal(describeSun(-8), 'sun 8° below the horizon (nautical twilight)');
  assert.equal(describeSun(-14.6), 'sun 15° below the horizon (night)');
  // the phases change where the definitions say: the horizon, -6 degrees (civil), -12 (nautical)
  const phase = (e: number): string => /\((.*)\)$/.exec(describeSun(e))![1]!;
  assert.deepEqual([0.1, 0, -0.1, -5.9, -6, -6.1, -11.9, -12, -12.1].map(phase),
    ['day', 'day', 'civil twilight', 'civil twilight', 'civil twilight', 'nautical twilight', 'nautical twilight', 'nautical twilight', 'night']);
});

test('smoothstep eases: a quarter of the way is 0.15625 and three quarters 0.84375, whatever the edges and whichever way they run', () => {
  assert.equal(smoothstep(0, 1, 0.25), 0.15625);
  assert.equal(smoothstep(0, 1, 0.75), 0.84375);
  assert.equal(smoothstep(10, 20, 12.5), 0.15625);
  assert.equal(smoothstep(-5, -10, -6.25), 0.15625);
});

test('the sun exactly on the horizon is up, and just under it is below', () => {
  assert.equal(describeSun(0), 'sun 0° up (day)');
  assert.equal(describeSun(-0.2), 'sun 0° below the horizon (civil twilight)');
});

test('fog amount and scene fog distances at known visibilities; a nonsense visibility is the densest fog and never NaN', () => {
  // 1 - ln(v / 200) / ln(10000 / 200), worked out outside the page
  for (const [v, want] of [[300, 0.896354109], [1000, 0.58859191], [5000, 0.17718382], [8000, 0.05704045], [9999, 0.000025564]] as const) {
    assert.ok(Math.abs(fogAmount(v) - want) < 1e-8, `${v} m: ${fogAmount(v)} against ${want}`);
  }
  assert.equal(fogAmount(0), 1);
  assert.equal(fogAmount(-5), 1);
  assert.deepEqual(fogRange(NaN), { ...CLEAR_FOG }, 'an unknown visibility has the clear air\'s haze (round one made clear air hazy: 80 m to 2 km, where it was 1100 m to 3600 m; round five has it 100 m to 2.6 km)');
  // far = 1.25 x the visibility (seen from higher up, the visibility grows with the height over 250 m), at least 60 m and at most the weather's own haze, 2800 m (HAZE_CAP, what every thinner
  // visibility is capped at: the page's old clear fog was 3600 m and is now the clear air's own 2.6 km); near = a fifth of far, at most that haze's 450 m
  for (const [v, h, near, far] of [[300, 0, 75, 375], [1800, 0, 450, 2250], [40, 0, 12, 60], [9000, 0, 450, 2800], [5000, 0, 450, 2800], [300, 250, 150, 750], [300, 1000, 375, 1875], [2000, 100, 450, 2800]] as const) {
    const r = fogRange(v, h);
    assert.ok(Math.abs(r.near - near) < 1e-9 && Math.abs(r.far - far) < 1e-9, `${v} m seen from ${h} m: ${JSON.stringify(r)} against ${near} to ${far}`);
  }
});

test('rain and snow outside 0..1 are clamped as cloud is', () => {
  assert.deepEqual(rig(20, { rain: 5 }), rig(20, { rain: 1 }));
  assert.deepEqual(rig(20, { rain: -2 }), rig(20));
  assert.deepEqual(rig(20, { snow: 5 }), rig(20, { snow: 1 }));
  assert.deepEqual(rig(20, { snow: -2 }), rig(20));
  assert.deepEqual(rig(20, { cloud: 5 }), rig(20, { cloud: 1 }));
});

test('below the lowest keyframe (-18 degrees) the night is the same all night, and no colour leaves 0..1 at any elevation or in any weather', () => {
  const parts = (r: SkyRig): number[] => [...r.dome.zenith, ...r.dome.horizon, ...r.hemisphere.sky, ...r.hemisphere.ground, r.hemisphere.intensity, ...r.fog,
    ...r.fills.flatMap((f) => [...f.colour, f.intensity])];
  for (const weather of [{}, { cloud: 1 }, { rain: 1 }, { snow: 1 }, { visibilityM: 100 }, { cloud: 1, rain: 1, snow: 1, visibilityM: 100 }]) {
    near(parts(rig(-60, weather)), parts(rig(-18, weather)), 1e-12, `the deep night under ${JSON.stringify(weather)}`);
    for (let e = -90; e <= 90; e += 1.5) {
      const r = rig(e, weather);
      const colours: [string, Rgb][] = [['sun', r.sun.colour], ['moon', r.moon.colour], ['sky light', r.hemisphere.sky], ['ground light', r.hemisphere.ground], ['zenith', r.dome.zenith],
        ['horizon', r.dome.horizon], ['glow', r.glow.colour], ['fog', r.fog], ...r.fills.map((f, i): [string, Rgb] => [`fill ${i}`, f.colour])];
      for (const [name, colour] of colours) colour.forEach((v) => assert.ok(v >= 0 && v <= 1, `${name} has a channel of ${v} at ${e} degrees under ${JSON.stringify(weather)}`));
    }
  }
});

test('each part of the weather moves each part of the rig the way that weather does: dimmer, greyer, hiding the glow, bringing the lamps on', () => {
  const clear = rig(30), cloudy = rig(30, { cloud: 1 }), foggy = rig(30, { visibilityM: 100 }), rainy = rig(30, { rain: 1 }), snowy = rig(30, { snow: 1 });
  // the sky light: dimmed by cloud, rain and fog, brighter over snow
  assert.ok(cloudy.hemisphere.intensity < clear.hemisphere.intensity, 'cloud dims the sky light');
  assert.ok(rainy.hemisphere.intensity < clear.hemisphere.intensity, 'rain dims it');
  assert.ok(foggy.hemisphere.intensity < clear.hemisphere.intensity, 'fog dims it');
  assert.ok(snowy.hemisphere.intensity > clear.hemisphere.intensity, 'snow brightens it');
  // greyer: the sky light in fog, the horizon under cloud, and the fog itself against the clear horizon it fades into
  assert.ok(spread(foggy.hemisphere.sky) < spread(clear.hemisphere.sky), 'fog greys the sky light');
  assert.ok(spread(cloudy.dome.horizon) < spread(clear.dome.horizon), 'cloud greys the horizon');
  assert.ok(spread(foggy.fog) < spread(clear.dome.horizon), 'the fog is a greyer colour than the clear horizon');
  // the fills dim under cloud and under fog, and so do the daylight stand-ins under fog
  clear.fills.forEach((f, i) => {
    assert.ok((cloudy.fills[i] as { intensity: number }).intensity < f.intensity, `cloud dims fill ${i}`);
    assert.ok((foggy.fills[i] as { intensity: number }).intensity < f.intensity, `fog dims fill ${i}`);
  });
  assert.ok(foggy.daylight < clear.daylight, 'fog dims the stand-ins');
  // the sun keeps a little over half its strength to dense fog's 45 per cent, and the moon its 70
  const keeps = foggy.sun.intensity / clear.sun.intensity;
  assert.ok(keeps > 0.3 && keeps < 0.6, `dense fog takes a little over half the sun: it keeps ${keeps}`);
  assert.ok(rig(-20, { visibilityM: 100 }).moon.intensity < rig(-20).moon.intensity, 'fog takes some of the moon too');
  // the glow is full on the horizon, still there at 15 degrees, and hidden by fog
  assert.ok(Math.abs(rig(0).glow.strength - 0.6) < 1e-12, `full on the horizon: ${rig(0).glow.strength}`);
  assert.ok(rig(15).glow.strength > 0.4, `${rig(15).glow.strength}`);
  assert.equal(rig(1, { visibilityM: 100 }).glow.strength, 0, 'fog hides the glow');
  // the lamps: dense fog in the afternoon brings them on, but not as far near the horizon (where the day is still going) as higher up
  assert.ok(foggy.lampLevel > 0, 'dense fog brings the lamps on in the afternoon');
  const gloom = { cloud: 1, rain: 1, visibilityM: 100 };
  assert.ok(rig(1, gloom).lampLevel < rig(30, gloom).lampLevel, 'the gloom lamps are scaled by how much day there is');
  // the daylight stand-ins reach full at 8 degrees and fall to their floor at -6
  assert.equal(rig(8).daylight, 1);
  assert.ok(rig(7).daylight < 1);
  assert.equal(rig(-6).daylight, DAYLIGHT_FLOOR);
  assert.ok(rig(-5).daylight > DAYLIGHT_FLOOR);
  // toward dusk the fills warm: less blue than at noon
  assert.ok((rig(0).fills[0] as { colour: Rgb }).colour[2] < (rig(25).fills[0] as { colour: Rgb }).colour[2] - 0.05, 'the fills take the evening\'s tint');
});

test('the daylight stand-ins keep a small floor all night and are the whole of their glow at noon', () => {
  assert.ok(DAYLIGHT_FLOOR > 0.05 && DAYLIGHT_FLOOR < 0.25, `a floor, not a switch: ${DAYLIGHT_FLOOR}`);
  assert.ok(rig(-30).daylight > 0.05 && rig(-30).daylight < 0.25);
  assert.equal(rig(40).daylight, 1);
  assert.ok(rig(-3).daylight > rig(-30).daylight && rig(-3).daylight < rig(40).daylight, 'and it rises through the twilight');
});

test('exposure: the filmic grade runs at the day\'s exposure, higher at night and under cloud, and it moves smoothly', () => {
  assert.equal(NIGHT_EXPOSURE, 2.3);
  assert.equal(DAY_EXPOSURE, 1.25);
  assert.equal(rig(40).exposure, DAY_EXPOSURE, 'a clear day');
  assert.equal(rig(-30).exposure, NIGHT_EXPOSURE, 'a clear night');
  assert.ok(NIGHT_EXPOSURE > DAY_EXPOSURE, 'the filmic toe darkens the shadows, so the dim night light is lifted to be seen');
  assert.ok(rig(40, { cloud: 1 }).exposure > rig(40).exposure, 'an overcast sky has no sun to carry the picture: the exposure goes up');
  assert.ok(Math.abs(rig(-30, { cloud: 1 }).exposure - NIGHT_EXPOSURE) < 1e-12, 'but at night cloud changes nothing');
  let previous = rig(-30).exposure;
  for (let e = -30; e <= 40; e += 0.1) {
    const x = rig(e, { cloud: 0.5 }).exposure;
    assert.ok(Math.abs(x - previous) < 0.03, `the exposure jumped at ${e}: ${previous} to ${x}`);
    previous = x;
  }
});

test('exposure under a dry overcast deck opens a further CLOUD_EXPOSURE_DRY (round four, E3): rain, dusk and night keep the exposure they had', () => {
  assert.equal(CLOUD_EXPOSURE, 0.9);
  // round five: 0.75 drew the stock brick of the south front 9 dE2000 from R-d (the same wall in overcast: a median L 50.5 to 53.2); 0.35 draws it 2.8 to 4.4 away. It stays above the
  // zero that drew it too dark (L 48, 3.6 away in round three) so that the overcast day is lifted, not left at the clear day's light
  assert.ok(CLOUD_EXPOSURE_DRY > 0.2 && CLOUD_EXPOSURE_DRY < 0.6, `a lift of a fifth to a half over the clear day's, not the 0.75 that overshot R-d and not the 0 that undershot it: ${CLOUD_EXPOSURE_DRY}`);
  const noon = { dry: rig(55, { cloud: 1 }).exposure, rain: rig(55, { cloud: 1, rain: 1 }).exposure, drizzle: rig(55, { cloud: 1, rain: 0.2 }).exposure };
  assert.ok(Math.abs(noon.dry - DAY_EXPOSURE * (1 + CLOUD_EXPOSURE + CLOUD_EXPOSURE_DRY)) < 1e-12, `a dry overcast noon: ${noon.dry}`);
  assert.ok(Math.abs(noon.rain - DAY_EXPOSURE * (1 + CLOUD_EXPOSURE)) < 1e-12, `rain keeps the exposure it had: ${noon.rain}`);
  assert.ok(noon.dry > noon.drizzle && noon.drizzle > noon.rain, 'a drizzle keeps some of the lift, as it keeps some of the sky\'s');
  assert.equal(rig(55).exposure, DAY_EXPOSURE, 'a clear day is as it was');
  assert.ok(rig(55, { cloud: 0.5 }).exposure > DAY_EXPOSURE * (1 + 0.5 * CLOUD_EXPOSURE), 'and the lift grows with the cloud');
  // at dusk and at night the day's lift is not wanted (the sky's own is gone by dayAmount 0): the exposure is the old one
  for (const e of [-30, -12, -6]) assert.equal(rig(e, { cloud: 1 }).exposure, rig(e).exposure, `no lift at ${e} degrees`);
});

test('the evening is as dim as it was: only the day\'s light was raised, not the dusk\'s and the night\'s', () => {
  // The rows as they were before the daylight rig, against the reference they scaled then (sun 1.7, hemisphere 1.25, fills 0.8 and 0.3): the absolute light
  // at each of those elevations is what the page showed at dusk and at night, and it still is.
  const OLD_ROWS: readonly (readonly [e: number, sunK: number, hemiK: number, fillK: number])[] = [
    [-18, 0, 0.5, 0.18], [-12, 0, 0.52, 0.2], [-8, 0, 0.55, 0.26], [-4, 0, 0.6, 0.42], [-1, 0.12, 0.74, 0.58], [2, 0.38, 0.84, 0.72], [6, 0.64, 0.9, 0.86],
  ];
  const within = (now: number, then: number, share: number, what: string): void => assert.ok(Math.abs(now - then) <= share * then + 1e-9, `${what}: ${now} against the old ${then}`);
  for (const [e, sunK, hemiK, fillK] of OLD_ROWS) {
    const now = rig(e);
    within(now.sun.intensity, 1.7 * sunK, 0.04, `the sun at ${e}`);
    within(now.hemisphere.intensity, 1.25 * hemiK, 0.01, `the sky light at ${e}`);
    within((now.fills[0] as { intensity: number }).intensity, 0.8 * fillK, 0.015, `the first fill at ${e}`);
    // the second fill's reference fell from 0.3 to 0.25 while the first's fell from 0.8 to 0.6, and one K serves both: it is a touch brighter than it was, by at most 0.01 of light
    assert.ok((now.fills[1] as { intensity: number }).intensity <= 1.15 * 0.3 * fillK + 1e-9, `the second fill at ${e} is within a sixth of what it was`);
  }
  assert.ok(rig(40).sun.intensity > 1.7 * 1.7, `by day the sun is well above the old 1.7: ${rig(40).sun.intensity}`);
});

test('by day the ground\'s share of the ambient is the paving\'s warm bounce, not the old cold slate', () => {
  for (const e of [12, 25, 45]) {
    const g = rig(e).hemisphere.ground;
    assert.ok(g[0] > g[2], `warm at ${e} degrees: ${g}`);
    assert.ok(luma(g) > 0.35, `bright enough to lift the underside of things at ${e}: ${luma(g)}`);
  }
});

test('clear air is aerial perspective: haze from 100 m, so a high view shows the far blocks paler than the near ones, and the weather\'s own fog is unchanged', () => {
  // the share of the way to the horizon's colour at a distance, as the scene's linear fog works it out
  const share = (d: number, v = Infinity): number => { const f = fogRange(v); return Math.min(1, Math.max(0, (d - f.near) / (f.far - f.near))); };
  assert.equal(share(40), 0, 'the street at the feet is clear');
  assert.ok(share(150) < 0.04, `a street-level view (all within 150 m) is all but untouched: ${share(150)}`);
  // the overview looks 250 to 1160 m down the ground (the frozen camera, 220 m up at 36 degrees down, a 50 degree lens): the near edge has barely
  // any haze, the far third (480 m and beyond) a seventh to over two fifths of the way to the horizon, so it reads lighter, greyer and bluer (round five: with the far plane at
  // 2.6 km and not 2, the far third is 15% to 42% of the way where it was 21% to 56%, "a flat grey wash" to the E1 scorer)
  assert.ok(share(260) < 0.12 && share(260) > 0.05, `${share(260)}`);
  assert.ok(share(480) > 0.13 && share(480) < 0.19, `${share(480)}`);
  assert.ok(share(1160) > 0.38 && share(1160) < 0.46, `${share(1160)}`);
  assert.ok(share(1160) > 5 * share(260), 'the far blocks carry several times the haze of the near ones');
  // the weather's own fog is what it was: 10 km is the old haze exactly, and everything thinner keeps its near plane at 450 m or a fifth of its far plane
  assert.deepEqual(fogRange(10_000), { near: 450, far: 2800 });
  assert.deepEqual(fogRange(7000), { near: 450, far: 2800 }, 'rain');
  assert.deepEqual(fogRange(4000), { near: 450, far: 2800 }, 'drizzle');
  assert.deepEqual(fogRange(1800), { near: 0.2 * 2250, far: 2250 }, 'mist');
  // between 10 and 20 km the clear-air haze eases in: never a step, never thinner as the air clears (the far plane comes in from the weather's 2.8 km to 2.6 km)
  let previous = 450;
  let previousFar = 2800;
  for (let v = 10_000; v <= 20_000; v += 250) {
    const { near: n, far } = fogRange(v);
    assert.ok(n <= previous + 1e-9 && n >= CLEAR_FOG.near - 1e-9, `near ${n} at ${v} m`);
    assert.ok(far <= previousFar + 1e-9 && far >= CLEAR_FOG.far - 1e-9, `far ${far} at ${v} m`);
    previous = n;
    previousFar = far;
  }
  assert.equal(fogRange(20_000).far, CLEAR_FOG.far, 'and the clear air is reached at 20 km');
  assert.ok(Math.abs(fogRange(10_001).near - 450) < 1, 'no step as the visibility passes 10 km');
  assert.deepEqual(fogRange(NaN), { ...CLEAR_FOG }, 'an unreadable visibility is the clear air, as it always was');
});

test('a cloud deck has structure: smooth, fixed, about half on average, and different from one part of the sky to another', () => {
  // a grid of sky directions from 5 to 90 degrees up, all round
  const values: number[] = [];
  for (let el = 5; el <= 90; el += 5) {
    for (let az = 0; az < 360; az += 10) {
      const e = (el * Math.PI) / 180, a = (az * Math.PI) / 180;
      values.push(cloudDeck(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)));
    }
  }
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  assert.ok(values.every((v) => v >= 0 && v <= 1), 'in range');
  assert.ok(mean > 0.4 && mean < 0.6, `about half on average: ${mean}`);
  assert.ok(sd > 0.07, `there is structure to see, not a flat deck: sd ${sd}`);
  assert.equal(cloudDeck(0.3, 0.8, -0.2), cloudDeck(0.3, 0.8, -0.2), 'fixed: the same sky every time');
  // smooth: half a degree on, the value has moved only a little (so the dome shows billows, not grain)
  for (const [el, az] of [[20, 40], [45, 200], [70, 310], [10, 120]] as const) {
    const at = (a: number): number => { const e = (el * Math.PI) / 180, r = (a * Math.PI) / 180; return cloudDeck(Math.cos(e) * Math.sin(r), Math.sin(e), Math.cos(e) * Math.cos(r)); };
    assert.ok(Math.abs(at(az) - at(az + 0.5)) < 0.05, `smooth at ${el},${az}: ${at(az)} vs ${at(az + 0.5)}`);
  }
});
