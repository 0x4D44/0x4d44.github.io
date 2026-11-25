const el = (id) => document.getElementById(id);
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const mean = (runs, field) => runs.reduce((sum, run) => sum + run[field], 0) / runs.length;
const score = (value) => value.toFixed(1);
const cost = (value) => "$" + value.toFixed(2);
const envelope = ({ data_bits, word_bits }) => `${data_bits}×${word_bits}`;
const countNonconforming = (runs) => runs.filter((run) => run.nonconforming).length;
const seatClasses = new Map([
  ["haiku-5.5-high", "seat-0"],
  ["opus-5.5-medium", "seat-1"],
  ["sonnet-5.5-high", "seat-2"],
  ["sol-6.2-xhigh", "seat-3"],
]);
const numeric = new Intl.Collator("en", { numeric: true });
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

function groupBy(runs, key) {
  const groups = new Map();
  for (const run of runs) {
    const value = key(run);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(run);
  }
  return groups;
}

function seatColors(bySeat) {
  return new Map([...bySeat.keys()].toSorted().map((seat, index) =>
    [seat, seatClasses.get(seat) ?? `seat-${index % 4}`]));
}

function rankSeats(bySeat) {
  return [...bySeat].toSorted(([, a], [, b]) => mean(b, "overall") - mean(a, "overall"));
}

function renderSeats(id, ranked, colors) {
  el(id).innerHTML = ranked.map(([seat, runs]) => {
    const overall = mean(runs, "overall");
    return `<tr class="${colors.get(seat)}">
      <th scope="row"><span class="dot" aria-hidden="true"></span>${escape(seat)}</th>
      <td class="num"><strong>${score(overall)}</strong><span class="scorebar" aria-hidden="true"><span style="width: ${overall}%"></span></span></td>
      <td class="num">${score(mean(runs, "judged"))}</td>
      <td class="num">${score(mean(runs, "machine"))}</td>
      <td class="num">${score(mean(runs, "programs"))}</td>
      <td class="num">${runs.length}</td>
      <td class="num">${countNonconforming(runs)}</td>
      <td class="num">${cost(mean(runs, "cost_usd"))}</td>
    </tr>`;
  }).join("");
}

function renderRoundGrid(ranked, colors, envelopeNames) {
  const rows = ranked.map(([seat, runs]) =>
    [seat, envelopeNames.map((name) => runs.find((run) => run.envelope.name === name))]);
  const headers = rows[0][1].map((run) => `<th scope="col" class="num">${envelope(run.envelope)}</th>`);
  el("round-envelope-headings").insertAdjacentHTML("beforeend", headers.join(""));
  el("round-grid").innerHTML = rows.map(([seat, runs]) => `
    <tr class="${colors.get(seat)}">
      <th scope="row"><span class="dot" aria-hidden="true"></span>${escape(seat)}</th>
      ${runs.map((run) => `<td class="num"><strong>${score(run.overall)}</strong>${run.nonconforming ? '<small class="flag">Nonconforming</small>' : ""}</td>`).join("")}
    </tr>`).join("");
}

function renderChart(runs, colors) {
  const ordered = runs.toSorted(({ envelope: a }, { envelope: b }) =>
    a.data_bits - b.data_bits || a.word_bits - b.word_bits);
  const groups = [...groupBy(ordered, (run) => envelope(run.envelope))]
    .map(([label, members]) => [label, groupBy(members, (run) => run.seat)]);
  const mostRepeats = Math.max(...groups.flatMap(([, seats]) => [...seats.values()].map((rows) => rows.length)));
  const seatWidth = 9 + 13 * mostRepeats;
  const step = colors.size * seatWidth + 12;
  const left = 42;
  const right = left + groups.length * step;
  const top = 16;
  const bottom = 246;
  const width = right + 10;
  const y = (value) => bottom - (bottom - top) * value / 100;
  const ticks = [0, 25, 50, 75, 100].map((value) => `
    <line class="grid" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"/>
    <text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${value}</text>`).join("");

  const points = groups.map(([label, bySeat], index) => {
    const start = left + index * step;
    const marks = [...colors].map(([seat, color], seatIndex) => {
      const rows = bySeat.get(seat) ?? [];
      const center = start + 6 + (seatIndex + 0.5) * seatWidth;
      return rows.map((run, runIndex) => {
        const x = center + (runIndex - (rows.length - 1) / 2) * 13;
        const verdict = run.nonconforming ? " · nonconforming" : "";
        return `<circle class="${color}${run.nonconforming ? " hollow" : ""}" cx="${x}" cy="${y(run.overall)}" r="5">
          <title>${escape(run.run)} · ${label} · ${score(run.overall)}/100${verdict}</title>
        </circle>`;
      }).join("");
    }).join("");
    return `${marks}<text x="${start + step / 2}" y="${bottom + 22}" text-anchor="middle">${label}</text>`;
  }).join("");

  el("legend").innerHTML = [...colors].map(([seat, color]) =>
    `<span class="${color}"><span class="dot" aria-hidden="true"></span>${escape(seat)}</span>`).join("");
  el("chart").innerHTML = `<svg class="chart" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="plot-title plot-desc" viewBox="0 0 ${width} 280" style="min-width: ${width}px">
    <title id="plot-title">Overall score per pilot run</title>
    <desc id="plot-desc">Scores from 0 to 100, grouped by data and program word widths. Each point is a run. Within an envelope, seats follow the legend order from left to right. Hollow points are nonconforming. All values are in the pilot run table.</desc>
    ${ticks}<path class="axis" fill="none" d="M${left} ${top} V${bottom} H${right}"/>${points}
  </svg>`;
}

function renderRuns(id, runs, colors) {
  el(id).innerHTML = runs.map((run) => {
    const wallMinutes = run.wall_s.reduce((sum, seconds) => sum + seconds, 0) / 60;
    return `<tr class="${colors.get(run.seat)}">
      <th scope="row"><code>${escape(run.run)}</code></th>
      <td><span class="dot" aria-hidden="true"></span>${escape(run.seat)}</td>
      <td>${envelope(run.envelope)}${run.envelope.two_ended ? '<span class="marker">two-ended</span>' : ""}</td>
      <td class="num"><strong>${score(run.overall)}</strong></td>
      <td class="num">${score(run.judged)}</td>
      <td class="num">${score(run.machine)}</td>
      <td class="num">${score(run.programs)}</td>
      <td>${run.nonconforming ? '<span class="flag">Yes</span>' : "No"}</td>
      <td class="num">${run.questions}</td>
      <td class="num">${cost(run.cost_usd)}</td>
      <td class="num">${wallMinutes.toFixed(1)}</td>
    </tr>`;
  }).join("");
}

function renderRoundFindings(bySeat) {
  const opus = bySeat.get("opus-5.5-medium");
  const sonnet = bySeat.get("sonnet-5.5-high");
  const haiku = bySeat.get("haiku-5.5-high");
  const sol = bySeat.get("sol-6.2-xhigh");
  const bothConforming = sonnet.filter((run) => !run.nonconforming &&
    sol.some((other) => !other.nonconforming && other.envelope.name === run.envelope.name)).length;
  const haikuPassed = haiku.map((run) => run.programs_passed.passed);
  const cases = haiku[0].programs_passed.cases;
  const strongRuns = [...opus, ...sonnet, ...sol];
  const allCasesPassed = strongRuns.filter(({ programs_passed }) => programs_passed.passed === programs_passed.cases).length;
  el("round-findings").innerHTML = `
    <li><strong>Sonnet and Sol</strong> both conformed on ${bothConforming} of ${sonnet.length} envelopes and led the round with mean overall scores of ${score(mean(sonnet, "overall"))} and ${score(mean(sol, "overall"))}, respectively.</li>
    <li><strong>Opus</strong> was nonconforming on ${countNonconforming(opus)} of ${opus.length} envelopes. The judges found its machines did not keep the brief’s program-word width. That halved its program credit on those runs.</li>
    <li><strong>Haiku</strong> had few working programs, passing ${Math.min(...haikuPassed)}–${Math.max(...haikuPassed)} of ${cases} program cases per run. It was nonconforming on ${countNonconforming(haiku)} of ${haiku.length} envelopes.</li>
    <li><strong>Opus, Sonnet and Sol</strong> passed every program case in ${allCasesPassed} of their ${strongRuns.length} runs. Conformance and judged scores accounted for most of the overall difference among them.</li>`;
}

function renderPilotFindings(runs, bySeat) {
  const range = (rows, field) => {
    const values = rows.map((row) => row[field]);
    return `${score(Math.min(...values))}–${score(Math.max(...values))}`;
  };
  const opus = bySeat.get("opus-5.5-medium");
  const sonnet = bySeat.get("sonnet-5.5-high");
  const haiku = bySeat.get("haiku-5.5-high");
  const verdicts = runs.filter((run) => run.nonconforming);
  const bullets = [];
  if (opus) bullets.push(`<strong>Opus</strong> scored ${range(opus, "overall")} overall across its pilot runs.`);
  if (sonnet) bullets.push(`<strong>Sonnet</strong> had a wide spread of overall scores (${range(sonnet, "overall")}).`);
  if (haiku) bullets.push(`<strong>Haiku</strong> usually built a sound machine. Its machine checks scored ${range(haiku, "machine")}, while its programs averaged ${score(mean(haiku, "programs"))} before the conformance adjustment.`);
  if (verdicts.length) {
    const ids = verdicts.map((run) => `<code>${escape(run.run)}</code>`).join(", ");
    bullets.push(`<strong>Nonconforming runs (${verdicts.length})</strong> were ${ids}. Each received half its program score in the overall calculation.`);
  }
  el("findings").innerHTML = bullets.map((bullet) => `<li>${bullet}</li>`).join("");
  el("findings").parentElement.hidden = bullets.length === 0;
}

const status = el("results-status");
status.hidden = false;
try {
  const response = await fetch("./data.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const runs = data.runs.toSorted((a, b) => numeric.compare(a.run, b.run));
  const roundRuns = runs.filter((run) => run.phase === "round r1" && run.round === "r1");
  const pilotRuns = runs.filter((run) => run.phase === "pilot");

  const { weights, references } = data;
  el("scoring").textContent = `The seat is scored against requirements it never sees. Opus judges score the design, documents and conformance (${weights.judged}%). Automatic machine checks count for ${weights.machine}% and the programs count for ${weights.programs}%. A nonconforming machine keeps its machine checks and gets half credit for its programs.`;
  el("scoring").hidden = false;
  el("generated").dateTime = data.generated;
  el("generated").textContent = data.generated.replace("T", " ").replace(/Z$/, " UTC");
  el("source").hidden = false;

  if (roundRuns.length) {
    const round = data.rounds.r1;
    el("round-date").dateTime = round.date;
    el("round-date").textContent = date.format(new Date(round.date));
    const bySeat = groupBy(roundRuns, (run) => run.seat);
    const colors = seatColors(bySeat);
    const ranked = rankSeats(bySeat);
    renderSeats("round-seats", ranked, colors);
    renderRoundGrid(ranked, colors, round.envelopes);
    renderRuns("round-runs", roundRuns, colors);
    renderRoundFindings(bySeat);
    el("round-r1").hidden = false;
  }

  if (pilotRuns.length) {
    el("pilot-count").textContent = pilotRuns.length;
    el("references").textContent = `Scored draws use data widths of ${references.data_bits.join("–")} bits and program word widths of ${references.word_bits.join("–")} bits. Every reference machine scores ${references.score}.`;
    el("rescoring").textContent = `All results use the ${date.format(new Date(data.scoring_rule))} scoring rules.`;
    const bySeat = groupBy(pilotRuns, (run) => run.seat);
    const colors = seatColors(bySeat);
    renderSeats("seats", rankSeats(bySeat), colors);
    renderChart(pilotRuns, colors);
    renderRuns("runs", pilotRuns, colors);
    renderPilotFindings(pilotRuns, bySeat);
    el("pilot").hidden = false;
  }

  if (roundRuns.length || pilotRuns.length) {
    el("results").hidden = false;
    status.hidden = true;
  } else {
    status.textContent = "No runs are available.";
  }
} catch {
  status.textContent = "Results could not be loaded. Try reloading the page.";
}
