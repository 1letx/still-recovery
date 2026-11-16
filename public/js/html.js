// Still — safe-by-default HTML templating.
//
//   html`<p>${userText}</p>`   → every interpolated value is escaped
//   html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul>` → nested html is kept as-is
//
// Only SafeHTML values may reach the DOM (see ui.js setHTML), so forgetting to
// escape is impossible by construction. Rules for templates:
//   • always quote attribute values: class="${x}"
//   • never interpolate into on* handlers, style, or href/src (except constants)

export class SafeHTML {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

export const escapeHTML = (v) => String(v).replace(/[&<>"'`]/g, (c) => ESCAPES[c]);

function part(v) {
  if (v == null || v === false || v === true) return "";
  if (v instanceof SafeHTML) return v.value;
  if (Array.isArray(v)) return v.map(part).join("");
  return escapeHTML(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new SafeHTML(out);
}
