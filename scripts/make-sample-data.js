// Generates a synthetic week so the debrief has something real-shaped to work on
// before any headset data exists. Seeded, so the same week comes out every time.
// Every row is written with mode=mock, and the app labels it as synthetic everywhere.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toCsv } from "../core/csv.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STEP_MS = 2000;
const PERSON = "me";

// A small deterministic random number generator (mulberry32).
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The shape of a working day: rise, late-morning peak, post-lunch dip, partial recovery, fade. */
function dayCurve(hour) {
  const points = [
    [8.5, 0.34], [9.5, 0.46], [10.5, 0.58], [11.25, 0.62], [12.0, 0.5],
    [13.0, 0.3], [14.0, 0.26], [15.0, 0.38], [16.0, 0.44], [17.0, 0.36], [18.0, 0.28],
  ];
  if (hour <= points[0][0]) return points[0][1];
  if (hour >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 1; i < points.length; i++) {
    if (hour <= points[i][0]) {
      const [h0, v0] = points[i - 1], [h1, v1] = points[i];
      const k = (hour - h0) / (h1 - h0);
      return v0 + (v1 - v0) * k;
    }
  }
  return 0.4;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function makeDay(dayStart, seed, opts = {}) {
  const rand = rng(seed);
  const rows = [];
  // Blocks of the day the headset is actually worn, as [startHour, endHour].
  const blocks = opts.blocks || [[9, 12.5], [13.5, 17.5]];
  // Personal offset so this person's "normal" isn't centred on 0.5.
  const person = opts.offset ?? -0.04;

  let fNoise = 0, cNoise = 0;
  let badUntil = 0;

  for (const [h0, h1] of blocks) {
    for (let h = h0; h < h1; h += STEP_MS / 3_600_000) {
      const t = dayStart + Math.round(h * 3_600_000);

      // Slow drifting noise so attention doesn't teleport between readings.
      fNoise = fNoise * 0.965 + (rand() - 0.5) * 0.030;
      cNoise = cNoise * 0.960 + (rand() - 0.5) * 0.034;

      const base = dayCurve(h) + person;
      const focus = clamp01(base + fNoise);
      // Calm runs somewhat against focus during hard work, but not perfectly.
      const calm = clamp01(0.46 - (base - 0.42) * 0.55 + cNoise + (h > 16.5 ? 0.06 : 0));

      // Band power. Neurosity derives focus from gamma (30-44Hz) and calm from alpha (7.5-12.5Hz),
      // so those two track their metrics. Overall magnitude falls off with frequency (1/f).
      const j = () => (rand() - 0.5) * 0.06;
      const gamma = Math.max(0.01, 0.10 + focus * 0.42 + j());
      const beta  = Math.max(0.01, 0.20 + focus * 0.35 + j());
      const alpha = Math.max(0.01, 0.26 + calm * 0.70 + j());
      const theta = Math.max(0.01, 0.42 + calm * 0.30 - focus * 0.12 + j());
      const delta = Math.max(0.01, 0.80 + (1 - focus) * 0.35 + j());

      // Occasional stretches where an electrode loses contact.
      if (t > badUntil && rand() < 0.0016) badUntil = t + (40_000 + rand() * 150_000);
      const bad = t < badUntil;

      rows.push({
        timestamp_iso: new Date(t).toISOString(),
        epoch_ms: t,
        mode: "mock",
        focus: focus.toFixed(4),
        calm: calm.toFixed(4),
        alpha: alpha.toFixed(4),
        beta: beta.toFixed(4),
        delta: delta.toFixed(4),
        theta: theta.toFixed(4),
        gamma: gamma.toFixed(4),
        signal_quality: bad ? (rand() < 0.5 ? "bad" : "noContact") : "mock",
        person_id: PERSON,
      });
    }
  }
  return rows;
}

function localMidnight(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

mkdirSync(join(ROOT, "data"), { recursive: true });
mkdirSync(join(ROOT, "notes"), { recursive: true });

// Twelve weekdays, so a cross-session baseline can actually form (it needs ten).
const SHAPES = [
  [[9, 12.5], [13.5, 17.5]], [[9.5, 12.0], [13.0, 16.5]], [[8.5, 12.5], [13.5, 18.0]],
  [[10, 12.5], [14.0, 17.0]], [[9, 12.0], [13.0, 17.5]], [[9.25, 12.75], [13.75, 17.0]],
];
const variants = [];
let d = 1, i = 0;
while (variants.length < 12) {
  const probe = new Date(); probe.setDate(probe.getDate() - d);
  const dow = probe.getDay();
  if (dow !== 0 && dow !== 6) {
    variants.push({ daysAgo: d, seed: 100 + variants.length * 97, offset: -0.01 - (variants.length % 5) * 0.017, blocks: SHAPES[i++ % SHAPES.length] });
  }
  d++;
}

const written = [];
for (const v of variants) {
  const start = localMidnight(v.daysAgo);
  const rows = makeDay(start, v.seed, v);
  const name = `session-${new Date(start).toISOString().slice(0, 10)}.csv`;
  writeFileSync(join(ROOT, "data", name), toCsv(rows));
  written.push({ name, rows: rows.length });
}

// A couple of example session notes, so the notes display has something to show.
const noteDay = localMidnight(5);
const notes = [
  { epoch_ms: noteDay + Math.round(13.7 * 3_600_000), text: "back-to-back meetings after lunch", tag: "meetings" },
  { epoch_ms: noteDay + Math.round(10.8 * 3_600_000), text: "deep work on the parser, no interruptions", tag: "deep work" },
];
writeFileSync(
  join(ROOT, "notes", `notes-${new Date(noteDay).toISOString().slice(0, 10)}.jsonl`),
  notes.map((n) => JSON.stringify({ ...n, person_id: PERSON, created_ms: Date.now() })).join("\n") + "\n",
);

console.log("Wrote synthetic sessions (mode=mock, labelled as synthetic in the app):");
written.forEach((w) => console.log(`  data/${w.name}  ${w.rows} rows`));
console.log(`  notes/notes-${new Date(noteDay).toISOString().slice(0, 10)}.jsonl  ${notes.length} notes`);
