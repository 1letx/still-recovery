import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDayKey, isTime, addDays, bedtimePlan, diaryMetrics, fastingState, fmtDur, isNight, parseDuration, recovery,
  sleepTrend, span, suggestNext, validateDiary, weekStart, weekSummary, proteinRange,
} from "../public/js/calc.js";

const night = (date, extra = {}) => ({
  date, inBed: "22:00", lightsOut: "22:30", latency: 15, waso: 15, finalWake: "06:30", outOfBed: "07:00", ...extra,
});

test("span crosses midnight", () => {
  assert.equal(span("22:30", "06:30"), 480);
  assert.equal(span("01:00", "07:00"), 360);
  assert.equal(span("07:00", "07:00"), 0);
});

test("formatting and parsing", () => {
  assert.equal(fmtDur(462), "7h 42m");
  assert.equal(fmtDur(45), "45m");
  assert.equal(parseDuration("7:42"), 462);
  assert.equal(parseDuration("90"), 90);
  assert.equal(parseDuration(""), null);
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(weekStart("2026-11-16"), "2026-11-16"); // Monday
  assert.equal(weekStart("2026-11-22"), "2026-11-16"); // Sunday
});

test("diary metrics: quiet time in bed is not counted against efficiency", () => {
  const m = diaryMetrics(night("2026-11-16"));
  assert.equal(m.tib, 540); // 9h in bed
  assert.equal(m.opportunity, 480); // 8h lights-out → wake
  assert.equal(m.sleep, 450); // 8h − 15 − 15
  assert.equal(m.efficiency, 94); // 450/480
  assert.equal(m.clinicalEfficiency, 83); // 450/540
  assert.equal(m.quietTime, 60);
});

test("11–12 h in bed with long thinking time still reads as efficient sleep", () => {
  const m = diaryMetrics(night("2026-11-16", { inBed: "20:00", lightsOut: "22:00", finalWake: "06:00", outOfBed: "08:00", latency: 10, waso: 20 }));
  assert.equal(m.tib, 720);
  assert.equal(m.efficiency, 94);
  assert.equal(m.quietTime, 240);
});

test("watch 'asleep' overrides diary math but is capped at opportunity", () => {
  assert.equal(diaryMetrics(night("d", { asleep: 400 })).sleep, 400);
  assert.equal(diaryMetrics(night("d", { asleep: 999 })).sleep, 480);
});

test("diary validation catches out-of-order times", () => {
  const d = "2026-11-16";
  assert.deepEqual(validateDiary(night(d), d), []);
  assert.ok(validateDiary(night(d, { finalWake: "07:30" })).length); // after out of bed
  assert.ok(validateDiary(night(d, { lightsOut: "" })).length);
  assert.ok(validateDiary(night(d, { latency: 300, waso: 300 })).length);
  assert.ok(validateDiary(night(d, { lightsOut: "06:30" })).length); // zero opportunity
  assert.ok(validateDiary(night("2026-02-30")).length); // not a real date
  assert.ok(validateDiary(night("2026-11-17"), d).length); // future
  assert.ok(validateDiary(night(d, { inBed: "25:00" })).length);
});

test("recovery needs a check-in and a baseline", () => {
  assert.equal(recovery([], "2026-11-16").reason, "no-checkin");
  const only = recovery([night("2026-11-16", { hrv: 60, rhr: 50 })], "2026-11-16");
  assert.equal(only.status, "Ready"); // sleep signal only (7h30m)
  assert.equal(only.signals.find((s) => s.key === "hrv").points, null); // building
});

function history(recent) {
  const out = [];
  for (let i = 16; i >= 3; i--) out.push(night(addDays("2026-11-16", -i), { hrv: 60, rhr: 50 }));
  for (let i = 2; i >= 0; i--) out.push(night(addDays("2026-11-16", -i), recent));
  return out;
}

test("recovery: stable trend → Ready", () => {
  assert.equal(recovery(history({ hrv: 61, rhr: 50 }), "2026-11-16").status, "Ready");
});

test("recovery: HRV down, RHR up, short sleep → Rest", () => {
  const r = recovery(history({ hrv: 48, rhr: 57, lightsOut: "01:00", inBed: "00:45" }), "2026-11-16");
  assert.equal(r.status, "Rest");
});

test("recovery: moderate dip → Easy", () => {
  const r = recovery(history({ hrv: 56, rhr: 53 }), "2026-11-16");
  assert.equal(r.status, "Easy");
});

test("recovery: one bad night is softened by the 3-day trend", () => {
  const h = history({ hrv: 60, rhr: 50 });
  h[h.length - 1].hrv = 50; // −17% single night
  const r = recovery(h, "2026-11-16");
  assert.notEqual(r.status, "Rest");
});

test("bedtime plan anchors on fixed wake time", () => {
  const p = bedtimePlan({ wakeTime: "06:45", opportunityMin: 510, quietMin: 30 }, [], "2026-11-16");
  assert.equal(p.lightsOut, "22:15");
  assert.equal(p.inBed, "21:45");
  assert.equal(p.tibMin, 540);
});

test("sleep trend consistency handles lights-out across midnight", () => {
  const entries = [
    night("2026-11-14", { inBed: "23:30", lightsOut: "23:50" }),
    night("2026-11-15", { inBed: "23:50", lightsOut: "00:10" }),
  ];
  const t = sleepTrend(entries, "2026-11-16", 14);
  assert.equal(t.count, 2);
  assert.ok(t.lightsOutSd < 20); // 23:50 vs 00:10 is 20 min apart, not 23 h
});

test("isNight window wraps midnight", () => {
  const s = { wakeTime: "06:45", opportunityMin: 510, quietMin: 30 };
  const at = (h, m) => new Date(2026, 10, 16, h, m);
  assert.equal(isNight(s, at(21, 0)), true); // 1h before in-bed 21:45 → 20:45
  assert.equal(isNight(s, at(3, 0)), true);
  assert.equal(isNight(s, at(12, 0)), false);
});

test("fasting window: open, closed, crossing midnight, off", () => {
  const at = (h, m) => new Date(2026, 10, 16, h, m);
  const open = fastingState(at(14, 0), "12:00", 6);
  assert.equal(open.mode, "open");
  assert.equal(Math.round(open.remaining), 240);
  assert.equal(open.closesAt, "18:00");
  const closed = fastingState(at(20, 0), "12:00", 6);
  assert.equal(closed.mode, "fasting");
  assert.equal(Math.round(closed.fasted), 120);
  assert.equal(Math.round(closed.untilOpen), 960);
  const morning = fastingState(at(8, 0), "12:00", 6);
  assert.equal(Math.round(morning.fasted), 840); // since 18:00 yesterday
  const late = fastingState(at(0, 30), "20:00", 6); // window 20:00–02:00
  assert.equal(late.mode, "open");
  assert.equal(Math.round(late.remaining), 90);
  assert.equal(fastingState(at(9, 0), "12:00", 0).mode, "off");
});

test("progressive overload: double progression", () => {
  assert.deepEqual(suggestNext([{ w: 80, r: 8 }, { w: 80, r: 7 }], 2.5, 10).text, "80 × 9");
  assert.equal(suggestNext([{ w: 80, r: 10 }, { w: 80, r: 10 }], 2.5, 10).text, "82.5 × 6");
  assert.equal(suggestNext([{ w: 0, r: 8 }], 2.5, 10).text, "9 reps");
  assert.equal(suggestNext([], 2.5, 10), null);
});

test("week summary counts strength sessions and volume", () => {
  const sessions = [
    { date: "2026-11-16", kind: "strength", exercises: [{ name: "Bench", sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }] },
    { date: "2026-11-17", kind: "cardio", minutes: 45 },
    { date: "2026-11-15", kind: "strength", exercises: [] }, // previous week
  ];
  const w = weekSummary(sessions, "2026-11-18");
  assert.equal(w.strength, 1);
  assert.equal(w.volume, 1000);
  assert.equal(w.minutes, 45);
});

test("protein range follows ISSN 1.4–2.0 g/kg", () => {
  assert.deepEqual(proteinRange(80), { low: 112, high: 160 });
  assert.equal(proteinRange(null), null);
});

test("strict time and date parsing", () => {
  assert.equal(isTime("23:59"), true);
  assert.equal(isTime("24:00"), false);
  assert.equal(isTime("7:00"), false);
  assert.equal(isDayKey("2026-02-28"), true);
  assert.equal(isDayKey("2026-02-30"), false);
  assert.equal(isDayKey("__proto__"), false);
});

import { trainingDay, usualNight, median } from "../public/js/calc.js";

const lift = (date) => ({ kind: "strength", date });

test("training scheduler: rest after lifting when the week still fits (4 days/week)", () => {
  // Tue 2026-11-17, lifted Mon
  const r = trainingDay({ sessions: [lift("2026-11-16")], todayKey: "2026-11-17", daysPerWeek: 4 });
  assert.equal(r.train, false);
  assert.equal(r.reason, "spacing");
});

test("training scheduler: must train when remaining lifts ≥ days left", () => {
  // Fri 2026-11-20, only 1 lift so far, 3 remaining, 3 days left
  const r = trainingDay({ sessions: [lift("2026-11-19")], todayKey: "2026-11-20", daysPerWeek: 4 });
  assert.equal(r.train, true);
  assert.equal(r.reason, "needed");
});

test("training scheduler: week complete, done today, recovery rest", () => {
  const four = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"].map(lift);
  assert.equal(trainingDay({ sessions: four, todayKey: "2026-11-20", daysPerWeek: 4 }).reason, "week-complete");
  assert.equal(trainingDay({ sessions: [lift("2026-11-18")], todayKey: "2026-11-18", daysPerWeek: 4 }).reason, "done");
  assert.equal(trainingDay({ sessions: [], todayKey: "2026-11-18", daysPerWeek: 4, recoveryStatus: "Rest" }).reason, "recovery");
});

test("training scheduler: 5–6 days/week allows back-to-back", () => {
  const r = trainingDay({ sessions: [lift("2026-11-16")], todayKey: "2026-11-17", daysPerWeek: 6 });
  assert.equal(r.train, true);
});

test("usual night uses recent medians, survives midnight, falls back to plan", () => {
  const plan = { inBed: "21:45", lightsOut: "22:15", wake: "06:45" };
  assert.equal(usualNight([], plan, "2026-11-16").basis, "plan");
  const entries = [
    night("2026-11-13", { lightsOut: "23:50", inBed: "23:30" }),
    night("2026-11-14", { lightsOut: "00:10", inBed: "23:40" }),
    night("2026-11-15", { lightsOut: "00:00", inBed: "23:35" }),
  ];
  const u = usualNight(entries, plan, "2026-11-16");
  assert.equal(u.lightsOut, "00:00");
  assert.equal(u.inBed, "23:35");
  assert.equal(u.basis, "recent");
  assert.equal(median([3, 1, 2, 10]), 2.5);
});
