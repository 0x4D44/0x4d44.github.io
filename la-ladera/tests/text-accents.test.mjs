// Sign and poster text is Spanish, and its accents and eñes are part of the picture: a poster read "SABADO" (R3-111) and another "TIENDA DONA ANA" (R3-209). Every string that can end up on a sign, a poster, a board or
// a name plate is read from the sources that make them (the canvases of js/arch/signs.js, js/world/signs.js, js/interiors/atlas.js and js/arch/weather.js, the shop and house names of js/world/names.js, the place names
// of js/world/places.js and the street names of js/world/layout.js, the pixel-font posters of tools/blender/clutter_atlas.py) and each word of it that is on the small list below must be written the way Spanish writes it.
//   node --test la-ladera/tests/text-accents.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCES = ['js/arch/signs.js', 'js/world/signs.js', 'js/world/names.js', 'js/world/places.js', 'js/world/layout.js', 'js/interiors/atlas.js', 'js/arch/weather.js', 'js/world/coast.js', 'js/world/beachfinds.js', 'tools/blender/clutter_atlas.py'];

/** The small list: a word that is never right without its mark, by its bare form (lower case, no accent), and the way it is written. A word that is right both ways ("si", "como") does not belong here. */
export const WORDS = {
  dona: 'doña', sabado: 'sábado', miercoles: 'miércoles', ano: 'año', anos: 'años', nino: 'niño', ninos: 'niños', nina: 'niña', ninas: 'niñas', senor: 'señor', senora: 'señora', senorita: 'señorita', montana: 'montaña', manana: 'mañana',
  cumpleanos: 'cumpleaños', bano: 'baño', banos: 'baños', pequeno: 'pequeño', espanol: 'español', companero: 'compañero', cafe: 'café', menu: 'menú', telefono: 'teléfono', musica: 'música', panaderia: 'panadería', papeleria: 'papelería',
  barberia: 'barbería', drogueria: 'droguería', peluqueria: 'peluquería', carniceria: 'carnicería', zapateria: 'zapatería', ferreteria: 'ferretería', modisteria: 'modistería', cafeteria: 'cafetería', libreria: 'librería',
  fruteria: 'frutería', joyeria: 'joyería', lavanderia: 'lavandería', heladeria: 'heladería', miscelanea: 'miscelánea', institucion: 'institución', atencion: 'atención', vacunacion: 'vacunación', accion: 'acción',
  construccion: 'construcción', educacion: 'educación', informacion: 'información', direccion: 'dirección', estacion: 'estación', reparacion: 'reparación', comunicacion: 'comunicación', cooperacion: 'cooperación',
  salon: 'salón', deposito: 'depósito', malecon: 'malecón', jabon: 'jabón', cancion: 'canción', ultimo: 'último', numero: 'número', rapido: 'rápido', facil: 'fácil', util: 'útil', pasteleria: 'pastelería', lecheria: 'lechería',
};

const LIST = new Map(Object.entries(WORDS));                                  // (a Map: "constructor" is a word on a sign, and a property of every object)
const bare = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** The string literals of a source, the strings that are only an identifier (one lower-case token: a shop id, a material key) left out: those are not text on anything. */
export function strings(src) {
  const out = [], re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (let m; (m = re.exec(src));) {
    const s = (m[1] ?? m[2] ?? m[3]).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (/^[a-z0-9_.:#-]+$/.test(s)) continue;
    out.push(s);
  }
  return out;
}
/** The words of a text that are on the list and are not written the way the list writes them (compared without regard to case). */
export const wrong = (text) => (text.normalize('NFC').match(/\p{L}+/gu) ?? []).filter((w) => LIST.has(bare(w)) && w.toLowerCase() !== LIST.get(bare(w)));

const source = (p) => readFileSync(resolve(ROOT, p), 'utf8');

test('every sign, poster and name plate is written with its accents and its eñes', () => {
  const found = [];
  let n = 0;
  for (const p of SOURCES) for (const s of strings(source(p))) { n++; for (const w of wrong(s)) found.push(`${p}: "${w}" should be "${LIST.get(bare(w))}" in "${s.slice(0, 60)}"`); }
  assert.ok(n > 1000, `${n} strings were read: the scan is not vacuous`);
  assert.deepEqual(found, []);
});

test('the scan sees what it should: the Spanish words are there with their marks, and a wrong one is found', () => {
  const all = SOURCES.flatMap((p) => strings(source(p))).join('\n');
  for (const w of ['Doña', 'DOÑA', 'Panadería', 'BARBERÍA', 'Droguería', 'SÁBADO', 'Café']) assert.ok(all.includes(w), `${w} is somewhere on a sign`);
  assert.deepEqual(wrong('TIENDA DONA ANA'), ['DONA'], 'the poster of R3-209');
  assert.deepEqual(wrong('Zona de bano'), ['bano']);
  assert.deepEqual(wrong('Zona de baño · Prohibido el paso · Bandera roja'), []);
  assert.deepEqual(wrong('Panaderia La Esperanza, Doña Marta'), ['Panaderia']);
  assert.deepEqual(wrong('DOÑA ANA'), [], 'a decomposed tilde is the same letter');
  assert.deepEqual(strings(`const a = 'panaderia', b = "Panaderia Don Jose", c = \`DONA\`;`), ['Panaderia Don Jose', 'DONA'], 'a lower-case id is not text; a capitalised word is');
  assert.deepEqual(wrong('FERRETERÍA EL CONSTRUCTOR'), [], 'a word that is not on the list is left alone, whatever it is called by the language');
});
