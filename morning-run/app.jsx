/* app.jsx — Morning Run. Locate your hotel, get a few loop suggestions of a
   target distance from OpenRouteService, then track the run live (trail,
   distance, pace, splits) with GPX export and on-device history.

   SHIP TRACK mode (added): when GPS can't measure your stride — e.g. running
   laps of a moving cruise ship — switch to lap counting. Pick your ship (or
   auto-detect it from GPS + AIS), set the lap length, and the app counts laps
   and lap times, projecting your finish toward a goal distance.
   Browser-transpiled (Babel standalone). Depends on window.RunLib + maplibregl. */

const { useState, useEffect, useRef, useCallback } = React;
const L = window.RunLib;

const LS_KEY = "morning-run.orskey";
const LS_UNITS = "morning-run.units";
const LS_AIS = "morning-run.aiskey";
const LS_AIS_EP = "morning-run.aisendpoint";
const MAX_ACC = 35;      // metres — reject GPS fixes worse than this
const MIN_MOVE = 3;      // metres — ignore sub-jitter movement
const MAX_SPEED = 12;    // m/s — reject teleport glitches (~43 km/h)
const AT_SEA_SPEED = 1.4; // m/s — a GPS fix moving this fast suggests you're aboard a vehicle/ship

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
  const [phase, setPhase] = useState("setup"); // setup|choosing|tracking|summary|history|cruise
  const [mode, setMode] = useState("outdoor");  // outdoor|ship
  const [orsKey, setOrsKey] = useState(() => localStorage.getItem(LS_KEY) || "");
  const [aisKey, setAisKey] = useState(() => localStorage.getItem(LS_AIS) || "");
  const [aisEndpoint, setAisEndpoint] = useState(() => localStorage.getItem(LS_AIS_EP) || "");
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

  // ---- ship-track state --------------------------------------------------
  const [atSea, setAtSea] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [ship, setShip] = useState(null); // {name, line, lapM}
  const [showShipPicker, setShowShipPicker] = useState(false);
  const [shipSearch, setShipSearch] = useState("");
  const [showDetect, setShowDetect] = useState(false);
  const [detectStep, setDetectStep] = useState(0); // 0 locating,1 gps ok,2 ais,3 done
  const [detectResult, setDetectResult] = useState(null);
  const [detectErr, setDetectErr] = useState(null);
  const [detectAcc, setDetectAcc] = useState(null);
  const [lenMode, setLenMode] = useState("length"); // length|laps
  const [lengthValue, setLengthValue] = useState("400");
  const [lengthUnit, setLengthUnit] = useState("m"); // m|ft
  const [lapsPer, setLapsPer] = useState("4");
  const [goalM, setGoalM] = useState(() => Math.round((localStorage.getItem(LS_UNITS) === "mi" ? 3 : 5) * (localStorage.getItem(LS_UNITS) === "mi" ? 1609.344 : 1000)));
  const [autoCount, setAutoCount] = useState(true);
  const [laps, setLaps] = useState([]);          // [{ms, auto}]
  const [flashMsg, setFlashMsg] = useState(null);

  // ---- imperative map state (outside React render) ----------------------
  const mapRef = useRef(null);
  const mapReadyRef = useRef(false);
  const hotelMarkerRef = useRef(null);
  const posMarkerRef = useRef(null);

  // ---- GPS tracking state (outdoor) -------------------------------------
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

  // ---- cruise (lap) timing state ----------------------------------------
  const cRunRef = useRef(false);
  const cPausedRef = useRef(false);
  const cElapsedRef = useRef(0);
  const cResumeRef = useRef(0);
  const cTickRef = useRef(null);
  const cLapsRef = useRef([]);
  const cStartedAtRef = useRef(0);
  const detTimersRef = useRef([]);
  const flashTimerRef = useRef(null);

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
        const { latitude, longitude, speed } = pos.coords;
        const h = { lat: latitude, lon: longitude, label: null };
        setHotel(h);
        setHotelMarker(latitude, longitude);
        whenMapReady((map) => map.easeTo({ center: [longitude, latitude], zoom: 15 }));
        setLocating(false);
        // a fast-moving fix hints you're aboard a vehicle/ship — nudge toward Ship track
        if (speed != null && isFinite(speed) && speed > AT_SEA_SPEED) setAtSea(true);
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
    if (orsKey && !hotel && phase === "setup" && mode === "outdoor" && !locating) locate();
    // eslint-disable-next-line
  }, [orsKey]);

  // tapping the map re-pins the hotel while in setup (outdoor)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e) => {
      if (phase !== "setup" || mode !== "outdoor") return;
      const lat = e.lngLat.lat, lon = e.lngLat.lng;
      setHotel({ lat, lon, label: null });
      setHotelMarker(lat, lon);
      L.reverseGeocode(lat, lon).then((label) => {
        if (label) setHotel((cur) => (cur && cur.lat === lat && cur.lon === lon ? { ...cur, label } : cur));
      });
    };
    map.on("click", onClick);
    return () => map.off("click", onClick);
  }, [phase, mode]);

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

  // ---- wake lock ---------------------------------------------------------
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
      if (document.visibilityState === "visible" && (trackingRef.current || cRunRef.current) && !pausedRef.current && !cPausedRef.current) acquireWake();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ---- GPS tracking (outdoor) -------------------------------------------
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
        skipAccumRef.current = false;
      } else {
        const d = L.haversine(last.lat, last.lon, lat, lon);
        const dt = (t - last.t) / 1000;
        if (d < MIN_MOVE) { setLive({ dist: distRef.current, dur: liveDurMs() / 1000 }); return; }
        if (dt > 0 && d / dt > MAX_SPEED) return; // glitch
        distRef.current += d;
      }
    }
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
      skipAccumRef.current = true;
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

  // ---- ship track: lap length + timing ----------------------------------
  function lapLenM() {
    if (lenMode === "length") {
      const v = parseFloat(lengthValue) || 0;
      return lengthUnit === "ft" ? v * 0.3048 : v;
    }
    const lp = parseFloat(lapsPer) || 0;
    return lp > 0 ? L.unitMetres(units) / lp : 0;
  }
  function cActiveMs() { let ms = cElapsedRef.current; if (cRunRef.current && !cPausedRef.current) ms += nowMs() - cResumeRef.current; return ms; }
  function cCompletedMs() { return cLapsRef.current.reduce((s, l) => s + l.ms, 0); }

  function doFlash(msg) {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashMsg(msg);
    flashTimerRef.current = setTimeout(() => setFlashMsg(null), 1600);
  }

  function selectShip(s) {
    setShip({ name: s.n, line: s.l, lapM: s.m });
    setLenMode("length"); setLengthUnit("m"); setLengthValue(String(Math.round(s.m)));
    setShowShipPicker(false);
  }

  function startCruise() {
    const len = lapLenM();
    if (len <= 0) { flash("Enter a valid lap length first."); return; }
    cLapsRef.current = [];
    cElapsedRef.current = 0;
    cStartedAtRef.current = nowMs();
    cResumeRef.current = nowMs();
    cRunRef.current = true;
    cPausedRef.current = false;
    setLaps([]);
    setPaused(false);
    setPhase("cruise");
    acquireWake();
    if (cTickRef.current) clearInterval(cTickRef.current);
    cTickRef.current = setInterval(onCruiseTick, 500);
  }

  function onCruiseTick() {
    if (!cRunRef.current || cPausedRef.current) return;
    const done = cCompletedMs();
    // auto-count: after lap 1, advance when the current lap reaches the running average
    if (autoCount && cLapsRef.current.length >= 1) {
      const cur = cActiveMs() - done;
      const avg = done / cLapsRef.current.length;
      if (cur >= avg && cur > 3000) { addLap(true); return; }
    }
    setLive({ dist: 0, dur: cActiveMs() / 1000 }); // force re-render for the running clock
  }

  function addLap(auto) {
    const cur = cActiveMs() - cCompletedMs();
    if (cur < 1500) return;
    const next = cLapsRef.current.concat([{ ms: cur, auto: !!auto }]);
    cLapsRef.current = next;
    setLaps(next);
    doFlash((auto ? "Auto lap " : "Lap ") + next.length + " · " + L.fmtDuration(cur / 1000));
  }
  function tapLap() { addLap(false); }

  function cTogglePause() {
    if (!cRunRef.current) return;
    if (!cPausedRef.current) {
      cElapsedRef.current += nowMs() - cResumeRef.current;
      cPausedRef.current = true;
      setPaused(true);
      releaseWake();
    } else {
      cResumeRef.current = nowMs();
      cPausedRef.current = false;
      setPaused(false);
      acquireWake();
    }
  }

  function finishCruise() {
    if (!cPausedRef.current) cElapsedRef.current += nowMs() - cResumeRef.current;
    cRunRef.current = false;
    cPausedRef.current = false;
    if (cTickRef.current) { clearInterval(cTickRef.current); cTickRef.current = null; }
    releaseWake();
    const len = lapLenM();
    const lapsArr = cLapsRef.current.slice();
    // finalize a partial current lap into the record
    const cur = cElapsedRef.current - lapsArr.reduce((s, l) => s + l.ms, 0);
    if (cur > 3000) lapsArr.push({ ms: cur, auto: false });
    const started = cStartedAtRef.current;
    const dateStr = new Date(started).toLocaleString(undefined,
      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const run = {
      id: String(started),
      ship: true,
      shipName: ship ? ship.name : null,
      name: (ship ? ship.name : "Deck run") + " — " + dateStr,
      startedAt: started,
      laps: lapsArr,
      lapLenM: len,
      lapsCount: lapsArr.length,
      distance: lapsArr.length * len,
      duration: cElapsedRef.current / 1000,
      goalM: goalM,
      units,
      points: []
    };
    setSummary(run);
    setPhase("summary");
  }

  // ---- ship detection (GPS + AIS) ---------------------------------------
  function clearDetTimers() { detTimersRef.current.forEach(clearTimeout); detTimersRef.current = []; }
  function runDetect() {
    clearDetTimers();
    setShowShipPicker(false);
    setShowDetect(true);
    setDetectStep(0); setDetectResult(null); setDetectErr(null); setDetectAcc(null);
    if (!navigator.geolocation) { setDetectErr("no-geo"); setDetectStep(3); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      setDetectAcc(pos.coords.accuracy);
      setDetectStep(1);
      detTimersRef.current.push(setTimeout(() => setDetectStep((s) => (s < 2 ? 2 : s)), 350));
      L.detectShip({ lat, lon, aisKey, endpoint: aisEndpoint || null })
        .then((r) => { setDetectResult(r); setDetectStep(3); })
        .catch((err) => { setDetectErr(err && err.message ? err.message : "fail"); setDetectStep(3); });
    }, (err) => {
      setDetectErr(err.code === 1 ? "perm" : "nofix"); setDetectStep(3);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  }
  function confirmDetect() {
    if (detectResult && detectResult.ship) selectShip(detectResult.ship);
    clearDetTimers(); setShowDetect(false);
  }
  function closeDetect() { clearDetTimers(); setShowDetect(false); }
  function detectToPicker() { clearDetTimers(); setShowDetect(false); setShowShipPicker(true); setShipSearch(""); }

  function saveRun() {
    if (!summary) return;
    L.saveRun(summary).then(() => { flash("Run saved."); }).catch(() => flash("Couldn't save the run."));
  }

  function discardSummary() {
    setSummary(null);
    clearRouteAndTrail();
    setCandidates([]);
    setLaps([]);
    setPhase("setup");
  }

  function openHistory() {
    L.listRuns().then((rows) => { setHistory(rows); setPhase("history"); }).catch(() => flash("Couldn't read history."));
  }

  function viewHistoryRun(run) {
    setSummary(run);
    if (!run.ship) {
      whenMapReady((map) => {
        const t = map.getSource("trail");
        const coords = (run.points || []).map((p) => [p.lon, p.lat]);
        if (t) t.setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
        const c = map.getSource("candidates"); if (c) c.setData(emptyFC());
        if (coords.length) fitToCoords(map, coords);
      });
    } else {
      clearRouteAndTrail();
    }
    setPhase("summary");
  }

  function deleteHistoryRun(id) {
    L.deleteRun(id).then(() => setHistory((h) => h.filter((r) => r.id !== id))).catch(() => flash("Delete failed."));
  }

  // ---- persisted settings ------------------------------------------------
  function saveSettings(next) {
    const k = (next.orsKey || "").trim();
    setOrsKey(k); localStorage.setItem(LS_KEY, k);
    const ak = (next.aisKey || "").trim();
    setAisKey(ak); localStorage.setItem(LS_AIS, ak);
    const ep = (next.aisEndpoint || "").trim();
    setAisEndpoint(ep); localStorage.setItem(LS_AIS_EP, ep);
    setUnits(next.units); localStorage.setItem(LS_UNITS, next.units);
    setShowSettings(false);
    if (k && !hotel && mode === "outdoor") locate();
  }

  // ---- derived (outdoor live) -------------------------------------------
  const liveDist = L.fmtDistance(live.dist, units);
  const liveDur = L.fmtDuration(live.dur);
  const livePace = L.fmtPace(L.paceSecPerUnit(live.dist, live.dur, units), units);

  // ---- derived (cruise) --------------------------------------------------
  const cLen = lapLenM();
  const cTotalMs = cActiveMs();
  const cCompleted = cCompletedMs();
  const cCurMs = cTotalMs - cCompleted;
  const cDistanceM = laps.length * cLen;
  const cAvgLapMs = laps.length ? cCompleted / laps.length : 0;
  const hasGoal = goalM != null;
  const lapsNeeded = hasGoal && cLen > 0 ? goalM / cLen : 0;
  const cProgress = lapsNeeded > 0 ? Math.max(0, Math.min(1, laps.length / lapsNeeded)) : 0;
  const RING_R = 100, RING_C = 2 * Math.PI * RING_R;

  const goalChoices = DIST_CHOICES[units].map((d) => Math.round(d * L.unitMetres(units))).concat([null]);
  const shipRows = L.searchShips(shipSearch);

  return (
    <div className="mr-app">
      <div id="map" className="mr-map" />
      {(mode === "ship" && phase === "setup") && <div className="mr-sea" />}

      <header className="mr-top">
        <div className="mr-brand"><span className="mr-brand-dot" /> Morning Run</div>
        <div className="mr-top-actions">
          {phase !== "tracking" && phase !== "cruise" && (
            <button className="mr-icon-btn" title="History" onClick={openHistory}>History</button>
          )}
          {phase !== "tracking" && phase !== "cruise" && (
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
          <div className="mr-seg">
            <button className={"mr-seg-btn" + (mode === "outdoor" ? " on" : "")} onClick={() => setMode("outdoor")}>Outdoor loop</button>
            <button className={"mr-seg-btn" + (mode === "ship" ? " on" : "")} onClick={() => { setMode("ship"); setBannerDismissed(true); }}>Ship track</button>
          </div>

          {/* ===== OUTDOOR ===== */}
          {mode === "outdoor" && (
            <div>
              {atSea && !bannerDismissed && (
                <div className="mr-banner">
                  <span className="mr-banner-dot" />
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <div className="mr-banner-t">Your GPS is drifting fast</div>
                    <div className="mr-sub">Looks like you're moving with a vehicle or ship. GPS distance won't be reliable — switch to <strong>Ship track</strong> to count laps instead.</div>
                    <div className="mr-banner-acts">
                      <button className="mr-mini-primary" onClick={() => { setMode("ship"); setBannerDismissed(true); }}>Switch to Ship track</button>
                      <button className="mr-mini-ghost" onClick={() => setBannerDismissed(true)}>Dismiss</button>
                    </div>
                  </div>
                </div>
              )}

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

          {/* ===== SHIP TRACK ===== */}
          {mode === "ship" && (
            <div>
              <div className="mr-ship-intro">
                <span className="mr-anchor">⚓</span>
                <div>On a moving ship, GPS tracks the sea, not your stride. Set your lap length once and Morning Run counts laps &amp; lap times instead.</div>
              </div>

              <div className="mr-sheet-h">Your ship</div>
              {ship ? (
                <div className="mr-ship-card">
                  <div className="mr-ship-info">
                    <strong className="mr-ship-name">{ship.name}</strong>
                    <span className="mr-sub">{ship.line} · ≈{Math.round(ship.lapM)} m lap · {(L.unitMetres("mi") / ship.lapM).toFixed(1)} laps/mi (estimate)</span>
                  </div>
                  <button className="mr-btn mr-btn-ghost" style={{ flex: "none", padding: "8px 12px", fontSize: 13 }} onClick={() => { setShowShipPicker(true); setShipSearch(""); }}>Change</button>
                </div>
              ) : (
                <div className="mr-ship-actions">
                  <button className="mr-btn mr-btn-ghost" onClick={() => { setShowShipPicker(true); setShipSearch(""); }}>Choose ship</button>
                  <button className="mr-btn mr-btn-primary" onClick={runDetect}>⌖ Detect ship</button>
                </div>
              )}
              <div className="mr-note" style={{ marginTop: 8, marginBottom: 4 }}>Lap lengths are community estimates from deck plans — confirm the posted “laps = 1 mile” sign and fine-tune below.</div>

              <div className="mr-sheet-h" style={{ marginTop: 18 }}>Track length</div>
              <div className="mr-seg">
                <button className={"mr-seg-btn" + (lenMode === "length" ? " on" : "")} onClick={() => setLenMode("length")}>By length</button>
                <button className={"mr-seg-btn" + (lenMode === "laps" ? " on" : "")} onClick={() => setLenMode("laps")}>Laps per {units === "mi" ? "mi" : "km"}</button>
              </div>
              {lenMode === "length" ? (
                <div className="mr-len-row">
                  <input className="mr-input" type="number" inputMode="decimal" value={lengthValue} onChange={(e) => setLengthValue(e.target.value)} />
                  <div className="mr-seg mr-seg-sm">
                    <button className={"mr-seg-btn" + (lengthUnit === "m" ? " on" : "")} onClick={() => setLengthUnit("m")}>m</button>
                    <button className={"mr-seg-btn" + (lengthUnit === "ft" ? " on" : "")} onClick={() => setLengthUnit("ft")}>ft</button>
                  </div>
                </div>
              ) : (
                <div className="mr-len-row" style={{ alignItems: "center" }}>
                  <input className="mr-input" style={{ maxWidth: 120, flex: "none" }} type="number" inputMode="decimal" value={lapsPer} onChange={(e) => setLapsPer(e.target.value)} />
                  <span className="mr-sub">laps = 1 {units === "mi" ? "mile" : "km"}</span>
                </div>
              )}
              <div className="mr-lap-len">
                {cLen > 0
                  ? (cLen < 1000 ? Math.round(cLen) + " m per lap" : (cLen / 1000).toFixed(2) + " km per lap") + " · " + (L.unitMetres(units) / cLen).toFixed(1) + " laps / " + (units === "mi" ? "mi" : "km")
                  : "—"}
              </div>

              <div className="mr-sheet-h" style={{ marginTop: 20 }}>Goal distance</div>
              <div className="mr-chips">
                {goalChoices.map((m, i) => (
                  <button key={i} className={"mr-chip" + (goalM === m ? " on" : "")} onClick={() => setGoalM(m)}>
                    {m == null ? "No goal" : (m / L.unitMetres(units)) + " " + (units === "mi" ? "mi" : "km")}
                  </button>
                ))}
              </div>
              <div className="mr-sub mr-center">
                {goalM != null && cLen > 0 ? (goalM / cLen).toFixed(1) + " laps to reach " + L.fmtDistance(goalM, units) : "Free run — no goal set"}
              </div>

              <div className="mr-switch-row" onClick={() => setAutoCount((v) => !v)}>
                <span className="mr-switch-txt">
                  <strong>Auto-count laps</strong>
                  <span className="mr-sub">Learns your rhythm from lap 1, then advances automatically. The LAP button is always there to correct it.</span>
                </span>
                <button className={"mr-switch" + (autoCount ? " on" : "")} aria-pressed={autoCount} aria-label="Auto-count laps" />
              </div>

              <button className="mr-btn mr-btn-primary mr-wide" onClick={startCruise} disabled={cLen <= 0}>Start ship run</button>
            </div>
          )}
        </div>
      )}

      {/* ---- CHOOSING (outdoor) ---- */}
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

      {/* ---- TRACKING (outdoor) ---- */}
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

      {/* ---- CRUISE (ship lap tracking) ---- */}
      {phase === "cruise" && (
        <div className="mr-cruise">
          <div className="mr-cruise-inner">
            <div className={"mr-auto-pill" + (autoCount ? " on" : "")}>
              <span className="mr-auto-dot" />
              {autoCount ? "Auto-count on — learns from lap 1" : "Auto-count off — tap LAP each lap"}
            </div>

            <div className="mr-ring">
              <svg width="230" height="230" viewBox="0 0 230 230">
                <circle cx="115" cy="115" r={RING_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
                <circle cx="115" cy="115" r={RING_R} fill="none" stroke="#22c55e" strokeWidth="14" strokeLinecap="round"
                  transform="rotate(-90 115 115)" className="mr-ring-c"
                  strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - cProgress)} />
              </svg>
              <div className="mr-ring-center">
                <div className="mr-ring-count">{laps.length}</div>
                <div className="mr-ring-l">laps</div>
                <div className="mr-ring-of">{hasGoal && cLen > 0 ? "of " + lapsNeeded.toFixed(1) : "no goal"}</div>
              </div>
            </div>

            <div className="mr-cur">
              <div className="mr-cur-v">{L.fmtDuration(cCurMs / 1000)}</div>
              <div className="mr-cur-l">current lap</div>
            </div>

            {paused && <div className="mr-paused" style={{ marginBottom: 12 }}>Paused</div>}

            <div className="mr-lapgrid">
              <div className="mr-cell"><div className="mr-cell-v">{L.fmtDistance(cDistanceM, units)}</div><div className="mr-cell-l">distance</div></div>
              <div className="mr-cell"><div className="mr-cell-v">{L.fmtDuration(cTotalMs / 1000)}</div><div className="mr-cell-l">total time</div></div>
              <div className="mr-cell"><div className="mr-cell-v">{cAvgLapMs > 0 ? L.fmtPace(L.paceSecPerUnit(cLen, cAvgLapMs / 1000, units), units).split(" ")[0] : "—"}</div><div className="mr-cell-l">avg / lap</div></div>
            </div>
            <div className="mr-lapgrid mr-lapgrid-2">
              <div className="mr-cell"><div className="mr-cell-v">{laps.length ? L.fmtDuration(laps[laps.length - 1].ms / 1000) : "—"}</div><div className="mr-cell-l">last lap</div></div>
              <div className="mr-cell">
                <div className="mr-cell-v" style={{ color: hasGoal && cAvgLapMs > 0 ? "#22c55e" : "#8fa89c" }}>
                  {hasGoal && cAvgLapMs > 0 ? L.fmtDuration((cAvgLapMs * lapsNeeded) / 1000) : "—"}
                </div>
                <div className="mr-cell-l">{hasGoal ? "proj. finish" : "no goal"}</div>
              </div>
            </div>

            {laps.length > 0 && (
              <div className="mr-laplist">
                <div className="mr-laplist-h"><span>lap</span><span>time</span><span>pace</span><span>vs prev</span></div>
                {laps.slice().reverse().map((l, ri) => {
                  const i = laps.length - 1 - ri;
                  const prev = i > 0 ? laps[i - 1] : null;
                  let delta = "—", dc = "#8fa89c";
                  if (prev) {
                    const d = Math.round((l.ms - prev.ms) / 1000);
                    if (d < 0) { delta = d + "s"; dc = "#22c55e"; }
                    else if (d > 0) { delta = "+" + d + "s"; dc = "#f59e0b"; }
                    else delta = "0s";
                  }
                  return (
                    <div className="mr-laprow" key={i}>
                      <span className="mr-mono" style={{ color: "#8fa89c" }}>{(l.auto ? "◉ " : "") + (i + 1)}</span>
                      <span className="mr-mono">{L.fmtDuration(l.ms / 1000)}</span>
                      <span className="mr-mono" style={{ color: "#8fa89c" }}>{L.fmtPace(L.paceSecPerUnit(cLen, l.ms / 1000, units), units)}</span>
                      <span className="mr-mono" style={{ textAlign: "right", color: dc }}>{delta}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <button className="mr-lap-btn" onClick={tapLap}>＋ LAP</button>
            <div className="mr-row-2" style={{ width: "100%" }}>
              <button className="mr-btn mr-btn-ghost" onClick={cTogglePause}>{paused ? "Resume" : "Pause"}</button>
              <button className="mr-btn mr-btn-stop" onClick={finishCruise}>Finish</button>
            </div>
          </div>
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

      {/* ---- SHIP PICKER ---- */}
      {showShipPicker && (
        <div className="mr-modal-wrap" onClick={() => setShowShipPicker(false)}>
          <div className="mr-picker" onClick={(e) => e.stopPropagation()}>
            <div className="mr-picker-h">
              <div className="mr-sheet-h" style={{ margin: 0 }}>Choose your ship</div>
              <button className="mr-picker-detect" onClick={runDetect}>⌖ Detect</button>
            </div>
            <input className="mr-input" style={{ marginBottom: 10 }} type="text" value={shipSearch}
              placeholder="Search ship or cruise line…" autoComplete="off" spellCheck="false"
              onChange={(e) => setShipSearch(e.target.value)} />
            <div className="mr-picker-list">
              {shipRows.map((s, i) => (
                <button key={i} className="mr-picker-row" onClick={() => selectShip(s)}>
                  <span className="mr-picker-name">
                    <strong>{s.n}</strong>
                    <span className="mr-sub">{s.l}</span>
                  </span>
                  <span className="mr-picker-info">{(L.unitMetres("mi") / s.m).toFixed(1)}/mi</span>
                </button>
              ))}
              {!shipRows.length && <div className="mr-sub mr-center" style={{ padding: "24px 12px", lineHeight: 1.5 }}>No match. Close this and enter the lap length manually instead.</div>}
            </div>
            <button className="mr-btn mr-btn-ghost" style={{ margin: "10px 0 16px" }} onClick={() => setShowShipPicker(false)}>Close</button>
          </div>
        </div>
      )}

      {/* ---- DETECT SHIP ---- */}
      {showDetect && (
        <DetectModal step={detectStep} result={detectResult} err={detectErr} acc={detectAcc}
          onConfirm={confirmDetect} onManual={detectToPicker} onClose={closeDetect} />
      )}

      {/* ---- SETTINGS ---- */}
      {showSettings && (
        <Settings orsKey={orsKey} aisKey={aisKey} aisEndpoint={aisEndpoint} units={units}
          onClose={() => setShowSettings(false)} onSave={saveSettings} />
      )}

      {/* ---- lap flash ---- */}
      {flashMsg && (
        <div className="mr-flash-live"><div className="mr-flash">{flashMsg}</div></div>
      )}
    </div>
  );
}

function SummarySheet({ run, units, onSave, onExport, onDone }) {
  const u = run.units || units;
  if (run.ship) {
    const laps = run.laps || [];
    const avg = laps.length ? laps.reduce((a, l) => a + l.ms, 0) / laps.length : 0;
    const avgPace = avg > 0 ? L.fmtPace(L.paceSecPerUnit(run.lapLenM, avg / 1000, u), u) : "—";
    const lpm = run.lapLenM < 1000 ? Math.round(run.lapLenM) + " m" : (run.lapLenM / 1000).toFixed(2) + " km";
    let cum = 0;
    return (
      <div className="mr-sheet mr-sheet-tall">
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 2px 14px" }}>
          <span className="mr-badge-ship">⚓ SHIP</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{run.name}</span>
        </div>
        <div className="mr-stats-row">
          <Stat label="distance" value={L.fmtDistance(run.distance, u)} />
          <Stat label="time" value={L.fmtDuration(run.duration)} />
          <Stat label="avg / lap" value={avgPace} />
        </div>
        <div className="mr-sub mr-center">
          {laps.length} laps · {lpm} each{run.goalM != null ? " · goal " + L.fmtDistance(run.goalM, u) : ""}
        </div>
        {laps.length > 0 && (
          <div className="mr-splits">
            <div className="mr-splits-h" style={{ gridTemplateColumns: "44px 1fr 1fr 1fr" }}><span>lap</span><span>time</span><span>pace</span><span>cumulative</span></div>
            {laps.map((l, i) => {
              cum += l.ms;
              return (
                <div className="mr-split" style={{ gridTemplateColumns: "44px 1fr 1fr 1fr" }} key={i}>
                  <span>{i + 1}</span>
                  <span className="mr-mono">{L.fmtDuration(l.ms / 1000)}</span>
                  <span className="mr-mono">{L.fmtPace(L.paceSecPerUnit(run.lapLenM, l.ms / 1000, u), u)}</span>
                  <span className="mr-mono">{L.fmtDuration(cum / 1000)}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mr-row-2">
          <button className="mr-btn mr-btn-ghost" onClick={onSave}>Save</button>
          <button className="mr-btn mr-btn-primary" onClick={onDone}>Done</button>
        </div>
        <div className="mr-note">GPX export is skipped for ship runs — the on-ship GPS track isn't meaningful. Lap times are saved to your history.</div>
      </div>
    );
  }

  const splits = L.computeSplits(run.points || [], u);
  const paceStr = L.fmtPace(L.paceSecPerUnit(run.distance, run.duration, u), u);
  return (
    <div className="mr-sheet mr-sheet-tall">
      <div className="mr-sheet-h">{run.name}</div>
      <div className="mr-stats-row">
        <Stat label="distance" value={L.fmtDistance(run.distance, u)} />
        <Stat label="time" value={L.fmtDuration(run.duration)} />
        <Stat label="pace" value={paceStr} />
      </div>
      {run.plannedM != null && (
        <div className="mr-sub mr-center">Planned loop ≈ {L.fmtDistance(run.plannedM, u)}</div>
      )}
      {splits.length > 0 && (
        <div className="mr-splits">
          <div className="mr-splits-h"><span>#</span><span>pace</span><span>time</span></div>
          {splits.map((s) => (
            <div className="mr-split" key={s.index}>
              <span>{s.partial ? s.index + "·" : s.index}</span>
              <span className="mr-mono">{L.fmtPace(s.pace, u)}</span>
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
              <strong style={{ display: "flex", alignItems: "center", gap: 7 }}>
                {r.ship && <span className="mr-badge-ship">⚓ SHIP</span>}
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
              </strong>
              <span className="mr-sub">
                {L.fmtDistance(r.distance, r.units || units)} · {L.fmtDuration(r.duration)}
                {r.ship
                  ? " · " + (r.lapsCount != null ? r.lapsCount : (r.laps || []).length) + " laps"
                  : " · " + L.fmtPace(L.paceSecPerUnit(r.distance, r.duration, r.units || units), r.units || units)}
              </span>
            </button>
            <div className="mr-hist-acts">
              {!r.ship && (
                <button className="mr-mini" aria-label={"Export " + r.name + " as GPX"} onClick={() => onExport(r)}>GPX</button>
              )}
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

function DetectModal({ step, result, err, acc, onConfirm, onManual, onClose }) {
  const done = step >= 3;
  const gotShip = done && result && result.ship;
  const sig1 = step >= 1 ? "done" : "spin";
  const sig2 = (done && !err && result) ? "done" : (step >= 1 && !err ? "spin" : (step >= 1 ? "idle" : "idle"));

  function errText() {
    if (err === "perm") return "Location permission was denied — enable it for this site to auto-detect, or choose your ship manually.";
    if (err === "nofix" || err === "no-geo") return "Couldn't get a GPS fix. Try again by a window or on deck, or choose your ship manually.";
    if (err === "no-ais-config") return "Auto-match needs an AIS provider key (add one in Settings)." + (acc != null ? " We have your position (±" + Math.round(acc) + " m) — choose your ship to match its track." : " Choose your ship manually for now.");
    if (err === "no-vessel") return "No large passenger vessel found near your position. Choose your ship manually.";
    return "Couldn't confirm a vessel automatically. Choose your ship manually.";
  }

  return (
    <div className="mr-detect-wrap" onClick={onClose}>
      <div className="mr-detect" onClick={(e) => e.stopPropagation()}>
        <div className="mr-sheet-h">Detecting your ship</div>
        <div className="mr-sig">
          <span className={"mr-sig-icon " + sig1}>{sig1 === "done" ? "✓" : ""}</span>
          <span className="mr-sig-txt">GPS position<span className="mr-sub">{step >= 1 ? (acc != null ? " · fix ±" + Math.round(acc) + " m" : " · located") : " · locating…"}</span></span>
        </div>
        <div className="mr-sig">
          <span className={"mr-sig-icon " + sig2}>{sig2 === "done" ? "✓" : ""}</span>
          <span className="mr-sig-txt">Vessel match (AIS)<span className="mr-sub">{done ? (err ? " · unavailable" : (result ? " · " + (result.vesselName || "matched") : "")) : (step >= 1 ? " · querying…" : " · waiting")}</span></span>
        </div>
        <div className="mr-sig">
          <span className="mr-sig-icon warn">!</span>
          <span className="mr-sig-txt">Wi-Fi network name<span className="mr-sub"> · needs the installed app</span></span>
        </div>

        {gotShip && (
          <div className="mr-detect-result">
            <div className="mr-sub">Best match · {result.confidence}% confidence</div>
            <div className="mr-ship-name">{result.ship.n}</div>
            <div className="mr-sub">{result.ship.l} · ≈{Math.round(result.ship.m)} m lap (estimate)</div>
          </div>
        )}
        {done && !gotShip && (
          <div className="mr-detect-err">{errText()}</div>
        )}

        {done ? (
          <div className="mr-row-2" style={{ marginTop: 14 }}>
            <button className="mr-btn mr-btn-ghost" onClick={onManual}>{gotShip ? "Not my ship" : "Choose manually"}</button>
            {gotShip
              ? <button className="mr-btn mr-btn-primary" onClick={onConfirm}>That's my ship</button>
              : <button className="mr-btn mr-btn-ghost" onClick={onClose}>Close</button>}
          </div>
        ) : (
          <div className="mr-note mr-center" style={{ marginTop: 14 }}>Fusing your GPS fix with live vessel positions…</div>
        )}
        <div className="mr-note">Detection fuses your GPS fix with live AIS vessel positions. A browser can't read Wi-Fi network names — that extra signal needs the installed app.</div>
      </div>
    </div>
  );
}

function Settings({ orsKey, aisKey, aisEndpoint, units, onClose, onSave }) {
  const [k, setK] = useState(orsKey);
  const [ak, setAk] = useState(aisKey);
  const [ep, setEp] = useState(aisEndpoint);
  const [u, setU] = useState(units);
  return (
    <div className="mr-modal-wrap" onClick={onClose}>
      <div className="mr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mr-sheet-h">Settings</div>
        <label className="mr-field-l">OpenRouteService API key</label>
        <input className="mr-input" type="text" value={k} placeholder="paste your free key"
          onChange={(e) => setK(e.target.value)} autoComplete="off" spellCheck="false" />
        <div className="mr-note">
          For outdoor loop suggestions. Free key from <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noopener">openrouteservice.org</a>. Stored only on this device.
        </div>

        <label className="mr-field-l">AIS provider key <span className="mr-sub">(optional)</span></label>
        <input className="mr-input" type="text" value={ak} placeholder="for ship auto-detect"
          onChange={(e) => setAk(e.target.value)} autoComplete="off" spellCheck="false" />
        <label className="mr-field-l">AIS endpoint template <span className="mr-sub">(optional)</span></label>
        <input className="mr-input" type="text" value={ep} placeholder="https://your-proxy/vessels?lat={lat}&lon={lon}&r={radius}"
          onChange={(e) => setEp(e.target.value)} autoComplete="off" spellCheck="false" />
        <div className="mr-note">
          Ship auto-detect matches your GPS position to nearby vessels. Most AIS APIs must be called through your own small proxy (CORS + key secrecy) — point the endpoint at it; use {"{lat} {lon} {key} {radius}"} placeholders. Leave blank to pick your ship by name.
        </div>

        <label className="mr-field-l">Units</label>
        <div className="mr-chips">
          <button className={"mr-chip" + (u === "km" ? " on" : "")} onClick={() => setU("km")}>Kilometres</button>
          <button className={"mr-chip" + (u === "mi" ? " on" : "")} onClick={() => setU("mi")}>Miles</button>
        </div>
        <div className="mr-row-2">
          <button className="mr-btn mr-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="mr-btn mr-btn-primary" onClick={() => onSave({ orsKey: k, aisKey: ak, aisEndpoint: ep, units: u })}>Save</button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app-root")).render(<App />);
