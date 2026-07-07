/*
 * Morning Run — AIS proxy (Cloudflare Worker)
 * ===========================================
 *
 * WHY THIS EXISTS
 * Morning Run's "Detect ship" wants to ask an AIS provider "which large vessel
 * is at my GPS position?" and match it to the ship database. But no free AIS
 * feed can be called straight from a browser:
 *   - aisstream.io (the best free global option) is WebSocket-only AND rejects
 *     browser-origin connections;
 *   - the REST providers gate access behind sales or send no CORS headers.
 * So the app needs a tiny server in the middle. This Worker is that server: it
 * takes a plain GET, opens aisstream's WebSocket server-side (where the origin
 * block and CORS don't apply), listens a few seconds for nearby vessels, and
 * returns the simple JSON the app already understands. Cloudflare's free plan
 * is plenty for personal use.
 *
 * IT RETURNS (newest position per vessel, nearest first):
 *   [{ "name": "HARMONY OF THE SEAS", "lat": 25.77, "lon": -80.18,
 *      "type": 60, "mmsi": "123456789", "distM": 42 }, ...]
 *
 * DEPLOY (one-time, free)
 *   1. Get a free API key: sign in at https://aisstream.io/ and create a key on
 *      https://aisstream.io/apikeys
 *   2. Create a Worker: https://dash.cloudflare.com/ -> Workers & Pages ->
 *      Create -> Worker. Name it (e.g. "ais-proxy"), Deploy, then Edit code.
 *   3. Paste this whole file over the template and Deploy. Your Worker URL is
 *      like https://ais-proxy.<you>.workers.dev
 *   4. In Morning Run -> Settings, set the AIS endpoint to:
 *        https://ais-proxy.<you>.workers.dev/?lat={lat}&lon={lon}&key={key}&radius={radius}
 *      and paste your aisstream key in the AIS key field.
 *
 *   Prefer not to expose the key in the browser? In the Cloudflare dashboard add
 *   a Worker Secret named AISSTREAM_KEY (Settings -> Variables -> Add secret),
 *   then drop "&key={key}" from the endpoint and leave the app's key field blank.
 *
 * NOTE: free AIS is terrestrial only, so this finds ships near coast and in port
 * but not mid-ocean. When nothing is found the app falls back to the manual
 * ship picker, which is the reliable path at sea anyway.
 */

const AISSTREAM_WS = "https://stream.aisstream.io/v0/stream";
const COLLECT_MS = 6000; // listen window; a ship you're aboard reports every few s
const MAX_RESULTS = 25;

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const json = (obj, status) =>
      new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: Object.assign({ "Content-Type": "application/json" }, cors),
      });

    const url = new URL(request.url);
    const lat = parseFloat(url.searchParams.get("lat"));
    const lon = parseFloat(url.searchParams.get("lon"));
    const key = url.searchParams.get("key") || (env && env.AISSTREAM_KEY) || "";
    let radius = parseInt(url.searchParams.get("radius") || "3000", 10);
    if (!isFinite(radius)) radius = 3000;
    radius = Math.max(200, Math.min(50000, radius));

    if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return json({ error: "bad-position" }, 400);
    }
    if (!key) return json({ error: "no-key" }, 400);

    try {
      const vessels = await collectVessels(key, lat, lon, radius);
      return json(vessels);
    } catch (e) {
      return json({ error: "ais-failed", detail: String((e && e.message) || e) }, 502);
    }
  },
};

async function collectVessels(apiKey, lat, lon, radius) {
  // Bounding box around the fix. ~111.32 km per degree of latitude; longitude
  // shrinks by cos(lat). Clamp cos so we don't blow up near the poles.
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const box = [
    [lat - dLat, lon - dLon],
    [lat + dLat, lon + dLon],
  ];

  const resp = await fetch(AISSTREAM_WS, { headers: { Upgrade: "websocket" } });
  const ws = resp.webSocket;
  if (!ws) throw new Error("aisstream did not upgrade (HTTP " + resp.status + ")");
  ws.accept();

  const byMmsi = new Map();
  let serverError = null;

  // Subscribe immediately — aisstream closes the socket if the subscription
  // does not arrive within 3 seconds of connecting.
  ws.send(
    JSON.stringify({
      APIKey: apiKey,
      BoundingBoxes: [box],
      FilterMessageTypes: ["PositionReport", "ShipStaticData"],
    })
  );

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch (_) {}
      resolve();
    };
    const timer = setTimeout(finish, COLLECT_MS);

    ws.addEventListener("message", (ev) => {
      let m;
      try { m = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch (_) { return; }
      if (!m || typeof m !== "object") return;
      // aisstream reports auth/subscription problems as {error: "..."} then closes.
      if (m.error || m.Error) { serverError = m.error || m.Error; finish(); return; }

      const meta = m.MetaData || m.Metadata || {};
      const mmsi = meta.MMSI != null ? String(meta.MMSI) : null;
      if (!mmsi) return;

      const cur = byMmsi.get(mmsi) || { mmsi: mmsi, name: "", lat: null, lon: null, type: null };
      const nm = (meta.ShipName || "").trim();
      if (nm) cur.name = nm;
      const mlat = meta.latitude != null ? +meta.latitude : null;
      const mlon = meta.longitude != null ? +meta.longitude : null;
      if (mlat != null && isFinite(mlat)) cur.lat = mlat;
      if (mlon != null && isFinite(mlon)) cur.lon = mlon;
      if (m.MessageType === "ShipStaticData" && m.Message && m.Message.ShipStaticData) {
        const s = m.Message.ShipStaticData;
        if (s.Type != null) cur.type = s.Type; // AIS ship type; 60-69 = passenger
        if (!cur.name && s.Name) cur.name = String(s.Name).trim();
      }
      byMmsi.set(mmsi, cur);
    });
    ws.addEventListener("close", finish);
    ws.addEventListener("error", finish);
  });

  if (serverError) throw new Error("aisstream: " + serverError);

  const out = [];
  for (const v of byMmsi.values()) {
    if (v.lat == null || v.lon == null) continue;
    out.push({
      name: v.name,
      lat: v.lat,
      lon: v.lon,
      type: v.type,
      mmsi: v.mmsi,
      distM: Math.round(haversine(lat, lon, v.lat, v.lon)),
    });
  }
  out.sort((a, b) => a.distM - b.distM);
  return out.slice(0, MAX_RESULTS);
}

function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const s1 = Math.sin(toRad(bLat - aLat) / 2);
  const s2 = Math.sin(toRad(bLon - aLon) / 2);
  const a = s1 * s1 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
