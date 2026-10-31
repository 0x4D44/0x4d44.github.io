// Shared vocabulary and helpers for the readable papers (papers.js) and the special finds (finds.js).
// Pure functions over a household `hh` (household.js) and a `lot` ({ kind, shop? }): no DOM, no three.js, so node and the page import the same file.
// Written by the lead. Builders read it and never edit it: ask in dev/REQUESTS.md.
//
// A PAPER (papers.js):
//   id        unique snake_case                     kind    diary | letter | note | list | card | receipt | ledger | postcard | certificate | clipping
//   title     Spanish heading/cover                 en      the English title
//   who       the author as written (tokens ok)     cover   notebook | school | leather | loose | envelope | card | ledger | postcard  (drives the paper's look)
//   where     container kinds it may sit in (CONTAINER_KINDS)
//   homes     household filter, or an array of filters (any one may match): see HOME_KEYS below. Omitted = any household.
//   lot       lot kinds allowed (lot.kind). Omitted = any HOME lot (HOME_LOTS); the special lots (chapel, school, clinic, workshop, hall, kiosk) need an explicit list.
//   shop      shop kinds allowed (lot.shop or lot.shopType, e.g. 'panaderia': pass the building's shop type). Omitted = any.
//   voice     who writes it when it is one of the residents: { role: 'woman' | 'man' | 'kid' | 'young', g?: 'f' | 'm' }. The token {A} is that resident's first name.
//             'kid' needs a child in the home; 'young' is a student/teen and works in any household; g picks a resident of that gender, or the paper does not fit.
//   themes    love | hope | dream | challenge | problem | joy | humour | faith | memory | secret
//   pages     1 to 6 { when, es, en }: both languages, at most 90 words each.
// A FIND (finds.js) shares where / homes / lot / shop / voice and adds: kind, collection, name {es,en}, react {es,en}, shape, rarity, min, max (see finds.js).
//
// Tokens (any string): {A} the voice's name, {W} the household's woman, {M} the man, {S} the surname, {K} and {K2} the children, {T} the team colours.
// Secondary people named inside a text come from OUTSIDE household.js NAMES (Yulieth, Brayan, Yeison, doña Berta, don Heriberto...), so a diary never names
// a neighbour who is also the writer.
import { WOMEN, MEN, BOYS, GIRLS } from './names.js';

// The container kinds are A3's (containers.js): mesita de noche, cómoda, armario, baúl, mueble de la tele, modular de la sala, vitrina, alacena,
// cocina, nevera, escritorio, mostrador, casillero, botiquín, caja de herramientas, archivador.
export const CONTAINER_KINDS = ['nightstand', 'dresser', 'wardrobe', 'chest', 'tvstand', 'wallunit', 'vitrine', 'pantry', 'kitchen', 'fridge', 'desk', 'counter', 'locker', 'medcab', 'toolcab', 'filing'];
export const THEMES = ['love', 'hope', 'dream', 'challenge', 'problem', 'joy', 'humour', 'faith', 'memory', 'secret'];
export const PAPER_KINDS = ['diary', 'letter', 'note', 'list', 'card', 'receipt', 'ledger', 'postcard', 'certificate', 'clipping'];
export const COVERS = ['notebook', 'school', 'leather', 'loose', 'envelope', 'card', 'ledger', 'postcard'];
export const FIND_KINDS = ['treasure', 'curio', 'funny', 'keepsake'];
export const FIND_COLLECTIONS = [
  { id: 'coins', es: 'Monedas de oro', en: 'Gold coins' },
  { id: 'watches', es: 'Relojes', en: 'Watches' },
  { id: 'jewels', es: 'Joyas', en: 'Jewellery' },
  { id: 'oddities', es: 'Rarezas', en: 'Curiosities' },
];
/** The journal's name of a collection id ('coins' -> 'Monedas de oro'). */
export const collectionLabel = (id, lang = 'es') => FIND_COLLECTIONS.find((c) => c.id === id)?.[lang] ?? id;
export const HOME_LOTS = ['house', 'rowhouse', 'apartments', 'shophouse', 'courtyard', 'tenement', 'unfinished', 'cornerstore'];
export const SPECIAL_LOTS = ['chapel', 'school', 'clinic', 'workshop', 'hall', 'kiosk'];
export const HOME_KEYS = ['kind', 'income', 'kids', 'teen', 'elder', 'babies', 'religious', 'altar', 'rustic', 'hobby', 'pets', 'kidG'];
/** How often a find is drawn for a slot: rarity 1 common .. 4 legendary -> relative weight (10, 5, 2, 1). */
export const RARITY_WEIGHTS = [10, 5, 2, 1];
export const rarityWeight = (find) => RARITY_WEIGHTS[find.rarity - 1] ?? 1;
export const VOICE_ROLES = ['woman', 'man', 'kid', 'young'];
export const TOKENS = ['A', 'W', 'M', 'S', 'K', 'K2', 'T'];

// Gender of the first names household.js can draw: the pools are js/interiors/names.js (a name is in one list only), so a name added there has its gender here.
const FEM = [...WOMEN, ...GIRLS];
const MAS = [...MEN, ...BOYS];
const GENDER = new Map([...FEM.map((n) => [n, 'f']), ...MAS.map((n) => [n, 'm'])]);
export const genderOf = (name) => GENDER.get(name) ?? null;
export const KNOWN_NAMES = FEM.concat(MAS);

const list = (v) => (Array.isArray(v) ? v : [v]);

/** The resident a voice speaks as, or null when this household has nobody of that description. */
export function authorOf(voice, hh) {
  if (!voice) return null;
  const n = hh.names;
  if (voice.role === 'woman') return n.woman;
  if (voice.role === 'man') return n.man;
  if (voice.role !== 'kid' && voice.role !== 'young') return null;
  if (voice.role === 'kid' && !(hh.kids >= 1)) return null;
  const pool = voice.role === 'kid' && hh.kids < 2 ? [n.kid] : [n.kid, n.kid2];
  for (const c of pool) if (!voice.g || genderOf(c) === voice.g) return c;
  return null;
}

function oneFilter(f, hh) {
  for (const k of Object.keys(f)) {
    const v = f[k];
    switch (k) {
      case 'kind': if (!list(v).includes(hh.kind)) return false; break;
      case 'income': if (hh.income !== v) return false; break;
      case 'kids': if (!(hh.kids >= v)) return false; break;
      case 'teen': case 'elder': case 'babies': case 'altar': case 'rustic': if (!!hh[k] !== v) return false; break;
      case 'religious': if (!(hh.religious >= v)) return false; break;
      case 'hobby': if (!list(v).includes(hh.hobby)) return false; break;
      case 'pets': if (!list(v).some((p) => hh.pets.includes(p))) return false; break;
      case 'kidG': if (genderOf(hh.names.kid) !== v) return false; break;      // the child the token {K} names
      default: return false;                       // an unknown key never matches (the data test names it)
    }
  }
  return true;
}

/** Does the household fit a `homes` filter (one object, or an array of alternatives)? */
export function homeMatches(homes, hh) {
  if (!homes) return true;
  return Array.isArray(homes) ? homes.some((f) => oneFilter(f, hh)) : oneFilter(homes, hh);
}

/** May this paper or find sit in a container of kind `container` in a building of lot `lot` lived in by `hh`? */
export function eligible(item, hh, lot = {}, container = null) {
  if (container && !item.where.includes(container)) return false;
  if (item.lot ? !list(item.lot).includes(lot.kind) : !HOME_LOTS.includes(lot.kind)) return false;
  if (item.shop && !list(item.shop).includes(lot.shop ?? lot.shopType)) return false;
  if (!homeMatches(item.homes, hh)) return false;
  if (item.voice && authorOf(item.voice, hh) == null) return false;
  return true;
}

/** Fill the {A} {W} {M} {S} {K} {K2} {T} tokens of one string. */
export function fill(str, hh, author = null) {
  if (typeof str !== 'string' || str.indexOf('{') < 0) return str;
  const n = hh.names;
  return str.replace(/\{(A|W|M|S|K2|K|T)\}/g, (_, t) => {
    switch (t) {
      case 'A': return author ?? n.woman;
      case 'W': return n.woman;
      case 'M': return n.man;
      case 'S': return n.sur;
      case 'K': return n.kid;
      case 'K2': return n.kid2;
      default: return hh.team?.n ?? 'rojiblancos';
    }
  });
}

/** A paper with every token filled for this household: { id, kind, cover, themes, title, en, who, pages: [{ when, es, en }] }. */
export function resolvePaper(p, hh) {
  const a = p.voice ? authorOf(p.voice, hh) : null;
  const f = (s) => fill(s, hh, a);
  return { id: p.id, kind: p.kind, cover: p.cover, themes: p.themes, title: f(p.title), en: f(p.en), who: f(p.who),
    pages: p.pages.map((g) => ({ when: f(g.when), es: f(g.es), en: f(g.en) })) };
}

/** A find with every token filled: { id, kind, collection, shape, rarity, gold?, fancy?, name: {es,en}, react: {es,en}, note? }. */
export function resolveFind(x, hh) {
  const a = x.voice ? authorOf(x.voice, hh) : null;
  const f = (s) => fill(s, hh, a);
  return { id: x.id, kind: x.kind, collection: x.collection, shape: x.shape, rarity: x.rarity, gold: !!x.gold, fancy: !!x.fancy, tint: x.tint,
    name: { es: f(x.name.es), en: f(x.name.en) }, react: { es: f(x.react.es), en: f(x.react.en) } };
}

/** Words in a string (for the 90-word page limit). */
export const wordCount = (s) => (String(s).match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
