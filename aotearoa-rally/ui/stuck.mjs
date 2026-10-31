// The "stuck" hint: pure text helpers (no DOM) so the wording and key labels are testable in node.
const KEY_NAMES = { Comma: ",", Period: ".", Space: "Space", Escape: "Esc", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right" };
export const keyLabel = (code) => KEY_NAMES[code] || String(code).replace(/^Key/, "").replace(/^Digit/, "");

/** "Stuck? Hold brake (Z) to reverse, or press R" using the player's own bindings (first key of each action). */
export function stuckHintText(bindings) {
  const first = (a) => (bindings && bindings[a] && bindings[a][0]) || null;
  const brake = first("brake"), reset = first("reset");
  return `Stuck? Hold ${brake ? "brake (" + keyLabel(brake) + ")" : "brake"} to reverse, or press ${reset ? keyLabel(reset) : "reset"}`;
}

/** What the HUD shows for a vehicle state: the hint text while state.stuck is true, "" otherwise. */
export function stuckHintFor(state, bindings) {
  return state && state.stuck ? stuckHintText(bindings) : "";
}
