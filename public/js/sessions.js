// Still — full-screen timed sessions: breathing, silent meditation,
// 7-minute circuit, and the stimulus-control "awake in bed" timer.
// Time is measured from the clock (not tick counts) so it stays accurate
// when the browser throttles timers.

import { BREATH_PRESETS, CIRCUIT } from "./data.js";
import { pad } from "./calc.js";
import { html } from "./html.js";
import { setHTML } from "./ui.js";

let audioCtx = null;
function tone(freq, dur, vol) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  } catch (e) {
    /* audio unavailable */
  }
}
const bell = () => { tone(432, 3.5, 0.12); tone(864, 2.5, 0.04); };
const blip = () => tone(660, 0.25, 0.08);
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* noop */ } };

const mmss = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

/**
 * Starts a session inside `root` (a full-screen overlay element).
 * cfg: { type: "breath", presetId, minutes } | { type: "meditation", minutes }
 *    | { type: "circuit", rounds } | { type: "awake" }
 * opts: { sounds, onEnd({ type, presetId, elapsedMin, completed }) }
 */
export function startSession(root, cfg, opts) {
  let wakeLock = null;
  let timer = null;
  const started = performance.now();
  let pausedAt = null;
  let pausedTotal = 0;
  let lastKey = "";
  let ended = false;

  const total = (() => {
    if (cfg.type === "circuit") return CIRCUIT.length * 40 * cfg.rounds - 10; // rounds: 1–3, validated by caller
    if (cfg.type === "awake") return 20 * 60;
    return cfg.minutes * 60;
  })();

  const preset = BREATH_PRESETS.find((p) => p.id === cfg.presetId) || BREATH_PRESETS[0];
  const titles = {
    breath: preset.name,
    meditation: "Sit",
    circuit: "7-minute circuit",
    awake: "Awake in bed",
  };

  const stages = {
    breath: html`<div class="breath-wrap"><div class="breath-circle" id="s-circle"></div><div class="breath-label" id="s-phase" aria-live="polite"></div></div><p class="muted center small">${preset.hint}</p>`,
    meditation: html`<p class="session-quiet">Eyes closed. Notice the breath, then the body. When the mind wanders, return.</p>`,
    awake: html`<p class="session-quiet">Get up. Go somewhere dim and quiet.<br>Read, sit, or think — no screens, no clock-watching.<br>Return to bed only when sleepy.</p>
      <p class="muted center small">You can lock your phone. The timer keeps time.</p>`,
    circuit: html`<div class="circuit-now" id="s-now" aria-live="polite"></div><div class="circuit-count" id="s-count"></div><div class="muted center" id="s-next"></div>`,
  };

  const app = document.getElementById("app");
  root.className = `session session-${cfg.type}`;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", titles[cfg.type]);
  setHTML(
    root,
    html`<div class="session-inner">
      <div class="session-top">
        <span class="label">${titles[cfg.type]}</span>
        <button class="link" data-s="end">End</button>
      </div>
      <div class="session-stage">${stages[cfg.type]}</div>
      <div class="session-bottom">
        <div class="session-clock" id="s-clock" role="timer"></div>
        <button class="ghost" data-s="pause" id="s-pause">Pause</button>
      </div>
    </div>`
  );
  root.hidden = false;
  app.inert = true;
  const clock = root.querySelector("#s-clock");
  const pauseBtn = root.querySelector("#s-pause");
  pauseBtn.focus();
  const circle = root.querySelector("#s-circle");
  const phaseEl = root.querySelector("#s-phase");
  const nowEl = root.querySelector("#s-now");
  const countEl = root.querySelector("#s-count");
  const nextEl = root.querySelector("#s-next");

  async function lock() {
    try {
      if ("wakeLock" in navigator && cfg.type !== "awake") wakeLock = await navigator.wakeLock.request("screen");
    } catch (e) {
      /* not supported or denied */
    }
  }
  lock();
  const onVis = () => { if (document.visibilityState === "visible" && !ended) lock(); };
  document.addEventListener("visibilitychange", onVis);

  if (opts.sounds && cfg.type !== "awake") bell();
  if (cfg.type === "awake") document.body.classList.add("night");

  const elapsed = () => ((pausedAt ?? performance.now()) - started - pausedTotal) / 1000;

  function tick() {
    const e = elapsed();
    const left = total - e;
    clock.textContent = mmss(left);

    if (cfg.type === "breath") {
      const cycle = preset.phases.reduce((s, p) => s + p[1], 0);
      let t = e % cycle;
      let i = 0;
      while (i < preset.phases.length - 1 && t >= preset.phases[i][1]) { t -= preset.phases[i][1]; i++; }
      const [label, secs, scale] = preset.phases[i];
      const key = `${Math.floor(e / cycle)}-${i}`;
      if (key !== lastKey) {
        lastKey = key;
        circle.style.transitionDuration = `${secs}s`;
        circle.style.transform = `scale(${scale})`;
        phaseEl.textContent = label;
        buzz(label.startsWith("Hold") ? 15 : 35);
      }
    }

    if (cfg.type === "circuit") {
      const slot = Math.floor(e / 40);
      const inSlot = e - slot * 40;
      const station = slot % CIRCUIT.length;
      const round = Math.floor(slot / CIRCUIT.length) + 1;
      const working = inSlot < 30;
      const key = `${slot}-${working}`;
      if (key !== lastKey && slot < CIRCUIT.length * cfg.rounds) {
        lastKey = key;
        if (opts.sounds) blip();
        buzz(working ? 60 : 30);
      }
      const nextName = CIRCUIT[(station + 1) % CIRCUIT.length];
      nowEl.textContent = working ? CIRCUIT[station] : "Rest";
      countEl.textContent = mmss(working ? 30 - inSlot : 40 - inSlot);
      nextEl.textContent = working
        ? `Round ${round} of ${cfg.rounds} · ${station + 1}/${CIRCUIT.length}`
        : `Next: ${nextName}`;
    }

    if (left <= 0) finish(true);
  }

  function finish(completed) {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVis);
    try { wakeLock && wakeLock.release(); } catch (e) { /* noop */ }
    if (completed && opts.sounds) bell();
    if (completed) buzz([80, 120, 80]);
    const elapsedMin = Math.round(Math.min(elapsed(), total) / 60);
    root.hidden = true;
    root.replaceChildren();
    root.onclick = null;
    app.inert = false;
    opts.onEnd({ type: cfg.type, presetId: cfg.presetId, elapsedMin, completed });
  }

  root.onclick = (ev) => {
    const b = ev.target.closest("[data-s]");
    if (!b) return;
    if (b.dataset.s === "end") finish(elapsed() >= total - 1);
    if (b.dataset.s === "pause") {
      if (pausedAt == null) {
        pausedAt = performance.now();
        pauseBtn.textContent = "Resume";
        root.classList.add("paused");
      } else {
        pausedTotal += performance.now() - pausedAt;
        pausedAt = null;
        pauseBtn.textContent = "Pause";
        root.classList.remove("paused");
        lastKey = "";
      }
    }
  };

  tick();
  timer = setInterval(tick, 200);
  return { stop: () => finish(false) };
}
