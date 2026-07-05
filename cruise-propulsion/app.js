const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const SHIPS = [
  {id:'oasis', name:'Oasis-class diesel', badge:'published reference', engines:[['Wärtsilä 12V46D',3,13.86],['Wärtsilä 16V46D',3,18.48]], pods:[3,20,'ABB Azipod, all azimuthing'], bow:[4,5.5], max:24.5, service:22, hotel:18, bus:11, note:'Published mega-ship reference: six medium-speed diesel generating sets, a 97 MW electrical plant, three 20 MW azimuthing pods and a 24.5 kn maximum-speed figure.'},
  {id:'utopia', name:'LNG Oasis-class six-pack', badge:'published reference', engines:[['Wärtsilä W12V46TS-DF',6,15.6]], pods:[3,20,'ABB Azipod, all azimuthing'], bow:[4,3.5], max:22.5, service:20.5, hotel:19, bus:11, note:'Modern dual-fuel teaching case anchored to the published six-by-15.6 MW and three-by-20 MW pod arrangement; the speed cap here is a simulator parameter.'},
  {id:'panamax', name:'Panamax twin-pod cruise ship', badge:'teaching model', engines:[['12 MW medium-speed set',2,12],['9 MW medium-speed set',2,9]], pods:[2,14,'azimuthing electric pods'], bow:[3,2.2], max:22, service:19.5, hotel:12, bus:6.6, note:'Representative smaller high-voltage cruise plant with fewer engines, twin pods and a lower hotel load.'},
  {id:'expedition', name:'Ice-capable expedition ship', badge:'teaching model', engines:[['4.5 MW medium-speed set',4,4.5]], pods:[2,5.5,'ice-strengthened azimuthing pods'], bow:[2,1.2], max:16.5, service:14, hotel:5.8, bus:6.6, note:'Representative expedition plant where redundancy and manoeuvrability matter more than high transit speed.'}
];

const LOSSES = [['transformer',0.992],['VFD / filters',0.985],['pod motor',0.968],['bearings + seals',0.988],['propulsor inflow',0.965]];
const root = {scenario:$('#scenario'), speed:$('#speed'), hotel:$('#hotel'), margin:$('#margin'), bus:$('#bus'), pf:$('#pf')};
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const sum = (a,f) => a.reduce((x,y)=>x+f(y),0);
const f = (v,d=1) => Number(v).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d});
const f0 = v => Number(v).toLocaleString(undefined,{maximumFractionDigits:0});
const genMW = s => sum(s.engines,e=>e[1]*e[2]);
const podMW = s => s.pods[0]*s.pods[1];
const bowMW = s => s.bow[0]*s.bow[1];
const chain = () => LOSSES.reduce((a,e)=>a*e[1],1);
const amps = (mw,kv,pf) => mw*1000/(Math.sqrt(3)*kv*pf);
function engines(s){return s.engines.flatMap(e=>Array.from({length:e[1]},(_,i)=>({model:e[0],mw:e[2],label:`${e[0]} #${i+1}`})));}
function propAt(kn,margin,s){return clamp(podMW(s)*Math.pow(clamp(kn/s.max,0,1.08),3)*(1+margin/100),0,podMW(s));}
function sfoc(load){let x=clamp(load,0.12,1.08);let eff=0.466-0.14*(x-0.78)**2;if(x<0.35)eff-=(0.35-x)*0.16;if(x>0.95)eff-=(x-0.95)*0.05;eff=clamp(eff,0.305,0.468);return 3600/(42.7*eff);}
function chooseEngines(s,loadMW){
  const list=engines(s);const need=loadMW/0.86;let best=null;
  for(let mask=1;mask<(1<<list.length);mask++){
    const pick=list.filter((_,i)=>mask&(1<<i));const cap=sum(pick,e=>e.mw);if(cap<need)continue;
    const score=cap*10+pick.length*0.06;if(!best||score<best.score)best={pick,cap,score};
  }
  if(!best)best={pick:list,cap:genMW(s),score:Infinity};
  const load=loadMW/Math.max(best.cap,0.01);return {...best,load,sfoc:sfoc(load)};
}
function model(){
  const s=SHIPS.find(x=>x.id===root.scenario.value)||SHIPS[0];
  const speed=+root.speed.value, hotel=+root.hotel.value, margin=+root.margin.value, bus=+root.bus.value, pf=+root.pf.value;
  const shaft=propAt(speed,margin,s), propBus=shaft/chain(), total=propBus+hotel, online=chooseEngines(s,total), fuel=total*online.sfoc*24/1000;
  return {s,speed,hotel,margin,bus,pf,shaft,propBus,total,online,fuel};
}
function init(){
  root.scenario.innerHTML=SHIPS.map(s=>`<option value='${s.id}'>${s.name}</option>`).join('');
  root.scenario.value=SHIPS[0].id; root.speed.max=SHIPS[0].max; root.speed.value=SHIPS[0].service; root.hotel.value=SHIPS[0].hotel; root.bus.value=SHIPS[0].bus;
  $('#scenarioControls').innerHTML=SHIPS.map(s=>`<button type='button' data-id='${s.id}'>${s.name}</button>`).join('');
  $$('#scenarioControls button').forEach(b=>b.addEventListener('click',()=>{const s=SHIPS.find(x=>x.id===b.dataset.id);root.scenario.value=s.id;root.speed.max=s.max;root.speed.value=s.service;root.hotel.value=s.hotel;root.bus.value=s.bus;render();}));
  Object.values(root).forEach(el=>el.addEventListener('input',render));
  root.scenario.addEventListener('change',()=>{const s=SHIPS.find(x=>x.id===root.scenario.value);root.speed.max=s.max;root.speed.value=s.service;root.hotel.value=s.hotel;root.bus.value=s.bus;render();});
  tables(); render(); requestAnimationFrame(loop);
}
function metrics(x){
  const m=[['installed generation',`${f(genMW(x.s))} MW`],['propulsion pods',`${x.s.pods[0]} × ${f(x.s.pods[1])} MW`],['online sets',`${x.online.pick.length} / ${engines(x.s).length}`],['bus current',`${f0(amps(x.total,x.bus,x.pf))} A`],['fuel model',`${f(x.fuel,0)} t/day`]];
  $('#metrics').innerHTML=m.map(e=>`<div class='metric'><div class='value'>${e[1]}</div><div class='label'>${e[0]}</div></div>`).join('');
}
function singleLine(x){
  const blocks=x.s.engines.map((e,i)=>{const y=72+i*86;return `<rect class='box' x='34' y='${y}' width='184' height='52' rx='10'/><text class='label' x='52' y='${y+22}'>${e[1]} × ${e[0]}</text><text class='sub' x='52' y='${y+42}'>${f(e[1]*e[2])} MW block</text><path class='feed' d='M218 ${y+26} H392'/><circle class='breaker' cx='304' cy='${y+26}' r='5'/>`;}).join('');
  $('#singleLine').innerHTML=`${blocks}<line class='bus' x1='405' y1='44' x2='405' y2='404'/><text class='label' x='430' y='58'>${f(x.bus).replace('.0','')} kV MAIN SWITCHBOARD</text><text class='sub' x='430' y='80'>segmented bus, tie breakers, PMS, protection relays</text><path class='feed' d='M405 138 H610 V112 H724'/><path class='feed' d='M405 216 H610 V216 H724'/><path class='feed' d='M405 294 H610 V320 H724'/><rect class='box alt' x='724' y='74' width='226' height='78' rx='14'/><rect class='box alt' x='724' y='178' width='226' height='78' rx='14'/><rect class='box alt' x='724' y='282' width='226' height='78' rx='14'/><text class='label' x='744' y='106'>propulsion transformer</text><text class='sub' x='744' y='128'>isolation + drive voltage match</text><text class='label' x='744' y='210'>VFD / inverter</text><text class='sub' x='744' y='232'>torque, rpm and braking control</text><text class='label' x='744' y='314'>${x.s.pods[0]} × pod motor</text><text class='sub' x='744' y='336'>${x.s.pods[2]}</text><path class='feed slow' d='M405 384 H546 V470 H704'/><rect class='box' x='704' y='430' width='244' height='82' rx='14'/><text class='label' x='728' y='462'>hotel transformers</text><text class='sub' x='728' y='484'>690 V → 440/230/110 V consumers</text><text class='mw' x='728' y='504'>HVAC, galleys, pumps, theatre, cabins</text><text class='mw' x='36' y='472'>live case: ${f(x.total)} MW on bus · ${f(x.shaft)} MW shaft · ${f(x.hotel)} MW hotel</text>`;
}
function results(x){
  const reserve=genMW(x.s)-x.total, util=x.online.load, cls=reserve<0||util>0.94?' warn':'';
  $('#simResults').innerHTML=`<div class='result-tile'><b>${f(x.shaft)} MW</b><span>pod shaft demand</span></div><div class='result-tile'><b>${f(x.total)} MW</b><span>total bus load</span></div><div class='result-tile'><b>${f0(amps(x.propBus,x.bus,x.pf))} A</b><span>propulsion feeder current</span></div><div class='result-tile'><b>${f0(amps(x.total,x.bus,x.pf))} A</b><span>aggregate current equivalent</span></div><div class='result-tile${cls}'><b>${f(util*100,0)}%</b><span>online engine loading</span></div><div class='result-tile'><b>${f(x.online.sfoc,0)} g/kWh</b><span>SFOC model</span></div><div class='result-tile'><b>${f(x.fuel,0)} t/day</b><span>fuel estimate</span></div><div class='result-tile'><b>${f(reserve)} MW</b><span>installed reserve</span></div><div class='result-tile note'>${x.s.note} Online selection: ${x.online.pick.map(e=>e.mw.toFixed(1)).join(' + ')} MW = ${f(x.online.cap)} MW.</div>`;
}
function render(){
  const x=model();root.speed.max=x.s.max;$('#speedOut').textContent=`${f(x.speed)} kn`;$('#hotelOut').textContent=`${f(x.hotel)} MW`;$('#marginOut').textContent=`${f(x.margin,0)}%`;$('#pfOut').textContent=f(x.pf,2);$('#exampleCurrent').textContent=`${f0(amps(20,11,0.95))} A`;$('#exampleCurrent66').textContent=`${f0(amps(20,6.6,0.95))} A`;
  $$('#scenarioControls button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===x.s.id)));metrics(x);singleLine(x);results(x);drawPower(x);drawLoss(x);vectors();
}
function axes(ctx,w,h,pad,max,label){ctx.strokeStyle='rgba(159,230,210,.24)';ctx.beginPath();ctx.moveTo(pad,pad);ctx.lineTo(pad,h-pad);ctx.lineTo(w-pad,h-pad);ctx.stroke();ctx.fillStyle='rgba(234,248,243,.75)';ctx.font='15px ui-monospace,monospace';ctx.fillText(label,pad,pad-12);ctx.font='12px ui-monospace,monospace';for(let i=0;i<=4;i++){let y=h-pad-i/4*(h-2*pad);ctx.strokeStyle='rgba(159,230,210,.10)';ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke();ctx.fillStyle='rgba(159,185,176,.74)';ctx.fillText(`${f0(max*i/4)} MW`,10,y+4);}}
function drawPower(x){const c=$('#powerChart'),ctx=c.getContext('2d'),w=c.width,h=c.height,p=58,max=Math.max(genMW(x.s),podMW(x.s)+x.hotel)*1.08;ctx.clearRect(0,0,w,h);ctx.fillStyle='rgba(7,12,14,.86)';ctx.fillRect(0,0,w,h);axes(ctx,w,h,p,max,'propulsion cubic + hotel load');const line=(pts,col,lw)=>{ctx.beginPath();pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.stroke();};let prop=[],hot=[],tot=[];for(let i=0;i<=100;i++){let kn=i/100*x.s.max;let pb=propAt(kn,x.margin,x.s)/chain();let px=p+kn/x.s.max*(w-2*p);let y=v=>h-p-v/max*(h-2*p);prop.push([px,y(pb)]);hot.push([px,y(x.hotel)]);tot.push([px,y(pb+x.hotel)]);}line(tot,'#ffc764',4);line(prop,'#7bdff7',3);line(hot,'#89f0c3',2);let sx=p+x.speed/x.s.max*(w-2*p);ctx.setLineDash([5,7]);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.moveTo(sx,p);ctx.lineTo(sx,h-p);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ffc764';ctx.fillText('total bus',w-178,44);ctx.fillStyle='#7bdff7';ctx.fillText('propulsion feed',w-178,64);ctx.fillStyle='#89f0c3';ctx.fillText('hotel',w-178,84);}
function drawLoss(x){const c=$('#lossChart'),ctx=c.getContext('2d'),w=c.width,h=c.height,left=62,top=70,bh=34,gap=28,max=Math.max(x.propBus,1);ctx.clearRect(0,0,w,h);ctx.fillStyle='rgba(7,12,14,.86)';ctx.fillRect(0,0,w,h);ctx.fillStyle='rgba(234,248,243,.75)';ctx.font='15px ui-monospace,monospace';ctx.fillText('electrical propulsion path: bus MW → useful shaft/propulsor MW',32,32);let p=x.propBus;LOSSES.forEach((e,i)=>{const out=p*e[1],y=top+i*(bh+gap),wi=p/max*(w-240),wo=out/max*(w-240);ctx.fillStyle='rgba(123,223,247,.18)';ctx.fillRect(left,y,wi,bh);ctx.fillStyle='rgba(137,240,195,.74)';ctx.fillRect(left,y,wo,bh);ctx.strokeStyle='rgba(159,230,210,.26)';ctx.strokeRect(left,y,wi,bh);ctx.fillStyle='#ffc764';ctx.font='13px ui-monospace,monospace';ctx.fillText(e[0],left,y-8);ctx.fillStyle='rgba(234,248,243,.78)';ctx.fillText(`${f(p-out,2)} MW heat`,left+wi+12,y+13);ctx.fillStyle='rgba(159,185,176,.76)';ctx.fillText(`${f(e[1]*100)}%`,left+wi+12,y+30);p=out;});ctx.fillStyle='#89f0c3';ctx.font='18px ui-monospace,monospace';ctx.fillText(`chain: ${f(chain()*100)}%`,left,h-30);}
function vectors(){const m=$('#thrusterMap');if(!m.dataset.ready){m.dataset.ready=1;for(let i=0;i<10;i++){const v=document.createElement('div');v.className='vector';v.style.transform=`rotate(${i*36}deg)`;v.style.opacity=String(.18+(i%3)*.12);m.appendChild(v);}}const p=$('.vector',m);p.style.transform=`rotate(${(performance.now()/45)%360}deg)`;p.style.opacity='1';}
function tables(){const consumers=[['One large pod',20,'Drive, transformer and motor feeders are kiloamp equipment even at medium voltage.'],['One 15.6 MW genset',15.6,'A single alternator feeder is close to a cruise pod in electrical scale.'],['Bow-thruster group',14,'Short-time harbour loads can rival a small propulsion train.'],['Hotel load block',18,'HVAC, galleys and cabins can consume the equivalent of a small power station.'],['690 V motor-control centre',2.5,'At low voltage the same MW becomes very high current, so distribution is local.']];$('#currentTable tbody').innerHTML=consumers.map(r=>`<tr><td>${r[0]}</td><td>${f(r[1])} MW</td><td>${f0(amps(r[1],11,.95))} A</td><td>${f0(amps(r[1],6.6,.95))} A</td><td>${f0(amps(r[1],.69,.9))} A</td><td>${r[2]}</td></tr>`).join('');$('#exampleTable tbody').innerHTML=SHIPS.map(s=>`<tr><td>${s.name}<small>${s.badge}</small></td><td>${s.engines.map(e=>`${e[1]} × ${e[0]} (${f(e[2])} MW)`).join('<br>')}</td><td>${f(genMW(s))} MW</td><td>${s.pods[0]} × ${f(s.pods[1])} MW pods<br><small>${f(bowMW(s))} MW bow thrusters</small></td><td>${f(s.max)} kn model cap<br><small>${f(s.service)} kn service slider</small></td><td>${s.note}</td></tr>`).join('');}
function wake(){const c=$('#wakeCanvas'),ctx=c.getContext('2d'),w=c.width,h=c.height,t=performance.now()/1000;ctx.clearRect(0,0,w,h);const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'rgba(8,21,24,.95)');g.addColorStop(1,'rgba(10,13,16,.95)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.lineWidth=1;for(let i=0;i<48;i++){const y=i/48*h,amp=6+12*Math.sin(i*.37+t*.7);ctx.beginPath();for(let x=0;x<=w;x+=18){const yy=y+Math.sin(x*.018+t*1.6+i*.6)*amp;if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.strokeStyle=`rgba(123,223,247,${.035+i/2200})`;ctx.stroke();}for(let i=0;i<80;i++){const x=Math.abs((Math.sin(i*12.989+t*.2)*43758.5453)%1)*w, y=(i*53+t*38)%h;ctx.fillStyle='rgba(137,240,195,.11)';ctx.fillRect(x,y,1.4,1.4);}}
function loop(){wake();vectors();requestAnimationFrame(loop);}
init();
