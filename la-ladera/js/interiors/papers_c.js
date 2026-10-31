// Readable papers, batch C: faith, secrets, dreams, memory, certificates, clippings and the medicine cabinet.
// DATA ONLY (written by the lead; builders read, never edit: ask in dev/REQUESTS.md). Schema, tokens and filters: content.js.
export const PAPERS_C = [
  // ------------------------------------------------------------------------------------------------ faith
  {
    id: 'peticiones_virgen', kind: 'diary', title: 'Cuaderno de peticiones y gracias', en: 'Notebook of petitions and thanks', who: '{A}', cover: 'notebook',
    where: ['nightstand', 'dresser', 'wardrobe', 'tvstand', 'wallunit', 'chest'], homes: { religious: 0.55, kids: 1 }, voice: { role: 'woman' }, themes: ['faith', 'hope', 'memory'],
    pages: [
      { when: 'Peticiones',
        es: `Virgencita del Carmen: te pido por la tos de {K}, por el trabajo de {M}, por el techo que gotea, por la paz del cerro y porque no llueva el día del bautizo. Y por si te sobra algo, por un poquito de plata. Amén. (Lo último lo escribí en voz baja.)`,
        en: `Virgin of Carmen: I ask you for {K}'s cough, for {M}'s job, for the roof that leaks, for the peace of the hill and for no rain on christening day. And in case you have something left over, for a little money. Amen. (I wrote the last part in a whisper.)` },
      { when: 'Gracias',
        es: `Gracias, Virgen, por la beca. Gracias por el trabajo. Gracias por el techo, que solo goteó un poquito. Y gracias, sobre todo, por la gente de esta escalinata, que me sostiene aunque no lo sepa. Te debo una vela, una flor y una promesa; ya sabes cuál.`,
        en: `Thank you, Virgin, for the scholarship. Thank you for the job. Thank you for the roof, which only leaked a little. And thank you above all for the people of this stairway, who hold me up without knowing it. I owe you a candle, a flower and a promise; you know which.` },
    ],
  },
  {
    id: 'promesa_escalinata', kind: 'letter', title: 'La promesa', en: 'The promise', who: '{A}', cover: 'loose',
    where: ['nightstand', 'dresser', 'wardrobe', 'chest'], homes: { kind: ['family', 'elder'], religious: 0.6 }, voice: { role: 'woman' }, themes: ['faith', 'hope', 'love'],
    pages: [
      { when: 'Antes',
        es: `Virgen del Carmen: mi muchacho se fue en un bus a buscar trabajo lejos y lleva once días sin llamar. Te prometo que si vuelve con bien subo la escalinata de rodillas, desde el primer escalón hasta la capilla. Son ciento y pico escalones. Los he contado muchas noches.`,
        en: `Virgin of Carmen: my boy took a bus to look for work far away and hasn't called for eleven days. I promise that if he comes back safe I'll climb the big stairway on my knees, from the first step to the chapel. It's a hundred and some steps. I've counted them on many nights.` },
      { when: 'Después',
        es: `Llegó anoche, flaco y con barba, con una bolsa de naranjas para mí. Hoy cumplí: subí de rodillas, despacio, con los vecinos mirando y nadie riéndose. En los ciento cincuenta pedí ayuda a la Virgen y apareció el brazo de doña Berta. Ya puedo morirme tranquila. Todavía no, claro: faltan los nietos.`,
        en: `He arrived last night, thin and bearded, with a bag of oranges for me. Today I kept my promise: I climbed on my knees, slowly, with the neighbours watching and nobody laughing. At step one hundred and fifty I asked the Virgin for help and Doña Berta's arm appeared. Now I can die in peace. Not yet, of course: the grandchildren are still to come.` },
    ],
  },
  {
    id: 'catequista', kind: 'diary', title: 'Cuaderno de la catequista', en: "The catechist's notebook", who: '{A}', cover: 'school',
    where: ['desk', 'wallunit', 'nightstand', 'tvstand'], homes: { religious: 0.6 }, voice: { role: 'woman' }, themes: ['faith', 'humour', 'joy'],
    pages: [
      { when: 'Clase de primera comunión',
        es: `Preguntas de hoy: ¿Dios tiene celular? ¿Se ve el cielo desde el mirador? ¿Los perros van al cielo? (Dije que sí; el padre dijo que no estaba seguro; yo estoy segura.) ¿Si me porto mal, la Virgen me quita el postre? Las respuestas fueron regulares. Las preguntas, perfectas.`,
        en: `Today's questions: Does God have a mobile phone? Can you see heaven from the viewpoint? Do dogs go to heaven? (I said yes; the priest said he wasn't sure; I am sure.) If I behave badly, will the Virgin take away my dessert? The answers were so-so. The questions, perfect.` },
      { when: 'El jueves',
        es: `Un niño me dijo que quiere ser santo, pero no demasiado, porque le gusta jugar fútbol. Le conté que San Juan Bosco jugaba con los niños y hacía malabares. Se emocionó muchísimo. Ya tiene patrón. Mañana le llevo una estampa.`,
        en: `A boy told me he wants to be a saint, but not too much of one, because he likes playing football. I told him Saint John Bosco played with children and juggled. He was thrilled. Now he has a patron. Tomorrow I'll take him a holy card.` },
    ],
  },
  {
    id: 'recordatorio_difunto', kind: 'card', title: 'Recordatorio: Eliécer Bermúdez', en: 'Funeral memento: Eliécer Bermúdez', who: 'La familia Bermúdez', cover: 'card',
    where: ['nightstand', 'dresser', 'wardrobe', 'tvstand', 'wallunit', 'vitrine', 'chest'], homes: { religious: 0.4 }, themes: ['faith', 'memory'],
    pages: [
      { when: 'Anverso',
        es: `En memoria de Eliécer Bermúdez, que partió a la casa del Padre el 14 de marzo. Fue panadero, vecino, padre y cantador de boleros mal afinados. «El que ama no muere: se muda de cerro.» Sus amigos y su familia lo recuerdan en cada pan caliente.`,
        en: `In memory of Eliécer Bermúdez, who departed for the Father's house on 14 March. He was a baker, a neighbour, a father and a singer of out-of-tune boleros. "Whoever loves doesn't die: they move to another hill." His friends and family remember him in every hot loaf.` },
      { when: 'Reverso',
        es: `Dale, Señor, el descanso eterno, y que brille para él la luz perpetua. Que descanse en paz. Amén. (Debajo, a lápiz: «Papá, el pan de hoy te salió bien. Lo hice con tus manos».)`,
        en: `Grant him, Lord, eternal rest, and let perpetual light shine upon him. May he rest in peace. Amen. (Underneath, in pencil: "Dad, today's bread came out right. I made it with your hands.")` },
    ],
  },
  {
    id: 'oracion_san_judas', kind: 'card', title: 'Oración a San Judas Tadeo', en: 'Prayer to Saint Jude', who: 'Copiada a mano', cover: 'card',
    where: ['nightstand', 'dresser', 'wardrobe', 'kitchen', 'tvstand', 'wallunit', 'fridge', 'chest'], homes: { religious: 0.5 }, themes: ['faith', 'problem', 'humour'],
    pages: [
      { when: 'La oración',
        es: `San Judas Tadeo, apóstol fiel, abogado de los casos difíciles: ayúdame. Mi caso es difícil: el arriendo, la tos, el mal genio del jefe y el techo. Te prometo publicar el favor en el periódico o, por lo menos, contárselo a toda la cuadra. Amén.`,
        en: `Saint Jude Thaddaeus, faithful apostle, advocate of hard cases: help me. My case is hard: the rent, the cough, the boss's temper and the roof. I promise to publish the favour in the newspaper or, at least, to tell the whole block. Amen.` },
      { when: 'Anotación posterior',
        es: `Se cumplió. No sé cuál de las cuatro cosas fue la que ayudó, pero se cumplió. Se publicó: una notica en la sección de avisos, ocho mil pesos. Valió la pena. Puse la estampa en el espejo, para que vea cómo me va.`,
        en: `It came true. I don't know which of the four things helped, but it came true. It was published: a small notice in the classifieds, eight thousand pesos. It was worth it. I put the holy card on the mirror, so he can see how I'm doing.` },
    ],
  },
  {
    id: 'gracias_casita', kind: 'note', title: 'Gracias por la casa', en: 'Thanks for the house', who: 'La familia {S}', cover: 'loose',
    where: ['nightstand', 'dresser', 'wardrobe', 'tvstand', 'wallunit'], homes: { religious: 0.5 }, themes: ['faith', 'joy', 'memory'],
    pages: [
      { when: 'Atado a un milagrito de lata',
        es: `Gracias, Virgencita, por la casa. Teníamos solo tres paredes y hoy tenemos cuatro y un techo. Prometimos esta casita de lata y aquí está, para que otro pida lo suyo. Que nunca falte quien suba a darte las gracias. La familia {S}.`,
        en: `Thank you, little Virgin, for the house. We had only three walls and today we have four and a roof. We promised this little tin house and here it is, so that someone else may ask for theirs. May there never be a lack of people climbing up to thank you. The {S} family.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ secrets
  {
    id: 'receta_secreta', kind: 'note', title: 'La receta secreta (no mostrar a nadie)', en: 'The secret recipe (show no one)', who: '{A}', cover: 'loose',
    where: ['kitchen', 'tvstand', 'wallunit', 'dresser', 'pantry'], voice: { role: 'woman' }, themes: ['secret', 'memory', 'joy'],
    pages: [
      { when: 'Ají de la casa',
        es: `Tomate de árbol, cebolla larga, cilantro, ají de verdad (no de mentira), un chorrito de vinagre y una pizca de sal. Y el secreto, que va aquí en letra chiquita: una cucharadita de panela. Mi abuela se llevó el secreto a la tumba y yo se lo robé en vida. Si lo cuentas, te desheredo.`,
        en: `Tree tomato, spring onion, coriander, real chilli (not the fake kind), a splash of vinegar and a pinch of salt. And the secret, which goes here in tiny letters: a teaspoon of panela. My grandmother took the secret to her grave and I stole it from her while she lived. If you tell, I'll disinherit you.` },
    ],
  },
  {
    id: 'promesa_no_jugar', kind: 'diary', title: 'Prometí no jugar más', en: 'I promised not to gamble any more', who: '{A}', cover: 'notebook',
    where: ['nightstand', 'dresser', 'wardrobe', 'desk', 'chest'], homes: { kind: ['family', 'couple'] }, voice: { role: 'man' }, themes: ['secret', 'problem', 'hope'],
    pages: [
      { when: 'Lunes',
        es: `Prometí no jugar más al chance. Hoy jugué cinco mil. Gané cuatro mil. Los cuatro mil son para el pan, así que técnicamente perdí mil y gané un pan. Que nadie en casa lea esta cuenta, que me la corrigen con sumas que no me gustan.`,
        en: `I promised not to play the numbers any more. Today I staked five thousand. I won four thousand. The four thousand are for the bread, so technically I lost a thousand and won a loaf. Nobody at home must read this sum, they'd correct it with arithmetic I don't like.` },
      { when: 'Jueves',
        es: `Hoy no jugué. Pasé frente al kiosco, saludé y seguí caminando sin comprar. En la esquina me puse a llorar de orgullo. Después me comí un pan con los cuatro mil de la otra vez, y todo cuadró. Esta noche duermo como un santo con deudas.`,
        en: `Today I didn't play. I walked past the kiosk, said hello and kept going without buying. On the corner I started crying with pride. Then I ate a loaf with the four thousand from last time, and everything balanced. Tonight I'll sleep like a saint in debt.` },
    ],
  },
  {
    id: 'nota_abuelo', kind: 'letter', title: 'Si encuentras esto, hijo', en: 'If you find this, son', who: '{A}', cover: 'envelope',
    where: ['wardrobe', 'dresser', 'nightstand', 'chest'], homes: { kind: ['elder', 'family'], elder: true }, voice: { role: 'man' }, themes: ['secret', 'memory', 'love'],
    pages: [
      { when: 'Para cuando yo no esté',
        es: `Hijo: cuando yo no esté, mira detrás del cajón de abajo. Hay una cajita con una moneda de oro que me dio mi padre, que se la dio el suyo. No la vendas por necesidad: véndela solo por un sueño. Y si no hay sueño que la valga, guárdala para tu nieto. Mi padre me dijo lo mismo. {A}.`,
        en: `Son: when I'm gone, look behind the bottom drawer. There's a little box with a gold coin my father gave me, which his own father gave him. Don't sell it out of need: sell it only for a dream. And if no dream is worth it, keep it for your grandchild. My father told me the same. {A}.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ dreams
  {
    id: 'carta_nino_dios', kind: 'letter', title: 'Carta al Niño Dios', en: 'Letter to the Christ Child', who: '{A}', cover: 'loose',
    where: ['desk', 'nightstand', 'dresser', 'wardrobe', 'chest'], homes: { kids: 1 }, voice: { role: 'kid' }, themes: ['dream', 'joy', 'humour'],
    pages: [
      { when: 'Diciembre',
        es: `Querido Niño Dios: este año me porté más o menos bien. Quiero una bicicleta, un balón de verdad y que mi papá no trabaje los domingos. Si no hay bicicleta, me conformo con el balón. Si no hay balón, que haya buñuelos. Si no hay nada, igual te quiero. {A}. P. D.: a mi hermano no le traigas nada, por lo de la ventana.`,
        en: `Dear Christ Child: this year I behaved more or less well. I want a bicycle, a real football and for my dad not to work on Sundays. If there's no bicycle, I'll settle for the football. If there's no football, let there be fritters. If there's nothing, I still love you. {A}. P.S.: don't bring my brother anything, because of the window.` },
    ],
  },
  {
    id: 'plan_empanadas', kind: 'list', title: 'El negocio de las empanadas', en: 'The empanada business', who: '{A}', cover: 'loose',
    where: ['kitchen', 'tvstand', 'wallunit', 'desk', 'dresser', 'pantry'], homes: { kind: ['family', 'couple', 'shopkeeper'] }, voice: { role: 'woman' }, themes: ['dream', 'challenge', 'hope'],
    pages: [
      { when: 'Las cuentas',
        es: `Empanadas {A}: 40 diarias a 1.500 son 60 mil. Gastos: harina 14 mil, carne 18 mil, aceite 6 mil, gas 5 mil: 43 mil. Ganancia: 17 mil al día. En seis meses compro la freidora grande; en un año, alquilo el local de la esquina. Si vendo a la salida del colegio, mejor. Si llueve, a la puerta de la capilla.`,
        en: `{A}'s empanadas: 40 a day at 1,500 is 60 thousand. Costs: flour 14 thousand, meat 18 thousand, oil 6 thousand, gas 5 thousand: 43 thousand. Profit: 17 thousand a day. In six months I buy the big fryer; in a year, I rent the corner premises. If I sell at school closing time, better. If it rains, at the chapel door.` },
    ],
  },
  {
    id: 'cancionero', kind: 'diary', title: 'Cancionero', en: 'Songbook', who: '{A}', cover: 'school',
    where: ['desk', 'nightstand', 'wardrobe', 'dresser', 'chest'], homes: [{ kind: ['students'] }, { kind: ['family'], teen: true }, { hobby: ['music'] }], voice: { role: 'young' }, themes: ['dream', 'love'],
    pages: [
      { when: 'Canción de la escalinata',
        es: `Subo la escalinata con tu nombre en el bolsillo, cuento los escalones como cuento tus lunares. Arriba se ve la ciudad, pero no se ve tu casa: ¿en qué ventana se esconde la luz de tu mirada? (Coro: «Ay, cerro, cerro, dame aire, que se me va el aliento por ella».)`,
        en: `I climb the big stairway with your name in my pocket, I count the steps the way I count your freckles. Up here you can see the city, but not your house: in which window does the light of your gaze hide? (Chorus: "Oh, hill, hill, give me air, my breath is leaving me for her".)` },
      { when: 'Canción del barrio',
        es: `Aquí el pan se huele desde la esquina, el tinto se toma de pie, y cuando llueve la casa canta. No tenemos mar, ni plata, ni metro, pero tenemos vecinos. Y un vecino, mi hermano, vale más que cien amigos con carro. (Lo voy a grabar el sábado, en la azotea.)`,
        en: `Here the bread can be smelled from the corner, coffee is drunk standing up, and when it rains the house sings. We have no sea, no money, no metro, but we have neighbours. And one neighbour, my brother, is worth more than a hundred friends with cars. (I'm going to record it on Saturday, on the roof.)` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ memory
  {
    id: 'reverso_fotos', kind: 'note', title: 'Lo escrito detrás de las fotos', en: 'What is written on the backs of the photos', who: 'La familia', cover: 'loose',
    where: ['wardrobe', 'dresser', 'nightstand', 'tvstand', 'wallunit'], homes: { kind: ['elder', 'family', 'couple'] }, themes: ['memory', 'love', 'joy'],
    pages: [
      { when: 'Primera foto',
        es: `Primera comunión, 2003. El traje era prestado; la sonrisa, propia. Esa tarde llovió y los invitados se quedaron a bailar en la sala. Segunda foto, detrás: «El paseo a la laguna, 2009. El bus se varó y hicimos sancocho en la orilla. Fue el mejor paseo, y no llegamos».`,
        en: `First communion, 2003. The suit was borrowed; the smile, our own. That afternoon it rained and the guests stayed on to dance in the living room. Second photo, on the back: "The trip to the lagoon, 2009. The bus broke down and we made sancocho on the roadside. It was the best trip, and we never arrived."` },
      { when: 'Tercera foto',
        es: `Mi mamá en la cocina, sin saber que le tomaba la foto, 1994. Está de espaldas, con el delantal de flores, moviendo la olla. Es la mejor foto que tengo de ella, porque no mira a la cámara: mira lo que quiere.`,
        en: `My mother in the kitchen, not knowing I was taking her picture, 1994. She has her back to me, in the flowered apron, stirring the pot. It is the best photo I have of her, because she isn't looking at the camera: she's looking at what she loves.` },
    ],
  },
  {
    id: 'registro_familia', kind: 'certificate', title: 'Registro de la familia', en: 'The family record', who: 'En la primera página de la Biblia', cover: 'leather',
    where: ['wallunit', 'wardrobe', 'dresser', 'tvstand', 'nightstand', 'filing', 'chest'], homes: { kind: ['family', 'shopkeeper'], kids: 1, religious: 0.3 }, themes: ['memory', 'faith', 'love'],
    pages: [
      { when: 'Matrimonios',
        es: `Se casaron {M} y {W} en la capilla del cerro, un sábado de agosto. Llovió a cántaros, y la abuela dijo que era señal de buena suerte. Los invitados llegaron empapados y se fueron felices.`,
        en: `{M} and {W} were married in the chapel on the hill, on a Saturday in August. It poured with rain, and Grandma said it was a sign of good luck. The guests arrived soaked and left happy.` },
      { when: 'Nacimientos',
        es: `Nació {K}, un 3 de abril, con tres kilos doscientos y el llanto más fuerte de la cuadra. Las vecinas dijeron que sería cantante; el papá, futbolista; la abuela, que llegaría a los altares. Todavía están discutiendo.`,
        en: `{K} was born on the 3rd of April, weighing three kilos two hundred and with the loudest cry on the block. The neighbours said a singer; the father, a footballer; the grandmother, a saint. They're still arguing.` },
      { when: 'Despedidas',
        es: `Partió el abuelo, un 9 de noviembre, en paz y con el radio encendido, porque ese día había partido. Su silla sigue en el patio, al lado de la planta de menta. Nadie la mueve, pero todos se sientan un rato.`,
        en: `Grandfather departed on a 9th of November, in peace and with the radio on, because there was a match that day. His chair is still in the patio, beside the mint plant. Nobody moves it, but everybody sits there a while.` },
    ],
  },
  {
    id: 'carta_a_mi_yo', kind: 'letter', title: 'Para mí, a los treinta', en: 'To me, at thirty', who: '{A}', cover: 'loose',
    where: ['desk', 'nightstand', 'wardrobe', 'dresser', 'chest'], homes: [{ kids: 1 }, { kind: ['students'] }], voice: { role: 'young' }, themes: ['memory', 'hope', 'dream'],
    pages: [
      { when: 'Escrita en la azotea',
        es: `¿Ya eres astronauta? ¿Tienes perro? ¿Todavía subes la escalinata sin parar a respirar? Yo hoy tengo trece y creo que el mundo es de colores. Escribo desde la azotea, con todo el cerro abajo. Si ya olvidaste cómo se ve desde aquí, vuelve. Vale la pena. {A}.`,
        en: `Are you an astronaut yet? Do you have a dog? Do you still climb the big stairway without stopping to breathe? Today I'm thirteen and I think the world is made of colours. I'm writing from the roof, with the whole hill below. If you've forgotten how it looks from up here, come back. It's worth it. {A}.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ certificates
  {
    id: 'certificado_bachiller', kind: 'certificate', title: 'Diploma de bachiller (nocturno)', en: 'High-school diploma (night school)', who: 'Colegio nocturno', cover: 'card',
    where: ['wardrobe', 'dresser', 'desk', 'tvstand', 'wallunit', 'nightstand', 'vitrine', 'filing', 'chest'], homes: { kind: ['family', 'couple', 'shopkeeper'] }, voice: { role: 'woman' }, themes: ['hope', 'joy', 'challenge'],
    pages: [
      { when: 'El diploma',
        es: `Se certifica que {A} ha cursado y aprobado el bachillerato en jornada nocturna, con nota final 4,3. Observaciones: «Estudiante constante, nunca llegó tarde, aunque llegó cansada. Se le recomienda no dejar de estudiar y no dejar de bailar».`,
        en: `This certifies that {A} has completed and passed high school in the evening shift, with a final mark of 4.3. Remarks: "A steady student, never late, although often tired. She is advised not to stop studying and not to stop dancing."` },
      { when: 'En el reverso, a lápiz',
        es: `Hoy, a los cuarenta y un años, me gradué. Mis hijos me aplaudieron de pie. Uno dijo: «Mamá, ahora sí puedes regañarme con conocimiento de causa». Lo celebramos con arroz con leche, que es la forma más seria de celebrar aquí.`,
        en: `Today, at forty-one, I graduated. My children gave me a standing ovation. One said: "Mum, now you can scold me with full knowledge of the facts." We celebrated with rice pudding, which is the most serious way of celebrating here.` },
    ],
  },
  {
    id: 'certificado_bautismo', kind: 'certificate', title: 'Certificado de bautismo', en: 'Baptism certificate', who: 'Parroquia de la Virgen del Carmen', cover: 'card',
    where: ['wardrobe', 'dresser', 'nightstand', 'tvstand', 'wallunit', 'desk', 'vitrine', 'filing', 'chest'], homes: { kids: 1, religious: 0.3 }, themes: ['faith', 'memory'],
    pages: [
      { when: 'Libro 3, folio 41',
        es: `Se certifica que {K}, de {M} y {W}, recibió el bautismo el 10 de agosto. Padrinos: don Heriberto y doña Cleotilde. Anotación al margen, de otra letra: «El padrino llegó tarde porque se le varó la moto; el padre esperó; la criatura lloró; todo salió bien».`,
        en: `This certifies that {K}, child of {M} and {W}, was baptised on the 10th of August. Godparents: Don Heriberto and Doña Cleotilde. Marginal note in another hand: "The godfather arrived late because his motorbike broke down; the priest waited; the baby cried; all went well."` },
    ],
  },
  {
    id: 'curso_panaderia', kind: 'certificate', title: 'Certificado del curso de panadería', en: 'Baking course certificate', who: 'Escuela de oficios', cover: 'card',
    where: ['wardrobe', 'dresser', 'desk', 'tvstand', 'wallunit', 'kitchen', 'vitrine', 'filing', 'chest'], homes: { kind: ['family', 'shopkeeper', 'couple'] }, voice: { role: 'woman' }, themes: ['hope', 'dream', 'joy'],
    pages: [
      { when: 'Certificado',
        es: `Se certifica que {A} aprobó el curso de panadería y repostería, 120 horas, con nota 4,8. Observaciones del instructor: «Alumna sobresaliente en pan de queso y en paciencia con el horno». Firmado: el maestro, que todavía sueña con el pan de {A}.`,
        en: `This certifies that {A} passed the bakery and pastry course, 120 hours, with a mark of 4.8. Instructor's remarks: "An outstanding student in cheese bread and in patience with the oven." Signed: the master, who still dreams of {A}'s bread.` },
      { when: 'A lápiz, al lado',
        es: `Primer pan de queso propio: salió duro como adoquín. El segundo: una nube. El tercero se lo comió el perro del vecino y lo declaró el mejor de su vida. Esta semana alquilo el horno de doña Berta para empezar el negocio.`,
        en: `First cheese bread of my own: hard as a cobblestone. The second: a cloud. The third was eaten by the neighbour's dog, who declared it the best of its life. This week I'm renting Doña Berta's oven to start the business.` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ clippings
  {
    id: 'recorte_loteria', kind: 'clipping', title: 'Recorte: «El gordo cayó en la ladera»', en: 'Clipping: "The jackpot fell on the hill"', who: 'Diario local, 1998', cover: 'loose',
    where: ['kitchen', 'tvstand', 'wallunit', 'dresser', 'desk', 'fridge'], themes: ['humour', 'memory', 'joy'],
    pages: [
      { when: 'Noticia',
        es: `Un vecino de la ladera ganó el premio mayor de la lotería y lo celebró invitando a todo el cerro a una olla de sancocho. «Mañana sigo siendo el mismo —declaró—, solo que con mejores zapatos». A la mañana siguiente, según los vecinos, se levantó a las cinco para ir a la panadería, como siempre. Con zapatos nuevos.`,
        en: `A resident of the hillside won the lottery's top prize and celebrated by inviting the whole hill to a pot of sancocho. "Tomorrow I'm still the same man," he declared, "only with better shoes." The next morning, the neighbours say, he got up at five to go to the bakery, as always. In new shoes.` },
    ],
  },
  {
    id: 'recorte_lluvias', kind: 'clipping', title: 'Recorte: «Noche de lluvias en la ladera»', en: 'Clipping: "A night of rain on the hillside"', who: 'Diario local', cover: 'loose',
    where: ['kitchen', 'tvstand', 'wallunit', 'dresser', 'desk', 'fridge'], themes: ['problem', 'memory', 'hope'],
    pages: [
      { when: 'Crónica',
        es: `La noche del martes cayó más agua que en todo el mes. El barrio entero estuvo en vela. Vecinos con linternas desviaron el torrente de la escalinata con tablas y costales. No hubo víctimas. La junta pide muros de contención y paciencia; de lo segundo, dicen, ya tienen de sobra.`,
        en: `On Tuesday night more rain fell than in the whole month. The entire neighbourhood stayed awake. Neighbours with torches diverted the torrent down the big stairway with boards and sacks. There were no casualties. The board asks for retaining walls and patience; of the second, they say, they already have plenty.` },
    ],
  },
  {
    id: 'recorte_equipo', kind: 'clipping', title: 'Recorte: «Campeones del torneo de barrios»', en: 'Clipping: "Champions of the neighbourhood tournament"', who: 'Diario local', cover: 'loose',
    where: ['wardrobe', 'dresser', 'desk', 'nightstand', 'tvstand', 'wallunit', 'vitrine', 'chest'], homes: [{ hobby: ['football'] }, { teen: true }], themes: ['joy', 'memory', 'humour'],
    pages: [
      { when: 'Pie de foto',
        es: `El equipo de la ladera con el trofeo, tras vencer 3 a 2 en la final. Al fondo, doña Berta con una olla de sancocho: la hinchada oficial. El capitán declaró: «Ganamos por la comida». El entrenador: «Ganamos por el entrenamiento». Doña Berta: «Ganaron por la comida».`,
        en: `The hillside team with the trophy, after winning 3-2 in the final. In the background, Doña Berta with a pot of sancocho: the official supporters' club. The captain declared: "We won thanks to the food." The coach: "We won thanks to the training." Doña Berta: "They won thanks to the food."` },
    ],
  },
  // ------------------------------------------------------------------------------------------------ the medicine cabinet
  {
    id: 'formula_medica', kind: 'receipt', title: 'Fórmula médica, con una nota', en: 'A prescription, with a note', who: 'El puesto de salud', cover: 'loose',
    where: ['medcab', 'kitchen', 'nightstand', 'dresser', 'filing'], themes: ['humour', 'memory', 'love'],
    pages: [
      { when: 'La fórmula',
        es: `Acetaminofén cada ocho horas, abundante líquido y reposo. (Nota de la doctora: «Reposo quiere decir descansar, no seguir trabajando con cara de enfermo».) Debajo, en lápiz, otra letra: «Tomar con agüita de panela, no con tinto». Firmado: la vecina que sabe de todo.`,
        en: `Paracetamol every eight hours, plenty of fluids and rest. (The doctor's note: "Rest means resting, not carrying on working with a sick face.") Underneath, in pencil, another hand: "Take with panela water, not with coffee." Signed: the neighbour who knows everything.` },
    ],
  },
  {
    id: 'carnet_vacunas', kind: 'card', title: 'Carné de vacunación de {K}', en: "{K}'s vaccination card", who: 'El puesto de salud', cover: 'card',
    where: ['medcab', 'dresser', 'desk', 'wardrobe', 'kitchen', 'filing', 'chest'], homes: { kids: 1 }, themes: ['joy', 'hope'],
    pages: [
      { when: 'Esquema al día',
        es: `Carné de {K}: BCG ✓, hepatitis B ✓, polio ✓, triple viral ✓. Observaciones de la enfermera: «Lloró un poco, abrazó fuerte, pidió otra paleta». Próxima cita: pasado mañana a las 8, con paleta incluida. En el margen, con lápiz de color: una carita feliz dibujada por {K}.`,
        en: `{K}'s card: BCG ✓, hepatitis B ✓, polio ✓, MMR ✓. Nurse's remarks: "Cried a little, hugged tightly, asked for another lollipop." Next appointment: the day after tomorrow at 8, lollipop included. In the margin, in coloured pencil: a happy face drawn by {K}.` },
    ],
  },
];
