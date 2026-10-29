// ?debug overlay (owner: A1): live numbers, wireframe and collider visualisation.
//   F3 hide/show the text   F4 wireframe   F6 colliders (walls + floors within 30 m of the player)
// Bottom-right on purpose: the top-left 112x48 px belongs to the Almanac pill.
import * as THREE from 'three';

const RANGE = 30;

export function installOverlay(ctx) {
  const el = document.createElement('pre');
  el.id = 'dbg';
  Object.assign(el.style, {
    position: 'fixed', right: '8px', bottom: '8px', margin: '0', padding: '6px 9px', zIndex: 40, pointerEvents: 'none', whiteSpace: 'pre',
    font: '11px/1.35 ui-monospace, Consolas, monospace', color: '#cfe', background: 'rgba(0,0,0,.55)', borderRadius: '4px', maxWidth: '92vw', overflow: 'hidden',
  });
  document.body.appendChild(el);

  let shown = true, wire = false, colliders = false, group = null, builtAt = { x: 1e9, z: 1e9 }, acc = 1;
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x66ff99, wireframe: true });
  const wallMat = new THREE.LineBasicMaterial({ color: 0xff5577, depthTest: false, transparent: true, opacity: 0.9 });
  const floorMat = new THREE.LineBasicMaterial({ color: 0x3df2ff, depthTest: false, transparent: true, opacity: 0.9 });

  const rebuild = () => {
    if (group) { ctx.scene.remove(group); group.traverse((o) => o.geometry?.dispose()); }
    group = new THREE.Group(); group.name = 'dbg.colliders'; group.renderOrder = 1e6;
    const p = ctx.player?.s; if (!p) return;
    const w = [], f = [];
    for (const k of ctx.physics.walls) {
      if (!k.on && k.door == null) continue;
      const cx = (k.x1 + k.x2) / 2, cz = (k.z1 + k.z2) / 2;
      if (Math.abs(cx - p.x) > RANGE + Math.abs(k.x2 - k.x1) / 2 || Math.abs(cz - p.z) > RANGE + Math.abs(k.z2 - k.z1) / 2) continue;
      const y0 = Math.max(k.y0, p.y - 1), y1 = Math.min(k.y1, p.y + 3.5);
      if (y1 <= y0) continue;
      w.push(k.x1, y0, k.z1, k.x2, y0, k.z2, k.x2, y0, k.z2, k.x2, y1, k.z2, k.x2, y1, k.z2, k.x1, y1, k.z1, k.x1, y1, k.z1, k.x1, y0, k.z1, k.x1, y0, k.z1, k.x2, y1, k.z2);
    }
    for (const k of ctx.physics.floors) {
      if (k.x1 < p.x - RANGE || k.x0 > p.x + RANGE || k.z1 < p.z - RANGE || k.z0 > p.z + RANGE) continue;
      const hy = (x, z) => k.y + k.a * (x - k.px) + k.b * (z - k.pz);
      if (Math.abs(hy((k.x0 + k.x1) / 2, (k.z0 + k.z1) / 2) - p.y) > 6) continue;
      for (let i = 0; i < k.pts.length; i++) {
        const a = k.pts[i], b = k.pts[(i + 1) % k.pts.length];
        f.push(a[0], hy(a[0], a[1]) + 0.02, a[1], b[0], hy(b[0], b[1]) + 0.02, b[1]);
      }
    }
    const mk = (arr, m) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.renderOrder = 1e6; return l; };
    if (w.length) group.add(mk(w, wallMat));
    if (f.length) group.add(mk(f, floorMat));
    ctx.scene.add(group); builtAt = { x: p.x, z: p.z };
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { shown = !shown; el.style.display = shown ? '' : 'none'; e.preventDefault(); }
    else if (e.code === 'F4') { wire = !wire; ctx.scene.overrideMaterial = wire ? wireMat : null; e.preventDefault(); }
    else if (e.code === 'F6') { colliders = !colliders; if (group) group.visible = colliders; builtAt = { x: 1e9, z: 1e9 }; e.preventDefault(); }
  });

  ctx.addSystem('overlay', (dt) => {
    const p = ctx.player, s = p?.s;
    if (colliders && s && Math.hypot(s.x - builtAt.x, s.z - builtAt.z) > 4) rebuild();
    acc += dt; if (acc < 0.25) return; acc = 0;
    const st = ctx.stats, pool = ctx.pool?.stats?.(), vis = ctx.visibility?.stats?.(), L = ctx.look?.state;
    el.textContent = [
      `${st.fps} fps  ${st.frameMs} ms   calls ${st.drawCalls}  tris ${(st.triangles / 1e6).toFixed(2)}M  geo ${st.geometries}  tex ${st.textures}  prog ${st.programs}`,
      `quality ${ctx.quality} (${ctx.qualityMode})  post ${ctx.post?.active ? ctx.post.name : 'off'}  lights ${pool?.lit ?? 0}/${pool?.active ?? 0}  int ${vis?.intShown ?? 0}/${vis?.intGroups ?? 0}`,
      `hour ${ctx.hour.toFixed(2)}  sun ${L ? L.elDeg.toFixed(1) : '?'} deg  night ${(ctx.night ?? 0).toFixed(2)}  indoor ${L ? L.indoor.toFixed(2) : '?'}`,
      s ? `pos ${s.x.toFixed(1)} ${s.y.toFixed(2)} ${s.z.toFixed(1)}  yaw ${(p.yaw * 57.3).toFixed(0)}  ${s.onGround ? 'ground' : 'air'}${s.blocked ? ' BLOCKED' : ''}  ${p.surface}` : '',
      s ? `bld ${p.building ?? '-'} floor ${p.floor}  ${p.indoors ? 'indoors' : 'outdoors'}  room ${p.room?.id ?? '-'}  errors ${ctx.errors.length}` : '',
      `F3 text  F4 wireframe${wire ? ' (on)' : ''}  F6 colliders${colliders ? ' (on)' : ''}`,
    ].join('\n');
  }, 90);
}
