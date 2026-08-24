// Your normal, learned from your own sessions.
//
// Every metric in the interface is read against this rather than against an
// absolute number, because focus and calm scores vary enormously between people.
// A fixed threshold like "0.7 is focused" is wrong for almost everyone, and
// Neurosity's own note that 0.3 is already significant shows how far off the
// intuitive reading is.
//
// Two things this deliberately does NOT do:
//   - invent a baseline from fewer than MIN_SESSIONS_FOR_BASELINE sessions
//   - compare an afternoon reading against an all-day average, which would
//     label almost everybody's afternoon a slump

import { mean, sd } from "./stats.js";
import { MIN_SESSIONS_FOR_BASELINE } from "./vocab.js";

/** The per-session figures the baseline tracks. */
export function sessionMetrics(a) {
  if (!a || !a.ok) return null;
  const longest = a.peaks.length ? Math.max(...a.peaks.map((p) => p.durationMs)) : 0;
  return {
    startMs: a.startMs,
    dayOfWeek: new Date(a.startMs).getDay(),
    deepWorkMs: a.timeInState.focused.ms,
    settledMs: a.timeInState.calm.ms,
    driftingMs: a.timeInState.drifting.ms,
    longestStretchMs: longest,
    recordedMs: a.recordedMs,
    coverage: a.coverage,
    focusMedian: a.focus.p50,
    calmMedian: a.calm.p50,
  };
}

const TRACKED = ["deepWorkMs", "settledMs", "driftingMs", "longestStretchMs", "focusMedian", "calmMedian"];

/**
 * Build the store from a list of analysed sessions.
 * @param {Array} analyses   results of analyse(), oldest or newest order doesn't matter
 * @param {object} opts      { window: how many recent sessions to use }
 */
export function buildBaseline(analyses, { window = 10 } = {}) {
  const all = analyses.map(sessionMetrics).filter(Boolean).sort((x, y) => y.startMs - x.startMs);
  const recent = all.slice(0, window);
  const ready = recent.length >= MIN_SESSIONS_FOR_BASELINE;

  const metrics = {};
  for (const key of TRACKED) {
    const xs = recent.map((m) => m[key]).filter(Number.isFinite);
    metrics[key] = { n: xs.length, mean: mean(xs), sd: sd(xs), values: xs };
  }

  // Per hour of day, so 3pm is compared with your other 3pms.
  const byHour = {};
  return {
    ready,
    sessionCount: all.length,
    windowCount: recent.length,
    needed: Math.max(0, MIN_SESSIONS_FOR_BASELINE - all.length),
    metrics,
    byHour,
    sessions: recent,
  };
}

/** Add per-hour focus norms. Kept separate because it needs the row-level series. */
export function addHourlyNorms(store, analyses, { window = 10 } = {}) {
  const recent = [...analyses].filter((a) => a && a.ok).sort((x, y) => y.startMs - x.startMs).slice(0, window);
  const buckets = new Map();
  for (const a of recent) {
    for (const p of a.focusSeries) {
      const h = new Date(p.t).getHours();
      if (!buckets.has(h)) buckets.set(h, []);
      buckets.get(h).push(p.v);
    }
  }
  const byHour = {};
  for (const [h, xs] of buckets) {
    if (xs.length < 30) continue;
    byHour[h] = { n: xs.length, mean: mean(xs), sd: sd(xs) };
  }
  store.byHour = byHour;
  return store;
}

/** How far today's value sits from your normal, in standard deviations. */
export function zFor(store, metricKey, value) {
  const m = store?.metrics?.[metricKey];
  if (!store?.ready || !m || !m.sd) return NaN;
  return (value - m.mean) / m.sd;
}

/** Same, for a single moment compared with your other readings at that hour. */
export function zForHour(store, hour, value) {
  const h = store?.byHour?.[hour];
  if (!store?.ready || !h || !h.sd) return NaN;
  return (value - h.mean) / h.sd;
}

/** The range drawn as the shaded band on a BaselineBandGauge. */
export function usualRange(store, metricKey) {
  const m = store?.metrics?.[metricKey];
  if (!store?.ready || !m || !Number.isFinite(m.mean)) return null;
  return { low: m.mean - m.sd, high: m.mean + m.sd, mean: m.mean };
}
