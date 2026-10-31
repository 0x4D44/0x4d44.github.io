// Which materials never cast into the sun's shadow map (owner: A1). Pure data, tested in Node (tests/core-shadowpolicy.test.mjs).
//
// three.js draws into a shadow map, by default, only the faces that look AWAY from the light (a front-sided material's shadowSide is BackSide). A floor or a screed slab
// is a quad that looks up at the sun, so it writes nothing into the map: all it costs is its draw call and its vertex work, in a pass that is already ~40 % of the
// triangle budget. Switching these off took 25 to 27 draw calls (at spawn) and 34 k triangles out of the shadow pass and changed no pixel beyond the render's own noise.
//
// How that was measured (.scratch/a1/shadow_exp2.mjs): one boot, the same state rendered twice (`base` against `base2` = the noise floor: a 320 x 180 downsample, 0 or 1
// pixels differ by more than 24 / 255), then once per variant with `castShadow` off for a whole family. 79 captures: street, slope, plaza, door and aerial views at 6.4, 7.2, 12, 17.2
// and 17.7 h (sun 3 to 71 degrees) and room views at 10 and 13 h. Pixels that differ by more than 24 / 255 (noise: 0 or 1; the worst floor capture: 2):
//   floors + screed          2 at worst     -> off (this list)
//   terrain tiles            2 at worst     -> off, by GROUP (ground_dirt also makes the earth banks of walls.js and hill.js, which stay; the tiles are about 28 % of the
//                                              triangles the sun's pass draws at spawn and in the plazas)
//   ceilings                 31 762         (a room without its ceiling is lit by the sun: the ceiling's UNDERSIDE is the face that looks away, not the roof above it)
//   walls                     2 077         (the shade of every street)
//   glass                       263         window frames   338 at noon (their bars on the sill and the wall)
//   roofs (awnings, stalls)     174         rails and grilles  65 (the grille's pattern on a room floor)
//   a 70 m shadow window (half 35): 360 in the aerial views, 14 at spawn at 7.2 h -> kept at 100 m; a shorter shadowDist saved no call at all (a merged chunk is 128 m wide: its
//   sphere touches the frustum whatever the depth)
// So only what is measured safe is here. A new entry needs the same measurement, and the test pins what must stay on.

/** Base material keys (no `#hex` tint suffix) whose meshes are made with castShadow = false. */
export const NO_CAST = new Set([
  'cement_screed', 'tile_ceramic_checker',                                            // engine/matdefs.js: the screed and checker floors of the shells (arch/finish.js)
  'floor_tile_checker', 'floor_tile_terracotta', 'floor_tile_ceramic', 'floor_cement', 'floor_cement_red',
  'floor_pine', 'floor_laminate', 'floor_vinyl', 'floor_concrete_raw',                // interiors/matdefs.js
]);

/** Batcher groups whose meshes never cast: the 64 terrain tiles of world/terrain.js (`world.terrain.<i>.<j>`). The far terrain, streets and plazas already ask for cast:false themselves. */
export const NO_CAST_GROUPS = /^world\.terrain\.\d+\.\d+$/;
export const groupCasts = (id) => !NO_CAST_GROUPS.test(String(id ?? ''));

/** `plaster_a#9fc4e8` -> `plaster_a`: a tinted variant follows its material. */
export const baseKey = (key) => { const s = String(key ?? ''), i = s.indexOf('#'); return i < 0 ? s : s.slice(0, i); };

/** Whether a mesh made of material `key` may cast into the sun's shadow map (an unknown key does: the safe default). */
export const castsShadow = (key) => !NO_CAST.has(baseKey(key));
