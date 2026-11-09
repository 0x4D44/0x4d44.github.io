"""Mutation check for the three.js trains (web/src/train.ts, train-parts.ts, train-nose.ts, livery.ts) against
web/tests/train.test.ts and web/tests/train-detail.test.ts.
usage: python3 -I -u tools/mutation/trainweb.py <kings-cross-src> <scratch dir> [mutation-name substring ...]
The tests run in a copy with the real node_modules linked in; the unmodified copy must pass first and a
load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve(); scratch = Path(sys.argv[2]).resolve()
F = "web/src/train.ts"
P = "web/src/train-parts.ts"
N = "web/src/train-nose.ts"
L = "web/src/livery.ts"
TESTS = ["web/tests/train.test.ts", "web/tests/train-detail.test.ts"]
M = [
    # --- the train: pantograph, bogies, doors, roof covers, windows -----------------------------------------
    ("pantograph at the start of its span", "p.position.set(0, spec.crown, (car.pantograph[0] + car.pantograph[1]) / 2);", "p.position.set(0, spec.crown, car.pantograph[0]);"),
    ("pantograph on the floor", "p.position.set(0, spec.crown, (car.pantograph[0]", "p.position.set(0, 0, (car.pantograph[0]"),
    ("no pantograph", "  if (car.pantograph) {\n    const len", "  if (false) {\n    const len"),
    ("pantograph arm rises above the published height", "Math.min(0.14, top - 0.035)", "0.14", P),
    ("EMU pantograph taller than the roof allows", "    pantographTop: 0.14,", "    pantographTop: 0.3,"),
    ("bogie half a metre off", "b.position.set(0, 0, z);", "b.position.set(0, 0, z + 0.5);"),
    ("every bogie a motor bogie", "const motor = (car.motor as readonly boolean[])[k] as boolean;", "const motor = true;"),
    ("EMU wheels the Azuma's size", "const radius = fig ? fig.wheelDiameter.value / 2 : FIGURES.wheelDiameter.value / 2;", "const radius = FIGURES.wheelDiameter.value / 2;"),
    ("EMU wheelbase the Azuma's", "const wheelbase = fig ? (motor ? fig.wheelbaseMotor.value : fig.wheelbaseTrailer.value) : FIGURES.bogieWheelbase.value;", "const wheelbase = FIGURES.bogieWheelbase.value;"),
    ("one door per side", "for (const sx of [-1, 1]) {\n      const dw = spec.doorWidth;", "for (const sx of [1]) {\n      const dw = spec.doorWidth;"),
    ("door marker inside the body", "marker.position.set(x(half), (dy0 + dy1) / 2, z);", "marker.position.set(x(half - 0.5), (dy0 + dy1) / 2, z);"),
    ("standing train not turned", "group.rotation.y = pose.rotationY;", "group.rotation.y = 0;"),
    ("standing train at the stop, not the nose", "group.position.set(pose.nose[0], 0, pose.nose[1]);", "group.position.set(stop.x, 0, stop.z);"),
    ("roof covers 0.1 m too high", "const yt = spec.crown + spec.coverHeight;", "const yt = spec.crown + spec.coverHeight + 0.1;"),
    ("roof covers at the crown", "const yt = spec.crown + spec.coverHeight;", "const yt = spec.crown;"),
    ("half as many windows", "const n = Math.max(1, Math.round((to - from) / 2.0));", "const n = Math.max(1, Math.round((to - from) / 4.0));"),
    ("windows 0.6 m shorter", "windows.push([from + k * pitch + 0.2, from + (k + 1) * pitch - 0.2]);", "windows.push([from + k * pitch + 0.5, from + (k + 1) * pitch - 0.5]);"),
    ("EMU windows run onto the doors", "windows.push(...windowsIn((doors[0] as number) + dw / 2 + 0.35,", "windows.push(...windowsIn((doors[0] as number) + dw / 2 - 0.35,"),
    ("EMU windows run off the car", "const innerZone: [number, number] = [(doors[1] as number) + dw / 2 + 0.35, L - END_GAP - 0.45];", "const innerZone: [number, number] = [(doors[1] as number) + dw / 2 + 0.35, L - END_GAP + 0.45];"),
    ("Electrostar one car wider than the figure", "    half: fig.bodyWidth.value / 2,", "    half: fig.bodyWidth.value / 2.2,"),
    # --- the gap, the gangways and the couplers ------------------------------------------------------------
    ("end gap 0.2 m (the live layer clears 0.35)", "  endGap: 0.35,", "  endGap: 0.2,"),
    ("nose stands in the car's own length no more", "export const NOSE_RECESS = 0.01;", "export const NOSE_RECESS = 0;"),
    ("bellows seated in the end wall", "const BELLOWS_SEAT = 0.002;", "const BELLOWS_SEAT = 0;"),
    ("no gangway marker", "marker.name = 'gangway';", "marker.name = 'gangwayx';"),
    ("gangway bellows 10 cm deep", "depth: END_GAP }", "depth: 0.1 }"),
    ("gangway only a metre wide", "  gangwayWidth: 2.3,", "  gangwayWidth: 1.0,"),
    ("gangway 3.5 m tall", "  gangwayHeight: 2.0,", "  gangwayHeight: 3.5,"),
    ("couplers at the wrong height", "cm.position.set(0, ASSUMED.couplerHeight, (zWall + zOut) / 2);", "cm.position.set(0, 0.4, (zWall + zOut) / 2);"),
    ("no coupler cover at the train's ends", "      group.add(cover);\n    }\n    if (interiorCab || !covered) {", "    }\n    if (interiorCab || !covered) {"),
    ("a coupler cover at every cab", "    } else if (covered) {\n      // the coupler cover", "    } else if (true) {\n      // the coupler cover"),
    ("the cover hides nothing", "hidesCoupler: true }", "hidesCoupler: false }"),
    ("inner noses not found", "const interiorCab = cabIsInterior(car, layout);", "const interiorCab = false;"),
    ("a hidden coupler drawn as a gangway coupler", "m.userData = interiorCab ? { end: car.cab, nose: true } :", "m.userData = interiorCab ? { end: car.cab, nose: false } :"),
    ("coupler cover seam on the loft vertex (zero-area fan)", "if (inside(a) !== inside(b) && a[axis] !== value && b[axis] !== value) {", "if (inside(a) !== inside(b)) {"),
    # --- the nose and its glass -------------------------------------------------------------------------------
    ("nose rings far apart", "const steps = 6;", "const steps = 2;", N),
    ("face not rounded", "    filletLoss: 0.26,", "    filletLoss: 0,"),
    ("fillet a parabola, not a quarter circle (meets the sides at a slope)", "return 1 - spec.filletLoss + spec.filletLoss * Math.sqrt(Math.max(0, 1 - t * t));", "return 1 - spec.filletLoss + spec.filletLoss * (1 - t);", N),
    ("bonnet knot overshoots the roof line", "      { s: 2.8, top: noseY(3.42), ws: 0.9, bottom: 0.9 },", "      { s: 2.8, top: noseY(3.9), ws: 0.9, bottom: 0.9 },"),
    ("nose tip as wide as the body", "      { s: 0, top: noseY(1.9), ws: 0.5, bottom: 0.8 },", "      { s: 0, top: noseY(1.9), ws: 1.0, bottom: 0.8 },"),
    ("face stands 0.2 m inside the end of the train", "const tip = car.cab ? (interiorCab ? END_GAP : faceSetback(spec.family)) : END_GAP;", "const tip = car.cab ? (interiorCab ? END_GAP : 0.2) : END_GAP;"),
    # the section morph (the Azuma's spec is the first to carry each of these numbers)
    ("section morph too slow: the nose never reaches the car's section", "    roundLen: 4.3,", "    roundLen: 6.5,"),
    ("section morph: nose tip as tall as the roof", "      { s: 0, top: noseY(1.9), ws: 0.5, bottom: 0.8 },", "      { s: 0, top: noseY(3.9), ws: 0.5, bottom: 0.8 },"),
    ("section morph: nose tip wider than the body", "      { s: 0, top: noseY(1.9), ws: 0.5, bottom: 0.8 },", "      { s: 0, top: noseY(1.9), ws: 1.4, bottom: 0.8 },"),
    ("section morph: the tip section a half ellipse, not an egg", "    widest: 0.42,", "    widest: 0,"),
    ("cab glass matt and bright", "metalness: 0.85, roughness: 0.14,", "metalness: 0.1, roughness: 0.8,", "web/src/train-geom.ts"),
    ("cab glass pale", "color: 0x0b1016, metalness", "color: 0xd0d8e0, metalness", "web/src/train-geom.ts"),
    ("a second shell material for the cab cars", "shellMaterial(ctx.livery, spec.nose.length));\n  shellMesh.name", "shellMaterial(ctx.livery, noseLen));\n  shellMesh.name"),
    ("car groups renamed", "group.name = `car-${car.index}`;", "group.name = `car_${car.index}`;"),
    ("bogie groups renamed", "b.name = `bogie-${car.index}-${k}`;", "b.name = `bogie_${car.index}_${k}`;"),
    ("lamps on one side", "m.position.set(sx * xh, yh, Z(tip));", "m.position.set(xh, yh, Z(tip));"),
    ("lamps in the windscreen", "const yh = r0.bottom + lamps.y * (r0.top - r0.bottom);", "const yh = r0.bottom + 0.95 * (r0.top - r0.bottom);"),
    ("lamps outside the face", "const xh = xAtY(tipHalf, yh) * lamps.x;", "const xh = xAtY(tipHalf, yh) * 1.2;"),
    ("windscreen sunk into the nose", "patch(0, glass, null, 0.02, screen.pillar ?? 0);", "patch(0, glass, null, -0.02, screen.pillar ?? 0);"),
    ("windscreen a narrow slit", "const hw0 = screen.fraction * ringHalf + margin;", "const hw0 = screen.fraction * 0.3 * ringHalf + margin;"),
    ("windscreen frame allowed out to the whole half-width (a wedge down the cheek)", "const FRAME_REACH = 0.91;", "const FRAME_REACH = 1;"),
    ("windscreen frame reach 0.95 of the half-width", "const FRAME_REACH = 0.91;", "const FRAME_REACH = 0.95;"),
    ("windscreen frame reach cap ignored", "const reach = FRAME_REACH * ringHalf;", "const reach = 2 * ringHalf;"),
    ("windscreen frame reach measured from the glass's own edge", "const reach = FRAME_REACH * ringHalf;", "const reach = FRAME_REACH * screen.fraction * ringHalf;"),
    ("the 180's windscreen in one pane", "patch(0, glass, null, 0.02, screen.pillar ?? 0);", "patch(0, glass, null, 0.02, 0);"),
    ("the 180's centre post 20 cm wide", "const inner = Math.min(post / 2, hw * 0.5);", "const inner = Math.min(post, hw * 0.5);"),
    ("every windscreen in two panes", "patch(0, glass, null, 0.02, screen.pillar ?? 0);", "patch(0, glass, null, 0.02, 0.1);"),
    ("the 180's nose as short as the 700's", "  const length = 2.6;", "  const length = 1.7;"),
    ("the 180's nose as high as the 700's 0.9 m back (a steeper windscreen)", "{ s: 0.9, top: 2.95, ws: 0.975, bottom: 0.82 },", "{ s: 0.9, top: 3.3, ws: 0.975, bottom: 0.82 },"),
    ("the 180's face as narrow as the first egg", "{ s: 0, top: 2.4, ws: 0.92, bottom: 0.55 },", "{ s: 0, top: 2.4, ws: 0.7, bottom: 0.55 },"),
    ("the 180's face rounded away (a deep fillet loss)", "      fillet: 0.28,\n      filletLoss: 0.18,", "      fillet: 0.28,\n      filletLoss: 0.35,"),
    ("the 717's and 700's face an egg 1.8 m wide", "{ s: 0, top: 2.1, ws: 0.92, bottom: 0.6 },", "{ s: 0, top: 2.1, ws: 0.8, bottom: 0.6 },"),
    ("the 717's and 700's face rounded away (a deep fillet loss)", "      fillet: 0.24,\n      filletLoss: 0.18,", "      fillet: 0.24,\n      filletLoss: 0.35,"),
    ("the 387's face an egg 1.8 m wide", "{ s: 0, top: 2.0, ws: 0.88, bottom: 0.55 },", "{ s: 0, top: 2.0, ws: 0.7, bottom: 0.55 },"),
    ("the 387's face rounded away (a deep fillet loss)", "      fillet: 0.26,\n      filletLoss: 0.18,", "      fillet: 0.26,\n      filletLoss: 0.35,"),
    ("the 717's and 700's face too sharp-edged for the loft", "      fillet: 0.24,\n      filletLoss: 0.18,", "      fillet: 0.24,\n      filletLoss: 0.1,"),
    ("the 387's face too sharp-edged for the loft", "      fillet: 0.26,\n      filletLoss: 0.18,", "      fillet: 0.26,\n      filletLoss: 0.1,"),
    ("the 180's face too sharp-edged for the loft", "      fillet: 0.28,\n      filletLoss: 0.18,", "      fillet: 0.28,\n      filletLoss: 0.08,"),
    ("the 180 given no centre post","screen: { s0: 0.32, s1: 2.05, fraction: 0.88, topRadius: 0.35, bottomRadius: 0.2, pillar: 0.1 },", "screen: { s0: 0.32, s1: 2.05, fraction: 0.88, topRadius: 0.35, bottomRadius: 0.2 },"),
    ("the 180's centre post 6 cm wide", "topRadius: 0.35, bottomRadius: 0.2, pillar: 0.1 },", "topRadius: 0.35, bottomRadius: 0.2, pillar: 0.06 },"),
    ("windscreen a hand's breadth tall", "const s = lerp(screen.s0 - margin, screen.s1 + margin, 0.5 - 0.5 * Math.cos(Math.PI * v));", "const s = lerp(screen.s0 - margin, screen.s0 + 0.3 + margin, 0.5 - 0.5 * Math.cos(Math.PI * v));"),
    ("windscreen normals from the grid, not the nose", "return unit([-(heightAt(p[0] + hx, s) - heightAt(p[0] - hx, s)) / (2 * hx), 1, -(heightAt(p[0], s + hs) - heightAt(p[0], s - hs)) / (2 * hs)]);", "return unit([0, 1, 1]);"),
    ("no cab side windows", "for (const side of [-1, 1]) {\n      const rows = 8;", "for (const side of []) {\n      const rows = 8;"),
    ("cab glass in the body material", "const m = new THREE.Mesh(glass.build(), glassMaterial());", "const m = new THREE.Mesh(glass.build(), plain());"),
    # --- bogies ------------------------------------------------------------------------------------------------
    ("wheels on a narrower track", "w.position.set((sx * track) / 2, radius, az);", "w.position.set((sx * track) / 3, radius, az);", P),
    ("wheels floating", "w.position.set((sx * track) / 2, radius, az);", "w.position.set((sx * track) / 2, radius * 1.1, az);", P),
    ("axle markers twice as far apart", "const { radius, wheelbase: wb, track } = spec;\n  for (const az of [-wb / 2, wb / 2]) {", "const { radius, wheelbase: wb, track } = spec;\n  for (const az of [-wb, wb]) {", P),
    ("bogie geometry built for every bogie", "  if (!geometry) {", "  if (true) {", P),
    ("trailer bogie shares the motor bogie's geometry", "const key = `${radius}/${wb}/${track}/${spec.motor}/${spec.diesel === true}`;", "const key = `${radius}/${wb}/${track}/${spec.diesel === true}`;", P),
    ("no traction motors", "  } else if (motor) {\n    // a traction motor", "  } else if (false) {\n    // a traction motor", P),
    ("no brake discs", "for (const sx of [-1, 1]) cylinder(soup, 'x', [sx * 0.3, r, az], DISC_RADIUS, DISC_THICKNESS, 16, disc);", "", P),
    ("brake discs the size of the axle", "export const DISC_RADIUS = 0.29;", "export const DISC_RADIUS = 0.07;", P),
    ("no flanges", "cylinder(soup, 'x', [sx * (half - WHEEL_WIDTH / 2 - FLANGE_WIDTH / 2), r, az], r + FLANGE_HEIGHT, FLANGE_WIDTH, 20, steel);", "", P),
    ("flanges 1 cm", "export const FLANGE_HEIGHT = 0.028;", "export const FLANGE_HEIGHT = 0.01;", P),
    ("air springs left out", "for (const sx of [-1, 1]) for (const z of [-0.45, 0.45]) {\n    const g = new THREE.CylinderGeometry(0.14, 0.15, 0.2, 8, 1, true);", "for (const sx of []) for (const z of [-0.45, 0.45]) {\n    const g = new THREE.CylinderGeometry(0.14, 0.15, 0.2, 8, 1, true);", P),
    # --- lettering and liveries ------------------------------------------------------------------------------
    ("lettering reads backwards", "const rightIsPlusZ = sx < 0;", "const rightIsPlusZ = sx > 0;"),
    ("lettering inside the shell", "const x = sx * (W + 0.004);", "const x = sx * (W - 0.02);"),
    ("lettering on one side only", "for (const sx of [-1, 1]) {\n    const x = sx * (W + 0.004);", "for (const sx of [-1]) {\n    const x = sx * (W + 0.004);"),
    ("side texture half resolution", "export const TEX_W = 2560;", "export const TEX_W = 1280;", L),
    ("lettering atlas half resolution", "export const ROW_H = 128;", "export const ROW_H = 64;", L),
    ("LNER sweep painted blue", "swoosh: RED,", "swoosh: 0x1020c8,", L),
    ("LNER body grey", "body: 0xf2f2ee,", "body: 0x555555,", L),
    ("LNER nose front not yellow", "noseFront: 0xf0c000,", "noseFront: 0x203080,", L),
    ("Lumo body red", "body: 0x1b4fd8,", "body: 0xd81b1b,", L),
    ("Hull Trains body red", "body: 0x16305e,", "body: 0xd81b1b,", L),
    ("Great Northern body black", "body: 0xc9cdd3,", "body: 0x101010,", L),
    ("LNER marked a placeholder again", "basis: 'colour names sourced (Kato, Hornby, gbtrains.uk);", "basis: 'PLACEHOLDER colour names sourced (Kato, Hornby, gbtrains.uk);", L),
    ("LNER cites no source", "    sources: [\n      'Kato and Hornby product descriptions of the Class 800 (LNER): \"red, white and black\"',\n      'gbtrains.uk/stock/800: a red sweep, a black window surround, a silver crescent, a red lower nose and a yellow nose front',\n    ],", "    sources: [],", L),
    ("Lumo cites a name, not a source", "      'Hornby R30102 product page: \"resplendent in a vivid blue Lumo \\'Net-Zero Champion\\' livery\"',", "      'Hornby',", L),
    ("Hull Trains door colour no longer flagged unverified", "door colour (magenta) from a single unopened snippet", "door colour (magenta) sourced", L),
    ("Hull Trains marked a placeholder again", "basis: 'dark blue body and dark grey/black nose cone sourced", "basis: 'PLACEHOLDER dark blue body and dark grey/black nose cone sourced", L),
    ("Hull Trains shades no longer called approximate", "shades, band colours and town order approximate", "shades, band colours and town order exact", L),
    ("Great Northern guesses no longer flagged", "from two photographs; every shade approximate", "from two photographs; every shade exact", L),
    ("Great Northern cab front dark again", "    noseFront: 0xd9dce1,\n    noseBand: 0x2f3844,\n    noseCone: null,", "    noseFront: 0x2f3844,\n    noseBand: 0x2f3844,\n    noseCone: null,", L),
    ("Great Northern glass surround pale", "    noseFront: 0xd9dce1,\n    noseBand: 0x2f3844,\n    noseCone: null,", "    noseFront: 0xd9dce1,\n    noseBand: 0xd9dce1,\n    noseCone: null,", L),
    ("Great Northern given a nose cone again", "    noseFront: 0xd9dce1,\n    noseBand: 0x2f3844,\n    noseCone: null,", "    noseFront: 0xd9dce1,\n    noseBand: 0x2f3844,\n    noseCone: 0x2f3844,", L),
    ("Great Northern cites only one photograph of its cab front", "and \"Class 387 at Luton\" (a white front with a yellow panel)'", "and \"Class 387\" (a white front with a yellow panel)'", L),
    ("the Hull Trains cone over the whole nose", "rect(0, Math.min(nose, def.noseConeLength ?? nose), TEX_Y0, TEX_Y1);", "rect(0, nose, TEX_Y0, TEX_Y1);", L),
    ("the Hull Trains cone longer than a short nose", "rect(0, Math.min(nose, def.noseConeLength ?? nose), TEX_Y0, TEX_Y1);", "rect(0, def.noseConeLength ?? nose, TEX_Y0, TEX_Y1);", L),
    ("the Hull Trains cone starts behind the tip", "rect(0, Math.min(nose, def.noseConeLength ?? nose), TEX_Y0, TEX_Y1);", "rect(0.5, Math.min(nose, def.noseConeLength ?? nose), TEX_Y0, TEX_Y1);", L),
    ("the Hull Trains cone 2.6 m long", "    noseConeLength: 1.6,", "    noseConeLength: 2.6,", L),
    ("the Hull Trains cone no longer limited", "    noseConeLength: 1.6,", "", L),
    # --- the finish of a cab front: lamps, bezel, warning panel, wipers, display, front door -----------------------------
    ("round lamps drawn as a rounded rectangle", "const outline = lamps.shape === 'round' ? ellipse(cx, cy, w / 2, h / 2) :", "const outline = false ? ellipse(cx, cy, w / 2, h / 2) :"),
    ("rectangular lamps drawn as ellipses", "const outline = lamps.shape === 'round' ?", "const outline = true ?"),
    ("lenses 2 mm too far out of the face", "lens(cx, yh, lamps.head[0], lamps.head[1], 0.009, col(0xfff3c4));", "lens(cx, yh, lamps.head[0], lamps.head[1], 0.011, col(0xfff3c4));"),
    ("tail lamp level with the headlight", "const ty = yh + lamps.tailAt[1];", "const ty = yh;"),
    ("tail lamp lit white", "lens(tx, ty, lamps.tail[0], lamps.tail[1], 0.009, col(0xd02020));", "lens(tx, ty, lamps.tail[0], lamps.tail[1], 0.009, col(0xfff3c4));"),
    ("bezel 1 cm too wide", "const b = lamps.bezel;", "const b = lamps.bezel + 0.01;"),
    ("no bezel round the lamps", "if (lamps.bezel > 0) {", "if (false) {"),
    ("the 700's tail lamp under the strip, as the 387's", "tail: [0.07, 0.07], tailAt: [0.14, 0], bezel: 0.03 }", "tail: [0.07, 0.07], tailAt: [0, -0.1], bezel: 0.03 }"),
    ("the 700's lamps in the middle of its face", "lamps: { shape: 'rect', y: 0.55, x: 0.77, head: [0.2, 0.06],", "lamps: { shape: 'rect', y: 0.55, x: 0.3, head: [0.2, 0.06],"),
    ("the 180's lamps square, not round pods", "lamps: { shape: 'round', y: 0.45, x: 0.8, head: [0.17, 0.17],", "lamps: { shape: 'rect', y: 0.45, x: 0.8, head: [0.17, 0.17],"),
    ("the 180's lamp pods near black, like the 700's bezel", "bezel: 0.1, bezelColour: 0x3c4149 },", "bezel: 0.1 },"),
    ("the 180's lamp pods near black, as every bezel is", "col(lamps.bezelColour ?? BEZEL)", "col(BEZEL)"),
    ("the lamp bezel a different black", "const BEZEL = 0x15171a;", "const BEZEL = 0x15171b;"),
    ("the Azuma given a bezel", "tail: [0.14, 0.07], tailAt: [0, -0.14], bezel: 0 },", "tail: [0.14, 0.07], tailAt: [0, -0.14], bezel: 0.03 },"),
    ("warning panel on the 717", "      door: { width: 0.6, height: 0.62 },\n      warning: null,", "      door: { width: 0.6, height: 0.62 },\n      warning: YELLOW,"),
    ("no warning panel on the 700", "    warning: YELLOW,\n    warningWrap: 0.2,", "    warning: null,\n    warningWrap: 0.2,"),
    ("no warning panel on the 180", "      warning: YELLOW,\n      warningWrap: 0.3,", "      warning: null,\n      warningWrap: 0.3,"),
    ("warning panel only on the face, not wrapped back along the nose", "else if (front.warning !== null && inWarning && kmin >= kW) colour = front.warning;", "else if (false) colour = def.roof;"),
    ("warning panel wrapped back to the livery's front band, not its own length", "const warnEnd = snap(front.warningWrap ?? FRONT_ZONE);", "const warnEnd = snap(FRONT_ZONE);"),
    ("warning panel wrapped a whole nose back", "const warnEnd = snap(front.warningWrap ?? FRONT_ZONE);", "const warnEnd = snap(front.warningWrap ?? spec.nose.length);"),
    ("warning panel the width of the face on every family", "(front.warningWidth ?? 1) * widest + 1e-9) kW++;", "1 * widest + 1e-9) kW++;"),
    ("warning panel the 700's width on every family", "(front.warningWidth ?? 1) * widest + 1e-9) kW++;", "(front.warningWidth ?? 0.7) * widest + 1e-9) kW++;"),
    ("warning panel's side edge reaches the face's foot (down the cover)", "    kW = J0;\n", "    kW = 1;\n"),
    ("the 700's warning panel the width of its face", "    warningWrap: 0.2,\n    warningWidth: 0.7,", "    warningWrap: 0.2,"),
    ("the 700's warning panel 0.4 of its face", "    warningWrap: 0.2,\n    warningWidth: 0.7,", "    warningWrap: 0.2,\n    warningWidth: 0.4,"),
    ("the 700's warning panel half a metre deep", "    warningWrap: 0.2,\n    warningWidth: 0.7,", "    warningWrap: 0.5,\n    warningWidth: 0.7,"),
    ("the 180's warning panel half a metre deep", "      warningWrap: 0.3,\n", "      warningWrap: 0.5,\n"),
    ("the 180's warning panel 0.7 of its face", "      warningWrap: 0.3,\n", "      warningWrap: 0.3,\n      warningWidth: 0.7,\n"),
    ("the 387's warning panel 0.7 of its face", "      door: null,\n      warning: YELLOW,\n      coupler: { style: 'dellner', covered: true },", "      door: null,\n      warning: YELLOW,\n      warningWidth: 0.7,\n      coupler: { style: 'dellner', covered: true },"),
    ("warning panel cheeks painted yellow", "for (const side of [true, false]) detail.fan(clip(upper, 0, side ? edge : -edge, side), faceN, colourOf(def.noseCone ?? def.noseFront));", "for (const side of [true, false]) detail.fan(clip(upper, 0, side ? edge : -edge, side), faceN, colourOf(front.warning));"),
    ("warning panel on a narrowed face not split off the cheeks", "if (front.warning !== null && kW > J0) {", "if (false) {"),
    ("warning panel a different yellow", "const YELLOW = 0xf2c100;", "const YELLOW = 0xf2c101;"),
    ("no wipers", "    if (front.wipers) {", "    if (false) {"),
    ("wipers at the top of the glass", "const a: [number, number] = [sx * pivot, screen.s0 + 0.045];", "const a: [number, number] = [sx * pivot, screen.s1 - 0.5];"),
    ("wipers' outer ends up the glass (they read as eyebrows)", "const b: [number, number] = [sx * Math.min(0.8, screenHalfWidth(screen.s0 + 0.08, 0) - 0.2), screen.s0 + 0.08];", "const b: [number, number] = [sx * Math.min(0.8, screenHalfWidth(screen.s0 + 0.08, 0) - 0.2), screen.s0 + 0.3];"),
    ("wipers pivot in the 180's post", "const pivot = (screen.pillar ?? 0) / 2 + 0.1;", "const pivot = 0.03;"),
    ("wipers pivot at the post's edge", "const pivot = (screen.pillar ?? 0) / 2 + 0.1;", "const pivot = (screen.pillar ?? 0) / 2 + 0.02;"),
    ("wipers pale", "const WIPER = 0x3b4048;", "const WIPER = 0xd0d4d8;"),
    ("wipers 0.9 m long past the glass's corner", "const b: [number, number] = [sx * Math.min(0.8, screenHalfWidth(screen.s0 + 0.08, 0) - 0.2), screen.s0 + 0.08];", "const b: [number, number] = [sx * Math.min(1.5, screenHalfWidth(screen.s0 + 0.08, 0) + 0.2), screen.s0 + 0.08];"),
    ("no destination display", "    if (front.display) {", "    if (false) {"),
    ("display at the foot of the glass", "const top = screen.s1 - 0.12;", "const top = screen.s0 + 0.5;"),
    ("display sunk into the nose", "detail, col(0xffa000), 0.034);", "detail, col(0xffa000), -0.034);"),
    ("wipers floating 30 cm off the nose", "detail, arm, 0.032);", "detail, arm, 0.3);"),
    ("front door on the 700", "    door: null,\n    warning: YELLOW,\n    warningWrap: 0.2,\n    warningWidth: 0.7,\n    coupler: { style: 'dellner', covered: false },", "    door: { width: 0.6, height: 0.62 },\n    warning: YELLOW,\n    warningWrap: 0.2,\n    warningWidth: 0.7,\n    coupler: { style: 'dellner', covered: false },"),
    ("front door a metre wide", "      const hw = front.door.width / 2;", "      const hw = front.door.width;"),
    ("front door down in the coupler cover's zone", "      const y0 = yCut + 0.07;", "      const y0 = yCut - 0.5;"),
    # --- couplers: styles, exposed noses, the open recess and jumper cable of a coupled nose ---------------------------------
    ("Dellner head front 2 cm short", "const [f0, f1] = zr(reach - 0.012, reach);", "const [f0, f1] = zr(reach - 0.032, reach - 0.02);", P),
    ("plain coupler head sticks out past its reach", "soup.box(-0.13, 0.13, y - 0.11, y + 0.11, hz0, hz0 + 0.1, dark);", "soup.box(-0.13, 0.13, y - 0.11, y + 0.11, hz0, hz0 + 0.15, dark);", P),
    ("Scharfenberg cone the wrong way round", "const cone = new THREE.CylinderGeometry(dir > 0 ? 0.09 : 0.15, dir > 0 ? 0.15 : 0.09, 0.12, 14, 1, false);", "const cone = new THREE.CylinderGeometry(dir > 0 ? 0.15 : 0.09, dir > 0 ? 0.09 : 0.15, 0.12, 14, 1, false);", P),
    ("Dellner barrel starts 5 cm out of the wall", "const [b0, b1] = zr(0, reach - headLen);", "const [b0, b1] = zr(0.05, reach - headLen);", P),
    ("exposed coupler 5 cm short of the car end", "couplerHalf(detail, Z(tip), outward, tip, ASSUMED.couplerHeight, front.coupler.style);", "couplerHalf(detail, Z(tip), outward, tip - 0.05, ASSUMED.couplerHeight, front.coupler.style);"),
    ("faceSetback ignores whether the coupler is covered", "(BODIES[family].front.coupler.covered ? NOSE_RECESS : END_GAP)", "NOSE_RECESS"),
    ("no open recess on a coupled nose", "      detail.fan(onFace(roundedRect(-hw, hw, r0.bottom + 0.08, coverTop - 0.05, 0.06, 2), 0.004), faceN, col(0x0d0e10));", "      void hw;"),
    ("no jumper cable between coupled noses", "        detail.bar([socketY, z0 + outward * 0.04], [socketY - 0.14, z1], 0.035, 0.035, col(0x111214), x);", "        void z1;"),
    ("jumper cable reaches past the joint", "const [z0, z1] = [Z(tip), Z(tip) + outward * (END_GAP - 0.008)];", "const [z0, z1] = [Z(tip), Z(tip) + outward * (END_GAP + 0.2)];"),
    ("no seam on the coupler cover", "      detail.fan(onFace(roundedRect(-a * 0.92, a * 0.92, coverTop - 0.012, coverTop + 0.012, 0.01, 1), 0.004), faceN, seam);", "      void seam;"),
    ("the cover's seam always near black", "const seam = col(faceLuma(lowerColour) < 0.2 ? 0x484c53 : 0x1b1d21);", "const seam = col(0x1b1d21);"),
    ("the cover's seam grey on a dark front only below luma 0.1 (the Hull cone is 0.19)", "const seam = col(faceLuma(lowerColour) < 0.2 ? 0x484c53 : 0x1b1d21);", "const seam = col(faceLuma(lowerColour) < 0.1 ? 0x484c53 : 0x1b1d21);"),
    ("the cover's seam grey on any front below luma 0.9", "const seam = col(faceLuma(lowerColour) < 0.2 ? 0x484c53 : 0x1b1d21);", "const seam = col(faceLuma(lowerColour) < 0.9 ? 0x484c53 : 0x1b1d21);"),
    ("the cover's seam always grey", "const seam = col(faceLuma(lowerColour) < 0.2 ? 0x484c53 : 0x1b1d21);", "const seam = col(0x484c53);"),
    ("a Class 180 with a Dellner coupler", "      coupler: { style: 'scharfenberg', covered: false },", "      coupler: { style: 'dellner', covered: false },"),
    ("a Class 180 with its Scharfenberg under a cover again", "      coupler: { style: 'scharfenberg', covered: false },", "      coupler: { style: 'scharfenberg', covered: true },"),
    # --- the Class 180 and Class 700 bodies, the diesel underfloor and the diesel bogie ----------------------------------------
    ("diesel underfloor pods not drawn", "for (const b of underfloorBlocks(car, spec)) detail.box(", "for (const b of [] as ReturnType<typeof underfloorBlocks>) detail.box("),
    ("underfloor pods run into the wheels", "      clearance: 0.35,", "      clearance: -1,"),
    ("underfloor pods spaced unevenly", "const gap = (to - from - total * k) / gaps;", "const gap = (to - from - total * k) / (gaps * 2);"),
    ("underfloor pods do not shrink to fit", "const k = Math.min(1, Math.max(0, to - from - UNDERFLOOR_GAP * gaps) / total);", "const k = 1;"),
    ("fuel tank wider than the body", "{ name: 'fuel-tank', length: 2.6, half: 0.95,", "{ name: 'fuel-tank', length: 2.6, half: 1.5,"),
    ("engine pod a metre long", "{ name: 'engine', length: 3.3,", "{ name: 'engine', length: 1.0,"),
    ("underfloor pods hanging from nothing", "y1: spec.floor + 0.02, z0: z,", "y1: spec.floor - 0.3, z0: z,"),
    ("engine pod on the ballast", "{ name: 'engine', length: 3.3, half: 0.88, bottom: 0.5,", "{ name: 'engine', length: 3.3, half: 0.88, bottom: 0.1,"),
    ("the valance of a diesel car as deep as an electric one's", "    skirtBottom: 0.8,\n    cutout: 2.0,", "    skirtBottom: 0.3,\n    cutout: 2.0,"),
    ("the 180 with an electric bogie", "diesel: spec.family === 'adelante' });", "diesel: false });"),
    ("the 180 with two-leaf doors", "    doorY: [fig.floorHeight.value + 0.02, 2.95],\n    doorLeaves: 1,", "    doorY: [fig.floorHeight.value + 0.02, 2.95],\n    doorLeaves: 2,"),
    ("the 700 a different width from the 717", "  ...DESIRO_BODY,\n  family: 'desiro700',", "  ...DESIRO_BODY,\n  half: 1.0,\n  family: 'desiro700',"),
    ("diesel bogie keeps traction motors", "  if (motor && spec.diesel) {", "  if (false) {", P),
    ("diesel bogie without its cardan shaft", "    cylinder(soup, 'z', [0, r + 0.08, 0], 0.045, wb - 0.44, 8, dark, false);", "", P),
    ("cardan shaft stops short of the gearboxes", "0.045, wb - 0.44, 8, dark, false);", "0.045, wb - 1.0, 8, dark, false);", P),
    ("gearbox on one axle only", "    for (const az of [-wb / 2, wb / 2]) {\n      soup.box(-0.3, 0.3, r - 0.2, r + 0.2, az - 0.22, az + 0.22, motorC);", "    for (const az of [wb / 2]) {\n      soup.box(-0.3, 0.3, r - 0.2, r + 0.2, az - 0.22, az + 0.22, motorC);", P),
    # --- the bogie level of detail ---------------------------------------------------------------------------------------
    ("no far level of detail", "  lod.addLevel(far, lodDistance());", "", P),
    ("far level of detail at 15 m", "export const BOGIE_LOD_DISTANCE = 150;", "export const BOGIE_LOD_DISTANCE = 15;", P),
    ("level-of-detail override ignored", "return typeof o === 'number' && o >= 0 ? o : BOGIE_LOD_DISTANCE;", "return BOGIE_LOD_DISTANCE;", P),
    ("level-of-detail override accepts anything numeric", "return typeof o === 'number' && o >= 0 ? o : BOGIE_LOD_DISTANCE;", "return typeof o === 'number' ? o : BOGIE_LOD_DISTANCE;", P),
    ("far bogie as detailed as the near one", "farGeometry = bogieFarSoup(spec).build();", "farGeometry = bogieSoup({ ...spec, motor: true }).build();", P),
    ("far wheels six-sided (the tread no longer touches the rail head)", "cylinder(soup, 'x', [sx * half, r, az], r, WHEEL_WIDTH, 8, steel);", "cylinder(soup, 'x', [sx * half, r, az], r, WHEEL_WIDTH, 6, steel);", P),
    ("far mesh not called bogie-mesh", "  far.name = 'bogie-mesh';", "  far.name = 'bogie-far';", P),
    ("far mesh visible before the first frame", "  far.visible = false;\n", "", P),
    ("near level of detail only from 10 m", "  lod.addLevel(near, 0);", "  lod.addLevel(near, 10);", P),
    ("far geometry cached per diesel flag", "const farKey = `${radius}/${wb}/${track}`;", "const farKey = `${radius}/${wb}/${track}/${spec.diesel === true}`;", P),
    ("far geometry not cached", "  if (!farGeometry) {", "  if (true) {", P),
    # --- the Grand Central and Thameslink liveries, the lettering atlas, the ellipse ---------------------------------------------
    ("Grand Central band blue", "    stripe: 0xf27a1a,", "    stripe: 0x1a3af2,", L),
    ("Grand Central body white", "    body: 0x17181c,", "    body: 0xf0f0f0,", L),
    ("Grand Central first-class doors on the wrong car", "doorFor: (c) => (c.type === 'MFL' ? 0xc9a227 : 0xb9bec6),", "doorFor: (c) => (c.type === 'DMSL' ? 0xc9a227 : 0xb9bec6),", L),
    ("Thameslink doors grey", "    door: 0x34a9e1,", "    door: 0x808080,", L),
    ("Thameslink stripe as broad as Grand Central's", "    stripeY: [1.12, 1.24],", "    stripeY: [1.0, 1.5],", L),
    ("Thameslink lettering misspelt", "items.push({ text: 'Thameslink', colour: 0xd2257c,", "items.push({ text: 'Thamesl1nk', colour: 0xd2257c,", L),
    ("Grand Central cites a name, not its sources", "'Wikipedia, Grand Central (train operating company), Livery: \"Initially, Grand Central adopted an all black livery with doors painted gold (first class) and silver (standard class).\" and \"When the Class 180 was introduced, an orange band was introduced.\"',", "'Wikipedia',", L),
    ("Thameslink shades marked exact", "every shade and the lettering approximate',", "every shade and the lettering exact',", L),
    ("lettering atlas a fixed 1280 px tall", "const atlasH = (): number => (atlasTexts().length + 1) * ROW_H;", "const atlasH = (): number => 1280;", L),
    ("lettering atlas leaves out the newest liveries", "  for (const def of Object.values(LIVERIES)) {\n    for (const cab of [true, false]) {\n      for (let index = 0; index < 6; index++) {", "  for (const def of Object.values(LIVERIES).slice(0, 4)) {\n    for (const cab of [true, false]) {\n      for (let index = 0; index < 6; index++) {", L),
    ("ellipse closes on its first point", "const t = (2 * Math.PI * i) / n;", "const t = (2 * Math.PI * i) / (n - 1);", "web/src/train-geom.ts"),
]
only = sys.argv[3:]
selected = [m for m in M if not only or any(o in m[0] for o in only)]
tally = kxmut.Tally()
with kxmut.workspace(src, scratch, "trainweb") as work:
    def run():
        return kxmut.run_tests(work, TESTS, test_timeout_ms=20000, timeout=120, force_exit=True)

    # every test, from an unmutated run of the copy, so that at the end we can say which tests no mutation ever turned red
    baseline = kxmut.require_green(run(), " ".join(TESTS))
    for m in selected:
        label, old, new = m[:3]
        rel = m[3] if len(m) > 3 else F
        try:
            with kxmut.mutated(work / rel, [(old, new)]):
                verdict = kxmut.judge(run(), baseline)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        if only and verdict.kind == kxmut.KILLED:
            # with a filter, say every test that went red, so a run of a few mutations shows which tests they exercise
            verdict.detail = " | ".join(verdict.failed)
        tally.record(label, verdict)
status = tally.finish()
if not only:
    print(f"{len(tally.red & baseline.passed)}/{len(baseline.passed)} tests turned red by at least one mutation")
    for t in sorted(baseline.passed - tally.red): print("  NEVER RED:", t)
sys.exit(status)
