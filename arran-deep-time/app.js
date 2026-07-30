(()=>{
'use strict';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const pressed=(node,on)=>node.setAttribute('aria-pressed',String(Boolean(on)));

// Small review-time accessibility refinements that are easiest to express next
// to the interaction code: larger invisible hit areas for SVG route controls and
// explicit focus treatment for SVG/button states.
const reviewStyle=document.createElement('style');
reviewStyle.textContent=`
  .geo-unit:focus-visible{stroke:var(--cyan);stroke-width:5;filter:brightness(1.24)}
  .h-step:hover,.h-step:focus-visible,.h-step.on{color:var(--paper);border-color:var(--gold);background:rgba(227,197,108,.12)}
  .route-pin:focus-visible circle:not(.route-hit){stroke:var(--cyan);stroke-width:5}
  .route-pin .route-hit{fill:transparent!important;stroke:transparent!important}
`;
document.head.append(reviewStyle);


// Interactive SVGs expose their child controls instead of flattening them into
// a single image. Supporting panels are named regions rather than nested
// complementary landmarks inside <main>.
$$('svg[role="img"]').forEach(svg=>{
  if(svg.querySelector('[role="button"]')) svg.setAttribute('role','group');
});
$$('main aside').forEach((aside,index)=>{
  aside.setAttribute('role','region');
  if(aside.hasAttribute('aria-label')||aside.hasAttribute('aria-labelledby')) return;
  const heading=aside.querySelector('h2,h3');
  if(heading){
    if(!heading.id) heading.id=`arranRegion${index+1}`;
    aside.setAttribute('aria-labelledby',heading.id);
  }else{
    aside.setAttribute('aria-label',`Supporting information ${index+1}`);
  }
});

// Progress, current chapter and chapter rail.
const progress=$('#progress');
const pos=$('#fieldPos');
const chapters=$$('.chapter, .hero');
const rails=$$('.rail a');
function onScroll(){
  const max=document.documentElement.scrollHeight-innerHeight;
  progress.style.width=(max?Math.min(100,scrollY/max*100):0)+'%';
  let active=chapters[0];
  for(const section of chapters){
    if(section.getBoundingClientRect().top<innerHeight*.45) active=section;
  }
  const id=active.id;
  pos.textContent=active.dataset.position||'Present day';
  rails.forEach(link=>{
    const on=link.getAttribute('href')==='#'+id;
    link.classList.toggle('on',on);
    if(on) link.setAttribute('aria-current','location');
    else link.removeAttribute('aria-current');
  });
}
addEventListener('scroll',onScroll,{passive:true});
onScroll();

// Hero deep-time dial.
const heroActs=[
  {age:'540 Ma',era:'Cambrian · ocean floor',story:'Mud and sand arrive in deep-water avalanches. Arran’s oldest visible pages begin as soft sediment.',magma:0,ice:0},
  {age:'480 Ma',era:'Ordovician · collision',story:'Ocean closes. The sediment is buried, folded and metamorphosed as continents converge.',magma:0,ice:0},
  {age:'400 Ma',era:'Devonian · red rivers',story:'Mountains erode into braided rivers. Iron-stained sand and gravel spread across a warm, dry landscape.',magma:0,ice:0},
  {age:'330 Ma',era:'Carboniferous · tropical shore',story:'Limestone, mud, coal-bearing strata and volcanic rocks form near the equator.',magma:.15,ice:0},
  {age:'260 Ma',era:'Permian · red desert',story:'Dunes and flash floods build the New Red Sandstone as the land sits near 13° north.',magma:0,ice:0},
  {age:'~60 Ma',era:'Palaeogene · magma rises',story:'Granite and a central ring-complex intrude as the North Atlantic begins to open.',magma:1,ice:0},
  {age:'15,000 years',era:'Ice Age · the sculptor',story:'Glaciers cut corries, arêtes and U-shaped glens into rock already hundreds of millions of years old.',magma:.35,ice:1},
  {age:'Now',era:'Present · the readable island',story:'Erosion has stripped away the cover. Roads and shores now cut across the exposed pages.',magma:.5,ice:0}
];
function setHero(index){
  const act=heroActs[Number(index)];
  $('#heroAge').textContent=act.age;
  $('#heroEra').textContent=act.era;
  $('#heroStory').textContent=act.story;
  $('#heroMagma').style.opacity=act.magma;
  $('#heroIce').style.opacity=act.ice;
  $('#heroTime').setAttribute('aria-valuetext',`${act.era}, ${act.age}`);
}
$('#heroTime').addEventListener('input',event=>setHero(event.target.value));
setHero(7);

// Interpretive geological map.
const units={
  granite:{period:'Palaeogene · intrusive igneous',name:'North Arran Granite',text:'Around 58 million years ago, magma was emplaced into older Dalradian rocks and cooled slowly as a near-circular pluton. Its coarse outer granite and finer inner granite now carry Goatfell and the northern ridges.',process:'Magma cooled slowly below ground',landscape:'High, jointed, glacially sharpened mountains',look:'Pale granite, quartz, feldspar and mica',clue:'The circular outcrop and two granite textures'},
  schist:{period:'Cambrian · metamorphosed sediment',name:'Dalradian schist',text:'Deep-water mud and sand were buried during the Caledonian mountain-building episode. Pressure and heat changed them, yet graded beds still betray their sedimentary origin.',process:'Turbidites buried, folded and metamorphosed',landscape:'Hard ridges and craggy northern ground',look:'Layered grey-green rock with a sheen',clue:'Coarse-to-fine grading survives metamorphism'},
  oldred:{period:'Devonian · continental sediment',name:'Old Red Sandstone',text:'Braided rivers shed sand and conglomerate from eroding Caledonian mountains. Iron oxides coloured the grains red in a warm, seasonal landscape.',process:'River deposition, soil formation and oxidation',landscape:'Ridges, shore platforms and red cliffs',look:'Red beds, pebbles, channels and cornstone',clue:'Cross-beds record flowing water'},
  central:{period:'Palaeogene · explosive igneous centre',name:'Central Arran Ring-complex',text:'Magma invaded older sedimentary rocks in pulses. Lavas, tuffs, breccias, granite, gabbro and hybrid rocks preserve the eroded plumbing of a volcanic centre.',process:'Intrusion, eruption, collapse and magma mingling',landscape:'Complex high ground around Ard Bheinn',look:'Contrasting dark and pale igneous rocks',clue:'Arcuate intrusions and huge displaced blocks'},
  carbon:{period:'Carboniferous · tropical margin',name:'Carboniferous rocks',text:'Arran crossed equatorial settings where rivers, lagoons, shallow seas and volcanic episodes alternated. Limestone, mudstone, sandstone, coal measures and lavas preserve the changes.',process:'Sea-level cycles, sedimentation and volcanism',landscape:'Low coastal ground, especially near Corrie',look:'Limestone, fossils, root traces and lava',clue:'Repeated switches between land and sea'},
  permian:{period:'Permian–Triassic · continental desert',name:'New Red Sandstone',text:'Wind-blown dunes and violent flash floods accumulated as Pangaea’s interior dried. Later dykes and sills cut the package when Atlantic rifting began.',process:'Desert dunes, wadis and later intrusion',landscape:'Rounded southern hills and red shore cliffs',look:'Red cross-bedded sandstone and conglomerate',clue:'Large cross-sets reveal migrating dunes'}
};
function setUnit(key){
  const unit=units[key];
  $$('.geo-unit').forEach(region=>{
    const on=region.dataset.unit===key;
    region.classList.toggle('selected',on);
    pressed(region,on);
  });
  $('#unitPeriod').textContent=unit.period;
  $('#unitName').textContent=unit.name;
  $('#unitText').textContent=unit.text;
  $('#unitProcess').textContent=unit.process;
  $('#unitLandscape').textContent=unit.landscape;
  $('#unitLook').textContent=unit.look;
  $('#unitClue').textContent=unit.clue;
}
const geoUnits=$$('.geo-unit');
geoUnits.forEach((region,index)=>{
  region.setAttribute('aria-controls','unitDetails');
  region.addEventListener('click',()=>setUnit(region.dataset.unit));
  region.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      setUnit(region.dataset.unit);
    }else if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)){
      event.preventDefault();
      const delta=(event.key==='ArrowRight'||event.key==='ArrowDown')?1:-1;
      geoUnits[(index+delta+geoUnits.length)%geoUnits.length].focus();
    }
  });
});
$('.map-info').id='unitDetails';

function setLayer(layer){
  $$('[data-layer]').forEach(button=>{
    const on=button.dataset.layer===layer;
    button.classList.toggle('on',on);
    pressed(button,on);
  });
  $('#bedrockLayer').style.opacity=layer==='bedrock'?1:.22;
  $('#bedrockLayer').style.pointerEvents=layer==='bedrock'?'auto':'none';
  $('#iceLayer').style.opacity=layer==='ice'?1:0;
  $('#peopleLayer').style.opacity=layer==='people'?1:0;
}
$$('[data-layer]').forEach(button=>button.addEventListener('click',()=>setLayer(button.dataset.layer)));
setLayer('bedrock');
setUnit('granite');

// Geological time machine.
const acts=[
  {age:'540 Ma',period:'Cambrian · earliest visible page',place:'Far southern latitudes',no:'Act 1 · sediment',title:'An ocean-floor avalanche',text:'Mud and sand rush down the continental slope in dense turbidity currents. Layer after layer settles in a deep ocean. These beds will become the Dalradian rocks of northern Arran.',rock:'Mudstone & sandstone',clue:'Graded beds & schist',scene:'ocean'},
  {age:'480 Ma',period:'Ordovician · Caledonian collision',place:'Southern hemisphere',no:'Act 2 · collision',title:'An ocean closes',text:'Continents converge. The ocean-floor pile is buried, compressed, folded and heated. The sediment becomes metasediment while a great mountain chain grows above it.',rock:'Schist & metagreywacke',clue:'Folds, cleavage, metamorphism',scene:'collision'},
  {age:'400 Ma',period:'Devonian · Old Red Sandstone',place:'Near the tropics',no:'Act 3 · erosion',title:'Mountains become red rivers',text:'The Caledonian mountains wear down. Braided rivers move gravel and sand across broad basins; oxygen and iron paint the sediment red.',rock:'Sandstone & conglomerate',clue:'Channels, pebbles, red oxidation',scene:'river'},
  {age:'330 Ma',period:'Carboniferous · shifting coast',place:'Near the equator',no:'Act 4 · tropical cycles',title:'Sea, swamp, lava — repeat',text:'Arran moves through equatorial environments. Rivers, lagoons, shallow marine limestone, coal-bearing sediment and volcanic rocks stack into a restless archive.',rock:'Limestone, coal measures, lava',clue:'Fossils, roots & repeated cycles',scene:'tropical'},
  {age:'260 Ma',period:'Permian · New Red Sandstone',place:'About 13° north',no:'Act 5 · desert',title:'A red desert crosses Pangaea',text:'Wind drives dunes across an arid interior and flash floods spill from nearby uplands. Cross-bedded sandstone preserves the migration of each dune.',rock:'Dune sandstone & breccia',clue:'Large cross-beds and footprints',scene:'desert'},
  {age:'~60 Ma',period:'Palaeogene · North Atlantic rifting',place:'Temperate northern latitudes',no:'Act 6 · magma',title:'Magma finds every weakness',text:'As the North Atlantic starts to open, magma rises. A granite pluton swells beneath northern Arran; the central complex erupts, collapses and mixes contrasting melts.',rock:'Granite, gabbro, tuff & sill',clue:'Ring intrusions, dykes, baked rock',scene:'volcano'},
  {age:'15,000 yr',period:'Late Devensian · glaciation',place:'About 55° north',no:'Act 7 · ice',title:'A slow river of stone and ice',text:'Ice follows old weaknesses, plucking jointed granite and grinding the valleys wide. Corries bite backwards and ridges sharpen between them.',rock:'Till, moraine & outwash',clue:'U-shaped glens, arêtes, corries',scene:'glacier'},
  {age:'Now',period:'Holocene · exposed archive',place:'55.6° north',no:'Act 8 · reading',title:'Erosion opens the book',text:'The cover has gone. Beaches, burns, quarries and road cuttings expose contacts between worlds. People learn to read them — and inherit responsibility for the evidence.',rock:'Soils, peat & modern sediment',clue:'The whole island, read in context',scene:'present'}
];
const timeCanvas=$('#timeCanvas');
const ctx=timeCanvas.getContext('2d');
const eraButtons=$('#eraButtons');
eraButtons.setAttribute('role','group');
eraButtons.setAttribute('aria-label','Choose a geological act');
let currentAct=0;
let timeVisible=false;
let anim=0;

acts.forEach((act,index)=>{
  const button=document.createElement('button');
  button.type='button';
  button.className='era-dot'+(index===0?' on':'');
  button.textContent=`${index+1} · ${act.scene}`;
  button.setAttribute('aria-controls','timeCanvas actDetails');
  pressed(button,index===0);
  button.addEventListener('click',()=>setAct(index));
  eraButtons.append(button);
});
$('.act-card').id='actDetails';

function setAct(index){
  currentAct=Number(index);
  const act=acts[currentAct];
  $('#timeRange').value=currentAct;
  $('#timeAge').textContent=act.age;
  $('#timePeriod').textContent=act.period;
  $('#timePlace').textContent=act.place;
  $('#actNo').textContent=act.no;
  $('#actTitle').textContent=act.title;
  $('#actText').textContent=act.text;
  $('#actRock').textContent=act.rock;
  $('#actClue').textContent=act.clue;
  $('#timeRange').setAttribute('aria-valuetext',`${act.period}, ${act.age}`);
  timeCanvas.setAttribute('aria-label',`Geological reconstruction: ${act.period}. ${act.title}. ${act.text}`);
  $$('.era-dot').forEach((button,buttonIndex)=>{
    const on=buttonIndex===currentAct;
    button.classList.toggle('on',on);
    pressed(button,on);
  });
  drawTime(reduce.matches?0:performance.now());
}
$('#timeRange').addEventListener('input',event=>setAct(event.target.value));

function hills(points,color){
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.moveTo(0,timeCanvas.height);
  points.forEach(point=>ctx.lineTo(point[0],point[1]));
  ctx.lineTo(timeCanvas.width,timeCanvas.height);
  ctx.closePath();
  ctx.fill();
}

function drawTime(t=0){
  const w=timeCanvas.width;
  const h=timeCanvas.height;
  const act=acts[currentAct];
  ctx.clearRect(0,0,w,h);
  let sky='#183046';
  if(act.scene==='desert') sky='#26394a';
  if(act.scene==='volcano') sky='#251f27';
  if(act.scene==='glacier') sky='#18303e';
  ctx.fillStyle=sky;
  ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#d8c37f';
  ctx.beginPath();
  ctx.arc(w*.78,h*.2,35,0,Math.PI*2);
  ctx.fill();

  if(act.scene==='ocean'){
    ctx.fillStyle='#157088';ctx.fillRect(0,h*.46,w,h*.54);
    for(let k=0;k<5;k++){
      ctx.strokeStyle=['#b89758','#8f8061','#6c826e'][k%3];ctx.lineWidth=9;ctx.beginPath();
      ctx.moveTo(-30,h*.55+k*24);ctx.quadraticCurveTo(w*.35,h*.62+k*17,w*.62,h*.72+k*13);ctx.lineTo(w+30,h*.58+k*18);ctx.stroke();
    }
    for(let k=0;k<38;k++){
      const x=(k*113+t*.02)%w;const y=h*.49+((k*67)%220);
      ctx.fillStyle='rgba(230,236,220,.18)';ctx.fillRect(x,y,2,2);
    }
  }else if(act.scene==='collision'){
    hills([[0,340],[120,230],[220,322],[350,145],[480,320],[610,190],[720,315],[850,180],[960,330]],'#536064');
    hills([[0,390],[170,268],[300,390],[505,222],[680,385],[820,260],[960,390]],'#2e3d42');
    ctx.strokeStyle='#e0d8bd';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(340,150);ctx.lineTo(390,225);ctx.lineTo(430,190);ctx.stroke();
  }else if(act.scene==='river'){
    hills([[0,330],[230,230],[420,344],[650,250],[960,330]],'#6f5a4c');
    hills([[0,395],[260,335],[470,380],[720,320],[960,365]],'#9a654b');
    ctx.fillStyle='#1d7180';ctx.beginPath();ctx.moveTo(0,410);
    for(let x=0;x<=w;x+=80) ctx.lineTo(x,410+Math.sin(x*.025+t*.001)*20);
    ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();
  }else if(act.scene==='tropical'){
    ctx.fillStyle='#1d6978';ctx.fillRect(0,h*.58,w,h*.42);
    hills([[0,360],[170,280],[360,350],[580,295],[800,345],[960,285]],'#526e57');
    for(let x=70;x<w;x+=150){
      ctx.strokeStyle='#253f2d';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(x,360);ctx.lineTo(x-8,285);ctx.stroke();
      ctx.fillStyle='#416a46';ctx.beginPath();ctx.arc(x-8,280,28,0,Math.PI*2);ctx.fill();
    }
  }else if(act.scene==='desert'){
    for(let k=0;k<4;k++){
      ctx.fillStyle=['#a96d4e','#b77b57','#8e5a46','#c18c60'][k];ctx.beginPath();ctx.moveTo(0,h*(.56+k*.09));
      ctx.quadraticCurveTo(w*(.24+k*.08),h*(.36+k*.08),w*.55,h*(.58+k*.05));
      ctx.quadraticCurveTo(w*.79,h*(.74-k*.03),w,h*(.48+k*.1));ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();
    }
  }else if(act.scene==='volcano'){
    hills([[0,390],[240,310],[380,355],[540,165],[660,360],[820,300],[960,390]],'#3f4445');
    ctx.fillStyle='#e77e5c';ctx.beginPath();ctx.moveTo(520,310);ctx.quadraticCurveTo(550,240+Math.sin(t*.002)*8,574,310);ctx.lineTo(622,520);ctx.lineTo(478,520);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(210,160,140,.23)';
    for(let k=0;k<6;k++){ctx.beginPath();ctx.arc(550+Math.sin(k*3+t*.001)*35,130-k*18+(t*.02)%80,24+k*8,0,Math.PI*2);ctx.fill();}
  }else if(act.scene==='glacier'){
    hills([[0,370],[170,180],[320,355],[480,125],[640,345],[820,178],[960,370]],'#586b73');
    hills([[0,430],[220,310],[410,420],[590,280],[780,415],[960,310]],'#35484d');
    ctx.fillStyle='rgba(194,224,225,.78)';ctx.beginPath();ctx.moveTo(425,240);ctx.lineTo(535,240);ctx.lineTo(675,h);ctx.lineTo(295,h);ctx.closePath();ctx.fill();
  }else{
    hills([[0,400],[130,300],[220,365],[350,190],[450,350],[585,225],[720,360],[835,275],[960,390]],'#50666b');
    hills([[0,445],[220,375],[430,440],[635,350],[820,430],[960,380]],'#213a39');
    ctx.fillStyle='#365d62';ctx.beginPath();ctx.moveTo(430,330);ctx.quadraticCurveTo(480,395,520,h);ctx.lineTo(380,h);ctx.closePath();ctx.fill();
  }
  ctx.fillStyle='rgba(255,255,255,.6)';ctx.font='700 13px ui-monospace';ctx.fillText(act.period.toUpperCase(),24,34);
}

function loop(timestamp){
  drawTime(timestamp);
  if(timeVisible&&!reduce.matches) anim=requestAnimationFrame(loop);
  else anim=0;
}
function syncTimeMotion(){
  if(anim){cancelAnimationFrame(anim);anim=0;}
  if(timeVisible&&!reduce.matches) anim=requestAnimationFrame(loop);
  else drawTime(0);
}
if('IntersectionObserver' in window){
  new IntersectionObserver(entries=>{
    timeVisible=entries[0].isIntersecting;
    syncTimeMotion();
  },{threshold:.05}).observe(timeCanvas);
}else{
  timeVisible=true;
}
setAct(0);
syncTimeMotion();

// Hutton's unconformity.
const hData=[
  ['Mud becomes layered rock','About 520 million years ago, sediment accumulated on a deep ocean floor. Burial and metamorphism changed it into hard Dalradian metasediment.'],
  ['Continents squeeze the pile','During mountain building the stack is buried, heated, folded and tilted. Beds that began horizontal swing steeply.'],
  ['A landscape is cut away','Uplift exposes the old rocks. Weather and erosion plane off the tilted beds. The missing material — and time — becomes an invisible chapter.'],
  ['A younger river crosses the scar','Around 360 million years ago, Kinnesswood river sandstone accumulated across the eroded surface. The angle between packages preserves the whole sequence.']
];
let hStep=0;
let hTimer=0;
const huttonScene=$('#huttonScene');
huttonScene.setAttribute('role','group');
huttonScene.setAttribute('aria-describedby','huttonStepText');
$('.hutton-steps').setAttribute('role','group');
$('.hutton-steps').setAttribute('aria-label','Build Hutton’s unconformity');
$('#huttonStepTitle').parentElement.setAttribute('aria-live','polite');
$('#huttonTitle').textContent='The gap that made deep time visible.';
$('#hutton .intro').textContent='James Hutton came looking for a boundary between kinds of rock. On Newton Shore in 1787 he found his first unconformity: steep older beds, then a broken and eroded surface, then gently inclined younger sandstone. The outcrop records events that cannot be squeezed into a short history.';

function setHutton(index){
  hStep=Number(index);
  huttonScene.dataset.step=hStep;
  $$('.h-step').forEach((button,buttonIndex)=>{
    const on=buttonIndex===hStep;
    button.classList.toggle('on',on);
    pressed(button,on);
  });
  $('#huttonStepTitle').textContent=hData[hStep][0];
  $('#huttonStepText').textContent=hData[hStep][1];
  huttonScene.setAttribute('aria-label',`Hutton’s unconformity, step ${hStep+1} of 4: ${hData[hStep][0]}. ${hData[hStep][1]}`);
}
$$('.h-step').forEach(button=>button.addEventListener('click',()=>{
  clearInterval(hTimer);
  setHutton(button.dataset.step);
}));
$('#playHutton').addEventListener('click',()=>{
  clearInterval(hTimer);
  if(reduce.matches){setHutton(3);return;}
  setHutton(0);
  hTimer=setInterval(()=>{
    if(hStep>=3){clearInterval(hTimer);return;}
    setHutton(hStep+1);
  },850);
});
setHutton(0);

function onMotionPreferenceChange(){
  syncTimeMotion();
  if(reduce.matches) clearInterval(hTimer);
}
if(reduce.addEventListener) reduce.addEventListener('change',onMotionPreferenceChange);
else reduce.addListener(onMotionPreferenceChange);

// Rock cabinet.
const rocks=[
  {name:'Granite',kind:'Pluton',age:'~58 Ma',period:'Palaeogene · intrusive igneous',desc:'A mosaic of interlocking quartz, feldspar and mica, crystallised slowly in a pluton beneath northern Arran. The crystal size is a cooling-rate clock.',formation:'Magma cooled slowly below ground',find:'Goatfell and the northern mountain core',shapes:'Rugged peaks, acidic thin soils and jointed tors',bg:'#9d82a4',pattern:'granite'},
  {name:'Dalradian schist',kind:'Metamorphic',age:'~520 Ma',period:'Cambrian sediment · later metamorphism',desc:'Once deep-ocean mud and sand; later buried, folded and recrystallised. A silky sheen and aligned minerals record pressure while graded beds remember the original current.',formation:'Turbidites altered by heat and pressure',find:'Around the northern granite and Lochranza',shapes:'Hard ridges and dark, layered shore outcrops',bg:'#62766d',pattern:'bands'},
  {name:'Red sandstone',kind:'Sedimentary',age:'~400–250 Ma',period:'Devonian to Triassic · continental sediment',desc:'Quartz grains and pebbles laid down by rivers, flash floods and dunes. Iron oxides coat the grains, turning large parts of southern Arran warm red-brown.',formation:'Sand compacted and cemented after deposition',find:'Broad belts through central and southern Arran',shapes:'Rounded hills, red cliffs and building stone',bg:'#aa654e',pattern:'cross'},
  {name:'Carboniferous limestone',kind:'Sedimentary',age:'~350–300 Ma',period:'Carboniferous · shallow sea',desc:'Carbonate mud and skeletal fragments accumulated when warm, shallow seas crossed the region. Fossils and repeated marine–terrestrial changes reveal moving shorelines.',formation:'Marine carbonate sediment lithified',find:'Especially on the Corrie shoreline',shapes:'Low coastal outcrops and fossil-bearing ledges',bg:'#75967a',pattern:'fossil'},
  {name:'Pitchstone',kind:'Volcanic glass',age:'~60 Ma',period:'Palaeogene · rapidly chilled magma',desc:'Dark green volcanic glass with tiny crystals. It fractures to exceptionally sharp edges — a geological material that became a prized Neolithic technology and exchange object.',formation:'Silica-rich melt cooled too fast for large crystals',find:'Dykes and sills, notably on eastern Arran',shapes:'Small dark outcrops; sharp prehistoric artefacts',bg:'#172326',pattern:'glass'},
  {name:'Dolerite',kind:'Shallow intrusion',age:'~60 Ma',period:'Palaeogene · dyke and sill',desc:'Medium-grained dark igneous rock frozen in sheets and fractures. Dykes and sills trace pathways used by magma during North Atlantic rifting.',formation:'Basaltic magma cooled in shallow cracks',find:'Dykes, sills and the Drumadoon escarpment',shapes:'Dark ribs, resistant cliffs and shore walls',bg:'#3e4d4e',pattern:'dolerite'}
];
function thumbStyle(rock){
  if(rock.pattern==='bands') return 'repeating-linear-gradient(22deg,#3c514b 0 5px,#8c9a89 5px 8px,#586b62 8px 13px)';
  if(rock.pattern==='cross') return 'repeating-linear-gradient(18deg,#9e5943 0 8px,#c57c58 8px 11px)';
  if(rock.pattern==='fossil') return `radial-gradient(ellipse at 40% 42%,transparent 0 8px,#d1c993 9px 11px,transparent 12px),${rock.bg}`;
  if(rock.pattern==='glass') return 'radial-gradient(circle at 32% 27%,#5d7770 0 2px,transparent 3px),linear-gradient(135deg,#304841,#101619)';
  if(rock.pattern==='dolerite') return 'repeating-linear-gradient(135deg,#2a3738 0 5px,#506061 5px 7px)';
  return `radial-gradient(circle at 28% 31%,#e2ccd6 0 3px,transparent 4px),radial-gradient(circle at 65% 55%,#5d5962 0 3px,transparent 4px),${rock.bg}`;
}
const rockList=$('#rockList');
rockList.setAttribute('role','group');
rockList.setAttribute('aria-label','Choose a rock specimen');
rocks.forEach((rock,index)=>{
  const button=document.createElement('button');
  button.type='button';
  button.className='rock-choice'+(index===0?' on':'');
  button.innerHTML=`<span class="rock-thumb" aria-hidden="true" style="background:${thumbStyle(rock)}"></span><span><strong>${rock.name}</strong><small>${rock.kind}</small></span><time>${rock.age}</time>`;
  button.setAttribute('aria-controls','specimen');
  pressed(button,index===0);
  button.addEventListener('click',()=>setRock(index));
  rockList.append(button);
});
function setRock(index){
  const rock=rocks[Number(index)];
  $$('.rock-choice').forEach((button,buttonIndex)=>{
    const on=buttonIndex===Number(index);
    button.classList.toggle('on',on);
    pressed(button,on);
  });
  $('#rockName').textContent=rock.name;
  $('#rockPeriod').textContent=rock.period;
  $('#rockDesc').textContent=rock.desc;
  $('#rockFormation').textContent=rock.formation;
  $('#rockFind').textContent=rock.find;
  $('#rockShapes').textContent=rock.shapes;
  const stone=$('#stone');
  stone.style.background=rock.bg;
  stone.style.backgroundImage=thumbStyle(rock);
  stone.style.backgroundSize=rock.pattern==='granite'?'86px 73px':'auto';
}
$('#specimen').addEventListener('pointermove',event=>{
  if(reduce.matches) return;
  const rect=event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--lx',(event.clientX-rect.left)/rect.width*100+'%');
  event.currentTarget.style.setProperty('--ly',(event.clientY-rect.top)/rect.height*100+'%');
});
setRock(0);

// Glacier laboratory.
function setIce(value){
  const work=Number(value);
  const mid=78-work*.47;
  const left=12+work*.09;
  $('#valley').style.setProperty('--mid-cut',mid+'%');
  $('#valley').style.setProperty('--left-cut',left+'%');
  $('#valley').style.setProperty('--ice-opacity',work<12?0:work<75?.75:.1);
  $('.glacier').style.left=(34-work*.17)+'%';
  $('.glacier').style.right=(34-work*.17)+'%';
  let label;
  let readout;
  if(work===0){label='Before the ice · river-cut V';readout='0% glacial work';}
  else if(work<75){label='Glacier at work · quarry and grind';readout=`${work}% glacial work`;}
  else{label='After the ice · a broad U-shaped glen';readout=work===100?'100% · landscape revealed':`${work}% glacial work`;}
  $('#iceLabel').textContent=label;
  $('#iceReadout').textContent=readout;
  $('#iceRange').setAttribute('aria-valuetext',`${label}, ${readout}`);
}
$('#iceRange').addEventListener('input',event=>setIce(event.target.value));
setIce(0);

// Human history and changing material visual.
const people=[
  {era:'c. 4000–2500 BC · Neolithic',heading:'A glassy stone travels',text:'Arran pitchstone fractures to a razor edge. It becomes blades and flakes, then travels far beyond the island — evidence of exchange networks reaching Ireland, mainland Britain and Orkney.',name:'Pitchstone',copy:'Dark green volcanic glass: local in origin, widely travelled in prehistory.',aria:'Neolithic, around 4000 to 2500 BC',icon:`<svg viewBox="0 0 100 100"><path d="M23 81 47 13l26 20-9 15 13 10-35 29Z" fill="#1c2d2b" stroke="#73958d" stroke-width="2"/><path d="m47 13-2 36 19-1M45 49 23 81M45 49l32 9" stroke="#91b0a6" fill="none"/><path d="M53 21 65 31" stroke="#d5e1dc"/></svg>`},
  {era:'c. 3000–2000 BC · monuments',heading:'Colour builds a cosmology',text:'At stone circles and tombs, geology is chosen. Grey-white granite and red sandstone can stand together as a miniature of the island: northern mountains and southern ground made ceremonial.',name:'Granite + sandstone',copy:'At Auchagallon, most stones are red sandstone; two are grey granite — colour and source mattered.',aria:'Neolithic and Bronze Age monuments, around 3000 to 2000 BC',icon:`<svg viewBox="0 0 100 100"><ellipse cx="50" cy="77" rx="38" ry="9" fill="#263134"/><g stroke="#d8ccb3" stroke-width="1.5"><path d="M25 72 28 28l12-3 4 47Z" fill="#a86450"/><path d="m47 72 2-51 13 2 4 49Z" fill="#8d8992"/><path d="m70 72 3-39 10 4-1 35Z" fill="#a86450"/></g></svg>`},
  {era:'c. 800 BC–AD 900 · settled ground',heading:'Defence follows topography',text:'Forts and duns use naturally strong knolls, ridges and coastal views. Fields work around drainage and soil inherited from bedrock and glacial deposits; settlement reads the same terrain as a geologist.',name:'Landform',copy:'A crag, slope or isolated knoll can do half the work of a wall; soil and water decide where farming lasts.',aria:'Iron Age to early medieval settlement',icon:`<svg viewBox="0 0 100 100"><path d="M8 79Q28 48 49 51T92 79Z" fill="#42564d"/><path d="M27 53 49 26l26 29" fill="#252f32" stroke="#839289" stroke-width="2"/><path d="M34 48v-13h9v7h14v-9h9v16" fill="none" stroke="#d8c58e" stroke-width="3"/></svg>`},
  {era:'AD 1840–1944 · extraction',heading:'A heavy vein becomes industry',text:'Glen Sannox baryte veins, up to three metres wide, were mined from 1840 to 1862 and again from 1918. Annual production sometimes exceeded 8,000 tonnes before final abandonment in 1944; railway, pier and ruins remain in the landscape.',name:'Baryte',copy:'Dense white barium sulphate: a mineral vein shaped employment, transport and industrial archaeology.',aria:'Industrial mining era, 1840 to 1944',icon:`<svg viewBox="0 0 100 100"><path d="M15 74 37 28l19 20 13-15 17 41Z" fill="#324145"/><path d="m34 63 14-28 11 23 12-20" stroke="#e5e1d1" stroke-width="8" fill="none"/><path d="M14 81h72M23 75V61h9v14M71 75V54h8v21" stroke="#a68964" stroke-width="3"/></svg>`},
  {era:'2025 → future · stewardship',heading:'The outcrop becomes a promise',text:'UNESCO Global Geopark status does not put the island under glass. It asks Arran to connect protection, education, local culture and sustainable development — and to keep proving that the relationship works.',name:'Context',copy:'The protected object is not just a loose specimen: it is the link between rock, landscape, habitat, history and community.',aria:'UNESCO Global Geopark era, 2025 to future',icon:`<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="#193038" stroke="#73d3dd" stroke-width="2"/><path d="M16 50h68M50 16c13 15 13 53 0 68M50 16c-13 15-13 53 0 68" fill="none" stroke="#73d3dd"/><path d="M36 61c-4-17 5-28 25-31 3 19-5 31-25 31Z" fill="#719476"/><path d="m38 60 18-21" stroke="#d6dfcf"/></svg>`}
];
function setPeople(index){
  const i=Number(index);
  const era=people[i];
  $('#peopleRange').value=i;
  $('#peopleEra').textContent=era.era;
  $('#peopleHeading').textContent=era.heading;
  $('#peopleText').textContent=era.text;
  $('#materialName').textContent=era.name;
  $('#materialCopy').textContent=era.copy;
  $('#materialIcon').innerHTML=era.icon;
  $('#peopleRange').setAttribute('aria-valuetext',era.aria);
}
$('#peopleRange').addEventListener('input',event=>setPeople(event.target.value));
setPeople(0);

// Field routes.
const routes=[
  {title:'Hutton’s Unconformity',kicker:'Walk 1 · north-west',text:'Stand where steep Dalradian beds meet younger sandstone and reconstruct the four-act sequence that changed how scientists understood the age and workings of the Earth.',read:'Tilt, erosion, renewed deposition',terrain:'Road, path and rocky shore',jump:'~160 million years'},
  {title:'North Arran',kicker:'Walk 2 · north-east',text:'Discover industrial remains, the boundary of the granite, and a giant Carboniferous trackway made by Arthropleura — the largest land invertebrate known.',read:'Granite contact, mine remains, trackway',terrain:'Mixed paths and rough coast',jump:'~300 million years'},
  {title:'Corrie Shoreline',kicker:'Walk 3 · east coast',text:'Walk through roughly 100 million years from tropical seas and fossil-rich limestone to rivers, lava and stormy desert. The shore is a natural section through changing environments.',read:'Fossils, limestone, lava, red beds',terrain:'Rocky and tidally affected shore',jump:'~100 million years'},
  {title:'Glen Rosa',kicker:'Walk 4 · central north',text:'Enter the great U-shaped valley and read the erosive power of ice in corries, hanging valleys, sharpened ridges and the broad glen beneath the granite peaks.',read:'U-shape, corries, arêtes, moraine',terrain:'Mountain path; conditions change quickly',jump:'Last Ice Age'},
  {title:'King’s Cave & Drumadoon',kicker:'Walk 5 · west coast',text:'Meet the sheer cliff of the Drumadoon Sill, sea caves and evidence of the mysterious “hand-beast” — Chirotherium, a reptile whose track looks uncannily hand-like.',read:'Sill, caves and Triassic tracks',terrain:'Forest path and rough rocky shore',jump:'~240 million years'},
  {title:'Kildonan Shore',kicker:'Walk 6 · south coast',text:'Explore evidence for a continent beginning to split: sandstone cut by igneous sheets, plus ancient footprints. The magma plumbing anticipates the opening North Atlantic.',read:'Dykes, sills, sandstone and footprints',terrain:'Coastal rock platform; check tides',jump:'Triassic → Palaeogene'}
];
const routeTabs=$('#routeTabs');
routeTabs.setAttribute('role','group');
routeTabs.setAttribute('aria-label','Choose a Geopark field route');
$('.route-copy').id='routeDetails';
routes.forEach((route,index)=>{
  const button=document.createElement('button');
  button.type='button';
  button.className='route-button'+(index===0?' on':'');
  button.textContent=`${index+1} · ${route.title}`;
  button.setAttribute('aria-controls','routeDetails');
  pressed(button,index===0);
  button.addEventListener('click',()=>setRoute(index));
  routeTabs.append(button);
});
const routePins=$$('.route-pin');
routePins.forEach((pin,index)=>{
  pin.setAttribute('aria-controls','routeDetails');
  pressed(pin,index===0);
  const hit=document.createElementNS('http://www.w3.org/2000/svg','circle');
  hit.setAttribute('class','route-hit');
  hit.setAttribute('r','34');
  hit.setAttribute('aria-hidden','true');
  pin.insertBefore(hit,pin.firstChild);
  pin.addEventListener('click',()=>setRoute(Number(pin.dataset.route)));
  pin.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      setRoute(Number(pin.dataset.route));
    }else if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)){
      event.preventDefault();
      const delta=(event.key==='ArrowRight'||event.key==='ArrowDown')?1:-1;
      routePins[(index+delta+routePins.length)%routePins.length].focus();
    }
  });
});
function setRoute(index){
  const i=Number(index);
  const route=routes[i];
  $$('.route-button').forEach((button,buttonIndex)=>{
    const on=buttonIndex===i;
    button.classList.toggle('on',on);
    pressed(button,on);
  });
  routePins.forEach((pin,pinIndex)=>{
    const on=pinIndex===i;
    pin.classList.toggle('on',on);
    pressed(pin,on);
  });
  $('#routeTitle').textContent=route.title;
  $('#routeKicker').textContent=route.kicker;
  $('#routeText').textContent=route.text;
  $('#routeRead').textContent=route.read;
  $('#routeTerrain').textContent=route.terrain;
  $('#routeJump').textContent=route.jump;
}
setRoute(0);

// Existing static buttons live outside forms, but an explicit type prevents a
// future wrapper form from silently changing their behaviour.
$$('button').forEach(button=>button.type='button');
})();
