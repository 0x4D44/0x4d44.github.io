// The frame's share for streaming work (js/core/budget.js, owner A1): ONE budget between the interiors made on demand, the warm-up of what is added after the boot and whatever a later
// sector registers, so a frame never carries more than the cap of them whoever is asking.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-budget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { STREAM_MS, IDLE_STREAM_MS, streamCap, streamLeft, streamSpend } from '../js/core/budget.js';

test('the cap is STREAM_MS in play and IDLE_STREAM_MS while nobody plays', () => {
  assert.equal(STREAM_MS, 4); assert.ok(IDLE_STREAM_MS > STREAM_MS);
  assert.equal(streamCap({ running: true }), STREAM_MS);
  assert.equal(streamCap({ running: false }), IDLE_STREAM_MS);
  assert.equal(streamCap({}), IDLE_STREAM_MS);
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
