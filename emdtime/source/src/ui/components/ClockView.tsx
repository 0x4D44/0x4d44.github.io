import {
  type SystemConfig,
  formatTimestamp,
  formatWatch,
  nowDecet,
} from "../../core/index.ts";
import { useNow } from "../useNow.ts";
import { DecimalDial } from "./DecimalDial.tsx";

const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];

interface Props {
  config: SystemConfig;
}

export function ClockView({ config }: Props) {
  const nowMs = useNow(true, 80);
  const t = nowDecet(config, nowMs);

  const digits = t.intraday;
  const seasonDigit = t.calendar.find((d) => d.level.name === "season");
  const conv = new Date(nowMs);

  return (
    <div className="view clock-view">
      <section className="panel clock-hero">
        <div className="clock-hero-left">
          <div className="eyebrow">Time of day · fraction of one rotation</div>
          <div className="big-fraction mono">
            <span className="frac-dot">.</span>
            {digits.map((d, i) => (
              <span key={i} className="frac-digit" title={`${d.place.name} (${d.place.secondsEach}s each)`}>
                {d.value}
              </span>
            ))}
          </div>

          <div className="digit-legend">
            {digits.map((d, i) => (
              <div className="digit-chip" key={i}>
                <span className="digit-chip-name">{d.place.name}</span>
                <span className="digit-chip-sub mono">{d.place.secondsEach}s</span>
              </div>
            ))}
          </div>

          <div className="clock-lines">
            <div className="cl-row">
              <span className="cl-key">Watch form</span>
              <span className="cl-val mono">{formatWatch(config, t.secondOfDay)}</span>
            </div>
            <div className="cl-row">
              <span className="cl-key">Timestamp</span>
              <span className="cl-val mono">{formatTimestamp(config, t)}</span>
            </div>
            <div className="cl-row">
              <span className="cl-key">Calendar</span>
              <span className="cl-val mono">
                {t.calendar.map((d) => `${d.level.symbol}${d.value}`).join(" ")}
                {seasonDigit ? `  ·  ${SEASON_NAMES[seasonDigit.value] ?? ""}` : ""}
              </span>
            </div>
            <div className="cl-row">
              <span className="cl-key">Second of day</span>
              <span className="cl-val mono">
                {t.secondOfDay.toString().padStart(config.clockDigits, "0")} / {config.daySeconds}
              </span>
            </div>
          </div>
        </div>

        <div className="clock-hero-right">
          <DecimalDial
            fraction={t.dayFraction}
            secondOfDay={t.secondOfDay}
            daySeconds={config.daySeconds}
          />
        </div>
      </section>

      <section className="panel legacy-panel">
        <div className="eyebrow">Same instant, conventional reckoning</div>
        <div className="legacy-grid">
          <div>
            <div className="legacy-big mono">
              {conv.toLocaleTimeString(undefined, { hour12: false })}
            </div>
            <div className="legacy-sub">{conv.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
          </div>
          <div className="legacy-note">
            {config.pureSecondCounter ? (
              <>
                Because the day is exactly <b>10,000&nbsp;s</b> (one <i>myriad</i>), the four digits{" "}
                <b>are</b> the fraction of the day — <span className="mono">.5000</span> is midday, no
                division needed.
              </>
            ) : (
              <>
                This model's day is <b>{config.daySeconds.toLocaleString()}&nbsp;s</b>, so the finest
                clock digit is worth {config.intraday[config.intraday.length - 1]!.secondsEach}&nbsp;s
                — readable, but not a pure second-counter.
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
