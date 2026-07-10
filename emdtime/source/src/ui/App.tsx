import { useEffect, useState } from "react";
import { DECET_STANDARD, PRESETS, type SystemConfig } from "../core/index.ts";
import { ClockView } from "./components/ClockView.tsx";
import { ConverterView } from "./components/ConverterView.tsx";
import { CalendarView } from "./components/CalendarView.tsx";
import { TunerView } from "./components/TunerView.tsx";
import { AboutView } from "./components/AboutView.tsx";

type ViewId = "clock" | "convert" | "calendar" | "planet" | "about";

const VIEWS: { id: ViewId; label: string; hint: string }[] = [
  { id: "clock", label: "Clock", hint: "Live decimal time" },
  { id: "convert", label: "Convert", hint: "Instants & durations" },
  { id: "calendar", label: "Calendar", hint: "The 4000-day year" },
  { id: "planet", label: "Planet", hint: "Tune day & orbit" },
  { id: "about", label: "Design", hint: "How & why" },
];

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState<string>(() => {
    const stored = localStorage.getItem("decet-theme");
    if (stored) return stored;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("decet-theme", theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

const VIEW_IDS = VIEWS.map((v) => v.id);
function isViewId(x: string): x is ViewId {
  return (VIEW_IDS as string[]).includes(x);
}
function viewFromHash(): ViewId {
  const h = window.location.hash.replace(/^#/, "");
  return isViewId(h) ? h : "clock";
}

export function App() {
  const [view, setViewState] = useState<ViewId>(viewFromHash);
  const [config, setConfig] = useState<SystemConfig>(DECET_STANDARD);
  const [theme, toggleTheme] = useTheme();

  // Deep-link the active view via the URL hash (shareable / bookmarkable),
  // and honour back/forward navigation.
  const setView = (v: ViewId) => {
    setViewState(v);
    if (viewFromHash() !== v) window.history.pushState(null, "", `#${v}`);
  };
  useEffect(() => {
    const onHash = () => setViewState(viewFromHash());
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    if (!window.location.hash) window.history.replaceState(null, "", `#${view}`);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            ◵
          </div>
          <div>
            <div className="brand-name">
              Decet <span className="brand-sub">· base-10 time</span>
            </div>
            <div className="brand-tag">{config.tagline}</div>
          </div>
        </div>

        <div className="header-controls">
          <div className="preset-switch" role="group" aria-label="Model preset">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={"preset-btn" + (p.id === config.id ? " active" : "")}
                onClick={() => setConfig(p)}
                title={p.tagline}
              >
                {p.name.replace("Decet ", "")}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={"tab" + (v.id === view ? " active" : "")}
            onClick={() => setView(v.id)}
          >
            <span className="tab-label">{v.label}</span>
            <span className="tab-hint">{v.hint}</span>
          </button>
        ))}
      </nav>

      <main className="app-main">
        {view === "clock" && <ClockView config={config} />}
        {view === "convert" && <ConverterView config={config} />}
        {view === "calendar" && <CalendarView config={config} />}
        {view === "planet" && <TunerView config={config} onAdopt={setConfig} />}
        {view === "about" && <AboutView config={config} />}
      </main>

      <footer className="app-footer">
        <span>
          Second = SI/Cesium (unchanged) · Day = one rotation · Year = one revolution ·
          epoch 2000-01-01 UTC
        </span>
        <span className="footer-dim">
          A design study. Earth is re-tuned within the brief's physical limits.
        </span>
      </footer>
    </div>
  );
}
