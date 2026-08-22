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
