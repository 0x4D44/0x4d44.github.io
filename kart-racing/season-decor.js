// Apex Karts - seasonal decorations: entry point. main.js imports this only once an event is actually on, calls load(id) to
// fetch just that event's builder, and hands decorate() to createTrack(), which calls it after the track is fully built
// (scenery, sky and all). One builder per event; the shared kit finds clear spots on any track.
import { makeKit } from "./season-kit.js";

const SRC = {
  halloween: () => import("./season-halloween.js"),
  christmas: () => import("./season-christmas.js"),
  easter: () => import("./season-easter.js"),
};
const loaded = {};

export async function load(id) {
  if (!SRC[id]) throw new Error("unknown season " + id);
  if (!loaded[id]) loaded[id] = await SRC[id]();
  return loaded[id];
}

export function decorate(track, X, K) {
  const b = X.season && loaded[X.season.id];
  if (!b) return;
  const t0 = performance.now();
  const Z = makeKit(track, X, K);
  try { b.build(Z); } finally { Z.release(); }
  track.seasonStats = { ...Z.stats, tris: Math.round(Z.stats.tris), ms: Math.round(performance.now() - t0) };
  track.seasonInfo = { big: Z.big.map((p) => ({ x: p.x, y: p.y, z: p.z, s: p.s })), ...Z.debug };
  if (typeof location !== "undefined" && /[?&]seasondebug/.test(location.search)) console.log("[apex] season", X.season.id, track.id, JSON.stringify(track.seasonStats));
}
