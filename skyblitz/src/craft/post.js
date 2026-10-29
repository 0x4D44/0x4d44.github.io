// STUB post-processing. The craft agent REPLACES this with the real pipeline (HDR bloom, AA, speed/boost radial blur, chromatic aberration,
// vignette, colour grade from course.environment) but keeps the contract:
//   createPost(game) -> { init(), setQuality(q), resize(w, h, pixelRatio), update(dt, game), render(dt), dispose() }
// render() must draw game.scene with game.camera to the screen (via a composer when game.q.post, otherwise directly).
export function createPost(game) {
  return {
    init() {}, setQuality(q) {}, resize(w, h, pr) {}, update(dt, g) {},
    render(dt) { game.renderer.render(game.scene, game.camera); },
    dispose() {},
  };
}
