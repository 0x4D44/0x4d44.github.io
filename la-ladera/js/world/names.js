// Spanish names for lots, shops and places (Colombian flavour). Pure data.
const SHOP = {
  panaderia: ['Panadería La Esperanza', 'Panadería El Trigal', 'Panadería San Judas', 'Pan Caliente Doña Marta'],
  fruver: ['Fruver La Cosecha', 'Fruver Los Andes', 'Frutas y Verduras El Campesino', 'Fruver Doña Mery'],
  carniceria: ['Carnicería El Novillo', 'Carnicería Don Evelio', 'Carnes La Sabana', 'Carnicería La Ternera'],
  peluqueria: ['Peluquería Doña Nubia', 'Barbería El Corte Fino', 'Salón de Belleza Mariposa', 'Peluquería Estilo Latino'],
  ferreteria: ['Ferretería El Tornillo', 'Ferretería Don Hernando', 'Ferretería La Obra', 'Ferretería El Martillo'],
  drogueria: ['Droguería La Salud', 'Droguería San Rafael', 'Droguería Nueva Vida', 'Droguería El Cerro'],
  cafe: ['Café El Tinto', 'Café La Ladera', 'Tinto y Pan Don Jesús', 'Cafetería La Esquina del Sol'],
  restaurante: ['Restaurante Sabor Paisa', 'Restaurante El Fogón', 'Corrientazo Doña Lucía', 'Restaurante La Bandeja'],
  papeleria: ['Papelería El Estudiante', 'Papelería y Fotocopias El Cerro', 'Papelería La Plumita', 'Papelería Nuevo Saber'],
  minutos: ['Minutos y Cabinas El Contacto', 'Internet y Minutos Conexión', 'Cabinas La Ladera', 'Minutos Don Chepe'],
  modista: ['Modistería Hilos de Oro', 'Confecciones Doña Carmen', 'Arreglos La Aguja', 'Modistería La Costura'],
  zapateria: ['Zapatería El Remiendo', 'Remontadora San Crispín', 'Zapatería Don Pacho', 'Zapatería La Suela'],
  taller: ['Taller de Motos El Rayo', 'Taller El Cilindro', 'Mecánica de Motos La Ladera', 'Taller Los Hermanos Gil'],
  tienda: ['Tienda La Esquina', 'Miscelánea La Bendición', 'Tienda Doña Rosa', 'Tienda El Vecino', 'Minimercado Doña Gloria'],
};
const KIND = {
  house: ['Casa de Doña Rosa', 'Casa Los Almendros', 'Casa de Don Álvaro', 'Casa La Bendición', 'Casa de la Familia Ruiz', 'Casa de Doña Lucrecia', 'Casa Mirador', 'Casa de los Pérez'],
  rowhouse: ['Casa del Pasaje', 'Casa Hermanas Vélez', 'Casa de los Muñoz', 'Casa Doña Aura', 'Casa de los Gómez', 'Casa de Don Gilberto'],
  apartments: ['Edificio Miramar', 'Edificio Santa Rita', 'Edificio Los Cerezos', 'Edificio La Ladera', 'Edificio El Mirador'],
  shophouse: ['Local y Vivienda Los Pinos', 'Casa Comercial La Palma'],
  courtyard: ['Casa Patio Las Comadres', 'Casa Patio de los Naranjos', 'Casa Patio Doña Eulalia'],
  tenement: ['Inquilinato El Faro', 'Inquilinato La Paz', 'Inquilinato Santa Teresa'],
  unfinished: ['Obra de Don Wilson', 'Casa en Obra de Doña Leonor', 'Obra Negra de los Hermanos Rojas', 'Casa en Construcción El Sueño', 'Obra de Don Fabio', 'Obra La Esperanza'],
  cornerstore: ['Tienda La Esquina', 'Cafetería La Esquina del Sol', 'Minimercado Doña Gloria'],
  chapel: ['Capilla de la Virgen del Carmen'],
  school: ['Escuela El Cerro'],
  clinic: ['Puesto de Salud El Cerro'],
  workshop: ['Carpintería Los Hermanos Gil', 'Taller de Soldadura El Chispa', 'Taller de Motos El Rayo'],
  kiosk: ['Kiosco Don Chucho', 'Kiosco La Bendición', 'Kiosco El Mirador'],
  hall: ['Salón Comunal Los Almendros'],
};
// More names for the lots of the infill (plan.js): the hand-authored lots keep the pools above and the draws they always made, so their names never change.
const SHOP_MORE = {
  panaderia: ['Panadería El Buen Pan', 'Panadería La Hogaza', 'Pan y Café El Molino', 'Panadería Doña Ligia'],
  fruver: ['Fruver La Huerta', 'Frutas El Edén', 'Fruver Doña Luz', 'Verduras La Montaña'],
  carniceria: ['Carnicería El Toro', 'Carnes Don Rafael', 'Carnicería La Res', 'Carnicería San Isidro'],
  peluqueria: ['Barbería El Cerro', 'Peluquería Dulce Cabello', 'Salón Doña Stella', 'Barbería Los Compadres'],
  ferreteria: ['Ferretería La Ladera', 'Ferretería El Clavo', 'Ferretería Don Pedro', 'Depósito de Materiales El Cerro'],
  drogueria: ['Droguería Santa Ana', 'Droguería La Esperanza', 'Droguería Salud Total', 'Droguería El Pueblo'],
  cafe: ['Café Doña Ceci', 'Tinto y Arepa La Montaña', 'Café Los Almendros', 'Cafetería El Mirador'],
  restaurante: ['Restaurante La Fonda', 'Corrientazo Don Pacho', 'Restaurante El Sazón', 'Asadero Doña Rosa'],
  papeleria: ['Papelería La Libreta', 'Papelería El Cerro Azul', 'Papelería y Variedades Sofía', 'Papelería Doña Inés'],
  minutos: ['Minutos La Conexión', 'Cabinas El Mirador', 'Internet y Llamadas La Ladera', 'Minutos Doña Fanny'],
  modista: ['Modistería La Puntada', 'Confecciones El Dedal', 'Arreglos Doña Mila', 'Modistería Alta Costura'],
  zapateria: ['Zapatería Los Andes', 'Remontadora El Cerro', 'Zapatería La Plantilla', 'Zapatería Don Lucho'],
  taller: ['Taller Motos El Tornillo Suelto', 'Mecánica Los Primos', 'Taller El Pistón'],
  tienda: ['Tienda La Favorita', 'Tienda Los Primos', 'Tienda Doña Luz', 'Miscelánea La Ladera', 'Tienda El Paisa'],
};
const KIND_MORE = {
  house: ['Casa de Doña Teresa', 'Casa de Don Heriberto', 'Casa Villa Luz', 'Casa de la Familia Castaño', 'Casa de Doña Inés', 'Casa El Descanso', 'Casa de los Londoño', 'Casa Villa Esperanza',
    'Casa de Don Alirio', 'Casa de Doña Fanny', 'Casa La Colina', 'Casa de los Arboleda', 'Casa de Doña Gladys', 'Casa Bella Vista', 'Casa de Don Rigoberto', 'Casa de los Salazar',
    'Casa de Doña Amparo', 'Casa El Refugio', 'Casa de la Familia Mejía', 'Casa de Don Ramiro', 'Casa Los Cerezos', 'Casa de Doña Beatriz', 'Casa de los Hoyos', 'Casa de Don Wilmar'],
  rowhouse: ['Casa del Callejón', 'Casa de Doña Marlene', 'Casa de los Ospina', 'Casa Hermanos Cardona', 'Casa de Don Jairo', 'Casa de Doña Ofelia', 'Casa de los Tamayo', 'Casa de Doña Nelly',
    'Casa de Don Rubén', 'Casa de los Zapata', 'Casa de Doña Cecilia', 'Casa de los Giraldo', 'Casa de Don Fabián', 'Casa de Doña Yolanda', 'Casa de los Restrepo', 'Casa de Don Héctor',
    'Casa de Doña Alba', 'Casa de los Bedoya', 'Casa de Don Luis Carlos', 'Casa de Doña Rocío'],
  apartments: ['Edificio Torre Verde', 'Edificio Vista Hermosa', 'Edificio San Antonio', 'Edificio Los Alpes', 'Edificio El Lucero', 'Edificio Altos del Cerro', 'Edificio Santa Lucía', 'Edificio Villa Real',
    'Edificio Las Palmas', 'Edificio Mirador del Sol'],
  shophouse: ['Local y Vivienda El Roble', 'Casa Comercial Los Andes', 'Local y Vivienda La Ceiba', 'Casa Comercial El Cerro', 'Local y Vivienda San José'],
  courtyard: ['Casa Patio El Jazmín', 'Casa Patio de las Hermanas', 'Casa Patio Doña Cleotilde', 'Casa Patio Los Geranios', 'Casa Patio San José'],
  tenement: ['Inquilinato La Esperanza', 'Inquilinato San Judas', 'Inquilinato El Progreso', 'Inquilinato Doña Aurelia', 'Inquilinato La Unión'],
  unfinished: ['Obra de Doña Mery', 'Casa en Obra Los Primos', 'Obra Negra de Don Libardo', 'Obra de los Hermanos Mora', 'Casa en Construcción La Fe', 'Obra de Doña Pastora', 'Obra Negra El Progreso',
    'Obra de Don Ever', 'Casa en Obra de Doña Mila', 'Obra Negra de Don Aníbal'],
  cornerstore: ['Tienda La Favorita', 'Minimercado El Cerro', 'Tienda Doña Luz', 'Miscelánea Los Hermanos', 'Cafetería La Troja'],
};
const NUM = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function makeNamer() {
  const used = new Set();
  return (kind, shop, rng, i, more = false) => {
    const base = (shop && SHOP[shop]) || KIND[kind] || ['Casa ' + i];
    const pool = more ? base.concat((shop && SHOP_MORE[shop]) || KIND_MORE[kind] || []) : base;
    const start = rng.int(0, pool.length - 1);
    for (let k = 0; k < pool.length; k++) { const n = pool[(start + k) % pool.length]; if (!used.has(n)) { used.add(n); return n; } }
    for (let c = 0; ; c++) { const n = pool[start] + ' ' + (c < NUM.length ? NUM[c] : c + 2); if (!used.has(n)) { used.add(n); return n; } }
  };
}
