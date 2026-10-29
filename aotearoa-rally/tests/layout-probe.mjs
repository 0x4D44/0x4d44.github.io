// Page-side layout probe shared by the browser suite and the scratch screenshot scripts.
// Every visible interactive control must lie inside the viewport (or inside a scrollable screen that can reach it),
// and no two interactive rects may overlap. "Primary" controls (screen footer buttons, menu list, the title's start
// button) must be inside the viewport without scrolling.

export const LAYOUT_PROBE = `(() => {
  const W = innerWidth, H = innerHeight;
  const sel = "#screens button, #screens a, #screens input, #screens select, #screens [role=button], .touch-controls button, .touch-controls .tc-steer, .touch-pause";
  const items = [];
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest("[inert]") || el.closest("[hidden]")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const name = ((el.getAttribute("aria-label") || el.textContent || el.className || el.tagName) + "").trim().replace(/\s+/g, " ").slice(0, 28);
    const scroller = el.closest(".screen");
    const canScroll = !!scroller && scroller.scrollHeight > scroller.clientHeight + 1;
    const primary = !!el.closest(".screen-foot, .menu-list, .title-wrap") && !el.closest(".screen-head");
    items.push({ name, top: r.top, left: r.left, bottom: r.bottom, right: r.right, canScroll, primary, el });
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
    const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left), oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ow > 3 && oh > 3) problems.push("overlap: " + a.name + " x " + b.name + " (" + Math.round(ow) + "x" + Math.round(oh) + ")");
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
