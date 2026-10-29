// Global three.js shader patches (owner: A1). Installed once, before the first material compiles.
//
//  1. Fog: exponential fog whose colour gains a warm "sun scatter" glow toward the sun (same formula as the sky dome in sky.js,
//     so far geometry dissolves into the horizon haze instead of into a flat grey). Standard materials only.
//  2. Shadows: the directional shadow term fades out smoothly toward the edge of the shadow frustum (no hard cut at ~50 m).
//  3. Every material receives the shared look uniforms (ladGlowCol, ladGlowAmt) through Material.prototype.onBeforeCompile,
//     so GLB materials and anything modules create themselves get the same fog without any plumbing.
import * as THREE from 'three';

/** Shared uniform objects: mutate `.value` and every material updates. */
export const lookUniforms = {
  ladGlowCol: { value: new THREE.Color(1.0, 0.62, 0.35) },
  ladGlowAmt: { value: 0.0 },
};

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
  THREE.Material.prototype.onBeforeCompile = function onBeforeCompile(shader) { Object.assign(shader.uniforms, lookUniforms); };
  if (failed.length) console.warn('[look] shader patch not applied to', failed.join(','), '- three version changed?');
  state = { ok: failed.length === 0, failed };
  return state;
}
