// Banks whose lines are written AS a woman or AS a man (feminine / masculine self-reference). Every other bank is neutral: it uses {o|a} for the
// speaker's gender and can be cast with either. personas.js never casts a gendered bank with the other gender (tests/people-bank.test.mjs).
export const BANK_GENDER = {
  vecina: 'f', abuela: 'f', maestra: 'f', enfermera: 'f', beata: 'f',
  vecino: 'm', abuelo: 'm', obrero: 'm', mototaxista: 'm',
};
