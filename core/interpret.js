// Turning band power into English, with the claim never stronger than the evidence.
//
// Every sentence here is assembled from a number computed in bandpower.js, the
// same discipline the rest of this project follows: no model writes any of it, so
// any claim can be checked against the recording.
//
// Two rules this module exists to enforce.
//
// A recording with no usable channel produces no interpretation at all. Six loud
// electrodes and two quiet ones is a two-channel recording, and it is read as one.
// An electrode resting on hair still prints confident-looking numbers, and the
// only defence against that is to refuse.
//
// Nothing here is Neurosity's focus or calm score. Those are the output of the
// company's own trained models, they run on the headset, and the console throws
// them away when you export. They cannot be recovered from raw voltage and this
// module does not pretend to. What it computes are named, documented indicators
// built from band power, and they are labelled as indicators everywhere they
// appear.

import { BAND_KEYS, acrossChannels } from "./bandpower.js";

/** Posterior electrodes. Alpha is strongest over the back of the head. */
export const POSTERIOR = ["PO3", "PO4"];

export const INDICATORS = {
  calm: {
    label: "Calm indicator",
    basis: "Alpha's share of total power, averaged over the posterior electrodes.",
    why: "Alpha is the relaxed-alert rhythm. It rises over the back of the head when you disengage from effortful attention, and it is the most reliable thing eight dry electrodes can show you.",
    caveat: "This is not Neurosity's calm score. That score comes from a trained model that runs on the headset and is not written into an export.",
  },
  focus: {
    label: "Focus indicator",
    basis: "Beta divided by alpha plus theta, the engagement ratio, averaged over the usable electrodes.",
    why: "Beta rises with active engaged thinking while alpha and theta rise as you disengage, so the ratio moves with effortful attention. It is a long-standing measure in the attention literature.",
    caveat: "This is not Neurosity's focus score. Theirs is built from gamma, and gamma on dry electrodes is badly contaminated by jaw and brow muscle, which is why focus is the less trustworthy of their two scores. The ratio used here avoids gamma for that reason, so it will not track their number.",
  },
};

const round = (x, d = 1) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
/** Fixed one decimal, so prose never reads "10%" beside "13.7%". */
const fx = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "-");

/** Least-squares slope per window, used only to describe direction. */
function slope(ys) {
  const xs = ys.map((_, i) => i).filter((i) => Number.isFinite(ys[i]));
  if (xs.length < 3) return NaN;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = xs.reduce((a, i) => a + ys[i], 0) / n;
  let num = 0, den = 0;
  for (const i of xs) { num += (i - mx) * (ys[i] - my); den += (i - mx) ** 2; }
  return den === 0 ? NaN : num / den;
}

function peakOf(ys) {
  let bi = -1, bv = -Infinity;
  ys.forEach((v, i) => { if (Number.isFinite(v) && v > bv) { bv = v; bi = i; } });
  return bi < 0 ? null : { index: bi, value: bv };
}

/** A series' shape, in words, with the numbers that produced them. */
function describeShape(ys, { unit = "%", scale = 100 } = {}) {
  const vals = ys.map((y) => (Number.isFinite(y) ? y * scale : NaN));
  const first = vals[0], last = vals[vals.length - 1];
  const pk = peakOf(vals);
  const s = slope(vals);
  const range = Math.max(...vals.filter(Number.isFinite)) - Math.min(...vals.filter(Number.isFinite));

  let direction = "held roughly steady";
  if (Number.isFinite(s)) {
    if (s > range * 0.12) direction = "rose across the recording";
    else if (s < -range * 0.12) direction = "fell across the recording";
  }
  const peaksEarly = pk && pk.index > 0 && pk.index < vals.length - 1;
  return {
    values: vals.map((v) => round(v)),
    first: round(first), last: round(last),
    peak: pk ? { window: pk.index + 1, value: round(pk.value) } : null,
    peaksMidway: !!peaksEarly,
    direction, unit,
  };
}

/**
 * Interpret an analysed recording.
 * @param {object} a  the result of analyseRecording
 */
export function interpret(a) {
  if (!a || !a.ok) return { ok: false, reason: a?.reason || "unanalysed" };

  const usable = a.usableChannels;
  const posterior = POSTERIOR.filter((c) => a.usableChannels.includes(c));
  const quality = {
    usable, clean: a.cleanChannels,
    binned: a.order.filter((c) => !usable.includes(c)),
    channels: a.order.map((c) => ({ name: c, ...a.channels[c].quality, uv: round(a.channels[c].quality.uv, 0) })),
  };

  // The refusal. Everything below depends on there being something worth reading.
  if (usable.length === 0) {
    return {
      ok: true, readable: false, quality,
      durationSec: a.durationSec, windowSec: a.windowSec,
      headline: "No electrode on this recording is quiet enough to read.",
      body: [
        `All eight channels swing by more than clean EEG does, which is tens of microvolts rather than hundreds or thousands. That is muscle and movement, not brain rhythm.`,
        `Nothing is reported from this file, because any band figure taken from it would describe the artifact rather than you. Re-record with better contact: part the hair under each sensor and wait for the console's signal quality to settle before starting.`,
      ],
      findings: [], indicators: null,
    };
  }

  const calmSeries = acrossChannels(a, posterior.length ? posterior : usable, "alpha");
  const focusSeries = usable.length
    ? a.channels[usable[0]].windows.map((_, w) => {
        const xs = usable.map((c) => {
          const s = a.channels[c].windows[w]?.share;
          if (!s) return NaN;
          const d = s.alpha + s.theta;
          return d > 0 ? s.beta / d : NaN;
        }).filter(Number.isFinite);
        return xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : NaN;
      })
    : [];

  const calm = describeShape(calmSeries);
  const focus = describeShape(focusSeries, { unit: "", scale: 1 });
  const theta = describeShape(acrossChannels(a, posterior.length ? posterior : usable, "theta"));

  const mins = (i) => `minute ${i}`;
  const findings = [];

  findings.push({
    key: "quality",
    title: "What is readable here",
    text: usable.length === a.order.length
      ? `All eight electrodes are quiet enough to read.`
      : `${usable.length} of 8 electrodes ${usable.length === 1 ? "is" : "are"} quiet enough to read: ${usable.join(" and ")}. The other ${quality.binned.length} swing by hundreds or thousands of microvolts, which is muscle rather than brain rhythm, so they are left out. Every figure below comes from the ${usable.length === 1 ? "one channel that survived" : `${usable.length} channels that survived`}.`,
    numbers: quality.channels.map((c) => `${c.name} ${c.uv} µV`),
  });

  findings.push({
    key: "calm",
    title: "The calm indicator",
    text: `Alpha's share over ${posterior.length ? "the posterior electrodes" : "the readable electrodes"} ${calm.direction}, from ${fx(calm.first)}% in ${mins(1)} to ${fx(calm.last)}% in ${mins(calm.values.length)}${calm.peak ? `, peaking at ${fx(calm.peak.value)}% in ${mins(calm.peak.window)}` : ""}.`
      + (calm.peaksMidway ? ` The peak is not at the end, so whatever this recording was doing had already begun to reverse before it stopped.` : ""),
    numbers: calm.values.map((v, i) => `${mins(i + 1)}: ${fx(v)}%`),
  });

  findings.push({
    key: "focus",
    title: "The focus indicator",
    text: `The engagement ratio ${focus.direction}, from ${fx(focus.first, 2)} in ${mins(1)} to ${fx(focus.last, 2)} in ${mins(focus.values.length)}. Read it against the calm indicator rather than on its own: the two are built from overlapping bands and tend to move against each other.`,
    numbers: focus.values.map((v, i) => `${mins(i + 1)}: ${fx(v, 2)}`),
  });

  // Alpha and theta rising together late is the direction of drowsiness rather
  // than deeper calm. Worth saying, and worth saying no more strongly than this.
  // Alpha and theta rising together is the direction of drowsiness rather than
  // deeper calm, but only if they actually rose together. The claim is assembled
  // from the two slopes so it cannot outrun them.
  const calmUp = slope(calm.values) > 0;
  const thetaUp = slope(theta.values) > 0;
  const thetaLate = theta.peak && theta.peak.window >= Math.ceil(theta.values.length * 0.6);
  const thetaAfterAlpha = theta.peak && calm.peak && theta.peak.window > calm.peak.window;

  if (calmUp && (thetaUp || thetaLate)) {
    let reading;
    if (thetaAfterAlpha) {
      reading = `Theta kept climbing after alpha turned over, peaking a window later. Alpha rising on its own is relaxation; alpha and theta rising together, with theta still going after alpha stops, is the direction of drowsiness rather than deeper calm.`;
    } else if (thetaUp && thetaLate) {
      reading = `Alpha rising on its own is relaxation. These two rose together and theta was still high late in the recording, which is the direction of drowsiness rather than deeper calm.`;
    } else {
      reading = `Alpha rising on its own is relaxation. Theta moved with it here rather than after it, which reads as settling rather than as drifting toward sleep.`;
    }
    findings.push({
      key: "theta",
      title: "Theta, read next to alpha",
      text: `Theta ${theta.direction}, from ${fx(theta.first)}% to ${fx(theta.last)}%${theta.peak ? `, peaking at ${fx(theta.peak.value)}% in ${mins(theta.peak.window)}` : ""}. ${reading}`,
      numbers: theta.values.map((v, i) => `${mins(i + 1)}: ${fx(v)}%`),
    });
  }

  const headline = calm.peaksMidway
    ? `The calm indicator rose to a peak of ${fx(calm.peak.value)}% in ${mins(calm.peak.window)} and had eased back by the end.`
    : calm.direction === "rose across the recording"
      ? `The calm indicator rose across the recording, ending at its highest.`
      : calm.direction === "fell across the recording"
        ? `The calm indicator fell across the recording.`
        : `The calm indicator held roughly steady across the recording.`;

  const caveats = [
    `${usable.length} of 8 electrodes readable. A recording is only as good as its quietest channels.`,
    `${Math.round(a.durationSec / 60)} minute${Math.round(a.durationSec / 60) === 1 ? "" : "s"} is a short recording, and one recording is not a pattern.`,
    `The indicators are computed from band power. They are not Neurosity's focus and calm scores, which are model outputs that an export does not contain.`,
    `Exact percentages shift with preprocessing choices. The direction and the timing of a change are far more robust than the size of it, so read the shape rather than the decimal.`,
    `Nothing here is diagnostic. The Crown is a consumer wellness device, and the honest ceiling of eight dry electrodes is state, not condition.`,
  ];

  return {
    ok: true, readable: true, quality,
    durationSec: a.durationSec, windowSec: a.windowSec, windowCount: a.windowCount,
    headline, findings, caveats,
    indicators: {
      calm: { ...INDICATORS.calm, ...calm, series: calmSeries },
      focus: { ...INDICATORS.focus, ...focus, series: focusSeries },
    },
    bands: a.order.map((c) => ({
      name: c,
      quality: a.channels[c].quality.level,
      uv: round(a.channels[c].quality.uv, 0),
      shares: BAND_KEYS.map((b) => round(a.channels[c].whole.share[b] * 100)),
    })),
    perMinute: a.order.reduce((acc, c) => {
      acc[c] = BAND_KEYS.reduce((o, b) => {
        o[b] = a.channels[c].windows.map((w) => round(w.share[b] * 100));
        return o;
      }, {});
      return acc;
    }, {}),
  };
}
