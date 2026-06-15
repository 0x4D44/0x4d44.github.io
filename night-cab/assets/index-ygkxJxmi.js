(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))n(r);new MutationObserver(r=>{for(const s of r)if(s.type==="childList")for(const a of s.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&n(a)}).observe(document,{childList:!0,subtree:!0});function t(r){const s={};return r.integrity&&(s.integrity=r.integrity),r.referrerPolicy&&(s.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?s.credentials="include":r.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function n(r){if(r.ep)return;r.ep=!0;const s=t(r);fetch(r.href,s)}})();const Ga=9.80665;function Dc(i){return i.mass*i.inertiaFactor}function Ul(i,e,t){const n=Math.max(Math.abs(e),.001),r=i.powerMax/n,s=Math.min(i.tractiveEffortMax,r),a=t*i.adhesiveFraction*i.mass*Ga;return Math.max(0,Math.min(s,a))}function Nl(i,e){const t=Math.abs(e);return Math.max(0,i.davisA+i.davisB*t+i.davisC*t*t)}function Fl(i,e,t,n=!1){const r=n?i.brakeEmergencyDecel:i.brakeServiceDecel,s=qr(e)*r*Dc(i),a=t*i.mass*Ga;return Math.max(0,Math.min(s,a))}function Ol(i,e){const t=Dc(i),n=e.notch*Ul(i,e.v,e.mu)*e.dir,r=-16e4*Ga*e.grade,s=Fl(i,e.brakeActual,e.mu,e.emergency),a=Nl(i,e.v);if(Math.abs(e.v)>.001){const c=Math.sign(e.v)*(a+s);return(n+r-c)/t}const l=n+r;return Math.abs(l)<=s?0:(l-Math.sign(l)*s)/t}function Bl(i,e,t,n){if(t<=0)return e;const r=1-Math.exp(-n/t);return i+(e-i)*r}function qr(i){return i<0?0:i>1?1:i}function Ti(i,e,t){return i<e?e:i>t?t:i}const zl=180,Gl=50,yn=.44704,Vl={length:6e3,stations:[{name:"Westford",chainage:0,platformHalf:90},{name:"Riverside",chainage:1500,platformHalf:90},{name:"City Centre",chainage:3100,platformHalf:100},{name:"Victoria Street",chainage:4400,platformHalf:90},{name:"Eastbank",chainage:6e3,platformHalf:90}],grades:[{from:0,to:900,value:0},{from:900,to:1500,value:.012},{from:1500,to:2600,value:-.008},{from:2600,to:3100,value:0},{from:3100,to:4400,value:.006},{from:4400,to:6e3,value:-.01}],speedLimits:[{from:0,to:1400,value:50*yn},{from:1400,to:1600,value:25*yn},{from:1600,to:3e3,value:60*yn},{from:3e3,to:3200,value:20*yn},{from:3200,to:4300,value:50*yn},{from:4300,to:4500,value:25*yn},{from:4500,to:5700,value:45*yn},{from:5700,to:6e3,value:15*yn}],signals:[{chainage:1620,protects:"Riverside"},{chainage:3220,protects:"City Centre"},{chainage:4520,protects:"Victoria Street"}]};function Lc(i,e,t){for(const s of i)if(e>=s.from&&e<s.to)return s.value;const n=i[0],r=i[i.length-1];return n&&e<n.from?n.value:r&&e>=r.to?r.value:t}function kl(i,e){return Lc(i.grades,e,0)}function Hl(i,e){return Lc(i.speedLimits,e,i.speedLimits[0]?.value??0)}function Ai(i,e,t){const n=i.signals[e];if(!n)return"GREEN";if(!t.has(n.protects))return"RED";if(!i.signals[e+1])return"GREEN";const s=Ai(i,e+1,t);return s==="RED"?"YELLOW":s==="YELLOW"?"DOUBLE_YELLOW":"GREEN"}function Wl(i,e,t){if(t===-1)return null;for(let n=0;n<i.signals.length;n++){const r=i.signals[n];if(r&&r.chainage>e)return{i:n,sig:r}}return null}function ss(i,e,t){if(t<=e)return[];const n=[];for(let r=0;r<i.length;r++){const s=i[r];s!==void 0&&s>e&&s<=t&&n.push(r)}return n}const Xl={mass:16e4,inertiaFactor:1.08,powerMax:1e6,tractiveEffortMax:12e4,davisA:3e3,davisB:120,davisC:7,adhesiveFraction:.5,brakeServiceDecel:.9,brakeEmergencyDecel:1.3},xo={buildTau:1.5,releaseTau:2};function ql(i=0){return{chainage:i,speed:0,brakeActual:1,time:0}}const Yl=.05,Kl=1/240;function $l(i,e,t,n,r){let{chainage:s,speed:a,brakeActual:o,time:l}=t,c=Math.min(Math.max(r,0),Yl);const h=qr(n.notch),p=qr(n.brake);for(;c>1e-9;){const u=Math.min(Kl,c);c-=u;const m=p>o?xo.buildTau:xo.releaseTau;o=Bl(o,p,m,u);const _=kl(e,s),M=Ol(i,{v:a,notch:h,brakeActual:o,dir:n.dir,grade:_,mu:n.mu,emergency:n.emergency}),d=a;a+=M*u,d!==0&&Math.sign(a)!==Math.sign(d)&&h===0&&(a=0),s+=a*u,s<=0&&a<0?(s=0,a=0):s>=e.length&&a>0&&(s=e.length,a=0),l+=u}return{chainage:s,speed:a,brakeActual:o,time:l}}function Zl(i,e){return Ti(Hl(i,e.chainage),0,1/0)}const jn=4,Va=3,Ic=Va,Kn=Va+1,Uc=.3,Nc=60,jl=7,vo=2.236936;function Jl(i){return Ti(i,0,jn)/jn}function Ql(i){return qr(i/Va)}function eu(i){return i>=Kn}function tu(i){return i>0}function rr(i){return i.penaltyReasons.size>0}function Fc(i){return Math.abs(i.speed)<=Uc}function ka(i,e){return Math.max(Ql(i.brakeStep),rr(e)?1:0)}function nu(){return{powerNotch:0,brakeStep:Ic,reverser:"OFF",lastDir:1,dra:!1}}function iu(){return{vigilanceTimer:Nc,dsdWarning:!1,penaltyReasons:new Set}}function ru(i){const t=(i.reverserFwd?1:0)+(i.reverserOff?1:0)+(i.reverserRev?1:0)===1?i.reverserFwd?"FWD":i.reverserOff?"OFF":"REV":null,n=i.emergency,r=n?!1:i.brakeUp&&!i.brakeDown,s=n?!1:i.brakeDown&&!i.brakeUp,a=i.powerUp&&!i.powerDown,o=i.powerDown&&!i.powerUp;return{powerUp:a,powerDown:o,brakeUp:r,brakeDown:s,emergency:n,reverser:t}}function su(i,e,t,n){const r=ru(e),s=Fc(t);let{powerNotch:a,brakeStep:o,reverser:l,lastDir:c,dra:h}=i;return r.reverser!==null&&a===0&&s&&(l=r.reverser,r.reverser==="FWD"?c=1:r.reverser==="REV"&&(c=-1)),r.powerUp&&(a=Ti(a+1,0,jn)),r.powerDown&&(a=Ti(a-1,0,jn)),rr(n)&&(a=0),r.emergency?o=Kn:r.brakeUp?o=Ti(o+1,0,Kn):r.brakeDown&&(o===Kn&&!s||(o=Ti(o-1,0,Kn))),e.toggleDra&&s&&(h=!h),{powerNotch:a,brakeStep:o,reverser:l,lastDir:c,dra:h}}function au(i,e,t){const n=i.lastDir,r=rr(e),a=tu(i.brakeStep)||i.reverser==="OFF"||i.dra||r?0:Jl(i.powerNotch),o=eu(i.brakeStep),l=ka(i,e);return{notch:a,brake:l,dir:n,emergency:o,mu:t}}function ou(i,e,t,n,r){let s=i.vigilanceTimer,a=i.dsdWarning;const o=new Set;i.penaltyReasons.has("DSD")&&o.add("DSD");const l=Fc(t);e.vigilancePing?(s=Nc,a=!1):l||(s-=n,a=s<=jl,s<=0&&o.add("DSD"));for(const c of r.reasons)o.add(c);return e.acknowledge&&l&&o.delete("DSD"),{vigilanceTimer:s,dsdWarning:a,penaltyReasons:o}}const cu=0;function lu(i){return i<=cu?"RELEASE":i>=Kn?"EMERGENCY":i>=Ic?"FULL SERVICE":`STEP ${i}`}function uu(i,e,t,n,r,s){const a=rr(t);let o="— (end of line)",l=1/0;for(const p of n.stations){const u=(p.chainage-i.chainage)*e.lastDir;u>0&&u<l&&(l=u,o=p.name)}const c=Wl(n,i.chainage,e.lastDir),h=c?Ai(n,c.i,r):"GREEN";return{speedMph:Math.abs(i.speed)*vo,limitMph:Zl(n,i)*vo,reverser:e.reverser,powerNotch:e.powerNotch,powerMax:jn,brakeLabel:lu(e.brakeStep),brakeDemandPct:ka(e,t)*100,brakeActualPct:i.brakeActual*100,dra:e.dra,dsdWarning:t.dsdWarning,penalty:a,nextStop:o,chainage:i.chainage,aspect:h,sunflower:s.sunflower}}const Mo=2,hu=3,fu=13.4;function du(){return{phase:"CLEAR",warnTimer:0,sunflower:"BLACK",brakeReason:null,served:new Set,spad:!1}}function pu(i,e,t,n,r,s,a){let{phase:o,warnTimer:l,sunflower:c,brakeReason:h,served:p,spad:u}=i;const m=Math.abs(e.speed)<=Uc,_=e.chainage+s*Mo,M=r+s*Mo,d=_>M;if(m){for(const R of t.stations)if(!p.has(R.name)&&Math.abs(_-R.chainage)<=R.platformHalf){const x=new Set(p);x.add(R.name),p=x,c="BLACK",o==="WARNING"&&(o="CLEAR",l=0)}}const f=t.signals.map(R=>R.chainage),S=t.signals.map(R=>R.chainage-zl),T=t.signals.map(R=>R.chainage-Gl);if(d)for(const R of ss(S,M,_))Ai(t,R,p)==="GREEN"?(c="BLACK",o==="WARNING"&&(o="CLEAR")):h===null&&(o="WARNING",l=hu,c="CAUTION");if(o==="WARNING"&&h===null&&(n.acknowledge?o="CLEAR":(l-=a,l<=0&&(h="AWS",o="CLEAR"))),d){for(const R of ss(f,M,_))Ai(t,R,p)==="RED"&&(h="TPWS",u=!0);if(Math.abs(e.speed)>fu)for(const R of ss(T,M,_))Ai(t,R,p)==="RED"&&(h="TPWS")}return h!==null&&n.acknowledge&&m&&(h=null),{next:{phase:o,warnTimer:l,sunflower:c,brakeReason:h,served:p,spad:u},reasons:h?[h]:[],hud:{sunflower:c,spad:u}}}const Ws={time:"day",weather:"rain"},cr=[{time:"day",weather:"rain"},{time:"dusk",weather:"rain"},{time:"night",weather:"rain"},{time:"day",weather:"clear"}],mu=.15,gu={clear:.3,rain:.25,storm:.2},_u={day:1,dusk:.9,night:.8},xu={clear:0,rain:.6,storm:1},vu={clear:.1,rain:.8,storm:1},Mu={night:.5,dusk:.7,day:1},Su=(i,e,t)=>i<e?e:i>t?t:i;function Eu(i){const e=Su(gu[i.weather]*_u[i.time],mu,1),t=xu[i.weather],n=vu[i.weather],r=i.weather!=="clear",s=Mu[i.time],a=t,o=1-.25*a,l=.85*s*o,c=1.2*s*o,h=yu(i.time,a),p=12+8*s,u=60+140*s-40*a;return{mu:e,skyColor:h,fogNear:p,fogFar:u,ambientIntensity:l,moonIntensity:c,rainIntensity:t,railWetness:n,wiperOn:r}}function yu(i,e){const n={night:{r:10,g:18,b:40},dusk:{r:58,g:48,b:64},day:{r:154,g:168,b:192}}[i],r=32,s=.4*e,a=Math.round(n.r*(1-s)+r*s),o=Math.round(n.g*(1-s)+r*s),l=Math.round(n.b*(1-s)+r*s);return a<<16|o<<8|l}function bu(i){const e=cr.findIndex(n=>n.time===i.time&&n.weather===i.weather);return e<0?cr[0]??Ws:cr[(e+1)%cr.length]??Ws}const Ha="183",Tu=0,So=1,Au=2,zr=1,wu=2,Ji=3,Un=0,Dt=1,mn=2,_n=0,wi=1,Xs=2,Eo=3,yo=4,Ru=5,qn=100,Cu=101,Pu=102,Du=103,Lu=104,Iu=200,Uu=201,Nu=202,Fu=203,qs=204,Ys=205,Ou=206,Bu=207,zu=208,Gu=209,Vu=210,ku=211,Hu=212,Wu=213,Xu=214,Ks=0,$s=1,Zs=2,Pi=3,js=4,Js=5,Qs=6,ea=7,Oc=0,qu=1,Yu=2,nn=0,Bc=1,zc=2,Gc=3,Vc=4,kc=5,Hc=6,Wc=7,Xc=300,Jn=301,Di=302,as=303,os=304,es=306,ta=1e3,gn=1001,na=1002,Et=1003,Ku=1004,lr=1005,wt=1006,cs=1007,$n=1008,Ot=1009,qc=1010,Yc=1011,er=1012,Wa=1013,sn=1014,Yt=1015,vn=1016,Xa=1017,qa=1018,tr=1020,Kc=35902,$c=35899,Zc=1021,jc=1022,Kt=1023,Mn=1026,Zn=1027,Ya=1028,Ka=1029,Li=1030,$a=1031,Za=1033,Gr=33776,Vr=33777,kr=33778,Hr=33779,ia=35840,ra=35841,sa=35842,aa=35843,oa=36196,ca=37492,la=37496,ua=37488,ha=37489,fa=37490,da=37491,pa=37808,ma=37809,ga=37810,_a=37811,xa=37812,va=37813,Ma=37814,Sa=37815,Ea=37816,ya=37817,ba=37818,Ta=37819,Aa=37820,wa=37821,Ra=36492,Ca=36494,Pa=36495,Da=36283,La=36284,Ia=36285,Ua=36286,$u=3200,Jc=0,Zu=1,Dn="",Gt="srgb",Ii="srgb-linear",Yr="linear",je="srgb",ri=7680,bo=519,ju=512,Ju=513,Qu=514,ja=515,eh=516,th=517,Ja=518,nh=519,Na=35044,To="300 es",tn=2e3,nr=2001;function ih(i){for(let e=i.length-1;e>=0;--e)if(i[e]>=65535)return!0;return!1}function Kr(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function rh(){const i=Kr("canvas");return i.style.display="block",i}const Ao={};function $r(...i){const e="THREE."+i.shift();console.log(e,...i)}function Qc(i){const e=i[0];if(typeof e=="string"&&e.startsWith("TSL:")){const t=i[1];t&&t.isStackTrace?i[0]+=" "+t.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function De(...i){i=Qc(i);const e="THREE."+i.shift();{const t=i[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...i)}}function Xe(...i){i=Qc(i);const e="THREE."+i.shift();{const t=i[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...i)}}function Zr(...i){const e=i.join(" ");e in Ao||(Ao[e]=!0,De(...i))}function sh(i,e,t){return new Promise(function(n,r){function s(){switch(i.clientWaitSync(e,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:r();break;case i.TIMEOUT_EXPIRED:setTimeout(s,t);break;default:n()}}setTimeout(s,t)})}const ah={[Ks]:$s,[Zs]:Qs,[js]:ea,[Pi]:Js,[$s]:Ks,[Qs]:Zs,[ea]:js,[Js]:Pi};class Fi{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){const n=this._listeners;return n===void 0?!1:n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){const n=this._listeners;if(n===void 0)return;const r=n[e];if(r!==void 0){const s=r.indexOf(t);s!==-1&&r.splice(s,1)}}dispatchEvent(e){const t=this._listeners;if(t===void 0)return;const n=t[e.type];if(n!==void 0){e.target=this;const r=n.slice(0);for(let s=0,a=r.length;s<a;s++)r[s].call(this,e);e.target=null}}}const Tt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],ls=Math.PI/180,Fa=180/Math.PI;function In(){const i=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(Tt[i&255]+Tt[i>>8&255]+Tt[i>>16&255]+Tt[i>>24&255]+"-"+Tt[e&255]+Tt[e>>8&255]+"-"+Tt[e>>16&15|64]+Tt[e>>24&255]+"-"+Tt[t&63|128]+Tt[t>>8&255]+"-"+Tt[t>>16&255]+Tt[t>>24&255]+Tt[n&255]+Tt[n>>8&255]+Tt[n>>16&255]+Tt[n>>24&255]).toLowerCase()}function ke(i,e,t){return Math.max(e,Math.min(t,i))}function oh(i,e){return(i%e+e)%e}function us(i,e,t){return(1-t)*i+t*e}function en(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("Invalid component type.")}}function tt(i,e){switch(e.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("Invalid component type.")}}class Fe{constructor(e=0,t=0){Fe.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,n=this.y,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6],this.y=r[1]*t+r[4]*n+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=ke(this.x,e.x,t.x),this.y=ke(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=ke(this.x,e,t),this.y=ke(this.y,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(ke(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(ke(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const n=Math.cos(t),r=Math.sin(t),s=this.x-e.x,a=this.y-e.y;return this.x=s*n-a*r+e.x,this.y=s*r+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class Qn{constructor(e=0,t=0,n=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=r}static slerpFlat(e,t,n,r,s,a,o){let l=n[r+0],c=n[r+1],h=n[r+2],p=n[r+3],u=s[a+0],m=s[a+1],_=s[a+2],M=s[a+3];if(p!==M||l!==u||c!==m||h!==_){let d=l*u+c*m+h*_+p*M;d<0&&(u=-u,m=-m,_=-_,M=-M,d=-d);let f=1-o;if(d<.9995){const S=Math.acos(d),T=Math.sin(S);f=Math.sin(f*S)/T,o=Math.sin(o*S)/T,l=l*f+u*o,c=c*f+m*o,h=h*f+_*o,p=p*f+M*o}else{l=l*f+u*o,c=c*f+m*o,h=h*f+_*o,p=p*f+M*o;const S=1/Math.sqrt(l*l+c*c+h*h+p*p);l*=S,c*=S,h*=S,p*=S}}e[t]=l,e[t+1]=c,e[t+2]=h,e[t+3]=p}static multiplyQuaternionsFlat(e,t,n,r,s,a){const o=n[r],l=n[r+1],c=n[r+2],h=n[r+3],p=s[a],u=s[a+1],m=s[a+2],_=s[a+3];return e[t]=o*_+h*p+l*m-c*u,e[t+1]=l*_+h*u+c*p-o*m,e[t+2]=c*_+h*m+o*u-l*p,e[t+3]=h*_-o*p-l*u-c*m,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,r){return this._x=e,this._y=t,this._z=n,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const n=e._x,r=e._y,s=e._z,a=e._order,o=Math.cos,l=Math.sin,c=o(n/2),h=o(r/2),p=o(s/2),u=l(n/2),m=l(r/2),_=l(s/2);switch(a){case"XYZ":this._x=u*h*p+c*m*_,this._y=c*m*p-u*h*_,this._z=c*h*_+u*m*p,this._w=c*h*p-u*m*_;break;case"YXZ":this._x=u*h*p+c*m*_,this._y=c*m*p-u*h*_,this._z=c*h*_-u*m*p,this._w=c*h*p+u*m*_;break;case"ZXY":this._x=u*h*p-c*m*_,this._y=c*m*p+u*h*_,this._z=c*h*_+u*m*p,this._w=c*h*p-u*m*_;break;case"ZYX":this._x=u*h*p-c*m*_,this._y=c*m*p+u*h*_,this._z=c*h*_-u*m*p,this._w=c*h*p+u*m*_;break;case"YZX":this._x=u*h*p+c*m*_,this._y=c*m*p+u*h*_,this._z=c*h*_-u*m*p,this._w=c*h*p-u*m*_;break;case"XZY":this._x=u*h*p-c*m*_,this._y=c*m*p-u*h*_,this._z=c*h*_+u*m*p,this._w=c*h*p+u*m*_;break;default:De("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const n=t/2,r=Math.sin(n);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,n=t[0],r=t[4],s=t[8],a=t[1],o=t[5],l=t[9],c=t[2],h=t[6],p=t[10],u=n+o+p;if(u>0){const m=.5/Math.sqrt(u+1);this._w=.25/m,this._x=(h-l)*m,this._y=(s-c)*m,this._z=(a-r)*m}else if(n>o&&n>p){const m=2*Math.sqrt(1+n-o-p);this._w=(h-l)/m,this._x=.25*m,this._y=(r+a)/m,this._z=(s+c)/m}else if(o>p){const m=2*Math.sqrt(1+o-n-p);this._w=(s-c)/m,this._x=(r+a)/m,this._y=.25*m,this._z=(l+h)/m}else{const m=2*Math.sqrt(1+p-n-o);this._w=(a-r)/m,this._x=(s+c)/m,this._y=(l+h)/m,this._z=.25*m}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(ke(this.dot(e),-1,1)))}rotateTowards(e,t){const n=this.angleTo(e);if(n===0)return this;const r=Math.min(1,t/n);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const n=e._x,r=e._y,s=e._z,a=e._w,o=t._x,l=t._y,c=t._z,h=t._w;return this._x=n*h+a*o+r*c-s*l,this._y=r*h+a*l+s*o-n*c,this._z=s*h+a*c+n*l-r*o,this._w=a*h-n*o-r*l-s*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,r=e._y,s=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,r=-r,s=-s,a=-a,o=-o);let l=1-t;if(o<.9995){const c=Math.acos(o),h=Math.sin(c);l=Math.sin(l*c)/h,t=Math.sin(t*c)/h,this._x=this._x*l+n*t,this._y=this._y*l+r*t,this._z=this._z*l+s*t,this._w=this._w*l+a*t,this._onChangeCallback()}else this._x=this._x*l+n*t,this._y=this._y*l+r*t,this._z=this._z*l+s*t,this._w=this._w*l+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),r=Math.sqrt(1-n),s=Math.sqrt(n);return this.set(r*Math.sin(e),r*Math.cos(e),s*Math.sin(t),s*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class B{constructor(e=0,t=0,n=0){B.prototype.isVector3=!0,this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(wo.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(wo.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,n=this.y,r=this.z,s=e.elements;return this.x=s[0]*t+s[3]*n+s[6]*r,this.y=s[1]*t+s[4]*n+s[7]*r,this.z=s[2]*t+s[5]*n+s[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,n=this.y,r=this.z,s=e.elements,a=1/(s[3]*t+s[7]*n+s[11]*r+s[15]);return this.x=(s[0]*t+s[4]*n+s[8]*r+s[12])*a,this.y=(s[1]*t+s[5]*n+s[9]*r+s[13])*a,this.z=(s[2]*t+s[6]*n+s[10]*r+s[14])*a,this}applyQuaternion(e){const t=this.x,n=this.y,r=this.z,s=e.x,a=e.y,o=e.z,l=e.w,c=2*(a*r-o*n),h=2*(o*t-s*r),p=2*(s*n-a*t);return this.x=t+l*c+a*p-o*h,this.y=n+l*h+o*c-s*p,this.z=r+l*p+s*h-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,n=this.y,r=this.z,s=e.elements;return this.x=s[0]*t+s[4]*n+s[8]*r,this.y=s[1]*t+s[5]*n+s[9]*r,this.z=s[2]*t+s[6]*n+s[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=ke(this.x,e.x,t.x),this.y=ke(this.y,e.y,t.y),this.z=ke(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=ke(this.x,e,t),this.y=ke(this.y,e,t),this.z=ke(this.z,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(ke(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const n=e.x,r=e.y,s=e.z,a=t.x,o=t.y,l=t.z;return this.x=r*l-s*o,this.y=s*a-n*l,this.z=n*o-r*a,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return hs.copy(this).projectOnVector(e),this.sub(hs)}reflect(e){return this.sub(hs.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const n=this.dot(e)/t;return Math.acos(ke(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,n=this.y-e.y,r=this.z-e.z;return t*t+n*n+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){const r=Math.sin(t)*e;return this.x=r*Math.sin(n),this.y=Math.cos(t)*e,this.z=r*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const hs=new B,wo=new Qn;class Ue{constructor(e,t,n,r,s,a,o,l,c){Ue.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,r,s,a,o,l,c)}set(e,t,n,r,s,a,o,l,c){const h=this.elements;return h[0]=e,h[1]=r,h[2]=o,h[3]=t,h[4]=s,h[5]=l,h[6]=n,h[7]=a,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,r=t.elements,s=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],h=n[4],p=n[7],u=n[2],m=n[5],_=n[8],M=r[0],d=r[3],f=r[6],S=r[1],T=r[4],y=r[7],A=r[2],w=r[5],R=r[8];return s[0]=a*M+o*S+l*A,s[3]=a*d+o*T+l*w,s[6]=a*f+o*y+l*R,s[1]=c*M+h*S+p*A,s[4]=c*d+h*T+p*w,s[7]=c*f+h*y+p*R,s[2]=u*M+m*S+_*A,s[5]=u*d+m*T+_*w,s[8]=u*f+m*y+_*R,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[1],r=e[2],s=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8];return t*a*h-t*o*c-n*s*h+n*o*l+r*s*c-r*a*l}invert(){const e=this.elements,t=e[0],n=e[1],r=e[2],s=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],p=h*a-o*c,u=o*l-h*s,m=c*s-a*l,_=t*p+n*u+r*m;if(_===0)return this.set(0,0,0,0,0,0,0,0,0);const M=1/_;return e[0]=p*M,e[1]=(r*c-h*n)*M,e[2]=(o*n-r*a)*M,e[3]=u*M,e[4]=(h*t-r*l)*M,e[5]=(r*s-o*t)*M,e[6]=m*M,e[7]=(n*l-c*t)*M,e[8]=(a*t-n*s)*M,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,r,s,a,o){const l=Math.cos(s),c=Math.sin(s);return this.set(n*l,n*c,-n*(l*a+c*o)+a+e,-r*c,r*l,-r*(-c*a+l*o)+o+t,0,0,1),this}scale(e,t){return this.premultiply(fs.makeScale(e,t)),this}rotate(e){return this.premultiply(fs.makeRotation(-e)),this}translate(e,t){return this.premultiply(fs.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,n=e.elements;for(let r=0;r<9;r++)if(t[r]!==n[r])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}}const fs=new Ue,Ro=new Ue().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Co=new Ue().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function ch(){const i={enabled:!0,workingColorSpace:Ii,spaces:{},convert:function(r,s,a){return this.enabled===!1||s===a||!s||!a||(this.spaces[s].transfer===je&&(r.r=xn(r.r),r.g=xn(r.g),r.b=xn(r.b)),this.spaces[s].primaries!==this.spaces[a].primaries&&(r.applyMatrix3(this.spaces[s].toXYZ),r.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===je&&(r.r=Ri(r.r),r.g=Ri(r.g),r.b=Ri(r.b))),r},workingToColorSpace:function(r,s){return this.convert(r,this.workingColorSpace,s)},colorSpaceToWorking:function(r,s){return this.convert(r,s,this.workingColorSpace)},getPrimaries:function(r){return this.spaces[r].primaries},getTransfer:function(r){return r===Dn?Yr:this.spaces[r].transfer},getToneMappingMode:function(r){return this.spaces[r].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(r,s=this.workingColorSpace){return r.fromArray(this.spaces[s].luminanceCoefficients)},define:function(r){Object.assign(this.spaces,r)},_getMatrix:function(r,s,a){return r.copy(this.spaces[s].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(r){return this.spaces[r].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(r=this.workingColorSpace){return this.spaces[r].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(r,s){return Zr("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(r,s)},toWorkingColorSpace:function(r,s){return Zr("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(r,s)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[Ii]:{primaries:e,whitePoint:n,transfer:Yr,toXYZ:Ro,fromXYZ:Co,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:Gt},outputColorSpaceConfig:{drawingBufferColorSpace:Gt}},[Gt]:{primaries:e,whitePoint:n,transfer:je,toXYZ:Ro,fromXYZ:Co,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:Gt}}}),i}const qe=ch();function xn(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function Ri(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}let si;class lh{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{si===void 0&&(si=Kr("canvas")),si.width=e.width,si.height=e.height;const r=si.getContext("2d");e instanceof ImageData?r.putImageData(e,0,0):r.drawImage(e,0,0,e.width,e.height),n=si}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=Kr("canvas");t.width=e.width,t.height=e.height;const n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);const r=n.getImageData(0,0,e.width,e.height),s=r.data;for(let a=0;a<s.length;a++)s[a]=xn(s[a]/255)*255;return n.putImageData(r,0,0),t}else if(e.data){const t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(xn(t[n]/255)*255):t[n]=xn(t[n]);return{data:t,width:e.width,height:e.height}}else return De("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}let uh=0;class Qa{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:uh++}),this.uuid=In(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){const t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayHeight,t.displayWidth,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const n={uuid:this.uuid,url:""},r=this.data;if(r!==null){let s;if(Array.isArray(r)){s=[];for(let a=0,o=r.length;a<o;a++)r[a].isDataTexture?s.push(ds(r[a].image)):s.push(ds(r[a]))}else s=ds(r);n.url=s}return t||(e.images[this.uuid]=n),n}}function ds(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?lh.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(De("Texture: Unable to serialize Texture."),{})}let hh=0;const ps=new B;class Rt extends Fi{constructor(e=Rt.DEFAULT_IMAGE,t=Rt.DEFAULT_MAPPING,n=gn,r=gn,s=wt,a=$n,o=Kt,l=Ot,c=Rt.DEFAULT_ANISOTROPY,h=Dn){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:hh++}),this.uuid=In(),this.name="",this.source=new Qa(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=r,this.magFilter=s,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new Fe(0,0),this.repeat=new Fe(1,1),this.center=new Fe(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ue,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(ps).x}get height(){return this.source.getSize(ps).y}get depth(){return this.source.getSize(ps).z}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(const t in e){const n=e[t];if(n===void 0){De(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}const r=this[t];if(r===void 0){De(`Texture.setValues(): property '${t}' does not exist.`);continue}r&&n&&r.isVector2&&n.isVector2||r&&n&&r.isVector3&&n.isVector3||r&&n&&r.isMatrix3&&n.isMatrix3?r.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Xc)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case ta:e.x=e.x-Math.floor(e.x);break;case gn:e.x=e.x<0?0:1;break;case na:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case ta:e.y=e.y-Math.floor(e.y);break;case gn:e.y=e.y<0?0:1;break;case na:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}Rt.DEFAULT_IMAGE=null;Rt.DEFAULT_MAPPING=Xc;Rt.DEFAULT_ANISOTROPY=1;class ut{constructor(e=0,t=0,n=0,r=1){ut.prototype.isVector4=!0,this.x=e,this.y=t,this.z=n,this.w=r}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,r){return this.x=e,this.y=t,this.z=n,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,n=this.y,r=this.z,s=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*r+a[12]*s,this.y=a[1]*t+a[5]*n+a[9]*r+a[13]*s,this.z=a[2]*t+a[6]*n+a[10]*r+a[14]*s,this.w=a[3]*t+a[7]*n+a[11]*r+a[15]*s,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,r,s;const l=e.elements,c=l[0],h=l[4],p=l[8],u=l[1],m=l[5],_=l[9],M=l[2],d=l[6],f=l[10];if(Math.abs(h-u)<.01&&Math.abs(p-M)<.01&&Math.abs(_-d)<.01){if(Math.abs(h+u)<.1&&Math.abs(p+M)<.1&&Math.abs(_+d)<.1&&Math.abs(c+m+f-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const T=(c+1)/2,y=(m+1)/2,A=(f+1)/2,w=(h+u)/4,R=(p+M)/4,x=(_+d)/4;return T>y&&T>A?T<.01?(n=0,r=.707106781,s=.707106781):(n=Math.sqrt(T),r=w/n,s=R/n):y>A?y<.01?(n=.707106781,r=0,s=.707106781):(r=Math.sqrt(y),n=w/r,s=x/r):A<.01?(n=.707106781,r=.707106781,s=0):(s=Math.sqrt(A),n=R/s,r=x/s),this.set(n,r,s,t),this}let S=Math.sqrt((d-_)*(d-_)+(p-M)*(p-M)+(u-h)*(u-h));return Math.abs(S)<.001&&(S=1),this.x=(d-_)/S,this.y=(p-M)/S,this.z=(u-h)/S,this.w=Math.acos((c+m+f-1)/2),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=ke(this.x,e.x,t.x),this.y=ke(this.y,e.y,t.y),this.z=ke(this.z,e.z,t.z),this.w=ke(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=ke(this.x,e,t),this.y=ke(this.y,e,t),this.z=ke(this.z,e,t),this.w=ke(this.w,e,t),this}clampLength(e,t){const n=this.length();return this.divideScalar(n||1).multiplyScalar(ke(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class fh extends Fi{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:wt,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new ut(0,0,e,t),this.scissorTest=!1,this.viewport=new ut(0,0,e,t),this.textures=[];const r={width:e,height:t,depth:n.depth},s=new Rt(r),a=n.count;for(let o=0;o<a;o++)this.textures[o]=s.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview}_setTextureOptions(e={}){const t={minFilter:wt,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let r=0,s=this.textures.length;r<s;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=n,this.textures[r].isData3DTexture!==!0&&(this.textures[r].isArrayTexture=this.textures[r].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;const r=Object.assign({},e.textures[t].image);this.textures[t].source=new Qa(r)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}}class rn extends fh{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}}class el extends Rt{constructor(e=null,t=1,n=1,r=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:r},this.magFilter=Et,this.minFilter=Et,this.wrapR=gn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class dh extends Rt{constructor(e=null,t=1,n=1,r=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:r},this.magFilter=Et,this.minFilter=Et,this.wrapR=gn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class Je{constructor(e,t,n,r,s,a,o,l,c,h,p,u,m,_,M,d){Je.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,r,s,a,o,l,c,h,p,u,m,_,M,d)}set(e,t,n,r,s,a,o,l,c,h,p,u,m,_,M,d){const f=this.elements;return f[0]=e,f[4]=t,f[8]=n,f[12]=r,f[1]=s,f[5]=a,f[9]=o,f[13]=l,f[2]=c,f[6]=h,f[10]=p,f[14]=u,f[3]=m,f[7]=_,f[11]=M,f[15]=d,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Je().fromArray(this.elements)}copy(e){const t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){const t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinant()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinant()===0)return this.identity();const t=this.elements,n=e.elements,r=1/ai.setFromMatrixColumn(e,0).length(),s=1/ai.setFromMatrixColumn(e,1).length(),a=1/ai.setFromMatrixColumn(e,2).length();return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=0,t[4]=n[4]*s,t[5]=n[5]*s,t[6]=n[6]*s,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,n=e.x,r=e.y,s=e.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(r),c=Math.sin(r),h=Math.cos(s),p=Math.sin(s);if(e.order==="XYZ"){const u=a*h,m=a*p,_=o*h,M=o*p;t[0]=l*h,t[4]=-l*p,t[8]=c,t[1]=m+_*c,t[5]=u-M*c,t[9]=-o*l,t[2]=M-u*c,t[6]=_+m*c,t[10]=a*l}else if(e.order==="YXZ"){const u=l*h,m=l*p,_=c*h,M=c*p;t[0]=u+M*o,t[4]=_*o-m,t[8]=a*c,t[1]=a*p,t[5]=a*h,t[9]=-o,t[2]=m*o-_,t[6]=M+u*o,t[10]=a*l}else if(e.order==="ZXY"){const u=l*h,m=l*p,_=c*h,M=c*p;t[0]=u-M*o,t[4]=-a*p,t[8]=_+m*o,t[1]=m+_*o,t[5]=a*h,t[9]=M-u*o,t[2]=-a*c,t[6]=o,t[10]=a*l}else if(e.order==="ZYX"){const u=a*h,m=a*p,_=o*h,M=o*p;t[0]=l*h,t[4]=_*c-m,t[8]=u*c+M,t[1]=l*p,t[5]=M*c+u,t[9]=m*c-_,t[2]=-c,t[6]=o*l,t[10]=a*l}else if(e.order==="YZX"){const u=a*l,m=a*c,_=o*l,M=o*c;t[0]=l*h,t[4]=M-u*p,t[8]=_*p+m,t[1]=p,t[5]=a*h,t[9]=-o*h,t[2]=-c*h,t[6]=m*p+_,t[10]=u-M*p}else if(e.order==="XZY"){const u=a*l,m=a*c,_=o*l,M=o*c;t[0]=l*h,t[4]=-p,t[8]=c*h,t[1]=u*p+M,t[5]=a*h,t[9]=m*p-_,t[2]=_*p-m,t[6]=o*h,t[10]=M*p+u}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(ph,e,mh)}lookAt(e,t,n){const r=this.elements;return It.subVectors(e,t),It.lengthSq()===0&&(It.z=1),It.normalize(),bn.crossVectors(n,It),bn.lengthSq()===0&&(Math.abs(n.z)===1?It.x+=1e-4:It.z+=1e-4,It.normalize(),bn.crossVectors(n,It)),bn.normalize(),ur.crossVectors(It,bn),r[0]=bn.x,r[4]=ur.x,r[8]=It.x,r[1]=bn.y,r[5]=ur.y,r[9]=It.y,r[2]=bn.z,r[6]=ur.z,r[10]=It.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const n=e.elements,r=t.elements,s=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],h=n[1],p=n[5],u=n[9],m=n[13],_=n[2],M=n[6],d=n[10],f=n[14],S=n[3],T=n[7],y=n[11],A=n[15],w=r[0],R=r[4],x=r[8],E=r[12],H=r[1],C=r[5],O=r[9],z=r[13],k=r[2],D=r[6],I=r[10],N=r[14],$=r[3],j=r[7],Q=r[11],ae=r[15];return s[0]=a*w+o*H+l*k+c*$,s[4]=a*R+o*C+l*D+c*j,s[8]=a*x+o*O+l*I+c*Q,s[12]=a*E+o*z+l*N+c*ae,s[1]=h*w+p*H+u*k+m*$,s[5]=h*R+p*C+u*D+m*j,s[9]=h*x+p*O+u*I+m*Q,s[13]=h*E+p*z+u*N+m*ae,s[2]=_*w+M*H+d*k+f*$,s[6]=_*R+M*C+d*D+f*j,s[10]=_*x+M*O+d*I+f*Q,s[14]=_*E+M*z+d*N+f*ae,s[3]=S*w+T*H+y*k+A*$,s[7]=S*R+T*C+y*D+A*j,s[11]=S*x+T*O+y*I+A*Q,s[15]=S*E+T*z+y*N+A*ae,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],n=e[4],r=e[8],s=e[12],a=e[1],o=e[5],l=e[9],c=e[13],h=e[2],p=e[6],u=e[10],m=e[14],_=e[3],M=e[7],d=e[11],f=e[15],S=l*m-c*u,T=o*m-c*p,y=o*u-l*p,A=a*m-c*h,w=a*u-l*h,R=a*p-o*h;return t*(M*S-d*T+f*y)-n*(_*S-d*A+f*w)+r*(_*T-M*A+f*R)-s*(_*y-M*w+d*R)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){const r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=n),this}invert(){const e=this.elements,t=e[0],n=e[1],r=e[2],s=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],p=e[9],u=e[10],m=e[11],_=e[12],M=e[13],d=e[14],f=e[15],S=t*o-n*a,T=t*l-r*a,y=t*c-s*a,A=n*l-r*o,w=n*c-s*o,R=r*c-s*l,x=h*M-p*_,E=h*d-u*_,H=h*f-m*_,C=p*d-u*M,O=p*f-m*M,z=u*f-m*d,k=S*z-T*O+y*C+A*H-w*E+R*x;if(k===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const D=1/k;return e[0]=(o*z-l*O+c*C)*D,e[1]=(r*O-n*z-s*C)*D,e[2]=(M*R-d*w+f*A)*D,e[3]=(u*w-p*R-m*A)*D,e[4]=(l*H-a*z-c*E)*D,e[5]=(t*z-r*H+s*E)*D,e[6]=(d*y-_*R-f*T)*D,e[7]=(h*R-u*y+m*T)*D,e[8]=(a*O-o*H+c*x)*D,e[9]=(n*H-t*O-s*x)*D,e[10]=(_*w-M*y+f*S)*D,e[11]=(p*y-h*w-m*S)*D,e[12]=(o*E-a*C-l*x)*D,e[13]=(t*C-n*E+r*x)*D,e[14]=(M*T-_*A-d*S)*D,e[15]=(h*A-p*T+u*S)*D,this}scale(e){const t=this.elements,n=e.x,r=e.y,s=e.z;return t[0]*=n,t[4]*=r,t[8]*=s,t[1]*=n,t[5]*=r,t[9]*=s,t[2]*=n,t[6]*=r,t[10]*=s,t[3]*=n,t[7]*=r,t[11]*=s,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,r))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const n=Math.cos(t),r=Math.sin(t),s=1-n,a=e.x,o=e.y,l=e.z,c=s*a,h=s*o;return this.set(c*a+n,c*o-r*l,c*l+r*o,0,c*o+r*l,h*o+n,h*l-r*a,0,c*l-r*o,h*l+r*a,s*l*l+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,r,s,a){return this.set(1,n,s,0,e,1,a,0,t,r,1,0,0,0,0,1),this}compose(e,t,n){const r=this.elements,s=t._x,a=t._y,o=t._z,l=t._w,c=s+s,h=a+a,p=o+o,u=s*c,m=s*h,_=s*p,M=a*h,d=a*p,f=o*p,S=l*c,T=l*h,y=l*p,A=n.x,w=n.y,R=n.z;return r[0]=(1-(M+f))*A,r[1]=(m+y)*A,r[2]=(_-T)*A,r[3]=0,r[4]=(m-y)*w,r[5]=(1-(u+f))*w,r[6]=(d+S)*w,r[7]=0,r[8]=(_+T)*R,r[9]=(d-S)*R,r[10]=(1-(u+M))*R,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,n){const r=this.elements;e.x=r[12],e.y=r[13],e.z=r[14];const s=this.determinant();if(s===0)return n.set(1,1,1),t.identity(),this;let a=ai.set(r[0],r[1],r[2]).length();const o=ai.set(r[4],r[5],r[6]).length(),l=ai.set(r[8],r[9],r[10]).length();s<0&&(a=-a),Ht.copy(this);const c=1/a,h=1/o,p=1/l;return Ht.elements[0]*=c,Ht.elements[1]*=c,Ht.elements[2]*=c,Ht.elements[4]*=h,Ht.elements[5]*=h,Ht.elements[6]*=h,Ht.elements[8]*=p,Ht.elements[9]*=p,Ht.elements[10]*=p,t.setFromRotationMatrix(Ht),n.x=a,n.y=o,n.z=l,this}makePerspective(e,t,n,r,s,a,o=tn,l=!1){const c=this.elements,h=2*s/(t-e),p=2*s/(n-r),u=(t+e)/(t-e),m=(n+r)/(n-r);let _,M;if(l)_=s/(a-s),M=a*s/(a-s);else if(o===tn)_=-(a+s)/(a-s),M=-2*a*s/(a-s);else if(o===nr)_=-a/(a-s),M=-a*s/(a-s);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=p,c[9]=m,c[13]=0,c[2]=0,c[6]=0,c[10]=_,c[14]=M,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,r,s,a,o=tn,l=!1){const c=this.elements,h=2/(t-e),p=2/(n-r),u=-(t+e)/(t-e),m=-(n+r)/(n-r);let _,M;if(l)_=1/(a-s),M=a/(a-s);else if(o===tn)_=-2/(a-s),M=-(a+s)/(a-s);else if(o===nr)_=-1/(a-s),M=-s/(a-s);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=0,c[12]=u,c[1]=0,c[5]=p,c[9]=0,c[13]=m,c[2]=0,c[6]=0,c[10]=_,c[14]=M,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){const t=this.elements,n=e.elements;for(let r=0;r<16;r++)if(t[r]!==n[r])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){const n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}}const ai=new B,Ht=new Je,ph=new B(0,0,0),mh=new B(1,1,1),bn=new B,ur=new B,It=new B,Po=new Je,Do=new Qn;class an{constructor(e=0,t=0,n=0,r=an.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=r}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,r=this._order){return this._x=e,this._y=t,this._z=n,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){const r=e.elements,s=r[0],a=r[4],o=r[8],l=r[1],c=r[5],h=r[9],p=r[2],u=r[6],m=r[10];switch(t){case"XYZ":this._y=Math.asin(ke(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,m),this._z=Math.atan2(-a,s)):(this._x=Math.atan2(u,c),this._z=0);break;case"YXZ":this._x=Math.asin(-ke(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,m),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-p,s),this._z=0);break;case"ZXY":this._x=Math.asin(ke(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-p,m),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,s));break;case"ZYX":this._y=Math.asin(-ke(p,-1,1)),Math.abs(p)<.9999999?(this._x=Math.atan2(u,m),this._z=Math.atan2(l,s)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(ke(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-p,s)):(this._x=0,this._y=Math.atan2(o,m));break;case"XZY":this._z=Math.asin(-ke(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(u,c),this._y=Math.atan2(o,s)):(this._x=Math.atan2(-h,m),this._y=0);break;default:De("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return Po.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Po,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return Do.setFromEuler(this),this.setFromQuaternion(Do,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}an.DEFAULT_ORDER="XYZ";class tl{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}let gh=0;const Lo=new B,oi=new Qn,un=new Je,hr=new B,zi=new B,_h=new B,xh=new Qn,Io=new B(1,0,0),Uo=new B(0,1,0),No=new B(0,0,1),Fo={type:"added"},vh={type:"removed"},ci={type:"childadded",child:null},ms={type:"childremoved",child:null};class mt extends Fi{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:gh++}),this.uuid=In(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=mt.DEFAULT_UP.clone();const e=new B,t=new an,n=new Qn,r=new B(1,1,1);function s(){n.setFromEuler(t,!1)}function a(){t.setFromQuaternion(n,void 0,!1)}t._onChange(s),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:r},modelViewMatrix:{value:new Je},normalMatrix:{value:new Ue}}),this.matrix=new Je,this.matrixWorld=new Je,this.matrixAutoUpdate=mt.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=mt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new tl,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return oi.setFromAxisAngle(e,t),this.quaternion.multiply(oi),this}rotateOnWorldAxis(e,t){return oi.setFromAxisAngle(e,t),this.quaternion.premultiply(oi),this}rotateX(e){return this.rotateOnAxis(Io,e)}rotateY(e){return this.rotateOnAxis(Uo,e)}rotateZ(e){return this.rotateOnAxis(No,e)}translateOnAxis(e,t){return Lo.copy(e).applyQuaternion(this.quaternion),this.position.add(Lo.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(Io,e)}translateY(e){return this.translateOnAxis(Uo,e)}translateZ(e){return this.translateOnAxis(No,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(un.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?hr.copy(e):hr.set(e,t,n);const r=this.parent;this.updateWorldMatrix(!0,!1),zi.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?un.lookAt(zi,hr,this.up):un.lookAt(hr,zi,this.up),this.quaternion.setFromRotationMatrix(un),r&&(un.extractRotation(r.matrixWorld),oi.setFromRotationMatrix(un),this.quaternion.premultiply(oi.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(Xe("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(Fo),ci.child=e,this.dispatchEvent(ci),ci.child=null):Xe("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(vh),ms.child=e,this.dispatchEvent(ms),ms.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),un.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),un.multiply(e.parent.matrixWorld)),e.applyMatrix4(un),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(Fo),ci.child=e,this.dispatchEvent(ci),ci.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,r=this.children.length;n<r;n++){const a=this.children[n].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);const r=this.children;for(let s=0,a=r.length;s<a;s++)r[s].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(zi,e,_h),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(zi,xh,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);const t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);const e=this.pivot;if(e!==null){const t=e.x,n=e.y,r=e.z,s=this.matrix.elements;s[12]+=t-s[0]*t-s[4]*n-s[8]*r,s[13]+=n-s[1]*t-s[5]*n-s[9]*r,s[14]+=r-s[2]*t-s[6]*n-s[10]*r}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t){const n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){const r=this.children;for(let s=0,a=r.length;s<a;s++)r[s].updateWorldMatrix(!1,!0)}}toJSON(e){const t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const r={};r.uuid=this.uuid,r.type=this.type,this.name!==""&&(r.name=this.name),this.castShadow===!0&&(r.castShadow=!0),this.receiveShadow===!0&&(r.receiveShadow=!0),this.visible===!1&&(r.visible=!1),this.frustumCulled===!1&&(r.frustumCulled=!1),this.renderOrder!==0&&(r.renderOrder=this.renderOrder),this.static!==!1&&(r.static=this.static),Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.pivot!==null&&(r.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(r.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(r.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(r.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(r.type="InstancedMesh",r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type="BatchedMesh",r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),r.instanceInfo=this._instanceInfo.map(o=>({...o})),r.availableInstanceIds=this._availableInstanceIds.slice(),r.availableGeometryIds=this._availableGeometryIds.slice(),r.nextIndexStart=this._nextIndexStart,r.nextVertexStart=this._nextVertexStart,r.geometryCount=this._geometryCount,r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.matricesTexture=this._matricesTexture.toJSON(e),r.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(r.boundingBox=this.boundingBox.toJSON()));function s(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=s(e.geometries,this.geometry);const o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){const l=o.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){const p=l[c];s(e.shapes,p)}else s(e.shapes,l)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(s(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(s(e.materials,this.material[l]));r.material=o}else r.material=s(e.materials,this.material);if(this.children.length>0){r.children=[];for(let o=0;o<this.children.length;o++)r.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let o=0;o<this.animations.length;o++){const l=this.animations[o];r.animations.push(s(e.animations,l))}}if(t){const o=a(e.geometries),l=a(e.materials),c=a(e.textures),h=a(e.images),p=a(e.shapes),u=a(e.skeletons),m=a(e.animations),_=a(e.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),h.length>0&&(n.images=h),p.length>0&&(n.shapes=p),u.length>0&&(n.skeletons=u),m.length>0&&(n.animations=m),_.length>0&&(n.nodes=_)}return n.object=r,n;function a(o){const l=[];for(const c in o){const h=o[c];delete h.metadata,l.push(h)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),e.pivot!==null&&(this.pivot=e.pivot.clone()),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){const r=e.children[n];this.add(r.clone())}return this}}mt.DEFAULT_UP=new B(0,1,0);mt.DEFAULT_MATRIX_AUTO_UPDATE=!0;mt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class Nt extends mt{constructor(){super(),this.isGroup=!0,this.type="Group"}}const Mh={type:"move"};class gs{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Nt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Nt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new B,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new B),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Nt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new B,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new B),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let r=null,s=null,a=null;const o=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){a=!0;for(const M of e.hand.values()){const d=t.getJointPose(M,n),f=this._getHandJoint(c,M);d!==null&&(f.matrix.fromArray(d.transform.matrix),f.matrix.decompose(f.position,f.rotation,f.scale),f.matrixWorldNeedsUpdate=!0,f.jointRadius=d.radius),f.visible=d!==null}const h=c.joints["index-finger-tip"],p=c.joints["thumb-tip"],u=h.position.distanceTo(p.position),m=.02,_=.005;c.inputState.pinching&&u>m+_?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&u<=m-_&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(s=t.getPose(e.gripSpace,n),s!==null&&(l.matrix.fromArray(s.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,s.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(s.linearVelocity)):l.hasLinearVelocity=!1,s.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(s.angularVelocity)):l.hasAngularVelocity=!1));o!==null&&(r=t.getPose(e.targetRaySpace,n),r===null&&s!==null&&(r=s),r!==null&&(o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,r.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(r.linearVelocity)):o.hasLinearVelocity=!1,r.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(r.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(Mh)))}return o!==null&&(o.visible=r!==null),l!==null&&(l.visible=s!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const n=new Nt;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}}const nl={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Tn={h:0,s:0,l:0},fr={h:0,s:0,l:0};function _s(i,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?i+(e-i)*6*t:t<1/2?e:t<2/3?i+(e-i)*6*(2/3-t):i}class Ne{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){const r=e;r&&r.isColor?this.copy(r):typeof r=="number"?this.setHex(r):typeof r=="string"&&this.setStyle(r)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=Gt){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,qe.colorSpaceToWorking(this,t),this}setRGB(e,t,n,r=qe.workingColorSpace){return this.r=e,this.g=t,this.b=n,qe.colorSpaceToWorking(this,r),this}setHSL(e,t,n,r=qe.workingColorSpace){if(e=oh(e,1),t=ke(t,0,1),n=ke(n,0,1),t===0)this.r=this.g=this.b=n;else{const s=n<=.5?n*(1+t):n+t-n*t,a=2*n-s;this.r=_s(a,s,e+1/3),this.g=_s(a,s,e),this.b=_s(a,s,e-1/3)}return qe.colorSpaceToWorking(this,r),this}setStyle(e,t=Gt){function n(s){s!==void 0&&parseFloat(s)<1&&De("Color: Alpha component of "+e+" will be ignored.")}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let s;const a=r[1],o=r[2];switch(a){case"rgb":case"rgba":if(s=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(s[4]),this.setRGB(Math.min(255,parseInt(s[1],10))/255,Math.min(255,parseInt(s[2],10))/255,Math.min(255,parseInt(s[3],10))/255,t);if(s=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(s[4]),this.setRGB(Math.min(100,parseInt(s[1],10))/100,Math.min(100,parseInt(s[2],10))/100,Math.min(100,parseInt(s[3],10))/100,t);break;case"hsl":case"hsla":if(s=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(s[4]),this.setHSL(parseFloat(s[1])/360,parseFloat(s[2])/100,parseFloat(s[3])/100,t);break;default:De("Color: Unknown color model "+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){const s=r[1],a=s.length;if(a===3)return this.setRGB(parseInt(s.charAt(0),16)/15,parseInt(s.charAt(1),16)/15,parseInt(s.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(s,16),t);De("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=Gt){const n=nl[e.toLowerCase()];return n!==void 0?this.setHex(n,t):De("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=xn(e.r),this.g=xn(e.g),this.b=xn(e.b),this}copyLinearToSRGB(e){return this.r=Ri(e.r),this.g=Ri(e.g),this.b=Ri(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=Gt){return qe.workingToColorSpace(At.copy(this),e),Math.round(ke(At.r*255,0,255))*65536+Math.round(ke(At.g*255,0,255))*256+Math.round(ke(At.b*255,0,255))}getHexString(e=Gt){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=qe.workingColorSpace){qe.workingToColorSpace(At.copy(this),t);const n=At.r,r=At.g,s=At.b,a=Math.max(n,r,s),o=Math.min(n,r,s);let l,c;const h=(o+a)/2;if(o===a)l=0,c=0;else{const p=a-o;switch(c=h<=.5?p/(a+o):p/(2-a-o),a){case n:l=(r-s)/p+(r<s?6:0);break;case r:l=(s-n)/p+2;break;case s:l=(n-r)/p+4;break}l/=6}return e.h=l,e.s=c,e.l=h,e}getRGB(e,t=qe.workingColorSpace){return qe.workingToColorSpace(At.copy(this),t),e.r=At.r,e.g=At.g,e.b=At.b,e}getStyle(e=Gt){qe.workingToColorSpace(At.copy(this),e);const t=At.r,n=At.g,r=At.b;return e!==Gt?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${r.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(r*255)})`}offsetHSL(e,t,n){return this.getHSL(Tn),this.setHSL(Tn.h+e,Tn.s+t,Tn.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Tn),e.getHSL(fr);const n=us(Tn.h,fr.h,t),r=us(Tn.s,fr.s,t),s=us(Tn.l,fr.l,t);return this.setHSL(n,r,s),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,n=this.g,r=this.b,s=e.elements;return this.r=s[0]*t+s[3]*n+s[6]*r,this.g=s[1]*t+s[4]*n+s[7]*r,this.b=s[2]*t+s[5]*n+s[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const At=new Ne;Ne.NAMES=nl;class eo{constructor(e,t=1,n=1e3){this.isFog=!0,this.name="",this.color=new Ne(e),this.near=t,this.far=n}clone(){return new eo(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}}class Sh extends mt{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new an,this.environmentIntensity=1,this.environmentRotation=new an,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}}const Wt=new B,hn=new B,xs=new B,fn=new B,li=new B,ui=new B,Oo=new B,vs=new B,Ms=new B,Ss=new B,Es=new ut,ys=new ut,bs=new ut;class Vt{constructor(e=new B,t=new B,n=new B){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,r){r.subVectors(n,t),Wt.subVectors(e,t),r.cross(Wt);const s=r.lengthSq();return s>0?r.multiplyScalar(1/Math.sqrt(s)):r.set(0,0,0)}static getBarycoord(e,t,n,r,s){Wt.subVectors(r,t),hn.subVectors(n,t),xs.subVectors(e,t);const a=Wt.dot(Wt),o=Wt.dot(hn),l=Wt.dot(xs),c=hn.dot(hn),h=hn.dot(xs),p=a*c-o*o;if(p===0)return s.set(0,0,0),null;const u=1/p,m=(c*l-o*h)*u,_=(a*h-o*l)*u;return s.set(1-m-_,_,m)}static containsPoint(e,t,n,r){return this.getBarycoord(e,t,n,r,fn)===null?!1:fn.x>=0&&fn.y>=0&&fn.x+fn.y<=1}static getInterpolation(e,t,n,r,s,a,o,l){return this.getBarycoord(e,t,n,r,fn)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(s,fn.x),l.addScaledVector(a,fn.y),l.addScaledVector(o,fn.z),l)}static getInterpolatedAttribute(e,t,n,r,s,a){return Es.setScalar(0),ys.setScalar(0),bs.setScalar(0),Es.fromBufferAttribute(e,t),ys.fromBufferAttribute(e,n),bs.fromBufferAttribute(e,r),a.setScalar(0),a.addScaledVector(Es,s.x),a.addScaledVector(ys,s.y),a.addScaledVector(bs,s.z),a}static isFrontFacing(e,t,n,r){return Wt.subVectors(n,t),hn.subVectors(e,t),Wt.cross(hn).dot(r)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,r){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,n,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Wt.subVectors(this.c,this.b),hn.subVectors(this.a,this.b),Wt.cross(hn).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return Vt.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return Vt.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,r,s){return Vt.getInterpolation(e,this.a,this.b,this.c,t,n,r,s)}containsPoint(e){return Vt.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return Vt.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const n=this.a,r=this.b,s=this.c;let a,o;li.subVectors(r,n),ui.subVectors(s,n),vs.subVectors(e,n);const l=li.dot(vs),c=ui.dot(vs);if(l<=0&&c<=0)return t.copy(n);Ms.subVectors(e,r);const h=li.dot(Ms),p=ui.dot(Ms);if(h>=0&&p<=h)return t.copy(r);const u=l*p-h*c;if(u<=0&&l>=0&&h<=0)return a=l/(l-h),t.copy(n).addScaledVector(li,a);Ss.subVectors(e,s);const m=li.dot(Ss),_=ui.dot(Ss);if(_>=0&&m<=_)return t.copy(s);const M=m*c-l*_;if(M<=0&&c>=0&&_<=0)return o=c/(c-_),t.copy(n).addScaledVector(ui,o);const d=h*_-m*p;if(d<=0&&p-h>=0&&m-_>=0)return Oo.subVectors(s,r),o=(p-h)/(p-h+(m-_)),t.copy(r).addScaledVector(Oo,o);const f=1/(d+M+u);return a=M*f,o=u*f,t.copy(n).addScaledVector(li,a).addScaledVector(ui,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}class ei{constructor(e=new B(1/0,1/0,1/0),t=new B(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(Xt.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(Xt.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const n=Xt.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const n=e.geometry;if(n!==void 0){const s=n.getAttribute("position");if(t===!0&&s!==void 0&&e.isInstancedMesh!==!0)for(let a=0,o=s.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,Xt):Xt.fromBufferAttribute(s,a),Xt.applyMatrix4(e.matrixWorld),this.expandByPoint(Xt);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),dr.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),dr.copy(n.boundingBox)),dr.applyMatrix4(e.matrixWorld),this.union(dr)}const r=e.children;for(let s=0,a=r.length;s<a;s++)this.expandByObject(r[s],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Xt),Xt.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(Gi),pr.subVectors(this.max,Gi),hi.subVectors(e.a,Gi),fi.subVectors(e.b,Gi),di.subVectors(e.c,Gi),An.subVectors(fi,hi),wn.subVectors(di,fi),On.subVectors(hi,di);let t=[0,-An.z,An.y,0,-wn.z,wn.y,0,-On.z,On.y,An.z,0,-An.x,wn.z,0,-wn.x,On.z,0,-On.x,-An.y,An.x,0,-wn.y,wn.x,0,-On.y,On.x,0];return!Ts(t,hi,fi,di,pr)||(t=[1,0,0,0,1,0,0,0,1],!Ts(t,hi,fi,di,pr))?!1:(mr.crossVectors(An,wn),t=[mr.x,mr.y,mr.z],Ts(t,hi,fi,di,pr))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Xt).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(Xt).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(dn[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),dn[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),dn[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),dn[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),dn[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),dn[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),dn[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),dn[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(dn),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}const dn=[new B,new B,new B,new B,new B,new B,new B,new B],Xt=new B,dr=new ei,hi=new B,fi=new B,di=new B,An=new B,wn=new B,On=new B,Gi=new B,pr=new B,mr=new B,Bn=new B;function Ts(i,e,t,n,r){for(let s=0,a=i.length-3;s<=a;s+=3){Bn.fromArray(i,s);const o=r.x*Math.abs(Bn.x)+r.y*Math.abs(Bn.y)+r.z*Math.abs(Bn.z),l=e.dot(Bn),c=t.dot(Bn),h=n.dot(Bn);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>o)return!1}return!0}const pt=new B,gr=new Fe;let Eh=0;class Bt{constructor(e,t,n=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Eh++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=Na,this.updateRanges=[],this.gpuType=Yt,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let r=0,s=this.itemSize;r<s;r++)this.array[e+r]=t.array[n+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)gr.fromBufferAttribute(this,t),gr.applyMatrix3(e),this.setXY(t,gr.x,gr.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)pt.fromBufferAttribute(this,t),pt.applyMatrix3(e),this.setXYZ(t,pt.x,pt.y,pt.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)pt.fromBufferAttribute(this,t),pt.applyMatrix4(e),this.setXYZ(t,pt.x,pt.y,pt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)pt.fromBufferAttribute(this,t),pt.applyNormalMatrix(e),this.setXYZ(t,pt.x,pt.y,pt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)pt.fromBufferAttribute(this,t),pt.transformDirection(e),this.setXYZ(t,pt.x,pt.y,pt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=en(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=tt(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=en(t,this.array)),t}setX(e,t){return this.normalized&&(t=tt(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=en(t,this.array)),t}setY(e,t){return this.normalized&&(t=tt(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=en(t,this.array)),t}setZ(e,t){return this.normalized&&(t=tt(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=en(t,this.array)),t}setW(e,t){return this.normalized&&(t=tt(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=tt(t,this.array),n=tt(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,r){return e*=this.itemSize,this.normalized&&(t=tt(t,this.array),n=tt(n,this.array),r=tt(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this}setXYZW(e,t,n,r,s){return e*=this.itemSize,this.normalized&&(t=tt(t,this.array),n=tt(n,this.array),r=tt(r,this.array),s=tt(s,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this.array[e+3]=s,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==Na&&(e.usage=this.usage),e}}class il extends Bt{constructor(e,t,n){super(new Uint16Array(e),t,n)}}class rl extends Bt{constructor(e,t,n){super(new Uint32Array(e),t,n)}}class ct extends Bt{constructor(e,t,n){super(new Float32Array(e),t,n)}}const yh=new ei,Vi=new B,As=new B;class Oi{constructor(e=new B,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const n=this.center;t!==void 0?n.copy(t):yh.setFromPoints(e).getCenter(n);let r=0;for(let s=0,a=e.length;s<a;s++)r=Math.max(r,n.distanceToSquared(e[s]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Vi.subVectors(e,this.center);const t=Vi.lengthSq();if(t>this.radius*this.radius){const n=Math.sqrt(t),r=(n-this.radius)*.5;this.center.addScaledVector(Vi,r/n),this.radius+=r}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(As.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Vi.copy(e.center).add(As)),this.expandByPoint(Vi.copy(e.center).sub(As))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}let bh=0;const zt=new Je,ws=new mt,pi=new B,Ut=new ei,ki=new ei,Mt=new B;class yt extends Fi{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:bh++}),this.uuid=In(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(ih(e)?rl:il)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const s=new Ue().getNormalMatrix(e);n.applyNormalMatrix(s),n.needsUpdate=!0}const r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return zt.makeRotationFromQuaternion(e),this.applyMatrix4(zt),this}rotateX(e){return zt.makeRotationX(e),this.applyMatrix4(zt),this}rotateY(e){return zt.makeRotationY(e),this.applyMatrix4(zt),this}rotateZ(e){return zt.makeRotationZ(e),this.applyMatrix4(zt),this}translate(e,t,n){return zt.makeTranslation(e,t,n),this.applyMatrix4(zt),this}scale(e,t,n){return zt.makeScale(e,t,n),this.applyMatrix4(zt),this}lookAt(e){return ws.lookAt(e),ws.updateMatrix(),this.applyMatrix4(ws.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(pi).negate(),this.translate(pi.x,pi.y,pi.z),this}setFromPoints(e){const t=this.getAttribute("position");if(t===void 0){const n=[];for(let r=0,s=e.length;r<s;r++){const a=e[r];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new ct(n,3))}else{const n=Math.min(e.length,t.count);for(let r=0;r<n;r++){const s=e[r];t.setXYZ(r,s.x,s.y,s.z||0)}e.length>t.count&&De("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new ei);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Xe("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new B(-1/0,-1/0,-1/0),new B(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,r=t.length;n<r;n++){const s=t[n];Ut.setFromBufferAttribute(s),this.morphTargetsRelative?(Mt.addVectors(this.boundingBox.min,Ut.min),this.boundingBox.expandByPoint(Mt),Mt.addVectors(this.boundingBox.max,Ut.max),this.boundingBox.expandByPoint(Mt)):(this.boundingBox.expandByPoint(Ut.min),this.boundingBox.expandByPoint(Ut.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Xe('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Oi);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Xe("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new B,1/0);return}if(e){const n=this.boundingSphere.center;if(Ut.setFromBufferAttribute(e),t)for(let s=0,a=t.length;s<a;s++){const o=t[s];ki.setFromBufferAttribute(o),this.morphTargetsRelative?(Mt.addVectors(Ut.min,ki.min),Ut.expandByPoint(Mt),Mt.addVectors(Ut.max,ki.max),Ut.expandByPoint(Mt)):(Ut.expandByPoint(ki.min),Ut.expandByPoint(ki.max))}Ut.getCenter(n);let r=0;for(let s=0,a=e.count;s<a;s++)Mt.fromBufferAttribute(e,s),r=Math.max(r,n.distanceToSquared(Mt));if(t)for(let s=0,a=t.length;s<a;s++){const o=t[s],l=this.morphTargetsRelative;for(let c=0,h=o.count;c<h;c++)Mt.fromBufferAttribute(o,c),l&&(pi.fromBufferAttribute(e,c),Mt.add(pi)),r=Math.max(r,n.distanceToSquared(Mt))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&Xe('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){Xe("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=t.position,r=t.normal,s=t.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Bt(new Float32Array(4*n.count),4));const a=this.getAttribute("tangent"),o=[],l=[];for(let x=0;x<n.count;x++)o[x]=new B,l[x]=new B;const c=new B,h=new B,p=new B,u=new Fe,m=new Fe,_=new Fe,M=new B,d=new B;function f(x,E,H){c.fromBufferAttribute(n,x),h.fromBufferAttribute(n,E),p.fromBufferAttribute(n,H),u.fromBufferAttribute(s,x),m.fromBufferAttribute(s,E),_.fromBufferAttribute(s,H),h.sub(c),p.sub(c),m.sub(u),_.sub(u);const C=1/(m.x*_.y-_.x*m.y);isFinite(C)&&(M.copy(h).multiplyScalar(_.y).addScaledVector(p,-m.y).multiplyScalar(C),d.copy(p).multiplyScalar(m.x).addScaledVector(h,-_.x).multiplyScalar(C),o[x].add(M),o[E].add(M),o[H].add(M),l[x].add(d),l[E].add(d),l[H].add(d))}let S=this.groups;S.length===0&&(S=[{start:0,count:e.count}]);for(let x=0,E=S.length;x<E;++x){const H=S[x],C=H.start,O=H.count;for(let z=C,k=C+O;z<k;z+=3)f(e.getX(z+0),e.getX(z+1),e.getX(z+2))}const T=new B,y=new B,A=new B,w=new B;function R(x){A.fromBufferAttribute(r,x),w.copy(A);const E=o[x];T.copy(E),T.sub(A.multiplyScalar(A.dot(E))).normalize(),y.crossVectors(w,E);const C=y.dot(l[x])<0?-1:1;a.setXYZW(x,T.x,T.y,T.z,C)}for(let x=0,E=S.length;x<E;++x){const H=S[x],C=H.start,O=H.count;for(let z=C,k=C+O;z<k;z+=3)R(e.getX(z+0)),R(e.getX(z+1)),R(e.getX(z+2))}}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Bt(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let u=0,m=n.count;u<m;u++)n.setXYZ(u,0,0,0);const r=new B,s=new B,a=new B,o=new B,l=new B,c=new B,h=new B,p=new B;if(e)for(let u=0,m=e.count;u<m;u+=3){const _=e.getX(u+0),M=e.getX(u+1),d=e.getX(u+2);r.fromBufferAttribute(t,_),s.fromBufferAttribute(t,M),a.fromBufferAttribute(t,d),h.subVectors(a,s),p.subVectors(r,s),h.cross(p),o.fromBufferAttribute(n,_),l.fromBufferAttribute(n,M),c.fromBufferAttribute(n,d),o.add(h),l.add(h),c.add(h),n.setXYZ(_,o.x,o.y,o.z),n.setXYZ(M,l.x,l.y,l.z),n.setXYZ(d,c.x,c.y,c.z)}else for(let u=0,m=t.count;u<m;u+=3)r.fromBufferAttribute(t,u+0),s.fromBufferAttribute(t,u+1),a.fromBufferAttribute(t,u+2),h.subVectors(a,s),p.subVectors(r,s),h.cross(p),n.setXYZ(u+0,h.x,h.y,h.z),n.setXYZ(u+1,h.x,h.y,h.z),n.setXYZ(u+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Mt.fromBufferAttribute(e,t),Mt.normalize(),e.setXYZ(t,Mt.x,Mt.y,Mt.z)}toNonIndexed(){function e(o,l){const c=o.array,h=o.itemSize,p=o.normalized,u=new c.constructor(l.length*h);let m=0,_=0;for(let M=0,d=l.length;M<d;M++){o.isInterleavedBufferAttribute?m=l[M]*o.data.stride+o.offset:m=l[M]*h;for(let f=0;f<h;f++)u[_++]=c[m++]}return new Bt(u,h,p)}if(this.index===null)return De("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const t=new yt,n=this.index.array,r=this.attributes;for(const o in r){const l=r[o],c=e(l,n);t.setAttribute(o,c)}const s=this.morphAttributes;for(const o in s){const l=[],c=s[o];for(let h=0,p=c.length;h<p;h++){const u=c[h],m=e(u,n);l.push(m)}t.morphAttributes[o]=l}t.morphTargetsRelative=this.morphTargetsRelative;const a=this.groups;for(let o=0,l=a.length;o<l;o++){const c=a[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){const e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const n=this.attributes;for(const l in n){const c=n[l];e.data.attributes[l]=c.toJSON(e.data)}const r={};let s=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],h=[];for(let p=0,u=c.length;p<u;p++){const m=c[p];h.push(m.toJSON(e.data))}h.length>0&&(r[l]=h,s=!0)}s&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);const a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));const o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const n=e.index;n!==null&&this.setIndex(n.clone());const r=e.attributes;for(const c in r){const h=r[c];this.setAttribute(c,h.clone(t))}const s=e.morphAttributes;for(const c in s){const h=[],p=s[c];for(let u=0,m=p.length;u<m;u++)h.push(p[u].clone(t));this.morphAttributes[c]=h}this.morphTargetsRelative=e.morphTargetsRelative;const a=e.groups;for(let c=0,h=a.length;c<h;c++){const p=a[c];this.addGroup(p.start,p.count,p.materialIndex)}const o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());const l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}}class Th{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=Na,this.updateRanges=[],this.version=0,this.uuid=In()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let r=0,s=this.stride;r<s;r++)this.array[e+r]=t.array[n+r];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=In()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=In()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}}const Ct=new B;class jr{constructor(e,t,n,r=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=r}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)Ct.fromBufferAttribute(this,t),Ct.applyMatrix4(e),this.setXYZ(t,Ct.x,Ct.y,Ct.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Ct.fromBufferAttribute(this,t),Ct.applyNormalMatrix(e),this.setXYZ(t,Ct.x,Ct.y,Ct.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Ct.fromBufferAttribute(this,t),Ct.transformDirection(e),this.setXYZ(t,Ct.x,Ct.y,Ct.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=en(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=tt(n,this.array)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=tt(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=tt(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=tt(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=tt(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=en(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=en(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=en(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=en(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=tt(t,this.array),n=tt(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=tt(t,this.array),n=tt(n,this.array),r=tt(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=r,this}setXYZW(e,t,n,r,s){return e=e*this.data.stride+this.offset,this.normalized&&(t=tt(t,this.array),n=tt(n,this.array),r=tt(r,this.array),s=tt(s,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=r,this.data.array[e+3]=s,this}clone(e){if(e===void 0){$r("InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let n=0;n<this.count;n++){const r=n*this.data.stride+this.offset;for(let s=0;s<this.itemSize;s++)t.push(this.data.array[r+s])}return new Bt(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new jr(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){$r("InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let n=0;n<this.count;n++){const r=n*this.data.stride+this.offset;for(let s=0;s<this.itemSize;s++)t.push(this.data.array[r+s])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}let Ah=0;class ti extends Fi{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Ah++}),this.uuid=In(),this.name="",this.type="Material",this.blending=wi,this.side=Un,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=qs,this.blendDst=Ys,this.blendEquation=qn,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Ne(0,0,0),this.blendAlpha=0,this.depthFunc=Pi,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=bo,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=ri,this.stencilZFail=ri,this.stencilZPass=ri,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const n=e[t];if(n===void 0){De(`Material: parameter '${t}' has value of undefined.`);continue}const r=this[t];if(r===void 0){De(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}r&&r.isColor?r.set(n):r&&r.isVector3&&n&&n.isVector3?r.copy(n):this[t]=n}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==wi&&(n.blending=this.blending),this.side!==Un&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==qs&&(n.blendSrc=this.blendSrc),this.blendDst!==Ys&&(n.blendDst=this.blendDst),this.blendEquation!==qn&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==Pi&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==bo&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==ri&&(n.stencilFail=this.stencilFail),this.stencilZFail!==ri&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==ri&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function r(s){const a=[];for(const o in s){const l=s[o];delete l.metadata,a.push(l)}return a}if(t){const s=r(e.textures),a=r(e.images);s.length>0&&(n.textures=s),a.length>0&&(n.images=a)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let n=null;if(t!==null){const r=t.length;n=new Array(r);for(let s=0;s!==r;++s)n[s]=t[s].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}}class sl extends ti{constructor(e){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new Ne(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}let mi;const Hi=new B,gi=new B,_i=new B,xi=new Fe,Wi=new Fe,al=new Je,_r=new B,Xi=new B,xr=new B,Bo=new Fe,Rs=new Fe,zo=new Fe;class wh extends mt{constructor(e=new sl){if(super(),this.isSprite=!0,this.type="Sprite",mi===void 0){mi=new yt;const t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new Th(t,5);mi.setIndex([0,1,2,0,2,3]),mi.setAttribute("position",new jr(n,3,0,!1)),mi.setAttribute("uv",new jr(n,2,3,!1))}this.geometry=mi,this.material=e,this.center=new Fe(.5,.5),this.count=1}raycast(e,t){e.camera===null&&Xe('Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),gi.setFromMatrixScale(this.matrixWorld),al.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),_i.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&gi.multiplyScalar(-_i.z);const n=this.material.rotation;let r,s;n!==0&&(s=Math.cos(n),r=Math.sin(n));const a=this.center;vr(_r.set(-.5,-.5,0),_i,a,gi,r,s),vr(Xi.set(.5,-.5,0),_i,a,gi,r,s),vr(xr.set(.5,.5,0),_i,a,gi,r,s),Bo.set(0,0),Rs.set(1,0),zo.set(1,1);let o=e.ray.intersectTriangle(_r,Xi,xr,!1,Hi);if(o===null&&(vr(Xi.set(-.5,.5,0),_i,a,gi,r,s),Rs.set(0,1),o=e.ray.intersectTriangle(_r,xr,Xi,!1,Hi),o===null))return;const l=e.ray.origin.distanceTo(Hi);l<e.near||l>e.far||t.push({distance:l,point:Hi.clone(),uv:Vt.getInterpolation(Hi,_r,Xi,xr,Bo,Rs,zo,new Fe),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}}function vr(i,e,t,n,r,s){xi.subVectors(i,t).addScalar(.5).multiply(n),r!==void 0?(Wi.x=s*xi.x-r*xi.y,Wi.y=r*xi.x+s*xi.y):Wi.copy(xi),i.copy(e),i.x+=Wi.x,i.y+=Wi.y,i.applyMatrix4(al)}const pn=new B,Cs=new B,Mr=new B,Rn=new B,Ps=new B,Sr=new B,Ds=new B;class ol{constructor(e=new B,t=new B(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,pn)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=pn.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(pn.copy(this.origin).addScaledVector(this.direction,t),pn.distanceToSquared(e))}distanceSqToSegment(e,t,n,r){Cs.copy(e).add(t).multiplyScalar(.5),Mr.copy(t).sub(e).normalize(),Rn.copy(this.origin).sub(Cs);const s=e.distanceTo(t)*.5,a=-this.direction.dot(Mr),o=Rn.dot(this.direction),l=-Rn.dot(Mr),c=Rn.lengthSq(),h=Math.abs(1-a*a);let p,u,m,_;if(h>0)if(p=a*l-o,u=a*o-l,_=s*h,p>=0)if(u>=-_)if(u<=_){const M=1/h;p*=M,u*=M,m=p*(p+a*u+2*o)+u*(a*p+u+2*l)+c}else u=s,p=Math.max(0,-(a*u+o)),m=-p*p+u*(u+2*l)+c;else u=-s,p=Math.max(0,-(a*u+o)),m=-p*p+u*(u+2*l)+c;else u<=-_?(p=Math.max(0,-(-a*s+o)),u=p>0?-s:Math.min(Math.max(-s,-l),s),m=-p*p+u*(u+2*l)+c):u<=_?(p=0,u=Math.min(Math.max(-s,-l),s),m=u*(u+2*l)+c):(p=Math.max(0,-(a*s+o)),u=p>0?s:Math.min(Math.max(-s,-l),s),m=-p*p+u*(u+2*l)+c);else u=a>0?-s:s,p=Math.max(0,-(a*u+o)),m=-p*p+u*(u+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,p),r&&r.copy(Cs).addScaledVector(Mr,u),m}intersectSphere(e,t){pn.subVectors(e.center,this.origin);const n=pn.dot(this.direction),r=pn.dot(pn)-n*n,s=e.radius*e.radius;if(r>s)return null;const a=Math.sqrt(s-r),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){const n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,r,s,a,o,l;const c=1/this.direction.x,h=1/this.direction.y,p=1/this.direction.z,u=this.origin;return c>=0?(n=(e.min.x-u.x)*c,r=(e.max.x-u.x)*c):(n=(e.max.x-u.x)*c,r=(e.min.x-u.x)*c),h>=0?(s=(e.min.y-u.y)*h,a=(e.max.y-u.y)*h):(s=(e.max.y-u.y)*h,a=(e.min.y-u.y)*h),n>a||s>r||((s>n||isNaN(n))&&(n=s),(a<r||isNaN(r))&&(r=a),p>=0?(o=(e.min.z-u.z)*p,l=(e.max.z-u.z)*p):(o=(e.max.z-u.z)*p,l=(e.min.z-u.z)*p),n>l||o>r)||((o>n||n!==n)&&(n=o),(l<r||r!==r)&&(r=l),r<0)?null:this.at(n>=0?n:r,t)}intersectsBox(e){return this.intersectBox(e,pn)!==null}intersectTriangle(e,t,n,r,s){Ps.subVectors(t,e),Sr.subVectors(n,e),Ds.crossVectors(Ps,Sr);let a=this.direction.dot(Ds),o;if(a>0){if(r)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Rn.subVectors(this.origin,e);const l=o*this.direction.dot(Sr.crossVectors(Rn,Sr));if(l<0)return null;const c=o*this.direction.dot(Ps.cross(Rn));if(c<0||l+c>a)return null;const h=-o*Rn.dot(Ds);return h<0?null:this.at(h/a,s)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class cl extends ti{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Ne(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new an,this.combine=Oc,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const Go=new Je,zn=new ol,Er=new Oi,Vo=new B,yr=new B,br=new B,Tr=new B,Ls=new B,Ar=new B,ko=new B,wr=new B;class Ve extends mt{constructor(e=new yt,t=new cl){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const r=t[n[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,a=r.length;s<a;s++){const o=r[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=s}}}}getVertexPosition(e,t){const n=this.geometry,r=n.attributes.position,s=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(r,e);const o=this.morphTargetInfluences;if(s&&o){Ar.set(0,0,0);for(let l=0,c=s.length;l<c;l++){const h=o[l],p=s[l];h!==0&&(Ls.fromBufferAttribute(p,e),a?Ar.addScaledVector(Ls,h):Ar.addScaledVector(Ls.sub(t),h))}t.add(Ar)}return t}raycast(e,t){const n=this.geometry,r=this.material,s=this.matrixWorld;r!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Er.copy(n.boundingSphere),Er.applyMatrix4(s),zn.copy(e.ray).recast(e.near),!(Er.containsPoint(zn.origin)===!1&&(zn.intersectSphere(Er,Vo)===null||zn.origin.distanceToSquared(Vo)>(e.far-e.near)**2))&&(Go.copy(s).invert(),zn.copy(e.ray).applyMatrix4(Go),!(n.boundingBox!==null&&zn.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,zn)))}_computeIntersections(e,t,n){let r;const s=this.geometry,a=this.material,o=s.index,l=s.attributes.position,c=s.attributes.uv,h=s.attributes.uv1,p=s.attributes.normal,u=s.groups,m=s.drawRange;if(o!==null)if(Array.isArray(a))for(let _=0,M=u.length;_<M;_++){const d=u[_],f=a[d.materialIndex],S=Math.max(d.start,m.start),T=Math.min(o.count,Math.min(d.start+d.count,m.start+m.count));for(let y=S,A=T;y<A;y+=3){const w=o.getX(y),R=o.getX(y+1),x=o.getX(y+2);r=Rr(this,f,e,n,c,h,p,w,R,x),r&&(r.faceIndex=Math.floor(y/3),r.face.materialIndex=d.materialIndex,t.push(r))}}else{const _=Math.max(0,m.start),M=Math.min(o.count,m.start+m.count);for(let d=_,f=M;d<f;d+=3){const S=o.getX(d),T=o.getX(d+1),y=o.getX(d+2);r=Rr(this,a,e,n,c,h,p,S,T,y),r&&(r.faceIndex=Math.floor(d/3),t.push(r))}}else if(l!==void 0)if(Array.isArray(a))for(let _=0,M=u.length;_<M;_++){const d=u[_],f=a[d.materialIndex],S=Math.max(d.start,m.start),T=Math.min(l.count,Math.min(d.start+d.count,m.start+m.count));for(let y=S,A=T;y<A;y+=3){const w=y,R=y+1,x=y+2;r=Rr(this,f,e,n,c,h,p,w,R,x),r&&(r.faceIndex=Math.floor(y/3),r.face.materialIndex=d.materialIndex,t.push(r))}}else{const _=Math.max(0,m.start),M=Math.min(l.count,m.start+m.count);for(let d=_,f=M;d<f;d+=3){const S=d,T=d+1,y=d+2;r=Rr(this,a,e,n,c,h,p,S,T,y),r&&(r.faceIndex=Math.floor(d/3),t.push(r))}}}}function Rh(i,e,t,n,r,s,a,o){let l;if(e.side===Dt?l=n.intersectTriangle(a,s,r,!0,o):l=n.intersectTriangle(r,s,a,e.side===Un,o),l===null)return null;wr.copy(o),wr.applyMatrix4(i.matrixWorld);const c=t.ray.origin.distanceTo(wr);return c<t.near||c>t.far?null:{distance:c,point:wr.clone(),object:i}}function Rr(i,e,t,n,r,s,a,o,l,c){i.getVertexPosition(o,yr),i.getVertexPosition(l,br),i.getVertexPosition(c,Tr);const h=Rh(i,e,t,n,yr,br,Tr,ko);if(h){const p=new B;Vt.getBarycoord(ko,yr,br,Tr,p),r&&(h.uv=Vt.getInterpolatedAttribute(r,o,l,c,p,new Fe)),s&&(h.uv1=Vt.getInterpolatedAttribute(s,o,l,c,p,new Fe)),a&&(h.normal=Vt.getInterpolatedAttribute(a,o,l,c,p,new B),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));const u={a:o,b:l,c,normal:new B,materialIndex:0};Vt.getNormal(yr,br,Tr,u.normal),h.face=u,h.barycoord=p}return h}class ll extends Rt{constructor(e=null,t=1,n=1,r,s,a,o,l,c=Et,h=Et,p,u){super(null,a,o,l,c,h,r,s,p,u),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class Ho extends Bt{constructor(e,t,n,r=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=r}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){const e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}const vi=new Je,Wo=new Je,Cr=[],Xo=new ei,Ch=new Je,qi=new Ve,Yi=new Oi;class Wn extends Ve{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new Ho(new Float32Array(n*16),16),this.previousInstanceMatrix=null,this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let r=0;r<n;r++)this.setMatrixAt(r,Ch)}computeBoundingBox(){const e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new ei),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,vi),Xo.copy(e.boundingBox).applyMatrix4(vi),this.boundingBox.union(Xo)}computeBoundingSphere(){const e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new Oi),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,vi),Yi.copy(e.boundingSphere).applyMatrix4(vi),this.boundingSphere.union(Yi)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.previousInstanceMatrix!==null&&(this.previousInstanceMatrix=e.previousInstanceMatrix.clone()),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){const n=t.morphTargetInfluences,r=this.morphTexture.source.data.data,s=n.length+1,a=e*s+1;for(let o=0;o<n.length;o++)n[o]=r[a+o]}raycast(e,t){const n=this.matrixWorld,r=this.count;if(qi.geometry=this.geometry,qi.material=this.material,qi.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Yi.copy(this.boundingSphere),Yi.applyMatrix4(n),e.ray.intersectsSphere(Yi)!==!1))for(let s=0;s<r;s++){this.getMatrixAt(s,vi),Wo.multiplyMatrices(n,vi),qi.matrixWorld=Wo,qi.raycast(e,Cr);for(let a=0,o=Cr.length;a<o;a++){const l=Cr[a];l.instanceId=s,l.object=this,t.push(l)}Cr.length=0}}setColorAt(e,t){this.instanceColor===null&&(this.instanceColor=new Ho(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3)}setMatrixAt(e,t){t.toArray(this.instanceMatrix.array,e*16)}setMorphAt(e,t){const n=t.morphTargetInfluences,r=n.length+1;this.morphTexture===null&&(this.morphTexture=new ll(new Float32Array(r*this.count),r,this.count,Ya,Yt));const s=this.morphTexture.source.data.data;let a=0;for(let c=0;c<n.length;c++)a+=n[c];const o=this.geometry.morphTargetsRelative?1:1-a,l=r*e;s[l]=o,s.set(n,l+1)}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const Is=new B,Ph=new B,Dh=new Ue;class Xn{constructor(e=new B(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,r){return this.normal.set(e,t,n),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){const r=Is.subVectors(n,t).cross(Ph.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){const n=e.delta(Is),r=this.normal.dot(n);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const s=-(e.start.dot(this.normal)+this.constant)/r;return s<0||s>1?null:t.copy(e.start).addScaledVector(n,s)}intersectsLine(e){const t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const n=t||Dh.getNormalMatrix(e),r=this.coplanarPoint(Is).applyMatrix4(e),s=this.normal.applyMatrix3(n).normalize();return this.constant=-r.dot(s),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}}const Gn=new Oi,Lh=new Fe(.5,.5),Pr=new B;class to{constructor(e=new Xn,t=new Xn,n=new Xn,r=new Xn,s=new Xn,a=new Xn){this.planes=[e,t,n,r,s,a]}set(e,t,n,r,s,a){const o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(r),o[4].copy(s),o[5].copy(a),this}copy(e){const t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=tn,n=!1){const r=this.planes,s=e.elements,a=s[0],o=s[1],l=s[2],c=s[3],h=s[4],p=s[5],u=s[6],m=s[7],_=s[8],M=s[9],d=s[10],f=s[11],S=s[12],T=s[13],y=s[14],A=s[15];if(r[0].setComponents(c-a,m-h,f-_,A-S).normalize(),r[1].setComponents(c+a,m+h,f+_,A+S).normalize(),r[2].setComponents(c+o,m+p,f+M,A+T).normalize(),r[3].setComponents(c-o,m-p,f-M,A-T).normalize(),n)r[4].setComponents(l,u,d,y).normalize(),r[5].setComponents(c-l,m-u,f-d,A-y).normalize();else if(r[4].setComponents(c-l,m-u,f-d,A-y).normalize(),t===tn)r[5].setComponents(c+l,m+u,f+d,A+y).normalize();else if(t===nr)r[5].setComponents(l,u,d,y).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Gn.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Gn.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Gn)}intersectsSprite(e){Gn.center.set(0,0,0);const t=Lh.distanceTo(e.center);return Gn.radius=.7071067811865476+t,Gn.applyMatrix4(e.matrixWorld),this.intersectsSphere(Gn)}intersectsSphere(e){const t=this.planes,n=e.center,r=-e.radius;for(let s=0;s<6;s++)if(t[s].distanceToPoint(n)<r)return!1;return!0}intersectsBox(e){const t=this.planes;for(let n=0;n<6;n++){const r=t[n];if(Pr.x=r.normal.x>0?e.max.x:e.min.x,Pr.y=r.normal.y>0?e.max.y:e.min.y,Pr.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(Pr)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class ul extends ti{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Ne(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}const qo=new Je,Oa=new ol,Dr=new Oi,Lr=new B;class Ih extends mt{constructor(e=new yt,t=new ul){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){const n=this.geometry,r=this.matrixWorld,s=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),Dr.copy(n.boundingSphere),Dr.applyMatrix4(r),Dr.radius+=s,e.ray.intersectsSphere(Dr)===!1)return;qo.copy(r).invert(),Oa.copy(e.ray).applyMatrix4(qo);const o=s/((this.scale.x+this.scale.y+this.scale.z)/3),l=o*o,c=n.index,p=n.attributes.position;if(c!==null){const u=Math.max(0,a.start),m=Math.min(c.count,a.start+a.count);for(let _=u,M=m;_<M;_++){const d=c.getX(_);Lr.fromBufferAttribute(p,d),Yo(Lr,d,l,r,e,t,this)}}else{const u=Math.max(0,a.start),m=Math.min(p.count,a.start+a.count);for(let _=u,M=m;_<M;_++)Lr.fromBufferAttribute(p,_),Yo(Lr,_,l,r,e,t,this)}}updateMorphTargets(){const t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){const r=t[n[0]];if(r!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,a=r.length;s<a;s++){const o=r[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=s}}}}}function Yo(i,e,t,n,r,s,a){const o=Oa.distanceSqToPoint(i);if(o<t){const l=new B;Oa.closestPointToPoint(i,l),l.applyMatrix4(n);const c=r.ray.origin.distanceTo(l);if(c<r.near||c>r.far)return;s.push({distance:c,distanceToRay:Math.sqrt(o),point:l,index:e,face:null,faceIndex:null,barycoord:null,object:a})}}class hl extends Rt{constructor(e=[],t=Jn,n,r,s,a,o,l,c,h){super(e,t,n,r,s,a,o,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class Uh extends Rt{constructor(e,t,n,r,s,a,o,l,c){super(e,t,n,r,s,a,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}}class ir extends Rt{constructor(e,t,n=sn,r,s,a,o=Et,l=Et,c,h=Mn,p=1){if(h!==Mn&&h!==Zn)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const u={width:e,height:t,depth:p};super(u,r,s,a,o,l,h,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Qa(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}}class Nh extends ir{constructor(e,t=sn,n=Jn,r,s,a=Et,o=Et,l,c=Mn){const h={width:e,height:e,depth:1},p=[h,h,h,h,h,h];super(e,e,t,n,r,s,a,o,l,c),this.image=p,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}}class fl extends Rt{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}}class ot extends yt{constructor(e=1,t=1,n=1,r=1,s=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:r,heightSegments:s,depthSegments:a};const o=this;r=Math.floor(r),s=Math.floor(s),a=Math.floor(a);const l=[],c=[],h=[],p=[];let u=0,m=0;_("z","y","x",-1,-1,n,t,e,a,s,0),_("z","y","x",1,-1,n,t,-e,a,s,1),_("x","z","y",1,1,e,n,t,r,a,2),_("x","z","y",1,-1,e,n,-t,r,a,3),_("x","y","z",1,-1,e,t,n,r,s,4),_("x","y","z",-1,-1,e,t,-n,r,s,5),this.setIndex(l),this.setAttribute("position",new ct(c,3)),this.setAttribute("normal",new ct(h,3)),this.setAttribute("uv",new ct(p,2));function _(M,d,f,S,T,y,A,w,R,x,E){const H=y/R,C=A/x,O=y/2,z=A/2,k=w/2,D=R+1,I=x+1;let N=0,$=0;const j=new B;for(let Q=0;Q<I;Q++){const ae=Q*C-z;for(let Z=0;Z<D;Z++){const le=Z*H-O;j[M]=le*S,j[d]=ae*T,j[f]=k,c.push(j.x,j.y,j.z),j[M]=0,j[d]=0,j[f]=w>0?1:-1,h.push(j.x,j.y,j.z),p.push(Z/R),p.push(1-Q/x),N+=1}}for(let Q=0;Q<x;Q++)for(let ae=0;ae<R;ae++){const Z=u+ae+D*Q,le=u+ae+D*(Q+1),Re=u+(ae+1)+D*(Q+1),He=u+(ae+1)+D*Q;l.push(Z,le,He),l.push(le,Re,He),$+=6}o.addGroup(m,$,E),m+=$,u+=N}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ot(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}class Ui extends yt{constructor(e=1,t=32,n=0,r=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:r},t=Math.max(3,t);const s=[],a=[],o=[],l=[],c=new B,h=new Fe;a.push(0,0,0),o.push(0,0,1),l.push(.5,.5);for(let p=0,u=3;p<=t;p++,u+=3){const m=n+p/t*r;c.x=e*Math.cos(m),c.y=e*Math.sin(m),a.push(c.x,c.y,c.z),o.push(0,0,1),h.x=(a[u]/e+1)/2,h.y=(a[u+1]/e+1)/2,l.push(h.x,h.y)}for(let p=1;p<=t;p++)s.push(p,p+1,0);this.setIndex(s),this.setAttribute("position",new ct(a,3)),this.setAttribute("normal",new ct(o,3)),this.setAttribute("uv",new ct(l,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Ui(e.radius,e.segments,e.thetaStart,e.thetaLength)}}class Ci extends yt{constructor(e=1,t=1,n=1,r=32,s=1,a=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:r,heightSegments:s,openEnded:a,thetaStart:o,thetaLength:l};const c=this;r=Math.floor(r),s=Math.floor(s);const h=[],p=[],u=[],m=[];let _=0;const M=[],d=n/2;let f=0;S(),a===!1&&(e>0&&T(!0),t>0&&T(!1)),this.setIndex(h),this.setAttribute("position",new ct(p,3)),this.setAttribute("normal",new ct(u,3)),this.setAttribute("uv",new ct(m,2));function S(){const y=new B,A=new B;let w=0;const R=(t-e)/n;for(let x=0;x<=s;x++){const E=[],H=x/s,C=H*(t-e)+e;for(let O=0;O<=r;O++){const z=O/r,k=z*l+o,D=Math.sin(k),I=Math.cos(k);A.x=C*D,A.y=-H*n+d,A.z=C*I,p.push(A.x,A.y,A.z),y.set(D,R,I).normalize(),u.push(y.x,y.y,y.z),m.push(z,1-H),E.push(_++)}M.push(E)}for(let x=0;x<r;x++)for(let E=0;E<s;E++){const H=M[E][x],C=M[E+1][x],O=M[E+1][x+1],z=M[E][x+1];(e>0||E!==0)&&(h.push(H,C,z),w+=3),(t>0||E!==s-1)&&(h.push(C,O,z),w+=3)}c.addGroup(f,w,0),f+=w}function T(y){const A=_,w=new Fe,R=new B;let x=0;const E=y===!0?e:t,H=y===!0?1:-1;for(let O=1;O<=r;O++)p.push(0,d*H,0),u.push(0,H,0),m.push(.5,.5),_++;const C=_;for(let O=0;O<=r;O++){const k=O/r*l+o,D=Math.cos(k),I=Math.sin(k);R.x=E*I,R.y=d*H,R.z=E*D,p.push(R.x,R.y,R.z),u.push(0,H,0),w.x=D*.5+.5,w.y=I*.5*H+.5,m.push(w.x,w.y),_++}for(let O=0;O<r;O++){const z=A+O,k=C+O;y===!0?h.push(k,k+1,z):h.push(k+1,k,z),x+=3}c.addGroup(f,x,y===!0?1:2),f+=x}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Ci(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class sr extends yt{constructor(e=1,t=1,n=1,r=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:r};const s=e/2,a=t/2,o=Math.floor(n),l=Math.floor(r),c=o+1,h=l+1,p=e/o,u=t/l,m=[],_=[],M=[],d=[];for(let f=0;f<h;f++){const S=f*u-a;for(let T=0;T<c;T++){const y=T*p-s;_.push(y,-S,0),M.push(0,0,1),d.push(T/o),d.push(1-f/l)}}for(let f=0;f<l;f++)for(let S=0;S<o;S++){const T=S+c*f,y=S+c*(f+1),A=S+1+c*(f+1),w=S+1+c*f;m.push(T,y,w),m.push(y,A,w)}this.setIndex(m),this.setAttribute("position",new ct(_,3)),this.setAttribute("normal",new ct(M,3)),this.setAttribute("uv",new ct(d,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new sr(e.width,e.height,e.widthSegments,e.heightSegments)}}class no extends yt{constructor(e=.5,t=1,n=32,r=1,s=0,a=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:e,outerRadius:t,thetaSegments:n,phiSegments:r,thetaStart:s,thetaLength:a},n=Math.max(3,n),r=Math.max(1,r);const o=[],l=[],c=[],h=[];let p=e;const u=(t-e)/r,m=new B,_=new Fe;for(let M=0;M<=r;M++){for(let d=0;d<=n;d++){const f=s+d/n*a;m.x=p*Math.cos(f),m.y=p*Math.sin(f),l.push(m.x,m.y,m.z),c.push(0,0,1),_.x=(m.x/t+1)/2,_.y=(m.y/t+1)/2,h.push(_.x,_.y)}p+=u}for(let M=0;M<r;M++){const d=M*(n+1);for(let f=0;f<n;f++){const S=f+d,T=S,y=S+n+1,A=S+n+2,w=S+1;o.push(T,y,w),o.push(y,A,w)}}this.setIndex(o),this.setAttribute("position",new ct(l,3)),this.setAttribute("normal",new ct(c,3)),this.setAttribute("uv",new ct(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new no(e.innerRadius,e.outerRadius,e.thetaSegments,e.phiSegments,e.thetaStart,e.thetaLength)}}class io extends yt{constructor(e=1,t=32,n=16,r=0,s=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:r,phiLength:s,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));const l=Math.min(a+o,Math.PI);let c=0;const h=[],p=new B,u=new B,m=[],_=[],M=[],d=[];for(let f=0;f<=n;f++){const S=[],T=f/n;let y=0;f===0&&a===0?y=.5/t:f===n&&l===Math.PI&&(y=-.5/t);for(let A=0;A<=t;A++){const w=A/t;p.x=-e*Math.cos(r+w*s)*Math.sin(a+T*o),p.y=e*Math.cos(a+T*o),p.z=e*Math.sin(r+w*s)*Math.sin(a+T*o),_.push(p.x,p.y,p.z),u.copy(p).normalize(),M.push(u.x,u.y,u.z),d.push(w+y,1-T),S.push(c++)}h.push(S)}for(let f=0;f<n;f++)for(let S=0;S<t;S++){const T=h[f][S+1],y=h[f][S],A=h[f+1][S],w=h[f+1][S+1];(f!==0||a>0)&&m.push(T,y,w),(f!==n-1||l<Math.PI)&&m.push(y,A,w)}this.setIndex(m),this.setAttribute("position",new ct(_,3)),this.setAttribute("normal",new ct(M,3)),this.setAttribute("uv",new ct(d,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new io(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}}class ro extends yt{constructor(e=1,t=.4,n=12,r=48,s=Math.PI*2,a=0,o=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:r,arc:s,thetaStart:a,thetaLength:o},n=Math.floor(n),r=Math.floor(r);const l=[],c=[],h=[],p=[],u=new B,m=new B,_=new B;for(let M=0;M<=n;M++){const d=a+M/n*o;for(let f=0;f<=r;f++){const S=f/r*s;m.x=(e+t*Math.cos(d))*Math.cos(S),m.y=(e+t*Math.cos(d))*Math.sin(S),m.z=t*Math.sin(d),c.push(m.x,m.y,m.z),u.x=e*Math.cos(S),u.y=e*Math.sin(S),_.subVectors(m,u).normalize(),h.push(_.x,_.y,_.z),p.push(f/r),p.push(M/n)}}for(let M=1;M<=n;M++)for(let d=1;d<=r;d++){const f=(r+1)*M+d-1,S=(r+1)*(M-1)+d-1,T=(r+1)*(M-1)+d,y=(r+1)*M+d;l.push(f,S,y),l.push(S,T,y)}this.setIndex(l),this.setAttribute("position",new ct(c,3)),this.setAttribute("normal",new ct(h,3)),this.setAttribute("uv",new ct(p,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ro(e.radius,e.tube,e.radialSegments,e.tubularSegments,e.arc)}}function Ni(i){const e={};for(const t in i){e[t]={};for(const n in i[t]){const r=i[t][n];r&&(r.isColor||r.isMatrix3||r.isMatrix4||r.isVector2||r.isVector3||r.isVector4||r.isTexture||r.isQuaternion)?r.isRenderTargetTexture?(De("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=r.clone():Array.isArray(r)?e[t][n]=r.slice():e[t][n]=r}}return e}function Pt(i){const e={};for(let t=0;t<i.length;t++){const n=Ni(i[t]);for(const r in n)e[r]=n[r]}return e}function Fh(i){const e=[];for(let t=0;t<i.length;t++)e.push(i[t].clone());return e}function dl(i){const e=i.getRenderTarget();return e===null?i.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:qe.workingColorSpace}const Oh={clone:Ni,merge:Pt};var Bh=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,zh=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class on extends ti{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Bh,this.fragmentShader=zh,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Ni(e.uniforms),this.uniformsGroups=Fh(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const r in this.uniforms){const a=this.uniforms[r].value;a&&a.isTexture?t.uniforms[r]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[r]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[r]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[r]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[r]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[r]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[r]={type:"m4",value:a.toArray()}:t.uniforms[r]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const n={};for(const r in this.extensions)this.extensions[r]===!0&&(n[r]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}}class Gh extends on{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class nt extends ti{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new Ne(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Ne(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Jc,this.normalScale=new Fe(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new an,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class Vh extends ti{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=$u,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class kh extends ti{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}class so extends mt{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new Ne(e),this.intensity=t}dispose(){this.dispatchEvent({type:"dispose"})}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){const t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}}class Hh extends so{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(mt.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Ne(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){const t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}}const Us=new Je,Ko=new B,$o=new B;class pl{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Fe(512,512),this.mapType=Ot,this.map=null,this.mapPass=null,this.matrix=new Je,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new to,this._frameExtents=new Fe(1,1),this._viewportCount=1,this._viewports=[new ut(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){const t=this.camera,n=this.matrix;Ko.setFromMatrixPosition(e.matrixWorld),t.position.copy(Ko),$o.setFromMatrixPosition(e.target.matrixWorld),t.lookAt($o),t.updateMatrixWorld(),Us.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Us,t.coordinateSystem,t.reversedDepth),t.coordinateSystem===nr||t.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Us)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){const e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}const Ir=new B,Ur=new Qn,Zt=new B;class ml extends mt{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Je,this.projectionMatrix=new Je,this.projectionMatrixInverse=new Je,this.coordinateSystem=tn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(Ir,Ur,Zt),Zt.x===1&&Zt.y===1&&Zt.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ir,Ur,Zt.set(1,1,1)).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorld.decompose(Ir,Ur,Zt),Zt.x===1&&Zt.y===1&&Zt.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ir,Ur,Zt.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}const Cn=new B,Zo=new Fe,jo=new Fe;class Ft extends ml{constructor(e=50,t=1,n=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=Fa*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(ls*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Fa*2*Math.atan(Math.tan(ls*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){Cn.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Cn.x,Cn.y).multiplyScalar(-e/Cn.z),Cn.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Cn.x,Cn.y).multiplyScalar(-e/Cn.z)}getViewSize(e,t){return this.getViewBounds(e,Zo,jo),t.subVectors(jo,Zo)}setViewOffset(e,t,n,r,s,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=s,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(ls*.5*this.fov)/this.zoom,n=2*t,r=this.aspect*n,s=-.5*r;const a=this.view;if(this.view!==null&&this.view.enabled){const l=a.fullWidth,c=a.fullHeight;s+=a.offsetX*r/l,t-=a.offsetY*n/c,r*=a.width/l,n*=a.height/c}const o=this.filmOffset;o!==0&&(s+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(s,s+r,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}class Wh extends pl{constructor(){super(new Ft(90,1,.5,500)),this.isPointLightShadow=!0}}class gl extends so{constructor(e,t,n=0,r=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=r,this.shadow=new Wh}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){const t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}}class ao extends ml{constructor(e=-1,t=1,n=1,r=-1,s=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=r,this.near=s,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,r,s,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=s,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,r=(this.top+this.bottom)/2;let s=n-e,a=n+e,o=r+t,l=r-t;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;s+=c*this.view.offsetX,a=s+c*this.view.width,o-=h*this.view.offsetY,l=o-h*this.view.height}this.projectionMatrix.makeOrthographic(s,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}class Xh extends pl{constructor(){super(new ao(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class qh extends so{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(mt.DEFAULT_UP),this.updateMatrix(),this.target=new mt,this.shadow=new Xh}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){const t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}}const Mi=-90,Si=1;class Yh extends mt{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const r=new Ft(Mi,Si,e,t);r.layers=this.layers,this.add(r);const s=new Ft(Mi,Si,e,t);s.layers=this.layers,this.add(s);const a=new Ft(Mi,Si,e,t);a.layers=this.layers,this.add(a);const o=new Ft(Mi,Si,e,t);o.layers=this.layers,this.add(o);const l=new Ft(Mi,Si,e,t);l.layers=this.layers,this.add(l);const c=new Ft(Mi,Si,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[n,r,s,a,o,l]=t;for(const c of t)this.remove(c);if(e===tn)n.up.set(0,1,0),n.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),s.up.set(0,0,-1),s.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===nr)n.up.set(0,-1,0),n.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),s.up.set(0,0,1),s.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(const c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[s,a,o,l,c,h]=this.children,p=e.getRenderTarget(),u=e.getActiveCubeFace(),m=e.getActiveMipmapLevel(),_=e.xr.enabled;e.xr.enabled=!1;const M=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let d=!1;e.isWebGLRenderer===!0?d=e.state.buffers.depth.getReversed():d=e.reversedDepthBuffer,e.setRenderTarget(n,0,r),d&&e.autoClear===!1&&e.clearDepth(),e.render(t,s),e.setRenderTarget(n,1,r),d&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,r),d&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,r),d&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(n,4,r),d&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=M,e.setRenderTarget(n,5,r),d&&e.autoClear===!1&&e.clearDepth(),e.render(t,h),e.setRenderTarget(p,u,m),e.xr.enabled=_,n.texture.needsPMREMUpdate=!0}}class Kh extends Ft{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}}function Jo(i,e,t,n){const r=$h(n);switch(t){case Zc:return i*e;case Ya:return i*e/r.components*r.byteLength;case Ka:return i*e/r.components*r.byteLength;case Li:return i*e*2/r.components*r.byteLength;case $a:return i*e*2/r.components*r.byteLength;case jc:return i*e*3/r.components*r.byteLength;case Kt:return i*e*4/r.components*r.byteLength;case Za:return i*e*4/r.components*r.byteLength;case Gr:case Vr:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case kr:case Hr:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case ra:case aa:return Math.max(i,16)*Math.max(e,8)/4;case ia:case sa:return Math.max(i,8)*Math.max(e,8)/2;case oa:case ca:case ua:case ha:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*8;case la:case fa:case da:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case pa:return Math.floor((i+3)/4)*Math.floor((e+3)/4)*16;case ma:return Math.floor((i+4)/5)*Math.floor((e+3)/4)*16;case ga:return Math.floor((i+4)/5)*Math.floor((e+4)/5)*16;case _a:return Math.floor((i+5)/6)*Math.floor((e+4)/5)*16;case xa:return Math.floor((i+5)/6)*Math.floor((e+5)/6)*16;case va:return Math.floor((i+7)/8)*Math.floor((e+4)/5)*16;case Ma:return Math.floor((i+7)/8)*Math.floor((e+5)/6)*16;case Sa:return Math.floor((i+7)/8)*Math.floor((e+7)/8)*16;case Ea:return Math.floor((i+9)/10)*Math.floor((e+4)/5)*16;case ya:return Math.floor((i+9)/10)*Math.floor((e+5)/6)*16;case ba:return Math.floor((i+9)/10)*Math.floor((e+7)/8)*16;case Ta:return Math.floor((i+9)/10)*Math.floor((e+9)/10)*16;case Aa:return Math.floor((i+11)/12)*Math.floor((e+9)/10)*16;case wa:return Math.floor((i+11)/12)*Math.floor((e+11)/12)*16;case Ra:case Ca:case Pa:return Math.ceil(i/4)*Math.ceil(e/4)*16;case Da:case La:return Math.ceil(i/4)*Math.ceil(e/4)*8;case Ia:case Ua:return Math.ceil(i/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function $h(i){switch(i){case Ot:case qc:return{byteLength:1,components:1};case er:case Yc:case vn:return{byteLength:2,components:1};case Xa:case qa:return{byteLength:2,components:4};case sn:case Wa:case Yt:return{byteLength:4,components:1};case Kc:case $c:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Ha}}));typeof window<"u"&&(window.__THREE__?De("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Ha);function _l(){let i=null,e=!1,t=null,n=null;function r(s,a){t(s,a),n=i.requestAnimationFrame(r)}return{start:function(){e!==!0&&t!==null&&(n=i.requestAnimationFrame(r),e=!0)},stop:function(){i.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(s){t=s},setContext:function(s){i=s}}}function Zh(i){const e=new WeakMap;function t(o,l){const c=o.array,h=o.usage,p=c.byteLength,u=i.createBuffer();i.bindBuffer(l,u),i.bufferData(l,c,h),o.onUploadCallback();let m;if(c instanceof Float32Array)m=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)m=i.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?m=i.HALF_FLOAT:m=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)m=i.SHORT;else if(c instanceof Uint32Array)m=i.UNSIGNED_INT;else if(c instanceof Int32Array)m=i.INT;else if(c instanceof Int8Array)m=i.BYTE;else if(c instanceof Uint8Array)m=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)m=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:u,type:m,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:p}}function n(o,l,c){const h=l.array,p=l.updateRanges;if(i.bindBuffer(c,o),p.length===0)i.bufferSubData(c,0,h);else{p.sort((m,_)=>m.start-_.start);let u=0;for(let m=1;m<p.length;m++){const _=p[u],M=p[m];M.start<=_.start+_.count+1?_.count=Math.max(_.count,M.start+M.count-_.start):(++u,p[u]=M)}p.length=u+1;for(let m=0,_=p.length;m<_;m++){const M=p[m];i.bufferSubData(c,M.start*h.BYTES_PER_ELEMENT,h,M.start,M.count)}l.clearUpdateRanges()}l.onUploadCallback()}function r(o){return o.isInterleavedBufferAttribute&&(o=o.data),e.get(o)}function s(o){o.isInterleavedBufferAttribute&&(o=o.data);const l=e.get(o);l&&(i.deleteBuffer(l.buffer),e.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){const h=e.get(o);(!h||h.version<o.version)&&e.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}const c=e.get(o);if(c===void 0)e.set(o,t(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,o,l),c.version=o.version}}return{get:r,remove:s,update:a}}var jh=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Jh=`#ifdef USE_ALPHAHASH
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
#endif`,Qh=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,ef=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,tf=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,nf=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,rf=`#ifdef USE_AOMAP
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
#endif`,sf=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,af=`#ifdef USE_BATCHING
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
#endif`,of=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,cf=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,lf=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,uf=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,hf=`#ifdef USE_IRIDESCENCE
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
#endif`,ff=`#ifdef USE_BUMPMAP
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
#endif`,df=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,pf=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,mf=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,gf=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,_f=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,xf=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,vf=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,Mf=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
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
#endif`,Sf=`#define PI 3.141592653589793
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
} // validated`,Ef=`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,yf=`vec3 transformedNormal = objectNormal;
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
#endif`,bf=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Tf=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Af=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,wf=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Rf="gl_FragColor = linearToOutputTexel( gl_FragColor );",Cf=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Pf=`#ifdef USE_ENVMAP
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
#endif`,Df=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,Lf=`#ifdef USE_ENVMAP
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
#endif`,If=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Uf=`#ifdef USE_ENVMAP
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
#endif`,Nf=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Ff=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Of=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Bf=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,zf=`#ifdef USE_GRADIENTMAP
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
}`,Gf=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Vf=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,kf=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Hf=`uniform bool receiveShadow;
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
#endif`,Wf=`#ifdef USE_ENVMAP
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
#endif`,Xf=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,qf=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Yf=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Kf=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,$f=`PhysicalMaterial material;
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
#endif`,Zf=`uniform sampler2D dfgLUT;
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
}`,jf=`
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
#endif`,Jf=`#if defined( RE_IndirectDiffuse )
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
#endif`,Qf=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,ed=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,td=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,nd=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,id=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,rd=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,sd=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,ad=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,od=`#if defined( USE_POINTS_UV )
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
#endif`,cd=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,ld=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,ud=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,hd=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,fd=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,dd=`#ifdef USE_MORPHTARGETS
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
#endif`,pd=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,md=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
vec3 nonPerturbedNormal = normal;`,gd=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
#endif`,_d=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,xd=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,vd=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,Md=`#ifdef USE_NORMALMAP
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
#endif`,Sd=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Ed=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,yd=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,bd=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Td=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Ad=`vec3 packNormalToRGB( const in vec3 normal ) {
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
}`,wd=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Rd=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Cd=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Pd=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Dd=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Ld=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Id=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,Ud=`#if NUM_SPOT_LIGHT_COORDS > 0
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
#endif`,Nd=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
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
#endif`,Fd=`float getShadowMask() {
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
}`,Od=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,Bd=`#ifdef USE_SKINNING
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
#endif`,zd=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,Gd=`#ifdef USE_SKINNING
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
#endif`,Vd=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,kd=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Hd=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Wd=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,Xd=`#ifdef USE_TRANSMISSION
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
#endif`,qd=`#ifdef USE_TRANSMISSION
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
#endif`,Yd=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Kd=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,$d=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Zd=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const jd=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Jd=`uniform sampler2D t2D;
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
}`,Qd=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,ep=`#ifdef ENVMAP_TYPE_CUBE
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
}`,tp=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,np=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,ip=`#include <common>
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
}`,rp=`#if DEPTH_PACKING == 3200
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
}`,sp=`#define DISTANCE
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
}`,ap=`#define DISTANCE
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
}`,op=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,cp=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,lp=`uniform float scale;
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
}`,up=`uniform vec3 diffuse;
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
}`,hp=`#include <common>
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
}`,fp=`uniform vec3 diffuse;
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
}`,dp=`#define LAMBERT
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
}`,pp=`#define LAMBERT
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
}`,mp=`#define MATCAP
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
}`,gp=`#define MATCAP
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
}`,_p=`#define NORMAL
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
}`,xp=`#define NORMAL
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
}`,vp=`#define PHONG
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
}`,Mp=`#define PHONG
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
}`,Sp=`#define STANDARD
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
}`,Ep=`#define STANDARD
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
}`,yp=`#define TOON
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
}`,bp=`#define TOON
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
}`,Tp=`uniform float size;
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
}`,Ap=`uniform vec3 diffuse;
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
}`,wp=`#include <common>
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
}`,Rp=`uniform vec3 color;
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
}`,Cp=`uniform float rotation;
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
}`,Pp=`uniform vec3 diffuse;
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
}`,Oe={alphahash_fragment:jh,alphahash_pars_fragment:Jh,alphamap_fragment:Qh,alphamap_pars_fragment:ef,alphatest_fragment:tf,alphatest_pars_fragment:nf,aomap_fragment:rf,aomap_pars_fragment:sf,batching_pars_vertex:af,batching_vertex:of,begin_vertex:cf,beginnormal_vertex:lf,bsdfs:uf,iridescence_fragment:hf,bumpmap_pars_fragment:ff,clipping_planes_fragment:df,clipping_planes_pars_fragment:pf,clipping_planes_pars_vertex:mf,clipping_planes_vertex:gf,color_fragment:_f,color_pars_fragment:xf,color_pars_vertex:vf,color_vertex:Mf,common:Sf,cube_uv_reflection_fragment:Ef,defaultnormal_vertex:yf,displacementmap_pars_vertex:bf,displacementmap_vertex:Tf,emissivemap_fragment:Af,emissivemap_pars_fragment:wf,colorspace_fragment:Rf,colorspace_pars_fragment:Cf,envmap_fragment:Pf,envmap_common_pars_fragment:Df,envmap_pars_fragment:Lf,envmap_pars_vertex:If,envmap_physical_pars_fragment:Wf,envmap_vertex:Uf,fog_vertex:Nf,fog_pars_vertex:Ff,fog_fragment:Of,fog_pars_fragment:Bf,gradientmap_pars_fragment:zf,lightmap_pars_fragment:Gf,lights_lambert_fragment:Vf,lights_lambert_pars_fragment:kf,lights_pars_begin:Hf,lights_toon_fragment:Xf,lights_toon_pars_fragment:qf,lights_phong_fragment:Yf,lights_phong_pars_fragment:Kf,lights_physical_fragment:$f,lights_physical_pars_fragment:Zf,lights_fragment_begin:jf,lights_fragment_maps:Jf,lights_fragment_end:Qf,logdepthbuf_fragment:ed,logdepthbuf_pars_fragment:td,logdepthbuf_pars_vertex:nd,logdepthbuf_vertex:id,map_fragment:rd,map_pars_fragment:sd,map_particle_fragment:ad,map_particle_pars_fragment:od,metalnessmap_fragment:cd,metalnessmap_pars_fragment:ld,morphinstance_vertex:ud,morphcolor_vertex:hd,morphnormal_vertex:fd,morphtarget_pars_vertex:dd,morphtarget_vertex:pd,normal_fragment_begin:md,normal_fragment_maps:gd,normal_pars_fragment:_d,normal_pars_vertex:xd,normal_vertex:vd,normalmap_pars_fragment:Md,clearcoat_normal_fragment_begin:Sd,clearcoat_normal_fragment_maps:Ed,clearcoat_pars_fragment:yd,iridescence_pars_fragment:bd,opaque_fragment:Td,packing:Ad,premultiplied_alpha_fragment:wd,project_vertex:Rd,dithering_fragment:Cd,dithering_pars_fragment:Pd,roughnessmap_fragment:Dd,roughnessmap_pars_fragment:Ld,shadowmap_pars_fragment:Id,shadowmap_pars_vertex:Ud,shadowmap_vertex:Nd,shadowmask_pars_fragment:Fd,skinbase_vertex:Od,skinning_pars_vertex:Bd,skinning_vertex:zd,skinnormal_vertex:Gd,specularmap_fragment:Vd,specularmap_pars_fragment:kd,tonemapping_fragment:Hd,tonemapping_pars_fragment:Wd,transmission_fragment:Xd,transmission_pars_fragment:qd,uv_pars_fragment:Yd,uv_pars_vertex:Kd,uv_vertex:$d,worldpos_vertex:Zd,background_vert:jd,background_frag:Jd,backgroundCube_vert:Qd,backgroundCube_frag:ep,cube_vert:tp,cube_frag:np,depth_vert:ip,depth_frag:rp,distance_vert:sp,distance_frag:ap,equirect_vert:op,equirect_frag:cp,linedashed_vert:lp,linedashed_frag:up,meshbasic_vert:hp,meshbasic_frag:fp,meshlambert_vert:dp,meshlambert_frag:pp,meshmatcap_vert:mp,meshmatcap_frag:gp,meshnormal_vert:_p,meshnormal_frag:xp,meshphong_vert:vp,meshphong_frag:Mp,meshphysical_vert:Sp,meshphysical_frag:Ep,meshtoon_vert:yp,meshtoon_frag:bp,points_vert:Tp,points_frag:Ap,shadow_vert:wp,shadow_frag:Rp,sprite_vert:Cp,sprite_frag:Pp},ue={common:{diffuse:{value:new Ne(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ue},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ue}},envmap:{envMap:{value:null},envMapRotation:{value:new Ue},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ue}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ue}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ue},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ue},normalScale:{value:new Fe(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ue},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ue}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ue}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ue}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Ne(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Ne(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0},uvTransform:{value:new Ue}},sprite:{diffuse:{value:new Ne(16777215)},opacity:{value:1},center:{value:new Fe(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ue},alphaMap:{value:null},alphaMapTransform:{value:new Ue},alphaTest:{value:0}}},Qt={basic:{uniforms:Pt([ue.common,ue.specularmap,ue.envmap,ue.aomap,ue.lightmap,ue.fog]),vertexShader:Oe.meshbasic_vert,fragmentShader:Oe.meshbasic_frag},lambert:{uniforms:Pt([ue.common,ue.specularmap,ue.envmap,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.fog,ue.lights,{emissive:{value:new Ne(0)},envMapIntensity:{value:1}}]),vertexShader:Oe.meshlambert_vert,fragmentShader:Oe.meshlambert_frag},phong:{uniforms:Pt([ue.common,ue.specularmap,ue.envmap,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.fog,ue.lights,{emissive:{value:new Ne(0)},specular:{value:new Ne(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Oe.meshphong_vert,fragmentShader:Oe.meshphong_frag},standard:{uniforms:Pt([ue.common,ue.envmap,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.roughnessmap,ue.metalnessmap,ue.fog,ue.lights,{emissive:{value:new Ne(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Oe.meshphysical_vert,fragmentShader:Oe.meshphysical_frag},toon:{uniforms:Pt([ue.common,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.gradientmap,ue.fog,ue.lights,{emissive:{value:new Ne(0)}}]),vertexShader:Oe.meshtoon_vert,fragmentShader:Oe.meshtoon_frag},matcap:{uniforms:Pt([ue.common,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.fog,{matcap:{value:null}}]),vertexShader:Oe.meshmatcap_vert,fragmentShader:Oe.meshmatcap_frag},points:{uniforms:Pt([ue.points,ue.fog]),vertexShader:Oe.points_vert,fragmentShader:Oe.points_frag},dashed:{uniforms:Pt([ue.common,ue.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Oe.linedashed_vert,fragmentShader:Oe.linedashed_frag},depth:{uniforms:Pt([ue.common,ue.displacementmap]),vertexShader:Oe.depth_vert,fragmentShader:Oe.depth_frag},normal:{uniforms:Pt([ue.common,ue.bumpmap,ue.normalmap,ue.displacementmap,{opacity:{value:1}}]),vertexShader:Oe.meshnormal_vert,fragmentShader:Oe.meshnormal_frag},sprite:{uniforms:Pt([ue.sprite,ue.fog]),vertexShader:Oe.sprite_vert,fragmentShader:Oe.sprite_frag},background:{uniforms:{uvTransform:{value:new Ue},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Oe.background_vert,fragmentShader:Oe.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ue}},vertexShader:Oe.backgroundCube_vert,fragmentShader:Oe.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Oe.cube_vert,fragmentShader:Oe.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Oe.equirect_vert,fragmentShader:Oe.equirect_frag},distance:{uniforms:Pt([ue.common,ue.displacementmap,{referencePosition:{value:new B},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Oe.distance_vert,fragmentShader:Oe.distance_frag},shadow:{uniforms:Pt([ue.lights,ue.fog,{color:{value:new Ne(0)},opacity:{value:1}}]),vertexShader:Oe.shadow_vert,fragmentShader:Oe.shadow_frag}};Qt.physical={uniforms:Pt([Qt.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ue},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ue},clearcoatNormalScale:{value:new Fe(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ue},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ue},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ue},sheen:{value:0},sheenColor:{value:new Ne(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ue},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ue},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ue},transmissionSamplerSize:{value:new Fe},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ue},attenuationDistance:{value:0},attenuationColor:{value:new Ne(0)},specularColor:{value:new Ne(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ue},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ue},anisotropyVector:{value:new Fe},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ue}}]),vertexShader:Oe.meshphysical_vert,fragmentShader:Oe.meshphysical_frag};const Nr={r:0,b:0,g:0},Vn=new an,Dp=new Je;function Lp(i,e,t,n,r,s){const a=new Ne(0);let o=r===!0?0:1,l,c,h=null,p=0,u=null;function m(S){let T=S.isScene===!0?S.background:null;if(T&&T.isTexture){const y=S.backgroundBlurriness>0;T=e.get(T,y)}return T}function _(S){let T=!1;const y=m(S);y===null?d(a,o):y&&y.isColor&&(d(y,1),T=!0);const A=i.xr.getEnvironmentBlendMode();A==="additive"?t.buffers.color.setClear(0,0,0,1,s):A==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,s),(i.autoClear||T)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function M(S,T){const y=m(T);y&&(y.isCubeTexture||y.mapping===es)?(c===void 0&&(c=new Ve(new ot(1,1,1),new on({name:"BackgroundCubeMaterial",uniforms:Ni(Qt.backgroundCube.uniforms),vertexShader:Qt.backgroundCube.vertexShader,fragmentShader:Qt.backgroundCube.fragmentShader,side:Dt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(A,w,R){this.matrixWorld.copyPosition(R.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),Vn.copy(T.backgroundRotation),Vn.x*=-1,Vn.y*=-1,Vn.z*=-1,y.isCubeTexture&&y.isRenderTargetTexture===!1&&(Vn.y*=-1,Vn.z*=-1),c.material.uniforms.envMap.value=y,c.material.uniforms.flipEnvMap.value=y.isCubeTexture&&y.isRenderTargetTexture===!1?-1:1,c.material.uniforms.backgroundBlurriness.value=T.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=T.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(Dp.makeRotationFromEuler(Vn)),c.material.toneMapped=qe.getTransfer(y.colorSpace)!==je,(h!==y||p!==y.version||u!==i.toneMapping)&&(c.material.needsUpdate=!0,h=y,p=y.version,u=i.toneMapping),c.layers.enableAll(),S.unshift(c,c.geometry,c.material,0,0,null)):y&&y.isTexture&&(l===void 0&&(l=new Ve(new sr(2,2),new on({name:"BackgroundMaterial",uniforms:Ni(Qt.background.uniforms),vertexShader:Qt.background.vertexShader,fragmentShader:Qt.background.fragmentShader,side:Un,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=y,l.material.uniforms.backgroundIntensity.value=T.backgroundIntensity,l.material.toneMapped=qe.getTransfer(y.colorSpace)!==je,y.matrixAutoUpdate===!0&&y.updateMatrix(),l.material.uniforms.uvTransform.value.copy(y.matrix),(h!==y||p!==y.version||u!==i.toneMapping)&&(l.material.needsUpdate=!0,h=y,p=y.version,u=i.toneMapping),l.layers.enableAll(),S.unshift(l,l.geometry,l.material,0,0,null))}function d(S,T){S.getRGB(Nr,dl(i)),t.buffers.color.setClear(Nr.r,Nr.g,Nr.b,T,s)}function f(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(S,T=1){a.set(S),o=T,d(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(S){o=S,d(a,o)},render:_,addToRenderList:M,dispose:f}}function Ip(i,e){const t=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},r=u(null);let s=r,a=!1;function o(C,O,z,k,D){let I=!1;const N=p(C,k,z,O);s!==N&&(s=N,c(s.object)),I=m(C,k,z,D),I&&_(C,k,z,D),D!==null&&e.update(D,i.ELEMENT_ARRAY_BUFFER),(I||a)&&(a=!1,y(C,O,z,k),D!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,e.get(D).buffer))}function l(){return i.createVertexArray()}function c(C){return i.bindVertexArray(C)}function h(C){return i.deleteVertexArray(C)}function p(C,O,z,k){const D=k.wireframe===!0;let I=n[O.id];I===void 0&&(I={},n[O.id]=I);const N=C.isInstancedMesh===!0?C.id:0;let $=I[N];$===void 0&&($={},I[N]=$);let j=$[z.id];j===void 0&&(j={},$[z.id]=j);let Q=j[D];return Q===void 0&&(Q=u(l()),j[D]=Q),Q}function u(C){const O=[],z=[],k=[];for(let D=0;D<t;D++)O[D]=0,z[D]=0,k[D]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:O,enabledAttributes:z,attributeDivisors:k,object:C,attributes:{},index:null}}function m(C,O,z,k){const D=s.attributes,I=O.attributes;let N=0;const $=z.getAttributes();for(const j in $)if($[j].location>=0){const ae=D[j];let Z=I[j];if(Z===void 0&&(j==="instanceMatrix"&&C.instanceMatrix&&(Z=C.instanceMatrix),j==="instanceColor"&&C.instanceColor&&(Z=C.instanceColor)),ae===void 0||ae.attribute!==Z||Z&&ae.data!==Z.data)return!0;N++}return s.attributesNum!==N||s.index!==k}function _(C,O,z,k){const D={},I=O.attributes;let N=0;const $=z.getAttributes();for(const j in $)if($[j].location>=0){let ae=I[j];ae===void 0&&(j==="instanceMatrix"&&C.instanceMatrix&&(ae=C.instanceMatrix),j==="instanceColor"&&C.instanceColor&&(ae=C.instanceColor));const Z={};Z.attribute=ae,ae&&ae.data&&(Z.data=ae.data),D[j]=Z,N++}s.attributes=D,s.attributesNum=N,s.index=k}function M(){const C=s.newAttributes;for(let O=0,z=C.length;O<z;O++)C[O]=0}function d(C){f(C,0)}function f(C,O){const z=s.newAttributes,k=s.enabledAttributes,D=s.attributeDivisors;z[C]=1,k[C]===0&&(i.enableVertexAttribArray(C),k[C]=1),D[C]!==O&&(i.vertexAttribDivisor(C,O),D[C]=O)}function S(){const C=s.newAttributes,O=s.enabledAttributes;for(let z=0,k=O.length;z<k;z++)O[z]!==C[z]&&(i.disableVertexAttribArray(z),O[z]=0)}function T(C,O,z,k,D,I,N){N===!0?i.vertexAttribIPointer(C,O,z,D,I):i.vertexAttribPointer(C,O,z,k,D,I)}function y(C,O,z,k){M();const D=k.attributes,I=z.getAttributes(),N=O.defaultAttributeValues;for(const $ in I){const j=I[$];if(j.location>=0){let Q=D[$];if(Q===void 0&&($==="instanceMatrix"&&C.instanceMatrix&&(Q=C.instanceMatrix),$==="instanceColor"&&C.instanceColor&&(Q=C.instanceColor)),Q!==void 0){const ae=Q.normalized,Z=Q.itemSize,le=e.get(Q);if(le===void 0)continue;const Re=le.buffer,He=le.type,Y=le.bytesPerElement,ne=He===i.INT||He===i.UNSIGNED_INT||Q.gpuType===Wa;if(Q.isInterleavedBufferAttribute){const se=Q.data,Ie=se.stride,Ae=Q.offset;if(se.isInstancedInterleavedBuffer){for(let Ce=0;Ce<j.locationSize;Ce++)f(j.location+Ce,se.meshPerAttribute);C.isInstancedMesh!==!0&&k._maxInstanceCount===void 0&&(k._maxInstanceCount=se.meshPerAttribute*se.count)}else for(let Ce=0;Ce<j.locationSize;Ce++)d(j.location+Ce);i.bindBuffer(i.ARRAY_BUFFER,Re);for(let Ce=0;Ce<j.locationSize;Ce++)T(j.location+Ce,Z/j.locationSize,He,ae,Ie*Y,(Ae+Z/j.locationSize*Ce)*Y,ne)}else{if(Q.isInstancedBufferAttribute){for(let se=0;se<j.locationSize;se++)f(j.location+se,Q.meshPerAttribute);C.isInstancedMesh!==!0&&k._maxInstanceCount===void 0&&(k._maxInstanceCount=Q.meshPerAttribute*Q.count)}else for(let se=0;se<j.locationSize;se++)d(j.location+se);i.bindBuffer(i.ARRAY_BUFFER,Re);for(let se=0;se<j.locationSize;se++)T(j.location+se,Z/j.locationSize,He,ae,Z*Y,Z/j.locationSize*se*Y,ne)}}else if(N!==void 0){const ae=N[$];if(ae!==void 0)switch(ae.length){case 2:i.vertexAttrib2fv(j.location,ae);break;case 3:i.vertexAttrib3fv(j.location,ae);break;case 4:i.vertexAttrib4fv(j.location,ae);break;default:i.vertexAttrib1fv(j.location,ae)}}}}S()}function A(){E();for(const C in n){const O=n[C];for(const z in O){const k=O[z];for(const D in k){const I=k[D];for(const N in I)h(I[N].object),delete I[N];delete k[D]}}delete n[C]}}function w(C){if(n[C.id]===void 0)return;const O=n[C.id];for(const z in O){const k=O[z];for(const D in k){const I=k[D];for(const N in I)h(I[N].object),delete I[N];delete k[D]}}delete n[C.id]}function R(C){for(const O in n){const z=n[O];for(const k in z){const D=z[k];if(D[C.id]===void 0)continue;const I=D[C.id];for(const N in I)h(I[N].object),delete I[N];delete D[C.id]}}}function x(C){for(const O in n){const z=n[O],k=C.isInstancedMesh===!0?C.id:0,D=z[k];if(D!==void 0){for(const I in D){const N=D[I];for(const $ in N)h(N[$].object),delete N[$];delete D[I]}delete z[k],Object.keys(z).length===0&&delete n[O]}}}function E(){H(),a=!0,s!==r&&(s=r,c(s.object))}function H(){r.geometry=null,r.program=null,r.wireframe=!1}return{setup:o,reset:E,resetDefaultState:H,dispose:A,releaseStatesOfGeometry:w,releaseStatesOfObject:x,releaseStatesOfProgram:R,initAttributes:M,enableAttribute:d,disableUnusedAttributes:S}}function Up(i,e,t){let n;function r(c){n=c}function s(c,h){i.drawArrays(n,c,h),t.update(h,n,1)}function a(c,h,p){p!==0&&(i.drawArraysInstanced(n,c,h,p),t.update(h,n,p))}function o(c,h,p){if(p===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,c,0,h,0,p);let m=0;for(let _=0;_<p;_++)m+=h[_];t.update(m,n,1)}function l(c,h,p,u){if(p===0)return;const m=e.get("WEBGL_multi_draw");if(m===null)for(let _=0;_<c.length;_++)a(c[_],h[_],u[_]);else{m.multiDrawArraysInstancedWEBGL(n,c,0,h,0,u,0,p);let _=0;for(let M=0;M<p;M++)_+=h[M]*u[M];t.update(_,n,1)}}this.setMode=r,this.render=s,this.renderInstances=a,this.renderMultiDraw=o,this.renderMultiDrawInstances=l}function Np(i,e,t,n){let r;function s(){if(r!==void 0)return r;if(e.has("EXT_texture_filter_anisotropic")===!0){const R=e.get("EXT_texture_filter_anisotropic");r=i.getParameter(R.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else r=0;return r}function a(R){return!(R!==Kt&&n.convert(R)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(R){const x=R===vn&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(R!==Ot&&n.convert(R)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&R!==Yt&&!x)}function l(R){if(R==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";R="mediump"}return R==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=t.precision!==void 0?t.precision:"highp";const h=l(c);h!==c&&(De("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);const p=t.logarithmicDepthBuffer===!0,u=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control"),m=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),_=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),M=i.getParameter(i.MAX_TEXTURE_SIZE),d=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),f=i.getParameter(i.MAX_VERTEX_ATTRIBS),S=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),T=i.getParameter(i.MAX_VARYING_VECTORS),y=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),A=i.getParameter(i.MAX_SAMPLES),w=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:s,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:p,reversedDepthBuffer:u,maxTextures:m,maxVertexTextures:_,maxTextureSize:M,maxCubemapSize:d,maxAttributes:f,maxVertexUniforms:S,maxVaryings:T,maxFragmentUniforms:y,maxSamples:A,samples:w}}function Fp(i){const e=this;let t=null,n=0,r=!1,s=!1;const a=new Xn,o=new Ue,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(p,u){const m=p.length!==0||u||n!==0||r;return r=u,n=p.length,m},this.beginShadows=function(){s=!0,h(null)},this.endShadows=function(){s=!1},this.setGlobalState=function(p,u){t=h(p,u,0)},this.setState=function(p,u,m){const _=p.clippingPlanes,M=p.clipIntersection,d=p.clipShadows,f=i.get(p);if(!r||_===null||_.length===0||s&&!d)s?h(null):c();else{const S=s?0:n,T=S*4;let y=f.clippingState||null;l.value=y,y=h(_,u,T,m);for(let A=0;A!==T;++A)y[A]=t[A];f.clippingState=y,this.numIntersection=M?this.numPlanes:0,this.numPlanes+=S}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function h(p,u,m,_){const M=p!==null?p.length:0;let d=null;if(M!==0){if(d=l.value,_!==!0||d===null){const f=m+M*4,S=u.matrixWorldInverse;o.getNormalMatrix(S),(d===null||d.length<f)&&(d=new Float32Array(f));for(let T=0,y=m;T!==M;++T,y+=4)a.copy(p[T]).applyMatrix4(S,o),a.normal.toArray(d,y),d[y+3]=a.constant}l.value=d,l.needsUpdate=!0}return e.numPlanes=M,e.numIntersection=0,d}}const Ln=4,Qo=[.125,.215,.35,.446,.526,.582],Yn=20,Op=256,Ki=new ao,ec=new Ne;let Ns=null,Fs=0,Os=0,Bs=!1;const Bp=new B;class tc{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,r=100,s={}){const{size:a=256,position:o=Bp}=s;Ns=this._renderer.getRenderTarget(),Fs=this._renderer.getActiveCubeFace(),Os=this._renderer.getActiveMipmapLevel(),Bs=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(e,n,r,l,o),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=rc(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=ic(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Ns,Fs,Os),this._renderer.xr.enabled=Bs,e.scissorTest=!1,Ei(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===Jn||e.mapping===Di?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Ns=this._renderer.getRenderTarget(),Fs=this._renderer.getActiveCubeFace(),Os=this._renderer.getActiveMipmapLevel(),Bs=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:wt,minFilter:wt,generateMipmaps:!1,type:vn,format:Kt,colorSpace:Ii,depthBuffer:!1},r=nc(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=nc(e,t,n);const{_lodMax:s}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=zp(s)),this._blurMaterial=Vp(s,e,t),this._ggxMaterial=Gp(s,e,t)}return r}_compileMaterial(e){const t=new Ve(new yt,e);this._renderer.compile(t,Ki)}_sceneToCubeUV(e,t,n,r,s){const l=new Ft(90,1,t,n),c=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],p=this._renderer,u=p.autoClear,m=p.toneMapping;p.getClearColor(ec),p.toneMapping=nn,p.autoClear=!1,p.state.buffers.depth.getReversed()&&(p.setRenderTarget(r),p.clearDepth(),p.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new Ve(new ot,new cl({name:"PMREM.Background",side:Dt,depthWrite:!1,depthTest:!1})));const M=this._backgroundBox,d=M.material;let f=!1;const S=e.background;S?S.isColor&&(d.color.copy(S),e.background=null,f=!0):(d.color.copy(ec),f=!0);for(let T=0;T<6;T++){const y=T%3;y===0?(l.up.set(0,c[T],0),l.position.set(s.x,s.y,s.z),l.lookAt(s.x+h[T],s.y,s.z)):y===1?(l.up.set(0,0,c[T]),l.position.set(s.x,s.y,s.z),l.lookAt(s.x,s.y+h[T],s.z)):(l.up.set(0,c[T],0),l.position.set(s.x,s.y,s.z),l.lookAt(s.x,s.y,s.z+h[T]));const A=this._cubeSize;Ei(r,y*A,T>2?A:0,A,A),p.setRenderTarget(r),f&&p.render(M,l),p.render(e,l)}p.toneMapping=m,p.autoClear=u,e.background=S}_textureToCubeUV(e,t){const n=this._renderer,r=e.mapping===Jn||e.mapping===Di;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=rc()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=ic());const s=r?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=s;const o=s.uniforms;o.envMap.value=e;const l=this._cubeSize;Ei(t,0,0,3*l,2*l),n.setRenderTarget(t),n.render(a,Ki)}_applyPMREM(e){const t=this._renderer,n=t.autoClear;t.autoClear=!1;const r=this._lodMeshes.length;for(let s=1;s<r;s++)this._applyGGXFilter(e,s-1,s);t.autoClear=n}_applyGGXFilter(e,t,n){const r=this._renderer,s=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;const l=a.uniforms,c=n/(this._lodMeshes.length-1),h=t/(this._lodMeshes.length-1),p=Math.sqrt(c*c-h*h),u=0+c*1.25,m=p*u,{_lodMax:_}=this,M=this._sizeLods[n],d=3*M*(n>_-Ln?n-_+Ln:0),f=4*(this._cubeSize-M);l.envMap.value=e.texture,l.roughness.value=m,l.mipInt.value=_-t,Ei(s,d,f,3*M,2*M),r.setRenderTarget(s),r.render(o,Ki),l.envMap.value=s.texture,l.roughness.value=0,l.mipInt.value=_-n,Ei(e,d,f,3*M,2*M),r.setRenderTarget(e),r.render(o,Ki)}_blur(e,t,n,r,s){const a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,r,"latitudinal",s),this._halfBlur(a,e,n,n,r,"longitudinal",s)}_halfBlur(e,t,n,r,s,a,o){const l=this._renderer,c=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&Xe("blur direction must be either latitudinal or longitudinal!");const h=3,p=this._lodMeshes[r];p.material=c;const u=c.uniforms,m=this._sizeLods[n]-1,_=isFinite(s)?Math.PI/(2*m):2*Math.PI/(2*Yn-1),M=s/_,d=isFinite(s)?1+Math.floor(h*M):Yn;d>Yn&&De(`sigmaRadians, ${s}, is too large and will clip, as it requested ${d} samples when the maximum is set to ${Yn}`);const f=[];let S=0;for(let R=0;R<Yn;++R){const x=R/M,E=Math.exp(-x*x/2);f.push(E),R===0?S+=E:R<d&&(S+=2*E)}for(let R=0;R<f.length;R++)f[R]=f[R]/S;u.envMap.value=e.texture,u.samples.value=d,u.weights.value=f,u.latitudinal.value=a==="latitudinal",o&&(u.poleAxis.value=o);const{_lodMax:T}=this;u.dTheta.value=_,u.mipInt.value=T-n;const y=this._sizeLods[r],A=3*y*(r>T-Ln?r-T+Ln:0),w=4*(this._cubeSize-y);Ei(t,A,w,3*y,2*y),l.setRenderTarget(t),l.render(p,Ki)}}function zp(i){const e=[],t=[],n=[];let r=i;const s=i-Ln+1+Qo.length;for(let a=0;a<s;a++){const o=Math.pow(2,r);e.push(o);let l=1/o;a>i-Ln?l=Qo[a-i+Ln-1]:a===0&&(l=0),t.push(l);const c=1/(o-2),h=-c,p=1+c,u=[h,h,p,h,p,p,h,h,p,p,h,p],m=6,_=6,M=3,d=2,f=1,S=new Float32Array(M*_*m),T=new Float32Array(d*_*m),y=new Float32Array(f*_*m);for(let w=0;w<m;w++){const R=w%3*2/3-1,x=w>2?0:-1,E=[R,x,0,R+2/3,x,0,R+2/3,x+1,0,R,x,0,R+2/3,x+1,0,R,x+1,0];S.set(E,M*_*w),T.set(u,d*_*w);const H=[w,w,w,w,w,w];y.set(H,f*_*w)}const A=new yt;A.setAttribute("position",new Bt(S,M)),A.setAttribute("uv",new Bt(T,d)),A.setAttribute("faceIndex",new Bt(y,f)),n.push(new Ve(A,null)),r>Ln&&r--}return{lodMeshes:n,sizeLods:e,sigmas:t}}function nc(i,e,t){const n=new rn(i,e,t);return n.texture.mapping=es,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Ei(i,e,t,n,r){i.viewport.set(e,t,n,r),i.scissor.set(e,t,n,r)}function Gp(i,e,t){return new on({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:Op,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:ts(),fragmentShader:`

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
		`,blending:_n,depthTest:!1,depthWrite:!1})}function Vp(i,e,t){const n=new Float32Array(Yn),r=new B(0,1,0);return new on({name:"SphericalGaussianBlur",defines:{n:Yn,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:r}},vertexShader:ts(),fragmentShader:`

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
		`,blending:_n,depthTest:!1,depthWrite:!1})}function ic(){return new on({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:ts(),fragmentShader:`

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
		`,blending:_n,depthTest:!1,depthWrite:!1})}function rc(){return new on({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:ts(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:_n,depthTest:!1,depthWrite:!1})}function ts(){return`

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
	`}class xl extends rn{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const n={width:e,height:e,depth:1},r=[n,n,n,n,n,n];this.texture=new hl(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},r=new ot(5,5,5),s=new on({name:"CubemapFromEquirect",uniforms:Ni(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Dt,blending:_n});s.uniforms.tEquirect.value=t;const a=new Ve(r,s),o=t.minFilter;return t.minFilter===$n&&(t.minFilter=wt),new Yh(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,r=!0){const s=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,n,r);e.setRenderTarget(s)}}function kp(i){let e=new WeakMap,t=new WeakMap,n=null;function r(u,m=!1){return u==null?null:m?a(u):s(u)}function s(u){if(u&&u.isTexture){const m=u.mapping;if(m===as||m===os)if(e.has(u)){const _=e.get(u).texture;return o(_,u.mapping)}else{const _=u.image;if(_&&_.height>0){const M=new xl(_.height);return M.fromEquirectangularTexture(i,u),e.set(u,M),u.addEventListener("dispose",c),o(M.texture,u.mapping)}else return null}}return u}function a(u){if(u&&u.isTexture){const m=u.mapping,_=m===as||m===os,M=m===Jn||m===Di;if(_||M){let d=t.get(u);const f=d!==void 0?d.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==f)return n===null&&(n=new tc(i)),d=_?n.fromEquirectangular(u,d):n.fromCubemap(u,d),d.texture.pmremVersion=u.pmremVersion,t.set(u,d),d.texture;if(d!==void 0)return d.texture;{const S=u.image;return _&&S&&S.height>0||M&&S&&l(S)?(n===null&&(n=new tc(i)),d=_?n.fromEquirectangular(u):n.fromCubemap(u),d.texture.pmremVersion=u.pmremVersion,t.set(u,d),u.addEventListener("dispose",h),d.texture):null}}}return u}function o(u,m){return m===as?u.mapping=Jn:m===os&&(u.mapping=Di),u}function l(u){let m=0;const _=6;for(let M=0;M<_;M++)u[M]!==void 0&&m++;return m===_}function c(u){const m=u.target;m.removeEventListener("dispose",c);const _=e.get(m);_!==void 0&&(e.delete(m),_.dispose())}function h(u){const m=u.target;m.removeEventListener("dispose",h);const _=t.get(m);_!==void 0&&(t.delete(m),_.dispose())}function p(){e=new WeakMap,t=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:r,dispose:p}}function Hp(i){const e={};function t(n){if(e[n]!==void 0)return e[n];const r=i.getExtension(n);return e[n]=r,r}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){const r=t(n);return r===null&&Zr("WebGLRenderer: "+n+" extension not supported."),r}}}function Wp(i,e,t,n){const r={},s=new WeakMap;function a(p){const u=p.target;u.index!==null&&e.remove(u.index);for(const _ in u.attributes)e.remove(u.attributes[_]);u.removeEventListener("dispose",a),delete r[u.id];const m=s.get(u);m&&(e.remove(m),s.delete(u)),n.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,t.memory.geometries--}function o(p,u){return r[u.id]===!0||(u.addEventListener("dispose",a),r[u.id]=!0,t.memory.geometries++),u}function l(p){const u=p.attributes;for(const m in u)e.update(u[m],i.ARRAY_BUFFER)}function c(p){const u=[],m=p.index,_=p.attributes.position;let M=0;if(_===void 0)return;if(m!==null){const S=m.array;M=m.version;for(let T=0,y=S.length;T<y;T+=3){const A=S[T+0],w=S[T+1],R=S[T+2];u.push(A,w,w,R,R,A)}}else{const S=_.array;M=_.version;for(let T=0,y=S.length/3-1;T<y;T+=3){const A=T+0,w=T+1,R=T+2;u.push(A,w,w,R,R,A)}}const d=new(_.count>=65535?rl:il)(u,1);d.version=M;const f=s.get(p);f&&e.remove(f),s.set(p,d)}function h(p){const u=s.get(p);if(u){const m=p.index;m!==null&&u.version<m.version&&c(p)}else c(p);return s.get(p)}return{get:o,update:l,getWireframeAttribute:h}}function Xp(i,e,t){let n;function r(u){n=u}let s,a;function o(u){s=u.type,a=u.bytesPerElement}function l(u,m){i.drawElements(n,m,s,u*a),t.update(m,n,1)}function c(u,m,_){_!==0&&(i.drawElementsInstanced(n,m,s,u*a,_),t.update(m,n,_))}function h(u,m,_){if(_===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,m,0,s,u,0,_);let d=0;for(let f=0;f<_;f++)d+=m[f];t.update(d,n,1)}function p(u,m,_,M){if(_===0)return;const d=e.get("WEBGL_multi_draw");if(d===null)for(let f=0;f<u.length;f++)c(u[f]/a,m[f],M[f]);else{d.multiDrawElementsInstancedWEBGL(n,m,0,s,u,0,M,0,_);let f=0;for(let S=0;S<_;S++)f+=m[S]*M[S];t.update(f,n,1)}}this.setMode=r,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=h,this.renderMultiDrawInstances=p}function qp(i){const e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(s,a,o){switch(t.calls++,a){case i.TRIANGLES:t.triangles+=o*(s/3);break;case i.LINES:t.lines+=o*(s/2);break;case i.LINE_STRIP:t.lines+=o*(s-1);break;case i.LINE_LOOP:t.lines+=o*s;break;case i.POINTS:t.points+=o*s;break;default:Xe("WebGLInfo: Unknown draw mode:",a);break}}function r(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:r,update:n}}function Yp(i,e,t){const n=new WeakMap,r=new ut;function s(a,o,l){const c=a.morphTargetInfluences,h=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,p=h!==void 0?h.length:0;let u=n.get(o);if(u===void 0||u.count!==p){let H=function(){x.dispose(),n.delete(o),o.removeEventListener("dispose",H)};var m=H;u!==void 0&&u.texture.dispose();const _=o.morphAttributes.position!==void 0,M=o.morphAttributes.normal!==void 0,d=o.morphAttributes.color!==void 0,f=o.morphAttributes.position||[],S=o.morphAttributes.normal||[],T=o.morphAttributes.color||[];let y=0;_===!0&&(y=1),M===!0&&(y=2),d===!0&&(y=3);let A=o.attributes.position.count*y,w=1;A>e.maxTextureSize&&(w=Math.ceil(A/e.maxTextureSize),A=e.maxTextureSize);const R=new Float32Array(A*w*4*p),x=new el(R,A,w,p);x.type=Yt,x.needsUpdate=!0;const E=y*4;for(let C=0;C<p;C++){const O=f[C],z=S[C],k=T[C],D=A*w*4*C;for(let I=0;I<O.count;I++){const N=I*E;_===!0&&(r.fromBufferAttribute(O,I),R[D+N+0]=r.x,R[D+N+1]=r.y,R[D+N+2]=r.z,R[D+N+3]=0),M===!0&&(r.fromBufferAttribute(z,I),R[D+N+4]=r.x,R[D+N+5]=r.y,R[D+N+6]=r.z,R[D+N+7]=0),d===!0&&(r.fromBufferAttribute(k,I),R[D+N+8]=r.x,R[D+N+9]=r.y,R[D+N+10]=r.z,R[D+N+11]=k.itemSize===4?r.w:1)}}u={count:p,texture:x,size:new Fe(A,w)},n.set(o,u),o.addEventListener("dispose",H)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",a.morphTexture,t);else{let _=0;for(let d=0;d<c.length;d++)_+=c[d];const M=o.morphTargetsRelative?1:1-_;l.getUniforms().setValue(i,"morphTargetBaseInfluence",M),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",u.texture,t),l.getUniforms().setValue(i,"morphTargetsTextureSize",u.size)}return{update:s}}function Kp(i,e,t,n,r){let s=new WeakMap;function a(c){const h=r.render.frame,p=c.geometry,u=e.get(c,p);if(s.get(u)!==h&&(e.update(u),s.set(u,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),s.get(c)!==h&&(t.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,i.ARRAY_BUFFER),s.set(c,h))),c.isSkinnedMesh){const m=c.skeleton;s.get(m)!==h&&(m.update(),s.set(m,h))}return u}function o(){s=new WeakMap}function l(c){const h=c.target;h.removeEventListener("dispose",l),n.releaseStatesOfObject(h),t.remove(h.instanceMatrix),h.instanceColor!==null&&t.remove(h.instanceColor)}return{update:a,dispose:o}}const $p={[Bc]:"LINEAR_TONE_MAPPING",[zc]:"REINHARD_TONE_MAPPING",[Gc]:"CINEON_TONE_MAPPING",[Vc]:"ACES_FILMIC_TONE_MAPPING",[Hc]:"AGX_TONE_MAPPING",[Wc]:"NEUTRAL_TONE_MAPPING",[kc]:"CUSTOM_TONE_MAPPING"};function Zp(i,e,t,n,r){const s=new rn(e,t,{type:i,depthBuffer:n,stencilBuffer:r}),a=new rn(e,t,{type:vn,depthBuffer:!1,stencilBuffer:!1}),o=new yt;o.setAttribute("position",new ct([-1,3,0,-1,-1,0,3,-1,0],3)),o.setAttribute("uv",new ct([0,2,0,0,2,0],2));const l=new Gh({uniforms:{tDiffuse:{value:null}},vertexShader:`
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
			}`,depthTest:!1,depthWrite:!1}),c=new Ve(o,l),h=new ao(-1,1,1,-1,0,1);let p=null,u=null,m=!1,_,M=null,d=[],f=!1;this.setSize=function(S,T){s.setSize(S,T),a.setSize(S,T);for(let y=0;y<d.length;y++){const A=d[y];A.setSize&&A.setSize(S,T)}},this.setEffects=function(S){d=S,f=d.length>0&&d[0].isRenderPass===!0;const T=s.width,y=s.height;for(let A=0;A<d.length;A++){const w=d[A];w.setSize&&w.setSize(T,y)}},this.begin=function(S,T){if(m||S.toneMapping===nn&&d.length===0)return!1;if(M=T,T!==null){const y=T.width,A=T.height;(s.width!==y||s.height!==A)&&this.setSize(y,A)}return f===!1&&S.setRenderTarget(s),_=S.toneMapping,S.toneMapping=nn,!0},this.hasRenderPass=function(){return f},this.end=function(S,T){S.toneMapping=_,m=!0;let y=s,A=a;for(let w=0;w<d.length;w++){const R=d[w];if(R.enabled!==!1&&(R.render(S,A,y,T),R.needsSwap!==!1)){const x=y;y=A,A=x}}if(p!==S.outputColorSpace||u!==S.toneMapping){p=S.outputColorSpace,u=S.toneMapping,l.defines={},qe.getTransfer(p)===je&&(l.defines.SRGB_TRANSFER="");const w=$p[u];w&&(l.defines[w]=""),l.needsUpdate=!0}l.uniforms.tDiffuse.value=y.texture,S.setRenderTarget(M),S.render(c,h),M=null,m=!1},this.isCompositing=function(){return m},this.dispose=function(){s.dispose(),a.dispose(),o.dispose(),l.dispose()}}const vl=new Rt,Ba=new ir(1,1),Ml=new el,Sl=new dh,El=new hl,sc=[],ac=[],oc=new Float32Array(16),cc=new Float32Array(9),lc=new Float32Array(4);function Bi(i,e,t){const n=i[0];if(n<=0||n>0)return i;const r=e*t;let s=sc[r];if(s===void 0&&(s=new Float32Array(r),sc[r]=s),e!==0){n.toArray(s,0);for(let a=1,o=0;a!==e;++a)o+=t,i[a].toArray(s,o)}return s}function gt(i,e){if(i.length!==e.length)return!1;for(let t=0,n=i.length;t<n;t++)if(i[t]!==e[t])return!1;return!0}function _t(i,e){for(let t=0,n=e.length;t<n;t++)i[t]=e[t]}function ns(i,e){let t=ac[e];t===void 0&&(t=new Int32Array(e),ac[e]=t);for(let n=0;n!==e;++n)t[n]=i.allocateTextureUnit();return t}function jp(i,e){const t=this.cache;t[0]!==e&&(i.uniform1f(this.addr,e),t[0]=e)}function Jp(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(gt(t,e))return;i.uniform2fv(this.addr,e),_t(t,e)}}function Qp(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(i.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(gt(t,e))return;i.uniform3fv(this.addr,e),_t(t,e)}}function em(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(gt(t,e))return;i.uniform4fv(this.addr,e),_t(t,e)}}function tm(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(gt(t,e))return;i.uniformMatrix2fv(this.addr,!1,e),_t(t,e)}else{if(gt(t,n))return;lc.set(n),i.uniformMatrix2fv(this.addr,!1,lc),_t(t,n)}}function nm(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(gt(t,e))return;i.uniformMatrix3fv(this.addr,!1,e),_t(t,e)}else{if(gt(t,n))return;cc.set(n),i.uniformMatrix3fv(this.addr,!1,cc),_t(t,n)}}function im(i,e){const t=this.cache,n=e.elements;if(n===void 0){if(gt(t,e))return;i.uniformMatrix4fv(this.addr,!1,e),_t(t,e)}else{if(gt(t,n))return;oc.set(n),i.uniformMatrix4fv(this.addr,!1,oc),_t(t,n)}}function rm(i,e){const t=this.cache;t[0]!==e&&(i.uniform1i(this.addr,e),t[0]=e)}function sm(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(gt(t,e))return;i.uniform2iv(this.addr,e),_t(t,e)}}function am(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(gt(t,e))return;i.uniform3iv(this.addr,e),_t(t,e)}}function om(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(gt(t,e))return;i.uniform4iv(this.addr,e),_t(t,e)}}function cm(i,e){const t=this.cache;t[0]!==e&&(i.uniform1ui(this.addr,e),t[0]=e)}function lm(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(i.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(gt(t,e))return;i.uniform2uiv(this.addr,e),_t(t,e)}}function um(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(i.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(gt(t,e))return;i.uniform3uiv(this.addr,e),_t(t,e)}}function hm(i,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(i.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(gt(t,e))return;i.uniform4uiv(this.addr,e),_t(t,e)}}function fm(i,e,t){const n=this.cache,r=t.allocateTextureUnit();n[0]!==r&&(i.uniform1i(this.addr,r),n[0]=r);let s;this.type===i.SAMPLER_2D_SHADOW?(Ba.compareFunction=t.isReversedDepthBuffer()?Ja:ja,s=Ba):s=vl,t.setTexture2D(e||s,r)}function dm(i,e,t){const n=this.cache,r=t.allocateTextureUnit();n[0]!==r&&(i.uniform1i(this.addr,r),n[0]=r),t.setTexture3D(e||Sl,r)}function pm(i,e,t){const n=this.cache,r=t.allocateTextureUnit();n[0]!==r&&(i.uniform1i(this.addr,r),n[0]=r),t.setTextureCube(e||El,r)}function mm(i,e,t){const n=this.cache,r=t.allocateTextureUnit();n[0]!==r&&(i.uniform1i(this.addr,r),n[0]=r),t.setTexture2DArray(e||Ml,r)}function gm(i){switch(i){case 5126:return jp;case 35664:return Jp;case 35665:return Qp;case 35666:return em;case 35674:return tm;case 35675:return nm;case 35676:return im;case 5124:case 35670:return rm;case 35667:case 35671:return sm;case 35668:case 35672:return am;case 35669:case 35673:return om;case 5125:return cm;case 36294:return lm;case 36295:return um;case 36296:return hm;case 35678:case 36198:case 36298:case 36306:case 35682:return fm;case 35679:case 36299:case 36307:return dm;case 35680:case 36300:case 36308:case 36293:return pm;case 36289:case 36303:case 36311:case 36292:return mm}}function _m(i,e){i.uniform1fv(this.addr,e)}function xm(i,e){const t=Bi(e,this.size,2);i.uniform2fv(this.addr,t)}function vm(i,e){const t=Bi(e,this.size,3);i.uniform3fv(this.addr,t)}function Mm(i,e){const t=Bi(e,this.size,4);i.uniform4fv(this.addr,t)}function Sm(i,e){const t=Bi(e,this.size,4);i.uniformMatrix2fv(this.addr,!1,t)}function Em(i,e){const t=Bi(e,this.size,9);i.uniformMatrix3fv(this.addr,!1,t)}function ym(i,e){const t=Bi(e,this.size,16);i.uniformMatrix4fv(this.addr,!1,t)}function bm(i,e){i.uniform1iv(this.addr,e)}function Tm(i,e){i.uniform2iv(this.addr,e)}function Am(i,e){i.uniform3iv(this.addr,e)}function wm(i,e){i.uniform4iv(this.addr,e)}function Rm(i,e){i.uniform1uiv(this.addr,e)}function Cm(i,e){i.uniform2uiv(this.addr,e)}function Pm(i,e){i.uniform3uiv(this.addr,e)}function Dm(i,e){i.uniform4uiv(this.addr,e)}function Lm(i,e,t){const n=this.cache,r=e.length,s=ns(t,r);gt(n,s)||(i.uniform1iv(this.addr,s),_t(n,s));let a;this.type===i.SAMPLER_2D_SHADOW?a=Ba:a=vl;for(let o=0;o!==r;++o)t.setTexture2D(e[o]||a,s[o])}function Im(i,e,t){const n=this.cache,r=e.length,s=ns(t,r);gt(n,s)||(i.uniform1iv(this.addr,s),_t(n,s));for(let a=0;a!==r;++a)t.setTexture3D(e[a]||Sl,s[a])}function Um(i,e,t){const n=this.cache,r=e.length,s=ns(t,r);gt(n,s)||(i.uniform1iv(this.addr,s),_t(n,s));for(let a=0;a!==r;++a)t.setTextureCube(e[a]||El,s[a])}function Nm(i,e,t){const n=this.cache,r=e.length,s=ns(t,r);gt(n,s)||(i.uniform1iv(this.addr,s),_t(n,s));for(let a=0;a!==r;++a)t.setTexture2DArray(e[a]||Ml,s[a])}function Fm(i){switch(i){case 5126:return _m;case 35664:return xm;case 35665:return vm;case 35666:return Mm;case 35674:return Sm;case 35675:return Em;case 35676:return ym;case 5124:case 35670:return bm;case 35667:case 35671:return Tm;case 35668:case 35672:return Am;case 35669:case 35673:return wm;case 5125:return Rm;case 36294:return Cm;case 36295:return Pm;case 36296:return Dm;case 35678:case 36198:case 36298:case 36306:case 35682:return Lm;case 35679:case 36299:case 36307:return Im;case 35680:case 36300:case 36308:case 36293:return Um;case 36289:case 36303:case 36311:case 36292:return Nm}}class Om{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=gm(t.type)}}class Bm{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Fm(t.type)}}class zm{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){const r=this.seq;for(let s=0,a=r.length;s!==a;++s){const o=r[s];o.setValue(e,t[o.id],n)}}}const zs=/(\w+)(\])?(\[|\.)?/g;function uc(i,e){i.seq.push(e),i.map[e.id]=e}function Gm(i,e,t){const n=i.name,r=n.length;for(zs.lastIndex=0;;){const s=zs.exec(n),a=zs.lastIndex;let o=s[1];const l=s[2]==="]",c=s[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===r){uc(t,c===void 0?new Om(o,i,e):new Bm(o,i,e));break}else{let p=t.map[o];p===void 0&&(p=new zm(o),uc(t,p)),t=p}}}class Wr{constructor(e,t){this.seq=[],this.map={};const n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){const o=e.getActiveUniform(t,a),l=e.getUniformLocation(t,o.name);Gm(o,l,this)}const r=[],s=[];for(const a of this.seq)a.type===e.SAMPLER_2D_SHADOW||a.type===e.SAMPLER_CUBE_SHADOW||a.type===e.SAMPLER_2D_ARRAY_SHADOW?r.push(a):s.push(a);r.length>0&&(this.seq=r.concat(s))}setValue(e,t,n,r){const s=this.map[t];s!==void 0&&s.setValue(e,n,r)}setOptional(e,t,n){const r=t[n];r!==void 0&&this.setValue(e,n,r)}static upload(e,t,n,r){for(let s=0,a=t.length;s!==a;++s){const o=t[s],l=n[o.id];l.needsUpdate!==!1&&o.setValue(e,l.value,r)}}static seqWithValue(e,t){const n=[];for(let r=0,s=e.length;r!==s;++r){const a=e[r];a.id in t&&n.push(a)}return n}}function hc(i,e,t){const n=i.createShader(e);return i.shaderSource(n,t),i.compileShader(n),n}const Vm=37297;let km=0;function Hm(i,e){const t=i.split(`
`),n=[],r=Math.max(e-6,0),s=Math.min(e+6,t.length);for(let a=r;a<s;a++){const o=a+1;n.push(`${o===e?">":" "} ${o}: ${t[a]}`)}return n.join(`
`)}const fc=new Ue;function Wm(i){qe._getMatrix(fc,qe.workingColorSpace,i);const e=`mat3( ${fc.elements.map(t=>t.toFixed(4))} )`;switch(qe.getTransfer(i)){case Yr:return[e,"LinearTransferOETF"];case je:return[e,"sRGBTransferOETF"];default:return De("WebGLProgram: Unsupported color space: ",i),[e,"LinearTransferOETF"]}}function dc(i,e,t){const n=i.getShaderParameter(e,i.COMPILE_STATUS),s=(i.getShaderInfoLog(e)||"").trim();if(n&&s==="")return"";const a=/ERROR: 0:(\d+)/.exec(s);if(a){const o=parseInt(a[1]);return t.toUpperCase()+`

`+s+`

`+Hm(i.getShaderSource(e),o)}else return s}function Xm(i,e){const t=Wm(e);return[`vec4 ${i}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}const qm={[Bc]:"Linear",[zc]:"Reinhard",[Gc]:"Cineon",[Vc]:"ACESFilmic",[Hc]:"AgX",[Wc]:"Neutral",[kc]:"Custom"};function Ym(i,e){const t=qm[e];return t===void 0?(De("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const Fr=new B;function Km(){qe.getLuminanceCoefficients(Fr);const i=Fr.x.toFixed(4),e=Fr.y.toFixed(4),t=Fr.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function $m(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Qi).join(`
`)}function Zm(i){const e=[];for(const t in i){const n=i[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function jm(i,e){const t={},n=i.getProgramParameter(e,i.ACTIVE_ATTRIBUTES);for(let r=0;r<n;r++){const s=i.getActiveAttrib(e,r),a=s.name;let o=1;s.type===i.FLOAT_MAT2&&(o=2),s.type===i.FLOAT_MAT3&&(o=3),s.type===i.FLOAT_MAT4&&(o=4),t[a]={type:s.type,location:i.getAttribLocation(e,a),locationSize:o}}return t}function Qi(i){return i!==""}function pc(i,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function mc(i,e){return i.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const Jm=/^[ \t]*#include +<([\w\d./]+)>/gm;function za(i){return i.replace(Jm,eg)}const Qm=new Map;function eg(i,e){let t=Oe[e];if(t===void 0){const n=Qm.get(e);if(n!==void 0)t=Oe[n],De('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("Can not resolve #include <"+e+">")}return za(t)}const tg=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function gc(i){return i.replace(tg,ng)}function ng(i,e,t,n){let r="";for(let s=parseInt(e);s<parseInt(t);s++)r+=n.replace(/\[\s*i\s*\]/g,"[ "+s+" ]").replace(/UNROLLED_LOOP_INDEX/g,s);return r}function _c(i){let e=`precision ${i.precision} float;
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
#define LOW_PRECISION`),e}const ig={[zr]:"SHADOWMAP_TYPE_PCF",[Ji]:"SHADOWMAP_TYPE_VSM"};function rg(i){return ig[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const sg={[Jn]:"ENVMAP_TYPE_CUBE",[Di]:"ENVMAP_TYPE_CUBE",[es]:"ENVMAP_TYPE_CUBE_UV"};function ag(i){return i.envMap===!1?"ENVMAP_TYPE_CUBE":sg[i.envMapMode]||"ENVMAP_TYPE_CUBE"}const og={[Di]:"ENVMAP_MODE_REFRACTION"};function cg(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":og[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}const lg={[Oc]:"ENVMAP_BLENDING_MULTIPLY",[qu]:"ENVMAP_BLENDING_MIX",[Yu]:"ENVMAP_BLENDING_ADD"};function ug(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":lg[i.combine]||"ENVMAP_BLENDING_NONE"}function hg(i){const e=i.envMapCubeUVHeight;if(e===null)return null;const t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:n,maxMip:t}}function fg(i,e,t,n){const r=i.getContext(),s=t.defines;let a=t.vertexShader,o=t.fragmentShader;const l=rg(t),c=ag(t),h=cg(t),p=ug(t),u=hg(t),m=$m(t),_=Zm(s),M=r.createProgram();let d,f,S=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(d=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_].filter(Qi).join(`
`),d.length>0&&(d+=`
`),f=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_].filter(Qi).join(`
`),f.length>0&&(f+=`
`)):(d=[_c(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Qi).join(`
`),f=[_c(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+h:"",t.envMap?"#define "+p:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==nn?"#define TONE_MAPPING":"",t.toneMapping!==nn?Oe.tonemapping_pars_fragment:"",t.toneMapping!==nn?Ym("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Oe.colorspace_pars_fragment,Xm("linearToOutputTexel",t.outputColorSpace),Km(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Qi).join(`
`)),a=za(a),a=pc(a,t),a=mc(a,t),o=za(o),o=pc(o,t),o=mc(o,t),a=gc(a),o=gc(o),t.isRawShaderMaterial!==!0&&(S=`#version 300 es
`,d=[m,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+d,f=["#define varying in",t.glslVersion===To?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===To?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+f);const T=S+d+a,y=S+f+o,A=hc(r,r.VERTEX_SHADER,T),w=hc(r,r.FRAGMENT_SHADER,y);r.attachShader(M,A),r.attachShader(M,w),t.index0AttributeName!==void 0?r.bindAttribLocation(M,0,t.index0AttributeName):t.morphTargets===!0&&r.bindAttribLocation(M,0,"position"),r.linkProgram(M);function R(C){if(i.debug.checkShaderErrors){const O=r.getProgramInfoLog(M)||"",z=r.getShaderInfoLog(A)||"",k=r.getShaderInfoLog(w)||"",D=O.trim(),I=z.trim(),N=k.trim();let $=!0,j=!0;if(r.getProgramParameter(M,r.LINK_STATUS)===!1)if($=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(r,M,A,w);else{const Q=dc(r,A,"vertex"),ae=dc(r,w,"fragment");Xe("THREE.WebGLProgram: Shader Error "+r.getError()+" - VALIDATE_STATUS "+r.getProgramParameter(M,r.VALIDATE_STATUS)+`

Material Name: `+C.name+`
Material Type: `+C.type+`

Program Info Log: `+D+`
`+Q+`
`+ae)}else D!==""?De("WebGLProgram: Program Info Log:",D):(I===""||N==="")&&(j=!1);j&&(C.diagnostics={runnable:$,programLog:D,vertexShader:{log:I,prefix:d},fragmentShader:{log:N,prefix:f}})}r.deleteShader(A),r.deleteShader(w),x=new Wr(r,M),E=jm(r,M)}let x;this.getUniforms=function(){return x===void 0&&R(this),x};let E;this.getAttributes=function(){return E===void 0&&R(this),E};let H=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return H===!1&&(H=r.getProgramParameter(M,Vm)),H},this.destroy=function(){n.releaseStatesOfProgram(this),r.deleteProgram(M),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=km++,this.cacheKey=e,this.usedTimes=1,this.program=M,this.vertexShader=A,this.fragmentShader=w,this}let dg=0;class pg{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){const t=e.vertexShader,n=e.fragmentShader,r=this._getShaderStage(t),s=this._getShaderStage(n),a=this._getShaderCacheForMaterial(e);return a.has(r)===!1&&(a.add(r),r.usedTimes++),a.has(s)===!1&&(a.add(s),s.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){const t=this.shaderCache;let n=t.get(e);return n===void 0&&(n=new mg(e),t.set(e,n)),n}}class mg{constructor(e){this.id=dg++,this.code=e,this.usedTimes=0}}function gg(i,e,t,n,r,s){const a=new tl,o=new pg,l=new Set,c=[],h=new Map,p=n.logarithmicDepthBuffer;let u=n.precision;const m={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function _(x){return l.add(x),x===0?"uv":`uv${x}`}function M(x,E,H,C,O){const z=C.fog,k=O.geometry,D=x.isMeshStandardMaterial||x.isMeshLambertMaterial||x.isMeshPhongMaterial?C.environment:null,I=x.isMeshStandardMaterial||x.isMeshLambertMaterial&&!x.envMap||x.isMeshPhongMaterial&&!x.envMap,N=e.get(x.envMap||D,I),$=N&&N.mapping===es?N.image.height:null,j=m[x.type];x.precision!==null&&(u=n.getMaxPrecision(x.precision),u!==x.precision&&De("WebGLProgram.getParameters:",x.precision,"not supported, using",u,"instead."));const Q=k.morphAttributes.position||k.morphAttributes.normal||k.morphAttributes.color,ae=Q!==void 0?Q.length:0;let Z=0;k.morphAttributes.position!==void 0&&(Z=1),k.morphAttributes.normal!==void 0&&(Z=2),k.morphAttributes.color!==void 0&&(Z=3);let le,Re,He,Y;if(j){const Ze=Qt[j];le=Ze.vertexShader,Re=Ze.fragmentShader}else le=x.vertexShader,Re=x.fragmentShader,o.update(x),He=o.getVertexShaderID(x),Y=o.getFragmentShaderID(x);const ne=i.getRenderTarget(),se=i.state.buffers.depth.getReversed(),Ie=O.isInstancedMesh===!0,Ae=O.isBatchedMesh===!0,Ce=!!x.map,xt=!!x.matcap,We=!!N,$e=!!x.aoMap,it=!!x.lightMap,Be=!!x.bumpMap,ht=!!x.normalMap,P=!!x.displacementMap,dt=!!x.emissiveMap,Ke=!!x.metalnessMap,st=!!x.roughnessMap,Se=x.anisotropy>0,b=x.clearcoat>0,g=x.dispersion>0,U=x.iridescence>0,K=x.sheen>0,J=x.transmission>0,q=Se&&!!x.anisotropyMap,ge=b&&!!x.clearcoatMap,oe=b&&!!x.clearcoatNormalMap,Te=b&&!!x.clearcoatRoughnessMap,we=U&&!!x.iridescenceMap,ee=U&&!!x.iridescenceThicknessMap,ie=K&&!!x.sheenColorMap,_e=K&&!!x.sheenRoughnessMap,ve=!!x.specularMap,de=!!x.specularColorMap,ze=!!x.specularIntensityMap,L=J&&!!x.transmissionMap,ce=J&&!!x.thicknessMap,re=!!x.gradientMap,me=!!x.alphaMap,te=x.alphaTest>0,X=!!x.alphaHash,xe=!!x.extensions;let Pe=nn;x.toneMapped&&(ne===null||ne.isXRRenderTarget===!0)&&(Pe=i.toneMapping);const at={shaderID:j,shaderType:x.type,shaderName:x.name,vertexShader:le,fragmentShader:Re,defines:x.defines,customVertexShaderID:He,customFragmentShaderID:Y,isRawShaderMaterial:x.isRawShaderMaterial===!0,glslVersion:x.glslVersion,precision:u,batching:Ae,batchingColor:Ae&&O._colorsTexture!==null,instancing:Ie,instancingColor:Ie&&O.instanceColor!==null,instancingMorph:Ie&&O.morphTexture!==null,outputColorSpace:ne===null?i.outputColorSpace:ne.isXRRenderTarget===!0?ne.texture.colorSpace:Ii,alphaToCoverage:!!x.alphaToCoverage,map:Ce,matcap:xt,envMap:We,envMapMode:We&&N.mapping,envMapCubeUVHeight:$,aoMap:$e,lightMap:it,bumpMap:Be,normalMap:ht,displacementMap:P,emissiveMap:dt,normalMapObjectSpace:ht&&x.normalMapType===Zu,normalMapTangentSpace:ht&&x.normalMapType===Jc,metalnessMap:Ke,roughnessMap:st,anisotropy:Se,anisotropyMap:q,clearcoat:b,clearcoatMap:ge,clearcoatNormalMap:oe,clearcoatRoughnessMap:Te,dispersion:g,iridescence:U,iridescenceMap:we,iridescenceThicknessMap:ee,sheen:K,sheenColorMap:ie,sheenRoughnessMap:_e,specularMap:ve,specularColorMap:de,specularIntensityMap:ze,transmission:J,transmissionMap:L,thicknessMap:ce,gradientMap:re,opaque:x.transparent===!1&&x.blending===wi&&x.alphaToCoverage===!1,alphaMap:me,alphaTest:te,alphaHash:X,combine:x.combine,mapUv:Ce&&_(x.map.channel),aoMapUv:$e&&_(x.aoMap.channel),lightMapUv:it&&_(x.lightMap.channel),bumpMapUv:Be&&_(x.bumpMap.channel),normalMapUv:ht&&_(x.normalMap.channel),displacementMapUv:P&&_(x.displacementMap.channel),emissiveMapUv:dt&&_(x.emissiveMap.channel),metalnessMapUv:Ke&&_(x.metalnessMap.channel),roughnessMapUv:st&&_(x.roughnessMap.channel),anisotropyMapUv:q&&_(x.anisotropyMap.channel),clearcoatMapUv:ge&&_(x.clearcoatMap.channel),clearcoatNormalMapUv:oe&&_(x.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Te&&_(x.clearcoatRoughnessMap.channel),iridescenceMapUv:we&&_(x.iridescenceMap.channel),iridescenceThicknessMapUv:ee&&_(x.iridescenceThicknessMap.channel),sheenColorMapUv:ie&&_(x.sheenColorMap.channel),sheenRoughnessMapUv:_e&&_(x.sheenRoughnessMap.channel),specularMapUv:ve&&_(x.specularMap.channel),specularColorMapUv:de&&_(x.specularColorMap.channel),specularIntensityMapUv:ze&&_(x.specularIntensityMap.channel),transmissionMapUv:L&&_(x.transmissionMap.channel),thicknessMapUv:ce&&_(x.thicknessMap.channel),alphaMapUv:me&&_(x.alphaMap.channel),vertexTangents:!!k.attributes.tangent&&(ht||Se),vertexColors:x.vertexColors,vertexAlphas:x.vertexColors===!0&&!!k.attributes.color&&k.attributes.color.itemSize===4,pointsUvs:O.isPoints===!0&&!!k.attributes.uv&&(Ce||me),fog:!!z,useFog:x.fog===!0,fogExp2:!!z&&z.isFogExp2,flatShading:x.wireframe===!1&&(x.flatShading===!0||k.attributes.normal===void 0&&ht===!1&&(x.isMeshLambertMaterial||x.isMeshPhongMaterial||x.isMeshStandardMaterial||x.isMeshPhysicalMaterial)),sizeAttenuation:x.sizeAttenuation===!0,logarithmicDepthBuffer:p,reversedDepthBuffer:se,skinning:O.isSkinnedMesh===!0,morphTargets:k.morphAttributes.position!==void 0,morphNormals:k.morphAttributes.normal!==void 0,morphColors:k.morphAttributes.color!==void 0,morphTargetsCount:ae,morphTextureStride:Z,numDirLights:E.directional.length,numPointLights:E.point.length,numSpotLights:E.spot.length,numSpotLightMaps:E.spotLightMap.length,numRectAreaLights:E.rectArea.length,numHemiLights:E.hemi.length,numDirLightShadows:E.directionalShadowMap.length,numPointLightShadows:E.pointShadowMap.length,numSpotLightShadows:E.spotShadowMap.length,numSpotLightShadowsWithMaps:E.numSpotLightShadowsWithMaps,numLightProbes:E.numLightProbes,numClippingPlanes:s.numPlanes,numClipIntersection:s.numIntersection,dithering:x.dithering,shadowMapEnabled:i.shadowMap.enabled&&H.length>0,shadowMapType:i.shadowMap.type,toneMapping:Pe,decodeVideoTexture:Ce&&x.map.isVideoTexture===!0&&qe.getTransfer(x.map.colorSpace)===je,decodeVideoTextureEmissive:dt&&x.emissiveMap.isVideoTexture===!0&&qe.getTransfer(x.emissiveMap.colorSpace)===je,premultipliedAlpha:x.premultipliedAlpha,doubleSided:x.side===mn,flipSided:x.side===Dt,useDepthPacking:x.depthPacking>=0,depthPacking:x.depthPacking||0,index0AttributeName:x.index0AttributeName,extensionClipCullDistance:xe&&x.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(xe&&x.extensions.multiDraw===!0||Ae)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:x.customProgramCacheKey()};return at.vertexUv1s=l.has(1),at.vertexUv2s=l.has(2),at.vertexUv3s=l.has(3),l.clear(),at}function d(x){const E=[];if(x.shaderID?E.push(x.shaderID):(E.push(x.customVertexShaderID),E.push(x.customFragmentShaderID)),x.defines!==void 0)for(const H in x.defines)E.push(H),E.push(x.defines[H]);return x.isRawShaderMaterial===!1&&(f(E,x),S(E,x),E.push(i.outputColorSpace)),E.push(x.customProgramCacheKey),E.join()}function f(x,E){x.push(E.precision),x.push(E.outputColorSpace),x.push(E.envMapMode),x.push(E.envMapCubeUVHeight),x.push(E.mapUv),x.push(E.alphaMapUv),x.push(E.lightMapUv),x.push(E.aoMapUv),x.push(E.bumpMapUv),x.push(E.normalMapUv),x.push(E.displacementMapUv),x.push(E.emissiveMapUv),x.push(E.metalnessMapUv),x.push(E.roughnessMapUv),x.push(E.anisotropyMapUv),x.push(E.clearcoatMapUv),x.push(E.clearcoatNormalMapUv),x.push(E.clearcoatRoughnessMapUv),x.push(E.iridescenceMapUv),x.push(E.iridescenceThicknessMapUv),x.push(E.sheenColorMapUv),x.push(E.sheenRoughnessMapUv),x.push(E.specularMapUv),x.push(E.specularColorMapUv),x.push(E.specularIntensityMapUv),x.push(E.transmissionMapUv),x.push(E.thicknessMapUv),x.push(E.combine),x.push(E.fogExp2),x.push(E.sizeAttenuation),x.push(E.morphTargetsCount),x.push(E.morphAttributeCount),x.push(E.numDirLights),x.push(E.numPointLights),x.push(E.numSpotLights),x.push(E.numSpotLightMaps),x.push(E.numHemiLights),x.push(E.numRectAreaLights),x.push(E.numDirLightShadows),x.push(E.numPointLightShadows),x.push(E.numSpotLightShadows),x.push(E.numSpotLightShadowsWithMaps),x.push(E.numLightProbes),x.push(E.shadowMapType),x.push(E.toneMapping),x.push(E.numClippingPlanes),x.push(E.numClipIntersection),x.push(E.depthPacking)}function S(x,E){a.disableAll(),E.instancing&&a.enable(0),E.instancingColor&&a.enable(1),E.instancingMorph&&a.enable(2),E.matcap&&a.enable(3),E.envMap&&a.enable(4),E.normalMapObjectSpace&&a.enable(5),E.normalMapTangentSpace&&a.enable(6),E.clearcoat&&a.enable(7),E.iridescence&&a.enable(8),E.alphaTest&&a.enable(9),E.vertexColors&&a.enable(10),E.vertexAlphas&&a.enable(11),E.vertexUv1s&&a.enable(12),E.vertexUv2s&&a.enable(13),E.vertexUv3s&&a.enable(14),E.vertexTangents&&a.enable(15),E.anisotropy&&a.enable(16),E.alphaHash&&a.enable(17),E.batching&&a.enable(18),E.dispersion&&a.enable(19),E.batchingColor&&a.enable(20),E.gradientMap&&a.enable(21),x.push(a.mask),a.disableAll(),E.fog&&a.enable(0),E.useFog&&a.enable(1),E.flatShading&&a.enable(2),E.logarithmicDepthBuffer&&a.enable(3),E.reversedDepthBuffer&&a.enable(4),E.skinning&&a.enable(5),E.morphTargets&&a.enable(6),E.morphNormals&&a.enable(7),E.morphColors&&a.enable(8),E.premultipliedAlpha&&a.enable(9),E.shadowMapEnabled&&a.enable(10),E.doubleSided&&a.enable(11),E.flipSided&&a.enable(12),E.useDepthPacking&&a.enable(13),E.dithering&&a.enable(14),E.transmission&&a.enable(15),E.sheen&&a.enable(16),E.opaque&&a.enable(17),E.pointsUvs&&a.enable(18),E.decodeVideoTexture&&a.enable(19),E.decodeVideoTextureEmissive&&a.enable(20),E.alphaToCoverage&&a.enable(21),x.push(a.mask)}function T(x){const E=m[x.type];let H;if(E){const C=Qt[E];H=Oh.clone(C.uniforms)}else H=x.uniforms;return H}function y(x,E){let H=h.get(E);return H!==void 0?++H.usedTimes:(H=new fg(i,E,x,r),c.push(H),h.set(E,H)),H}function A(x){if(--x.usedTimes===0){const E=c.indexOf(x);c[E]=c[c.length-1],c.pop(),h.delete(x.cacheKey),x.destroy()}}function w(x){o.remove(x)}function R(){o.dispose()}return{getParameters:M,getProgramCacheKey:d,getUniforms:T,acquireProgram:y,releaseProgram:A,releaseShaderCache:w,programs:c,dispose:R}}function _g(){let i=new WeakMap;function e(a){return i.has(a)}function t(a){let o=i.get(a);return o===void 0&&(o={},i.set(a,o)),o}function n(a){i.delete(a)}function r(a,o,l){i.get(a)[o]=l}function s(){i=new WeakMap}return{has:e,get:t,remove:n,update:r,dispose:s}}function xg(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.material.id!==e.material.id?i.material.id-e.material.id:i.materialVariant!==e.materialVariant?i.materialVariant-e.materialVariant:i.z!==e.z?i.z-e.z:i.id-e.id}function xc(i,e){return i.groupOrder!==e.groupOrder?i.groupOrder-e.groupOrder:i.renderOrder!==e.renderOrder?i.renderOrder-e.renderOrder:i.z!==e.z?e.z-i.z:i.id-e.id}function vc(){const i=[];let e=0;const t=[],n=[],r=[];function s(){e=0,t.length=0,n.length=0,r.length=0}function a(u){let m=0;return u.isInstancedMesh&&(m+=2),u.isSkinnedMesh&&(m+=1),m}function o(u,m,_,M,d,f){let S=i[e];return S===void 0?(S={id:u.id,object:u,geometry:m,material:_,materialVariant:a(u),groupOrder:M,renderOrder:u.renderOrder,z:d,group:f},i[e]=S):(S.id=u.id,S.object=u,S.geometry=m,S.material=_,S.materialVariant=a(u),S.groupOrder=M,S.renderOrder=u.renderOrder,S.z=d,S.group=f),e++,S}function l(u,m,_,M,d,f){const S=o(u,m,_,M,d,f);_.transmission>0?n.push(S):_.transparent===!0?r.push(S):t.push(S)}function c(u,m,_,M,d,f){const S=o(u,m,_,M,d,f);_.transmission>0?n.unshift(S):_.transparent===!0?r.unshift(S):t.unshift(S)}function h(u,m){t.length>1&&t.sort(u||xg),n.length>1&&n.sort(m||xc),r.length>1&&r.sort(m||xc)}function p(){for(let u=e,m=i.length;u<m;u++){const _=i[u];if(_.id===null)break;_.id=null,_.object=null,_.geometry=null,_.material=null,_.group=null}}return{opaque:t,transmissive:n,transparent:r,init:s,push:l,unshift:c,finish:p,sort:h}}function vg(){let i=new WeakMap;function e(n,r){const s=i.get(n);let a;return s===void 0?(a=new vc,i.set(n,[a])):r>=s.length?(a=new vc,s.push(a)):a=s[r],a}function t(){i=new WeakMap}return{get:e,dispose:t}}function Mg(){const i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new B,color:new Ne};break;case"SpotLight":t={position:new B,direction:new B,color:new Ne,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new B,color:new Ne,distance:0,decay:0};break;case"HemisphereLight":t={direction:new B,skyColor:new Ne,groundColor:new Ne};break;case"RectAreaLight":t={color:new Ne,position:new B,halfWidth:new B,halfHeight:new B};break}return i[e.id]=t,t}}}function Sg(){const i={};return{get:function(e){if(i[e.id]!==void 0)return i[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Fe};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Fe};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Fe,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[e.id]=t,t}}}let Eg=0;function yg(i,e){return(e.castShadow?2:0)-(i.castShadow?2:0)+(e.map?1:0)-(i.map?1:0)}function bg(i){const e=new Mg,t=Sg(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new B);const r=new B,s=new Je,a=new Je;function o(c){let h=0,p=0,u=0;for(let E=0;E<9;E++)n.probe[E].set(0,0,0);let m=0,_=0,M=0,d=0,f=0,S=0,T=0,y=0,A=0,w=0,R=0;c.sort(yg);for(let E=0,H=c.length;E<H;E++){const C=c[E],O=C.color,z=C.intensity,k=C.distance;let D=null;if(C.shadow&&C.shadow.map&&(C.shadow.map.texture.format===Li?D=C.shadow.map.texture:D=C.shadow.map.depthTexture||C.shadow.map.texture),C.isAmbientLight)h+=O.r*z,p+=O.g*z,u+=O.b*z;else if(C.isLightProbe){for(let I=0;I<9;I++)n.probe[I].addScaledVector(C.sh.coefficients[I],z);R++}else if(C.isDirectionalLight){const I=e.get(C);if(I.color.copy(C.color).multiplyScalar(C.intensity),C.castShadow){const N=C.shadow,$=t.get(C);$.shadowIntensity=N.intensity,$.shadowBias=N.bias,$.shadowNormalBias=N.normalBias,$.shadowRadius=N.radius,$.shadowMapSize=N.mapSize,n.directionalShadow[m]=$,n.directionalShadowMap[m]=D,n.directionalShadowMatrix[m]=C.shadow.matrix,S++}n.directional[m]=I,m++}else if(C.isSpotLight){const I=e.get(C);I.position.setFromMatrixPosition(C.matrixWorld),I.color.copy(O).multiplyScalar(z),I.distance=k,I.coneCos=Math.cos(C.angle),I.penumbraCos=Math.cos(C.angle*(1-C.penumbra)),I.decay=C.decay,n.spot[M]=I;const N=C.shadow;if(C.map&&(n.spotLightMap[A]=C.map,A++,N.updateMatrices(C),C.castShadow&&w++),n.spotLightMatrix[M]=N.matrix,C.castShadow){const $=t.get(C);$.shadowIntensity=N.intensity,$.shadowBias=N.bias,$.shadowNormalBias=N.normalBias,$.shadowRadius=N.radius,$.shadowMapSize=N.mapSize,n.spotShadow[M]=$,n.spotShadowMap[M]=D,y++}M++}else if(C.isRectAreaLight){const I=e.get(C);I.color.copy(O).multiplyScalar(z),I.halfWidth.set(C.width*.5,0,0),I.halfHeight.set(0,C.height*.5,0),n.rectArea[d]=I,d++}else if(C.isPointLight){const I=e.get(C);if(I.color.copy(C.color).multiplyScalar(C.intensity),I.distance=C.distance,I.decay=C.decay,C.castShadow){const N=C.shadow,$=t.get(C);$.shadowIntensity=N.intensity,$.shadowBias=N.bias,$.shadowNormalBias=N.normalBias,$.shadowRadius=N.radius,$.shadowMapSize=N.mapSize,$.shadowCameraNear=N.camera.near,$.shadowCameraFar=N.camera.far,n.pointShadow[_]=$,n.pointShadowMap[_]=D,n.pointShadowMatrix[_]=C.shadow.matrix,T++}n.point[_]=I,_++}else if(C.isHemisphereLight){const I=e.get(C);I.skyColor.copy(C.color).multiplyScalar(z),I.groundColor.copy(C.groundColor).multiplyScalar(z),n.hemi[f]=I,f++}}d>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=ue.LTC_FLOAT_1,n.rectAreaLTC2=ue.LTC_FLOAT_2):(n.rectAreaLTC1=ue.LTC_HALF_1,n.rectAreaLTC2=ue.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=p,n.ambient[2]=u;const x=n.hash;(x.directionalLength!==m||x.pointLength!==_||x.spotLength!==M||x.rectAreaLength!==d||x.hemiLength!==f||x.numDirectionalShadows!==S||x.numPointShadows!==T||x.numSpotShadows!==y||x.numSpotMaps!==A||x.numLightProbes!==R)&&(n.directional.length=m,n.spot.length=M,n.rectArea.length=d,n.point.length=_,n.hemi.length=f,n.directionalShadow.length=S,n.directionalShadowMap.length=S,n.pointShadow.length=T,n.pointShadowMap.length=T,n.spotShadow.length=y,n.spotShadowMap.length=y,n.directionalShadowMatrix.length=S,n.pointShadowMatrix.length=T,n.spotLightMatrix.length=y+A-w,n.spotLightMap.length=A,n.numSpotLightShadowsWithMaps=w,n.numLightProbes=R,x.directionalLength=m,x.pointLength=_,x.spotLength=M,x.rectAreaLength=d,x.hemiLength=f,x.numDirectionalShadows=S,x.numPointShadows=T,x.numSpotShadows=y,x.numSpotMaps=A,x.numLightProbes=R,n.version=Eg++)}function l(c,h){let p=0,u=0,m=0,_=0,M=0;const d=h.matrixWorldInverse;for(let f=0,S=c.length;f<S;f++){const T=c[f];if(T.isDirectionalLight){const y=n.directional[p];y.direction.setFromMatrixPosition(T.matrixWorld),r.setFromMatrixPosition(T.target.matrixWorld),y.direction.sub(r),y.direction.transformDirection(d),p++}else if(T.isSpotLight){const y=n.spot[m];y.position.setFromMatrixPosition(T.matrixWorld),y.position.applyMatrix4(d),y.direction.setFromMatrixPosition(T.matrixWorld),r.setFromMatrixPosition(T.target.matrixWorld),y.direction.sub(r),y.direction.transformDirection(d),m++}else if(T.isRectAreaLight){const y=n.rectArea[_];y.position.setFromMatrixPosition(T.matrixWorld),y.position.applyMatrix4(d),a.identity(),s.copy(T.matrixWorld),s.premultiply(d),a.extractRotation(s),y.halfWidth.set(T.width*.5,0,0),y.halfHeight.set(0,T.height*.5,0),y.halfWidth.applyMatrix4(a),y.halfHeight.applyMatrix4(a),_++}else if(T.isPointLight){const y=n.point[u];y.position.setFromMatrixPosition(T.matrixWorld),y.position.applyMatrix4(d),u++}else if(T.isHemisphereLight){const y=n.hemi[M];y.direction.setFromMatrixPosition(T.matrixWorld),y.direction.transformDirection(d),M++}}}return{setup:o,setupView:l,state:n}}function Mc(i){const e=new bg(i),t=[],n=[];function r(h){c.camera=h,t.length=0,n.length=0}function s(h){t.push(h)}function a(h){n.push(h)}function o(){e.setup(t)}function l(h){e.setupView(t,h)}const c={lightsArray:t,shadowsArray:n,camera:null,lights:e,transmissionRenderTarget:{}};return{init:r,state:c,setupLights:o,setupLightsView:l,pushLight:s,pushShadow:a}}function Tg(i){let e=new WeakMap;function t(r,s=0){const a=e.get(r);let o;return a===void 0?(o=new Mc(i),e.set(r,[o])):s>=a.length?(o=new Mc(i),a.push(o)):o=a[s],o}function n(){e=new WeakMap}return{get:t,dispose:n}}const Ag=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,wg=`uniform sampler2D shadow_pass;
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
}`,Rg=[new B(1,0,0),new B(-1,0,0),new B(0,1,0),new B(0,-1,0),new B(0,0,1),new B(0,0,-1)],Cg=[new B(0,-1,0),new B(0,-1,0),new B(0,0,1),new B(0,0,-1),new B(0,-1,0),new B(0,-1,0)],Sc=new Je,$i=new B,Gs=new B;function Pg(i,e,t){let n=new to;const r=new Fe,s=new Fe,a=new ut,o=new Vh,l=new kh,c={},h=t.maxTextureSize,p={[Un]:Dt,[Dt]:Un,[mn]:mn},u=new on({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Fe},radius:{value:4}},vertexShader:Ag,fragmentShader:wg}),m=u.clone();m.defines.HORIZONTAL_PASS=1;const _=new yt;_.setAttribute("position",new Bt(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const M=new Ve(_,u),d=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=zr;let f=this.type;this.render=function(w,R,x){if(d.enabled===!1||d.autoUpdate===!1&&d.needsUpdate===!1||w.length===0)return;this.type===wu&&(De("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=zr);const E=i.getRenderTarget(),H=i.getActiveCubeFace(),C=i.getActiveMipmapLevel(),O=i.state;O.setBlending(_n),O.buffers.depth.getReversed()===!0?O.buffers.color.setClear(0,0,0,0):O.buffers.color.setClear(1,1,1,1),O.buffers.depth.setTest(!0),O.setScissorTest(!1);const z=f!==this.type;z&&R.traverse(function(k){k.material&&(Array.isArray(k.material)?k.material.forEach(D=>D.needsUpdate=!0):k.material.needsUpdate=!0)});for(let k=0,D=w.length;k<D;k++){const I=w[k],N=I.shadow;if(N===void 0){De("WebGLShadowMap:",I,"has no shadow.");continue}if(N.autoUpdate===!1&&N.needsUpdate===!1)continue;r.copy(N.mapSize);const $=N.getFrameExtents();r.multiply($),s.copy(N.mapSize),(r.x>h||r.y>h)&&(r.x>h&&(s.x=Math.floor(h/$.x),r.x=s.x*$.x,N.mapSize.x=s.x),r.y>h&&(s.y=Math.floor(h/$.y),r.y=s.y*$.y,N.mapSize.y=s.y));const j=i.state.buffers.depth.getReversed();if(N.camera._reversedDepth=j,N.map===null||z===!0){if(N.map!==null&&(N.map.depthTexture!==null&&(N.map.depthTexture.dispose(),N.map.depthTexture=null),N.map.dispose()),this.type===Ji){if(I.isPointLight){De("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}N.map=new rn(r.x,r.y,{format:Li,type:vn,minFilter:wt,magFilter:wt,generateMipmaps:!1}),N.map.texture.name=I.name+".shadowMap",N.map.depthTexture=new ir(r.x,r.y,Yt),N.map.depthTexture.name=I.name+".shadowMapDepth",N.map.depthTexture.format=Mn,N.map.depthTexture.compareFunction=null,N.map.depthTexture.minFilter=Et,N.map.depthTexture.magFilter=Et}else I.isPointLight?(N.map=new xl(r.x),N.map.depthTexture=new Nh(r.x,sn)):(N.map=new rn(r.x,r.y),N.map.depthTexture=new ir(r.x,r.y,sn)),N.map.depthTexture.name=I.name+".shadowMap",N.map.depthTexture.format=Mn,this.type===zr?(N.map.depthTexture.compareFunction=j?Ja:ja,N.map.depthTexture.minFilter=wt,N.map.depthTexture.magFilter=wt):(N.map.depthTexture.compareFunction=null,N.map.depthTexture.minFilter=Et,N.map.depthTexture.magFilter=Et);N.camera.updateProjectionMatrix()}const Q=N.map.isWebGLCubeRenderTarget?6:1;for(let ae=0;ae<Q;ae++){if(N.map.isWebGLCubeRenderTarget)i.setRenderTarget(N.map,ae),i.clear();else{ae===0&&(i.setRenderTarget(N.map),i.clear());const Z=N.getViewport(ae);a.set(s.x*Z.x,s.y*Z.y,s.x*Z.z,s.y*Z.w),O.viewport(a)}if(I.isPointLight){const Z=N.camera,le=N.matrix,Re=I.distance||Z.far;Re!==Z.far&&(Z.far=Re,Z.updateProjectionMatrix()),$i.setFromMatrixPosition(I.matrixWorld),Z.position.copy($i),Gs.copy(Z.position),Gs.add(Rg[ae]),Z.up.copy(Cg[ae]),Z.lookAt(Gs),Z.updateMatrixWorld(),le.makeTranslation(-$i.x,-$i.y,-$i.z),Sc.multiplyMatrices(Z.projectionMatrix,Z.matrixWorldInverse),N._frustum.setFromProjectionMatrix(Sc,Z.coordinateSystem,Z.reversedDepth)}else N.updateMatrices(I);n=N.getFrustum(),y(R,x,N.camera,I,this.type)}N.isPointLightShadow!==!0&&this.type===Ji&&S(N,x),N.needsUpdate=!1}f=this.type,d.needsUpdate=!1,i.setRenderTarget(E,H,C)};function S(w,R){const x=e.update(M);u.defines.VSM_SAMPLES!==w.blurSamples&&(u.defines.VSM_SAMPLES=w.blurSamples,m.defines.VSM_SAMPLES=w.blurSamples,u.needsUpdate=!0,m.needsUpdate=!0),w.mapPass===null&&(w.mapPass=new rn(r.x,r.y,{format:Li,type:vn})),u.uniforms.shadow_pass.value=w.map.depthTexture,u.uniforms.resolution.value=w.mapSize,u.uniforms.radius.value=w.radius,i.setRenderTarget(w.mapPass),i.clear(),i.renderBufferDirect(R,null,x,u,M,null),m.uniforms.shadow_pass.value=w.mapPass.texture,m.uniforms.resolution.value=w.mapSize,m.uniforms.radius.value=w.radius,i.setRenderTarget(w.map),i.clear(),i.renderBufferDirect(R,null,x,m,M,null)}function T(w,R,x,E){let H=null;const C=x.isPointLight===!0?w.customDistanceMaterial:w.customDepthMaterial;if(C!==void 0)H=C;else if(H=x.isPointLight===!0?l:o,i.localClippingEnabled&&R.clipShadows===!0&&Array.isArray(R.clippingPlanes)&&R.clippingPlanes.length!==0||R.displacementMap&&R.displacementScale!==0||R.alphaMap&&R.alphaTest>0||R.map&&R.alphaTest>0||R.alphaToCoverage===!0){const O=H.uuid,z=R.uuid;let k=c[O];k===void 0&&(k={},c[O]=k);let D=k[z];D===void 0&&(D=H.clone(),k[z]=D,R.addEventListener("dispose",A)),H=D}if(H.visible=R.visible,H.wireframe=R.wireframe,E===Ji?H.side=R.shadowSide!==null?R.shadowSide:R.side:H.side=R.shadowSide!==null?R.shadowSide:p[R.side],H.alphaMap=R.alphaMap,H.alphaTest=R.alphaToCoverage===!0?.5:R.alphaTest,H.map=R.map,H.clipShadows=R.clipShadows,H.clippingPlanes=R.clippingPlanes,H.clipIntersection=R.clipIntersection,H.displacementMap=R.displacementMap,H.displacementScale=R.displacementScale,H.displacementBias=R.displacementBias,H.wireframeLinewidth=R.wireframeLinewidth,H.linewidth=R.linewidth,x.isPointLight===!0&&H.isMeshDistanceMaterial===!0){const O=i.properties.get(H);O.light=x}return H}function y(w,R,x,E,H){if(w.visible===!1)return;if(w.layers.test(R.layers)&&(w.isMesh||w.isLine||w.isPoints)&&(w.castShadow||w.receiveShadow&&H===Ji)&&(!w.frustumCulled||n.intersectsObject(w))){w.modelViewMatrix.multiplyMatrices(x.matrixWorldInverse,w.matrixWorld);const z=e.update(w),k=w.material;if(Array.isArray(k)){const D=z.groups;for(let I=0,N=D.length;I<N;I++){const $=D[I],j=k[$.materialIndex];if(j&&j.visible){const Q=T(w,j,E,H);w.onBeforeShadow(i,w,R,x,z,Q,$),i.renderBufferDirect(x,null,z,Q,w,$),w.onAfterShadow(i,w,R,x,z,Q,$)}}}else if(k.visible){const D=T(w,k,E,H);w.onBeforeShadow(i,w,R,x,z,D,null),i.renderBufferDirect(x,null,z,D,w,null),w.onAfterShadow(i,w,R,x,z,D,null)}}const O=w.children;for(let z=0,k=O.length;z<k;z++)y(O[z],R,x,E,H)}function A(w){w.target.removeEventListener("dispose",A);for(const x in c){const E=c[x],H=w.target.uuid;H in E&&(E[H].dispose(),delete E[H])}}}function Dg(i,e){function t(){let L=!1;const ce=new ut;let re=null;const me=new ut(0,0,0,0);return{setMask:function(te){re!==te&&!L&&(i.colorMask(te,te,te,te),re=te)},setLocked:function(te){L=te},setClear:function(te,X,xe,Pe,at){at===!0&&(te*=Pe,X*=Pe,xe*=Pe),ce.set(te,X,xe,Pe),me.equals(ce)===!1&&(i.clearColor(te,X,xe,Pe),me.copy(ce))},reset:function(){L=!1,re=null,me.set(-1,0,0,0)}}}function n(){let L=!1,ce=!1,re=null,me=null,te=null;return{setReversed:function(X){if(ce!==X){const xe=e.get("EXT_clip_control");X?xe.clipControlEXT(xe.LOWER_LEFT_EXT,xe.ZERO_TO_ONE_EXT):xe.clipControlEXT(xe.LOWER_LEFT_EXT,xe.NEGATIVE_ONE_TO_ONE_EXT),ce=X;const Pe=te;te=null,this.setClear(Pe)}},getReversed:function(){return ce},setTest:function(X){X?ne(i.DEPTH_TEST):se(i.DEPTH_TEST)},setMask:function(X){re!==X&&!L&&(i.depthMask(X),re=X)},setFunc:function(X){if(ce&&(X=ah[X]),me!==X){switch(X){case Ks:i.depthFunc(i.NEVER);break;case $s:i.depthFunc(i.ALWAYS);break;case Zs:i.depthFunc(i.LESS);break;case Pi:i.depthFunc(i.LEQUAL);break;case js:i.depthFunc(i.EQUAL);break;case Js:i.depthFunc(i.GEQUAL);break;case Qs:i.depthFunc(i.GREATER);break;case ea:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}me=X}},setLocked:function(X){L=X},setClear:function(X){te!==X&&(te=X,ce&&(X=1-X),i.clearDepth(X))},reset:function(){L=!1,re=null,me=null,te=null,ce=!1}}}function r(){let L=!1,ce=null,re=null,me=null,te=null,X=null,xe=null,Pe=null,at=null;return{setTest:function(Ze){L||(Ze?ne(i.STENCIL_TEST):se(i.STENCIL_TEST))},setMask:function(Ze){ce!==Ze&&!L&&(i.stencilMask(Ze),ce=Ze)},setFunc:function(Ze,cn,ln){(re!==Ze||me!==cn||te!==ln)&&(i.stencilFunc(Ze,cn,ln),re=Ze,me=cn,te=ln)},setOp:function(Ze,cn,ln){(X!==Ze||xe!==cn||Pe!==ln)&&(i.stencilOp(Ze,cn,ln),X=Ze,xe=cn,Pe=ln)},setLocked:function(Ze){L=Ze},setClear:function(Ze){at!==Ze&&(i.clearStencil(Ze),at=Ze)},reset:function(){L=!1,ce=null,re=null,me=null,te=null,X=null,xe=null,Pe=null,at=null}}}const s=new t,a=new n,o=new r,l=new WeakMap,c=new WeakMap;let h={},p={},u=new WeakMap,m=[],_=null,M=!1,d=null,f=null,S=null,T=null,y=null,A=null,w=null,R=new Ne(0,0,0),x=0,E=!1,H=null,C=null,O=null,z=null,k=null;const D=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let I=!1,N=0;const $=i.getParameter(i.VERSION);$.indexOf("WebGL")!==-1?(N=parseFloat(/^WebGL (\d)/.exec($)[1]),I=N>=1):$.indexOf("OpenGL ES")!==-1&&(N=parseFloat(/^OpenGL ES (\d)/.exec($)[1]),I=N>=2);let j=null,Q={};const ae=i.getParameter(i.SCISSOR_BOX),Z=i.getParameter(i.VIEWPORT),le=new ut().fromArray(ae),Re=new ut().fromArray(Z);function He(L,ce,re,me){const te=new Uint8Array(4),X=i.createTexture();i.bindTexture(L,X),i.texParameteri(L,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(L,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let xe=0;xe<re;xe++)L===i.TEXTURE_3D||L===i.TEXTURE_2D_ARRAY?i.texImage3D(ce,0,i.RGBA,1,1,me,0,i.RGBA,i.UNSIGNED_BYTE,te):i.texImage2D(ce+xe,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,te);return X}const Y={};Y[i.TEXTURE_2D]=He(i.TEXTURE_2D,i.TEXTURE_2D,1),Y[i.TEXTURE_CUBE_MAP]=He(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),Y[i.TEXTURE_2D_ARRAY]=He(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),Y[i.TEXTURE_3D]=He(i.TEXTURE_3D,i.TEXTURE_3D,1,1),s.setClear(0,0,0,1),a.setClear(1),o.setClear(0),ne(i.DEPTH_TEST),a.setFunc(Pi),Be(!1),ht(So),ne(i.CULL_FACE),$e(_n);function ne(L){h[L]!==!0&&(i.enable(L),h[L]=!0)}function se(L){h[L]!==!1&&(i.disable(L),h[L]=!1)}function Ie(L,ce){return p[L]!==ce?(i.bindFramebuffer(L,ce),p[L]=ce,L===i.DRAW_FRAMEBUFFER&&(p[i.FRAMEBUFFER]=ce),L===i.FRAMEBUFFER&&(p[i.DRAW_FRAMEBUFFER]=ce),!0):!1}function Ae(L,ce){let re=m,me=!1;if(L){re=u.get(ce),re===void 0&&(re=[],u.set(ce,re));const te=L.textures;if(re.length!==te.length||re[0]!==i.COLOR_ATTACHMENT0){for(let X=0,xe=te.length;X<xe;X++)re[X]=i.COLOR_ATTACHMENT0+X;re.length=te.length,me=!0}}else re[0]!==i.BACK&&(re[0]=i.BACK,me=!0);me&&i.drawBuffers(re)}function Ce(L){return _!==L?(i.useProgram(L),_=L,!0):!1}const xt={[qn]:i.FUNC_ADD,[Cu]:i.FUNC_SUBTRACT,[Pu]:i.FUNC_REVERSE_SUBTRACT};xt[Du]=i.MIN,xt[Lu]=i.MAX;const We={[Iu]:i.ZERO,[Uu]:i.ONE,[Nu]:i.SRC_COLOR,[qs]:i.SRC_ALPHA,[Vu]:i.SRC_ALPHA_SATURATE,[zu]:i.DST_COLOR,[Ou]:i.DST_ALPHA,[Fu]:i.ONE_MINUS_SRC_COLOR,[Ys]:i.ONE_MINUS_SRC_ALPHA,[Gu]:i.ONE_MINUS_DST_COLOR,[Bu]:i.ONE_MINUS_DST_ALPHA,[ku]:i.CONSTANT_COLOR,[Hu]:i.ONE_MINUS_CONSTANT_COLOR,[Wu]:i.CONSTANT_ALPHA,[Xu]:i.ONE_MINUS_CONSTANT_ALPHA};function $e(L,ce,re,me,te,X,xe,Pe,at,Ze){if(L===_n){M===!0&&(se(i.BLEND),M=!1);return}if(M===!1&&(ne(i.BLEND),M=!0),L!==Ru){if(L!==d||Ze!==E){if((f!==qn||y!==qn)&&(i.blendEquation(i.FUNC_ADD),f=qn,y=qn),Ze)switch(L){case wi:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Xs:i.blendFunc(i.ONE,i.ONE);break;case Eo:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case yo:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:Xe("WebGLState: Invalid blending: ",L);break}else switch(L){case wi:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case Xs:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case Eo:Xe("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case yo:Xe("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Xe("WebGLState: Invalid blending: ",L);break}S=null,T=null,A=null,w=null,R.set(0,0,0),x=0,d=L,E=Ze}return}te=te||ce,X=X||re,xe=xe||me,(ce!==f||te!==y)&&(i.blendEquationSeparate(xt[ce],xt[te]),f=ce,y=te),(re!==S||me!==T||X!==A||xe!==w)&&(i.blendFuncSeparate(We[re],We[me],We[X],We[xe]),S=re,T=me,A=X,w=xe),(Pe.equals(R)===!1||at!==x)&&(i.blendColor(Pe.r,Pe.g,Pe.b,at),R.copy(Pe),x=at),d=L,E=!1}function it(L,ce){L.side===mn?se(i.CULL_FACE):ne(i.CULL_FACE);let re=L.side===Dt;ce&&(re=!re),Be(re),L.blending===wi&&L.transparent===!1?$e(_n):$e(L.blending,L.blendEquation,L.blendSrc,L.blendDst,L.blendEquationAlpha,L.blendSrcAlpha,L.blendDstAlpha,L.blendColor,L.blendAlpha,L.premultipliedAlpha),a.setFunc(L.depthFunc),a.setTest(L.depthTest),a.setMask(L.depthWrite),s.setMask(L.colorWrite);const me=L.stencilWrite;o.setTest(me),me&&(o.setMask(L.stencilWriteMask),o.setFunc(L.stencilFunc,L.stencilRef,L.stencilFuncMask),o.setOp(L.stencilFail,L.stencilZFail,L.stencilZPass)),dt(L.polygonOffset,L.polygonOffsetFactor,L.polygonOffsetUnits),L.alphaToCoverage===!0?ne(i.SAMPLE_ALPHA_TO_COVERAGE):se(i.SAMPLE_ALPHA_TO_COVERAGE)}function Be(L){H!==L&&(L?i.frontFace(i.CW):i.frontFace(i.CCW),H=L)}function ht(L){L!==Tu?(ne(i.CULL_FACE),L!==C&&(L===So?i.cullFace(i.BACK):L===Au?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):se(i.CULL_FACE),C=L}function P(L){L!==O&&(I&&i.lineWidth(L),O=L)}function dt(L,ce,re){L?(ne(i.POLYGON_OFFSET_FILL),(z!==ce||k!==re)&&(z=ce,k=re,a.getReversed()&&(ce=-ce),i.polygonOffset(ce,re))):se(i.POLYGON_OFFSET_FILL)}function Ke(L){L?ne(i.SCISSOR_TEST):se(i.SCISSOR_TEST)}function st(L){L===void 0&&(L=i.TEXTURE0+D-1),j!==L&&(i.activeTexture(L),j=L)}function Se(L,ce,re){re===void 0&&(j===null?re=i.TEXTURE0+D-1:re=j);let me=Q[re];me===void 0&&(me={type:void 0,texture:void 0},Q[re]=me),(me.type!==L||me.texture!==ce)&&(j!==re&&(i.activeTexture(re),j=re),i.bindTexture(L,ce||Y[L]),me.type=L,me.texture=ce)}function b(){const L=Q[j];L!==void 0&&L.type!==void 0&&(i.bindTexture(L.type,null),L.type=void 0,L.texture=void 0)}function g(){try{i.compressedTexImage2D(...arguments)}catch(L){Xe("WebGLState:",L)}}function U(){try{i.compressedTexImage3D(...arguments)}catch(L){Xe("WebGLState:",L)}}function K(){try{i.texSubImage2D(...arguments)}catch(L){Xe("WebGLState:",L)}}function J(){try{i.texSubImage3D(...arguments)}catch(L){Xe("WebGLState:",L)}}function q(){try{i.compressedTexSubImage2D(...arguments)}catch(L){Xe("WebGLState:",L)}}function ge(){try{i.compressedTexSubImage3D(...arguments)}catch(L){Xe("WebGLState:",L)}}function oe(){try{i.texStorage2D(...arguments)}catch(L){Xe("WebGLState:",L)}}function Te(){try{i.texStorage3D(...arguments)}catch(L){Xe("WebGLState:",L)}}function we(){try{i.texImage2D(...arguments)}catch(L){Xe("WebGLState:",L)}}function ee(){try{i.texImage3D(...arguments)}catch(L){Xe("WebGLState:",L)}}function ie(L){le.equals(L)===!1&&(i.scissor(L.x,L.y,L.z,L.w),le.copy(L))}function _e(L){Re.equals(L)===!1&&(i.viewport(L.x,L.y,L.z,L.w),Re.copy(L))}function ve(L,ce){let re=c.get(ce);re===void 0&&(re=new WeakMap,c.set(ce,re));let me=re.get(L);me===void 0&&(me=i.getUniformBlockIndex(ce,L.name),re.set(L,me))}function de(L,ce){const me=c.get(ce).get(L);l.get(ce)!==me&&(i.uniformBlockBinding(ce,me,L.__bindingPointIndex),l.set(ce,me))}function ze(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),a.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),h={},j=null,Q={},p={},u=new WeakMap,m=[],_=null,M=!1,d=null,f=null,S=null,T=null,y=null,A=null,w=null,R=new Ne(0,0,0),x=0,E=!1,H=null,C=null,O=null,z=null,k=null,le.set(0,0,i.canvas.width,i.canvas.height),Re.set(0,0,i.canvas.width,i.canvas.height),s.reset(),a.reset(),o.reset()}return{buffers:{color:s,depth:a,stencil:o},enable:ne,disable:se,bindFramebuffer:Ie,drawBuffers:Ae,useProgram:Ce,setBlending:$e,setMaterial:it,setFlipSided:Be,setCullFace:ht,setLineWidth:P,setPolygonOffset:dt,setScissorTest:Ke,activeTexture:st,bindTexture:Se,unbindTexture:b,compressedTexImage2D:g,compressedTexImage3D:U,texImage2D:we,texImage3D:ee,updateUBOMapping:ve,uniformBlockBinding:de,texStorage2D:oe,texStorage3D:Te,texSubImage2D:K,texSubImage3D:J,compressedTexSubImage2D:q,compressedTexSubImage3D:ge,scissor:ie,viewport:_e,reset:ze}}function Lg(i,e,t,n,r,s,a){const o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Fe,h=new WeakMap;let p;const u=new WeakMap;let m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function _(b,g){return m?new OffscreenCanvas(b,g):Kr("canvas")}function M(b,g,U){let K=1;const J=Se(b);if((J.width>U||J.height>U)&&(K=U/Math.max(J.width,J.height)),K<1)if(typeof HTMLImageElement<"u"&&b instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&b instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&b instanceof ImageBitmap||typeof VideoFrame<"u"&&b instanceof VideoFrame){const q=Math.floor(K*J.width),ge=Math.floor(K*J.height);p===void 0&&(p=_(q,ge));const oe=g?_(q,ge):p;return oe.width=q,oe.height=ge,oe.getContext("2d").drawImage(b,0,0,q,ge),De("WebGLRenderer: Texture has been resized from ("+J.width+"x"+J.height+") to ("+q+"x"+ge+")."),oe}else return"data"in b&&De("WebGLRenderer: Image in DataTexture is too big ("+J.width+"x"+J.height+")."),b;return b}function d(b){return b.generateMipmaps}function f(b){i.generateMipmap(b)}function S(b){return b.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:b.isWebGL3DRenderTarget?i.TEXTURE_3D:b.isWebGLArrayRenderTarget||b.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function T(b,g,U,K,J=!1){if(b!==null){if(i[b]!==void 0)return i[b];De("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+b+"'")}let q=g;if(g===i.RED&&(U===i.FLOAT&&(q=i.R32F),U===i.HALF_FLOAT&&(q=i.R16F),U===i.UNSIGNED_BYTE&&(q=i.R8)),g===i.RED_INTEGER&&(U===i.UNSIGNED_BYTE&&(q=i.R8UI),U===i.UNSIGNED_SHORT&&(q=i.R16UI),U===i.UNSIGNED_INT&&(q=i.R32UI),U===i.BYTE&&(q=i.R8I),U===i.SHORT&&(q=i.R16I),U===i.INT&&(q=i.R32I)),g===i.RG&&(U===i.FLOAT&&(q=i.RG32F),U===i.HALF_FLOAT&&(q=i.RG16F),U===i.UNSIGNED_BYTE&&(q=i.RG8)),g===i.RG_INTEGER&&(U===i.UNSIGNED_BYTE&&(q=i.RG8UI),U===i.UNSIGNED_SHORT&&(q=i.RG16UI),U===i.UNSIGNED_INT&&(q=i.RG32UI),U===i.BYTE&&(q=i.RG8I),U===i.SHORT&&(q=i.RG16I),U===i.INT&&(q=i.RG32I)),g===i.RGB_INTEGER&&(U===i.UNSIGNED_BYTE&&(q=i.RGB8UI),U===i.UNSIGNED_SHORT&&(q=i.RGB16UI),U===i.UNSIGNED_INT&&(q=i.RGB32UI),U===i.BYTE&&(q=i.RGB8I),U===i.SHORT&&(q=i.RGB16I),U===i.INT&&(q=i.RGB32I)),g===i.RGBA_INTEGER&&(U===i.UNSIGNED_BYTE&&(q=i.RGBA8UI),U===i.UNSIGNED_SHORT&&(q=i.RGBA16UI),U===i.UNSIGNED_INT&&(q=i.RGBA32UI),U===i.BYTE&&(q=i.RGBA8I),U===i.SHORT&&(q=i.RGBA16I),U===i.INT&&(q=i.RGBA32I)),g===i.RGB&&(U===i.UNSIGNED_INT_5_9_9_9_REV&&(q=i.RGB9_E5),U===i.UNSIGNED_INT_10F_11F_11F_REV&&(q=i.R11F_G11F_B10F)),g===i.RGBA){const ge=J?Yr:qe.getTransfer(K);U===i.FLOAT&&(q=i.RGBA32F),U===i.HALF_FLOAT&&(q=i.RGBA16F),U===i.UNSIGNED_BYTE&&(q=ge===je?i.SRGB8_ALPHA8:i.RGBA8),U===i.UNSIGNED_SHORT_4_4_4_4&&(q=i.RGBA4),U===i.UNSIGNED_SHORT_5_5_5_1&&(q=i.RGB5_A1)}return(q===i.R16F||q===i.R32F||q===i.RG16F||q===i.RG32F||q===i.RGBA16F||q===i.RGBA32F)&&e.get("EXT_color_buffer_float"),q}function y(b,g){let U;return b?g===null||g===sn||g===tr?U=i.DEPTH24_STENCIL8:g===Yt?U=i.DEPTH32F_STENCIL8:g===er&&(U=i.DEPTH24_STENCIL8,De("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):g===null||g===sn||g===tr?U=i.DEPTH_COMPONENT24:g===Yt?U=i.DEPTH_COMPONENT32F:g===er&&(U=i.DEPTH_COMPONENT16),U}function A(b,g){return d(b)===!0||b.isFramebufferTexture&&b.minFilter!==Et&&b.minFilter!==wt?Math.log2(Math.max(g.width,g.height))+1:b.mipmaps!==void 0&&b.mipmaps.length>0?b.mipmaps.length:b.isCompressedTexture&&Array.isArray(b.image)?g.mipmaps.length:1}function w(b){const g=b.target;g.removeEventListener("dispose",w),x(g),g.isVideoTexture&&h.delete(g)}function R(b){const g=b.target;g.removeEventListener("dispose",R),H(g)}function x(b){const g=n.get(b);if(g.__webglInit===void 0)return;const U=b.source,K=u.get(U);if(K){const J=K[g.__cacheKey];J.usedTimes--,J.usedTimes===0&&E(b),Object.keys(K).length===0&&u.delete(U)}n.remove(b)}function E(b){const g=n.get(b);i.deleteTexture(g.__webglTexture);const U=b.source,K=u.get(U);delete K[g.__cacheKey],a.memory.textures--}function H(b){const g=n.get(b);if(b.depthTexture&&(b.depthTexture.dispose(),n.remove(b.depthTexture)),b.isWebGLCubeRenderTarget)for(let K=0;K<6;K++){if(Array.isArray(g.__webglFramebuffer[K]))for(let J=0;J<g.__webglFramebuffer[K].length;J++)i.deleteFramebuffer(g.__webglFramebuffer[K][J]);else i.deleteFramebuffer(g.__webglFramebuffer[K]);g.__webglDepthbuffer&&i.deleteRenderbuffer(g.__webglDepthbuffer[K])}else{if(Array.isArray(g.__webglFramebuffer))for(let K=0;K<g.__webglFramebuffer.length;K++)i.deleteFramebuffer(g.__webglFramebuffer[K]);else i.deleteFramebuffer(g.__webglFramebuffer);if(g.__webglDepthbuffer&&i.deleteRenderbuffer(g.__webglDepthbuffer),g.__webglMultisampledFramebuffer&&i.deleteFramebuffer(g.__webglMultisampledFramebuffer),g.__webglColorRenderbuffer)for(let K=0;K<g.__webglColorRenderbuffer.length;K++)g.__webglColorRenderbuffer[K]&&i.deleteRenderbuffer(g.__webglColorRenderbuffer[K]);g.__webglDepthRenderbuffer&&i.deleteRenderbuffer(g.__webglDepthRenderbuffer)}const U=b.textures;for(let K=0,J=U.length;K<J;K++){const q=n.get(U[K]);q.__webglTexture&&(i.deleteTexture(q.__webglTexture),a.memory.textures--),n.remove(U[K])}n.remove(b)}let C=0;function O(){C=0}function z(){const b=C;return b>=r.maxTextures&&De("WebGLTextures: Trying to use "+b+" texture units while this GPU supports only "+r.maxTextures),C+=1,b}function k(b){const g=[];return g.push(b.wrapS),g.push(b.wrapT),g.push(b.wrapR||0),g.push(b.magFilter),g.push(b.minFilter),g.push(b.anisotropy),g.push(b.internalFormat),g.push(b.format),g.push(b.type),g.push(b.generateMipmaps),g.push(b.premultiplyAlpha),g.push(b.flipY),g.push(b.unpackAlignment),g.push(b.colorSpace),g.join()}function D(b,g){const U=n.get(b);if(b.isVideoTexture&&Ke(b),b.isRenderTargetTexture===!1&&b.isExternalTexture!==!0&&b.version>0&&U.__version!==b.version){const K=b.image;if(K===null)De("WebGLRenderer: Texture marked for update but no image data found.");else if(K.complete===!1)De("WebGLRenderer: Texture marked for update but image is incomplete");else{Y(U,b,g);return}}else b.isExternalTexture&&(U.__webglTexture=b.sourceTexture?b.sourceTexture:null);t.bindTexture(i.TEXTURE_2D,U.__webglTexture,i.TEXTURE0+g)}function I(b,g){const U=n.get(b);if(b.isRenderTargetTexture===!1&&b.version>0&&U.__version!==b.version){Y(U,b,g);return}else b.isExternalTexture&&(U.__webglTexture=b.sourceTexture?b.sourceTexture:null);t.bindTexture(i.TEXTURE_2D_ARRAY,U.__webglTexture,i.TEXTURE0+g)}function N(b,g){const U=n.get(b);if(b.isRenderTargetTexture===!1&&b.version>0&&U.__version!==b.version){Y(U,b,g);return}t.bindTexture(i.TEXTURE_3D,U.__webglTexture,i.TEXTURE0+g)}function $(b,g){const U=n.get(b);if(b.isCubeDepthTexture!==!0&&b.version>0&&U.__version!==b.version){ne(U,b,g);return}t.bindTexture(i.TEXTURE_CUBE_MAP,U.__webglTexture,i.TEXTURE0+g)}const j={[ta]:i.REPEAT,[gn]:i.CLAMP_TO_EDGE,[na]:i.MIRRORED_REPEAT},Q={[Et]:i.NEAREST,[Ku]:i.NEAREST_MIPMAP_NEAREST,[lr]:i.NEAREST_MIPMAP_LINEAR,[wt]:i.LINEAR,[cs]:i.LINEAR_MIPMAP_NEAREST,[$n]:i.LINEAR_MIPMAP_LINEAR},ae={[ju]:i.NEVER,[nh]:i.ALWAYS,[Ju]:i.LESS,[ja]:i.LEQUAL,[Qu]:i.EQUAL,[Ja]:i.GEQUAL,[eh]:i.GREATER,[th]:i.NOTEQUAL};function Z(b,g){if(g.type===Yt&&e.has("OES_texture_float_linear")===!1&&(g.magFilter===wt||g.magFilter===cs||g.magFilter===lr||g.magFilter===$n||g.minFilter===wt||g.minFilter===cs||g.minFilter===lr||g.minFilter===$n)&&De("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(b,i.TEXTURE_WRAP_S,j[g.wrapS]),i.texParameteri(b,i.TEXTURE_WRAP_T,j[g.wrapT]),(b===i.TEXTURE_3D||b===i.TEXTURE_2D_ARRAY)&&i.texParameteri(b,i.TEXTURE_WRAP_R,j[g.wrapR]),i.texParameteri(b,i.TEXTURE_MAG_FILTER,Q[g.magFilter]),i.texParameteri(b,i.TEXTURE_MIN_FILTER,Q[g.minFilter]),g.compareFunction&&(i.texParameteri(b,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(b,i.TEXTURE_COMPARE_FUNC,ae[g.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(g.magFilter===Et||g.minFilter!==lr&&g.minFilter!==$n||g.type===Yt&&e.has("OES_texture_float_linear")===!1)return;if(g.anisotropy>1||n.get(g).__currentAnisotropy){const U=e.get("EXT_texture_filter_anisotropic");i.texParameterf(b,U.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(g.anisotropy,r.getMaxAnisotropy())),n.get(g).__currentAnisotropy=g.anisotropy}}}function le(b,g){let U=!1;b.__webglInit===void 0&&(b.__webglInit=!0,g.addEventListener("dispose",w));const K=g.source;let J=u.get(K);J===void 0&&(J={},u.set(K,J));const q=k(g);if(q!==b.__cacheKey){J[q]===void 0&&(J[q]={texture:i.createTexture(),usedTimes:0},a.memory.textures++,U=!0),J[q].usedTimes++;const ge=J[b.__cacheKey];ge!==void 0&&(J[b.__cacheKey].usedTimes--,ge.usedTimes===0&&E(g)),b.__cacheKey=q,b.__webglTexture=J[q].texture}return U}function Re(b,g,U){return Math.floor(Math.floor(b/U)/g)}function He(b,g,U,K){const q=b.updateRanges;if(q.length===0)t.texSubImage2D(i.TEXTURE_2D,0,0,0,g.width,g.height,U,K,g.data);else{q.sort((ee,ie)=>ee.start-ie.start);let ge=0;for(let ee=1;ee<q.length;ee++){const ie=q[ge],_e=q[ee],ve=ie.start+ie.count,de=Re(_e.start,g.width,4),ze=Re(ie.start,g.width,4);_e.start<=ve+1&&de===ze&&Re(_e.start+_e.count-1,g.width,4)===de?ie.count=Math.max(ie.count,_e.start+_e.count-ie.start):(++ge,q[ge]=_e)}q.length=ge+1;const oe=i.getParameter(i.UNPACK_ROW_LENGTH),Te=i.getParameter(i.UNPACK_SKIP_PIXELS),we=i.getParameter(i.UNPACK_SKIP_ROWS);i.pixelStorei(i.UNPACK_ROW_LENGTH,g.width);for(let ee=0,ie=q.length;ee<ie;ee++){const _e=q[ee],ve=Math.floor(_e.start/4),de=Math.ceil(_e.count/4),ze=ve%g.width,L=Math.floor(ve/g.width),ce=de,re=1;i.pixelStorei(i.UNPACK_SKIP_PIXELS,ze),i.pixelStorei(i.UNPACK_SKIP_ROWS,L),t.texSubImage2D(i.TEXTURE_2D,0,ze,L,ce,re,U,K,g.data)}b.clearUpdateRanges(),i.pixelStorei(i.UNPACK_ROW_LENGTH,oe),i.pixelStorei(i.UNPACK_SKIP_PIXELS,Te),i.pixelStorei(i.UNPACK_SKIP_ROWS,we)}}function Y(b,g,U){let K=i.TEXTURE_2D;(g.isDataArrayTexture||g.isCompressedArrayTexture)&&(K=i.TEXTURE_2D_ARRAY),g.isData3DTexture&&(K=i.TEXTURE_3D);const J=le(b,g),q=g.source;t.bindTexture(K,b.__webglTexture,i.TEXTURE0+U);const ge=n.get(q);if(q.version!==ge.__version||J===!0){t.activeTexture(i.TEXTURE0+U);const oe=qe.getPrimaries(qe.workingColorSpace),Te=g.colorSpace===Dn?null:qe.getPrimaries(g.colorSpace),we=g.colorSpace===Dn||oe===Te?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,g.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,g.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,g.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,we);let ee=M(g.image,!1,r.maxTextureSize);ee=st(g,ee);const ie=s.convert(g.format,g.colorSpace),_e=s.convert(g.type);let ve=T(g.internalFormat,ie,_e,g.colorSpace,g.isVideoTexture);Z(K,g);let de;const ze=g.mipmaps,L=g.isVideoTexture!==!0,ce=ge.__version===void 0||J===!0,re=q.dataReady,me=A(g,ee);if(g.isDepthTexture)ve=y(g.format===Zn,g.type),ce&&(L?t.texStorage2D(i.TEXTURE_2D,1,ve,ee.width,ee.height):t.texImage2D(i.TEXTURE_2D,0,ve,ee.width,ee.height,0,ie,_e,null));else if(g.isDataTexture)if(ze.length>0){L&&ce&&t.texStorage2D(i.TEXTURE_2D,me,ve,ze[0].width,ze[0].height);for(let te=0,X=ze.length;te<X;te++)de=ze[te],L?re&&t.texSubImage2D(i.TEXTURE_2D,te,0,0,de.width,de.height,ie,_e,de.data):t.texImage2D(i.TEXTURE_2D,te,ve,de.width,de.height,0,ie,_e,de.data);g.generateMipmaps=!1}else L?(ce&&t.texStorage2D(i.TEXTURE_2D,me,ve,ee.width,ee.height),re&&He(g,ee,ie,_e)):t.texImage2D(i.TEXTURE_2D,0,ve,ee.width,ee.height,0,ie,_e,ee.data);else if(g.isCompressedTexture)if(g.isCompressedArrayTexture){L&&ce&&t.texStorage3D(i.TEXTURE_2D_ARRAY,me,ve,ze[0].width,ze[0].height,ee.depth);for(let te=0,X=ze.length;te<X;te++)if(de=ze[te],g.format!==Kt)if(ie!==null)if(L){if(re)if(g.layerUpdates.size>0){const xe=Jo(de.width,de.height,g.format,g.type);for(const Pe of g.layerUpdates){const at=de.data.subarray(Pe*xe/de.data.BYTES_PER_ELEMENT,(Pe+1)*xe/de.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,te,0,0,Pe,de.width,de.height,1,ie,at)}g.clearLayerUpdates()}else t.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,te,0,0,0,de.width,de.height,ee.depth,ie,de.data)}else t.compressedTexImage3D(i.TEXTURE_2D_ARRAY,te,ve,de.width,de.height,ee.depth,0,de.data,0,0);else De("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else L?re&&t.texSubImage3D(i.TEXTURE_2D_ARRAY,te,0,0,0,de.width,de.height,ee.depth,ie,_e,de.data):t.texImage3D(i.TEXTURE_2D_ARRAY,te,ve,de.width,de.height,ee.depth,0,ie,_e,de.data)}else{L&&ce&&t.texStorage2D(i.TEXTURE_2D,me,ve,ze[0].width,ze[0].height);for(let te=0,X=ze.length;te<X;te++)de=ze[te],g.format!==Kt?ie!==null?L?re&&t.compressedTexSubImage2D(i.TEXTURE_2D,te,0,0,de.width,de.height,ie,de.data):t.compressedTexImage2D(i.TEXTURE_2D,te,ve,de.width,de.height,0,de.data):De("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):L?re&&t.texSubImage2D(i.TEXTURE_2D,te,0,0,de.width,de.height,ie,_e,de.data):t.texImage2D(i.TEXTURE_2D,te,ve,de.width,de.height,0,ie,_e,de.data)}else if(g.isDataArrayTexture)if(L){if(ce&&t.texStorage3D(i.TEXTURE_2D_ARRAY,me,ve,ee.width,ee.height,ee.depth),re)if(g.layerUpdates.size>0){const te=Jo(ee.width,ee.height,g.format,g.type);for(const X of g.layerUpdates){const xe=ee.data.subarray(X*te/ee.data.BYTES_PER_ELEMENT,(X+1)*te/ee.data.BYTES_PER_ELEMENT);t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,X,ee.width,ee.height,1,ie,_e,xe)}g.clearLayerUpdates()}else t.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,ee.width,ee.height,ee.depth,ie,_e,ee.data)}else t.texImage3D(i.TEXTURE_2D_ARRAY,0,ve,ee.width,ee.height,ee.depth,0,ie,_e,ee.data);else if(g.isData3DTexture)L?(ce&&t.texStorage3D(i.TEXTURE_3D,me,ve,ee.width,ee.height,ee.depth),re&&t.texSubImage3D(i.TEXTURE_3D,0,0,0,0,ee.width,ee.height,ee.depth,ie,_e,ee.data)):t.texImage3D(i.TEXTURE_3D,0,ve,ee.width,ee.height,ee.depth,0,ie,_e,ee.data);else if(g.isFramebufferTexture){if(ce)if(L)t.texStorage2D(i.TEXTURE_2D,me,ve,ee.width,ee.height);else{let te=ee.width,X=ee.height;for(let xe=0;xe<me;xe++)t.texImage2D(i.TEXTURE_2D,xe,ve,te,X,0,ie,_e,null),te>>=1,X>>=1}}else if(ze.length>0){if(L&&ce){const te=Se(ze[0]);t.texStorage2D(i.TEXTURE_2D,me,ve,te.width,te.height)}for(let te=0,X=ze.length;te<X;te++)de=ze[te],L?re&&t.texSubImage2D(i.TEXTURE_2D,te,0,0,ie,_e,de):t.texImage2D(i.TEXTURE_2D,te,ve,ie,_e,de);g.generateMipmaps=!1}else if(L){if(ce){const te=Se(ee);t.texStorage2D(i.TEXTURE_2D,me,ve,te.width,te.height)}re&&t.texSubImage2D(i.TEXTURE_2D,0,0,0,ie,_e,ee)}else t.texImage2D(i.TEXTURE_2D,0,ve,ie,_e,ee);d(g)&&f(K),ge.__version=q.version,g.onUpdate&&g.onUpdate(g)}b.__version=g.version}function ne(b,g,U){if(g.image.length!==6)return;const K=le(b,g),J=g.source;t.bindTexture(i.TEXTURE_CUBE_MAP,b.__webglTexture,i.TEXTURE0+U);const q=n.get(J);if(J.version!==q.__version||K===!0){t.activeTexture(i.TEXTURE0+U);const ge=qe.getPrimaries(qe.workingColorSpace),oe=g.colorSpace===Dn?null:qe.getPrimaries(g.colorSpace),Te=g.colorSpace===Dn||ge===oe?i.NONE:i.BROWSER_DEFAULT_WEBGL;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,g.flipY),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,g.premultiplyAlpha),i.pixelStorei(i.UNPACK_ALIGNMENT,g.unpackAlignment),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Te);const we=g.isCompressedTexture||g.image[0].isCompressedTexture,ee=g.image[0]&&g.image[0].isDataTexture,ie=[];for(let X=0;X<6;X++)!we&&!ee?ie[X]=M(g.image[X],!0,r.maxCubemapSize):ie[X]=ee?g.image[X].image:g.image[X],ie[X]=st(g,ie[X]);const _e=ie[0],ve=s.convert(g.format,g.colorSpace),de=s.convert(g.type),ze=T(g.internalFormat,ve,de,g.colorSpace),L=g.isVideoTexture!==!0,ce=q.__version===void 0||K===!0,re=J.dataReady;let me=A(g,_e);Z(i.TEXTURE_CUBE_MAP,g);let te;if(we){L&&ce&&t.texStorage2D(i.TEXTURE_CUBE_MAP,me,ze,_e.width,_e.height);for(let X=0;X<6;X++){te=ie[X].mipmaps;for(let xe=0;xe<te.length;xe++){const Pe=te[xe];g.format!==Kt?ve!==null?L?re&&t.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,xe,0,0,Pe.width,Pe.height,ve,Pe.data):t.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,xe,ze,Pe.width,Pe.height,0,Pe.data):De("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):L?re&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,xe,0,0,Pe.width,Pe.height,ve,de,Pe.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,xe,ze,Pe.width,Pe.height,0,ve,de,Pe.data)}}}else{if(te=g.mipmaps,L&&ce){te.length>0&&me++;const X=Se(ie[0]);t.texStorage2D(i.TEXTURE_CUBE_MAP,me,ze,X.width,X.height)}for(let X=0;X<6;X++)if(ee){L?re&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,0,0,0,ie[X].width,ie[X].height,ve,de,ie[X].data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,0,ze,ie[X].width,ie[X].height,0,ve,de,ie[X].data);for(let xe=0;xe<te.length;xe++){const at=te[xe].image[X].image;L?re&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,xe+1,0,0,at.width,at.height,ve,de,at.data):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,xe+1,ze,at.width,at.height,0,ve,de,at.data)}}else{L?re&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,0,0,0,ve,de,ie[X]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,0,ze,ve,de,ie[X]);for(let xe=0;xe<te.length;xe++){const Pe=te[xe];L?re&&t.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,xe+1,0,0,ve,de,Pe.image[X]):t.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+X,xe+1,ze,ve,de,Pe.image[X])}}}d(g)&&f(i.TEXTURE_CUBE_MAP),q.__version=J.version,g.onUpdate&&g.onUpdate(g)}b.__version=g.version}function se(b,g,U,K,J,q){const ge=s.convert(U.format,U.colorSpace),oe=s.convert(U.type),Te=T(U.internalFormat,ge,oe,U.colorSpace),we=n.get(g),ee=n.get(U);if(ee.__renderTarget=g,!we.__hasExternalTextures){const ie=Math.max(1,g.width>>q),_e=Math.max(1,g.height>>q);J===i.TEXTURE_3D||J===i.TEXTURE_2D_ARRAY?t.texImage3D(J,q,Te,ie,_e,g.depth,0,ge,oe,null):t.texImage2D(J,q,Te,ie,_e,0,ge,oe,null)}t.bindFramebuffer(i.FRAMEBUFFER,b),dt(g)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,K,J,ee.__webglTexture,0,P(g)):(J===i.TEXTURE_2D||J>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&J<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,K,J,ee.__webglTexture,q),t.bindFramebuffer(i.FRAMEBUFFER,null)}function Ie(b,g,U){if(i.bindRenderbuffer(i.RENDERBUFFER,b),g.depthBuffer){const K=g.depthTexture,J=K&&K.isDepthTexture?K.type:null,q=y(g.stencilBuffer,J),ge=g.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;dt(g)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,P(g),q,g.width,g.height):U?i.renderbufferStorageMultisample(i.RENDERBUFFER,P(g),q,g.width,g.height):i.renderbufferStorage(i.RENDERBUFFER,q,g.width,g.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,ge,i.RENDERBUFFER,b)}else{const K=g.textures;for(let J=0;J<K.length;J++){const q=K[J],ge=s.convert(q.format,q.colorSpace),oe=s.convert(q.type),Te=T(q.internalFormat,ge,oe,q.colorSpace);dt(g)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,P(g),Te,g.width,g.height):U?i.renderbufferStorageMultisample(i.RENDERBUFFER,P(g),Te,g.width,g.height):i.renderbufferStorage(i.RENDERBUFFER,Te,g.width,g.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Ae(b,g,U){const K=g.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(i.FRAMEBUFFER,b),!(g.depthTexture&&g.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");const J=n.get(g.depthTexture);if(J.__renderTarget=g,(!J.__webglTexture||g.depthTexture.image.width!==g.width||g.depthTexture.image.height!==g.height)&&(g.depthTexture.image.width=g.width,g.depthTexture.image.height=g.height,g.depthTexture.needsUpdate=!0),K){if(J.__webglInit===void 0&&(J.__webglInit=!0,g.depthTexture.addEventListener("dispose",w)),J.__webglTexture===void 0){J.__webglTexture=i.createTexture(),t.bindTexture(i.TEXTURE_CUBE_MAP,J.__webglTexture),Z(i.TEXTURE_CUBE_MAP,g.depthTexture);const we=s.convert(g.depthTexture.format),ee=s.convert(g.depthTexture.type);let ie;g.depthTexture.format===Mn?ie=i.DEPTH_COMPONENT24:g.depthTexture.format===Zn&&(ie=i.DEPTH24_STENCIL8);for(let _e=0;_e<6;_e++)i.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+_e,0,ie,g.width,g.height,0,we,ee,null)}}else D(g.depthTexture,0);const q=J.__webglTexture,ge=P(g),oe=K?i.TEXTURE_CUBE_MAP_POSITIVE_X+U:i.TEXTURE_2D,Te=g.depthTexture.format===Zn?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(g.depthTexture.format===Mn)dt(g)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Te,oe,q,0,ge):i.framebufferTexture2D(i.FRAMEBUFFER,Te,oe,q,0);else if(g.depthTexture.format===Zn)dt(g)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,Te,oe,q,0,ge):i.framebufferTexture2D(i.FRAMEBUFFER,Te,oe,q,0);else throw new Error("Unknown depthTexture format")}function Ce(b){const g=n.get(b),U=b.isWebGLCubeRenderTarget===!0;if(g.__boundDepthTexture!==b.depthTexture){const K=b.depthTexture;if(g.__depthDisposeCallback&&g.__depthDisposeCallback(),K){const J=()=>{delete g.__boundDepthTexture,delete g.__depthDisposeCallback,K.removeEventListener("dispose",J)};K.addEventListener("dispose",J),g.__depthDisposeCallback=J}g.__boundDepthTexture=K}if(b.depthTexture&&!g.__autoAllocateDepthBuffer)if(U)for(let K=0;K<6;K++)Ae(g.__webglFramebuffer[K],b,K);else{const K=b.texture.mipmaps;K&&K.length>0?Ae(g.__webglFramebuffer[0],b,0):Ae(g.__webglFramebuffer,b,0)}else if(U){g.__webglDepthbuffer=[];for(let K=0;K<6;K++)if(t.bindFramebuffer(i.FRAMEBUFFER,g.__webglFramebuffer[K]),g.__webglDepthbuffer[K]===void 0)g.__webglDepthbuffer[K]=i.createRenderbuffer(),Ie(g.__webglDepthbuffer[K],b,!1);else{const J=b.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,q=g.__webglDepthbuffer[K];i.bindRenderbuffer(i.RENDERBUFFER,q),i.framebufferRenderbuffer(i.FRAMEBUFFER,J,i.RENDERBUFFER,q)}}else{const K=b.texture.mipmaps;if(K&&K.length>0?t.bindFramebuffer(i.FRAMEBUFFER,g.__webglFramebuffer[0]):t.bindFramebuffer(i.FRAMEBUFFER,g.__webglFramebuffer),g.__webglDepthbuffer===void 0)g.__webglDepthbuffer=i.createRenderbuffer(),Ie(g.__webglDepthbuffer,b,!1);else{const J=b.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,q=g.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,q),i.framebufferRenderbuffer(i.FRAMEBUFFER,J,i.RENDERBUFFER,q)}}t.bindFramebuffer(i.FRAMEBUFFER,null)}function xt(b,g,U){const K=n.get(b);g!==void 0&&se(K.__webglFramebuffer,b,b.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),U!==void 0&&Ce(b)}function We(b){const g=b.texture,U=n.get(b),K=n.get(g);b.addEventListener("dispose",R);const J=b.textures,q=b.isWebGLCubeRenderTarget===!0,ge=J.length>1;if(ge||(K.__webglTexture===void 0&&(K.__webglTexture=i.createTexture()),K.__version=g.version,a.memory.textures++),q){U.__webglFramebuffer=[];for(let oe=0;oe<6;oe++)if(g.mipmaps&&g.mipmaps.length>0){U.__webglFramebuffer[oe]=[];for(let Te=0;Te<g.mipmaps.length;Te++)U.__webglFramebuffer[oe][Te]=i.createFramebuffer()}else U.__webglFramebuffer[oe]=i.createFramebuffer()}else{if(g.mipmaps&&g.mipmaps.length>0){U.__webglFramebuffer=[];for(let oe=0;oe<g.mipmaps.length;oe++)U.__webglFramebuffer[oe]=i.createFramebuffer()}else U.__webglFramebuffer=i.createFramebuffer();if(ge)for(let oe=0,Te=J.length;oe<Te;oe++){const we=n.get(J[oe]);we.__webglTexture===void 0&&(we.__webglTexture=i.createTexture(),a.memory.textures++)}if(b.samples>0&&dt(b)===!1){U.__webglMultisampledFramebuffer=i.createFramebuffer(),U.__webglColorRenderbuffer=[],t.bindFramebuffer(i.FRAMEBUFFER,U.__webglMultisampledFramebuffer);for(let oe=0;oe<J.length;oe++){const Te=J[oe];U.__webglColorRenderbuffer[oe]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,U.__webglColorRenderbuffer[oe]);const we=s.convert(Te.format,Te.colorSpace),ee=s.convert(Te.type),ie=T(Te.internalFormat,we,ee,Te.colorSpace,b.isXRRenderTarget===!0),_e=P(b);i.renderbufferStorageMultisample(i.RENDERBUFFER,_e,ie,b.width,b.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+oe,i.RENDERBUFFER,U.__webglColorRenderbuffer[oe])}i.bindRenderbuffer(i.RENDERBUFFER,null),b.depthBuffer&&(U.__webglDepthRenderbuffer=i.createRenderbuffer(),Ie(U.__webglDepthRenderbuffer,b,!0)),t.bindFramebuffer(i.FRAMEBUFFER,null)}}if(q){t.bindTexture(i.TEXTURE_CUBE_MAP,K.__webglTexture),Z(i.TEXTURE_CUBE_MAP,g);for(let oe=0;oe<6;oe++)if(g.mipmaps&&g.mipmaps.length>0)for(let Te=0;Te<g.mipmaps.length;Te++)se(U.__webglFramebuffer[oe][Te],b,g,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,Te);else se(U.__webglFramebuffer[oe],b,g,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0);d(g)&&f(i.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(ge){for(let oe=0,Te=J.length;oe<Te;oe++){const we=J[oe],ee=n.get(we);let ie=i.TEXTURE_2D;(b.isWebGL3DRenderTarget||b.isWebGLArrayRenderTarget)&&(ie=b.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(ie,ee.__webglTexture),Z(ie,we),se(U.__webglFramebuffer,b,we,i.COLOR_ATTACHMENT0+oe,ie,0),d(we)&&f(ie)}t.unbindTexture()}else{let oe=i.TEXTURE_2D;if((b.isWebGL3DRenderTarget||b.isWebGLArrayRenderTarget)&&(oe=b.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),t.bindTexture(oe,K.__webglTexture),Z(oe,g),g.mipmaps&&g.mipmaps.length>0)for(let Te=0;Te<g.mipmaps.length;Te++)se(U.__webglFramebuffer[Te],b,g,i.COLOR_ATTACHMENT0,oe,Te);else se(U.__webglFramebuffer,b,g,i.COLOR_ATTACHMENT0,oe,0);d(g)&&f(oe),t.unbindTexture()}b.depthBuffer&&Ce(b)}function $e(b){const g=b.textures;for(let U=0,K=g.length;U<K;U++){const J=g[U];if(d(J)){const q=S(b),ge=n.get(J).__webglTexture;t.bindTexture(q,ge),f(q),t.unbindTexture()}}}const it=[],Be=[];function ht(b){if(b.samples>0){if(dt(b)===!1){const g=b.textures,U=b.width,K=b.height;let J=i.COLOR_BUFFER_BIT;const q=b.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,ge=n.get(b),oe=g.length>1;if(oe)for(let we=0;we<g.length;we++)t.bindFramebuffer(i.FRAMEBUFFER,ge.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+we,i.RENDERBUFFER,null),t.bindFramebuffer(i.FRAMEBUFFER,ge.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+we,i.TEXTURE_2D,null,0);t.bindFramebuffer(i.READ_FRAMEBUFFER,ge.__webglMultisampledFramebuffer);const Te=b.texture.mipmaps;Te&&Te.length>0?t.bindFramebuffer(i.DRAW_FRAMEBUFFER,ge.__webglFramebuffer[0]):t.bindFramebuffer(i.DRAW_FRAMEBUFFER,ge.__webglFramebuffer);for(let we=0;we<g.length;we++){if(b.resolveDepthBuffer&&(b.depthBuffer&&(J|=i.DEPTH_BUFFER_BIT),b.stencilBuffer&&b.resolveStencilBuffer&&(J|=i.STENCIL_BUFFER_BIT)),oe){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,ge.__webglColorRenderbuffer[we]);const ee=n.get(g[we]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,ee,0)}i.blitFramebuffer(0,0,U,K,0,0,U,K,J,i.NEAREST),l===!0&&(it.length=0,Be.length=0,it.push(i.COLOR_ATTACHMENT0+we),b.depthBuffer&&b.resolveDepthBuffer===!1&&(it.push(q),Be.push(q),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,Be)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,it))}if(t.bindFramebuffer(i.READ_FRAMEBUFFER,null),t.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),oe)for(let we=0;we<g.length;we++){t.bindFramebuffer(i.FRAMEBUFFER,ge.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+we,i.RENDERBUFFER,ge.__webglColorRenderbuffer[we]);const ee=n.get(g[we]).__webglTexture;t.bindFramebuffer(i.FRAMEBUFFER,ge.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+we,i.TEXTURE_2D,ee,0)}t.bindFramebuffer(i.DRAW_FRAMEBUFFER,ge.__webglMultisampledFramebuffer)}else if(b.depthBuffer&&b.resolveDepthBuffer===!1&&l){const g=b.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[g])}}}function P(b){return Math.min(r.maxSamples,b.samples)}function dt(b){const g=n.get(b);return b.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&g.__useRenderToTexture!==!1}function Ke(b){const g=a.render.frame;h.get(b)!==g&&(h.set(b,g),b.update())}function st(b,g){const U=b.colorSpace,K=b.format,J=b.type;return b.isCompressedTexture===!0||b.isVideoTexture===!0||U!==Ii&&U!==Dn&&(qe.getTransfer(U)===je?(K!==Kt||J!==Ot)&&De("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Xe("WebGLTextures: Unsupported texture color space:",U)),g}function Se(b){return typeof HTMLImageElement<"u"&&b instanceof HTMLImageElement?(c.width=b.naturalWidth||b.width,c.height=b.naturalHeight||b.height):typeof VideoFrame<"u"&&b instanceof VideoFrame?(c.width=b.displayWidth,c.height=b.displayHeight):(c.width=b.width,c.height=b.height),c}this.allocateTextureUnit=z,this.resetTextureUnits=O,this.setTexture2D=D,this.setTexture2DArray=I,this.setTexture3D=N,this.setTextureCube=$,this.rebindTextures=xt,this.setupRenderTarget=We,this.updateRenderTargetMipmap=$e,this.updateMultisampleRenderTarget=ht,this.setupDepthRenderbuffer=Ce,this.setupFrameBufferTexture=se,this.useMultisampledRTT=dt,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function Ig(i,e){function t(n,r=Dn){let s;const a=qe.getTransfer(r);if(n===Ot)return i.UNSIGNED_BYTE;if(n===Xa)return i.UNSIGNED_SHORT_4_4_4_4;if(n===qa)return i.UNSIGNED_SHORT_5_5_5_1;if(n===Kc)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===$c)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===qc)return i.BYTE;if(n===Yc)return i.SHORT;if(n===er)return i.UNSIGNED_SHORT;if(n===Wa)return i.INT;if(n===sn)return i.UNSIGNED_INT;if(n===Yt)return i.FLOAT;if(n===vn)return i.HALF_FLOAT;if(n===Zc)return i.ALPHA;if(n===jc)return i.RGB;if(n===Kt)return i.RGBA;if(n===Mn)return i.DEPTH_COMPONENT;if(n===Zn)return i.DEPTH_STENCIL;if(n===Ya)return i.RED;if(n===Ka)return i.RED_INTEGER;if(n===Li)return i.RG;if(n===$a)return i.RG_INTEGER;if(n===Za)return i.RGBA_INTEGER;if(n===Gr||n===Vr||n===kr||n===Hr)if(a===je)if(s=e.get("WEBGL_compressed_texture_s3tc_srgb"),s!==null){if(n===Gr)return s.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Vr)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===kr)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Hr)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(s=e.get("WEBGL_compressed_texture_s3tc"),s!==null){if(n===Gr)return s.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Vr)return s.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===kr)return s.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Hr)return s.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===ia||n===ra||n===sa||n===aa)if(s=e.get("WEBGL_compressed_texture_pvrtc"),s!==null){if(n===ia)return s.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===ra)return s.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===sa)return s.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===aa)return s.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===oa||n===ca||n===la||n===ua||n===ha||n===fa||n===da)if(s=e.get("WEBGL_compressed_texture_etc"),s!==null){if(n===oa||n===ca)return a===je?s.COMPRESSED_SRGB8_ETC2:s.COMPRESSED_RGB8_ETC2;if(n===la)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:s.COMPRESSED_RGBA8_ETC2_EAC;if(n===ua)return s.COMPRESSED_R11_EAC;if(n===ha)return s.COMPRESSED_SIGNED_R11_EAC;if(n===fa)return s.COMPRESSED_RG11_EAC;if(n===da)return s.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===pa||n===ma||n===ga||n===_a||n===xa||n===va||n===Ma||n===Sa||n===Ea||n===ya||n===ba||n===Ta||n===Aa||n===wa)if(s=e.get("WEBGL_compressed_texture_astc"),s!==null){if(n===pa)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:s.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===ma)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:s.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===ga)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:s.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===_a)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:s.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===xa)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:s.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===va)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:s.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Ma)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:s.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===Sa)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:s.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===Ea)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:s.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===ya)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:s.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===ba)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:s.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===Ta)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:s.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===Aa)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:s.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===wa)return a===je?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:s.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Ra||n===Ca||n===Pa)if(s=e.get("EXT_texture_compression_bptc"),s!==null){if(n===Ra)return a===je?s.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:s.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Ca)return s.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Pa)return s.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Da||n===La||n===Ia||n===Ua)if(s=e.get("EXT_texture_compression_rgtc"),s!==null){if(n===Da)return s.COMPRESSED_RED_RGTC1_EXT;if(n===La)return s.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Ia)return s.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===Ua)return s.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===tr?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:t}}const Ug=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Ng=`
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

}`;class Fg{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){const n=new fl(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,n=new on({vertexShader:Ug,fragmentShader:Ng,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new Ve(new sr(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class Og extends Fi{constructor(e,t){super();const n=this;let r=null,s=1,a=null,o="local-floor",l=1,c=null,h=null,p=null,u=null,m=null,_=null;const M=typeof XRWebGLBinding<"u",d=new Fg,f={},S=t.getContextAttributes();let T=null,y=null;const A=[],w=[],R=new Fe;let x=null;const E=new Ft;E.viewport=new ut;const H=new Ft;H.viewport=new ut;const C=[E,H],O=new Kh;let z=null,k=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(Y){let ne=A[Y];return ne===void 0&&(ne=new gs,A[Y]=ne),ne.getTargetRaySpace()},this.getControllerGrip=function(Y){let ne=A[Y];return ne===void 0&&(ne=new gs,A[Y]=ne),ne.getGripSpace()},this.getHand=function(Y){let ne=A[Y];return ne===void 0&&(ne=new gs,A[Y]=ne),ne.getHandSpace()};function D(Y){const ne=w.indexOf(Y.inputSource);if(ne===-1)return;const se=A[ne];se!==void 0&&(se.update(Y.inputSource,Y.frame,c||a),se.dispatchEvent({type:Y.type,data:Y.inputSource}))}function I(){r.removeEventListener("select",D),r.removeEventListener("selectstart",D),r.removeEventListener("selectend",D),r.removeEventListener("squeeze",D),r.removeEventListener("squeezestart",D),r.removeEventListener("squeezeend",D),r.removeEventListener("end",I),r.removeEventListener("inputsourceschange",N);for(let Y=0;Y<A.length;Y++){const ne=w[Y];ne!==null&&(w[Y]=null,A[Y].disconnect(ne))}z=null,k=null,d.reset();for(const Y in f)delete f[Y];e.setRenderTarget(T),m=null,u=null,p=null,r=null,y=null,He.stop(),n.isPresenting=!1,e.setPixelRatio(x),e.setSize(R.width,R.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(Y){s=Y,n.isPresenting===!0&&De("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(Y){o=Y,n.isPresenting===!0&&De("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(Y){c=Y},this.getBaseLayer=function(){return u!==null?u:m},this.getBinding=function(){return p===null&&M&&(p=new XRWebGLBinding(r,t)),p},this.getFrame=function(){return _},this.getSession=function(){return r},this.setSession=async function(Y){if(r=Y,r!==null){if(T=e.getRenderTarget(),r.addEventListener("select",D),r.addEventListener("selectstart",D),r.addEventListener("selectend",D),r.addEventListener("squeeze",D),r.addEventListener("squeezestart",D),r.addEventListener("squeezeend",D),r.addEventListener("end",I),r.addEventListener("inputsourceschange",N),S.xrCompatible!==!0&&await t.makeXRCompatible(),x=e.getPixelRatio(),e.getSize(R),M&&"createProjectionLayer"in XRWebGLBinding.prototype){let se=null,Ie=null,Ae=null;S.depth&&(Ae=S.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,se=S.stencil?Zn:Mn,Ie=S.stencil?tr:sn);const Ce={colorFormat:t.RGBA8,depthFormat:Ae,scaleFactor:s};p=this.getBinding(),u=p.createProjectionLayer(Ce),r.updateRenderState({layers:[u]}),e.setPixelRatio(1),e.setSize(u.textureWidth,u.textureHeight,!1),y=new rn(u.textureWidth,u.textureHeight,{format:Kt,type:Ot,depthTexture:new ir(u.textureWidth,u.textureHeight,Ie,void 0,void 0,void 0,void 0,void 0,void 0,se),stencilBuffer:S.stencil,colorSpace:e.outputColorSpace,samples:S.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1})}else{const se={antialias:S.antialias,alpha:!0,depth:S.depth,stencil:S.stencil,framebufferScaleFactor:s};m=new XRWebGLLayer(r,t,se),r.updateRenderState({baseLayer:m}),e.setPixelRatio(1),e.setSize(m.framebufferWidth,m.framebufferHeight,!1),y=new rn(m.framebufferWidth,m.framebufferHeight,{format:Kt,type:Ot,colorSpace:e.outputColorSpace,stencilBuffer:S.stencil,resolveDepthBuffer:m.ignoreDepthValues===!1,resolveStencilBuffer:m.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await r.requestReferenceSpace(o),He.setContext(r),He.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return d.getDepthTexture()};function N(Y){for(let ne=0;ne<Y.removed.length;ne++){const se=Y.removed[ne],Ie=w.indexOf(se);Ie>=0&&(w[Ie]=null,A[Ie].disconnect(se))}for(let ne=0;ne<Y.added.length;ne++){const se=Y.added[ne];let Ie=w.indexOf(se);if(Ie===-1){for(let Ce=0;Ce<A.length;Ce++)if(Ce>=w.length){w.push(se),Ie=Ce;break}else if(w[Ce]===null){w[Ce]=se,Ie=Ce;break}if(Ie===-1)break}const Ae=A[Ie];Ae&&Ae.connect(se)}}const $=new B,j=new B;function Q(Y,ne,se){$.setFromMatrixPosition(ne.matrixWorld),j.setFromMatrixPosition(se.matrixWorld);const Ie=$.distanceTo(j),Ae=ne.projectionMatrix.elements,Ce=se.projectionMatrix.elements,xt=Ae[14]/(Ae[10]-1),We=Ae[14]/(Ae[10]+1),$e=(Ae[9]+1)/Ae[5],it=(Ae[9]-1)/Ae[5],Be=(Ae[8]-1)/Ae[0],ht=(Ce[8]+1)/Ce[0],P=xt*Be,dt=xt*ht,Ke=Ie/(-Be+ht),st=Ke*-Be;if(ne.matrixWorld.decompose(Y.position,Y.quaternion,Y.scale),Y.translateX(st),Y.translateZ(Ke),Y.matrixWorld.compose(Y.position,Y.quaternion,Y.scale),Y.matrixWorldInverse.copy(Y.matrixWorld).invert(),Ae[10]===-1)Y.projectionMatrix.copy(ne.projectionMatrix),Y.projectionMatrixInverse.copy(ne.projectionMatrixInverse);else{const Se=xt+Ke,b=We+Ke,g=P-st,U=dt+(Ie-st),K=$e*We/b*Se,J=it*We/b*Se;Y.projectionMatrix.makePerspective(g,U,K,J,Se,b),Y.projectionMatrixInverse.copy(Y.projectionMatrix).invert()}}function ae(Y,ne){ne===null?Y.matrixWorld.copy(Y.matrix):Y.matrixWorld.multiplyMatrices(ne.matrixWorld,Y.matrix),Y.matrixWorldInverse.copy(Y.matrixWorld).invert()}this.updateCamera=function(Y){if(r===null)return;let ne=Y.near,se=Y.far;d.texture!==null&&(d.depthNear>0&&(ne=d.depthNear),d.depthFar>0&&(se=d.depthFar)),O.near=H.near=E.near=ne,O.far=H.far=E.far=se,(z!==O.near||k!==O.far)&&(r.updateRenderState({depthNear:O.near,depthFar:O.far}),z=O.near,k=O.far),O.layers.mask=Y.layers.mask|6,E.layers.mask=O.layers.mask&-5,H.layers.mask=O.layers.mask&-3;const Ie=Y.parent,Ae=O.cameras;ae(O,Ie);for(let Ce=0;Ce<Ae.length;Ce++)ae(Ae[Ce],Ie);Ae.length===2?Q(O,E,H):O.projectionMatrix.copy(E.projectionMatrix),Z(Y,O,Ie)};function Z(Y,ne,se){se===null?Y.matrix.copy(ne.matrixWorld):(Y.matrix.copy(se.matrixWorld),Y.matrix.invert(),Y.matrix.multiply(ne.matrixWorld)),Y.matrix.decompose(Y.position,Y.quaternion,Y.scale),Y.updateMatrixWorld(!0),Y.projectionMatrix.copy(ne.projectionMatrix),Y.projectionMatrixInverse.copy(ne.projectionMatrixInverse),Y.isPerspectiveCamera&&(Y.fov=Fa*2*Math.atan(1/Y.projectionMatrix.elements[5]),Y.zoom=1)}this.getCamera=function(){return O},this.getFoveation=function(){if(!(u===null&&m===null))return l},this.setFoveation=function(Y){l=Y,u!==null&&(u.fixedFoveation=Y),m!==null&&m.fixedFoveation!==void 0&&(m.fixedFoveation=Y)},this.hasDepthSensing=function(){return d.texture!==null},this.getDepthSensingMesh=function(){return d.getMesh(O)},this.getCameraTexture=function(Y){return f[Y]};let le=null;function Re(Y,ne){if(h=ne.getViewerPose(c||a),_=ne,h!==null){const se=h.views;m!==null&&(e.setRenderTargetFramebuffer(y,m.framebuffer),e.setRenderTarget(y));let Ie=!1;se.length!==O.cameras.length&&(O.cameras.length=0,Ie=!0);for(let We=0;We<se.length;We++){const $e=se[We];let it=null;if(m!==null)it=m.getViewport($e);else{const ht=p.getViewSubImage(u,$e);it=ht.viewport,We===0&&(e.setRenderTargetTextures(y,ht.colorTexture,ht.depthStencilTexture),e.setRenderTarget(y))}let Be=C[We];Be===void 0&&(Be=new Ft,Be.layers.enable(We),Be.viewport=new ut,C[We]=Be),Be.matrix.fromArray($e.transform.matrix),Be.matrix.decompose(Be.position,Be.quaternion,Be.scale),Be.projectionMatrix.fromArray($e.projectionMatrix),Be.projectionMatrixInverse.copy(Be.projectionMatrix).invert(),Be.viewport.set(it.x,it.y,it.width,it.height),We===0&&(O.matrix.copy(Be.matrix),O.matrix.decompose(O.position,O.quaternion,O.scale)),Ie===!0&&O.cameras.push(Be)}const Ae=r.enabledFeatures;if(Ae&&Ae.includes("depth-sensing")&&r.depthUsage=="gpu-optimized"&&M){p=n.getBinding();const We=p.getDepthInformation(se[0]);We&&We.isValid&&We.texture&&d.init(We,r.renderState)}if(Ae&&Ae.includes("camera-access")&&M){e.state.unbindTexture(),p=n.getBinding();for(let We=0;We<se.length;We++){const $e=se[We].camera;if($e){let it=f[$e];it||(it=new fl,f[$e]=it);const Be=p.getCameraImage($e);it.sourceTexture=Be}}}}for(let se=0;se<A.length;se++){const Ie=w[se],Ae=A[se];Ie!==null&&Ae!==void 0&&Ae.update(Ie,ne,c||a)}le&&le(Y,ne),ne.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:ne}),_=null}const He=new _l;He.setAnimationLoop(Re),this.setAnimationLoop=function(Y){le=Y},this.dispose=function(){}}}const kn=new an,Bg=new Je;function zg(i,e){function t(d,f){d.matrixAutoUpdate===!0&&d.updateMatrix(),f.value.copy(d.matrix)}function n(d,f){f.color.getRGB(d.fogColor.value,dl(i)),f.isFog?(d.fogNear.value=f.near,d.fogFar.value=f.far):f.isFogExp2&&(d.fogDensity.value=f.density)}function r(d,f,S,T,y){f.isMeshBasicMaterial?s(d,f):f.isMeshLambertMaterial?(s(d,f),f.envMap&&(d.envMapIntensity.value=f.envMapIntensity)):f.isMeshToonMaterial?(s(d,f),p(d,f)):f.isMeshPhongMaterial?(s(d,f),h(d,f),f.envMap&&(d.envMapIntensity.value=f.envMapIntensity)):f.isMeshStandardMaterial?(s(d,f),u(d,f),f.isMeshPhysicalMaterial&&m(d,f,y)):f.isMeshMatcapMaterial?(s(d,f),_(d,f)):f.isMeshDepthMaterial?s(d,f):f.isMeshDistanceMaterial?(s(d,f),M(d,f)):f.isMeshNormalMaterial?s(d,f):f.isLineBasicMaterial?(a(d,f),f.isLineDashedMaterial&&o(d,f)):f.isPointsMaterial?l(d,f,S,T):f.isSpriteMaterial?c(d,f):f.isShadowMaterial?(d.color.value.copy(f.color),d.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function s(d,f){d.opacity.value=f.opacity,f.color&&d.diffuse.value.copy(f.color),f.emissive&&d.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(d.map.value=f.map,t(f.map,d.mapTransform)),f.alphaMap&&(d.alphaMap.value=f.alphaMap,t(f.alphaMap,d.alphaMapTransform)),f.bumpMap&&(d.bumpMap.value=f.bumpMap,t(f.bumpMap,d.bumpMapTransform),d.bumpScale.value=f.bumpScale,f.side===Dt&&(d.bumpScale.value*=-1)),f.normalMap&&(d.normalMap.value=f.normalMap,t(f.normalMap,d.normalMapTransform),d.normalScale.value.copy(f.normalScale),f.side===Dt&&d.normalScale.value.negate()),f.displacementMap&&(d.displacementMap.value=f.displacementMap,t(f.displacementMap,d.displacementMapTransform),d.displacementScale.value=f.displacementScale,d.displacementBias.value=f.displacementBias),f.emissiveMap&&(d.emissiveMap.value=f.emissiveMap,t(f.emissiveMap,d.emissiveMapTransform)),f.specularMap&&(d.specularMap.value=f.specularMap,t(f.specularMap,d.specularMapTransform)),f.alphaTest>0&&(d.alphaTest.value=f.alphaTest);const S=e.get(f),T=S.envMap,y=S.envMapRotation;T&&(d.envMap.value=T,kn.copy(y),kn.x*=-1,kn.y*=-1,kn.z*=-1,T.isCubeTexture&&T.isRenderTargetTexture===!1&&(kn.y*=-1,kn.z*=-1),d.envMapRotation.value.setFromMatrix4(Bg.makeRotationFromEuler(kn)),d.flipEnvMap.value=T.isCubeTexture&&T.isRenderTargetTexture===!1?-1:1,d.reflectivity.value=f.reflectivity,d.ior.value=f.ior,d.refractionRatio.value=f.refractionRatio),f.lightMap&&(d.lightMap.value=f.lightMap,d.lightMapIntensity.value=f.lightMapIntensity,t(f.lightMap,d.lightMapTransform)),f.aoMap&&(d.aoMap.value=f.aoMap,d.aoMapIntensity.value=f.aoMapIntensity,t(f.aoMap,d.aoMapTransform))}function a(d,f){d.diffuse.value.copy(f.color),d.opacity.value=f.opacity,f.map&&(d.map.value=f.map,t(f.map,d.mapTransform))}function o(d,f){d.dashSize.value=f.dashSize,d.totalSize.value=f.dashSize+f.gapSize,d.scale.value=f.scale}function l(d,f,S,T){d.diffuse.value.copy(f.color),d.opacity.value=f.opacity,d.size.value=f.size*S,d.scale.value=T*.5,f.map&&(d.map.value=f.map,t(f.map,d.uvTransform)),f.alphaMap&&(d.alphaMap.value=f.alphaMap,t(f.alphaMap,d.alphaMapTransform)),f.alphaTest>0&&(d.alphaTest.value=f.alphaTest)}function c(d,f){d.diffuse.value.copy(f.color),d.opacity.value=f.opacity,d.rotation.value=f.rotation,f.map&&(d.map.value=f.map,t(f.map,d.mapTransform)),f.alphaMap&&(d.alphaMap.value=f.alphaMap,t(f.alphaMap,d.alphaMapTransform)),f.alphaTest>0&&(d.alphaTest.value=f.alphaTest)}function h(d,f){d.specular.value.copy(f.specular),d.shininess.value=Math.max(f.shininess,1e-4)}function p(d,f){f.gradientMap&&(d.gradientMap.value=f.gradientMap)}function u(d,f){d.metalness.value=f.metalness,f.metalnessMap&&(d.metalnessMap.value=f.metalnessMap,t(f.metalnessMap,d.metalnessMapTransform)),d.roughness.value=f.roughness,f.roughnessMap&&(d.roughnessMap.value=f.roughnessMap,t(f.roughnessMap,d.roughnessMapTransform)),f.envMap&&(d.envMapIntensity.value=f.envMapIntensity)}function m(d,f,S){d.ior.value=f.ior,f.sheen>0&&(d.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),d.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(d.sheenColorMap.value=f.sheenColorMap,t(f.sheenColorMap,d.sheenColorMapTransform)),f.sheenRoughnessMap&&(d.sheenRoughnessMap.value=f.sheenRoughnessMap,t(f.sheenRoughnessMap,d.sheenRoughnessMapTransform))),f.clearcoat>0&&(d.clearcoat.value=f.clearcoat,d.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(d.clearcoatMap.value=f.clearcoatMap,t(f.clearcoatMap,d.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(d.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,t(f.clearcoatRoughnessMap,d.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(d.clearcoatNormalMap.value=f.clearcoatNormalMap,t(f.clearcoatNormalMap,d.clearcoatNormalMapTransform),d.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===Dt&&d.clearcoatNormalScale.value.negate())),f.dispersion>0&&(d.dispersion.value=f.dispersion),f.iridescence>0&&(d.iridescence.value=f.iridescence,d.iridescenceIOR.value=f.iridescenceIOR,d.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],d.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(d.iridescenceMap.value=f.iridescenceMap,t(f.iridescenceMap,d.iridescenceMapTransform)),f.iridescenceThicknessMap&&(d.iridescenceThicknessMap.value=f.iridescenceThicknessMap,t(f.iridescenceThicknessMap,d.iridescenceThicknessMapTransform))),f.transmission>0&&(d.transmission.value=f.transmission,d.transmissionSamplerMap.value=S.texture,d.transmissionSamplerSize.value.set(S.width,S.height),f.transmissionMap&&(d.transmissionMap.value=f.transmissionMap,t(f.transmissionMap,d.transmissionMapTransform)),d.thickness.value=f.thickness,f.thicknessMap&&(d.thicknessMap.value=f.thicknessMap,t(f.thicknessMap,d.thicknessMapTransform)),d.attenuationDistance.value=f.attenuationDistance,d.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(d.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(d.anisotropyMap.value=f.anisotropyMap,t(f.anisotropyMap,d.anisotropyMapTransform))),d.specularIntensity.value=f.specularIntensity,d.specularColor.value.copy(f.specularColor),f.specularColorMap&&(d.specularColorMap.value=f.specularColorMap,t(f.specularColorMap,d.specularColorMapTransform)),f.specularIntensityMap&&(d.specularIntensityMap.value=f.specularIntensityMap,t(f.specularIntensityMap,d.specularIntensityMapTransform))}function _(d,f){f.matcap&&(d.matcap.value=f.matcap)}function M(d,f){const S=e.get(f).light;d.referencePosition.value.setFromMatrixPosition(S.matrixWorld),d.nearDistance.value=S.shadow.camera.near,d.farDistance.value=S.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:r}}function Gg(i,e,t,n){let r={},s={},a=[];const o=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function l(S,T){const y=T.program;n.uniformBlockBinding(S,y)}function c(S,T){let y=r[S.id];y===void 0&&(_(S),y=h(S),r[S.id]=y,S.addEventListener("dispose",d));const A=T.program;n.updateUBOMapping(S,A);const w=e.render.frame;s[S.id]!==w&&(u(S),s[S.id]=w)}function h(S){const T=p();S.__bindingPointIndex=T;const y=i.createBuffer(),A=S.__size,w=S.usage;return i.bindBuffer(i.UNIFORM_BUFFER,y),i.bufferData(i.UNIFORM_BUFFER,A,w),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,T,y),y}function p(){for(let S=0;S<o;S++)if(a.indexOf(S)===-1)return a.push(S),S;return Xe("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(S){const T=r[S.id],y=S.uniforms,A=S.__cache;i.bindBuffer(i.UNIFORM_BUFFER,T);for(let w=0,R=y.length;w<R;w++){const x=Array.isArray(y[w])?y[w]:[y[w]];for(let E=0,H=x.length;E<H;E++){const C=x[E];if(m(C,w,E,A)===!0){const O=C.__offset,z=Array.isArray(C.value)?C.value:[C.value];let k=0;for(let D=0;D<z.length;D++){const I=z[D],N=M(I);typeof I=="number"||typeof I=="boolean"?(C.__data[0]=I,i.bufferSubData(i.UNIFORM_BUFFER,O+k,C.__data)):I.isMatrix3?(C.__data[0]=I.elements[0],C.__data[1]=I.elements[1],C.__data[2]=I.elements[2],C.__data[3]=0,C.__data[4]=I.elements[3],C.__data[5]=I.elements[4],C.__data[6]=I.elements[5],C.__data[7]=0,C.__data[8]=I.elements[6],C.__data[9]=I.elements[7],C.__data[10]=I.elements[8],C.__data[11]=0):(I.toArray(C.__data,k),k+=N.storage/Float32Array.BYTES_PER_ELEMENT)}i.bufferSubData(i.UNIFORM_BUFFER,O,C.__data)}}}i.bindBuffer(i.UNIFORM_BUFFER,null)}function m(S,T,y,A){const w=S.value,R=T+"_"+y;if(A[R]===void 0)return typeof w=="number"||typeof w=="boolean"?A[R]=w:A[R]=w.clone(),!0;{const x=A[R];if(typeof w=="number"||typeof w=="boolean"){if(x!==w)return A[R]=w,!0}else if(x.equals(w)===!1)return x.copy(w),!0}return!1}function _(S){const T=S.uniforms;let y=0;const A=16;for(let R=0,x=T.length;R<x;R++){const E=Array.isArray(T[R])?T[R]:[T[R]];for(let H=0,C=E.length;H<C;H++){const O=E[H],z=Array.isArray(O.value)?O.value:[O.value];for(let k=0,D=z.length;k<D;k++){const I=z[k],N=M(I),$=y%A,j=$%N.boundary,Q=$+j;y+=j,Q!==0&&A-Q<N.storage&&(y+=A-Q),O.__data=new Float32Array(N.storage/Float32Array.BYTES_PER_ELEMENT),O.__offset=y,y+=N.storage}}}const w=y%A;return w>0&&(y+=A-w),S.__size=y,S.__cache={},this}function M(S){const T={boundary:0,storage:0};return typeof S=="number"||typeof S=="boolean"?(T.boundary=4,T.storage=4):S.isVector2?(T.boundary=8,T.storage=8):S.isVector3||S.isColor?(T.boundary=16,T.storage=12):S.isVector4?(T.boundary=16,T.storage=16):S.isMatrix3?(T.boundary=48,T.storage=48):S.isMatrix4?(T.boundary=64,T.storage=64):S.isTexture?De("WebGLRenderer: Texture samplers can not be part of an uniforms group."):De("WebGLRenderer: Unsupported uniform value type.",S),T}function d(S){const T=S.target;T.removeEventListener("dispose",d);const y=a.indexOf(T.__bindingPointIndex);a.splice(y,1),i.deleteBuffer(r[T.id]),delete r[T.id],delete s[T.id]}function f(){for(const S in r)i.deleteBuffer(r[S]);a=[],r={},s={}}return{bind:l,update:c,dispose:f}}const Vg=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let jt=null;function kg(){return jt===null&&(jt=new ll(Vg,16,16,Li,vn),jt.name="DFG_LUT",jt.minFilter=wt,jt.magFilter=wt,jt.wrapS=gn,jt.wrapT=gn,jt.generateMipmaps=!1,jt.needsUpdate=!0),jt}class Hg{constructor(e={}){const{canvas:t=rh(),context:n=null,depth:r=!0,stencil:s=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:p=!1,reversedDepthBuffer:u=!1,outputBufferType:m=Ot}=e;this.isWebGLRenderer=!0;let _;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");_=n.getContextAttributes().alpha}else _=a;const M=m,d=new Set([Za,$a,Ka]),f=new Set([Ot,sn,er,tr,Xa,qa]),S=new Uint32Array(4),T=new Int32Array(4);let y=null,A=null;const w=[],R=[];let x=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=nn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const E=this;let H=!1;this._outputColorSpace=Gt;let C=0,O=0,z=null,k=-1,D=null;const I=new ut,N=new ut;let $=null;const j=new Ne(0);let Q=0,ae=t.width,Z=t.height,le=1,Re=null,He=null;const Y=new ut(0,0,ae,Z),ne=new ut(0,0,ae,Z);let se=!1;const Ie=new to;let Ae=!1,Ce=!1;const xt=new Je,We=new B,$e=new ut,it={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let Be=!1;function ht(){return z===null?le:1}let P=n;function dt(v,F){return t.getContext(v,F)}try{const v={alpha:!0,depth:r,stencil:s,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:p};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${Ha}`),t.addEventListener("webglcontextlost",xe,!1),t.addEventListener("webglcontextrestored",Pe,!1),t.addEventListener("webglcontextcreationerror",at,!1),P===null){const F="webgl2";if(P=dt(F,v),P===null)throw dt(F)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(v){throw Xe("WebGLRenderer: "+v.message),v}let Ke,st,Se,b,g,U,K,J,q,ge,oe,Te,we,ee,ie,_e,ve,de,ze,L,ce,re,me;function te(){Ke=new Hp(P),Ke.init(),ce=new Ig(P,Ke),st=new Np(P,Ke,e,ce),Se=new Dg(P,Ke),st.reversedDepthBuffer&&u&&Se.buffers.depth.setReversed(!0),b=new qp(P),g=new _g,U=new Lg(P,Ke,Se,g,st,ce,b),K=new kp(E),J=new Zh(P),re=new Ip(P,J),q=new Wp(P,J,b,re),ge=new Kp(P,q,J,re,b),de=new Yp(P,st,U),ie=new Fp(g),oe=new gg(E,K,Ke,st,re,ie),Te=new zg(E,g),we=new vg,ee=new Tg(Ke),ve=new Lp(E,K,Se,ge,_,l),_e=new Pg(E,ge,st),me=new Gg(P,b,st,Se),ze=new Up(P,Ke,b),L=new Xp(P,Ke,b),b.programs=oe.programs,E.capabilities=st,E.extensions=Ke,E.properties=g,E.renderLists=we,E.shadowMap=_e,E.state=Se,E.info=b}te(),M!==Ot&&(x=new Zp(M,t.width,t.height,r,s));const X=new Og(E,P);this.xr=X,this.getContext=function(){return P},this.getContextAttributes=function(){return P.getContextAttributes()},this.forceContextLoss=function(){const v=Ke.get("WEBGL_lose_context");v&&v.loseContext()},this.forceContextRestore=function(){const v=Ke.get("WEBGL_lose_context");v&&v.restoreContext()},this.getPixelRatio=function(){return le},this.setPixelRatio=function(v){v!==void 0&&(le=v,this.setSize(ae,Z,!1))},this.getSize=function(v){return v.set(ae,Z)},this.setSize=function(v,F,W=!0){if(X.isPresenting){De("WebGLRenderer: Can't change size while VR device is presenting.");return}ae=v,Z=F,t.width=Math.floor(v*le),t.height=Math.floor(F*le),W===!0&&(t.style.width=v+"px",t.style.height=F+"px"),x!==null&&x.setSize(t.width,t.height),this.setViewport(0,0,v,F)},this.getDrawingBufferSize=function(v){return v.set(ae*le,Z*le).floor()},this.setDrawingBufferSize=function(v,F,W){ae=v,Z=F,le=W,t.width=Math.floor(v*W),t.height=Math.floor(F*W),this.setViewport(0,0,v,F)},this.setEffects=function(v){if(M===Ot){console.error("THREE.WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(v){for(let F=0;F<v.length;F++)if(v[F].isOutputPass===!0){console.warn("THREE.WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}x.setEffects(v||[])},this.getCurrentViewport=function(v){return v.copy(I)},this.getViewport=function(v){return v.copy(Y)},this.setViewport=function(v,F,W,V){v.isVector4?Y.set(v.x,v.y,v.z,v.w):Y.set(v,F,W,V),Se.viewport(I.copy(Y).multiplyScalar(le).round())},this.getScissor=function(v){return v.copy(ne)},this.setScissor=function(v,F,W,V){v.isVector4?ne.set(v.x,v.y,v.z,v.w):ne.set(v,F,W,V),Se.scissor(N.copy(ne).multiplyScalar(le).round())},this.getScissorTest=function(){return se},this.setScissorTest=function(v){Se.setScissorTest(se=v)},this.setOpaqueSort=function(v){Re=v},this.setTransparentSort=function(v){He=v},this.getClearColor=function(v){return v.copy(ve.getClearColor())},this.setClearColor=function(){ve.setClearColor(...arguments)},this.getClearAlpha=function(){return ve.getClearAlpha()},this.setClearAlpha=function(){ve.setClearAlpha(...arguments)},this.clear=function(v=!0,F=!0,W=!0){let V=0;if(v){let G=!1;if(z!==null){const he=z.texture.format;G=d.has(he)}if(G){const he=z.texture.type,pe=f.has(he),fe=ve.getClearColor(),Me=ve.getClearAlpha(),ye=fe.r,Le=fe.g,Ge=fe.b;pe?(S[0]=ye,S[1]=Le,S[2]=Ge,S[3]=Me,P.clearBufferuiv(P.COLOR,0,S)):(T[0]=ye,T[1]=Le,T[2]=Ge,T[3]=Me,P.clearBufferiv(P.COLOR,0,T))}else V|=P.COLOR_BUFFER_BIT}F&&(V|=P.DEPTH_BUFFER_BIT),W&&(V|=P.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),V!==0&&P.clear(V)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",xe,!1),t.removeEventListener("webglcontextrestored",Pe,!1),t.removeEventListener("webglcontextcreationerror",at,!1),ve.dispose(),we.dispose(),ee.dispose(),g.dispose(),K.dispose(),ge.dispose(),re.dispose(),me.dispose(),oe.dispose(),X.dispose(),X.removeEventListener("sessionstart",lo),X.removeEventListener("sessionend",uo),Nn.stop()};function xe(v){v.preventDefault(),$r("WebGLRenderer: Context Lost."),H=!0}function Pe(){$r("WebGLRenderer: Context Restored."),H=!1;const v=b.autoReset,F=_e.enabled,W=_e.autoUpdate,V=_e.needsUpdate,G=_e.type;te(),b.autoReset=v,_e.enabled=F,_e.autoUpdate=W,_e.needsUpdate=V,_e.type=G}function at(v){Xe("WebGLRenderer: A WebGL context could not be created. Reason: ",v.statusMessage)}function Ze(v){const F=v.target;F.removeEventListener("dispose",Ze),cn(F)}function cn(v){ln(v),g.remove(v)}function ln(v){const F=g.get(v).programs;F!==void 0&&(F.forEach(function(W){oe.releaseProgram(W)}),v.isShaderMaterial&&oe.releaseShaderCache(v))}this.renderBufferDirect=function(v,F,W,V,G,he){F===null&&(F=it);const pe=G.isMesh&&G.matrixWorld.determinant()<0,fe=Rl(v,F,W,V,G);Se.setMaterial(V,pe);let Me=W.index,ye=1;if(V.wireframe===!0){if(Me=q.getWireframeAttribute(W),Me===void 0)return;ye=2}const Le=W.drawRange,Ge=W.attributes.position;let be=Le.start*ye,Qe=(Le.start+Le.count)*ye;he!==null&&(be=Math.max(be,he.start*ye),Qe=Math.min(Qe,(he.start+he.count)*ye)),Me!==null?(be=Math.max(be,0),Qe=Math.min(Qe,Me.count)):Ge!=null&&(be=Math.max(be,0),Qe=Math.min(Qe,Ge.count));const ft=Qe-be;if(ft<0||ft===1/0)return;re.setup(G,V,fe,W,Me);let lt,et=ze;if(Me!==null&&(lt=J.get(Me),et=L,et.setIndex(lt)),G.isMesh)V.wireframe===!0?(Se.setLineWidth(V.wireframeLinewidth*ht()),et.setMode(P.LINES)):et.setMode(P.TRIANGLES);else if(G.isLine){let bt=V.linewidth;bt===void 0&&(bt=1),Se.setLineWidth(bt*ht()),G.isLineSegments?et.setMode(P.LINES):G.isLineLoop?et.setMode(P.LINE_LOOP):et.setMode(P.LINE_STRIP)}else G.isPoints?et.setMode(P.POINTS):G.isSprite&&et.setMode(P.TRIANGLES);if(G.isBatchedMesh)if(G._multiDrawInstances!==null)Zr("WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),et.renderMultiDrawInstances(G._multiDrawStarts,G._multiDrawCounts,G._multiDrawCount,G._multiDrawInstances);else if(Ke.get("WEBGL_multi_draw"))et.renderMultiDraw(G._multiDrawStarts,G._multiDrawCounts,G._multiDrawCount);else{const bt=G._multiDrawStarts,Ee=G._multiDrawCounts,Lt=G._multiDrawCount,Ye=Me?J.get(Me).bytesPerElement:1,kt=g.get(V).currentProgram.getUniforms();for(let $t=0;$t<Lt;$t++)kt.setValue(P,"_gl_DrawID",$t),et.render(bt[$t]/Ye,Ee[$t])}else if(G.isInstancedMesh)et.renderInstances(be,ft,G.count);else if(W.isInstancedBufferGeometry){const bt=W._maxInstanceCount!==void 0?W._maxInstanceCount:1/0,Ee=Math.min(W.instanceCount,bt);et.renderInstances(be,ft,Ee)}else et.render(be,ft)};function co(v,F,W){v.transparent===!0&&v.side===mn&&v.forceSinglePass===!1?(v.side=Dt,v.needsUpdate=!0,or(v,F,W),v.side=Un,v.needsUpdate=!0,or(v,F,W),v.side=mn):or(v,F,W)}this.compile=function(v,F,W=null){W===null&&(W=v),A=ee.get(W),A.init(F),R.push(A),W.traverseVisible(function(G){G.isLight&&G.layers.test(F.layers)&&(A.pushLight(G),G.castShadow&&A.pushShadow(G))}),v!==W&&v.traverseVisible(function(G){G.isLight&&G.layers.test(F.layers)&&(A.pushLight(G),G.castShadow&&A.pushShadow(G))}),A.setupLights();const V=new Set;return v.traverse(function(G){if(!(G.isMesh||G.isPoints||G.isLine||G.isSprite))return;const he=G.material;if(he)if(Array.isArray(he))for(let pe=0;pe<he.length;pe++){const fe=he[pe];co(fe,W,G),V.add(fe)}else co(he,W,G),V.add(he)}),A=R.pop(),V},this.compileAsync=function(v,F,W=null){const V=this.compile(v,F,W);return new Promise(G=>{function he(){if(V.forEach(function(pe){g.get(pe).currentProgram.isReady()&&V.delete(pe)}),V.size===0){G(v);return}setTimeout(he,10)}Ke.get("KHR_parallel_shader_compile")!==null?he():setTimeout(he,10)})};let is=null;function wl(v){is&&is(v)}function lo(){Nn.stop()}function uo(){Nn.start()}const Nn=new _l;Nn.setAnimationLoop(wl),typeof self<"u"&&Nn.setContext(self),this.setAnimationLoop=function(v){is=v,X.setAnimationLoop(v),v===null?Nn.stop():Nn.start()},X.addEventListener("sessionstart",lo),X.addEventListener("sessionend",uo),this.render=function(v,F){if(F!==void 0&&F.isCamera!==!0){Xe("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(H===!0)return;const W=X.enabled===!0&&X.isPresenting===!0,V=x!==null&&(z===null||W)&&x.begin(E,z);if(v.matrixWorldAutoUpdate===!0&&v.updateMatrixWorld(),F.parent===null&&F.matrixWorldAutoUpdate===!0&&F.updateMatrixWorld(),X.enabled===!0&&X.isPresenting===!0&&(x===null||x.isCompositing()===!1)&&(X.cameraAutoUpdate===!0&&X.updateCamera(F),F=X.getCamera()),v.isScene===!0&&v.onBeforeRender(E,v,F,z),A=ee.get(v,R.length),A.init(F),R.push(A),xt.multiplyMatrices(F.projectionMatrix,F.matrixWorldInverse),Ie.setFromProjectionMatrix(xt,tn,F.reversedDepth),Ce=this.localClippingEnabled,Ae=ie.init(this.clippingPlanes,Ce),y=we.get(v,w.length),y.init(),w.push(y),X.enabled===!0&&X.isPresenting===!0){const pe=E.xr.getDepthSensingMesh();pe!==null&&rs(pe,F,-1/0,E.sortObjects)}rs(v,F,0,E.sortObjects),y.finish(),E.sortObjects===!0&&y.sort(Re,He),Be=X.enabled===!1||X.isPresenting===!1||X.hasDepthSensing()===!1,Be&&ve.addToRenderList(y,v),this.info.render.frame++,Ae===!0&&ie.beginShadows();const G=A.state.shadowsArray;if(_e.render(G,v,F),Ae===!0&&ie.endShadows(),this.info.autoReset===!0&&this.info.reset(),(V&&x.hasRenderPass())===!1){const pe=y.opaque,fe=y.transmissive;if(A.setupLights(),F.isArrayCamera){const Me=F.cameras;if(fe.length>0)for(let ye=0,Le=Me.length;ye<Le;ye++){const Ge=Me[ye];fo(pe,fe,v,Ge)}Be&&ve.render(v);for(let ye=0,Le=Me.length;ye<Le;ye++){const Ge=Me[ye];ho(y,v,Ge,Ge.viewport)}}else fe.length>0&&fo(pe,fe,v,F),Be&&ve.render(v),ho(y,v,F)}z!==null&&O===0&&(U.updateMultisampleRenderTarget(z),U.updateRenderTargetMipmap(z)),V&&x.end(E),v.isScene===!0&&v.onAfterRender(E,v,F),re.resetDefaultState(),k=-1,D=null,R.pop(),R.length>0?(A=R[R.length-1],Ae===!0&&ie.setGlobalState(E.clippingPlanes,A.state.camera)):A=null,w.pop(),w.length>0?y=w[w.length-1]:y=null};function rs(v,F,W,V){if(v.visible===!1)return;if(v.layers.test(F.layers)){if(v.isGroup)W=v.renderOrder;else if(v.isLOD)v.autoUpdate===!0&&v.update(F);else if(v.isLight)A.pushLight(v),v.castShadow&&A.pushShadow(v);else if(v.isSprite){if(!v.frustumCulled||Ie.intersectsSprite(v)){V&&$e.setFromMatrixPosition(v.matrixWorld).applyMatrix4(xt);const pe=ge.update(v),fe=v.material;fe.visible&&y.push(v,pe,fe,W,$e.z,null)}}else if((v.isMesh||v.isLine||v.isPoints)&&(!v.frustumCulled||Ie.intersectsObject(v))){const pe=ge.update(v),fe=v.material;if(V&&(v.boundingSphere!==void 0?(v.boundingSphere===null&&v.computeBoundingSphere(),$e.copy(v.boundingSphere.center)):(pe.boundingSphere===null&&pe.computeBoundingSphere(),$e.copy(pe.boundingSphere.center)),$e.applyMatrix4(v.matrixWorld).applyMatrix4(xt)),Array.isArray(fe)){const Me=pe.groups;for(let ye=0,Le=Me.length;ye<Le;ye++){const Ge=Me[ye],be=fe[Ge.materialIndex];be&&be.visible&&y.push(v,pe,be,W,$e.z,Ge)}}else fe.visible&&y.push(v,pe,fe,W,$e.z,null)}}const he=v.children;for(let pe=0,fe=he.length;pe<fe;pe++)rs(he[pe],F,W,V)}function ho(v,F,W,V){const{opaque:G,transmissive:he,transparent:pe}=v;A.setupLightsView(W),Ae===!0&&ie.setGlobalState(E.clippingPlanes,W),V&&Se.viewport(I.copy(V)),G.length>0&&ar(G,F,W),he.length>0&&ar(he,F,W),pe.length>0&&ar(pe,F,W),Se.buffers.depth.setTest(!0),Se.buffers.depth.setMask(!0),Se.buffers.color.setMask(!0),Se.setPolygonOffset(!1)}function fo(v,F,W,V){if((W.isScene===!0?W.overrideMaterial:null)!==null)return;if(A.state.transmissionRenderTarget[V.id]===void 0){const be=Ke.has("EXT_color_buffer_half_float")||Ke.has("EXT_color_buffer_float");A.state.transmissionRenderTarget[V.id]=new rn(1,1,{generateMipmaps:!0,type:be?vn:Ot,minFilter:$n,samples:Math.max(4,st.samples),stencilBuffer:s,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:qe.workingColorSpace})}const he=A.state.transmissionRenderTarget[V.id],pe=V.viewport||I;he.setSize(pe.z*E.transmissionResolutionScale,pe.w*E.transmissionResolutionScale);const fe=E.getRenderTarget(),Me=E.getActiveCubeFace(),ye=E.getActiveMipmapLevel();E.setRenderTarget(he),E.getClearColor(j),Q=E.getClearAlpha(),Q<1&&E.setClearColor(16777215,.5),E.clear(),Be&&ve.render(W);const Le=E.toneMapping;E.toneMapping=nn;const Ge=V.viewport;if(V.viewport!==void 0&&(V.viewport=void 0),A.setupLightsView(V),Ae===!0&&ie.setGlobalState(E.clippingPlanes,V),ar(v,W,V),U.updateMultisampleRenderTarget(he),U.updateRenderTargetMipmap(he),Ke.has("WEBGL_multisampled_render_to_texture")===!1){let be=!1;for(let Qe=0,ft=F.length;Qe<ft;Qe++){const lt=F[Qe],{object:et,geometry:bt,material:Ee,group:Lt}=lt;if(Ee.side===mn&&et.layers.test(V.layers)){const Ye=Ee.side;Ee.side=Dt,Ee.needsUpdate=!0,po(et,W,V,bt,Ee,Lt),Ee.side=Ye,Ee.needsUpdate=!0,be=!0}}be===!0&&(U.updateMultisampleRenderTarget(he),U.updateRenderTargetMipmap(he))}E.setRenderTarget(fe,Me,ye),E.setClearColor(j,Q),Ge!==void 0&&(V.viewport=Ge),E.toneMapping=Le}function ar(v,F,W){const V=F.isScene===!0?F.overrideMaterial:null;for(let G=0,he=v.length;G<he;G++){const pe=v[G],{object:fe,geometry:Me,group:ye}=pe;let Le=pe.material;Le.allowOverride===!0&&V!==null&&(Le=V),fe.layers.test(W.layers)&&po(fe,F,W,Me,Le,ye)}}function po(v,F,W,V,G,he){v.onBeforeRender(E,F,W,V,G,he),v.modelViewMatrix.multiplyMatrices(W.matrixWorldInverse,v.matrixWorld),v.normalMatrix.getNormalMatrix(v.modelViewMatrix),G.onBeforeRender(E,F,W,V,v,he),G.transparent===!0&&G.side===mn&&G.forceSinglePass===!1?(G.side=Dt,G.needsUpdate=!0,E.renderBufferDirect(W,F,V,G,v,he),G.side=Un,G.needsUpdate=!0,E.renderBufferDirect(W,F,V,G,v,he),G.side=mn):E.renderBufferDirect(W,F,V,G,v,he),v.onAfterRender(E,F,W,V,G,he)}function or(v,F,W){F.isScene!==!0&&(F=it);const V=g.get(v),G=A.state.lights,he=A.state.shadowsArray,pe=G.state.version,fe=oe.getParameters(v,G.state,he,F,W),Me=oe.getProgramCacheKey(fe);let ye=V.programs;V.environment=v.isMeshStandardMaterial||v.isMeshLambertMaterial||v.isMeshPhongMaterial?F.environment:null,V.fog=F.fog;const Le=v.isMeshStandardMaterial||v.isMeshLambertMaterial&&!v.envMap||v.isMeshPhongMaterial&&!v.envMap;V.envMap=K.get(v.envMap||V.environment,Le),V.envMapRotation=V.environment!==null&&v.envMap===null?F.environmentRotation:v.envMapRotation,ye===void 0&&(v.addEventListener("dispose",Ze),ye=new Map,V.programs=ye);let Ge=ye.get(Me);if(Ge!==void 0){if(V.currentProgram===Ge&&V.lightsStateVersion===pe)return go(v,fe),Ge}else fe.uniforms=oe.getUniforms(v),v.onBeforeCompile(fe,E),Ge=oe.acquireProgram(fe,Me),ye.set(Me,Ge),V.uniforms=fe.uniforms;const be=V.uniforms;return(!v.isShaderMaterial&&!v.isRawShaderMaterial||v.clipping===!0)&&(be.clippingPlanes=ie.uniform),go(v,fe),V.needsLights=Pl(v),V.lightsStateVersion=pe,V.needsLights&&(be.ambientLightColor.value=G.state.ambient,be.lightProbe.value=G.state.probe,be.directionalLights.value=G.state.directional,be.directionalLightShadows.value=G.state.directionalShadow,be.spotLights.value=G.state.spot,be.spotLightShadows.value=G.state.spotShadow,be.rectAreaLights.value=G.state.rectArea,be.ltc_1.value=G.state.rectAreaLTC1,be.ltc_2.value=G.state.rectAreaLTC2,be.pointLights.value=G.state.point,be.pointLightShadows.value=G.state.pointShadow,be.hemisphereLights.value=G.state.hemi,be.directionalShadowMatrix.value=G.state.directionalShadowMatrix,be.spotLightMatrix.value=G.state.spotLightMatrix,be.spotLightMap.value=G.state.spotLightMap,be.pointShadowMatrix.value=G.state.pointShadowMatrix),V.currentProgram=Ge,V.uniformsList=null,Ge}function mo(v){if(v.uniformsList===null){const F=v.currentProgram.getUniforms();v.uniformsList=Wr.seqWithValue(F.seq,v.uniforms)}return v.uniformsList}function go(v,F){const W=g.get(v);W.outputColorSpace=F.outputColorSpace,W.batching=F.batching,W.batchingColor=F.batchingColor,W.instancing=F.instancing,W.instancingColor=F.instancingColor,W.instancingMorph=F.instancingMorph,W.skinning=F.skinning,W.morphTargets=F.morphTargets,W.morphNormals=F.morphNormals,W.morphColors=F.morphColors,W.morphTargetsCount=F.morphTargetsCount,W.numClippingPlanes=F.numClippingPlanes,W.numIntersection=F.numClipIntersection,W.vertexAlphas=F.vertexAlphas,W.vertexTangents=F.vertexTangents,W.toneMapping=F.toneMapping}function Rl(v,F,W,V,G){F.isScene!==!0&&(F=it),U.resetTextureUnits();const he=F.fog,pe=V.isMeshStandardMaterial||V.isMeshLambertMaterial||V.isMeshPhongMaterial?F.environment:null,fe=z===null?E.outputColorSpace:z.isXRRenderTarget===!0?z.texture.colorSpace:Ii,Me=V.isMeshStandardMaterial||V.isMeshLambertMaterial&&!V.envMap||V.isMeshPhongMaterial&&!V.envMap,ye=K.get(V.envMap||pe,Me),Le=V.vertexColors===!0&&!!W.attributes.color&&W.attributes.color.itemSize===4,Ge=!!W.attributes.tangent&&(!!V.normalMap||V.anisotropy>0),be=!!W.morphAttributes.position,Qe=!!W.morphAttributes.normal,ft=!!W.morphAttributes.color;let lt=nn;V.toneMapped&&(z===null||z.isXRRenderTarget===!0)&&(lt=E.toneMapping);const et=W.morphAttributes.position||W.morphAttributes.normal||W.morphAttributes.color,bt=et!==void 0?et.length:0,Ee=g.get(V),Lt=A.state.lights;if(Ae===!0&&(Ce===!0||v!==D)){const vt=v===D&&V.id===k;ie.setState(V,v,vt)}let Ye=!1;V.version===Ee.__version?(Ee.needsLights&&Ee.lightsStateVersion!==Lt.state.version||Ee.outputColorSpace!==fe||G.isBatchedMesh&&Ee.batching===!1||!G.isBatchedMesh&&Ee.batching===!0||G.isBatchedMesh&&Ee.batchingColor===!0&&G.colorTexture===null||G.isBatchedMesh&&Ee.batchingColor===!1&&G.colorTexture!==null||G.isInstancedMesh&&Ee.instancing===!1||!G.isInstancedMesh&&Ee.instancing===!0||G.isSkinnedMesh&&Ee.skinning===!1||!G.isSkinnedMesh&&Ee.skinning===!0||G.isInstancedMesh&&Ee.instancingColor===!0&&G.instanceColor===null||G.isInstancedMesh&&Ee.instancingColor===!1&&G.instanceColor!==null||G.isInstancedMesh&&Ee.instancingMorph===!0&&G.morphTexture===null||G.isInstancedMesh&&Ee.instancingMorph===!1&&G.morphTexture!==null||Ee.envMap!==ye||V.fog===!0&&Ee.fog!==he||Ee.numClippingPlanes!==void 0&&(Ee.numClippingPlanes!==ie.numPlanes||Ee.numIntersection!==ie.numIntersection)||Ee.vertexAlphas!==Le||Ee.vertexTangents!==Ge||Ee.morphTargets!==be||Ee.morphNormals!==Qe||Ee.morphColors!==ft||Ee.toneMapping!==lt||Ee.morphTargetsCount!==bt)&&(Ye=!0):(Ye=!0,Ee.__version=V.version);let kt=Ee.currentProgram;Ye===!0&&(kt=or(V,F,G));let $t=!1,Fn=!1,ni=!1;const rt=kt.getUniforms(),St=Ee.uniforms;if(Se.useProgram(kt.program)&&($t=!0,Fn=!0,ni=!0),V.id!==k&&(k=V.id,Fn=!0),$t||D!==v){Se.buffers.depth.getReversed()&&v.reversedDepth!==!0&&(v._reversedDepth=!0,v.updateProjectionMatrix()),rt.setValue(P,"projectionMatrix",v.projectionMatrix),rt.setValue(P,"viewMatrix",v.matrixWorldInverse);const En=rt.map.cameraPosition;En!==void 0&&En.setValue(P,We.setFromMatrixPosition(v.matrixWorld)),st.logarithmicDepthBuffer&&rt.setValue(P,"logDepthBufFC",2/(Math.log(v.far+1)/Math.LN2)),(V.isMeshPhongMaterial||V.isMeshToonMaterial||V.isMeshLambertMaterial||V.isMeshBasicMaterial||V.isMeshStandardMaterial||V.isShaderMaterial)&&rt.setValue(P,"isOrthographic",v.isOrthographicCamera===!0),D!==v&&(D=v,Fn=!0,ni=!0)}if(Ee.needsLights&&(Lt.state.directionalShadowMap.length>0&&rt.setValue(P,"directionalShadowMap",Lt.state.directionalShadowMap,U),Lt.state.spotShadowMap.length>0&&rt.setValue(P,"spotShadowMap",Lt.state.spotShadowMap,U),Lt.state.pointShadowMap.length>0&&rt.setValue(P,"pointShadowMap",Lt.state.pointShadowMap,U)),G.isSkinnedMesh){rt.setOptional(P,G,"bindMatrix"),rt.setOptional(P,G,"bindMatrixInverse");const vt=G.skeleton;vt&&(vt.boneTexture===null&&vt.computeBoneTexture(),rt.setValue(P,"boneTexture",vt.boneTexture,U))}G.isBatchedMesh&&(rt.setOptional(P,G,"batchingTexture"),rt.setValue(P,"batchingTexture",G._matricesTexture,U),rt.setOptional(P,G,"batchingIdTexture"),rt.setValue(P,"batchingIdTexture",G._indirectTexture,U),rt.setOptional(P,G,"batchingColorTexture"),G._colorsTexture!==null&&rt.setValue(P,"batchingColorTexture",G._colorsTexture,U));const Sn=W.morphAttributes;if((Sn.position!==void 0||Sn.normal!==void 0||Sn.color!==void 0)&&de.update(G,W,kt),(Fn||Ee.receiveShadow!==G.receiveShadow)&&(Ee.receiveShadow=G.receiveShadow,rt.setValue(P,"receiveShadow",G.receiveShadow)),(V.isMeshStandardMaterial||V.isMeshLambertMaterial||V.isMeshPhongMaterial)&&V.envMap===null&&F.environment!==null&&(St.envMapIntensity.value=F.environmentIntensity),St.dfgLUT!==void 0&&(St.dfgLUT.value=kg()),Fn&&(rt.setValue(P,"toneMappingExposure",E.toneMappingExposure),Ee.needsLights&&Cl(St,ni),he&&V.fog===!0&&Te.refreshFogUniforms(St,he),Te.refreshMaterialUniforms(St,V,le,Z,A.state.transmissionRenderTarget[v.id]),Wr.upload(P,mo(Ee),St,U)),V.isShaderMaterial&&V.uniformsNeedUpdate===!0&&(Wr.upload(P,mo(Ee),St,U),V.uniformsNeedUpdate=!1),V.isSpriteMaterial&&rt.setValue(P,"center",G.center),rt.setValue(P,"modelViewMatrix",G.modelViewMatrix),rt.setValue(P,"normalMatrix",G.normalMatrix),rt.setValue(P,"modelMatrix",G.matrixWorld),V.isShaderMaterial||V.isRawShaderMaterial){const vt=V.uniformsGroups;for(let En=0,ii=vt.length;En<ii;En++){const _o=vt[En];me.update(_o,kt),me.bind(_o,kt)}}return kt}function Cl(v,F){v.ambientLightColor.needsUpdate=F,v.lightProbe.needsUpdate=F,v.directionalLights.needsUpdate=F,v.directionalLightShadows.needsUpdate=F,v.pointLights.needsUpdate=F,v.pointLightShadows.needsUpdate=F,v.spotLights.needsUpdate=F,v.spotLightShadows.needsUpdate=F,v.rectAreaLights.needsUpdate=F,v.hemisphereLights.needsUpdate=F}function Pl(v){return v.isMeshLambertMaterial||v.isMeshToonMaterial||v.isMeshPhongMaterial||v.isMeshStandardMaterial||v.isShadowMaterial||v.isShaderMaterial&&v.lights===!0}this.getActiveCubeFace=function(){return C},this.getActiveMipmapLevel=function(){return O},this.getRenderTarget=function(){return z},this.setRenderTargetTextures=function(v,F,W){const V=g.get(v);V.__autoAllocateDepthBuffer=v.resolveDepthBuffer===!1,V.__autoAllocateDepthBuffer===!1&&(V.__useRenderToTexture=!1),g.get(v.texture).__webglTexture=F,g.get(v.depthTexture).__webglTexture=V.__autoAllocateDepthBuffer?void 0:W,V.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(v,F){const W=g.get(v);W.__webglFramebuffer=F,W.__useDefaultFramebuffer=F===void 0};const Dl=P.createFramebuffer();this.setRenderTarget=function(v,F=0,W=0){z=v,C=F,O=W;let V=null,G=!1,he=!1;if(v){const fe=g.get(v);if(fe.__useDefaultFramebuffer!==void 0){Se.bindFramebuffer(P.FRAMEBUFFER,fe.__webglFramebuffer),I.copy(v.viewport),N.copy(v.scissor),$=v.scissorTest,Se.viewport(I),Se.scissor(N),Se.setScissorTest($),k=-1;return}else if(fe.__webglFramebuffer===void 0)U.setupRenderTarget(v);else if(fe.__hasExternalTextures)U.rebindTextures(v,g.get(v.texture).__webglTexture,g.get(v.depthTexture).__webglTexture);else if(v.depthBuffer){const Le=v.depthTexture;if(fe.__boundDepthTexture!==Le){if(Le!==null&&g.has(Le)&&(v.width!==Le.image.width||v.height!==Le.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");U.setupDepthRenderbuffer(v)}}const Me=v.texture;(Me.isData3DTexture||Me.isDataArrayTexture||Me.isCompressedArrayTexture)&&(he=!0);const ye=g.get(v).__webglFramebuffer;v.isWebGLCubeRenderTarget?(Array.isArray(ye[F])?V=ye[F][W]:V=ye[F],G=!0):v.samples>0&&U.useMultisampledRTT(v)===!1?V=g.get(v).__webglMultisampledFramebuffer:Array.isArray(ye)?V=ye[W]:V=ye,I.copy(v.viewport),N.copy(v.scissor),$=v.scissorTest}else I.copy(Y).multiplyScalar(le).floor(),N.copy(ne).multiplyScalar(le).floor(),$=se;if(W!==0&&(V=Dl),Se.bindFramebuffer(P.FRAMEBUFFER,V)&&Se.drawBuffers(v,V),Se.viewport(I),Se.scissor(N),Se.setScissorTest($),G){const fe=g.get(v.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_CUBE_MAP_POSITIVE_X+F,fe.__webglTexture,W)}else if(he){const fe=F;for(let Me=0;Me<v.textures.length;Me++){const ye=g.get(v.textures[Me]);P.framebufferTextureLayer(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0+Me,ye.__webglTexture,W,fe)}}else if(v!==null&&W!==0){const fe=g.get(v.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,fe.__webglTexture,W)}k=-1},this.readRenderTargetPixels=function(v,F,W,V,G,he,pe,fe=0){if(!(v&&v.isWebGLRenderTarget)){Xe("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let Me=g.get(v).__webglFramebuffer;if(v.isWebGLCubeRenderTarget&&pe!==void 0&&(Me=Me[pe]),Me){Se.bindFramebuffer(P.FRAMEBUFFER,Me);try{const ye=v.textures[fe],Le=ye.format,Ge=ye.type;if(v.textures.length>1&&P.readBuffer(P.COLOR_ATTACHMENT0+fe),!st.textureFormatReadable(Le)){Xe("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!st.textureTypeReadable(Ge)){Xe("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}F>=0&&F<=v.width-V&&W>=0&&W<=v.height-G&&P.readPixels(F,W,V,G,ce.convert(Le),ce.convert(Ge),he)}finally{const ye=z!==null?g.get(z).__webglFramebuffer:null;Se.bindFramebuffer(P.FRAMEBUFFER,ye)}}},this.readRenderTargetPixelsAsync=async function(v,F,W,V,G,he,pe,fe=0){if(!(v&&v.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let Me=g.get(v).__webglFramebuffer;if(v.isWebGLCubeRenderTarget&&pe!==void 0&&(Me=Me[pe]),Me)if(F>=0&&F<=v.width-V&&W>=0&&W<=v.height-G){Se.bindFramebuffer(P.FRAMEBUFFER,Me);const ye=v.textures[fe],Le=ye.format,Ge=ye.type;if(v.textures.length>1&&P.readBuffer(P.COLOR_ATTACHMENT0+fe),!st.textureFormatReadable(Le))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!st.textureTypeReadable(Ge))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const be=P.createBuffer();P.bindBuffer(P.PIXEL_PACK_BUFFER,be),P.bufferData(P.PIXEL_PACK_BUFFER,he.byteLength,P.STREAM_READ),P.readPixels(F,W,V,G,ce.convert(Le),ce.convert(Ge),0);const Qe=z!==null?g.get(z).__webglFramebuffer:null;Se.bindFramebuffer(P.FRAMEBUFFER,Qe);const ft=P.fenceSync(P.SYNC_GPU_COMMANDS_COMPLETE,0);return P.flush(),await sh(P,ft,4),P.bindBuffer(P.PIXEL_PACK_BUFFER,be),P.getBufferSubData(P.PIXEL_PACK_BUFFER,0,he),P.deleteBuffer(be),P.deleteSync(ft),he}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(v,F=null,W=0){const V=Math.pow(2,-W),G=Math.floor(v.image.width*V),he=Math.floor(v.image.height*V),pe=F!==null?F.x:0,fe=F!==null?F.y:0;U.setTexture2D(v,0),P.copyTexSubImage2D(P.TEXTURE_2D,W,0,0,pe,fe,G,he),Se.unbindTexture()};const Ll=P.createFramebuffer(),Il=P.createFramebuffer();this.copyTextureToTexture=function(v,F,W=null,V=null,G=0,he=0){let pe,fe,Me,ye,Le,Ge,be,Qe,ft;const lt=v.isCompressedTexture?v.mipmaps[he]:v.image;if(W!==null)pe=W.max.x-W.min.x,fe=W.max.y-W.min.y,Me=W.isBox3?W.max.z-W.min.z:1,ye=W.min.x,Le=W.min.y,Ge=W.isBox3?W.min.z:0;else{const St=Math.pow(2,-G);pe=Math.floor(lt.width*St),fe=Math.floor(lt.height*St),v.isDataArrayTexture?Me=lt.depth:v.isData3DTexture?Me=Math.floor(lt.depth*St):Me=1,ye=0,Le=0,Ge=0}V!==null?(be=V.x,Qe=V.y,ft=V.z):(be=0,Qe=0,ft=0);const et=ce.convert(F.format),bt=ce.convert(F.type);let Ee;F.isData3DTexture?(U.setTexture3D(F,0),Ee=P.TEXTURE_3D):F.isDataArrayTexture||F.isCompressedArrayTexture?(U.setTexture2DArray(F,0),Ee=P.TEXTURE_2D_ARRAY):(U.setTexture2D(F,0),Ee=P.TEXTURE_2D),P.pixelStorei(P.UNPACK_FLIP_Y_WEBGL,F.flipY),P.pixelStorei(P.UNPACK_PREMULTIPLY_ALPHA_WEBGL,F.premultiplyAlpha),P.pixelStorei(P.UNPACK_ALIGNMENT,F.unpackAlignment);const Lt=P.getParameter(P.UNPACK_ROW_LENGTH),Ye=P.getParameter(P.UNPACK_IMAGE_HEIGHT),kt=P.getParameter(P.UNPACK_SKIP_PIXELS),$t=P.getParameter(P.UNPACK_SKIP_ROWS),Fn=P.getParameter(P.UNPACK_SKIP_IMAGES);P.pixelStorei(P.UNPACK_ROW_LENGTH,lt.width),P.pixelStorei(P.UNPACK_IMAGE_HEIGHT,lt.height),P.pixelStorei(P.UNPACK_SKIP_PIXELS,ye),P.pixelStorei(P.UNPACK_SKIP_ROWS,Le),P.pixelStorei(P.UNPACK_SKIP_IMAGES,Ge);const ni=v.isDataArrayTexture||v.isData3DTexture,rt=F.isDataArrayTexture||F.isData3DTexture;if(v.isDepthTexture){const St=g.get(v),Sn=g.get(F),vt=g.get(St.__renderTarget),En=g.get(Sn.__renderTarget);Se.bindFramebuffer(P.READ_FRAMEBUFFER,vt.__webglFramebuffer),Se.bindFramebuffer(P.DRAW_FRAMEBUFFER,En.__webglFramebuffer);for(let ii=0;ii<Me;ii++)ni&&(P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,g.get(v).__webglTexture,G,Ge+ii),P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,g.get(F).__webglTexture,he,ft+ii)),P.blitFramebuffer(ye,Le,pe,fe,be,Qe,pe,fe,P.DEPTH_BUFFER_BIT,P.NEAREST);Se.bindFramebuffer(P.READ_FRAMEBUFFER,null),Se.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else if(G!==0||v.isRenderTargetTexture||g.has(v)){const St=g.get(v),Sn=g.get(F);Se.bindFramebuffer(P.READ_FRAMEBUFFER,Ll),Se.bindFramebuffer(P.DRAW_FRAMEBUFFER,Il);for(let vt=0;vt<Me;vt++)ni?P.framebufferTextureLayer(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,St.__webglTexture,G,Ge+vt):P.framebufferTexture2D(P.READ_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,St.__webglTexture,G),rt?P.framebufferTextureLayer(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,Sn.__webglTexture,he,ft+vt):P.framebufferTexture2D(P.DRAW_FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_2D,Sn.__webglTexture,he),G!==0?P.blitFramebuffer(ye,Le,pe,fe,be,Qe,pe,fe,P.COLOR_BUFFER_BIT,P.NEAREST):rt?P.copyTexSubImage3D(Ee,he,be,Qe,ft+vt,ye,Le,pe,fe):P.copyTexSubImage2D(Ee,he,be,Qe,ye,Le,pe,fe);Se.bindFramebuffer(P.READ_FRAMEBUFFER,null),Se.bindFramebuffer(P.DRAW_FRAMEBUFFER,null)}else rt?v.isDataTexture||v.isData3DTexture?P.texSubImage3D(Ee,he,be,Qe,ft,pe,fe,Me,et,bt,lt.data):F.isCompressedArrayTexture?P.compressedTexSubImage3D(Ee,he,be,Qe,ft,pe,fe,Me,et,lt.data):P.texSubImage3D(Ee,he,be,Qe,ft,pe,fe,Me,et,bt,lt):v.isDataTexture?P.texSubImage2D(P.TEXTURE_2D,he,be,Qe,pe,fe,et,bt,lt.data):v.isCompressedTexture?P.compressedTexSubImage2D(P.TEXTURE_2D,he,be,Qe,lt.width,lt.height,et,lt.data):P.texSubImage2D(P.TEXTURE_2D,he,be,Qe,pe,fe,et,bt,lt);P.pixelStorei(P.UNPACK_ROW_LENGTH,Lt),P.pixelStorei(P.UNPACK_IMAGE_HEIGHT,Ye),P.pixelStorei(P.UNPACK_SKIP_PIXELS,kt),P.pixelStorei(P.UNPACK_SKIP_ROWS,$t),P.pixelStorei(P.UNPACK_SKIP_IMAGES,Fn),he===0&&F.generateMipmaps&&P.generateMipmap(Ee),Se.unbindTexture()},this.initRenderTarget=function(v){g.get(v).__webglFramebuffer===void 0&&U.setupRenderTarget(v)},this.initTexture=function(v){v.isCubeTexture?U.setTextureCube(v,0):v.isData3DTexture?U.setTexture3D(v,0):v.isDataArrayTexture||v.isCompressedArrayTexture?U.setTexture2DArray(v,0):U.setTexture2D(v,0),Se.unbindTexture()},this.resetState=function(){C=0,O=0,z=null,Se.reset(),re.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return tn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;const t=this.getContext();t.drawingBufferColorSpace=qe._getDrawingBufferColorSpace(e),t.unpackColorSpace=qe._getUnpackColorSpace()}}const Wg=120,Xg=240*Math.PI/180,qg=120*Math.PI/180,Ec=-.5,yc=.55,Yg=3.2,Kg=52*Math.PI/180,bc=-12*Math.PI/180;function $g(i){const e=new Nt;i.add(e);const t=new gl(16771272,.9,3.2);t.position.set(0,.15,-.35),i.add(t);const n=new nt({color:1316895,roughness:.7,metalness:.3}),r=new nt({color:1777704,roughness:.6,metalness:.25}),s=new nt({color:790292,roughness:.8,metalness:.2}),a=-.9,o=s,l=.95,c=.62,h=.06,p=(Q,ae,Z,le)=>{const Re=new Ve(new ot(Q,ae,h),o);return Re.position.set(Z,le,a),Re};e.add(p(2*l+h,h,0,c)),e.add(p(2*l+h,h,0,-c)),e.add(p(h,2*c,-l,0)),e.add(p(h,2*c,l,0)),e.add(p(h,2*c,0,0));const u=new Ve(new ot(1.9,.08,.55),r);u.position.set(0,-.62,-.78),u.rotation.x=-.18,e.add(u);function m(Q,ae){const Z=new Nt;Z.position.set(Q,-.58,-.7);const le=new Ve(new Ci(.018,.022,.26,12),n);le.position.y=.13,Z.add(le);const Re=new Ve(new io(.04,16,12),new nt({color:ae,roughness:.5,metalness:.2}));return Re.position.y=.27,Z.add(Re),e.add(Z),Z}const _=m(-.42,3828282),M=m(.42,6959152),d=new Nt;d.position.set(-.74,-.58,-.66);const f=new Ve(new Ci(.014,.016,.14,10),n);f.position.y=.07,d.add(f),e.add(d);const S=new Nt;S.position.set(0,-.46,-.66),S.rotation.x=-.35;const T=new Ve(new Ci(.12,.12,.02,32),new nt({color:329740,roughness:.5,metalness:.1}));T.rotation.x=Math.PI/2,S.add(T);const y=new Ve(new ro(.12,.012,12,32),new nt({color:2238771,roughness:.6,metalness:.4}));S.add(y);const A=new Nt;S.add(A);const w=new Ve(new ot(.012,.1,.006),new nt({color:16733491,emissive:16724753,emissiveIntensity:.6,roughness:.4}));w.position.set(0,.045,.012),A.add(w);const R=new Ui(.03,20);function x(Q,ae){const Z=new nt({color:658706,emissive:new Ne(ae),emissiveIntensity:0,roughness:.5}),le=new Ve(R,Z);return le.position.set(Q,-.4,-.64),le.rotation.x=-.35,e.add(le),{mesh:le,mat:Z}}const E=x(-.36,16756768),H=x(-.28,16756768),C=x(-.2,16724770),O=new Nt;O.position.set(.34,-.4,-.64),O.rotation.x=-.35;const z=new Ve(new Ui(.035,24),new nt({color:329482,roughness:.6}));O.add(z);const k=new Ve(new no(.018,.034,16,1),new nt({color:15777824,emissive:12619792,emissiveIntensity:.5,roughness:.5}));k.position.z=.001,k.visible=!1,O.add(k),e.add(O);let D=0;const I=new Nt;I.position.set(-.5,-c+.02,a-.04);const N=new Ve(new ot(.025,1.05,.02),new nt({color:329482,roughness:.8}));N.position.y=.5,I.add(N),e.add(I);function $(Q,ae,Z){return Q+(ae-Q)*Z}function j(Q){_.rotation.x=$(Ec,yc,Or(Q.powerFrac)),M.rotation.x=$(Ec,yc,Or(Q.brakeFrac)),d.rotation.x=Q.reverser==="FWD"?.5:Q.reverser==="REV"?-.5:0;const ae=Or(Math.abs(Q.speedMph)/Wg);if(A.rotation.z=qg-ae*Xg,E.mat.emissiveIntensity=Q.dra?1.1:0,H.mat.emissiveIntensity=Q.dsd?1.1:0,C.mat.emissiveIntensity=Q.penalty?1.3:0,k.visible=Q.sunflower==="CAUTION",Q.wiperOn)D+=Q.dt*Yg,I.rotation.z=bc+Math.sin(D)*Kg;else{const Z=Or(Q.dt*4);I.rotation.z=$(I.rotation.z,bc,Z)}}return{update:j}}const Or=i=>i<0?0:i>1?1:i,Zg=2.236936,Zi={RED:16720920,YELLOW:16756768,DOUBLE_YELLOW:16756768,GREEN:3211104},jg=18,Vs=16,ks=40,Jg=22,Qg=.35,e0=2400,t0=2;function n0(i,e,t){const n=t?.rainCount??e0,r=t?.pixelRatioCap??t0,s=new Hg({antialias:!0});s.setPixelRatio(Math.min(window.devicePixelRatio,r)),s.setSize(i.clientWidth,i.clientHeight),i.appendChild(s.domElement);const a=new Sh;a.background=new Ne(329743),a.fog=new eo(329743,25,260);const o=new Ft(70,i.clientWidth/i.clientHeight,.05,2e3),l=new Hh(1713718,197642,.35);a.add(l);const c=new qh(9085128,.4);c.position.set(-40,80,-20),a.add(c);const h=new Ve(new sr(400,e.length+400),new nt({color:527370,roughness:1}));h.rotation.x=-Math.PI/2,h.position.z=e.length/2,a.add(h);const p=1.435,u=new nt({color:4870752,metalness:.95,roughness:.12});for(const D of[-p/2,p/2]){const I=new Ve(new ot(.07,.12,e.length),u);I.position.set(D,.06,e.length/2),a.add(I)}const m=.65,_=Math.floor(e.length/m),M=new Wn(new ot(2.6,.12,.25),new nt({color:1185049,roughness:1}),_),d=new Je;for(let D=0;D<_;D++)d.setPosition(0,.02,D*m),M.setMatrixAt(D,d);M.instanceMatrix.needsUpdate=!0,a.add(M);const f=[],S=p/2+2.2,T=new Ui(.16,16),y=a0();for(const D of e.signals){const I=new Nt;I.position.set(S,0,D.chainage);const N=new Ve(new Ci(.08,.1,4.2,10),new nt({color:790292,roughness:.8,metalness:.3}));N.position.y=2.1,I.add(N);const $=new Ve(new ot(.6,1.5,.1),new nt({color:461068,roughness:.9}));$.position.set(0,4,0),I.add($);const j=(He,Y)=>{const ne=new nt({color:329482,emissive:new Ne(Y),emissiveIntensity:0,roughness:.5}),se=new Ve(T,ne);return se.position.set(0,He,-.06),se.rotation.y=Math.PI,I.add(se),ne},Q=j(4.55,Zi.RED),ae=j(4.2,Zi.YELLOW),Z=j(3.85,Zi.YELLOW),le=j(3.5,Zi.GREEN),Re=new wh(new sl({map:y,color:16777215,transparent:!0,opacity:0,blending:Xs,depthWrite:!1}));Re.scale.set(2.4,2.4,1),Re.position.set(0,4,-.1),I.add(Re),a.add(I),f.push({red:Q,amberTop:ae,amberBot:Z,green:le,glow:Re})}const A=new Float32Array(n*3);for(let D=0;D<n;D++)A[D*3+0]=(Math.random()*2-1)*jg,A[D*3+1]=Math.random()*2*Vs,A[D*3+2]=(Math.random()*2-1)*ks;const w=new yt;w.setAttribute("position",new Bt(A,3));const R=new ul({color:10467032,size:.06,transparent:!0,opacity:.5,depthWrite:!1}),x=new Ih(w,R);x.frustumCulled=!1,a.add(x);for(const D of e.stations)r0(a,D,p);s0(a,e,p);const E=$g(o);a.add(o);const H={powerFrac:0,brakeFrac:0,reverser:"OFF",speedMph:0,sunflower:"BLACK",dra:!1,dsd:!1,penalty:!1,wiperOn:!0,dt:0};function C(D){for(let I=0;I<f.length;I++){const N=f[I];if(!N)continue;const $=Ai(e,I,D.served);N.red.emissiveIntensity=$==="RED"?1.4:0,N.amberTop.emissiveIntensity=$==="YELLOW"||$==="DOUBLE_YELLOW"?1.3:0,N.amberBot.emissiveIntensity=$==="DOUBLE_YELLOW"?1.3:0,N.green.emissiveIntensity=$==="GREEN"?1.3:0;const j=N.glow.material;j.color.setHex(Zi[$]),j.opacity=.55}}function O(D){const I=D.dt,N=D.chainage-.6,$=Jg*I,j=$*Qg+Math.abs(D.speed)*I*.25,Q=w.getAttribute("position"),ae=Q.array;for(let Z=0;Z<n;Z++){const le=Z*3+1,Re=Z*3+2;let He=ae[le]-$,Y=ae[Re]-j;He<0&&(He+=2*Vs),Y<-ks&&(Y+=2*ks),ae[le]=He,ae[Re]=Y}Q.needsUpdate=!0,x.position.set(0,o.position.y-Vs,N),x.position.x=0}function z(D){o.position.set(0,1.9,D.chainage-.6),o.lookAt(0,1.6,D.chainage+30);const I=D.env;a.background.setHex(I.skyColor);const N=a.fog;N.color.setHex(I.skyColor),N.near=I.fogNear,N.far=I.fogFar,l.intensity=I.ambientIntensity,c.intensity=I.moonIntensity,R.opacity=I.rainIntensity,u.roughness=i0(.35,.08,I.railWetness),C(D),I.rainIntensity>0&&O(D);const $=D.controls;H.powerFrac=$.powerNotch/jn,H.brakeFrac=$.brakeStep/Kn,H.reverser=$.reverser,H.speedMph=Math.abs(D.speed)*Zg,H.sunflower=D.aws.sunflower,H.dra=$.dra,H.dsd=D.safety.dsdWarning,H.penalty=rr(D.safety),H.wiperOn=I.wiperOn,H.dt=D.dt,E.update(H),s.render(a,o)}function k(){const D=i.clientWidth,I=i.clientHeight;s.setSize(D,I),o.aspect=D/I,o.updateProjectionMatrix()}return{render:z,resize:k}}function i0(i,e,t){return i+(e-i)*t}function r0(i,e,t){const n=e.chainage,r=2*e.platformHalf,s=3,a=.9,o=t/2+.7,l=o+s/2,c=new Nt;c.position.set(0,0,n);const h=new nt({color:5396575,roughness:.9}),p=new nt({color:2896700,roughness:.85}),u=new nt({color:2765115,roughness:.6,metalness:.4}),m=new Ve(new ot(s,a,r),h);m.position.set(l,a/2,0),c.add(m);const _=new Ve(new ot(.2,2.6,r),p);_.position.set(l+s/2-.1,a+1.3,0),c.add(_);const M=a+3,d=new Ve(new ot(s,.12,r*.8),u);d.position.set(l,M,0),c.add(d);const f=new ot(.12,M-a,.12);for(const A of[-r*.35,0,r*.35]){const w=new Ve(f,u);w.position.set(l-s/2+.3,a+(M-a)/2,A),c.add(w)}const S=new Ve(new ot(.08,.5,3.2),new nt({color:659488,emissive:new Ne(3238080),emissiveIntensity:2,roughness:.5}));S.position.set(o+.05,a+1.7,0),c.add(S);const T=new Ui(.12,16),y=new nt({color:1053720,emissive:new Ne(16769712),emissiveIntensity:2.6,roughness:.5});for(const A of[-r*.3,r*.3]){const w=new Ve(T,y);w.position.set(l,a+3.4,A),w.rotation.x=Math.PI/2,c.add(w);const R=new gl(16769712,3,24);R.position.set(l,a+3.3,A),c.add(R)}i.add(c)}function s0(i,e,t){const n=e.length,r=new Je,s=new Qn,a=new B(1,1,1),o=new B,l=45,c=Math.max(1,Math.floor(n/l)),h=t/2+2.6,p=new nt({color:1053722,roughness:.7,metalness:.5}),u=new ot(.18,6.5,.18),m=new Wn(u,p,c),_=new ot(2.4,.12,.12),M=new Wn(_,p,c);for(let Z=0;Z<c;Z++){const le=(Z+1)*l,Re=Z%2===0?1:-1,He=Re*h;r.compose(o.set(He,3.25,le),s.set(0,0,0,1),a),m.setMatrixAt(Z,r),r.compose(o.set(He-Re*1.2,6,le),s.set(0,0,0,1),a),M.setMatrixAt(Z,r)}m.instanceMatrix.needsUpdate=!0,M.instanceMatrix.needsUpdate=!0,i.add(m),i.add(M);const d=new nt({color:2764340,roughness:.5,metalness:.6}),f=new Ve(new ot(.03,.03,n),d);f.position.set(0,5.9,n/2),i.add(f);const S=6,T=Math.max(1,Math.floor(n/S)),y=t/2+4.5,A=new nt({color:921878,roughness:.9}),w=new ot(.06,1,.06),R=new Wn(w,A,T*2);let x=0;for(let Z=0;Z<T;Z++){const le=(Z+1)*S;for(const Re of[-1,1])r.compose(o.set(Re*y,.5,le),s.set(0,0,0,1),a),R.setMatrixAt(x++,r)}R.instanceMatrix.needsUpdate=!0,i.add(R);const E=new nt({color:658706,roughness:1}),H=new nt({color:658706,emissive:new Ne(16765562),emissiveIntensity:.5,roughness:.9}),C=[{z:700,x:70,w:26,h:22,d:18},{z:1700,x:-85,w:34,h:30,d:22},{z:2900,x:60,w:22,h:40,d:16},{z:3600,x:-70,w:40,h:18,d:24},{z:4800,x:90,w:28,h:26,d:20},{z:5500,x:-60,w:30,h:34,d:18}],O=new ot(1,1,1),z=new Wn(O,E,C.length),k=new ot(1,1,.3),D=new Wn(k,H,C.length);for(let Z=0;Z<C.length;Z++){const le=C[Z];if(!le)continue;r.compose(o.set(le.x,le.h/2,le.z),s.set(0,0,0,1),a.set(le.w,le.h,le.d)),z.setMatrixAt(Z,r);const Re=le.x+(le.x<0?le.w/2:-le.w/2);r.compose(o.set(Re,le.h*.55,le.z),s.set(0,0,0,1),a.set(le.w*.6,le.h*.5,1)),D.setMatrixAt(Z,r)}z.instanceMatrix.needsUpdate=!0,D.instanceMatrix.needsUpdate=!0,i.add(z),i.add(D);const I=500,N=Math.max(1,Math.floor(n/I)),$=t/2+2,j=new nt({color:11580602,roughness:.8}),Q=new ot(.1,.6,.1),ae=new Wn(Q,j,N);for(let Z=0;Z<N;Z++){const le=(Z+1)*I;r.compose(o.set($,.3,le),s.set(0,0,0,1),a.set(1,1,1)),ae.setMatrixAt(Z,r)}ae.instanceMatrix.needsUpdate=!0,i.add(ae)}function a0(){const e=document.createElement("canvas");e.width=e.height=64;const t=e.getContext("2d");if(t){const r=t.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,"rgba(255,255,255,1)"),r.addColorStop(.4,"rgba(255,255,255,0.5)"),r.addColorStop(1,"rgba(255,255,255,0)"),t.fillStyle=r,t.fillRect(0,0,64,64)}const n=new Uh(e);return n.needsUpdate=!0,n}function o0(i){const e=document.createElement("div");e.style.cssText="position:fixed;left:14px;top:12px;font:14px/1.6 ui-monospace,monospace;color:#cfe0f5;text-shadow:0 1px 2px #000;pointer-events:none;display:grid;grid-template-columns:auto auto;gap:1px 12px";function t(A){const w=document.createElement("span");w.textContent=A,w.style.opacity="0.65";const R=document.createElement("span");return e.append(w,R),R}function n(A){const w=document.createElement("span");return w.textContent=A,w.style.cssText="padding:2px 8px;border-radius:3px;border:1px solid #2a3650;color:#5a6a82",w}const r=t("SPEED"),s=t("LIMIT"),a=t("REVERSER"),o=t("POWER"),l=t("BRAKE"),c=t("BRK D/A"),h=t("NEXT"),p=t("CHAINAGE"),u=t("ASPECT"),m=document.createElement("div");m.style.cssText="grid-column:1 / 3;margin-top:6px;display:flex;gap:10px";const _=n("DRA"),M=n("DSD"),d=n("PENALTY"),f=n("AWS");m.append(_,M,d,f),e.append(m);const S={RED:"#e04030",YELLOW:"#e0b020",DOUBLE_YELLOW:"#e0b020",GREEN:"#30c050"};i.appendChild(e);function T(A,w,R){w?(A.style.background=R,A.style.color="#0a0e16",A.style.borderColor=R):(A.style.background="transparent",A.style.color="#5a6a82",A.style.borderColor="#2a3650")}function y(A){r.textContent=`${A.speedMph.toFixed(0)} mph`,s.textContent=`${A.limitMph.toFixed(0)} mph`,a.textContent=A.reverser,o.textContent=`${A.powerNotch} of ${A.powerMax}`,l.textContent=A.brakeLabel,c.textContent=`${A.brakeDemandPct.toFixed(0)}% / ${A.brakeActualPct.toFixed(0)}%`,h.textContent=A.nextStop,p.textContent=`${A.chainage.toFixed(0)} m`,u.textContent=A.aspect,u.style.color=S[A.aspect],T(_,A.dra,"#e0b020"),T(M,A.dsdWarning,"#e0b020"),T(d,A.penalty,"#e04030"),T(f,A.sunflower==="CAUTION","#e0b020")}return{update:y}}const Tc="mdtrain2-help-style",qt="mdtrain2-help",c0=[{keys:"W / S",what:"Power up / down"},{keys:"D / A",what:"Brake on / off"},{keys:"F / N / R",what:"Reverser fwd / neutral / rev"},{keys:"Q",what:"Acknowledge AWS / reset penalty"},{keys:"L",what:"DRA (driver's reminder)"},{keys:"`",what:"Emergency brake"},{keys:"E",what:"Change weather / time of day"},{keys:"H",what:"Show / hide this panel"}],l0=`
#${qt} {
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
#${qt}[hidden] { display: none; }
#${qt} h2 {
  margin: 0 0 6px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.7;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
#${qt} .x {
  cursor: pointer;
  opacity: 0.6;
  padding: 0 4px;
  font-size: 14px;
}
#${qt} .x:hover { opacity: 1; }
#${qt} table { border-collapse: collapse; }
#${qt} td { padding: 1px 0; vertical-align: top; }
#${qt} td.k {
  padding-right: 12px;
  color: #9fd0ff;
  white-space: nowrap;
}
#${qt} .hint { margin-top: 7px; opacity: 0.5; font-size: 11px; }
@media (pointer: coarse) { #${qt} { display: none; } }
`;function u0(){if(document.getElementById(Tc))return;const i=document.createElement("style");i.id=Tc,i.textContent=l0,document.head.appendChild(i)}function h0(i){u0();const e=document.createElement("div");e.id=qt;const t=document.createElement("h2");t.textContent="Controls";const n=document.createElement("span");n.className="x",n.textContent="×",n.setAttribute("role","button"),n.setAttribute("aria-label","Hide controls (H)"),t.appendChild(n),e.appendChild(t);const r=document.createElement("table");for(const o of c0){const l=document.createElement("tr"),c=document.createElement("td");c.className="k",c.textContent=o.keys;const h=document.createElement("td");h.textContent=o.what,l.append(c,h),r.appendChild(l)}e.appendChild(r);const s=document.createElement("div");s.className="hint",s.textContent="press H to hide",e.appendChild(s),i.appendChild(e);function a(){e.hidden=!e.hidden}return n.addEventListener("click",a),window.addEventListener("keydown",o=>{o.code==="KeyH"&&!o.repeat&&a()}),{toggle:a}}const f0=.06,d0=.35;function p0(i){const e=Math.floor(i.sampleRate),t=i.createBuffer(1,e,i.sampleRate),n=t.getChannelData(0);for(let r=0;r<e;r++)n[r]=Math.random()*2-1;return t}function m0(){const i=typeof window<"u"?window.AudioContext??window.webkitAudioContext:void 0;if(!i)return{start:()=>{},update:()=>{}};let e;try{e=new i}catch{return{start:()=>{},update:()=>{}}}const t=e.createGain();t.gain.value=d0,t.connect(e.destination);const n=e.createGain();n.gain.value=0,n.connect(t);const r=e.createOscillator();r.type="sawtooth",r.frequency.value=60;const s=e.createOscillator();s.type="triangle",s.frequency.value=60,s.detune.value=7,r.connect(n),s.connect(n);const a=p0(e),o=e.createBufferSource();o.buffer=a,o.loop=!0;const l=e.createBiquadFilter();l.type="lowpass",l.frequency.value=420;const c=e.createGain();c.gain.value=0,o.connect(l).connect(c).connect(t);const h=e.createBufferSource();h.buffer=a,h.loop=!0;const p=e.createBiquadFilter();p.type="highpass",p.frequency.value=2200;const u=e.createGain();u.gain.value=0,h.connect(p).connect(u).connect(t);let m=!1;function _(){if(!m){m=!0;try{r.start(),s.start(),o.start(),h.start()}catch{}e.resume()}}function M(f,S){const T=Number.isFinite(S)?S:0;f.setTargetAtTime(T,e.currentTime,f0)}function d(f){M(r.frequency,f.whineHz),M(s.frequency,f.whineHz),M(n.gain,.18*f.tractionGain),M(c.gain,.5*f.rollGain),M(u.gain,.4*f.brakeHissGain)}return{start:_,update:d}}const g0=44.7,Br=i=>i<0?0:i>1?1:i,yi=(i,e=0)=>Number.isFinite(i)?i:e;function _0(i,e,t){const r=Math.abs(yi(i))/g0,s=yi(60+220*r+90*Math.sqrt(Math.max(r,0)),60),a=Br(yi(e)),o=Br(yi(Math.min(r,1))),l=Br(yi(Br(yi(t))*(.5+.5*Math.min(r,1))));return{whineHz:s,tractionGain:a,rollGain:o,brakeHissGain:l}}const Jr={powerUp:!1,powerDown:!1,brakeUp:!1,brakeDown:!1,emergency:!1,reverserFwd:!1,reverserOff:!1,reverserRev:!1,toggleDra:!1,acknowledge:!1,cycleEnvironment:!1,anyActivity:!1};function x0(...i){const e={...Jr};for(const t of i)e.powerUp=e.powerUp||t.powerUp,e.powerDown=e.powerDown||t.powerDown,e.brakeUp=e.brakeUp||t.brakeUp,e.brakeDown=e.brakeDown||t.brakeDown,e.emergency=e.emergency||t.emergency,e.reverserFwd=e.reverserFwd||t.reverserFwd,e.reverserOff=e.reverserOff||t.reverserOff,e.reverserRev=e.reverserRev||t.reverserRev,e.toggleDra=e.toggleDra||t.toggleDra,e.acknowledge=e.acknowledge||t.acknowledge,e.cycleEnvironment=e.cycleEnvironment||t.cycleEnvironment,e.anyActivity=e.anyActivity||t.anyActivity;return e}function v0(i){return{powerUp:i.powerUp,powerDown:i.powerDown,brakeUp:i.brakeUp,brakeDown:i.brakeDown,emergency:i.emergency,reverserFwd:i.reverserFwd,reverserOff:i.reverserOff,reverserRev:i.reverserRev,toggleDra:i.toggleDra,acknowledge:i.acknowledge,vigilancePing:i.anyActivity}}function M0(i){const e=t=>i.has(t);return{powerUp:e("KeyW"),powerDown:e("KeyS"),brakeUp:e("KeyD"),brakeDown:e("KeyA"),emergency:e("Backquote"),reverserFwd:e("KeyF"),reverserOff:e("KeyN"),reverserRev:e("KeyR"),toggleDra:e("KeyL"),acknowledge:e("KeyQ"),cycleEnvironment:e("KeyE"),anyActivity:i.size>0}}function S0(i,e){const t=s=>i[s]??!1,n=e<=-.5,r=e>=.5;return{powerUp:t(7),powerDown:t(6),brakeUp:t(5),brakeDown:t(4),emergency:t(1),reverserFwd:t(12),reverserOff:t(15)||r,reverserRev:t(13)||t(14)||n,toggleDra:t(2),acknowledge:t(0),cycleEnvironment:t(3),anyActivity:i.some(s=>s)||Math.abs(e)>.25}}function E0(){const i=new Set;return window.addEventListener("keydown",e=>{e.repeat||i.add(e.code)}),window.addEventListener("keyup",e=>i.delete(e.code)),window.addEventListener("blur",()=>i.clear()),{edges:()=>i,clear:()=>i.clear()}}function y0(){const i=[],e=[];function t(){if(typeof navigator>"u"||typeof navigator.getGamepads!="function")return Jr;const n=navigator.getGamepads()[0];if(!n)return Jr;const r=n.buttons;e.length=r.length;for(let a=0;a<r.length;a++){const o=r[a],l=o?o.pressed:!1,c=i[a]??!1;e[a]=l&&!c,i[a]=l}const s=n.axes[0]??0;return S0(e,s)}return{actions:t}}const Ac="mdtrain2-touch-style",bi="mdtrain2-touch",wc=[{action:"powerUp",label:"Power up",text:"PWR +"},{action:"powerDown",label:"Power down",text:"PWR −"},{action:"brakeUp",label:"Brake up",text:"BRK +"},{action:"brakeDown",label:"Brake down",text:"BRK −"},{action:"reverserFwd",label:"Reverser forward",text:"REV F"},{action:"reverserOff",label:"Reverser neutral",text:"REV N"},{action:"reverserRev",label:"Reverser reverse",text:"REV R"},{action:"toggleDra",label:"Driver's reminder appliance",text:"DRA"},{action:"acknowledge",label:"Acknowledge",text:"ACK"},{action:"emergency",label:"Emergency brake",text:"EMERGENCY"},{action:"cycleEnvironment",label:"Cycle environment",text:"ENV"}],b0=`
#${bi} {
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
#${bi} button {
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
#${bi} button:active {
  background: rgba(40, 70, 120, 0.92);
}
#${bi} button[data-action="emergency"] {
  grid-column: span 2;
  color: #ffd2cf;
  border-color: rgba(220, 90, 80, 0.7);
}
@media (pointer: coarse), (max-width: 760px) {
  #${bi} { display: grid; }
}
`;function T0(){if(document.getElementById(Ac))return;const i=document.createElement("style");i.id=Ac,i.textContent=b0,document.head.appendChild(i)}function A0(i){T0();const e={powerUp:!1,powerDown:!1,brakeUp:!1,brakeDown:!1,emergency:!1,reverserFwd:!1,reverserOff:!1,reverserRev:!1,toggleDra:!1,acknowledge:!1,cycleEnvironment:!1},t=document.createElement("div");t.id=bi;for(const r of wc){const s=document.createElement("button");s.type="button",s.textContent=r.text,s.setAttribute("aria-label",r.label),s.dataset.action=r.action,s.addEventListener("pointerdown",a=>{a.preventDefault(),e[r.action]=!0}),t.appendChild(s)}i.appendChild(t);function n(){let r=!1;const s={...Jr};for(const a of wc)e[a.action]&&(s[a.action]=!0,r=!0,e[a.action]=!1);return s.anyActivity=r,s}return{actions:n}}function w0(i){return i?{rainScale:0,wiperEnabled:!1}:{rainScale:1,wiperEnabled:!0}}const R0=2400,C0=900;function Rc(i,e,t){return Number.isFinite(i)?Math.min(t,Math.max(e,i)):e}function P0(i){const e=i.coarsePointer?Rc(i.maxDevicePixelRatio,1,1.5):Rc(i.maxDevicePixelRatio,1,2);let t=i.coarsePointer?C0:R0;return i.reducedMotion&&(t=0),{pixelRatioCap:e,rainCount:t}}const oo=document.getElementById("app");if(!oo)throw new Error("#app not found");const Xr=Vl,D0=Xl,yl=window.matchMedia("(prefers-reduced-motion: reduce)").matches,L0=window.matchMedia("(pointer: coarse)").matches,I0=P0({coarsePointer:L0,maxDevicePixelRatio:window.devicePixelRatio,reducedMotion:yl}),bl=n0(oo,Xr,I0),U0=o0(document.body);h0(document.body);const Tl=m0(),Cc=E0(),N0=y0(),F0=A0(oo);let Jt=ql(0),Pn=nu(),Hn=iu(),ji=du(),Hs=Ws;window.addEventListener("resize",()=>bl.resize());function Qr(){Tl.start(),window.removeEventListener("keydown",Qr),window.removeEventListener("pointerdown",Qr)}window.addEventListener("keydown",Qr);window.addEventListener("pointerdown",Qr);let Pc=performance.now();function Al(i){requestAnimationFrame(Al);const e=Math.min((i-Pc)/1e3,.05);Pc=i;const t=x0(M0(Cc.edges()),N0.actions(),F0.actions()),n=v0(t);t.cycleEnvironment&&(Hs=bu(Hs));const r=w0(yl),s=Eu(Hs),a={...s,rainIntensity:s.rainIntensity*r.rainScale,wiperOn:s.wiperOn&&r.wiperEnabled};Pn=su(Pn,n,Jt,Hn);const o=au(Pn,Hn,a.mu),l=Jt.chainage;Jt=$l(D0,Xr,Jt,o,e);const c=Pn.lastDir,h=pu(ji,Jt,Xr,n,l,c,e);ji=h.next,Hn=ou(Hn,n,Jt,e,{reasons:h.reasons});const p={chainage:Jt.chainage,speed:Jt.speed,dt:e,controls:Pn,safety:Hn,aws:ji,served:ji.served,env:a};bl.render(p),U0.update(uu(Jt,Pn,Hn,Xr,ji.served,h.hud));const u=ka(Pn,Hn);Tl.update(_0(Jt.speed,Pn.powerNotch/jn,u)),Cc.clear()}requestAnimationFrame(Al);
