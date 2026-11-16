// Still — quiet recovery. App shell: state, screens, actions.
import {
  FASTING_PROTOCOLS, KG_PER_LB, ML_PER_OZ, RECOVERY_ADVICE, addDays, bedtimePlan, consistencyLabel, dateKey,
  dayTotals, diaryMetrics, fastingState, fmtClock, fmtDur, fromMin, isNight, lastPerformance, parseDuration,
  isDayKey, isTime, parseKey, proteinRange, recovery, sessionVolume, sleepTrend, suggestNext, toMin, trainingDay, usualNight,
  validateDiary, weekStart, weekSummary,
} from "./calc.js";
import { BREATH_PRESETS, FOODS, HABITS, MEDITATION_LENGTHS, PRINCIPLES, ROTATIONS, SLEEP_CHECKLIST, SOURCES } from "./data.js";
import { html } from "./html.js";
import { defaultState, exportJSON, importJSON, load, requestPersistence, sampleState, sanitize, save, STORAGE_KEY, uid, unitDefaults } from "./store.js";
import { closeSheet, confirmDialog, openSheet, setHTML, sheetOpen, toast } from "./ui.js";

const VERSION = "1.2.0";
const SCREENS = ["today", "sleep", "train", "eat", "you"];
const $ = (sel, root = document) => root.querySelector(sel);
const main = $("#content");
const overlay = $("#session");

let state = load();
let screen = "today";
let persisted = null; // navigator.storage.persisted()
let pendingAnchor = null;
let moreFoodsOpen = false;
let showFullAtNight = false; // user chose to see the full day during wind-down
const drafts = new Map(); // unsaved set inputs per exercise index → { w, r } (display units)
const expanded = new Set(); // finished exercises the user reopened for an extra set
let focusEx = null; // exercise the user chose to do next (index)

/* ---------- formatting ---------- */

const today = () => dateKey();
const S = () => state.settings;
const imperial = () => S().units === "imperial";
const wUnit = () => (imperial() ? "lb" : "kg");
const round1 = (n) => Math.round(n * 10) / 10;
const wOut = (kg) => (kg == null ? "" : round1(imperial() ? kg / KG_PER_LB : kg));
const wIn = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? (imperial() ? n * KG_PER_LB : n) : null;
};
const fmtSet = (s) => (s.w ? `${wOut(s.w)} × ${s.r}` : `BW × ${s.r}`);
const fmtVol = (kg) => {
  const v = imperial() ? kg / KG_PER_LB : kg;
  return v >= 10000 ? `${round1(v / 1000)}k` : `${Math.round(v)}`;
};
const waterOut = (ml) => (imperial() ? `${Math.round(ml / ML_PER_OZ)} oz` : `${Math.round(ml)} ml`);
const dayLabel = (key) =>
  key === today() ? "Today" : key === addDays(today(), -1) ? "Yesterday" : parseKey(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const narrowDay = (key) => parseKey(key).toLocaleDateString(undefined, { weekday: "narrow" });
const clock = (t) => new Date(t).toTimeString().slice(0, 5);
const nowHHMM = () => {
  const d = new Date();
  return fromMin(d.getHours() * 60 + d.getMinutes());
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- derived state ---------- */

const sleepEntry = (key) => state.sleep.find((e) => e.date === key);
const rec = (key = today()) => recovery(state.sleep, key);
const plan = () => bedtimePlan(S(), state.sleep, today());
const rotationDays = () => ROTATIONS[S().rotation].days;
const plannedDay = () => rotationDays()[state.train.next % rotationDays().length];
const template = (name) => (Object.hasOwn(state.train.templates, name) ? state.train.templates[name] : null);
const foodToday = () => state.food[today()] ?? [];
const protocol = () => FASTING_PROTOCOLS.find((p) => p.id === S().fasting) ?? FASTING_PROTOCOLS[0];
const fast = () => fastingState(new Date(), state.fastStart[today()] ?? S().eatStart, protocol().hours);
const habitsToday = () => state.habits[today()] ?? {};
const bwToday = () => state.bw[today()] ?? { pushups: 0, squats: 0 };
const nightActive = () => S().nightMode === "auto" && isNight(S());

/* ---------- persistence ---------- */

function commit() {
  if (!save(state)) toast("Storage is full or blocked. Changes may not be saved.");
  render();
}

/** Applies a change that can be undone from the toast. */
function withUndo(message, mutate) {
  const before = structuredClone(state);
  mutate();
  commit();
  toast(message, {
    undo: () => {
      state = before;
      commit();
    },
  });
}

/* ---------- small components ---------- */

const bar = (pct, label) =>
  html`<div class="bar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.max(0, Math.min(100, pct)))}"><div class="bar-fill" data-w="${pct}"></div></div>`;

const close = (label = "Close") => html`<button type="button" class="link" data-action="close-sheet">${label}</button>`;

function sleepBars(nights, n, endKey = today()) {
  const max = Math.max(600, ...nights.map((x) => x.m.tib));
  const byDate = new Map(nights.map((x) => [x.date, x]));
  const cells = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = addDays(endKey, -i);
    const x = byDate.get(k);
    if (!x || !x.m.opportunity) {
      cells.push(html`<div class="sb empty" title="${dayLabel(k)}: no entry"></div>`);
      continue;
    }
    const o = (x.m.opportunity / max) * 100;
    cells.push(
      html`<div class="sb${k === endKey ? " last" : ""}" title="${dayLabel(k)}: ${fmtDur(x.m.sleep)} asleep of ${fmtDur(x.m.opportunity)} · ${x.m.efficiency}%"><div class="sb-opp" data-h="${o}"><div class="sb-sleep" data-h="${(x.m.sleep / x.m.opportunity) * 100}"></div></div></div>`
    );
  }
  const summary = `Last ${n} nights: ${nights.length} logged`;
  return html`<div class="sleep-bars" role="img" aria-label="${summary}">${cells}</div>`;
}

function recoveryDots(endKey = today()) {
  const dots = [];
  for (let i = 6; i >= 0; i--) {
    const k = addDays(endKey, -i);
    const r = rec(k);
    dots.push(html`<div class="rdot-wrap"><span class="rdot ${r.status ? r.status.toLowerCase() : "none"}" title="${dayLabel(k)}: ${r.status || "no data"}"></span><span class="tiny" aria-hidden="true">${narrowDay(k)}</span><span class="sr-only">${dayLabel(k)}: ${r.status || "no data"}</span></div>`);
  }
  return html`<div class="rdots">${dots}</div>`;
}

/* ---------- screens ---------- */

const trainInfo = () =>
  trainingDay({ sessions: state.sessions, todayKey: today(), daysPerWeek: S().daysPerWeek, recoveryStatus: rec().status });

const REST_TEXT = {
  done: "Done today. Recover well.",
  "week-complete": "Week complete. Walk, mobility or rest.",
  recovery: "Recovery says rest. Walk, mobility or breathe.",
  spacing: "Rest day. Lifting resumes tomorrow.",
};

const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** The one thing worth doing right now — or nothing at all. */
function nextAction({ entry, t, f, remaining, p }) {
  const a = state.train.active;
  if (a) {
    return html`<section class="card next"><h2 class="label">Now</h2><p class="lead">${a.name} in progress</p><a class="primary" href="#train">Continue session</a></section>`;
  }
  if (!entry) {
    const u = usualNight(state.sleep, p, today());
    return html`<section class="card next">
      <h2 class="label">${minutesNow() < 12 * 60 ? "Good morning" : "Last night"}</h2>
      <p class="lead">Log your night in one tap.</p>
      <p class="muted small">${u.basis === "recent" ? "Your usual" : "Your plan"}: in bed ${u.inBed} · lights out ${u.lightsOut} · wake ${u.finalWake}</p>
      <button class="primary" data-action="log-usual">Log ${u.basis === "recent" ? "usual night" : "night as planned"}</button>
      <button class="ghost" data-action="diary">It was different</button>
    </section>`;
  }
  const day = plannedDay();
  if (t.train && minutesNow() < toMin(p.inBed) - 120) {
    return html`<section class="card next">
      <h2 class="label">Now · ${day}</h2>
      <p class="muted">${template(day).join(" · ")}</p>
      <button class="primary" data-action="start-workout" data-name="${day}">Start ${day}</button>
    </section>`;
  }
  if (f.mode === "open" && remaining > 0) {
    return html`<section class="card next">
      <h2 class="label">Now · eating window open</h2>
      <p class="lead">${remaining} g protein to go</p>
      <p class="muted small">Window closes ${f.closesAt} (${fmtClock(f.remaining)} left)</p>
      <a class="primary" href="#eat">Log food</a>
    </section>`;
  }
  return html`<section class="card next quiet">
    <h2 class="label">Now</h2>
    <p class="lead">Nothing needs you right now.</p>
    <p class="muted small">Wind-down starts ${fromMin(toMin(p.inBed) - 60)}. Lights out ${p.lightsOut}.</p>
  </section>`;
}

/** Today's system as a quiet checklist that ticks itself off. */
function dayPlan({ entry, m, t, f, totals, p }) {
  const bw = bwToday();
  const mind = state.mind.filter((x) => x.date === today()).reduce((sum, x) => sum + x.minutes, 0);
  const day = plannedDay();
  const doneToday = state.sessions.filter((x) => x.date === today() && x.kind === "strength");
  const proteinMet = totals.protein >= S().proteinTarget;
  const volumeGoal = S().pushupGoal + S().squatGoal > 0;
  const volumeMet = bw.pushups >= S().pushupGoal && bw.squats >= S().squatGoal;

  const row = (done, label, value, attrs) => html`<li>${attrs.href
    ? html`<a class="plan-row" href="${attrs.href}">`
    : html`<button class="plan-row" data-action="${attrs.action}">`}<span class="plan-dot${done === true ? " done" : done === "rest" ? " rest" : ""}" aria-hidden="true"></span><span class="plan-label">${label}</span><span class="plan-val">${value}</span><span class="sr-only">${done === true ? "(done)" : ""}</span>${attrs.href ? html`</a>` : html`</button>`}</li>`;

  const trainVal = doneToday.length
    ? doneToday.map((x) => x.name).join(" + ")
    : t.train
      ? `${day} · planned`
      : REST_TEXT[t.reason].split(".")[0];

  return html`<section class="card">
    <h2 class="label">Today's plan</h2>
    <ul class="plan">
      ${row(!!entry, "Check-in", m ? `${fmtDur(m.sleep)} · ${m.efficiency}%` : "Not yet", entry ? { href: "#sleep" } : { action: "diary" })}
      ${row(doneToday.length ? true : t.train ? false : "rest", "Training", trainVal, { href: "#train" })}
      ${f.mode !== "off" && row(f.mode === "fasting" && minutesNow() > toMin(f.closesAt) ? true : false, "Eating window", `${f.opensAt}–${f.closesAt} · ${f.mode === "open" ? "open" : "closed"}`, { href: "#eat" })}
      ${row(proteinMet, "Protein", `${totals.protein} / ${S().proteinTarget} g`, { href: "#eat" })}
      ${volumeGoal && row(volumeMet, "Morning volume", `${bw.pushups + bw.squats} / ${S().pushupGoal + S().squatGoal}`, { href: "#train" })}
      ${row(mind > 0, "Breathe or sit", mind ? `${mind} min` : "5 min", { action: "meditate-pick" })}
      ${row(false, "Lights out", `${p.lightsOut} · in bed ${p.inBed}`, { href: "#sleep" })}
    </ul>
  </section>`;
}

function weekLine() {
  const ws = weekStart(today());
  const wk = weekSummary(state.sessions, today());
  const days = [];
  for (let k = ws; k <= today(); k = addDays(k, 1)) days.push(k);
  const proteinDays = days.filter((k) => dayTotals(state.food[k]).protein >= S().proteinTarget).length;
  const t7 = sleepTrend(state.sleep, today(), 7);
  const parts = [`${wk.strength}/${S().daysPerWeek} lifting days`, `protein ${proteinDays}/${days.length} days`];
  if (t7.wakeSd != null) parts.push(`wake ±${Math.round(t7.wakeSd)} min`);
  return html`<p class="foot">This week · ${parts.join(" · ")}</p>`;
}

function renderNight() {
  const p = plan();
  const early = minutesNow() < 12 * 60; // after midnight, before wake
  return html`
    <section class="card night-card">
      <h2 class="label">${early ? "Still night" : "Wind-down"}</h2>
      <div class="big">${p.lightsOut}</div>
      <p class="muted">Lights out · in bed from ${p.inBed} · wake ${p.wake}</p>
      <p class="lead mt-s">Nothing here needs you tonight.</p>
    </section>
    <button class="ghost" data-action="breathe" data-preset="478" data-min="5">4-7-8 breathing · 5 min</button>
    <button class="ghost" data-action="awake">Awake in bed and it's effort?</button>
    ${early && !sleepEntry(today()) && html`<button class="ghost" data-action="log-usual">Up already? Log the night</button>`}
    <p class="foot"><button class="link" data-action="night-full">Show the full day</button></p>`;
}

function renderToday() {
  if (nightActive() && !showFullAtNight) return renderNight();
  const entry = sleepEntry(today());
  const m = entry && diaryMetrics(entry);
  const r = rec();
  const p = plan();
  const totals = dayTotals(foodToday());
  const remaining = Math.max(0, S().proteinTarget - totals.protein);
  const f = fast();
  const t = trainInfo();
  const t7 = sleepTrend(state.sleep, today(), 7);
  const h = habitsToday();

  return html`
    ${state.demo && html`<div class="banner">Sample data · erase it in You → Data</div>`}
    <div class="trio">
      <a class="tile" href="#sleep">
        <span class="label">Sleep</span>
        <span class="tile-num">${m ? fmtDur(m.sleep) : "—"}</span>
        <span class="tiny muted">${m ? `${m.efficiency}% · 7-day ${t7.count >= 3 ? fmtDur(t7.avgSleep) : "—"}` : "Not logged"}</span>
      </a>
      <button class="tile" data-action="explain-recovery">
        <span class="label">Recovery</span>
        <span class="tile-num status ${r.status ? r.status.toLowerCase() : "none"}">${r.status || "—"}</span>
        <span class="tiny muted">${r.status ? "3-day trend" : r.reason === "no-checkin" ? "After check-in" : "Building"}</span>
      </button>
      <a class="tile" href="#eat">
        <span class="label">Protein</span>
        <span class="tile-num">${remaining}<span class="unit">g</span></span>
        <span class="tiny muted">${remaining ? "left today" : "target met"}</span>
      </a>
    </div>
    ${nextAction({ entry, t, f, remaining, p })}
    ${dayPlan({ entry, m, t, f, totals, p })}
    <section class="card">
      <h2 class="label">Anchors</h2>
      <div class="chips">
        ${HABITS.map((x) => html`<button class="chip${h[x.id] ? " on" : ""}" data-action="habit" data-id="${x.id}" aria-pressed="${!!h[x.id]}">${x.label}</button>`)}
      </div>
    </section>
    <button class="ghost" data-action="breathe" data-preset="exhale" data-min="5">Breathe · 5 min</button>
    ${weekLine()}`;
}

function renderSleep() {
  const e = sleepEntry(today());
  const m = e && diaryMetrics(e);
  const t14 = sleepTrend(state.sleep, today(), 14);
  const p = plan();
  const recent = state.sleep.slice(-14).reverse();

  const last = m
    ? html`<section class="card">
        <div class="row"><h2 class="label">Last night</h2><button class="link" data-action="diary" data-date="${e.date}">Edit</button></div>
        <div class="big">${fmtDur(m.opportunity)}</div>
        <div class="muted">Sleep opportunity · lights out ${e.lightsOut} → wake ${e.finalWake}</div>
        <dl class="stats">
          <div><dt>Asleep</dt><dd>${fmtDur(m.sleep)}${m.source === "watch" ? " (Watch)" : ""}</dd></div>
          <div><dt>Efficiency</dt><dd>${m.efficiency}%</dd></div>
          <div><dt>Time in bed</dt><dd>${fmtDur(m.tib)}</dd></div>
          <div><dt>Quiet time in bed</dt><dd>${fmtDur(m.quietTime)}</dd></div>
          ${m.source === "diary" && html`<div><dt>Fell asleep after</dt><dd>${m.latency} min</dd></div><div><dt>Awake in night</dt><dd>${m.waso} min · ${e.wakeups}×</dd></div>`}
          ${e.deep != null && html`<div><dt>Deep</dt><dd>${fmtDur(e.deep)}</dd></div>`}
          ${e.rem != null && html`<div><dt>REM</dt><dd>${fmtDur(e.rem)}</dd></div>`}
        </dl>
        <p class="tiny muted">Time in bed is not failure. Quiet thinking time isn't counted against efficiency.${(e.deep != null || e.rem != null) && " Stage numbers are wearable estimates; read them as trends only."}</p>
      </section>`
    : html`<section class="card"><h2 class="label">Last night</h2><p class="muted">Not logged yet.</p><button class="primary" data-action="diary">Log last night</button></section>`;

  return html`
    ${last}
    ${t14.count > 0 && html`<section class="card">
        <h2 class="label">14 nights · opportunity vs sleep</h2>
        ${sleepBars(t14.nights, 14)}
        <div class="legend tiny muted" aria-hidden="true"><span><i class="key opp"></i>Opportunity</span><span><i class="key slp"></i>Asleep</span></div>
        <dl class="stats">
          <div><dt>Average sleep</dt><dd>${fmtDur(t14.avgSleep)}</dd></div>
          <div><dt>Average efficiency</dt><dd>${Math.round(t14.avgEfficiency)}%</dd></div>
          <div><dt>Wake time</dt><dd>${consistencyLabel(t14.wakeSd)}${t14.wakeSd != null ? ` · ±${Math.round(t14.wakeSd)} min` : ""}</dd></div>
          <div><dt>Lights out</dt><dd>${consistencyLabel(t14.lightsOutSd)}${t14.lightsOutSd != null ? ` · ±${Math.round(t14.lightsOutSd)} min` : ""}</dd></div>
        </dl>
      </section>`}
    <section class="card">
      <h2 class="label">Tonight</h2>
      <div class="mid">${p.lightsOut}</div>
      <div class="muted">Lights out · in bed from ${p.inBed} · wake ${p.wake}</div>
      <p class="small">${p.note}</p>
      <button class="link" data-action="settings" data-anchor="set-sleep">Change wake time or window</button>
    </section>
    <section class="card">
      <h2 class="label">Stimulus control</h2>
      <p class="muted">Awake in bed for more than ~20 minutes and it feels like effort, not useful thinking? Get up, keep the light low, return when sleepy.</p>
      <button class="ghost" data-action="awake">Start 20-minute low-light timer</button>
    </section>
    <section class="card">
      <h2 class="label">Wind-down</h2>
      <div class="row-btns">
        <button class="ghost" data-action="breathe" data-preset="478" data-min="5">4-7-8 · 5 min</button>
        <button class="ghost" data-action="breathe" data-preset="exhale" data-min="10">Longer exhale · 10 min</button>
      </div>
    </section>
    <section class="card">
      <h2 class="label">Bedroom · one-time setup</h2>
      <div class="checklist">
        ${SLEEP_CHECKLIST.map((c) => html`<label class="check"><input type="checkbox" name="check-${c.id}" data-action="checklist" data-id="${c.id}"${state.checklist[c.id] ? html` checked` : ""}><span>${c.label}</span></label>`)}
      </div>
    </section>
    ${recent.length > 0 && html`<section class="card">
        <h2 class="label">Diary</h2>
        <ul class="list">${recent.map((x) => {
          const mm = diaryMetrics(x);
          return html`<li><button class="li-btn" data-action="diary" data-date="${x.date}"><span>${dayLabel(x.date)}</span><span class="muted">${fmtDur(mm.sleep)} · ${mm.efficiency}%</span></button></li>`;
        })}</ul>
        <button class="link" data-action="diary" data-date="${addDays(recent[recent.length - 1].date, -1)}">Add an earlier night</button>
      </section>`}`;
}

/** Index of the exercise to work on now: the user's pick, else the first unfinished one. */
function currentExercise(a) {
  const open = (i) => a.exercises[i] && (a.exercises[i].sets.length < S().setsPerExercise || expanded.has(i));
  if (focusEx != null && open(focusEx)) return focusEx;
  return a.exercises.findIndex((_, i) => open(i));
}

function exerciseBlock(ex, i, current) {
  const last = lastPerformance(state.sessions, ex.name);
  const next = last && suggestNext(last.sets, S().increment, S().repCeiling);
  const target = S().setsPerExercise;
  const complete = ex.sets.length >= target && !expanded.has(i);
  const base = ex.sets.at(-1) ?? next ?? null;
  const draft = drafts.get(i);
  const w = draft?.w ?? (base ? String(wOut(base.w)) : "");
  const r = draft?.r ?? (base ? String(base.r) : "");
  const progress = ex.sets.length >= target ? `${ex.sets.length} sets ✓` : `Set ${ex.sets.length + 1} of ${target}`;
  const hint = last
    ? html`Last: ${last.sets.map(fmtSet).join(", ")}${next && html` · <span class="hi">Next: ${next.w ? `${wOut(next.w)} × ${next.r}` : `BW × ${next.r}`}</span>`}`
    : "First time: pick a weight you could lift 3 more times.";

  if (!complete && i !== current) {
    return html`<div class="exercise upcoming">
      <button class="li-btn" data-action="focus-ex" data-i="${i}" aria-label="Work on ${ex.name} now">
        <span><span class="ex-name">${ex.name}</span><br><span class="tiny muted">${next ? `Next: ${next.w ? `${wOut(next.w)} × ${next.r}` : `BW × ${next.r}`}` : "First time"}</span></span>
        <span class="tiny muted">${progress}</span>
      </button>
      ${ex.sets.length > 0 && html`<div class="sets">${ex.sets.map((s) => html`<span class="set">${fmtSet(s)}</span>`)}</div>`}
    </div>`;
  }

  return html`<div class="exercise${complete ? " complete" : " current"}">
    <div class="row"><h3 class="ex-name">${ex.name}</h3><span class="tiny muted">${progress}</span></div>
    ${!complete && html`<div class="tiny muted">${hint}</div>`}
    ${ex.sets.length > 0 && html`<div class="sets">${ex.sets.map((s, j) => html`<button class="set" data-action="remove-set" data-i="${i}" data-j="${j}" aria-label="Remove set ${j + 1}: ${fmtSet(s)}">${fmtSet(s)}</button>`)}</div>`}
    ${complete
      ? html`<div class="row"><button class="link" data-action="extra-set" data-i="${i}">+ Another set</button><button class="link muted" data-action="remove-exercise" data-i="${i}" aria-label="Remove ${ex.name}">Remove</button></div>`
      : html`<form class="set-form" data-form="set" data-i="${i}">
          <div class="steppers">
            <div class="stepper">
              <button type="button" class="step" data-action="step" data-i="${i}" data-f="w" data-d="-1" aria-label="Less weight">−</button>
              <label class="step-field"><input name="w" inputmode="decimal" autocomplete="off" placeholder="0" value="${w}" aria-label="${ex.name} weight in ${wUnit()}, 0 for bodyweight"><span class="step-unit">${wUnit()}</span></label>
              <button type="button" class="step" data-action="step" data-i="${i}" data-f="w" data-d="1" aria-label="More weight">+</button>
            </div>
            <div class="stepper">
              <button type="button" class="step" data-action="step" data-i="${i}" data-f="r" data-d="-1" aria-label="Fewer reps">−</button>
              <label class="step-field"><input name="r" inputmode="numeric" autocomplete="off" placeholder="0" value="${r}" aria-label="${ex.name} reps"><span class="step-unit">reps</span></label>
              <button type="button" class="step" data-action="step" data-i="${i}" data-f="r" data-d="1" aria-label="More reps">+</button>
            </div>
          </div>
          <button class="primary log-set">Log set</button>
          <button type="button" class="link muted remove-ex" data-action="remove-exercise" data-i="${i}" aria-label="Remove ${ex.name}">Remove exercise</button>
        </form>`}
  </div>`;
}

function renderTrain() {
  const a = state.train.active;
  const r = rec();
  if (a) {
    return html`
      <section class="card">
        <div class="row"><h2 class="label">${a.name} · <span data-live="elapsed">${Math.round((Date.now() - a.startedAt) / 60000)}</span> min</h2><div class="tiny muted">${fmtVol(sessionVolume(a))} ${wUnit()} volume</div></div>
        <p class="tiny muted">${r.status ? RECOVERY_ADVICE[r.status] : "One exercise at a time. Tap a logged set to remove it."}</p>
        ${a.exercises.map((ex, i) => exerciseBlock(ex, i, currentExercise(a)))}
        <form class="set-form add-ex" data-form="add-exercise">
          <input name="name" placeholder="Add exercise" autocomplete="off" maxlength="40" aria-label="Exercise name">
          <button class="ghost small-btn">Add</button>
        </form>
      </section>
      <button class="primary" data-action="finish-workout">Finish session</button>
      <button class="ghost" data-action="discard-workout">Discard</button>`;
  }

  const wk = weekSummary(state.sessions, today());
  const ws = weekStart(today());
  const day = plannedDay();
  const bw = bwToday();
  const others = [...new Set([...rotationDays(), "Kettlebell"])].filter((d) => d !== day && template(d));
  const strip = Array.from({ length: 7 }, (_, i) => {
    const k = addDays(ws, i);
    const kinds = new Set(state.sessions.filter((s) => s.date === k).map((s) => s.kind));
    const mark = kinds.has("strength") ? " lift" : kinds.size ? " other" : "";
    const desc = kinds.has("strength") ? "lifting" : kinds.size ? "activity" : "rest";
    return html`<div class="wk${k === today() ? " now" : ""}"><span class="wk-mark${mark}"></span><span class="tiny" aria-hidden="true">${narrowDay(k)}</span><span class="sr-only">${dayLabel(k)}: ${desc}</span></div>`;
  });
  const history = [...state.sessions].sort((x, y) => y.t - x.t).slice(0, 12);

  const t = trainInfo();
  const headline = t.train
    ? html`<section class="card">
        <h2 class="label">Today · ${day}</h2>
        <div class="tiny muted">${template(day).join(" · ")}</div>
        <p class="muted">${r.status ? `${r.status}: ${RECOVERY_ADVICE[r.status]}` : "No decisions. Open and start."}</p>
        <button class="primary" data-action="start-workout" data-name="${day}">Start ${day}</button>
        <div class="chips">${others.map((d) => html`<button class="chip" data-action="start-workout" data-name="${d}">${d}</button>`)}</div>
      </section>`
    : html`<section class="card">
        <h2 class="label">${t.reason === "done" ? "Done today" : "Rest day"}</h2>
        <p class="lead">${REST_TEXT[t.reason]}</p>
        <p class="muted small">Next lifting session: ${day}.</p>
        ${t.reason !== "done" && html`<button class="ghost" data-action="log-cardio">Log a walk or mobility</button>`}
        <div class="chips"><span class="tiny muted">Train anyway:</span>${[day, ...others].map((d) => html`<button class="chip" data-action="start-workout" data-name="${d}">${d}</button>`)}</div>
      </section>`;

  return html`
    ${headline}
    <section class="card">
      <div class="row"><h2 class="label">This week</h2><div class="tiny muted">${wk.strength} of ${S().daysPerWeek} lifting days</div></div>
      <div class="week">${strip}</div>
      <dl class="stats">
        <div><dt>Volume</dt><dd>${fmtVol(wk.volume)} ${wUnit()}</dd></div>
        <div><dt>Active minutes</dt><dd>${wk.minutes}</dd></div>
      </dl>
      <h3 class="tiny muted">Recovery, last 7 days</h3>
      ${recoveryDots()}
    </section>
    <section class="card">
      <h2 class="label">Morning volume · discipline</h2>
      ${[["pushups", "Push-ups", S().pushupGoal], ["squats", "Squats", S().squatGoal]].map(
        ([k, label, goal]) => html`<div class="counter">
          <div class="row"><span>${label}</span><span class="muted">${bw[k]} / ${goal}</span></div>
          ${bar(goal ? (bw[k] / goal) * 100 : 0, label)}
          <div class="row-btns tight">${[10, 25, 50].map((n) => html`<button class="ghost small-btn" data-action="bw" data-k="${k}" data-n="${n}" aria-label="Add ${n} ${label}">+${n}</button>`)}<button class="ghost small-btn" data-action="bw" data-k="${k}" data-n="-10" aria-label="Subtract 10 ${label}">−10</button></div>
        </div>`
      )}
    </section>
    <section class="card">
      <h2 class="label">Quick sessions</h2>
      <div class="row-btns">
        <button class="ghost" data-action="circuit" data-rounds="1">7-minute circuit</button>
        <button class="ghost" data-action="circuit" data-rounds="2">Circuit × 2</button>
      </div>
      <button class="ghost" data-action="log-cardio">Log walk, cardio or mobility</button>
    </section>
    ${history.length > 0 && html`<section class="card"><h2 class="label">History</h2><ul class="list">${history.map((s) => {
      const detail = s.kind === "strength" ? `${s.exercises.reduce((n, x) => n + x.sets.length, 0)} sets · ${fmtVol(sessionVolume(s))} ${wUnit()}` : `${s.minutes} min${s.sun ? " · sunlight" : ""}`;
      return html`<li><button class="li-btn" data-action="session-detail" data-id="${s.id}"><span>${dayLabel(s.date)} · ${s.name}</span><span class="muted">${detail}</span></button></li>`;
    })}</ul></section>`}`;
}

/** Custom + built-in foods, ordered by how often you logged them in the last 30 days. */
function usualFoods() {
  const counts = new Map();
  const from = addDays(today(), -30);
  for (const [k, items] of Object.entries(state.food)) {
    if (k < from) continue;
    for (const i of items) counts.set(i.name.toLowerCase(), (counts.get(i.name.toLowerCase()) ?? 0) + 1);
  }
  const all = [...state.customFoods, ...FOODS.filter((f) => !state.customFoods.some((c) => c.name.toLowerCase() === f.name.toLowerCase()))];
  return all
    .map((f, idx) => ({ f, idx, n: counts.get(f.name.toLowerCase()) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.idx - b.idx)
    .map((x) => x.f);
}

function renderEat() {
  const items = foodToday();
  const totals = dayTotals(items);
  const target = S().proteinTarget;
  const f = fast();
  const water = state.water[today()] ?? 0;
  const tagged = (tag) => items.filter((i) => i.tags.includes(tag));
  const sun = !!habitsToday().sun || state.sessions.some((s) => s.date === today() && s.sun);
  const step = imperial() ? [8 * ML_PER_OZ, 16 * ML_PER_OZ] : [250, 500];
  const quick = usualFoods();
  const foodBtn = (fd) => html`<button class="food" data-action="add-food" data-id="${fd.id}" aria-label="Add ${fd.name}, ${fd.protein} grams protein"><span>${fd.name}</span><span class="tiny muted">${fd.portion}</span><span class="food-p">+${fd.protein}g</span></button>`;

  const fastCard =
    f.mode === "off"
      ? html`<section class="card"><h2 class="label">Eating window</h2><p class="muted">No window set. Fasting is optional.</p><button class="link" data-action="settings" data-anchor="set-eat">Set a window</button></section>`
      : html`<section class="card">
          <div class="row"><h2 class="label">${f.mode === "open" ? "Eating window open" : "Fasting"}</h2><div class="tiny muted">${protocol().label}</div></div>
          <div class="big">${fmtClock(f.mode === "open" ? f.remaining : f.fasted)}</div>
          <div class="muted">${f.mode === "open" ? `left · closes ${f.closesAt}` : `fasted · window opens ${f.opensAt} (in ${fmtClock(f.untilOpen)})`}</div>
          <div class="row-btns">
            ${f.mode === "fasting" && html`<button class="ghost" data-action="first-meal">First meal now</button>`}
            ${state.fastStart[today()] && html`<button class="ghost" data-action="reset-window">Back to ${S().eatStart}</button>`}
          </div>
        </section>`;

  return html`
    <section class="card hero">
      <h2 class="label">Protein remaining</h2>
      <div class="big">${Math.max(0, target - totals.protein)}<span class="unit">g</span></div>
      ${bar((totals.protein / target) * 100, "Protein eaten today")}
      <div class="muted">${totals.protein} of ${target} g${S().showCalories ? ` · ${totals.kcal} of ${S().calorieTarget} kcal` : ""}</div>
    </section>
    ${fastCard}
    <section class="card">
      <h2 class="label">Quick add · your usual first</h2>
      <div class="foods">${quick.slice(0, 8).map(foodBtn)}</div>
      ${quick.length > 8 && html`<details class="more-foods"${moreFoodsOpen ? html` open` : ""}><summary>More foods</summary><div class="foods">${quick.slice(8).map(foodBtn)}</div></details>`}
      <button class="link" data-action="custom-food">Custom food</button>
    </section>
    ${items.length > 0 && html`<section class="card"><h2 class="label">Today</h2><ul class="list">${[...items].sort((a, b) => b.t - a.t).map(
      (i) => html`<li><span>${i.name} <span class="tiny muted">${clock(i.t)}</span></span><span class="muted">${i.protein} g${S().showCalories ? ` · ${i.kcal} kcal` : ""} <button class="link icon" data-action="remove-food" data-id="${i.id}" aria-label="Remove ${i.name}">×</button></span></li>`
    )}</ul></section>`}
    <section class="card">
      <div class="row"><h2 class="label">Water</h2><div class="tiny muted">${waterOut(water)} · morning goal ${waterOut(S().waterTarget)}</div></div>
      ${bar((water / S().waterTarget) * 100, "Water")}
      <div class="row-btns">
        <button class="ghost small-btn" data-action="water" data-ml="${step[0]}">+${waterOut(step[0])}</button>
        <button class="ghost small-btn" data-action="water" data-ml="${step[1]}">+${waterOut(step[1])}</button>
        <button class="ghost small-btn" data-action="water" data-ml="${-step[0]}" aria-label="Remove ${waterOut(step[0])}">−</button>
      </div>
    </section>
    ${S().showMicros && html`<section class="card">
        <h2 class="label">Micronutrient context</h2>
        <dl class="stats">
          <div><dt>Sunlight today</dt><dd>${sun ? "Yes" : "Not yet"}</dd></div>
          <div><dt>Vitamin D foods</dt><dd>${tagged("vitd").length ? [...new Set(tagged("vitd").map((x) => x.name))].join(", ") : "None yet"}</dd></div>
          <div><dt>Greens / veg servings</dt><dd>${tagged("greens").length}</dd></div>
        </dl>
        <p class="tiny muted">Vitamin D depends on sunlight, season, latitude and skin; fatty fish and eggs help. Supplementing is a conversation for your doctor. Still doesn't prescribe.</p>
      </section>`}`;
}

function renderYou() {
  const s = S();
  const wkMind = state.mind.filter((m) => m.date >= weekStart(today())).reduce((a, b) => a + b.minutes, 0);
  const range = proteinRange(s.bodyweight);
  const opt = (v, cur, label = v) => html`<option value="${v}"${String(v) === String(cur) ? html` selected` : ""}>${label}</option>`;
  const check = (key, label) => html`<label class="check"><input type="checkbox" name="${key}" data-setting="${key}" data-type="bool"${s[key] ? html` checked` : ""}><span>${label}</span></label>`;
  const backup = state.lastBackup ? `Last backup ${dayLabel(dateKey(new Date(state.lastBackup)))}.` : "No backup yet.";
  const storage = persisted === true ? "This browser will keep your data." : "Browsers can clear site data, especially Safari after 7 days away. Add Still to your Home Screen and export a backup now and then.";

  return html`
    <section class="card" id="set-sleep">
      <h2 class="label">Sleep</h2>
      <label>Fixed wake time<input type="time" name="wakeTime" data-setting="wakeTime" value="${s.wakeTime}" required></label>
      <label>Sleep opportunity (lights out → wake)
        <select name="opportunityMin" data-setting="opportunityMin" data-type="int">${[420, 450, 480, 510, 540, 570, 600].map((v) => opt(v, s.opportunityMin, fmtDur(v)))}</select></label>
      <label>Quiet / thinking time in bed before lights out
        <select name="quietMin" data-setting="quietMin" data-type="int">${[0, 15, 30, 60, 90, 120, 180].map((v) => opt(v, s.quietMin, v ? fmtDur(v) : "None"))}</select></label>
      <label>Night dimming<select name="nightMode" data-setting="nightMode">${opt("auto", s.nightMode, "Automatic around bedtime")}${opt("off", s.nightMode, "Off")}</select></label>
    </section>
    <section class="card" id="set-train">
      <h2 class="label">Training</h2>
      <label>Rotation<select name="rotation" data-setting="rotation">${Object.entries(ROTATIONS).map(([k, v]) => opt(k, s.rotation, v.label))}</select></label>
      <label>Lifting days per week<select name="daysPerWeek" data-setting="daysPerWeek" data-type="int">${[2, 3, 4, 5, 6].map((v) => opt(v, s.daysPerWeek))}</select></label>
      <label>Units<select name="units" data-setting="units">${opt("metric", s.units, "Metric (kg, ml)")}${opt("imperial", s.units, "Imperial (lb, oz)")}</select></label>
      <label>Weight increment (${wUnit()})<input type="number" step="0.5" min="0.5" max="50" inputmode="decimal" name="increment" data-setting="increment" data-type="weight" value="${wOut(s.increment)}"></label>
      <label>Sets per exercise<select name="setsPerExercise" data-setting="setsPerExercise" data-type="int">${[1, 2, 3, 4, 5, 6].map((v) => opt(v, s.setsPerExercise))}</select></label>
      <label>Add weight when every set reaches<select name="repCeiling" data-setting="repCeiling" data-type="int">${[6, 8, 10, 12, 15].map((v) => opt(v, s.repCeiling, `${v} reps`))}</select></label>
      <div class="grid2 tight">
        <label>Push-up goal<input type="number" min="0" max="5000" step="10" inputmode="numeric" name="pushupGoal" data-setting="pushupGoal" data-type="int" value="${s.pushupGoal}"></label>
        <label>Squat goal<input type="number" min="0" max="5000" step="10" inputmode="numeric" name="squatGoal" data-setting="squatGoal" data-type="int" value="${s.squatGoal}"></label>
      </div>
    </section>
    <section class="card" id="set-eat">
      <h2 class="label">Eat</h2>
      <label>Bodyweight (${wUnit()})<input type="number" step="0.1" min="0" inputmode="decimal" name="bodyweight" data-setting="bodyweight" data-type="weight" value="${wOut(s.bodyweight)}"></label>
      <label>Daily protein target (g)<input type="number" min="20" max="500" step="5" inputmode="numeric" name="proteinTarget" data-setting="proteinTarget" data-type="int" value="${s.proteinTarget}"></label>
      ${range
        ? html`<p class="tiny muted">ISSN range for training adults: ${range.low}–${range.high} g/day (1.4–2.0 g/kg). <button class="link" data-action="protein-from-bw">Use ${range.high} g</button></p>`
        : html`<p class="tiny muted">Add bodyweight to see the evidence-based range.</p>`}
      <label>Eating window<select name="fasting" data-setting="fasting">${FASTING_PROTOCOLS.map((p) => opt(p.id, s.fasting, p.label))}</select></label>
      <label>Window opens at<input type="time" name="eatStart" data-setting="eatStart" value="${s.eatStart}" required></label>
      ${check("showCalories", "Track calories too")}
      ${s.showCalories && html`<label>Calorie target<input type="number" min="800" max="8000" step="50" inputmode="numeric" name="calorieTarget" data-setting="calorieTarget" data-type="int" value="${s.calorieTarget}"></label>`}
      ${check("showMicros", "Show micronutrient context (vitamin D, greens)")}
    </section>
    <section class="card">
      <h2 class="label">Mind</h2>
      <p class="muted">${wkMind} mindful minutes this week.</p>
      ${check("sounds", "Soft bell at start and end of sessions")}
    </section>
    <section class="card" id="journal">
      <h2 class="label">Journal · stays on this device</h2>
      <form data-form="journal"><label class="sr-only" for="journal-text">Journal entry</label><textarea id="journal-text" name="text" rows="3" maxlength="4000" placeholder="One line is enough."></textarea><button class="ghost">Save entry</button></form>
      <ul class="list journal">${[...state.journal].sort((a, b) => b.t - a.t).slice(0, 30).map(
        (j) => html`<li><div><div class="tiny muted">${dayLabel(j.date)}</div><div class="pre">${j.text}</div></div><button class="link icon" data-action="remove-journal" data-id="${j.id}" aria-label="Delete entry from ${dayLabel(j.date)}">×</button></li>`
      )}</ul>
    </section>
    <section class="card" id="data">
      <h2 class="label">Data</h2>
      <p class="muted small">Everything is stored in this browser only. ${storage} ${backup}</p>
      <div class="row-btns">
        <button class="ghost" data-action="export">Export backup</button>
        <button class="ghost" data-action="import">Import backup</button>
      </div>
      <input type="file" id="import-file" name="import-file" accept="application/json,.json" hidden>
      ${state.demo ? html`<button class="ghost" data-action="erase" data-keep="settings">Erase sample data, keep settings</button>` : html`<button class="ghost" data-action="sample">Load sample data</button>`}
      <button class="ghost danger" data-action="erase">Erase everything</button>
    </section>
    <section class="card">
      <h2 class="label">Principles</h2>
      <ul class="plain">${PRINCIPLES.map((p) => html`<li>${p}</li>`)}</ul>
    </section>
    <section class="card">
      <h2 class="label">Sources</h2>
      ${SOURCES.map((g) => html`<div class="src-group"><h3 class="small">${g.group}</h3><ul class="plain small">${g.items.map(([t, u]) => html`<li><a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a></li>`)}</ul></div>`)}
      <p class="tiny muted">Still is a self-tracking tool, not medical advice. Talk to a clinician about persistent insomnia, fatigue, or before fasting with a medical condition.</p>
      <p class="tiny muted">Version ${VERSION}</p>
    </section>`;
}

function renderOnboarding() {
  const s = S();
  return html`
    <section class="onboard">
      <h2>Quiet recovery.<br>Minimal decisions.</h2>
      <p class="muted">Still protects your sleep, schedules your training, keeps protein visible, and puts breathwork one tap away. Five answers and you're set. Change them anytime.</p>
      <form data-form="onboard" class="card">
        <label>I wake up at<input type="time" name="wakeTime" value="${s.wakeTime}" required></label>
        <label>Sleep opportunity I protect
          <select name="opportunityMin">${[450, 480, 510, 540].map((v) => html`<option value="${v}"${v === s.opportunityMin ? html` selected` : ""}>${fmtDur(v)}</option>`)}</select></label>
        <label>Daily protein target (g)<input type="number" name="proteinTarget" value="${s.proteinTarget}" min="20" max="500" step="5" inputmode="numeric" required></label>
        <label>Eating window
          <select name="fasting">${FASTING_PROTOCOLS.map((p) => html`<option value="${p.id}"${p.id === s.fasting ? html` selected` : ""}>${p.label}</option>`)}</select></label>
        <label>Units<select name="units"><option value="metric">Metric (kg)</option><option value="imperial"${s.units === "imperial" ? html` selected` : ""}>Imperial (lb)</option></select></label>
        <button class="primary" name="mode" value="empty">Start</button>
        <button class="ghost" name="mode" value="sample">Explore with sample data first</button>
      </form>
      <p class="tiny muted center">No account. Nothing leaves this device.</p>
    </section>`;
}

const VIEWS = { today: renderToday, sleep: renderSleep, train: renderTrain, eat: renderEat, you: renderYou };

function render() {
  document.body.classList.toggle("night", nightActive());
  $("#today-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const onboarded = state.onboarded;
  $("#tabs").hidden = $("#you-btn").hidden = !onboarded;
  if (!onboarded) return setHTML(main, renderOnboarding());
  for (const t of document.querySelectorAll("[data-tab]")) {
    if (t.dataset.tab === screen) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  }
  setHTML(main, VIEWS[screen]());
}

/** Updates only time-based text, so typing is never interrupted. */
function tick() {
  if (document.visibilityState !== "visible") return;
  const night = nightActive();
  if (!night) showFullAtNight = false;
  const busy = sheetOpen() || !overlay.hidden;
  if (night !== document.body.classList.contains("night") && !busy) return render();
  if (busy) return;
  if (screen === "today" || screen === "eat") return render(); // no inputs on these screens
  const el = main.querySelector('[data-live="elapsed"]');
  if (el && state.train.active) el.textContent = Math.round((Date.now() - state.train.active.startedAt) / 60000);
}

/**
 * iOS Shortcut / deep link: #log?asleep=7:42&hrv=55&rhr=52&deep=80&rem=95&inbed=22:05&lightsout=22:20&wake=06:40&outofbed=06:55
 * Opens the check-in pre-filled — nothing is saved until you tap Save. The fragment never
 * reaches any server and is removed from history right away.
 */
function openFromLink(query) {
  const q = new URLSearchParams(query);
  const pre = {};
  for (const [param, field] of [["inbed", "inBed"], ["lightsout", "lightsOut"], ["wake", "finalWake"], ["outofbed", "outOfBed"]]) {
    if (isTime(q.get(param))) pre[field] = q.get(param);
  }
  const asleep = parseDuration(q.get("asleep"));
  if (asleep != null) pre.asleep = asleep;
  for (const k of ["hrv", "rhr", "deep", "rem"]) {
    const n = Number(q.get(k));
    if (q.has(k) && Number.isFinite(n) && n > 0) pre[k] = Math.round(n);
  }
  const date = isDayKey(q.get("date")) && q.get("date") <= today() ? q.get("date") : today();
  history.replaceState(null, "", "#today");
  screen = "today";
  render();
  if (state.onboarded) diarySheet(date, pre);
}

function route() {
  const h = location.hash.slice(1);
  if (h.startsWith("log")) return openFromLink(h.slice(h.indexOf("?") + 1));
  const next = SCREENS.includes(h) ? h : "today";
  const changed = next !== screen;
  screen = next;
  render();
  if (pendingAnchor) {
    document.getElementById(pendingAnchor)?.scrollIntoView({ block: "start" });
    pendingAnchor = null;
  } else if (changed) window.scrollTo(0, 0);
}

function go(to) {
  if (location.hash === `#${to}`) route();
  else location.hash = to; // triggers route() via hashchange; keeps the back button working
}

/* ---------- sheets ---------- */

/** Opens the night editor. `prefill` (e.g. from an iOS Shortcut link) overrides individual fields. */
function diarySheet(date = today(), prefill = {}) {
  const existing = sleepEntry(date);
  const { basis: _basis, ...usual } = usualNight(state.sleep, plan(), date);
  const e = { ...(existing ?? { date, ...usual }), ...prefill };
  const v = (k) => e[k] ?? "";
  const hasWatch = e.asleep != null || e.hrv != null || e.rhr != null || e.deep != null || e.rem != null;
  openSheet(html`
    <form data-form="diary" class="diary" novalidate>
      <div class="row"><h3>${existing ? "Edit night" : "Log night"}</h3>${close()}</div>
      <label>Morning of<input type="date" name="date" value="${date}" max="${today()}" required></label>
      <div class="grid2 tight">
        <label>Into bed<input type="time" name="inBed" value="${v("inBed")}" required></label>
        <label>Lights out<input type="time" name="lightsOut" value="${v("lightsOut")}" required></label>
        <label>Final wake<input type="time" name="finalWake" value="${v("finalWake")}" required></label>
        <label>Out of bed<input type="time" name="outOfBed" value="${v("outOfBed")}" required></label>
        <label>Fell asleep after (min)<input type="number" name="latency" min="0" max="720" inputmode="numeric" value="${v("latency")}"></label>
        <label>Awakenings<input type="number" name="wakeups" min="0" max="50" inputmode="numeric" value="${v("wakeups")}"></label>
        <label>Awake during night (min)<input type="number" name="waso" min="0" max="720" inputmode="numeric" value="${v("waso")}"></label>
      </div>
      <details${hasWatch ? html` open` : ""}>
        <summary>From your Watch or Health app (optional)</summary>
        <div class="grid2 tight">
          <label>Total asleep (h:mm)<input name="asleep" placeholder="7:42" inputmode="numeric" autocomplete="off" value="${e.asleep != null ? fmtClock(e.asleep) : ""}"></label>
          <label>HRV (ms)<input type="number" name="hrv" min="5" max="300" inputmode="numeric" value="${v("hrv")}"></label>
          <label>Resting HR (bpm)<input type="number" name="rhr" min="25" max="140" inputmode="numeric" value="${v("rhr")}"></label>
          <label>Deep (min)<input type="number" name="deep" min="0" max="720" inputmode="numeric" value="${v("deep")}"></label>
          <label>REM (min)<input type="number" name="rem" min="0" max="720" inputmode="numeric" value="${v("rem")}"></label>
        </div>
        <p class="tiny muted">"Total asleep" overrides the diary math. HRV and resting HR power the recovery trend.</p>
      </details>
      <div class="preview" id="diary-preview" aria-live="polite"></div>
      <button class="primary">Save night</button>
      ${existing && html`<button type="button" class="ghost danger" data-action="delete-night" data-date="${date}">Delete this night</button>`}
    </form>`);
  updateDiaryPreview();
}

function readDiary(form) {
  const fd = new FormData(form);
  const n = (k) => {
    const raw = fd.get(k);
    return raw === "" || raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw);
  };
  return {
    date: String(fd.get("date") ?? ""),
    inBed: String(fd.get("inBed") ?? ""),
    lightsOut: String(fd.get("lightsOut") ?? ""),
    finalWake: String(fd.get("finalWake") ?? ""),
    outOfBed: String(fd.get("outOfBed") ?? ""),
    latency: n("latency") ?? 0,
    wakeups: n("wakeups") ?? 0,
    waso: n("waso") ?? 0,
    asleep: parseDuration(fd.get("asleep")),
    hrv: n("hrv"),
    rhr: n("rhr"),
    deep: n("deep"),
    rem: n("rem"),
  };
}

function updateDiaryPreview() {
  const form = $('form[data-form="diary"]');
  const box = $("#diary-preview");
  if (!form || !box) return;
  const e = readDiary(form);
  const errs = validateDiary(e, today());
  if (errs.length) return setHTML(box, html`<p class="warn">${errs[0]}</p>`);
  const m = diaryMetrics(e);
  setHTML(box, html`<dl class="stats">
      <div><dt>Time in bed</dt><dd>${fmtDur(m.tib)}</dd></div>
      <div><dt>Opportunity</dt><dd>${fmtDur(m.opportunity)}</dd></div>
      <div><dt>Asleep</dt><dd>${fmtDur(m.sleep)}</dd></div>
      <div><dt>Efficiency</dt><dd>${m.efficiency}%</dd></div>
    </dl>
    <p class="tiny muted">Asleep = opportunity − ${m.source === "watch" ? "(Watch total used)" : `${m.latency} min to fall asleep − ${m.waso} min awake`}. Efficiency = asleep ÷ opportunity. Clinical (÷ time in bed): ${m.clinicalEfficiency}%.</p>`);
}

function cardioSheet() {
  openSheet(html`
    <form data-form="cardio">
      <div class="row"><h3>Log activity</h3>${close()}</div>
      <label>Type<select name="name">${["Walk", "Run", "Bike", "Row", "Mobility", "Kettlebell", "Other cardio"].map((n) => html`<option>${n}</option>`)}</select></label>
      <label>Minutes<input type="number" name="minutes" min="1" max="600" value="30" inputmode="numeric" required></label>
      <div class="chips">${[20, 30, 45, 75].map((n) => html`<button type="button" class="chip" data-action="set-minutes" data-n="${n}">${n} min</button>`)}</div>
      <label class="check"><input type="checkbox" name="sun" checked><span>Outdoors / sunlight</span></label>
      <button class="primary">Save</button>
    </form>`);
}

function customFoodSheet() {
  openSheet(html`
    <form data-form="custom-food">
      <div class="row"><h3>Custom food</h3>${close()}</div>
      <label>Name<input name="name" required maxlength="40" autocomplete="off"></label>
      <div class="grid2 tight">
        <label>Protein (g)<input type="number" name="protein" min="0" max="500" required inputmode="numeric"></label>
        <label>Calories<input type="number" name="kcal" min="0" max="10000" inputmode="numeric"></label>
      </div>
      <label class="check"><input type="checkbox" name="keep" checked><span>Keep in quick add</span></label>
      <button class="primary">Add</button>
    </form>`);
}

function meditatePickSheet() {
  openSheet(html`
    <div class="row"><h3>Sit</h3>${close()}</div>
    <p class="muted">Silent timer with a soft bell. Vipassana-style: breath, then body, return when the mind wanders.</p>
    <div class="row-btns wrap">${MEDITATION_LENGTHS.map((n) => html`<button class="ghost" data-action="meditate" data-min="${n}">${n} min</button>`)}</div>
    <h3 class="mt">Breathe</h3>
    <ul class="list">${BREATH_PRESETS.map((p) => html`<li><span>${p.name}<br><span class="tiny muted">${p.hint}</span></span><span class="row-btns tight">${[3, 5, 10].map((n) => html`<button class="ghost small-btn" data-action="breathe" data-preset="${p.id}" data-min="${n}" aria-label="${p.name}, ${n} minutes">${n}m</button>`)}</span></li>`)}</ul>`);
}

function explainRecoverySheet() {
  const r = rec();
  openSheet(html`
    <div class="row"><h3>Recovery · ${r.status || "—"}</h3>${close()}</div>
    ${r.status && html`<p class="lead">${RECOVERY_ADVICE[r.status]}</p>`}
    ${r.signals.length
      ? html`<ul class="list">${r.signals.map((sg) => html`<li><span>${sg.label}</span><span class="muted">${sg.text}${sg.points != null ? ` · ${["good", "watch", "strained"][sg.points]}` : ""}</span></li>`)}</ul>`
      : html`<p class="muted">Log last night${r.reason === "no-checkin" ? "" : " with HRV and resting HR"} to see recovery.</p>`}
    ${recoveryDots()}
    <p class="tiny muted">How it works: your last 3 days are compared with the 14 days before. HRV down, resting HR up, or short sleep add strain. Ready → train as planned. Easy → train moderately. Rest → walk, mobility or breathe. One bad night alone never decides it.</p>
    ${r.reason === "no-checkin" && html`<button class="primary" data-action="diary">Log last night</button>`}`);
}

function sessionDetailSheet(sid) {
  const s = state.sessions.find((x) => x.id === sid);
  if (!s) return;
  openSheet(html`
    <div class="row"><h3>${s.name} · ${dayLabel(s.date)}</h3>${close()}</div>
    ${s.kind === "strength"
      ? html`<ul class="list">${s.exercises.filter((x) => x.sets.length).map((x) => html`<li><span>${x.name}</span><span class="muted">${x.sets.map(fmtSet).join(", ")}</span></li>`)}</ul><p class="muted">${s.minutes} min · ${fmtVol(sessionVolume(s))} ${wUnit()} volume</p>`
      : html`<p class="muted">${s.minutes} min${s.sun ? " · outdoors" : ""}</p>`}
    <button class="ghost danger" data-action="delete-session" data-id="${s.id}">Delete session</button>`);
}

function afterSessionSheet(minutes) {
  openSheet(html`
    <div class="row"><h3>${plural(minutes, "minute")}. Well done.</h3>${close("Skip")}</div>
    <form data-form="journal" data-close="1">
      <label>Anything worth writing down? (optional)<textarea name="text" rows="3" maxlength="4000" placeholder="One line is enough."></textarea></label>
      <button class="primary">Save to journal</button>
    </form>`);
}

/* ---------- timed sessions (loaded on demand) ---------- */

async function runTimed(cfg) {
  closeSheet();
  const { startSession } = await import("./sessions.js");
  startSession(overlay, cfg, {
    sounds: S().sounds,
    onEnd(res) {
      const minutes = res.elapsedMin;
      if ((res.type === "breath" || res.type === "meditation") && minutes >= 1) {
        state.mind.push({ id: uid(), date: today(), t: Date.now(), kind: res.type, preset: res.presetId || "silent", minutes });
        commit();
        afterSessionSheet(minutes);
      } else if (res.type === "circuit" && minutes >= 1) {
        state.sessions.push({ id: uid(), date: today(), t: Date.now(), kind: "circuit", name: "7-minute circuit", minutes });
        commit();
        toast(`Circuit logged · ${plural(minutes, "minute")}`);
      } else {
        render();
      }
    },
  });
}

/* ---------- actions ---------- */

const minutesArg = (v, allowed) => (allowed.includes(Number(v)) ? Number(v) : allowed[0]);

const actions = {
  "close-sheet": closeSheet,
  settings: (d) => {
    pendingAnchor = d.anchor;
    go("you");
  },
  diary: (d) => diarySheet(d.date),
  "log-usual": () => {
    const { basis: _basis, ...u } = usualNight(state.sleep, plan(), today());
    const entry = { id: uid(), t: Date.now(), date: today(), ...u, asleep: null, hrv: null, rhr: null, deep: null, rem: null };
    if (validateDiary(entry, today()).length) return diarySheet();
    state.sleep = [...state.sleep.filter((x) => x.date !== entry.date), entry].sort((a, b) => (a.date < b.date ? -1 : 1));
    commit();
    toast("Night logged", { action: { label: "Adjust", run: () => diarySheet(today()) } });
  },
  "night-full": () => {
    showFullAtNight = true;
    render();
  },
  "explain-recovery": explainRecoverySheet,
  "meditate-pick": meditatePickSheet,
  breathe: (d) => runTimed({ type: "breath", presetId: d.preset, minutes: minutesArg(d.min, [5, 3, 10]) }),
  meditate: (d) => runTimed({ type: "meditation", minutes: minutesArg(d.min, MEDITATION_LENGTHS) }),
  circuit: (d) => runTimed({ type: "circuit", rounds: minutesArg(d.rounds, [1, 2, 3]) }),
  awake: () => runTimed({ type: "awake" }),
  "log-cardio": cardioSheet,
  "custom-food": customFoodSheet,
  "session-detail": (d) => sessionDetailSheet(d.id),
  "set-minutes": (d) => {
    $('[name="minutes"]').value = d.n;
  },
  habit: (d) => {
    const h = { ...habitsToday() };
    h[d.id] = !h[d.id];
    state.habits[today()] = h;
    commit();
  },
  checklist: (d, el) => {
    state.checklist[d.id] = el.checked;
    save(state);
  },
  "delete-night": (d) => {
    closeSheet();
    withUndo("Night deleted", () => {
      state.sleep = state.sleep.filter((e) => e.date !== d.date);
    });
  },
  "start-workout": (d) => {
    const names = template(d.name);
    if (!names) return;
    drafts.clear();
    expanded.clear();
    focusEx = null;
    state.train.active = { id: uid(), name: d.name, startedAt: Date.now(), exercises: names.map((n) => ({ name: n, sets: [] })) };
    save(state);
    go("train");
  },
  step: (d) => {
    const i = Number(d.i);
    const form = [...main.querySelectorAll('form[data-form="set"]')].find((f) => Number(f.dataset.i) === i);
    if (!form) return;
    const cur = { w: form.elements.w.value, r: form.elements.r.value };
    const dir = Math.sign(Number(d.d)) || 1;
    if (d.f === "w") cur.w = String(Math.max(0, round1((Number(cur.w) || 0) + dir * (wOut(S().increment) || 1))));
    else cur.r = String(Math.max(1, Math.round(Number(cur.r) || 0) + dir));
    drafts.set(i, cur);
    render();
  },
  "extra-set": (d) => {
    expanded.add(Number(d.i));
    focusEx = Number(d.i);
    render();
  },
  "focus-ex": (d) => {
    focusEx = Number(d.i);
    render();
    main.querySelector(".exercise.current")?.scrollIntoView({ block: "center", behavior: "smooth" });
  },
  "remove-set": (d) => {
    const ex = state.train.active?.exercises[d.i];
    if (!ex) return;
    withUndo("Set removed", () => ex.sets.splice(Number(d.j), 1));
  },
  "remove-exercise": async (d) => {
    const a = state.train.active;
    const ex = a?.exercises[d.i];
    if (!ex) return;
    const tpl = template(a.name);
    const inTpl = !!tpl?.includes(ex.name);
    const ok = await confirmDialog({
      title: `Remove ${ex.name}?`,
      body: inTpl ? `It will also be removed from the ${a.name} template.` : "",
      ok: "Remove",
    });
    if (!ok) return;
    drafts.clear();
    expanded.clear();
    focusEx = null;
    withUndo(`${ex.name} removed`, () => {
      a.exercises.splice(Number(d.i), 1);
      if (inTpl) state.train.templates[a.name] = tpl.filter((n) => n !== ex.name);
    });
  },
  "finish-workout": async () => {
    const a = state.train.active;
    if (!a) return;
    const exercises = a.exercises.filter((x) => x.sets.length);
    if (!exercises.length) {
      if (!(await confirmDialog({ title: "No sets logged", body: "Close this session without saving?", ok: "Close session" }))) return;
      state.train.active = null;
      drafts.clear();
      expanded.clear();
    focusEx = null;
      return commit();
    }
    state.sessions.push({ id: a.id, date: today(), t: Date.now(), kind: "strength", name: a.name, minutes: Math.max(1, Math.round((Date.now() - a.startedAt) / 60000)), exercises });
    const idx = rotationDays().indexOf(a.name);
    if (idx >= 0) state.train.next = (idx + 1) % rotationDays().length;
    state.train.active = null;
    drafts.clear();
    expanded.clear();
    focusEx = null;
    commit();
    window.scrollTo(0, 0);
    toast(`${a.name} saved · ${fmtVol(sessionVolume({ exercises }))} ${wUnit()}`);
  },
  "discard-workout": async () => {
    if (!(await confirmDialog({ title: "Discard this session?", body: "Logged sets will be lost.", ok: "Discard", danger: true }))) return;
    state.train.active = null;
    drafts.clear();
    expanded.clear();
    focusEx = null;
    commit();
  },
  "delete-session": (d) => {
    closeSheet();
    withUndo("Session deleted", () => {
      state.sessions = state.sessions.filter((s) => s.id !== d.id);
    });
  },
  bw: (d) => {
    if (d.k !== "pushups" && d.k !== "squats") return;
    const cur = { ...bwToday() };
    cur[d.k] = Math.max(0, cur[d.k] + Number(d.n));
    state.bw[today()] = cur;
    commit();
  },
  "add-food": (d) => {
    const fd = state.customFoods.find((x) => x.id === d.id) ?? FOODS.find((x) => x.id === d.id);
    if (!fd) return;
    (state.food[today()] ??= []).push({ id: uid(), name: fd.name, protein: fd.protein, kcal: fd.kcal, tags: [...fd.tags], t: Date.now() });
    commit();
    toast(`${fd.name} · +${fd.protein} g protein`);
  },
  "remove-food": (d) =>
    withUndo("Food removed", () => {
      state.food[today()] = foodToday().filter((x) => x.id !== d.id);
    }),
  water: (d) => {
    state.water[today()] = Math.max(0, (state.water[today()] ?? 0) + (Number(d.ml) || 0));
    if (state.water[today()] >= S().waterTarget) state.habits[today()] = { ...habitsToday(), water: true };
    commit();
  },
  "first-meal": () => {
    state.fastStart[today()] = nowHHMM();
    commit();
  },
  "reset-window": () => {
    delete state.fastStart[today()];
    commit();
  },
  "protein-from-bw": () => {
    const range = proteinRange(S().bodyweight);
    if (!range) return;
    state.settings.proteinTarget = range.high;
    commit();
  },
  "remove-journal": (d) =>
    withUndo("Entry deleted", () => {
      state.journal = state.journal.filter((j) => j.id !== d.id);
    }),
  export: () => {
    const url = URL.createObjectURL(new Blob([exportJSON(state)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `still-backup-${today()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    state.lastBackup = Date.now();
    commit();
  },
  import: () => $("#import-file").click(),
  sample: async () => {
    const hasData = state.sleep.length || state.sessions.length || state.journal.length;
    if (hasData && !(await confirmDialog({ title: "Replace your data with sample data?", body: "Export a backup first if you want to keep it.", ok: "Replace", danger: true }))) return;
    state = sampleState(state);
    commit();
    go("today");
  },
  erase: async (d) => {
    const keep = d.keep === "settings";
    const ok = await confirmDialog(
      keep
        ? { title: "Erase sample data?", body: "Your settings stay. Everything else starts fresh.", ok: "Erase sample data" }
        : { title: "Erase everything on this device?", body: "Sleep, training, food, journal and settings. This cannot be undone.", ok: "Erase everything", danger: true }
    );
    if (!ok) return;
    const fresh = defaultState();
    if (keep) {
      fresh.settings = state.settings;
      fresh.onboarded = true;
    }
    state = fresh;
    drafts.clear();
    expanded.clear();
    focusEx = null;
    commit();
    go("today");
  },
};

const forms = {
  onboard: (fd, form, submitter) => {
    const s = state.settings;
    s.wakeTime = String(fd.get("wakeTime"));
    s.opportunityMin = Number(fd.get("opportunityMin"));
    s.proteinTarget = Number(fd.get("proteinTarget"));
    s.fasting = String(fd.get("fasting"));
    s.units = fd.get("units") === "imperial" ? "imperial" : "metric";
    Object.assign(s, unitDefaults(s.units));
    state.onboarded = true;
    if (submitter?.value === "sample") state = sampleState(state);
    commit();
    requestPersistence().then((p) => (persisted = p));
    go("today");
  },
  diary: (fd, form) => {
    const e = readDiary(form);
    const errs = validateDiary(e, today());
    if (errs.length) return toast(errs[0]);
    const old = sleepEntry(e.date);
    state.sleep = [...state.sleep.filter((x) => x.date !== e.date), { id: old?.id ?? uid(), t: Date.now(), ...e }].sort((a, b) => (a.date < b.date ? -1 : 1));
    closeSheet();
    commit();
    const r = rec();
    toast(r.status ? `Saved · Recovery: ${r.status}` : "Night saved");
  },
  set: (fd, form) => {
    const ex = state.train.active?.exercises[form.dataset.i];
    if (!ex) return;
    const w = wIn(fd.get("w") || "0");
    const r = Math.round(Number(fd.get("r")));
    if (w == null || w < 0 || w > 1000 || !(r >= 1 && r <= 1000)) return toast("Enter weight and reps");
    ex.sets.push({ w: Math.round(w * 1000) / 1000, r });
    drafts.delete(Number(form.dataset.i));
    if (ex.sets.length >= S().setsPerExercise) {
      expanded.delete(Number(form.dataset.i));
      focusEx = null; // move on to the next unfinished exercise
    }
    commit();
  },
  "add-exercise": (fd) => {
    const name = String(fd.get("name") ?? "").trim().slice(0, 40);
    const a = state.train.active;
    if (!name || !a) return;
    a.exercises.push({ name, sets: [] });
    const tpl = template(a.name);
    if (tpl && !tpl.includes(name)) tpl.push(name);
    commit();
  },
  cardio: (fd) => {
    const minutes = Math.round(Number(fd.get("minutes")));
    if (!(minutes >= 1 && minutes <= 600)) return toast("Enter minutes");
    const sun = fd.get("sun") === "on";
    state.sessions.push({ id: uid(), date: today(), t: Date.now(), kind: "cardio", name: String(fd.get("name")).slice(0, 40), minutes, sun });
    if (sun) state.habits[today()] = { ...habitsToday(), sun: true };
    closeSheet();
    commit();
  },
  "custom-food": (fd) => {
    const name = String(fd.get("name") ?? "").trim().slice(0, 40);
    const protein = Math.min(500, Math.max(0, Number(fd.get("protein")) || 0));
    const kcal = Math.min(10000, Math.max(0, Number(fd.get("kcal")) || 0));
    if (!name) return;
    const item = { name, protein, kcal, tags: [] };
    if (fd.get("keep") === "on") {
      state.customFoods = [{ id: `c-${uid()}`, portion: "custom", ...item }, ...state.customFoods.filter((c) => c.name.toLowerCase() !== name.toLowerCase())].slice(0, 12);
    }
    (state.food[today()] ??= []).push({ id: uid(), t: Date.now(), ...item });
    closeSheet();
    commit();
  },
  journal: (fd, form) => {
    const text = String(fd.get("text") ?? "").trim().slice(0, 4000);
    if (text) state.journal.push({ id: uid(), date: today(), t: Date.now(), text });
    if (form.dataset.close) closeSheet();
    commit();
    if (text) toast("Saved to journal");
  },
};

function applySetting(el) {
  const key = el.dataset.setting;
  if (!Object.hasOwn(state.settings, key)) return;
  let v = el.type === "checkbox" ? el.checked : el.value;
  if (el.dataset.type === "int") v = Math.round(Number(v));
  if (el.dataset.type === "weight") v = v === "" ? null : wIn(v);
  if ((el.dataset.type === "int" || el.dataset.type === "weight") && v != null && !Number.isFinite(v)) return render();
  if (el.type === "time" && !v) return render();
  if (key === "units" && v !== S().units) Object.assign(state.settings, unitDefaults(v));
  if (key === "rotation") state.train.next = 0;
  state.settings[key] = v;
  // re-validate through the same sanitizer used for storage (bounds, enums)
  state.settings = sanitize({ settings: state.settings }).settings;
  commit();
}

/* ---------- wiring ---------- */

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el || !Object.hasOwn(actions, el.dataset.action)) return;
  if (el.tagName !== "INPUT") ev.preventDefault();
  actions[el.dataset.action](el.dataset, el, ev);
});

document.addEventListener("submit", (ev) => {
  const form = ev.target.closest("form[data-form]");
  if (!form) return;
  ev.preventDefault();
  if (Object.hasOwn(forms, form.dataset.form)) forms[form.dataset.form](new FormData(form), form, ev.submitter);
});

document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.matches("[data-setting]")) applySetting(t);
  if (t.id === "import-file") {
    const file = t.files?.[0];
    t.value = "";
    if (!file) return;
    file
      .text()
      .then(async (txt) => {
        const next = importJSON(txt);
        if (!(await confirmDialog({ title: "Restore this backup?", body: "It replaces the data on this device.", ok: "Restore", danger: true }))) return;
        state = next;
        drafts.clear();
        expanded.clear();
    focusEx = null;
        commit();
        toast("Backup restored");
      })
      .catch((e) => toast(e.message || "Could not read that file"));
  }
});

document.addEventListener("input", (ev) => {
  const form = ev.target.closest("form[data-form]");
  if (!form) return;
  if (form.dataset.form === "diary") updateDiaryPreview();
  if (form.dataset.form === "set") drafts.set(Number(form.dataset.i), { w: form.elements.w.value, r: form.elements.r.value });
});

document.addEventListener("toggle", (ev) => {
  if (ev.target.matches?.(".more-foods")) moreFoodsOpen = ev.target.open;
}, true);

window.addEventListener("hashchange", route);
window.addEventListener("storage", (ev) => {
  if (ev.key === STORAGE_KEY && !sheetOpen() && overlay.hidden) {
    state = load();
    render();
  }
});
document.addEventListener("visibilitychange", tick);
setInterval(tick, 30000);

route();
if (state.onboarded) requestPersistence().then((p) => (persisted = p));

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
