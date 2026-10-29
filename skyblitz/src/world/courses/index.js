// Course catalogue (lightweight metadata, no meshes) + loader + previewCourse. Owner: world agent.
// loadCourse(id, game) builds the logic + visuals asynchronously (yielding between heavy phases so the loading screen animates, and emitting
// game:loadProgress {progress,label}) and resolves to a Course (see world/course.js and the design contract).
import { Course } from '../course.js';
import { CourseLayout } from '../layout.js';
import { sunriseDef } from './sunrise.js';
import { redrockDef } from './redrock.js';
import { neonDef } from './neon.js';
import { frostDef } from './frost.js';

export const COURSES = [
  { id: 'sunrise', name: 'Sunrise Archipelago', theme: 'tropical', difficulty: 1, laps: 3, lapLength: 6100, timeOfDay: 'dawn',
    blurb: 'Volcanic islands at first light: sea arches, a lighthouse loop and a sea-cave shortcut.' },
  { id: 'redrock', name: 'Redrock Rapids', theme: 'canyon', difficulty: 2, laps: 3, lapLength: 6930, timeOfDay: 'golden hour',
    blurb: 'Weave a sandstone canyon: natural arches, a spire corkscrew and a slot-canyon shortcut.' },
  { id: 'neon', name: 'Neon Skyline', theme: 'city', difficulty: 4, laps: 3, lapLength: 6600, timeOfDay: 'night',
    blurb: 'Night race between skyscrapers, through an atrium and around a tower loop.' },
  { id: 'frost', name: 'Frostpeak Aurora', theme: 'glacier', difficulty: 5, laps: 3, lapLength: 7040, timeOfDay: 'twilight',
    blurb: 'Glacier valleys under the aurora: ice arches, a frozen-waterfall loop and an ice-cave shortcut.' },
];

// Pure definitions. Courses without a real definition yet fall back to the sunrise layout under their own metadata.
const DEFS = { sunrise: sunriseDef, redrock: redrockDef, neon: neonDef, frost: frostDef };
const SCENERY = { sunrise: () => import('./sunrise-scenery.js'), redrock: () => import('./redrock-scenery.js'), neon: () => import('./neon-scenery.js'), frost: () => import('./frost-scenery.js') };

export function courseDef(id) {
  const meta = COURSES.find((c) => c.id === id) || COURSES[0];
  const data = DEFS[meta.id] || DEFS.sunrise;
  return { ...data, ...meta, laps: meta.laps, __data: data };
}

export async function loadCourse(id, game) {
  const def = courseDef(id);
  const progress = (p, label) => game?.events?.emit('game:loadProgress', { progress: p, label });
  progress(0.02, 'Surveying the course');
  const course = new Course(def, game);
  await course.build(game, { progress, scenery: SCENERY[DEFS[def.id] ? def.id : 'sunrise'] });
  progress(1, 'Ready');
  return course;
}

const _cache = new Map();
/** Cheap track map for menus: no meshes. -> { pts:[x,z,...], branches:[{pts}], bounds:{minX,maxX,minZ,maxZ} } */
export function previewCourse(id) {
  let r = _cache.get(id);
  if (!r) {
    const lay = new CourseLayout(courseDef(id), { ds: 6 });
    r = { pts: lay.minimap.pts, branches: lay.minimap.branches, bounds: lay.minimap.bounds, length: lay.length };
    _cache.set(id, r);
  }
  return r;
}
