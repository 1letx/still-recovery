# Apple Watch data with one tap (iOS Shortcut)

A web app can't read Apple Health directly. An iOS Shortcut can, and it can then open Still with your numbers already filled in. You review the check-in and tap **Save night**. That's the whole morning routine.

## How the link works

```
https://YOUR-STILL-URL/#log?asleep=7:42&hrv=55&rhr=51
```

All parameters are optional. Anything missing falls back to your usual night.

| Parameter | Example | Meaning |
|---|---|---|
| `asleep` | `7:42` or `462` | Total time asleep (h:mm or minutes) |
| `hrv` | `55` | Heart-rate variability, ms |
| `rhr` | `51` | Resting heart rate, bpm |
| `deep`, `rem` | `80`, `95` | Minutes of each sleep stage |
| `inbed`, `lightsout`, `wake`, `outofbed` | `22:05` | Clock times, 24-hour `HH:MM` |
| `date` | `2026-11-16` | The morning you woke up (defaults to today) |

**Privacy:**

- Everything after `#` stays on your phone. Browsers never send it to any server, including Cloudflare.
- Still removes the data from the address bar and history right away.
- Nothing is saved until you tap **Save night**.

## Build the Shortcut (about 3 minutes)

In the **Shortcuts** app, tap **+** and add these actions in order:

1. **Find Health Samples**: Type **Heart Rate Variability**. Start Date **is in the last 1 day**. Sort by **Start Date**, **Latest First**. Limit **1**.
2. **Get Details of Health Sample**: **Value**. Rename the result to `HRV`.
3. **Find Health Samples**: Type **Resting Heart Rate**, same filters as step 1.
4. **Get Details of Health Sample**: **Value**. Rename the result to `RHR`.
5. **Text**: `https://YOUR-STILL-URL/#log?hrv=` then insert `HRV`, then `&rhr=`, then insert `RHR`.
6. **Open URLs**: use the Text from step 5.

Name the Shortcut **Still check-in**. Optional extras:

- **Automation → Time of Day** (for example, 15 minutes after your wake time) to run it each morning.
- **Add to Home Screen** for a one-tap icon.

> Sleep duration: if you also want `asleep`, add **Find Health Samples** → Type **Sleep Analysis** (last 1 day), then **Calculate Statistics → Sum** of Duration, converted to minutes, and append `&asleep=` plus that number. If this gets fiddly, skip it. Still uses your diary times instead.

## Without a Shortcut

On Today, tap **Log usual night**. It logs your typical night, using the median of your last 7 nights. Tap **Adjust** in the confirmation if anything was different.
