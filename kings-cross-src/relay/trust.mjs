// Keeps a bounded, private projection of TRUST activations and King's Cross movements.
// Input records are reduced immediately to allow-listed fields; raw feed payloads are never retained.
import { matchService } from '../core/schedule.ts';

const KX_STANOX = '54311';
const DAY_MS = 24 * 60 * 60_000;
const MAX_ACTIVATIONS = 2_000;
const MAX_MOVEMENTS = 3_000;
const MAX_PENDING_ACTIVATIONS = 5_000;
const MAX_CANCELLATIONS = 2_000;
const MAX_PENDING_CANCELLATIONS = 5_000;
const londonDateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
});

const text = (value) => (typeof value === 'string' && value.length <= 128) || (typeof value === 'number' && Number.isFinite(value)) ? String(value).trim() : '';
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;

function timestamp(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d{1,16}$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 8_640_000_000_000_000 ? parsed : null;
}

function dateString(value) {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date ? date : null;
}

function dateAt(ms) {
  if (ms === null) return null;
  try {
    const parts = Object.fromEntries(londonDateParts.formatToParts(ms).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  catch { return null; }
}

function headcodeFrom(trainId) {
  return /^[A-Z0-9]{6,32}$/.test(trainId) && /^[0-9][A-Z][0-9]{2}$/.test(trainId.slice(2, 6)) ? trainId.slice(2, 6) : '';
}

function signedVariation(body) {
  if (typeof body.timetable_variation !== 'number' && (typeof body.timetable_variation !== 'string' || !/^-?\d{1,5}$/.test(body.timetable_variation))) return null;
  const variation = Number(body.timetable_variation);
  if (!Number.isSafeInteger(variation) || Math.abs(variation) > 10_080) return null;
  const value = Math.abs(variation);
  switch (text(body.variation_status).toUpperCase()) {
    case 'EARLY': return -value;
    case 'LATE': return value;
    case 'ON TIME': return 0;
    default: return variation;
  }
}

function serviceType(scheduleType) {
  // TRUST documents a known O/P inversion in this field.
  return ({ C: 'C', N: 'N', O: 'P', P: 'O' })[text(scheduleType).toUpperCase()] ?? null;
}

function activationDate(body) {
  return dateAt(timestamp(body.origin_dep_timestamp))
    ?? dateString(body.tp_origin_timestamp)
    ?? dateString(body.schedule_start_date);
}

function activationService(activation, services) {
  const candidates = services.filter((service) => {
    if (service?.uid !== activation.uid) return false;
    if (activation.headcode && service.headcode !== activation.headcode) return false;
    if (activation.serviceDate && service.serviceDate !== activation.serviceDate) return false;
    return true;
  });
  if (!candidates.length) return undefined;
  const scheduleStart = activation.scheduleStartDate;
  const stp = serviceType(activation.scheduleType);
  return candidates.find((service) => scheduleStart && service.startDate === scheduleStart && (!stp || service.stp === stp))
    ?? candidates.find((service) => scheduleStart && service.startDate === scheduleStart)
    ?? candidates.find((service) => stp && service.stp === stp)
    ?? candidates[0];
}

const validServices = (rows) => Array.isArray(rows) ? rows.filter(row => object(row) && typeof row.uid === 'string' && typeof row.headcode === 'string' && typeof row.serviceDate === 'string' && typeof row.date === 'string') : [];

function parseMessages(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { throw new Error('trust: invalid JSON'); }
  }
  if (!Array.isArray(value)) throw new Error('trust: body is not an array');
  return value;
}

function stableKey(parts) {
  return parts.map((part) => part ?? '').join('/');
}

function putRecent(map, key, value, limit) {
  const evicted = map.size >= limit && !map.has(key);
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
  return evicted;
}

/**
 * Create an in-memory TRUST projection for one station area. `apply(raw)` accepts a TRUST
 * JSON string or parsed array. `setServices(calls)` resolves startup activations held until
 * the national schedule download completes and returns the newly accepted activation events.
 * `enrich(calls)` returns schedule calls with a `realtime` object (or null), plus the recent
 * normalized movement events. TRUST is historical: realtime actual/public fields are populated
 * only from explicit movement timestamps; no forecast is inferred.
 */
export function createTrustState({ area = 'Y9', services = () => [], now = Date.now } = {}) {
  if (typeof area !== 'string' || !area.trim()) throw new Error('trust: area is required');
  const configuredServices = typeof services === 'function' ? services : () => services;
  let serviceRows = [];
  let servicesLoaded = false;
  let servicesPinned = false;
  let accepted = 0;
  let rejectedActivations = 0;
  let expiredActivations = 0;
  let expiredMovements = 0;
  let droppedPendingActivations = 0;
  const activations = new Map();
  const pendingActivations = new Map();
  const movements = new Map();
  const cancellations = new Map();
  const pendingCancellations = new Map();

  function currentTime() {
    const value = Number(now());
    return Number.isFinite(value) ? value : Date.now();
  }

  function prune(at = currentTime()) {
    for (const [key, value] of activations) {
      if (at - value.receivedAtMs >= DAY_MS) { activations.delete(key); expiredActivations += 1; }
    }
    for (const [key, value] of pendingActivations) {
      if (at - value.receivedAtMs >= DAY_MS) { pendingActivations.delete(key); rejectedActivations += 1; }
    }
    for (const [key, value] of movements) {
      if (at - value.receivedAtMs >= DAY_MS) { movements.delete(key); expiredMovements += 1; }
    }
    for (const [key, value] of cancellations) {
      if (at - value.event.receivedAtMs >= DAY_MS) cancellations.delete(key);
    }
    for (const [key, value] of pendingCancellations) {
      if (at - value.receivedAtMs >= DAY_MS) pendingCancellations.delete(key);
    }
  }

  function readServices() {
    if (servicesPinned) return serviceRows;
    let result;
    try { result = configuredServices(); } catch { result = []; }
    if (Array.isArray(result)) {
      serviceRows = validServices(result);
      if (result.length) servicesLoaded = true;
    }
    return serviceRows;
  }

  function makeActivation(raw, receivedAtMs) {
    const body = object(raw.body);
    if (!body) return null;
    const trainId = text(body.train_id);
    const uid = text(body.train_uid);
    if (!trainId || !/^[A-Z0-9]{1,16}$/.test(uid)) return null;
    const headcode = headcodeFrom(trainId);
    if (!headcode) return null;
    return {
      trainId,
      uid,
      headcode,
      serviceDate: activationDate(body),
      scheduleStartDate: dateString(body.schedule_start_date),
      scheduleType: text(body.schedule_type).toUpperCase(),
      plannedMs: timestamp(body.origin_dep_timestamp),
      receivedAtMs,
    };
  }

  function activationEvent(activation, service) {
    return {
      kind: 'trust', area, type: 'activation',
      trainId: activation.trainId,
      uid: service.uid,
      headcode: service.headcode || activation.headcode,
      serviceDate: service.serviceDate || activation.serviceDate,
      date: service.date ?? null,
      eventType: null,
      plannedMs: activation.plannedMs,
      actualMs: null,
      publicMs: null,
      variationMinutes: null,
      platform: service.platform ?? null,
      matchMethod: 'activation',
      receivedAtMs: activation.receivedAtMs,
    };
  }

  function activate(activation, service) {
    const row = {
      trainId: activation.trainId,
      uid: service.uid,
      headcode: service.headcode || activation.headcode,
      serviceDate: service.serviceDate || activation.serviceDate,
      date: service.date ?? null,
      receivedAtMs: activation.receivedAtMs,
    };
    putRecent(activations, row.trainId, row, MAX_ACTIVATIONS);
    accepted += 1;
    return activationEvent(activation, service);
  }

  function resolvePending(rows) {
    if (!servicesLoaded) return [];
    const emitted = [];
    for (const [trainId, activation] of pendingActivations) {
      const service = activationService(activation, rows);
      pendingActivations.delete(trainId);
      if (service) emitted.push(activate(activation, service));
      else rejectedActivations += 1;
    }
    return [...emitted, ...resolvePendingCancellations(rows)];
  }

  function activationFor(trainId, originalTrainId) {
    return activations.get(trainId) ?? activations.get(originalTrainId);
  }

  function matchMovement(base, originalTrainId, currentTrainId, rows) {
    const trainId = currentTrainId || originalTrainId;
    const linked = activationFor(currentTrainId, originalTrainId);
    const headcode = linked?.headcode || headcodeFrom(originalTrainId || trainId);
    const matchTime = base.plannedMs ?? base.publicMs;
    let service;
    let uid = null;
    let serviceDate = null;
    let date = null;
    let matchMethod = 'unmatched';
    if (linked) {
      uid = linked.uid;
      serviceDate = linked.serviceDate;
      date = linked.date;
      matchMethod = 'activation';
      service = rows.find((row) => row.uid === uid && row.serviceDate === serviceDate && row.date === date);
    } else if (headcode && matchTime !== null) {
      service = matchService(headcode, matchTime, rows);
      if (service) {
        uid = service.uid;
        serviceDate = service.serviceDate;
        date = service.date;
        matchMethod = 'headcode-time';
      }
    }
    const normalized = {
      ...base,
      trainId,
      uid,
      headcode,
      serviceDate,
      date,
      matchMethod,
    };
    return { normalized, service, originalTrainId, currentTrainId };
  }

  function movementEvent(body, receivedAtMs, rows) {
    if (text(body.loc_stanox) !== KX_STANOX) return null;
    const originalTrainId = text(body.train_id);
    const currentTrainId = text(body.current_train_id);
    if ((!currentTrainId && !originalTrainId) || (currentTrainId && !headcodeFrom(currentTrainId)) || (originalTrainId && !headcodeFrom(originalTrainId))) return null;
    const base = {
      kind: 'trust', area, type: 'movement',
      eventType: text(body.event_type).toUpperCase() || null,
      plannedMs: timestamp(body.planned_timestamp),
      actualMs: timestamp(body.actual_timestamp),
      publicMs: timestamp(body.gbtt_timestamp),
      variationMinutes: signedVariation(body),
      platform: text(body.platform) || null,
      receivedAtMs,
    };
    return matchMovement(base, originalTrainId, currentTrainId, rows);
  }

  function readCancellation(body, type, receivedAtMs) {
    const originalTrainId = text(body.train_id), currentTrainId = text(body.current_train_id);
    const sourceMs = timestamp(type === '0002' ? body.canx_timestamp : body.reinstatement_timestamp);
    if (sourceMs === null || (!currentTrainId && !originalTrainId) ||
        (currentTrainId && !headcodeFrom(currentTrainId)) || (originalTrainId && !headcodeFrom(originalTrainId))) return null;
    return { originalTrainId, currentTrainId, sourceMs, cancelled: type === '0002',
      departureMs: timestamp(body.dep_timestamp), location: text(body.loc_stanox), receivedAtMs };
  }

  function applyCancellation(control, rows) {
    const linked = activationFor(control.currentTrainId, control.originalTrainId);
    if (!linked) return null;
    const service = rows.find(row => row.uid === linked.uid && row.serviceDate === linked.serviceDate && row.date === linked.date);
    if (!service) return null;
    // A cancellation may be entered at a remote origin. A later cancellation point,
    // however, is not evidence that an earlier King's Cross call was cancelled.
    const lastCall = Math.max(...[service.arrivalMs, service.departureMs].filter(Number.isFinite));
    if (control.location !== KX_STANOX && control.departureMs !== null &&
        Number.isFinite(lastCall) && control.departureMs > lastCall) return null;
    const key = stableKey([service.uid, service.serviceDate, service.date]);
    const previous = cancellations.get(key);
    if (previous && (control.sourceMs < previous.sourceMs ||
        control.sourceMs === previous.sourceMs && control.cancelled === previous.event.cancelled)) return null;
    const event = { kind: 'trust', area, type: 'cancellation', cancelled: control.cancelled,
      trainId: control.currentTrainId || control.originalTrainId, uid: service.uid, headcode: service.headcode,
      date: service.date, serviceDate: service.serviceDate, matchMethod: 'activation', receivedAtMs: control.receivedAtMs };
    putRecent(cancellations, key, { sourceMs: control.sourceMs, event }, MAX_CANCELLATIONS);
    accepted += 1;
    return event;
  }

  function resolvePendingCancellations(rows) {
    const events = [];
    for (const [key, control] of pendingCancellations) {
      if (!activationFor(control.currentTrainId, control.originalTrainId)) continue;
      pendingCancellations.delete(key);
      const event = applyCancellation(control, rows);
      if (event) events.push(event);
    }
    return events;
  }

  function apply(raw) {
    const at = currentTime();
    prune(at);
    const rows = readServices();
    const output = resolvePending(rows);
    for (const message of parseMessages(raw)) {
      const item = object(message);
      const header = object(item?.header);
      const type = text(header?.msg_type);
      if (type === '0001') {
        const activation = makeActivation(item, at);
        if (!activation) { rejectedActivations += 1; continue; }
        if (!servicesLoaded) {
          if (putRecent(pendingActivations, activation.trainId, activation, MAX_PENDING_ACTIVATIONS)) droppedPendingActivations += 1;
          continue;
        }
        const service = activationService(activation, rows);
        if (!service) { rejectedActivations += 1; continue; }
        output.push(activate(activation, service));
      } else if (type === '0003') {
        const result = movementEvent(object(item?.body) ?? {}, at, rows);
        if (!result) continue;
        const { normalized, originalTrainId, currentTrainId } = result;
        const key = stableKey([normalized.trainId, normalized.eventType, normalized.plannedMs, normalized.date]);
        const previous = movements.get(key);
        if (previous?.base.actualMs !== null && previous?.base.actualMs > (normalized.actualMs ?? -Infinity)) continue;
        putRecent(movements, key, {
          base: {
            kind: normalized.kind,
            area: normalized.area,
            type: normalized.type,
            eventType: normalized.eventType,
            plannedMs: normalized.plannedMs,
            actualMs: normalized.actualMs,
            publicMs: normalized.publicMs,
            variationMinutes: normalized.variationMinutes,
            platform: normalized.platform,
            receivedAtMs: normalized.receivedAtMs,
          },
          originalTrainId,
          currentTrainId,
          receivedAtMs: at,
        }, MAX_MOVEMENTS);
        accepted += 1;
        output.push(normalized);
      } else if (type === '0002' || type === '0005') {
        const control = readCancellation(object(item?.body) ?? {}, type, at);
        if (!control) continue;
        if (!activationFor(control.currentTrainId, control.originalTrainId)) {
          const key = stableKey([control.originalTrainId, control.currentTrainId, control.sourceMs, control.cancelled]);
          putRecent(pendingCancellations, key, control, MAX_PENDING_CANCELLATIONS);
        } else {
          const event = applyCancellation(control, rows);
          if (event) output.push(event);
        }
      }
    }
    return [...output, ...resolvePendingCancellations(rows)];
  }

  function setServices(next) {
    serviceRows = validServices(next);
    servicesLoaded = true;
    servicesPinned = true;
    prune();
    return resolvePending(serviceRows);
  }

  function enrich(suppliedServices) {
    prune();
    const rows = Array.isArray(suppliedServices) ? validServices(suppliedServices) : readServices();
    const realtime = [];
    for (const stored of movements.values()) {
      const result = matchMovement(stored.base, stored.originalTrainId, stored.currentTrainId, rows);
      if (result) realtime.push(result.normalized);
    }
    for (const stored of cancellations.values()) realtime.push(stored.event);
    realtime.sort((a, b) => b.receivedAtMs - a.receivedAtMs || a.trainId.localeCompare(b.trainId));

    const byCall = new Map();
    for (const event of [...realtime].reverse()) {
      if (!event.uid || !event.serviceDate || !event.date) continue;
      const key = stableKey([event.uid, event.serviceDate, event.date]);
      const service = rows.find((row) => row.uid === event.uid && row.serviceDate === event.serviceDate && row.date === event.date);
      if (!service) continue;
      const existing = byCall.get(key) ?? {
        trainId: event.trainId,
        headcode: event.headcode,
        eventType: null,
        actualArrivalMs: null,
        actualDepartureMs: null,
        publicArrivalMs: null,
        publicDepartureMs: null,
        variationMinutes: null,
        platform: service.platform ?? null,
        matchMethod: event.matchMethod,
        updatedAtMs: event.receivedAtMs,
      };
      if (event.type === 'cancellation') {
        existing.cancelled = event.cancelled;
        existing.cancellationUpdatedAtMs = event.receivedAtMs;
        existing.updatedAtMs = Math.max(existing.updatedAtMs, event.receivedAtMs);
        byCall.set(key, existing);
        continue;
      }
      const previousActual = event.eventType === 'ARRIVAL' ? existing.actualArrivalMs : event.eventType === 'DEPARTURE' ? existing.actualDepartureMs : null;
      if (previousActual !== null && (event.actualMs ?? -Infinity) < previousActual) continue;
      existing.trainId = event.trainId;
      existing.headcode = event.headcode;
      existing.eventType = event.eventType;
      existing.variationMinutes = event.variationMinutes;
      existing.platform = event.platform ?? existing.platform;
      existing.matchMethod = event.matchMethod;
      existing.updatedAtMs = event.receivedAtMs;
      if (event.eventType === 'ARRIVAL') {
        if (event.actualMs !== null) existing.actualArrivalMs = event.actualMs;
        if (event.publicMs !== null) existing.publicArrivalMs = event.publicMs;
      } else if (event.eventType === 'DEPARTURE') {
        if (event.actualMs !== null) existing.actualDepartureMs = event.actualMs;
        if (event.publicMs !== null) existing.publicDepartureMs = event.publicMs;
      }
      byCall.set(key, existing);
    }
    const calls = rows.map((service) => ({
      ...service,
      realtime: byCall.get(stableKey([service.uid, service.serviceDate, service.date])) ?? null,
    }));
    return { calls, realtime };
  }

  function stats() {
    prune();
    return {
      area,
      accepted,
      activations: activations.size,
      movements: movements.size,
      cancellations: cancellations.size,
      pendingCancellations: pendingCancellations.size,
      unmatchedMovements: [...movements.values()].filter((row) => matchMovement(row.base, row.originalTrainId, row.currentTrainId, serviceRows).normalized.uid === null).length,
      pendingActivations: pendingActivations.size,
      rejectedActivations,
      expiredActivations,
      expiredMovements,
      droppedPendingActivations,
    };
  }

  return { area, apply, setServices, enrich, stats };
}
