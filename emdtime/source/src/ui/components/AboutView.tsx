import { type SystemConfig, gravityFraction, insolation } from "../../core/index.ts";

interface Props {
  config: SystemConfig;
}

const EVERYDAY = [
  { task: "Time a 5-minute egg", decet: "3 cd (300 s)", note: "countdown 0300 → 0000" },
  { task: "25-minute pomodoro", decet: "1.5 dd (1500 s)", note: "native block: 1 dd work + 2 cd break" },
  { task: "Hour-ish meeting", decet: "3–4 dd", note: "'decidays' are the hour analog (~16.7 min)" },
  { task: "Catch a train", decet: ".6250 express", note: "departures on a deciday grid" },
  { task: "Set an alarm", decet: "wake .2500", note: "a quarter into the day, read at a glance" },
  { task: "8-hour workday", decet: "28.8 dd ≈ 2.9 days", note: "long tasks span several short rotations" },
];

export function AboutView({ config }: Props) {
  const grav = gravityFraction(config.daySeconds);
  const insol = insolation(config.aAU);

  return (
    <div className="view about-view">
      <section className="panel">
        <div className="panel-head">
          <h2>Why Decet looks like this</h2>
          <p className="muted">
            You're viewing the <b>{config.name}</b> model. The rationale below is the design as a whole;
            the ladder and consequences further down track your selected model.
          </p>
        </div>
        <div className="prose">
          <p>
            <b>The second never changes.</b> It stays the SI second — 9,192,631,770 periods of the
            Cesium-133 transition. (Optical-lattice clocks, Sr/Yb, are ~100× more precise and slated to
            redefine the SI second; they keep the <i>same length</i>, so Decet adopts them for free.)
          </p>
          <p>
            <b>The brief forces the planet to change.</b> Today's equator moves at 0.46 km/s — below the
            required 1 km/s — so the day <i>must</i> shorten. And no orbit inside the habitable zone can
            make both the day and the year pure powers of ten, so exactly one small factor is
            unavoidable. Decet spends it on the year (4000 days = 4 seasons in Standard), where it
            becomes a feature and never touches the clock.
          </p>
          <p>
            <b>The payoff.</b> The flagship <b>Standard</b> model makes the day exactly 10,000 s, so
            time-of-day is a 4-digit decimal counter whose every prefix <i>is</i> the fraction of the day
            — <span className="mono">.5000</span> is midday. The gentler <b>Terra</b> model trades that
            pure counter for a near-normal equator. Either way the orbit is tuned so a year is an exact
            whole number of days: <b>no leap years, ever</b>.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>The unit ladder</h2>
          <p className="muted">Every rung a power of ten of the second, up to the year.</p>
        </div>
        <div className="ladder-table">
          <div className="lt-head">
            <span>Unit</span>
            <span>Symbol</span>
            <span>Seconds</span>
            <span>Feels like</span>
          </div>
          {config.ladder.map((u) => (
            <div className="lt-row" key={u.symbol}>
              <span className="lt-name">
                {u.name}
                {u.alt ? <span className="lt-alt"> · {u.alt}</span> : null}
              </span>
              <span className="mono lt-sym">{u.symbol}</span>
              <span className="mono">{u.seconds.toLocaleString()}</span>
              <span className="lt-gloss">{u.gloss}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Timing everyday things</h2>
        </div>
        <div className="everyday-list">
          {EVERYDAY.map((e) => (
            <div className="ev-row" key={e.task}>
              <span className="ev-task">{e.task}</span>
              <span className="ev-decet mono">{e.decet}</span>
              <span className="ev-note">{e.note}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel consequences">
        <div className="panel-head">
          <h2>Honest consequences</h2>
          <p className="muted">Re-engineering a planet is not free. Nothing hidden.</p>
        </div>
        <div className="cons-grid">
          <Consequence
            title="Lighter equator"
            body={`Spinning to a ${config.daySeconds.toLocaleString()}s day leaves equatorial gravity at ${(grav * 100).toFixed(0)}% of normal. Oceans and air pile toward the equator.`}
            severity={grav > 0.95 ? "mild" : "major"}
          />
          <Consequence
            title="Short day / night"
            body={`A ${(config.daySeconds / 3600).toFixed(1)}-hour rotation ${config.daySeconds < 20000 ? "decouples sleep from daylight — society layers an informal multi-day cycle" : "is shorter than 24 h but still workable"}.`}
            severity={config.daySeconds < 20000 ? "major" : "mild"}
          />
          <Consequence
            title="Cooler climate"
            body={`At ${config.aAU.toFixed(3)} AU the planet gets ${(insol * 100).toFixed(0)}% of today's sunlight — a colder world needing a thicker greenhouse to match today.`}
            severity={insol > 0.85 ? "mild" : "moderate"}
          />
          <Consequence
            title="The second is safe"
            body="No physics touches the second's length. Only the counting layers above it become decimal — fully compatible with the optical-clock redefinition."
            severity="none"
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Under the hood</h2>
        </div>
        <div className="prose">
          <p>
            Every moment is one integer count of SI seconds since the epoch (2000-01-01 UTC) — like Unix
            time, but decimal-clean. Slice its digits and you get year / day-of-year / second-of-day
            directly. Convert <i>instants</i>, never calendar fields: a deadline ports exactly both ways;
            a birthday recurs every 4.0×10⁷ s.
          </p>
        </div>
      </section>
    </div>
  );
}

function Consequence({
  title,
  body,
  severity,
}: {
  title: string;
  body: string;
  severity: "none" | "mild" | "moderate" | "major";
}) {
  return (
    <div className={"cons-card sev-" + severity}>
      <div className="cons-title">
        <span className="cons-dot" /> {title}
      </div>
      <div className="cons-body">{body}</div>
    </div>
  );
}
