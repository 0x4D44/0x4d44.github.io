"""Mutation check for the three.js trains (web/src/train.ts, train-parts.ts, train-nose.ts, livery.ts) against
web/tests/train.test.ts and web/tests/train-detail.test.ts.
usage: python3 -I -u tools/mutation/trainweb.py <kings-cross-src> <scratch dir>"""
import os, re, shutil, subprocess, sys
from pathlib import Path

src = Path(sys.argv[1]).resolve(); scratch = Path(sys.argv[2])
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
    ("no coupler cover at the train's ends", "if (!interiorCab) group.add(cover);", ""),
    ("a coupler cover at every cab", "if (!interiorCab) group.add(cover);", "group.add(cover);"),
    ("the cover hides nothing", "hidesCoupler: !interiorCab", "hidesCoupler: false"),
    ("inner noses not found", "const interiorCab = cabIsInterior(car, layout);", "const interiorCab = false;"),
    ("a hidden coupler drawn as a gangway coupler", "m.userData = { end: car.cab, nose: true };", "m.userData = { end: car.cab, nose: false };"),
    ("coupler cover seam on the loft vertex (zero-area fan)", "if (inside(a) !== inside(b) && a[1] !== y && b[1] !== y) {", "if (inside(a) !== inside(b)) {"),
    # --- the nose and its glass -------------------------------------------------------------------------------
    ("nose rings far apart", "const steps = 6;", "const steps = 2;", N),
    ("face not rounded", "    filletLoss: 0.26,", "    filletLoss: 0,"),
    ("fillet a parabola, not a quarter circle (meets the sides at a slope)", "return 1 - spec.filletLoss + spec.filletLoss * Math.sqrt(Math.max(0, 1 - t * t));", "return 1 - spec.filletLoss + spec.filletLoss * (1 - t);", N),
    ("bonnet knot overshoots the roof line", "      { s: 2.8, top: noseY(3.42), ws: 0.9, bottom: 0.9 },", "      { s: 2.8, top: noseY(3.9), ws: 0.9, bottom: 0.9 },"),
    ("nose tip as wide as the body", "      { s: 0, top: noseY(1.9), ws: 0.5, bottom: 0.8 },", "      { s: 0, top: noseY(1.9), ws: 1.0, bottom: 0.8 },"),
    ("face stands 0.2 m inside the end of the train", "const tip = car.cab ? (interiorCab ? END_GAP : NOSE_RECESS) : END_GAP;", "const tip = car.cab ? (interiorCab ? END_GAP : 0.2) : END_GAP;"),
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
    ("lamps in the windscreen", "const yh = r0.bottom + 0.56 * (r0.top - r0.bottom);", "const yh = r0.bottom + 0.95 * (r0.top - r0.bottom);"),
    ("lamps outside the face", "const xh = xAtY(tipHalf, yh) * 0.6;", "const xh = xAtY(tipHalf, yh) * 1.2;"),
    ("windscreen sunk into the nose", "patch(0, glass, null, 0.016);", "patch(0, glass, null, -0.016);"),
    ("windscreen a narrow slit", "const hw0 = screen.fraction * ringAt(spec.nose, s).ws * W + margin;", "const hw0 = screen.fraction * 0.3 * ringAt(spec.nose, s).ws * W + margin;"),
    ("windscreen a hand's breadth tall", "      const s0 = screen.s0 - margin;\n      const s1 = screen.s1 + margin;\n      const pts", "      const s0 = screen.s0 - margin;\n      const s1 = screen.s0 + 0.3 + margin;\n      const pts"),
    ("windscreen normals from the grid, not the nose", "return unit([-(heightAt(p[0] + hx, s) - heightAt(p[0] - hx, s)) / (2 * hx), 1, -(heightAt(p[0], s + hs) - heightAt(p[0], s - hs)) / (2 * hs)]);", "return unit([0, 1, 1]);"),
    ("no cab side windows", "for (const side of [-1, 1]) {\n      const rows = 8;", "for (const side of []) {\n      const rows = 8;"),
    ("cab glass in the body material", "const m = new THREE.Mesh(glass.build(), glassMaterial());", "const m = new THREE.Mesh(glass.build(), plain());"),
    # --- bogies ------------------------------------------------------------------------------------------------
    ("wheels on a narrower track", "w.position.set((sx * track) / 2, radius, az);", "w.position.set((sx * track) / 3, radius, az);", P),
    ("wheels floating", "w.position.set((sx * track) / 2, radius, az);", "w.position.set((sx * track) / 2, radius * 1.1, az);", P),
    ("axle markers twice as far apart", "const { radius, wheelbase: wb, track } = spec;\n  for (const az of [-wb / 2, wb / 2]) {", "const { radius, wheelbase: wb, track } = spec;\n  for (const az of [-wb, wb]) {", P),
    ("bogie geometry built for every bogie", "  if (!geometry) {", "  if (true) {", P),
    ("trailer bogie shares the motor bogie's geometry", "const key = `${radius}/${wb}/${track}/${spec.motor}`;", "const key = `${radius}/${wb}/${track}`;", P),
    ("no traction motors", "  if (motor) {\n    // a traction motor", "  if (false) {\n    // a traction motor", P),
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
    ("Great Northern guesses no longer flagged", "dark cab front and every shade approximate", "dark cab front and every shade exact", L),
]
survived = []
only = sys.argv[3:]
# every test, from an unmutated run, so that at the end we can say which tests no mutation ever turned red
base = subprocess.run(["node", "--test", "--test-force-exit", "--test-timeout=20000", *TESTS], cwd=src, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=120)
all_tests = sorted(set(re.findall(r"^\s*✔ (.+?) \(", base.stdout, re.M)))
if base.returncode != 0: sys.exit("the unmutated tests fail:\n" + base.stdout[-3000:])
seen_red = set()
for i, m in enumerate(M):
    label, old, new = m[:3]
    rel = m[3] if len(m) > 3 else F
    if only and not any(o in label for o in only):
        continue
    work = scratch / f"w{i:02d}"
    if work.exists(): shutil.rmtree(work)
    shutil.copytree(src, work, ignore=shutil.ignore_patterns("relay", "node_modules", "dist"), symlinks=True)
    os.symlink(src / "node_modules", work / "node_modules")
    f = work / rel; text = f.read_text()
    if old not in text:
        print(f"[SKIP    ] {label}: pattern not found", flush=True); survived.append(label); shutil.rmtree(work); continue
    f.write_text(text.replace(old, new, 1))
    try:
        r = subprocess.run(["node", "--test", "--test-force-exit", "--test-timeout=20000", *TESTS], cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=120)
    except subprocess.TimeoutExpired:
        print(f"[KILLED  ] {label} (hung)", flush=True); shutil.rmtree(work, ignore_errors=True); continue
    failed = sorted(set(re.findall(r"^\s*✖ (.+?) \(", r.stdout, re.M)))
    seen_red.update(failed)
    if r.returncode != 0:
        # with a filter, say every test that went red, so a run of a few mutations shows which tests they exercise
        shown = " | ".join(failed) if only else (failed[0] if failed else "(non-zero exit)")
        print(f"[KILLED  ] {label} <- {shown}", flush=True)
    else:
        print(f"[SURVIVED] {label}", flush=True); survived.append(label)
    shutil.rmtree(work)
total = len([1 for m in M if not only or any(o in m[0] for o in only)])
print(f"\n{total - len(survived)}/{total} mutations caught")
for s in survived: print("  NOT CAUGHT:", s)
if not only:
    print(f"{len(seen_red)}/{len(all_tests)} tests turned red by at least one mutation")
    for t in all_tests:
        if t not in seen_red: print("  NEVER RED:", t)
