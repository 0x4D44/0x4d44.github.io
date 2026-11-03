// THE WATER-SPORTS LIBRARY, AS THE WORLD NEEDS IT BEFORE IT IS LOADED (A5, round 7, phase 2b).
// The Codex library (assets/models/watersports/*.glb, manifest.watersports.json: 41 designs, each with a `_lod1` twin: the pier kit, the raft, the buoys, the boats) is NOT in the boot
// manifest: a later sector loads it once the page is playable (waterprops.js). The plan of the sea (beachsea.js) and its colliders, though, are part of the world from the first frame and of
// every Node test, so the sizes and the few anchors they stand on are kept here. tests/world-waterlib.test.mjs holds these tables to the manifest and to anchors.json: a library that
// changes size or an anchor that moves fails there, not in a picture.
//
//   sizeOf('pier_deck') -> [3, 0.22, 2]     (width, height, depth in metres; +Z is the front, yaw 0 faces +Z = south = the sea)
//   assetKey('pier_deck') -> 'watersports_pier_deck'   (the name in ctx.assets; the library's own roots)
//
// Origins (the manifest's `origin`): a grounded piece stands on y = 0, a floating one has its waterline at y = 0 (the keel is below it), so a floater is placed at the sea's height without
// its draft. FLOAT holds the three numbers the library suggests for each floater (the draft below the waterline, the bob in metres and the rock in degrees).
export const WATER_MANIFESTS = Object.freeze(['manifest.watersports.json']);
export const WATER_TAG = 'watersports';       // the manifest tag of the library's near designs (their low twins carry the same tag and no `lod1`, which is how the Clutter tells them apart)
export const WATER_ID = 'watersports';        // the group, the system and the ctx.world entry of the fixed pieces
export const FLOAT_ID = 'seafloat';           // the same of the pieces that ride the swell
export const assetKey = (name) => 'watersports_' + name;

export const SIZE = Object.freeze({
  pier_deck: [3, 0.22, 2], pier_pile: [0.32, 3.6, 0.32], pier_crossbrace: [2.4, 1.5, 0.16], pier_handrail: [2, 0.98, 0.14], pier_post: [0.14, 0.98, 0.14], mooring_cleat: [0.36, 0.16, 0.14],
  pier_ladder: [0.66, 3, 0.38], rod_holder: [0.13, 0.43, 0.16], pier_lamp: [0.66, 2.85, 0.66], bait_crate: [0.58, 0.34, 0.42], pier_end_platform: [4, 1.2, 3], buoy: [0.5, 0.53, 0.5],
  bell_buoy: [1, 1.6, 1], swimline_segment: [3.024, 0.14, 0.18], diving_raft: [3, 1.65, 3], lifebuoy: [0.76, 0.14, 0.76], lancha: [2.1, 1.6, 7], rowing_boat: [1.36, 0.72, 3.6],
  wooden_boat_maria_del_mar: [1.8, 0.9, 5.5], wooden_boat_la_esperanza: [1.8, 0.9, 5.5], wooden_boat_san_pedro: [1.8, 0.9, 5.5], wooden_boat_brisa: [1.8, 0.9, 5.5],
  oar: [0.18, 0.065, 2.1], anchor: [0.56, 0.67, 0.28], rope_coil: [0.68, 0.09, 0.68], sunken_moped: [0.62, 1.1, 1.72], sunken_anchor_tyre: [1.3, 0.67, 0.8],
});

/** The designs that float (anchors.json: `floating: true`), with the library's draft, bob and rock. */
export const FLOAT = Object.freeze({
  buoy: { draft: 0.15, bob: 0.045, rock: 6 }, bell_buoy: { draft: 0.28, bob: 0.05, rock: 5 }, swimline_segment: { draft: 0.07, bob: 0.025, rock: 2 }, diving_raft: { draft: 0.9, bob: 0.035, rock: 2 },
  lifebuoy: { draft: 0.055, bob: 0.04, rock: 5 }, lancha: { draft: 0.38, bob: 0.035, rock: 3 }, rowing_boat: { draft: 0.24, bob: 0.04, rock: 4 },
});

/** The anchors the plan uses (anchors.json, in the design's own frame: x right, y up, z forward). */
export const ANCHOR = Object.freeze({
  lancha: { moorBow: [0, 0.62, 3.18], moorStern: [0.82, 0.55, -2.78] },
  wooden_boat_maria_del_mar: { moorBow: [0, 0.86, 2.5] },
  pier_lamp: { light: [0, 2.6, 0.02] },
  diving_raft: { stand: [0, 0.35, 0], ladder: { start: [0, -0.85, 1.45], end: [0, 0.35, 1.14] } },
  pier_end_platform: { stand: [0, 0.22, 0], ladder: { start: [0, -1, 1.62], end: [0, 0.22, 1.26] }, joinStart: [0, 0.22, -1.5] },
  pier_ladder: { ladder: { start: [0, 0.15, 0.18], end: [0, 2.45, -0.16] } },
  rod_holder: { rodSocket: [0, 0.405, 0.045] },
  pier_post: { railTop: [0, 0.91, 0] },
  pier_deck: { stand: [0, 0.22, 0] },
  pier_pile: { deckSeat: [0, 3.6, 0] },
  pier_crossbrace: { joinStart: [-1.16, 0.055, 0], joinEnd: [1.16, 1.445, 0] },
  rowing_boat: { oarlocks: [[-0.67, 0.43, -0.25], [0.67, 0.43, -0.25]] },
});

export const sizeOf = (name) => SIZE[name.replace(/^watersports_/, '')];
