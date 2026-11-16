// Still — pure calculation helpers.
// No DOM, no storage. Everything here is unit-tested (tests/calc.test.js)
// and explained in plain language in docs/CALCULATIONS.md.

export const pad = (n) => String(n).padStart(2, "0");

/* ---------- Dates & times ---------- */

/** Local calendar date key, e.g. "2026-11-16". */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Monday of the week containing `key`. */
export function weekStart(key) {
  const d = parseKey(key);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return dateKey(d);
}

/** Strict "HH:MM" (00:00–23:59). */
export const isTime = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Strict "YYYY-MM-DD" that is a real calendar date. */
export function isDayKey(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return dateKey(parseKey(v)) === v;
}

/** "HH:MM" → minutes after midnight (NaN when invalid). */
export function toMin(hhmm) {
  if (!isTime(hhmm)) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** minutes (any integer, wraps around the day) → "HH:MM". */
export function fromMin(min) {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
}

/** Minutes from clock time a to clock time b, crossing midnight if needed. */
export function span(a, b) {
  let d = toMin(b) - toMin(a);
  if (d < 0) d += 1440;
  return d;
}

/** 452 → "7h 32m" */
export function fmtDur(min) {
  if (min == null || !Number.isFinite(min)) return "—";
  const v = Math.max(0, Math.round(min));
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (!h) return `${m}m`;
  return `${h}h ${pad(m)}m`;
}

/** Countdown style: 135 → "2:15" (h:mm) */
export function fmtClock(min) {
  const v = Math.max(0, Math.round(min));
  return `${Math.floor(v / 60)}:${pad(v % 60)}`;
}

/** "1:30" or "90" → 90 minutes. */
export function parseDuration(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s) return null;
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 24 * 60 ? Math.round(n) : null;
}

/* ---------- Stats ---------- */

export const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function stdev(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/* ---------- Sleep diary (CBT-I style) ---------- */

/**
 * Validates a diary entry. Times must happen in order:
 * in bed ≤ lights out ≤ final wake ≤ out of bed (all within one night).
 * Returns an array of human-readable problems (empty when valid).
 */
export function validateDiary(e, todayKey) {
  const errs = [];
  if (e.date !== undefined && !isDayKey(e.date)) errs.push("Pick a valid date.");
  else if (todayKey && e.date > todayKey) errs.push("That date is in the future.");
  const names = { inBed: "into bed", lightsOut: "lights out", finalWake: "final wake", outOfBed: "out of bed" };
  for (const [f, label] of Object.entries(names)) {
    if (!isTime(e[f])) errs.push(`Add the "${label}" time.`);
  }
  if (errs.length) return errs;
  const tib = span(e.inBed, e.outOfBed);
  const lo = span(e.inBed, e.lightsOut);
  const fw = span(e.inBed, e.finalWake);
  if (tib === 0) errs.push("Time in bed is zero.");
  if (lo >= fw) errs.push("Lights out must be before final wake.");
  if (fw > tib) errs.push("Final wake must be before getting out of bed.");
  if (tib > 16 * 60) errs.push("More than 16 hours in bed — check the times.");
  const opp = fw - lo;
  const lat = num(e.latency) || 0;
  const waso = num(e.waso) || 0;
  if (lat < 0 || waso < 0) errs.push("Minutes can't be negative.");
  if (lat + waso > opp) errs.push("Time awake is longer than the sleep opportunity.");
  return errs;
}

/**
 * Core sleep numbers for one night.
 *  - Time in bed (TIB): in bed → out of bed. Includes reading / thinking time.
 *  - Sleep opportunity: lights out → final wake. The window you give sleep.
 *  - Total sleep (TST): opportunity − time to fall asleep − time awake in the night,
 *    or the Watch's "asleep" number when provided.
 *  - Efficiency: TST ÷ opportunity. Quiet time in bed before lights-out or after
 *    the final wake is deliberately NOT counted against you.
 *  - Clinical efficiency (TST ÷ TIB) is still reported for transparency.
 */
export function diaryMetrics(e) {
  const tib = span(e.inBed, e.outOfBed);
  const opportunity = span(e.lightsOut, e.finalWake);
  const latency = num(e.latency) || 0;
  const waso = num(e.waso) || 0;
  const watch = num(e.asleep);
  const sleep = Math.max(0, Math.min(opportunity, watch != null ? watch : opportunity - latency - waso));
  const efficiency = opportunity > 0 ? Math.round((sleep / opportunity) * 100) : 0;
  const clinicalEfficiency = tib > 0 ? Math.round((sleep / tib) * 100) : 0;
  return {
    tib,
    opportunity,
    sleep,
    efficiency,
    clinicalEfficiency,
    quietTime: Math.max(0, tib - opportunity), // reflective time in bed
    latency,
    waso,
    source: watch != null ? "watch" : "diary",
  };
}

/** Entries sorted ascending by date, limited to the `n` nights ending at `endKey`. */
export function lastNights(entries, endKey, n) {
  const start = addDays(endKey, -(n - 1));
  return entries
    .filter((e) => e.date >= start && e.date <= endKey)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * 7–14 night summary: averages + consistency (standard deviation of
 * lights-out and final-wake clock times, in minutes).
 */
export function sleepTrend(entries, endKey, n = 14) {
  const nights = lastNights(entries, endKey, n).map((e) => ({ ...e, m: diaryMetrics(e) }));
  if (!nights.length) return { nights, count: 0 };
  const wakes = nights.map((x) => toMin(x.finalWake));
  // lights-out can cross midnight; push early-morning times past 24:00
  const outs = nights.map((x) => {
    const v = toMin(x.lightsOut);
    return v < 12 * 60 ? v + 1440 : v;
  });
  return {
    nights,
    count: nights.length,
    avgSleep: mean(nights.map((x) => x.m.sleep)),
    avgOpportunity: mean(nights.map((x) => x.m.opportunity)),
    avgTib: mean(nights.map((x) => x.m.tib)),
    avgEfficiency: mean(nights.map((x) => x.m.efficiency)),
    wakeSd: stdev(wakes),
    lightsOutSd: stdev(outs),
    avgWake: mean(wakes),
    avgLightsOut: mean(outs),
  };
}

/** Plain-language label for a consistency standard deviation. */
export function consistencyLabel(sd) {
  if (sd == null) return "Need 2+ nights";
  if (sd <= 20) return "Very consistent";
  if (sd <= 40) return "Consistent";
  if (sd <= 60) return "Drifting";
  return "Irregular";
}

/**
 * Tonight's plan. Fixed wake time is the anchor (most important CBT-I rule).
 *   lights out = wake − sleep opportunity target
 *   in bed     = lights out − quiet/thinking time you want before sleep
 * A gentle note uses the 7-night average efficiency.
 */
export function bedtimePlan(settings, entries, todayKey) {
  const wake = toMin(settings.wakeTime);
  const lightsOut = wake - settings.opportunityMin;
  const inBed = lightsOut - (settings.quietMin || 0);
  const trend = sleepTrend(entries, todayKey, 7);
  let note = "Fixed wake time is the anchor. Keep it, even after a short night.";
  if (trend.count >= 3) {
    const eff = trend.avgEfficiency;
    if (eff >= 90) note = `Efficiency ${Math.round(eff)}% this week. Sleep is filling the window well.`;
    else if (eff >= 85) note = `Efficiency ${Math.round(eff)}% this week. Keep the window as it is.`;
    else
      note = `Efficiency ${Math.round(eff)}% this week. If you want more sleep rather than more thinking time, try lights out 15 min later.`;
  }
  return {
    inBed: fromMin(inBed),
    lightsOut: fromMin(lightsOut),
    windowStart: fromMin(lightsOut - 15),
    wake: fromMin(wake),
    opportunityMin: settings.opportunityMin,
    tibMin: settings.opportunityMin + (settings.quietMin || 0),
    note,
  };
}

/** True while it's wind-down / night time (1h before in-bed until wake). */
export function isNight(settings, now = new Date()) {
  const t = now.getHours() * 60 + now.getMinutes();
  const wake = toMin(settings.wakeTime);
  const start = wake - settings.opportunityMin - (settings.quietMin || 0) - 60;
  const s = ((start % 1440) + 1440) % 1440;
  return s < wake ? t >= s && t < wake : t >= s || t < wake;
}

/* ---------- Recovery (Ready / Easy / Rest) ---------- */

/**
 * Recovery for `todayKey`, from deviations against your personal baseline.
 *
 * Recent  = mean of the last 3 days (today and the 2 before) — a trend, not one night.
 * Baseline = mean of the 14 days before that (needs ≥3 values per signal).
 *
 * Points per signal (0 good · 1 watch · 2 strained):
 *   HRV:   recent vs baseline   ≥ −4% → 0 · −4…−10% → 1 · < −10% → 2
 *   RHR:   recent − baseline    ≤ +2 bpm → 0 · +2…+5 → 1 · > +5 → 2
 *   Sleep: 3-night average      ≥ 7h → 0 · 6–7h → 1 · < 6h → 2
 * Strain = points ÷ max possible points.  ≤ 0.25 Ready · ≤ 0.55 Easy · else Rest.
 */
export function recovery(checkins, todayKey) {
  const today = checkins.find((c) => c.date === todayKey);
  if (!today) return { status: null, signals: [], reason: "no-checkin" };

  const recentFrom = addDays(todayKey, -2);
  const baseFrom = addDays(todayKey, -16);
  const baseTo = addDays(todayKey, -3);
  const recent = checkins.filter((c) => c.date >= recentFrom && c.date <= todayKey);
  const base = checkins.filter((c) => c.date >= baseFrom && c.date <= baseTo);

  const vals = (arr, f) => arr.map(f).filter((v) => v != null && Number.isFinite(v));
  const signals = [];
  let points = 0;
  let max = 0;

  const hrvR = vals(recent, (c) => num(c.hrv));
  const hrvB = vals(base, (c) => num(c.hrv));
  if (hrvR.length) {
    if (hrvB.length >= 3) {
      const r = mean(hrvR);
      const b = mean(hrvB);
      const dev = ((r - b) / b) * 100;
      const p = dev >= -4 ? 0 : dev >= -10 ? 1 : 2;
      points += p;
      max += 2;
      signals.push({ key: "hrv", label: "HRV", text: `${Math.round(r)} ms vs ${Math.round(b)} baseline (${dev >= 0 ? "+" : ""}${Math.round(dev)}%)`, points: p });
    } else {
      signals.push({ key: "hrv", label: "HRV", text: `Building baseline (${hrvB.length}/3 days)`, points: null });
    }
  }

  const rhrR = vals(recent, (c) => num(c.rhr));
  const rhrB = vals(base, (c) => num(c.rhr));
  if (rhrR.length) {
    if (rhrB.length >= 3) {
      const r = mean(rhrR);
      const b = mean(rhrB);
      const d = r - b;
      const p = d <= 2 ? 0 : d <= 5 ? 1 : 2;
      points += p;
      max += 2;
      signals.push({ key: "rhr", label: "Resting HR", text: `${Math.round(r)} bpm vs ${Math.round(b)} baseline (${d >= 0 ? "+" : ""}${d.toFixed(1)})`, points: p });
    } else {
      signals.push({ key: "rhr", label: "Resting HR", text: `Building baseline (${rhrB.length}/3 days)`, points: null });
    }
  }

  const sleepR = recent.filter((c) => c.inBed).map((c) => diaryMetrics(c).sleep);
  if (sleepR.length) {
    const s = mean(sleepR);
    const p = s >= 420 ? 0 : s >= 360 ? 1 : 2;
    points += p;
    max += 2;
    signals.push({ key: "sleep", label: "Sleep", text: `${fmtDur(s)} average, last ${sleepR.length} night${sleepR.length > 1 ? "s" : ""}`, points: p });
  }

  if (!max) return { status: null, signals, reason: "building" };
  const strain = points / max;
  const status = strain <= 0.25 ? "Ready" : strain <= 0.55 ? "Easy" : "Rest";
  return { status, strain, signals, reason: null };
}

export const RECOVERY_ADVICE = {
  Ready: "Train as planned.",
  Easy: "Train, but keep it moderate — leave 2–3 reps in reserve, skip the last set.",
  Rest: "Swap lifting for a walk, mobility, or breathwork. The plan waits for you.",
};

/* ---------- Fasting / eating window ---------- */

/**
 * Eating window that starts at `start` ("HH:MM") and lasts `hours`.
 * Returns whether it's open right now and the minutes until it changes.
 */
export function fastingState(now, start, hours) {
  if (!hours || !Number.isFinite(toMin(start))) return { mode: "off" };
  const t = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const s = toMin(start);
  const e = s + hours * 60;
  // window today, or yesterday's window spilling past midnight
  if ((t >= s && t < e) || (e > 1440 && t < e - 1440)) {
    const end = t >= s ? e : e - 1440;
    return { mode: "open", remaining: end - t, closesAt: fromMin(e), opensAt: fromMin(s) };
  }
  const untilOpen = t < s ? s - t : s + 1440 - t;
  const endToday = e % 1440;
  const fasted = t >= endToday ? t - endToday : t + 1440 - endToday;
  return { mode: "fasting", untilOpen, fasted, opensAt: fromMin(s), closesAt: fromMin(e) };
}

export const FASTING_PROTOCOLS = [
  { id: "off", label: "No window", hours: 0 },
  { id: "16:8", label: "16:8 · 8-hour window", hours: 8 },
  { id: "18:6", label: "18:6 · 6-hour window", hours: 6 },
  { id: "20:4", label: "20:4 · 4-hour window", hours: 4 },
  { id: "omad", label: "OMAD · one meal (1 h)", hours: 1 },
];

/* ---------- Training ---------- */

export function setVolume(sets) {
  return sets.reduce((s, x) => s + (num(x.w) || 0) * (num(x.r) || 0), 0);
}

export function sessionVolume(session) {
  return (session.exercises || []).reduce((s, ex) => s + setVolume(ex.sets || []), 0);
}

/** Most recent logged sets for an exercise name (case-insensitive). */
export function lastPerformance(sessions, name) {
  const n = name.trim().toLowerCase();
  const sorted = [...sessions].sort((a, b) => (b.t || 0) - (a.t || 0));
  for (const s of sorted) {
    const ex = (s.exercises || []).find((x) => x.name.trim().toLowerCase() === n && x.sets && x.sets.length);
    if (ex) return { date: s.date, sets: ex.sets };
  }
  return null;
}

/**
 * Progressive overload suggestion (double progression).
 * Take the heaviest set from last time. If every set at that weight reached
 * `repCeiling` reps → add one increment. Otherwise → same weight, +1 rep.
 */
export function suggestNext(sets, increment = 2.5, repCeiling = 10) {
  if (!sets || !sets.length) return null;
  const top = Math.max(...sets.map((s) => num(s.w) || 0));
  const atTop = sets.filter((s) => (num(s.w) || 0) === top);
  const minReps = Math.min(...atTop.map((s) => num(s.r) || 0));
  const maxReps = Math.max(...atTop.map((s) => num(s.r) || 0));
  if (top === 0) return { w: 0, r: maxReps + 1, text: `${maxReps + 1} reps` };
  if (minReps >= repCeiling) {
    const w = Math.round((top + increment) * 100) / 100;
    return { w, r: Math.max(5, repCeiling - 4), text: `${w} × ${Math.max(5, repCeiling - 4)}` };
  }
  return { w: top, r: maxReps + 1, text: `${top} × ${maxReps + 1}` };
}

export function weekSummary(sessions, todayKey) {
  const ws = weekStart(todayKey);
  const we = addDays(ws, 6);
  const inWeek = sessions.filter((s) => s.date >= ws && s.date <= we);
  return {
    start: ws,
    sessions: inWeek,
    strength: inWeek.filter((s) => s.kind === "strength").length,
    volume: inWeek.reduce((s, x) => s + sessionVolume(x), 0),
    minutes: inWeek.reduce((s, x) => s + (num(x.minutes) || 0), 0),
  };
}

/* ---------- Nutrition ---------- */

export function dayTotals(items) {
  return (items || []).reduce(
    (t, i) => ({ protein: t.protein + (num(i.protein) || 0), kcal: t.kcal + (num(i.kcal) || 0) }),
    { protein: 0, kcal: 0 }
  );
}

/** ISSN position stand: 1.4–2.0 g/kg/day for exercising adults. */
export function proteinRange(bodyweightKg) {
  if (!bodyweightKg) return null;
  return { low: Math.round(bodyweightKg * 1.4), high: Math.round(bodyweightKg * 2.0) };
}

export const KG_PER_LB = 0.45359237;
export const ML_PER_OZ = 29.5735;

/* ---------- Scheduling: is today a lifting day? ---------- */

/**
 * Decides whether today is a lifting day, so you never have to.
 *   - already lifted today            → done
 *   - weekly target reached            → rest (week complete)
 *   - recovery says Rest               → rest
 *   - remaining lifts ≥ days left      → train (needed to hit the target)
 *   - lifted yesterday, ≤ 4 days/week,
 *     and the week still fits          → rest (spacing)
 *   - otherwise                        → train
 */
export function trainingDay({ sessions, todayKey, daysPerWeek, recoveryStatus }) {
  const ws = weekStart(todayKey);
  const liftedOn = (k) => sessions.some((s) => s.kind === "strength" && s.date === k);
  const done = new Set(sessions.filter((s) => s.kind === "strength" && s.date >= ws && s.date < todayKey).map((s) => s.date)).size;
  const remaining = Math.max(0, daysPerWeek - done);
  const daysLeft = 7 - ((parseKey(todayKey).getDay() + 6) % 7); // including today
  const base = { done, remaining, daysLeft };
  if (liftedOn(todayKey)) return { ...base, train: false, reason: "done" };
  if (remaining === 0) return { ...base, train: false, reason: "week-complete" };
  if (recoveryStatus === "Rest") return { ...base, train: false, reason: "recovery" };
  if (remaining >= daysLeft) return { ...base, train: true, reason: "needed" };
  if (daysPerWeek <= 4 && liftedOn(addDays(todayKey, -1))) return { ...base, train: false, reason: "spacing" };
  return { ...base, train: true, reason: "scheduled" };
}

/** Median of a numeric list (null when empty). */
export function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * A "usual night" built from your recent diary (median clock times and minutes),
 * falling back to tonight's plan. Used for one-tap check-ins.
 */
export function usualNight(entries, plan, todayKey) {
  const recent = lastNights(entries, addDays(todayKey, -1), 7);
  if (!recent.length) {
    return { inBed: plan.inBed, lightsOut: plan.lightsOut, finalWake: plan.wake, outOfBed: fromMin(toMin(plan.wake) + 15), latency: 15, wakeups: 1, waso: 10, basis: "plan" };
  }
  // clock-time median that survives midnight: shift early-morning times past 24:00
  const clockMedian = (f, pivot) =>
    fromMin(median(recent.map((e) => {
      const v = toMin(e[f]);
      return v < pivot ? v + 1440 : v;
    })));
  return {
    inBed: clockMedian("inBed", 12 * 60),
    lightsOut: clockMedian("lightsOut", 12 * 60),
    finalWake: clockMedian("finalWake", 0),
    outOfBed: clockMedian("outOfBed", 0),
    latency: Math.round(median(recent.map((e) => num(e.latency) || 0))),
    wakeups: Math.round(median(recent.map((e) => num(e.wakeups) || 0))),
    waso: Math.round(median(recent.map((e) => num(e.waso) || 0))),
    basis: "recent",
  };
}
