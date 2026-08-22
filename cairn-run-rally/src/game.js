import { AudioManager } from './audio.js';
import { InputManager } from './input.js';
import { clamp, formatTime } from './math.js';
import { StageRun } from './race.js';
import { WebGLRenderer } from './renderer.js';
import { buildStage } from './stage.js';
import { RallyCar } from './vehicle.js';
import { ChaseCamera, RallyWorld } from './world.js';

const FIXED_STEP = 1 / 120;
const el = id => document.getElementById(id);

export class CairnRunGame {
  constructor() {
    this.bootStarted = performance.now();
    this.qa = new URLSearchParams(location.search).has('qa');
    this.canvas = el('game-canvas');
    this.stage = buildStage();
    this.renderer = new WebGLRenderer(this.canvas);
    this.car = new RallyCar(this.stage);
    this.world = new RallyWorld(this.renderer, this.stage, this.loadSetting('quality', 'high'));
    this.camera = new ChaseCamera(this.stage, this.car);
    this.input = new InputManager(this.stage, { autopilot: this.qa });
    this.audio = new AudioManager();
    this.race = new StageRun(this.stage);
    this.mode = 'title';
    this.accumulator = 0;
    this.lastTimestamp = performance.now();
    this.frameCount = 0;
    this.actualFrameIntervals = [];
    this.physicsSamples = [];
    this.loadTimeMs = 0;
    this.lastStats = null;
    this.lastCollisionLevel = 0;
    this.lastHudUpdate = 0;
    this.splitMessageUntil = 0;
    this.toastUntil = 0;
    this.errors = [];
    this.best = this.loadBest();
    this.race.setBest(this.best);
    this.installUI();
    this.ui.effects.value=this.loadSetting('effects','0.75');
    this.ui.voice.value=this.loadSetting('voice','0.9');
    this.ui.quality.value=this.loadSetting('quality','high');
    this.ui.notes.checked=this.loadSetting('notes','1')!=='0';
    this.applySettings();
    this.installSafetyHandlers();
    this.updateHud();
    this.loadTimeMs = performance.now() - this.bootStarted;
    this.writeQA();
    requestAnimationFrame(t => this.frame(t));
    if (this.qa) setTimeout(() => this.beginRun(false), 80);
  }

  loadSetting(name, fallback) { try { return localStorage.getItem(`cairn-run:${name}`) ?? fallback; } catch { return fallback; } }
  saveSetting(name, value) { try { localStorage.setItem(`cairn-run:${name}`, String(value)); } catch {} }
  loadBest() { try { const value=JSON.parse(localStorage.getItem('cairn-run:best')||'null');return value&&Number.isFinite(value.time)?value:null; } catch { return null; } }
  saveBest(best) { try { localStorage.setItem('cairn-run:best', JSON.stringify(best)); } catch {} }

  installUI() {
    this.ui = {
      title:el('title-screen'),settings:el('settings-screen'),pause:el('pause-screen'),result:el('result-screen'),hud:el('hud'),countdown:el('countdown'),
      time:el('stage-time'),speed:el('speed'),gear:el('gear'),progress:el('progress-bar'),distance:el('distance-left'),split:el('split-delta'),
      pace:el('pace-note'),paceIcon:el('pace-icon'),paceMain:el('pace-main'),paceDetail:el('pace-detail'),paceDistance:el('pace-distance'),toast:el('toast'),
      damageEngine:el('damage-engine'),damageSteering:el('damage-steering'),damageSuspension:el('damage-suspension'),damageBrakes:el('damage-brakes'),damageBody:el('damage-body'),
      finalTime:el('final-time'),bestTime:el('best-time'),resultDelta:el('result-delta'),resultDamage:el('result-damage'),
      effects:el('effects-volume'),voice:el('voice-volume'),quality:el('quality-setting'),notes:el('notes-toggle')
    };
    el('start-button').addEventListener('click',()=>this.beginRun(true));
    el('settings-button').addEventListener('click',()=>this.showSettings());
    el('settings-back').addEventListener('click',()=>this.closeSettings());
    el('resume-button').addEventListener('click',()=>this.resume());
    el('pause-restart').addEventListener('click',()=>this.beginRun(false));
    el('quit-button').addEventListener('click',()=>this.returnToTitle());
    el('retry-button').addEventListener('click',()=>this.beginRun(false));
    el('result-quit').addEventListener('click',()=>this.returnToTitle());
    for(const input of [this.ui.effects,this.ui.voice,this.ui.quality,this.ui.notes]) input.addEventListener('input',()=>this.applySettings(true));
    this.canvas.addEventListener('dblclick',()=>{if(!document.fullscreenElement)this.canvas.requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.().catch(()=>{});});
    requestAnimationFrame(()=>el('start-button').focus());
  }

  installSafetyHandlers() {
    addEventListener('error',event=>{this.errors.push(String(event.error?.stack||event.message));this.writeQA();});
    addEventListener('unhandledrejection',event=>{this.errors.push(String(event.reason?.stack||event.reason));this.writeQA();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.mode==='playing'&&this.race.state==='racing')this.pause();});
    addEventListener('contextmenu',e=>e.preventDefault());
  }

  applySettings(save=false) {
    const effects=Number(this.ui.effects.value),voice=Number(this.ui.voice.value),quality=this.ui.quality.value,notes=this.ui.notes.checked;
    this.audio.setVolumes(effects,voice);this.renderer.setQuality(quality);this.world.setQuality(quality);
    if(save){this.saveSetting('effects',effects);this.saveSetting('voice',voice);this.saveSetting('quality',quality);this.saveSetting('notes',notes?'1':'0');}
  }

  showSettings(){this.mode='settings';this.ui.title.classList.add('hidden');this.ui.settings.classList.remove('hidden');requestAnimationFrame(()=>this.ui.effects.focus());}
  closeSettings(){this.mode='title';this.ui.settings.classList.add('hidden');this.ui.title.classList.remove('hidden');requestAnimationFrame(()=>el('settings-button').focus());}

  async beginRun(fullCountdown) {
    await this.audio.start();
    this.mode='playing';this.ui.title.classList.add('hidden');this.ui.settings.classList.add('hidden');this.ui.pause.classList.add('hidden');this.ui.result.classList.add('hidden');this.ui.hud.classList.remove('hidden');this.ui.pace.classList.add('hidden');
    this.car.reset(14,true);this.camera.reset(this.car);this.race.reset(fullCountdown);if(this.qa)this.race.countdown=.18;this.race.setBest(this.best);this.accumulator=0;this.lastCollisionLevel=0;this.audio.mute(false);this.audio.stopVoice();
    this.ui.countdown.textContent=fullCountdown?'3':'1';this.ui.countdown.classList.remove('hidden');if(!this.qa)this.audio.countdown(fullCountdown?3:1);this.input.clearPressed();this.updateHud();
  }
  pause(){if(this.mode!=='playing')return;this.mode='paused';this.ui.pause.classList.remove('hidden');this.audio.mute(true);requestAnimationFrame(()=>el('resume-button').focus());}
  resume(){if(this.mode!=='paused')return;this.mode='playing';this.ui.pause.classList.add('hidden');this.audio.mute(false);this.lastTimestamp=performance.now();this.input.clearPressed();}
  returnToTitle(){this.mode='title';this.ui.pause.classList.add('hidden');this.ui.result.classList.add('hidden');this.ui.hud.classList.add('hidden');this.ui.pace.classList.add('hidden');this.ui.countdown.classList.add('hidden');this.ui.title.classList.remove('hidden');this.audio.mute(true);this.audio.stopVoice();this.car.reset(14,true);this.camera.reset(this.car);this.input.clearPressed();requestAnimationFrame(()=>el('start-button').focus());}

  currentMenuItems() {
    const root=this.mode==='title'?this.ui.title:this.mode==='settings'?this.ui.settings:this.mode==='paused'?this.ui.pause:this.mode==='results'?this.ui.result:null;
    if(!root)return[];
    return Array.from(root.querySelectorAll('button,input,select')).filter(node=>!node.disabled&&node.offsetParent!==null);
  }

  moveMenuFocus(direction) {
    const items=this.currentMenuItems();if(!items.length)return;
    const index=items.indexOf(document.activeElement),next=index<0?0:(index+direction+items.length)%items.length;items[next].focus();
  }

  adjustFocused(direction) {
    const node=document.activeElement;
    if(node instanceof HTMLInputElement&&node.type==='range'){
      const step=Number(node.step)||.05,min=Number(node.min),max=Number(node.max);node.value=String(clamp(Number(node.value)+direction*step,min,max));node.dispatchEvent(new Event('input',{bubbles:true}));
    }else if(node instanceof HTMLSelectElement){node.selectedIndex=clamp(node.selectedIndex+direction,0,node.options.length-1);node.dispatchEvent(new Event('input',{bubbles:true}));}
  }

  activateMenu() {
    const items=this.currentMenuItems(),node=document.activeElement;
    if(items.includes(node)){node.click();return;}
    if(this.mode==='title')this.beginRun(true);else if(this.mode==='paused')this.resume();else if(this.mode==='results')this.beginRun(false);
  }

  handleActions() {
    this.input.pollGamepad();
    const restart=this.input.consumeAny(['KeyR','PadRestart']);
    if(restart&&(this.mode==='playing'||this.mode==='paused'||this.mode==='results')){this.beginRun(false);return;}
    if(this.input.consume('PadStart')){if(this.mode==='playing')this.pause();else if(this.mode==='paused')this.resume();else if(this.mode==='title')this.beginRun(true);else if(this.mode==='results')this.beginRun(false);return;}
    if(this.input.consumeAny(['Escape','PadBack'])){if(this.mode==='playing')this.pause();else if(this.mode==='paused')this.resume();else if(this.mode==='settings')this.closeSettings();else if(this.mode==='results')this.returnToTitle();return;}
    if(this.input.consume('PadUp'))this.moveMenuFocus(-1);
    if(this.input.consume('PadDown'))this.moveMenuFocus(1);
    if(this.input.consume('PadLeft'))this.adjustFocused(-1);
    if(this.input.consume('PadRight'))this.adjustFocused(1);
    if(this.input.consume('PadConfirm')){this.activateMenu();return;}
    if(this.input.consume('Enter')){if(this.mode==='title')this.beginRun(true);else if(this.mode==='results')this.beginRun(false);else if(this.mode==='paused')this.resume();}
  }

  simulationStep(dt) {
    if(this.race.state==='racing') {
      const controls=this.input.read(this.car),result=this.car.step(controls,dt);this.world.update(dt,this.car,controls);this.audio.update(this.car,controls);
      if(this.car.collisionImpulse>.12&&this.car.collisionImpulse>this.lastCollisionLevel+.08)this.audio.collision(this.car.collisionImpulse);
      this.lastCollisionLevel=this.car.collisionImpulse;
      if(this.car.needsRecovery){this.car.recover();this.camera.reset(this.car);this.showToast('RESET TO LAST SAFE POINT',1.5);}
      const events=this.race.update(this.car,dt);this.processEvents(events);
      if(result.road.distance>95){this.car.recover();this.camera.reset(this.car);}
    } else if(this.race.state==='countdown') {
      this.world.update(dt,this.car,{throttle:0,brake:1,steer:0,handbrake:0});
      this.processEvents(this.race.update(this.car,dt));
    }
  }

  processEvents(events) {
    for(const event of events){
      if(event.type==='count'){const n=Math.max(1,event.value);this.ui.countdown.textContent=String(n);this.ui.countdown.classList.remove('hidden');if(!this.qa)this.audio.countdown(n);}
      else if(event.type==='go'){this.ui.countdown.textContent='GO!';if(!this.qa)this.audio.countdown(0);setTimeout(()=>this.ui.countdown.classList.add('hidden'),520);}
      else if(event.type==='pace'){this.showPace(event.note,event.distance);this.audio.playPace(event.note);}
      else if(event.type==='pace-hide')this.ui.pace.classList.add('hidden');
      else if(event.type==='split'){const text=event.delta==null?`SPLIT ${event.split}`:`${event.delta>=0?'+':''}${event.delta.toFixed(2)} S`;this.ui.split.textContent=text;this.ui.split.style.color=event.delta!=null&&event.delta<=0?'#88d77f':'#f2b84b';this.splitMessageUntil=performance.now()+3500;}
      else if(event.type==='finish')this.finishRun(event);
    }
  }

  showPace(note,distance){if(this.ui.notes.checked){this.ui.paceIcon.textContent=note.icon;this.ui.paceMain.textContent=note.main;this.ui.paceDetail.textContent=note.detail;this.ui.paceDistance.textContent=String(Math.round(distance/10)*10);this.ui.pace.classList.remove('hidden');}}
  showToast(message,seconds=1){this.ui.toast.textContent=message;this.ui.toast.classList.remove('hidden');this.toastUntil=performance.now()+seconds*1000;}

  finishRun(event) {
    const previous=this.best,time=event.time,splits=event.splits,isBest=!previous||time<previous.time;
    if(isBest){this.best={time,splits};this.saveBest(this.best);this.race.setBest(this.best);}
    this.ui.finalTime.textContent=formatTime(time*1000);this.ui.bestTime.textContent=formatTime((isBest?time:previous.time)*1000);
    if(!previous||isBest)this.ui.resultDelta.textContent='NEW BEST';else this.ui.resultDelta.textContent=`+${(time-previous.time).toFixed(2)} S`;
    const d=this.car.damageTotal;this.ui.resultDamage.textContent=d<.06?'CLEAN':d<.18?'LIGHT':d<.34?'HEAVY':'BATTERED';
    this.mode='results';this.ui.hud.classList.add('hidden');this.ui.pace.classList.add('hidden');this.ui.result.classList.remove('hidden');this.audio.stopVoice();requestAnimationFrame(()=>el('retry-button').focus());
  }

  updateHud() {
    const racing=this.race.state==='racing'||this.race.state==='finished';this.ui.time.textContent=formatTime(this.race.elapsed*1000);this.ui.speed.textContent=String(Math.round(this.car.speedKph)).padStart(3,'0');this.ui.gear.textContent=this.car.longitudinalSpeed<-.5?'R':String(this.car.gear);
    const progress=clamp(this.car.progress/this.stage.length,0,1);this.ui.progress.style.width=`${(progress*100).toFixed(2)}%`;this.ui.distance.textContent=`${Math.max(0,(this.stage.length-this.car.progress)/1000).toFixed(1)} KM`;
    if(performance.now()>this.splitMessageUntil){this.ui.split.textContent=racing?'KESTREL RIDGE':'START CONTROL';this.ui.split.style.color='';}
    for(const [node,health] of [[this.ui.damageEngine,1-this.car.damage.engine],[this.ui.damageSteering,1-this.car.damage.steering],[this.ui.damageSuspension,1-this.car.damage.suspension],[this.ui.damageBrakes,1-this.car.damage.brakes],[this.ui.damageBody,1-this.car.damage.body]]){node.style.transform=`scaleX(${clamp(health,0,1)})`;node.style.background=health>.72?'#6cad67':health>.42?'#f2b84b':'#e85d2a';}
    if(this.race.activeNote&&!this.ui.pace.classList.contains('hidden'))this.ui.paceDistance.textContent=String(Math.max(0,Math.round((this.race.activeNote.at-this.car.progress)/10)*10));
    if(performance.now()>this.toastUntil)this.ui.toast.classList.add('hidden');
  }

  frame(timestamp) {
    const realDt=clamp((timestamp-this.lastTimestamp)/1000,0,.05);this.lastTimestamp=timestamp;this.actualFrameIntervals.push(realDt*1000);if(this.actualFrameIntervals.length>180)this.actualFrameIntervals.shift();this.handleActions();
    const physicsStart=performance.now();
    if(this.mode==='playing'){
      this.accumulator+=realDt;let steps=0;while(this.accumulator>=FIXED_STEP&&steps<7){this.simulationStep(FIXED_STEP);this.accumulator-=FIXED_STEP;steps++;}if(steps===7)this.accumulator=0;
    } else if(this.mode==='title'||this.mode==='settings') this.world.update(realDt,this.car,{throttle:0,brake:0,steer:0,handbrake:0});
    this.physicsSamples.push(performance.now()-physicsStart);if(this.physicsSamples.length>120)this.physicsSamples.shift();
    this.camera.update(this.car,realDt);this.renderer.begin(this.camera);this.world.draw(this.camera,this.car);this.lastStats=this.renderer.end();this.frameCount++;
    if(timestamp-this.lastHudUpdate>50){this.updateHud();this.lastHudUpdate=timestamp;}
    if(this.frameCount%60===0)this.writeQA();requestAnimationFrame(t=>this.frame(t));
  }

  writeQA() {
    const intervals=this.actualFrameIntervals.slice(20),avgInterval=intervals.length?intervals.reduce((a,b)=>a+b,0)/intervals.length:0,sorted=[...intervals].sort((a,b)=>a-b),p95=sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]:0,physicsAvg=this.physicsSamples.length?this.physicsSamples.reduce((a,b)=>a+b,0)/this.physicsSamples.length:0,renderCpu=this.lastStats?.averageFrameMs||0;
    const payload={booted:true,mode:this.mode,raceState:this.race.state,frameCount:this.frameCount,progress:Number(this.car.progress.toFixed(1)),speedKph:Number(this.car.speedKph.toFixed(1)),surface:this.car.surface,fps:avgInterval?Number((1000/avgInterval).toFixed(1)):0,cpuFrameMs:Number(renderCpu.toFixed(2)),renderCpuMs:Number(renderCpu.toFixed(2)),gpuFrameMs:Number.isFinite(this.lastStats?.gpuFrameMs)?Number(this.lastStats.gpuFrameMs.toFixed(2)):null,physicsMs:Number(physicsAvg.toFixed(2)),frameP95Ms:Number(p95.toFixed(2)),drawCalls:this.lastStats?.drawCalls||0,triangles:this.lastStats?.triangles||0,particles:this.world.particles.length,loadMs:Number(this.loadTimeMs.toFixed(2)),resolution:this.lastStats?[this.lastStats.width,this.lastStats.height]:[0,0],errors:this.errors};
    el('qa-status').textContent=JSON.stringify(payload);window.__RALLY_QA__=payload;
  }
}
