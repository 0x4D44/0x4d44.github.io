// A2: the buildings that are not a house (patio house, tenement, school, clinic, hall): structure, safety and identity of each plan.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-special.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll, PLAYER } from './arch-lib.mjs';
import { sharedWall } from '../js/arch/geom.js';

const lots = testLots();
const { ctx, bps } = planAll(lots);
const byKind = (kind) => bps.filter((bp) => bp.lot.kind === kind);
const patioHouses = bps.filter((bp) => bp.shell.patios.length);
const ph = ctx.physics;

test('the patio house plan is used where the lot allows it, and only then', () => {
  const courtyards = byKind('courtyard');
  assert.ok(courtyards.length >= 6, `${courtyards.length} courtyard lots`);
  const used = courtyards.filter((bp) => bp.shell.patios.length);
  assert.ok(used.length >= 6, `only ${used.length} of ${courtyards.length} courtyard lots got a patio`);
  for (const bp of bps) if (bp.lot.kind !== 'courtyard' && !['tenement', 'school'].includes(bp.lot.kind)) assert.equal(bp.shell.patios.length, 0, `${bp.id} (${bp.lot.kind}) has a patio`);
});

test('a patio is an outdoor ground room with a void through every storey and the roof, ringed by galleries', () => {
  for (const bp of patioHouses) {
    const F = bp.shell.F, sh = bp.shell;
    for (const p of sh.patios) {
      const room = bp.rooms.find((r) => r.id === p.id);
      assert.ok(room && room.type === 'patio' && room.outdoor && room.floor === 0, `${bp.id} patio room`);
      for (let k = 1; k < F; k++) assert.ok(bp.floors[k].voids.some((v) => v.patio && v.x0 === p.rect.x0 && v.z1 === p.rect.z1 && v.owner === p.id), `${bp.id} floor ${k} has the patio void`);
      assert.ok(sh.floorsData[F].voids.some((v) => v.patio && v.owner === p.id), `${bp.id} roof hole`);
      // no surface above the patio floor: the sky is open (the slabs have holes, the roof has none over it)
      const cx = (p.rect.x0 + p.rect.x1) / 2, cz = (p.rect.z0 + p.rect.z1) / 2, w = bp.frame.toWorld(cx, 0, cz);
      const above = ph.heightsAt(w[0], w[2]).filter((h) => h > w[1] + 0.3);
      assert.deepEqual(above, [], `${bp.id}: something walkable hangs over the patio`);
    }
    const galleries = bp.rooms.filter((r) => r.type === 'corridor' && r.floor === 0);
    assert.ok(galleries.length >= 2, `${bp.id}: ${galleries.length} ground galleries`);
    const arches = bp.doors.filter((d) => d.kind === 'arch' && d.floor === 0 && d.rooms.includes(sh.patios[0].id));
    assert.ok(arches.length >= 2, `${bp.id}: ${arches.length} arches onto the patio`);
  }
});

test('the wall onto the void is solid: nobody can walk or jump through an arcade bay, from any storey', () => {
  let probes = 0; const bad = [];
  for (const bp of patioHouses) {
    for (const a of bp.shell.arcades) {
      const room = bp.rooms.find((r) => r.id === a.room), q = room.rect;
      const alongX = a.wall.dir === 'x', side = Math.sign((alongX ? (q.z0 + q.z1) / 2 : (q.x0 + q.x1) / 2) - a.wall.at);
      for (const speed of [2.3, 5.0]) for (const jump of [0, 3.6]) {
        const from = alongX ? [a.u, a.wall.at + side * (a.wall.t / 2 + 0.7)] : [a.wall.at + side * (a.wall.t / 2 + 0.7), a.u];
        const to = alongX ? [a.u, a.wall.at - side * (a.wall.t / 2 + 1.0)] : [a.wall.at - side * (a.wall.t / 2 + 1.0), a.u];
        const y = room.y, A = bp.frame.toWorld(from[0], y, from[1]), B = bp.frame.toWorld(to[0], y, to[1]);
        const len = Math.hypot(B[0] - A[0], B[2] - A[2]), ux = (B[0] - A[0]) / len, uz = (B[2] - A[2]) / len, dt = 1 / 60;
        const s = { x: A[0], z: A[2], y: A[1], vy: 0, onGround: true };
        ph.move(s, 0, 0, dt, PLAYER);
        probes++;
        for (let i = 0; i < 90; i++) ph.move(s, ux * speed * dt, uz * speed * dt, dt, i === 0 && jump ? { ...PLAYER, jump } : PLAYER);
        const l = bp.frame.toLocal(s.x, s.y, s.z), across = alongX ? l[2] : l[0];
        if (Math.sign(across - a.wall.at) !== side || s.y < y - 0.3) bad.push(`${a.id} (floor ${a.floor}) speed ${speed} jump ${jump}: ended at across ${across.toFixed(2)}, y ${(s.y - A[1]).toFixed(2)}`);
      }
    }
  }
  assert.ok(probes >= 100, `${probes} probes`);
  assert.deepEqual(bad.slice(0, 8), []);
});

test('the hole in a walkable roof over the patio is fenced: no real jump (walk or sprint, 60 or 20 fps) drops into it', () => {
  let tested = 0; const bad = [];
  for (const bp of patioHouses) {
    if (!bp.roof.walkable) continue;
    const yRoof = bp.roof.y;
    for (const p of bp.shell.patios) {
      const sides = [['x', p.rect.z0, -1, p.rect.x0, p.rect.x1], ['x', p.rect.z1, 1, p.rect.x0, p.rect.x1], ['z', p.rect.x0, -1, p.rect.z0, p.rect.z1], ['z', p.rect.x1, 1, p.rect.z0, p.rect.z1]];
      for (const [axis, edge, dir, a0, a1] of sides) for (const f of [0.3, 0.5, 0.7]) {
        const u = a0 + (a1 - a0) * f, out = edge + dir * 0.6;                                    // 0.6 m outside the hole, on the roof
        const lx = axis === 'x' ? u : out, lz = axis === 'x' ? out : u, tx = axis === 'x' ? u : edge, tz = axis === 'x' ? edge : u;
        const A = bp.frame.toWorld(lx, 0, lz), B = bp.frame.toWorld(tx, 0, tz), len = Math.hypot(B[0] - A[0], B[2] - A[2]), ux = (B[0] - A[0]) / len, uz = (B[2] - A[2]) / len;
        if (ph._overlaps(A[0], A[2], yRoof, PLAYER.radius, PLAYER.height)) continue;
        for (const speed of [2.3, 5.0]) for (const fps of [60, 20]) {
          const dt = 1 / fps, s = { x: A[0], z: A[2], y: yRoof, vy: 0, onGround: true };
          for (let i = 0; i < 12 && !(s.onGround && i > 0); i++) ph.move(s, 0, 0, dt, PLAYER);
          if (!s.onGround || Math.abs(s.y - yRoof) > 0.05) continue;
          tested++;
          ph.move(s, ux * speed * dt, uz * speed * dt, dt, { ...PLAYER, jump: 3.6 });
          for (let i = 0; i < 100 && !s.onGround; i++) ph.move(s, ux * speed * dt, uz * speed * dt, dt, PLAYER);
          for (let i = 0; i < 40; i++) ph.move(s, ux * speed * dt, uz * speed * dt, dt, PLAYER);
          if (s.y < yRoof - 0.3) bad.push(`${bp.id} ${axis}${dir > 0 ? '+' : '-'} f${f} speed ${speed} fps ${fps}: fell ${(yRoof - s.y).toFixed(2)} m`);
        }
      }
    }
  }
  assert.ok(tested >= 24, `only ${tested} jumps could be tried`);
  assert.deepEqual(bad.slice(0, 8), []);
});

// ---------------------------------------------------------------- tenement
const tenements = byKind('tenement');
const corridorOf = (bp, k) => bp.rooms.filter((r) => r.floor === k && r.type === 'corridor');
const planned = tenements.filter((bp) => corridorOf(bp, 0).length === 1);
const inside = (c, r, e = 0.02) => c.x0 >= r.x0 - e && c.x1 <= r.x1 + e && c.z0 >= r.z0 - e && c.z1 <= r.z1 + e;
const doorBetween = (bp, a, b) => bp.doors.find((d) => d.rooms.includes(a.id) && d.rooms.includes(b.id));

test('a tenement is one corridor the full depth of the lot with the small rooms (cuartos) off both sides, on every storey', () => {
  assert.ok(tenements.length >= 7, `${tenements.length} tenement lots`);
  assert.ok(planned.length >= 6, `only ${planned.length} of ${tenements.length} tenement lots got the corridor plan`);
  for (const bp of planned) {
    const I = bp.shell.inner, F = bp.shell.F;
    for (let k = 0; k < F; k++) {
      const [cor] = corridorOf(bp, k), q = cor.rect;
      assert.equal(corridorOf(bp, k).length, 1, `${bp.id} floor ${k}: ${corridorOf(bp, k).length} corridors`);
      assert.ok(q.z1 - q.z0 >= 0.95 * (I.z1 - I.z0), `${bp.id} floor ${k}: the corridor is ${(q.z1 - q.z0).toFixed(1)} m of ${(I.z1 - I.z0).toFixed(1)} m`);
      assert.ok(q.x1 - q.x0 >= 1.2 && q.x1 - q.x0 <= 1.6, `${bp.id}: corridor ${(q.x1 - q.x0).toFixed(2)} m wide`);
      const cuartos = bp.rooms.filter((r) => r.floor === k && r.type === 'bedroom');
      assert.ok(cuartos.length >= (bp.lot.d >= 9.5 ? 4 : 2), `${bp.id} floor ${k}: ${cuartos.length} cuartos`);
      assert.ok(cuartos.some((r) => r.rect.x1 <= q.x0) && cuartos.some((r) => r.rect.x0 >= q.x1), `${bp.id} floor ${k}: cuartos on one side only`);
      for (const r of cuartos) {
        const area = (r.rect.x1 - r.rect.x0) * (r.rect.z1 - r.rect.z0);
        assert.ok(area >= 6 && area <= 26, `${r.id}: a ${area.toFixed(1)} m2 cuarto`);
        const d = doorBetween(bp, cor, r);
        assert.ok(d, `${r.id} has no door onto the corridor`);
        assert.equal(d.rooms[1], r.id, `${d.id}: the leaf must swing into the cuarto, not the corridor`);
        assert.ok(inside(d.clear, r.rect), `${d.id}: the swing of the door runs out of ${r.id}`);
      }
    }
  }
});

test('the kitchen and the bath of a tenement are shared: one kitchen, one bath a storey, none inside a cuarto, and the bath is reached without crossing a cuarto', () => {
  for (const bp of planned) {
    const kitchens = bp.rooms.filter((r) => r.type === 'kitchen');
    assert.equal(kitchens.length, 1, `${bp.id}: ${kitchens.length} kitchens`);
    assert.ok(doorBetween(bp, kitchens[0], corridorOf(bp, 0)[0]), `${bp.id}: the kitchen does not open onto the corridor`);
    for (let k = 0; k < bp.shell.F; k++) {
      const baths = bp.rooms.filter((r) => r.floor === k && r.type === 'bathroom'), cuartos = bp.rooms.filter((r) => r.floor === k && r.type === 'bedroom');
      assert.equal(baths.length, 1, `${bp.id} floor ${k}: ${baths.length} baths`);
      for (const c of cuartos) assert.ok(!doorBetween(bp, c, baths[0]), `${c.id} has a private bath`);
      // flood the corridor's side of the door graph without ever stepping into a cuarto
      const seen = new Set([corridorOf(bp, k)[0].id]), todo = [...seen];
      while (todo.length) {
        const id = todo.pop();
        for (const d of bp.doors) {
          if (!d.rooms.includes(id) || d.floor !== k) continue;
          const other = d.rooms[0] === id ? d.rooms[1] : d.rooms[0], r = other && bp.rooms.find((q) => q.id === other);
          if (r && !seen.has(r.id) && r.type !== 'bedroom') { seen.add(r.id); todo.push(r.id); }
        }
      }
      assert.ok(seen.has(baths[0].id), `${bp.id} floor ${k}: the bath is only reached through a cuarto`);
    }
  }
});

// ---------------------------------------------------------------- school
const schools = byKind('school');
const schoolPlans = schools.filter((bp) => bp.shell.patios.length);
const areaOf = (r) => (r.rect.x1 - r.rect.x0) * (r.rect.z1 - r.rect.z0);
const roomOf = (bp, id) => bp.rooms.find((r) => r.id === id);
const doorsOf = (bp, r) => r.doors.map((id) => bp.doors.find((d) => d.id === id));
const neighbours = (bp, r) => doorsOf(bp, r).map((d) => roomOf(bp, d.rooms[0] === r.id ? d.rooms[1] : d.rooms[0])).filter(Boolean);
const flat = (q) => [q.x1 - q.x0, q.z1 - q.z0].sort((a, b) => a - b);            // a rect's short and long side
const sameRect = (a, b) => ['x0', 'x1', 'z0', 'z1'].every((k) => Math.abs(a[k] - b[k]) < 1e-6);
const WALKED = new Set(['hall', 'corridor', 'entry', 'stairwell', 'landing', 'patio']);       // where people walk to get somewhere: never a room one lives or works in
/** Every room of floor `k` reached from `start` through walked rooms only (a classroom, an office or a toilet is a dead end, never a way through). */
const walkedFrom = (bp, start, k) => {
  const seen = new Set([start.id]), todo = [start];
  while (todo.length) for (const q of neighbours(bp, todo.pop())) if (q.floor === k && WALKED.has(q.type) && !seen.has(q.id)) { seen.add(q.id); todo.push(q); }
  return seen;
};

test('the school plan is taken wherever the lot has the room (about 13 m wide, 14 m deep with a stair), and the smaller lots fall back to a house', () => {
  assert.ok(schools.length >= 10, `${schools.length} school lots`);
  const planned = (id) => schoolPlans.some((bp) => bp.id === id);
  for (const id of ['T24', 'T40', 'T42', 'T56', 'T57', 'T58', 'T59']) assert.ok(planned(id), `${id} (${schools.find((b) => b.id === id)?.lot.w} x ${schools.find((b) => b.id === id)?.lot.d}) should take the school plan`);
  for (const id of ['T41', 'T43', 'T44']) assert.ok(!planned(id), `${id} is too small for the school plan and is planned as a house`);
});

test('a school is the standard plan: street door, entrance hall, the hall to a 1.4 m stair, the stair to an upper hall, classrooms off the corridors, toilets off a corridor', () => {
  for (const bp of schoolPlans) {
    const F = bp.shell.F, yard = bp.rooms.find((r) => r.type === 'patio'), ground = bp.rooms.filter((r) => r.floor === 0);
    assert.ok(yard.outdoor && areaOf(yard) >= 25, `${bp.id}: a ${areaOf(yard).toFixed(0)} m2 yard`);

    // one entrance hall, with the street door in it, open onto the yard, big enough to be a hall
    const halls = ground.filter((r) => r.type === 'hall' || r.type === 'entry');
    assert.equal(halls.length, 1, `${bp.id}: ${halls.length} halls on the ground floor`);
    const hall = halls[0], street = bp.doors.find((d) => d.ext && d.entrance === 'main');
    assert.ok(street && street.rooms.includes(hall.id), `${bp.id}: the street door is not in the entrance hall`);
    assert.ok(areaOf(hall) >= 14 && flat(hall.rect)[0] >= 3.0, `${bp.id}: an entrance hall of ${flat(hall.rect).map((v) => v.toFixed(1)).join(' x ')} m`);
    assert.ok(bp.doors.some((d) => d.kind === 'arch' && d.rooms.includes(hall.id) && d.rooms.includes(yard.id)), `${bp.id}: the entrance hall does not open onto the yard`);

    // the staff room is off the hall (a school without a stair has it where the stair would be); the toilets are off a corridor or the yard, never off an office or a classroom
    const staff = ground.find((r) => r.type === 'office' && r.name === 'Sala de profesores');
    assert.ok(staff && neighbours(bp, staff).includes(hall), `${bp.id}: the staff room does not open off the entrance hall`);
    const baths = ground.filter((r) => r.type === 'bathroom');
    assert.ok(baths.length >= 2, `${bp.id}: ${baths.length} toilets on the ground floor`);
    for (const t of baths) {
      assert.ok(t.doors.length >= 1, `${t.id}: no door`);
      for (const q of neighbours(bp, t)) assert.ok(q.type === 'corridor' || q.type === 'patio', `${t.id} (${t.name}) opens off a ${q.type} (${q.name}), not a corridor or the yard`);
    }

    // the classrooms: rectangles of one size, each with one door, onto a corridor, the leaf swinging in; none is a way through to anything else
    const classes = bp.rooms.filter((r) => r.type === 'classroom'), sizes = classes.map(areaOf);
    assert.ok(classes.length >= 2 * Math.min(F, 2), `${bp.id}: ${classes.length} classrooms`);
    assert.ok(Math.max(...sizes) / Math.min(...sizes) <= 1.35, `${bp.id}: classrooms of ${sizes.map((v) => v.toFixed(0)).join(', ')} m2`);
    for (const c of classes) {
      const [s, l] = flat(c.rect);
      assert.ok(s >= 4.4 && l / s <= 1.8, `${c.id}: a ${s.toFixed(1)} x ${l.toFixed(1)} classroom`);
      assert.equal(c.doors.length, 1, `${c.id}: ${c.doors.length} doors (a classroom is a dead end, not a way through)`);
      const d = doorsOf(bp, c)[0], onto = roomOf(bp, d.rooms[0] === c.id ? d.rooms[1] : d.rooms[0]);
      assert.ok(onto.type === 'corridor' || onto.type === 'hall', `${c.id} opens onto a ${onto.type}`);
      assert.equal(d.rooms[1], c.id, `${d.id}: the leaf swings into the classroom`);
    }
    // every classroom of a floor opens off a space that is reached on foot from the floor's entry (the hall at the street door, the landing upstairs) without crossing any room
    const walked = [walkedFrom(bp, hall, 0), ...Array.from({ length: F - 1 }, (_, i) => walkedFrom(bp, bp.rooms.find((r) => r.floor === i + 1 && r.type === 'landing') ?? hall, i + 1))];
    for (const c of classes) assert.ok(walked[c.floor].has(neighbours(bp, c)[0].id), `${c.id} (floor ${c.floor}) opens off a space no one reaches without crossing a room`);

    if (F < 2) continue;
    // the stair: 1.4 m flights, a landing and a half landing at least that deep; the hall opens onto its foot, in the landing zone
    const st = bp.stairs[0], core = bp.shell.core, stairwell = ground.find((r) => r.type === 'stairwell');
    assert.ok(st.width >= 1.4 - 1e-9, `${bp.id}: a stair ${st.width} m wide`);
    for (const f of core.flights) assert.ok(flat(f.rect)[0] >= 1.4 - 1e-9, `${bp.id}: flight ${f.id} is ${flat(f.rect)[0].toFixed(2)} m wide`);
    assert.ok(flat(st.landing)[0] >= 1.5, `${bp.id}: a ${flat(st.landing)[0].toFixed(2)} m landing`);
    assert.ok(flat(st.halfLanding)[0] >= 1.4 - 1e-9, `${bp.id}: a ${flat(st.halfLanding)[0].toFixed(2)} m half landing`);
    const foot = bp.doors.find((d) => d.rooms.includes(hall.id) && d.rooms.includes(stairwell.id));
    assert.ok(foot, `${bp.id}: the entrance hall does not open onto the stair`);
    assert.ok(foot.z >= core.landing.z0 && foot.z <= core.landing.z1 && foot.w >= 1.2, `${bp.id}: the door to the stair (z ${foot.z}, ${foot.w} m) is not at the landing (z ${core.landing.z0}..${core.landing.z1})`);
    // upstairs the stair lands in the upper hall, which has the entrance hall's footprint and leads on to the corridors
    const corridors = bp.rooms.filter((r) => r.floor === 0 && r.type === 'corridor');
    assert.equal(corridors.length, 3, `${bp.id}: ${corridors.length} corridors on the ground floor (two beside the yard, one along it)`);
    for (let k = 1; k < F; k++) {
      const landing = bp.rooms.find((r) => r.floor === k && r.type === 'landing'), up = neighbours(bp, landing).find((r) => r.type === 'hall');
      assert.ok(up && sameRect(up.rect, hall.rect), `${bp.id} floor ${k}: the landing does not open onto an upper hall over the entrance hall`);
      const cors = bp.rooms.filter((r) => r.floor === k && r.type === 'corridor');
      assert.equal(cors.length, 3, `${bp.id} floor ${k}: ${cors.length} corridors`);
      assert.ok(cors.every((c) => walked[k].has(c.id)), `${bp.id} floor ${k}: a corridor is not reached from the landing`);
    }
  }
});

// ---------------------------------------------------------------- clinic
const clinics = byKind('clinic');
const clinicPlans = clinics.filter((bp) => bp.rooms.some((r) => r.floor === 0 && r.type === 'shop'));

test('a clinic is a waiting room that every other room opens onto: two or more consulting rooms, a pharmacy counter hatch, toilets', () => {
  assert.ok(clinics.length >= 7, `${clinics.length} clinic lots`);
  assert.ok(clinicPlans.length >= 6, `only ${clinicPlans.length} of ${clinics.length} clinic lots got the clinic plan`);
  for (const bp of clinicPlans) {
    const ground = bp.rooms.filter((r) => r.floor === 0), wait = ground.find((r) => r.type === 'hall');
    assert.ok(wait && /espera/i.test(wait.name) && areaOf(wait) >= 20, `${bp.id}: waiting room ${wait && areaOf(wait).toFixed(0)} m2`);
    assert.ok(bp.doors.some((d) => d.ext && d.entrance === 'main' && d.rooms.includes(wait.id)), `${bp.id}: the street door is not in the waiting room`);
    const exams = ground.filter((r) => r.type === 'office' && /^Consultorio/.test(r.name));
    assert.ok(exams.length >= 2, `${bp.id}: ${exams.length} consulting rooms`);
    for (const r of exams) {
      const d = doorBetween(bp, wait, r);
      assert.ok(d && d.rooms[1] === r.id, `${r.id}: no door from the waiting room into the consulting room`);
      assert.ok(areaOf(r) >= 9, `${r.id}: a ${areaOf(r).toFixed(1)} m2 consulting room`);
    }
    const pharmacy = ground.find((r) => r.type === 'shop'), toilets = ground.find((r) => r.type === 'bathroom');
    assert.equal(pharmacy.shopType, 'drogueria', `${bp.id}: the pharmacy is not a drogueria`);
    assert.ok(areaOf(pharmacy) >= 6 && doorBetween(bp, wait, pharmacy), `${bp.id}: pharmacy ${areaOf(pharmacy).toFixed(1)} m2 / door`);
    assert.ok(doorBetween(bp, wait, toilets), `${bp.id}: the toilets do not open onto the waiting room`);
    const hatch = bp.shell.arcades.find((a) => a.room === wait.id && a.y >= 0.9 && a.y <= 1.1);
    assert.ok(hatch, `${bp.id}: no counter hatch from the waiting room into the pharmacy`);
    for (let k = 1; k < bp.shell.F; k++) assert.ok(bp.rooms.some((r) => r.floor === k && r.type === 'hall') && bp.rooms.filter((r) => r.floor === k && /^Consultorio/.test(r.name)).length >= 2, `${bp.id} floor ${k} repeats the waiting hall and the consulting rooms`);
  }
});

// ---------------------------------------------------------------- hall
const halls = byKind('hall');
const stagePlans = halls.filter((bp) => bp.rooms.some((r) => r.tag === 'stage'));

test('a hall is one big room with a raised stage behind an arch, a small kitchen with a serving hatch, and toilets', () => {
  assert.ok(halls.length >= 6, `${halls.length} hall lots`);
  assert.ok(stagePlans.length >= 5, `only ${stagePlans.length} of ${halls.length} hall lots got the hall plan`);
  for (const bp of stagePlans) {
    const ground = bp.rooms.filter((r) => r.floor === 0), hall = ground.find((r) => r.name === 'Salón comunal'), stage = ground.find((r) => r.tag === 'stage');
    for (const r of ground) if (r !== hall) assert.ok(areaOf(hall) > areaOf(r) * 1.5, `${bp.id}: ${r.id} (${r.name}) is nearly as big as the hall`);
    assert.ok(areaOf(hall) >= 35, `${bp.id}: a ${areaOf(hall).toFixed(0)} m2 hall`);
    assert.ok(stage.noFurnish && stage.raise >= 0.3 && stage.raise <= 0.5, `${bp.id}: stage raise ${stage.raise}`);
    const deck = bp.shell.platforms.filter((p) => p.room === stage.id);
    assert.equal(deck.length, 1, `${bp.id}: ${deck.length} platforms under the stage`);
    assert.equal(deck[0].h, stage.raise, `${bp.id}: the deck is not as high as the room says`);
    const arch = bp.doors.find((d) => d.kind === 'arch' && d.rooms.includes(hall.id) && d.rooms.includes(stage.id));
    assert.ok(arch && arch.w >= 2.4 && arch.w <= 3.5, `${bp.id}: proscenium ${arch?.w}`);
    const kitchens = ground.filter((r) => r.type === 'kitchen'), baths = ground.filter((r) => r.type === 'bathroom');
    assert.equal(kitchens.length, 1, `${bp.id}: ${kitchens.length} kitchens`);
    assert.ok(doorBetween(bp, hall, kitchens[0]), `${bp.id}: the kitchen does not open onto the hall`);
    assert.ok(bp.shell.arcades.some((a) => a.room === hall.id && a.y >= 0.9 && a.y <= 1.1), `${bp.id}: no serving hatch from the kitchen into the hall`);
    assert.ok(baths.length >= 1 && baths.every((t) => doorBetween(bp, hall, t)), `${bp.id}: toilets missing or not off the hall`);
    assert.ok(bp.doors.some((d) => d.ext && d.entrance === 'main' && d.rooms.includes(hall.id)), `${bp.id}: the street door is not in the hall`);
  }
});

test('the stage is a step up, not a wall: a player walks up onto it through the arch and down again', () => {
  let probes = 0; const bad = [];
  for (const bp of stagePlans) {
    const hall = bp.rooms.find((r) => r.floor === 0 && r.name === 'Salón comunal'), stage = bp.rooms.find((r) => r.tag === 'stage');
    const arch = bp.doors.find((d) => d.kind === 'arch' && d.rooms.includes(hall.id) && d.rooms.includes(stage.id));
    const toStage = Math.sign((stage.rect.z0 + stage.rect.z1) / 2 - (hall.rect.z0 + hall.rect.z1) / 2);       // the proscenium wall runs along x; the stage lies on one side of it
    for (const speed of [2.3, 5.0]) for (const fps of [60, 20]) {
      const dt = 1 / fps;
      const run = (from, to, y) => {
        const A = bp.frame.toWorld(arch.x, y, from), B = bp.frame.toWorld(arch.x, y, to), len = Math.hypot(B[0] - A[0], B[2] - A[2]);
        const s = { x: A[0], z: A[2], y: A[1], vy: 0, onGround: true };
        for (let i = 0; i < 12 && !(s.onGround && i > 0); i++) ph.move(s, 0, 0, dt, PLAYER);
        const y0 = s.y;
        for (let i = 0; i < Math.ceil((len / speed) * fps) + 20; i++) ph.move(s, ((B[0] - A[0]) / len) * speed * dt, ((B[2] - A[2]) / len) * speed * dt, dt, PLAYER);
        return s.y - y0;
      };
      probes++;
      const up = run(arch.z - toStage * 1.2, arch.z + toStage * 1.2, arch.y), down = run(arch.z + toStage * 1.2, arch.z - toStage * 1.2, arch.y + stage.raise);
      if (Math.abs(up - stage.raise) > 0.06) bad.push(`${bp.id} speed ${speed} fps ${fps}: up the stage ${up.toFixed(2)} m, not ${stage.raise}`);
      if (Math.abs(down + stage.raise) > 0.06) bad.push(`${bp.id} speed ${speed} fps ${fps}: down off the stage ${down.toFixed(2)} m, not ${-stage.raise}`);
    }
  }
  assert.ok(probes >= 20, `${probes} probes`);
  assert.deepEqual(bad.slice(0, 8), []);
});

test('every room of a patio house opens somewhere: a door, an arch or (upstairs) a gallery, and each door sits wholly in its wall', () => {
  for (const bp of patioHouses) {
    const byId = new Map(bp.rooms.map((r) => [r.id, r]));
    for (const r of bp.rooms) if (!r.outdoor && !r.core) assert.ok(r.doors.length >= 1, `${r.id} (${r.type}) has no door`);
    for (const d of bp.doors) {
      if (!d.rooms[0] || !d.rooms[1]) continue;
      const sw = sharedWall(byId.get(d.rooms[0]).rect, byId.get(d.rooms[1]).rect), u = d.wall.dir === 'z' ? d.z : d.x;
      assert.ok(sw && u - d.w / 2 >= sw.a0 - 0.01 && u + d.w / 2 <= sw.a1 + 0.01, `${d.id} hangs off its wall`);
    }
  }
});
