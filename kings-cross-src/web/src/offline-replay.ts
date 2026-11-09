// Optional static replay bundles contain no relay configuration or credentials.
import type { AnchorMap } from '../../core/anchors.ts';
import type { Graph } from '../../core/graph.ts';
import { createScheduleFeed, parseRecording, ukDate } from './feed.ts';

class BundleError extends Error {}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 2048 && !/[\x00-\x1f\x7f]/.test(v);
function bundleUrl(value: unknown, base: URL, origin: string): URL {
  if (typeof value !== 'string' || !value.trim()) throw new BundleError('invalid replay bundle URL');
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password || url.hash ||
    /(^|\/)relay(\/|$)/i.test(decodeURIComponent(url.pathname))) throw new BundleError('invalid replay bundle URL');
  return url;
}

function parseAnchors(value: unknown, graph: Graph): AnchorMap {
  if (!object(value) || !identifier(value.area) || !Array.isArray(value.sources) || !value.sources.every(text) ||
    !Array.isArray(value.anchors) || value.anchors.length > 10_000 || !Array.isArray(value.unmapped) || value.unmapped.length > 10_000) throw new BundleError('invalid bundle anchors');
  const seen = new Set<string>();
  for (const a of value.anchors) {
    if (!object(a) || !identifier(a.berth) || seen.has(a.berth) || !['platform', 'signal', 'smart', 'inferred'].includes(String(a.kind)) ||
      !Number.isSafeInteger(a.from) || !Number.isSafeInteger(a.to) || typeof a.t !== 'number' || !Number.isFinite(a.t) || a.t < 0 || a.t > 1 ||
      !Array.isArray(a.point) || a.point.length !== 2 || !a.point.every(n => typeof n === 'number' && Number.isFinite(n)) ||
      typeof a.errorM !== 'number' || !Number.isFinite(a.errorM) || a.errorM < 0 || !text(a.evidence) || (a.platform !== undefined && !identifier(a.platform))) throw new BundleError('invalid bundle anchors');
    const from = a.from as number, to = a.to as number, p = graph.pos.get(from), q = graph.pos.get(to);
    if (!p || !q || !graph.adj.get(from)?.some(edge => (edge.a === from && edge.b === to) || (edge.b === from && edge.a === to)) ||
      Math.hypot(a.point[0] - (p[0] + (q[0] - p[0]) * a.t), a.point[1] - (p[1] + (q[1] - p[1]) * a.t)) > 1) throw new BundleError('invalid bundle anchors graph position');
    seen.add(a.berth);
  }
  for (const a of value.unmapped) {
    if (!object(a) || !identifier(a.berth) || !['outside-network', 'no-evidence', 'conflict'].includes(String(a.reason)) || !text(a.detail) ||
      !Number.isSafeInteger(a.seen) || (a.seen as number) < 0) throw new BundleError('invalid bundle anchors');
  }
  return value as unknown as AnchorMap;
}

/** Downloads are bounded before decoding. One deadline covers headers and every body. */
async function downloadOfflineReplay(manifestPath: string, pageUrl: string, graph: Graph, date: string,
  fetchImpl: typeof fetch = fetch, timeoutMs = 10_000) {
  const page = new URL(pageUrl), manifestUrl = bundleUrl(manifestPath, page, page.origin);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const pending = async <T>(promise: Promise<T>): Promise<T> => {
    let expired: (() => void) | undefined;
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => {
        expired = () => reject(new BundleError('replay bundle download expired'));
        if (abort.signal.aborted) expired(); else abort.signal.addEventListener('abort', expired, { once: true });
      })]);
    } finally { if (expired) abort.signal.removeEventListener('abort', expired); }
  };
  const download = async (url: URL, maximum: number): Promise<string> => {
    const response = await pending(fetchImpl(url.href, { signal: abort.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' }));
    if (response.url && bundleUrl(response.url, url, page.origin).href !== url.href) throw new BundleError('invalid replay bundle response URL');
    if (!response.ok) throw new BundleError('replay bundle download failed');
    if (Number(response.headers.get('content-length')) > maximum) { void response.body?.cancel().catch(() => {}); throw new BundleError('replay bundle download too large'); }
    const reader = response.body?.getReader();
    if (!reader) throw new BundleError('replay bundle download has no body');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await pending(reader.read());
        if (done) break;
        size += value.byteLength;
        if (size > maximum) throw new BundleError('replay bundle download too large');
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) { void reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
  };
  try {
    const manifest: unknown = JSON.parse(await download(manifestUrl, 64 * 1024));
    if (!object(manifest)) throw new BundleError('invalid replay bundle manifest');
    // Resolve every URL before any resource request, including the optional timetable.
    const anchorsUrl = bundleUrl(manifest.anchors, manifestUrl, page.origin);
    const recordingUrl = bundleUrl(manifest.recording, manifestUrl, page.origin);
    const scheduleUrl = manifest.schedule === undefined ? undefined : bundleUrl(manifest.schedule, manifestUrl, page.origin);
    const anchors = parseAnchors(JSON.parse(await download(anchorsUrl, 4 * 1024 * 1024)), graph);
    const recordingText = await download(recordingUrl, 16 * 1024 * 1024);
    let recording: ReturnType<typeof parseRecording>;
    try { recording = parseRecording(recordingText); } catch { throw new BundleError('invalid bundle recording'); }
    if (!recording.length || recording.some(row => row.e.area !== anchors.area)) throw new BundleError('invalid or empty bundle recording');
    if (ukDate(recording[0]!.t) !== date) throw new BundleError('bundle recording date does not match replay date');
    const timetable: unknown = scheduleUrl ? JSON.parse(await download(scheduleUrl, 4 * 1024 * 1024)) : { date, available: false, reason: 'no bundled timetable' };
    if (!object(timetable) || timetable.date !== date) throw new BundleError('invalid bundle timetable');
    const fetchSchedule: typeof fetch = async input => {
      const url = new URL(String(input), page);
      if (url.pathname !== '/relay/schedule' || url.searchParams.get('date') !== date) throw new BundleError('invalid bundled timetable request');
      return new Response(JSON.stringify(timetable), { headers: { 'content-type': 'application/json' } });
    };
    // Reuse the application's full service validator. Reject malformed schedules rather
    // than silently downgrading an invalid supplied timetable to missing bookings.
    const schedule = createScheduleFeed({ mode: 'replay', date, hostname: 'localhost', relayPresent: true,
      fetchImpl: fetchSchedule, schedule: () => 0, unschedule: () => {} });
    try {
      await schedule.refresh();
      if (timetable.available !== false && schedule.services() === undefined) throw new BundleError('invalid bundle timetable');
    } finally { schedule.dispose(); }
    return { anchors, recording, fetchSchedule };
  } finally { clearTimeout(timer); abort.abort(); }
}


/** Only fixed error categories may reach the status HUD; parser/fetch text is private. */
export async function loadOfflineReplay(manifestPath: string, pageUrl: string, graph: Graph, date: string,
  fetchImpl: typeof fetch = fetch, timeoutMs = 10_000) {
  try { return await downloadOfflineReplay(manifestPath, pageUrl, graph, date, fetchImpl, timeoutMs); }
  catch (error) {
    if (error instanceof BundleError) throw error;
    throw new BundleError('invalid replay bundle data');
  }
}
