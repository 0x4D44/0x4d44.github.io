import { formatTime } from './math.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[character]);
const upper = value => escapeHtml(String(value ?? '').toUpperCase());
const checked = value => value ? ' checked' : '';
const stageLengthKm = stage => (stage.segments.reduce((sum,segment)=>sum+segment.lengthM,0)/1000).toFixed(1);

export function optionMarkup(catalog,selection={}){
  const regionById=new Map(catalog.regions.map(region=>[region.id,region]));
  const weatherById=new Map(catalog.weather.map(weather=>[weather.id,weather]));
  const cars=catalog.cars.map(car=>`<label class="option-card" data-car-id="${escapeHtml(car.id)}"><input type="radio" name="car" value="${escapeHtml(car.id)}" data-option="car" data-car-id="${escapeHtml(car.id)}"${checked(car.id===selection.carId)} /><span><strong>${upper(car.name)}</strong><small>${upper(car.drive)} · ${escapeHtml(car.powerBhp)} BHP · ${escapeHtml(car.massKg)} KG</small><em>${upper(car.silhouette.replaceAll('-',' '))}</em></span></label>`).join('');
  const stages=catalog.stages.map(stage=>{
    const region=regionById.get(stage.regionId),weather=weatherById.get(region?.weatherIds?.[0]);
    return `<label class="option-card" data-stage-id="${escapeHtml(stage.id)}"><input type="radio" name="stage" value="${escapeHtml(stage.id)}" data-option="stage" data-stage-id="${escapeHtml(stage.id)}"${checked(stage.id===selection.stageId)} /><span><strong>${upper(stage.name)}</strong><small>${upper(region?.country)} · ${stageLengthKm(stage)} KM · ${upper(weather?.timeOfDay)}</small><em>${upper(stage.routeIdentity?.signatures?.join(' · ')||stage.identityTags?.join(' · '))}</em></span></label>`;
  }).join('');
  const difficulties=catalog.difficulties.map(difficulty=>`<label class="option-card"><input type="radio" name="difficulty" value="${escapeHtml(difficulty.id)}" data-option="difficulty" data-difficulty-id="${escapeHtml(difficulty.id)}"${checked(difficulty.id===selection.difficultyId)} /><span><strong>${upper(difficulty.name)}</strong><small>${upper(difficulty.id)}</small><em>RIVAL PACE × ${escapeHtml(difficulty.rivalPace.toFixed(2))}</em></span></label>`).join('');
  return {cars,stages,difficulties};
}

export function stageRowsMarkup(rows){
  const leader=rows.find(row=>row.status==='finished')?.totalMs??null;
  return rows.map(row=>{
    const time=row.status==='finished'?formatTime(row.totalMs):'RETIRED';
    const gap=row.status!=='finished'?'—':row.totalMs===leader?'LEADER':`+${((row.totalMs-leader)/1000).toFixed(3)}`;
    return `<tr${row.isPlayer?' class="is-player"':''}><td>${escapeHtml(row.position)}</td><td>${row.isPlayer?'YOU':upper(row.name)}</td><td>${escapeHtml(time)}</td><td>${escapeHtml(gap)}</td><td>${escapeHtml(row.points)}</td></tr>`;
  }).join('');
}

export function rivalRowsMarkup(rows,leader=null){
  const reference=leader??rows.find(row=>row.status==='finished')?.totalMs??null;
  return rows.map(row=>`<tr><td>${upper(row.name)}</td><td>${row.status==='finished'?escapeHtml(formatTime(row.totalMs)):'RETIRED'}</td><td>${row.status!=='finished'?'—':row.totalMs===reference?'LEADER':`+${escapeHtml(((row.totalMs-reference)/1000).toFixed(3))}`}</td></tr>`).join('');
}

export function overallRowsMarkup(rows){
  const leader=rows[0]?.points??0;
  return rows.map(row=>`<tr${row.id==='player'?' class="is-player"':''}><td>${escapeHtml(row.position)}</td><td>${row.id==='player'?'YOU':upper(row.name)}</td><td>${escapeHtml(row.stages)}</td><td>${escapeHtml(row.points)}</td><td>${row.position===1?'LEADER':`${escapeHtml(leader-row.points)} PTS`}</td></tr>`).join('');
}
