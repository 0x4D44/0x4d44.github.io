(function () {
  "use strict";

  const STORE_KEY = "0x4d44.broadband.v1";
  const LOCATE_URL = "https://locate.measurementlab.net/v2/nearest/ndt/ndt7?client_name=0x4d44-line-rate";
  const MAX_POINTS = 72;
  const $ = (id) => document.getElementById(id);
  const state = { running: false, abort: null, latest: null, sockets: new Set(), series: { download: [], upload: [], ping: [] } };

  const fmt = (n, d = 1) => Number.isFinite(n) ? n.toFixed(d) : "—";
  const html = (v) => String(v == null ? "" : v).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  const abortError = () => new DOMException("Test stopped", "AbortError");
  const checkAbort = (signal) => { if (signal && signal.aborted) throw abortError(); };

  function bytes(n) {
    if (!Number.isFinite(n) || n <= 0) return "0 MB";
    const units = ["B", "KB", "MB", "GB"];
    let value = n;
    let u = 0;
    while (value >= 1024 && u < units.length - 1) { value /= 1024; u += 1; }
    return `${value.toFixed(u < 2 ? 0 : 1)} ${units[u]}`;
  }
  function median(values) {
    const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!xs.length) return NaN;
    const m = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
  }
  function average(values) {
    const xs = values.filter(Number.isFinite);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  }
  function jitter(values) {
    const d = [];
    for (let i = 1; i < values.length; i += 1) d.push(Math.abs(values[i] - values[i - 1]));
    return average(d);
  }
  function mbps(byteCount, ms) { return byteCount * 8 / Math.max(1, ms) / 1000; }
  function speedPct(v) { return Number.isFinite(v) ? Math.max(0.02, Math.min(1, Math.log10(v + 1) / Math.log10(1200))) : 0; }
  function pingPct(v) { return Number.isFinite(v) ? Math.max(0.03, Math.min(1, 1 - Math.min(v, 250) / 250)) : 0; }
  function setDial(id, pct) { $(id).style.setProperty("--pct", String(Math.max(0, Math.min(1, pct || 0)))); }
  function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    const box = $("logBox");
    box.textContent = box.textContent.startsWith("// waiting") ? line : `${box.textContent}\n${line}`;
    box.scrollTop = box.scrollHeight;
  }
  function status(title, detail) {
    $("statusLine").textContent = title;
    $("statusDetail").textContent = detail || "";
  }
  function step(name, stateName, label) {
    const node = document.querySelector(`[data-step="${name}"]`);
    if (!node) return;
    node.dataset.state = stateName || "";
    const labelNode = node.querySelector(".state");
    if (labelNode) labelNode.textContent = label || stateName || "idle";
  }
  function resetSteps() {
    document.querySelectorAll(".step").forEach((node) => {
      node.dataset.state = "";
      const labelNode = node.querySelector(".state");
      if (labelNode) labelNode.textContent = "idle";
    });
  }
  function pushSeries(name, value) {
    const series = state.series[name];
    series.push(Number.isFinite(value) ? value : 0);
    while (series.length > MAX_POINTS) series.shift();
    drawSpark(`${name}Spark`, series, name === "ping" ? 120 : 1);
  }
  function drawSpark(id, values, floor) {
    const node = $(id);
    if (!node || !values.length) { if (node) node.setAttribute("points", ""); return; }
    const max = Math.max(...values, floor || 1);
    const min = Math.min(...values, 0);
    const span = Math.max(1, max - min);
    node.setAttribute("points", values.map((v, i) => {
      const x = values.length === 1 ? 0 : (i / (values.length - 1)) * 320;
      const y = 64 - ((v - min) / span) * 58;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" "));
  }

  function history() {
    try { const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); return Array.isArray(parsed) ? parsed : []; }
    catch (_) { return []; }
  }
  function saveHistory(items) {
    localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(0, 100)));
    renderHistory();
  }
  function addRecord(record) { const rows = history(); rows.unshift(record); saveHistory(rows); }
  function renderHistory() {
    const rows = history();
    $("historyCount").textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}`;
    if (!rows.length) {
      $("historyMount").innerHTML = `<div class="empty-history">// no measurements yet — run a test and the summary will be stored here</div>`;
      return;
    }
    $("historyMount").innerHTML = `<div style="overflow:auto"><table><thead><tr><th>time</th><th>down/up Mbps</th><th>ping ms</th><th>server</th><th>gps</th><th>run</th></tr></thead><tbody>${rows.slice(0, 25).map((r) => {
      const gps = r.location ? `${Number(r.location.latitude).toFixed(5)}, ${Number(r.location.longitude).toFixed(5)} ±${Math.round(r.location.accuracy || 0)}m` : "—";
      const server = [r.server && r.server.city, r.server && r.server.country].filter(Boolean).join(", ") || (r.server && r.server.machine) || "—";
      return `<tr><td>${html(new Date(r.startedAt).toLocaleString())}</td><td>${fmt(r.downloadMbps)} / ${fmt(r.uploadMbps)}</td><td>${fmt(r.pingMedianMs, 0)}</td><td>${html(server)}</td><td>${html(gps)}</td><td>${html(r.id.slice(-6))}</td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function setRunning(running) {
    state.running = running;
    $("startBtn").disabled = running;
    $("stopBtn").disabled = !running;
    $("gpsToggle").disabled = running;
    $("serverToggle").disabled = running;
    $("durationSelect").disabled = running;
  }
  function closeSockets() {
    state.sockets.forEach((ws) => { try { ws.close(1000, "done"); } catch (_) {} });
    state.sockets.clear();
  }
  function trackSocket(ws, signal) {
    state.sockets.add(ws);
    const close = () => { try { ws.close(1000, "aborted"); } catch (_) {} };
    if (signal) signal.addEventListener("abort", close, { once: true });
    ws.addEventListener("close", () => { state.sockets.delete(ws); if (signal) signal.removeEventListener("abort", close); });
    return ws;
  }

  async function getLocation(signal) {
    step("location", "active", "asking");
    $("locationPhase").textContent = "requesting";
    if (!$("gpsToggle").checked) { step("location", "done", "skipped"); $("locationPhase").textContent = "skipped"; return null; }
    if (!navigator.geolocation) { step("location", "fail", "missing"); $("locationMeta").textContent = "Geolocation API unavailable"; return null; }
    return new Promise((resolve) => {
      const done = (value) => resolve(value);
      const onAbort = () => done(null);
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      navigator.geolocation.getCurrentPosition((pos) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        const c = pos.coords;
        const fix = {
          latitude: c.latitude,
          longitude: c.longitude,
          accuracy: c.accuracy,
          altitude: Number.isFinite(c.altitude) ? c.altitude : null,
          altitudeAccuracy: Number.isFinite(c.altitudeAccuracy) ? c.altitudeAccuracy : null,
          heading: Number.isFinite(c.heading) ? c.heading : null,
          speed: Number.isFinite(c.speed) ? c.speed : null,
          capturedAt: new Date(pos.timestamp).toISOString(),
        };
        $("locationValue").textContent = fmt(c.accuracy, 0);
        $("locationMeta").textContent = `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`;
        $("locationPhase").textContent = "fixed";
        setDial("locationDial", 1 - Math.min(c.accuracy || 1000, 1000) / 1000);
        const x = 160 + Math.max(-130, Math.min(130, c.longitude / 180 * 130));
        const y = 35 - Math.max(-30, Math.min(30, c.latitude / 90 * 30));
        $("locationSpark").setAttribute("points", `160,35 ${x.toFixed(1)},${y.toFixed(1)}`);
        step("location", "done", "fixed");
        log(`GPS ${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)} ±${Math.round(c.accuracy)}m`);
        done(fix);
      }, (err) => {
        if (signal) signal.removeEventListener("abort", onAbort);
        $("locationPhase").textContent = "denied";
        $("locationMeta").textContent = err && err.message ? err.message : "No GPS fix";
        step("location", "fail", "no fix");
        log(`GPS skipped: ${err && err.message ? err.message : "permission denied"}`);
        done(null);
      }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 16000 });
    });
  }

  function ndtUrl(urls, direction) {
    const entries = Object.entries(urls || {});
    const match = entries.find(([key, value]) => `${key} ${Array.isArray(value) ? value.join(" ") : value}`.includes(`/ndt/v7/${direction}`) && `${value}`.includes("wss"));
    if (!match) return "";
    return Array.isArray(match[1]) ? match[1][0] : match[1];
  }
  async function locateServer(signal) {
    step("server", "active", "locating");
    status("Locating test server", "Asking Measurement Lab for a nearby NDT7 endpoint.");
    if (!$("serverToggle").checked) throw new Error("Public M-Lab testing is disabled.");
    const res = await fetch(`${LOCATE_URL}&cb=${Date.now()}`, { cache: "no-store", signal });
    if (!res.ok) throw new Error(`Locate API returned HTTP ${res.status}`);
    const data = await res.json();
    const item = (data.results || [])[0];
    if (!item) throw new Error("No NDT7 server was returned.");
    const downloadUrl = ndtUrl(item.urls, "download");
    const uploadUrl = ndtUrl(item.urls, "upload");
    if (!downloadUrl || !uploadUrl) throw new Error("The selected server did not advertise WebSocket test URLs.");
    const server = {
      machine: item.machine || item.hostname || new URL(downloadUrl).hostname,
      city: item.location && (item.location.city || item.location.metro),
      country: item.location && item.location.country,
      downloadUrl,
      uploadUrl,
    };
    $("serverName").textContent = server.machine;
    $("serverLocation").textContent = [server.city, server.country].filter(Boolean).join(", ") || "nearby";
    step("server", "done", "selected");
    log(`Server ${server.machine}`);
    return server;
  }

  function timeWebSocketOpen(url, signal) {
    return new Promise((resolve, reject) => {
      const started = performance.now();
      const ws = trackSocket(new WebSocket(url), signal);
      const timeout = setTimeout(() => finish(new Error("Ping timed out")), 6000);
      const onAbort = () => finish(abortError());
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      function finish(value) {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener("abort", onAbort);
        try { ws.close(1000, "ping"); } catch (_) {}
        value instanceof Error || (value && value.name === "AbortError") ? reject(value) : resolve(value);
      }
      ws.onopen = () => finish(performance.now() - started);
      ws.onerror = () => finish(new Error("Ping WebSocket failed"));
    });
  }
  async function measurePing(server, signal) {
    step("ping", "active", "sampling");
    $("pingPhase").textContent = "sampling";
    const samples = [];
    for (let i = 0; i < 7; i += 1) {
      checkAbort(signal);
      try {
        const ms = await timeWebSocketOpen(server.downloadUrl, signal);
        samples.push(ms);
        pushSeries("ping", ms);
        $("pingValue").textContent = fmt(median(samples), 0);
        $("pingMeta").textContent = `${samples.length} samples · min ${fmt(Math.min(...samples), 0)}ms`;
        setDial("pingDial", pingPct(median(samples)));
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        log(`Ping sample failed: ${err.message || err}`);
      }
      await new Promise((r) => setTimeout(r, 240));
    }
    if (!samples.length) throw new Error("Ping sampling failed.");
    const result = { samples, medianMs: median(samples), minMs: Math.min(...samples), jitterMs: jitter(samples) };
    $("pingValue").textContent = fmt(result.medianMs, 0);
    $("pingPhase").textContent = "complete";
    $("pingMeta").textContent = `min ${fmt(result.minMs, 0)}ms · jitter ${fmt(result.jitterMs, 0)}ms`;
    step("ping", "done", "done");
    log(`Ping median ${fmt(result.medianMs, 0)}ms`);
    return result;
  }

  function runDownload(url, signal) {
    step("download", "active", "running");
    $("downloadPhase").textContent = "running";
    status("Testing download", "Receiving a short NDT7 stream and calculating throughput.");
    return new Promise((resolve, reject) => {
      const ws = trackSocket(new WebSocket(url), signal);
      ws.binaryType = "arraybuffer";
      let opened = 0, received = 0, frames = 0, texts = 0, last = 0, closed = false;
      const hard = setTimeout(() => finish(null), 17000);
      const onAbort = () => finish(abortError());
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      function sample(force) {
        const now = performance.now();
        if (!force && now - last < 180) return;
        last = now;
        const rate = mbps(received, now - opened);
        pushSeries("download", rate);
        $("downloadValue").textContent = fmt(rate);
        $("downloadMeta").textContent = `${bytes(received)} received · ${frames} frames`;
        setDial("downloadDial", speedPct(rate));
      }
      function finish(value) {
        if (closed) return;
        closed = true;
        clearTimeout(hard);
        if (signal) signal.removeEventListener("abort", onAbort);
        try { ws.close(1000, "done"); } catch (_) {}
        if (value instanceof Error || (value && value.name === "AbortError")) { reject(value); return; }
        const ms = Math.max(1, performance.now() - opened);
        const rate = mbps(received, ms);
        sample(true);
        $("downloadValue").textContent = fmt(rate);
        $("downloadPhase").textContent = "complete";
        $("downloadMeta").textContent = `${bytes(received)} received · ${fmt(ms / 1000, 1)}s · ${texts} server frames`;
        step("download", "done", "done");
        log(`Download ${fmt(rate)} Mbps over ${fmt(ms / 1000, 1)}s`);
        resolve({ mbps: rate, bytes: received, durationSec: ms / 1000, frames, serverMessages: texts });
      }
      ws.onopen = () => { opened = performance.now(); last = opened; };
      ws.onmessage = (event) => {
        if (typeof event.data === "string") { texts += 1; return; }
        received += event.data && event.data.byteLength ? event.data.byteLength : 0;
        frames += 1;
        sample(false);
      };
      ws.onerror = () => finish(new Error("Download WebSocket failed"));
      ws.onclose = () => finish(null);
    });
  }

  function runUpload(url, seconds, signal) {
    step("upload", "active", "running");
    $("uploadPhase").textContent = "running";
    status("Testing upload", "Sending bounded chunks to the NDT7 upload endpoint.");
    return new Promise((resolve, reject) => {
      const ws = trackSocket(new WebSocket(url), signal);
      const chunk = new Uint8Array(64 * 1024);
      const targetMs = Math.max(3000, seconds * 1000);
      const maxBuffer = 8 * 1024 * 1024;
      let opened = 0, sent = 0, texts = 0, last = 0, draining = 0, closed = false;
      const hard = setTimeout(() => finish(null), targetMs + 9000);
      const onAbort = () => finish(abortError());
      crypto.getRandomValues(chunk.subarray(0, 1024));
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      function sample(force) {
        const now = performance.now();
        if (!force && now - last < 220) return;
        last = now;
        const rate = mbps(sent, now - opened);
        pushSeries("upload", rate);
        $("uploadValue").textContent = fmt(rate);
        $("uploadMeta").textContent = `${bytes(sent)} sent · buffer ${bytes(ws.bufferedAmount || 0)}`;
        setDial("uploadDial", speedPct(rate));
      }
      function pump() {
        if (closed || ws.readyState !== WebSocket.OPEN) return;
        const elapsed = performance.now() - opened;
        if (elapsed >= targetMs) {
          $("uploadPhase").textContent = "draining";
          if (!draining) draining = performance.now();
          if ((ws.bufferedAmount || 0) <= chunk.byteLength || performance.now() - draining > 3500) { try { ws.close(1000, "client-complete"); } catch (_) {} return; }
          sample(false);
          setTimeout(pump, 40);
          return;
        }
        while (ws.readyState === WebSocket.OPEN && (ws.bufferedAmount || 0) < maxBuffer && performance.now() - opened < targetMs) {
          ws.send(chunk);
          sent += chunk.byteLength;
        }
        sample(false);
        requestAnimationFrame(pump);
      }
      function finish(value) {
        if (closed) return;
        closed = true;
        clearTimeout(hard);
        if (signal) signal.removeEventListener("abort", onAbort);
        try { ws.close(1000, "done"); } catch (_) {}
        if (value instanceof Error || (value && value.name === "AbortError")) { reject(value); return; }
        const ms = Math.max(1, performance.now() - opened);
        const rate = mbps(sent, ms);
        sample(true);
        $("uploadValue").textContent = fmt(rate);
        $("uploadPhase").textContent = "complete";
        $("uploadMeta").textContent = `${bytes(sent)} sent · ${fmt(ms / 1000, 1)}s · ${texts} server frames`;
        step("upload", "done", "done");
        log(`Upload ${fmt(rate)} Mbps over ${fmt(ms / 1000, 1)}s`);
        resolve({ mbps: rate, bytes: sent, durationSec: ms / 1000, serverMessages: texts });
      }
      ws.onopen = () => { opened = performance.now(); last = opened; pump(); };
      ws.onmessage = (event) => { if (typeof event.data === "string") texts += 1; };
      ws.onerror = () => finish(new Error("Upload WebSocket failed"));
      ws.onclose = () => finish(null);
    });
  }

  async function runFullTest() {
    if (state.running) return;
    state.abort = new AbortController();
    const signal = state.abort.signal;
    setRunning(true);
    closeSockets();
    resetSteps();
    state.series.download = [];
    state.series.upload = [];
    state.series.ping = [];
    ["downloadSpark", "uploadSpark", "pingSpark"].forEach((id) => $(id).setAttribute("points", ""));
    ["downloadDial", "uploadDial", "pingDial"].forEach((id) => setDial(id, 0));
    $("runId").textContent = "running";
    $("logBox").textContent = "";
    $("downloadValue").textContent = $("uploadValue").textContent = $("pingValue").textContent = "—";
    const parts = { startedAt: new Date().toISOString() };
    try {
      status("Running", "Collecting location, latency, download and upload data.");
      parts.location = await getLocation(signal); checkAbort(signal);
      parts.server = await locateServer(signal); checkAbort(signal);
      parts.ping = await measurePing(parts.server, signal); checkAbort(signal);
      parts.download = await runDownload(parts.server.downloadUrl, signal); checkAbort(signal);
      parts.upload = await runUpload(parts.server.uploadUrl, Number($("durationSelect").value) || 10, signal); checkAbort(signal);
      step("save", "active", "saving");
      const record = {
        id: `lr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        startedAt: parts.startedAt,
        finishedAt: new Date().toISOString(),
        downloadMbps: parts.download.mbps,
        uploadMbps: parts.upload.mbps,
        pingMedianMs: parts.ping.medianMs,
        pingMinMs: parts.ping.minMs,
        pingJitterMs: parts.ping.jitterMs,
        pingSamplesMs: parts.ping.samples,
        downloadBytes: parts.download.bytes,
        uploadBytes: parts.upload.bytes,
        downloadDurationSec: parts.download.durationSec,
        uploadDurationSec: parts.upload.durationSec,
        location: parts.location,
        server: { machine: parts.server.machine, city: parts.server.city || null, country: parts.server.country || null },
        userAgent: navigator.userAgent,
      };
      state.latest = record;
      addRecord(record);
      step("save", "done", "saved");
      $("runId").textContent = record.id.slice(-6);
      status("Complete", `${fmt(record.downloadMbps)} down / ${fmt(record.uploadMbps)} up · ${fmt(record.pingMedianMs, 0)} ms ping`);
      log("Result saved locally");
    } catch (err) {
      const stopped = err && err.name === "AbortError";
      status(stopped ? "Stopped" : "Test failed", stopped ? "The current run was cancelled." : (err.message || String(err)));
      log(stopped ? "Run stopped by operator" : `Error: ${err.message || err}`);
      ["location", "server", "ping", "download", "upload", "save"].forEach((name) => {
        const node = document.querySelector(`[data-step="${name}"]`);
        if (node && node.dataset.state === "active") step(name, "fail", stopped ? "stopped" : "fail");
      });
    } finally {
      closeSockets();
      state.abort = null;
      setRunning(false);
    }
  }

  function copyLatest() {
    const record = state.latest || history()[0];
    if (!record) { log("Nothing to copy yet"); return; }
    const text = JSON.stringify(record, null, 2);
    const fallback = () => {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      log("Latest result copied with fallback clipboard path");
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => log("Latest result copied to clipboard"), fallback);
    else fallback();
  }
  function download(filename, type, content) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csvCell(value) {
    const s = value == null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function exportJson() { download(`line-rate-${new Date().toISOString().slice(0, 10)}.json`, "application/json", JSON.stringify(history(), null, 2)); }
  function exportCsv() {
    const head = ["id", "startedAt", "downloadMbps", "uploadMbps", "pingMedianMs", "pingMinMs", "pingJitterMs", "latitude", "longitude", "accuracy", "serverMachine", "serverCity", "serverCountry"];
    const rows = history().map((r) => [
      r.id, r.startedAt, r.downloadMbps, r.uploadMbps, r.pingMedianMs, r.pingMinMs, r.pingJitterMs,
      r.location && r.location.latitude, r.location && r.location.longitude, r.location && r.location.accuracy,
      r.server && r.server.machine, r.server && r.server.city, r.server && r.server.country,
    ].map(csvCell).join(","));
    download(`line-rate-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", [head.join(","), ...rows].join("\n"));
  }
  function clearHistory() {
    if (!confirm("Clear all stored speed-check results from this browser?")) return;
    localStorage.removeItem(STORE_KEY);
    state.latest = null;
    renderHistory();
    log("History cleared");
  }

  function init() {
    $("startBtn").addEventListener("click", runFullTest);
    $("stopBtn").addEventListener("click", () => { if (state.abort) state.abort.abort(); });
    $("copyBtn").addEventListener("click", copyLatest);
    $("exportJsonBtn").addEventListener("click", exportJson);
    $("exportCsvBtn").addEventListener("click", exportCsv);
    $("clearBtn").addEventListener("click", clearHistory);
    renderHistory();
    if (!window.isSecureContext) {
      $("gpsToggle").checked = false;
      $("gpsToggle").disabled = true;
      $("locationPhase").textContent = "HTTPS needed";
      $("locationMeta").textContent = "Geolocation requires a secure context";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
