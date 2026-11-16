// Still — static content: templates, foods, breathing presets, circuit, sources.

export const ROTATIONS = {
  ppl: { label: "Push / Pull / Legs", days: ["Push", "Pull", "Legs"] },
  ul: { label: "Upper / Lower", days: ["Upper", "Lower"] },
  fb: { label: "Full body", days: ["Full body A", "Full body B"] },
};

export const DEFAULT_TEMPLATES = {
  Push: ["Bench press", "Overhead press", "Incline dumbbell press", "Lateral raise", "Triceps pushdown"],
  Pull: ["Pull-up", "Barbell row", "Face pull", "Biceps curl"],
  Legs: ["Back squat", "Romanian deadlift", "Leg press", "Calf raise"],
  Upper: ["Bench press", "Barbell row", "Overhead press", "Pull-up"],
  Lower: ["Back squat", "Romanian deadlift", "Walking lunge", "Calf raise"],
  "Full body A": ["Back squat", "Bench press", "Barbell row"],
  "Full body B": ["Deadlift", "Overhead press", "Pull-up"],
  Kettlebell: ["Kettlebell swing", "Goblet squat", "Kettlebell press", "Turkish get-up"],
};

// Typical portions, approximate values (USDA FoodData Central, rounded).
// Biased toward the core diet: red meat, seafood, greens, vegetables, berries.
export const FOODS = [
  { id: "steak", name: "Steak", portion: "200 g cooked", protein: 52, kcal: 500, tags: ["red-meat"] },
  { id: "beef", name: "Ground beef", portion: "150 g cooked", protein: 38, kcal: 380, tags: ["red-meat"] },
  { id: "salmon", name: "Salmon", portion: "150 g cooked", protein: 34, kcal: 310, tags: ["seafood", "vitd"] },
  { id: "whitefish", name: "White fish", portion: "150 g cooked", protein: 32, kcal: 160, tags: ["seafood"] },
  { id: "shrimp", name: "Shrimp", portion: "150 g cooked", protein: 36, kcal: 150, tags: ["seafood"] },
  { id: "sardines", name: "Sardines", portion: "1 tin, 90 g", protein: 22, kcal: 190, tags: ["seafood", "vitd"] },
  { id: "chicken", name: "Chicken breast", portion: "150 g cooked", protein: 46, kcal: 250, tags: [] },
  { id: "eggs", name: "Eggs", portion: "3 large", protein: 19, kcal: 215, tags: ["vitd"] },
  { id: "yogurt", name: "Greek yogurt", portion: "200 g", protein: 20, kcal: 130, tags: [] },
  { id: "greens", name: "Greens", portion: "arugula / spinach / kale, big bowl", protein: 4, kcal: 40, tags: ["greens"] },
  { id: "veg", name: "Vegetables", portion: "asparagus / Brussels sprouts, 200 g", protein: 6, kcal: 85, tags: ["greens"] },
  { id: "avocado", name: "Avocado", portion: "½ fruit", protein: 2, kcal: 120, tags: [] },
  { id: "oil", name: "Olive oil", portion: "1 tbsp", protein: 0, kcal: 120, tags: [] },
  { id: "berries", name: "Berries", portion: "150 g", protein: 1, kcal: 75, tags: ["fruit"] },
  { id: "chocolate", name: "Dark chocolate", portion: "20 g", protein: 2, kcal: 120, tags: [] },
  { id: "wine", name: "Red wine", portion: "1 glass, 150 ml", protein: 0, kcal: 125, tags: [] },
];

// Breathing presets. Phases: [label, seconds, scale (circle size 0–1)]
export const BREATH_PRESETS = [
  { id: "exhale", name: "Longer exhale", hint: "Relaxation · in 4 · out 6", phases: [["Inhale", 4, 1], ["Exhale", 6, 0.55]] },
  { id: "box", name: "Box", hint: "Steady focus · 4 · 4 · 4 · 4", phases: [["Inhale", 4, 1], ["Hold", 4, 1], ["Exhale", 4, 0.55], ["Hold", 4, 0.55]] },
  { id: "478", name: "4-7-8", hint: "Before sleep · in 4 · hold 7 · out 8", phases: [["Inhale", 4, 1], ["Hold", 7, 1], ["Exhale", 8, 0.55]] },
  { id: "resonance", name: "Resonance", hint: "~5.5 breaths/min · in 5.5 · out 5.5", phases: [["Inhale", 5.5, 1], ["Exhale", 5.5, 0.55]] },
  { id: "sigh", name: "Physiological sigh", hint: "Fast reset · double inhale · long exhale", phases: [["Inhale", 2, 0.85], ["Top up", 1, 1], ["Long exhale", 6, 0.55]] },
];

export const MEDITATION_LENGTHS = [10, 20, 30, 60];

// Classic 12-station bodyweight circuit (30 s work · 10 s rest).
export const CIRCUIT = [
  "Jumping jacks",
  "Wall sit",
  "Push-ups",
  "Crunches",
  "Step-ups",
  "Squats",
  "Triceps dips",
  "Plank",
  "High knees",
  "Lunges",
  "Push-up + rotation",
  "Side plank",
];

export const HABITS = [
  { id: "water", label: "Morning water" },
  { id: "sun", label: "Walk & sunlight" },
  { id: "cold", label: "Cold exposure" },
  { id: "screens", label: "Screens off early" },
];

export const SLEEP_CHECKLIST = [
  { id: "cold", label: "Bedroom cool (≈ 16–19 °C / 60–67 °F)" },
  { id: "dark", label: "Room fully dark — blackout or eye mask" },
  { id: "quiet", label: "Quiet, or steady white noise" },
  { id: "phone", label: "Phone charges outside the bed" },
  { id: "meal", label: "Last meal ≥ 3 h before bed" },
  { id: "wake", label: "Same wake time every day, weekends too" },
];

export const PRINCIPLES = [
  "Sleep opportunity is protected first: ~8 hours, early, consistent.",
  "Time in bed is not failure. Thinking time is allowed and not counted against you.",
  "Trends over 7–14 nights matter more than any single night.",
  "Training is scheduled and simple. Open the app and start — no decisions.",
  "Protein first, whole foods. The eating window is visible, never nagged.",
  "Breathwork and meditation are one tap away.",
  "No streaks that shame. No social. No stimulation at night.",
  "All data stays on this device. No account.",
];

export const SOURCES = [
  {
    group: "Sleep",
    items: [
      ["Watson NF et al. Recommended amount of sleep for a healthy adult (AASM/SRS consensus). J Clin Sleep Med, 2015.", "https://jcsm.aasm.org/doi/10.5664/jcsm.4758"],
      ["NHLBI / NIH. Sleep deprivation and deficiency: how much sleep is enough. 2022.", "https://www.nhlbi.nih.gov/health/sleep-deprivation/how-much-sleep"],
      ["Li J et al. Sleep duration and health outcomes: an umbrella review. Sleep & Breathing, 2022.", "https://doi.org/10.1007/s11325-021-02458-1"],
      ["AASM. Healthy sleep habits. Sleep Education.", "https://sleepeducation.org/healthy-sleep/healthy-sleep-habits/"],
    ],
  },
  {
    group: "Exercise",
    items: [
      ["Currier BS et al. ACSM resistance training prescription — overview of reviews. MSSE, 2026.", "https://acsm.org/resistance-training-guidelines-update-2026/"],
      ["Paluch AE et al. Resistance exercise training: 2023 update. AHA scientific statement. Circulation, 2024.", "https://www.ahajournals.org/doi/10.1161/CIR.0000000000001189"],
      ["WHO guidelines on physical activity and sedentary behaviour. 2020.", "https://www.who.int/publications/i/item/9789240015128"],
    ],
  },
  {
    group: "Nutrition",
    items: [
      ["Jäger R et al. ISSN position stand: protein and exercise. JISSN, 2017.", "https://doi.org/10.1186/s12970-017-0177-8"],
      ["Hua Y et al. Intermittent fasting for weight management and metabolic health: umbrella review. Diabetes Obes Metab, 2025.", "https://doi.org/10.1111/dom.16092"],
    ],
  },
  {
    group: "Meditation & recovery",
    items: [
      ["Systematic review of Vipassana meditation health impacts. ~2025.", "https://pubmed.ncbi.nlm.nih.gov/41158896/"],
    ],
  },
  {
    group: "Wearables",
    items: [
      ["Svensson T et al. Validity of Oura Gen3 (OSSA 2.0) vs polysomnography. Sleep Medicine, 2024.", "https://doi.org/10.1016/j.sleep.2024.01.020"],
    ],
  },
];
