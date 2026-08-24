// Turns a noisy live stream into a state label that is stable enough to act on.
//
// Two rules matter here:
//  1. A poor signal reports "unreadable". It never reports a confident state,
//     because a loose electrode produces confident-looking nonsense.
//  2. A new state has to hold for a dwell period before it takes effect, so the
//     guide doesn't change personality halfway through a paragraph.

const USABLE = new Set(["great", "good", "mock"]);

export class StateEngine {
  constructor({ dwellMs = 8000, windowMs = 30_000, baseline = null } = {}) {
    this.dwellMs = dwellMs;
    this.windowMs = windowMs;
    this.baseline = baseline;      // { focus:{mean,sd}, calm:{mean,sd} } if known
    this.buffer = [];
    this.state = "unknown";
    this.candidate = null;
    this.candidateSince = 0;
    this.lastChangeMs = 0;
  }

  push(sample) {
    const { t, focus, calm, quality } = sample;
    this.buffer.push({ t, focus, calm, quality });
    while (this.buffer.length && t - this.buffer[0].t > this.windowMs) this.buffer.shift();

    const proposed = this._classify(t);
    if (proposed === this.state) { this.candidate = null; return this.state; }

    if (this.candidate !== proposed) { this.candidate = proposed; this.candidateSince = t; }
    if (t - this.candidateSince >= this.dwellMs) {
      this.state = proposed;
      this.candidate = null;
      this.lastChangeMs = t;
    }
    return this.state;
  }

  _classify(t) {
    const win = this.buffer;
    if (!win.length) return "unknown";

    const usable = win.filter((s) => USABLE.has(String(s.quality).toLowerCase()));
    if (usable.length / win.length < 0.5) return "unreadable";

    const avg = (k) => usable.reduce((a, s) => a + s[k], 0) / usable.length;
    const f = avg("focus"), c = avg("calm");

    // Against a personal baseline when we have one; otherwise against Neurosity's
    // own note that anything above 0.3 is already significant.
    const fz = this.baseline?.focus?.sd ? (f - this.baseline.focus.mean) / this.baseline.focus.sd : (f - 0.3) / 0.12;
    const cz = this.baseline?.calm?.sd ? (c - this.baseline.calm.mean) / this.baseline.calm.sd : (c - 0.3) / 0.12;

    if (fz >= 0.5) return "focused";
    if (fz <= -0.6) return "scattered";
    if (cz >= 0.6) return "calm";
    return "steady";
  }

  /** What the guide should do about the current state. Shape only, never substance. */
  get shaping() {
    switch (this.state) {
      case "focused":   return { depth: "full",   note: "Answering in full — you're reading as focused." };
      case "calm":      return { depth: "full",   note: "Answering in full — you're reading as calm and settled." };
      case "scattered": return { depth: "short",  note: "Keeping this short and stepwise — you're reading as scattered." };
      case "unreadable":return { depth: "normal", note: "Signal is poor, so this isn't adapting to your state." };
      case "unknown":   return { depth: "normal", note: "No live reading yet." };
      default:          return { depth: "normal", note: "Answering normally." };
    }
  }
}
