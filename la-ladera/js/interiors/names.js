// The first names and surnames of the barrio's households (household.js draws them, content.js reads their gender). Pure data.
// Real names, a Colombian mix with a few Venezuelan, Peruvian and Ecuadorian ones; the adults are people born in the 1940s to 1990s, the children in the 2000s to 2010s.
// household.js hands them out WITHOUT replacement across the households (one shuffle per world seed, a household's place in the barrio picks the next unused name), so a name
// comes round again only after every other name of its pool has been used: the pools must be long enough that no adult name is used more than twice (tests/people-households).
// A first name is in ONE list only (a man is never also a boy). Secondary people named inside the papers (Yulieth, Brayan, Yeison, doña Berta, don Heriberto ...) are NOT here.
const L = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

export const WOMEN = L(`
Aída, Alba, Alcira, Alexandra, Alicia, Amalia, Amanda, Amelia, Amparo, Ana, Andrea, Ángela, Angélica, Araceli, Aura, Aurora, Azucena,
Beatriz, Belén, Benilde, Betty, Bibiana, Blanca, Brenda, Candelaria, Carmenza, Carolina, Cecilia, Celia, Cielo, Clara, Clarena, Claudia, Clemencia, Clotilde,
Consuelo, Constanza, Cristina, Dalila, Damaris, Deisy, Delia, Diana, Dilia, Dolores, Dora, Doris, Edilma, Edith, Elena, Eliana, Elisa, Elizabeth, Elsa, Elvia,
Emilia, Enith, Erika, Esmeralda, Esperanza, Estela, Esther, Eugenia, Eva, Fabiola, Fanny, Fátima, Flor, Florinda, Francia, Gilma, Gisela, Gladys, Gloria, Graciela, Griselda,
Hilda, Ilba, Inés, Irene, Iris, Isabel, Janeth, Jazmín, Jenny, Jessica, Johana, Josefina, Juana, Judith, Julia, Karen, Leonor, Leticia, Libia, Lida, Lidia, Ligia,
Liliana, Lina, Lorena, Lucero, Lucía, Luisa, Magaly, Magdalena, Margarita, Maribel, Marina, Marisol, Marleny, Marlene, Marta, Martha, Matilde, Mayerly, Melba, Mercedes,
Mireya, Miriam, Mónica, Myriam, Nancy, Natalia, Nidia, Nohora, Norma, Nubia, Nury, Olga, Olivia, Omaira, Orfa, Pastora, Patricia, Pilar, Piedad, Priscila,
Rafaela, Raquel, Rebeca, Regina, Rocío, Rosa, Rosalba, Rosalía, Rosario, Rosmira, Ruby, Ruth, Sandra, Soledad, Sonia, Stella, Susana, Tatiana, Teresita, Tulia,
Úrsula, Vanessa, Verónica, Victoria, Viviana, Wendy, Xiomara, Yadira, Yamile, Yaneth, Yesenia, Yomaira, Zoraida, Zulma,
Luz Marina, Luz Dary, Luz Mery, Luz Elena, Luz Stella, Luz Adriana, Ana Milena, Ana Lucía, Ana Cecilia, Ana Beatriz, María Eugenia, María Elena, María Cristina, María Teresa,
María Isabel, María Victoria, María Inés, María Mercedes, Martha Lucía, Martha Cecilia, Gloria Inés, Gloria Patricia, Blanca Nubia, Blanca Lilia, Flor Alba, Flor María,
Rosa Elvira, Rosa Helena, Sandra Milena, Sandra Patricia, Olga Lucía, Nancy Stella, Doris Elena, Gladys Elena,
Yusmary, Yaritza, Maigualida, Zulay, Lourdes, Nélida, Mirtha, Zenaida, Narcisa, Mariuxi, Gioconda, Digna, Jessenia, Mayra
`);

export const MEN = L(`
Abel, Abelardo, Adolfo, Agustín, Albeiro, Alberto, Alcides, Alfonso, Alfredo, Alirio, Álvaro, Amado, Ángel, Aníbal, Antonio, Argemiro, Ariel, Aristides, Armando, Arnulfo,
Arturo, Baltasar, Bernardo, César, Clímaco, Cornelio, Dagoberto, Damián, Darío, Dionisio, Duván, Edgar, Edilberto, Edinson, Edison, Eduardo, Efraín, Elkin, Emiro, Enrique, Eugenio, Eustaquio, Evelio, Ezequiel, Fabián, Fabio, Federico, Félix, Fernando, Fidel, Francisco, Froilán, Gerardo, Germán, Gilberto,
Gonzalo, Gregorio, Guillermo, Gustavo, Heberto, Héctor, Hernán, Hernando, Hugo, Humberto, Ignacio, Iván, Jacinto, Jairo, Javier, Jorge, José, Josué, Julio,
Justo, Leonardo, Leopoldo, Libardo, Lisandro, Lorenzo, Luciano, Luis, Manuel, Marco, Marcos, Mario, Mauricio, Mauro, Miguel, Misael, Moisés, Nelson, Néstor, Noé, Octavio,
Omar, Orlando, Óscar, Otoniel, Pablo, Pastor, Pedro, Rafael, Ramiro, Ramón, Raúl, Reinaldo, Reinel, Ricardo, Roberto, Rodolfo, Rodrigo, Rogelio, Román, Rubén,
Salomón, Saúl, Sergio, Servando, Teodoro, Ulises, Uriel, Valentín, Vicente, Víctor, Wálter, Wilfredo, William, Wilmar, Wilmer, Wilson, Yamid, Yesid, Yovany,
Carlos Arturo, Carlos Julio, Carlos Alberto, Luis Alfonso, Luis Carlos, Luis Fernando, Luis Eduardo, José Ignacio, José Gregorio, José Miguel, Juan Carlos, Juan Bautista,
Jhon Jairo, Gustavo Adolfo, Hugo Armando, Jorge Eliécer, Jorge Iván, Pedro Pablo, Jesús Antonio, William Alberto, Nelson Enrique, Miguel Antonio, Hernán Darío, Pablo Emilio,
Rafael Antonio, Víctor Manuel, Rubén Darío, Fabio Nelson, Orlando Antonio, Néstor Raúl,
Yorman, Leonel, Wilder, Percy, Rolando, Elmer, Washington, Bolívar, Holger, Galo, Fausto, Vinicio, Wilfrido, Marlon, Jhonny
`);

// the children's lists are as long as each other: household.js interleaves them (a boy, a girl, a boy ...) for `NAMES.kids`
export const BOYS = L(`
Santiago, Mateo, Juan David, Sebastián, Samuel, Andrés, Juan Pablo, Juan José, Juan Esteban, Juan Camilo, Juan Manuel, Juan Sebastián, Emmanuel, Matías, Thiago, Dylan, Kevin,
Nicolás, Cristian, Felipe, Alejandro, Miguel Ángel, Maximiliano, Lucas, Benjamín, Martín, Jerónimo, Emiliano, Santino, Ian, Ethan, Adrián, Anderson, Deivid, Sneider, Jeisson,
Yair, Kaleth, Jhoan, Steven, Brandon, Stiven, Jaider, Johan, Luis Miguel, Carlos Andrés, Diego Alejandro, Joaquín, Simón, Tomás, Gael, Liam, Bruno, Dante, Elías, Isaac,
Gabriel, Daniel, David, Esteban, Camilo, Diego, Jhonatan, Jhon Edison, Cristopher, Axel, Maicol, Michael, Jefferson, Kenneth, Alan, Leandro, Johann,
Jorge Luis, Luis Felipe, Andrés Felipe, Juan Andrés, Juan Felipe, Carlos Eduardo, Miguel Santiago
`);
export const GIRLS = L(`
Valentina, Sofía, Camila, Isabella, Luciana, Mariana, Gabriela, Salomé, Manuela, Juliana, Samantha, Katherine, Yuliana, Ana Sofía, Sara, Laura, Valeria, Antonella,
Emma, Mía, Luna, María José, María Fernanda, Sharon, Dayana, Michell, Karol, Nicol, Evelyn, Heidy, Ashly, Yurani, Paulina, Violeta, Martina, Renata, Alejandra, Paula, Juanita,
Jimena, Mariángel, Estefanía, Lizeth, Brigitte, Ximena, Nathalia, Gisselle, Maite, Zoe, Lía, Allison, Shirley, Yeraldin, Dulce María, Danna, Mariam, Lisbeth, Angie, Dana,
Catalina, Bianca, Carla, Celeste, Aitana, Antonia, Gala, Julieta, Mikaela, Nikol, Yesica, Jhoselin, Brithany, Kimberly, Thalía, Karla, Cindy, Jennifer, Yenifer,
Laura Sofía, Michelle
`);

export const SURNAMES = L(`
Restrepo, Gómez, Ramírez, Moreno, Quintero, Cárdenas, Mosquera, Chará, Cuéllar, Tovar, Palacios, Ochoa, Valencia, Pineda, Cano, Arboleda, Zapata, Ospina, Cardona, Mejía,
Giraldo, Arango, Londoño, Montoya, Henao, Echeverri, Bedoya, Posada, Agudelo, Castaño, Duque, Ocampo, Rincón, Becerra, Pérez, Rodríguez, García, Martínez, López, Hernández,
Díaz, Vargas, Rojas, Castro, Torres, Ríos, Salazar, Herrera, Medina, Aguirre, Cortés, Peña, Franco, Suárez, Parra, Orozco, Muñoz, Jiménez, Cruz, Guerrero, Mendoza, Acosta,
Bermúdez, Cifuentes, Bustamante, Escobar, Naranjo, Serna, Vélez, Uribe, Carvajal, Marín, Ruiz, Gaviria, Trujillo, Aristizábal, Betancur, Guzmán, Lozano, Barrera, Cabrera,
Delgado, Prieto, Sánchez, Santos, Sierra, Solano, Tamayo, Villa, Yepes, Zuluaga, Lemos, Rentería, Cuesta, Asprilla, Hinestroza, Perea, Murillo, Córdoba, Mora
`);
