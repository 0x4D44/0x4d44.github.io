// A room behind the lit glass (owner: A1; review R1-104: "at night lit windows are flat uniform yellow panels with no room behind them (by day the same windows show interiors),
// so facades read as cut-outs"). The window material `window_lit` was a see-through pane (alpha 0.3) with a warm glow added on top of it. By day that is glass over the real room;
// at night the glow (2.2 x amber, in HDR, before the exposure) swamps the real room behind it, which is only lit by the moon, and the pane is one flat cream colour. This patches
// the material so that, at night and seen from the street, each lit pane shows a small made-up room instead: an INTERIOR-MAPPING card, a ray cast from the eye through the pane into a
// box (floor, ceiling, two side walls, a back wall) and shaded there, so it has parallax, a ceiling, a lit wall with a cupboard, a door, a picture or a television on it, a lamp
// and the fall-off of its light. Nothing is added to the scene: no triangle, no draw call, no texture; it is the same one mesh per chunk as before and ONE program.
//
//   What a pane carries (arch/shellwin.js `pane`, arch/shellfacade.js `mirador`; any `window_lit` quad without it, such as the rose window and the door lights, is drawn as it always was):
//     colour  = ( 2 + K + seed, +/- width, height )   seed 0..1 picks the room; K = 8 x on + off (arch/mb.js `roomSeed`) is the room's evening: its lights come on at ROOM_ON[on] and go off at
//                                                     ROOM_OFF[off] (clock hours, 24+ past midnight), and outside those hours the pane is dark glass, near or far (arch/mb.js `roomLitAt` is the same rule);
//                                                     |width| and height are the glass's size in metres; the sign says which face of the quad is the street side
//     uv      = ( 0..1 across the whole window as the viewer outside sees it, left to right ;  0..1 up the window )   (so two sashes of one window show one room)
//   The shader reads both through the vertex stage (the colour attribute is not used by the material otherwise: `vertexColors` is off for it).
//
//   What the room looks like is a function of the seed alone (so a window never changes between frames, nor between visits): the lamp (incandescent, warm white, soft white, cool tube,
//   television blue, dim amber, pink LED) and how bright it is; the colour of the walls; the size of the room (2.4 to 5 m wide, 2.8 to 5.2 m deep) and where the window sits in its
//   wall; the furnishing of the back wall; the covering of the glass (nothing, curtains drawn to the sides, a net, a roller blind, a venetian blind, curtains closed). The covering is
//   BACKLIT cloth, which is what a lit window with its curtains drawn looks like from the street.
//
//   Where it applies: only when the emissive glow is up (night: `emissive.r` is the glow x intensity, 0 by day, so by day the pane is exactly what it was), only from the street side
//   of the pane (from inside the building it is plain glass over the street), and only beyond a few metres: from 2 m the real room starts to show through (the card is gone by 0.8 m, in
//   full by 2 m: the review's own stand-off, 3 m from the wall, must see the room), because a card cannot stand in for the furniture the player can walk round.
import * as THREE from 'three';
import { ROOM_ON, ROOM_OFF } from '../arch/mb.js';

// vLrA is FLAT: the four corners of a pane carry the same code, and an interpolated copy of it is off by a few 1e-6 from pixel to pixel (more, the larger the evening code), which the
// seed's sine hash (x 127 x 43758) turns into a different room in every pixel: the pane drew as speckle.
export const PARS = `
flat varying vec3 vLrA;
varying vec2 vLrUv;`;

/** GLSL for the room: declarations (fragment, after <common>) and the part that goes after <emissivemap_fragment>. Exported so a test can read them. */
export const ROOM_FUNCS = `
const vec3 LR_LAMP[7] = vec3[7]( vec3( 1.00, 0.60, 0.28 ), vec3( 1.00, 0.78, 0.50 ), vec3( 1.00, 0.88, 0.72 ), vec3( 0.78, 0.88, 1.00 ), vec3( 0.30, 0.50, 1.00 ), vec3( 1.00, 0.40, 0.14 ), vec3( 1.00, 0.34, 0.60 ) );
const vec3 LR_WALL[8] = vec3[8]( vec3( 0.90, 0.82, 0.62 ), vec3( 0.62, 0.78, 0.62 ), vec3( 0.55, 0.68, 0.85 ), vec3( 0.88, 0.58, 0.62 ), vec3( 0.95, 0.82, 0.40 ), vec3( 0.88, 0.88, 0.85 ), vec3( 0.78, 0.45, 0.32 ), vec3( 0.35, 0.62, 0.60 ) );
const vec3 LR_CLOTH[7] = vec3[7]( vec3( 0.95, 0.50, 0.42 ), vec3( 0.55, 0.70, 0.95 ), vec3( 0.55, 0.85, 0.55 ), vec3( 0.98, 0.86, 0.45 ), vec3( 0.95, 0.92, 0.84 ), vec3( 0.80, 0.58, 0.86 ), vec3( 0.98, 0.68, 0.38 ) );
float lrH( float s, float k ) { return fract( sin( s * 127.1 + k * 311.7 ) * 43758.5453 ); }
float lrBox( vec2 p, vec2 a, vec2 b, float e ) { vec2 m = smoothstep( a - e, a + e, p ) * ( 1.0 - smoothstep( b - e, b + e, p ) ); return m.x * m.y; }
/** The room seen through the pane: s the seed, q the point on the pane in metres from its lower left corner (as seen from outside), rd the ray into the room (z into it), W x H the glass, e the pixel's footprint on the pane. */
vec3 lrRoom( float s, vec2 q, vec3 rd, float W, float H, float e, out vec3 lampLight ) {
	float ml = 0.2 + 1.4 * lrH( s, 2.0 ), mr = 0.2 + 1.4 * lrH( s, 3.0 ), fl = 0.60 + 0.45 * lrH( s, 4.0 ), cl = 0.25 + 0.45 * lrH( s, 5.0 ), D = 2.8 + 2.4 * lrH( s, 6.0 );
	vec3 ro = vec3( q, 0.0 ), lo = vec3( -ml, -fl, 0.0 ), hi = vec3( W + mr, H + cl, D );
	vec3 inv = 1.0 / ( rd + 1.0e-5 * step( abs( rd ), vec3( 1.0e-5 ) ) );
	vec3 tt = mix( ( lo - ro ) * inv, ( hi - ro ) * inv, step( 0.0, rd ) );
	float t = min( tt.x, min( tt.y, tt.z ) );
	vec3 p = ro + rd * t;
	bool onX = tt.x <= min( tt.y, tt.z ), onY = ! onX && tt.y <= tt.z;
	float yy = p.y + fl, ew = ml + W + mr, fx = ( p.x + ml ) / ew, ee = e * ( 1.0 + 0.5 * t );
	float hl = lrH( s, 1.0 );
	int li = hl < 0.34 ? 0 : hl < 0.54 ? 1 : hl < 0.70 ? 2 : hl < 0.83 ? 3 : hl < 0.90 ? 4 : hl < 0.95 ? 5 : 6;
	float inten = mix( 0.55, 1.25, pow( lrH( s, 7.0 ), 1.4 ) ) * ( li == 4 ? 0.50 : li == 5 ? 0.60 : 1.0 );
	lampLight = LR_LAMP[ li ] * inten;
	bool high = lrH( s, 9.0 ) < 0.7;
	vec3 Lp = vec3( 0.5 * ( W + mr - ml ) + ( lrH( s, 8.0 ) - 0.5 ) * 0.4 * ew, high ? H + cl - 0.16 : -fl + 1.35 + 0.3 * lrH( s, 9.5 ), D * ( 0.3 + 0.4 * lrH( s, 10.0 ) ) );
	vec3 wc = LR_WALL[ int( lrH( s, 11.0 ) * 7.999 ) ], n, alb;
	float dado = step( lrH( s, 24.0 ), 0.4 );
	wc *= 1.0 - dado * 0.38 * ( 1.0 - smoothstep( 0.98, 1.02, yy ) );                                          // a darker dado under a chair rail at a metre
	wc = mix( wc, vec3( 0.9 ), dado * 0.7 * ( 1.0 - smoothstep( 0.0, 0.012 + ee, abs( yy - 1.0 ) ) ) );
	vec3 selfGlow = vec3( 0.0 );
	if ( onX ) {
		n = vec3( rd.x > 0.0 ? -1.0 : 1.0, 0.0, 0.0 );
		alb = wc * 0.88;
		float pz = p.z / D, pic = lrBox( vec2( pz, yy ), vec2( 0.30 + 0.3 * lrH( s, 15.0 ), 1.2 ), vec2( 0.55 + 0.3 * lrH( s, 15.0 ), 1.75 ), 0.01 ) * step( 0.6, lrH( s, 16.0 ) );
		alb = mix( alb, vec3( 0.45, 0.55, 0.65 ) * ( 0.6 + 0.8 * lrH( s, 17.0 ) ), pic );
		alb = mix( alb, vec3( 0.12, 0.07, 0.04 ), lrBox( vec2( pz, yy ), vec2( 0.62, 0.0 ), vec2( 0.86, 2.0 ), 0.01 ) * step( lrH( s, 18.0 ), 0.22 ) );
	} else if ( onY ) {
		if ( rd.y > 0.0 ) { n = vec3( 0.0, - 1.0, 0.0 ); alb = vec3( 0.86 ); }
		else {
			n = vec3( 0.0, 1.0, 0.0 );
			float pl = fract( p.x / 0.14 + lrH( s, 14.0 ) ), tile = step( 0.5, lrH( s, 19.0 ) ) * ( 0.5 + 0.5 * abs( step( 0.5, fract( p.x / 0.4 ) ) - step( 0.5, fract( p.z / 0.4 ) ) ) );
			alb = mix( vec3( 0.40, 0.26, 0.15 ) * ( 0.82 + 0.18 * step( 0.07, pl ) ), vec3( 0.55, 0.52, 0.46 ) * ( 0.7 + 0.3 * tile ), step( 0.75, lrH( s, 19.0 ) ) );
		}
	} else {
		n = vec3( 0.0, 0.0, - 1.0 );
		alb = wc;
		alb = mix( alb, vec3( 0.80 ), 1.0 - smoothstep( 0.08, 0.08 + ee + 0.01, yy ) );                    // skirting
		float lay = lrH( s, 12.0 ), a = 0.05 + 0.6 * lrH( s, 13.0 );
		vec2 c = vec2( fx, yy );
		if ( lay < 0.30 ) {                                                                                      // a cupboard, a picture over it
			float cb = lrBox( c, vec2( a, 0.0 ), vec2( a + 0.30, 0.9 + 0.5 * lrH( s, 20.0 ) ), ee * 0.4 );
			alb = mix( alb, vec3( 0.20, 0.11, 0.06 ) * ( 0.8 + 0.5 * step( 0.5, fract( ( fx - a ) * 8.0 ) ) ), cb );
			alb = mix( alb, vec3( 0.55, 0.65, 0.40 ) * ( 0.5 + lrH( s, 21.0 ) ), lrBox( c, vec2( a + 0.04, 1.45 ), vec2( a + 0.26, 1.95 ), ee * 0.4 ) );
		} else if ( lay < 0.50 ) {                                                                               // a door, a picture beside it
			alb = mix( alb, wc * 0.30, lrBox( c, vec2( a, 0.0 ), vec2( a + 0.2, 2.0 ), ee * 0.4 ) );
			alb = mix( alb, vec3( 0.80, 0.55, 0.30 ) * ( 0.5 + lrH( s, 21.0 ) ), lrBox( c, vec2( a + 0.45 > 0.9 ? a - 0.4 : a + 0.45, 1.1 ), vec2( a + 0.45 > 0.9 ? a - 0.2 : a + 0.65, 1.7 ), ee * 0.4 ) );
		} else if ( lay < 0.68 ) {                                                                               // a tall shelf of books
			float sh = lrBox( c, vec2( a, 0.0 ), vec2( a + 0.26, 1.9 ), ee * 0.4 ), bk = step( 0.5, fract( yy * 3.3 ) );
			alb = mix( alb, mix( vec3( 0.22, 0.13, 0.07 ), LR_CLOTH[ int( lrH( s + floor( yy * 3.3 ), 22.0 ) * 6.999 ) ] * 0.7, bk ), sh );
		} else if ( lay < 0.82 ) {                                                                               // the television, on or off
			float tv = lrBox( c, vec2( a + 0.05, 0.62 ), vec2( a + 0.30, 1.0 ), ee * 0.4 );
			alb = mix( alb, vec3( 0.20, 0.11, 0.06 ), lrBox( c, vec2( a, 0.0 ), vec2( a + 0.35, 0.62 ), ee * 0.4 ) );
			alb = mix( alb, vec3( 0.03 ), tv );
			selfGlow = tv * mix( vec3( 0.0 ), LR_LAMP[ 4 ] * 0.9, step( 0.4, lrH( s, 23.0 ) ) );
		} else if ( lay < 0.92 ) {                                                                               // a large picture
			alb = mix( alb, vec3( 0.40, 0.55, 0.70 ) * ( 0.5 + lrH( s, 21.0 ) ), lrBox( c, vec2( a, 1.1 ), vec2( a + 0.34, 1.9 ), ee * 0.4 ) );
		} else {                                                                                                 // a kitchen: fridge, worktop
			alb = mix( alb, vec3( 0.86 ), lrBox( c, vec2( a, 0.0 ), vec2( a + 0.20, 1.7 ), ee * 0.4 ) );
			alb = mix( alb, vec3( 0.25, 0.18, 0.12 ), lrBox( c, vec2( a + 0.22, 0.0 ), vec2( 0.97, 0.88 ), ee * 0.4 ) );
			alb = mix( alb, vec3( 0.75 ), lrBox( c, vec2( a + 0.22, 0.88 ), vec2( 0.97, 0.93 ), ee * 0.4 ) );
		}
	}
	if ( ! onY ) alb *= 0.94 + 0.06 * sin( p.x * 3.1 + p.y * 2.3 + p.z * 1.7 ) * sin( p.z * 2.7 + p.y * 1.9 );
	vec3 d = Lp - p;
	float d2 = dot( d, d ), lam = 0.25 + 0.75 * max( dot( n, d * inversesqrt( d2 ) ), 0.0 ), att = 1.0 / ( 1.0 + 0.35 * d2 );
	vec2 nd = onX ? vec2( min( p.z, D - p.z ), min( p.y - lo.y, hi.y - p.y ) ) : onY ? vec2( min( p.x - lo.x, hi.x - p.x ), min( p.z, D - p.z ) ) : vec2( min( p.x - lo.x, hi.x - p.x ), min( p.y - lo.y, hi.y - p.y ) );
	float ao = 0.5 + 0.5 * smoothstep( 0.0, 0.7, min( nd.x, nd.y ) );                                         // corners are darker: the cue that this is a room and not a picture of one
	vec3 rad = alb * lampLight * ( 1.9 * lam * att + 0.12 ) * ao + selfGlow;
	if ( onY && rd.y > 0.0 ) rad += alb * lampLight * 0.9 * exp( - dot( p.xz - Lp.xz, p.xz - Lp.xz ) * 0.9 );    // the halo of the lamp on the ceiling
	vec3 oc = ro - Lp;                                                                                         // the lamp itself, a bulb the size of a fist, and the glow round it
	float bq = dot( oc, rd ), cq = dot( oc, oc ), r2l = cq - bq * bq, dsc = bq * bq - cq + 0.0169;
	if ( - bq > 0.0 && - bq < t ) rad += lampLight * 0.8 * exp( - r2l * 5.0 );
	if ( dsc > 0.0 && - bq - sqrt( dsc ) > 0.0 && - bq - sqrt( dsc ) < t ) rad = lampLight * 3.2;
	return rad;
}
/** Over the room, the glass's own covering: curtains, a net, a blind, or nothing. Cloth is lit from behind, so it is the lamp's colour times the cloth's, not the room's. */
vec3 lrCover( float s, vec2 q, float W, float H, float e, vec3 room, vec3 lampLight ) {
	float hc = lrH( s, 30.0 ), x = q.x / W, y = q.y / H;
	vec3 cloth = mix( LR_CLOTH[ int( lrH( s, 31.0 ) * 6.999 ) ], vec3( 1.0 ), 0.2 );
	float fq = 26.0 + 14.0 * lrH( s, 32.0 ), aa = 1.0 - smoothstep( 0.012, 0.04, e );
	float fold = mix( 0.8, 0.62 + 0.38 * sin( q.x * fq + 2.0 * sin( q.x * 7.0 ) ), aa );
	if ( hc < 0.36 || lrTune.z > 0.5 ) return room;
	if ( hc < 0.56 ) {                                                                                         // curtains drawn to the sides
		float cl = 0.10 + 0.22 * lrH( s, 33.0 ), cr = 0.10 + 0.22 * lrH( s, 34.0 );
		float m = max( 1.0 - smoothstep( cl - 0.01, cl + 0.01, x ), smoothstep( 1.0 - cr - 0.01, 1.0 - cr + 0.01, x ) );
		return mix( room, cloth * lampLight * ( 0.45 + 0.5 * fold ) * ( 1.0 - 0.3 * smoothstep( 0.85, 1.0, y ) ), m );
	}
	if ( hc < 0.70 ) return mix( room, vec3( 0.88, 0.86, 0.78 ) * lampLight * ( 0.6 + 0.35 * fold ), 0.62 );    // a net curtain
	if ( hc < 0.88 ) {                                                                                         // a roller blind, or a venetian one
		float drop = 0.3 + 0.65 * lrH( s, 35.0 ), m = smoothstep( 1.0 - drop - 0.01, 1.0 - drop + 0.01, y ), hem = 1.0 - smoothstep( 0.0, 0.025, abs( y - ( 1.0 - drop ) ) );
		vec3 blind = vec3( 0.85, 0.80, 0.66 ) * lampLight * ( 0.7 + 0.25 * ( 1.0 - y ) ) * ( 1.0 - 0.35 * hem );
		float slat = hc < 0.80 ? 1.0 : mix( step( 0.5, fract( q.y / 0.032 ) ), 0.65, smoothstep( 0.008, 0.02, e ) );
		return mix( room, mix( room * 0.4, blind, slat ), m );
	}
	float seam = 1.0 - smoothstep( 0.0, 0.012, abs( x - 0.5 ) ), rail = smoothstep( 0.93, 0.97, y );               // curtains drawn shut
	return cloth * lampLight * ( 0.40 + 0.55 * fold ) * ( 1.0 - 0.5 * seam ) * ( 1.0 - 0.45 * rail );
}`;

/** Inserted after <emissivemap_fragment>: the pane's colour and alpha at night, from the street, beyond a few metres. */
export const ROOM_APPLY = `
	float lrFw = max( fwidth( vLrUv.x ) * abs( vLrA.y ), fwidth( vLrUv.y ) * vLrA.z );
	if ( vLrA.x > 1.99 ) {
		float lrK = floor( vLrA.x - 1.9995 ), lrS = clamp( vLrA.x - 2.0 - lrK, 0.0, 1.0 ), lrE = lrHour < 12.0 ? lrHour + 24.0 : lrHour;
		int lrKi = int( lrK + 0.5 );
		float lrOn = step( LR_ON[ lrKi / 8 ], lrE ) * ( 1.0 - step( LR_OFF[ lrKi - 8 * ( lrKi / 8 ) ], lrE ) );
		totalEmissiveRadiance *= lrOn;                                                                           // nobody home yet, or gone to bed: dark glass, near and far
		float lrNight = lrOn * clamp( emissive.r * LR_INV_GLOW, 0.0, 1.0 );
		vec3 lrNo = normalize( vNormal ) * ( vLrA.y > 0.0 ? 1.0 : - 1.0 ), lrEye = normalize( vViewPosition );
		float lrF = lrNight * step( 0.05, dot( lrNo, lrEye ) ) * smoothstep( lrTune.x, lrTune.y, length( vViewPosition ) );
		if ( lrF > 0.002 ) {
			vec3 lrUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ), lrT = normalize( cross( lrUp, lrNo ) ), lrB = cross( lrNo, lrT ), lrRay = - lrEye;
			vec3 lrRd = vec3( dot( lrRay, lrT ), dot( lrRay, lrB ), dot( lrRay, - lrNo ) );
			lrRd.z = max( lrRd.z, 0.02 );
			vec3 lrLamp;
			float lrW = abs( vLrA.y ), lrH2 = vLrA.z;
			vec2 lrQ = vLrUv * vec2( lrW, lrH2 );
			vec3 lrRoomC = lrRoom( lrS, lrQ, normalize( lrRd ), lrW, lrH2, lrFw, lrLamp );
			vec3 lrOut = lrCover( lrS, lrQ, lrW, lrH2, lrFw, lrRoomC, lrLamp );
			lrOut = lrOut / ( 1.0 + 0.4 * lrOut ) * LR_GAIN;                                                    // highlights roll off: a ceiling under a bulb is hot, not white
			totalEmissiveRadiance = mix( totalEmissiveRadiance * 0.7, lrOut, lrF );
			diffuseColor.a = mix( diffuseColor.a, 0.94, lrF );
			diffuseColor.rgb *= 1.0 - 0.8 * lrF;
		}
	}`;

/** The vertex stage: hand the colour attribute (seed, size) and the uv to the fragment stage. */
const VERTEX_ATTR = `#ifndef USE_COLOR\nattribute vec3 color;\n#endif`;
const VERTEX_SET = `\n\tvLrA = color;\n\tvLrUv = uv;`;

/** The evening table (arch/mb.js ROOM_ON / ROOM_OFF) as GLSL constants: one source for the shader and for the JS rule `roomLitAt`. */
const glslArr = (name, a) => `const float ${name}[${a.length}] = float[${a.length}]( ${a.map((v) => v.toFixed(2)).join(', ')} );`;
export const ROOM_TABLE = `${glslArr('LR_ON', ROOM_ON)}\n${glslArr('LR_OFF', ROOM_OFF)}`;

/** Patch `m` (the `window_lit` MeshStandardMaterial) to show a room behind its glass. Returns m. `m.userData.room` says so; `m.userData.lrU` holds its uniforms:
 *  lrGain (the room's brightness), lrTune (fade-in start and end in metres, 1 = no covering, -), lrHour (the clock: engine/look.js `setHour` keeps it). */
export function windowRoom(m) {
  m.userData.room = true;
  const U = m.userData.lrU = { lrGain: { value: 0.7 }, lrTune: { value: new THREE.Vector4(0.8, 2.0, 0, 0) }, lrHour: { value: 20 } };
  const glow = () => m.userData.glow ?? 2.4;
  m.onBeforeCompile = function ladWindowRoom(shader) {
    THREE.Material.prototype.onBeforeCompile.call(this, shader);                  // the shared look uniforms (fog glow) first
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PARS}\n${VERTEX_ATTR}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${VERTEX_SET}`);
    Object.assign(shader.uniforms, U);                                              // the same objects: a change to m.userData.lrU reaches the program
    const consts = `#define LR_INV_GLOW ${(1 / glow()).toFixed(5)}\nuniform float lrGain;\nuniform vec4 lrTune;\nuniform float lrHour;\n#define LR_GAIN lrGain\n${ROOM_TABLE}`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PARS}\n${consts}\n${ROOM_FUNCS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${ROOM_APPLY}`);
  };
  m.customProgramCacheKey = () => `ladWindowRoom2:${glow()}`;
  return m;
}

/** The clock reaches every room-window material (engine/look.js `setHour`). */
export function setRoomHour(m, h) { if (m.userData.lrU) m.userData.lrU.lrHour.value = h; }
