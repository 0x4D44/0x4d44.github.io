// A card that says what the train under the pointer is. It reads only what the page already holds: the
// motion core's view of the train, the board's row for it, its timetable call and the last TRUST report on
// that call. A field the page does not have is left out; a modelled one says so.
//
// Hit testing raycasts the drawn trains and nothing else, once per frame, from `frame()` after the render.
// The pointer is re-tested every frame, not only when it moves, so the card stays on a train that moves
// under a still pointer. The card is an HTML element: it adds no draw call.
import * as THREE from 'three';
import type { TrainView } from '../../core/motion.ts';
import { matchService } from '../../core/schedule.ts';
import { TRAIN_SPECS, trainLayout } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { operatorName, stationName } from './board.ts';
import type { BoardRow, BoardRows, BoardService } from './board.ts';

export type TipMode = 'sample' | 'live' | 'replay';
export interface TipRow { label: string; value: string; warn?: boolean; muted?: boolean }
export interface TipModel {
  headcode: string;
  /** Named by the timetable call; absent when no call matched. */
  operator?: string;
  badge?: { text: string; warn?: boolean };
  rows: TipRow[];
  note?: string;
}
export type BoardWhere = 'platform' | 'approaching' | 'departed';
export interface BoardEntry { row: BoardRow; where: BoardWhere }
export interface TipFacts {
  mode: TipMode;
  /** Simulation time: wall clock live, replay clock in a replay. */
  nowMs: number;
  description: string;
  /** The model the train is drawn as. */
  kind: TrainKind;
  /** The motion core's view; a sample train has none. */
  view?: TrainView;
  entry?: BoardEntry;
  /** Every booked King's Cross call, or undefined while no timetable is loaded. */
  services?: readonly BoardService[];
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const london = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const clock = (ms: number): string => london.format(ms);
const dwell = (ms: number): string => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const upper = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const place = (name: string): string => stationName(name) || '—';
const speedText = (mps: number): string => `${Math.round(mps * 2.2369362920544)} mph (${Math.round(mps * 3.6)} km/h)`;
const distanceText = (m: number): string => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`;
const lateness = (minutes: number): string => minutes === 0 ? 'on time' : minutes > 0 ? `${minutes} min late` : `${-minutes} min early`;
/** CIF category codes the King's Cross timetable carries; any other code is shown as given. */
const CATEGORY: Readonly<Record<string, string>> = { XX: 'express passenger', OO: 'ordinary passenger', EE: 'empty coaching stock', ZZ: 'light locomotive' };

function platformSpan(values: readonly number[]): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const labels: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    labels.push(j > i ? `P${sorted[i]}–P${sorted[j]}` : `P${sorted[i]}`);
    i = j + 1;
  }
  return labels.join(', ');
}

/** The board's current row for a train: standing or departing on a platform, approaching, or just left. */
export function boardEntry(rows: BoardRows | null | undefined, id: number): BoardEntry | undefined {
  if (!rows) return undefined;
  for (const p of rows.platforms) {
    const row = p.trains.find((r) => r.trainId === id);
    if (row) return { row, where: 'platform' };
  }
  const approaching = rows.approaching.find((r) => r.trainId === id);
  if (approaching) return { row: approaching, where: 'approaching' };
  const departed = rows.departed.find((r) => r.trainId === id);
  return departed ? { row: departed, where: 'departed' } : undefined;
}

const layoutLengths = new Map<TrainKind, number>();
const lengthOf = (kind: TrainKind): number => {
  if (!layoutLengths.has(kind)) layoutLengths.set(kind, trainLayout(kind).length);
  return layoutLengths.get(kind)!;
};

function bookedText(service: BoardService): string {
  const arrival = service.publicArrival ?? service.arrival, departure = service.publicDeparture ?? service.departure;
  const working = !service.publicArrival && !service.publicDeparture;
  const parts = [arrival && `arr ${arrival.slice(0, 5)}`, departure && `dep ${departure.slice(0, 5)}`].filter(Boolean);
  return parts.length ? `${parts.join(' · ')}${working ? ' (working times)' : ''}` : '';
}

/** The last TRUST report on this call. Only what the report carries: no expected time is derived. */
function trustRow(service: BoardService, nowMs: number): TipRow {
  const rt = service.realtime;
  if (!rt) return { label: 'TRUST', value: 'no report received', muted: true };
  const parts: string[] = [];
  const arrived = finite(rt.actualArrivalMs) && rt.actualArrivalMs <= nowMs ? rt.actualArrivalMs : undefined;
  const departed = finite(rt.actualDepartureMs) && rt.actualDepartureMs <= nowMs ? rt.actualDepartureMs : undefined;
  const variation = finite(rt.variationMinutes) ? rt.variationMinutes : undefined;
  // A variation belongs to the report it came with: the last event.
  if (arrived !== undefined) parts.push(`arrived ${clock(arrived)}${rt.eventType === 'ARRIVAL' && variation !== undefined ? `, ${lateness(variation)}` : ''}`);
  if (departed !== undefined) parts.push(`departed ${clock(departed)}${rt.eventType === 'DEPARTURE' && variation !== undefined ? `, ${lateness(variation)}` : ''}`);
  if (!parts.length && variation !== undefined) parts.push(lateness(variation));
  if (rt.platform) parts.push(`platform ${rt.platform}`);
  if (rt.trainId) parts.push(`id ${rt.trainId}`);
  return parts.length ? { label: 'TRUST', value: parts.join(' · '), warn: variation !== undefined && variation > 0 }
    : { label: 'TRUST', value: 'no report received', muted: true };
}

function stateText(f: TipFacts): string | undefined {
  const { view, entry, nowMs } = f;
  if (!view) return f.mode === 'sample' ? 'Standing (sample)' : undefined;
  if (view.state === 'fading') return 'Fading out, no longer reported';
  const row = entry?.row;
  const moving = view.speed > 0.1;
  let text: string;
  if (entry?.where === 'platform' && row?.state === 'standing' && !moving) {
    text = `standing, dwell ${dwell(Math.max(0, nowMs - (row.sinceMs ?? nowMs)))} since observed`;
  } else if (entry?.where === 'platform' && row?.state === 'departing') {
    text = `departing${row.stoodMs ? `, stood ${dwell(row.stoodMs)}` : ''}`;
  } else if (entry?.where === 'approaching') {
    text = `${moving ? 'moving' : 'standing'}, approaching${row?.distanceM !== undefined ? `, ${distanceText(row.distanceM)} from the platform` : ''}`;
  } else if (entry?.where === 'departed' && finite(row?.leftAtMs)) {
    text = `${moving ? 'moving' : 'standing'}, left the platform at ${clock(row.leftAtMs)}`;
  } else if (view.state === 'departing') text = 'departing';
  else if (view.state === 'held') text = view.blocked ? 'standing, held for the train ahead' : 'standing';
  else text = moving ? 'moving' : 'standing';
  if (view.exiting) text += ', leaving the mapped area';
  return upper(text);
}

function platformRow(f: TipFacts, service: BoardService | undefined): TipRow | undefined {
  const { entry } = f;
  const row = entry?.row;
  const booked = service?.platform ?? undefined;
  let at: string | undefined, now: number | undefined;
  if (f.mode === 'sample') { if (row?.platform !== undefined) { now = row.platform; at = `P${now} (sample)`; } }
  else if (entry?.where === 'platform' && row?.platform !== undefined) { now = row.platform; at = `P${now}`; }
  else if (entry?.where === 'approaching' && row?.platforms?.length) { at = `heading for ${platformSpan(row.platforms)}`; if (row.platforms.length === 1) now = row.platforms[0]; }
  else if (entry?.where === 'departed' && row?.platform !== undefined) at = `was P${row.platform}`;
  const parts = at ? [at] : [];
  let warn = false;
  if (booked) {
    if (now !== undefined && String(now) === booked) parts.push('as booked');
    else { parts.push(`booked P${booked}`); warn = now !== undefined; }
  }
  if (warn) parts.push('(changed)');
  return parts.length ? { label: 'Platform', value: parts.join(' · '), warn } : undefined;
}

/** Everything the page knows about one train, as rows of text. Pure: tests pin each field. */
export function describeTrain(f: TipFacts): TipModel {
  const { view, entry, nowMs } = f;
  const sample = f.mode === 'sample';
  const service = sample ? undefined
    : entry?.row.service ?? (f.services ? matchService(f.description, nowMs, f.services) as BoardService | undefined : undefined);
  const rows: TipRow[] = [];
  const model: TipModel = { headcode: f.description, rows };
  if (sample) {
    model.badge = { text: 'sample' };
    rows.push({ label: 'Timetable', value: 'none: a sample, not a real service', muted: true });
  } else if (service) {
    model.operator = operatorName(service.operator);
    rows.push({ label: 'Service', value: `${place(service.originName || service.origin)} → ${place(service.destinationName || service.destination)}` });
    const booked = bookedText(service);
    if (booked) rows.push({ label: 'Booked', value: booked });
  } else {
    rows.push({ label: 'Timetable', value: f.services ? `no match for ${f.description}` : 'not loaded', warn: false, muted: true });
  }
  const platform = platformRow(f, service);
  if (platform) rows.push(platform);
  const state = stateText(f);
  if (state) rows.push({ label: 'State', value: state });
  if (view && view.state !== 'fading' && view.speed > 0.2) rows.push({ label: 'Speed', value: `${speedText(view.speed)}, modelled` });
  if (view?.lastBerth) {
    const heading = view.targetBerth && view.targetBerth !== view.lastBerth && view.speed > 0.2 ? ` → heading to ${view.targetBerth}` : '';
    rows.push({ label: 'TD berth', value: `${view.lastBerth}${view.unmappedBerth === view.lastBerth ? ' (not on the map)' : ''}${heading}` });
  }
  if (service) {
    rows.push(trustRow(service, nowMs));
    const category = service.category ? CATEGORY[service.category] ?? service.category : '';
    rows.push({ label: 'Schedule', value: [service.uid, category].filter(Boolean).join(' · '), muted: true });
  }
  const spec = TRAIN_SPECS[f.kind];
  rows.push({ label: 'Drawn as', muted: true,
    value: `${spec.operator} ${spec.classes.replace(' x', ' ×')} · ${spec.cars.length} cars · ${Math.round(lengthOf(f.kind))} m · ${service ? 'formation' : 'all'} assumed${(view as TrainView & { formationNote?: string })?.formationNote ? ` · ${(view as TrainView & { formationNote?: string }).formationNote}` : ''}` });
  if (view?.state === 'fading') model.badge = { text: 'fading' };
  else if (view?.state === 'estimated') {
    model.badge = { text: 'estimated', warn: true };
    model.note = `Position is estimated along the expected route; TD does not report it.${view.unmappedBerth ? ` Berth ${view.unmappedBerth} has no map position.` : ''}`;
  }
  return model;
}

export interface TipContext {
  mode: TipMode;
  nowMs: number;
  views: readonly TrainView[];
  rows: BoardRows | null;
  services: readonly BoardService[] | undefined;
}
/** Look up one drawn train's facts and describe it; null when nothing is known of it. */
export function trainTip(ctx: TipContext, id: number | undefined, kind: TrainKind): TipModel | null {
  if (id === undefined) return null;
  const view = ctx.views.find((v) => v.id === id);
  const entry = boardEntry(ctx.rows, id);
  const description = view?.description ?? entry?.row.headcode;
  if (description === undefined) return null;
  return describeTrain({ mode: ctx.mode, nowMs: ctx.nowMs, description, kind, view, entry, services: ctx.services });
}

const escape = (value: string): string => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function tipHtml(model: TipModel): string {
  const head = `<div class="kx-tip-head"><strong>${escape(model.headcode)}</strong>${model.operator ? `<span class="kx-tip-op">${escape(model.operator)}</span>` : ''}${model.badge ? `<span class="kx-tip-badge${model.badge.warn ? ' kx-tip-warn' : ''}">${escape(model.badge.text)}</span>` : ''}</div>`;
  const rows = model.rows.map((r) => `<dt>${escape(r.label)}</dt><dd${r.warn ? ' class="kx-tip-warn"' : r.muted ? ' class="kx-tip-muted"' : ''}>${escape(r.value)}</dd>`).join('');
  return `${head}<dl>${rows}</dl>${model.note ? `<p class="kx-tip-note">${escape(model.note)}</p>` : ''}`;
}

export interface Rect { x: number; y: number; w: number; h: number }
/** The shared "← Almanac" pill (almanac-back.js) is pinned here, above everything. */
export const ALMANAC_PILL: Rect = { x: 0, y: 0, w: 109, h: 41 };
const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Top-left of a card of `size` for a pointer at `anchor`: below and right of it, flipped at the edges,
 * clamped inside the viewport and clear of every `avoid` rectangle. */
export function placeTip(anchor: { x: number; y: number }, size: { w: number; h: number }, view: { w: number; h: number }, avoid: readonly Rect[] = [], gap = 14, margin = 8): { x: number; y: number } {
  let x = anchor.x + gap, y = anchor.y + gap;
  if (x + size.w > view.w - margin) x = anchor.x - gap - size.w;
  if (y + size.h > view.h - margin) y = anchor.y - gap - size.h;
  x = Math.max(margin, Math.min(x, view.w - margin - size.w));
  y = Math.max(margin, Math.min(y, view.h - margin - size.h));
  for (const keep of avoid) {
    const clear: Rect = { x: keep.x - margin, y: keep.y - margin, w: keep.w + 2 * margin, h: keep.h + 2 * margin };
    if (!intersects({ x, y, w: size.w, h: size.h }, clear)) continue;
    if (clear.y + clear.h + size.h <= view.h - margin) y = clear.y + clear.h;
    else if (clear.x + clear.w + size.w <= view.w - margin) x = clear.x + clear.w;
  }
  return { x, y };
}

export interface Pick { group: THREE.Object3D; node: THREE.Object3D; point: THREE.Vector3; distance: number; exact: boolean }
const carBounds = new WeakMap<THREE.Object3D, THREE.Box3>();
/** A car's bounds in its own frame, found once: the pose changes every frame, the car does not. */
function localBounds(node: THREE.Object3D): THREE.Box3 | undefined {
  const known = carBounds.get(node);
  if (known) return known;
  node.updateWorldMatrix(true, true);
  const inverse = new THREE.Matrix4().copy(node.matrixWorld).invert(), m = new THREE.Matrix4(), part = new THREE.Box3(), box = new THREE.Box3();
  node.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(inverse, mesh.matrixWorld)));
  });
  if (box.isEmpty() || ![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)) return undefined;
  carBounds.set(node, box);
  return box;
}
/** Like Raycaster.intersectObject, but a hidden object (a car with no pose, an unused level of detail) is skipped. */
function castVisible(object: THREE.Object3D, raycaster: THREE.Raycaster, out: THREE.Intersection[]): void {
  if (!object.visible) return;
  if (!(object as THREE.LOD).isLOD && object.layers.test(raycaster.layers)) object.raycast(raycaster, out);
  for (const child of object.children) castVisible(child, raycaster, out);
}
const s = { inverse: new THREE.Matrix4(), ray: new THREE.Ray(), box: new THREE.Box3(), entry: new THREE.Vector3(), at: new THREE.Vector3(), hits: [] as THREE.Intersection[] };

/** The nearest drawn train under the ray. Each visible car is first tested as a box, grown by `tolerance(distance)`
 * metres so a train a few pixels wide can still be hit; only cars the ray reaches have their meshes cast. A mesh hit
 * always beats a near miss, so the tolerance never steals a train drawn right under the pointer. */
export function pickTrain(raycaster: THREE.Raycaster, groups: readonly THREE.Object3D[], tolerance: (distance: number) => number = () => 0): Pick | undefined {
  let exact: Pick | undefined, near: Pick | undefined;
  const origin = raycaster.ray.origin;
  for (const group of groups) {
    if (!group.visible) continue;
    for (const node of group.children) {
      if (!node.visible) continue;
      const bounds = localBounds(node);
      if (!bounds) continue;
      s.inverse.copy(node.matrixWorld).invert();
      s.ray.copy(raycaster.ray).applyMatrix4(s.inverse);
      s.at.setFromMatrixPosition(node.matrixWorld);
      s.box.copy(bounds).expandByScalar(tolerance(s.at.distanceTo(origin)));
      if (!s.ray.intersectBox(s.box, s.entry)) continue;
      s.hits.length = 0;
      castVisible(node, raycaster, s.hits);
      if (s.hits.length) {
        for (const hit of s.hits) if (!exact || hit.distance < exact.distance) exact = { group, node, point: hit.point.clone(), distance: hit.distance, exact: true };
      } else {
        const point = s.entry.applyMatrix4(node.matrixWorld).clone(), distance = point.distanceTo(origin);
        if (!near || distance < near.distance) near = { group, node, point, distance, exact: false };
      }
    }
  }
  return exact ?? near;
}

const CSS = `.kx-tip{position:fixed;left:0;top:0;z-index:20;box-sizing:border-box;width:280px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:hidden;padding:8px 10px;pointer-events:none;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;font:12px/18px system-ui,sans-serif;backdrop-filter:blur(8px);box-shadow:0 4px 16px rgba(0,0,0,.35)}
.kx-tip[hidden]{display:none}
.kx-tip-head{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}.kx-tip-head strong{font-size:14px;font-variant-numeric:tabular-nums}.kx-tip-op{color:var(--muted)}
.kx-tip-badge{margin-left:auto;padding:0 6px;border:1px solid currentColor;border-radius:9px;color:var(--muted);font-size:10px;line-height:16px;letter-spacing:.06em;text-transform:uppercase}
.kx-tip dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 10px;margin:0}.kx-tip dt{color:var(--muted)}.kx-tip dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.kx-tip .kx-tip-muted{color:var(--muted)}.kx-tip .kx-tip-warn{color:#d9a441}:root[data-theme="light"] .kx-tip .kx-tip-warn{color:#8a5a00}
.kx-tip-note{margin:4px 0 0;color:var(--muted);font-size:11px;line-height:15px}`;

export interface TooltipOptions {
  parent: HTMLElement;
  /** Pointer events come from here, and the pointer is mapped through its rectangle. */
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  /** The root of every drawn train, its cars as direct children. Read once a frame, and only while a train may be hit. */
  groups: () => readonly THREE.Object3D[];
  /** The card for one train; null once the train is gone. */
  info: (group: THREE.Object3D) => TipModel | null;
  /** Viewport rectangles the card keeps clear of; the almanac pill by default. */
  avoid?: readonly Rect[];
  /** Pointer slack in pixels for a train drawn only a few pixels wide. */
  slopPx?: number;
}
const DRAG_PX = 5, TAP_MS = 600;

export function createTrainTooltip(options: TooltipOptions) {
  const { parent, canvas, camera } = options;
  const doc = parent.ownerDocument, view = doc.defaultView!;
  const avoid = options.avoid ?? [ALMANAC_PILL], slopPx = options.slopPx ?? 6;
  const root = doc.createElement('div');
  root.className = 'kx-tip'; root.setAttribute('role', 'tooltip'); root.hidden = true;
  const style = doc.createElement('style'); style.textContent = CSS;
  const body = doc.createElement('div');
  root.append(style, body); parent.append(root);
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), probe = new THREE.Vector3();
  // hover: a mouse or pen over the canvas. tap: a touch tap awaiting its pick. pinned: the train a tap chose,
  // kept as a point in one car's frame so the card follows it. presses: pointers down on the canvas.
  let hover: { x: number; y: number } | null = null, tap: { x: number; y: number } | null = null;
  type Pin = { group: THREE.Object3D; node: THREE.Object3D; local: THREE.Vector3; last: { x: number; y: number } };
  let pinned: Pin | null = null;
  const presses = new Map<number, { x: number; y: number; at: number; moved: boolean; touch: boolean }>();
  let html = '', size: { w: number; h: number } | null = null, transform = '';

  const onMove = (e: PointerEvent): void => {
    const press = presses.get(e.pointerId);
    if (press && !press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX) press.moved = true;
    if (e.pointerType !== 'touch') { hover = { x: e.clientX, y: e.clientY }; pinned = null; }
  };
  const onDown = (e: PointerEvent): void => {
    presses.set(e.pointerId, { x: e.clientX, y: e.clientY, at: e.timeStamp, moved: false, touch: e.pointerType === 'touch' });
    if (presses.size > 1) for (const p of presses.values()) p.moved = true; // a second finger is a pinch, not a tap
    if (e.pointerType !== 'touch') { hover = { x: e.clientX, y: e.clientY }; pinned = null; }
  };
  const onUp = (e: PointerEvent): void => {
    const press = presses.get(e.pointerId);
    presses.delete(e.pointerId);
    if (press?.touch && !press.moved && e.timeStamp - press.at <= TAP_MS) tap = { x: e.clientX, y: e.clientY };
  };
  const onCancel = (e: PointerEvent): void => { presses.delete(e.pointerId); };
  const onLeave = (e: PointerEvent): void => { if (e.pointerType !== 'touch') hover = null; };
  const onBlur = (): void => { hover = null; presses.clear(); };
  canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('lostpointercapture', onCancel); canvas.addEventListener('pointerleave', onLeave);
  view.addEventListener('blur', onBlur);

  const pick = (x: number, y: number, groups: readonly THREE.Object3D[]): Pick | undefined => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return undefined;
    ndc.set((x - rect.left) / rect.width * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const perPixel = 2 * Math.tan(camera.fov * Math.PI / 360) / rect.height; // metres per pixel, per metre of distance
    return pickTrain(raycaster, groups, (distance) => slopPx * perPixel * distance);
  };
  const rectOf = (): { left: number; top: number; width: number; height: number } => canvas.getBoundingClientRect();
  /** Where a point in a node's frame is on the canvas; undefined behind the camera or off the canvas. */
  const screenOf = (node: THREE.Object3D, local: THREE.Vector3): { x: number; y: number } | undefined => {
    node.localToWorld(probe.copy(local)).applyMatrix4(camera.matrixWorldInverse);
    if (probe.z > -camera.near) return undefined;
    probe.applyMatrix4(camera.projectionMatrix);
    const rect = rectOf(), x = rect.left + (probe.x + 1) / 2 * rect.width, y = rect.top + (1 - probe.y) / 2 * rect.height;
    return x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height ? undefined : { x, y };
  };
  /** The pinned train's anchor. When the tapped car has left the canvas the card moves to the nearest car still on it,
   * so it stays with the train while any of it is in view. */
  const anchorOf = (pin: Pin): { x: number; y: number } | undefined => {
    const own = pin.node.visible ? screenOf(pin.node, pin.local) : undefined;
    if (own) return pin.last = own;
    let best: { x: number; y: number; node: THREE.Object3D; local: THREE.Vector3 } | undefined, nearest = Infinity;
    for (const node of pin.group.children) {
      const local = node.visible && node !== pin.node ? localBounds(node)?.getCenter(new THREE.Vector3()) : undefined;
      const at = local && screenOf(node, local);
      if (!local || !at) continue;
      const d = Math.hypot(at.x - pin.last.x, at.y - pin.last.y);
      if (d < nearest) { best = { ...at, node, local }; nearest = d; }
    }
    if (!best) return undefined;
    pin.node = best.node; pin.local = best.local;
    return pin.last = { x: best.x, y: best.y };
  };
  const hide = (): void => { if (!root.hidden) root.hidden = true; };
  const show = (model: TipModel, at: { x: number; y: number }): void => {
    const next = tipHtml(model);
    if (next !== html) { body.innerHTML = next; html = next; size = null; }
    if (root.hidden) { root.hidden = false; size = null; }
    if (!size) size = { w: root.offsetWidth, h: root.offsetHeight };
    const p = placeTip(at, size, { w: view.innerWidth, h: view.innerHeight }, avoid);
    const next2 = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    if (next2 !== transform) { root.style.transform = next2; transform = next2; }
  };

  return {
    /** Call once per animation frame, after the render, so every matrix is this frame's. */
    frame(): void {
      for (const p of presses.values()) if (p.moved) { tap = null; hide(); return; } // dragging the camera
      if (!hover && !tap && !pinned) { hide(); return; }
      const groups = options.groups();
      let target: THREE.Object3D | undefined, at: { x: number; y: number } | undefined;
      if (tap) {
        const where = tap, hit = pick(where.x, where.y, groups);
        tap = null;
        pinned = hit ? { group: hit.group, node: hit.node, local: hit.node.worldToLocal(hit.point.clone()), last: where } : null;
      }
      if (pinned) {
        if (!groups.includes(pinned.group)) pinned = null;
        else { target = pinned.group; at = anchorOf(pinned); }
      } else if (hover) {
        const hit = pick(hover.x, hover.y, groups);
        if (hit) { target = hit.group; at = hover; }
      }
      const model = target ? options.info(target) : null;
      if (!model && pinned) pinned = null; // a pinned train with no card is gone; one merely off screen keeps its pin
      if (model && at) show(model, at); else hide();
    },
    visible: (): boolean => !root.hidden,
    dispose(): void {
      canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('lostpointercapture', onCancel); canvas.removeEventListener('pointerleave', onLeave);
      view.removeEventListener('blur', onBlur);
      root.remove();
    },
  };
}
