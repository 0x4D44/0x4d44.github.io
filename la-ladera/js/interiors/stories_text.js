// Words of the interiors (A3): what an object says when the player presses E (SAY, [es, en] pairs, cycled in order) and the tiny stories
// the objects tell when the player walks up to them (STORY / SHOP_STORY / PLACE_STORY: id -> { name (Spanish title), en (one English line), kind }).
// Everything player-facing is Spanish first; the English line is the subtitle / toast gloss.

export const SAY = {
  fridge: [
    ['Yogur, queso campesino, una papaya partida y jugo de lulo en jarra.', 'Yoghurt, farmer cheese, a cut papaya and lulo juice in a jug.'],
    ['El pollo del almuerzo, huevos, leche y una bandeja de gelatina.', 'Lunch chicken, eggs, milk and a tray of jelly.'],
    ['Fruta lavada, media torta de chocolate y gaseosa para el domingo.', 'Washed fruit, half a chocolate cake and soda for Sunday.'],
  ],
  fridge_poor: [
    ['Agua en botella, dos huevos, una cebolla y la sopa de ayer bien tapada.', "Bottled water, two eggs, an onion and yesterday's soup, carefully covered."],
    ['Casi vacía: una bolsa de leche, un trozo de panela y un tarro de arequipe.', 'Nearly empty: a bag of milk, a lump of panela and a tub of arequipe.'],
    ['Huele a cilantro. Hay arepas envueltas y una jarra de agua de panela.', 'It smells of cilantro. Wrapped arepas and a jug of panela water.'],
  ],
  drinks: [
    ['Gaseosas heladas, jugos en caja y agua en bolsa. El motor zumba sin parar.', 'Ice-cold sodas, boxed juices and bagged water. The motor hums non-stop.'],
    ['Cervezas para el partido del sábado y colas frías para los niños.', 'Beers for Saturday\'s match and cold colas for the kids.'],
  ],
  meat: [
    ['Costillas, pollo entero y chorizo, cada pieza con su precio por libra.', 'Ribs, whole chickens and chorizo, each piece priced by the pound.'],
    ['Todo cortado esta madrugada. Lo mejor se guarda para los clientes de siempre.', 'All cut at dawn. The best is saved for the regulars.'],
  ],
  meds: [
    ['Vacunas e insulina guardadas al frío. Un letrero dice: «No abrir sin necesidad».', 'Vaccines and insulin kept cold. A sign says: "Do not open unless needed."'],
  ],
  stove: [
    ['Una olla de sopa de lentejas hierve a fuego lento. Huele a ajo y cilantro.', 'A pot of lentil soup simmers. It smells of garlic and cilantro.'],
    ['En la olla grande hay arroz, y en la de al lado, frijoles para la noche.', 'The big pot holds rice; the one beside it, beans for tonight.'],
    ['La estufa está tibia: alguien acaba de hacer el tinto.', 'The stove is still warm: someone just made coffee.'],
  ],
  tv: [
    ['El noticiero de la noche: «…y el alcalde inauguró hoy el nuevo parque de la comuna».', 'The evening news: "...and the mayor opened the new district park today."'],
    ['Partido en vivo: el equipo local ataca por la banda y el narrador se queda sin voz.', 'A live match: the home side attacks down the wing and the commentator loses his voice.'],
    ['La novela de las ocho: una mujer llora junto a una ventana y alguien llega con una carta.', "The eight o'clock soap opera: a woman cries by a window and someone arrives with a letter."],
    ['Un concurso de cocina: tres señoras discuten por la sal de un sancocho.', 'A cooking contest: three ladies argue about the salt in a sancocho.'],
  ],
  radio: [
    ['Suena una cumbia y el locutor saluda a «los oyentes del barrio, desde la loma hasta la plaza».', 'A cumbia plays and the host greets "listeners of the barrio, from the hill to the square".'],
    ['Un bolero antiguo, con la voz rota por la estática de la antena.', "An old bolero, its voice cracked by the antenna's static."],
    ['Noticias del tráfico: «Cuidado en la calle de las escalas, hay un derrumbe pequeño».', 'Traffic news: "Careful on the street of the stairs, there is a small landslide."'],
  ],
  canary: [
    ['Le silbas y el canario responde con tres trinos largos, muy orgulloso.', 'You whistle and the canary answers with three long trills, very proud.'],
    ['El canario te mira de lado y salta al otro palito.', 'The canary eyes you sideways and hops to the other perch.'],
  ],
  cat: [
    ['El gato abre un ojo, ronronea y vuelve a dormirse en el sol.', 'The cat opens one eye, purrs and goes back to sleep in the sun.'],
    ['Te huele los dedos, decide que no eres comida y sigue lamiéndose la pata.', 'It sniffs your fingers, decides you are not food and carries on licking its paw.'],
  ],
  dog: [
    ['El perro mueve la cola sin levantarse. Aquí todos son amigos.', 'The dog wags its tail without getting up. Everyone here is a friend.'],
    ['Suspira hondo y apoya la cabeza en tu zapato.', 'It sighs deeply and rests its head on your shoe.'],
  ],
  guitar: [
    ['Rasgas dos acordes: está un poco desafinada, pero suena alegre.', 'You strum two chords: a little out of tune, but cheerful.'],
  ],
  sewing: [
    ['Pedaleas despacio. La aguja deja una costura recta en un retazo azul.', 'You pedal slowly. The needle leaves a straight seam on a blue scrap.'],
  ],
  altar: [
    ['Velas, una Virgen del Carmen y una foto en blanco y negro. Rezas un momento en silencio.', 'Candles, a Virgin of Carmen and a black-and-white photo. You pray quietly for a moment.'],
    ['Flores de plástico, un rosario colgado y un vaso de agua para los difuntos.', 'Plastic flowers, a hanging rosary and a glass of water for the departed.'],
  ],
  chapel: [
    ['Un padrenuestro susurrado resuena bajo el techo de la capilla.', 'A whispered Our Father echoes under the chapel roof.'],
    ['El altar huele a cera y a flores frescas. Alguien limpió esta mañana.', 'The altar smells of wax and fresh flowers. Someone cleaned this morning.'],
  ],
  candle: [
    ['Enciendes una vela por alguien que no está. La llama tiembla un momento y se queda quieta.', 'You light a candle for someone who is not here. The flame trembles, then settles.'],
  ],
  pigeons: [
    ['Las palomas arrullan en el palomar; una saca la cabeza y te mira.', 'The pigeons coo in the loft; one pokes out its head to look at you.'],
  ],
  wardrobe: [
    ['Ropa doblada con cuidado y bolitas de naftalina entre las prendas.', 'Neatly folded clothes with mothballs between the layers.'],
    ['Camisas de domingo en ganchos y un abrigo que nadie usa: aquí nunca hace tanto frío.', 'Sunday shirts on hangers and a coat nobody wears: it is never that cold here.'],
  ],
  trunk: [
    ['Cartas atadas con una cinta, un boletín de notas de 1987 y un zapatico de bebé.', 'Letters tied with a ribbon, a 1987 report card and a baby shoe.'],
  ],
  dresser: [
    ['Cajones con medias sueltas, un cepillo de pelo y una estampita de San Judas.', 'Drawers of loose socks, a hairbrush and a holy card of Saint Jude.'],
  ],
  tap: [
    ['Abres el grifo: sale un hilito de agua. Hoy sí hay agua; mañana no se sabe.', 'You open the tap: a thin thread of water. There is water today; tomorrow, who knows.'],
    ['El agua sale fría y con aire. Llenas un balde por si acaso.', 'The water comes out cold and spluttering. You fill a bucket just in case.'],
  ],
  toilet: [
    ['Jalas la cadena y el tanque ruge. En este barrio las tuberías también cantan.', 'You pull the chain and the tank roars. In this barrio the pipes sing too.'],
  ],
  mirror: [
    ['Te ves en el espejo: el pelo revuelto y polvo de la calle en la camisa.', 'You see yourself in the mirror: messy hair and street dust on your shirt.'],
  ],
  books: [
    ['Novelas de bolsillo, un diccionario gordo y un atlas con las tapas rotas.', 'Pocket novels, a fat dictionary and an atlas with torn covers.'],
    ['Cuadernos de colegio con las tareas de matemáticas bien subrayadas.', 'School notebooks with the maths homework neatly underlined.'],
  ],
  desk: [
    ['Lápices mordidos, una calculadora y una lista de cosas por hacer.', 'Chewed pencils, a calculator and a to-do list.'],
    ['Una lámpara de escritorio, un cuaderno abierto y una taza de tinto frío.', 'A desk lamp, an open notebook and a cup of cold coffee.'],
  ],
  pc: [
    ['El computador zumba. En la pantalla: un trabajo de la universidad a medio escribir.', 'The computer hums. On screen: a half-written university essay.'],
  ],
  phone: [
    ['Descuelgas el teléfono: solo el tono. Alguien apuntó un número en la pared.', 'You lift the phone: just the dial tone. Someone wrote a number on the wall.'],
  ],
  bag: [
    ['La maleta del colegio: cuadernos, un lápiz sin punta y media empanada envuelta en servilleta.', 'The school bag: notebooks, a blunt pencil and half an empanada wrapped in a napkin.'],
  ],
  toys: [
    ['Bloques de colores en el piso: alguien estaba construyendo un castillo.', 'Coloured blocks on the floor: someone was building a castle.'],
  ],
  thermos: [
    ['Te sirves un tinto del termo: caliente, dulce y muy negro.', 'You pour a tinto from the thermos: hot, sweet and very black.'],
  ],
  bread: [
    ['Una canasta de pan tapada con un paño. Todavía está tibio.', 'A bread basket under a cloth. It is still warm.'],
  ],
  kettle: [
    ['La pava aún tiene agua caliente. Alguien preparó aguapanela hace un rato.', 'The kettle still holds hot water. Someone made panela water a moment ago.'],
  ],
  // pictures and papers on the walls
  photo_family: [
    ['Una foto de familia: todos en fila y el más pequeño hace una mueca.', 'A family photo: everyone lined up and the youngest pulling a face.'],
  ],
  photo_wedding: [
    ['La pareja del matrimonio, joven y seria, frente a una iglesia pintada de blanco.', 'The wedding couple, young and serious, in front of a whitewashed church.'],
  ],
  photo_grad: [
    ['Un grado de bachiller: la toga es prestada y la sonrisa, enorme.', 'A high-school graduation: the gown is borrowed and the grin enormous.'],
  ],
  photo_collage: [
    ['Un collage de fotos: bautizos, cumpleaños y un paseo al río con todos los primos.', 'A photo collage: baptisms, birthdays and a river trip with all the cousins.'],
  ],
  kids_drawing: [
    ['Un dibujo: la casa, el sol con gafas y la familia de palitos.', 'A drawing: the house, a sun with sunglasses and a stick-figure family.'],
  ],
  diploma: [
    ['Diploma de técnico en electricidad, enmarcado con mucho orgullo.', 'A diploma in electrical technology, framed with great pride.'],
  ],
  exam_notes: [
    ['Apuntes pegados con cinta: fórmulas, fechas y un «¡TÚ PUEDES!» subrayado dos veces.', 'Notes taped up: formulas, dates and a "YOU CAN DO IT!" underlined twice.'],
  ],
  chores: [
    ['Lista de oficios: lunes barre Camila, martes lava Juan, miércoles cocina mamá.', 'Chore chart: Monday Camila sweeps, Tuesday Juan washes up, Wednesday mum cooks.'],
  ],
  notice_rent: [
    ['«Se arrienda pieza con baño. Preguntar por doña Elvira». Hay un teléfono anotado a mano.', '"Room with bathroom for rent. Ask for doña Elvira." A phone number is handwritten.'],
  ],
  calendar: [
    ['El calendario marca octubre; el día de la quincena tiene un círculo rojo.', 'The calendar shows October; payday is circled in red.'],
  ],
  picture_landscape: [
    ['Un paisaje de montañas verdes con una casita y humo en la chimenea.', 'A landscape of green mountains with a little house and smoke from the chimney.'],
  ],
  picture_coast: [
    ['Una playa con palmeras. Nadie en esta casa ha visto el mar.', 'A beach with palm trees. Nobody in this house has ever seen the sea.'],
  ],
  picture_flowers: [
    ['Un jarrón de flores amarillas pintado al óleo: un regalo de bodas.', 'An oil painting of yellow flowers in a vase: a wedding present.'],
  ],
  picture_virgin: [
    ['La Virgen del Carmen, patrona de los conductores, te mira con las manos abiertas.', 'The Virgin of Carmen, patron of drivers, looks at you with open hands.'],
  ],
  picture_heart: [
    ['El Sagrado Corazón. Una vela eléctrica parpadea al lado.', 'The Sacred Heart. An electric candle blinks beside it.'],
  ],
  picture_saint: [
    ['San Judas Tadeo, el santo de las causas difíciles.', 'Saint Jude, patron of lost causes.'],
  ],
  blessing: [
    ['«Bendice, Señor, este hogar»: un letrero más viejo que los hijos.', '"Bless this home, Lord": a sign older than the children.'],
  ],
  stations: [
    ['Una estación del Vía Crucis tallada en yeso: Jesús cae por primera vez.', 'A Station of the Cross carved in plaster: Jesus falls for the first time.'],
  ],
  poster_football: [
    ['Un afiche del torneo: «Copa Ladera, sábado 4 p. m.», con las alineaciones.', 'A tournament poster: "Copa Ladera, Saturday 4 pm", with the line-ups.'],
  ],
  poster_music: [
    ['Un afiche de un concierto de cumbia. La fecha ya pasó, pero nadie lo quita.', 'A cumbia concert poster. The date has passed, but nobody takes it down.'],
  ],
  poster_map: [
    ['Un mapa de Colombia con chinches rojos donde viven los parientes.', 'A map of Colombia with red pins where the relatives live.'],
  ],
  price_list: [
    ['Lista de precios escrita a mano: los números están tachados y corregidos.', 'A handwritten price list: the numbers are crossed out and corrected.'],
  ],
  menu_board: [
    ['El menú del día: sopa, seco y jugo. Todo por poca plata.', 'The set menu: soup, main course and juice. All for very little.'],
  ],
  chalkboard: [
    ['En el tablero quedó la fecha, una tabla de multiplicar y un corazón dibujado por la profesora.', "On the board: the date, a multiplication table and a heart drawn by the teacher."],
  ],
  flag_co: [
    ['La bandera de Colombia: amarillo, azul y rojo, con el cordón del asta.', 'The Colombian flag: yellow, blue and red, with the pole cord.'],
  ],
  school_chart: [
    ['Una cartelera del curso: abecedario, números y un horario con los recreos marcados.', 'A class wall chart: alphabet, numbers and a timetable with the breaks marked.'],
  ],
  clinic_chart: [
    ['Una cartilla del puesto de salud: lavarse las manos, vacunas y cuándo ir al médico.', 'A health-post chart: washing hands, vaccines and when to see a doctor.'],
  ],
  exam_bed: [
    ['La camilla está cubierta con papel limpio. El doctor atiende de lunes a sábado.', 'The exam bed is covered with clean paper. The doctor sees patients Monday to Saturday.'],
  ],
  // behind the counter of every shop type
  shop_tienda: [['Una vitrina con dulces sueltos, cigarrillos por unidad y un cuaderno del fiado bajo el vidrio.', 'A glass case of loose sweets, single cigarettes and a credit notebook under the glass.']],
  shop_panaderia: [['Pan de bono, almojábanas y roscones recién salidos del horno. Huele a mantequilla.', 'Pan de bono, almojábanas and sweet rolls fresh from the oven. It smells of butter.']],
  shop_fruver: [['Mangos, lulos, tomate de árbol y aguacates, todo a precio de plaza.', 'Mangoes, lulos, tree tomatoes and avocados, all at market prices.']],
  shop_carniceria: [['Carne de res, cerdo y pollo cortados al momento; el carnicero pesa en una báscula antigua.', 'Beef, pork and chicken cut to order; the butcher weighs on an old scale.']],
  shop_peluqueria: [['Tijeras, peines y una máquina de afeitar; en el espejo, fotos de cortes de moda.', 'Scissors, combs and a clipper; on the mirror, photos of fashionable cuts.']],
  shop_papeleria: [['Cuadernos, cartulinas y lapiceros por unidad. Un cartel: «Fotocopias a $100».', 'Notebooks, poster board and single pens. A sign: "Photocopies at $100".']],
  shop_drogueria: [['Jarabes, acetaminofén suelto y cremas; la droguera conoce a cada vecino por su dolencia.', 'Syrups, loose paracetamol and creams; the pharmacist knows every neighbour by their ailment.']],
  shop_zapateria: [['Zapatos remendados con cola y pespunte, cada par con un papelito con el nombre del dueño.', "Shoes mended with glue and stitching, each pair with a slip bearing the owner's name."]],
  shop_modista: [['Telas por metro, hilos de todos los colores y un vestido rosado a medio coser.', 'Fabric by the metre, threads of every colour and a half-sewn pink dress.']],
  shop_ferreteria: [['Tornillos por unidad, cemento, tubos y una pared llena de herramientas colgadas.', 'Screws by the piece, cement, pipes and a wall of hanging tools.']],
  shop_taller: [['Una moto desarmada, una llave inglesa y un olor a aceite y gasolina.', 'A stripped motorbike, a wrench and a smell of oil and petrol.']],
  shop_cafe: [['Un termo grande de tinto y vasitos de plástico: así empieza el día del barrio.', "A big thermos of tinto and plastic cups: this is how the barrio's day begins."]],
  shop_restaurante: [['La olla grande de sancocho humea; el menú del día está escrito en el tablero.', 'The big sancocho pot steams; the set menu is written on the board.']],
  shop_minutos: [['Cabinas con teléfono y un letrero: «Minutos a todo operador, a Venezuela y España».', 'Phone booths and a sign: "Minutes to any network, to Venezuela and Spain".']],
};

/** Tiny stories of a home, found by walking up to the object that tells them. Keyed by the object; `kind` is the journal icon. */
export const STORY = {
  altar_home: { name: 'El rincón de la abuela', en: 'A grandmother\'s corner: candles, the Virgin of Carmen and a photo of her late husband.', kind: 'shrine' },
  cage_canary: { name: 'El canario del abuelo', en: 'The canary sings before the radio does; the old man talked to it every morning.', kind: 'object' },
  guitar_lean: { name: 'La guitarra del tío', en: "Uncle's guitar leans by the wall, waiting for Sunday's family lunch.", kind: 'object' },
  toy_pile: { name: 'Juego interrumpido', en: 'Toy blocks left mid-game: someone small was called to lunch.', kind: 'story' },
  'decal:exam_notes': { name: 'Apuntes para el examen', en: "Notes taped up for tomorrow's exam: someone here wants to be the first in the family at university.", kind: 'story' },
  desk_student: { name: 'El escritorio del estudiante', en: 'A desk crowded with notes: the whole house tiptoes at exam time.', kind: 'story' },
  'decal:photo_wedding': { name: 'La foto del matrimonio', en: 'A wedding photo from the nineties, on the wall of a house built brick by brick since.', kind: 'story' },
  pigeon_loft: { name: 'El palomar del techo', en: 'Pigeons kept on the roof: a hobby passed down from father to son.', kind: 'object' },
  cat_sitting: { name: 'El gato del sol', en: 'The house cat sleeps wherever the sun lands.', kind: 'object' },
  dog_sleeping: { name: 'El perro guardián', en: 'The family dog sleeps through everything except the sound of the gate.', kind: 'object' },
  rocking_chair: { name: 'La mecedora', en: "Grandmother's rocking chair faces the window: she watches the whole street from here.", kind: 'story' },
  sewing_machine: { name: 'La máquina de coser', en: 'The sewing machine paid for three school uniforms this year.', kind: 'story' },
  chest_trunk: { name: 'El baúl de los recuerdos', en: 'Letters, report cards and a baby shoe: the family archive lives in a trunk.', kind: 'hidden' },
  bed_crib: { name: 'La cuna pintada a mano', en: 'A second-hand crib, repainted blue by the father on a Sunday.', kind: 'story' },
  bed_bunk: { name: 'Las literas', en: 'Two brothers, one bunk bed: the top bunk was won in an argument years ago.', kind: 'story' },
  radio_old: { name: 'La radio de las tardes', en: 'Boleros every afternoon: nobody dares touch the dial.', kind: 'object' },
  tv_crt: { name: 'El televisor de siempre', en: 'A tube TV that survived the digital switch, kept alive for the football.', kind: 'object' },
  thermos_set: { name: 'El termo de tinto', en: 'Coffee is the household clock: the thermos is filled before anyone says good morning.', kind: 'object' },
  drying_rack: { name: 'La ropa al sol', en: 'Washing hung out to dry: the barrio tells the weather by the colour of its sheets.', kind: 'story' },
  school_bag: { name: 'La maleta del colegio', en: 'A school bag dropped by the door: homework comes after dinner, always.', kind: 'story' },
  'decal:notice_rent': { name: 'Se arrienda', en: 'A "for rent" sign on the wall: rooms in this house are let by the month.', kind: 'story' },
  'decal:chores': { name: 'La lista de oficios', en: 'A chore chart on the wall: who sweeps, who washes, who cooks. The kids argue about it weekly.', kind: 'story' },
  pot_stack: { name: 'La olla del almuerzo', en: 'A pot of lentil soup has been simmering since seven; lunch is at one.', kind: 'story' },
  mattress_floor: { name: 'La obra negra', en: 'A family lives in an unfinished house while they save for the next floor, one bag of cement at a time.', kind: 'story' },
  'decal:diploma': { name: 'El diploma enmarcado', en: 'The first diploma of the family, framed above the best chair.', kind: 'story' },
  'decal:kids_drawing_a': { name: 'El dibujo de la nevera', en: 'A child drew the whole family and put the dog in the middle.', kind: 'story' },
  'decal:picture_coast': { name: 'El mar de la pared', en: 'A beach picture hangs here; nobody in the house has ever seen the sea.', kind: 'story' },
  candles_set: { name: 'La vela de la esquina', en: 'A candle kept burning for someone who is far away.', kind: 'shrine' },
  lamp_floor: { name: 'La lámpara de leer', en: 'Everybody reads under this lamp, and nobody admits who bought it.', kind: 'object' },
  trophy_football: { name: 'El trofeo del barrio', en: 'A small football trophy: the team of the hill won the cup once, in 2009.', kind: 'story' },
  bed_double: { name: 'La cama de matrimonio', en: 'The big bed was a wedding gift; a heart is scratched into the headboard.', kind: 'story' },
  nightstand_a: { name: 'La mesita de noche', en: 'A rosary, a glass of water and an alarm clock that is always ten minutes fast.', kind: 'object' },
  wardrobe_2: { name: 'El uniforme planchado', en: 'A school uniform hangs ironed for tomorrow, the badge sewn on by hand.', kind: 'story' },
  fridge: { name: 'La nevera de los imanes', en: 'Magnets from Cartagena, Medellín and Bogotá: souvenirs of trips other people took.', kind: 'object' },
  stove_gas: { name: 'La estufa de dos puestos', en: 'Two burners and a gas bottle that must last until payday on the fifteenth.', kind: 'story' },
  table_formica_4: { name: 'La mesa del comedor', en: 'Four chairs, one always empty: the father works the night shift.', kind: 'story' },
  sofa_3_vinyl: { name: 'El forro del sofá', en: 'The sofa still wears its plastic cover, saved for visitors who never dare sit on it.', kind: 'object' },
  plant_pot_clay: { name: 'La mata de la sala', en: "The plant began as a cutting from grandmother's patio in the countryside.", kind: 'object' },
  water_stand: { name: 'El agua por turnos', en: 'Buckets are filled whenever the water comes: a mark on the wall shows how much is left.', kind: 'story' },
  bed_single: { name: 'El cuarto del hijo mayor', en: 'Football posters and a bed that is never made: a teenager lives here.', kind: 'story' },
  dish_rack: { name: 'El escurridor', en: 'Four plates, four cups: you can count the family in the dish rack.', kind: 'object' },
  washing_machine: { name: 'La lavadora prestada', en: 'Three families share one washing machine and keep a strict schedule pinned to the door.', kind: 'story' },
  fan_stand: { name: 'El ventilador de pedestal', en: 'It follows the family from room to room, wherever the afternoon is hottest.', kind: 'object' },
  rug_big: { name: 'La alfombra de la sala', en: 'The rug hides a stain nobody talks about: the Christmas of the broken lamp.', kind: 'story' },
  bread_basket: { name: 'El pan de la mañana', en: 'The bread is bought fresh at four every morning from the bakery up the hill.', kind: 'story' },
};

/** Items that tell the same story as another (so every wardrobe or sofa model can be the hook). */
export const STORY_ALIAS = {
  bed_double_wood: 'bed_double', nightstand_b: 'nightstand_a', wardrobe_3: 'wardrobe_2', wardrobe_metal: 'wardrobe_2', fridge_small: 'fridge',
  sofa_3_fabric: 'sofa_3_vinyl', sofa_2_vinyl: 'sofa_3_vinyl', sofa_2_fabric: 'sofa_3_vinyl', table_formica_6: 'table_formica_4', plant_big: 'plant_pot_clay',
  bed_single_metal: 'bed_single', lamp_table: 'lamp_floor', radio_boombox: 'radio_old', rug_small: 'rug_big', 'decal:kids_drawing_b': 'decal:kids_drawing_a',
};
/** How likely an object is picked as a home's story: 3 = unusual and charming, 1 = something every house has. */
export const STORY_WEIGHT = {
  altar_home: 3, cage_canary: 3, guitar_lean: 3, rocking_chair: 3, sewing_machine: 3, pigeon_loft: 3, 'decal:exam_notes': 3, 'decal:photo_wedding': 3, desk_student: 3,
  radio_old: 3, trophy_football: 3, bed_bunk: 3, bed_crib: 3, chest_trunk: 3, washing_machine: 3, 'decal:diploma': 3,
  drying_rack: 1, thermos_set: 1, lamp_floor: 1, school_bag: 1, toy_pile: 1, pot_stack: 1, 'decal:picture_coast': 1, candles_set: 1, 'decal:kids_drawing_a': 1, 'decal:chores': 1,
  'decal:notice_rent': 1, dish_rack: 1, plant_pot_clay: 1, rug_big: 1, fridge: 1, stove_gas: 1, bed_single: 1, fan_stand: 1,
};

/** What each shop type tells (counter side). */
export const SHOP_STORY = {
  tienda: { name: 'El cuaderno del fiado', en: 'A notebook of unpaid debts: neighbours buy on credit until payday.', kind: 'story' },
  panaderia: { name: 'El pan de las cuatro', en: 'The bread comes out of the oven at four every afternoon, and half the street turns up to buy it.', kind: 'story' },
  fruver: { name: 'Fruta de la plaza', en: 'Mangoes, lulos and tomatoes arrive at dawn from the market in sacks.', kind: 'story' },
  carniceria: { name: 'El cuchillo del carnicero', en: 'The butcher sharpens his knife every morning; the best cuts are kept for the regulars.', kind: 'story' },
  peluqueria: { name: 'Cortes del barrio', en: 'Faded photos of haircuts on the mirror: every young man of the barrio has sat in this chair.', kind: 'story' },
  papeleria: { name: 'Fotocopias a cien pesos', en: 'Students queue before school for photocopies and poster board.', kind: 'story' },
  drogueria: { name: 'La droguería de turno', en: 'The pharmacist knows every neighbour by their ailment, and sells pills one at a time.', kind: 'story' },
  zapateria: { name: 'Zapatos esperando dueño', en: 'Shoes repaired and never collected: a shelf of absent customers.', kind: 'story' },
  modista: { name: 'Un vestido de quinceañera', en: "A pink dress pinned on the mannequin, due Saturday for a girl's fifteenth birthday.", kind: 'story' },
  ferreteria: { name: 'Tornillos por unidad', en: 'The hardware store sells screws one at a time: the barrio builds slowly, a few pesos at a time.', kind: 'story' },
  taller: { name: 'La moto de don Jaime', en: 'A motorbike taxi waits for its brake pads; his whole livelihood runs on two wheels.', kind: 'story' },
  cafe: { name: 'El tinto de las cinco', en: "Black coffee in tiny cups: the barrio's morning news is traded here.", kind: 'story' },
  restaurante: { name: 'El almuerzo corriente', en: 'Soup, rice, beans and a piece of meat: the set lunch feeds half the local workers.', kind: 'story' },
  minutos: { name: 'Minutos a Venezuela', en: 'Phone booths for calls to relatives abroad: the barrio\'s line to far-off family.', kind: 'story' },
};

/** Places with their own story (the room itself): keyed by lot kind. Each entry: { room: room type list, hook: catalogue name or decal, ... } */
export const PLACE_STORY = {
  chapel: [
    { hook: 'altar_main', name: 'La capilla del barrio', en: 'Built by the neighbours on Sundays, stone by stone; the bell came from a demolished church.', kind: 'shrine' },
    { hook: 'candle_rack', name: 'Los milagritos', en: 'Tiny metal arms, legs and hearts pinned near the saint: thanks for prayers answered.', kind: 'shrine' },
  ],
  school: [
    { hook: 'decal:chalkboard', name: 'El tablero del lunes', en: 'Monday morning: the date, a multiplication table and a heart drawn by the teacher.', kind: 'room' },
    { hook: 'decal:kids_drawing_a', name: 'Dibujos de primer grado', en: 'First-graders drew their families; one drew the whole barrio, with the hill in the middle.', kind: 'story' },
    { hook: 'decal:flag_co', name: 'La bandera del acto cívico', en: 'The flag waits for Monday\'s assembly, when the whole school sings the anthem out of tune.', kind: 'story' },
  ],
  clinic: [
    { hook: 'exam_bed', name: 'El turno del doctor', en: 'One doctor, six days a week: half the barrio has been checked on this bed.', kind: 'room' },
    { hook: 'decal:vaccines', name: 'La cartilla de vacunas', en: 'A wall chart of vaccines, and a child\'s sticker on every completed row.', kind: 'story' },
  ],
  hall: [
    { hook: 'trophy_case', name: 'El salón comunal', en: 'The neighbourhood council meets here; the trophies are from a tournament nobody remembers who organised.', kind: 'room' },
  ],
  tenement: [
    { hook: 'stove_gas', name: 'Una estufa para cuatro familias', en: 'One gas stove serves four families, who take turns and keep careful count of the gas.', kind: 'story' },
  ],
};
