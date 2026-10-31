// The four shelves of finds in the journal (Monedas de oro, Relojes, Joyas, Rarezas) and how many finds each holds (owner: A1). Pure: node and the page import it.
// The shelves and the finds are the lead's data (interiors/content.js, interiors/finds.js, read-only here); a caller may name a shelf by id ('coins'), by its Spanish
// or English name, or not at all (Rarezas).
import { FIND_COLLECTIONS } from '../interiors/content.js';
import { FINDS } from '../interiors/finds.js';

/** What a paper is called, by `kind` ([Spanish, English]) and the looks of its sheet (`cover`). */
export const KINDS = {
  diary: ['Diario', 'Diary'], letter: ['Carta', 'Letter'], note: ['Nota', 'Note'], list: ['Lista', 'List'], card: ['Tarjeta', 'Card'],
  receipt: ['Recibo', 'Receipt'], ledger: ['Libro de cuentas', 'Ledger'], postcard: ['Postal', 'Postcard'], certificate: ['Certificado', 'Certificate'], clipping: ['Recorte', 'Clipping'],
};
export const COVERS = ['notebook', 'school', 'leather', 'loose', 'envelope', 'card', 'ledger', 'postcard'];

export const SHELVES = FIND_COLLECTIONS.map((c) => ({ id: c.id, es: c.es, en: c.en }));
const FALLBACK = SHELVES.find((c) => c.id === 'oddities') ?? SHELVES[SHELVES.length - 1];
const norm = (s) => String(s ?? '').trim().toLowerCase();

let totals = null;
/** { coins: n, watches: n, ... }: how many different finds each shelf has. */
export function shelfTotals() {
  if (!totals) { totals = {}; for (const c of SHELVES) totals[c.id] = 0; for (const f of FINDS) if (f.collection in totals) totals[f.collection]++; }
  return totals;
}

/** The shelf a caller means: { id, es, en, total }. Unknown or missing = Rarezas. */
export function findCollection(ref) {
  const k = norm(ref), c = SHELVES.find((x) => x.id === k || norm(x.es) === k || norm(x.en) === k) ?? FALLBACK;
  return { ...c, total: shelfTotals()[c.id] ?? 0 };
}

/** Per-shelf progress from ctx.collection.counts() (A3): [{ id, es, en, n, total }] in shelf order. `n` follows the shelf's Spanish name or id as the key. */
export function shelfProgress(counts) {
  const by = counts?.byCollection ?? {};
  return SHELVES.map((c) => ({ ...c, n: by[c.es] ?? by[c.id] ?? by[c.en] ?? 0, total: shelfTotals()[c.id] ?? 0 }));
}
