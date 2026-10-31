// First names and surnames for the residents who are NOT a member of one of the interiors' households (people/personas.js makeName: the fallback when no household has a free place for
// the persona). A resident who lives in a household takes that household's names (js/interiors/household.js + names.js, cast.js), so a diary, a paper and the person who answers the
// door say the same name; these pools are only for the rest. PURE data (no THREE, no DOM).
//
// An Andean barrio of Colombian families with some Venezuelan, Peruvian and Ecuadorian neighbours. Six pools, by who the name is for: women / men (of an age to have children at home),
// elder women / elder men (the generation of the grandparents), girls / boys (the children and teenagers), and the surnames. A first name is in ONE pool, so it has ONE gender:
//   genderOf('Camila') -> 'f'    genderOf('Libardo') -> 'm'    genderOf('Zzz') -> null

// Names the interiors' texts already use for somebody else (a neighbour in a diary, a saint, a funeral card), and words that read badly as a surname: a household never has them,
// so a diary written by one resident never names another resident by accident (interiors/content.js: "secondary people come from OUTSIDE the household pool").
const OUT = new Set(['Marcela', 'Leidy', 'Daniela', 'Milagros', 'Teresa', 'Yolanda', 'Nelly', 'Elvira', 'Cleotilde', 'Carmen', 'Lucía', 'Yulieth', 'Carlos', 'Julián', 'Yeison', 'Brayan',
  'Jaime', 'Heriberto', 'Rigoberto', 'Anselmo', 'Eliécer', 'Segundo', 'Ernesto', 'Cristóbal', 'Jesús', 'José',
  'Yepes', 'Bermúdez', 'Rodríguez', 'Niño', 'Plata', 'Parada', 'Ramos', 'Pito']);
const L = (s) => s.split(',').map((x) => x.trim()).filter((x) => x && !OUT.has(x));

export const WOMEN = L(`Claudia, Diana, Marcela, Johanna, Paola, Liliana, Sandra, Adriana, Viviana, Katherine, Carolina, Natalia, Alejandra, Lorena, Yesenia, Yuliana, Leidy, Dayana,
  Jennifer, Andrea, Mónica, Paula, Tatiana, Maritza, Yaneth, Nancy, Luz Dary, Luz Adriana, Luz Elena, Martha Lucía, Gloria Inés, Patricia, Rocío, Erika, Daniela, Ángela, Ximena,
  Catalina, Verónica, Jessica, Sonia, Yamile, Yolima, Nidia, Zulma, Judith, Marisol, Magda, Mireya, Deisy, Sulay, Yudy, Juliana, Estefanía, Laura, Ingrid, Alexandra, Lina, Maribel,
  Leonor, Rosmery, Dora, Elsa, Ofelia, Ana María, María Eugenia, Sandra Milena, Diana Carolina, Yuri, Karen, Lizeth, Mayerly, Heidy, Angie, Kelly, Johana, Paola Andrea,
  Luisa Fernanda, Edna, Esneda, Gladys, Janeth, Yenny, Yamileth, Ruby, Olga Lucía, Nohemí, Marlén, Maryory, Nathalia, Tania, Silvia, Rosario,
  Yuraima, Yolimar, Yusmary, Maryuri, Génesis, Yorbelis, Yaritza, Dayanara,
  Milagros, Lourdes, Nélida, Mirtha, Julissa, Yessenia, Shirley, Dina,
  Narcisa, Mariuxi, Jessenia, Mercy, Carmita, Jenny, Rosita, Mayra`);
export const MEN = L(`Andrés, Carlos, Juan Carlos, Jhon Fredy, Diego, Camilo, Fabián, Óscar, Julián, Cristian, Edwin, Wilmer, Éder, Yeison, Alexander, Sergio, Miguel Ángel, Luis Fernando,
  Jorge Iván, Mauricio, Iván, Nelson, Harold, Leonardo, Giovanny, Duván, Brayan, Fredy, Albeiro, Elkin, Rubén, Víctor, Alberto, Fernando, Rodrigo, Javier, Ricardo, Raúl, Armando,
  Danilo, Dairo, Jáder, Yimmy, Wílmar, Édgar, Henry, Jaime, Mario, Pablo, Rómulo, Heriberto, César, Wálter, Johan, Jhonatan, Yorman, Luis Alberto, Carlos Andrés, John Jairo,
  Jhon Edison, Edison, Anderson, Deyvi, Yovany, Yesid, Libio, Norberto, Humberto, Ezequiel, Gerson, Alexis, Ómar, Rafael, Ángel, Efrén, Fáber, Dagoberto, Rider, Maicol,
  Yeferson, Stiven, Jean Carlos, Yordan, Alfonso, Mauro,
  Yender, Jhoandry, Franklin, Leonel, Wuilmer, Eliú,
  Percy, Wilder, Abel, Elmer, Cleiner, Rolando,
  Byron, Jefferson, Kléber, Marlon, Édison Paul, Galo Andrés`);
export const ELDER_WOMEN = L(`Rosa, Rosalba, Gilma, Amparo, Luz Marina, Nubia, Marleny, Esperanza, Consuelo, Ligia, Carmenza, Edilma, Fanny, Aura, Blanca, Teresa, Mariela, Stella, Yolanda,
  Beatriz, Doris, Alba, Nelly, Mercedes, Elvira, Clemencia, Piedad, Emperatriz, Hilda, Olga, Marina, Lucila, Cecilia, Eulalia, Zoila, Ernestina, Cleotilde, Tulia, Fidelina,
  Rubiela, Rosalía, Dolly, Betty, Inés, Graciela, Herminia, Matilde, Josefina, Ester, Aminta, Briceida, Maruja, Ubaldina, Leonilde, Raquel, Noemí, Florinda, Bertha, Libia,
  Nohora, Sixta, Delfina, Evangelina, Carmen, Lucía, Celmira, Ana Rita, Belarmina, Margarita, Alicia, Flor Alba, Myriam, Ruth, Soledad, Pilar, Dolores, Gloria`);
export const ELDER_MEN = L(`Hernán, Alirio, Ramiro, Gonzalo, Libardo, Aníbal, Evelio, Jairo, Octavio, Wilson, Néstor, Hernando, Fabio, Arturo, Gilberto, Álvaro, Héctor, Orlando, Eduardo,
  Rigoberto, Hugo, Jesús, Reinaldo, Gustavo, Misael, Darío, Bernardo, Adolfo, Abelardo, Anselmo, Aristides, Belisario, Cándido, Celso, Ciro, Cleofás, Demetrio, Eliécer, Efraín,
  Epifanio, Eusebio, Fidel, Fermín, Gerardo, Heliodoro, Isidro, Jacinto, Leónidas, Lisandro, Marco Tulio, Nicanor, Ovidio, Pastor, Plinio, Salvador, Teodoro, Ulises, Venancio,
  Segundo, Washington, Galo, Fausto, Luis Eduardo, José Ignacio, Manuel, José, Antonio, Pedro, Luis, Miguel, Francisco, Roberto, Guillermo, Ernesto, Alfredo, Enrique`);
export const GIRLS = L(`Valentina, Sofía, Camila, Isabella, Luciana, Mariana, Salomé, Gabriela, Samantha, Manuela, Isabela, Sara, Antonella, Mía, Emily, María José, María Fernanda, Ana Sofía,
  Danna, Geraldine, Allison, Karol, Ashly, Luna, Violeta, Zoe, Amelia, Ariana, Alana, Dulce María, Maite, Nicol, Valery, Mikaela, Jazmín, Maryori, Michell, Yurani, Brigitte, Shaira,
  Thaliana, Jhoselin, Sharon, Kimberly, Dana, Lía, Emma, Renata, Fiorella, Yulieth, Mayte, Ivanna, Yasmín, Liseth, Aleja, Nayeli, Paulina, Ámbar, Briana, Sabrina, Abigail, Tamara, Eliana`);
export const BOYS = L(`Santiago, Mateo, Juan David, Sebastián, Samuel, Emmanuel, Esteban, Nicolás, Kevin, Matías, Thiago, Juan Pablo, Juan Camilo, Juan José, Alejandro, Daniel, David, Adrián,
  Joaquín, Emiliano, Dylan, Jeison, Steven, Isaac, Ian, Liam, Lucas, Gael, Simón, Felipe, Martín, Josué, Benjamín, Bryan, Jhoan, Yostin, Dilan, Santino, Elián, Jerónimo, Maximiliano,
  Cristóbal, Dante, Jhon Alexander, Jean Pierre, Johan Sebastián, Kenneth, Anthony, Brandon, Cristofer, Damián, Darwin, Eithan, Fabricio, Gabriel, Ignacio, Jacobo, Luis Miguel, Tomás,
  Óliver, Sneider, Thomas, Yeider, Yilmar, Zahir`);
export const SURNAMES = L(`Restrepo, Gómez, Zapata, Ospina, Cardona, Valencia, Mejía, Quintero, Giraldo, Arango, Londoño, Montoya, Henao, Echeverri, Bedoya, Posada, Agudelo, Castaño, Duque, Ocampo,
  Betancur, Escobar, Marín, Jaramillo, Uribe, Orozco, Jiménez, Velásquez, Gallego, Franco, Correa, Naranjo, Osorio, Vélez, Cadavid, Hoyos, Mesa, Muriel, Orrego, Saldarriaga, Sierra,
  Tamayo, Toro, Upegui, Vásquez, Arboleda, Cano, Pineda, Ramírez, Rendón, Ríos, Roldán, Rúa, Sánchez, Santamaría, Serna, Soto, Suárez, Trujillo, Úsuga, Villa, Yepes, Zuluaga,
  Aristizábal, Atehortúa, Alzate, Amaya, Bermúdez, Botero, Builes, Carmona, Ceballos, Chavarría, Cuartas, Estrada, Foronda, Galeano, Garcés, Gaviria, Gil, Granada, Isaza, Lopera, Lotero,
  Maya, Mazo, Moncada, Monsalve, Múnera, Noreña, Palacio, Patiño, Piedrahíta, Quiceno, Ramos, Rivera, Salazar, Torres, Valderrama, Zea,
  Rincón, Becerra, Beltrán, Camacho, Cifuentes, Cuervo, Forero, Garzón, Gaitán, Lozano, Mahecha, Niño, Pardo, Peña, Prieto, Roa, Rueda, Sandoval, Tovar, Triana, Useche, Bernal, Barreto,
  Bustos, Cárdenas, Cortés, Acosta, Aguilar, Alarcón, Ardila, Avendaño, Barón, Barrera, Bautista, Buitrago, Cabrera, Cáceres, Carvajal, Castellanos, Chaparro, Díaz, Duarte, Fonseca,
  Galvis, García, Gutiérrez, Guzmán, Herrera, Jaimes, Leal, Lizarazo, Mantilla, Martínez, Molina, Mora, Moya, Navas, Núñez, Ortega, Pacheco, Parra, Pedraza, Plata, Quiroga,
  Quijano, Reyes, Rojas, Romero, Sarmiento, Silva, Solano, Tarazona, Téllez, Ussa, Vargas, Villamizar, Villate, Zárate, Mendoza,
  Benavides, Burbano, Chamorro, Erazo, Guerrero, Ibarra, Insuasty, Jojoa, Melo, Narváez, Paz, Pantoja, Rosero, Santacruz, Timaná, Villota, Yépez, Caicedo, Banguero, Mina, Lasso, Angulo,
  Hurtado, Mosquera, Palacios, Perea, Rentería, Asprilla, Córdoba, Mena, Quiñones, Chará, Cuero, Dagua, Collazos, Ipia, Muñoz, Tombé, Yule, Pito, Cuéllar, Ochoa, Delgado, Bolaños,
  Checa, Coral, Enríquez, Figueroa, Guevara, Lagos, Obando, Realpe, Revelo, Rodríguez, Solarte, Tulcán, Vallejo, Viveros, Zúñiga, Murillo, Mancilla, Medina,
  Barrios, Castro, Cruz, Fernández, Hernández, Lara, López, Meza, Orjuela, Polo, Pérez, Quesada, Rodado, Rosado, Saavedra, Tapias, Vergara, Arias, Cepeda, González, Aponte, Bonilla,
  Rangel, Briceño, Colmenares, Pirela, Bolívar, Rondón, Escalona, Sulbarán, Villasmil, Camejo, Linares, Maldonado, Chacón, Contreras, Quevedo, Perozo, Fuenmayor, Pernía, Morillo,
  Ferrer, Lugo, Parada, Bracho,
  Quispe, Huamán, Mamani, Condori, Flores, Chávez, Paredes, Apaza, Choque, Ticona, Huanca, Ccama, Yupanqui, Tito, Palomino, Ayala, Cusi, Pariona, Rimachi, Valdivia, Machaca, Sihuas,
  Ccopa, Layme,
  Chicaiza, Guamán, Cevallos, Tipán, Quishpe, Pilataxi, Zambrano, Vera, Intriago, Loor, Alcívar, Cuji, Toapanta, Caiza, Cumbal, Tituaña, Pillajo, Yánez, Viteri, Espín, Armijos,
  Calderón, Cabezas, Pazmiño, Tapia,
  Abril, Acevedo, Alvarado, Álvarez, Arbeláez, Arenas, Bejarano, Bohórquez, Calle, Carrillo, Castrillón, Cuesta, Dávila, Delgadillo, Espinosa, Gamboa, Garavito, Hincapié, Jurado, Laverde,
  Lemos, Machado, Marulanda, Mayorga, Mendieta, Morales, Mutis, Nieto, Olarte, Ordóñez, Páez, Pulido, Quimbayo, Robledo, Rubio, Sabogal, Samper, Tangarife, Tejada, Urrea, Valbuena,
  Varela, Velandia, Zabala, Zamora, Echavarría, Escudero, Ladino, Marmolejo`);

/** Names of the neighbours who came from Venezuela, Peru and Ecuador (the rest are Colombian): the mix the barrio is meant to have. */
export const ORIGIN = {
  VE: { first: L('Yuraima, Yolimar, Yusmary, Maryuri, Génesis, Yorbelis, Yaritza, Dayanara, Yender, Jhoandry, Franklin, Leonel, Wuilmer, Eliú'),
    sur: L('Rangel, Briceño, Colmenares, Pirela, Bolívar, Rondón, Escalona, Sulbarán, Villasmil, Camejo, Linares, Maldonado, Chacón, Contreras, Quevedo, Perozo, Fuenmayor, Pernía, Morillo, Ferrer, Lugo, Parada, Bracho') },
  PE: { first: L('Milagros, Lourdes, Nélida, Mirtha, Julissa, Yessenia, Shirley, Dina, Percy, Wilder, Abel, Elmer, Cleiner, Rolando'),
    sur: L('Quispe, Huamán, Mamani, Condori, Flores, Chávez, Paredes, Apaza, Choque, Ticona, Huanca, Ccama, Yupanqui, Tito, Palomino, Ayala, Cusi, Pariona, Rimachi, Valdivia, Machaca, Sihuas, Ccopa, Layme') },
  EC: { first: L('Narcisa, Mariuxi, Jessenia, Mercy, Carmita, Jenny, Rosita, Mayra, Byron, Jefferson, Kléber, Marlon, Édison Paul, Galo Andrés'),
    sur: L('Chicaiza, Guamán, Cevallos, Tipán, Quishpe, Pilataxi, Zambrano, Vera, Intriago, Loor, Alcívar, Cuji, Toapanta, Caiza, Cumbal, Tituaña, Pillajo, Yánez, Viteri, Espín, Armijos, Calderón, Cabezas, Pazmiño, Tapia') },
};

export const POOLS = { women: WOMEN, men: MEN, elderWomen: ELDER_WOMEN, elderMen: ELDER_MEN, girls: GIRLS, boys: BOYS, surnames: SURNAMES };
const GENDER = new Map();
for (const [pool, g] of [[WOMEN, 'f'], [ELDER_WOMEN, 'f'], [GIRLS, 'f'], [MEN, 'm'], [ELDER_MEN, 'm'], [BOYS, 'm']]) for (const n of pool) GENDER.set(n, g);
/** 'f' | 'm' for a first name of the pools, null for any other. */
export const genderOf = (name) => GENDER.get(name) ?? null;
/** Every first name the pools hold. */
export const KNOWN_FIRST = [...GENDER.keys()];
