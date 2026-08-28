// Reading a Neurosity console CSV export: raw voltage, and nothing else.
//
// This is a different file format from the one collector/logger.js writes, and
// the two must not be confused. The logger writes one row every two seconds with
// focus and calm already computed on the headset. A console export is the raw
// signal underneath all of that: 256 rows a second, one column per electrode, no
// focus, no calm, no band power. Everything this project reports from a console
// export has to be computed here first.
//
// The format, as documented from the live console:
//   no header row, so line one is already sample zero
//   col 1       sample index, which restarts at 0 every 32-sample packet
//   col 2 to 9  CP3 C3 F5 PO3 PO4 F6 C4 CP4, microvolts, in that fixed order
//   col 10      always empty, never populated
//   col 11      millisecond timestamp, fractional
//
// Two quirks in real files that this parser has to survive: the timestamps step
// backwards a few times per recording, and the sample index is per packet rather
// than a running counter. Neither is an error in the file, so neither is treated
// as one here. We index by position and treat the nominal rate as authoritative,
// because slicing a stream like this by wall-clock time misbehaves.

/** The Crown's eight electrodes, in the fixed order the export writes them. */
export const CROWN_CHANNELS = ["CP3", "C3", "F5", "PO3", "PO4", "F6", "C4", "CP4"];

/** The Crown samples at 256 Hz. Used when the timestamps disagree with themselves. */
export const NOMINAL_RATE = 256;

const EXPECTED_COLUMNS = 11;

/**
 * Parse a console CSV export.
 * @param {string} text
 * @returns {{ok: boolean, reason?: string, channels?: object, timestamps?: Float64Array,
 *            sampleRate?: number, n?: number, durationSec?: number,
 *            warnings?: string[], timing?: object}}
 */
export function parseRawCsv(text) {
  const warnings = [];
  const lines = String(text).split(/\r?\n/);

  // Defensive: the console writes no header, but a file that has been through a
  // spreadsheet may have gained one. Detect it rather than parsing it as sample zero.
  let start = 0;
  if (lines.length && /[a-z]{2}/i.test(lines[0]) && !/^\s*-?\d/.test(lines[0])) {
    start = 1;
    warnings.push("This file has a header row. A console export does not, so it has been edited or re-saved somewhere.");
  }

  const chans = CROWN_CHANNELS.map(() => []);
  const times = [];
  let malformed = 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const p = line.split(",");
    if (p.length < EXPECTED_COLUMNS) { malformed++; continue; }

    // Voltages first: a row is only useful if every electrode reported.
    const volts = new Array(8);
    let bad = false;
    for (let c = 0; c < 8; c++) {
      const v = Number(p[c + 1]);
      if (!Number.isFinite(v)) { bad = true; break; }
      volts[c] = v;
    }
    if (bad) { malformed++; continue; }

    const t = Number(p[10]);
    if (!Number.isFinite(t)) { malformed++; continue; }

    for (let c = 0; c < 8; c++) chans[c].push(volts[c]);
    times.push(t);
  }

  const n = times.length;
  if (n === 0) {
    return {
      ok: false,
      reason: "empty",
      warnings: ["No readable rows. A Neurosity console CSV export has eleven comma-separated columns and no header row."],
    };
  }
  if (n < NOMINAL_RATE * 4) {
    return {
      ok: false,
      reason: "too-short",
      warnings: [`Only ${n} samples, which is under four seconds. There is not enough signal here to measure band power.`],
    };
  }
  if (malformed) warnings.push(`${malformed} line${malformed === 1 ? "" : "s"} could not be read and ${malformed === 1 ? "was" : "were"} skipped.`);

  const timestamps = Float64Array.from(times);
  const channels = {};
  CROWN_CHANNELS.forEach((name, c) => { channels[name] = Float32Array.from(chans[c]); });

  const timing = describeTiming(timestamps);
  // The measured rate is a sanity check on the file, not the number we compute with.
  // Backward timestamp steps make a measured rate slightly wrong, and a wrong rate
  // shifts every frequency in the analysis, so the nominal 256 Hz is used instead.
  const measuredRate = (n - 1) / (timing.spanMs / 1000);
  if (Math.abs(measuredRate - NOMINAL_RATE) > 2) {
    warnings.push(`Timestamps imply ${measuredRate.toFixed(2)} Hz rather than the Crown's 256 Hz. Analysis uses 256 Hz.`);
  }
  if (timing.backwardSteps) {
    warnings.push(`${timing.backwardSteps} timestamp${timing.backwardSteps === 1 ? " steps" : "s step"} backwards. This is normal in a console export and does not affect the analysis, which counts samples rather than clock time.`);
  }

  return {
    ok: true,
    channels,
    order: [...CROWN_CHANNELS],
    timestamps,
    sampleRate: NOMINAL_RATE,
    measuredRate,
    n,
    durationSec: n / NOMINAL_RATE,
    startMs: timestamps[0],
    warnings,
    timing,
  };
}

/** Backward steps and real breaks, reported rather than silently repaired. */
function describeTiming(ts, gapMs = 100) {
  let backwardSteps = 0, gaps = 0, maxStepMs = 0;
  for (let i = 1; i < ts.length; i++) {
    const d = ts[i] - ts[i - 1];
    if (d < 0) backwardSteps++;
    else if (d > gapMs) gaps++;
    if (d > maxStepMs) maxStepMs = d;
  }
  return { backwardSteps, gaps, gapThresholdMs: gapMs, maxStepMs, spanMs: ts[ts.length - 1] - ts[0] };
}

/** Does this text look like a console export rather than a logger CSV? */
export function looksLikeRawExport(text) {
  const first = String(text).split(/\r?\n/).find((l) => l.trim());
  if (!first) return false;
  if (/focus/i.test(first)) return false;          // that is the logger format
  return first.split(",").length >= EXPECTED_COLUMNS;
}
