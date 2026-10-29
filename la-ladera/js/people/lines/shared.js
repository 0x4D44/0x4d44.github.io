// Shared pools every persona falls back to. Each line = [español, English]; Colombian register (ustedeo), <= 140 chars, TTS friendly.
// Tokens: {nombre} {shop} {barrio} | {o|a} = the SPEAKER's gender form | {vecino} {mijo} {señor} {lo} {parado} ... = how the PLAYER is addressed (dialogue.js FORMS).
// The player's gender is a setting: never write "vecino", "mijo", "señor", "parado", "verlo" for the player directly, use the tokens ("joven" is invariant).
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
    ['Buenas tardes, joven. Con este solcito, ¿no?', "Good afternoon. Nice bit of sun, isn't it?"],
    ['Buenas tardes. ¿En qué le puedo colaborar?', 'Good afternoon. How can I help you?'],
    ['Muy buenas. Qué tarde tan bonita, ¿cierto?', "Hello there. What a beautiful afternoon, isn't it?"],
    ['Buenas tardes, {vecino}. ¿Todo bien?', 'Good afternoon, neighbour. All good?'],
  ],
  greet_e: [
    ['Buenas noches. Ya se nos fue la tarde, ¿no?', "Good evening. The afternoon's gone already, hasn't it?"],
    ['¡Buenas! Ya está refrescando, ¿sí o qué?', "Hey! It's getting chilly, isn't it?"],
    ['Buenas noches, joven. ¿Todavía paseando?', 'Good evening. Still out walking?'],
    ['Buenas noches. Qué lindas se ven las luces desde aquí.', 'Good evening. The lights look lovely from here.'],
    ['Buenas tardes… bueno, ya casi buenas noches. ¿Cómo está?', 'Good afternoon… well, nearly evening. How are you?'],
  ],
  greet_n: [
    ['Uy, a esta hora… buenas noches. ¿No tiene sueño?', 'Oh, at this hour… good evening. Not sleepy?'],
    ['Buenas noches. Con cuidado, que la calle está oscura.', 'Good evening. Careful, the street is dark.'],
    ['¡Hola! ¿Qué hace {despierto} a estas horas?', 'Hi! What are you doing up at this hour?'],
  ],
  again: [
    ['Ya nos saludamos, ¿cierto? ¿Otra vuelta por el barrio?', 'We already said hello, right? Another lap around the barrio?'],
    ['¿Qué pasó, se le quedó algo?', 'What happened, did you leave something behind?'],
    ['¡Miren quién volvió! ¿En qué le puedo ayudar?', "Look who's back! How can I help?"],
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
  ],
  where_ask: [
    ['¿Para dónde va, pues?', 'Where are you headed?'],
    ['Dígame, ¿qué sitio busca?', 'Tell me, what place are you looking for?'],
    ['Claro que sí. ¿A cuál lugar?', 'Of course. Which place?'],
  ],
  anything: [['Dígame, pues.', 'Go on, then.'], ['Pregunte no más.', 'Just ask.']],
  filler: [
    ['Pues… mire, de eso no sé mucho.', "Well… look, I don't know much about that."],
    ['Eso sí no le sabría decir.', "That I couldn't tell you."],
  ],
  mood: [
    ['Aquí, pues, en la lucha.', 'Here, keeping at it.'],
    ['Tranquil{o|a}, gracias a Dios. ¿Y usted?', 'Calm, thank God. And you?'],
    ['Uy, ni me pregunte… las cuentas y las escaleras me tienen cansad{o|a}.', "Oh, don't ask… the bills and the stairs have me worn out."],
    ['Muy bien, gracias. Con esta vista no hay de qué quejarse.', "Very well, thanks. With this view there's nothing to complain about."],
  ],
  barrio: [
    ['Este barrio lo levantamos entre todos, ladrillo por ladrillo.', 'We built this barrio together, brick by brick.'],
    ['Antes aquí no había ni luz. Todo fue a pulso de la comunidad.', "There used to be no electricity here. It was all the community's doing."],
    ['Los domingos se llena la cancha. Hasta los abuelos juegan.', 'On Sundays the court fills up. Even the grandparents play.'],
    ['Aquí todo el mundo se conoce. Para bien o para mal.', 'Everybody knows everybody here. For better or worse.'],
    ['En diciembre la junta hace la novena en la plazoleta. Es un espectáculo.', "In December the neighbourhood council holds the novena in the square. It's quite a sight."],
  ],
  news: [
    ['Cuentan que van a arreglar el alumbrado de las escalinatas. Ya veremos.', "They say the lighting on the stairways is getting fixed. We'll see."],
    ['El martes se fue la luz tres horas. Como siempre.', 'On Tuesday the power went out for three hours. As usual.'],
    ['Parece que el sábado hay bazar en la plazoleta.', "Looks like there's a bazaar in the square on Saturday."],
  ],
  family: [
    ['Todos bien, gracias a Dios. Cada uno en lo suyo.', 'All well, thank God. Each one doing their own thing.'],
    ['Mis hijos se fueron a trabajar a otra ciudad. Los extraño.', 'My children went to work in another city. I miss them.'],
  ],
  job: [
    ['Uno se rebusca como puede, pues. Día a día.', 'One makes do as best one can. Day by day.'],
  ],
  tip: [
    ['Suba hasta el mirador. Al atardecer, la ciudad se ve divina.', 'Go up to the viewpoint. At sunset the city looks divine.'],
    ['Si sube por la escalinata, no se pierda la vista desde arriba.', "If you go up the stairway, don't miss the view from the top."],
    ['En la cancha vive un gato, Pelusa, en un hueco de la pared. Dicen que trae suerte.', 'A cat called Pelusa lives in a hole in the court wall. They say he brings luck.'],
    ['Pase por la capilla a las cinco. La luz que entra por la ventana es otra cosa.', 'Go by the chapel at five. The light through the window is something else.'],
  ],
  // What they are doing when you stop them (the persona's own act_* pool wins over these). {o|a} = the speaker's gender.
  act_phone: [
    ['Perdone, estoy hablando con mi hermana. Dígame, ¿qué necesita?', "Sorry, I'm talking to my sister. Tell me, what do you need?"],
    ['Un momentico, que me están llamando. Ya con usted.', "Just a moment, someone's calling me. With you in a second."],
    ['Ay, qué pena con usted, estaba mirando el celular. ¿Qué se le ofrece?', 'Oh, so sorry, I was looking at my phone. What can I do for you?'],
  ],
  act_sweep: [
    ['Aquí, barriendo el frente de la casa. El polvo no perdona.', 'Here, sweeping the front of the house. The dust never lets up.'],
    ['Qué pena, estoy barriendo. Dígame, ¿en qué le ayudo?', "Sorry, I'm sweeping. Tell me, how can I help?"],
  ],
  act_cook: [
    ['Perdone, que tengo el arroz en el fogón. Dígame no más.', "Sorry, I've got rice on the stove. Go ahead."],
    ['Con las manos en la masa, como quien dice. ¿Qué se le ofrece?', 'Hands in the dough, as they say. What can I do for you?'],
  ],
  act_sit: [
    ['Venga, siéntese un ratico, no hay afán.', "Come on, sit a while, there's no rush."],
    ['Aquí descansando las piernas. ¿Cómo le va?', 'Here resting my legs. How are you doing?'],
  ],
  act_lean: [
    ['Aquí, recostad{o|a} mirando pasar el día. ¿Y usted?', 'Here, leaning back and watching the day go by. And you?'],
    ['Pues aquí, viendo pasar a la gente. Buenas.', 'Well, here, watching people go by. Hello.'],
  ],
  act_carry: [
    ['Disculpe, ando cargando esto y pesa un montón.', "Excuse me, I'm carrying this and it weighs a ton."],
    ['Un momentico, que no puedo con tanto bulto. Dígame.', "Just a moment, I can't manage this many bundles. Tell me."],
  ],
  act_laundry: [
    ['Tendiendo la ropa antes de que llueva. ¿Qué necesita?', 'Hanging out the washing before it rains. What do you need?'],
  ],
  act_bounce: [
    ['¡Estoy esperando a que empiece el partido! ¿Juega?', "I'm waiting for the match to start! Do you play?"],
    ['Es que no puedo estarme quiet{o|a}. ¡Hola!', "It's just that I can't keep still. Hi!"],
  ],
  act_fidget: [
    ['Uy, qué susto. Estaba mirando las hormigas.', 'Oh, what a fright. I was watching the ants.'],
    ['Hola. Estaba pensando en qué jugar.', 'Hi. I was thinking about what to play.'],
  ],
  act_talk: [
    ['Estábamos charlando, pero pase, pase. Dígame.', 'We were chatting, but come on over. Tell me.'],
    ['Ay, qué pena, estábamos en la charla. ¿Qué se le ofrece?', 'Oh, sorry, we were deep in conversation. What can I do for you?'],
  ],
  act_wait: [
    ['Aquí esperando a una persona. ¿Cómo está?', 'Here waiting for someone. How are you?'],
  ],
  act_read: [
    ['Estaba leyendo el periódico. ¿Qué se le ofrece?', 'I was reading the newspaper. What can I do for you?'],
  ],
  act_pray: [
    ['Rezando un momentico por el barrio. ¿Necesita algo?', 'Saying a quick prayer for the barrio. Do you need something?'],
  ],
  act_play: [
    ['¡Venga, juegue con nosotros! Falta uno para el partido.', 'Come on, play with us! We need one more for the match.'],
    ['Estamos jugando, pero dígame, ¿qué quiere?', "We're playing, but tell me, what do you want?"],
  ],
  act_sell: [
    ['A la orden. ¿Qué se le antoja hoy?', 'At your service. What are you in the mood for today?'],
  ],
};
