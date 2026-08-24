// Everything the debrief says traces back to a number computed here.
// No model, no network, no randomness — same input always gives the same output.

/** Signal-quality labels we are willing to trust. "mock" is synthetic but internally consistent. */
const USABLE_QUALITY = new Set(["great", "good", "mock"]);

export function isUsable(row) {
  return USABLE_QUALITY.has(String(row.signal_quality).toLowerCase());
}

export function mean(xs) {
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Your personal normal, learned from the data rather than assumed.
 * Neurosity's own docs note that focus above 0.3 is already significant,
 * which is exactly why a fixed threshold like "0.7 is focused" misleads people.
 */
export function baseline(rows, key) {
  const xs = rows.filter(isUsable).map((r) => r[key]).filter(Number.isFinite);
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    n: xs.length,
    mean: mean(xs),
    sd: sd(xs),
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
  };
}

export function zScore(value, base) {
  if (!base || !Number.isFinite(value) || !base.sd) return 0;
  return (value - base.mean) / base.sd;
}

/**
 * Find runs where a z-scored series stays past a threshold.
 * Uses hysteresis: it takes a stronger reading to enter a run than to stay in one,
 * so a series hovering near the line doesn't produce dozens of fragments.
 */
export function findRuns(series, { enter, exit, minMs, direction = "above" }) {
  const runs = [];
  let start = null;
  const past = (v, t) => (direction === "above" ? v >= t : v <= t);

  for (let i = 0; i < series.length; i++) {
    const { t, z } = series[i];
    if (start === null) {
      if (past(z, enter)) start = i;
    } else if (!past(z, exit)) {
      pushRun(runs, series, start, i - 1, minMs);
      start = null;
    }
  }
  if (start !== null) pushRun(runs, series, start, series.length - 1, minMs);
  return runs;
}

function pushRun(runs, series, a, b, minMs) {
  const startMs = series[a].t, endMs = series[b].t;
  const durationMs = endMs - startMs;
  if (durationMs < minMs) return;
  const zs = series.slice(a, b + 1).map((p) => p.z);
  const vals = series.slice(a, b + 1).map((p) => p.v);
  runs.push({
    startMs, endMs, durationMs,
    meanZ: mean(zs),
    meanValue: mean(vals),
    peakValue: Math.max(...vals),
    lowValue: Math.min(...vals),
  });
}

/**
 * Label a single moment. Order matters: unreadable wins over everything.
 *
 * Note that "focused" does not require you to also be calm. Neurosity derives
 * focus from gamma and calm from alpha, and those two tend to move against each
 * other during demanding work -- so gating focus on calm would hide most of the
 * genuinely focused time, and would disagree with the peaks found below.
 */
export function classify(row, fz, cz) {
  if (!isUsable(row)) return "unreadable";
  if (fz >= 0.5) return "focused";
  if (fz <= -0.6) return "drifting";
  if (cz >= 0.6) return "calm";
  return "steady";
}

/** Detect breaks in recording (headset off, laptop asleep) so we don't average across them. */
function findGaps(rows) {
  if (rows.length < 3) return { medianStepMs: 2000, gaps: [] };
  const steps = [];
  for (let i = 1; i < rows.length; i++) steps.push(rows[i].epoch_ms - rows[i - 1].epoch_ms);
  const medianStepMs = quantile([...steps].sort((a, b) => a - b), 0.5) || 2000;
  const gaps = [];
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i].epoch_ms - rows[i - 1].epoch_ms;
    if (d > Math.max(medianStepMs * 5, 60_000)) {
      gaps.push({ fromMs: rows[i - 1].epoch_ms, toMs: rows[i].epoch_ms, durationMs: d });
    }
  }
  return { medianStepMs, gaps };
}

const BANDS = ["delta", "theta", "alpha", "beta", "gamma"];

/** The single function that turns rows into every fact the debrief uses. */
export function analyse(rows, options = {}) {
  const minPeakMs = options.minPeakMs ?? 3 * 60_000;
  const minSlumpMs = options.minSlumpMs ?? 4 * 60_000;
  // When a cross-session baseline exists, judge this session against your normal
  // rather than against itself. Without one, the session is its own reference --
  // which still works, it just cannot say "quieter than your usual Friday".
  const ext = options.baseline || null;

  if (!rows.length) return { ok: false, reason: "empty", rows: 0 };

  const usable = rows.filter(isUsable);
  const coverage = usable.length / rows.length;
  const { medianStepMs, gaps } = findGaps(rows);

  const startMs = rows[0].epoch_ms;
  const endMs = rows[rows.length - 1].epoch_ms;
  const gapMs = gaps.reduce((a, g) => a + g.durationMs, 0);
  const wallMs = endMs - startMs;
  const recordedMs = Math.max(0, wallMs - gapMs);

  const sessionFocus = baseline(rows, "focus");
  const sessionCalm = baseline(rows, "calm");
  const fBase = ext?.focus?.sd ? { ...sessionFocus, mean: ext.focus.mean, sd: ext.focus.sd, source: "cross-session" }
                               : { ...sessionFocus, source: "session" };
  const cBase = ext?.calm?.sd ? { ...sessionCalm, mean: ext.calm.mean, sd: ext.calm.sd, source: "cross-session" }
                              : { ...sessionCalm, source: "session" };

  const focusSeries = usable.map((r) => ({ t: r.epoch_ms, v: r.focus, z: zScore(r.focus, fBase) }));
  const calmSeries = usable.map((r) => ({ t: r.epoch_ms, v: r.calm, z: zScore(r.calm, cBase) }));

  const peaks = findRuns(focusSeries, { enter: 0.6, exit: 0.15, minMs: minPeakMs, direction: "above" })
    .sort((a, b) => b.durationMs - a.durationMs).slice(0, 3);
  const slumps = findRuns(focusSeries, { enter: -0.7, exit: -0.2, minMs: minSlumpMs, direction: "below" })
    .sort((a, b) => b.durationMs - a.durationMs).slice(0, 3);

  // Time in each state, counted in rows and converted to minutes.
  const counts = { focused: 0, calm: 0, steady: 0, drifting: 0, unreadable: 0 };
  rows.forEach((r) => {
    const fz = zScore(r.focus, fBase), cz = zScore(r.calm, cBase);
    counts[classify(r, fz, cz)]++;
  });
  const timeInState = {};
  for (const k of Object.keys(counts)) {
    timeInState[k] = { rows: counts[k], ms: counts[k] * medianStepMs, share: counts[k] / rows.length };
  }

  // Band averages, plus how the first half compared with the second.
  const halfIdx = Math.floor(usable.length / 2);
  const bands = {};
  for (const b of BANDS) {
    const all = usable.map((r) => r[b]).filter(Number.isFinite);
    const first = usable.slice(0, halfIdx).map((r) => r[b]).filter(Number.isFinite);
    const second = usable.slice(halfIdx).map((r) => r[b]).filter(Number.isFinite);
    bands[b] = { mean: mean(all), firstHalf: mean(first), secondHalf: mean(second), drift: mean(second) - mean(first) };
  }

  // Which hour of the day held up best.
  const byHour = new Map();
  usable.forEach((r) => {
    const h = new Date(r.epoch_ms).getHours();
    if (!byHour.has(h)) byHour.set(h, []);
    byHour.get(h).push(r.focus);
  });
  const hours = [...byHour.entries()]
    .map(([hour, xs]) => ({ hour, meanFocus: mean(xs), rows: xs.length }))
    .filter((h) => h.rows >= 10)
    .sort((a, b) => b.meanFocus - a.meanFocus);

  const longestStretchMs = peaks.length ? Math.max(...peaks.map((p) => p.durationMs)) : 0;

  return {
    ok: true,
    person: rows[0].person_id || "me",
    baselineSource: fBase.source,
    sessionFocus, sessionCalm,
    deepWorkMs: timeInState.focused.ms,
    settledMs: timeInState.calm.ms,
    longestStretchMs,
    mode: rows[0].mode || "unknown",
    synthetic: String(rows[0].mode).toLowerCase() === "mock",
    rows: rows.length,
    usableRows: usable.length,
    coverage,
    startMs, endMs, wallMs, recordedMs, medianStepMs, gaps,
    focus: fBase, calm: cBase,
    focusSeries, calmSeries,
    peaks, slumps, timeInState, bands,
    bestHour: hours[0] || null,
    worstHour: hours.length > 1 ? hours[hours.length - 1] : null,
  };
}
