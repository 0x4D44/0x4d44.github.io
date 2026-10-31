// The MP4 export. Drives window.__export (the page's test hook) in headless Chrome: encodes clips, pulls them out, checks them with ffprobe / ffmpeg,
// then drives the real Render button with a trusted click against an OPFS-backed stand-in for showSaveFilePicker (the native dialog cannot run headless).
// Needs ffmpeg and ffprobe on the PATH (PTB_FFMPEG / PTB_FFPROBE name them): without them THIS suite says so and skips; nothing else does.
// The page loads three.js and mp4-muxer from cdn.jsdelivr.net: this suite needs the network.
//   usage: node export.test.mjs [from=10] [to=12]        a 2D clip [from, to) in seconds (default EXPORT.cad in expect.mjs)
//   env:   PTB_SITE=<site root>   another copy of the site
//          PTB_MINGB=8            minimum free commit (GB) before Chrome is launched; the run waits for it (0 turns the wait off); PTB_WAITMIN=25 minutes to wait
//          PTB_SKIP3D=1           skip the 3D clips;  PTB_EXPORT_ONLY=ui|clips|3d  limits the run
// Every file this makes (clips, decoded frames, the browser's downloads) goes into one folder under the temp folder and is removed when the suite ends.
import { suite } from "./lib/suite.mjs";
import { launch, delay, scratchRoot } from "./lib/cdp.mjs";
import { serveDbg } from "./lib/dbg.mjs";
import { gpuArgs } from "./lib/chrome.mjs";
import { SITE, PAGE } from "./lib/site.mjs";
import { EXPORT } from "./expect.mjs";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { freemem } from "node:os";
import { join, resolve } from "node:path";

const E = suite("export");
const FFMPEG = process.env.PTB_FFMPEG || "ffmpeg", FFPROBE = process.env.PTB_FFPROBE || "ffprobe";
const ff = (cmd, args, opts = {}) => { const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, windowsHide: true, ...opts }); if (r.error) throw r.error; return r; };
const freeGB = () => process.platform === "win32"
  ? parseFloat(ff("powershell", ["-NoProfile", "-Command", "((Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory/1MB).ToString([Globalization.CultureInfo]::InvariantCulture)"]).stdout)
  : freemem() / 2 ** 30;
const FROM = +(process.argv[2] ?? EXPORT.cad[0]), TO = +(process.argv[3] ?? EXPORT.cad[1]);
const MINGB = +(process.env.PTB_MINGB ?? 8), WAITMIN = +(process.env.PTB_WAITMIN ?? 25);
const ONLY = process.env.PTB_EXPORT_ONLY || "", SKIP3D = process.env.PTB_SKIP3D === "1";
const NF = Math.round((TO - FROM) * 60);
const until = async (fn, ms = 600000, step = 100) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("timed out waiting"); await delay(step); } };
const LONG = { timeout: 1800000 };

await E.run(async () => {
  if (!E.needChrome()) return;
  for (const [what, cmd] of [["ffmpeg", FFMPEG], ["ffprobe", FFPROBE]]) {
    let ok = false;
    try { ok = ff(cmd, ["-version"]).status === 0; } catch { ok = false; }
    if (!ok) { E.skip(`${what} is not available (looked for "${cmd}" on the PATH; set PTB_${what.toUpperCase()}=<binary>). The export suite needs both to check the MP4 files it makes; every other suite still runs`); return; }
  }
  const OUT = await mkdtemp(join(scratchRoot(), "ptb-export-"));
  let ALLOWED_WARN = 0;                                        // export warnings a test provoked on purpose
  const check = (name, pass, detail = "") => E.check(name, pass, detail);

  function probe(file) {
    const r = ff(FFPROBE, ["-v", "error", "-count_frames", "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,profile,level,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,pix_fmt,color_space,color_range,color_primaries,color_transfer,duration",
      "-show_entries", "format=duration,size,format_name", "-of", "json", file]);
    if (r.status !== 0) throw new Error("ffprobe failed: " + r.stderr);
    const j = JSON.parse(r.stdout);
    return { s: j.streams[0], f: j.format };
  }
  // top-level MP4 boxes in file order
  function boxes(buf) {
    const out = []; let o = 0;
    while (o + 8 <= buf.length) {
      let size = buf.readUInt32BE(o); const type = buf.toString("latin1", o + 4, o + 8);
      if (size === 1) size = Number(buf.readBigUInt64BE(o + 8)); else if (size === 0) size = buf.length - o;
      out.push(type); if (size < 8) break; o += size;
    }
    return out;
  }
  const psnr = (a, b) => {
    const r = ff(FFMPEG, ["-hide_banner", "-i", a, "-i", b, "-lavfi", "psnr", "-f", "null", "-"]);
    const m = /average:(inf|[\d.]+)/.exec(r.stderr);
    return m ? (m[1] === "inf" ? Infinity : +m[1]) : NaN;
  };
  // which frames of two clips differ, and by how much: { total, count, worst: [{ n, p }] } (p = PSNR of that frame, lowest first)
  const frameDiffs = (a, b) => {
    const r = ff(FFMPEG, ["-hide_banner", "-i", a, "-i", b, "-lavfi", "psnr=stats_file=frames.txt", "-f", "null", "-"], { cwd: OUT });
    const lines = readFileSync(join(OUT, "frames.txt"), "utf8").split("\n").filter(Boolean).map((l) => ({ n: +/n:(\d+)/.exec(l)[1], p: /psnr_avg:(inf|[\d.]+)/.exec(l)[1] }));
    const fin = lines.filter((x) => x.p !== "inf").map((x) => ({ n: x.n - 1, p: +x.p })).sort((x, y) => x.p - y.p);
    return { total: lines.length, count: fin.length, worst: fin.slice(0, 5) };
  };
  const frameMd5 = (file) =>ff(FFMPEG, ["-v", "error", "-i", file, "-f", "framemd5", "-"]).stdout.split("\n").filter((l) => l && l[0] !== "#").map((l) => l.split(",").pop().trim());
  const decodeFrame = (file, n, png) => { const r = ff(FFMPEG, ["-v", "error", "-y", "-i", file, "-vf", `select=eq(n\\,${n})`, "-frames:v", "1", png]); if (r.status !== 0) throw new Error("ffmpeg decode failed: " + r.stderr); };
  const okBoxes = (b) => b.includes("moov") && b.includes("mdat") && b.indexOf("moov") < b.indexOf("mdat");
  const fpsOf = (m) => (m.frames / (m.ms / 1000)).toFixed(1);

  let gb = freeGB();
  for (let w = 0; MINGB > 0 && !(gb >= MINGB) && w < WAITMIN * 3; w++) { E.info(`free commit ${gb.toFixed(2)} GB < ${MINGB} GB: waiting for the box`); await delay(20000); gb = freeGB(); }
  E.info(`free commit ${gb.toFixed(2)} GB (need ${MINGB})`);
  if (MINGB > 0 && !(gb >= MINGB)) { check("enough free commit memory to launch Chrome", false, `${gb.toFixed(2)} GB free, ${MINGB} GB needed (PTB_MINGB=0 turns the wait off)`); await rm(OUT, { recursive: true, force: true }).catch(() => {}); return; }

  const srv = await serveDbg(SITE, "", { "/favicon.ico": "x" });
  const br = await launch({ width: 1400, height: 900, args: gpuArgs() });
  let page, dws;
  try {
    E.info("browser: " + (await br.send("Browser.getVersion")).product);
    // download events need a DevTools connection of their own that enables them (the harness's socket does not forward browser-level events)
    const ver = await (await fetch(`http://127.0.0.1:${br.port}/json/version`)).json();
    dws = new WebSocket(ver.webSocketDebuggerUrl);
    const dlEv = [];
    await new Promise((res, rej) => { dws.onopen = res; dws.onerror = rej; });
    dws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.method && /^Browser\.download/.test(m.method)) dlEv.push(m); };
    dws.send(JSON.stringify({ id: 1, method: "Browser.setDownloadBehavior", params: { behavior: "allowAndName", downloadPath: resolve(OUT), eventsEnabled: true } }));
    page = await br.newPage(`${srv.base}/${PAGE}`);
    for (let i = 0; i < 600 && !(await page.eval("window.__ready === true && typeof window.__export === 'object'").catch(() => false)); i++) await delay(100);
    const T = await page.eval("window.__tl.T"), S = await page.eval("window.__tl.T3.swap");
    E.info(`page ready; T = ${T}; T3.swap = ${S}`);

    // ---- encoders this build accepts at 2560x1440@60
    const cod = await page.eval("__export.codecs()");
    E.info("codecs: " + cod.map((c) => `${c.codec}/${c.hw}=${c.supported ? "yes" : "no"}`).join("  "));

    const pull = async (size) => {
      const parts = [];
      for (let off = 0; off < size; off += 1 << 20) parts.push(Buffer.from(await page.eval(`__export.take(${off}, ${1 << 20})`), "base64"));
      return Buffer.concat(parts);
    };
    const runClip = async (name, from, to, extra = "") => {
      const m = await page.eval(`(async () => { const r = await __export.run({ from: ${from}, to: ${to}${extra} }); return { frames: r.frames, codec: r.codec, hw: r.hw, ms: r.ms, size: r.bytes.length }; })()`, LONG);
      const buf = await pull(m.size);
      await writeFile(join(OUT, name), buf);
      return { m, buf };
    };
    const refPng = async (file, t) => { await writeFile(join(OUT, file), Buffer.from((await page.eval(`__tl.png(${t}, 2560)`, LONG)).split(",")[1], "base64")); };
    // decode frame n of a clip and compare it with a fresh renderFrame(t) from the same page
    const cmpFrame = async (clip, tag, n, t) => {
      const dec = join(OUT, `${tag}-dec${n}.png`);
      decodeFrame(join(OUT, clip), n, dec); await refPng(`${tag}-ref${n}.png`, t);
      return psnr(dec, join(OUT, `${tag}-ref${n}.png`));
    };
    const clipChecks = async (label, clip, A, from, to, tag) => {
      const nf = Math.round((to - from) * 60), i0 = Math.round(from * 60);
      E.info(`${label}: ${A.m.frames} frames, ${A.m.codec} (${A.m.hw}), ${A.m.ms.toFixed(0)} ms = ${fpsOf(A.m)} fps, ${(A.m.size / 1048576).toFixed(2)} MB`);
      check(`${label}: run() returned ${nf} frames`, A.m.frames === nf, `${A.m.frames}`);
      const pa = probe(join(OUT, clip));
      E.info(`${label} ffprobe stream: ${JSON.stringify(pa.s)}`);
      E.info(`${label} ffprobe format: ${JSON.stringify(pa.f)}`);
      check(`${label}: codec h264`, pa.s.codec_name === "h264", pa.s.codec_name + " " + (pa.s.profile || ""));
      check(`${label}: 2560x1440`, pa.s.width === 2560 && pa.s.height === 1440, `${pa.s.width}x${pa.s.height}`);
      check(`${label}: r_frame_rate 60/1`, pa.s.r_frame_rate === "60/1", pa.s.r_frame_rate);
      check(`${label}: nb_read_frames == ${nf}`, +pa.s.nb_read_frames === nf, pa.s.nb_read_frames);
      check(`${label}: duration ~ ${nf / 60} s`, Math.abs(+pa.f.duration - nf / 60) < 0.05, pa.f.duration);
      const bx = boxes(A.buf);
      check(`${label}: moov before mdat`, okBoxes(bx), bx.join(" "));
      // frames 0, 1.0 s and the last one, each against a fresh renderFrame at exactly i/60
      for (const n of [0, 60, nf - 1]) {
        const t = (i0 + n) / 60, db = await cmpFrame(clip, tag, n, t);
        check(`${label}: decoded frame n=${n} (t=${t.toFixed(4)}) vs __tl.png(t, 2560): PSNR > 30 dB`, db > 30, db.toFixed(2) + " dB");
      }
      const lit = from + 1;                                     // the brief names __tl.png(from + 1)
      if (Math.abs((i0 + 60) / 60 - lit) > 1e-9) {
        await refPng(`${tag}-reflit.png`, lit);
        const db = psnr(join(OUT, `${tag}-dec60.png`), join(OUT, `${tag}-reflit.png`));
        check(`${label}: decoded frame n=60 vs the literal __tl.png(${lit}, 2560) (frame time differs by ${(((i0 + 60) / 60 - lit) * 1000).toFixed(2)} ms)`, db > 30, db.toFixed(2) + " dB");
      }
      return pa;
    };
    const determinism = (label, c1, c2, A, B, pa) => {
      const pb = probe(join(OUT, c2));
      check(`${label}: second run has the same frame count`, +pb.s.nb_read_frames === +pa.s.nb_read_frames, `${pb.s.nb_read_frames} vs ${pa.s.nb_read_frames}`);
      const ma = frameMd5(join(OUT, c1)), mb = frameMd5(join(OUT, c2));
      const same = ma.length === mb.length && ma.every((h, i) => h === mb[i]);
      let dp = Infinity, where = "";
      if (!same) {
        dp = psnr(join(OUT, c1), join(OUT, c2));
        const d = frameDiffs(join(OUT, c1), join(OUT, c2));
        where = `; ${d.count} of ${d.total} frames differ, lowest: ${d.worst.map((x) => `n=${x.n} ${x.p.toFixed(1)} dB`).join(", ")}`;
      }
      check(`${label}: second run decodes to identical frames or PSNR >= ${EXPORT.determinismDb} dB`, same || dp >= EXPORT.determinismDb, `files byte-identical: ${A.buf.equals(B.buf)}; decoded frames identical: ${same}${same ? "" : "; whole-clip PSNR " + dp.toFixed(2) + " dB" + where}`);
    };

    if (!ONLY || ONLY === "clips") {
      // ---- 1. the CAD half: [FROM, TO) -> bytes -> clip.mp4, decoded frames vs renderFrame
      const A = await runClip("clip.mp4", FROM, TO);
      const pa = await clipChecks("CAD clip", "clip.mp4", A, FROM, TO, "cad");
      // ---- 2. determinism: same range again
      const B = await runClip("clip2.mp4", FROM, TO);
      E.info(`CAD clip run B: ${B.m.frames} frames, ${B.m.codec} (${B.m.hw}), ${B.m.ms.toFixed(0)} ms = ${fpsOf(B.m)} fps`);
      determinism("CAD clip", "clip.mp4", "clip2.mp4", A, B, pa);

      // ---- 3. cancel through the API: abort a long run after ~20 frames
      const cx = await page.eval(`(async () => {
        const ac = new AbortController(); let seen = 0; const t0 = performance.now();
        try { await __export.run({ from: 0, to: 30, signal: ac.signal, onProgress: (p) => { seen = p.n; if (p.n === 20) ac.abort(); } }); return { outcome: "resolved" }; }
        catch (e) { return { outcome: "rejected", name: e.name, msg: e.message, seen, ms: performance.now() - t0, st: __export.state() }; }
      })()`, LONG);
      E.info("cancel: " + JSON.stringify(cx));
      check("cancel rejects with AbortError", cx.outcome === "rejected" && cx.name === "AbortError");
      check("cancel stopped promptly (<= 21 frames rendered)", cx.seen <= 21, "frames seen " + cx.seen);
      check("cancel: EXPORTING false, not busy", cx.st && cx.st.exporting === false && cx.st.busy === false);
      const png = await page.eval("__tl.png(1, 640)");
      check("page still renders after cancel", typeof png === "string" && png.startsWith("data:image/png") && png.length > 2000, "png length " + png.length);
      const again = await page.eval(`__export.run({ from: ${FROM}, to: ${FROM + 0.1} }).then((r) => ({ frames: r.frames, size: r.bytes.length }))`, LONG);
      check("a new run works after a cancel", again.frames === 6 && again.size > 1000, JSON.stringify(again));
    }

    if (!ONLY || ONLY === "clips") {
      // ---- 3b. a hardware encoder that says "supported" and then dies before its first frame: the next plan must take over
      //          (isConfigSupported is faked for prefer-hardware; this build has no hardware encoder, so the real encoder errors out by itself)
      await page.eval(`(() => { const o = VideoEncoder.isConfigSupported.bind(VideoEncoder); window.__ics = VideoEncoder.isConfigSupported; VideoEncoder.isConfigSupported = async (c) => (c.hardwareAcceleration === "prefer-hardware" ? { supported: true, config: c } : o(c)); })()`);
      const w0 = page.logs.length;
      const fb = await page.eval(`__export.run({ from: ${FROM}, to: ${FROM + 0.25} }).then((r) => ({ frames: r.frames, codec: r.codec, hw: r.hw, size: r.bytes.length })).catch((e) => ({ error: e.name + ": " + e.message }))`, LONG);
      await page.eval(`VideoEncoder.isConfigSupported = window.__ics`);
      const fw = page.logs.slice(w0).filter((l) => /warn/.test(l.type) && /encoder .* failed before its first frame/.test(l.text));
      E.info("hardware-failure fallback: " + JSON.stringify(fb) + " | warnings: " + JSON.stringify(fw.map((l) => l.text.slice(0, 200))));
      check("encoder that fails before its first frame: the next plan finishes the export", !fb.error && fb.frames === 15 && fb.hw === "no-preference", JSON.stringify(fb));
      check("... and says so on the console (one warning)", fw.length === 1);
      ALLOWED_WARN = fw.length;
      const st = await page.eval("__export.state()");
      check("... EXPORTING reset, not busy", st.exporting === false && st.busy === false);
    }

    if ((!ONLY || ONLY === "3d") && !SKIP3D) {
      // ---- 4. inside the 3D half: WebGL canvas -> 2D canvas -> VideoFrame
      const f3 = S + EXPORT.threeD[0], t3 = S + EXPORT.threeD[1];
      const C = await runClip("clip3d.mp4", f3, t3);
      const pc = await clipChecks("3D clip", "clip3d.mp4", C, f3, t3, "d3");
      const D = await runClip("clip3d2.mp4", f3, t3);
      E.info(`3D clip run D: ${D.m.frames} frames, ${D.m.codec} (${D.m.hw}), ${D.m.ms.toFixed(0)} ms = ${fpsOf(D.m)} fps`);
      determinism("3D clip", "clip3d.mp4", "clip3d2.mp4", C, D, pc);
      // the preview draws the 3D scene again afterwards: the shared renderer goes back to the preview size
      const mid = S + (EXPORT.threeD[0] + EXPORT.threeD[1]) / 2;
      const after = await page.eval(`(() => { __tl.at(${mid}); const a = __tl.ms(${mid}, 1280); return { ms: a, w: document.getElementById("screen").width }; })()`);
      E.info(`preview at t=${mid} after the 3D export: draws, renderFrame at 1280 wide took ${after.ms.toFixed(1)} ms (screen canvas ${after.w} px wide)`);
    }

    if (!ONLY || ONLY === "clips") {
      // ---- 5. the fallbacks that a Chrome without H.264 would take: VP9 and AV1 (30 frames each)
      for (const [only, name, want] of [["vp09", "clip-vp9.mp4", "vp9"], ["av01", "clip-av1.mp4", "av1"]]) {
        try {
          const V = await runClip(name, FROM, FROM + 0.5, `, only: ${JSON.stringify(only)}`);
          const pv = probe(join(OUT, name)), bv = boxes(V.buf);
          E.info(`${name}: ${V.m.frames} frames, ${V.m.codec} (${V.m.hw}), ${V.m.ms.toFixed(0)} ms, ${(V.m.size / 1048576).toFixed(2)} MB; ffprobe ${pv.s.codec_name} ${pv.s.width}x${pv.s.height} ${pv.s.r_frame_rate} frames ${pv.s.nb_read_frames}; boxes ${bv.join(" ")}`);
          check(`${want} fallback: codec, size, 30 frames, moov before mdat`, pv.s.codec_name === want && pv.s.width === 2560 && +pv.s.nb_read_frames === 30 && okBoxes(bv));
          decodeFrame(join(OUT, name), 0, join(OUT, `${want}-dec0.png`));
          const dv = psnr(join(OUT, `${want}-dec0.png`), join(OUT, "cad-ref0.png"));
          check(`${want} fallback: decoded frame 0 vs renderFrame(${FROM}): PSNR > 30 dB`, dv > 30, dv.toFixed(2) + " dB");
        } catch (e) { check(`${want} fallback runs`, false, String(e.message || e).slice(0, 300)); }
      }
    }

    if (!ONLY || ONLY === "ui") {
      // ---- 6. the real button, a trusted click, and an OPFS-backed stand-in for showSaveFilePicker (the native dialog cannot run headless)
      await page.eval(`(() => {
        const F = window.__fake = { calls: 0, inClick: null, active: null, opts: null, mode: "ok", handle: null };
        exportBtn.addEventListener("click", () => { window.__inClick = true; setTimeout(() => { window.__inClick = false; }, 0); }, true);
        window.showSaveFilePicker = async (opts) => {          // runs synchronously up to its first await, like the real one is called
          F.calls++; F.opts = opts; F.inClick = !!window.__inClick; F.active = navigator.userActivation.isActive;
          if (F.mode === "abort") throw new DOMException("The user aborted a request.", "AbortError");
          const root = await navigator.storage.getDirectory();
          F.handle = await root.getFileHandle("picked.mp4", { create: true });
          return F.handle;                                     // a real FileSystemFileHandle: createWritable() gives a real FileSystemWritableFileStream
        };
        window.__fakePick = window.showSaveFilePicker;
        F.sha = async () => { const b = await (await F.handle.getFile()).arrayBuffer(); const h = new Uint8Array(await crypto.subtle.digest("SHA-256", b)); return [...h].map((x) => x.toString(16).padStart(2, "0")).join("") + ":" + b.byteLength; };
        F.take = (s, n) => new Promise(async (res) => { const f = await F.handle.getFile(); const fr = new FileReader(); fr.onload = () => res(fr.result.slice(fr.result.indexOf(",") + 1)); fr.readAsDataURL(f.slice(s, s + n)); });
      })()`);
      const ui = () => page.eval(`JSON.stringify({ txt: progTxt.textContent, hidden: prog.hidden, w: progFill.style.width, btn: exportBtn.textContent, btnDis: exportBtn.disabled, rateDis: bitrate.disabled, msg: msg.textContent, st: __export.state() })`).then(JSON.parse);
      const click = async () => {                                // a trusted mouse click at the button's centre
        const r = await page.eval(`(() => { exportBtn.scrollIntoView({ block: "center" }); const b = exportBtn.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
        await page.S("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
        await page.S("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
        await page.S("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
      };

      //   6a. success through the picker -> FileSystemWritableFileStreamTarget with expectedVideoChunks
      await page.eval(`__export.range(${FROM}, ${TO})`);
      await click();
      const seenTxt = new Set(), seenBtn = new Set();
      let u = await until(async () => { const s = await ui(); seenTxt.add(s.txt.replace(/\d+(\.\d+)?/g, "#")); seenBtn.add(s.btn); return /^(Done|export failed)/.test(s.txt) && s; });
      E.info("UI text states: " + [...seenTxt].join(" | "));
      E.info("UI final: " + JSON.stringify(u));
      const F = await page.eval("JSON.stringify({ calls: __fake.calls, inClick: __fake.inClick, active: __fake.active, opts: __fake.opts })").then(JSON.parse);
      E.info("fake picker: " + JSON.stringify(F));
      check("picker requested once, synchronously inside the trusted click, with user activation", F.calls === 1 && F.inClick === true && F.active === true, JSON.stringify({ calls: F.calls, inClick: F.inClick, active: F.active }));
      check("picker options (name, mp4 type)", F.opts.suggestedName === "plan-to-build-1440p60.mp4" && F.opts.types[0].accept["video/mp4"][0] === ".mp4");
      check("button said 'Cancel' while running", seenBtn.has("Cancel"));
      check("done text 'Done · x MB · 0:02 · saved'", /^Done · [\d.]+ MB · 0:02 · saved$/.test(u.txt), u.txt);
      check("UI restored (button, bitrate, 100% bar)", u.btn === "Render 1440p60 MP4" && !u.btnDis && !u.rateDis && !u.hidden && u.w === "100%");
      check("EXPORTING reset after the button run", u.st.exporting === false && u.st.busy === false);
      const size = await page.eval("__fake.handle.getFile().then((f) => f.size)");
      const fparts = [];
      for (let off = 0; off < size; off += 1 << 20) fparts.push(Buffer.from(await page.eval(`__fake.take(${off}, ${1 << 20})`), "base64"));
      const fbuf = Buffer.concat(fparts); await writeFile(join(OUT, "clip-ui.mp4"), fbuf);
      const pu = probe(join(OUT, "clip-ui.mp4")), bu = boxes(fbuf);
      E.info("picker-file ffprobe: " + JSON.stringify(pu.s) + " boxes: " + bu.join(" ") + " size " + size);
      check("picker file (real FileSystemWritableFileStream + fastStart object): h264, 2560x1440, frames, moov before mdat", pu.s.codec_name === "h264" && pu.s.width === 2560 && +pu.s.nb_read_frames === NF && okBoxes(bu), `${pu.s.nb_read_frames} frames; ${bu.join(" ")}`);
      check("picker file size == the byte count read back", fbuf.length === size);
      //   6f. a long one through the picker: > 32 MiB of output, so the muxer flushes 16 MiB chunks mid-export and patches the moov in at the end
      if (!SKIP3D) {
        const lf = S + EXPORT.long[0], lt = S + EXPORT.long[1], ln = Math.round((lt - lf) * 60), lsecs = Math.round(lt - lf);
        await page.eval(`bitrate.value = "40"; __export.range(${lf}, ${lt})`);
        const tc = Date.now();
        await click();
        const lseen = []; let lastTxt = "";
        u = await until(async () => { const s = await ui(); if (s.txt !== lastTxt && /^frame/.test(s.txt)) { lastTxt = s.txt; lseen.push(s.txt); } return /^(Done|export failed)/.test(s.txt) && s; }, 900000, 250);
        const lms = Date.now() - tc;
        E.info(`long export through the picker: ${ln} frames of 3D at 40 Mbps in ${(lms / 1000).toFixed(1)} s = ${(ln / (lms / 1000)).toFixed(1)} fps; UI: ${u.txt}; progress samples ${lseen.length}, e.g. ${lseen[Math.floor(lseen.length / 2)]}`);
        check(`long export: 'Done · x MB · 0:${String(lsecs).padStart(2, "0")} · saved'`, new RegExp(`^Done · [\\d.]+ MB · 0:${String(lsecs).padStart(2, "0")} · saved$`).test(u.txt), u.txt);
        const lsize = await page.eval("__fake.handle.getFile().then((f) => f.size)");
        const lparts = [];
        for (let off = 0; off < lsize; off += 1 << 20) lparts.push(Buffer.from(await page.eval(`__fake.take(${off}, ${1 << 20})`), "base64"));
        const lbuf = Buffer.concat(lparts); await writeFile(join(OUT, "clip-long.mp4"), lbuf);
        E.info(`long file: ${(lsize / 1048576).toFixed(1)} MiB (${(lsize * 8 / (ln / 60) / 1e6).toFixed(1)} Mbps average)`);
        check("long export: bigger than 2 x the 16 MiB chunk (the multi-chunk write path ran)", lsize > 32 * 1048576, (lsize / 1048576).toFixed(1) + " MiB");
        check("long export: pulled file is complete", lbuf.length === lsize);
        await clipChecks("3D long clip (button, FileSystemWritableFileStream)", "clip-long.mp4", { m: { frames: ln, codec: "ui", hw: "-", ms: lms, size: lsize }, buf: lbuf }, lf, lt, "dl");
        await page.eval(`bitrate.value = "24"; __export.range()`);
      }
      const sha0 = await page.eval("__fake.sha()");

      //   6b. cancel from the button, mid-run: the picked file keeps its previous content
      await page.eval(`__export.range(0, 8)`);                 // long enough that the cancel below lands mid-run however fast the 2D half renders
      await click();
      await until(async () => { const s = await ui(); const m = /^frame (\d+) \//.exec(s.txt); return m && +m[1] >= 15 && s; });
      await delay(1100);                                       // a click on Cancel in the first 0.9 s is ignored on purpose (a double-click on Render must not cancel it)
      await click();                                           // the same button now reads Cancel
      u = await until(async () => { const s = await ui(); return s.txt === "cancelled" && s.btn === "Render 1440p60 MP4" && s; });
      const sha1 = await page.eval("__fake.sha()");
      check("button cancel: 'cancelled', UI restored, EXPORTING false", !u.btnDis && !u.rateDis && u.st.exporting === false && u.st.busy === false, u.txt);
      check("button cancel: the stream was aborted, the picked file keeps its previous bytes", sha1 === sha0, sha1.slice(-12) + " vs " + sha0.slice(-12));

      //   6c. user closes the save dialog -> quiet exit
      await page.eval(`__fake.mode = "abort"; __export.range(0, 3)`);
      await click();
      u = await until(async () => { const s = await ui(); return s.btn === "Render 1440p60 MP4" && s; });
      check("save dialog dismissed: quiet (bar hidden, no export started, no message)", u.hidden === true && u.msg === "" && u.st.busy === false && u.st.exporting === false, JSON.stringify({ hidden: u.hidden, msg: u.msg, st: u.st }));

      //   6d. no picker (Firefox/Safari): in-memory MP4 + download
      await page.eval(`window.showSaveFilePicker = undefined; __export.range(${FROM}, ${FROM + 1})`);
      await click();
      u = await until(async () => { const s = await ui(); return /^(Done|export failed)/.test(s.txt) && s; });
      E.info("download UI final: " + u.txt);
      check("fallback finishes with 'downloaded'", /^Done · [\d.]+ MB · 0:01 · downloaded$/.test(u.txt), u.txt);
      const began = await until(() => dlEv.find((m) => m.method === "Browser.downloadWillBegin"), 15000, 100).catch(() => null);
      const done = await until(() => dlEv.find((m) => m.method === "Browser.downloadProgress" && m.params.state === "completed"), 30000, 100).catch(() => null);
      E.info("download events: " + JSON.stringify(dlEv.map((m) => ({ m: m.method.replace("Browser.download", ""), ...m.params, url: m.params.url ? m.params.url.slice(0, 40) : undefined }))));
      check("download started with the file name plan-to-build-1440p60.mp4", !!began && began.params.suggestedFilename === "plan-to-build-1440p60.mp4", began ? began.params.suggestedFilename : "no downloadWillBegin event");
      if (done) {
        const dl = join(OUT, done.params.guid); await delay(300);
        const pd = probe(dl);
        check("downloaded file: completed, h264, 2560x1440, 60 frames", pd.s.codec_name === "h264" && pd.s.width === 2560 && +pd.s.nb_read_frames === 60, `${pd.s.nb_read_frames} frames, ${done.params.receivedBytes} bytes`);
      } else check("download completed", false, "no completed downloadProgress event");

      //   6e. no WebCodecs
      const msgs = await page.eval(`(() => { const orig = window.VideoEncoder; window.VideoEncoder = undefined; exportBtn.click(); const r = { txt: progTxt.textContent, msg: msg.textContent, st: __export.state() }; window.VideoEncoder = orig; return r; })()`);
      check("no WebCodecs: tells the user", /WebCodecs/.test(msgs.txt) && /WebCodecs/.test(msgs.msg) && !msgs.st.busy, JSON.stringify(msgs));
      //   6g. the next attempt clears the old error from the stage and goes through the picker again
      await page.eval(`window.showSaveFilePicker = window.__fakePick; __fake.mode = "ok"; __fake.calls = 0; __export.range(0, 1)`);
      await click();
      u = await until(async () => { const s = await ui(); return /^(Done|export failed)/.test(s.txt) && s; });
      check("a retry after an error clears the old message and saves through the picker", u.msg === "" && /^Done · [\d.]+ MB · 0:01 · saved$/.test(u.txt) && (await page.eval("__fake.calls")) === 1, JSON.stringify({ msg: u.msg, txt: u.txt }));
      await page.eval("__export.range()");
    }

    // ---- the page must still draw
    const t = await page.eval("(() => { __tl.at(5); return __tl.ms(5, 1280); })()");
    E.info("render 1280 wide at t=5: " + t.toFixed(1) + " ms");

    // ---- console: exceptions, errors and failed requests fail the run; warnings are listed (three.js and the GPU driver emit some) and only the export's own fail it
    const hard = page.logs.filter((l) => l.type === "exception" || l.type === "error" || l.type === "assert" || l.type === "netfail" || /^log\.error/.test(l.type));
    const warns = page.logs.filter((l) => /warn/.test(l.type));
    const mine = warns.filter((l) => /encoder .* failed|save dialog unavailable|export failed/.test(l.text));
    E.info("console exceptions/errors: " + JSON.stringify(hard.slice(0, 12)));
    E.info(`console warnings (${warns.length}): ` + JSON.stringify(warns.slice(0, 6).map((l) => l.text.slice(0, 160))));
    E.info("other console types: " + JSON.stringify([...new Set(page.logs.map((l) => l.type))]) + " ; log lines: " + page.logs.filter((l) => l.type === "log").length);
    check("no exceptions, console errors or failed requests", hard.length === 0, hard.length + " problem(s)");
    check("no unexpected warnings from the export code (encoder fallback / picker fallback)", mine.length === ALLOWED_WARN, `${mine.length} warning(s), ${ALLOWED_WARN} provoked on purpose`);
  } catch (e) {
    if (page) E.info("console so far: " + JSON.stringify(page.logs.filter((l) => l.type !== "log").slice(0, 12)));
    throw e;
  } finally {
    try { dws && dws.close(); } catch { /* closing anyway */ }
    await Promise.race([br.close(), delay(8000)]); await Promise.race([srv.close(), delay(2000)]);
    await rm(OUT, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
  }
});
