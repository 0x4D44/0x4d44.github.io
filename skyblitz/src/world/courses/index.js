// Course catalogue (lightweight metadata, no THREE) + loader. Owner: world agent.
// loadCourse(id, game) builds the visual + logical course asynchronously (yield to the browser with `await` between heavy phases
// so the loading screen animates) and resolves to a Course (see world/course.js and the design contract).
import { Course } from '../course.js';

export const COURSES = [
  { id: 'sunrise', name: 'Sunrise Archipelago', theme: 'tropical', difficulty: 1, laps: 3, lapLength: 5600, timeOfDay: 'dawn',
    blurb: 'Volcanic islands at first light: sea arches, a lighthouse loop and a sea-cave shortcut.' },
  { id: 'redrock', name: 'Redrock Rapids', theme: 'canyon', difficulty: 2, laps: 3, lapLength: 6200, timeOfDay: 'golden hour',
    blurb: 'Weave a sandstone canyon: natural arches, a spire corkscrew and a slot-canyon shortcut.' },
  { id: 'neon', name: 'Neon Skyline', theme: 'city', difficulty: 4, laps: 3, lapLength: 6600, timeOfDay: 'night',
    blurb: 'Night race between skyscrapers, through an atrium and around a tower loop.' },
  { id: 'frost', name: 'Frostpeak Aurora', theme: 'glacier', difficulty: 5, laps: 3, lapLength: 7000, timeOfDay: 'twilight',
    blurb: 'Glacier valleys under the aurora: ice arches, a frozen-waterfall loop and an ice-cave shortcut.' },
];

export async function loadCourse(id, game) {
  const def = COURSES.find((c) => c.id === id) || COURSES[0];
  const course = new Course(def, game);
  await course.build?.(game);
  return course;
}
