// Audio entry (owner: A1) - placeholder until the procedural engine lands. Every method is a safe no-op.
export function initAudio(ctx) {
  ctx.audio = { ac: null, unlock() {}, setVolume() {}, chime() {}, state: () => ({ started: false }) };
  return ctx.audio;
}
