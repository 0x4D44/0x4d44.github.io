// INTERIORS (A3): the small things that fill the drawers, wardrobes and cupboards (contents.js picks them, containers.js shows them).
//   * ITEMS      ~190 ordinary objects, each with a bilingual 'Examinar' line (Spanish first, English subtitle like the rest of the game), the container POOLS it
//                belongs to (carcass.js slot.pool) and an optional household filter (`when`): a teenager's wardrobe has a football shirt, an elder's a mantilla.
//   * drawProp   draws one object (an ordinary one, a paper, a special find) into the building's contents mesh through the stand-in Pen. Everything is flat
//                colour on ONE material ('plastic_solid' + vertex colours), so an open container costs a single extra draw call for its contents.
// Pure data + drawing: no three.js import here (the Pen does it), so node and the page share the file.
import { u01 } from './standins.js';

const NY = ['ny'], FLATM = 'plastic_solid';
const shade = (hex, k) => { const f = (s) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * k))); return (f(16) << 16) | (f(8) << 8) | f(0); };
const FL = (P, x, y, z, w, h, d, col, ry = 0) => P.flat(x, y, z, w, h, d, col, NY, ry);
const CY = (P, x, y, z, r, h, col, seg = 10, r1) => P.cyl(FLATM, x, y, z, r, h, seg, col, r1);
const HC = (P, x, y, z, r, len, ax, col) => P.hcyl(FLATM, x, y, z, r, len, ax, 8, col);
const SP = (P, x, y, z, rx, ry, rz, col, seg = 8) => P.sphere(FLATM, x, y, z, rx, ry, rz, col, seg);

// ------------------------------------------------------------------ households: the `when` filters of an item
const PRED = {
  kids: (h) => h.kids > 0, babies: (h) => !!h.babies, teen: (h) => !!h.teen, elder: (h) => !!h.elder, altar: (h) => !!h.altar, crochet: (h) => !!h.crochet,
  poor: (h) => !h.income, rich: (h) => !!h.income, shopkeeper: (h) => h.kind === 'shopkeeper', family: (h) => h.kind === 'family', couple: (h) => h.kind === 'couple', students: (h) => h.kind === 'students',
  cat: (h) => h.pets.includes('cat'), dog: (h) => h.pets.includes('dog'), canary: (h) => h.pets.includes('canary'),
  football: (h) => h.hobby === 'football', music: (h) => h.hobby === 'music', plants: (h) => h.hobby === 'plants', reading: (h) => h.hobby === 'reading', cooking: (h) => h.hobby === 'cooking', sewing: (h) => h.hobby === 'sewing',
  radio: (h) => h.hobby === 'radio', pigeons: (h) => h.hobby === 'pigeons',
};
/** `a|b` = a or b, `a&b` = both, `!a` = not a. Empty = always. */
export const whenOk = (expr, hh) => !expr || !hh || expr.split('|').some((alt) => alt.split('&').every((t) => (t[0] === '!' ? !PRED[t.slice(1)](hh) : PRED[t](hh))));
export const PREDICATES = Object.keys(PRED);

// ------------------------------------------------------------------ the ordinary things
// I(id, shape, w, h, d, colour, es, en, 'pool pool:weight ...', when). Sizes in metres; a shape is one of SH below; colour 'team' takes the household's team colour.
export const ITEMS = [];
const I = (id, sh, w, h, d, col, es, en, pools, when = '') => {
  const p = new Map(pools.split(' ').map((s) => { const [k, v] = s.split(':'); return [k, v ? +v : 1]; }));
  ITEMS.push({ id, sh, w, h, d, col, line: [es, en], pools: p, when });
};

// ---- clothes that hang (w = the garment's width; it hangs edge-on to the front like clothes on a rail)
I('uniforme', 'hang', 0.38, 0.85, 0.05, 0x2f4f8a, `El uniforme del colegio, planchado para mañana. Un botón cuelga de un hilo distinto.`, `The school uniform, ironed for tomorrow. One button hangs on a different thread.`, 'wardrobe:3', 'kids');
I('vestido15', 'hang', 0.44, 1.15, 0.05, 0xe8a8c8, `Un vestido de quinceañera guardado en plástico. Nadie lo ha estrenado todavía.`, `A quinceañera dress in plastic. Nobody has worn it yet.`, 'wardrobe:3', 'teen');
I('overol', 'hang', 0.4, 0.95, 0.05, 0x2f4a73, `Un overol de trabajo con manchas de pintura vieja y un metro en el bolsillo.`, `Work overalls with old paint stains and a tape measure in the pocket.`, 'wardrobe:2 locker:1');
I('camisa_colgada', 'hang', 0.36, 0.72, 0.05, 0xdfe6ee, `Una camisa blanca de domingo, con el cuello almidonado.`, `A white Sunday shirt with a starched collar.`, 'wardrobe:3');
I('vestido_domingo', 'hang', 0.42, 1.0, 0.05, 0x8fb3a0, `El vestido de los domingos. Huele a naftalina y a flores.`, `The Sunday dress. It smells of mothballs and flowers.`, 'wardrobe:3', '!students');
I('ruana', 'hang', 0.5, 0.85, 0.06, 0x7a4a2e, `Una ruana de lana gruesa, de las que aguantan el frío del páramo.`, `A thick wool ruana, the kind that stands up to the páramo cold.`, 'wardrobe:3');
I('traje', 'hang', 0.44, 1.1, 0.06, 0x2a2f3a, `Un traje oscuro para matrimonios y entierros. Ha servido para las dos cosas.`, `A dark suit for weddings and funerals. It has served for both.`, 'wardrobe:2', '!students');
I('camiseta_equipo', 'hang', 0.46, 0.7, 0.04, 'team', `La camiseta del equipo, sagrada: no se mete a la lavadora.`, `The team shirt, sacred: it never goes in the washing machine.`, 'wardrobe:4 dresser:2', 'football|teen|students');
I('abrigo', 'hang', 0.5, 1.0, 0.07, 0x4a3f38, `Un abrigo pesado que casi nunca hace falta… menos en las noches de lluvia.`, `A heavy coat that is hardly ever needed… except on rainy nights.`, 'wardrobe:1', 'rich');
I('bata', 'hang', 0.4, 0.9, 0.06, 0xc59ab0, `Una bata de franela con el bolsillo lleno de pañuelos.`, `A flannel dressing gown with its pocket full of handkerchiefs.`, 'wardrobe:2');
I('delantal', 'hang', 0.36, 0.8, 0.04, 0xe8d8b8, `Un delantal de cocina con las manchas de mil sancochos.`, `A kitchen apron with the stains of a thousand sancochos.`, 'wardrobe:2 pantry:1 kitchen_upper:0.4');
I('bata_blanca', 'hang', 0.42, 0.95, 0.05, 0xf4f4f0, `Una bata blanca, impecable, con un bolígrafo olvidado en el bolsillo.`, `A spotless white coat with a forgotten pen in the pocket.`, 'locker:3 medcab_low:2');

// ---- folded things on shelves and in drawers
I('camisetas', 'stack', 0.3, 0.14, 0.26, 0xd5deea, `Camisetas dobladas con cuidado: huelen a jabón de barra.`, `Neatly folded T-shirts that smell of bar soap.`, 'wardrobe:3 dresser:3');
I('jeans', 'stack', 0.32, 0.16, 0.28, 0x3a5a8a, `Los jeans buenos, los de salir. Los otros ya tienen remiendos en las rodillas.`, `The good jeans, for going out. The others already have patched knees.`, 'wardrobe:3 dresser:2');
I('sueter', 'stack', 0.34, 0.15, 0.28, 0xa8473a, `Un suéter de lana tejido a mano, un poco grande para quien lo hereda.`, `A hand-knitted wool sweater, a little big for whoever inherits it.`, 'wardrobe:3 dresser:2');
I('sabanas', 'stack', 0.38, 0.14, 0.3, 0xf2eee0, `Sábanas limpias, dobladas en cuatro, con una ramita de lavanda.`, `Clean sheets folded in four, with a sprig of lavender.`, 'wardrobe:3');
I('cobijas', 'stack', 0.5, 0.28, 0.36, 0x9a4a3a, `Cobijas de lana pesada para las noches frías de la loma.`, `Heavy wool blankets for the cold nights up on the hill.`, 'wardrobe:3 chest:3 nightstand_door:2');
I('toallas', 'stack', 0.32, 0.16, 0.28, 0xdfe7ea, `Toallas gruesas y ya un poco duras de tanto sol en el tendedero.`, `Thick towels, stiff from so much sun on the clothesline.`, 'wardrobe:2 dresser:2 barber:2');
I('medias', 'stack', 0.22, 0.07, 0.2, 0x6a7a8a, `Medias enrolladas por pares, cada una con su pareja… casi todas.`, `Socks rolled in pairs, each with its partner… nearly all.`, 'dresser:4 nightstand_drawer:1');
I('ropa_interior', 'stack', 0.22, 0.06, 0.2, 0xefe8e0, `Ropa interior doblada. Nada que ver aquí, sigamos.`, `Folded underwear. Nothing to see here, moving on.`, 'dresser:3');
I('bufandas', 'stack', 0.26, 0.08, 0.22, 0xb8503a, `Bufandas tejidas por la abuela, cada una de un color distinto.`, `Scarves knitted by grandma, each in a different colour.`, 'dresser:2 wardrobe:2');
I('cinturones', 'roll', 0.2, 0.06, 0.2, 0x5a3a24, `Cinturones enrollados como serpientes dormidas.`, `Belts rolled up like sleeping snakes.`, 'dresser:3 wardrobe:1');
I('ropa_bebe', 'stack', 0.22, 0.08, 0.2, 0xf6e8a8, `Ropita de bebé, diminuta y amarilla, doblada una por una.`, `Tiny yellow baby clothes, folded one by one.`, 'dresser:3 wardrobe:2 chest:1', 'babies');
I('mantilla', 'stack', 0.3, 0.04, 0.3, 0x1c1c1e, `Una mantilla negra de encaje para la misa.`, `A black lace mantilla for Mass.`, 'wardrobe:3 chest:2 dresser:2', 'altar&elder');
I('zapatos_caja', 'box', 0.34, 0.12, 0.22, 0xc9a46a, `Una caja de zapatos con los zapatos de domingo, todavía brillantes.`, `A shoebox with the Sunday shoes, still shining.`, 'wardrobe:3');
I('tenis', 'shoes', 0.3, 0.1, 0.28, 0xe8e8e0, `Un par de tenis blancos, remendados con pegante y mucho cariño.`, `A pair of white trainers, mended with glue and a lot of love.`, 'wardrobe:2 locker:2', 'kids|teen|students');
I('guayos', 'shoes', 0.26, 0.1, 0.26, 0x2a2a2a, `Guayos de fútbol con barro seco y tapones gastados.`, `Football boots with dried mud and worn studs.`, 'wardrobe:2 locker:3', 'football|teen|kids');
I('maleta', 'box', 0.55, 0.22, 0.35, 0x8a5a3a, `Una maleta de cartón prensado, lista desde hace años por si hay que irse.`, `A pressed-cardboard suitcase, packed for years in case someone has to leave.`, 'wardrobe:2 chest:1');
I('sombrero_caja', 'tin', 0.3, 0.16, 0.3, 0x6a3a3a, `Una caja redonda con el sombrero del abuelo. Todavía huele a tabaco.`, `A round box with grandpa's hat. It still smells of tobacco.`, 'wardrobe:2 chest:3', 'elder');
I('bolsa_bolsas', 'bag', 0.26, 0.24, 0.2, 0xe8e8e8, `La bolsa de las bolsas: todas las del supermercado, por si acaso.`, `The bag of bags: every supermarket bag, just in case.`, 'wardrobe:2 kitchen_base:3 under_sink:3 pantry:1');
I('naftalina', 'box', 0.08, 0.04, 0.08, 0xf2f2e8, `Bolitas de naftalina entre la ropa. El olor no se va nunca.`, `Mothballs among the clothes. The smell never goes away.`, 'wardrobe:3 chest:3 dresser:1');
I('album', 'book', 0.3, 0.05, 0.26, 0x5a3a24, `Un álbum de fotos con las esquinas despegadas: bodas, bautizos y un viaje a la costa.`, `A photo album with unglued corners: weddings, baptisms and one trip to the coast.`, 'wardrobe:2 dresser:2 chest:3 wallunit:3 tvstand:2 vitrine:2');
I('cepillo_betun', 'box', 0.2, 0.08, 0.14, 0x2a2018, `Betún negro y un cepillo gastado: los zapatos de la familia brillan gracias a esto.`, `Black polish and a worn brush: the family's shoes shine thanks to this.`, 'wardrobe:2 under_sink:1');
I('costurero', 'tin', 0.22, 0.1, 0.22, 0x8fa8c8, `Una lata de galletas de mantequilla que hace años guarda hilos y botones.`, `A butter-cookie tin that has held threads and buttons for years.`, 'wardrobe:1 dresser:3 sewing:4 chest:1');
I('balon', 'ball', 0.22, 0.22, 0.22, 0xf0eee6, `Un balón desinflado que espera la bomba y el domingo.`, `A flat football waiting for the pump and for Sunday.`, 'wardrobe:2 locker:3 tvstand:1', 'football|kids');
I('paraguas', 'roll', 0.5, 0.05, 0.05, 0x2a2f3a, `Un paraguas negro con una varilla doblada. Aquí llueve casi todas las tardes.`, `A black umbrella with a bent rib. It rains here nearly every afternoon.`, 'wardrobe:2 chest:1');
I('cobija_extra', 'stack', 0.3, 0.14, 0.25, 0x6a8a9a, `Una cobija de repuesto, doblada, para cuando llega visita.`, `A spare blanket, folded, for when visitors come.`, 'nightstand_door:3 wardrobe:1');
I('tela_mantel', 'stack', 0.3, 0.08, 0.25, 0xf2eadc, `Manteles de domingo, bordados, que solo salen para las visitas.`, `Embroidered Sunday tablecloths that only come out for visitors.`, 'sideboard:4 wallunit:2 pantry:1');

// ---- nightstand and personal drawers
I('pastillero', 'box', 0.12, 0.03, 0.05, 0xe8e0d0, `Un pastillero de siete días: hoy falta la casilla del miércoles.`, `A seven-day pillbox: Wednesday's compartment is empty.`, 'nightstand_drawer:3 nightstand_door:1 medcab:2', 'elder|couple');
I('rosario', 'chain', 0.1, 0.01, 0.1, 0x6a4a2a, `Un rosario de cuentas gastadas por tantos años de rezos.`, `A rosary with beads worn smooth by years of prayer.`, 'nightstand_drawer:4 chest:2 vitrine:2 dresser:1', 'altar');
I('gafas', 'glasses', 0.13, 0.01, 0.12, 0x2a2a2a, `Unas gafas de leer con el vidrio remendado con esparadrapo.`, `Reading glasses with a lens mended with sticking plaster.`, 'nightstand_drawer:3 desk:2 filing:1', 'elder');
I('panuelos', 'stack', 0.12, 0.05, 0.12, 0xf2f0ea, `Pañuelos de tela con las iniciales bordadas en una esquina.`, `Cloth handkerchiefs with initials embroidered in a corner.`, 'nightstand_drawer:3 dresser:3');
I('libretica', 'book', 0.09, 0.015, 0.13, 0x3a5a8a, `Una libreta pequeña de teléfonos, la mitad ya sin dueño.`, `A small phone-number notebook, half the numbers without an owner now.`, 'nightstand_drawer:3 desk:3 filing:1');
I('lapiceros', 'roll', 0.14, 0.012, 0.012, 0x2f5f9a, `Lapiceros que solo escriben si los calientas con el aliento.`, `Pens that only write if you warm them with your breath.`, 'nightstand_drawer:2 desk:3 student_desk:3 teacher_desk:2 cash:3 pharmacy_cash:2 filing:2');
I('baraja', 'box', 0.065, 0.02, 0.09, 0xb8342c, `Una baraja con el as de oros remendado con cinta.`, `A deck of cards with the ace of coins mended with tape.`, 'nightstand_drawer:2 tvstand:3 sideboard:3 wallunit:2');
I('foto', 'frame', 0.13, 0.014, 0.17, 0xb8b0a0, `Una foto en blanco y negro: dos jóvenes frente a una iglesia, sonriendo a la cámara.`, `A black-and-white photo: two young people in front of a church, smiling at the camera.`, 'nightstand_drawer:3 dresser:2 vitrine:3 wallunit:3 chest:2');
I('linterna', 'tool', 0.18, 0.045, 0.045, 0xd8a838, `Una linterna que funciona si le das un golpecito, para los cortes de luz.`, `A flashlight that works if you tap it, for the power cuts.`, 'nightstand_drawer:2 tools:3 locker:2 kitchen_base:1 under_sink:1');
I('fosforos', 'box', 0.07, 0.035, 0.045, 0xb85a2a, `Una vela y una caja de fósforos, por si se va la luz.`, `A candle and a box of matches, in case the power goes.`, 'nightstand_drawer:3 kitchen_upper:2 pantry:2 sideboard:2');
I('biblia', 'book', 0.14, 0.04, 0.2, 0x2a2a30, `Una biblia pequeña de tapa negra, con una estampita de la Virgen entre las páginas.`, `A small black-covered Bible with a holy card of the Virgin between the pages.`, 'nightstand_drawer:4 chest:3 sideboard:2 wallunit:2 dresser:1', 'altar');
I('colonia', 'bottle', 0.05, 0.1, 0.05, 0xc9a0d8, `Un frasco de colonia casi vacío, guardado para las ocasiones.`, `A nearly empty cologne bottle, saved for occasions.`, 'nightstand_drawer:2 dresser:3 vitrine:2');
I('crema_azul', 'tin', 0.07, 0.035, 0.07, 0x7aa8c8, `Una lata de crema azul para las manos, la de todas las abuelas.`, `A tin of blue hand cream, every grandmother's.`, 'nightstand_drawer:3 dresser:2 medcab:1', 'elder|couple');
I('cintas_pelo', 'roll', 0.12, 0.02, 0.02, 0xe85a8a, `Cintas y moñitos para el pelo de {K}.`, `Ribbons and hair bows for {K}.`, 'dresser:3 nightstand_drawer:1', 'kids');
I('audifonos', 'chain', 0.09, 0.01, 0.09, 0xe8e8e8, `Unos audífonos enredados que nadie ha logrado desenredar.`, `A pair of earphones tangled beyond anyone's patience.`, 'nightstand_drawer:3 dresser:2 student_desk:2 tvstand:1', 'teen|students');
I('loteria', 'sheet', 0.07, 0.002, 0.13, 0xe8d8a0, `Un billete de lotería sin premio, guardado por si acaso.`, `A losing lottery ticket, kept just in case.`, 'nightstand_drawer:3 cash:3 dresser:2');
I('moneditas', 'coins', 0.12, 0.012, 0.1, 0xc8c8c0, `Un puñado de monedas de cien y de doscientos pesos.`, `A handful of one- and two-hundred-peso coins.`, 'nightstand_drawer:3 dresser:3 cash:2 pharmacy_cash:2');
I('revistas', 'stack', 0.22, 0.06, 0.3, 0xe8a8a8, `Revistas de farándula con las esquinas dobladas en las páginas favoritas.`, `Gossip magazines with the corners folded at the favourite pages.`, 'nightstand_door:3 tvstand:2 wallunit:1');
I('bolsa_agua', 'bag', 0.22, 0.06, 0.3, 0xc8483a, `Una bolsa de agua caliente para los pies fríos del invierno.`, `A hot-water bottle for cold winter feet.`, 'nightstand_door:3', 'elder|couple');
I('bacinilla', 'pot', 0.26, 0.14, 0.26, 0xe8e8e0, `Una bacinilla de peltre esmaltado. Nadie dice nada, pero ahí está.`, `An enamelled chamber pot. Nobody mentions it, but there it is.`, 'nightstand_door:3', 'elder');
I('pantuflas', 'shoes', 0.26, 0.09, 0.26, 0xa8c8b8, `Unas pantuflas de lana, una más gastada que la otra.`, `Wool slippers, one more worn than the other.`, 'nightstand_door:3 wardrobe:1');
I('jarabe', 'bottle', 0.06, 0.16, 0.06, 0x8a4a2a, `Un frasco de jarabe para la tos, medio gastado.`, `A bottle of cough syrup, half used.`, 'nightstand_door:3 medcab:2 medcab_low:2 kitchen_upper:1');
I('panuelos_caja', 'box', 0.22, 0.09, 0.11, 0xa8d0e0, `Una caja de pañuelos desechables, casi vacía.`, `A tissue box, almost empty.`, 'nightstand_door:3 medcab_low:2 desk:1');
I('novelas', 'stack', 0.2, 0.09, 0.14, 0x8a5a7a, `Una pila de novelas de bolsillo con las puntas dobladas.`, `A pile of paperbacks with dog-eared pages.`, 'nightstand_door:3 wallunit:2 chest:1', 'reading|elder');

// ---- dresser drawers
I('joyero', 'box', 0.2, 0.08, 0.14, 0x7a2f3a, `Un joyero con una bailarina que ya no gira. Adentro: aretes sueltos, una cadenita, botones.`, `A jewellery box with a ballerina who no longer turns. Inside: odd earrings, a little chain, buttons.`, 'dresser:3 vitrine:2');
I('botones', 'jar', 0.1, 0.12, 0.1, 0xa8c8d8, `Un frasco lleno de botones de todas las camisas que alguna vez existieron.`, `A jar of buttons from every shirt that ever existed.`, 'dresser:3 sewing:4 kitchen_upper:1');
I('casetes', 'cass', 0.24, 0.1, 0.07, 0x2a2a2a, `Casetes grabados de la radio, con letra a lápiz: «Lo mejor del año».`, `Cassettes taped off the radio, labelled in pencil: "Best of the year".`, 'dresser:2 tvstand:3 wallunit:2 nightstand_door:1');
I('cartas_atadas', 'bundle', 0.16, 0.05, 0.1, 0xb83a3a, `Cartas atadas con una cinta que alguna vez fue roja. Mejor no leerlas.`, `Letters tied with a ribbon that was once red. Better not to read them.`, 'dresser:3 chest:3 nightstand_drawer:1 desk:1');
I('boletin', 'sheet', 0.21, 0.003, 0.28, 0xf0ece0, `El boletín del colegio: matemáticas sufridas, español sobresaliente.`, `The school report: maths a struggle, Spanish outstanding.`, 'dresser:2 desk:2 student_desk:3 filing:1', 'kids');
I('facturas', 'bundle', 0.2, 0.05, 0.12, 0x8a8a7a, `Un manojo de facturas de la luz y el agua, ordenadas por mes.`, `A bundle of power and water bills, sorted by month.`, 'dresser:3 desk:4 filing:4 cash:1 sideboard:1');
I('cedulas', 'sheet', 0.16, 0.004, 0.22, 0xe8e0c8, `Copias de cédulas, el registro civil de todos y un carné de vacunas.`, `Copies of ID cards, everyone's birth certificate and a vaccination card.`, 'dresser:2 filing:3 desk:3 chest:1');
I('billetera', 'box', 0.11, 0.025, 0.09, 0x3a2a1c, `Una billetera vieja con una foto, un recibo y dos billetes arrugados.`, `An old wallet with a photo, a receipt and two crumpled notes.`, 'dresser:3 nightstand_drawer:2 desk:1');
I('pilas', 'box', 0.1, 0.04, 0.07, 0xd8b838, `Pilas de todos los tamaños, algunas gastadas, ninguna con etiqueta.`, `Batteries of every size, some dead, none labelled.`, 'dresser:2 tools:3 kitchen_base:1 nightstand_drawer:1 tvstand:2');
I('velas', 'roll', 0.14, 0.03, 0.03, 0xf2ead2, `Velas de cumpleaños y de apagón, mezcladas sin remedio.`, `Birthday candles and power-cut candles, hopelessly mixed.`, 'dresser:2 kitchen_upper:3 sideboard:2');
I('cepillo_pelo', 'box', 0.2, 0.05, 0.06, 0x8a5a3a, `Un cepillo con pelo enredado y un peine de carey.`, `A brush full of tangled hair and a tortoiseshell comb.`, 'dresser:3 nightstand_drawer:2 barber:3');
I('rosario_comunion', 'chain', 0.1, 0.01, 0.1, 0xf2e8d8, `El rosario de la primera comunión, en su cajita.`, `The first-communion rosary in its little box.`, 'dresser:2 chest:3 nightstand_drawer:1', 'altar&kids');
I('pasaporte', 'book', 0.09, 0.008, 0.13, 0x2a3f6a, `Un pasaporte sin un solo sello. El viaje sigue siendo un plan.`, `A passport without a single stamp. The trip is still a plan.`, 'dresser:2 desk:2 filing:2 chest:1', 'rich|students');

// ---- sideboard, wall unit, tv stand: the front-room things
I('vajilla', 'plates', 0.22, 0.12, 0.22, 0xf1ece0, `La vajilla buena, con flores en el borde. Nadie la usa: por eso no se rompe.`, `The good china with flowers on the rim. Nobody uses it, so nothing breaks.`, 'sideboard:4 wallunit:2 kitchen_upper:1');
I('vasos', 'cup', 0.08, 0.12, 0.08, 0xcfe4ec, `Vasos de vidrio de colores, de los de antes.`, `Old-fashioned coloured glasses.`, 'sideboard:3 kitchen_upper:2');
I('copas', 'cup', 0.07, 0.16, 0.07, 0xe4eef4, `Copas de cristal para el brindis de fin de año.`, `Crystal glasses for the New Year toast.`, 'sideboard:3 vitrine:2 wallunit:2', 'rich');
I('aguardiente', 'bottle', 0.08, 0.26, 0.08, 0xcfe8d8, `Una botella de aguardiente sin abrir, reservada para diciembre.`, `An unopened bottle of aguardiente, saved for December.`, 'sideboard:2 wallunit:2');
I('parques', 'box', 0.38, 0.05, 0.38, 0xd8a838, `Un tablero de parqués con las fichas contadas y un dado que hace trampa.`, `A parqués board with every counter accounted for and a die that cheats.`, 'sideboard:3 tvstand:3 wallunit:3');
I('domino', 'box', 0.2, 0.05, 0.1, 0x2a2a2a, `Un dominó al que le falta la mula de seises: se juega con la tapa de una botella.`, `A domino set missing the double six, replaced by a bottle cap.`, 'sideboard:2 tvstand:2 wallunit:2');
I('jarra', 'pot', 0.14, 0.22, 0.14, 0x7a9ab8, `Una jarra de vidrio para la limonada de los domingos.`, `A glass jug for Sunday lemonade.`, 'sideboard:2 kitchen_upper:2');
I('termo', 'bottle', 0.1, 0.3, 0.1, 0xc23a30, `Un termo rojo para el tinto de la tarde.`, `A red thermos for the afternoon tinto.`, 'sideboard:3 kitchen_upper:2 kitchen_base:1 locker:1 pantry:1');
I('azucarera', 'jar', 0.1, 0.1, 0.1, 0xf0e8d8, `Una azucarera de loza con la tapa descascarada.`, `A china sugar bowl with a chipped lid.`, 'sideboard:2 kitchen_upper:3');
I('cubiertos', 'box', 0.3, 0.06, 0.12, 0x5a3a2a, `Una caja de cubiertos de acero, regalo de boda.`, `A box of steel cutlery, a wedding present.`, 'sideboard:3 kitchen_base:1 wallunit:1');
I('caramelos', 'jar', 0.1, 0.16, 0.1, 0xf08a8a, `Un frasco de caramelos de menta para las visitas.`, `A jar of mints for visitors.`, 'sideboard:2 cash:2 vitrine:1');
I('control_remoto', 'box', 0.06, 0.02, 0.18, 0x2a2a2a, `Controles remotos de cosas que ya no existen.`, `Remote controls for things that no longer exist.`, 'tvstand:4 wallunit:2');
I('cables', 'chain', 0.16, 0.03, 0.16, 0x2a2a2a, `Un nudo de cables y cargadores que nadie se atreve a desenredar.`, `A knot of cables and chargers nobody dares untangle.`, 'tvstand:4 desk:2 tools:1');
I('videojuego', 'box', 0.22, 0.05, 0.16, 0x2a3f6a, `Un control de videojuego con el joystick pelado, para dos jugadores.`, `A game controller with a worn-out joystick, for two players.`, 'tvstand:3', 'kids|teen|students');
I('dvd', 'cass', 0.26, 0.19, 0.015, 0x2a5a9a, `Películas en DVD con el título escrito a mano: «Navidad», «Boda».`, `DVDs with handwritten titles: "Christmas", "Wedding".`, 'tvstand:3 wallunit:2');
I('tapete', 'stack', 0.3, 0.02, 0.3, 0xf2e8d0, `Un tapete tejido a crochet para poner sobre el televisor.`, `A crocheted doily to put on top of the television.`, 'tvstand:2 wallunit:2 sideboard:2', 'crochet');
I('enciclopedia', 'book', 0.2, 0.05, 0.27, 0x7a2f2a, `Una enciclopedia por entregas a la que le faltan tres tomos.`, `An encyclopedia bought in instalments, three volumes missing.`, 'wallunit:3 tvstand:1 desk:1', '!students');
I('trofeo', 'figure', 0.1, 0.2, 0.1, 0xd4a830, `Un trofeo pequeño de un campeonato de barrio: «Segundo puesto».`, `A small trophy from a barrio championship: "Second place".`, 'wallunit:3 vitrine:3 tvstand:1', 'football|kids');
I('platos_decor', 'plates', 0.2, 0.2, 0.02, 0xe8e8f0, `Un plato conmemorativo de una visita del Papa, con marco de madera.`, `A commemorative plate of a papal visit in a wooden frame.`, 'vitrine:3 wallunit:2', 'altar|elder');

// ---- the display cabinet
I('figuritas', 'figure', 0.08, 0.14, 0.08, 0xf2e8e8, `Figuritas de porcelana: un pastor, una bailarina y un perro sin una oreja.`, `Porcelain figurines: a shepherd, a ballerina and a dog missing an ear.`, 'vitrine:4 wallunit:2');
I('tazas_finas', 'cup', 0.09, 0.06, 0.09, 0xf0eef4, `Tazas finas de café con su platico, que nadie ha usado jamás.`, `Fine coffee cups with saucers that nobody has ever used.`, 'vitrine:3 sideboard:2');
I('cisne', 'figure', 0.1, 0.14, 0.1, 0xcfe8f0, `Un cisne de cristal, regalo de una tía de lejos.`, `A crystal swan, a gift from a faraway aunt.`, 'vitrine:3');
I('concha', 'figure', 0.1, 0.07, 0.1, 0xf0d8c8, `Una concha de mar de la costa: si la pegas al oído, suena.`, `A seashell from the coast: hold it to your ear and it sings.`, 'vitrine:3 wallunit:2');
I('caja_musica', 'box', 0.12, 0.08, 0.1, 0x7a4a2a, `Una caja de música que toca media canción antes de atascarse.`, `A music box that plays half a tune before jamming.`, 'vitrine:3 chest:2 dresser:1');
I('velon', 'tin', 0.06, 0.2, 0.06, 0xf4eedc, `El velón de la primera comunión, con el lazo blanco ya amarillento.`, `The first-communion candle, its white ribbon yellowing now.`, 'vitrine:2 chest:3', 'altar&kids');
I('muneca', 'figure', 0.1, 0.22, 0.08, 0xe8b8c0, `Una muñeca de porcelana con el vestido bordado, sin un brazo.`, `A porcelain doll in an embroidered dress, one arm missing.`, 'vitrine:2 chest:3 wardrobe:1', 'kids|elder');

// ---- the trunk
I('vestido_novia', 'stack', 0.4, 0.2, 0.3, 0xf6f0e4, `Un vestido de novia envuelto en papel de seda, amarillo en los pliegues.`, `A wedding dress wrapped in tissue paper, yellowing at the folds.`, 'chest:4', '!students');
I('zapatitos', 'shoes', 0.12, 0.06, 0.1, 0xd8c8a8, `Zapatitos de bebé bronceados, de hace cuarenta años.`, `Bronzed baby shoes from forty years ago.`, 'chest:3 vitrine:2', 'elder|family');
I('trompo', 'bag', 0.18, 0.14, 0.14, 0xb8a888, `Un trompo de madera y unas canicas en una bolsa de tela.`, `A wooden spinning top and some marbles in a cloth bag.`, 'chest:3 locker:1 teacher_desk:1');
I('retratos', 'stack', 0.22, 0.05, 0.28, 0xd8d0c0, `Retratos de estudio de gente seria, de cuando sonreír costaba plata.`, `Studio portraits of serious people, from when smiling cost money.`, 'chest:3 wallunit:1 dresser:1');

// ---- the pantry and the kitchen
I('arroz', 'bag', 0.16, 0.24, 0.1, 0xf2eee0, `Un bulto de arroz, de los que alcanzan para todo el mes.`, `A sack of rice, enough for the whole month.`, 'pantry:4 kitchen_upper:1');
I('lentejas', 'bag', 0.14, 0.2, 0.1, 0xb87a3a, `Lentejas en bolsa: el almuerzo de los lunes, con arroz y plátano.`, `Lentils in a bag: Monday's lunch, with rice and plantain.`, 'pantry:3');
I('frijoles', 'bag', 0.14, 0.2, 0.1, 0x8a3a2a, `Frijoles rojos en bolsa: los del sábado, para la olla a presión.`, `Red beans in a bag: Saturday's, for the pressure cooker.`, 'pantry:3');
I('panela', 'box', 0.12, 0.06, 0.1, 0x8a5a2a, `Bloques de panela para el aguapanela de todas las mañanas.`, `Blocks of panela for the aguapanela every morning.`, 'pantry:4 kitchen_upper:2');
I('harina_maiz', 'bag', 0.15, 0.22, 0.09, 0xf0e0a0, `Harina de maíz para las arepas del desayuno.`, `Cornmeal for the breakfast arepas.`, 'pantry:4');
I('cafe_lata', 'tin', 0.12, 0.16, 0.12, 0x6a3a1a, `Una lata de café molido, recién abierta: perfuma toda la alacena.`, `A tin of ground coffee, freshly opened: it perfumes the whole cupboard.`, 'pantry:3 kitchen_upper:4 sideboard:1');
I('aceite', 'bottle', 0.1, 0.26, 0.1, 0xe8c850, `Una botella de aceite, rellenada hasta el último dedo.`, `A bottle of cooking oil, refilled to the last finger.`, 'pantry:3 kitchen_base:1');
I('azucar', 'bag', 0.14, 0.18, 0.09, 0xf6f2e8, `Azúcar a granel en una bolsa con un nudo.`, `Loose sugar in a knotted bag.`, 'pantry:2 kitchen_upper:1');
I('atun', 'tin', 0.08, 0.04, 0.08, 0xc8c8c8, `Latas de atún, de las que se guardan para cuando no hay tiempo de cocinar.`, `Tins of tuna, kept for when there is no time to cook.`, 'pantry:3 kitchen_upper:2');
I('leche_condensada', 'tin', 0.075, 0.1, 0.075, 0xe8e0d0, `Una lata de leche condensada, destinada a un postre que todavía no tiene fecha.`, `A tin of condensed milk, destined for a dessert with no date yet.`, 'pantry:2 kitchen_upper:2');
I('huevos', 'box', 0.3, 0.06, 0.3, 0xd8c8a8, `Un cartón de huevos, la mitad ya convertida en arepas de huevo.`, `An egg carton, half of it already turned into arepas de huevo.`, 'pantry:3 fridge:2');
I('cebollas', 'bag', 0.22, 0.2, 0.2, 0xb86a4a, `Un atado de cebolla larga y un ajo que ya brotó.`, `A bunch of spring onions and a garlic head that has already sprouted.`, 'pantry:3 kitchen_base:1');
I('papas', 'bag', 0.3, 0.25, 0.24, 0xb89a6a, `Un costal de papa pastusa, con la tierra todavía en la cáscara.`, `A sack of pastusa potatoes, soil still on the skins.`, 'pantry:3 kitchen_base:2');
I('chocolate_mesa', 'box', 0.2, 0.03, 0.12, 0x4a2a1a, `Tabletas de chocolate de mesa para el desayuno del domingo.`, `Tablets of drinking chocolate for Sunday breakfast.`, 'pantry:3 kitchen_upper:3');
I('aji', 'jar', 0.08, 0.14, 0.08, 0xd8402a, `Un frasco de ají casero: pica de verdad, con sabor a limón.`, `A jar of homemade ají: really hot, with a lime tang.`, 'pantry:3 kitchen_upper:2');
I('miel', 'jar', 0.09, 0.12, 0.09, 0xd8a838, `Un frasco de miel de un pariente del campo.`, `A jar of honey from a relative in the countryside.`, 'pantry:2 kitchen_upper:2');
I('pasta', 'bag', 0.16, 0.22, 0.06, 0xe8d088, `Espaguetis partidos por la mitad para que quepan en la olla.`, `Spaghetti snapped in half to fit in the pot.`, 'pantry:2');
I('aromaticas', 'box', 0.12, 0.08, 0.08, 0x8ab87a, `Aromáticas de manzanilla y de menta, para la tos y para los nervios.`, `Chamomile and mint infusions, for coughs and for nerves.`, 'pantry:3 kitchen_upper:4');
I('especias', 'jar', 0.06, 0.1, 0.06, 0xb87a4a, `Frascos de comino, orégano y pimienta, con las etiquetas escritas a mano.`, `Jars of cumin, oregano and pepper with handwritten labels.`, 'pantry:3 kitchen_upper:4');
I('galletas', 'tin', 0.22, 0.1, 0.22, 0xd8a838, `Una lata de galletas con galletas de verdad, por una vez.`, `A cookie tin that actually holds cookies, for once.`, 'kitchen_upper:3 pantry:2 sideboard:2');
// ---- the fridge (pool 'fridge'), its freezer ('freezer'), the shop's drinks fridge ('drinks') and the pharmacy's cold cabinet ('fridge_meds')
I('bolsa_leche', 'bag', 0.12, 0.2, 0.07, 0xdce8f2, `Una bolsa de leche con la punta cortada y amarrada con un caucho.`, `A bag of milk with its corner cut and tied with a rubber band.`, 'fridge:4');
I('jarra_jugo', 'bottle', 0.1, 0.28, 0.1, 0x8ab04a, `Una jarra de jugo de lulo con la pulpa asentada: hay que agitarla antes de servir.`, `A jug of lulo juice with the pulp settled: shake it before serving.`, 'fridge:4');
I('aguapanela_fria', 'jar', 0.1, 0.22, 0.1, 0xc8943a, `Aguapanela fría en un frasco de mermelada reciclado.`, `Cold aguapanela in a recycled jam jar.`, 'fridge:3', 'poor');
I('arepas_sobrantes', 'box', 0.2, 0.05, 0.18, 0xd8b878, `Arepas de ayer envueltas en papel: mañana se calientan en la plancha.`, `Yesterday's arepas wrapped in paper: tomorrow they go on the griddle.`, 'fridge:3');
I('queso_campesino', 'box', 0.14, 0.07, 0.12, 0xf0e4c0, `Queso campesino en su bolsa, con la corteza ya dura de tanto esperar.`, `Farmhouse cheese in its bag, its rind hard from waiting.`, 'fridge:3');
I('sobras_sancocho', 'pot', 0.22, 0.16, 0.22, 0xb0b4b8, `Una olla con sobras de sancocho, tapada con un plato.`, `A pot of leftover sancocho, covered with a plate.`, 'fridge:4');
I('mantequilla', 'box', 0.1, 0.05, 0.07, 0xf0d870, `Mantequilla con las marcas de un cuchillo que no esperó a que se ablandara.`, `Butter with the marks of a knife that did not wait for it to soften.`, 'fridge:2');
I('gaseosa_litro', 'bottle', 0.1, 0.32, 0.1, 0x4a2a1a, `Una gaseosa de litro y medio: la reserva del domingo, a medias.`, `A one-and-a-half litre soda: Sunday's reserve, half gone.`, 'fridge:3 drinks:5', 'rich|shopkeeper');
I('cervezas_frias', 'bottle', 0.07, 0.22, 0.07, 0x7a4a1a, `Tres cervezas frías, guardadas para cuando juegue el equipo.`, `Three cold beers, kept for when the team plays.`, 'fridge:2 drinks:4', 'football|couple|students');
I('gelatina', 'cup', 0.12, 0.08, 0.12, 0xd83a4a, `Gelatina de colores en un molde: lo poco que sobró del cumpleaños.`, `Coloured jelly in a mould: what little was left from the birthday.`, 'fridge:2', 'kids');
I('yogur', 'bottle', 0.08, 0.2, 0.08, 0xf2a8b8, `Yogur de fresa con una vaca sonriente en la etiqueta.`, `Strawberry yoghurt with a smiling cow on the label.`, 'fridge:2', 'kids|rich');
I('insulina', 'box', 0.1, 0.05, 0.07, 0xf0efe8, `Una caja de insulina y una nota con letra temblorosa: 'no congelar, por favor'.`, `A box of insulin and a note in shaky handwriting: 'do not freeze, please'.`, 'fridge:2', 'elder');
I('limones', 'bag', 0.18, 0.12, 0.16, 0x9ab84a, `Limones de la mata de una vecina, regalados en una bolsa.`, `Lemons from a neighbour's tree, given away in a bag.`, 'fridge:3');
I('portacomida', 'box', 0.2, 0.09, 0.14, 0xe8e8e8, `Un almuerzo en su portacomida para llevar al trabajo, con el nombre escrito con marcador.`, `A packed lunch in its tin, with the name written in marker, for taking to work.`, 'fridge:3', 'family|shopkeeper|couple');
I('cilantro', 'bundle', 0.14, 0.04, 0.1, 0x4a9a4a, `Un atado de cilantro envuelto en papel mojado, para que dure hasta el viernes.`, `A bunch of coriander wrapped in damp paper to last until Friday.`, 'fridge:2');
I('agua_botella', 'bottle', 0.09, 0.3, 0.09, 0xb8d8e8, `Botellas de gaseosa llenas de agua de la llave, por si cortan el acueducto.`, `Soda bottles filled with tap water in case the supply is cut.`, 'fridge:3', 'poor');
I('carton_vacio', 'box', 0.08, 0.2, 0.06, 0xe8f0f8, `El cartón de leche vacío que alguien volvió a guardar, como si nada.`, `The empty milk carton somebody put back, as if nothing had happened.`, 'fridge:1');
I('hielo_bandeja', 'box', 0.18, 0.04, 0.12, 0xb8d8f0, `Una bandeja de hielo que solo suelta los cubos si se le da un golpe seco.`, `An ice tray that only lets go of its cubes with a sharp knock.`, 'freezer:3');
I('carne_congelada', 'bag', 0.2, 0.06, 0.16, 0xc84a4a, `Carne molida congelada en una bolsa, con la fecha escrita con marcador.`, `Frozen mince in a bag, the date written in marker.`, 'freezer:4');
I('pulpa_mora', 'bag', 0.16, 0.04, 0.12, 0x6a2a5a, `Pulpa de mora en bolsitas, una por cada jarra de jugo de la semana.`, `Blackberry pulp in small bags, one for each jug of juice this week.`, 'freezer:4');
I('paletas_limon', 'box', 0.12, 0.1, 0.12, 0xf0e868, `Paletas caseras de limón en vasitos de plástico, con palito y todo.`, `Homemade lemon ice lollies in plastic cups, stick and all.`, 'freezer:3', 'kids');
I('pollo_congelado', 'bag', 0.24, 0.07, 0.16, 0xe8d0a0, `Un pollo congelado tan duro que podría servir de martillo.`, `A frozen chicken hard enough to serve as a hammer.`, 'freezer:3');
I('pote_helado', 'tin', 0.14, 0.12, 0.14, 0xf0e0d0, `Un pote de helado que ya no tiene helado sino frijoles.`, `An ice-cream tub that no longer holds ice cream but beans.`, 'freezer:2');
I('gaseosa_roja', 'bottle', 0.07, 0.24, 0.07, 0xc8302a, `Gaseosa roja, bien fría, de las que piden los niños después del colegio.`, `Cold red soda, the kind children ask for after school.`, 'drinks:5');
I('malta', 'bottle', 0.07, 0.22, 0.07, 0x3a2a1a, `Malta oscura, la favorita de los abuelos y de los que madrugan.`, `Dark malt drink, the favourite of grandparents and early risers.`, 'drinks:4');
I('agua_fria', 'bottle', 0.07, 0.24, 0.07, 0xb8d8e8, `Agua en botella, fría como en ninguna otra parte de la cuadra.`, `Bottled water, colder than anywhere else on the block.`, 'drinks:4');
I('jugo_caja', 'box', 0.07, 0.17, 0.05, 0xe89a3a, `Jugo de naranja en cajita con su pitillo pegado.`, `Orange juice in a carton with its straw taped on.`, 'drinks:4');
I('vacunas_frio', 'box', 0.14, 0.06, 0.1, 0xf0efe8, `Una caja de ampolletas con una etiqueta: 'conservar entre 2 y 8 grados'.`, `A box of ampoules with a label: 'store between 2 and 8 degrees'.`, 'fridge_meds:4');
I('suero_oral', 'box', 0.1, 0.12, 0.06, 0xd8e8f8, `Sobres de suero oral para los niños con diarrea y las abuelas con calor.`, `Oral rehydration sachets for children with diarrhoea and grandmothers with heat.`, 'fridge_meds:3');
I('gotas_ojos', 'bottle', 0.04, 0.09, 0.04, 0x4a8ac8, `Gotas para los ojos, con la fecha de apertura anotada a lápiz.`, `Eye drops with the opening date pencilled on.`, 'fridge_meds:3');
I('biberones', 'bottle', 0.06, 0.16, 0.06, 0xf0e8f0, `Biberones lavados y puestos boca abajo.`, `Baby bottles washed and set upside down.`, 'kitchen_upper:4 kitchen_base:1', 'babies');
I('vasos_plastico', 'cup', 0.08, 0.1, 0.08, 0xe85a4a, `Vasos de plástico de colores, de las onces del colegio.`, `Coloured plastic cups from school snack time.`, 'kitchen_upper:3 kitchen_base:1', 'kids');
I('platos', 'plates', 0.22, 0.12, 0.22, 0xf0ece0, `Platos de loza, todos distintos, de varias cocinas anteriores.`, `China plates, all different, from several earlier kitchens.`, 'kitchen_upper:5 sideboard:1');
I('platos_hondos', 'plates', 0.17, 0.1, 0.17, 0xe8e0c8, `Platos hondos para la sopa, que aquí nunca falta.`, `Soup bowls: soup never runs out here.`, 'kitchen_upper:4');
I('pocillos', 'cup', 0.08, 0.07, 0.08, 0xf0e0c0, `Pocillos de tinto con el esmalte saltado.`, `Tinto cups with chipped enamel.`, 'kitchen_upper:5 sideboard:2');
I('ollas', 'pot', 0.3, 0.2, 0.3, 0xb8bcc0, `Ollas de aluminio abolladas, cada una con su historia de sancocho.`, `Dented aluminium pots, each with its own sancocho story.`, 'kitchen_base:5');
I('olla_presion', 'pot', 0.26, 0.22, 0.26, 0xb0b4b8, `La olla a presión: pita fuerte y todo el barrio sabe que es mediodía.`, `The pressure cooker: it whistles loudly and the whole barrio knows it's noon.`, 'kitchen_base:4');
I('sartenes', 'pan', 0.38, 0.05, 0.26, 0x2a2a2a, `Sartenes negras de tanto fuego, una solo para las arepas.`, `Pans blackened by so much fire, one kept only for arepas.`, 'kitchen_base:4');
I('tapas', 'plates', 0.26, 0.06, 0.26, 0xc8ccd0, `Tapas de ollas que ya no tienen olla.`, `Pot lids with no pot left.`, 'kitchen_base:3');
I('recipientes', 'stack', 0.24, 0.14, 0.2, 0x8ac8d8, `Recipientes de plástico sin tapa y tapas sin recipiente.`, `Plastic containers without lids and lids without containers.`, 'kitchen_base:4 pantry:1');
I('colador', 'pot', 0.2, 0.1, 0.2, 0xc8ccd0, `Un colador de lata para el jugo de mora.`, `A tin strainer for blackberry juice.`, 'kitchen_base:3');
I('licuadora', 'bottle', 0.16, 0.3, 0.16, 0xe8e8e0, `Una licuadora vieja con la jarra rajada y cinta alrededor del vaso.`, `An old blender with a cracked jug and tape round the glass.`, 'kitchen_base:3');
I('budare', 'plates', 0.3, 0.03, 0.3, 0x3a3a3a, `Una plancha para arepas, ennegrecida y perfecta.`, `An arepa griddle, blackened and perfect.`, 'kitchen_base:3');
I('tablas', 'stack', 0.3, 0.07, 0.2, 0xb88a5a, `Tablas de picar marcadas por los cuchillos de varias generaciones.`, `Chopping boards scored by the knives of several generations.`, 'kitchen_base:3');
I('cucharas_palo', 'roll', 0.3, 0.04, 0.04, 0x9a6a3a, `Cucharas de palo quemadas en la punta de tanto revolver.`, `Wooden spoons burnt at the tip from so much stirring.`, 'kitchen_base:3 kitchen_upper:1');
I('tamalera', 'pot', 0.36, 0.3, 0.36, 0xb8bcc0, `Una olla enorme para los tamales de diciembre.`, `A huge pot for the December tamales.`, 'kitchen_base:2');
I('balde', 'pot', 0.3, 0.28, 0.3, 0x2f6fbf, `Un balde azul con un trapero y media botella de límpido.`, `A blue bucket with a mop head and half a bottle of bleach.`, 'under_sink:4');
I('trapos', 'stack', 0.26, 0.12, 0.2, 0xc8b88a, `Trapos hechos de camisetas que ya no servían.`, `Rags made from T-shirts that were beyond saving.`, 'under_sink:4 tools:1');
I('lavaplatos', 'bottle', 0.08, 0.22, 0.08, 0x58b868, `Lavaplatos verde, casi vacío, rellenado con agua para que rinda.`, `Green dish soap, nearly empty, topped up with water to make it last.`, 'under_sink:4');
I('limpido', 'bottle', 0.1, 0.28, 0.1, 0xf2f2f2, `Un galón de límpido con la tapa floja: huele a piscina.`, `A gallon of bleach with a loose cap: it smells like a swimming pool.`, 'under_sink:4');
I('esponjas', 'box', 0.1, 0.04, 0.07, 0xe8d048, `Esponjas amarillas usadas hasta el último hilo.`, `Yellow sponges used down to the last thread.`, 'under_sink:3 kitchen_base:1');
I('destapador', 'tool', 0.3, 0.12, 0.12, 0xb83a2a, `Un destapador de caucho, el héroe callado de la casa.`, `A rubber plunger, the silent hero of the house.`, 'under_sink:3');
I('trampa', 'box', 0.1, 0.03, 0.06, 0xb88a5a, `Una trampa para ratones, armada y esperando.`, `A mousetrap, set and waiting.`, 'under_sink:2 pantry:1 kitchen_base:1');

// ---- tools
I('llaves_tuerca', 'tool', 0.28, 0.02, 0.06, 0xb8bcc0, `Llaves de tuerca ordenadas de la más pequeña a la más grande, o casi.`, `Wrenches ordered from smallest to largest, or nearly.`, 'tools:4');
I('destornilladores', 'tool', 0.22, 0.03, 0.1, 0xd23a32, `Destornilladores con el mango forrado en cinta negra.`, `Screwdrivers with the handles wrapped in black tape.`, 'tools:4');
I('martillo', 'tool', 0.3, 0.04, 0.1, 0x6a4a2a, `Un martillo de mango gastado, más viejo que el taller.`, `A hammer with a worn handle, older than the workshop.`, 'tools:4');
I('clavos', 'tin', 0.1, 0.08, 0.1, 0xb8a888, `Una lata de clavos, tornillos y arandelas mezclados por años.`, `A tin of nails, screws and washers mixed together over the years.`, 'tools:4 under_sink:1');
I('alicates', 'tool', 0.2, 0.02, 0.07, 0x2f5f9a, `Alicates de mango azul, siempre prestados.`, `Blue-handled pliers, always on loan.`, 'tools:3');
I('metro', 'tin', 0.08, 0.05, 0.08, 0xd8c038, `Un metro de acero que se enrolla con un chasquido.`, `A steel tape measure that snaps back with a click.`, 'tools:3 sewing:2');
I('lija', 'sheet', 0.23, 0.01, 0.28, 0xb89a6a, `Pliegos de lija de varios granos, usados por las dos caras.`, `Sheets of sandpaper in several grits, used on both sides.`, 'tools:3');
I('bombillos', 'box', 0.1, 0.1, 0.1, 0xe8e0c8, `Bombillos de repuesto en su caja de cartón y un fusible quemado.`, `Spare bulbs in their cardboard box and a blown fuse.`, 'tools:3 kitchen_base:1 nightstand_door:1');
I('cable', 'roll', 0.18, 0.1, 0.1, 0xd8a838, `Un rollo de cable eléctrico a medio gastar, con un empalme de cinta.`, `A half-used reel of electrical wire with a taped splice.`, 'tools:3');
I('grasa', 'tin', 0.12, 0.07, 0.12, 0x6a6a5a, `Una lata de grasa que huele a talleres y a domingos de bicicleta.`, `A grease tin that smells of workshops and bicycle Sundays.`, 'tools:3');
I('parches_bici', 'box', 0.1, 0.03, 0.07, 0x3a8a5a, `Parches y pegante para el pinchazo de la bicicleta.`, `Patches and glue for the bicycle puncture.`, 'tools:3 locker:1');
I('llaves_repuesto', 'key', 0.1, 0.01, 0.1, 0xc8c0a0, `Llaves de repuesto, ninguna con etiqueta: nadie sabe qué abren.`, `Spare keys, none labelled: nobody knows what they open.`, 'tools:3 desk:2 cash:2 dresser:1 filing:1');

// ---- papers and the office
I('carpetas', 'stack', 0.24, 0.1, 0.32, 0xc8a86a, `Carpetas con papeles de todos los años, ordenadas por un criterio que solo conoce quien las armó.`, `Folders of papers from every year, sorted by a system known only to whoever made it.`, 'filing:5 desk:2');
I('recibos', 'bundle', 0.18, 0.06, 0.12, 0x6a8a9a, `Un manojo de recibos de arriendo, ordenados por mes.`, `A bundle of rent receipts, sorted by month.`, 'filing:3 desk:2 cash:1');
I('contratos', 'sheet', 0.21, 0.015, 0.28, 0xf0ece0, `Contratos de arriendo con firmas ya borrosas.`, `Rental contracts with signatures already fading.`, 'filing:3 desk:1');
I('sellos', 'box', 0.1, 0.04, 0.07, 0x3a3a5a, `Un sello de caucho y su almohadilla ya seca.`, `A rubber stamp and its dried-out pad.`, 'filing:2 desk:3 teacher_desk:2');
I('grapadora', 'tool', 0.16, 0.05, 0.04, 0x2a2a2a, `Una grapadora que se atasca cada tercera vez.`, `A stapler that jams every third time.`, 'desk:3 filing:2 teacher_desk:3 cash:1');
I('sobres', 'stack', 0.23, 0.03, 0.11, 0xefe6d0, `Sobres sin usar, con el sello de la junta en la esquina.`, `Unused envelopes with the neighbourhood-board stamp in the corner.`, 'desk:3 filing:3');
I('resma', 'sheet', 0.21, 0.05, 0.3, 0xf2eee0, `Una resma de papel a medio gastar.`, `A half-used ream of paper.`, 'desk:3 filing:2 student_desk:1');
I('talonario_cheques', 'book', 0.18, 0.01, 0.08, 0x2f5f9a, `Un talonario de cheques casi sin usar.`, `A cheque book almost unused.`, 'desk:2 filing:1 cash:1', 'rich|shopkeeper');
I('agenda', 'book', 0.1, 0.025, 0.15, 0x6a2f2a, `Una agenda de teléfonos con tapas de cuero y la mitad de los números tachados.`, `A leather-bound phone book with half the numbers crossed out.`, 'desk:3 nightstand_drawer:1 filing:1 cash:1');
I('clips', 'box', 0.07, 0.025, 0.05, 0xc8ccd0, `Una caja de clips que se multiplican solos.`, `A box of paper clips that multiply on their own.`, 'desk:3 teacher_desk:2 filing:2');

// ---- shop counters, barber, chemist
I('billetes', 'notes', 0.15, 0.02, 0.07, 0x9bb89a, `Billetes de mil y de dos mil, doblados y ordenados por valor.`, `Notes of one and two thousand, folded and sorted by value.`, 'cash:5 pharmacy_cash:4');
I('bandeja_monedas', 'tray', 0.3, 0.02, 0.12, 0xb8b8b0, `Una bandeja de monedas de cien, doscientos y quinientos.`, `A tray of one-, two- and five-hundred-peso coins.`, 'cash:5 pharmacy_cash:3 barber:2');
I('libreta_fiado', 'book', 0.13, 0.015, 0.19, 0xb8402a, `La libreta del fiado: «Doña Berta, dos panes. Don Heriberto, 5.000. Yulieth, mañana».`, `The credit notebook: "Doña Berta, two loaves. Don Heriberto, 5,000. Yulieth, tomorrow."`, 'cash:5', 'shopkeeper');
I('talonario', 'book', 0.1, 0.01, 0.17, 0xe8d8b0, `Un talonario de recibos con papel carbón azul.`, `A receipt pad with blue carbon paper.`, 'cash:3 pharmacy_cash:3 desk:1');
I('calculadora', 'box', 0.1, 0.02, 0.15, 0x3a3a3a, `Una calculadora de pilas, con los números gastados.`, `A battery calculator with worn digits.`, 'cash:4 pharmacy_cash:3 desk:2 teacher_desk:1');
I('bandas_caucho', 'ball', 0.07, 0.07, 0.07, 0xd8a838, `Una bola de bandas de caucho, la más grande del barrio.`, `A ball of rubber bands, the biggest in the barrio.`, 'cash:3 desk:1 teacher_desk:1');
I('cabuya', 'tin', 0.08, 0.07, 0.08, 0xc8a86a, `Un carrete de cabuya para atar los paquetes.`, `A reel of twine for tying parcels.`, 'cash:3 pantry:1');
I('bolsas_papel', 'stack', 0.2, 0.04, 0.3, 0xc8a070, `Bolsas de papel para el pan y los mandados.`, `Paper bags for bread and errands.`, 'cash:3 pantry:1');
I('tarjetas_minutos', 'sheet', 0.09, 0.01, 0.06, 0x3a8ad8, `Tarjetas de minutos para el celular, de todas las compañías.`, `Phone-minute cards for every network.`, 'cash:3');
I('llavero_local', 'key', 0.12, 0.01, 0.12, 0xc8c0a0, `Un llavero con las llaves del local y del candado grande.`, `A key ring with the keys to the shop and to the big padlock.`, 'cash:3 pharmacy_cash:2');
I('recetas', 'sheet', 0.14, 0.015, 0.2, 0xf0ece0, `Recetas de los médicos del barrio, con letra imposible de leer.`, `Prescriptions from the barrio doctors, in impossible handwriting.`, 'pharmacy_cash:5 medcab:1');
I('tijeras_barbero', 'tool', 0.2, 0.015, 0.06, 0xc8ccd0, `Tijeras de barbero afiladas con paciencia y cuero.`, `Barber's scissors sharpened with patience and leather.`, 'barber:4');
I('peines', 'roll', 0.18, 0.02, 0.02, 0x2a2a2a, `Peines de todos los grosores, desinfectados en un frasco.`, `Combs of every thickness, disinfected in a jar.`, 'barber:4');
I('maquina_corte', 'tool', 0.16, 0.06, 0.06, 0x2a2a2a, `La máquina de cortar, con el cable enrollado.`, `The clippers, with the cable coiled up.`, 'barber:4');
I('navaja', 'tool', 0.14, 0.015, 0.04, 0xc8ccd0, `Una navaja de afeitar de las de antes, con su cuero de afilar.`, `An old-fashioned razor with its strop.`, 'barber:3');
I('talco', 'bottle', 0.07, 0.14, 0.07, 0xf0eef8, `Talco para el cuello: el truco del final del corte.`, `Talc for the neck: the trick at the end of a haircut.`, 'barber:4');
I('colonia_barberia', 'bottle', 0.06, 0.16, 0.06, 0xd8e8f8, `Colonia de barbería, de la que huele a domingo.`, `Barbershop cologne, the kind that smells of Sunday.`, 'barber:3');
I('propinas', 'jar', 0.1, 0.14, 0.1, 0xd8e0e8, `Un frasco de propinas con más monedas que billetes.`, `A tip jar with more coins than notes.`, 'barber:3 cash:1');
I('capa', 'stack', 0.3, 0.06, 0.26, 0x2f4a73, `Una capa de nailon con pelitos pegados.`, `A nylon cape stuck with tiny hairs.`, 'barber:3');

// ---- clinic
I('vendas', 'roll', 0.1, 0.07, 0.07, 0xf2eee0, `Rollos de venda y gasa, ordenados por tamaño.`, `Rolls of bandage and gauze, sorted by size.`, 'medcab:5 medcab_low:3');
I('alcohol', 'bottle', 0.07, 0.2, 0.07, 0xc8e8f0, `Un frasco de alcohol antiséptico, con el sello al día.`, `A bottle of antiseptic alcohol, seal up to date.`, 'medcab:4 medcab_low:2 nightstand_door:1');
I('algodon', 'bag', 0.16, 0.12, 0.12, 0xf8f8f4, `Una bolsa de algodón, blanco como una nube pequeña.`, `A bag of cotton wool, white as a small cloud.`, 'medcab:4 medcab_low:3');
I('termometro', 'box', 0.14, 0.02, 0.04, 0xd0d8dc, `Un termómetro de mercurio en su estuche, para las fiebres de la noche.`, `A mercury thermometer in its case, for the night fevers.`, 'medcab:4 nightstand_drawer:1');
I('tensiometro', 'box', 0.18, 0.08, 0.14, 0x2a4a6a, `Un tensiómetro con el brazalete de tela doblado como un acordeón.`, `A blood-pressure monitor with its cloth cuff folded like an accordion.`, 'medcab:3 medcab_low:3');
I('guantes', 'box', 0.16, 0.1, 0.1, 0x8ac8f0, `Una caja de guantes de látex, casi vacía.`, `A box of latex gloves, almost empty.`, 'medcab:4 medcab_low:3');
I('pomada', 'tin', 0.07, 0.035, 0.07, 0x8ab8a8, `Pomada de eucalipto: sirve para casi todo, según doña Berta.`, `Eucalyptus ointment: good for nearly everything, according to doña Berta.`, 'medcab:3 nightstand_drawer:1 dresser:1');
I('muestras', 'box', 0.14, 0.05, 0.08, 0xf2f0e8, `Cajas de muestra médica que dejó un visitador.`, `Boxes of free medicine samples left by a sales rep.`, 'medcab:3 medcab_low:2');
I('historias', 'stack', 0.24, 0.08, 0.32, 0xc8d8a8, `Carpetas con las historias clínicas de las familias del barrio.`, `Folders with the medical records of the barrio's families.`, 'medcab_low:3 filing:2');
I('estetoscopio', 'chain', 0.14, 0.02, 0.14, 0x2a2a2a, `Un estetoscopio enrollado, con el diafragma frío como una moneda.`, `A coiled stethoscope, its diaphragm cold as a coin.`, 'medcab:3 medcab_low:2');
I('botiquin_caja', 'box', 0.26, 0.12, 0.18, 0xf2f2f0, `Un botiquín con una cruz roja medio borrada y gasas para tres curaciones.`, `A first-aid box with a half-faded red cross and gauze for three dressings.`, 'medcab_low:4 nightstand_door:1 locker:1');

// ---- school
I('tizas', 'box', 0.1, 0.03, 0.08, 0xf2f2f2, `Una caja de tizas de colores, casi todas en pedacitos.`, `A box of coloured chalks, nearly all in little pieces.`, 'teacher_desk:4');
I('examenes', 'sheet', 0.21, 0.03, 0.3, 0xf0ece0, `Exámenes por corregir: la mitad con la respuesta del vecino.`, `Exams waiting to be marked: half with the neighbour's answer.`, 'teacher_desk:4 desk:1');
I('lista_asistencia', 'book', 0.22, 0.02, 0.3, 0x2a4a3a, `La lista de asistencia, con los nombres de todos los grados.`, `The attendance register, with the names of every grade.`, 'teacher_desk:3 filing:1');
I('confiscado', 'box', 0.18, 0.08, 0.12, 0xb86a3a, `Cosas confiscadas: un trompo, una cauchera, un álbum de cromos y un celular.`, `Confiscated things: a spinning top, a slingshot, a sticker album and a phone.`, 'teacher_desk:4');
I('pito', 'roll', 0.06, 0.02, 0.02, 0xd8d8d8, `Un pito de árbitro, de los que aún suenan.`, `A referee's whistle, one that still works.`, 'teacher_desk:2 locker:2');
I('reglas', 'roll', 0.3, 0.03, 0.03, 0x9a6a3a, `Una regla de madera mellada de golpear el escritorio.`, `A wooden ruler nicked from rapping on the desk.`, 'teacher_desk:3 student_desk:2');
I('morral', 'bag', 0.28, 0.34, 0.16, 0x2f5f9a, `Un morral escolar con un cuaderno de dibujos y media empanada aplastada.`, `A school rucksack with a sketchbook and half a squashed empanada.`, 'locker:5 wardrobe:1', 'kids|teen|students');
I('lonchera', 'box', 0.2, 0.16, 0.1, 0xd8402a, `Una lonchera con un sándwich fosilizado desde la semana pasada.`, `A lunchbox with a sandwich fossilised since last week.`, 'locker:4');
I('botella_agua', 'bottle', 0.07, 0.24, 0.07, 0x8ac8d8, `Una botella de agua llena de calcomanías de equipos.`, `A water bottle covered in team stickers.`, 'locker:3 desk:1');
I('poncho_lluvia', 'stack', 0.26, 0.05, 0.22, 0xe8d838, `Un poncho de lluvia doblado, que huele a plástico y a recreo.`, `A folded rain poncho that smells of plastic and playtime.`, 'locker:3');
I('cuadernos', 'stack', 0.2, 0.05, 0.26, 0x4a8fd8, `Cuadernos con los márgenes llenos de dibujos y las cuentas a medias.`, `Exercise books with margins full of doodles and half-done sums.`, 'locker:3 student_desk:5 wardrobe:1', 'kids|teen|students');
I('colores', 'box', 0.18, 0.025, 0.1, 0xd8a838, `Una caja de colores con todos los verdes gastados.`, `A box of coloured pencils with every green worn down.`, 'student_desk:4 teacher_desk:1', 'kids|teen|students');
I('escuadras', 'tool', 0.22, 0.01, 0.14, 0x8ac8d8, `Una escuadra, un cartabón y un compás con la punta torcida.`, `A set square, a protractor and a compass with a bent point.`, 'student_desk:4');
I('sacapuntas', 'box', 0.04, 0.02, 0.03, 0xd83a3a, `Un sacapuntas con virutas de lápiz de colores.`, `A sharpener with coloured pencil shavings.`, 'student_desk:3 desk:2');
I('pegante', 'bottle', 0.035, 0.08, 0.035, 0xf2f2f2, `Un frasco de pegante casi seco.`, `A bottle of glue, almost dry.`, 'student_desk:3 teacher_desk:1 sewing:1 desk:1');
I('libro_ciencias', 'book', 0.2, 0.03, 0.28, 0x2a5a3a, `Un libro de ciencias con los bordes sujetos con cinta.`, `A science textbook with the edges held on by tape.`, 'student_desk:4 teacher_desk:2');
I('dibujos', 'sheet', 0.21, 0.008, 0.28, 0xf2eee0, `Dibujos de una casa en una loma con un sol demasiado grande.`, `Drawings of a house on a hill with a sun far too big.`, 'student_desk:3 dresser:1 nightstand_door:1', 'kids');

// ---- sewing
I('tijeras_modista', 'tool', 0.26, 0.02, 0.09, 0xb8402a, `Tijeras de modista que nadie más puede tocar.`, `Dressmaker's scissors nobody else may touch.`, 'sewing:4');
I('carretes', 'roll', 0.16, 0.04, 0.04, 0xd85a5a, `Carretes de hilo de todos los colores, ordenados por tono.`, `Spools of thread of every colour, sorted by shade.`, 'sewing:5 dresser:1');
I('alfiletero', 'ball', 0.09, 0.07, 0.09, 0xd83a2a, `Un alfiletero con forma de tomate, lleno de alfileres.`, `A tomato-shaped pincushion full of pins.`, 'sewing:4');
I('moldes', 'sheet', 0.25, 0.02, 0.3, 0xd8d0b8, `Moldes de papel periódico para blusas, faldas y un disfraz de ángel.`, `Newspaper patterns for blouses, skirts and an angel costume.`, 'sewing:4');
I('retazos', 'stack', 0.28, 0.08, 0.24, 0xb86a8a, `Retazos de tela de todos los vestidos que ha tenido la familia.`, `Fabric remnants from every dress the family has ever had.`, 'sewing:5 chest:1 dresser:1');
I('cinta_metrica', 'roll', 0.12, 0.012, 0.012, 0xe8d8a0, `Una cinta métrica de modista con los números ya borrosos.`, `A tailor's tape measure with fading numbers.`, 'sewing:4 dresser:1');
I('ovillos', 'ball', 0.12, 0.12, 0.12, 0x5aa87a, `Ovillos de lana de colores, listos para otro suéter.`, `Balls of coloured wool, ready for another sweater.`, 'sewing:4 dresser:1 wardrobe:1', 'sewing|elder|crochet');
I('agujas', 'box', 0.08, 0.02, 0.04, 0xd8a838, `Una cajita de agujas de todos los tamaños.`, `A little box of needles of every size.`, 'sewing:3 dresser:1');

// ---- the radio, the football and the rest of the hobbies
I('radio_pilas', 'box', 0.18, 0.1, 0.07, 0x3a3a3a, `Un radio de pilas con la antena torcida: sintoniza los partidos y las novelas.`, `A battery radio with a bent aerial: it picks up the matches and the soaps.`, 'nightstand_door:2 tvstand:2 tools:1', 'radio|elder');
I('guitarra_cuerdas', 'roll', 0.16, 0.02, 0.02, 0xc8c8c0, `Un juego de cuerdas de guitarra todavía en su sobre.`, `A set of guitar strings still in their envelope.`, 'dresser:2 tvstand:2 wardrobe:1', 'music');
I('semillas', 'bag', 0.14, 0.12, 0.08, 0xb89a6a, `Sobres de semillas de cilantro y de tomate, guardados para la siembra.`, `Packets of coriander and tomato seeds, kept for sowing.`, 'pantry:2 kitchen_upper:2 tools:2 nightstand_door:1', 'plants');
I('maiz_palomas', 'bag', 0.14, 0.14, 0.1, 0xe8d088, `Un costal de maíz para las palomas, que no esperan.`, `A sack of grain for the pigeons, who do not wait.`, 'pantry:2 tools:2 locker:1', 'pigeons');
I('collar_perro', 'chain', 0.12, 0.02, 0.12, 0xc83a2a, `Una correa y un collar con cascabel.`, `A leash and a collar with a bell.`, 'nightstand_door:2 wardrobe:1 kitchen_base:1', 'dog|cat');
I('jaula_alpiste', 'bag', 0.12, 0.1, 0.07, 0xe8d088, `Una bolsita de alpiste para el canario, que canta por menos.`, `A little bag of birdseed for the canary, who sings for less.`, 'pantry:3 kitchen_upper:2 sideboard:1', 'canary');
I('libro_recetas', 'book', 0.18, 0.03, 0.24, 0xc8a070, `Un cuaderno de recetas con manchas de aceite: «El sancocho de la abuela. No se mide, se siente».`, `A recipe notebook stained with oil: "Grandma's sancocho. You don't measure it, you feel it."`, 'kitchen_upper:3 sideboard:2 pantry:2 wallunit:1', 'cooking|elder');

// ------------------------------------------------------------------ drawing: o = { id, x, y, z, w, h, d, col } in the piece's frame (x right, y up from its base, z front);
// (x, z) = the centre of the object's footprint, y = its bottom. Every shape stays inside its w x h x d box (the aim box and the layout test rely on it).
const SH = {
  stack(P, o) {
    const n = Math.max(1, Math.round(o.h / 0.045)), lh = o.h / n;
    for (let i = 0; i < n; i++) { const j = u01(o.id, i) - 0.5; FL(P, o.x + j * 0.012, o.y + i * lh, o.z, o.w * (0.97 + j * 0.04), lh * 0.95, o.d * 0.97, i % 2 ? shade(o.col, 0.92) : o.col, j * 0.04); }
  },
  hang(P, o) {                                           // edge on to the front, like clothes on a rail: o.d is the garment's width, o.w the room it takes along the rail
    CY(P, o.x, o.y + o.h - 0.012, o.z, 0.004, 0.03, 0x707070, 5);                                             // the hook over the rail
    FL(P, o.x, o.y + o.h - 0.024, o.z, 0.014, 0.012, o.d, 0x8a6a40);                                         // the hanger's shoulder bar
    FL(P, o.x, o.y, o.z, 0.05, o.h - 0.03, o.d * 0.94, o.col);                                               // the garment
    FL(P, o.x, o.y, o.z + o.d * 0.47 - 0.02, 0.053, o.h * 0.55, 0.04, shade(o.col, 1.14));                  // its front panel, a shade lighter
  },
  box(P, o) {
    FL(P, o.x, o.y, o.z, o.w, o.h * 0.78, o.d, o.col);
    FL(P, o.x, o.y + o.h * 0.78, o.z, o.w, o.h * 0.22, o.d, shade(o.col, 0.84));
    FL(P, o.x, o.y + o.h * 0.14, o.z + o.d / 2 + 0.0005, Math.min(o.w * 0.5, 0.12), o.h * 0.4, 0.003, 0xefe8d8);
  },
  tin(P, o) { const r = Math.min(o.w, o.d) / 2; CY(P, o.x, o.y, o.z, r, o.h * 0.88, o.col, 12); CY(P, o.x, o.y + o.h * 0.88, o.z, r, o.h * 0.12, shade(o.col, 0.78), 12); },
  jar(P, o) { const r = Math.min(o.w, o.d) / 2; CY(P, o.x, o.y, o.z, r, o.h * 0.82, o.col, 10); CY(P, o.x, o.y + o.h * 0.82, o.z, r * 0.94, o.h * 0.18, 0xd8d0c0, 10); },
  bottle(P, o) { const r = Math.min(o.w, o.d) / 2; CY(P, o.x, o.y, o.z, r, o.h * 0.62, o.col, 10); CY(P, o.x, o.y + o.h * 0.62, o.z, r * 0.4, o.h * 0.3, o.col, 8); CY(P, o.x, o.y + o.h * 0.92, o.z, r * 0.45, o.h * 0.08, 0xd8d0c0, 8); },
  book(P, o) {
    const t = Math.min(0.006, o.h / 3), c = o.col;
    FL(P, o.x, o.y, o.z, o.w, t, o.d, c); FL(P, o.x, o.y + o.h - t, o.z, o.w, t, o.d, c);
    FL(P, o.x - o.w / 2 + t / 2, o.y, o.z, t, o.h, o.d, shade(c, 0.82));
    FL(P, o.x + t / 2, o.y + t, o.z + 0.002, o.w - t - 0.003, o.h - 2 * t, o.d - 0.005, 0xece4d0);
  },
  sheet(P, o) { FL(P, o.x, o.y, o.z, o.w, o.h, o.d, o.col ?? 0xf0ead8, (u01(o.id, 3) - 0.5) * 0.25); },
  bundle(P, o) { FL(P, o.x, o.y, o.z, o.w, o.h, o.d, 0xe8dfc8); for (const f of [-0.28, 0.22]) FL(P, o.x + o.w * f, o.y, o.z, 0.012, o.h, o.d + 0.002, o.col); },
  roll(P, o) { HC(P, o.x, o.y + Math.min(o.h, o.d) / 2, o.z, Math.min(o.h, o.d) / 2, o.w, 'x', o.col); },
  bag(P, o) { SP(P, o.x, o.y + o.h * 0.45, o.z, o.w / 2, o.h * 0.45, o.d / 2, o.col); CY(P, o.x, o.y + o.h * 0.82, o.z, 0.016, o.h * 0.18, shade(o.col, 0.8), 6, 0.006); },
  plates(P, o) { const n = Math.max(2, Math.round(o.h / 0.014)), lh = o.h / n; for (let i = 0; i < n; i++) CY(P, o.x, o.y + i * lh, o.z, Math.min(o.w, o.d) / 2, lh * 0.82, i % 2 ? shade(o.col, 0.95) : o.col, 12); },
  cup(P, o) { const r = Math.min(o.w, o.d) * 0.4; CY(P, o.x - 0.004, o.y, o.z, r, o.h, o.col, 10, r * 1.12); FL(P, o.x + r + 0.004, o.y + o.h * 0.25, o.z, 0.01, o.h * 0.5, 0.008, shade(o.col, 0.9)); },
  pot(P, o) {
    const r = Math.min(o.w, o.d) / 2 - 0.012;
    CY(P, o.x, o.y, o.z, r, o.h * 0.88, o.col, 12); CY(P, o.x, o.y + o.h * 0.88, o.z, r, o.h * 0.07, shade(o.col, 0.85), 12); CY(P, o.x, o.y + o.h * 0.95, o.z, r * 0.12, o.h * 0.05, 0x2a2a2a, 6);
    for (const s of [-1, 1]) FL(P, o.x + s * (r + 0.006), o.y + o.h * 0.55, o.z, 0.024, 0.012, 0.014, 0x2a2a2a);
  },
  pan(P, o) { const r = o.d / 2; CY(P, o.x - o.w / 2 + r, o.y, o.z, r, o.h, o.col, 12); FL(P, o.x + r - 0.01, o.y + o.h * 0.5, o.z, o.w - 2 * r + 0.02, 0.012, 0.025, 0x2a2a2a); },
  tool(P, o) { const r = Math.min(o.h, o.d) / 2; HC(P, o.x - o.w * 0.12, o.y + r, o.z, r, o.w * 0.76, 'x', o.col); FL(P, o.x + o.w / 2 - 0.03, o.y, o.z, 0.06, o.h, o.d, 0xb8bcc0); },
  ball(P, o) { const r = Math.min(o.w, o.h, o.d) / 2; SP(P, o.x, o.y + r, o.z, r, r, r, o.col, 10); },
  figure(P, o) {
    CY(P, o.x, o.y, o.z, o.w * 0.4, o.h * 0.1, shade(o.col, 0.8), 10);
    CY(P, o.x, o.y + o.h * 0.1, o.z, o.w * 0.3, o.h * 0.5, o.col, 10, o.w * 0.14);
    SP(P, o.x, o.y + o.h * 0.78, o.z, o.w * 0.16, o.h * 0.14, o.w * 0.16, shade(o.col, 1.06), 8);
  },
  frame(P, o) {
    FL(P, o.x, o.y, o.z, o.w, o.h, o.d, 0x5a3a24);
    if (o.h < o.d) FL(P, o.x, o.y + o.h, o.z, o.w * 0.78, 0.002, o.d * 0.8, o.col); else FL(P, o.x, o.y + o.h * 0.1, o.z + o.d / 2 + 0.0005, o.w * 0.78, o.h * 0.8, 0.003, o.col);
  },
  shoes(P, o) { for (const s of [-1, 1]) { FL(P, o.x + s * o.w * 0.25, o.y, o.z, o.w * 0.42, o.h * 0.35, o.d, shade(o.col, 0.7)); FL(P, o.x + s * o.w * 0.25, o.y + o.h * 0.35, o.z - o.d * 0.12, o.w * 0.36, o.h * 0.65, o.d * 0.6, o.col); } },
  glasses(P, o) {
    for (const s of [-1, 1]) { CY(P, o.x + s * o.w * 0.27, o.y, o.z - o.d * 0.2, o.w * 0.2, 0.004, 0x303030, 10); FL(P, o.x + s * o.w * 0.48, o.y, o.z, 0.004, 0.004, o.d * 0.8, 0x2a2a2a); }
    FL(P, o.x, o.y, o.z - o.d * 0.2, o.w * 0.12, 0.004, 0.006, 0x2a2a2a);
  },
  chain(P, o) {
    const n = 12;
    for (let i = 0; i < n; i++) { const a = (i / (n - 1)) * Math.PI; SP(P, o.x + Math.cos(a) * o.w * 0.4, o.y + 0.005, o.z - o.d * 0.1 + Math.sin(a) * o.d * 0.4, 0.005, 0.005, 0.005, o.col, 5); }
    FL(P, o.x, o.y, o.z + o.d * 0.36, 0.012, 0.004, 0.028, shade(o.col, 1.15));
  },
  cass(P, o) { const n = Math.max(2, Math.round(o.w / 0.014)); for (let i = 0; i < n; i++) FL(P, o.x - o.w / 2 + (i + 0.5) * (o.w / n), o.y, o.z, (o.w / n) * 0.86, o.h, o.d, [o.col, 0xc83a2a, 0x3a3a3a, 0x2a5a9a][i % 4]); },
  coins(P, o) { for (let i = 0; i < 6; i++) CY(P, o.x + (u01(o.id, i) - 0.5) * o.w * 0.7, o.y + (i > 3 ? 0.003 : 0), o.z + (u01(o.id, i + 7) - 0.5) * o.d * 0.6, 0.014, 0.003, i % 2 ? 0xc8c8c0 : 0xd8c088, 10); },
  tray(P, o) {
    FL(P, o.x, o.y, o.z, o.w, 0.01, o.d, shade(o.col, 0.7));
    for (let i = 0; i < 9; i++) CY(P, o.x - o.w * 0.4 + (i % 5) * o.w * 0.2, o.y + 0.01, o.z + (i < 5 ? -o.d * 0.22 : o.d * 0.22), 0.016 + (i % 3) * 0.002, 0.003, i % 3 ? 0xc8c8c0 : 0xd8c088, 10);
  },
  notes(P, o) { FL(P, o.x, o.y, o.z, o.w, o.h, o.d, o.col); FL(P, o.x, o.y, o.z, 0.02, o.h + 0.001, o.d + 0.002, 0xe8d8a0); },
  key(P, o) { FL(P, o.x + o.w * 0.1, o.y, o.z, o.w * 0.7, 0.004, 0.008, o.col); CY(P, o.x - o.w * 0.34, o.y, o.z, 0.014, 0.004, o.col, 8); FL(P, o.x + o.w * 0.38, o.y, o.z + 0.007, 0.008, 0.004, 0.012, o.col); },
};

// ------------------------------------------------------------------ papers: how each cover looks on the shelf
const NOTEBOOKS = [0xc8a050, 0x7a8aa8, 0x8a5a6a, 0x5a8a6a, 0xb86a4a];
export const PAPER_PROMPT = { diary: 'Leer el diario', letter: 'Leer la carta', note: 'Leer la nota', list: 'Ver la lista', card: 'Leer la tarjeta', receipt: 'Ver el recibo', ledger: 'Ver el libro de cuentas', postcard: 'Leer la postal', certificate: 'Ver el certificado', clipping: 'Leer el recorte' };
export function paperLook(cover, id) {
  switch (cover) {
    case 'notebook': return { sh: 'book', w: 0.15, h: 0.014, d: 0.21, col: NOTEBOOKS[Math.floor(u01(id, 1) * NOTEBOOKS.length)] };
    case 'school': return { sh: 'book', w: 0.17, h: 0.008, d: 0.22, col: 0x4a8fd8 };
    case 'leather': return { sh: 'book', w: 0.13, h: 0.03, d: 0.19, col: 0x5a3a24 };
    case 'ledger': return { sh: 'book', w: 0.22, h: 0.035, d: 0.3, col: 0x2a3a2a };
    case 'envelope': return { sh: 'sheet', w: 0.22, h: 0.005, d: 0.11, col: 0xe8dcc0 };
    case 'card': return { sh: 'sheet', w: 0.13, h: 0.004, d: 0.18, col: 0xf0c8d0 };
    case 'postcard': return { sh: 'sheet', w: 0.15, h: 0.003, d: 0.1, col: 0x9ac8e8 };
    default: return { sh: 'sheet', w: 0.2, h: 0.004, d: 0.27, col: 0xf0ead8 };            // loose
  }
}
function drawPaper(P, o) {
  SH[o.sh](P, o);
  const top = o.y + o.h + 0.0008;
  if (o.cover === 'envelope') { FL(P, o.x + o.w * 0.36, top, o.z - o.d * 0.28, 0.025, 0.0015, 0.03, 0xb83a3a); FL(P, o.x - o.w * 0.05, top, o.z, o.w * 0.5, 0.0015, 0.004, 0x6a6a6a); }
  else if (o.cover === 'postcard') FL(P, o.x - o.w * 0.1, top, o.z, o.w * 0.7, 0.0015, o.d * 0.7, 0x4a8a5a);
  else if (o.cover === 'card') FL(P, o.x, top, o.z, 0.012, 0.0015, o.d, 0xb83a5a);
  else if (o.cover === 'leather') FL(P, o.x + o.w * 0.2, o.y, o.z, 0.014, o.h + 0.002, o.d + 0.002, 0x2a1a10);
  else if (o.cover === 'ledger') FL(P, o.x + o.w * 0.1, top, o.z, o.w * 0.5, 0.0015, 0.05, 0xd8c8a0);
}

// ------------------------------------------------------------------ special finds: what they sit in (base) and what they are (shape); both are lists from finds.js
const WRAP = {
  loose: null,
  tin: { w: 0.09, d: 0.09, h: 0.04, draw: (P, x, y, z) => { CY(P, x, y, z, 0.045, 0.034, 0x9a8f7a, 14); CY(P, x, y + 0.034, z, 0.047, 0.006, 0x6f6658, 14); } },
  sock: { w: 0.2, d: 0.07, h: 0.06, draw: (P, x, y, z) => { HC(P, x, y + 0.03, z, 0.03, 0.2, 'x', 0x9aa8b8); SP(P, x - 0.1, y + 0.03, z, 0.034, 0.034, 0.034, 0x9aa8b8); FL(P, x + 0.06, y + 0.05, z, 0.05, 0.008, 0.062, 0xd8d8d0); } },
  matchbox: { w: 0.07, d: 0.045, h: 0.02, draw: (P, x, y, z) => { FL(P, x, y, z, 0.06, 0.018, 0.04, 0xc8a870); FL(P, x, y + 0.018, z, 0.05, 0.001, 0.03, 0xb83a2a); } },
  velvet: { w: 0.07, d: 0.07, h: 0.03, draw: (P, x, y, z) => { FL(P, x, y, z, 0.07, 0.026, 0.07, 0x7a1f2e); FL(P, x, y + 0.026, z, 0.06, 0.004, 0.06, 0xa83a4a); } },
  handkerchief: { w: 0.14, d: 0.14, h: 0.004, draw: (P, x, y, z) => FL(P, x, y, z, 0.14, 0.004, 0.14, 0xf2f0e8, 0.5) },
  envelope: { w: 0.17, d: 0.11, h: 0.006, draw: (P, x, y, z) => { FL(P, x, y, z, 0.16, 0.004, 0.1, 0xe8dcc0, 0.12); FL(P, x, y + 0.004, z - 0.02, 0.1, 0.002, 0.05, 0xd8caa8, 0.12); } },
  giftbox: { w: 0.11, d: 0.09, h: 0.05, draw: (P, x, y, z) => { FL(P, x, y, z, 0.11, 0.05, 0.09, 0x2a3f6a); FL(P, x, y, z, 0.012, 0.052, 0.092, 0xd8b838); FL(P, x, y + 0.048, z, 0.112, 0.004, 0.012, 0xd8b838); } },
  glass: { w: 0.08, d: 0.08, h: 0.045, draw: (P, x, y, z) => { CY(P, x, y, z, 0.04, 0.045, 0xcfe4ec, 12, 0.036); } },
  hatbox: { w: 0.2, d: 0.2, h: 0.09, draw: (P, x, y, z) => { CY(P, x, y, z, 0.1, 0.07, 0x6a3a3a, 14); CY(P, x, y + 0.07, z, 0.103, 0.02, 0x8a5a4a, 14); } },
  frame: { w: 0.14, d: 0.18, h: 0.012, draw: (P, x, y, z) => { FL(P, x, y, z, 0.14, 0.012, 0.18, 0x5a3a24); FL(P, x, y + 0.012, z, 0.1, 0.0015, 0.14, 0xb8b0a0); } },
  lining: { w: 0.24, d: 0.2, h: 0.03, draw: (P, x, y, z) => { FL(P, x, y, z, 0.24, 0.03, 0.2, 0x4a3f38, 0.1); FL(P, x, y + 0.03, z + 0.02, 0.2, 0.0015, 0.004, 0x9a8a78, 0.1); } },
};
// find shapes: the word list of finds.js FIND_SHAPES (coin watch pocketwatch ring chain roll teeth deed ticket letter map shirt knickers jar box doll key medal photo ball)
const ASPECT = { coin: 0.1, watch: 0.2, pocketwatch: 0.25, ring: 0.25, chain: 0.1, roll: 0.35, teeth: 0.3, deed: 0.05, ticket: 0.05, letter: 0.08, map: 0.05, shirt: 0.3, knickers: 0.2, jar: 0.9, box: 0.5, doll: 1.1, key: 0.1, medal: 0.12, photo: 0.06, ball: 1 };
const FLATS = new Set(['deed', 'ticket', 'letter', 'map', 'photo']);                              // paper things: as long as `size`, 0.75 as wide
const FIND = {
  coin: (P, x, y, z, s, c) => { CY(P, x, y, z, s / 2, 0.004, c, 14); CY(P, x, y + 0.004, z, s * 0.36, 0.0008, shade(c, 0.84), 12); },
  watch: (P, x, y, z, s, c) => { FL(P, x, y, z, s * 0.3, 0.005, s * 1.05, 0x2a2018); CY(P, x, y + 0.005, z, s * 0.28, 0.008, c, 12); CY(P, x, y + 0.013, z, s * 0.22, 0.002, 0xf4f0e0, 12); },
  pocketwatch: (P, x, y, z, s, c) => { CY(P, x, y, z + s * 0.1, s * 0.4, 0.012, c, 14); CY(P, x, y + 0.012, z + s * 0.1, s * 0.32, 0.002, 0xf4f0e0, 14); CY(P, x, y, z - s * 0.34, 0.006, 0.014, shade(c, 1.1), 8); for (let i = 0; i < 6; i++) SP(P, x + Math.sin(i) * s * 0.18, y + 0.003, z - s * 0.42 - i * 0.006, 0.004, 0.004, 0.004, c, 5); },
  ring: (P, x, y, z, s, c) => { CY(P, x, y, z, s / 2, 0.006, c, 14); CY(P, x, y, z, s * 0.3, 0.0065, 0x2a1a10, 12); SP(P, x, y + 0.008, z - s * 0.5, 0.006, 0.006, 0.006, 0xeaf4ff, 6); },
  chain: (P, x, y, z, s, c) => { for (let i = 0; i < 12; i++) { const a = (i / 11) * Math.PI; SP(P, x + Math.cos(a) * s * 0.4, y + 0.004, z - s * 0.1 + Math.sin(a) * s * 0.4, 0.0045, 0.0045, 0.0045, c, 5); } CY(P, x, y, z + s * 0.36, 0.012, 0.004, shade(c, 1.1), 10); },
  medal: (P, x, y, z, s, c) => { for (let i = 0; i < 9; i++) { const a = (i / 8) * Math.PI; SP(P, x + Math.cos(a) * s * 0.4, y + 0.004, z - s * 0.2 - Math.sin(a) * s * 0.3, 0.004, 0.004, 0.004, c, 5); } CY(P, x, y, z + s * 0.2, s * 0.22, 0.004, c, 12); FL(P, x, y + 0.004, z + s * 0.2, 0.01, 0.0015, s * 0.3, 0x2a4f9a); },
  roll: (P, x, y, z, s, c) => { HC(P, x, y + s * 0.18, z, s * 0.18, s, 'x', 0x4a7a4a); FL(P, x, y, z, 0.018, s * 0.37, s * 0.37 + 0.004, 0xe8d8a0); },
  teeth: (P, x, y, z, s, c) => { FL(P, x, y, z, s * 0.8, 0.008, s * 0.5, 0xd89aa0); for (let i = 0; i < 8; i++) { FL(P, x - s * 0.32 + i * s * 0.09, y + 0.008, z + s * 0.18, s * 0.075, 0.014, 0.008, c); FL(P, x - s * 0.32 + i * s * 0.09, y + 0.008, z - s * 0.18, s * 0.075, 0.014, 0.008, c); } },
  deed: (P, x, y, z, s, c) => { FL(P, x, y, z, s * 0.75, 0.004, s, c, 0.1); CY(P, x + s * 0.2, y + 0.004, z + s * 0.32, 0.012, 0.002, 0xb83a3a, 8); FL(P, x - s * 0.1, y + 0.004, z - s * 0.2, s * 0.4, 0.0012, 0.004, 0x6a6a6a, 0.1); },
  ticket: (P, x, y, z, s, c) => { FL(P, x, y, z, s * 0.45, 0.003, s, c, 0.2); FL(P, x, y + 0.003, z - s * 0.25, s * 0.45, 0.0012, s * 0.18, 0xb83a3a, 0.2); },
  letter: (P, x, y, z, s, c) => { FL(P, x, y, z, s, 0.006, s * 0.65, c, 0.08); FL(P, x, y + 0.006, z, 0.01, 0.0015, s * 0.66, 0xb83a5a, 0.08); FL(P, x, y + 0.006, z, s * 1.02, 0.0015, 0.01, 0xb83a5a, 0.08); },
  map: (P, x, y, z, s, c) => { FL(P, x, y, z, s * 0.9, 0.003, s * 0.7, 0xe8d8a8, 0.15); for (const r of [0.8, -0.8]) FL(P, x + s * 0.15, y + 0.003, z, 0.03, 0.0012, 0.005, 0xb83a3a, r); },
  photo: (P, x, y, z, s, c) => { FL(P, x, y, z, s * 0.75, 0.004, s, 0xf4f0e4, 0.1); FL(P, x, y + 0.004, z - s * 0.04, s * 0.6, 0.0012, s * 0.7, 0x8a8a7a, 0.1); },
  shirt: (P, x, y, z, s, c) => { FL(P, x, y, z, s * 0.7, 0.03, s * 0.6, c, 0.05); FL(P, x, y + 0.03, z, s * 0.7, 0.002, s * 0.15, 0xf2f2ee, 0.05); FL(P, x + s * 0.1, y + 0.032, z + s * 0.1, s * 0.3, 0.0012, 0.006, 0x1c1c1e, 0.5); },
  knickers: (P, x, y, z, s, c) => {
    FL(P, x, y, z, s * 0.9, 0.012, s * 0.6, c, 0.1); FL(P, x, y + 0.012, z, s * 0.7, 0.008, s * 0.42, shade(c, 1.06), 0.1);
    for (let i = 0; i < 7; i++) SP(P, x - s * 0.36 + i * s * 0.12, y + 0.008, z + s * 0.3, 0.008, 0.008, 0.008, 0xfff4f6, 5);
    SP(P, x, y + 0.024, z, 0.009, 0.007, 0.009, shade(c, 0.85), 5);
  },
  jar: (P, x, y, z, s, c) => { CY(P, x, y, z, s * 0.34, s * 0.7, 0xcfe4ec, 12); CY(P, x, y + s * 0.6, z, s * 0.3, s * 0.12, c, 10); },
  box: (P, x, y, z, s, c) => { FL(P, x, y, z, s, s * 0.4, s * 0.8, c); FL(P, x, y + s * 0.4, z, s + 0.004, s * 0.1, s * 0.8 + 0.004, shade(c, 0.82)); },
  doll: (P, x, y, z, s, c) => SH.figure(P, { x, y, z, w: s * 0.7, h: s, d: s * 0.7, col: c }),
  key: (P, x, y, z, s, c) => SH.key(P, { x, y, z, w: s, h: 0.004, d: s * 0.3, col: c }),
  ball: (P, x, y, z, s, c) => SP(P, x, y + s / 2, z, s / 2, s / 2, s / 2, c, 10),
};
/** Footprint and height of a find (its base included) as drawn: { w, h, d, baseH }. */
export function findDims(shape, size, wrap) {
  const b = WRAP[wrap] ?? null, fh = Math.max(0.006, size * (ASPECT[shape] ?? 0.5)), fw = Math.max(size, 0.02);
  const w = FLATS.has(shape) ? size * 0.8 : fw, d = shape === 'watch' ? size * 1.05 : FLATS.has(shape) ? size : fw;
  return { w: Math.max(b?.w ?? 0, w) + 0.01, d: Math.max(b?.d ?? 0, d) + 0.01, h: (b?.h ?? 0) + fh, baseH: b?.h ?? 0 };
}
function drawFind(P, o) {
  const f = o.fd, b = WRAP[f.wrap] ?? null;
  let y = o.y;
  if (b) { b.draw(P, o.x, y, o.z); y += b.h; }
  (FIND[f.shape] ?? FIND.box)(P, o.x, y, o.z, f.size, f.tint);
}
export const FIND_SHAPE_NAMES = Object.keys(FIND), WRAP_NAMES = Object.keys(WRAP), PROP_SHAPES = Object.keys(SH);

/** Draw one thing (an ordinary object, a paper, a special find) in the piece's frame. */
export function drawProp(P, o) {
  if (o.fd) drawFind(P, o);
  else if (o.cover) drawPaper(P, o);
  else (SH[o.sh] ?? SH.box)(P, o);
}
