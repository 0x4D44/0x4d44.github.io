// Captures a scripted set of screenshots of the running game, so a reviewer can
// look at what the player would actually see rather than reasoning about the
// code that draws it.
//
//   node tests/shoot.mjs --out <dir> [--only menu,forest,jump] [--width 1600] [--height 900]
//
// Everything is driven through window.__opusRally, the scripted-drive surface
// game.js exposes, because under a software GL stack you cannot reach a jump by
// holding the throttle and hoping.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { openHarness } from "./drive.mjs";

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const OUT = resolve(arg("out", "shots"));
const WIDTH = Number(arg("width", 1600));
const HEIGHT = Number(arg("height", 900));
const ONLY = arg("only", null)?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
const ROOT = resolve(import.meta.dirname, "../..");
const APP_PATH = "/" + basename(resolve(import.meta.dirname, "..")) + "/";
const SETTLE = Number(arg("settle", 2200));
const QUALITY = arg("quality", "high");

// Each shot names the moment it is meant to capture, so a reviewer can say
// "shot 7, the crest, looks flat" rather than "one of the screenshots".
//
// Stages are named by ID, never by index. They used to be indices, and when the
// stage book was reordered the "snow stage" shot silently started photographing
// mountain tarmac and the "tarmac" shot gravel — three critics duly reported
// that the snow stage had no snow, which was true and entirely the fault of this
// file. An unknown id is a hard error below rather than a wrong picture.
const SHOTS = [
  { key: "menu", title: "Title screen", setup: null },
  {
    key: "startline", title: "On the start line, gravel, golden hour",
    drive: { stage: "kloft-bjornhalt" }, at: 0, speed: 0, camera: "chase", skipCountdown: false,
    autoDrive: false,   // it is meant to be sitting on the line
  },
  {
    key: "gravel-flat", title: "Flat out on forest gravel",
    drive: { stage: "kloft-bjornhalt" }, atFrac: 0.18, speed: 130, camera: "chase",
  },
  {
    key: "gravel-slide", title: "Mid-corner on gravel",
    drive: { stage: "kloft-bjornhalt" }, atFrac: 0.32, speed: 95, camera: "chase",
  },
  {
    key: "cockpit", title: "Cockpit camera at speed",
    drive: { stage: "kloft-bjornhalt" }, atFrac: 0.45, speed: 110, camera: "cockpit",
  },
  {
    key: "bonnet", title: "Bonnet camera into a corner",
    drive: { stage: "kloft-bjornhalt" }, atFrac: 0.52, speed: 100, camera: "bonnet",
  },
  {
    key: "crest", title: "Over a crest, wheels light",
    drive: { stage: "kloft-bjornhalt" }, feature: "crest", speed: 125, camera: "chase",
  },
  {
    key: "jump", title: "Airborne off a jump",
    drive: { stage: "kloft-bjornhalt" }, feature: "jump", speed: 135, camera: "finish",
    captureWhen: "airborne", minAirTime: 0.25, settle: 1800, freeze: true,
    require: { airborne: true },
  },
  {
    key: "hairpin", title: "Hairpin",
    drive: { stage: "kloft-bjornhalt" }, feature: "hairpin", speed: 60, camera: "chase",
  },
  {
    key: "forest", title: "Wet forest gravel",
    drive: { stage: "northmarch-kestrel" }, atFrac: 0.4, speed: 105, camera: "chase",
  },
  {
    key: "tarmac", title: "Mountain tarmac, hard noon",
    drive: { stage: "alvenda-calderas" }, atFrac: 0.3, speed: 140, camera: "chase",
  },
  {
    key: "rain", title: "Heavy rain and spray on tarmac",
    drive: { stage: "vardhal-havnvik", weather: "heavy-rain" }, atFrac: 0.35, speed: 110, camera: "chase",
  },
  {
    key: "night", title: "Night stage on headlights",
    drive: { stage: "kloft-bjornhalt", weather: "night-clear" }, atFrac: 0.5, speed: 105, camera: "chase",
  },
  {
    key: "snow", title: "Snow over the ice stage",
    drive: { stage: "kloft-skarvedal", weather: "blizzard" }, atFrac: 0.4, speed: 80, camera: "chase",
  },
  {
    key: "fog", title: "Hill fog on the coast road",
    drive: { stage: "vardhal-havnvik", weather: "hill-fog" }, atFrac: 0.6, speed: 95, camera: "chase",
  },
  {
    key: "golden", title: "Golden hour, long shadows",
    drive: { stage: "tamarosa-escarpa", weather: "golden-hour" }, atFrac: 0.25, speed: 120, camera: "chase",
  },
  {
    key: "phone", title: "Portrait phone, 390x844",
    drive: { stage: "kloft-bjornhalt" }, atFrac: 0.2, speed: 110, camera: "chase",
    viewport: [390, 844], autoDrive: false, settle: 1200, freeze: true,
    require: { surface: "Gravel" },
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const page = await openHarness({ root: ROOT, width: WIDTH, height: HEIGHT, quiet: false });
  const manifest = [];
  try {
    await page.navigate(APP_PATH);
    await page.waitFor("the game to boot", () => page.evaluate("!!window.__opusRally"), 120_000);

    const book = await page.evaluate(
      "JSON.stringify((window.__opusRally && window.OPUS_RALLY) ? [] : [])",
    );
    void book;

    for (const shot of SHOTS) {
      if (ONLY && !ONLY.includes(shot.key)) continue;
      process.stderr.write(`[shoot] ${shot.key}: ${shot.title}\n`);
      page.clearErrors();

      const [vw, vh] = shot.viewport ?? [WIDTH, HEIGHT];
      await page.setViewport(vw, vh);

      if (shot.drive) {
        const ok = await page.evaluate(`(async () => {
          const h = window.__opusRally;
          const mod = await import("${APP_PATH}stage.js");
          const wanted = ${JSON.stringify(shot.drive.stage)};
          const def = mod.STAGE_BOOK.find((s) => s.id === wanted);
          if (!def) throw new Error("shoot: no stage with id " + wanted);
          await h.drive({
            stageId: def.id,
            ${shot.drive.weather ? `weather: ${JSON.stringify(shot.drive.weather)},` : ""}
            skipCountdown: ${shot.skipCountdown === false ? "false" : "true"},
          });
          return true;
        })()`);
        if (!ok) throw new Error(`${shot.key}: drive() refused`);
        await page.delay(900);

        const where = shot.feature
          ? `(() => {
              const st = window.__opusRally.frame && window.OPUS_RALLY.game.stage;
              const f = (st.features || []).find((x) => x.kind === ${JSON.stringify(shot.feature)});
              return f ? f.s : st.length * 0.4;
            })()`
          : shot.at != null
            ? String(shot.at)
            : `window.OPUS_RALLY.game.stage.length * ${shot.atFrac ?? 0.3}`;

        // Arrive at the spot rather than being dropped on it. placeAt puts the
        // car down a run-up short of the target at a speed it can actually
        // carry, and the driver brings it in; a car teleported to 130 km/h on a
        // curve is off the road before the shutter opens.
        const runUp = shot.autoDrive === false ? 0 : (shot.runUp ?? 180);
        await page.evaluate(
          `window.__opusRally.placeAt(Math.max(0, (${where}) - ${runUp}), `
          + `${Math.min(shot.speed ?? 0, 70)})`,
        );
        if (shot.camera) await page.evaluate(`window.__opusRally.setCamera(${JSON.stringify(shot.camera)})`);
        // The autoscaler is measuring a software rasteriser here and would drop
        // to the lowest preset within a second, so every screenshot would show
        // the game with its shadows and post switched off. Pin the quality: we
        // are photographing what a real GPU renders, not what SwiftShader can.
        await page.evaluate(`(window.OPUS_RALLY.game.renderer.setQuality(${JSON.stringify(QUALITY)}), true)`);
        if (shot.freeze && shot.autoDrive === false) {
          await page.evaluate("window.__opusRally.holdForCapture(true)");
        }
        await page.delay(400);
        // Drive the stage rather than free-running with no input. placeAt drops
        // the car on the centreline pointing down the tangent; a couple of
        // seconds later on any curving road it is in a field, and nine of the
        // fourteen frames in the previous set were pictures of grass.
        if (shot.autoDrive !== false) {
          await page.evaluate(`window.__opusRally.setAutoDrive(true, ${shot.pace ?? 0.7})`);
          // Drive until it reaches the spot the shot is named after, rather than
          // for a fixed time — under a software rasteriser a fixed wait covers a
          // wildly variable distance.
          const target = await page.evaluate(String(where));
          if (shot.captureWhen === "airborne") {
            // A jump feature marks its approach, not the single video frame at
            // the apex. Waiting for the feature and then applying the normal
            // settle delay photographs the landing while labelling it airborne.
            // Poll the actual physics state, then hold that frame while the
            // camera settles and Chrome encodes it.
            await page.waitFor(`${shot.key} to become airborne`, async () => {
              const f = await page.evaluate("window.__opusRally.frame");
              return f.airborne && f.telemetry?.airTime >= (shot.minAirTime ?? 0)
                && f.distance >= target - 30 ? f : null;
            }, 40_000);
          } else {
            await page.waitFor(`${shot.key} to reach ${Math.round(target)} m`, async () => {
              const d = await page.evaluate("window.__opusRally.frame.distance");
              return d >= target ? d : null;
            }, 40_000);
          }
          if (shot.freeze) {
            await page.evaluate("window.__opusRally.holdForCapture(true)");
          }
        }
      }

      await page.delay(shot.settle ?? SETTLE);
      const file = join(OUT, `${shot.key}.png`);
      // Record where the car actually was, so a reviewer can tell a real frame
      // from one taken in a field.

      await page.screenshot(file);
      const state = await page.evaluate(`(() => {
        try {
          const f = window.__opusRally.frame;
          const st = window.OPUS_RALLY.game.stage;
          return { speedKph: Math.round(f.speedKph), gear: f.gear, rpm: Math.round(f.rpm),
                   distance: Math.round(f.distance), surface: f.surfaceName,
                   airborne: f.airborne, airTime: Number((f.telemetry?.airTime ?? 0).toFixed(3)),
                   state: window.__opusRally.state,
                   // What stage this really is, so a reviewer never has to take
                   // the shot's name on trust.
                   stageId: st ? st.id : null,
                   stageName: st ? st.name : null,
                   weather: window.OPUS_RALLY.game.weather?.current?.name ?? null };
        } catch (e) { return { error: String(e) }; }
      })()`);
      manifest.push({ ...shot, file, state, errors: page.errors });
      for (const [field, wanted] of Object.entries(shot.require ?? {})) {
        if (state[field] !== wanted) {
          throw new Error(`${shot.key}: required ${field}=${JSON.stringify(wanted)}, got ${JSON.stringify(state[field])}`);
        }
      }
      if (page.errors.length) {
        process.stderr.write(`[shoot]   page errors: ${page.errors.join(" | ")}\n`);
      }
    }
  } finally {
    await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
    page.close();
  }
  process.stderr.write(`[shoot] wrote ${manifest.length} shots to ${OUT}\n`);
}

main().catch((err) => {
  process.stderr.write(`[shoot] failed: ${err.stack ?? err}\n`);
  process.exit(1);
});
