// The six hero aircraft, as procedural designs against the Builder in aircraft.js. Owner: craft agent.
// Local axes: nose -Z, right wing +X, up +Y. Z(f) maps a 0..1 nose-to-tail fraction to metres.
import * as THREE from 'three';
import { loft, lathe } from './geom.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const st = (x, z, y, chord, t) => ({ x, z, y, chord, t });

/** Falcon F-1: swept-wing twin-tail jet fighter. */
function falcon(b) {
  const { W, L } = b, Z = (f) => (f - 0.5) * L;
  b.body(loft([
    [Z(0), .02, .02, .02, .06], [Z(.025), .2, .2, .18, .06], [Z(.08), .46, .44, .4, .06], [Z(.18), .72, .6, .54, .05], [Z(.32), .92, .78, .64, .02],
    [Z(.5), 1.02, .82, .64, 0], [Z(.7), .92, .74, .62, 0], [Z(.86), .72, .6, .54, 0], [Z(.95), .58, .5, .48, 0], [Z(1), .56, .47, .46, 0],
  ], 24));
  b.body(lathe([[Z(-0.06), 0.0], [Z(-0.01), 0.07], [Z(0.02), 0.16]], 8, [0, 0.06]), 'solid:dark');                          // radome tip
  b.body(lathe([[Z(-0.07), 0.01], [Z(0.0), 0.03]], 6, [0, 0.06]), 'solid:dark');                                           // pitot
  // canopy + frame + dorsal spine
  b.glass(loft([[Z(.19), .02, .02, .02, .72], [Z(.23), .4, .5, .1, .7], [Z(.31), .58, .8, .1, .7], [Z(.41), .54, .64, .1, .7], [Z(.47), .3, .34, .08, .7], [Z(.5), .02, .02, .02, .7]], 18));
  b.body(loft([[Z(.45), .1, .1, .1, .78], [Z(.55), .36, .36, .3, .72], [Z(.8), .3, .5, .3, .66], [Z(.9), .08, .2, .2, .5]], 14));
  // cheek intakes with dark mouths
  for (const sx of [-1, 1]) {
    b.body(loft([[Z(.29), .3, .28, .26, 0, 3], [Z(.36), .36, .33, .31, 0, 3], [Z(.55), .4, .36, .34, 0, 3], [Z(.64), .2, .2, .2, 0, 2.4]], 14).translate(sx * 0.98, -0.22, 0));
    b.body(new THREE.CircleGeometry(0.27, 14).rotateY(Math.PI).translate(sx * 0.98, -0.22, Z(.29) - 0.01), 'solid:dark');
  }
  // wings: swept, with ailerons, wing-tip missile pods
  b.wingSet([st(.7, Z(.40), -.12, 4.9, .07), st(3.0, Z(.47), .02, 3.0, .055), st(W / 2, Z(.585), .2, 1.4, .042)], { hc: .7, flaps: [{ s0: .55, s1: .96, kind: 'ail' }] });
  for (const sx of [-1, 1]) {
    b.body(lathe([[-1.2, 0.0], [-.7, .12], [.4, .15], [1.5, .15], [1.9, .06], [2.0, 0]], 10, [sx * (W / 2 + 0.12), 0.2]).translate(0, 0, 0.4), 'solid:accent');
  }
  // stabilator + canted twin fins with rudders
  b.stabilator([st(.5, Z(.8), .05, 2.3, .05), st(2.9, Z(.87), .1, 1.1, .035)], { z: Z(.8) + 1.0 });
  b.fin([st(0, Z(.72), 0, 3.4, .06), st(2.4, Z(.86), 0, 1.5, .04)], { x: 0.78, y: 0.35, cant: 0.22, hc: .66, rudder: { s0: .06, s1: 1 }, mirror: true });
  // nozzle
  b.body(loft([[Z(.93), .56, .47, .47, 0, 2.2], [Z(1.0), .52, .43, .43, 0, 2.2], [Z(1.035), .46, .38, .38, 0, 2.2]], 20), 'solid:dark');
  b.exhaust(V(0, 0, Z(1.035)), 0.4, 'flame');
  b.tip(V(-W / 2, 0.2, Z(.6)), V(W / 2, 0.2, Z(.6)));
  b.light(V(-W / 2 - .15, .2, Z(.6)), 'r', .09); b.light(V(W / 2 + .15, .2, Z(.6)), 'g', .09);
  b.light(V(.78 + 2.4 * Math.sin(.22), .35 + 2.4 * Math.cos(.22), Z(.89)), 'w', .08); b.light(V(-.78 - 2.4 * Math.sin(.22), .35 + 2.4 * Math.cos(.22), Z(.89)), 'w', .08);
}

/** Wasp W-2: canard pusher with ducted fan and winglet rudders. */
function wasp(b) {
  const { W, L } = b, Z = (f) => (f - 0.5) * L;
  b.body(loft([
    [Z(0), .02, .02, .02, 0], [Z(.035), .2, .2, .18, 0], [Z(.11), .42, .42, .36, 0], [Z(.28), .62, .62, .52, 0], [Z(.5), .66, .66, .52, 0],
    [Z(.7), .55, .56, .45, .04], [Z(.86), .4, .42, .36, .08], [Z(.95), .34, .36, .34, .1], [Z(.99), .3, .3, .3, .1],
  ], 22));
  b.body(lathe([[Z(-.05), 0.0], [Z(-.01), .1], [Z(.02), .18]], 8), 'solid:dark');
  b.glass(loft([[Z(.13), .02, .02, .02, .42], [Z(.19), .42, .52, .1, .42], [Z(.3), .56, .84, .1, .42], [Z(.42), .5, .72, .1, .42], [Z(.52), .3, .4, .1, .4], [Z(.58), .02, .02, .02, .38]], 20));
  // canards (all-moving), main wing with ailerons, winglets with rudders
  b.canard([st(.3, Z(.1), -.02, 1.1, .05), st(1.9, Z(.12), .02, .7, .04)], { z: Z(.1) + 0.45 });
  b.wingSet([st(.5, Z(.45), .08, 3.7, .085), st(2.2, Z(.55), .15, 2.3, .07), st(W / 2, Z(.71), .5, 1.3, .05)], { hc: .72, flaps: [{ s0: .35, s1: .95, kind: 'ail' }] });
  b.fin([st(0, Z(.7), 0, 1.7, .05), st(1.7, Z(.82), 0, .8, .035)], { x: W / 2, y: .5, cant: 0.28, hc: .6, rudder: { s0: .1, s1: 1 }, mirror: true });
  // pusher duct, struts, fan
  b.body(new THREE.TorusGeometry(1.08, 0.11, 8, 28).translate(0, 0.1, Z(1) + 0.55), 'solid:accent');
  for (let k = 0; k < 3; k++) { const a = Math.PI / 2 + (k * Math.PI * 2) / 3; b.tubeBody(V(0, 0.1, Z(.96)), V(Math.cos(a) * 1.04, 0.1 + Math.sin(a) * 1.04, Z(1) + 0.55), 0.045, 'solid:dark'); }
  b.body(lathe([[Z(.98), .0], [Z(.99), .3], [Z(1.02) + .4, .3], [Z(1.02) + .75, 0]], 10, [0, 0.1]), 'solid:accent');
  b.prop(V(0, 0.1, Z(1) + 0.6), 1.0, 5, 'pusher');
  b.exhaust(V(0, 0.1, Z(1) + 0.85), 0.25, 'puff');
  b.tip(V(-W / 2, .5, Z(.76)), V(W / 2, .5, Z(.76)));
  b.light(V(-W / 2 - .1, .6, Z(.74)), 'r', .08); b.light(V(W / 2 + .1, .6, Z(.74)), 'g', .08); b.light(V(0, .55, Z(.9)), 'w', .07);
}

/** Manta M-3: blended flying wing. */
function manta(b) {
  const { W, L } = b, Z = (f) => (f - 0.5) * L;
  b.body(loft([
    [Z(.02), .02, .02, .02, .1], [Z(.1), .8, .34, .3, .06, 2.4], [Z(.3), 1.45, .56, .44, .02, 2.8], [Z(.55), 1.7, .64, .46, 0, 3], [Z(.8), 1.4, .5, .38, 0, 3], [Z(.97), .9, .32, .28, 0, 3],
  ], 24));
  b.wingSet([st(1.1, Z(.22), 0, 5.2, .1), st(3.8, Z(.43), .06, 3.7, .075), st(W / 2, Z(.69), .38, 1.7, .05)], { hc: .74, flaps: [{ s0: .2, s1: .56, kind: 'elevon' }, { s0: .6, s1: .97, kind: 'elevon' }] });
  b.glass(loft([[Z(.12), .02, .02, .02, .42], [Z(.18), .36, .4, .05, .4], [Z(.28), .55, .66, .05, .4], [Z(.4), .48, .5, .05, .4], [Z(.48), .02, .02, .02, .4]], 18));
  for (const sx of [-1, 1]) {
    b.body(loft([[Z(.2), .55, .02, .02, .44], [Z(.27), .55, .16, .0, .5], [Z(.36), .45, .14, 0, .52], [Z(.4), .02, .02, .02, .5]], 12).translate(sx * 1.55, -0.04, 0), 'solid:dark');
    b.body(loft([[Z(.9), .58, .17, .17, 0, 3], [Z(1.06), .52, .15, .15, 0, 3]], 14).translate(sx * 1.1, 0.02, 0), 'solid:dark');
    b.exhaust(V(sx * 1.1, 0.02, Z(1.06)), 0.28, 'flame');
  }
  b.fin([st(0, Z(.63), 0, 2.1, .06), st(1.9, Z(.78), 0, .9, .04)], { x: W / 2 - 0.1, y: .38, cant: 0.45, hc: .6, rudder: { s0: .1, s1: 1 }, mirror: true });
  b.body(lathe([[Z(.96), .2], [Z(1.06) + .3, .1], [Z(1.06) + .9, 0]], 8, [0, 0.0]), 'solid:accent');
  b.tip(V(-W / 2, .38, Z(.82)), V(W / 2, .38, Z(.82)));
  b.light(V(-W / 2 - .1, .4, Z(.78)), 'r', .09); b.light(V(W / 2 + .1, .4, Z(.78)), 'g', .09); b.light(V(0, .55, Z(.95)), 'w', .07);
}

/** Bulldog B-4: heavy twin-engine prop bomber with a glazed nose. */
function bulldog(b) {
  const { W, L } = b, Z = (f) => (f - 0.5) * L;
  b.body(loft([
    [Z(0.03), .02, .02, .02, .1], [Z(.06), .55, .5, .46, .1], [Z(.12), .98, .9, .8, .1], [Z(.22), 1.3, 1.2, 1.0, .15], [Z(.4), 1.45, 1.3, 1.1, .2, 2.4],
    [Z(.6), 1.4, 1.2, 1.05, .12, 2.4], [Z(.78), 1.0, .92, .82, .16], [Z(.92), .56, .56, .5, .36], [Z(1), .22, .3, .28, .5],
  ], 24));
  b.glass(loft([[Z(.0), .02, .02, .02, .1], [Z(.03), .38, .38, .36, .1], [Z(.075), .72, .7, .62, .1], [Z(.13), 1.0, .94, .82, .1], [Z(.2), 1.22, 1.1, .9, .14]], 20).scale(1.0, 1.0, 1.0));
  b.glass(loft([[Z(.2), .02, .02, .02, 1.15], [Z(.25), .85, .6, .1, 1.1], [Z(.32), 1.0, .78, .1, 1.1], [Z(.42), .8, .55, .1, 1.1], [Z(.48), .02, .02, .02, 1.1]], 20));
  b.glass(loft([[Z(.6), .02, .02, .02, 1.3], [Z(.64), .46, .4, .0, 1.25], [Z(.68), .02, .02, .02, 1.25]], 12));
  for (const f of [.045, .09, .15]) b.body(new THREE.TorusGeometry(0.4 + (f - .045) * 7.2, 0.045, 5, 18).rotateY(0).translate(0, 0.1, Z(f)), 'solid:accent');
  // wings (thick, straight), flaps, ailerons
  b.wingSet([st(1.2, Z(.33), .28, 4.0, .15), st(4.4, Z(.35), .34, 3.4, .13), st(W / 2, Z(.41), .45, 2.0, .085)], { hc: .72, flaps: [{ s0: .55, s1: .97, kind: 'ail' }] });
  // engine nacelles + spinners + props
  for (const sx of [-1, 1]) {
    const x = sx * 4.4;
    b.body(loft([[Z(.19), .34, .34, .32, .15], [Z(.24), .74, .72, .64, .2], [Z(.37), .88, .82, .7, .24], [Z(.5), .78, .72, .62, .28], [Z(.62), .46, .42, .36, .34], [Z(.69), .16, .16, .16, .38]], 16).translate(x, 0, 0));
    b.body(lathe([[Z(.19) - .7, 0], [Z(.19) - .38, .34], [Z(.19) + .04, .42]], 12, [x, 0.15]), 'solid:accent');
    b.body(new THREE.TorusGeometry(0.72, 0.07, 5, 16).translate(x, 0.2, Z(.235)), 'solid:secondary');
    b.prop(V(x, 0.15, Z(.19) - 0.72), 2.15, 3, 'tractor');
    b.exhaust(V(x + sx * 0.18, 0.55, Z(.56)), 0.22, 'puff');
    b.light(V(x, 0.95, Z(.4)), 'w', .05);
  }
  // tail: big fin + rudder, tailplane + elevators
  b.fin([st(0, Z(.78), 0, 4.2, .09), st(3.6, Z(.9), 0, 1.9, .06)], { x: 0, y: .55, cant: 0, hc: .62, rudder: { s0: .08, s1: 1 }, mirror: false });
  b.tailplane([st(.4, Z(.86), .55, 2.4, .08), st(3.5, Z(.9), .55, 1.3, .06)], { hc: .64 });
  b.tip(V(-W / 2, .45, Z(.43)), V(W / 2, .45, Z(.43)));
  b.light(V(-W / 2 - .12, .45, Z(.43)), 'r', .09); b.light(V(W / 2 + .12, .45, Z(.43)), 'g', .09); b.light(V(0, 3.9, Z(.95)), 'w', .08);
}

/** Comet C-5: cropped delta racer with twin canted tails and twin afterburners. */
function comet(b) {
  const { W, L } = b, Z = (f) => (f - 0.5) * L;
  b.body(loft([
    [Z(0), .02, .02, .02, .1], [Z(.05), .16, .16, .14, .08], [Z(.14), .36, .34, .32, .05], [Z(.28), .72, .6, .5, .02], [Z(.46), .95, .74, .54, 0], [Z(.7), 1.02, .7, .54, 0], [Z(.88), .94, .6, .5, 0], [Z(1), .88, .55, .5, 0],
  ], 24));
  b.body(lathe([[Z(-.07), 0.0], [Z(-.03), .06], [Z(.0), .14]], 8, [0, .1]), 'solid:dark');
  b.glass(loft([[Z(.18), .02, .02, .02, .58], [Z(.23), .34, .4, .1, .56], [Z(.31), .5, .66, .1, .56], [Z(.42), .46, .5, .1, .58], [Z(.5), .02, .02, .02, .6]], 18));
  for (const sx of [-1, 1]) {
    b.body(loft([[Z(.32), .34, .3, .28, 0, 3], [Z(.4), .4, .36, .32, 0, 3], [Z(.58), .42, .36, .32, 0, 3], [Z(.68), .2, .2, .2, 0, 2.4]], 14).translate(sx * 1.0, -.12, 0));
    b.body(new THREE.CircleGeometry(.29, 14).rotateY(Math.PI).translate(sx * 1.0, -.12, Z(.32) - .01), 'solid:dark');
  }
  b.wingSet([st(.9, Z(.37), -.02, 8.9, .065), st(3.0, Z(.58), 0, 5.7, .05), st(W / 2, Z(.73), .04, 3.5, .04)], { hc: .74, flaps: [{ s0: .1, s1: .98, kind: 'elevon' }] });
  b.fin([st(0, Z(.68), 0, 3.6, .055), st(2.5, Z(.84), 0, 1.7, .04)], { x: .92, y: .45, cant: 0.34, hc: .64, rudder: { s0: .06, s1: 1 }, mirror: true });
  for (const sx of [-1, 1]) {
    b.body(loft([[Z(.92), .5, .42, .42, 0, 2.2], [Z(1), .46, .4, .4, 0, 2.2], [Z(1.035), .42, .36, .36, 0, 2.2]], 18).translate(sx * .56, 0, 0), 'solid:dark');
    b.exhaust(V(sx * .56, 0, Z(1.035)), .36, 'flame');
  }
  b.tip(V(-W / 2, .04, Z(.88)), V(W / 2, .04, Z(.88)));
  b.light(V(-W / 2 - .1, .05, Z(.85)), 'r', .09); b.light(V(W / 2 + .1, .05, Z(.85)), 'g', .09);
  b.light(V(.92 + 2.5 * Math.sin(.34), .45 + 2.5 * Math.cos(.34), Z(.88)), 'w', .07); b.light(V(-.92 - 2.5 * Math.sin(.34), .45 + 2.5 * Math.cos(.34), Z(.88)), 'w', .07);
}

/** Sprite S-6: open-cockpit sport biplane with a round cowl, struts and fixed gear. */
function sprite(b) {
  const { W, L } = b, Z = (f) => (f - 0.5) * L;
  b.body(loft([
    [Z(0), .46, .46, .46, 0, 2], [Z(.03), .8, .8, .78, 0], [Z(.14), .9, .9, .86, 0], [Z(.22), .8, .84, .72, .04], [Z(.4), .62, .72, .54, .1], [Z(.6), .46, .54, .42, .1], [Z(.82), .26, .3, .26, .14], [Z(.98), .07, .1, .07, .2],
  ], 22));
  b.body(new THREE.TorusGeometry(0.8, 0.1, 8, 24).translate(0, 0, Z(.03)), 'solid:accent');
  b.body(lathe([[Z(-.07), 0.0], [Z(-.03), .26], [Z(.01), .44]], 14), 'solid:accent');
  b.prop(V(0, 0, Z(0) - 0.62), 1.75, 2, 'tractor');
  // open cockpit: dark recess, windscreen, pilot
  b.body(loft([[Z(.28), .4, .1, .1, .74, 3], [Z(.5), .4, .1, .1, .78, 3]], 10), 'solid:dark');
  b.glass(loft([[Z(.25), .02, .02, .02, .84], [Z(.27), .44, .34, .04, .8], [Z(.3), .46, .3, .04, .84], [Z(.31), .02, .02, .02, .86]], 12));
  b.body(new THREE.SphereGeometry(0.3, 14, 10).translate(0, 1.0, Z(.45)), 'solid:secondary');
  b.body(new THREE.SphereGeometry(0.31, 14, 6, 0, Math.PI * 2, 0.9, 0.35).translate(0, 1.0, Z(.45)), 'solid:accent');
  b.body(loft([[Z(.45), .22, .26, .0, .62, 2.4], [Z(.5), .25, .3, 0, .62]], 8, true), 'solid:primary');
  // wings: staggered biplane, upper with ailerons
  b.wingSet([st(.15, Z(.2), 1.78, 1.95, .1), st(W / 2, Z(.22), 1.8, 1.7, .08)], { hc: .72, flaps: [{ s0: .5, s1: .98, kind: 'ail' }], cam: 0.04 });
  b.wingSet([st(.55, Z(.27), -.5, 1.75, .1), st(W / 2 - .4, Z(.29), -.45, 1.45, .08)], { hc: 1, flaps: [], cam: 0.04 });
  const R = (f) => V(0, 0, Z(f));
  for (const sx of [-1, 1]) {
    for (const [x, zf] of [[2.3, .26], [4.2, .27]]) b.tubeBody(V(sx * x, -.46, Z(zf)), V(sx * x, 1.75, Z(zf) - .1), .07, 'solid:dark');
    b.tubeBody(V(sx * 2.3, -.4, Z(.3)), V(sx * 4.2, 1.7, Z(.22)), .025, 'solid:dark'); b.tubeBody(V(sx * 4.2, -.4, Z(.3)), V(sx * 2.3, 1.7, Z(.22)), .025, 'solid:dark');
    b.tubeBody(V(sx * .5, .55, Z(.3)), V(sx * .4, 1.75, Z(.2)), .06, 'solid:dark');
    // landing gear
    b.tubeBody(V(sx * .45, -.35, Z(.28)), V(sx * .95, -1.0, Z(.24)), .06, 'solid:dark');
    b.wheel(V(sx * 1.0, -1.05, Z(.24)), .42, .2);
    b.exhaust(V(sx * .9, -.15, Z(.2)), .14, 'puff');
    b.light(V(sx * (W / 2 + .1), 1.8, Z(.23)), sx < 0 ? 'r' : 'g', .09);
  }
  b.fin([st(0, Z(.8), 0, 1.5, .06), st(1.7, Z(.9), 0, .8, .045)], { x: 0, y: .16, cant: 0, hc: .5, rudder: { s0: 0, s1: 1 }, mirror: false });
  b.tailplane([st(.2, Z(.86), .25, 1.3, .06), st(1.9, Z(.9), .25, .85, .045)], { hc: .5 });
  b.wheel(V(0, -.05, Z(.97)), .16, .1);
  b.tip(V(-W / 2, 1.8, Z(.23)), V(W / 2, 1.8, Z(.23)));
  b.light(V(0, 1.9, Z(.9)), 'w', .07);
}

export const MODELS = { falcon, wasp, manta, bulldog, comet, sprite };
