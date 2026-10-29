// Local <-> world frame for a building (or any placed object).
// Local frame: origin at the footprint centre at ground-floor level, +x = building width axis (left to right
// seen from the street), +z = "front" (street side), +y up. rotY maps local +z to world direction (sin rotY, cos rotY).
// Matches MeshBuilder.setBasePose(x,y,z,rotY) and three.js Object3D.rotation.y.
export function makeFrame(x, y, z, rotY = 0) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  return {
    x, y, z, rotY,
    toWorld(lx, ly, lz) { return [x + lx * c + lz * s, y + ly, z - lx * s + lz * c]; },
    toLocal(wx, wy, wz) { const dx = wx - x, dz = wz - z; return [dx * c - dz * s, wy - y, dx * s + dz * c]; },
    /** Rotate a local direction (no translation). */
    dir(lx, lz) { return [lx * c + lz * s, -lx * s + lz * c]; },
    /** World facing angle (about Y) of a local facing angle. */
    ry(local = 0) { return rotY + local; },
  };
}

/** Facing angle about Y (0 = +z) of a world direction. Walking toward (dx,dz) means ry = faceY(dx,dz). */
export const faceY = (dx, dz) => Math.atan2(dx, dz);
/** Unit forward vector in the XZ plane for an Object3D-style rotation about Y. */
export const fwd = (ry) => [Math.sin(ry), Math.cos(ry)];
