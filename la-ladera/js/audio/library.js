// The sound library as data (owner: A1): every sample the page can play has a string key, and `render(key)` turns a key into a Float32Array.
// Pure and deterministic (no AudioContext, no Math.random), so the same code runs in the sound worker, on the main thread as a fallback, and under
// Node in the tests. Keys: bed:<id>  step:<surface>:<v>  land:<surface>:<v>  rustle:<v>  door:open|close:<v>  shutter:open|close  tick  chime
//                          paper:<v>  sheet:<v>  furn:<kind>:open|close:<v>  find:<collection>  bell  bird:<species>:<take>  dog:<v>  horn:<kind>
import * as F from './foley.js';
import { BEDS, bed } from './beds.js';

export const VARIANTS = { step: 4, land: 2, rustle: 2, door: 2, paper: 2, sheet: 2, furn: 2, take: 2, dog: 2, horn: 2 };

/** Every key the engine may ask for. */
export function keys() {
  const out = BEDS.map((b) => `bed:${b}`), n = (c) => [...Array(c).keys()];
  for (const s of F.SURFACES) { for (const v of n(VARIANTS.step)) out.push(`step:${s}:${v}`); for (const v of n(VARIANTS.land)) out.push(`land:${s}:${v}`); }
  for (const v of n(VARIANTS.rustle)) out.push(`rustle:${v}`);
  for (const k of ['open', 'close']) for (const v of n(VARIANTS.door)) out.push(`door:${k}:${v}`);
  out.push('shutter:open', 'shutter:close', 'tick', 'chime', 'bell');
  for (const v of n(VARIANTS.paper)) out.push(`paper:${v}`);
  for (const v of n(VARIANTS.sheet)) out.push(`sheet:${v}`);
  for (const f of F.FURN_KINDS) for (const k of ['open', 'close']) for (const v of n(VARIANTS.furn)) out.push(`furn:${f}:${k}:${v}`);
  for (const c of F.FIND_SOUNDS) out.push(`find:${c}`);
  for (const sp of n(F.BIRD_COUNT)) for (const t of n(VARIANTS.take)) out.push(`bird:${sp}:${t}`);
  for (const v of n(VARIANTS.dog)) out.push(`dog:${v}`);
  for (const v of n(VARIANTS.horn)) out.push(`horn:${v}`);
  return out;
}

/** Does this key loop (a bed) or play once? */
export const isLoop = (key) => key.startsWith('bed:');

const METAL_DRAWERS = ['locker', 'toolcab', 'filing', 'medcab'], METAL_DOORS = ['locker', 'medcab', 'toolcab'];
/**
 * Which furniture sample a container makes. `kind` is the part that moved (drawer | door | lid | fridge) and `group` the piece of furniture it belongs to (the container
 * kinds of interiors/containers.js: nightstand dresser wardrobe chest tvstand wallunit vitrine pantry kitchen fridge desk counter locker medcab toolcab filing).
 */
export function furnKind(kind, group) {
  if (kind === 'fridge' || group === 'fridge') return 'fridge';
  if (kind === 'lid' || group === 'chest') return 'lid';
  if (kind === 'drawer') return group === 'counter' ? 'till' : METAL_DRAWERS.includes(group) ? 'drawerm' : 'drawer';
  return group === 'wardrobe' ? 'wardrobe' : METAL_DOORS.includes(group) ? 'locker' : 'cupboard';
}

/** Render one sample. Throws on an unknown key. */
export function render(key) {
  const [kind, a, b, c] = String(key).split(':'), v = (s) => (s === undefined ? 0 : Number.parseInt(s, 10) || 0);
  switch (kind) {
    case 'sheet': return F.sheet(v(a));
    case 'furn': if (!F.FURN_KINDS.includes(a) || (b !== 'open' && b !== 'close')) throw new Error(`unknown sound "${key}"`); return F.furniture(a, b, v(c));
    case 'find': if (!F.FIND_SOUNDS.includes(a)) throw new Error(`unknown sound "${key}"`); return F.findSound(a);
    case 'bed': return bed(a);
    case 'step': return F.footstep(a, v(b));
    case 'land': return F.landing(a, v(b));
    case 'rustle': return F.rustle(v(a));
    case 'door': return a === 'open' ? F.doorOpen(v(b)) : F.doorClose(v(b));
    case 'shutter': return F.shutter(a === 'open');
    case 'tick': return F.tick();
    case 'chime': return F.chime();
    case 'paper': return F.paper(v(a));
    case 'bell': return F.bellStrike();
    case 'bird': return F.bird(v(a), v(b));
    case 'dog': return F.dogBarks(v(a));
    case 'horn': return F.horn(v(a));
    default: throw new Error(`unknown sound "${key}"`);
  }
}
