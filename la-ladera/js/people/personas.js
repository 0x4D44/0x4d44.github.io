// Personas: who lives in La Ladera. A persona = a bank key (lines) + a casting rule + voice style + routine template.
// PURE data/functions (no THREE/DOM) so tests can import it.

export const NAMES = {
  f: ['Rosa', 'Marleny', 'Luz Marina', 'Gloria', 'Esperanza', 'Amparo', 'Martha', 'Yolanda', 'Nubia', 'Carmenza', 'Stella', 'Liliana', 'Paola', 'Aura', 'Blanca', 'Teresa', 'Mariela', 'Fanny', 'Rocío', 'Consuelo', 'Edilma', 'Luz Dary', 'Ligia', 'Sandra', 'Beatriz', 'Doris', 'Patricia', 'Janeth'],
  m: ['Hernando', 'Jairo', 'Fabio', 'Arturo', 'Wilson', 'Edison', 'Néstor', 'Gilberto', 'Álvaro', 'Héctor', 'Orlando', 'Mauricio', 'Eduardo', 'Rigoberto', 'Hugo', 'Alirio', 'Jesús', 'Octavio', 'Libardo', 'Ramiro', 'Tomás', 'Evelio', 'Jorge', 'Luis Carlos', 'Reinaldo', 'Gustavo', 'Misael', 'Fernando'],
  kf: ['Camila', 'Valentina', 'Isabela', 'Sofía', 'Yuliana', 'Daniela', 'Salomé', 'Mariana', 'Luciana', 'Katherine', 'Gabriela', 'Samantha'],
  km: ['Santiago', 'Juan David', 'Samuel', 'Mateo', 'Brayan', 'Sebastián', 'Emmanuel', 'Duván', 'Esteban', 'Andrés', 'Kevin', 'Jhon Alexander'],
  sur: ['Gómez', 'Rodríguez', 'Restrepo', 'Zapata', 'Ospina', 'Cardona', 'Valencia', 'Mejía', 'Quintero', 'Rincón', 'Becerra', 'Moreno', 'Giraldo', 'Pérez', 'Arango', 'Londoño', 'Ramírez', 'Cano'],
};

export const AGE = {
  kid:   { pitch: 1.38, rate: 1.06, speed: 1.15 },
  teen:  { pitch: 1.12, rate: 1.06, speed: 1.35 },
  adult: { pitch: 1.0, rate: 1.0, speed: 1.3 },
  elder: { pitch: 0.9, rate: 0.86, speed: 0.95 },
};

/**
 * persona id -> casting. `bank` is the key in lines/ (defaults to the id). `chars` = tags a character must have (any of listed sets);
 * `title` honorific for adults; `role` Spanish job label; `n` is the relative weight when casting the whole barrio.
 * routine: template name in schedule.js.
 */
export const PERSONAS = {
  tendero:   { role: 'Tendero', tags: [['shop']], title: true, w: 5, routine: 'shopkeeper', shopType: 'tienda' },
  vecina:    { role: 'Vecina', tags: [['woman', 'home'], ['woman', 'adult']], title: true, w: 7, routine: 'homemaker' },
  vecino:    { role: 'Vecino', tags: [['man', 'adult']], title: true, w: 6, routine: 'neighbour', bank: 'vecina' },
  abuela:    { role: 'Abuela', tags: [['woman', 'elder']], title: true, w: 5, routine: 'elder' },
  abuelo:    { role: 'Abuelo', tags: [['man', 'elder']], title: true, w: 4, routine: 'elder', bank: 'abuela' },
  nino:      { role: 'Niño', tags: [['kid']], title: false, w: 8, routine: 'kid', age: 'kid' },
  adolescente: { role: 'Adolescente', tags: [['teen']], title: false, w: 6, routine: 'teen', age: 'teen' },
  obrero:    { role: 'Obrero', tags: [['man', 'work'], ['man', 'adult']], title: true, w: 5, routine: 'worker', bank: 'vecina' },
};

const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

export function ageOf(tags) { return tags.includes('kid') ? 'kid' : tags.includes('teen') ? 'teen' : tags.includes('elder') ? 'elder' : 'adult'; }
export function genderOf(tags) { return tags.includes('woman') || tags.includes('girl') ? 'f' : 'm'; }

/** Display name, e.g. "Doña Rosa Restrepo" (display = "Doña Rosa", for the prompt). */
export function makeName(rng, gender, age, persona) {
  const first = rng.pick(age === 'kid' || age === 'teen' ? NAMES[gender === 'f' ? 'kf' : 'km'] : NAMES[gender]);
  const sur = rng.pick(NAMES.sur);
  const honor = (age === 'adult' || age === 'elder') && (PERSONAS[persona]?.title !== false)
    ? (gender === 'f' ? (age === 'elder' || rng.chance(0.55) ? 'Doña' : '') : (age === 'elder' || rng.chance(0.55) ? 'Don' : '')) : '';
  return { first, sur, honor, display: `${honor ? honor + ' ' : ''}${first}`, full: `${first} ${sur}` };
}

/** Voice parameters (stable per NPC). */
export function voiceFor(id, gender, age) {
  const a = AGE[age], h = hash(id);
  const j = ((h % 21) - 10) / 100;                              // +-0.10
  return { pitch: Math.max(0.6, a.pitch * (gender === 'm' ? 0.93 : 1.0) * (1 + j)), rate: Math.max(0.7, a.rate * (1 + ((h >> 8) % 11 - 5) / 100)), gender, seed: h % 997 };
}

export function charMatches(charMeta, rule) {
  const tags = charMeta.tags ?? [];
  return rule.tags.some((set) => set.every((t) => tags.includes(t)));
}
