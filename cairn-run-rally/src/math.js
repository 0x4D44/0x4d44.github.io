export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const expSmoothing = (rate, dt) => 1 - Math.exp(-rate * dt);
export function smoothstep(a, b, x) { const t = clamp((x-a)/Math.max(1e-9,b-a),0,1); return t*t*(3-2*t); }
export function wrapAngle(a) { while(a>Math.PI)a-=TAU; while(a<-Math.PI)a+=TAU; return a; }
export const angleLerp = (a,b,t) => a + wrapAngle(b-a)*t;
export function hash01(seed) { let x=Math.imul(seed^0x9e3779b9,0x85ebca6b); x^=x>>>13; x=Math.imul(x,0xc2b2ae35); x^=x>>>16; return (x>>>0)/4294967296; }
export function mat4Identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
export function mat4Multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++){const b0=b[c*4],b1=b[c*4+1],b2=b[c*4+2],b3=b[c*4+3];o[c*4]=a[0]*b0+a[4]*b1+a[8]*b2+a[12]*b3;o[c*4+1]=a[1]*b0+a[5]*b1+a[9]*b2+a[13]*b3;o[c*4+2]=a[2]*b0+a[6]*b1+a[10]*b2+a[14]*b3;o[c*4+3]=a[3]*b0+a[7]*b1+a[11]*b2+a[15]*b3;}return o;}
export function mat4Perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),ri=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(near+far)*ri,-1,0,0,near*far*ri*2,0]);}
export function mat4LookAt(e,t,u={x:0,y:1,z:0}){let zx=e.x-t.x,zy=e.y-t.y,zz=e.z-t.z,l=Math.hypot(zx,zy,zz)||1;zx/=l;zy/=l;zz/=l;let xx=u.y*zz-u.z*zy,xy=u.z*zx-u.x*zz,xz=u.x*zy-u.y*zx;l=Math.hypot(xx,xy,xz)||1;xx/=l;xy/=l;xz/=l;const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;return new Float32Array([xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-(xx*e.x+xy*e.y+xz*e.z),-(yx*e.x+yy*e.y+yz*e.z),-(zx*e.x+zy*e.y+zz*e.z),1]);}
export function mat4Translation(x,y,z){const o=mat4Identity();o[12]=x;o[13]=y;o[14]=z;return o;}
export const mat4Scale=(x,y,z)=>new Float32Array([x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1]);
export function mat4RotationX(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);}
export function mat4RotationY(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);}
export function mat4RotationZ(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);}
export function mat4Compose(p,yaw=0,pitch=0,roll=0,s={x:1,y:1,z:1}){return mat4Multiply(mat4Translation(p.x,p.y,p.z),mat4Multiply(mat4RotationY(yaw),mat4Multiply(mat4RotationX(pitch),mat4Multiply(mat4RotationZ(roll),mat4Scale(s.x,s.y,s.z)))));}
export function formatTime(ms){if(!Number.isFinite(ms))return '—';const n=Math.max(0,Math.round(ms)),m=Math.floor(n/60000),s=Math.floor((n%60000)/1000),x=n%1000;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(x).padStart(3,'0')}`;}
export function mat4Invert(m){
 const a00=m[0],a01=m[1],a02=m[2],a03=m[3],a10=m[4],a11=m[5],a12=m[6],a13=m[7],a20=m[8],a21=m[9],a22=m[10],a23=m[11],a30=m[12],a31=m[13],a32=m[14],a33=m[15];
 const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12;
 const b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
 const det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
 if(!det||!Number.isFinite(det))return null;
 const d=1/det;
 return new Float32Array([
  (a11*b11-a12*b10+a13*b09)*d,(a02*b10-a01*b11-a03*b09)*d,(a31*b05-a32*b04+a33*b03)*d,(a22*b04-a21*b05-a23*b03)*d,
  (a12*b08-a10*b11-a13*b07)*d,(a00*b11-a02*b08+a03*b07)*d,(a32*b02-a30*b05-a33*b01)*d,(a20*b05-a22*b02+a23*b01)*d,
  (a10*b10-a11*b08+a13*b06)*d,(a01*b08-a00*b10-a03*b06)*d,(a30*b04-a31*b02+a33*b00)*d,(a21*b02-a20*b04-a23*b00)*d,
  (a11*b07-a10*b09-a12*b06)*d,(a00*b09-a01*b07+a02*b06)*d,(a31*b01-a30*b03-a32*b00)*d,(a20*b03-a21*b01+a22*b00)*d
 ]);
}
export function mat4TransformPoint(m,x,y,z,w=1){
 const ox=m[0]*x+m[4]*y+m[8]*z+m[12]*w,oy=m[1]*x+m[5]*y+m[9]*z+m[13]*w,oz=m[2]*x+m[6]*y+m[10]*z+m[14]*w,ow=m[3]*x+m[7]*y+m[11]*z+m[15]*w;
 return {x:ox,y:oy,z:oz,w:ow};
}
