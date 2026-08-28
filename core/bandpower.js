// Band power per electrode, computed from raw voltage.
//
// The console shows you band power and then throws it away when you export, so
// this is the module that puts it back. It works in short epochs and then rolls
// them up, because a single number for a five-minute session hides exactly the
// thing a session is about: whether something changed while you sat there.
//
// Band edges are the console's own: delta 1-4, theta 4-8, alpha 8-13,
// beta 13-30, gamma 30-44 Hz.

import { welchPsd, bandPower, highPass, stdDev } from "./dsp.js";
import { CROWN_CHANNELS } from "./raw-csv.js";

export const BANDS = [
  { key: "delta", lo: 1, hi: 4 },
  { key: "theta", lo: 4, hi: 8 },
  { key: "alpha", lo: 8, hi: 13 },
  { key: "beta", lo: 13, hi: 30 },
  { key: "gamma", lo: 30, hi: 44 },
];
export const BAND_KEYS = BANDS.map((b) => b.key);

/** The console works in 2 second windows, so the epoch analysis does too. */
export const EPOCH_SEC = 2;

/**
 * How much a channel swings, after slow drift is removed.
 *
 * This is the console's own signal-quality measure, reverse-engineered: a raw
 * standard deviation does not match the console's figures, and a standard
 * deviation after a 1 Hz high-pass reproduces them to within a fraction of a
 * percent on the loud channels.
 *
 * The thresholds come from what the hardware actually does rather than from a
 * standard: clean EEG swings by tens of microvolts, and thousands means artifact,
 * usually jaw or brow muscle. Frontal and central electrodes sit near those
 * muscles; the posterior pair usually stays quietest.
 */
export function channelQuality(signal, sampleRate) {
  const uv = stdDev(highPass(signal, sampleRate, 1));
  let level, note;
  if (!Number.isFinite(uv) || uv < 1) {
    level = "flat";
    note = "Almost no signal. The electrode was probably not touching skin.";
  } else if (uv <= 150) {
    level = "clean";
    note = "Swings by tens of microvolts, which is what clean EEG looks like.";
  } else if (uv <= 1000) {
    level = "marginal";
    note = "Louder than clean EEG. Readable, but read it alongside the quieter channels.";
  } else {
    level = "artifact";
    note = "Swings by thousands of microvolts. That is muscle or movement, not brain rhythm.";
  }
  return { uv, level, note, usable: level === "clean" || level === "marginal" };
}

/** Band powers and shares for one stretch of one channel. */
function spectrumOf(slice, sampleRate) {
  const { freqs, psd } = welchPsd(slice, sampleRate, { segment: slice.length, overlap: 0.5 });
  const power = {};
  let total = 0;
  for (const b of BANDS) {
    const p = bandPower(freqs, psd, b.lo, b.hi);
    power[b.key] = p;
    total += p;
  }
  const share = {};
  for (const b of BANDS) share[b.key] = total > 0 ? power[b.key] / total : NaN;
  return { power, share, total };
}

/**
 * Analyse a parsed recording.
 *
 * Slow drift is removed at 1 Hz before any band is measured. This is not a
 * cosmetic choice. Dry electrodes drift, drift is very large, and it lands in
 * delta, where it is not brain rhythm at all. Leaving it in puts delta at 85 to
 * 94 per cent of the power on every channel and squeezes everything else into the
 * remainder. The same filter is what reproduces the console's own signal-quality
 * figures, so it is the console's own convention as much as ours.
 *
 * @param {object} parsed  the result of parseRawCsv
 * @param {object} opts    { windowSec, highPassHz: set to 0 to measure the raw signal }
 */
export function analyseRecording(parsed, { windowSec = 60, highPassHz = 1 } = {}) {
  if (!parsed || !parsed.ok) return { ok: false, reason: parsed?.reason || "unparsed" };

  const fs = parsed.sampleRate;
  const n = parsed.n;
  const epochLen = Math.round(EPOCH_SEC * fs);
  const perWindow = Math.max(1, Math.round(windowSec / EPOCH_SEC));

  const channels = {};
  for (const name of CROWN_CHANNELS) {
    const raw = parsed.channels[name];
    const quality = channelQuality(raw, fs);
    const sig = highPassHz > 0 ? highPass(raw, fs, highPassHz) : raw;

    // Epoch series: one spectrum every EPOCH_SEC, the console's own window.
    const epochs = [];
    for (let start = 0; start + epochLen <= n; start += epochLen) {
      const slice = sig.subarray(start, start + epochLen);
      const s = spectrumOf(slice, fs);
      epochs.push({ tSec: start / fs, ...s });
    }

    // Roll epochs up into reported windows. Two ways of averaging a share are
    // defensible and they do not agree, so both are kept rather than one being
    // quietly chosen: the power-weighted share is the share of the window's total
    // power, and the mean share is the average of the individual epoch shares. A
    // loud epoch dominates the first and counts once in the second.
    const windows = [];
    for (let w = 0; w * perWindow < epochs.length; w++) {
      const group = epochs.slice(w * perWindow, (w + 1) * perWindow);
      if (!group.length) continue;
      const summed = {};
      let grandTotal = 0;
      for (const b of BAND_KEYS) {
        summed[b] = group.reduce((a, e) => a + e.power[b], 0) / group.length;
        grandTotal += summed[b];
      }
      const weightedShare = {}, meanShare = {};
      for (const b of BAND_KEYS) {
        weightedShare[b] = grandTotal > 0 ? summed[b] / grandTotal : NaN;
        const xs = group.map((e) => e.share[b]).filter(Number.isFinite);
        meanShare[b] = xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN;
      }
      windows.push({
        index: w,
        startSec: group[0].tSec,
        endSec: group[group.length - 1].tSec + EPOCH_SEC,
        epochs: group.length,
        power: summed,
        share: weightedShare,
        meanShare,
      });
    }

    // Whole session, computed the same two ways for the same reason.
    const whole = { power: {}, share: {}, meanShare: {} };
    let wholeTotal = 0;
    for (const b of BAND_KEYS) {
      whole.power[b] = epochs.reduce((a, e) => a + e.power[b], 0) / (epochs.length || 1);
      wholeTotal += whole.power[b];
    }
    for (const b of BAND_KEYS) {
      whole.share[b] = wholeTotal > 0 ? whole.power[b] / wholeTotal : NaN;
      const xs = epochs.map((e) => e.share[b]).filter(Number.isFinite);
      whole.meanShare[b] = xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN;
    }

    channels[name] = { name, quality, epochs, windows, whole };
  }

  const clean = CROWN_CHANNELS.filter((c) => channels[c].quality.level === "clean");
  const usable = CROWN_CHANNELS.filter((c) => channels[c].quality.usable);

  return {
    ok: true,
    sampleRate: fs,
    n,
    durationSec: parsed.durationSec,
    startMs: parsed.startMs,
    windowSec,
    highPassHz,
    epochSec: EPOCH_SEC,
    windowCount: channels[CROWN_CHANNELS[0]].windows.length,
    channels,
    order: [...CROWN_CHANNELS],
    cleanChannels: clean,
    usableChannels: usable,
    warnings: parsed.warnings || [],
    timing: parsed.timing,
  };
}

/** Mean of a band's per-window share across a set of channels. */
export function acrossChannels(analysis, chans, band, { weighted = true } = {}) {
  const key = weighted ? "share" : "meanShare";
  const count = analysis.windowCount;
  const out = [];
  for (let w = 0; w < count; w++) {
    const xs = chans.map((c) => analysis.channels[c].windows[w]?.[key]?.[band]).filter(Number.isFinite);
    out.push(xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN);
  }
  return out;
}
