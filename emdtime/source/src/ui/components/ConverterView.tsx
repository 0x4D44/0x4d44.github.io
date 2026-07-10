import { useState } from "react";
import {
  type SystemConfig,
  breakdownDuration,
  conventionalDuration,
  formatCalendarAddress,
  formatClock,
  formatDurationDecimal,
  formatTimestamp,
  fromDate,
  toDate,
  toInstant,
} from "../../core/index.ts";

interface Props {
  config: SystemConfig;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

const DURATION_PRESETS = [
  { label: "5-min egg", seconds: 300 },
  { label: "25-min pomodoro", seconds: 1500 },
  { label: "1-hour meeting", seconds: 3600 },
  { label: "8-hour workday", seconds: 28_800 },
  { label: "conventional day", seconds: 86_400 },
];

export function ConverterView({ config }: Props) {
  // ---- instant: conventional -> Decet ----
  const [localValue, setLocalValue] = useState(() => toLocalInputValue(new Date()));
  const parsed = new Date(localValue);
  const validDate = !Number.isNaN(parsed.getTime());
  const decet = validDate ? fromDate(config, parsed) : null;

  // ---- instant: Decet -> conventional ----
  const [dYear, setDYear] = useState("0");
  const [dDay, setDDay] = useState("0");
  const [dSec, setDSec] = useState("0");
  const decetInstant = toInstant(config, {
    year: Number(dYear) || 0,
    dayOfYear: Number(dDay) || 0,
    secondOfDay: Number(dSec) || 0,
  });
  const backDate = toDate(config, decetInstant);

  // ---- duration ----
  const [durSeconds, setDurSeconds] = useState(1500);

  return (
    <div className="view converter-view">
      <section className="panel">
        <div className="panel-head">
          <h2>Instant</h2>
          <p className="muted">
            Both clocks ride the same SI-second timeline, so a moment converts exactly (a Decet year is
            not a calendar year — convert instants, not fields).
          </p>
        </div>

        <div className="conv-two">
          <div className="conv-col">
            <label className="field-label">Conventional (your local time)</label>
            <input
              type="datetime-local"
              step={1}
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              className="input"
            />
            <button className="btn-ghost" onClick={() => setLocalValue(toLocalInputValue(new Date()))}>
              Set to now
            </button>
            <div className="conv-arrow">↓ Decet</div>
            {decet ? (
              <div className="result-block">
                <div className="result-row">
                  <span className="rk">Timestamp</span>
                  <span className="rv mono">{formatTimestamp(config, decet)}</span>
                </div>
                <div className="result-row">
                  <span className="rk">Clock</span>
                  <span className="rv mono">{formatClock(config, decet.secondOfDay)}</span>
                </div>
                <div className="result-row">
                  <span className="rk">Calendar</span>
                  <span className="rv mono">{formatCalendarAddress(decet)}</span>
                </div>
                <div className="result-row">
                  <span className="rk">Instant</span>
                  <span className="rv mono">{decet.instant.toLocaleString()} s</span>
                </div>
              </div>
            ) : (
              <div className="result-block muted">Enter a valid date & time.</div>
            )}
          </div>

          <div className="conv-col">
            <label className="field-label">Decet address</label>
            <div className="decet-inputs">
              <div className="di">
                <span>Year</span>
                <input className="input" value={dYear} onChange={(e) => setDYear(e.target.value)} inputMode="numeric" />
              </div>
              <div className="di">
                <span>Day (0–{config.yearDays - 1})</span>
                <input className="input" value={dDay} onChange={(e) => setDDay(e.target.value)} inputMode="numeric" />
              </div>
              <div className="di">
                <span>Second (0–{config.daySeconds - 1})</span>
                <input className="input" value={dSec} onChange={(e) => setDSec(e.target.value)} inputMode="numeric" />
              </div>
            </div>
            <div className="conv-arrow">↓ Conventional</div>
            <div className="result-block">
              <div className="result-row">
                <span className="rk">Local</span>
                <span className="rv mono">{backDate.toLocaleString(undefined, { hour12: false })}</span>
              </div>
              <div className="result-row">
                <span className="rk">UTC</span>
                <span className="rv mono">{backDate.toISOString().replace(".000", "")}</span>
              </div>
              <div className="result-row">
                <span className="rk">Instant</span>
                <span className="rv mono">{decetInstant.toLocaleString()} s</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Duration</h2>
          <p className="muted">
            In base-10 a duration is just the second count with the decimal point shifted — pick any
            unit for free.
          </p>
        </div>

        <div className="dur-presets">
          {DURATION_PRESETS.map((p) => (
            <button
              key={p.label}
              className={"chip" + (p.seconds === durSeconds ? " active" : "")}
              onClick={() => setDurSeconds(p.seconds)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="dur-input-row">
          <input
            type="range"
            min={1}
            max={90_000}
            value={durSeconds}
            onChange={(e) => setDurSeconds(Number(e.target.value))}
            className="slider"
          />
          <div className="dur-seconds">
            <input
              className="input mono"
              value={durSeconds}
              inputMode="numeric"
              onChange={(e) => setDurSeconds(Math.max(0, Number(e.target.value) || 0))}
            />
            <span className="unit">s</span>
          </div>
        </div>

        <div className="dur-results">
          <div className="dur-card">
            <div className="dur-card-k">Decet (nicest unit)</div>
            <div className="dur-card-v mono">{formatDurationDecimal(config, durSeconds)}</div>
          </div>
          <div className="dur-card">
            <div className="dur-card-k">Decet (breakdown)</div>
            <div className="dur-card-v mono">{breakdownDuration(config, durSeconds)}</div>
          </div>
          <div className="dur-card">
            <div className="dur-card-k">Fraction of a day</div>
            <div className="dur-card-v mono">{(durSeconds / config.daySeconds).toFixed(4)} D</div>
          </div>
          <div className="dur-card">
            <div className="dur-card-k">Conventional</div>
            <div className="dur-card-v mono">{conventionalDuration(durSeconds)}</div>
          </div>
        </div>

        <div className="ladder-mini">
          {config.ladder
            .filter((u) => u.seconds <= 10_000)
            .map((u) => (
              <div className="lm-row" key={u.symbol}>
                <span className="lm-name">
                  {u.name} <span className="lm-sym mono">{u.symbol}</span>
                  {u.alt ? <span className="lm-alt"> · {u.alt}</span> : null}
                </span>
                <span className="lm-val mono">{(durSeconds / u.seconds).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
