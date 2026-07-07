/* geo.js — pure helpers for Morning Run: distance math, formatting,
   splits, GPX, OpenRouteService round-trip routing, reverse geocode,
   and IndexedDB run history. Attaches window.RunLib. No framework.

   Ship-track additions (see the SHIP TRACK block below):
   a curated cruise-ship track-length database, fuzzy name matching,
   and GPS+AIS vessel detection. */
(function () {
  "use strict";

  var EARTH_R = 6371000; // metres
  var MILE = 1609.344;   // metres
  var KM = 1000;

  function toRad(d) { return (d * Math.PI) / 180; }

  // Great-circle distance in metres between two {lat,lon} (or bare numbers).
  function haversine(lat1, lon1, lat2, lon2) {
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var s1 = Math.sin(dLat / 2);
    var s2 = Math.sin(dLon / 2);
    var a = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // Length of an array of [lon,lat(,ele)] coordinate pairs (ORS/GeoJSON order).
  function coordsLength(coords) {
    var total = 0;
    for (var i = 1; i < coords.length; i++) {
      total += haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
    }
    return total;
  }

  // Length of tracked points [{lat,lon,...}] in metres.
  function trackLength(points) {
    var total = 0;
    for (var i = 1; i < points.length; i++) {
      total += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    }
    return total;
  }

  // ---- formatting -------------------------------------------------------
  function unitMetres(units) { return units === "mi" ? MILE : KM; }

  function fmtDistance(metres, units) {
    var u = unitMetres(units);
    var v = metres / u;
    return v.toFixed(v >= 10 ? 1 : 2) + " " + (units === "mi" ? "mi" : "km");
  }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = (m < 10 && h > 0 ? "0" : "") + m;
    var ss = (s < 10 ? "0" : "") + s;
    return (h > 0 ? h + ":" : "") + mm + ":" + ss;
  }

  // Pace in seconds per unit -> "m:ss".
  function fmtPace(secPerUnit, units) {
    if (!isFinite(secPerUnit) || secPerUnit <= 0) return "—";
    var m = Math.floor(secPerUnit / 60);
    var s = Math.round(secPerUnit % 60);
    if (s === 60) { m += 1; s = 0; }
    return m + ":" + (s < 10 ? "0" : "") + s + " /" + (units === "mi" ? "mi" : "km");
  }

  function paceSecPerUnit(metres, sec, units) {
    if (metres <= 0) return Infinity;
    return sec / (metres / unitMetres(units));
  }

  // ---- splits -----------------------------------------------------------
  // Per-unit splits with linear time interpolation across the boundary.
  // points: [{lat,lon,t}] where t is epoch ms. Returns
  // [{index, distance(m), duration(s), pace(s/unit), partial}].
  // Prefer an active-elapsed timestamp (p.at, wall-clock minus paused time) so
  // a split that spans a pause isn't charged the paused minutes; fall back to
  // the raw fix time for runs recorded without pause accounting.
  function tOf(p) { return p.at != null ? p.at : p.t; }

  function computeSplits(points, units) {
    var unit = unitMetres(units);
    var out = [];
    if (!points || points.length < 2) return out;
    var cum = 0;
    var mark = unit;
    var splitStart = tOf(points[0]);
    var prev = points[0];
    for (var i = 1; i < points.length; i++) {
      var p = points[i];
      var d = haversine(prev.lat, prev.lon, p.lat, p.lon);
      if (d > 0) {
        var segStart = cum;
        while (mark <= segStart + d) {
          var frac = (mark - segStart) / d;
          var tAtMark = tOf(prev) + (tOf(p) - tOf(prev)) * frac;
          var dur = (tAtMark - splitStart) / 1000;
          out.push({ index: out.length + 1, distance: unit, duration: dur,
                     pace: paceSecPerUnit(unit, dur, units), partial: false });
          splitStart = tAtMark;
          mark += unit;
        }
        cum += d;
      }
      prev = p;
    }
    var partialDist = cum - (mark - unit);
    if (partialDist > unit * 0.05) {
      var pdur = (tOf(points[points.length - 1]) - splitStart) / 1000;
      out.push({ index: out.length + 1, distance: partialDist, duration: pdur,
                 pace: paceSecPerUnit(partialDist, pdur, units), partial: true });
    }
    return out;
  }

  // ---- GPX 1.1 ----------------------------------------------------------
  function esc(s) {
    return String(s).replace(/[<>&'"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c];
    });
  }
  function iso(ms) { return new Date(ms).toISOString().replace(/\.\d+Z$/, "Z"); }

  // run: {name, startedAt(ms), points:[{lat,lon,t,ele}]}
  function buildGPX(run) {
    var name = esc(run.name || "Morning Run");
    var lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<gpx version="1.1" creator="Morning Run — 0x4d44.github.io" ' +
      'xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 ' +
      'http://www.topografix.com/GPX/1/1/gpx.xsd">');
    lines.push("  <metadata><name>" + name + "</name>" +
      (run.startedAt ? "<time>" + iso(run.startedAt) + "</time>" : "") + "</metadata>");
    lines.push("  <trk><name>" + name + "</name><type>running</type><trkseg>");
    (run.points || []).forEach(function (p) {
      var pt = '    <trkpt lat="' + p.lat.toFixed(6) + '" lon="' + p.lon.toFixed(6) + '">';
      if (p.ele != null && isFinite(p.ele)) pt += "<ele>" + p.ele.toFixed(1) + "</ele>";
      if (p.t != null) pt += "<time>" + iso(p.t) + "</time>";
      pt += "</trkpt>";
      lines.push(pt);
    });
    lines.push("  </trkseg></trk>");
    lines.push("</gpx>");
    return lines.join("\n");
  }

  function downloadGPX(run) {
    var blob = new Blob([buildGPX(run)], { type: "application/gpx+xml" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var safe = (run.name || "morning-run").replace(/[^\w.-]+/g, "-").toLowerCase();
    a.href = url;
    a.download = safe + ".gpx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // ---- OpenRouteService round-trip routing ------------------------------
  // opts: {key, lat, lon, lengthM, seeds[], profile, avoidFeatures[]}
  // Returns [{coords:[[lon,lat,ele]], distance, ascent, descent, seed}].
  function fetchRoundTrips(opts) {
    var key = opts.key;
    var profile = opts.profile || "foot-walking";
    var seeds = opts.seeds || [1, 42, 99];
    var avoid = opts.avoidFeatures || ["ferries", "fords"];
    var url = "https://api.openrouteservice.org/v2/directions/" + profile + "/geojson";

    function one(seed) {
      var body = {
        coordinates: [[opts.lon, opts.lat]],
        elevation: true,
        instructions: false,
        options: {
          round_trip: { length: Math.round(opts.lengthM), points: 5, seed: seed }
        }
      };
      if (avoid && avoid.length) body.options.avoid_features = avoid;
      return fetch(url, {
        method: "POST",
        headers: {
          "Authorization": key,
          "Content-Type": "application/json",
          "Accept": "application/geo+json, application/json"
        },
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.text().then(function (txt) {
          if (!res.ok) {
            var msg = txt;
            try { msg = (JSON.parse(txt).error || {}).message || txt; } catch (e) {}
            var err = new Error("ORS " + res.status + ": " + String(msg).slice(0, 200));
            err.status = res.status;
            throw err;
          }
          var gj = JSON.parse(txt);
          var f = gj.features && gj.features[0];
          if (!f) return null;
          var props = f.properties || {};
          var sum = props.summary || {};
          return {
            coords: f.geometry.coordinates,
            distance: sum.distance,
            duration: sum.duration,
            // ORS reports ascent/descent under summary (elevation:true); some
            // builds also mirror them at the properties root — accept either.
            ascent: sum.ascent != null ? sum.ascent : props.ascent,
            descent: sum.descent != null ? sum.descent : props.descent,
            seed: seed
          };
        });
      });
    }

    // Sequential to stay well under the free-tier rate limit. Only a genuinely
    // fatal status (bad key / malformed request) aborts the batch; a per-seed
    // 404 (this seed couldn't close a loop) or 429 (rate limited) just skips,
    // so routes already fetched from earlier seeds survive.
    var results = [];
    var fatalErr = null;
    var chain = Promise.resolve();
    seeds.forEach(function (seed) {
      chain = chain.then(function () {
        if (fatalErr) return; // stop trying once we've seen a fatal error
        return one(seed).then(function (r) { if (r) results.push(r); },
          function (err) {
            var s = err.status;
            if (s === 400 || s === 401 || s === 403) fatalErr = err; // bad key / params / quota-denied
            // 404 (no loop for this seed), 429 (rate limit), 5xx, network: skip this seed
          });
      });
    });
    return chain.then(function () {
      if (results.length) return results;
      if (fatalErr) throw fatalErr;
      throw new Error("No routes returned — try a different distance or move the start pin.");
    });
  }

  // Best-effort city/area label for the start point (Nominatim, may fail).
  function reverseGeocode(lat, lon) {
    var u = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1" +
      "&lat=" + lat + "&lon=" + lon;
    return fetch(u, { headers: { "Accept": "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return null;
        var a = j.address || {};
        return a.city || a.town || a.village || a.suburb || a.municipality || a.county || null;
      })
      .catch(function () { return null; });
  }

  // ======================================================================
  // SHIP TRACK — cruise-ship jogging-track database + vessel detection
  // ======================================================================
  //
  // Lap lengths (metres, one full lap of the promenade / jogging track) are
  // COMMUNITY ESTIMATES read from published deck plans. They vary by deck and
  // are not official. Always confirm against the posted "X laps = 1 mile" sign
  // and let the runner fine-tune. Contributions welcome.
  var SHIPS = [
    { n: "Icon of the Seas", l: "Royal Caribbean", m: 380 },
    { n: "Star of the Seas", l: "Royal Caribbean", m: 380 },
    { n: "Wonder of the Seas", l: "Royal Caribbean", m: 400 },
    { n: "Symphony of the Seas", l: "Royal Caribbean", m: 400 },
    { n: "Harmony of the Seas", l: "Royal Caribbean", m: 400 },
    { n: "Oasis of the Seas", l: "Royal Caribbean", m: 400 },
    { n: "Allure of the Seas", l: "Royal Caribbean", m: 400 },
    { n: "Utopia of the Seas", l: "Royal Caribbean", m: 400 },
    { n: "Quantum of the Seas", l: "Royal Caribbean", m: 335 },
    { n: "Anthem of the Seas", l: "Royal Caribbean", m: 335 },
    { n: "Ovation of the Seas", l: "Royal Caribbean", m: 335 },
    { n: "Odyssey of the Seas", l: "Royal Caribbean", m: 335 },
    { n: "Spectrum of the Seas", l: "Royal Caribbean", m: 335 },
    { n: "Navigator of the Seas", l: "Royal Caribbean", m: 402 },
    { n: "Mariner of the Seas", l: "Royal Caribbean", m: 402 },
    { n: "Adventure of the Seas", l: "Royal Caribbean", m: 402 },
    { n: "Explorer of the Seas", l: "Royal Caribbean", m: 402 },
    { n: "Voyager of the Seas", l: "Royal Caribbean", m: 402 },
    { n: "Freedom of the Seas", l: "Royal Caribbean", m: 360 },
    { n: "Liberty of the Seas", l: "Royal Caribbean", m: 360 },
    { n: "Independence of the Seas", l: "Royal Caribbean", m: 360 },
    { n: "Carnival Celebration", l: "Carnival", m: 400 },
    { n: "Carnival Jubilee", l: "Carnival", m: 400 },
    { n: "Carnival Mardi Gras", l: "Carnival", m: 400 },
    { n: "Carnival Vista", l: "Carnival", m: 300 },
    { n: "Carnival Horizon", l: "Carnival", m: 300 },
    { n: "Carnival Panorama", l: "Carnival", m: 300 },
    { n: "Carnival Breeze", l: "Carnival", m: 290 },
    { n: "Carnival Dream", l: "Carnival", m: 290 },
    { n: "Carnival Magic", l: "Carnival", m: 290 },
    { n: "Norwegian Prima", l: "Norwegian", m: 400 },
    { n: "Norwegian Viva", l: "Norwegian", m: 400 },
    { n: "Norwegian Aqua", l: "Norwegian", m: 400 },
    { n: "Norwegian Encore", l: "Norwegian", m: 450 },
    { n: "Norwegian Bliss", l: "Norwegian", m: 450 },
    { n: "Norwegian Joy", l: "Norwegian", m: 450 },
    { n: "Norwegian Escape", l: "Norwegian", m: 450 },
    { n: "Norwegian Epic", l: "Norwegian", m: 430 },
    { n: "MSC World Europa", l: "MSC Cruises", m: 420 },
    { n: "MSC World America", l: "MSC Cruises", m: 420 },
    { n: "MSC Virtuosa", l: "MSC Cruises", m: 380 },
    { n: "MSC Grandiosa", l: "MSC Cruises", m: 380 },
    { n: "MSC Meraviglia", l: "MSC Cruises", m: 380 },
    { n: "MSC Bellissima", l: "MSC Cruises", m: 380 },
    { n: "MSC Seascape", l: "MSC Cruises", m: 360 },
    { n: "MSC Seashore", l: "MSC Cruises", m: 360 },
    { n: "MSC Seaside", l: "MSC Cruises", m: 360 },
    { n: "Sun Princess", l: "Princess Cruises", m: 360 },
    { n: "Sky Princess", l: "Princess Cruises", m: 340 },
    { n: "Enchanted Princess", l: "Princess Cruises", m: 340 },
    { n: "Discovery Princess", l: "Princess Cruises", m: 340 },
    { n: "Regal Princess", l: "Princess Cruises", m: 340 },
    { n: "Royal Princess", l: "Princess Cruises", m: 340 },
    { n: "Celebrity Beyond", l: "Celebrity Cruises", m: 300 },
    { n: "Celebrity Ascent", l: "Celebrity Cruises", m: 300 },
    { n: "Celebrity Apex", l: "Celebrity Cruises", m: 300 },
    { n: "Celebrity Edge", l: "Celebrity Cruises", m: 300 },
    { n: "Disney Wish", l: "Disney Cruise Line", m: 400 },
    { n: "Disney Treasure", l: "Disney Cruise Line", m: 400 },
    { n: "Disney Dream", l: "Disney Cruise Line", m: 400 },
    { n: "Disney Fantasy", l: "Disney Cruise Line", m: 400 },
    { n: "Disney Magic", l: "Disney Cruise Line", m: 350 },
    { n: "Disney Wonder", l: "Disney Cruise Line", m: 350 },
    { n: "Queen Mary 2", l: "Cunard", m: 620 },
    { n: "Queen Anne", l: "Cunard", m: 360 },
    { n: "Queen Elizabeth", l: "Cunard", m: 384 },
    { n: "Queen Victoria", l: "Cunard", m: 384 },
    { n: "Rotterdam", l: "Holland America", m: 293 },
    { n: "Koningsdam", l: "Holland America", m: 293 },
    { n: "Nieuw Statendam", l: "Holland America", m: 293 },
    { n: "Iona", l: "P&O Cruises", m: 400 },
    { n: "Arvia", l: "P&O Cruises", m: 400 },
    { n: "Britannia", l: "P&O Cruises", m: 360 },
    { n: "Scarlet Lady", l: "Virgin Voyages", m: 400 },
    { n: "Valiant Lady", l: "Virgin Voyages", m: 400 },
    { n: "Resilient Lady", l: "Virgin Voyages", m: 400 },
    { n: "Brilliant Lady", l: "Virgin Voyages", m: 400 },
    { n: "Costa Smeralda", l: "Costa Cruises", m: 400 },
    { n: "Costa Toscana", l: "Costa Cruises", m: 400 }
  ];

  function normName(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

  // Fuzzy-match a free-text / AIS vessel name to the database.
  // Returns {ship, score} (score 0..1) or null below a 0.5 threshold.
  function matchShipByName(name) {
    var q = normName(name);
    if (!q) return null;
    var qTokens = q.split(" ");
    var best = null, bestScore = 0;
    SHIPS.forEach(function (s) {
      var n = normName(s.n);
      var score;
      if (n === q) score = 1;
      else if (n.indexOf(q) >= 0 || q.indexOf(n) >= 0) score = 0.85;
      else {
        var nTokens = n.split(" "), hit = 0;
        nTokens.forEach(function (t) { if (t.length > 1 && qTokens.indexOf(t) >= 0) hit++; });
        score = hit / Math.max(nTokens.length, qTokens.length);
      }
      if (score > bestScore) { bestScore = score; best = s; }
    });
    return best && bestScore >= 0.5 ? { ship: best, score: bestScore } : null;
  }

  function shipLapMetres(ship) { return ship ? ship.m : 0; }
  function lapsPerUnit(ship, units) { return ship && ship.m ? unitMetres(units) / ship.m : 0; }
  function listShips() { return SHIPS.slice(); }
  function searchShips(term) {
    var q = normName(term);
    if (!q) return SHIPS.slice();
    return SHIPS.filter(function (s) { return normName(s.n).indexOf(q) >= 0 || normName(s.l).indexOf(q) >= 0; });
  }

  // Detect the vessel you're aboard from a GPS fix + an AIS provider.
  // opts: {lat, lon, aisKey, endpoint, radiusM}
  //   endpoint (optional): a URL template with {lat} {lon} {key} {radius}
  //     placeholders that returns JSON — either an array or {data:[...]} of
  //     vessels shaped [{name|SHIPNAME, lat|LAT, lon|LON, type|SHIPTYPE}].
  //   aisKey (optional): used with the default MarineTraffic export URL when no
  //     endpoint is given.
  // Resolves {vesselName, distanceM, ship, confidence(0..100)} or rejects.
  // NOTE: most AIS providers require server-side calls (CORS / key secrecy).
  // Point `endpoint` at a tiny proxy of your own for production use.
  function detectShip(opts) {
    opts = opts || {};
    if (opts.lat == null || opts.lon == null) return Promise.reject(new Error("no-position"));
    if (!opts.aisKey && !opts.endpoint) return Promise.reject(new Error("no-ais-config"));
    var r = opts.radiusM || 3000;
    var url;
    if (opts.endpoint) {
      url = opts.endpoint
        .replace("{lat}", opts.lat).replace("{lon}", opts.lon)
        .replace("{key}", encodeURIComponent(opts.aisKey || "")).replace("{radius}", r);
    } else {
      var d = 0.05; // ~5.5 km box
      url = "https://services.marinetraffic.com/api/exportvessels/v:8/" +
        encodeURIComponent(opts.aisKey) +
        "/MINLAT:" + (opts.lat - d) + "/MAXLAT:" + (opts.lat + d) +
        "/MINLON:" + (opts.lon - d) + "/MAXLON:" + (opts.lon + d) + "/protocol:jsono";
    }
    return fetch(url).then(function (res) {
      if (!res.ok) { var e = new Error("AIS " + res.status); e.status = res.status; throw e; }
      return res.json();
    }).then(function (j) {
      var rows = Array.isArray(j) ? j : (j.data || j.vessels || j.features || []);
      var best = null, bestD = Infinity;
      rows.forEach(function (v) {
        var p = v.properties || v;
        var lat = p.lat != null ? +p.lat : (p.LAT != null ? +p.LAT : null);
        var lon = p.lon != null ? +p.lon : (p.LON != null ? +p.LON : null);
        var name = p.name || p.SHIPNAME || p.shipname || "";
        var type = String(p.type || p.SHIPTYPE || p.shiptype || "");
        if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return;
        // AIS ship-type 60-69 = passenger. Keep unknown types too.
        if (type && !/^6\d?$/.test(type) && type.toLowerCase().indexOf("passenger") < 0) return;
        var dist = haversine(opts.lat, opts.lon, lat, lon);
        if (dist < bestD) { bestD = dist; best = { name: name, dist: dist }; }
      });
      if (!best) throw new Error("no-vessel");
      var m = matchShipByName(best.name);
      var prox = Math.max(0, 1 - best.dist / r);
      var conf = Math.round((0.5 * prox + 0.5 * (m ? m.score : 0.4)) * 100);
      return { vesselName: best.name, distanceM: best.dist, ship: m ? m.ship : null, confidence: conf };
    });
  }

  // ---- IndexedDB run history -------------------------------------------
  // Ship runs are stored in the same object store as GPS runs, distinguished
  // by run.ship === true (plus run.laps / run.lapLenM / run.shipName).
  var DB_NAME = "morning-run";
  var STORE = "runs";
  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function tx(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out;
        var r = fn(store);
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { db.close(); resolve(out); };
        t.onerror = function () { db.close(); reject(t.error); };
        t.onabort = function () { db.close(); reject(t.error); };
      });
    });
  }
  function saveRun(run) { return tx("readwrite", function (s) { return s.put(run); }); }
  function deleteRun(id) { return tx("readwrite", function (s) { return s.delete(id); }); }
  function getRun(id) { return tx("readonly", function (s) { return s.get(id); }); }
  function listRuns() {
    return tx("readonly", function (s) { return s.getAll(); }).then(function (rows) {
      rows = rows || [];
      rows.sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });
      return rows;
    });
  }

  window.RunLib = {
    haversine: haversine,
    coordsLength: coordsLength,
    trackLength: trackLength,
    unitMetres: unitMetres,
    fmtDistance: fmtDistance,
    fmtDuration: fmtDuration,
    fmtPace: fmtPace,
    paceSecPerUnit: paceSecPerUnit,
    computeSplits: computeSplits,
    buildGPX: buildGPX,
    downloadGPX: downloadGPX,
    fetchRoundTrips: fetchRoundTrips,
    reverseGeocode: reverseGeocode,
    // ship track
    SHIPS: SHIPS,
    listShips: listShips,
    searchShips: searchShips,
    matchShipByName: matchShipByName,
    shipLapMetres: shipLapMetres,
    lapsPerUnit: lapsPerUnit,
    detectShip: detectShip,
    // history
    saveRun: saveRun,
    deleteRun: deleteRun,
    getRun: getRun,
    listRuns: listRuns
  };
})();
