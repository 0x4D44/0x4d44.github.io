import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindStationFlightCancellation,
  sampleStationFlight,
  type StationControlsInput,
  type StationInputSource,
  type StationView,
} from '../src/station-transition.ts';

const from: StationView = { eye: [10, 80, 20], target: [1, 2, 3] };
const to: StationView = { eye: [110, 100, 60], target: [21, 12, -7] };

class FakeControls implements StationControlsInput {
  private readonly listeners = new Set<() => void>();

  addEventListener(_type: 'start', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'start', listener: () => void): void {
    this.listeners.delete(listener);
  }

  start(): void {
    for (const listener of this.listeners) listener();
  }
}

class FakeInputSource implements StationInputSource {
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  fire(type: string, event: Event = new Event(type)): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function keyboardEvent(key: string, target?: EventTarget): Event {
  return { key, target: target ?? null } as unknown as Event;
}

function inputHarness(): { controls: FakeControls; canvas: FakeInputSource; keyboardTarget: FakeInputSource } {
  return { controls: new FakeControls(), canvas: new FakeInputSource(), keyboardTarget: new FakeInputSource() };
}

test('station flight preserves both endpoint poses exactly', () => {
  assert.deepEqual([
    sampleStationFlight(from, to, 0, 40),
    sampleStationFlight(from, to, 1, 40),
  ], [from, to]);
});

test('station flight clamps normalized progress to its endpoint views', () => {
  assert.deepEqual([
    sampleStationFlight(from, to, -3, 40),
    sampleStationFlight(from, to, 4, 40),
  ], [from, to]);
});

test('station flight eases eye and target coordinates between views', () => {
  const view = sampleStationFlight(from, to, 0.5, 20);
  assert.deepEqual([view.eye[0], view.eye[2], view.target], [60, 40, [11, 7, -2]]);
});

test('station flight adds a high arc over the roof ceiling', () => {
  const view = sampleStationFlight(from, to, 0.5, 20);
  const straightHeight = (from.eye[1] + to.eye[1]) / 2;
  assert.ok(view.eye[1] >= straightHeight + 20, `midpoint height ${view.eye[1]} should rise above a straight camera path`);
});

test('station flight keeps every moving eye sample above the London roof ceiling', () => {
  const lowFrom: StationView = { eye: [0, 2, 0], target: [0, 0, 0] };
  const lowTo: StationView = { eye: [100, 4, 80], target: [100, 0, 80] };
  const roof = 30;
  const samples = [0.05, 0.15, 0.2, 0.35, 0.5, 0.65, 0.8, 0.85, 0.95]
    .map((progress) => sampleStationFlight(lowFrom, lowTo, progress, roof));
  const moving = samples.filter(({ eye }) => eye[0] !== lowFrom.eye[0] && eye[0] !== lowTo.eye[0]);
  assert.ok(moving.length > 0 && moving.every(({ eye }) => eye[1] >= roof + 12), 'horizontal transit must stay above the roof');
});

test('reduced motion resolves to the destination without sampling the arc', () => {
  assert.deepEqual(sampleStationFlight(from, to, 0.2, 80, { reducedMotion: true }), to);
});

test('OrbitControls start cancels once and detaches the other listeners', () => {
  const sources = inputHarness();
  let cancelled = 0;
  bindStationFlightCancellation(sources, () => { cancelled += 1; });
  sources.controls.start();
  sources.canvas.fire('wheel');
  assert.equal(cancelled, 1);
});

test('canvas pointer input cancels the station flight', () => {
  const sources = inputHarness();
  let cancelled = 0;
  bindStationFlightCancellation(sources, () => { cancelled += 1; });
  sources.canvas.fire('pointerdown');
  assert.equal(cancelled, 1);
});

test('canvas wheel input cancels the station flight', () => {
  const sources = inputHarness();
  let cancelled = 0;
  bindStationFlightCancellation(sources, () => { cancelled += 1; });
  sources.canvas.fire('wheel');
  assert.equal(cancelled, 1);
});

test('window navigation keys ignore editable/button targets and irrelevant keys, then cancel once', () => {
  const sources = inputHarness();
  let cancelled = 0;
  bindStationFlightCancellation(sources, () => { cancelled += 1; });
  const input = { closest: () => ({}) } as unknown as EventTarget;
  sources.keyboardTarget.fire('keydown', keyboardEvent('ArrowLeft', input));
  const counts = [cancelled];
  sources.keyboardTarget.fire('keydown', keyboardEvent('x'));
  counts.push(cancelled);
  const button = { closest: () => ({}) } as unknown as EventTarget;
  sources.keyboardTarget.fire('keydown', keyboardEvent('ArrowUp', button));
  counts.push(cancelled);
  sources.keyboardTarget.fire('keydown', keyboardEvent('Escape'));
  counts.push(cancelled);
  sources.keyboardTarget.fire('keydown', keyboardEvent('ArrowLeft'));
  counts.push(cancelled);
  sources.keyboardTarget.fire('keydown', keyboardEvent('ArrowRight'));
  counts.push(cancelled);
  assert.deepEqual(counts, [0, 0, 0, 1, 1, 1]);
});

test('returned disposer detaches cancellation listeners idempotently', () => {
  const sources = inputHarness();
  let cancelled = 0;
  const dispose = bindStationFlightCancellation(sources, () => { cancelled += 1; });
  dispose();
  dispose();
  sources.controls.start();
  sources.canvas.fire('pointerdown');
  sources.keyboardTarget.fire('keydown', keyboardEvent('ArrowUp'));
  assert.equal(cancelled, 0);
});
