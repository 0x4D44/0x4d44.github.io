import test from "node:test";
import assert from "node:assert/strict";

import { createCareer, RALLIES, CARS as CAREER_CARS } from "../career.js";
import { STAGE_BOOK } from "../stage.js";
import { CARS } from "../physics.js";
import { WEATHER_PRESETS } from "../weather.js";
import { buildTitleModel } from "../ui.js";
import {
  championshipChoice,
  championshipData,
  careerDamage,
  resultData,
  serviceData,
  seasonData,
} from "../championship.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("a saved career stage maps to one stable, playable championship choice", () => {
  const career = createCareer(memoryStorage());
  career.newSeason({ seed: "adapter-contract", rounds: 4 });
  const ctx = career.currentStage();
  const first = championshipChoice(ctx, career.state.season, STAGE_BOOK, CARS);
  const again = championshipChoice(ctx, career.state.season, STAGE_BOOK, CARS);

  assert.deepEqual(again, first);
  assert.equal(first.mode, "championship");
  assert.ok(STAGE_BOOK.some((stage) => stage.id === first.stageId));
  assert.ok(CARS.some((car) => car.id === first.carId));
  assert.match(first.weather, /\S/);
  assert.equal(first.careerStageId, ctx.stage.id);

  for (const careerCar of CAREER_CARS) {
    const mapped = championshipChoice(ctx, { ...career.state.season, carId: careerCar.id }, STAGE_BOOK, CARS);
    assert.ok(CARS.some((car) => car.id === mapped.carId), `${careerCar.id} has no playable car`);
    assert.equal(mapped.careerCarId, careerCar.id);
  }

  const weatherIds = new Set(WEATHER_PRESETS.map((preset) => preset.id));
  for (const condition of ["clear", "overcast", "damp", "rain", "downpour", "fog", "snowfall", "blizzard"]) {
    const mapped = championshipChoice({
      ...ctx,
      conditions: { id: condition, key: `${condition}-test` },
    }, career.state.season, STAGE_BOOK, CARS);
    assert.ok(weatherIds.has(mapped.weather), `${condition} has no playable weather`);
  }
  const night = championshipChoice({
    ...ctx,
    stage: { ...ctx.stage, night: true },
    conditions: { id: "rain", key: "rain-night" },
  }, career.state.season, STAGE_BOOK, CARS);
  assert.equal(night.weather, "night-rain");
});

test("the title offers a new championship first, then a persisted continue action", () => {
  const fresh = buildTitleModel({ championshipAvailable: true });
  const freshMenu = fresh.sections.find((section) => section.id === "t-menu").items;
  assert.equal(freshMenu[0].label, "New championship");
  assert.equal(freshMenu[0].action, "newSeason");
  assert.ok(freshMenu.some((item) => item.action === "quickStage"));

  const saved = buildTitleModel({ championshipAvailable: true, championship: { events: [] } });
  const savedMenu = saved.sections.find((section) => section.id === "t-menu").items;
  assert.equal(savedMenu[0].label, "Continue championship");
  assert.equal(savedMenu[0].action, "continue");
  assert.ok(savedMenu.some((item) => item.action === "newSeason"));
});

test("championship, service, result, and season views match the UI contracts", () => {
  const career = createCareer(memoryStorage());
  career.newSeason({ seed: "view-contract", rounds: 4 });
  const champ = championshipData(career, RALLIES);
  assert.equal(champ.events.length, 4);
  assert.equal(champ.events.filter((event) => event.status === "next").length, 1);
  assert.ok(champ.standings.some((row) => row.isPlayer));

  const repairs = serviceData({
    budgetMinutes: 20,
    items: [{ id: "engine", name: "Engine", health: 0.5, minutes: 11, critical: false }],
  });
  assert.deepEqual(repairs.repairChoices, ["engine"]);
  assert.deepEqual(repairs.damage[0], {
    id: "engine", part: "Engine", severity: 0.5, repairMin: 11,
    effect: "Performance remains reduced.",
  });

  const stageResult = resultData({
    stage: { name: "Hovden Ridge" }, stagePosition: 3, stageGapMs: 4200,
    entries: [{ isPlayer: true, penaltyMs: 5000 }],
  }, { timeMs: 123456, splits: [40000, 82000], cleanRun: true });
  assert.equal(stageResult.results.stageName, "Hovden Ridge");
  assert.equal(stageResult.results.position, 3);
  assert.equal(stageResult.results.totalMs, 128456);
  assert.equal(stageResult.results.splits[1].timeMs, 82000);

  const final = seasonData({ standings: career.standings() });
  assert.equal(final.season.podium.length, 3);
  assert.equal(final.season.podium[0].position, 1);
});

test("detailed simulator damage is conservatively folded into career components", () => {
  const damage = careerDamage([
    { key: "engine", health: 0.8 }, { key: "turbo", health: 0.6 },
    { key: "gearbox", health: 0.9 }, { key: "clutch", health: 0.7 },
    { key: "suspFL", health: 0.5 }, { key: "suspFR", health: 0.75 },
    { key: "steering", health: 0.85 }, { key: "radiator", health: 0.65 },
    { key: "headlights", health: 0.9 }, { key: "bodyFront", health: 0.55 },
  ]);
  assert.equal(damage.engine, 0.6);
  assert.equal(damage.gearbox, 0.7);
  assert.equal(damage.suspension, 0.5);
  assert.equal(damage.steering, 0.85);
  assert.equal(damage.cooling, 0.65);
  assert.equal(damage.electrics, 0.9);
  assert.equal(damage.bodywork, 0.55);
});
