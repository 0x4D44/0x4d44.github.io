const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./EffectComposer-DiUg2mJ1.js","./CopyShader-BzTUYzf6.js","./Pass-NjKqqxRF.js","./RenderPass-xaaAB_-s.js","./UnrealBloomPass-voCI8dTH.js","./OutputPass-CxOt2ZR8.js"])))=>i.map(i=>d[i]);
(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const a of r.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&n(a)}).observe(document,{childList:!0,subtree:!0});function e(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(s){if(s.ep)return;s.ep=!0;const r=e(s);fetch(s.href,r)}})();const zo=9.80665;function au(i){return i.mass*i.inertiaFactor}function mh(i,t,e){const n=Math.max(Math.abs(t),.001),s=i.powerMax/n,r=Math.min(i.tractiveEffortMax,s),a=e*i.adhesiveFraction*i.mass*zo;return Math.max(0,Math.min(r,a))}function gh(i,t){const e=Math.abs(t);return Math.max(0,i.davisA+i.davisB*e+i.davisC*e*e)}function _h(i,t,e,n=!1){const s=n?i.brakeEmergencyDecel:i.brakeServiceDecel,r=Er(t)*s*au(i),a=e*i.mass*zo;return Math.max(0,Math.min(r,a))}function xh(i,t){const e=au(i),n=t.notch*mh(i,t.v,t.mu)*t.dir,s=-16e4*zo*t.grade,r=_h(i,t.brakeActual,t.mu,t.emergency),a=gh(i,t.v);if(Math.abs(t.v)>.001){const c=Math.sign(t.v)*(a+r);return(n+s-c)/e}const l=n+s;return Math.abs(l)<=r?0:(l-Math.sign(l)*r)/e}function vh(i,t,e,n){if(e<=0)return t;const s=1-Math.exp(-n/e);return i+(t-i)*s}function Er(i){return i<0?0:i>1?1:i}function Bi(i,t,e){return i<t?t:i>e?e:i}const Mh=180,Sh=50,Be=.44704,Eh={length:14e3,stations:[{name:"Kingsgate",chainage:0,platformHalf:120},{name:"Ashcombe",chainage:2e3,platformHalf:90},{name:"Wealdham",chainage:5800,platformHalf:90},{name:"Brinemouth",chainage:9800,platformHalf:90},{name:"Seahaven",chainage:14e3,platformHalf:110}],grades:[{from:0,to:1800,value:0},{from:1800,to:3e3,value:.01},{from:3e3,to:4200,value:0},{from:4200,to:7500,value:-.004},{from:7500,to:8600,value:0},{from:8600,to:11e3,value:-.012},{from:11e3,to:12400,value:0},{from:12400,to:14e3,value:-.006}],speedLimits:[{from:0,to:700,value:25*Be},{from:700,to:1300,value:40*Be},{from:1300,to:1800,value:55*Be},{from:1800,to:2200,value:25*Be},{from:2200,to:2600,value:45*Be},{from:2600,to:4e3,value:50*Be},{from:4e3,to:5500,value:60*Be},{from:5500,to:5900,value:30*Be},{from:5900,to:9200,value:60*Be},{from:9200,to:9700,value:55*Be},{from:9700,to:9900,value:30*Be},{from:9900,to:11e3,value:45*Be},{from:11e3,to:13600,value:55*Be},{from:13600,to:14e3,value:20*Be}],curvatures:[{from:0,to:700,value:0},{from:700,to:1300,value:1/300},{from:1300,to:2600,value:0},{from:2600,to:3300,value:1/500},{from:3300,to:4e3,value:-1/500},{from:4e3,to:4800,value:0},{from:4800,to:5500,value:1/700},{from:5500,to:9200,value:0},{from:9200,to:9700,value:1/600},{from:9700,to:10300,value:0},{from:10300,to:10650,value:-1/350},{from:10650,to:11e3,value:1/350},{from:11e3,to:14e3,value:0}],signals:[{chainage:2120,protects:"Ashcombe"},{chainage:5920,protects:"Wealdham"},{chainage:9920,protects:"Brinemouth"}],viaducts:[{center:8050,halfLen:320,valleyDepth:45}],tunnels:[{center:11700,halfLen:380,hillHeight:60}],terrainSeed:1};function Go(i,t,e){for(const r of i)if(t>=r.from&&t<r.to)return r.value;const n=i[0],s=i[i.length-1];return n&&t<n.from?n.value:s&&t>=s.to?s.value:e}function yr(i,t){return Go(i.grades,t,0)}function ou(i,t){return Go(i.speedLimits,t,i.speedLimits[0]?.value??0)}function Oa(i,t){return Go(i.curvatures,t,0)}function zi(i,t,e){const n=i.signals[t];if(!n)return"GREEN";if(!e.has(n.protects))return"RED";if(!i.signals[t+1])return"GREEN";const r=zi(i,t+1,e);return r==="RED"?"YELLOW":r==="YELLOW"?"DOUBLE_YELLOW":"GREEN"}function yh(i,t,e){if(e===-1)return null;for(let n=0;n<i.signals.length;n++){const s=i.signals[n];if(s&&s.chainage>t)return{i:n,sig:s}}return null}function qr(i,t,e){if(e<=t)return[];const n=[];for(let s=0;s<i.length;s++){const r=i[s];r!==void 0&&r>t&&r<=e&&n.push(s)}return n}const bh={mass:16e4,inertiaFactor:1.08,powerMax:1e6,tractiveEffortMax:12e4,davisA:3e3,davisB:120,davisC:7,adhesiveFraction:.5,brakeServiceDecel:.9,brakeEmergencyDecel:1.3},Tc={buildTau:1.5,releaseTau:2};function Th(i=0){return{chainage:i,speed:0,brakeActual:1,time:0}}const Ah=.05,wh=1/240;function Rh(i,t,e,n,s){let{chainage:r,speed:a,brakeActual:o,time:l}=e,c=Math.min(Math.max(s,0),Ah);const h=Er(n.notch),f=Er(n.brake);for(;c>1e-9;){const u=Math.min(wh,c);c-=u;const m=f>o?Tc.buildTau:Tc.releaseTau;o=vh(o,f,m,u);const g=yr(t,r),v=xh(i,{v:a,notch:h,brakeActual:o,dir:n.dir,grade:g,mu:n.mu,emergency:n.emergency}),p=a;a+=v*u,p!==0&&Math.sign(a)!==Math.sign(p)&&h===0&&(a=0),r+=a*u,r<=0&&a<0?(r=0,a=0):r>=t.length&&a>0&&(r=t.length,a=0),l+=u}return{chainage:r,speed:a,brakeActual:o,time:l}}function Ch(i,t){return Bi(ou(i,t.chainage),0,1/0)}const oi=4,Ho=3,cu=Ho,si=Ho+1,lu=.3,uu=60,Ph=7,Ac=2.236936;function Dh(i){return Bi(i,0,oi)/oi}function Lh(i){return Er(i/Ho)}function Ih(i){return i>=si}function Uh(i){return i>0}function Ps(i){return i.penaltyReasons.size>0}function hu(i){return Math.abs(i.speed)<=lu}function Vo(i,t){return Math.max(Lh(i.brakeStep),Ps(t)?1:0)}function Nh(){return{powerNotch:0,brakeStep:cu,reverser:"OFF",lastDir:1,dra:!1}}function Fh(){return{vigilanceTimer:uu,dsdWarning:!1,penaltyReasons:new Set}}function Oh(i){const e=(i.reverserFwd?1:0)+(i.reverserOff?1:0)+(i.reverserRev?1:0)===1?i.reverserFwd?"FWD":i.reverserOff?"OFF":"REV":null,n=i.emergency,s=n?!1:i.brakeUp&&!i.brakeDown,r=n?!1:i.brakeDown&&!i.brakeUp,a=i.powerUp&&!i.powerDown,o=i.powerDown&&!i.powerUp;return{powerUp:a,powerDown:o,brakeUp:s,brakeDown:r,emergency:n,reverser:e}}function Bh(i,t,e,n){const s=Oh(t),r=hu(e);let{powerNotch:a,brakeStep:o,reverser:l,lastDir:c,dra:h}=i;return s.reverser!==null&&a===0&&r&&(l=s.reverser,s.reverser==="FWD"?c=1:s.reverser==="REV"&&(c=-1)),s.powerUp&&(a=Bi(a+1,0,oi)),s.powerDown&&(a=Bi(a-1,0,oi)),Ps(n)&&(a=0),s.emergency?o=si:s.brakeUp?o=Bi(o+1,0,si):s.brakeDown&&(o===si&&!r||(o=Bi(o-1,0,si))),t.toggleDra&&r&&(h=!h),{powerNotch:a,brakeStep:o,reverser:l,lastDir:c,dra:h}}function zh(i,t,e){const n=i.lastDir,s=Ps(t),a=Uh(i.brakeStep)||i.reverser==="OFF"||i.dra||s?0:Dh(i.powerNotch),o=Ih(i.brakeStep),l=Vo(i,t);return{notch:a,brake:l,dir:n,emergency:o,mu:e}}function Gh(i,t,e,n,s){let r=i.vigilanceTimer,a=i.dsdWarning;const o=new Set;i.penaltyReasons.has("DSD")&&o.add("DSD");const l=hu(e);t.vigilancePing?(r=uu,a=!1):l||(r-=n,a=r<=Ph,r<=0&&o.add("DSD"));for(const c of s.reasons)o.add(c);return t.acknowledge&&l&&o.delete("DSD"),{vigilanceTimer:r,dsdWarning:a,penaltyReasons:o}}const Hh=0;function Vh(i){return i<=Hh?"RELEASE":i>=si?"EMERGENCY":i>=cu?"FULL SERVICE":`STEP ${i}`}function kh(i,t,e,n,s,r){const a=Ps(e);let o="— (end of line)",l=1/0;for(const f of n.stations){const u=(f.chainage-i.chainage)*t.lastDir;u>0&&u<l&&(l=u,o=f.name)}const c=yh(n,i.chainage,t.lastDir),h=c?zi(n,c.i,s):"GREEN";return{speedMph:Math.abs(i.speed)*Ac,limitMph:Ch(n,i)*Ac,reverser:t.reverser,powerNotch:t.powerNotch,powerMax:oi,brakeLabel:Vh(t.brakeStep),brakeDemandPct:Vo(t,e)*100,brakeActualPct:i.brakeActual*100,dra:t.dra,dsdWarning:e.dsdWarning,penalty:a,nextStop:o,chainage:i.chainage,aspect:h,sunflower:r.sunflower}}function Wh(i){return i.penalty?"PENALTY — STOP, THEN PRESS Q":i.dsdWarning?"VIGILANCE — PRESS Q":null}const wc=2,Xh=3,Yh=13.4;function qh(){return{phase:"CLEAR",warnTimer:0,sunflower:"BLACK",brakeReason:null,served:new Set,spad:!1}}function Kh(i,t,e,n,s,r,a){let{phase:o,warnTimer:l,sunflower:c,brakeReason:h,served:f,spad:u}=i;const m=Math.abs(t.speed)<=lu,g=t.chainage+r*wc,v=s+r*wc,p=g>v;if(m){for(const w of e.stations)if(!f.has(w.name)&&Math.abs(g-w.chainage)<=w.platformHalf){const _=new Set(f);_.add(w.name),f=_,c="BLACK",o==="WARNING"&&(o="CLEAR",l=0)}}const d=e.signals.map(w=>w.chainage),x=e.signals.map(w=>w.chainage-Mh),y=e.signals.map(w=>w.chainage-Sh);if(p)for(const w of qr(x,v,g))zi(e,w,f)==="GREEN"?(c="BLACK",o==="WARNING"&&(o="CLEAR")):h===null&&(o="WARNING",l=Xh,c="CAUTION");if(o==="WARNING"&&h===null&&(n.acknowledge?o="CLEAR":(l-=a,l<=0&&(h="AWS",o="CLEAR"))),p){for(const w of qr(d,v,g))zi(e,w,f)==="RED"&&(h="TPWS",u=!0);if(Math.abs(t.speed)>Yh)for(const w of qr(y,v,g))zi(e,w,f)==="RED"&&(h="TPWS")}return h!==null&&n.acknowledge&&m&&(h=null),{next:{phase:o,warnTimer:l,sunflower:c,brakeReason:h,served:f,spad:u},reasons:h?[h]:[],hud:{sunflower:c,spad:u}}}const Ba={time:"day",weather:"rain"},Us=[{time:"day",weather:"rain"},{time:"dusk",weather:"rain"},{time:"night",weather:"rain"},{time:"day",weather:"clear"}],$h=.15,Zh={clear:.3,rain:.25,storm:.2},jh={day:1,dusk:.9,night:.8},Jh={clear:0,rain:.6,storm:1},Qh={clear:.1,rain:.8,storm:1},tf={day:{hemiSky:14674421,hemiGround:9409648,sun:16774886,ambI:1.8,sunI:2.1,ground:6187588},dusk:{hemiSky:15904889,hemiGround:4863810,sun:16751186,ambI:1,sunI:1.35,ground:4208942},night:{hemiSky:1713718,hemiGround:197642,sun:9085128,ambI:.45,sunI:.6,ground:922639}},ef=(i,t,e)=>i<t?t:i>e?e:i,nf={day:1,dusk:.85,night:.65},sf={day:{x:-.3,y:.92,z:.25},dusk:{x:-.8,y:.25,z:.1},night:{x:.2,y:.55,z:-.4}},rf={day:16774368,dusk:16749634,night:8229572},af={day:.2,dusk:.5,night:1},of={clear:.6,storm:.85,rain:1};function cf(i){const t=Math.sqrt(i.x*i.x+i.y*i.y+i.z*i.z);return{x:i.x/t,y:i.y/t,z:i.z/t}}function lf(i){const t=ef(Zh[i.weather]*jh[i.time],$h,1),e=Jh[i.weather],n=Qh[i.weather],s=i.weather!=="clear",r=e,a=tf[i.time],o=1-.3*r,l=a.ambI*o,c=a.sunI*o,h=uf(i.time,r),f=i.time==="day"?1:i.time==="dusk"?.6:0,u=14+12*f,m=90+230*f-50*r,g=nf[i.time],v=cf(sf[i.time]),p=rf[i.time],d=af[i.time]*of[i.weather];return{mu:t,skyColor:h,fogNear:u,fogFar:m,ambientIntensity:l,moonIntensity:c,hemiSky:a.hemiSky,hemiGround:a.hemiGround,sunColor:a.sun,groundColor:a.ground,rainIntensity:e,railWetness:n,wiperOn:s,exposure:g,sunDir:v,sunColorPbr:p,bloomStrength:d}}function uf(i,t){const n={night:{r:10,g:18,b:40},dusk:{r:58,g:48,b:64},day:{r:154,g:168,b:192}}[i],s=32,r=.4*t,a=Math.round(n.r*(1-r)+s*r),o=Math.round(n.g*(1-r)+s*r),l=Math.round(n.b*(1-r)+s*r);return a<<16|o<<8|l}function hf(i){const t=Us.findIndex(n=>n.time===i.time&&n.weather===i.weather);return t<0?Us[0]??Ba:Us[(t+1)%Us.length]??Ba}const ff="modulepreload",df=function(i,t){return new URL(i,t).href},Rc={},Ns=function(t,e,n){let s=Promise.resolve();if(e&&e.length>0){let c=function(h){return Promise.all(h.map(f=>Promise.resolve(f).then(u=>({status:"fulfilled",value:u}),u=>({status:"rejected",reason:u}))))};const a=document.getElementsByTagName("link"),o=document.querySelector("meta[property=csp-nonce]"),l=o?.nonce||o?.getAttribute("nonce");s=c(e.map(h=>{if(h=df(h,n),h in Rc)return;Rc[h]=!0;const f=h.endsWith(".css"),u=f?'[rel="stylesheet"]':"";if(n)for(let g=a.length-1;g>=0;g--){const v=a[g];if(v.href===h&&(!f||v.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${h}"]${u}`))return;const m=document.createElement("link");if(m.rel=f?"stylesheet":ff,f||(m.as="script"),m.crossOrigin="",m.href=h,l&&m.setAttribute("nonce",l),document.head.appendChild(m),f)return new Promise((g,v)=>{m.addEventListener("load",g),m.addEventListener("error",()=>v(new Error(`Unable to preload CSS for ${h}`)))})}))}function r(a){const o=new Event("vite:preloadError",{cancelable:!0});if(o.payload=a,window.dispatchEvent(o),!o.defaultPrevented)throw a}return s.then(a=>{for(const o of a||[])o.status==="rejected"&&r(o.reason);return t().catch(r)})};const ko="183",pf=0,Cc=1,mf=2,mr=1,fu=2,xs=3,kn=0,Ie=1,En=2,Tn=0,Gi=1,za=2,Pc=3,Dc=4,gf=5,ni=100,_f=101,xf=102,vf=103,Mf=104,Sf=200,Ef=201,yf=202,bf=203,Ga=204,Ha=205,Tf=206,Af=207,wf=208,Rf=209,Cf=210,Pf=211,Df=212,Lf=213,If=214,Va=0,ka=1,Wa=2,ki=3,Xa=4,Ya=5,qa=6,Ka=7,du=0,Uf=1,Nf=2,fn=0,pu=1,mu=2,gu=3,Wo=4,_u=5,xu=6,vu=7,Mu=300,ci=301,Wi=302,gr=303,Kr=304,Ir=306,li=1e3,bn=1001,$a=1002,Re=1003,Ff=1004,Fs=1005,be=1006,$r=1007,ri=1008,We=1009,Su=1010,Eu=1011,bs=1012,Xo=1013,pn=1014,nn=1015,Rn=1016,Yo=1017,qo=1018,Ts=1020,yu=35902,bu=35899,Tu=1021,Au=1022,qe=1023,Cn=1026,ai=1027,Ko=1028,$o=1029,Xi=1030,Zo=1031,jo=1033,_r=33776,xr=33777,vr=33778,Mr=33779,Za=35840,ja=35841,Ja=35842,Qa=35843,to=36196,eo=37492,no=37496,io=37488,so=37489,ro=37490,ao=37491,oo=37808,co=37809,lo=37810,uo=37811,ho=37812,fo=37813,po=37814,mo=37815,go=37816,_o=37817,xo=37818,vo=37819,Mo=37820,So=37821,Eo=36492,yo=36494,bo=36495,To=36283,Ao=36284,wo=36285,Ro=36286,Of=3200,wu=0,Bf=1,yn="",Le="srgb",Yi="srgb-linear",br="linear",ae="srgb",_i=7680,Lc=519,zf=512,Gf=513,Hf=514,Jo=515,Vf=516,kf=517,Qo=518,Wf=519,Co=35044,Ic="300 es",hn=2e3,As=2001;function Xf(i){for(let t=i.length-1;t>=0;--t)if(i[t]>=65535)return!0;return!1}function Tr(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function Yf(){const i=Tr("canvas");return i.style.display="block",i}const Uc={};function Ar(...i){const t="THREE."+i.shift();console.log(t,...i)}function Ru(i){const t=i[0];if(typeof t=="string"&&t.startsWith("TSL:")){const e=i[1];e&&e.isStackTrace?i[0]+=" "+e.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function zt(...i){i=Ru(i);const t="THREE."+i.shift();{const e=i[0];e&&e.isStackTrace?console.warn(e.getError(t)):console.warn(t,...i)}}function Jt(...i){i=Ru(i);const t="THREE."+i.shift();{const e=i[0];e&&e.isStackTrace?console.error(e.getError(t)):console.error(t,...i)}}function wr(...i){const t=i.join(" ");t in Uc||(Uc[t]=!0,zt(...i))}function qf(i,t,e){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(t,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}const Kf={[Va]:ka,[Wa]:qa,[Xa]:Ka,[ki]:Ya,[ka]:Va,[qa]:Wa,[Ka]:Xa,[Ya]:ki};class Qi{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){const n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){const n=this._listeners;if(n===void 0)return;const s=n[t];if(s!==void 0){const r=s.indexOf(e);r!==-1&&s.splice(r,1)}}dispatchEvent(t){const e=this._listeners;if(e===void 0)return;const n=e[t.type];if(n!==void 0){t.target=this;const s=n.slice(0);for(let r=0,a=s.length;r<a;r++)s[r].call(this,t);t.target=null}}}const Pe=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],Zr=Math.PI/180,Po=180/Math.PI;function Gn(){const i=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Pe[i&255]+Pe[i>>8&255]+Pe[i>>16&255]+Pe[i>>24&255]+"-"+Pe[t&255]+Pe[t>>8&255]+"-"+Pe[t>>16&15|64]+Pe[t>>24&255]+"-"+Pe[e&63|128]+Pe[e>>8&255]+"-"+Pe[e>>16&255]+Pe[e>>24&255]+Pe[n&255]+Pe[n>>8&255]+Pe[n>>16&255]+Pe[n>>24&255]).toLowerCase()}function Zt(i,t,e){return Math.max(t,Math.min(e,i))}function $f(i,t){return(i%t+t)%t}function jr(i,t,e){return(1-e)*i+e*t}function un(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("Invalid component type.")}}function le(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("Invalid component type.")}}class Ft{constructor(t=0,e=0){Ft.prototype.isVector2=!0,this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){const e=this.x,n=this.y,s=t.elements;return this.x=s[0]*e+s[3]*n+s[6],this.y=s[1]*e+s[4]*n+s[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Zt(this.x,t.x,e.x),this.y=Zt(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=Zt(this.x,t,e),this.y=Zt(this.y,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Zt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(Zt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){const n=Math.cos(e),s=Math.sin(e),r=this.x-t.x,a=this.y-t.y;return this.x=r*n-a*s+t.x,this.y=r*s+a*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class Ze{constructor(t=0,e=0,n=0,s=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=s}static slerpFlat(t,e,n,s,r,a,o){let l=n[s+0],c=n[s+1],h=n[s+2],f=n[s+3],u=r[a+0],m=r[a+1],g=r[a+2],v=r[a+3];if(f!==v||l!==u||c!==m||h!==g){let p=l*u+c*m+h*g+f*v;p<0&&(u=-u,m=-m,g=-g,v=-v,p=-p);let d=1-o;if(p<.9995){const x=Math.acos(p),y=Math.sin(x);d=Math.sin(d*x)/y,o=Math.sin(o*x)/y,l=l*d+u*o,c=c*d+m*o,h=h*d+g*o,f=f*d+v*o}else{l=l*d+u*o,c=c*d+m*o,h=h*d+g*o,f=f*d+v*o;const x=1/Math.sqrt(l*l+c*c+h*h+f*f);l*=x,c*=x,h*=x,f*=x}}t[e]=l,t[e+1]=c,t[e+2]=h,t[e+3]=f}static multiplyQuaternionsFlat(t,e,n,s,r,a){const o=n[s],l=n[s+1],c=n[s+2],h=n[s+3],f=r[a],u=r[a+1],m=r[a+2],g=r[a+3];return t[e]=o*g+h*f+l*m-c*u,t[e+1]=l*g+h*u+c*f-o*m,t[e+2]=c*g+h*m+o*u-l*f,t[e+3]=h*g-o*f-l*u-c*m,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,s){return this._x=t,this._y=e,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){const n=t._x,s=t._y,r=t._z,a=t._order,o=Math.cos,l=Math.sin,c=o(n/2),h=o(s/2),f=o(r/2),u=l(n/2),m=l(s/2),g=l(r/2);switch(a){case"XYZ":this._x=u*h*f+c*m*g,this._y=c*m*f-u*h*g,this._z=c*h*g+u*m*f,this._w=c*h*f-u*m*g;break;case"YXZ":this._x=u*h*f+c*m*g,this._y=c*m*f-u*h*g,this._z=c*h*g-u*m*f,this._w=c*h*f+u*m*g;break;case"ZXY":this._x=u*h*f-c*m*g,this._y=c*m*f+u*h*g,this._z=c*h*g+u*m*f,this._w=c*h*f-u*m*g;break;case"ZYX":this._x=u*h*f-c*m*g,this._y=c*m*f+u*h*g,this._z=c*h*g-u*m*f,this._w=c*h*f+u*m*g;break;case"YZX":this._x=u*h*f+c*m*g,this._y=c*m*f+u*h*g,this._z=c*h*g-u*m*f,this._w=c*h*f-u*m*g;break;case"XZY":this._x=u*h*f-c*m*g,this._y=c*m*f-u*h*g,this._z=c*h*g+u*m*f,this._w=c*h*f+u*m*g;break;default:zt("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){const n=e/2,s=Math.sin(n);return this._x=t.x*s,this._y=t.y*s,this._z=t.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){const e=t.elements,n=e[0],s=e[4],r=e[8],a=e[1],o=e[5],l=e[9],c=e[2],h=e[6],f=e[10],u=n+o+f;if(u>0){const m=.5/Math.sqrt(u+1);this._w=.25/m,this._x=(h-l)*m,this._y=(r-c)*m,this._z=(a-s)*m}else if(n>o&&n>f){const m=2*Math.sqrt(1+n-o-f);this._w=(h-l)/m,this._x=.25*m,this._y=(s+a)/m,this._z=(r+c)/m}else if(o>f){const m=2*Math.sqrt(1+o-n-f);this._w=(r-c)/m,this._x=(s+a)/m,this._y=.25*m,this._z=(l+h)/m}else{const m=2*Math.sqrt(1+f-n-o);this._w=(a-s)/m,this._x=(r+c)/m,this._y=(l+h)/m,this._z=.25*m}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(Zt(this.dot(t),-1,1)))}rotateTowards(t,e){const n=this.angleTo(t);if(n===0)return this;const s=Math.min(1,e/n);return this.slerp(t,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){const n=t._x,s=t._y,r=t._z,a=t._w,o=e._x,l=e._y,c=e._z,h=e._w;return this._x=n*h+a*o+s*c-r*l,this._y=s*h+a*l+r*o-n*c,this._z=r*h+a*c+n*l-s*o,this._w=a*h-n*o-s*l-r*c,this._onChangeCallback(),this}slerp(t,e){let n=t._x,s=t._y,r=t._z,a=t._w,o=this.dot(t);o<0&&(n=-n,s=-s,r=-r,a=-a,o=-o);let l=1-e;if(o<.9995){const c=Math.acos(o),h=Math.sin(c);l=Math.sin(l*c)/h,e=Math.sin(e*c)/h,this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+a*e,this._onChangeCallback()}else this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+a*e,this.normalize();return this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){const t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(t),s*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class L{constructor(t=0,e=0,n=0){L.prototype.isVector3=!0,this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(Nc.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(Nc.setFromAxisAngle(t,e))}applyMatrix3(t){const e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*s,this.y=r[1]*e+r[4]*n+r[7]*s,this.z=r[2]*e+r[5]*n+r[8]*s,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){const e=this.x,n=this.y,s=this.z,r=t.elements,a=1/(r[3]*e+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*s+r[12])*a,this.y=(r[1]*e+r[5]*n+r[9]*s+r[13])*a,this.z=(r[2]*e+r[6]*n+r[10]*s+r[14])*a,this}applyQuaternion(t){const e=this.x,n=this.y,s=this.z,r=t.x,a=t.y,o=t.z,l=t.w,c=2*(a*s-o*n),h=2*(o*e-r*s),f=2*(r*n-a*e);return this.x=e+l*c+a*f-o*h,this.y=n+l*h+o*c-r*f,this.z=s+l*f+r*h-a*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){const e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*s,this.y=r[1]*e+r[5]*n+r[9]*s,this.z=r[2]*e+r[6]*n+r[10]*s,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Zt(this.x,t.x,e.x),this.y=Zt(this.y,t.y,e.y),this.z=Zt(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=Zt(this.x,t,e),this.y=Zt(this.y,t,e),this.z=Zt(this.z,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Zt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){const n=t.x,s=t.y,r=t.z,a=e.x,o=e.y,l=e.z;return this.x=s*l-r*o,this.y=r*a-n*l,this.z=n*o-s*a,this}projectOnVector(t){const e=t.lengthSq();if(e===0)return this.set(0,0,0);const n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return Jr.copy(this).projectOnVector(t),this.sub(Jr)}reflect(t){return this.sub(Jr.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(Zt(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y,s=this.z-t.z;return e*e+n*n+s*s}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){const s=Math.sin(e)*t;return this.x=s*Math.sin(n),this.y=Math.cos(e)*t,this.z=s*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){const e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),s=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=s,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const Jr=new L,Nc=new Ze;class Ht{constructor(t,e,n,s,r,a,o,l,c){Ht.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,a,o,l,c)}set(t,e,n,s,r,a,o,l,c){const h=this.elements;return h[0]=t,h[1]=s,h[2]=o,h[3]=e,h[4]=r,h[5]=l,h[6]=n,h[7]=a,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){const e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,s=e.elements,r=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],h=n[4],f=n[7],u=n[2],m=n[5],g=n[8],v=s[0],p=s[3],d=s[6],x=s[1],y=s[4],S=s[7],A=s[2],b=s[5],w=s[8];return r[0]=a*v+o*x+l*A,r[3]=a*p+o*y+l*b,r[6]=a*d+o*S+l*w,r[1]=c*v+h*x+f*A,r[4]=c*p+h*y+f*b,r[7]=c*d+h*S+f*w,r[2]=u*v+m*x+g*A,r[5]=u*p+m*y+g*b,r[8]=u*d+m*S+g*w,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8];return e*a*h-e*o*c-n*r*h+n*o*l+s*r*c-s*a*l}invert(){const t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8],f=h*a-o*c,u=o*l-h*r,m=c*r-a*l,g=e*f+n*u+s*m;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);const v=1/g;return t[0]=f*v,t[1]=(s*c-h*n)*v,t[2]=(o*n-s*a)*v,t[3]=u*v,t[4]=(h*e-s*l)*v,t[5]=(s*r-o*e)*v,t[6]=m*v,t[7]=(n*l-c*e)*v,t[8]=(a*e-n*r)*v,this}transpose(){let t;const e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){const e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,s,r,a,o){const l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*a+c*o)+a+t,-s*c,s*l,-s*(-c*a+l*o)+o+e,0,0,1),this}scale(t,e){return this.premultiply(Qr.makeScale(t,e)),this}rotate(t){return this.premultiply(Qr.makeRotation(-t)),this}translate(t,e){return this.premultiply(Qr.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){const e=this.elements,n=t.elements;for(let s=0;s<9;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}}const Qr=new Ht,Fc=new Ht().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Oc=new Ht().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Zf(){const i={enabled:!0,workingColorSpace:Yi,spaces:{},convert:function(s,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===ae&&(s.r=An(s.r),s.g=An(s.g),s.b=An(s.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===ae&&(s.r=Hi(s.r),s.g=Hi(s.g),s.b=Hi(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===yn?br:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,a){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,r){return wr("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(s,r)},toWorkingColorSpace:function(s,r){return wr("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(s,r)}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[Yi]:{primaries:t,whitePoint:n,transfer:br,toXYZ:Fc,fromXYZ:Oc,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:Le},outputColorSpaceConfig:{drawingBufferColorSpace:Le}},[Le]:{primaries:t,whitePoint:n,transfer:ae,toXYZ:Fc,fromXYZ:Oc,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:Le}}}),i}const Qt=Zf();function An(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Hi(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}let xi;class jf{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{xi===void 0&&(xi=Tr("canvas")),xi.width=t.width,xi.height=t.height;const s=xi.getContext("2d");t instanceof ImageData?s.putImageData(t,0,0):s.drawImage(t,0,0,t.width,t.height),n=xi}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){const e=Tr("canvas");e.width=t.width,e.height=t.height;const n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);const s=n.getImageData(0,0,t.width,t.height),r=s.data;for(let a=0;a<r.length;a++)r[a]=An(r[a]/255)*255;return n.putImageData(s,0,0),e}else if(t.data){const e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(An(e[n]/255)*255):e[n]=An(e[n]);return{data:e,width:t.width,height:t.height}}else return zt("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}}let Jf=0;class tc{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Jf++}),this.uuid=Gn(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){const e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):typeof VideoFrame<"u"&&e instanceof VideoFrame?t.set(e.displayHeight,e.displayWidth,0):e!==null?t.set(e.width,e.height,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];const n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let a=0,o=s.length;a<o;a++)s[a].isDataTexture?r.push(ta(s[a].image)):r.push(ta(s[a]))}else r=ta(s);n.url=r}return e||(t.images[this.uuid]=n),n}}function ta(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?jf.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(zt("Texture: Unable to serialize Texture."),{})}let Qf=0;const ea=new L;class Ue extends Qi{constructor(t=Ue.DEFAULT_IMAGE,e=Ue.DEFAULT_MAPPING,n=bn,s=bn,r=be,a=ri,o=qe,l=We,c=Ue.DEFAULT_ANISOTROPY,h=yn){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Qf++}),this.uuid=Gn(),this.name="",this.source=new tc(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new Ft(0,0),this.repeat=new Ft(1,1),this.center=new Ft(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ht,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(ea).x}get height(){return this.source.getSize(ea).y}get depth(){return this.source.getSize(ea).z}get image(){return this.source.data}set image(t=null){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(const e in t){const n=t[e];if(n===void 0){zt(`Texture.setValues(): parameter '${e}' has value of undefined.`);continue}const s=this[e];if(s===void 0){zt(`Texture.setValues(): property '${e}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[e]=n}}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];const n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==Mu)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case li:t.x=t.x-Math.floor(t.x);break;case bn:t.x=t.x<0?0:1;break;case $a:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case li:t.y=t.y-Math.floor(t.y);break;case bn:t.y=t.y<0?0:1;break;case $a:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}}Ue.DEFAULT_IMAGE=null;Ue.DEFAULT_MAPPING=Mu;Ue.DEFAULT_ANISOTROPY=1;class pe{constructor(t=0,e=0,n=0,s=1){pe.prototype.isVector4=!0,this.x=t,this.y=e,this.z=n,this.w=s}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,s){return this.x=t,this.y=e,this.z=n,this.w=s,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){const e=this.x,n=this.y,s=this.z,r=this.w,a=t.elements;return this.x=a[0]*e+a[4]*n+a[8]*s+a[12]*r,this.y=a[1]*e+a[5]*n+a[9]*s+a[13]*r,this.z=a[2]*e+a[6]*n+a[10]*s+a[14]*r,this.w=a[3]*e+a[7]*n+a[11]*s+a[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);const e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,s,r;const l=t.elements,c=l[0],h=l[4],f=l[8],u=l[1],m=l[5],g=l[9],v=l[2],p=l[6],d=l[10];if(Math.abs(h-u)<.01&&Math.abs(f-v)<.01&&Math.abs(g-p)<.01){if(Math.abs(h+u)<.1&&Math.abs(f+v)<.1&&Math.abs(g+p)<.1&&Math.abs(c+m+d-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;const y=(c+1)/2,S=(m+1)/2,A=(d+1)/2,b=(h+u)/4,w=(f+v)/4,_=(g+p)/4;return y>S&&y>A?y<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(y),s=b/n,r=w/n):S>A?S<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(S),n=b/s,r=_/s):A<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(A),n=w/r,s=_/r),this.set(n,s,r,e),this}let x=Math.sqrt((p-g)*(p-g)+(f-v)*(f-v)+(u-h)*(u-h));return Math.abs(x)<.001&&(x=1),this.x=(p-g)/x,this.y=(f-v)/x,this.z=(u-h)/x,this.w=Math.acos((c+m+d-1)/2),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Zt(this.x,t.x,e.x),this.y=Zt(this.y,t.y,e.y),this.z=Zt(this.z,t.z,e.z),this.w=Zt(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=Zt(this.x,t,e),this.y=Zt(this.y,t,e),this.z=Zt(this.z,t,e),this.w=Zt(this.w,t,e),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Zt(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class td extends Qi{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:be,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new pe(0,0,t,e),this.scissorTest=!1,this.viewport=new pe(0,0,t,e),this.textures=[];const s={width:t,height:e,depth:n.depth},r=new Ue(s),a=n.count;for(let o=0;o<a;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview}_setTextureOptions(t={}){const e={minFilter:be,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),t!==null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=t,this.textures[s].image.height=e,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;const s=Object.assign({},t.textures[e].image);this.textures[e].source=new tc(s)}return this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}}class dn extends td{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}}class Cu extends Ue{constructor(t=null,e=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=Re,this.minFilter=Re,this.wrapR=bn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}}class ed extends Ue{constructor(t=null,e=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=Re,this.minFilter=Re,this.wrapR=bn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class te{constructor(t,e,n,s,r,a,o,l,c,h,f,u,m,g,v,p){te.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,a,o,l,c,h,f,u,m,g,v,p)}set(t,e,n,s,r,a,o,l,c,h,f,u,m,g,v,p){const d=this.elements;return d[0]=t,d[4]=e,d[8]=n,d[12]=s,d[1]=r,d[5]=a,d[9]=o,d[13]=l,d[2]=c,d[6]=h,d[10]=f,d[14]=u,d[3]=m,d[7]=g,d[11]=v,d[15]=p,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new te().fromArray(this.elements)}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){const e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){const e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return this.determinant()===0?(t.set(1,0,0),e.set(0,1,0),n.set(0,0,1),this):(t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){if(t.determinant()===0)return this.identity();const e=this.elements,n=t.elements,s=1/vi.setFromMatrixColumn(t,0).length(),r=1/vi.setFromMatrixColumn(t,1).length(),a=1/vi.setFromMatrixColumn(t,2).length();return e[0]=n[0]*s,e[1]=n[1]*s,e[2]=n[2]*s,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*a,e[9]=n[9]*a,e[10]=n[10]*a,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){const e=this.elements,n=t.x,s=t.y,r=t.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(s),c=Math.sin(s),h=Math.cos(r),f=Math.sin(r);if(t.order==="XYZ"){const u=a*h,m=a*f,g=o*h,v=o*f;e[0]=l*h,e[4]=-l*f,e[8]=c,e[1]=m+g*c,e[5]=u-v*c,e[9]=-o*l,e[2]=v-u*c,e[6]=g+m*c,e[10]=a*l}else if(t.order==="YXZ"){const u=l*h,m=l*f,g=c*h,v=c*f;e[0]=u+v*o,e[4]=g*o-m,e[8]=a*c,e[1]=a*f,e[5]=a*h,e[9]=-o,e[2]=m*o-g,e[6]=v+u*o,e[10]=a*l}else if(t.order==="ZXY"){const u=l*h,m=l*f,g=c*h,v=c*f;e[0]=u-v*o,e[4]=-a*f,e[8]=g+m*o,e[1]=m+g*o,e[5]=a*h,e[9]=v-u*o,e[2]=-a*c,e[6]=o,e[10]=a*l}else if(t.order==="ZYX"){const u=a*h,m=a*f,g=o*h,v=o*f;e[0]=l*h,e[4]=g*c-m,e[8]=u*c+v,e[1]=l*f,e[5]=v*c+u,e[9]=m*c-g,e[2]=-c,e[6]=o*l,e[10]=a*l}else if(t.order==="YZX"){const u=a*l,m=a*c,g=o*l,v=o*c;e[0]=l*h,e[4]=v-u*f,e[8]=g*f+m,e[1]=f,e[5]=a*h,e[9]=-o*h,e[2]=-c*h,e[6]=m*f+g,e[10]=u-v*f}else if(t.order==="XZY"){const u=a*l,m=a*c,g=o*l,v=o*c;e[0]=l*h,e[4]=-f,e[8]=c*h,e[1]=u*f+v,e[5]=a*h,e[9]=m*f-g,e[2]=g*f-m,e[6]=o*h,e[10]=v*f+u}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(nd,t,id)}lookAt(t,e,n){const s=this.elements;return He.subVectors(t,e),He.lengthSq()===0&&(He.z=1),He.normalize(),Ln.crossVectors(n,He),Ln.lengthSq()===0&&(Math.abs(n.z)===1?He.x+=1e-4:He.z+=1e-4,He.normalize(),Ln.crossVectors(n,He)),Ln.normalize(),Os.crossVectors(He,Ln),s[0]=Ln.x,s[4]=Os.x,s[8]=He.x,s[1]=Ln.y,s[5]=Os.y,s[9]=He.y,s[2]=Ln.z,s[6]=Os.z,s[10]=He.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,s=e.elements,r=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],h=n[1],f=n[5],u=n[9],m=n[13],g=n[2],v=n[6],p=n[10],d=n[14],x=n[3],y=n[7],S=n[11],A=n[15],b=s[0],w=s[4],_=s[8],E=s[12],D=s[1],P=s[5],U=s[9],I=s[13],z=s[2],F=s[6],N=s[10],H=s[14],K=s[3],$=s[7],J=s[11],st=s[15];return r[0]=a*b+o*D+l*z+c*K,r[4]=a*w+o*P+l*F+c*$,r[8]=a*_+o*U+l*N+c*J,r[12]=a*E+o*I+l*H+c*st,r[1]=h*b+f*D+u*z+m*K,r[5]=h*w+f*P+u*F+m*$,r[9]=h*_+f*U+u*N+m*J,r[13]=h*E+f*I+u*H+m*st,r[2]=g*b+v*D+p*z+d*K,r[6]=g*w+v*P+p*F+d*$,r[10]=g*_+v*U+p*N+d*J,r[14]=g*E+v*I+p*H+d*st,r[3]=x*b+y*D+S*z+A*K,r[7]=x*w+y*P+S*F+A*$,r[11]=x*_+y*U+S*N+A*J,r[15]=x*E+y*I+S*H+A*st,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[4],s=t[8],r=t[12],a=t[1],o=t[5],l=t[9],c=t[13],h=t[2],f=t[6],u=t[10],m=t[14],g=t[3],v=t[7],p=t[11],d=t[15],x=l*m-c*u,y=o*m-c*f,S=o*u-l*f,A=a*m-c*h,b=a*u-l*h,w=a*f-o*h;return e*(v*x-p*y+d*S)-n*(g*x-p*A+d*b)+s*(g*y-v*A+d*w)-r*(g*S-v*b+p*w)}transpose(){const t=this.elements;let e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){const s=this.elements;return t.isVector3?(s[12]=t.x,s[13]=t.y,s[14]=t.z):(s[12]=t,s[13]=e,s[14]=n),this}invert(){const t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],h=t[8],f=t[9],u=t[10],m=t[11],g=t[12],v=t[13],p=t[14],d=t[15],x=e*o-n*a,y=e*l-s*a,S=e*c-r*a,A=n*l-s*o,b=n*c-r*o,w=s*c-r*l,_=h*v-f*g,E=h*p-u*g,D=h*d-m*g,P=f*p-u*v,U=f*d-m*v,I=u*d-m*p,z=x*I-y*U+S*P+A*D-b*E+w*_;if(z===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const F=1/z;return t[0]=(o*I-l*U+c*P)*F,t[1]=(s*U-n*I-r*P)*F,t[2]=(v*w-p*b+d*A)*F,t[3]=(u*b-f*w-m*A)*F,t[4]=(l*D-a*I-c*E)*F,t[5]=(e*I-s*D+r*E)*F,t[6]=(p*S-g*w-d*y)*F,t[7]=(h*w-u*S+m*y)*F,t[8]=(a*U-o*D+c*_)*F,t[9]=(n*D-e*U-r*_)*F,t[10]=(g*b-v*S+d*x)*F,t[11]=(f*S-h*b-m*x)*F,t[12]=(o*E-a*P-l*_)*F,t[13]=(e*P-n*E+s*_)*F,t[14]=(v*y-g*A-p*x)*F,t[15]=(h*A-f*y+u*x)*F,this}scale(t){const e=this.elements,n=t.x,s=t.y,r=t.z;return e[0]*=n,e[4]*=s,e[8]*=r,e[1]*=n,e[5]*=s,e[9]*=r,e[2]*=n,e[6]*=s,e[10]*=r,e[3]*=n,e[7]*=s,e[11]*=r,this}getMaxScaleOnAxis(){const t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],s=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,s))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){const e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){const n=Math.cos(e),s=Math.sin(e),r=1-n,a=t.x,o=t.y,l=t.z,c=r*a,h=r*o;return this.set(c*a+n,c*o-s*l,c*l+s*o,0,c*o+s*l,h*o+n,h*l-s*a,0,c*l-s*o,h*l+s*a,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,s,r,a){return this.set(1,n,r,0,t,1,a,0,e,s,1,0,0,0,0,1),this}compose(t,e,n){const s=this.elements,r=e._x,a=e._y,o=e._z,l=e._w,c=r+r,h=a+a,f=o+o,u=r*c,m=r*h,g=r*f,v=a*h,p=a*f,d=o*f,x=l*c,y=l*h,S=l*f,A=n.x,b=n.y,w=n.z;return s[0]=(1-(v+d))*A,s[1]=(m+S)*A,s[2]=(g-y)*A,s[3]=0,s[4]=(m-S)*b,s[5]=(1-(u+d))*b,s[6]=(p+x)*b,s[7]=0,s[8]=(g+y)*w,s[9]=(p-x)*w,s[10]=(1-(u+v))*w,s[11]=0,s[12]=t.x,s[13]=t.y,s[14]=t.z,s[15]=1,this}decompose(t,e,n){const s=this.elements;t.x=s[12],t.y=s[13],t.z=s[14];const r=this.determinant();if(r===0)return n.set(1,1,1),e.identity(),this;let a=vi.set(s[0],s[1],s[2]).length();const o=vi.set(s[4],s[5],s[6]).length(),l=vi.set(s[8],s[9],s[10]).length();r<0&&(a=-a),Je.copy(this);const c=1/a,h=1/o,f=1/l;return Je.elements[0]*=c,Je.elements[1]*=c,Je.elements[2]*=c,Je.elements[4]*=h,Je.elements[5]*=h,Je.elements[6]*=h,Je.elements[8]*=f,Je.elements[9]*=f,Je.elements[10]*=f,e.setFromRotationMatrix(Je),n.x=a,n.y=o,n.z=l,this}makePerspective(t,e,n,s,r,a,o=hn,l=!1){const c=this.elements,h=2*r/(e-t),f=2*r/(n-s),u=(e+t)/(e-t),m=(n+s)/(n-s);let g,v;if(l)g=r/(a-r),v=a*r/(a-r);else if(o===hn)g=-(a+r)/(a-r),v=-2*a*r/(a-r);else if(o===As)g=-a/(a-r),v=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=f,c[9]=m,c[13]=0,c[2]=0,c[6]=0,c[10]=g,c[14]=v,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,s,r,a,o=hn,l=!1){const c=this.elements,h=2/(e-t),f=2/(n-s),u=-(e+t)/(e-t),m=-(n+s)/(n-s);let g,v;if(l)g=1/(a-r),v=a/(a-r);else if(o===hn)g=-2/(a-r),v=-(a+r)/(a-r);else if(o===As)g=-1/(a-r),v=-r/(a-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=0,c[12]=u,c[1]=0,c[5]=f,c[9]=0,c[13]=m,c[2]=0,c[6]=0,c[10]=g,c[14]=v,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){const e=this.elements,n=t.elements;for(let s=0;s<16;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}}const vi=new L,Je=new te,nd=new L(0,0,0),id=new L(1,1,1),Ln=new L,Os=new L,He=new L,Bc=new te,zc=new Ze;class ze{constructor(t=0,e=0,n=0,s=ze.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=s}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,s=this._order){return this._x=t,this._y=e,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){const s=t.elements,r=s[0],a=s[4],o=s[8],l=s[1],c=s[5],h=s[9],f=s[2],u=s[6],m=s[10];switch(e){case"XYZ":this._y=Math.asin(Zt(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,m),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(u,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Zt(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,m),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-f,r),this._z=0);break;case"ZXY":this._x=Math.asin(Zt(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-f,m),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-Zt(f,-1,1)),Math.abs(f)<.9999999?(this._x=Math.atan2(u,m),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(Zt(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-f,r)):(this._x=0,this._y=Math.atan2(o,m));break;case"XZY":this._z=Math.asin(-Zt(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(u,c),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-h,m),this._y=0);break;default:zt("Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return Bc.makeRotationFromQuaternion(t),this.setFromRotationMatrix(Bc,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return zc.setFromEuler(this),this.setFromQuaternion(zc,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}ze.DEFAULT_ORDER="XYZ";class Pu{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}}let sd=0;const Gc=new L,Mi=new Ze,_n=new te,Bs=new L,is=new L,rd=new L,ad=new Ze,Hc=new L(1,0,0),Vc=new L(0,1,0),kc=new L(0,0,1),Wc={type:"added"},od={type:"removed"},Si={type:"childadded",child:null},na={type:"childremoved",child:null};class xe extends Qi{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:sd++}),this.uuid=Gn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=xe.DEFAULT_UP.clone();const t=new L,e=new ze,n=new Ze,s=new L(1,1,1);function r(){n.setFromEuler(e,!1)}function a(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new te},normalMatrix:{value:new Ht}}),this.matrix=new te,this.matrixWorld=new te,this.matrixAutoUpdate=xe.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=xe.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Pu,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return Mi.setFromAxisAngle(t,e),this.quaternion.multiply(Mi),this}rotateOnWorldAxis(t,e){return Mi.setFromAxisAngle(t,e),this.quaternion.premultiply(Mi),this}rotateX(t){return this.rotateOnAxis(Hc,t)}rotateY(t){return this.rotateOnAxis(Vc,t)}rotateZ(t){return this.rotateOnAxis(kc,t)}translateOnAxis(t,e){return Gc.copy(t).applyQuaternion(this.quaternion),this.position.add(Gc.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Hc,t)}translateY(t){return this.translateOnAxis(Vc,t)}translateZ(t){return this.translateOnAxis(kc,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(_n.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?Bs.copy(t):Bs.set(t,e,n);const s=this.parent;this.updateWorldMatrix(!0,!1),is.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?_n.lookAt(is,Bs,this.up):_n.lookAt(Bs,is,this.up),this.quaternion.setFromRotationMatrix(_n),s&&(_n.extractRotation(s.matrixWorld),Mi.setFromRotationMatrix(_n),this.quaternion.premultiply(Mi.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(Jt("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(Wc),Si.child=t,this.dispatchEvent(Si),Si.child=null):Jt("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(od),na.child=t,this.dispatchEvent(na),na.child=null),this}removeFromParent(){const t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),_n.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),_n.multiply(t.parent.matrixWorld)),t.applyMatrix4(_n),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(Wc),Si.child=t,this.dispatchEvent(Si),Si.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,s=this.children.length;n<s;n++){const a=this.children[n].getObjectByProperty(t,e);if(a!==void 0)return a}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);const s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(is,t,rd),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(is,ad,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);const e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);const e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);const e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverseVisible(t)}traverseAncestors(t){const e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);const t=this.pivot;if(t!==null){const e=t.x,n=t.y,s=t.z,r=this.matrix.elements;r[12]+=e-r[0]*e-r[4]*n-r[8]*s,r[13]+=n-r[1]*e-r[5]*n-r[9]*s,r[14]+=s-r[2]*e-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);const e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e){const n=this.parent;if(t===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),e===!0){const s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].updateWorldMatrix(!1,!0)}}toJSON(t){const e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),this.static!==!1&&(s.static=this.static),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(o=>({...o})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(t),s.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(t.geometries,this.geometry);const o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){const l=o.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){const f=l[c];r(t.shapes,f)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(r(t.materials,this.material[l]));s.material=o}else s.material=r(t.materials,this.material);if(this.children.length>0){s.children=[];for(let o=0;o<this.children.length;o++)s.children.push(this.children[o].toJSON(t).object)}if(this.animations.length>0){s.animations=[];for(let o=0;o<this.animations.length;o++){const l=this.animations[o];s.animations.push(r(t.animations,l))}}if(e){const o=a(t.geometries),l=a(t.materials),c=a(t.textures),h=a(t.images),f=a(t.shapes),u=a(t.skeletons),m=a(t.animations),g=a(t.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),f.length>0&&(n.shapes=f),u.length>0&&(n.skeletons=u),m.length>0&&(n.animations=m),g.length>0&&(n.nodes=g)}return n.object=s,n;function a(o){const l=[];for(const c in o){const h=o[c];delete h.metadata,l.push(h)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),t.pivot!==null&&(this.pivot=t.pivot.clone()),this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){const s=t.children[n];this.add(s.clone())}return this}}xe.DEFAULT_UP=new L(0,1,0);xe.DEFAULT_MATRIX_AUTO_UPDATE=!0;xe.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class we extends xe{constructor(){super(),this.isGroup=!0,this.type="Group"}}const cd={type:"move"};class ia{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new we,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new we,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new L,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new L),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new we,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new L,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new L),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){const e=this._hand;if(e)for(const n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let s=null,r=null,a=null;const o=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){a=!0;for(const v of t.hand.values()){const p=e.getJointPose(v,n),d=this._getHandJoint(c,v);p!==null&&(d.matrix.fromArray(p.transform.matrix),d.matrix.decompose(d.position,d.rotation,d.scale),d.matrixWorldNeedsUpdate=!0,d.jointRadius=p.radius),d.visible=p!==null}const h=c.joints["index-finger-tip"],f=c.joints["thumb-tip"],u=h.position.distanceTo(f.position),m=.02,g=.005;c.inputState.pinching&&u>m+g?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&u<=m-g&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1));o!==null&&(s=e.getPose(t.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(o.matrix.fromArray(s.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,s.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(s.linearVelocity)):o.hasLinearVelocity=!1,s.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(s.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(cd)))}return o!==null&&(o.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){const n=new we;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}}const Du={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},In={h:0,s:0,l:0},zs={h:0,s:0,l:0};function sa(i,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?i+(t-i)*6*e:e<1/2?t:e<2/3?i+(t-i)*6*(2/3-e):i}class Nt{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){const s=t;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=Le){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,Qt.colorSpaceToWorking(this,e),this}setRGB(t,e,n,s=Qt.workingColorSpace){return this.r=t,this.g=e,this.b=n,Qt.colorSpaceToWorking(this,s),this}setHSL(t,e,n,s=Qt.workingColorSpace){if(t=$f(t,1),e=Zt(e,0,1),n=Zt(n,0,1),e===0)this.r=this.g=this.b=n;else{const r=n<=.5?n*(1+e):n+e-n*e,a=2*n-r;this.r=sa(a,r,t+1/3),this.g=sa(a,r,t),this.b=sa(a,r,t-1/3)}return Qt.colorSpaceToWorking(this,s),this}setStyle(t,e=Le){function n(r){r!==void 0&&parseFloat(r)<1&&zt("Color: Alpha component of "+t+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(t)){let r;const a=s[1],o=s[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:zt("Color: Unknown color model "+t)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(t)){const r=s[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(a===6)return this.setHex(parseInt(r,16),e);zt("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=Le){const n=Du[t.toLowerCase()];return n!==void 0?this.setHex(n,e):zt("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=An(t.r),this.g=An(t.g),this.b=An(t.b),this}copyLinearToSRGB(t){return this.r=Hi(t.r),this.g=Hi(t.g),this.b=Hi(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=Le){return Qt.workingToColorSpace(De.copy(this),t),Math.round(Zt(De.r*255,0,255))*65536+Math.round(Zt(De.g*255,0,255))*256+Math.round(Zt(De.b*255,0,255))}getHexString(t=Le){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=Qt.workingColorSpace){Qt.workingToColorSpace(De.copy(this),e);const n=De.r,s=De.g,r=De.b,a=Math.max(n,s,r),o=Math.min(n,s,r);let l,c;const h=(o+a)/2;if(o===a)l=0,c=0;else{const f=a-o;switch(c=h<=.5?f/(a+o):f/(2-a-o),a){case n:l=(s-r)/f+(s<r?6:0);break;case s:l=(r-n)/f+2;break;case r:l=(n-s)/f+4;break}l/=6}return t.h=l,t.s=c,t.l=h,t}getRGB(t,e=Qt.workingColorSpace){return Qt.workingToColorSpace(De.copy(this),e),t.r=De.r,t.g=De.g,t.b=De.b,t}getStyle(t=Le){Qt.workingToColorSpace(De.copy(this),t);const e=De.r,n=De.g,s=De.b;return t!==Le?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(t,e,n){return this.getHSL(In),this.setHSL(In.h+t,In.s+e,In.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(In),t.getHSL(zs);const n=jr(In.h,zs.h,e),s=jr(In.s,zs.s,e),r=jr(In.l,zs.l,e);return this.setHSL(n,s,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){const e=this.r,n=this.g,s=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*s,this.g=r[1]*e+r[4]*n+r[7]*s,this.b=r[2]*e+r[5]*n+r[8]*s,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const De=new Nt;Nt.NAMES=Du;class ec{constructor(t,e=1,n=1e3){this.isFog=!0,this.name="",this.color=new Nt(t),this.near=e,this.far=n}clone(){return new ec(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}}class ld extends xe{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new ze,this.environmentIntensity=1,this.environmentRotation=new ze,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){const e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(e.object.environmentIntensity=this.environmentIntensity),e.object.environmentRotation=this.environmentRotation.toArray(),e}}const Qe=new L,xn=new L,ra=new L,vn=new L,Ei=new L,yi=new L,Xc=new L,aa=new L,oa=new L,ca=new L,la=new pe,ua=new pe,ha=new pe;class Ye{constructor(t=new L,e=new L,n=new L){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,s){s.subVectors(n,e),Qe.subVectors(t,e),s.cross(Qe);const r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(t,e,n,s,r){Qe.subVectors(s,e),xn.subVectors(n,e),ra.subVectors(t,e);const a=Qe.dot(Qe),o=Qe.dot(xn),l=Qe.dot(ra),c=xn.dot(xn),h=xn.dot(ra),f=a*c-o*o;if(f===0)return r.set(0,0,0),null;const u=1/f,m=(c*l-o*h)*u,g=(a*h-o*l)*u;return r.set(1-m-g,g,m)}static containsPoint(t,e,n,s){return this.getBarycoord(t,e,n,s,vn)===null?!1:vn.x>=0&&vn.y>=0&&vn.x+vn.y<=1}static getInterpolation(t,e,n,s,r,a,o,l){return this.getBarycoord(t,e,n,s,vn)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,vn.x),l.addScaledVector(a,vn.y),l.addScaledVector(o,vn.z),l)}static getInterpolatedAttribute(t,e,n,s,r,a){return la.setScalar(0),ua.setScalar(0),ha.setScalar(0),la.fromBufferAttribute(t,e),ua.fromBufferAttribute(t,n),ha.fromBufferAttribute(t,s),a.setScalar(0),a.addScaledVector(la,r.x),a.addScaledVector(ua,r.y),a.addScaledVector(ha,r.z),a}static isFrontFacing(t,e,n,s){return Qe.subVectors(n,e),xn.subVectors(t,e),Qe.cross(xn).dot(s)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,s){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[s]),this}setFromAttributeAndIndices(t,e,n,s){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,s),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return Qe.subVectors(this.c,this.b),xn.subVectors(this.a,this.b),Qe.cross(xn).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return Ye.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return Ye.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,s,r){return Ye.getInterpolation(t,this.a,this.b,this.c,e,n,s,r)}containsPoint(t){return Ye.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return Ye.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){const n=this.a,s=this.b,r=this.c;let a,o;Ei.subVectors(s,n),yi.subVectors(r,n),aa.subVectors(t,n);const l=Ei.dot(aa),c=yi.dot(aa);if(l<=0&&c<=0)return e.copy(n);oa.subVectors(t,s);const h=Ei.dot(oa),f=yi.dot(oa);if(h>=0&&f<=h)return e.copy(s);const u=l*f-h*c;if(u<=0&&l>=0&&h<=0)return a=l/(l-h),e.copy(n).addScaledVector(Ei,a);ca.subVectors(t,r);const m=Ei.dot(ca),g=yi.dot(ca);if(g>=0&&m<=g)return e.copy(r);const v=m*c-l*g;if(v<=0&&c>=0&&g<=0)return o=c/(c-g),e.copy(n).addScaledVector(yi,o);const p=h*g-m*f;if(p<=0&&f-h>=0&&m-g>=0)return Xc.subVectors(r,s),o=(f-h)/(f-h+(m-g)),e.copy(s).addScaledVector(Xc,o);const d=1/(p+v+u);return a=v*d,o=u*d,e.copy(n).addScaledVector(Ei,a).addScaledVector(yi,o)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}}class di{constructor(t=new L(1/0,1/0,1/0),e=new L(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(tn.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(tn.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){const n=tn.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);const n=t.geometry;if(n!==void 0){const r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)t.isMesh===!0?t.getVertexPosition(a,tn):tn.fromBufferAttribute(r,a),tn.applyMatrix4(t.matrixWorld),this.expandByPoint(tn);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),Gs.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Gs.copy(n.boundingBox)),Gs.applyMatrix4(t.matrixWorld),this.union(Gs)}const s=t.children;for(let r=0,a=s.length;r<a;r++)this.expandByObject(s[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,tn),tn.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(ss),Hs.subVectors(this.max,ss),bi.subVectors(t.a,ss),Ti.subVectors(t.b,ss),Ai.subVectors(t.c,ss),Un.subVectors(Ti,bi),Nn.subVectors(Ai,Ti),Kn.subVectors(bi,Ai);let e=[0,-Un.z,Un.y,0,-Nn.z,Nn.y,0,-Kn.z,Kn.y,Un.z,0,-Un.x,Nn.z,0,-Nn.x,Kn.z,0,-Kn.x,-Un.y,Un.x,0,-Nn.y,Nn.x,0,-Kn.y,Kn.x,0];return!fa(e,bi,Ti,Ai,Hs)||(e=[1,0,0,0,1,0,0,0,1],!fa(e,bi,Ti,Ai,Hs))?!1:(Vs.crossVectors(Un,Nn),e=[Vs.x,Vs.y,Vs.z],fa(e,bi,Ti,Ai,Hs))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,tn).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(tn).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(Mn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),Mn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),Mn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),Mn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),Mn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),Mn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),Mn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),Mn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(Mn),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}}const Mn=[new L,new L,new L,new L,new L,new L,new L,new L],tn=new L,Gs=new di,bi=new L,Ti=new L,Ai=new L,Un=new L,Nn=new L,Kn=new L,ss=new L,Hs=new L,Vs=new L,$n=new L;function fa(i,t,e,n,s){for(let r=0,a=i.length-3;r<=a;r+=3){$n.fromArray(i,r);const o=s.x*Math.abs($n.x)+s.y*Math.abs($n.y)+s.z*Math.abs($n.z),l=t.dot($n),c=e.dot($n),h=n.dot($n);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>o)return!1}return!0}const ge=new L,ks=new Ft;let ud=0;class Ne{constructor(t,e,n=!1){if(Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:ud++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=Co,this.updateRanges=[],this.gpuType=nn,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[t+s]=e.array[n+s];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)ks.fromBufferAttribute(this,e),ks.applyMatrix3(t),this.setXY(e,ks.x,ks.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)ge.fromBufferAttribute(this,e),ge.applyMatrix3(t),this.setXYZ(e,ge.x,ge.y,ge.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)ge.fromBufferAttribute(this,e),ge.applyMatrix4(t),this.setXYZ(e,ge.x,ge.y,ge.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)ge.fromBufferAttribute(this,e),ge.applyNormalMatrix(t),this.setXYZ(e,ge.x,ge.y,ge.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)ge.fromBufferAttribute(this,e),ge.transformDirection(t),this.setXYZ(e,ge.x,ge.y,ge.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=un(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=le(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=un(e,this.array)),e}setX(t,e){return this.normalized&&(e=le(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=un(e,this.array)),e}setY(t,e){return this.normalized&&(e=le(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=un(e,this.array)),e}setZ(t,e){return this.normalized&&(e=le(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=un(e,this.array)),e}setW(t,e){return this.normalized&&(e=le(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=le(e,this.array),n=le(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,s){return t*=this.itemSize,this.normalized&&(e=le(e,this.array),n=le(n,this.array),s=le(s,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this}setXYZW(t,e,n,s,r){return t*=this.itemSize,this.normalized&&(e=le(e,this.array),n=le(n,this.array),s=le(s,this.array),r=le(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==Co&&(t.usage=this.usage),t}}class Lu extends Ne{constructor(t,e,n){super(new Uint16Array(t),e,n)}}class Iu extends Ne{constructor(t,e,n){super(new Uint32Array(t),e,n)}}class se extends Ne{constructor(t,e,n){super(new Float32Array(t),e,n)}}const hd=new di,rs=new L,da=new L;class ts{constructor(t=new L,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){const n=this.center;e!==void 0?n.copy(e):hd.setFromPoints(t).getCenter(n);let s=0;for(let r=0,a=t.length;r<a;r++)s=Math.max(s,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(s),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){const e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){const n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;rs.subVectors(t,this.center);const e=rs.lengthSq();if(e>this.radius*this.radius){const n=Math.sqrt(e),s=(n-this.radius)*.5;this.center.addScaledVector(rs,s/n),this.radius+=s}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(da.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(rs.copy(t.center).add(da)),this.expandByPoint(rs.copy(t.center).sub(da))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}}let fd=0;const Xe=new te,pa=new xe,wi=new L,Ve=new di,as=new di,ye=new L;class ve extends Qi{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:fd++}),this.uuid=Gn(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(Xf(t)?Iu:Lu)(t,1):this.index=t,this}setIndirect(t,e=0){return this.indirect=t,this.indirectOffset=e,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){const e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const r=new Ht().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}const s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(t),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(t){return Xe.makeRotationFromQuaternion(t),this.applyMatrix4(Xe),this}rotateX(t){return Xe.makeRotationX(t),this.applyMatrix4(Xe),this}rotateY(t){return Xe.makeRotationY(t),this.applyMatrix4(Xe),this}rotateZ(t){return Xe.makeRotationZ(t),this.applyMatrix4(Xe),this}translate(t,e,n){return Xe.makeTranslation(t,e,n),this.applyMatrix4(Xe),this}scale(t,e,n){return Xe.makeScale(t,e,n),this.applyMatrix4(Xe),this}lookAt(t){return pa.lookAt(t),pa.updateMatrix(),this.applyMatrix4(pa.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(wi).negate(),this.translate(wi.x,wi.y,wi.z),this}setFromPoints(t){const e=this.getAttribute("position");if(e===void 0){const n=[];for(let s=0,r=t.length;s<r;s++){const a=t[s];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new se(n,3))}else{const n=Math.min(t.length,e.count);for(let s=0;s<n;s++){const r=t[s];e.setXYZ(s,r.x,r.y,r.z||0)}t.length>e.count&&zt("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new di);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Jt("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new L(-1/0,-1/0,-1/0),new L(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,s=e.length;n<s;n++){const r=e[n];Ve.setFromBufferAttribute(r),this.morphTargetsRelative?(ye.addVectors(this.boundingBox.min,Ve.min),this.boundingBox.expandByPoint(ye),ye.addVectors(this.boundingBox.max,Ve.max),this.boundingBox.expandByPoint(ye)):(this.boundingBox.expandByPoint(Ve.min),this.boundingBox.expandByPoint(Ve.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Jt('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new ts);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){Jt("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new L,1/0);return}if(t){const n=this.boundingSphere.center;if(Ve.setFromBufferAttribute(t),e)for(let r=0,a=e.length;r<a;r++){const o=e[r];as.setFromBufferAttribute(o),this.morphTargetsRelative?(ye.addVectors(Ve.min,as.min),Ve.expandByPoint(ye),ye.addVectors(Ve.max,as.max),Ve.expandByPoint(ye)):(Ve.expandByPoint(as.min),Ve.expandByPoint(as.max))}Ve.getCenter(n);let s=0;for(let r=0,a=t.count;r<a;r++)ye.fromBufferAttribute(t,r),s=Math.max(s,n.distanceToSquared(ye));if(e)for(let r=0,a=e.length;r<a;r++){const o=e[r],l=this.morphTargetsRelative;for(let c=0,h=o.count;c<h;c++)ye.fromBufferAttribute(o,c),l&&(wi.fromBufferAttribute(t,c),ye.add(wi)),s=Math.max(s,n.distanceToSquared(ye))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&Jt('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){Jt("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=e.position,s=e.normal,r=e.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Ne(new Float32Array(4*n.count),4));const a=this.getAttribute("tangent"),o=[],l=[];for(let _=0;_<n.count;_++)o[_]=new L,l[_]=new L;const c=new L,h=new L,f=new L,u=new Ft,m=new Ft,g=new Ft,v=new L,p=new L;function d(_,E,D){c.fromBufferAttribute(n,_),h.fromBufferAttribute(n,E),f.fromBufferAttribute(n,D),u.fromBufferAttribute(r,_),m.fromBufferAttribute(r,E),g.fromBufferAttribute(r,D),h.sub(c),f.sub(c),m.sub(u),g.sub(u);const P=1/(m.x*g.y-g.x*m.y);isFinite(P)&&(v.copy(h).multiplyScalar(g.y).addScaledVector(f,-m.y).multiplyScalar(P),p.copy(f).multiplyScalar(m.x).addScaledVector(h,-g.x).multiplyScalar(P),o[_].add(v),o[E].add(v),o[D].add(v),l[_].add(p),l[E].add(p),l[D].add(p))}let x=this.groups;x.length===0&&(x=[{start:0,count:t.count}]);for(let _=0,E=x.length;_<E;++_){const D=x[_],P=D.start,U=D.count;for(let I=P,z=P+U;I<z;I+=3)d(t.getX(I+0),t.getX(I+1),t.getX(I+2))}const y=new L,S=new L,A=new L,b=new L;function w(_){A.fromBufferAttribute(s,_),b.copy(A);const E=o[_];y.copy(E),y.sub(A.multiplyScalar(A.dot(E))).normalize(),S.crossVectors(b,E);const P=S.dot(l[_])<0?-1:1;a.setXYZW(_,y.x,y.y,y.z,P)}for(let _=0,E=x.length;_<E;++_){const D=x[_],P=D.start,U=D.count;for(let I=P,z=P+U;I<z;I+=3)w(t.getX(I+0)),w(t.getX(I+1)),w(t.getX(I+2))}}computeVertexNormals(){const t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Ne(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let u=0,m=n.count;u<m;u++)n.setXYZ(u,0,0,0);const s=new L,r=new L,a=new L,o=new L,l=new L,c=new L,h=new L,f=new L;if(t)for(let u=0,m=t.count;u<m;u+=3){const g=t.getX(u+0),v=t.getX(u+1),p=t.getX(u+2);s.fromBufferAttribute(e,g),r.fromBufferAttribute(e,v),a.fromBufferAttribute(e,p),h.subVectors(a,r),f.subVectors(s,r),h.cross(f),o.fromBufferAttribute(n,g),l.fromBufferAttribute(n,v),c.fromBufferAttribute(n,p),o.add(h),l.add(h),c.add(h),n.setXYZ(g,o.x,o.y,o.z),n.setXYZ(v,l.x,l.y,l.z),n.setXYZ(p,c.x,c.y,c.z)}else for(let u=0,m=e.count;u<m;u+=3)s.fromBufferAttribute(e,u+0),r.fromBufferAttribute(e,u+1),a.fromBufferAttribute(e,u+2),h.subVectors(a,r),f.subVectors(s,r),h.cross(f),n.setXYZ(u+0,h.x,h.y,h.z),n.setXYZ(u+1,h.x,h.y,h.z),n.setXYZ(u+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)ye.fromBufferAttribute(t,e),ye.normalize(),t.setXYZ(e,ye.x,ye.y,ye.z)}toNonIndexed(){function t(o,l){const c=o.array,h=o.itemSize,f=o.normalized,u=new c.constructor(l.length*h);let m=0,g=0;for(let v=0,p=l.length;v<p;v++){o.isInterleavedBufferAttribute?m=l[v]*o.data.stride+o.offset:m=l[v]*h;for(let d=0;d<h;d++)u[g++]=c[m++]}return new Ne(u,h,f)}if(this.index===null)return zt("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const e=new ve,n=this.index.array,s=this.attributes;for(const o in s){const l=s[o],c=t(l,n);e.setAttribute(o,c)}const r=this.morphAttributes;for(const o in r){const l=[],c=r[o];for(let h=0,f=c.length;h<f;h++){const u=c[h],m=t(u,n);l.push(m)}e.morphAttributes[o]=l}e.morphTargetsRelative=this.morphTargetsRelative;const a=this.groups;for(let o=0,l=a.length;o<l;o++){const c=a[o];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){const t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};const e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});const n=this.attributes;for(const l in n){const c=n[l];t.data.attributes[l]=c.toJSON(t.data)}const s={};let r=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],h=[];for(let f=0,u=c.length;f<u;f++){const m=c[f];h.push(m.toJSON(t.data))}h.length>0&&(s[l]=h,r=!0)}r&&(t.data.morphAttributes=s,t.data.morphTargetsRelative=this.morphTargetsRelative);const a=this.groups;a.length>0&&(t.data.groups=JSON.parse(JSON.stringify(a)));const o=this.boundingSphere;return o!==null&&(t.data.boundingSphere=o.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const e={};this.name=t.name;const n=t.index;n!==null&&this.setIndex(n.clone());const s=t.attributes;for(const c in s){const h=s[c];this.setAttribute(c,h.clone(e))}const r=t.morphAttributes;for(const c in r){const h=[],f=r[c];for(let u=0,m=f.length;u<m;u++)h.push(f[u].clone(e));this.morphAttributes[c]=h}this.morphTargetsRelative=t.morphTargetsRelative;const a=t.groups;for(let c=0,h=a.length;c<h;c++){const f=a[c];this.addGroup(f.start,f.count,f.materialIndex)}const o=t.boundingBox;o!==null&&(this.boundingBox=o.clone());const l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}}class dd{constructor(t,e){this.isInterleavedBuffer=!0,this.array=t,this.stride=e,this.count=t!==void 0?t.length/e:0,this.usage=Co,this.updateRanges=[],this.version=0,this.uuid=Gn()}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.array=new t.array.constructor(t.array),this.count=t.count,this.stride=t.stride,this.usage=t.usage,this}copyAt(t,e,n){t*=this.stride,n*=e.stride;for(let s=0,r=this.stride;s<r;s++)this.array[t+s]=e.array[n+s];return this}set(t,e=0){return this.array.set(t,e),this}clone(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Gn()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const e=new this.array.constructor(t.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(e,this.stride);return n.setUsage(this.usage),n}onUpload(t){return this.onUploadCallback=t,this}toJSON(t){return t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Gn()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}}const Fe=new L;class Rr{constructor(t,e,n,s=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=t,this.itemSize=e,this.offset=n,this.normalized=s}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(t){this.data.needsUpdate=t}applyMatrix4(t){for(let e=0,n=this.data.count;e<n;e++)Fe.fromBufferAttribute(this,e),Fe.applyMatrix4(t),this.setXYZ(e,Fe.x,Fe.y,Fe.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)Fe.fromBufferAttribute(this,e),Fe.applyNormalMatrix(t),this.setXYZ(e,Fe.x,Fe.y,Fe.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)Fe.fromBufferAttribute(this,e),Fe.transformDirection(t),this.setXYZ(e,Fe.x,Fe.y,Fe.z);return this}getComponent(t,e){let n=this.array[t*this.data.stride+this.offset+e];return this.normalized&&(n=un(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=le(n,this.array)),this.data.array[t*this.data.stride+this.offset+e]=n,this}setX(t,e){return this.normalized&&(e=le(e,this.array)),this.data.array[t*this.data.stride+this.offset]=e,this}setY(t,e){return this.normalized&&(e=le(e,this.array)),this.data.array[t*this.data.stride+this.offset+1]=e,this}setZ(t,e){return this.normalized&&(e=le(e,this.array)),this.data.array[t*this.data.stride+this.offset+2]=e,this}setW(t,e){return this.normalized&&(e=le(e,this.array)),this.data.array[t*this.data.stride+this.offset+3]=e,this}getX(t){let e=this.data.array[t*this.data.stride+this.offset];return this.normalized&&(e=un(e,this.array)),e}getY(t){let e=this.data.array[t*this.data.stride+this.offset+1];return this.normalized&&(e=un(e,this.array)),e}getZ(t){let e=this.data.array[t*this.data.stride+this.offset+2];return this.normalized&&(e=un(e,this.array)),e}getW(t){let e=this.data.array[t*this.data.stride+this.offset+3];return this.normalized&&(e=un(e,this.array)),e}setXY(t,e,n){return t=t*this.data.stride+this.offset,this.normalized&&(e=le(e,this.array),n=le(n,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this}setXYZ(t,e,n,s){return t=t*this.data.stride+this.offset,this.normalized&&(e=le(e,this.array),n=le(n,this.array),s=le(s,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=s,this}setXYZW(t,e,n,s,r){return t=t*this.data.stride+this.offset,this.normalized&&(e=le(e,this.array),n=le(n,this.array),s=le(s,this.array),r=le(r,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=s,this.data.array[t+3]=r,this}clone(t){if(t===void 0){Ar("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");const e=[];for(let n=0;n<this.count;n++){const s=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[s+r])}return new Ne(new this.array.constructor(e),this.itemSize,this.normalized)}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new Rr(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(t){if(t===void 0){Ar("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");const e=[];for(let n=0;n<this.count;n++){const s=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[s+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:e,normalized:this.normalized}}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.toJSON(t)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}let pd=0;class pi extends Qi{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:pd++}),this.uuid=Gn(),this.name="",this.type="Material",this.blending=Gi,this.side=kn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Ga,this.blendDst=Ha,this.blendEquation=ni,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Nt(0,0,0),this.blendAlpha=0,this.depthFunc=ki,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Lc,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=_i,this.stencilZFail=_i,this.stencilZPass=_i,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(const e in t){const n=t[e];if(n===void 0){zt(`Material: parameter '${e}' has value of undefined.`);continue}const s=this[e];if(s===void 0){zt(`Material: '${e}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[e]=n}}toJSON(t){const e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});const n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==Gi&&(n.blending=this.blending),this.side!==kn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==Ga&&(n.blendSrc=this.blendSrc),this.blendDst!==Ha&&(n.blendDst=this.blendDst),this.blendEquation!==ni&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==ki&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==Lc&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==_i&&(n.stencilFail=this.stencilFail),this.stencilZFail!==_i&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==_i&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){const a=[];for(const o in r){const l=r[o];delete l.metadata,a.push(l)}return a}if(e){const r=s(t.textures),a=s(t.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;const e=t.clippingPlanes;let n=null;if(e!==null){const s=e.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}}class Uu extends pi{constructor(t){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new Nt(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.rotation=t.rotation,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}}let Ri;const os=new L,Ci=new L,Pi=new L,Di=new Ft,cs=new Ft,Nu=new te,Ws=new L,ls=new L,Xs=new L,Yc=new Ft,ma=new Ft,qc=new Ft;class md extends xe{constructor(t=new Uu){if(super(),this.isSprite=!0,this.type="Sprite",Ri===void 0){Ri=new ve;const e=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new dd(e,5);Ri.setIndex([0,1,2,0,2,3]),Ri.setAttribute("position",new Rr(n,3,0,!1)),Ri.setAttribute("uv",new Rr(n,2,3,!1))}this.geometry=Ri,this.material=t,this.center=new Ft(.5,.5),this.count=1}raycast(t,e){t.camera===null&&Jt('Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),Ci.setFromMatrixScale(this.matrixWorld),Nu.copy(t.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(t.camera.matrixWorldInverse,this.matrixWorld),Pi.setFromMatrixPosition(this.modelViewMatrix),t.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&Ci.multiplyScalar(-Pi.z);const n=this.material.rotation;let s,r;n!==0&&(r=Math.cos(n),s=Math.sin(n));const a=this.center;Ys(Ws.set(-.5,-.5,0),Pi,a,Ci,s,r),Ys(ls.set(.5,-.5,0),Pi,a,Ci,s,r),Ys(Xs.set(.5,.5,0),Pi,a,Ci,s,r),Yc.set(0,0),ma.set(1,0),qc.set(1,1);let o=t.ray.intersectTriangle(Ws,ls,Xs,!1,os);if(o===null&&(Ys(ls.set(-.5,.5,0),Pi,a,Ci,s,r),ma.set(0,1),o=t.ray.intersectTriangle(Ws,Xs,ls,!1,os),o===null))return;const l=t.ray.origin.distanceTo(os);l<t.near||l>t.far||e.push({distance:l,point:os.clone(),uv:Ye.getInterpolation(os,Ws,ls,Xs,Yc,ma,qc,new Ft),face:null,object:this})}copy(t,e){return super.copy(t,e),t.center!==void 0&&this.center.copy(t.center),this.material=t.material,this}}function Ys(i,t,e,n,s,r){Di.subVectors(i,e).addScalar(.5).multiply(n),s!==void 0?(cs.x=r*Di.x-s*Di.y,cs.y=s*Di.x+r*Di.y):cs.copy(Di),i.copy(t),i.x+=cs.x,i.y+=cs.y,i.applyMatrix4(Nu)}const Sn=new L,ga=new L,qs=new L,Fn=new L,_a=new L,Ks=new L,xa=new L;class Fu{constructor(t=new L,e=new L(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,Sn)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);const n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){const e=Sn.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(Sn.copy(this.origin).addScaledVector(this.direction,e),Sn.distanceToSquared(t))}distanceSqToSegment(t,e,n,s){ga.copy(t).add(e).multiplyScalar(.5),qs.copy(e).sub(t).normalize(),Fn.copy(this.origin).sub(ga);const r=t.distanceTo(e)*.5,a=-this.direction.dot(qs),o=Fn.dot(this.direction),l=-Fn.dot(qs),c=Fn.lengthSq(),h=Math.abs(1-a*a);let f,u,m,g;if(h>0)if(f=a*l-o,u=a*o-l,g=r*h,f>=0)if(u>=-g)if(u<=g){const v=1/h;f*=v,u*=v,m=f*(f+a*u+2*o)+u*(a*f+u+2*l)+c}else u=r,f=Math.max(0,-(a*u+o)),m=-f*f+u*(u+2*l)+c;else u=-r,f=Math.max(0,-(a*u+o)),m=-f*f+u*(u+2*l)+c;else u<=-g?(f=Math.max(0,-(-a*r+o)),u=f>0?-r:Math.min(Math.max(-r,-l),r),m=-f*f+u*(u+2*l)+c):u<=g?(f=0,u=Math.min(Math.max(-r,-l),r),m=u*(u+2*l)+c):(f=Math.max(0,-(a*r+o)),u=f>0?r:Math.min(Math.max(-r,-l),r),m=-f*f+u*(u+2*l)+c);else u=a>0?-r:r,f=Math.max(0,-(a*u+o)),m=-f*f+u*(u+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,f),s&&s.copy(ga).addScaledVector(qs,u),m}intersectSphere(t,e){Sn.subVectors(t.center,this.origin);const n=Sn.dot(this.direction),s=Sn.dot(Sn)-n*n,r=t.radius*t.radius;if(s>r)return null;const a=Math.sqrt(r-s),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,e):this.at(o,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){const e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){const n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){const e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,s,r,a,o,l;const c=1/this.direction.x,h=1/this.direction.y,f=1/this.direction.z,u=this.origin;return c>=0?(n=(t.min.x-u.x)*c,s=(t.max.x-u.x)*c):(n=(t.max.x-u.x)*c,s=(t.min.x-u.x)*c),h>=0?(r=(t.min.y-u.y)*h,a=(t.max.y-u.y)*h):(r=(t.max.y-u.y)*h,a=(t.min.y-u.y)*h),n>a||r>s||((r>n||isNaN(n))&&(n=r),(a<s||isNaN(s))&&(s=a),f>=0?(o=(t.min.z-u.z)*f,l=(t.max.z-u.z)*f):(o=(t.max.z-u.z)*f,l=(t.min.z-u.z)*f),n>l||o>s)||((o>n||n!==n)&&(n=o),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,e)}intersectsBox(t){return this.intersectBox(t,Sn)!==null}intersectTriangle(t,e,n,s,r){_a.subVectors(e,t),Ks.subVectors(n,t),xa.crossVectors(_a,Ks);let a=this.direction.dot(xa),o;if(a>0){if(s)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Fn.subVectors(this.origin,t);const l=o*this.direction.dot(Ks.crossVectors(Fn,Ks));if(l<0)return null;const c=o*this.direction.dot(_a.cross(Fn));if(c<0||l+c>a)return null;const h=-o*Fn.dot(xa);return h<0?null:this.at(h/a,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class Ou extends pi{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Nt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ze,this.combine=du,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}}const Kc=new te,Zn=new Fu,$s=new ts,$c=new L,Zs=new L,js=new L,Js=new L,va=new L,Qs=new L,Zc=new L,tr=new L;class Bt extends xe{constructor(t=new ve,e=new Ou){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){const o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(t,e){const n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;e.fromBufferAttribute(s,t);const o=this.morphTargetInfluences;if(r&&o){Qs.set(0,0,0);for(let l=0,c=r.length;l<c;l++){const h=o[l],f=r[l];h!==0&&(va.fromBufferAttribute(f,t),a?Qs.addScaledVector(va,h):Qs.addScaledVector(va.sub(e),h))}e.add(Qs)}return e}raycast(t,e){const n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),$s.copy(n.boundingSphere),$s.applyMatrix4(r),Zn.copy(t.ray).recast(t.near),!($s.containsPoint(Zn.origin)===!1&&(Zn.intersectSphere($s,$c)===null||Zn.origin.distanceToSquared($c)>(t.far-t.near)**2))&&(Kc.copy(r).invert(),Zn.copy(t.ray).applyMatrix4(Kc),!(n.boundingBox!==null&&Zn.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,Zn)))}_computeIntersections(t,e,n){let s;const r=this.geometry,a=this.material,o=r.index,l=r.attributes.position,c=r.attributes.uv,h=r.attributes.uv1,f=r.attributes.normal,u=r.groups,m=r.drawRange;if(o!==null)if(Array.isArray(a))for(let g=0,v=u.length;g<v;g++){const p=u[g],d=a[p.materialIndex],x=Math.max(p.start,m.start),y=Math.min(o.count,Math.min(p.start+p.count,m.start+m.count));for(let S=x,A=y;S<A;S+=3){const b=o.getX(S),w=o.getX(S+1),_=o.getX(S+2);s=er(this,d,t,n,c,h,f,b,w,_),s&&(s.faceIndex=Math.floor(S/3),s.face.materialIndex=p.materialIndex,e.push(s))}}else{const g=Math.max(0,m.start),v=Math.min(o.count,m.start+m.count);for(let p=g,d=v;p<d;p+=3){const x=o.getX(p),y=o.getX(p+1),S=o.getX(p+2);s=er(this,a,t,n,c,h,f,x,y,S),s&&(s.faceIndex=Math.floor(p/3),e.push(s))}}else if(l!==void 0)if(Array.isArray(a))for(let g=0,v=u.length;g<v;g++){const p=u[g],d=a[p.materialIndex],x=Math.max(p.start,m.start),y=Math.min(l.count,Math.min(p.start+p.count,m.start+m.count));for(let S=x,A=y;S<A;S+=3){const b=S,w=S+1,_=S+2;s=er(this,d,t,n,c,h,f,b,w,_),s&&(s.faceIndex=Math.floor(S/3),s.face.materialIndex=p.materialIndex,e.push(s))}}else{const g=Math.max(0,m.start),v=Math.min(l.count,m.start+m.count);for(let p=g,d=v;p<d;p+=3){const x=p,y=p+1,S=p+2;s=er(this,a,t,n,c,h,f,x,y,S),s&&(s.faceIndex=Math.floor(p/3),e.push(s))}}}}function gd(i,t,e,n,s,r,a,o){let l;if(t.side===Ie?l=n.intersectTriangle(a,r,s,!0,o):l=n.intersectTriangle(s,r,a,t.side===kn,o),l===null)return null;tr.copy(o),tr.applyMatrix4(i.matrixWorld);const c=e.ray.origin.distanceTo(tr);return c<e.near||c>e.far?null:{distance:c,point:tr.clone(),object:i}}function er(i,t,e,n,s,r,a,o,l,c){i.getVertexPosition(o,Zs),i.getVertexPosition(l,js),i.getVertexPosition(c,Js);const h=gd(i,t,e,n,Zs,js,Js,Zc);if(h){const f=new L;Ye.getBarycoord(Zc,Zs,js,Js,f),s&&(h.uv=Ye.getInterpolatedAttribute(s,o,l,c,f,new Ft)),r&&(h.uv1=Ye.getInterpolatedAttribute(r,o,l,c,f,new Ft)),a&&(h.normal=Ye.getInterpolatedAttribute(a,o,l,c,f,new L),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));const u={a:o,b:l,c,normal:new L,materialIndex:0};Ye.getNormal(Zs,js,Js,u.normal),h.face=u,h.barycoord=f}return h}class nc extends Ue{constructor(t=null,e=1,n=1,s,r,a,o,l,c=Re,h=Re,f,u){super(null,a,o,l,c,h,s,r,f,u),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class jc extends Ne{constructor(t,e,n,s=1){super(t,e,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=s}copy(t){return super.copy(t),this.meshPerAttribute=t.meshPerAttribute,this}toJSON(){const t=super.toJSON();return t.meshPerAttribute=this.meshPerAttribute,t.isInstancedBufferAttribute=!0,t}}const Li=new te,Jc=new te,nr=[],Qc=new di,_d=new te,us=new Bt,hs=new ts;class _e extends Bt{constructor(t,e,n){super(t,e),this.isInstancedMesh=!0,this.instanceMatrix=new jc(new Float32Array(n*16),16),this.previousInstanceMatrix=null,this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let s=0;s<n;s++)this.setMatrixAt(s,_d)}computeBoundingBox(){const t=this.geometry,e=this.count;this.boundingBox===null&&(this.boundingBox=new di),t.boundingBox===null&&t.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,Li),Qc.copy(t.boundingBox).applyMatrix4(Li),this.boundingBox.union(Qc)}computeBoundingSphere(){const t=this.geometry,e=this.count;this.boundingSphere===null&&(this.boundingSphere=new ts),t.boundingSphere===null&&t.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,Li),hs.copy(t.boundingSphere).applyMatrix4(Li),this.boundingSphere.union(hs)}copy(t,e){return super.copy(t,e),this.instanceMatrix.copy(t.instanceMatrix),t.previousInstanceMatrix!==null&&(this.previousInstanceMatrix=t.previousInstanceMatrix.clone()),t.morphTexture!==null&&(this.morphTexture=t.morphTexture.clone()),t.instanceColor!==null&&(this.instanceColor=t.instanceColor.clone()),this.count=t.count,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}getColorAt(t,e){e.fromArray(this.instanceColor.array,t*3)}getMatrixAt(t,e){e.fromArray(this.instanceMatrix.array,t*16)}getMorphAt(t,e){const n=e.morphTargetInfluences,s=this.morphTexture.source.data.data,r=n.length+1,a=t*r+1;for(let o=0;o<n.length;o++)n[o]=s[a+o]}raycast(t,e){const n=this.matrixWorld,s=this.count;if(us.geometry=this.geometry,us.material=this.material,us.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),hs.copy(this.boundingSphere),hs.applyMatrix4(n),t.ray.intersectsSphere(hs)!==!1))for(let r=0;r<s;r++){this.getMatrixAt(r,Li),Jc.multiplyMatrices(n,Li),us.matrixWorld=Jc,us.raycast(t,nr);for(let a=0,o=nr.length;a<o;a++){const l=nr[a];l.instanceId=r,l.object=this,e.push(l)}nr.length=0}}setColorAt(t,e){this.instanceColor===null&&(this.instanceColor=new jc(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),e.toArray(this.instanceColor.array,t*3)}setMatrixAt(t,e){e.toArray(this.instanceMatrix.array,t*16)}setMorphAt(t,e){const n=e.morphTargetInfluences,s=n.length+1;this.morphTexture===null&&(this.morphTexture=new nc(new Float32Array(s*this.count),s,this.count,Ko,nn));const r=this.morphTexture.source.data.data;let a=0;for(let c=0;c<n.length;c++)a+=n[c];const o=this.geometry.morphTargetsRelative?1:1-a,l=s*t;r[l]=o,r.set(n,l+1)}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const Ma=new L,xd=new L,vd=new Ht;class ei{constructor(t=new L(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,s){return this.normal.set(t,e,n),this.constant=s,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){const s=Ma.subVectors(n,e).cross(xd.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(s,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){const t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e){const n=t.delta(Ma),s=this.normal.dot(n);if(s===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;const r=-(t.start.dot(this.normal)+this.constant)/s;return r<0||r>1?null:e.copy(t.start).addScaledVector(n,r)}intersectsLine(t){const e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){const n=e||vd.getNormalMatrix(t),s=this.coplanarPoint(Ma).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}}const jn=new ts,Md=new Ft(.5,.5),ir=new L;class ic{constructor(t=new ei,e=new ei,n=new ei,s=new ei,r=new ei,a=new ei){this.planes=[t,e,n,s,r,a]}set(t,e,n,s,r,a){const o=this.planes;return o[0].copy(t),o[1].copy(e),o[2].copy(n),o[3].copy(s),o[4].copy(r),o[5].copy(a),this}copy(t){const e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=hn,n=!1){const s=this.planes,r=t.elements,a=r[0],o=r[1],l=r[2],c=r[3],h=r[4],f=r[5],u=r[6],m=r[7],g=r[8],v=r[9],p=r[10],d=r[11],x=r[12],y=r[13],S=r[14],A=r[15];if(s[0].setComponents(c-a,m-h,d-g,A-x).normalize(),s[1].setComponents(c+a,m+h,d+g,A+x).normalize(),s[2].setComponents(c+o,m+f,d+v,A+y).normalize(),s[3].setComponents(c-o,m-f,d-v,A-y).normalize(),n)s[4].setComponents(l,u,p,S).normalize(),s[5].setComponents(c-l,m-u,d-p,A-S).normalize();else if(s[4].setComponents(c-l,m-u,d-p,A-S).normalize(),e===hn)s[5].setComponents(c+l,m+u,d+p,A+S).normalize();else if(e===As)s[5].setComponents(l,u,p,S).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),jn.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{const e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),jn.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(jn)}intersectsSprite(t){jn.center.set(0,0,0);const e=Md.distanceTo(t.center);return jn.radius=.7071067811865476+e,jn.applyMatrix4(t.matrixWorld),this.intersectsSphere(jn)}intersectsSphere(t){const e=this.planes,n=t.center,s=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(t){const e=this.planes;for(let n=0;n<6;n++){const s=e[n];if(ir.x=s.normal.x>0?t.max.x:t.min.x,ir.y=s.normal.y>0?t.max.y:t.min.y,ir.z=s.normal.z>0?t.max.z:t.min.z,s.distanceToPoint(ir)<0)return!1}return!0}containsPoint(t){const e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class Bu extends pi{constructor(t){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Nt(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.size=t.size,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}}const tl=new te,Do=new Fu,sr=new ts,rr=new L;class Sd extends xe{constructor(t=new ve,e=new Bu){super(),this.isPoints=!0,this.type="Points",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}raycast(t,e){const n=this.geometry,s=this.matrixWorld,r=t.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),sr.copy(n.boundingSphere),sr.applyMatrix4(s),sr.radius+=r,t.ray.intersectsSphere(sr)===!1)return;tl.copy(s).invert(),Do.copy(t.ray).applyMatrix4(tl);const o=r/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,f=n.attributes.position;if(c!==null){const u=Math.max(0,a.start),m=Math.min(c.count,a.start+a.count);for(let g=u,v=m;g<v;g++){const p=c.getX(g);rr.fromBufferAttribute(f,p),el(rr,p,l,s,t,e,this)}}else{const u=Math.max(0,a.start),m=Math.min(f.count,a.start+a.count);for(let g=u,v=m;g<v;g++)rr.fromBufferAttribute(f,g),el(rr,g,l,s,t,e,this)}}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){const o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}}function el(i,t,e,n,s,r,a){const o=Do.distanceSqToPoint(i);if(o<e){const l=new L;Do.closestPointToPoint(i,l),l.applyMatrix4(n);const c=s.ray.origin.distanceTo(l);if(c<s.near||c>s.far)return;r.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:t,face:null,faceIndex:null,barycoord:null,object:a})}}class zu extends Ue{constructor(t=[],e=ci,n,s,r,a,o,l,c,h){super(t,e,n,s,r,a,o,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}}class Ur extends Ue{constructor(t,e,n,s,r,a,o,l,c){super(t,e,n,s,r,a,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}}class ws extends Ue{constructor(t,e,n=pn,s,r,a,o=Re,l=Re,c,h=Cn,f=1){if(h!==Cn&&h!==ai)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const u={width:t,height:e,depth:f};super(u,s,r,a,o,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new tc(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){const e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}}class Ed extends ws{constructor(t,e=pn,n=ci,s,r,a=Re,o=Re,l,c=Cn){const h={width:t,height:t,depth:1},f=[h,h,h,h,h,h];super(t,t,e,n,s,r,a,o,l,c),this.image=f,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(t){this.image=t}}class Gu extends Ue{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}}class jt extends ve{constructor(t=1,e=1,n=1,s=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:s,heightSegments:r,depthSegments:a};const o=this;s=Math.floor(s),r=Math.floor(r),a=Math.floor(a);const l=[],c=[],h=[],f=[];let u=0,m=0;g("z","y","x",-1,-1,n,e,t,a,r,0),g("z","y","x",1,-1,n,e,-t,a,r,1),g("x","z","y",1,1,t,n,e,s,a,2),g("x","z","y",1,-1,t,n,-e,s,a,3),g("x","y","z",1,-1,t,e,n,s,r,4),g("x","y","z",-1,-1,t,e,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new se(c,3)),this.setAttribute("normal",new se(h,3)),this.setAttribute("uv",new se(f,2));function g(v,p,d,x,y,S,A,b,w,_,E){const D=S/w,P=A/_,U=S/2,I=A/2,z=b/2,F=w+1,N=_+1;let H=0,K=0;const $=new L;for(let J=0;J<N;J++){const st=J*P-I;for(let et=0;et<F;et++){const Ct=et*D-U;$[v]=Ct*x,$[p]=st*y,$[d]=z,c.push($.x,$.y,$.z),$[v]=0,$[p]=0,$[d]=b>0?1:-1,h.push($.x,$.y,$.z),f.push(et/w),f.push(1-J/_),H+=1}}for(let J=0;J<_;J++)for(let st=0;st<w;st++){const et=u+st+F*J,Ct=u+st+F*(J+1),It=u+(st+1)+F*(J+1),Kt=u+(st+1)+F*J;l.push(et,Ct,Kt),l.push(Ct,It,Kt),K+=6}o.addGroup(m,K,E),m+=K,u+=H}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new jt(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}}class sc extends ve{constructor(t=1,e=1,n=4,s=8,r=1){super(),this.type="CapsuleGeometry",this.parameters={radius:t,height:e,capSegments:n,radialSegments:s,heightSegments:r},e=Math.max(0,e),n=Math.max(1,Math.floor(n)),s=Math.max(3,Math.floor(s)),r=Math.max(1,Math.floor(r));const a=[],o=[],l=[],c=[],h=e/2,f=Math.PI/2*t,u=e,m=2*f+u,g=n*2+r,v=s+1,p=new L,d=new L;for(let x=0;x<=g;x++){let y=0,S=0,A=0,b=0;if(x<=n){const E=x/n,D=E*Math.PI/2;S=-h-t*Math.cos(D),A=t*Math.sin(D),b=-t*Math.cos(D),y=E*f}else if(x<=n+r){const E=(x-n)/r;S=-h+E*e,A=t,b=0,y=f+E*u}else{const E=(x-n-r)/n,D=E*Math.PI/2;S=h+t*Math.sin(D),A=t*Math.cos(D),b=t*Math.sin(D),y=f+u+E*f}const w=Math.max(0,Math.min(1,y/m));let _=0;x===0?_=.5/s:x===g&&(_=-.5/s);for(let E=0;E<=s;E++){const D=E/s,P=D*Math.PI*2,U=Math.sin(P),I=Math.cos(P);d.x=-A*I,d.y=S,d.z=A*U,o.push(d.x,d.y,d.z),p.set(-A*I,b,A*U),p.normalize(),l.push(p.x,p.y,p.z),c.push(D+_,w)}if(x>0){const E=(x-1)*v;for(let D=0;D<s;D++){const P=E+D,U=E+D+1,I=x*v+D,z=x*v+D+1;a.push(P,U,I),a.push(U,z,I)}}}this.setIndex(a),this.setAttribute("position",new se(o,3)),this.setAttribute("normal",new se(l,3)),this.setAttribute("uv",new se(c,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new sc(t.radius,t.height,t.capSegments,t.radialSegments,t.heightSegments)}}class qi extends ve{constructor(t=1,e=32,n=0,s=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:t,segments:e,thetaStart:n,thetaLength:s},e=Math.max(3,e);const r=[],a=[],o=[],l=[],c=new L,h=new Ft;a.push(0,0,0),o.push(0,0,1),l.push(.5,.5);for(let f=0,u=3;f<=e;f++,u+=3){const m=n+f/e*s;c.x=t*Math.cos(m),c.y=t*Math.sin(m),a.push(c.x,c.y,c.z),o.push(0,0,1),h.x=(a[u]/t+1)/2,h.y=(a[u+1]/t+1)/2,l.push(h.x,h.y)}for(let f=1;f<=e;f++)r.push(f,f+1,0);this.setIndex(r),this.setAttribute("position",new se(a,3)),this.setAttribute("normal",new se(o,3)),this.setAttribute("uv",new se(l,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new qi(t.radius,t.segments,t.thetaStart,t.thetaLength)}}class Hn extends ve{constructor(t=1,e=1,n=1,s=32,r=1,a=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:s,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:l};const c=this;s=Math.floor(s),r=Math.floor(r);const h=[],f=[],u=[],m=[];let g=0;const v=[],p=n/2;let d=0;x(),a===!1&&(t>0&&y(!0),e>0&&y(!1)),this.setIndex(h),this.setAttribute("position",new se(f,3)),this.setAttribute("normal",new se(u,3)),this.setAttribute("uv",new se(m,2));function x(){const S=new L,A=new L;let b=0;const w=(e-t)/n;for(let _=0;_<=r;_++){const E=[],D=_/r,P=D*(e-t)+t;for(let U=0;U<=s;U++){const I=U/s,z=I*l+o,F=Math.sin(z),N=Math.cos(z);A.x=P*F,A.y=-D*n+p,A.z=P*N,f.push(A.x,A.y,A.z),S.set(F,w,N).normalize(),u.push(S.x,S.y,S.z),m.push(I,1-D),E.push(g++)}v.push(E)}for(let _=0;_<s;_++)for(let E=0;E<r;E++){const D=v[E][_],P=v[E+1][_],U=v[E+1][_+1],I=v[E][_+1];(t>0||E!==0)&&(h.push(D,P,I),b+=3),(e>0||E!==r-1)&&(h.push(P,U,I),b+=3)}c.addGroup(d,b,0),d+=b}function y(S){const A=g,b=new Ft,w=new L;let _=0;const E=S===!0?t:e,D=S===!0?1:-1;for(let U=1;U<=s;U++)f.push(0,p*D,0),u.push(0,D,0),m.push(.5,.5),g++;const P=g;for(let U=0;U<=s;U++){const z=U/s*l+o,F=Math.cos(z),N=Math.sin(z);w.x=E*N,w.y=p*D,w.z=E*F,f.push(w.x,w.y,w.z),u.push(0,D,0),b.x=F*.5+.5,b.y=N*.5*D+.5,m.push(b.x,b.y),g++}for(let U=0;U<s;U++){const I=A+U,z=P+U;S===!0?h.push(z,z+1,I):h.push(z+1,z,I),_+=3}c.addGroup(d,_,S===!0?1:2),d+=_}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Hn(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}}class rc extends ve{constructor(t=[],e=[],n=1,s=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:t,indices:e,radius:n,detail:s};const r=[],a=[];o(s),c(n),h(),this.setAttribute("position",new se(r,3)),this.setAttribute("normal",new se(r.slice(),3)),this.setAttribute("uv",new se(a,2)),s===0?this.computeVertexNormals():this.normalizeNormals();function o(x){const y=new L,S=new L,A=new L;for(let b=0;b<e.length;b+=3)m(e[b+0],y),m(e[b+1],S),m(e[b+2],A),l(y,S,A,x)}function l(x,y,S,A){const b=A+1,w=[];for(let _=0;_<=b;_++){w[_]=[];const E=x.clone().lerp(S,_/b),D=y.clone().lerp(S,_/b),P=b-_;for(let U=0;U<=P;U++)U===0&&_===b?w[_][U]=E:w[_][U]=E.clone().lerp(D,U/P)}for(let _=0;_<b;_++)for(let E=0;E<2*(b-_)-1;E++){const D=Math.floor(E/2);E%2===0?(u(w[_][D+1]),u(w[_+1][D]),u(w[_][D])):(u(w[_][D+1]),u(w[_+1][D+1]),u(w[_+1][D]))}}function c(x){const y=new L;for(let S=0;S<r.length;S+=3)y.x=r[S+0],y.y=r[S+1],y.z=r[S+2],y.normalize().multiplyScalar(x),r[S+0]=y.x,r[S+1]=y.y,r[S+2]=y.z}function h(){const x=new L;for(let y=0;y<r.length;y+=3){x.x=r[y+0],x.y=r[y+1],x.z=r[y+2];const S=p(x)/2/Math.PI+.5,A=d(x)/Math.PI+.5;a.push(S,1-A)}g(),f()}function f(){for(let x=0;x<a.length;x+=6){const y=a[x+0],S=a[x+2],A=a[x+4],b=Math.max(y,S,A),w=Math.min(y,S,A);b>.9&&w<.1&&(y<.2&&(a[x+0]+=1),S<.2&&(a[x+2]+=1),A<.2&&(a[x+4]+=1))}}function u(x){r.push(x.x,x.y,x.z)}function m(x,y){const S=x*3;y.x=t[S+0],y.y=t[S+1],y.z=t[S+2]}function g(){const x=new L,y=new L,S=new L,A=new L,b=new Ft,w=new Ft,_=new Ft;for(let E=0,D=0;E<r.length;E+=9,D+=6){x.set(r[E+0],r[E+1],r[E+2]),y.set(r[E+3],r[E+4],r[E+5]),S.set(r[E+6],r[E+7],r[E+8]),b.set(a[D+0],a[D+1]),w.set(a[D+2],a[D+3]),_.set(a[D+4],a[D+5]),A.copy(x).add(y).add(S).divideScalar(3);const P=p(A);v(b,D+0,x,P),v(w,D+2,y,P),v(_,D+4,S,P)}}function v(x,y,S,A){A<0&&x.x===1&&(a[y]=x.x-1),S.x===0&&S.z===0&&(a[y]=A/2/Math.PI+.5)}function p(x){return Math.atan2(x.z,-x.x)}function d(x){return Math.atan2(-x.y,Math.sqrt(x.x*x.x+x.z*x.z))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new rc(t.vertices,t.indices,t.radius,t.detail)}}class Nr extends rc{constructor(t=1,e=0){const n=(1+Math.sqrt(5))/2,s=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(s,r,t,e),this.type="IcosahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new Nr(t.radius,t.detail)}}class es extends ve{constructor(t=1,e=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:s};const r=t/2,a=e/2,o=Math.floor(n),l=Math.floor(s),c=o+1,h=l+1,f=t/o,u=e/l,m=[],g=[],v=[],p=[];for(let d=0;d<h;d++){const x=d*u-a;for(let y=0;y<c;y++){const S=y*f-r;g.push(S,-x,0),v.push(0,0,1),p.push(y/o),p.push(1-d/l)}}for(let d=0;d<l;d++)for(let x=0;x<o;x++){const y=x+c*d,S=x+c*(d+1),A=x+1+c*(d+1),b=x+1+c*d;m.push(y,S,b),m.push(S,A,b)}this.setIndex(m),this.setAttribute("position",new se(g,3)),this.setAttribute("normal",new se(v,3)),this.setAttribute("uv",new se(p,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new es(t.width,t.height,t.widthSegments,t.heightSegments)}}class Fr extends ve{constructor(t=.5,e=1,n=32,s=1,r=0,a=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:t,outerRadius:e,thetaSegments:n,phiSegments:s,thetaStart:r,thetaLength:a},n=Math.max(3,n),s=Math.max(1,s);const o=[],l=[],c=[],h=[];let f=t;const u=(e-t)/s,m=new L,g=new Ft;for(let v=0;v<=s;v++){for(let p=0;p<=n;p++){const d=r+p/n*a;m.x=f*Math.cos(d),m.y=f*Math.sin(d),l.push(m.x,m.y,m.z),c.push(0,0,1),g.x=(m.x/e+1)/2,g.y=(m.y/e+1)/2,h.push(g.x,g.y)}f+=u}for(let v=0;v<s;v++){const p=v*(n+1);for(let d=0;d<n;d++){const x=d+p,y=x,S=x+n+1,A=x+n+2,b=x+1;o.push(y,S,b),o.push(S,A,b)}}this.setIndex(o),this.setAttribute("position",new se(l,3)),this.setAttribute("normal",new se(c,3)),this.setAttribute("uv",new se(h,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Fr(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}}class Ds extends ve{constructor(t=1,e=32,n=16,s=0,r=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:s,phiLength:r,thetaStart:a,thetaLength:o},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));const l=Math.min(a+o,Math.PI);let c=0;const h=[],f=new L,u=new L,m=[],g=[],v=[],p=[];for(let d=0;d<=n;d++){const x=[],y=d/n;let S=0;d===0&&a===0?S=.5/e:d===n&&l===Math.PI&&(S=-.5/e);for(let A=0;A<=e;A++){const b=A/e;f.x=-t*Math.cos(s+b*r)*Math.sin(a+y*o),f.y=t*Math.cos(a+y*o),f.z=t*Math.sin(s+b*r)*Math.sin(a+y*o),g.push(f.x,f.y,f.z),u.copy(f).normalize(),v.push(u.x,u.y,u.z),p.push(b+S,1-y),x.push(c++)}h.push(x)}for(let d=0;d<n;d++)for(let x=0;x<e;x++){const y=h[d][x+1],S=h[d][x],A=h[d+1][x],b=h[d+1][x+1];(d!==0||a>0)&&m.push(y,S,b),(d!==n-1||l<Math.PI)&&m.push(S,A,b)}this.setIndex(m),this.setAttribute("position",new se(g,3)),this.setAttribute("normal",new se(v,3)),this.setAttribute("uv",new se(p,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Ds(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}}class ac extends ve{constructor(t=1,e=.4,n=12,s=48,r=Math.PI*2,a=0,o=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:t,tube:e,radialSegments:n,tubularSegments:s,arc:r,thetaStart:a,thetaLength:o},n=Math.floor(n),s=Math.floor(s);const l=[],c=[],h=[],f=[],u=new L,m=new L,g=new L;for(let v=0;v<=n;v++){const p=a+v/n*o;for(let d=0;d<=s;d++){const x=d/s*r;m.x=(t+e*Math.cos(p))*Math.cos(x),m.y=(t+e*Math.cos(p))*Math.sin(x),m.z=e*Math.sin(p),c.push(m.x,m.y,m.z),u.x=t*Math.cos(x),u.y=t*Math.sin(x),g.subVectors(m,u).normalize(),h.push(g.x,g.y,g.z),f.push(d/s),f.push(v/n)}}for(let v=1;v<=n;v++)for(let p=1;p<=s;p++){const d=(s+1)*v+p-1,x=(s+1)*(v-1)+p-1,y=(s+1)*(v-1)+p,S=(s+1)*v+p;l.push(d,x,S),l.push(x,y,S)}this.setIndex(l),this.setAttribute("position",new se(c,3)),this.setAttribute("normal",new se(h,3)),this.setAttribute("uv",new se(f,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new ac(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc)}}function Ki(i){const t={};for(const e in i){t[e]={};for(const n in i[e]){const s=i[e][n];s&&(s.isColor||s.isMatrix3||s.isMatrix4||s.isVector2||s.isVector3||s.isVector4||s.isTexture||s.isQuaternion)?s.isRenderTargetTexture?(zt("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=s.clone():Array.isArray(s)?t[e][n]=s.slice():t[e][n]=s}}return t}function Oe(i){const t={};for(let e=0;e<i.length;e++){const n=Ki(i[e]);for(const s in n)t[s]=n[s]}return t}function yd(i){const t=[];for(let e=0;e<i.length;e++)t.push(i[e].clone());return t}function Hu(i){const t=i.getRenderTarget();return t===null?i.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:Qt.workingColorSpace}const bd={clone:Ki,merge:Oe};var Td=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Ad=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class sn extends pi{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Td,this.fragmentShader=Ad,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=Ki(t.uniforms),this.uniformsGroups=yd(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this.defaultAttributeValues=Object.assign({},t.defaultAttributeValues),this.index0AttributeName=t.index0AttributeName,this.uniformsNeedUpdate=t.uniformsNeedUpdate,this}toJSON(t){const e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(const s in this.uniforms){const a=this.uniforms[s].value;a&&a.isTexture?e.uniforms[s]={type:"t",value:a.toJSON(t).uuid}:a&&a.isColor?e.uniforms[s]={type:"c",value:a.getHex()}:a&&a.isVector2?e.uniforms[s]={type:"v2",value:a.toArray()}:a&&a.isVector3?e.uniforms[s]={type:"v3",value:a.toArray()}:a&&a.isVector4?e.uniforms[s]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?e.uniforms[s]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?e.uniforms[s]={type:"m4",value:a.toArray()}:e.uniforms[s]={value:a}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;const n={};for(const s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}}class wd extends sn{constructor(t){super(t),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class kt extends pi{constructor(t){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Nt(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Nt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=wu,this.normalScale=new Ft(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new ze,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}}class Rd extends pi{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=Of,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}}class Cd extends pi{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}}class oc extends xe{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new Nt(t),this.intensity=e}dispose(){this.dispatchEvent({type:"dispose"})}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){const e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,e}}class Pd extends oc{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(xe.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Nt(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}toJSON(t){const e=super.toJSON(t);return e.object.groundColor=this.groundColor.getHex(),e}}const Sa=new te,nl=new L,il=new L;class Vu{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Ft(512,512),this.mapType=We,this.map=null,this.mapPass=null,this.matrix=new te,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new ic,this._frameExtents=new Ft(1,1),this._viewportCount=1,this._viewports=[new pe(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(t){const e=this.camera,n=this.matrix;nl.setFromMatrixPosition(t.matrixWorld),e.position.copy(nl),il.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(il),e.updateMatrixWorld(),Sa.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Sa,e.coordinateSystem,e.reversedDepth),e.coordinateSystem===As||e.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Sa)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.autoUpdate=t.autoUpdate,this.needsUpdate=t.needsUpdate,this.normalBias=t.normalBias,this.blurSamples=t.blurSamples,this.mapSize.copy(t.mapSize),this.biasNode=t.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){const t={};return this.intensity!==1&&(t.intensity=this.intensity),this.bias!==0&&(t.bias=this.bias),this.normalBias!==0&&(t.normalBias=this.normalBias),this.radius!==1&&(t.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(t.mapSize=this.mapSize.toArray()),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}}const ar=new L,or=new Ze,an=new L;class ku extends xe{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new te,this.projectionMatrix=new te,this.projectionMatrixInverse=new te,this.coordinateSystem=hn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorld.decompose(ar,or,an),an.x===1&&an.y===1&&an.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(ar,or,an.set(1,1,1)).invert()}updateWorldMatrix(t,e){super.updateWorldMatrix(t,e),this.matrixWorld.decompose(ar,or,an),an.x===1&&an.y===1&&an.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(ar,or,an.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}const On=new L,sl=new Ft,rl=new Ft;class ke extends ku{constructor(t=50,e=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){const e=.5*this.getFilmHeight()/t;this.fov=Po*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){const t=Math.tan(Zr*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Po*2*Math.atan(Math.tan(Zr*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){On.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(On.x,On.y).multiplyScalar(-t/On.z),On.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(On.x,On.y).multiplyScalar(-t/On.z)}getViewSize(t,e){return this.getViewBounds(t,sl,rl),e.subVectors(rl,sl)}setViewOffset(t,e,n,s,r,a){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=this.near;let e=t*Math.tan(Zr*.5*this.fov)/this.zoom,n=2*e,s=this.aspect*n,r=-.5*s;const a=this.view;if(this.view!==null&&this.view.enabled){const l=a.fullWidth,c=a.fullHeight;r+=a.offsetX*s/l,e-=a.offsetY*n/c,s*=a.width/l,n*=a.height/c}const o=this.filmOffset;o!==0&&(r+=t*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}}class Dd extends Vu{constructor(){super(new ke(90,1,.5,500)),this.isPointLightShadow=!0}}class cc extends oc{constructor(t,e,n=0,s=2){super(t,e),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=s,this.shadow=new Dd}get power(){return this.intensity*4*Math.PI}set power(t){this.intensity=t/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.decay=t.decay,this.shadow=t.shadow.clone(),this}toJSON(t){const e=super.toJSON(t);return e.object.distance=this.distance,e.object.decay=this.decay,e.object.shadow=this.shadow.toJSON(),e}}class lc extends ku{constructor(t=-1,e=1,n=1,s=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=s,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,s,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2;let r=n-t,a=n+t,o=s+e,l=s-e;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,a=r+c*this.view.width,o-=h*this.view.offsetY,l=o-h*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}}class Ld extends Vu{constructor(){super(new lc(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class al extends oc{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(xe.DEFAULT_UP),this.updateMatrix(),this.target=new xe,this.shadow=new Ld}dispose(){super.dispose(),this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}toJSON(t){const e=super.toJSON(t);return e.object.shadow=this.shadow.toJSON(),e.object.target=this.target.uuid,e}}const Ii=-90,Ui=1;class Id extends xe{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const s=new ke(Ii,Ui,t,e);s.layers=this.layers,this.add(s);const r=new ke(Ii,Ui,t,e);r.layers=this.layers,this.add(r);const a=new ke(Ii,Ui,t,e);a.layers=this.layers,this.add(a);const o=new ke(Ii,Ui,t,e);o.layers=this.layers,this.add(o);const l=new ke(Ii,Ui,t,e);l.layers=this.layers,this.add(l);const c=new ke(Ii,Ui,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const t=this.coordinateSystem,e=this.children.concat(),[n,s,r,a,o,l]=e;for(const c of e)this.remove(c);if(t===hn)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===As)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(const c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());const[r,a,o,l,c,h]=this.children,f=t.getRenderTarget(),u=t.getActiveCubeFace(),m=t.getActiveMipmapLevel(),g=t.xr.enabled;t.xr.enabled=!1;const v=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let p=!1;t.isWebGLRenderer===!0?p=t.state.buffers.depth.getReversed():p=t.reversedDepthBuffer,t.setRenderTarget(n,0,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,r),t.setRenderTarget(n,1,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,a),t.setRenderTarget(n,2,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,o),t.setRenderTarget(n,3,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,l),t.setRenderTarget(n,4,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,c),n.texture.generateMipmaps=v,t.setRenderTarget(n,5,s),p&&t.autoClear===!1&&t.clearDepth(),t.render(e,h),t.setRenderTarget(f,u,m),t.xr.enabled=g,n.texture.needsPMREMUpdate=!0}}class Ud extends ke{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t}}class Uv{constructor(){this._previousTime=0,this._currentTime=0,this._startTime=performance.now(),this._delta=0,this._elapsed=0,this._timescale=1,this._document=null,this._pageVisibilityHandler=null}connect(t){this._document=t,t.hidden!==void 0&&(this._pageVisibilityHandler=Nd.bind(this),t.addEventListener("visibilitychange",this._pageVisibilityHandler,!1))}disconnect(){this._pageVisibilityHandler!==null&&(this._document.removeEventListener("visibilitychange",this._pageVisibilityHandler),this._pageVisibilityHandler=null),this._document=null}getDelta(){return this._delta/1e3}getElapsed(){return this._elapsed/1e3}getTimescale(){return this._timescale}setTimescale(t){return this._timescale=t,this}reset(){return this._currentTime=performance.now()-this._startTime,this}dispose(){this.disconnect()}update(t){return this._pageVisibilityHandler!==null&&this._document.hidden===!0?this._delta=0:(this._previousTime=this._currentTime,this._currentTime=(t!==void 0?t:performance.now())-this._startTime,this._delta=(this._currentTime-this._previousTime)*this._timescale,this._elapsed+=this._delta),this}}function Nd(){this._document.hidden===!1&&this.reset()}function ol(i,t,e,n){const s=Fd(n);switch(e){case Tu:return i*t;case Ko:return i*t/s.components*s.byteLength;case $o:return i*t/s.components*s.byteLength;case Xi:return i*t*2/s.components*s.byteLength;case Zo:return i*t*2/s.components*s.byteLength;case Au:return i*t*3/s.components*s.byteLength;case qe:return i*t*4/s.components*s.byteLength;case jo:return i*t*4/s.components*s.byteLength;case _r:case xr:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case vr:case Mr:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case ja:case Qa:return Math.max(i,16)*Math.max(t,8)/4;case Za:case Ja:return Math.max(i,8)*Math.max(t,8)/2;case to:case eo:case io:case so:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case no:case ro:case ao:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case oo:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case co:return Math.floor((i+4)/5)*Math.floor((t+3)/4)*16;case lo:return Math.floor((i+4)/5)*Math.floor((t+4)/5)*16;case uo:return Math.floor((i+5)/6)*Math.floor((t+4)/5)*16;case ho:return Math.floor((i+5)/6)*Math.floor((t+5)/6)*16;case fo:return Math.floor((i+7)/8)*Math.floor((t+4)/5)*16;case po:return Math.floor((i+7)/8)*Math.floor((t+5)/6)*16;case mo:return Math.floor((i+7)/8)*Math.floor((t+7)/8)*16;case go:return Math.floor((i+9)/10)*Math.floor((t+4)/5)*16;case _o:return Math.floor((i+9)/10)*Math.floor((t+5)/6)*16;case xo:return Math.floor((i+9)/10)*Math.floor((t+7)/8)*16;case vo:return Math.floor((i+9)/10)*Math.floor((t+9)/10)*16;case Mo:return Math.floor((i+11)/12)*Math.floor((t+9)/10)*16;case So:return Math.floor((i+11)/12)*Math.floor((t+11)/12)*16;case Eo:case yo:case bo:return Math.ceil(i/4)*Math.ceil(t/4)*16;case To:case Ao:return Math.ceil(i/4)*Math.ceil(t/4)*8;case wo:case Ro:return Math.ceil(i/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function Fd(i){switch(i){case We:case Su:return{byteLength:1,components:1};case bs:case Eu:case Rn:return{byteLength:2,components:1};case Yo:case qo:return{byteLength:2,components:4};case pn:case Xo:case nn:return{byteLength:4,components:1};case yu:case bu:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:ko}}));typeof window<"u"&&(window.__THREE__?zt("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=ko);function Wu(){let i=null,t=!1,e=null,n=null;function s(r,a){e(r,a),n=i.requestAnimationFrame(s)}return{start:function(){t!==!0&&e!==null&&(n=i.requestAnimationFrame(s),t=!0)},stop:function(){i.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){i=r}}}function Od(i){const t=new WeakMap;function e(o,l){const c=o.array,h=o.usage,f=c.byteLength,u=i.createBuffer();i.bindBuffer(l,u),i.bufferData(l,c,h),o.onUploadCallback();let m;if(c instanceof Float32Array)m=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)m=i.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?m=i.HALF_FLOAT:m=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)m=i.SHORT;else if(c instanceof Uint32Array)m=i.UNSIGNED_INT;else if(c instanceof Int32Array)m=i.INT;else if(c instanceof Int8Array)m=i.BYTE;else if(c instanceof Uint8Array)m=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)m=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:u,type:m,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:f}}function n(o,l,c){const h=l.array,f=l.updateRanges;if(i.bindBuffer(c,o),f.length===0)i.bufferSubData(c,0,h);else{f.sort((m,g)=>m.start-g.start);let u=0;for(let m=1;m<f.length;m++){const g=f[u],v=f[m];v.start<=g.start+g.count+1?g.count=Math.max(g.count,v.start+v.count-g.start):(++u,f[u]=v)}f.length=u+1;for(let m=0,g=f.length;m<g;m++){const v=f[m];i.bufferSubData(c,v.start*h.BYTES_PER_ELEMENT,h,v.start,v.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(o){return o.isInterleavedBufferAttribute&&(o=o.data),t.get(o)}function r(o){o.isInterleavedBufferAttribute&&(o=o.data);const l=t.get(o);l&&(i.deleteBuffer(l.buffer),t.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){const h=t.get(o);(!h||h.version<o.version)&&t.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}const c=t.get(o);if(c===void 0)t.set(o,e(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,o,l),c.version=o.version}}return{get:s,remove:r,update:a}}var Bd=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,zd=`#ifdef USE_ALPHAHASH
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
#endif`,Gd=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Hd=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Vd=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,kd=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Wd=`#ifdef USE_AOMAP
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
#endif`,Xd=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Yd=`#ifdef USE_BATCHING
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
#endif`,qd=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Kd=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,$d=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Zd=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,jd=`#ifdef USE_IRIDESCENCE
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
#endif`,Jd=`#ifdef USE_BUMPMAP
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
#endif`,Qd=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,tp=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,ep=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,np=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,ip=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,sp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,rp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,ap=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
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
#endif`,op=`#define PI 3.141592653589793
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
} // validated`,cp=`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,lp=`vec3 transformedNormal = objectNormal;
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
#endif`,up=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,hp=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,fp=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,dp=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,pp="gl_FragColor = linearToOutputTexel( gl_FragColor );",mp=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,gp=`#ifdef USE_ENVMAP
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
#endif`,_p=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,xp=`#ifdef USE_ENVMAP
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
#endif`,vp=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Mp=`#ifdef USE_ENVMAP
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
#endif`,Sp=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Ep=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,yp=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,bp=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Tp=`#ifdef USE_GRADIENTMAP
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
}`,Ap=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,wp=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Rp=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Cp=`uniform bool receiveShadow;
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
#endif`,Pp=`#ifdef USE_ENVMAP
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
#endif`,Dp=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Lp=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Ip=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Up=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Np=`PhysicalMaterial material;
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
#endif`,Fp=`uniform sampler2D dfgLUT;
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
}`,Op=`
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
#endif`,Bp=`#if defined( RE_IndirectDiffuse )
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
#endif`,zp=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Gp=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Hp=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Vp=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,kp=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Wp=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Xp=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Yp=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,qp=`#if defined( USE_POINTS_UV )
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
#endif`,Kp=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,$p=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Zp=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,jp=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Jp=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Qp=`#ifdef USE_MORPHTARGETS
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
#endif`,tm=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,em=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,nm=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,im=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,sm=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,rm=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,am=`#ifdef USE_NORMALMAP
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
#endif`,om=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,cm=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,lm=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,um=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,hm=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,fm=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,dm=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,pm=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,mm=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,gm=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,_m=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,xm=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,vm=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,Mm=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,Sm=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
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
#endif`,Em=`float getShadowMask() {
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
}`,ym=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,bm=`#ifdef USE_SKINNING
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
#endif`,Tm=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,Am=`#ifdef USE_SKINNING
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
#endif`,wm=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Rm=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Cm=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Pm=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,Dm=`#ifdef USE_TRANSMISSION
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
#endif`,Lm=`#ifdef USE_TRANSMISSION
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
#endif`,Im=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Um=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Nm=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Fm=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const Om=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Bm=`uniform sampler2D t2D;
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
}`,zm=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Gm=`#ifdef ENVMAP_TYPE_CUBE
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
}`,Hm=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Vm=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,km=`#include <common>
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
}`,Wm=`#if DEPTH_PACKING == 3200
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
}`,Xm=`#define DISTANCE
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
}`,Ym=`#define DISTANCE
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
}`,qm=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,Km=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,$m=`uniform float scale;
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
}`,Zm=`uniform vec3 diffuse;
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
}`,jm=`#include <common>
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
}`,Jm=`uniform vec3 diffuse;
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
}`,Qm=`#define LAMBERT
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
}`,t0=`#define LAMBERT
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
}`,e0=`#define MATCAP
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
}`,n0=`#define MATCAP
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
}`,i0=`#define NORMAL
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
}`,s0=`#define NORMAL
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
}`,r0=`#define PHONG
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
}`,a0=`#define PHONG
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
}`,o0=`#define STANDARD
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
}`,c0=`#define STANDARD
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
}`,l0=`#define TOON
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
}`,u0=`#define TOON
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
}`,h0=`uniform float size;
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
}`,f0=`uniform vec3 diffuse;
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
}`,d0=`#include <common>
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
}`,p0=`uniform vec3 color;
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
}`,m0=`uniform float rotation;
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
}`,g0=`uniform vec3 diffuse;
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
}`,Vt={alphahash_fragment:Bd,alphahash_pars_fragment:zd,alphamap_fragment:Gd,alphamap_pars_fragment:Hd,alphatest_fragment:Vd,alphatest_pars_fragment:kd,aomap_fragment:Wd,aomap_pars_fragment:Xd,batching_pars_vertex:Yd,batching_vertex:qd,begin_vertex:Kd,beginnormal_vertex:$d,bsdfs:Zd,iridescence_fragment:jd,bumpmap_pars_fragment:Jd,clipping_planes_fragment:Qd,clipping_planes_pars_fragment:tp,clipping_planes_pars_vertex:ep,clipping_planes_vertex:np,color_fragment:ip,color_pars_fragment:sp,color_pars_vertex:rp,color_vertex:ap,common:op,cube_uv_reflection_fragment:cp,defaultnormal_vertex:lp,displacementmap_pars_vertex:up,displacementmap_vertex:hp,emissivemap_fragment:fp,emissivemap_pars_fragment:dp,colorspace_fragment:pp,colorspace_pars_fragment:mp,envmap_fragment:gp,envmap_common_pars_fragment:_p,envmap_pars_fragment:xp,envmap_pars_vertex:vp,envmap_physical_pars_fragment:Pp,envmap_vertex:Mp,fog_vertex:Sp,fog_pars_vertex:Ep,fog_fragment:yp,fog_pars_fragment:bp,gradientmap_pars_fragment:Tp,lightmap_pars_fragment:Ap,lights_lambert_fragment:wp,lights_lambert_pars_fragment:Rp,lights_pars_begin:Cp,lights_toon_fragment:Dp,lights_toon_pars_fragment:Lp,lights_phong_fragment:Ip,lights_phong_pars_fragment:Up,lights_physical_fragment:Np,lights_physical_pars_fragment:Fp,lights_fragment_begin:Op,lights_fragment_maps:Bp,lights_fragment_end:zp,logdepthbuf_fragment:Gp,logdepthbuf_pars_fragment:Hp,logdepthbuf_pars_vertex:Vp,logdepthbuf_vertex:kp,map_fragment:Wp,map_pars_fragment:Xp,map_particle_fragment:Yp,map_particle_pars_fragment:qp,metalnessmap_fragment:Kp,metalnessmap_pars_fragment:$p,morphinstance_vertex:Zp,morphcolor_vertex:jp,morphnormal_vertex:Jp,morphtarget_pars_vertex:Qp,morphtarget_vertex:tm,normal_fragment_begin:em,normal_fragment_maps:nm,normal_pars_fragment:im,normal_pars_vertex:sm,normal_vertex:rm,normalmap_pars_fragment:am,clearcoat_normal_fragment_begin:om,clearcoat_normal_fragment_maps:cm,clearcoat_pars_fragment:lm,iridescence_pars_fragment:um,opaque_fragment:hm,packing:fm,premultiplied_alpha_fragment:dm,project_vertex:pm,dithering_fragment:mm,dithering_pars_fragment:gm,roughnessmap_fragment:_m,roughnessmap_pars_fragment:xm,shadowmap_pars_fragment:vm,shadowmap_pars_vertex:Mm,shadowmap_vertex:Sm,shadowmask_pars_fragment:Em,skinbase_vertex:ym,skinning_pars_vertex:bm,skinning_vertex:Tm,skinnormal_vertex:Am,specularmap_fragment:wm,specularmap_pars_fragment:Rm,tonemapping_fragment:Cm,tonemapping_pars_fragment:Pm,transmission_fragment:Dm,transmission_pars_fragment:Lm,uv_pars_fragment:Im,uv_pars_vertex:Um,uv_vertex:Nm,worldpos_vertex:Fm,background_vert:Om,background_frag:Bm,backgroundCube_vert:zm,backgroundCube_frag:Gm,cube_vert:Hm,cube_frag:Vm,depth_vert:km,depth_frag:Wm,distance_vert:Xm,distance_frag:Ym,equirect_vert:qm,equirect_frag:Km,linedashed_vert:$m,linedashed_frag:Zm,meshbasic_vert:jm,meshbasic_frag:Jm,meshlambert_vert:Qm,meshlambert_frag:t0,meshmatcap_vert:e0,meshmatcap_frag:n0,meshnormal_vert:i0,meshnormal_frag:s0,meshphong_vert:r0,meshphong_frag:a0,meshphysical_vert:o0,meshphysical_frag:c0,meshtoon_vert:l0,meshtoon_frag:u0,points_vert:h0,points_frag:f0,shadow_vert:d0,shadow_frag:p0,sprite_vert:m0,sprite_frag:g0},ut={common:{diffuse:{value:new Nt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ht},alphaMap:{value:null},alphaMapTransform:{value:new Ht},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ht}},envmap:{envMap:{value:null},envMapRotation:{value:new Ht},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ht}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ht}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ht},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ht},normalScale:{value:new Ft(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ht},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ht}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ht}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ht}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Nt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Nt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ht},alphaTest:{value:0},uvTransform:{value:new Ht}},sprite:{diffuse:{value:new Nt(16777215)},opacity:{value:1},center:{value:new Ft(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ht},alphaMap:{value:null},alphaMapTransform:{value:new Ht},alphaTest:{value:0}}},ln={basic:{uniforms:Oe([ut.common,ut.specularmap,ut.envmap,ut.aomap,ut.lightmap,ut.fog]),vertexShader:Vt.meshbasic_vert,fragmentShader:Vt.meshbasic_frag},lambert:{uniforms:Oe([ut.common,ut.specularmap,ut.envmap,ut.aomap,ut.lightmap,ut.emissivemap,ut.bumpmap,ut.normalmap,ut.displacementmap,ut.fog,ut.lights,{emissive:{value:new Nt(0)},envMapIntensity:{value:1}}]),vertexShader:Vt.meshlambert_vert,fragmentShader:Vt.meshlambert_frag},phong:{uniforms:Oe([ut.common,ut.specularmap,ut.envmap,ut.aomap,ut.lightmap,ut.emissivemap,ut.bumpmap,ut.normalmap,ut.displacementmap,ut.fog,ut.lights,{emissive:{value:new Nt(0)},specular:{value:new Nt(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Vt.meshphong_vert,fragmentShader:Vt.meshphong_frag},standard:{uniforms:Oe([ut.common,ut.envmap,ut.aomap,ut.lightmap,ut.emissivemap,ut.bumpmap,ut.normalmap,ut.displacementmap,ut.roughnessmap,ut.metalnessmap,ut.fog,ut.lights,{emissive:{value:new Nt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Vt.meshphysical_vert,fragmentShader:Vt.meshphysical_frag},toon:{uniforms:Oe([ut.common,ut.aomap,ut.lightmap,ut.emissivemap,ut.bumpmap,ut.normalmap,ut.displacementmap,ut.gradientmap,ut.fog,ut.lights,{emissive:{value:new Nt(0)}}]),vertexShader:Vt.meshtoon_vert,fragmentShader:Vt.meshtoon_frag},matcap:{uniforms:Oe([ut.common,ut.bumpmap,ut.normalmap,ut.displacementmap,ut.fog,{matcap:{value:null}}]),vertexShader:Vt.meshmatcap_vert,fragmentShader:Vt.meshmatcap_frag},points:{uniforms:Oe([ut.points,ut.fog]),vertexShader:Vt.points_vert,fragmentShader:Vt.points_frag},dashed:{uniforms:Oe([ut.common,ut.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Vt.linedashed_vert,fragmentShader:Vt.linedashed_frag},depth:{uniforms:Oe([ut.common,ut.displacementmap]),vertexShader:Vt.depth_vert,fragmentShader:Vt.depth_frag},normal:{uniforms:Oe([ut.common,ut.bumpmap,ut.normalmap,ut.displacementmap,{opacity:{value:1}}]),vertexShader:Vt.meshnormal_vert,fragmentShader:Vt.meshnormal_frag},sprite:{uniforms:Oe([ut.sprite,ut.fog]),vertexShader:Vt.sprite_vert,fragmentShader:Vt.sprite_frag},background:{uniforms:{uvTransform:{value:new Ht},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Vt.background_vert,fragmentShader:Vt.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ht}},vertexShader:Vt.backgroundCube_vert,fragmentShader:Vt.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Vt.cube_vert,fragmentShader:Vt.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Vt.equirect_vert,fragmentShader:Vt.equirect_frag},distance:{uniforms:Oe([ut.common,ut.displacementmap,{referencePosition:{value:new L},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Vt.distance_vert,fragmentShader:Vt.distance_frag},shadow:{uniforms:Oe([ut.lights,ut.fog,{color:{value:new Nt(0)},opacity:{value:1}}]),vertexShader:Vt.shadow_vert,fragmentShader:Vt.shadow_frag}};ln.physical={uniforms:Oe([ln.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ht},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ht},clearcoatNormalScale:{value:new Ft(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ht},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ht},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ht},sheen:{value:0},sheenColor:{value:new Nt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ht},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ht},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ht},transmissionSamplerSize:{value:new Ft},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ht},attenuationDistance:{value:0},attenuationColor:{value:new Nt(0)},specularColor:{value:new Nt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ht},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ht},anisotropyVector:{value:new Ft},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ht}}]),vertexShader:Vt.meshphysical_vert,fragmentShader:Vt.meshphysical_frag};const cr={r:0,b:0,g:0},Jn=new ze,_0=new te;function x0(i,t,e,n,s,r){const a=new Nt(0);let o=s===!0?0:1,l,c,h=null,f=0,u=null;function m(x){let y=x.isScene===!0?x.background:null;if(y&&y.isTexture){const S=x.backgroundBlurriness>0;y=t.get(y,S)}return y}function g(x){let y=!1;const S=m(x);S===null?p(a,o):S&&S.isColor&&(p(S,1),y=!0);const A=i.xr.getEnvironmentBlendMode();A==="additive"?e.buffers.color.setClear(0,0,0,1,r):A==="alpha-blend"&&e.buffers.color.setClear(0,0,0,0,r),(i.autoClear||y)&&(e.buffers.depth.setTest(!0),e.buffers.depth.setMask(!0),e.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function v(x,y){const S=m(y);S&&(S.isCubeTexture||S.mapping===Ir)?(c===void 0&&(c=new Bt(new jt(1,1,1),new sn({name:"BackgroundCubeMaterial",uniforms:Ki(ln.backgroundCube.uniforms),vertexShader:ln.backgroundCube.vertexShader,fragmentShader:ln.backgroundCube.fragmentShader,side:Ie,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(A,b,w){this.matrixWorld.copyPosition(w.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),Jn.copy(y.backgroundRotation),Jn.x*=-1,Jn.y*=-1,Jn.z*=-1,S.isCubeTexture&&S.isRenderTargetTexture===!1&&(Jn.y*=-1,Jn.z*=-1),c.material.uniforms.envMap.value=S,c.material.uniforms.flipEnvMap.value=S.isCubeTexture&&S.isRenderTargetTexture===!1?-1:1,c.material.uniforms.backgroundBlurriness.value=y.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=y.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(_0.makeRotationFromEuler(Jn)),c.material.toneMapped=Qt.getTransfer(S.colorSpace)!==ae,(h!==S||f!==S.version||u!==i.toneMapping)&&(c.material.needsUpdate=!0,h=S,f=S.version,u=i.toneMapping),c.layers.enableAll(),x.unshift(c,c.geometry,c.material,0,0,null)):S&&S.isTexture&&(l===void 0&&(l=new Bt(new es(2,2),new sn({name:"BackgroundMaterial",uniforms:Ki(ln.background.uniforms),vertexShader:ln.background.vertexShader,fragmentShader:ln.background.fragmentShader,side:kn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=S,l.material.uniforms.backgroundIntensity.value=y.backgroundIntensity,l.material.toneMapped=Qt.getTransfer(S.colorSpace)!==ae,S.matrixAutoUpdate===!0&&S.updateMatrix(),l.material.uniforms.uvTransform.value.copy(S.matrix),(h!==S||f!==S.version||u!==i.toneMapping)&&(l.material.needsUpdate=!0,h=S,f=S.version,u=i.toneMapping),l.layers.enableAll(),x.unshift(l,l.geometry,l.material,0,0,null))}function p(x,y){x.getRGB(cr,Hu(i)),e.buffers.color.setClear(cr.r,cr.g,cr.b,y,r)}function d(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(x,y=1){a.set(x),o=y,p(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(x){o=x,p(a,o)},render:g,addToRenderList:v,dispose:d}}function v0(i,t){const e=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=u(null);let r=s,a=!1;function o(P,U,I,z,F){let N=!1;const H=f(P,z,I,U);r!==H&&(r=H,c(r.object)),N=m(P,z,I,F),N&&g(P,z,I,F),F!==null&&t.update(F,i.ELEMENT_ARRAY_BUFFER),(N||a)&&(a=!1,S(P,U,I,z),F!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,t.get(F).buffer))}function l(){return i.createVertexArray()}function c(P){return i.bindVertexArray(P)}function h(P){return i.deleteVertexArray(P)}function f(P,U,I,z){const F=z.wireframe===!0;let N=n[U.id];N===void 0&&(N={},n[U.id]=N);const H=P.isInstancedMesh===!0?P.id:0;let K=N[H];K===void 0&&(K={},N[H]=K);let $=K[I.id];$===void 0&&($={},K[I.id]=$);let J=$[F];return J===void 0&&(J=u(l()),$[F]=J),J}function u(P){const U=[],I=[],z=[];for(let F=0;F<e;F++)U[F]=0,I[F]=0,z[F]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:U,enabledAttributes:I,attributeDivisors:z,object:P,attributes:{},index:null}}function m(P,U,I,z){const F=r.attributes,N=U.attributes;let H=0;const K=I.getAttributes();for(const $ in K)if(K[$].location>=0){const st=F[$];let et=N[$];if(et===void 0&&($==="instanceMatrix"&&P.instanceMatrix&&(et=P.instanceMatrix),$==="instanceColor"&&P.instanceColor&&(et=P.instanceColor)),st===void 0||st.attribute!==et||et&&st.data!==et.data)return!0;H++}return r.attributesNum!==H||r.index!==z}function g(P,U,I,z){const F={},N=U.attributes;let H=0;const K=I.getAttributes();for(const $ in K)if(K[$].location>=0){let st=N[$];st===void 0&&($==="instanceMatrix"&&P.instanceMatrix&&(st=P.instanceMatrix),$==="instanceColor"&&P.instanceColor&&(st=P.instanceColor));const et={};et.attribute=st,st&&st.data&&(et.data=st.data),F[$]=et,H++}r.attributes=F,r.attributesNum=H,r.index=z}function v(){const P=r.newAttributes;for(let U=0,I=P.length;U<I;U++)P[U]=0}function p(P){d(P,0)}function d(P,U){const I=r.newAttributes,z=r.enabledAttributes,F=r.attributeDivisors;I[P]=1,z[P]===0&&(i.enableVertexAttribArray(P),z[P]=1),F[P]!==U&&(i.vertexAttribDivisor(P,U),F[P]=U)}function x(){const P=r.newAttributes,U=r.enabledAttributes;for(let I=0,z=U.length;I<z;I++)U[I]!==P[I]&&(i.disableVertexAttribArray(I),U[I]=0)}function y(P,U,I,z,F,N,H){H===!0?i.vertexAttribIPointer(P,U,I,F,N):i.vertexAttribPointer(P,U,I,z,F,N)}function S(P,U,I,z){v();const F=z.attributes,N=I.getAttributes(),H=U.defaultAttributeValues;for(const K in N){const $=N[K];if($.location>=0){let J=F[K];if(J===void 0&&(K==="instanceMatrix"&&P.instanceMatrix&&(J=P.instanceMatrix),K==="instanceColor"&&P.instanceColor&&(J=P.instanceColor)),J!==void 0){const st=J.normalized,et=J.itemSize,Ct=t.get(J);if(Ct===void 0)continue;const It=Ct.buffer,Kt=Ct.type,Z=Ct.bytesPerElement,it=Kt===i.INT||Kt===i.UNSIGNED_INT||J.gpuType===Xo;if(J.isInterleavedBufferAttribute){const nt=J.data,Ut=nt.stride,Tt=J.offset;if(nt.isInstancedInterleavedBuffer){for(let Pt=0;Pt<$.locationSize;Pt++)d($.location+Pt,nt.meshPerAttribute);P.isInstancedMesh!==!0&&z._maxInstanceCount===void 0&&(z._maxInstanceCount=nt.meshPerAttribute*nt.count)}else for(let Pt=0;Pt<$.locationSize;Pt++)p($.location+Pt);i.bindBuffer(i.ARRAY_BUFFER,It);for(let Pt=0;Pt<$.locationSize;Pt++)y($.location+Pt,et/$.locationSize,Kt,st,Ut*Z,(Tt+et/$.locationSize*Pt)*Z,it)}else{if(J.isInstancedBufferAttribute){for(let nt=0;nt<$.locationSize;nt++)d($.location+nt,J.meshPerAttribute);P.isInstancedMesh!==!0&&z._maxInstanceCount===void 0&&(z._maxInstanceCount=J.meshPerAttribute*J.count)}else for(let nt=0;nt<$.locationSize;nt++)p($.location+nt);i.bindBuffer(i.ARRAY_BUFFER,It);for(let nt=0;nt<$.locationSize;nt++)y($.location+nt,et/$.locationSize,Kt,st,et*Z,et/$.locationSize*nt*Z,it)}}else if(H!==void 0){const st=H[K];if(st!==void 0)switch(st.length){case 2:i.vertexAttrib2fv($.location,st);break;case 3:i.vertexAttrib3fv($.location,st);break;case 4:i.vertexAttrib4fv($.location,st);break;default:i.vertexAttrib1fv($.location,st)}}}}x()}function A(){E();for(const P in n){const U=n[P];for(const I in U){const z=U[I];for(const F in z){const N=z[F];for(const H in N)h(N[H].object),delete N[H];delete z[F]}}delete n[P]}}function b(P){if(n[P.id]===void 0)return;const U=n[P.id];for(const I in U){const z=U[I];for(const F in z){const N=z[F];for(const H in N)h(N[H].object),delete N[H];delete z[F]}}delete n[P.id]}function w(P){for(const U in n){const I=n[U];for(const z in I){const F=I[z];if(F[P.id]===void 0)continue;const N=F[P.id];for(const H in N)h(N[H].object),delete N[H];delete F[P.id]}}}function _(P){for(const U in n){const I=n[U],z=P.isInstancedMesh===!0?P.id:0,F=I[z];if(F!==void 0){for(const N in F){const H=F[N];for(const K in H)h(H[K].object),delete H[K];delete F[N]}delete I[z],Object.keys(I).length===0&&delete n[U]}}}function E(){D(),a=!0,r!==s&&(r=s,c(r.object))}function D(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:o,reset:E,resetDefaultState:D,dispose:A,releaseStatesOfGeometry:b,releaseStatesOfObject:_,releaseStatesOfProgram:w,initAttributes:v,enableAttribute:p,disableUnusedAttributes:x}}function M0(i,t,e){let n;function s(c){n=c}function r(c,h){i.drawArrays(n,c,h),e.update(h,n,1)}function a(c,h,f){f!==0&&(i.drawArraysInstanced(n,c,h,f),e.update(h,n,f))}function o(c,h,f){if(f===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,c,0,h,0,f);let m=0;for(let g=0;g<f;g++)m+=h[g];e.update(m,n,1)}function l(c,h,f,u){if(f===0)return;const m=t.get("WEBGL_multi_draw");if(m===null)for(let g=0;g<c.length;g++)a(c[g],h[g],u[g]);else{m.multiDrawArraysInstancedWEBGL(n,c,0,h,0,u,0,f);let g=0;for(let v=0;v<f;v++)g+=h[v]*u[v];e.update(g,n,1)}}this.setMode=s,this.render=r,this.renderInstances=a,this.renderMultiDraw=o,this.renderMultiDrawInstances=l}function S0(i,t,e,n){let s;function r(){if(s!==void 0)return s;if(t.has("EXT_texture_filter_anisotropic")===!0){const w=t.get("EXT_texture_filter_anisotropic");s=i.getParameter(w.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function a(w){return!(w!==qe&&n.convert(w)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(w){const _=w===Rn&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(w!==We&&n.convert(w)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&w!==nn&&!_)}function l(w){if(w==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";w="mediump"}return w==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=e.precision!==void 0?e.precision:"highp";const h=l(c);h!==c&&(zt("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);const f=e.logarithmicDepthBuffer===!0,u=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control"),m=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),g=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),v=i.getParameter(i.MAX_TEXTURE_SIZE),p=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),d=i.getParameter(i.MAX_VERTEX_ATTRIBS),x=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),y=i.getParameter(i.MAX_VARYING_VECTORS),S=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),A=i.getParameter(i.MAX_SAMPLES),b=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:f,reversedDepthBuffer:u,maxTextures:m,maxVertexTextures:g,maxTextureSize:v,maxCubemapSize:p,maxAttributes:d,maxVertexUniforms:x,maxVaryings:y,maxFragmentUniforms:S,maxSamples:A,samples:b}}function E0(i){const t=this;let e=null,n=0,s=!1,r=!1;const a=new ei,o=new Ht,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(f,u){const m=f.length!==0||u||n!==0||s;return s=u,n=f.length,m},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(f,u){e=h(f,u,0)},this.setState=function(f,u,m){const g=f.clippingPlanes,v=f.clipIntersection,p=f.clipShadows,d=i.get(f);if(!s||g===null||g.length===0||r&&!p)r?h(null):c();else{const x=r?0:n,y=x*4;let S=d.clippingState||null;l.value=S,S=h(g,u,y,m);for(let A=0;A!==y;++A)S[A]=e[A];d.clippingState=S,this.numIntersection=v?this.numPlanes:0,this.numPlanes+=x}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(f,u,m,g){const v=f!==null?f.length:0;let p=null;if(v!==0){if(p=l.value,g!==!0||p===null){const d=m+v*4,x=u.matrixWorldInverse;o.getNormalMatrix(x),(p===null||p.length<d)&&(p=new Float32Array(d));for(let y=0,S=m;y!==v;++y,S+=4)a.copy(f[y]).applyMatrix4(x,o),a.normal.toArray(p,S),p[S+3]=a.constant}l.value=p,l.needsUpdate=!0}return t.numPlanes=v,t.numIntersection=0,p}}const zn=4,cl=[.125,.215,.35,.446,.526,.582],ii=20,y0=256,fs=new lc,ll=new Nt;let Ea=null,ya=0,ba=0,Ta=!1;const b0=new L;class ul{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(t,e=0,n=.1,s=100,r={}){const{size:a=256,position:o=b0}=r;Ea=this._renderer.getRenderTarget(),ya=this._renderer.getActiveCubeFace(),ba=this._renderer.getActiveMipmapLevel(),Ta=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(t,n,s,l,o),e>0&&this._blur(l,0,0,e),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=dl(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=fl(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodMeshes.length;t++)this._lodMeshes[t].geometry.dispose()}_cleanup(t){this._renderer.setRenderTarget(Ea,ya,ba),this._renderer.xr.enabled=Ta,t.scissorTest=!1,Ni(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===ci||t.mapping===Wi?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),Ea=this._renderer.getRenderTarget(),ya=this._renderer.getActiveCubeFace(),ba=this._renderer.getActiveMipmapLevel(),Ta=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:be,minFilter:be,generateMipmaps:!1,type:Rn,format:qe,colorSpace:Yi,depthBuffer:!1},s=hl(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=hl(t,e,n);const{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=T0(r)),this._blurMaterial=w0(r,t,e),this._ggxMaterial=A0(r,t,e)}return s}_compileMaterial(t){const e=new Bt(new ve,t);this._renderer.compile(e,fs)}_sceneToCubeUV(t,e,n,s,r){const l=new ke(90,1,e,n),c=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],f=this._renderer,u=f.autoClear,m=f.toneMapping;f.getClearColor(ll),f.toneMapping=fn,f.autoClear=!1,f.state.buffers.depth.getReversed()&&(f.setRenderTarget(s),f.clearDepth(),f.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new Bt(new jt,new Ou({name:"PMREM.Background",side:Ie,depthWrite:!1,depthTest:!1})));const v=this._backgroundBox,p=v.material;let d=!1;const x=t.background;x?x.isColor&&(p.color.copy(x),t.background=null,d=!0):(p.color.copy(ll),d=!0);for(let y=0;y<6;y++){const S=y%3;S===0?(l.up.set(0,c[y],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+h[y],r.y,r.z)):S===1?(l.up.set(0,0,c[y]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+h[y],r.z)):(l.up.set(0,c[y],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+h[y]));const A=this._cubeSize;Ni(s,S*A,y>2?A:0,A,A),f.setRenderTarget(s),d&&f.render(v,l),f.render(t,l)}f.toneMapping=m,f.autoClear=u,t.background=x}_textureToCubeUV(t,e){const n=this._renderer,s=t.mapping===ci||t.mapping===Wi;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=dl()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=fl());const r=s?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=r;const o=r.uniforms;o.envMap.value=t;const l=this._cubeSize;Ni(e,0,0,3*l,2*l),n.setRenderTarget(e),n.render(a,fs)}_applyPMREM(t){const e=this._renderer,n=e.autoClear;e.autoClear=!1;const s=this._lodMeshes.length;for(let r=1;r<s;r++)this._applyGGXFilter(t,r-1,r);e.autoClear=n}_applyGGXFilter(t,e,n){const s=this._renderer,r=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;const l=a.uniforms,c=n/(this._lodMeshes.length-1),h=e/(this._lodMeshes.length-1),f=Math.sqrt(c*c-h*h),u=0+c*1.25,m=f*u,{_lodMax:g}=this,v=this._sizeLods[n],p=3*v*(n>g-zn?n-g+zn:0),d=4*(this._cubeSize-v);l.envMap.value=t.texture,l.roughness.value=m,l.mipInt.value=g-e,Ni(r,p,d,3*v,2*v),s.setRenderTarget(r),s.render(o,fs),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=g-n,Ni(t,p,d,3*v,2*v),s.setRenderTarget(t),s.render(o,fs)}_blur(t,e,n,s,r){const a=this._pingPongRenderTarget;this._halfBlur(t,a,e,n,s,"latitudinal",r),this._halfBlur(a,t,n,n,s,"longitudinal",r)}_halfBlur(t,e,n,s,r,a,o){const l=this._renderer,c=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&Jt("blur direction must be either latitudinal or longitudinal!");const h=3,f=this._lodMeshes[s];f.material=c;const u=c.uniforms,m=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*m):2*Math.PI/(2*ii-1),v=r/g,p=isFinite(r)?1+Math.floor(h*v):ii;p>ii&&zt(`sigmaRadians, ${r}, is too large and will clip, as it requested ${p} samples when the maximum is set to ${ii}`);const d=[];let x=0;for(let w=0;w<ii;++w){const _=w/v,E=Math.exp(-_*_/2);d.push(E),w===0?x+=E:w<p&&(x+=2*E)}for(let w=0;w<d.length;w++)d[w]=d[w]/x;u.envMap.value=t.texture,u.samples.value=p,u.weights.value=d,u.latitudinal.value=a==="latitudinal",o&&(u.poleAxis.value=o);const{_lodMax:y}=this;u.dTheta.value=g,u.mipInt.value=y-n;const S=this._sizeLods[s],A=3*S*(s>y-zn?s-y+zn:0),b=4*(this._cubeSize-S);Ni(e,A,b,3*S,2*S),l.setRenderTarget(e),l.render(f,fs)}}function T0(i){const t=[],e=[],n=[];let s=i;const r=i-zn+1+cl.length;for(let a=0;a<r;a++){const o=Math.pow(2,s);t.push(o);let l=1/o;a>i-zn?l=cl[a-i+zn-1]:a===0&&(l=0),e.push(l);const c=1/(o-2),h=-c,f=1+c,u=[h,h,f,h,f,f,h,h,f,f,h,f],m=6,g=6,v=3,p=2,d=1,x=new Float32Array(v*g*m),y=new Float32Array(p*g*m),S=new Float32Array(d*g*m);for(let b=0;b<m;b++){const w=b%3*2/3-1,_=b>2?0:-1,E=[w,_,0,w+2/3,_,0,w+2/3,_+1,0,w,_,0,w+2/3,_+1,0,w,_+1,0];x.set(E,v*g*b),y.set(u,p*g*b);const D=[b,b,b,b,b,b];S.set(D,d*g*b)}const A=new ve;A.setAttribute("position",new Ne(x,v)),A.setAttribute("uv",new Ne(y,p)),A.setAttribute("faceIndex",new Ne(S,d)),n.push(new Bt(A,null)),s>zn&&s--}return{lodMeshes:n,sizeLods:t,sigmas:e}}function hl(i,t,e){const n=new dn(i,t,e);return n.texture.mapping=Ir,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Ni(i,t,e,n,s){i.viewport.set(t,e,n,s),i.scissor.set(t,e,n,s)}function A0(i,t,e){return new sn({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:y0,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Or(),fragmentShader:`

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
		`,blending:Tn,depthTest:!1,depthWrite:!1})}function w0(i,t,e){const n=new Float32Array(ii),s=new L(0,1,0);return new sn({name:"SphericalGaussianBlur",defines:{n:ii,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:Or(),fragmentShader:`

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
		`,blending:Tn,depthTest:!1,depthWrite:!1})}function fl(){return new sn({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Or(),fragmentShader:`

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
		`,blending:Tn,depthTest:!1,depthWrite:!1})}function dl(){return new sn({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Or(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Tn,depthTest:!1,depthWrite:!1})}function Or(){return`

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
	`}class Xu extends dn{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;const n={width:t,height:t,depth:1},s=[n,n,n,n,n,n];this.texture=new zu(s),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},s=new jt(5,5,5),r=new sn({name:"CubemapFromEquirect",uniforms:Ki(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Ie,blending:Tn});r.uniforms.tEquirect.value=e;const a=new Bt(s,r),o=e.minFilter;return e.minFilter===ri&&(e.minFilter=be),new Id(1,10,this).update(t,a),e.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(t,e=!0,n=!0,s=!0){const r=t.getRenderTarget();for(let a=0;a<6;a++)t.setRenderTarget(this,a),t.clear(e,n,s);t.setRenderTarget(r)}}function R0(i){let t=new WeakMap,e=new WeakMap,n=null;function s(u,m=!1){return u==null?null:m?a(u):r(u)}function r(u){if(u&&u.isTexture){const m=u.mapping;if(m===gr||m===Kr)if(t.has(u)){const g=t.get(u).texture;return o(g,u.mapping)}else{const g=u.image;if(g&&g.height>0){const v=new Xu(g.height);return v.fromEquirectangularTexture(i,u),t.set(u,v),u.addEventListener("dispose",c),o(v.texture,u.mapping)}else return null}}return u}function a(u){if(u&&u.isTexture){const m=u.mapping,g=m===gr||m===Kr,v=m===ci||m===Wi;if(g||v){let p=e.get(u);const d=p!==void 0?p.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==d)return n===null&&(n=new ul(i)),p=g?n.fromEquirectangular(u,p):n.fromCubemap(u,p),p.texture.pmremVersion=u.pmremVersion,e.set(u,p),p.texture;if(p!==void 0)return p.texture;{const x=u.image;return g&&x&&x.height>0||v&&x&&l(x)?(n===null&&(n=new ul(i)),p=g?n.fromEquirectangular(u):n.fromCubemap(u),p.texture.pmremVersion=u.pmremVersion,e.set(u,p),u.addEventListener("dispose",h),p.texture):null}}}return u}function o(u,m){return m===gr?u.mapping=ci:m===Kr&&(u.mapping=Wi),u}function l(u){let m=0;const g=6;for(let v=0;v<g;v++)u[v]!==void 0&&m++;return m===g}function c(u){const m=u.target;m.removeEventListener("dispose",c);const g=t.get(m);g!==void 0&&(t.delete(m),g.dispose())}function h(u){const m=u.target;m.removeEventListener("dispose",h);const g=e.get(m);g!==void 0&&(e.delete(m),g.dispose())}function f(){t=new WeakMap,e=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:f}}function C0(i){const t={};function e(n){if(t[n]!==void 0)return t[n];const s=i.getExtension(n);return t[n]=s,s}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){const s=e(n);return s===null&&wr("WebGLRenderer: "+n+" extension not supported."),s}}}function P0(i,t,e,n){const s={},r=new WeakMap;function a(f){const u=f.target;u.index!==null&&t.remove(u.index);for(const g in u.attributes)t.remove(u.attributes[g]);u.removeEventListener("dispose",a),delete s[u.id];const m=r.get(u);m&&(t.remove(m),r.delete(u)),n.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,e.memory.geometries--}function o(f,u){return s[u.id]===!0||(u.addEventListener("dispose",a),s[u.id]=!0,e.memory.geometries++),u}function l(f){const u=f.attributes;for(const m in u)t.update(u[m],i.ARRAY_BUFFER)}function c(f){const u=[],m=f.index,g=f.attributes.position;let v=0;if(g===void 0)return;if(m!==null){const x=m.array;v=m.version;for(let y=0,S=x.length;y<S;y+=3){const A=x[y+0],b=x[y+1],w=x[y+2];u.push(A,b,b,w,w,A)}}else{const x=g.array;v=g.version;for(let y=0,S=x.length/3-1;y<S;y+=3){const A=y+0,b=y+1,w=y+2;u.push(A,b,b,w,w,A)}}const p=new(g.count>=65535?Iu:Lu)(u,1);p.version=v;const d=r.get(f);d&&t.remove(d),r.set(f,p)}function h(f){const u=r.get(f);if(u){const m=f.index;m!==null&&u.version<m.version&&c(f)}else c(f);return r.get(f)}return{get:o,update:l,getWireframeAttribute:h}}function D0(i,t,e){let n;function s(u){n=u}let r,a;function o(u){r=u.type,a=u.bytesPerElement}function l(u,m){i.drawElements(n,m,r,u*a),e.update(m,n,1)}function c(u,m,g){g!==0&&(i.drawElementsInstanced(n,m,r,u*a,g),e.update(m,n,g))}function h(u,m,g){if(g===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,m,0,r,u,0,g);let p=0;for(let d=0;d<g;d++)p+=m[d];e.update(p,n,1)}function f(u,m,g,v){if(g===0)return;const p=t.get("WEBGL_multi_draw");if(p===null)for(let d=0;d<u.length;d++)c(u[d]/a,m[d],v[d]);else{p.multiDrawElementsInstancedWEBGL(n,m,0,r,u,0,v,0,g);let d=0;for(let x=0;x<g;x++)d+=m[x]*v[x];e.update(d,n,1)}}this.setMode=s,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=h,this.renderMultiDrawInstances=f}function L0(i){const t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(e.calls++,a){case i.TRIANGLES:e.triangles+=o*(r/3);break;case i.LINES:e.lines+=o*(r/2);break;case i.LINE_STRIP:e.lines+=o*(r-1);break;case i.LINE_LOOP:e.lines+=o*r;break;case i.POINTS:e.points+=o*r;break;default:Jt("WebGLInfo: Unknown draw mode:",a);break}}function s(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:s,update:n}}function I0(i,t,e){const n=new WeakMap,s=new pe;function r(a,o,l){const c=a.morphTargetInfluences,h=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,f=h!==void 0?h.length:0;let u=n.get(o);if(u===void 0||u.count!==f){let E=function(){w.dispose(),n.delete(o),o.removeEventListener("dispose",E)};u!==void 0&&u.texture.dispose();const m=o.morphAttributes.position!==void 0,g=o.morphAttributes.normal!==void 0,v=o.morphAttributes.color!==void 0,p=o.morphAttributes.position||[],d=o.morphAttributes.normal||[],x=o.morphAttributes.color||[];let y=0;m===!0&&(y=1),g===!0&&(y=2),v===!0&&(y=3);let S=o.attributes.position.count*y,A=1;S>t.maxTextureSize&&(A=Math.ceil(S/t.maxTextureSize),S=t.maxTextureSize);const b=new Float32Array(S*A*4*f),w=new Cu(b,S,A,f);w.type=nn,w.needsUpdate=!0;const _=y*4;for(let D=0;D<f;D++){const P=p[D],U=d[D],I=x[D],z=S*A*4*D;for(let F=0;F<P.count;F++){const N=F*_;m===!0&&(s.fromBufferAttribute(P,F),b[z+N+0]=s.x,b[z+N+1]=s.y,b[z+N+2]=s.z,b[z+N+3]=0),g===!0&&(s.fromBufferAttribute(U,F),b[z+N+4]=s.x,b[z+N+5]=s.y,b[z+N+6]=s.z,b[z+N+7]=0),v===!0&&(s.fromBufferAttribute(I,F),b[z+N+8]=s.x,b[z+N+9]=s.y,b[z+N+10]=s.z,b[z+N+11]=I.itemSize===4?s.w:1)}}u={count:f,texture:w,size:new Ft(S,A)},n.set(o,u),o.addEventListener("dispose",E)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",a.morphTexture,e);else{let m=0;for(let v=0;v<c.length;v++)m+=c[v];const g=o.morphTargetsRelative?1:1-m;l.getUniforms().setValue(i,"morphTargetBaseInfluence",g),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",u.texture,e),l.getUniforms().setValue(i,"morphTargetsTextureSize",u.size)}return{update:r}}function U0(i,t,e,n,s){let r=new WeakMap;function a(c){const h=s.render.frame,f=c.geometry,u=t.get(c,f);if(r.get(u)!==h&&(t.update(u),r.set(u,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==h&&(e.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,i.ARRAY_BUFFER),r.set(c,h))),c.isSkinnedMesh){const m=c.skeleton;r.get(m)!==h&&(m.update(),r.set(m,h))}return u}function o(){r=new WeakMap}function l(c){const h=c.target;h.removeEventListener("dispose",l),n.releaseStatesOfObject(h),e.remove(h.instanceMatrix),h.instanceColor!==null&&e.remove(h.instanceColor)}return{update:a,dispose:o}}const N0={[pu]:"LINEAR_TONE_MAPPING",[mu]:"REINHARD_TONE_MAPPING",[gu]:"CINEON_TONE_MAPPING",[Wo]:"ACES_FILMIC_TONE_MAPPING",[xu]:"AGX_TONE_MAPPING",[vu]:"NEUTRAL_TONE_MAPPING",[_u]:"CUSTOM_TONE_MAPPING"};function F0(i,t,e,n,s){const r=new dn(t,e,{type:i,depthBuffer:n,stencilBuffer:s}),a=new dn(t,e,{type:Rn,depthBuffer:!1,stencilBuffer:!1}),o=new ve;o.setAttribute("position",new se([-1,3,0,-1,-1,0,3,-1,0],3)),o.setAttribute("uv",new se([0,2,0,0,2,0],2));const l=new wd({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),c=new Bt(o,l),h=new lc(-1,1,1,-1,0,1);let f=null,u=null,m=!1,g,v=null,p=[],d=!1;this.setSize=function(x,y){r.setSize(x,y),a.setSize(x,y);for(let S=0;S<p.length;S++){const A=p[S];A.setSize&&A.setSize(x,y)}},this.setEffects=function(x){p=x,d=p.length>0&&p[0].isRenderPass===!0;const y=r.width,S=r.height;for(let A=0;A<p.length;A++){const b=p[A];b.setSize&&b.setSize(y,S)}},this.begin=function(x,y){if(m||x.toneMapping===fn&&p.length===0)return!1;if(v=y,y!==null){const S=y.width,A=y.height;(r.width!==S||r.height!==A)&&this.setSize(S,A)}return d===!1&&x.setRenderTarget(r),g=x.toneMapping,x.toneMapping=fn,!0},this.hasRenderPass=function(){return d},this.end=function(x,y){x.toneMapping=g,m=!0;let S=r,A=a;for(let b=0;b<p.length;b++){const w=p[b];if(w.enabled!==!1&&(w.render(x,A,S,y),w.needsSwap!==!1)){const _=S;S=A,A=_}}if(f!==x.outputColorSpace||u!==x.toneMapping){f=x.outputColorSpace,u=x.toneMapping,l.defines={},Qt.getTransfer(f)===ae&&(l.defines.SRGB_TRANSFER="");const b=N0[u];b&&(l.defines[b]=""),l.needsUpdate=!0}l.uniforms.tDiffuse.value=S.texture,x.setRenderTarget(v),x.render(c,h),v=null,m=!1},this.isCompositing=function(){return m},this.dispose=function(){r.dispose(),a.dispose(),o.dispose(),l.dispose()}}const Yu=new Ue,Lo=new ws(1,1),qu=new Cu,Ku=new ed,$u=new zu,pl=[],ml=[],gl=new Float32Array(16),_l=new Float32Array(9),xl=new Float32Array(4);function ns(i,t,e){const n=i[0];if(n<=0||n>0)return i;const s=t*e;let r=pl[s];if(r===void 0&&(r=new Float32Array(s),pl[s]=r),t!==0){n.toArray(r,0);for(let a=1,o=0;a!==t;++a)o+=e,i[a].toArray(r,o)}return r}function Me(i,t){if(i.length!==t.length)return!1;for(let e=0,n=i.length;e<n;e++)if(i[e]!==t[e])return!1;return!0}function Se(i,t){for(let e=0,n=t.length;e<n;e++)i[e]=t[e]}function Br(i,t){let e=ml[t];e===void 0&&(e=new Int32Array(t),ml[t]=e);for(let n=0;n!==t;++n)e[n]=i.allocateTextureUnit();return e}function O0(i,t){const e=this.cache;e[0]!==t&&(i.uniform1f(this.addr,t),e[0]=t)}function B0(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Me(e,t))return;i.uniform2fv(this.addr,t),Se(e,t)}}function z0(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(i.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(Me(e,t))return;i.uniform3fv(this.addr,t),Se(e,t)}}function G0(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Me(e,t))return;i.uniform4fv(this.addr,t),Se(e,t)}}function H0(i,t){const e=this.cache,n=t.elements;if(n===void 0){if(Me(e,t))return;i.uniformMatrix2fv(this.addr,!1,t),Se(e,t)}else{if(Me(e,n))return;xl.set(n),i.uniformMatrix2fv(this.addr,!1,xl),Se(e,n)}}function V0(i,t){const e=this.cache,n=t.elements;if(n===void 0){if(Me(e,t))return;i.uniformMatrix3fv(this.addr,!1,t),Se(e,t)}else{if(Me(e,n))return;_l.set(n),i.uniformMatrix3fv(this.addr,!1,_l),Se(e,n)}}function k0(i,t){const e=this.cache,n=t.elements;if(n===void 0){if(Me(e,t))return;i.uniformMatrix4fv(this.addr,!1,t),Se(e,t)}else{if(Me(e,n))return;gl.set(n),i.uniformMatrix4fv(this.addr,!1,gl),Se(e,n)}}function W0(i,t){const e=this.cache;e[0]!==t&&(i.uniform1i(this.addr,t),e[0]=t)}function X0(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Me(e,t))return;i.uniform2iv(this.addr,t),Se(e,t)}}function Y0(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Me(e,t))return;i.uniform3iv(this.addr,t),Se(e,t)}}function q0(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Me(e,t))return;i.uniform4iv(this.addr,t),Se(e,t)}}function K0(i,t){const e=this.cache;e[0]!==t&&(i.uniform1ui(this.addr,t),e[0]=t)}function $0(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Me(e,t))return;i.uniform2uiv(this.addr,t),Se(e,t)}}function Z0(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Me(e,t))return;i.uniform3uiv(this.addr,t),Se(e,t)}}function j0(i,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Me(e,t))return;i.uniform4uiv(this.addr,t),Se(e,t)}}function J0(i,t,e){const n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(Lo.compareFunction=e.isReversedDepthBuffer()?Qo:Jo,r=Lo):r=Yu,e.setTexture2D(t||r,s)}function Q0(i,t,e){const n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture3D(t||Ku,s)}function tg(i,t,e){const n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTextureCube(t||$u,s)}function eg(i,t,e){const n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture2DArray(t||qu,s)}function ng(i){switch(i){case 5126:return O0;case 35664:return B0;case 35665:return z0;case 35666:return G0;case 35674:return H0;case 35675:return V0;case 35676:return k0;case 5124:case 35670:return W0;case 35667:case 35671:return X0;case 35668:case 35672:return Y0;case 35669:case 35673:return q0;case 5125:return K0;case 36294:return $0;case 36295:return Z0;case 36296:return j0;case 35678:case 36198:case 36298:case 36306:case 35682:return J0;case 35679:case 36299:case 36307:return Q0;case 35680:case 36300:case 36308:case 36293:return tg;case 36289:case 36303:case 36311:case 36292:return eg}}function ig(i,t){i.uniform1fv(this.addr,t)}function sg(i,t){const e=ns(t,this.size,2);i.uniform2fv(this.addr,e)}function rg(i,t){const e=ns(t,this.size,3);i.uniform3fv(this.addr,e)}function ag(i,t){const e=ns(t,this.size,4);i.uniform4fv(this.addr,e)}function og(i,t){const e=ns(t,this.size,4);i.uniformMatrix2fv(this.addr,!1,e)}function cg(i,t){const e=ns(t,this.size,9);i.uniformMatrix3fv(this.addr,!1,e)}function lg(i,t){const e=ns(t,this.size,16);i.uniformMatrix4fv(this.addr,!1,e)}function ug(i,t){i.uniform1iv(this.addr,t)}function hg(i,t){i.uniform2iv(this.addr,t)}function fg(i,t){i.uniform3iv(this.addr,t)}function dg(i,t){i.uniform4iv(this.addr,t)}function pg(i,t){i.uniform1uiv(this.addr,t)}function mg(i,t){i.uniform2uiv(this.addr,t)}function gg(i,t){i.uniform3uiv(this.addr,t)}function _g(i,t){i.uniform4uiv(this.addr,t)}function xg(i,t,e){const n=this.cache,s=t.length,r=Br(e,s);Me(n,r)||(i.uniform1iv(this.addr,r),Se(n,r));let a;this.type===i.SAMPLER_2D_SHADOW?a=Lo:a=Yu;for(let o=0;o!==s;++o)e.setTexture2D(t[o]||a,r[o])}function vg(i,t,e){const n=this.cache,s=t.length,r=Br(e,s);Me(n,r)||(i.uniform1iv(this.addr,r),Se(n,r));for(let a=0;a!==s;++a)e.setTexture3D(t[a]||Ku,r[a])}function Mg(i,t,e){const n=this.cache,s=t.length,r=Br(e,s);Me(n,r)||(i.uniform1iv(this.addr,r),Se(n,r));for(let a=0;a!==s;++a)e.setTextureCube(t[a]||$u,r[a])}function Sg(i,t,e){const n=this.cache,s=t.length,r=Br(e,s);Me(n,r)||(i.uniform1iv(this.addr,r),Se(n,r));for(let a=0;a!==s;++a)e.setTexture2DArray(t[a]||qu,r[a])}function Eg(i){switch(i){case 5126:return ig;case 35664:return sg;case 35665:return rg;case 35666:return ag;case 35674:return og;case 35675:return cg;case 35676:return lg;case 5124:case 35670:return ug;case 35667:case 35671:return hg;case 35668:case 35672:return fg;case 35669:case 35673:return dg;case 5125:return pg;case 36294:return mg;case 36295:return gg;case 36296:return _g;case 35678:case 36198:case 36298:case 36306:case 35682:return xg;case 35679:case 36299:case 36307:return vg;case 35680:case 36300:case 36308:case 36293:return Mg;case 36289:case 36303:case 36311:case 36292:return Sg}}class yg{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=ng(e.type)}}class bg{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=Eg(e.type)}}class Tg{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){const s=this.seq;for(let r=0,a=s.length;r!==a;++r){const o=s[r];o.setValue(t,e[o.id],n)}}}const Aa=/(\w+)(\])?(\[|\.)?/g;function vl(i,t){i.seq.push(t),i.map[t.id]=t}function Ag(i,t,e){const n=i.name,s=n.length;for(Aa.lastIndex=0;;){const r=Aa.exec(n),a=Aa.lastIndex;let o=r[1];const l=r[2]==="]",c=r[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===s){vl(e,c===void 0?new yg(o,i,t):new bg(o,i,t));break}else{let f=e.map[o];f===void 0&&(f=new Tg(o),vl(e,f)),e=f}}}class Sr{constructor(t,e){this.seq=[],this.map={};const n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){const o=t.getActiveUniform(e,a),l=t.getUniformLocation(e,o.name);Ag(o,l,this)}const s=[],r=[];for(const a of this.seq)a.type===t.SAMPLER_2D_SHADOW||a.type===t.SAMPLER_CUBE_SHADOW||a.type===t.SAMPLER_2D_ARRAY_SHADOW?s.push(a):r.push(a);s.length>0&&(this.seq=s.concat(r))}setValue(t,e,n,s){const r=this.map[e];r!==void 0&&r.setValue(t,n,s)}setOptional(t,e,n){const s=e[n];s!==void 0&&this.setValue(t,n,s)}static upload(t,e,n,s){for(let r=0,a=e.length;r!==a;++r){const o=e[r],l=n[o.id];l.needsUpdate!==!1&&o.setValue(t,l.value,s)}}static seqWithValue(t,e){const n=[];for(let s=0,r=t.length;s!==r;++s){const a=t[s];a.id in e&&n.push(a)}return n}}function Ml(i,t,e){const n=i.createShader(t);return i.shaderSource(n,e),i.compileShader(n),n}const wg=37297;let Rg=0;function Cg(i,t){const e=i.split(`
`),n=[],s=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let a=s;a<r;a++){const o=a+1;n.push(`${o===t?">":" "} ${o}: ${e[a]}`)}return n.join(`
`)}const Sl=new Ht;function Pg(i){Qt._getMatrix(Sl,Qt.workingColorSpace,i);const t=`mat3( ${Sl.elements.map(e=>e.toFixed(4))} )`;switch(Qt.getTransfer(i)){case br:return[t,"LinearTransferOETF"];case ae:return[t,"sRGBTransferOETF"];default:return zt("WebGLProgram: Unsupported color space: ",i),[t,"LinearTransferOETF"]}}function El(i,t,e){const n=i.getShaderParameter(t,i.COMPILE_STATUS),r=(i.getShaderInfoLog(t)||"").trim();if(n&&r==="")return"";const a=/ERROR: 0:(\d+)/.exec(r);if(a){const o=parseInt(a[1]);return e.toUpperCase()+`

`+r+`

`+Cg(i.getShaderSource(t),o)}else return r}function Dg(i,t){const e=Pg(t);return[`vec4 ${i}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}const Lg={[pu]:"Linear",[mu]:"Reinhard",[gu]:"Cineon",[Wo]:"ACESFilmic",[xu]:"AgX",[vu]:"Neutral",[_u]:"Custom"};function Ig(i,t){const e=Lg[t];return e===void 0?(zt("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}const lr=new L;function Ug(){Qt.getLuminanceCoefficients(lr);const i=lr.x.toFixed(4),t=lr.y.toFixed(4),e=lr.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Ng(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(vs).join(`
`)}function Fg(i){const t=[];for(const e in i){const n=i[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function Og(i,t){const e={},n=i.getProgramParameter(t,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){const r=i.getActiveAttrib(t,s),a=r.name;let o=1;r.type===i.FLOAT_MAT2&&(o=2),r.type===i.FLOAT_MAT3&&(o=3),r.type===i.FLOAT_MAT4&&(o=4),e[a]={type:r.type,location:i.getAttribLocation(t,a),locationSize:o}}return e}function vs(i){return i!==""}function yl(i,t){const e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function bl(i,t){return i.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}const Bg=/^[ \t]*#include +<([\w\d./]+)>/gm;function Io(i){return i.replace(Bg,Gg)}const zg=new Map;function Gg(i,t){let e=Vt[t];if(e===void 0){const n=zg.get(t);if(n!==void 0)e=Vt[n],zt('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("Can not resolve #include <"+t+">")}return Io(e)}const Hg=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Tl(i){return i.replace(Hg,Vg)}function Vg(i,t,e,n){let s="";for(let r=parseInt(t);r<parseInt(e);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function Al(i){let t=`precision ${i.precision} float;
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
	`;return i.precision==="highp"?t+=`
#define HIGH_PRECISION`:i.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}const kg={[mr]:"SHADOWMAP_TYPE_PCF",[xs]:"SHADOWMAP_TYPE_VSM"};function Wg(i){return kg[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const Xg={[ci]:"ENVMAP_TYPE_CUBE",[Wi]:"ENVMAP_TYPE_CUBE",[Ir]:"ENVMAP_TYPE_CUBE_UV"};function Yg(i){return i.envMap===!1?"ENVMAP_TYPE_CUBE":Xg[i.envMapMode]||"ENVMAP_TYPE_CUBE"}const qg={[Wi]:"ENVMAP_MODE_REFRACTION"};function Kg(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":qg[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}const $g={[du]:"ENVMAP_BLENDING_MULTIPLY",[Uf]:"ENVMAP_BLENDING_MIX",[Nf]:"ENVMAP_BLENDING_ADD"};function Zg(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":$g[i.combine]||"ENVMAP_BLENDING_NONE"}function jg(i){const t=i.envMapCubeUVHeight;if(t===null)return null;const e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),112)),texelHeight:n,maxMip:e}}function Jg(i,t,e,n){const s=i.getContext(),r=e.defines;let a=e.vertexShader,o=e.fragmentShader;const l=Wg(e),c=Yg(e),h=Kg(e),f=Zg(e),u=jg(e),m=Ng(e),g=Fg(r),v=s.createProgram();let p,d,x=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(p=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(vs).join(`
`),p.length>0&&(p+=`
`),d=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(vs).join(`
`),d.length>0&&(d+=`
`)):(p=[Al(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(vs).join(`
`),d=[Al(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+h:"",e.envMap?"#define "+f:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor?"#define USE_COLOR":"",e.vertexAlphas||e.batchingColor?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==fn?"#define TONE_MAPPING":"",e.toneMapping!==fn?Vt.tonemapping_pars_fragment:"",e.toneMapping!==fn?Ig("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",Vt.colorspace_pars_fragment,Dg("linearToOutputTexel",e.outputColorSpace),Ug(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(vs).join(`
`)),a=Io(a),a=yl(a,e),a=bl(a,e),o=Io(o),o=yl(o,e),o=bl(o,e),a=Tl(a),o=Tl(o),e.isRawShaderMaterial!==!0&&(x=`#version 300 es
`,p=[m,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+p,d=["#define varying in",e.glslVersion===Ic?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===Ic?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+d);const y=x+p+a,S=x+d+o,A=Ml(s,s.VERTEX_SHADER,y),b=Ml(s,s.FRAGMENT_SHADER,S);s.attachShader(v,A),s.attachShader(v,b),e.index0AttributeName!==void 0?s.bindAttribLocation(v,0,e.index0AttributeName):e.morphTargets===!0&&s.bindAttribLocation(v,0,"position"),s.linkProgram(v);function w(P){if(i.debug.checkShaderErrors){const U=s.getProgramInfoLog(v)||"",I=s.getShaderInfoLog(A)||"",z=s.getShaderInfoLog(b)||"",F=U.trim(),N=I.trim(),H=z.trim();let K=!0,$=!0;if(s.getProgramParameter(v,s.LINK_STATUS)===!1)if(K=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,v,A,b);else{const J=El(s,A,"vertex"),st=El(s,b,"fragment");Jt("THREE.WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(v,s.VALIDATE_STATUS)+`

Material Name: `+P.name+`
Material Type: `+P.type+`

Program Info Log: `+F+`
`+J+`
`+st)}else F!==""?zt("WebGLProgram: Program Info Log:",F):(N===""||H==="")&&($=!1);$&&(P.diagnostics={runnable:K,programLog:F,vertexShader:{log:N,prefix:p},fragmentShader:{log:H,prefix:d}})}s.deleteShader(A),s.deleteShader(b),_=new Sr(s,v),E=Og(s,v)}let _;this.getUniforms=function(){return _===void 0&&w(this),_};let E;this.getAttributes=function(){return E===void 0&&w(this),E};let D=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return D===!1&&(D=s.getProgramParameter(v,wg)),D},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(v),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=Rg++,this.cacheKey=t,this.usedTimes=1,this.program=v,this.vertexShader=A,this.fragmentShader=b,this}let Qg=0;class t_{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t){const e=t.vertexShader,n=t.fragmentShader,s=this._getShaderStage(e),r=this._getShaderStage(n),a=this._getShaderCacheForMaterial(t);return a.has(s)===!1&&(a.add(s),s.usedTimes++),a.has(r)===!1&&(a.add(r),r.usedTimes++),this}remove(t){const e=this.materialCache.get(t);for(const n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderID(t){return this._getShaderStage(t.vertexShader).id}getFragmentShaderID(t){return this._getShaderStage(t.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){const e=this.materialCache;let n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){const e=this.shaderCache;let n=e.get(t);return n===void 0&&(n=new e_(t),e.set(t,n)),n}}class e_{constructor(t){this.id=Qg++,this.code=t,this.usedTimes=0}}function n_(i,t,e,n,s,r){const a=new Pu,o=new t_,l=new Set,c=[],h=new Map,f=n.logarithmicDepthBuffer;let u=n.precision;const m={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function g(_){return l.add(_),_===0?"uv":`uv${_}`}function v(_,E,D,P,U){const I=P.fog,z=U.geometry,F=_.isMeshStandardMaterial||_.isMeshLambertMaterial||_.isMeshPhongMaterial?P.environment:null,N=_.isMeshStandardMaterial||_.isMeshLambertMaterial&&!_.envMap||_.isMeshPhongMaterial&&!_.envMap,H=t.get(_.envMap||F,N),K=H&&H.mapping===Ir?H.image.height:null,$=m[_.type];_.precision!==null&&(u=n.getMaxPrecision(_.precision),u!==_.precision&&zt("WebGLProgram.getParameters:",_.precision,"not supported, using",u,"instead."));const J=z.morphAttributes.position||z.morphAttributes.normal||z.morphAttributes.color,st=J!==void 0?J.length:0;let et=0;z.morphAttributes.position!==void 0&&(et=1),z.morphAttributes.normal!==void 0&&(et=2),z.morphAttributes.color!==void 0&&(et=3);let Ct,It,Kt,Z;if($){const re=ln[$];Ct=re.vertexShader,It=re.fragmentShader}else Ct=_.vertexShader,It=_.fragmentShader,o.update(_),Kt=o.getVertexShaderID(_),Z=o.getFragmentShaderID(_);const it=i.getRenderTarget(),nt=i.state.buffers.depth.getReversed(),Ut=U.isInstancedMesh===!0,Tt=U.isBatchedMesh===!0,Pt=!!_.map,ie=!!_.matcap,Yt=!!H,$t=!!_.aoMap,ne=!!_.lightMap,gt=!!_.bumpMap,rt=!!_.normalMap,C=!!_.displacementMap,Lt=!!_.emissiveMap,vt=!!_.metalnessMap,qt=!!_.roughnessMap,ht=_.anisotropy>0,R=_.clearcoat>0,M=_.dispersion>0,O=_.iridescence>0,q=_.sheen>0,j=_.transmission>0,X=ht&&!!_.anisotropyMap,_t=R&&!!_.clearcoatMap,at=R&&!!_.clearcoatNormalMap,Rt=R&&!!_.clearcoatRoughnessMap,Dt=O&&!!_.iridescenceMap,Q=O&&!!_.iridescenceThicknessMap,ot=q&&!!_.sheenColorMap,Mt=q&&!!_.sheenRoughnessMap,Et=!!_.specularMap,pt=!!_.specularColorMap,Wt=!!_.specularIntensityMap,B=j&&!!_.transmissionMap,lt=j&&!!_.thicknessMap,ct=!!_.gradientMap,xt=!!_.alphaMap,tt=_.alphaTest>0,Y=!!_.alphaHash,St=!!_.extensions;let Ot=fn;_.toneMapped&&(it===null||it.isXRRenderTarget===!0)&&(Ot=i.toneMapping);const he={shaderID:$,shaderType:_.type,shaderName:_.name,vertexShader:Ct,fragmentShader:It,defines:_.defines,customVertexShaderID:Kt,customFragmentShaderID:Z,isRawShaderMaterial:_.isRawShaderMaterial===!0,glslVersion:_.glslVersion,precision:u,batching:Tt,batchingColor:Tt&&U._colorsTexture!==null,instancing:Ut,instancingColor:Ut&&U.instanceColor!==null,instancingMorph:Ut&&U.morphTexture!==null,outputColorSpace:it===null?i.outputColorSpace:it.isXRRenderTarget===!0?it.texture.colorSpace:Yi,alphaToCoverage:!!_.alphaToCoverage,map:Pt,matcap:ie,envMap:Yt,envMapMode:Yt&&H.mapping,envMapCubeUVHeight:K,aoMap:$t,lightMap:ne,bumpMap:gt,normalMap:rt,displacementMap:C,emissiveMap:Lt,normalMapObjectSpace:rt&&_.normalMapType===Bf,normalMapTangentSpace:rt&&_.normalMapType===wu,metalnessMap:vt,roughnessMap:qt,anisotropy:ht,anisotropyMap:X,clearcoat:R,clearcoatMap:_t,clearcoatNormalMap:at,clearcoatRoughnessMap:Rt,dispersion:M,iridescence:O,iridescenceMap:Dt,iridescenceThicknessMap:Q,sheen:q,sheenColorMap:ot,sheenRoughnessMap:Mt,specularMap:Et,specularColorMap:pt,specularIntensityMap:Wt,transmission:j,transmissionMap:B,thicknessMap:lt,gradientMap:ct,opaque:_.transparent===!1&&_.blending===Gi&&_.alphaToCoverage===!1,alphaMap:xt,alphaTest:tt,alphaHash:Y,combine:_.combine,mapUv:Pt&&g(_.map.channel),aoMapUv:$t&&g(_.aoMap.channel),lightMapUv:ne&&g(_.lightMap.channel),bumpMapUv:gt&&g(_.bumpMap.channel),normalMapUv:rt&&g(_.normalMap.channel),displacementMapUv:C&&g(_.displacementMap.channel),emissiveMapUv:Lt&&g(_.emissiveMap.channel),metalnessMapUv:vt&&g(_.metalnessMap.channel),roughnessMapUv:qt&&g(_.roughnessMap.channel),anisotropyMapUv:X&&g(_.anisotropyMap.channel),clearcoatMapUv:_t&&g(_.clearcoatMap.channel),clearcoatNormalMapUv:at&&g(_.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Rt&&g(_.clearcoatRoughnessMap.channel),iridescenceMapUv:Dt&&g(_.iridescenceMap.channel),iridescenceThicknessMapUv:Q&&g(_.iridescenceThicknessMap.channel),sheenColorMapUv:ot&&g(_.sheenColorMap.channel),sheenRoughnessMapUv:Mt&&g(_.sheenRoughnessMap.channel),specularMapUv:Et&&g(_.specularMap.channel),specularColorMapUv:pt&&g(_.specularColorMap.channel),specularIntensityMapUv:Wt&&g(_.specularIntensityMap.channel),transmissionMapUv:B&&g(_.transmissionMap.channel),thicknessMapUv:lt&&g(_.thicknessMap.channel),alphaMapUv:xt&&g(_.alphaMap.channel),vertexTangents:!!z.attributes.tangent&&(rt||ht),vertexColors:_.vertexColors,vertexAlphas:_.vertexColors===!0&&!!z.attributes.color&&z.attributes.color.itemSize===4,pointsUvs:U.isPoints===!0&&!!z.attributes.uv&&(Pt||xt),fog:!!I,useFog:_.fog===!0,fogExp2:!!I&&I.isFogExp2,flatShading:_.wireframe===!1&&(_.flatShading===!0||z.attributes.normal===void 0&&rt===!1&&(_.isMeshLambertMaterial||_.isMeshPhongMaterial||_.isMeshStandardMaterial||_.isMeshPhysicalMaterial)),sizeAttenuation:_.sizeAttenuation===!0,logarithmicDepthBuffer:f,reversedDepthBuffer:nt,skinning:U.isSkinnedMesh===!0,morphTargets:z.morphAttributes.position!==void 0,morphNormals:z.morphAttributes.normal!==void 0,morphColors:z.morphAttributes.color!==void 0,morphTargetsCount:st,morphTextureStride:et,numDirLights:E.directional.length,numPointLights:E.point.length,numSpotLights:E.spot.length,numSpotLightMaps:E.spotLightMap.length,numRectAreaLights:E.rectArea.length,numHemiLights:E.hemi.length,numDirLightShadows:E.directionalShadowMap.length,numPointLightShadows:E.pointShadowMap.length,numSpotLightShadows:E.spotShadowMap.length,numSpotLightShadowsWithMaps:E.numSpotLightShadowsWithMaps,numLightProbes:E.numLightProbes,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:_.dithering,shadowMapEnabled:i.shadowMap.enabled&&D.length>0,shadowMapType:i.shadowMap.type,toneMapping:Ot,decodeVideoTexture:Pt&&_.map.isVideoTexture===!0&&Qt.getTransfer(_.map.colorSpace)===ae,decodeVideoTextureEmissive:Lt&&_.emissiveMap.isVideoTexture===!0&&Qt.getTransfer(_.emissiveMap.colorSpace)===ae,premultipliedAlpha:_.premultipliedAlpha,doubleSided:_.side===En,flipSided:_.side===Ie,useDepthPacking:_.depthPacking>=0,depthPacking:_.depthPacking||0,index0AttributeName:_.index0AttributeName,extensionClipCullDistance:St&&_.extensions.clipCullDistance===!0&&e.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(St&&_.extensions.multiDraw===!0||Tt)&&e.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:e.has("KHR_parallel_shader_compile"),customProgramCacheKey:_.customProgramCacheKey()};return he.vertexUv1s=l.has(1),he.vertexUv2s=l.has(2),he.vertexUv3s=l.has(3),l.clear(),he}function p(_){const E=[];if(_.shaderID?E.push(_.shaderID):(E.push(_.customVertexShaderID),E.push(_.customFragmentShaderID)),_.defines!==void 0)for(const D in _.defines)E.push(D),E.push(_.defines[D]);return _.isRawShaderMaterial===!1&&(d(E,_),x(E,_),E.push(i.outputColorSpace)),E.push(_.customProgramCacheKey),E.join()}function d(_,E){_.push(E.precision),_.push(E.outputColorSpace),_.push(E.envMapMode),_.push(E.envMapCubeUVHeight),_.push(E.mapUv),_.push(E.alphaMapUv),_.push(E.lightMapUv),_.push(E.aoMapUv),_.push(E.bumpMapUv),_.push(E.normalMapUv),_.push(E.displacementMapUv),_.push(E.emissiveMapUv),_.push(E.metalnessMapUv),_.push(E.roughnessMapUv),_.push(E.anisotropyMapUv),_.push(E.clearcoatMapUv),_.push(E.clearcoatNormalMapUv),_.push(E.clearcoatRoughnessMapUv),_.push(E.iridescenceMapUv),_.push(E.iridescenceThicknessMapUv),_.push(E.sheenColorMapUv),_.push(E.sheenRoughnessMapUv),_.push(E.specularMapUv),_.push(E.specularColorMapUv),_.push(E.specularIntensityMapUv),_.push(E.transmissionMapUv),_.push(E.thicknessMapUv),_.push(E.combine),_.push(E.fogExp2),_.push(E.sizeAttenuation),_.push(E.morphTargetsCount),_.push(E.morphAttributeCount),_.push(E.numDirLights),_.push(E.numPointLights),_.push(E.numSpotLights),_.push(E.numSpotLightMaps),_.push(E.numHemiLights),_.push(E.numRectAreaLights),_.push(E.numDirLightShadows),_.push(E.numPointLightShadows),_.push(E.numSpotLightShadows),_.push(E.numSpotLightShadowsWithMaps),_.push(E.numLightProbes),_.push(E.shadowMapType),_.push(E.toneMapping),_.push(E.numClippingPlanes),_.push(E.numClipIntersection),_.push(E.depthPacking)}function x(_,E){a.disableAll(),E.instancing&&a.enable(0),E.instancingColor&&a.enable(1),E.instancingMorph&&a.enable(2),E.matcap&&a.enable(3),E.envMap&&a.enable(4),E.normalMapObjectSpace&&a.enable(5),E.normalMapTangentSpace&&a.enable(6),E.clearcoat&&a.enable(7),E.iridescence&&a.enable(8),E.alphaTest&&a.enable(9),E.vertexColors&&a.enable(10),E.vertexAlphas&&a.enable(11),E.vertexUv1s&&a.enable(12),E.vertexUv2s&&a.enable(13),E.vertexUv3s&&a.enable(14),E.vertexTangents&&a.enable(15),E.anisotropy&&a.enable(16),E.alphaHash&&a.enable(17),E.batching&&a.enable(18),E.dispersion&&a.enable(19),E.batchingColor&&a.enable(20),E.gradientMap&&a.enable(21),_.push(a.mask),a.disableAll(),E.fog&&a.enable(0),E.useFog&&a.enable(1),E.flatShading&&a.enable(2),E.logarithmicDepthBuffer&&a.enable(3),E.reversedDepthBuffer&&a.enable(4),E.skinning&&a.enable(5),E.morphTargets&&a.enable(6),E.morphNormals&&a.enable(7),E.morphColors&&a.enable(8),E.premultipliedAlpha&&a.enable(9),E.shadowMapEnabled&&a.enable(10),E.doubleSided&&a.enable(11),E.flipSided&&a.enable(12),E.useDepthPacking&&a.enable(13),E.dithering&&a.enable(14),E.transmission&&a.enable(15),E.sheen&&a.enable(16),E.opaque&&a.enable(17),E.pointsUvs&&a.enable(18),E.decodeVideoTexture&&a.enable(19),E.decodeVideoTextureEmissive&&a.enable(20),E.alphaToCoverage&&a.enable(21),_.push(a.mask)}function y(_){const E=m[_.type];let D;if(E){const P=ln[E];D=bd.clone(P.uniforms)}else D=_.uniforms;return D}function S(_,E){let D=h.get(E);return D!==void 0?++D.usedTimes:(D=new Jg(i,E,_,s),c.push(D),h.set(E,D)),D}function A(_){if(--_.usedTimes===0){const E=c.indexOf(_);c[E]=c[c.length-1],c.pop(),h.delete(_.cacheKey),_.destroy()}}function b(_){o.remove(_)}function w(){o.dispose()}return{getParameters:v,getProgramCacheKey:p,getUniforms:y,acquireProgram:S,releaseProgram:A,releaseShaderCache:b,programs:c,dispose:w}}function i_(){let i=new WeakMap;function t(a){return i.has(a)}function e(a){let o=i.get(a);return o===void 0&&(o={},i.set(a,o)),o}function n(a){i.delete(a)}function s(a,o,l){i.get(a)[o]=l}function r(){i=new WeakMap}return{has:t,get:e,remove:n,update:s,dispose:r}}function s_(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.material.id!==t.material.id?i.material.id-t.material.id:i.materialVariant!==t.materialVariant?i.materialVariant-t.materialVariant:i.z!==t.z?i.z-t.z:i.id-t.id}function wl(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.z!==t.z?t.z-i.z:i.id-t.id}function Rl(){const i=[];let t=0;const e=[],n=[],s=[];function r(){t=0,e.length=0,n.length=0,s.length=0}function a(u){let m=0;return u.isInstancedMesh&&(m+=2),u.isSkinnedMesh&&(m+=1),m}function o(u,m,g,v,p,d){let x=i[t];return x===void 0?(x={id:u.id,object:u,geometry:m,material:g,materialVariant:a(u),groupOrder:v,renderOrder:u.renderOrder,z:p,group:d},i[t]=x):(x.id=u.id,x.object=u,x.geometry=m,x.material=g,x.materialVariant=a(u),x.groupOrder=v,x.renderOrder=u.renderOrder,x.z=p,x.group=d),t++,x}function l(u,m,g,v,p,d){const x=o(u,m,g,v,p,d);g.transmission>0?n.push(x):g.transparent===!0?s.push(x):e.push(x)}function c(u,m,g,v,p,d){const x=o(u,m,g,v,p,d);g.transmission>0?n.unshift(x):g.transparent===!0?s.unshift(x):e.unshift(x)}function h(u,m){e.length>1&&e.sort(u||s_),n.length>1&&n.sort(m||wl),s.length>1&&s.sort(m||wl)}function f(){for(let u=t,m=i.length;u<m;u++){const g=i[u];if(g.id===null)break;g.id=null,g.object=null,g.geometry=null,g.material=null,g.group=null}}return{opaque:e,transmissive:n,transparent:s,init:r,push:l,unshift:c,finish:f,sort:h}}function r_(){let i=new WeakMap;function t(n,s){const r=i.get(n);let a;return r===void 0?(a=new Rl,i.set(n,[a])):s>=r.length?(a=new Rl,r.push(a)):a=r[s],a}function e(){i=new WeakMap}return{get:t,dispose:e}}function a_(){const i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new L,color:new Nt};break;case"SpotLight":e={position:new L,direction:new L,color:new Nt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new L,color:new Nt,distance:0,decay:0};break;case"HemisphereLight":e={direction:new L,skyColor:new Nt,groundColor:new Nt};break;case"RectAreaLight":e={color:new Nt,position:new L,halfWidth:new L,halfHeight:new L};break}return i[t.id]=e,e}}}function o_(){const i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ft};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ft};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ft,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[t.id]=e,e}}}let c_=0;function l_(i,t){return(t.castShadow?2:0)-(i.castShadow?2:0)+(t.map?1:0)-(i.map?1:0)}function u_(i){const t=new a_,e=o_(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new L);const s=new L,r=new te,a=new te;function o(c){let h=0,f=0,u=0;for(let E=0;E<9;E++)n.probe[E].set(0,0,0);let m=0,g=0,v=0,p=0,d=0,x=0,y=0,S=0,A=0,b=0,w=0;c.sort(l_);for(let E=0,D=c.length;E<D;E++){const P=c[E],U=P.color,I=P.intensity,z=P.distance;let F=null;if(P.shadow&&P.shadow.map&&(P.shadow.map.texture.format===Xi?F=P.shadow.map.texture:F=P.shadow.map.depthTexture||P.shadow.map.texture),P.isAmbientLight)h+=U.r*I,f+=U.g*I,u+=U.b*I;else if(P.isLightProbe){for(let N=0;N<9;N++)n.probe[N].addScaledVector(P.sh.coefficients[N],I);w++}else if(P.isDirectionalLight){const N=t.get(P);if(N.color.copy(P.color).multiplyScalar(P.intensity),P.castShadow){const H=P.shadow,K=e.get(P);K.shadowIntensity=H.intensity,K.shadowBias=H.bias,K.shadowNormalBias=H.normalBias,K.shadowRadius=H.radius,K.shadowMapSize=H.mapSize,n.directionalShadow[m]=K,n.directionalShadowMap[m]=F,n.directionalShadowMatrix[m]=P.shadow.matrix,x++}n.directional[m]=N,m++}else if(P.isSpotLight){const N=t.get(P);N.position.setFromMatrixPosition(P.matrixWorld),N.color.copy(U).multiplyScalar(I),N.distance=z,N.coneCos=Math.cos(P.angle),N.penumbraCos=Math.cos(P.angle*(1-P.penumbra)),N.decay=P.decay,n.spot[v]=N;const H=P.shadow;if(P.map&&(n.spotLightMap[A]=P.map,A++,H.updateMatrices(P),P.castShadow&&b++),n.spotLightMatrix[v]=H.matrix,P.castShadow){const K=e.get(P);K.shadowIntensity=H.intensity,K.shadowBias=H.bias,K.shadowNormalBias=H.normalBias,K.shadowRadius=H.radius,K.shadowMapSize=H.mapSize,n.spotShadow[v]=K,n.spotShadowMap[v]=F,S++}v++}else if(P.isRectAreaLight){const N=t.get(P);N.color.copy(U).multiplyScalar(I),N.halfWidth.set(P.width*.5,0,0),N.halfHeight.set(0,P.height*.5,0),n.rectArea[p]=N,p++}else if(P.isPointLight){const N=t.get(P);if(N.color.copy(P.color).multiplyScalar(P.intensity),N.distance=P.distance,N.decay=P.decay,P.castShadow){const H=P.shadow,K=e.get(P);K.shadowIntensity=H.intensity,K.shadowBias=H.bias,K.shadowNormalBias=H.normalBias,K.shadowRadius=H.radius,K.shadowMapSize=H.mapSize,K.shadowCameraNear=H.camera.near,K.shadowCameraFar=H.camera.far,n.pointShadow[g]=K,n.pointShadowMap[g]=F,n.pointShadowMatrix[g]=P.shadow.matrix,y++}n.point[g]=N,g++}else if(P.isHemisphereLight){const N=t.get(P);N.skyColor.copy(P.color).multiplyScalar(I),N.groundColor.copy(P.groundColor).multiplyScalar(I),n.hemi[d]=N,d++}}p>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=ut.LTC_FLOAT_1,n.rectAreaLTC2=ut.LTC_FLOAT_2):(n.rectAreaLTC1=ut.LTC_HALF_1,n.rectAreaLTC2=ut.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=f,n.ambient[2]=u;const _=n.hash;(_.directionalLength!==m||_.pointLength!==g||_.spotLength!==v||_.rectAreaLength!==p||_.hemiLength!==d||_.numDirectionalShadows!==x||_.numPointShadows!==y||_.numSpotShadows!==S||_.numSpotMaps!==A||_.numLightProbes!==w)&&(n.directional.length=m,n.spot.length=v,n.rectArea.length=p,n.point.length=g,n.hemi.length=d,n.directionalShadow.length=x,n.directionalShadowMap.length=x,n.pointShadow.length=y,n.pointShadowMap.length=y,n.spotShadow.length=S,n.spotShadowMap.length=S,n.directionalShadowMatrix.length=x,n.pointShadowMatrix.length=y,n.spotLightMatrix.length=S+A-b,n.spotLightMap.length=A,n.numSpotLightShadowsWithMaps=b,n.numLightProbes=w,_.directionalLength=m,_.pointLength=g,_.spotLength=v,_.rectAreaLength=p,_.hemiLength=d,_.numDirectionalShadows=x,_.numPointShadows=y,_.numSpotShadows=S,_.numSpotMaps=A,_.numLightProbes=w,n.version=c_++)}function l(c,h){let f=0,u=0,m=0,g=0,v=0;const p=h.matrixWorldInverse;for(let d=0,x=c.length;d<x;d++){const y=c[d];if(y.isDirectionalLight){const S=n.directional[f];S.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),S.direction.sub(s),S.direction.transformDirection(p),f++}else if(y.isSpotLight){const S=n.spot[m];S.position.setFromMatrixPosition(y.matrixWorld),S.position.applyMatrix4(p),S.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),S.direction.sub(s),S.direction.transformDirection(p),m++}else if(y.isRectAreaLight){const S=n.rectArea[g];S.position.setFromMatrixPosition(y.matrixWorld),S.position.applyMatrix4(p),a.identity(),r.copy(y.matrixWorld),r.premultiply(p),a.extractRotation(r),S.halfWidth.set(y.width*.5,0,0),S.halfHeight.set(0,y.height*.5,0),S.halfWidth.applyMatrix4(a),S.halfHeight.applyMatrix4(a),g++}else if(y.isPointLight){const S=n.point[u];S.position.setFromMatrixPosition(y.matrixWorld),S.position.applyMatrix4(p),u++}else if(y.isHemisphereLight){const S=n.hemi[v];S.direction.setFromMatrixPosition(y.matrixWorld),S.direction.transformDirection(p),v++}}}return{setup:o,setupView:l,state:n}}function Cl(i){const t=new u_(i),e=[],n=[];function s(h){c.camera=h,e.length=0,n.length=0}function r(h){e.push(h)}function a(h){n.push(h)}function o(){t.setup(e)}function l(h){t.setupView(e,h)}const c={lightsArray:e,shadowsArray:n,camera:null,lights:t,transmissionRenderTarget:{}};return{init:s,state:c,setupLights:o,setupLightsView:l,pushLight:r,pushShadow:a}}function h_(i){let t=new WeakMap;function e(s,r=0){const a=t.get(s);let o;return a===void 0?(o=new Cl(i),t.set(s,[o])):r>=a.length?(o=new Cl(i),a.push(o)):o=a[r],o}function n(){t=new WeakMap}return{get:e,dispose:n}}const f_=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,d_=`uniform sampler2D shadow_pass;
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
}`,p_=[new L(1,0,0),new L(-1,0,0),new L(0,1,0),new L(0,-1,0),new L(0,0,1),new L(0,0,-1)],m_=[new L(0,-1,0),new L(0,-1,0),new L(0,0,1),new L(0,0,-1),new L(0,-1,0),new L(0,-1,0)],Pl=new te,ds=new L,wa=new L;function g_(i,t,e){let n=new ic;const s=new Ft,r=new Ft,a=new pe,o=new Rd,l=new Cd,c={},h=e.maxTextureSize,f={[kn]:Ie,[Ie]:kn,[En]:En},u=new sn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Ft},radius:{value:4}},vertexShader:f_,fragmentShader:d_}),m=u.clone();m.defines.HORIZONTAL_PASS=1;const g=new ve;g.setAttribute("position",new Ne(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const v=new Bt(g,u),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=mr;let d=this.type;this.render=function(b,w,_){if(p.enabled===!1||p.autoUpdate===!1&&p.needsUpdate===!1||b.length===0)return;this.type===fu&&(zt("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=mr);const E=i.getRenderTarget(),D=i.getActiveCubeFace(),P=i.getActiveMipmapLevel(),U=i.state;U.setBlending(Tn),U.buffers.depth.getReversed()===!0?U.buffers.color.setClear(0,0,0,0):U.buffers.color.setClear(1,1,1,1),U.buffers.depth.setTest(!0),U.setScissorTest(!1);const I=d!==this.type;I&&w.traverse(function(z){z.material&&(Array.isArray(z.material)?z.material.forEach(F=>F.needsUpdate=!0):z.material.needsUpdate=!0)});for(let z=0,F=b.length;z<F;z++){const N=b[z],H=N.shadow;if(H===void 0){zt("WebGLShadowMap:",N,"has no shadow.");continue}if(H.autoUpdate===!1&&H.needsUpdate===!1)continue;s.copy(H.mapSize);const K=H.getFrameExtents();s.multiply(K),r.copy(H.mapSize),(s.x>h||s.y>h)&&(s.x>h&&(r.x=Math.floor(h/K.x),s.x=r.x*K.x,H.mapSize.x=r.x),s.y>h&&(r.y=Math.floor(h/K.y),s.y=r.y*K.y,H.mapSize.y=r.y));const $=i.state.buffers.depth.getReversed();if(H.camera._reversedDepth=$,H.map===null||I===!0){if(H.map!==null&&(H.map.depthTexture!==null&&(H.map.depthTexture.dispose(),H.map.depthTexture=null),H.map.dispose()),this.type===xs){if(N.isPointLight){zt("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}H.map=new dn(s.x,s.y,{format:Xi,type:Rn,minFilter:be,magFilter:be,generateMipmaps:!1}),H.map.texture.name=N.name+".shadowMap",H.map.depthTexture=new ws(s.x,s.y,nn),H.map.depthTexture.name=N.name+".shadowMapDepth",H.map.depthTexture.format=Cn,H.map.depthTexture.compareFunction=null,H.map.depthTexture.minFilter=Re,H.map.depthTexture.magFilter=Re}else N.isPointLight?(H.map=new Xu(s.x),H.map.depthTexture=new Ed(s.x,pn)):(H.map=new dn(s.x,s.y),H.map.depthTexture=new ws(s.x,s.y,pn)),H.map.depthTexture.name=N.name+".shadowMap",H.map.depthTexture.format=Cn,this.type===mr?(H.map.depthTexture.compareFunction=$?Qo:Jo,H.map.depthTexture.minFilter=be,H.map.depthTexture.magFilter=be):(H.map.depthTexture.compareFunction=null,H.map.depthTexture.minFilter=Re,H.map.depthTexture.magFilter=Re);H.camera.updateProjectionMatrix()}const J=H.map.isWebGLCubeRenderTarget?6:1;for(let st=0;st<J;st++){if(H.map.isWebGLCubeRenderTarget)i.setRenderTarget(H.map,st),i.clear();else{st===0&&(i.setRenderTarget(H.map),i.clear());const et=H.getViewport(st);a.set(r.x*et.x,r.y*et.y,r.x*et.z,r.y*et.w),U.viewport(a)}if(N.isPointLight){const et=H.camera,Ct=H.matrix,It=N.distance||et.far;It!==et.far&&(et.far=It,et.updateProjectionMatrix()),ds.setFromMatrixPosition(N.matrixWorld),et.position.copy(ds),wa.copy(et.position),wa.add(p_[st]),et.up.copy(m_[st]),et.lookAt(wa),et.updateMatrixWorld(),Ct.makeTranslation(-ds.x,-ds.y,-ds.z),Pl.multiplyMatrices(et.projectionMatrix,et.matrixWorldInverse),H._frustum.setFromProjectionMatrix(Pl,et.coordinateSystem,et.reversedDepth)}else H.updateMatrices(N);n=H.getFrustum(),S(w,_,H.camera,N,this.type)}H.isPointLightShadow!==!0&&this.type===xs&&x(H,_),H.needsUpdate=!1}d=this.type,p.needsUpdate=!1,i.setRenderTarget(E,D,P)};function x(b,w){const _=t.update(v);u.defines.VSM_SAMPLES!==b.blurSamples&&(u.defines.VSM_SAMPLES=b.blurSamples,m.defines.VSM_SAMPLES=b.blurSamples,u.needsUpdate=!0,m.needsUpdate=!0),b.mapPass===null&&(b.mapPass=new dn(s.x,s.y,{format:Xi,type:Rn})),u.uniforms.shadow_pass.value=b.map.depthTexture,u.uniforms.resolution.value=b.mapSize,u.uniforms.radius.value=b.radius,i.setRenderTarget(b.mapPass),i.clear(),i.renderBufferDirect(w,null,_,u,v,null),m.uniforms.shadow_pass.value=b.mapPass.texture,m.uniforms.resolution.value=b.mapSize,m.uniforms.radius.value=b.radius,i.setRenderTarget(b.map),i.clear(),i.renderBufferDirect(w,null,_,m,v,null)}function y(b,w,_,E){let D=null;const P=_.isPointLight===!0?b.customDistanceMaterial:b.customDepthMaterial;if(P!==void 0)D=P;else if(D=_.isPointLight===!0?l:o,i.localClippingEnabled&&w.clipShadows===!0&&Array.isArray(w.clippingPlanes)&&w.clippingPlanes.length!==0||w.displacementMap&&w.displacementScale!==0||w.alphaMap&&w.alphaTest>0||w.map&&w.alphaTest>0||w.alphaToCoverage===!0){const U=D.uuid,I=w.uuid;let z=c[U];z===void 0&&(z={},c[U]=z);let F=z[I];F===void 0&&(F=D.clone(),z[I]=F,w.addEventListener("dispose",A)),D=F}if(D.visible=w.visible,D.wireframe=w.wireframe,E===xs?D.side=w.shadowSide!==null?w.shadowSide:w.side:D.side=w.shadowSide!==null?w.shadowSide:f[w.side],D.alphaMap=w.alphaMap,D.alphaTest=w.alphaToCoverage===!0?.5:w.alphaTest,D.map=w.map,D.clipShadows=w.clipShadows,D.clippingPlanes=w.clippingPlanes,D.clipIntersection=w.clipIntersection,D.displacementMap=w.displacementMap,D.displacementScale=w.displacementScale,D.displacementBias=w.displacementBias,D.wireframeLinewidth=w.wireframeLinewidth,D.linewidth=w.linewidth,_.isPointLight===!0&&D.isMeshDistanceMaterial===!0){const U=i.properties.get(D);U.light=_}return D}function S(b,w,_,E,D){if(b.visible===!1)return;if(b.layers.test(w.layers)&&(b.isMesh||b.isLine||b.isPoints)&&(b.castShadow||b.receiveShadow&&D===xs)&&(!b.frustumCulled||n.intersectsObject(b))){b.modelViewMatrix.multiplyMatrices(_.matrixWorldInverse,b.matrixWorld);const I=t.update(b),z=b.material;if(Array.isArray(z)){const F=I.groups;for(let N=0,H=F.length;N<H;N++){const K=F[N],$=z[K.materialIndex];if($&&$.visible){const J=y(b,$,E,D);b.onBeforeShadow(i,b,w,_,I,J,K),i.renderBufferDirect(_,null,I,J,b,K),b.onAfterShadow(i,b,w,_,I,J,K)}}}else if(z.visible){const F=y(b,z,E,D);b.onBeforeShadow(i,b,w,_,I,F,null),i.renderBufferDirect(_,null,I,F,b,null),b.onAfterShadow(i,b,w,_,I,F,null)}}const U=b.children;for(let I=0,z=U.length;I<z;I++)S(U[I],w,_,E,D)}function A(b){b.target.removeEventListener("dispose",A);for(const _ in c){const E=c[_],D=b.target.uuid;D in E&&(E[D].dispose(),delete E[D])}}}function __(i,t){function e(){let B=!1;const lt=new pe;let ct=null;const xt=new pe(0,0,0,0);return{setMask:function(tt){ct!==tt&&!B&&(i.colorMask(tt,tt,tt,tt),ct=tt)},setLocked:function(tt){B=tt},setClear:function(tt,Y,St,Ot,he){he===!0&&(tt*=Ot,Y*=Ot,St*=Ot),lt.set(tt,Y,St,Ot),xt.equals(lt)===!1&&(i.clearColor(tt,Y,St,Ot),xt.copy(lt))},reset:function(){B=!1,ct=null,xt.set(-1,0,0,0)}}}function n(){let B=!1,lt=!1,ct=null,xt=null,tt=null;return{setReversed:function(Y){if(lt!==Y){const St=t.get("EXT_clip_control");Y?St.clipControlEXT(St.LOWER_LEFT_EXT,St.ZERO_TO_ONE_EXT):St.clipControlEXT(St.LOWER_LEFT_EXT,St.NEGATIVE_ONE_TO_ONE_EXT),lt=Y;const Ot=tt;tt=null,this.setClear(Ot)}},getReversed:function(){return lt},setTest:function(Y){Y?it(i.DEPTH_TEST):nt(i.DEPTH_TEST)},setMask:function(Y){ct!==Y&&!B&&(i.depthMask(Y),ct=Y)},setFunc:function(Y){if(lt&&(Y=Kf[Y]),xt!==Y){switch(Y){case Va:i.depthFunc(i.NEVER);break;case ka:i.depthFunc(i.ALWAYS);break;case Wa:i.depthFunc(i.LESS);break;case ki:i.depthFunc(i.LEQUAL);break;case Xa:i.depthFunc(i.EQUAL);break;case Ya:i.depthFunc(i.GEQUAL);break;case qa:i.depthFunc(i.GREATER);break;case Ka:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}xt=Y}},setLocked:function(Y){B=Y},setClear:function(Y){tt!==Y&&(tt=Y,lt&&(Y=1-Y),i.clearDepth(Y))},reset:function(){B=!1,ct=null,xt=null,tt=null,lt=!1}}}function s(){let B=!1,lt=null,ct=null,xt=null,tt=null,Y=null,St=null,Ot=null,he=null;return{setTest:function(re){B||(re?it(i.STENCIL_TEST):nt(i.STENCIL_TEST))},setMask:function(re){lt!==re&&!B&&(i.stencilMask(re),lt=re)},setFunc:function(re,mn,gn){(ct!==re||xt!==mn||tt!==gn)&&(i.stencilFunc(re,mn,gn),ct=re,xt=mn,tt=gn)},setOp:function(re,mn,gn){(Y!==re||St!==mn||Ot!==gn)&&(i.stencilOp(re,mn,gn),Y=re,St=mn,Ot=gn)},setLocked:function(re){B=re},setClear:function(re){he!==re&&(i.clearStencil(re),he=re)},reset:function(){B=!1,lt=null,ct=null,xt=null,tt=null,Y=null,St=null,Ot=null,he=null}}}const r=new e,a=new n,o=new s,l=new WeakMap,c=new WeakMap;let h={},f={},u=new WeakMap,m=[],g=null,v=!1,p=null,d=null,x=null,y=null,S=null,A=null,b=null,w=new Nt(0,0,0),_=0,E=!1,D=null,P=null,U=null,I=null,z=null;const F=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let N=!1,H=0;const K=i.getParameter(i.VERSION);K.indexOf("WebGL")!==-1?(H=parseFloat(/^WebGL (\d)/.exec(K)[1]),N=H>=1):K.indexOf("OpenGL ES")!==-1&&(H=parseFloat(/^OpenGL ES (\d)/.exec(K)[1]),N=H>=2);let $=null,J={};const st=i.getParameter(i.SCISSOR_BOX),et=i.getParameter(i.VIEWPORT),Ct=new pe().fromArray(st),It=new pe().fromArray(et);function Kt(B,lt,ct,xt){const tt=new Uint8Array(4),Y=i.createTexture();i.bindTexture(B,Y),i.texParameteri(B,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(B,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let St=0;St<ct;St++)B===i.TEXTURE_3D||B===i.TEXTURE_2D_ARRAY?i.texImage3D(lt,0,i.RGBA,1,1,xt,0,i.RGBA,i.UNSIGNED_BYTE,tt):i.texImage2D(lt+St,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,tt);return Y}const Z={};Z[i.TEXTURE_2D]=Kt(i.TEXTURE_2D,i.TEXTURE_2D,1),Z[i.TEXTURE_CUBE_MAP]=Kt(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),Z[i.TEXTURE_2D_ARRAY]=Kt(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),Z[i.TEXTURE_3D]=Kt(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),a.setClear(1),o.setClear(0),it(i.DEPTH_TEST),a.setFunc(ki),gt(!1),rt(Cc),it(i.CULL_FACE),$t(Tn);function it(B){h[B]!==!0&&(i.enable(B),h[B]=!0)}function nt(B){h[B]!==!1&&(i.disable(B),h[B]=!1)}function Ut(B,lt){return f[B]!==lt?(i.bindFramebuffer(B,lt),f[B]=lt,B===i.DRAW_FRAMEBUFFER&&(f[i.FRAMEBUFFER]=lt),B===i.FRAMEBUFFER&&(f[i.DRAW_FRAMEBUFFER]=lt),!0):!1}function Tt(B,lt){let ct=m,xt=!1;if(B){ct=u.get(lt),ct===void 0&&(ct=[],u.set(lt,ct));const tt=B.textures;if(ct.length!==tt.length||ct[0]!==i.COLOR_ATTACHMENT0){for(let Y=0,St=tt.length;Y<St;Y++)ct[Y]=i.COLOR_ATTACHMENT0+Y;ct.length=tt.length,xt=!0}}else ct[0]!==i.BACK&&(ct[0]=i.BACK,xt=!0);xt&&i.drawBuffers(ct)}function Pt(B){return g!==B?(i.useProgram(B),g=B,!0):!1}const ie={[ni]:i.FUNC_ADD,[_f]:i.FUNC_SUBTRACT,[xf]:i.FUNC_REVERSE_SUBTRACT};ie[vf]=i.MIN,ie[Mf]=i.MAX;const Yt={[Sf]:i.ZERO,[Ef]:i.ONE,[yf]:i.SRC_COLOR,[Ga]:i.SRC_ALPHA,[Cf]:i.SRC_ALPHA_SATURATE,[wf]:i.DST_COLOR,[Tf]:i.DST_ALPHA,[bf]:i.ONE_MINUS_SRC_COLOR,[Ha]:i.ONE_MINUS_SRC_ALPHA,[Rf]:i.ONE_MINUS_DST_COLOR,[Af]:i.ONE_MINUS_DST_ALPHA,[Pf]:i.CONSTANT_COLOR,[Df]:i.ONE_MINUS_CONSTANT_COLOR,[Lf]:i.CONSTANT_ALPHA,[If]:i.ONE_MINUS_CONSTANT_ALPHA};function $t(B,lt,ct,xt,tt,Y,St,Ot,he,re){if(B===Tn){v===!0&&(nt(i.BLEND),v=!1);return}if(v===!1&&(it(i.BLEND),v=!0),B!==gf){if(B!==p||re!==E){if((d!==ni||S!==ni)&&(i.blendEquation(i.FUNC_ADD),d=ni,S=ni),re)switch(B){case Gi:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case za:i.blendFunc(i.ONE,i.ONE);break;case Pc:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case Dc:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:Jt("WebGLState: Invalid blending: ",B);break}else switch(B){case Gi:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case za:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case Pc:Jt("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Dc:Jt("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Jt("WebGLState: Invalid blending: ",B);break}x=null,y=null,A=null,b=null,w.set(0,0,0),_=0,p=B,E=re}return}tt=tt||lt,Y=Y||ct,St=St||xt,(lt!==d||tt!==S)&&(i.blendEquationSeparate(ie[lt],ie[tt]),d=lt,S=tt),(ct!==x||xt!==y||Y!==A||St!==b)&&(i.blendFuncSeparate(Yt[ct],Yt[xt],Yt[Y],Yt[St]),x=ct,y=xt,A=Y,b=St),(Ot.equals(w)===!1||he!==_)&&(i.blendColor(Ot.r,Ot.g,Ot.b,he),w.copy(Ot),_=he),p=B,E=!1}function ne(B,lt){B.side===En?nt(i.CULL_FACE):it(i.CULL_FACE);let ct=B.side===Ie;lt&&(ct=!ct),gt(ct),B.blending===Gi&&B.transparent===!1?$t(Tn):$t(B.blending,B.blendEquation,B.blendSrc,B.blendDst,B.blendEquationAlpha,B.blendSrcAlpha,B.blendDstAlpha,B.blendColor,B.blendAlpha,B.premultipliedAlpha),a.setFunc(B.depthFunc),a.setTest(B.depthTest),a.setMask(B.depthWrite),r.setMask(B.colorWrite);const xt=B.stencilWrite;o.setTest(xt),xt&&(o.setMask(B.stencilWriteMask),o.setFunc(B.stencilFunc,B.stencilRef,B.stencilFuncMask),o.setOp(B.stencilFail,B.stencilZFail,B.stencilZPass)),Lt(B.polygonOffset,B.polygonOffsetFactor,B.polygonOffsetUnits),B.alphaToCoverage===!0?it(i.SAMPLE_ALPHA_TO_COVERAGE):nt(i.SAMPLE_ALPHA_TO_COVERAGE)}function gt(B){D!==B&&(B?i.frontFace(i.CW):i.frontFace(i.CCW),D=B)}function rt(B){B!==pf?(it(i.CULL_FACE),B!==P&&(B===Cc?i.cullFace(i.BACK):B===mf?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):nt(i.CULL_FACE),P=B}function C(B){B!==U&&(N&&i.lineWidth(B),U=B)}function Lt(B,lt,ct){B?(it(i.POLYGON_OFFSET_FILL),(I!==lt||z!==ct)&&(I=lt,z=ct,a.getReversed()&&(lt=-lt),i.polygonOffset(lt,ct))):nt(i.POLYGON_OFFSET_FILL)}function vt(B){B?it(i.SCISSOR_TEST):nt(i.SCISSOR_TEST)}function qt(B){B===void 0&&(B=i.TEXTURE0+F-1),$!==B&&(i.activeTexture(B),$=B)}function ht(B,lt,ct){ct===void 0&&($===null?ct=i.TEXTURE0+F-1:ct=$);let xt=J[ct];xt===void 0&&(xt={type:void 0,texture:void 0},J[ct]=xt),(xt.type!==B||xt.texture!==lt)&&($!==ct&&(i.activeTexture(ct),$=ct),i.bindTexture(B,lt||Z[B]),xt.type=B,xt.texture=lt)}function R(){const B=J[$];B!==void 0&&B.type!==void 0&&(i.bindTexture(B.type,null),B.type=void 0,B.texture=void 0)}function M(){try{i.compressedTexImage2D(...arguments)}catch(B){Jt("WebGLState:",B)}}function O(){try{i.compressedTexImage3D(...arguments)}catch(B){Jt("WebGLState:",B)}}function q(){try{i.texSubImage2D(...arguments)}catch(B){Jt("WebGLState:",B)}}function j(){try{i.texSubImage3D(...arguments)}catch(B){Jt("WebGLState:",B)}}function X(){try{i.compressedTexSubImage2D(...arguments)}catch(B){Jt("WebGLState:",B)}}function _t(){try{i.compressedTexSubImage3D(...arguments)}catch(B){Jt("WebGLState:",B)}}function at(){try{i.texStorage2D(...arguments)}catch(B){Jt("WebGLState:",B)}}function Rt(){try{i.texStorage3D(...arguments)}catch(B){Jt("WebGLState:",B)}}function Dt(){try{i.texImage2D(...arguments)}catch(B){Jt("WebGLState:",B)}}function Q(){try{i.texImage3D(...arguments)}catch(B){Jt("WebGLState:",B)}}function ot(B){Ct.equals(B)===!1&&(i.scissor(B.x,B.y,B.z,B.w),Ct.copy(B))}function Mt(B){It.equals(B)===!1&&(i.viewport(B.x,B.y,B.z,B.w),It.copy(B))}function Et(B,lt){let ct=c.get(lt);ct===void 0&&(ct=new WeakMap,c.set(lt,ct));let xt=ct.get(B);xt===void 0&&(xt=i.getUniformBlockIndex(lt,B.name),ct.set(B,xt))}function pt(B,lt){const xt=c.get(lt).get(B);l.get(lt)!==xt&&(i.uniformBlockBinding(lt,xt,B.__bindingPointIndex),l.set(lt,xt))}function Wt(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),a.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),h={},$=null,J={},f={},u=new WeakMap,m=[],g=null,v=!1,p=null,d=null,x=null,y=null,S=null,A=null,b=null,w=new Nt(0,0,0),_=0,E=!1,D=null,P=null,U=null,I=null,z=null,Ct.set(0,0,i.canvas.width,i.canvas.height),It.set(0,0,i.canvas.width,i.canvas.height),r.reset(),a.reset(),o.reset()}return{buffers:{color:r,depth:a,stencil:o},enable:it,disable:nt,bindFramebuffer:Ut,drawBuffers:Tt,useProgram:Pt,setBlending:$t,setMaterial:ne,setFlipSided:gt,setCullFace:rt,setLineWidth:C,setPolygonOffset:Lt,setScissorTest:vt,activeTexture:qt,bindTexture:ht,unbindTexture:R,compressedTexImage2D:M,compressedTexImage3D:O,texImage2D:Dt,texImage3D:Q,updateUBOMapping:Et,uniformBlockBinding:pt,texStorage2D:at,texStorage3D:Rt,texSubImage2D:q,texSubImage3D:j,compressedTexSubImage2D:X,compressedTexSubImage3D:_t,scissor:ot,viewport:Mt,reset:Wt}}function x_(i,t,e,n,s,r,a){const o=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Ft,h=new WeakMap;let f;const u=new WeakMap;let m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(R,M){return m?new OffscreenCanvas(R,M):Tr("canvas")}function v(R,M,O){let q=1;const j=ht(R);if((j.width>O||j.height>O)&&(q=O/Math.max(j.width,j.height)),q<1)if(typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&R instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&R instanceof ImageBitmap||typeof VideoFrame<"u"&&R instanceof VideoFrame){const X=Math.floor(q*j.width),_t=Math.floor(q*j.height);f===void 0&&(f=g(X,_t));const at=M?g(X,_t):f;return at.width=X,at.height=_t,at.getContext("2d").drawImage(R,0,0,X,_t),zt("WebGLRenderer: Texture has been resized from ("+j.width+"x"+j.height+") to ("+X+"x"+_t+")."),at}else return"data"in R&&zt("WebGLRenderer: Image in DataTexture is too big ("+j.width+"x"+j.height+")."),R;return R}function p(R){return R.generateMipmaps}function d(R){i.generateMipmap(R)}function x(R){return R.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:R.isWebGL3DRenderTarget?i.TEXTURE_3D:R.isWebGLArrayRenderTarget||R.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function y(R,M,O,q,j=!1){if(R!==null){if(i[R]!==void 0)return i[R];zt("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+R+"'")}let X=M;if(M===i.RED&&(O===i.FLOAT&&(X=i.R32F),O===i.HALF_FLOAT&&(X=i.R16F),O===i.UNSIGNED_BYTE&&(X=i.R8)),M===i.RED_INTEGER&&(O===i.UNSIGNED_BYTE&&(X=i.R8UI),O===i.UNSIGNED_SHORT&&(X=i.R16UI),O===i.UNSIGNED_INT&&(X=i.R32UI),O===i.BYTE&&(X=i.R8I),O===i.SHORT&&(X=i.R16I),O===i.INT&&(X=i.R32I)),M===i.RG&&(O===i.FLOAT&&(X=i.RG32F),O===i.HALF_FLOAT&&(X=i.RG16F),O===i.UNSIGNED_BYTE&&(X=i.RG8)),M===i.RG_INTEGER&&(O===i.UNSIGNED_BYTE&&(X=i.RG8UI),O===i.UNSIGNED_SHORT&&(X=i.RG16UI),O===i.UNSIGNED_INT&&(X=i.RG32UI),O===i.BYTE&&(X=i.RG8I),O===i.SHORT&&(X=i.RG16I),O===i.INT&&(X=i.RG32I)),M===i.RGB_INTEGER&&(O===i.UNSIGNED_BYTE&&(X=i.RGB8UI),O===i.UNSIGNED_SHORT&&(X=i.RGB16UI),O===i.UNSIGNED_INT&&(X=i.RGB32UI),O===i.BYTE&&(X=i.RGB8I),O===i.SHORT&&(X=i.RGB16I),O===i.INT&&(X=i.RGB32I)),M===i.RGBA_INTEGER&&(O===i.UNSIGNED_BYTE&&(X=i.RGBA8UI),O===i.UNSIGNED_SHORT&&(X=i.RGBA16UI),O===i.UNSIGNED_INT&&(X=i.RGBA32UI),O===i.BYTE&&(X=i.RGBA8I),O===i.SHORT&&(X=i.RGBA16I),O===i.INT&&(X=i.RGBA32I)),M===i.RGB&&(O===i.UNSIGNED_INT_5_9_9_9_REV&&(X=i.RGB9_E5),O===i.UNSIGNED_INT_10F_11F_11F_REV&&(X=i.R11F_G11F_B10F)),M===i.RGBA){const _t=j?br:Qt.getTransfer(q);O===i.FLOAT&&(X=i.RGBA32F),O===i.HALF_FLOAT&&(X=i.RGBA16F),O===i.UNSIGNED_BYTE&&(X=_t===ae?i.SRGB8_ALPHA8:i.RGBA8),O===i.UNSIGNED_SHORT_4_4_4_4&&(X=i.RGBA4),O===i.UNSIGNED_SHORT_5_5_5_1&&(X=i.RGB5_A1)}return(X===i.R16F||X===i.R32F||X===i.RG16F||X===i.RG32F||X===i.RGBA16F||X===i.RGBA32F)&&t.get("EXT_color_buffer_float"),X}function S(R,M){let O;return R?M===null||M===pn||M===Ts?O=i.DEPTH24_STENCIL8:M===nn?O=i.DEPTH32F_STENCIL8:M===bs&&(O=i.DEPTH24_STENCIL8,zt("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):M===null||M===pn||M===Ts?O=i.DEPTH_COMPONENT24:M===nn?O=i.DEPTH_COMPONENT32F:M===bs&&(O=i.DEPTH_COMPONENT16),O}function A(R,M){return p(R)===!0||R.isFramebufferTexture&&R.minFilter!==Re&&R.minFilter!==be?Math.log2(Math.max(M.width,M.height))+1:R.mipmaps!==void 0&&R.mipmaps.length>0?R.mipmaps.length:R.isCompressedTexture&&Array.isArray(R.image)?M.mipmaps.length:1}function b(R){const M=R.target;M.removeEventListener("dispose",b),_(M),M.isVideoTexture&&h.delete(M)}function w(R){const M=R.target;M.removeEventListener("dispose",w),D(M)}function _(R){const M=n.get(R);if(M.__webglInit===void 0)return;const O=R.source,q=u.get(O);if(q){const j=q[M.__cacheKey];j.usedTimes--,j.usedTimes===0&&E(R),Object.keys(q).length===0&&u.delete(O)}n.remove(R)}function E(R){const M=n.get(R);i.deleteTexture(M.__webglTexture);const O=R.source,q=u.get(O);delete q[M.__cacheKey],a.memory.textures--}function D(R){const M=n.get(R);if(R.depthTexture&&(R.depthTexture.dispose(),n.remove(R.depthTexture)),R.isWebGLCubeRenderTarget)for(let q=0;q<6;q++){if(Array.isArray(M.__webglFramebuffer[q]))for(let j=0;j<M.__webglFramebuffer[q].length;j++)i.deleteFramebuffer(M.__webglFramebuffer[q][j]);else i.deleteFramebuffer(M.__webglFramebuffer[q]);M.__webglDepthbuffer&&i.deleteRenderbuffer(M.__webglDepthbuffer[q])}else{if(Array.isArray(M.__webglFramebuffer))for(let q=0;q<M.__webglFramebuffer.length;q++)i.deleteFramebuffer(M.__webglFramebuffer[q]);else i.deleteFramebuffer(M.__webglFramebuffer);if(M.__webglDepthbuffer&&i.deleteRenderbuffer(M.__webglDepthbuffer),M.__webglMultisampledFramebuffer&&i.deleteFramebuffer(M.__webglMultisampledFramebuffer),M.__webglColorRenderbuffer)for(let q=0;q<M.__webglColorRenderbuffer.length;q++)M.__webglColorRenderbuffer[q]&&i.deleteRenderbuffer(M.__webglColorRenderbuffer[q]);M.__webglDepthRenderbuffer&&i.deleteRenderbuffer(M.__webglDepthRenderbuffer)}const O=R.textures;for(let q=0,j=O.length;q<j;q++){const X=n.get(O[q]);X.__webglTexture&&(i.deleteTexture(X.__webglTexture),a.memory.textures--),n.remove(O[q])}n.remove(R)}let P=0;function U(){P=0}function I(){const R=P;return R>=s.maxTextures&&zt("WebGLTextures: Trying to use "+R+" texture units while this GPU supports only "+s.maxTextures),P+=1,R}function z(R){const M=[];return M.push(R.wrapS),M.push(R.wrapT),M.push(R.wrapR||0),M.push(R.magFilter),M.push(R.minFilter),M.push(R.anisotropy),M.push(R.internalFormat),M.push(R.format),M.push(R.type),M.push(R.generateMipmaps),M.push(R.premultiplyAlpha),M.push(R.flipY),M.push(R.unpackAlignment),M.push(R.colorSpace),M.join()}function F(R,M){const O=n.get(R);if(R.isVideoTexture&&vt(R),R.isRenderTargetTexture===!1&&R.isExternalTexture!==!0&&R.version>0&&O.__version!==R.version){const q=R.image;if(q===null)zt("WebGLRenderer: Texture marked for update but no image data found.");else if(q.complete===!1)zt("WebGLRenderer: Texture marked for update but image is incomplete");else{Z(O,R,M);return}}else R.isExternalTexture&&(O.__webglTexture=R.sourceTexture?R.sourceTexture:null);e.bindTexture(i.TEXTURE_2D,O.__webglTexture,i.TEXTURE0+M)}function N(R,M){const O=n.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&O.__version!==R.version){Z(O,R,M);return}else R.isExternalTexture&&(O.__webglTexture=R.sourceTexture?R.sourceTexture:null);e.bindTexture(i.TEXTURE_2D_ARRAY,O.__webglTexture,i.TEXTURE0+M)}function H(R,M){const O=n.get(R);if(R.isRenderTargetTexture===!1&&R.version>0&&O.__version!==R.version){Z(O,R,M);return}e.bindTexture(i.TEXTURE_3D,O.__webglTexture,i.TEXTURE0+M)}function K(R,M){const O=n.get(R);if(R.isCubeDepthTexture!==!0&&R.version>0&&O.__version!==R.version){it(O,R,M);return}e.bindTexture(i.TEXTURE_CUBE_MAP,O.__webglTexture,i.TEXTURE0+M)}const $={[li]:i.REPEAT,[bn]:i.CLAMP_TO_EDGE,[$a]:i.MIRRORED_REPEAT},J={[Re]:i.NEAREST,[Ff]:i.NEAREST_MIPMAP_NEAREST,[Fs]:i.NEAREST_MIPMAP_LINEAR,[be]:i.LINEAR,[$r]:i.LINEAR_MIPMAP_NEAREST,[ri]:i.LINEAR_MIPMAP_LINEAR},st={[zf]:i.NEVER,[Wf]:i.ALWAYS,[Gf]:i.LESS,[Jo]:i.LEQUAL,[Hf]:i.EQUAL,[Qo]:i.GEQUAL,[Vf]:i.GREATER,[kf]:i.NOTEQUAL};function et(R,M){if(M.type===nn&&t.has("OES_texture_float_linear")===!1&&(M.magFilter===be||M.magFilter===$r||M.magFilter===Fs||M.magFilter===ri||M.minFilter===be||M.minFilter===$r||M.minFilter===Fs||M.minFilter===ri)&&zt("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(R,i.TEXTURE_WRAP_S,$[M.wrapS]),i.texParameteri(R,i.TEXTURE_WRAP_T,$[M.wrapT]),(R===i.TEXTURE_3D||R===i.TEXTURE_2D_ARRAY)&&i.texParameteri(R,i.TEXTURE_WRAP_R,$[M.wrapR]),i.texParameteri(R,i.TEXTURE_MAG_FILTER,J[M.magFilter]),i.texParameteri(R,i.TEXTURE_MIN_FILTER,J[M.minFilter]),M.compareFunction&&(i.texParameteri(R,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(R,i.TEXTURE_COMPARE_FUNC,st[M.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(M.magFilter===Re||M.minFilter!==Fs&&M.minFilter!==ri||M.type===nn&&t.has("OES_texture_float_linear")===!1)return;if(M.anisotropy>1||n.get(M).__currentAnisotropy){const O=t.get("EXT_texture_filter_anisotropic");i.texParameterf(R,O.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(M.anisotropy,s.getMaxAnisotropy())),n.get(M).__currentAnisotropy=M.anisotropy}}}function Ct(R,M){let O=!1;R.__webglInit===void 0&&(R.__webglInit=!0,M.addEventListener("dispose",b));const q=M.source;let j=u.get(q);j===void 0&&(j={},u.set(q,j));const X=z(M);if(X!==R.__cacheKey){j[X]===void 0&&(j[X]={texture:i.createTexture(),usedTimes:0},a.memory.textures++,O=!0),j[X].usedTimes++;const _t=j[R.__cacheKey];_t!==void 0&&(j[R.__cacheKey].usedTimes--,_t.usedTimes===0&&E(M)),R.__cacheKey=X,R.__webglTexture=j[X].texture}return O}function It(R,M,O){return Math.floor(Math.floor(R/O)/M)}function Kt(R,M,O,q){const X=R.updateRanges;if(X.length===0)e.texSubImage2D(i.TEXTURE_2D,0,0,0,M.width,M.height,O,q,M.data);else{X.sort((Q,ot)=>Q.start-ot.start);let _t=0;for(let Q=1;Q<X.length;Q++){const ot=X[_t],Mt=X[Q],Et=ot.start+ot.count,pt=It(Mt.start,M.width,4),Wt=It(ot.start,M.width,4);Mt.start<=Et+1&&pt===Wt&&It(Mt.start+Mt.count-1,M.width,4)===pt?ot.count=Math.max(ot.count,Mt.start+Mt.count-ot.start):(++_t,X[_t]=Mt)}X.length=_t+1;const at=i.getParameter(i.UNPACK_ROW_LENGTH),Rt=i.getParameter(i.UNPACK_SKIP_PIXELS),Dt=i.getParameter(i.UNPACK_SKIP_ROWS);i.pixelStorei(i.UNPACK_ROW_LENGTH,M.width);for(let Q=0,ot=X.length;Q<ot;Q++){const Mt=X[Q],Et=Math.floor(Mt.start/4),pt=Math.ceil(Mt.count/4),Wt=Et%M.width,B=Math.floor(Et/M.width),lt=pt,ct=1;i.pixelStorei(i.UNPACK_SKIP_PIXELS,Wt),i.pixelStorei(i.UNPACK_SKIP_ROWS,B),e.texSubImage2D(i.TEXTURE_2D,0,Wt,B,lt,ct,O,q,M.data)}R.clearUpdateRanges(),i.pixelStorei(i.UNPACK_ROW_LENGTH,at),i.pixelStorei(i.UNPACK_SKIP_PIXELS,Rt),i.pixelStorei(i.UNPACK_SKIP_ROWS,Dt)}}function Z(R,M,O){let q=i.TEXTURE_2D;(M.isDataArrayTexture||M.isCompressedArrayTexture)&&(q=i.TEXTURE_2D_ARRAY),M.isData3DTexture&&(q=i.TEXTURE_3D);const j=Ct(R,M),X=M.source;e.bindTexture(q,R.__webglTexture,i.TEXTURE0+O);const _t=n.get(X);if(X.version!==_t.__version||j===!0){e.activeTexture(i.TEXTURE0+O);const at=Qt.getPrimaries(Qt.workingColorSpace),Rt=M.colorSpace===yn?null:Qt.getPrimaries(M.colorSpace),Dt=M.colorSpace===yn||at===Rt?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,M.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,M.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,M.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Dt);let Q=v(M.image,!1,s.maxTextureSize);Q=qt(M,Q);const ot=r.convert(M.format,M.colorSpace),Mt=r.convert(M.type);let Et=y(M.internalFormat,ot,Mt,M.colorSpace,M.isVideoTexture);et(q,M);let pt;const Wt=M.mipmaps,B=M.isVideoTexture!==!0,lt=_t.__version===void 0||j===!0,ct=X.dataReady,xt=A(M,Q);if(M.isDepthTexture)Et=S(M.format===ai,M.type),lt&&(B?e.texStorage2D(i.TEXTURE_2D,1,Et,Q.width,Q.height):e.texImage2D(i.TEXTURE_2D,0,Et,Q.width,Q.height,0,ot,Mt,null));else if(M.isDataTexture)if(Wt.length>0){B&&lt&&e.texStorage2D(i.TEXTURE_2D,xt,Et,Wt[0].width,Wt[0].height);for(let tt=0,Y=Wt.length;tt<Y;tt++)pt=Wt[tt],B?ct&&e.texSubImage2D(i.TEXTURE_2D,tt,0,0,pt.width,pt.height,ot,Mt,pt.data):e.texImage2D(i.TEXTURE_2D,tt,Et,pt.width,pt.height,0,ot,Mt,pt.data);M.generateMipmaps=!1}else B?(lt&&e.texStorage2D(i.TEXTURE_2D,xt,Et,Q.width,Q.height),ct&&Kt(M,Q,ot,Mt)):e.texImage2D(i.TEXTURE_2D,0,Et,Q.width,Q.height,0,ot,Mt,Q.data);else if(M.isCompressedTexture)if(M.isCompressedArrayTexture){B&&lt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,xt,Et,Wt[0].width,Wt[0].height,Q.depth);for(let tt=0,Y=Wt.length;tt<Y;tt++)if(pt=Wt[tt],M.format!==qe)if(ot!==null)if(B){if(ct)if(M.layerUpdates.size>0){const St=ol(pt.width,pt.height,M.format,M.type);for(const Ot of M.layerUpdates){const he=pt.data.subarray(Ot*St/pt.data.BYTES_PER_ELEMENT,(Ot+1)*St/pt.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,tt,0,0,Ot,pt.width,pt.height,1,ot,he)}M.clearLayerUpdates()}else e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,tt,0,0,0,pt.width,pt.height,Q.depth,ot,pt.data)}else e.compressedTexImage3D(i.TEXTURE_2D_ARRAY,tt,Et,pt.width,pt.height,Q.depth,0,pt.data,0,0);else zt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else B?ct&&e.texSubImage3D(i.TEXTURE_2D_ARRAY,tt,0,0,0,pt.width,pt.height,Q.depth,ot,Mt,pt.data):e.texImage3D(i.TEXTURE_2D_ARRAY,tt,Et,pt.width,pt.height,Q.depth,0,ot,Mt,pt.data)}else{B&&lt&&e.texStorage2D(i.TEXTURE_2D,xt,Et,Wt[0].width,Wt[0].height);for(let tt=0,Y=Wt.length;tt<Y;tt++)pt=Wt[tt],M.format!==qe?ot!==null?B?ct&&e.compressedTexSubImage2D(i.TEXTURE_2D,tt,0,0,pt.width,pt.height,ot,pt.data):e.compressedTexImage2D(i.TEXTURE_2D,tt,Et,pt.width,pt.height,0,pt.data):zt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):B?ct&&e.texSubImage2D(i.TEXTURE_2D,tt,0,0,pt.width,pt.height,ot,Mt,pt.data):e.texImage2D(i.TEXTURE_2D,tt,Et,pt.width,pt.height,0,ot,Mt,pt.data)}else if(M.isDataArrayTexture)if(B){if(lt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,xt,Et,Q.width,Q.height,Q.depth),ct)if(M.layerUpdates.size>0){const tt=ol(Q.width,Q.height,M.format,M.type);for(const Y of M.layerUpdates){const St=Q.data.subarray(Y*tt/Q.data.BYTES_PER_ELEMENT,(Y+1)*tt/Q.data.BYTES_PER_ELEMENT);e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,Y,Q.width,Q.height,1,ot,Mt,St)}M.clearLayerUpdates()}else e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,Q.width,Q.height,Q.depth,ot,Mt,Q.data)}else e.texImage3D(i.TEXTURE_2D_ARRAY,0,Et,Q.width,Q.height,Q.depth,0,ot,Mt,Q.data);else if(M.isData3DTexture)B?(lt&&e.texStorage3D(i.TEXTURE_3D,xt,Et,Q.width,Q.height,Q.depth),ct&&e.texSubImage3D(i.TEXTURE_3D,0,0,0,0,Q.width,Q.height,Q.depth,ot,Mt,Q.data)):e.texImage3D(i.TEXTURE_3D,0,Et,Q.width,Q.height,Q.depth,0,ot,Mt,Q.data);else if(M.isFramebufferTexture){if(lt)if(B)e.texStorage2D(i.TEXTURE_2D,xt,Et,Q.width,Q.height);else{let tt=Q.width,Y=Q.height;for(let St=0;St<xt;St++)e.texImage2D(i.TEXTURE_2D,St,Et,tt,Y,0,ot,Mt,null),tt>>=1,Y>>=1}}else if(Wt.length>0){if(B&&lt){const tt=ht(Wt[0]);e.texStorage2D(i.TEXTURE_2D,xt,Et,tt.width,tt.height)}for(let tt=0,Y=Wt.length;tt<Y;tt++)pt=Wt[tt],B?ct&&e.texSubImage2D(i.TEXTURE_2D,tt,0,0,ot,Mt,pt):e.texImage2D(i.TEXTURE_2D,tt,Et,ot,Mt,pt);M.generateMipmaps=!1}else if(B){if(lt){const tt=ht(Q);e.texStorage2D(i.TEXTURE_2D,xt,Et,tt.width,tt.height)}ct&&e.texSubImage2D(i.TEXTURE_2D,0,0,0,ot,Mt,Q)}else e.texImage2D(i.TEXTURE_2D,0,Et,ot,Mt,Q);p(M)&&d(q),_t.__version=X.version,M.onUpdate&&M.onUpdate(M)}R.__version=M.version}function it(R,M,O){if(M.image.length!==6)return;const q=Ct(R,M),j=M.source;e.bindTexture(i.TEXTURE_CUBE_MAP,R.__webglTexture,i.TEXTURE0+O);const X=n.get(j);if(j.version!==X.__version||q===!0){e.activeTexture(i.TEXTURE0+O);const _t=Qt.getPrimaries(Qt.workingColorSpace),at=M.colorSpace===yn?null:Qt.getPrimaries(M.colorSpace),Rt=M.colorSpace===yn||_t===at?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,M.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,M.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,M.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Rt);const Dt=M.isCompressedTexture||M.image[0].isCompressedTexture,Q=M.image[0]&&M.image[0].isDataTexture,ot=[];for(let Y=0;Y<6;Y++)!Dt&&!Q?ot[Y]=v(M.image[Y],!0,s.maxCubemapSize):ot[Y]=Q?M.image[Y].image:M.image[Y],ot[Y]=qt(M,ot[Y]);const Mt=ot[0],Et=r.convert(M.format,M.colorSpace),pt=r.convert(M.type),Wt=y(M.internalFormat,Et,pt,M.colorSpace),B=M.isVideoTexture!==!0,lt=X.__version===void 0||q===!0,ct=j.dataReady;let xt=A(M,Mt);et(i.TEXTURE_CUBE_MAP,M);let tt;if(Dt){B&&lt&&e.texStorage2D(i.TEXTURE_CUBE_MAP,xt,Wt,Mt.width,Mt.height);for(let Y=0;Y<6;Y++){tt=ot[Y].mipmaps;for(let St=0;St<tt.length;St++){const Ot=tt[St];M.format!==qe?Et!==null?B?ct&&e.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,St,0,0,Ot.width,Ot.height,Et,Ot.data):e.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,St,Wt,Ot.width,Ot.height,0,Ot.data):zt("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):B?ct&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,St,0,0,Ot.width,Ot.height,Et,pt,Ot.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,St,Wt,Ot.width,Ot.height,0,Et,pt,Ot.data)}}}else{if(tt=M.mipmaps,B&&lt){tt.length>0&&xt++;const Y=ht(ot[0]);e.texStorage2D(i.TEXTURE_CUBE_MAP,xt,Wt,Y.width,Y.height)}for(let Y=0;Y<6;Y++)if(Q){B?ct&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,0,0,ot[Y].width,ot[Y].height,Et,pt,ot[Y].data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,Wt,ot[Y].width,ot[Y].height,0,Et,pt,ot[Y].data);for(let St=0;St<tt.length;St++){const he=tt[St].image[Y].image;B?ct&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,St+1,0,0,he.width,he.height,Et,pt,he.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,St+1,Wt,he.width,he.height,0,Et,pt,he.data)}}else{B?ct&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,0,0,Et,pt,ot[Y]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,0,Wt,Et,pt,ot[Y]);for(let St=0;St<tt.length;St++){const Ot=tt[St];B?ct&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,St+1,0,0,Et,pt,Ot.image[Y]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Y,St+1,Wt,Et,pt,Ot.image[Y])}}}p(M)&&d(i.TEXTURE_CUBE_MAP),X.__version=j.version,M.onUpdate&&M.onUpdate(M)}R.__version=M.version}function nt(R,M,O,q,j,X){const _t=r.convert(O.format,O.colorSpace),at=r.convert(O.type),Rt=y(O.internalFormat,_t,at,O.colorSpace),Dt=n.get(M),Q=n.get(O);if(Q.__renderTarget=M,!Dt.__hasExternalTextures){const ot=Math.max(1,M.width>>X),Mt=Math.max(1,M.height>>X);j===i.TEXTURE_3D||j===i.TEXTURE_2D_ARRAY?e.texImage3D(j,X,Rt,ot,Mt,M.depth,0,_t,at,null):e.texImage2D(j,X,Rt,ot,Mt,0,_t,at,null)}e.bindFramebuffer(i.FRAMEBUFFER,R),Lt(M)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,q,j,Q.__webglTexture,0,C(M)):(j===i.TEXTURE_2D||j>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&j<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,q,j,Q.__webglTexture,X),e.bindFramebuffer(i.FRAMEBUFFER,null)}function Ut(R,M,O){if(i.bindRenderbuffer(i.RENDERBUFFER,R),M.depthBuffer){const q=M.depthTexture,j=q&&q.isDepthTexture?q.type:null,X=S(M.stencilBuffer,j),_t=M.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;Lt(M)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,C(M),X,M.width,M.height):O?i.renderbufferStorageMultisample(i.RENDERBUFFER,C(M),X,M.width,M.height):i.renderbufferStorage(i.RENDERBUFFER,X,M.width,M.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,_t,i.RENDERBUFFER,R)}else{const q=M.textures;for(let j=0;j<q.length;j++){const X=q[j],_t=r.convert(X.format,X.colorSpace),at=r.convert(X.type),Rt=y(X.internalFormat,_t,at,X.colorSpace);Lt(M)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,C(M),Rt,M.width,M.height):O?i.renderbufferStorageMultisample(i.RENDERBUFFER,C(M),Rt,M.width,M.height):i.renderbufferStorage(i.RENDERBUFFER,Rt,M.width,M.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Tt(R,M,O){const q=M.isWebGLCubeRenderTarget===!0;if(e.bindFramebuffer(i.FRAMEBUFFER,R),!(M.depthTexture&&M.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");const j=n.get(M.depthTexture);if(j.__renderTarget=M,(!j.__webglTexture||M.depthTexture.image.width!==M.width||M.depthTexture.image.height!==M.height)&&(M.depthTexture.image.width=M.width,M.depthTexture.image.height=M.height,M.depthTexture.needsUpdate=!0),q){if(j.__webglInit===void 0&&(j.__webglInit=!0,M.depthTexture.addEventListener("dispose",b)),j.__webglTexture===void 0){j.__webglTexture=i.createTexture(),e.bindTexture(i.TEXTURE_CUBE_MAP,j.__webglTexture),et(i.TEXTURE_CUBE_MAP,M.depthTexture);const Dt=r.convert(M.depthTexture.format),Q=r.convert(M.depthTexture.type);let ot;M.depthTexture.format===Cn?ot=i.DEPTH_COMPONENT24:M.depthTexture.format===ai&&(ot=i.DEPTH24_STENCIL8);for(let Mt=0;Mt<6;Mt++)i.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+Mt,0,ot,M.width,M.height,0,Dt,Q,null)}}else F(M.depthTexture,0);const X=j.__webglTexture,_t=C(M),at=q?i.TEXTURE_CUBE_MAP_POSITIVE_X+O:i.TEXTURE_2D,Rt=M.depthTexture.format===ai?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(M.depthTexture.format===Cn)Lt(M)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Rt,at,X,0,_t):i.framebufferTexture2D(i.FRAMEBUFFER,Rt,at,X,0);else if(M.depthTexture.format===ai)Lt(M)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Rt,at,X,0,_t):i.framebufferTexture2D(i.FRAMEBUFFER,Rt,at,X,0);else throw new Error("Unknown depthTexture format")}function Pt(R){const M=n.get(R),O=R.isWebGLCubeRenderTarget===!0;if(M.__boundDepthTexture!==R.depthTexture){const q=R.depthTexture;if(M.__depthDisposeCallback&&M.__depthDisposeCallback(),q){const j=()=>{delete M.__boundDepthTexture,delete M.__depthDisposeCallback,q.removeEventListener("dispose",j)};q.addEventListener("dispose",j),M.__depthDisposeCallback=j}M.__boundDepthTexture=q}if(R.depthTexture&&!M.__autoAllocateDepthBuffer)if(O)for(let q=0;q<6;q++)Tt(M.__webglFramebuffer[q],R,q);else{const q=R.texture.mipmaps;q&&q.length>0?Tt(M.__webglFramebuffer[0],R,0):Tt(M.__webglFramebuffer,R,0)}else if(O){M.__webglDepthbuffer=[];for(let q=0;q<6;q++)if(e.bindFramebuffer(i.FRAMEBUFFER,M.__webglFramebuffer[q]),M.__webglDepthbuffer[q]===void 0)M.__webglDepthbuffer[q]=i.createRenderbuffer(),Ut(M.__webglDepthbuffer[q],R,!1);else{const j=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,X=M.__webglDepthbuffer[q];i.bindRenderbuffer(i.RENDERBUFFER,X),i.framebufferRenderbuffer(i.FRAMEBUFFER,j,i.RENDERBUFFER,X)}}else{const q=R.texture.mipmaps;if(q&&q.length>0?e.bindFramebuffer(i.FRAMEBUFFER,M.__webglFramebuffer[0]):e.bindFramebuffer(i.FRAMEBUFFER,M.__webglFramebuffer),M.__webglDepthbuffer===void 0)M.__webglDepthbuffer=i.createRenderbuffer(),Ut(M.__webglDepthbuffer,R,!1);else{const j=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,X=M.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,X),i.framebufferRenderbuffer(i.FRAMEBUFFER,j,i.RENDERBUFFER,X)}}e.bindFramebuffer(i.FRAMEBUFFER,null)}function ie(R,M,O){const q=n.get(R);M!==void 0&&nt(q.__webglFramebuffer,R,R.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),O!==void 0&&Pt(R)}function Yt(R){const M=R.texture,O=n.get(R),q=n.get(M);R.addEventListener("dispose",w);const j=R.textures,X=R.isWebGLCubeRenderTarget===!0,_t=j.length>1;if(_t||(q.__webglTexture===void 0&&(q.__webglTexture=i.createTexture()),q.__version=M.version,a.memory.textures++),X){O.__webglFramebuffer=[];for(let at=0;at<6;at++)if(M.mipmaps&&M.mipmaps.length>0){O.__webglFramebuffer[at]=[];for(let Rt=0;Rt<M.mipmaps.length;Rt++)O.__webglFramebuffer[at][Rt]=i.createFramebuffer()}else O.__webglFramebuffer[at]=i.createFramebuffer()}else{if(M.mipmaps&&M.mipmaps.length>0){O.__webglFramebuffer=[];for(let at=0;at<M.mipmaps.length;at++)O.__webglFramebuffer[at]=i.createFramebuffer()}else O.__webglFramebuffer=i.createFramebuffer();if(_t)for(let at=0,Rt=j.length;at<Rt;at++){const Dt=n.get(j[at]);Dt.__webglTexture===void 0&&(Dt.__webglTexture=i.createTexture(),a.memory.textures++)}if(R.samples>0&&Lt(R)===!1){O.__webglMultisampledFramebuffer=i.createFramebuffer(),O.__webglColorRenderbuffer=[],e.bindFramebuffer(i.FRAMEBUFFER,O.__webglMultisampledFramebuffer);for(let at=0;at<j.length;at++){const Rt=j[at];O.__webglColorRenderbuffer[at]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,O.__webglColorRenderbuffer[at]);const Dt=r.convert(Rt.format,Rt.colorSpace),Q=r.convert(Rt.type),ot=y(Rt.internalFormat,Dt,Q,Rt.colorSpace,R.isXRRenderTarget===!0),Mt=C(R);i.renderbufferStorageMultisample(i.RENDERBUFFER,Mt,ot,R.width,R.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+at,i.RENDERBUFFER,O.__webglColorRenderbuffer[at])}i.bindRenderbuffer(i.RENDERBUFFER,null),R.depthBuffer&&(O.__webglDepthRenderbuffer=i.createRenderbuffer(),Ut(O.__webglDepthRenderbuffer,R,!0)),e.bindFramebuffer(i.FRAMEBUFFER,null)}}if(X){e.bindTexture(i.TEXTURE_CUBE_MAP,q.__webglTexture),et(i.TEXTURE_CUBE_MAP,M);for(let at=0;at<6;at++)if(M.mipmaps&&M.mipmaps.length>0)for(let Rt=0;Rt<M.mipmaps.length;Rt++)nt(O.__webglFramebuffer[at][Rt],R,M,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+at,Rt);else nt(O.__webglFramebuffer[at],R,M,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+at,0);p(M)&&d(i.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(_t){for(let at=0,Rt=j.length;at<Rt;at++){const Dt=j[at],Q=n.get(Dt);let ot=i.TEXTURE_2D;(R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(ot=R.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(ot,Q.__webglTexture),et(ot,Dt),nt(O.__webglFramebuffer,R,Dt,i.COLOR_ATTACHMENT0+at,ot,0),p(Dt)&&d(ot)}e.unbindTexture()}else{let at=i.TEXTURE_2D;if((R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(at=R.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(at,q.__webglTexture),et(at,M),M.mipmaps&&M.mipmaps.length>0)for(let Rt=0;Rt<M.mipmaps.length;Rt++)nt(O.__webglFramebuffer[Rt],R,M,i.COLOR_ATTACHMENT0,at,Rt);else nt(O.__webglFramebuffer,R,M,i.COLOR_ATTACHMENT0,at,0);p(M)&&d(at),e.unbindTexture()}R.depthBuffer&&Pt(R)}function $t(R){const M=R.textures;for(let O=0,q=M.length;O<q;O++){const j=M[O];if(p(j)){const X=x(R),_t=n.get(j).__webglTexture;e.bindTexture(X,_t),d(X),e.unbindTexture()}}}const ne=[],gt=[];function rt(R){if(R.samples>0){if(Lt(R)===!1){const M=R.textures,O=R.width,q=R.height;let j=i.COLOR_BUFFER_BIT;const X=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,_t=n.get(R),at=M.length>1;if(at)for(let Dt=0;Dt<M.length;Dt++)e.bindFramebuffer(i.FRAMEBUFFER,_t.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Dt,i.RENDERBUFFER,null),e.bindFramebuffer(i.FRAMEBUFFER,_t.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+Dt,i.TEXTURE_2D,null,0);e.bindFramebuffer(i.READ_FRAMEBUFFER,_t.__webglMultisampledFramebuffer);const Rt=R.texture.mipmaps;Rt&&Rt.length>0?e.bindFramebuffer(i.DRAW_FRAMEBUFFER,_t.__webglFramebuffer[0]):e.bindFramebuffer(i.DRAW_FRAMEBUFFER,_t.__webglFramebuffer);for(let Dt=0;Dt<M.length;Dt++){if(R.resolveDepthBuffer&&(R.depthBuffer&&(j|=i.DEPTH_BUFFER_BIT),R.stencilBuffer&&R.resolveStencilBuffer&&(j|=i.STENCIL_BUFFER_BIT)),at){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,_t.__webglColorRenderbuffer[Dt]);const Q=n.get(M[Dt]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,Q,0)}i.blitFramebuffer(0,0,O,q,0,0,O,q,j,i.NEAREST),l===!0&&(ne.length=0,gt.length=0,ne.push(i.COLOR_ATTACHMENT0+Dt),R.depthBuffer&&R.resolveDepthBuffer===!1&&(ne.push(X),gt.push(X),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,gt)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,ne))}if(e.bindFramebuffer(i.READ_FRAMEBUFFER,null),e.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),at)for(let Dt=0;Dt<M.length;Dt++){e.bindFramebuffer(i.FRAMEBUFFER,_t.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+Dt,i.RENDERBUFFER,_t.__webglColorRenderbuffer[Dt]);const Q=n.get(M[Dt]).__webglTexture;e.bindFramebuffer(i.FRAMEBUFFER,_t.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+Dt,i.TEXTURE_2D,Q,0)}e.bindFramebuffer(i.DRAW_FRAMEBUFFER,_t.__webglMultisampledFramebuffer)}else if(R.depthBuffer&&R.resolveDepthBuffer===!1&&l){const M=R.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[M])}}}function C(R){return Math.min(s.maxSamples,R.samples)}function Lt(R){const M=n.get(R);return R.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&M.__useRenderToTexture!==!1}function vt(R){const M=a.render.frame;h.get(R)!==M&&(h.set(R,M),R.update())}function qt(R,M){const O=R.colorSpace,q=R.format,j=R.type;return R.isCompressedTexture===!0||R.isVideoTexture===!0||O!==Yi&&O!==yn&&(Qt.getTransfer(O)===ae?(q!==qe||j!==We)&&zt("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Jt("WebGLTextures: Unsupported texture color space:",O)),M}function ht(R){return typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement?(c.width=R.naturalWidth||R.width,c.height=R.naturalHeight||R.height):typeof VideoFrame<"u"&&R instanceof VideoFrame?(c.width=R.displayWidth,c.height=R.displayHeight):(c.width=R.width,c.height=R.height),c}this.allocateTextureUnit=I,this.resetTextureUnits=U,this.setTexture2D=F,this.setTexture2DArray=N,this.setTexture3D=H,this.setTextureCube=K,this.rebindTextures=ie,this.setupRenderTarget=Yt,this.updateRenderTargetMipmap=$t,this.updateMultisampleRenderTarget=rt,this.setupDepthRenderbuffer=Pt,this.setupFrameBufferTexture=nt,this.useMultisampledRTT=Lt,this.isReversedDepthBuffer=function(){return e.buffers.depth.getReversed()}}function v_(i,t){function e(n,s=yn){let r;const a=Qt.getTransfer(s);if(n===We)return i.UNSIGNED_BYTE;if(n===Yo)return i.UNSIGNED_SHORT_4_4_4_4;if(n===qo)return i.UNSIGNED_SHORT_5_5_5_1;if(n===yu)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===bu)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===Su)return i.BYTE;if(n===Eu)return i.SHORT;if(n===bs)return i.UNSIGNED_SHORT;if(n===Xo)return i.INT;if(n===pn)return i.UNSIGNED_INT;if(n===nn)return i.FLOAT;if(n===Rn)return i.HALF_FLOAT;if(n===Tu)return i.ALPHA;if(n===Au)return i.RGB;if(n===qe)return i.RGBA;if(n===Cn)return i.DEPTH_COMPONENT;if(n===ai)return i.DEPTH_STENCIL;if(n===Ko)return i.RED;if(n===$o)return i.RED_INTEGER;if(n===Xi)return i.RG;if(n===Zo)return i.RG_INTEGER;if(n===jo)return i.RGBA_INTEGER;if(n===_r||n===xr||n===vr||n===Mr)if(a===ae)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===_r)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===xr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===vr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Mr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===_r)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===xr)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===vr)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Mr)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Za||n===ja||n===Ja||n===Qa)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===Za)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===ja)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Ja)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Qa)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===to||n===eo||n===no||n===io||n===so||n===ro||n===ao)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===to||n===eo)return a===ae?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===no)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===io)return r.COMPRESSED_R11_EAC;if(n===so)return r.COMPRESSED_SIGNED_R11_EAC;if(n===ro)return r.COMPRESSED_RG11_EAC;if(n===ao)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===oo||n===co||n===lo||n===uo||n===ho||n===fo||n===po||n===mo||n===go||n===_o||n===xo||n===vo||n===Mo||n===So)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===oo)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===co)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===lo)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===uo)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===ho)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===fo)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===po)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===mo)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===go)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===_o)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===xo)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===vo)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===Mo)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===So)return a===ae?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Eo||n===yo||n===bo)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===Eo)return a===ae?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===yo)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===bo)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===To||n===Ao||n===wo||n===Ro)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===To)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Ao)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===wo)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===Ro)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===Ts?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:e}}const M_=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,S_=`
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

}`;class E_{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){const n=new Gu(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){const e=t.cameras[0].viewport,n=new sn({vertexShader:M_,fragmentShader:S_,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new Bt(new es(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class y_ extends Qi{constructor(t,e){super();const n=this;let s=null,r=1,a=null,o="local-floor",l=1,c=null,h=null,f=null,u=null,m=null,g=null;const v=typeof XRWebGLBinding<"u",p=new E_,d={},x=e.getContextAttributes();let y=null,S=null;const A=[],b=[],w=new Ft;let _=null;const E=new ke;E.viewport=new pe;const D=new ke;D.viewport=new pe;const P=[E,D],U=new Ud;let I=null,z=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(Z){let it=A[Z];return it===void 0&&(it=new ia,A[Z]=it),it.getTargetRaySpace()},this.getControllerGrip=function(Z){let it=A[Z];return it===void 0&&(it=new ia,A[Z]=it),it.getGripSpace()},this.getHand=function(Z){let it=A[Z];return it===void 0&&(it=new ia,A[Z]=it),it.getHandSpace()};function F(Z){const it=b.indexOf(Z.inputSource);if(it===-1)return;const nt=A[it];nt!==void 0&&(nt.update(Z.inputSource,Z.frame,c||a),nt.dispatchEvent({type:Z.type,data:Z.inputSource}))}function N(){s.removeEventListener("select",F),s.removeEventListener("selectstart",F),s.removeEventListener("selectend",F),s.removeEventListener("squeeze",F),s.removeEventListener("squeezestart",F),s.removeEventListener("squeezeend",F),s.removeEventListener("end",N),s.removeEventListener("inputsourceschange",H);for(let Z=0;Z<A.length;Z++){const it=b[Z];it!==null&&(b[Z]=null,A[Z].disconnect(it))}I=null,z=null,p.reset();for(const Z in d)delete d[Z];t.setRenderTarget(y),m=null,u=null,f=null,s=null,S=null,Kt.stop(),n.isPresenting=!1,t.setPixelRatio(_),t.setSize(w.width,w.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(Z){r=Z,n.isPresenting===!0&&zt("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(Z){o=Z,n.isPresenting===!0&&zt("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(Z){c=Z},this.getBaseLayer=function(){return u!==null?u:m},this.getBinding=function(){return f===null&&v&&(f=new XRWebGLBinding(s,e)),f},this.getFrame=function(){return g},this.getSession=function(){return s},this.setSession=async function(Z){if(s=Z,s!==null){if(y=t.getRenderTarget(),s.addEventListener("select",F),s.addEventListener("selectstart",F),s.addEventListener("selectend",F),s.addEventListener("squeeze",F),s.addEventListener("squeezestart",F),s.addEventListener("squeezeend",F),s.addEventListener("end",N),s.addEventListener("inputsourceschange",H),x.xrCompatible!==!0&&await e.makeXRCompatible(),_=t.getPixelRatio(),t.getSize(w),v&&"createProjectionLayer"in XRWebGLBinding.prototype){let nt=null,Ut=null,Tt=null;x.depth&&(Tt=x.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,nt=x.stencil?ai:Cn,Ut=x.stencil?Ts:pn);const Pt={colorFormat:e.RGBA8,depthFormat:Tt,scaleFactor:r};f=this.getBinding(),u=f.createProjectionLayer(Pt),s.updateRenderState({layers:[u]}),t.setPixelRatio(1),t.setSize(u.textureWidth,u.textureHeight,!1),S=new dn(u.textureWidth,u.textureHeight,{format:qe,type:We,depthTexture:new ws(u.textureWidth,u.textureHeight,Ut,void 0,void 0,void 0,void 0,void 0,void 0,nt),stencilBuffer:x.stencil,colorSpace:t.outputColorSpace,samples:x.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1})}else{const nt={antialias:x.antialias,alpha:!0,depth:x.depth,stencil:x.stencil,framebufferScaleFactor:r};m=new XRWebGLLayer(s,e,nt),s.updateRenderState({baseLayer:m}),t.setPixelRatio(1),t.setSize(m.framebufferWidth,m.framebufferHeight,!1),S=new dn(m.framebufferWidth,m.framebufferHeight,{format:qe,type:We,colorSpace:t.outputColorSpace,stencilBuffer:x.stencil,resolveDepthBuffer:m.ignoreDepthValues===!1,resolveStencilBuffer:m.ignoreDepthValues===!1})}S.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await s.requestReferenceSpace(o),Kt.setContext(s),Kt.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return p.getDepthTexture()};function H(Z){for(let it=0;it<Z.removed.length;it++){const nt=Z.removed[it],Ut=b.indexOf(nt);Ut>=0&&(b[Ut]=null,A[Ut].disconnect(nt))}for(let it=0;it<Z.added.length;it++){const nt=Z.added[it];let Ut=b.indexOf(nt);if(Ut===-1){for(let Pt=0;Pt<A.length;Pt++)if(Pt>=b.length){b.push(nt),Ut=Pt;break}else if(b[Pt]===null){b[Pt]=nt,Ut=Pt;break}if(Ut===-1)break}const Tt=A[Ut];Tt&&Tt.connect(nt)}}const K=new L,$=new L;function J(Z,it,nt){K.setFromMatrixPosition(it.matrixWorld),$.setFromMatrixPosition(nt.matrixWorld);const Ut=K.distanceTo($),Tt=it.projectionMatrix.elements,Pt=nt.projectionMatrix.elements,ie=Tt[14]/(Tt[10]-1),Yt=Tt[14]/(Tt[10]+1),$t=(Tt[9]+1)/Tt[5],ne=(Tt[9]-1)/Tt[5],gt=(Tt[8]-1)/Tt[0],rt=(Pt[8]+1)/Pt[0],C=ie*gt,Lt=ie*rt,vt=Ut/(-gt+rt),qt=vt*-gt;if(it.matrixWorld.decompose(Z.position,Z.quaternion,Z.scale),Z.translateX(qt),Z.translateZ(vt),Z.matrixWorld.compose(Z.position,Z.quaternion,Z.scale),Z.matrixWorldInverse.copy(Z.matrixWorld).invert(),Tt[10]===-1)Z.projectionMatrix.copy(it.projectionMatrix),Z.projectionMatrixInverse.copy(it.projectionMatrixInverse);else{const ht=ie+vt,R=Yt+vt,M=C-qt,O=Lt+(Ut-qt),q=$t*Yt/R*ht,j=ne*Yt/R*ht;Z.projectionMatrix.makePerspective(M,O,q,j,ht,R),Z.projectionMatrixInverse.copy(Z.projectionMatrix).invert()}}function st(Z,it){it===null?Z.matrixWorld.copy(Z.matrix):Z.matrixWorld.multiplyMatrices(it.matrixWorld,Z.matrix),Z.matrixWorldInverse.copy(Z.matrixWorld).invert()}this.updateCamera=function(Z){if(s===null)return;let it=Z.near,nt=Z.far;p.texture!==null&&(p.depthNear>0&&(it=p.depthNear),p.depthFar>0&&(nt=p.depthFar)),U.near=D.near=E.near=it,U.far=D.far=E.far=nt,(I!==U.near||z!==U.far)&&(s.updateRenderState({depthNear:U.near,depthFar:U.far}),I=U.near,z=U.far),U.layers.mask=Z.layers.mask|6,E.layers.mask=U.layers.mask&-5,D.layers.mask=U.layers.mask&-3;const Ut=Z.parent,Tt=U.cameras;st(U,Ut);for(let Pt=0;Pt<Tt.length;Pt++)st(Tt[Pt],Ut);Tt.length===2?J(U,E,D):U.projectionMatrix.copy(E.projectionMatrix),et(Z,U,Ut)};function et(Z,it,nt){nt===null?Z.matrix.copy(it.matrixWorld):(Z.matrix.copy(nt.matrixWorld),Z.matrix.invert(),Z.matrix.multiply(it.matrixWorld)),Z.matrix.decompose(Z.position,Z.quaternion,Z.scale),Z.updateMatrixWorld(!0),Z.projectionMatrix.copy(it.projectionMatrix),Z.projectionMatrixInverse.copy(it.projectionMatrixInverse),Z.isPerspectiveCamera&&(Z.fov=Po*2*Math.atan(1/Z.projectionMatrix.elements[5]),Z.zoom=1)}this.getCamera=function(){return U},this.getFoveation=function(){if(!(u===null&&m===null))return l},this.setFoveation=function(Z){l=Z,u!==null&&(u.fixedFoveation=Z),m!==null&&m.fixedFoveation!==void 0&&(m.fixedFoveation=Z)},this.hasDepthSensing=function(){return p.texture!==null},this.getDepthSensingMesh=function(){return p.getMesh(U)},this.getCameraTexture=function(Z){return d[Z]};let Ct=null;function It(Z,it){if(h=it.getViewerPose(c||a),g=it,h!==null){const nt=h.views;m!==null&&(t.setRenderTargetFramebuffer(S,m.framebuffer),t.setRenderTarget(S));let Ut=!1;nt.length!==U.cameras.length&&(U.cameras.length=0,Ut=!0);for(let Yt=0;Yt<nt.length;Yt++){const $t=nt[Yt];let ne=null;if(m!==null)ne=m.getViewport($t);else{const rt=f.getViewSubImage(u,$t);ne=rt.viewport,Yt===0&&(t.setRenderTargetTextures(S,rt.colorTexture,rt.depthStencilTexture),t.setRenderTarget(S))}let gt=P[Yt];gt===void 0&&(gt=new ke,gt.layers.enable(Yt),gt.viewport=new pe,P[Yt]=gt),gt.matrix.fromArray($t.transform.matrix),gt.matrix.decompose(gt.position,gt.quaternion,gt.scale),gt.projectionMatrix.fromArray($t.projectionMatrix),gt.projectionMatrixInverse.copy(gt.projectionMatrix).invert(),gt.viewport.set(ne.x,ne.y,ne.width,ne.height),Yt===0&&(U.matrix.copy(gt.matrix),U.matrix.decompose(U.position,U.quaternion,U.scale)),Ut===!0&&U.cameras.push(gt)}const Tt=s.enabledFeatures;if(Tt&&Tt.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&v){f=n.getBinding();const Yt=f.getDepthInformation(nt[0]);Yt&&Yt.isValid&&Yt.texture&&p.init(Yt,s.renderState)}if(Tt&&Tt.includes("camera-access")&&v){t.state.unbindTexture(),f=n.getBinding();for(let Yt=0;Yt<nt.length;Yt++){const $t=nt[Yt].camera;if($t){let ne=d[$t];ne||(ne=new Gu,d[$t]=ne);const gt=f.getCameraImage($t);ne.sourceTexture=gt}}}}for(let nt=0;nt<A.length;nt++){const Ut=b[nt],Tt=A[nt];Ut!==null&&Tt!==void 0&&Tt.update(Ut,it,c||a)}Ct&&Ct(Z,it),it.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:it}),g=null}const Kt=new Wu;Kt.setAnimationLoop(It),this.setAnimationLoop=function(Z){Ct=Z},this.dispose=function(){}}}const Qn=new ze,b_=new te;function T_(i,t){function e(p,d){p.matrixAutoUpdate===!0&&p.updateMatrix(),d.value.copy(p.matrix)}function n(p,d){d.color.getRGB(p.fogColor.value,Hu(i)),d.isFog?(p.fogNear.value=d.near,p.fogFar.value=d.far):d.isFogExp2&&(p.fogDensity.value=d.density)}function s(p,d,x,y,S){d.isMeshBasicMaterial?r(p,d):d.isMeshLambertMaterial?(r(p,d),d.envMap&&(p.envMapIntensity.value=d.envMapIntensity)):d.isMeshToonMaterial?(r(p,d),f(p,d)):d.isMeshPhongMaterial?(r(p,d),h(p,d),d.envMap&&(p.envMapIntensity.value=d.envMapIntensity)):d.isMeshStandardMaterial?(r(p,d),u(p,d),d.isMeshPhysicalMaterial&&m(p,d,S)):d.isMeshMatcapMaterial?(r(p,d),g(p,d)):d.isMeshDepthMaterial?r(p,d):d.isMeshDistanceMaterial?(r(p,d),v(p,d)):d.isMeshNormalMaterial?r(p,d):d.isLineBasicMaterial?(a(p,d),d.isLineDashedMaterial&&o(p,d)):d.isPointsMaterial?l(p,d,x,y):d.isSpriteMaterial?c(p,d):d.isShadowMaterial?(p.color.value.copy(d.color),p.opacity.value=d.opacity):d.isShaderMaterial&&(d.uniformsNeedUpdate=!1)}function r(p,d){p.opacity.value=d.opacity,d.color&&p.diffuse.value.copy(d.color),d.emissive&&p.emissive.value.copy(d.emissive).multiplyScalar(d.emissiveIntensity),d.map&&(p.map.value=d.map,e(d.map,p.mapTransform)),d.alphaMap&&(p.alphaMap.value=d.alphaMap,e(d.alphaMap,p.alphaMapTransform)),d.bumpMap&&(p.bumpMap.value=d.bumpMap,e(d.bumpMap,p.bumpMapTransform),p.bumpScale.value=d.bumpScale,d.side===Ie&&(p.bumpScale.value*=-1)),d.normalMap&&(p.normalMap.value=d.normalMap,e(d.normalMap,p.normalMapTransform),p.normalScale.value.copy(d.normalScale),d.side===Ie&&p.normalScale.value.negate()),d.displacementMap&&(p.displacementMap.value=d.displacementMap,e(d.displacementMap,p.displacementMapTransform),p.displacementScale.value=d.displacementScale,p.displacementBias.value=d.displacementBias),d.emissiveMap&&(p.emissiveMap.value=d.emissiveMap,e(d.emissiveMap,p.emissiveMapTransform)),d.specularMap&&(p.specularMap.value=d.specularMap,e(d.specularMap,p.specularMapTransform)),d.alphaTest>0&&(p.alphaTest.value=d.alphaTest);const x=t.get(d),y=x.envMap,S=x.envMapRotation;y&&(p.envMap.value=y,Qn.copy(S),Qn.x*=-1,Qn.y*=-1,Qn.z*=-1,y.isCubeTexture&&y.isRenderTargetTexture===!1&&(Qn.y*=-1,Qn.z*=-1),p.envMapRotation.value.setFromMatrix4(b_.makeRotationFromEuler(Qn)),p.flipEnvMap.value=y.isCubeTexture&&y.isRenderTargetTexture===!1?-1:1,p.reflectivity.value=d.reflectivity,p.ior.value=d.ior,p.refractionRatio.value=d.refractionRatio),d.lightMap&&(p.lightMap.value=d.lightMap,p.lightMapIntensity.value=d.lightMapIntensity,e(d.lightMap,p.lightMapTransform)),d.aoMap&&(p.aoMap.value=d.aoMap,p.aoMapIntensity.value=d.aoMapIntensity,e(d.aoMap,p.aoMapTransform))}function a(p,d){p.diffuse.value.copy(d.color),p.opacity.value=d.opacity,d.map&&(p.map.value=d.map,e(d.map,p.mapTransform))}function o(p,d){p.dashSize.value=d.dashSize,p.totalSize.value=d.dashSize+d.gapSize,p.scale.value=d.scale}function l(p,d,x,y){p.diffuse.value.copy(d.color),p.opacity.value=d.opacity,p.size.value=d.size*x,p.scale.value=y*.5,d.map&&(p.map.value=d.map,e(d.map,p.uvTransform)),d.alphaMap&&(p.alphaMap.value=d.alphaMap,e(d.alphaMap,p.alphaMapTransform)),d.alphaTest>0&&(p.alphaTest.value=d.alphaTest)}function c(p,d){p.diffuse.value.copy(d.color),p.opacity.value=d.opacity,p.rotation.value=d.rotation,d.map&&(p.map.value=d.map,e(d.map,p.mapTransform)),d.alphaMap&&(p.alphaMap.value=d.alphaMap,e(d.alphaMap,p.alphaMapTransform)),d.alphaTest>0&&(p.alphaTest.value=d.alphaTest)}function h(p,d){p.specular.value.copy(d.specular),p.shininess.value=Math.max(d.shininess,1e-4)}function f(p,d){d.gradientMap&&(p.gradientMap.value=d.gradientMap)}function u(p,d){p.metalness.value=d.metalness,d.metalnessMap&&(p.metalnessMap.value=d.metalnessMap,e(d.metalnessMap,p.metalnessMapTransform)),p.roughness.value=d.roughness,d.roughnessMap&&(p.roughnessMap.value=d.roughnessMap,e(d.roughnessMap,p.roughnessMapTransform)),d.envMap&&(p.envMapIntensity.value=d.envMapIntensity)}function m(p,d,x){p.ior.value=d.ior,d.sheen>0&&(p.sheenColor.value.copy(d.sheenColor).multiplyScalar(d.sheen),p.sheenRoughness.value=d.sheenRoughness,d.sheenColorMap&&(p.sheenColorMap.value=d.sheenColorMap,e(d.sheenColorMap,p.sheenColorMapTransform)),d.sheenRoughnessMap&&(p.sheenRoughnessMap.value=d.sheenRoughnessMap,e(d.sheenRoughnessMap,p.sheenRoughnessMapTransform))),d.clearcoat>0&&(p.clearcoat.value=d.clearcoat,p.clearcoatRoughness.value=d.clearcoatRoughness,d.clearcoatMap&&(p.clearcoatMap.value=d.clearcoatMap,e(d.clearcoatMap,p.clearcoatMapTransform)),d.clearcoatRoughnessMap&&(p.clearcoatRoughnessMap.value=d.clearcoatRoughnessMap,e(d.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform)),d.clearcoatNormalMap&&(p.clearcoatNormalMap.value=d.clearcoatNormalMap,e(d.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(d.clearcoatNormalScale),d.side===Ie&&p.clearcoatNormalScale.value.negate())),d.dispersion>0&&(p.dispersion.value=d.dispersion),d.iridescence>0&&(p.iridescence.value=d.iridescence,p.iridescenceIOR.value=d.iridescenceIOR,p.iridescenceThicknessMinimum.value=d.iridescenceThicknessRange[0],p.iridescenceThicknessMaximum.value=d.iridescenceThicknessRange[1],d.iridescenceMap&&(p.iridescenceMap.value=d.iridescenceMap,e(d.iridescenceMap,p.iridescenceMapTransform)),d.iridescenceThicknessMap&&(p.iridescenceThicknessMap.value=d.iridescenceThicknessMap,e(d.iridescenceThicknessMap,p.iridescenceThicknessMapTransform))),d.transmission>0&&(p.transmission.value=d.transmission,p.transmissionSamplerMap.value=x.texture,p.transmissionSamplerSize.value.set(x.width,x.height),d.transmissionMap&&(p.transmissionMap.value=d.transmissionMap,e(d.transmissionMap,p.transmissionMapTransform)),p.thickness.value=d.thickness,d.thicknessMap&&(p.thicknessMap.value=d.thicknessMap,e(d.thicknessMap,p.thicknessMapTransform)),p.attenuationDistance.value=d.attenuationDistance,p.attenuationColor.value.copy(d.attenuationColor)),d.anisotropy>0&&(p.anisotropyVector.value.set(d.anisotropy*Math.cos(d.anisotropyRotation),d.anisotropy*Math.sin(d.anisotropyRotation)),d.anisotropyMap&&(p.anisotropyMap.value=d.anisotropyMap,e(d.anisotropyMap,p.anisotropyMapTransform))),p.specularIntensity.value=d.specularIntensity,p.specularColor.value.copy(d.specularColor),d.specularColorMap&&(p.specularColorMap.value=d.specularColorMap,e(d.specularColorMap,p.specularColorMapTransform)),d.specularIntensityMap&&(p.specularIntensityMap.value=d.specularIntensityMap,e(d.specularIntensityMap,p.specularIntensityMapTransform))}function g(p,d){d.matcap&&(p.matcap.value=d.matcap)}function v(p,d){const x=t.get(d).light;p.referencePosition.value.setFromMatrixPosition(x.matrixWorld),p.nearDistance.value=x.shadow.camera.near,p.farDistance.value=x.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function A_(i,t,e,n){let s={},r={},a=[];const o=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function l(x,y){const S=y.program;n.uniformBlockBinding(x,S)}function c(x,y){let S=s[x.id];S===void 0&&(g(x),S=h(x),s[x.id]=S,x.addEventListener("dispose",p));const A=y.program;n.updateUBOMapping(x,A);const b=t.render.frame;r[x.id]!==b&&(u(x),r[x.id]=b)}function h(x){const y=f();x.__bindingPointIndex=y;const S=i.createBuffer(),A=x.__size,b=x.usage;return i.bindBuffer(i.UNIFORM_BUFFER,S),i.bufferData(i.UNIFORM_BUFFER,A,b),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,y,S),S}function f(){for(let x=0;x<o;x++)if(a.indexOf(x)===-1)return a.push(x),x;return Jt("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(x){const y=s[x.id],S=x.uniforms,A=x.__cache;i.bindBuffer(i.UNIFORM_BUFFER,y);for(let b=0,w=S.length;b<w;b++){const _=Array.isArray(S[b])?S[b]:[S[b]];for(let E=0,D=_.length;E<D;E++){const P=_[E];if(m(P,b,E,A)===!0){const U=P.__offset,I=Array.isArray(P.value)?P.value:[P.value];let z=0;for(let F=0;F<I.length;F++){const N=I[F],H=v(N);typeof N=="number"||typeof N=="boolean"?(P.__data[0]=N,i.bufferSubData(i.UNIFORM_BUFFER,U+z,P.__data)):N.isMatrix3?(P.__data[0]=N.elements[0],P.__data[1]=N.elements[1],P.__data[2]=N.elements[2],P.__data[3]=0,P.__data[4]=N.elements[3],P.__data[5]=N.elements[4],P.__data[6]=N.elements[5],P.__data[7]=0,P.__data[8]=N.elements[6],P.__data[9]=N.elements[7],P.__data[10]=N.elements[8],P.__data[11]=0):(N.toArray(P.__data,z),z+=H.storage/Float32Array.BYTES_PER_ELEMENT)}i.bufferSubData(i.UNIFORM_BUFFER,U,P.__data)}}}i.bindBuffer(i.UNIFORM_BUFFER,null)}function m(x,y,S,A){const b=x.value,w=y+"_"+S;if(A[w]===void 0)return typeof b=="number"||typeof b=="boolean"?A[w]=b:A[w]=b.clone(),!0;{const _=A[w];if(typeof b=="number"||typeof b=="boolean"){if(_!==b)return A[w]=b,!0}else if(_.equals(b)===!1)return _.copy(b),!0}return!1}function g(x){const y=x.uniforms;let S=0;const A=16;for(let w=0,_=y.length;w<_;w++){const E=Array.isArray(y[w])?y[w]:[y[w]];for(let D=0,P=E.length;D<P;D++){const U=E[D],I=Array.isArray(U.value)?U.value:[U.value];for(let z=0,F=I.length;z<F;z++){const N=I[z],H=v(N),K=S%A,$=K%H.boundary,J=K+$;S+=$,J!==0&&A-J<H.storage&&(S+=A-J),U.__data=new Float32Array(H.storage/Float32Array.BYTES_PER_ELEMENT),U.__offset=S,S+=H.storage}}}const b=S%A;return b>0&&(S+=A-b),x.__size=S,x.__cache={},this}function v(x){const y={boundary:0,storage:0};return typeof x=="number"||typeof x=="boolean"?(y.boundary=4,y.storage=4):x.isVector2?(y.boundary=8,y.storage=8):x.isVector3||x.isColor?(y.boundary=16,y.storage=12):x.isVector4?(y.boundary=16,y.storage=16):x.isMatrix3?(y.boundary=48,y.storage=48):x.isMatrix4?(y.boundary=64,y.storage=64):x.isTexture?zt("WebGLRenderer: Texture samplers can not be part of an uniforms group."):zt("WebGLRenderer: Unsupported uniform value type.",x),y}function p(x){const y=x.target;y.removeEventListener("dispose",p);const S=a.indexOf(y.__bindingPointIndex);a.splice(S,1),i.deleteBuffer(s[y.id]),delete s[y.id],delete r[y.id]}function d(){for(const x in s)i.deleteBuffer(s[x]);a=[],s={},r={}}return{bind:l,update:c,dispose:d}}const w_=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let on=null;function R_(){return on===null&&(on=new nc(w_,16,16,Xi,Rn),on.name="DFG_LUT",on.minFilter=be,on.magFilter=be,on.wrapS=bn,on.wrapT=bn,on.generateMipmaps=!1,on.needsUpdate=!0),on}class C_{constructor(t={}){const{canvas:e=Yf(),context:n=null,depth:s=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:f=!1,reversedDepthBuffer:u=!1,outputBufferType:m=We}=t;this.isWebGLRenderer=!0;let g;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");g=n.getContextAttributes().alpha}else g=a;const v=m,p=new Set([jo,Zo,$o]),d=new Set([We,pn,bs,Ts,Yo,qo]),x=new Uint32Array(4),y=new Int32Array(4);let S=null,A=null;const b=[],w=[];let _=null;this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=fn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const E=this;let D=!1;this._outputColorSpace=Le;let P=0,U=0,I=null,z=-1,F=null;const N=new pe,H=new pe;let K=null;const $=new Nt(0);let J=0,st=e.width,et=e.height,Ct=1,It=null,Kt=null;const Z=new pe(0,0,st,et),it=new pe(0,0,st,et);let nt=!1;const Ut=new ic;let Tt=!1,Pt=!1;const ie=new te,Yt=new L,$t=new pe,ne={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let gt=!1;function rt(){return I===null?Ct:1}let C=n;function Lt(T,G){return e.getContext(T,G)}try{const T={alpha:!0,depth:s,stencil:r,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:f};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${ko}`),e.addEventListener("webglcontextlost",St,!1),e.addEventListener("webglcontextrestored",Ot,!1),e.addEventListener("webglcontextcreationerror",he,!1),C===null){const G="webgl2";if(C=Lt(G,T),C===null)throw Lt(G)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(T){throw Jt("WebGLRenderer: "+T.message),T}let vt,qt,ht,R,M,O,q,j,X,_t,at,Rt,Dt,Q,ot,Mt,Et,pt,Wt,B,lt,ct,xt;function tt(){vt=new C0(C),vt.init(),lt=new v_(C,vt),qt=new S0(C,vt,t,lt),ht=new __(C,vt),qt.reversedDepthBuffer&&u&&ht.buffers.depth.setReversed(!0),R=new L0(C),M=new i_,O=new x_(C,vt,ht,M,qt,lt,R),q=new R0(E),j=new Od(C),ct=new v0(C,j),X=new P0(C,j,R,ct),_t=new U0(C,X,j,ct,R),pt=new I0(C,qt,O),ot=new E0(M),at=new n_(E,q,vt,qt,ct,ot),Rt=new T_(E,M),Dt=new r_,Q=new h_(vt),Et=new x0(E,q,ht,_t,g,l),Mt=new g_(E,_t,qt),xt=new A_(C,R,qt,ht),Wt=new M0(C,vt,R),B=new D0(C,vt,R),R.programs=at.programs,E.capabilities=qt,E.extensions=vt,E.properties=M,E.renderLists=Dt,E.shadowMap=Mt,E.state=ht,E.info=R}tt(),v!==We&&(_=new F0(v,e.width,e.height,s,r));const Y=new y_(E,C);this.xr=Y,this.getContext=function(){return C},this.getContextAttributes=function(){return C.getContextAttributes()},this.forceContextLoss=function(){const T=vt.get("WEBGL_lose_context");T&&T.loseContext()},this.forceContextRestore=function(){const T=vt.get("WEBGL_lose_context");T&&T.restoreContext()},this.getPixelRatio=function(){return Ct},this.setPixelRatio=function(T){T!==void 0&&(Ct=T,this.setSize(st,et,!1))},this.getSize=function(T){return T.set(st,et)},this.setSize=function(T,G,W=!0){if(Y.isPresenting){zt("WebGLRenderer: Can't change size while VR device is presenting.");return}st=T,et=G,e.width=Math.floor(T*Ct),e.height=Math.floor(G*Ct),W===!0&&(e.style.width=T+"px",e.style.height=G+"px"),_!==null&&_.setSize(e.width,e.height),this.setViewport(0,0,T,G)},this.getDrawingBufferSize=function(T){return T.set(st*Ct,et*Ct).floor()},this.setDrawingBufferSize=function(T,G,W){st=T,et=G,Ct=W,e.width=Math.floor(T*W),e.height=Math.floor(G*W),this.setViewport(0,0,T,G)},this.setEffects=function(T){if(v===We){console.error("THREE.WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(T){for(let G=0;G<T.length;G++)if(T[G].isOutputPass===!0){console.warn("THREE.WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}_.setEffects(T||[])},this.getCurrentViewport=function(T){return T.copy(N)},this.getViewport=function(T){return T.copy(Z)},this.setViewport=function(T,G,W,k){T.isVector4?Z.set(T.x,T.y,T.z,T.w):Z.set(T,G,W,k),ht.viewport(N.copy(Z).multiplyScalar(Ct).round())},this.getScissor=function(T){return T.copy(it)},this.setScissor=function(T,G,W,k){T.isVector4?it.set(T.x,T.y,T.z,T.w):it.set(T,G,W,k),ht.scissor(H.copy(it).multiplyScalar(Ct).round())},this.getScissorTest=function(){return nt},this.setScissorTest=function(T){ht.setScissorTest(nt=T)},this.setOpaqueSort=function(T){It=T},this.setTransparentSort=function(T){Kt=T},this.getClearColor=function(T){return T.copy(Et.getClearColor())},this.setClearColor=function(){Et.setClearColor(...arguments)},this.getClearAlpha=function(){return Et.getClearAlpha()},this.setClearAlpha=function(){Et.setClearAlpha(...arguments)},this.clear=function(T=!0,G=!0,W=!0){let k=0;if(T){let V=!1;if(I!==null){const ft=I.texture.format;V=p.has(ft)}if(V){const ft=I.texture.type,mt=d.has(ft),dt=Et.getClearColor(),yt=Et.getClearAlpha(),At=dt.r,Gt=dt.g,Xt=dt.b;mt?(x[0]=At,x[1]=Gt,x[2]=Xt,x[3]=yt,C.clearBufferuiv(C.COLOR,0,x)):(y[0]=At,y[1]=Gt,y[2]=Xt,y[3]=yt,C.clearBufferiv(C.COLOR,0,y))}else k|=C.COLOR_BUFFER_BIT}G&&(k|=C.DEPTH_BUFFER_BIT),W&&(k|=C.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),k!==0&&C.clear(k)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){e.removeEventListener("webglcontextlost",St,!1),e.removeEventListener("webglcontextrestored",Ot,!1),e.removeEventListener("webglcontextcreationerror",he,!1),Et.dispose(),Dt.dispose(),Q.dispose(),M.dispose(),q.dispose(),_t.dispose(),ct.dispose(),xt.dispose(),at.dispose(),Y.dispose(),Y.removeEventListener("sessionstart",_c),Y.removeEventListener("sessionend",xc),Yn.stop()};function St(T){T.preventDefault(),Ar("WebGLRenderer: Context Lost."),D=!0}function Ot(){Ar("WebGLRenderer: Context Restored."),D=!1;const T=R.autoReset,G=Mt.enabled,W=Mt.autoUpdate,k=Mt.needsUpdate,V=Mt.type;tt(),R.autoReset=T,Mt.enabled=G,Mt.autoUpdate=W,Mt.needsUpdate=k,Mt.type=V}function he(T){Jt("WebGLRenderer: A WebGL context could not be created. Reason: ",T.statusMessage)}function re(T){const G=T.target;G.removeEventListener("dispose",re),mn(G)}function mn(T){gn(T),M.remove(T)}function gn(T){const G=M.get(T).programs;G!==void 0&&(G.forEach(function(W){at.releaseProgram(W)}),T.isShaderMaterial&&at.releaseShaderCache(T))}this.renderBufferDirect=function(T,G,W,k,V,ft){G===null&&(G=ne);const mt=V.isMesh&&V.matrixWorld.determinant()<0,dt=lh(T,G,W,k,V);ht.setMaterial(k,mt);let yt=W.index,At=1;if(k.wireframe===!0){if(yt=X.getWireframeAttribute(W),yt===void 0)return;At=2}const Gt=W.drawRange,Xt=W.attributes.position;let wt=Gt.start*At,oe=(Gt.start+Gt.count)*At;ft!==null&&(wt=Math.max(wt,ft.start*At),oe=Math.min(oe,(ft.start+ft.count)*At)),yt!==null?(wt=Math.max(wt,0),oe=Math.min(oe,yt.count)):Xt!=null&&(wt=Math.max(wt,0),oe=Math.min(oe,Xt.count));const me=oe-wt;if(me<0||me===1/0)return;ct.setup(V,k,dt,W,yt);let de,ce=Wt;if(yt!==null&&(de=j.get(yt),ce=B,ce.setIndex(de)),V.isMesh)k.wireframe===!0?(ht.setLineWidth(k.wireframeLinewidth*rt()),ce.setMode(C.LINES)):ce.setMode(C.TRIANGLES);else if(V.isLine){let Ce=k.linewidth;Ce===void 0&&(Ce=1),ht.setLineWidth(Ce*rt()),V.isLineSegments?ce.setMode(C.LINES):V.isLineLoop?ce.setMode(C.LINE_LOOP):ce.setMode(C.LINE_STRIP)}else V.isPoints?ce.setMode(C.POINTS):V.isSprite&&ce.setMode(C.TRIANGLES);if(V.isBatchedMesh)if(V._multiDrawInstances!==null)wr("WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),ce.renderMultiDrawInstances(V._multiDrawStarts,V._multiDrawCounts,V._multiDrawCount,V._multiDrawInstances);else if(vt.get("WEBGL_multi_draw"))ce.renderMultiDraw(V._multiDrawStarts,V._multiDrawCounts,V._multiDrawCount);else{const Ce=V._multiDrawStarts,bt=V._multiDrawCounts,Ge=V._multiDrawCount,ee=yt?j.get(yt).bytesPerElement:1,je=M.get(k).currentProgram.getUniforms();for(let rn=0;rn<Ge;rn++)je.setValue(C,"_gl_DrawID",rn),ce.render(Ce[rn]/ee,bt[rn])}else if(V.isInstancedMesh)ce.renderInstances(wt,me,V.count);else if(W.isInstancedBufferGeometry){const Ce=W._maxInstanceCount!==void 0?W._maxInstanceCount:1/0,bt=Math.min(W.instanceCount,Ce);ce.renderInstances(wt,me,bt)}else ce.render(wt,me)};function gc(T,G,W){T.transparent===!0&&T.side===En&&T.forceSinglePass===!1?(T.side=Ie,T.needsUpdate=!0,Is(T,G,W),T.side=kn,T.needsUpdate=!0,Is(T,G,W),T.side=En):Is(T,G,W)}this.compile=function(T,G,W=null){W===null&&(W=T),A=Q.get(W),A.init(G),w.push(A),W.traverseVisible(function(V){V.isLight&&V.layers.test(G.layers)&&(A.pushLight(V),V.castShadow&&A.pushShadow(V))}),T!==W&&T.traverseVisible(function(V){V.isLight&&V.layers.test(G.layers)&&(A.pushLight(V),V.castShadow&&A.pushShadow(V))}),A.setupLights();const k=new Set;return T.traverse(function(V){if(!(V.isMesh||V.isPoints||V.isLine||V.isSprite))return;const ft=V.material;if(ft)if(Array.isArray(ft))for(let mt=0;mt<ft.length;mt++){const dt=ft[mt];gc(dt,W,V),k.add(dt)}else gc(ft,W,V),k.add(ft)}),A=w.pop(),k},this.compileAsync=function(T,G,W=null){const k=this.compile(T,G,W);return new Promise(V=>{function ft(){if(k.forEach(function(mt){M.get(mt).currentProgram.isReady()&&k.delete(mt)}),k.size===0){V(T);return}setTimeout(ft,10)}vt.get("KHR_parallel_shader_compile")!==null?ft():setTimeout(ft,10)})};let Xr=null;function ch(T){Xr&&Xr(T)}function _c(){Yn.stop()}function xc(){Yn.start()}const Yn=new Wu;Yn.setAnimationLoop(ch),typeof self<"u"&&Yn.setContext(self),this.setAnimationLoop=function(T){Xr=T,Y.setAnimationLoop(T),T===null?Yn.stop():Yn.start()},Y.addEventListener("sessionstart",_c),Y.addEventListener("sessionend",xc),this.render=function(T,G){if(G!==void 0&&G.isCamera!==!0){Jt("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(D===!0)return;const W=Y.enabled===!0&&Y.isPresenting===!0,k=_!==null&&(I===null||W)&&_.begin(E,I);if(T.matrixWorldAutoUpdate===!0&&T.updateMatrixWorld(),G.parent===null&&G.matrixWorldAutoUpdate===!0&&G.updateMatrixWorld(),Y.enabled===!0&&Y.isPresenting===!0&&(_===null||_.isCompositing()===!1)&&(Y.cameraAutoUpdate===!0&&Y.updateCamera(G),G=Y.getCamera()),T.isScene===!0&&T.onBeforeRender(E,T,G,I),A=Q.get(T,w.length),A.init(G),w.push(A),ie.multiplyMatrices(G.projectionMatrix,G.matrixWorldInverse),Ut.setFromProjectionMatrix(ie,hn,G.reversedDepth),Pt=this.localClippingEnabled,Tt=ot.init(this.clippingPlanes,Pt),S=Dt.get(T,b.length),S.init(),b.push(S),Y.enabled===!0&&Y.isPresenting===!0){const mt=E.xr.getDepthSensingMesh();mt!==null&&Yr(mt,G,-1/0,E.sortObjects)}Yr(T,G,0,E.sortObjects),S.finish(),E.sortObjects===!0&&S.sort(It,Kt),gt=Y.enabled===!1||Y.isPresenting===!1||Y.hasDepthSensing()===!1,gt&&Et.addToRenderList(S,T),this.info.render.frame++,Tt===!0&&ot.beginShadows();const V=A.state.shadowsArray;if(Mt.render(V,T,G),Tt===!0&&ot.endShadows(),this.info.autoReset===!0&&this.info.reset(),(k&&_.hasRenderPass())===!1){const mt=S.opaque,dt=S.transmissive;if(A.setupLights(),G.isArrayCamera){const yt=G.cameras;if(dt.length>0)for(let At=0,Gt=yt.length;At<Gt;At++){const Xt=yt[At];Mc(mt,dt,T,Xt)}gt&&Et.render(T);for(let At=0,Gt=yt.length;At<Gt;At++){const Xt=yt[At];vc(S,T,Xt,Xt.viewport)}}else dt.length>0&&Mc(mt,dt,T,G),gt&&Et.render(T),vc(S,T,G)}I!==null&&U===0&&(O.updateMultisampleRenderTarget(I),O.updateRenderTargetMipmap(I)),k&&_.end(E),T.isScene===!0&&T.onAfterRender(E,T,G),ct.resetDefaultState(),z=-1,F=null,w.pop(),w.length>0?(A=w[w.length-1],Tt===!0&&ot.setGlobalState(E.clippingPlanes,A.state.camera)):A=null,b.pop(),b.length>0?S=b[b.length-1]:S=null};function Yr(T,G,W,k){if(T.visible===!1)return;if(T.layers.test(G.layers)){if(T.isGroup)W=T.renderOrder;else if(T.isLOD)T.autoUpdate===!0&&T.update(G);else if(T.isLight)A.pushLight(T),T.castShadow&&A.pushShadow(T);else if(T.isSprite){if(!T.frustumCulled||Ut.intersectsSprite(T)){k&&$t.setFromMatrixPosition(T.matrixWorld).applyMatrix4(ie);const mt=_t.update(T),dt=T.material;dt.visible&&S.push(T,mt,dt,W,$t.z,null)}}else if((T.isMesh||T.isLine||T.isPoints)&&(!T.frustumCulled||Ut.intersectsObject(T))){const mt=_t.update(T),dt=T.material;if(k&&(T.boundingSphere!==void 0?(T.boundingSphere===null&&T.computeBoundingSphere(),$t.copy(T.boundingSphere.center)):(mt.boundingSphere===null&&mt.computeBoundingSphere(),$t.copy(mt.boundingSphere.center)),$t.applyMatrix4(T.matrixWorld).applyMatrix4(ie)),Array.isArray(dt)){const yt=mt.groups;for(let At=0,Gt=yt.length;At<Gt;At++){const Xt=yt[At],wt=dt[Xt.materialIndex];wt&&wt.visible&&S.push(T,mt,wt,W,$t.z,Xt)}}else dt.visible&&S.push(T,mt,dt,W,$t.z,null)}}const ft=T.children;for(let mt=0,dt=ft.length;mt<dt;mt++)Yr(ft[mt],G,W,k)}function vc(T,G,W,k){const{opaque:V,transmissive:ft,transparent:mt}=T;A.setupLightsView(W),Tt===!0&&ot.setGlobalState(E.clippingPlanes,W),k&&ht.viewport(N.copy(k)),V.length>0&&Ls(V,G,W),ft.length>0&&Ls(ft,G,W),mt.length>0&&Ls(mt,G,W),ht.buffers.depth.setTest(!0),ht.buffers.depth.setMask(!0),ht.buffers.color.setMask(!0),ht.setPolygonOffset(!1)}function Mc(T,G,W,k){if((W.isScene===!0?W.overrideMaterial:null)!==null)return;if(A.state.transmissionRenderTarget[k.id]===void 0){const wt=vt.has("EXT_color_buffer_half_float")||vt.has("EXT_color_buffer_float");A.state.transmissionRenderTarget[k.id]=new dn(1,1,{generateMipmaps:!0,type:wt?Rn:We,minFilter:ri,samples:Math.max(4,qt.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Qt.workingColorSpace})}const ft=A.state.transmissionRenderTarget[k.id],mt=k.viewport||N;ft.setSize(mt.z*E.transmissionResolutionScale,mt.w*E.transmissionResolutionScale);const dt=E.getRenderTarget(),yt=E.getActiveCubeFace(),At=E.getActiveMipmapLevel();E.setRenderTarget(ft),E.getClearColor($),J=E.getClearAlpha(),J<1&&E.setClearColor(16777215,.5),E.clear(),gt&&Et.render(W);const Gt=E.toneMapping;E.toneMapping=fn;const Xt=k.viewport;if(k.viewport!==void 0&&(k.viewport=void 0),A.setupLightsView(k),Tt===!0&&ot.setGlobalState(E.clippingPlanes,k),Ls(T,W,k),O.updateMultisampleRenderTarget(ft),O.updateRenderTargetMipmap(ft),vt.has("WEBGL_multisampled_render_to_texture")===!1){let wt=!1;for(let oe=0,me=G.length;oe<me;oe++){const de=G[oe],{object:ce,geometry:Ce,material:bt,group:Ge}=de;if(bt.side===En&&ce.layers.test(k.layers)){const ee=bt.side;bt.side=Ie,bt.needsUpdate=!0,Sc(ce,W,k,Ce,bt,Ge),bt.side=ee,bt.needsUpdate=!0,wt=!0}}wt===!0&&(O.updateMultisampleRenderTarget(ft),O.updateRenderTargetMipmap(ft))}E.setRenderTarget(dt,yt,At),E.setClearColor($,J),Xt!==void 0&&(k.viewport=Xt),E.toneMapping=Gt}function Ls(T,G,W){const k=G.isScene===!0?G.overrideMaterial:null;for(let V=0,ft=T.length;V<ft;V++){const mt=T[V],{object:dt,geometry:yt,group:At}=mt;let Gt=mt.material;Gt.allowOverride===!0&&k!==null&&(Gt=k),dt.layers.test(W.layers)&&Sc(dt,G,W,yt,Gt,At)}}function Sc(T,G,W,k,V,ft){T.onBeforeRender(E,G,W,k,V,ft),T.modelViewMatrix.multiplyMatrices(W.matrixWorldInverse,T.matrixWorld),T.normalMatrix.getNormalMatrix(T.modelViewMatrix),V.onBeforeRender(E,G,W,k,T,ft),V.transparent===!0&&V.side===En&&V.forceSinglePass===!1?(V.side=Ie,V.needsUpdate=!0,E.renderBufferDirect(W,G,k,V,T,ft),V.side=kn,V.needsUpdate=!0,E.renderBufferDirect(W,G,k,V,T,ft),V.side=En):E.renderBufferDirect(W,G,k,V,T,ft),T.onAfterRender(E,G,W,k,V,ft)}function Is(T,G,W){G.isScene!==!0&&(G=ne);const k=M.get(T),V=A.state.lights,ft=A.state.shadowsArray,mt=V.state.version,dt=at.getParameters(T,V.state,ft,G,W),yt=at.getProgramCacheKey(dt);let At=k.programs;k.environment=T.isMeshStandardMaterial||T.isMeshLambertMaterial||T.isMeshPhongMaterial?G.environment:null,k.fog=G.fog;const Gt=T.isMeshStandardMaterial||T.isMeshLambertMaterial&&!T.envMap||T.isMeshPhongMaterial&&!T.envMap;k.envMap=q.get(T.envMap||k.environment,Gt),k.envMapRotation=k.environment!==null&&T.envMap===null?G.environmentRotation:T.envMapRotation,At===void 0&&(T.addEventListener("dispose",re),At=new Map,k.programs=At);let Xt=At.get(yt);if(Xt!==void 0){if(k.currentProgram===Xt&&k.lightsStateVersion===mt)return yc(T,dt),Xt}else dt.uniforms=at.getUniforms(T),T.onBeforeCompile(dt,E),Xt=at.acquireProgram(dt,yt),At.set(yt,Xt),k.uniforms=dt.uniforms;const wt=k.uniforms;return(!T.isShaderMaterial&&!T.isRawShaderMaterial||T.clipping===!0)&&(wt.clippingPlanes=ot.uniform),yc(T,dt),k.needsLights=hh(T),k.lightsStateVersion=mt,k.needsLights&&(wt.ambientLightColor.value=V.state.ambient,wt.lightProbe.value=V.state.probe,wt.directionalLights.value=V.state.directional,wt.directionalLightShadows.value=V.state.directionalShadow,wt.spotLights.value=V.state.spot,wt.spotLightShadows.value=V.state.spotShadow,wt.rectAreaLights.value=V.state.rectArea,wt.ltc_1.value=V.state.rectAreaLTC1,wt.ltc_2.value=V.state.rectAreaLTC2,wt.pointLights.value=V.state.point,wt.pointLightShadows.value=V.state.pointShadow,wt.hemisphereLights.value=V.state.hemi,wt.directionalShadowMatrix.value=V.state.directionalShadowMatrix,wt.spotLightMatrix.value=V.state.spotLightMatrix,wt.spotLightMap.value=V.state.spotLightMap,wt.pointShadowMatrix.value=V.state.pointShadowMatrix),k.currentProgram=Xt,k.uniformsList=null,Xt}function Ec(T){if(T.uniformsList===null){const G=T.currentProgram.getUniforms();T.uniformsList=Sr.seqWithValue(G.seq,T.uniforms)}return T.uniformsList}function yc(T,G){const W=M.get(T);W.outputColorSpace=G.outputColorSpace,W.batching=G.batching,W.batchingColor=G.batchingColor,W.instancing=G.instancing,W.instancingColor=G.instancingColor,W.instancingMorph=G.instancingMorph,W.skinning=G.skinning,W.morphTargets=G.morphTargets,W.morphNormals=G.morphNormals,W.morphColors=G.morphColors,W.morphTargetsCount=G.morphTargetsCount,W.numClippingPlanes=G.numClippingPlanes,W.numIntersection=G.numClipIntersection,W.vertexAlphas=G.vertexAlphas,W.vertexTangents=G.vertexTangents,W.toneMapping=G.toneMapping}function lh(T,G,W,k,V){G.isScene!==!0&&(G=ne),O.resetTextureUnits();const ft=G.fog,mt=k.isMeshStandardMaterial||k.isMeshLambertMaterial||k.isMeshPhongMaterial?G.environment:null,dt=I===null?E.outputColorSpace:I.isXRRenderTarget===!0?I.texture.colorSpace:Yi,yt=k.isMeshStandardMaterial||k.isMeshLambertMaterial&&!k.envMap||k.isMeshPhongMaterial&&!k.envMap,At=q.get(k.envMap||mt,yt),Gt=k.vertexColors===!0&&!!W.attributes.color&&W.attributes.color.itemSize===4,Xt=!!W.attributes.tangent&&(!!k.normalMap||k.anisotropy>0),wt=!!W.morphAttributes.position,oe=!!W.morphAttributes.normal,me=!!W.morphAttributes.color;let de=fn;k.toneMapped&&(I===null||I.isXRRenderTarget===!0)&&(de=E.toneMapping);const ce=W.morphAttributes.position||W.morphAttributes.normal||W.morphAttributes.color,Ce=ce!==void 0?ce.length:0,bt=M.get(k),Ge=A.state.lights;if(Tt===!0&&(Pt===!0||T!==F)){const Ee=T===F&&k.id===z;ot.setState(k,T,Ee)}let ee=!1;k.version===bt.__version?(bt.needsLights&&bt.lightsStateVersion!==Ge.state.version||bt.outputColorSpace!==dt||V.isBatchedMesh&&bt.batching===!1||!V.isBatchedMesh&&bt.batching===!0||V.isBatchedMesh&&bt.batchingColor===!0&&V.colorTexture===null||V.isBatchedMesh&&bt.batchingColor===!1&&V.colorTexture!==null||V.isInstancedMesh&&bt.instancing===!1||!V.isInstancedMesh&&bt.instancing===!0||V.isSkinnedMesh&&bt.skinning===!1||!V.isSkinnedMesh&&bt.skinning===!0||V.isInstancedMesh&&bt.instancingColor===!0&&V.instanceColor===null||V.isInstancedMesh&&bt.instancingColor===!1&&V.instanceColor!==null||V.isInstancedMesh&&bt.instancingMorph===!0&&V.morphTexture===null||V.isInstancedMesh&&bt.instancingMorph===!1&&V.morphTexture!==null||bt.envMap!==At||k.fog===!0&&bt.fog!==ft||bt.numClippingPlanes!==void 0&&(bt.numClippingPlanes!==ot.numPlanes||bt.numIntersection!==ot.numIntersection)||bt.vertexAlphas!==Gt||bt.vertexTangents!==Xt||bt.morphTargets!==wt||bt.morphNormals!==oe||bt.morphColors!==me||bt.toneMapping!==de||bt.morphTargetsCount!==Ce)&&(ee=!0):(ee=!0,bt.__version=k.version);let je=bt.currentProgram;ee===!0&&(je=Is(k,G,V));let rn=!1,qn=!1,mi=!1;const ue=je.getUniforms(),Ae=bt.uniforms;if(ht.useProgram(je.program)&&(rn=!0,qn=!0,mi=!0),k.id!==z&&(z=k.id,qn=!0),rn||F!==T){ht.buffers.depth.getReversed()&&T.reversedDepth!==!0&&(T._reversedDepth=!0,T.updateProjectionMatrix()),ue.setValue(C,"projectionMatrix",T.projectionMatrix),ue.setValue(C,"viewMatrix",T.matrixWorldInverse);const Dn=ue.map.cameraPosition;Dn!==void 0&&Dn.setValue(C,Yt.setFromMatrixPosition(T.matrixWorld)),qt.logarithmicDepthBuffer&&ue.setValue(C,"logDepthBufFC",2/(Math.log(T.far+1)/Math.LN2)),(k.isMeshPhongMaterial||k.isMeshToonMaterial||k.isMeshLambertMaterial||k.isMeshBasicMaterial||k.isMeshStandardMaterial||k.isShaderMaterial)&&ue.setValue(C,"isOrthographic",T.isOrthographicCamera===!0),F!==T&&(F=T,qn=!0,mi=!0)}if(bt.needsLights&&(Ge.state.directionalShadowMap.length>0&&ue.setValue(C,"directionalShadowMap",Ge.state.directionalShadowMap,O),Ge.state.spotShadowMap.length>0&&ue.setValue(C,"spotShadowMap",Ge.state.spotShadowMap,O),Ge.state.pointShadowMap.length>0&&ue.setValue(C,"pointShadowMap",Ge.state.pointShadowMap,O)),V.isSkinnedMesh){ue.setOptional(C,V,"bindMatrix"),ue.setOptional(C,V,"bindMatrixInverse");const Ee=V.skeleton;Ee&&(Ee.boneTexture===null&&Ee.computeBoneTexture(),ue.setValue(C,"boneTexture",Ee.boneTexture,O))}V.isBatchedMesh&&(ue.setOptional(C,V,"batchingTexture"),ue.setValue(C,"batchingTexture",V._matricesTexture,O),ue.setOptional(C,V,"batchingIdTexture"),ue.setValue(C,"batchingIdTexture",V._indirectTexture,O),ue.setOptional(C,V,"batchingColorTexture"),V._colorsTexture!==null&&ue.setValue(C,"batchingColorTexture",V._colorsTexture,O));const Pn=W.morphAttributes;if((Pn.position!==void 0||Pn.normal!==void 0||Pn.color!==void 0)&&pt.update(V,W,je),(qn||bt.receiveShadow!==V.receiveShadow)&&(bt.receiveShadow=V.receiveShadow,ue.setValue(C,"receiveShadow",V.receiveShadow)),(k.isMeshStandardMaterial||k.isMeshLambertMaterial||k.isMeshPhongMaterial)&&k.envMap===null&&G.environment!==null&&(Ae.envMapIntensity.value=G.environmentIntensity),Ae.dfgLUT!==void 0&&(Ae.dfgLUT.value=R_()),qn&&(ue.setValue(C,"toneMappingExposure",E.toneMappingExposure),bt.needsLights&&uh(Ae,mi),ft&&k.fog===!0&&Rt.refreshFogUniforms(Ae,ft),Rt.refreshMaterialUniforms(Ae,k,Ct,et,A.state.transmissionRenderTarget[T.id]),Sr.upload(C,Ec(bt),Ae,O)),k.isShaderMaterial&&k.uniformsNeedUpdate===!0&&(Sr.upload(C,Ec(bt),Ae,O),k.uniformsNeedUpdate=!1),k.isSpriteMaterial&&ue.setValue(C,"center",V.center),ue.setValue(C,"modelViewMatrix",V.modelViewMatrix),ue.setValue(C,"normalMatrix",V.normalMatrix),ue.setValue(C,"modelMatrix",V.matrixWorld),k.isShaderMaterial||k.isRawShaderMaterial){const Ee=k.uniformsGroups;for(let Dn=0,gi=Ee.length;Dn<gi;Dn++){const bc=Ee[Dn];xt.update(bc,je),xt.bind(bc,je)}}return je}function uh(T,G){T.ambientLightColor.needsUpdate=G,T.lightProbe.needsUpdate=G,T.directionalLights.needsUpdate=G,T.directionalLightShadows.needsUpdate=G,T.pointLights.needsUpdate=G,T.pointLightShadows.needsUpdate=G,T.spotLights.needsUpdate=G,T.spotLightShadows.needsUpdate=G,T.rectAreaLights.needsUpdate=G,T.hemisphereLights.needsUpdate=G}function hh(T){return T.isMeshLambertMaterial||T.isMeshToonMaterial||T.isMeshPhongMaterial||T.isMeshStandardMaterial||T.isShadowMaterial||T.isShaderMaterial&&T.lights===!0}this.getActiveCubeFace=function(){return P},this.getActiveMipmapLevel=function(){return U},this.getRenderTarget=function(){return I},this.setRenderTargetTextures=function(T,G,W){const k=M.get(T);k.__autoAllocateDepthBuffer=T.resolveDepthBuffer===!1,k.__autoAllocateDepthBuffer===!1&&(k.__useRenderToTexture=!1),M.get(T.texture).__webglTexture=G,M.get(T.depthTexture).__webglTexture=k.__autoAllocateDepthBuffer?void 0:W,k.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(T,G){const W=M.get(T);W.__webglFramebuffer=G,W.__useDefaultFramebuffer=G===void 0};const fh=C.createFramebuffer();this.setRenderTarget=function(T,G=0,W=0){I=T,P=G,U=W;let k=null,V=!1,ft=!1;if(T){const dt=M.get(T);if(dt.__useDefaultFramebuffer!==void 0){ht.bindFramebuffer(C.FRAMEBUFFER,dt.__webglFramebuffer),N.copy(T.viewport),H.copy(T.scissor),K=T.scissorTest,ht.viewport(N),ht.scissor(H),ht.setScissorTest(K),z=-1;return}else if(dt.__webglFramebuffer===void 0)O.setupRenderTarget(T);else if(dt.__hasExternalTextures)O.rebindTextures(T,M.get(T.texture).__webglTexture,M.get(T.depthTexture).__webglTexture);else if(T.depthBuffer){const Gt=T.depthTexture;if(dt.__boundDepthTexture!==Gt){if(Gt!==null&&M.has(Gt)&&(T.width!==Gt.image.width||T.height!==Gt.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");O.setupDepthRenderbuffer(T)}}const yt=T.texture;(yt.isData3DTexture||yt.isDataArrayTexture||yt.isCompressedArrayTexture)&&(ft=!0);const At=M.get(T).__webglFramebuffer;T.isWebGLCubeRenderTarget?(Array.isArray(At[G])?k=At[G][W]:k=At[G],V=!0):T.samples>0&&O.useMultisampledRTT(T)===!1?k=M.get(T).__webglMultisampledFramebuffer:Array.isArray(At)?k=At[W]:k=At,N.copy(T.viewport),H.copy(T.scissor),K=T.scissorTest}else N.copy(Z).multiplyScalar(Ct).floor(),H.copy(it).multiplyScalar(Ct).floor(),K=nt;if(W!==0&&(k=fh),ht.bindFramebuffer(C.FRAMEBUFFER,k)&&ht.drawBuffers(T,k),ht.viewport(N),ht.scissor(H),ht.setScissorTest(K),V){const dt=M.get(T.texture);C.framebufferTexture2D(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_CUBE_MAP_POSITIVE_X+G,dt.__webglTexture,W)}else if(ft){const dt=G;for(let yt=0;yt<T.textures.length;yt++){const At=M.get(T.textures[yt]);C.framebufferTextureLayer(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0+yt,At.__webglTexture,W,dt)}}else if(T!==null&&W!==0){const dt=M.get(T.texture);C.framebufferTexture2D(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,dt.__webglTexture,W)}z=-1},this.readRenderTargetPixels=function(T,G,W,k,V,ft,mt,dt=0){if(!(T&&T.isWebGLRenderTarget)){Jt("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let yt=M.get(T).__webglFramebuffer;if(T.isWebGLCubeRenderTarget&&mt!==void 0&&(yt=yt[mt]),yt){ht.bindFramebuffer(C.FRAMEBUFFER,yt);try{const At=T.textures[dt],Gt=At.format,Xt=At.type;if(T.textures.length>1&&C.readBuffer(C.COLOR_ATTACHMENT0+dt),!qt.textureFormatReadable(Gt)){Jt("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!qt.textureTypeReadable(Xt)){Jt("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}G>=0&&G<=T.width-k&&W>=0&&W<=T.height-V&&C.readPixels(G,W,k,V,lt.convert(Gt),lt.convert(Xt),ft)}finally{const At=I!==null?M.get(I).__webglFramebuffer:null;ht.bindFramebuffer(C.FRAMEBUFFER,At)}}},this.readRenderTargetPixelsAsync=async function(T,G,W,k,V,ft,mt,dt=0){if(!(T&&T.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let yt=M.get(T).__webglFramebuffer;if(T.isWebGLCubeRenderTarget&&mt!==void 0&&(yt=yt[mt]),yt)if(G>=0&&G<=T.width-k&&W>=0&&W<=T.height-V){ht.bindFramebuffer(C.FRAMEBUFFER,yt);const At=T.textures[dt],Gt=At.format,Xt=At.type;if(T.textures.length>1&&C.readBuffer(C.COLOR_ATTACHMENT0+dt),!qt.textureFormatReadable(Gt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!qt.textureTypeReadable(Xt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const wt=C.createBuffer();C.bindBuffer(C.PIXEL_PACK_BUFFER,wt),C.bufferData(C.PIXEL_PACK_BUFFER,ft.byteLength,C.STREAM_READ),C.readPixels(G,W,k,V,lt.convert(Gt),lt.convert(Xt),0);const oe=I!==null?M.get(I).__webglFramebuffer:null;ht.bindFramebuffer(C.FRAMEBUFFER,oe);const me=C.fenceSync(C.SYNC_GPU_COMMANDS_COMPLETE,0);return C.flush(),await qf(C,me,4),C.bindBuffer(C.PIXEL_PACK_BUFFER,wt),C.getBufferSubData(C.PIXEL_PACK_BUFFER,0,ft),C.deleteBuffer(wt),C.deleteSync(me),ft}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(T,G=null,W=0){const k=Math.pow(2,-W),V=Math.floor(T.image.width*k),ft=Math.floor(T.image.height*k),mt=G!==null?G.x:0,dt=G!==null?G.y:0;O.setTexture2D(T,0),C.copyTexSubImage2D(C.TEXTURE_2D,W,0,0,mt,dt,V,ft),ht.unbindTexture()};const dh=C.createFramebuffer(),ph=C.createFramebuffer();this.copyTextureToTexture=function(T,G,W=null,k=null,V=0,ft=0){let mt,dt,yt,At,Gt,Xt,wt,oe,me;const de=T.isCompressedTexture?T.mipmaps[ft]:T.image;if(W!==null)mt=W.max.x-W.min.x,dt=W.max.y-W.min.y,yt=W.isBox3?W.max.z-W.min.z:1,At=W.min.x,Gt=W.min.y,Xt=W.isBox3?W.min.z:0;else{const Ae=Math.pow(2,-V);mt=Math.floor(de.width*Ae),dt=Math.floor(de.height*Ae),T.isDataArrayTexture?yt=de.depth:T.isData3DTexture?yt=Math.floor(de.depth*Ae):yt=1,At=0,Gt=0,Xt=0}k!==null?(wt=k.x,oe=k.y,me=k.z):(wt=0,oe=0,me=0);const ce=lt.convert(G.format),Ce=lt.convert(G.type);let bt;G.isData3DTexture?(O.setTexture3D(G,0),bt=C.TEXTURE_3D):G.isDataArrayTexture||G.isCompressedArrayTexture?(O.setTexture2DArray(G,0),bt=C.TEXTURE_2D_ARRAY):(O.setTexture2D(G,0),bt=C.TEXTURE_2D),C.pixelStorei(C.UNPACK_FLIP_Y_WEBGL,G.flipY),C.pixelStorei(C.UNPACK_PREMULTIPLY_ALPHA_WEBGL,G.premultiplyAlpha),C.pixelStorei(C.UNPACK_ALIGNMENT,G.unpackAlignment);const Ge=C.getParameter(C.UNPACK_ROW_LENGTH),ee=C.getParameter(C.UNPACK_IMAGE_HEIGHT),je=C.getParameter(C.UNPACK_SKIP_PIXELS),rn=C.getParameter(C.UNPACK_SKIP_ROWS),qn=C.getParameter(C.UNPACK_SKIP_IMAGES);C.pixelStorei(C.UNPACK_ROW_LENGTH,de.width),C.pixelStorei(C.UNPACK_IMAGE_HEIGHT,de.height),C.pixelStorei(C.UNPACK_SKIP_PIXELS,At),C.pixelStorei(C.UNPACK_SKIP_ROWS,Gt),C.pixelStorei(C.UNPACK_SKIP_IMAGES,Xt);const mi=T.isDataArrayTexture||T.isData3DTexture,ue=G.isDataArrayTexture||G.isData3DTexture;if(T.isDepthTexture){const Ae=M.get(T),Pn=M.get(G),Ee=M.get(Ae.__renderTarget),Dn=M.get(Pn.__renderTarget);ht.bindFramebuffer(C.READ_FRAMEBUFFER,Ee.__webglFramebuffer),ht.bindFramebuffer(C.DRAW_FRAMEBUFFER,Dn.__webglFramebuffer);for(let gi=0;gi<yt;gi++)mi&&(C.framebufferTextureLayer(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,M.get(T).__webglTexture,V,Xt+gi),C.framebufferTextureLayer(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,M.get(G).__webglTexture,ft,me+gi)),C.blitFramebuffer(At,Gt,mt,dt,wt,oe,mt,dt,C.DEPTH_BUFFER_BIT,C.NEAREST);ht.bindFramebuffer(C.READ_FRAMEBUFFER,null),ht.bindFramebuffer(C.DRAW_FRAMEBUFFER,null)}else if(V!==0||T.isRenderTargetTexture||M.has(T)){const Ae=M.get(T),Pn=M.get(G);ht.bindFramebuffer(C.READ_FRAMEBUFFER,dh),ht.bindFramebuffer(C.DRAW_FRAMEBUFFER,ph);for(let Ee=0;Ee<yt;Ee++)mi?C.framebufferTextureLayer(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,Ae.__webglTexture,V,Xt+Ee):C.framebufferTexture2D(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,Ae.__webglTexture,V),ue?C.framebufferTextureLayer(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,Pn.__webglTexture,ft,me+Ee):C.framebufferTexture2D(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,Pn.__webglTexture,ft),V!==0?C.blitFramebuffer(At,Gt,mt,dt,wt,oe,mt,dt,C.COLOR_BUFFER_BIT,C.NEAREST):ue?C.copyTexSubImage3D(bt,ft,wt,oe,me+Ee,At,Gt,mt,dt):C.copyTexSubImage2D(bt,ft,wt,oe,At,Gt,mt,dt);ht.bindFramebuffer(C.READ_FRAMEBUFFER,null),ht.bindFramebuffer(C.DRAW_FRAMEBUFFER,null)}else ue?T.isDataTexture||T.isData3DTexture?C.texSubImage3D(bt,ft,wt,oe,me,mt,dt,yt,ce,Ce,de.data):G.isCompressedArrayTexture?C.compressedTexSubImage3D(bt,ft,wt,oe,me,mt,dt,yt,ce,de.data):C.texSubImage3D(bt,ft,wt,oe,me,mt,dt,yt,ce,Ce,de):T.isDataTexture?C.texSubImage2D(C.TEXTURE_2D,ft,wt,oe,mt,dt,ce,Ce,de.data):T.isCompressedTexture?C.compressedTexSubImage2D(C.TEXTURE_2D,ft,wt,oe,de.width,de.height,ce,de.data):C.texSubImage2D(C.TEXTURE_2D,ft,wt,oe,mt,dt,ce,Ce,de);C.pixelStorei(C.UNPACK_ROW_LENGTH,Ge),C.pixelStorei(C.UNPACK_IMAGE_HEIGHT,ee),C.pixelStorei(C.UNPACK_SKIP_PIXELS,je),C.pixelStorei(C.UNPACK_SKIP_ROWS,rn),C.pixelStorei(C.UNPACK_SKIP_IMAGES,qn),ft===0&&G.generateMipmaps&&C.generateMipmap(bt),ht.unbindTexture()},this.initRenderTarget=function(T){M.get(T).__webglFramebuffer===void 0&&O.setupRenderTarget(T)},this.initTexture=function(T){T.isCubeTexture?O.setTextureCube(T,0):T.isData3DTexture?O.setTexture3D(T,0):T.isDataArrayTexture||T.isCompressedArrayTexture?O.setTexture2DArray(T,0):O.setTexture2D(T,0),ht.unbindTexture()},this.resetState=function(){P=0,U=0,I=null,ht.reset(),ct.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return hn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;const e=this.getContext();e.drawingBufferColorSpace=Qt._getDrawingBufferColorSpace(t),e.unpackColorSpace=Qt._getUnpackColorSpace()}}const P_=.08,D_=.105,L_=1e-12;function I_(i,t){return i>t?t:i<-t?-t:i}function uc(i,t){if(t===0)return 0;if(t<0)return yr(i,0)*t;let e=0,n=0;for(const s of i.grades){const r=Math.max(s.from,0),a=Math.min(s.to,t);a>r&&(e+=s.value*(a-r),n=a)}return t>n&&(e+=yr(i,t)*(t-n)),e}function hc(i,t){let e=0,n=0,s=0;if(t===0)return{x:e,z:n,heading:s};const r=(o,l)=>{if(l!==0)if(Math.abs(o)<L_)e+=l*Math.sin(s),n+=l*Math.cos(s);else{const c=o*l;e+=(Math.cos(s)-Math.cos(s+c))/o,n+=(Math.sin(s+c)-Math.sin(s))/o,s+=c}};if(t<0)return r(Oa(i,0),t),{x:e,z:n,heading:s};let a=0;for(const o of i.curvatures){const l=Math.max(o.from,0),c=Math.min(o.to,t);c>l&&(r(o.value,c-l),a=c)}return t>a&&r(Oa(i,t),t-a),{x:e,z:n,heading:s}}function Ke(i,t){return hc(i,t).heading}function U_(i,t){const e=Oa(i,t),n=ou(i,t),s=P_*Math.abs(e)*n*n,r=Math.sign(e)*s;return I_(r,D_)}function N_(i,t){const e=hc(i,t),n=uc(i,t),s={x:Math.sin(e.heading),y:0,z:Math.cos(e.heading)},r={x:0,y:1,z:0};return{x:e.x,y:n,z:e.z,tangent:s,up:r,heading:e.heading,cant:U_(i,t)}}function fe(i,t,e){const n=hc(i,t),s=Math.cos(n.heading),r=-Math.sin(n.heading);return{x:n.x+e*s,y:uc(i,t),z:n.z+e*r,heading:n.heading}}const Ss=4,fc=80,Dl=-.4,Zu=18,ju=12,F_=120,Ju=6,O_=6,B_=.5,z_=2,Uo=24,G_=1,H_=3;function ui(i,t,e){if(i===t)return e<i?0:1;let n=(e-i)/(t-i);return n<=0?0:n>=1?1:n*n*(3-2*n)}function Vi(i,t,e){return e===0?i:e===1?t:i+(t-i)*e}function ur(i,t,e){let n=(i|0)>>>0;n=(n^(t|0)>>>0)>>>0,n=Math.imul(n^n>>>16,73244475)>>>0,n=(n^(e|0)>>>0)>>>0,n=Math.imul(n^n>>>16,73244475)>>>0,n=n+1831565813>>>0;let s=n;return s=Math.imul(s^s>>>15,s|1)>>>0,s=(s^s+Math.imul(s^s>>>7,s|61))>>>0,s=(s^s>>>14)>>>0,s/4294967296}function Ll(i){return Math.floor(i/Uo)}function V_(i,t,e){let n=0,s=1,r=0,a=t,o=e,l=i>>>0;for(let c=0;c<H_;c++){const h=Ll(a),f=Ll(o),u=a/Uo-h,m=o/Uo-f,g=ur(l,h,f),v=ur(l,h+1,f),p=ur(l,h,f+1),d=ur(l,h+1,f+1),x=u*u*(3-2*u),y=m*m*(3-2*m),S=Vi(g,v,x),A=Vi(p,d,x),b=Vi(S,A,y);n+=(b*2-1)*s,r+=s,s*=.5,a*=2,o*=2,l=Math.imul(l^2654435769,2246822507)>>>0>>>0}return r===0?0:n/r}function k_(i,t){let e=0;if(i.viaducts)for(const n of i.viaducts)e+=-n.valleyDepth*Rs(t,n.center,n.halfLen);if(i.tunnels)for(const n of i.tunnels)e+=n.hillHeight*Rs(t,n.center,n.halfLen);return e}function Rs(i,t,e){const n=Math.abs(i-t);return n<=e?1:1-ui(e,e+F_,n)}function Te(i,t){return uc(i,t)}function Qu(i,t,e){return Te(i,t)+k_(i,t)}function W_(i,t,e){const n=i.terrainSeed??G_,s=V_(n,t,e)*O_;return Qu(i,t)+s}function th(i,t){return Qu(i,t)-Te(i,t)}function X_(i,t){let e=0;if(i.viaducts)for(const n of i.viaducts){const s=n.valleyDepth*Rs(t,n.center,n.halfLen);e=Math.max(e,ui(0,Zu,s))}if(i.tunnels)for(const n of i.tunnels){const s=n.hillHeight*Rs(t,n.center,n.halfLen);e=Math.max(e,ui(0,ju,s))}return e}function hi(i,t){return th(i,t)<-Zu}function Y_(i,t){return th(i,t)>ju}function fi(i,t,e){return Y_(i,t)&&Math.abs(e)<Ju}function q_(i){return i<=Ss?Dl:Dl*(1-ui(Ss,Ss+fc,i))}function K_(i,t){let e=0;if(i.tunnels)for(const n of i.tunnels)e+=n.hillHeight*Rs(t,n.center,n.halfLen);return e}function $_(i,t,e){const n=K_(i,t);if(n===0)return 0;const s=1-ui(Ss,Ju+fc,e),r=ui(0,z_,n);return s*r}function Vn(i,t,e){const n=Math.abs(e),s=Te(i,t),r=W_(i,t,e),a=s+q_(n),o=ui(0,fc,n-Ss),l=Vi(a,r,o),c=X_(i,t),h=Vi(l,r,c),f=$_(i,t,n);return Vi(h,a,f)}function Cs(i,t,e,n){return Vn(i,t,e)+n}function Z_(i,t,e,n){const s=Vn(i,t,e)+B_;return n>s?n:s}const j_=1.9,J_=.5,Q_=.052,tx=.07;function Il(i,t){return i>t?t:i<-t?-t:i}function ex(i,t,e){return{pitch:Il(e*Math.atan(t),Q_),roll:Il(e*i,tx)}}function nx(i,t,e,n){const s=fe(i,t,e),r=s.y+n;return{x:s.x,y:Z_(i,t,e,r),z:s.z,heading:s.heading}}const ix=120,sx=240*Math.PI/180,rx=120*Math.PI/180,Ul=-.5,Nl=.55,ax=3.2,ox=52*Math.PI/180,Fl=-12*Math.PI/180;function cx(i,t=0){const e=new we;e.position.x=t,i.add(e);const n=new cc(16771272,.9,3.2);n.position.set(t,.15,-.35),i.add(n);const s=new kt({color:1316895,roughness:.7,metalness:.3}),r=new kt({color:1777704,roughness:.6,metalness:.25}),a=new kt({color:790292,roughness:.8,metalness:.2}),o=1.02,l=.82,c=-1.25,h=-.95,f=.85,u=.05,m=f-h,g=(h+f)/2,v=(l+c)/2,p=l-c,d=(gt,rt,C,Lt,vt,qt)=>{const ht=new Bt(new jt(gt,rt,C),a);ht.position.set(Lt,vt,qt),e.add(ht)};d(u,p,m,-o,v,g),d(u,p,m,o,v,g),d(2*o+u,u,m,0,l,g),d(2*o+u,u,m,0,c,g),d(2*o+u,p,u,0,v,f);const x=o-.95+u,y=.95+x/2-u/2;d(x,p,u,-y,v,h),d(x,p,u,y,v,h);const S=l-.62;d(2*.95,S,u,0,.62+S/2,h);const A=-.62-c;d(2*.95,A,u,0,-.62-A/2,h);const b=-.9,w=a,_=.95,E=.62,D=.06,P=(gt,rt,C,Lt)=>{const vt=new Bt(new jt(gt,rt,D),w);return vt.position.set(C,Lt,b),vt};e.add(P(2*_+D,D,0,E)),e.add(P(2*_+D,D,0,-E)),e.add(P(D,2*E,-_,0)),e.add(P(D,2*E,_,0)),e.add(P(D,2*E,0,0));const U=new Bt(new jt(1.9,.08,.55),r);U.position.set(0,-.62,-.78),U.rotation.x=-.18,e.add(U);function I(gt,rt){const C=new we;C.position.set(gt,-.58,-.7);const Lt=new Bt(new Hn(.018,.022,.26,12),s);Lt.position.y=.13,C.add(Lt);const vt=new Bt(new Ds(.04,16,12),new kt({color:rt,roughness:.5,metalness:.2}));return vt.position.y=.27,C.add(vt),e.add(C),C}const z=I(-.42,3828282),F=I(.42,6959152),N=new we;N.position.set(-.74,-.58,-.66);const H=new Bt(new Hn(.014,.016,.14,10),s);H.position.y=.07,N.add(H),e.add(N);const K=new we;K.position.set(0,-.46,-.66),K.rotation.x=-.35;const $=new Bt(new Hn(.12,.12,.02,32),new kt({color:329740,roughness:.5,metalness:.1}));$.rotation.x=Math.PI/2,K.add($);const J=new Bt(new ac(.12,.012,12,32),new kt({color:2238771,roughness:.6,metalness:.4}));K.add(J);const st=new we;K.add(st);const et=new Bt(new jt(.012,.1,.006),new kt({color:16733491,emissive:16724753,emissiveIntensity:.6,roughness:.4}));et.position.set(0,.045,.012),st.add(et);const Ct=new qi(.03,20);function It(gt,rt){const C=new kt({color:658706,emissive:new Nt(rt),emissiveIntensity:0,roughness:.5}),Lt=new Bt(Ct,C);return Lt.position.set(gt,-.4,-.64),Lt.rotation.x=-.35,e.add(Lt),{mesh:Lt,mat:C}}const Kt=It(-.36,16756768),Z=It(-.28,16756768),it=It(-.2,16724770),nt=new we;nt.position.set(.34,-.4,-.64),nt.rotation.x=-.35;const Ut=new Bt(new qi(.035,24),new kt({color:329482,roughness:.6}));nt.add(Ut);const Tt=new Bt(new Fr(.018,.034,16,1),new kt({color:15777824,emissive:12619792,emissiveIntensity:.5,roughness:.5}));Tt.position.z=.001,Tt.visible=!1,nt.add(Tt),e.add(nt);let Pt=0;const ie=new we;ie.position.set(-.5,-E+.02,b-.04);const Yt=new Bt(new jt(.025,1.05,.02),new kt({color:329482,roughness:.8}));Yt.position.y=.5,ie.add(Yt),e.add(ie);function $t(gt,rt,C){return gt+(rt-gt)*C}function ne(gt){z.rotation.x=$t(Ul,Nl,hr(gt.powerFrac)),F.rotation.x=$t(Ul,Nl,hr(gt.brakeFrac)),N.rotation.x=gt.reverser==="FWD"?.5:gt.reverser==="REV"?-.5:0;const rt=hr(Math.abs(gt.speedMph)/ix);if(st.rotation.z=rx-rt*sx,Kt.mat.emissiveIntensity=gt.dra?1.1:0,Z.mat.emissiveIntensity=gt.dsd?1.1:0,it.mat.emissiveIntensity=gt.penalty?1.3:0,Tt.visible=gt.sunflower==="CAUTION",gt.wiperOn)Pt+=gt.dt*ax,ie.rotation.z=Fl+Math.sin(Pt)*ox;else{const C=hr(gt.dt*4);ie.rotation.z=$t(ie.rotation.z,Fl,C)}}return{update:ne}}const hr=i=>i<0?0:i>1?1:i;function zr(i){let t=i>>>0;return()=>{t=t+1831565813>>>0;let e=Math.imul(t^t>>>15,1|t);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}const $e=new te,$i=new L,Zi=new L,ji=new Ze,lx=new L(0,1,0);function Es(i,t,e,n,s,r,a,o){$e.compose($i.set(e,n,s),ji,Zi.set(r,a,o)),i.setMatrixAt(t,$e)}function ux(i,t,e){hx(i,t,e),fx(i,t,e),dx(i,t,e),fr(i,t,e,1200,5922406),fr(i,t,e,3e3,7034695),fr(i,t,e,4e3,5462111),fr(i,t,e,6600,7034695),px(i,t,e)}function hx(i,t,e){const n=t.length,s=zr(8675309),r=720,a=new kt({color:4864552,roughness:1}),o=new _e(new Hn(.18,.26,1,6),a,r),l=new kt({color:3366959,roughness:1,flatShading:!0}),c=new _e(new Nr(1,0),l,r),h=e/2+7;let f=0,u=0;for(;f<r&&u<r*4;){u++;const m=s()*n,v=(s()<.5?-1:1)*(h+s()*s()*150),p=3+Math.floor(s()*5);for(let d=0;d<p&&f<r;d++){const x=m+(s()-.5)*28,y=v+(s()-.5)*22;if(Math.abs(y)<h||x<0||x>n||hi(t,x)||fi(t,x,y))continue;const S=fe(t,x,y),A=Cs(t,x,y,0),b=4+s()*7,w=b*.45;Es(o,f,S.x,A+w/2,S.z,1,w,1);const _=b*.42;$e.compose($i.set(S.x,A+w+_*.7,S.z),ji,Zi.set(_,_*1.25,_)),c.setMatrixAt(f,$e),f++}}for(let m=f;m<r;m++)Es(o,m,0,-1e3,0,1,1,1),Es(c,m,0,-1e3,0,1,1,1);o.instanceMatrix.needsUpdate=!0,c.instanceMatrix.needsUpdate=!0,o.frustumCulled=!1,c.frustumCulled=!1,i.add(o),i.add(c)}function fx(i,t,e){const n=t.length,s=zr(1234567),r=520,a=new kt({color:2904360,roughness:1,flatShading:!0}),o=new _e(new Nr(1,0),a,r),l=e/2+6;let c=0,h=0;for(;c<r&&h<r*4;){h++;const f=s()*n,m=(s()<.5?-1:1)*(l+s()*s()*90),g=4+Math.floor(s()*6);for(let v=0;v<g&&c<r;v++){const p=f+(s()-.5)*24,d=m+(s()-.5)*10;if(Math.abs(d)<l||p<0||p>n||hi(t,p)||fi(t,p,d))continue;const x=fe(t,p,d),y=Cs(t,p,d,0),S=.7+s()*.9,A=.5+s()*.5;$e.compose($i.set(x.x,y+A*.8,x.z),ji,Zi.set(S,A,S)),o.setMatrixAt(c,$e),c++}}for(let f=c;f<r;f++)Es(o,f,0,-1e3,0,1,1,1);o.instanceMatrix.needsUpdate=!0,o.frustumCulled=!1,i.add(o)}function dx(i,t,e){const n=t.length,s=zr(20260617),r=240,a=new kt({roughness:.9,flatShading:!0}),o=new _e(new jt(1,1,1),a,r),l=[3816772,4604219,4014664,4867392,3553856,5261890],c=e/2+12,h=new Nt,f=[{c:700,half:1100,maxH:26,reach:150},{c:2e3,half:700,maxH:12,reach:110}];let u=0,m=0;for(;u<r&&m<r*6;){m++;const g=f[Math.floor(s()*f.length)];if(!g)continue;const v=g.c+(s()-.5)*2*g.half;if(v<0||v>n)continue;const d=(s()<.5?-1:1)*(c+s()*s()*g.reach);if(hi(t,v)||fi(t,v,d))continue;const x=fe(t,v,d),y=Cs(t,v,d,0),A=4+(1-Math.min(1,Math.abs(d)/(c+g.reach)))*g.maxH*(.4+s()*.6),b=5+s()*9,w=5+s()*9;$e.compose($i.set(x.x,y+A/2,x.z),ji,Zi.set(b,A,w)),o.setMatrixAt(u,$e);const _=l[Math.floor(s()*l.length)]??3816772;o.setColorAt(u,h.setHex(_)),u++}for(let g=u;g<r;g++)Es(o,g,0,-1e3,0,1,1,1);o.instanceMatrix.needsUpdate=!0,o.instanceColor&&(o.instanceColor.needsUpdate=!0),o.frustumCulled=!1,i.add(o)}function fr(i,t,e,n,s){if(n<0||n>t.length||hi(t,n)||fi(t,n,0))return;const r=new kt({color:s,roughness:.9}),a=16,o=Te(t,n),l=6.2,c=o+l,h=.7,f=fe(t,n,0),u=new we;u.position.set(f.x,0,f.z),u.quaternion.setFromAxisAngle(lx,f.heading);const m=new Bt(new jt(a,h,4.5),r);m.position.set(0,c,0),u.add(m);for(const g of[-2,2]){const v=new Bt(new jt(a,1,.3),r);v.position.set(0,c+.85,g),u.add(v)}for(const g of[-5.2175,e/2+4.5]){const v=new Bt(new jt(3,l,5),r);v.position.set(g*1.6,o+l/2,0),u.add(v)}i.add(u)}function px(i,t,e){const n=zr(54321),s=e/2+.7+1,r=.9,a=[9059122,3297390,3493946,5917234,4211274],o=t.stations.length*4,l=new _e(new sc(.22,.9,3,6),new kt({roughness:1}),o),c=new _e(new Ds(.16,8,6),new kt({color:13150602,roughness:1}),o),h=new Nt;let f=0;for(const u of t.stations){const m=Te(t,u.chainage)+r,g=4;for(let v=0;v<g;v++){const p=u.chainage+(n()-.5)*2*(u.platformHalf-12),d=s+(n()-.5)*1.4,x=fe(t,p,d);$e.compose($i.set(x.x,m+.85,x.z),ji,Zi.set(1,1,1)),l.setMatrixAt(f,$e);const y=a[v%a.length]??8421504;l.setColorAt(f,h.setHex(y)),$e.compose($i.set(x.x,m+1.55,x.z),ji,Zi.set(1,1,1)),c.setMatrixAt(f,$e),f++}}l.instanceMatrix.needsUpdate=!0,l.instanceColor&&(l.instanceColor.needsUpdate=!0),c.instanceMatrix.needsUpdate=!0,i.add(l),i.add(c)}function dr(i,t,e){let n=(i|0)*374761393+(t|0)*668265263+(e|0)*362437;return n=(n^n>>>13)*1274126177,n=n^n>>>16,(n>>>0)/4294967296}function Wn(i){return i*i*(3-2*i)}function mx(i,t,e,n){const s=Math.floor(i),r=Math.floor(t),a=Wn(i-s),o=Wn(t-r),l=(s%e+e)%e,c=(r%e+e)%e,h=(l+1)%e,f=(c+1)%e,u=dr(l,c,n),m=dr(h,c,n),g=dr(l,f,n),v=dr(h,f,n),p=u+(m-u)*a,d=g+(v-g)*a;return p+(d-p)*o}function Ol(i,t,e,n,s){let r=0,a=1,o=0,l=e,c=1;for(let h=0;h<n;h++)r+=a*mx(i*c,t*c,l,s+h*101),o+=a,a*=.5,c*=2,l*=2;return o>0?r/o:0}function eh(i){const t=document.createElement("canvas");t.width=i,t.height=i;const e=t.getContext("2d");if(!e){const s=new ImageData(i,i);return{canvas:t,ctx:e,img:s}}const n=e.createImageData(i,i);return{canvas:t,ctx:e,img:n}}function wn(i){return i<0?0:i>255?255:i|0}function Gr(i,t,e){const n=new Ur(i);return n.colorSpace=Le,n.wrapS=li,n.wrapT=li,n.repeat.set(t,t),n.anisotropy=e,n.needsUpdate=!0,n}function Hr(i,t,e){const n=new Ur(i);return n.colorSpace=yn,n.wrapS=li,n.wrapT=li,n.repeat.set(t,t),n.anisotropy=e,n.needsUpdate=!0,n}function Vr(i,t,e,n){const{canvas:s,ctx:r,img:a}=eh(i),o=a.data;for(let l=0;l<i*i;l++){const c=t[l]??0,h=e[l]??0,[f,u,m]=n(c,h),g=l*4;o[g]=wn(f),o[g+1]=wn(u),o[g+2]=wn(m),o[g+3]=255}return r&&typeof r.putImageData=="function"&&r.putImageData(a,0,0),s}function kr(i,t,e){const{canvas:n,ctx:s,img:r}=eh(i),a=r.data,o=(l,c)=>{const h=(l%i+i)%i,f=(c%i+i)%i;return t[f*i+h]??0};for(let l=0;l<i;l++)for(let c=0;c<i;c++){const h=(o(c-1,l)-o(c+1,l))*e,f=(o(c,l-1)-o(c,l+1))*e,u=-h,m=-f,g=1,v=Math.sqrt(u*u+m*m+g*g)||1,p=(l*i+c)*4;a[p]=wn(u/v*127.5+127.5),a[p+1]=wn(m/v*127.5+127.5),a[p+2]=wn(g/v*127.5+127.5),a[p+3]=255}return s&&typeof s.putImageData=="function"&&s.putImageData(r,0,0),n}function Wr(i,t,e,n,s,r){const a=new Float32Array(i*i),o=new Float32Array(i*i),l=t/i,c=n/i;for(let h=0;h<i;h++)for(let f=0;f<i;f++){const u=h*i+f;a[u]=Ol(f*l,h*l,t,e,r),o[u]=Ol(f*c,h*c,n,s,r+9973)}return{height:a,detail:o}}function Xn(i,t,e){return[i[0]+(t[0]-i[0])*e,i[1]+(t[1]-i[1])*e,i[2]+(t[2]-i[2])*e]}function gx(i,t,e){const{height:n,detail:s}=Wr(i,4,4,16,3,1311),r=[86,66,40],a=[48,70,32],o=[96,122,56],l=Vr(i,n,s,(f,u)=>{const m=Xn(a,o,u);return Xn(r,m,Wn(Math.min(1,f*1.3)))}),c=new Float32Array(i*i);for(let f=0;f<c.length;f++)c[f]=(n[f]??0)*.7+(s[f]??0)*.3;const h=kr(i,c,3);return{albedo:Gr(l,t,e),normal:Hr(h,t,e)}}function _x(i,t,e){const{height:n,detail:s}=Wr(i,8,2,32,4,5101),r=[60,58,56],a=[140,136,130],o=Vr(i,n,s,(c,h)=>{const f=Wn(h);return Xn(r,a,f)}),l=kr(i,s,5);return{albedo:Gr(o,t,e),normal:Hr(l,t,e)}}function xx(i,t,e){const{height:n,detail:s}=Wr(i,6,3,24,2,7321),r=[150,146,138],a=[110,104,96],o=new Float32Array(i*i),l=Vr(i,n,s,(h,f)=>Xn(a,r,Wn(h*.6+f*.4)));for(let h=0;h<i;h++){const f=Math.abs(h/i*6%1-.5)<.04?0:1;for(let u=0;u<i;u++){const m=h*i+u;o[m]=(s[m]??0)*.5+f*.5}}const c=kr(i,o,2);return{albedo:Gr(l,t,e),normal:Hr(c,t,e)}}function vx(i,t,e){const{height:n,detail:s}=Wr(i,2,2,48,2,211),r=[96,98,104],a=[150,152,158],o=new Float32Array(i*i),l=Vr(i,n,s,(h,f)=>{const u=Wn(f*.6+.2);return Xn(r,a,u)});for(let h=0;h<o.length;h++)o[h]=(s[h]??0)*.25;const c=kr(i,o,.8);return{albedo:Gr(l,t,e),normal:Hr(c,t,e)}}function Mx(i=1){const t=Math.max(1,i|0),e=gx(256,1,t),n=_x(128,1,t),s=xx(256,1,t),r=vx(64,1,t),a=[e,n,s,r];return{ground:e,ballast:n,masonry:s,rail:r,dispose(){for(const o of a)o.albedo.dispose(),o.normal.dispose()}}}const Cr=16,Pr=16;function Bl(i){return[i>>16&255,i>>8&255,i&255]}function zl(i,t){const e=Bl(i),n=Bl(t),s=[e[0]*.72,e[1]*.76,e[2]*.85],r=Xn(e,[255,255,255],.18),a=new Uint8Array(Cr*Pr*4);Sx(a,s,r,n);const o=new nc(a,Cr,Pr,qe);return o.mapping=gr,o.colorSpace=Le,o.minFilter=be,o.magFilter=be,o.needsUpdate=!0,o}function Sx(i,t,e,n){for(let s=0;s<Pr;s++){const r=s/(Pr-1);let a;r<.5?a=Xn(t,e,Wn(r/.5)):a=Xn(e,n,Wn((r-.5)/.5));for(let o=0;o<Cr;o++){const l=(s*Cr+o)*4;i[l]=wn(a[0]),i[l+1]=wn(a[1]),i[l+2]=wn(a[2]),i[l+3]=255}}}function Ex(i){i&&i.dispose()}function yx(){const t=document.createElement("canvas");t.width=t.height=32;const e=t.getContext("2d");if(e){const r=e.createRadialGradient(16,16,0,16,16,16);r.addColorStop(0,"rgba(255,255,255,1)"),r.addColorStop(.5,"rgba(255,255,255,0.55)"),r.addColorStop(1,"rgba(255,255,255,0)"),e.fillStyle=r,e.fillRect(0,0,32,32)}const n=new Ur(t);return n.colorSpace=Le,n.needsUpdate=!0,n}const Gl=200,bx=900,Hl=1.435,Tx=.25,Ax=.07,Ra=.12,Vl=.06,wx=2.6,kl=.12,Rx=.25,Wl=.65,Cx=1.9,Xl=.34,Ca=.35,Px=.08,Yl=40,Dx=2.4,Lx=3,Pa=1.6,Da=3.2,Ix=2.2,Ux=1.5,ql=5.5,Kl=7.5,La=8.5,ps=1.4;function Ia(i,t,e){i.map=t.albedo,i.normalMap=t.normal,i.envMapIntensity=e,i.needsUpdate=!0}function Nx(i,t,e,n=1){const s=Mx(n),r=[s],a=d=>{r.push(d)},o=new we;i.add(o);const l=new kt({color:16777215,roughness:1}),c=s.ground.albedo.clone(),h=s.ground.normal.clone();c.needsUpdate=!0,h.needsUpdate=!0,c.repeat.set(8,8),h.repeat.set(8,8),l.map=c,l.normalMap=h,l.envMapIntensity=Tx,a(l),a(c),a(h),Fx(o,t,e,l,a);const f=new kt({color:5923438,metalness:.95,roughness:Ca});Ia(f,s.rail,1),a(f);const u=new kt({color:16777215,roughness:1});Ia(u,s.ballast,.15),a(u);const m=new kt({color:2762274,roughness:.95});a(m),Ox(o,t,e,f,u,m,a);const g=new kt({color:16777215,roughness:.92});Ia(g,s.masonry,.2),a(g);const v=[];Bx(o,t,g,v,a);const p=zx(o,t,g,a);return Hx(o,t,v,a),{group:o,railMaterial:f,waterMaterials:v,boreLight:p,railRoughnessFor(d){const x=d<0?0:d>1?1:d;return Ca+(Px-Ca)*x},dispose(){i.remove(o),Vx(o);for(const d of r)d.dispose()}}}function Fx(i,t,e,n,s){const r=-Gl,a=t.length+Gl,o=Math.max(1,e.terrainSegLen),l=Math.max(1,Math.ceil((a-r)/o)),c=l+1,h=Math.max(2,e.terrainSubdiv)+1,f=e.ribbonHalfWidth,u=new Float32Array(c*h*3),m=new Float32Array(c*h*2),g=_=>r+_/l*(a-r),v=_=>-f+_/(h-1)*(2*f);for(let _=0;_<c;_++){const E=g(_);for(let D=0;D<h;D++){const P=v(D),U=fe(t,E,P),I=Vn(t,E,P),z=(_*h+D)*3;u[z]=U.x,u[z+1]=I,u[z+2]=U.z;const F=(_*h+D)*2;m[F]=E/40,m[F+1]=P/40}}const p=new Float32Array(c*h*3),d=(_,E,D)=>{const P=_<0?0:_>=c?c-1:_,U=E<0?0:E>=h?h-1:E,I=(P*h+U)*3;return D.set(u[I]??0,u[I+1]??0,u[I+2]??0)},x=new L,y=new L,S=new L,A=new L,b=new L;for(let _=0;_<c;_++)for(let E=0;E<h;E++){d(_+1,E,x),d(_-1,E,y),S.subVectors(x,y),d(_,E+1,x),d(_,E-1,y),A.subVectors(x,y),b.crossVectors(A,S),b.y<0&&b.negate(),b.normalize();const D=(_*h+E)*3;p[D]=b.x,p[D+1]=b.y,p[D+2]=b.z}const w=Math.max(1,Math.round(bx/o));for(let _=0;_<l;_+=w){const D=Math.min(l,_+w)-_+1,P=D*h,U=new Float32Array(P*3),I=new Float32Array(P*3),z=new Float32Array(P*2);for(let K=0;K<D;K++){const $=_+K;for(let J=0;J<h;J++){const st=($*h+J)*3,et=(K*h+J)*3;U[et]=u[st]??0,U[et+1]=u[st+1]??0,U[et+2]=u[st+2]??0,I[et]=p[st]??0,I[et+1]=p[st+1]??0,I[et+2]=p[st+2]??0;const Ct=($*h+J)*2,It=(K*h+J)*2;z[It]=m[Ct]??0,z[It+1]=m[Ct+1]??0}}const F=[];for(let K=0;K<D-1;K++)for(let $=0;$<h-1;$++){const J=K*h+$,st=(K+1)*h+$,et=K*h+($+1),Ct=(K+1)*h+($+1);F.push(J,st,Ct,J,Ct,et)}if(F.length===0)continue;const N=new ve;N.setAttribute("position",new Ne(U,3)),N.setAttribute("normal",new Ne(I,3)),N.setAttribute("uv",new Ne(z,2)),N.setIndex(F),N.computeBoundingSphere(),s(N);const H=new Bt(N,n);H.receiveShadow=!0,i.add(H)}}function Ox(i,t,e,n,s,r,a){const o=t.length,l=Math.max(2,e.terrainSegLen),c=Math.max(1,Math.ceil(o/l)),h=new jt(Ax,Ra,1);a(h);const f=new jt(Cx*2,.3,1);a(f);const u=new _e(h,n,c),m=new _e(h,n,c),g=new _e(f,s,c);g.receiveShadow=!0;const v=new te,p=new L,d=new Ze,x=new ze(0,0,0,"YXZ"),y=new L(1,1,1);for(let w=0;w<c;w++){const _=w*l,E=Math.min(o,(w+1)*l),D=(_+E)/2,P=E-_,U=Ke(t,D),I=Te(t,D);x.set(0,U,0),d.setFromEuler(x);const z=fe(t,D,0);y.set(1,1,P),p.set(z.x,I-Xl-.15,z.z),v.compose(p,d,y),g.setMatrixAt(w,v);const F=fe(t,D,-Hl/2);p.set(F.x,I+Vl-Ra/2,F.z),v.compose(p,d,y),u.setMatrixAt(w,v);const N=fe(t,D,Hl/2);p.set(N.x,I+Vl-Ra/2,N.z),v.compose(p,d,y),m.setMatrixAt(w,v)}u.instanceMatrix.needsUpdate=!0,m.instanceMatrix.needsUpdate=!0,g.instanceMatrix.needsUpdate=!0,i.add(u,m,g);const S=new jt(wx,kl,Rx);a(S);const A=Math.max(1,Math.floor(o/Wl)),b=new _e(S,r,A);for(let w=0;w<A;w++){const _=(w+.5)*Wl,E=Ke(t,_),D=fe(t,_,0),P=Te(t,_);x.set(0,E,0),d.setFromEuler(x),y.set(1,1,1),p.set(D.x,P-Xl+kl/2,D.z),v.compose(p,d,y),b.setMatrixAt(w,v)}b.instanceMatrix.needsUpdate=!0,i.add(b)}function Bx(i,t,e,n,s){const r=t.viaducts;if(!r||r.length===0)return;const a=new te,o=new L,l=new Ze,c=new ze(0,0,0,"YXZ"),h=new L(1,1,1),f=8;let u=0,m=0;for(const S of r){const A=S.center-S.halfLen,b=S.center+S.halfLen;u+=Math.max(1,Math.ceil((b-A)/f));const w=Math.max(2,Math.floor((b-A)/Yl)+1);m+=w*2}const g=new jt(Da*2,Pa,f+.2);s(g);const v=new _e(g,e,u);v.castShadow=!0,v.receiveShadow=!0;const p=new jt(Dx,1,Lx);s(p);const d=new _e(p,e,m);d.castShadow=!0;let x=0,y=0;for(const S of r){const A=S.center-S.halfLen,b=S.center+S.halfLen,w=Math.max(1,Math.ceil((b-A)/f));for(let I=0;I<w;I++){const z=A+(I+.5)*(b-A)/w,F=Ke(t,z),N=fe(t,z,0),H=Te(t,z);c.set(0,F,0),l.setFromEuler(c),h.set(1,1,1),o.set(N.x,H-Pa/2-.5,N.z),a.compose(o,l,h),v.setMatrixAt(x++,a)}const _=Math.max(2,Math.floor((b-A)/Yl)+1);for(let I=0;I<_;I++){const z=_===1?S.center:A+I/(_-1)*(b-A),F=Ke(t,z),N=Te(t,z);c.set(0,F,0),l.setFromEuler(c);for(const H of[-1,1]){const K=H*Ix,$=fe(t,z,K),J=Vn(t,z,K),st=N-Pa-.5,et=Math.max(.5,st-J);h.set(1,et,1),o.set($.x,J+et/2,$.z),a.compose(o,l,h),d.setMatrixAt(y++,a)}}const E=fe(t,S.center,0);Vn(t,S.center,0);const D=new es(80,S.halfLen*2+60);s(D);const P=new kt({color:2243146,roughness:.12,metalness:.5});P.envMapIntensity=.8,s(P),n.push(P);const U=new Bt(D,P);U.rotation.x=-Math.PI/2,U.rotation.z=Ke(t,S.center),U.position.set(E.x,Te(t,S.center)-S.valleyDepth+Ux,E.z),i.add(U);for(const I of[A,b]){const z=Ke(t,I),F=fe(t,I,0),N=Te(t,I),H=Vn(t,I,Da+4),K=Math.max(2,N-H+2),$=new jt(Da*2+4,K,5);s($);const J=new Bt($,e);J.castShadow=!0,J.receiveShadow=!0,c.set(0,z,0),l.setFromEuler(c),h.set(1,1,1),o.set(F.x,N-K/2,F.z),J.position.copy(o),J.quaternion.copy(l),i.add(J)}}v.instanceMatrix.needsUpdate=!0,d.instanceMatrix.needsUpdate=!0,i.add(v,d)}function zx(i,t,e,n){const s=t.tunnels;if(!s||s.length===0)return null;const r=10,a=new kt({color:329226,roughness:1,metalness:0,side:Ie});n(a);const o=new te,l=new L,c=new Ze,h=new ze(0,0,0,"YXZ"),f=new L(1,1,1);let u=0;for(const d of s)u+=Math.max(1,Math.ceil(2*d.halfLen/r));const m=new Hn(ql,ql,r+.2,16,1,!0,0,Math.PI);n(m);const g=new _e(m,a,u);let v=null,p=0;for(const d of s){const x=d.center-d.halfLen,y=d.center+d.halfLen,S=Math.max(1,Math.ceil(2*d.halfLen/r));for(let A=0;A<S;A++){const b=x+(A+.5)*(y-x)/S,w=Ke(t,b),_=fe(t,b,0),E=Te(t,b);h.set(Math.PI/2,w,0),c.setFromEuler(h),f.set(1,1,1),l.set(_.x,E+.2,_.z),o.compose(l,c,f),g.setMatrixAt(p++,o)}for(const A of[x,y]){const b=Ke(t,A),w=fe(t,A,0),_=Te(t,A),E=Gx(e,n);h.set(0,b,0),E.quaternion.setFromEuler(h),E.position.set(w.x,_,w.z),i.add(E)}if(!v){const A=fe(t,y,0),b=Te(t,y);v=new cc(6978192,.6,90,1.5),v.position.set(A.x,b+2.5,A.z),i.add(v)}}return g.instanceMatrix.needsUpdate=!0,i.add(g),v}function Gx(i,t){const e=new we,n=new jt(ps,La*2,ps);t(n);for(const a of[-1,1]){const o=new Bt(n,i);o.position.set(a*Kl,La,0),o.castShadow=!0,e.add(o)}const s=new jt(Kl*2+ps,ps,ps);t(s);const r=new Bt(s,i);return r.position.set(0,La*2,0),r.castShadow=!0,e.add(r),e}function Hx(i,t,e,n){const s=t.stations.find(x=>/coast|brine/i.test(x.name)),r=t.stations[t.stations.length-1];if(!r)return;const a=s?s.chainage:t.length*.75,o=r.chainage,l=(a+o)/2;if(!t.tunnels&&!t.viaducts)return;const c=Ke(t,l),h=2e3,u=fe(t,l,120+h/2),m=o-a+600,g=Te(t,o)-6,v=new es(h,m);n(v);const p=new kt({color:1454399,roughness:.1,metalness:.6});p.envMapIntensity=1,n(p),e.push(p);const d=new Bt(v,p);d.rotation.x=-Math.PI/2,d.rotation.z=c,d.position.set(u.x,g,u.z),i.add(d)}function Vx(i){i.traverse(t=>{const e=t;e.geometry&&typeof e.geometry.dispose=="function"&&e.geometry.dispose();const n=e.material;if(Array.isArray(n))for(const s of n)s.dispose();else n&&typeof n.dispose=="function"&&n.dispose()})}const kx=2.236936,Ms={RED:16720920,YELLOW:16756768,DOUBLE_YELLOW:16756768,GREEN:3211104},Wx=18,Ua=16,Na=40,Xx=22,Yx=.35,Ji=1.435,qx=.5,$l=4,Zl=140,ms=100,jl=2048,Kx=2400,$x=2;function Jl(i,t,e,n){const s=1-Math.exp(-4*Math.max(0,n));return i+(t-i)*s}function Zx(i,t,e){const n=e?.rainCount??Kx,s=e?.pixelRatioCap??$x,r=e?.shadowsEnabled??!1,a=e?.bloomEnabled??!1,o=e?.attitudeScale??0,l={ribbonHalfWidth:e?.ribbonHalfWidth??110,terrainSegLen:e?.terrainSegLen??20,terrainSubdiv:e?.terrainSubdiv??10},c=new C_({antialias:!0});c.setPixelRatio(Math.min(window.devicePixelRatio,s)),c.setSize(i.clientWidth,i.clientHeight),c.outputColorSpace=Le,c.toneMapping=Wo,c.toneMappingExposure=1,r&&(c.shadowMap.enabled=!0,c.shadowMap.type=fu),i.appendChild(c.domElement);const h=c.capabilities.getMaxAnisotropy(),f=new ld;f.background=new Nt(329743),f.fog=new ec(329743,25,260);const u=new ke(70,i.clientWidth/i.clientHeight,.05,4e3);u.rotation.order="YXZ";const m=.0042;let g=0,v=0,p=!1,d=0,x=0;const y=c.domElement;y.addEventListener("pointerdown",rt=>{if(rt.button===0){p=!0,d=rt.clientX,x=rt.clientY;try{y.setPointerCapture(rt.pointerId)}catch{}}}),y.addEventListener("pointermove",rt=>{p&&(g-=(rt.clientX-d)*m,v-=(rt.clientY-x)*m,d=rt.clientX,x=rt.clientY,g=Math.max(-2.4,Math.min(2.4,g)),v=Math.max(-.7,Math.min(.7,v)))});const S=rt=>{if(p){p=!1;try{y.releasePointerCapture(rt.pointerId)}catch{}}};y.addEventListener("pointerup",S),y.addEventListener("pointercancel",S);const A={topColor:{value:new Nt(329743)},bottomColor:{value:new Nt(660008)},offset:{value:33},exponent:{value:.6}},b=new sn({uniforms:A,side:Ie,depthWrite:!1,fog:!1,vertexShader:`
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
      }`}),w=new Bt(new Ds(3e3,24,12),b);f.add(w);let _=zl(329743,922639);f.environment=_;let E=329743,D=922639;const P=new Pd(1713718,197642,.35);f.add(P);const U=new al(9085128,.4);U.position.set(-40,80,-20),f.add(U);const I=new al(16777215,0),z=new xe;if(f.add(I),f.add(z),I.target=z,r){I.castShadow=!0,I.shadow.mapSize.set(jl,jl);const rt=I.shadow.camera;rt.left=-ms,rt.right=ms,rt.top=ms,rt.bottom=-ms,rt.near=1,rt.far=Zl+ms*2,rt.updateProjectionMatrix(),I.shadow.bias=-4e-4,I.shadow.normalBias=.6}const F=Nx(f,t,l,h);for(const rt of t.stations)ev(f,t,rt);const N=jx(f,t);Qx(f,t),ux(f,t,Ji),tv(f,t);const H=new Float32Array(n*3);for(let rt=0;rt<n;rt++)H[rt*3+0]=(Math.random()*2-1)*Wx,H[rt*3+1]=Math.random()*2*Ua,H[rt*3+2]=(Math.random()*2-1)*Na;const K=new ve;K.setAttribute("position",new Ne(H,3));const $=yx(),J=new Bu({color:10467032,map:$,size:.06,transparent:!0,opacity:.5,depthWrite:!1,fog:!1}),st=new Sd(K,J);st.frustumCulled=!1,f.add(st);const et=new we;f.add(et);const Ct=cx(et,qx),It={powerFrac:0,brakeFrac:0,reverser:"OFF",speedMph:0,sunflower:"BLACK",dra:!1,dsd:!1,penalty:!1,wiperOn:!0,dt:0};let Kt=null,Z=null,it=!1,nt=!1;function Ut(){it||Kt||nt||(it=!0,Promise.all([Ns(()=>import("./EffectComposer-DiUg2mJ1.js"),__vite__mapDeps([0,1,2]),import.meta.url),Ns(()=>import("./RenderPass-xaaAB_-s.js"),__vite__mapDeps([3,2]),import.meta.url),Ns(()=>import("./UnrealBloomPass-voCI8dTH.js"),__vite__mapDeps([4,2,1]),import.meta.url),Ns(()=>import("./OutputPass-CxOt2ZR8.js"),__vite__mapDeps([5,2]),import.meta.url)]).then(([rt,C,Lt,vt])=>{const qt=new Ft(i.clientWidth,i.clientHeight),ht=new rt.EffectComposer(c);ht.addPass(new C.RenderPass(f,u));const R=new Lt.UnrealBloomPass(qt,.6,.6,.85);ht.addPass(R),ht.addPass(new vt.OutputPass),ht.setSize(i.clientWidth,i.clientHeight),Kt=ht,Z=R}).catch(()=>{nt=!0,it=!1}))}const Tt=new L;let Pt=0,ie=0;function Yt(rt){for(let C=0;C<N.length;C++){const Lt=N[C];if(!Lt)continue;const vt=zi(t,C,rt.served);Lt.red.emissiveIntensity=vt==="RED"?1.4:0,Lt.amberTop.emissiveIntensity=vt==="YELLOW"||vt==="DOUBLE_YELLOW"?1.3:0,Lt.amberBot.emissiveIntensity=vt==="DOUBLE_YELLOW"?1.3:0,Lt.green.emissiveIntensity=vt==="GREEN"?1.3:0;const qt=Lt.glow.material;qt.color.setHex(Ms[vt]),qt.opacity=.55}}function $t(rt,C,Lt,vt){const qt=rt.dt,ht=Xx*qt,R=ht*Yx+Math.abs(rt.speed)*qt*.25,M=K.getAttribute("position"),O=M.array;for(let q=0;q<n;q++){const j=q*3+1,X=q*3+2;let _t=O[j]-ht,at=O[X]-R;_t<0&&(_t+=2*Ua),at<-Na&&(at+=2*Na),O[j]=_t,O[X]=at}M.needsUpdate=!0,st.position.set(C,Lt-Ua,vt)}function ne(rt){const C=rt.env,Lt=rt.chainage,vt=nx(t,Lt,J_,j_),qt=N_(t,Lt).cant,ht=yr(t,Lt),R=ex(qt,ht,o);Pt=Jl(Pt,R.pitch,$l,rt.dt),ie=Jl(ie,R.roll,$l,rt.dt),u.position.set(vt.x,vt.y,vt.z),u.rotation.set(Pt+v,vt.heading+Math.PI+g,ie),et.position.set(vt.x,vt.y,vt.z),et.rotation.set(Pt,vt.heading+Math.PI,ie),c.toneMappingExposure=C.exposure,f.background.setHex(C.skyColor),A.topColor.value.setHex(C.skyColor).multiplyScalar(.35),A.bottomColor.value.setHex(C.skyColor);const M=f.fog;M.color.setHex(C.skyColor),M.near=C.fogNear,M.far=C.fogFar,P.color.setHex(C.hemiSky),P.groundColor.setHex(C.hemiGround),P.intensity=C.ambientIntensity,U.color.setHex(C.sunColor),U.intensity=C.moonIntensity,J.opacity=C.rainIntensity,F.railMaterial.roughness=F.railRoughnessFor(C.railWetness),r&&(Tt.set(C.sunDir.x,C.sunDir.y,C.sunDir.z),z.position.set(vt.x,vt.y,vt.z),I.position.copy(z.position).addScaledVector(Tt,Zl),I.color.setHex(C.sunColorPbr),I.intensity=C.moonIntensity),(C.skyColor!==E||C.groundColor!==D)&&(Ex(_),_=zl(C.skyColor,C.groundColor),f.environment=_,E=C.skyColor,D=C.groundColor),Yt(rt),C.rainIntensity>0&&$t(rt,vt.x,vt.y,vt.z);const O=rt.controls;if(It.powerFrac=O.powerNotch/oi,It.brakeFrac=O.brakeStep/si,It.reverser=O.reverser,It.speedMph=Math.abs(rt.speed)*kx,It.sunflower=rt.aws.sunflower,It.dra=O.dra,It.dsd=rt.safety.dsdWarning,It.penalty=Ps(rt.safety),It.wiperOn=C.wiperOn,It.dt=rt.dt,Ct.update(It),a&&(Kt||Ut(),Kt&&Z)){Z.strength=C.bloomStrength,Kt.render();return}c.render(f,u)}function gt(){const rt=i.clientWidth,C=i.clientHeight;c.setSize(rt,C),u.aspect=rt/C,u.updateProjectionMatrix(),Kt&&Kt.setSize(rt,C)}return{render:ne,resize:gt}}function jx(i,t){const e=[],n=Ji/2+2.2,s=new qi(.22,20),r=nv(),a=new kt({color:7107194,roughness:.7,metalness:.4}),o=new kt({color:329482,roughness:.95}),l=new kt({color:1316636,emissive:new Nt(1316636),emissiveIntensity:.25,roughness:.8}),c=new Fr(.22,.3,20);for(const h of t.signals){const f=new we,u=fe(t,h.chainage,n),m=Vn(t,h.chainage,n);f.position.set(u.x,m,u.z),f.rotation.y=u.heading+Math.PI;const g=new Bt(new Hn(.09,.12,4.2,10),a);g.position.y=2.1,f.add(g);const v=new Bt(new jt(.62,1.55,.1),o);v.position.set(0,4,0),f.add(v);const p=(b,w)=>{const _=new Bt(c,l);_.position.set(0,b,.05),f.add(_);const E=new kt({color:329482,emissive:new Nt(w),emissiveIntensity:0,roughness:.5}),D=new Bt(s,E);return D.position.set(0,b,.07),f.add(D),E},d=p(4.62,Ms.RED),x=p(4.2,Ms.YELLOW),y=p(3.78,Ms.YELLOW),S=p(3.36,Ms.GREEN),A=new md(new Uu({map:r,color:16777215,transparent:!0,opacity:0,blending:za,depthWrite:!1,fog:!1}));A.scale.set(2.4,2.4,1),A.position.set(0,4,.1),f.add(A),i.add(f),e.push({red:d,amberTop:x,amberBot:y,green:S,glow:A})}return e}const nh=45,Jx=.2,No=Ji/2+2.6,Fo=5.9,gs=7;function ih(i){return Math.max(1,Math.floor(i.length/nh))}function dc(i){return(i+1)*nh}function pc(i){return i%2===0?1:-1}function Oo(i,t){const e=dc(t);return hi(i,e)||fi(i,e,pc(t)*No)}function Bo(i,t,e){const n=dc(t),s=pc(t)*Jx,r=fe(i,n,s);return e.set(r.x,Te(i,n)+Fo,r.z),e}function Qx(i,t){const e=t.length,n=new te,s=new Ze,r=new ze(0,0,0,"YXZ"),a=new L(1,1,1),o=new L,l=-1e3,c=ih(t),h=new kt({color:2764599,roughness:.7,metalness:.55}),f=new _e(new jt(.26,gs*.6,.26),h,c),u=new _e(new jt(.16,gs*.45,.16),h,c),m=new _e(new jt(2.4,.1,.1),h,c),g=new kt({color:3817545,roughness:.6,metalness:.6}),v=new _e(new jt(.05,1,.05),g,c),p=new L,d=new L,x=new L,y=new L(0,1,0);for(let F=0;F<c;F++){const N=dc(F),H=pc(F),K=Ke(t,N);r.set(0,K,0),s.setFromEuler(r);const $=Te(t,N);if(Oo(t,F)){n.compose(o.set(0,l,0),s,a),f.setMatrixAt(F,n),u.setMatrixAt(F,n),m.setMatrixAt(F,n),v.setMatrixAt(F,n);continue}const J=fe(t,N,H*No);n.compose(o.set(J.x,$+gs*.3,J.z),s,a),f.setMatrixAt(F,n),n.compose(o.set(J.x,$+gs*.6+gs*.225,J.z),s,a),u.setMatrixAt(F,n);const st=fe(t,N,H*(No-1.2));n.compose(o.set(st.x,$+Fo+.45,st.z),s,a),m.setMatrixAt(F,n),Bo(t,F,p);const et=st.x,Ct=$+Fo+.45,It=st.z;d.set(p.x-et,p.y-Ct,p.z-It);const Kt=Math.max(.05,d.length());x.set((et+p.x)/2,(Ct+p.y)/2,(It+p.z)/2),s.setFromUnitVectors(y,d.normalize()),n.compose(x,s,a.set(1,Kt,1)),v.setMatrixAt(F,n),a.set(1,1,1)}f.instanceMatrix.needsUpdate=!0,u.instanceMatrix.needsUpdate=!0,m.instanceMatrix.needsUpdate=!0,v.instanceMatrix.needsUpdate=!0,i.add(f,u,m,v);const S=6,A=Math.max(1,Math.floor(e/S)),b=Ji/2+4.5,w=new kt({color:921878,roughness:.9}),_=new _e(new jt(.06,1,.06),w,A*2);let E=0;for(let F=0;F<A;F++){const N=(F+1)*S,H=Ke(t,N);r.set(0,H,0),s.setFromEuler(r);for(const K of[-1,1]){const $=K*b;if(hi(t,N)||fi(t,N,$)){n.compose(o.set(0,l,0),s,a),_.setMatrixAt(E++,n);continue}const J=fe(t,N,$);n.compose(o.set(J.x,Cs(t,N,$,.5),J.z),s,a),_.setMatrixAt(E++,n)}}_.instanceMatrix.needsUpdate=!0,i.add(_);const D=500,P=Math.max(1,Math.floor(e/D)),U=Ji/2+2,I=new kt({color:11580602,roughness:.8}),z=new _e(new jt(.1,.6,.1),I,P);for(let F=0;F<P;F++){const N=(F+1)*D,H=Ke(t,N);if(r.set(0,H,0),s.setFromEuler(r),hi(t,N)||fi(t,N,U)){n.compose(o.set(0,l,0),s,a),z.setMatrixAt(F,n);continue}const K=fe(t,N,U);n.compose(o.set(K.x,Cs(t,N,U,.3),K.z),s,a),z.setMatrixAt(F,n)}z.instanceMatrix.needsUpdate=!0,i.add(z)}function tv(i,t){const e=ih(t),n=Math.max(1,e-1),s=new kt({color:2764340,roughness:.5,metalness:.6}),r=new _e(new jt(.035,1,.035),s,n),a=new te,o=new Ze,l=new L(1,1,1),c=new L,h=new L,f=new L,u=new L,m=new L(0,1,0),g=-1e3;for(let v=0;v<n;v++){if(Oo(t,v)||Oo(t,v+1)){a.compose(c.set(0,g,0),o.identity(),l.set(1,1,1)),r.setMatrixAt(v,a);continue}Bo(t,v,c),Bo(t,v+1,h),f.set(h.x-c.x,h.y-c.y,h.z-c.z);const p=Math.max(.05,f.length());u.set((c.x+h.x)/2,(c.y+h.y)/2,(c.z+h.z)/2),o.setFromUnitVectors(m,f.normalize()),a.compose(u,o,l.set(1,p,1)),r.setMatrixAt(v,a)}r.instanceMatrix.needsUpdate=!0,i.add(r)}function ev(i,t,e){const n=e.chainage,s=2*e.platformHalf,r=3,a=.9,o=Ji/2+.7,l=o+r/2,c=Te(t,n),h=new we,f=fe(t,n,0);h.position.set(f.x,c,f.z),h.rotation.y=f.heading;const u=new kt({color:5396575,roughness:.9}),m=new kt({color:2896700,roughness:.85}),g=new kt({color:2765115,roughness:.6,metalness:.4}),v=Vn(t,n,l)-c,p=a-v,d=new Bt(new jt(r,p,s),u);d.position.set(l,(a+v)/2,0),d.receiveShadow=!0,h.add(d);const x=new Bt(new jt(.2,2.6,s),m);x.position.set(l+r/2-.1,a+1.3,0),h.add(x);const y=a+3,S=new Bt(new jt(r,.12,s*.8),g);S.position.set(l,y,0),h.add(S);const A=new jt(.12,y-a,.12);for(const E of[-s*.35,0,s*.35]){const D=new Bt(A,g);D.position.set(l-r/2+.3,a+(y-a)/2,E),h.add(D)}const b=new Bt(new jt(.08,.5,3.2),new kt({color:659488,emissive:new Nt(3238080),emissiveIntensity:2,roughness:.5}));b.position.set(o+.05,a+1.7,0),h.add(b);const w=new qi(.12,16),_=new kt({color:1053720,emissive:new Nt(16769712),emissiveIntensity:2.6,roughness:.5});for(const E of[-s*.3,s*.3]){const D=new Bt(w,_);D.position.set(l,a+3.4,E),D.rotation.x=Math.PI/2,h.add(D);const P=new cc(16769712,3,24);P.position.set(l,a+3.3,E),h.add(P)}i.add(h)}function nv(){const t=document.createElement("canvas");t.width=t.height=64;const e=t.getContext("2d");if(e){const s=e.createRadialGradient(32,32,0,32,32,32);s.addColorStop(0,"rgba(255,255,255,1)"),s.addColorStop(.4,"rgba(255,255,255,0.5)"),s.addColorStop(1,"rgba(255,255,255,0)"),e.fillStyle=s,e.fillRect(0,0,64,64)}const n=new Ur(t);return n.needsUpdate=!0,n}function iv(i){const t=document.createElement("div");t.style.cssText="position:fixed;left:14px;top:12px;font:14px/1.6 ui-monospace,monospace;color:#cfe0f5;text-shadow:0 1px 2px #000;pointer-events:none;display:grid;grid-template-columns:auto auto;gap:1px 12px";function e(b){const w=document.createElement("span");w.textContent=b,w.style.opacity="0.65";const _=document.createElement("span");return t.append(w,_),_}function n(b){const w=document.createElement("span");return w.textContent=b,w.style.cssText="padding:2px 8px;border-radius:3px;border:1px solid #2a3650;color:#5a6a82",w}const s=e("SPEED"),r=e("LIMIT"),a=e("REVERSER"),o=e("POWER"),l=e("BRAKE"),c=e("BRK D/A"),h=e("NEXT"),f=e("CHAINAGE"),u=e("ASPECT"),m=document.createElement("div");m.style.cssText="grid-column:1 / 3;margin-top:6px;display:flex;gap:10px";const g=n("DRA"),v=n("DSD"),p=n("PENALTY"),d=n("AWS");m.append(g,v,p,d),t.append(m);const x={RED:"#e04030",YELLOW:"#e0b020",DOUBLE_YELLOW:"#e0b020",GREEN:"#30c050"};i.appendChild(t);const y=document.createElement("div");y.id="mdtrain2-safety-prompt",y.style.cssText="position:fixed;left:50%;top:34%;transform:translate(-50%,-50%);font:700 30px/1.2 ui-monospace,monospace;letter-spacing:0.04em;padding:14px 26px;border-radius:8px;text-align:center;white-space:nowrap;text-shadow:0 2px 4px #000;pointer-events:none;display:none",i.appendChild(y);function S(b,w,_){w?(b.style.background=_,b.style.color="#0a0e16",b.style.borderColor=_):(b.style.background="transparent",b.style.color="#5a6a82",b.style.borderColor="#2a3650")}function A(b){s.textContent=`${b.speedMph.toFixed(0)} mph`,r.textContent=`${b.limitMph.toFixed(0)} mph`,a.textContent=b.reverser,o.textContent=`${b.powerNotch} of ${b.powerMax}`,l.textContent=b.brakeLabel,c.textContent=`${b.brakeDemandPct.toFixed(0)}% / ${b.brakeActualPct.toFixed(0)}%`,h.textContent=b.nextStop,f.textContent=`${b.chainage.toFixed(0)} m`,u.textContent=b.aspect,u.style.color=x[b.aspect],S(g,b.dra,"#e0b020"),S(v,b.dsdWarning,"#e0b020"),S(p,b.penalty,"#e04030"),S(d,b.sunflower==="CAUTION","#e0b020");const w=Wh(b);w===null?y.style.display="none":(y.textContent=w,y.style.display="block",y.style.background=b.penalty?"rgba(160,16,16,0.92)":"rgba(150,110,0,0.92)",y.style.color=b.penalty?"#ffe6e0":"#fff4d0",y.style.border=b.penalty?"2px solid #ff6048":"2px solid #ffc838")}return{update:A}}const Ql="mdtrain2-help-style",en="mdtrain2-help",sv=[{keys:"W / S",what:"Power up / down"},{keys:"D / A",what:"Brake on / off"},{keys:"F / N / R",what:"Reverser fwd / neutral / rev"},{keys:"Q",what:"Acknowledge AWS / reset penalty (at a stand)"},{keys:"L",what:"DRA (driver's reminder)"},{keys:"`",what:"Emergency brake"},{keys:"E",what:"Change weather / time of day"},{keys:"H",what:"Show / hide this panel"}],rv=`
#${en} {
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
#${en}[hidden] { display: none; }
#${en} h2 {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.7;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
#${en} .x {
  cursor: pointer;
  opacity: 0.6;
  padding: 0 4px;
  font-size: 14px;
}
#${en} .x:hover { opacity: 1; }
#${en} table { border-collapse: collapse; }
#${en} td { padding: 1px 0; vertical-align: top; }
#${en} td.k {
  padding-right: 12px;
  color: #9fd0ff;
  white-space: nowrap;
}
#${en} .hint { margin-top: 7px; opacity: 0.5; font-size: 11px; }
@media (pointer: coarse) { #${en} { display: none; } }
`;function av(){if(document.getElementById(Ql))return;const i=document.createElement("style");i.id=Ql,i.textContent=rv,document.head.appendChild(i)}function ov(i){av();const t=document.createElement("div");t.id=en;const e=document.createElement("h2");e.textContent="Controls";const n=document.createElement("span");n.className="x",n.textContent="×",n.setAttribute("role","button"),n.setAttribute("aria-label","Hide controls (H)"),e.appendChild(n),t.appendChild(e);const s=document.createElement("table");for(const o of sv){const l=document.createElement("tr"),c=document.createElement("td");c.className="k",c.textContent=o.keys;const h=document.createElement("td");h.textContent=o.what,l.append(c,h),s.appendChild(l)}t.appendChild(s);const r=document.createElement("div");r.className="hint",r.textContent="press H to hide",t.appendChild(r),i.appendChild(t);function a(){t.hidden=!t.hidden}return n.addEventListener("click",a),window.addEventListener("keydown",o=>{o.code==="KeyH"&&!o.repeat&&a()}),{toggle:a}}const cv=.06,lv=.35;function uv(i){const t=Math.floor(i.sampleRate),e=i.createBuffer(1,t,i.sampleRate),n=e.getChannelData(0);for(let s=0;s<t;s++)n[s]=Math.random()*2-1;return e}function hv(){const i=typeof window<"u"?window.AudioContext??window.webkitAudioContext:void 0;if(!i)return{start:()=>{},update:()=>{}};let t;try{t=new i}catch{return{start:()=>{},update:()=>{}}}const e=t.createGain();e.gain.value=lv,e.connect(t.destination);const n=t.createGain();n.gain.value=0,n.connect(e);const s=t.createBiquadFilter();s.type="lowpass",s.frequency.value=300,s.Q.value=5,s.connect(n);const r=t.createOscillator();r.type="sawtooth",r.frequency.value=60;const a=t.createOscillator();a.type="triangle",a.frequency.value=60,a.detune.value=6,r.connect(s),a.connect(s);const o=t.createOscillator();o.type="sine",o.frequency.value=60;const l=t.createGain();l.gain.value=.5,o.connect(l).connect(n);const c=uv(t),h=t.createBufferSource();h.buffer=c,h.loop=!0;const f=t.createBiquadFilter();f.type="lowpass",f.frequency.value=420;const u=t.createGain();u.gain.value=0,h.connect(f).connect(u).connect(e);const m=t.createBufferSource();m.buffer=c,m.loop=!0;const g=t.createBiquadFilter();g.type="highpass",g.frequency.value=2200;const v=t.createGain();v.gain.value=0,m.connect(g).connect(v).connect(e);let p=!1;function d(){if(!p){p=!0;try{r.start(),a.start(),o.start(),h.start(),m.start()}catch{}t.resume()}}function x(S,A){const b=Number.isFinite(A)?A:0;S.setTargetAtTime(b,t.currentTime,cv)}function y(S){x(r.frequency,S.whineHz),x(a.frequency,S.whineHz),x(o.frequency,S.whineHz);const A=Math.min(4e3,Math.max(220,S.whineHz*3.5));x(s.frequency,A),x(n.gain,.22*S.tractionGain),x(f.frequency,300+600*S.rollGain),x(u.gain,.6*S.rollGain),x(v.gain,.4*S.brakeHissGain)}return{start:d,update:y}}const fv=44.7,pr=i=>i<0?0:i>1?1:i,Fi=(i,t=0)=>Number.isFinite(i)?i:t;function dv(i,t,e){const s=Math.abs(Fi(i))/fv,r=Fi(50+320*s+120*Math.sqrt(Math.max(s,0)),50),a=pr(Fi(t)),o=pr(Fi(Math.min(s,1))),l=pr(Fi(pr(Fi(e))*(.5+.5*Math.min(s,1))));return{whineHz:r,tractionGain:a,rollGain:o,brakeHissGain:l}}const Dr={powerUp:!1,powerDown:!1,brakeUp:!1,brakeDown:!1,emergency:!1,reverserFwd:!1,reverserOff:!1,reverserRev:!1,toggleDra:!1,acknowledge:!1,cycleEnvironment:!1,anyActivity:!1};function pv(...i){const t={...Dr};for(const e of i)t.powerUp=t.powerUp||e.powerUp,t.powerDown=t.powerDown||e.powerDown,t.brakeUp=t.brakeUp||e.brakeUp,t.brakeDown=t.brakeDown||e.brakeDown,t.emergency=t.emergency||e.emergency,t.reverserFwd=t.reverserFwd||e.reverserFwd,t.reverserOff=t.reverserOff||e.reverserOff,t.reverserRev=t.reverserRev||e.reverserRev,t.toggleDra=t.toggleDra||e.toggleDra,t.acknowledge=t.acknowledge||e.acknowledge,t.cycleEnvironment=t.cycleEnvironment||e.cycleEnvironment,t.anyActivity=t.anyActivity||e.anyActivity;return t}function mv(i){return{powerUp:i.powerUp,powerDown:i.powerDown,brakeUp:i.brakeUp,brakeDown:i.brakeDown,emergency:i.emergency,reverserFwd:i.reverserFwd,reverserOff:i.reverserOff,reverserRev:i.reverserRev,toggleDra:i.toggleDra,acknowledge:i.acknowledge,vigilancePing:i.anyActivity}}function gv(i){const t=e=>i.has(e);return{powerUp:t("KeyW"),powerDown:t("KeyS"),brakeUp:t("KeyD"),brakeDown:t("KeyA"),emergency:t("Backquote"),reverserFwd:t("KeyF"),reverserOff:t("KeyN"),reverserRev:t("KeyR"),toggleDra:t("KeyL"),acknowledge:t("KeyQ"),cycleEnvironment:t("KeyE"),anyActivity:i.size>0}}function _v(i,t){const e=r=>i[r]??!1,n=t<=-.5,s=t>=.5;return{powerUp:e(7),powerDown:e(6),brakeUp:e(5),brakeDown:e(4),emergency:e(1),reverserFwd:e(12),reverserOff:e(15)||s,reverserRev:e(13)||e(14)||n,toggleDra:e(2),acknowledge:e(0),cycleEnvironment:e(3),anyActivity:i.some(r=>r)||Math.abs(t)>.25}}function xv(){const i=new Set;return window.addEventListener("keydown",t=>{t.repeat||i.add(t.code)}),window.addEventListener("keyup",t=>i.delete(t.code)),window.addEventListener("blur",()=>i.clear()),{edges:()=>i,clear:()=>i.clear()}}function vv(){const i=[],t=[];function e(){if(typeof navigator>"u"||typeof navigator.getGamepads!="function")return Dr;const n=navigator.getGamepads()[0];if(!n)return Dr;const s=n.buttons;t.length=s.length;for(let a=0;a<s.length;a++){const o=s[a],l=o?o.pressed:!1,c=i[a]??!1;t[a]=l&&!c,i[a]=l}const r=n.axes[0]??0;return _v(t,r)}return{actions:e}}const tu="mdtrain2-touch-style",Oi="mdtrain2-touch",eu=[{action:"powerUp",label:"Power up",text:"PWR +"},{action:"powerDown",label:"Power down",text:"PWR −"},{action:"brakeUp",label:"Brake up",text:"BRK +"},{action:"brakeDown",label:"Brake down",text:"BRK −"},{action:"reverserFwd",label:"Reverser forward",text:"REV F"},{action:"reverserOff",label:"Reverser neutral",text:"REV N"},{action:"reverserRev",label:"Reverser reverse",text:"REV R"},{action:"toggleDra",label:"Driver's reminder appliance",text:"DRA"},{action:"acknowledge",label:"Acknowledge",text:"ACK"},{action:"emergency",label:"Emergency brake",text:"EMERGENCY"},{action:"cycleEnvironment",label:"Cycle environment",text:"ENV"}],Mv=`
#${Oi} {
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
#${Oi} button {
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
#${Oi} button:active {
  background: rgba(40, 70, 120, 0.92);
}
#${Oi} button[data-action="emergency"] {
  grid-column: span 2;
  color: #ffd2cf;
  border-color: rgba(220, 90, 80, 0.7);
}
@media (pointer: coarse), (max-width: 760px) {
  #${Oi} { display: grid; }
}
`;function Sv(){if(document.getElementById(tu))return;const i=document.createElement("style");i.id=tu,i.textContent=Mv,document.head.appendChild(i)}function Ev(i){Sv();const t={powerUp:!1,powerDown:!1,brakeUp:!1,brakeDown:!1,emergency:!1,reverserFwd:!1,reverserOff:!1,reverserRev:!1,toggleDra:!1,acknowledge:!1,cycleEnvironment:!1},e=document.createElement("div");e.id=Oi;for(const s of eu){const r=document.createElement("button");r.type="button",r.textContent=s.text,r.setAttribute("aria-label",s.label),r.dataset.action=s.action,r.addEventListener("pointerdown",a=>{a.preventDefault(),t[s.action]=!0}),e.appendChild(r)}i.appendChild(e);function n(){let s=!1;const r={...Dr};for(const a of eu)t[a.action]&&(r[a.action]=!0,s=!0,t[a.action]=!1);return r.anyActivity=s,r}return{actions:n}}function yv(i){return i?{rainScale:0,wiperEnabled:!1}:{rainScale:1,wiperEnabled:!0}}const bv=2400,Tv=900;function nu(i,t,e){return Number.isFinite(i)?Math.min(e,Math.max(t,i)):t}function Av(i){const t=i.coarsePointer?nu(i.maxDevicePixelRatio,1,1.5):nu(i.maxDevicePixelRatio,1,2),e=i.coarsePointer?{pixelRatioCap:t,rainCount:Tv,shadowsEnabled:!1,bloomEnabled:!1,ribbonHalfWidth:90,terrainSegLen:20,terrainSubdiv:10,attitudeScale:0}:{pixelRatioCap:t,rainCount:bv,shadowsEnabled:!0,bloomEnabled:!0,ribbonHalfWidth:120,terrainSegLen:8,terrainSubdiv:24,attitudeScale:.35};return i.reducedMotion&&(e.rainCount=0,e.attitudeScale=0),e}const mc=document.getElementById("app");if(!mc)throw new Error("#app not found");const ys=Eh,wv=bh,sh=window.matchMedia("(prefers-reduced-motion: reduce)").matches,Rv=window.matchMedia("(pointer: coarse)").matches,Cv=Av({coarsePointer:Rv,maxDevicePixelRatio:window.devicePixelRatio,reducedMotion:sh}),rh=Zx(mc,ys,Cv),Pv=iv(document.body);ov(document.body);const ah=hv(),iu=xv(),Dv=vv(),Lv=Ev(mc),su=Number(new URLSearchParams(location.search).get("s")??""),Iv=Number.isFinite(su)?Math.max(0,Math.min(ys.length,su)):0;let cn=Th(Iv),Bn=Nh(),ti=Fh(),_s=qh(),Fa=Ba;window.addEventListener("resize",()=>rh.resize());function Lr(){ah.start(),window.removeEventListener("keydown",Lr),window.removeEventListener("pointerdown",Lr)}window.addEventListener("keydown",Lr);window.addEventListener("pointerdown",Lr);let ru=performance.now();function oh(i){requestAnimationFrame(oh);const t=Math.min((i-ru)/1e3,.05);ru=i;const e=pv(gv(iu.edges()),Dv.actions(),Lv.actions()),n=mv(e);e.cycleEnvironment&&(Fa=hf(Fa));const s=yv(sh),r=lf(Fa),a={...r,rainIntensity:r.rainIntensity*s.rainScale,wiperOn:r.wiperOn&&s.wiperEnabled};Bn=Bh(Bn,n,cn,ti);const o=zh(Bn,ti,a.mu),l=cn.chainage;cn=Rh(wv,ys,cn,o,t);const c=Bn.lastDir,h=Kh(_s,cn,ys,n,l,c,t);_s=h.next,ti=Gh(ti,n,cn,t,{reasons:h.reasons});const f={chainage:cn.chainage,speed:cn.speed,dt:t,controls:Bn,safety:ti,aws:_s,served:_s.served,env:a};rh.render(f),Pv.update(kh(cn,Bn,ti,ys,_s.served,h.hud));const u=Vo(Bn,ti);ah.update(dv(cn.speed,Bn.powerNotch/oi,u)),iu.clear()}requestAnimationFrame(oh);export{za as A,ve as B,Nt as C,se as F,Rn as H,pu as L,Ou as M,Tn as N,lc as O,wd as R,sn as S,Uv as T,bd as U,Ft as V,dn as W,L as a,Qt as b,ae as c,mu as d,gu as e,Wo as f,xu as g,vu as h,_u as i,Bt as j};
