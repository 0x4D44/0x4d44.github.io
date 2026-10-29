// The Spanish script bank. Persona pools live in sibling files; this module merges them.
//   shops.js      one persona per shop type (tienda panaderia fruver carniceria peluqueria ferreteria drogueria cafe restaurante papeleria minutos modista zapateria taller)
//   community.js  vecina vecino abuela abuelo nino adolescente
//   workers.js    obrero maestra enfermera mototaxista ambulante beata
//   shared.js     pools every persona falls back to (greetings by hour, goodbyes, filler, "what are you doing" openers)
import shared from './shared.js';
import community from './community.js';
import workers from './workers.js';
import shops from './shops.js';

export const BANK = { shared, personas: { ...shops, ...community, ...workers } };

const isPool = (v) => Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && typeof v[0][0] === 'string';

/** Lines in the bank (ES+EN pairs), for tests and the M8 metric. `items[].say` (the purchase replies) count as lines, menu labels do not. */
export function countLines(bank = BANK) {
  let n = 0; const per = {};
  const add = (id, pools) => {
    let c = 0;
    for (const [k, v] of Object.entries(pools)) {
      if (isPool(v)) c += v.length;
      else if (k === 'items' && Array.isArray(v)) c += v.filter((it) => Array.isArray(it.say) && it.say.length === 2).length;
    }
    per[id] = c; n += c;
  };
  add('shared', bank.shared);
  for (const [id, p] of Object.entries(bank.personas)) add(id, p);
  return { total: n, personas: Object.keys(bank.personas).length, per };
}
