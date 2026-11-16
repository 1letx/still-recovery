// Still — DOM primitives: safe rendering, bottom sheet, confirm dialog, toast.
import { SafeHTML, html } from "./html.js";

const $ = (sel) => document.querySelector(sel);
const app = $("#app");
const sheet = $("#sheet");
const sheetBody = $("#sheet-body");
const toastEl = $("#toast");

// Trusted Types: the CSP only allows the "still" policy, and that policy only
// ever receives SafeHTML produced by the escaping `html` tag.
const policy = window.trustedTypes?.createPolicy?.("still", { createHTML: (s) => s }) ?? { createHTML: (s) => s };

const clampPct = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/** Renders SafeHTML into `el`. Bar sizes are applied through CSSOM so the CSP needs no inline styles. */
export function setHTML(el, safe) {
  if (!(safe instanceof SafeHTML)) throw new TypeError("setHTML expects SafeHTML from html``");
  el.innerHTML = policy.createHTML(safe.value);
  for (const n of el.querySelectorAll("[data-w]")) n.style.width = `${clampPct(n.dataset.w)}%`;
  for (const n of el.querySelectorAll("[data-h]")) n.style.height = `${clampPct(n.dataset.h)}%`;
}

/* ---------- bottom sheet (modal) ---------- */

let returnFocus = null;
let onSheetClose = null;

export const sheetOpen = () => !sheet.hidden;

export function openSheet(content, { onClose } = {}) {
  if (sheet.hidden) returnFocus = document.activeElement;
  onSheetClose = onClose || null;
  setHTML(sheetBody, content);
  sheet.hidden = false;
  app.inert = true; // focus trap: everything behind the sheet is inert
  document.body.classList.add("sheet-open");
  const heading = sheetBody.querySelector("h2, h3");
  if (heading) {
    heading.id = "sheet-title";
    sheetBody.setAttribute("aria-labelledby", "sheet-title");
  }
  const target = sheetBody.querySelector("[autofocus]") || sheetBody.querySelector("button, input, select, textarea");
  if (target && !(target.matches("input, textarea") && window.matchMedia("(pointer: coarse)").matches)) target.focus();
}

export function closeSheet() {
  if (sheet.hidden) return;
  sheet.hidden = true;
  sheetBody.replaceChildren();
  sheetBody.removeAttribute("aria-labelledby");
  app.inert = false;
  document.body.classList.remove("sheet-open");
  const cb = onSheetClose;
  onSheetClose = null;
  if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  returnFocus = null;
  cb?.();
}

sheet.addEventListener("click", (ev) => {
  if (ev.target === sheet) closeSheet();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && !sheet.hidden) closeSheet();
});

/** In-app replacement for window.confirm(). Resolves true/false. */
export function confirmDialog({ title, body = "", ok = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => {
      if (answered) return;
      answered = true;
      closeSheet();
      resolve(v);
    };
    openSheet(
      html`<div class="confirm">
        <h3>${title}</h3>
        ${body && html`<p class="muted">${body}</p>`}
        <button class="${danger ? "primary danger-fill" : "primary"}" data-confirm="yes">${ok}</button>
        <button class="ghost" data-confirm="no" autofocus>Cancel</button>
      </div>`,
      { onClose: () => answer(false) }
    );
    sheetBody.querySelector(".confirm").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-confirm]");
      if (b) answer(b.dataset.confirm === "yes");
    });
  });
}

/* ---------- toast (with an optional action such as Undo or Adjust) ---------- */

let toastTimer;
/** toast("Saved") · toast("Deleted", { undo }) · toast("Logged", { action: { label: "Adjust", run } }) */
export function toast(message, { undo, action } = {}) {
  const act = action ?? (undo && { label: "Undo", run: undo });
  clearTimeout(toastTimer);
  setHTML(toastEl, html`<span>${message}</span>${act ? html`<button class="toast-action">${act.label}</button>` : ""}`);
  toastEl.hidden = false;
  if (act) {
    toastEl.querySelector(".toast-action").addEventListener("click", () => {
      toastEl.hidden = true;
      act.run();
    }, { once: true });
  }
  toastTimer = setTimeout(() => (toastEl.hidden = true), act ? 5000 : 2600);
}
