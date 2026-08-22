import { DEG, mat4Identity, mat4LookAt, mat4Multiply, mat4Perspective } from './math.js';

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
  vColor=aColor;
  gl_Position=uViewProjection*world;
}`;
const WORLD_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uCamera;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunStrength;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
out vec4 outColor;
void main(){
  float diffuse=max(dot(normalize(vNormal),normalize(uSunDirection)),0.0);
  float halfLambert=0.42+diffuse*0.58;
  float distanceToCamera=distance(vWorld,uCamera);
  float fog=smoothstep(uFogNear,uFogFar,distanceToCamera);
  vec3 lit=vColor*halfLambert*uSunColor*uSunStrength;
  lit+=uSunColor*vec3(0.08,0.055,0.03)*pow(max(0.0,dot(normalize(vNormal),normalize(uSunDirection))),8.0);
  outColor=vec4(mix(lit,uFogColor,fog),uAlpha*(1.0-fog*0.18));
}`;
const SKY_VERTEX = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
 vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
 vUv=p;
 gl_Position=vec4(p*2.0-1.0,0.999,1.0);
}`;
const SKY_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyLower;
uniform vec3 uSunColor;
uniform vec2 uSunPosition;
uniform float uSunStrength;
out vec4 outColor;
void main(){
 vec2 uv=vUv;
 vec3 top=uSkyTop;
 vec3 horizon=uSkyHorizon;
 vec3 lower=uSkyLower;
 float h=smoothstep(0.28,0.82,uv.y);
 vec3 col=mix(horizon,top,h);
 col=mix(lower,col,smoothstep(0.0,0.34,uv.y));
 float sun=exp(-distance(uv,uSunPosition)*18.0);
 col+=uSunColor*sun*0.34*uSunStrength;
 outColor=vec4(col,1.0);
}`;
const PARTICLE_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in float aSize;
layout(location=2) in float aAlpha;
layout(location=3) in vec3 aColor;
uniform mat4 uViewProjection;
out float vAlpha;
out vec3 vColor;
void main(){
 vec4 clip=uViewProjection*vec4(aPosition,1.0);
 gl_Position=clip;
 gl_PointSize=clamp(aSize*430.0/max(1.0,clip.w),1.0,96.0);
 vAlpha=aAlpha;vColor=aColor;
}`;
const PARTICLE_FRAGMENT = `#version 300 es
precision highp float;
in float vAlpha;
in vec3 vColor;
out vec4 outColor;
void main(){
 vec2 p=gl_PointCoord*2.0-1.0;
 float d=dot(p,p);if(d>1.0)discard;
 float a=(1.0-smoothstep(0.15,1.0,d))*vAlpha;
 outColor=vec4(vColor,a);
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
  const fogColor = environmentScale(environmentMix(farGrass, sky, .18 + wetness * .22 + storm * .1), dim * .94);
  const baseDirection = night ? [-.28, .44, -.36] : dusk ? [.12, .64, .38] : [.35, .84, .26];
  const sunDirection = baseDirection.map((value, index) => value + (index === 0 ? wind * .08 : index === 2 ? -wind * .05 : 0));
  const sunColor = (night ? [.48, .58, .82] : dusk ? [1, .64, .4] : snow ? [.86, .91, 1] : [1, .93, .75])
    .map((value, index) => environmentClamp(value * (1 - storm * (index === 2 ? .22 : .12))));
  const sunStrength = environmentClamp(.92 - storm * .24 - rain * .06 - snow * .1 - night * .24, .42, 1);
  const fogNear = environmentClamp(visibilityM * (.25 + (1 - wetness) * .08), 55, 1800);
  const fogFar = environmentClamp(visibilityM, 220, 3000);
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
    sunStrength
  });
}

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

export class WebGLRenderer {
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});if(!this.gl)throw new Error('WebGL2 is required by Cairn Run Rally.');
  const gl=this.gl;this.worldProgram=program(gl,WORLD_VERTEX,WORLD_FRAGMENT);this.skyProgram=program(gl,SKY_VERTEX,SKY_FRAGMENT);this.particleProgram=program(gl,PARTICLE_VERTEX,PARTICLE_FRAGMENT);
  const locations=(p,names)=>Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(p,name)]));
  this.worldUniforms=locations(this.worldProgram,['uViewProjection','uModel','uCamera','uSunDirection','uSunColor','uSunStrength','uFogColor','uFogNear','uFogFar','uAlpha']);this.skyUniforms=locations(this.skyProgram,['uSkyTop','uSkyHorizon','uSkyLower','uSunColor','uSunPosition','uSunStrength']);this.particleUniforms=locations(this.particleProgram,['uViewProjection']);
  this.environment=deriveRenderEnvironment();
  this.identity=mat4Identity();this.meshes=new Set();this.quality='high';this.drawCalls=0;this.triangles=0;this.frameSamples=[];this.fps=0;this.frameStart=0;this.gpuFrameMs=null;this.gpuExt=gl.getExtension('EXT_disjoint_timer_query_webgl2');this.gpuQueries=[];this.activeGpuQuery=null;this.gpuSampleCounter=0;
  this.particleCapacity=512;this.particleData=new Float32Array(this.particleCapacity*8);this.particleVao=gl.createVertexArray();this.particleBuffer=gl.createBuffer();gl.bindVertexArray(this.particleVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.particleBuffer);const stride=8*4;gl.bufferData(gl.ARRAY_BUFFER,this.particleData.byteLength,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,1,gl.FLOAT,false,stride,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,1,gl.FLOAT,false,stride,16);gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,3,gl.FLOAT,false,stride,20);gl.bindVertexArray(null);
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
 }
 setQuality(q){this.quality=q;}
 setEnvironment(environment={}){
  const source=environment&&typeof environment==='object'?environment:{};
  const palette=source.palette&&typeof source.palette==='object'?source.palette:source;
  const weatherSource=source.weather&&typeof source.weather==='object'?source.weather:{};
  const weather=source.visibilityM===undefined?weatherSource:{...weatherSource,visibilityM:source.visibilityM};
  this.environment=deriveRenderEnvironment(palette,weather);
  return this.environment;
 }
 createMesh(builder,usage=this.gl.STATIC_DRAW){const gl=this.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer(),data=new Float32Array(builder.data);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,usage);const stride=9*4;for(let i=0;i<3;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,stride,i*12);}gl.bindVertexArray(null);const mesh={vao,buffer,count:data.length/9,triangles:data.length/27};this.meshes.add(mesh);return mesh;}
 deleteMesh(mesh){if(!mesh)return;this.gl.deleteBuffer(mesh.buffer);this.gl.deleteVertexArray(mesh.vao);this.meshes.delete(mesh);}
 resize(){const ratio=this.quality==='high'?Math.min(1.5,window.devicePixelRatio||1):Math.min(1,window.devicePixelRatio||1),w=Math.max(1,Math.floor(this.canvas.clientWidth*ratio)),h=Math.max(1,Math.floor(this.canvas.clientHeight*ratio));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.gl.viewport(0,0,w,h);return{w,h};}
 begin(camera){this.frameStart=performance.now();this.drawCalls=0;this.triangles=0;const gl=this.gl,{w,h}=this.resize();this.gpuSampleCounter++;if(this.gpuExt&&!this.activeGpuQuery&&this.gpuQueries.length<3&&this.gpuSampleCounter%30===0){this.activeGpuQuery=gl.createQuery();gl.beginQuery(this.gpuExt.TIME_ELAPSED_EXT,this.activeGpuQuery);}const e=this.environment;gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.useProgram(this.skyProgram);gl.uniform3fv(this.skyUniforms.uSkyTop,e.skyTop);gl.uniform3fv(this.skyUniforms.uSkyHorizon,e.skyHorizon);gl.uniform3fv(this.skyUniforms.uSkyLower,e.skyLower);gl.uniform3fv(this.skyUniforms.uSunColor,e.sunColor);gl.uniform2fv(this.skyUniforms.uSunPosition,e.sunPosition);gl.uniform1f(this.skyUniforms.uSunStrength,e.sunStrength);gl.drawArrays(gl.TRIANGLES,0,3);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.clear(gl.DEPTH_BUFFER_BIT);const projection=mat4Perspective((camera.fov||61)*DEG,w/h,.12,camera.far||e.fogFar||730),view=mat4LookAt(camera.position,camera.target),vp=mat4Multiply(projection,view);this.viewProjection=vp;this.camera=camera;this.drawCalls=1;}
 draw(mesh,model=this.identity,alpha=1){if(!mesh)return;const gl=this.gl,p=this.worldProgram,u=this.worldUniforms,e=this.environment;gl.useProgram(p);gl.uniformMatrix4fv(u.uViewProjection,false,this.viewProjection);gl.uniformMatrix4fv(u.uModel,false,model);gl.uniform3f(u.uCamera,this.camera.position.x,this.camera.position.y,this.camera.position.z);gl.uniform3fv(u.uSunDirection,e.sunDirection);gl.uniform3fv(u.uSunColor,e.sunColor);gl.uniform1f(u.uSunStrength,e.sunStrength);gl.uniform3fv(u.uFogColor,e.fogColor);gl.uniform1f(u.uFogNear,Math.min(e.fogNear,this.camera.far||e.fogNear));gl.uniform1f(u.uFogFar,Math.min(e.fogFar,this.camera.far||e.fogFar));gl.uniform1f(u.uAlpha,alpha);gl.bindVertexArray(mesh.vao);gl.drawArrays(gl.TRIANGLES,0,mesh.count);this.drawCalls++;this.triangles+=mesh.triangles;}
 drawParticles(particles){if(!particles.length)return;if(particles.length>this.particleCapacity){while(this.particleCapacity<particles.length)this.particleCapacity*=2;this.particleData=new Float32Array(this.particleCapacity*8);this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.particleBuffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,this.particleData.byteLength,this.gl.DYNAMIC_DRAW);}let o=0;for(const p of particles){this.particleData[o++]=p.x;this.particleData[o++]=p.y;this.particleData[o++]=p.z;this.particleData[o++]=p.size;this.particleData[o++]=p.alpha;this.particleData[o++]=p.color[0];this.particleData[o++]=p.color[1];this.particleData[o++]=p.color[2];}const gl=this.gl,pr=this.particleProgram;gl.useProgram(pr);gl.uniformMatrix4fv(this.particleUniforms.uViewProjection,false,this.viewProjection);gl.bindVertexArray(this.particleVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.particleBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.particleData.subarray(0,o));gl.depthMask(false);gl.drawArrays(gl.POINTS,0,particles.length);gl.depthMask(true);this.drawCalls++;}
 end(){const gl=this.gl;if(this.activeGpuQuery){gl.endQuery(this.gpuExt.TIME_ELAPSED_EXT);this.gpuQueries.push(this.activeGpuQuery);this.activeGpuQuery=null;}while(this.gpuQueries.length){const query=this.gpuQueries[0],ready=gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE),disjoint=gl.getParameter(this.gpuExt.GPU_DISJOINT_EXT);if(!ready)break;this.gpuQueries.shift();if(!disjoint)this.gpuFrameMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);}const ms=performance.now()-this.frameStart;this.frameSamples.push(ms);if(this.frameSamples.length>120)this.frameSamples.shift();const avg=this.frameSamples.reduce((a,b)=>a+b,0)/this.frameSamples.length;this.fps=avg>0?1000/avg:0;return{cpuFrameMs:ms,averageFrameMs:avg,gpuFrameMs:this.gpuFrameMs,fps:this.fps,drawCalls:this.drawCalls,triangles:this.triangles,width:this.canvas.width,height:this.canvas.height};}
}
