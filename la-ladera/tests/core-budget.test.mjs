// The frame's share for streaming work (js/core/budget.js, owner A1): ONE budget between the interiors made on demand, the warm-up of what is added after the boot and whatever a later
// sector registers, so a frame never carries more than the cap of them whoever is asking.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-budget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { STREAM_MS, STREAM_MAX_MS, IDLE_STREAM_MS, streamCap, streamLeft, streamSpend, streamAdapt } from '../js/core/budget.js';

test('the cap is STREAM_MS in play and IDLE_STREAM_MS while nobody plays', () => {
  assert.equal(STREAM_MS, 4); assert.ok(IDLE_STREAM_MS > STREAM_MS);
  assert.equal(streamCap({ running: true }), STREAM_MS);
  assert.equal(streamCap({ running: false }), IDLE_STREAM_MS);
  assert.equal(streamCap({}), IDLE_STREAM_MS);
});

/** `n` frames of the same shape: `work` ms of the frame's own work in a frame that is `dt` ms long. */
const frames = (ctx, work, dt, n = 120) => { for (let i = 0; i < n; i++) streamAdapt(ctx, work, dt); return streamCap(ctx); };

test('in play the cap follows what the machine has to spare: the ceiling for a light frame, the floor for a heavy one, never beyond either', () => {
  assert.ok(STREAM_MAX_MS > STREAM_MS && STREAM_MAX_MS <= 6.5, 'the ceiling is a modest one: engine-streamframes holds the spend per frame to 8 ms at the median');
  assert.equal(frames({ running: true }, 4, 16.7), STREAM_MAX_MS, '4 ms of work in a 16.7 ms frame: the ceiling');
  assert.equal(frames({ running: true }, 11, 16.7), STREAM_MS, '11 ms of work in a 16.7 ms frame: the floor');
  assert.equal(frames({ running: true }, 30, 33.3), STREAM_MS, 'a machine that cannot hold 30 fps: the floor');
  const mid = frames({ running: true }, 8, 16.7); assert.ok(mid > STREAM_MS && mid < STREAM_MAX_MS, `8 ms of work: in between (${mid})`);
  assert.equal(frames({ running: true }, 3, 8.3), STREAM_MS, 'a 120 Hz display has 8.3 ms to a frame: nothing to spare');
  assert.equal(frames({ running: true }, 0, 16.7), STREAM_MAX_MS, 'nothing to draw: the ceiling, and not a millisecond over it');
});

test('the cap starts at the floor, falls the frame the work does, comes back as the work does, and the title card keeps its own', () => {
  const ctx = { running: true };
  assert.equal(streamCap(ctx), STREAM_MS, 'no frame has been seen');
  streamAdapt(ctx, 4, 16.7); assert.ok(streamCap(ctx) <= STREAM_MAX_MS);
  frames(ctx, 4, 16.7); assert.equal(streamCap(ctx), STREAM_MAX_MS);
  streamAdapt(ctx, 120, 50);                                                        // the first real frame of a game compiles what the camera sees
  assert.ok(streamCap(ctx) < STREAM_MAX_MS, `one 120 ms frame brings it down (${streamCap(ctx)})`);
  streamAdapt(ctx, 120, 50); streamAdapt(ctx, 120, 50); streamAdapt(ctx, 120, 50); streamAdapt(ctx, 120, 50); streamAdapt(ctx, 120, 50);
  assert.equal(streamCap(ctx), STREAM_MS, 'and a few of them to the floor');
  assert.equal(frames(ctx, 4, 16.7, 100), STREAM_MAX_MS, 'light frames bring it back');
  ctx.running = false; assert.equal(streamCap(ctx), IDLE_STREAM_MS, 'a title card or a pause: the idle cap');
  ctx.running = true; ctx.streamCap = 99; assert.equal(streamCap(ctx), STREAM_MAX_MS, 'a cap that was set from outside is held to the ceiling');
  ctx.streamCap = -3; assert.equal(streamCap(ctx), STREAM_MS, 'and to the floor');
  const bad = { running: true }; streamAdapt(bad, NaN, 16.7); streamAdapt(bad, 4, 0); streamAdapt(bad, -1, 16.7); streamAdapt(bad, 4, undefined);
  assert.equal(streamCap(bad), STREAM_MS, 'a frame that did not measure is ignored');
});

test('a spare cap is what streamLeft gives a frame of play, spending still comes off it', () => {
  const ctx = { running: true, opts: {}, loopOn: true }; frames(ctx, 4, 16.7);
  assert.equal(streamLeft(ctx), STREAM_MAX_MS);
  streamSpend(ctx, 2.5); assert.equal(streamLeft(ctx), STREAM_MAX_MS - 2.5);
});

test('a context with no frame loop of its own (?manual, the tests) has the whole budget however much is spent', () => {
  const ctx = { running: true, opts: { manual: true } };
  streamSpend(ctx, 3.5);
  assert.equal(streamLeft(ctx), STREAM_MS);
  assert.equal(streamLeft({ running: true, opts: {} }), STREAM_MS, 'and so has one whose loop has not started');
});

test('with the loop on, spending is added up over the frame and what is left never goes below zero', () => {
  const ctx = { running: true, opts: {}, loopOn: true };
  assert.equal(streamLeft(ctx), STREAM_MS);
  streamSpend(ctx, 1.5); assert.equal(streamLeft(ctx), 2.5);
  streamSpend(ctx, 2); assert.equal(streamLeft(ctx), 0.5);
  streamSpend(ctx, 30); assert.equal(streamLeft(ctx), 0, 'one slow step overspent the frame: nothing more is taken from it');
  ctx.streamMs = 0;                                                    // (engine/index.js clears the account when the frame ends)
  assert.equal(streamLeft(ctx), STREAM_MS);
});

test('a caller can ask against its own cap (the card frames, a pause), and a negative spend is ignored', () => {
  const ctx = { running: false, opts: {}, loopOn: true };
  assert.equal(streamLeft(ctx), IDLE_STREAM_MS);
  streamSpend(ctx, 5); assert.equal(streamLeft(ctx), IDLE_STREAM_MS - 5);
  assert.equal(streamLeft(ctx, 6), 1);
  streamSpend(ctx, -10); assert.equal(streamLeft(ctx), IDLE_STREAM_MS - 5, 'a clock that ran backwards adds nothing and takes nothing back');
});
