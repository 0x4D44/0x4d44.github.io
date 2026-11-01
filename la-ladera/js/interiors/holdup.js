// INTERIORS (A3): the hold-up view of a find (R4-206: "treasures are hard to read from a standing view ... and there is no close-up inspect view"). E on a special find marks it as before and then
// picks it up: the thing hangs in front of the eyes, large, and turns for a few seconds (a coin shows its face and its edge, a watch its dial and its strap), with its name and its line below it;
// Esc (or E, or the x) puts it back and the game goes on.
//
//   ctx.holdup.open({ id, name: { es, en }, tag: [es, en], react: { es, en }, model: { key } }) -> true | false (false: no model of the library has loaded for it, or no panel layer)
//   ctx.holdup.close(), .isOpen, .update(t) (the pose t seconds after it was lifted: the frame loop's, and the tests'), .state(), .group (the thing in the scene, or null)
//   events  'holdup:open' { id }   'holdup:close' { id, seconds }
//
// It rides A1's panel machinery (ui/flow.js `addPanel` is the one hook this file needs there): the pointer is released, the world waits and Esc closes ONLY the hold-up, back to the game, exactly
// like the reader. The thing itself is drawn by the scene's own renderer, in the scene, in front of the camera: a panel with no backdrop leaves the view clear and puts the caption at the bottom.
//   * Only a thing with a MODEL of the inspect library is held (inspect-bindings.json binds them): a find that only has its flat stand-in shape would be a pale polygon at ten times its size, which
//     reads worse than the speck in the drawer. It keeps the glint (glint.js) and the toast.
//   * It is held at a fixed size (HOLD.SIZE along its longest side) whatever it is: a gold coin four centimetres across and a pair of knickers thirty are both readable at arm's length.
import * as THREE from 'three';
import { inspectParts, INSPECT } from './inspect.js';

/** Metres: how long the longest side of what is held is, how far in front of the eyes it hangs, how far under the line of sight; seconds the thing turns before it rests facing the eyes; whole turns. */
export const HOLD = { SIZE: 0.2, DIST: 0.42, LOWER: 0.012, SECONDS: 5.5, TURNS: 2, MIN_SCALE: 0.7, MAX_SCALE: 10, LEAN: 0.2, LIFT: 0.22 };
/** The scale that brings a thing whose longest side is `longest` metres to the size it is held at. */
export const holdScale = (longest) => Math.max(HOLD.MIN_SCALE, Math.min(HOLD.MAX_SCALE, HOLD.SIZE / Math.max(longest, 1e-4)));
const smooth = (k) => k * k * (3 - 2 * k);
/** How the thing is turned `t` seconds after it was lifted: `spin` = radians about its own upright axis (eased in and out over `SECONDS`, `TURNS` whole turns, so it ends facing the eyes) and
 *  `tilt` = how far its top leans toward the eyes (it wavers a little while it turns, then rests at LEAN). */
export function holdPose(t, lean = HOLD.LEAN) {
  const k = Math.min(1, Math.max(0, t / HOLD.SECONDS));
  return { spin: HOLD.TURNS * 2 * Math.PI * smooth(k), tilt: lean + 0.1 * Math.sin(t * 1.9) * (1 - k) };
}

/**
 * A material for the held thing: the scene's own, cloned (the drawer's thing keeps its look), plus a lift of its OWN colour so a dim room does not swallow it and gold stays gold (a flat grey
 * emissive turned the metals grey). The lift adds a share of the albedo (map and baked vertex colours included) to the emissive term, through the same shared-uniforms hook every material has.
 */
function lifted(ctx) {
  const cache = new Map();
  return (key) => {
    let m = cache.get(key);
    if (m === undefined) {
      const src = ctx.mat?.(key);
      m = src ? (src.clone?.() ?? src) : null;
      if (m && m.isMeshStandardMaterial) {
        m.onBeforeCompile = function heldLift(shader) {
          THREE.Material.prototype.onBeforeCompile?.call(this, shader);                          // the shared look uniforms first (shaderpatch.js)
          shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * ${HOLD.LIFT.toFixed(2)};`);
        };
        m.needsUpdate = true;
      }
      cache.set(key, m);
    }
    return m;
  };
}

/** The picture of a thing: { inner, size: [w, h, d] metres } (its own up +Y and front +Z, centred on the origin as modelled), or null when its model has not loaded. */
function build(ctx, h, mat) {
  const m = h.model, parts = m?.key ? inspectParts(ctx, m.key) : null;
  if (!parts?.length) return null;
  const inner = new THREE.Group();
  for (const p of parts) { const mm = mat(p.matKey); if (mm) inner.add(new THREE.Mesh(p.geometry, mm)); }          // (the geometry belongs to the asset cache: never disposed here)
  return inner.children.length ? { inner, size: INSPECT[m.key]?.s ?? [0.05, 0.05, 0.01] } : null;
}

const raf = (fn) => globalThis.requestAnimationFrame?.(fn) ?? 0, caf = (id) => globalThis.cancelAnimationFrame?.(id);
const el = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const k of kids) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k))); return e; };
const CSS = `
#panel[data-panel=holdup] { background: none; -webkit-backdrop-filter: none; backdrop-filter: none; align-items: flex-end; pointer-events: none; padding-bottom: max(18px, env(safe-area-inset-bottom)); }
#panel[data-panel=holdup] .sheet { pointer-events: auto; width: min(620px, 100%); margin: 0 auto; background: linear-gradient(rgba(60, 38, 18, .9), rgba(27, 20, 16, .93)); border: 1px solid rgba(233, 162, 59, .45); border-radius: 12px; }
#panel[data-panel=holdup] header { padding-bottom: 0; }
#panel[data-panel=holdup] #panelbody { padding: 4px 18px 14px; }
.hold { text-align: center; }
.hold .hd-tag { margin: 0; font: 700 10px/1.2 var(--sans); letter-spacing: .16em; text-transform: uppercase; color: var(--accent); }
#panelbody .hold .hd-name { margin: 4px 0 6px; font: 400 22px/1.2 var(--serif); letter-spacing: normal; text-transform: none; color: inherit; }   /* (the panel's own #panelbody h3 rule would make it small pale capitals) */
.hold .hd-name small { display: block; margin-top: 3px; font: italic 400 14px/1.2 var(--serif); opacity: .72; }
.hold .hd-react { margin: 4px 0 0; font: italic 400 15px/1.45 var(--serif); }
.hold .hd-react.en { opacity: .72; font-size: 13px; }
.hold .hd-hint { margin: 10px 0 0; font: 400 12px/1.2 var(--sans); opacity: .75; }
`;
let cssIn = false;
const ensureCss = () => { if (cssIn || typeof document === 'undefined') return; cssIn = true; const s = document.createElement('style'); s.id = 'holdup-css'; s.textContent = CSS; document.head.appendChild(s); };

export function createHoldUp(ctx) {
  const S = { cur: null, raf: 0, t0: 0 }, V = { fwd: new THREE.Vector3(), up: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler() };
  const flow = () => ctx.flow, emit = (n, p) => ctx.events?.emit?.(n, p);
  const lang = () => { const v = ctx.settings?.v?.subLang; return v === 'es' || v === 'en' ? v : 'both'; };
  const mat = lifted(ctx);

  const drop = () => {
    const c = S.cur; if (!c) return null;
    S.cur = null; caf(S.raf); S.raf = 0;
    c.group.removeFromParent();
    return c;
  };
  /** The one place a hold-up ends (any way it ends). */
  const finish = () => { const c = drop(); if (c) emit('holdup:close', { id: c.id, seconds: (performance.now() - S.t0) / 1000 }); };

  const panel = {
    get title() { return lang() === 'en' ? 'Find' : 'Hallazgo'; },
    modal: true,
    render(body) {
      const c = S.cur; if (!c) { body.replaceChildren(); return; }
      const mode = lang(), en = (v) => v?.en ?? v?.es ?? '', tag = c.tag ?? ['Hallazgo', 'Find'];
      body.replaceChildren(el('div', 'hold',
        el('p', 'hd-tag', mode === 'en' ? tag[1] : tag[0]),
        el('h3', 'hd-name', mode === 'en' ? en(c.name) : c.name.es, mode === 'both' && c.name.en && c.name.en !== c.name.es ? el('small', '', ' ', c.name.en) : null),
        c.react?.es ? el('p', 'hd-react', mode === 'en' ? en(c.react) : c.react.es) : null,
        c.react?.en && mode === 'both' && c.react.en !== c.react.es ? el('p', 'hd-react en', c.react.en) : null,
        el('p', 'hd-hint', el('kbd', '', 'Esc'), mode === 'en' ? ' put it back · ' : ' dejarlo donde estaba · ', el('kbd', '', 'E'), mode === 'en' ? ' close' : ' cerrar'),
      ));
    },
    close() { finish(); },
    key(e) {
      if (!S.cur) return false;
      // The flow asks the open panel first (capture phase), and the game is back the moment it closes: the SAME keydown would then reach the player (engine/player.js), where E picks the
      // thing straight up again and Space jumps. So the key that puts it back is not passed on.
      const putBack = () => { e.stopImmediatePropagation?.(); api.close(); return true; };
      if (e.code === 'KeyE') return putBack();
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') return e.target?.tagName === 'BUTTON' ? false : putBack();
      return false;
    },
  };

  const api = {
    open(h) {
      const f = flow();
      if (!f?.openPanel || !f.addPanel || !ctx.scene || !ctx.camera || !h) return false;
      const built = build(ctx, h, mat); if (!built) return false;
      if (S.cur) finish();
      const group = new THREE.Group(); group.name = 'holdup'; group.add(built.inner);
      group.scale.setScalar(holdScale(Math.max(...built.size)));
      group.traverse((o) => { o.frustumCulled = false; if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.renderOrder = 5; } });
      ctx.scene.add(group);
      S.cur = { ...h, group }; S.t0 = performance.now();
      ensureCss(); f.addPanel('holdup', panel);
      f.openPanel('holdup');
      if (f.current !== 'holdup') { drop(); return false; }
      api.update(0);
      const loop = (now) => { if (!S.cur) return; S.raf = raf(loop); api.update((now - S.t0) / 1000); };
      S.raf = raf(loop);
      emit('holdup:open', { id: h.id });
      return true;
    },
    /** Pose the thing `t` seconds after it was lifted: in front of the camera, a little low, turned. */
    update(t = 0) {
      const c = S.cur; if (!c) return false;
      const cam = ctx.camera, g = c.group, { spin, tilt } = holdPose(t);
      V.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion); V.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      g.position.copy(cam.position).addScaledVector(V.fwd, HOLD.DIST).addScaledVector(V.up, -HOLD.LOWER);
      V.q.setFromEuler(V.e.set(tilt, spin, 0, 'XYZ'));                                       // spin about its own upright axis first, then lean its top toward the eyes
      g.quaternion.copy(cam.quaternion).multiply(V.q);
      g.updateMatrixWorld(true);
      return true;
    },
    close() { if (flow()?.current === 'holdup') flow().closePanel(); else finish(); },
    get isOpen() { return !!S.cur && flow()?.current === 'holdup'; },
    state() { const c = S.cur; return { open: !!c && flow()?.current === 'holdup', id: c?.id ?? null, t: c ? (performance.now() - S.t0) / 1000 : 0 }; },
    /** The thing being held (a THREE.Group in the scene) or null: for the tests. */
    get group() { return S.cur?.group ?? null; },
  };
  return api;
}
