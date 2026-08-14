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
import { resolve, join } from "node:path";
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
const SETTLE = Number(arg("settle", 2200));
const QUALITY = arg("quality", "high");

// Each shot names the moment it is meant to capture, so a reviewer can say
// "shot 7, the crest, looks flat" rather than "one of the screenshots".
const SHOTS = [
  { key: "menu", title: "Title screen", setup: null },
  {
    key: "startline", title: "On the start line, gravel, morning",
    drive: { stageIndex: 0 }, at: 0, speed: 0, camera: "chase", skipCountdown: false,
    autoDrive: false,   // it is meant to be sitting on the line
  },
  {
    key: "gravel-flat", title: "Flat out on gravel, chase camera",
    drive: { stageIndex: 0 }, atFrac: 0.18, speed: 130, camera: "chase",
  },
  {
    key: "gravel-slide", title: "Mid-corner on gravel with the car sideways",
    drive: { stageIndex: 0 }, atFrac: 0.32, speed: 95, camera: "chase",
    hold: ["throttle", "left"], holdMs: 1400,
  },
  {
    key: "cockpit", title: "Cockpit camera at speed",
    drive: { stageIndex: 0 }, atFrac: 0.45, speed: 110, camera: "cockpit",
  },
  {
    key: "bonnet", title: "Bonnet camera into a corner",
    drive: { stageIndex: 0 }, atFrac: 0.52, speed: 100, camera: "bonnet",
  },
  {
    key: "crest", title: "Over a crest, wheels light",
    drive: { stageIndex: 0 }, feature: "crest", speed: 125, camera: "chase",
    hold: ["throttle"], holdMs: 900,
  },
  {
    key: "jump", title: "Airborne off a jump",
    drive: { stageIndex: 0 }, feature: "jump", speed: 135, camera: "chase",
    hold: ["throttle"], holdMs: 1100,
  },
  {
    key: "hairpin", title: "Hairpin, handbrake on",
    drive: { stageIndex: 0 }, feature: "hairpin", speed: 60, camera: "chase",
    hold: ["handbrake", "left"], holdMs: 900,
  },
  {
    key: "forest", title: "Tight forest section",
    drive: { stageIndex: 1 }, atFrac: 0.4, speed: 105, camera: "chase",
  },
  {
    key: "tarmac", title: "Tarmac stage, dry",
    drive: { stageIndex: 2 }, atFrac: 0.3, speed: 140, camera: "chase",
  },
  {
    key: "rain", title: "Heavy rain, spray and wet road",
    drive: { stageIndex: 2, weather: "heavy-rain" }, atFrac: 0.35, speed: 110, camera: "chase",
    hold: ["throttle"], holdMs: 1200,
  },
  {
    key: "night", title: "Night stage on headlights",
    drive: { stageIndex: 1, weather: "night-clear" }, atFrac: 0.5, speed: 105, camera: "chase",
  },
  {
    key: "snow", title: "Snow stage",
    drive: { stageIndex: 3, weather: "light-snow" }, atFrac: 0.4, speed: 90, camera: "chase",
    hold: ["throttle", "right"], holdMs: 1200,
  },
  {
    key: "fog", title: "Hill fog",
    drive: { stageIndex: 0, weather: "hill-fog" }, atFrac: 0.6, speed: 95, camera: "chase",
  },
  {
    key: "golden", title: "Golden hour, long shadows",
    drive: { stageIndex: 0, weather: "golden-hour" }, atFrac: 0.25, speed: 120, camera: "chase",
  },
  {
    key: "phone", title: "Portrait phone, 390x844",
    drive: { stageIndex: 0 }, atFrac: 0.2, speed: 110, camera: "chase",
    viewport: [390, 844],
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const page = await openHarness({ root: ROOT, width: WIDTH, height: HEIGHT, quiet: false });
  const manifest = [];
  try {
    await page.navigate("/opus-rally/");
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
          const mod = await import("/opus-rally/stage.js");
          const def = mod.STAGE_BOOK[${shot.drive.stageIndex ?? 0} % mod.STAGE_BOOK.length];
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
          await page.waitFor(`${shot.key} to reach ${Math.round(target)} m`, async () => {
            const d = await page.evaluate("window.__opusRally.frame.distance");
            return d >= target ? d : null;
          }, 40_000).catch(() => null);
        }
      }

      await page.delay(SETTLE);
      const file = join(OUT, `${shot.key}.png`);
      // Record where the car actually was, so a reviewer can tell a real frame
      // from one taken in a field.

      await page.screenshot(file);
      const state = await page.evaluate(`(() => {
        try {
          const f = window.__opusRally.frame;
          return { speedKph: Math.round(f.speedKph), gear: f.gear, rpm: Math.round(f.rpm),
                   distance: Math.round(f.distance), surface: f.surfaceName,
                   airborne: f.airborne, state: window.__opusRally.state };
        } catch (e) { return { error: String(e) }; }
      })()`);
      manifest.push({ ...shot, file, state, errors: page.errors });
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
