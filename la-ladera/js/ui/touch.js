// Touch controls (owner: A1), shown only on coarse-pointer devices while playing:
//   left thumb  = floating stick (walk; pushed to the rim = run)       right thumb = drag to look; a short tap on it = E (use what the crosshair is on)
//   buttons     = E (open / talk)  jump  crouch  run (a toggle)        the round menu button (top right) opens the pause menu, the map button beside it the map
//                 (swimming, jump and crouch read Subir and Bucear: player:swim)
// It drives the same inputs as the keyboard: player.input.{f,s,sprint,jump,crouch} and the look accumulators player.mdx / mdy.
// flow.js installs it on a coarse pointer at boot, or when the first finger lands on a page that did not know it was on a phone (review R2d-001).
const R = 58;                                   // stick radius in CSS px
const DEAD = 0.14, LOOK = 1.5;                  // dead zone (fraction of R), touch look gain relative to a mouse pixel
const TAP_MS = 320, TAP_PX = 14;                // a touch shorter and steadier than this is a tap, not the start of a look

export function installTouch(ctx) {
  if (document.getElementById('touch')) return;
  const mk = (tag, cls, parent, attrs = {}) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent?.appendChild(e); return e; };
  const root = mk('div', 'hidden', document.body, { id: 'touch', 'aria-hidden': 'true' });
  const zl = mk('div', 'zone l', root), zr = mk('div', 'zone r', root);
  const base = mk('div', 'stick idle', root, { 'data-label': 'caminar' }), thumb = mk('i', '', base);
  const lookHint = mk('div', 'lookhint', root); lookHint.textContent = 'arrastra para mirar';
  const bUse = mk('button', 'tbtn use', root, { type: 'button', tabindex: '-1' }), bJump = mk('button', 'tbtn jump', root, { type: 'button', tabindex: '-1', 'aria-label': 'saltar' }), bCrouch = mk('button', 'tbtn crouch', root, { type: 'button', tabindex: '-1', 'aria-label': 'agacharse' });
  const bRun = mk('button', 'tbtn run', root, { type: 'button', tabindex: '-1', 'aria-label': 'correr' }), bMap = mk('button', 'tbtn map', root, { type: 'button', tabindex: '-1', 'aria-label': 'mapa' });
  bUse.textContent = 'E'; bJump.textContent = '⤒'; bCrouch.textContent = '⤓'; bRun.textContent = 'correr'; bMap.textContent = 'mapa';
  const inp = () => ctx.player?.input;

  // ---- stick ------------------------------------------------------------------------------------------------------------------
  let sid = null, ox = 0, oy = 0, runOn = false, rim = false;
  const setStick = (dx, dy) => {
    const p = inp(); if (!p) return;
    const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx), k = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD);
    rim = m > 0.96;
    p.s = Math.cos(a) * k; p.f = -Math.sin(a) * k; p.sprint = runOn || rim;
    thumb.style.transform = `translate(${Math.cos(a) * m * R}px, ${Math.sin(a) * m * R}px)`;
  };
  // the stick is always on screen: a faint ring at the thumb's rest point (bottom left), which jumps under the finger while it is down (R-touch: "where is the stick?")
  const rest = () => { base.style.left = `${Math.round(Math.max(76, Math.min(104, innerWidth * 0.2)))}px`; base.style.top = `${Math.max(120, innerHeight - 92)}px`; };
  const endStick = () => { sid = null; rim = false; base.classList.add('idle'); rest(); thumb.style.transform = ''; const p = inp(); if (p) { p.f = p.s = 0; p.sprint = runOn; } };
  rest(); addEventListener('resize', () => { if (sid == null) rest(); });
  zl.addEventListener('pointerdown', (e) => {
    if (sid != null) return;
    sid = e.pointerId; ox = e.clientX; oy = e.clientY; zl.setPointerCapture(sid);
    base.style.left = `${ox}px`; base.style.top = `${oy}px`; base.classList.remove('idle'); setStick(0, 0);
  });
  zl.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e.clientX - ox, e.clientY - oy); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) zl.addEventListener(t, (e) => { if (e.pointerId === sid) endStick(); });

  // ---- look -------------------------------------------------------------------------------------------------------------------
  let lid = null, lx = 0, ly = 0, lt = 0, lax = 0, lay = 0, lmoved = false;
  const dropHint = () => lookHint.classList.add('gone');
  setTimeout(dropHint, 12000);
  zr.addEventListener('pointerdown', (e) => { if (lid != null) return; lid = e.pointerId; lx = lax = e.clientX; ly = lay = e.clientY; lt = e.timeStamp; lmoved = false; zr.setPointerCapture(lid); });
  zr.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lid || !ctx.running || !ctx.player) return;
    if (Math.hypot(e.clientX - lax, e.clientY - lay) > TAP_PX) lmoved = true;
    ctx.player.mdx += (e.clientX - lx) * LOOK; ctx.player.mdy += (e.clientY - ly) * LOOK; lx = e.clientX; ly = e.clientY;
    dropHint();
  });
  // a short, steady touch on the right half is E: whatever the crosshair is on (the same call the E button and the key make)
  zr.addEventListener('pointerup', (e) => {
    if (e.pointerId !== lid) return;
    if (!lmoved && e.timeStamp - lt < TAP_MS && ctx.running && !ctx.player?.locked) ctx.interact?.use();
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
  // run is a toggle for a thumb that cannot hold the stick at its rim; the map opens over the game like the key M (a panel closes with its own X)
  bRun.addEventListener('pointerdown', (e) => { e.preventDefault(); runOn = !runOn; bRun.classList.toggle('on', runOn); const p = inp(); if (p) p.sprint = runOn || (sid != null && rim); });
  bMap.addEventListener('click', (e) => { e.preventDefault(); if (ctx.running && !ctx.player?.locked) ctx.flow?.openPanel('map'); });

  // a conversation: body.talking hides the stick and the buttons, takes the look zones off the card and drops the subtitle to the bottom, so the answers card has the
  // thumbs' room (css/ladera.css); the stick lets go of whatever it held
  ctx.events.on('player:lock', ({ reason }) => { if (reason === 'dialogue') { document.body.classList.add('talking'); endStick(); lid = null; dropHint(); } });
  ctx.events.on('player:unlock', ({ reason }) => { if (reason === 'dialogue') document.body.classList.remove('talking'); });

  // in the water (player:swim) the jump and crouch buttons are Subir (hold) and Bucear (a toggle): the same inputs, new names; out of it the toggle is let go (else he would land crouched)
  const swimLabels = (on) => {
    root.classList.toggle('swim', on);
    bJump.textContent = on ? 'subir' : '⤒'; bCrouch.textContent = on ? 'bucear' : '⤓';
    bJump.setAttribute('aria-label', on ? 'subir' : 'saltar'); bCrouch.setAttribute('aria-label', on ? 'bucear' : 'agacharse');
    if (!on) { const p = inp(); if (p) p.crouch = false; bCrouch.classList.remove('on'); }
  };
  ctx.events.on('player:swim', ({ on }) => swimLabels(!!on));

  // only while playing
  ctx.events.on('mode', ({ mode }) => {
    root.classList.toggle('hidden', mode !== 'play');
    if (mode !== 'play') { endStick(); lid = null; const p = inp(); if (p) { p.jump = p.crouch = false; } bJump.classList.remove('on'); bCrouch.classList.remove('on'); }
  });
  root.classList.toggle('hidden', ctx.mode !== 'play');
}
