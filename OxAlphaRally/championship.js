// career.js owns the championship rules. The simulator owns a smaller catalogue
// of hand-authored, renderable roads and cars. This adapter is the deliberate
// seam between them: every scheduled career stage maps to one stable playable
// setup, while results still belong to the scheduled stage and season.

const WEATHER = Object.freeze({
  clear: "midday-hard",
  overcast: "overcast",
  damp: "light-rain",
  rain: "heavy-rain",
  downpour: "thunderstorm",
  fog: "hill-fog",
  snowfall: "light-snow",
  blizzard: "blizzard",
});

const DAMAGE_GROUPS = Object.freeze({
  engine: ["engine", "turbo", "exhaust"],
  gearbox: ["gearbox", "clutch", "driveshaft"],
  suspension: ["suspFL", "suspFR", "suspRL", "suspRR"],
  steering: ["steering"],
  cooling: ["radiator"],
  electrics: ["headlights"],
  bodywork: ["bodyFront", "bodyRear", "bodyLeft", "bodyRight", "bodyRoof", "windscreen"],
});

function hash(text) {
  let value = 2166136261;
  for (const ch of String(text)) {
    value ^= ch.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function playableSurface(surface) {
  if (surface === 0) return 0;
  if (surface === 2 || surface === 7) return 2;
  return 1;
}

export function championshipChoice(ctx, season, stageBook, cars) {
  if (!ctx || !season || !stageBook?.length || !cars?.length) return null;
  const wanted = playableSurface(ctx.stage.surface);
  const candidates = stageBook.filter((entry) => entry.params?.surface === wanted);
  const roads = candidates.length ? candidates : stageBook;
  const key = `${season.seed}|${ctx.event.id}|${ctx.stage.id}`;
  const road = roads[hash(key) % roads.length];
  const classOrder = Math.min(3, Math.max(0, ctx.tier?.order ?? 0));
  const classes = ["junior", "heritage", "works4wd", "topclass"];
  const eligible = cars.filter((car) => car.class === classes[classOrder]);
  const fleet = eligible.length ? eligible : cars;
  const car = fleet[hash(`${season.carId}|${key}`) % fleet.length];
  const wetNight = ["damp", "rain", "downpour"].includes(ctx.conditions?.id);
  return {
    mode: "championship",
    stageId: road.id,
    careerStageId: ctx.stage.id,
    careerCarId: season.carId,
    careerWeatherKey: ctx.conditions?.key ?? ctx.conditions?.id ?? "clear",
    carId: car.id,
    weather: ctx.stage.night ? (wetNight ? "night-rain" : "night-clear")
      : WEATHER[ctx.conditions?.id] ?? "overcast",
    seed: key,
    reverse: (hash(`${key}|direction`) & 1) === 1,
  };
}

export function championshipData(career, rallies) {
  const season = career?.state?.season;
  if (!season) return null;
  const byId = new Map((rallies ?? []).map((event) => [event.id, event]));
  const current = season.finished ? -1 : season.cursor.event;
  const events = season.calendar.map((id, index) => {
    const event = byId.get(id) ?? { id, name: id, country: "", surfaces: [] };
    const state = season.events[index];
    const classification = state?.done ? career.eventClassification(id) : [];
    const player = classification.find((row) => row.isPlayer);
    return {
      id,
      name: event.name,
      country: event.country,
      surface: event.surfaces,
      status: state?.done ? "done" : index === current ? "next" : "locked",
      position: player?.position ?? null,
      x: 0.12 + (hash(`${id}|x`) % 760) / 1000,
      y: 0.12 + (hash(`${id}|y`) % 760) / 1000,
    };
  });
  return {
    name: career.currentStage()?.tier?.name ?? "OxAlpha Championship",
    round: Math.min(season.cursor.event + 1, season.calendar.length),
    events,
    standings: career.standings(),
  };
}

export function serviceData(options) {
  const items = options?.items ?? [];
  return {
    damage: items.map((item) => ({
      id: item.id,
      part: item.name,
      severity: 1 - item.health,
      repairMin: item.minutes,
      effect: item.critical ? "A retirement is likely." : "Performance remains reduced.",
    })),
    repairChoices: items.filter((item) => item.minutes > 0).map((item) => item.id),
    repairBudgetMin: options?.budgetMinutes ?? 20,
  };
}

export function resultData(submission, run = {}) {
  const player = submission?.entries?.find((entry) => entry.isPlayer);
  const penaltyMs = player?.penaltyMs ?? 0;
  const splits = (run.splits ?? []).map((timeMs, index) => ({
    label: `Split ${index + 1}`,
    timeMs,
    deltaMs: null,
  }));
  return {
    results: {
      stageName: submission?.stage?.name ?? "Stage result",
      totalMs: (run.timeMs ?? 0) + penaltyMs,
      position: submission?.stagePosition ?? null,
      splits,
      penaltiesMs: penaltyMs,
      cleanRun: !!run.cleanRun,
      retired: !!run.retired,
      reason: run.reason ?? "",
    },
    hasNextStage: !submission?.seasonFinished,
    hasReplay: false,
    canRetry: false,
  };
}

export function seasonData(summary) {
  const standings = summary?.standings ?? [];
  return {
    season: {
      title: "Championship result",
      podium: standings.slice(0, 3).map((row, index) => ({
        ...row,
        position: row.position ?? index + 1,
      })),
    },
  };
}

export function careerDamage(report) {
  const health = new Map((report ?? []).map((row) => [row.key ?? row.id, Number(row.health)]));
  const out = {};
  for (const [component, keys] of Object.entries(DAMAGE_GROUPS)) {
    const values = keys.map((key) => health.get(key)).filter(Number.isFinite);
    out[component] = values.length ? Math.min(...values) : 1;
  }
  return out;
}

export function applyCareerCondition(damage, condition, setHealth) {
  if (!damage || !condition || typeof setHealth !== "function") return;
  for (const [component, keys] of Object.entries(DAMAGE_GROUPS)) {
    const health = Number(condition[component]);
    if (!Number.isFinite(health)) continue;
    for (const key of keys) setHealth(damage, key, health);
  }
}
