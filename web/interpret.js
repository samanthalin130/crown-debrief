// The interpreter, running entirely in the browser.
//
// There is no server in this page and nothing to configure. The file the visitor
// drops is read by the same core/ modules Node runs in the tests, which is the
// whole reason those modules avoid anything Node-specific: the analysis that was
// verified against a real recording is the analysis that runs here.
//
// The interface follows the Console Decoded pattern deliberately. Scannable
// answers first, the reasoning behind a drop-down, and any term a first-time
// reader might not know rendered as a button that explains itself in place.

import { parseRawCsv, looksLikeRawExport, CROWN_CHANNELS } from "./core/raw-csv.js";
import { analyseRecording, BAND_KEYS, BANDS } from "./core/bandpower.js";
import { interpret, INDICATORS } from "./core/interpret.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const chCls = (c) => `t-${c.toLowerCase()}`;
const band = (b) => `<span class="t-${b}">${b}</span>`;
const chan = (c) => `<span class="${chCls(c)}">${c}</span>`;
const fx = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "-");

/* ---------------- explainable terms ----------------
   Every one of these is a term the guide's own audience asked about. Clicking a
   term opens the explanation next to it rather than sending anyone elsewhere. */
const EXPLAIN = {
  bandpower: {
    term: "Band power",
    what: "How much of the signal is oscillating at each speed. The five bands are ranges of frequency: delta 1 to 4 Hz, theta 4 to 8, alpha 8 to 13, beta 13 to 30, gamma 30 to 44.",
    mean: "It is the most interpretable thing eight dry electrodes produce. A share tells you how the signal was distributed, not how hard your brain was working.",
    do: "Compare shares between recordings or between minutes of one recording. Never read one as an absolute score.",
  },
  share: {
    term: "Share of total power",
    what: "A band's power divided by the power in all five bands, on one electrode, in one window. It is a proportion, so the five always add to 100 per cent.",
    mean: "Shares are used instead of raw microvolts because a channel's overall loudness moves with contact quality. A proportion survives that; an absolute value does not.",
    do: "Read the change across the recording. A share of 12 per cent means nothing on its own and a lot next to the 4 per cent it started at.",
  },
  quality: {
    term: "Signal quality",
    what: "How much each electrode's voltage swings, in microvolts, after slow drift is removed. This is the console's own measure, and this page reproduces its figures.",
    mean: "Nothing about your brain and everything about whether to trust the screen. Clean EEG swings by tens of microvolts. Thousands is muscle, usually jaw or brow.",
    do: "Check it before believing any other number. Read a recording through its clean channels and leave the loud ones out.",
  },
  drift: {
    term: "Slow drift",
    what: "A gradual wander in the voltage, below about 1 Hz, that comes from the electrode and the skin rather than from any rhythm.",
    mean: "It is very large compared with real EEG. Left in, it lands in delta and puts delta at 85 to 94 per cent of the power on every channel, squeezing everything else into the remainder.",
    do: "It is removed here before anything is measured. That is also what makes a standard deviation match the console's own signal-quality figure.",
  },
  posterior: {
    term: "The posterior electrodes",
    what: "PO3 and PO4, the two sensors over the back of the head.",
    mean: "Alpha is strongest over the back of the head, and these two sit furthest from the jaw and brow muscles that contaminate the frontal and central sites. They are usually the quietest channels in a recording.",
    do: "If the posterior pair is clean, an alpha reading is worth making. If it is not, there is no alpha reading to make.",
  },
  indicator: {
    term: "Indicator, not score",
    what: "A number computed here from band power, using a published method, and labelled as a computed indicator everywhere it appears.",
    mean: "It is not Neurosity's focus or calm score. Those come from models the company trained, they run on the headset, and a recording does not contain them. They cannot be recovered from raw voltage.",
    do: "Use an indicator to compare minutes within one recording. Do not compare it against a number the console showed you.",
  },
  engagement: {
    term: "The engagement ratio",
    what: "Beta divided by alpha plus theta, averaged over the readable electrodes. A long-standing measure in the attention literature.",
    mean: "Beta rises with active engaged thinking while alpha and theta rise as you disengage, so the ratio moves with effortful attention.",
    do: "Read it against the calm indicator rather than on its own. Note that it deliberately avoids gamma, the band Neurosity's focus score is built from, because gamma on dry electrodes is badly contaminated by muscle.",
  },
  window: {
    term: "Windows and epochs",
    what: "The signal is measured in 2 second epochs, the same window length the console works in, and those are then rolled up into the minutes reported here.",
    mean: "A single number for a whole recording hides the thing a session is about: whether anything changed while you sat there.",
    do: "Read the line window by window rather than the session average. An average over a whole recording can describe neither the beginning nor the peak.",
  },
};

let exSeq = 0;
/** Render a term as a button with a panel that opens in place beneath its card. */
function ex(key, label) {
  const e = EXPLAIN[key];
  if (!e) return esc(label);
  return `<button class="ex" type="button" data-ex="${key}" aria-expanded="false">${label}</button>`;
}
function panelFor(key) {
  const e = EXPLAIN[key];
  return `<div class="expanel" data-panel="${key}" hidden>
    <strong>${esc(e.term)}</strong>
    <p style="margin:0 0 8px">${esc(e.what)}</p>
    <p style="margin:0 0 8px"><em>What it means:</em> ${esc(e.mean)}</p>
    <p style="margin:0"><em>What to do with it:</em> ${esc(e.do)}</p>
  </div>`;
}
/** Wire every explainer button inside a container to the panels in that container. */
function wireExplainers(root) {
  root.querySelectorAll("button.ex").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.ex;
      const host = btn.closest("[data-exhost]") || root;
      const panel = host.querySelector(`.expanel[data-panel="${key}"]`);
      if (!panel) return;
      const open = panel.hasAttribute("hidden");
      host.querySelectorAll(".expanel").forEach((p) => p.setAttribute("hidden", ""));
      host.querySelectorAll("button.ex").forEach((b) => b.setAttribute("aria-expanded", "false"));
      if (open) { panel.removeAttribute("hidden"); btn.setAttribute("aria-expanded", "true"); }
    });
  });
}

/* ---------------- the minute-by-minute chart ----------------
   Drawn as inline SVG so it needs no library and scales with the page. */
function chart(series, { unit = "%", labels = [] } = {}) {
  const W = 900, H = 300, L = 52, R = 18, T = 18, B = 42;
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (!all.length) return "";
  const n = Math.max(...series.map((s) => s.values.length));
  const hi = Math.max(...all), lo = Math.min(0, Math.min(...all));
  const top = hi <= 0 ? 1 : hi * 1.15;
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (top - lo));

  const ticks = 4;
  let grid = "";
  for (let k = 0; k <= ticks; k++) {
    const v = lo + ((top - lo) * k) / ticks;
    grid += `<line class="grid" x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}"/>`
      + `<text class="axis" x="${L - 9}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${v.toFixed(unit === "%" ? 0 : 2)}${unit}</text>`;
  }
  let xlab = "";
  for (let i = 0; i < n; i++) {
    xlab += `<text class="axis" x="${x(i).toFixed(1)}" y="${H - B + 22}" text-anchor="middle">${esc(labels[i] || `w${i + 1}`)}</text>`;
  }
  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean);
    const dots = s.values.map((v, i) => (Number.isFinite(v)
      ? `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.6" fill="var(${s.css})"/>` : "")).join("");
    return `<polyline class="ln" points="${pts.join(" ")}" stroke="var(${s.css})"/>${dots}`;
  }).join("");

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Minute by minute values">
    ${grid}<line class="grid" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/>${xlab}${lines}</svg>`;
}

/* ---------------- rendering ---------------- */
function render(r, meta) {
  const q = r.quality;
  const chips = q.channels.map((c) => `
    <div class="chip ${c.level}">
      <span class="nm ${chCls(c.name)}">${c.name}</span>
      <span class="uv">${c.uv}<span style="font-size:12px;color:var(--ink-3)"> µV</span></span>
      <span class="lv">${c.level}</span>
    </div>`).join("");

  // A recording with nothing readable stops here. No chart, no indicators.
  if (!r.readable) {
    return `<section data-exhost>
      <h2><span class="n">Verdict</span>Not readable</h2>
      <p class="slede">${esc(r.headline)}</p>
      <div class="chips">${chips}</div>
      ${r.body.map((p) => `<p style="max-width:70ch;color:var(--ink-2)">${esc(p)}</p>`).join("")}
      <p style="max-width:70ch;color:var(--ink-2)">${ex("quality", "Signal quality")} is checked before anything else for exactly this reason: an electrode resting on hair still prints confident-looking numbers.</p>
      ${panelFor("quality")}
    </section>`;
  }

  const calm = r.indicators.calm, focus = r.indicators.focus;
  const posterior = q.usable.filter((c) => c === "PO3" || c === "PO4");
  const readCh = posterior.length ? posterior : q.usable;

  const alphaLines = readCh.map((c) => ({ label: `${c} alpha`, css: `--t-${c.toLowerCase()}`, values: r.perMinute[c].alpha }));
  const thetaLines = readCh.map((c) => ({ label: `${c} theta`, css: `--t-theta`, values: r.perMinute[c].theta }));

  const tk = [
    `<b>${q.usable.length} of 8</b> electrodes were quiet enough to read.`,
    `The calm indicator ${calm.direction}, ${fx(calm.first)}% to ${fx(calm.last)}%.`,
    calm.peak ? `It peaked at <b>${fx(calm.peak.value)}%</b> in ${esc(r.isMinute ? `minute ${calm.peak.window}` : `${r.windowLabels[calm.peak.window - 1]}`)}.` : `No clear peak.`,
    `The focus indicator ${focus.direction}, ${fx(focus.first, 2)} to ${fx(focus.last, 2)}.`,
    `These are computed indicators, <b>not</b> the console's focus and calm scores.`,
  ].map((t, i) => `<div class="tk"><span class="n">${String(i + 1).padStart(2, "0")}</span><p>${t}</p></div>`).join("");

  const findingRows = r.findings.map((f, i) => `
    <details class="row" ${i === 0 ? "open" : ""}>
      <summary class="rowhead">
        <span class="rownum">${i + 1}</span>
        <span class="rowtitle"><span class="t">${esc(f.title)}</span>
          <span class="answer">${esc(f.text.split(". ")[0])}.</span></span>
        <span class="chev">›</span>
      </summary>
      <div class="cols">
        <div class="col what"><span class="tag">What the numbers say</span><p>${esc(f.text)}</p>
          <div class="figs">${f.numbers.map((x) => `<span class="fig">${esc(x)}</span>`).join("")}</div></div>
      </div>
    </details>`).join("");

  const bandRows = r.bands.map((b) => {
    const binned = !q.usable.includes(b.name);
    return `<tr class="${binned ? "binned" : ""}">
      <td><span class="${chCls(b.name)}">${b.name}</span></td>
      <td>${b.uv}</td><td>${b.quality}</td>
      ${b.shares.map((s) => `<td>${fx(s)}</td>`).join("")}
    </tr>`;
  }).join("");

  return `
  <section data-exhost>
    <div class="tldr">
      <p class="lbl">The 10-second version</p>
      <p class="verdict">${esc(r.headline)}</p>
      <div class="tkgrid">${tk}</div>
    </div>
  </section>

  <section data-exhost>
    <h2><span class="n">Step 1</span>What is readable here</h2>
    <p class="slede">${ex("quality", "Signal quality")} first, every time. A gorgeous curve on a bad channel is fiction, so the channels are judged before anything is read from them. These figures are the console's own measure: how much each electrode swings once ${ex("drift", "slow drift")} is removed.</p>
    <div class="chips">${chips}</div>
    ${panelFor("quality")}${panelFor("drift")}
    <p class="tblnote">Clean is tens of microvolts. Marginal is hundreds and is read with care. Artifact is thousands, which is muscle rather than brain rhythm, and is drawn hatched so it cannot be mistaken for a reading.</p>
  </section>

  <section data-exhost>
    <h2><span class="n">Step 2</span>What the recording did</h2>
    <p class="slede">Measured in 2 second epochs and reported by the ${esc(r.unit)}, so a change is visible rather than averaged away. Read the shape, not the decimal.</p>
    <figure>
      <span class="cap">Alpha's ${ex("share", "share of total power")}, on ${posterior.length ? ex("posterior", "the posterior electrodes") : "the readable electrodes"}, by ${esc(r.unit)}</span>
      ${chart(alphaLines, { labels: r.windowLabels })}
      <div class="legend">${alphaLines.map((s) => `<span><i style="background:var(${s.css})"></i>${esc(s.label)}</span>`).join("")}</div>
    </figure>
    <figure>
      <span class="cap">Theta, the band to read next to alpha, on the same electrodes</span>
      ${chart(thetaLines.map((s, i) => ({ ...s, css: `--t-${readCh[i].toLowerCase()}` })), { labels: r.windowLabels })}
      <div class="legend">${thetaLines.map((s, i) => `<span><i style="background:var(--t-${readCh[i].toLowerCase()})"></i>${esc(s.label)}</span>`).join("")}</div>
    </figure>
    ${panelFor("share")}${panelFor("posterior")}${panelFor("window")}
    <p class="tblnote">Measured in ${ex("window", "2 second epochs")}, the console's own window length.</p>
  </section>

  <section data-exhost>
    <h2><span class="n">Step 3</span>The reading</h2>
    <p class="slede">Every sentence below is assembled from a number computed from your file, so any of it can be checked. Open a row for the figures behind it.</p>
    <div class="rows">${findingRows}</div>
  </section>

  <section data-exhost>
    <h2><span class="n">Step 4</span>The two indicators</h2>
    <p class="slede">Both are ${ex("indicator", "computed indicators, not the console's scores")}. Open each for what it is built from and what it will not tell you.</p>
    <div class="rows">
      ${[["calm", calm], ["focus", focus]].map(([k, ind], i) => `
      <details class="row">
        <summary class="rowhead"><span class="rownum">${i + 1}</span>
          <span class="rowtitle"><span class="t">${esc(INDICATORS[k].label)}</span>
            <span class="answer">${esc(ind.direction[0].toUpperCase() + ind.direction.slice(1))}, ${fx(ind.first, k === "focus" ? 2 : 1)}${ind.unit} to ${fx(ind.last, k === "focus" ? 2 : 1)}${ind.unit}.</span></span>
          <span class="chev">›</span></summary>
        <div class="cols">
          <div class="col what"><span class="tag">What it is</span><p>${esc(INDICATORS[k].basis)}</p></div>
          <div class="col mean"><span class="tag">Why that band</span><p>${esc(INDICATORS[k].why)}</p></div>
          <div class="col limit"><span class="tag">What it is not</span><p>${esc(INDICATORS[k].caveat)}</p></div>
        </div>
      </details>`).join("")}
    </div>
    ${panelFor("indicator")}${panelFor("engagement")}
    <p class="tblnote">The focus indicator uses ${ex("engagement", "the engagement ratio")} rather than gamma, on purpose.</p>
  </section>

  <section data-exhost>
    <h2><span class="n">Step 5</span>Every electrode, every band</h2>
    <p class="slede">${ex("bandpower", "Band power")} across the whole recording, as each band's ${ex("share", "share of total power")}. Rows left out of the reading are dimmed.</p>
    <div style="overflow-x:auto">
    <table><thead><tr>
      <th>Electrode</th><th>µV</th><th>Quality</th>
      ${BANDS.map((b) => `<th><span class="t-${b.key}">${b.key}</span> <span style="color:var(--ink-3)">${b.lo}-${b.hi}</span></th>`).join("")}
    </tr></thead><tbody>${bandRows}</tbody></table>
    </div>
    ${panelFor("bandpower")}${panelFor("share")}
    <p class="tblnote">Delta dominates every channel in a waking recording. That is mostly what is left of drift and movement after filtering, not a rhythm, which is why shares are compared between windows rather than read as absolutes.</p>
  </section>

  <section>
    <h2><span class="n">Finally</span>What this cannot tell you</h2>
    <div class="limits"><h3>Read these before quoting any number above</h3>
      <ul>${r.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
    <div class="actions">
      <button class="exbtn" id="copy">Copy summary</button>
      <button class="exbtn" id="again">Read another recording</button>
    </div>
    <p class="tblnote">${esc(meta.name)} · ${meta.samples.toLocaleString()} samples · ${fx(meta.durationSec, 1)} s · ${meta.sampleRate} Hz${meta.warnings.length ? ` · ${meta.warnings.length} note${meta.warnings.length === 1 ? "" : "s"} on the file` : ""}</p>
    ${meta.warnings.length ? `<ul class="tblnote" style="padding-left:19px">${meta.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
  </section>`;
}

/** A compact, labelled summary for pasting into whichever assistant you prefer. */
function summaryText(r, meta) {
  const L = [];
  L.push(`Neurosity Crown recording: ${meta.name}`);
  L.push(`${meta.samples} samples, ${meta.durationSec.toFixed(1)} s at ${meta.sampleRate} Hz, 8 electrodes.`);
  L.push(`Signal quality (uV, std-dev after 1 Hz high-pass): ${r.quality.channels.map((c) => `${c.name} ${c.uv} (${c.level})`).join(", ")}`);
  if (!r.readable) { L.push(`VERDICT: ${r.headline}`); return L.join("\n"); }
  L.push(`Readable channels: ${r.quality.usable.join(", ")}. Left out: ${r.quality.binned.join(", ") || "none"}.`);
  L.push(`Calm indicator (alpha share, posterior, % by minute): ${r.indicators.calm.values.join(", ")}`);
  L.push(`Focus indicator (beta/(alpha+theta), by minute): ${r.indicators.focus.values.join(", ")}`);
  L.push(`VERDICT: ${r.headline}`);
  L.push(`Limits: ${r.caveats.join(" ")}`);
  L.push(`NOTE: the indicators above are computed from band power. They are NOT Neurosity's focus and calm scores, which a recording does not contain.`);
  return L.join("\n");
}

/* ---------------- wiring ----------------
   Wrapped in an init rather than run at module scope, because the site this is
   built for runs Astro's ClientRouter: the page can be mounted again after a
   client-side navigation, and must not double-bind when it is. Standalone, the
   astro:page-load event simply never fires and this runs once. */

function initInterpreter() {
  const root = document.querySelector(".cd");
  if (!root || root.dataset.wired === "1") return;
  const drop = $("drop"), out = $("out"), err = $("err"), busy = $("busy");
  if (!drop || !out) return;          // not the interpreter page
  root.dataset.wired = "1";

  function fail(msg) {
    err.textContent = msg;
    err.hidden = false;
    busy.hidden = true;
  }
  function reset() {
    out.hidden = true; out.innerHTML = "";
    drop.hidden = false; err.hidden = true;
    $("exall").disabled = true; $("exall").textContent = "Expand all";
    $("another").hidden = true;
  }

  async function handle(file) {
    err.hidden = true;
    if (!file) return;
    if (file.size > 300 * 1024 * 1024) return fail("That file is over 300 MB, which is larger than this page can read in one go.");

    drop.hidden = true;
    busy.hidden = false;
    busy.textContent = `Reading ${file.name}\u2026`;
    // Yield once so the browser paints the busy state before the work starts.
    await new Promise((r) => setTimeout(r, 30));

    let text;
    try { text = await file.text(); }
    catch { drop.hidden = false; return fail("That file could not be opened."); }

    if (!looksLikeRawExport(text)) {
      drop.hidden = false;
      return fail("That does not look like a Neurosity console CSV export. A console export has eleven comma-separated columns and no header row. A focus-logger CSV, which has a 'focus' column, is a different format and is read by the session debrief instead.");
    }

    try {
      const parsed = parseRawCsv(text);
      if (!parsed.ok) {
        drop.hidden = false;
        return fail(parsed.warnings?.[0] || "That recording could not be read.");
      }
      // Below about 90 seconds there are too few minutes to say anything about
      // change, so the recording is cut into shorter windows instead. They are
      // named for their real length rather than called minutes.
      const windowSec = parsed.durationSec < 90 ? Math.max(10, Math.round(parsed.durationSec / 5 / 5) * 5) : 60;
      const analysis = analyseRecording(parsed, { windowSec });
      const r = interpret(analysis);
      const meta = { name: file.name, samples: parsed.n, durationSec: parsed.durationSec, sampleRate: parsed.sampleRate, warnings: parsed.warnings };

      busy.hidden = true;
      out.innerHTML = render(r, meta);
      out.hidden = false;
      wireExplainers(out);
      $("exall").disabled = false;
      $("another").hidden = false;
      $("again")?.addEventListener("click", reset);
      $("copy")?.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(summaryText(r, meta)); $("copy").textContent = "Copied"; }
        catch { $("copy").textContent = "Could not copy"; }
        setTimeout(() => { $("copy").textContent = "Copy summary"; }, 1600);
      });
      console.log("[Interpreter] read", file.name, analysis);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      drop.hidden = false;
      fail(`That recording could not be read: ${e.message}`);
      console.error("[Interpreter]", e);
    }
  }

  $("pick").addEventListener("click", () => $("file").click());
  $("file").addEventListener("change", (e) => handle(e.target.files[0]));
  $("another").addEventListener("click", reset);
  $("exall").addEventListener("click", () => {
    const rows = [...out.querySelectorAll("details.row")];
    const open = rows.some((r) => !r.open);
    rows.forEach((r) => { r.open = open; });
    $("exall").textContent = open ? "Collapse all" : "Expand all";
  });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => handle(e.dataTransfer?.files?.[0]));
  // A drop anywhere else on the page would otherwise navigate away from it.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  console.log("[Interpreter] ready. Drop a Neurosity console CSV export. Everything runs in this browser.");
}

initInterpreter();
document.addEventListener("astro:page-load", initInterpreter);
