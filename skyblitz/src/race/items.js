// STUB item system. The race agent REPLACES this (item orbs, weapons, projectiles, homing, mines, shields, EMP, lightning...).
// Contract: new ItemSystem(race); fixedUpdate(dt); render(alpha, dt); useItem(racer, backward); dispose().
// It EMITS events on race.game.events (see the event catalogue) and never calls fx/audio/ui directly.
export class ItemSystem {
  constructor(race) { this.race = race; this.game = race.game; }
  fixedUpdate(dt) {}
  render(alpha, dt) {}
  useItem(racer, backward = false) {}
  dispose() {}
}
