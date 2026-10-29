// Co-driver timing table (offline, no browser, no audio):  node tests/machines-codriver-timing.mjs [stageId] [speedKmh]
// Prints, for every call on the stage at a constant speed, when it starts and how long before the feature it ends.
import { buildStage } from "../core/stage.mjs";
import { simulateCalls } from "../audio/codriver.mjs";
const id = process.argv[2] || "waitomo", kmh = +(process.argv[3] || 90);
const stage = buildStage(id), v = kmh / 3.6;
const rows = simulateCalls(stage.pacenotes, () => v);
console.log(`stage ${id} at ${kmh} km/h: ${rows.length} calls`);
console.log("noteS   startS  leadS  endBefore(m)  text");
for (const r of rows) console.log(`${r.noteS.toFixed(0).padStart(6)} ${r.startS.toFixed(0).padStart(7)} ${r.leadS.toFixed(2).padStart(6)} ${r.endBeforeM.toFixed(1).padStart(12)}  ${r.text}`);
const late = rows.filter((r) => r.endBeforeM < -1).length;
console.log(`late finishers (still speaking > 1 m after the feature): ${late}; mean lead ${(rows.reduce((a, r) => a + r.leadS, 0) / Math.max(1, rows.length)).toFixed(2)} s`);
