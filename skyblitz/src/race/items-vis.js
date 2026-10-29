// Item/weapon visuals: orbs (instanced), missiles, mines, drones (pooled meshes) and cannon bolts (instanced).
// Simple but glossy: emissive materials > 1.0 so the bloom pass picks them up. Fx adds trails/explosions from events.
import * as THREE from 'three';

const FWD = new THREE.Vector3(0, 0, -1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color(), _p = new THREE.Vector3(), _k = new THREE.Vector3(), _e = new THREE.Euler(), _ax = new THREE.Vector3(0.3, 1, 0.2).normalize();

const glow = (r, g, b, opacity = 1, additive = false) => {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), transparent: opacity < 1 || additive, opacity, toneMapped: false, depthWrite: !additive });
  if (additive) m.blending = THREE.AdditiveBlending;
  return m;
};

class Pool {
  constructor(parent, factory, size) {
    this.items = []; this.free = [];
    for (let i = 0; i < size; i++) { const o = factory(); o.visible = false; parent.add(o); this.items.push(o); this.free.push(o); }
  }
  acquire() { const o = this.free.pop(); if (o) o.visible = true; return o || null; }
  release(o) { if (!o) return; o.visible = false; this.free.push(o); }
}

function buildMissile() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.3, metalness: 0.5 });
  const red = new THREE.MeshStandardMaterial({ color: 0xff3b2e, roughness: 0.35, metalness: 0.3, emissive: 0x551008 });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 3.0, 12), body); cyl.rotation.x = Math.PI / 2; g.add(cyl);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.1, 12), red); nose.rotation.x = -Math.PI / 2; nose.position.z = -2.0; g.add(nose);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.4, 12), red); band.rotation.x = Math.PI / 2; band.position.z = -0.4; g.add(band);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.9), red);
    const a = i * Math.PI / 2; fin.position.set(Math.sin(a) * 0.55, Math.cos(a) * 0.55, 1.1); fin.rotation.z = -a; g.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.2, 10), glow(2.0, 0.8, 0.12, 0.75, true)); flame.rotation.x = Math.PI / 2; flame.position.z = 2.6; g.add(flame);
  g.userData.flame = flame; g.scale.setScalar(1.6);
  return g;
}

function buildMine() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.45, metalness: 0.8 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 1), metal); g.add(core);
  const spikeGeo = new THREE.ConeGeometry(0.45, 1.8, 6);
  for (let i = 0; i < 12; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / 12), th = Math.PI * (1 + Math.sqrt(5)) * i;
    const sp = new THREE.Mesh(spikeGeo, metal); const d = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
    sp.position.copy(d).multiplyScalar(2.6); sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); g.add(sp);
  }
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), glow(4, 0.2, 0.3)); g.add(light);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(5.5, 12, 8), glow(1.5, 0.15, 0.2, 0.07, true)); g.add(halo);
  g.userData.light = light; g.userData.halo = halo;
  return g;
}

function buildDrone() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, roughness: 0.25, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x20303f, roughness: 0.5, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 10), hull); body.scale.set(1, 0.55, 1.4); g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.22, 8, 24), dark); ring.rotation.x = Math.PI / 2; g.add(ring);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), glow(0.3, 4, 1.8)); eye.position.set(0, 0.1, -1.7); g.add(eye);
  const rotor = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.08, 6, 24), glow(0.4, 3, 1.5, 0.8, true)); rotor.rotation.x = Math.PI / 2; g.add(rotor);
  g.userData.rotor = rotor;
  return g;
}

export class ItemVisuals {
  constructor(game, orbCount) {
    this.game = game; this.group = new THREE.Group(); this.group.name = 'items'; game.scene.add(this.group);
    const mk = (geo, mat, n) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; this.group.add(im); return im; };
    // orbs: glowing core, translucent shell, two crossed rings
    this.orbCore = mk(new THREE.IcosahedronGeometry(2.6, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x666666, roughness: 0.18, metalness: 0.15 }), orbCount);
    this.orbShell = mk(new THREE.SphereGeometry(4.2, 16, 12), glow(1, 1, 1, 0.3, false), orbCount);
    this.orbRing = mk(new THREE.TorusGeometry(5.4, 0.2, 6, 28), glow(0.9, 1.1, 1.6, 0.75, true), orbCount * 2);
    this.orbCore.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, orbCount) * 3), 3);
    this.orbShell.instanceColor = this.orbCore.instanceColor;      // shared: shell tints with the core
    this.bolts = mk(new THREE.BoxGeometry(0.4, 0.4, 6), glow(1.2, 3.2, 3.6, 1, true), 192);
    this.bolts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(192 * 3), 3);
    this.missiles = new Pool(this.group, buildMissile, 16);
    this.mines = new Pool(this.group, buildMine, 16);
    this.drones = new Pool(this.group, buildDrone, 8);
    this.t = 0;
  }

  /** orbs: [{pos, active, scale, phase}] ; scale 0..1 (pop-in after respawn). */
  updateOrbs(dt, orbs) {
    this.t += dt;
    let n = 0, nr = 0;
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i]; if (o.scale <= 0.01) continue;
      const bob = Math.sin(this.t * 2 + o.phase) * 0.8, sc = o.scale * (1 + 0.06 * Math.sin(this.t * 6 + o.phase));
      _q.setFromAxisAngle(_ax, this.t * 1.7 + o.phase); _k.set(sc, sc, sc); _p.set(o.pos.x, o.pos.y + bob, o.pos.z);
      _m.compose(_p, _q, _k); this.orbCore.setMatrixAt(n, _m); this.orbShell.setMatrixAt(n, _m);
      _c.setHSL((this.t * 0.2 + o.phase * 0.159) % 1, 1.0, 0.5); this.orbCore.setColorAt(n, _c);
      for (let k = 0; k < 2; k++) {
        _q.setFromEuler(_e.set(k ? Math.PI / 2 : 0, this.t * (k ? 2.4 : -1.9) + o.phase, k ? this.t * 1.3 : 0.4));
        _m.compose(_p, _q, _k); this.orbRing.setMatrixAt(nr++, _m);
      }
      n++;
    }
    for (const im of [this.orbCore, this.orbShell]) { im.count = n; im.instanceMatrix.needsUpdate = true; }
    this.orbRing.count = nr; this.orbRing.instanceMatrix.needsUpdate = true;
    if (this.orbCore.instanceColor) this.orbCore.instanceColor.needsUpdate = true;
  }

  /** bolts: array of active bolt objects {pos, prev, dir, color?}. */
  updateBolts(alpha, list, n) {
    let k = 0;
    for (let i = 0; i < n; i++) {
      const b = list[i]; if (!b.active) continue;
      _s.lerpVectors(b.prev, b.pos, alpha);
      _q.setFromUnitVectors(FWD, b.dir);
      _m.compose(_s, _q, b.scale); this.bolts.setMatrixAt(k, _m);
      this.bolts.setColorAt(k, b.byDrone ? _c.setRGB(0.6, 3, 1.4) : _c.setRGB(1.2, 2.6, 3.6)); k++;
      if (k >= 192) break;
    }
    this.bolts.count = k; this.bolts.instanceMatrix.needsUpdate = true; if (this.bolts.instanceColor) this.bolts.instanceColor.needsUpdate = true;
  }

  place(mesh, a, b, alpha, dir) {
    mesh.position.lerpVectors(a, b, alpha);
    if (dir) mesh.quaternion.setFromUnitVectors(FWD, dir);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.()); });
  }
}
