import { useState } from "react";
import {
  AU,
  DECET_STANDARD,
  DECET_TERRA,
  HZ,
  MAX_DAY_SECONDS,
  MIN_DAY_SECONDS,
  ONE_PERCENT_C,
  PRESETS,
  type SystemConfig,
  equatorialSpeed,
  gravityFraction,
  habitableZoneClass,
  insolation,
  isRotationLegal,
  orbitalPeriod,
  orbitalSpeed,
} from "../../core/index.ts";

interface Props {
  config: SystemConfig;
  onAdopt: (c: SystemConfig) => void;
}

const A_MIN = 0.7;
const A_MAX = 1.85;

function climateWord(insol: number): string {
  if (insol > 1.3) return "scorching";
  if (insol > 1.1) return "warm";
  if (insol > 0.9) return "temperate";
  if (insol > 0.6) return "cool";
  return "frigid";
}
function gravityWord(f: number): string {
  if (f > 0.97) return "near-normal";
  if (f > 0.9) return "noticeably lighter";
  if (f > 0.8) return "very light";
  return "dramatically lighter";
}
function base10Clean(n: number): boolean {
  // mantissa in {1,2,2.5,4,5} × 10^k reads as "clean"
  if (n <= 0) return false;
  const k = Math.floor(Math.log10(n));
  const m = n / 10 ** k;
  return [1, 2, 2.5, 4, 5].some((x) => Math.abs(m - x) < 1e-9);
}

export function TunerView({ config, onAdopt }: Props) {
  const [day, setDay] = useState(config.daySeconds);
  const [aAU, setA] = useState(config.aAU);

  const vEq = equatorialSpeed(day);
  const grav = gravityFraction(day);
  const dayHours = day / 3600;
  const aM = aAU * AU;
  const T = orbitalPeriod(aM);
  const vOrb = orbitalSpeed(aM);
  const insol = insolation(aAU);
  const hz = habitableZoneClass(aAU);
  const daysPerYear = T / day;
  const nearestInt = Math.round(daysPerYear);
  // tolerance absorbs float round-trip error so an exactly-tuned orbit reads as
  // leap-free, while a freely-dragged orbit still needs to land near a whole day.
  const isLeapFree = Math.abs(daysPerYear - nearestInt) < 1e-3;

  const rotOk = isRotationLegal(day);
  const hzOk = hz !== "outside";
  const speedOk = vOrb <= ONE_PERCENT_C && vEq <= ONE_PERCENT_C;
  const allOk = rotOk && hzOk && speedOk;

  const dayClean = base10Clean(day);
  const yearClean = isLeapFree && base10Clean(nearestInt);

  const pct = (v: number, lo: number, hi: number) => ((v - lo) / (hi - lo)) * 100;

  const syncToPreset = (p: SystemConfig) => {
    setDay(p.daySeconds);
    setA(p.aAU);
    onAdopt(p);
  };

  return (
    <div className="view tuner-view">
      <section className={"panel verdict " + (allOk ? "ok" : "bad")}>
        <div className="verdict-main">
          <span className="verdict-dot" />
          {allOk ? "Physically legal world" : "Violates the brief's limits"}
        </div>
        <div className="verdict-detail">
          {rotOk ? null : <span className="vbad">rotation outside 1 km/s–1% c</span>}
          {hzOk ? null : <span className="vbad">orbit outside habitable zone</span>}
          {!speedOk ? <span className="vbad">speed exceeds 1% c</span> : null}
          {allOk && (
            <span>
              {daysPerYear.toFixed(isLeapFree ? 0 : 2)} days / revolution ·{" "}
              {isLeapFree ? "leap-free" : "needs leap correction"} ·{" "}
              {dayClean && yearClean ? "clean base-10" : "not fully base-10"}
            </span>
          )}
        </div>
      </section>

      <div className="tuner-grid">
        {/* ROTATION */}
        <section className="panel tuner-card">
          <div className="panel-head">
            <h2>Rotation → day</h2>
            <p className="muted">Spin the planet. Faster spin = shorter day, but a lighter equator.</p>
          </div>

          <div className="gauge-big mono">
            {day.toLocaleString()} <span className="gu">s</span>
            <span className="gauge-sub">{dayHours.toFixed(2)} conv h</span>
          </div>

          <input
            type="range"
            min={Math.ceil(MIN_DAY_SECONDS)}
            max={Math.floor(MAX_DAY_SECONDS)}
            value={day}
            onChange={(e) => setDay(Number(e.target.value))}
            className="slider"
          />
          <div className="limit-bar">
            <span>1% c · {Math.round(MIN_DAY_SECONDS)}s</span>
            <span>1 km/s · {Math.round(MAX_DAY_SECONDS).toLocaleString()}s</span>
          </div>

          <div className="stat-grid">
            <Stat k="Equatorial speed" v={`${(vEq / 1000).toFixed(3)} km/s`} good={rotOk} />
            <Stat k="Equatorial gravity" v={`${(grav * 100).toFixed(1)}%`} note={gravityWord(grav)} good={grav > 0.85} />
            <Stat k="Base-10 day" v={dayClean ? "clean" : "off-grid"} good={dayClean} />
          </div>
        </section>

        {/* ORBIT */}
        <section className="panel tuner-card">
          <div className="panel-head">
            <h2>Orbit → year</h2>
            <p className="muted">Move Earth. Kepler sets the year; the habitable zone bounds the move.</p>
          </div>

          <div className="gauge-big mono">
            {aAU.toFixed(3)} <span className="gu">AU</span>
            <span className="gauge-sub">{(T / 1e7).toFixed(2)}×10⁷ s year</span>
          </div>

          <input
            type="range"
            min={A_MIN}
            max={A_MAX}
            step={0.001}
            value={aAU}
            onChange={(e) => setA(Number(e.target.value))}
            className="slider"
          />
          {/* HZ band */}
          <div className="hz-band">
            <div
              className="hz-opt"
              style={{ left: `${pct(HZ.optimistic.inner, A_MIN, A_MAX)}%`, width: `${pct(HZ.optimistic.outer, A_MIN, A_MAX) - pct(HZ.optimistic.inner, A_MIN, A_MAX)}%` }}
            />
            <div
              className="hz-cons"
              style={{ left: `${pct(HZ.conservative.inner, A_MIN, A_MAX)}%`, width: `${pct(HZ.conservative.outer, A_MIN, A_MAX) - pct(HZ.conservative.inner, A_MIN, A_MAX)}%` }}
            />
            <div className="hz-earth" style={{ left: `${pct(1, A_MIN, A_MAX)}%` }} title="Earth today (1 AU)" />
            <div className="hz-here" style={{ left: `${pct(aAU, A_MIN, A_MAX)}%` }} />
          </div>
          <div className="limit-bar">
            <span>hotter</span>
            <span>habitable zone</span>
            <span>colder</span>
          </div>

          <div className="stat-grid">
            <Stat k="Zone" v={hz} good={hzOk} />
            <Stat k="Sunlight" v={`${insol.toFixed(3)}×`} note={climateWord(insol)} good={insol > 0.55 && insol < 1.45} />
            <Stat k="Orbital speed" v={`${(vOrb / 1000).toFixed(1)} km/s`} good={speedOk} />
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Days per revolution</h2>
          <p className="muted">
            The whole game: land day <i>and</i> year on clean base-10 values while the world stays
            habitable. A whole-number day-count means <b>no leap years</b>.
          </p>
        </div>
        <div className="dpr">
          <div className="dpr-num mono">{isLeapFree ? nearestInt.toLocaleString() : daysPerYear.toFixed(2)}</div>
          <div className="dpr-flags">
            <span className={"flag " + (isLeapFree ? "on" : "off")}>{isLeapFree ? "whole days ✓" : "fractional day ✗"}</span>
            <span className={"flag " + (dayClean ? "on" : "off")}>{dayClean ? "clean day ✓" : "messy day ✗"}</span>
            <span className={"flag " + (yearClean ? "on" : "off")}>{yearClean ? "clean year ✓" : "messy year ✗"}</span>
          </div>
        </div>

        <div className="preset-cards">
          {PRESETS.map((p) => (
            <button key={p.id} className={"preset-card" + (p.id === config.id ? " current" : "")} onClick={() => syncToPreset(p)}>
              <div className="pc-name">{p.name}</div>
              <div className="pc-nums mono">
                {p.daySeconds.toLocaleString()}s day · {p.yearDays.toLocaleString()} days/yr
              </div>
              <div className="pc-tag">{p.tagline}</div>
            </button>
          ))}
        </div>
        <p className="muted tuner-foot">
          Standard ({DECET_STANDARD.daySeconds.toLocaleString()}s) buys the cleanest clock at{" "}
          {(gravityFraction(DECET_STANDARD.daySeconds) * 100).toFixed(0)}% equatorial gravity; Terra (
          {DECET_TERRA.daySeconds.toLocaleString()}s) keeps{" "}
          {(gravityFraction(DECET_TERRA.daySeconds) * 100).toFixed(0)}% gravity with a messier clock.
          Both share the same {(orbitalPeriod(DECET_STANDARD.aAU * AU) / 1e7).toFixed(1)}×10⁷ s orbit.
        </p>
      </section>
    </div>
  );
}

function Stat({ k, v, note, good }: { k: string; v: string; note?: string; good?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-k">{k}</div>
      <div className={"stat-v mono " + (good === undefined ? "" : good ? "sg" : "sb")}>{v}</div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}
