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

export function makeNamer() {
  const used = new Set();
  return (kind, shop, rng, i) => {
    const pool = (shop && SHOP[shop]) || KIND[kind] || ['Casa ' + i];
    const start = rng.int(0, pool.length - 1);
    for (let k = 0; k < pool.length; k++) { const n = pool[(start + k) % pool.length]; if (!used.has(n)) { used.add(n); return n; } }
    let n = pool[start] + ' II', c = 2; while (used.has(n)) n = pool[start] + ' ' + ['II', 'III', 'IV', 'V', 'VI'][c++ - 2]; used.add(n); return n;
  };
}
