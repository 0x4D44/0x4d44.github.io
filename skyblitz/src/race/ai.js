// STUB AI pilot (follows the course with a lookahead point). The race agent REPLACES this with the real behaviour
// (racing lines, speed management, item use, dodging, shortcuts, personalities) and keeps the factory signature:
//   createAI(race, racer, pilot, difficulty) -> { think(dt, outControls) -> outControls }
import * as THREE from 'three';
import { pilotSteer } from '../flight/pilot.js';

export function createAI(race, racer, pilot, difficulty) {
  const target = new THREE.Vector3(), f = {};
  return {
    think(dt, out) {
      race.course.frameAt(racer.s + 140, f); target.copy(f.pos);
      pilotSteer(racer.flight, target, out, { aggressiveness: 1 });
      out.boost = false; out.fire = false; out.item = false; out.itemBack = false; out.barrel = 0; out.airbrake = 0;
      return out;
    },
  };
}
