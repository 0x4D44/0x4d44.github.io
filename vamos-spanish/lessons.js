// lessons.js — content + exercise generation for ¡Vamos! (Spanish learning app)
// Business logic only: no UI, no styling.
import { EXTRA_CHARACTERS, EXTRA_UNITS_A } from './lessons-extra-a.js';
import { EXTRA_UNITS_B } from './lessons-extra-b.js';

export const CHARACTERS = {
  lucia:     { name: 'Lucía',     city: 'Madrid',       country: 'España',    lang: 'es-ES', skin: '#f3c08c', hair: '#5a3825', hairH: 22, lip: '#c2452d', chip: '#c75b39' },
  mateo:     { name: 'Mateo',     city: 'Bogotá',       country: 'Colombia',  lang: 'es-CO', skin: '#e8a87c', hair: '#2b1c12', hairH: 20, lip: '#a4442a', chip: '#20635b' },
  camila:    { name: 'Camila',    city: 'Lima',         country: 'Perú',      lang: 'es-PE', skin: '#d99e6a', hair: '#1d1208', hairH: 24, lip: '#a4442a', chip: '#b0812c' },
  valentina: { name: 'Valentina', city: 'Buenos Aires', country: 'Argentina', lang: 'es-AR', skin: '#f0b98d', hair: '#7a4a21', hairH: 24, lip: '#c2452d', chip: '#3f6f9e' },
  diego:     { name: 'Diego',     city: 'Santiago',     country: 'Chile',     lang: 'es-CL', skin: '#e0a071', hair: '#141414', hairH: 18, lip: '#a4442a', chip: '#7d5296' },
  carmen:    { name: 'Carmen',    city: 'Sevilla',      country: 'España',    lang: 'es-ES', skin: '#eeb583', hair: '#3a2417', hairH: 26, lip: '#c2452d', chip: '#bb4444' },
};

// ------------------------------------------------------------------ units ---
export const UNITS = [
  {
    id: 'u1', city: 'Madrid', country: 'España', char: 'lucia', color: '#c75b39',
    title: 'Saludos y presentaciones',
    lessons: [
      {
        id: 'u1l1', t: 'Hola y adiós',
        intro: '¡Hola! Soy Lucía, de Madrid. Empezamos con lo más importante: saludar. ¡Vamos!',
        tip: ['Buenos vs. buenas', '“Día” is masculine → buenos días. “Tarde” and “noche” are feminine → buenas tardes, buenas noches.'],
        v: [['hola', 'hello'], ['adiós', 'goodbye'], ['buenos días', 'good morning'], ['buenas noches', 'good night'], ['hasta luego', 'see you later'], ['buenas tardes', 'good afternoon']],
        s: [['Hola, buenos días', 'Hello, good morning'], ['Adiós, hasta luego', 'Goodbye, see you later']],
        f: [
          { q: '___ días, señora.', o: ['Buenos', 'Buenas', 'Bueno'], a: 'Buenos', h: 'Good morning, madam.' },
          { q: 'Buenas ___, ¿cómo está?', o: ['tardes', 'días', 'luego'], a: 'tardes', h: 'Good afternoon, how are you?' },
        ],
      },
      {
        id: 'u1l2', t: '¿Cómo estás?',
        intro: 'En España preguntamos “¿qué tal?” todo el tiempo. Hoy aprendes a responder.',
        tip: ['Tú vs. usted', 'Use “¿cómo estás?” with friends (tú) and “¿cómo está?” to be polite or formal (usted).'],
        v: [['¿cómo estás?', 'how are you?'], ['bien', 'well'], ['mal', 'bad'], ['muy', 'very'], ['gracias', 'thank you'], ['¿y tú?', 'and you?']],
        s: [['Estoy muy bien, gracias', 'I am very well, thank you'], ['¿Cómo estás tú?', 'How are you?']],
        f: [
          { q: 'Estoy muy ___, gracias.', o: ['bien', 'buena', 'bueno'], a: 'bien', h: 'I am very well, thank you.' },
          { q: '¿Cómo ___ usted?', o: ['está', 'estás', 'estoy'], a: 'está', h: 'How are you? (formal)' },
        ],
      },
      {
        id: 'u1l3', t: 'Presentaciones',
        intro: 'Mucho gusto. Ahora te presento a mis amigos — y tú te presentas en español.',
        tip: ['Me llamo…', 'Literally “I call myself”. You can also say “soy Ana” (I am Ana) — both are natural.'],
        v: [['me llamo', 'my name is'], ['¿cómo te llamas?', 'what is your name?'], ['mucho gusto', 'nice to meet you'], ['soy', 'I am'], ['encantada', 'delighted'], ['el nombre', 'the name']],
        s: [['Hola, me llamo Lucía', 'Hello, my name is Lucía'], ['Mucho gusto, soy Pablo', 'Nice to meet you, I am Pablo']],
        f: [
          { q: '¿Cómo te ___?', o: ['llamas', 'llamo', 'llama'], a: 'llamas', h: 'What is your name?' },
          { q: 'Me ___ Carmen.', o: ['llamo', 'llamas', 'soy'], a: 'llamo', h: 'My name is Carmen.' },
        ],
      },
      {
        id: 'u1l4', t: 'Cortesía',
        intro: 'Con “por favor” y “gracias” se abren todas las puertas. Palabras mágicas.',
        tip: ['Perdón vs. disculpe', '“Perdón” apologizes; “disculpe” politely gets attention — like “excuse me”.'],
        v: [['por favor', 'please'], ['de nada', 'you are welcome'], ['perdón', 'sorry'], ['disculpe', 'excuse me'], ['sí', 'yes'], ['no', 'no']],
        s: [['Un café, por favor', 'A coffee, please'], ['Gracias — de nada', 'Thank you — you are welcome']],
        f: [
          { q: 'Gracias. — ___ nada.', o: ['De', 'Por', 'No'], a: 'De', h: 'Thank you. — You are welcome.' },
          { q: '___, ¿dónde está el museo?', o: ['Disculpe', 'De nada', 'Adiós'], a: 'Disculpe', h: 'Excuse me, where is the museum?' },
        ],
      },
      {
        id: 'u1l5', t: 'Números 1–10',
        intro: 'Uno, dos, tres… Los números están en todas partes: precios, horas, teléfonos.',
        tip: ['Uno → un', 'Before a masculine noun, “uno” shortens to “un”: un café, un momento.'],
        v: [['uno', 'one'], ['dos', 'two'], ['tres', 'three'], ['cuatro', 'four'], ['cinco', 'five'], ['diez', 'ten']],
        s: [['Dos cafés, por favor', 'Two coffees, please'], ['Tengo tres hermanos', 'I have three siblings']],
        f: [
          { q: 'Cinco más cinco son ___.', o: ['diez', 'dos', 'cuatro'], a: 'diez', h: 'Five plus five is ten.' },
          { q: '___ café, por favor.', o: ['Un', 'Uno', 'Una'], a: 'Un', h: 'One coffee, please.' },
        ],
      },
    ],
  },
  {
    id: 'u2', city: 'Bogotá', country: 'Colombia', char: 'mateo', color: '#20635b',
    title: 'La comida',
    lessons: [
      {
        id: 'u2l1', t: 'El desayuno',
        intro: '¡Hola, parcero! Soy Mateo, de Bogotá. Aquí el desayuno es sagrado. ¿Arepa y café?',
        tip: ['El y la', 'Every noun has a gender: el café (m), la leche (f). Learn each word with its article.'],
        v: [['el café', 'the coffee'], ['el pan', 'the bread'], ['la leche', 'the milk'], ['el huevo', 'the egg'], ['el jugo', 'the juice'], ['la arepa', 'the arepa']],
        s: [['Quiero café con leche', 'I want coffee with milk'], ['El pan está delicioso', 'The bread is delicious']],
        f: [
          { q: '___ leche está fría.', o: ['La', 'El', 'Los'], a: 'La', h: 'The milk is cold.' },
          { q: 'Quiero ___ jugo de naranja.', o: ['un', 'una', 'la'], a: 'un', h: 'I want an orange juice.' },
        ],
      },
      {
        id: 'u2l2', t: 'Frutas y verduras',
        intro: 'En el mercado de Paloquemao hay frutas que no existen en ningún otro lugar.',
        tip: ['Plurals', 'Add -s after a vowel (manzana → manzanas) and -es after a consonant (limón → limones).'],
        v: [['la manzana', 'the apple'], ['el plátano', 'the banana'], ['la naranja', 'the orange'], ['el tomate', 'the tomato'], ['la papa', 'the potato'], ['el aguacate', 'the avocado']],
        s: [['Me gusta el aguacate', 'I like avocado'], ['Las manzanas son rojas', 'The apples are red']],
        f: [
          { q: 'Las naranjas ___ dulces.', o: ['son', 'es', 'está'], a: 'son', h: 'The oranges are sweet.' },
          { q: 'Quiero dos ___.', o: ['plátanos', 'plátano', 'plátanoes'], a: 'plátanos', h: 'I want two bananas.' },
        ],
      },
      {
        id: 'u2l3', t: 'En el restaurante',
        intro: 'Hoy almorzamos fuera. Te enseño a pedir como un colombiano de verdad.',
        tip: ['Quiero vs. quisiera', '“Quiero” = I want. “Quisiera” is softer — “I would like”. Great for restaurants.'],
        v: [['el menú', 'the menu'], ['la mesa', 'the table'], ['el mesero', 'the waiter'], ['la cuenta', 'the bill'], ['quiero', 'I want'], ['pedir', 'to order']],
        s: [['La cuenta, por favor', 'The bill, please'], ['Quiero pedir el menú del día', 'I want to order the menu of the day']],
        f: [
          { q: 'El ___ trae el menú.', o: ['mesero', 'mesa', 'cuenta'], a: 'mesero', h: 'The waiter brings the menu.' },
          { q: '___ una mesa para dos.', o: ['Quiero', 'Pido', 'Como'], a: 'Quiero', h: 'I want a table for two.' },
        ],
      },
      {
        id: 'u2l4', t: 'Bebidas',
        intro: '¿Tinto? En Colombia, un “tinto” es un café negro, ¡no vino! Cuidado con eso.',
        tip: ['El agua', '“Agua” is feminine but takes “el” for sound: el agua fría. Plural: las aguas.'],
        v: [['el agua', 'the water'], ['el vino', 'the wine'], ['la cerveza', 'the beer'], ['el té', 'the tea'], ['el vaso', 'the glass'], ['la taza', 'the cup']],
        s: [['Un vaso de agua, por favor', 'A glass of water, please'], ['El té está muy caliente', 'The tea is very hot']],
        f: [
          { q: 'Una ___ de café, por favor.', o: ['taza', 'vaso', 'plato'], a: 'taza', h: 'A cup of coffee, please.' },
          { q: '___ agua está fría.', o: ['El', 'La', 'Un'], a: 'El', h: 'The water is cold.' },
        ],
      },
      {
        id: 'u2l5', t: 'Me gusta',
        intro: 'La frase más útil del español: “me gusta”. Dime qué te gusta comer.',
        tip: ['Me gusta(n)', 'Use “me gusta” + singular or verb, “me gustan” + plural: me gusta el café, me gustan las arepas.'],
        v: [['me gusta', 'I like'], ['no me gusta', 'I do not like'], ['delicioso', 'delicious'], ['la comida', 'the food'], ['comer', 'to eat'], ['beber', 'to drink']],
        s: [['Me gusta la comida colombiana', 'I like Colombian food'], ['No me gusta beber café', 'I do not like to drink coffee']],
        f: [
          { q: 'Me ___ las arepas.', o: ['gustan', 'gusta', 'gusto'], a: 'gustan', h: 'I like arepas.' },
          { q: 'La sopa está ___.', o: ['deliciosa', 'delicioso', 'deliciosos'], a: 'deliciosa', h: 'The soup is delicious.' },
        ],
      },
    ],
  },
  {
    id: 'u3', city: 'Lima', country: 'Perú', char: 'camila', color: '#b0812c',
    title: 'La familia y la gente',
    lessons: [
      {
        id: 'u3l1', t: 'Mi familia',
        intro: '¡Bienvenido a Lima! Soy Camila. Los domingos, toda mi familia almuerza junta.',
        tip: ['Los padres', '“Los padres” means the parents (not just fathers); “los hermanos” can mean siblings.'],
        v: [['la madre', 'the mother'], ['el padre', 'the father'], ['el hermano', 'the brother'], ['la hermana', 'the sister'], ['el hijo', 'the son'], ['la abuela', 'the grandmother']],
        s: [['Mi madre se llama Rosa', 'My mother is called Rosa'], ['Tengo dos hermanas', 'I have two sisters']],
        f: [
          { q: 'Mi ___ es la madre de mi madre.', o: ['abuela', 'hermana', 'hija'], a: 'abuela', h: 'My grandmother is my mother’s mother.' },
          { q: '___ padres viven en Lima.', o: ['Mis', 'Mi', 'Me'], a: 'Mis', h: 'My parents live in Lima.' },
        ],
      },
      {
        id: 'u3l2', t: 'Descripciones',
        intro: '¿Cómo es tu familia? Alta, baja, divertida… Hoy aprendes a describir personas.',
        tip: ['Agreement', 'Adjectives match gender and number: el niño alto, la niña alta, los niños altos.'],
        v: [['alto', 'tall'], ['bajo', 'short'], ['joven', 'young'], ['viejo', 'old'], ['simpático', 'friendly'], ['inteligente', 'intelligent']],
        s: [['Mi hermano es muy alto', 'My brother is very tall'], ['La abuela es simpática', 'The grandmother is friendly']],
        f: [
          { q: 'Mi hermana es ___.', o: ['alta', 'alto', 'altos'], a: 'alta', h: 'My sister is tall.' },
          { q: 'Los abuelos son ___.', o: ['viejos', 'viejo', 'vieja'], a: 'viejos', h: 'The grandparents are old.' },
        ],
      },
      {
        id: 'u3l3', t: 'Profesiones',
        intro: 'Mi padre es cocinero — la comida peruana es famosa en todo el mundo, ¿sabías?',
        tip: ['No article', 'For professions, drop the article: “soy médico”, not “soy un médico”.'],
        v: [['el médico', 'the doctor'], ['la profesora', 'the teacher'], ['el cocinero', 'the cook'], ['la ingeniera', 'the engineer'], ['el estudiante', 'the student'], ['trabajar', 'to work']],
        s: [['Mi padre es cocinero', 'My father is a cook'], ['Ella trabaja en un hospital', 'She works in a hospital']],
        f: [
          { q: 'Soy ___ de español.', o: ['profesora', 'una profesora', 'la profesora'], a: 'profesora', h: 'I am a Spanish teacher.' },
          { q: 'El médico ___ en el hospital.', o: ['trabaja', 'trabajo', 'trabajas'], a: 'trabaja', h: 'The doctor works at the hospital.' },
        ],
      },
      {
        id: 'u3l4', t: 'Los amigos',
        intro: 'En Perú decimos “pata” para amigo. Con los amigos, el español se aprende rápido.',
        tip: ['Conocer', 'Use “conocer” for knowing people or places: conozco a María, conozco Lima.'],
        v: [['el amigo', 'the friend'], ['la gente', 'the people'], ['juntos', 'together'], ['hablar', 'to talk'], ['conocer', 'to know (someone)'], ['el vecino', 'the neighbor']],
        s: [['Mis amigos hablan español', 'My friends speak Spanish'], ['La gente de Lima es simpática', 'The people of Lima are friendly']],
        f: [
          { q: 'Quiero ___ a tu familia.', o: ['conocer', 'saber', 'hablar'], a: 'conocer', h: 'I want to meet your family.' },
          { q: 'La gente ___ muy simpática.', o: ['es', 'son', 'están'], a: 'es', h: '“Gente” is singular in Spanish.' },
        ],
      },
      {
        id: 'u3l5', t: 'Ser y estar',
        intro: 'Dos verbos para “to be” — el gran misterio del español. Yo te lo explico fácil.',
        tip: ['Ser vs. estar', 'SER = what something is (identity, origin). ESTAR = how it is (state, location). Soy peruana; estoy cansada.'],
        v: [['ser', 'to be (identity)'], ['estar', 'to be (state)'], ['es', 'he/she is'], ['está', 'he/she is (state)'], ['somos', 'we are'], ['cansado', 'tired']],
        s: [['Mi madre es de Lima', 'My mother is from Lima'], ['Estoy cansada hoy', 'I am tired today']],
        f: [
          { q: 'Lima ___ en Perú.', o: ['está', 'es', 'son'], a: 'está', h: 'Location → estar.' },
          { q: 'Nosotros ___ estudiantes.', o: ['somos', 'estamos', 'es'], a: 'somos', h: 'Identity → ser.' },
        ],
      },
    ],
  },
  {
    id: 'u4', city: 'Buenos Aires', country: 'Argentina', char: 'valentina', color: '#3f6f9e',
    title: 'La ciudad y los viajes',
    lessons: [
      {
        id: 'u4l1', t: 'Lugares',
        intro: '¡Che, bienvenido a Buenos Aires! Soy Valentina. Esta ciudad nunca duerme.',
        tip: ['¿Dónde está?', 'Ask for places with estar: ¿dónde está el museo? — location is always “estar”.'],
        v: [['la calle', 'the street'], ['la plaza', 'the square'], ['el museo', 'the museum'], ['el parque', 'the park'], ['la tienda', 'the store'], ['el banco', 'the bank']],
        s: [['El museo está en la plaza', 'The museum is on the square'], ['¿Dónde está el parque?', 'Where is the park?']],
        f: [
          { q: '¿Dónde ___ el banco?', o: ['está', 'es', 'estás'], a: 'está', h: 'Where is the bank?' },
          { q: 'La tienda está en la ___ Florida.', o: ['calle', 'parque', 'museo'], a: 'calle', h: 'The store is on Florida Street.' },
        ],
      },
      {
        id: 'u4l2', t: 'Direcciones',
        intro: 'Buenos Aires es una cuadrícula gigante. Con cuatro frases nunca te perdés.',
        tip: ['Derecha vs. derecho', '“A la derecha” = to the right. “Derecho” (or “recto”) = straight ahead. ¡No los confundas!'],
        v: [['a la derecha', 'to the right'], ['a la izquierda', 'to the left'], ['derecho', 'straight ahead'], ['cerca', 'near'], ['lejos', 'far'], ['la esquina', 'the corner']],
        s: [['El banco está a la derecha', 'The bank is to the right'], ['La plaza está muy cerca', 'The square is very near']],
        f: [
          { q: 'Siga ___ dos cuadras.', o: ['derecho', 'derecha', 'cerca'], a: 'derecho', h: 'Go straight ahead two blocks.' },
          { q: 'El café está en la ___.', o: ['esquina', 'izquierda', 'lejos'], a: 'esquina', h: 'The café is on the corner.' },
        ],
      },
      {
        id: 'u4l3', t: 'El transporte',
        intro: 'Acá al bus le decimos “colectivo” y al metro, “subte”. Cada país tiene sus palabras.',
        tip: ['Local words', 'Bus = colectivo (Argentina), guagua (Caribbean), camión (Mexico). Spanish adapts to each country!'],
        v: [['el colectivo', 'the bus'], ['el tren', 'the train'], ['el subte', 'the subway'], ['el taxi', 'the taxi'], ['caminar', 'to walk'], ['el boleto', 'the ticket']],
        s: [['Tomo el subte al centro', 'I take the subway downtown'], ['Prefiero caminar al parque', 'I prefer to walk to the park']],
        f: [
          { q: 'Necesito un ___ de tren.', o: ['boleto', 'colectivo', 'taxi'], a: 'boleto', h: 'I need a train ticket.' },
          { q: 'Me gusta ___ por la ciudad.', o: ['caminar', 'camino', 'camina'], a: 'caminar', h: 'After “me gusta”, use the infinitive.' },
        ],
      },
      {
        id: 'u4l4', t: 'De compras',
        intro: 'Domingo de feria en San Telmo. Hoy aprendés a regatear como una porteña.',
        tip: ['¿Cuánto cuesta?', 'Singular: ¿cuánto cuesta? Plural: ¿cuánto cuestan? — the verb matches what you’re buying.'],
        v: [['comprar', 'to buy'], ['el precio', 'the price'], ['barato', 'cheap'], ['caro', 'expensive'], ['el dinero', 'the money'], ['¿cuánto cuesta?', 'how much is it?']],
        s: [['¿Cuánto cuesta el libro?', 'How much is the book?'], ['Es muy caro para mí', 'It is very expensive for me']],
        f: [
          { q: '¿Cuánto ___ las manzanas?', o: ['cuestan', 'cuesta', 'cuestas'], a: 'cuestan', h: 'How much are the apples?' },
          { q: 'Este mercado es muy ___.', o: ['barato', 'barata', 'baratos'], a: 'barato', h: 'This market is very cheap.' },
        ],
      },
      {
        id: 'u4l5', t: 'El verbo ir',
        intro: '“Ir” — el verbo del viajero. Voy, vas, va… ¡vamos a todas partes!',
        tip: ['A + el = al', 'When “a” meets “el”, they contract: voy al parque (never “a el parque”).'],
        v: [['ir', 'to go'], ['voy', 'I go'], ['vas', 'you go'], ['va', 'he/she goes'], ['vamos', 'we go'], ['al', 'to the']],
        s: [['Voy al museo con Valentina', 'I go to the museum with Valentina'], ['¿Vas al parque hoy?', 'Are you going to the park today?']],
        f: [
          { q: 'Nosotros ___ a la plaza.', o: ['vamos', 'voy', 'van'], a: 'vamos', h: 'We go to the square.' },
          { q: 'Ella va ___ banco.', o: ['al', 'a el', 'a la'], a: 'al', h: 'a + el = al.' },
        ],
      },
    ],
  },
  {
    id: 'u5', city: 'Santiago', country: 'Chile', char: 'diego', color: '#7d5296',
    title: 'El tiempo libre',
    lessons: [
      {
        id: 'u5l1', t: 'Los deportes',
        intro: '¡Hola! Soy Diego, de Santiago. Aquí, entre la cordillera y el mar, hacemos de todo.',
        tip: ['Jugar a', 'In Spain you “juegas al fútbol”; in much of Latin America, “juegas fútbol”. Both are correct!'],
        v: [['el fútbol', 'the football'], ['nadar', 'to swim'], ['correr', 'to run'], ['jugar', 'to play'], ['el equipo', 'the team'], ['ganar', 'to win']],
        s: [['Me gusta jugar fútbol', 'I like to play football'], ['Mi equipo va a ganar', 'My team is going to win']],
        f: [
          { q: 'Ellos ___ en el parque.', o: ['corren', 'corre', 'corro'], a: 'corren', h: 'They run in the park.' },
          { q: 'Me gusta ___ en el mar.', o: ['nadar', 'nado', 'nadas'], a: 'nadar', h: 'After “me gusta”, use the infinitive.' },
        ],
      },
      {
        id: 'u5l2', t: 'El clima',
        intro: 'En Santiago ves la nieve de los Andes desde la playa. ¡Hablemos del clima!',
        tip: ['Hace + weather', 'Weather uses “hacer”: hace sol, hace frío, hace calor. But: llueve (it rains), nieva (it snows).'],
        v: [['hace sol', 'it is sunny'], ['hace frío', 'it is cold'], ['hace calor', 'it is hot'], ['llueve', 'it rains'], ['la nieve', 'the snow'], ['el viento', 'the wind']],
        s: [['Hoy hace mucho calor', 'Today it is very hot'], ['En invierno hace frío', 'In winter it is cold']],
        f: [
          { q: 'En verano ___ calor.', o: ['hace', 'es', 'está'], a: 'hace', h: 'In summer it is hot.' },
          { q: 'Hoy ___ mucho.', o: ['llueve', 'lluvia', 'llover'], a: 'llueve', h: 'Today it rains a lot.' },
        ],
      },
      {
        id: 'u5l3', t: 'Los días',
        intro: '¿Qué día es hoy? Los días de la semana — sin mayúsculas en español, ojo.',
        tip: ['Lowercase days', 'Days and months are lowercase in Spanish: lunes, enero. “El lunes” = on Monday.'],
        v: [['el lunes', 'Monday'], ['el martes', 'Tuesday'], ['el miércoles', 'Wednesday'], ['el viernes', 'Friday'], ['el fin de semana', 'the weekend'], ['la semana', 'the week']],
        s: [['El viernes juego fútbol', 'On Friday I play football'], ['Me gusta el fin de semana', 'I like the weekend']],
        f: [
          { q: 'Hoy es ___, mañana es martes.', o: ['lunes', 'viernes', 'miércoles'], a: 'lunes', h: 'Today is Monday, tomorrow is Tuesday.' },
          { q: '___ lunes tengo clase.', o: ['El', 'En', 'La'], a: 'El', h: '“On Monday” = el lunes.' },
        ],
      },
      {
        id: 'u5l4', t: 'La rutina',
        intro: 'Mi día: desayuno, estudio, corro y duermo. ¿Cómo es tu rutina?',
        tip: ['Temprano y tarde', '“Tarde” is both “late” and “afternoon”: llego tarde (I arrive late), por la tarde (in the afternoon).'],
        v: [['desayunar', 'to have breakfast'], ['estudiar', 'to study'], ['dormir', 'to sleep'], ['temprano', 'early'], ['tarde', 'late'], ['todos los días', 'every day']],
        s: [['Estudio español todos los días', 'I study Spanish every day'], ['Duermo ocho horas', 'I sleep eight hours']],
        f: [
          { q: 'Me despierto muy ___.', o: ['temprano', 'temprana', 'mañana'], a: 'temprano', h: 'I wake up very early.' },
          { q: '___ español todos los días.', o: ['Estudio', 'Estudias', 'Estudiar'], a: 'Estudio', h: 'I study Spanish every day.' },
        ],
      },
      {
        id: 'u5l5', t: 'Verbos en -ar',
        intro: 'Un patrón, cientos de verbos: hablar, cantar, bailar… Domina el -ar y dominas mucho.',
        tip: ['-AR endings', 'hablar → hablo, hablas, habla, hablamos, hablan. Learn one pattern, unlock hundreds of verbs.'],
        v: [['hablo', 'I speak'], ['hablas', 'you speak'], ['habla', 'he/she speaks'], ['hablamos', 'we speak'], ['cantar', 'to sing'], ['bailar', 'to dance']],
        s: [['Hablamos español muy bien', 'We speak Spanish very well'], ['Ella canta y baila', 'She sings and dances']],
        f: [
          { q: 'Tú ___ muy rápido.', o: ['hablas', 'habla', 'hablo'], a: 'hablas', h: 'You speak very fast.' },
          { q: 'Nosotros ___ salsa.', o: ['bailamos', 'bailan', 'bailar'], a: 'bailamos', h: 'We dance salsa.' },
        ],
      },
    ],
  },
  {
    id: 'u6', city: 'Sevilla', country: 'España', char: 'carmen', color: '#bb4444',
    title: 'Pasado y futuro',
    lessons: [
      {
        id: 'u6l1', t: 'El pretérito',
        intro: '¡Olé! Soy Carmen, de Sevilla. Última etapa: hablar del pasado. Ayer, anoche…',
        tip: ['Preterite', 'Completed past actions: hablé (I spoke), comí (I ate), viví (I lived). -é/-í mark “I” in the past.'],
        v: [['hablé', 'I spoke'], ['comí', 'I ate'], ['viví', 'I lived'], ['fui', 'I went'], ['ayer', 'yesterday'], ['anoche', 'last night']],
        s: [['Ayer comí paella', 'Yesterday I ate paella'], ['Anoche hablé con Carmen', 'Last night I spoke with Carmen']],
        f: [
          { q: 'Ayer ___ al museo.', o: ['fui', 'voy', 'va'], a: 'fui', h: 'Yesterday I went to the museum.' },
          { q: 'Anoche ___ tortilla.', o: ['comí', 'como', 'comer'], a: 'comí', h: 'Last night I ate tortilla.' },
        ],
      },
      {
        id: 'u6l2', t: 'Ayer y hoy',
        intro: 'El tiempo vuela. Hoy, mañana, la semana pasada… palabras para ordenar tu historia.',
        tip: ['Time markers', '“Pasado/a” after a noun = last: la semana pasada, el año pasado. “Próximo/a” = next.'],
        v: [['hoy', 'today'], ['mañana', 'tomorrow'], ['la semana pasada', 'last week'], ['el año pasado', 'last year'], ['ahora', 'now'], ['siempre', 'always']],
        s: [['La semana pasada fui a Madrid', 'Last week I went to Madrid'], ['Hoy estudio, mañana bailo', 'Today I study, tomorrow I dance']],
        f: [
          { q: 'El año ___ viví en Lima.', o: ['pasado', 'pasada', 'próximo'], a: 'pasado', h: 'Last year I lived in Lima.' },
          { q: '___ estudio español.', o: ['Siempre', 'Ayer', 'Anoche'], a: 'Siempre', h: 'I always study Spanish.' },
        ],
      },
      {
        id: 'u6l3', t: 'Planes futuros',
        intro: '¿Y después de este curso? ¡A viajar! Hablemos de planes y vacaciones.',
        tip: ['Easy future', 'No new tense needed: “voy a” + infinitive = going to. Voy a viajar = I am going to travel.'],
        v: [['viajar', 'to travel'], ['el plan', 'the plan'], ['la playa', 'the beach'], ['el verano', 'the summer'], ['próximo', 'next'], ['las vacaciones', 'the vacation']],
        s: [['Voy a viajar a Sevilla', 'I am going to travel to Seville'], ['El próximo verano vamos a la playa', 'Next summer we go to the beach']],
        f: [
          { q: 'En las vacaciones voy a la ___.', o: ['playa', 'plan', 'verano'], a: 'playa', h: 'On vacation I go to the beach.' },
          { q: 'El ___ año viajo a Chile.', o: ['próximo', 'pasado', 'ayer'], a: 'próximo', h: 'Next year I travel to Chile.' },
        ],
      },
      {
        id: 'u6l4', t: 'Ir a + infinitivo',
        intro: 'Voy a comer, vas a bailar, vamos a aprender. El futuro es fácil en español.',
        tip: ['Ir a + verb', 'Conjugate only “ir”: voy a comer, vas a comer, va a comer… The second verb never changes.'],
        v: [['voy a', 'I am going to'], ['vas a', 'you are going to'], ['va a', 'he/she is going to'], ['vamos a', 'we are going to'], ['van a', 'they are going to'], ['pronto', 'soon']],
        s: [['Voy a estudiar esta noche', 'I am going to study tonight'], ['Vamos a hablar español pronto', 'We are going to speak Spanish soon']],
        f: [
          { q: 'Ellos ___ a viajar mañana.', o: ['van', 'va', 'voy'], a: 'van', h: 'They are going to travel tomorrow.' },
          { q: 'Voy a ___ paella.', o: ['comer', 'como', 'comí'], a: 'comer', h: 'After “voy a”, use the infinitive.' },
        ],
      },
      {
        id: 'u6l5', t: 'Repaso final',
        intro: 'Has viajado por seis ciudades y dos continentes. Última lección: ¡demuestra todo!',
        tip: ['¡Felicidades!', 'You now handle greetings, food, family, directions, routines, past and future. Keep practicing daily!'],
        v: [['el mundo', 'the world'], ['aprender', 'to learn'], ['el idioma', 'the language'], ['practicar', 'to practice'], ['entender', 'to understand'], ['¡felicidades!', 'congratulations!']],
        s: [['Voy a practicar todos los días', 'I am going to practice every day'], ['Ahora entiendo español', 'Now I understand Spanish']],
        f: [
          { q: 'El español es un ___ hermoso.', o: ['idioma', 'mundo', 'plan'], a: 'idioma', h: 'Spanish is a beautiful language.' },
          { q: 'Ayer no entendía; hoy ___ todo.', o: ['entiendo', 'entender', 'entendí'], a: 'entiendo', h: 'Yesterday I didn’t understand; today I understand everything.' },
        ],
      },
    ],
  },
];

// merge expansion content (units 7–26, new characters)
Object.assign(CHARACTERS, EXTRA_CHARACTERS);
UNITS.push(...EXTRA_UNITS_A, ...EXTRA_UNITS_B);

// ----------------------------------------------------------------- badges ---
export const BADGES = [
  { id: 'first',    name: 'Primer paso',   desc: 'Complete your first lesson' },
  { id: 'perfect',  name: '¡Perfecto!',    desc: 'Finish a lesson with zero mistakes' },
  { id: 'combo5',   name: 'En racha',      desc: 'Get a 5-answer combo' },
  { id: 'xp100',    name: 'Cien puntos',   desc: 'Earn 100 XP' },
  { id: 'xp500',    name: 'Quinientos',    desc: 'Earn 500 XP' },
  { id: 'xp1500',   name: 'Mil quinientos', desc: 'Earn 1500 XP' },
  { id: 'streak3',  name: 'Tres días',     desc: 'Keep a 3-day streak' },
  { id: 'streak7',  name: 'Una semana',    desc: 'Keep a 7-day streak' },
  { id: 'unit1',    name: 'Madrileño',     desc: 'Finish the Madrid unit' },
  { id: 'unit3',    name: 'Medio mundo',   desc: 'Finish three units' },
  { id: 'units all', name: 'Políglota',    desc: 'Finish every unit' },
  { id: 'unit10',   name: 'Trotamundos',   desc: 'Finish ten units' },
  { id: 'xp5000',   name: 'Leyenda',       desc: 'Earn 5000 XP' },
  { id: 'practice', name: 'Estudioso',     desc: 'Complete a practice session' },
];

// ---------------------------------------------------------------- helpers ---
export const LESSON_LIST = UNITS.flatMap((u) => u.lessons.map((l) => ({ ...l, unitId: u.id })));

export function getUnit(unitId) { return UNITS.find((u) => u.id === unitId); }
export function getLesson(lessonId) {
  for (const u of UNITS) { const l = u.lessons.find((x) => x.id === lessonId); if (l) return { unit: u, lesson: l }; }
  return null;
}

export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿¡?!.,;:'"‘’“”\-–—]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pickDistractors(pool, exclude, n) {
  return shuffle(pool.filter((x) => x !== exclude && normalize(x) !== normalize(exclude))).slice(0, n);
}

// Build ~8 exercises for a lesson. Types: choice, choiceRev, listen, tiles, fill, match, type.
export function buildExercises(lessonId) {
  const found = getLesson(lessonId);
  if (!found) return [];
  const { unit, lesson } = found;
  const unitEs = unit.lessons.flatMap((l) => l.v.map((p) => p[0]));
  const unitEn = unit.lessons.flatMap((l) => l.v.map((p) => p[1]));
  const v = lesson.v;
  const ex = [];

  // 1. choice: es -> en
  ex.push({ type: 'choice', prompt: v[0][0], speak: v[0][0], answer: v[0][1], key: v[0][0],
    choices: shuffle([v[0][1], ...pickDistractors(unitEn, v[0][1], 3)]) });
  // 2. choiceRev: en -> es
  ex.push({ type: 'choiceRev', prompt: v[1][1], answer: v[1][0], key: v[1][0],
    choices: shuffle([v[1][0], ...pickDistractors(unitEs, v[1][0], 3)]) });
  // 3. listen: hear es -> pick es
  ex.push({ type: 'listen', speak: v[2][0], answer: v[2][0], key: v[2][0], meaning: v[2][1],
    choices: shuffle([v[2][0], ...pickDistractors(unitEs, v[2][0], 3)]) });
  // 4. tiles: build the es sentence
  const s0 = lesson.s[0];
  const words0 = s0[0].split(' ');
  ex.push({ type: 'tiles', prompt: s0[1], answer: s0[0], key: s0[0], speak: s0[0],
    tiles: shuffle([...words0, ...pickDistractors(unitEs.filter((w) => !w.includes(' ')), '', 2)]) });
  // 5. fill (grammar)
  const f0 = lesson.f[0];
  ex.push({ type: 'fill', prompt: f0.q, hint: f0.h, answer: f0.a, key: f0.q, choices: shuffle(f0.o.slice()), tip: lesson.tip });
  // 6. match 4 pairs
  const pairs = shuffle(v).slice(0, 4);
  ex.push({ type: 'match', pairs, key: 'match:' + lesson.id,
    left: shuffle(pairs.map((p) => p[0])), right: shuffle(pairs.map((p) => p[1])) });
  // 7. type: es -> en
  ex.push({ type: 'type', prompt: v[3][0], speak: v[3][0], answer: v[3][1], key: v[3][0] });
  // 8. second fill or second tiles (alternate by lesson index for variety)
  const f1 = lesson.f[1];
  const s1 = lesson.s[1];
  if (lesson.id.endsWith('2') || lesson.id.endsWith('4')) {
    const words1 = s1[0].split(' ');
    ex.push({ type: 'tiles', prompt: s1[1], answer: s1[0], key: s1[0], speak: s1[0],
      tiles: shuffle([...words1, ...pickDistractors(unitEs.filter((w) => !w.includes(' ')), '', 2)]) });
  } else {
    ex.push({ type: 'fill', prompt: f1.q, hint: f1.h, answer: f1.a, key: f1.q, choices: shuffle(f1.o.slice()), tip: lesson.tip });
  }
  return ex;
}

// Practice session from weak vocab keys (es strings); falls back to random review.
export function buildPractice(weakKeys, completedLessonIds) {
  const allV = [];
  for (const u of UNITS) for (const l of u.lessons) {
    if (completedLessonIds.includes(l.id) || completedLessonIds.length === 0) allV.push(...l.v);
  }
  const pool = allV.length ? allV : UNITS[0].lessons[0].v;
  const esPool = pool.map((p) => p[0]);
  const enPool = pool.map((p) => p[1]);
  const weakPairs = pool.filter((p) => weakKeys.includes(p[0]));
  const rest = shuffle(pool.filter((p) => !weakKeys.includes(p[0])));
  const chosen = shuffle(weakPairs).concat(rest).slice(0, 8);
  return chosen.map((pair, i) => {
    const mode = i % 3;
    if (mode === 0) return { type: 'choice', prompt: pair[0], speak: pair[0], answer: pair[1], key: pair[0],
      choices: shuffle([pair[1], ...pickDistractors(enPool, pair[1], 3)]) };
    if (mode === 1) return { type: 'listen', speak: pair[0], answer: pair[0], key: pair[0], meaning: pair[1],
      choices: shuffle([pair[0], ...pickDistractors(esPool, pair[0], 3)]) };
    return { type: 'type', prompt: pair[0], speak: pair[0], answer: pair[1], key: pair[0] };
  });
}

// Lenient answer check for typed input; accepts missing accents/articles.
export function checkTyped(input, answer) {
  const a = normalize(input);
  const b = normalize(answer);
  if (!a) return false;
  if (a === b) return true;
  const strip = (s) => s.replace(/^(the|to|el|la|los|las|un|una|i)\s+/, '');
  return strip(a) === strip(b);
}
