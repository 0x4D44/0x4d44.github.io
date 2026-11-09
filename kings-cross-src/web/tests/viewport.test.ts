import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resizeViewport } from '../src/viewport.ts';

function fixture(ratio = 1) {
  let sizeCalls = 0, projections = 0, painted = false;
  const renderer = { domElement: { width: 1440 * ratio, height: 1000 * ratio }, getPixelRatio: () => ratio,
    setSize(width: number, height: number, style: boolean): void {
      assert.equal(style, false);
      ++sizeCalls; renderer.domElement.width = Math.floor(width * ratio); renderer.domElement.height = Math.floor(height * ratio);
      // Assigning a canvas drawing-buffer size invalidates its previous pixels.
      painted = false;
    },
  };
  const camera = { aspect: 1.44, updateProjectionMatrix(): void { ++projections; } };
  return { renderer, camera, paint: () => { painted = true; }, get painted() { return painted; },
    get sizeCalls() { return sizeCalls; }, get projections() { return projections; } };
}

test('a mobile frame followed by a late resize event retains its rendered pixels', () => {
  const f = fixture();
  // Device metrics change; a manual frame can run before window.resize is dispatched.
  resizeViewport(f.renderer, f.camera, 390, 844); f.paint();
  assert.equal(f.renderer.domElement.width, 390); assert.equal(f.camera.aspect, 390 / 844);
  // The delayed event must not assign the same canvas width and clear the fresh frame.
  assert.equal(resizeViewport(f.renderer, f.camera, 390, 844), false);
  assert.equal(f.painted, true); assert.equal(f.sizeCalls, 1); assert.equal(f.projections, 1);
});

test('viewport sizing respects DPR, preserves zero-sized views and avoids redundant projection resets', () => {
  const f = fixture(2);
  resizeViewport(f.renderer, f.camera, 390, 844);
  assert.deepEqual(f.renderer.domElement, { width: 780, height: 1688 });
  f.paint(); resizeViewport(f.renderer, f.camera, 390, 844);
  assert.equal(f.painted, true); assert.equal(f.sizeCalls, 1); assert.equal(f.projections, 1);
  assert.equal(resizeViewport(f.renderer, f.camera, 0, 0), false);
  assert.equal(f.painted, true); assert.equal(f.camera.aspect, 390 / 844);
});
