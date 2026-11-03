// What a neighbour tells a stranger who asks "anything worth seeing?": public places and things OUTDOORS, said the way a person says them.
// Pure data + helpers (no THREE, no DOM); dialogue.js builds the sentence (intro + phrase + directions).
//
// A discovery of the world (js/world/discover.js) has a long English description, meant for the journal, and Spanish names that sit in a sentence badly; the
// ones inside a building (kitchen drawers, a bed, a child's room) are private: nobody sends a stranger there. So the tips use only `publicDiscovery()`
// ones, named by a short noun phrase: curated for the discoveries that exist today, derived from the name for any that is added later.

/** A place or thing in the open (not inside a home or shop, not something found in a drawer). */
export const publicDiscovery = (d) => !!d && !d.building && !/^(int|cont):/.test(String(d.id ?? '')) && d.kind !== 'hallazgo' && d.kind !== 'find';

/**
 * [Spanish noun phrase with its article, English noun phrase with its article, group?, plural?] by discovery id. A plural phrase is made with PL: the verb after it agrees ("Quedan ...", "Están ...",
 * English "They're ..."; R3-202: it was always "Queda"). The agreement needs the number only: "queda" and "está" do not change with the gender of what they say.
 */
const PL = (es, en, group) => [es, en, group, true];
export const PHRASE = {
  'w.cruz': ['la Cruz de la Cumbre', 'the summit cross'],
  'w.mirador': ['el Mirador del Cielo', 'the Sky Viewpoint'],
  'w.telescopio': ['el telescopio de monedas', 'the coin telescope'],
  'w.telefono': ['el teléfono público', 'the public payphone'],
  'w.virgen': ['la Virgen del Carmen', 'the shrine of the Virgin of Carmen'],
  'w.escalinata': ['la Escalinata de la Virgen', 'the Stairway of the Virgin'],
  'w.cancha': ['la Cancha El Cerro', 'the futsal court'],
  'w.parada': ['la parada del bus', 'the bus shelter'],
  'w.faroles': ['el Callejón de los Faroles', 'Lantern Alley'],
  'w.almendros': PL('los Almendros', 'the almond trees'),
  'w.capilla': ['la Plazoleta de la Capilla', 'the chapel square'],
  'w.eucaliptos': PL('los eucaliptos del filo', 'the eucalyptus trees on the ridge'),
  'w.cables': ['el enredo de cables', 'the tangle of wires'],
  'w.carrito': ['el carrito de fruta', 'the fruit cart'],
  'w.condor': ['el mural del Cóndor del Cerro', 'the condor mural'],
  'w.fiesta': ['el mural de la Fiesta de la Ladera', 'the festival mural'],
  'w.cerro': ['el mural del Cerro Verde', 'the green hill mural'],
  'w.arco': ['el Arco de Bienvenida', 'the welcome arch'],
  'w.placas': PL('las placas de las calles', 'the street-name plaques'),
  'w.rayuela': ['la rayuela', 'the hopscotch'],
  'w.huerta': ['la huerta de Don Anselmo', "Don Anselmo's vegetable garden"],
  'w.espantapajaros': ['el espantapájaros', 'the scarecrow'],
  'w.cruzcamino': ['la cruz del camino', 'the roadside cross'],
  'w.palomas': PL('las palomas del cable', 'the pigeons on the wire', 'animal'),               // (animals are registered as 'nature', but nobody says "if you like nature, look at the sleeping dog": R3-022)
  'w.perro': ['el perro dormido', 'the sleeping street dog', 'animal'],
  'w.guardian': ['el perro Canelo, guardián de la huerta', 'Canelo, the garden dog', 'animal'],
  'w.gallinas': PL('las gallinas de doña Rosa', "Doña Rosa's hens", 'animal'),
  'w.columpio': ['el columpio de llanta', 'the tyre swing'],
  'w.cometa': ['la cometa del mirador', 'the kite at the viewpoint', 'thing'],             // (its kind is 'vista', but a kite is not a view)
  'w.balon': ['el balón de la cancha', 'the football on the court'],
  'w.soldadura': ['la soldadura del Chispa en el callejón', "El Chispa's welding in the alley"],
};

/** discovery kind -> how it is told */
const GROUP = { vista: 'view', mirador: 'view', shrine: 'shrine', nature: 'nature', mural: 'mural', story: 'place', object: 'thing', hidden: 'thing' };

/** Each opening takes a noun phrase with its article: "Pase por la Cancha El Cerro." (three per group, so a second question is not answered with the same words) */
export const HINT_INTRO = {
  view: [['Dicen que vale la pena asomarse a', "They say it's worth stopping to look at"], ['Si le gusta mirar, no se pierda', "If you like looking, don't miss"], ['Yo que usted miraría', "If I were you I'd have a look at"]],
  place: [['Pase por', 'Drop by'], ['Si anda de paseo, no se pierda', "If you're out for a walk, don't miss"], ['Dicen que vale la pena ver', "They say it's worth seeing"]],
  shrine: [['Pase a ver', 'Go and see'], ['Vale la pena ver', "It's worth seeing"], ['No se pierda', "Don't miss"]],
  nature: [['Fíjese en', 'Take a look at'], ['Si le gusta la naturaleza, mire', 'If you like nature, look at'], ['Vale la pena mirar', "It's worth looking at"]],
  animal: [['Fíjese en', 'Take a look at'], ['Si le gustan los animales, mire', 'If you like animals, look at'], ['Vale la pena mirar', "It's worth looking at"]],
  mural: [['Vale la pena ver', "It's worth seeing"], ['Fíjese en', 'Take a look at'], ['Si le gusta el arte, no se pierda', "If you like art, don't miss"]],
  thing: [['Fíjese en', 'Take a look at'], ['Yo que usted miraría', "If I were you I'd have a look at"], ['Vale la pena mirar', "It's worth looking at"]],
};

/** The English of a discovery when the table has no entry: a short `en` is a name, a sentence is a description (not a name): then the Spanish name stands, as a proper name. */
const shortEn = (d) => { const e = String(d.en ?? '').trim(); return e && e.split(/\s+/).length <= 5 && !/[.:;,!?]/.test(e) ? (/^(the|a|an)\s/i.test(e) ? e : 'the ' + e) : String(d.name ?? '').trim(); };

/**
 * How to say a public discovery in a sentence: { es, en, group, plural }. `es` is the Spanish noun phrase with its article, or null when the table has no entry:
 * the caller then puts the article on the discovery's own name (dialogue.js withArticle) and `plural` is null (the caller reads it off that article). `en` carries its article ("the summit cross").
 */
export function hintPhrase(d) {
  const t = PHRASE[d.id];
  return { es: t ? t[0] : null, en: t ? t[1] : shortEn(d), group: t?.[2] ?? GROUP[d.kind] ?? 'thing', plural: t ? t[3] === true : null };
}
