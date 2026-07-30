import { type SystemConfig, formatDurationDecimal, nowDecet } from "../../core/index.ts";
import { useNow } from "../useNow.ts";

const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];

interface Props {
  config: SystemConfig;
}

export function CalendarView({ config }: Props) {
  const nowMs = useNow(true, 250);
  const t = nowDecet(config, nowMs);

  // structure string, e.g. "4 × 10 × 10 × 10 = 4000 days"
  const structure = config.calendar.map((l) => l.range).join(" × ") + ` = ${config.yearDays} days`;

  // two finest levels -> a 10×10 month grid (day-of-month 0..99)
  const fine = config.calendar.slice(-2);
  const cols = fine[1]?.range ?? 10;
  const rows = fine[0]?.range ?? 10;
  const dayOfMonth = t.dayOfYear % (rows * cols);

  return (
    <div className="view calendar-view">
      <section className="panel">
        <div className="panel-head">
          <h2>The {config.yearDays.toLocaleString()}-day year</h2>
          <p className="muted">
            Nested pure base-10{config.calendar[0]?.name === "season" ? " (bar the one physics-forced ×4)" : ""}. The
            orbit is tuned so a revolution is an exact whole number of days — <b>no leap years, ever</b>.
            That's bought by moving the orbit, not by counting in tens: the real Earth's year is
            365.2422 days — not a whole number — so leap days stay no matter how you count.
          </p>
        </div>

        <div className="cal-structure">
          <div className="cal-structure-eq mono">{structure}</div>
          <div className="cal-levels">
            {config.calendar.map((l) => (
              <div className="cal-level" key={l.name}>
                <div className="cal-level-name">{l.name}</div>
                <div className="cal-level-size mono">
                  {l.placeValue} day{l.placeValue > 1 ? "s" : ""}
                </div>
                <div className="cal-level-conv">
                  ≈ {formatConvDays((l.placeValue * config.daySeconds) / 86_400)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>You are here</h2>
          <p className="muted mono">
            Day-of-year {t.dayOfYear} of {config.yearDays} · year {t.year}
          </p>
        </div>

        <div className="cal-progress">
          <ProgressRow
            label="Year"
            valueText={`${t.dayOfYear} / ${config.yearDays} days`}
            fraction={(t.dayOfYear + t.dayFraction) / config.yearDays}
          />
          {config.calendar.map((l) => {
            const digit = t.calendar.find((d) => d.level.name === l.name)?.value ?? 0;
            const withinDays = t.dayOfYear % l.placeValue;
            const frac = (withinDays + t.dayFraction) / l.placeValue;
            const extra =
              l.name === "season" ? ` · ${SEASON_NAMES[digit] ?? ""}` : "";
            return (
              <ProgressRow
                key={l.name}
                label={`${l.name[0]!.toUpperCase()}${l.name.slice(1)} ${digit}${extra}`}
                valueText={`${(frac * 100).toFixed(1)}%`}
                fraction={frac}
              />
            );
          })}
          <ProgressRow label="Day" valueText={`${(t.dayFraction * 100).toFixed(1)}%`} fraction={t.dayFraction} accent />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Current {fine[0] ? "month" : "period"}</h2>
          <p className="muted">
            {rows} {fine[0]?.name ?? "week"}s × {cols} {fine[1]?.name ?? "day"}s = {rows * cols} days.
            Each day is one rotation ({formatDurationDecimal(config, config.daySeconds)} ={" "}
            {(config.daySeconds / 3600).toFixed(2)} conv h).
          </p>
        </div>
        <div className="month-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const isToday = i === dayOfMonth;
            const isPast = i < dayOfMonth;
            return (
              <div
                key={i}
                className={"day-cell" + (isToday ? " today" : "") + (isPast ? " past" : "")}
                title={`${fine[0]?.name ?? "week"} ${Math.floor(i / cols)}, ${fine[1]?.name ?? "day"} ${i % cols}`}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProgressRow({
  label,
  valueText,
  fraction,
  accent,
}: {
  label: string;
  valueText: string;
  fraction: number;
  accent?: boolean;
}) {
  return (
    <div className="prow">
      <div className="prow-label">{label}</div>
      <div className="prow-bar">
        <div
          className={"prow-fill" + (accent ? " accent2" : "")}
          style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%` }}
        />
      </div>
      <div className="prow-val mono">{valueText}</div>
    </div>
  );
}

function formatConvDays(days: number): string {
  if (days < 1) return `${(days * 24).toFixed(1)} conv h`;
  return `${days.toFixed(days < 10 ? 2 : 0)} conv days`;
}
