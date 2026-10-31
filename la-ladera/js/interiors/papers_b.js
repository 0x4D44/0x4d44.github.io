// Readable papers, batch B: the special buildings (chapel, school, clinic, workshop, hall, kiosk), the shops, couples, students and a few secrets.
// DATA ONLY (written by the lead; builders read, never edit: ask in dev/REQUESTS.md). Schema, tokens and filters: content.js.
export const PAPERS_B = [
  // ------------------------------------------------------------------------------------------------ the chapel
  {
    id: 'sermon_padre', kind: 'diary', title: 'Apuntes de los sermones del padre Anselmo', en: "Father Anselmo's sermon notes", who: 'Padre Anselmo', cover: 'leather',
    where: ['tvstand', 'wallunit', 'desk', 'wardrobe', 'filing', 'chest'], lot: ['chapel'], themes: ['faith', 'humour'],
    pages: [
      { when: 'Domingo de Ramos',
        es: `Borrador: «Hermanos, la escalinata nos enseña que subir cuesta». Tachado. Segundo borrador: «Hermanos, subir cuesta, pero bajar con el mercado cuesta más». Don Segundo se rio tan fuerte que lo oyeron en la panadería. Tercer borrador: lo dije de memoria, sin papel. Fue el mejor sermón del año.`,
        en: `Draft: "Brothers, the big stairway teaches us that climbing is hard." Crossed out. Second draft: "Brothers, climbing is hard, but coming down with the shopping is harder." Don Segundo laughed so loudly they heard him at the bakery. Third draft: I said it by heart, without paper. It was the best sermon of the year.` },
      { when: 'Nota para mí',
        es: `Recordar: no alargar el sermón cuando hay partido; la gente se dispersa a las 5:40 con un oído en la radio. Recordar: sí alargarlo cuando llueve, porque nadie quiere salir. Recordar también: bendecir las motos el día de San Cristóbal, aunque suenen más fuerte que el órgano.`,
        en: `Remember: don't stretch the sermon when there's a match; people drift off at 5:40 with one ear on the radio. Remember: do stretch it when it rains, because nobody wants to go out. Also remember: bless the motorbikes on Saint Christopher's day, even though they are louder than the organ.` },
    ],
  },
  {
    id: 'hoja_parroquial', kind: 'clipping', title: 'Hoja parroquial de la semana', en: "This week's parish sheet", who: 'La parroquia', cover: 'loose',
    where: ['wallunit', 'tvstand', 'desk', 'wardrobe', 'filing', 'chest'], lot: ['chapel'], themes: ['humour', 'faith', 'joy'],
    pages: [
      { when: 'Avisos',
        es: `Miércoles: ensayo del coro (se busca un tenor, o al menos alguien que desafine menos). Jueves: se perdió un gato naranja que responde al nombre de «Padre». Viernes: bingo para el techo de la capilla; traigan sombrilla, por si el bingo coincide con la gotera. Domingo: misa de seis y buñuelos después; cada quien trae los suyos.`,
        en: `Wednesday: choir practice (we need a tenor, or at least someone who goes flat less). Thursday: lost, an orange cat who answers to "Father". Friday: bingo for the chapel roof; bring umbrellas, in case the bingo coincides with the leak. Sunday: six o'clock Mass and fritters afterwards; everybody brings their own.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ the school
  {
    id: 'boletin_notas', kind: 'certificate', title: 'Boletín de notas, primer período', en: 'School report card, first term', who: 'Escuela El Cerro', cover: 'card',
    where: ['desk', 'locker', 'tvstand', 'wallunit', 'filing'], lot: ['school'], themes: ['hope', 'challenge'],
    pages: [
      { when: 'Notas',
        es: `Matemáticas: 4,6. Lenguaje: 3,8. Ciencias: 4,2. Comportamiento: «Participa mucho, a veces demasiado». Observación de la profesora: «Un niño que pregunta por qué a cada cosa va a llegar lejos, aunque yo llegue cansada». Firma del acudiente: una X grande y una huella de pulgar. La abuela no sabe escribir, pero vino.`,
        en: `Maths: 4.6. Language: 3.8. Science: 4.2. Behaviour: "Takes part a lot, sometimes too much". Teacher's remark: "A boy who asks why about everything will go far, even if I arrive tired". Guardian's signature: a big X and a thumbprint. Grandma can't write, but she came.` },
    ],
  },
  {
    id: 'nota_casillero', kind: 'note', title: 'Nota doblada en un casillero', en: 'A note folded into a locker', who: 'Una compañera', cover: 'loose',
    where: ['locker', 'desk'], lot: ['school'], themes: ['love', 'humour', 'secret'],
    pages: [
      { when: 'Recreo',
        es: `Te vi anoche en la cancha y metiste el gol de la victoria con la zurda, aunque tú digas que fue rebote. No te lo dije en persona porque me da pena y porque estabas rodeado de gente. Te dejo esta nota y la mitad de mi merienda. La otra mitad es para mí. Firmado: la de las trenzas.`,
        en: `I saw you last night on the court and you scored the winning goal with your left foot, though you say it was a rebound. I didn't tell you in person because I'm shy and because you were surrounded by people. I'm leaving this note and half of my snack. The other half is for me. Signed: the one with the braids.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ the health post
  {
    id: 'libro_puesto_salud', kind: 'diary', title: 'Libro de turnos del puesto de salud', en: 'Health post shift book', who: 'La enfermera de turno', cover: 'ledger',
    where: ['medcab', 'desk', 'tvstand', 'wallunit', 'filing'], lot: ['clinic'], themes: ['challenge', 'hope', 'joy'],
    pages: [
      { when: 'Lunes',
        es: `Atendidos: 63. Tos: 21. Fiebre: 9. Presión: 14. Raspones de moto: 3. Controles de embarazo: 4. Un niño vino solo, con un resfriado y una moneda para pagar la consulta; la consulta es gratis, así que le devolvimos la moneda con una paleta. Faltó la luz dos veces y la vacuna se salvó en la nevera de la tienda de enfrente.`,
        en: `Seen: 63. Coughs: 21. Fevers: 9. Blood pressure: 14. Motorbike scrapes: 3. Pregnancy check-ups: 4. A boy came alone, with a cold and a coin to pay for the visit; the visit is free, so we gave the coin back with a lollipop. The power went off twice and the vaccine was saved in the fridge of the shop across the street.` },
      { when: 'Viernes, madrugada',
        es: `Nació un bebé en el puesto, porque la ambulancia no alcanzó a subir. La mamá dijo: «No hay otro nombre posible» y le puso Milagros. Los vecinos trajeron mantas, tinto y un gallo (no pregunten). A las tres de la mañana se oyó el llanto y todo el cerro encendió una luz.`,
        en: `A baby was born at the post, because the ambulance couldn't make it up the hill. The mother said, "There is no other possible name" and called her Milagros. The neighbours brought blankets, coffee and a rooster (don't ask). At three in the morning the cry was heard and the whole hill switched on a light.` },
    ],
  },
  {
    id: 'carta_gracias_doctora', kind: 'letter', title: 'Carta de agradecimiento', en: 'A thank-you letter', who: 'Una paciente', cover: 'envelope',
    where: ['desk', 'tvstand', 'wallunit', 'medcab', 'filing', 'vitrine'], lot: ['clinic'], themes: ['joy', 'hope', 'memory'],
    pages: [
      { when: 'Con letra de nieta',
        es: `Doctora: le escribo con la letra de mi nieta porque yo no sé escribir, pero lo que sigue lo digo yo. Usted me quitó una tos de tres inviernos y me escuchó hablar de mi marido sin mirar el reloj. Le mando un frasco de miel y la bendición de la Virgen. No me lo rechace: es poca miel y mucha gratitud.`,
        en: `Doctor: I am writing in my granddaughter's handwriting because I can't write, but what follows I say myself. You took away a cough of three winters and listened to me talk about my husband without looking at the clock. I'm sending you a jar of honey and the Virgin's blessing. Don't refuse it: it's a little honey and a lot of gratitude.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ the workshops
  {
    id: 'libro_taller', kind: 'ledger', title: 'El libro del taller', en: 'The workshop ledger', who: 'El maestro del taller', cover: 'ledger',
    where: ['toolcab', 'desk', 'wallunit', 'filing'], lot: ['workshop'], themes: ['humour', 'problem', 'joy'],
    pages: [
      { when: 'Esta semana',
        es: `Moto azul: cambio de aceite, 25 mil. Moto roja: no arranca (no tiene gasolina), 5 mil por el diagnóstico. Bicicleta del niño de la 14: pinchazo, gratis; mañana me paga con un dibujo. Motocarro de don Segundo: el ruido que oía era él cantando. El consejo no se cobra.`,
        en: `Blue motorbike: oil change, 25 thousand. Red motorbike: won't start (no petrol), 5 thousand for the diagnosis. Bike of the boy from number 14: puncture, free; tomorrow he'll pay me with a drawing. Don Segundo's motor-tricycle: the noise he heard was himself singing. Advice is not charged for.` },
      { when: 'Reglas del taller',
        es: `Regla 1: el cliente siempre tiene razón (salvo cuando no la tiene). Regla 2: si sobra un tornillo, no es un tornillo: es una lección. Regla 3: lo que hoy no se arregla se arregla con paciencia. Regla 4: el tinto se paga con una historia, y la historia tiene que ser buena.`,
        en: `Rule 1: the customer is always right (except when not). Rule 2: if a bolt is left over, it isn't a bolt: it's a lesson. Rule 3: what can't be fixed today is fixed with patience. Rule 4: coffee is paid for with a story, and the story has to be a good one.` },
    ],
  },
  {
    id: 'cuaderno_carpintero', kind: 'diary', title: 'Cuaderno del carpintero', en: "The carpenter's notebook", who: 'El carpintero', cover: 'school',
    where: ['toolcab', 'wallunit', 'desk', 'filing'], lot: ['workshop'], themes: ['dream', 'memory', 'challenge'],
    pages: [
      { when: 'Hoy',
        es: `Hoy terminé la cuna para la bebé de Leidy. Cedro, sin clavos, solo espigas y paciencia. Medí tres veces; corté una. La niña todavía no ha nacido y ya tiene la cama más bonita del cerro. Mi padre decía que un mueble bien hecho es una oración con olor a madera.`,
        en: `Today I finished the crib for Leidy's baby girl. Cedar, no nails, only dowels and patience. Measured three times; cut once. The girl isn't born yet and already has the prettiest bed on the hill. My father used to say a well-made piece of furniture is a prayer that smells of wood.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ the community hall
  {
    id: 'acta_junta', kind: 'note', title: 'Acta de la reunión de la junta', en: 'Minutes of the neighbourhood board', who: 'La secretaria de la junta', cover: 'school',
    where: ['tvstand', 'wallunit', 'desk', 'filing'], lot: ['hall'], themes: ['humour', 'problem'],
    pages: [
      { when: 'Acta n.º 47',
        es: `Asistentes: 23 vecinos y un perro. Punto 1: las luces de la escalinata (se aprobó cambiar tres bombillos y rezar por el cuarto). Punto 2: el gallo de la 10 (aplazado por falta de quórum del gallo). Punto 3: varios (nadie quiso hablar de varios). Se levantó la sesión a las nueve, porque empezó la novela.`,
        en: `Present: 23 neighbours and a dog. Item 1: the stairway lights (approved: change three bulbs and pray for the fourth). Item 2: the rooster at number 10 (postponed for lack of a quorum of roosters). Item 3: any other business (nobody wanted to discuss any other business). Meeting closed at nine, because the soap opera started.` },
    ],
  },
  {
    id: 'turnos_aseo', kind: 'list', title: 'Turnos de aseo del salón comunal', en: 'Cleaning rota for the community hall', who: 'La junta', cover: 'loose',
    where: ['tvstand', 'wallunit', 'desk', 'fridge', 'filing'], lot: ['hall'], themes: ['humour', 'joy'],
    pages: [
      { when: 'La semana',
        es: `Lunes: familia Yepes. Martes: los de la 14. Miércoles: doña Berta (con su escoba famosa). Jueves: los muchachos del fútbol (se les cobra el barro). Viernes: libre, porque hay bingo. Sábado: todos, porque hay fiesta. Anotación al pie: doña Berta limpia de maravilla pero se guarda lo que encuentra; ya hay una caja con catorce aretes sin pareja.`,
        en: `Monday: the Yepes family. Tuesday: the folks from number 14. Wednesday: Doña Berta (with her famous broom). Thursday: the football boys (they're charged for the mud). Friday: free, because there's bingo. Saturday: everybody, because there's a party. Note at the bottom: Doña Berta cleans wonderfully but keeps what she finds; there is already a box with fourteen earrings that have lost their pair.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ the kiosk
  {
    id: 'libreta_chance', kind: 'ledger', title: 'La libreta del chance', en: 'The lottery-numbers notebook', who: 'El del kiosco', cover: 'ledger',
    where: ['counter', 'wallunit', 'filing'], lot: ['kiosk'], themes: ['humour', 'hope', 'problem'],
    pages: [
      { when: 'Los números de hoy',
        es: `El 07, el 13 y el 21. Don Segundo juega siempre el 12, la edad de su gallo. La profe juega el 03, su día de nacimiento, y dice que no es apostar, que es estadística. Una señora jugó mil pesos a la fecha de su boda y ganó dos mil; fue su mejor día desde la boda.`,
        en: `The 07, the 13 and the 21. Don Segundo always plays the 12, his rooster's age. The teacher plays the 03, her birthday, and says it isn't betting, it's statistics. A lady staked a thousand pesos on her wedding date and won two thousand; it was her best day since the wedding.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ the shops
  {
    id: 'libro_citas', kind: 'ledger', title: 'El libro de citas', en: 'The appointment book', who: '{A}', cover: 'ledger',
    where: ['counter', 'wallunit', 'dresser', 'tvstand', 'filing'], shop: ['peluqueria'], voice: { role: 'woman' }, themes: ['humour', 'secret'],
    pages: [
      { when: 'Martes',
        es: `9:00: doña Cleotilde, tinte rojo cereza (que nadie sepa que es tinte). 10:30: la novia de Brayan, peinado de quinceañera (aunque se casa). 12:00: don Segundo, corte y una conversación de una hora. 3:00: las gemelas, trenzas, y se pelean por quién se sienta primero. Todo lo que se cuenta aquí se queda aquí. O casi.`,
        en: `9:00: Doña Cleotilde, cherry-red dye (nobody must know it's dye). 10:30: Brayan's fiancée, a quinceañera hairdo (even though she's getting married). 12:00: Don Segundo, a trim and an hour's conversation. 3:00: the twins, braids, and they fight over who sits first. Everything said here stays here. Or almost.` },
    ],
  },
  {
    id: 'pizarra_precios', kind: 'list', title: 'La pizarra de precios', en: 'The price board', who: '{A}', cover: 'loose',
    where: ['counter', 'wallunit', 'tvstand', 'pantry'], lot: ['cornerstore', 'shophouse', 'kiosk'], voice: { role: 'woman' }, themes: ['humour', 'problem'],
    pages: [
      { when: 'Hoy',
        es: `Arroz, libra: 2.600. Panela: 3.200. Huevo: 600 si lo quiere crudo y 700 si lo quiere con cariño. Leche: 3.500. Fiado: «hoy no, mañana sí» (consulte la libreta). Una libra de paciencia: gratis, pero hoy se acabó.`,
        en: `Rice, per pound: 2,600. Panela: 3,200. Egg: 600 if you want it raw and 700 if you want it with affection. Milk: 3,500. Credit: "not today, tomorrow yes" (see the ledger). A pound of patience: free, but today it ran out.` },
    ],
  },
  {
    id: 'pedido_proveedor', kind: 'list', title: 'Pedido al proveedor', en: 'Order for the supplier', who: '{A}', cover: 'loose',
    where: ['counter', 'wallunit', 'tvstand', 'desk', 'pantry', 'filing'], lot: ['cornerstore', 'shophouse', 'kiosk'], voice: { role: 'woman' }, themes: ['problem', 'hope'],
    pages: [
      { when: 'Pedido del jueves',
        es: `Dos bultos de arroz, uno de lentejas, 24 aceites, 10 panelas, seis cajas de huevos, 12 paquetes de galletas (las de la niña), dulces (los de la profe) y velas, por si se va la luz, que se va. Nota: pagar la mitad hoy y la mitad cuando vendamos las velas.`,
        en: `Two sacks of rice, one of lentils, 24 bottles of oil, 10 blocks of panela, six boxes of eggs, 12 packets of biscuits (the little girl's), sweets (the teacher's) and candles, in case the power goes, which it does. Note: pay half today and half when we sell the candles.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ couples and students
  {
    id: 'lista_regalos', kind: 'list', title: 'Lista de regalos para {W}', en: 'Gift list for {W}', who: '{A}', cover: 'loose',
    where: ['nightstand', 'dresser', 'wardrobe', 'desk'], homes: { kind: ['couple', 'family'] }, voice: { role: 'man' }, themes: ['love', 'humour', 'secret'],
    pages: [
      { when: 'Con lápiz',
        es: `1. Un reloj (muy caro). 2. Una radio nueva (cara). 3. Un viaje a la costa (carísimo; ahorrar tres años). 4. Flores del patio de doña Berta, con permiso (gratis). 5. Cocinar yo el domingo sin quemar nada (casi imposible). Elegí el 4 y el 5. Para el 3 ya empecé a ahorrar en una lata.`,
        en: `1. A watch (very expensive). 2. A new radio (expensive). 3. A trip to the coast (extremely expensive; save for three years). 4. Flowers from Doña Berta's yard, with permission (free). 5. Me cooking on Sunday without burning anything (almost impossible). I chose 4 and 5. For number 3 I've already started saving in a tin.` },
    ],
  },
  {
    id: 'cuaderno_ahorro_mar', kind: 'diary', title: 'Nuestro cuaderno de ahorro', en: 'Our savings notebook', who: '{M} y {W}', cover: 'notebook',
    where: ['nightstand', 'dresser', 'desk', 'kitchen'], homes: { kind: ['couple', 'family'] }, themes: ['dream', 'love', 'joy'],
    pages: [
      { when: 'Enero (letra de {W})',
        es: `Meta: el mar. Ahorrado: 40 mil. Pasaje de ida: 85 mil por persona. Alojamiento: una carpa prestada. Comida: arepas de la casa. Sueño: ver amanecer sin que suene ningún despertador.`,
        en: `Goal: the sea. Saved: 40 thousand. One-way fare: 85 thousand each. Lodging: a borrowed tent. Food: arepas from home. Dream: to see the sunrise without any alarm clock going off.` },
      { when: 'Junio (letra de {M})',
        es: `Ahorrado: 410 mil. Falta poco. Hoy compré un sombrero ridículo para la playa; {W} se rio una hora y no me dejó devolverlo. Valió cada peso.`,
        en: `Saved: 410 thousand. Not long to go. Today I bought a ridiculous beach hat; {W} laughed for an hour and wouldn't let me return it. Worth every peso.` },
      { when: 'Diciembre (letra de los dos)',
        es: `Ahorrado: 1.200.000. ¡Vamos! Dos maletas, un mantel, una foto del cerro en la billetera por si nos da nostalgia en el mar. (Nos va a dar.)`,
        en: `Saved: 1,200,000. We're going! Two suitcases, a tablecloth, a photo of the hill in the wallet in case we get homesick at the sea. (We will.)` },
    ],
  },
  {
    id: 'notas_nevera_estudiantes', kind: 'note', title: 'Papelitos de la nevera', en: 'Fridge notes', who: 'Los de la casa', cover: 'loose',
    where: ['kitchen', 'tvstand', 'wallunit', 'desk', 'fridge'], homes: { kind: ['students'] }, themes: ['humour', 'problem', 'joy'],
    pages: [
      { when: 'Pegados con cinta',
        es: `Nota 1: Quien se comió mi yogur: sé quién eres y sé dónde duermes. Nota 2: No fui yo; fue el gato. Nota 3: No tenemos gato. Nota 4: Entonces fue un fantasma con hambre. Nota 5: El arroz del jueves no se bota: es del viernes. Nota 6: Hay que pagar la luz. Sí, la de verdad.`,
        en: `Note 1: Whoever ate my yoghurt: I know who you are and I know where you sleep. Note 2: It wasn't me; it was the cat. Note 3: We don't have a cat. Note 4: Then it was a hungry ghost. Note 5: Thursday's rice is not to be thrown out: it's Friday's. Note 6: The electricity has to be paid. Yes, the real one.` },
    ],
  },
  {
    id: 'carta_a_mama', kind: 'letter', title: 'Carta a mamá', en: 'Letter to Mum', who: '{A}', cover: 'envelope',
    where: ['desk', 'nightstand', 'dresser'], homes: { kind: ['students'] }, voice: { role: 'young' }, themes: ['love', 'hope', 'challenge'],
    pages: [
      { when: 'Sin fecha',
        es: `Mamá: estoy bien. Como bien (ayer comí tres veces, aunque dos fueron arepa). Mi cuarto es pequeño, pero tiene una ventana desde donde veo el cerro de nuestra casa. Los exámenes están difíciles, pero ya conocí a una profesora que ayuda. Te mando 20 mil que me sobraron. No digas que no los necesitas; yo sé que sí. Un beso a la abuela. {A}.`,
        en: `Mum: I'm fine. I eat well (yesterday I ate three times, although two were arepa). My room is small, but it has a window from which I can see the hill of our house. The exams are hard, but I've met a teacher who helps. I'm sending you the 20 thousand I had left over. Don't say you don't need it; I know you do. A kiss to Grandma. {A}.` },
    ],
  },
  {
    id: 'horario_clases', kind: 'list', title: 'Horario de clases, con anotaciones', en: 'Class timetable, annotated', who: '{A}', cover: 'loose',
    where: ['desk', 'wardrobe', 'nightstand', 'fridge'], homes: { kind: ['students'] }, voice: { role: 'young' }, themes: ['humour', 'hope', 'challenge'],
    pages: [
      { when: 'Semestre',
        es: `Lunes 7:00 Cálculo (dormir en la banca de atrás). Martes 9:00 Física (entender la mitad). Miércoles 11:00 Inglés («how are you» me sale perfecto). Jueves 2:00 Laboratorio (no romper nada esta vez). Viernes: tutoría y turno en la panadería. Sábado: dormir. Anotación en rojo: «Domingo: llamar a mamá».`,
        en: `Monday 7:00 Calculus (sleep on the back bench). Tuesday 9:00 Physics (understand half). Wednesday 11:00 English ("how are you" comes out perfectly). Thursday 2:00 Lab (don't break anything this time). Friday: tutorial and a shift at the bakery. Saturday: sleep. Note in red: "Sunday: call Mum".` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ secrets
  {
    id: 'confesion_vidrio', kind: 'letter', title: 'Confesión sin firma', en: 'Unsigned confession', who: 'Alguien del barrio', cover: 'loose',
    where: ['nightstand', 'dresser', 'wardrobe', 'desk', 'chest'], themes: ['secret', 'humour', 'faith'],
    pages: [
      { when: 'Para el padre',
        es: `Padre: fui yo quien rompió el vidrio de la capilla con un balón, en 1998. Corrí y nadie supo. El vidrio lo pagó la colecta, y desde entonces yo doy mil pesos cada domingo, por si acaso. Ya llevo pagado el vidrio tres veces. No me regañe: ¿me absuelve ya o tengo que pagarlo una cuarta vez?`,
        en: `Father: it was me who broke the chapel window with a ball, in 1998. I ran, and nobody knew. The collection paid for the glass, and since then I've given a thousand pesos every Sunday, just in case. I've paid for the window three times already. Don't scold me: do you absolve me now or must I pay for it a fourth time?` },
    ],
  },
  {
    id: 'si_algo_me_pasa', kind: 'note', title: 'Si algo me pasa…', en: 'If anything happens to me…', who: '{A}', cover: 'loose',
    where: ['nightstand', 'dresser', 'wardrobe'], homes: { kind: ['family', 'couple', 'elder'], kids: 1 }, voice: { role: 'woman' }, themes: ['secret', 'problem', 'love'],
    pages: [
      { when: 'En un sobre aparte',
        es: `Si algo me pasa: debajo de la tercera tabla del armario hay un sobre con 600 mil pesos. No es para el entierro, que los vecinos lo harán. Es para que {K} termine el bachillerato. Que nadie lo gaste en otra cosa; yo sé quién se haría el loco. Con todo mi amor, {A}.`,
        en: `If anything happens to me: under the third board of the wardrobe there is an envelope with 600 thousand pesos. It isn't for the funeral, the neighbours will see to that. It's for {K} to finish high school. Nobody is to spend it on anything else; I know who would play dumb. With all my love, {A}.` },
    ],
  },
  {
    id: 'admirador_secreto', kind: 'note', title: 'Notas de un admirador secreto', en: 'Notes from a secret admirer', who: 'Un admirador', cover: 'loose',
    where: ['desk', 'dresser', 'nightstand', 'wardrobe'], homes: [{ kind: ['students'] }, { kind: ['family'], teen: true }], themes: ['love', 'secret', 'humour'],
    pages: [
      { when: 'Nota 1',
        es: `Tienes una sonrisa que arregla la lluvia. No me preguntes cómo lo sé: la he visto desde la escalinata, y desde entonces hasta los escalones me parecen cortos. Un admirador.`,
        en: `You have a smile that fixes the rain. Don't ask me how I know: I've seen it from the stairway, and ever since even the steps seem short to me. An admirer.` },
      { when: 'Nota 2',
        es: `Hoy te vi pasar con la sombrilla amarilla y el cerro entero parecía estar de fiesta. Si no te molesta, mañana te dejo un chocolate. Si te molesta, también. P. D.: sé que sabes quién soy: el de las gafas.`,
        en: `Today I saw you go by with the yellow umbrella and the whole hill looked as if it were having a party. If you don't mind, tomorrow I'll leave you a chocolate. If you do mind, too. P.S.: I know you know who I am: the one with the glasses.` },
    ],
  },
];
