// Dependency-free overflow probe using Chrome DevTools Protocol over Node 24's
// built-in WebSocket. Usage: node tools/overflow-probe.mjs <debugJsonUrl> <pageUrl>
const [, , jsonUrl] = process.argv;

const targets = await (await fetch(jsonUrl)).json();
const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (!page) {
  console.error("no page target");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((res) => pending.set(msgId, res));
}
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
await new Promise((res) => ws.addEventListener("open", res));

const expr = `(() => {
  const vw = window.innerWidth;
  const de = document.documentElement;
  const offenders = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0,50),
        left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width)
      });
    }
  });
  offenders.sort((a,b) => b.right - a.right);
  return JSON.stringify({
    innerWidth: vw,
    docScrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    offenders: offenders.slice(0, 18)
  }, null, 1);
})()`;

const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
console.log(r.result.value);
ws.close();
