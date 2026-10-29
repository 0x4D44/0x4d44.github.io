// Dune Canyon - theme + scenery entry. Heavy lifting lives in canyon-terrain.js / canyon-struct.js / canyon-props.js.
import * as THREE from "three";
import { buildCanyonTerrain } from "./canyon-terrain.js";
import { buildStructures } from "./canyon-struct.js";
import { buildProps } from "./canyon-props.js";

const theme = {
  shoulder: 4.0, kerb: [0xc4452a, 0xf2dfb8], wallBase: "#e2c391", wallAccent: "#b04a24", wallText: ["DUNE CANYON", "APEX KARTS", "DUSTY'S GAS", "SAND RALLY"],
  asphalt: "#5b4f49", line: "#f6e8c8", padColor: "#ffd23a", padColor2: "#ff6a1f",
  ground: "#d9a766", groundVar: 10, shoulderCol: "#d8b078",
  fog: [0xf0b585, 160, 920],
  hemi: [0xffd9b4, 0x9a6a48, 1.12], sun: { color: 0xffb372, i: 2.9, dir: [-0.62, 0.30, -0.72] },
  sky: { stops: [[0, "#26397a"], [0.2, "#5d5a9c"], [0.34, "#c8788c"], [0.44, "#ff9f5e"], [0.5, "#ffd18a"], [0.56, "#f4b57c"], [1, "#f0b585"]], sun: { glow: "#ffd9a0", disc: "#fff3d0", size: 0.03 }, clouds: "#ffa27a", ridge: ["#b0604e", "#8f4a42"], stars: false },
};

function scenery(track, X, K) {
  const sd = new THREE.Vector3(...theme.sun.dir).normalize();
  buildCanyonTerrain(track, X, sd);
  buildStructures(track, X, K);
  buildProps(track, X, K, sd);
}

export default { id: "canyon", theme, scenery, terrainAmp: 1.4 };
