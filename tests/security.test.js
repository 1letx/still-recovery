// Security tests: escaping and the storage/backup sanitizer.
import { test } from "node:test";
import assert from "node:assert/strict";

// store.js only touches localStorage/navigator inside functions, so it imports cleanly in Node.
const { html, escapeHTML, SafeHTML } = await import("../public/js/html.js");
const { sanitize, importJSON, defaultState, sampleState, exportJSON } = await import("../public/js/store.js");

const XSS = `"><img src=x onerror=alert(1)><script>alert(1)</script>`;

test("html`` escapes every interpolated value", () => {
  const out = html`<p title="${XSS}">${XSS}</p>`;
  assert.ok(out instanceof SafeHTML);
  assert.ok(!out.value.includes("<img"));
  assert.ok(!out.value.includes("<script"));
  assert.ok(!out.value.includes('"><'));
  assert.equal(escapeHTML("`'"), "&#96;&#39;");
});

test("html`` keeps nested templates, joins arrays, drops null/booleans", () => {
  const items = ["a", "<b>"];
  const out = html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>${null}${false}${true}${0}`;
  assert.equal(out.value, "<ul><li>a</li><li>&lt;b&gt;</li></ul>0");
});

test("sanitize: hostile backup cannot inject markup-bearing values into typed fields", () => {
  const evil = {
    settings: { wakeTime: XSS, eatStart: "<b>", units: XSS, rotation: "__proto__", proteinTarget: "1e9", fasting: XSS, sounds: "yes" },
    sleep: [{ date: "2026-11-16", inBed: XSS, lightsOut: "22:30", finalWake: "06:30", outOfBed: "07:00" }],
    sessions: [{ id: XSS, date: "2026-11-16", kind: "strength", name: "Push", exercises: [{ name: "Bench", sets: [{ w: "9e99", r: -4 }, { w: 80, r: 5 }] }] }],
    food: { "__proto__": [{ name: "x" }], "2026-11-16": [{ id: XSS, name: "Steak", protein: 1e9, tags: ["vitd", XSS] }] },
    habits: { "2026-11-16": { water: true, [XSS]: true } },
    fastStart: { "2026-11-16": XSS },
    train: { templates: { __proto__: ["x"], Push: ["Bench", 5, "", "Bench"] } },
  };
  const s = sanitize(evil);
  const d = defaultState().settings;
  assert.equal(s.settings.wakeTime, d.wakeTime);
  assert.equal(s.settings.eatStart, d.eatStart);
  assert.equal(s.settings.units, "metric");
  assert.equal(s.settings.rotation, "ppl");
  assert.equal(s.settings.proteinTarget, 500); // clamped
  assert.equal(s.settings.fasting, d.fasting);
  assert.equal(s.settings.sounds, false);
  assert.equal(s.sleep.length, 0); // invalid time → night dropped
  assert.match(s.sessions[0].id, /^[\w-]+$/);
  assert.deepEqual(s.sessions[0].exercises[0].sets, [{ w: 80, r: 5 }]);
  assert.equal(Object.getPrototypeOf(s.food), Object.prototype);
  assert.deepEqual(Object.keys(s.food), ["2026-11-16"]);
  assert.equal(s.food["2026-11-16"][0].protein, 500);
  assert.deepEqual(s.food["2026-11-16"][0].tags, ["vitd"]);
  assert.deepEqual(s.habits["2026-11-16"], { water: true });
  assert.deepEqual(s.fastStart, {});
  assert.deepEqual(s.train.templates.Push, ["Bench"]);
  assert.equal(({}).polluted, undefined);
});

test("sanitize never throws on garbage", () => {
  for (const g of [null, 1, "x", [], { settings: null, sleep: "x", sessions: {}, food: [] }]) {
    assert.doesNotThrow(() => sanitize(g));
  }
});

test("importJSON validates shape and size, round-trips exports", () => {
  assert.throws(() => importJSON("not json"), /valid JSON/);
  assert.throws(() => importJSON("{}"), /Still backup/);
  assert.throws(() => importJSON("x".repeat(6 * 1024 * 1024)), /too large/);
  const sample = sampleState(defaultState());
  const back = importJSON(exportJSON(sample));
  assert.equal(back.sleep.length, sample.sleep.length);
  assert.equal(back.sessions.length, sample.sessions.length);
  assert.equal(back.onboarded, true);
});

test("sanitize is idempotent on valid data", () => {
  const sample = sampleState(defaultState());
  assert.deepEqual(sanitize(structuredClone(sample)), sample);
});
