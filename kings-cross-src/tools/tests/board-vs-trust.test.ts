import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { AnchorMap } from '../../core/anchors.ts';
import type { KxData } from '../../core/osm.ts';
import { boardRows } from '../../web/src/board.ts';
import type { BoardService } from '../../web/src/board.ts';
import type { RecordedEvent } from '../../web/src/feed.ts';
import { agreementOptions, compareBoardToTrust, createBoardObserver, movementService, platformNumber, replayBoard, trustMovements } from '../board-vs-trust.ts';
import type { BoardObservation, TrustMovement } from '../board-vs-trust.ts';

// Hand-written synthetic services/events only; no recording data is a fixture.
const at=Date.parse('2026-11-09T10:00:00Z');
const service=(extra:Partial<BoardService>={}):BoardService=>({uid:'SYN001',headcode:'1Z01',operator:'GR',category:'XX',date:'2026-11-09',serviceDate:'2026-11-09',stp:'P',startDate:'2026-11-01',endDate:'2026-11-30',platform:'4',origin:'ALPHA',destination:'KNGX',arrival:'10:00:00',departure:null,publicArrival:'10:00:00',publicDeparture:null,arrivalMs:at,departureMs:null,publicArrivalMs:at,publicDepartureMs:null,...extra});
const movement=(extra:Partial<TrustMovement>={}):TrustMovement=>({receivedAtMs:at+1000,actualMs:at,plannedMs:at,headcode:'1Z01',trainId:'synthetic-1',uid:'SYN001',date:'2026-11-09',serviceDate:'2026-11-09',eventType:'ARRIVAL',platform:4,...extra});
const observation=(extra:Partial<BoardObservation>={}):BoardObservation=>({startMs:at+3000,endMs:at+5000,section:'platform',trainId:1,headcode:'1Z01',platforms:[4],uid:'SYN001',...extra});
const options={fromMs:at-10000,toMs:at+10000,recordingStartMs:at-60000,recordingEndMs:at+60000,withinMs:10000,stepMs:250};

test('TRUST selection ignores other stations streams and activations and deduplicates corrected movements',()=>{
  const e={kind:'trust',area:'SYN',type:'movement',...movement(),platform:'04'};
  const rows=[{t:at,e},{t:at+1,e:{...e,actualMs:at+500}},{t:at,e:{...e,type:'activation'}},{t:at,e:{...e,area:'OTHER'}},{t:at,e:{...e,eventType:'PASS'}},{t:at,e:{...e,actualMs:null}}] as unknown as RecordedEvent[];
  const result=trustMovements(rows,'SYN');
  assert.equal(result.movements.length,1);assert.equal(result.movements[0]!.actualMs,at+500);
  assert.equal(result.movements[0]!.platform,4);assert.equal(result.duplicates,1);assert.equal(result.missingActual,1);
  for(const p of ['bad','-1','11','4/5',null])assert.equal(platformNumber(p),null);
});

test('reference matching uses UID and service date before a repeated headcode nearest-time guess',()=>{
  const calls=[service(),service({uid:'SYN002',arrivalMs:at+3600000})];
  assert.equal(movementService(movement({plannedMs:at+3600000}),calls)?.uid,'SYN001');
  assert.equal(movementService(movement({uid:null,plannedMs:at+3600000}),calls)?.uid,'SYN002');
  assert.equal(movementService(movement({uid:'missing'}),calls),undefined);
  assert.equal(movementService(movement({serviceDate:'2026-11-10'}),calls),undefined);
});

test('board observation intervals exclude Due rows and split disappearance rename and platform changes',()=>{
  const map:AnchorMap={area:'SYN',sources:[],anchors:[],unmapped:[]};
  const observer=createBoardObserver();
  const rows=boardRows([],map,{mode:'replay',nowMs:at-1000,services:[service()]});
  assert.equal(rows.due.length,1);observer.observe(rows);assert.equal(observer.intervals().length,0);
  rows.timeMs=at;rows.platforms[4]!.trains.push({trainId:1,headcode:'1Z01',state:'standing',platform:4});observer.observe(rows);
  rows.timeMs=at+250;observer.observe(rows);assert.equal(observer.intervals()[0]!.endMs,at+250);
  rows.timeMs=at+500;rows.platforms[4]!.trains=[];observer.observe(rows);
  rows.timeMs=at+750;rows.platforms[5]!.trains.push({trainId:1,headcode:'1Z02',state:'standing',platform:5});observer.observe(rows);
  assert.equal(observer.intervals().length,2);assert.deepEqual(observer.intervals().map(o=>o.platforms),[[4],[5]]);
  assert.equal(observer.intervals()[0]!.endMs,at+250);
});

test('agreement measures a real observation lag and keeps actual versus booked platform differences separate',()=>{
  const report=compareBoardToTrust([movement()],[observation()],[service()],options);
  assert.equal(report.summary.agreementPercent,100);assert.equal(report.summary.medianLagSeconds,3);
  assert.equal(report.summary.timetablePlatformAgreementPercent,100);
  const changed=compareBoardToTrust([movement({platform:5})],[observation({platforms:[5]})],[service()],options);
  assert.equal(changed.summary.agreementPercent,100);assert.equal(changed.summary.timetablePlatformAgreementPercent,0);
  assert.match(changed.results[0]!.reasons.join(';'),/TRUST platform differs/);
  const wrong=compareBoardToTrust([movement()],[observation({platforms:[5]})],[service()],options);
  assert.equal(wrong.summary.agreementPercent,0);assert.match(wrong.results[0]!.reasons.join(';'),/observed board platform differs/);
});

test('agreement rejects wrong repeated-service identities and reports absent ambiguous and censored evidence',()=>{
  const mismatch=compareBoardToTrust([movement()],[observation({uid:'SYN002'})],[service()],options);
  assert.equal(mismatch.summary.agreementPercent,0);assert.match(mismatch.results[0]!.reasons.join(';'),/identity differs/);
  const absent=compareBoardToTrust([movement()],[observation({startMs:at+20000,endMs:at+21000})],[service()],options);
  assert.equal(absent.summary.headcodesShown,0);
  const ambiguous=compareBoardToTrust([movement()],[observation({section:'approaching',platforms:[4,5]})],[service()],options);
  assert.equal(ambiguous.summary.ambiguousApproachAgreement,1);assert.equal(ambiguous.summary.exactPlatformAgreement,0);
  const censored=compareBoardToTrust([movement()],[observation()],[service()],{...options,recordingEndMs:at+1000});
  assert.equal(censored.summary.fullyObserved,0);assert.equal(censored.summary.agreementPercent,null);
});

test('audit replay uses the real feed and board path and a gap checkpoint removes a stale platform train',async()=>{
  const data={nodes:[[1,0,0],[2,0,-1000]],rails:[{id:1,nodes:[1,2],service:'main',tunnel:false,bridge:false,layer:0}],platforms:[],buildings:[],buffers:[]} as unknown as KxData;
  const anchors:AnchorMap={area:'SYN',sources:['synthetic'],unmapped:[],anchors:[{berth:'1004',kind:'platform',from:1,to:2,t:0,point:[0,0],platform:'4',errorM:0,evidence:'synthetic'}]};
  const rows=[{t:at-2000,e:{kind:'snapshot',area:'SYN',berths:{'1004':'1Z01'}}},{t:at,e:{kind:'trust',area:'SYN',type:'movement',...movement(),platform:'4'}},{t:at+2000,e:{kind:'snapshot',area:'SYN',berths:{}}}] as unknown as RecordedEvent[];
  const replay=await replayBoard(data,rows,anchors,{date:'2026-11-09',calls:[service({realtime:{actualArrivalMs:at+99999}})]},at+3000);
  assert.ok(replay.observations.some(o=>o.headcode==='1Z01'&&o.platforms.includes(4)&&o.uid==='SYN001'));
  assert.ok(replay.observations.every(o=>o.endMs<at+2000));
  assert.equal(replay.services[0]!.realtime?.actualArrivalMs,at);
});

test('agreement CLI requires private scratch output bounded steps and explicit timezone timestamps',()=>{
  const out=fileURLToPath(new URL('../../../.scratch/board15-test',import.meta.url));
  const args=['--recording','synthetic.ndjson','--schedule','synthetic.json','--anchors','synthetic-anchors.json','--out',out];
  assert.equal(agreementOptions(args).withinMs,120000);
  for(const extra of [['--within-seconds','0'],['--step-seconds','2'],['--from','2026-11-09T10:00:00'],['--from','2026-11-09T11:00Z','--to','2026-11-09T10:00Z']])assert.throws(()=>agreementOptions([...args,...extra]));
  assert.throws(()=>agreementOptions([...args.slice(0,-1),'/tmp/public']));
});
