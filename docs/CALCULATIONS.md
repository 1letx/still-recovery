# How Still calculates things

Every number in the app is explainable. Nothing is an opaque "body battery". The code lives in `public/js/calc.js`, and the tests are in `tests/calc.test.js`.

## Sleep (CBT‑I diary)

| Term | Formula |
|---|---|
| Time in bed (TIB) | into bed → out of bed |
| **Sleep opportunity** | lights out → final wake |
| **Asleep (TST)** | opportunity − time to fall asleep − time awake in the night. If you enter a Watch "total asleep" value, that is used instead (capped at the opportunity). |
| **Efficiency** | asleep ÷ opportunity |
| Clinical efficiency | asleep ÷ time in bed (shown for transparency) |
| Quiet time in bed | TIB − opportunity (reading or thinking before lights out, lying in after waking) |

**Why opportunity and not time in bed?** The concept values long, quiet time in bed for thinking (11–12 h). The clinical formula would punish that. Still keeps the clinical number visible but doesn't count that quiet time against you.

**Consistency:** the standard deviation of final-wake times and of lights-out times over 14 nights. Lights-out times after midnight are handled correctly.

| Standard deviation | Label |
|---|---|
| ≤ 20 min | Very consistent |
| ≤ 40 min | Consistent |
| ≤ 60 min | Drifting |
| > 60 min | Irregular |

## Tonight's plan

The fixed wake time is the anchor. Keeping it is the most important CBT‑I rule.

- lights out = wake − sleep-opportunity target (default 8 h 30 m)
- in bed = lights out − your quiet/thinking time (default 30 min)

A note based on the 7-night average efficiency (needs ≥ 3 nights):

| Efficiency | Note |
|---|---|
| ≥ 90 % | Sleep is filling the window well. |
| 85–89 % | Keep the window as it is. |
| < 85 % | If you want more sleep rather than more thinking time, try lights out 15 min later. |

## Recovery: Ready / Easy / Rest

- **Recent** = average of the last 3 days. This is a trend, never a single-night verdict.
- **Baseline** = average of the 14 days before that. Each signal needs at least 3 values to count.

| Signal | 0 (good) | 1 (watch) | 2 (strained) |
|---|---|---|---|
| HRV vs baseline | ≥ −4 % | −4 to −10 % | < −10 % |
| Resting HR vs baseline | ≤ +2 bpm | +2 to +5 | > +5 |
| 3-night average sleep | ≥ 7 h | 6–7 h | < 6 h |

**Strain** = points ÷ maximum possible points from the signals you have.

| Strain | Status | Advice |
|---|---|---|
| ≤ 0.25 | **Ready** | Train as planned. |
| ≤ 0.55 | **Easy** | Train moderately: leave 2–3 reps in reserve and skip the last set. |
| > 0.55 | **Rest** | Walk, do mobility or breathwork. The rotation waits for you. |

Signals without enough history show "building baseline" and aren't counted.

## Training: is today a lifting day?

Checked in this order:

| Situation | Today |
|---|---|
| Already lifted today | Done |
| Weekly target already reached | Rest: week complete |
| Recovery is **Rest** | Rest: walk, mobility or breathe |
| Lifts remaining ≥ days left this week | **Train**: needed to hit the target |
| Lifted yesterday, target ≤ 4 days/week, and the week still fits | Rest: spacing |
| Otherwise | **Train** |

You can always train anyway from the Train tab.

## One-tap check-in: your "usual night"

The median of your last 7 nights for each time (into bed, lights out, final wake, out of bed) and each minute value (time to fall asleep, awakenings, time awake). Clock times after midnight are handled correctly. With no history yet, tonight's plan is used.

## Training: progressive overload (double progression)

Start from the heaviest set you did last time.

- If **every** set at that weight reached the rep ceiling (default 10), the suggestion is **+1 increment** (default 2.5 kg / 5 lb) at about 6 reps.
- Otherwise, the suggestion is the **same weight, +1 rep**.
- For bodyweight exercises, the suggestion is +1 rep.

Volume = Σ weight × reps. The rotation moves to the next day only when you finish that day's session.

## Eating window

The window opens at your set time and lasts 8 / 6 / 4 / 1 hours (16:8, 18:6, 20:4, OMAD). Windows that cross midnight are handled. **First meal now** shifts today's window only.

## Protein

The ISSN position stand (2017) recommends **1.4–2.0 g per kg of bodyweight per day** for exercising adults. If you enter your bodyweight, Still shows that range and can set your target to the upper end.
