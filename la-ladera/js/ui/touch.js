// Touch controls (owner: A1), shown only on coarse-pointer devices while playing:
//   left thumb  = floating stick (walk; pushed to the rim = run)       right thumb = drag to look
//   buttons     = E (open / talk)  jump  crouch                        the round menu button (top right) opens the pause menu
// It drives the same inputs as the keyboard: player.input.{f,s,sprint,jump,crouch} and the look accumulators player.mdx / mdy.
const R = 58;                                   // stick radius in CSS px
const DEAD = 0.14, LOOK = 1.5;                  // dead zone (fraction of R), touch look gain relative to a mouse pixel

export function installTouch(ctx) {
  if (document.getElementById('touch')) return;
  const mk = (tag, cls, parent, attrs = {}) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent?.appendChild(e); return e; };
  const root = mk('div', 'hidden', document.body, { id: 'touch', 'aria-hidden': 'true' });
  const zl = mk('div', 'zone l', root), zr = mk('div', 'zone r', root);
  const base = mk('div', 'stick hidden', root), thumb = mk('i', '', base);
  const bUse = mk('button', 'tbtn use', root, { type: 'button', tabindex: '-1' }), bJump = mk('button', 'tbtn jump', root, { type: 'button', tabindex: '-1' }), bCrouch = mk('button', 'tbtn crouch', root, { type: 'button', tabindex: '-1' });
  bUse.textContent = 'E'; bJump.textContent = '⤒'; bCrouch.textContent = '⤓';
  const inp = () => ctx.player?.input;

  // ---- stick ------------------------------------------------------------------------------------------------------------------
  let sid = null, ox = 0, oy = 0;
  const setStick = (dx, dy) => {
    const p = inp(); if (!p) return;
    const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx), k = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
    p.s = Math.cos(a) * k; p.f = -Math.sin(a) * k; p.sprint = m > 0.96;
    thumb.style.transform = `translate(${Math.cos(a) * m * R}px, ${Math.sin(a) * m * R}px)`;
  };
  const endStick = () => { sid = null; base.classList.add('hidden'); const p = inp(); if (p) { p.f = p.s = 0; p.sprint = false; } };
  zl.addEventListener('pointerdown', (e) => {
    if (sid != null) return;
    sid = e.pointerId; ox = e.clientX; oy = e.clientY; zl.setPointerCapture(sid);
    base.style.left = `${ox}px`; base.style.top = `${oy}px`; base.classList.remove('hidden'); setStick(0, 0);
  });
  zl.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e.clientX - ox, e.clientY - oy); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) zl.addEventListener(t, (e) => { if (e.pointerId === sid) endStick(); });

  // ---- look -------------------------------------------------------------------------------------------------------------------
  let lid = null, lx = 0, ly = 0;
  zr.addEventListener('pointerdown', (e) => { if (lid != null) return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; zr.setPointerCapture(lid); });
  zr.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lid || !ctx.running || !ctx.player) return;
    ctx.player.mdx += (e.clientX - lx) * LOOK; ctx.player.mdy += (e.clientY - ly) * LOOK; lx = e.clientX; ly = e.clientY;
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) zr.addEventListener(t, (e) => { if (e.pointerId === lid) lid = null; });

  // ---- buttons ----------------------------------------------------------------------------------------------------------------
  bUse.addEventListener('pointerdown', (e) => { e.preventDefault(); if (ctx.running && !ctx.player?.locked) ctx.interact.use(); });
  const hold = (btn, key) => {
    const on = (v) => { const p = inp(); if (p) p[key] = v; btn.classList.toggle('on', v); };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); on(true); });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(t, () => on(false));
  };
  hold(bJump, 'jump');
  bCrouch.addEventListener('pointerdown', (e) => { e.preventDefault(); const p = inp(); if (p) { p.crouch = !p.crouch; bCrouch.classList.toggle('on', p.crouch); } });

  // only while playing; a dialogue (player.lock) hides the sticks so the reply buttons are reachable
  ctx.events.on('mode', ({ mode }) => {
    root.classList.toggle('hidden', mode !== 'play');
    if (mode !== 'play') { endStick(); lid = null; const p = inp(); if (p) { p.jump = p.crouch = false; } bJump.classList.remove('on'); bCrouch.classList.remove('on'); }
  });
  root.classList.toggle('hidden', ctx.mode !== 'play');
}
