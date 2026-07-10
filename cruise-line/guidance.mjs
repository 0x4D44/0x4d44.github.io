export const ADVISERS = Object.freeze({
  finance: Object.freeze({
    id: "finance",
    icon: "🧾",
    name: "Sir Barnaby Quittance",
    role: "Acting Under-Secretary for Money Which Still Exists",
    colour: "#ffd166",
  }),
  commercial: Object.freeze({
    id: "commercial",
    icon: "🧪",
    name: "Dr Pippa Gauge",
    role: "Director of Applied Passenger Containment",
    colour: "#9c83ff",
  }),
  operations: Object.freeze({
    id: "operations",
    icon: "🔧",
    name: "Moira Spanner",
    role: "Chief Engineer, Office of Avoidable Clanking",
    colour: "#5bdef9",
  }),
});

export const TOUR_TABS = Object.freeze(["bridge", "fleet", "markets", "brand", "finance"]);

const TOUR_GUIDANCE = Object.freeze({
  bridge: {
    adviser: ADVISERS.finance,
    title: "Read the forecast before authorising weather",
    body: "The five bridge cards describe the current plan, not fate. Routes, fares and operating controls recalculate them immediately; surprise events begin only after Set sail.",
    action: { tab: "fleet", label: "Inspect the ship" },
  },
  fleet: {
    adviser: ADVISERS.operations,
    title: "Every ship is a hypothesis with lifeboats",
    body: "Check route, forecast load, profit and condition together. A splendid ship in the wrong market is merely a very expensive way to move empty deckchairs.",
    action: { tab: "markets", label: "Compare the markets" },
  },
  markets: {
    adviser: ADVISERS.commercial,
    title: "Full cabins are a clue, not a trophy",
    body: "Compare seasonality and rival capacity before setting the fare. Below 68% occupancy harms reputation; above 94% strains service. Seek profit without compressing the guests.",
    action: { tab: "brand", label: "Fund the promise" },
  },
  brand: {
    adviser: ADVISERS.operations,
    title: "A slogan cannot clean a cabin",
    body: "Guest service, crew pay and maintenance protect demand and satisfaction; marketing only finds more people to disappoint. Keep maintenance at 102% or better.",
    action: { tab: "finance", label: "Check the consequences" },
  },
  finance: {
    adviser: ADVISERS.finance,
    title: "Debt is a tool, not a nautical theme",
    body: "Company value rewards cash, useful ships, reputation and share, then subtracts debt with suspicious literalism. Leave enough headroom for incidents and delayed newbuild capacity.",
    action: { tab: "bridge", label: "Return to the forecast" },
  },
  shipyard: {
    adviser: ADVISERS.finance,
    title: "The shipyard has labelled every option strategic",
    body: "A coherent ship can create demand; an incoherent one creates a brochure. Check audience fit, cash on signing, new debt and delivery delay before approving the shiny object.",
    action: { tab: "finance", label: "Check the funding" },
  },
});

function contextual(adviser, title, body, tab, label, key) {
  return { adviser, title, body, action: { tab, label }, key };
}

export function guidanceFor({ state, forecast, tab }) {
  const safeTab = Object.hasOwn(TOUR_GUIDANCE, tab) ? tab : "bridge";
  const company = state?.company || {};
  const ships = Array.isArray(company.fleet) ? company.fleet : [];
  const worstShip = [...ships].sort((left, right) => (left.condition ?? 100) - (right.condition ?? 100))[0];
  let advice;

  if (Number.isFinite(company.cash) && company.cash < 25) {
    advice = contextual(ADVISERS.finance, "The cash cushion is now decorative", "Keep at least £25m available before ordering another hull. One machinery incident can otherwise turn emergency borrowing into the company strategy.", "finance", "Inspect the balance sheet", "cash-low");
  } else if (Number.isFinite(forecast?.operatingProfit) && forecast.operatingProfit < -5) {
    advice = contextual(ADVISERS.finance, "This plan converts cash into sea air", "Inspect each ship’s forecast profit, then change its route or fare before cutting the service and maintenance that protect reputation.", "fleet", "Find the loss", "forecast-loss");
  } else if (worstShip && worstShip.condition < 65) {
    advice = contextual(ADVISERS.operations, "The audible phase has begun", `${worstShip.name} is at ${Math.round(worstShip.condition)}% condition. Low condition weakens demand, so schedule a yard period while the company can still choose the timing.`, "fleet", "Book the yard", `condition-${worstShip.id}`);
  } else if (Number.isFinite(company.maintenance) && company.maintenance < 1.02) {
    advice = contextual(ADVISERS.operations, "Maintenance is currently a hypothesis", "Below 102% of plan, ships wear faster and an unplanned machinery bill becomes eligible. Restore the missing spanners before testing this experimentally.", "brand", "Restore maintenance", "maintenance-low");
  } else if (state?.quarter > 0 && forecast?.averageOccupancy > 0.96 && forecast?.satisfaction < 68) {
    advice = contextual(ADVISERS.commercial, "The Guest Compression Trial is over capacity", `${Math.round(forecast.averageOccupancy * 100)}% occupied and ${Math.round(forecast.satisfaction)}/100 satisfied is a travelling complaint factory. Fund service or crew care before adding demand.`, "brand", "Relieve the pressure", "guest-compression");
  } else if (state?.quarter > 0 && forecast?.averageOccupancy < 0.68) {
    advice = contextual(ADVISERS.commercial, "The empty cabins have formed a committee", `At ${Math.round(forecast.averageOccupancy * 100)}% load, reputation suffers. Compare seasonality and rival capacity, then redeploy or reduce the fare.`, "markets", "Review fares", "occupancy-low");
  } else {
    advice = { ...TOUR_GUIDANCE[safeTab], key: `tour-${safeTab}` };
  }

  return { ...advice, tourStep: TOUR_TABS.indexOf(safeTab) + 1 };
}
