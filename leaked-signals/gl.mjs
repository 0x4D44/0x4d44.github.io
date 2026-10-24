// Minimal WebGL1 point renderer (no dependencies). Two programs: wavefront points and stars.
import { STRIDE } from "./field.mjs";

// ---- tiny mat4 (column-major, float64 until upload) ----
export function perspective(fovy, asp, n, f) {
  const t = 1 / Math.tan(fovy / 2), m = new Float64Array(16);
  m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
  return m;
}
export function lookAt(e, c, u) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
  let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx, xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float64Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy; m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); m[15] = 1;
  return m;
}
export function mul(a, b) {
  const o = new Float64Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; }
  return o;
}
/** Project a world point to canvas CSS px; returns [x,y,w] (w<=0 behind camera). */
export function project(vp, p, W, H) {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * H, w];
}

const VS_PTS = `
attribute vec3 aO; attribute vec3 aD; attribute vec4 aM;
uniform mat4 uVP; uniform float uDT, uSize, uGain, uPhys, uR0, uRmax, uDim;
uniform vec3 uPal[64];
varying vec4 vC;
void main(){
  float r = aM.x + uDT;
  if (r < 0.0 || r > uRmax) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vC = vec4(0.0); return; }
  vec3 p = aO + aD * r;
  gl_Position = uVP * vec4(p, 1.0);
  float kind = aM.w;
  vec3 col = aM.y >= 0.0 ? uPal[int(aM.y + 0.5)] : (aM.y < -1.5 ? mix(vec3(0.25, 0.6, 1.0), vec3(1.0, 0.4, 0.9), clamp(-aM.y - 2.0, 0.0, 1.0)) : vec3(1.0, 0.45, 0.7));
  float fade = mix(1.0, 1.0 / (1.0 + r * r / (uR0 * uR0)), uPhys);
  float sz = uSize * (kind > 2.5 ? 3.2 : kind > 1.5 ? 2.0 : kind > 0.5 ? 1.7 : 1.0);
  float a = aM.z * uGain * fade * (kind > 0.5 ? 1.0 : uDim);
  gl_PointSize = sz;
  vC = vec4(col, a);
}`;
const FS_PTS = `
precision mediump float; varying vec4 vC;
void main(){
  vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vC.rgb * a * vC.a, a * vC.a);
}`;
const VS_STAR = `
attribute vec3 aP; attribute vec2 aS; // size px, state
uniform mat4 uVP; uniform float uScale;
varying float vS; varying float vSz;
void main(){
  gl_Position = uVP * vec4(aP, 1.0);
  vS = aS.y; vSz = aS.x;
  gl_PointSize = aS.x * uScale * (aS.y > 1.5 ? 2.0 : aS.y > 0.5 ? 1.35 : 1.0);
}`;
const FS_STAR = `
precision mediump float; varying float vS; varying float vSz;
void main(){
  vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0;
  float a = smoothstep(1.0, 0.15, d);
  vec3 c = vS > 1.5 ? vec3(1.0, 0.9, 0.35) : vS > 0.5 ? vec3(1.0, 0.72, 0.3) : vec3(0.78, 0.86, 1.0);
  float k = vS > 1.5 ? 1.0 : vS > 0.5 ? 0.75 : min(0.85, 0.25 + vSz * 0.1);
  gl_FragColor = vec4(c * a * k, a * k);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const pp = program(gl, VS_PTS, FS_PTS), sp = program(gl, VS_STAR, FS_STAR);
  const loc = (p, n) => gl.getUniformLocation(p, n), att = (p, n) => gl.getAttribLocation(p, n);
  const U = { vp: loc(pp, "uVP"), dt: loc(pp, "uDT"), size: loc(pp, "uSize"), gain: loc(pp, "uGain"), phys: loc(pp, "uPhys"), r0: loc(pp, "uR0"), rmax: loc(pp, "uRmax"), dim: loc(pp, "uDim"), pal: loc(pp, "uPal[0]") };
  const A = { o: att(pp, "aO"), d: att(pp, "aD"), m: att(pp, "aM") };
  const US = { vp: loc(sp, "uVP"), scale: loc(sp, "uScale") }, AS = { p: att(sp, "aP"), s: att(sp, "aS") };
  const bufMain = gl.createBuffer(), bufHl = gl.createBuffer(), bufStarP = gl.createBuffer(), bufStarS = gl.createBuffer();
  let nMain = 0, nHl = 0, nStars = 0, starState = null;
  const pal = new Float32Array(64 * 3);

  function upload(buf, data) { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); }
  function bindPts(buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const st = STRIDE * 4;
    for (const [a, n, off] of [[A.o, 3, 0], [A.d, 3, 12], [A.m, 4, 24]]) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, n, gl.FLOAT, false, st, off); }
  }
  return {
    gl,
    setPalette(rgb) { pal.fill(0); pal.set(rgb.slice(0, 64 * 3)); },
    setField(f) { nMain = f ? f.n : 0; if (f) upload(bufMain, f.data); },
    setHighlight(f) { nHl = f ? f.n : 0; if (f) upload(bufHl, f.data); },
    setStars(pos, sizes) { nStars = sizes.length / 2; upload(bufStarP, pos); starState = new Float32Array(sizes); upload(bufStarS, starState); },
    setStarState(st) { starState = st; gl.bindBuffer(gl.ARRAY_BUFFER, bufStarS); gl.bufferData(gl.ARRAY_BUFFER, st, gl.DYNAMIC_DRAW); },
    resize(w, h, dpr) { canvas.width = Math.max(2, Math.round(w * dpr)); canvas.height = Math.max(2, Math.round(h * dpr)); },
    draw(s) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      const vp = new Float32Array(s.vp);
      if (s.stars && nStars) {
        gl.useProgram(sp); gl.uniformMatrix4fv(US.vp, false, vp); gl.uniform1f(US.scale, s.dpr);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufStarP); gl.enableVertexAttribArray(AS.p); gl.vertexAttribPointer(AS.p, 3, gl.FLOAT, false, 12, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufStarS); gl.enableVertexAttribArray(AS.s); gl.vertexAttribPointer(AS.s, 2, gl.FLOAT, false, 8, 0);
        gl.drawArrays(gl.POINTS, 0, nStars);
      }
      gl.useProgram(pp);
      gl.uniformMatrix4fv(U.vp, false, vp); gl.uniform1f(U.dt, s.dT); gl.uniform1f(U.size, s.size * s.dpr);
      gl.uniform1f(U.gain, s.gain); gl.uniform1f(U.phys, s.phys); gl.uniform1f(U.r0, s.r0 || 10); gl.uniform1f(U.rmax, s.rmax); gl.uniform1f(U.dim, s.dim ?? 1);
      gl.uniform3fv(U.pal, pal);
      if (nMain) { bindPts(bufMain); gl.drawArrays(gl.POINTS, 0, nMain); }
      if (nHl && s.hlDT != null) { bindPts(bufHl); gl.uniform1f(U.dt, s.hlDT); gl.uniform1f(U.gain, 1.1); gl.uniform1f(U.dim, 1); gl.drawArrays(gl.POINTS, 0, nHl); }
    },
  };
}
