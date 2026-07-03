/* geo.js — pure helpers for Morning Run: distance math, formatting,
   splits, GPX, OpenRouteService round-trip routing, reverse geocode,
   and IndexedDB run history. Attaches window.RunLib. No framework. */
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

  // ---- IndexedDB run history -------------------------------------------
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
    saveRun: saveRun,
    deleteRun: deleteRun,
    getRun: getRun,
    listRuns: listRuns
  };
})();
