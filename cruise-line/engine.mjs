import {
  CABIN_PLANS,
  CAMPAIGN_QUARTERS,
  COMPANY_EVENTS,
  DIFFICULTIES,
  FEATURES,
  FOCUSES,
  GLOBAL_EVENTS,
  HULLS,
  LEVELS,
  MARKETING_CHANNELS,
  MARKETS,
  RIVAL_PROFILES,
  SEGMENTS,
  SHIP_NAMES,
  SPEEDS,
} from "./content.mjs";

const EPSILON = 1e-9;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const round = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normaliseSeed(seed) {
  const numeric = Number(seed);
  if (Number.isFinite(numeric) && numeric !== 0) return numeric >>> 0;
  return hashString(seed || "wake-and-fortune") || 0x4d44cafe;
}

export function random(state) {
  let x = state.rng >>> 0;
  if (!x) x = 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4_294_967_296;
}

const randomBetween = (state, min, max) => min + (max - min) * random(state);

function weightedChoice(state, entries, getWeight = (entry) => entry.weight ?? 1) {
  const weighted = entries
    .map((entry) => ({ entry, weight: Math.max(0, finite(getWeight(entry), 0)) }))
    .filter(({ weight }) => weight > 0);
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!weighted.length || total <= 0) return entries[0] ?? null;
  let cursor = random(state) * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.entry;
  }
  return weighted.at(-1).entry;
}

function nextId(state, prefix) {
  state.idCounter += 1;
  return `${prefix}-${state.idCounter.toString(36)}`;
}

export function quarterLabel(index) {
  return `Year ${Math.floor(index / 4) + 1} · Q${(index % 4) + 1}`;
}

export function calendarSeason(index) {
  return ["Winter", "Spring", "Summer", "Autumn"][index % 4];
}

function cabinCostMultiplier(id) {
  return { dense: 0.97, balanced: 1, balcony: 1.04, suites: 1.1 }[id] ?? 1;
}

export function quoteShipDesign(input = {}) {
  const hull = HULLS[input.hullId] ?? HULLS.boutique;
  const cabinPlan = CABIN_PLANS[input.cabinPlanId] ?? CABIN_PLANS.balanced;
  const speed = SPEEDS[input.speedId] ?? SPEEDS.balanced;
  const featureIds = [...new Set(Array.isArray(input.features) ? input.features : [])]
    .filter((id) => FEATURES[id])
    .slice(0, hull.featureSlots);
  const featureData = featureIds.map((id) => FEATURES[id]);
  const featureCost = featureData.reduce((sum, feature) => sum + feature.cost, 0);
  const fuelFactor = featureData.reduce((value, feature) => value * (feature.fuel ?? 1), 1);
  const appeal = {};
  for (const segment of SEGMENTS) {
    appeal[segment] = round(
      hull.baseAppeal +
        (cabinPlan.appeal[segment] ?? 0) +
        (speed.appeal[segment] ?? 0) +
        featureData.reduce((sum, feature) => sum + (feature.appeal[segment] ?? 0), 0),
      1,
    );
  }
  const cost = hull.cost * speed.buildCost * cabinCostMultiplier(cabinPlan.id) + featureCost;
  return {
    name: String(input.name || `MV ${SHIP_NAMES[0]}`).trim().slice(0, 42),
    hullId: hull.id,
    cabinPlanId: cabinPlan.id,
    speedId: speed.id,
    features: featureIds,
    livery: /^#[0-9a-f]{6}$/i.test(input.livery || "") ? input.livery : "#21b7d8",
    cost: round(cost, 1),
    bookValue: round(cost, 1),
    buildQuarters: hull.buildQuarters,
    pax: Math.max(120, Math.round(hull.pax * cabinPlan.capacity)),
    sailings: round(hull.sailings * speed.sailings, 2),
    featureSlots: hull.featureSlots,
    fuel: round(hull.fuel * speed.fuel * fuelFactor, 3),
    crew: hull.crew,
    maintenanceCost: hull.maintenance,
    runningCost: round(featureData.reduce((sum, feature) => sum + feature.running, 0), 2),
    appeal,
    eco: clamp(
      hull.baseEco + speed.eco + featureData.reduce((sum, feature) => sum + (feature.eco ?? 0), 0),
      5,
      100,
    ),
    fareMultiplier: cabinPlan.fare,
    onboardMultiplier: round(1 + featureData.reduce((sum, feature) => sum + (feature.onboard ?? 0), 0), 3),
    resaleFactor: hull.resale,
  };
}

export function validateShipDesign(state, input = {}) {
  const errors = [];
  const hull = HULLS[input.hullId];
  if (!hull) errors.push("Choose a valid hull.");
  if (hull && hull.unlockLevel > levelForState(state).id) errors.push(`${hull.name} hulls are not unlocked yet.`);
  if (!CABIN_PLANS[input.cabinPlanId]) errors.push("Choose a cabin plan.");
  if (!SPEEDS[input.speedId]) errors.push("Choose a propulsion tune.");
  if (!String(input.name || "").trim()) errors.push("Give the ship a name.");
  const featureIds = [...new Set(Array.isArray(input.features) ? input.features : [])];
  if (hull && featureIds.length > hull.featureSlots) errors.push(`${hull.name} hulls have ${hull.featureSlots} feature slots.`);
  for (const id of featureIds) {
    const feature = FEATURES[id];
    if (!feature) {
      errors.push(`Unknown feature: ${id}.`);
      continue;
    }
    if (feature.unlockLevel > levelForState(state).id) errors.push(`${feature.name} is not unlocked yet.`);
    if (hull && (feature.blockedHulls || []).includes(hull.id)) errors.push(`${feature.name} does not fit a ${hull.name.toLowerCase()} hull.`);
  }
  return errors;
}

function makeShip(state, input, options = {}) {
  const quote = quoteShipDesign(input);
  return {
    id: nextId(state, options.rivalPrefix || "ship"),
    ...quote,
    condition: options.starter ? 92 : options.condition ?? 100,
    ageQuarters: options.starter ? 8 : options.ageQuarters ?? 0,
    routeId: options.routeId || "med",
    refitQuarters: 0,
    lifetimePassengers: 0,
    lastOccupancy: 0,
    lastProfit: 0,
  };
}

function defaultFeaturesForFocus(focusId) {
  if (focusId === "premium" || focusId === "luxury") return ["spa", "observation"];
  if (focusId === "adventure") return ["observation", "theatre"];
  return ["theatre", "observation"];
}

function rivalFeatureSet(focus, hullId) {
  const sets = {
    family: ["theatre", "familyClub", "waterpark", "signatureShow"],
    premium: ["spa", "culinary", "observation", "privateClub"],
    luxury: ["spa", "privateClub", "observation", "marina"],
    adventure: ["observation", "expeditionLab", "hybrid", "shorePower"],
    value: ["theatre", "familyClub", "waterpark"],
  };
  const hull = HULLS[hullId] ?? HULLS.mid;
  return (sets[focus] || ["theatre"])
    .filter((id) => FEATURES[id] && !(FEATURES[id].blockedHulls || []).includes(hull.id))
    .slice(0, hull.featureSlots);
}

function createRivalShip(state, rival, hullId, index) {
  const hull = HULLS[hullId] ?? HULLS.mid;
  const quote = quoteShipDesign({
    name: `${rival.name.split(" ")[0]} ${SHIP_NAMES[(index + hashString(rival.id)) % SHIP_NAMES.length]}`,
    hullId: hull.id,
    cabinPlanId: rival.focus === "value" ? "dense" : rival.focus === "luxury" ? "suites" : rival.focus === "premium" ? "balcony" : "balanced",
    speedId: rival.focus === "value" ? "fast" : rival.focus === "adventure" ? "economy" : "balanced",
    features: rivalFeatureSet(rival.focus, hull.id),
    livery: rival.colour,
  });
  return {
    id: nextId(state, `r-${rival.id}`),
    ...quote,
    condition: 87 + Math.round(random(state) * 9),
    ageQuarters: 6 + Math.floor(random(state) * 20),
    routeId: rival.homeMarkets[index % rival.homeMarkets.length],
    refitQuarters: 0,
    lifetimePassengers: 0,
    lastOccupancy: 0,
    lastProfit: 0,
  };
}

function createRival(state, profile) {
  const rival = {
    id: profile.id,
    name: profile.name,
    icon: profile.icon,
    colour: profile.colour,
    focus: profile.focus,
    temperament: profile.temperament,
    basePrice: profile.price,
    service: profile.service,
    marketing: profile.marketing,
    reputation: profile.reputation,
    sustainability: profile.sustainability,
    homeMarkets: [...profile.homeMarkets],
    bio: profile.bio,
    cash: round(265 + randomBetween(state, 0, 100), 2),
    debt: round(205 + randomBetween(state, 0, 130), 2),
    fleet: [],
    orders: [],
    marketShare: 0,
    lifetimePassengers: 120_000 + Math.round(randomBetween(state, 0, 90_000)),
    history: [],
    priceByMarket: {},
  };
  for (const [index, hullId] of profile.startingFleet.entries()) {
    rival.fleet.push(createRivalShip(state, rival, hullId, index));
  }
  for (const market of Object.values(MARKETS)) rival.priceByMarket[market.id] = profile.price;
  return rival;
}

export function createNewGame(options = {}) {
  const difficulty = DIFFICULTIES[options.difficulty] ?? DIFFICULTIES.standard;
  const companyName = String(options.companyName || "North Star Cruises").trim().slice(0, 36) || "North Star Cruises";
  const focusId = FOCUSES[options.focusId] ? options.focusId : "premium";
  const seed = normaliseSeed(options.seed ?? `${companyName}-${focusId}`);
  const openingPrice = { family: 1, premium: 1.06, luxury: 1.14, adventure: 1.06, value: 0.96 }[focusId] ?? 1;
  const state = {
    version: 1,
    seed,
    rng: seed,
    idCounter: 0,
    quarter: 0,
    campaignQuarters: CAMPAIGN_QUARTERS,
    difficultyId: difficulty.id,
    status: "planning",
    sandbox: false,
    selectedTab: "bridge",
    company: {
      name: companyName,
      focusId,
      cash: difficulty.startingCash,
      debt: difficulty.startingDebt,
      reputation: 12,
      sustainability: 34,
      serviceSpend: 154,
      maintenance: 1.04,
      crewPay: 1,
      sustainabilitySpend: 0.3,
      marketing: { digital: 0.5, agents: 0.3, broadcast: 0.1, loyalty: 0.3 },
      prices: {},
      fleet: [],
      orders: [],
      lifetimePassengers: 0,
      lifetimeProfit: 0,
      history: [],
      marketShare: 0,
      currentLevel: 1,
    },
    rivals: [],
    lastReport: null,
    news: [
      {
        quarter: -1,
        icon: "🗞️",
        title: `${companyName} opens for bookings`,
        body: "One ship, one brand promise and a board with everything to prove.",
      },
    ],
  };
  for (const market of Object.values(MARKETS)) state.company.prices[market.id] = openingPrice;
  const starter = makeShip(
    state,
    {
      name: options.starterShipName || "MV First Light",
      hullId: "boutique",
      cabinPlanId: focusId === "value" ? "dense" : focusId === "luxury" ? "suites" : focusId === "premium" ? "balcony" : "balanced",
      speedId: focusId === "adventure" ? "economy" : "balanced",
      features: defaultFeaturesForFocus(focusId),
      livery: FOCUSES[focusId].colour,
    },
    { starter: true },
  );
  starter.routeId = focusId === "value" ? "short" : "med";
  state.company.fleet.push(starter);
  state.rivals = RIVAL_PROFILES.map((profile) => createRival(state, profile));
  planRivals(state);
  state.company.currentLevel = levelForState(state).id;
  return state;
}

function levelForStateSafe(company) {
  return clamp(Number(company.currentLevel) || 1, 1, 5);
}

function orderAssetValue(order) {
  const total = order.ship?.bookValue ?? 0;
  const totalBuild = Math.max(1, order.ship?.buildQuarters ?? 1);
  const progress = 1 - order.quartersRemaining / totalBuild;
  return total * clamp(0.72 + progress * 0.28, 0.72, 1);
}

export function enterpriseValue(state) {
  const company = state.company;
  const fleetValue = company.fleet.reduce((sum, ship) => sum + ship.bookValue, 0);
  const orderValue = company.orders.reduce((sum, order) => sum + orderAssetValue(order), 0);
  const brandValue = company.reputation * (8 + levelForStateSafe(company) * 1.2);
  const loyaltyValue = (company.marketing.loyalty ?? 0) * 4.5;
  return round(Math.max(-100, company.cash + fleetValue + orderValue - company.debt + brandValue + loyaltyValue), 2);
}

export function rivalEnterpriseValue(rival) {
  const fleetValue = rival.fleet.reduce((sum, ship) => sum + ship.bookValue, 0);
  const orderValue = rival.orders.reduce((sum, order) => sum + orderAssetValue(order), 0);
  return round(Math.max(-100, rival.cash + fleetValue + orderValue - rival.debt + rival.reputation * 9.2), 2);
}

export function levelForState(state) {
  const value = enterpriseValue(state);
  let level = LEVELS[0];
  for (const candidate of LEVELS) {
    const qualifies =
      state.company.reputation >= candidate.minReputation &&
      value >= candidate.minValue &&
      state.company.fleet.length >= candidate.minFleet &&
      state.company.lifetimePassengers >= candidate.minPassengers;
    if (qualifies) level = candidate;
  }
  return level;
}

export function nextLevelForState(state) {
  const current = levelForState(state);
  return LEVELS.find((level) => level.id === current.id + 1) ?? null;
}

export function levelProgress(state) {
  const current = levelForState(state);
  const next = nextLevelForState(state);
  if (!next) return { current, next: null, overall: 1, requirements: [] };
  const value = enterpriseValue(state);
  const requirements = [
    { id: "reputation", label: "Reputation", value: state.company.reputation, target: next.minReputation },
    { id: "value", label: "Company value", value, target: next.minValue },
    { id: "fleet", label: "Ships afloat", value: state.company.fleet.length, target: next.minFleet },
    { id: "passengers", label: "Guests carried", value: state.company.lifetimePassengers, target: next.minPassengers },
  ].map((item) => ({ ...item, progress: item.target ? clamp(item.value / item.target, 0, 1) : 1 }));
  return { current, next, overall: Math.min(...requirements.map((item) => item.progress)), requirements };
}

export function unlockedMarketIds(state) {
  const level = levelForState(state).id;
  return Object.values(MARKETS).filter((market) => market.unlockLevel <= level).map((market) => market.id);
}

export function unlockedHullIds(state) {
  const level = levelForState(state).id;
  return Object.values(HULLS).filter((hull) => hull.unlockLevel <= level).map((hull) => hull.id);
}

export function unlockedFeatureIds(state, hullId = null) {
  const level = levelForState(state).id;
  return Object.values(FEATURES)
    .filter((feature) => feature.unlockLevel <= level)
    .filter((feature) => !hullId || !(feature.blockedHulls || []).includes(hullId))
    .map((feature) => feature.id);
}

export function creditLimit(state) {
  return round(360 + levelForState(state).id * 260 + Math.max(0, state.company.reputation - 20) * 4, 1);
}

export function availableCredit(state) {
  return Math.max(0, creditLimit(state) - state.company.debt);
}

function canFund(state, cashNeeded, debtNeeded = 0) {
  return state.company.cash - cashNeeded >= -35 && debtNeeded <= availableCredit(state) + EPSILON;
}

export function orderShip(state, input, finance = "loan") {
  if (state.status !== "planning") return { ok: false, error: "The board is not in a planning phase." };
  const errors = validateShipDesign(state, input);
  if (errors.length) return { ok: false, error: errors[0], errors };
  const quote = quoteShipDesign(input);
  const loanShare = finance === "cash" ? 0 : finance === "balanced" ? 0.5 : 0.75;
  const debtNeeded = round(quote.cost * loanShare, 2);
  const cashNeeded = round(quote.cost - debtNeeded, 2);
  if (!canFund(state, cashNeeded, debtNeeded)) return { ok: false, error: "The order is beyond current cash and lender headroom." };
  state.company.cash = round(state.company.cash - cashNeeded, 2);
  state.company.debt = round(state.company.debt + debtNeeded, 2);
  const ship = makeShip(state, input);
  const order = {
    id: nextId(state, "order"),
    ship,
    quartersRemaining: quote.buildQuarters,
    finance,
    cashPaid: cashNeeded,
    debtRaised: debtNeeded,
  };
  state.company.orders.push(order);
  return { ok: true, order, quote };
}

export function assignRoute(state, shipId, marketId) {
  const ship = state.company.fleet.find((item) => item.id === shipId);
  if (!ship) return { ok: false, error: "Ship not found." };
  if (!unlockedMarketIds(state).includes(marketId)) return { ok: false, error: "That market is not unlocked yet." };
  ship.routeId = marketId;
  return { ok: true };
}

export function setMarketPrice(state, marketId, multiplier) {
  if (!MARKETS[marketId]) return { ok: false, error: "Unknown market." };
  state.company.prices[marketId] = round(clamp(Number(multiplier), 0.7, 1.45), 2);
  return { ok: true };
}

export function setMarketing(state, channelId, amount) {
  if (!MARKETING_CHANNELS[channelId]) return { ok: false, error: "Unknown channel." };
  state.company.marketing[channelId] = round(clamp(Number(amount), 0, 18), 1);
  return { ok: true };
}

export function setOperation(state, key, value) {
  const rules = {
    serviceSpend: [90, 245, 0],
    maintenance: [0.72, 1.35, 2],
    crewPay: [0.82, 1.28, 2],
    sustainabilitySpend: [0, 18, 1],
  };
  const rule = rules[key];
  if (!rule) return { ok: false, error: "Unknown operating control." };
  state.company[key] = round(clamp(Number(value), rule[0], rule[1]), rule[2]);
  return { ok: true };
}

export function rebrand(state, focusId) {
  if (!FOCUSES[focusId]) return { ok: false, error: "Unknown brand focus." };
  if (focusId === state.company.focusId) return { ok: true, cost: 0 };
  const cost = round(14 + state.company.reputation * 0.18, 1);
  if (!canFund(state, cost)) return { ok: false, error: "There is not enough cash to fund a credible rebrand." };
  state.company.cash = round(state.company.cash - cost, 2);
  state.company.reputation = round(clamp(state.company.reputation - 2, 0, 100), 1);
  state.company.focusId = focusId;
  pushNews(state, {
    icon: FOCUSES[focusId].icon,
    title: `${state.company.name} sharpens its proposition`,
    body: `The line is now positioned around ${FOCUSES[focusId].name.toLowerCase()}.`,
  });
  return { ok: true, cost };
}

export function borrow(state, amount = 50) {
  const requested = clamp(Number(amount), 1, 250);
  if (requested > availableCredit(state) + EPSILON) return { ok: false, error: "Lenders will not extend that much additional credit." };
  state.company.debt = round(state.company.debt + requested, 2);
  state.company.cash = round(state.company.cash + requested, 2);
  return { ok: true, amount: requested };
}

export function repayDebt(state, amount = 50) {
  const repayment = Math.min(clamp(Number(amount), 1, 250), state.company.debt, Math.max(0, state.company.cash + 10));
  if (repayment <= 0) return { ok: false, error: "There is no free cash available for repayment." };
  state.company.debt = round(state.company.debt - repayment, 2);
  state.company.cash = round(state.company.cash - repayment, 2);
  return { ok: true, amount: repayment };
}

export function refitShip(state, shipId, featureId) {
  const ship = state.company.fleet.find((item) => item.id === shipId);
  const feature = FEATURES[featureId];
  if (!ship || !feature) return { ok: false, error: "Choose a valid ship and feature." };
  if (ship.refitQuarters > 0) return { ok: false, error: "That ship is already in a refit period." };
  if (ship.features.includes(featureId)) return { ok: false, error: "That feature is already fitted." };
  if (ship.features.length >= ship.featureSlots) return { ok: false, error: "No feature slots remain on this hull." };
  if (!unlockedFeatureIds(state, ship.hullId).includes(featureId)) return { ok: false, error: "That feature is not available for this hull yet." };
  const cost = round(feature.cost * 1.22, 1);
  if (!canFund(state, cost)) return { ok: false, error: "The refit is beyond available cash." };
  state.company.cash = round(state.company.cash - cost, 2);
  const rebuilt = quoteShipDesign({ ...ship, features: [...ship.features, featureId] });
  Object.assign(ship, {
    ...rebuilt,
    id: ship.id,
    name: ship.name,
    condition: clamp(ship.condition + 8, 0, 100),
    ageQuarters: ship.ageQuarters,
    routeId: ship.routeId,
    refitQuarters: 1,
    lifetimePassengers: ship.lifetimePassengers,
    lastOccupancy: ship.lastOccupancy,
    lastProfit: ship.lastProfit,
    bookValue: round(ship.bookValue + cost * 0.68, 1),
  });
  return { ok: true, cost, ship };
}

export function repairShip(state, shipId) {
  const ship = state.company.fleet.find((item) => item.id === shipId);
  if (!ship) return { ok: false, error: "Ship not found." };
  if (ship.refitQuarters > 0) return { ok: false, error: "That ship is already in the yard." };
  if (ship.condition >= 97) return { ok: false, error: "That ship does not need a major yard period." };
  const cost = round(5 + (100 - ship.condition) * 0.42 + ship.cost * 0.018, 1);
  if (!canFund(state, cost)) return { ok: false, error: "The yard period is beyond available cash." };
  state.company.cash = round(state.company.cash - cost, 2);
  ship.condition = round(clamp(ship.condition + 24, 0, 100), 1);
  ship.refitQuarters = 1;
  ship.bookValue = round(ship.bookValue + cost * 0.35, 1);
  return { ok: true, cost, ship };
}

export function sellShip(state, shipId) {
  if (state.company.fleet.length <= 1) return { ok: false, error: "The line must keep at least one ship afloat." };
  const index = state.company.fleet.findIndex((item) => item.id === shipId);
  if (index < 0) return { ok: false, error: "Ship not found." };
  const ship = state.company.fleet[index];
  const ageFactor = clamp(1 - ship.ageQuarters * 0.012, 0.48, 1);
  const proceeds = round(ship.bookValue * ship.resaleFactor * ageFactor * (0.72 + ship.condition / 360), 1);
  state.company.fleet.splice(index, 1);
  state.company.cash = round(state.company.cash + proceeds, 2);
  return { ok: true, proceeds, ship };
}

function marketingSpend(company) {
  return Object.values(company.marketing).reduce((sum, value) => sum + finite(value), 0);
}

function marketingEffect(company, market) {
  let weighted = 0;
  for (const [id, amount] of Object.entries(company.marketing)) {
    const channel = MARKETING_CHANNELS[id];
    if (!channel) continue;
    let fit = 0;
    for (const segment of SEGMENTS) fit += (market.traits[segment] ?? 1) * (channel.fit[segment] ?? 1);
    weighted += amount * (fit / SEGMENTS.length);
  }
  return 1 + Math.log1p(weighted) / 22 + (company.marketing.loyalty ?? 0) / 260;
}

function productScore(ship, focusId, market, event) {
  const focus = FOCUSES[focusId] ?? FOCUSES.premium;
  let weighted = 0;
  let totalWeight = 0;
  for (const segment of SEGMENTS) {
    const weight = (market.traits[segment] ?? 1) * (event.focusDemand?.[segment] ?? 1);
    weighted += (ship.appeal[segment] ?? 50) * weight * (focus.fit[segment] ?? 1);
    totalWeight += weight;
  }
  return weighted / Math.max(totalWeight, EPSILON);
}

function playerShipScore(ship, company, market, event) {
  const product = productScore(ship, company.focusId, market, event);
  const price = company.prices[market.id] ?? 1;
  const priceAttractiveness = price ** -1.58;
  const service = clamp(0.72 + (company.serviceSpend - 90) / 310, 0.72, 1.25);
  const crew = clamp(0.84 + (company.crewPay - 0.82) * 0.75, 0.84, 1.2);
  const condition = clamp(0.68 + ship.condition / 300, 0.78, 1.03);
  const reputation = 0.82 + company.reputation / 250;
  const eco = 0.92 + ((ship.eco - 40) / 420) * (event.ecoSensitivity ?? 1) + company.sustainability / 850;
  const hullFit = market.hullPreference?.[ship.hullId] ?? 1;
  return Math.max(0.05, (product / 58) * priceAttractiveness * service * crew * condition * reputation * eco * hullFit * marketingEffect(company, market));
}

function rivalShipScore(ship, rival, market, event) {
  const product = productScore(ship, rival.focus, market, event);
  const price = rival.priceByMarket[market.id] ?? rival.basePrice;
  const priceAttractiveness = price ** -1.52;
  const reputation = 0.82 + rival.reputation / 250;
  const eco = 0.93 + ((ship.eco - 40) / 460) * (event.ecoSensitivity ?? 1) + rival.sustainability / 930;
  const hullFit = market.hullPreference?.[ship.hullId] ?? 1;
  const marketing = 1 + Math.log1p(rival.marketing) / 17;
  const condition = clamp(0.68 + ship.condition / 300, 0.78, 1.03);
  return Math.max(0.05, (product / 58) * priceAttractiveness * rival.service * reputation * eco * hullFit * marketing * condition);
}

function shipCapacity(ship) {
  if (ship.refitQuarters > 0) return 0;
  const conditionFactor = clamp(0.82 + ship.condition / 560, 0.87, 1);
  return Math.max(0, Math.round(ship.pax * ship.sailings * conditionFactor));
}

function allocateDemand(demand, operators) {
  const allocations = Object.fromEntries(operators.map((operator) => [operator.id, 0]));
  let remaining = Math.max(0, demand);
  let active = operators.filter((operator) => operator.capacity > 0 && operator.weight > 0);
  for (let pass = 0; pass < operators.length + 3 && remaining > 0.5 && active.length; pass += 1) {
    const totalWeight = active.reduce((sum, operator) => sum + operator.weight, 0);
    if (totalWeight <= 0) break;
    let allocated = 0;
    for (const operator of active) {
      const spare = operator.capacity - allocations[operator.id];
      if (spare <= 0) continue;
      const share = remaining * (operator.weight / totalWeight);
      const amount = Math.min(spare, share);
      allocations[operator.id] += amount;
      allocated += amount;
    }
    if (allocated <= 0.01) break;
    remaining -= allocated;
    active = active.filter((operator) => operator.capacity - allocations[operator.id] > 0.5);
  }
  return allocations;
}

function neutralEvent() {
  return { id: "forecast", title: "Board forecast", icon: "📊", body: "A planning case without a surprise event.", demand: 1, fuel: 1, onboard: 1, marketDemand: {}, focusDemand: {}, ecoSensitivity: 1, cost: 0 };
}

function entriesForMarket(state, market, event) {
  const playerShips = state.company.fleet.filter((ship) => ship.routeId === market.id && ship.refitQuarters <= 0);
  const playerCapacity = playerShips.reduce((sum, ship) => sum + shipCapacity(ship), 0);
  const entries = [
    {
      id: "player",
      ships: playerShips,
      capacity: playerCapacity,
      weight: playerShips.reduce((sum, ship) => sum + shipCapacity(ship) * playerShipScore(ship, state.company, market, event), 0),
    },
  ];
  for (const rival of state.rivals) {
    const ships = rival.fleet.filter((ship) => ship.routeId === market.id && ship.refitQuarters <= 0);
    entries.push({
      id: rival.id,
      rival,
      ships,
      capacity: ships.reduce((sum, ship) => sum + shipCapacity(ship), 0),
      weight: ships.reduce((sum, ship) => sum + shipCapacity(ship) * rivalShipScore(ship, rival, market, event), 0),
    });
  }
  return entries;
}

function distributeToShips(passengers, ships, scoreFor) {
  if (!ships.length || passengers <= 0) return [];
  const entries = ships.map((ship) => ({ id: ship.id, capacity: shipCapacity(ship), weight: shipCapacity(ship) * Math.max(0.05, scoreFor(ship)) }));
  const allocations = allocateDemand(passengers, entries);
  return ships.map((ship) => ({ ship, guests: Math.round(allocations[ship.id] ?? 0), capacity: shipCapacity(ship) }));
}

function playerShipFinancials(state, ship, market, event, guests, capacity) {
  const company = state.company;
  const focus = FOCUSES[company.focusId];
  const occupancy = capacity > 0 ? guests / capacity : 0;
  const fare = market.baseFare * (company.prices[market.id] ?? 1) * ship.fareMultiplier;
  const onboard = market.onboard * ship.onboardMultiplier * focus.onboard * (event.onboard ?? 1);
  const revenue = (guests * (fare + onboard)) / 1_000_000;
  const fuel = ship.fuel * market.distance * (event.fuel ?? 1) * (0.82 + occupancy * 0.18);
  const crew = ship.crew * company.crewPay;
  const maintenance = ship.maintenanceCost * company.maintenance;
  const ports = (guests * market.portCost) / 1_000_000;
  const service = (guests * company.serviceSpend) / 1_000_000;
  const costs = fuel + crew + maintenance + ports + service + ship.runningCost;
  const fit = playerShipScore(ship, company, market, event);
  const satisfaction = clamp(
    69 +
      (company.serviceSpend - 145) * 0.11 +
      (company.crewPay - 1) * 30 +
      (company.maintenance - 1) * 18 +
      (ship.condition - 80) * 0.18 +
      (fit - 1) * 13 -
      Math.max(0, occupancy - 0.94) * 80 -
      Math.max(0, (company.prices[market.id] ?? 1) - 1.08) * 28,
    18,
    96,
  );
  return {
    shipId: ship.id,
    shipName: ship.name,
    marketId: market.id,
    marketName: market.name,
    guests,
    capacity,
    occupancy,
    fare,
    onboard,
    revenue,
    fuel,
    crew,
    maintenance,
    ports,
    service,
    running: ship.runningCost,
    costs,
    profit: revenue - costs,
    satisfaction,
  };
}

function rivalShipFinancials(rival, ship, market, event, guests, capacity) {
  const focus = FOCUSES[rival.focus];
  const occupancy = capacity > 0 ? guests / capacity : 0;
  const fare = market.baseFare * (rival.priceByMarket[market.id] ?? rival.basePrice) * ship.fareMultiplier;
  const onboard = market.onboard * ship.onboardMultiplier * focus.onboard * 0.96 * (event.onboard ?? 1);
  const revenue = (guests * (fare + onboard)) / 1_000_000;
  const fuel = ship.fuel * market.distance * (event.fuel ?? 1) * (0.82 + occupancy * 0.18);
  const crew = ship.crew * rival.service * 0.96;
  const maintenance = ship.maintenanceCost * (0.93 + rival.service * 0.08);
  const ports = (guests * market.portCost) / 1_000_000;
  const service = (guests * (125 + rival.service * 33)) / 1_000_000;
  const costs = fuel + crew + maintenance + ports + service + ship.runningCost;
  return { revenue, costs, profit: revenue - costs, occupancy, guests, capacity };
}

function calculateQuarter(state, event = neutralEvent()) {
  const difficulty = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.standard;
  const marketResults = [];
  const shipResults = [];
  const rivalTotals = Object.fromEntries(state.rivals.map((rival) => [rival.id, { passengers: 0, revenue: 0, costs: 0, profit: 0, capacity: 0 }]));
  let totalMarketPassengers = 0;
  let playerPassengers = 0;
  let playerCapacity = 0;
  let playerRevenue = 0;
  let playerShipCosts = 0;

  for (const market of Object.values(MARKETS)) {
    const demand = Math.max(
      0,
      market.baseDemand *
        (market.seasonality[state.quarter % 4] ?? 1) *
        difficulty.demand *
        (event.demand ?? 1) *
        (event.marketDemand?.[market.id] ?? 1),
    );
    const entries = entriesForMarket(state, market, event);
    const allocations = allocateDemand(demand, entries);
    const actualPassengers = Object.values(allocations).reduce((sum, value) => sum + value, 0);
    totalMarketPassengers += actualPassengers;

    const playerEntry = entries[0];
    const playerAllocation = allocations.player ?? 0;
    for (const allocation of distributeToShips(playerAllocation, playerEntry.ships, (ship) => playerShipScore(ship, state.company, market, event))) {
      const result = playerShipFinancials(state, allocation.ship, market, event, allocation.guests, allocation.capacity);
      shipResults.push(result);
      playerPassengers += result.guests;
      playerCapacity += result.capacity;
      playerRevenue += result.revenue;
      playerShipCosts += result.costs;
    }

    for (const entry of entries.slice(1)) {
      for (const allocation of distributeToShips(allocations[entry.id] ?? 0, entry.ships, (ship) => rivalShipScore(ship, entry.rival, market, event))) {
        const result = rivalShipFinancials(entry.rival, allocation.ship, market, event, allocation.guests, allocation.capacity);
        const total = rivalTotals[entry.id];
        total.passengers += result.guests;
        total.revenue += result.revenue;
        total.costs += result.costs;
        total.profit += result.profit;
        total.capacity += result.capacity;
      }
    }

    marketResults.push({
      marketId: market.id,
      marketName: market.name,
      demand,
      passengers: actualPassengers,
      playerPassengers: playerAllocation,
      playerCapacity: playerEntry.capacity,
      playerShare: actualPassengers > 0 ? playerAllocation / actualPassengers : 0,
      playerOccupancy: playerEntry.capacity > 0 ? playerAllocation / playerEntry.capacity : 0,
      operatorPassengers: Object.fromEntries(entries.map((entry) => [entry.id, Math.round(allocations[entry.id] ?? 0)])),
      operatorCapacity: Object.fromEntries(entries.map((entry) => [entry.id, Math.round(entry.capacity)])),
    });
  }

  for (const ship of state.company.fleet.filter((item) => item.refitQuarters > 0)) {
    const costs = ship.crew * state.company.crewPay * 0.72 + ship.maintenanceCost * 0.8 + ship.runningCost * 0.3;
    playerShipCosts += costs;
    shipResults.push({ shipId: ship.id, shipName: ship.name, marketId: null, marketName: "Refit yard", guests: 0, capacity: 0, occupancy: 0, fare: 0, onboard: 0, revenue: 0, fuel: 0, crew: ship.crew * state.company.crewPay * 0.72, maintenance: ship.maintenanceCost * 0.8, ports: 0, service: 0, running: ship.runningCost * 0.3, costs, profit: -costs, satisfaction: 0 });
  }

  const marketing = marketingSpend(state.company);
  const sustainability = state.company.sustainabilitySpend;
  const interest = state.company.debt * difficulty.interest;
  const corporate = 0.65 + state.company.fleet.length * 0.25 + state.company.orders.length * 0.15;
  const eventCost = event.cost ?? 0;
  const operatingCosts = playerShipCosts + marketing + sustainability + interest + corporate + eventCost;
  const operatingProfit = playerRevenue - operatingCosts;
  const activeResults = shipResults.filter((result) => result.capacity > 0);
  const satisfaction = activeResults.length
    ? activeResults.reduce((sum, result) => sum + result.satisfaction * result.guests, 0) / Math.max(1, activeResults.reduce((sum, result) => sum + result.guests, 0))
    : 42;
  const averageOccupancy = playerCapacity > 0 ? playerPassengers / playerCapacity : 0;

  for (const rival of state.rivals) {
    const total = rivalTotals[rival.id];
    total.marketing = rival.marketing;
    total.interest = rival.debt * difficulty.interest * 0.92;
    total.corporate = 1.2 + rival.fleet.length * 0.35;
    total.profit -= total.marketing + total.interest + total.corporate;
    total.occupancy = total.capacity > 0 ? total.passengers / total.capacity : 0;
    total.marketShare = totalMarketPassengers > 0 ? total.passengers / totalMarketPassengers : 0;
  }

  return {
    quarter: state.quarter,
    quarterLabel: quarterLabel(state.quarter),
    season: calendarSeason(state.quarter),
    event,
    marketResults,
    shipResults,
    rivalTotals,
    passengerRevenue: playerRevenue,
    shipCosts: playerShipCosts,
    marketing,
    sustainability,
    interest,
    corporate,
    eventCost,
    revenue: playerRevenue,
    costs: operatingCosts,
    operatingProfit,
    passengers: playerPassengers,
    capacity: playerCapacity,
    averageOccupancy,
    satisfaction,
    marketShare: totalMarketPassengers > 0 ? playerPassengers / totalMarketPassengers : 0,
    totalMarketPassengers,
  };
}

export function forecastQuarter(state) {
  const report = calculateQuarter(state, neutralEvent());
  return { ...report, enterpriseValue: enterpriseValue(state), level: levelForState(state) };
}

function chooseGlobalEvent(state) {
  return weightedChoice(state, GLOBAL_EVENTS, (event) => event.weight ?? 1) ?? GLOBAL_EVENTS[0];
}

function chooseCompanyEvent(state, report) {
  const difficulty = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.standard;
  const context = { company: state.company, report, state };
  const candidates = COMPANY_EVENTS.filter((event) => event.id !== "quiet" && event.test(context));
  if (!candidates.length) return COMPANY_EVENTS.find((event) => event.id === "quiet");
  const choice = candidates[Math.floor(random(state) * candidates.length)];
  const negative = (choice.effects.cash ?? 0) < 0 || (choice.effects.reputation ?? 0) < 0;
  const chance = clamp(choice.chance * (negative ? difficulty.incident : 1), 0, 0.72);
  return random(state) < chance ? choice : COMPANY_EVENTS.find((event) => event.id === "quiet");
}

function applyCompanyEvent(state, event) {
  const effects = event.effects ?? {};
  state.company.cash = round(state.company.cash + (effects.cash ?? 0), 2);
  state.company.reputation = round(clamp(state.company.reputation + (effects.reputation ?? 0), 0, 100), 1);
  state.company.sustainability = round(clamp(state.company.sustainability + (effects.sustainability ?? 0), 0, 100), 1);
}

function reputationDelta(report, company) {
  return clamp(
    (report.satisfaction - 64) / 8 +
      (report.averageOccupancy >= 0.68 ? 0.45 : -0.75) +
      (report.operatingProfit >= 0 ? 0.35 : -0.35) +
      (company.marketing.loyalty ?? 0) / 16,
    -5.5,
    4.8,
  );
}

function sustainabilityDelta(report, company) {
  const active = report.shipResults.filter((result) => result.capacity > 0);
  const fleetEco = active.length
    ? active.reduce((sum, result) => {
        const ship = company.fleet.find((item) => item.id === result.shipId);
        return sum + (ship?.eco ?? 35) * result.capacity;
      }, 0) / Math.max(1, active.reduce((sum, result) => sum + result.capacity, 0))
    : 35;
  return clamp((fleetEco - 42) / 35 + company.sustainabilitySpend / 9 - 0.55, -2.8, 3.4);
}

function updatePlayerShips(state, report) {
  const byShip = Object.fromEntries(report.shipResults.map((result) => [result.shipId, result]));
  for (const ship of state.company.fleet) {
    const result = byShip[ship.id];
    ship.ageQuarters += 1;
    if (ship.refitQuarters > 0) {
      ship.refitQuarters = Math.max(0, ship.refitQuarters - 1);
      ship.condition = round(clamp(ship.condition + 3, 30, 100), 1);
      ship.lastOccupancy = 0;
      ship.lastProfit = result?.profit ?? 0;
      continue;
    }
    const occupancyStress = Math.max(0, (result?.occupancy ?? 0) - 0.92) * 3;
    const ageStress = Math.max(0, ship.ageQuarters - 28) * 0.018;
    const maintenanceEffect = (state.company.maintenance - 1) * 6.5;
    ship.condition = round(clamp(ship.condition - 1.5 - occupancyStress - ageStress + maintenanceEffect, 35, 100), 1);
    ship.lastOccupancy = result?.occupancy ?? 0;
    ship.lastProfit = result?.profit ?? -ship.maintenanceCost;
    ship.lifetimePassengers += result?.guests ?? 0;
    ship.bookValue = round(Math.max(ship.cost * 0.34, ship.bookValue * 0.984), 1);
  }
}

function processPlayerOrders(state) {
  const deliveries = [];
  for (const order of state.company.orders) order.quartersRemaining -= 1;
  const remaining = [];
  for (const order of state.company.orders) {
    if (order.quartersRemaining <= 0) {
      const marketIds = unlockedMarketIds(state);
      order.ship.routeId = marketIds.includes("med") ? "med" : marketIds[0];
      state.company.fleet.push(order.ship);
      deliveries.push(order.ship);
    } else remaining.push(order);
  }
  state.company.orders = remaining;
  return deliveries;
}

function chooseRivalHull(state, rival) {
  const late = state.quarter >= 12;
  if (rival.temperament === "specialist") return random(state) < 0.68 ? "expedition" : "boutique";
  if (rival.temperament === "discounter") return late && random(state) < 0.35 ? "resort" : "mid";
  if (rival.temperament === "expander") return late && random(state) < 0.34 ? "mega" : "resort";
  return random(state) < 0.58 ? "mid" : "boutique";
}

function updateRivals(state, report) {
  const difficulty = DIFFICULTIES[state.difficultyId] ?? DIFFICULTIES.standard;
  for (const rival of state.rivals) {
    const total = report.rivalTotals[rival.id];
    rival.cash = round(rival.cash + total.profit, 2);
    rival.marketShare = total.marketShare;
    rival.lifetimePassengers += Math.round(total.passengers);
    rival.reputation = round(clamp(rival.reputation + (total.occupancy - 0.78) * 4 + (rival.service - 1) * 1.5 + randomBetween(state, -0.7, 0.7), 5, 92), 1);
    rival.sustainability = round(clamp(rival.sustainability + (rival.focus === "adventure" ? 0.5 : 0.18), 10, 92), 1);
    for (const ship of rival.fleet) {
      ship.ageQuarters += 1;
      ship.condition = round(clamp(ship.condition - 1.8 + (rival.service - 1) * 2.2, 42, 100), 1);
      ship.bookValue = round(Math.max(ship.cost * 0.34, ship.bookValue * 0.985), 1);
    }
    for (const order of rival.orders) order.quartersRemaining -= 1;
    const building = [];
    for (const order of rival.orders) {
      if (order.quartersRemaining <= 0) rival.fleet.push(order.ship);
      else building.push(order);
    }
    rival.orders = building;
    rival.history.push({ quarter: state.quarter, cash: rival.cash, profit: total.profit, marketShare: total.marketShare, value: rivalEnterpriseValue(rival) });
    if (rival.history.length > 32) rival.history.shift();

    const desiredFleet = 2 + Math.floor((state.quarter + 1) / 5) + (rival.temperament === "expander" ? 1 : 0);
    const aggression = difficulty.ai * (rival.temperament === "expander" ? 1.12 : rival.temperament === "disciplined" ? 0.88 : 1);
    if (!rival.orders.length && rival.fleet.length < desiredFleet && random(state) < 0.42 * aggression) {
      const ship = createRivalShip(state, rival, chooseRivalHull(state, rival), rival.fleet.length);
      const deposit = ship.cost * 0.24;
      if (rival.cash - deposit > -25) {
        rival.cash = round(rival.cash - deposit, 2);
        rival.debt = round(rival.debt + ship.cost * 0.76, 2);
        rival.orders.push({ ship, quartersRemaining: ship.buildQuarters });
      }
    }
  }
}

function candidateRivalMarkets(state, rival) {
  return Object.values(MARKETS).filter((market) => {
    if (market.id === "world" && state.quarter < 16) return false;
    if (market.id === "expedition" && rival.focus !== "adventure" && rival.temperament !== "specialist") return state.quarter >= 9;
    return true;
  });
}

export function planRivals(state) {
  const seasonIndex = state.quarter % 4;
  for (const rival of state.rivals) {
    const marketLoad = {};
    for (const ship of rival.fleet) {
      const scored = candidateRivalMarkets(state, rival)
        .map((market) => {
          const home = rival.homeMarkets.includes(market.id) ? 1.18 : 1;
          const demand = market.baseDemand * market.seasonality[seasonIndex];
          const hullFit = market.hullPreference?.[ship.hullId] ?? 1;
          const segmentFit = market.traits[rival.focus] ?? 1;
          const crowdPenalty = 1 / (1 + (marketLoad[market.id] ?? 0) * 0.42);
          return { market, score: demand * home * hullFit * segmentFit * crowdPenalty * randomBetween(state, 0.9, 1.1) };
        })
        .sort((a, b) => b.score - a.score);
      const choice = weightedChoice(state, scored.slice(0, 3), (item) => item.score) ?? scored[0];
      ship.routeId = choice?.market.id ?? "med";
      marketLoad[ship.routeId] = (marketLoad[ship.routeId] ?? 0) + 1;
    }
    for (const market of Object.values(MARKETS)) {
      const seasonPressure = market.seasonality[seasonIndex] > 1.15 ? 1.025 : market.seasonality[seasonIndex] < 0.7 ? 0.96 : 1;
      rival.priceByMarket[market.id] = round(clamp(rival.basePrice * seasonPressure + randomBetween(state, -0.025, 0.025), 0.76, 1.34), 2);
    }
  }
}

function pushNews(state, item) {
  state.news.unshift({ quarter: state.quarter, ...item });
  state.news = state.news.slice(0, 18);
}

export function rankCompanies(state) {
  const entries = [
    {
      id: "player",
      name: state.company.name,
      icon: "⚓",
      colour: FOCUSES[state.company.focusId].colour,
      value: enterpriseValue(state),
      reputation: state.company.reputation,
      marketShare: state.company.marketShare,
      fleet: state.company.fleet.length,
      isPlayer: true,
    },
    ...state.rivals.map((rival) => ({
      id: rival.id,
      name: rival.name,
      icon: rival.icon,
      colour: rival.colour,
      value: rivalEnterpriseValue(rival),
      reputation: rival.reputation,
      marketShare: rival.marketShare,
      fleet: rival.fleet.length,
      isPlayer: false,
    })),
  ];
  entries.sort((a, b) => b.value + b.reputation * 4.5 + b.marketShare * 420 - (a.value + a.reputation * 4.5 + a.marketShare * 420));
  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function campaignStatus(state, rankings) {
  const playerRank = rankings.find((item) => item.id === "player")?.rank ?? rankings.length;
  const value = enterpriseValue(state);
  const level = levelForState(state).id;
  if (state.company.cash < -70 || state.company.debt > creditLimit(state) * 1.28) return { status: "bankrupt", title: "The lenders take the wheel", playerRank };
  if (level >= 5 && playerRank === 1 && value >= 2_350) return { status: "won", title: "The ocean has a new leader", playerRank };
  if (!state.sandbox && state.quarter >= state.campaignQuarters) {
    return { status: playerRank === 1 && level >= 4 ? "won" : "finished", title: playerRank === 1 ? "Top of the fleet table" : "The campaign closes", playerRank };
  }
  return { status: "planning", title: "", playerRank };
}

export function advanceQuarter(state) {
  if (state.status !== "planning") return { ok: false, error: "The campaign is not currently accepting a new quarter." };
  const oldLevel = levelForState(state).id;
  const globalEvent = chooseGlobalEvent(state);
  const report = calculateQuarter(state, globalEvent);

  state.company.cash = round(state.company.cash + report.operatingProfit, 2);
  state.company.lifetimePassengers += report.passengers;
  state.company.lifetimeProfit = round(state.company.lifetimeProfit + report.operatingProfit, 2);
  state.company.marketShare = report.marketShare;
  state.company.reputation = round(clamp(state.company.reputation + reputationDelta(report, state.company), 0, 100), 1);
  state.company.sustainability = round(clamp(state.company.sustainability + sustainabilityDelta(report, state.company), 0, 100), 1);

  updatePlayerShips(state, report);
  updateRivals(state, report);
  const companyEvent = chooseCompanyEvent(state, report);
  applyCompanyEvent(state, companyEvent);
  const deliveries = processPlayerOrders(state);

  state.quarter += 1;
  const newLevel = levelForState(state).id;
  state.company.currentLevel = newLevel;
  const levelUp = newLevel > oldLevel ? LEVELS.find((level) => level.id === newLevel) : null;

  state.company.history.push({
    quarter: report.quarter,
    label: report.quarterLabel,
    revenue: round(report.revenue, 2),
    costs: round(report.costs, 2),
    profit: round(report.operatingProfit, 2),
    cash: round(state.company.cash, 2),
    debt: round(state.company.debt, 2),
    passengers: report.passengers,
    occupancy: round(report.averageOccupancy, 4),
    reputation: state.company.reputation,
    sustainability: state.company.sustainability,
    marketShare: round(report.marketShare, 4),
    value: round(enterpriseValue(state), 2),
  });
  if (state.company.history.length > 40) state.company.history.shift();

  pushNews(state, { icon: globalEvent.icon, title: globalEvent.title, body: globalEvent.body });
  if (companyEvent.id !== "quiet") pushNews(state, { icon: companyEvent.icon, title: companyEvent.title, body: companyEvent.body });
  for (const ship of deliveries) pushNews(state, { icon: HULLS[ship.hullId].icon, title: `${ship.name} joins the fleet`, body: `${HULLS[ship.hullId].name} capacity arrives from the yard and opens for deployment.` });
  if (levelUp) pushNews(state, { icon: levelUp.badge, title: `Advanced: ${levelUp.name}`, body: levelUp.unlockText });

  const rankings = rankCompanies(state);
  const outcome = campaignStatus(state, rankings);
  state.status = outcome.status;
  if (state.status === "planning") planRivals(state);

  const completedReport = {
    ...report,
    companyEvent,
    deliveries: deliveries.map((ship) => ({ id: ship.id, name: ship.name, hullId: ship.hullId })),
    levelUp,
    rankings,
    outcome,
    endingCash: state.company.cash,
    endingDebt: state.company.debt,
    endingReputation: state.company.reputation,
    endingSustainability: state.company.sustainability,
    endingValue: enterpriseValue(state),
  };
  state.lastReport = completedReport;
  return { ok: true, report: completedReport };
}

export function continueSandbox(state) {
  if (!state || !["won", "finished"].includes(state.status)) return { ok: false, error: "The campaign has not reached an ending." };
  state.sandbox = true;
  state.status = "planning";
  state.campaignQuarters = Math.max(state.campaignQuarters, state.quarter + 100);
  planRivals(state);
  return { ok: true };
}

export function marketPressure(state, marketId) {
  if (!MARKETS[marketId]) return [];
  const playerCapacity = state.company.fleet
    .filter((ship) => ship.routeId === marketId && ship.refitQuarters <= 0)
    .reduce((sum, ship) => sum + shipCapacity(ship), 0);
  return [
    { id: "player", name: state.company.name, capacity: playerCapacity, colour: FOCUSES[state.company.focusId].colour, isPlayer: true },
    ...state.rivals.map((rival) => ({
      id: rival.id,
      name: rival.name,
      capacity: rival.fleet.filter((ship) => ship.routeId === marketId && ship.refitQuarters <= 0).reduce((sum, ship) => sum + shipCapacity(ship), 0),
      colour: rival.colour,
      isPlayer: false,
    })),
  ].sort((a, b) => b.capacity - a.capacity);
}

export function serialisableState(state) {
  return JSON.parse(JSON.stringify(state));
}

const CAMPAIGN_STATUSES = new Set(["planning", "bankrupt", "won", "finished"]);

// Validate a ship's registry references + numeric shape — shared by the player fleet and
// the ships attached to build orders. A corrupted same-version save can carry an unknown
// feature / cabin-plan / speed id or a bad livery: quoteShipDesign silently filters those
// on *creation*, but the render path (app.mjs) indexes FEATURES/CABIN_PLANS/HULLS directly
// and throws `Cannot read properties of undefined` on an unknown id — so such a save must be
// rejected here, before loadGame hands it to a render that would crash mid-screen.
function validateShipRefs(ship, label, errors) {
  if (!ship || typeof ship !== "object") {
    errors.push(`${label} is not an object.`);
    return;
  }
  if (!HULLS[ship.hullId]) errors.push(`${label}: unknown hull ${ship.hullId}.`);
  if (!CABIN_PLANS[ship.cabinPlanId]) errors.push(`${label}: unknown cabin plan ${ship.cabinPlanId}.`);
  if (!SPEEDS[ship.speedId]) errors.push(`${label}: unknown speed ${ship.speedId}.`);
  if (!Array.isArray(ship.features)) errors.push(`${label}: features is not an array.`);
  else for (const id of ship.features) if (!FEATURES[id]) errors.push(`${label}: unknown feature ${id}.`);
  if (typeof ship.livery !== "string" || !/^#[0-9a-f]{6}$/i.test(ship.livery)) errors.push(`${label}: invalid livery ${ship.livery}.`);
  for (const key of ["pax", "condition", "bookValue", "fuel", "crew"]) {
    if (!Number.isFinite(ship[key])) errors.push(`${label} ${key} is not finite.`);
  }
}

export function validateState(state) {
  const errors = [];
  if (!state || typeof state !== "object") return ["State is not an object."];
  if (!DIFFICULTIES[state.difficultyId]) errors.push("Unknown difficulty.");
  if (!FOCUSES[state.company?.focusId]) errors.push("Unknown company focus.");
  if (!CAMPAIGN_STATUSES.has(state.status)) errors.push(`Unknown campaign status ${state.status}.`);
  if (!Array.isArray(state.news)) errors.push("News is not an array."); // app.mjs renders state.news.slice(...) unguarded
  for (const key of ["cash", "debt", "reputation", "sustainability", "serviceSpend", "maintenance", "crewPay"]) {
    if (!Number.isFinite(state.company?.[key])) errors.push(`Company ${key} is not finite.`);
  }
  const shipIds = new Set();
  for (const ship of state.company?.fleet ?? []) {
    if (shipIds.has(ship?.id)) errors.push(`Duplicate ship id ${ship?.id}.`);
    shipIds.add(ship?.id);
    validateShipRefs(ship, `Ship ${ship?.name ?? ship?.id ?? "?"}`, errors);
    if (ship && !MARKETS[ship.routeId]) errors.push(`Unknown route ${ship.routeId}.`);
  }
  if (!Array.isArray(state.company?.orders)) {
    errors.push("Company orders is not an array.");
  } else {
    for (const order of state.company.orders) {
      if (!order || typeof order !== "object") {
        errors.push("An order is not an object.");
        continue;
      }
      validateShipRefs(order.ship, `Order ${order.ship?.name ?? order.id ?? "?"}`, errors);
      if (!Number.isFinite(order.quartersRemaining)) errors.push(`Order ${order.id ?? "?"} quartersRemaining is not finite.`);
    }
  }
  if (!Array.isArray(state.rivals)) {
    errors.push("Rivals is not an array.");
  } else {
    for (const rival of state.rivals) {
      if (!rival || typeof rival !== "object") {
        errors.push("A rival is not an object.");
        continue;
      }
      const label = rival.id ?? rival.name ?? "?";
      if (!Array.isArray(rival.fleet)) {
        errors.push(`Rival ${label} fleet is not an array.`);
      } else {
        for (const ship of rival.fleet) validateShipRefs(ship, `Rival ${label} ship ${ship?.name ?? "?"}`, errors);
      }
      // rivalEnterpriseValue reduces over rival.orders on every rank/render, so a null/bad
      // element crashes the bridge — element-level checks, like the player orders above.
      if (!Array.isArray(rival.orders)) {
        errors.push(`Rival ${label} orders is not an array.`);
      } else {
        for (const order of rival.orders) {
          if (!order || typeof order !== "object") {
            errors.push(`Rival ${label} has a non-object order.`);
            continue;
          }
          validateShipRefs(order.ship, `Rival ${label} order ${order.ship?.name ?? "?"}`, errors);
          if (!Number.isFinite(order.quartersRemaining)) errors.push(`Rival ${label} order quartersRemaining is not finite.`);
        }
      }
    }
  }
  for (const [marketId, price] of Object.entries(state.company?.prices ?? {})) {
    if (!MARKETS[marketId]) errors.push(`Unknown price market ${marketId}.`);
    if (!Number.isFinite(price) || price < 0.69 || price > 1.46) errors.push(`Invalid price for ${marketId}.`);
  }
  try {
    const forecast = forecastQuarter(state);
    for (const key of ["revenue", "costs", "operatingProfit", "averageOccupancy", "marketShare"]) {
      if (!Number.isFinite(forecast[key])) errors.push(`Forecast ${key} is not finite.`);
    }
  } catch (error) {
    errors.push(`Forecast failed: ${error.message}`);
  }
  return errors;
}
