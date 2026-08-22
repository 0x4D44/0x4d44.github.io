import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, WORLD_CHAMPIONSHIP } from '../src/content.js';
import { RallySession, runBestKey } from '../src/session.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const damage = value => ({ engine:value, steering:value, suspension:value, brakes:value, body:value });

test('practice selection resolves a complete run and stores its keyed best', () => {
  const storage = new MemoryStorage();
  const session = new RallySession(CATALOG, storage);
  const run = session.startPractice({ stageId:'aurora-forest', carId:'lumen-f2', difficultyId:'easy' });
  assert.equal(run.mode, 'practice');
  assert.deepEqual([run.stage.id, run.region.id, run.weather.id, run.car.id], ['aurora-forest', 'aurora-forest', 'aurora-clear', 'lumen-f2']);
  assert.equal(run.best, null);
  const result = session.completePractice({ timeSeconds:330, splits:[100, 215, 330] });
  assert.equal(result.isBest, true);
  assert.deepEqual(session.bestFor(run), { timeSeconds:330, splits:[100, 215, 330] });
  assert.equal(runBestKey(run), 'aurora-forest:lumen-f2:aurora-clear');
  const resumed = new RallySession(CATALOG, storage);
  assert.deepEqual(resumed.bestFor(run), { timeSeconds:330, splits:[100, 215, 330] });
});

test('a championship survives reload and classifies exactly after its final event', () => {
  const storage = new MemoryStorage();
  let session = new RallySession(CATALOG, storage);
  let state = session.createChampionship({ carId:'cairn-r4', difficultyId:'normal', seed:4401 });
  assert.equal(state.phase, 'service');
  assert.equal(state.championshipId, WORLD_CHAMPIONSHIP.id);

  let run = session.startChampionshipStage();
  assert.equal(run.mode, 'championship');
  assert.equal(run.stage.id, 'kestrel-ridge');
  assert.equal(run.runId, 'run:4401:0:1');
  session = new RallySession(CATALOG, storage);
  run = session.resumeChampionshipRun();
  assert.equal(run.runId, 'run:4401:0:1');
  assert.deepEqual(run.initialDamage, damage(0));
  state = session.completeChampionship({ timeSeconds:322.61, splits:[94.38, 204.37, 322.61], damage:damage(.05) }).state;
  assert.equal(state.phase, 'service');
  assert.equal(state.eventIndex, 1);

  session = new RallySession(CATALOG, storage);
  assert.equal(session.championship.phase, 'service');
  assert.equal(session.championship.eventIndex, 1);
  run = session.startChampionshipStage();
  assert.equal(run.stage.id, 'aurora-forest');
  assert.deepEqual(run.initialDamage, damage(0));
  const final = session.completeChampionship({ timeSeconds:330, splits:[110, 220, 330], damage:damage(.03) });
  assert.equal(final.state.phase, 'classified');
  assert.equal(final.state.results.length, 2);
  assert.equal(final.stageStandings.length, 6);
  assert.equal(final.overallStandings.length, 6);
  assert.throws(() => session.startChampionshipStage(), /classified/);
});

test('abandon and stale completion cannot mutate a saved competition', () => {
  const storage = new MemoryStorage();
  const session = new RallySession(CATALOG, storage);
  session.createChampionship({ carId:'lumen-f2', difficultyId:'hard', seed:77 });
  const run = session.startChampionshipStage();
  const abandoned = session.abandonChampionship();
  assert.equal(abandoned.phase, 'abandoned');
  assert.throws(
    () => session.completeChampionship({ runId:run.runId, timeSeconds:340, splits:[100, 220, 340], damage:damage(0) }),
    error => error.code === 'stale-run'
  );
  assert.equal(session.championship.phase, 'abandoned');
});
