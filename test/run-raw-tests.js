// Checks for the raw-export pipeline: parsing a console CSV, the signal
// processing, band power per electrode, and the interpretation built on top.
//
// Two kinds of check here, and the distinction matters.
//
// Most of these run against signals whose answer is known before the test does:
// a sine of a known amplitude has a known power, so a spectrum that disagrees is
// wrong and there is nothing to argue about. That is the only honest way to test
// a spectrum, because eyeballing a plot of real EEG will confirm anything.
//
// The last group runs against a real Crown recording and checks the output
// against figures the Neurosity console itself produced. Those files are not in
// version control, so that group skips when they are absent and says so.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0, skip = 0;

function t(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}
function skipped(name, why) { console.log(`  skip ${name}\n       ${why}`); skip++; }
function ok(cond, msg) { if (!cond) throw new Error(msg || "expected true"); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg || `${a} !== ${b}`); }
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error(msg || `${a} is not within ${tol} of ${b}`);
}

const { fft, welchPsd, bandPower, detrend, highPass, stdDev, rms, floorPow2 } = await import("../core/dsp.js");
const { parseRawCsv, looksLikeRawExport, CROWN_CHANNELS, NOMINAL_RATE } = await import("../core/raw-csv.js");
const { analyseRecording, channelQuality, BAND_KEYS } = await import("../core/bandpower.js");
const { interpret } = await import("../core/interpret.js");

const FS = 256;
const sine = (f, amp, n, rate = FS) => {
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * f * i) / rate);
  return x;
};
const addTo = (x, f, amp, rate = FS) => {
  for (let i = 0; i < x.length; i++) x[i] += amp * Math.sin((2 * Math.PI * f * i) / rate);
  return x;
};
/** Deterministic pseudo-noise, so a failure is always reproducible. */
function noise(n, amp, seed = 1) {
  let s = seed; const x = new Float64Array(n);
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; x[i] = (s / 0x7fffffff - 0.5) * amp; }
  return x;
}

console.log("\nfft and windowing");
{
  t("rejects a length that is not a power of two", () => {
    let threw = false;
    try { fft(new Float64Array(6), new Float64Array(6)); } catch { threw = true; }
    ok(threw, "a length of 6 should have been rejected");
  });
  t("floorPow2 rounds down", () => { eq(floorPow2(1000), 512); eq(floorPow2(1024), 1024); });
  t("a constant signal transforms to DC only", () => {
    const n = 64;
    const re = new Float64Array(n).fill(3), im = new Float64Array(n);
    fft(re, im);
    near(re[0], 3 * n, 1e-9, "DC bin wrong");
    for (let k = 1; k < n; k++) near(Math.hypot(re[k], im[k]), 0, 1e-9, `bin ${k} should be empty`);
  });
  t("detrend removes a mean and a slope", () => {
    const x = new Float64Array(100);
    for (let i = 0; i < 100; i++) x[i] = 50 + 7 * i;
    const d = detrend(x);
    for (let i = 0; i < 100; i++) near(d[i], 0, 1e-9, `sample ${i} left over`);
  });
}

console.log("\npower spectral density, against known answers");
{
  t("a sine of amplitude A has power A squared over two", () => {
    const { freqs, psd } = welchPsd(sine(10, 10, FS * 20), FS, { segment: 1024 });
    near(bandPower(freqs, psd, 8, 13), 50, 0.05, "alpha power should be 50");
  });
  t("power lands in the right band and nowhere else", () => {
    const { freqs, psd } = welchPsd(sine(10, 10, FS * 20), FS, { segment: 1024 });
    near(bandPower(freqs, psd, 4, 8), 0, 1e-3, "theta should be empty");
    near(bandPower(freqs, psd, 13, 30), 0, 1e-3, "beta should be empty");
    near(bandPower(freqs, psd, 30, 44), 0, 1e-3, "gamma should be empty");
  });
  t("two rhythms keep their ratio", () => {
    const x = sine(10, 6, FS * 20);
    addTo(x, 20, 3);
    const { freqs, psd } = welchPsd(x, FS, { segment: 1024 });
    near(bandPower(freqs, psd, 8, 13), 18, 0.05, "alpha");
    near(bandPower(freqs, psd, 13, 30), 4.5, 0.05, "beta");
  });
  t("total power matches the variance", () => {
    const z = noise(FS * 20, 10, 42);
    const { freqs, psd } = welchPsd(z, FS, { segment: 1024 });
    const total = bandPower(freqs, psd, 0, 129);
    near(total, rms(z) ** 2, rms(z) ** 2 * 0.05, "Parseval check");
  });
  t("a huge slow drift does not become a huge delta reading", () => {
    const x = new Float64Array(FS * 20);
    for (let i = 0; i < x.length; i++) x[i] = 5000 * (i / x.length);
    addTo(x, 10, 4);
    const { freqs, psd } = welchPsd(x, FS, { segment: 1024 });
    near(bandPower(freqs, psd, 8, 13), 8, 0.05, "alpha should survive intact");
    ok(bandPower(freqs, psd, 1, 4) < 0.01, "a linear drift must not land in delta");
  });
  t("refuses a signal too short to analyse", () => {
    let threw = false;
    try { welchPsd(new Float64Array(4), FS, { segment: 512 }); } catch { threw = true; }
    ok(threw, "four samples should have been refused");
  });
}

console.log("\nthe 1 Hz high-pass");
{
  t("keeps a rhythm at its real amplitude", () => {
    const x = sine(10, 20, FS * 10);
    near(stdDev(highPass(x, FS, 1)), 20 / Math.SQRT2, 0.05, "a 20 uV sine should survive");
  });
  t("removes drift below the cutoff", () => {
    const p = sine(0.2, 200, FS * 10);
    ok(stdDev(highPass(p, FS, 1)) < stdDev(p) * 0.05, "a 0.2 Hz swing should be all but gone");
  });
  t("this is what makes a std-dev mean something", () => {
    const x = sine(10, 20, FS * 10);
    for (let i = 0; i < x.length; i++) x[i] += 3000 * (i / x.length);
    ok(stdDev(x) > 500, "raw std-dev is dominated by the drift");
    near(stdDev(highPass(x, FS, 1)), 20 / Math.SQRT2, 0.2, "filtered std-dev reports the rhythm");
  });
}

console.log("\nreading a console export");
{
  const row = (i, t, v) => [i % 32, ...CROWN_CHANNELS.map((_, c) => (v[c] ?? 0).toFixed(4)), "", t.toFixed(3)].join(", ");
  const build = (n, fn) => {
    const lines = [];
    for (let i = 0; i < n; i++) lines.push(row(i, 1776183430474 + (i * 1000) / FS, fn(i)));
    return lines.join("\n") + "\n";
  };

  t("reads eight channels with no header row", () => {
    const csv = build(FS * 5, (i) => CROWN_CHANNELS.map((_, c) => (c + 1) * Math.sin(i / 10)));
    const p = parseRawCsv(csv);
    ok(p.ok, "should parse");
    eq(p.n, FS * 5);
    eq(p.order.length, 8);
    eq(p.sampleRate, NOMINAL_RATE);
    near(p.durationSec, 5, 0.01);
  });
  t("keeps the channels in the console's fixed order", () => {
    const csv = build(FS * 5, () => [1, 2, 3, 4, 5, 6, 7, 8]);
    const p = parseRawCsv(csv);
    CROWN_CHANNELS.forEach((name, c) => eq(p.channels[name][0], c + 1, `${name} out of order`));
  });
  t("refuses a file with nothing readable in it", () => {
    eq(parseRawCsv("").ok, false);
    eq(parseRawCsv("nonsense\nmore nonsense\n").ok, false);
  });
  t("refuses a recording too short to measure", () => {
    const p = parseRawCsv(build(100, () => [1, 2, 3, 4, 5, 6, 7, 8]));
    eq(p.ok, false);
    eq(p.reason, "too-short");
  });
  t("tells you when a file has picked up a header row", () => {
    const csv = "index,CP3,C3,F5,PO3,PO4,F6,C4,CP4,blank,time\n" + build(FS * 5, () => [1, 2, 3, 4, 5, 6, 7, 8]);
    const p = parseRawCsv(csv);
    ok(p.ok, "should still parse");
    eq(p.n, FS * 5, "the header must not become a sample");
    ok(p.warnings.some((w) => /header row/i.test(w)), "should warn about the header");
  });
  t("skips a malformed line rather than failing on it", () => {
    const good = build(FS * 5, () => [1, 2, 3, 4, 5, 6, 7, 8]).trim().split("\n");
    good.splice(10, 0, "1, 2, oops, 4");
    const p = parseRawCsv(good.join("\n"));
    ok(p.ok);
    eq(p.n, FS * 5);
    ok(p.warnings.some((w) => /could not be read/.test(w)));
  });
  t("survives timestamps that step backwards", () => {
    const lines = build(FS * 5, () => [1, 2, 3, 4, 5, 6, 7, 8]).trim().split("\n");
    lines[50] = lines[50].replace(/[\d.]+$/, "1776183430400.000");
    const p = parseRawCsv(lines.join("\n"));
    ok(p.ok, "a backward step is normal and must not fail the parse");
    ok(p.timing.backwardSteps >= 1, "it should be counted");
    ok(p.warnings.some((w) => /backwards/.test(w)), "and reported");
  });
  t("does not mistake a logger CSV for a console export", () => {
    const logger = "timestamp_iso,epoch_ms,mode,focus,calm,alpha,beta,delta,theta,gamma,signal_quality,person_id\n"
      + "2026-08-21T09:00:00.000Z,1787302800000,mock,0.38,0.47,0.59,0.35,0.98,0.52,0.26,mock,me\n";
    eq(looksLikeRawExport(logger), false);
    eq(parseRawCsv(logger).ok, false);
  });
}

console.log("\nband power per electrode");
{
  // A recording built to a known answer: PO4 carries a strong alpha rhythm,
  // C4 carries a strong beta one, and everything else is noise.
  const n = FS * 30;
  const chans = {};
  for (const c of CROWN_CHANNELS) chans[c] = noise(n, 20, c.length + c.charCodeAt(0));
  addTo(chans.PO4, 10, 40);
  addTo(chans.C4, 20, 40);
  const parsed = { ok: true, channels: chans, order: [...CROWN_CHANNELS], sampleRate: FS, n, durationSec: n / FS, startMs: 0, warnings: [], timing: {} };

  const a = analyseRecording(parsed, { windowSec: 10 });
  t("analyses every electrode separately", () => {
    eq(Object.keys(a.channels).length, 8);
    eq(a.windowCount, 3, "30 seconds in 10 second windows");
  });
  t("finds the injected alpha on the electrode carrying it", () => {
    ok(a.channels.PO4.whole.share.alpha > 0.5, `PO4 alpha share was ${a.channels.PO4.whole.share.alpha}`);
    ok(a.channels.PO3.whole.share.alpha < 0.2, "PO3 has no alpha rhythm to find");
  });
  t("finds the injected beta on a different electrode", () => {
    ok(a.channels.C4.whole.share.beta > 0.5, `C4 beta share was ${a.channels.C4.whole.share.beta}`);
    ok(a.channels.C4.whole.share.alpha < 0.2, "C4 has no alpha rhythm");
  });
  t("band shares sum to one on every electrode", () => {
    for (const c of CROWN_CHANNELS) {
      const sum = BAND_KEYS.reduce((s, b) => s + a.channels[c].whole.share[b], 0);
      near(sum, 1, 1e-9, `${c} shares sum to ${sum}`);
    }
  });
  t("reports a value for every window of every band", () => {
    for (const c of CROWN_CHANNELS)
      for (const w of a.channels[c].windows)
        for (const b of BAND_KEYS) ok(Number.isFinite(w.share[b]), `${c} window ${w.index} band ${b}`);
  });
}

console.log("\nthe quality gate");
{
  t("calls a flat channel flat", () => {
    const q = channelQuality(new Float64Array(FS * 10), FS);
    eq(q.level, "flat");
    eq(q.usable, false);
  });
  t("calls tens of microvolts clean", () => {
    eq(channelQuality(sine(10, 40, FS * 10), FS).level, "clean");
  });
  t("calls thousands of microvolts artifact", () => {
    const q = channelQuality(sine(10, 5000, FS * 10), FS);
    eq(q.level, "artifact");
    eq(q.usable, false);
  });
  t("a slow drift alone does not condemn a channel", () => {
    const x = sine(10, 30, FS * 10);
    for (let i = 0; i < x.length; i++) x[i] += 4000 * (i / x.length);
    eq(channelQuality(x, FS).level, "clean", "drift is removed before judging");
  });
}

console.log("\ninterpretation");
{
  const mk = (fn) => {
    const n = FS * 300, chans = {};
    CROWN_CHANNELS.forEach((c, i) => { chans[c] = fn(c, i, n); });
    return analyseRecording(
      { ok: true, channels: chans, order: [...CROWN_CHANNELS], sampleRate: FS, n, durationSec: n / FS, startMs: 0, warnings: [], timing: {} },
      { windowSec: 60 },
    );
  };

  t("refuses to interpret a recording with no readable channel", () => {
    const r = interpret(mk(() => sine(10, 6000, FS * 300)));
    eq(r.readable, false);
    eq(r.findings.length, 0, "a refusal must not carry findings anyway");
    eq(r.indicators, null);
    ok(/No electrode/.test(r.headline));
  });

  t("reads a session through its clean channels only", () => {
    const r = interpret(mk((c) => (c === "PO3" || c === "PO4" ? noise(FS * 300, 30, 7) : sine(10, 5000, FS * 300))));
    eq(r.readable, true);
    ok(r.quality.usable.includes("PO3") && r.quality.usable.includes("PO4"));
    eq(r.quality.binned.length, 6);
    ok(/2 of 8/.test(r.findings[0].text), "it should say how many survived");
  });

  t("follows a rising alpha and puts the peak where it happens", () => {
    // Alpha amplitude peaks in the third of five minutes.
    const r = interpret(mk((c, i, n) => {
      const x = noise(n, 20, i + 3);
      if (c === "PO3" || c === "PO4") {
        for (let k = 0; k < n; k++) {
          const minute = Math.floor(k / (FS * 60));
          const amp = [4, 12, 40, 24, 10][Math.min(minute, 4)];
          x[k] += amp * Math.sin((2 * Math.PI * 10 * k) / FS);
        }
      }
      return x;
    }));
    eq(r.readable, true);
    const calm = r.indicators.calm;
    eq(calm.peak.window, 3, `peak was reported in window ${calm.peak.window}`);
    ok(calm.peaksMidway, "a mid-session peak should be flagged as one");
    ok(/minute 3/.test(r.headline), `headline was: ${r.headline}`);
  });

  t("does not call a ten second window a minute", () => {
    // A recording shorter than about 90 seconds is cut into shorter windows so
    // there is still a shape to see. Naming those minutes would be a lie repeated
    // in every sentence of the reading.
    const n = FS * 60, chans = {};
    CROWN_CHANNELS.forEach((c, i) => { chans[c] = c === "PO4" ? noise(n, 30, i + 5) : sine(10, 5000, n); });
    const a = analyseRecording(
      { ok: true, channels: chans, order: [...CROWN_CHANNELS], sampleRate: FS, n, durationSec: 60, startMs: 0, warnings: [], timing: {} },
      { windowSec: 10 },
    );
    const r = interpret(a);
    eq(r.isMinute, false);
    eq(r.unit, "10-second window");
    ok(!/minute/.test(JSON.stringify(r.findings)), "no finding may say minute");
    ok(!/minute/.test(r.headline), `headline said: ${r.headline}`);
    eq(r.windowLabels.length, 6);
    eq(r.windowLabels[0], "0:00");
    eq(r.windowLabels[1], "0:10");
  });

  t("does call a sixty second window a minute", () => {
    const n = FS * 300, chans = {};
    CROWN_CHANNELS.forEach((c, i) => { chans[c] = c === "PO4" ? noise(n, 30, i + 6) : sine(10, 5000, n); });
    const r = interpret(analyseRecording(
      { ok: true, channels: chans, order: [...CROWN_CHANNELS], sampleRate: FS, n, durationSec: 300, startMs: 0, warnings: [], timing: {} },
      { windowSec: 60 },
    ));
    eq(r.isMinute, true);
    eq(r.unit, "minute");
    eq(r.windowLabels[2], "min 3");
  });

  t("never calls its indicators Neurosity's scores", () => {
    const r = interpret(mk((c) => (c === "PO4" ? noise(FS * 300, 30, 9) : sine(10, 5000, FS * 300))));
    const text = JSON.stringify(r);
    ok(/not Neurosity's calm score/.test(text), "the calm caveat must be carried");
    ok(/not Neurosity's focus score/.test(text), "the focus caveat must be carried");
    ok(!/\bfocus score\b(?!.{0,80}not)/i.test(r.headline), "the headline must not claim a focus score");
  });

  t("states its limits every time", () => {
    const r = interpret(mk((c) => (c === "PO4" ? noise(FS * 300, 30, 11) : sine(10, 5000, FS * 300))));
    ok(r.caveats.length >= 4);
    ok(r.caveats.some((c) => /not diagnostic|not a pattern|readable/i.test(c)));
  });
}

console.log("\nagainst a real Crown recording");
{
  const med = join(ROOT, "test/fixtures/real-meditation-5min.csv");
  const why = "test/fixtures/real-meditation-5min.csv is not present. Real recordings are kept out of version control; see the README.";

  // Every check in this group is named here, so the count of skips matches the
  // count of checks that would have run. A test that silently disappears when a
  // file is missing is worse than one that fails.
  const REAL_CHECKS = [
    "parses the recording to the metadata the console reported",
    "reproduces the console's own signal-quality figures",
    "reaches the published reading of the meditation session",
    "puts the loud channels in the range the console showed",
  ];

  if (!existsSync(med)) {
    REAL_CHECKS.forEach((name) => skipped(name, why));
  } else {
    const expected = JSON.parse(readFileSync(join(ROOT, "test/expected/console-signal-quality.json"), "utf8"));
    const shape = JSON.parse(readFileSync(join(ROOT, "test/expected/meditation-shape.json"), "utf8"));
    const parsed = parseRawCsv(readFileSync(med, "utf8"));

    t("parses the recording to the metadata the console reported", () => {
      ok(parsed.ok, "should parse");
      eq(parsed.n, expected._recording.samples);
      eq(parsed.sampleRate, expected._recording.sampleRate);
      near(parsed.durationSec, expected._recording.durationSec, 0.01);
    });

    t("reproduces the console's own signal-quality figures", () => {
      const { relativePercent, absoluteMicrovolts } = expected._tolerance;
      for (const [ch, console_uv] of Object.entries(expected.console)) {
        const mine = stdDev(highPass(parsed.channels[ch], parsed.sampleRate, 1));
        const relOk = Math.abs(mine - console_uv) / console_uv * 100 <= relativePercent;
        const absOk = Math.abs(mine - console_uv) <= absoluteMicrovolts;
        ok(relOk || absOk, `${ch}: computed ${mine.toFixed(0)} uV against the console's ${console_uv} uV`);
      }
    });

    const a = analyseRecording(parsed, { windowSec: 60 });
    const r = interpret(a);

    t("reaches the published reading of the meditation session", () => {
      eq(r.readable, true);
      eq(JSON.stringify(r.quality.usable), JSON.stringify(shape.claims.usableChannels),
        `usable channels were ${r.quality.usable.join(",")}`);
      eq(r.quality.binned.length, shape.claims.artifactChannelCount);
      eq(r.indicators.calm.peak.window, shape.claims.posteriorAlphaPeakWindow,
        `posterior alpha peaked in window ${r.indicators.calm.peak.window}`);
      ok(r.indicators.calm.peaksMidway, "the peak should be mid-session, not at the end");
      ok(r.indicators.calm.values[0] < r.indicators.calm.peak.value, "alpha should rise into its peak");
    });

    t("puts the loud channels in the range the console showed", () => {
      const [lo, hi] = shape.claims.artifactMicrovoltRange;
      const loud = r.quality.channels.filter((c) => c.level === "artifact");
      eq(loud.length, shape.claims.artifactChannelCount);
      for (const c of loud) ok(c.uv >= lo * 0.95 && c.uv <= hi * 1.05, `${c.name} at ${c.uv} uV is outside ${lo} to ${hi}`);
    });
  }
}

/* ---------------------------------------------------------------------------
   The guide, as the static demo ships it.

   Three things can silently break the demo's guide: the build can stop emitting
   the index, the index can arrive in a form the browser cannot read without a
   network request, and the guide can start inventing answers when it finds
   nothing. One check each.
--------------------------------------------------------------------------- */
console.log("\nthe guide in the static build");
{
  const searchMod = await import("../core/search.js");
  const { buildIndex } = searchMod;
  const { ask } = await import("../core/guide.js");
  const distIndex = join(ROOT, "dist", "search-index.js");

  if (!existsSync(distIndex)) {
    skipped("the static build ships the search index", "run npm run build first");
  } else {
    const src = readFileSync(distIndex, "utf8");

    t("ships the index as a script-tag global, not as a fetched file", () => {
      ok(src.startsWith("window.CROWN_SEARCH_INDEX = "), "index must assign a global");
      const built = readFileSync(join(ROOT, "dist", "guide-panel.js"), "utf8");
      ok(!/fetch\(|XMLHttpRequest|new WebSocket|sendBeacon|EventSource/.test(built),
        "the shipped guide must not reach the network");
    });

    // Evaluate the global the way the browser does, then answer through it.
    const scope = {};
    new Function("window", src)(scope);
    const index = buildIndex(scope.CROWN_SEARCH_INDEX.chunks);

    // The same arguments web/guide-panel.js passes, so this tests what ships.
    const askAsDemoDoes = (q) =>
      ask(q, { index, analysis: null, shaping: { depth: "full" }, adaptive: true });

    t("answers a question the notes cover, and cites the note", () => {
      ok(scope.CROWN_SEARCH_INDEX.chunks.length > 0, "the index should not be empty");
      const r = askAsDemoDoes("What is alpha?");
      eq(r.kind, "notes", `expected a notes answer, got ${r.kind}`);
      ok(/alpha/i.test(r.text), "the answer should be about alpha");
      ok(r.sources.length > 0 && r.sources[0].title, "every answer names its source");
    });

    // The boundary is a decision, not an accident: exactly half the question's
    // content words matched is answered, not refused. Pinned here so a later
    // change to the comparison cannot flip it silently.
    t("answers a question sitting exactly on the coverage floor", () => {
      const terms = searchMod.tokenize("alpha bitcoin");
      const matched = terms.filter((x) => index.df.has(x)).length;
      eq(terms.length, 2, `expected 2 content words, got ${terms.join(",")}`);
      eq(matched, 1, "expected exactly one of the two to be in the notes");
      const r = askAsDemoDoes("alpha bitcoin");
      eq(r.kind, "notes", "a question exactly on the floor should be answered");
      ok(r.sources.length > 0, "and it should still cite its source");
    });

    t("refuses a question the notes do not cover, rather than guessing", () => {
      const r = askAsDemoDoes("What will the stock market do next quarter?");
      ok(r.kind === "no-answer" || r.sources.length === 0,
        `expected a refusal, got ${r.kind} with ${r.sources.length} sources`);
      ok(/can't find|cannot find|rather say so/i.test(r.text), "the refusal should say so plainly");
    });
  }
}

console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ""}`);
process.exit(fail ? 1 : 0);
