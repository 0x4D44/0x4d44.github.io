// Page-side layout probe shared by the browser suite and the scratch screenshot scripts.
// Every visible interactive control must lie inside the viewport (or inside a scrollable screen that can reach it),
// and no two interactive rects may overlap. "Primary" controls (screen footer buttons, menu list, the title's start
// button) must be inside the viewport without scrolling.

export const LAYOUT_PROBE = `(() => {
  const W = innerWidth, H = innerHeight;
  const sel = "#screens button, #screens a, #screens input, #screens select, #screens [role=button], .touch-controls button, .touch-controls .tc-steer, .touch-pause";
  const items = [];
  // the part of a rect that is not clipped away by a scrolling or hidden-overflow ancestor
  const clipRect = (el, r0) => {
    let r = { left: r0.left, right: r0.right, top: r0.top, bottom: r0.bottom };
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === "visible") continue;
      const pr = p.getBoundingClientRect();
      r = { left: Math.max(r.left, pr.left), right: Math.min(r.right, pr.right), top: Math.max(r.top, pr.top), bottom: Math.min(r.bottom, pr.bottom) };
    }
    return r;
  };
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest("[inert]") || el.closest("[hidden]")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const name = ((el.getAttribute("aria-label") || el.textContent || el.className || el.tagName) + "").trim().replace(/\s+/g, " ").slice(0, 28);
    // the nearest ancestor that scrolls (a screen, or the service area's own scroll region)
    let scroller = null;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 1) { scroller = p; break; } }
    const canScroll = !!scroller;
    const primary = !!el.closest(".screen-foot, .menu-list, .title-wrap") && !el.closest(".screen-head");
    items.push({ name, top: r.top, left: r.left, bottom: r.bottom, right: r.right, canScroll, primary, el, clip: clipRect(el, r) });
  }
  const problems = [];
  for (const a of items) {
    const out = a.left < -0.5 || a.right > W + 0.5 || a.top < -0.5 || a.bottom > H + 0.5;
    if (out && a.primary) problems.push("primary control outside viewport: " + a.name + " [" + [a.left, a.top, a.right, a.bottom].map(Math.round) + "] in " + W + "x" + H);
    else if (out && !a.canScroll) problems.push("control outside viewport and not scrollable: " + a.name + " [" + [a.left, a.top, a.right, a.bottom].map(Math.round) + "] in " + W + "x" + H);
    else if ((a.left < -0.5 || a.right > W + 0.5)) problems.push("control sideways outside viewport: " + a.name);
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    // the pinned footer layers over content that scrolls beneath it: that is not an overlap of two controls
    if (a.canScroll && b.canScroll && (!!a.el.closest(".screen-foot") !== !!b.el.closest(".screen-foot"))) continue;
    const ow = Math.min(a.clip.right, b.clip.right) - Math.max(a.clip.left, b.clip.left), oh = Math.min(a.clip.bottom, b.clip.bottom) - Math.max(a.clip.top, b.clip.top);
    if (ow > 3 && oh > 3) problems.push("overlap: " + a.name + " x " + b.name + " (" + Math.round(ow) + "x" + Math.round(oh) + ")");
  }
  // a pinned footer must not cover a row of content that the visitor cannot scroll out from under it (the service screen's repair and setup rows)
  const feet = items.filter((i) => i.el.closest(".screen-foot"));
  for (const row of document.querySelectorAll(".service .part-row, .service .opt")) {
    if (row.closest("[hidden]")) continue;
    const c = clipRect(row, row.getBoundingClientRect());
    for (const f of feet) {
      const ow = Math.min(c.right, f.right) - Math.max(c.left, f.left), oh = Math.min(c.bottom, f.bottom) - Math.max(c.top, f.top);
      if (ow > 3 && oh > 3) problems.push("footer button covers a service row: " + f.name + " over " + (row.textContent || "").trim().slice(0, 20));
    }
  }
  // key text (the garage class and name line, the livery line) must not sit under a control or fall off the screen
  for (const t of document.querySelectorAll(".car-info h2, .car-info .kicker, .livery-name, .title-wrap .wordmark")) {
    const r = t.getBoundingClientRect();
    if (r.width <= 0 || t.closest("[hidden]")) continue;
    const label = (t.textContent || "").trim().slice(0, 24);
    if (r.bottom > H + 0.5 || r.top < -0.5) problems.push("text off screen: " + label);
    for (const a of items) {
      const ow = Math.min(a.right, r.right) - Math.max(a.left, r.left), oh = Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top);
      if (ow > 3 && oh > 3) problems.push("text under control: " + label + " x " + a.name);
    }
  }
  return { w: W, h: H, n: items.length, problems, scrollable: items.filter((i) => i.canScroll).length > 0 };
})()`;
