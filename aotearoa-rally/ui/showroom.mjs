// Live 3D showroom on its own small renderer/canvas (the main world renderer stays untouched).

import * as THREE from "three";

export function createShowroom(canvas, createCarVisual) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x1c2a20, 1.0));
  const key = new THREE.DirectionalLight(0xfff0cf, 3.2);
  key.position.set(5, 7, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd9b0, 2.0);
  rim.position.set(-6, 3, -5);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshStandardMaterial({ color: 0x0c1c14, roughness: 0.85, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.9, 4.05, 96), new THREE.MeshBasicMaterial({ color: 0xffc81e, transparent: true, opacity: 0.55 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  scene.add(ring);
  const pivot = new THREE.Group();
  scene.add(pivot);
  let car = null, raf = 0, running = false, angle = 0.6, drag = false, lastX = 0, idle = 0, reduced = false;
  let last = performance.now();

  function resize() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 200;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.fov = w / h < 1.1 ? 44 : 32;
    cam.updateProjectionMatrix();
  }
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!drag && !reduced) angle += dt * 0.35;
    pivot.rotation.y = angle;
    const r = 8.2;
    cam.position.set(0, 1.9, r);
    cam.lookAt(0, 0.65, 0);
    if (car && car.update) {
      try { car.showroomTick && car.showroomTick(dt); } catch { /* optional */ }
    }
    renderer.render(scene, cam);
  }
  const down = (e) => { drag = true; lastX = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch { /* ok */ } };
  const move = (e) => { if (drag) { angle += (e.clientX - lastX) * 0.012; lastX = e.clientX; } };
  const up = () => { drag = false; };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.style.touchAction = "pan-y";

  const api = {
    renderer,
    setCar(spec, livery = 0) {
      if (car) {
        pivot.remove(car.object3d);
        car.dispose && car.dispose();
        car = null;
      }
      try {
        car = createCarVisual(THREE, spec, { livery, number: 7 });
        car.setShowroom && car.setShowroom(true);
        pivot.add(car.object3d);
      } catch (e) {
        car = null;
        console.error("showroom car failed", e);
      }
    },
    setReducedMotion(v) {
      reduced = !!v;
    },
    start() {
      if (running) return;
      running = true;
      resize();
      last = performance.now();
      raf = requestAnimationFrame(frame);
      window.addEventListener("resize", resize);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    },
    resize,
    dispose() {
      api.stop();
      if (car) { car.dispose && car.dispose(); car = null; }
      floor.geometry.dispose(); floor.material.dispose(); ring.geometry.dispose(); ring.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
    },
  };
  void idle;
  return api;
}
