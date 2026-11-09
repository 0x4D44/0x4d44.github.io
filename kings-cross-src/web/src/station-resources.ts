import * as THREE from 'three';

/** Find textures nested in standard materials, shader uniforms and material user data. */
function collectTextures(value: unknown, textures: Set<THREE.Texture>, visited: Set<object>): void {
  if (value instanceof THREE.Texture) {
    textures.add(value);
    return;
  }
  if (value === null || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  if (ArrayBuffer.isView(value)) return;
  for (const child of Object.values(value)) collectTextures(child, textures, visited);
}

/**
 * Release GPU-backed resources owned by a station scene while preserving its CPU object graph.
 * Three.js listens for these dispose events and can upload the same geometry and textures again
 * when the scene is rendered after a station switch.
 */
export function releaseSceneGpu(scene: THREE.Scene): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const textureScan = new Set<object>();

  scene.traverse((object) => {
    const candidate = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
      skeleton?: THREE.Skeleton;
    };
    if (candidate.geometry?.isBufferGeometry) geometries.add(candidate.geometry);
    const attached = candidate.material;
    if (Array.isArray(attached)) {
      for (const material of attached) if (material instanceof THREE.Material) materials.add(material);
    } else if (attached instanceof THREE.Material) {
      materials.add(attached);
    }
    // Skinned meshes own this texture separately from their material maps.
    if (candidate.skeleton?.boneTexture) textures.add(candidate.skeleton.boneTexture);
  });

  for (const material of materials) collectTextures(material, textures, textureScan);
  collectTextures(scene.background, textures, textureScan);
  collectTextures(scene.environment, textures, textureScan);

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
