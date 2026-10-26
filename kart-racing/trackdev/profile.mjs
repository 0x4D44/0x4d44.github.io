import { TRACK_DEFS, splineClosed } from "../trackdefs.js";
const id = process.argv[2]; const def = TRACK_DEFS.find(d => d.id.startsWith(id));
const d = splineClosed(def.points, 40); let L=0; const cum=[0];
for (let i=1;i<=d.length;i++){const a=d[i-1],b=d[i%d.length];L+=Math.hypot(b.x-a.x,b.z-a.z);cum.push(L);}
const N=Math.round(L/2),ds=L/N,P=[];let j=0;
for(let i=0;i<N;i++){const s=i*ds;while(cum[j+1]<s)j++;const f=(s-cum[j])/(cum[j+1]-cum[j]);const a=d[j],b=d[(j+1)%d.length];P.push({x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f});}
const th=P.map((p,i)=>{const q=P[(i+1)%N];return Math.atan2(q.x-p.x,q.z-p.z);});
let out=[];for(let i=0;i<N;i+=10){let dt=th[(i+5)%N]-th[(i-5+N)%N];while(dt>Math.PI)dt-=2*Math.PI;while(dt<-Math.PI)dt+=2*Math.PI;const k=-dt/(10*ds);out.push(`s${(i*ds).toFixed(0)} (${P[i].x.toFixed(0)},${P[i].z.toFixed(0)}) R=${Math.abs(k)<1e-4?"inf":((k>0?"R":"L")+(1/Math.abs(k)).toFixed(0))}`);}
console.log("L="+L.toFixed(0)+"\n"+out.join("\n"));
