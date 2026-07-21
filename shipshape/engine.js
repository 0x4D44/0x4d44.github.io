import { ENCOURAGEMENTS, EXERCISES, MILESTONES, NAG_MESSAGES, NUTRITION_NUDGES } from './content.js';

export const STORAGE_VERSION = 1;
const DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });

export function isoDate(date = new Date()) {
  if (typeof date === 'string') return date.slice(0, 10);
  return DATE_FMT.format(date);
}

export function findExercise(id) {
  return EXERCISES.find((exercise) => exercise.id === id);
}

export function defaultSettings() {
  return {
    locationModeDefault: 'home',
    nagModeEnabled: false,
    notificationPermissionAsked: false,
    preferredDutyWindows: ['morning', 'midday', 'afternoon', 'evening'],
    equipment: { rings: true, barWeightsKg: [2, 4, 5], resistanceBandsMaybe: false },
    theme: 'system'
  };
}

export function createInitialState(now = new Date()) {
  const stamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return { version: STORAGE_VERSION, initialized: false, createdAt: stamp, updatedAt: stamp, settings: defaultSettings(), plans: {}, progression: {}, logs: [], milestonesSeen: [], lastNotificationAt: null };
}

export function ensureStateShape(value = {}, now = new Date()) {
  const base = createInitialState(now);
  const settings = { ...base.settings, ...(value.settings || {}) };
  settings.equipment = { ...base.settings.equipment, ...(value.settings?.equipment || {}) };
  return {
    ...base,
    ...value,
    version: STORAGE_VERSION,
    initialized: Boolean(value.initialized),
    settings,
    plans: value.plans && typeof value.plans === 'object' ? value.plans : {},
    progression: value.progression && typeof value.progression === 'object' ? value.progression : {},
    logs: Array.isArray(value.logs) ? value.logs : [],
    milestonesSeen: Array.isArray(value.milestonesSeen) ? value.milestonesSeen : []
  };
}

function daySeed(date) {
  return [...date].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

function progressionFor(progression, exerciseId) {
  return progression?.[exerciseId] || { exerciseId, currentLevel: 0, recentFeedback: [], recentStatuses: [] };
}

function targetFromExercise(exercise, progression) {
  const level = Math.max(0, Math.min(8, progression?.currentLevel || 0));
  const start = exercise.starting || {};
  const target = { targetSets: start.sets || 1 };
  if (start.seconds) target.targetSeconds = start.seconds + level * 5;
  if (start.reps) target.targetReps = start.reps + Math.floor(level / 2);
  if (start.weightKg) target.targetWeightKg = start.weightKg + Math.floor(level / 3) * 1;
  return target;
}

function duty(id, date, exerciseId, period, progression, overrides = {}) {
  const exercise = findExercise(exerciseId);
  return {
    id,
    date,
    exerciseId,
    title: exercise.name,
    period,
    targetDescription: describeTarget(exercise, targetFromExercise(exercise, progressionFor(progression, exerciseId))),
    ...targetFromExercise(exercise, progressionFor(progression, exerciseId)),
    status: 'pending',
    ...overrides
  };
}

export function describeTarget(exercise, target) {
  const parts = [];
  if (target.targetSets) parts.push(`${target.targetSets} set${target.targetSets === 1 ? '' : 's'}`);
  if (target.targetReps) parts.push(`${target.targetReps} clean rep${target.targetReps === 1 ? '' : 's'}`);
  if (target.targetSeconds) parts.push(`${target.targetSeconds} sec`);
  if (target.targetWeightKg) parts.push(`${target.targetWeightKg} kg`);
  if (!parts.length || exercise.loggingType === 'boolean') return 'Notice it and log it';
  return parts.join(' · ');
}

const HOME_ROTATION = [
  ['ring-dead-hang', 'standing-press', 'ring-row', 'suitcase-hold'],
  ['ring-support', 'wall-push-up', 'bent-over-row', 'standing-core-brace'],
  ['ring-dead-hang', 'ring-row', 'standing-press', 'band-pallof']
];
const GYM_ROTATION = [
  ['lat-pulldown', 'chest-press', 'seated-row', 'farmer-carry-gym'],
  ['assisted-pullup', 'shoulder-press-machine', 'cable-face-pull', 'band-pallof'],
  ['seated-row', 'chest-press', 'lat-pulldown', 'farmer-carry-gym']
];
const PERIODS = ['morning', 'midday', 'afternoon', 'evening'];

export function generateDailyPlan(date, settings = defaultSettings(), progression = {}, options = {}) {
  const locationMode = options.locationMode || settings.locationModeDefault || 'home';
  const lowEnergyMode = Boolean(options.lowEnergyMode);
  const seed = daySeed(date);
  const rotation = locationMode === 'hotel_gym' ? GYM_ROTATION : HOME_ROTATION;
  let ids = rotation[seed % rotation.length];
  if (lowEnergyMode) ids = locationMode === 'hotel_gym' ? ['standing-core-brace', 'farmer-carry-gym'] : ['standing-core-brace', 'ring-dead-hang'];
  const duties = ids.map((exerciseId, index) => duty(`${date}-${locationMode}-${exerciseId}-${index}`, date, exerciseId, lowEnergyMode ? (index ? 'evening' : 'anytime') : PERIODS[index], progression));
  const nudge = NUTRITION_NUDGES[seed % NUTRITION_NUDGES.length];
  return { date, locationMode, lowEnergyMode, duties, nutritionNudge: nudge, maintained: false };
}

export function ensurePlanForDate(state, date = isoDate()) {
  const shaped = ensureStateShape(state);
  if (!shaped.plans[date]) {
    shaped.plans = { ...shaped.plans, [date]: generateDailyPlan(date, shaped.settings, shaped.progression) };
  }
  return shaped;
}

export function switchLocationMode(state, date, locationMode) {
  const shaped = ensurePlanForDate(state, date);
  const oldPlan = shaped.plans[date];
  const logged = oldPlan.duties.filter((d) => d.status !== 'pending');
  const next = generateDailyPlan(date, { ...shaped.settings, locationModeDefault: locationMode }, shaped.progression, { locationMode, lowEnergyMode: oldPlan.lowEnergyMode });
  const loggedByExercise = new Map(logged.map((d) => [d.exerciseId, d]));
  next.duties = next.duties.map((d) => ({ ...d, ...(loggedByExercise.get(d.exerciseId) || {}) }));
  next.maintained = next.duties.some(isMaintainingDuty);
  shaped.plans = { ...shaped.plans, [date]: next };
  shaped.settings = { ...shaped.settings, locationModeDefault: locationMode };
  return shaped;
}

export function setLowEnergyMode(state, date, lowEnergyMode) {
  const shaped = ensurePlanForDate(state, date);
  const oldPlan = shaped.plans[date];
  const next = generateDailyPlan(date, shaped.settings, shaped.progression, { locationMode: oldPlan.locationMode, lowEnergyMode });
  const logged = oldPlan.duties.filter((d) => d.status !== 'pending');
  next.duties = [...logged, ...next.duties.filter((d) => !logged.some((l) => l.exerciseId === d.exerciseId))].slice(0, lowEnergyMode ? 2 : 4);
  next.maintained = next.duties.some(isMaintainingDuty);
  shaped.plans = { ...shaped.plans, [date]: next };
  return shaped;
}

function isMaintainingDuty(duty) {
  return duty.status === 'done' || duty.status === 'partial';
}

export function updateProgression(progress = {}, exercise, previousDuty = {}, entry = {}, completedAt = new Date().toISOString()) {
  const current = { exerciseId: exercise.id, currentLevel: 0, recentFeedback: [], recentStatuses: [], ...progress };
  // Keep feedback and status ALIGNED per duty in one log, so the run checks reason over the
  // same events (an independent .filter(Boolean) on each column let a status-only 'skipped'
  // duty shift them out of step). Migrate from any legacy columns by zipping positionally.
  const priorLog = Array.isArray(current.recentLog)
    ? current.recentLog
    : (current.recentFeedback || []).map((f, i) => ({ feedback: f, status: (current.recentStatuses || [])[i] }));
  const recentLog = [...priorLog, ...((entry.feedback || entry.status) ? [{ feedback: entry.feedback, status: entry.status }] : [])].slice(-5);
  const recentFeedback = recentLog.map((e) => e.feedback).filter(Boolean).slice(-5);
  const recentStatuses = recentLog.map((e) => e.status).filter(Boolean).slice(-5);
  let level = current.currentLevel || 0;
  // Require the FULL window before adjusting: every() is vacuously true on a short slice, so
  // a single matching log would otherwise trip the "run" with only 1-2 entries of history.
  const last = (n) => recentLog.slice(-n);
  const easyRun = recentLog.length >= 3 && last(3).every((e) => e.feedback === 'too_easy' && e.status === 'done');
  const hardRun = (recentLog.length >= 2 && last(2).every((e) => e.feedback === 'too_hard')) ||
    (recentLog.length >= 3 && last(3).every((e) => e.status === 'skipped'));
  if (entry.feedback === 'pain_or_discomfort') level = Math.max(0, level - 1);
  else if (hardRun) level = Math.max(0, level - 1);
  else if (easyRun) level = Math.min(8, level + 1);
  const bestSeconds = Math.max(current.bestSeconds || 0, entry.actualSeconds || previousDuty.actualSeconds || 0) || undefined;
  const bestReps = Math.max(current.bestReps || 0, entry.actualReps || previousDuty.actualReps || 0) || undefined;
  const bestWeightKg = Math.max(current.bestWeightKg || 0, entry.actualWeightKg || previousDuty.actualWeightKg || 0) || undefined;
  return { ...current, currentLevel: level, recentLog, recentFeedback, recentStatuses, bestSeconds, bestReps, bestWeightKg, lastChangedAt: level !== current.currentLevel ? completedAt : current.lastChangedAt };
}

export function logDuty(state, date, dutyId, entry, now = new Date()) {
  const shaped = ensurePlanForDate(state, date);
  const plan = shaped.plans[date];
  const completedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const duties = plan.duties.map((d) => d.id === dutyId ? { ...d, ...entry, status: entry.status, completedAt } : d);
  const dutyDone = duties.find((d) => d.id === dutyId);
  const exercise = dutyDone ? findExercise(dutyDone.exerciseId) : null;
  const logs = shaped.logs.filter((log) => !(log.date === date && log.dutyId === dutyId));
  if (dutyDone && exercise) {
    logs.push({
      id: `${dutyId}-${completedAt}`,
      dutyId,
      date,
      completedAt,
      exerciseId: dutyDone.exerciseId,
      status: dutyDone.status,
      feedback: dutyDone.feedback,
      actualSeconds: dutyDone.actualSeconds,
      actualReps: dutyDone.actualReps,
      actualSets: dutyDone.actualSets,
      actualWeightKg: dutyDone.actualWeightKg,
      locationMode: plan.locationMode,
      category: exercise.category
    });
    shaped.progression = { ...shaped.progression, [exercise.id]: updateProgression(shaped.progression[exercise.id], exercise, dutyDone, dutyDone, completedAt) };
  }
  shaped.logs = logs.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  shaped.plans = { ...shaped.plans, [date]: { ...plan, duties, maintained: duties.some(isMaintainingDuty) } };
  shaped.updatedAt = completedAt;
  return awardMilestones(shaped, date);
}

export function calculateStats(state, today = isoDate()) {
  const shaped = ensureStateShape(state);
  const dates = Object.keys(shaped.plans).sort();
  const maintainedDates = dates.filter((date) => shaped.plans[date].maintained);
  let currentStreak = 0;
  let cursor = new Date(`${today}T12:00:00`);
  while (true) {
    const key = isoDate(cursor);
    if (!shaped.plans[key]?.maintained) break;
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  // Compare CALENDAR days, not a fixed 86,400,000 ms delta: a local noon-to-noon gap across
  // a DST transition is 23 h (spring) or 25 h, never exactly a day, which split genuinely
  // consecutive streaks. Derive prev's next calendar date the DST-safe way currentStreak does.
  const isConsecutive = (a, b) => {
    const d = new Date(`${a}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return isoDate(d) === b;
  };
  let longestStreak = 0, run = 0, prev = null;
  for (const date of maintainedDates) {
    if (!prev || isConsecutive(prev, date)) run += 1;
    else run = 1;
    longestStreak = Math.max(longestStreak, run);
    prev = date;
  }
  const completed = shaped.logs.filter((l) => l.status === 'done' || l.status === 'partial');
  const minutes = completed.reduce((sum, log) => sum + estimateMinutes(log), 0);
  const categories = new Set(completed.map((log) => log.category));
  const travelDays = new Set(completed.filter((log) => log.locationMode === 'hotel_gym').map((log) => log.date)).size;
  return { maintainedDays: maintainedDates.length, currentStreak, longestStreak, totalDuties: completed.length, totalMinutes: Math.round(minutes), partialDuties: shaped.logs.filter((l) => l.status === 'partial').length, skippedDuties: shaped.logs.filter((l) => l.status === 'skipped').length, categories, travelDays };
}

function estimateMinutes(log) {
  if (log.actualSeconds) return Math.max(0.25, log.actualSeconds / 60);
  if (log.actualReps || log.actualSets) return Math.max(0.5, (log.actualSets || 1) * (log.actualReps || 4) * 0.08);
  return log.status === 'skipped' ? 0 : 0.5;
}

export function readinessScore(state, today = isoDate()) {
  const shaped = ensurePlanForDate(state, today);
  const stats = calculateStats(shaped, today);
  const todayMaintained = shaped.plans[today]?.maintained ? 25 : 0;
  const recent = Object.keys(shaped.plans).filter((date) => date <= today).sort().slice(-7).filter((date) => shaped.plans[date].maintained).length;
  const coverage = Math.min(25, stats.categories.size * 6);
  const score = Math.min(100, todayMaintained + recent * 7 + coverage + Math.min(10, stats.currentStreak * 2));
  let label = 'Back on watch';
  if (score >= 76) label = 'Seaworthy';
  else if (score >= 50) label = 'Needs light maintenance';
  else if (score >= 25) label = 'Voyage resumed';
  return { score, label, detail: `${recent}/7 recent days maintained · ${stats.categories.size} capability areas touched` };
}

export function nextPendingDuty(plan) {
  return plan?.duties.find((d) => d.status === 'pending') || plan?.duties[0] || null;
}

export function nagMessage(state, date = isoDate()) {
  const plan = state.plans?.[date];
  const done = plan?.duties.filter(isMaintainingDuty).length || 0;
  return NAG_MESSAGES[(daySeed(date) + done * 3) % NAG_MESSAGES.length];
}

export function encouragement(state, date = isoDate()) {
  return ENCOURAGEMENTS[(daySeed(date) + (state.logs?.length || 0)) % ENCOURAGEMENTS.length];
}

function awardMilestones(state, today) {
  const stats = calculateStats(state, today);
  const seen = new Set(state.milestonesSeen || []);
  for (const milestone of MILESTONES) {
    const ok = (milestone.at && stats.totalDuties >= milestone.at) || (milestone.maintainedDays && stats.maintainedDays >= milestone.maintainedDays) || (milestone.streak && stats.currentStreak >= milestone.streak) || (milestone.minutes && stats.totalMinutes >= milestone.minutes) || (milestone.coverage && stats.categories.size >= milestone.coverage) || (milestone.travel && stats.travelDays >= milestone.travel);
    if (ok) seen.add(milestone.id);
  }
  return { ...state, milestonesSeen: [...seen] };
}

export function serialiseState(state) {
  return JSON.stringify(ensureStateShape(state), null, 2);
}

export function validateImportData(input) {
  let value = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input); }
    catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  }
  if (!value || typeof value !== 'object') return { ok: false, error: 'Import must be a Shipshape data object.' };
  if (value.version !== STORAGE_VERSION) return { ok: false, error: `Unsupported Shipshape storage version: ${value.version ?? 'missing'}.` };
  const shaped = ensureStateShape(value);
  for (const plan of Object.values(shaped.plans)) {
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.duties)) return { ok: false, error: 'A daily plan is malformed.' };
    for (const d of plan.duties) if (!findExercise(d.exerciseId)) return { ok: false, error: `Unknown exercise in plan: ${d.exerciseId}` };
  }
  for (const log of shaped.logs) {
    if (!log.date || !log.exerciseId || !findExercise(log.exerciseId)) return { ok: false, error: `Unknown exercise in log: ${log.exerciseId || 'missing'}` };
    if (!['pending', 'done', 'partial', 'skipped'].includes(log.status)) return { ok: false, error: `Unknown duty status: ${log.status}` };
  }
  return { ok: true, value: shaped };
}
