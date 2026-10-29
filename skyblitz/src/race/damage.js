// Central hit resolution: shield absorb, invulnerability, tumble, speed loss, stats and events.
// Every damage source (missile, mine, emp, lightning, cannon, hazard, ground) goes through applyHit so the rules
// (a shield absorbs ONE hit, hits never destroy, a hit is always followed by brief invulnerability) live in one place.
import { applyTumble } from '../flight/flight.js';
import { WEAPONS } from './balance.js';
import { clamp } from '../util.js';

/** Scale forward speed (keeps vel consistent). */
export function scaleSpeed(fs, k) {
  fs.speed *= k; fs.vel.multiplyScalar(k);
}

/**
 * Try to hurt `victim`. Returns true if the hit landed, false if absorbed/ignored.
 * opts: { tumble (s), loss (0..1 speed lost), severity (0..1), pos, pierce (ignore shield), shieldCost (s, partial absorb), invuln (extra s), noInvuln }
 */
export function applyHit(race, victim, by, kind, opts = {}) {
  if (!victim || victim.finished && kind !== 'lightning') return false;
  const ev = race.game.events, fs = victim.flight;
  const pos = opts.pos || fs.pos;
  if (victim.invuln > 0 && !opts.force) return false;
  if (victim.shield > 0 && !opts.pierce) {
    if (opts.shieldCost) { victim.shield = Math.max(0, victim.shield - opts.shieldCost); } else victim.shield = 0;
    ev.emit('shield:block', { racer: victim, by: by || null, kind });
    if (victim.shield <= 0) ev.emit('shield:down', { racer: victim });
    victim.invuln = Math.max(victim.invuln, 0.25);
    return false;
  }
  // armour (roster stat 1..10): shorter tumble and less speed lost; never below 0.8 s of tumble
  const armor = fs.spec?.stats?.armor ?? 5, armT = clamp(1.2 - 0.045 * armor, 0.75, 1.1), armL = clamp(1.25 - 0.05 * armor, 0.7, 1.1);
  const tumble = opts.tumble ? Math.max(0.8, opts.tumble * armT) : 0;
  victim.stats.hitsTaken++;
  if (by && by !== victim) by.stats.hitsDealt++;
  if (opts.loss) scaleSpeed(fs, 1 - opts.loss * armL);
  const severity = opts.severity ?? (tumble > 0 ? 0.8 : 0.25);
  ev.emit('racer:hit', { racer: victim, by: by || null, kind, pos: pos.clone ? pos.clone() : pos, severity });
  if (tumble > 0 && !(fs.tumble.t > 0.2)) {
    applyTumble(fs, tumble, race.rng.chance(0.5) ? 1 : -1);
    victim.tumble = tumble;
    victim.invuln = Math.max(victim.invuln, tumble + (opts.invuln ?? WEAPONS.invulnAfterHit));
    victim.empT = 0;
    ev.emit('racer:tumble', { racer: victim, duration: tumble });
  } else if (!opts.noInvuln) victim.invuln = Math.max(victim.invuln, opts.invuln ?? 0.12);
  return true;
}
