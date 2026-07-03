/* app.jsx — Morning Run. Locate your hotel, get a few loop suggestions of a
   target distance from OpenRouteService, then track the run live (trail,
   distance, pace, splits) with GPX export and on-device history.
   Browser-transpiled (Babel standalone). Depends on window.RunLib + maplibregl. */

const { useState, useEffect, useRef, useCallback } = React;
const L = window.RunLib;

const LS_KEY = "morning-run.orskey";
const LS_UNITS = "morning-run.units";
const MAX_ACC = 35;      // metres — reject GPS fixes worse than this
const MIN_MOVE = 3;      // metres — ignore sub-jitter movement
const MAX_SPEED = 12;    // m/s — reject teleport glitches (~43 km/h)

const MAP_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

const ROUTE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b"];
const DIST_CHOICES = { km: [3, 5, 8, 10], mi: [2, 3, 5, 6] };

function nowMs() { return Date.now(); }

// ---- small presentational bits ------------------------------------------
function Stat({ label, value, big }) {
  return (
    <div className={"mr-stat" + (big ? " mr-stat-big" : "")}>
      <div className="mr-stat-v">{value}</div>
      <div className="mr-stat-l">{label}</div>
    </div>
  );
}

function App() {
  const [phase, setPhase] = useState("setup"); // setup|choosing|tracking|summary|history
  const [orsKey, setOrsKey] = useState(() => localStorage.getItem(LS_KEY) || "");
  const [units, setUnits] = useState(() => localStorage.getItem(LS_UNITS) || "km");
  const [showSettings, setShowSettings] = useState(false);

  const [hotel, setHotel] = useState(null); // {lat, lon, label}
  const [locating, setLocating] = useState(false);
  const [targetM, setTargetM] = useState(5000);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selIdx, setSelIdx] = useState(0);

  const [live, setLive] = useState({ dist: 0, dur: 0 });
  const [paused, setPaused] = useState(false);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);

  // ---- imperative map state (outside React render) ----------------------
  const mapRef = useRef(null);
  const mapReadyRef = useRef(false);
  const hotelMarkerRef = useRef(null);
  const posMarkerRef = useRef(null);

  // ---- tracking state ----------------------------------------------------
  const watchRef = useRef(null);
  const pointsRef = useRef([]);
  const distRef = useRef(0);
  const trackingRef = useRef(false);
  const pausedRef = useRef(false);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);       // accumulated active ms
  const lastResumeRef = useRef(0);
  const tickRef = useRef(null);
  const wakeRef = useRef(null);
  const selRouteRef = useRef(null);
  const skipAccumRef = useRef(false); // resume: start a fresh segment, don't count the pause gap

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4200);
  }, []);

  // ---- map setup ---------------------------------------------------------
  useEffect(() => {
    const map = new maplibregl.Map({
      container: "map",
      style: MAP_STYLE,
      center: [-0.1276, 51.5072],
      zoom: 12,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    map.on("load", () => {
      map.addSource("candidates", { type: "geojson", data: emptyFC() });
      map.addLayer({
        id: "cand-dim", type: "line", source: "candidates",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4, "line-opacity": 0.35 }
      });
      map.addLayer({
        id: "cand-sel", type: "line", source: "candidates",
        filter: ["==", ["get", "idx"], -1],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 6, "line-opacity": 0.95 }
      });
      map.addSource("trail", { type: "geojson", data: emptyLine() });
      map.addLayer({
        id: "trail-line", type: "line", source: "trail",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ef4444", "line-width": 5 }
      });
      mapReadyRef.current = true;
    });
    // let the map settle its size (it lives behind the sheet, full-bleed)
    const resizeT = setTimeout(() => { try { map.resize(); } catch (e) {} }, 200);
    return () => { clearTimeout(resizeT); map.remove(); };
  }, []);

  function emptyFC() { return { type: "FeatureCollection", features: [] }; }
  function emptyLine() {
    return { type: "Feature", geometry: { type: "LineString", coordinates: [] } };
  }

  function whenMapReady(fn) {
    const map = mapRef.current;
    if (!map) return;
    if (mapReadyRef.current) fn(map);
    else map.once("load", () => fn(map));
  }

  function setHotelMarker(lat, lon) {
    whenMapReady((map) => {
      if (!hotelMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "mr-hotel-pin";
        hotelMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" });
      }
      hotelMarkerRef.current.setLngLat([lon, lat]).addTo(map);
    });
  }

  function drawCandidates(routes, selected) {
    whenMapReady((map) => {
      const feats = routes.map((r, i) => ({
        type: "Feature",
        properties: { idx: i, color: ROUTE_COLORS[i % ROUTE_COLORS.length] },
        geometry: { type: "LineString", coordinates: r.coords.map((c) => [c[0], c[1]]) }
      }));
      const src = map.getSource("candidates");
      if (src) src.setData({ type: "FeatureCollection", features: feats });
      map.setFilter("cand-sel", ["==", ["get", "idx"], selected == null ? -1 : selected]);
      if (routes.length) fitToCoords(map, routes[selected || 0].coords);
    });
  }

  function fitToCoords(map, coords) {
    if (!coords || !coords.length) return;
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    coords.forEach((c) => {
      if (c[0] < minX) minX = c[0];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
    });
    map.fitBounds([[minX, minY], [maxX, maxY]], { padding: { top: 70, bottom: 320, left: 40, right: 40 }, duration: 500 });
  }

  function clearRouteAndTrail() {
    whenMapReady((map) => {
      const c = map.getSource("candidates"); if (c) c.setData(emptyFC());
      const t = map.getSource("trail"); if (t) t.setData(emptyLine());
      map.setFilter("cand-sel", ["==", ["get", "idx"], -1]);
    });
  }

  // ---- geolocation: find the hotel --------------------------------------
  const locate = useCallback(() => {
    if (!navigator.geolocation) { flash("This device has no GPS/geolocation."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const h = { lat: latitude, lon: longitude, label: null };
        setHotel(h);
        setHotelMarker(latitude, longitude);
        whenMapReady((map) => map.easeTo({ center: [longitude, latitude], zoom: 15 }));
        setLocating(false);
        L.reverseGeocode(latitude, longitude).then((label) => {
          if (label) setHotel((cur) => (cur && cur.lat === latitude && cur.lon === longitude ? { ...cur, label } : cur));
        });
      },
      (err) => {
        setLocating(false);
        flash(err.code === 1
          ? "Location permission denied — enable it for this site and retry."
          : "Couldn't get a location fix. Try again outdoors.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, [flash]);

  // auto-locate once we have a key and no hotel yet
  useEffect(() => {
    if (orsKey && !hotel && phase === "setup" && !locating) locate();
    // eslint-disable-next-line
  }, [orsKey]);

  // tapping the map re-pins the hotel while in setup
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e) => {
      if (phase !== "setup") return;
      const lat = e.lngLat.lat, lon = e.lngLat.lng;
      setHotel({ lat, lon, label: null });
      setHotelMarker(lat, lon);
      L.reverseGeocode(lat, lon).then((label) => {
        if (label) setHotel((cur) => (cur && cur.lat === lat && cur.lon === lon ? { ...cur, label } : cur));
      });
    };
    map.on("click", onClick);
    return () => map.off("click", onClick);
  }, [phase]);

  // ---- route suggestions -------------------------------------------------
  const suggest = useCallback(() => {
    if (!hotel) { flash("Set your hotel first."); return; }
    if (!orsKey) { setShowSettings(true); return; }
    setBusy(true);
    setToast(null);
    L.fetchRoundTrips({ key: orsKey, lat: hotel.lat, lon: hotel.lon, lengthM: targetM,
      seeds: [1, 42, 99], avoidFeatures: ["ferries", "fords"] })
      .then((routes) => {
        routes.sort((a, b) => Math.abs(a.distance - targetM) - Math.abs(b.distance - targetM));
        setCandidates(routes);
        setSelIdx(0);
        drawCandidates(routes, 0);
        setPhase("choosing");
      })
      .catch((err) => {
        const s = err.status;
        if (s === 401) flash("OpenRouteService rejected the key — check it in Settings.");
        else if (s === 403) flash("OpenRouteService daily quota reached or key not authorised — try later or check Settings.");
        else if (s === 429) flash("Hit OpenRouteService's rate limit — wait a minute and try again.");
        else flash(String(err.message || err));
      })
      .finally(() => setBusy(false));
  }, [hotel, orsKey, targetM, flash]);

  function pickCandidate(i) {
    setSelIdx(i);
    whenMapReady((map) => {
      map.setFilter("cand-sel", ["==", ["get", "idx"], i]);
      fitToCoords(map, candidates[i].coords);
    });
  }

  // ---- tracking ----------------------------------------------------------
  function acquireWake() {
    try {
      if (wakeRef.current && !wakeRef.current.released) return; // already held
      if ("wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then((s) => { wakeRef.current = s; }).catch(() => {});
      }
    } catch (e) {}
  }
  function releaseWake() {
    try { if (wakeRef.current) { wakeRef.current.release(); wakeRef.current = null; } } catch (e) {}
  }
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && trackingRef.current && !pausedRef.current) acquireWake();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  function liveDurMs() {
    let ms = elapsedRef.current;
    if (trackingRef.current && !pausedRef.current) ms += nowMs() - lastResumeRef.current;
    return ms;
  }

  function onFix(pos) {
    if (!trackingRef.current || pausedRef.current) return;
    const acc = pos.coords.accuracy;
    if (acc != null && acc > MAX_ACC) return;
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    const t = pos.timestamp || nowMs();
    const ele = pos.coords.altitude != null && isFinite(pos.coords.altitude) ? pos.coords.altitude : null;

    // always show current position
    whenMapReady((map) => {
      if (!posMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "mr-pos-dot";
        posMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" });
      }
      posMarkerRef.current.setLngLat([lon, lat]).addTo(map);
    });

    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    if (last) {
      if (skipAccumRef.current) {
        // first fix after resume: this point re-baselines the segment, so the
        // distance walked during the pause is not added.
        skipAccumRef.current = false;
      } else {
        const d = L.haversine(last.lat, last.lon, lat, lon);
        const dt = (t - last.t) / 1000;
        if (d < MIN_MOVE) { setLive({ dist: distRef.current, dur: liveDurMs() / 1000 }); return; }
        if (dt > 0 && d / dt > MAX_SPEED) return; // glitch
        distRef.current += d;
      }
    }
    // `at` = active elapsed ms at this fix (excludes paused time) — used for splits
    pts.push({ lat, lon, t, ele, at: liveDurMs() });

    whenMapReady((map) => {
      const src = map.getSource("trail");
      if (src) src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: pts.map((p) => [p.lon, p.lat]) } });
      if (pts.length % 8 === 0) map.easeTo({ center: [lon, lat], duration: 400 });
    });
    setLive({ dist: distRef.current, dur: liveDurMs() / 1000 });
  }

  function startRun() {
    if (!navigator.geolocation) { flash("This device has no GPS/geolocation."); return; }
    pointsRef.current = [];
    distRef.current = 0;
    elapsedRef.current = 0;
    startedAtRef.current = nowMs();
    lastResumeRef.current = nowMs();
    trackingRef.current = true;
    pausedRef.current = false;
    setPaused(false);
    setLive({ dist: 0, dur: 0 });
    selRouteRef.current = candidates[selIdx] || null;
    // keep only the chosen loop visible, dimmed, as a guide
    whenMapReady((map) => {
      map.setFilter("cand-sel", ["==", ["get", "idx"], selIdx]);
      const t = map.getSource("trail"); if (t) t.setData(emptyLine());
    });
    setPhase("tracking");
    acquireWake();
    watchRef.current = navigator.geolocation.watchPosition(onFix, (err) => {
      if (err.code === 1) flash("Location permission lost — re-enable it to keep recording this run.");
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      if (trackingRef.current && !pausedRef.current) setLive({ dist: distRef.current, dur: liveDurMs() / 1000 });
    }, 1000);
  }

  function togglePause() {
    if (!trackingRef.current) return;
    if (!pausedRef.current) {
      elapsedRef.current += nowMs() - lastResumeRef.current;
      pausedRef.current = true;
      setPaused(true);
      releaseWake();
    } else {
      lastResumeRef.current = nowMs();
      pausedRef.current = false;
      skipAccumRef.current = true; // don't count the distance covered while paused
      setPaused(false);
      acquireWake();
    }
  }

  function stopRun() {
    if (pausedRef.current === false) elapsedRef.current += nowMs() - lastResumeRef.current;
    trackingRef.current = false;
    pausedRef.current = false;
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    releaseWake();
    if (posMarkerRef.current) { posMarkerRef.current.remove(); posMarkerRef.current = null; }

    const dur = elapsedRef.current / 1000;
    const dist = distRef.current;
    const started = startedAtRef.current;
    const dateStr = new Date(started).toLocaleString(undefined,
      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const run = {
      id: String(started),
      name: (hotel && hotel.label ? hotel.label + " — " : "") + dateStr,
      startedAt: started,
      distance: dist,
      duration: dur,
      units,
      points: pointsRef.current.slice(),
      plannedM: selRouteRef.current ? selRouteRef.current.distance : null
    };
    setSummary(run);
    setPhase("summary");
  }

  function saveRun() {
    if (!summary) return;
    L.saveRun(summary).then(() => { flash("Run saved."); }).catch(() => flash("Couldn't save the run."));
  }

  function discardSummary() {
    setSummary(null);
    clearRouteAndTrail();
    setCandidates([]);
    setPhase("setup");
  }

  function openHistory() {
    L.listRuns().then((rows) => { setHistory(rows); setPhase("history"); }).catch(() => flash("Couldn't read history."));
  }

  function viewHistoryRun(run) {
    setSummary(run);
    whenMapReady((map) => {
      const t = map.getSource("trail");
      const coords = (run.points || []).map((p) => [p.lon, p.lat]);
      if (t) t.setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
      const c = map.getSource("candidates"); if (c) c.setData(emptyFC());
      if (coords.length) fitToCoords(map, coords);
    });
    setPhase("summary");
  }

  function deleteHistoryRun(id) {
    L.deleteRun(id).then(() => setHistory((h) => h.filter((r) => r.id !== id))).catch(() => flash("Delete failed."));
  }

  // ---- persisted settings ------------------------------------------------
  function saveSettings(key, u) {
    const k = (key || "").trim();
    setOrsKey(k);
    localStorage.setItem(LS_KEY, k);
    setUnits(u);
    localStorage.setItem(LS_UNITS, u);
    setShowSettings(false);
    if (k && !hotel) locate();
  }

  // ---- derived -----------------------------------------------------------
  const liveDist = L.fmtDistance(live.dist, units);
  const liveDur = L.fmtDuration(live.dur);
  const livePace = L.fmtPace(L.paceSecPerUnit(live.dist, live.dur, units), units);

  return (
    <div className="mr-app">
      <div id="map" className="mr-map" />

      <header className="mr-top">
        <div className="mr-brand"><span className="mr-brand-dot" /> Morning Run</div>
        <div className="mr-top-actions">
          {phase !== "tracking" && (
            <button className="mr-icon-btn" title="History" onClick={openHistory}>History</button>
          )}
          {phase !== "tracking" && (
            <button className="mr-icon-btn" title="Settings" onClick={() => setShowSettings(true)}>Settings</button>
          )}
        </div>
      </header>

      <div className="mr-toast-live" aria-live="assertive" aria-atomic="true">
        {toast && <div className="mr-toast" role="alert" onClick={() => setToast(null)}>{toast}</div>}
      </div>

      {/* ---- SETUP ---- */}
      {phase === "setup" && (
        <div className="mr-sheet">
          <div className="mr-sheet-h">Start point</div>
          <div className="mr-hotel-row">
            <div className="mr-hotel-info">
              {hotel
                ? <><strong>{hotel.label || "Pinned location"}</strong>
                    <span className="mr-sub">{hotel.lat.toFixed(4)}, {hotel.lon.toFixed(4)} · tap the map to adjust</span></>
                : <span className="mr-sub">Find your hotel with GPS, or tap the map.</span>}
            </div>
            <button className="mr-btn mr-btn-ghost" onClick={locate} disabled={locating}>
              {locating ? "Locating…" : (hotel ? "Re-locate" : "Locate me")}
            </button>
          </div>

          <div className="mr-sheet-h">Loop distance</div>
          <div className="mr-chips">
            {DIST_CHOICES[units].map((d) => {
              const m = Math.round(d * L.unitMetres(units));
              const on = Math.abs(m - targetM) < L.unitMetres(units) * 0.25;
              return (
                <button key={d} className={"mr-chip" + (on ? " on" : "")} onClick={() => setTargetM(m)}>
                  {d} {units}
                </button>
              );
            })}
          </div>
          <input className="mr-slider" type="range"
            aria-label="Loop distance" aria-valuetext={L.fmtDistance(targetM, units)}
            min={units === "mi" ? 1600 : 1000} max={units === "mi" ? 16093 : 15000}
            step={units === "mi" ? 402 : 250}
            value={targetM} onChange={(e) => setTargetM(Number(e.target.value))} />
          <div className="mr-sub mr-center">Target ≈ {L.fmtDistance(targetM, units)}</div>

          <button className="mr-btn mr-btn-primary mr-wide" onClick={suggest} disabled={busy || !hotel}>
            {busy ? "Finding routes…" : "Suggest routes"}
          </button>
          <div className="mr-note">Loops start & end at your pin, on foot-friendly ways (ferries &amp; fords avoided). Routing by OpenRouteService.</div>
        </div>
      )}

      {/* ---- CHOOSING ---- */}
      {phase === "choosing" && (
        <div className="mr-sheet">
          <div className="mr-sheet-h">Pick a loop <span className="mr-sub">· ~{L.fmtDistance(targetM, units)} target</span></div>
          <div className="mr-routes">
            {candidates.map((r, i) => (
              <button key={i} className={"mr-route-card" + (i === selIdx ? " on" : "")} onClick={() => pickCandidate(i)}>
                <span className="mr-route-swatch" style={{ background: ROUTE_COLORS[i % 3] }} />
                <span className="mr-route-main">
                  <strong>{["Loop A", "Loop B", "Loop C"][i] || "Loop"}</strong>
                  <span className="mr-sub">{L.fmtDistance(r.distance, units)}
                    {r.ascent != null ? " · ↑" + Math.round(r.ascent) + " m" : ""}</span>
                </span>
                {i === selIdx && <span className="mr-route-check">✓</span>}
              </button>
            ))}
          </div>
          <div className="mr-row-2">
            <button className="mr-btn mr-btn-ghost" onClick={() => { setPhase("setup"); clearRouteAndTrail(); }}>Back</button>
            <button className="mr-btn mr-btn-primary" onClick={startRun} disabled={!candidates.length}>Start run</button>
          </div>
        </div>
      )}

      {/* ---- TRACKING ---- */}
      {phase === "tracking" && (
        <div className="mr-sheet">
          <div className="mr-stats-row">
            <Stat big label="distance" value={liveDist} />
            <Stat big label="time" value={liveDur} />
            <Stat big label="pace" value={livePace} />
          </div>
          {paused && <div className="mr-paused">Paused</div>}
          <div className="mr-row-2">
            <button className="mr-btn mr-btn-ghost" onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>
            <button className="mr-btn mr-btn-stop" onClick={stopRun}>Finish</button>
          </div>
          <div className="mr-note">Keep the screen on for best tracking — a web app can't log GPS with the screen off. Distance &amp; pace update live.</div>
        </div>
      )}

      {/* ---- SUMMARY ---- */}
      {phase === "summary" && summary && (
        <SummarySheet run={summary} units={units}
          onSave={saveRun}
          onExport={() => L.downloadGPX(summary)}
          onDone={discardSummary} />
      )}

      {/* ---- HISTORY ---- */}
      {phase === "history" && (
        <HistorySheet runs={history} units={units}
          onBack={() => setPhase(summary ? "summary" : "setup")}
          onView={viewHistoryRun}
          onExport={(r) => L.downloadGPX(r)}
          onDelete={deleteHistoryRun} />
      )}

      {showSettings && (
        <Settings orsKey={orsKey} units={units}
          onClose={() => setShowSettings(false)} onSave={saveSettings} />
      )}
    </div>
  );
}

function SummarySheet({ run, units, onSave, onExport, onDone }) {
  const splits = L.computeSplits(run.points || [], units);
  const paceStr = L.fmtPace(L.paceSecPerUnit(run.distance, run.duration, units), units);
  return (
    <div className="mr-sheet mr-sheet-tall">
      <div className="mr-sheet-h">{run.name}</div>
      <div className="mr-stats-row">
        <Stat label="distance" value={L.fmtDistance(run.distance, units)} />
        <Stat label="time" value={L.fmtDuration(run.duration)} />
        <Stat label="pace" value={paceStr} />
      </div>
      {run.plannedM != null && (
        <div className="mr-sub mr-center">Planned loop ≈ {L.fmtDistance(run.plannedM, units)}</div>
      )}
      {splits.length > 0 && (
        <div className="mr-splits">
          <div className="mr-splits-h"><span>#</span><span>pace</span><span>time</span></div>
          {splits.map((s) => (
            <div className="mr-split" key={s.index}>
              <span>{s.partial ? s.index + "·" : s.index}</span>
              <span className="mr-mono">{L.fmtPace(s.pace, units)}</span>
              <span className="mr-mono">{L.fmtDuration(s.duration)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mr-row-3">
        <button className="mr-btn mr-btn-ghost" onClick={onExport}>Export GPX</button>
        <button className="mr-btn mr-btn-ghost" onClick={onSave}>Save</button>
        <button className="mr-btn mr-btn-primary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

function HistorySheet({ runs, units, onBack, onView, onExport, onDelete }) {
  return (
    <div className="mr-sheet mr-sheet-tall">
      <div className="mr-sheet-h">Run history</div>
      {(!runs || !runs.length) && <div className="mr-sub mr-center mr-pad">No saved runs yet.</div>}
      <div className="mr-hist">
        {runs.map((r) => (
          <div className="mr-hist-row" key={r.id}>
            <button className="mr-hist-main" onClick={() => onView(r)}>
              <strong>{r.name}</strong>
              <span className="mr-sub">{L.fmtDistance(r.distance, r.units || units)} · {L.fmtDuration(r.duration)} · {L.fmtPace(L.paceSecPerUnit(r.distance, r.duration, r.units || units), r.units || units)}</span>
            </button>
            <div className="mr-hist-acts">
              <button className="mr-mini" aria-label={"Export " + r.name + " as GPX"} onClick={() => onExport(r)}>GPX</button>
              <button className="mr-mini mr-mini-del" aria-label={"Delete " + r.name}
                onClick={() => { if (window.confirm("Delete this run? This can't be undone.")) onDelete(r.id); }}>✕</button>
            </div>
          </div>
        ))}
      </div>
      <button className="mr-btn mr-btn-ghost mr-wide" onClick={onBack}>Back</button>
    </div>
  );
}

function Settings({ orsKey, units, onClose, onSave }) {
  const [k, setK] = useState(orsKey);
  const [u, setU] = useState(units);
  return (
    <div className="mr-modal-wrap" onClick={onClose}>
      <div className="mr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mr-sheet-h">Settings</div>
        <label className="mr-field-l">OpenRouteService API key</label>
        <input className="mr-input" type="text" value={k} placeholder="paste your free key"
          onChange={(e) => setK(e.target.value)} autoComplete="off" spellCheck="false" />
        <div className="mr-note">
          Free key from <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noopener">openrouteservice.org</a> — dev dashboard → Tokens.
          Stored only on this device; never uploaded.
        </div>
        <label className="mr-field-l">Units</label>
        <div className="mr-chips">
          <button className={"mr-chip" + (u === "km" ? " on" : "")} onClick={() => setU("km")}>Kilometres</button>
          <button className={"mr-chip" + (u === "mi" ? " on" : "")} onClick={() => setU("mi")}>Miles</button>
        </div>
        <div className="mr-row-2">
          <button className="mr-btn mr-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="mr-btn mr-btn-primary" onClick={() => onSave(k, u)}>Save</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app-root")).render(<App />);
