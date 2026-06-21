const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./EffectComposer-DW6WA_9W.js","./CopyShader-BzTUYzf6.js","./Pass-W_CZj4M_.js","./RenderPass-8fHSC201.js","./UnrealBloomPass-CbUMFYuv.js","./OutputPass-BLD0oipU.js"])))=>i.map(i=>d[i]);
(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const a of r.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&n(a)}).observe(document,{childList:!0,subtree:!0});function t(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(s){if(s.ep)return;s.ep=!0;const r=t(s);fetch(s.href,r)}})();const sc=9.80665;function Pu(i){return i.mass*i.inertiaFactor}function Wh(i,e,t){const n=Math.max(Math.abs(e),.001),s=i.powerMax/n,r=Math.min(i.tractiveEffortMax,s),a=t*i.adhesiveFraction*i.mass*sc;return Math.max(0,Math.min(r,a))}function Xh(i,e){const t=Math.abs(e);return Math.max(0,i.davisA+i.davisB*t+i.davisC*t*t)}function Yh(i,e,t,n=!1){const s=n?i.brakeEmergencyDecel:i.brakeServiceDecel,r=Dr(e)*s*Pu(i),a=t*i.mass*sc;return Math.max(0,Math.min(r,a))}function qh(i,e){const t=Pu(i),n=e.notch*Wh(i,e.v,e.mu)*e.dir,s=-i.mass*sc*e.grade,r=Yh(i,e.brakeActual,e.mu,e.emergency),a=Xh(i,e.v);if(Math.abs(e.v)>.001){const c=Math.sign(e.v)*(a+r);return(n+s-c)/t}const l=n+s;return Math.abs(l)<=r?0:(l-Math.sign(l)*r)/t}function $h(i,e,t,n){if(t<=0)return e;const s=1-Math.exp(-n/t);return i+(e-i)*s}function Dr(i){return i<0?0:i>1?1:i}function Yi(i,e,t){return i<e?e:i>t?t:i}const Lu=180,Kh=50,zt=.44704,As={length:14e3,stations:[{name:"Kingsgate",chainage:0,platformHalf:120},{name:"Ashcombe",chainage:2e3,platformHalf:90},{name:"Wealdham",chainage:5800,platformHalf:90},{name:"Brinemouth",chainage:9800,platformHalf:90},{name:"Seahaven",chainage:14e3,platformHalf:110}],grades:[{from:0,to:1800,value:0},{from:1800,to:3e3,value:.01},{from:3e3,to:4200,value:0},{from:4200,to:7500,value:-.004},{from:7500,to:8600,value:0},{from:8600,to:11e3,value:-.012},{from:11e3,to:12400,value:0},{from:12400,to:14e3,value:-.006}],speedLimits:[{from:0,to:700,value:25*zt},{from:700,to:1300,value:40*zt},{from:1300,to:1800,value:55*zt},{from:1800,to:2200,value:25*zt},{from:2200,to:2600,value:45*zt},{from:2600,to:4e3,value:50*zt},{from:4e3,to:5500,value:60*zt},{from:5500,to:5900,value:30*zt},{from:5900,to:9200,value:60*zt},{from:9200,to:9700,value:55*zt},{from:9700,to:9900,value:30*zt},{from:9900,to:11e3,value:45*zt},{from:11e3,to:13600,value:55*zt},{from:13600,to:14e3,value:20*zt}],curvatures:[{from:0,to:700,value:0},{from:700,to:1300,value:1/300},{from:1300,to:2600,value:0},{from:2600,to:3300,value:1/500},{from:3300,to:4e3,value:-1/500},{from:4e3,to:4800,value:0},{from:4800,to:5500,value:1/700},{from:5500,to:9200,value:0},{from:9200,to:9700,value:1/600},{from:9700,to:10300,value:0},{from:10300,to:10650,value:-1/350},{from:10650,to:11e3,value:1/350},{from:11e3,to:14e3,value:0}],signals:[{chainage:2120,protects:"Ashcombe"},{chainage:5920,protects:"Wealdham"},{chainage:9920,protects:"Brinemouth"}],viaducts:[{center:8050,halfLen:320,valleyDepth:45}],tunnels:[{center:11700,halfLen:380,hillHeight:60}],terrainSeed:1};function Zh(i){let e=0;for(const t of i.curvatures){const n=Math.abs(t.value);n>e&&(e=n)}return e===0?1/0:1/e}function rc(i,e,t){for(const r of i)if(e>=r.from&&e<r.to)return r.value;const n=i[0],s=i[i.length-1];return n&&e<n.from?n.value:s&&e>=s.to?s.value:t}function Ir(i,e){return rc(i.grades,e,0)}function Yr(i,e){return rc(i.speedLimits,e,i.speedLimits[0]?.value??0)}function Ur(i,e){return rc(i.curvatures,e,0)}function ui(i,e,t){const n=i.signals[e];if(!n)return"GREEN";if(!t.has(n.protects))return"RED";if(!i.signals[e+1])return"GREEN";const r=ui(i,e+1,t);return r==="RED"?"YELLOW":r==="YELLOW"?"DOUBLE_YELLOW":"GREEN"}function ac(i,e,t){if(t===-1)return null;for(let n=0;n<i.signals.length;n++){const s=i.signals[n];if(s&&s.chainage>e)return{i:n,sig:s}}return null}function la(i,e,t){if(t<=e)return[];const n=[];for(let s=0;s<i.length;s++){const r=i[s];r!==void 0&&r>e&&r<=t&&n.push(s)}return n}const jh={mass:16e4,inertiaFactor:1.08,powerMax:1e6,tractiveEffortMax:12e4,speedMax:44.7,davisA:3e3,davisB:120,davisC:7,adhesiveFraction:.5,brakeServiceDecel:.9,brakeEmergencyDecel:1.3},Wc={buildTau:1.5,releaseTau:2},Du=.05,Jh=1/240;function Qh(i,e,t,n,s,r=!0){let{chainage:a,speed:o,brakeActual:l,time:c}=t,h=Math.min(Math.max(s,0),Du);const d=Dr(n.notch),u=Dr(n.brake);for(;h>1e-9;){const p=Math.min(Jh,h);h-=p;const g=u>l?Wc.buildTau:Wc.releaseTau;l=$h(l,u,g,p);const v=Ir(e,a),m=qh(i,{v:o,notch:d,brakeActual:l,dir:n.dir,grade:v,mu:n.mu,emergency:n.emergency}),f=o;o+=m*p,f!==0&&Math.sign(o)!==Math.sign(f)&&d===0&&(o=0),a+=o*p,a<=0&&o<0?(a=0,o=0):r&&a>=e.length&&o>0&&(a=e.length,o=0),c+=p}return{chainage:a,speed:o,brakeActual:l,time:c}}function ed(i,e){return Yi(Yr(i,e.chainage),0,1/0)}const fi=4,oc=3,Iu=oc,oi=oc+1,Uu=.3,Nu=60,td=7,Xc=2.236936;function nd(i){return Yi(i,0,fi)/fi}function id(i){return Dr(i/oc)}function sd(i){return i>=oi}function rd(i){return i>0}function Bs(i){return i.penaltyReasons.size>0}function Fu(i){return Math.abs(i.speed)<=Uu}function cc(i,e){return Math.max(id(i.brakeStep),Bs(e)?1:0)}function ad(){return{powerNotch:0,brakeStep:Iu,reverser:"OFF",lastDir:1,dra:!1}}function od(){return{vigilanceTimer:Nu,dsdWarning:!1,penaltyReasons:new Set}}function cd(i){const t=(i.reverserFwd?1:0)+(i.reverserOff?1:0)+(i.reverserRev?1:0)===1?i.reverserFwd?"FWD":i.reverserOff?"OFF":"REV":null,n=i.emergency,s=n?!1:i.brakeUp&&!i.brakeDown,r=n?!1:i.brakeDown&&!i.brakeUp,a=i.powerUp&&!i.powerDown,o=i.powerDown&&!i.powerUp;return{powerUp:a,powerDown:o,brakeUp:s,brakeDown:r,emergency:n,reverser:t}}function ld(i,e,t,n){const s=cd(e),r=Fu(t);let{powerNotch:a,brakeStep:o,reverser:l,lastDir:c,dra:h}=i;return s.reverser!==null&&a===0&&r&&(l=s.reverser,s.reverser==="FWD"?c=1:s.reverser==="REV"&&(c=-1)),s.powerUp&&(a=Yi(a+1,0,fi)),s.powerDown&&(a=Yi(a-1,0,fi)),Bs(n)&&(a=0),s.emergency?o=oi:s.brakeUp?o=Yi(o+1,0,oi):s.brakeDown&&(o===oi&&!r||(o=Yi(o-1,0,oi))),e.toggleDra&&r&&(h=!h),{powerNotch:a,brakeStep:o,reverser:l,lastDir:c,dra:h}}function ud(i,e,t){const n=i.lastDir,s=Bs(e),a=rd(i.brakeStep)||i.reverser==="OFF"||i.dra||s?0:nd(i.powerNotch),o=sd(i.brakeStep),l=cc(i,e);return{notch:a,brake:l,dir:n,emergency:o,mu:t}}function hd(i,e,t,n,s){let r=i.vigilanceTimer,a=i.dsdWarning;const o=new Set;i.penaltyReasons.has("DSD")&&o.add("DSD");const l=Fu(t);e.vigilancePing?(r=Nu,a=!1):l||(r-=n,a=r<=td,r<=0&&o.add("DSD"));for(const c of s.reasons)o.add(c);return e.acknowledge&&l&&o.delete("DSD"),{vigilanceTimer:r,dsdWarning:a,penaltyReasons:o}}const dd=0;function fd(i){return i<=dd?"RELEASE":i>=oi?"EMERGENCY":i>=Iu?"FULL SERVICE":`STEP ${i}`}function pd(i,e,t,n,s,r){const a=Bs(t);let o="— (end of line)",l=1/0;for(const d of n.stations){const u=(d.chainage-i.chainage)*e.lastDir;u>0&&u<l&&(l=u,o=d.name)}const c=ac(n,i.chainage,e.lastDir),h=c?ui(n,c.i,s):"GREEN";return{speedMph:Math.abs(i.speed)*Xc,limitMph:ed(n,i)*Xc,reverser:e.reverser,powerNotch:e.powerNotch,powerMax:fi,brakeLabel:fd(e.brakeStep),brakeDemandPct:cc(e,t)*100,brakeActualPct:i.brakeActual*100,dra:e.dra,dsdWarning:t.dsdWarning,penalty:a,nextStop:o,chainage:i.chainage,aspect:h,sunflower:r.sunflower}}function md(i){return i.penalty?"PENALTY — STOP, THEN PRESS Q":i.dsdWarning?"VIGILANCE — PRESS Q":null}const Yc=2,gd=3,_d=13.4;function xd(){return{phase:"CLEAR",warnTimer:0,sunflower:"BLACK",brakeReason:null,served:new Set,spad:!1}}function vd(i,e,t,n,s,r,a){let{phase:o,warnTimer:l,sunflower:c,brakeReason:h,served:d,spad:u}=i;const p=Math.abs(e.speed)<=Uu,g=e.chainage+r*Yc,v=s+r*Yc,m=g>v;if(p){for(const w of t.stations)if(!d.has(w.name)&&Math.abs(g-w.chainage)<=w.platformHalf){const _=new Set(d);_.add(w.name),d=_,c="BLACK",o==="WARNING"&&(o="CLEAR",l=0)}}const f=t.signals.map(w=>w.chainage),x=t.signals.map(w=>w.chainage-Lu),y=t.signals.map(w=>w.chainage-Kh);if(m)for(const w of la(x,v,g))ui(t,w,d)==="GREEN"?(c="BLACK",o==="WARNING"&&(o="CLEAR")):h===null&&(o="WARNING",l=gd,c="CAUTION");if(o==="WARNING"&&h===null&&(n.acknowledge?o="CLEAR":(l-=a,l<=0&&(h="AWS",o="CLEAR"))),m){for(const w of la(f,v,g))ui(t,w,d)==="RED"&&(h="TPWS",u=!0);if(Math.abs(e.speed)>_d)for(const w of la(y,v,g))ui(t,w,d)==="RED"&&(h="TPWS")}return h!==null&&n.acknowledge&&p&&(h=null),{next:{phase:o,warnTimer:l,sunflower:c,brakeReason:h,served:d,spad:u},reasons:h?[h]:[],hud:{sunflower:c,spad:u}}}const io={time:"day",weather:"rain"},Vs=[{time:"day",weather:"rain"},{time:"dusk",weather:"rain"},{time:"night",weather:"rain"},{time:"day",weather:"clear"}],Md=.15,Sd={clear:.3,rain:.25,storm:.2},Ed={day:1,dusk:.9,night:.8},yd={clear:0,rain:.6,storm:1},bd={clear:.1,rain:.8,storm:1},Td={day:{hemiSky:14674421,hemiGround:9409648,sun:16774886,ambI:1.8,sunI:2.1,ground:6187588},dusk:{hemiSky:15904889,hemiGround:4863810,sun:16751186,ambI:1,sunI:1.35,ground:4208942},night:{hemiSky:1713718,hemiGround:197642,sun:9085128,ambI:.45,sunI:.6,ground:922639}},Ad=(i,e,t)=>i<e?e:i>t?t:i,wd={day:1,dusk:.85,night:.65},Rd={day:{x:-.3,y:.92,z:.25},dusk:{x:-.8,y:.25,z:.1},night:{x:.2,y:.55,z:-.4}},Cd={day:16774368,dusk:16749634,night:8229572},Pd={day:.2,dusk:.5,night:1},Ld={clear:.6,storm:.85,rain:1};function Dd(i){const e=Math.sqrt(i.x*i.x+i.y*i.y+i.z*i.z);return{x:i.x/e,y:i.y/e,z:i.z/e}}function Id(i){const e=Ad(Sd[i.weather]*Ed[i.time],Md,1),t=yd[i.weather],n=bd[i.weather],s=i.weather!=="clear",r=t,a=Td[i.time],o=1-.3*r,l=a.ambI*o,c=a.sunI*o,h=Ud(i.time,r),d=i.time==="day"?1:i.time==="dusk"?.6:0,u=14+12*d,p=90+230*d-50*r,g=wd[i.time],v=Dd(Rd[i.time]),m=Cd[i.time],f=Pd[i.time]*Ld[i.weather];return{mu:e,skyColor:h,fogNear:u,fogFar:p,ambientIntensity:l,moonIntensity:c,hemiSky:a.hemiSky,hemiGround:a.hemiGround,sunColor:a.sun,groundColor:a.ground,rainIntensity:t,railWetness:n,wiperOn:s,exposure:g,sunDir:v,sunColorPbr:m,bloomStrength:f}}function Ud(i,e){const n={night:{r:10,g:18,b:40},dusk:{r:58,g:48,b:64},day:{r:154,g:168,b:192}}[i],s=32,r=.4*e,a=Math.round(n.r*(1-r)+s*r),o=Math.round(n.g*(1-r)+s*r),l=Math.round(n.b*(1-r)+s*r);return a<<16|o<<8|l}function Nd(i){const e=Vs.findIndex(n=>n.time===i.time&&n.weather===i.weather);return e<0?Vs[0]??io:Vs[(e+1)%Vs.length]??io}const Ou={psi0:0,x0:0,z0:0,h0:0};function Fd(i,e){const t=i.indexOf(e);return t>=0&&t+1<i.length?i[t+1]:null}const Od=.08,Bd=.105,zd=1e-12;function Gd(i,e){return i>e?e:i<-e?-e:i}function zs(i,e){if(e===0)return 0;if(e<0)return Ir(i,0)*e;let t=0,n=0;for(const s of i.grades){const r=Math.max(s.from,0),a=Math.min(s.to,e);a>r&&(t+=s.value*(a-r),n=a)}return e>n&&(t+=Ir(i,e)*(e-n)),t}function qr(i,e){let t=0,n=0,s=0;if(e===0)return{x:t,z:n,heading:s};const r=(o,l)=>{if(l!==0)if(Math.abs(o)<zd)t+=l*Math.sin(s),n+=l*Math.cos(s);else{const c=o*l;t+=(Math.cos(s)-Math.cos(s+c))/o,n+=(Math.sin(s+c)-Math.sin(s))/o,s+=c}};if(e<0)return r(Ur(i,0),e),{x:t,z:n,heading:s};let a=0;for(const o of i.curvatures){const l=Math.max(o.from,0),c=Math.min(o.to,e);c>l&&(r(o.value,c-l),a=c)}return e>a&&r(Ur(i,e),e-a),{x:t,z:n,heading:s}}function jt(i,e){return qr(i,e).heading}function Hd(i,e){const t=Ur(i,e),n=Yr(i,e),s=Od*Math.abs(t)*n*n,r=Math.sign(t)*s;return Gd(r,Bd)}function kd(i,e){const t=qr(i,e),n=zs(i,e),s={x:Math.sin(t.heading),y:0,z:Math.cos(t.heading)},r={x:0,y:1,z:0};return{x:t.x,y:n,z:t.z,tangent:s,up:r,heading:t.heading,cant:Hd(i,e)}}function dt(i,e,t){const n=qr(i,e),s=Math.cos(n.heading),r=-Math.sin(n.heading);return{x:n.x+t*s,y:zs(i,e),z:n.z+t*r,heading:n.heading}}const Vd=.08,qc=.105,$c=250,Wd=4;function Nr(i,e){const t=qr(i.route,e),{psi0:n,x0:s,z0:r}=i.frame,a=Math.cos(n),o=Math.sin(n);return{x:s+a*t.x+o*t.z,z:r-o*t.x+a*t.z,heading:n+t.heading}}function Bu(i,e){return i.frame.h0+zs(i.route,e)}function br(i,e,t){const n=Nr(i,e),s=Math.cos(n.heading),r=-Math.sin(n.heading);return{x:n.x+t*s,y:Bu(i,e),z:n.z+t*r,heading:n.heading}}function Gn(i){const e=Nr(i,i.route.length);return{psi0:e.heading,x0:e.x,z0:e.z,h0:Bu(i,i.route.length)}}function Xd(i,e,t){return Math.abs(i.psi0-e.psi0)<=t&&Math.abs(i.x0-e.x0)<=t&&Math.abs(i.z0-e.z0)<=t&&Math.abs(i.h0-e.h0)<=t}function Yd(i,e,t){let n=Yr(i,e);for(const s of i.speedLimits)s.to>e&&s.from<t&&(n=Math.max(n,s.value));return n}function qd(i,e,t){const n=[...i.viaducts??[],...i.tunnels??[]];for(const s of n){const r=s.center-s.halfLen,a=s.center+s.halfLen;for(const o of i.curvatures)if(o.to>r&&o.from<a&&o.value!==0){t.push({kind:"band-curved",edgeId:e,detail:`band [${r},${a}] overlaps curved segment [${o.from},${o.to}] κ=${o.value}`});break}}}function $d(i,e,t){const n=Zh(i.route);n<$c&&t.push({kind:"radius",edgeId:i.id,detail:`minCurveRadius ${n} < ${$c}`}),qd(i.route,i.id,t);for(const s of i.route.curvatures){if(s.value===0)continue;const r=Yd(i.route,s.from,s.to),a=Vd*Math.abs(s.value)*r*r;a>qc+1e-9&&t.push({kind:"cant",edgeId:i.id,detail:`cant ${a.toFixed(4)} > ${qc} on κ=${s.value} at v=${r.toFixed(2)}`})}n!==1/0&&e>.5*n+1e-9&&t.push({kind:"ribbon",edgeId:i.id,detail:`ribbonHalfWidth ${e} > 0.5·minCurveRadius ${n}`})}function Kd(i,e,t,n,s){const r=[],a=n*Du*Wd;for(const o of Object.keys(i.edges))t.has(o)&&r.push({kind:"namespace",edgeId:o,detail:`edge id "${o}" aliases a station name`});for(const o of Object.keys(i.edges)){const l=i.edges[o];l.route.length<=a&&r.push({kind:"short-edge",edgeId:o,detail:`length ${l.route.length} ≤ maxSpeed·MAX_DT·SAFETY ${a}`}),$d(l,s,r)}for(const o of e){const l=new Set;for(let c=0;c<o.length;c++){const h=o[c];l.has(h)&&r.push({kind:"repeat-edge",edgeId:h,detail:`path repeats edge "${h}"`}),l.add(h);const d=i.edges[h];if(!d){r.push({kind:"unknown-edge",edgeId:h,detail:`path references missing edge "${h}"`});continue}if(c>0){const u=o[c-1],p=i.edges[u];p&&!Xd(d.frame,Gn(p),1e-6)&&r.push({kind:"discontinuity",pair:[u,h],detail:`entry frame of "${h}" ≠ exit frame of "${u}"`})}}}return r}function ua(i,e,t){const n=[];for(const s of i){const r=Math.max(s.from,e),a=Math.min(s.to,t);a>r&&n.push({from:r-e,to:a-e,value:s.value})}return n}function ha(i,e,t){if(!(e>=0&&e<t&&t<=i.length))throw new Error(`sliceRoute: bad range [${e},${t}] of length ${i.length}`);const n=[];e>0&&n.push(e),t<i.length&&n.push(t);for(const d of n){if(Ur(i,d)!==0)throw new Error(`sliceRoute: cut at ${d} is not on a κ=0 straight`);for(const u of i.stations)if(Math.abs(u.chainage-d)<u.platformHalf)throw new Error(`sliceRoute: cut at ${d} straddles platform "${u.name}" (${u.chainage}±${u.platformHalf})`);for(const u of i.signals)if(d>u.chainage-Lu&&d<u.chainage)throw new Error(`sliceRoute: cut at ${d} straddles the approach of signal @${u.chainage}`);for(const u of[...i.viaducts??[],...i.tunnels??[]]){const p=u.center-u.halfLen,g=u.center+u.halfLen;if(d>p&&d<g)throw new Error(`sliceRoute: cut at ${d} truncates a band [${p},${g}]`)}}const s=i.stations.filter(d=>d.chainage>=e&&d.chainage<t).map(d=>({...d,chainage:d.chainage-e})),r=new Set(s.map(d=>d.name)),a=i.signals.filter(d=>d.chainage>=e&&d.chainage<t).map(d=>({...d,chainage:d.chainage-e}));for(const d of a)if(!r.has(d.protects))throw new Error(`sliceRoute: signal protects "${d.protects}" not in the slice (orphaned cascade)`);const o=d=>d.center-d.halfLen>=e&&d.center+d.halfLen<=t,l={length:t-e,stations:s,grades:ua(i.grades,e,t),speedLimits:ua(i.speedLimits,e,t),curvatures:ua(i.curvatures,e,t),signals:a},c=(i.viaducts??[]).filter(o).map(d=>({...d,center:d.center-e})),h=(i.tunnels??[]).filter(o).map(d=>({...d,center:d.center-e}));return c.length&&(l.viaducts=c),h.length&&(l.tunnels=h),i.terrainSeed!==void 0&&(l.terrainSeed=i.terrainSeed),l}const da=.5,Zd=50;function jd(i,e,t,n,s,r,a){const o=i.edges[s.edgeId],l=Fd(e,s.edgeId),c=l===null,h=Qh(t,o.route,n,r,a,c);if(!c&&h.chainage>=o.route.length&&h.speed>0){const d=h.chainage-o.route.length;return{state:{...h,chainage:d},pos:{edgeId:l,s:d,d:s.d}}}return{state:h,pos:{edgeId:s.edgeId,s:h.chainage,d:s.d}}}function Jd(i){return new Set(i.map(e=>e.pos.edgeId))}function Qd(i,e,t){const n=new Set(i);for(const s of e)t.has(s)||n.add(s);return n}function ef(i,e,t){if(i!=="RED")return 1/0;const n=Math.max(0,e-Zd);return Math.sqrt(2*t.brakeServiceDecel*n)}function tf(i,e,t,n,s,r){const a=Yr(i.route,e.chainage),o=ef(t,n,s),l=Math.min(a,o,s.speedMax),c=Math.abs(e.speed);return l<=da?{notch:0,brake:1,dir:1,mu:r,emergency:!1}:{notch:c<l-da?1:0,brake:c>l+da?1:0,dir:1,mu:r,emergency:!1}}function nf(i,e){const t=i.edges[e.pos.edgeId],n=ac(t.route,e.state.chainage,1);return n?n.sig.chainage-e.state.chainage:1/0}function sf(i,e,t,n){const s=i.edges[e.pos.edgeId],r=ac(s.route,e.state.chainage,1);return r?ui(s.route,r.i,Qd(e.served,t,n)):"GREEN"}function rf(i,e,t,n,s,r){const a=Jd(e);return e.map(o=>{const l=new Set([...a].filter(d=>d!==o.pos.edgeId)),c=o.kind==="player"?r:tf(i.edges[o.pos.edgeId],o.state,sf(i,o,t,l),nf(i,o),o.spec,s),h=jd(i,o.path,o.spec,o.state,o.pos,c,n);return{...o,state:h.state,pos:h.pos}})}const zn=.44704,Xt=(i,e,t)=>({id:i,route:e,frame:t});function Wi(i,e,t={}){const n=t.grade??0;return{length:i,stations:[],grades:[{from:0,to:i,value:n}],speedLimits:[{from:0,to:i,value:e}],curvatures:[{from:0,to:i,value:0}],signals:t.signals??[]}}function zu(i,e,t,n,s,r){const a=e/i,o=t-4*Math.sin(e)/i;if(o<=0)throw new Error(`makeLoopRoute: Ls=${o} ≤ 0 — reduce θ or raise zTarget`);const l=4*a+o,c=l-2*a-5;return{length:l,stations:[],grades:[{from:0,to:l,value:n/l}],speedLimits:[{from:0,to:l,value:s}],curvatures:[{from:0,to:a,value:i},{from:a,to:2*a,value:-i},{from:2*a,to:2*a+o,value:0},{from:2*a+o,to:3*a+o,value:-i},{from:3*a+o,to:l,value:i}],signals:[{chainage:c,protects:r}]}}function Gu(i,e,t,n){const s=e/Math.abs(i),r=s+t;return{length:r,stations:[],grades:[{from:0,to:r,value:0}],speedLimits:[{from:0,to:r,value:n}],curvatures:[{from:0,to:s,value:i},{from:s,to:r,value:0}],signals:[]}}function af(){const i=25*zn,e=Xt("E_main_in",Wi(800,i),Ou),t=Gn(e),n=Xt("E_main_through",Wi(400,i),t),s=Xt("E_loop",zu(1/600,.15,400,0,25*zn,"E_main_out"),t),r=Gn(n),a=Xt("E_main_out",Wi(2e3,i),r),o=Xt("E_main_buffer",Wi(150,15*zn),Gn(a)),l=Xt("E_branch",Gu(-1/400,.35,400,40*zn),t),c=Xt("E_branch_buffer",Wi(150,15*zn),Gn(l)),h={edges:{E_main_in:e,E_main_through:n,E_loop:s,E_main_out:a,E_main_buffer:o,E_branch:l,E_branch_buffer:c}},d={player:["E_main_in","E_main_through","E_main_out","E_main_buffer"],ai1:["E_main_in","E_loop","E_main_out","E_main_buffer"],ai2:["E_main_in","E_branch","E_branch_buffer"]};return{id:"testbed",graph:h,paths:d,blockEdgeIds:["E_main_out"],stationNames:new Set,maxSpeed:44.7,makeRecords:()=>[$i("player",d.player,"E_main_in",700,12,0,"player",new Set),$i("ai1",d.ai1,"E_main_in",80,12,6,"ai",new Set),$i("ai2",d.ai2,"E_main_in",40,12,-6,"ai",new Set)]}}function of(){const i=ha(As,0,6100),e=ha(As,6100,7100),t=ha(As,7100,14e3),n=zs(e,e.length),s=Xt("K_approach",i,Ou),r=Gn(s),a=Xt("K_through",e,r),o=Xt("K_loop",zu(1/600,.15,e.length,n,8*zn,"K_onward"),r),l=Xt("K_onward",t,Gn(a)),c=Xt("K_branch",Gu(-1/500,.4,500,8*zn),r),h=Xt("K_branch_buffer",Wi(150,15*zn),Gn(c)),d={edges:{K_approach:s,K_through:a,K_loop:o,K_onward:l,K_branch:c,K_branch_buffer:h}},u={player:["K_approach","K_through","K_onward"],ai1:["K_approach","K_loop","K_onward"],ai2:["K_approach","K_branch","K_branch_buffer"]};return{id:"kingsgate",graph:d,paths:u,blockEdgeIds:["K_onward"],stationNames:new Set(As.stations.map(p=>p.name)),maxSpeed:44.7,makeRecords:()=>[$i("player",u.player,"K_approach",0,0,0,"player",new Set),$i("ai1",u.ai1,"K_loop",80,1,0,"ai",Kc(d,u.ai1)),$i("ai2",u.ai2,"K_branch",80,1,0,"ai",Kc(d,u.ai2))]}}function Kc(i,e){const t=new Set;for(const n of e)for(const s of i.edges[n].route.stations)t.add(s.name);return t}function $i(i,e,t,n,s,r,a,o){return{id:i,path:e,pos:{edgeId:t,s:n,d:r},state:{chainage:n,speed:s,brakeActual:0,time:0},spec:jh,kind:a,served:o}}af();const cf=of(),lf="modulepreload",uf=function(i,e){return new URL(i,e).href},Zc={},Ws=function(e,t,n){let s=Promise.resolve();if(t&&t.length>0){let c=function(h){return Promise.all(h.map(d=>Promise.resolve(d).then(u=>({status:"fulfilled",value:u}),u=>({status:"rejected",reason:u}))))};const a=document.getElementsByTagName("link"),o=document.querySelector("meta[property=csp-nonce]"),l=o?.nonce||o?.getAttribute("nonce");s=c(t.map(h=>{if(h=uf(h,n),h in Zc)return;Zc[h]=!0;const d=h.endsWith(".css"),u=d?'[rel="stylesheet"]':"";if(n)for(let g=a.length-1;g>=0;g--){const v=a[g];if(v.href===h&&(!d||v.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${h}"]${u}`))return;const p=document.createElement("link");if(p.rel=d?"stylesheet":lf,d||(p.as="script"),p.crossOrigin="",p.href=h,l&&p.setAttribute("nonce",l),document.head.appendChild(p),d)return new Promise((g,v)=>{p.addEventListener("load",g),p.addEventListener("error",()=>v(new Error(`Unable to preload CSS for ${h}`)))})}))}function r(a){const o=new Event("vite:preloadError",{cancelable:!0});if(o.payload=a,window.dispatchEvent(o),!o.defaultPrevented)throw a}return s.then(a=>{for(const o of a||[])o.status==="rejected"&&r(o.reason);return e().catch(r)})};const lc="183",hf=0,jc=1,df=2,Tr=1,Hu=2,ws=3,Yn=0,It=1,En=2,Tn=0,Ki=1,so=2,Jc=3,Qc=4,ff=5,ri=100,pf=101,mf=102,gf=103,_f=104,xf=200,vf=201,Mf=202,Sf=203,ro=204,ao=205,Ef=206,yf=207,bf=208,Tf=209,Af=210,wf=211,Rf=212,Cf=213,Pf=214,oo=0,co=1,lo=2,Ji=3,uo=4,ho=5,fo=6,po=7,ku=0,Lf=1,Df=2,pn=0,Vu=1,Wu=2,Xu=3,uc=4,Yu=5,qu=6,$u=7,Ku=300,pi=301,Qi=302,Ar=303,fa=304,$r=306,mi=1e3,bn=1001,mo=1002,Rt=1003,If=1004,Xs=1005,Tt=1006,pa=1007,ci=1008,qt=1009,Zu=1010,ju=1011,Ds=1012,hc=1013,gn=1014,an=1015,Rn=1016,dc=1017,fc=1018,Is=1020,Ju=35902,Qu=35899,eh=1021,th=1022,Jt=1023,Cn=1026,li=1027,pc=1028,mc=1029,es=1030,gc=1031,_c=1033,wr=33776,Rr=33777,Cr=33778,Pr=33779,go=35840,_o=35841,xo=35842,vo=35843,Mo=36196,So=37492,Eo=37496,yo=37488,bo=37489,To=37490,Ao=37491,wo=37808,Ro=37809,Co=37810,Po=37811,Lo=37812,Do=37813,Io=37814,Uo=37815,No=37816,Fo=37817,Oo=37818,Bo=37819,zo=37820,Go=37821,Ho=36492,ko=36494,Vo=36495,Wo=36283,Xo=36284,Yo=36285,qo=36286,Uf=3200,nh=0,Nf=1,yn="",Dt="srgb",ts="srgb-linear",Fr="linear",ot="srgb",bi=7680,el=519,Ff=512,Of=513,Bf=514,xc=515,zf=516,Gf=517,vc=518,Hf=519,$o=35044,tl="300 es",fn=2e3,Us=2001;function kf(i){for(let e=i.length-1;e>=0;--e)if(i[e]>=65535)return!0;return!1}function Or(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function Vf(){const i=Or("canvas");return i.style.display="block",i}const nl={};function Br(...i){const e="THREE."+i.shift();console.log(e,...i)}function ih(i){const e=i[0];if(typeof e=="string"&&e.startsWith("TSL:")){const t=i[1];t&&t.isStackTrace?i[0]+=" "+t.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function Oe(...i){i=ih(i);const e="THREE."+i.shift();{const t=i[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...i)}}function et(...i){i=ih(i);const e="THREE."+i.shift();{const t=i[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...i)}}function zr(...i){const e=i.join(" ");e in nl||(nl[e]=!0,Oe(...i))}function Wf(i,e,t){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(e,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,t);break;default:n()}}setTimeout(r,t)})}const Xf={[oo]:co,[lo]:fo,[uo]:po,[Ji]:ho,[co]:oo,[fo]:lo,[po]:uo,[ho]:Ji};class os{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){const n=this._listeners;return n===void 0?!1:n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){const n=this._listeners;if(n===void 0)return;const s=n[e];if(s!==void 0){const r=s.indexOf(t);r!==-1&&s.splice(r,1)}}dispatchEvent(e){const t=this._listeners;if(t===void 0)return;const n=t[e.type];if(n!==void 0){e.target=this;const s=n.slice(0);for(let r=0,a=s.length;r<a;r++)s[r].call(this,e);e.target=null}}}const Pt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],ma=Math.PI/180,Ko=180/Math.PI;function kn(){const i=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Pt[i&255]+Pt[i>>8&255]+Pt[i>>16&255]+Pt[i>>24&255]+"-"+Pt[e&255]+Pt[e>>8&255]+"-"+Pt[e>>16&15|64]+Pt[e>>24&255]+"-"+Pt[t&63|128]+Pt[t>>8&255]+"-"+Pt[t>>16&255]+Pt[t>>24&255]+Pt[n&255]+Pt[n>>8&255]+Pt[n>>16&255]+Pt[n>>24&255]).toLowerCase()}function Ze(i,e,t){return Math.max(e,Math.min(t,i))}function Yf(i,e){return(i%e+e)%e}function ga(i,e,t){return(1-t)*i+t*e}function dn(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("Invalid component type.")}}function ut(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("Invalid component type.")}}class Fe{constructor(e=0,t=0){Fe.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,n=this.y,s=e.elements;return this.x=s[0]*t+s[3]*n+s[6],this.y=s[1]*t+s[4]*n+s[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Ze(this.x,e.x,t.x),this.y=Ze(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=Ze(this.x,e,t),this.y=Ze(this.y,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Ze(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(Ze(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const n=Math.cos(t),s=Math.sin(t),r=this.x-e.x,a=this.y-e.y;return this.x=r*n-a*s+e.x,this.y=r*s+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class $t{constructor(e=0,t=0,n=0,s=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=s}static slerpFlat(e,t,n,s,r,a,o){let l=n[s+0],c=n[s+1],h=n[s+2],d=n[s+3],u=r[a+0],p=r[a+1],g=r[a+2],v=r[a+3];if(d!==v||l!==u||c!==p||h!==g){let m=l*u+c*p+h*g+d*v;m<0&&(u=-u,p=-p,g=-g,v=-v,m=-m);let f=1-o;if(m<.9995){const x=Math.acos(m),y=Math.sin(x);f=Math.sin(f*x)/y,o=Math.sin(o*x)/y,l=l*f+u*o,c=c*f+p*o,h=h*f+g*o,d=d*f+v*o}else{l=l*f+u*o,c=c*f+p*o,h=h*f+g*o,d=d*f+v*o;const x=1/Math.sqrt(l*l+c*c+h*h+d*d);l*=x,c*=x,h*=x,d*=x}}e[t]=l,e[t+1]=c,e[t+2]=h,e[t+3]=d}static multiplyQuaternionsFlat(e,t,n,s,r,a){const o=n[s],l=n[s+1],c=n[s+2],h=n[s+3],d=r[a],u=r[a+1],p=r[a+2],g=r[a+3];return e[t]=o*g+h*d+l*p-c*u,e[t+1]=l*g+h*u+c*d-o*p,e[t+2]=c*g+h*p+o*u-l*d,e[t+3]=h*g-o*d-l*u-c*p,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,s){return this._x=e,this._y=t,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const n=e._x,s=e._y,r=e._z,a=e._order,o=Math.cos,l=Math.sin,c=o(n/2),h=o(s/2),d=o(r/2),u=l(n/2),p=l(s/2),g=l(r/2);switch(a){case"XYZ":this._x=u*h*d+c*p*g,this._y=c*p*d-u*h*g,this._z=c*h*g+u*p*d,this._w=c*h*d-u*p*g;break;case"YXZ":this._x=u*h*d+c*p*g,this._y=c*p*d-u*h*g,this._z=c*h*g-u*p*d,this._w=c*h*d+u*p*g;break;case"ZXY":this._x=u*h*d-c*p*g,this._y=c*p*d+u*h*g,this._z=c*h*g+u*p*d,this._w=c*h*d-u*p*g;break;case"ZYX":this._x=u*h*d-c*p*g,this._y=c*p*d+u*h*g,this._z=c*h*g-u*p*d,this._w=c*h*d+u*p*g;break;case"YZX":this._x=u*h*d+c*p*g,this._y=c*p*d+u*h*g,this._z=c*h*g-u*p*d,this._w=c*h*d-u*p*g;break;case"XZY":this._x=u*h*d-c*p*g,this._y=c*p*d-u*h*g,this._z=c*h*g+u*p*d,this._w=c*h*d+u*p*g;break;default:Oe("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const n=t/2,s=Math.sin(n);return this._x=e.x*s,this._y=e.y*s,this._z=e.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,n=t[0],s=t[4],r=t[8],a=t[1],o=t[5],l=t[9],c=t[2],h=t[6],d=t[10],u=n+o+d;if(u>0){const p=.5/Math.sqrt(u+1);this._w=.25/p,this._x=(h-l)*p,this._y=(r-c)*p,this._z=(a-s)*p}else if(n>o&&n>d){const p=2*Math.sqrt(1+n-o-d);this._w=(h-l)/p,this._x=.25*p,this._y=(s+a)/p,this._z=(r+c)/p}else if(o>d){const p=2*Math.sqrt(1+o-n-d);this._w=(r-c)/p,this._x=(s+a)/p,this._y=.25*p,this._z=(l+h)/p}else{const p=2*Math.sqrt(1+d-n-o);this._w=(a-s)/p,this._x=(r+c)/p,this._y=(l+h)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Ze(this.dot(e),-1,1)))}rotateTowards(e,t){const n=this.angleTo(e);if(n===0)return this;const s=Math.min(1,t/n);return this.slerp(e,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const n=e._x,s=e._y,r=e._z,a=e._w,o=t._x,l=t._y,c=t._z,h=t._w;return this._x=n*h+a*o+s*c-r*l,this._y=s*h+a*l+r*o-n*c,this._z=r*h+a*c+n*l-s*o,this._w=a*h-n*o-s*l-r*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,s=e._y,r=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,s=-s,r=-r,a=-a,o=-o);let l=1-t;if(o<.9995){const c=Math.acos(o),h=Math.sin(c);l=Math.sin(l*c)/h,t=Math.sin(t*c)/h,this._x=this._x*l+n*t,this._y=this._y*l+s*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this._onChangeCallback()}else this._x=this._x*l+n*t,this._y=this._y*l+s*t,this._z=this._z*l+r*t,this._w=this._w*l+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(e),s*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class D{constructor(e=0,t=0,n=0){D.prototype.isVector3=!0,this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(il.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(il.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*s,this.y=r[1]*t+r[4]*n+r[7]*s,this.z=r[2]*t+r[5]*n+r[8]*s,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,n=this.y,s=this.z,r=e.elements,a=1/(r[3]*t+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*s+r[12])*a,this.y=(r[1]*t+r[5]*n+r[9]*s+r[13])*a,this.z=(r[2]*t+r[6]*n+r[10]*s+r[14])*a,this}applyQuaternion(e){const t=this.x,n=this.y,s=this.z,r=e.x,a=e.y,o=e.z,l=e.w,c=2*(a*s-o*n),h=2*(o*t-r*s),d=2*(r*n-a*t);return this.x=t+l*c+a*d-o*h,this.y=n+l*h+o*c-r*d,this.z=s+l*d+r*h-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,n=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*s,this.y=r[1]*t+r[5]*n+r[9]*s,this.z=r[2]*t+r[6]*n+r[10]*s,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Ze(this.x,e.x,t.x),this.y=Ze(this.y,e.y,t.y),this.z=Ze(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=Ze(this.x,e,t),this.y=Ze(this.y,e,t),this.z=Ze(this.z,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Ze(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const n=e.x,s=e.y,r=e.z,a=t.x,o=t.y,l=t.z;return this.x=s*l-r*o,this.y=r*a-n*l,this.z=n*o-s*a,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return _a.copy(this).projectOnVector(e),this.sub(_a)}reflect(e){return this.sub(_a.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(Ze(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y,s=this.z-e.z;return t*t+n*n+s*s}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){const s=Math.sin(t)*e;return this.x=s*Math.sin(n),this.y=Math.cos(t)*e,this.z=s*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),s=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=s,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const _a=new D,il=new $t;class Ge{constructor(e,t,n,s,r,a,o,l,c){Ge.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,a,o,l,c)}set(e,t,n,s,r,a,o,l,c){const h=this.elements;return h[0]=e,h[1]=s,h[2]=o,h[3]=t,h[4]=r,h[5]=l,h[6]=n,h[7]=a,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,s=t.elements,r=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],h=n[4],d=n[7],u=n[2],p=n[5],g=n[8],v=s[0],m=s[3],f=s[6],x=s[1],y=s[4],S=s[7],A=s[2],b=s[5],w=s[8];return r[0]=a*v+o*x+l*A,r[3]=a*m+o*y+l*b,r[6]=a*f+o*S+l*w,r[1]=c*v+h*x+d*A,r[4]=c*m+h*y+d*b,r[7]=c*f+h*S+d*w,r[2]=u*v+p*x+g*A,r[5]=u*m+p*y+g*b,r[8]=u*f+p*S+g*w,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8];return t*a*h-t*o*c-n*r*h+n*o*l+s*r*c-s*a*l}invert(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],d=h*a-o*c,u=o*l-h*r,p=c*r-a*l,g=t*d+n*u+s*p;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);const v=1/g;return e[0]=d*v,e[1]=(s*c-h*n)*v,e[2]=(o*n-s*a)*v,e[3]=u*v,e[4]=(h*t-s*l)*v,e[5]=(s*r-o*t)*v,e[6]=p*v,e[7]=(n*l-c*t)*v,e[8]=(a*t-n*r)*v,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,s,r,a,o){const l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*a+c*o)+a+e,-s*c,s*l,-s*(-c*a+l*o)+o+t,0,0,1),this}scale(e,t){return this.premultiply(xa.makeScale(e,t)),this}rotate(e){return this.premultiply(xa.makeRotation(-e)),this}translate(e,t){return this.premultiply(xa.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,n=e.elements;for(let s=0;s<9;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}}const xa=new Ge,sl=new Ge().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),rl=new Ge().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function qf(){const i={enabled:!0,workingColorSpace:ts,spaces:{},convert:function(s,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===ot&&(s.r=An(s.r),s.g=An(s.g),s.b=An(s.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===ot&&(s.r=Zi(s.r),s.g=Zi(s.g),s.b=Zi(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===yn?Fr:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,a){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,r){return zr("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(s,r)},toWorkingColorSpace:function(s,r){return zr("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(s,r)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[ts]:{primaries:e,whitePoint:n,transfer:Fr,toXYZ:sl,fromXYZ:rl,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:Dt},outputColorSpaceConfig:{drawingBufferColorSpace:Dt}},[Dt]:{primaries:e,whitePoint:n,transfer:ot,toXYZ:sl,fromXYZ:rl,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:Dt}}}),i}const tt=qf();function An(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Zi(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}let Ti;class $f{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{Ti===void 0&&(Ti=Or("canvas")),Ti.width=e.width,Ti.height=e.height;const s=Ti.getContext("2d");e instanceof ImageData?s.putImageData(e,0,0):s.drawImage(e,0,0,e.width,e.height),n=Ti}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=Or("canvas");t.width=e.width,t.height=e.height;const n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);const s=n.getImageData(0,0,e.width,e.height),r=s.data;for(let a=0;a<r.length;a++)r[a]=An(r[a]/255)*255;return n.putImageData(s,0,0),t}else if(e.data){const t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(An(t[n]/255)*255):t[n]=An(t[n]);return{data:t,width:e.width,height:e.height}}else return Oe("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}let Kf=0;class Mc{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Kf++}),this.uuid=kn(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){const t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayHeight,t.displayWidth,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let a=0,o=s.length;a<o;a++)s[a].isDataTexture?r.push(va(s[a].image)):r.push(va(s[a]))}else r=va(s);n.url=r}return t||(e.images[this.uuid]=n),n}}function va(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?$f.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(Oe("Texture: Unable to serialize Texture."),{})}let Zf=0;const Ma=new D;class Ut extends os{constructor(e=Ut.DEFAULT_IMAGE,t=Ut.DEFAULT_MAPPING,n=bn,s=bn,r=Tt,a=ci,o=Jt,l=qt,c=Ut.DEFAULT_ANISOTROPY,h=yn){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Zf++}),this.uuid=kn(),this.name="",this.source=new Mc(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new Fe(0,0),this.repeat=new Fe(1,1),this.center=new Fe(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ge,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(Ma).x}get height(){return this.source.getSize(Ma).y}get depth(){return this.source.getSize(Ma).z}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(const t in e){const n=e[t];if(n===void 0){Oe(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}const s=this[t];if(s===void 0){Oe(`Texture.setValues(): property '${t}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Ku)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case mi:e.x=e.x-Math.floor(e.x);break;case bn:e.x=e.x<0?0:1;break;case mo:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case mi:e.y=e.y-Math.floor(e.y);break;case bn:e.y=e.y<0?0:1;break;case mo:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}Ut.DEFAULT_IMAGE=null;Ut.DEFAULT_MAPPING=Ku;Ut.DEFAULT_ANISOTROPY=1;class mt{constructor(e=0,t=0,n=0,s=1){mt.prototype.isVector4=!0,this.x=e,this.y=t,this.z=n,this.w=s}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,s){return this.x=e,this.y=t,this.z=n,this.w=s,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,n=this.y,s=this.z,r=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*s+a[12]*r,this.y=a[1]*t+a[5]*n+a[9]*s+a[13]*r,this.z=a[2]*t+a[6]*n+a[10]*s+a[14]*r,this.w=a[3]*t+a[7]*n+a[11]*s+a[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,s,r;const l=e.elements,c=l[0],h=l[4],d=l[8],u=l[1],p=l[5],g=l[9],v=l[2],m=l[6],f=l[10];if(Math.abs(h-u)<.01&&Math.abs(d-v)<.01&&Math.abs(g-m)<.01){if(Math.abs(h+u)<.1&&Math.abs(d+v)<.1&&Math.abs(g+m)<.1&&Math.abs(c+p+f-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const y=(c+1)/2,S=(p+1)/2,A=(f+1)/2,b=(h+u)/4,w=(d+v)/4,_=(g+m)/4;return y>S&&y>A?y<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(y),s=b/n,r=w/n):S>A?S<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(S),n=b/s,r=_/s):A<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(A),n=w/r,s=_/r),this.set(n,s,r,t),this}let x=Math.sqrt((m-g)*(m-g)+(d-v)*(d-v)+(u-h)*(u-h));return Math.abs(x)<.001&&(x=1),this.x=(m-g)/x,this.y=(d-v)/x,this.z=(u-h)/x,this.w=Math.acos((c+p+f-1)/2),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Ze(this.x,e.x,t.x),this.y=Ze(this.y,e.y,t.y),this.z=Ze(this.z,e.z,t.z),this.w=Ze(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=Ze(this.x,e,t),this.y=Ze(this.y,e,t),this.z=Ze(this.z,e,t),this.w=Ze(this.w,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Ze(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class jf extends os{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Tt,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new mt(0,0,e,t),this.scissorTest=!1,this.viewport=new mt(0,0,e,t),this.textures=[];const s={width:e,height:t,depth:n.depth},r=new Ut(s),a=n.count;for(let o=0;o<a;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview}_setTextureOptions(e={}){const t={minFilter:Tt,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=e,this.textures[s].image.height=t,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;const s=Object.assign({},e.textures[t].image);this.textures[t].source=new Mc(s)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}}class mn extends jf{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}}class sh extends Ut{constructor(e=null,t=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=Rt,this.minFilter=Rt,this.wrapR=bn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class Jf extends Ut{constructor(e=null,t=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:s},this.magFilter=Rt,this.minFilter=Rt,this.wrapR=bn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class je{constructor(e,t,n,s,r,a,o,l,c,h,d,u,p,g,v,m){je.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,s,r,a,o,l,c,h,d,u,p,g,v,m)}set(e,t,n,s,r,a,o,l,c,h,d,u,p,g,v,m){const f=this.elements;return f[0]=e,f[4]=t,f[8]=n,f[12]=s,f[1]=r,f[5]=a,f[9]=o,f[13]=l,f[2]=c,f[6]=h,f[10]=d,f[14]=u,f[3]=p,f[7]=g,f[11]=v,f[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new je().fromArray(this.elements)}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){const t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinant()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinant()===0)return this.identity();const t=this.elements,n=e.elements,s=1/Ai.setFromMatrixColumn(e,0).length(),r=1/Ai.setFromMatrixColumn(e,1).length(),a=1/Ai.setFromMatrixColumn(e,2).length();return t[0]=n[0]*s,t[1]=n[1]*s,t[2]=n[2]*s,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,n=e.x,s=e.y,r=e.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(s),c=Math.sin(s),h=Math.cos(r),d=Math.sin(r);if(e.order==="XYZ"){const u=a*h,p=a*d,g=o*h,v=o*d;t[0]=l*h,t[4]=-l*d,t[8]=c,t[1]=p+g*c,t[5]=u-v*c,t[9]=-o*l,t[2]=v-u*c,t[6]=g+p*c,t[10]=a*l}else if(e.order==="YXZ"){const u=l*h,p=l*d,g=c*h,v=c*d;t[0]=u+v*o,t[4]=g*o-p,t[8]=a*c,t[1]=a*d,t[5]=a*h,t[9]=-o,t[2]=p*o-g,t[6]=v+u*o,t[10]=a*l}else if(e.order==="ZXY"){const u=l*h,p=l*d,g=c*h,v=c*d;t[0]=u-v*o,t[4]=-a*d,t[8]=g+p*o,t[1]=p+g*o,t[5]=a*h,t[9]=v-u*o,t[2]=-a*c,t[6]=o,t[10]=a*l}else if(e.order==="ZYX"){const u=a*h,p=a*d,g=o*h,v=o*d;t[0]=l*h,t[4]=g*c-p,t[8]=u*c+v,t[1]=l*d,t[5]=v*c+u,t[9]=p*c-g,t[2]=-c,t[6]=o*l,t[10]=a*l}else if(e.order==="YZX"){const u=a*l,p=a*c,g=o*l,v=o*c;t[0]=l*h,t[4]=v-u*d,t[8]=g*d+p,t[1]=d,t[5]=a*h,t[9]=-o*h,t[2]=-c*h,t[6]=p*d+g,t[10]=u-v*d}else if(e.order==="XZY"){const u=a*l,p=a*c,g=o*l,v=o*c;t[0]=l*h,t[4]=-d,t[8]=c*h,t[1]=u*d+v,t[5]=a*h,t[9]=p*d-g,t[2]=g*d-p,t[6]=o*h,t[10]=v*d+u}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Qf,e,ep)}lookAt(e,t,n){const s=this.elements;return Vt.subVectors(e,t),Vt.lengthSq()===0&&(Vt.z=1),Vt.normalize(),Dn.crossVectors(n,Vt),Dn.lengthSq()===0&&(Math.abs(n.z)===1?Vt.x+=1e-4:Vt.z+=1e-4,Vt.normalize(),Dn.crossVectors(n,Vt)),Dn.normalize(),Ys.crossVectors(Vt,Dn),s[0]=Dn.x,s[4]=Ys.x,s[8]=Vt.x,s[1]=Dn.y,s[5]=Ys.y,s[9]=Vt.y,s[2]=Dn.z,s[6]=Ys.z,s[10]=Vt.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,s=t.elements,r=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],h=n[1],d=n[5],u=n[9],p=n[13],g=n[2],v=n[6],m=n[10],f=n[14],x=n[3],y=n[7],S=n[11],A=n[15],b=s[0],w=s[4],_=s[8],E=s[12],L=s[1],C=s[5],N=s[9],I=s[13],z=s[2],F=s[6],O=s[10],H=s[14],K=s[3],Z=s[7],ne=s[11],le=s[15];return r[0]=a*b+o*L+l*z+c*K,r[4]=a*w+o*C+l*F+c*Z,r[8]=a*_+o*N+l*O+c*ne,r[12]=a*E+o*I+l*H+c*le,r[1]=h*b+d*L+u*z+p*K,r[5]=h*w+d*C+u*F+p*Z,r[9]=h*_+d*N+u*O+p*ne,r[13]=h*E+d*I+u*H+p*le,r[2]=g*b+v*L+m*z+f*K,r[6]=g*w+v*C+m*F+f*Z,r[10]=g*_+v*N+m*O+f*ne,r[14]=g*E+v*I+m*H+f*le,r[3]=x*b+y*L+S*z+A*K,r[7]=x*w+y*C+S*F+A*Z,r[11]=x*_+y*N+S*O+A*ne,r[15]=x*E+y*I+S*H+A*le,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[4],s=e[8],r=e[12],a=e[1],o=e[5],l=e[9],c=e[13],h=e[2],d=e[6],u=e[10],p=e[14],g=e[3],v=e[7],m=e[11],f=e[15],x=l*p-c*u,y=o*p-c*d,S=o*u-l*d,A=a*p-c*h,b=a*u-l*h,w=a*d-o*h;return t*(v*x-m*y+f*S)-n*(g*x-m*A+f*b)+s*(g*y-v*A+f*w)-r*(g*S-v*b+m*w)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){const s=this.elements;return e.isVector3?(s[12]=e.x,s[13]=e.y,s[14]=e.z):(s[12]=e,s[13]=t,s[14]=n),this}invert(){const e=this.elements,t=e[0],n=e[1],s=e[2],r=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],d=e[9],u=e[10],p=e[11],g=e[12],v=e[13],m=e[14],f=e[15],x=t*o-n*a,y=t*l-s*a,S=t*c-r*a,A=n*l-s*o,b=n*c-r*o,w=s*c-r*l,_=h*v-d*g,E=h*m-u*g,L=h*f-p*g,C=d*m-u*v,N=d*f-p*v,I=u*f-p*m,z=x*I-y*N+S*C+A*L-b*E+w*_;if(z===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const F=1/z;return e[0]=(o*I-l*N+c*C)*F,e[1]=(s*N-n*I-r*C)*F,e[2]=(v*w-m*b+f*A)*F,e[3]=(u*b-d*w-p*A)*F,e[4]=(l*L-a*I-c*E)*F,e[5]=(t*I-s*L+r*E)*F,e[6]=(m*S-g*w-f*y)*F,e[7]=(h*w-u*S+p*y)*F,e[8]=(a*N-o*L+c*_)*F,e[9]=(n*L-t*N-r*_)*F,e[10]=(g*b-v*S+f*x)*F,e[11]=(d*S-h*b-p*x)*F,e[12]=(o*E-a*C-l*_)*F,e[13]=(t*C-n*E+s*_)*F,e[14]=(v*y-g*A-m*x)*F,e[15]=(h*A-d*y+u*x)*F,this}scale(e){const t=this.elements,n=e.x,s=e.y,r=e.z;return t[0]*=n,t[4]*=s,t[8]*=r,t[1]*=n,t[5]*=s,t[9]*=r,t[2]*=n,t[6]*=s,t[10]*=r,t[3]*=n,t[7]*=s,t[11]*=r,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],s=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,s))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const n=Math.cos(t),s=Math.sin(t),r=1-n,a=e.x,o=e.y,l=e.z,c=r*a,h=r*o;return this.set(c*a+n,c*o-s*l,c*l+s*o,0,c*o+s*l,h*o+n,h*l-s*a,0,c*l-s*o,h*l+s*a,r*l*l+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,s,r,a){return this.set(1,n,r,0,e,1,a,0,t,s,1,0,0,0,0,1),this}compose(e,t,n){const s=this.elements,r=t._x,a=t._y,o=t._z,l=t._w,c=r+r,h=a+a,d=o+o,u=r*c,p=r*h,g=r*d,v=a*h,m=a*d,f=o*d,x=l*c,y=l*h,S=l*d,A=n.x,b=n.y,w=n.z;return s[0]=(1-(v+f))*A,s[1]=(p+S)*A,s[2]=(g-y)*A,s[3]=0,s[4]=(p-S)*b,s[5]=(1-(u+f))*b,s[6]=(m+x)*b,s[7]=0,s[8]=(g+y)*w,s[9]=(m-x)*w,s[10]=(1-(u+v))*w,s[11]=0,s[12]=e.x,s[13]=e.y,s[14]=e.z,s[15]=1,this}decompose(e,t,n){const s=this.elements;e.x=s[12],e.y=s[13],e.z=s[14];const r=this.determinant();if(r===0)return n.set(1,1,1),t.identity(),this;let a=Ai.set(s[0],s[1],s[2]).length();const o=Ai.set(s[4],s[5],s[6]).length(),l=Ai.set(s[8],s[9],s[10]).length();r<0&&(a=-a),tn.copy(this);const c=1/a,h=1/o,d=1/l;return tn.elements[0]*=c,tn.elements[1]*=c,tn.elements[2]*=c,tn.elements[4]*=h,tn.elements[5]*=h,tn.elements[6]*=h,tn.elements[8]*=d,tn.elements[9]*=d,tn.elements[10]*=d,t.setFromRotationMatrix(tn),n.x=a,n.y=o,n.z=l,this}makePerspective(e,t,n,s,r,a,o=fn,l=!1){const c=this.elements,h=2*r/(t-e),d=2*r/(n-s),u=(t+e)/(t-e),p=(n+s)/(n-s);let g,v;if(l)g=r/(a-r),v=a*r/(a-r);else if(o===fn)g=-(a+r)/(a-r),v=-2*a*r/(a-r);else if(o===Us)g=-a/(a-r),v=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=d,c[9]=p,c[13]=0,c[2]=0,c[6]=0,c[10]=g,c[14]=v,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,s,r,a,o=fn,l=!1){const c=this.elements,h=2/(t-e),d=2/(n-s),u=-(t+e)/(t-e),p=-(n+s)/(n-s);let g,v;if(l)g=1/(a-r),v=a/(a-r);else if(o===fn)g=-2/(a-r),v=-(a+r)/(a-r);else if(o===Us)g=-1/(a-r),v=-r/(a-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=0,c[12]=u,c[1]=0,c[5]=d,c[9]=0,c[13]=p,c[2]=0,c[6]=0,c[10]=g,c[14]=v,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){const t=this.elements,n=e.elements;for(let s=0;s<16;s++)if(t[s]!==n[s])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}}const Ai=new D,tn=new je,Qf=new D(0,0,0),ep=new D(1,1,1),Dn=new D,Ys=new D,Vt=new D,al=new je,ol=new $t;class Bt{constructor(e=0,t=0,n=0,s=Bt.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=s}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,s=this._order){return this._x=e,this._y=t,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){const s=e.elements,r=s[0],a=s[4],o=s[8],l=s[1],c=s[5],h=s[9],d=s[2],u=s[6],p=s[10];switch(t){case"XYZ":this._y=Math.asin(Ze(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,p),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(u,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Ze(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,p),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-d,r),this._z=0);break;case"ZXY":this._x=Math.asin(Ze(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-d,p),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-Ze(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(u,p),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(Ze(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-d,r)):(this._x=0,this._y=Math.atan2(o,p));break;case"XZY":this._z=Math.asin(-Ze(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(u,c),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-h,p),this._y=0);break;default:Oe("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return al.makeRotationFromQuaternion(e),this.setFromRotationMatrix(al,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return ol.setFromEuler(this),this.setFromQuaternion(ol,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}Bt.DEFAULT_ORDER="XYZ";class rh{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}let tp=0;const cl=new D,wi=new $t,_n=new je,qs=new D,hs=new D,np=new D,ip=new $t,ll=new D(1,0,0),ul=new D(0,1,0),hl=new D(0,0,1),dl={type:"added"},sp={type:"removed"},Ri={type:"childadded",child:null},Sa={type:"childremoved",child:null};class xt extends os{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:tp++}),this.uuid=kn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=xt.DEFAULT_UP.clone();const e=new D,t=new Bt,n=new $t,s=new D(1,1,1);function r(){n.setFromEuler(t,!1)}function a(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new je},normalMatrix:{value:new Ge}}),this.matrix=new je,this.matrixWorld=new je,this.matrixAutoUpdate=xt.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=xt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new rh,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return wi.setFromAxisAngle(e,t),this.quaternion.multiply(wi),this}rotateOnWorldAxis(e,t){return wi.setFromAxisAngle(e,t),this.quaternion.premultiply(wi),this}rotateX(e){return this.rotateOnAxis(ll,e)}rotateY(e){return this.rotateOnAxis(ul,e)}rotateZ(e){return this.rotateOnAxis(hl,e)}translateOnAxis(e,t){return cl.copy(e).applyQuaternion(this.quaternion),this.position.add(cl.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(ll,e)}translateY(e){return this.translateOnAxis(ul,e)}translateZ(e){return this.translateOnAxis(hl,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(_n.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?qs.copy(e):qs.set(e,t,n);const s=this.parent;this.updateWorldMatrix(!0,!1),hs.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?_n.lookAt(hs,qs,this.up):_n.lookAt(qs,hs,this.up),this.quaternion.setFromRotationMatrix(_n),s&&(_n.extractRotation(s.matrixWorld),wi.setFromRotationMatrix(_n),this.quaternion.premultiply(wi.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(et("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(dl),Ri.child=e,this.dispatchEvent(Ri),Ri.child=null):et("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(sp),Sa.child=e,this.dispatchEvent(Sa),Sa.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),_n.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),_n.multiply(e.parent.matrixWorld)),e.applyMatrix4(_n),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(dl),Ri.child=e,this.dispatchEvent(Ri),Ri.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,s=this.children.length;n<s;n++){const a=this.children[n].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);const s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(hs,e,np),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(hs,ip,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);const e=this.pivot;if(e!==null){const t=e.x,n=e.y,s=e.z,r=this.matrix.elements;r[12]+=t-r[0]*t-r[4]*n-r[8]*s,r[13]+=n-r[1]*t-r[5]*n-r[9]*s,r[14]+=s-r[2]*t-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let n=0,s=t.length;n<s;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t){const n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){const s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].updateWorldMatrix(!1,!0)}}toJSON(e){const t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),this.static!==!1&&(s.static=this.static),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(o=>({...o})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(e),s.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(e.geometries,this.geometry);const o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){const l=o.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){const d=l[c];r(e.shapes,d)}else r(e.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(r(e.materials,this.material[l]));s.material=o}else s.material=r(e.materials,this.material);if(this.children.length>0){s.children=[];for(let o=0;o<this.children.length;o++)s.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){s.animations=[];for(let o=0;o<this.animations.length;o++){const l=this.animations[o];s.animations.push(r(e.animations,l))}}if(t){const o=a(e.geometries),l=a(e.materials),c=a(e.textures),h=a(e.images),d=a(e.shapes),u=a(e.skeletons),p=a(e.animations),g=a(e.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),d.length>0&&(n.shapes=d),u.length>0&&(n.skeletons=u),p.length>0&&(n.animations=p),g.length>0&&(n.nodes=g)}return n.object=s,n;function a(o){const l=[];for(const c in o){const h=o[c];delete h.metadata,l.push(h)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),e.pivot!==null&&(this.pivot=e.pivot.clone()),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){const s=e.children[n];this.add(s.clone())}return this}}xt.DEFAULT_UP=new D(0,1,0);xt.DEFAULT_MATRIX_AUTO_UPDATE=!0;xt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class Mt extends xt{constructor(){super(),this.isGroup=!0,this.type="Group"}}const rp={type:"move"};class Ea{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Mt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Mt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new D,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new D),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Mt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new D,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new D),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let s=null,r=null,a=null;const o=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){a=!0;for(const v of e.hand.values()){const m=t.getJointPose(v,n),f=this._getHandJoint(c,v);m!==null&&(f.matrix.fromArray(m.transform.matrix),f.matrix.decompose(f.position,f.rotation,f.scale),f.matrixWorldNeedsUpdate=!0,f.jointRadius=m.radius),f.visible=m!==null}const h=c.joints["index-finger-tip"],d=c.joints["thumb-tip"],u=h.position.distanceTo(d.position),p=.02,g=.005;c.inputState.pinching&&u>p+g?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&u<=p-g&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1));o!==null&&(s=t.getPose(e.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(o.matrix.fromArray(s.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,s.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(s.linearVelocity)):o.hasLinearVelocity=!1,s.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(s.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(rp)))}return o!==null&&(o.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const n=new Mt;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}}const ah={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},In={h:0,s:0,l:0},$s={h:0,s:0,l:0};function ya(i,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?i+(e-i)*6*t:t<1/2?e:t<2/3?i+(e-i)*6*(2/3-t):i}class Ne{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){const s=e;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=Dt){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,tt.colorSpaceToWorking(this,t),this}setRGB(e,t,n,s=tt.workingColorSpace){return this.r=e,this.g=t,this.b=n,tt.colorSpaceToWorking(this,s),this}setHSL(e,t,n,s=tt.workingColorSpace){if(e=Yf(e,1),t=Ze(t,0,1),n=Ze(n,0,1),t===0)this.r=this.g=this.b=n;else{const r=n<=.5?n*(1+t):n+t-n*t,a=2*n-r;this.r=ya(a,r,e+1/3),this.g=ya(a,r,e),this.b=ya(a,r,e-1/3)}return tt.colorSpaceToWorking(this,s),this}setStyle(e,t=Dt){function n(r){r!==void 0&&parseFloat(r)<1&&Oe("Color: Alpha component of "+e+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(e)){let r;const a=s[1],o=s[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:Oe("Color: Unknown color model "+e)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(e)){const r=s[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(r,16),t);Oe("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=Dt){const n=ah[e.toLowerCase()];return n!==void 0?this.setHex(n,t):Oe("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=An(e.r),this.g=An(e.g),this.b=An(e.b),this}copyLinearToSRGB(e){return this.r=Zi(e.r),this.g=Zi(e.g),this.b=Zi(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=Dt){return tt.workingToColorSpace(Lt.copy(this),e),Math.round(Ze(Lt.r*255,0,255))*65536+Math.round(Ze(Lt.g*255,0,255))*256+Math.round(Ze(Lt.b*255,0,255))}getHexString(e=Dt){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=tt.workingColorSpace){tt.workingToColorSpace(Lt.copy(this),t);const n=Lt.r,s=Lt.g,r=Lt.b,a=Math.max(n,s,r),o=Math.min(n,s,r);let l,c;const h=(o+a)/2;if(o===a)l=0,c=0;else{const d=a-o;switch(c=h<=.5?d/(a+o):d/(2-a-o),a){case n:l=(s-r)/d+(s<r?6:0);break;case s:l=(r-n)/d+2;break;case r:l=(n-s)/d+4;break}l/=6}return e.h=l,e.s=c,e.l=h,e}getRGB(e,t=tt.workingColorSpace){return tt.workingToColorSpace(Lt.copy(this),t),e.r=Lt.r,e.g=Lt.g,e.b=Lt.b,e}getStyle(e=Dt){tt.workingToColorSpace(Lt.copy(this),e);const t=Lt.r,n=Lt.g,s=Lt.b;return e!==Dt?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(e,t,n){return this.getHSL(In),this.setHSL(In.h+e,In.s+t,In.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(In),e.getHSL($s);const n=ga(In.h,$s.h,t),s=ga(In.s,$s.s,t),r=ga(In.l,$s.l,t);return this.setHSL(n,s,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,n=this.g,s=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*s,this.g=r[1]*t+r[4]*n+r[7]*s,this.b=r[2]*t+r[5]*n+r[8]*s,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const Lt=new Ne;Ne.NAMES=ah;class Sc{constructor(e,t=1,n=1e3){this.isFog=!0,this.name="",this.color=new Ne(e),this.near=t,this.far=n}clone(){return new Sc(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}}class ap extends xt{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Bt,this.environmentIntensity=1,this.environmentRotation=new Bt,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}}const nn=new D,xn=new D,ba=new D,vn=new D,Ci=new D,Pi=new D,fl=new D,Ta=new D,Aa=new D,wa=new D,Ra=new mt,Ca=new mt,Pa=new mt;class Zt{constructor(e=new D,t=new D,n=new D){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,s){s.subVectors(n,t),nn.subVectors(e,t),s.cross(nn);const r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(e,t,n,s,r){nn.subVectors(s,t),xn.subVectors(n,t),ba.subVectors(e,t);const a=nn.dot(nn),o=nn.dot(xn),l=nn.dot(ba),c=xn.dot(xn),h=xn.dot(ba),d=a*c-o*o;if(d===0)return r.set(0,0,0),null;const u=1/d,p=(c*l-o*h)*u,g=(a*h-o*l)*u;return r.set(1-p-g,g,p)}static containsPoint(e,t,n,s){return this.getBarycoord(e,t,n,s,vn)===null?!1:vn.x>=0&&vn.y>=0&&vn.x+vn.y<=1}static getInterpolation(e,t,n,s,r,a,o,l){return this.getBarycoord(e,t,n,s,vn)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,vn.x),l.addScaledVector(a,vn.y),l.addScaledVector(o,vn.z),l)}static getInterpolatedAttribute(e,t,n,s,r,a){return Ra.setScalar(0),Ca.setScalar(0),Pa.setScalar(0),Ra.fromBufferAttribute(e,t),Ca.fromBufferAttribute(e,n),Pa.fromBufferAttribute(e,s),a.setScalar(0),a.addScaledVector(Ra,r.x),a.addScaledVector(Ca,r.y),a.addScaledVector(Pa,r.z),a}static isFrontFacing(e,t,n,s){return nn.subVectors(n,t),xn.subVectors(e,t),nn.cross(xn).dot(s)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,s){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[s]),this}setFromAttributeAndIndices(e,t,n,s){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,s),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return nn.subVectors(this.c,this.b),xn.subVectors(this.a,this.b),nn.cross(xn).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return Zt.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return Zt.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,s,r){return Zt.getInterpolation(e,this.a,this.b,this.c,t,n,s,r)}containsPoint(e){return Zt.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return Zt.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const n=this.a,s=this.b,r=this.c;let a,o;Ci.subVectors(s,n),Pi.subVectors(r,n),Ta.subVectors(e,n);const l=Ci.dot(Ta),c=Pi.dot(Ta);if(l<=0&&c<=0)return t.copy(n);Aa.subVectors(e,s);const h=Ci.dot(Aa),d=Pi.dot(Aa);if(h>=0&&d<=h)return t.copy(s);const u=l*d-h*c;if(u<=0&&l>=0&&h<=0)return a=l/(l-h),t.copy(n).addScaledVector(Ci,a);wa.subVectors(e,r);const p=Ci.dot(wa),g=Pi.dot(wa);if(g>=0&&p<=g)return t.copy(r);const v=p*c-l*g;if(v<=0&&c>=0&&g<=0)return o=c/(c-g),t.copy(n).addScaledVector(Pi,o);const m=h*g-p*d;if(m<=0&&d-h>=0&&p-g>=0)return fl.subVectors(r,s),o=(d-h)/(d-h+(p-g)),t.copy(s).addScaledVector(fl,o);const f=1/(m+v+u);return a=v*f,o=u*f,t.copy(n).addScaledVector(Ci,a).addScaledVector(Pi,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}class Mi{constructor(e=new D(1/0,1/0,1/0),t=new D(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(sn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(sn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const n=sn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const n=e.geometry;if(n!==void 0){const r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,sn):sn.fromBufferAttribute(r,a),sn.applyMatrix4(e.matrixWorld),this.expandByPoint(sn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),Ks.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Ks.copy(n.boundingBox)),Ks.applyMatrix4(e.matrixWorld),this.union(Ks)}const s=e.children;for(let r=0,a=s.length;r<a;r++)this.expandByObject(s[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,sn),sn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(ds),Zs.subVectors(this.max,ds),Li.subVectors(e.a,ds),Di.subVectors(e.b,ds),Ii.subVectors(e.c,ds),Un.subVectors(Di,Li),Nn.subVectors(Ii,Di),jn.subVectors(Li,Ii);let t=[0,-Un.z,Un.y,0,-Nn.z,Nn.y,0,-jn.z,jn.y,Un.z,0,-Un.x,Nn.z,0,-Nn.x,jn.z,0,-jn.x,-Un.y,Un.x,0,-Nn.y,Nn.x,0,-jn.y,jn.x,0];return!La(t,Li,Di,Ii,Zs)||(t=[1,0,0,0,1,0,0,0,1],!La(t,Li,Di,Ii,Zs))?!1:(js.crossVectors(Un,Nn),t=[js.x,js.y,js.z],La(t,Li,Di,Ii,Zs))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,sn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(sn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(Mn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Mn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Mn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Mn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Mn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Mn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Mn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Mn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Mn),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}const Mn=[new D,new D,new D,new D,new D,new D,new D,new D],sn=new D,Ks=new Mi,Li=new D,Di=new D,Ii=new D,Un=new D,Nn=new D,jn=new D,ds=new D,Zs=new D,js=new D,Jn=new D;function La(i,e,t,n,s){for(let r=0,a=i.length-3;r<=a;r+=3){Jn.fromArray(i,r);const o=s.x*Math.abs(Jn.x)+s.y*Math.abs(Jn.y)+s.z*Math.abs(Jn.z),l=e.dot(Jn),c=t.dot(Jn),h=n.dot(Jn);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>o)return!1}return!0}const _t=new D,Js=new Fe;let op=0;class Nt{constructor(e,t,n=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:op++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=$o,this.updateRanges=[],this.gpuType=an,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[e+s]=t.array[n+s];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Js.fromBufferAttribute(this,t),Js.applyMatrix3(e),this.setXY(t,Js.x,Js.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)_t.fromBufferAttribute(this,t),_t.applyMatrix3(e),this.setXYZ(t,_t.x,_t.y,_t.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)_t.fromBufferAttribute(this,t),_t.applyMatrix4(e),this.setXYZ(t,_t.x,_t.y,_t.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)_t.fromBufferAttribute(this,t),_t.applyNormalMatrix(e),this.setXYZ(t,_t.x,_t.y,_t.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)_t.fromBufferAttribute(this,t),_t.transformDirection(e),this.setXYZ(t,_t.x,_t.y,_t.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=dn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=ut(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=dn(t,this.array)),t}setX(e,t){return this.normalized&&(t=ut(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=dn(t,this.array)),t}setY(e,t){return this.normalized&&(t=ut(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=dn(t,this.array)),t}setZ(e,t){return this.normalized&&(t=ut(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=dn(t,this.array)),t}setW(e,t){return this.normalized&&(t=ut(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=ut(t,this.array),n=ut(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,s){return e*=this.itemSize,this.normalized&&(t=ut(t,this.array),n=ut(n,this.array),s=ut(s,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e*=this.itemSize,this.normalized&&(t=ut(t,this.array),n=ut(n,this.array),s=ut(s,this.array),r=ut(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=s,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==$o&&(e.usage=this.usage),e}}class oh extends Nt{constructor(e,t,n){super(new Uint16Array(e),t,n)}}class ch extends Nt{constructor(e,t,n){super(new Uint32Array(e),t,n)}}class at extends Nt{constructor(e,t,n){super(new Float32Array(e),t,n)}}const cp=new Mi,fs=new D,Da=new D;class cs{constructor(e=new D,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const n=this.center;t!==void 0?n.copy(t):cp.setFromPoints(e).getCenter(n);let s=0;for(let r=0,a=e.length;r<a;r++)s=Math.max(s,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(s),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;fs.subVectors(e,this.center);const t=fs.lengthSq();if(t>this.radius*this.radius){const n=Math.sqrt(t),s=(n-this.radius)*.5;this.center.addScaledVector(fs,s/n),this.radius+=s}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Da.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(fs.copy(e.center).add(Da)),this.expandByPoint(fs.copy(e.center).sub(Da))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}let lp=0;const Kt=new je,Ia=new xt,Ui=new D,Wt=new Mi,ps=new Mi,bt=new D;class vt extends os{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:lp++}),this.uuid=kn(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(kf(e)?ch:oh)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const r=new Ge().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}const s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(e),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return Kt.makeRotationFromQuaternion(e),this.applyMatrix4(Kt),this}rotateX(e){return Kt.makeRotationX(e),this.applyMatrix4(Kt),this}rotateY(e){return Kt.makeRotationY(e),this.applyMatrix4(Kt),this}rotateZ(e){return Kt.makeRotationZ(e),this.applyMatrix4(Kt),this}translate(e,t,n){return Kt.makeTranslation(e,t,n),this.applyMatrix4(Kt),this}scale(e,t,n){return Kt.makeScale(e,t,n),this.applyMatrix4(Kt),this}lookAt(e){return Ia.lookAt(e),Ia.updateMatrix(),this.applyMatrix4(Ia.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Ui).negate(),this.translate(Ui.x,Ui.y,Ui.z),this}setFromPoints(e){const t=this.getAttribute("position");if(t===void 0){const n=[];for(let s=0,r=e.length;s<r;s++){const a=e[s];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new at(n,3))}else{const n=Math.min(e.length,t.count);for(let s=0;s<n;s++){const r=e[s];t.setXYZ(s,r.x,r.y,r.z||0)}e.length>t.count&&Oe("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Mi);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){et("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new D(-1/0,-1/0,-1/0),new D(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,s=t.length;n<s;n++){const r=t[n];Wt.setFromBufferAttribute(r),this.morphTargetsRelative?(bt.addVectors(this.boundingBox.min,Wt.min),this.boundingBox.expandByPoint(bt),bt.addVectors(this.boundingBox.max,Wt.max),this.boundingBox.expandByPoint(bt)):(this.boundingBox.expandByPoint(Wt.min),this.boundingBox.expandByPoint(Wt.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&et('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new cs);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){et("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new D,1/0);return}if(e){const n=this.boundingSphere.center;if(Wt.setFromBufferAttribute(e),t)for(let r=0,a=t.length;r<a;r++){const o=t[r];ps.setFromBufferAttribute(o),this.morphTargetsRelative?(bt.addVectors(Wt.min,ps.min),Wt.expandByPoint(bt),bt.addVectors(Wt.max,ps.max),Wt.expandByPoint(bt)):(Wt.expandByPoint(ps.min),Wt.expandByPoint(ps.max))}Wt.getCenter(n);let s=0;for(let r=0,a=e.count;r<a;r++)bt.fromBufferAttribute(e,r),s=Math.max(s,n.distanceToSquared(bt));if(t)for(let r=0,a=t.length;r<a;r++){const o=t[r],l=this.morphTargetsRelative;for(let c=0,h=o.count;c<h;c++)bt.fromBufferAttribute(o,c),l&&(Ui.fromBufferAttribute(e,c),bt.add(Ui)),s=Math.max(s,n.distanceToSquared(bt))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&et('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){et("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=t.position,s=t.normal,r=t.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Nt(new Float32Array(4*n.count),4));const a=this.getAttribute("tangent"),o=[],l=[];for(let _=0;_<n.count;_++)o[_]=new D,l[_]=new D;const c=new D,h=new D,d=new D,u=new Fe,p=new Fe,g=new Fe,v=new D,m=new D;function f(_,E,L){c.fromBufferAttribute(n,_),h.fromBufferAttribute(n,E),d.fromBufferAttribute(n,L),u.fromBufferAttribute(r,_),p.fromBufferAttribute(r,E),g.fromBufferAttribute(r,L),h.sub(c),d.sub(c),p.sub(u),g.sub(u);const C=1/(p.x*g.y-g.x*p.y);isFinite(C)&&(v.copy(h).multiplyScalar(g.y).addScaledVector(d,-p.y).multiplyScalar(C),m.copy(d).multiplyScalar(p.x).addScaledVector(h,-g.x).multiplyScalar(C),o[_].add(v),o[E].add(v),o[L].add(v),l[_].add(m),l[E].add(m),l[L].add(m))}let x=this.groups;x.length===0&&(x=[{start:0,count:e.count}]);for(let _=0,E=x.length;_<E;++_){const L=x[_],C=L.start,N=L.count;for(let I=C,z=C+N;I<z;I+=3)f(e.getX(I+0),e.getX(I+1),e.getX(I+2))}const y=new D,S=new D,A=new D,b=new D;function w(_){A.fromBufferAttribute(s,_),b.copy(A);const E=o[_];y.copy(E),y.sub(A.multiplyScalar(A.dot(E))).normalize(),S.crossVectors(b,E);const C=S.dot(l[_])<0?-1:1;a.setXYZW(_,y.x,y.y,y.z,C)}for(let _=0,E=x.length;_<E;++_){const L=x[_],C=L.start,N=L.count;for(let I=C,z=C+N;I<z;I+=3)w(e.getX(I+0)),w(e.getX(I+1)),w(e.getX(I+2))}}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Nt(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let u=0,p=n.count;u<p;u++)n.setXYZ(u,0,0,0);const s=new D,r=new D,a=new D,o=new D,l=new D,c=new D,h=new D,d=new D;if(e)for(let u=0,p=e.count;u<p;u+=3){const g=e.getX(u+0),v=e.getX(u+1),m=e.getX(u+2);s.fromBufferAttribute(t,g),r.fromBufferAttribute(t,v),a.fromBufferAttribute(t,m),h.subVectors(a,r),d.subVectors(s,r),h.cross(d),o.fromBufferAttribute(n,g),l.fromBufferAttribute(n,v),c.fromBufferAttribute(n,m),o.add(h),l.add(h),c.add(h),n.setXYZ(g,o.x,o.y,o.z),n.setXYZ(v,l.x,l.y,l.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let u=0,p=t.count;u<p;u+=3)s.fromBufferAttribute(t,u+0),r.fromBufferAttribute(t,u+1),a.fromBufferAttribute(t,u+2),h.subVectors(a,r),d.subVectors(s,r),h.cross(d),n.setXYZ(u+0,h.x,h.y,h.z),n.setXYZ(u+1,h.x,h.y,h.z),n.setXYZ(u+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)bt.fromBufferAttribute(e,t),bt.normalize(),e.setXYZ(t,bt.x,bt.y,bt.z)}toNonIndexed(){function e(o,l){const c=o.array,h=o.itemSize,d=o.normalized,u=new c.constructor(l.length*h);let p=0,g=0;for(let v=0,m=l.length;v<m;v++){o.isInterleavedBufferAttribute?p=l[v]*o.data.stride+o.offset:p=l[v]*h;for(let f=0;f<h;f++)u[g++]=c[p++]}return new Nt(u,h,d)}if(this.index===null)return Oe("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const t=new vt,n=this.index.array,s=this.attributes;for(const o in s){const l=s[o],c=e(l,n);t.setAttribute(o,c)}const r=this.morphAttributes;for(const o in r){const l=[],c=r[o];for(let h=0,d=c.length;h<d;h++){const u=c[h],p=e(u,n);l.push(p)}t.morphAttributes[o]=l}t.morphTargetsRelative=this.morphTargetsRelative;const a=this.groups;for(let o=0,l=a.length;o<l;o++){const c=a[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){const e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const n=this.attributes;for(const l in n){const c=n[l];e.data.attributes[l]=c.toJSON(e.data)}const s={};let r=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],h=[];for(let d=0,u=c.length;d<u;d++){const p=c[d];h.push(p.toJSON(e.data))}h.length>0&&(s[l]=h,r=!0)}r&&(e.data.morphAttributes=s,e.data.morphTargetsRelative=this.morphTargetsRelative);const a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));const o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const n=e.index;n!==null&&this.setIndex(n.clone());const s=e.attributes;for(const c in s){const h=s[c];this.setAttribute(c,h.clone(t))}const r=e.morphAttributes;for(const c in r){const h=[],d=r[c];for(let u=0,p=d.length;u<p;u++)h.push(d[u].clone(t));this.morphAttributes[c]=h}this.morphTargetsRelative=e.morphTargetsRelative;const a=e.groups;for(let c=0,h=a.length;c<h;c++){const d=a[c];this.addGroup(d.start,d.count,d.materialIndex)}const o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());const l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}}class up{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=$o,this.updateRanges=[],this.version=0,this.uuid=kn()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let s=0,r=this.stride;s<r;s++)this.array[e+s]=t.array[n+s];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=kn()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=kn()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}}const Ft=new D;class Gr{constructor(e,t,n,s=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=s}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)Ft.fromBufferAttribute(this,t),Ft.applyMatrix4(e),this.setXYZ(t,Ft.x,Ft.y,Ft.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Ft.fromBufferAttribute(this,t),Ft.applyNormalMatrix(e),this.setXYZ(t,Ft.x,Ft.y,Ft.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Ft.fromBufferAttribute(this,t),Ft.transformDirection(e),this.setXYZ(t,Ft.x,Ft.y,Ft.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=dn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=ut(n,this.array)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=ut(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=ut(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=ut(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=ut(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=dn(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=dn(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=dn(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=dn(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=ut(t,this.array),n=ut(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,s){return e=e*this.data.stride+this.offset,this.normalized&&(t=ut(t,this.array),n=ut(n,this.array),s=ut(s,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=s,this}setXYZW(e,t,n,s,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=ut(t,this.array),n=ut(n,this.array),s=ut(s,this.array),r=ut(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=s,this.data.array[e+3]=r,this}clone(e){if(e===void 0){Br("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let n=0;n<this.count;n++){const s=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[s+r])}return new Nt(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new Gr(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){Br("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let n=0;n<this.count;n++){const s=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[s+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}let hp=0;class Si extends os{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:hp++}),this.uuid=kn(),this.name="",this.type="Material",this.blending=Ki,this.side=Yn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=ro,this.blendDst=ao,this.blendEquation=ri,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Ne(0,0,0),this.blendAlpha=0,this.depthFunc=Ji,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=el,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=bi,this.stencilZFail=bi,this.stencilZPass=bi,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const n=e[t];if(n===void 0){Oe(`Material: parameter '${t}' has value of undefined.`);continue}const s=this[t];if(s===void 0){Oe(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==Ki&&(n.blending=this.blending),this.side!==Yn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==ro&&(n.blendSrc=this.blendSrc),this.blendDst!==ao&&(n.blendDst=this.blendDst),this.blendEquation!==ri&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==Ji&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==el&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==bi&&(n.stencilFail=this.stencilFail),this.stencilZFail!==bi&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==bi&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){const a=[];for(const o in r){const l=r[o];delete l.metadata,a.push(l)}return a}if(t){const r=s(e.textures),a=s(e.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let n=null;if(t!==null){const s=t.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}}class lh extends Si{constructor(e){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new Ne(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}let Ni;const ms=new D,Fi=new D,Oi=new D,Bi=new Fe,gs=new Fe,uh=new je,Qs=new D,_s=new D,er=new D,pl=new Fe,Ua=new Fe,ml=new Fe;class dp extends xt{constructor(e=new lh){if(super(),this.isSprite=!0,this.type="Sprite",Ni===void 0){Ni=new vt;const t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new up(t,5);Ni.setIndex([0,1,2,0,2,3]),Ni.setAttribute("position",new Gr(n,3,0,!1)),Ni.setAttribute("uv",new Gr(n,2,3,!1))}this.geometry=Ni,this.material=e,this.center=new Fe(.5,.5),this.count=1}raycast(e,t){e.camera===null&&et('Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),Fi.setFromMatrixScale(this.matrixWorld),uh.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),Oi.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&Fi.multiplyScalar(-Oi.z);const n=this.material.rotation;let s,r;n!==0&&(r=Math.cos(n),s=Math.sin(n));const a=this.center;tr(Qs.set(-.5,-.5,0),Oi,a,Fi,s,r),tr(_s.set(.5,-.5,0),Oi,a,Fi,s,r),tr(er.set(.5,.5,0),Oi,a,Fi,s,r),pl.set(0,0),Ua.set(1,0),ml.set(1,1);let o=e.ray.intersectTriangle(Qs,_s,er,!1,ms);if(o===null&&(tr(_s.set(-.5,.5,0),Oi,a,Fi,s,r),Ua.set(0,1),o=e.ray.intersectTriangle(Qs,er,_s,!1,ms),o===null))return;const l=e.ray.origin.distanceTo(ms);l<e.near||l>e.far||t.push({distance:l,point:ms.clone(),uv:Zt.getInterpolation(ms,Qs,_s,er,pl,Ua,ml,new Fe),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}}function tr(i,e,t,n,s,r){Bi.subVectors(i,t).addScalar(.5).multiply(n),s!==void 0?(gs.x=r*Bi.x-s*Bi.y,gs.y=s*Bi.x+r*Bi.y):gs.copy(Bi),i.copy(e),i.x+=gs.x,i.y+=gs.y,i.applyMatrix4(uh)}const Sn=new D,Na=new D,nr=new D,Fn=new D,Fa=new D,ir=new D,Oa=new D;class hh{constructor(e=new D,t=new D(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Sn)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=Sn.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Sn.copy(this.origin).addScaledVector(this.direction,t),Sn.distanceToSquared(e))}distanceSqToSegment(e,t,n,s){Na.copy(e).add(t).multiplyScalar(.5),nr.copy(t).sub(e).normalize(),Fn.copy(this.origin).sub(Na);const r=e.distanceTo(t)*.5,a=-this.direction.dot(nr),o=Fn.dot(this.direction),l=-Fn.dot(nr),c=Fn.lengthSq(),h=Math.abs(1-a*a);let d,u,p,g;if(h>0)if(d=a*l-o,u=a*o-l,g=r*h,d>=0)if(u>=-g)if(u<=g){const v=1/h;d*=v,u*=v,p=d*(d+a*u+2*o)+u*(a*d+u+2*l)+c}else u=r,d=Math.max(0,-(a*u+o)),p=-d*d+u*(u+2*l)+c;else u=-r,d=Math.max(0,-(a*u+o)),p=-d*d+u*(u+2*l)+c;else u<=-g?(d=Math.max(0,-(-a*r+o)),u=d>0?-r:Math.min(Math.max(-r,-l),r),p=-d*d+u*(u+2*l)+c):u<=g?(d=0,u=Math.min(Math.max(-r,-l),r),p=u*(u+2*l)+c):(d=Math.max(0,-(a*r+o)),u=d>0?r:Math.min(Math.max(-r,-l),r),p=-d*d+u*(u+2*l)+c);else u=a>0?-r:r,d=Math.max(0,-(a*u+o)),p=-d*d+u*(u+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,d),s&&s.copy(Na).addScaledVector(nr,u),p}intersectSphere(e,t){Sn.subVectors(e.center,this.origin);const n=Sn.dot(this.direction),s=Sn.dot(Sn)-n*n,r=e.radius*e.radius;if(s>r)return null;const a=Math.sqrt(r-s),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){const n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,s,r,a,o,l;const c=1/this.direction.x,h=1/this.direction.y,d=1/this.direction.z,u=this.origin;return c>=0?(n=(e.min.x-u.x)*c,s=(e.max.x-u.x)*c):(n=(e.max.x-u.x)*c,s=(e.min.x-u.x)*c),h>=0?(r=(e.min.y-u.y)*h,a=(e.max.y-u.y)*h):(r=(e.max.y-u.y)*h,a=(e.min.y-u.y)*h),n>a||r>s||((r>n||isNaN(n))&&(n=r),(a<s||isNaN(s))&&(s=a),d>=0?(o=(e.min.z-u.z)*d,l=(e.max.z-u.z)*d):(o=(e.max.z-u.z)*d,l=(e.min.z-u.z)*d),n>l||o>s)||((o>n||n!==n)&&(n=o),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,t)}intersectsBox(e){return this.intersectBox(e,Sn)!==null}intersectTriangle(e,t,n,s,r){Fa.subVectors(t,e),ir.subVectors(n,e),Oa.crossVectors(Fa,ir);let a=this.direction.dot(Oa),o;if(a>0){if(s)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Fn.subVectors(this.origin,e);const l=o*this.direction.dot(ir.crossVectors(Fn,ir));if(l<0)return null;const c=o*this.direction.dot(Fa.cross(Fn));if(c<0||l+c>a)return null;const h=-o*Fn.dot(Oa);return h<0?null:this.at(h/a,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class dh extends Si{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Ne(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Bt,this.combine=ku,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const gl=new je,Qn=new hh,sr=new cs,_l=new D,rr=new D,ar=new D,or=new D,Ba=new D,cr=new D,xl=new D,lr=new D;class Ie extends xt{constructor(e=new vt,t=new dh){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){const o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(e,t){const n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(s,e);const o=this.morphTargetInfluences;if(r&&o){cr.set(0,0,0);for(let l=0,c=r.length;l<c;l++){const h=o[l],d=r[l];h!==0&&(Ba.fromBufferAttribute(d,e),a?cr.addScaledVector(Ba,h):cr.addScaledVector(Ba.sub(t),h))}t.add(cr)}return t}raycast(e,t){const n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),sr.copy(n.boundingSphere),sr.applyMatrix4(r),Qn.copy(e.ray).recast(e.near),!(sr.containsPoint(Qn.origin)===!1&&(Qn.intersectSphere(sr,_l)===null||Qn.origin.distanceToSquared(_l)>(e.far-e.near)**2))&&(gl.copy(r).invert(),Qn.copy(e.ray).applyMatrix4(gl),!(n.boundingBox!==null&&Qn.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,Qn)))}_computeIntersections(e,t,n){let s;const r=this.geometry,a=this.material,o=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,d=r.attributes.normal,u=r.groups,p=r.drawRange;if(o!==null)if(Array.isArray(a))for(let g=0,v=u.length;g<v;g++){const m=u[g],f=a[m.materialIndex],x=Math.max(m.start,p.start),y=Math.min(o.count,Math.min(m.start+m.count,p.start+p.count));for(let S=x,A=y;S<A;S+=3){const b=o.getX(S),w=o.getX(S+1),_=o.getX(S+2);s=ur(this,f,e,n,c,h,d,b,w,_),s&&(s.faceIndex=Math.floor(S/3),s.face.materialIndex=m.materialIndex,t.push(s))}}else{const g=Math.max(0,p.start),v=Math.min(o.count,p.start+p.count);for(let m=g,f=v;m<f;m+=3){const x=o.getX(m),y=o.getX(m+1),S=o.getX(m+2);s=ur(this,a,e,n,c,h,d,x,y,S),s&&(s.faceIndex=Math.floor(m/3),t.push(s))}}else if(l!==void 0)if(Array.isArray(a))for(let g=0,v=u.length;g<v;g++){const m=u[g],f=a[m.materialIndex],x=Math.max(m.start,p.start),y=Math.min(l.count,Math.min(m.start+m.count,p.start+p.count));for(let S=x,A=y;S<A;S+=3){const b=S,w=S+1,_=S+2;s=ur(this,f,e,n,c,h,d,b,w,_),s&&(s.faceIndex=Math.floor(S/3),s.face.materialIndex=m.materialIndex,t.push(s))}}else{const g=Math.max(0,p.start),v=Math.min(l.count,p.start+p.count);for(let m=g,f=v;m<f;m+=3){const x=m,y=m+1,S=m+2;s=ur(this,a,e,n,c,h,d,x,y,S),s&&(s.faceIndex=Math.floor(m/3),t.push(s))}}}}function fp(i,e,t,n,s,r,a,o){let l;if(e.side===It?l=n.intersectTriangle(a,r,s,!0,o):l=n.intersectTriangle(s,r,a,e.side===Yn,o),l===null)return null;lr.copy(o),lr.applyMatrix4(i.matrixWorld);const c=t.ray.origin.distanceTo(lr);return c<t.near||c>t.far?null:{distance:c,point:lr.clone(),object:i}}function ur(i,e,t,n,s,r,a,o,l,c){i.getVertexPosition(o,rr),i.getVertexPosition(l,ar),i.getVertexPosition(c,or);const h=fp(i,e,t,n,rr,ar,or,xl);if(h){const d=new D;Zt.getBarycoord(xl,rr,ar,or,d),s&&(h.uv=Zt.getInterpolatedAttribute(s,o,l,c,d,new Fe)),r&&(h.uv1=Zt.getInterpolatedAttribute(r,o,l,c,d,new Fe)),a&&(h.normal=Zt.getInterpolatedAttribute(a,o,l,c,d,new D),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));const u={a:o,b:l,c,normal:new D,materialIndex:0};Zt.getNormal(rr,ar,or,u.normal),h.face=u,h.barycoord=d}return h}class Ec extends Ut{constructor(e=null,t=1,n=1,s,r,a,o,l,c=Rt,h=Rt,d,u){super(null,a,o,l,c,h,s,r,d,u),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class vl extends Nt{constructor(e,t,n,s=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=s}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){const e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}const zi=new je,Ml=new je,hr=[],Sl=new Mi,pp=new je,xs=new Ie,vs=new cs;class ft extends Ie{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new vl(new Float32Array(n*16),16),this.previousInstanceMatrix=null,this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let s=0;s<n;s++)this.setMatrixAt(s,pp)}computeBoundingBox(){const e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new Mi),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,zi),Sl.copy(e.boundingBox).applyMatrix4(zi),this.boundingBox.union(Sl)}computeBoundingSphere(){const e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new cs),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,zi),vs.copy(e.boundingSphere).applyMatrix4(zi),this.boundingSphere.union(vs)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.previousInstanceMatrix!==null&&(this.previousInstanceMatrix=e.previousInstanceMatrix.clone()),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){const n=t.morphTargetInfluences,s=this.morphTexture.source.data.data,r=n.length+1,a=e*r+1;for(let o=0;o<n.length;o++)n[o]=s[a+o]}raycast(e,t){const n=this.matrixWorld,s=this.count;if(xs.geometry=this.geometry,xs.material=this.material,xs.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),vs.copy(this.boundingSphere),vs.applyMatrix4(n),e.ray.intersectsSphere(vs)!==!1))for(let r=0;r<s;r++){this.getMatrixAt(r,zi),Ml.multiplyMatrices(n,zi),xs.matrixWorld=Ml,xs.raycast(e,hr);for(let a=0,o=hr.length;a<o;a++){const l=hr[a];l.instanceId=r,l.object=this,t.push(l)}hr.length=0}}setColorAt(e,t){this.instanceColor===null&&(this.instanceColor=new vl(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3)}setMatrixAt(e,t){t.toArray(this.instanceMatrix.array,e*16)}setMorphAt(e,t){const n=t.morphTargetInfluences,s=n.length+1;this.morphTexture===null&&(this.morphTexture=new Ec(new Float32Array(s*this.count),s,this.count,pc,an));const r=this.morphTexture.source.data.data;let a=0;for(let c=0;c<n.length;c++)a+=n[c];const o=this.geometry.morphTargetsRelative?1:1-a,l=s*e;r[l]=o,r.set(n,l+1)}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const za=new D,mp=new D,gp=new Ge;class si{constructor(e=new D(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,s){return this.normal.set(e,t,n),this.constant=s,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){const s=za.subVectors(n,t).cross(mp.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(s,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){const n=e.delta(za),s=this.normal.dot(n);if(s===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const r=-(e.start.dot(this.normal)+this.constant)/s;return r<0||r>1?null:t.copy(e.start).addScaledVector(n,r)}intersectsLine(e){const t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const n=t||gp.getNormalMatrix(e),s=this.coplanarPoint(za).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}}const ei=new cs,_p=new Fe(.5,.5),dr=new D;class yc{constructor(e=new si,t=new si,n=new si,s=new si,r=new si,a=new si){this.planes=[e,t,n,s,r,a]}set(e,t,n,s,r,a){const o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(s),o[4].copy(r),o[5].copy(a),this}copy(e){const t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=fn,n=!1){const s=this.planes,r=e.elements,a=r[0],o=r[1],l=r[2],c=r[3],h=r[4],d=r[5],u=r[6],p=r[7],g=r[8],v=r[9],m=r[10],f=r[11],x=r[12],y=r[13],S=r[14],A=r[15];if(s[0].setComponents(c-a,p-h,f-g,A-x).normalize(),s[1].setComponents(c+a,p+h,f+g,A+x).normalize(),s[2].setComponents(c+o,p+d,f+v,A+y).normalize(),s[3].setComponents(c-o,p-d,f-v,A-y).normalize(),n)s[4].setComponents(l,u,m,S).normalize(),s[5].setComponents(c-l,p-u,f-m,A-S).normalize();else if(s[4].setComponents(c-l,p-u,f-m,A-S).normalize(),t===fn)s[5].setComponents(c+l,p+u,f+m,A+S).normalize();else if(t===Us)s[5].setComponents(l,u,m,S).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),ei.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),ei.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(ei)}intersectsSprite(e){ei.center.set(0,0,0);const t=_p.distanceTo(e.center);return ei.radius=.7071067811865476+t,ei.applyMatrix4(e.matrixWorld),this.intersectsSphere(ei)}intersectsSphere(e){const t=this.planes,n=e.center,s=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(e){const t=this.planes;for(let n=0;n<6;n++){const s=t[n];if(dr.x=s.normal.x>0?e.max.x:e.min.x,dr.y=s.normal.y>0?e.max.y:e.min.y,dr.z=s.normal.z>0?e.max.z:e.min.z,s.distanceToPoint(dr)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class fh extends Si{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Ne(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}const El=new je,Zo=new hh,fr=new cs,pr=new D;class xp extends xt{constructor(e=new vt,t=new fh){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){const n=this.geometry,s=this.matrixWorld,r=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),fr.copy(n.boundingSphere),fr.applyMatrix4(s),fr.radius+=r,e.ray.intersectsSphere(fr)===!1)return;El.copy(s).invert(),Zo.copy(e.ray).applyMatrix4(El);const o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,d=n.attributes.position;if(c!==null){const u=Math.max(0,a.start),p=Math.min(c.count,a.start+a.count);for(let g=u,v=p;g<v;g++){const m=c.getX(g);pr.fromBufferAttribute(d,m),yl(pr,m,l,s,e,t,this)}}else{const u=Math.max(0,a.start),p=Math.min(d.count,a.start+a.count);for(let g=u,v=p;g<v;g++)pr.fromBufferAttribute(d,g),yl(pr,g,l,s,e,t,this)}}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const s=t[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){const o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function yl(i,e,t,n,s,r,a){const o=Zo.distanceSqToPoint(i);if(o<t){const l=new D;Zo.closestPointToPoint(i,l),l.applyMatrix4(n);const c=s.ray.origin.distanceTo(l);if(c<s.near||c>s.far)return;r.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:e,face:null,faceIndex:null,barycoord:null,object:a})}}class ph extends Ut{constructor(e=[],t=pi,n,s,r,a,o,l,c,h){super(e,t,n,s,r,a,o,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class Kr extends Ut{constructor(e,t,n,s,r,a,o,l,c){super(e,t,n,s,r,a,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}}class Ns extends Ut{constructor(e,t,n=gn,s,r,a,o=Rt,l=Rt,c,h=Cn,d=1){if(h!==Cn&&h!==li)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const u={width:e,height:t,depth:d};super(u,s,r,a,o,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Mc(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}}class vp extends Ns{constructor(e,t=gn,n=pi,s,r,a=Rt,o=Rt,l,c=Cn){const h={width:e,height:e,depth:1},d=[h,h,h,h,h,h];super(e,e,t,n,s,r,a,o,l,c),this.image=d,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}}class mh extends Ut{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}}class We extends vt{constructor(e=1,t=1,n=1,s=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:s,heightSegments:r,depthSegments:a};const o=this;s=Math.floor(s),r=Math.floor(r),a=Math.floor(a);const l=[],c=[],h=[],d=[];let u=0,p=0;g("z","y","x",-1,-1,n,t,e,a,r,0),g("z","y","x",1,-1,n,t,-e,a,r,1),g("x","z","y",1,1,e,n,t,s,a,2),g("x","z","y",1,-1,e,n,-t,s,a,3),g("x","y","z",1,-1,e,t,n,s,r,4),g("x","y","z",-1,-1,e,t,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new at(c,3)),this.setAttribute("normal",new at(h,3)),this.setAttribute("uv",new at(d,2));function g(v,m,f,x,y,S,A,b,w,_,E){const L=S/w,C=A/_,N=S/2,I=A/2,z=b/2,F=w+1,O=_+1;let H=0,K=0;const Z=new D;for(let ne=0;ne<O;ne++){const le=ne*C-I;for(let ae=0;ae<F;ae++){const Re=ae*L-N;Z[v]=Re*x,Z[m]=le*y,Z[f]=z,c.push(Z.x,Z.y,Z.z),Z[v]=0,Z[m]=0,Z[f]=b>0?1:-1,h.push(Z.x,Z.y,Z.z),d.push(ae/w),d.push(1-ne/_),H+=1}}for(let ne=0;ne<_;ne++)for(let le=0;le<w;le++){const ae=u+le+F*ne,Re=u+le+F*(ne+1),De=u+(le+1)+F*(ne+1),Ye=u+(le+1)+F*ne;l.push(ae,Re,Ye),l.push(Re,De,Ye),K+=6}o.addGroup(p,K,E),p+=K,u+=H}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new We(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}class bc extends vt{constructor(e=1,t=1,n=4,s=8,r=1){super(),this.type="CapsuleGeometry",this.parameters={radius:e,height:t,capSegments:n,radialSegments:s,heightSegments:r},t=Math.max(0,t),n=Math.max(1,Math.floor(n)),s=Math.max(3,Math.floor(s)),r=Math.max(1,Math.floor(r));const a=[],o=[],l=[],c=[],h=t/2,d=Math.PI/2*e,u=t,p=2*d+u,g=n*2+r,v=s+1,m=new D,f=new D;for(let x=0;x<=g;x++){let y=0,S=0,A=0,b=0;if(x<=n){const E=x/n,L=E*Math.PI/2;S=-h-e*Math.cos(L),A=e*Math.sin(L),b=-e*Math.cos(L),y=E*d}else if(x<=n+r){const E=(x-n)/r;S=-h+E*t,A=e,b=0,y=d+E*u}else{const E=(x-n-r)/n,L=E*Math.PI/2;S=h+e*Math.sin(L),A=e*Math.cos(L),b=e*Math.sin(L),y=d+u+E*d}const w=Math.max(0,Math.min(1,y/p));let _=0;x===0?_=.5/s:x===g&&(_=-.5/s);for(let E=0;E<=s;E++){const L=E/s,C=L*Math.PI*2,N=Math.sin(C),I=Math.cos(C);f.x=-A*I,f.y=S,f.z=A*N,o.push(f.x,f.y,f.z),m.set(-A*I,b,A*N),m.normalize(),l.push(m.x,m.y,m.z),c.push(L+_,w)}if(x>0){const E=(x-1)*v;for(let L=0;L<s;L++){const C=E+L,N=E+L+1,I=x*v+L,z=x*v+L+1;a.push(C,N,I),a.push(N,z,I)}}}this.setIndex(a),this.setAttribute("position",new at(o,3)),this.setAttribute("normal",new at(l,3)),this.setAttribute("uv",new at(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new bc(e.radius,e.height,e.capSegments,e.radialSegments,e.heightSegments)}}class ns extends vt{constructor(e=1,t=32,n=0,s=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:s},t=Math.max(3,t);const r=[],a=[],o=[],l=[],c=new D,h=new Fe;a.push(0,0,0),o.push(0,0,1),l.push(.5,.5);for(let d=0,u=3;d<=t;d++,u+=3){const p=n+d/t*s;c.x=e*Math.cos(p),c.y=e*Math.sin(p),a.push(c.x,c.y,c.z),o.push(0,0,1),h.x=(a[u]/e+1)/2,h.y=(a[u+1]/e+1)/2,l.push(h.x,h.y)}for(let d=1;d<=t;d++)r.push(d,d+1,0);this.setIndex(r),this.setAttribute("position",new at(a,3)),this.setAttribute("normal",new at(o,3)),this.setAttribute("uv",new at(l,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ns(e.radius,e.segments,e.thetaStart,e.thetaLength)}}class Vn extends vt{constructor(e=1,t=1,n=1,s=32,r=1,a=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:s,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:l};const c=this;s=Math.floor(s),r=Math.floor(r);const h=[],d=[],u=[],p=[];let g=0;const v=[],m=n/2;let f=0;x(),a===!1&&(e>0&&y(!0),t>0&&y(!1)),this.setIndex(h),this.setAttribute("position",new at(d,3)),this.setAttribute("normal",new at(u,3)),this.setAttribute("uv",new at(p,2));function x(){const S=new D,A=new D;let b=0;const w=(t-e)/n;for(let _=0;_<=r;_++){const E=[],L=_/r,C=L*(t-e)+e;for(let N=0;N<=s;N++){const I=N/s,z=I*l+o,F=Math.sin(z),O=Math.cos(z);A.x=C*F,A.y=-L*n+m,A.z=C*O,d.push(A.x,A.y,A.z),S.set(F,w,O).normalize(),u.push(S.x,S.y,S.z),p.push(I,1-L),E.push(g++)}v.push(E)}for(let _=0;_<s;_++)for(let E=0;E<r;E++){const L=v[E][_],C=v[E+1][_],N=v[E+1][_+1],I=v[E][_+1];(e>0||E!==0)&&(h.push(L,C,I),b+=3),(t>0||E!==r-1)&&(h.push(C,N,I),b+=3)}c.addGroup(f,b,0),f+=b}function y(S){const A=g,b=new Fe,w=new D;let _=0;const E=S===!0?e:t,L=S===!0?1:-1;for(let N=1;N<=s;N++)d.push(0,m*L,0),u.push(0,L,0),p.push(.5,.5),g++;const C=g;for(let N=0;N<=s;N++){const z=N/s*l+o,F=Math.cos(z),O=Math.sin(z);w.x=E*O,w.y=m*L,w.z=E*F,d.push(w.x,w.y,w.z),u.push(0,L,0),b.x=F*.5+.5,b.y=O*.5*L+.5,p.push(b.x,b.y),g++}for(let N=0;N<s;N++){const I=A+N,z=C+N;S===!0?h.push(z,z+1,I):h.push(z+1,z,I),_+=3}c.addGroup(f,_,S===!0?1:2),f+=_}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Vn(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class Tc extends vt{constructor(e=[],t=[],n=1,s=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:n,detail:s};const r=[],a=[];o(s),c(n),h(),this.setAttribute("position",new at(r,3)),this.setAttribute("normal",new at(r.slice(),3)),this.setAttribute("uv",new at(a,2)),s===0?this.computeVertexNormals():this.normalizeNormals();function o(x){const y=new D,S=new D,A=new D;for(let b=0;b<t.length;b+=3)p(t[b+0],y),p(t[b+1],S),p(t[b+2],A),l(y,S,A,x)}function l(x,y,S,A){const b=A+1,w=[];for(let _=0;_<=b;_++){w[_]=[];const E=x.clone().lerp(S,_/b),L=y.clone().lerp(S,_/b),C=b-_;for(let N=0;N<=C;N++)N===0&&_===b?w[_][N]=E:w[_][N]=E.clone().lerp(L,N/C)}for(let _=0;_<b;_++)for(let E=0;E<2*(b-_)-1;E++){const L=Math.floor(E/2);E%2===0?(u(w[_][L+1]),u(w[_+1][L]),u(w[_][L])):(u(w[_][L+1]),u(w[_+1][L+1]),u(w[_+1][L]))}}function c(x){const y=new D;for(let S=0;S<r.length;S+=3)y.x=r[S+0],y.y=r[S+1],y.z=r[S+2],y.normalize().multiplyScalar(x),r[S+0]=y.x,r[S+1]=y.y,r[S+2]=y.z}function h(){const x=new D;for(let y=0;y<r.length;y+=3){x.x=r[y+0],x.y=r[y+1],x.z=r[y+2];const S=m(x)/2/Math.PI+.5,A=f(x)/Math.PI+.5;a.push(S,1-A)}g(),d()}function d(){for(let x=0;x<a.length;x+=6){const y=a[x+0],S=a[x+2],A=a[x+4],b=Math.max(y,S,A),w=Math.min(y,S,A);b>.9&&w<.1&&(y<.2&&(a[x+0]+=1),S<.2&&(a[x+2]+=1),A<.2&&(a[x+4]+=1))}}function u(x){r.push(x.x,x.y,x.z)}function p(x,y){const S=x*3;y.x=e[S+0],y.y=e[S+1],y.z=e[S+2]}function g(){const x=new D,y=new D,S=new D,A=new D,b=new Fe,w=new Fe,_=new Fe;for(let E=0,L=0;E<r.length;E+=9,L+=6){x.set(r[E+0],r[E+1],r[E+2]),y.set(r[E+3],r[E+4],r[E+5]),S.set(r[E+6],r[E+7],r[E+8]),b.set(a[L+0],a[L+1]),w.set(a[L+2],a[L+3]),_.set(a[L+4],a[L+5]),A.copy(x).add(y).add(S).divideScalar(3);const C=m(A);v(b,L+0,x,C),v(w,L+2,y,C),v(_,L+4,S,C)}}function v(x,y,S,A){A<0&&x.x===1&&(a[y]=x.x-1),S.x===0&&S.z===0&&(a[y]=A/2/Math.PI+.5)}function m(x){return Math.atan2(x.z,-x.x)}function f(x){return Math.atan2(-x.y,Math.sqrt(x.x*x.x+x.z*x.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Tc(e.vertices,e.indices,e.radius,e.detail)}}class Zr extends Tc{constructor(e=1,t=0){const n=(1+Math.sqrt(5))/2,s=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(s,r,e,t),this.type="IcosahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new Zr(e.radius,e.detail)}}class ls extends vt{constructor(e=1,t=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:s};const r=e/2,a=t/2,o=Math.floor(n),l=Math.floor(s),c=o+1,h=l+1,d=e/o,u=t/l,p=[],g=[],v=[],m=[];for(let f=0;f<h;f++){const x=f*u-a;for(let y=0;y<c;y++){const S=y*d-r;g.push(S,-x,0),v.push(0,0,1),m.push(y/o),m.push(1-f/l)}}for(let f=0;f<l;f++)for(let x=0;x<o;x++){const y=x+c*f,S=x+c*(f+1),A=x+1+c*(f+1),b=x+1+c*f;p.push(y,S,b),p.push(S,A,b)}this.setIndex(p),this.setAttribute("position",new at(g,3)),this.setAttribute("normal",new at(v,3)),this.setAttribute("uv",new at(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ls(e.width,e.height,e.widthSegments,e.heightSegments)}}class jr extends vt{constructor(e=.5,t=1,n=32,s=1,r=0,a=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:e,outerRadius:t,thetaSegments:n,phiSegments:s,thetaStart:r,thetaLength:a},n=Math.max(3,n),s=Math.max(1,s);const o=[],l=[],c=[],h=[];let d=e;const u=(t-e)/s,p=new D,g=new Fe;for(let v=0;v<=s;v++){for(let m=0;m<=n;m++){const f=r+m/n*a;p.x=d*Math.cos(f),p.y=d*Math.sin(f),l.push(p.x,p.y,p.z),c.push(0,0,1),g.x=(p.x/t+1)/2,g.y=(p.y/t+1)/2,h.push(g.x,g.y)}d+=u}for(let v=0;v<s;v++){const m=v*(n+1);for(let f=0;f<n;f++){const x=f+m,y=x,S=x+n+1,A=x+n+2,b=x+1;o.push(y,S,b),o.push(S,A,b)}}this.setIndex(o),this.setAttribute("position",new at(l,3)),this.setAttribute("normal",new at(c,3)),this.setAttribute("uv",new at(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new jr(e.innerRadius,e.outerRadius,e.thetaSegments,e.phiSegments,e.thetaStart,e.thetaLength)}}class Gs extends vt{constructor(e=1,t=32,n=16,s=0,r=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:s,phiLength:r,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));const l=Math.min(a+o,Math.PI);let c=0;const h=[],d=new D,u=new D,p=[],g=[],v=[],m=[];for(let f=0;f<=n;f++){const x=[],y=f/n;let S=0;f===0&&a===0?S=.5/t:f===n&&l===Math.PI&&(S=-.5/t);for(let A=0;A<=t;A++){const b=A/t;d.x=-e*Math.cos(s+b*r)*Math.sin(a+y*o),d.y=e*Math.cos(a+y*o),d.z=e*Math.sin(s+b*r)*Math.sin(a+y*o),g.push(d.x,d.y,d.z),u.copy(d).normalize(),v.push(u.x,u.y,u.z),m.push(b+S,1-y),x.push(c++)}h.push(x)}for(let f=0;f<n;f++)for(let x=0;x<t;x++){const y=h[f][x+1],S=h[f][x],A=h[f+1][x],b=h[f+1][x+1];(f!==0||a>0)&&p.push(y,S,b),(f!==n-1||l<Math.PI)&&p.push(S,A,b)}this.setIndex(p),this.setAttribute("position",new at(g,3)),this.setAttribute("normal",new at(v,3)),this.setAttribute("uv",new at(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Gs(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}}class Ac extends vt{constructor(e=1,t=.4,n=12,s=48,r=Math.PI*2,a=0,o=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:s,arc:r,thetaStart:a,thetaLength:o},n=Math.floor(n),s=Math.floor(s);const l=[],c=[],h=[],d=[],u=new D,p=new D,g=new D;for(let v=0;v<=n;v++){const m=a+v/n*o;for(let f=0;f<=s;f++){const x=f/s*r;p.x=(e+t*Math.cos(m))*Math.cos(x),p.y=(e+t*Math.cos(m))*Math.sin(x),p.z=t*Math.sin(m),c.push(p.x,p.y,p.z),u.x=e*Math.cos(x),u.y=e*Math.sin(x),g.subVectors(p,u).normalize(),h.push(g.x,g.y,g.z),d.push(f/s),d.push(v/n)}}for(let v=1;v<=n;v++)for(let m=1;m<=s;m++){const f=(s+1)*v+m-1,x=(s+1)*(v-1)+m-1,y=(s+1)*(v-1)+m,S=(s+1)*v+m;l.push(f,x,S),l.push(x,y,S)}this.setIndex(l),this.setAttribute("position",new at(c,3)),this.setAttribute("normal",new at(h,3)),this.setAttribute("uv",new at(d,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Ac(e.radius,e.tube,e.radialSegments,e.tubularSegments,e.arc)}}function is(i){const e={};for(const t in i){e[t]={};for(const n in i[t]){const s=i[t][n];s&&(s.isColor||s.isMatrix3||s.isMatrix4||s.isVector2||s.isVector3||s.isVector4||s.isTexture||s.isQuaternion)?s.isRenderTargetTexture?(Oe("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=s.clone():Array.isArray(s)?e[t][n]=s.slice():e[t][n]=s}}return e}function Ot(i){const e={};for(let t=0;t<i.length;t++){const n=is(i[t]);for(const s in n)e[s]=n[s]}return e}function Mp(i){const e=[];for(let t=0;t<i.length;t++)e.push(i[t].clone());return e}function gh(i){const e=i.getRenderTarget();return e===null?i.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:tt.workingColorSpace}const Sp={clone:is,merge:Ot};var Ep=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,yp=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class on extends Si{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Ep,this.fragmentShader=yp,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=is(e.uniforms),this.uniformsGroups=Mp(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const s in this.uniforms){const a=this.uniforms[s].value;a&&a.isTexture?t.uniforms[s]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[s]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[s]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[s]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[s]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[s]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[s]={type:"m4",value:a.toArray()}:t.uniforms[s]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const n={};for(const s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}}class bp extends on{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class Be extends Si{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Ne(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Ne(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=nh,this.normalScale=new Fe(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Bt,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class Tp extends Si{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=Uf,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class Ap extends Si{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}class wc extends xt{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new Ne(e),this.intensity=t}dispose(){this.dispatchEvent({type:"dispose"})}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){const t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}}class wp extends wc{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(xt.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Ne(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){const t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}}const Ga=new je,bl=new D,Tl=new D;class _h{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Fe(512,512),this.mapType=qt,this.map=null,this.mapPass=null,this.matrix=new je,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new yc,this._frameExtents=new Fe(1,1),this._viewportCount=1,this._viewports=[new mt(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){const t=this.camera,n=this.matrix;bl.setFromMatrixPosition(e.matrixWorld),t.position.copy(bl),Tl.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(Tl),t.updateMatrixWorld(),Ga.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Ga,t.coordinateSystem,t.reversedDepth),t.coordinateSystem===Us||t.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Ga)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){const e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}const mr=new D,gr=new $t,ln=new D;class xh extends xt{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new je,this.projectionMatrix=new je,this.projectionMatrixInverse=new je,this.coordinateSystem=fn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(mr,gr,ln),ln.x===1&&ln.y===1&&ln.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(mr,gr,ln.set(1,1,1)).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorld.decompose(mr,gr,ln),ln.x===1&&ln.y===1&&ln.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(mr,gr,ln.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}const On=new D,Al=new Fe,wl=new Fe;class Yt extends xh{constructor(e=50,t=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=Ko*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(ma*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Ko*2*Math.atan(Math.tan(ma*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){On.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(On.x,On.y).multiplyScalar(-e/On.z),On.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(On.x,On.y).multiplyScalar(-e/On.z)}getViewSize(e,t){return this.getViewBounds(e,Al,wl),t.subVectors(wl,Al)}setViewOffset(e,t,n,s,r,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(ma*.5*this.fov)/this.zoom,n=2*t,s=this.aspect*n,r=-.5*s;const a=this.view;if(this.view!==null&&this.view.enabled){const l=a.fullWidth,c=a.fullHeight;r+=a.offsetX*s/l,t-=a.offsetY*n/c,s*=a.width/l,n*=a.height/c}const o=this.filmOffset;o!==0&&(r+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}class Rp extends _h{constructor(){super(new Yt(90,1,.5,500)),this.isPointLightShadow=!0}}class Rc extends wc{constructor(e,t,n=0,s=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=s,this.shadow=new Rp}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){const t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}}class Cc extends xh{constructor(e=-1,t=1,n=1,s=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=s,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,s,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2;let r=n-e,a=n+e,o=s+t,l=s-t;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,a=r+c*this.view.width,o-=h*this.view.offsetY,l=o-h*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}class Cp extends _h{constructor(){super(new Cc(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class Rl extends wc{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(xt.DEFAULT_UP),this.updateMatrix(),this.target=new xt,this.shadow=new Cp}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){const t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}}const Gi=-90,Hi=1;class Pp extends xt{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const s=new Yt(Gi,Hi,e,t);s.layers=this.layers,this.add(s);const r=new Yt(Gi,Hi,e,t);r.layers=this.layers,this.add(r);const a=new Yt(Gi,Hi,e,t);a.layers=this.layers,this.add(a);const o=new Yt(Gi,Hi,e,t);o.layers=this.layers,this.add(o);const l=new Yt(Gi,Hi,e,t);l.layers=this.layers,this.add(l);const c=new Yt(Gi,Hi,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[n,s,r,a,o,l]=t;for(const c of t)this.remove(c);if(e===fn)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===Us)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(const c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[r,a,o,l,c,h]=this.children,d=e.getRenderTarget(),u=e.getActiveCubeFace(),p=e.getActiveMipmapLevel(),g=e.xr.enabled;e.xr.enabled=!1;const v=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let m=!1;e.isWebGLRenderer===!0?m=e.state.buffers.depth.getReversed():m=e.reversedDepthBuffer,e.setRenderTarget(n,0,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,r),e.setRenderTarget(n,1,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(n,4,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=v,e.setRenderTarget(n,5,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,h),e.setRenderTarget(d,u,p),e.xr.enabled=g,n.texture.needsPMREMUpdate=!0}}class Lp extends Yt{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}}class bM{constructor(){this._previousTime=0,this._currentTime=0,this._startTime=performance.now(),this._delta=0,this._elapsed=0,this._timescale=1,this._document=null,this._pageVisibilityHandler=null}connect(e){this._document=e,e.hidden!==void 0&&(this._pageVisibilityHandler=Dp.bind(this),e.addEventListener("visibilitychange",this._pageVisibilityHandler,!1))}disconnect(){this._pageVisibilityHandler!==null&&(this._document.removeEventListener("visibilitychange",this._pageVisibilityHandler),this._pageVisibilityHandler=null),this._document=null}getDelta(){return this._delta/1e3}getElapsed(){return this._elapsed/1e3}getTimescale(){return this._timescale}setTimescale(e){return this._timescale=e,this}reset(){return this._currentTime=performance.now()-this._startTime,this}dispose(){this.disconnect()}update(e){return this._pageVisibilityHandler!==null&&this._document.hidden===!0?this._delta=0:(this._previousTime=this._currentTime,this._currentTime=(e!==void 0?e:performance.now())-this._startTime,this._delta=(this._currentTime-this._previousTime)*this._timescale,this._elapsed+=this._delta),this}}function Dp(){this._document.hidden===!1&&this.reset()}function Cl(i,e,t,n){const s=Ip(n);switch(t){case eh:return i*e;case pc:return i*e/s.components*s.byteLength;case mc:return i*e/s.components*s.byteLength;case es:return i*e*2/s.components*s.byteLength;case gc:return i*e*2/s.components*s.byteLength;case th:return i*e*3/s.components*s.byteLength;case Jt:return i*e*4/s.components*s.byteLength;case _c:return i*e*4/s.components*s.byteLength;case wr:case Rr:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case Cr:case Pr:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case _o:case vo:return Math.max(i,16)*Math.max(e,8)/4;case go:case xo:return Math.max(i,8)*Math.max(e,8)/2;case Mo:case So:case yo:case bo:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case Eo:case To:case Ao:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case wo:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case Ro:return Math.floor((i+4)/5)*Math.floor((e+3)/4)*16;case Co:return Math.floor((i+4)/5)*Math.floor((e+4)/5)*16;case Po:return Math.floor((i+5)/6)*Math.floor((e+4)/5)*16;case Lo:return Math.floor((i+5)/6)*Math.floor((e+5)/6)*16;case Do:return Math.floor((i+7)/8)*Math.floor((e+4)/5)*16;case Io:return Math.floor((i+7)/8)*Math.floor((e+5)/6)*16;case Uo:return Math.floor((i+7)/8)*Math.floor((e+7)/8)*16;case No:return Math.floor((i+9)/10)*Math.floor((e+4)/5)*16;case Fo:return Math.floor((i+9)/10)*Math.floor((e+5)/6)*16;case Oo:return Math.floor((i+9)/10)*Math.floor((e+7)/8)*16;case Bo:return Math.floor((i+9)/10)*Math.floor((e+9)/10)*16;case zo:return Math.floor((i+11)/12)*Math.floor((e+9)/10)*16;case Go:return Math.floor((i+11)/12)*Math.floor((e+11)/12)*16;case Ho:case ko:case Vo:return Math.ceil(i/4)*Math.ceil(e/4)*16;case Wo:case Xo:return Math.ceil(i/4)*Math.ceil(e/4)*8;case Yo:case qo:return Math.ceil(i/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Ip(i){switch(i){case qt:case Zu:return{byteLength:1,components:1};case Ds:case ju:case Rn:return{byteLength:2,components:1};case dc:case fc:return{byteLength:2,components:4};case gn:case hc:case an:return{byteLength:4,components:1};case Ju:case Qu:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:lc}}));typeof window<"u"&&(window.__THREE__?Oe("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=lc);function vh(){let i=null,e=!1,t=null,n=null;function s(r,a){t(r,a),n=i.requestAnimationFrame(s)}return{start:function(){e!==!0&&t!==null&&(n=i.requestAnimationFrame(s),e=!0)},stop:function(){i.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){i=r}}}function Up(i){const e=new WeakMap;function t(o,l){const c=o.array,h=o.usage,d=c.byteLength,u=i.createBuffer();i.bindBuffer(l,u),i.bufferData(l,c,h),o.onUploadCallback();let p;if(c instanceof Float32Array)p=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)p=i.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?p=i.HALF_FLOAT:p=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)p=i.SHORT;else if(c instanceof Uint32Array)p=i.UNSIGNED_INT;else if(c instanceof Int32Array)p=i.INT;else if(c instanceof Int8Array)p=i.BYTE;else if(c instanceof Uint8Array)p=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)p=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:u,type:p,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:d}}function n(o,l,c){const h=l.array,d=l.updateRanges;if(i.bindBuffer(c,o),d.length===0)i.bufferSubData(c,0,h);else{d.sort((p,g)=>p.start-g.start);let u=0;for(let p=1;p<d.length;p++){const g=d[u],v=d[p];v.start<=g.start+g.count+1?g.count=Math.max(g.count,v.start+v.count-g.start):(++u,d[u]=v)}d.length=u+1;for(let p=0,g=d.length;p<g;p++){const v=d[p];i.bufferSubData(c,v.start*h.BYTES_PER_ELEMENT,h,v.start,v.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(o){return o.isInterleavedBufferAttribute&&(o=o.data),e.get(o)}function r(o){o.isInterleavedBufferAttribute&&(o=o.data);const l=e.get(o);l&&(i.deleteBuffer(l.buffer),e.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){const h=e.get(o);(!h||h.version<o.version)&&e.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}const c=e.get(o);if(c===void 0)e.set(o,t(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,o,l),c.version=o.version}}return{get:s,remove:r,update:a}}var Np=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Fp=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,Op=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Bp=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,zp=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Gp=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Hp=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,kp=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Vp=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,Wp=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Xp=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Yp=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,qp=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,$p=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,Kp=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,Zp=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,jp=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Jp=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Qp=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,em=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,tm=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,nm=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,im=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,sm=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,rm=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,am=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,om=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,cm=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,lm=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,um=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,hm="gl_FragColor = linearToOutputTexel( gl_FragColor );",dm=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,fm=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,pm=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,mm=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,gm=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,_m=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,xm=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,vm=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Mm=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Sm=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Em=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,ym=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,bm=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Tm=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Am=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,wm=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,Rm=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Cm=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Pm=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Lm=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Dm=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Im=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return v;
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Um=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,Nm=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,Fm=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Om=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Bm=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,zm=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Gm=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Hm=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,km=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Vm=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,Wm=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Xm=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Ym=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,qm=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,$m=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Km=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Zm=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,jm=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Jm=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,Qm=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,e0=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,t0=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,n0=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,i0=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,s0=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,r0=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,a0=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,o0=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,c0=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,l0=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,u0=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,h0=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,d0=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,f0=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,p0=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,m0=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,g0=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,_0=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,x0=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,v0=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,M0=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,S0=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,E0=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,y0=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,b0=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,T0=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,A0=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,w0=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,R0=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,C0=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,P0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,L0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,D0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,I0=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const U0=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,N0=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,F0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,O0=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,B0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,z0=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,G0=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,H0=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,k0=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,V0=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,W0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,X0=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Y0=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,q0=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,$0=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,K0=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Z0=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,j0=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,J0=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,Q0=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,eg=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,tg=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,ng=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,ig=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,sg=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,rg=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,ag=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,og=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,cg=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,lg=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,ug=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,hg=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,dg=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,fg=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,ke={alphahash_fragment:Np,alphahash_pars_fragment:Fp,alphamap_fragment:Op,alphamap_pars_fragment:Bp,alphatest_fragment:zp,alphatest_pars_fragment:Gp,aomap_fragment:Hp,aomap_pars_fragment:kp,batching_pars_vertex:Vp,batching_vertex:Wp,begin_vertex:Xp,beginnormal_vertex:Yp,bsdfs:qp,iridescence_fragment:$p,bumpmap_pars_fragment:Kp,clipping_planes_fragment:Zp,clipping_planes_pars_fragment:jp,clipping_planes_pars_vertex:Jp,clipping_planes_vertex:Qp,color_fragment:em,color_pars_fragment:tm,color_pars_vertex:nm,color_vertex:im,common:sm,cube_uv_reflection_fragment:rm,defaultnormal_vertex:am,displacementmap_pars_vertex:om,displacementmap_vertex:cm,emissivemap_fragment:lm,emissivemap_pars_fragment:um,colorspace_fragment:hm,colorspace_pars_fragment:dm,envmap_fragment:fm,envmap_common_pars_fragment:pm,envmap_pars_fragment:mm,envmap_pars_vertex:gm,envmap_physical_pars_fragment:wm,envmap_vertex:_m,fog_vertex:xm,fog_pars_vertex:vm,fog_fragment:Mm,fog_pars_fragment:Sm,gradientmap_pars_fragment:Em,lightmap_pars_fragment:ym,lights_lambert_fragment:bm,lights_lambert_pars_fragment:Tm,lights_pars_begin:Am,lights_toon_fragment:Rm,lights_toon_pars_fragment:Cm,lights_phong_fragment:Pm,lights_phong_pars_fragment:Lm,lights_physical_fragment:Dm,lights_physical_pars_fragment:Im,lights_fragment_begin:Um,lights_fragment_maps:Nm,lights_fragment_end:Fm,logdepthbuf_fragment:Om,logdepthbuf_pars_fragment:Bm,logdepthbuf_pars_vertex:zm,logdepthbuf_vertex:Gm,map_fragment:Hm,map_pars_fragment:km,map_particle_fragment:Vm,map_particle_pars_fragment:Wm,metalnessmap_fragment:Xm,metalnessmap_pars_fragment:Ym,morphinstance_vertex:qm,morphcolor_vertex:$m,morphnormal_vertex:Km,morphtarget_pars_vertex:Zm,morphtarget_vertex:jm,normal_fragment_begin:Jm,normal_fragment_maps:Qm,normal_pars_fragment:e0,normal_pars_vertex:t0,normal_vertex:n0,normalmap_pars_fragment:i0,clearcoat_normal_fragment_begin:s0,clearcoat_normal_fragment_maps:r0,clearcoat_pars_fragment:a0,iridescence_pars_fragment:o0,opaque_fragment:c0,packing:l0,premultiplied_alpha_fragment:u0,project_vertex:h0,dithering_fragment:d0,dithering_pars_fragment:f0,roughnessmap_fragment:p0,roughnessmap_pars_fragment:m0,shadowmap_pars_fragment:g0,shadowmap_pars_vertex:_0,shadowmap_vertex:x0,shadowmask_pars_fragment:v0,skinbase_vertex:M0,skinning_pars_vertex:S0,skinning_vertex:E0,skinnormal_vertex:y0,specularmap_fragment:b0,specularmap_pars_fragment:T0,tonemapping_fragment:A0,tonemapping_pars_fragment:w0,transmission_fragment:R0,transmission_pars_fragment:C0,uv_pars_fragment:P0,uv_pars_vertex:L0,uv_vertex:D0,worldpos_vertex:I0,background_vert:U0,background_frag:N0,backgroundCube_vert:F0,backgroundCube_frag:O0,cube_vert:B0,cube_frag:z0,depth_vert:G0,depth_frag:H0,distance_vert:k0,distance_frag:V0,equirect_vert:W0,equirect_frag:X0,linedashed_vert:Y0,linedashed_frag:q0,meshbasic_vert:$0,meshbasic_frag:K0,meshlambert_vert:Z0,meshlambert_frag:j0,meshmatcap_vert:J0,meshmatcap_frag:Q0,meshnormal_vert:eg,meshnormal_frag:tg,meshphong_vert:ng,meshphong_frag:ig,meshphysical_vert:sg,meshphysical_frag:rg,meshtoon_vert:ag,meshtoon_frag:og,points_vert:cg,points_frag:lg,shadow_vert:ug,shadow_frag:hg,sprite_vert:dg,sprite_frag:fg},fe={common:{diffuse:{value:new Ne(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ge},alphaMap:{value:null},alphaMapTransform:{value:new Ge},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ge}},envmap:{envMap:{value:null},envMapRotation:{value:new Ge},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ge}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ge}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ge},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ge},normalScale:{value:new Fe(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ge},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ge}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ge}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ge}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Ne(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Ne(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ge},alphaTest:{value:0},uvTransform:{value:new Ge}},sprite:{diffuse:{value:new Ne(16777215)},opacity:{value:1},center:{value:new Fe(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ge},alphaMap:{value:null},alphaMapTransform:{value:new Ge},alphaTest:{value:0}}},hn={basic:{uniforms:Ot([fe.common,fe.specularmap,fe.envmap,fe.aomap,fe.lightmap,fe.fog]),vertexShader:ke.meshbasic_vert,fragmentShader:ke.meshbasic_frag},lambert:{uniforms:Ot([fe.common,fe.specularmap,fe.envmap,fe.aomap,fe.lightmap,fe.emissivemap,fe.bumpmap,fe.normalmap,fe.displacementmap,fe.fog,fe.lights,{emissive:{value:new Ne(0)},envMapIntensity:{value:1}}]),vertexShader:ke.meshlambert_vert,fragmentShader:ke.meshlambert_frag},phong:{uniforms:Ot([fe.common,fe.specularmap,fe.envmap,fe.aomap,fe.lightmap,fe.emissivemap,fe.bumpmap,fe.normalmap,fe.displacementmap,fe.fog,fe.lights,{emissive:{value:new Ne(0)},specular:{value:new Ne(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:ke.meshphong_vert,fragmentShader:ke.meshphong_frag},standard:{uniforms:Ot([fe.common,fe.envmap,fe.aomap,fe.lightmap,fe.emissivemap,fe.bumpmap,fe.normalmap,fe.displacementmap,fe.roughnessmap,fe.metalnessmap,fe.fog,fe.lights,{emissive:{value:new Ne(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:ke.meshphysical_vert,fragmentShader:ke.meshphysical_frag},toon:{uniforms:Ot([fe.common,fe.aomap,fe.lightmap,fe.emissivemap,fe.bumpmap,fe.normalmap,fe.displacementmap,fe.gradientmap,fe.fog,fe.lights,{emissive:{value:new Ne(0)}}]),vertexShader:ke.meshtoon_vert,fragmentShader:ke.meshtoon_frag},matcap:{uniforms:Ot([fe.common,fe.bumpmap,fe.normalmap,fe.displacementmap,fe.fog,{matcap:{value:null}}]),vertexShader:ke.meshmatcap_vert,fragmentShader:ke.meshmatcap_frag},points:{uniforms:Ot([fe.points,fe.fog]),vertexShader:ke.points_vert,fragmentShader:ke.points_frag},dashed:{uniforms:Ot([fe.common,fe.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:ke.linedashed_vert,fragmentShader:ke.linedashed_frag},depth:{uniforms:Ot([fe.common,fe.displacementmap]),vertexShader:ke.depth_vert,fragmentShader:ke.depth_frag},normal:{uniforms:Ot([fe.common,fe.bumpmap,fe.normalmap,fe.displacementmap,{opacity:{value:1}}]),vertexShader:ke.meshnormal_vert,fragmentShader:ke.meshnormal_frag},sprite:{uniforms:Ot([fe.sprite,fe.fog]),vertexShader:ke.sprite_vert,fragmentShader:ke.sprite_frag},background:{uniforms:{uvTransform:{value:new Ge},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:ke.background_vert,fragmentShader:ke.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ge}},vertexShader:ke.backgroundCube_vert,fragmentShader:ke.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:ke.cube_vert,fragmentShader:ke.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:ke.equirect_vert,fragmentShader:ke.equirect_frag},distance:{uniforms:Ot([fe.common,fe.displacementmap,{referencePosition:{value:new D},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:ke.distance_vert,fragmentShader:ke.distance_frag},shadow:{uniforms:Ot([fe.lights,fe.fog,{color:{value:new Ne(0)},opacity:{value:1}}]),vertexShader:ke.shadow_vert,fragmentShader:ke.shadow_frag}};hn.physical={uniforms:Ot([hn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ge},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ge},clearcoatNormalScale:{value:new Fe(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ge},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ge},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ge},sheen:{value:0},sheenColor:{value:new Ne(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ge},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ge},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ge},transmissionSamplerSize:{value:new Fe},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ge},attenuationDistance:{value:0},attenuationColor:{value:new Ne(0)},specularColor:{value:new Ne(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ge},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ge},anisotropyVector:{value:new Fe},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ge}}]),vertexShader:ke.meshphysical_vert,fragmentShader:ke.meshphysical_frag};const _r={r:0,b:0,g:0},ti=new Bt,pg=new je;function mg(i,e,t,n,s,r){const a=new Ne(0);let o=s===!0?0:1,l,c,h=null,d=0,u=null;function p(x){let y=x.isScene===!0?x.background:null;if(y&&y.isTexture){const S=x.backgroundBlurriness>0;y=e.get(y,S)}return y}function g(x){let y=!1;const S=p(x);S===null?m(a,o):S&&S.isColor&&(m(S,1),y=!0);const A=i.xr.getEnvironmentBlendMode();A==="additive"?t.buffers.color.setClear(0,0,0,1,r):A==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,r),(i.autoClear||y)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function v(x,y){const S=p(y);S&&(S.isCubeTexture||S.mapping===$r)?(c===void 0&&(c=new Ie(new We(1,1,1),new on({name:"BackgroundCubeMaterial",uniforms:is(hn.backgroundCube.uniforms),vertexShader:hn.backgroundCube.vertexShader,fragmentShader:hn.backgroundCube.fragmentShader,side:It,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(A,b,w){this.matrixWorld.copyPosition(w.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),ti.copy(y.backgroundRotation),ti.x*=-1,ti.y*=-1,ti.z*=-1,S.isCubeTexture&&S.isRenderTargetTexture===!1&&(ti.y*=-1,ti.z*=-1),c.material.uniforms.envMap.value=S,c.material.uniforms.flipEnvMap.value=S.isCubeTexture&&S.isRenderTargetTexture===!1?-1:1,c.material.uniforms.backgroundBlurriness.value=y.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=y.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(pg.makeRotationFromEuler(ti)),c.material.toneMapped=tt.getTransfer(S.colorSpace)!==ot,(h!==S||d!==S.version||u!==i.toneMapping)&&(c.material.needsUpdate=!0,h=S,d=S.version,u=i.toneMapping),c.layers.enableAll(),x.unshift(c,c.geometry,c.material,0,0,null)):S&&S.isTexture&&(l===void 0&&(l=new Ie(new ls(2,2),new on({name:"BackgroundMaterial",uniforms:is(hn.background.uniforms),vertexShader:hn.background.vertexShader,fragmentShader:hn.background.fragmentShader,side:Yn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=S,l.material.uniforms.backgroundIntensity.value=y.backgroundIntensity,l.material.toneMapped=tt.getTransfer(S.colorSpace)!==ot,S.matrixAutoUpdate===!0&&S.updateMatrix(),l.material.uniforms.uvTransform.value.copy(S.matrix),(h!==S||d!==S.version||u!==i.toneMapping)&&(l.material.needsUpdate=!0,h=S,d=S.version,u=i.toneMapping),l.layers.enableAll(),x.unshift(l,l.geometry,l.material,0,0,null))}function m(x,y){x.getRGB(_r,gh(i)),t.buffers.color.setClear(_r.r,_r.g,_r.b,y,r)}function f(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(x,y=1){a.set(x),o=y,m(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(x){o=x,m(a,o)},render:g,addToRenderList:v,dispose:f}}function gg(i,e){const t=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=u(null);let r=s,a=!1;function o(C,N,I,z,F){let O=!1;const H=d(C,z,I,N);r!==H&&(r=H,c(r.object)),O=p(C,z,I,F),O&&g(C,z,I,F),F!==null&&e.update(F,i.ELEMENT_ARRAY_BUFFER),(O||a)&&(a=!1,S(C,N,I,z),F!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,e.get(F).buffer))}function l(){return i.createVertexArray()}function c(C){return i.bindVertexArray(C)}function h(C){return i.deleteVertexArray(C)}function d(C,N,I,z){const F=z.wireframe===!0;let O=n[N.id];O===void 0&&(O={},n[N.id]=O);const H=C.isInstancedMesh===!0?C.id:0;let K=O[H];K===void 0&&(K={},O[H]=K);let Z=K[I.id];Z===void 0&&(Z={},K[I.id]=Z);let ne=Z[F];return ne===void 0&&(ne=u(l()),Z[F]=ne),ne}function u(C){const N=[],I=[],z=[];for(let F=0;F<t;F++)N[F]=0,I[F]=0,z[F]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:N,enabledAttributes:I,attributeDivisors:z,object:C,attributes:{},index:null}}function p(C,N,I,z){const F=r.attributes,O=N.attributes;let H=0;const K=I.getAttributes();for(const Z in K)if(K[Z].location>=0){const le=F[Z];let ae=O[Z];if(ae===void 0&&(Z==="instanceMatrix"&&C.instanceMatrix&&(ae=C.instanceMatrix),Z==="instanceColor"&&C.instanceColor&&(ae=C.instanceColor)),le===void 0||le.attribute!==ae||ae&&le.data!==ae.data)return!0;H++}return r.attributesNum!==H||r.index!==z}function g(C,N,I,z){const F={},O=N.attributes;let H=0;const K=I.getAttributes();for(const Z in K)if(K[Z].location>=0){let le=O[Z];le===void 0&&(Z==="instanceMatrix"&&C.instanceMatrix&&(le=C.instanceMatrix),Z==="instanceColor"&&C.instanceColor&&(le=C.instanceColor));const ae={};ae.attribute=le,le&&le.data&&(ae.data=le.data),F[Z]=ae,H++}r.attributes=F,r.attributesNum=H,r.index=z}function v(){const C=r.newAttributes;for(let N=0,I=C.length;N<I;N++)C[N]=0}function m(C){f(C,0)}function f(C,N){const I=r.newAttributes,z=r.enabledAttributes,F=r.attributeDivisors;I[C]=1,z[C]===0&&(i.enableVertexAttribArray(C),z[C]=1),F[C]!==N&&(i.vertexAttribDivisor(C,N),F[C]=N)}function x(){const C=r.newAttributes,N=r.enabledAttributes;for(let I=0,z=N.length;I<z;I++)N[I]!==C[I]&&(i.disableVertexAttribArray(I),N[I]=0)}function y(C,N,I,z,F,O,H){H===!0?i.vertexAttribIPointer(C,N,I,F,O):i.vertexAttribPointer(C,N,I,z,F,O)}function S(C,N,I,z){v();const F=z.attributes,O=I.getAttributes(),H=N.defaultAttributeValues;for(const K in O){const Z=O[K];if(Z.location>=0){let ne=F[K];if(ne===void 0&&(K==="instanceMatrix"&&C.instanceMatrix&&(ne=C.instanceMatrix),K==="instanceColor"&&C.instanceColor&&(ne=C.instanceColor)),ne!==void 0){const le=ne.normalized,ae=ne.itemSize,Re=e.get(ne);if(Re===void 0)continue;const De=Re.buffer,Ye=Re.type,j=Re.bytesPerElement,ce=Ye===i.INT||Ye===i.UNSIGNED_INT||ne.gpuType===hc;if(ne.isInterleavedBufferAttribute){const oe=ne.data,Ue=oe.stride,Te=ne.offset;if(oe.isInstancedInterleavedBuffer){for(let Ce=0;Ce<Z.locationSize;Ce++)f(Z.location+Ce,oe.meshPerAttribute);C.isInstancedMesh!==!0&&z._maxInstanceCount===void 0&&(z._maxInstanceCount=oe.meshPerAttribute*oe.count)}else for(let Ce=0;Ce<Z.locationSize;Ce++)m(Z.location+Ce);i.bindBuffer(i.ARRAY_BUFFER,De);for(let Ce=0;Ce<Z.locationSize;Ce++)y(Z.location+Ce,ae/Z.locationSize,Ye,le,Ue*j,(Te+ae/Z.locationSize*Ce)*j,ce)}else{if(ne.isInstancedBufferAttribute){for(let oe=0;oe<Z.locationSize;oe++)f(Z.location+oe,ne.meshPerAttribute);C.isInstancedMesh!==!0&&z._maxInstanceCount===void 0&&(z._maxInstanceCount=ne.meshPerAttribute*ne.count)}else for(let oe=0;oe<Z.locationSize;oe++)m(Z.location+oe);i.bindBuffer(i.ARRAY_BUFFER,De);for(let oe=0;oe<Z.locationSize;oe++)y(Z.location+oe,ae/Z.locationSize,Ye,le,ae*j,ae/Z.locationSize*oe*j,ce)}}else if(H!==void 0){const le=H[K];if(le!==void 0)switch(le.length){case 2:i.vertexAttrib2fv(Z.location,le);break;case 3:i.vertexAttrib3fv(Z.location,le);break;case 4:i.vertexAttrib4fv(Z.location,le);break;default:i.vertexAttrib1fv(Z.location,le)}}}}x()}function A(){E();for(const C in n){const N=n[C];for(const I in N){const z=N[I];for(const F in z){const O=z[F];for(const H in O)h(O[H].object),delete O[H];delete z[F]}}delete n[C]}}function b(C){if(n[C.id]===void 0)return;const N=n[C.id];for(const I in N){const z=N[I];for(const F in z){const O=z[F];for(const H in O)h(O[H].object),delete O[H];delete z[F]}}delete n[C.id]}function w(C){for(const N in n){const I=n[N];for(const z in I){const F=I[z];if(F[C.id]===void 0)continue;const O=F[C.id];for(const H in O)h(O[H].object),delete O[H];delete F[C.id]}}}function _(C){for(const N in n){const I=n[N],z=C.isInstancedMesh===!0?C.id:0,F=I[z];if(F!==void 0){for(const O in F){const H=F[O];for(const K in H)h(H[K].object),delete H[K];delete F[O]}delete I[z],Object.keys(I).length===0&&delete n[N]}}}function E(){L(),a=!0,r!==s&&(r=s,c(r.object))}function L(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:o,reset:E,resetDefaultState:L,dispose:A,releaseStatesOfGeometry:b,releaseStatesOfObject:_,releaseStatesOfProgram:w,initAttributes:v,enableAttribute:m,disableUnusedAttributes:x}}function _g(i,e,t){let n;function s(c){n=c}function r(c,h){i.drawArrays(n,c,h),t.update(h,n,1)}function a(c,h,d){d!==0&&(i.drawArraysInstanced(n,c,h,d),t.update(h,n,d))}function o(c,h,d){if(d===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,c,0,h,0,d);let p=0;for(let g=0;g<d;g++)p+=h[g];t.update(p,n,1)}function l(c,h,d,u){if(d===0)return;const p=e.get("WEBGL_multi_draw");if(p===null)for(let g=0;g<c.length;g++)a(c[g],h[g],u[g]);else{p.multiDrawArraysInstancedWEBGL(n,c,0,h,0,u,0,d);let g=0;for(let v=0;v<d;v++)g+=h[v]*u[v];t.update(g,n,1)}}this.setMode=s,this.render=r,this.renderInstances=a,this.renderMultiDraw=o,this.renderMultiDrawInstances=l}function xg(i,e,t,n){let s;function r(){if(s!==void 0)return s;if(e.has("EXT_texture_filter_anisotropic")===!0){const w=e.get("EXT_texture_filter_anisotropic");s=i.getParameter(w.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function a(w){return!(w!==Jt&&n.convert(w)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(w){const _=w===Rn&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(w!==qt&&n.convert(w)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&w!==an&&!_)}function l(w){if(w==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";w="mediump"}return w==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=t.precision!==void 0?t.precision:"highp";const h=l(c);h!==c&&(Oe("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);const d=t.logarithmicDepthBuffer===!0,u=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control"),p=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),g=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),v=i.getParameter(i.MAX_TEXTURE_SIZE),m=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),f=i.getParameter(i.MAX_VERTEX_ATTRIBS),x=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),y=i.getParameter(i.MAX_VARYING_VECTORS),S=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),A=i.getParameter(i.MAX_SAMPLES),b=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:u,maxTextures:p,maxVertexTextures:g,maxTextureSize:v,maxCubemapSize:m,maxAttributes:f,maxVertexUniforms:x,maxVaryings:y,maxFragmentUniforms:S,maxSamples:A,samples:b}}function vg(i){const e=this;let t=null,n=0,s=!1,r=!1;const a=new si,o=new Ge,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,u){const p=d.length!==0||u||n!==0||s;return s=u,n=d.length,p},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(d,u){t=h(d,u,0)},this.setState=function(d,u,p){const g=d.clippingPlanes,v=d.clipIntersection,m=d.clipShadows,f=i.get(d);if(!s||g===null||g.length===0||r&&!m)r?h(null):c();else{const x=r?0:n,y=x*4;let S=f.clippingState||null;l.value=S,S=h(g,u,y,p);for(let A=0;A!==y;++A)S[A]=t[A];f.clippingState=S,this.numIntersection=v?this.numPlanes:0,this.numPlanes+=x}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function h(d,u,p,g){const v=d!==null?d.length:0;let m=null;if(v!==0){if(m=l.value,g!==!0||m===null){const f=p+v*4,x=u.matrixWorldInverse;o.getNormalMatrix(x),(m===null||m.length<f)&&(m=new Float32Array(f));for(let y=0,S=p;y!==v;++y,S+=4)a.copy(d[y]).applyMatrix4(x,o),a.normal.toArray(m,S),m[S+3]=a.constant}l.value=m,l.needsUpdate=!0}return e.numPlanes=v,e.numIntersection=0,m}}const Hn=4,Pl=[.125,.215,.35,.446,.526,.582],ai=20,Mg=256,Ms=new Cc,Ll=new Ne;let Ha=null,ka=0,Va=0,Wa=!1;const Sg=new D;class Dl{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,s=100,r={}){const{size:a=256,position:o=Sg}=r;Ha=this._renderer.getRenderTarget(),ka=this._renderer.getActiveCubeFace(),Va=this._renderer.getActiveMipmapLevel(),Wa=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(e,n,s,l,o),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Nl(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Ul(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Ha,ka,Va),this._renderer.xr.enabled=Wa,e.scissorTest=!1,ki(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===pi||e.mapping===Qi?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Ha=this._renderer.getRenderTarget(),ka=this._renderer.getActiveCubeFace(),Va=this._renderer.getActiveMipmapLevel(),Wa=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:Tt,minFilter:Tt,generateMipmaps:!1,type:Rn,format:Jt,colorSpace:ts,depthBuffer:!1},s=Il(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Il(e,t,n);const{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=Eg(r)),this._blurMaterial=bg(r,e,t),this._ggxMaterial=yg(r,e,t)}return s}_compileMaterial(e){const t=new Ie(new vt,e);this._renderer.compile(t,Ms)}_sceneToCubeUV(e,t,n,s,r){const l=new Yt(90,1,t,n),c=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],d=this._renderer,u=d.autoClear,p=d.toneMapping;d.getClearColor(Ll),d.toneMapping=pn,d.autoClear=!1,d.state.buffers.depth.getReversed()&&(d.setRenderTarget(s),d.clearDepth(),d.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new Ie(new We,new dh({name:"PMREM.Background",side:It,depthWrite:!1,depthTest:!1})));const v=this._backgroundBox,m=v.material;let f=!1;const x=e.background;x?x.isColor&&(m.color.copy(x),e.background=null,f=!0):(m.color.copy(Ll),f=!0);for(let y=0;y<6;y++){const S=y%3;S===0?(l.up.set(0,c[y],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+h[y],r.y,r.z)):S===1?(l.up.set(0,0,c[y]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+h[y],r.z)):(l.up.set(0,c[y],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+h[y]));const A=this._cubeSize;ki(s,S*A,y>2?A:0,A,A),d.setRenderTarget(s),f&&d.render(v,l),d.render(e,l)}d.toneMapping=p,d.autoClear=u,e.background=x}_textureToCubeUV(e,t){const n=this._renderer,s=e.mapping===pi||e.mapping===Qi;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=Nl()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Ul());const r=s?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=r;const o=r.uniforms;o.envMap.value=e;const l=this._cubeSize;ki(t,0,0,3*l,2*l),n.setRenderTarget(t),n.render(a,Ms)}_applyPMREM(e){const t=this._renderer,n=t.autoClear;t.autoClear=!1;const s=this._lodMeshes.length;for(let r=1;r<s;r++)this._applyGGXFilter(e,r-1,r);t.autoClear=n}_applyGGXFilter(e,t,n){const s=this._renderer,r=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;const l=a.uniforms,c=n/(this._lodMeshes.length-1),h=t/(this._lodMeshes.length-1),d=Math.sqrt(c*c-h*h),u=0+c*1.25,p=d*u,{_lodMax:g}=this,v=this._sizeLods[n],m=3*v*(n>g-Hn?n-g+Hn:0),f=4*(this._cubeSize-v);l.envMap.value=e.texture,l.roughness.value=p,l.mipInt.value=g-t,ki(r,m,f,3*v,2*v),s.setRenderTarget(r),s.render(o,Ms),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=g-n,ki(e,m,f,3*v,2*v),s.setRenderTarget(e),s.render(o,Ms)}_blur(e,t,n,s,r){const a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,s,"latitudinal",r),this._halfBlur(a,e,n,n,s,"longitudinal",r)}_halfBlur(e,t,n,s,r,a,o){const l=this._renderer,c=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&et("blur direction must be either latitudinal or longitudinal!");const h=3,d=this._lodMeshes[s];d.material=c;const u=c.uniforms,p=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*p):2*Math.PI/(2*ai-1),v=r/g,m=isFinite(r)?1+Math.floor(h*v):ai;m>ai&&Oe(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${ai}`);const f=[];let x=0;for(let w=0;w<ai;++w){const _=w/v,E=Math.exp(-_*_/2);f.push(E),w===0?x+=E:w<m&&(x+=2*E)}for(let w=0;w<f.length;w++)f[w]=f[w]/x;u.envMap.value=e.texture,u.samples.value=m,u.weights.value=f,u.latitudinal.value=a==="latitudinal",o&&(u.poleAxis.value=o);const{_lodMax:y}=this;u.dTheta.value=g,u.mipInt.value=y-n;const S=this._sizeLods[s],A=3*S*(s>y-Hn?s-y+Hn:0),b=4*(this._cubeSize-S);ki(t,A,b,3*S,2*S),l.setRenderTarget(t),l.render(d,Ms)}}function Eg(i){const e=[],t=[],n=[];let s=i;const r=i-Hn+1+Pl.length;for(let a=0;a<r;a++){const o=Math.pow(2,s);e.push(o);let l=1/o;a>i-Hn?l=Pl[a-i+Hn-1]:a===0&&(l=0),t.push(l);const c=1/(o-2),h=-c,d=1+c,u=[h,h,d,h,d,d,h,h,d,d,h,d],p=6,g=6,v=3,m=2,f=1,x=new Float32Array(v*g*p),y=new Float32Array(m*g*p),S=new Float32Array(f*g*p);for(let b=0;b<p;b++){const w=b%3*2/3-1,_=b>2?0:-1,E=[w,_,0,w+2/3,_,0,w+2/3,_+1,0,w,_,0,w+2/3,_+1,0,w,_+1,0];x.set(E,v*g*b),y.set(u,m*g*b);const L=[b,b,b,b,b,b];S.set(L,f*g*b)}const A=new vt;A.setAttribute("position",new Nt(x,v)),A.setAttribute("uv",new Nt(y,m)),A.setAttribute("faceIndex",new Nt(S,f)),n.push(new Ie(A,null)),s>Hn&&s--}return{lodMeshes:n,sizeLods:e,sigmas:t}}function Il(i,e,t){const n=new mn(i,e,t);return n.texture.mapping=$r,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function ki(i,e,t,n,s){i.viewport.set(e,t,n,s),i.scissor.set(e,t,n,s)}function yg(i,e,t){return new on({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:Mg,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Jr(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:Tn,depthTest:!1,depthWrite:!1})}function bg(i,e,t){const n=new Float32Array(ai),s=new D(0,1,0);return new on({name:"SphericalGaussianBlur",defines:{n:ai,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:Jr(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:Tn,depthTest:!1,depthWrite:!1})}function Ul(){return new on({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Jr(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Tn,depthTest:!1,depthWrite:!1})}function Nl(){return new on({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Jr(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Tn,depthTest:!1,depthWrite:!1})}function Jr(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}class Mh extends mn{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const n={width:e,height:e,depth:1},s=[n,n,n,n,n,n];this.texture=new ph(s),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new We(5,5,5),r=new on({name:"CubemapFromEquirect",uniforms:is(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:It,blending:Tn});r.uniforms.tEquirect.value=t;const a=new Ie(s,r),o=t.minFilter;return t.minFilter===ci&&(t.minFilter=Tt),new Pp(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,s=!0){const r=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,n,s);e.setRenderTarget(r)}}function Tg(i){let e=new WeakMap,t=new WeakMap,n=null;function s(u,p=!1){return u==null?null:p?a(u):r(u)}function r(u){if(u&&u.isTexture){const p=u.mapping;if(p===Ar||p===fa)if(e.has(u)){const g=e.get(u).texture;return o(g,u.mapping)}else{const g=u.image;if(g&&g.height>0){const v=new Mh(g.height);return v.fromEquirectangularTexture(i,u),e.set(u,v),u.addEventListener("dispose",c),o(v.texture,u.mapping)}else return null}}return u}function a(u){if(u&&u.isTexture){const p=u.mapping,g=p===Ar||p===fa,v=p===pi||p===Qi;if(g||v){let m=t.get(u);const f=m!==void 0?m.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==f)return n===null&&(n=new Dl(i)),m=g?n.fromEquirectangular(u,m):n.fromCubemap(u,m),m.texture.pmremVersion=u.pmremVersion,t.set(u,m),m.texture;if(m!==void 0)return m.texture;{const x=u.image;return g&&x&&x.height>0||v&&x&&l(x)?(n===null&&(n=new Dl(i)),m=g?n.fromEquirectangular(u):n.fromCubemap(u),m.texture.pmremVersion=u.pmremVersion,t.set(u,m),u.addEventListener("dispose",h),m.texture):null}}}return u}function o(u,p){return p===Ar?u.mapping=pi:p===fa&&(u.mapping=Qi),u}function l(u){let p=0;const g=6;for(let v=0;v<g;v++)u[v]!==void 0&&p++;return p===g}function c(u){const p=u.target;p.removeEventListener("dispose",c);const g=e.get(p);g!==void 0&&(e.delete(p),g.dispose())}function h(u){const p=u.target;p.removeEventListener("dispose",h);const g=t.get(p);g!==void 0&&(t.delete(p),g.dispose())}function d(){e=new WeakMap,t=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:d}}function Ag(i){const e={};function t(n){if(e[n]!==void 0)return e[n];const s=i.getExtension(n);return e[n]=s,s}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){const s=t(n);return s===null&&zr("WebGLRenderer: "+n+" extension not supported."),s}}}function wg(i,e,t,n){const s={},r=new WeakMap;function a(d){const u=d.target;u.index!==null&&e.remove(u.index);for(const g in u.attributes)e.remove(u.attributes[g]);u.removeEventListener("dispose",a),delete s[u.id];const p=r.get(u);p&&(e.remove(p),r.delete(u)),n.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,t.memory.geometries--}function o(d,u){return s[u.id]===!0||(u.addEventListener("dispose",a),s[u.id]=!0,t.memory.geometries++),u}function l(d){const u=d.attributes;for(const p in u)e.update(u[p],i.ARRAY_BUFFER)}function c(d){const u=[],p=d.index,g=d.attributes.position;let v=0;if(g===void 0)return;if(p!==null){const x=p.array;v=p.version;for(let y=0,S=x.length;y<S;y+=3){const A=x[y+0],b=x[y+1],w=x[y+2];u.push(A,b,b,w,w,A)}}else{const x=g.array;v=g.version;for(let y=0,S=x.length/3-1;y<S;y+=3){const A=y+0,b=y+1,w=y+2;u.push(A,b,b,w,w,A)}}const m=new(g.count>=65535?ch:oh)(u,1);m.version=v;const f=r.get(d);f&&e.remove(f),r.set(d,m)}function h(d){const u=r.get(d);if(u){const p=d.index;p!==null&&u.version<p.version&&c(d)}else c(d);return r.get(d)}return{get:o,update:l,getWireframeAttribute:h}}function Rg(i,e,t){let n;function s(u){n=u}let r,a;function o(u){r=u.type,a=u.bytesPerElement}function l(u,p){i.drawElements(n,p,r,u*a),t.update(p,n,1)}function c(u,p,g){g!==0&&(i.drawElementsInstanced(n,p,r,u*a,g),t.update(p,n,g))}function h(u,p,g){if(g===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,p,0,r,u,0,g);let m=0;for(let f=0;f<g;f++)m+=p[f];t.update(m,n,1)}function d(u,p,g,v){if(g===0)return;const m=e.get("WEBGL_multi_draw");if(m===null)for(let f=0;f<u.length;f++)c(u[f]/a,p[f],v[f]);else{m.multiDrawElementsInstancedWEBGL(n,p,0,r,u,0,v,0,g);let f=0;for(let x=0;x<g;x++)f+=p[x]*v[x];t.update(f,n,1)}}this.setMode=s,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=h,this.renderMultiDrawInstances=d}function Cg(i){const e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(t.calls++,a){case i.TRIANGLES:t.triangles+=o*(r/3);break;case i.LINES:t.lines+=o*(r/2);break;case i.LINE_STRIP:t.lines+=o*(r-1);break;case i.LINE_LOOP:t.lines+=o*r;break;case i.POINTS:t.points+=o*r;break;default:et("WebGLInfo: Unknown draw mode:",a);break}}function s(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:s,update:n}}function Pg(i,e,t){const n=new WeakMap,s=new mt;function r(a,o,l){const c=a.morphTargetInfluences,h=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,d=h!==void 0?h.length:0;let u=n.get(o);if(u===void 0||u.count!==d){let E=function(){w.dispose(),n.delete(o),o.removeEventListener("dispose",E)};u!==void 0&&u.texture.dispose();const p=o.morphAttributes.position!==void 0,g=o.morphAttributes.normal!==void 0,v=o.morphAttributes.color!==void 0,m=o.morphAttributes.position||[],f=o.morphAttributes.normal||[],x=o.morphAttributes.color||[];let y=0;p===!0&&(y=1),g===!0&&(y=2),v===!0&&(y=3);let S=o.attributes.position.count*y,A=1;S>e.maxTextureSize&&(A=Math.ceil(S/e.maxTextureSize),S=e.maxTextureSize);const b=new Float32Array(S*A*4*d),w=new sh(b,S,A,d);w.type=an,w.needsUpdate=!0;const _=y*4;for(let L=0;L<d;L++){const C=m[L],N=f[L],I=x[L],z=S*A*4*L;for(let F=0;F<C.count;F++){const O=F*_;p===!0&&(s.fromBufferAttribute(C,F),b[z+O+0]=s.x,b[z+O+1]=s.y,b[z+O+2]=s.z,b[z+O+3]=0),g===!0&&(s.fromBufferAttribute(N,F),b[z+O+4]=s.x,b[z+O+5]=s.y,b[z+O+6]=s.z,b[z+O+7]=0),v===!0&&(s.fromBufferAttribute(I,F),b[z+O+8]=s.x,b[z+O+9]=s.y,b[z+O+10]=s.z,b[z+O+11]=I.itemSize===4?s.w:1)}}u={count:d,texture:w,size:new Fe(S,A)},n.set(o,u),o.addEventListener("dispose",E)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",a.morphTexture,t);else{let p=0;for(let v=0;v<c.length;v++)p+=c[v];const g=o.morphTargetsRelative?1:1-p;l.getUniforms().setValue(i,"morphTargetBaseInfluence",g),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",u.texture,t),l.getUniforms().setValue(i,"morphTargetsTextureSize",u.size)}return{update:r}}function Lg(i,e,t,n,s){let r=new WeakMap;function a(c){const h=s.render.frame,d=c.geometry,u=e.get(c,d);if(r.get(u)!==h&&(e.update(u),r.set(u,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==h&&(t.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,i.ARRAY_BUFFER),r.set(c,h))),c.isSkinnedMesh){const p=c.skeleton;r.get(p)!==h&&(p.update(),r.set(p,h))}return u}function o(){r=new WeakMap}function l(c){const h=c.target;h.removeEventListener("dispose",l),n.releaseStatesOfObject(h),t.remove(h.instanceMatrix),h.instanceColor!==null&&t.remove(h.instanceColor)}return{update:a,dispose:o}}const Dg={[Vu]:"LINEAR_TONE_MAPPING",[Wu]:"REINHARD_TONE_MAPPING",[Xu]:"CINEON_TONE_MAPPING",[uc]:"ACES_FILMIC_TONE_MAPPING",[qu]:"AGX_TONE_MAPPING",[$u]:"NEUTRAL_TONE_MAPPING",[Yu]:"CUSTOM_TONE_MAPPING"};function Ig(i,e,t,n,s){const r=new mn(e,t,{type:i,depthBuffer:n,stencilBuffer:s}),a=new mn(e,t,{type:Rn,depthBuffer:!1,stencilBuffer:!1}),o=new vt;o.setAttribute("position",new at([-1,3,0,-1,-1,0,3,-1,0],3)),o.setAttribute("uv",new at([0,2,0,0,2,0],2));const l=new bp({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),c=new Ie(o,l),h=new Cc(-1,1,1,-1,0,1);let d=null,u=null,p=!1,g,v=null,m=[],f=!1;this.setSize=function(x,y){r.setSize(x,y),a.setSize(x,y);for(let S=0;S<m.length;S++){const A=m[S];A.setSize&&A.setSize(x,y)}},this.setEffects=function(x){m=x,f=m.length>0&&m[0].isRenderPass===!0;const y=r.width,S=r.height;for(let A=0;A<m.length;A++){const b=m[A];b.setSize&&b.setSize(y,S)}},this.begin=function(x,y){if(p||x.toneMapping===pn&&m.length===0)return!1;if(v=y,y!==null){const S=y.width,A=y.height;(r.width!==S||r.height!==A)&&this.setSize(S,A)}return f===!1&&x.setRenderTarget(r),g=x.toneMapping,x.toneMapping=pn,!0},this.hasRenderPass=function(){return f},this.end=function(x,y){x.toneMapping=g,p=!0;let S=r,A=a;for(let b=0;b<m.length;b++){const w=m[b];if(w.enabled!==!1&&(w.render(x,A,S,y),w.needsSwap!==!1)){const _=S;S=A,A=_}}if(d!==x.outputColorSpace||u!==x.toneMapping){d=x.outputColorSpace,u=x.toneMapping,l.defines={},tt.getTransfer(d)===ot&&(l.defines.SRGB_TRANSFER="");const b=Dg[u];b&&(l.defines[b]=""),l.needsUpdate=!0}l.uniforms.tDiffuse.value=S.texture,x.setRenderTarget(v),x.render(c,h),v=null,p=!1},this.isCompositing=function(){return p},this.dispose=function(){r.dispose(),a.dispose(),o.dispose(),l.dispose()}}const Sh=new Ut,jo=new Ns(1,1),Eh=new sh,yh=new Jf,bh=new ph,Fl=[],Ol=[],Bl=new Float32Array(16),zl=new Float32Array(9),Gl=new Float32Array(4);function us(i,e,t){const n=i[0];if(n<=0||n>0)return i;const s=e*t;let r=Fl[s];if(r===void 0&&(r=new Float32Array(s),Fl[s]=r),e!==0){n.toArray(r,0);for(let a=1,o=0;a!==e;++a)o+=t,i[a].toArray(r,o)}return r}function St(i,e){if(i.length!==e.length)return!1;for(let t=0,n=i.length;t<n;t++)if(i[t]!==e[t])return!1;return!0}function Et(i,e){for(let t=0,n=e.length;t<n;t++)i[t]=e[t]}function Qr(i,e){let t=Ol[e];t===void 0&&(t=new Int32Array(e),Ol[e]=t);for(let n=0;n!==e;++n)t[n]=i.allocateTextureUnit();return t}function Ug(i,e){const t=this.cache;t[0]!==e&&(i.uniform1f(this.addr,e),t[0]=e)}function Ng(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(St(t,e))return;i.uniform2fv(this.addr,e),Et(t,e)}}function Fg(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(i.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(St(t,e))return;i.uniform3fv(this.addr,e),Et(t,e)}}function Og(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(St(t,e))return;i.uniform4fv(this.addr,e),Et(t,e)}}function Bg(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(St(t,e))return;i.uniformMatrix2fv(this.addr,!1,e),Et(t,e)}else{if(St(t,n))return;Gl.set(n),i.uniformMatrix2fv(this.addr,!1,Gl),Et(t,n)}}function zg(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(St(t,e))return;i.uniformMatrix3fv(this.addr,!1,e),Et(t,e)}else{if(St(t,n))return;zl.set(n),i.uniformMatrix3fv(this.addr,!1,zl),Et(t,n)}}function Gg(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(St(t,e))return;i.uniformMatrix4fv(this.addr,!1,e),Et(t,e)}else{if(St(t,n))return;Bl.set(n),i.uniformMatrix4fv(this.addr,!1,Bl),Et(t,n)}}function Hg(i,e){const t=this.cache;t[0]!==e&&(i.uniform1i(this.addr,e),t[0]=e)}function kg(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(St(t,e))return;i.uniform2iv(this.addr,e),Et(t,e)}}function Vg(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(St(t,e))return;i.uniform3iv(this.addr,e),Et(t,e)}}function Wg(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(St(t,e))return;i.uniform4iv(this.addr,e),Et(t,e)}}function Xg(i,e){const t=this.cache;t[0]!==e&&(i.uniform1ui(this.addr,e),t[0]=e)}function Yg(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(St(t,e))return;i.uniform2uiv(this.addr,e),Et(t,e)}}function qg(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(St(t,e))return;i.uniform3uiv(this.addr,e),Et(t,e)}}function $g(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(St(t,e))return;i.uniform4uiv(this.addr,e),Et(t,e)}}function Kg(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(jo.compareFunction=t.isReversedDepthBuffer()?vc:xc,r=jo):r=Sh,t.setTexture2D(e||r,s)}function Zg(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture3D(e||yh,s)}function jg(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTextureCube(e||bh,s)}function Jg(i,e,t){const n=this.cache,s=t.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),t.setTexture2DArray(e||Eh,s)}function Qg(i){switch(i){case 5126:return Ug;case 35664:return Ng;case 35665:return Fg;case 35666:return Og;case 35674:return Bg;case 35675:return zg;case 35676:return Gg;case 5124:case 35670:return Hg;case 35667:case 35671:return kg;case 35668:case 35672:return Vg;case 35669:case 35673:return Wg;case 5125:return Xg;case 36294:return Yg;case 36295:return qg;case 36296:return $g;case 35678:case 36198:case 36298:case 36306:case 35682:return Kg;case 35679:case 36299:case 36307:return Zg;case 35680:case 36300:case 36308:case 36293:return jg;case 36289:case 36303:case 36311:case 36292:return Jg}}function e_(i,e){i.uniform1fv(this.addr,e)}function t_(i,e){const t=us(e,this.size,2);i.uniform2fv(this.addr,t)}function n_(i,e){const t=us(e,this.size,3);i.uniform3fv(this.addr,t)}function i_(i,e){const t=us(e,this.size,4);i.uniform4fv(this.addr,t)}function s_(i,e){const t=us(e,this.size,4);i.uniformMatrix2fv(this.addr,!1,t)}function r_(i,e){const t=us(e,this.size,9);i.uniformMatrix3fv(this.addr,!1,t)}function a_(i,e){const t=us(e,this.size,16);i.uniformMatrix4fv(this.addr,!1,t)}function o_(i,e){i.uniform1iv(this.addr,e)}function c_(i,e){i.uniform2iv(this.addr,e)}function l_(i,e){i.uniform3iv(this.addr,e)}function u_(i,e){i.uniform4iv(this.addr,e)}function h_(i,e){i.uniform1uiv(this.addr,e)}function d_(i,e){i.uniform2uiv(this.addr,e)}function f_(i,e){i.uniform3uiv(this.addr,e)}function p_(i,e){i.uniform4uiv(this.addr,e)}function m_(i,e,t){const n=this.cache,s=e.length,r=Qr(t,s);St(n,r)||(i.uniform1iv(this.addr,r),Et(n,r));let a;this.type===i.SAMPLER_2D_SHADOW?a=jo:a=Sh;for(let o=0;o!==s;++o)t.setTexture2D(e[o]||a,r[o])}function g_(i,e,t){const n=this.cache,s=e.length,r=Qr(t,s);St(n,r)||(i.uniform1iv(this.addr,r),Et(n,r));for(let a=0;a!==s;++a)t.setTexture3D(e[a]||yh,r[a])}function __(i,e,t){const n=this.cache,s=e.length,r=Qr(t,s);St(n,r)||(i.uniform1iv(this.addr,r),Et(n,r));for(let a=0;a!==s;++a)t.setTextureCube(e[a]||bh,r[a])}function x_(i,e,t){const n=this.cache,s=e.length,r=Qr(t,s);St(n,r)||(i.uniform1iv(this.addr,r),Et(n,r));for(let a=0;a!==s;++a)t.setTexture2DArray(e[a]||Eh,r[a])}function v_(i){switch(i){case 5126:return e_;case 35664:return t_;case 35665:return n_;case 35666:return i_;case 35674:return s_;case 35675:return r_;case 35676:return a_;case 5124:case 35670:return o_;case 35667:case 35671:return c_;case 35668:case 35672:return l_;case 35669:case 35673:return u_;case 5125:return h_;case 36294:return d_;case 36295:return f_;case 36296:return p_;case 35678:case 36198:case 36298:case 36306:case 35682:return m_;case 35679:case 36299:case 36307:return g_;case 35680:case 36300:case 36308:case 36293:return __;case 36289:case 36303:case 36311:case 36292:return x_}}class M_{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=Qg(t.type)}}class S_{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=v_(t.type)}}class E_{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){const s=this.seq;for(let r=0,a=s.length;r!==a;++r){const o=s[r];o.setValue(e,t[o.id],n)}}}const Xa=/(\w+)(\])?(\[|\.)?/g;function Hl(i,e){i.seq.push(e),i.map[e.id]=e}function y_(i,e,t){const n=i.name,s=n.length;for(Xa.lastIndex=0;;){const r=Xa.exec(n),a=Xa.lastIndex;let o=r[1];const l=r[2]==="]",c=r[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===s){Hl(t,c===void 0?new M_(o,i,e):new S_(o,i,e));break}else{let d=t.map[o];d===void 0&&(d=new E_(o),Hl(t,d)),t=d}}}class Lr{constructor(e,t){this.seq=[],this.map={};const n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){const o=e.getActiveUniform(t,a),l=e.getUniformLocation(t,o.name);y_(o,l,this)}const s=[],r=[];for(const a of this.seq)a.type===e.SAMPLER_2D_SHADOW||a.type===e.SAMPLER_CUBE_SHADOW||a.type===e.SAMPLER_2D_ARRAY_SHADOW?s.push(a):r.push(a);s.length>0&&(this.seq=s.concat(r))}setValue(e,t,n,s){const r=this.map[t];r!==void 0&&r.setValue(e,n,s)}setOptional(e,t,n){const s=t[n];s!==void 0&&this.setValue(e,n,s)}static upload(e,t,n,s){for(let r=0,a=t.length;r!==a;++r){const o=t[r],l=n[o.id];l.needsUpdate!==!1&&o.setValue(e,l.value,s)}}static seqWithValue(e,t){const n=[];for(let s=0,r=e.length;s!==r;++s){const a=e[s];a.id in t&&n.push(a)}return n}}function kl(i,e,t){const n=i.createShader(e);return i.shaderSource(n,t),i.compileShader(n),n}const b_=37297;let T_=0;function A_(i,e){const t=i.split(`
`),n=[],s=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let a=s;a<r;a++){const o=a+1;n.push(`${o===e?">":" "} ${o}: ${t[a]}`)}return n.join(`
`)}const Vl=new Ge;function w_(i){tt._getMatrix(Vl,tt.workingColorSpace,i);const e=`mat3( ${Vl.elements.map(t=>t.toFixed(4))} )`;switch(tt.getTransfer(i)){case Fr:return[e,"LinearTransferOETF"];case ot:return[e,"sRGBTransferOETF"];default:return Oe("WebGLProgram: Unsupported color space: ",i),[e,"LinearTransferOETF"]}}function Wl(i,e,t){const n=i.getShaderParameter(e,i.COMPILE_STATUS),r=(i.getShaderInfoLog(e)||"").trim();if(n&&r==="")return"";const a=/ERROR: 0:(\d+)/.exec(r);if(a){const o=parseInt(a[1]);return t.toUpperCase()+`

`+r+`

`+A_(i.getShaderSource(e),o)}else return r}function R_(i,e){const t=w_(e);return[`vec4 ${i}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}const C_={[Vu]:"Linear",[Wu]:"Reinhard",[Xu]:"Cineon",[uc]:"ACESFilmic",[qu]:"AgX",[$u]:"Neutral",[Yu]:"Custom"};function P_(i,e){const t=C_[e];return t===void 0?(Oe("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const xr=new D;function L_(){tt.getLuminanceCoefficients(xr);const i=xr.x.toFixed(4),e=xr.y.toFixed(4),t=xr.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function D_(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Rs).join(`
`)}function I_(i){const e=[];for(const t in i){const n=i[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function U_(i,e){const t={},n=i.getProgramParameter(e,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){const r=i.getActiveAttrib(e,s),a=r.name;let o=1;r.type===i.FLOAT_MAT2&&(o=2),r.type===i.FLOAT_MAT3&&(o=3),r.type===i.FLOAT_MAT4&&(o=4),t[a]={type:r.type,location:i.getAttribLocation(e,a),locationSize:o}}return t}function Rs(i){return i!==""}function Xl(i,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function Yl(i,e){return i.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const N_=/^[ \t]*#include +<([\w\d./]+)>/gm;function Jo(i){return i.replace(N_,O_)}const F_=new Map;function O_(i,e){let t=ke[e];if(t===void 0){const n=F_.get(e);if(n!==void 0)t=ke[n],Oe('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("Can not resolve #include <"+e+">")}return Jo(t)}const B_=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function ql(i){return i.replace(B_,z_)}function z_(i,e,t,n){let s="";for(let r=parseInt(e);r<parseInt(t);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function $l(i){let e=`precision ${i.precision} float;
	precision ${i.precision} int;
	precision ${i.precision} sampler2D;
	precision ${i.precision} samplerCube;
	precision ${i.precision} sampler3D;
	precision ${i.precision} sampler2DArray;
	precision ${i.precision} sampler2DShadow;
	precision ${i.precision} samplerCubeShadow;
	precision ${i.precision} sampler2DArrayShadow;
	precision ${i.precision} isampler2D;
	precision ${i.precision} isampler3D;
	precision ${i.precision} isamplerCube;
	precision ${i.precision} isampler2DArray;
	precision ${i.precision} usampler2D;
	precision ${i.precision} usampler3D;
	precision ${i.precision} usamplerCube;
	precision ${i.precision} usampler2DArray;
	`;return i.precision==="highp"?e+=`
#define HIGH_PRECISION`:i.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}const G_={[Tr]:"SHADOWMAP_TYPE_PCF",[ws]:"SHADOWMAP_TYPE_VSM"};function H_(i){return G_[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const k_={[pi]:"ENVMAP_TYPE_CUBE",[Qi]:"ENVMAP_TYPE_CUBE",[$r]:"ENVMAP_TYPE_CUBE_UV"};function V_(i){return i.envMap===!1?"ENVMAP_TYPE_CUBE":k_[i.envMapMode]||"ENVMAP_TYPE_CUBE"}const W_={[Qi]:"ENVMAP_MODE_REFRACTION"};function X_(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":W_[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}const Y_={[ku]:"ENVMAP_BLENDING_MULTIPLY",[Lf]:"ENVMAP_BLENDING_MIX",[Df]:"ENVMAP_BLENDING_ADD"};function q_(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":Y_[i.combine]||"ENVMAP_BLENDING_NONE"}function $_(i){const e=i.envMapCubeUVHeight;if(e===null)return null;const t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:n,maxMip:t}}function K_(i,e,t,n){const s=i.getContext(),r=t.defines;let a=t.vertexShader,o=t.fragmentShader;const l=H_(t),c=V_(t),h=X_(t),d=q_(t),u=$_(t),p=D_(t),g=I_(r),v=s.createProgram();let m,f,x=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Rs).join(`
`),m.length>0&&(m+=`
`),f=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Rs).join(`
`),f.length>0&&(f+=`
`)):(m=[$l(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Rs).join(`
`),f=[$l(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+h:"",t.envMap?"#define "+d:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==pn?"#define TONE_MAPPING":"",t.toneMapping!==pn?ke.tonemapping_pars_fragment:"",t.toneMapping!==pn?P_("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",ke.colorspace_pars_fragment,R_("linearToOutputTexel",t.outputColorSpace),L_(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Rs).join(`
`)),a=Jo(a),a=Xl(a,t),a=Yl(a,t),o=Jo(o),o=Xl(o,t),o=Yl(o,t),a=ql(a),o=ql(o),t.isRawShaderMaterial!==!0&&(x=`#version 300 es
`,m=[p,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,f=["#define varying in",t.glslVersion===tl?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===tl?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+f);const y=x+m+a,S=x+f+o,A=kl(s,s.VERTEX_SHADER,y),b=kl(s,s.FRAGMENT_SHADER,S);s.attachShader(v,A),s.attachShader(v,b),t.index0AttributeName!==void 0?s.bindAttribLocation(v,0,t.index0AttributeName):t.morphTargets===!0&&s.bindAttribLocation(v,0,"position"),s.linkProgram(v);function w(C){if(i.debug.checkShaderErrors){const N=s.getProgramInfoLog(v)||"",I=s.getShaderInfoLog(A)||"",z=s.getShaderInfoLog(b)||"",F=N.trim(),O=I.trim(),H=z.trim();let K=!0,Z=!0;if(s.getProgramParameter(v,s.LINK_STATUS)===!1)if(K=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,v,A,b);else{const ne=Wl(s,A,"vertex"),le=Wl(s,b,"fragment");et("THREE.WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(v,s.VALIDATE_STATUS)+`

Material Name: `+C.name+`
Material Type: `+C.type+`

Program Info Log: `+F+`
`+ne+`
`+le)}else F!==""?Oe("WebGLProgram: Program Info Log:",F):(O===""||H==="")&&(Z=!1);Z&&(C.diagnostics={runnable:K,programLog:F,vertexShader:{log:O,prefix:m},fragmentShader:{log:H,prefix:f}})}s.deleteShader(A),s.deleteShader(b),_=new Lr(s,v),E=U_(s,v)}let _;this.getUniforms=function(){return _===void 0&&w(this),_};let E;this.getAttributes=function(){return E===void 0&&w(this),E};let L=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return L===!1&&(L=s.getProgramParameter(v,b_)),L},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(v),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=T_++,this.cacheKey=e,this.usedTimes=1,this.program=v,this.vertexShader=A,this.fragmentShader=b,this}let Z_=0;class j_{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){const t=e.vertexShader,n=e.fragmentShader,s=this._getShaderStage(t),r=this._getShaderStage(n),a=this._getShaderCacheForMaterial(e);return a.has(s)===!1&&(a.add(s),s.usedTimes++),a.has(r)===!1&&(a.add(r),r.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){const t=this.shaderCache;let n=t.get(e);return n===void 0&&(n=new J_(e),t.set(e,n)),n}}class J_{constructor(e){this.id=Z_++,this.code=e,this.usedTimes=0}}function Q_(i,e,t,n,s,r){const a=new rh,o=new j_,l=new Set,c=[],h=new Map,d=n.logarithmicDepthBuffer;let u=n.precision;const p={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function g(_){return l.add(_),_===0?"uv":`uv${_}`}function v(_,E,L,C,N){const I=C.fog,z=N.geometry,F=_.isMeshStandardMaterial||_.isMeshLambertMaterial||_.isMeshPhongMaterial?C.environment:null,O=_.isMeshStandardMaterial||_.isMeshLambertMaterial&&!_.envMap||_.isMeshPhongMaterial&&!_.envMap,H=e.get(_.envMap||F,O),K=H&&H.mapping===$r?H.image.height:null,Z=p[_.type];_.precision!==null&&(u=n.getMaxPrecision(_.precision),u!==_.precision&&Oe("WebGLProgram.getParameters:",_.precision,"not supported, using",u,"instead."));const ne=z.morphAttributes.position||z.morphAttributes.normal||z.morphAttributes.color,le=ne!==void 0?ne.length:0;let ae=0;z.morphAttributes.position!==void 0&&(ae=1),z.morphAttributes.normal!==void 0&&(ae=2),z.morphAttributes.color!==void 0&&(ae=3);let Re,De,Ye,j;if(Z){const Qe=hn[Z];Re=Qe.vertexShader,De=Qe.fragmentShader}else Re=_.vertexShader,De=_.fragmentShader,o.update(_),Ye=o.getVertexShaderID(_),j=o.getFragmentShaderID(_);const ce=i.getRenderTarget(),oe=i.state.buffers.depth.getReversed(),Ue=N.isInstancedMesh===!0,Te=N.isBatchedMesh===!0,Ce=!!_.map,rt=!!_.matcap,Xe=!!H,$e=!!_.aoMap,it=!!_.lightMap,Me=!!_.bumpMap,Ke=!!_.normalMap,P=!!_.displacementMap,qe=!!_.emissiveMap,He=!!_.metalnessMap,st=!!_.roughnessMap,Se=_.anisotropy>0,R=_.clearcoat>0,M=_.dispersion>0,B=_.iridescence>0,J=_.sheen>0,ee=_.transmission>0,q=Se&&!!_.anisotropyMap,Ee=R&&!!_.clearcoatMap,W=R&&!!_.clearcoatNormalMap,Q=R&&!!_.clearcoatRoughnessMap,_e=B&&!!_.iridescenceMap,$=B&&!!_.iridescenceThicknessMap,te=J&&!!_.sheenColorMap,he=J&&!!_.sheenRoughnessMap,xe=!!_.specularMap,ue=!!_.specularColorMap,Pe=!!_.specularIntensityMap,U=ee&&!!_.transmissionMap,re=ee&&!!_.thicknessMap,se=!!_.gradientMap,de=!!_.alphaMap,ie=_.alphaTest>0,Y=!!_.alphaHash,pe=!!_.extensions;let Le=pn;_.toneMapped&&(ce===null||ce.isXRRenderTarget===!0)&&(Le=i.toneMapping);const Je={shaderID:Z,shaderType:_.type,shaderName:_.name,vertexShader:Re,fragmentShader:De,defines:_.defines,customVertexShaderID:Ye,customFragmentShaderID:j,isRawShaderMaterial:_.isRawShaderMaterial===!0,glslVersion:_.glslVersion,precision:u,batching:Te,batchingColor:Te&&N._colorsTexture!==null,instancing:Ue,instancingColor:Ue&&N.instanceColor!==null,instancingMorph:Ue&&N.morphTexture!==null,outputColorSpace:ce===null?i.outputColorSpace:ce.isXRRenderTarget===!0?ce.texture.colorSpace:ts,alphaToCoverage:!!_.alphaToCoverage,map:Ce,matcap:rt,envMap:Xe,envMapMode:Xe&&H.mapping,envMapCubeUVHeight:K,aoMap:$e,lightMap:it,bumpMap:Me,normalMap:Ke,displacementMap:P,emissiveMap:qe,normalMapObjectSpace:Ke&&_.normalMapType===Nf,normalMapTangentSpace:Ke&&_.normalMapType===nh,metalnessMap:He,roughnessMap:st,anisotropy:Se,anisotropyMap:q,clearcoat:R,clearcoatMap:Ee,clearcoatNormalMap:W,clearcoatRoughnessMap:Q,dispersion:M,iridescence:B,iridescenceMap:_e,iridescenceThicknessMap:$,sheen:J,sheenColorMap:te,sheenRoughnessMap:he,specularMap:xe,specularColorMap:ue,specularIntensityMap:Pe,transmission:ee,transmissionMap:U,thicknessMap:re,gradientMap:se,opaque:_.transparent===!1&&_.blending===Ki&&_.alphaToCoverage===!1,alphaMap:de,alphaTest:ie,alphaHash:Y,combine:_.combine,mapUv:Ce&&g(_.map.channel),aoMapUv:$e&&g(_.aoMap.channel),lightMapUv:it&&g(_.lightMap.channel),bumpMapUv:Me&&g(_.bumpMap.channel),normalMapUv:Ke&&g(_.normalMap.channel),displacementMapUv:P&&g(_.displacementMap.channel),emissiveMapUv:qe&&g(_.emissiveMap.channel),metalnessMapUv:He&&g(_.metalnessMap.channel),roughnessMapUv:st&&g(_.roughnessMap.channel),anisotropyMapUv:q&&g(_.anisotropyMap.channel),clearcoatMapUv:Ee&&g(_.clearcoatMap.channel),clearcoatNormalMapUv:W&&g(_.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Q&&g(_.clearcoatRoughnessMap.channel),iridescenceMapUv:_e&&g(_.iridescenceMap.channel),iridescenceThicknessMapUv:$&&g(_.iridescenceThicknessMap.channel),sheenColorMapUv:te&&g(_.sheenColorMap.channel),sheenRoughnessMapUv:he&&g(_.sheenRoughnessMap.channel),specularMapUv:xe&&g(_.specularMap.channel),specularColorMapUv:ue&&g(_.specularColorMap.channel),specularIntensityMapUv:Pe&&g(_.specularIntensityMap.channel),transmissionMapUv:U&&g(_.transmissionMap.channel),thicknessMapUv:re&&g(_.thicknessMap.channel),alphaMapUv:de&&g(_.alphaMap.channel),vertexTangents:!!z.attributes.tangent&&(Ke||Se),vertexColors:_.vertexColors,vertexAlphas:_.vertexColors===!0&&!!z.attributes.color&&z.attributes.color.itemSize===4,pointsUvs:N.isPoints===!0&&!!z.attributes.uv&&(Ce||de),fog:!!I,useFog:_.fog===!0,fogExp2:!!I&&I.isFogExp2,flatShading:_.wireframe===!1&&(_.flatShading===!0||z.attributes.normal===void 0&&Ke===!1&&(_.isMeshLambertMaterial||_.isMeshPhongMaterial||_.isMeshStandardMaterial||_.isMeshPhysicalMaterial)),sizeAttenuation:_.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:oe,skinning:N.isSkinnedMesh===!0,morphTargets:z.morphAttributes.position!==void 0,morphNormals:z.morphAttributes.normal!==void 0,morphColors:z.morphAttributes.color!==void 0,morphTargetsCount:le,morphTextureStride:ae,numDirLights:E.directional.length,numPointLights:E.point.length,numSpotLights:E.spot.length,numSpotLightMaps:E.spotLightMap.length,numRectAreaLights:E.rectArea.length,numHemiLights:E.hemi.length,numDirLightShadows:E.directionalShadowMap.length,numPointLightShadows:E.pointShadowMap.length,numSpotLightShadows:E.spotShadowMap.length,numSpotLightShadowsWithMaps:E.numSpotLightShadowsWithMaps,numLightProbes:E.numLightProbes,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:_.dithering,shadowMapEnabled:i.shadowMap.enabled&&L.length>0,shadowMapType:i.shadowMap.type,toneMapping:Le,decodeVideoTexture:Ce&&_.map.isVideoTexture===!0&&tt.getTransfer(_.map.colorSpace)===ot,decodeVideoTextureEmissive:qe&&_.emissiveMap.isVideoTexture===!0&&tt.getTransfer(_.emissiveMap.colorSpace)===ot,premultipliedAlpha:_.premultipliedAlpha,doubleSided:_.side===En,flipSided:_.side===It,useDepthPacking:_.depthPacking>=0,depthPacking:_.depthPacking||0,index0AttributeName:_.index0AttributeName,extensionClipCullDistance:pe&&_.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(pe&&_.extensions.multiDraw===!0||Te)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:_.customProgramCacheKey()};return Je.vertexUv1s=l.has(1),Je.vertexUv2s=l.has(2),Je.vertexUv3s=l.has(3),l.clear(),Je}function m(_){const E=[];if(_.shaderID?E.push(_.shaderID):(E.push(_.customVertexShaderID),E.push(_.customFragmentShaderID)),_.defines!==void 0)for(const L in _.defines)E.push(L),E.push(_.defines[L]);return _.isRawShaderMaterial===!1&&(f(E,_),x(E,_),E.push(i.outputColorSpace)),E.push(_.customProgramCacheKey),E.join()}function f(_,E){_.push(E.precision),_.push(E.outputColorSpace),_.push(E.envMapMode),_.push(E.envMapCubeUVHeight),_.push(E.mapUv),_.push(E.alphaMapUv),_.push(E.lightMapUv),_.push(E.aoMapUv),_.push(E.bumpMapUv),_.push(E.normalMapUv),_.push(E.displacementMapUv),_.push(E.emissiveMapUv),_.push(E.metalnessMapUv),_.push(E.roughnessMapUv),_.push(E.anisotropyMapUv),_.push(E.clearcoatMapUv),_.push(E.clearcoatNormalMapUv),_.push(E.clearcoatRoughnessMapUv),_.push(E.iridescenceMapUv),_.push(E.iridescenceThicknessMapUv),_.push(E.sheenColorMapUv),_.push(E.sheenRoughnessMapUv),_.push(E.specularMapUv),_.push(E.specularColorMapUv),_.push(E.specularIntensityMapUv),_.push(E.transmissionMapUv),_.push(E.thicknessMapUv),_.push(E.combine),_.push(E.fogExp2),_.push(E.sizeAttenuation),_.push(E.morphTargetsCount),_.push(E.morphAttributeCount),_.push(E.numDirLights),_.push(E.numPointLights),_.push(E.numSpotLights),_.push(E.numSpotLightMaps),_.push(E.numHemiLights),_.push(E.numRectAreaLights),_.push(E.numDirLightShadows),_.push(E.numPointLightShadows),_.push(E.numSpotLightShadows),_.push(E.numSpotLightShadowsWithMaps),_.push(E.numLightProbes),_.push(E.shadowMapType),_.push(E.toneMapping),_.push(E.numClippingPlanes),_.push(E.numClipIntersection),_.push(E.depthPacking)}function x(_,E){a.disableAll(),E.instancing&&a.enable(0),E.instancingColor&&a.enable(1),E.instancingMorph&&a.enable(2),E.matcap&&a.enable(3),E.envMap&&a.enable(4),E.normalMapObjectSpace&&a.enable(5),E.normalMapTangentSpace&&a.enable(6),E.clearcoat&&a.enable(7),E.iridescence&&a.enable(8),E.alphaTest&&a.enable(9),E.vertexColors&&a.enable(10),E.vertexAlphas&&a.enable(11),E.vertexUv1s&&a.enable(12),E.vertexUv2s&&a.enable(13),E.vertexUv3s&&a.enable(14),E.vertexTangents&&a.enable(15),E.anisotropy&&a.enable(16),E.alphaHash&&a.enable(17),E.batching&&a.enable(18),E.dispersion&&a.enable(19),E.batchingColor&&a.enable(20),E.gradientMap&&a.enable(21),_.push(a.mask),a.disableAll(),E.fog&&a.enable(0),E.useFog&&a.enable(1),E.flatShading&&a.enable(2),E.logarithmicDepthBuffer&&a.enable(3),E.reversedDepthBuffer&&a.enable(4),E.skinning&&a.enable(5),E.morphTargets&&a.enable(6),E.morphNormals&&a.enable(7),E.morphColors&&a.enable(8),E.premultipliedAlpha&&a.enable(9),E.shadowMapEnabled&&a.enable(10),E.doubleSided&&a.enable(11),E.flipSided&&a.enable(12),E.useDepthPacking&&a.enable(13),E.dithering&&a.enable(14),E.transmission&&a.enable(15),E.sheen&&a.enable(16),E.opaque&&a.enable(17),E.pointsUvs&&a.enable(18),E.decodeVideoTexture&&a.enable(19),E.decodeVideoTextureEmissive&&a.enable(20),E.alphaToCoverage&&a.enable(21),_.push(a.mask)}function y(_){const E=p[_.type];let L;if(E){const C=hn[E];L=Sp.clone(C.uniforms)}else L=_.uniforms;return L}function S(_,E){let L=h.get(E);return L!==void 0?++L.usedTimes:(L=new K_(i,E,_,s),c.push(L),h.set(E,L)),L}function A(_){if(--_.usedTimes===0){const E=c.indexOf(_);c[E]=c[c.length-1],c.pop(),h.delete(_.cacheKey),_.destroy()}}function b(_){o.remove(_)}function w(){o.dispose()}return{getParameters:v,getProgramCacheKey:m,getUniforms:y,acquireProgram:S,releaseProgram:A,releaseShaderCache:b,programs:c,dispose:w}}function ex(){let i=new WeakMap;function e(a){return i.has(a)}function t(a){let o=i.get(a);return o===void 0&&(o={},i.set(a,o)),o}function n(a){i.delete(a)}function s(a,o,l){i.get(a)[o]=l}function r(){i=new WeakMap}return{has:e,get:t,remove:n,update:s,dispose:r}}function tx(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.material.id!==e.material.id?i.material.id-e.material.id:i.materialVariant!==e.materialVariant?i.materialVariant-e.materialVariant:i.z!==e.z?i.z-e.z:i.id-e.id}function Kl(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.z!==e.z?e.z-i.z:i.id-e.id}function Zl(){const i=[];let e=0;const t=[],n=[],s=[];function r(){e=0,t.length=0,n.length=0,s.length=0}function a(u){let p=0;return u.isInstancedMesh&&(p+=2),u.isSkinnedMesh&&(p+=1),p}function o(u,p,g,v,m,f){let x=i[e];return x===void 0?(x={id:u.id,object:u,geometry:p,material:g,materialVariant:a(u),groupOrder:v,renderOrder:u.renderOrder,z:m,group:f},i[e]=x):(x.id=u.id,x.object=u,x.geometry=p,x.material=g,x.materialVariant=a(u),x.groupOrder=v,x.renderOrder=u.renderOrder,x.z=m,x.group=f),e++,x}function l(u,p,g,v,m,f){const x=o(u,p,g,v,m,f);g.transmission>0?n.push(x):g.transparent===!0?s.push(x):t.push(x)}function c(u,p,g,v,m,f){const x=o(u,p,g,v,m,f);g.transmission>0?n.unshift(x):g.transparent===!0?s.unshift(x):t.unshift(x)}function h(u,p){t.length>1&&t.sort(u||tx),n.length>1&&n.sort(p||Kl),s.length>1&&s.sort(p||Kl)}function d(){for(let u=e,p=i.length;u<p;u++){const g=i[u];if(g.id===null)break;g.id=null,g.object=null,g.geometry=null,g.material=null,g.group=null}}return{opaque:t,transmissive:n,transparent:s,init:r,push:l,unshift:c,finish:d,sort:h}}function nx(){let i=new WeakMap;function e(n,s){const r=i.get(n);let a;return r===void 0?(a=new Zl,i.set(n,[a])):s>=r.length?(a=new Zl,r.push(a)):a=r[s],a}function t(){i=new WeakMap}return{get:e,dispose:t}}function ix(){const i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new D,color:new Ne};break;case"SpotLight":t={position:new D,direction:new D,color:new Ne,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new D,color:new Ne,distance:0,decay:0};break;case"HemisphereLight":t={direction:new D,skyColor:new Ne,groundColor:new Ne};break;case"RectAreaLight":t={color:new Ne,position:new D,halfWidth:new D,halfHeight:new D};break}return i[e.id]=t,t}}}function sx(){const i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Fe};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Fe};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Fe,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[e.id]=t,t}}}let rx=0;function ax(i,e){return(e.castShadow?2:0)-(i.castShadow?2:0)+(e.map?1:0)-(i.map?1:0)}function ox(i){const e=new ix,t=sx(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new D);const s=new D,r=new je,a=new je;function o(c){let h=0,d=0,u=0;for(let E=0;E<9;E++)n.probe[E].set(0,0,0);let p=0,g=0,v=0,m=0,f=0,x=0,y=0,S=0,A=0,b=0,w=0;c.sort(ax);for(let E=0,L=c.length;E<L;E++){const C=c[E],N=C.color,I=C.intensity,z=C.distance;let F=null;if(C.shadow&&C.shadow.map&&(C.shadow.map.texture.format===es?F=C.shadow.map.texture:F=C.shadow.map.depthTexture||C.shadow.map.texture),C.isAmbientLight)h+=N.r*I,d+=N.g*I,u+=N.b*I;else if(C.isLightProbe){for(let O=0;O<9;O++)n.probe[O].addScaledVector(C.sh.coefficients[O],I);w++}else if(C.isDirectionalLight){const O=e.get(C);if(O.color.copy(C.color).multiplyScalar(C.intensity),C.castShadow){const H=C.shadow,K=t.get(C);K.shadowIntensity=H.intensity,K.shadowBias=H.bias,K.shadowNormalBias=H.normalBias,K.shadowRadius=H.radius,K.shadowMapSize=H.mapSize,n.directionalShadow[p]=K,n.directionalShadowMap[p]=F,n.directionalShadowMatrix[p]=C.shadow.matrix,x++}n.directional[p]=O,p++}else if(C.isSpotLight){const O=e.get(C);O.position.setFromMatrixPosition(C.matrixWorld),O.color.copy(N).multiplyScalar(I),O.distance=z,O.coneCos=Math.cos(C.angle),O.penumbraCos=Math.cos(C.angle*(1-C.penumbra)),O.decay=C.decay,n.spot[v]=O;const H=C.shadow;if(C.map&&(n.spotLightMap[A]=C.map,A++,H.updateMatrices(C),C.castShadow&&b++),n.spotLightMatrix[v]=H.matrix,C.castShadow){const K=t.get(C);K.shadowIntensity=H.intensity,K.shadowBias=H.bias,K.shadowNormalBias=H.normalBias,K.shadowRadius=H.radius,K.shadowMapSize=H.mapSize,n.spotShadow[v]=K,n.spotShadowMap[v]=F,S++}v++}else if(C.isRectAreaLight){const O=e.get(C);O.color.copy(N).multiplyScalar(I),O.halfWidth.set(C.width*.5,0,0),O.halfHeight.set(0,C.height*.5,0),n.rectArea[m]=O,m++}else if(C.isPointLight){const O=e.get(C);if(O.color.copy(C.color).multiplyScalar(C.intensity),O.distance=C.distance,O.decay=C.decay,C.castShadow){const H=C.shadow,K=t.get(C);K.shadowIntensity=H.intensity,K.shadowBias=H.bias,K.shadowNormalBias=H.normalBias,K.shadowRadius=H.radius,K.shadowMapSize=H.mapSize,K.shadowCameraNear=H.camera.near,K.shadowCameraFar=H.camera.far,n.pointShadow[g]=K,n.pointShadowMap[g]=F,n.pointShadowMatrix[g]=C.shadow.matrix,y++}n.point[g]=O,g++}else if(C.isHemisphereLight){const O=e.get(C);O.skyColor.copy(C.color).multiplyScalar(I),O.groundColor.copy(C.groundColor).multiplyScalar(I),n.hemi[f]=O,f++}}m>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=fe.LTC_FLOAT_1,n.rectAreaLTC2=fe.LTC_FLOAT_2):(n.rectAreaLTC1=fe.LTC_HALF_1,n.rectAreaLTC2=fe.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=d,n.ambient[2]=u;const _=n.hash;(_.directionalLength!==p||_.pointLength!==g||_.spotLength!==v||_.rectAreaLength!==m||_.hemiLength!==f||_.numDirectionalShadows!==x||_.numPointShadows!==y||_.numSpotShadows!==S||_.numSpotMaps!==A||_.numLightProbes!==w)&&(n.directional.length=p,n.spot.length=v,n.rectArea.length=m,n.point.length=g,n.hemi.length=f,n.directionalShadow.length=x,n.directionalShadowMap.length=x,n.pointShadow.length=y,n.pointShadowMap.length=y,n.spotShadow.length=S,n.spotShadowMap.length=S,n.directionalShadowMatrix.length=x,n.pointShadowMatrix.length=y,n.spotLightMatrix.length=S+A-b,n.spotLightMap.length=A,n.numSpotLightShadowsWithMaps=b,n.numLightProbes=w,_.directionalLength=p,_.pointLength=g,_.spotLength=v,_.rectAreaLength=m,_.hemiLength=f,_.numDirectionalShadows=x,_.numPointShadows=y,_.numSpotShadows=S,_.numSpotMaps=A,_.numLightProbes=w,n.version=rx++)}function l(c,h){let d=0,u=0,p=0,g=0,v=0;const m=h.matrixWorldInverse;for(let f=0,x=c.length;f<x;f++){const y=c[f];if(y.isDirectionalLight){const S=n.directional[d];S.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),S.direction.sub(s),S.direction.transformDirection(m),d++}else if(y.isSpotLight){const S=n.spot[p];S.position.setFromMatrixPosition(y.matrixWorld),S.position.applyMatrix4(m),S.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),S.direction.sub(s),S.direction.transformDirection(m),p++}else if(y.isRectAreaLight){const S=n.rectArea[g];S.position.setFromMatrixPosition(y.matrixWorld),S.position.applyMatrix4(m),a.identity(),r.copy(y.matrixWorld),r.premultiply(m),a.extractRotation(r),S.halfWidth.set(y.width*.5,0,0),S.halfHeight.set(0,y.height*.5,0),S.halfWidth.applyMatrix4(a),S.halfHeight.applyMatrix4(a),g++}else if(y.isPointLight){const S=n.point[u];S.position.setFromMatrixPosition(y.matrixWorld),S.position.applyMatrix4(m),u++}else if(y.isHemisphereLight){const S=n.hemi[v];S.direction.setFromMatrixPosition(y.matrixWorld),S.direction.transformDirection(m),v++}}}return{setup:o,setupView:l,state:n}}function jl(i){const e=new ox(i),t=[],n=[];function s(h){c.camera=h,t.length=0,n.length=0}function r(h){t.push(h)}function a(h){n.push(h)}function o(){e.setup(t)}function l(h){e.setupView(t,h)}const c={lightsArray:t,shadowsArray:n,camera:null,lights:e,transmissionRenderTarget:{}};return{init:s,state:c,setupLights:o,setupLightsView:l,pushLight:r,pushShadow:a}}function cx(i){let e=new WeakMap;function t(s,r=0){const a=e.get(s);let o;return a===void 0?(o=new jl(i),e.set(s,[o])):r>=a.length?(o=new jl(i),a.push(o)):o=a[r],o}function n(){e=new WeakMap}return{get:t,dispose:n}}const lx=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,ux=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,hx=[new D(1,0,0),new D(-1,0,0),new D(0,1,0),new D(0,-1,0),new D(0,0,1),new D(0,0,-1)],dx=[new D(0,-1,0),new D(0,-1,0),new D(0,0,1),new D(0,0,-1),new D(0,-1,0),new D(0,-1,0)],Jl=new je,Ss=new D,Ya=new D;function fx(i,e,t){let n=new yc;const s=new Fe,r=new Fe,a=new mt,o=new Tp,l=new Ap,c={},h=t.maxTextureSize,d={[Yn]:It,[It]:Yn,[En]:En},u=new on({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Fe},radius:{value:4}},vertexShader:lx,fragmentShader:ux}),p=u.clone();p.defines.HORIZONTAL_PASS=1;const g=new vt;g.setAttribute("position",new Nt(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const v=new Ie(g,u),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Tr;let f=this.type;this.render=function(b,w,_){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||b.length===0)return;this.type===Hu&&(Oe("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=Tr);const E=i.getRenderTarget(),L=i.getActiveCubeFace(),C=i.getActiveMipmapLevel(),N=i.state;N.setBlending(Tn),N.buffers.depth.getReversed()===!0?N.buffers.color.setClear(0,0,0,0):N.buffers.color.setClear(1,1,1,1),N.buffers.depth.setTest(!0),N.setScissorTest(!1);const I=f!==this.type;I&&w.traverse(function(z){z.material&&(Array.isArray(z.material)?z.material.forEach(F=>F.needsUpdate=!0):z.material.needsUpdate=!0)});for(let z=0,F=b.length;z<F;z++){const O=b[z],H=O.shadow;if(H===void 0){Oe("WebGLShadowMap:",O,"has no shadow.");continue}if(H.autoUpdate===!1&&H.needsUpdate===!1)continue;s.copy(H.mapSize);const K=H.getFrameExtents();s.multiply(K),r.copy(H.mapSize),(s.x>h||s.y>h)&&(s.x>h&&(r.x=Math.floor(h/K.x),s.x=r.x*K.x,H.mapSize.x=r.x),s.y>h&&(r.y=Math.floor(h/K.y),s.y=r.y*K.y,H.mapSize.y=r.y));const Z=i.state.buffers.depth.getReversed();if(H.camera._reversedDepth=Z,H.map===null||I===!0){if(H.map!==null&&(H.map.depthTexture!==null&&(H.map.depthTexture.dispose(),H.map.depthTexture=null),H.map.dispose()),this.type===ws){if(O.isPointLight){Oe("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}H.map=new mn(s.x,s.y,{format:es,type:Rn,minFilter:Tt,magFilter:Tt,generateMipmaps:!1}),H.map.texture.name=O.name+".shadowMap",H.map.depthTexture=new Ns(s.x,s.y,an),H.map.depthTexture.name=O.name+".shadowMapDepth",H.map.depthTexture.format=Cn,H.map.depthTexture.compareFunction=null,H.map.depthTexture.minFilter=Rt,H.map.depthTexture.magFilter=Rt}else O.isPointLight?(H.map=new Mh(s.x),H.map.depthTexture=new vp(s.x,gn)):(H.map=new mn(s.x,s.y),H.map.depthTexture=new Ns(s.x,s.y,gn)),H.map.depthTexture.name=O.name+".shadowMap",H.map.depthTexture.format=Cn,this.type===Tr?(H.map.depthTexture.compareFunction=Z?vc:xc,H.map.depthTexture.minFilter=Tt,H.map.depthTexture.magFilter=Tt):(H.map.depthTexture.compareFunction=null,H.map.depthTexture.minFilter=Rt,H.map.depthTexture.magFilter=Rt);H.camera.updateProjectionMatrix()}const ne=H.map.isWebGLCubeRenderTarget?6:1;for(let le=0;le<ne;le++){if(H.map.isWebGLCubeRenderTarget)i.setRenderTarget(H.map,le),i.clear();else{le===0&&(i.setRenderTarget(H.map),i.clear());const ae=H.getViewport(le);a.set(r.x*ae.x,r.y*ae.y,r.x*ae.z,r.y*ae.w),N.viewport(a)}if(O.isPointLight){const ae=H.camera,Re=H.matrix,De=O.distance||ae.far;De!==ae.far&&(ae.far=De,ae.updateProjectionMatrix()),Ss.setFromMatrixPosition(O.matrixWorld),ae.position.copy(Ss),Ya.copy(ae.position),Ya.add(hx[le]),ae.up.copy(dx[le]),ae.lookAt(Ya),ae.updateMatrixWorld(),Re.makeTranslation(-Ss.x,-Ss.y,-Ss.z),Jl.multiplyMatrices(ae.projectionMatrix,ae.matrixWorldInverse),H._frustum.setFromProjectionMatrix(Jl,ae.coordinateSystem,ae.reversedDepth)}else H.updateMatrices(O);n=H.getFrustum(),S(w,_,H.camera,O,this.type)}H.isPointLightShadow!==!0&&this.type===ws&&x(H,_),H.needsUpdate=!1}f=this.type,m.needsUpdate=!1,i.setRenderTarget(E,L,C)};function x(b,w){const _=e.update(v);u.defines.VSM_SAMPLES!==b.blurSamples&&(u.defines.VSM_SAMPLES=b.blurSamples,p.defines.VSM_SAMPLES=b.blurSamples,u.needsUpdate=!0,p.needsUpdate=!0),b.mapPass===null&&(b.mapPass=new mn(s.x,s.y,{format:es,type:Rn})),u.uniforms.shadow_pass.value=b.map.depthTexture,u.uniforms.resolution.value=b.mapSize,u.uniforms.radius.value=b.radius,i.setRenderTarget(b.mapPass),i.clear(),i.renderBufferDirect(w,null,_,u,v,null),p.uniforms.shadow_pass.value=b.mapPass.texture,p.uniforms.resolution.value=b.mapSize,p.uniforms.radius.value=b.radius,i.setRenderTarget(b.map),i.clear(),i.renderBufferDirect(w,null,_,p,v,null)}function y(b,w,_,E){let L=null;const C=_.isPointLight===!0?b.customDistanceMaterial:b.customDepthMaterial;if(C!==void 0)L=C;else if(L=_.isPointLight===!0?l:o,i.localClippingEnabled&&w.clipShadows===!0&&Array.isArray(w.clippingPlanes)&&w.clippingPlanes.length!==0||w.displacementMap&&w.displacementScale!==0||w.alphaMap&&w.alphaTest>0||w.map&&w.alphaTest>0||w.alphaToCoverage===!0){const N=L.uuid,I=w.uuid;let z=c[N];z===void 0&&(z={},c[N]=z);let F=z[I];F===void 0&&(F=L.clone(),z[I]=F,w.addEventListener("dispose",A)),L=F}if(L.visible=w.visible,L.wireframe=w.wireframe,E===ws?L.side=w.shadowSide!==null?w.shadowSide:w.side:L.side=w.shadowSide!==null?w.shadowSide:d[w.side],L.alphaMap=w.alphaMap,L.alphaTest=w.alphaToCoverage===!0?.5:w.alphaTest,L.map=w.map,L.clipShadows=w.clipShadows,L.clippingPlanes=w.clippingPlanes,L.clipIntersection=w.clipIntersection,L.displacementMap=w.displacementMap,L.displacementScale=w.displacementScale,L.displacementBias=w.displacementBias,L.wireframeLinewidth=w.wireframeLinewidth,L.linewidth=w.linewidth,_.isPointLight===!0&&L.isMeshDistanceMaterial===!0){const N=i.properties.get(L);N.light=_}return L}function S(b,w,_,E,L){if(b.visible===!1)return;if(b.layers.test(w.layers)&&(b.isMesh||b.isLine||b.isPoints)&&(b.castShadow||b.receiveShadow&&L===ws)&&(!b.frustumCulled||n.intersectsObject(b))){b.modelViewMatrix.multiplyMatrices(_.matrixWorldInverse,b.matrixWorld);const I=e.update(b),z=b.material;if(Array.isArray(z)){const F=I.groups;for(let O=0,H=F.length;O<H;O++){const K=F[O],Z=z[K.materialIndex];if(Z&&Z.visible){const ne=y(b,Z,E,L);b.onBeforeShadow(i,b,w,_,I,ne,K),i.renderBufferDirect(_,null,I,ne,b,K),b.onAfterShadow(i,b,w,_,I,ne,K)}}}else if(z.visible){const F=y(b,z,E,L);b.onBeforeShadow(i,b,w,_,I,F,null),i.renderBufferDirect(_,null,I,F,b,null),b.onAfterShadow(i,b,w,_,I,F,null)}}const N=b.children;for(let I=0,z=N.length;I<z;I++)S(N[I],w,_,E,L)}function A(b){b.target.removeEventListener("dispose",A);for(const _ in c){const E=c[_],L=b.target.uuid;L in E&&(E[L].dispose(),delete E[L])}}}function px(i,e){function t(){let U=!1;const re=new mt;let se=null;const de=new mt(0,0,0,0);return{setMask:function(ie){se!==ie&&!U&&(i.colorMask(ie,ie,ie,ie),se=ie)},setLocked:function(ie){U=ie},setClear:function(ie,Y,pe,Le,Je){Je===!0&&(ie*=Le,Y*=Le,pe*=Le),re.set(ie,Y,pe,Le),de.equals(re)===!1&&(i.clearColor(ie,Y,pe,Le),de.copy(re))},reset:function(){U=!1,se=null,de.set(-1,0,0,0)}}}function n(){let U=!1,re=!1,se=null,de=null,ie=null;return{setReversed:function(Y){if(re!==Y){const pe=e.get("EXT_clip_control");Y?pe.clipControlEXT(pe.LOWER_LEFT_EXT,pe.ZERO_TO_ONE_EXT):pe.clipControlEXT(pe.LOWER_LEFT_EXT,pe.NEGATIVE_ONE_TO_ONE_EXT),re=Y;const Le=ie;ie=null,this.setClear(Le)}},getReversed:function(){return re},setTest:function(Y){Y?ce(i.DEPTH_TEST):oe(i.DEPTH_TEST)},setMask:function(Y){se!==Y&&!U&&(i.depthMask(Y),se=Y)},setFunc:function(Y){if(re&&(Y=Xf[Y]),de!==Y){switch(Y){case oo:i.depthFunc(i.NEVER);break;case co:i.depthFunc(i.ALWAYS);break;case lo:i.depthFunc(i.LESS);break;case Ji:i.depthFunc(i.LEQUAL);break;case uo:i.depthFunc(i.EQUAL);break;case ho:i.depthFunc(i.GEQUAL);break;case fo:i.depthFunc(i.GREATER);break;case po:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}de=Y}},setLocked:function(Y){U=Y},setClear:function(Y){ie!==Y&&(ie=Y,re&&(Y=1-Y),i.clearDepth(Y))},reset:function(){U=!1,se=null,de=null,ie=null,re=!1}}}function s(){let U=!1,re=null,se=null,de=null,ie=null,Y=null,pe=null,Le=null,Je=null;return{setTest:function(Qe){U||(Qe?ce(i.STENCIL_TEST):oe(i.STENCIL_TEST))},setMask:function(Qe){re!==Qe&&!U&&(i.stencilMask(Qe),re=Qe)},setFunc:function(Qe,Gt,Ht){(se!==Qe||de!==Gt||ie!==Ht)&&(i.stencilFunc(Qe,Gt,Ht),se=Qe,de=Gt,ie=Ht)},setOp:function(Qe,Gt,Ht){(Y!==Qe||pe!==Gt||Le!==Ht)&&(i.stencilOp(Qe,Gt,Ht),Y=Qe,pe=Gt,Le=Ht)},setLocked:function(Qe){U=Qe},setClear:function(Qe){Je!==Qe&&(i.clearStencil(Qe),Je=Qe)},reset:function(){U=!1,re=null,se=null,de=null,ie=null,Y=null,pe=null,Le=null,Je=null}}}const r=new t,a=new n,o=new s,l=new WeakMap,c=new WeakMap;let h={},d={},u=new WeakMap,p=[],g=null,v=!1,m=null,f=null,x=null,y=null,S=null,A=null,b=null,w=new Ne(0,0,0),_=0,E=!1,L=null,C=null,N=null,I=null,z=null;const F=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let O=!1,H=0;const K=i.getParameter(i.VERSION);K.indexOf("WebGL")!==-1?(H=parseFloat(/^WebGL (\d)/.exec(K)[1]),O=H>=1):K.indexOf("OpenGL ES")!==-1&&(H=parseFloat(/^OpenGL ES (\d)/.exec(K)[1]),O=H>=2);let Z=null,ne={};const le=i.getParameter(i.SCISSOR_BOX),ae=i.getParameter(i.VIEWPORT),Re=new mt().fromArray(le),De=new mt().fromArray(ae);function Ye(U,re,se,de){const ie=new Uint8Array(4),Y=i.createTexture();i.bindTexture(U,Y),i.texParameteri(U,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(U,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let pe=0;pe<se;pe++)U===i.TEXTURE_3D||U===i.TEXTURE_2D_ARRAY?i.texImage3D(re,0,i.RGBA,1,1,de,0,i.RGBA,i.UNSIGNED_BYTE,ie):i.texImage2D(re+pe,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,ie);return Y}const j={};j[i.TEXTURE_2D]=Ye(i.TEXTURE_2D,i.TEXTURE_2D,1),j[i.TEXTURE_CUBE_MAP]=Ye(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),j[i.TEXTURE_2D_ARRAY]=Ye(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),j[i.TEXTURE_3D]=Ye(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),a.setClear(1),o.setClear(0),ce(i.DEPTH_TEST),a.setFunc(Ji),Me(!1),Ke(jc),ce(i.CULL_FACE),$e(Tn);function ce(U){h[U]!==!0&&(i.enable(U),h[U]=!0)}function oe(U){h[U]!==!1&&(i.disable(U),h[U]=!1)}function Ue(U,re){return d[U]!==re?(i.bindFramebuffer(U,re),d[U]=re,U===i.DRAW_FRAMEBUFFER&&(d[i.FRAMEBUFFER]=re),U===i.FRAMEBUFFER&&(d[i.DRAW_FRAMEBUFFER]=re),!0):!1}function Te(U,re){let se=p,de=!1;if(U){se=u.get(re),se===void 0&&(se=[],u.set(re,se));const ie=U.textures;if(se.length!==ie.length||se[0]!==i.COLOR_ATTACHMENT0){for(let Y=0,pe=ie.length;Y<pe;Y++)se[Y]=i.COLOR_ATTACHMENT0+Y;se.length=ie.length,de=!0}}else se[0]!==i.BACK&&(se[0]=i.BACK,de=!0);de&&i.drawBuffers(se)}function Ce(U){return g!==U?(i.useProgram(U),g=U,!0):!1}const rt={[ri]:i.FUNC_ADD,[pf]:i.FUNC_SUBTRACT,[mf]:i.FUNC_REVERSE_SUBTRACT};rt[gf]=i.MIN,rt[_f]=i.MAX;const Xe={[xf]:i.ZERO,[vf]:i.ONE,[Mf]:i.SRC_COLOR,[ro]:i.SRC_ALPHA,[Af]:i.SRC_ALPHA_SATURATE,[bf]:i.DST_COLOR,[Ef]:i.DST_ALPHA,[Sf]:i.ONE_MINUS_SRC_COLOR,[ao]:i.ONE_MINUS_SRC_ALPHA,[Tf]:i.ONE_MINUS_DST_COLOR,[yf]:i.ONE_MINUS_DST_ALPHA,[wf]:i.CONSTANT_COLOR,[Rf]:i.ONE_MINUS_CONSTANT_COLOR,[Cf]:i.CONSTANT_ALPHA,[Pf]:i.ONE_MINUS_CONSTANT_ALPHA};function $e(U,re,se,de,ie,Y,pe,Le,Je,Qe){if(U===Tn){v===!0&&(oe(i.BLEND),v=!1);return}if(v===!1&&(ce(i.BLEND),v=!0),U!==ff){if(U!==m||Qe!==E){if((f!==ri||S!==ri)&&(i.blendEquation(i.FUNC_ADD),f=ri,S=ri),Qe)switch(U){case Ki:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case so:i.blendFunc(i.ONE,i.ONE);break;case Jc:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case Qc:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:et("WebGLState: Invalid blending: ",U);break}else switch(U){case Ki:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case so:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case Jc:et("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Qc:et("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:et("WebGLState: Invalid blending: ",U);break}x=null,y=null,A=null,b=null,w.set(0,0,0),_=0,m=U,E=Qe}return}ie=ie||re,Y=Y||se,pe=pe||de,(re!==f||ie!==S)&&(i.blendEquationSeparate(rt[re],rt[ie]),f=re,S=ie),(se!==x||de!==y||Y!==A||pe!==b)&&(i.blendFuncSeparate(Xe[se],Xe[de],Xe[Y],Xe[pe]),x=se,y=de,A=Y,b=pe),(Le.equals(w)===!1||Je!==_)&&(i.blendColor(Le.r,Le.g,Le.b,Je),w.copy(Le),_=Je),m=U,E=!1}function it(U,re){U.side===En?oe(i.CULL_FACE):ce(i.CULL_FACE);let se=U.side===It;re&&(se=!se),Me(se),U.blending===Ki&&U.transparent===!1?$e(Tn):$e(U.blending,U.blendEquation,U.blendSrc,U.blendDst,U.blendEquationAlpha,U.blendSrcAlpha,U.blendDstAlpha,U.blendColor,U.blendAlpha,U.premultipliedAlpha),a.setFunc(U.depthFunc),a.setTest(U.depthTest),a.setMask(U.depthWrite),r.setMask(U.colorWrite);const de=U.stencilWrite;o.setTest(de),de&&(o.setMask(U.stencilWriteMask),o.setFunc(U.stencilFunc,U.stencilRef,U.stencilFuncMask),o.setOp(U.stencilFail,U.stencilZFail,U.stencilZPass)),qe(U.polygonOffset,U.polygonOffsetFactor,U.polygonOffsetUnits),U.alphaToCoverage===!0?ce(i.SAMPLE_ALPHA_TO_COVERAGE):oe(i.SAMPLE_ALPHA_TO_COVERAGE)}function Me(U){L!==U&&(U?i.frontFace(i.CW):i.frontFace(i.CCW),L=U)}function Ke(U){U!==hf?(ce(i.CULL_FACE),U!==C&&(U===jc?i.cullFace(i.BACK):U===df?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):oe(i.CULL_FACE),C=U}function P(U){U!==N&&(O&&i.lineWidth(U),N=U)}function qe(U,re,se){U?(ce(i.POLYGON_OFFSET_FILL),(I!==re||z!==se)&&(I=re,z=se,a.getReversed()&&(re=-re),i.polygonOffset(re,se))):oe(i.POLYGON_OFFSET_FILL)}function He(U){U?ce(i.SCISSOR_TEST):oe(i.SCISSOR_TEST)}function st(U){U===void 0&&(U=i.TEXTURE0+F-1),Z!==U&&(i.activeTexture(U),Z=U)}function Se(U,re,se){se===void 0&&(Z===null?se=i.TEXTURE0+F-1:se=Z);let de=ne[se];de===void 0&&(de={type:void 0,texture:void 0},ne[se]=de),(de.type!==U||de.texture!==re)&&(Z!==se&&(i.activeTexture(se),Z=se),i.bindTexture(U,re||j[U]),de.type=U,de.texture=re)}function R(){const U=ne[Z];U!==void 0&&U.type!==void 0&&(i.bindTexture(U.type,null),U.type=void 0,U.texture=void 0)}function M(){try{i.compressedTexImage2D(...arguments)}catch(U){et("WebGLState:",U)}}function B(){try{i.compressedTexImage3D(...arguments)}catch(U){et("WebGLState:",U)}}function J(){try{i.texSubImage2D(...arguments)}catch(U){et("WebGLState:",U)}}function ee(){try{i.texSubImage3D(...arguments)}catch(U){et("WebGLState:",U)}}function q(){try{i.compressedTexSubImage2D(...arguments)}catch(U){et("WebGLState:",U)}}function Ee(){try{i.compressedTexSubImage3D(...arguments)}catch(U){et("WebGLState:",U)}}function W(){try{i.texStorage2D(...arguments)}catch(U){et("WebGLState:",U)}}function Q(){try{i.texStorage3D(...arguments)}catch(U){et("WebGLState:",U)}}function _e(){try{i.texImage2D(...arguments)}catch(U){et("WebGLState:",U)}}function $(){try{i.texImage3D(...arguments)}catch(U){et("WebGLState:",U)}}function te(U){Re.equals(U)===!1&&(i.scissor(U.x,U.y,U.z,U.w),Re.copy(U))}function he(U){De.equals(U)===!1&&(i.viewport(U.x,U.y,U.z,U.w),De.copy(U))}function xe(U,re){let se=c.get(re);se===void 0&&(se=new WeakMap,c.set(re,se));let de=se.get(U);de===void 0&&(de=i.getUniformBlockIndex(re,U.name),se.set(U,de))}function ue(U,re){const de=c.get(re).get(U);l.get(re)!==de&&(i.uniformBlockBinding(re,de,U.__bindingPointIndex),l.set(re,de))}function Pe(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),a.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),h={},Z=null,ne={},d={},u=new WeakMap,p=[],g=null,v=!1,m=null,f=null,x=null,y=null,S=null,A=null,b=null,w=new Ne(0,0,0),_=0,E=!1,L=null,C=null,N=null,I=null,z=null,Re.set(0,0,i.canvas.width,i.canvas.height),De.set(0,0,i.canvas.width,i.canvas.height),r.reset(),a.reset(),o.reset()}return{buffers:{color:r,depth:a,stencil:o},enable:ce,disable:oe,bindFramebuffer:Ue,drawBuffers:Te,useProgram:Ce,setBlending:$e,setMaterial:it,setFlipSided:Me,setCullFace:Ke,setLineWidth:P,setPolygonOffset:qe,setScissorTest:He,activeTexture:st,bindTexture:Se,unbindTexture:R,compressedTexImage2D:M,compressedTexImage3D:B,texImage2D:_e,texImage3D:$,updateUBOMapping:xe,uniformBlockBinding:ue,texStorage2D:W,texStorage3D:Q,texSubImage2D:J,texSubImage3D:ee,compressedTexSubImage2D:q,compressedTexSubImage3D:Ee,scissor:te,viewport:he,reset:Pe}}function mx(i,e,t,n,s,r,a){const o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Fe,h=new WeakMap;let d;const u=new WeakMap;let p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(R,M){return p?new OffscreenCanvas(R,M):Or("canvas")}function v(R,M,B){let J=1;const ee=Se(R);if((ee.width>B||ee.height>B)&&(J=B/Math.max(ee.width,ee.height)),J<1)if(typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&R instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&R instanceof ImageBitmap||typeof VideoFrame<"u"&&R instanceof VideoFrame){const q=Math.floor(J*ee.width),Ee=Math.floor(J*ee.height);d===void 0&&(d=g(q,Ee));const W=M?g(q,Ee):d;return W.width=q,W.height=Ee,W.getContext("2d").drawImage(R,0,0,q,Ee),Oe("WebGLRenderer: Texture has been resized from ("+ee.width+"x"+ee.height+") to ("+q+"x"+Ee+")."),W}else return"data"in R&&Oe("WebGLRenderer: Image in DataTexture is too big ("+ee.width+"x"+ee.height+")."),R;return R}function m(R){return R.generateMipmaps}function f(R){i.generateMipmap(R)}function x(R){return R.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:R.isWebGL3DRenderTarget?i.TEXTURE_3D:R.isWebGLArrayRenderTarget||R.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function y(R,M,B,J,ee=!1){if(R!==null){if(i[R]!==void 0)return i[R];Oe("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+R+"'")}let q=M;if(M===i.RED&&(B===i.FLOAT&&(q=i.R32F),B===i.HALF_FLOAT&&(q=i.R16F),B===i.UNSIGNED_BYTE&&(q=i.R8)),M===i.RED_INTEGER&&(B===i.UNSIGNED_BYTE&&(q=i.R8UI),B===i.UNSIGNED_SHORT&&(q=i.R16UI),B===i.UNSIGNED_INT&&(q=i.R32UI),B===i.BYTE&&(q=i.R8I),B===i.SHORT&&(q=i.R16I),B===i.INT&&(q=i.R32I)),M===i.RG&&(B===i.FLOAT&&(q=i.RG32F),B===i.HALF_FLOAT&&(q=i.RG16F),B===i.UNSIGNED_BYTE&&(q=i.RG8)),M===i.RG_INTEGER&&(B===i.UNSIGNED_BYTE&&(q=i.RG8UI),B===i.UNSIGNED_SHORT&&(q=i.RG16UI),B===i.UNSIGNED_INT&&(q=i.RG32UI),B===i.BYTE&&(q=i.RG8I),B===i.SHORT&&(q=i.RG16I),B===i.INT&&(q=i.RG32I)),M===i.RGB_INTEGER&&(B===i.UNSIGNED_BYTE&&(q=i.RGB8UI),B===i.UNSIGNED_SHORT&&(q=i.RGB16UI),B===i.UNSIGNED_INT&&(q=i.RGB32UI),B===i.BYTE&&(q=i.RGB8I),B===i.SHORT&&(q=i.RGB16I),B===i.INT&&(q=i.RGB32I)),M===i.RGBA_INTEGER&&(B===i.UNSIGNED_BYTE&&(q=i.RGBA8UI),B===i.UNSIGNED_SHORT&&(q=i.RGBA16UI),B===i.UNSIGNED_INT&&(q=i.RGBA32UI),B===i.BYTE&&(q=i.RGBA8I),B===i.SHORT&&(q=i.RGBA16I),B===i.INT&&(q=i.RGBA32I)),M===i.RGB&&(B===i.UNSIGNED_INT_5_9_9_9_REV&&(q=i.RGB9_E5),B===i.UNSIGNED_INT_10F_11F_11F_REV&&(q=i.R11F_G11F_B10F)),M===i.RGBA){const Ee=ee?Fr:tt.getTransfer(J);B===i.FLOAT&&(q=i.RGBA32F),B===i.HALF_FLOAT&&(q=i.RGBA16F),B===i.UNSIGNED_BYTE&&(q=Ee===ot?i.SRGB8_ALPHA8:i.RGBA8),B===i.UNSIGNED_SHORT_4_4_4_4&&(q=i.RGBA4),B===i.UNSIGNED_SHORT_5_5_5_1&&(q=i.RGB5_A1)}return(q===i.R16F||q===i.R32F||q===i.RG16F||q===i.RG32F||q===i.RGBA16F||q===i.RGBA32F)&&e.get("EXT_color_buffer_float"),q}function S(R,M){let B;return R?M===null||M===gn||M===Is?B=i.DEPTH24_STENCIL8:M===an?B=i.DEPTH32F_STENCIL8:M===Ds&&(B=i.DEPTH24_STENCIL8,Oe("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):M===null||M===gn||M===Is?B=i.DEPTH_COMPONENT24:M===an?B=i.DEPTH_COMPONENT32F:M===Ds&&(B=i.DEPTH_COMPONENT16),B}function A(R,M){return m(R)===!0||R.isFramebufferTexture&&R.minFilter!==Rt&&R.minFilter!==Tt?Math.log2(Math.max(M.width,M.height))+1:R.mipmaps!==void 0&&R.mipmaps.length>0?R.mipmaps.length:R.isCompressedTexture&&Array.isArray(R.image)?M.mipmaps.length:1}function b(R){const M=R.target;M.removeEventListener("dispose",b),_(M),M.isVideoTexture&&h.delete(M)}function w(R){const M=R.target;M.removeEventListener("dispose",w),L(M)}function _(R){const M=n.get(R);if(M.__webglInit===void 0)return;const B=R.source,J=u.get(B);if(J){const ee=J[M.__cacheKey];ee.usedTimes--,ee.usedTimes===0&&E(R),Object.keys(J).length===0&&u.delete(B)}n.remove(R)}function E(R){const M=n.get(R);i.deleteTexture(M.__webglTexture);const B=R.source,J=u.get(B);delete J[M.__cacheKey],a.memory.textures--}function L(R){const M=n.get(R);if(R.depthTexture&&(R.depthTexture.dispose(),n.remove(R.depthTexture)),R.isWebGLCubeRenderTarget)for(let J=0;J<6;J++){if(Array.isArray(M.__webglFramebuffer[J]))for(let ee=0;ee<M.__webglFramebuffer[J].length;ee++)i.deleteFramebuffer(M.__webglFramebuffer[J][ee]);else i.deleteFramebuffer(M.__webglFramebuffer[J]);M.__webglDepthbuffer&&i.deleteRenderbuffer(M.__webglDepthbuffer[J])}else{if(Array.isArray(M.__webglFramebuffer))for(let J=0;J<M.__webglFramebuffer.length;J++)i.deleteFramebuffer(M.__webglFramebuffer[J]);else i.deleteFramebuffer(M.__webglFramebuffer);if(M.__webglDepthbuffer&&i.deleteRenderbuffer(M.__webglDepthbuffer),M.__webglMultisampledFramebuffer&&i.deleteFramebuffer(M.__webglMultisampledFramebuffer),M.__webglColorRenderbuffer)for(let J=0;J<M.__webglColorRenderbuffer.length;J++)M.__webglColorRenderbuffer[J]&&i.deleteRenderbuffer(M.__webglColorRenderbuffer[J]);M.__webglDepthRenderbuffer&&i.deleteRenderbuffer(M.__webglDepthRenderbuffer)}const B=R.textures;for(let J=0,ee=B.length;J<ee;J++){const q=n.get(B[J]);q.__webglTexture&&(i.deleteTexture(q.__webglTexture),a.memory.textures--),n.remove(B[J])}n.remove(R)}let C=0;function N(){C=0}function I(){const R=C;return R>=s.maxTextures&&Oe("WebGLTextures: Trying to use "+R+" texture units while this GPU supports only "+s.maxTextures),C+=1,R}function z(R){const M=[];return M.push(R.wrapS),M.push(R.wrapT),M.push(R.wrapR||0),M.push(R.magFilter),M.push(R.minFilter),M.push(R.anisotropy),M.push(R.internalFormat),M.push(R.format),M.push(R.type),M.push(R.generateMipmaps),M.push(R.premultiplyAlpha),M.push(R.flipY),M.push(R.unpackAlignment),M.push(R.colorSpace),M.join()}function F(R,M){const B=n.get(R);if(R.isVideoTexture&&He(R),R.isRenderTargetTexture===!1&&R.isExternalTexture!==!0&&R.version>0&&B.__version!==R.version){const J=R.image;if(J===null)Oe("WebGLRenderer: Texture marked for update but no image data found.");else if(J.complete===!1)Oe("WebGLRenderer: Texture marked for update but image is incomplete");else{j(B,R,M);return}}else R.isExternalTexture&&(B.__webglTexture=R.sourceTexture?R.sourceTexture:null);t.bindTexture(i.TEXTURE_2D,B.__webglTexture,i.TEXTURE0+M)}function O(R,M){const B=n.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&B.__version!==R.version){j(B,R,M);return}else R.isExternalTexture&&(B.__webglTexture=R.sourceTexture?R.sourceTexture:null);t.bindTexture(i.TEXTURE_2D_ARRAY,B.__webglTexture,i.TEXTURE0+M)}function H(R,M){const B=n.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&B.__version!==R.version){j(B,R,M);return}t.bindTexture(i.TEXTURE_3D,B.__webglTexture,i.TEXTURE0+M)}function K(R,M){const B=n.get(R);if(R.isCubeDepthTexture!==!0&&R.version>0&&B.__version!==R.version){ce(B,R,M);return}t.bindTexture(i.TEXTURE_CUBE_MAP,B.__webglTexture,i.TEXTURE0+M)}const Z={[mi]:i.REPEAT,[bn]:i.CLAMP_TO_EDGE,[mo]:i.MIRRORED_REPEAT},ne={[Rt]:i.NEAREST,[If]:i.NEAREST_MIPMAP_NEAREST,[Xs]:i.NEAREST_MIPMAP_LINEAR,[Tt]:i.LINEAR,[pa]:i.LINEAR_MIPMAP_NEAREST,[ci]:i.LINEAR_MIPMAP_LINEAR},le={[Ff]:i.NEVER,[Hf]:i.ALWAYS,[Of]:i.LESS,[xc]:i.LEQUAL,[Bf]:i.EQUAL,[vc]:i.GEQUAL,[zf]:i.GREATER,[Gf]:i.NOTEQUAL};function ae(R,M){if(M.type===an&&e.has("OES_texture_float_linear")===!1&&(M.magFilter===Tt||M.magFilter===pa||M.magFilter===Xs||M.magFilter===ci||M.minFilter===Tt||M.minFilter===pa||M.minFilter===Xs||M.minFilter===ci)&&Oe("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(R,i.TEXTURE_WRAP_S,Z[M.wrapS]),i.texParameteri(R,i.TEXTURE_WRAP_T,Z[M.wrapT]),(R===i.TEXTURE_3D||R===i.TEXTURE_2D_ARRAY)&&i.texParameteri(R,i.TEXTURE_WRAP_R,Z[M.wrapR]),i.texParameteri(R,i.TEXTURE_MAG_FILTER,ne[M.magFilter]),i.texParameteri(R,i.TEXTURE_MIN_FILTER,ne[M.minFilter]),M.compareFunction&&(i.texParameteri(R,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(R,i.TEXTURE_COMPARE_FUNC,le[M.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(M.magFilter===Rt||M.minFilter!==Xs&&M.minFilter!==ci||M.type===an&&e.has("OES_texture_float_linear")===!1)return;if(M.anisotropy>1||n.get(M).__currentAnisotropy){const B=e.get("EXT_texture_filter_anisotropic");i.texParameterf(R,B.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(M.anisotropy,s.getMaxAnisotropy())),n.get(M).__currentAnisotropy=M.anisotropy}}}function Re(R,M){let B=!1;R.__webglInit===void 0&&(R.__webglInit=!0,M.addEventListener("dispose",b));const J=M.source;let ee=u.get(J);ee===void 0&&(ee={},u.set(J,ee));const q=z(M);if(q!==R.__cacheKey){ee[q]===void 0&&(ee[q]={texture:i.createTexture(),usedTimes:0},a.memory.textures++,B=!0),ee[q].usedTimes++;const Ee=ee[R.__cacheKey];Ee!==void 0&&(ee[R.__cacheKey].usedTimes--,Ee.usedTimes===0&&E(M)),R.__cacheKey=q,R.__webglTexture=ee[q].texture}return B}function De(R,M,B){return Math.floor(Math.floor(R/B)/M)}function Ye(R,M,B,J){const q=R.updateRanges;if(q.length===0)t.texSubImage2D(i.TEXTURE_2D,0,0,0,M.width,M.height,B,J,M.data);else{q.sort(($,te)=>$.start-te.start);let Ee=0;for(let $=1;$<q.length;$++){const te=q[Ee],he=q[$],xe=te.start+te.count,ue=De(he.start,M.width,4),Pe=De(te.start,M.width,4);he.start<=xe+1&&ue===Pe&&De(he.start+he.count-1,M.width,4)===ue?te.count=Math.max(te.count,he.start+he.count-te.start):(++Ee,q[Ee]=he)}q.length=Ee+1;const W=i.getParameter(i.UNPACK_ROW_LENGTH),Q=i.getParameter(i.UNPACK_SKIP_PIXELS),_e=i.getParameter(i.UNPACK_SKIP_ROWS);i.pixelStorei(i.UNPACK_ROW_LENGTH,M.width);for(let $=0,te=q.length;$<te;$++){const he=q[$],xe=Math.floor(he.start/4),ue=Math.ceil(he.count/4),Pe=xe%M.width,U=Math.floor(xe/M.width),re=ue,se=1;i.pixelStorei(i.UNPACK_SKIP_PIXELS,Pe),i.pixelStorei(i.UNPACK_SKIP_ROWS,U),t.texSubImage2D(i.TEXTURE_2D,0,Pe,U,re,se,B,J,M.data)}R.clearUpdateRanges(),i.pixelStorei(i.UNPACK_ROW_LENGTH,W),i.pixelStorei(i.UNPACK_SKIP_PIXELS,Q),i.pixelStorei(i.UNPACK_SKIP_ROWS,_e)}}function j(R,M,B){let J=i.TEXTURE_2D;(M.isDataArrayTexture||M.isCompressedArrayTexture)&&(J=i.TEXTURE_2D_ARRAY),M.isData3DTexture&&(J=i.TEXTURE_3D);const ee=Re(R,M),q=M.source;t.bindTexture(J,R.__webglTexture,i.TEXTURE0+B);const Ee=n.get(q);if(q.version!==Ee.__version||ee===!0){t.activeTexture(i.TEXTURE0+B);const W=tt.getPrimaries(tt.workingColorSpace),Q=M.colorSpace===yn?null:tt.getPrimaries(M.colorSpace),_e=M.colorSpace===yn||W===Q?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,M.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,M.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,M.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,_e);let $=v(M.image,!1,s.maxTextureSize);$=st(M,$);const te=r.convert(M.format,M.colorSpace),he=r.convert(M.type);let xe=y(M.internalFormat,te,he,M.colorSpace,M.isVideoTexture);ae(J,M);let ue;const Pe=M.mipmaps,U=M.isVideoTexture!==!0,re=Ee.__version===void 0||ee===!0,se=q.dataReady,de=A(M,$);if(M.isDepthTexture)xe=S(M.format===li,M.type),re&&(U?t.texStorage2D(i.TEXTURE_2D,1,xe,$.width,$.height):t.texImage2D(i.TEXTURE_2D,0,xe,$.width,$.height,0,te,he,null));else if(M.isDataTexture)if(Pe.length>0){U&&re&&t.texStorage2D(i.TEXTURE_2D,de,xe,Pe[0].width,Pe[0].height);for(let ie=0,Y=Pe.length;ie<Y;ie++)ue=Pe[ie],U?se&&t.texSubImage2D(i.TEXTURE_2D,ie,0,0,ue.width,ue.height,te,he,ue.data):t.texImage2D(i.TEXTURE_2D,ie,xe,ue.width,ue.height,0,te,he,ue.data);M.generateMipmaps=!1}else U?(re&&t.texStorage2D(i.TEXTURE_2D,de,xe,$.width,$.height),se&&Ye(M,$,te,he)):t.texImage2D(i.TEXTURE_2D,0,xe,$.width,$.height,0,te,he,$.data);else if(M.isCompressedTexture)if(M.isCompressedArrayTexture){U&&re&&t.texStorage3D(i.TEXTURE_2D_ARRAY,de,xe,Pe[0].width,Pe[0].height,$.depth);for(let ie=0,Y=Pe.length;ie<Y;ie++)if(ue=Pe[ie],M.format!==Jt)if(te!==null)if(U){if(se)if(M.layerUpdates.size>0){const pe=Cl(ue.width,ue.height,M.format,M.type);for(const Le of M.layerUpdates){const Je=ue.data.subarray(Le*pe/ue.data.BYTES_PER_ELEMENT,(Le+1)*pe/ue.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,ie,0,0,Le,ue.width,ue.height,1,te,Je)}M.clearLayerUpdates()}else t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,ie,0,0,0,ue.width,ue.height,$.depth,te,ue.data)}else t.compressedTexImage3D(i.TEXTURE_2D_ARRAY,ie,xe,ue.width,ue.height,$.depth,0,ue.data,0,0);else Oe("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else U?se&&t.texSubImage3D(i.TEXTURE_2D_ARRAY,ie,0,0,0,ue.width,ue.height,$.depth,te,he,ue.data):t.texImage3D(i.TEXTURE_2D_ARRAY,ie,xe,ue.width,ue.height,$.depth,0,te,he,ue.data)}else{U&&re&&t.texStorage2D(i.TEXTURE_2D,de,xe,Pe[0].width,Pe[0].height);for(let ie=0,Y=Pe.length;ie<Y;ie++)ue=Pe[ie],M.format!==Jt?te!==null?U?se&&t.compressedTexSubImage2D(i.TEXTURE_2D,ie,0,0,ue.width,ue.height,te,ue.data):t.compressedTexImage2D(i.TEXTURE_2D,ie,xe,ue.width,ue.height,0,ue.data):Oe("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):U?se&&t.texSubImage2D(i.TEXTURE_2D,ie,0,0,ue.width,ue.height,te,he,ue.data):t.texImage2D(i.TEXTURE_2D,ie,xe,ue.width,ue.height,0,te,he,ue.data)}else if(M.isDataArrayTexture)if(U){if(re&&t.texStorage3D(i.TEXTURE_2D_ARRAY,de,xe,$.width,$.height,$.depth),se)if(M.layerUpdates.size>0){const ie=Cl($.width,$.height,M.format,M.type);for(const Y of M.layerUpdates){const pe=$.data.subarray(Y*ie/$.data.BYTES_PER_ELEMENT,(Y+1)*ie/$.data.BYTES_PER_ELEMENT);t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,Y,$.width,$.height,1,te,he,pe)}M.clearLayerUpdates()}else t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,$.width,$.height,$.depth,te,he,$.data)}else t.texImage3D(i.TEXTURE_2D_ARRAY,0,xe,$.width,$.height,$.depth,0,te,he,$.data);else if(M.isData3DTexture)U?(re&&t.texStorage3D(i.TEXTURE_3D,de,xe,$.width,$.height,$.depth),se&&t.texSubImage3D(i.TEXTURE_3D,0,0,0,0,$.width,$.height,$.depth,te,he,$.data)):t.texImage3D(i.TEXTURE_3D,0,xe,$.width,$.height,$.depth,0,te,he,$.data);else if(M.isFramebufferTexture){if(re)if(U)t.texStorage2D(i.TEXTURE_2D,de,xe,$.width,$.height);else{let ie=$.width,Y=$.height;for(let pe=0;pe<de;pe++)t.texImage2D(i.TEXTURE_2D,pe,xe,ie,Y,0,te,he,null),ie>>=1,Y>>=1}}else if(Pe.length>0){if(U&&re){const ie=Se(Pe[0]);t.texStorage2D(i.TEXTURE_2D,de,xe,ie.width,ie.height)}for(let ie=0,Y=Pe.length;ie<Y;ie++)ue=Pe[ie],U?se&&t.texSubImage2D(i.TEXTURE_2D,ie,0,0,te,he,ue):t.texImage2D(i.TEXTURE_2D,ie,xe,te,he,ue);M.generateMipmaps=!1}else if(U){if(re){const ie=Se($);t.texStorage2D(i.TEXTURE_2D,de,xe,ie.width,ie.height)}se&&t.texSubImage2D(i.TEXTURE_2D,0,0,0,te,he,$)}else t.texImage2D(i.TEXTURE_2D,0,xe,te,he,$);m(M)&&f(J),Ee.__version=q.version,M.onUpdate&&M.onUpdate(M)}R.__version=M.version}function ce(R,M,B){if(M.image.length!==6)return;const J=Re(R,M),ee=M.source;t.bindTexture(i.TEXTURE_CUBE_MAP,R.__webglTexture,i.TEXTURE0+B);const q=n.get(ee);if(ee.version!==q.__version||J===!0){t.activeTexture(i.TEXTURE0+B);const Ee=tt.getPrimaries(tt.workingColorSpace),W=M.colorSpace===yn?null:tt.getPrimaries(M.colorSpace),Q=M.colorSpace===yn||Ee===W?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,M.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,M.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,M.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Q);const _e=M.isCompressedTexture||M.image[0].isCompressedTexture,$=M.image[0]&&M.image[0].isDataTexture,te=[];for(let Y=0;Y<6;Y++)!_e&&!$?te[Y]=v(M.image[Y],!0,s.maxCubemapSize):te[Y]=$?M.image[Y].image:M.image[Y],te[Y]=st(M,te[Y]);const he=te[0],xe=r.convert(M.format,M.colorSpace),ue=r.convert(M.type),Pe=y(M.internalFormat,xe,ue,M.colorSpace),U=M.isVideoTexture!==!0,re=q.__version===void 0||J===!0,se=ee.dataReady;let de=A(M,he);ae(i.TEXTURE_CUBE_MAP,M);let ie;if(_e){U&&re&&t.texStorage2D(i.TEXTURE_CUBE_MAP,de,Pe,he.width,he.height);for(let Y=0;Y<6;Y++){ie=te[Y].mipmaps;for(let pe=0;pe<ie.length;pe++){const Le=ie[pe];M.format!==Jt?xe!==null?U?se&&t.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,pe,0,0,Le.width,Le.height,xe,Le.data):t.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,pe,Pe,Le.width,Le.height,0,Le.data):Oe("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):U?se&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,pe,0,0,Le.width,Le.height,xe,ue,Le.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,pe,Pe,Le.width,Le.height,0,xe,ue,Le.data)}}}else{if(ie=M.mipmaps,U&&re){ie.length>0&&de++;const Y=Se(te[0]);t.texStorage2D(i.TEXTURE_CUBE_MAP,de,Pe,Y.width,Y.height)}for(let Y=0;Y<6;Y++)if($){U?se&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,0,0,te[Y].width,te[Y].height,xe,ue,te[Y].data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,Pe,te[Y].width,te[Y].height,0,xe,ue,te[Y].data);for(let pe=0;pe<ie.length;pe++){const Je=ie[pe].image[Y].image;U?se&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,pe+1,0,0,Je.width,Je.height,xe,ue,Je.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,pe+1,Pe,Je.width,Je.height,0,xe,ue,Je.data)}}else{U?se&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,0,0,xe,ue,te[Y]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,Pe,xe,ue,te[Y]);for(let pe=0;pe<ie.length;pe++){const Le=ie[pe];U?se&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,pe+1,0,0,xe,ue,Le.image[Y]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,pe+1,Pe,xe,ue,Le.image[Y])}}}m(M)&&f(i.TEXTURE_CUBE_MAP),q.__version=ee.version,M.onUpdate&&M.onUpdate(M)}R.__version=M.version}function oe(R,M,B,J,ee,q){const Ee=r.convert(B.format,B.colorSpace),W=r.convert(B.type),Q=y(B.internalFormat,Ee,W,B.colorSpace),_e=n.get(M),$=n.get(B);if($.__renderTarget=M,!_e.__hasExternalTextures){const te=Math.max(1,M.width>>q),he=Math.max(1,M.height>>q);ee===i.TEXTURE_3D||ee===i.TEXTURE_2D_ARRAY?t.texImage3D(ee,q,Q,te,he,M.depth,0,Ee,W,null):t.texImage2D(ee,q,Q,te,he,0,Ee,W,null)}t.bindFramebuffer(i.FRAMEBUFFER,R),qe(M)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,J,ee,$.__webglTexture,0,P(M)):(ee===i.TEXTURE_2D||ee>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&ee<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,J,ee,$.__webglTexture,q),t.bindFramebuffer(i.FRAMEBUFFER,null)}function Ue(R,M,B){if(i.bindRenderbuffer(i.RENDERBUFFER,R),M.depthBuffer){const J=M.depthTexture,ee=J&&J.isDepthTexture?J.type:null,q=S(M.stencilBuffer,ee),Ee=M.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;qe(M)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,P(M),q,M.width,M.height):B?i.renderbufferStorageMultisample(i.RENDERBUFFER,P(M),q,M.width,M.height):i.renderbufferStorage(i.RENDERBUFFER,q,M.width,M.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,Ee,i.RENDERBUFFER,R)}else{const J=M.textures;for(let ee=0;ee<J.length;ee++){const q=J[ee],Ee=r.convert(q.format,q.colorSpace),W=r.convert(q.type),Q=y(q.internalFormat,Ee,W,q.colorSpace);qe(M)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,P(M),Q,M.width,M.height):B?i.renderbufferStorageMultisample(i.RENDERBUFFER,P(M),Q,M.width,M.height):i.renderbufferStorage(i.RENDERBUFFER,Q,M.width,M.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Te(R,M,B){const J=M.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(i.FRAMEBUFFER,R),!(M.depthTexture&&M.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");const ee=n.get(M.depthTexture);if(ee.__renderTarget=M,(!ee.__webglTexture||M.depthTexture.image.width!==M.width||M.depthTexture.image.height!==M.height)&&(M.depthTexture.image.width=M.width,M.depthTexture.image.height=M.height,M.depthTexture.needsUpdate=!0),J){if(ee.__webglInit===void 0&&(ee.__webglInit=!0,M.depthTexture.addEventListener("dispose",b)),ee.__webglTexture===void 0){ee.__webglTexture=i.createTexture(),t.bindTexture(i.TEXTURE_CUBE_MAP,ee.__webglTexture),ae(i.TEXTURE_CUBE_MAP,M.depthTexture);const _e=r.convert(M.depthTexture.format),$=r.convert(M.depthTexture.type);let te;M.depthTexture.format===Cn?te=i.DEPTH_COMPONENT24:M.depthTexture.format===li&&(te=i.DEPTH24_STENCIL8);for(let he=0;he<6;he++)i.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+he,0,te,M.width,M.height,0,_e,$,null)}}else F(M.depthTexture,0);const q=ee.__webglTexture,Ee=P(M),W=J?i.TEXTURE_CUBE_MAP_POSITIVE_X+B:i.TEXTURE_2D,Q=M.depthTexture.format===li?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(M.depthTexture.format===Cn)qe(M)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Q,W,q,0,Ee):i.framebufferTexture2D(i.FRAMEBUFFER,Q,W,q,0);else if(M.depthTexture.format===li)qe(M)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Q,W,q,0,Ee):i.framebufferTexture2D(i.FRAMEBUFFER,Q,W,q,0);else throw new Error("Unknown depthTexture format")}function Ce(R){const M=n.get(R),B=R.isWebGLCubeRenderTarget===!0;if(M.__boundDepthTexture!==R.depthTexture){const J=R.depthTexture;if(M.__depthDisposeCallback&&M.__depthDisposeCallback(),J){const ee=()=>{delete M.__boundDepthTexture,delete M.__depthDisposeCallback,J.removeEventListener("dispose",ee)};J.addEventListener("dispose",ee),M.__depthDisposeCallback=ee}M.__boundDepthTexture=J}if(R.depthTexture&&!M.__autoAllocateDepthBuffer)if(B)for(let J=0;J<6;J++)Te(M.__webglFramebuffer[J],R,J);else{const J=R.texture.mipmaps;J&&J.length>0?Te(M.__webglFramebuffer[0],R,0):Te(M.__webglFramebuffer,R,0)}else if(B){M.__webglDepthbuffer=[];for(let J=0;J<6;J++)if(t.bindFramebuffer(i.FRAMEBUFFER,M.__webglFramebuffer[J]),M.__webglDepthbuffer[J]===void 0)M.__webglDepthbuffer[J]=i.createRenderbuffer(),Ue(M.__webglDepthbuffer[J],R,!1);else{const ee=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,q=M.__webglDepthbuffer[J];i.bindRenderbuffer(i.RENDERBUFFER,q),i.framebufferRenderbuffer(i.FRAMEBUFFER,ee,i.RENDERBUFFER,q)}}else{const J=R.texture.mipmaps;if(J&&J.length>0?t.bindFramebuffer(i.FRAMEBUFFER,M.__webglFramebuffer[0]):t.bindFramebuffer(i.FRAMEBUFFER,M.__webglFramebuffer),M.__webglDepthbuffer===void 0)M.__webglDepthbuffer=i.createRenderbuffer(),Ue(M.__webglDepthbuffer,R,!1);else{const ee=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,q=M.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,q),i.framebufferRenderbuffer(i.FRAMEBUFFER,ee,i.RENDERBUFFER,q)}}t.bindFramebuffer(i.FRAMEBUFFER,null)}function rt(R,M,B){const J=n.get(R);M!==void 0&&oe(J.__webglFramebuffer,R,R.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),B!==void 0&&Ce(R)}function Xe(R){const M=R.texture,B=n.get(R),J=n.get(M);R.addEventListener("dispose",w);const ee=R.textures,q=R.isWebGLCubeRenderTarget===!0,Ee=ee.length>1;if(Ee||(J.__webglTexture===void 0&&(J.__webglTexture=i.createTexture()),J.__version=M.version,a.memory.textures++),q){B.__webglFramebuffer=[];for(let W=0;W<6;W++)if(M.mipmaps&&M.mipmaps.length>0){B.__webglFramebuffer[W]=[];for(let Q=0;Q<M.mipmaps.length;Q++)B.__webglFramebuffer[W][Q]=i.createFramebuffer()}else B.__webglFramebuffer[W]=i.createFramebuffer()}else{if(M.mipmaps&&M.mipmaps.length>0){B.__webglFramebuffer=[];for(let W=0;W<M.mipmaps.length;W++)B.__webglFramebuffer[W]=i.createFramebuffer()}else B.__webglFramebuffer=i.createFramebuffer();if(Ee)for(let W=0,Q=ee.length;W<Q;W++){const _e=n.get(ee[W]);_e.__webglTexture===void 0&&(_e.__webglTexture=i.createTexture(),a.memory.textures++)}if(R.samples>0&&qe(R)===!1){B.__webglMultisampledFramebuffer=i.createFramebuffer(),B.__webglColorRenderbuffer=[],t.bindFramebuffer(i.FRAMEBUFFER,B.__webglMultisampledFramebuffer);for(let W=0;W<ee.length;W++){const Q=ee[W];B.__webglColorRenderbuffer[W]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,B.__webglColorRenderbuffer[W]);const _e=r.convert(Q.format,Q.colorSpace),$=r.convert(Q.type),te=y(Q.internalFormat,_e,$,Q.colorSpace,R.isXRRenderTarget===!0),he=P(R);i.renderbufferStorageMultisample(i.RENDERBUFFER,he,te,R.width,R.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+W,i.RENDERBUFFER,B.__webglColorRenderbuffer[W])}i.bindRenderbuffer(i.RENDERBUFFER,null),R.depthBuffer&&(B.__webglDepthRenderbuffer=i.createRenderbuffer(),Ue(B.__webglDepthRenderbuffer,R,!0)),t.bindFramebuffer(i.FRAMEBUFFER,null)}}if(q){t.bindTexture(i.TEXTURE_CUBE_MAP,J.__webglTexture),ae(i.TEXTURE_CUBE_MAP,M);for(let W=0;W<6;W++)if(M.mipmaps&&M.mipmaps.length>0)for(let Q=0;Q<M.mipmaps.length;Q++)oe(B.__webglFramebuffer[W][Q],R,M,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+W,Q);else oe(B.__webglFramebuffer[W],R,M,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+W,0);m(M)&&f(i.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(Ee){for(let W=0,Q=ee.length;W<Q;W++){const _e=ee[W],$=n.get(_e);let te=i.TEXTURE_2D;(R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(te=R.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(te,$.__webglTexture),ae(te,_e),oe(B.__webglFramebuffer,R,_e,i.COLOR_ATTACHMENT0+W,te,0),m(_e)&&f(te)}t.unbindTexture()}else{let W=i.TEXTURE_2D;if((R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(W=R.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(W,J.__webglTexture),ae(W,M),M.mipmaps&&M.mipmaps.length>0)for(let Q=0;Q<M.mipmaps.length;Q++)oe(B.__webglFramebuffer[Q],R,M,i.COLOR_ATTACHMENT0,W,Q);else oe(B.__webglFramebuffer,R,M,i.COLOR_ATTACHMENT0,W,0);m(M)&&f(W),t.unbindTexture()}R.depthBuffer&&Ce(R)}function $e(R){const M=R.textures;for(let B=0,J=M.length;B<J;B++){const ee=M[B];if(m(ee)){const q=x(R),Ee=n.get(ee).__webglTexture;t.bindTexture(q,Ee),f(q),t.unbindTexture()}}}const it=[],Me=[];function Ke(R){if(R.samples>0){if(qe(R)===!1){const M=R.textures,B=R.width,J=R.height;let ee=i.COLOR_BUFFER_BIT;const q=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,Ee=n.get(R),W=M.length>1;if(W)for(let _e=0;_e<M.length;_e++)t.bindFramebuffer(i.FRAMEBUFFER,Ee.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+_e,i.RENDERBUFFER,null),t.bindFramebuffer(i.FRAMEBUFFER,Ee.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+_e,i.TEXTURE_2D,null,0);t.bindFramebuffer(i.READ_FRAMEBUFFER,Ee.__webglMultisampledFramebuffer);const Q=R.texture.mipmaps;Q&&Q.length>0?t.bindFramebuffer(i.DRAW_FRAMEBUFFER,Ee.__webglFramebuffer[0]):t.bindFramebuffer(i.DRAW_FRAMEBUFFER,Ee.__webglFramebuffer);for(let _e=0;_e<M.length;_e++){if(R.resolveDepthBuffer&&(R.depthBuffer&&(ee|=i.DEPTH_BUFFER_BIT),R.stencilBuffer&&R.resolveStencilBuffer&&(ee|=i.STENCIL_BUFFER_BIT)),W){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,Ee.__webglColorRenderbuffer[_e]);const $=n.get(M[_e]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,$,0)}i.blitFramebuffer(0,0,B,J,0,0,B,J,ee,i.NEAREST),l===!0&&(it.length=0,Me.length=0,it.push(i.COLOR_ATTACHMENT0+_e),R.depthBuffer&&R.resolveDepthBuffer===!1&&(it.push(q),Me.push(q),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,Me)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,it))}if(t.bindFramebuffer(i.READ_FRAMEBUFFER,null),t.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),W)for(let _e=0;_e<M.length;_e++){t.bindFramebuffer(i.FRAMEBUFFER,Ee.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+_e,i.RENDERBUFFER,Ee.__webglColorRenderbuffer[_e]);const $=n.get(M[_e]).__webglTexture;t.bindFramebuffer(i.FRAMEBUFFER,Ee.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+_e,i.TEXTURE_2D,$,0)}t.bindFramebuffer(i.DRAW_FRAMEBUFFER,Ee.__webglMultisampledFramebuffer)}else if(R.depthBuffer&&R.resolveDepthBuffer===!1&&l){const M=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[M])}}}function P(R){return Math.min(s.maxSamples,R.samples)}function qe(R){const M=n.get(R);return R.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&M.__useRenderToTexture!==!1}function He(R){const M=a.render.frame;h.get(R)!==M&&(h.set(R,M),R.update())}function st(R,M){const B=R.colorSpace,J=R.format,ee=R.type;return R.isCompressedTexture===!0||R.isVideoTexture===!0||B!==ts&&B!==yn&&(tt.getTransfer(B)===ot?(J!==Jt||ee!==qt)&&Oe("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):et("WebGLTextures: Unsupported texture color space:",B)),M}function Se(R){return typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement?(c.width=R.naturalWidth||R.width,c.height=R.naturalHeight||R.height):typeof VideoFrame<"u"&&R instanceof VideoFrame?(c.width=R.displayWidth,c.height=R.displayHeight):(c.width=R.width,c.height=R.height),c}this.allocateTextureUnit=I,this.resetTextureUnits=N,this.setTexture2D=F,this.setTexture2DArray=O,this.setTexture3D=H,this.setTextureCube=K,this.rebindTextures=rt,this.setupRenderTarget=Xe,this.updateRenderTargetMipmap=$e,this.updateMultisampleRenderTarget=Ke,this.setupDepthRenderbuffer=Ce,this.setupFrameBufferTexture=oe,this.useMultisampledRTT=qe,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function gx(i,e){function t(n,s=yn){let r;const a=tt.getTransfer(s);if(n===qt)return i.UNSIGNED_BYTE;if(n===dc)return i.UNSIGNED_SHORT_4_4_4_4;if(n===fc)return i.UNSIGNED_SHORT_5_5_5_1;if(n===Ju)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===Qu)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===Zu)return i.BYTE;if(n===ju)return i.SHORT;if(n===Ds)return i.UNSIGNED_SHORT;if(n===hc)return i.INT;if(n===gn)return i.UNSIGNED_INT;if(n===an)return i.FLOAT;if(n===Rn)return i.HALF_FLOAT;if(n===eh)return i.ALPHA;if(n===th)return i.RGB;if(n===Jt)return i.RGBA;if(n===Cn)return i.DEPTH_COMPONENT;if(n===li)return i.DEPTH_STENCIL;if(n===pc)return i.RED;if(n===mc)return i.RED_INTEGER;if(n===es)return i.RG;if(n===gc)return i.RG_INTEGER;if(n===_c)return i.RGBA_INTEGER;if(n===wr||n===Rr||n===Cr||n===Pr)if(a===ot)if(r=e.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===wr)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Rr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Cr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Pr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=e.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===wr)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Rr)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Cr)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Pr)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===go||n===_o||n===xo||n===vo)if(r=e.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===go)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===_o)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===xo)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===vo)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===Mo||n===So||n===Eo||n===yo||n===bo||n===To||n===Ao)if(r=e.get("WEBGL_compressed_texture_etc"),r!==null){if(n===Mo||n===So)return a===ot?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===Eo)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===yo)return r.COMPRESSED_R11_EAC;if(n===bo)return r.COMPRESSED_SIGNED_R11_EAC;if(n===To)return r.COMPRESSED_RG11_EAC;if(n===Ao)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===wo||n===Ro||n===Co||n===Po||n===Lo||n===Do||n===Io||n===Uo||n===No||n===Fo||n===Oo||n===Bo||n===zo||n===Go)if(r=e.get("WEBGL_compressed_texture_astc"),r!==null){if(n===wo)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===Ro)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===Co)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===Po)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===Lo)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Do)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Io)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===Uo)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===No)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===Fo)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===Oo)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===Bo)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===zo)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===Go)return a===ot?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Ho||n===ko||n===Vo)if(r=e.get("EXT_texture_compression_bptc"),r!==null){if(n===Ho)return a===ot?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===ko)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Vo)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Wo||n===Xo||n===Yo||n===qo)if(r=e.get("EXT_texture_compression_rgtc"),r!==null){if(n===Wo)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Xo)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Yo)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===qo)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===Is?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:t}}const _x=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,xx=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class vx{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){const n=new mh(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,n=new on({vertexShader:_x,fragmentShader:xx,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new Ie(new ls(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class Mx extends os{constructor(e,t){super();const n=this;let s=null,r=1,a=null,o="local-floor",l=1,c=null,h=null,d=null,u=null,p=null,g=null;const v=typeof XRWebGLBinding<"u",m=new vx,f={},x=t.getContextAttributes();let y=null,S=null;const A=[],b=[],w=new Fe;let _=null;const E=new Yt;E.viewport=new mt;const L=new Yt;L.viewport=new mt;const C=[E,L],N=new Lp;let I=null,z=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(j){let ce=A[j];return ce===void 0&&(ce=new Ea,A[j]=ce),ce.getTargetRaySpace()},this.getControllerGrip=function(j){let ce=A[j];return ce===void 0&&(ce=new Ea,A[j]=ce),ce.getGripSpace()},this.getHand=function(j){let ce=A[j];return ce===void 0&&(ce=new Ea,A[j]=ce),ce.getHandSpace()};function F(j){const ce=b.indexOf(j.inputSource);if(ce===-1)return;const oe=A[ce];oe!==void 0&&(oe.update(j.inputSource,j.frame,c||a),oe.dispatchEvent({type:j.type,data:j.inputSource}))}function O(){s.removeEventListener("select",F),s.removeEventListener("selectstart",F),s.removeEventListener("selectend",F),s.removeEventListener("squeeze",F),s.removeEventListener("squeezestart",F),s.removeEventListener("squeezeend",F),s.removeEventListener("end",O),s.removeEventListener("inputsourceschange",H);for(let j=0;j<A.length;j++){const ce=b[j];ce!==null&&(b[j]=null,A[j].disconnect(ce))}I=null,z=null,m.reset();for(const j in f)delete f[j];e.setRenderTarget(y),p=null,u=null,d=null,s=null,S=null,Ye.stop(),n.isPresenting=!1,e.setPixelRatio(_),e.setSize(w.width,w.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(j){r=j,n.isPresenting===!0&&Oe("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(j){o=j,n.isPresenting===!0&&Oe("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(j){c=j},this.getBaseLayer=function(){return u!==null?u:p},this.getBinding=function(){return d===null&&v&&(d=new XRWebGLBinding(s,t)),d},this.getFrame=function(){return g},this.getSession=function(){return s},this.setSession=async function(j){if(s=j,s!==null){if(y=e.getRenderTarget(),s.addEventListener("select",F),s.addEventListener("selectstart",F),s.addEventListener("selectend",F),s.addEventListener("squeeze",F),s.addEventListener("squeezestart",F),s.addEventListener("squeezeend",F),s.addEventListener("end",O),s.addEventListener("inputsourceschange",H),x.xrCompatible!==!0&&await t.makeXRCompatible(),_=e.getPixelRatio(),e.getSize(w),v&&"createProjectionLayer"in XRWebGLBinding.prototype){let oe=null,Ue=null,Te=null;x.depth&&(Te=x.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,oe=x.stencil?li:Cn,Ue=x.stencil?Is:gn);const Ce={colorFormat:t.RGBA8,depthFormat:Te,scaleFactor:r};d=this.getBinding(),u=d.createProjectionLayer(Ce),s.updateRenderState({layers:[u]}),e.setPixelRatio(1),e.setSize(u.textureWidth,u.textureHeight,!1),S=new mn(u.textureWidth,u.textureHeight,{format:Jt,type:qt,depthTexture:new Ns(u.textureWidth,u.textureHeight,Ue,void 0,void 0,void 0,void 0,void 0,void 0,oe),stencilBuffer:x.stencil,colorSpace:e.outputColorSpace,samples:x.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1})}else{const oe={antialias:x.antialias,alpha:!0,depth:x.depth,stencil:x.stencil,framebufferScaleFactor:r};p=new XRWebGLLayer(s,t,oe),s.updateRenderState({baseLayer:p}),e.setPixelRatio(1),e.setSize(p.framebufferWidth,p.framebufferHeight,!1),S=new mn(p.framebufferWidth,p.framebufferHeight,{format:Jt,type:qt,colorSpace:e.outputColorSpace,stencilBuffer:x.stencil,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1})}S.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await s.requestReferenceSpace(o),Ye.setContext(s),Ye.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function H(j){for(let ce=0;ce<j.removed.length;ce++){const oe=j.removed[ce],Ue=b.indexOf(oe);Ue>=0&&(b[Ue]=null,A[Ue].disconnect(oe))}for(let ce=0;ce<j.added.length;ce++){const oe=j.added[ce];let Ue=b.indexOf(oe);if(Ue===-1){for(let Ce=0;Ce<A.length;Ce++)if(Ce>=b.length){b.push(oe),Ue=Ce;break}else if(b[Ce]===null){b[Ce]=oe,Ue=Ce;break}if(Ue===-1)break}const Te=A[Ue];Te&&Te.connect(oe)}}const K=new D,Z=new D;function ne(j,ce,oe){K.setFromMatrixPosition(ce.matrixWorld),Z.setFromMatrixPosition(oe.matrixWorld);const Ue=K.distanceTo(Z),Te=ce.projectionMatrix.elements,Ce=oe.projectionMatrix.elements,rt=Te[14]/(Te[10]-1),Xe=Te[14]/(Te[10]+1),$e=(Te[9]+1)/Te[5],it=(Te[9]-1)/Te[5],Me=(Te[8]-1)/Te[0],Ke=(Ce[8]+1)/Ce[0],P=rt*Me,qe=rt*Ke,He=Ue/(-Me+Ke),st=He*-Me;if(ce.matrixWorld.decompose(j.position,j.quaternion,j.scale),j.translateX(st),j.translateZ(He),j.matrixWorld.compose(j.position,j.quaternion,j.scale),j.matrixWorldInverse.copy(j.matrixWorld).invert(),Te[10]===-1)j.projectionMatrix.copy(ce.projectionMatrix),j.projectionMatrixInverse.copy(ce.projectionMatrixInverse);else{const Se=rt+He,R=Xe+He,M=P-st,B=qe+(Ue-st),J=$e*Xe/R*Se,ee=it*Xe/R*Se;j.projectionMatrix.makePerspective(M,B,J,ee,Se,R),j.projectionMatrixInverse.copy(j.projectionMatrix).invert()}}function le(j,ce){ce===null?j.matrixWorld.copy(j.matrix):j.matrixWorld.multiplyMatrices(ce.matrixWorld,j.matrix),j.matrixWorldInverse.copy(j.matrixWorld).invert()}this.updateCamera=function(j){if(s===null)return;let ce=j.near,oe=j.far;m.texture!==null&&(m.depthNear>0&&(ce=m.depthNear),m.depthFar>0&&(oe=m.depthFar)),N.near=L.near=E.near=ce,N.far=L.far=E.far=oe,(I!==N.near||z!==N.far)&&(s.updateRenderState({depthNear:N.near,depthFar:N.far}),I=N.near,z=N.far),N.layers.mask=j.layers.mask|6,E.layers.mask=N.layers.mask&-5,L.layers.mask=N.layers.mask&-3;const Ue=j.parent,Te=N.cameras;le(N,Ue);for(let Ce=0;Ce<Te.length;Ce++)le(Te[Ce],Ue);Te.length===2?ne(N,E,L):N.projectionMatrix.copy(E.projectionMatrix),ae(j,N,Ue)};function ae(j,ce,oe){oe===null?j.matrix.copy(ce.matrixWorld):(j.matrix.copy(oe.matrixWorld),j.matrix.invert(),j.matrix.multiply(ce.matrixWorld)),j.matrix.decompose(j.position,j.quaternion,j.scale),j.updateMatrixWorld(!0),j.projectionMatrix.copy(ce.projectionMatrix),j.projectionMatrixInverse.copy(ce.projectionMatrixInverse),j.isPerspectiveCamera&&(j.fov=Ko*2*Math.atan(1/j.projectionMatrix.elements[5]),j.zoom=1)}this.getCamera=function(){return N},this.getFoveation=function(){if(!(u===null&&p===null))return l},this.setFoveation=function(j){l=j,u!==null&&(u.fixedFoveation=j),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=j)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(N)},this.getCameraTexture=function(j){return f[j]};let Re=null;function De(j,ce){if(h=ce.getViewerPose(c||a),g=ce,h!==null){const oe=h.views;p!==null&&(e.setRenderTargetFramebuffer(S,p.framebuffer),e.setRenderTarget(S));let Ue=!1;oe.length!==N.cameras.length&&(N.cameras.length=0,Ue=!0);for(let Xe=0;Xe<oe.length;Xe++){const $e=oe[Xe];let it=null;if(p!==null)it=p.getViewport($e);else{const Ke=d.getViewSubImage(u,$e);it=Ke.viewport,Xe===0&&(e.setRenderTargetTextures(S,Ke.colorTexture,Ke.depthStencilTexture),e.setRenderTarget(S))}let Me=C[Xe];Me===void 0&&(Me=new Yt,Me.layers.enable(Xe),Me.viewport=new mt,C[Xe]=Me),Me.matrix.fromArray($e.transform.matrix),Me.matrix.decompose(Me.position,Me.quaternion,Me.scale),Me.projectionMatrix.fromArray($e.projectionMatrix),Me.projectionMatrixInverse.copy(Me.projectionMatrix).invert(),Me.viewport.set(it.x,it.y,it.width,it.height),Xe===0&&(N.matrix.copy(Me.matrix),N.matrix.decompose(N.position,N.quaternion,N.scale)),Ue===!0&&N.cameras.push(Me)}const Te=s.enabledFeatures;if(Te&&Te.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&v){d=n.getBinding();const Xe=d.getDepthInformation(oe[0]);Xe&&Xe.isValid&&Xe.texture&&m.init(Xe,s.renderState)}if(Te&&Te.includes("camera-access")&&v){e.state.unbindTexture(),d=n.getBinding();for(let Xe=0;Xe<oe.length;Xe++){const $e=oe[Xe].camera;if($e){let it=f[$e];it||(it=new mh,f[$e]=it);const Me=d.getCameraImage($e);it.sourceTexture=Me}}}}for(let oe=0;oe<A.length;oe++){const Ue=b[oe],Te=A[oe];Ue!==null&&Te!==void 0&&Te.update(Ue,ce,c||a)}Re&&Re(j,ce),ce.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:ce}),g=null}const Ye=new vh;Ye.setAnimationLoop(De),this.setAnimationLoop=function(j){Re=j},this.dispose=function(){}}}const ni=new Bt,Sx=new je;function Ex(i,e){function t(m,f){m.matrixAutoUpdate===!0&&m.updateMatrix(),f.value.copy(m.matrix)}function n(m,f){f.color.getRGB(m.fogColor.value,gh(i)),f.isFog?(m.fogNear.value=f.near,m.fogFar.value=f.far):f.isFogExp2&&(m.fogDensity.value=f.density)}function s(m,f,x,y,S){f.isMeshBasicMaterial?r(m,f):f.isMeshLambertMaterial?(r(m,f),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)):f.isMeshToonMaterial?(r(m,f),d(m,f)):f.isMeshPhongMaterial?(r(m,f),h(m,f),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)):f.isMeshStandardMaterial?(r(m,f),u(m,f),f.isMeshPhysicalMaterial&&p(m,f,S)):f.isMeshMatcapMaterial?(r(m,f),g(m,f)):f.isMeshDepthMaterial?r(m,f):f.isMeshDistanceMaterial?(r(m,f),v(m,f)):f.isMeshNormalMaterial?r(m,f):f.isLineBasicMaterial?(a(m,f),f.isLineDashedMaterial&&o(m,f)):f.isPointsMaterial?l(m,f,x,y):f.isSpriteMaterial?c(m,f):f.isShadowMaterial?(m.color.value.copy(f.color),m.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function r(m,f){m.opacity.value=f.opacity,f.color&&m.diffuse.value.copy(f.color),f.emissive&&m.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(m.map.value=f.map,t(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.bumpMap&&(m.bumpMap.value=f.bumpMap,t(f.bumpMap,m.bumpMapTransform),m.bumpScale.value=f.bumpScale,f.side===It&&(m.bumpScale.value*=-1)),f.normalMap&&(m.normalMap.value=f.normalMap,t(f.normalMap,m.normalMapTransform),m.normalScale.value.copy(f.normalScale),f.side===It&&m.normalScale.value.negate()),f.displacementMap&&(m.displacementMap.value=f.displacementMap,t(f.displacementMap,m.displacementMapTransform),m.displacementScale.value=f.displacementScale,m.displacementBias.value=f.displacementBias),f.emissiveMap&&(m.emissiveMap.value=f.emissiveMap,t(f.emissiveMap,m.emissiveMapTransform)),f.specularMap&&(m.specularMap.value=f.specularMap,t(f.specularMap,m.specularMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest);const x=e.get(f),y=x.envMap,S=x.envMapRotation;y&&(m.envMap.value=y,ni.copy(S),ni.x*=-1,ni.y*=-1,ni.z*=-1,y.isCubeTexture&&y.isRenderTargetTexture===!1&&(ni.y*=-1,ni.z*=-1),m.envMapRotation.value.setFromMatrix4(Sx.makeRotationFromEuler(ni)),m.flipEnvMap.value=y.isCubeTexture&&y.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=f.reflectivity,m.ior.value=f.ior,m.refractionRatio.value=f.refractionRatio),f.lightMap&&(m.lightMap.value=f.lightMap,m.lightMapIntensity.value=f.lightMapIntensity,t(f.lightMap,m.lightMapTransform)),f.aoMap&&(m.aoMap.value=f.aoMap,m.aoMapIntensity.value=f.aoMapIntensity,t(f.aoMap,m.aoMapTransform))}function a(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,f.map&&(m.map.value=f.map,t(f.map,m.mapTransform))}function o(m,f){m.dashSize.value=f.dashSize,m.totalSize.value=f.dashSize+f.gapSize,m.scale.value=f.scale}function l(m,f,x,y){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.size.value=f.size*x,m.scale.value=y*.5,f.map&&(m.map.value=f.map,t(f.map,m.uvTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function c(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.rotation.value=f.rotation,f.map&&(m.map.value=f.map,t(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function h(m,f){m.specular.value.copy(f.specular),m.shininess.value=Math.max(f.shininess,1e-4)}function d(m,f){f.gradientMap&&(m.gradientMap.value=f.gradientMap)}function u(m,f){m.metalness.value=f.metalness,f.metalnessMap&&(m.metalnessMap.value=f.metalnessMap,t(f.metalnessMap,m.metalnessMapTransform)),m.roughness.value=f.roughness,f.roughnessMap&&(m.roughnessMap.value=f.roughnessMap,t(f.roughnessMap,m.roughnessMapTransform)),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)}function p(m,f,x){m.ior.value=f.ior,f.sheen>0&&(m.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),m.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(m.sheenColorMap.value=f.sheenColorMap,t(f.sheenColorMap,m.sheenColorMapTransform)),f.sheenRoughnessMap&&(m.sheenRoughnessMap.value=f.sheenRoughnessMap,t(f.sheenRoughnessMap,m.sheenRoughnessMapTransform))),f.clearcoat>0&&(m.clearcoat.value=f.clearcoat,m.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(m.clearcoatMap.value=f.clearcoatMap,t(f.clearcoatMap,m.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,t(f.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(m.clearcoatNormalMap.value=f.clearcoatNormalMap,t(f.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===It&&m.clearcoatNormalScale.value.negate())),f.dispersion>0&&(m.dispersion.value=f.dispersion),f.iridescence>0&&(m.iridescence.value=f.iridescence,m.iridescenceIOR.value=f.iridescenceIOR,m.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(m.iridescenceMap.value=f.iridescenceMap,t(f.iridescenceMap,m.iridescenceMapTransform)),f.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=f.iridescenceThicknessMap,t(f.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),f.transmission>0&&(m.transmission.value=f.transmission,m.transmissionSamplerMap.value=x.texture,m.transmissionSamplerSize.value.set(x.width,x.height),f.transmissionMap&&(m.transmissionMap.value=f.transmissionMap,t(f.transmissionMap,m.transmissionMapTransform)),m.thickness.value=f.thickness,f.thicknessMap&&(m.thicknessMap.value=f.thicknessMap,t(f.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=f.attenuationDistance,m.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(m.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(m.anisotropyMap.value=f.anisotropyMap,t(f.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=f.specularIntensity,m.specularColor.value.copy(f.specularColor),f.specularColorMap&&(m.specularColorMap.value=f.specularColorMap,t(f.specularColorMap,m.specularColorMapTransform)),f.specularIntensityMap&&(m.specularIntensityMap.value=f.specularIntensityMap,t(f.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,f){f.matcap&&(m.matcap.value=f.matcap)}function v(m,f){const x=e.get(f).light;m.referencePosition.value.setFromMatrixPosition(x.matrixWorld),m.nearDistance.value=x.shadow.camera.near,m.farDistance.value=x.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function yx(i,e,t,n){let s={},r={},a=[];const o=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function l(x,y){const S=y.program;n.uniformBlockBinding(x,S)}function c(x,y){let S=s[x.id];S===void 0&&(g(x),S=h(x),s[x.id]=S,x.addEventListener("dispose",m));const A=y.program;n.updateUBOMapping(x,A);const b=e.render.frame;r[x.id]!==b&&(u(x),r[x.id]=b)}function h(x){const y=d();x.__bindingPointIndex=y;const S=i.createBuffer(),A=x.__size,b=x.usage;return i.bindBuffer(i.UNIFORM_BUFFER,S),i.bufferData(i.UNIFORM_BUFFER,A,b),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,y,S),S}function d(){for(let x=0;x<o;x++)if(a.indexOf(x)===-1)return a.push(x),x;return et("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(x){const y=s[x.id],S=x.uniforms,A=x.__cache;i.bindBuffer(i.UNIFORM_BUFFER,y);for(let b=0,w=S.length;b<w;b++){const _=Array.isArray(S[b])?S[b]:[S[b]];for(let E=0,L=_.length;E<L;E++){const C=_[E];if(p(C,b,E,A)===!0){const N=C.__offset,I=Array.isArray(C.value)?C.value:[C.value];let z=0;for(let F=0;F<I.length;F++){const O=I[F],H=v(O);typeof O=="number"||typeof O=="boolean"?(C.__data[0]=O,i.bufferSubData(i.UNIFORM_BUFFER,N+z,C.__data)):O.isMatrix3?(C.__data[0]=O.elements[0],C.__data[1]=O.elements[1],C.__data[2]=O.elements[2],C.__data[3]=0,C.__data[4]=O.elements[3],C.__data[5]=O.elements[4],C.__data[6]=O.elements[5],C.__data[7]=0,C.__data[8]=O.elements[6],C.__data[9]=O.elements[7],C.__data[10]=O.elements[8],C.__data[11]=0):(O.toArray(C.__data,z),z+=H.storage/Float32Array.BYTES_PER_ELEMENT)}i.bufferSubData(i.UNIFORM_BUFFER,N,C.__data)}}}i.bindBuffer(i.UNIFORM_BUFFER,null)}function p(x,y,S,A){const b=x.value,w=y+"_"+S;if(A[w]===void 0)return typeof b=="number"||typeof b=="boolean"?A[w]=b:A[w]=b.clone(),!0;{const _=A[w];if(typeof b=="number"||typeof b=="boolean"){if(_!==b)return A[w]=b,!0}else if(_.equals(b)===!1)return _.copy(b),!0}return!1}function g(x){const y=x.uniforms;let S=0;const A=16;for(let w=0,_=y.length;w<_;w++){const E=Array.isArray(y[w])?y[w]:[y[w]];for(let L=0,C=E.length;L<C;L++){const N=E[L],I=Array.isArray(N.value)?N.value:[N.value];for(let z=0,F=I.length;z<F;z++){const O=I[z],H=v(O),K=S%A,Z=K%H.boundary,ne=K+Z;S+=Z,ne!==0&&A-ne<H.storage&&(S+=A-ne),N.__data=new Float32Array(H.storage/Float32Array.BYTES_PER_ELEMENT),N.__offset=S,S+=H.storage}}}const b=S%A;return b>0&&(S+=A-b),x.__size=S,x.__cache={},this}function v(x){const y={boundary:0,storage:0};return typeof x=="number"||typeof x=="boolean"?(y.boundary=4,y.storage=4):x.isVector2?(y.boundary=8,y.storage=8):x.isVector3||x.isColor?(y.boundary=16,y.storage=12):x.isVector4?(y.boundary=16,y.storage=16):x.isMatrix3?(y.boundary=48,y.storage=48):x.isMatrix4?(y.boundary=64,y.storage=64):x.isTexture?Oe("WebGLRenderer: Texture samplers can not be part of an uniforms group."):Oe("WebGLRenderer: Unsupported uniform value type.",x),y}function m(x){const y=x.target;y.removeEventListener("dispose",m);const S=a.indexOf(y.__bindingPointIndex);a.splice(S,1),i.deleteBuffer(s[y.id]),delete s[y.id],delete r[y.id]}function f(){for(const x in s)i.deleteBuffer(s[x]);a=[],s={},r={}}return{bind:l,update:c,dispose:f}}const bx=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let un=null;function Tx(){return un===null&&(un=new Ec(bx,16,16,es,Rn),un.name="DFG_LUT",un.minFilter=Tt,un.magFilter=Tt,un.wrapS=bn,un.wrapT=bn,un.generateMipmaps=!1,un.needsUpdate=!0),un}class Ax{constructor(e={}){const{canvas:t=Vf(),context:n=null,depth:s=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:u=!1,outputBufferType:p=qt}=e;this.isWebGLRenderer=!0;let g;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");g=n.getContextAttributes().alpha}else g=a;const v=p,m=new Set([_c,gc,mc]),f=new Set([qt,gn,Ds,Is,dc,fc]),x=new Uint32Array(4),y=new Int32Array(4);let S=null,A=null;const b=[],w=[];let _=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=pn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const E=this;let L=!1;this._outputColorSpace=Dt;let C=0,N=0,I=null,z=-1,F=null;const O=new mt,H=new mt;let K=null;const Z=new Ne(0);let ne=0,le=t.width,ae=t.height,Re=1,De=null,Ye=null;const j=new mt(0,0,le,ae),ce=new mt(0,0,le,ae);let oe=!1;const Ue=new yc;let Te=!1,Ce=!1;const rt=new je,Xe=new D,$e=new mt,it={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let Me=!1;function Ke(){return I===null?Re:1}let P=n;function qe(T,G){return t.getContext(T,G)}try{const T={alpha:!0,depth:s,stencil:r,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:d};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${lc}`),t.addEventListener("webglcontextlost",pe,!1),t.addEventListener("webglcontextrestored",Le,!1),t.addEventListener("webglcontextcreationerror",Je,!1),P===null){const G="webgl2";if(P=qe(G,T),P===null)throw qe(G)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(T){throw et("WebGLRenderer: "+T.message),T}let He,st,Se,R,M,B,J,ee,q,Ee,W,Q,_e,$,te,he,xe,ue,Pe,U,re,se,de;function ie(){He=new Ag(P),He.init(),re=new gx(P,He),st=new xg(P,He,e,re),Se=new px(P,He),st.reversedDepthBuffer&&u&&Se.buffers.depth.setReversed(!0),R=new Cg(P),M=new ex,B=new mx(P,He,Se,M,st,re,R),J=new Tg(E),ee=new Up(P),se=new gg(P,ee),q=new wg(P,ee,R,se),Ee=new Lg(P,q,ee,se,R),ue=new Pg(P,st,B),te=new vg(M),W=new Q_(E,J,He,st,se,te),Q=new Ex(E,M),_e=new nx,$=new cx(He),xe=new mg(E,J,Se,Ee,g,l),he=new fx(E,Ee,st),de=new yx(P,R,st,Se),Pe=new _g(P,He,R),U=new Rg(P,He,R),R.programs=W.programs,E.capabilities=st,E.extensions=He,E.properties=M,E.renderLists=_e,E.shadowMap=he,E.state=Se,E.info=R}ie(),v!==qt&&(_=new Ig(v,t.width,t.height,s,r));const Y=new Mx(E,P);this.xr=Y,this.getContext=function(){return P},this.getContextAttributes=function(){return P.getContextAttributes()},this.forceContextLoss=function(){const T=He.get("WEBGL_lose_context");T&&T.loseContext()},this.forceContextRestore=function(){const T=He.get("WEBGL_lose_context");T&&T.restoreContext()},this.getPixelRatio=function(){return Re},this.setPixelRatio=function(T){T!==void 0&&(Re=T,this.setSize(le,ae,!1))},this.getSize=function(T){return T.set(le,ae)},this.setSize=function(T,G,X=!0){if(Y.isPresenting){Oe("WebGLRenderer: Can't change size while VR device is presenting.");return}le=T,ae=G,t.width=Math.floor(T*Re),t.height=Math.floor(G*Re),X===!0&&(t.style.width=T+"px",t.style.height=G+"px"),_!==null&&_.setSize(t.width,t.height),this.setViewport(0,0,T,G)},this.getDrawingBufferSize=function(T){return T.set(le*Re,ae*Re).floor()},this.setDrawingBufferSize=function(T,G,X){le=T,ae=G,Re=X,t.width=Math.floor(T*X),t.height=Math.floor(G*X),this.setViewport(0,0,T,G)},this.setEffects=function(T){if(v===qt){console.error("THREE.WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(T){for(let G=0;G<T.length;G++)if(T[G].isOutputPass===!0){console.warn("THREE.WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}_.setEffects(T||[])},this.getCurrentViewport=function(T){return T.copy(O)},this.getViewport=function(T){return T.copy(j)},this.setViewport=function(T,G,X,V){T.isVector4?j.set(T.x,T.y,T.z,T.w):j.set(T,G,X,V),Se.viewport(O.copy(j).multiplyScalar(Re).round())},this.getScissor=function(T){return T.copy(ce)},this.setScissor=function(T,G,X,V){T.isVector4?ce.set(T.x,T.y,T.z,T.w):ce.set(T,G,X,V),Se.scissor(H.copy(ce).multiplyScalar(Re).round())},this.getScissorTest=function(){return oe},this.setScissorTest=function(T){Se.setScissorTest(oe=T)},this.setOpaqueSort=function(T){De=T},this.setTransparentSort=function(T){Ye=T},this.getClearColor=function(T){return T.copy(xe.getClearColor())},this.setClearColor=function(){xe.setClearColor(...arguments)},this.getClearAlpha=function(){return xe.getClearAlpha()},this.setClearAlpha=function(){xe.setClearAlpha(...arguments)},this.clear=function(T=!0,G=!0,X=!0){let V=0;if(T){let k=!1;if(I!==null){const me=I.texture.format;k=m.has(me)}if(k){const me=I.texture.type,ve=f.has(me),ge=xe.getClearColor(),ye=xe.getClearAlpha(),Ae=ge.r,ze=ge.g,Ve=ge.b;ve?(x[0]=Ae,x[1]=ze,x[2]=Ve,x[3]=ye,P.clearBufferuiv(P.COLOR,0,x)):(y[0]=Ae,y[1]=ze,y[2]=Ve,y[3]=ye,P.clearBufferiv(P.COLOR,0,y))}else V|=P.COLOR_BUFFER_BIT}G&&(V|=P.DEPTH_BUFFER_BIT),X&&(V|=P.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),V!==0&&P.clear(V)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",pe,!1),t.removeEventListener("webglcontextrestored",Le,!1),t.removeEventListener("webglcontextcreationerror",Je,!1),xe.dispose(),_e.dispose(),$.dispose(),M.dispose(),J.dispose(),Ee.dispose(),se.dispose(),de.dispose(),W.dispose(),Y.dispose(),Y.removeEventListener("sessionstart",Fc),Y.removeEventListener("sessionend",Oc),Kn.stop()};function pe(T){T.preventDefault(),Br("WebGLRenderer: Context Lost."),L=!0}function Le(){Br("WebGLRenderer: Context Restored."),L=!1;const T=R.autoReset,G=he.enabled,X=he.autoUpdate,V=he.needsUpdate,k=he.type;ie(),R.autoReset=T,he.enabled=G,he.autoUpdate=X,he.needsUpdate=V,he.type=k}function Je(T){et("WebGLRenderer: A WebGL context could not be created. Reason: ",T.statusMessage)}function Qe(T){const G=T.target;G.removeEventListener("dispose",Qe),Gt(G)}function Gt(T){Ht(T),M.remove(T)}function Ht(T){const G=M.get(T).programs;G!==void 0&&(G.forEach(function(X){W.releaseProgram(X)}),T.isShaderMaterial&&W.releaseShaderCache(T))}this.renderBufferDirect=function(T,G,X,V,k,me){G===null&&(G=it);const ve=k.isMesh&&k.matrixWorld.determinant()<0,ge=Bh(T,G,X,V,k);Se.setMaterial(V,ve);let ye=X.index,Ae=1;if(V.wireframe===!0){if(ye=q.getWireframeAttribute(X),ye===void 0)return;Ae=2}const ze=X.drawRange,Ve=X.attributes.position;let we=ze.start*Ae,ct=(ze.start+ze.count)*Ae;me!==null&&(we=Math.max(we,me.start*Ae),ct=Math.min(ct,(me.start+me.count)*Ae)),ye!==null?(we=Math.max(we,0),ct=Math.min(ct,ye.count)):Ve!=null&&(we=Math.max(we,0),ct=Math.min(ct,Ve.count));const gt=ct-we;if(gt<0||gt===1/0)return;se.setup(k,V,ge,X,ye);let pt,lt=Pe;if(ye!==null&&(pt=ee.get(ye),lt=U,lt.setIndex(pt)),k.isMesh)V.wireframe===!0?(Se.setLineWidth(V.wireframeLinewidth*Ke()),lt.setMode(P.LINES)):lt.setMode(P.TRIANGLES);else if(k.isLine){let Ct=V.linewidth;Ct===void 0&&(Ct=1),Se.setLineWidth(Ct*Ke()),k.isLineSegments?lt.setMode(P.LINES):k.isLineLoop?lt.setMode(P.LINE_LOOP):lt.setMode(P.LINE_STRIP)}else k.isPoints?lt.setMode(P.POINTS):k.isSprite&&lt.setMode(P.TRIANGLES);if(k.isBatchedMesh)if(k._multiDrawInstances!==null)zr("WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),lt.renderMultiDrawInstances(k._multiDrawStarts,k._multiDrawCounts,k._multiDrawCount,k._multiDrawInstances);else if(He.get("WEBGL_multi_draw"))lt.renderMultiDraw(k._multiDrawStarts,k._multiDrawCounts,k._multiDrawCount);else{const Ct=k._multiDrawStarts,be=k._multiDrawCounts,kt=k._multiDrawCount,nt=ye?ee.get(ye).bytesPerElement:1,en=M.get(V).currentProgram.getUniforms();for(let cn=0;cn<kt;cn++)en.setValue(P,"_gl_DrawID",cn),lt.render(Ct[cn]/nt,be[cn])}else if(k.isInstancedMesh)lt.renderInstances(we,gt,k.count);else if(X.isInstancedBufferGeometry){const Ct=X._maxInstanceCount!==void 0?X._maxInstanceCount:1/0,be=Math.min(X.instanceCount,Ct);lt.renderInstances(we,gt,be)}else lt.render(we,gt)};function Nc(T,G,X){T.transparent===!0&&T.side===En&&T.forceSinglePass===!1?(T.side=It,T.needsUpdate=!0,ks(T,G,X),T.side=Yn,T.needsUpdate=!0,ks(T,G,X),T.side=En):ks(T,G,X)}this.compile=function(T,G,X=null){X===null&&(X=T),A=$.get(X),A.init(G),w.push(A),X.traverseVisible(function(k){k.isLight&&k.layers.test(G.layers)&&(A.pushLight(k),k.castShadow&&A.pushShadow(k))}),T!==X&&T.traverseVisible(function(k){k.isLight&&k.layers.test(G.layers)&&(A.pushLight(k),k.castShadow&&A.pushShadow(k))}),A.setupLights();const V=new Set;return T.traverse(function(k){if(!(k.isMesh||k.isPoints||k.isLine||k.isSprite))return;const me=k.material;if(me)if(Array.isArray(me))for(let ve=0;ve<me.length;ve++){const ge=me[ve];Nc(ge,X,k),V.add(ge)}else Nc(me,X,k),V.add(me)}),A=w.pop(),V},this.compileAsync=function(T,G,X=null){const V=this.compile(T,G,X);return new Promise(k=>{function me(){if(V.forEach(function(ve){M.get(ve).currentProgram.isReady()&&V.delete(ve)}),V.size===0){k(T);return}setTimeout(me,10)}He.get("KHR_parallel_shader_compile")!==null?me():setTimeout(me,10)})};let oa=null;function Oh(T){oa&&oa(T)}function Fc(){Kn.stop()}function Oc(){Kn.start()}const Kn=new vh;Kn.setAnimationLoop(Oh),typeof self<"u"&&Kn.setContext(self),this.setAnimationLoop=function(T){oa=T,Y.setAnimationLoop(T),T===null?Kn.stop():Kn.start()},Y.addEventListener("sessionstart",Fc),Y.addEventListener("sessionend",Oc),this.render=function(T,G){if(G!==void 0&&G.isCamera!==!0){et("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(L===!0)return;const X=Y.enabled===!0&&Y.isPresenting===!0,V=_!==null&&(I===null||X)&&_.begin(E,I);if(T.matrixWorldAutoUpdate===!0&&T.updateMatrixWorld(),G.parent===null&&G.matrixWorldAutoUpdate===!0&&G.updateMatrixWorld(),Y.enabled===!0&&Y.isPresenting===!0&&(_===null||_.isCompositing()===!1)&&(Y.cameraAutoUpdate===!0&&Y.updateCamera(G),G=Y.getCamera()),T.isScene===!0&&T.onBeforeRender(E,T,G,I),A=$.get(T,w.length),A.init(G),w.push(A),rt.multiplyMatrices(G.projectionMatrix,G.matrixWorldInverse),Ue.setFromProjectionMatrix(rt,fn,G.reversedDepth),Ce=this.localClippingEnabled,Te=te.init(this.clippingPlanes,Ce),S=_e.get(T,b.length),S.init(),b.push(S),Y.enabled===!0&&Y.isPresenting===!0){const ve=E.xr.getDepthSensingMesh();ve!==null&&ca(ve,G,-1/0,E.sortObjects)}ca(T,G,0,E.sortObjects),S.finish(),E.sortObjects===!0&&S.sort(De,Ye),Me=Y.enabled===!1||Y.isPresenting===!1||Y.hasDepthSensing()===!1,Me&&xe.addToRenderList(S,T),this.info.render.frame++,Te===!0&&te.beginShadows();const k=A.state.shadowsArray;if(he.render(k,T,G),Te===!0&&te.endShadows(),this.info.autoReset===!0&&this.info.reset(),(V&&_.hasRenderPass())===!1){const ve=S.opaque,ge=S.transmissive;if(A.setupLights(),G.isArrayCamera){const ye=G.cameras;if(ge.length>0)for(let Ae=0,ze=ye.length;Ae<ze;Ae++){const Ve=ye[Ae];zc(ve,ge,T,Ve)}Me&&xe.render(T);for(let Ae=0,ze=ye.length;Ae<ze;Ae++){const Ve=ye[Ae];Bc(S,T,Ve,Ve.viewport)}}else ge.length>0&&zc(ve,ge,T,G),Me&&xe.render(T),Bc(S,T,G)}I!==null&&N===0&&(B.updateMultisampleRenderTarget(I),B.updateRenderTargetMipmap(I)),V&&_.end(E),T.isScene===!0&&T.onAfterRender(E,T,G),se.resetDefaultState(),z=-1,F=null,w.pop(),w.length>0?(A=w[w.length-1],Te===!0&&te.setGlobalState(E.clippingPlanes,A.state.camera)):A=null,b.pop(),b.length>0?S=b[b.length-1]:S=null};function ca(T,G,X,V){if(T.visible===!1)return;if(T.layers.test(G.layers)){if(T.isGroup)X=T.renderOrder;else if(T.isLOD)T.autoUpdate===!0&&T.update(G);else if(T.isLight)A.pushLight(T),T.castShadow&&A.pushShadow(T);else if(T.isSprite){if(!T.frustumCulled||Ue.intersectsSprite(T)){V&&$e.setFromMatrixPosition(T.matrixWorld).applyMatrix4(rt);const ve=Ee.update(T),ge=T.material;ge.visible&&S.push(T,ve,ge,X,$e.z,null)}}else if((T.isMesh||T.isLine||T.isPoints)&&(!T.frustumCulled||Ue.intersectsObject(T))){const ve=Ee.update(T),ge=T.material;if(V&&(T.boundingSphere!==void 0?(T.boundingSphere===null&&T.computeBoundingSphere(),$e.copy(T.boundingSphere.center)):(ve.boundingSphere===null&&ve.computeBoundingSphere(),$e.copy(ve.boundingSphere.center)),$e.applyMatrix4(T.matrixWorld).applyMatrix4(rt)),Array.isArray(ge)){const ye=ve.groups;for(let Ae=0,ze=ye.length;Ae<ze;Ae++){const Ve=ye[Ae],we=ge[Ve.materialIndex];we&&we.visible&&S.push(T,ve,we,X,$e.z,Ve)}}else ge.visible&&S.push(T,ve,ge,X,$e.z,null)}}const me=T.children;for(let ve=0,ge=me.length;ve<ge;ve++)ca(me[ve],G,X,V)}function Bc(T,G,X,V){const{opaque:k,transmissive:me,transparent:ve}=T;A.setupLightsView(X),Te===!0&&te.setGlobalState(E.clippingPlanes,X),V&&Se.viewport(O.copy(V)),k.length>0&&Hs(k,G,X),me.length>0&&Hs(me,G,X),ve.length>0&&Hs(ve,G,X),Se.buffers.depth.setTest(!0),Se.buffers.depth.setMask(!0),Se.buffers.color.setMask(!0),Se.setPolygonOffset(!1)}function zc(T,G,X,V){if((X.isScene===!0?X.overrideMaterial:null)!==null)return;if(A.state.transmissionRenderTarget[V.id]===void 0){const we=He.has("EXT_color_buffer_half_float")||He.has("EXT_color_buffer_float");A.state.transmissionRenderTarget[V.id]=new mn(1,1,{generateMipmaps:!0,type:we?Rn:qt,minFilter:ci,samples:Math.max(4,st.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:tt.workingColorSpace})}const me=A.state.transmissionRenderTarget[V.id],ve=V.viewport||O;me.setSize(ve.z*E.transmissionResolutionScale,ve.w*E.transmissionResolutionScale);const ge=E.getRenderTarget(),ye=E.getActiveCubeFace(),Ae=E.getActiveMipmapLevel();E.setRenderTarget(me),E.getClearColor(Z),ne=E.getClearAlpha(),ne<1&&E.setClearColor(16777215,.5),E.clear(),Me&&xe.render(X);const ze=E.toneMapping;E.toneMapping=pn;const Ve=V.viewport;if(V.viewport!==void 0&&(V.viewport=void 0),A.setupLightsView(V),Te===!0&&te.setGlobalState(E.clippingPlanes,V),Hs(T,X,V),B.updateMultisampleRenderTarget(me),B.updateRenderTargetMipmap(me),He.has("WEBGL_multisampled_render_to_texture")===!1){let we=!1;for(let ct=0,gt=G.length;ct<gt;ct++){const pt=G[ct],{object:lt,geometry:Ct,material:be,group:kt}=pt;if(be.side===En&&lt.layers.test(V.layers)){const nt=be.side;be.side=It,be.needsUpdate=!0,Gc(lt,X,V,Ct,be,kt),be.side=nt,be.needsUpdate=!0,we=!0}}we===!0&&(B.updateMultisampleRenderTarget(me),B.updateRenderTargetMipmap(me))}E.setRenderTarget(ge,ye,Ae),E.setClearColor(Z,ne),Ve!==void 0&&(V.viewport=Ve),E.toneMapping=ze}function Hs(T,G,X){const V=G.isScene===!0?G.overrideMaterial:null;for(let k=0,me=T.length;k<me;k++){const ve=T[k],{object:ge,geometry:ye,group:Ae}=ve;let ze=ve.material;ze.allowOverride===!0&&V!==null&&(ze=V),ge.layers.test(X.layers)&&Gc(ge,G,X,ye,ze,Ae)}}function Gc(T,G,X,V,k,me){T.onBeforeRender(E,G,X,V,k,me),T.modelViewMatrix.multiplyMatrices(X.matrixWorldInverse,T.matrixWorld),T.normalMatrix.getNormalMatrix(T.modelViewMatrix),k.onBeforeRender(E,G,X,V,T,me),k.transparent===!0&&k.side===En&&k.forceSinglePass===!1?(k.side=It,k.needsUpdate=!0,E.renderBufferDirect(X,G,V,k,T,me),k.side=Yn,k.needsUpdate=!0,E.renderBufferDirect(X,G,V,k,T,me),k.side=En):E.renderBufferDirect(X,G,V,k,T,me),T.onAfterRender(E,G,X,V,k,me)}function ks(T,G,X){G.isScene!==!0&&(G=it);const V=M.get(T),k=A.state.lights,me=A.state.shadowsArray,ve=k.state.version,ge=W.getParameters(T,k.state,me,G,X),ye=W.getProgramCacheKey(ge);let Ae=V.programs;V.environment=T.isMeshStandardMaterial||T.isMeshLambertMaterial||T.isMeshPhongMaterial?G.environment:null,V.fog=G.fog;const ze=T.isMeshStandardMaterial||T.isMeshLambertMaterial&&!T.envMap||T.isMeshPhongMaterial&&!T.envMap;V.envMap=J.get(T.envMap||V.environment,ze),V.envMapRotation=V.environment!==null&&T.envMap===null?G.environmentRotation:T.envMapRotation,Ae===void 0&&(T.addEventListener("dispose",Qe),Ae=new Map,V.programs=Ae);let Ve=Ae.get(ye);if(Ve!==void 0){if(V.currentProgram===Ve&&V.lightsStateVersion===ve)return kc(T,ge),Ve}else ge.uniforms=W.getUniforms(T),T.onBeforeCompile(ge,E),Ve=W.acquireProgram(ge,ye),Ae.set(ye,Ve),V.uniforms=ge.uniforms;const we=V.uniforms;return(!T.isShaderMaterial&&!T.isRawShaderMaterial||T.clipping===!0)&&(we.clippingPlanes=te.uniform),kc(T,ge),V.needsLights=Gh(T),V.lightsStateVersion=ve,V.needsLights&&(we.ambientLightColor.value=k.state.ambient,we.lightProbe.value=k.state.probe,we.directionalLights.value=k.state.directional,we.directionalLightShadows.value=k.state.directionalShadow,we.spotLights.value=k.state.spot,we.spotLightShadows.value=k.state.spotShadow,we.rectAreaLights.value=k.state.rectArea,we.ltc_1.value=k.state.rectAreaLTC1,we.ltc_2.value=k.state.rectAreaLTC2,we.pointLights.value=k.state.point,we.pointLightShadows.value=k.state.pointShadow,we.hemisphereLights.value=k.state.hemi,we.directionalShadowMatrix.value=k.state.directionalShadowMatrix,we.spotLightMatrix.value=k.state.spotLightMatrix,we.spotLightMap.value=k.state.spotLightMap,we.pointShadowMatrix.value=k.state.pointShadowMatrix),V.currentProgram=Ve,V.uniformsList=null,Ve}function Hc(T){if(T.uniformsList===null){const G=T.currentProgram.getUniforms();T.uniformsList=Lr.seqWithValue(G.seq,T.uniforms)}return T.uniformsList}function kc(T,G){const X=M.get(T);X.outputColorSpace=G.outputColorSpace,X.batching=G.batching,X.batchingColor=G.batchingColor,X.instancing=G.instancing,X.instancingColor=G.instancingColor,X.instancingMorph=G.instancingMorph,X.skinning=G.skinning,X.morphTargets=G.morphTargets,X.morphNormals=G.morphNormals,X.morphColors=G.morphColors,X.morphTargetsCount=G.morphTargetsCount,X.numClippingPlanes=G.numClippingPlanes,X.numIntersection=G.numClipIntersection,X.vertexAlphas=G.vertexAlphas,X.vertexTangents=G.vertexTangents,X.toneMapping=G.toneMapping}function Bh(T,G,X,V,k){G.isScene!==!0&&(G=it),B.resetTextureUnits();const me=G.fog,ve=V.isMeshStandardMaterial||V.isMeshLambertMaterial||V.isMeshPhongMaterial?G.environment:null,ge=I===null?E.outputColorSpace:I.isXRRenderTarget===!0?I.texture.colorSpace:ts,ye=V.isMeshStandardMaterial||V.isMeshLambertMaterial&&!V.envMap||V.isMeshPhongMaterial&&!V.envMap,Ae=J.get(V.envMap||ve,ye),ze=V.vertexColors===!0&&!!X.attributes.color&&X.attributes.color.itemSize===4,Ve=!!X.attributes.tangent&&(!!V.normalMap||V.anisotropy>0),we=!!X.morphAttributes.position,ct=!!X.morphAttributes.normal,gt=!!X.morphAttributes.color;let pt=pn;V.toneMapped&&(I===null||I.isXRRenderTarget===!0)&&(pt=E.toneMapping);const lt=X.morphAttributes.position||X.morphAttributes.normal||X.morphAttributes.color,Ct=lt!==void 0?lt.length:0,be=M.get(V),kt=A.state.lights;if(Te===!0&&(Ce===!0||T!==F)){const yt=T===F&&V.id===z;te.setState(V,T,yt)}let nt=!1;V.version===be.__version?(be.needsLights&&be.lightsStateVersion!==kt.state.version||be.outputColorSpace!==ge||k.isBatchedMesh&&be.batching===!1||!k.isBatchedMesh&&be.batching===!0||k.isBatchedMesh&&be.batchingColor===!0&&k.colorTexture===null||k.isBatchedMesh&&be.batchingColor===!1&&k.colorTexture!==null||k.isInstancedMesh&&be.instancing===!1||!k.isInstancedMesh&&be.instancing===!0||k.isSkinnedMesh&&be.skinning===!1||!k.isSkinnedMesh&&be.skinning===!0||k.isInstancedMesh&&be.instancingColor===!0&&k.instanceColor===null||k.isInstancedMesh&&be.instancingColor===!1&&k.instanceColor!==null||k.isInstancedMesh&&be.instancingMorph===!0&&k.morphTexture===null||k.isInstancedMesh&&be.instancingMorph===!1&&k.morphTexture!==null||be.envMap!==Ae||V.fog===!0&&be.fog!==me||be.numClippingPlanes!==void 0&&(be.numClippingPlanes!==te.numPlanes||be.numIntersection!==te.numIntersection)||be.vertexAlphas!==ze||be.vertexTangents!==Ve||be.morphTargets!==we||be.morphNormals!==ct||be.morphColors!==gt||be.toneMapping!==pt||be.morphTargetsCount!==Ct)&&(nt=!0):(nt=!0,be.__version=V.version);let en=be.currentProgram;nt===!0&&(en=ks(V,G,k));let cn=!1,Zn=!1,Ei=!1;const ht=en.getUniforms(),wt=be.uniforms;if(Se.useProgram(en.program)&&(cn=!0,Zn=!0,Ei=!0),V.id!==z&&(z=V.id,Zn=!0),cn||F!==T){Se.buffers.depth.getReversed()&&T.reversedDepth!==!0&&(T._reversedDepth=!0,T.updateProjectionMatrix()),ht.setValue(P,"projectionMatrix",T.projectionMatrix),ht.setValue(P,"viewMatrix",T.matrixWorldInverse);const Ln=ht.map.cameraPosition;Ln!==void 0&&Ln.setValue(P,Xe.setFromMatrixPosition(T.matrixWorld)),st.logarithmicDepthBuffer&&ht.setValue(P,"logDepthBufFC",2/(Math.log(T.far+1)/Math.LN2)),(V.isMeshPhongMaterial||V.isMeshToonMaterial||V.isMeshLambertMaterial||V.isMeshBasicMaterial||V.isMeshStandardMaterial||V.isShaderMaterial)&&ht.setValue(P,"isOrthographic",T.isOrthographicCamera===!0),F!==T&&(F=T,Zn=!0,Ei=!0)}if(be.needsLights&&(kt.state.directionalShadowMap.length>0&&ht.setValue(P,"directionalShadowMap",kt.state.directionalShadowMap,B),kt.state.spotShadowMap.length>0&&ht.setValue(P,"spotShadowMap",kt.state.spotShadowMap,B),kt.state.pointShadowMap.length>0&&ht.setValue(P,"pointShadowMap",kt.state.pointShadowMap,B)),k.isSkinnedMesh){ht.setOptional(P,k,"bindMatrix"),ht.setOptional(P,k,"bindMatrixInverse");const yt=k.skeleton;yt&&(yt.boneTexture===null&&yt.computeBoneTexture(),ht.setValue(P,"boneTexture",yt.boneTexture,B))}k.isBatchedMesh&&(ht.setOptional(P,k,"batchingTexture"),ht.setValue(P,"batchingTexture",k._matricesTexture,B),ht.setOptional(P,k,"batchingIdTexture"),ht.setValue(P,"batchingIdTexture",k._indirectTexture,B),ht.setOptional(P,k,"batchingColorTexture"),k._colorsTexture!==null&&ht.setValue(P,"batchingColorTexture",k._colorsTexture,B));const Pn=X.morphAttributes;if((Pn.position!==void 0||Pn.normal!==void 0||Pn.color!==void 0)&&ue.update(k,X,en),(Zn||be.receiveShadow!==k.receiveShadow)&&(be.receiveShadow=k.receiveShadow,ht.setValue(P,"receiveShadow",k.receiveShadow)),(V.isMeshStandardMaterial||V.isMeshLambertMaterial||V.isMeshPhongMaterial)&&V.envMap===null&&G.environment!==null&&(wt.envMapIntensity.value=G.environmentIntensity),wt.dfgLUT!==void 0&&(wt.dfgLUT.value=Tx()),Zn&&(ht.setValue(P,"toneMappingExposure",E.toneMappingExposure),be.needsLights&&zh(wt,Ei),me&&V.fog===!0&&Q.refreshFogUniforms(wt,me),Q.refreshMaterialUniforms(wt,V,Re,ae,A.state.transmissionRenderTarget[T.id]),Lr.upload(P,Hc(be),wt,B)),V.isShaderMaterial&&V.uniformsNeedUpdate===!0&&(Lr.upload(P,Hc(be),wt,B),V.uniformsNeedUpdate=!1),V.isSpriteMaterial&&ht.setValue(P,"center",k.center),ht.setValue(P,"modelViewMatrix",k.modelViewMatrix),ht.setValue(P,"normalMatrix",k.normalMatrix),ht.setValue(P,"modelMatrix",k.matrixWorld),V.isShaderMaterial||V.isRawShaderMaterial){const yt=V.uniformsGroups;for(let Ln=0,yi=yt.length;Ln<yi;Ln++){const Vc=yt[Ln];de.update(Vc,en),de.bind(Vc,en)}}return en}function zh(T,G){T.ambientLightColor.needsUpdate=G,T.lightProbe.needsUpdate=G,T.directionalLights.needsUpdate=G,T.directionalLightShadows.needsUpdate=G,T.pointLights.needsUpdate=G,T.pointLightShadows.needsUpdate=G,T.spotLights.needsUpdate=G,T.spotLightShadows.needsUpdate=G,T.rectAreaLights.needsUpdate=G,T.hemisphereLights.needsUpdate=G}function Gh(T){return T.isMeshLambertMaterial||T.isMeshToonMaterial||T.isMeshPhongMaterial||T.isMeshStandardMaterial||T.isShadowMaterial||T.isShaderMaterial&&T.lights===!0}this.getActiveCubeFace=function(){return C},this.getActiveMipmapLevel=function(){return N},this.getRenderTarget=function(){return I},this.setRenderTargetTextures=function(T,G,X){const V=M.get(T);V.__autoAllocateDepthBuffer=T.resolveDepthBuffer===!1,V.__autoAllocateDepthBuffer===!1&&(V.__useRenderToTexture=!1),M.get(T.texture).__webglTexture=G,M.get(T.depthTexture).__webglTexture=V.__autoAllocateDepthBuffer?void 0:X,V.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(T,G){const X=M.get(T);X.__webglFramebuffer=G,X.__useDefaultFramebuffer=G===void 0};const Hh=P.createFramebuffer();this.setRenderTarget=function(T,G=0,X=0){I=T,C=G,N=X;let V=null,k=!1,me=!1;if(T){const ge=M.get(T);if(ge.__useDefaultFramebuffer!==void 0){Se.bindFramebuffer(P.FRAMEBUFFER,ge.__webglFramebuffer),O.copy(T.viewport),H.copy(T.scissor),K=T.scissorTest,Se.viewport(O),Se.scissor(H),Se.setScissorTest(K),z=-1;return}else if(ge.__webglFramebuffer===void 0)B.setupRenderTarget(T);else if(ge.__hasExternalTextures)B.rebindTextures(T,M.get(T.texture).__webglTexture,M.get(T.depthTexture).__webglTexture);else if(T.depthBuffer){const ze=T.depthTexture;if(ge.__boundDepthTexture!==ze){if(ze!==null&&M.has(ze)&&(T.width!==ze.image.width||T.height!==ze.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");B.setupDepthRenderbuffer(T)}}const ye=T.texture;(ye.isData3DTexture||ye.isDataArrayTexture||ye.isCompressedArrayTexture)&&(me=!0);const Ae=M.get(T).__webglFramebuffer;T.isWebGLCubeRenderTarget?(Array.isArray(Ae[G])?V=Ae[G][X]:V=Ae[G],k=!0):T.samples>0&&B.useMultisampledRTT(T)===!1?V=M.get(T).__webglMultisampledFramebuffer:Array.isArray(Ae)?V=Ae[X]:V=Ae,O.copy(T.viewport),H.copy(T.scissor),K=T.scissorTest}else O.copy(j).multiplyScalar(Re).floor(),H.copy(ce).multiplyScalar(Re).floor(),K=oe;if(X!==0&&(V=Hh),Se.bindFramebuffer(P.FRAMEBUFFER,V)&&Se.drawBuffers(T,V),Se.viewport(O),Se.scissor(H),Se.setScissorTest(K),k){const ge=M.get(T.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_CUBE_MAP_POSITIVE_X+G,ge.__webglTexture,X)}else if(me){const ge=G;for(let ye=0;ye<T.textures.length;ye++){const Ae=M.get(T.textures[ye]);P.framebufferTextureLayer(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0+ye,Ae.__webglTexture,X,ge)}}else if(T!==null&&X!==0){const ge=M.get(T.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,ge.__webglTexture,X)}z=-1},this.readRenderTargetPixels=function(T,G,X,V,k,me,ve,ge=0){if(!(T&&T.isWebGLRenderTarget)){et("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let ye=M.get(T).__webglFramebuffer;if(T.isWebGLCubeRenderTarget&&ve!==void 0&&(ye=ye[ve]),ye){Se.bindFramebuffer(P.FRAMEBUFFER,ye);try{const Ae=T.textures[ge],ze=Ae.format,Ve=Ae.type;if(T.textures.length>1&&P.readBuffer(P.COLOR_ATTACHMENT0+ge),!st.textureFormatReadable(ze)){et("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!st.textureTypeReadable(Ve)){et("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}G>=0&&G<=T.width-V&&X>=0&&X<=T.height-k&&P.readPixels(G,X,V,k,re.convert(ze),re.convert(Ve),me)}finally{const Ae=I!==null?M.get(I).__webglFramebuffer:null;Se.bindFramebuffer(P.FRAMEBUFFER,Ae)}}},this.readRenderTargetPixelsAsync=async function(T,G,X,V,k,me,ve,ge=0){if(!(T&&T.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let ye=M.get(T).__webglFramebuffer;if(T.isWebGLCubeRenderTarget&&ve!==void 0&&(ye=ye[ve]),ye)if(G>=0&&G<=T.width-V&&X>=0&&X<=T.height-k){Se.bindFramebuffer(P.FRAMEBUFFER,ye);const Ae=T.textures[ge],ze=Ae.format,Ve=Ae.type;if(T.textures.length>1&&P.readBuffer(P.COLOR_ATTACHMENT0+ge),!st.textureFormatReadable(ze))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!st.textureTypeReadable(Ve))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const we=P.createBuffer();P.bindBuffer(P.PIXEL_PACK_BUFFER,we),P.bufferData(P.PIXEL_PACK_BUFFER,me.byteLength,P.STREAM_READ),P.readPixels(G,X,V,k,re.convert(ze),re.convert(Ve),0);const ct=I!==null?M.get(I).__webglFramebuffer:null;Se.bindFramebuffer(P.FRAMEBUFFER,ct);const gt=P.fenceSync(P.SYNC_GPU_COMMANDS_COMPLETE,0);return P.flush(),await Wf(P,gt,4),P.bindBuffer(P.PIXEL_PACK_BUFFER,we),P.getBufferSubData(P.PIXEL_PACK_BUFFER,0,me),P.deleteBuffer(we),P.deleteSync(gt),me}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(T,G=null,X=0){const V=Math.pow(2,-X),k=Math.floor(T.image.width*V),me=Math.floor(T.image.height*V),ve=G!==null?G.x:0,ge=G!==null?G.y:0;B.setTexture2D(T,0),P.copyTexSubImage2D(P.TEXTURE_2D,X,0,0,ve,ge,k,me),Se.unbindTexture()};const kh=P.createFramebuffer(),Vh=P.createFramebuffer();this.copyTextureToTexture=function(T,G,X=null,V=null,k=0,me=0){let ve,ge,ye,Ae,ze,Ve,we,ct,gt;const pt=T.isCompressedTexture?T.mipmaps[me]:T.image;if(X!==null)ve=X.max.x-X.min.x,ge=X.max.y-X.min.y,ye=X.isBox3?X.max.z-X.min.z:1,Ae=X.min.x,ze=X.min.y,Ve=X.isBox3?X.min.z:0;else{const wt=Math.pow(2,-k);ve=Math.floor(pt.width*wt),ge=Math.floor(pt.height*wt),T.isDataArrayTexture?ye=pt.depth:T.isData3DTexture?ye=Math.floor(pt.depth*wt):ye=1,Ae=0,ze=0,Ve=0}V!==null?(we=V.x,ct=V.y,gt=V.z):(we=0,ct=0,gt=0);const lt=re.convert(G.format),Ct=re.convert(G.type);let be;G.isData3DTexture?(B.setTexture3D(G,0),be=P.TEXTURE_3D):G.isDataArrayTexture||G.isCompressedArrayTexture?(B.setTexture2DArray(G,0),be=P.TEXTURE_2D_ARRAY):(B.setTexture2D(G,0),be=P.TEXTURE_2D),P.pixelStorei(P.UNPACK_FLIP_Y_WEBGL,G.flipY),P.pixelStorei(P.UNPACK_PREMULTIPLY_ALPHA_WEBGL,G.premultiplyAlpha),P.pixelStorei(P.UNPACK_ALIGNMENT,G.unpackAlignment);const kt=P.getParameter(P.UNPACK_ROW_LENGTH),nt=P.getParameter(P.UNPACK_IMAGE_HEIGHT),en=P.getParameter(P.UNPACK_SKIP_PIXELS),cn=P.getParameter(P.UNPACK_SKIP_ROWS),Zn=P.getParameter(P.UNPACK_SKIP_IMAGES);P.pixelStorei(P.UNPACK_ROW_LENGTH,pt.width),P.pixelStorei(P.UNPACK_IMAGE_HEIGHT,pt.height),P.pixelStorei(P.UNPACK_SKIP_PIXELS,Ae),P.pixelStorei(P.UNPACK_SKIP_ROWS,ze),P.pixelStorei(P.UNPACK_SKIP_IMAGES,Ve);const Ei=T.isDataArrayTexture||T.isData3DTexture,ht=G.isDataArrayTexture||G.isData3DTexture;if(T.isDepthTexture){const wt=M.get(T),Pn=M.get(G),yt=M.get(wt.__renderTarget),Ln=M.get(Pn.__renderTarget);Se.bindFramebuffer(P.READ_FRAMEBUFFER,yt.__webglFramebuffer),Se.bindFramebuffer(P.DRAW_FRAMEBUFFER,Ln.__webglFramebuffer);for(let yi=0;yi<ye;yi++)Ei&&(P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,M.get(T).__webglTexture,k,Ve+yi),P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,M.get(G).__webglTexture,me,gt+yi)),P.blitFramebuffer(Ae,ze,ve,ge,we,ct,ve,ge,P.DEPTH_BUFFER_BIT,P.NEAREST);Se.bindFramebuffer(P.READ_FRAMEBUFFER,null),Se.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else if(k!==0||T.isRenderTargetTexture||M.has(T)){const wt=M.get(T),Pn=M.get(G);Se.bindFramebuffer(P.READ_FRAMEBUFFER,kh),Se.bindFramebuffer(P.DRAW_FRAMEBUFFER,Vh);for(let yt=0;yt<ye;yt++)Ei?P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,wt.__webglTexture,k,Ve+yt):P.framebufferTexture2D(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,wt.__webglTexture,k),ht?P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,Pn.__webglTexture,me,gt+yt):P.framebufferTexture2D(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,Pn.__webglTexture,me),k!==0?P.blitFramebuffer(Ae,ze,ve,ge,we,ct,ve,ge,P.COLOR_BUFFER_BIT,P.NEAREST):ht?P.copyTexSubImage3D(be,me,we,ct,gt+yt,Ae,ze,ve,ge):P.copyTexSubImage2D(be,me,we,ct,Ae,ze,ve,ge);Se.bindFramebuffer(P.READ_FRAMEBUFFER,null),Se.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else ht?T.isDataTexture||T.isData3DTexture?P.texSubImage3D(be,me,we,ct,gt,ve,ge,ye,lt,Ct,pt.data):G.isCompressedArrayTexture?P.compressedTexSubImage3D(be,me,we,ct,gt,ve,ge,ye,lt,pt.data):P.texSubImage3D(be,me,we,ct,gt,ve,ge,ye,lt,Ct,pt):T.isDataTexture?P.texSubImage2D(P.TEXTURE_2D,me,we,ct,ve,ge,lt,Ct,pt.data):T.isCompressedTexture?P.compressedTexSubImage2D(P.TEXTURE_2D,me,we,ct,pt.width,pt.height,lt,pt.data):P.texSubImage2D(P.TEXTURE_2D,me,we,ct,ve,ge,lt,Ct,pt);P.pixelStorei(P.UNPACK_ROW_LENGTH,kt),P.pixelStorei(P.UNPACK_IMAGE_HEIGHT,nt),P.pixelStorei(P.UNPACK_SKIP_PIXELS,en),P.pixelStorei(P.UNPACK_SKIP_ROWS,cn),P.pixelStorei(P.UNPACK_SKIP_IMAGES,Zn),me===0&&G.generateMipmaps&&P.generateMipmap(be),Se.unbindTexture()},this.initRenderTarget=function(T){M.get(T).__webglFramebuffer===void 0&&B.setupRenderTarget(T)},this.initTexture=function(T){T.isCubeTexture?B.setTextureCube(T,0):T.isData3DTexture?B.setTexture3D(T,0):T.isDataArrayTexture||T.isCompressedArrayTexture?B.setTexture2DArray(T,0):B.setTexture2D(T,0),Se.unbindTexture()},this.resetState=function(){C=0,N=0,I=null,Se.reset(),se.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return fn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;const t=this.getContext();t.drawingBufferColorSpace=tt._getDrawingBufferColorSpace(e),t.unpackColorSpace=tt._getUnpackColorSpace()}}const Ps=4,Pc=80,Ql=-.4,Th=18,Ah=12,wx=120,wh=6,Rx=6,Cx=.5,Px=2,Qo=24,Lx=1,Dx=3;function gi(i,e,t){if(i===e)return t<i?0:1;let n=(t-i)/(e-i);return n<=0?0:n>=1?1:n*n*(3-2*n)}function ji(i,e,t){return t===0?i:t===1?e:i+(e-i)*t}function vr(i,e,t){let n=(i|0)>>>0;n=(n^(e|0)>>>0)>>>0,n=Math.imul(n^n>>>16,73244475)>>>0,n=(n^(t|0)>>>0)>>>0,n=Math.imul(n^n>>>16,73244475)>>>0,n=n+1831565813>>>0;let s=n;return s=Math.imul(s^s>>>15,s|1)>>>0,s=(s^s+Math.imul(s^s>>>7,s|61))>>>0,s=(s^s>>>14)>>>0,s/4294967296}function eu(i){return Math.floor(i/Qo)}function Ix(i,e,t){let n=0,s=1,r=0,a=e,o=t,l=i>>>0;for(let c=0;c<Dx;c++){const h=eu(a),d=eu(o),u=a/Qo-h,p=o/Qo-d,g=vr(l,h,d),v=vr(l,h+1,d),m=vr(l,h,d+1),f=vr(l,h+1,d+1),x=u*u*(3-2*u),y=p*p*(3-2*p),S=ji(g,v,x),A=ji(m,f,x),b=ji(S,A,y);n+=(b*2-1)*s,r+=s,s*=.5,a*=2,o*=2,l=Math.imul(l^2654435769,2246822507)>>>0>>>0}return r===0?0:n/r}function Ux(i,e){let t=0;if(i.viaducts)for(const n of i.viaducts)t+=-n.valleyDepth*Fs(e,n.center,n.halfLen);if(i.tunnels)for(const n of i.tunnels)t+=n.hillHeight*Fs(e,n.center,n.halfLen);return t}function Fs(i,e,t){const n=Math.abs(i-e);return n<=t?1:1-gi(t,t+wx,n)}function At(i,e){return zs(i,e)}function Rh(i,e,t){return At(i,e)+Ux(i,e)}function Nx(i,e,t){const n=i.terrainSeed??Lx,s=Ix(n,e,t)*Rx;return Rh(i,e)+s}function Ch(i,e){return Rh(i,e)-At(i,e)}function Fx(i,e){let t=0;if(i.viaducts)for(const n of i.viaducts){const s=n.valleyDepth*Fs(e,n.center,n.halfLen);t=Math.max(t,gi(0,Th,s))}if(i.tunnels)for(const n of i.tunnels){const s=n.hillHeight*Fs(e,n.center,n.halfLen);t=Math.max(t,gi(0,Ah,s))}return t}function _i(i,e){return Ch(i,e)<-Th}function Ox(i,e){return Ch(i,e)>Ah}function xi(i,e,t){return Ox(i,e)&&Math.abs(t)<wh}function Bx(i){return i<=Ps?Ql:Ql*(1-gi(Ps,Ps+Pc,i))}function zx(i,e){let t=0;if(i.tunnels)for(const n of i.tunnels)t+=n.hillHeight*Fs(e,n.center,n.halfLen);return t}function Gx(i,e,t){const n=zx(i,e);if(n===0)return 0;const s=1-gi(Ps,wh+Pc,t),r=gi(0,Px,n);return s*r}function Wn(i,e,t){const n=Math.abs(t),s=At(i,e),r=Nx(i,e,t),a=s+Bx(n),o=gi(0,Pc,n-Ps),l=ji(a,r,o),c=Fx(i,e),h=ji(l,r,c),d=Gx(i,e,n);return ji(h,a,d)}function Os(i,e,t,n){return Wn(i,e,t)+n}function Hx(i,e,t,n){const s=Wn(i,e,t)+Cx;return n>s?n:s}const kx=1.9,Vx=.5,Wx=.052,Xx=.07;function tu(i,e){return i>e?e:i<-e?-e:i}function Yx(i,e,t){return{pitch:tu(t*Math.atan(e),Wx),roll:tu(t*i,Xx)}}function qx(i,e,t,n){const s=dt(i,e,t),r=s.y+n;return{x:s.x,y:Hx(i,e,t,r),z:s.z,heading:s.heading}}const $x=120,Kx=240*Math.PI/180,Zx=120*Math.PI/180,nu=-.5,iu=.55,jx=3.2,Jx=52*Math.PI/180,su=-12*Math.PI/180;function Qx(i,e=0){const t=new Mt;t.position.x=e,i.add(t);const n=new Rc(16771272,.9,3.2);n.position.set(e,.15,-.35),i.add(n);const s=new Be({color:1316895,roughness:.7,metalness:.3}),r=new Be({color:1777704,roughness:.6,metalness:.25}),a=new Be({color:790292,roughness:.8,metalness:.2}),o=1.02,l=.82,c=-1.25,h=-.95,d=.85,u=.05,p=d-h,g=(h+d)/2,v=(l+c)/2,m=l-c,f=(Me,Ke,P,qe,He,st)=>{const Se=new Ie(new We(Me,Ke,P),a);Se.position.set(qe,He,st),t.add(Se)};f(u,m,p,-o,v,g),f(u,m,p,o,v,g),f(2*o+u,u,p,0,l,g),f(2*o+u,u,p,0,c,g),f(2*o+u,m,u,0,v,d);const x=o-.95+u,y=.95+x/2-u/2;f(x,m,u,-y,v,h),f(x,m,u,y,v,h);const S=l-.62;f(2*.95,S,u,0,.62+S/2,h);const A=-.62-c;f(2*.95,A,u,0,-.62-A/2,h);const b=-.9,w=a,_=.95,E=.62,L=.06,C=(Me,Ke,P,qe)=>{const He=new Ie(new We(Me,Ke,L),w);return He.position.set(P,qe,b),He};t.add(C(2*_+L,L,0,E)),t.add(C(2*_+L,L,0,-E)),t.add(C(L,2*E,-_,0)),t.add(C(L,2*E,_,0)),t.add(C(L,2*E,0,0));const N=new Ie(new We(1.9,.08,.55),r);N.position.set(0,-.62,-.78),N.rotation.x=-.18,t.add(N);function I(Me,Ke){const P=new Mt;P.position.set(Me,-.58,-.7);const qe=new Ie(new Vn(.018,.022,.26,12),s);qe.position.y=.13,P.add(qe);const He=new Ie(new Gs(.04,16,12),new Be({color:Ke,roughness:.5,metalness:.2}));return He.position.y=.27,P.add(He),t.add(P),P}const z=I(-.42,3828282),F=I(.42,6959152),O=new Mt;O.position.set(-.74,-.58,-.66);const H=new Ie(new Vn(.014,.016,.14,10),s);H.position.y=.07,O.add(H),t.add(O);const K=new Mt;K.position.set(0,-.46,-.66),K.rotation.x=-.35;const Z=new Ie(new Vn(.12,.12,.02,32),new Be({color:329740,roughness:.5,metalness:.1}));Z.rotation.x=Math.PI/2,K.add(Z);const ne=new Ie(new Ac(.12,.012,12,32),new Be({color:2238771,roughness:.6,metalness:.4}));K.add(ne);const le=new Mt;K.add(le);const ae=new Ie(new We(.012,.1,.006),new Be({color:16733491,emissive:16724753,emissiveIntensity:.6,roughness:.4}));ae.position.set(0,.045,.012),le.add(ae);const Re=new ns(.03,20);function De(Me,Ke){const P=new Be({color:658706,emissive:new Ne(Ke),emissiveIntensity:0,roughness:.5}),qe=new Ie(Re,P);return qe.position.set(Me,-.4,-.64),qe.rotation.x=-.35,t.add(qe),{mesh:qe,mat:P}}const Ye=De(-.36,16756768),j=De(-.28,16756768),ce=De(-.2,16724770),oe=new Mt;oe.position.set(.34,-.4,-.64),oe.rotation.x=-.35;const Ue=new Ie(new ns(.035,24),new Be({color:329482,roughness:.6}));oe.add(Ue);const Te=new Ie(new jr(.018,.034,16,1),new Be({color:15777824,emissive:12619792,emissiveIntensity:.5,roughness:.5}));Te.position.z=.001,Te.visible=!1,oe.add(Te),t.add(oe);let Ce=0;const rt=new Mt;rt.position.set(-.5,-E+.02,b-.04);const Xe=new Ie(new We(.025,1.05,.02),new Be({color:329482,roughness:.8}));Xe.position.y=.5,rt.add(Xe),t.add(rt);function $e(Me,Ke,P){return Me+(Ke-Me)*P}function it(Me){z.rotation.x=$e(nu,iu,Mr(Me.powerFrac)),F.rotation.x=$e(nu,iu,Mr(Me.brakeFrac)),O.rotation.x=Me.reverser==="FWD"?.5:Me.reverser==="REV"?-.5:0;const Ke=Mr(Math.abs(Me.speedMph)/$x);if(le.rotation.z=Zx-Ke*Kx,Ye.mat.emissiveIntensity=Me.dra?1.1:0,j.mat.emissiveIntensity=Me.dsd?1.1:0,ce.mat.emissiveIntensity=Me.penalty?1.3:0,Te.visible=Me.sunflower==="CAUTION",Me.wiperOn)Ce+=Me.dt*jx,rt.rotation.z=su+Math.sin(Ce)*Jx;else{const P=Mr(Me.dt*4);rt.rotation.z=$e(rt.rotation.z,su,P)}}return{update:it}}const Mr=i=>i<0?0:i>1?1:i;function ea(i){let e=i>>>0;return()=>{e=e+1831565813>>>0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}const Qt=new je,ss=new D,rs=new D,as=new $t,ev=new D(0,1,0);function Ls(i,e,t,n,s,r,a,o){Qt.compose(ss.set(t,n,s),as,rs.set(r,a,o)),i.setMatrixAt(e,Qt)}function tv(i,e,t){nv(i,e,t),iv(i,e,t),sv(i,e,t),Sr(i,e,t,1200,5922406),Sr(i,e,t,3e3,7034695),Sr(i,e,t,4e3,5462111),Sr(i,e,t,6600,7034695),rv(i,e,t)}function nv(i,e,t){const n=e.length,s=ea(8675309),r=720,a=new Be({color:4864552,roughness:1}),o=new ft(new Vn(.18,.26,1,6),a,r),l=new Be({color:3366959,roughness:1,flatShading:!0}),c=new ft(new Zr(1,0),l,r),h=t/2+7;let d=0,u=0;for(;d<r&&u<r*4;){u++;const p=s()*n,v=(s()<.5?-1:1)*(h+s()*s()*150),m=3+Math.floor(s()*5);for(let f=0;f<m&&d<r;f++){const x=p+(s()-.5)*28,y=v+(s()-.5)*22;if(Math.abs(y)<h||x<0||x>n||_i(e,x)||xi(e,x,y))continue;const S=dt(e,x,y),A=Os(e,x,y,0),b=4+s()*7,w=b*.45;Ls(o,d,S.x,A+w/2,S.z,1,w,1);const _=b*.42;Qt.compose(ss.set(S.x,A+w+_*.7,S.z),as,rs.set(_,_*1.25,_)),c.setMatrixAt(d,Qt),d++}}for(let p=d;p<r;p++)Ls(o,p,0,-1e3,0,1,1,1),Ls(c,p,0,-1e3,0,1,1,1);o.instanceMatrix.needsUpdate=!0,c.instanceMatrix.needsUpdate=!0,o.frustumCulled=!1,c.frustumCulled=!1,i.add(o),i.add(c)}function iv(i,e,t){const n=e.length,s=ea(1234567),r=520,a=new Be({color:2904360,roughness:1,flatShading:!0}),o=new ft(new Zr(1,0),a,r),l=t/2+6;let c=0,h=0;for(;c<r&&h<r*4;){h++;const d=s()*n,p=(s()<.5?-1:1)*(l+s()*s()*90),g=4+Math.floor(s()*6);for(let v=0;v<g&&c<r;v++){const m=d+(s()-.5)*24,f=p+(s()-.5)*10;if(Math.abs(f)<l||m<0||m>n||_i(e,m)||xi(e,m,f))continue;const x=dt(e,m,f),y=Os(e,m,f,0),S=.7+s()*.9,A=.5+s()*.5;Qt.compose(ss.set(x.x,y+A*.8,x.z),as,rs.set(S,A,S)),o.setMatrixAt(c,Qt),c++}}for(let d=c;d<r;d++)Ls(o,d,0,-1e3,0,1,1,1);o.instanceMatrix.needsUpdate=!0,o.frustumCulled=!1,i.add(o)}function sv(i,e,t){const n=e.length,s=ea(20260617),r=240,a=new Be({roughness:.9,flatShading:!0}),o=new ft(new We(1,1,1),a,r),l=[3816772,4604219,4014664,4867392,3553856,5261890],c=t/2+12,h=new Ne,d=[{c:700,half:1100,maxH:26,reach:150},{c:2e3,half:700,maxH:12,reach:110}];let u=0,p=0;for(;u<r&&p<r*6;){p++;const g=d[Math.floor(s()*d.length)];if(!g)continue;const v=g.c+(s()-.5)*2*g.half;if(v<0||v>n)continue;const f=(s()<.5?-1:1)*(c+s()*s()*g.reach);if(_i(e,v)||xi(e,v,f))continue;const x=dt(e,v,f),y=Os(e,v,f,0),A=4+(1-Math.min(1,Math.abs(f)/(c+g.reach)))*g.maxH*(.4+s()*.6),b=5+s()*9,w=5+s()*9;Qt.compose(ss.set(x.x,y+A/2,x.z),as,rs.set(b,A,w)),o.setMatrixAt(u,Qt);const _=l[Math.floor(s()*l.length)]??3816772;o.setColorAt(u,h.setHex(_)),u++}for(let g=u;g<r;g++)Ls(o,g,0,-1e3,0,1,1,1);o.instanceMatrix.needsUpdate=!0,o.instanceColor&&(o.instanceColor.needsUpdate=!0),o.frustumCulled=!1,i.add(o)}function Sr(i,e,t,n,s){if(n<0||n>e.length||_i(e,n)||xi(e,n,0))return;const r=new Be({color:s,roughness:.9}),a=16,o=At(e,n),l=6.2,c=o+l,h=.7,d=dt(e,n,0),u=new Mt;u.position.set(d.x,0,d.z),u.quaternion.setFromAxisAngle(ev,d.heading);const p=new Ie(new We(a,h,4.5),r);p.position.set(0,c,0),u.add(p);for(const g of[-2,2]){const v=new Ie(new We(a,1,.3),r);v.position.set(0,c+.85,g),u.add(v)}for(const g of[-5.2175,t/2+4.5]){const v=new Ie(new We(3,l,5),r);v.position.set(g*1.6,o+l/2,0),u.add(v)}i.add(u)}function rv(i,e,t){const n=ea(54321),s=t/2+.7+1,r=.9,a=[9059122,3297390,3493946,5917234,4211274],o=e.stations.length*4,l=new ft(new bc(.22,.9,3,6),new Be({roughness:1}),o),c=new ft(new Gs(.16,8,6),new Be({color:13150602,roughness:1}),o),h=new Ne;let d=0;for(const u of e.stations){const p=At(e,u.chainage)+r,g=4;for(let v=0;v<g;v++){const m=u.chainage+(n()-.5)*2*(u.platformHalf-12),f=s+(n()-.5)*1.4,x=dt(e,m,f);Qt.compose(ss.set(x.x,p+.85,x.z),as,rs.set(1,1,1)),l.setMatrixAt(d,Qt);const y=a[v%a.length]??8421504;l.setColorAt(d,h.setHex(y)),Qt.compose(ss.set(x.x,p+1.55,x.z),as,rs.set(1,1,1)),c.setMatrixAt(d,Qt),d++}}l.instanceMatrix.needsUpdate=!0,l.instanceColor&&(l.instanceColor.needsUpdate=!0),c.instanceMatrix.needsUpdate=!0,i.add(l),i.add(c)}function Er(i,e,t){let n=(i|0)*374761393+(e|0)*668265263+(t|0)*362437;return n=(n^n>>>13)*1274126177,n=n^n>>>16,(n>>>0)/4294967296}function qn(i){return i*i*(3-2*i)}function av(i,e,t,n){const s=Math.floor(i),r=Math.floor(e),a=qn(i-s),o=qn(e-r),l=(s%t+t)%t,c=(r%t+t)%t,h=(l+1)%t,d=(c+1)%t,u=Er(l,c,n),p=Er(h,c,n),g=Er(l,d,n),v=Er(h,d,n),m=u+(p-u)*a,f=g+(v-g)*a;return m+(f-m)*o}function ru(i,e,t,n,s){let r=0,a=1,o=0,l=t,c=1;for(let h=0;h<n;h++)r+=a*av(i*c,e*c,l,s+h*101),o+=a,a*=.5,c*=2,l*=2;return o>0?r/o:0}function Ph(i){const e=document.createElement("canvas");e.width=i,e.height=i;const t=e.getContext("2d");if(!t){const s=new ImageData(i,i);return{canvas:e,ctx:t,img:s}}const n=t.createImageData(i,i);return{canvas:e,ctx:t,img:n}}function wn(i){return i<0?0:i>255?255:i|0}function ta(i,e,t){const n=new Kr(i);return n.colorSpace=Dt,n.wrapS=mi,n.wrapT=mi,n.repeat.set(e,e),n.anisotropy=t,n.needsUpdate=!0,n}function na(i,e,t){const n=new Kr(i);return n.colorSpace=yn,n.wrapS=mi,n.wrapT=mi,n.repeat.set(e,e),n.anisotropy=t,n.needsUpdate=!0,n}function ia(i,e,t,n){const{canvas:s,ctx:r,img:a}=Ph(i),o=a.data;for(let l=0;l<i*i;l++){const c=e[l]??0,h=t[l]??0,[d,u,p]=n(c,h),g=l*4;o[g]=wn(d),o[g+1]=wn(u),o[g+2]=wn(p),o[g+3]=255}return r&&typeof r.putImageData=="function"&&r.putImageData(a,0,0),s}function sa(i,e,t){const{canvas:n,ctx:s,img:r}=Ph(i),a=r.data,o=(l,c)=>{const h=(l%i+i)%i,d=(c%i+i)%i;return e[d*i+h]??0};for(let l=0;l<i;l++)for(let c=0;c<i;c++){const h=(o(c-1,l)-o(c+1,l))*t,d=(o(c,l-1)-o(c,l+1))*t,u=-h,p=-d,g=1,v=Math.sqrt(u*u+p*p+g*g)||1,m=(l*i+c)*4;a[m]=wn(u/v*127.5+127.5),a[m+1]=wn(p/v*127.5+127.5),a[m+2]=wn(g/v*127.5+127.5),a[m+3]=255}return s&&typeof s.putImageData=="function"&&s.putImageData(r,0,0),n}function ra(i,e,t,n,s,r){const a=new Float32Array(i*i),o=new Float32Array(i*i),l=e/i,c=n/i;for(let h=0;h<i;h++)for(let d=0;d<i;d++){const u=h*i+d;a[u]=ru(d*l,h*l,e,t,r),o[u]=ru(d*c,h*c,n,s,r+9973)}return{height:a,detail:o}}function $n(i,e,t){return[i[0]+(e[0]-i[0])*t,i[1]+(e[1]-i[1])*t,i[2]+(e[2]-i[2])*t]}function ov(i,e,t){const{height:n,detail:s}=ra(i,4,4,16,3,1311),r=[86,66,40],a=[48,70,32],o=[96,122,56],l=ia(i,n,s,(d,u)=>{const p=$n(a,o,u);return $n(r,p,qn(Math.min(1,d*1.3)))}),c=new Float32Array(i*i);for(let d=0;d<c.length;d++)c[d]=(n[d]??0)*.7+(s[d]??0)*.3;const h=sa(i,c,3);return{albedo:ta(l,e,t),normal:na(h,e,t)}}function cv(i,e,t){const{height:n,detail:s}=ra(i,8,2,32,4,5101),r=[60,58,56],a=[140,136,130],o=ia(i,n,s,(c,h)=>{const d=qn(h);return $n(r,a,d)}),l=sa(i,s,5);return{albedo:ta(o,e,t),normal:na(l,e,t)}}function lv(i,e,t){const{height:n,detail:s}=ra(i,6,3,24,2,7321),r=[150,146,138],a=[110,104,96],o=new Float32Array(i*i),l=ia(i,n,s,(h,d)=>$n(a,r,qn(h*.6+d*.4)));for(let h=0;h<i;h++){const d=Math.abs(h/i*6%1-.5)<.04?0:1;for(let u=0;u<i;u++){const p=h*i+u;o[p]=(s[p]??0)*.5+d*.5}}const c=sa(i,o,2);return{albedo:ta(l,e,t),normal:na(c,e,t)}}function uv(i,e,t){const{height:n,detail:s}=ra(i,2,2,48,2,211),r=[96,98,104],a=[150,152,158],o=new Float32Array(i*i),l=ia(i,n,s,(h,d)=>{const u=qn(d*.6+.2);return $n(r,a,u)});for(let h=0;h<o.length;h++)o[h]=(s[h]??0)*.25;const c=sa(i,o,.8);return{albedo:ta(l,e,t),normal:na(c,e,t)}}function hv(i=1){const e=Math.max(1,i|0),t=ov(256,1,e),n=cv(128,1,e),s=lv(256,1,e),r=uv(64,1,e),a=[t,n,s,r];return{ground:t,ballast:n,masonry:s,rail:r,dispose(){for(const o of a)o.albedo.dispose(),o.normal.dispose()}}}const Hr=16,kr=16;function au(i){return[i>>16&255,i>>8&255,i&255]}function ou(i,e){const t=au(i),n=au(e),s=[t[0]*.72,t[1]*.76,t[2]*.85],r=$n(t,[255,255,255],.18),a=new Uint8Array(Hr*kr*4);dv(a,s,r,n);const o=new Ec(a,Hr,kr,Jt);return o.mapping=Ar,o.colorSpace=Dt,o.minFilter=Tt,o.magFilter=Tt,o.needsUpdate=!0,o}function dv(i,e,t,n){for(let s=0;s<kr;s++){const r=s/(kr-1);let a;r<.5?a=$n(e,t,qn(r/.5)):a=$n(t,n,qn((r-.5)/.5));for(let o=0;o<Hr;o++){const l=(s*Hr+o)*4;i[l]=wn(a[0]),i[l+1]=wn(a[1]),i[l+2]=wn(a[2]),i[l+3]=255}}}function fv(i){i&&i.dispose()}function pv(){const e=document.createElement("canvas");e.width=e.height=32;const t=e.getContext("2d");if(t){const r=t.createRadialGradient(16,16,0,16,16,16);r.addColorStop(0,"rgba(255,255,255,1)"),r.addColorStop(.5,"rgba(255,255,255,0.55)"),r.addColorStop(1,"rgba(255,255,255,0)"),t.fillStyle=r,t.fillRect(0,0,32,32)}const n=new Kr(e);return n.colorSpace=Dt,n.needsUpdate=!0,n}const cu=200,mv=900,lu=1.435,gv=.25,_v=.07,qa=.12,uu=.06,xv=2.6,hu=.12,vv=.25,du=.65,Mv=1.9,fu=.34,$a=.35,Sv=.08,pu=40,Ev=2.4,yv=3,Ka=1.6,Za=3.2,bv=2.2,Tv=1.5,mu=5.5,gu=7.5,ja=8.5,Es=1.4;function Ja(i,e,t){i.map=e.albedo,i.normalMap=e.normal,i.envMapIntensity=t,i.needsUpdate=!0}function Av(i,e,t,n=1){const s=hv(n),r=[s],a=f=>{r.push(f)},o=new Mt;i.add(o);const l=new Be({color:16777215,roughness:1}),c=s.ground.albedo.clone(),h=s.ground.normal.clone();c.needsUpdate=!0,h.needsUpdate=!0,c.repeat.set(8,8),h.repeat.set(8,8),l.map=c,l.normalMap=h,l.envMapIntensity=gv,a(l),a(c),a(h),wv(o,e,t,l,a);const d=new Be({color:5923438,metalness:.95,roughness:$a});Ja(d,s.rail,1),a(d);const u=new Be({color:16777215,roughness:1});Ja(u,s.ballast,.15),a(u);const p=new Be({color:2762274,roughness:.95});a(p),Rv(o,e,t,d,u,p,a);const g=new Be({color:16777215,roughness:.92});Ja(g,s.masonry,.2),a(g);const v=[];Cv(o,e,g,v,a);const m=Pv(o,e,g,a);return Dv(o,e,v,a),{group:o,railMaterial:d,waterMaterials:v,boreLight:m,railRoughnessFor(f){const x=f<0?0:f>1?1:f;return $a+(Sv-$a)*x},dispose(){i.remove(o),Iv(o);for(const f of r)f.dispose()}}}function wv(i,e,t,n,s){const r=-cu,a=e.length+cu,o=Math.max(1,t.terrainSegLen),l=Math.max(1,Math.ceil((a-r)/o)),c=l+1,h=Math.max(2,t.terrainSubdiv)+1,d=t.ribbonHalfWidth,u=new Float32Array(c*h*3),p=new Float32Array(c*h*2),g=_=>r+_/l*(a-r),v=_=>-d+_/(h-1)*(2*d);for(let _=0;_<c;_++){const E=g(_);for(let L=0;L<h;L++){const C=v(L),N=dt(e,E,C),I=Wn(e,E,C),z=(_*h+L)*3;u[z]=N.x,u[z+1]=I,u[z+2]=N.z;const F=(_*h+L)*2;p[F]=E/40,p[F+1]=C/40}}const m=new Float32Array(c*h*3),f=(_,E,L)=>{const C=_<0?0:_>=c?c-1:_,N=E<0?0:E>=h?h-1:E,I=(C*h+N)*3;return L.set(u[I]??0,u[I+1]??0,u[I+2]??0)},x=new D,y=new D,S=new D,A=new D,b=new D;for(let _=0;_<c;_++)for(let E=0;E<h;E++){f(_+1,E,x),f(_-1,E,y),S.subVectors(x,y),f(_,E+1,x),f(_,E-1,y),A.subVectors(x,y),b.crossVectors(A,S),b.y<0&&b.negate(),b.normalize();const L=(_*h+E)*3;m[L]=b.x,m[L+1]=b.y,m[L+2]=b.z}const w=Math.max(1,Math.round(mv/o));for(let _=0;_<l;_+=w){const L=Math.min(l,_+w)-_+1,C=L*h,N=new Float32Array(C*3),I=new Float32Array(C*3),z=new Float32Array(C*2);for(let K=0;K<L;K++){const Z=_+K;for(let ne=0;ne<h;ne++){const le=(Z*h+ne)*3,ae=(K*h+ne)*3;N[ae]=u[le]??0,N[ae+1]=u[le+1]??0,N[ae+2]=u[le+2]??0,I[ae]=m[le]??0,I[ae+1]=m[le+1]??0,I[ae+2]=m[le+2]??0;const Re=(Z*h+ne)*2,De=(K*h+ne)*2;z[De]=p[Re]??0,z[De+1]=p[Re+1]??0}}const F=[];for(let K=0;K<L-1;K++)for(let Z=0;Z<h-1;Z++){const ne=K*h+Z,le=(K+1)*h+Z,ae=K*h+(Z+1),Re=(K+1)*h+(Z+1);F.push(ne,le,Re,ne,Re,ae)}if(F.length===0)continue;const O=new vt;O.setAttribute("position",new Nt(N,3)),O.setAttribute("normal",new Nt(I,3)),O.setAttribute("uv",new Nt(z,2)),O.setIndex(F),O.computeBoundingSphere(),s(O);const H=new Ie(O,n);H.receiveShadow=!0,i.add(H)}}function Rv(i,e,t,n,s,r,a){const o=e.length,l=Math.max(2,t.terrainSegLen),c=Math.max(1,Math.ceil(o/l)),h=new We(_v,qa,1);a(h);const d=new We(Mv*2,.3,1);a(d);const u=new ft(h,n,c),p=new ft(h,n,c),g=new ft(d,s,c);g.receiveShadow=!0;const v=new je,m=new D,f=new $t,x=new Bt(0,0,0,"YXZ"),y=new D(1,1,1);for(let w=0;w<c;w++){const _=w*l,E=Math.min(o,(w+1)*l),L=(_+E)/2,C=E-_,N=jt(e,L),I=At(e,L);x.set(0,N,0),f.setFromEuler(x);const z=dt(e,L,0);y.set(1,1,C),m.set(z.x,I-fu-.15,z.z),v.compose(m,f,y),g.setMatrixAt(w,v);const F=dt(e,L,-lu/2);m.set(F.x,I+uu-qa/2,F.z),v.compose(m,f,y),u.setMatrixAt(w,v);const O=dt(e,L,lu/2);m.set(O.x,I+uu-qa/2,O.z),v.compose(m,f,y),p.setMatrixAt(w,v)}u.instanceMatrix.needsUpdate=!0,p.instanceMatrix.needsUpdate=!0,g.instanceMatrix.needsUpdate=!0,i.add(u,p,g);const S=new We(xv,hu,vv);a(S);const A=Math.max(1,Math.floor(o/du)),b=new ft(S,r,A);for(let w=0;w<A;w++){const _=(w+.5)*du,E=jt(e,_),L=dt(e,_,0),C=At(e,_);x.set(0,E,0),f.setFromEuler(x),y.set(1,1,1),m.set(L.x,C-fu+hu/2,L.z),v.compose(m,f,y),b.setMatrixAt(w,v)}b.instanceMatrix.needsUpdate=!0,i.add(b)}function Cv(i,e,t,n,s){const r=e.viaducts;if(!r||r.length===0)return;const a=new je,o=new D,l=new $t,c=new Bt(0,0,0,"YXZ"),h=new D(1,1,1),d=8;let u=0,p=0;for(const S of r){const A=S.center-S.halfLen,b=S.center+S.halfLen;u+=Math.max(1,Math.ceil((b-A)/d));const w=Math.max(2,Math.floor((b-A)/pu)+1);p+=w*2}const g=new We(Za*2,Ka,d+.2);s(g);const v=new ft(g,t,u);v.castShadow=!0,v.receiveShadow=!0;const m=new We(Ev,1,yv);s(m);const f=new ft(m,t,p);f.castShadow=!0;let x=0,y=0;for(const S of r){const A=S.center-S.halfLen,b=S.center+S.halfLen,w=Math.max(1,Math.ceil((b-A)/d));for(let I=0;I<w;I++){const z=A+(I+.5)*(b-A)/w,F=jt(e,z),O=dt(e,z,0),H=At(e,z);c.set(0,F,0),l.setFromEuler(c),h.set(1,1,1),o.set(O.x,H-Ka/2-.5,O.z),a.compose(o,l,h),v.setMatrixAt(x++,a)}const _=Math.max(2,Math.floor((b-A)/pu)+1);for(let I=0;I<_;I++){const z=_===1?S.center:A+I/(_-1)*(b-A),F=jt(e,z),O=At(e,z);c.set(0,F,0),l.setFromEuler(c);for(const H of[-1,1]){const K=H*bv,Z=dt(e,z,K),ne=Wn(e,z,K),le=O-Ka-.5,ae=Math.max(.5,le-ne);h.set(1,ae,1),o.set(Z.x,ne+ae/2,Z.z),a.compose(o,l,h),f.setMatrixAt(y++,a)}}const E=dt(e,S.center,0);Wn(e,S.center,0);const L=new ls(80,S.halfLen*2+60);s(L);const C=new Be({color:2243146,roughness:.12,metalness:.5});C.envMapIntensity=.8,s(C),n.push(C);const N=new Ie(L,C);N.rotation.x=-Math.PI/2,N.rotation.z=jt(e,S.center),N.position.set(E.x,At(e,S.center)-S.valleyDepth+Tv,E.z),i.add(N);for(const I of[A,b]){const z=jt(e,I),F=dt(e,I,0),O=At(e,I),H=Wn(e,I,Za+4),K=Math.max(2,O-H+2),Z=new We(Za*2+4,K,5);s(Z);const ne=new Ie(Z,t);ne.castShadow=!0,ne.receiveShadow=!0,c.set(0,z,0),l.setFromEuler(c),h.set(1,1,1),o.set(F.x,O-K/2,F.z),ne.position.copy(o),ne.quaternion.copy(l),i.add(ne)}}v.instanceMatrix.needsUpdate=!0,f.instanceMatrix.needsUpdate=!0,i.add(v,f)}function Pv(i,e,t,n){const s=e.tunnels;if(!s||s.length===0)return null;const r=10,a=new Be({color:329226,roughness:1,metalness:0,side:It});n(a);const o=new je,l=new D,c=new $t,h=new Bt(0,0,0,"YXZ"),d=new D(1,1,1);let u=0;for(const f of s)u+=Math.max(1,Math.ceil(2*f.halfLen/r));const p=new Vn(mu,mu,r+.2,16,1,!0,0,Math.PI);n(p);const g=new ft(p,a,u);let v=null,m=0;for(const f of s){const x=f.center-f.halfLen,y=f.center+f.halfLen,S=Math.max(1,Math.ceil(2*f.halfLen/r));for(let A=0;A<S;A++){const b=x+(A+.5)*(y-x)/S,w=jt(e,b),_=dt(e,b,0),E=At(e,b);h.set(Math.PI/2,w,0),c.setFromEuler(h),d.set(1,1,1),l.set(_.x,E+.2,_.z),o.compose(l,c,d),g.setMatrixAt(m++,o)}for(const A of[x,y]){const b=jt(e,A),w=dt(e,A,0),_=At(e,A),E=Lv(t,n);h.set(0,b,0),E.quaternion.setFromEuler(h),E.position.set(w.x,_,w.z),i.add(E)}if(!v){const A=dt(e,y,0),b=At(e,y);v=new Rc(6978192,.6,90,1.5),v.position.set(A.x,b+2.5,A.z),i.add(v)}}return g.instanceMatrix.needsUpdate=!0,i.add(g),v}function Lv(i,e){const t=new Mt,n=new We(Es,ja*2,Es);e(n);for(const a of[-1,1]){const o=new Ie(n,i);o.position.set(a*gu,ja,0),o.castShadow=!0,t.add(o)}const s=new We(gu*2+Es,Es,Es);e(s);const r=new Ie(s,i);return r.position.set(0,ja*2,0),r.castShadow=!0,t.add(r),t}function Dv(i,e,t,n){const s=e.stations.find(x=>/coast|brine/i.test(x.name)),r=e.stations[e.stations.length-1];if(!r)return;const a=s?s.chainage:e.length*.75,o=r.chainage,l=(a+o)/2;if(!e.tunnels&&!e.viaducts)return;const c=jt(e,l),h=2e3,u=dt(e,l,120+h/2),p=o-a+600,g=At(e,o)-6,v=new ls(h,p);n(v);const m=new Be({color:1454399,roughness:.1,metalness:.6});m.envMapIntensity=1,n(m),t.push(m);const f=new Ie(v,m);f.rotation.x=-Math.PI/2,f.rotation.z=c,f.position.set(u.x,g,u.z),i.add(f)}function Iv(i){i.traverse(e=>{const t=e;t.geometry&&typeof t.geometry.dispose=="function"&&t.geometry.dispose();const n=t.material;if(Array.isArray(n))for(const s of n)s.dispose();else n&&typeof n.dispose=="function"&&n.dispose()})}const Uv=2.236936,Cs={RED:16720920,YELLOW:16756768,DOUBLE_YELLOW:16756768,GREEN:3211104},Nv=18,Qa=16,eo=40,Fv=22,Ov=.35,Xn=1.435,Bv=.5,_u=4,xu=140,ys=100,vu=2048,zv=2400,Gv=2;function Mu(i,e,t,n){const s=1-Math.exp(-4*Math.max(0,n));return i+(e-i)*s}function Hv(i,e,t){const n=t?.rainCount??zv,s=t?.pixelRatioCap??Gv,r=t?.shadowsEnabled??!1,a=t?.bloomEnabled??!1,o=t?.attitudeScale??0,l={ribbonHalfWidth:t?.ribbonHalfWidth??110,terrainSegLen:t?.terrainSegLen??20,terrainSubdiv:t?.terrainSubdiv??10},c=new Ax({antialias:!0});c.setPixelRatio(Math.min(window.devicePixelRatio,s)),c.setSize(i.clientWidth,i.clientHeight),c.outputColorSpace=Dt,c.toneMapping=uc,c.toneMappingExposure=1,r&&(c.shadowMap.enabled=!0,c.shadowMap.type=Hu),i.appendChild(c.domElement);const h=c.capabilities.getMaxAnisotropy(),d=new ap;d.background=new Ne(329743),d.fog=new Sc(329743,25,260);const u=new Yt(70,i.clientWidth/i.clientHeight,.05,4e3);u.rotation.order="YXZ";const p=.0042;let g=0,v=0,m=!1,f=0,x=0;const y=c.domElement;y.addEventListener("pointerdown",W=>{if(W.button===0){m=!0,f=W.clientX,x=W.clientY;try{y.setPointerCapture(W.pointerId)}catch{}}}),y.addEventListener("pointermove",W=>{m&&(g-=(W.clientX-f)*p,v-=(W.clientY-x)*p,f=W.clientX,x=W.clientY,g=Math.max(-2.4,Math.min(2.4,g)),v=Math.max(-.7,Math.min(.7,v)))});const S=W=>{if(m){m=!1;try{y.releasePointerCapture(W.pointerId)}catch{}}};y.addEventListener("pointerup",S),y.addEventListener("pointercancel",S);const A={topColor:{value:new Ne(329743)},bottomColor:{value:new Ne(660008)},offset:{value:33},exponent:{value:.6}},b=new on({uniforms:A,side:It,depthWrite:!1,fog:!1,vertexShader:`
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,fragmentShader:`
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }`}),w=new Ie(new Gs(3e3,24,12),b);d.add(w);let _=ou(329743,922639);d.environment=_;let E=329743,L=922639;const C=new wp(1713718,197642,.35);d.add(C);const N=new Rl(9085128,.4);N.position.set(-40,80,-20),d.add(N);const I=new Rl(16777215,0),z=new xt;if(d.add(I),d.add(z),I.target=z,r){I.castShadow=!0,I.shadow.mapSize.set(vu,vu);const W=I.shadow.camera;W.left=-ys,W.right=ys,W.top=ys,W.bottom=-ys,W.near=1,W.far=xu+ys*2,W.updateProjectionMatrix(),I.shadow.bias=-4e-4,I.shadow.normalBias=.6}const F=Av(d,e,l,h);for(const W of e.stations)Yv(d,e,W);const O=kv(d,e);Wv(d,e),tv(d,e,Xn),Xv(d,e);const H=new Float32Array(n*3);for(let W=0;W<n;W++)H[W*3+0]=(Math.random()*2-1)*Nv,H[W*3+1]=Math.random()*2*Qa,H[W*3+2]=(Math.random()*2-1)*eo;const K=new vt;K.setAttribute("position",new Nt(H,3));const Z=pv(),ne=new fh({color:10467032,map:Z,size:.06,transparent:!0,opacity:.5,depthWrite:!1,fog:!1}),le=new xp(K,ne);le.frustumCulled=!1,d.add(le);const ae=new Mt;d.add(ae);const Re=Qx(ae,Bv),De={powerFrac:0,brakeFrac:0,reverser:"OFF",speedMph:0,sunflower:"BLACK",dra:!1,dsd:!1,penalty:!1,wiperOn:!0,dt:0};let Ye=null,j=null,ce=!1,oe=!1;function Ue(){ce||Ye||oe||(ce=!0,Promise.all([Ws(()=>import("./EffectComposer-DW6WA_9W.js"),__vite__mapDeps([0,1,2]),import.meta.url),Ws(()=>import("./RenderPass-8fHSC201.js"),__vite__mapDeps([3,2]),import.meta.url),Ws(()=>import("./UnrealBloomPass-CbUMFYuv.js"),__vite__mapDeps([4,2,1]),import.meta.url),Ws(()=>import("./OutputPass-BLD0oipU.js"),__vite__mapDeps([5,2]),import.meta.url)]).then(([W,Q,_e,$])=>{const te=new Fe(i.clientWidth,i.clientHeight),he=new W.EffectComposer(c);he.addPass(new Q.RenderPass(d,u));const xe=new _e.UnrealBloomPass(te,.6,.6,.85);he.addPass(xe),he.addPass(new $.OutputPass),he.setSize(i.clientWidth,i.clientHeight),Ye=he,j=xe}).catch(()=>{oe=!0,ce=!1}))}const Te=new D;let Ce=0,rt=0;function Xe(W){for(let Q=0;Q<O.length;Q++){const _e=O[Q];if(!_e)continue;const $=ui(e,Q,W.served);_e.red.emissiveIntensity=$==="RED"?1.4:0,_e.amberTop.emissiveIntensity=$==="YELLOW"||$==="DOUBLE_YELLOW"?1.3:0,_e.amberBot.emissiveIntensity=$==="DOUBLE_YELLOW"?1.3:0,_e.green.emissiveIntensity=$==="GREEN"?1.3:0;const te=_e.glow.material;te.color.setHex(Cs[$]),te.opacity=.55}}function $e(W,Q,_e,$){const te=W.dt,he=Fv*te,xe=he*Ov+Math.abs(W.speed)*te*.25,ue=K.getAttribute("position"),Pe=ue.array;for(let U=0;U<n;U++){const re=U*3+1,se=U*3+2;let de=Pe[re]-he,ie=Pe[se]-xe;de<0&&(de+=2*Qa),ie<-eo&&(ie+=2*eo),Pe[re]=de,Pe[se]=ie}ue.needsUpdate=!0,le.position.set(Q,_e-Qa,$)}function it(W){const Q=W.env,_e=W.chainage,$=qx(e,_e,Vx,kx),te=kd(e,_e).cant,he=Ir(e,_e),xe=Yx(te,he,o);Ce=Mu(Ce,xe.pitch,_u,W.dt),rt=Mu(rt,xe.roll,_u,W.dt),u.position.set($.x,$.y,$.z),u.rotation.set(Ce+v,$.heading+Math.PI+g,rt),ae.position.set($.x,$.y,$.z),ae.rotation.set(Ce,$.heading+Math.PI,rt),c.toneMappingExposure=Q.exposure,d.background.setHex(Q.skyColor),A.topColor.value.setHex(Q.skyColor).multiplyScalar(.35),A.bottomColor.value.setHex(Q.skyColor);const ue=d.fog;ue.color.setHex(Q.skyColor),ue.near=Q.fogNear,ue.far=Q.fogFar,C.color.setHex(Q.hemiSky),C.groundColor.setHex(Q.hemiGround),C.intensity=Q.ambientIntensity,N.color.setHex(Q.sunColor),N.intensity=Q.moonIntensity,ne.opacity=Q.rainIntensity,F.railMaterial.roughness=F.railRoughnessFor(Q.railWetness),r&&(Te.set(Q.sunDir.x,Q.sunDir.y,Q.sunDir.z),z.position.set($.x,$.y,$.z),I.position.copy(z.position).addScaledVector(Te,xu),I.color.setHex(Q.sunColorPbr),I.intensity=Q.moonIntensity),(Q.skyColor!==E||Q.groundColor!==L)&&(fv(_),_=ou(Q.skyColor,Q.groundColor),d.environment=_,E=Q.skyColor,L=Q.groundColor),Xe(W),Q.rainIntensity>0&&$e(W,$.x,$.y,$.z);const Pe=W.controls;if(De.powerFrac=Pe.powerNotch/fi,De.brakeFrac=Pe.brakeStep/oi,De.reverser=Pe.reverser,De.speedMph=Math.abs(W.speed)*Uv,De.sunflower=W.aws.sunflower,De.dra=Pe.dra,De.dsd=W.safety.dsdWarning,De.penalty=Bs(W.safety),De.wiperOn=Q.wiperOn,De.dt=W.dt,Re.update(De),a&&(Ye||Ue(),Ye&&j)){j.strength=Q.bloomStrength,Ye.render();return}c.render(d,u)}function Me(){const W=i.clientWidth,Q=i.clientHeight;c.setSize(W,Q),u.aspect=W/Q,u.updateProjectionMatrix(),Ye&&Ye.setSize(W,Q)}const Ke=new Be({color:2832981,roughness:.5,metalness:.2}),P=new Be({color:1054752,emissive:2240580,emissiveIntensity:.6,roughness:.3}),qe=19,He=1.2,st=2.7,Se=3.6,R=.2;function M(){const W=new Mt;for(let Q=0;Q<4;Q++){const _e=new Mt,$=new Ie(new We(st,Se,qe),Ke);$.castShadow=!0,_e.add($);const te=new Ie(new We(st+.02,.7,qe-2),P);te.position.y=.5,_e.add(te),_e.position.set(0,R+Se/2,-9.5-Q*(qe+He)),W.add(_e)}return W.visible=!1,W}function B(){const W=M();return d.add(W),{setPose(Q){W.position.set(Q.x,Q.y,Q.z),W.rotation.set(0,Q.heading,0)},setVisible(Q){W.visible=Q}}}const J=new Be({color:2762274,roughness:.95}),ee=.06,q=.12;function Ee(W){const Q=W.route.length,_e=6,$=Math.max(1,Math.ceil(Q/_e)),te=new We(.07,q,1),he=new ft(te,F.railMaterial,$),xe=new ft(te,F.railMaterial,$),ue=new We(2.6,.12,.25),Pe=Math.max(1,Math.floor(Q/.65)),U=new ft(ue,J,Pe);U.receiveShadow=!0;const re=new je,se=new D,de=new $t,ie=new Bt(0,0,0,"YXZ"),Y=new D(1,1,1);for(let pe=0;pe<$;pe++){const Le=pe*_e,Je=Math.min(Q,(pe+1)*_e),Qe=(Le+Je)/2;ie.set(0,Nr(W,Qe).heading,0),de.setFromEuler(ie),Y.set(1,1,Je-Le);const Gt=br(W,Qe,-Xn/2);se.set(Gt.x,Gt.y+ee-q/2,Gt.z),re.compose(se,de,Y),he.setMatrixAt(pe,re);const Ht=br(W,Qe,Xn/2);se.set(Ht.x,Ht.y+ee-q/2,Ht.z),re.compose(se,de,Y),xe.setMatrixAt(pe,re)}Y.set(1,1,1);for(let pe=0;pe<Pe;pe++){const Le=(pe+.5)*.65;ie.set(0,Nr(W,Le).heading,0),de.setFromEuler(ie);const Je=br(W,Le,0);se.set(Je.x,Je.y-.28,Je.z),re.compose(se,de,Y),U.setMatrixAt(pe,re)}he.instanceMatrix.needsUpdate=!0,xe.instanceMatrix.needsUpdate=!0,U.instanceMatrix.needsUpdate=!0,d.add(he,xe,U)}return{render:it,resize:Me,addTrainMesh:B,addEdgeTrack:Ee}}function kv(i,e){const t=[],n=Xn/2+2.2,s=new ns(.22,20),r=qv(),a=new Be({color:7107194,roughness:.7,metalness:.4}),o=new Be({color:329482,roughness:.95}),l=new Be({color:1316636,emissive:new Ne(1316636),emissiveIntensity:.25,roughness:.8}),c=new jr(.22,.3,20);for(const h of e.signals){const d=new Mt,u=dt(e,h.chainage,n),p=Wn(e,h.chainage,n);d.position.set(u.x,p,u.z),d.rotation.y=u.heading+Math.PI;const g=new Ie(new Vn(.09,.12,4.2,10),a);g.position.y=2.1,d.add(g);const v=new Ie(new We(.62,1.55,.1),o);v.position.set(0,4,0),d.add(v);const m=(b,w)=>{const _=new Ie(c,l);_.position.set(0,b,.05),d.add(_);const E=new Be({color:329482,emissive:new Ne(w),emissiveIntensity:0,roughness:.5}),L=new Ie(s,E);return L.position.set(0,b,.07),d.add(L),E},f=m(4.62,Cs.RED),x=m(4.2,Cs.YELLOW),y=m(3.78,Cs.YELLOW),S=m(3.36,Cs.GREEN),A=new dp(new lh({map:r,color:16777215,transparent:!0,opacity:0,blending:so,depthWrite:!1,fog:!1}));A.scale.set(2.4,2.4,1),A.position.set(0,4,.1),d.add(A),i.add(d),t.push({red:f,amberTop:x,amberBot:y,green:S,glow:A})}return t}const Lh=45,Vv=.2,ec=Xn/2+2.6,tc=5.9,bs=7;function Dh(i){return Math.max(1,Math.floor(i.length/Lh))}function Lc(i){return(i+1)*Lh}function Dc(i){return i%2===0?1:-1}function nc(i,e){const t=Lc(e);return _i(i,t)||xi(i,t,Dc(e)*ec)}function ic(i,e,t){const n=Lc(e),s=Dc(e)*Vv,r=dt(i,n,s);return t.set(r.x,At(i,n)+tc,r.z),t}function Wv(i,e){const t=e.length,n=new je,s=new $t,r=new Bt(0,0,0,"YXZ"),a=new D(1,1,1),o=new D,l=-1e3,c=Dh(e),h=new Be({color:2764599,roughness:.7,metalness:.55}),d=new ft(new We(.26,bs*.6,.26),h,c),u=new ft(new We(.16,bs*.45,.16),h,c),p=new ft(new We(2.4,.1,.1),h,c),g=new Be({color:3817545,roughness:.6,metalness:.6}),v=new ft(new We(.05,1,.05),g,c),m=new D,f=new D,x=new D,y=new D(0,1,0);for(let F=0;F<c;F++){const O=Lc(F),H=Dc(F),K=jt(e,O);r.set(0,K,0),s.setFromEuler(r);const Z=At(e,O);if(nc(e,F)){n.compose(o.set(0,l,0),s,a),d.setMatrixAt(F,n),u.setMatrixAt(F,n),p.setMatrixAt(F,n),v.setMatrixAt(F,n);continue}const ne=dt(e,O,H*ec);n.compose(o.set(ne.x,Z+bs*.3,ne.z),s,a),d.setMatrixAt(F,n),n.compose(o.set(ne.x,Z+bs*.6+bs*.225,ne.z),s,a),u.setMatrixAt(F,n);const le=dt(e,O,H*(ec-1.2));n.compose(o.set(le.x,Z+tc+.45,le.z),s,a),p.setMatrixAt(F,n),ic(e,F,m);const ae=le.x,Re=Z+tc+.45,De=le.z;f.set(m.x-ae,m.y-Re,m.z-De);const Ye=Math.max(.05,f.length());x.set((ae+m.x)/2,(Re+m.y)/2,(De+m.z)/2),s.setFromUnitVectors(y,f.normalize()),n.compose(x,s,a.set(1,Ye,1)),v.setMatrixAt(F,n),a.set(1,1,1)}d.instanceMatrix.needsUpdate=!0,u.instanceMatrix.needsUpdate=!0,p.instanceMatrix.needsUpdate=!0,v.instanceMatrix.needsUpdate=!0,i.add(d,u,p,v);const S=6,A=Math.max(1,Math.floor(t/S)),b=Xn/2+4.5,w=new Be({color:921878,roughness:.9}),_=new ft(new We(.06,1,.06),w,A*2);let E=0;for(let F=0;F<A;F++){const O=(F+1)*S,H=jt(e,O);r.set(0,H,0),s.setFromEuler(r);for(const K of[-1,1]){const Z=K*b;if(_i(e,O)||xi(e,O,Z)){n.compose(o.set(0,l,0),s,a),_.setMatrixAt(E++,n);continue}const ne=dt(e,O,Z);n.compose(o.set(ne.x,Os(e,O,Z,.5),ne.z),s,a),_.setMatrixAt(E++,n)}}_.instanceMatrix.needsUpdate=!0,i.add(_);const L=500,C=Math.max(1,Math.floor(t/L)),N=Xn/2+2,I=new Be({color:11580602,roughness:.8}),z=new ft(new We(.1,.6,.1),I,C);for(let F=0;F<C;F++){const O=(F+1)*L,H=jt(e,O);if(r.set(0,H,0),s.setFromEuler(r),_i(e,O)||xi(e,O,N)){n.compose(o.set(0,l,0),s,a),z.setMatrixAt(F,n);continue}const K=dt(e,O,N);n.compose(o.set(K.x,Os(e,O,N,.3),K.z),s,a),z.setMatrixAt(F,n)}z.instanceMatrix.needsUpdate=!0,i.add(z)}function Xv(i,e){const t=Dh(e),n=Math.max(1,t-1),s=new Be({color:2764340,roughness:.5,metalness:.6}),r=new ft(new We(.035,1,.035),s,n),a=new je,o=new $t,l=new D(1,1,1),c=new D,h=new D,d=new D,u=new D,p=new D(0,1,0),g=-1e3;for(let v=0;v<n;v++){if(nc(e,v)||nc(e,v+1)){a.compose(c.set(0,g,0),o.identity(),l.set(1,1,1)),r.setMatrixAt(v,a);continue}ic(e,v,c),ic(e,v+1,h),d.set(h.x-c.x,h.y-c.y,h.z-c.z);const m=Math.max(.05,d.length());u.set((c.x+h.x)/2,(c.y+h.y)/2,(c.z+h.z)/2),o.setFromUnitVectors(p,d.normalize()),a.compose(u,o,l.set(1,m,1)),r.setMatrixAt(v,a)}r.instanceMatrix.needsUpdate=!0,i.add(r)}function Yv(i,e,t){const n=t.chainage,s=2*t.platformHalf,r=3,a=.9,o=Xn/2+.7,l=o+r/2,c=At(e,n),h=new Mt,d=dt(e,n,0);h.position.set(d.x,c,d.z),h.rotation.y=d.heading;const u=new Be({color:5396575,roughness:.9}),p=new Be({color:2896700,roughness:.85}),g=new Be({color:2765115,roughness:.6,metalness:.4}),v=Wn(e,n,l)-c,m=a-v,f=new Ie(new We(r,m,s),u);f.position.set(l,(a+v)/2,0),f.receiveShadow=!0,h.add(f);const x=new Ie(new We(.2,2.6,s),p);x.position.set(l+r/2-.1,a+1.3,0),h.add(x);const y=a+3,S=new Ie(new We(r,.12,s*.8),g);S.position.set(l,y,0),h.add(S);const A=new We(.12,y-a,.12);for(const E of[-s*.35,0,s*.35]){const L=new Ie(A,g);L.position.set(l-r/2+.3,a+(y-a)/2,E),h.add(L)}const b=new Ie(new We(.08,.5,3.2),new Be({color:659488,emissive:new Ne(3238080),emissiveIntensity:2,roughness:.5}));b.position.set(o+.05,a+1.7,0),h.add(b);const w=new ns(.12,16),_=new Be({color:1053720,emissive:new Ne(16769712),emissiveIntensity:2.6,roughness:.5});for(const E of[-s*.3,s*.3]){const L=new Ie(w,_);L.position.set(l,a+3.4,E),L.rotation.x=Math.PI/2,h.add(L);const C=new Rc(16769712,3,24);C.position.set(l,a+3.3,E),h.add(C)}i.add(h)}function qv(){const e=document.createElement("canvas");e.width=e.height=64;const t=e.getContext("2d");if(t){const s=t.createRadialGradient(32,32,0,32,32,32);s.addColorStop(0,"rgba(255,255,255,1)"),s.addColorStop(.4,"rgba(255,255,255,0.5)"),s.addColorStop(1,"rgba(255,255,255,0)"),t.fillStyle=s,t.fillRect(0,0,64,64)}const n=new Kr(e);return n.needsUpdate=!0,n}function $v(i){const e=document.createElement("div");e.style.cssText="position:fixed;left:14px;top:12px;font:14px/1.6 ui-monospace,monospace;color:#cfe0f5;text-shadow:0 1px 2px #000;pointer-events:none;display:grid;grid-template-columns:auto auto;gap:1px 12px";function t(b){const w=document.createElement("span");w.textContent=b,w.style.opacity="0.65";const _=document.createElement("span");return e.append(w,_),_}function n(b){const w=document.createElement("span");return w.textContent=b,w.style.cssText="padding:2px 8px;border-radius:3px;border:1px solid #2a3650;color:#5a6a82",w}const s=t("SPEED"),r=t("LIMIT"),a=t("REVERSER"),o=t("POWER"),l=t("BRAKE"),c=t("BRK D/A"),h=t("NEXT"),d=t("CHAINAGE"),u=t("ASPECT"),p=document.createElement("div");p.style.cssText="grid-column:1 / 3;margin-top:6px;display:flex;gap:10px";const g=n("DRA"),v=n("DSD"),m=n("PENALTY"),f=n("AWS");p.append(g,v,m,f),e.append(p);const x={RED:"#e04030",YELLOW:"#e0b020",DOUBLE_YELLOW:"#e0b020",GREEN:"#30c050"};i.appendChild(e);const y=document.createElement("div");y.id="mdtrain2-safety-prompt",y.style.cssText="position:fixed;left:50%;top:34%;transform:translate(-50%,-50%);font:700 30px/1.2 ui-monospace,monospace;letter-spacing:0.04em;padding:14px 26px;border-radius:8px;text-align:center;white-space:nowrap;text-shadow:0 2px 4px #000;pointer-events:none;display:none",i.appendChild(y);function S(b,w,_){w?(b.style.background=_,b.style.color="#0a0e16",b.style.borderColor=_):(b.style.background="transparent",b.style.color="#5a6a82",b.style.borderColor="#2a3650")}function A(b){s.textContent=`${b.speedMph.toFixed(0)} mph`,r.textContent=`${b.limitMph.toFixed(0)} mph`,a.textContent=b.reverser,o.textContent=`${b.powerNotch} of ${b.powerMax}`,l.textContent=b.brakeLabel,c.textContent=`${b.brakeDemandPct.toFixed(0)}% / ${b.brakeActualPct.toFixed(0)}%`,h.textContent=b.nextStop,d.textContent=`${b.chainage.toFixed(0)} m`,u.textContent=b.aspect,u.style.color=x[b.aspect],S(g,b.dra,"#e0b020"),S(v,b.dsdWarning,"#e0b020"),S(m,b.penalty,"#e04030"),S(f,b.sunflower==="CAUTION","#e0b020");const w=md(b);w===null?y.style.display="none":(y.textContent=w,y.style.display="block",y.style.background=b.penalty?"rgba(160,16,16,0.92)":"rgba(150,110,0,0.92)",y.style.color=b.penalty?"#ffe6e0":"#fff4d0",y.style.border=b.penalty?"2px solid #ff6048":"2px solid #ffc838")}return{update:A}}const Su="mdtrain2-help-style",rn="mdtrain2-help",Kv=[{keys:"W / S",what:"Power up / down"},{keys:"D / A",what:"Brake on / off"},{keys:"F / N / R",what:"Reverser fwd / neutral / rev"},{keys:"Q",what:"Acknowledge AWS / reset penalty (at a stand)"},{keys:"L",what:"DRA (driver's reminder)"},{keys:"`",what:"Emergency brake"},{keys:"E",what:"Change weather / time of day"},{keys:"H",what:"Show / hide this panel"}],Zv=`
#${rn} {
  position: fixed;
  top: 12px;
  right: 14px;
  z-index: 20;
  max-width: 280px;
  padding: 10px 12px;
  font: 12px/1.5 ui-monospace, monospace;
  color: #cfe0f5;
  background: rgba(8, 12, 20, 0.7);
  border: 1px solid rgba(120, 150, 200, 0.4);
  border-radius: 8px;
  text-shadow: 0 1px 2px #000;
  pointer-events: auto;
  user-select: none;
}
#${rn}[hidden] { display: none; }
#${rn} h2 {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.7;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
#${rn} .x {
  cursor: pointer;
  opacity: 0.6;
  padding: 0 4px;
  font-size: 14px;
}
#${rn} .x:hover { opacity: 1; }
#${rn} table { border-collapse: collapse; }
#${rn} td { padding: 1px 0; vertical-align: top; }
#${rn} td.k {
  padding-right: 12px;
  color: #9fd0ff;
  white-space: nowrap;
}
#${rn} .hint { margin-top: 7px; opacity: 0.5; font-size: 11px; }
@media (pointer: coarse) { #${rn} { display: none; } }
`;function jv(){if(document.getElementById(Su))return;const i=document.createElement("style");i.id=Su,i.textContent=Zv,document.head.appendChild(i)}function Jv(i){jv();const e=document.createElement("div");e.id=rn;const t=document.createElement("h2");t.textContent="Controls";const n=document.createElement("span");n.className="x",n.textContent="×",n.setAttribute("role","button"),n.setAttribute("aria-label","Hide controls (H)"),t.appendChild(n),e.appendChild(t);const s=document.createElement("table");for(const o of Kv){const l=document.createElement("tr"),c=document.createElement("td");c.className="k",c.textContent=o.keys;const h=document.createElement("td");h.textContent=o.what,l.append(c,h),s.appendChild(l)}e.appendChild(s);const r=document.createElement("div");r.className="hint",r.textContent="press H to hide",e.appendChild(r),i.appendChild(e);function a(){e.hidden=!e.hidden}return n.addEventListener("click",a),window.addEventListener("keydown",o=>{o.code==="KeyH"&&!o.repeat&&a()}),{toggle:a}}const Qv=.06,eM=.35;function tM(i){const e=Math.floor(i.sampleRate),t=i.createBuffer(1,e,i.sampleRate),n=t.getChannelData(0);for(let s=0;s<e;s++)n[s]=Math.random()*2-1;return t}function nM(){const i=typeof window<"u"?window.AudioContext??window.webkitAudioContext:void 0;if(!i)return{start:()=>{},update:()=>{}};let e;try{e=new i}catch{return{start:()=>{},update:()=>{}}}const t=e.createGain();t.gain.value=eM,t.connect(e.destination);const n=e.createGain();n.gain.value=0,n.connect(t);const s=e.createBiquadFilter();s.type="lowpass",s.frequency.value=300,s.Q.value=5,s.connect(n);const r=e.createOscillator();r.type="sawtooth",r.frequency.value=60;const a=e.createOscillator();a.type="triangle",a.frequency.value=60,a.detune.value=6,r.connect(s),a.connect(s);const o=e.createOscillator();o.type="sine",o.frequency.value=60;const l=e.createGain();l.gain.value=.5,o.connect(l).connect(n);const c=tM(e),h=e.createBufferSource();h.buffer=c,h.loop=!0;const d=e.createBiquadFilter();d.type="lowpass",d.frequency.value=420;const u=e.createGain();u.gain.value=0,h.connect(d).connect(u).connect(t);const p=e.createBufferSource();p.buffer=c,p.loop=!0;const g=e.createBiquadFilter();g.type="highpass",g.frequency.value=2200;const v=e.createGain();v.gain.value=0,p.connect(g).connect(v).connect(t);let m=!1;function f(){if(!m){m=!0;try{r.start(),a.start(),o.start(),h.start(),p.start()}catch{}e.resume()}}function x(S,A){const b=Number.isFinite(A)?A:0;S.setTargetAtTime(b,e.currentTime,Qv)}function y(S){x(r.frequency,S.whineHz),x(a.frequency,S.whineHz),x(o.frequency,S.whineHz);const A=Math.min(4e3,Math.max(220,S.whineHz*3.5));x(s.frequency,A),x(n.gain,.22*S.tractionGain),x(d.frequency,300+600*S.rollGain),x(u.gain,.6*S.rollGain),x(v.gain,.4*S.brakeHissGain)}return{start:f,update:y}}const iM=44.7,yr=i=>i<0?0:i>1?1:i,Vi=(i,e=0)=>Number.isFinite(i)?i:e;function sM(i,e,t){const s=Math.abs(Vi(i))/iM,r=Vi(50+320*s+120*Math.sqrt(Math.max(s,0)),50),a=yr(Vi(e)),o=yr(Vi(Math.min(s,1))),l=yr(Vi(yr(Vi(t))*(.5+.5*Math.min(s,1))));return{whineHz:r,tractionGain:a,rollGain:o,brakeHissGain:l}}const Vr={powerUp:!1,powerDown:!1,brakeUp:!1,brakeDown:!1,emergency:!1,reverserFwd:!1,reverserOff:!1,reverserRev:!1,toggleDra:!1,acknowledge:!1,cycleEnvironment:!1,anyActivity:!1};function rM(...i){const e={...Vr};for(const t of i)e.powerUp=e.powerUp||t.powerUp,e.powerDown=e.powerDown||t.powerDown,e.brakeUp=e.brakeUp||t.brakeUp,e.brakeDown=e.brakeDown||t.brakeDown,e.emergency=e.emergency||t.emergency,e.reverserFwd=e.reverserFwd||t.reverserFwd,e.reverserOff=e.reverserOff||t.reverserOff,e.reverserRev=e.reverserRev||t.reverserRev,e.toggleDra=e.toggleDra||t.toggleDra,e.acknowledge=e.acknowledge||t.acknowledge,e.cycleEnvironment=e.cycleEnvironment||t.cycleEnvironment,e.anyActivity=e.anyActivity||t.anyActivity;return e}function aM(i){return{powerUp:i.powerUp,powerDown:i.powerDown,brakeUp:i.brakeUp,brakeDown:i.brakeDown,emergency:i.emergency,reverserFwd:i.reverserFwd,reverserOff:i.reverserOff,reverserRev:i.reverserRev,toggleDra:i.toggleDra,acknowledge:i.acknowledge,vigilancePing:i.anyActivity}}function oM(i){const e=t=>i.has(t);return{powerUp:e("KeyW"),powerDown:e("KeyS"),brakeUp:e("KeyD"),brakeDown:e("KeyA"),emergency:e("Backquote"),reverserFwd:e("KeyF"),reverserOff:e("KeyN"),reverserRev:e("KeyR"),toggleDra:e("KeyL"),acknowledge:e("KeyQ"),cycleEnvironment:e("KeyE"),anyActivity:i.size>0}}function cM(i,e){const t=r=>i[r]??!1,n=e<=-.5,s=e>=.5;return{powerUp:t(7),powerDown:t(6),brakeUp:t(5),brakeDown:t(4),emergency:t(1),reverserFwd:t(12),reverserOff:t(15)||s,reverserRev:t(13)||t(14)||n,toggleDra:t(2),acknowledge:t(0),cycleEnvironment:t(3),anyActivity:i.some(r=>r)||Math.abs(e)>.25}}function lM(){const i=new Set;return window.addEventListener("keydown",e=>{e.repeat||i.add(e.code)}),window.addEventListener("keyup",e=>i.delete(e.code)),window.addEventListener("blur",()=>i.clear()),{edges:()=>i,clear:()=>i.clear()}}function uM(){const i=[],e=[];function t(){if(typeof navigator>"u"||typeof navigator.getGamepads!="function")return Vr;const n=navigator.getGamepads()[0];if(!n)return Vr;const s=n.buttons;e.length=s.length;for(let a=0;a<s.length;a++){const o=s[a],l=o?o.pressed:!1,c=i[a]??!1;e[a]=l&&!c,i[a]=l}const r=n.axes[0]??0;return cM(e,r)}return{actions:t}}const Eu="mdtrain2-touch-style",Xi="mdtrain2-touch",yu=[{action:"powerUp",label:"Power up",text:"PWR +"},{action:"powerDown",label:"Power down",text:"PWR −"},{action:"brakeUp",label:"Brake up",text:"BRK +"},{action:"brakeDown",label:"Brake down",text:"BRK −"},{action:"reverserFwd",label:"Reverser forward",text:"REV F"},{action:"reverserOff",label:"Reverser neutral",text:"REV N"},{action:"reverserRev",label:"Reverser reverse",text:"REV R"},{action:"toggleDra",label:"Driver's reminder appliance",text:"DRA"},{action:"acknowledge",label:"Acknowledge",text:"ACK"},{action:"emergency",label:"Emergency brake",text:"EMERGENCY"},{action:"cycleEnvironment",label:"Cycle environment",text:"ENV"}],hM=`
#${Xi} {
  display: none;
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  padding: 8px;
  box-sizing: border-box;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  pointer-events: none;
}
#${Xi} button {
  pointer-events: auto;
  min-height: 56px;
  padding: 8px 6px;
  font: 600 13px/1.1 system-ui, sans-serif;
  letter-spacing: 0.02em;
  color: #cfe0ff;
  background: rgba(12, 18, 30, 0.82);
  border: 1px solid rgba(120, 150, 200, 0.5);
  border-radius: 8px;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
}
#${Xi} button:active {
  background: rgba(40, 70, 120, 0.92);
}
#${Xi} button[data-action="emergency"] {
  grid-column: span 2;
  color: #ffd2cf;
  border-color: rgba(220, 90, 80, 0.7);
}
@media (pointer: coarse), (max-width: 760px) {
  #${Xi} { display: grid; }
}
`;function dM(){if(document.getElementById(Eu))return;const i=document.createElement("style");i.id=Eu,i.textContent=hM,document.head.appendChild(i)}function fM(i){dM();const e={powerUp:!1,powerDown:!1,brakeUp:!1,brakeDown:!1,emergency:!1,reverserFwd:!1,reverserOff:!1,reverserRev:!1,toggleDra:!1,acknowledge:!1,cycleEnvironment:!1},t=document.createElement("div");t.id=Xi;for(const s of yu){const r=document.createElement("button");r.type="button",r.textContent=s.text,r.setAttribute("aria-label",s.label),r.dataset.action=s.action,r.addEventListener("pointerdown",a=>{a.preventDefault(),e[s.action]=!0}),t.appendChild(r)}i.appendChild(t);function n(){let s=!1;const r={...Vr};for(const a of yu)e[a.action]&&(r[a.action]=!0,s=!0,e[a.action]=!1);return r.anyActivity=s,r}return{actions:n}}function pM(i){return i?{rainScale:0,wiperEnabled:!1}:{rainScale:1,wiperEnabled:!0}}const mM=2400,gM=900;function bu(i,e,t){return Number.isFinite(i)?Math.min(t,Math.max(e,i)):e}function _M(i){const e=i.coarsePointer?bu(i.maxDevicePixelRatio,1,1.5):bu(i.maxDevicePixelRatio,1,2),t=i.coarsePointer?{pixelRatioCap:e,rainCount:gM,shadowsEnabled:!1,bloomEnabled:!1,ribbonHalfWidth:90,terrainSegLen:20,terrainSubdiv:10,attitudeScale:0}:{pixelRatioCap:e,rainCount:mM,shadowsEnabled:!0,bloomEnabled:!0,ribbonHalfWidth:120,terrainSegLen:8,terrainSubdiv:24,attitudeScale:.35};return i.reducedMotion&&(t.rainCount=0,t.attitudeScale=0),t}const Ic=document.getElementById("app");if(!Ic)throw new Error("#app not found");const hi=cf,vi=hi.graph,Wr=As,Tu=Kd(vi,Object.values(hi.paths),hi.stationNames,hi.maxSpeed,120);if(Tu.length)throw new Error(`Track graph invalid:
${Tu.map(i=>`  ${i.kind}: ${i.detail}`).join(`
`)}`);const qi=hi.paths.player,Uc={};{let i=0;for(const e of qi)Uc[e]=i,i+=vi.edges[e].route.length}const Au=i=>(Uc[i.edgeId]??0)+i.s,xM=i=>{for(const e of qi){const t=vi.edges[e].route.length,n=Uc[e];if(i<n+t||e===qi[qi.length-1])return{edgeId:e,s:Math.max(0,Math.min(t,i-n)),d:0}}return{edgeId:qi[0],s:0,d:0}},Ih=window.matchMedia("(prefers-reduced-motion: reduce)").matches,vM=window.matchMedia("(pointer: coarse)").matches,MM=_M({coarsePointer:vM,maxDevicePixelRatio:window.devicePixelRatio,reducedMotion:Ih}),aa=Hv(Ic,Wr,MM),SM=$v(document.body);Jv(document.body);const Uh=nM(),wu=lM(),EM=uM(),yM=fM(Ic);let di=hi.makeRecords();const to=Number(new URLSearchParams(location.search).get("s")??"");if(Number.isFinite(to)&&to>0){const i=xM(Math.max(0,Math.min(Wr.length,to)));di=di.map(e=>e.id==="player"?{...e,pos:i,state:{...e.state,chainage:i.s}}:e)}for(const i of Object.keys(vi.edges))qi.includes(i)||aa.addEdgeTrack(vi.edges[i]);const Nh=new Map;for(const i of di)i.kind==="ai"&&Nh.set(i.id,aa.addTrainMesh());let Bn=ad(),ii=od(),Ts=xd(),no=io;window.addEventListener("resize",()=>aa.resize());function Xr(){Uh.start(),window.removeEventListener("keydown",Xr),window.removeEventListener("pointerdown",Xr)}window.addEventListener("keydown",Xr);window.addEventListener("pointerdown",Xr);const Ru=()=>di.find(i=>i.id==="player");let Cu=performance.now();function Fh(i){requestAnimationFrame(Fh);const e=Math.min((i-Cu)/1e3,.05);Cu=i;const t=rM(oM(wu.edges()),EM.actions(),yM.actions()),n=aM(t);t.cycleEnvironment&&(no=Nd(no));const s=pM(Ih),r=Id(no),a={...r,rainIntensity:r.rainIntensity*s.rainScale,wiperOn:r.wiperOn&&s.wiperEnabled},o=Ru(),l=Au(o.pos),c={speed:o.state.speed,brakeActual:o.state.brakeActual,time:o.state.time};Bn=ld(Bn,n,c,ii);const h=ud(Bn,ii,a.mu);di=rf(vi,di,hi.blockEdgeIds,e,a.mu,h);const d=Ru(),u=Au(d.pos),p={chainage:u,speed:d.state.speed,brakeActual:d.state.brakeActual,time:d.state.time},g=Bn.lastDir,v=vd(Ts,p,Wr,n,l,g,e);Ts=v.next,ii=hd(ii,n,p,e,{reasons:v.reasons});const m={chainage:u,speed:p.speed,dt:e,controls:Bn,safety:ii,aws:Ts,served:Ts.served,env:a};aa.render(m),SM.update(pd(p,Bn,ii,Wr,Ts.served,v.hud));for(const x of di){if(x.kind!=="ai")continue;const y=Nh.get(x.id);if(!y)continue;const S=vi.edges[x.pos.edgeId];y.setPose(br(S,x.pos.s,x.pos.d)),y.setVisible(!0)}const f=cc(Bn,ii);Uh.update(sM(p.speed,Bn.powerNotch/fi,f)),wu.clear()}requestAnimationFrame(Fh);export{so as A,vt as B,Ne as C,at as F,Rn as H,Vu as L,dh as M,Tn as N,Cc as O,bp as R,on as S,bM as T,Sp as U,Fe as V,mn as W,D as a,tt as b,ot as c,Wu as d,Xu as e,uc as f,qu as g,$u as h,Yu as i,Ie as j};
