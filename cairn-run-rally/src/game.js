import { AudioManager } from './audio.js';
import {
  autoServicePlan,
  overallStandings,
  planService,
  REPAIR_MINUTES,
  stageStandings
} from './championship.js';
import { CATALOG } from './content.js';
import {
  DEFAULT_BINDINGS,
  DEFAULT_GAMEPAD_BINDINGS,
  formatBinding,
  formatGamepadBinding,
  InputManager,
  isReservedGamepadButton,
  normalizeBindings,
  normalizeGamepadBindings
} from './input.js';
import { clamp, formatTime } from './math.js';
import { StageRun } from './race.js';
import { WebGLRenderer } from './renderer.js';
import { RallySession } from './session.js';
import { buildStage } from './stage.js';
import { optionMarkup, overallRowsMarkup, rivalRowsMarkup, stageRowsMarkup } from './ui.js';
import { RallyCar } from './vehicle.js';
import { ChaseCamera, RallyWorld } from './world.js';

const FIXED_STEP = 1 / 120;
const el = id => document.getElementById(id);

export class CairnRunGame {
  constructor() {
    this.bootStarted = performance.now();
    this.qa = new URLSearchParams(location.search).has('qa');
    this.canvas = el('game-canvas');
    this.session = new RallySession(CATALOG, localStorage);
    this.activeRun = this.session.startPractice();
    this.activeRun.mode='quick';
    this.flowMode='quick';
    this.stage = buildStage(this.activeRun.stage);
    this.renderer = new WebGLRenderer(this.canvas);
    this.car = new RallyCar(this.stage,this.activeRun.car,{assists:this.activeRun.assists,weather:this.activeRun.weather});
    this.world = new RallyWorld(this.renderer, this.stage, this.loadSetting('quality', 'high'),this.activeRun);
    this.camera = new ChaseCamera(this.stage, this.car);
    this.input = new InputManager(this.stage, {
      autopilot: this.qa,
      bindings:this.session.save.profile.bindings,
      gamepadBindings:this.session.save.profile.gamepadBindings
    });
    this.audio = new AudioManager({car:this.activeRun.car,stage:this.activeRun.stage});
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
    this.recoveryCount = 0;
    this.contactCount = 0;
    this.lastHudUpdate = 0;
    this.splitMessageUntil = 0;
    this.toastUntil = 0;
    this.errors = [];
    this.best = this.legacyBest(this.activeRun.best);
    this.race.setBest(this.best);
    this.installUI();
    this.ui.effects.value=this.loadSetting('effects','0.75');
    this.ui.voice.value=this.loadSetting('voice','0.9');
    this.ui.quality.value=this.loadSetting('quality','high');
    const assists=this.session.save.profile.assists;
    this.ui.notes.checked=Boolean(assists.paceNotes);
    this.ui.automatic.checked=Boolean(assists.automatic);
    this.ui.manual.checked=!this.ui.automatic.checked;
    this.ui.stability.checked=Boolean(assists.stability);
    this.ui.braking.checked=Boolean(assists.braking);
    this.ui.mute.checked=this.loadSetting('mute','0')==='1';
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
  legacyBest(best){return best?{time:best.timeSeconds,splits:best.splits.map(time=>({time}))}:null;}

  installUI() {
    this.ui = {
      title:el('title-screen'),selection:el('selection-screen'),service:el('service-screen'),settings:el('settings-screen'),pause:el('pause-screen'),result:el('result-screen'),standings:el('standings-screen'),hud:el('hud'),countdown:el('countdown'),
      time:el('stage-time'),speed:el('speed'),gear:el('gear'),progress:el('progress-bar'),distance:el('distance-left'),split:el('split-delta'),
      pace:el('pace-note'),paceIcon:el('pace-icon'),paceMain:el('pace-main'),paceDetail:el('pace-detail'),paceDistance:el('pace-distance'),toast:el('toast'),
      damageEngine:el('damage-engine'),damageSteering:el('damage-steering'),damageSuspension:el('damage-suspension'),damageBrakes:el('damage-brakes'),damageBody:el('damage-body'),
      finalTime:el('final-time'),bestTime:el('best-time'),resultDelta:el('result-delta'),resultDamage:el('result-damage'),resultPosition:el('result-position'),resultPoints:el('result-points'),resultPenalty:el('result-penalty'),
      effects:el('effects-volume'),voice:el('voice-volume'),quality:el('quality-setting'),notes:el('notes-toggle'),mute:el('mute-toggle'),automatic:el('assist-automatic'),stability:el('assist-stability'),braking:el('assist-braking'),manual:el('manual-shifting-toggle')
    };
    el('start-button').addEventListener('click',()=>this.startQuickRun());
    el('practice-button').addEventListener('click',()=>this.showSelection('practice'));
    el('championship-button').addEventListener('click',()=>this.showSelection('championship'));
    el('resume-championship').addEventListener('click',()=>this.resumeChampionship());
    el('selection-back').addEventListener('click',()=>this.returnToTitle());
    el('selection-form').addEventListener('submit',event=>{event.preventDefault();this.acceptSelection();});
    el('service-form').addEventListener('submit',event=>{event.preventDefault();this.acceptService();});
    el('service-auto').addEventListener('click',()=>this.autoSelectService());
    el('service-abandon').addEventListener('click',()=>this.abandonChampionship());
    el('settings-button').addEventListener('click',()=>this.showSettings());
    el('settings-back').addEventListener('click',()=>this.closeSettings());
    el('resume-button').addEventListener('click',()=>this.resume());
    el('pause-restart').addEventListener('click',()=>this.beginRun(false));
    el('quit-button').addEventListener('click',()=>this.returnToTitle());
    el('retry-button').addEventListener('click',()=>this.beginRun(false));
    el('result-quit').addEventListener('click',()=>this.returnToTitle());
    el('result-next').addEventListener('click',()=>this.advanceChampionship());
    el('standings-continue').addEventListener('click',()=>this.returnToTitle());
    el('standings-abandon').addEventListener('click',()=>this.abandonChampionship());
    for(const input of document.querySelectorAll('[data-service-component],[data-service-tuning]'))input.addEventListener('input',()=>{this.pendingServicePlan=null;this.updateServicePreview();});
    for(const input of document.querySelectorAll('[data-service-component],[data-service-tuning]'))input.addEventListener('change',()=>{this.pendingServicePlan=null;this.updateServicePreview();});
    for(const input of [this.ui.effects,this.ui.voice,this.ui.quality,this.ui.notes,this.ui.mute,this.ui.automatic,this.ui.stability,this.ui.braking,this.ui.manual]) input.addEventListener('input',()=>this.applySettings(true,input));
    for(const button of document.querySelectorAll('[data-binding]'))button.addEventListener('click',()=>this.captureBinding(button));
    el('reset-bindings').addEventListener('click',()=>this.applyBindings(DEFAULT_BINDINGS,true,DEFAULT_GAMEPAD_BINDINGS));
    this.canvas.addEventListener('dblclick',()=>{if(!document.fullscreenElement)this.canvas.requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.().catch(()=>{});});
    this.renderSelectionOptions();this.refreshResumeAction();this.applyBindings(this.input.bindings,false);
    requestAnimationFrame(()=>el('start-button').focus());
  }

  installSafetyHandlers() {
    addEventListener('error',event=>{this.errors.push(String(event.error?.stack||event.message));this.writeQA();});
    addEventListener('unhandledrejection',event=>{this.errors.push(String(event.reason?.stack||event.reason));this.writeQA();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.mode==='playing'&&this.race.state==='racing')this.pause();});
    addEventListener('contextmenu',e=>e.preventDefault());
  }

  applySettings(save=false,source=null) {
    if(source===this.ui.manual)this.ui.automatic.checked=!this.ui.manual.checked;
    if(source===this.ui.automatic)this.ui.manual.checked=!this.ui.automatic.checked;
    const effects=Number(this.ui.effects.value),voice=Number(this.ui.voice.value),quality=this.ui.quality.value;
    const assists={automatic:this.ui.automatic.checked,stability:this.ui.stability.checked,braking:this.ui.braking.checked,paceNotes:this.ui.notes.checked};
    this.audio.setVolumes(effects,voice);this.audio.mute(this.ui.mute.checked||this.mode!=='playing');this.renderer.setQuality(quality);this.world.setQuality(quality);Object.assign(this.car.assists,assists);
    el('effects-level').textContent=`${Math.round(effects*100)}%`;el('voice-level').textContent=`${Math.round(voice*100)}%`;
    if(save){this.saveSetting('effects',effects);this.saveSetting('voice',voice);this.saveSetting('quality',quality);this.saveSetting('mute',this.ui.mute.checked?'1':'0');this.session.updateProfile({assists,bindings:this.input.bindings,gamepadBindings:this.input.gamepadBindings});}
  }

  hideScreens(){for(const screen of [this.ui.title,this.ui.selection,this.ui.service,this.ui.settings,this.ui.pause,this.ui.result,this.ui.standings])screen.classList.add('hidden');}

  renderSelectionOptions(){
    const selection={carId:this.activeRun?.car?.id||CATALOG.cars[0].id,stageId:this.activeRun?.stage?.id||CATALOG.stages[0].id,difficultyId:this.activeRun?.difficultyId||'normal'},markup=optionMarkup(CATALOG,selection);
    el('car-options').querySelector('.option-grid').innerHTML=markup.cars;
    el('stage-options').querySelector('.option-grid').innerHTML=markup.stages;
    el('selection-difficulty').querySelector('.option-grid').innerHTML=markup.difficulties;
  }

  showSelection(mode){
    this.flowMode=mode;this.mode='selection';this.hideScreens();this.ui.selection.classList.remove('hidden');
    el('selection-mode').textContent=mode==='championship'?'WORLD CHAMPIONSHIP':'PRACTICE / TIME TRIAL';
    el('stage-options').hidden=mode==='championship';el('selection-start').firstChild.textContent=mode==='championship'?'ENTER CHAMPIONSHIP ':'START STAGE ';
    this.renderSelectionOptions();requestAnimationFrame(()=>el('car-options').querySelector('input:checked')?.focus());
  }

  acceptSelection(){
    const form=new FormData(el('selection-form')),carId=String(form.get('car')),stageId=String(form.get('stage')),difficultyId=String(form.get('difficulty'));
    try{
      if(this.flowMode==='championship'){
        this.session.createChampionship({carId,difficultyId,seed:(Date.now()|0)});this.refreshResumeAction();this.showService();
      }else{
        const run=this.session.startPractice({carId,stageId,difficultyId});this.configureRun(run);this.beginRun(true);
      }
    }catch(error){this.showInlineError('selection-error',error);}
  }

  startQuickRun(){
    const run=this.session.startPractice({stageId:CATALOG.stages[0].id,carId:CATALOG.cars[0].id,difficultyId:'normal'});run.mode='quick';this.flowMode='quick';this.configureRun(run);this.beginRun(true);
  }

  configureRun(run){
    this.activeRun=run;this.stage=buildStage(run.stage);this.world.dispose();
    this.car=new RallyCar(this.stage,run.car,{assists:run.assists,weather:run.weather,tuning:run.tuning||undefined});
    if(run.initialDamage)Object.assign(this.car.damage,run.initialDamage);
    this.world=new RallyWorld(this.renderer,this.stage,this.ui.quality.value,run);this.camera=new ChaseCamera(this.stage,this.car);this.race=new StageRun(this.stage);
    this.input.stage=this.stage;this.audio.configure({car:run.car,stage:run.stage});this.best=this.legacyBest(run.best);this.race.setBest(this.best);
    el('result-heading').textContent=run.stage.name.toUpperCase();this.ui.pause.querySelector('h2').textContent=run.stage.name;
    this.applySettings(false);this.updateHud();
  }

  refreshResumeAction(){
    const state=this.session.championship,resumable=this.session.hasResumableChampionship;
    el('resume-championship').hidden=!resumable;el('resume-note').hidden=!resumable;
    el('resume-note').textContent=resumable?`Event ${state.eventIndex+1} · ${state.phase.toUpperCase()}`:'No saved championship found.';
  }

  resumeChampionship(){
    const state=this.session.championship;
    if(!state)return;
    if(state.phase==='service')this.showService();
    else if(state.phase==='ready'){const run=this.session.startChampionshipStage({repair:{}});this.configureRun(run);this.beginRun(true);}
    else if(state.phase==='driving'){const run=this.session.resumeChampionshipRun();this.configureRun(run);this.beginRun(false);}
    else this.showOverallStandings();
  }

  showService(){
    const state=this.session.championship,{championship,event}=this.session.championshipEvent(state);
    this.hideScreens();this.mode='service';this.ui.service.classList.remove('hidden');this.pendingServicePlan=null;
    el('service-budget').textContent=`${event.serviceMinutes} MIN`;el('service-event').textContent=`${String(state.eventIndex+1).padStart(2,'0')} / ${String(championship.events.length).padStart(2,'0')} · ${CATALOG.stages.find(stage=>stage.id===event.stageId).name.toUpperCase()}`;
    for(const input of document.querySelectorAll('[data-service-component]')){
      const component=input.dataset.serviceComponent,need=state.damage[component]*REPAIR_MINUTES[component];input.checked=false;input.closest('.service-row').querySelector('output').textContent=need.toFixed(1);
    }
    const tuning=state.tuning||{};
    const tyre=document.querySelector('[data-service-tuning="tyreId"]');
    if(tyre)tyre.value=tuning.tyreId||'standard';
    for(const input of document.querySelectorAll('[data-service-tuning]:not([data-service-tuning="tyreId"])'))input.value=String(tuning[input.dataset.serviceTuning]??0);
    this.updateServicePreview();requestAnimationFrame(()=>el('service-auto').focus());
  }

  selectedServicePlan(){
    const repair={};for(const component of Object.keys(REPAIR_MINUTES)){const input=document.querySelector(`[data-service-component="${component}"]`);repair[component]=input?.checked?this.session.championship.damage[component]*REPAIR_MINUTES[component]:0;}
    const setup={};
    for(const input of document.querySelectorAll('[data-service-tuning]'))setup[input.dataset.serviceTuning]=input.dataset.serviceTuning==='tyreId'?input.value:Number(input.value);
    return {repair,setup};
  }

  renderServiceSetupReport(report){
    const setup=report.setupMinutes;
    const tyreOutput=el('service-tyre-cost');
    if(tyreOutput)tyreOutput.textContent=`${setup.tyre.toFixed(1)} MIN`;
    for(const key of ['brakeBias','steeringRatio','rideHeight','damping']){
      const input=document.querySelector(`[data-service-tuning="${key}"]`),output=el(`service-${key.replace(/[A-Z]/g,letter=>`-${letter.toLowerCase()}`)}-value`);
      if(input&&output)output.textContent=`${Number(input.value).toFixed(2)} · ${setup[key].toFixed(1)} MIN`;
    }
  }

  updateServicePreview(){
    try{const report=planService(this.session.championship,this.pendingServicePlan||this.selectedServicePlan(),CATALOG);el('service-remaining').textContent=`${report.remainingMinutes.toFixed(1)} MIN REMAINING`;this.renderServiceSetupReport(report);this.showInlineError('service-error',null);return report;}
    catch(error){el('service-remaining').textContent='OVER BUDGET';this.showInlineError('service-error',error);return null;}
  }

  autoSelectService(){
    this.pendingServicePlan=autoServicePlan(this.session.championship,CATALOG);
    for(const input of document.querySelectorAll('[data-service-component]'))input.checked=this.pendingServicePlan.repair[input.dataset.serviceComponent]>0;
    const tuning=this.pendingServicePlan.tuning||this.pendingServicePlan.setup||this.session.championship.tuning;
    for(const input of document.querySelectorAll('[data-service-tuning]'))input.value=String(tuning[input.dataset.serviceTuning]??0);
    this.updateServicePreview();
  }

  acceptService(){
    const plan=this.pendingServicePlan||this.selectedServicePlan();if(!this.updateServicePreview())return;
    try{const run=this.session.startChampionshipStage(plan);this.configureRun(run);this.beginRun(true);this.refreshResumeAction();}
    catch(error){this.showInlineError('service-error',error);}
  }

  abandonChampionship(){
    try{this.session.abandonChampionship();this.refreshResumeAction();this.returnToTitle();}
    catch(error){this.showInlineError('service-error',error);}
  }

  advanceChampionship(){
    const state=this.session.championship;if(!state)return this.returnToTitle();
    if(state.phase==='service')this.showService();else this.showOverallStandings();
  }

  showOverallStandings(){
    const state=this.session.championship,rows=overallStandings(state,CATALOG);this.hideScreens();this.mode='standings';this.ui.standings.classList.remove('hidden');
    el('standings-table').querySelector('tbody').innerHTML=overallRowsMarkup(rows);el('standings-continue').textContent=state.phase==='classified'?'RETURN TO TITLE':'NEXT EVENT';el('standings-abandon').hidden=state.phase==='classified';requestAnimationFrame(()=>el('standings-continue').focus());
  }

  applyBindings(bindings,persist=false,gamepadBindings=this.input.gamepadBindings){
    const normalized=normalizeBindings(bindings),normalizedGamepad=normalizeGamepadBindings(gamepadBindings);
    this.input.setBindings(normalized);this.input.setGamepadBindings(normalizedGamepad);
    for(const button of document.querySelectorAll('[data-binding-device="keyboard"]'))button.textContent=formatBinding(normalized[button.dataset.binding]);
    for(const button of document.querySelectorAll('[data-binding-device="gamepad"]'))button.textContent=formatGamepadBinding(normalizedGamepad[button.dataset.binding]);
    if(persist)this.session.updateProfile({assists:this.session.save.profile.assists,bindings:normalized,gamepadBindings:normalizedGamepad});
  }

  captureBinding(button){
    if(button.dataset.bindingDevice==='gamepad')return this.captureGamepadBinding(button);
    const action=button.dataset.binding,previous=button.textContent;button.textContent='PRESS A KEY';
    const capture=event=>{event.preventDefault();event.stopPropagation();const candidate={...this.input.bindings,[action]:event.code},normalized=normalizeBindings(candidate);this.applyBindings(normalized,true);if(normalized===DEFAULT_BINDINGS&&candidate[action]!==DEFAULT_BINDINGS[action])this.showToast('CONTROL MAP RESET — INVALID OR DUPLICATE',2);button.blur();};
    window.addEventListener('keydown',capture,{once:true,capture:true});setTimeout(()=>{if(button.textContent==='PRESS A KEY')button.textContent=previous;},8000);
  }

  captureGamepadBinding(button){
    const action=button.dataset.binding,previous=button.textContent,baseline=this.input.activeGamepadButtons();
    button.textContent='PRESS GAMEPAD';button.disabled=true;
    let finished=false;
    const finish=()=>{if(finished)return;finished=true;button.disabled=false;if(button.textContent==='PRESS GAMEPAD')button.textContent=previous;};
    const deadline=performance.now()+8000;
    const poll=()=>{
      if(finished)return;
      const current=this.input.activeGamepadButtons();
      const candidate=[...current].find(index=>!baseline.has(index));
      if(candidate!==undefined){
        if(isReservedGamepadButton(candidate)){this.showToast('MENU BUTTONS ARE FIXED',2);finish();return;}
        const proposed={...this.input.gamepadBindings,[action]:candidate},normalized=normalizeGamepadBindings(proposed);
        this.applyBindings(this.input.bindings,true,normalized);
        if(normalized===DEFAULT_GAMEPAD_BINDINGS&&candidate!==DEFAULT_GAMEPAD_BINDINGS[action])this.showToast('GAMEPAD MAP RESET — INVALID OR DUPLICATE',2);
        finish();button.blur();return;
      }
      if(performance.now()>deadline){finish();return;}
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }

  showInlineError(id,error){const node=el(id);if(!node)return;if(!error){node.hidden=true;node.textContent='';return;}node.hidden=false;node.textContent=String(error.message||error);}

  showSettings(){this.mode='settings';this.ui.title.classList.add('hidden');this.ui.settings.classList.remove('hidden');requestAnimationFrame(()=>this.ui.effects.focus());}
  closeSettings(){this.mode='title';this.ui.settings.classList.add('hidden');this.ui.title.classList.remove('hidden');requestAnimationFrame(()=>el('settings-button').focus());}

  async beginRun(fullCountdown) {
    await this.audio.start({car:this.activeRun.car,stage:this.activeRun.stage});
    this.mode='playing';this.hideScreens();this.ui.hud.classList.remove('hidden');this.ui.pace.classList.add('hidden');
    this.car.reset(14,true);if(this.activeRun.initialDamage)Object.assign(this.car.damage,this.activeRun.initialDamage);this.camera.reset(this.car);this.race.reset(fullCountdown);if(this.qa)this.race.countdown=.18;this.race.setBest(this.best);this.accumulator=0;this.lastCollisionLevel=0;this.recoveryCount=0;this.contactCount=0;this.audio.mute(this.ui.mute.checked);this.audio.stopVoice();
    this.ui.countdown.textContent=fullCountdown?'3':'1';this.ui.countdown.classList.remove('hidden');if(!this.qa)this.audio.countdown(fullCountdown?3:1);this.input.clearPressed();this.updateHud();
  }
  pause(){if(this.mode!=='playing')return;this.mode='paused';this.ui.pause.classList.remove('hidden');this.audio.mute(true);requestAnimationFrame(()=>el('resume-button').focus());}
  resume(){if(this.mode!=='paused')return;this.mode='playing';this.ui.pause.classList.add('hidden');this.audio.mute(this.ui.mute.checked);this.lastTimestamp=performance.now();this.input.clearPressed();}
  returnToTitle(){this.mode='title';this.hideScreens();this.ui.hud.classList.add('hidden');this.ui.pace.classList.add('hidden');this.ui.countdown.classList.add('hidden');this.ui.title.classList.remove('hidden');this.audio.mute(true);this.audio.stopVoice();this.car.reset(14,true);this.camera.reset(this.car);this.input.clearPressed();this.refreshResumeAction();requestAnimationFrame(()=>el('start-button').focus());}

  currentMenuItems() {
    const root=this.mode==='title'?this.ui.title:this.mode==='selection'?this.ui.selection:this.mode==='service'?this.ui.service:this.mode==='settings'?this.ui.settings:this.mode==='paused'?this.ui.pause:this.mode==='results'?this.ui.result:this.mode==='standings'?this.ui.standings:null;
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
    if(this.mode==='title')this.startQuickRun();else if(this.mode==='paused')this.resume();else if(this.mode==='results')el(this.activeRun.mode==='championship'?'result-next':'retry-button').click();
  }

  handleActions() {
    this.input.pollGamepad();
    const restart=this.input.consumeAny(['KeyR','PadRestart']);
    if(restart&&(this.mode==='playing'||this.mode==='paused'||this.mode==='results')){this.beginRun(false);return;}
    if(this.input.consume('PadStart')){if(this.mode==='playing')this.pause();else if(this.mode==='paused')this.resume();else if(this.mode==='title')this.startQuickRun();else if(this.mode==='results')el(this.activeRun.mode==='championship'?'result-next':'retry-button').click();return;}
    if(this.input.consumeAny(['Escape','PadBack'])){if(this.mode==='playing')this.pause();else if(this.mode==='paused')this.resume();else if(this.mode==='settings')this.closeSettings();else if(this.mode==='results')this.returnToTitle();return;}
    if(this.input.consume('PadUp'))this.moveMenuFocus(-1);
    if(this.input.consume('PadDown'))this.moveMenuFocus(1);
    if(this.input.consume('PadLeft'))this.adjustFocused(-1);
    if(this.input.consume('PadRight'))this.adjustFocused(1);
    if(this.input.consume('PadConfirm')){this.activateMenu();return;}
    if(this.input.consume('Enter')){if(this.mode==='title')this.startQuickRun();else if(this.mode==='results')el(this.activeRun.mode==='championship'?'result-next':'retry-button').click();else if(this.mode==='paused')this.resume();}
  }

  simulationStep(dt) {
    if(this.race.state==='racing') {
      const controls=this.input.read(this.car),result=this.car.step(controls,dt);this.world.update(dt,this.car,controls);this.audio.update(this.car,controls);
      if(this.car.collisionImpulse>.12&&this.car.collisionImpulse>this.lastCollisionLevel+.08){this.contactCount++;this.audio.collision(this.car.collisionImpulse);}
      this.lastCollisionLevel=this.car.collisionImpulse;
      if(this.car.needsRecovery){this.car.recover();this.recoveryCount++;this.camera.reset(this.car);this.showToast('RESET TO LAST SAFE POINT',1.5);}
      const events=this.race.update(this.car,dt);this.processEvents(events);
      if(result.road.distance>95){this.car.recover();this.recoveryCount++;this.camera.reset(this.car);}
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
    const previous=this.best,time=event.time,splits=event.splits.map(split=>split.time),payload={timeSeconds:time,splits,damage:{...this.car.damage}},championship=this.activeRun.mode==='championship';
    let outcome,bestResult,rows=[];
    try{
      if(championship){outcome=this.session.completeChampionship(payload);bestResult=outcome.best;rows=outcome.stageStandings;}
      else bestResult=this.session.completePractice(payload);
    }catch(error){this.errors.push(String(error.stack||error));this.writeQA();throw error;}
    const isBest=bestResult.isBest;this.best=this.legacyBest(bestResult.best);this.race.setBest(this.best);
    this.ui.finalTime.textContent=formatTime(time*1000);this.ui.bestTime.textContent=formatTime(bestResult.best.timeSeconds*1000);
    if(!previous||isBest)this.ui.resultDelta.textContent='NEW BEST';else this.ui.resultDelta.textContent=`+${(time-previous.time).toFixed(2)} S`;
    const d=this.car.damageTotal;this.ui.resultDamage.textContent=d<.06?'CLEAN':d<.18?'LIGHT':d<.34?'HEAVY':'BATTERED';
    const result=championship?outcome.state.results.at(-1):null,player=rows.find(row=>row.isPlayer);
    this.ui.resultPosition.textContent=player?`${player.position} / ${rows.length}`:'—';this.ui.resultPoints.textContent=player?String(player.points):'—';this.ui.resultPenalty.textContent=result?`${(result.penaltyMs/1000).toFixed(1)} S`:'0.0 S';
    el('result-rivals').hidden=!championship;el('stage-standings').hidden=!championship;el('result-next').hidden=!championship;el('retry-button').hidden=championship;
    if(championship){
      const leader=rows.find(row=>row.status==='finished')?.totalMs??null;
      el('result-rivals').querySelector('tbody').innerHTML=rivalRowsMarkup(rows.filter(row=>!row.isPlayer),leader);
      el('result-standings').innerHTML=`<table class="data-table"><thead><tr><th>POS</th><th>DRIVER</th><th>TIME</th><th>GAP</th><th>PTS</th></tr></thead><tbody>${stageRowsMarkup(rows)}</tbody></table>`;this.refreshResumeAction();
    }
    this.mode='results';this.hideScreens();this.ui.hud.classList.add('hidden');this.ui.pace.classList.add('hidden');this.ui.result.classList.remove('hidden');this.audio.stopVoice();requestAnimationFrame(()=>el(championship?'result-next':'retry-button').focus());
  }

  updateHud() {
    const racing=this.race.state==='racing'||this.race.state==='finished';this.ui.time.textContent=formatTime(this.race.elapsed*1000);this.ui.speed.textContent=String(Math.round(this.car.speedKph)).padStart(3,'0');this.ui.gear.textContent=this.car.longitudinalSpeed<-.5?'R':String(this.car.gear);
    const progress=clamp(this.car.progress/this.stage.length,0,1);this.ui.progress.style.width=`${(progress*100).toFixed(2)}%`;this.ui.distance.textContent=`${Math.max(0,(this.stage.length-this.car.progress)/1000).toFixed(1)} KM`;
    if(performance.now()>this.splitMessageUntil){this.ui.split.textContent=racing?this.activeRun.stage.name.toUpperCase():'START CONTROL';this.ui.split.style.color='';}
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
    const payload={booted:true,mode:this.mode,raceState:this.race.state,frameCount:this.frameCount,progress:Number(this.car.progress.toFixed(1)),speedKph:Number(this.car.speedKph.toFixed(1)),surface:this.car.surface,fps:avgInterval?Number((1000/avgInterval).toFixed(1)):0,cpuFrameMs:Number(renderCpu.toFixed(2)),renderCpuMs:Number(renderCpu.toFixed(2)),gpuFrameMs:Number.isFinite(this.lastStats?.gpuFrameMs)?Number(this.lastStats.gpuFrameMs.toFixed(2)):null,physicsMs:Number(physicsAvg.toFixed(2)),frameP95Ms:Number(p95.toFixed(2)),drawCalls:this.lastStats?.drawCalls||0,triangles:this.lastStats?.triangles||0,particles:this.world.particles.length,audioVoices:this.audio.voiceCount(),recoveries:this.recoveryCount,contacts:this.contactCount,loadMs:Number(this.loadTimeMs.toFixed(2)),resolution:this.lastStats?[this.lastStats.width,this.lastStats.height]:[0,0],errors:this.errors};
    el('qa-status').textContent=JSON.stringify(payload);window.__RALLY_QA__=payload;
  }
}
