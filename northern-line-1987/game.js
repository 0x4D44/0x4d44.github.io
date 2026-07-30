import * as THREE from './three.module.min.js';

const VERSION = '1.0.0';
const MPH = 2.2369362920544;
const MPS = 1 / MPH;
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const IS_TEST = new URLSearchParams(location.search).has('test');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / Math.max(1e-6, b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const inverseLerp = (a, b, v) => clamp((v - a) / Math.max(1e-6, b - a), 0, 1);
const seeded = (seed = 1987) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const fmt2 = n => String(Math.floor(n)).padStart(2, '0');
const fmtClock = seconds => {
  const s = ((Math.round(seconds) % 86400) + 86400) % 86400;
  return `${fmt2(s / 3600)}:${fmt2((s % 3600) / 60)}:${fmt2(s % 60)}`;
};
const fmtBooked = seconds => fmtClock(seconds).slice(0, 5);
const fmtDelta = seconds => {
  const n = Math.round(seconds);
  if (Math.abs(n) <= 4) return 'RIGHT TIME';
  return n > 0 ? `+${n}s LATE` : `${Math.abs(n)}s EARLY`;
};
const titleCase = value => value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

const POWER_LABELS = ['OFF', 'SHUNT', 'SERIES', 'PARALLEL'];
const BRAKE_LABELS = ['RELEASE', 'LAP', 'STEP 1', 'STEP 2', 'STEP 3', 'EMERGENCY'];
const POWER_LEVELS = [0, 0.22, 0.62, 1.0];
const BRAKE_LEVELS = [0, 0.08, 0.31, 0.55, 0.78, 1.0];

// Segment distance is the playable geometry after each station, deliberately
// compressed while preserving the real Charing Cross / Edgware station order.
const STATIONS = [
  { name:'Morden', side:'right', surface:true,  distance:980, limit:40, dwell:18, theme:'#e7deca' },
  { name:'South Wimbledon', side:'left', surface:false, distance:760, limit:35, dwell:16, theme:'#d8d3bd' },
  { name:'Colliers Wood', side:'right', surface:false, distance:690, limit:35, dwell:16, theme:'#d9d7ca' },
  { name:'Tooting Broadway', side:'left', surface:false, distance:720, limit:35, dwell:18, theme:'#e2dcc5' },
  { name:'Tooting Bec', side:'right', surface:false, distance:640, limit:35, dwell:16, theme:'#ded8c3' },
  { name:'Balham', side:'left', surface:false, distance:780, limit:35, dwell:20, theme:'#ddd5c0' },
  { name:'Clapham South', side:'right', surface:false, distance:770, limit:35, dwell:17, theme:'#e5dfcc' },
  { name:'Clapham Common', side:'left', surface:false, distance:650, limit:30, dwell:19, theme:'#ddd6c2' },
  { name:'Clapham North', side:'right', surface:false, distance:600, limit:30, dwell:17, theme:'#dfd8c5' },
  { name:'Stockwell', side:'left', surface:false, distance:730, limit:35, dwell:21, theme:'#e2dac4' },
  { name:'Oval', side:'right', surface:false, distance:690, limit:35, dwell:17, theme:'#e5dec9' },
  { name:'Kennington', side:'right', surface:false, distance:820, limit:30, dwell:22, theme:'#dfd8c0' },
  { name:'Waterloo', side:'left', surface:false, distance:690, limit:30, dwell:25, theme:'#e2dbc3' },
  { name:'Embankment', side:'right', surface:false, distance:520, limit:25, dwell:21, theme:'#ded5bc' },
  { name:'Charing Cross', side:'left', surface:false, distance:520, limit:25, dwell:24, theme:'#e1dbc8' },
  { name:'Leicester Square', side:'right', surface:false, distance:490, limit:25, dwell:22, theme:'#ded9ca' },
  { name:'Tottenham Court Road', side:'left', surface:false, distance:570, limit:25, dwell:24, theme:'#e3ddc8' },
  { name:'Goodge Street', side:'right', surface:false, distance:480, limit:25, dwell:16, theme:'#e2dbc7' },
  { name:'Warren Street', side:'left', surface:false, distance:610, limit:30, dwell:20, theme:'#e0d8c1' },
  { name:'Euston', side:'right', surface:false, distance:570, limit:25, dwell:25, theme:'#ded4bb' },
  { name:'Mornington Crescent', side:'left', surface:false, distance:530, limit:30, dwell:16, theme:'#e2dcc8' },
  { name:'Camden Town', side:'right', surface:false, distance:620, limit:25, dwell:25, theme:'#dfd8c6' },
  { name:'Chalk Farm', side:'left', surface:false, distance:590, limit:35, dwell:16, theme:'#e2dbc6' },
  { name:'Belsize Park', side:'right', surface:false, distance:720, limit:35, dwell:17, theme:'#ded7c3' },
  { name:'Hampstead', side:'left', surface:false, distance:1060, limit:35, dwell:18, theme:'#e3ddc8' },
  { name:'Golders Green', side:'right', surface:true, distance:850, limit:40, dwell:22, theme:'#d5d1c1' },
  { name:'Brent Cross', side:'left', surface:true, distance:800, limit:40, dwell:16, theme:'#d8d4c4' },
  { name:'Hendon Central', side:'right', surface:true, distance:900, limit:40, dwell:17, theme:'#ddd8c5' },
  { name:'Colindale', side:'left', surface:true, distance:840, limit:40, dwell:17, theme:'#d9d5c6' },
  { name:'Burnt Oak', side:'right', surface:true, distance:760, limit:40, dwell:16, theme:'#dad5c4' },
  { name:'Edgware', side:'left', surface:true, distance:0, limit:25, dwell:24, theme:'#ded8c6' },
];

const SCENARIOS = {
  central: { id:'central', duty:'137', start:11, end:21, startTime:7*3600+42*60, holdAt:18, weather:'wet dawn', destination:'CAMDEN TOWN' },
  north:   { id:'north', duty:'204', start:21, end:30, startTime:16*3600+18*60, holdAt:24, weather:'wet afternoon', destination:'EDGWARE' },
  full:    { id:'full', duty:'311', start:0, end:30, startTime:5*3600+36*60, holdAt:19, weather:'first light', destination:'EDGWARE' },
};

function makeCanvasTexture(width, height, paint, { repeatX = 1, repeatY = 1, srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeTunnelTexture() {
  const rand = seeded(5900);
  return makeCanvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#171918';
    g.fillRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,.02)');
    grad.addColorStop(.5, 'rgba(255,255,255,.10)');
    grad.addColorStop(1, 'rgba(0,0,0,.18)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let x=0; x<w; x+=32) {
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x,0,2,h);
      g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(x+2,0,1,h);
    }
    for (let i=0;i<900;i++) {
      const a=.02+rand()*.09;
      g.fillStyle = rand()>.65 ? `rgba(117,91,48,${a})` : `rgba(0,0,0,${a})`;
      g.fillRect(rand()*w,rand()*h,1+rand()*8,1+rand()*14);
    }
    for (let i=0;i<12;i++) {
      const x=rand()*w, y=rand()*h;
      const drip=g.createLinearGradient(x,y,x,y+50+rand()*90);
      drip.addColorStop(0,'rgba(103,88,57,.22)'); drip.addColorStop(1,'rgba(103,88,57,0)');
      g.fillStyle=drip; g.fillRect(x,y,1+rand()*2,80);
    }
  }, { repeatX: 1, repeatY: 3 });
}

function makeBallastTexture() {
  const rand = seeded(4404);
  return makeCanvasTexture(128,128,(g,w,h)=>{
    g.fillStyle='#292a28'; g.fillRect(0,0,w,h);
    for(let i=0;i<1400;i++){
      const v=Math.floor(45+rand()*70);
      g.fillStyle=`rgb(${v},${v-2},${Math.max(0,v-7)})`;
      const r=.4+rand()*1.8; g.fillRect(rand()*w,rand()*h,r*2,r);
    }
  },{repeatX:1,repeatY:12});
}

function makeGrimeTexture() {
  const rand=seeded(198759);
  return makeCanvasTexture(512,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    for(let i=0;i<120;i++){
      const x=rand()*w,y=rand()*h,r=3+rand()*24;
      const grad=g.createRadialGradient(x,y,0,x,y,r);
      grad.addColorStop(0,`rgba(125,115,92,${.015+rand()*.07})`);
      grad.addColorStop(1,'rgba(125,115,92,0)');
      g.fillStyle=grad; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
    }
    for(let i=0;i<15;i++){
      const x=rand()*w;
      const grad=g.createLinearGradient(x,0,x+rand()*20,h);
      grad.addColorStop(0,'rgba(255,255,255,0)');
      grad.addColorStop(.2,'rgba(198,202,193,.055)');
      grad.addColorStop(1,'rgba(198,202,193,0)');
      g.strokeStyle=grad; g.lineWidth=.5+rand()*1.7; g.beginPath(); g.moveTo(x,0);g.lineTo(x+rand()*20,h);g.stroke();
    }
  },{srgb:true});
}

function makeSignTexture(name, width=768, height=160) {
  return makeCanvasTexture(width,height,(g,w,h)=>{
    g.fillStyle='#e9e4d5'; g.fillRect(0,0,w,h);
    g.strokeStyle='#302f2a'; g.lineWidth=6; g.strokeRect(3,3,w-6,h-6);
    const cx=90,cy=h/2,r=53;
    g.strokeStyle='#d5212b'; g.lineWidth=25; g.beginPath(); g.arc(cx,cy,r,0,Math.PI*2);g.stroke();
    g.fillStyle='#163d74'; g.fillRect(18,cy-18,144,36);
    g.fillStyle='#fff'; g.font='bold 17px Arial'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('UNDERGROUND',cx,cy+1);
    let size=52;
    g.font=`900 ${size}px Arial Narrow, Arial`;
    while(g.measureText(name.toUpperCase()).width>w-210 && size>24){size-=2;g.font=`900 ${size}px Arial Narrow, Arial`;}
    g.textAlign='left';g.fillStyle='#171a1c';g.fillText(name.toUpperCase(),180,cy+2);
    g.fillStyle='rgba(44,38,28,.08)';
    for(let i=0;i<45;i++) g.fillRect(Math.random()*w,Math.random()*h,Math.random()*16,1);
  });
}

function makePosterTexture(seed, label) {
  const rand=seeded(seed);
  const palettes=[['#d7b947','#22272b'],['#d55a3b','#efe4c9'],['#346e86','#efe6d4'],['#48814b','#f4e6c6'],['#9d3651','#f0d8ad']];
  const [bg,fg]=palettes[seed%palettes.length];
  const lines=['LATE EDITION','BRITAIN\'S BEST','A CUP OF TEA','SEE THE WEST END','THE NEW SOUND'];
  return makeCanvasTexture(256,384,(g,w,h)=>{
    g.fillStyle=bg;g.fillRect(0,0,w,h);
    g.fillStyle=fg;g.fillRect(18,18,w-36,h-36);
    g.fillStyle=bg;g.font='900 29px Arial';g.textAlign='center';g.fillText(lines[seed%lines.length],w/2,62);
    g.fillStyle=bg;g.beginPath();g.arc(w/2,175,72,0,Math.PI*2);g.fill();
    g.fillStyle=fg;g.beginPath();g.arc(w/2,175,50,0,Math.PI*2);g.fill();
    g.fillStyle=bg;g.font='900 24px Arial';g.fillText(label.toUpperCase(),w/2,288);
    g.font='bold 13px Arial';g.fillText('EVERY DAY · EVERYWHERE',w/2,320);
    for(let i=0;i<150;i++){
      const a=.02+rand()*.08;g.fillStyle=`rgba(20,18,12,${a})`;g.fillRect(rand()*w,rand()*h,1+rand()*5,1+rand()*8);
    }
  });
}

function makeGaugeFace(label, max, majorStep, unit='') {
  return makeCanvasTexture(256,256,(g,w,h)=>{
    const cx=w/2,cy=h/2;
    const grad=g.createRadialGradient(cx-35,cy-45,10,cx,cy,120);
    grad.addColorStop(0,'#f6f0d9');grad.addColorStop(.72,'#d8cfb6');grad.addColorStop(1,'#8e897c');
    g.fillStyle=grad;g.beginPath();g.arc(cx,cy,120,0,Math.PI*2);g.fill();
    g.strokeStyle='#1b1c1b';g.lineWidth=5;g.beginPath();g.arc(cx,cy,115,0,Math.PI*2);g.stroke();
    const a0=-Math.PI*.75,a1=Math.PI*.75;
    for(let v=0;v<=max;v+=majorStep/5){
      const t=v/max,a=lerp(a0,a1,t);const major=Math.abs((v/majorStep)-Math.round(v/majorStep))<.001;
      const r0=major?81:91,r1=105;
      g.strokeStyle='#1a1a18';g.lineWidth=major?4:1.5;g.beginPath();g.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0);g.lineTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1);g.stroke();
      if(major){g.fillStyle='#151615';g.font='bold 17px Arial';g.textAlign='center';g.textBaseline='middle';g.fillText(String(v),cx+Math.cos(a)*64,cy+Math.sin(a)*64);}
    }
    g.fillStyle='#191a18';g.textAlign='center';g.font='bold 17px Arial';g.fillText(label,cx,168);
    g.font='11px Arial';g.fillText(unit,cx,187);
    g.fillStyle='#242523';g.beginPath();g.arc(cx,cy,12,0,Math.PI*2);g.fill();
  });
}

function makeLabelTexture(text, fg='#e7ddbd', bg='#171a18', width=512, height=128) {
  return makeCanvasTexture(width,height,(g,w,h)=>{
    g.fillStyle=bg;g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(255,255,255,.22)';g.lineWidth=4;g.strokeRect(3,3,w-6,h-6);
    let size=Math.floor(h*.47);g.font=`900 ${size}px Arial Narrow, Arial`;while(g.measureText(text).width>w-32&&size>16){size-=2;g.font=`900 ${size}px Arial Narrow, Arial`;}
    g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';g.fillText(text,w/2,h/2+2);
  });
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.motorGain = null;
    this.motor = null;
    this.motor2 = null;
    this.rumbleGain = null;
    this.rumbleFilter = null;
    this.windGain = null;
    this.flangeGain = null;
    this.flange = null;
    this.started = false;
  }
  start() {
    if (this.started) {
      if (this.ctx?.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = .55; this.master.connect(this.ctx.destination);

    this.motorGain = this.ctx.createGain(); this.motorGain.gain.value = 0;
    const motorFilter=this.ctx.createBiquadFilter();motorFilter.type='lowpass';motorFilter.frequency.value=1500;
    this.motor = this.ctx.createOscillator(); this.motor.type='sawtooth'; this.motor.frequency.value=55;
    this.motor2 = this.ctx.createOscillator(); this.motor2.type='triangle'; this.motor2.frequency.value=110;
    const m2g=this.ctx.createGain();m2g.gain.value=.28;
    this.motor.connect(this.motorGain);this.motor2.connect(m2g);m2g.connect(this.motorGain);this.motorGain.connect(motorFilter);motorFilter.connect(this.master);
    this.motor.start();this.motor2.start();

    const noiseBuffer=this.ctx.createBuffer(1,this.ctx.sampleRate*3,this.ctx.sampleRate);
    const data=noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(.45+Math.random()*.55);
    const rumble=this.ctx.createBufferSource();rumble.buffer=noiseBuffer;rumble.loop=true;
    this.rumbleFilter=this.ctx.createBiquadFilter();this.rumbleFilter.type='lowpass';this.rumbleFilter.frequency.value=180;
    this.rumbleGain=this.ctx.createGain();this.rumbleGain.gain.value=0;
    rumble.connect(this.rumbleFilter);this.rumbleFilter.connect(this.rumbleGain);this.rumbleGain.connect(this.master);rumble.start();

    const wind=this.ctx.createBufferSource();wind.buffer=noiseBuffer;wind.loop=true;
    const windFilter=this.ctx.createBiquadFilter();windFilter.type='bandpass';windFilter.frequency.value=850;windFilter.Q.value=.5;
    this.windGain=this.ctx.createGain();this.windGain.gain.value=0;
    wind.connect(windFilter);windFilter.connect(this.windGain);this.windGain.connect(this.master);wind.start(.17);

    this.flange=this.ctx.createOscillator();this.flange.type='sine';this.flange.frequency.value=620;
    this.flangeGain=this.ctx.createGain();this.flangeGain.gain.value=0;
    this.flange.connect(this.flangeGain);this.flangeGain.connect(this.master);this.flange.start();
    this.started=true;
  }
  update(speedMps,power,brake,curve,tunnel) {
    if(!this.ctx||!this.started)return;
    const now=this.ctx.currentTime;
    const speedMph=speedMps*MPH;
    const motorLevel=(.014+.075*power)*smoothstep(0,3,speedMph)*(1-smoothstep(38,50,speedMph));
    this.motorGain.gain.setTargetAtTime(motorLevel,now,.08);
    const base=47+speedMps*7.2+power*35;
    this.motor.frequency.setTargetAtTime(base,now,.05);this.motor2.frequency.setTargetAtTime(base*2.03,now,.05);
    this.rumbleGain.gain.setTargetAtTime(.005+smoothstep(2,38,speedMph)*.15,now,.12);
    this.rumbleFilter.frequency.setTargetAtTime(100+speedMph*8,now,.15);
    this.windGain.gain.setTargetAtTime(smoothstep(12,45,speedMph)*(tunnel?.09:.055),now,.2);
    const squeal=smoothstep(.0008,.006,curve)*smoothstep(8,30,speedMph)*(brake>.2?.6:1);
    this.flangeGain.gain.setTargetAtTime(squeal*.055,now,.12);
    this.flange.frequency.setTargetAtTime(480+speedMph*8+curve*9000,now,.1);
  }
  tone(freq=720,duration=.12,volume=.16,delay=0,type='square') {
    if(!this.ctx)return;
    const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.03);
  }
  bells(count=2){for(let i=0;i<count;i++)this.tone(690,.13,.12,i*.31,'square');}
  click(){this.tone(180,.055,.08,0,'square');}
  horn(){this.tone(370,.52,.12,0,'sawtooth');this.tone(520,.48,.06,.03,'triangle');}
  thud(){this.tone(70,.12,.18,0,'sine');}
  hiss(duration=.55,volume=.12){
    if(!this.ctx)return;
    const len=Math.max(1,Math.floor(this.ctx.sampleRate*duration));const b=this.ctx.createBuffer(1,len,this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
    const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=b;f.type='highpass';f.frequency.value=900;g.gain.value=volume;s.connect(f);f.connect(g);g.connect(this.master);s.start();
  }
  trip(){this.tone(95,.9,.2,0,'sawtooth');this.tone(880,.18,.13,.1,'square');this.tone(880,.18,.13,.43,'square');}
  compressor(){this.tone(78,.8,.045,0,'sawtooth');this.tone(84,.8,.035,.03,'square');}
  suspend(){if(this.ctx?.state==='running')this.ctx.suspend();}
  resume(){if(this.ctx?.state==='suspended')this.ctx.resume();}
}

class RouteModel {
  constructor() {
    let planned=0;
    const raw=[];
    const y0=1.8*Math.sin(.42)+.9*Math.sin(.16);
    for(let i=0;i<STATIONS.length;i++){
      if(i>0) planned+=STATIONS[i-1].distance;
      const x=38*Math.sin(i*.61)+88*Math.sin(i*.205)+16*Math.sin(i*1.33);
      const y=(1.8*Math.sin(i*.42+.42)+.9*Math.sin(i*.16+.16))-y0;
      raw.push(new THREE.Vector3(x,y,-planned));
    }
    this.curve=new THREE.CatmullRomCurve3(raw,false,'catmullrom',.22);
    this.samples=14000;
    this.tArr=new Float32Array(this.samples+1);
    this.sArr=new Float32Array(this.samples+1);
    let length=0,prev=this.curve.getPoint(0);
    for(let i=0;i<=this.samples;i++){
      const t=i/this.samples,p=this.curve.getPoint(t);
      if(i)length+=p.distanceTo(prev);
      this.tArr[i]=t;this.sArr[i]=length;prev=p;
    }
    this.length=length;
    STATIONS.forEach((st,i)=>{
      st.routeIndex=i;
      st.t=i/(STATIONS.length-1);
      st.s=this.tToS(st.t);
    });
    this.mordenPortal=STATIONS[0].s+330;
    this.northPortal=lerp(STATIONS[24].s,STATIONS[25].s,.72);
  }
  sToT(s){
    s=clamp(s,0,this.length);let lo=0,hi=this.samples;
    while(lo<=hi){const m=(lo+hi)>>1;if(this.sArr[m]<s)lo=m+1;else hi=m-1;}
    const i=clamp(lo,1,this.samples),s0=this.sArr[i-1],s1=this.sArr[i];
    return lerp(this.tArr[i-1],this.tArr[i],(s-s0)/Math.max(1e-6,s1-s0));
  }
  tToS(t){
    const f=clamp(t,0,1)*this.samples,i=Math.floor(f),u=f-i;
    return lerp(this.sArr[i],this.sArr[Math.min(this.samples,i+1)],u);
  }
  posAt(s,target=new THREE.Vector3()){return this.curve.getPoint(this.sToT(s),target);}
  tangentAt(s,target=new THREE.Vector3()){return this.curve.getTangent(this.sToT(s),target).normalize();}
  basisAt(s){
    const position=this.posAt(s);
    const forward=this.tangentAt(s);
    const right=new THREE.Vector3().crossVectors(forward,UP).normalize();
    const up=new THREE.Vector3().crossVectors(right,forward).normalize();
    const quaternion=new THREE.Quaternion().setFromUnitVectors(FORWARD,forward);
    return {position,forward,right,up,quaternion};
  }
  curvatureAt(s){
    const a=this.tangentAt(Math.max(0,s-7)),b=this.tangentAt(Math.min(this.length,s+7));
    return Math.acos(clamp(a.dot(b),-1,1))/14;
  }
  gradeAt(s){return this.tangentAt(s).y;}
  isSurface(s){return s<this.mordenPortal||s>this.northPortal;}
  nearestStation(s){
    let best=STATIONS[0],d=Infinity;
    for(const st of STATIONS){const x=Math.abs(st.s-s);if(x<d){d=x;best=st;}}
    return {station:best,distance:d};
  }
  isStationZone(s,pad=74){return this.nearestStation(s).distance<pad;}
  offsetCurve(offset,y=0.14,samples=700){
    const points=[];
    for(let i=0;i<=samples;i++){
      const s=this.length*i/samples,b=this.basisAt(s);
      points.push(b.position.clone().addScaledVector(b.right,offset).addScaledVector(b.up,y));
    }
    return new THREE.CatmullRomCurve3(points,false,'catmullrom',.15);
  }
}

function makeRibbonGeometry(route,width,yOffset=-.12,segments=2600,uvScale=8) {
  const vertices=[],normals=[],uvs=[],indices=[];
  for(let i=0;i<=segments;i++){
    const s=route.length*i/segments,b=route.basisAt(s),p=b.position.clone().addScaledVector(b.up,yOffset);
    const l=p.clone().addScaledVector(b.right,-width/2),r=p.clone().addScaledVector(b.right,width/2);
    vertices.push(l.x,l.y,l.z,r.x,r.y,r.z);
    normals.push(b.up.x,b.up.y,b.up.z,b.up.x,b.up.y,b.up.z);
    uvs.push(0,s/uvScale,1,s/uvScale);
    if(i<segments){const a=i*2;indices.push(a,a+2,a+1,a+2,a+3,a+1);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geo.setIndex(indices);geo.computeBoundingSphere();return geo;
}

function setInstance(mesh,index,position,quaternion,scale=new THREE.Vector3(1,1,1)) {
  const matrix=new THREE.Matrix4().compose(position,quaternion,scale);
  mesh.setMatrixAt(index,matrix);
}

class WorldBuilder {
  constructor(scene,route) {
    this.scene=scene;this.route=route;this.stationGroups=[];this.signalObjects=[];this.surfaceObjects=[];
    this.tunnelLights=[];this.rand=seeded(1987);
    this.materials={};
    this.buildMaterials();
    this.buildTrack();
    this.buildTunnel();
    this.buildGroundAndCity();
    this.buildStations();
    this.buildSignals();
    this.buildNorthEnd();
  }
  buildMaterials(){
    this.materials.rail=new THREE.MeshStandardMaterial({color:0x9a9d99,metalness:.72,roughness:.28});
    this.materials.conductor=new THREE.MeshStandardMaterial({color:0x555a56,metalness:.55,roughness:.42});
    this.materials.sleeper=new THREE.MeshStandardMaterial({color:0x4d3c2d,roughness:.94});
    this.materials.ballast=new THREE.MeshStandardMaterial({map:makeBallastTexture(),color:0x767770,roughness:1});
    this.materials.tunnel=new THREE.MeshStandardMaterial({map:makeTunnelTexture(),color:0x8a8c86,roughness:1,side:THREE.BackSide});
    this.materials.black=new THREE.MeshStandardMaterial({color:0x111413,roughness:.96});
    this.materials.light=new THREE.MeshBasicMaterial({color:0xffe5a5,toneMapped:false});
    this.materials.redLight=new THREE.MeshBasicMaterial({color:0xff252b,toneMapped:false});
    this.materials.greenLight=new THREE.MeshBasicMaterial({color:0x2eff78,toneMapped:false});
    this.materials.offLight=new THREE.MeshStandardMaterial({color:0x241d16,roughness:.8});
  }
  buildTrack(){
    const ballast=new THREE.Mesh(makeRibbonGeometry(this.route,3.25,-.14,2600,6),this.materials.ballast);
    ballast.frustumCulled=false;this.scene.add(ballast);
    const railSegments=Math.min(3200,Math.max(1000,Math.floor(this.route.length/6)));
    for(const x of [-.72,.72]){
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(this.route.offsetCurve(x,.05,900),railSegments,.055,5,false),this.materials.rail);
      mesh.frustumCulled=false;this.scene.add(mesh);
    }
    for(const x of [-1.08,.18]){
      const mesh=new THREE.Mesh(new THREE.TubeGeometry(this.route.offsetCurve(x,.015,900),railSegments,.07,5,false),this.materials.conductor);
      mesh.frustumCulled=false;this.scene.add(mesh);
    }
    const step=2.5,count=Math.floor(this.route.length/step);
    const sleepers=new THREE.InstancedMesh(new THREE.BoxGeometry(2.65,.13,.22),this.materials.sleeper,count);
    sleepers.frustumCulled=false;
    for(let i=0;i<count;i++){
      const b=this.route.basisAt(i*step),p=b.position.clone().addScaledVector(b.up,-.03);
      setInstance(sleepers,i,p,b.quaternion);
    }
    sleepers.instanceMatrix.needsUpdate=true;this.scene.add(sleepers);
  }
  buildTunnel(){
    const step=15.5,positions=[];
    for(let s=0;s<this.route.length;s+=step){
      if(!this.route.isSurface(s)&&!this.route.isStationZone(s,77))positions.push(s);
    }
    const geo=new THREE.CylinderGeometry(3.63,3.63,step+1,24,1,true);
    const shell=new THREE.InstancedMesh(geo,this.materials.tunnel,positions.length);
    for(let i=0;i<positions.length;i++){
      const b=this.route.basisAt(positions[i]);
      const q=new THREE.Quaternion().setFromUnitVectors(Y_AXIS,b.forward);
      setInstance(shell,i,b.position,q);
    }
    shell.instanceMatrix.needsUpdate=true;shell.frustumCulled=false;this.scene.add(shell);

    const lightPositions=[];
    for(let s=12;s<this.route.length;s+=24){if(!this.route.isSurface(s)&&!this.route.isStationZone(s,86))lightPositions.push(s);}
    const lights=new THREE.InstancedMesh(new THREE.BoxGeometry(.9,.08,.18),this.materials.light,lightPositions.length);
    for(let i=0;i<lightPositions.length;i++){
      const b=this.route.basisAt(lightPositions[i]);
      const p=b.position.clone().addScaledVector(b.up,3.05).addScaledVector(b.right,(i%2?.35:-.35));
      setInstance(lights,i,p,b.quaternion);
      this.tunnelLights.push({s:lightPositions[i],position:p});
    }
    lights.instanceMatrix.needsUpdate=true;lights.frustumCulled=false;this.scene.add(lights);

    const cablePos=[];for(let s=7;s<this.route.length;s+=13){if(!this.route.isSurface(s)&&!this.route.isStationZone(s,80))cablePos.push(s);}
    const cables=new THREE.InstancedMesh(new THREE.BoxGeometry(.08,.08,12.8),new THREE.MeshStandardMaterial({color:0x292b28,metalness:.25,roughness:.7}),cablePos.length);
    for(let i=0;i<cablePos.length;i++){
      const b=this.route.basisAt(cablePos[i]);const p=b.position.clone().addScaledVector(b.right,3.2).addScaledVector(b.up,.85);
      setInstance(cables,i,p,b.quaternion);
    }
    cables.instanceMatrix.needsUpdate=true;cables.frustumCulled=false;this.scene.add(cables);

    const refugePos=[];for(let s=260;s<this.route.length;s+=370){if(!this.route.isSurface(s)&&!this.route.isStationZone(s,90))refugePos.push(s);}
    for(const [i,s] of refugePos.entries()){
      const b=this.route.basisAt(s),side=i%2?1:-1,g=new THREE.Group();g.position.copy(b.position);g.quaternion.copy(b.quaternion);
      const recess=new THREE.Mesh(new THREE.BoxGeometry(1.15,1.9,.28),new THREE.MeshStandardMaterial({color:0x090b0a,roughness:1}));
      recess.position.set(side*3.48,.82,0);recess.rotation.y=side>0?-Math.PI/2:Math.PI/2;g.add(recess);
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.28,.16,.08),this.materials.redLight);lamp.position.set(side*3.3,1.55,0);g.add(lamp);
      this.scene.add(g);
    }
  }
  buildGroundAndCity(){
    const groundTex=makeCanvasTexture(256,256,(g,w,h)=>{
      const rand=seeded(144);g.fillStyle='#30372d';g.fillRect(0,0,w,h);
      for(let i=0;i<900;i++){const v=35+Math.floor(rand()*45);g.fillStyle=`rgba(${v},${v+15},${v-2},.45)`;g.fillRect(rand()*w,rand()*h,1+rand()*5,1+rand()*3);}
      g.strokeStyle='rgba(180,170,145,.15)';for(let x=0;x<w;x+=32){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
    },{repeatX:28,repeatY:240});
    const ground=new THREE.Mesh(makeRibbonGeometry(this.route,190,-.52,1200,18),new THREE.MeshStandardMaterial({map:groundTex,roughness:1,color:0x7e8a72}));
    ground.frustumCulled=false;this.scene.add(ground);

    const buildingMat=new THREE.MeshStandardMaterial({color:0x625f58,roughness:.95});
    const roofMat=new THREE.MeshStandardMaterial({color:0x2d3230,roughness:.9});
    const buildingData=[];
    for(let s=20;s<this.route.length;s+=48){
      if(!this.route.isSurface(s)||this.route.isStationZone(s,120))continue;
      for(const side of [-1,1]){
        if(this.rand()<.18)continue;
        const b=this.route.basisAt(s+this.rand()*18),dist=13+this.rand()*30;
        const p=b.position.clone().addScaledVector(b.right,side*dist).addScaledVector(b.up,2.2);
        buildingData.push({p,q:b.quaternion,scale:new THREE.Vector3(6+this.rand()*13,3.5+this.rand()*10,9+this.rand()*16)});
      }
    }
    const buildings=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),buildingMat,buildingData.length);
    buildingData.forEach((d,i)=>setInstance(buildings,i,d.p,d.q,d.scale));buildings.instanceMatrix.needsUpdate=true;this.scene.add(buildings);
    const roofData=buildingData.slice(0,Math.min(buildingData.length,240));
    const roofs=new THREE.InstancedMesh(new THREE.ConeGeometry(.74,.42,4),roofMat,roofData.length);
    roofData.forEach((d,i)=>{
      const p=d.p.clone().add(new THREE.Vector3(0,d.scale.y*.53,0));
      setInstance(roofs,i,p,d.q,new THREE.Vector3(d.scale.x*.8,3,d.scale.z*.8));
    });roofs.instanceMatrix.needsUpdate=true;this.scene.add(roofs);

    const treeData=[];
    for(let s=0;s<this.route.length;s+=34){
      if(!this.route.isSurface(s)||this.route.isStationZone(s,95))continue;
      if(this.rand()<.35)continue;
      const b=this.route.basisAt(s),side=this.rand()<.5?-1:1,dist=8+this.rand()*22;
      treeData.push({p:b.position.clone().addScaledVector(b.right,side*dist).addScaledVector(b.up,1.8+this.rand()),q:b.quaternion,scale:.7+this.rand()*1.4});
    }
    const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.8,1),new THREE.MeshStandardMaterial({color:0x40543d,roughness:1}),treeData.length);
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.13,.19,2.8,6),new THREE.MeshStandardMaterial({color:0x4c3927,roughness:1}),treeData.length);
    treeData.forEach((d,i)=>{setInstance(crowns,i,d.p,d.q,new THREE.Vector3(d.scale,d.scale,d.scale));setInstance(trunks,i,d.p.clone().add(new THREE.Vector3(0,-2.1*d.scale,0)),d.q,new THREE.Vector3(d.scale,d.scale,d.scale));});
    crowns.instanceMatrix.needsUpdate=true;trunks.instanceMatrix.needsUpdate=true;this.scene.add(crowns,trunks);

    const fenceData=[];for(let s=0;s<this.route.length;s+=8){if(this.route.isSurface(s)){const b=this.route.basisAt(s);for(const side of [-1,1])fenceData.push({p:b.position.clone().addScaledVector(b.right,side*4.7).addScaledVector(b.up,.35),q:b.quaternion});}}
    const fence=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,1.25,.07),new THREE.MeshStandardMaterial({color:0x3a3e3c,metalness:.5,roughness:.55}),fenceData.length);
    fenceData.forEach((d,i)=>setInstance(fence,i,d.p,d.q));fence.instanceMatrix.needsUpdate=true;this.scene.add(fence);
  }
  buildStations(){
    STATIONS.forEach((st,i)=>{
      const b=this.route.basisAt(st.s),group=new THREE.Group();group.name=`station-${st.name}`;group.position.copy(b.position);group.quaternion.copy(b.quaternion);
      const side=st.side==='right'?1:-1;
      const floorMat=new THREE.MeshStandardMaterial({color:st.surface?0x77766e:0x8c887b,roughness:.88});
      const edgeMat=new THREE.MeshStandardMaterial({color:0xe5dfc9,roughness:.78});
      const wallMat=new THREE.MeshStandardMaterial({color:new THREE.Color(st.theme),roughness:.82});
      if(!st.surface){
        const hall=new THREE.Mesh(new THREE.BoxGeometry(12.2,6.5,145),new THREE.MeshStandardMaterial({color:0x343735,roughness:.96,side:THREE.BackSide}));
        hall.position.set(0,2.35,7);group.add(hall);
      }
      const platform=new THREE.Mesh(new THREE.BoxGeometry(2.9,.68,132),floorMat);platform.position.set(side*3.05,.26,7);group.add(platform);
      const edge=new THREE.Mesh(new THREE.BoxGeometry(.36,.1,132),edgeMat);edge.position.set(side*1.78,.64,7);group.add(edge);
      const edgeLine=new THREE.Mesh(new THREE.BoxGeometry(.12,.018,132),new THREE.MeshBasicMaterial({color:0xf6e753}));edgeLine.position.set(side*1.62,.705,7);group.add(edgeLine);
      const wall=new THREE.Mesh(new THREE.BoxGeometry(.25,4.35,132),wallMat);wall.position.set(side*4.55,2.35,7);group.add(wall);
      const lowerBand=new THREE.Mesh(new THREE.BoxGeometry(.27,.9,132),new THREE.MeshStandardMaterial({color:0x242c2e,roughness:.85}));lowerBand.position.set(side*4.39,.77,7);group.add(lowerBand);

      if(st.surface){
        const canopy=new THREE.Mesh(new THREE.BoxGeometry(3.2,.13,92),new THREE.MeshStandardMaterial({color:0x3c4543,metalness:.28,roughness:.7}));canopy.position.set(side*3.15,3.45,10);group.add(canopy);
        for(let z=-30;z<=48;z+=13){const post=new THREE.Mesh(new THREE.BoxGeometry(.11,2.8,.11),new THREE.MeshStandardMaterial({color:0x4b5250,metalness:.5,roughness:.55}));post.position.set(side*3.9,2,z);group.add(post);}
      }

      const signTex=makeSignTexture(st.name);
      for(const z of [-38,2,42]){
        const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.7,.77),new THREE.MeshBasicMaterial({map:signTex,side:THREE.DoubleSide,toneMapped:false}));
        sign.position.set(side*4.39,2.15,z);sign.rotation.y=side>0?-Math.PI/2:Math.PI/2;group.add(sign);
      }
      for(let p=0;p<3;p++){
        const poster=new THREE.Mesh(new THREE.PlaneGeometry(.75,1.12),new THREE.MeshBasicMaterial({map:makePosterTexture(i*7+p,st.name.split(' ')[0]),side:THREE.DoubleSide,toneMapped:false}));
        poster.position.set(side*4.37,1.86,-20+p*22);poster.rotation.y=side>0?-Math.PI/2:Math.PI/2;group.add(poster);
      }
      const tubeMat=new THREE.MeshBasicMaterial({color:0xffecc5,toneMapped:false});
      for(let z=-47;z<62;z+=16){
        const tube=new THREE.Mesh(new THREE.BoxGeometry(.07,.07,7),tubeMat);tube.position.set(side*3.0,3.45,z);group.add(tube);
      }
      for(const z of [-31,12,50]){
        const light=new THREE.PointLight(0xffdca5,st.surface?8:14,24,2);light.position.set(side*2.5,3.1,z);group.add(light);
      }

      const diamond=new THREE.Mesh(new THREE.PlaneGeometry(.62,.62),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false}));
      diamond.position.set(side*1.74,1.15,0);diamond.rotation.y=side>0?-Math.PI/2:Math.PI/2;diamond.rotation.z=Math.PI/4;group.add(diamond);
      const board=new THREE.Mesh(new THREE.PlaneGeometry(1.7,.4),new THREE.MeshBasicMaterial({map:makeLabelTexture('7 CAR STOP','#171a18','#eee8d4',512,128),side:THREE.DoubleSide,toneMapped:false}));
      board.position.set(side*1.71,1.65,-.1);board.rotation.y=side>0?-Math.PI/2:Math.PI/2;group.add(board);

      this.addPassengers(group,side,i);
      group.visible=false;this.scene.add(group);this.stationGroups.push({station:st,group});
    });
  }
  addPassengers(group,side,seed){
    const rand=seeded(1200+seed),count=8+Math.floor(rand()*13);
    const skinMat=new THREE.MeshStandardMaterial({color:0x9d765d,roughness:.9});
    const colours=[0x303b46,0x6b4c3e,0x424d35,0x59455c,0x706a55,0x29323a];
    for(let i=0;i<count;i++){
      const person=new THREE.Group(),body=new THREE.Mesh(new THREE.CapsuleGeometry(.16,.65,3,5),new THREE.MeshStandardMaterial({color:colours[Math.floor(rand()*colours.length)],roughness:.9}));
      body.position.y=1.15;const head=new THREE.Mesh(new THREE.SphereGeometry(.13,7,5),skinMat);head.position.y=1.73;person.add(body,head);
      person.position.set(side*(2.25+rand()*1.65),.68,-50+rand()*112);person.rotation.y=rand()*Math.PI*2;group.add(person);
    }
  }
  buildSignals(){
    for(let i=1;i<STATIONS.length;i++){
      const s=Math.max(STATIONS[i-1].s+100,STATIONS[i].s-165),b=this.route.basisAt(s),group=new THREE.Group();group.position.copy(b.position);group.quaternion.copy(b.quaternion);
      const post=new THREE.Mesh(new THREE.BoxGeometry(.13,2.05,.13),new THREE.MeshStandardMaterial({color:0x343836,metalness:.58,roughness:.52}));post.position.set(-2.15,1.0,0);group.add(post);
      const head=new THREE.Mesh(new THREE.BoxGeometry(.54,.88,.28),new THREE.MeshStandardMaterial({color:0x141716,roughness:.72}));head.position.set(-2.15,1.87,0);group.add(head);
      const red=new THREE.Mesh(new THREE.SphereGeometry(.14,12,8),this.materials.offLight.clone());red.position.set(-2.15,2.08,-.16);group.add(red);
      const green=new THREE.Mesh(new THREE.SphereGeometry(.14,12,8),this.materials.greenLight.clone());green.position.set(-2.15,1.69,-.16);group.add(green);
      const trip=new THREE.Mesh(new THREE.BoxGeometry(.12,.37,.27),new THREE.MeshStandardMaterial({color:0x4a4437,metalness:.55,roughness:.6}));trip.position.set(-1.17,.2,0);group.add(trip);
      const plate=new THREE.Mesh(new THREE.PlaneGeometry(.52,.22),new THREE.MeshBasicMaterial({map:makeLabelTexture(String(400+i),'#eee8d2','#1a1d1b',256,96),side:THREE.DoubleSide,toneMapped:false}));plate.position.set(-2.16,1.22,-.13);group.add(plate);
      group.visible=false;this.scene.add(group);this.signalObjects.push({index:i,s,group,red,green,aspect:'green'});
    }
  }
  setSignalAspect(index,aspect){
    const obj=this.signalObjects.find(s=>s.index===index);if(!obj||obj.aspect===aspect)return;
    obj.aspect=aspect;
    obj.red.material=aspect==='red'?this.materials.redLight:this.materials.offLight;
    obj.green.material=aspect==='green'?this.materials.greenLight:this.materials.offLight;
  }
  buildNorthEnd(){
    const s=lerp(STATIONS[24].s,STATIONS[25].s,.43),b=this.route.basisAt(s),g=new THREE.Group();g.position.copy(b.position);g.quaternion.copy(b.quaternion);
    const concrete=new THREE.MeshStandardMaterial({color:0x353632,roughness:1});
    const ledge=new THREE.Mesh(new THREE.BoxGeometry(2.1,.55,92),concrete);ledge.position.set(-2.72,.12,0);g.add(ledge);
    const wall=new THREE.Mesh(new THREE.BoxGeometry(.3,3.9,92),concrete);wall.position.set(-4.0,1.8,0);g.add(wall);
    for(let z=-38;z<42;z+=10){const beam=new THREE.Mesh(new THREE.BoxGeometry(.28,3.8,.24),new THREE.MeshStandardMaterial({color:0x292a27,roughness:1}));beam.position.set(-3.78,1.8,z);g.add(beam);}
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.7,.75),new THREE.MeshBasicMaterial({map:makeLabelTexture('NORTH END — WORKS ACCESS','#aaa995','#252724',768,160),side:THREE.DoubleSide,toneMapped:false}));sign.position.set(-3.81,2.05,3);sign.rotation.y=Math.PI/2;g.add(sign);
    const lamp=new THREE.PointLight(0xc4a367,3.8,12,2);lamp.position.set(-2.4,2.8,0);g.add(lamp);
    this.scene.add(g);this.northEnd={s,group:g};
  }
  updateVisibility(trainS,activeSignalIndex){
    for(const item of this.stationGroups)item.group.visible=Math.abs(item.station.s-trainS)<235;
    for(const sig of this.signalObjects)sig.group.visible=Math.abs(sig.s-trainS)<520;
    if(this.northEnd)this.northEnd.group.visible=Math.abs(this.northEnd.s-trainS)<180;
  }
}

function addLabelPlane(parent,text,x,y,z,w,h,fg='#e8dfc3',bg='#171a18'){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:makeLabelTexture(text,fg,bg,512,128),toneMapped:false,side:THREE.DoubleSide}));
  mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}

class Cab {
  constructor(scene,camera) {
    this.scene=scene;this.camera=camera;this.root=new THREE.Group();this.root.name='1959-stock-inspired-cab';scene.add(this.root);
    this.raycastTargets=[];this.lookYaw=0;this.lookPitch=0;this.wiperPhase=0;this.reducedMotion=false;
    this.buildShell();this.buildDesk();this.buildLighting();this.buildRain();
    this.cameraRig=new THREE.Group();this.cameraRig.position.set(0,2.17,.22);this.cameraRig.add(camera);this.root.add(this.cameraRig);
    camera.position.set(0,0,0);camera.rotation.order='YXZ';
  }
  buildShell(){
    const olive=new THREE.MeshStandardMaterial({color:0x35403c,roughness:.76,metalness:.14});
    const dark=new THREE.MeshStandardMaterial({color:0x111716,roughness:.92});
    const trim=new THREE.MeshStandardMaterial({color:0x7e8179,roughness:.5,metalness:.45});
    const cream=new THREE.MeshStandardMaterial({color:0xb9b39d,roughness:.86});
    const floor=new THREE.Mesh(new THREE.BoxGeometry(2.75,.18,3.45),new THREE.MeshStandardMaterial({color:0x222826,roughness:.95}));floor.position.set(0,.34,-.05);this.root.add(floor);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(2.85,.18,3.4),cream);roof.position.set(0,3.02,-.05);this.root.add(roof);
    const left=new THREE.Mesh(new THREE.BoxGeometry(.17,2.65,3.4),olive);left.position.set(-1.35,1.65,-.05);this.root.add(left);
    const right=left.clone();right.position.x=1.35;this.root.add(right);
    const back=new THREE.Mesh(new THREE.BoxGeometry(2.7,2.65,.16),olive);back.position.set(0,1.65,1.55);this.root.add(back);
    const door=new THREE.Mesh(new THREE.BoxGeometry(.95,2.1,.08),dark);door.position.set(.52,1.55,1.44);this.root.add(door);
    addLabelPlane(this.root,'NO UNAUTHORISED PERSONS',-.55,2.42,1.43,.95,.23,'#221e18','#d8cfb3').rotation.y=Math.PI;

    // Windscreen structure: broad central glass with heavy aluminium framing.
    const header=new THREE.Mesh(new THREE.BoxGeometry(2.7,.22,.2),olive);header.position.set(0,2.87,-1.61);this.root.add(header);
    const sill=new THREE.Mesh(new THREE.BoxGeometry(2.7,.18,.28),olive);sill.position.set(0,1.35,-1.57);this.root.add(sill);
    for(const x of [-1.22,0,1.22]){const bar=new THREE.Mesh(new THREE.BoxGeometry(.1,1.56,.2),trim);bar.position.set(x,2.1,-1.62);this.root.add(bar);}
    const glassMat=new THREE.MeshPhysicalMaterial({color:0x8fada8,transparent:true,opacity:.13,roughness:.08,metalness:0,side:THREE.DoubleSide,depthWrite:false});
    const glass=new THREE.Mesh(new THREE.PlaneGeometry(2.36,1.43),glassMat);glass.position.set(0,2.1,-1.69);this.root.add(glass);
    const grime=new THREE.Mesh(new THREE.PlaneGeometry(2.36,1.43),new THREE.MeshBasicMaterial({map:makeGrimeTexture(),transparent:true,opacity:.58,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
    grime.position.set(0,2.1,-1.685);this.root.add(grime);
    this.windscreenGrime=grime;

    this.wiperPivot=new THREE.Group();this.wiperPivot.position.set(.02,1.41,-1.72);
    const arm=new THREE.Mesh(new THREE.BoxGeometry(.035,1.15,.035),new THREE.MeshStandardMaterial({color:0x171b19,metalness:.6,roughness:.4}));arm.position.y=.56;this.wiperPivot.add(arm);
    const blade=new THREE.Mesh(new THREE.BoxGeometry(.62,.045,.05),new THREE.MeshStandardMaterial({color:0x111412,roughness:.7}));blade.position.set(0,1.08,0);blade.rotation.z=.22;this.wiperPivot.add(blade);this.root.add(this.wiperPivot);

    const sunVisor=new THREE.Mesh(new THREE.BoxGeometry(.82,.32,.035),new THREE.MeshStandardMaterial({color:0x514e3e,roughness:.86}));sunVisor.position.set(-.62,2.72,-1.72);sunVisor.rotation.x=-.08;this.root.add(sunVisor);
  }
  buildDesk(){
    const consoleMat=new THREE.MeshStandardMaterial({color:0x252d2a,roughness:.72,metalness:.22});
    const rimMat=new THREE.MeshStandardMaterial({color:0x777b73,roughness:.42,metalness:.58});
    const console=new THREE.Mesh(new THREE.BoxGeometry(2.55,.62,.82),consoleMat);console.position.set(0,1.0,-1.08);console.rotation.x=-.08;this.root.add(console);
    const rim=new THREE.Mesh(new THREE.BoxGeometry(2.62,.07,.86),rimMat);rim.position.set(0,1.33,-1.08);rim.rotation.x=-.08;this.root.add(rim);

    this.speedGauge=this.createGauge('MPH',60,10,-.54,1.46,-1.46,.26);
    this.brakeGauge=this.createGauge('BRAKE',100,20,.04,1.46,-1.46,.22);
    this.ampGauge=this.createGauge('AMPS',600,100,.54,1.46,-1.46,.22);

    const lampPanel=new THREE.Mesh(new THREE.BoxGeometry(.65,.24,.09),new THREE.MeshStandardMaterial({color:0x161a18,roughness:.78}));lampPanel.position.set(0,1.09,-1.53);this.root.add(lampPanel);
    this.lamps={};
    const lampSpecs=[['doors',-.22,0x45e47a],['guard',0,0xf0ad31],['trip',.22,0xff3e45]];
    for(const [name,x,color] of lampSpecs){
      const material=new THREE.MeshStandardMaterial({color:0x191914,emissive:color,emissiveIntensity:.03,roughness:.45});
      const light=new THREE.Mesh(new THREE.CircleGeometry(.06,16),material);light.position.set(x,1.1,-1.58);this.root.add(light);this.lamps[name]=light;
    }
    addLabelPlane(this.root,'D  G  T',0,.98,-1.585,.55,.1,'#d7d0b8','#171a18');

    // Master controller.
    this.masterGroup=new THREE.Group();this.masterGroup.position.set(-.92,1.2,-.98);
    const masterBase=new THREE.Mesh(new THREE.CylinderGeometry(.22,.27,.15,18),rimMat);masterBase.rotation.x=Math.PI/2;this.masterGroup.add(masterBase);
    this.masterHandle=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.52,10),new THREE.MeshStandardMaterial({color:0x171a18,metalness:.55,roughness:.43}));this.masterHandle.position.set(0,.18,-.12);this.masterHandle.rotation.x=-.45;this.masterHandle.userData.control='power';this.raycastTargets.push(this.masterHandle);this.masterGroup.add(this.masterHandle);
    const masterKnob=new THREE.Mesh(new THREE.SphereGeometry(.09,12,8),new THREE.MeshStandardMaterial({color:0x3e423e,roughness:.7}));masterKnob.position.set(0,.37,-.3);masterKnob.userData.control='power';this.raycastTargets.push(masterKnob);this.masterGroup.add(masterKnob);this.root.add(this.masterGroup);
    addLabelPlane(this.root,'MASTER',-.92,.8,-1.5,.48,.12);

    // Brake handle.
    this.brakeGroup=new THREE.Group();this.brakeGroup.position.set(.92,1.2,-.98);
    const brakeBase=new THREE.Mesh(new THREE.CylinderGeometry(.22,.27,.15,18),rimMat);brakeBase.rotation.x=Math.PI/2;this.brakeGroup.add(brakeBase);
    this.brakeHandle=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.55,10),new THREE.MeshStandardMaterial({color:0x3e2421,metalness:.35,roughness:.56}));this.brakeHandle.position.set(0,.18,-.12);this.brakeHandle.rotation.x=-.25;this.brakeHandle.userData.control='brake';this.raycastTargets.push(this.brakeHandle);this.brakeGroup.add(this.brakeHandle);
    const brakeKnob=new THREE.Mesh(new THREE.SphereGeometry(.095,12,8),new THREE.MeshStandardMaterial({color:0x6a342e,roughness:.65}));brakeKnob.position.set(0,.39,-.28);brakeKnob.userData.control='brake';this.raycastTargets.push(brakeKnob);this.brakeGroup.add(brakeKnob);this.root.add(this.brakeGroup);
    addLabelPlane(this.root,'BRAKE',.92,.8,-1.5,.48,.12);

    // Reverser key and equipment toggles.
    this.reverser=new THREE.Mesh(new THREE.BoxGeometry(.08,.28,.08),new THREE.MeshStandardMaterial({color:0xa9a28c,metalness:.72,roughness:.34}));this.reverser.position.set(0,.88,-1.51);this.reverser.rotation.z=.55;this.reverser.userData.control='reverser';this.raycastTargets.push(this.reverser);this.root.add(this.reverser);
    const switchSpecs=[['headlights',-.43],['cab-light',.43]];
    this.switchMeshes={};
    for(const [name,x] of switchSpecs){
      const base=new THREE.Mesh(new THREE.BoxGeometry(.18,.14,.07),new THREE.MeshStandardMaterial({color:0x151817,roughness:.7}));base.position.set(x,.88,-1.51);this.root.add(base);
      const toggle=new THREE.Mesh(new THREE.BoxGeometry(.045,.12,.045),new THREE.MeshStandardMaterial({color:0xada58e,metalness:.65,roughness:.36}));toggle.position.set(x,.9,-1.57);toggle.userData.control=name;this.raycastTargets.push(toggle);this.root.add(toggle);this.switchMeshes[name]=toggle;
    }
    addLabelPlane(this.root,'HEAD',-.43,.72,-1.55,.28,.09);
    addLabelPlane(this.root,'CAB',.43,.72,-1.55,.28,.09);

    this.destinationMesh=addLabelPlane(this.root,'EDGWARE',0,2.82,-1.72,1.1,.24,'#f2df93','#151917');
    this.destinationMesh.material.map.repeat.set(1,1);
  }
  createGauge(label,max,step,x,y,z,radius){
    const group=new THREE.Group();group.position.set(x,y,z);
    const bezel=new THREE.Mesh(new THREE.CircleGeometry(radius*1.1,32),new THREE.MeshStandardMaterial({color:0x343734,metalness:.65,roughness:.4}));bezel.position.z=.015;group.add(bezel);
    const face=new THREE.Mesh(new THREE.CircleGeometry(radius,48),new THREE.MeshBasicMaterial({map:makeGaugeFace(label,max,step,label==='MPH'?'':label==='BRAKE'?'%':'A'),toneMapped:false}));face.position.z=.022;group.add(face);
    const needlePivot=new THREE.Group();needlePivot.position.z=.04;
    const needle=new THREE.Mesh(new THREE.BoxGeometry(.018,radius*.72,.018),new THREE.MeshBasicMaterial({color:0xb91e24,toneMapped:false}));needle.position.y=radius*.33;needlePivot.add(needle);
    const hub=new THREE.Mesh(new THREE.CircleGeometry(radius*.075,12),new THREE.MeshBasicMaterial({color:0x1e201f,toneMapped:false}));hub.position.z=.02;needlePivot.add(hub);group.add(needlePivot);
    this.root.add(group);return {group,needle:needlePivot,max,value:0};
  }
  buildLighting(){
    this.cabLight=new THREE.PointLight(0xffd8a6,0,8,2);this.cabLight.position.set(0,2.75,.2);this.root.add(this.cabLight);
    this.headlight=new THREE.SpotLight(0xffedc2,0,120,Math.PI*.16,.52,1.1);this.headlight.position.set(0,1.25,-1.8);
    this.headlightTarget=new THREE.Object3D();this.headlightTarget.position.set(0,.4,-80);this.root.add(this.headlightTarget);this.headlight.target=this.headlightTarget;this.root.add(this.headlight);
    this.instrumentLight=new THREE.PointLight(0xf0ad31,.7,3.5,2);this.instrumentLight.position.set(0,1.65,-.8);this.root.add(this.instrumentLight);
  }
  buildRain(){
    const rand=seeded(76),count=180,pos=new Float32Array(count*3);
    for(let i=0;i<count;i++){pos[i*3]=(rand()-.5)*6;pos[i*3+1]=rand()*5-.5;pos[i*3+2]=-2-rand()*26;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.PointsMaterial({color:0xb9ced0,size:.035,transparent:true,opacity:.6,depthWrite:false});
    this.rain=new THREE.Points(geo,mat);this.rain.frustumCulled=false;this.root.add(this.rain);
  }
  setDestination(text){
    const old=this.destinationMesh.material.map;this.destinationMesh.material.map=makeLabelTexture(text,'#f2df93','#151917',512,128);this.destinationMesh.material.needsUpdate=true;old?.dispose();
  }
  updateGauge(gauge,value){
    gauge.value=lerp(gauge.value,clamp(value,0,gauge.max),.16);
    const t=gauge.value/gauge.max;
    gauge.needle.rotation.z=lerp(Math.PI*.75,-Math.PI*.75,t);
  }
  update(state,dt,routeBasis,curvature){
    this.root.position.copy(routeBasis.position).addScaledVector(routeBasis.up,.19);
    this.root.quaternion.copy(routeBasis.quaternion);
    this.updateGauge(this.speedGauge,state.speed*MPH);
    this.updateGauge(this.brakeGauge,state.brakeCylinder*100);
    this.updateGauge(this.ampGauge,POWER_LEVELS[state.powerNotch]*(160+state.speed*24));
    this.masterHandle.rotation.x=lerp(-.55,.48,state.powerNotch/(POWER_LABELS.length-1));
    this.brakeHandle.rotation.x=lerp(-.58,.62,state.brakeNotch/(BRAKE_LABELS.length-1));
    this.reverser.rotation.z=state.reverser===1?.58:state.reverser===-1?-.58:0;
    this.switchMeshes.headlights.rotation.z=state.headlights?.48:-.48;
    this.switchMeshes['cab-light'].rotation.z=state.cabLight?.48:-.48;
    this.cabLight.intensity=state.cabLight?12:0;
    this.headlight.intensity=state.headlights?72:0;
    this.lamps.doors.material.emissiveIntensity=state.doorsOpen?.06:state.interlock?3.2:.1;
    this.lamps.guard.material.emissiveIntensity=state.guardReady&&!state.guardAcknowledged?3.5:.04;
    this.lamps.trip.material.emissiveIntensity=state.tripped?4:.03;
    if(state.wiper){this.wiperPhase=(this.wiperPhase+dt*2.6)%(Math.PI*2);this.wiperPivot.rotation.z=-.68+Math.sin(this.wiperPhase)*.7;}
    else this.wiperPivot.rotation.z=lerp(this.wiperPivot.rotation.z,-.66,.08);
    this.rain.visible=state.surface;
    if(this.rain.visible){
      const arr=this.rain.geometry.attributes.position.array;
      for(let i=0;i<arr.length;i+=3){arr[i+1]-=dt*(6+state.speed*.55);arr[i+2]+=dt*(2+state.speed*.75);if(arr[i+1]<-.5||arr[i+2]>-1){arr[i+1]=4.5;arr[i+2]=-6-Math.random()*24;}}
      this.rain.geometry.attributes.position.needsUpdate=true;
    }
    const speedMph=state.speed*MPH;
    const shake=this.reducedMotion?0:clamp(speedMph/45,0,1);
    const railPulse=Math.sin(state.distance*5.1)*.006*shake;
    const curveLean=clamp(curvature*state.speed*state.speed*.11,-.035,.035);
    this.cameraRig.position.set(railPulse,2.17+Math.sin(state.distance*2.3)*.004*shake,.22);
    this.cameraRig.rotation.z=lerp(this.cameraRig.rotation.z,-curveLean,.08);
    this.cameraRig.rotation.y=this.lookYaw;
    this.camera.rotation.x=this.lookPitch+Math.sin(state.distance*3.7)*.0025*shake;
  }
  setLook(yaw,pitch){this.lookYaw=clamp(yaw,-1.08,1.08);this.lookPitch=clamp(pitch,-.55,.38);}
  centreLook(){this.lookYaw=0;this.lookPitch=0;}
}

class NorthernLineSimulator {
  constructor() {
    this.dom=this.bindDom();
    this.selectedScenario='central';this.running=false;this.paused=false;this.reportOpen=false;this.scheduleOpen=false;
    this.lastFrame=performance.now();this.uiAccumulator=0;this.pointer={down:false,moved:false,x:0,y:0};this.holdInterval=null;
    this.audio=new AudioEngine();
    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(0x06090a);
    this.scene.fog=new THREE.FogExp2(0x080b0b,.018);
    this.camera=new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.045,650);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.renderer.domElement.setAttribute('aria-label','Three-dimensional Northern line driving view');
    this.dom.world.appendChild(this.renderer.domElement);
    this.route=new RouteModel();
    this.addSceneLighting();
    this.world=new WorldBuilder(this.scene,this.route);
    this.cab=new Cab(this.scene,this.camera);
    this.raycaster=new THREE.Raycaster();this.pointerNdc=new THREE.Vector2();
    this.bindEvents();
    this.resetScenario(this.selectedScenario,false);
    if(IS_TEST || window.__NORTHERN_TEST__)this.installTestApi();
    this.animate=this.animate.bind(this);requestAnimationFrame(this.animate);
  }
  bindDom(){
    const id=name=>document.getElementById(name);
    return {
      world:id('world'),hud:id('hud'),speed:id('speedValue'),limit:id('limitValue'),serviceCode:id('serviceCode'),destination:id('destination'),nextStation:id('nextStation'),distance:id('distanceValue'),side:id('sideValue'),status:id('statusRibbon'),clock:id('clockValue'),delta:id('deltaValue'),score:id('scoreValue'),signal:id('signalValue'),safety:id('safetyValue'),
      schedulePanel:id('schedulePanel'),scheduleRows:id('scheduleRows'),scheduleDuty:id('scheduleDuty'),scheduleRoute:id('scheduleRoute'),cabStatus:id('cabStatus'),power:id('powerReadout'),brake:id('brakeReadout'),reverser:id('reverserReadout'),doors:id('doorsReadout'),toast:id('toastStack'),controls:id('controls'),utility:id('utilityBar'),
      start:id('startScreen'),startButton:id('startButton'),expert:id('expertMode'),reduced:id('reducedMotion'),pause:id('pauseScreen'),incident:id('incidentScreen'),incidentCode:id('incidentCode'),incidentTitle:id('incidentTitle'),incidentText:id('incidentText'),incidentTimer:id('incidentTimer'),incidentButton:id('incidentButton'),report:id('reportScreen'),reportTitle:id('reportTitle'),reportGrade:id('reportGrade'),reportStats:id('reportStats'),reportLedger:id('reportLedger')
    };
  }
  addSceneLighting(){
    this.hemi=new THREE.HemisphereLight(0xaac3cc,0x2b2923,.26);this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight(0xe7d7b5,1.4);this.sun.position.set(-120,220,80);this.scene.add(this.sun);
    this.trackGlow=new THREE.PointLight(0xffdfa0,1.8,28,2);this.scene.add(this.trackGlow);
    this.portalGlow=new THREE.PointLight(0xa9cbe0,0,70,1.6);this.scene.add(this.portalGlow);
  }
  bindEvents(){
    document.querySelectorAll('.scenario').forEach(button=>button.addEventListener('click',()=>{
      this.selectedScenario=button.dataset.scenario;
      document.querySelectorAll('.scenario').forEach(b=>{const on=b===button;b.classList.toggle('selected',on);b.setAttribute('aria-checked',String(on));});
      this.resetScenario(this.selectedScenario,false);
    }));
    this.dom.startButton.addEventListener('click',()=>this.startScenario(this.selectedScenario));
    document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>this.performAction(button.dataset.action)));
    document.querySelectorAll('[data-hold]').forEach(button=>{
      const start=e=>{e.preventDefault();button.classList.add('pressed');this.performHold(button.dataset.hold);clearInterval(this.holdInterval);this.holdInterval=setInterval(()=>this.performHold(button.dataset.hold),330);};
      const stop=()=>{button.classList.remove('pressed');clearInterval(this.holdInterval);this.holdInterval=null;};
      button.addEventListener('pointerdown',start);button.addEventListener('pointerup',stop);button.addEventListener('pointercancel',stop);button.addEventListener('pointerleave',stop);
    });
    this.dom.incidentButton.addEventListener('click',()=>this.resetIncident());
    addEventListener('keydown',e=>this.onKeyDown(e));addEventListener('keyup',e=>this.onKeyUp(e));addEventListener('resize',()=>this.onResize());
    const canvas=this.renderer.domElement;
    canvas.addEventListener('pointerdown',e=>this.onPointerDown(e));canvas.addEventListener('pointermove',e=>this.onPointerMove(e));canvas.addEventListener('pointerup',e=>this.onPointerUp(e));canvas.addEventListener('pointercancel',()=>{this.pointer.down=false;});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.running&&!this.paused)this.pause();});
  }
  onResize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));this.renderer.setSize(innerWidth,innerHeight);}
  onPointerDown(e){
    if(!this.running||this.paused||this.reportOpen)return;
    this.pointer.down=true;this.pointer.moved=false;this.pointer.x=e.clientX;this.pointer.y=e.clientY;this.pointer.lastX=e.clientX;this.pointer.lastY=e.clientY;
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
  }
  onPointerMove(e){
    if(!this.pointer.down)return;
    const dx=e.clientX-this.pointer.lastX,dy=e.clientY-this.pointer.lastY;
    if(Math.abs(e.clientX-this.pointer.x)+Math.abs(e.clientY-this.pointer.y)>5)this.pointer.moved=true;
    if(this.pointer.moved){this.cab.setLook(this.cab.lookYaw-dx*.0045,this.cab.lookPitch-dy*.0038);}
    this.pointer.lastX=e.clientX;this.pointer.lastY=e.clientY;
  }
  onPointerUp(e){
    if(!this.pointer.down)return;this.pointer.down=false;
    if(!this.pointer.moved)this.clickCabControl(e.clientX,e.clientY);
  }
  clickCabControl(clientX,clientY){
    const rect=this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.set(((clientX-rect.left)/rect.width)*2-1,-((clientY-rect.top)/rect.height)*2+1);
    this.raycaster.setFromCamera(this.pointerNdc,this.camera);
    const hits=this.raycaster.intersectObjects(this.cab.raycastTargets,false);if(!hits.length)return;
    const control=hits[0].object.userData.control;
    if(control==='power')this.setPowerNotch((this.state.powerNotch+1)%POWER_LABELS.length);
    else if(control==='brake')this.setBrakeNotch((this.state.brakeNotch+1)%BRAKE_LABELS.length);
    else if(control==='reverser')this.cycleReverser();
    else this.performAction(control);
  }
  onKeyDown(e){
    if(e.code==='ShiftLeft'||e.code==='ShiftRight'){if(this.state)this.state.deadmanHeld=true;return;}
    if(e.repeat)return;
    if(e.code==='Escape'){e.preventDefault();if(this.dom.start.classList.contains('active'))return;if(this.paused)this.resume();else this.pause();return;}
    if(!this.running||this.paused||this.reportOpen)return;
    const key=e.key.toLowerCase();
    if(key==='w'||e.key==='ArrowUp'){e.preventDefault();this.setPowerNotch(this.state.powerNotch+1);}
    else if(key==='s'||e.key==='ArrowDown'){e.preventDefault();this.setPowerNotch(this.state.powerNotch-1);}
    else if(key==='a'||e.key==='ArrowLeft'){e.preventDefault();this.setBrakeNotch(this.state.brakeNotch-1);}
    else if(key==='d'||e.key==='ArrowRight'){e.preventDefault();this.setBrakeNotch(this.state.brakeNotch+1);}
    else if(key==='r')this.cycleReverser();
    else if(key==='h')this.toggleHeadlights();
    else if(key==='l')this.toggleCabLight();
    else if(key==='v')this.toggleWiper();
    else if(key==='b')this.audio.horn();
    else if(key==='m')this.toggleSchedule();
    else if(key==='c')this.cab.centreLook();
    else if(e.key==='Enter'||e.code==='Space'){e.preventDefault();this.acknowledge();}
  }
  onKeyUp(e){if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&this.state)this.state.deadmanHeld=false;}
  performHold(action){
    if(!this.running||this.paused||this.reportOpen)return;
    if(action==='power-up')this.setPowerNotch(this.state.powerNotch+1);
    if(action==='power-down')this.setPowerNotch(this.state.powerNotch-1);
    if(action==='brake-apply')this.setBrakeNotch(this.state.brakeNotch+1);
    if(action==='brake-release')this.setBrakeNotch(this.state.brakeNotch-1);
  }
  performAction(action){
    if(action==='toggle-schedule')this.toggleSchedule();
    else if(action==='headlights')this.toggleHeadlights();
    else if(action==='cab-light')this.toggleCabLight();
    else if(action==='wiper')this.toggleWiper();
    else if(action==='horn')this.audio.horn();
    else if(action==='ack')this.acknowledge();
    else if(action==='pause')this.pause();
    else if(action==='resume')this.resume();
    else if(action==='restart')this.startScenario(this.selectedScenario);
    else if(action==='home')this.goHome();
  }
  activity(){if(!this.state)return;this.state.vigilanceRemaining=38;this.state.vigilanceWarned=false;}
  setPowerNotch(value){
    if(!this.state)return;const next=clamp(Math.round(value),0,POWER_LABELS.length-1);if(next===this.state.powerNotch)return;
    if(next>0&&this.state.reverser!==1){this.toast('Reverser must be FORWARD','warn');return;}
    if(next>0&&this.state.doorsOpen){this.toast('Traction interlock — doors open','warn');return;}
    this.state.powerNotch=next;this.audio.click();this.activity();
  }
  setBrakeNotch(value){
    if(!this.state)return;const next=clamp(Math.round(value),0,BRAKE_LABELS.length-1);if(next===this.state.brakeNotch)return;
    if(next===1)this.state.lapTarget=this.state.brakeCylinder;
    this.state.brakeNotch=next;this.audio.hiss(.16,.035);this.activity();
  }
  cycleReverser(){
    if(!this.state||this.state.speed>.15){this.toast('Stop before moving the reverser','warn');return;}
    this.state.reverser=this.state.reverser===1?0:this.state.reverser===0?-1:1;this.audio.click();this.activity();
  }
  toggleHeadlights(){this.state.headlights=!this.state.headlights;this.audio.click();this.activity();}
  toggleCabLight(){this.state.cabLight=!this.state.cabLight;this.audio.click();this.activity();}
  toggleWiper(){this.state.wiper=!this.state.wiper;this.audio.click();this.activity();}
  toggleSchedule(){
    if(!this.running||this.reportOpen)return;this.scheduleOpen=!this.scheduleOpen;this.dom.schedulePanel.classList.toggle('hidden',!this.scheduleOpen);
  }
  acknowledge(){
    if(!this.state)return;
    if(this.state.incident&&this.state.incidentReady){this.resetIncident();return;}
    if(this.state.guardReady&&!this.state.guardAcknowledged){
      this.state.guardAcknowledged=true;this.state.guardReady=false;this.audio.bells(2);this.state.score+=40;this.toast('Two bells returned — ready to start','good');this.activity();return;
    }
    if(this.state.vigilanceRemaining<16||this.state.vigilanceWarned){this.state.vigilanceRemaining=38;this.state.vigilanceWarned=false;this.audio.tone(950,.08,.08);this.toast('Vigilance acknowledged','good');return;}
    this.audio.click();this.activity();
  }

  buildSchedule(scenario){
    const rows=[];let t=scenario.startTime;
    rows.push({stationIndex:scenario.start,arrival:null,departure:t,actualArrival:null,actualDeparture:null,stopError:null,points:null,missed:false});
    for(let i=scenario.start+1;i<=scenario.end;i++){
      const prev=STATIONS[i-1],st=STATIONS[i],distance=st.s-prev.s;
      const effectiveMps=Math.max(7.2,Math.min(prev.limit,st.limit)*MPS*.64);
      const run=clamp(distance/effectiveMps+8,48,128);
      const arrival=t+run,departure=i===scenario.end?null:arrival+st.dwell;
      rows.push({stationIndex:i,arrival,departure,actualArrival:null,actualDeparture:null,stopError:null,points:null,missed:false});
      t=departure??arrival;
    }
    return rows;
  }
  resetScenario(id,forStart=true){
    const scenario=SCENARIOS[id]||SCENARIOS.central;this.selectedScenario=scenario.id;this.scenario=scenario;
    const start=STATIONS[scenario.start];
    this.schedule=this.buildSchedule(scenario);this.scheduleByIndex=new Map(this.schedule.map(row=>[row.stationIndex,row]));
    for(const sig of this.world?.signalObjects||[])this.world.setSignalAspect(sig.index,'green');
    if(this.world)this.world.setSignalAspect(scenario.holdAt,'red');
    this.state={
      distance:start.s,speed:0,acceleration:0,lastAcceleration:0,powerNotch:0,brakeNotch:4,brakeCylinder:.78,lapTarget:.78,reverser:1,
      doorsOpen:true,doorClosing:0,guardBellTimer:0,interlock:false,guardReady:false,guardAcknowledged:false,
      deadmanHeld:false,deadmanTimer:2.2,vigilanceRemaining:38,vigilanceWarned:false,
      headlights:true,cabLight:false,wiper:true,surface:this.route.isSurface(start.s),
      clock:scenario.startTime-6,score:0,atStation:true,currentStationIndex:scenario.start,nextStationIndex:scenario.start+1,
      dwellRemaining:6,finalTimer:null,incident:null,incidentReady:false,incidentResetTimer:null,tripped:false,
      holdReleased:false,holdCountdown:null,holdAnnounced:false,northEndSeen:false,lastDelta:0,departed:false,
      expert:forStart?this.dom.expert.checked:false,reduced:forStart?this.dom.reduced.checked:false,
      stats:{stops:0,perfectStops:0,missedStops:0,trips:0,overspeedSeconds:0,comfortEvents:0,totalAbsError:0,totalAbsLateness:0,onTimeStops:0,guardExchanges:0},
      ledger:[],lastOverspeedToast:-100,lastComfortToast:-100,lastCompressor:-100
    };
    this.cab.reducedMotion=this.state.reduced;this.cab.setDestination(scenario.destination);this.cab.centreLook();
    this.world?.updateVisibility(start.s,scenario.holdAt);
    if(this.cab&&this.route){const b=this.route.basisAt(start.s);this.cab.update(this.state,.016,b,this.route.curvatureAt(start.s));}
    this.renderSchedule();this.updateUi(true);
  }
  startScenario(id){
    this.resetScenario(id,true);this.running=true;this.paused=false;this.reportOpen=false;this.scheduleOpen=false;
    this.dom.start.classList.remove('active');this.dom.pause.classList.remove('active');this.dom.report.classList.remove('active');this.dom.incident.classList.remove('active');
    this.dom.hud.classList.remove('hidden');this.dom.controls.classList.remove('hidden');this.dom.utility.classList.remove('hidden');this.dom.cabStatus.classList.remove('hidden');this.dom.schedulePanel.classList.add('hidden');
    this.audio.start();this.audio.resume();this.toast(`Duty ${this.scenario.duty}. ${STATIONS[this.scenario.start].name} to ${STATIONS[this.scenario.end].name}. Book on.`,'good');
    this.lastFrame=performance.now();
  }
  goHome(){
    this.running=false;this.paused=false;this.reportOpen=false;this.scheduleOpen=false;this.audio.suspend();
    this.dom.pause.classList.remove('active');this.dom.report.classList.remove('active');this.dom.incident.classList.remove('active');this.dom.start.classList.add('active');
    this.dom.hud.classList.add('hidden');this.dom.controls.classList.add('hidden');this.dom.utility.classList.add('hidden');this.dom.cabStatus.classList.add('hidden');this.dom.schedulePanel.classList.add('hidden');
    this.resetScenario(this.selectedScenario,false);
  }
  pause(){
    if(!this.running||this.reportOpen||this.state.incident)return;this.paused=true;this.dom.pause.classList.add('active');this.audio.suspend();
  }
  resume(){
    if(!this.running)return;this.paused=false;this.dom.pause.classList.remove('active');this.audio.resume();this.lastFrame=performance.now();
  }
  renderSchedule(){
    if(!this.schedule)return;
    this.dom.scheduleDuty.textContent=`DUTY ${this.scenario.duty}`;
    this.dom.scheduleRoute.textContent=`${STATIONS[this.scenario.start].name.toUpperCase()} → ${STATIONS[this.scenario.end].name.toUpperCase()}`;
    this.dom.scheduleRows.replaceChildren(...this.schedule.map(row=>{
      const div=document.createElement('div');div.dataset.stationIndex=String(row.stationIndex);
      const st=document.createElement('span');st.textContent=STATIONS[row.stationIndex].name;
      const booked=document.createElement('span');booked.textContent=fmtBooked(row.arrival??row.departure);
      const actual=document.createElement('span');actual.textContent=row.missed?'MISSED':row.actualArrival!=null?fmtBooked(row.actualArrival):row.actualDeparture!=null?fmtBooked(row.actualDeparture):'—';
      div.append(st,booked,actual);return div;
    }));
  }
  updateScheduleClasses(){
    for(const row of this.schedule){
      const el=this.dom.scheduleRows.querySelector(`[data-station-index="${row.stationIndex}"]`);if(!el)continue;
      el.classList.toggle('current',row.stationIndex===(this.state.atStation?this.state.currentStationIndex:this.state.nextStationIndex));
      el.classList.toggle('passed',row.actualArrival!=null||row.actualDeparture!=null);
      el.classList.toggle('missed',row.missed);
      const actual=el.children[2];actual.textContent=row.missed?'MISSED':row.actualArrival!=null?fmtBooked(row.actualArrival):row.actualDeparture!=null?fmtBooked(row.actualDeparture):'—';
    }
  }
  toast(message,type='neutral'){
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;this.dom.toast.append(el);setTimeout(()=>el.remove(),3700);
  }
  triggerIncident(kind='trainstop'){
    if(this.state.incident)return;
    this.state.incident=kind;this.state.tripped=true;this.state.powerNotch=0;this.state.brakeNotch=5;this.state.incidentResetTimer=null;this.state.incidentReady=false;this.state.stats.trips++;this.state.score=Math.max(0,this.state.score-900);this.audio.trip();
    const trainstop=kind==='trainstop';
    this.dom.incidentCode.textContent=trainstop?'TRAINSTOP / TRIPCOCK':'DEADMAN / VIGILANCE';
    this.dom.incidentTitle.textContent=trainstop?'Tripcock operated':'Safety control operated';
    this.dom.incidentText.textContent=trainstop?'A signal at danger has operated the trainstop. Emergency braking is in force. When stationary, leave the master OFF and the brake in EMERGENCY until the reset completes.':'The driver safety device was not maintained. Emergency braking is in force. When stationary, leave the master OFF and the brake in EMERGENCY until the reset completes.';
    this.dom.incidentTimer.textContent='BRAKING';this.dom.incidentButton.disabled=true;this.dom.incident.classList.add('active');
  }
  updateIncident(dt){
    if(!this.state.incident)return;
    if(this.state.speed>.12||this.state.powerNotch!==0||this.state.brakeNotch!==5){
      this.state.incidentResetTimer=null;this.state.incidentReady=false;this.dom.incidentTimer.textContent=this.state.speed>.12?'BRAKING':'SET CONTROLS';this.dom.incidentButton.disabled=true;return;
    }
    if(this.state.incidentResetTimer==null)this.state.incidentResetTimer=8;
    this.state.incidentResetTimer=Math.max(0,this.state.incidentResetTimer-dt);this.dom.incidentTimer.textContent=this.state.incidentResetTimer.toFixed(1);
    if(this.state.incidentResetTimer<=0){this.state.incidentReady=true;this.dom.incidentButton.disabled=false;this.dom.incidentButton.textContent='RESET & PROCEED';}
  }
  resetIncident(){
    if(!this.state.incidentReady)return;
    this.state.incident=null;this.state.tripped=false;this.state.incidentReady=false;this.state.incidentResetTimer=null;this.state.brakeNotch=4;this.state.lapTarget=.78;this.state.vigilanceRemaining=38;this.state.deadmanTimer=2.2;
    if(!this.state.holdReleased&&this.state.distance>this.world.signalObjects.find(s=>s.index===this.scenario.holdAt)?.s)this.state.holdReleased=true;
    this.world.setSignalAspect(this.scenario.holdAt,'green');this.dom.incident.classList.remove('active');this.toast('Tripcock reset. Proceed under caution.','warn');this.audio.bells(1);
  }

  currentLimit(){
    let idx=this.scenario.start;
    for(let i=this.scenario.start;i<=this.scenario.end;i++){if(STATIONS[i].s<=this.state.distance+1)idx=i;else break;}
    let limit=STATIONS[idx].limit;
    const next=STATIONS[Math.min(idx+1,STATIONS.length-1)];
    if(next&&next.s-this.state.distance<135)limit=Math.min(limit,25);
    if(this.state.reverser===-1)limit=Math.min(limit,8);
    return limit;
  }
  updateSafety(dt){
    const s=this.state;if(s.incident)return;
    if(s.expert&&s.powerNotch>0){
      if(s.deadmanHeld)s.deadmanTimer=2.2;
      else{s.deadmanTimer-=dt;if(s.deadmanTimer<=0)this.triggerIncident('deadman');}
    }else s.deadmanTimer=2.2;
    if(!s.expert&&s.speed*MPH>4){
      s.vigilanceRemaining-=dt;
      if(s.vigilanceRemaining<8&&!s.vigilanceWarned){s.vigilanceWarned=true;this.audio.tone(1050,.18,.11);this.toast('VIGILANCE — press Enter','warn');}
      if(s.vigilanceRemaining<=0)this.triggerIncident('vigilance');
    }else if(s.speed*MPH<=4){s.vigilanceRemaining=Math.max(s.vigilanceRemaining,22);}
  }
  updateDoors(dt){
    const s=this.state;
    if(!s.atStation)return;
    if(s.finalTimer!=null){
      s.finalTimer-=dt;if(s.finalTimer<=0&&!this.reportOpen)this.showReport();return;
    }
    if(s.doorsOpen){
      s.dwellRemaining-=dt;
      if(s.dwellRemaining<=0){
        s.doorsOpen=false;s.doorClosing=1.55;s.interlock=false;this.audio.hiss(.65,.13);this.toast('Guard closing doors','neutral');
      }
      return;
    }
    if(s.doorClosing>0){
      s.doorClosing-=dt;
      if(s.doorClosing<=0){s.doorClosing=0;s.interlock=true;s.guardBellTimer=.75;this.audio.thud();}
      return;
    }
    if(s.guardBellTimer>0){
      s.guardBellTimer-=dt;
      if(s.guardBellTimer<=0){s.guardBellTimer=0;s.guardReady=true;s.stats.guardExchanges++;this.audio.bells(2);this.toast('Guard: two bells — acknowledge','warn');}
    }
  }
  updateSignals(dt){
    const s=this.state,signal=this.world.signalObjects.find(x=>x.index===this.scenario.holdAt);if(!signal)return;
    if(s.holdReleased){this.world.setSignalAspect(this.scenario.holdAt,'green');return;}
    this.world.setSignalAspect(this.scenario.holdAt,'red');
    const d=signal.s-s.distance;
    if(d<70&&d>2&&s.speed<.18){
      if(s.holdCountdown==null){s.holdCountdown=6.5;if(!s.holdAnnounced){s.holdAnnounced=true;this.toast('Held at signal — await a green aspect','warn');}}
      s.holdCountdown-=dt;
      if(s.holdCountdown<=0){s.holdReleased=true;this.world.setSignalAspect(this.scenario.holdAt,'green');this.audio.bells(1);this.toast('Signal cleared','good');}
    }
    if(d<-2&&!s.holdReleased&&!s.incident)this.triggerIncident('trainstop');
  }
  updatePhysics(dt){
    const s=this.state,mass=214000;
    const brakeTarget=s.tripped?1:(s.brakeNotch===1?s.lapTarget:BRAKE_LEVELS[s.brakeNotch]);
    const rate = brakeTarget > s.brakeCylinder ? .58 : .38;s.brakeCylinder+=clamp(brakeTarget-s.brakeCylinder,-rate*dt,rate*dt);
    const doorsPermit=s.interlock&&!s.doorsOpen&&s.guardAcknowledged;
    const deadmanPermit=!s.expert||s.deadmanHeld;
    const canPower=doorsPermit&&deadmanPermit&&!s.tripped&&s.reverser===1;
    const notch=canPower?POWER_LEVELS[s.powerNotch]:0;
    const taper=s.speed<10.5?1:clamp(1-(s.speed-10.5)/18,.18,1);
    const traction=186000*notch*taper;
    const resistance=2050+105*s.speed+16*s.speed*s.speed;
    const brake=258000*s.brakeCylinder*(.70+.30*smoothstep(0,3,s.speed));
    const grade=mass*9.81*this.route.gradeAt(s.distance);
    let acceleration=(traction-resistance-brake-grade)/mass;
    if(s.speed<.12&&traction<=resistance+brake+Math.max(0,grade)){s.speed=0;acceleration=0;}
    else s.speed=clamp(s.speed+acceleration*dt,0,23);
    s.lastAcceleration=s.acceleration;s.acceleration=acceleration;
    s.distance=clamp(s.distance+s.speed*dt,0,this.route.length);

    const jerk=Math.abs((s.acceleration-s.lastAcceleration)/Math.max(dt,.016));
    if(jerk>3.1&&s.speed>2.5&&s.clock-s.lastComfortToast>5){s.stats.comfortEvents++;s.lastComfortToast=s.clock;s.score=Math.max(0,s.score-70);this.toast('Passenger comfort: harsh handling','warn');}
    const limit=this.currentLimit(),mph=s.speed*MPH;
    if(mph>limit+2){
      s.stats.overspeedSeconds+=dt;s.score=Math.max(0,s.score-dt*4);
      if(s.clock-s.lastOverspeedToast>7){s.lastOverspeedToast=s.clock;this.toast(`${Math.round(mph-limit)} mph over the limit`,'bad');}
    }
  }
  updateStationLogic(){
    const s=this.state;
    if(s.atStation){
      if(s.speed>.55&&s.currentStationIndex<this.scenario.end){
        s.atStation=false;s.departed=true;
        const row=this.scheduleByIndex.get(s.currentStationIndex);if(row&&row.actualDeparture==null)row.actualDeparture=s.clock;
        this.updateScheduleClasses();
      }
      return;
    }
    if(s.nextStationIndex>this.scenario.end)return;
    const target=STATIONS[s.nextStationIndex],error=s.distance-target.s;
    if(Math.abs(error)<=35&&s.speed<.22){
      if(s.powerNotch===0&&s.brakeCylinder>.22)this.arriveAtStation(target,error);
      return;
    }
    if(error>48){this.missStation(target);}
  }
  arriveAtStation(st,error){
    const s=this.state,row=this.scheduleByIndex.get(st.routeIndex),lateness=s.clock-(row?.arrival??s.clock);
    const accuracy=Math.max(0,300-Math.abs(error)*11),punctuality=Math.max(0,300-Math.abs(lateness)*3.1),comfort=Math.max(0,120-(s.stats.comfortEvents-(s.segmentComfortStart||0))*28);
    const points=Math.round(280+accuracy+punctuality+comfort);
    s.score+=points;s.stats.stops++;s.stats.totalAbsError+=Math.abs(error);s.stats.totalAbsLateness+=Math.abs(lateness);if(Math.abs(error)<=1.5)s.stats.perfectStops++;if(Math.abs(lateness)<=30)s.stats.onTimeStops++;
    s.ledger.push({station:st.name,error,lateness,points,missed:false});
    if(row){row.actualArrival=s.clock;row.stopError=error;row.points=points;}
    s.currentStationIndex=st.routeIndex;s.nextStationIndex=st.routeIndex+1;s.atStation=true;s.speed=0;s.powerNotch=0;s.doorsOpen=true;s.doorClosing=0;s.interlock=false;s.guardReady=false;s.guardAcknowledged=false;s.guardBellTimer=0;s.dwellRemaining=st.dwell;s.segmentComfortStart=s.stats.comfortEvents;
    this.audio.hiss(.8,.14);this.audio.thud();
    const quality=Math.abs(error)<=1.5?'PERFECT STOP':Math.abs(error)<=5?'GOOD STOP':error>0?`${Math.abs(error).toFixed(1)} m OVER`:`${Math.abs(error).toFixed(1)} m SHORT`;
    this.toast(`${st.name}: ${quality} · ${fmtDelta(lateness)} · +${points}`,(Math.abs(error)<=5&&Math.abs(lateness)<=30)?'good':'warn');
    if(Math.random()<.32&&s.clock-s.lastCompressor>40){s.lastCompressor=s.clock;setTimeout(()=>this.audio.compressor(),900);}
    if(st.routeIndex===this.scenario.end){s.finalTimer=4.4;s.dwellRemaining=999;this.toast('Terminus. Secure the train.','good');}
    this.updateScheduleClasses();
  }
  missStation(st){
    const s=this.state,row=this.scheduleByIndex.get(st.routeIndex);if(row)row.missed=true;
    s.stats.missedStops++;s.score=Math.max(0,s.score-1200);s.ledger.push({station:st.name,error:null,lateness:null,points:-1200,missed:true});s.currentStationIndex=st.routeIndex;s.nextStationIndex=st.routeIndex+1;
    this.audio.tone(170,.4,.14,0,'sawtooth');this.toast(`${st.name} missed — continue to the next station`,'bad');this.updateScheduleClasses();
    if(st.routeIndex===this.scenario.end){s.finalTimer=2;s.atStation=true;}
  }
  updateEasterEgg(){
    const s=this.state;if(!s.northEndSeen&&Math.abs(s.distance-this.world.northEnd.s)<38){s.northEndSeen=true;this.toast('A ghost platform: North End, the station that never opened','neutral');}
  }
  runningDelta(){
    const s=this.state;
    if(s.atStation){
      const row=this.scheduleByIndex.get(s.currentStationIndex);const booked=row?.arrival??row?.departure;const actual=row?.actualArrival??s.clock;return actual-booked;
    }
    const prev=this.scheduleByIndex.get(s.currentStationIndex),next=this.scheduleByIndex.get(s.nextStationIndex);
    if(!prev||!next)return 0;
    const p=inverseLerp(STATIONS[s.currentStationIndex].s,STATIONS[s.nextStationIndex].s,s.distance);
    const booked=lerp(prev.departure??prev.arrival,next.arrival,p);return s.clock-booked;
  }

  updateAtmosphere(){
    const s=this.state,b=this.route.basisAt(s.distance),surface=this.route.isSurface(s.distance);s.surface=surface;
    const hour=(s.clock%86400)/3600,dawn=smoothstep(5.15,7.4,hour),dusk=1-smoothstep(17.4,20.4,hour);
    const skyDay=new THREE.Color(0x77858d),skyDawn=new THREE.Color(0x202b35),skyEvening=new THREE.Color(0x3b3c43);
    const sky=skyDawn.clone().lerp(skyDay,dawn);if(hour>17)sky.lerp(skyEvening,dusk);
    const tunnel=new THREE.Color(0x050707);
    this.scene.background.copy(surface?sky:tunnel);
    this.scene.fog.color.copy(surface?sky:tunnel);this.scene.fog.density=surface?.0028:.0215;
    this.hemi.intensity=surface?1.18:.17;this.sun.intensity=surface?1.55:0;this.renderer.toneMappingExposure=surface?1.02:.86;
    this.trackGlow.position.copy(b.position).addScaledVector(b.up,2.3).addScaledVector(b.forward,-5);this.trackGlow.intensity=surface?0:2.3;
    const portalDistance=Math.min(Math.abs(s.distance-this.route.mordenPortal),Math.abs(s.distance-this.route.northPortal));
    this.portalGlow.position.copy(b.position).addScaledVector(b.forward,portalDistance<120?Math.sign(this.route.northPortal-s.distance)*30:0).addScaledVector(b.up,2);
    this.portalGlow.intensity=!surface&&portalDistance<140?8*(1-portalDistance/140):0;
  }
  nextSignalInfo(){
    const ahead=this.world.signalObjects.filter(sig=>sig.s>=this.state.distance-3&&sig.index<=this.scenario.end).sort((a,b)=>a.s-b.s)[0];
    if(!ahead)return null;return {...ahead,distance:ahead.s-this.state.distance};
  }
  statusInfo(){
    const s=this.state,limit=this.currentLimit(),mph=s.speed*MPH,signal=this.nextSignalInfo();
    if(s.incident)return {text:'EMERGENCY BRAKE APPLICATION',kind:'danger'};
    if(signal?.aspect==='red'&&signal.distance<520)return {text:`SIGNAL AT DANGER · ${Math.max(0,Math.round(signal.distance))} m`,kind:'danger'};
    if(s.vigilanceWarned)return {text:`VIGILANCE · ACKNOWLEDGE ${Math.max(0,Math.ceil(s.vigilanceRemaining))}`,kind:'warn'};
    if(s.atStation&&s.currentStationIndex===this.scenario.end)return {text:'TERMINUS · SECURE TRAIN',kind:'good'};
    if(s.doorsOpen)return {text:`DOORS OPEN · ${Math.max(0,Math.ceil(s.dwellRemaining))} s`,kind:'warn'};
    if(s.doorClosing>0)return {text:'GUARD CLOSING DOORS',kind:'warn'};
    if(s.guardReady&&!s.guardAcknowledged)return {text:'TWO BELLS · ACKNOWLEDGE',kind:'warn'};
    if(s.atStation&&s.guardAcknowledged){
      if(s.brakeCylinder>.12)return {text:'READY · RELEASE BRAKE',kind:'good'};
      return {text:'READY TO START · TAKE POWER',kind:'good'};
    }
    if(s.expert&&s.powerNotch>0&&!s.deadmanHeld)return {text:'HOLD SHIFT · DEADMAN RELEASED',kind:'danger'};
    const target=STATIONS[s.nextStationIndex];
    if(target){
      const d=target.s-s.distance;
      if(d<90&&d>-40&&s.speed<.3&&!(s.powerNotch===0&&s.brakeCylinder>.22))return {text:'MASTER OFF · BRAKE SET FOR DOORS',kind:'warn'};
      if(d<320&&d>0&&mph>18)return {text:`BRAKE FOR ${target.name.toUpperCase()}`,kind:'warn'};
    }
    if(mph>limit+2)return {text:`OVERSPEED · LIMIT ${limit}`,kind:'danger'};
    if(s.powerNotch>0&&(!s.interlock||!s.guardAcknowledged))return {text:'TRACTION INTERLOCK',kind:'warn'};
    return {text:surfaceText(s.surface),kind:'neutral'};
  }
  updateUi(force=false){
    if(!this.state)return;const s=this.state,target=s.nextStationIndex<=this.scenario.end?STATIONS[s.nextStationIndex]:STATIONS[s.currentStationIndex];
    this.dom.speed.textContent=String(Math.round(s.speed*MPH));this.dom.limit.textContent=String(this.currentLimit());this.dom.serviceCode.textContent=this.scenario.duty;this.dom.destination.textContent=this.scenario.destination;
    const displayStation=s.atStation?STATIONS[s.currentStationIndex]:target;
    this.dom.nextStation.textContent=s.currentStationIndex===this.scenario.end?`${STATIONS[s.currentStationIndex].name.toUpperCase()} TERMINUS`:displayStation.name.toUpperCase();
    if(s.atStation)this.dom.distance.textContent='AT PLATFORM';
    else{const d=Math.max(0,target.s-s.distance);this.dom.distance.textContent=d>=1000?`${(d/1000).toFixed(1)} km`:`${Math.round(d)} m`;}
    this.dom.side.textContent=`DOORS ${displayStation.side.toUpperCase()}`;
    const status=this.statusInfo();this.dom.status.textContent=status.text;this.dom.status.className=`status-ribbon status-${status.kind}`;
    this.dom.clock.textContent=fmtClock(s.clock);const delta=this.runningDelta();this.dom.delta.textContent=fmtDelta(delta);this.dom.delta.style.color=Math.abs(delta)<=15?'var(--green)':Math.abs(delta)<=45?'var(--amber)':'#ff666b';
    this.dom.score.textContent=String(Math.max(0,Math.round(s.score))).padStart(5,'0');
    const sig=this.nextSignalInfo(),aspect=sig?.aspect||'green';this.dom.signal.className=`aspect aspect-${aspect}`;this.dom.safety.textContent=aspect==='red'?`TRAINSTOP · ${Math.max(0,Math.round(sig.distance))} m`:'TRAINSTOP CLEAR';
    this.dom.power.textContent=POWER_LABELS[s.powerNotch];this.dom.brake.textContent=BRAKE_LABELS[s.brakeNotch];this.dom.reverser.textContent=s.reverser===1?'FORWARD':s.reverser===-1?'REVERSE':'OFF';
    this.dom.doors.textContent=s.doorsOpen?'OPEN':s.interlock?'INTERLOCK':'CLOSING';this.dom.doors.className=`lamp-text ${s.doorsOpen?'lamp-amber':s.interlock?'lamp-green':'lamp-red'}`;
    this.updateScheduleClasses();
  }
  showReport(){
    const s=this.state;if(this.reportOpen)return;this.reportOpen=true;s.powerNotch=0;s.brakeNotch=4;
    const planned=this.scenario.end-this.scenario.start,stops=Math.max(1,s.stats.stops),avgError=s.stats.stops?s.stats.totalAbsError/s.stats.stops:0,avgLate=s.stats.stops?s.stats.totalAbsLateness/s.stats.stops:0,onTime=s.stats.stops?Math.round(s.stats.onTimeStops/s.stats.stops*100):0;
    const rating=clamp(100-s.stats.missedStops*25-s.stats.trips*24-s.stats.overspeedSeconds*.16-avgError*1.35-avgLate*.11-s.stats.comfortEvents*2.2,0,100);
    const grade=rating>=97?'A+':rating>=90?'A':rating>=82?'B':rating>=72?'C':rating>=62?'D':'E';
    this.dom.reportTitle.textContent=`${STATIONS[this.scenario.start].name} → ${STATIONS[this.scenario.end].name}`;this.dom.reportGrade.textContent=grade;
    const gradeColour=rating>=90?'#74d38a':rating>=72?'#f0ad31':'#ff5f66';this.dom.reportGrade.parentElement.style.borderColor=gradeColour;this.dom.reportGrade.parentElement.style.color=gradeColour;
    const bestKey=`northern-line-1987.best.${this.scenario.id}`;
    try {
      const previous=Number(localStorage.getItem(bestKey)||0);
      if(s.score>previous)localStorage.setItem(bestKey,String(Math.round(s.score)));
    } catch {
      // Storage can be unavailable in privacy-restricted or opaque-origin previews.
    }
    const stats=[['POINTS',Math.round(s.score).toLocaleString()],['STOPS',`${s.stats.stops}/${planned}`],['MEAN ERROR',`${avgError.toFixed(1)} m`],['ON TIME',`${onTime}%`]];
    this.dom.reportStats.replaceChildren(...stats.map(([label,value])=>{const d=document.createElement('div'),small=document.createElement('small'),b=document.createElement('b');small.textContent=label;b.textContent=value;d.append(small,b);return d;}));
    this.dom.reportLedger.replaceChildren(...s.ledger.map(item=>{
      const div=document.createElement('div'),a=document.createElement('span'),b=document.createElement('span'),c=document.createElement('span');a.textContent=item.station;b.textContent=item.missed?'MISSED':`${Math.abs(item.error).toFixed(1)} m ${item.error>0?'over':'short'}`;c.textContent=item.missed?'−1200':`+${item.points}`;div.append(a,b,c);return div;
    }));
    this.dom.report.classList.add('active');this.dom.controls.classList.add('hidden');this.dom.utility.classList.add('hidden');this.dom.schedulePanel.classList.add('hidden');this.audio.bells(2);
  }
  update(dt){
    const s=this.state;s.clock+=dt;
    this.updateSafety(dt);this.updateDoors(dt);this.updateSignals(dt);this.updatePhysics(dt);this.updateStationLogic();this.updateIncident(dt);this.updateEasterEgg();
    const basis=this.route.basisAt(s.distance),curvature=this.route.curvatureAt(s.distance);this.updateAtmosphere();this.world.updateVisibility(s.distance,this.scenario.holdAt);this.cab.update(s,dt,basis,curvature);this.audio.update(s.speed,POWER_LEVELS[s.powerNotch],s.brakeCylinder,curvature,!s.surface);
    this.uiAccumulator+=dt;if(this.uiAccumulator>.08){this.uiAccumulator=0;this.updateUi();}
  }
  animate(now){
    const dt=clamp((now-this.lastFrame)/1000,0,.05);this.lastFrame=now;
    if(this.running&&!this.paused&&!this.reportOpen)this.update(dt);
    else if(!this.running&&this.state){const basis=this.route.basisAt(this.state.distance);this.updateAtmosphere();this.cab.update(this.state,dt,basis,this.route.curvatureAt(this.state.distance));}
    this.renderer.render(this.scene,this.camera);requestAnimationFrame(this.animate);
  }
  installTestApi(){
    const sim=this;
    window.__NORTHERN_LINE_SIM__={
      version:VERSION,get ready(){return true;},
      snapshot(){const s=sim.state;return {running:sim.running,paused:sim.paused,scenario:sim.scenario.id,distance:s.distance,speedMph:s.speed*MPH,power:s.powerNotch,brake:s.brakeNotch,doorsOpen:s.doorsOpen,interlock:s.interlock,guardReady:s.guardReady,guardAcknowledged:s.guardAcknowledged,currentStation:s.currentStationIndex,nextStation:s.nextStationIndex,clock:s.clock,score:s.score,incident:s.incident,reportOpen:sim.reportOpen,renderer:{calls:sim.renderer.info.render.calls,triangles:sim.renderer.info.render.triangles}};},
      start(id='central'){sim.startScenario(id);},
      setControls({power,brake,reverser,guardAcknowledged,deadmanHeld}={}){if(power!=null)sim.state.powerNotch=clamp(power,0,3);if(brake!=null)sim.setBrakeNotch(brake);if(reverser!=null)sim.state.reverser=reverser;if(guardAcknowledged!=null)sim.state.guardAcknowledged=guardAcknowledged;if(deadmanHeld!=null)sim.state.deadmanHeld=deadmanHeld;},
      clearSignal(){sim.state.holdReleased=true;sim.world.setSignalAspect(sim.scenario.holdAt,'green');},
      arriveNext(error=0){const s=sim.state;if(s.nextStationIndex>sim.scenario.end)return false;const st=STATIONS[s.nextStationIndex];s.atStation=false;s.distance=st.s+error;s.speed=0;s.powerNotch=0;s.brakeCylinder=.7;sim.arriveAtStation(st,error);sim.updateUi(true);return true;},
      depart(){const s=sim.state;s.doorsOpen=false;s.interlock=true;s.guardAcknowledged=true;s.guardReady=false;s.atStation=false;const row=sim.scheduleByIndex.get(s.currentStationIndex);if(row)row.actualDeparture=s.clock;},
      finish(){while(sim.state.nextStationIndex<=sim.scenario.end){sim.state.atStation=false;const st=STATIONS[sim.state.nextStationIndex];sim.state.distance=st.s;sim.state.speed=0;sim.state.powerNotch=0;sim.state.brakeCylinder=.7;sim.arriveAtStation(st,0);if(st.routeIndex<sim.scenario.end){sim.state.atStation=false;sim.state.doorsOpen=false;sim.state.interlock=true;sim.state.guardAcknowledged=true;}}sim.showReport();},
      forceFrame(){sim.updateUi(true);sim.renderer.render(sim.scene,sim.camera);}
    };
  }
}

function surfaceText(surface){return surface?'OPEN SECTION · WET RAIL':'RUNNING TUNNEL · LINE CLEAR';}

try {
  new NorthernLineSimulator();
} catch (error) {
  console.error(error);
  const card=document.querySelector('.start-card');
  if(card){const p=document.createElement('p');p.style.cssText='padding:14px;border:1px solid #d6262c;color:#ffb7ba;background:#25090b;font:12px monospace;white-space:pre-wrap';p.textContent=`The cab could not be prepared.\n${error?.message||error}`;card.append(p);}
}
