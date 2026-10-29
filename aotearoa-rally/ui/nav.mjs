// Menu navigation: arrow keys / gamepad move focus between controls, Enter/A activates,
// Escape/B presses the screen's [data-back] button. Keeps every menu playable without a mouse.

const SELECTOR = "button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled]), [tabindex='0']";

export function createNav(root, { getPads } = {}) {
  let active = true;
  const items = () => [...root.querySelectorAll(SELECTOR)].filter((e) => e.offsetParent !== null && !e.closest("[inert]"));
  // the topmost [data-back] wins, so a confirmation dialog over a screen is dismissed first
  const lastBack = () => {
    const all = root.querySelectorAll("[data-back]");
    for (let i = all.length - 1; i >= 0; i--) if (all[i].offsetParent !== null) return all[i];
    return null;
  };
  function move(dir) {
    const list = items();
    if (!list.length) return;
    const cur = list.indexOf(document.activeElement);
    // geometric choice: nearest element in the pressed direction, falling back to DOM order
    if (cur >= 0) {
      const r = list[cur].getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let best = null, bd = Infinity;
      for (let i = 0; i < list.length; i++) {
        if (i === cur) continue;
        const b = list[i].getBoundingClientRect();
        const dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
        const along = dir === "down" ? dy : dir === "up" ? -dy : dir === "right" ? dx : -dx;
        if (along <= 2) continue;
        const across = dir === "down" || dir === "up" ? Math.abs(dx) : Math.abs(dy);
        const d = along + across * 2.2;
        if (d < bd) { bd = d; best = list[i]; }
      }
      if (best) { best.focus({ preventScroll: false }); best.scrollIntoView && best.scrollIntoView({ block: "nearest" }); return; }
      const step = dir === "down" || dir === "right" ? 1 : -1;
      const n = list[(cur + step + list.length) % list.length];
      n.focus();
    } else list[0].focus();
  }
  const onKey = (e) => {
    // another handler (e.g. the driving Escape that just opened the pause menu) already used this key
    if (!active || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = document.activeElement;
    const isRange = el && el.tagName === "INPUT" && el.type === "range";
    const isSelect = el && el.tagName === "SELECT";
    if (el && el.classList && el.classList.contains("listening")) return;
    let dir = null;
    switch (e.key) {
      case "ArrowDown": dir = "down"; break;
      case "ArrowUp": dir = "up"; break;
      case "ArrowLeft": dir = "left"; break;
      case "ArrowRight": dir = "right"; break;
      case "Escape": case "Backspace": {
        if (e.key === "Backspace" && el && (el.tagName === "INPUT" && el.type !== "range" || el.tagName === "TEXTAREA")) return;
        if (e.repeat) return;
        const back = lastBack();
        if (back) { e.preventDefault(); back.click(); }
        return;
      }
      default: return;
    }
    if (isRange && (dir === "left" || dir === "right")) return;
    if (isSelect) return;
    if (e.key.length === 1 && el && el.tagName === "INPUT") return;
    e.preventDefault();
    move(dir);
  };
  window.addEventListener("keydown", onKey);
  const prev = { up: false, down: false, left: false, right: false, a: false, b: false };
  let repeat = 0;
  return {
    set active(v) { active = !!v; },
    focusFirst() {
      const top = root.lastElementChild;
      const pref = (top && top.querySelector("[data-focus]")) || root.querySelector("[data-focus]") || items()[0];
      pref && pref.focus({ preventScroll: true });
    },
    move,
    /** call each frame while a menu is visible */
    tick(dt) {
      if (!active) return;
      const pads = (getPads && getPads()) || [];
      let gp = null;
      for (let i = 0; i < pads.length; i++) if (pads[i]) { gp = pads[i]; break; }
      if (!gp) return;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const cur = { up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6, a: b(0), b: b(1) };
      repeat -= dt;
      for (const d of ["up", "down", "left", "right"]) {
        if (cur[d] && (!prev[d] || repeat <= 0)) {
          const el = document.activeElement;
          if (el && el.tagName === "INPUT" && el.type === "range" && (d === "left" || d === "right")) {
            el.value = String(+el.value + (d === "right" ? 1 : -1) * (+el.step || 1));
            el.dispatchEvent(new Event("input", { bubbles: true }));
          } else move(d);
          repeat = prev[d] ? 0.14 : 0.35;
        }
      }
      if (cur.a && !prev.a && document.activeElement && document.activeElement.click) document.activeElement.click();
      if (cur.b && !prev.b) { const back = lastBack(); back && back.click(); }
      Object.assign(prev, cur);
    },
  };
}
