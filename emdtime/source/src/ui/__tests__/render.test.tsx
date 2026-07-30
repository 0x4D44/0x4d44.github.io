/**
 * Headless render smoke tests: each view must render to static markup without
 * throwing, for both presets, and contain the content we expect. This exercises
 * the component logic (dial geometry, calendar grid, tuner math, formatting)
 * the way the browser will, catching render-time crashes the type checker can't.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DECET_STANDARD, DECET_TERRA, type SystemConfig } from "../../core/index.ts";
import { ClockView } from "../components/ClockView.tsx";
import { ConverterView } from "../components/ConverterView.tsx";
import { CalendarView } from "../components/CalendarView.tsx";
import { TunerView } from "../components/TunerView.tsx";
import { AboutView } from "../components/AboutView.tsx";
import { DecimalDial } from "../components/DecimalDial.tsx";

const CONFIGS: SystemConfig[] = [DECET_STANDARD, DECET_TERRA];

describe("views render without throwing (both presets)", () => {
  for (const cfg of CONFIGS) {
    it(`ClockView · ${cfg.id}`, () => {
      const html = renderToStaticMarkup(<ClockView config={cfg} />);
      expect(html).toContain("Time of day");
      expect(html).toContain("Timestamp");
    });
    it(`ConverterView · ${cfg.id}`, () => {
      const html = renderToStaticMarkup(<ConverterView config={cfg} />);
      expect(html).toContain("Instant");
      expect(html).toContain("Duration");
    });
    it(`CalendarView · ${cfg.id}`, () => {
      const html = renderToStaticMarkup(<CalendarView config={cfg} />);
      expect(html).toContain("day year");
      expect(html).toContain("You are here");
    });
    it(`TunerView · ${cfg.id}`, () => {
      const html = renderToStaticMarkup(<TunerView config={cfg} onAdopt={() => {}} />);
      expect(html).toMatch(/Physically legal world|Violates/);
      expect(html).toContain("Days per revolution");
    });
    it(`AboutView · ${cfg.id}`, () => {
      const html = renderToStaticMarkup(<AboutView config={cfg} />);
      expect(html).toContain("unit ladder");
      expect(html).toContain("Honest consequences");
      // the road-not-taken section: the fork and its historical precedent
      expect(html).toContain("road not taken");
      expect(html).toContain("1793");
      expect(html).toContain("0.864");
    });
  }
});

describe("DecimalDial geometry", () => {
  it("renders 10 major numerals 0-9 and a valid arc for a mid-day fraction", () => {
    const html = renderToStaticMarkup(
      <DecimalDial fraction={0.5} secondOfDay={5000} daySeconds={10000} />,
    );
    for (let i = 0; i < 10; i++) expect(html).toContain(`>${i}</text>`);
    expect(html).toContain("50%");
    // no NaN leaked into any coordinate
    expect(html).not.toContain("NaN");
  });

  it("handles fraction 0 (midnight) without drawing an arc or NaN", () => {
    const html = renderToStaticMarkup(
      <DecimalDial fraction={0} secondOfDay={0} daySeconds={10000} />,
    );
    expect(html).not.toContain("NaN");
    expect(html).toContain("0%");
  });
});
