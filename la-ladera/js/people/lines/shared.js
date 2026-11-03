// Shared pools every persona falls back to. Each line = [español, English]; Colombian register (ustedeo), <= 140 chars, TTS friendly.
// Tokens: {nombre} {shop} {barrio} | {o|a} = the SPEAKER's gender form | {vecino} {mijo} {señor} {lo} {parado} ... = how the PLAYER is addressed (dialogue.js FORMS).
// The player's gender is a setting: never write "vecino", "mijo", "señor", "parado", "verlo" for the player directly, use the tokens ("joven" is invariant).
// A third element can say who may say a line, or when (dialogue.js mayBeSaid / inWindow): { age, only, not, shop, from, to }.
const ODD_JOBS = { only: ['vecino', 'vecina', 'obrero', 'mototaxista', 'ambulante'] };
export default {
  greet_m: [
    ['¡Buenos días! ¿Cómo amaneció?', 'Good morning! How are you this morning?'],
    ['Buenos días, joven. Qué bueno ver{lo} por aquí.', 'Good morning. Nice to see you around here.'],
    ['¡Muy buenos días! Hoy amaneció fresquito, ¿no?', "Good morning! It's a chilly one today, isn't it?"],
    ['Buenos días. ¿Anda de paseo por el barrio?', 'Good morning. Out for a stroll around the barrio?'],
    ['Buenos días. ¿Qué más, pues?', "Morning! How's it going?"],
    ['¡Buenas! Qué mañana tan bonita, ¿cierto?', "Hi there! Beautiful morning, isn't it?"],
  ],
  greet_a: [
    ['Buenas tardes. ¿Cómo le va?', 'Good afternoon. How are you doing?'],
    ['¡Buenas! ¿Qué más, pues?', "Hey there! How's it going?"],
    ['Buenas tardes, joven. Qué solecito tan rico, ¿no?', "Good afternoon. Nice bit of sun, isn't it?"],
    ['Buenas tardes. ¿En qué le puedo colaborar?', 'Good afternoon. How can I help you?'],
    ['Muy buenas. Qué tarde tan bonita, ¿cierto?', "Hello there. What a beautiful afternoon, isn't it?"],
    ['Buenas tardes, {vecino}. ¿Todo bien?', 'Good afternoon, neighbour. All good?'],
  ],
  greet_e: [
    ['Buenas noches. Ya se nos fue la tarde, ¿no?', "Good evening. The afternoon's gone already, hasn't it?"],
    ['¡Buenas! Ya está refrescando, ¿sí o qué?', "Hey! It's getting chilly, isn't it?"],
    ['Buenas noches, joven. ¿Todavía paseando?', 'Good evening. Still out walking?'],
    ['Buenas noches. Qué lindas se ven las luces desde aquí.', 'Good evening. The lights look lovely from here.'],
    ['Buenas tardes… bueno, ya casi buenas noches. ¿Cómo está?', 'Good afternoon… well, nearly evening. How are you?', { to: 19.5 }],
  ],
  greet_n: [
    ['Uy, a esta hora… buenas noches. ¿No tiene sueño?', 'Oh, at this hour… good evening. Not sleepy?'],
    ['Buenas noches. Con cuidado, que la calle está oscura.', 'Good evening. Careful, the street is dark.'],
    ['¡Hola! ¿Qué hace {despierto} a estas horas?', 'Hi! What are you doing up at this hour?'],
    ['Buenas noches. Qué silencio tan bonito hay a esta hora.', 'Good evening. What a lovely silence there is at this hour.'],
    ['¡Ay, qué susto! Buenas noches. ¿Anda {perdido}?', 'Oh, you gave me a fright! Good evening. Are you lost?'],
    ['Buenas noches. Menos mal que ya prendieron los postes.', 'Good evening. Good thing they have switched the street lamps on.'],
    ['Buenas noches. ¿Se le hizo tarde?', 'Good evening. Did the time get away from you?'],
    ['Hola, buenas. Con este frío, ¿quién sale de la casa?', 'Hello. With this cold, who goes out of the house?'],
  ],
  again: [
    ['Ya nos saludamos, ¿cierto? ¿Otra vuelta por el barrio?', 'We already said hello, right? Another lap around the barrio?'],
    ['¿Qué pasó, se le quedó algo?', 'What happened, did you leave something behind?'],
    ['¡Mire quién volvió! ¿En qué le puedo ayudar?', "Look who's back! How can I help?"],
    ['Qué gusto ver{lo} otra vez, {vecino}.', 'Good to see you again, neighbour.'],
    ['Usted como que se amañó en el barrio.', "Looks like you've made yourself at home in the barrio."],
  ],
  bye: [
    ['Hasta luego. Que le vaya muy bien.', 'See you later. Take care.'],
    ['Vaya con Dios, joven. Cuidado con las escaleras.', 'God be with you. Careful on the stairs.'],
    ['Chao, pues. Vuelva cuando quiera.', 'Bye now. Come back any time.'],
    ['Que disfrute el paseo. ¡Hasta pronto!', 'Enjoy your walk. See you soon!'],
    ['Con gusto. Que esté muy bien.', 'My pleasure. Be well.'],
  ],
  bye_n: [
    ['Que descanse. Hasta mañana, si Dios quiere.', 'Rest well. Until tomorrow, God willing.'],
    ['Buenas noches, pues. Cuídese mucho.', 'Good night now. Take good care.'],
    ['Que pase buena noche. Hasta mañana.', 'Have a good night. Until tomorrow.'],
    ['Vaya con cuidado, que está oscuro. ¡Hasta pronto!', "Go carefully, it's dark. See you soon!"],
    ['Que Dios {lo} acompañe. Buenas noches.', 'God be with you. Good night.'],
    ['Descanse, pues, que mañana será otro día.', "Get some rest, then, tomorrow's another day."],
    ['Hasta luego. Y arrópese, que hace frío.', "See you later. And wrap up, it's cold."],
  ],
  where_ask: [
    ['¿Para dónde va, pues?', 'Where are you headed?'],
    ['Dígame, ¿qué sitio busca?', 'Tell me, what place are you looking for?'],
    ['Claro que sí. ¿A cuál lugar?', 'Of course. Which place?'],
  ],
  anything: [['Dígame, pues.', 'Go on, then.'], ['Pregunte no más.', 'Just ask.'], ['Hable, que lo escucho.', "Speak, I'm listening."], ['¿Qué más se le ofrece?', 'What else can I do for you?']],
  filler: [
    ['Pues… mire, de eso no sé mucho.', "Well… look, I don't know much about that."],
    ['Eso sí no le sabría decir.', "That I couldn't tell you."],
    ['Uy, pregunte otra cosa, que de eso no sé nada.', "Oh, ask me something else, I know nothing about that."],
    ['Eso toca preguntárselo a otra persona.', 'You will have to ask somebody else about that.'],
  ],
  mood: [
    ['Aquí, pues, en la lucha.', 'Here, keeping at it.'],
    ['Tranquil{o|a}, gracias a Dios. ¿Y usted?', 'Calm, thank God. And you?'],
    ['Uy, ni me pregunte… las cuentas y las escaleras me tienen cansad{o|a}.', "Oh, don't ask… the bills and the stairs have me worn out.", { age: ['adult', 'elder'] }],   // (bills are a grown-up's worry: R3-020)
    ['Muy bien, gracias. Con esta vista no hay de qué quejarse.', "Very well, thanks. With this view there's nothing to complain about."],
    ['Bien, pues, gracias a Dios. Hoy no ha pasado nada raro.', "Fine, thank God. Nothing odd has happened today."],
    ['Ahí vamos, un día a la vez.', 'Getting along, one day at a time.'],
    ['Contentic{o|a}: hoy no me ha llovido encima.', "Quite happy: it hasn't rained on me today."],
    ['Cansad{o|a}, pero bien. Al que madruga Dios le ayuda, dicen.', 'Tired, but fine. God helps the early riser, they say.'],
  ],
  barrio: [
    ['Este barrio lo levantamos entre todos, ladrillo por ladrillo.', 'We built this barrio together, brick by brick.', { age: ['adult', 'elder'] }],               // (those who built it, not a child: R3-020)
    ['Antes aquí no había ni luz. Todo fue a pulso de la comunidad.', "There used to be no electricity here. It was all the community's doing.", { age: ['adult', 'elder'] }],
    ['Los domingos se llena la cancha. Hasta los abuelos juegan.', 'On Sundays the court fills up. Even the grandparents play.'],
    ['Aquí todo el mundo se conoce. Para bien o para mal.', 'Everybody knows everybody here. For better or worse.'],
    ['En diciembre la junta hace la novena en la plazoleta. Es un espectáculo.', "In December the neighbourhood council holds the novena in the square. It's quite a sight."],
  ],
  news: [
    ['Cuentan que van a arreglar el alumbrado de las escalinatas. Ya veremos.', "They say the lighting on the stairways is getting fixed. We'll see."],
    ['El martes se fue la luz tres horas. Como siempre.', 'On Tuesday the power went out for three hours. As usual.'],
    ['Parece que el sábado hay bazar en la plazoleta.', "Looks like there's a bazaar in the square on Saturday."],
    ['Dicen que la junta quiere pintar la escalinata de colores. A ver si es verdad.', "They say the neighbourhood council wants to paint the stairway in bright colours. Let's see if it's true."],
    ['Se dañó otra vez la bomba del agua. Toca guardar en baldes.', 'The water pump broke down again. We have to store water in buckets.'],
    ['El domingo hay misa especial en la capilla, con coro y todo.', "On Sunday there's a special mass at the chapel, choir and all."],
    ['Dicen que el bus nuevo va a subir hasta acá. Yo lo creo cuando lo vea.', "They say the new bus will come all the way up here. I'll believe it when I see it."],
    ['En la cancha están armando un campeonato de microfútbol. Ya están inscribiendo equipos.', "They're putting together a five-a-side tournament at the court. Teams are signing up."],
    ['A la vecina de la esquina le llegó la nieta de Medellín. Todo el barrio está de fiesta.', "The neighbour on the corner's granddaughter has come from Medellín. The whole barrio is celebrating."],
  ],
  family: [
    ['Todos bien, gracias a Dios. Cada uno en lo suyo.', 'All well, thank God. Each one doing their own thing.'],
    ['Mis hijos se fueron a trabajar a otra ciudad. Los extraño.', 'My children went to work in another city. I miss them.', { age: ['elder'] }],               // (a parent's line, and the nest is empty: R3-020. The next line is the nest that is full, so no one says both)
    ['Mi mamá vive conmigo y me tiene a raya. Gracias a Dios.', 'My mother lives with me and keeps me in line. Thank God.', { age: ['kid', 'teen', 'adult'] }],         // (an elder's mother does not)
    ['Los muchachos crecen volando. Uno no alcanza ni a comprarles los zapatos.', 'The kids grow like weeds. You can barely keep up with buying their shoes.', { age: ['adult'] }],
    ['Aquí vivimos varios en la misma casa. Es ruidoso, pero nunca estamos solos.', "Several of us live in the same house. It's noisy, but we're never alone."],
  ],
  job: [
    // (the odd-jobs lines are for those who take what comes: not a keeper in their own shop, a teacher, a nurse, a pensioner or a child, whose own lines say what they do: R3-020)
    ['Uno se rebusca como puede, pues. Día a día.', 'One makes do as best one can. Day by day.', ODD_JOBS],
    ['Trabajo en lo que salga. Hoy una cosa, mañana otra.', 'I work at whatever comes up. One thing today, another tomorrow.', ODD_JOBS],
    ['Por aquí uno hace de todo un poquito.', 'Around here you do a bit of everything.', ODD_JOBS],
  ],
  tip: [
    ['Suba hasta el mirador. Al atardecer, la ciudad se ve divina.', 'Go up to the viewpoint. At sunset the city looks divine.'],
    ['Si sube por la escalinata, no se pierda la vista desde arriba.', "If you go up the stairway, don't miss the view from the top."],
    ['En la cancha vive un gato, Pelusa, en un hueco de la pared. Dicen que trae suerte.', 'A cat called Pelusa lives in a hole in the court wall. They say he brings luck.'],
    ['Pase por la capilla a las cinco. La luz que entra por la ventana es otra cosa.', 'Go by the chapel at five. The light through the window is something else.'],
    ['Camine despacio por el Callejón de los Faroles. Hay rinconcitos que uno no ve de afán.', "Walk slowly down the Callejón de los Faroles. There are little corners you don't see in a hurry."],
    ['Si le queda tiempo, asómese a la cancha. Siempre hay alguien jugando.', "If you have time, drop by the court. There's always somebody playing."],
    ['Cuando baje, mire las casas desde la escalinata: cada puerta tiene su historia.', 'When you go down, look at the houses from the stairway: every door has its story.'],
  ],
  // What they are doing when you stop them (the persona's own act_* pool wins over these). {o|a} = the speaker's gender.
  act_phone: [
    ['Perdone, estoy hablando con mi hermana. Dígame, ¿qué necesita?', "Sorry, I'm talking to my sister. Tell me, what do you need?"],
    ['Un momentico, que me están llamando. Ya con usted.', "Just a moment, someone's calling me. With you in a second."],
    ['Ay, qué pena con usted, estaba mirando el celular. ¿Qué se le ofrece?', 'Oh, so sorry, I was looking at my phone. What can I do for you?'],
    ['Un segundito, que me acaba de llegar un mensaje. Dígame.', 'One second, I just got a message. Go ahead.'],
  ],
  act_sweep: [
    ['Aquí, barriendo el frente de la casa. El polvo no perdona.', 'Here, sweeping the front of the house. The dust never lets up.'],
    ['Qué pena, estoy barriendo. Dígame, ¿en qué le ayudo?', "Sorry, I'm sweeping. Tell me, how can I help?"],
    ['Hay que barrer todos los días, o la calle se come la casa.', 'You have to sweep every day, or the street swallows the house.'],
    ['Ay, perdone el polvero. Estoy barriendo. ¿En qué le sirvo?', "Oh, sorry about the dust. I'm sweeping. How can I help?"],
  ],
  act_cook: [
    ['Perdone, que tengo el arroz en el fogón. Dígame no más.', "Sorry, I've got rice on the stove. Go ahead."],
    ['Con las manos en la masa, como quien dice. ¿Qué se le ofrece?', 'Hands in the dough, as they say. What can I do for you?'],
    ['Estoy en la cocina y se me va a pegar la olla. Dígame rapidito.', "I'm in the kitchen and the pot is about to stick. Tell me quickly."],
    ['Huele a algo rico, ¿cierto? Ya casi está. ¿Qué se le ofrece?', "Smells good, right? It's almost ready. What can I do for you?"],
  ],
  act_sit: [
    ['Venga, siéntese un ratico, no hay afán.', "Come on, sit a while, there's no rush."],
    ['Aquí descansando las piernas. ¿Cómo le va?', 'Here resting my legs. How are you doing?'],
    ['Aquí sentad{o|a} un ratico, mirando pasar el barrio. ¿Y usted?', 'Here sitting for a bit, watching the barrio go by. And you?'],
    ['Siéntese, no se quede {parado}. ¿Cómo está?', "Sit down, don't just stand there. How are you?"],
    ['Estoy descansando, que las escaleras de este barrio no perdonan.', "I'm resting, the stairways of this barrio show no mercy."],
  ],
  act_lean: [
    ['Aquí, recostad{o|a} mirando pasar el día. ¿Y usted?', 'Here, leaning back and watching the day go by. And you?'],
    ['Pues aquí, viendo pasar a la gente. Buenas.', 'Well, here, watching people go by. Hello.'],
    ['Aquí no más, recostad{o|a} en la pared. Buenas.', 'Just here, leaning on the wall. Hello.'],
    ['Tomando un poco de aire. ¿Usted cómo va?', 'Getting a bit of air. How are you doing?'],
  ],
  act_carry: [
    ['Disculpe, ando cargando esto y pesa un montón.', "Excuse me, I'm carrying this and it weighs a ton."],
    ['Un momentico, que no puedo con tanto bulto. Dígame.', "Just a moment, I can't manage this many bundles. Tell me."],
    ['Ando con un mandado pesado. Dígame, pero rapidito.', "I'm on a heavy errand. Tell me, but quickly."],
    ['Uf, esto pesa más de lo que parece. Un momentico y lo escucho.', "Phew, this weighs more than it looks. One moment and I'll listen."],
  ],
  act_laundry: [
    ['Tendiendo la ropa antes de que llueva. ¿Qué necesita?', 'Hanging out the washing before it rains. What do you need?'],
    ['Estoy recogiendo la ropa, que ya se secó. ¿Qué se le ofrece?', "I'm taking in the washing, it has dried. What can I do for you?"],
    ['Con tanto sol la ropa se seca en un ratico. ¿Cómo le va?', 'With this much sun the washing dries in no time. How are you?'],
    ['Perdone, ando con la ropa en las manos. Dígame no más.', "Sorry, I've got the washing in my hands. Go ahead."],
  ],
  act_bounce: [
    ['¡Estoy esperando a que empiece el partido! ¿Juega?', "I'm waiting for the match to start! Do you play?"],
    ['Es que no puedo estarme quiet{o|a}. ¡Hola!', "It's just that I can't keep still. Hi!"],
    ['¡Hola! No me regañe, es que ando con mucha energía.', "Hi! Don't scold me, I've just got a lot of energy."],
    ['Estoy practicando para el partido. ¿Quiere ver?', "I'm practising for the match. Want to watch?"],
  ],
  act_fidget: [
    ['Uy, qué susto. Estaba mirando las hormigas.', 'Oh, what a fright. I was watching the ants.'],
    ['Hola. Estaba pensando en qué jugar.', 'Hi. I was thinking about what to play.'],
    ['Hola. Me estaba aburriendo, ¿usted qué hace?', 'Hi. I was getting bored, what are you up to?'],
    ['Shh, estaba escondid{o|a}, que me están buscando.', "Shh, I was hiding, they're looking for me."],
  ],
  act_talk: [
    ['Estábamos charlando, pero pase, pase. Dígame.', 'We were chatting, but come on over. Tell me.'],
    ['Ay, qué pena, estábamos en la charla. ¿Qué se le ofrece?', 'Oh, sorry, we were deep in conversation. What can I do for you?'],
    ['Estábamos contándonos las novedades del barrio. Venga, escuche.', 'We were swapping the news of the barrio. Come, listen.'],
    ['Mire, justo hablábamos de lo caro que está todo. ¿Usted cómo ve?', "Look, we were just talking about how expensive everything is. What do you think?"],
  ],
  act_wait: [
    ['Aquí esperando a una persona. ¿Cómo está?', 'Here waiting for someone. How are you?'],
    ['Aquí esperando, a ver si la persona llega. ¿Y usted?', 'Here waiting to see if the person arrives. And you?'],
    ['Esperando que pase el bus, que por aquí se demora. ¿Cómo está?', 'Waiting for the bus, it takes forever to come around here. How are you?', { not: ['mototaxista'], shop: false }],   // (the transport does not wait for the bus, nor does a keeper in their shop: R3-020)
    ['Matando el tiempo, pues. Dígame.', 'Killing time, you know. Tell me.'],
  ],
  act_read: [
    ['Estaba leyendo el periódico. ¿Qué se le ofrece?', 'I was reading the newspaper. What can I do for you?'],
    ['Leyendo un ratico, que casi no tengo tiempo. ¿Qué necesita?', 'Reading for a bit, I hardly ever have time. What do you need?'],
    ['Estaba en la página más interesante. Pero dígame.', 'I was on the most interesting page. But tell me.'],
    ['Repasando las noticias del día. ¿En qué le puedo servir?', "Going over the day's news. How can I help?"],
  ],
  act_pray: [
    ['Rezando un momentico por el barrio. ¿Necesita algo?', 'Saying a quick prayer for the barrio. Do you need something?'],
    ['Le estaba pidiendo a la Virgen por la familia. ¿Necesita algo?', 'I was asking Our Lady to look after the family. Do you need something?'],
    ['Un ratico de oración nunca sobra. Dígame, ¿cómo está?', 'A moment of prayer never hurts. Tell me, how are you?'],
    ['Aquí, en paz con Dios. Buenas.', 'Here, at peace with God. Hello.'],
  ],
  act_play: [
    ['¡Venga, juegue con nosotros! Falta uno para el partido.', 'Come on, play with us! We need one more for the match.'],
    ['Estamos jugando, pero dígame, ¿qué quiere?', "We're playing, but tell me, what do you want?"],
    ['¡Ey, venga! Nos falta uno para armar los equipos.', 'Hey, come over! We need one more to make up the teams.'],
    ['Estamos en la mitad del partido. ¿Quiere jugar un ratico?', "We're halfway through the match. Want to play for a bit?"],
  ],
  // at home, when you walk in on them (people/homelife.js): at the table, in front of the television, at the homework, at the sink, at the bench
  act_eat: [
    ['Estamos desayunando. ¿Le sirvo un tintico?', "We're having breakfast. Can I pour you a coffee?", { to: 10 }],
    ['Justo a la hora del almuerzo. ¿Ya comió usted?', "Right at lunchtime. Have you eaten?", { from: 11, to: 15 }],
    ['Cenando, como todas las noches. ¿Se le ofrece algo?', 'Having supper, like every night. Can I help you with something?', { from: 17.5 }],
    ['Perdone, estoy comiendo. Dígame no más.', "Sorry, I'm eating. Go ahead."],
    ['Estamos a la mesa, pero pase, no se quede en la puerta.', "We're at the table, but come in, don't stand in the doorway."],
  ],
  act_tv: [
    ['Viendo la novela, pero dígame. ¿Qué se le ofrece?', 'Watching my soap opera, but tell me. What can I do for you?'],
    ['Estaba mirando el noticiero. Siéntese si quiere.', 'I was watching the news. Sit down if you like.'],
    ['Le bajo al televisor. Dígame.', "Let me turn the TV down. Tell me."],
    ['Aquí, viendo el partido. ¿Usted es del Nacional o de Millonarios?', "Here, watching the match. Are you for Nacional or for Millonarios?"],
  ],
  act_homework: [
    ["Estoy haciendo la tarea. ¡No me distraiga, que me falta mucho!", "I'm doing my homework. Don't distract me, I've got loads left!", { age: ['kid', 'teen'] }],
    ['Tarea de matemáticas. Es la peor. ¿Usted sabe dividir?', "Maths homework. It's the worst. Do you know how to do division?", { age: ['kid', 'teen'] }],
    ["Shh, estoy estudiando para la prueba de mañana.", "Shh, I'm studying for tomorrow's test.", { age: ['kid', 'teen'] }],
    ['Hola. Es que me toca copiar esto en el cuaderno.', 'Hi. I have to copy this into my notebook.', { age: ['kid', 'teen'] }],
  ],
  act_wash: [
    ['Lavando la loza, que se acumula. ¿Qué se le ofrece?', 'Washing the dishes, they pile up. What can I do for you?'],
    ['Un momentico, que tengo las manos mojadas. Dígame.', 'One moment, my hands are wet. Tell me.'],
    ['Pelando papas para el almuerzo. ¿Qué necesita?', 'Peeling potatoes for lunch. What do you need?', { from: 9, to: 14 }],
    ['Aquí, alistando la cocina para mañana. Dígame.', 'Here, getting the kitchen ready for tomorrow. Tell me.', { from: 19 }],
  ],
  act_repair: [
    ['Aquí arreglando una moto. Cuidado con el aceite.', 'Here fixing a motorbike. Mind the oil.'],
    ['Un momentico, que tengo las manos sucias. Dígame.', 'One moment, my hands are dirty. Tell me.'],
    ['Este motor no arranca ni a las buenas. ¿Usted sabe de mecánica?', "This engine won't start for love or money. Do you know anything about mechanics?"],
    ['Ya casi termino con esta pieza. ¿Qué se le ofrece?', 'Nearly done with this part. What can I do for you?'],
  ],
  // in class: the pupils seated at the desks while the player walks through the school (people/classroom.js); the teachers have their own (workers.js maestra)
  act_class: [
    ['Shh, hable bajito, que la profe nos está mirando.', "Shh, keep your voice down, the teacher is watching us."],
    ['Estoy copiando lo del tablero. ¡Rápido, que lo van a borrar!', "I'm copying what's on the board. Quick, they're about to erase it!"],
    ['Estamos en clase, pero la profe no se da cuenta si hablamos un ratico.', "We're in class, but the teacher won't notice if we talk for a bit."],
    ['Psst, la profe está de espaldas. ¿Qué quiere?', "Psst, the teacher's back is turned. What do you want?"],
  ],
  // (any shop: a bakery, a hardware store and a pharmacy all say these)
  act_sell: [
    ['A la orden. ¿Qué se le ofrece?', 'At your service. What can I get you?'],
    ['Buenas, mire con calma. Aquí estoy para lo que necesite.', "Hello, take your time. I'm here for whatever you need."],
    ['Un momentico, que termino de acomodar y {lo} atiendo.', "One moment, let me finish tidying up and I'll serve you."],
    ['Pase, pase. ¿Qué anda buscando?', 'Come in, come in. What are you looking for?'],
  ],
};
