# Privacy & security

## Privacy: what happens to your data

| Question | Answer |
|---|---|
| Where is my data? | Only in the browser where you use Still (`localStorage`, key `still.v2`). |
| Is anything sent to a server? | No. The Cloudflare Worker only serves static files. It has no code, database, analytics, cookies or logging of app data. |
| Third parties? | None. No fonts, CDNs, trackers or embeds. The only outbound links are the scientific sources, which open with `noreferrer`. |
| Accounts? | None. |
| Search engines | The site sends `noindex` and `robots.txt` disallows crawling. A personal health tool has nothing to index. |
| Backups | **You → Data → Export** saves a JSON file to your device. It contains your journal, so store it somewhere private. |
| Deleting | **You → Data → Erase everything** removes all data, permanently. Clearing site data in the browser does the same. |

### Keeping your data

Browsers may clear site data. Safari does this after about 7 days without a visit, unless the app is added to the Home Screen. To protect your data, Still:

- asks the browser for **persistent storage** (`navigator.storage.persist()`);
- shows whether storage is protected and when you last exported a backup (**You → Data**).

For the safest setup: **add to Home Screen** and **export a backup** now and then.

## Security: how the app is hardened

**No server attack surface.** The site is static files only. There's no Worker script, API, secrets or user input on the server.

**Strict Content-Security-Policy** (`public/_headers`):

- `default-src 'none'`. Scripts, styles, images and the manifest are allowed from the app's own origin only.
- No inline scripts and no inline styles. Bar widths are set through CSSOM.
- `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`.
- **Trusted Types enforced** (`require-trusted-types-for 'script'; trusted-types still`). In supporting browsers, the only code that can write HTML is the app's `still` policy, and that policy only accepts escaped output from `html```.

**Safe-by-default rendering** (`public/js/html.js`, `ui.js`):

- Every value interpolated into a template is HTML-escaped.
- `setHTML()` refuses anything that isn't `SafeHTML`.
- ESLint blocks direct `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `alert` and `confirm` (`npm run lint`).

**Strict data sanitizing** (`public/js/store.js → sanitize`):

- Everything read from storage or an imported backup is rebuilt field by field.
- Times must be strict `HH:MM`, dates must be real calendar dates, and numbers are bounded.
- Enums are whitelisted, text is length-capped, and IDs must match `[\w-]`.
- Invalid records are dropped, never silently "fixed" into fake values. Unknown keys and `__proto__` are discarded, which prevents prototype pollution.
- Imports are capped at 5 MB.
- All of this is covered by `tests/security.test.js`.

**Other headers:**

- HSTS
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`
- A restrictive `Permissions-Policy` (no camera, microphone, location or sensors; screen wake lock is allowed for sessions)

**Service worker:** caches only the app's own successful, same-origin `GET` responses. It never touches other origins.

**Dependencies:** none at runtime. The only dev tools are Wrangler and ESLint. Run `npm audit` to check them.

## Known limits

- `localStorage` isn't encrypted. Anyone with access to your unlocked device and browser can read it. Use your device lock.
- Trusted Types is enforced in Chromium-based browsers. Other browsers ignore that one directive, but the rest of the CSP, plus the escaping and sanitizing, still apply.
