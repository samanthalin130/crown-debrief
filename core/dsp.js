// The signal processing the console does for you and an export does not.
//
// A console export is raw voltage over time. Every band figure in this project is
// computed here, from that voltage, using Welch's method: cut the signal into
// overlapping segments, window each one, take its power spectrum, and average the
// spectra. Averaging is the point. A single spectrum of noisy data is itself noisy,
// and EEG is noisy data.
//
// Nothing here is EEG-specific. It is tested against signals whose answer is known
// in advance, which is the only way to be sure a spectrum is right.

/**
 * In-place iterative radix-2 Cooley-Tukey FFT.
 * @param {Float64Array} re  real part, length a power of two
 * @param {Float64Array} im  imaginary part, same length
 */
export function fft(re, im) {
  const n = re.length;
  if (n !== im.length) throw new Error("fft: mismatched real and imaginary lengths");
  if (n & (n - 1)) throw new Error(`fft: length ${n} is not a power of two`);

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k], aIm = im[i + k];
        const bRe = re[i + k + len / 2], bIm = im[i + k + len / 2];
        const tRe = bRe * curRe - bIm * curIm;
        const tIm = bRe * curIm + bIm * curRe;
        re[i + k] = aRe + tRe; im[i + k] = aIm + tIm;
        re[i + k + len / 2] = aRe - tRe; im[i + k + len / 2] = aIm - tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Periodic Hann window, the standard choice for Welch averaging. */
export function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  return w;
}

/** Largest power of two not greater than n. */
export function floorPow2(n) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/**
 * Remove the mean and any linear trend from a segment.
 *
 * This matters more than it sounds. Dry EEG electrodes drift, and a slow drift is
 * a very large low-frequency component that would otherwise land in delta and
 * swamp everything else. Detrending is what stops a loose electrode from being
 * read as an enormous delta rhythm.
 */
export function detrend(x) {
  const n = x.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  if (n === 1) { out[0] = 0; return out; }

  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i];
  }
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  for (let i = 0; i < n; i++) out[i] = x[i] - (slope * i + intercept);
  return out;
}

/**
 * Welch power spectral density, one-sided, in units of (signal units)^2 per Hz.
 *
 * @param {ArrayLike<number>} signal
 * @param {number} sampleRate
 * @param {object} opts
 *   segment  samples per segment (rounded down to a power of two)
 *   overlap  fraction of a segment shared with the next, 0 to <1
 * @returns {{freqs: Float64Array, psd: Float64Array, segments: number, resolutionHz: number}}
 */
export function welchPsd(signal, sampleRate, { segment = 512, overlap = 0.5 } = {}) {
  const n = signal.length;
  if (!(sampleRate > 0)) throw new Error("welchPsd: sampleRate must be positive");
  if (!(overlap >= 0 && overlap < 1)) throw new Error("welchPsd: overlap must be in [0, 1)");

  const seg = Math.min(floorPow2(segment), floorPow2(n));
  if (seg < 8) throw new Error(`welchPsd: signal of ${n} samples is too short to analyse`);

  const step = Math.max(1, Math.round(seg * (1 - overlap)));
  const w = hann(seg);
  // Normalising by the sum of squared window values keeps the PSD calibrated,
  // so a sine of amplitude A integrates to A^2/2 regardless of window choice.
  let winPower = 0;
  for (let i = 0; i < seg; i++) winPower += w[i] * w[i];
  const scale = 1 / (sampleRate * winPower);

  const bins = seg / 2 + 1;
  const psd = new Float64Array(bins);
  const re = new Float64Array(seg);
  const im = new Float64Array(seg);

  let segments = 0;
  for (let start = 0; start + seg <= n; start += step) {
    const slice = new Float64Array(seg);
    for (let i = 0; i < seg; i++) slice[i] = signal[start + i];
    const d = detrend(slice);

    for (let i = 0; i < seg; i++) { re[i] = d[i] * w[i]; im[i] = 0; }
    fft(re, im);

    for (let k = 0; k < bins; k++) {
      const mag2 = re[k] * re[k] + im[k] * im[k];
      // Bins between DC and Nyquist stand for two sides of the spectrum.
      const oneSided = (k === 0 || k === seg / 2) ? mag2 : mag2 * 2;
      psd[k] += oneSided * scale;
    }
    segments++;
  }

  if (segments === 0) throw new Error("welchPsd: no complete segment fitted in the signal");
  for (let k = 0; k < bins; k++) psd[k] /= segments;

  const freqs = new Float64Array(bins);
  for (let k = 0; k < bins; k++) freqs[k] = (k * sampleRate) / seg;

  return { freqs, psd, segments, resolutionHz: sampleRate / seg };
}

/**
 * Integrate a PSD across [loHz, hiHz).
 * Bins are included by centre frequency, and the result is a power, not a density.
 */
export function bandPower(freqs, psd, loHz, hiHz) {
  const df = freqs.length > 1 ? freqs[1] - freqs[0] : 0;
  let sum = 0;
  for (let k = 0; k < freqs.length; k++) {
    if (freqs[k] >= loHz && freqs[k] < hiHz) sum += psd[k];
  }
  return sum * df;
}

/** Root mean square of a signal, after detrending. The plainest measure of how loud a channel is. */
export function rms(signal) {
  const d = detrend(Float64Array.from(signal));
  let s = 0;
  for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  return d.length ? Math.sqrt(s / d.length) : 0;
}

/**
 * Second-order Butterworth high-pass, applied forwards then backwards.
 *
 * Running it both ways doubles the roll-off but cancels the phase shift, so a
 * rhythm still sits where it actually happened in time. This is the filter that
 * reproduces the console's own signal-quality figures: a raw standard deviation
 * does not match them, and a standard deviation after removing drift below 1 Hz
 * does.
 *
 * @param {ArrayLike<number>} signal
 * @param {number} sampleRate
 * @param {number} cutoffHz
 */
export function highPass(signal, sampleRate, cutoffHz = 1) {
  const n = signal.length;
  if (n < 9) return Float64Array.from(signal);

  // Bilinear-transform coefficients for a 2nd-order Butterworth high-pass.
  const wc = Math.tan((Math.PI * cutoffHz) / sampleRate);
  const k = Math.SQRT2 * wc;
  const norm = 1 + k + wc * wc;
  const b0 = 1 / norm, b1 = -2 / norm, b2 = 1 / norm;
  const a1 = (2 * (wc * wc - 1)) / norm;
  const a2 = (1 - k + wc * wc) / norm;

  const once = (x) => {
    const y = new Float64Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xi; y2 = y1; y1 = yi;
      y[i] = yi;
    }
    return y;
  };

  // Pad by reflection so the filter's start-up transient lands outside the data.
  const pad = Math.min(3 * 4, n - 1);
  const ext = new Float64Array(n + 2 * pad);
  for (let i = 0; i < pad; i++) ext[i] = 2 * signal[0] - signal[pad - i];
  for (let i = 0; i < n; i++) ext[pad + i] = signal[i];
  for (let i = 0; i < pad; i++) ext[pad + n + i] = 2 * signal[n - 1] - signal[n - 2 - i];

  const fwd = once(ext);
  const rev = new Float64Array(fwd.length);
  for (let i = 0; i < fwd.length; i++) rev[i] = fwd[fwd.length - 1 - i];
  const back = once(rev);

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = back[back.length - 1 - (pad + i)];
  return out;
}

/** Standard deviation of a signal. */
export function stdDev(x) {
  const n = x.length;
  if (n < 2) return 0;
  let m = 0;
  for (let i = 0; i < n; i++) m += x[i];
  m /= n;
  let s = 0;
  for (let i = 0; i < n; i++) s += (x[i] - m) ** 2;
  return Math.sqrt(s / (n - 1));
}
