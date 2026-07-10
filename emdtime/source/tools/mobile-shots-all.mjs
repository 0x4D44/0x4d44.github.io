// One CDP session, mobile emulation, capture every view. No deps (Node 24 WS).
// Usage: node tools/mobile-shots-all.mjs <jsonUrl> <baseUrl> <width> <outDir>
import { writeFileSync } from "node:fs";
const [, , jsonUrl, baseUrl, widthArg, outDir] = process.argv;
const width = Number(widthArg);
const VIEWS = ["clock", "convert", "calendar", "planet", "about"];

const targets = await (await fetch(jsonUrl)).json();
const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (!page) throw new Error("no page target — is Chrome up with --remote-debugging-port?");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const evH = new Map();
const send = (method, params = {}) => {
  const m = ++id;
  ws.send(JSON.stringify({ id: m, method, params }));
  return new Promise((r) => pending.set(m, r));
};
const once = (n) => new Promise((r) => evH.set(n, r));
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  else if (msg.method && evH.has(msg.method)) { const h = evH.get(msg.method); evH.delete(msg.method); h(msg.params); }
});
await new Promise((r) => ws.addEventListener("open", r));

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });

for (const v of VIEWS) {
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url: `${baseUrl}#${v}` });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 4000))]);
  await new Promise((r) => setTimeout(r, 800));
  const check = await send("Runtime.evaluate", {
    expression: `JSON.stringify({iw:innerWidth,sw:document.documentElement.scrollWidth,title:document.title,hasApp:!!document.querySelector('.app'),over:document.documentElement.scrollWidth>innerWidth+1})`,
    returnByValue: true,
  });
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const out = `${outDir}/m${width}_${v}.png`;
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log(out, check.result.value);
}
ws.close();
