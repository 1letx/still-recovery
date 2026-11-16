// Still — local-only state. Everything lives in this browser's localStorage.
//
// Every read (from storage or an imported backup) goes through `sanitize`,
// which rebuilds the state field by field with strict types and bounds.
// Unknown keys are dropped, so malformed or hostile data can't reach the UI.

import { DEFAULT_TEMPLATES, FOODS, HABITS, ROTATIONS, SLEEP_CHECKLIST } from "./data.js";
import { FASTING_PROTOCOLS, KG_PER_LB, ML_PER_OZ, addDays, dateKey, fromMin, isDayKey, isTime, toMin } from "./calc.js";

export const STORAGE_KEY = "still.v2";
const LEGACY_KEY = "still-state-v1"; // earlier web MVP
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function defaultState() {
  return {
    version: 2,
    onboarded: false,
    demo: false,
    lastBackup: null,
    settings: {
      wakeTime: "06:45",
      opportunityMin: 510, // 8h 30m sleep opportunity
      quietMin: 30, // thinking / reading time in bed before lights out
      rotation: "ppl",
      daysPerWeek: 4,
      units: "metric", // metric | imperial
      increment: 2.5, // kg, progressive-overload step
      repCeiling: 10,
      setsPerExercise: 3,
      proteinTarget: 180,
      bodyweight: null, // kg
      fasting: "18:6",
      eatStart: "12:00",
      showCalories: false,
      calorieTarget: 2400,
      showMicros: false,
      waterTarget: 830, // ml (~28 oz)
      pushupGoal: 300,
      squatGoal: 300,
      sounds: true,
      nightMode: "auto", // auto | off
    },
    sleep: [],
    checklist: {},
    train: { next: 0, templates: structuredClone(DEFAULT_TEMPLATES), active: null },
    sessions: [],
    bw: {},
    food: {},
    water: {},
    fastStart: {},
    customFoods: [],
    habits: {},
    mind: [],
    journal: [],
  };
}

/* ---------- typed coercion helpers ---------- */

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v, max, def = "") => (typeof v === "string" ? v.trim().slice(0, max) : def);
const bool = (v) => v === true;
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const time = (v, def = null) => (isTime(v) ? v : def);
function num(v, min, max, def = null) {
  if (v === null || v === "" || typeof v === "boolean") return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
const int = (v, min, max, def = null) => {
  const n = num(v, min, max, def);
  return n == null ? n : Math.round(n);
};
const ID_RE = /^[\w-]{1,48}$/;
export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).replace(/[^\w-]/g, "");
const id = (v) => (typeof v === "string" && ID_RE.test(v) ? v : uid());
const list = (v, max, fn) => (Array.isArray(v) ? v.slice(-max).map(fn).filter(Boolean) : []);
/** Map keyed by YYYY-MM-DD → sanitized values. Rejects every other key (incl. __proto__). */
function dayMap(v, fn, maxDays = 3660) {
  if (!isObj(v)) return {};
  const out = {};
  for (const k of Object.keys(v).filter(isDayKey).sort().slice(-maxDays)) {
    const val = fn(v[k]);
    if (val != null) out[k] = val;
  }
  return out;
}

const TAGS = new Set(FOODS.flatMap((f) => f.tags));
const FASTING_IDS = FASTING_PROTOCOLS.map((p) => p.id);
const MAX_KG = 1000;

function cleanSettings(s, d) {
  if (!isObj(s)) return d;
  return {
    wakeTime: time(s.wakeTime, d.wakeTime),
    opportunityMin: int(s.opportunityMin, 240, 720, d.opportunityMin),
    quietMin: int(s.quietMin, 0, 300, d.quietMin),
    rotation: oneOf(s.rotation, Object.keys(ROTATIONS), d.rotation),
    daysPerWeek: int(s.daysPerWeek, 1, 7, d.daysPerWeek),
    units: oneOf(s.units, ["metric", "imperial"], d.units),
    increment: num(s.increment, 0.25, 50, d.increment),
    repCeiling: int(s.repCeiling, 3, 30, d.repCeiling),
    setsPerExercise: int(s.setsPerExercise, 1, 10, d.setsPerExercise),
    proteinTarget: int(s.proteinTarget, 20, 500, d.proteinTarget),
    bodyweight: num(s.bodyweight, 20, 400, null),
    fasting: oneOf(s.fasting, FASTING_IDS, d.fasting),
    eatStart: time(s.eatStart, d.eatStart),
    showCalories: bool(s.showCalories),
    calorieTarget: int(s.calorieTarget, 800, 8000, d.calorieTarget),
    showMicros: bool(s.showMicros),
    waterTarget: num(s.waterTarget, 100, 5000, d.waterTarget),
    pushupGoal: int(s.pushupGoal, 0, 5000, d.pushupGoal),
    squatGoal: int(s.squatGoal, 0, 5000, d.squatGoal),
    sounds: s.sounds === undefined ? d.sounds : bool(s.sounds),
    nightMode: oneOf(s.nightMode, ["auto", "off"], d.nightMode),
  };
}

function cleanNight(e) {
  if (!isObj(e) || !isDayKey(e.date)) return null;
  const n = {
    id: id(e.id),
    date: e.date,
    t: num(e.t, 0, 1e15, 0),
    inBed: time(e.inBed),
    lightsOut: time(e.lightsOut),
    finalWake: time(e.finalWake),
    outOfBed: time(e.outOfBed),
    latency: int(e.latency, 0, 720, 0),
    wakeups: int(e.wakeups, 0, 50, 0),
    waso: int(e.waso, 0, 720, 0),
    asleep: int(e.asleep, 0, 1440, null),
    deep: int(e.deep, 0, 720, null),
    rem: int(e.rem, 0, 720, null),
    hrv: num(e.hrv, 5, 300, null),
    rhr: num(e.rhr, 25, 140, null),
  };
  return n.inBed && n.lightsOut && n.finalWake && n.outOfBed ? n : null;
}

/** Strict: an out-of-range set is invalid data and is dropped, never clamped into a fake value. */
const inRange = (v, min, max) => typeof v !== "boolean" && v !== null && v !== "" && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;
const cleanSet = (s) => {
  if (!isObj(s) || !inRange(s.r, 1, 1000) || !inRange(s.w ?? 0, 0, MAX_KG)) return null;
  return { w: Number(s.w ?? 0), r: Math.round(Number(s.r)) };
};
const cleanExercise = (x) => (isObj(x) && str(x.name, 40) ? { name: str(x.name, 40), sets: list(x.sets, 50, cleanSet) } : null);

function cleanSession(s) {
  if (!isObj(s) || !isDayKey(s.date)) return null;
  const kind = oneOf(s.kind, ["strength", "cardio", "circuit"], null);
  if (!kind) return null;
  const out = { id: id(s.id), date: s.date, t: num(s.t, 0, 1e15, 0), kind, name: str(s.name, 40, "Session") || "Session", minutes: int(s.minutes, 0, 1440, 0) };
  if (kind === "strength") out.exercises = list(s.exercises, 40, cleanExercise);
  if (kind === "cardio") out.sun = bool(s.sun);
  return out;
}

function cleanTemplates(v) {
  const out = structuredClone(DEFAULT_TEMPLATES);
  if (!isObj(v)) return out;
  for (const k of Object.keys(v).slice(0, 30)) {
    const name = str(k, 40);
    if (!name || !Array.isArray(v[k]) || name === "__proto__") continue;
    out[name] = [...new Set(v[k].map((x) => str(x, 40)).filter(Boolean))].slice(0, 30);
  }
  return out;
}

function cleanActive(a) {
  if (!isObj(a) || !str(a.name, 40)) return null;
  return { id: id(a.id), name: str(a.name, 40), startedAt: num(a.startedAt, 0, 1e15, Date.now()), exercises: list(a.exercises, 40, cleanExercise) };
}

function cleanFood(f) {
  if (!isObj(f) || !str(f.name, 40)) return null;
  return {
    id: id(f.id),
    name: str(f.name, 40),
    protein: num(f.protein, 0, 500, 0),
    kcal: num(f.kcal, 0, 10000, 0),
    tags: Array.isArray(f.tags) ? f.tags.filter((t) => TAGS.has(t)) : [],
    t: num(f.t, 0, 1e15, 0),
  };
}

const cleanCustomFood = (f) => {
  const c = cleanFood(f);
  return c && { ...c, id: typeof f.id === "string" && ID_RE.test(f.id) && f.id.startsWith("c-") ? f.id : `c-${uid()}`, portion: "custom" };
};

function cleanFlags(v, keys) {
  if (!isObj(v)) return null;
  const out = {};
  for (const k of keys) if (v[k] === true) out[k] = true;
  return out;
}

const cleanMind = (m) =>
  isObj(m) && isDayKey(m.date)
    ? { id: id(m.id), date: m.date, t: num(m.t, 0, 1e15, 0), kind: oneOf(m.kind, ["breath", "meditation"], "meditation"), preset: str(m.preset, 20, "silent"), minutes: int(m.minutes, 0, 600, 0) }
    : null;

const cleanJournal = (j) =>
  isObj(j) && isDayKey(j.date) && str(j.text, 4000) ? { id: id(j.id), date: j.date, t: num(j.t, 0, 1e15, 0), text: str(j.text, 4000) } : null;

/** Rebuilds a complete, well-typed state from anything. Never throws. */
export function sanitize(raw) {
  const d = defaultState();
  if (!isObj(raw)) return d;
  const byDate = new Map();
  for (const n of list(raw.sleep, 5000, cleanNight)) byDate.set(n.date, n); // one entry per night
  const train = isObj(raw.train) ? raw.train : {};
  const habitKeys = HABITS.map((h) => h.id);
  return {
    version: 2,
    onboarded: bool(raw.onboarded),
    demo: bool(raw.demo),
    lastBackup: num(raw.lastBackup, 0, 1e15, null),
    settings: cleanSettings(raw.settings, d.settings),
    sleep: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    checklist: cleanFlags(raw.checklist, SLEEP_CHECKLIST.map((c) => c.id)) || {},
    train: { next: int(train.next, 0, 100, 0), templates: cleanTemplates(train.templates), active: cleanActive(train.active) },
    sessions: list(raw.sessions, 10000, cleanSession),
    bw: dayMap(raw.bw, (v) => (isObj(v) ? { pushups: int(v.pushups, 0, 10000, 0), squats: int(v.squats, 0, 10000, 0) } : null)),
    food: dayMap(raw.food, (v) => (Array.isArray(v) ? list(v, 100, cleanFood) : null)),
    water: dayMap(raw.water, (v) => num(v, 0, 20000, null)),
    fastStart: dayMap(raw.fastStart, (v) => time(v), 60),
    customFoods: list(raw.customFoods, 12, cleanCustomFood),
    habits: dayMap(raw.habits, (v) => cleanFlags(v, habitKeys)),
    mind: list(raw.mind, 10000, cleanMind),
    journal: list(raw.journal, 5000, cleanJournal),
  };
}

/* ---------- persistence ---------- */

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitize(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const s = defaultState();
      const t = int(JSON.parse(legacy)?.nutrition?.proteinTarget, 20, 500, null);
      if (t) s.settings.proteinTarget = t;
      return s;
    }
  } catch (e) {
    console.warn("Still: saved data unreadable, starting fresh", e);
  }
  return defaultState();
}

/** Returns false when storage is unavailable or full. */
export function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Ask the browser not to evict our data (Safari/Chrome may otherwise clear it). */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return null;
  }
}

export function exportJSON(state) {
  return JSON.stringify({ app: "still", version: 2, exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importJSON(text) {
  if (text.length > MAX_IMPORT_BYTES) throw new Error("That file is too large to be a Still backup.");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const s = isObj(parsed) && parsed.app === "still" ? parsed.state : parsed;
  if (!isObj(s) || !isObj(s.settings) || !Array.isArray(s.sleep)) throw new Error("This file does not look like a Still backup.");
  return { ...sanitize(s), onboarded: true };
}

/* ---------- sample data (to explore the app) ---------- */

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleState(current) {
  const s = defaultState();
  s.settings = { ...current.settings };
  s.onboarded = true;
  s.demo = true;
  const r = rng(42);
  const today = dateKey();
  const now = Date.now();
  const jitter = (n) => Math.round((r() - 0.5) * 2 * n);
  const wake = toMin(s.settings.wakeTime);

  for (let i = 13; i >= 0; i--) {
    const fw = wake + jitter(12);
    const lo = wake - s.settings.opportunityMin + jitter(20);
    const rough = i === 3 || i === 4;
    s.sleep.push({
      id: `demo-s${i}`,
      date: addDays(today, -i),
      t: now - i * 864e5,
      inBed: fromMin(lo - s.settings.quietMin - Math.abs(jitter(10))),
      lightsOut: fromMin(lo + (rough ? 45 : 0)),
      latency: 8 + Math.round(r() * 15) + (rough ? 25 : 0),
      wakeups: Math.round(r() * 2) + (rough ? 2 : 0),
      waso: 10 + Math.round(r() * 20) + (rough ? 30 : 0),
      finalWake: fromMin(fw),
      outOfBed: fromMin(fw + 10 + Math.round(r() * 30)),
      asleep: null,
      deep: 55 + Math.round(r() * 35),
      rem: 85 + Math.round(r() * 35),
      hrv: Math.round(58 + jitter(7) - (rough ? 9 : 0) + (i < 2 ? 3 : 0)),
      rhr: Math.round(52 + jitter(2) + (rough ? 4 : 0)),
    });
  }

  const start = { "Bench press": 80, "Overhead press": 50, "Incline dumbbell press": 30, "Lateral raise": 12, "Triceps pushdown": 35, "Barbell row": 70, "Face pull": 20, "Biceps curl": 16, "Back squat": 100, "Romanian deadlift": 90, "Leg press": 160, "Calf raise": 60 };
  const days = ROTATIONS.ppl.days;
  let k = 0;
  for (let i = 13; i >= 1; i--) {
    const date = addDays(today, -i);
    const t = now - i * 864e5;
    if ([13, 12, 10, 9, 7, 6, 4, 2, 1].includes(i)) {
      const name = days[k % 3];
      const bump = Math.floor(k / 3) * 2.5;
      s.sessions.push({
        id: `demo-t${i}`, date, t, kind: "strength", name, minutes: 45 + Math.round(r() * 20),
        exercises: s.train.templates[name].map((ex) => {
          const w = start[ex] ? start[ex] + (start[ex] >= 50 ? bump : 0) : 0;
          return { name: ex, sets: [0, 1, 2].map((j) => ({ w, r: Math.max(5, 9 - j - Math.round(r() * 2)) })) };
        }),
      });
      k++;
    }
    if (i % 2 === 0) s.sessions.push({ id: `demo-w${i}`, date, t: t + 1, kind: "cardio", name: "Walk", minutes: 75, sun: true });
    s.habits[date] = cleanFlags({ water: r() > 0.2, sun: i % 2 === 0, cold: r() > 0.6 }, ["water", "sun", "cold"]);
    s.mind.push({ id: `demo-m${i}`, date, t, kind: "meditation", preset: "silent", minutes: 20 });
  }
  s.train.next = k % 3;
  s.food[today] = [
    { id: "demo-f1", name: "Eggs", protein: 19, kcal: 215, tags: ["vitd"], t: now - 3 * 36e5 },
    { id: "demo-f2", name: "Salmon", protein: 34, kcal: 310, tags: ["seafood", "vitd"], t: now - 2 * 36e5 },
    { id: "demo-f3", name: "Greens", protein: 4, kcal: 40, tags: ["greens"], t: now - 2 * 36e5 },
  ];
  s.water[today] = 500;
  s.journal.push({ id: "demo-j1", date: addDays(today, -1), t: now - 864e5, text: "Long quiet hour before sleep. The pricing idea finally came together." });
  return sanitize(s);
}

export const unitDefaults = (units) =>
  units === "imperial" ? { increment: 5 * KG_PER_LB, waterTarget: 28 * ML_PER_OZ } : { increment: 2.5, waterTarget: 830 };
