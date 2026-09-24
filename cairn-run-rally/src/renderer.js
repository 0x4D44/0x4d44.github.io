import { DEG, mat4Identity, mat4Invert, mat4LookAt, mat4Multiply, mat4Perspective } from './math.js';

const GLSL_COMMON = `
const vec3 GAMMA=vec3(2.2);
vec3 toLinear(vec3 c){return pow(max(c,vec3(0.0)),GAMMA);}
// Narkowicz's ACES filmic curve: cheap, and it keeps saturated highlights from
// flattening to white the way a Reinhard curve does on a low-poly palette.
vec3 toneMap(vec3 x){x=max(x,vec3(0.0));return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}
vec3 encodeColor(vec3 linearColor,float exposure){return pow(toneMap(linearColor*exposure),vec3(1.0/2.2));}
`;
const WORLD_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uViewProjection;
uniform mat4 uModel;
out vec3 vColor;
out vec3 vNormal;
out vec3 vWorld;
void main(){
  vec4 world=uModel*vec4(aPosition,1.0);
  vWorld=world.xyz;
  vNormal=normalize(mat3(uModel)*aNormal);
  // Linearise per vertex, not per pixel: flat-shaded faces share one colour.
  vColor=pow(max(aColor,vec3(0.0)),vec3(2.2));
  gl_Position=uViewProjection*world;
}`;
const WORLD_FRAGMENT = `#version 300 es
precision highp float;
${GLSL_COMMON}
in vec3 vColor;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uCamera;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSunLight;
uniform vec3 uSkyAmbient;
uniform vec3 uGroundAmbient;
uniform vec3 uFogColor;
uniform float uSunStrength;
uniform float uAmbientStrength;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogHeight;
uniform float uExposure;
uniform float uAlpha;
uniform float uSpecular;
uniform float uShininess;
uniform float uFresnel;
out vec4 outColor;
void main(){
  vec3 toCamera=uCamera-vWorld;
  float distanceToCamera=length(toCamera);
  vec3 view=toCamera/max(distanceToCamera,1e-4);
  // Geometry is drawn with culling off, so a back face must be lit by its
  // flipped normal instead of turning into a black silhouette.
  vec3 normal=normalize(vNormal);
  if(dot(normal,view)<0.0)normal=-normal;
  vec3 sun=normalize(uSunDirection);
  float ndl=dot(normal,sun);
  float wrapped=clamp(ndl*0.5+0.5,0.0,1.0);
  float direct=wrapped*wrapped;
  float skyFacing=clamp(normal.y*0.5+0.5,0.0,1.0);
  // Every colour arrives linear: vertex colours from the vertex stage, the
  // environment from the CPU, so the only per-pixel pow is the final encode.
  vec3 base=vColor;
  vec3 sunLinear=uSunColor;
  vec3 keyLight=uSunLight;
  vec3 ambient=mix(uGroundAmbient,uSkyAmbient,skyFacing)*uAmbientStrength;
  vec3 lit=base*(ambient+keyLight*uSunStrength*direct);
  vec3 halfVector=normalize(sun+view);
  float specular=pow(max(dot(normal,halfVector),0.0),uShininess)*uSpecular*step(0.0,ndl);
  float rim=uFresnel*pow(1.0-clamp(dot(normal,view),0.0,1.0),5.0);
  lit+=sunLinear*uSunStrength*(specular+rim*0.4);
  // Aerial perspective. Fog thins with altitude so a ridge line stays readable
  // while the valley floor behind it washes into the sky.
  float fog=smoothstep(uFogNear,uFogFar,distanceToCamera);
  fog*=mix(0.6,1.0,exp(-max(0.0,vWorld.y-uFogHeight)*0.006));
  float towardsSun=pow(max(dot(-view,sun),0.0),4.0);
  vec3 fogLinear=uFogColor+sunLinear*uSunStrength*towardsSun*0.14;
  lit=mix(lit,fogLinear,clamp(fog,0.0,1.0));
  outColor=vec4(encodeColor(lit,uExposure),uAlpha);
}`;
const SKY_VERTEX = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
 vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
 vUv=p;
 gl_Position=vec4(p*2.0-1.0,1.0,1.0);
}`;
const SKY_FRAGMENT = `#version 300 es
precision highp float;
${GLSL_COMMON}
in vec2 vUv;
uniform mat4 uInverseViewProjection;
uniform vec3 uCamera;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyLower;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform vec3 uCloudColor;
uniform vec3 uCloudShade;
uniform float uSunStrength;
uniform float uCloudCover;
uniform float uCloudScale;
uniform float uTime;
uniform float uWind;
uniform float uNight;
uniform float uSunSize;
uniform float uHaze;
uniform float uExposure;
out vec4 outColor;
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
float hash13(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float valueNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);
 f=f*f*(3.0-2.0*f);
 float a=hash21(i),b=hash21(i+vec2(1.0,0.0)),c=hash21(i+vec2(0.0,1.0)),d=hash21(i+vec2(1.0,1.0));
 return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
float fbm(vec2 p){
 float value=0.0,amplitude=0.52;
 for(int i=0;i<4;i++){value+=amplitude*valueNoise(p);p*=2.04;amplitude*=0.5;}
 return value;
}
void main(){
 vec4 far=uInverseViewProjection*vec4(vUv*2.0-1.0,1.0,1.0);
 vec3 direction=normalize(far.xyz/far.w-uCamera);
 vec3 sun=normalize(uSunDirection);
 float height=direction.y;
 vec3 color=mix(toLinear(uSkyHorizon),toLinear(uSkyTop),pow(clamp(height,0.0,1.0),0.6));
 vec3 below=mix(toLinear(uSkyHorizon),toLinear(uSkyLower),clamp(-height*3.4,0.0,1.0));
 if(height<0.0)color=below;
 color=mix(color,toLinear(uSkyHorizon),uHaze*exp(-abs(height)*11.0));
 if(uNight>0.002&&height>0.0){
  vec3 cell=floor(direction*230.0);
  float roll=hash13(cell);
  if(roll>0.9962){
   float twinkle=0.4+hash13(cell+7.31)*0.85;
   color+=vec3(0.82,0.88,1.0)*twinkle*uNight*smoothstep(0.02,0.3,height);
  }
 }
 float towardsSun=dot(direction,sun);
 float disc=smoothstep(1.0-uSunSize*1.7,1.0-uSunSize*0.4,towardsSun);
 float glow=pow(max(towardsSun,0.0),170.0)*0.55+pow(max(towardsSun,0.0),20.0)*0.26+pow(max(towardsSun,0.0),4.0)*0.07;
 color+=toLinear(uSunColor)*(disc*3.1+glow)*uSunStrength;
 if(height>0.02&&uCloudCover>0.002){
  vec2 plane=direction.xz/max(height,0.13)*uCloudScale+vec2(uTime*(0.0035+uWind*0.014),uTime*0.0017);
  float density=fbm(plane);
  float threshold=1.0-uCloudCover;
  float mask=smoothstep(threshold,threshold+0.34,density)*smoothstep(0.03,0.28,height);
  vec3 cloud=mix(toLinear(uCloudShade),toLinear(uCloudColor),smoothstep(threshold,threshold+0.6,density));
  cloud+=toLinear(uSunColor)*uSunStrength*pow(max(towardsSun,0.0),5.0)*0.4*(1.0-uCloudCover*0.55);
  color=mix(color,cloud,mask*0.92);
 }
 outColor=vec4(encodeColor(color,uExposure),1.0);
}`;
const PARTICLE_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in float aSize;
layout(location=2) in float aAlpha;
layout(location=3) in vec3 aColor;
uniform mat4 uViewProjection;
uniform vec3 uCamera;
uniform float uFogNear;
uniform float uFogFar;
out float vAlpha;
out vec3 vColor;
void main(){
 vec4 clip=uViewProjection*vec4(aPosition,1.0);
 gl_Position=clip;
 gl_PointSize=clamp(aSize*430.0/max(1.0,clip.w),1.0,110.0);
 float fade=1.0-smoothstep(uFogNear*1.1,uFogFar,distance(aPosition,uCamera));
 vAlpha=aAlpha*clamp(fade,0.05,1.0);
 vColor=pow(max(aColor,vec3(0.0)),vec3(2.2));
}`;
const PARTICLE_FRAGMENT = `#version 300 es
precision highp float;
${GLSL_COMMON}
in float vAlpha;
in vec3 vColor;
uniform vec3 uSunColor;
uniform float uSunStrength;
uniform float uAmbientStrength;
uniform float uExposure;
out vec4 outColor;
void main(){
 vec2 p=gl_PointCoord*2.0-1.0;
 float d=dot(p,p);
 if(d>1.0)discard;
 float alpha=(1.0-smoothstep(0.08,1.0,d))*vAlpha;
 vec3 lit=vColor*(vec3(uAmbientStrength*0.9)+uSunColor*uSunStrength*0.85);
 outColor=vec4(encodeColor(lit,uExposure),alpha);
}`;
const SHADOW_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
uniform mat4 uViewProjection;
uniform mat4 uModel;
out vec2 vUv;
void main(){
 vUv=aCorner;
 gl_Position=uViewProjection*(uModel*vec4(aCorner.x,0.0,aCorner.y,1.0));
}`;
const SHADOW_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uTint;
uniform float uStrength;
out vec4 outColor;
void main(){
 // Multiplicative blend: the quad darkens whatever ground colour is under it
 // instead of painting one fixed shade over six different region palettes.
 float falloff=1.0-smoothstep(0.18,1.0,length(vUv));
 outColor=vec4(mix(vec3(1.0),uTint,clamp(falloff*uStrength,0.0,1.0)),1.0);
}`;

function compile(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader compile failed');return s;}
function program(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Program link failed');return p;}
export function color(hex){const n=typeof hex==='number'?hex:Number.parseInt(hex.replace('#',''),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}

const environmentFinite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const environmentClamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, environmentFinite(value, min)));
const environmentColor = (value, fallback) => Array.isArray(value) && value.length >= 3
  ? value.slice(0, 3).map(channel => environmentClamp(channel))
  : typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? color(value)
    : fallback.slice();
const environmentMix = (a, b, amount) => {
  const t = environmentClamp(amount);
  return a.map((channel, index) => channel + (b[index] - channel) * t);
};
const environmentScale = (value, amount) => value.map(channel => environmentClamp(channel * amount));

/**
 * Convert authored palette/weather data into the bounded settings consumed by
 * the sky and world shaders. No stage or region IDs participate in the rules.
 */
export function deriveRenderEnvironment(palette = {}, weather = {}) {
  const source = palette && typeof palette === 'object' ? palette : {};
  const authoredWeather = weather && typeof weather === 'object' ? weather : {};
  const sky = environmentColor(source.sky, [.27, .39, .43]);
  const terrain = environmentColor(source.grass || source.terrain, [.32, .39, .28]);
  const farGrass = environmentColor(source.farGrass || source.terrain, [.29, .35, .25]);
  const water = environmentColor(source.water, [.2, .34, .38]);
  const precipitation = String(authoredWeather.precipitation || 'none').toLowerCase();
  const wetness = environmentClamp(authoredWeather.roadWetness);
  const wind = environmentClamp(authoredWeather.wind);
  const visibilityM = environmentClamp(environmentFinite(authoredWeather.visibilityM, 850), 220, 3000);
  const storm = precipitation === 'storm' ? 1 : 0;
  const rain = precipitation === 'rain' || storm ? 1 : 0;
  const snow = precipitation === 'snow' || precipitation === 'sleet' ? 1 : 0;
  const timeOfDay = String(authoredWeather.timeOfDay || 'day').toLowerCase();
  const dusk = timeOfDay === 'dusk' || timeOfDay === 'dawn' ? 1 : 0;
  const night = timeOfDay === 'night' ? 1 : 0;
  const dim = environmentClamp(1 - storm * .18 - rain * .06 - snow * .1 - dusk * .04 - night * .24, .5, 1);
  const horizonWetness = environmentClamp(.28 + wetness * .24 + rain * .1);
  const skyTop = environmentScale(environmentMix(sky, farGrass, .2 + snow * .14), dim);
  const skyHorizon = environmentScale(environmentMix(sky, terrain, horizonWetness), dim * .96);
  const skyLower = environmentScale(environmentMix(terrain, water, .16 + rain * .18), dim * .92);
  const fogColor = environmentScale(environmentMix(environmentMix(farGrass, sky, .55), skyHorizon, .62 + wetness * .16), dim * .97);
  const baseDirection = night ? [-.28, .44, -.36] : dusk ? [.12, .64, .38] : [.35, .84, .26];
  const sunDirection = baseDirection.map((value, index) => value + (index === 0 ? wind * .08 : index === 2 ? -wind * .05 : 0));
  const sunColor = (night ? [.48, .58, .82] : dusk ? [1, .64, .4] : snow ? [.86, .91, 1] : [1, .93, .75])
    .map((value, index) => environmentClamp(value * (1 - storm * (index === 2 ? .22 : .12))));
  const sunStrength = environmentClamp(.92 - storm * .24 - rain * .06 - snow * .1 - night * .24, .42, 1);
  const fogNear = environmentClamp(visibilityM * (.25 + (1 - wetness) * .08), 55, 1800);
  const fogFar = environmentClamp(visibilityM, 220, 3000);
  const overcast = environmentClamp(storm * .8 + rain * .5 + snow * .45 + (1 - dim) * .6);
  // Direct sunlight reaching the ground is far less saturated than the disc:
  // keeping the two apart stops a dusk stage from turning uniformly orange.
  const sunLight = environmentMix(sunColor, [1, 1, 1], .42 + overcast * .2);
  // Overcast light is mostly sky-dome light, so ambient rises as the sun fades.
  const ambientStrength = environmentClamp(.3 + overcast * .26 + snow * .1 - night * .06, .22, .72);
  const skyAmbient = environmentMix(skyTop, skyHorizon, .35);
  const groundAmbient = environmentScale(environmentMix(terrain, farGrass, .4), .55 + snow * .35);
  const cloudCover = environmentClamp(.14 + storm * .66 + rain * .42 + snow * .34 + wind * .12 + wetness * .1, 0, .93);
  const cloudColor = environmentMix(environmentScale([1, .98, .95], dim), sunColor, .22 + dusk * .3);
  const cloudShade = environmentMix(skyHorizon, environmentScale(cloudColor, .42), .45);
  return Object.freeze({
    weatherId: String(authoredWeather.id || authoredWeather.weatherId || '') || null,
    precipitation,
    visibilityM,
    fogNear,
    fogFar,
    skyTop: Object.freeze(skyTop),
    skyHorizon: Object.freeze(skyHorizon),
    skyLower: Object.freeze(skyLower),
    fogColor: Object.freeze(fogColor),
    sunDirection: Object.freeze(sunDirection),
    sunColor: Object.freeze(sunColor),
    sunPosition: Object.freeze([environmentClamp(.77 - wind * .12), environmentClamp(.73 - storm * .08 - night * .12)]),
    sunStrength,
    sunLight: Object.freeze(sunLight),
    skyAmbient: Object.freeze(skyAmbient),
    groundAmbient: Object.freeze(groundAmbient),
    ambientStrength,
    cloudColor: Object.freeze(cloudColor),
    cloudShade: Object.freeze(cloudShade),
    cloudCover,
    cloudScale: environmentClamp(.09 + storm * .05 - snow * .02, .04, .2),
    nightFactor: night ? environmentClamp(1 - cloudCover * .75, .1, 1) : 0,
    // A low sun reads larger; a stormy one is a diffuse smear rather than a disc.
    sunSize: environmentClamp(.0016 + dusk * .0022 + storm * .004 + rain * .0018, .001, .009),
    haze: environmentClamp(.2 + wetness * .3 + storm * .22 + rain * .12 - night * .1, .05, .72),
    exposure: environmentClamp(1.12 + night * .34 + storm * .16 + rain * .07 - (1 - overcast) * .04, .85, 1.9),
    fogHeightM: environmentFinite(authoredWeather.fogHeightM, 0)
  });
}

/** sRGB-authored colour to linear light, once on the CPU instead of per pixel. */
export function linearColor(value){return value.map(channel=>Math.pow(Math.max(0,channel),2.2));}

export class MeshBuilder {
 constructor(){this.data=[];}
 vertex(p,n,c){this.data.push(p.x,p.y,p.z,n.x,n.y,n.z,c[0],c[1],c[2]);}
 triangle(a,b,c,col,normal=null){let n=normal;if(!n){const ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},ac={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};const nx=ab.y*ac.z-ab.z*ac.y,ny=ab.z*ac.x-ab.x*ac.z,nz=ab.x*ac.y-ab.y*ac.x,l=Math.hypot(nx,ny,nz)||1;n={x:nx/l,y:ny/l,z:nz/l};}this.vertex(a,n,col);this.vertex(b,n,col);this.vertex(c,n,col);}
 quad(a,b,c,d,col,normal=null){this.triangle(a,b,c,col,normal);this.triangle(a,c,d,col,normal);}
 box(center,size,col,faceShade=true){const x=size.x/2,y=size.y/2,z=size.z/2;const p=[[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]].map(v=>({x:center.x+v[0],y:center.y+v[1],z:center.z+v[2]}));const f=[[4,5,6,7],[1,0,3,2],[0,4,7,3],[5,1,2,6],[7,6,2,3],[0,1,5,4]];for(let i=0;i<f.length;i++){const ids=f[i],shade=faceShade?[.92,.76,.84,1,.98,.63][i]:1,c=col.map(v=>v*shade);this.quad(p[ids[0]],p[ids[1]],p[ids[2]],p[ids[3]],c);}}
 boxYaw(center,size,yaw,col,faceShade=true){const x=size.x/2,y=size.y/2,z=size.z/2,c=Math.cos(yaw),s=Math.sin(yaw),point=(lx,ly,lz)=>({x:center.x+lx*c+lz*s,y:center.y+ly,z:center.z-lx*s+lz*c}),p=[point(-x,-y,-z),point(x,-y,-z),point(x,y,-z),point(-x,y,-z),point(-x,-y,z),point(x,-y,z),point(x,y,z),point(-x,y,z)],f=[[4,5,6,7],[1,0,3,2],[0,4,7,3],[5,1,2,6],[7,6,2,3],[0,1,5,4]];for(let i=0;i<f.length;i++){const ids=f[i],shade=faceShade?[.92,.76,.84,1,.98,.63][i]:1,face=col.map(v=>v*shade);this.quad(p[ids[0]],p[ids[1]],p[ids[2]],p[ids[3]],face);}}
 cylinderX(center,radius,length,sides,col){const left=center.x-length/2,right=center.x+length/2;for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2,p1={x:left,y:center.y+Math.cos(a)*radius,z:center.z+Math.sin(a)*radius},p2={x:left,y:center.y+Math.cos(b)*radius,z:center.z+Math.sin(b)*radius},p3={x:right,y:center.y+Math.cos(b)*radius,z:center.z+Math.sin(b)*radius},p4={x:right,y:center.y+Math.cos(a)*radius,z:center.z+Math.sin(a)*radius};this.quad(p1,p2,p3,p4,col);this.triangle({x:left,y:center.y,z:center.z},p2,p1,col);this.triangle({x:right,y:center.y,z:center.z},p4,p3,col);}}
 cone(center,radius,height,sides,col){const top={x:center.x,y:center.y+height,z:center.z};for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2,p1={x:center.x+Math.cos(a)*radius,y:center.y,z:center.z+Math.sin(a)*radius},p2={x:center.x+Math.cos(b)*radius,y:center.y,z:center.z+Math.sin(b)*radius};this.triangle(p1,p2,top,col);this.triangle(p2,p1,center,col);}}
 cylinder(center,radius,height,sides,col){const topY=center.y+height/2,bottomY=center.y-height/2;for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2,p1={x:center.x+Math.cos(a)*radius,y:bottomY,z:center.z+Math.sin(a)*radius},p2={x:center.x+Math.cos(b)*radius,y:bottomY,z:center.z+Math.sin(b)*radius},p3={x:center.x+Math.cos(b)*radius,y:topY,z:center.z+Math.sin(b)*radius},p4={x:center.x+Math.cos(a)*radius,y:topY,z:center.z+Math.sin(a)*radius};this.quad(p1,p2,p3,p4,col);}}
 wedge(min,max,topInset,col){const p=[{x:min.x,y:min.y,z:min.z},{x:max.x,y:min.y,z:min.z},{x:max.x,y:min.y,z:max.z},{x:min.x,y:min.y,z:max.z},{x:min.x+topInset,y:max.y,z:min.z+topInset},{x:max.x-topInset,y:max.y,z:min.z+topInset},{x:max.x-topInset,y:max.y,z:max.z-topInset},{x:min.x+topInset,y:max.y,z:max.z-topInset}];const f=[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7],[3,2,1,0]];for(const q of f)this.quad(p[q[0]],p[q[1]],p[q[2]],p[q[3]],col);}
 get triangleCount(){return this.data.length/27;}
}

export const DEFAULT_MATERIAL = Object.freeze({ specular: 0, shininess: 24, fresnel: 0 });
export const MATERIALS = Object.freeze({
 terrain: Object.freeze({ specular: 0, shininess: 16, fresnel: .04 }),
 road: Object.freeze({ specular: .05, shininess: 18, fresnel: .07 }),
 wetRoad: Object.freeze({ specular: .5, shininess: 70, fresnel: .35 }),
 bodywork: Object.freeze({ specular: .55, shininess: 56, fresnel: .22 }),
 glass: Object.freeze({ specular: .8, shininess: 110, fresnel: .4 }),
 rubber: Object.freeze({ specular: .05, shininess: 12, fresnel: .05 })
});

export class WebGLRenderer {
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});if(!this.gl)throw new Error('WebGL2 is required by Cairn Run Rally.');
  const gl=this.gl;this.worldProgram=program(gl,WORLD_VERTEX,WORLD_FRAGMENT);this.skyProgram=program(gl,SKY_VERTEX,SKY_FRAGMENT);this.particleProgram=program(gl,PARTICLE_VERTEX,PARTICLE_FRAGMENT);this.shadowProgram=program(gl,SHADOW_VERTEX,SHADOW_FRAGMENT);
  const locations=(p,names)=>Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(p,name)]));
  this.worldUniforms=locations(this.worldProgram,['uViewProjection','uModel','uCamera','uSunDirection','uSunColor','uSunLight','uSkyAmbient','uGroundAmbient','uFogColor','uSunStrength','uAmbientStrength','uFogNear','uFogFar','uFogHeight','uExposure','uAlpha','uSpecular','uShininess','uFresnel']);
  this.skyUniforms=locations(this.skyProgram,['uInverseViewProjection','uCamera','uSkyTop','uSkyHorizon','uSkyLower','uSunColor','uSunDirection','uCloudColor','uCloudShade','uSunStrength','uCloudCover','uCloudScale','uTime','uWind','uNight','uSunSize','uHaze','uExposure']);
  this.particleUniforms=locations(this.particleProgram,['uViewProjection','uCamera','uFogNear','uFogFar','uSunColor','uSunStrength','uAmbientStrength','uExposure']);
  this.shadowUniforms=locations(this.shadowProgram,['uViewProjection','uModel','uTint','uStrength']);
  this.environment=deriveRenderEnvironment();
  this.identity=mat4Identity();this.meshes=new Set();this.quality='high';this.drawCalls=0;this.triangles=0;this.frameSamples=[];this.fps=0;this.frameStart=0;this.gpuFrameMs=null;this.gpuExt=gl.getExtension('EXT_disjoint_timer_query_webgl2');this.gpuQueries=[];this.activeGpuQuery=null;this.gpuSampleCounter=0;
  this.time=0;this.wind=.3;this.material=null;
  this.particleCapacity=512;this.particleData=new Float32Array(this.particleCapacity*8);this.particleVao=gl.createVertexArray();this.particleBuffer=gl.createBuffer();gl.bindVertexArray(this.particleVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.particleBuffer);const stride=8*4;gl.bufferData(gl.ARRAY_BUFFER,this.particleData.byteLength,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,1,gl.FLOAT,false,stride,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,1,gl.FLOAT,false,stride,16);gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,3,gl.FLOAT,false,stride,20);gl.bindVertexArray(null);
  this.shadowVao=gl.createVertexArray();this.shadowBuffer=gl.createBuffer();gl.bindVertexArray(this.shadowVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.shadowBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);gl.bindVertexArray(null);
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
 }
 setQuality(q){this.quality=q;}
 /**
  * Shader and context health, for the browser harness: a silently failing
  * program or a lost context otherwise shows up only as a blank screen.
  */
 diagnostics(){
  const gl=this.gl,programs={world:this.worldProgram,sky:this.skyProgram,particle:this.particleProgram,shadow:this.shadowProgram};
  const linked=Object.fromEntries(Object.entries(programs).map(([name,program])=>[name,Boolean(program)&&gl.getProgramParameter(program,gl.LINK_STATUS)]));
  const missingUniforms=[];
  for(const [name,uniforms] of [['world',this.worldUniforms],['sky',this.skyUniforms],['particle',this.particleUniforms],['shadow',this.shadowUniforms]]){
   for(const [key,location] of Object.entries(uniforms))if(location===null)missingUniforms.push(`${name}.${key}`);
  }
  return {
   linked,
   allLinked:Object.values(linked).every(Boolean),
   missingUniforms,
   glError:gl.getError(),
   contextLost:gl.isContextLost(),
   quality:this.quality,
   exposure:this.environment.exposure,
   cloudCover:this.environment.cloudCover
  };
 }
 setEnvironment(environment={}){
  const source=environment&&typeof environment==='object'?environment:{};
  const palette=source.palette&&typeof source.palette==='object'?source.palette:source;
  const weatherSource=source.weather&&typeof source.weather==='object'?source.weather:{};
  const weather={...weatherSource};
  if(source.visibilityM!==undefined)weather.visibilityM=source.visibilityM;
  if(source.fogHeightM!==undefined)weather.fogHeightM=source.fogHeightM;
  this.environment=deriveRenderEnvironment(palette,weather);
  this.wind=Number.isFinite(Number(weather.wind))?Number(weather.wind):this.wind;
  return this.environment;
 }
 createMesh(builder,usage=this.gl.STATIC_DRAW){const gl=this.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer(),data=new Float32Array(builder.data);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,usage);const stride=9*4;for(let i=0;i<3;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,stride,i*12);}gl.bindVertexArray(null);const mesh={vao,buffer,count:data.length/9,triangles:data.length/27};this.meshes.add(mesh);return mesh;}
 deleteMesh(mesh){if(!mesh)return;this.gl.deleteBuffer(mesh.buffer);this.gl.deleteVertexArray(mesh.vao);this.meshes.delete(mesh);}
 resize(){const ratio=this.quality==='high'?Math.min(1.5,window.devicePixelRatio||1):Math.min(1,window.devicePixelRatio||1),w=Math.max(1,Math.floor(this.canvas.clientWidth*ratio)),h=Math.max(1,Math.floor(this.canvas.clientHeight*ratio));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.gl.viewport(0,0,w,h);return{w,h};}
 begin(camera){
  this.frameStart=performance.now();this.drawCalls=0;this.triangles=0;this.material=null;
  const gl=this.gl,{w,h}=this.resize(),e=this.environment;
  this.gpuSampleCounter++;if(this.gpuExt&&!this.activeGpuQuery&&this.gpuQueries.length<3&&this.gpuSampleCounter%30===0){this.activeGpuQuery=gl.createQuery();gl.beginQuery(this.gpuExt.TIME_ELAPSED_EXT,this.activeGpuQuery);}
  this.time=Number.isFinite(camera.clock)?camera.clock:this.time+1/60;
  const projection=mat4Perspective((camera.fov||61)*DEG,w/h,.12,camera.far||e.fogFar||730),view=mat4LookAt(camera.position,camera.target),vp=mat4Multiply(projection,view);
  this.viewProjection=vp;this.camera=camera;
  const inverse=mat4Invert(vp)||this.identity;
  const fogNear=Math.min(e.fogNear,camera.far||e.fogNear),fogFar=Math.min(e.fogFar,camera.far||e.fogFar);
  this.frameFog={near:fogNear,far:fogFar};
  // Clear instead of painting the sky first: the sky is drawn after the opaque
  // world, on the far plane, so it is only shaded where nothing covers it.
  gl.clearColor(e.fogColor[0],e.fogColor[1],e.fogColor[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  this.skyInverse=inverse;this.skyDrawn=false;
  // Hoist every per-frame world uniform out of the per-mesh path.
  gl.useProgram(this.worldProgram);const u=this.worldUniforms;
  gl.uniformMatrix4fv(u.uViewProjection,false,vp);
  gl.uniform3f(u.uCamera,camera.position.x,camera.position.y,camera.position.z);
  const lin=this.linearEnvironment();
  gl.uniform3fv(u.uSunDirection,e.sunDirection);gl.uniform3fv(u.uSunColor,lin.sunColor);gl.uniform3fv(u.uSunLight,lin.sunLight);
  gl.uniform3fv(u.uSkyAmbient,lin.skyAmbient);gl.uniform3fv(u.uGroundAmbient,lin.groundAmbient);gl.uniform3fv(u.uFogColor,lin.fogColor);
  gl.uniform1f(u.uSunStrength,e.sunStrength);gl.uniform1f(u.uAmbientStrength,e.ambientStrength);
  gl.uniform1f(u.uFogNear,fogNear);gl.uniform1f(u.uFogFar,fogFar);gl.uniform1f(u.uFogHeight,e.fogHeightM);gl.uniform1f(u.uExposure,e.exposure);
  this.drawCalls=0;
 }
 drawSky(){
  if(this.skyDrawn||!this.camera)return;
  this.skyDrawn=true;
  const gl=this.gl,e=this.environment,camera=this.camera,s=this.skyUniforms;
  // A world-space ray means the sun, cloud deck and star field stay put while
  // the car turns under them. Depth-tested on the far plane, never written.
  gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.disable(gl.BLEND);
  gl.useProgram(this.skyProgram);
  gl.uniformMatrix4fv(s.uInverseViewProjection,false,this.skyInverse||this.identity);
  gl.uniform3f(s.uCamera,camera.position.x,camera.position.y,camera.position.z);
  gl.uniform3fv(s.uSkyTop,e.skyTop);gl.uniform3fv(s.uSkyHorizon,e.skyHorizon);gl.uniform3fv(s.uSkyLower,e.skyLower);
  gl.uniform3fv(s.uSunColor,e.sunColor);gl.uniform3fv(s.uSunDirection,e.sunDirection);
  gl.uniform3fv(s.uCloudColor,e.cloudColor);gl.uniform3fv(s.uCloudShade,e.cloudShade);
  gl.uniform1f(s.uSunStrength,e.sunStrength);gl.uniform1f(s.uCloudCover,e.cloudCover);gl.uniform1f(s.uCloudScale,e.cloudScale);
  gl.uniform1f(s.uTime,this.time);gl.uniform1f(s.uWind,this.wind);gl.uniform1f(s.uNight,e.nightFactor);
  gl.uniform1f(s.uSunSize,e.sunSize);gl.uniform1f(s.uHaze,e.haze);gl.uniform1f(s.uExposure,e.exposure);
  gl.bindVertexArray(null);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.depthMask(true);gl.enable(gl.BLEND);this.material=null;this.drawCalls++;
 }
 linearEnvironment(){
  const e=this.environment;
  if(this.linearCache?.source!==e){
   this.linearCache={source:e,sunColor:new Float32Array(linearColor(e.sunColor)),sunLight:new Float32Array(linearColor(e.sunLight)),
    skyAmbient:new Float32Array(linearColor(e.skyAmbient)),groundAmbient:new Float32Array(linearColor(e.groundAmbient)),fogColor:new Float32Array(linearColor(e.fogColor))};
  }
  return this.linearCache;
 }
 applyMaterial(material){
  const gl=this.gl,u=this.worldUniforms,next=material||DEFAULT_MATERIAL;
  if(this.material===next)return;
  this.material=next;
  gl.uniform1f(u.uSpecular,Number(next.specular)||0);
  gl.uniform1f(u.uShininess,Math.max(1,Number(next.shininess)||24));
  gl.uniform1f(u.uFresnel,Number(next.fresnel)||0);
 }
 draw(mesh,model=this.identity,alpha=1,material=DEFAULT_MATERIAL){
  if(!mesh)return;
  const gl=this.gl,u=this.worldUniforms;
  gl.useProgram(this.worldProgram);
  this.applyMaterial(material);
  gl.uniformMatrix4fv(u.uModel,false,model);gl.uniform1f(u.uAlpha,alpha);
  gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  this.drawCalls++;this.triangles+=mesh.triangles;
 }
 /** Soft multiplicative contact shadow; model carries position, yaw and radius. */
 drawShadow(model,strength=.55,tint=[.34,.33,.3]){
  const gl=this.gl,u=this.shadowUniforms;
  gl.useProgram(this.shadowProgram);
  gl.uniformMatrix4fv(u.uViewProjection,false,this.viewProjection);gl.uniformMatrix4fv(u.uModel,false,model);
  gl.uniform3fv(u.uTint,tint);gl.uniform1f(u.uStrength,Math.max(0,strength));
  gl.blendFunc(gl.ZERO,gl.SRC_COLOR);gl.depthMask(false);
  gl.bindVertexArray(this.shadowVao);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  gl.depthMask(true);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  this.material=null;this.drawCalls++;
 }
 drawParticles(particles){this.drawSky();if(!particles.length)return;if(particles.length>this.particleCapacity){while(this.particleCapacity<particles.length)this.particleCapacity*=2;this.particleData=new Float32Array(this.particleCapacity*8);this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.particleBuffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,this.particleData.byteLength,this.gl.DYNAMIC_DRAW);}let o=0;for(const p of particles){this.particleData[o++]=p.x;this.particleData[o++]=p.y;this.particleData[o++]=p.z;this.particleData[o++]=p.size;this.particleData[o++]=p.alpha;this.particleData[o++]=p.color[0];this.particleData[o++]=p.color[1];this.particleData[o++]=p.color[2];}
  const gl=this.gl,e=this.environment,u=this.particleUniforms,fog=this.frameFog||{near:e.fogNear,far:e.fogFar};
  gl.useProgram(this.particleProgram);
  gl.uniformMatrix4fv(u.uViewProjection,false,this.viewProjection);
  gl.uniform3f(u.uCamera,this.camera.position.x,this.camera.position.y,this.camera.position.z);
  gl.uniform1f(u.uFogNear,fog.near);gl.uniform1f(u.uFogFar,fog.far);
  gl.uniform3fv(u.uSunColor,this.linearEnvironment().sunColor);gl.uniform1f(u.uSunStrength,e.sunStrength);gl.uniform1f(u.uAmbientStrength,e.ambientStrength);gl.uniform1f(u.uExposure,e.exposure);
  gl.bindVertexArray(this.particleVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.particleBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.particleData.subarray(0,o));
  gl.depthMask(false);gl.drawArrays(gl.POINTS,0,particles.length);gl.depthMask(true);this.drawCalls++;
 }
 end(){this.drawSky();const gl=this.gl;if(this.activeGpuQuery){gl.endQuery(this.gpuExt.TIME_ELAPSED_EXT);this.gpuQueries.push(this.activeGpuQuery);this.activeGpuQuery=null;}while(this.gpuQueries.length){const query=this.gpuQueries[0],ready=gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE),disjoint=gl.getParameter(this.gpuExt.GPU_DISJOINT_EXT);if(!ready)break;this.gpuQueries.shift();if(!disjoint)this.gpuFrameMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);}const ms=performance.now()-this.frameStart;this.frameSamples.push(ms);if(this.frameSamples.length>120)this.frameSamples.shift();const avg=this.frameSamples.reduce((a,b)=>a+b,0)/this.frameSamples.length;this.fps=avg>0?1000/avg:0;return{cpuFrameMs:ms,averageFrameMs:avg,gpuFrameMs:this.gpuFrameMs,fps:this.fps,drawCalls:this.drawCalls,triangles:this.triangles,width:this.canvas.width,height:this.canvas.height};}
}
