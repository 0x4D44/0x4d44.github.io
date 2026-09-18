import { simulateRun } from '../src/benchmark.js';
import { CATALOG } from '../src/content.js';

const rows = [];
for (const stage of CATALOG.stages) {
  const region = CATALOG.regions.find(candidate => candidate.id === stage.regionId);
  const weather = CATALOG.weather.find(candidate => candidate.id === region.weatherIds[0]);
  for (const car of CATALOG.cars) {
    const result = simulateRun({
      stageSpec: stage,
      carSpec: car,
      weatherSpec: weather,
      maxSeconds: stage.expectedDurationSeconds[1] + 30
    });
    rows.push({
      ...result,
      weatherId: weather.id,
      withinDurationBand: result.time >= stage.expectedDurationSeconds[0] && result.time <= stage.expectedDurationSeconds[1]
    });
  }
}

// Recalibrated with the combined-slip tyre model: the reference driver is a
// fixed-gain controller and grip-limited physics costs it the road now and
// then. The gate is that every pairing finishes inside its band with a
// survivable car, and the summary still reports the worst case.
const failures = rows.filter(row => !row.finished || !row.finite || !row.withinDurationBand || row.recoveries > 12 || row.damage >= .32);
console.log(JSON.stringify({
  summary: {
    combinations: rows.length,
    stages: CATALOG.stages.length,
    cars: CATALOG.cars.length,
    failures: failures.length,
    maxRecoveries: Math.max(...rows.map(row => row.recoveries)),
    maxDamage: Math.max(...rows.map(row => row.damage))
  },
  rows
}, null, 2));

if (failures.length) process.exitCode = 1;
