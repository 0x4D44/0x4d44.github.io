// Side projection for steep ground (owner: A1; review R1-D07). The terrain tiles, the earth banks of walls.js and hill.js, and A5's retaining cuts carry planar UVs
// (world x, z in metres): fine on a plateau, but a bank at 45 to 65 degrees (or a vertical cut) smears the texture along the slope into streaks, and on a vertical face
// every texel is the same row. `triplanar(material)` patches a MeshStandardMaterial so that, by the surface normal, the colour map is also read from the SIDE:
//
//   steep = 1 - smoothstep(0.55, 0.88, max(|n.y|, |face.y|))   0 on a plateau (up to ~28 degrees: the image is exactly what it was), 1 from ~57 degrees to a vertical face
//   side  = mix( map(x, y), map(z, y), wx )          wx = |n.x|^4 / (|n.x|^4 + |n.z|^4): a face that looks along z is read from (x, y), one that looks along x from (z, y)
//   colour = mix( map(top uv), side, steep )
//
// The classic three-axis blend, with the top projection being the material's own uv. (The first version read the side from one coordinate along the face, dot(xz, tangent),
// which is continuous on a plane but collapses where a bank curves: round a mound the tangent turns with the normal and the coordinate is 0 all the way round, so the face
// drew as radial fans, the pattern the review saw at (-40, 10).) Three fetches in one pass, no branch (a texture read inside a divergent branch has undefined derivatives);
// the world position and normal come from the vertex shader (`vLadW`, `vLadN`). `n` is the smoothed vertex normal and `face` the triangle's own (from the screen derivatives of the world
// position): the terrain lattice smooths its normals across a step, so the flat triangles at the foot of a near-vertical cut (and along its lip) carried a steep interpolated normal, were read from
// the side where the height hardly changes, and smeared into streaks 0.5 m wide (R1-D24, (-40, 10), a camera behind a retaining face); a flat face is never side-projected, whatever its corners say. The other way round is the same smoothing: a riser of 3 m over half a metre (face |y| 0.14) carries the
// corner normals of the flat ground above it (|y| 0.7 to 0.97), so the larger of the two said "flat" and the riser kept the planar x-z uvs, one row of texels stretched down it (R1-108, the
// notch beside the stair at (5, 30)): a face steeper than ~72 degrees (|y| below 0.30) is therefore side-projected whatever its corners say, fading out by |y| 0.50 (~60 degrees): a flat
// triangle never has a face that steep, so the foot and the lip of a cut (R1-D24) are untouched. The repeat is the map's own (metric UVs, `tile` metres per repeat), so a pixel of side texture
// is as big as a pixel of top texture. The normal map keeps the top projection (it only shades; its tangent frame comes from the screen derivatives of the uv, so it stays
// stable). Materials without a map are left as they are. Not for instanced or skinned meshes (terrain is neither).
import * as THREE from 'three';

/** The fragment replacement for `#include <map_fragment>`, exported so a test can read it. */
export const TRI_FRAGMENT = `#ifdef USE_MAP
	vec3 ladN = normalize( vLadN );
	vec3 ladC = cross( dFdx( vLadW ), dFdy( vLadW ) );
	float ladFy = abs( ladC.y ) / max( length( ladC ), 1.0e-9 );
	float ladSteep = 1.0 - smoothstep( 0.55, 0.88, max( abs( ladN.y ), ladFy ) );
	ladSteep = max( ladSteep, 1.0 - smoothstep( 0.30, 0.50, abs( ladC.y ) / max( length( ladC ), 1.0e-9 ) ) );
	vec2 ladB = pow( abs( ladN.xz ), vec2( 4.0 ) );
	float ladX = ladB.x / ( ladB.x + ladB.y + 1.0e-6 );
	vec4 ladSide = mix( texture2D( map, vec2( vLadW.x, vLadW.y ) * ladRep ), texture2D( map, vec2( vLadW.z, vLadW.y ) * ladRep ), ladX );
	vec4 sampledDiffuseColor = mix( texture2D( map, vMapUv ), ladSide, ladSteep );
	diffuseColor *= sampledDiffuseColor;
#endif`;
const VARY = 'varying vec3 vLadW;\nvarying vec3 vLadN;';

/** Patch `m` (a MeshStandardMaterial) for side projection. Returns m. `m.userData.tri` says so. */
export function triplanar(m) {
  m.userData.tri = true;
  m.onBeforeCompile = function ladTriplanar(shader) {
    THREE.Material.prototype.onBeforeCompile.call(this, shader);                  // the shared look uniforms (fog glow) first
    shader.uniforms.ladRep = { value: this.map?.repeat ?? new THREE.Vector2(1, 1) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VARY}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvLadW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n\tvLadN = normalize( mat3( modelMatrix ) * objectNormal );');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${VARY}\nuniform vec2 ladRep;`)
      .replace('#include <map_fragment>', TRI_FRAGMENT);
  };
  return m;
}
