/** Small explanatory models, not an emulator. See evidence/AUDIT.md for binary tests. */
export function combat(attacker, defender, repaired = true) {
  if (!Array.isArray(attacker) || !Array.isArray(defender) || attacker.length < 1 || attacker.length > 3 || defender.length < 1 || defender.length > 2 || [...attacker, ...defender].some(n => !Number.isInteger(n) || n < 1 || n > 6)) throw new RangeError('Use 1–3 attacker dice, 1–2 defender dice, and faces 1–6.');
  const a = [...attacker].sort((x, y) => y - x), d = [0, 0], trace = [];
  for (const roll of defender) {
    const previous = [...d];
    if (roll > d[0]) { d[1] = repaired ? d[0] : a[0]; d[0] = roll; }
    else d[1] = roll;
    trace.push({roll, previous, stored: [...d]});
  }
  const pairs = a.slice(0, Math.min(a.length, defender.length)).map((face, i) => ({a: face, d: d[i], lost: face > d[i] ? 'defender' : 'attacker'}));
  const lostA = pairs.filter(p => p.lost === 'attacker').length;
  const lostD = pairs.length - lostA;
  return {a, d: d.slice(0, defender.length), trace, pairs, lostA, lostD};
}
export function referenceCombat(a, d) {
  const aa = [...a].sort((x, y) => y - x), dd = [...d].sort((x, y) => y - x);
  const comparisons = Math.min(aa.length, dd.length);
  let lostA = 0;
  for (let i = 0; i < comparisons; i++) if (aa[i] <= dd[i]) lostA++;
  return {lostA, lostD: comparisons - lostA};
}
export function* rolls(n, prefix = []) {
  if (!n) { yield prefix; return; }
  for (let d = 1; d <= 6; d++) yield* rolls(n - 1, [...prefix, d]);
}
export function sweepConfiguration(na, nd) {
  let cases = 0, original = 0, repaired = 0;
  for (const dice of rolls(na + nd)) {
    const a = dice.slice(0, na), d = dice.slice(na), expected = referenceCombat(a, d);
    for (const fixed of [false, true]) {
      const actual = combat(a, d, fixed);
      if (actual.lostA !== expected.lostA || actual.lostD !== expected.lostD) fixed ? repaired++ : original++;
    }
    cases++;
  }
  return {na, nd, cases, original, repaired};
}
/** Nonzero winding fill. Points on edges are deliberately not a native GDI claim. */
export function hit(points, x, y) {
  let winding = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const side = (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
    if (a[1] <= y && b[1] > y && side > 0) winding++;
    if (a[1] > y && b[1] <= y && side < 0) winding--;
  }
  return winding !== 0;
}
export function polygon(territory, repaired, includeSentinel = true) {
  const points = territory.points.map(p => [...p]);
  if (!repaired) {
    for (const c of territory.corrections) points[c.vertex] = [...c.before];
    if (includeSentinel) points.push([-100, -100]);
  }
  return points;
}
/** Controlled ordered deck; reshuffling restarts it to make the boundary observable. */
export function deckDraw(draw, repaired = true) {
  if (!Number.isInteger(draw) || draw < 1 || draw > 45) throw new RangeError('Draw must be 1–45.');
  const period = repaired ? 44 : 43, slot = (draw - 1) % period;
  return {slot, card: slot < 42 ? ['Infantry', 'Cavalry', 'Artillery'][slot % 3] : 'Wildcard', reshuffled: draw > period};
}
export function setupOutcome(result, repaired, edited = 'Ada') {
  if (![0, 1, -1].includes(result)) throw new RangeError('Dialog result must be Cancel (0), OK (1), or failure (-1).');
  return {accepted: repaired ? result === 1 : result !== 0, name: result === -1 ? 'Player1' : repaired && result !== 1 ? 'Player1' : edited};
}
export function hex(n, width = 4) { return '0x' + n.toString(16).toUpperCase().padStart(width, '0'); }
