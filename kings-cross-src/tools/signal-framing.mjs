// Shared by Node geometry tests and the capture browser. Nothing is added to the page bundle.
function headGeometry(T, group) {
  const lamp = group.getObjectByName('aspect'), post = group.getObjectByName('post');
  const housing = group.children.find(o => o.isMesh && o.geometry?.type === 'BoxGeometry');
  if (!lamp || !post || !housing) throw new Error('signal housing, lamp or post missing');
  const bounds = new T.Box3().setFromObject(housing).union(new T.Box3().setFromObject(lamp));
  const postBox = new T.Box3().setFromObject(post), size = bounds.getSize(new T.Vector3());
  // Include the exposed upper post, not its entire length to the ground.
  const postTop = post.getWorldPosition(new T.Vector3());
  postTop.y = postBox.max.y - Math.min((postBox.max.y - postBox.min.y) / 4, size.y);
  bounds.expandByPoint(postTop);
  const samples = [{ name: 'lamp', point: lamp.getWorldPosition(new T.Vector3()), physical: true, surface: lamp },
    { name: 'post-top', point: postTop, physical: true }];
  housing.geometry.computeBoundingBox();
  const b = housing.geometry.boundingBox;
  // Sample the whole face, including its perimeter. A clear lamp alone is insufficient.
  for (const x of [-.98, -.5, 0, .5, .98]) for (const y of [-.98, -.5, 0, .5, .98]) {
    const p = new T.Vector3((b.min.x + b.max.x) / 2 + x * (b.max.x - b.min.x) / 2,
      (b.min.y + b.max.y) / 2 + y * (b.max.y - b.min.y) / 2, b.max.z);
    samples.push({ name: 'housing', point: housing.localToWorld(p), physical: true });
  }
  const question = group.getObjectByName('unknown');
  if (question?.visible) {
    bounds.union(new T.Box3().setFromObject(question));
    question.traverse(o => {
      const positions = o.geometry?.attributes?.position;
      if (!positions) return;
      // Every marker vertex is checked, including the dot, without treating lines as solid walls.
      for (let i = 0; i < positions.count; i++) samples.push({ name: 'unknown-marker',
        point: o.localToWorld(new T.Vector3().fromBufferAttribute(positions, i)), physical: false });
    });
  }
  const face = new T.Vector3(0, 0, 1).transformDirection(group.matrixWorld);
  return { bounds, samples, face, focus: bounds.getCenter(new T.Vector3()) };
}

/** Check the real camera, rendered scene and world transforms; never hide an obstruction. */
export function inspectSignalFrame(T, scene, camera, group, ground) {
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const { bounds, samples, face, focus } = headGeometry(T, group);
  const towardsCamera = camera.position.clone().sub(focus).normalize();
  if (towardsCamera.dot(face) < .65) return { clear: false, reason: 'camera is not on the readable approach side' };
  const groundY = ground?.heightAt(camera.position.x, camera.position.z);
  if (groundY !== undefined && (!Number.isFinite(groundY) || camera.position.y < groundY + .25))
    return { clear: false, reason: 'camera is below the scene ground clearance' };
  let screenMinY = Infinity, screenMaxY = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new T.Vector3(x, y, z).project(camera);
    screenMinY = Math.min(screenMinY, p.y); screenMaxY = Math.max(screenMaxY, p.y);
    if (Math.abs(p.x) > .88 || Math.abs(p.y) > .88 || p.z <= -1 || p.z >= 1)
      return { clear: false, reason: 'housing, marker or post top falls outside frame margin' };
  }
  if (screenMaxY - screenMinY < .6) return { clear: false, reason: 'head too small to read in frame' };
  const meshes = [];
  scene.traverseVisible(o => {
    if (o.isMesh && camera.layers.test(o.layers) && (Array.isArray(o.material) ? o.material : [o.material])
      .some(m => m?.visible !== false && m?.opacity !== 0)) meshes.push(o);
  });
  const belongs = object => { for (let o = object; o; o = o.parent) if (o === group) return true; return false; };
  const ray = new T.Raycaster(); let checkedSamples = 0;
  for (const sample of samples) {
    const direction = sample.point.clone().sub(camera.position), distance = direction.length();
    ray.set(camera.position, direction.normalize()); ray.near = .01; ray.far = distance + .02;
    const hits = ray.intersectObjects(meshes, false), own = hits.find(h => belongs(h.object));
    // The head's own surfaces are targets, never external occluders. Stop at their front surface.
    const visibleDistance = sample.physical && own ? Math.min(distance, own.distance) : distance;
    const hit = hits.find(h => !belongs(h.object) && h.distance < visibleDistance - .001);
    if (hit) {
      const chain = [];
      for (let o = hit.object; o; o = o.parent) chain.push({ name: o.name, type: o.type,
        userData: Object.fromEntries(Object.entries(o.userData ?? {}).filter(([,v]) => ['string','number','boolean'].includes(typeof v))) });
      const occluder = { chain, distanceM: hit.distance, targetDistanceM: distance,
        point: hit.point.toArray(), target: sample.point.toArray(), camera: camera.position.toArray() };
      return { clear: false, reason: `${sample.name} occluded`, blocker: chain.map(o => o.name || o.type).reverse().join('/'), occluder, checkedSamples };
    }
    if (sample.surface && own?.object !== sample.surface)
      return { clear: false, reason: `${sample.name} hidden by its own housing`, checkedSamples };
    if (sample.physical && !own)
      return { clear: false, reason: `${sample.name} has no visible head surface`, checkedSamples };
    checkedSamples++;
  }
  return { clear: true, checkedSamples, groundY: groundY ?? null,
    worldBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
}

/** Search only the approach side. Close/offset views can avoid a portal that blocks a distant view. */
export function captureCamera(T, scene, camera, group, ground) {
  scene.updateMatrixWorld(true);
  const { bounds, face, focus } = headGeometry(T, group), span = bounds.getSize(new T.Vector3()).length();
  const across = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), face).normalize();
  let attempts = 0, lastReason = 'no candidates'; const failures = [];
  for (const scale of [1, 1.4, 2, 3, 4]) for (const side of [0, .3, -.3, .65, -.65]) for (const lift of [0, .3, -.2]) {
    attempts++;
    const distance = span * scale;
    camera.position.copy(focus).add(face.clone().multiplyScalar(distance)).addScaledVector(across, side * span);
    camera.position.y += lift * span;
    const groundY = ground?.heightAt(camera.position.x, camera.position.z);
    if (groundY !== undefined) camera.position.y = Math.max(camera.position.y, groundY + .3);
    camera.near = .03; camera.lookAt(focus); camera.updateMatrixWorld(true);
    // Fit all corners in camera space, with the same margin later checked by inspectSignalFrame.
    let tangent = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const p = new T.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      tangent = Math.max(tangent, Math.abs(p.y) / -p.z, Math.abs(p.x) / (-p.z * camera.aspect));
    }
    camera.fov = Math.max(28, 2 * Math.atan(tangent / .8) * 180 / Math.PI);
    if (camera.fov > 65) continue;
    camera.updateProjectionMatrix();
    const visibility = inspectSignalFrame(T, scene, camera, group, ground);
    if (visibility.clear) return { position: camera.position.toArray(), target: focus.toArray(),
      fov: camera.fov, near: camera.near, attempts, visibility };
    lastReason = visibility.reason;
    failures.push({ position: camera.position.toArray(), visibility });
  }
  const blocked = failures.find(f => f.visibility.occluder)?.visibility;
  const detail = blocked ? `; ${blocked.reason} by ${blocked.blocker} at ${blocked.occluder.distanceM.toFixed(3)} m (target ${blocked.occluder.targetDistanceM.toFixed(3)} m)` : '';
  const error = new Error(`No unobstructed approach-side view of ${group.name || 'signal'} after ${attempts} candidates: ${lastReason}${detail}`);
  error.details = { head: group.name, post: group.getWorldPosition(new T.Vector3()).toArray(), attempts, failures };
  throw error;
}

/** The overview's 8 m orbit clamp must not silently push a close-up behind a portal. */
export function frameSignalView(T, scene, camera, controls, group, ground) {
  controls.enableDamping = false; controls.minDistance = 0; controls.maxPolarAngle = Math.PI; controls.update();
  const view = captureCamera(T, scene, camera, group, ground);
  controls.target.set(...view.target); controls.update();
  const visibility = inspectSignalFrame(T, scene, camera, group, ground);
  if (!visibility.clear) throw new Error(`Orbit controls changed the clear signal view: ${visibility.reason}`);
  return { ...view, position: camera.position.toArray(), visibility };
}
