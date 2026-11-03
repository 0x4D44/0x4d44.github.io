// Global three.js shader patches (owner: A1). Installed once, before the first material compiles.
//
//  1. Fog: exponential fog whose colour gains a warm "sun scatter" glow toward the sun (same formula as the sky dome in sky.js,
//     so far geometry dissolves into the horizon haze instead of into a flat grey). Standard materials only.
//  2. Shadows: the directional shadow term fades out smoothly toward the edge of the shadow frustum (no hard cut at ~50 m).
//  3. Every material receives the shared look uniforms (ladGlowCol, ladGlowAmt) through Material.prototype.onBeforeCompile,
//     so GLB materials and anything modules create themselves get the same fog without any plumbing.
//  4. The beach's ground (round 8, A1; dev/FEATURE-BEACH.md 2.1): the sand the sea has wet is darker and shinier below the wet line (the still sea + 12 cm + the swash's run-up), and the seabed under a camera that is
//     under the sea carries the caustics. Both by material NAME (core/matlib.js names every material by its key), through the same hook, so the coast's own materials need no plumbing.
import * as THREE from 'three';
import { SEA } from '../world/coast.js';

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;

/**
 * Shared uniform objects: mutate `.value` and every material updates.
 *   ladGlowCol, ladGlowAmt   the sun-scatter glow of the fog
 *   uSeaLevel, uSwash        the still sea (m) and the run-up of the swell over the wet line (m): the sand's wet line hangs from them. They have their defaults (the still sea, no swash) from the first frame:
 *                            the ground is drawn long before the sea is (the shipped road builds the water a moment after the milestone), and engine/water.js feeds them once it exists
 *   ladUnder, ladDay         the camera's under-the-sea blend (engine/look.js) and the daylight (the caustics are the sun's)
 *   ladCaustic, ladFlow      the caustic tile and its scroll: a black pixel and no scroll until engine/water.js has the tile
 */
export const lookUniforms = {
  ladGlowCol: { value: new THREE.Color(1.0, 0.62, 0.35) },
  ladGlowAmt: { value: 0.0 },
  uSeaLevel: { value: SEA },
  uSwash: { value: 0 },
  ladUnder: { value: 0 },
  ladDay: { value: 1 },
  ladCaustic: { value: blank },
  ladFlow: { value: new THREE.Vector4(0, 0, 0, 0) },                          // (a Vector4's own default has w = 1)
};
export const BLANK_CAUSTIC = blank;

/** Which materials the beach patch is for, by name: 'wet' (the sand above the water) and 'caustic' (the seabeds). */
export const SEA_PATCH = Object.freeze({ sand_dry: 'wet', seabed_sand: 'caustic', seabed_rock: 'caustic' });

/** The wet line's height over the still sea (m), the swash run-up comes on top; the width of its soft edge; and how dark and how shiny wet sand is. */
export const WET = Object.freeze({ line: 0.12, below: 0.10, above: 0.04, dark: 0.36, rough: 0.30 });

const SEA_DECL = `varying vec3 vLadW;
uniform float uSeaLevel, uSwash, ladUnder, ladDay;
uniform vec4 ladFlow;
uniform sampler2D ladCaustic;`;
const WET_GLSL = `{
	float ladLine = uSeaLevel + ${WET.line.toFixed(2)} + uSwash;
	float ladWet = 1.0 - smoothstep( ladLine - ${WET.below.toFixed(2)}, ladLine + ${WET.above.toFixed(2)}, vLadW.y );
	diffuseColor.rgb *= 1.0 - ${WET.dark.toFixed(2)} * ladWet;
	roughnessFactor = mix( roughnessFactor, ${WET.rough.toFixed(2)}, ladWet );
}`;
const CAUSTIC_GLSL = `if ( ladUnder > 0.001 ) {
	float ladD = uSeaLevel - vLadW.y;
	float ladC1 = texture2D( ladCaustic, vLadW.xz * 0.25 + ladFlow.zw ).r, ladC2 = texture2D( ladCaustic, vLadW.zx * 0.19 - ladFlow.zw * 0.7 ).r;
	float ladK = ( ladC1 * ladC2 * 3.0 + ( ladC1 + ladC2 ) * 0.25 ) * smoothstep( 0.1, 0.4, ladD ) * ( 1.0 - smoothstep( 3.0, 5.0, ladD ) );
	outgoingLight += diffuseColor.rgb * vec3( 1.0, 0.96, 0.85 ) * ladK * ladUnder * ladDay * 1.4;
}`;

/** The sand's and the seabeds' share of the patch: `kind` is 'wet' or 'caustic' (SEA_PATCH). Exported for the tests. */
export function patchSea(shader, kind) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLadW;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLadW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
  let f = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + SEA_DECL);
  if (kind === 'wet') f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + WET_GLSL);
  else f = f.replace('#include <opaque_fragment>', CAUSTIC_GLSL + '\n#include <opaque_fragment>');
  shader.fragmentShader = f;
}

const FOG = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	vec3 ladFogCol = fogColor;
	#ifdef STANDARD
	#if NUM_DIR_LIGHTS > 0
	{
		vec3 ladV = normalize( - vViewPosition );
		float ladSd = max( dot( ladV, directionalLights[ 0 ].direction ), 0.0 );
		ladFogCol += ladGlowCol * ( pow( ladSd, 4.0 ) * 0.35 + pow( ladSd, 20.0 ) * 0.65 ) * ladGlowAmt;
	}
	#endif
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, ladFogCol, fogFactor );
#endif`;

const SHADOW_FADE_FN = `
float ladShadowFade( vec4 sc ) {
	vec3 p = sc.xyz / sc.w;
	vec2 e = abs( p.xy - 0.5 ) * 2.0;
	return 1.0 - smoothstep( 0.70, 0.96, max( e.x, e.y ) );
}`;

let state = null;

/** Install the patches. Returns { ok, failed:[names] } (also cached: safe to call twice). */
export function installShaderPatches() {
  if (state) return state;
  const C = THREE.ShaderChunk, failed = [];
  const rep = (name, from, to) => {
    if (typeof C[name] === 'string' && C[name].includes(from)) C[name] = C[name].replace(from, to);
    else failed.push(name);
  };
  rep('fog_pars_fragment', 'uniform vec3 fogColor;', 'uniform vec3 fogColor;\n\tuniform vec3 ladGlowCol;\n\tuniform float ladGlowAmt;');
  C.fog_fragment = FOG;
  C.lights_pars_begin += SHADOW_FADE_FN;
  const dirShadow = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
  rep('lights_fragment_begin', dirShadow, `mix( 1.0, ${dirShadow}, ladShadowFade( vDirectionalShadowCoord[ i ] ) )`);
  THREE.Material.prototype.onBeforeCompile = function onBeforeCompile(shader) {
    Object.assign(shader.uniforms, lookUniforms);
    const kind = SEA_PATCH[this.name];
    if (kind) patchSea(shader, kind);
  };
  const cacheKey = THREE.Material.prototype.customProgramCacheKey;                  // (the default is the hook's own text: one program for every material, which the beach's two kinds must not share)
  THREE.Material.prototype.customProgramCacheKey = function customProgramCacheKey() { const kind = SEA_PATCH[this.name]; return kind ? 'ladSea:' + kind : cacheKey.call(this); };
  if (failed.length) console.warn('[look] shader patch not applied to', failed.join(','), '- three version changed?');
  state = { ok: failed.length === 0, failed };
  return state;
}
