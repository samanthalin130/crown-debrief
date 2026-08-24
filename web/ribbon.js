// StateRibbon and DeviationStrip — canvas, because a seven-hour session is
// thousands of rows and the DOM is the wrong tool for that.
//
// Rules this file enforces, from the visual system:
//   - one bin per pixel column, taking the MODAL state (averaging labels is meaningless)
//   - segments shorter than MIN_SEG px merge into their neighbour, so a noisy
//     minute doesn't become visual confetti
//   - poor signal is drawn as a hatch, never a solid fill: it is the absence of a
//     state and must never look like one
//   - a break in recording is a true gap, never interpolated across

const MIN_SEG = 9;

export const STATE_TOKEN = {
  focused: "--st-focus",
  calm: "--st-settle",
  steady: "--st-steady",
  drifting: "--st-drift",
  unreadable: "--st-none",
};

export const STATE_LABEL = {
  focused: "Focused", calm: "Settled", steady: "Steady",
  drifting: "Drifting", unreadable: "No reading",
};

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fitCanvas(cv, height) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 1;
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.round(height * dpr);
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, height);
  return { ctx, w, h: height };
}

function hatch(ctx, colour) {
  const p = document.createElement("canvas");
  p.width = p.height = 8;
  const c = p.getContext("2d");
  c.strokeStyle = colour;
  c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-2, 10); c.lineTo(10, -2); c.stroke();
  c.beginPath(); c.moveTo(-2, 18); c.lineTo(18, -2); c.stroke();
  return ctx.createPattern(p, "repeat");
}

/** Bin rows into one entry per pixel column. */
export function binSession(bins, x0, x1, width) {
  const out = new Array(width).fill(null);
  const span = x1 - x0 || 1;
  const buckets = Array.from({ length: width }, () => []);
  for (const b of bins) {
    const i = Math.min(width - 1, Math.max(0, Math.floor(((b.t - x0) / span) * width)));
    buckets[i].push(b);
  }
  for (let i = 0; i < width; i++) {
    const rows = buckets[i];
    if (!rows.length) { out[i] = { state: "gap", t: x0 + (span * i) / width }; continue; }
    const counts = {};
    let z = 0, n = 0;
    for (const r of rows) {
      counts[r.state] = (counts[r.state] || 0) + 1;
      if (Number.isFinite(r.z)) { z += r.z; n++; }
    }
    const state = Object.entries(counts).sort((a, b2) => b2[1] - a[1])[0][0];
    out[i] = { state, t: rows[0].t, z: n ? z / n : NaN, focus: rows[0].focus, calm: rows[0].calm };
  }
  // Merge runs shorter than MIN_SEG into whichever neighbour is longer.
  let i = 0;
  while (i < width) {
    let j = i;
    while (j < width && out[j].state === out[i].state) j++;
    if (j - i < MIN_SEG && (i > 0 || j < width)) {
      const left = i > 0 ? out[i - 1].state : null;
      const right = j < width ? out[j].state : null;
      const take = left && (!right || i > width - j) ? left : (right || left);
      if (take) for (let k = i; k < j; k++) out[k].state = take;
    }
    i = j;
  }
  return out;
}

export function drawRibbon(cv, cells) {
  const { ctx, w, h } = fitCanvas(cv, 44);
  const tokens = Object.fromEntries(Object.entries(STATE_TOKEN).map(([k, v]) => [k, css(v)]));
  const lineC = css("--panel-line");
  const noneC = css("--st-none");
  const hatchPattern = hatch(ctx, noneC);
  const scale = w / cells.length;

  let i = 0;
  while (i < cells.length) {
    let j = i;
    while (j < cells.length && cells[j].state === cells[i].state) j++;
    const x = i * scale, ww = (j - i) * scale;
    const st = cells[i].state;
    if (st === "gap") {
      // A break in recording. Given a faint fill and dashed edges so it reads as
      // "nothing was recorded here" rather than as a rendering failure.
      ctx.save();
      ctx.fillStyle = lineC; ctx.globalAlpha = .22; ctx.fillRect(x, 0, ww, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = lineC; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); ctx.moveTo(x + ww - .5, 0); ctx.lineTo(x + ww - .5, h); ctx.stroke();
      ctx.restore();
    } else if (st === "unreadable") {
      ctx.save(); ctx.globalAlpha = .55; ctx.fillStyle = hatchPattern; ctx.fillRect(x, 0, ww, h); ctx.restore();
    } else {
      ctx.fillStyle = tokens[st] || noneC;
      ctx.fillRect(x, 0, ww, h);
    }
    i = j;
  }
  // rounded mask
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  const r = 7;
  ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r); ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r); ctx.closePath();
  ctx.fill(); ctx.restore();
}

/** Bars showing how each bin compared with your normal for that hour of day. */
export function drawDeviation(cv, cells) {
  const { ctx, w, h } = fitCanvas(cv, 26);
  const tokens = Object.fromEntries(Object.entries(STATE_TOKEN).map(([k, v]) => [k, css(v)]));
  const scale = w / cells.length;
  const step = Math.max(1, Math.floor(cells.length / Math.max(1, Math.floor(w / 4))));
  for (let i = 0; i < cells.length; i += step) {
    const c = cells[i];
    if (c.state === "gap" || c.state === "unreadable" || !Number.isFinite(c.z)) continue;
    const mag = Math.max(0.06, Math.min(1, (c.z + 2.5) / 5));
    const bh = mag * h;
    ctx.fillStyle = tokens[c.state] || css("--st-none");
    ctx.globalAlpha = .5;
    ctx.fillRect(i * scale, h - bh, Math.max(1.5, step * scale - 1), bh);
  }
  ctx.globalAlpha = 1;
}
