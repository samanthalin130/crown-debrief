// Zero-dependency test runner. `npm test`.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../core/csv.js";
import { analyse, findRuns, baseline, zScore, isUsable } from "../core/stats.js";
import { narrative, suggestion } from "../core/debrief.js";
import { toMarkdown, toClipboardSummary } from "../core/format.js";
import { buildIndex, search } from "../core/search.js";
import { StateEngine } from "../core/state.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const eq = (a, b, m = "") => { if (a !== b) throw new Error(`${m} expected ${b}, got ${a}`); };
const ok = (c, m) => { if (!c) throw new Error(m || "expected truthy"); };

const files = readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".csv"));
ok(files.length > 0, "no sample data - run `npm run sample` first");
const { rows } = parseCsv(readFileSync(join(ROOT, "data", files[0]), "utf8"));

console.log("\ncsv");
t("parses the sample file", () => ok(rows.length > 1000, `only ${rows.length} rows`));
t("numbers are numbers", () => eq(typeof rows[0].focus, "number"));
t("rows are in time order", () => ok(rows.every((r, i) => i === 0 || r.epoch_ms >= rows[i - 1].epoch_ms)));
t("defaults person_id when absent", () => {
  const { rows: r2 } = parseCsv("timestamp_iso,epoch_ms,mode,focus,calm,signal_quality\n2026-01-01T00:00:00Z,100,mock,0.5,0.5,mock\n");
  eq(r2[0].person_id, "me");
});
t("rejects a file that isn't a Crown log", () => {
  const { rows: r3, warnings } = parseCsv("a,b\n1,2\n");
  eq(r3.length, 0); ok(warnings.length > 0);
});

console.log("\nquality gate");
t("bad signal is never usable", () => { eq(isUsable({ signal_quality: "bad" }), false); eq(isUsable({ signal_quality: "noContact" }), false); });
t("unknown signal is never usable", () => eq(isUsable({ signal_quality: "unknown" }), false));
t("good and mock are usable", () => { eq(isUsable({ signal_quality: "good" }), true); eq(isUsable({ signal_quality: "mock" }), true); });

console.log("\nruns");
t("hysteresis merges a series hovering at the line", () => {
  const series = [];
  for (let i = 0; i < 300; i++) series.push({ t: i * 2000, v: 0.5, z: i % 2 ? 0.7 : 0.3 });
  const runs = findRuns(series, { enter: 0.6, exit: 0.15, minMs: 60_000, direction: "above" });
  eq(runs.length, 1, "should be one run, not many:");
});
t("runs shorter than the minimum are dropped", () => {
  const series = [{ t: 0, v: 1, z: 3 }, { t: 2000, v: 1, z: 3 }];
  eq(findRuns(series, { enter: 1, exit: 0, minMs: 60_000, direction: "above" }).length, 0);
});
t("finds a downward run too", () => {
  const series = [];
  for (let i = 0; i < 300; i++) series.push({ t: i * 2000, v: 0.1, z: -2 });
  ok(findRuns(series, { enter: -0.7, exit: -0.2, minMs: 60_000, direction: "below" }).length === 1);
});

console.log("\nanalysis");
const a = analyse(rows);
t("analysis succeeds", () => eq(a.ok, true));
t("coverage is a share between 0 and 1", () => ok(a.coverage > 0 && a.coverage <= 1, `${a.coverage}`));
t("usable rows never exceed total rows", () => ok(a.usableRows <= a.rows));
t("time-in-state shares sum to 1", () => {
  const s = Object.values(a.timeInState).reduce((x, y) => x + y.share, 0);
  ok(Math.abs(s - 1) < 1e-9, `sum was ${s}`);
});
t("baseline sd is positive on real-shaped data", () => ok(a.focus.sd > 0));
t("z-score of the mean is zero", () => eq(Math.round(zScore(a.focus.mean, a.focus) * 1e6) / 1e6, 0));
t("peaks are ordered longest first", () => ok(a.peaks.every((p, i) => i === 0 || p.durationMs <= a.peaks[i - 1].durationMs)));
t("peaks and slumps sit inside the session", () => {
  [...a.peaks, ...a.slumps].forEach((p) => ok(p.startMs >= a.startMs && p.endMs <= a.endMs));
});
t("recorded time never exceeds wall-clock time", () => ok(a.recordedMs <= a.wallMs));
t("synthetic data is flagged as synthetic", () => eq(a.synthetic, true));
t("is deterministic - same input, same peaks", () => {
  const b = analyse(rows);
  eq(JSON.stringify(b.peaks), JSON.stringify(a.peaks));
});
t("empty input fails safely rather than throwing", () => eq(analyse([]).ok, false));

console.log("\ndebrief");
const text = narrative(a);
t("narrative is real prose", () => ok(text.length > 400, `only ${text.length} chars`));
t("narrative flags synthetic data up front", () => ok(text.toLowerCase().includes("synthetic")));
t("narrative has no unfilled placeholders", () => ok(!/undefined|NaN|\[object/.test(text), text.slice(0, 200)));
t("suggestion exists and is behavioural", () => { const s = suggestion(a); ok(s && s.headline && s.body); });
t("markdown export has no NaN", () => { const m = toMarkdown(a, []); ok(!/NaN|undefined/.test(m)); ok(m.includes("# Debrief")); });
t("clipboard summary carries no raw EEG rows", () => {
  const c = toClipboardSummary(a, []);
  ok(c.length < 2000, `summary too big (${c.length}) - that would mean raw data leaked in`);
  ok(c.includes("Focus"));
});
t("a bad-signal session is told to fix the fit first", () => {
  const junk = rows.slice(0, 2000).map((r) => ({ ...r, signal_quality: "noContact" }));
  const s = suggestion(analyse(junk));
  ok(/fit/i.test(s.headline), s.headline);
});

console.log("\nsearch");
const idx = buildIndex([
  { id: "eeg-primer.md#alpha", title: "Alpha", section: "Bands", text: "Alpha is the rhythm between 8 and 12 hertz. It rises when you relax or close your eyes." },
  { id: "run.md#start", title: "Running it", section: "Setup", text: "Start the dev panel with npm start and open the address it prints." },
]);
t("finds the right chunk", () => eq(search(idx, "what is alpha")[0].id, "eeg-primer.md#alpha"));
t("finds a different chunk for a different question", () => eq(search(idx, "how do I start the server")[0].id, "run.md#start"));
t("returns nothing for gibberish", () => eq(search(idx, "zzzzqqq").length, 0));
t("every hit carries its source", () => ok(search(idx, "alpha").every((h) => h.id && h.title)));

console.log("\nretrieval against the real notes");
{
  const { chunkMarkdown } = await import("../core/search.js");
  const kdir = join(ROOT, "knowledge");
  const chunks = readdirSync(kdir).filter((f) => f.endsWith(".md"))
    .flatMap((f) => chunkMarkdown(f, readFileSync(join(kdir, f), "utf8")));
  const real = buildIndex(chunks);
  const cases = [
    ["what is alpha", "eeg-primer"],
    ["what do focus and calm measure", "eeg-primer"],
    ["is 0.35 focus good", "reading-your-data"],
    ["how do I run this", "running-it"],
    ["how do I record a real session", "running-it"],
    ["signal quality", "eeg-primer"],
    ["eyes closed test", "eeg-primer"],
    ["what about privacy", "safety-and-privacy"],
    ["robotic arm", "project"],
  ];
  for (const [q, want] of cases) {
    t(`"${q}" finds ${want}`, () => {
      const hit = search(real, q, 1)[0];
      ok(hit, "found nothing");
      ok(hit.file.includes(want), `got ${hit.file} § ${hit.section}`);
    });
  }
  t("a question with no answer in the notes returns nothing", () => eq(search(real, "airspeed velocity swallow", 1).length, 0));
}

console.log("\nguide");
{
  const { ask } = await import("../core/guide.js");
  const { chunkMarkdown } = await import("../core/search.js");
  const kdir = join(ROOT, "knowledge");
  const chunks = readdirSync(kdir).filter((f) => f.endsWith(".md"))
    .flatMap((f) => chunkMarkdown(f, readFileSync(join(kdir, f), "utf8")));
  const real = buildIndex(chunks);
  t("says it doesn't know rather than guessing", () => {
    const r = ask("what is the airspeed velocity of a swallow", { index: real });
    eq(r.kind, "no-answer");
  });
  t("answers a data question from the loaded session", () => {
    const r = ask("when was my best stretch", { index: real, analysis: a });
    eq(r.kind, "data"); ok(r.text.length > 40);
  });
  t("asks for a session when there isn't one", () => {
    eq(ask("when was my best stretch", { index: real }).kind, "needs-session");
  });
  t("shortens the answer when the reading says scattered", () => {
    const full = ask("what is alpha", { index: real, shaping: { depth: "full" }, adaptive: true });
    const short = ask("what is alpha", { index: real, shaping: { depth: "short" }, adaptive: true });
    ok(short.text.length < full.text.length, "short answer was not shorter");
  });
  t("adaptation off gives the same answer regardless of state", () => {
    const x = ask("what is alpha", { index: real, shaping: { depth: "short" }, adaptive: false });
    const y = ask("what is alpha", { index: real, shaping: { depth: "full" }, adaptive: false });
    eq(x.text, y.text);
  });
  t("every notes answer carries at least one source", () => {
    const r = ask("what is alpha", { index: real });
    ok(r.sources.length >= 1);
  });
}

console.log("\nvocabulary");
{
  const { describe, deltaPhrase, VOCAB, MIN_SESSIONS_FOR_BASELINE } = await import("../core/vocab.js");
  t("one fixed scale, five words", () => eq(VOCAB.length, 5));
  t("never says good or bad", () => ok(!VOCAB.some((v) => /good|bad|poor|excellent|optimal/i.test(v.word)), "found a judgement word"));
  t("maps z-scores to the right words", () => {
    eq(describe(2).word, "Well above usual");
    eq(describe(0.8).word, "Above usual");
    eq(describe(0).word, "Typical");
    eq(describe(-0.9).word, "Below usual");
    eq(describe(-3).word, "Well below usual");
  });
  t("refuses to describe without a baseline", () => eq(describe(2, false).word, "Not enough data yet"));
  t("refuses to describe a non-number", () => eq(describe(NaN, true).word, "Not enough data yet"));
  t("delta phrase reads naturally", () => {
    ok(deltaPhrase(22 * 60000, true, "Friday").includes("+22 min"));
    ok(deltaPhrase(-90 * 60000, true).includes("1h 30m"));
    ok(/about the same/.test(deltaPhrase(60000, true)));
  });
  t("no delta phrase without a baseline", () => eq(deltaPhrase(999999, false), null));
  t("baseline needs ten sessions", () => eq(MIN_SESSIONS_FOR_BASELINE, 10));
}

console.log("\nbaseline store");
{
  const { buildBaseline, addHourlyNorms, zFor, usualRange, sessionMetrics } = await import("../core/baseline.js");
  const all = readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".csv"))
    .map((f) => analyse(parseCsv(readFileSync(join(ROOT, "data", f), "utf8")).rows)).filter((x) => x.ok);

  t("has enough sample sessions to form a baseline", () => ok(all.length >= 10, `only ${all.length}`));
  const store = addHourlyNorms(buildBaseline(all), all);
  t("baseline reports ready", () => eq(store.ready, true));
  t("uses only the most recent ten", () => eq(store.windowCount, 10));
  t("learns hour-of-day norms", () => ok(Object.keys(store.byHour).length >= 5));
  t("afternoon norm is lower than late morning", () => {
    const am = store.byHour[10]?.mean, pm = store.byHour[14]?.mean;
    // Hour buckets are local hours. The sample generator also writes in local
    // hours, so the two agree only while the fixtures were generated in the
    // timezone the tests are running in. If they were not, this assertion fails
    // for a reason that has nothing to do with the statistics, so say so.
    ok(am && pm && am > pm,
      `10:00 ${am} vs 14:00 ${pm}. This is why hour-of-day baselining matters. `
      + `If this failed after the fixtures were generated elsewhere, they are in a `
      + `different timezone from this run (currently ${Intl.DateTimeFormat().resolvedOptions().timeZone}): `
      + `run "npm run sample" to regenerate them locally.`);
  });
  t("z-score of the mean is zero", () => {
    const z = zFor(store, "deepWorkMs", store.metrics.deepWorkMs.mean);
    ok(Math.abs(z) < 1e-9, `${z}`);
  });
  t("usual range brackets the mean", () => {
    const r = usualRange(store, "deepWorkMs");
    ok(r.low < r.mean && r.mean < r.high);
  });

  const thin = buildBaseline(all.slice(0, 3));
  t("refuses to be ready on three sessions", () => eq(thin.ready, false));
  t("says how many more are needed", () => eq(thin.needed, 7));
  t("returns NaN rather than a fake comparison", () => ok(Number.isNaN(zFor(thin, "deepWorkMs", 1000))));
  t("no usual range before it is ready", () => eq(usualRange(thin, "deepWorkMs"), null));
  t("sessionMetrics returns null for a failed analysis", () => eq(sessionMetrics({ ok: false }), null));

  t("cross-session baseline changes the classification", () => {
    const rows2 = parseCsv(readFileSync(join(ROOT, "data", readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".csv"))[0]), "utf8")).rows;
    const withBase = analyse(rows2, { baseline: { focus: { mean: 0.2, sd: 0.05 }, calm: { mean: 0.4, sd: 0.05 } } });
    eq(withBase.baselineSource, "cross-session");
    ok(withBase.deepWorkMs > analyse(rows2).deepWorkMs, "a lower baseline should yield more deep work");
  });
  t("falls back to the session when no baseline is given", () => eq(analyse(rows).baselineSource, "session"));
}

console.log("\nlive state engine");
t("holds a state until the dwell time passes", () => {
  const e = new StateEngine({ dwellMs: 10_000 });
  e.push({ t: 0, focus: 0.2, calm: 0.2, quality: "good" });
  const first = e.state;
  e.push({ t: 1000, focus: 0.9, calm: 0.9, quality: "good" });
  eq(e.state, first, "flipped instantly, should have waited:");
});
t("bad signal reports unreadable, never a confident state", () => {
  const e = new StateEngine({ dwellMs: 0 });
  for (let i = 0; i < 40; i++) e.push({ t: i * 1000, focus: 0.9, calm: 0.9, quality: "noContact" });
  eq(e.state, "unreadable");
});
t("never invents a state before it has data", () => eq(new StateEngine().state, "unknown"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
