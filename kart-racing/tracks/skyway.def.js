// Skyway Station track data (pure data, no three import).
// Figure-of-eight over a ringed gas giant: lap crosses itself at the origin (lower pass u~0.146, upper pass u~0.639).
export default {
  id: "skyway-station", name: "Skyway Station",
  blurb: "Orbital circuit above a ringed gas giant. Glass tube, reactor hairpin, a launch ring 25 m up and a figure-of-eight crossing.",
  difficulty: 3, laps: 3, theme: "skyway", width: 16,
  elev: [[0,3],[0.06,3],[0.10,1.5],[0.13,1],[0.16,1],[0.20,4],[0.256,8],[0.30,15],[0.33,21],[0.352,25.5],[0.392,24],[0.43,21.5],[0.46,20],[0.50,15.5],[0.545,9.5],[0.585,14.5],[0.62,13.5],[0.6392,13.5],[0.66,13],[0.70,9.5],[0.76,5.5],[0.82,7],[0.86,4.5],[0.92,4],[0.97,3.2]],
  points: [[-250,190],[-170,178],[-100,130],[-55,70],[0,0],[60,-60],[130,-100],[210,-112],[300,-100],[365,-86],[430,-70],[467,-55],[482,-18],[467,19],[430,34],[380,42],[320,60],[262,92],[200,112],[130,90],[70,55],[0,0],[-55,-60],[-130,-105],[-215,-125],[-300,-115],[-365,-72],[-398,-5],[-402,60],[-398,130],[-370,180],[-330,190]],
  itemAt: [0.05, 0.22, 0.47, 0.69, 0.9],
  pads: [
    { s: 100, lat: "line", len: 11, wid: 5.5 }, { s: 250, lat: 0.5, len: 11, wid: 5.5 }, { s: 250, lat: -0.5, len: 11, wid: 5.5 },
    { s: 560, lat: "line", len: 11, wid: 5.5 }, { s: 760, lat: "line", len: 11, wid: 5.5 }, { s: 1060, lat: "line", len: 11, wid: 5.5 },
    { s: 1300, lat: 0.5, len: 11, wid: 5.5 }, { s: 1300, lat: -0.5, len: 11, wid: 5.5 }, { s: 1600, lat: "line", len: 11, wid: 5.5 },
    { s: 1740, lat: "line", len: 11, wid: 5.5 }, { s: 1960, lat: "line", len: 11, wid: 5.5 }, { s: 2160, lat: "line", len: 11, wid: 5.5 },
  ],
};
