/** Exact unequal-height catenary, emitted as transforms for a shared unit segment.
 *
 * Offline tool / importable dependency-free math. Nothing imports it at game boot.
 * Coordinates are metres and +Y up. sag is the vertical distance at horizontal
 * midpoint below the straight endpoint chord, not the lowest point below an end.
 * Source mesh: substation_conductor_segment, base at [0,0,0], top at [0,1,0],
 * radius .015 m. Reuse one THREE.InstancedMesh; do not create a mesh per span.
 */
const LIMIT = 2048;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const vector = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => finite(x) && Math.abs(x) <= 1e6);
const requireThat = (condition, message) => { if (!condition) throw new RangeError(message); };
const dist = (a,b) => Math.hypot(...a.map((x,i) => b[i]-x));

/** Solve y(x)=a*cosh((x-L/2)/a+v)+c, with finite bounded bisection. */
export function solveCatenary({start, end, sag} = {}) {
  requireThat(vector(start) && vector(end), 'start/end must be finite three-component metre vectors within 1e6 m');
  const dx=end[0]-start[0], dz=end[2]-start[2], dy=end[1]-start[1];
  const L=Math.hypot(dx,dz);
  requireThat(L >= 1e-6 && L <= 20_000 && Math.abs(dy) <= 20_000, 'horizontal span must be 1e-6..20000 m; vertical or coincident spans are unsupported');
  requireThat(finite(sag) && sag >= 0 && sag <= 2*L, 'sag must be finite and within 0..2 horizontal spans');
  if (sag===0) {
    return {start:[...start],end:[...end],sag,horizontalLength:L,arcLength:dist(start,end),a:null,u:0,v:0,
      pointAt(t) {
        requireThat(finite(t) && t>=0 && t<=1,'sample parameter must be in [0,1]');
        return start.map((x,i) => x+(end[i]-x)*t);
      }};
  }
  // u=L/(2a); the symmetric hyperbolic identities avoid subtracting coshes.
  const sagFor = (u) => {
    if (u===0) return 0;
    const sinh=Math.sinh(u), k=dy*u/(L*sinh);
    return L/u * Math.hypot(1,k) * Math.sinh(u/2)**2;
  };
  let lo=0,hi=1;
  for (let i=0; i<6 && sagFor(hi)<sag; i++) hi*=2;
  requireThat(sagFor(hi)>=sag,'catenary solver could not bracket requested sag');
  for (let i=0;i<90;i++) {
    const mid=(lo+hi)/2;
    if (sagFor(mid)<sag) lo=mid; else hi=mid;
  }
  const u=(lo+hi)/2,a=L/(2*u),v=Math.asinh(dy*u/(L*Math.sinh(u)));
  const arcLength=L*Math.cosh(v)*(Math.sinh(u)/u);
  requireThat([u,a,v,arcLength].every(finite),'non-finite catenary solution');
  return {start:[...start],end:[...end],sag,horizontalLength:L,arcLength,a,u,v,
    pointAt(t) {
      requireThat(finite(t) && t>=0 && t<=1,'sample parameter must be in [0,1]');
      if (t===0) return [...start];
      if (t===1) return [...end];
      const y=start[1]+L*(Math.sinh(t*u)/u)*Math.sinh(v-u+t*u);
      return [start[0]+dx*t,y,start[2]+dz*t];
    }};
}

function fromY(direction) {
  const [x,y,z]=direction;
  if (y < -1+1e-12) return [1,0,0,0];
  const q=[z,0,-x,1+y],n=Math.hypot(...q);
  return q.map((v) => v/n);
}

/** Return shared-mesh transforms, adaptively bounded by actual segment length. */
export function catenaryInstances(options={}) {
  const {segments=24,maxSegmentLength=2,radius=.015,baseRadius=.015}=options;
  requireThat(Number.isInteger(segments) && segments>=1 && segments<=LIMIT,'segments must be an integer in 1..2048');
  requireThat(finite(maxSegmentLength) && maxSegmentLength>=.05 && maxSegmentLength<=100,'maxSegmentLength must be 0.05..100 m');
  requireThat(finite(radius) && radius>0 && radius<=.2 && finite(baseRadius) && baseRadius>0 && baseRadius<=.2,'conductor radii must be 0..0.2 m');
  const curve=solveCatenary(options), times=Array.from({length:segments+1},(_,i) => i/segments);
  for (let i=0;i<times.length-1;) {
    if (dist(curve.pointAt(times[i]),curve.pointAt(times[i+1]))>maxSegmentLength*(1+1e-12)) {
      requireThat(times.length<=LIMIT,'requested span exceeds bounded 2048 instance budget; increase maxSegmentLength');
      times.splice(i+1,0,(times[i]+times[i+1])/2);
    } else i++;
  }
  const points=times.map((t) => curve.pointAt(t));
  const instances=points.slice(0,-1).map((p,i) => {
    const q=points[i+1],length=dist(p,q),direction=q.map((v,k) => (v-p[k])/length);
    requireThat(finite(length) && length>0,'zero-length conductor instance');
    return {position:p,quaternion:fromY(direction),scale:[radius/baseRadius,length,radius/baseRadius]};
  });
  const {pointAt,...metadata}=curve;
  return {...metadata,asset:'substation_conductor_segment',baseRadius,radius,points,instances};
}

// Browser imports do not resolve any Node-only modules or touch process.
if (typeof process!=='undefined' && process.versions?.node && process.argv[1]) {
  const {resolve}=await import('node:path');
  const {fileURLToPath}=await import('node:url');
  if (resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await import('../tests/nice.mjs');
  const {readFileSync,writeFileSync}=await import('node:fs');
  const [input,output]=process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: node la-ladera/tools/substation2_catenary.mjs spans.json transforms.json');
    process.exitCode=2;
  } else {
    try {
      const source=JSON.parse(readFileSync(input,'utf8'));
      const spans=Array.isArray(source) ? source : source.spans;
      requireThat(Array.isArray(spans) && spans.length<=256,'input must contain at most 256 spans');
      writeFileSync(output,JSON.stringify({version:1,units:'m',spans:spans.map((s) => ({id:s.id,...catenaryInstances({...s,start:s.start??s.from,end:s.end??s.to})}))},null,2)+'\n');
      console.log(`CATENARY OK: ${spans.length} spans; transforms only, no conductor meshes`);
    } catch (e) { console.error(e.message);process.exitCode=1; }
  }
  }
}
