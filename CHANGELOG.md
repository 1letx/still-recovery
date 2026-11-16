# Changelog

All notable changes to Still. Versions follow [Semantic Versioning](https://semver.org).

## [1.2.0] — 2026-11-16 · UX built around the daily loop

### Added
- **Today** is rebuilt as three numbers (sleep, recovery, protein), one **Now** action and **Today's plan**, a checklist that ticks itself off.
- **One-tap check-in**: "Log usual night" uses the median of your last 7 nights, with **Adjust** in the confirmation.
- **Training scheduler**: decides lifting day vs rest day from the weekly target, days left, yesterday and recovery.
- **One-tap set logging**: pre-filled weight × reps, ± steppers, sets per exercise (default 3), and one exercise at a time with automatic focus.
- **Quiet night screen**: only lights-out, 4‑7‑8 breathing and the awake-in-bed timer.
- Foods ordered by your own 30-day favourites.
- iOS Shortcut deep link (`#log?…`) to bring in Apple Watch data ([docs/SHORTCUTS.md](docs/SHORTCUTS.md)).
- Weekly summary line (lifting days, protein days, wake consistency).

## [1.1.0] — 2026-11-16 · Security, privacy and quality audit

### Security
- Strict CSP (no inline scripts or styles) with **Trusted Types** enforced.
- Auto-escaping `html` templates, and a renderer that only accepts escaped output.
- A strict sanitizer for stored data and imported backups (types, bounds, enums, no prototype pollution), plus a 5 MB import cap.
- HSTS, COOP/CORP, a tighter Permissions-Policy, `noindex`, and a real 404 page.

### Changed
- In-app confirm dialogs with **Undo** replace browser pop-ups.
- WCAG AA contrast, keyboard-accessible cards and lists, focus trap in sheets. Lighthouse accessibility 94 → 100.
- Module preloading and a lazy-loaded session timer. The service worker answers from cache after 2.5 s.
- The browser is asked to keep data permanently, and the last backup date is shown.

### Fixed
- Unsaved typed weights were wiped by the 30-second refresh.
- A night with zero sleep opportunity broke the charts. Impossible dates were accepted.
- The back button didn't work between tabs.

## [1.0.0] — 2026-11-16 · First complete web MVP

- Today, Sleep (CBT-I diary), Train (rotation, progressive overload), Eat (protein, eating window), breathing and meditation timers, journal, backup.
- Cloudflare Workers static deployment, offline support, installable on iPhone.
