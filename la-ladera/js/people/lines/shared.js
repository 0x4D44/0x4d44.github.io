// Shared pools every persona falls back to. Each line = [español, English]. Colombian register, <= 140 chars, TTS friendly.
// Tokens: {nombre} {shop} {barrio}.
export default {
  greet_m: [
    ['¡Buenos días! ¿Cómo amaneció?', 'Good morning! How did you wake up?'],
    ['Buenos días, joven. Qué bueno verlo por aquí.', 'Good morning. Nice to see you around here.'],
    ['¡Muy buenos días! Hoy amaneció fresquito, ¿no?', "Very good morning! It's a chilly one today, isn't it?"],
    ['Buenos días. ¿Anda de paseo por el barrio?', 'Good morning. Out for a stroll around the barrio?'],
    ['Buenos días, pues. ¿Qué más?', "Good morning, then. What's up?"],
    ['¡Buenas! Qué mañana tan bonita, ¿cierto?', "Hello! What a lovely morning, isn't it?"],
  ],
  greet_a: [
    ['Buenas tardes. ¿Cómo le va?', 'Good afternoon. How are you doing?'],
    ['¡Buenas! ¿Qué más, pues?', "Hello! What's up, then?"],
    ['Buenas tardes, joven. Con este solcito, ¿no?', "Good afternoon. Nice bit of sun, isn't it?"],
    ['Buenas tardes. ¿En qué le puedo colaborar?', 'Good afternoon. How can I help you?'],
    ['Muy buenas. Qué tarde tan bonita, ¿cierto?', 'Hello there. What a beautiful afternoon, right?'],
    ['Buenas tardes, vecino. ¿Todo bien?', 'Good afternoon, neighbour. All good?'],
  ],
  greet_e: [
    ['Buenas noches. Ya se nos fue la tarde, ¿no?', "Good evening. The afternoon is gone already, isn't it?"],
    ['¡Buenas! Ya está refrescando, ¿sí o qué?', "Hello! It's getting chilly, isn't it?"],
    ['Buenas noches, joven. ¿Todavía paseando?', 'Good evening. Still out walking?'],
    ['Buenas noches. Qué lindas se ven las luces desde aquí.', 'Good evening. The lights look lovely from here.'],
    ['Buenas tardes… bueno, ya casi noches. ¿Cómo está?', 'Good afternoon… well, nearly night. How are you?'],
  ],
  greet_n: [
    ['Uy, a esta hora… buenas noches. ¿No tiene sueño?', 'Oh, at this hour… good night. Not sleepy?'],
    ['Buenas noches. Con cuidado, que la calle está oscura.', 'Good night. Careful, the street is dark.'],
    ['¡Hola! ¿Qué hace despierto a estas horas?', 'Hi! What are you doing up at this hour?'],
  ],
  again: [
    ['Ya nos saludamos, ¿cierto? ¿Otra vuelta por el barrio?', 'We already said hello, right? Another lap around the barrio?'],
    ['Otra vez por aquí. ¿Se le perdió algo?', 'Back again. Did you lose something?'],
    ['Ajá, de nuevo usted. ¿En qué le puedo ayudar?', 'Well, you again. How can I help?'],
    ['Qué gusto verlo otra vez, vecino.', 'Good to see you again, neighbour.'],
  ],
  bye: [
    ['Hasta luego. Que le vaya muy bien.', 'See you later. Take care.'],
    ['Vaya con Dios, joven. Cuidado con las escaleras.', 'God be with you. Careful on the stairs.'],
    ['Chao, pues. Vuelva cuando quiera.', 'Bye, then. Come back any time.'],
    ['Que le rinda el paseo. ¡Hasta pronto!', 'Enjoy your walk. See you soon!'],
    ['Con gusto. Que esté muy bien.', 'My pleasure. Be well.'],
  ],
  bye_n: [
    ['Que descanse. Hasta mañana, si Dios quiere.', 'Rest well. Until tomorrow, God willing.'],
    ['Buenas noches, pues. Cuídese mucho.', 'Good night, then. Take good care.'],
  ],
  where_ask: [
    ['¿Para dónde va, pues?', 'Where are you headed, then?'],
    ['Dígame, ¿qué sitio busca?', 'Tell me, what place are you looking for?'],
    ['Claro que sí. ¿A cuál lugar?', 'Of course. Which place?'],
  ],
  anything: [['Dígame, pues.', 'Go on, then.'], ['Pregunte no más.', 'Just ask.']],
  filler: [
    ['Pues… mire, de eso no sé mucho.', 'Well… look, I do not know much about that.'],
    ['Eso sí no le sabría decir.', 'That I could not tell you.'],
  ],
  mood: [
    ['Aquí, pues, dándole al día a día.', 'Here we are, taking it day by day.'],
    ['Tranquilo, gracias a Dios. ¿Y usted?', 'Calm, thank God. And you?'],
    ['Uy, ni me pregunte… las cuentas y las escaleras me tienen cansado.', "Oh, don't ask… the bills and the stairs have me worn out."],
    ['Muy bien, gracias. Con esta vista no hay de qué quejarse.', 'Very well, thanks. With this view there is nothing to complain about.'],
  ],
  barrio: [
    ['Este barrio lo levantamos entre todos, ladrillo por ladrillo.', 'We built this barrio together, brick by brick.'],
    ['Antes aquí no había ni luz. Todo fue a pulso de la comunidad.', 'There used to be no electricity here. It was all the community’s effort.'],
    ['Los domingos se llena la cancha. Hasta los abuelos juegan.', 'On Sundays the court fills up. Even the grandparents play.'],
    ['Aquí todo el mundo se conoce. Para bien o para mal.', 'Everybody knows everybody here. For better or worse.'],
    ['En diciembre la junta hace la novena en la plazoleta. Es un espectáculo.', 'In December the neighbourhood council holds the novena in the square. It is a sight.'],
  ],
  news: [
    ['Dicen que van a arreglar el alumbrado de las escalinatas. Ya veremos.', 'They say they will fix the lighting on the stairways. We shall see.'],
    ['El martes se fue la luz tres horas. Como siempre.', 'On Tuesday the power went out for three hours. As always.'],
    ['Parece que el sábado hay bazar en la plazoleta.', 'It seems there is a bazaar in the square on Saturday.'],
  ],
  family: [
    ['Todos bien, gracias a Dios. Cada uno en lo suyo.', 'All well, thank God. Each one doing their own thing.'],
    ['Mis hijos ya se fueron a trabajar a la ciudad. Los extraño.', 'My children have gone to work in the city. I miss them.'],
  ],
  job: [
    ['Uno se rebusca como puede, pues. El día a día.', 'One makes do as one can, you know. Day to day.'],
  ],
  tip: [
    ['Suba hasta el mirador. Al atardecer, la ciudad se ve divina.', 'Go up to the viewpoint. At sunset the city looks divine.'],
    ['Si sube por la escalinata, no se pierda la vista desde arriba.', 'If you go up the stairway, do not miss the view from the top.'],
  ],
  // What they are doing when you stop them (the persona's own act_* pool wins over these). {o|a} = the speaker's gender.
  act_phone: [
    ['Perdone, estoy hablando con mi hermana. Dígame, ¿qué necesita?', 'Sorry, I am talking to my sister. Tell me, what do you need?'],
    ['Un momentico, que me están llamando. Ya con usted.', 'Just a moment, someone is calling me. With you in a second.'],
    ['Ay, qué pena, estaba mirando el celular. ¿Qué se le ofrece?', 'Oh, sorry, I was looking at my phone. What can I do for you?'],
  ],
  act_sweep: [
    ['Aquí, barriendo el frente de la casa. El polvo no perdona.', 'Here, sweeping the front of the house. The dust never forgives.'],
    ['Qué pena, estoy barriendo. Dígame, ¿en qué le ayudo?', 'Sorry, I am sweeping. Tell me, how can I help?'],
  ],
  act_cook: [
    ['Perdone el olor, estoy en la cocina. Dígame no más.', 'Forgive the smell, I am in the kitchen. Just tell me.'],
    ['Con las manos en la masa, como quien dice. ¿Qué se le ofrece?', 'Hands in the dough, as they say. What can I do for you?'],
  ],
  act_sit: [
    ['Venga, siéntese un ratico, no hay afán.', 'Come, sit a while, there is no rush.'],
    ['Aquí descansando las piernas. ¿Cómo le va?', 'Here resting my legs. How are you doing?'],
  ],
  act_lean: [
    ['Aquí, recostad{o|a} mirando pasar el día. ¿Y usted?', 'Here, leaning back and watching the day go by. And you?'],
    ['Pues aquí, viendo pasar la gente. Buenas.', 'Well here, watching people go by. Hello.'],
  ],
  act_carry: [
    ['Disculpe, ando cargando esto y pesa un montón.', 'Excuse me, I am carrying this and it weighs a ton.'],
    ['Un momentico, que no puedo con tanto bulto. Dígame.', 'Just a moment, I cannot manage this many bundles. Tell me.'],
  ],
  act_laundry: [
    ['Tendiendo la ropa antes de que llueva. ¿Qué necesita?', 'Hanging out the washing before it rains. What do you need?'],
  ],
  act_bounce: [
    ['¡Estoy esperando a que empiece el partido! ¿Juega?', 'I am waiting for the match to start! Are you playing?'],
    ['Es que no puedo estarme quiet{o|a}. ¡Hola!', 'It is just that I cannot keep still. Hi!'],
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
    ['Rezando un momentico por el barrio. ¿Necesita algo?', 'Praying a moment for the barrio. Do you need something?'],
  ],
  act_play: [
    ['¡Venga, juegue con nosotros! Falta uno para el partido.', 'Come on, play with us! We need one more for the match.'],
    ['Estamos jugando, pero dígame, ¿qué quiere?', 'We are playing, but tell me, what do you want?'],
  ],
  act_sell: [
    ['A la orden. ¿Qué se le antoja hoy?', 'At your service. What do you fancy today?'],
  ],
};
