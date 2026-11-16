# Still — Quiet Recovery

A quiet, monochrome recovery and consistency coach. This is the **web MVP**, deployed on Cloudflare Workers.

It treats sleep as non-negotiable instrumented recovery. It removes trivial decisions and supports a high-protein, strength-training, fasting and meditation routine without adding noise. Black, off-white and soft grays only.

> All data stays on the device (browser `localStorage`). There's no account, no server database, and no tracking. See [docs/PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md).

---

## What it does

**Today:** answers "what do I do now?"
- **Three numbers:** sleep, recovery (Ready / Easy / Rest) and protein left.
- **One next action** picked for the moment: log the night, start today's session, log food while the eating window is open, or nothing at all.
- **Today's plan:** a quiet checklist that ticks itself off as you go (check-in, training or rest day, eating window, protein, morning volume, breathwork, lights out).
- **At night**, Today shrinks to the wind-down only: lights-out time, 4‑7‑8 breathing and the awake-in-bed timer. Nothing else.
- **One-tap check-in:** **Log usual night** records your typical night (the median of your last 7). **Adjust** fixes anything that was different. You can also bring Apple Watch data in with an [iOS Shortcut](docs/SHORTCUTS.md).

**Sleep:**
- CBT‑I style diary: into bed, lights out, time to fall asleep, awakenings, time awake, final wake, out of bed.
- Optional Watch / Health numbers: total asleep, HRV, resting HR, deep, REM.
- Sleep opportunity is shown separately from actual sleep, so **11–12 hours in bed with thinking time is not counted against you**.
- 14-night trend of opportunity vs sleep, plus wake-time and lights-out consistency.
- Tonight's plan, anchored on a fixed wake time.
- A 20-minute low-light stimulus-control timer, wind-down breathing, and a bedroom checklist.

**Train:**
- **Scheduled for you:** Still decides whether today is a lifting day or a rest day from your weekly target, yesterday's session and recovery. The Push / Pull / Legs rotation (or Upper/Lower, Full body) picks *what* to train.
- **One exercise at a time:** the next weight × reps is pre-filled from your last session plus progressive overload. Adjust with ± steppers, then tap **Log set**. Finished exercises collapse, and focus moves to the next one.
- Weekly volume, lifting days vs plan, and a 7-day recovery overlay.
- 300 push-ups + 300 squats counters, a guided 7-minute circuit, and walk/cardio/mobility logging.

**Eat:**
- Protein remaining as the main number. Calories are optional.
- Live eating-window timer: 16:8, 18:6, 20:4, OMAD, or none.
- One-tap foods, **ordered by what you actually eat** (your 30-day favourites first), biased toward red meat, seafood, greens, vegetables and berries, plus custom foods.
- Water toward a ~28 oz morning target.
- Optional micronutrient context (vitamin D, greens).

**Breathe & Sit:** five breathing presets (longer exhale, box, 4‑7‑8, resonance, physiological sigh) and a silent Vipassana-style timer with a soft bell. Sessions are logged as mindful minutes, and you can add an optional journal line afterwards.

**You:** settings, a local-only journal, backup export/import (JSON), sample data, principles, and the scientific sources.

The app works offline and can be installed to the iPhone home screen (Safari → Share → Add to Home Screen).

## How the numbers are calculated

All formulas are in [`public/js/calc.js`](public/js/calc.js), explained in plain language in [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md), and covered by unit tests.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/DEPLOY.md](docs/DEPLOY.md) | Folder → GitHub Desktop → GitHub → Cloudflare Workers, step by step |
| [docs/SHORTCUTS.md](docs/SHORTCUTS.md) | Apple Watch data in one tap with an iOS Shortcut |
| [docs/CALCULATIONS.md](docs/CALCULATIONS.md) | Every formula in plain language |
| [docs/PRIVACY_SECURITY.md](docs/PRIVACY_SECURITY.md) | Where data lives and how the app is hardened |
| [docs/concept/](docs/concept/) | The original concept and the scientific sources |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Project structure

```
still-recovery/
├── .github/workflows/ci.yml   ← lint + tests on every push and pull request
├── public/                    ← the app: everything served to the browser
│   ├── index.html             ← app shell
│   ├── 404.html
│   ├── css/app.css            ← monochrome design system
│   ├── js/
│   │   ├── app.js             ← screens, routing, actions
│   │   ├── calc.js            ← pure logic: sleep, recovery, scheduling, fasting, overload
│   │   ├── store.js           ← localStorage, strict sanitizer, backup, sample data
│   │   ├── html.js            ← auto-escaping html`` templates
│   │   ├── ui.js              ← safe rendering, sheets, confirm dialog, toasts
│   │   ├── sessions.js        ← breathing / meditation / circuit / awake timers (lazy-loaded)
│   │   └── data.js            ← templates, foods, presets, sources
│   ├── sw.js                  ← offline support
│   ├── manifest.webmanifest   ← installable app (Add to Home Screen)
│   ├── _headers               ← strict CSP + security headers (applied by Cloudflare)
│   ├── robots.txt
│   └── icons/
├── tests/                     ← calculation + security tests (node --test)
├── scripts/make-icons.mjs     ← regenerates the PNG icons
├── docs/                      ← guides (see table above)
│   └── concept/               ← original concept + scientific sources
├── wrangler.jsonc             ← Cloudflare Worker config (static assets only)
├── eslint.config.js           ← lint rules, incl. bans on unsafe DOM APIs
├── package.json               ← scripts: dev · check · deploy
├── CHANGELOG.md
├── SECURITY.md
└── README.md
```

There's no build step and no framework: the browser runs plain HTML, CSS and ES modules.

## Run locally

You need Node.js 20+.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:8787. To run lint and all tests:

```bash
npm run check
```

## Deploy

Folder → GitHub Desktop → GitHub → Cloudflare Workers. Every push to `main` deploys automatically. See **[docs/DEPLOY.md](docs/DEPLOY.md)** for the step-by-step guide.

## Design rules

- Sleep opportunity is protected first: ~8 hours, early and consistent.
- Only three numbers are prominent: sleep, recovery, protein.
- Trends over 7–14 nights matter more than any single night.
- Training is scheduled; you never have to decide what to do today.
- No streaks that shame, no social features, nothing stimulating at night.

## Not medical advice

Still is a self-tracking tool. Wearable sleep stages are estimates. Talk to a clinician about persistent insomnia or fatigue, or before fasting if you have a medical condition.

## Next steps (native)

The concept targets iOS + Apple Watch with HealthKit. The data model here maps directly onto that: sleep analysis, HRV, resting HR, workouts and Mindful Minutes. See [docs/concept/General_Idea.txt](docs/concept/General_Idea.txt) for the open-source foundations (Pulsr, Ischys, Ovlo, sleepbook, FoodYou).
