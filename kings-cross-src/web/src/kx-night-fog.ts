// KX-only fog treatment. Library materials remain shared and unmodified in the
// Scottish scenes; only window materials used by this scene are cloned.
import * as THREE from 'three';
import { PLATFORM_LANTERN_GLASS } from './furniture.ts';
import { buildingNightMaterialsOf } from './materials.ts';

export function createKxFogMaterials() {
  const active = { value: 0 };
  const windows = new Map<THREE.Material, THREE.Material>();
  const owned = new Set<THREE.Material>();
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const fogged = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const overlays = new Map<THREE.Material & { fog: boolean }, boolean>();
  const lanterns = new Map<THREE.Material, THREE.Material>();

  const lantern = (source: THREE.Material): THREE.Material => {
    if (owned.has(source)) return source;
    let copy = lanterns.get(source);
    if (copy) return copy;
    copy = source.clone();
    const before = source.onBeforeCompile, key = source.customProgramCacheKey();
    copy.onBeforeCompile = (shader, renderer) => {
      before.call(source, shader, renderer);
      shader.uniforms.uKxNightFog = active;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uKxNightFog;')
        .replace('#include <fog_fragment>', `#include <fog_fragment>
#if defined(USE_FOG) && defined(USE_COLOR)
// kx-lantern-emitter-begin
// The lantern is on the end of the arm. Its glass has its own vertex colour
// and keeps normal depth occlusion from the pole, the rim and the shed ribs.
float lanternGlass = 1.0-step(0.002,length(vColor.rgb-vec3(${PLATFORM_LANTERN_GLASS.join(',')})));
float lanternReach = 1.0-smoothstep(55.0,165.0,vFogDepth);
gl_FragColor.rgb += vec3(0.98,0.96,0.92)*lanternGlass*lanternReach*uKxNightFog;
// kx-lantern-emitter-end
#endif`);
    };
    copy.customProgramCacheKey = () => `${key}+kx-lantern-fog`;
    lanterns.set(source, copy);
    owned.add(copy);
    return copy;
  };

  const window = (source: THREE.Material): THREE.Material => {
    if (owned.has(source)) return source;
    const lit = source as THREE.MeshLambertMaterial;
    if (!lit.isMeshLambertMaterial || lit.defines?.WIN_GAIN === undefined || lit.defines?.FLOOD !== undefined) return source;
    let copy = windows.get(source);
    if (copy) return copy;
    copy = source.clone();
    // MeshLambertMaterial.copy omits application-defined preprocessor symbols.
    // Its inherited shader hook still reads them (WIN_GAIN/WIN_RECT/WIN_MODE).
    (copy as THREE.MeshLambertMaterial).defines = { ...lit.defines };
    const before = source.onBeforeCompile, key = source.customProgramCacheKey();
    copy.onBeforeCompile = (shader, renderer) => {
      before.call(source, shader, renderer);
      shader.uniforms.uKxNightFog = active;
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uKxNightFog;')
        .replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace(
          'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );', `// kx-window-fog-begin
// At the surface range a wall disappears, but a luminous pane still sends a
// little light through the air. Only emitted pixels get the longer tail.
if (uKxNightFog > 0.0) {
  float lightShare = clamp(max(max(totalEmissiveRadiance.r,totalEmissiveRadiance.g),totalEmissiveRadiance.b) / max(0.0001,max(max(outgoingLight.r,outgoingLight.g),outgoingLight.b)),0.0,1.0);
  float lightTransmission = max(1.0-fogFactor,exp(-1.8*max(0.0,vFogDepth-fogNear)/max(1.0,fogFar-fogNear)));
  float sourceFog = fogFactor-uKxNightFog*lightShare*(lightTransmission-(1.0-fogFactor));
  gl_FragColor.rgb = mix(gl_FragColor.rgb,fogColor,sourceFog);
} else {
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
}
// kx-window-fog-end`));
    };
    copy.customProgramCacheKey = () => `${key}+kx-window-fog`;
    windows.set(source, copy); owned.add(copy);
    return copy;
  };

  return {
    /** The clone already carries its source's roof-shade hook. */
    owns: (material: THREE.Material) => owned.has(material),
    scan(root: THREE.Object3D) {
      root.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          const variants = buildingNightMaterialsOf(mesh);
          const original = variants?.night ?? mesh.material;
          const patch = mesh.name === 'lamps' && mesh.parent?.name === 'furniture' ? lantern : window;
          const next = Array.isArray(original) ? original.map(patch) : patch(original);
          const changed = Array.isArray(original) ? (next as THREE.Material[]).some((m, i) => m !== original[i]) : next !== original;
          if (changed) {
            if (!originals.has(mesh)) originals.set(mesh, original);
            fogged.set(mesh, next);
            if (active.value > 0) mesh.material = next;
          }
        }
        const sign = (o as THREE.Sprite).isSprite && /^platform-/.test(o.name);
        if (!sign && o.name !== 'clock-dial-glow') return;
        const material = (o as THREE.Sprite).material;
        if (overlays.has(material)) return;
        overlays.set(material, material.fog);
        if (o.name === 'clock-dial-glow') {
          // An additive overlay must fade, not add a fog-coloured disc.
          const before = material.onBeforeCompile, key = material.customProgramCacheKey();
          material.onBeforeCompile = (shader, renderer) => {
            before.call(material, shader, renderer);
            shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace(
              'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );', 'gl_FragColor.a *= 1.0 - fogFactor;'));
          };
          material.customProgramCacheKey = () => `${key}+kx-dial-fog`;
        }
        material.fog = active.value > 0;
        material.needsUpdate = true;
      });
    },
    setLevel(level: number, night = false) {
      active.value = level;
      // Render the original materials whenever this effect is inactive: this
      // preserves day/clear shader programs and transparent-material ordering.
      for (const [mesh, original] of originals) {
        const variants = buildingNightMaterialsOf(mesh);
        mesh.material = level > 0 ? fogged.get(mesh)! : variants ? (night ? variants.night : variants.day) : original;
      }
      for (const [material, original] of overlays) {
        const fog = level > 0 || original;
        if (material.fog !== fog) { material.fog = fog; material.needsUpdate = true; }
      }
    },
    dispose() {
      for (const [mesh, original] of originals) mesh.material = buildingNightMaterialsOf(mesh)?.day ?? original;
      for (const material of owned) material.dispose();
      for (const [material, fog] of overlays) material.fog = fog;
    },
  };
}
