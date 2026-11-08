// Private, deterministic evidence. Due rows never count as observations: the timetable
// must not be used to prove itself. Run with --help; all output stays in .scratch.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AnchorMap } from '../core/anchors.ts';
import { buildGraph } from '../core/graph.ts';
import { createMotion } from '../core/motion.ts';
import type { KxData } from '../core/osm.ts';
import { matchService, validDate } from '../core/schedule.ts';
import { approachPlatforms, boardRows } from '../web/src/board.ts';
import type { BoardRows, BoardService } from '../web/src/board.ts';
import { createReplayFeed, createScheduleFeed, parseRecording } from '../web/src/feed.ts';
import type { RecordedEvent } from '../web/src/feed.ts';
import { createTrainKinds } from '../web/src/trains-live.ts';
// This Node-only JS module also guards the evidence pack's private output paths.
const { safeOutputDirectory, writePrivateFile, within }: {
  safeOutputDirectory(root:string,directory:string):Promise<string>;
  writePrivateFile(file:string,body:string):Promise<void>;
  within(root:string,file:string):boolean;
} = await import(new URL('./evidence.mjs',import.meta.url).href);

const repo = fileURLToPath(new URL('../../', import.meta.url));
const numeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function platformNumber(value: unknown): number | null {
  const s = typeof value === 'string' ? value.trim() : '';
  return /^\d{1,2}$/.test(s) && Number(s) <= 10 ? Number(s) : null;
}
export interface TrustMovement {
  receivedAtMs: number; actualMs: number; plannedMs: number | null;
  headcode: string; trainId: string; uid: string | null; serviceDate: string | null; date: string | null;
  eventType: 'ARRIVAL' | 'DEPARTURE'; platform: number | null;
}
export interface BoardObservation {
  startMs: number; endMs: number; section: 'platform' | 'approaching' | 'departed';
  trainId: number; headcode: string; platforms: number[]; uid?: string;
}
/** Normalized TRUST records are already restricted by the relay to STANOX 54311. */
export function trustMovements(rows: readonly RecordedEvent[], area: string): { movements: TrustMovement[]; missingActual: number; duplicates: number } {
  const latest = new Map<string, TrustMovement>(); let missingActual = 0, duplicates = 0;
  for (const row of rows) {
    const e = object(row.e);
    if (e.kind !== 'trust' || e.area !== area || e.type !== 'movement' || !['ARRIVAL','DEPARTURE'].includes(String(e.eventType))) continue;
    if (!numeric(e.actualMs) || e.actualMs <= 0) { missingActual++; continue; }
    const movement: TrustMovement = { receivedAtMs: row.t, actualMs: e.actualMs, plannedMs: numeric(e.plannedMs) ? e.plannedMs : null,
      headcode: typeof e.headcode === 'string' ? e.headcode : '', trainId: typeof e.trainId === 'string' ? e.trainId : '',
      uid: typeof e.uid === 'string' ? e.uid : null, date: typeof e.date === 'string' ? e.date : null,
      serviceDate: typeof e.serviceDate === 'string' ? e.serviceDate : null, eventType: e.eventType as TrustMovement['eventType'], platform: platformNumber(e.platform) };
    const key = JSON.stringify([movement.trainId || movement.uid || movement.headcode, movement.serviceDate, movement.eventType, movement.plannedMs ?? movement.actualMs]);
    if (latest.has(key)) duplicates++;
    latest.set(key, movement);
  }
  return { movements: [...latest.values()].sort((a,b)=>a.actualMs-b.actualMs || a.headcode.localeCompare(b.headcode)), missingActual, duplicates };
}

export function movementService(m: TrustMovement, services: readonly BoardService[]): BoardService | undefined {
  const candidates = services.filter(s=>(!m.date || m.date===s.date) && (!m.serviceDate || m.serviceDate===s.serviceDate));
  if (m.uid) {
    const exact = candidates.filter(s=>s.uid===m.uid);
    return exact.length === 1 ? exact[0] : undefined;
  }
  return matchService(m.headcode, m.plannedMs ?? m.actualMs, candidates) as BoardService | undefined;
}

/** Consecutive equal rows become intervals. Distances/dwell labels are deliberately
 * omitted: they cannot change whether this headcode was shown on this platform. */
export function createBoardObserver() {
  const intervals: BoardObservation[] = [], open = new Map<string, BoardObservation>();
  return {
    observe(rows: BoardRows): void {
      const current: Omit<BoardObservation, 'startMs' | 'endMs'>[] = [
        ...rows.platforms.flatMap(p=>p.trains.map(r=>({ section: 'platform' as const, trainId:r.trainId, headcode:r.headcode, platforms:[p.platform], uid:r.uid }))),
        ...rows.approaching.map(r=>({ section:'approaching' as const, trainId:r.trainId, headcode:r.headcode, platforms:[...(r.platforms??[])], uid:r.uid })),
        ...rows.departed.map(r=>({ section:'departed' as const, trainId:r.trainId, headcode:r.headcode, platforms:r.platform===undefined?[]:[r.platform], uid:r.uid })),
      ];
      const seen = new Set<string>();
      for (const row of current) {
        const key=JSON.stringify(row); seen.add(key);
        const old=open.get(key);
        if (old) old.endMs=rows.timeMs;
        else { const interval={...row,startMs:rows.timeMs,endMs:rows.timeMs}; intervals.push(interval); open.set(key,interval); }
      }
      for (const key of open.keys()) if (!seen.has(key)) open.delete(key);
    },
    intervals: (): BoardObservation[] => intervals,
  };
}

const median = (values: number[]): number | null => { if (!values.length) return null; const sorted=[...values].sort((a,b)=>a-b), mid=Math.floor(sorted.length/2); return sorted.length%2 ? sorted[mid]! : (sorted[mid-1]!+sorted[mid]!)/2; };
export interface ComparisonOptions {
  fromMs: number; toMs: number; recordingStartMs: number; recordingEndMs: number; withinMs: number; stepMs: number;
}
export function compareBoardToTrust(movements: readonly TrustMovement[], observations: readonly BoardObservation[], services: readonly BoardService[],
  options: ComparisonOptions) {
  const results = movements.filter(m=>m.actualMs>=options.fromMs && m.actualMs<=options.toMs).map(m=>{
    const service=movementService(m,services), bookedPlatform=platformNumber(service?.platform);
    const expectedPlatform=m.platform ?? bookedPlatform;
    const candidates=observations.filter(o=>o.headcode===m.headcode && o.endMs>=m.actualMs-options.withinMs && o.startMs<=m.actualMs+options.withinMs)
      .map(o=>{
        const nearestMs=Math.max(o.startMs,Math.min(o.endMs,o.startMs+Math.round((m.actualMs-o.startMs)/options.stepMs)*options.stepMs));
        return { ...o, nearestMs, lagSeconds:(nearestMs-m.actualMs)/1000 };
      }).filter(o=>Math.abs(o.lagSeconds)*1000<=options.withinMs)
      .sort((a,b)=>Math.abs(a.lagSeconds)-Math.abs(b.lagSeconds) || a.startMs-b.startMs);
    const compatible=candidates.find(o=>expectedPlatform!==null && o.platforms.includes(expectedPlatform) && (!service || o.uid===service.uid));
    const chosen=compatible ?? candidates[0] ?? null;
    const fullyObserved=m.actualMs-options.withinMs>=options.recordingStartMs && m.actualMs+options.withinMs<=options.recordingEndMs;
    const reasons:string[]=[];
    if (!service) reasons.push('no unique timetable service');
    if (bookedPlatform===null) reasons.push('no valid booked platform');
    if (!chosen) reasons.push('headcode absent from observed board sections within tolerance');
    else {
      if (expectedPlatform===null) reasons.push('no reference platform');
      else if (!chosen.platforms.includes(expectedPlatform)) reasons.push('observed board platform differs from TRUST/booked platform');
      if (service && chosen.uid!==service.uid) reasons.push('board timetable identity differs from TRUST service');
    }
    if (m.platform!==null && bookedPlatform!==null && m.platform!==bookedPlatform) reasons.push('TRUST platform differs from booked platform');
    if (!fullyObserved) reasons.push('observation window is censored by recording boundary');
    return { ...m, bookedPlatform, expectedPlatform, matchedUid:service?.uid??null, fullyObserved,
      shown:!!candidates.length, agreed:!!compatible, exactPlatform:!!compatible && compatible.platforms.length===1,
      timetablePlatformAgrees:m.platform===null||bookedPlatform===null?null:m.platform===bookedPlatform,
      observation:chosen, reasons };
  });
  const complete=results.filter(r=>r.fullyObserved), agreements=complete.filter(r=>r.agreed), comparable=complete.filter(r=>r.timetablePlatformAgrees!==null);
  return { summary: { movements:results.length, fullyObserved:complete.length, censored:results.length-complete.length,
    headcodesShown:complete.filter(r=>r.shown).length, boardAgreement:agreements.length,
    agreementPercent:complete.length?100*agreements.length/complete.length:null,
    exactPlatformAgreement:agreements.filter(r=>r.exactPlatform).length,
    ambiguousApproachAgreement:agreements.filter(r=>!r.exactPlatform).length,
    timetablePlatformCompared:comparable.length, timetablePlatformAgreement:comparable.filter(r=>r.timetablePlatformAgrees).length,
    timetablePlatformUnknown:complete.length-comparable.length,
    timetablePlatformAgreementPercent:comparable.length?100*comparable.filter(r=>r.timetablePlatformAgrees).length/comparable.length:null,
    agreementSections:{platform:agreements.filter(r=>r.observation!.section==='platform').length,approaching:agreements.filter(r=>r.observation!.section==='approaching').length,departed:agreements.filter(r=>r.observation!.section==='departed').length},
    medianLagSeconds:median(agreements.map(r=>r.observation!.lagSeconds)), medianAbsoluteLagSeconds:median(agreements.map(r=>Math.abs(r.observation!.lagSeconds))),
    disagreements:results.filter(r=>!r.agreed || r.timetablePlatformAgrees===false || !r.fullyObserved).length }, results };
}

/** Count labels actually shown by the board, including non-public/empty-stock labels.
 * A repeated headcode counts once; interval coverage also exposes partial matching. */
export function scheduleMatchRate(observations: readonly BoardObservation[], fromMs: number, toMs: number, endExclusive=false) {
  const selected=observations.filter(o=>o.endMs>=fromMs && (endExclusive?o.startMs<toMs:o.startMs<=toMs));
  const seen=new Set(selected.map(o=>o.headcode)), matched=new Set(selected.filter(o=>!!o.uid).map(o=>o.headcode));
  const matchedIntervals=selected.filter(o=>!!o.uid).length;
  return { observedHeadcodes:seen.size, matchedHeadcodes:matched.size,
    percent:seen.size?100*matched.size/seen.size:null,
    unmatchedHeadcodes:[...seen].filter(d=>!matched.has(d)).sort(),
    observedIntervals:selected.length, matchedIntervals,
    intervalPercent:selected.length?100*matchedIntervals/selected.length:null };
}

/** One continuous replay supplies every UTC hour, including context across its ends.
 * Internal boundaries belong to the following hour; the final requested instant is inclusive. */
export function hourlyAgreement(movements: readonly TrustMovement[], observations: readonly BoardObservation[], services: readonly BoardService[], options: ComparisonOptions) {
  const hours=[];
  for(let start=options.fromMs;start<options.toMs;) {
    const end=Math.min(options.toMs,(Math.floor(start/3600000)+1)*3600000),last=end===options.toMs;
    const rows=movements.filter(m=>m.actualMs>=start && (m.actualMs<end || last&&m.actualMs===end));
    const {summary}=compareBoardToTrust(rows,observations,services,{...options,fromMs:start,toMs:end});
    // The comparison uses full observations, not a cold-start or clipped board history.
    hours.push({fromMs:start,toMs:end,fromISO:new Date(start).toISOString(),toISO:new Date(end).toISOString(),summary,
      scheduleMatch:scheduleMatchRate(observations,start,end,!last)});
    start=end;
  }
  return hours;
}

export async function replayBoard(data: KxData, rows: readonly RecordedEvent[], anchors: AnchorMap, schedule: {date:string;calls:BoardService[]}, endMs: number, stepMs=250) {
  if (!rows.length || !Number.isFinite(stepMs) || stepMs<=0) throw new Error('recording and positive step required');
  const graph=buildGraph(data), arrivals=approachPlatforms(anchors), observer=createBoardObserver();
  const timetable=createScheduleFeed({mode:'replay',hostname:'localhost',relayPresent:true,date:schedule.date,
    fetchImpl:(async()=>new Response(JSON.stringify(schedule),{headers:{'content-type':'application/json'}})) as typeof fetch,
    schedule:()=>0,unschedule:()=>{}});
  let feed:ReturnType<typeof createReplayFeed>|undefined;
  try {
    await timetable.refresh();
    if (!timetable.services()) throw new Error('invalid cached timetable');
    const kinds=createTrainKinds((d,t)=>matchService(d,t,timetable.services()??[]));
    const motion=createMotion(graph,anchors,{lengthM:kinds.lengthM,
      wayMaxspeed:new Map(data.rails.filter(r=>r.maxspeed!==undefined).map(r=>[r.id,r.maxspeed!]))});
    feed=createReplayFeed(rows,1,{advance:dt=>motion.advance(dt),apply:(e,t)=>{motion.apply(e,t); if(e.kind==='trust') timetable.apply(e,t);}},()=>{});
    let previous:BoardRows|undefined, samples=0;
    // Graph is used by boardRows only for the distance label and approach ordering.
    // Leave that optional work out: this audit compares presence, identity and platform.
    const observe=()=>{previous=boardRows(motion.trains(),anchors,{mode:'replay',nowMs:feed!.timeMs(),previous,arrivals,services:timetable.services()});observer.observe(previous);samples++;};
    observe();
    while(feed.timeMs()<endMs) {feed.advance(Math.min(stepMs,endMs-feed.timeMs())/1000);observe();}
    return {observations:observer.intervals(),samples,services:timetable.services()!};
  } finally {feed?.dispose();timetable.dispose();}
}

export function agreementOptions(args:string[]) {
  const values=new Map<string,string>();
  for(let i=0;i<args.length;i++) {
    const key=args[i]!;
    if(key==='--hourly') {if(values.has(key))throw new Error('repeated --hourly');values.set(key,'true');continue;}
    const value=args[++i];
    if(!['--recording','--schedule','--anchors','--out','--from','--to','--within-seconds','--step-seconds'].includes(key)||!value||value.startsWith('--')||values.has(key)) throw new Error('use --help for options');
    values.set(key,value);
  }
  for(const key of ['--recording','--schedule','--anchors','--out']) if(!values.has(key)) throw new Error(`${key} is required`);
  const out=path.resolve(values.get('--out')!);
  if(!within(path.join(repo,'.scratch'),out) || out===path.join(repo,'.scratch')) throw new Error('--out must be beneath worktree .scratch');
  const withinMs=Number(values.get('--within-seconds')??120)*1000,stepMs=Number(values.get('--step-seconds')??.25)*1000;
  if(!Number.isFinite(withinMs)||withinMs<=0||withinMs>600000||!Number.isFinite(stepMs)||stepMs<=0||stepMs>1000) throw new Error('within must be (0,600] seconds and step (0,1] seconds');
  const time=(key:string):number|undefined=>{const v=values.get(key);if(v===undefined)return;const ms=Date.parse(v);if(!v.includes('T')||!/(Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(ms))throw new Error(`${key} needs an ISO timestamp with timezone`);return ms;};
  const fromMs=time('--from'),toMs=time('--to');if(fromMs!==undefined&&toMs!==undefined&&fromMs>toMs)throw new Error('--from must not follow --to');
  return {recording:path.resolve(values.get('--recording')!),schedule:path.resolve(values.get('--schedule')!),anchors:path.resolve(values.get('--anchors')!),out,withinMs,stepMs,fromMs,toMs,hourly:values.has('--hourly')};
}

const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
async function main() {
  if(process.argv.includes('--help')) {console.log('node tools/board-vs-trust.ts --recording <ndjson> --schedule <schedule-YYYY-MM-DD.json> --anchors <anchors.json> --out <.scratch/dir> [--from <ISO>] [--to <ISO>] [--hourly] [--within-seconds 120] [--step-seconds 0.25]');return;}
  const options=agreementOptions(process.argv.slice(2));await safeOutputDirectory(repo,options.out);
  const [bytes,scheduleText,anchorText]=await Promise.all([readFile(options.recording),readFile(options.schedule,'utf8'),readFile(options.anchors,'utf8')]);
  // An active recorder may be halfway through a line. Freeze only complete records.
  const complete=bytes.subarray(0,bytes.lastIndexOf(10)+1).toString('utf8'),all=parseRecording(complete);
  if(!all.length) throw new Error('recording has no complete records');
  const schedule=JSON.parse(scheduleText) as {date:string;calls:BoardService[]};
  if(!validDate(schedule.date)||!Array.isArray(schedule.calls))throw new Error('invalid schedule cache');
  const anchors=JSON.parse(anchorText) as AnchorMap;
  const fromMs=options.fromMs??all[0]!.t,toMs=options.toMs??all.at(-1)!.t;
  if(fromMs>toMs)throw new Error('recording shorter than the comparison window');
  const endMs=Math.min(toMs+options.withinMs,all.at(-1)!.t),rows=all.filter(r=>r.t<=endMs);
  // Hash the replay prefix plus its coverage marker; freeze the whole received file
  // too, so late TRUST reports remain reference facts without entering the replay early.
  const marker=all.findIndex(r=>r.t>endMs),frozen=marker<0?all:all.slice(0,marker+1);
  const effective=frozen.map(r=>JSON.stringify(r)).join('\n')+'\n';
  const snapshot=all.map(r=>JSON.stringify(r)).join('\n')+'\n';
  const data=JSON.parse(await readFile(new URL('../web/src/data/kx-track.json',import.meta.url),'utf8')) as KxData;
  const replay=await replayBoard(data,rows,anchors,schedule,endMs,options.stepMs),trust=trustMovements(all,anchors.area);
  const comparisonOptions={...options,fromMs,toMs,recordingStartMs:all[0]!.t,recordingEndMs:endMs};
  const comparison=compareBoardToTrust(trust.movements,replay.observations,schedule.calls,comparisonOptions);
  const reproduce={cwd:repo,command:'node',args:['kings-cross-src/tools/board-vs-trust.ts',
    '--recording',path.join(options.out,'inputs/recording.ndjson'),'--schedule',path.join(options.out,'inputs/schedule.json'),
    '--anchors',path.join(options.out,'inputs/anchors.json'),'--from',new Date(fromMs).toISOString(),'--to',new Date(toMs).toISOString(),
    '--within-seconds',String(options.withinMs/1000),'--step-seconds',String(options.stepMs/1000),
    '--out',path.join(options.out,'reproduced'),...(options.hourly?['--hourly']:[])]};
  const report={schema:2,window:{fromMs,toMs,fromISO:new Date(fromMs).toISOString(),toISO:new Date(toMs).toISOString(),withinSeconds:options.withinMs/1000,stepSeconds:options.stepMs/1000},
    method:'Replay uses the page feed, motion, train-length resolver, schedule feed and boardRows. Due is excluded. Board agreement means a same-headcode, same-service observation on TRUST platform (booked if missing) within +/- tolerance; a multi-platform approaching set is compatibility, not an exact platform observation. Lag is signed time of the nearest qualifying board sample minus TRUST actual. Booked/actual platform differences are separate.',
    inputs:{recording:options.recording,asOfMs:all.at(-1)!.t,readBytes:bytes.length,completeBytes:Buffer.byteLength(complete),completeFileSha256:sha(complete),effectiveRecordingSha256:sha(effective),snapshotSha256:sha(snapshot),scheduleSha256:sha(scheduleText),anchorsSha256:sha(anchorText),graphSha256:sha(JSON.stringify(data))},
    samples:replay.samples,observationIntervals:replay.observations.length,duplicateMovements:trust.duplicates,missingActual:trust.missingActual,...comparison,
    scheduleMatch:scheduleMatchRate(replay.observations,fromMs,toMs),
    hourly:options.hourly?hourlyAgreement(trust.movements,replay.observations,schedule.calls,comparisonOptions):[],reproduce};
  for(const [file,body] of [['inputs/recording.ndjson',snapshot],['inputs/schedule.json',scheduleText],['inputs/anchors.json',anchorText],['board-observations.json',JSON.stringify(replay.observations,null,2)+'\n'],['board-vs-trust.json',JSON.stringify(report,null,2)+'\n']])await writePrivateFile(path.join(options.out,file!),body!);
  const failures=comparison.results.filter(r=>r.reasons.length);
  const md=`# Board versus TRUST\n\n${report.window.fromISO} to ${report.window.toISO}; ±${options.withinMs/1000}s; ${options.stepMs/1000}s board samples.\n\n${report.method}\n\n${Object.entries(report.summary).map(([k,v])=>`- ${k}: ${typeof v==='object'&&v!==null?JSON.stringify(v):v??'unavailable'}`).join('\n')}\n\n## Disagreements and unavailable references\n\n| Actual (UTC) | Headcode | Movement | TRUST / booked | Board section / platforms | Lag s | Reason |\n|---|---|---|---|---|---|---|\n${failures.map(r=>`| ${new Date(r.actualMs).toISOString()} | ${r.headcode.replaceAll('|','')} | ${r.eventType} | ${r.platform??'?'} / ${r.bookedPlatform??'?'} | ${r.observation?`${r.observation.section} / ${r.observation.platforms.join(',')}`:'absent'} | ${r.observation?.lagSeconds??'—'} | ${r.reasons.join('; ')} |`).join('\n')}\n\nInput hashes and every movement are in board-vs-trust.json; frozen private inputs make this growing recording reproducible. Censored movements are listed but excluded from the percentage. A near-zero lag measures label visibility around the TRUST actual, not the board's response latency to the TRUST message.\n`;
  const hourlyMd=options.hourly?`\n## Hourly agreement (UTC)\n\nThe motion and board history continue across hour boundaries. Zero-movement hours are unavailable, not 100%.\n\n| From | To | Movements | Complete | Agreed | Agreement % | Median lag s | Booked platform agreement | Schedule headcodes matched |\n|---|---|---:|---:|---:|---:|---:|---|---|\n${report.hourly.map(h=>`| ${h.fromISO} | ${h.toISO} | ${h.summary.movements} | ${h.summary.fullyObserved} | ${h.summary.boardAgreement} | ${h.summary.agreementPercent??'—'} | ${h.summary.medianLagSeconds??'—'} | ${h.summary.timetablePlatformAgreement}/${h.summary.timetablePlatformCompared} | ${h.scheduleMatch.matchedHeadcodes}/${h.scheduleMatch.observedHeadcodes} |`).join('\n')}\n`:'';
  await writePrivateFile(path.join(options.out,'board-vs-trust.md'),md+`\n## Schedule match rate\n\n${report.scheduleMatch.matchedHeadcodes}/${report.scheduleMatch.observedHeadcodes} distinct observed headcodes matched at least once (${report.scheduleMatch.percent??'unavailable'}%). Interval coverage: ${report.scheduleMatch.matchedIntervals}/${report.scheduleMatch.observedIntervals}. Only platform, approaching and departed rows count; Due is excluded.\n`+hourlyMd);
  console.log(JSON.stringify({out:options.out,...report.summary},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(`board-vs-trust: ${(error as Error).message}`);process.exitCode=1;});
