import { clamp } from './math.js';

export class StageRun {
  constructor(stage) {
    this.stage = stage;
    this.best = null;
    this.reset(true);
  }
  reset(fullCountdown = false) {
    this.state = 'countdown';
    this.countdown = fullCountdown ? 3.65 : 0.78;
    this.elapsed = 0;
    this.splits = [];
    this.nextSplit = 0;
    this.nextNote = 0;
    this.activeNote = null;
    this.noteHideDistance = 0;
    this.lastProgress = 0;
    this.finishedTime = null;
    this.events = [];
  }
  setBest(best) { this.best = best; }
  update(car, dt) {
    this.events.length = 0;
    if (this.state === 'countdown') {
      const oldCount = Math.ceil(this.countdown);
      this.countdown -= dt;
      const newCount = Math.ceil(Math.max(0, this.countdown));
      if (newCount !== oldCount && oldCount <= 3) this.events.push({ type: 'count', value: newCount });
      if (this.countdown <= 0) { this.state = 'racing'; this.countdown = 0; this.events.push({ type: 'go' }); }
      return this.events;
    }
    if (this.state !== 'racing') return this.events;
    this.elapsed += dt;
    this.updatePaceNotes(car);
    this.updateSplits(car);
    this.lastProgress = car.progress;
    return this.events;
  }
  updatePaceNotes(car) {
    while (this.stage.notes[this.nextNote] && this.stage.notes[this.nextNote].at - car.progress <= -18) this.nextNote += 1;
    const note = this.stage.notes[this.nextNote];
    if (note) {
      const distance = note.at - car.progress;
      const severe = /HAIRPIN|TIGHTENS|CAUTION/.test(note.main + note.detail);
      const leadSeconds = severe ? 5.6 : 4.35;
      const leadDistance = clamp(Math.max(11, car.speed) * leadSeconds, severe ? 78 : 66, severe ? 205 : 175);
      if (distance <= leadDistance) {
        this.activeNote = note;
        this.noteHideDistance = note.at + 42;
        this.nextNote += 1;
        this.events.push({ type: 'pace', note, distance: Math.max(0, distance) });
      }
    }
    if (this.activeNote && car.progress > this.noteHideDistance) {
      this.activeNote = null;
      this.events.push({ type: 'pace-hide' });
    }
  }
  updateSplits(car) {
    const target = this.stage.splits[this.nextSplit];
    if (target == null) return;
    const crossedForward = this.lastProgress < target && car.progress >= target && car.longitudinalSpeed > 1;
    const nearRoad = Math.abs(car.lateral) < 12;
    if (!crossedForward || !nearRoad) return;
    const split = { distance: target, time: this.elapsed };
    this.splits.push(split);
    this.nextSplit += 1;
    if (this.nextSplit >= this.stage.splits.length) {
      this.state = 'finished';
      this.finishedTime = this.elapsed;
      this.events.push({ type: 'finish', time: this.elapsed, splits: this.splits.map(s => ({ ...s })) });
    } else {
      const bestSplit = this.best?.splits?.[this.nextSplit - 1]?.time;
      this.events.push({ type: 'split', split: this.nextSplit, time: this.elapsed, delta: Number.isFinite(bestSplit) ? this.elapsed - bestSplit : null });
    }
  }
}
