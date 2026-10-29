// Personas: who lives in La Ladera. A persona = a dialogue bank + a casting rule (which characters, how many) + a routine template.
// PURE data/functions (no THREE/DOM) so tests can import it.  Every persona resolves to a bank that exists (tests/people-bank.test.mjs), every bank is
// reachable by casting, and a gendered bank (lines written as a woman / as a man) is only ever cast with that gender.
import { BANK_GENDER } from './lines/genders.js';

export const NAMES = {
  f: ['Rosa', 'Marleny', 'Luz Marina', 'Gloria', 'Esperanza', 'Amparo', 'Martha', 'Yolanda', 'Nubia', 'Carmenza', 'Stella', 'Liliana', 'Paola', 'Aura', 'Blanca', 'Teresa', 'Mariela', 'Fanny', 'Rocío', 'Consuelo', 'Edilma', 'Luz Dary', 'Ligia', 'Sandra', 'Beatriz', 'Doris', 'Patricia', 'Janeth', 'Alba', 'Nelly', 'Mercedes', 'Elvira', 'Clemencia', 'Piedad'],
  m: ['Hernando', 'Jairo', 'Fabio', 'Arturo', 'Wilson', 'Edison', 'Néstor', 'Gilberto', 'Álvaro', 'Héctor', 'Orlando', 'Mauricio', 'Eduardo', 'Rigoberto', 'Hugo', 'Alirio', 'Jesús', 'Octavio', 'Libardo', 'Ramiro', 'Tomás', 'Evelio', 'Jorge', 'Luis Carlos', 'Reinaldo', 'Gustavo', 'Misael', 'Fernando', 'Darío', 'Aníbal', 'Bernardo', 'Elkin', 'Wílmar', 'Adolfo'],
  kf: ['Camila', 'Valentina', 'Isabela', 'Sofía', 'Yuliana', 'Daniela', 'Salomé', 'Mariana', 'Luciana', 'Katherine', 'Gabriela', 'Samantha', 'Juliana', 'Manuela'],
  km: ['Santiago', 'Juan David', 'Samuel', 'Mateo', 'Brayan', 'Sebastián', 'Emmanuel', 'Duván', 'Esteban', 'Andrés', 'Kevin', 'Jhon Alexander', 'Nicolás', 'Cristian'],
  sur: ['Gómez', 'Rodríguez', 'Restrepo', 'Zapata', 'Ospina', 'Cardona', 'Valencia', 'Mejía', 'Quintero', 'Rincón', 'Becerra', 'Moreno', 'Giraldo', 'Pérez', 'Arango', 'Londoño', 'Ramírez', 'Cano'],
};

export const AGE = {
  kid:   { pitch: 1.38, rate: 1.06, speed: 1.15 },
  teen:  { pitch: 1.12, rate: 1.06, speed: 1.35 },
  adult: { pitch: 1.0, rate: 1.0, speed: 1.3 },
  elder: { pitch: 0.9, rate: 0.86, speed: 0.95 },
};

export { BANK_GENDER };

/**
 * persona id -> casting.
 *   bank     key in lines/ (defaults to the id)
 *   kind     'shop' (one per shop lot of that `shop` type) | 'community' (`quota` of them, spread over the residential lots)
 *   gender   'f' | 'm' | 'any': the gender a character must have (a gendered bank is only cast with its own gender)
 *   age      'adult' | 'elder' | 'kid' | 'teen' (decides the honorific and the voice)
 *   role     [masculine, feminine] job label
 *   chars    candidate character ids in preference order (the library may lack some: they are skipped)
 *   title    honorific Don/Doña for adults; routine = template in brain.js
 */
export const PERSONAS = {
  // ---- the fifteen shop lots of the plan (the persona id = lot.shop; both genders can run any shop)
  tienda:     { kind: 'shop', shop: 'tienda', role: ['Tendero', 'Tendera'], routine: 'shopkeeper', chars: ['m_tendero', 'w_tendera'], title: true },
  panaderia:  { kind: 'shop', shop: 'panaderia', role: ['Panadero', 'Panadera'], routine: 'shopkeeper', chars: ['m_panadero', 'w_ama'], title: true },
  fruver:     { kind: 'shop', shop: 'fruver', role: ['Fruver', 'Fruver'], routine: 'shopkeeper', chars: ['m_vendedor', 'w_afro'], title: true },
  carniceria: { kind: 'shop', shop: 'carniceria', role: ['Carnicero', 'Carnicera'], routine: 'shopkeeper', chars: ['m_carnicero', 'm_afro'], title: true },
  peluqueria: { kind: 'shop', shop: 'peluqueria', role: ['Barbero', 'Peluquera'], routine: 'shopkeeper', chars: ['m_afro', 'w_peluquera'], title: false },
  papeleria:  { kind: 'shop', shop: 'papeleria', role: ['Papelero', 'Papelera'], routine: 'shopkeeper', chars: ['w_maestra'], title: true },
  drogueria:  { kind: 'shop', shop: 'drogueria', role: ['Droguista', 'Droguista'], routine: 'shopkeeper', chars: ['w_farmaceutica'], title: true },
  taller:     { kind: 'shop', shop: 'taller', role: ['Mecánico', 'Mecánica'], routine: 'shopkeeper', chars: ['m_mecanico'], title: false },
  cafe:       { kind: 'shop', shop: 'cafe', role: ['Cafetero', 'Cafetera'], routine: 'shopkeeper', chars: ['w_ama', 'w_cocinera'], title: true },
  restaurante: { kind: 'shop', shop: 'restaurante', role: ['Cocinero', 'Cocinera'], routine: 'shopkeeper', chars: ['w_cocinera'], title: true },
  minutos:    { kind: 'shop', shop: 'minutos', role: ['Encargado', 'Encargada'], routine: 'shopkeeper', chars: ['w_afro', 'm_afro'], title: false },
  zapateria:  { kind: 'shop', shop: 'zapateria', role: ['Zapatero', 'Zapatera'], routine: 'shopkeeper', chars: ['m_elder', 'w_elder'], title: true },
  modista:    { kind: 'shop', shop: 'modista', role: ['Modisto', 'Modista'], routine: 'shopkeeper', chars: ['w_peluquera', 'w_ama'], title: true },
  ferreteria: { kind: 'shop', shop: 'ferreteria', role: ['Ferretero', 'Ferretera'], routine: 'shopkeeper', chars: ['m_abuelo', 'm_mecanico'], title: true },

  // ---- the neighbours
  vecina:     { kind: 'community', gender: 'f', age: 'adult', role: ['Vecino', 'Vecina'], routine: 'homemaker', quota: 9, chars: ['w_ama', 'w_afro', 'w_tendera', 'w_peluquera', 'w_cocinera'], title: true },
  vecino:     { kind: 'community', gender: 'm', age: 'adult', role: ['Vecino', 'Vecina'], routine: 'neighbour', quota: 7, chars: ['m_afro', 'm_tendero', 'm_vendedor'], title: true },
  abuela:     { kind: 'community', gender: 'f', age: 'elder', role: ['Abuelo', 'Abuela'], routine: 'elder', quota: 5, chars: ['w_elder'], title: true },
  abuelo:     { kind: 'community', gender: 'm', age: 'elder', role: ['Abuelo', 'Abuela'], routine: 'elder', quota: 4, chars: ['m_abuelo', 'm_elder'], title: true },
  nino:       { kind: 'community', gender: 'any', age: 'kid', role: ['Niño', 'Niña'], routine: 'kid', quota: 10, chars: ['b_boy', 'g_girl', 'b_escolar', 'g_escolar'], title: false },
  adolescente: { kind: 'community', gender: 'any', age: 'teen', role: ['Joven', 'Joven'], routine: 'teen', quota: 7, chars: ['t_boy', 't_girl'], title: false },
  // ---- the people who work in the barrio
  obrero:     { kind: 'community', gender: 'm', age: 'adult', role: ['Obrero', 'Obrera'], routine: 'worker', quota: 4, chars: ['m_obrero'], title: true },
  maestra:    { kind: 'community', gender: 'f', age: 'adult', role: ['Maestro', 'Maestra'], routine: 'teacher', quota: 2, chars: ['w_maestra'], title: true },
  enfermera:  { kind: 'community', gender: 'f', age: 'adult', role: ['Enfermero', 'Enfermera'], routine: 'nurse', quota: 2, chars: ['w_farmaceutica'], title: true },
  mototaxista: { kind: 'community', gender: 'm', age: 'adult', role: ['Mototaxista', 'Mototaxista'], routine: 'moto', quota: 3, chars: ['m_mototaxi'], title: false },
  ambulante:  { kind: 'community', gender: 'any', age: 'adult', role: ['Vendedor ambulante', 'Vendedora ambulante'], routine: 'vendor', quota: 3, chars: ['m_vendedor', 'w_cocinera'], title: false },
  beata:      { kind: 'community', gender: 'f', age: 'elder', role: ['Beato', 'Beata'], routine: 'beata', quota: 2, chars: ['w_beata'], title: true },
};

/** Persona ids in casting order: the shops first (one per shop lot), then the community round-robin. */
export const SHOP_PERSONAS = Object.keys(PERSONAS).filter((k) => PERSONAS[k].kind === 'shop');
export const COMMUNITY_PERSONAS = Object.keys(PERSONAS).filter((k) => PERSONAS[k].kind === 'community');

export const bankOf = (personaId) => PERSONAS[personaId]?.bank ?? personaId;
/** 'f' | 'm' | 'any': the gender the bank's own lines are written in. */
export const bankGender = (bankKey) => BANK_GENDER[bankKey] ?? 'any';
/** Can a person of `gender` ('f'|'m') speak this bank? A masculine bank never goes to a woman and the other way round. */
export const bankFits = (bankKey, gender) => { const g = bankGender(bankKey); return g === 'any' || g === gender; };

const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

export function ageOf(tags) { return tags.includes('kid') ? 'kid' : tags.includes('teen') ? 'teen' : tags.includes('elder') ? 'elder' : 'adult'; }
export function genderOf(tags) { return tags.includes('woman') || tags.includes('girl') ? 'f' : 'm'; }
export const roleLabel = (personaId, gender) => { const r = PERSONAS[personaId]?.role; return r ? r[gender === 'f' ? 1 : 0] : ''; };

/** "Don Hernando" / "Doña Rosa" in a lot name -> { honor, first, gender }. */
export function nameFromLot(lotName) {
  const m = /\b(Don|Doña)\s+([A-ZÁÉÍÓÚÑ][\p{L}]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}]+)?)/u.exec(lotName ?? '');
  return m ? { honor: m[1], first: m[2], gender: m[1] === 'Doña' ? 'f' : 'm' } : null;
}

/** Display name, e.g. { first:'Rosa', sur:'Restrepo', honor:'Doña', display:'Doña Rosa', full:'Rosa Restrepo' }. `fixed` = { honor, first } from a lot name. */
export function makeName(rng, gender, age, persona, fixed = null, taken = null) {
  const pool = age === 'kid' || age === 'teen' ? NAMES[gender === 'f' ? 'kf' : 'km'] : NAMES[gender];
  let first = fixed?.first ?? rng.pick(pool);
  const sur = rng.pick(NAMES.sur);
  const wantsTitle = (age === 'adult' || age === 'elder') && PERSONAS[persona]?.title !== false;
  let honor = fixed?.honor ?? (wantsTitle ? (age === 'elder' || rng.chance(0.55) ? (gender === 'f' ? 'Doña' : 'Don') : '') : '');
  if (taken && !fixed) {                                           // no two neighbours with the same display name
    for (let k = 0; k < 24 && taken.has(`${honor} ${first}`.trim()); k++) first = rng.pick(pool);
  }
  const display = `${honor ? honor + ' ' : ''}${first}`;
  taken?.add(display);
  return { first, sur, honor, display, full: `${first} ${sur}` };
}

/** Voice parameters (stable per NPC). */
export function voiceFor(id, gender, age) {
  const a = AGE[age], h = hash(id);
  const j = ((h % 21) - 10) / 100;                              // +-0.10
  return { pitch: Math.max(0.6, a.pitch * (gender === 'm' ? 0.93 : 1.0) * (1 + j)), rate: Math.max(0.7, a.rate * (1 + ((h >> 8) % 11 - 5) / 100)), gender, seed: h % 997 };
}
