import { execFile as nodeExecFile } from 'node:child_process';
import { readFile as nodeReadFile, unlink as nodeUnlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SETTLE_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const KILL_GRACE_MS = 2_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const SAFE_RESULT = Symbol('safe sclass result');
const defaultLockFs = { readFile: nodeReadFile, unlink: nodeUnlink };

function utcDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function nextUtcMidnight(ms) {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function safeErrorSummary(error) {
  if (error?.code === 'ETIMEDOUT') return 'timed out';
  if (Number.isInteger(error?.code)) return `exit ${error.code}`;
  if (typeof error?.code === 'string' && /^[A-Z0-9_]{1,24}$/.test(error.code)) return error.code;
  return 'failed';
}

function validIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function validateCounts(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid relearn result');
  const allowed = new Set(['bits', 'heads', 'precision', 'recall']);
  if (Object.keys(value).some(key => !allowed.has(key)) || !Number.isInteger(value.bits) || value.bits < 0
    || !Number.isInteger(value.heads) || value.heads < 0
    || ![null, undefined].includes(value.precision) && (!Number.isFinite(value.precision) || value.precision < 0 || value.precision > 1)
    || ![null, undefined].includes(value.recall) && (!Number.isFinite(value.recall) || value.recall < 0 || value.recall > 1)) {
    throw new Error('invalid relearn result');
  }
  return { bits: value.bits, heads: value.heads };
}

function parseRelearnResult(stdout) {
  let result;
  try { result = JSON.parse(stdout); } catch { throw new Error('invalid relearn result'); }
  const allowed = new Set(['date', 'validationDay', 'published', 'candidate', 'incumbent', 'reasons']);
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || Object.keys(result).some(key => !allowed.has(key))
    || !validIsoDate(result.date)
    || (result.validationDay !== null && (typeof result.validationDay !== 'string' || !/^\d{8}$/.test(result.validationDay)))
    || typeof result.published !== 'boolean' || !Array.isArray(result.reasons) || result.reasons.length > 8) {
    throw new Error('invalid relearn result');
  }
  const candidate = validateCounts(result.candidate);
  const incumbent = validateCounts(result.incumbent);
  if (result.reasons.some(reason => typeof reason !== 'string' || reason.length > 200 || /[\u0000-\u001f\u007f]/.test(reason))) {
    throw new Error('invalid relearn result');
  }

  const validation = result.validationDay ? `; validation ${result.validationDay}` : '';
  const counts = [candidate && `candidate ${candidate.bits} bits/${candidate.heads} heads`,
    incumbent && `incumbent ${incumbent.bits} bits/${incumbent.heads} heads`].filter(Boolean).join('; ');
  const reasons = result.reasons.slice(0, 3).join('; ');
  const more = result.reasons.length > 3 ? `; ${result.reasons.length - 3} more reason(s)` : '';
  const detail = [validation.replace(/^; /, ''), counts, reasons && `reasons: ${reasons}${more}`].filter(Boolean).join('; ');
  const text = `sclass relearn: ${result.published ? 'published' : 'refused'} for ${result.date}${detail ? ` (${detail})` : ''}`;
  return { [SAFE_RESULT]: true, text };
}

async function removeOwnedLock(dataDir, pid, lockFs) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const lockPath = path.join(dataDir, '.sclass-relearn.lock');
  try {
    const lock = JSON.parse(await lockFs.readFile(lockPath, 'utf8'));
    if (lock?.pid !== pid) return false;
    await lockFs.unlink(lockPath);
    return true;
  } catch {
    // A missing, malformed, foreign, or inaccessible lock is left untouched.
    return false;
  }
}

/** Return a bounded, stoppable runner for the private sclass relearn CLI. */
export function createSclassRunner({ execFile = nodeExecFile, cwd = packageRoot, timeoutMs = DEFAULT_TIMEOUT_MS,
  killGraceMs = KILL_GRACE_MS, lockFs = defaultLockFs } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('sclass runner timeout must be positive');
  if (!Number.isFinite(killGraceMs) || killGraceMs < 0) throw new Error('sclass runner kill grace must be non-negative');

  return ({ dataDir, area, anchorsPath, tablePath, signal }) => new Promise((resolve, reject) => {
    const args = ['tools/sclass.ts', '--relearn', '--data-dir', dataDir, '--area', area];
    if (anchorsPath !== undefined) args.push('--anchors', anchorsPath);
    if (tablePath !== undefined) args.push('--table', tablePath);

    let child;
    let closed = false;
    let forceTimer;
    let timeoutForceTimer;
    const isAlive = () => child && child.exitCode === null && child.signalCode === null;
    const clearKills = () => {
      clearTimeout(forceTimer);
      clearTimeout(timeoutForceTimer);
    };
    const forceAfterGrace = () => {
      clearTimeout(forceTimer);
      forceTimer = setTimeout(() => {
        if (isAlive()) {
          try { child.kill('SIGKILL'); } catch { /* The process may have exited between the check and signal. */ }
        }
      }, killGraceMs);
      forceTimer.unref?.();
    };
    const terminate = () => {
      if (!isAlive()) return;
      try { child.kill('SIGTERM'); } catch { /* The process may have exited between the check and signal. */ }
      forceAfterGrace();
    };
    const onAbort = () => terminate();

    try {
      child = execFile(process.execPath, args, {
        cwd,
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: timeoutMs,
        killSignal: 'SIGTERM',
      }, (error, stdout) => {
        closed = true;
        signal?.removeEventListener('abort', onAbort);
        clearKills();
        void (async () => {
          const exited = child && (child.exitCode !== null && child.exitCode !== undefined
            || child.signalCode !== null && child.signalCode !== undefined);
          if ((error || signal?.aborted) && exited) await removeOwnedLock(dataDir, child.pid, lockFs);
          if (error) reject(error);
          else {
            try { resolve(parseRelearnResult(stdout)); } catch (parseError) { reject(parseError); }
          }
        })();
      });
    } catch (error) {
      reject(error);
      return;
    }

    if (!closed) {
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();

      // execFile sends SIGTERM at timeoutMs. This watchdog escalates to SIGKILL
      // if the child ignores that signal; output stays bounded by maxBuffer.
      timeoutForceTimer = setTimeout(() => {
        if (isAlive()) forceAfterGrace();
      }, timeoutMs + 100);
      timeoutForceTimer.unref?.();
    }
  });
}

/**
 * Run one private relearn after startup settling and after each UTC midnight.
 * The runner receives an AbortSignal so stop() can terminate an active child.
 */
export function createSclassJob({
  dataDir,
  area,
  anchorsPath,
  tablePath,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
  run = createSclassRunner(),
  log = () => {},
  settleMs = DEFAULT_SETTLE_MS,
} = {}) {
  if (typeof dataDir !== 'string' || !dataDir) throw new Error('sclass job dataDir is required');
  if (typeof area !== 'string' || !area) throw new Error('sclass job area is required');
  if (!Number.isFinite(settleMs) || settleMs < 0 || settleMs >= 24 * 60 * 60_000) throw new Error('sclass job settleMs must be less than one UTC day');

  let started = false;
  let stopped = false;
  let startupTimer;
  let startupArmed = false;
  let rolloverTimer;
  let rolloverArmed = false;
  let activeController;
  let activePromise;
  let pendingDate;
  let latestAttemptedDate;
  let stopPromise;

  function safeLog(message) {
    try { log(message); } catch { /* Logging must not disrupt the scheduler. */ }
  }

  function trigger(date) {
    if (stopped || (latestAttemptedDate && date <= latestAttemptedDate)) return;
    if (activePromise) {
      if (!pendingDate || date > pendingDate) pendingDate = date;
      return;
    }

    latestAttemptedDate = date;
    const controller = new AbortController();
    activeController = controller;
    activePromise = Promise.resolve()
      .then(() => run({ date, dataDir, area, anchorsPath, tablePath, signal: controller.signal }))
      .then(result => {
        if (!stopped) safeLog(result?.[SAFE_RESULT] === true ? result.text : `sclass relearn: completed for ${date}`);
      })
      .catch(error => { if (!stopped) safeLog(`sclass relearn: ${safeErrorSummary(error)} for ${date}`); })
      .finally(() => {
        if (activeController === controller) {
          activeController = undefined;
          activePromise = undefined;
        }
        const queued = pendingDate;
        pendingDate = undefined;
        if (!stopped && queued && (!latestAttemptedDate || queued > latestAttemptedDate)) trigger(queued);
      });
  }

  function armRollover() {
    if (stopped) return;
    const at = now();
    const delay = Math.max(0, nextUtcMidnight(at) + settleMs - at);
    rolloverArmed = true;
    rolloverTimer = schedule(() => {
      rolloverArmed = false;
      rolloverTimer = undefined;
      if (stopped) return;
      trigger(utcDate(now()));
      armRollover();
    }, delay);
    rolloverTimer?.unref?.();
  }

  function startupDelay(at) {
    const due = at + settleMs;
    return utcDate(due) === utcDate(at) ? settleMs : nextUtcMidnight(at) + settleMs - at;
  }

  function clearTimers() {
    if (startupArmed) cancel(startupTimer);
    if (rolloverArmed) cancel(rolloverTimer);
    startupArmed = false;
    rolloverArmed = false;
    startupTimer = undefined;
    rolloverTimer = undefined;
  }

  return {
    start() {
      if (started || stopped) return;
      started = true;
      const at = now();
      startupArmed = true;
      startupTimer = schedule(() => {
        startupArmed = false;
        startupTimer = undefined;
        if (!stopped) trigger(utcDate(now()));
      }, startupDelay(at));
      startupTimer?.unref?.();
      armRollover();
    },
    async stop() {
      if (stopPromise) return stopPromise;
      stopped = true;
      pendingDate = undefined;
      clearTimers();
      activeController?.abort();
      stopPromise = activePromise ?? Promise.resolve();
      await stopPromise;
    },
  };
}
