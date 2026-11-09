import assert from 'node:assert/strict';
import test from 'node:test';
import {frozenTrainEndpoint,checkedCaptureView} from '../train-capture.mjs';
import {createScheduleFeed} from '../../web/src/feed.ts';
import {matchService} from '../../core/schedule.ts';
import {createTrainKinds} from '../../web/src/trains-live.ts';
import {trainLayout} from '../../core/train.ts';

test('capture relay discovery loads the frozen replay timetable before the page chooses formations',async()=>{
 const date='2026-11-08',at=Date.parse(date+'T12:00:00Z');
 const call={date,serviceDate:date,uid:'SYNTHETIC',headcode:'1A01',operator:'GR',category:'XX',origin:'SYNTH',destination:'KNGX',platform:'10',
  stp:'P',startDate:date,endDate:date,arrival:null,departure:null,publicArrival:null,publicDeparture:null,arrivalMs:at,departureMs:null,publicArrivalMs:null,publicDepartureMs:null};
 const frozen={schedules:new Map([[date,{date,calls:[call]}]])},requests=[];
 const fetchImpl=async url=>{requests.push(String(url));const route=frozenTrainEndpoint(String(url),frozen);assert.ok(route,'all requests stay on the frozen relay');return new Response(route.body,{status:route.status??200,headers:{'content-type':route.type}});};
 // Deliberately omit relayPresent: main.ts discovers the relay, then awaits refresh,
 // exactly this path. A directly served /schedule alone does not test discovery.
 const feed=createScheduleFeed({mode:'replay',hostname:'127.0.0.1',date,fetchImpl,schedule:()=>1,unschedule:()=>{}});
 try{
  await feed.refresh();
  assert.deepEqual(requests,['/relay/health',`/relay/schedule?date=${date}`]);
  assert.equal(feed.services()?.length,1,'a successful capture health probe must expose the cached timetable');
  const kinds=createTrainKinds((description,time)=>matchService(description,time,feed.services()??[]));
  const length=kinds.lengthM('1A01',{id:1,timeMs:at});
  assert.equal(kinds.formationFor({id:1}).kind,'lner5','the platform-10 timetable cap must replace the 9-car default');
  assert.equal(length,trainLayout('lner5').length);
  assert.notEqual(length,trainLayout('lner9').length);
 }finally{feed.dispose();}
 const absent=createScheduleFeed({mode:'replay',hostname:'127.0.0.1',date:'2026-11-07',fetchImpl,schedule:()=>1,unschedule:()=>{}});
 try{await absent.refresh();assert.equal(absent.services(),undefined,'a genuinely absent day stays on fallback');}finally{absent.dispose();}
});

test('follow-camera failures retain named occluders across the CDP JSON boundary',()=>{
 const details=[{candidate:0,reason:'coach occluded',blocker:'Scene/terrain/cutting-wall',
  occluder:{distanceM:12.5,targetDistanceM:40,chain:[{name:'cutting-wall',type:'Mesh',userData:{source:'synthetic'}}]}}];
 const wire=JSON.parse(JSON.stringify({failure:{message:'no clear close follow view of leading coach',details}}));
 assert.throws(()=>checkedCaptureView(wire),error=>{assert.equal(error.message,wire.failure.message);assert.deepEqual(error.details,details);return true;});
 const clear={visibility:{clear:true},id:1};assert.equal(checkedCaptureView(clear),clear);
});
