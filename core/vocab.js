// The fixed vocabulary. Five words, used identically for every metric in the app.
//
// This exists because "write a sentence next to each number" produces fifteen
// inconsistent phrasings and no learnable scale. Oura reuses one four-word scale
// across every metric they show; this is the same discipline.
//
// Note what the words deliberately are NOT: good, bad, poor, excellent. The app
// describes where a reading sits relative to your own history. It does not grade
// anyone's brain.

export const MIN_SESSIONS_FOR_BASELINE = 10;

export const VOCAB = [
  { key: "well_above", word: "Well above usual", min: 1.5,   token: "st-focus" },
  { key: "above",      word: "Above usual",      min: 0.5,   token: "st-settle" },
  { key: "typical",    word: "Typical",          min: -0.5,  token: "st-none" },
  { key: "below",      word: "Below usual",      min: -1.5,  token: "st-drift" },
  { key: "well_below", word: "Well below usual", min: -Infinity, token: "st-drift" },
];

export const UNKNOWN = { key: "unknown", word: "Not enough data yet", token: "st-none", hatched: true };

/**
 * @param {number} z      how far from your own normal, in standard deviations
 * @param {boolean} ready whether a baseline exists at all
 */
export function describe(z, ready = true) {
  if (!ready || !Number.isFinite(z)) return UNKNOWN;
  return VOCAB.find((v) => z >= v.min) || VOCAB[VOCAB.length - 1];
}

/** Short form for a delta chip: "+22 min vs your usual Friday". */
export function deltaPhrase(deltaMs, ready, dayName = null) {
  if (!ready) return null;
  const mins = Math.round(deltaMs / 60000);
  if (Math.abs(mins) < 5) return `about the same as your usual${dayName ? ` ${dayName}` : ""}`;
  const sign = mins > 0 ? "+" : "−";
  const abs = Math.abs(mins);
  const amount = abs >= 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : `${abs} min`;
  return `${sign}${amount} vs your usual${dayName ? ` ${dayName}` : ""}`;
}
