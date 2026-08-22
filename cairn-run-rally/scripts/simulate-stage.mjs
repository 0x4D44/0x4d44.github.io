import { simulateRun } from '../src/benchmark.js';
import { CAIRN_R4, KESTREL_STAGE, RIDGE_WEATHER } from '../src/content.js';

console.log(JSON.stringify(simulateRun({stageSpec:KESTREL_STAGE,carSpec:CAIRN_R4,weatherSpec:RIDGE_WEATHER,maxSeconds:420}),null,2));
