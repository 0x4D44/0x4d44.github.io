// The one table that physics, rendering, audio and particles all read, so a
// gravel road cannot look loose, sound hard and grip like tarmac.
//
// gripLong/gripLat are peak friction multipliers against dry tarmac = 1.0.
// They are deliberately not equal: a loose surface carries more lateral bite
// through a built berm than it does under pure traction, which is why a gravel
// car is thrown sideways into a corner rather than braked into it.

export const SURFACE = Object.freeze({
  TARMAC: 0,
  GRAVEL: 1,
  DIRT: 2,
  SNOW: 3,
  ICE: 4,
  GRASS: 5,
  MUD: 6,
  SAND: 7,
  ROCK: 8,
  WATER: 9,
});

const defs = [
  {
    id: SURFACE.TARMAC,
    name: "Tarmac",
    gripLong: 1.0, gripLat: 1.0,
    rollingResistance: 0.013,
    looseDepth: 0.0,
    roughness: 0.10,
    dragOffRoad: 0.0,
    dustRate: 0,
    dustColour: [0.42, 0.42, 0.44],
    sfx: "tarmac",
    albedo: [0.115, 0.118, 0.126],
    specular: 0.42,
    wetDarken: 0.55,
  },
  {
    id: SURFACE.GRAVEL,
    name: "Gravel",
    gripLong: 0.72, gripLat: 0.80,
    rollingResistance: 0.026,
    looseDepth: 0.62,
    roughness: 0.46,
    dragOffRoad: 0.0,
    dustRate: 190,
    dustColour: [0.63, 0.55, 0.43],
    sfx: "gravel",
    albedo: [0.35, 0.31, 0.25],
    specular: 0.10,
    wetDarken: 0.34,
  },
  {
    id: SURFACE.DIRT,
    name: "Dirt",
    gripLong: 0.78, gripLat: 0.84,
    rollingResistance: 0.024,
    looseDepth: 0.44,
    roughness: 0.40,
    dragOffRoad: 0.0,
    dustRate: 160,
    dustColour: [0.48, 0.38, 0.28],
    sfx: "gravel",
    albedo: [0.26, 0.20, 0.14],
    specular: 0.09,
    wetDarken: 0.40,
  },
  {
    id: SURFACE.SNOW,
    name: "Snow",
    gripLong: 0.42, gripLat: 0.46,
    rollingResistance: 0.038,
    looseDepth: 0.78,
    roughness: 0.30,
    dragOffRoad: 0.0,
    dustRate: 240,
    dustColour: [0.94, 0.96, 1.0],
    sfx: "snow",
    albedo: [0.80, 0.84, 0.90],
    specular: 0.16,
    wetDarken: 0.08,
  },
  {
    id: SURFACE.ICE,
    name: "Ice",
    gripLong: 0.20, gripLat: 0.22,
    rollingResistance: 0.010,
    looseDepth: 0.0,
    roughness: 0.06,
    dragOffRoad: 0.0,
    dustRate: 0,
    dustColour: [0.86, 0.92, 1.0],
    sfx: "ice",
    albedo: [0.62, 0.70, 0.78],
    specular: 0.70,
    wetDarken: 0.20,
  },
  {
    id: SURFACE.GRASS,
    name: "Grass",
    gripLong: 0.48, gripLat: 0.50,
    rollingResistance: 0.070,
    looseDepth: 0.35,
    roughness: 0.55,
    dragOffRoad: 3.6,
    dustRate: 120,
    dustColour: [0.34, 0.36, 0.20],
    sfx: "grass",
    albedo: [0.17, 0.24, 0.11],
    specular: 0.06,
    wetDarken: 0.30,
  },
  {
    id: SURFACE.MUD,
    name: "Mud",
    gripLong: 0.38, gripLat: 0.40,
    rollingResistance: 0.090,
    looseDepth: 0.85,
    roughness: 0.50,
    dragOffRoad: 5.4,
    dustRate: 90,
    dustColour: [0.28, 0.22, 0.15],
    sfx: "mud",
    albedo: [0.14, 0.11, 0.08],
    specular: 0.24,
    wetDarken: 0.18,
  },
  {
    id: SURFACE.SAND,
    name: "Sand",
    gripLong: 0.55, gripLat: 0.58,
    rollingResistance: 0.075,
    looseDepth: 0.92,
    roughness: 0.34,
    dragOffRoad: 4.8,
    dustRate: 280,
    dustColour: [0.80, 0.70, 0.50],
    sfx: "sand",
    albedo: [0.52, 0.44, 0.31],
    specular: 0.08,
    wetDarken: 0.36,
  },
  {
    id: SURFACE.ROCK,
    name: "Rock",
    gripLong: 0.66, gripLat: 0.70,
    rollingResistance: 0.030,
    looseDepth: 0.10,
    roughness: 0.85,
    dragOffRoad: 2.2,
    dustRate: 70,
    dustColour: [0.55, 0.53, 0.50],
    sfx: "rock",
    albedo: [0.28, 0.27, 0.25],
    specular: 0.14,
    wetDarken: 0.40,
  },
  {
    id: SURFACE.WATER,
    name: "Water",
    gripLong: 0.30, gripLat: 0.30,
    rollingResistance: 0.120,
    looseDepth: 0.0,
    roughness: 0.12,
    dragOffRoad: 9.0,
    dustRate: 320,
    dustColour: [0.75, 0.82, 0.88],
    sfx: "water",
    albedo: [0.06, 0.10, 0.12],
    specular: 0.88,
    wetDarken: 0.0,
  },
];

export const SURFACE_LIST = Object.freeze(defs.map((d) => Object.freeze(d)));

const byId = new Map(SURFACE_LIST.map((d) => [d.id, d]));

export function surfaceProps(id) {
  return byId.get(id) ?? SURFACE_LIST[SURFACE.GRAVEL];
}

export function surfaceName(id) {
  return surfaceProps(id).name;
}

const blendScratch = {
  id: SURFACE.GRAVEL, name: "Blend",
  gripLong: 1, gripLat: 1, rollingResistance: 0, looseDepth: 0, roughness: 0,
  dragOffRoad: 0, dustRate: 0, dustColour: [0, 0, 0], sfx: "gravel",
  albedo: [0, 0, 0], specular: 0, wetDarken: 0,
};

// Blends two surface property sets into a reusable scratch object. Callers must
// consume the result before the next call — this is a per-wheel query in the
// physics step and must not allocate.
export function blendSurface(a, b, t, out = blendScratch) {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const m = (k) => a[k] + (b[k] - a[k]) * u;
  out.id = u < 0.5 ? a.id : b.id;
  out.name = u < 0.5 ? a.name : b.name;
  out.gripLong = m("gripLong");
  out.gripLat = m("gripLat");
  out.rollingResistance = m("rollingResistance");
  out.looseDepth = m("looseDepth");
  out.roughness = m("roughness");
  out.dragOffRoad = m("dragOffRoad");
  out.dustRate = m("dustRate");
  out.specular = m("specular");
  out.wetDarken = m("wetDarken");
  out.sfx = u < 0.5 ? a.sfx : b.sfx;
  for (let i = 0; i < 3; i += 1) {
    out.dustColour[i] = a.dustColour[i] + (b.dustColour[i] - a.dustColour[i]) * u;
    out.albedo[i] = a.albedo[i] + (b.albedo[i] - a.albedo[i]) * u;
  }
  return out;
}

// Water sits on a hard surface and floats a loose one, so wet tarmac loses far
// more of its grip than wet gravel does — which is exactly why a damp gravel
// stage is fast and a damp tarmac stage is treacherous.
export function wetnessGrip(props, wetness) {
  const w = wetness < 0 ? 0 : wetness > 1 ? 1 : wetness;
  const hard = 1 - props.looseDepth;
  const loss = w * (0.30 * hard + 0.06 * props.looseDepth);
  return 1 - loss;
}
