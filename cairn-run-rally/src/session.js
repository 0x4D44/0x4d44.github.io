import {
  abandon,
  applyService,
  autoServicePlan,
  createChampionship,
  overallStandings,
  stageStandings,
  startStage,
  submitResult
} from './championship.js';
import { normaliseSave, loadSave, persistSave } from './save.js';

const byId = (values, id, label) => {
  const value=values.find(candidate=>candidate.id===id);
  if(!value)throw new Error(`Unknown ${label} ${id}`);
  return value;
};

const finitePositive = value => Number.isFinite(value) && value > 0;

export function runBestKey(run){
  return `${run.stage.id}:${run.car.id}:${run.weather.id}`;
}

export class RallySession {
  constructor(catalog, storage=globalThis.localStorage){
    this.catalog=catalog;
    this.storage=storage;
    this.save=loadSave(storage,catalog);
    this.activeRun=null;
  }

  get championship(){return this.save.championship;}
  get hasResumableChampionship(){return Boolean(this.championship&&['service','ready','driving'].includes(this.championship.phase));}

  persist(){
    this.save=normaliseSave(this.save,this.catalog);
    return persistSave(this.storage,this.save,this.catalog);
  }

  updateProfile({assists=this.save.profile.assists,bindings=this.save.profile.bindings,gamepadBindings=this.save.profile.gamepadBindings}={}){
    this.save={...this.save,profile:{assists:{...assists},bindings:{...bindings},gamepadBindings:{...(gamepadBindings||{})}}};
    this.persist();
    return this.save.profile;
  }

  resolveRun({mode,stageId,carId,weatherId=null,runId=null,initialDamage=null,tuning=null}){
    const stage=byId(this.catalog.stages,stageId,'stage');
    const car=byId(this.catalog.cars,carId,'car');
    const region=byId(this.catalog.regions,stage.regionId,'region');
    const selectedWeatherId=weatherId||region.weatherIds[0];
    const weather=byId(this.catalog.weather,selectedWeatherId,'weather');
    const run={mode,stage,car,region,weather,runId,initialDamage,tuning,assists:{...this.save.profile.assists}};
    run.best=this.bestFor(run);
    return run;
  }

  bestFor(run){return this.save.bests[runBestKey(run)]||null;}

  recordBest(run,{timeSeconds,splits}){
    if(!finitePositive(timeSeconds)||!Array.isArray(splits)||splits.length<1||splits.some(value=>!finitePositive(value))||splits.at(-1)!==timeSeconds)throw new Error('Run result must contain positive splits ending at the finish time');
    const key=runBestKey(run),previous=this.save.bests[key]||null,isBest=!previous||timeSeconds<previous.timeSeconds;
    if(isBest){this.save={...this.save,bests:{...this.save.bests,[key]:{timeSeconds,splits:[...splits]}}};this.persist();}
    return {isBest,best:isBest?this.save.bests[key]:previous,previous};
  }

  startPractice({stageId=this.catalog.stages[0].id,carId=this.catalog.cars[0].id,difficultyId='normal'}={}){
    this.activeRun=this.resolveRun({mode:'practice',stageId,carId});
    this.activeRun.difficultyId=difficultyId;
    return this.activeRun;
  }

  completePractice(result){
    if(!['practice','quick'].includes(this.activeRun?.mode))throw new Error('No practice run is active');
    return this.recordBest(this.activeRun,result);
  }

  createChampionship({championshipId=this.catalog.championships[0].id,carId=this.catalog.cars[0].id,difficultyId='normal',seed=0}={}){
    const championship=byId(this.catalog.championships,championshipId,'championship');
    const state=createChampionship({championship,content:this.catalog,carId,difficultyId,seed});
    this.save={...this.save,championship:state};this.activeRun=null;this.persist();
    return this.championship;
  }

  championshipEvent(state=this.championship){
    if(!state)throw new Error('No championship is saved');
    const championship=byId(this.catalog.championships,state.championshipId,'championship');
    const event=championship.events[state.eventIndex];
    if(!event)throw new Error(`Championship is ${state.phase}`);
    return {championship,event};
  }

  resolveChampionshipRun(state=this.championship){
    const {event}=this.championshipEvent(state);
    return this.resolveRun({mode:'championship',stageId:event.stageId,weatherId:event.weatherId,carId:state.carId,runId:state.runId,initialDamage:{...state.damage},tuning:{...state.tuning}});
  }

  resumeChampionshipRun(){
    const state=this.championship;
    if(!state||state.phase!=='driving')throw new Error(`Championship is ${state?.phase||'unavailable'}`);
    this.activeRun=this.resolveChampionshipRun(state);
    return this.activeRun;
  }

  startChampionshipStage(plan=null){
    let state=this.championship;
    if(!state)throw new Error('No championship is saved');
    if(state.phase==='service')state=applyService(state,plan||autoServicePlan(state,this.catalog),this.catalog);
    if(state.phase!=='ready')throw new Error(`Championship is ${state.phase}`);
    state=startStage(state,this.catalog);
    this.save={...this.save,championship:state};this.persist();
    this.activeRun=this.resolveChampionshipRun(state);
    return this.activeRun;
  }

  completeChampionship(result){
    const current=this.championship;
    if(!current)throw new Error('No championship is saved');
    const active=this.activeRun||this.resolveChampionshipRun(current);
    const runId=result.runId||current.runId;
    const state=submitResult(current,runId,result,this.catalog);
    this.save={...this.save,championship:state};
    const best=this.recordBest(active,result);
    this.activeRun=null;this.persist();
    return {state,best,stageStandings:stageStandings(state,this.catalog,state.results.length-1),overallStandings:overallStandings(state,this.catalog)};
  }

  abandonChampionship(){
    if(!this.championship)throw new Error('No championship is saved');
    const state=abandon(this.championship,this.catalog);
    this.save={...this.save,championship:state};this.activeRun=null;this.persist();
    return state;
  }
}
