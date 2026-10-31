// The loading card's bar (owner: A1; used by js/main.js, tested in node by tests/engine-bootbar.test.mjs).
//
// Every boot stage owns a share of the bar (its weight). A stage that counts its work ("12 of 61 buildings") moves the bar inside its share by reporting; a stage
// that only WAITS (the two people models are 9.5 MB, the warm-up frame is one call that blocks the page) reports nothing for many seconds, and a bar that sits still
// looks hung (review R2c-013: at 8 Mbit/s and 120 ms the bar stood at 100 % for 10-15 s). So a stage that has been silent for CREEP_AFTER_MS creeps toward the
// end of its share, slowly and never past CREEP_CEIL of it: it shows the page is alive without claiming the stage is nearly done. A real report takes over again.
// The bar never goes back, and a stage that ends always puts the bar exactly at the sum of the weights behind it.
//
// The weights are shares of the time an unthrottled boot spends in each stage (measured: furnish 3.8 s, warm 3.9 s, build 1.9 s, props 0.4 s, the rest well under a
// second), with a little extra for the stages that wait on the network when the link is slow (people, start). They used to give the warm-up frame 3 of 110, so the
// bar read 97 % for the longest freeze of the boot.

/** [stage, weight of the bar, what the card says while it runs, blocks?]. `blocks` = the stage keeps the page busy for seconds in one call: main.js paints its label first. */
export const STAGES = [
  ['engine', 2, 'Encendiendo la luz…'], ['materials', 2, 'Mezclando pinturas y materiales…'], ['assets', 3, 'Trayendo muebles y vecinos…'],
  ['plan', 3, 'Trazando calles y escaleras…'], ['world', 5, 'Levantando el cerro…'], ['arch', 2, 'Pensando cada casa…'],
  ['furnish', 24, 'Amueblando los cuartos…'], ['colliders', 1, 'Poniendo las paredes en su sitio…'], ['build', 16, 'Construyendo casas y tiendas…'],
  ['props', 4, 'Plantando árboles y postes…'], ['flush', 2, 'Juntándolo todo…'], ['glow', 1, 'Encendiendo las farolas…'], ['people', 12, 'Despertando a los vecinos…'],
  ['start', 6, 'Casi listo…'], ['warm', 18, 'Calentando la primera vista… (tarda unos segundos)', true],
];

export const CREEP_AFTER_MS = 1200;   // silent this long: the stage starts to creep
export const CREEP_CEIL = 0.8;        // ... toward this share of its weight, never past it
export const CREEP_RATE = 0.03;       // ... closing this part of the remaining way on every tick (main.js ticks every 300 ms: about 10 % of the way per second)
export const CREEP_TICK_MS = 300;

const clamp01 = (x) => (x > 0 ? (x < 1 ? x : 1) : 0);

export class BootBar {
  constructor(stages = STAGES) {
    this.stages = stages; this.total = stages.reduce((a, s) => a + s[1], 0);
    this.acc = 0; this.cur = stages[0]; this.sub = 0; this.lastReal = 0; this.open = false;
  }

  /** A stage starts: its share opens at 0. Returns the stage's row ([name, weight, label, blocks?]). */
  begin(name, now = 0) {
    this.cur = this.stages.find((s) => s[0] === name) ?? [name, 1, name];
    this.sub = 0; this.lastReal = now; this.open = true;
    return this.cur;
  }

  /** The stage says how far through its share it is (0..1). The bar never goes back: a number below what is shown is kept for later. */
  report(sub, now = 0) {
    if (!this.open) return;                    // between two stages the finished one's share is already behind the bar: a late report would count it twice
    this.sub = Math.max(this.sub, clamp01(sub)); this.lastReal = now;
  }

  /** The stage is over: its whole share is behind the bar. (A second call does nothing.) */
  end() {
    if (!this.open) return;
    this.open = false; this.acc += this.cur[1]; this.sub = 0;
  }

  /** Timer tick: a stage that has been silent for CREEP_AFTER_MS moves a little. True when the bar moved. */
  tick(now) {
    // main.js ticks on a timer: one that lands between end() and the next begin() (the yield between stages) must not creep the finished stage on top of its full share
    if (!this.open || now - this.lastReal < CREEP_AFTER_MS || this.sub >= CREEP_CEIL) return false;
    const next = this.sub + (CREEP_CEIL - this.sub) * CREEP_RATE;
    if (next <= this.sub) return false;
    this.sub = next; return true;
  }

  /** How full the bar is (0..1). */
  get fraction() {
    return Math.min(1, (this.acc + this.sub * this.cur[1]) / this.total);
  }
}
