// The dev panel. Imports the same core modules the Node side uses, straight from
// /core/ -- no build step, no bundler, no framework.

import { parseCsv } from "/core/csv.js";
import { analyse } from "/core/stats.js";
import { narrative, suggestion, fmtClock, fmtDuration } from "/core/debrief.js";
import { toMarkdown, toClipboardSummary } from "/core/format.js";
import { buildIndex } from "/core/search.js";
import { ask, STARTER_QUESTIONS } from "/core/guide.js";
import { StateEngine } from "/core/state.js";

const $ = (id) => document.getElementById(id);
const pct = (x) => `${Math.round(x * 100)}%`;

const app = {
  analysis: null,
  sessionName: null,
  notes: [],
  index: null,
  engine: new StateEngine({ dwellMs: 6000 }),
  lastFrame: null,
  lastRetrieval: null,
};

/* ---------- tabs ---------- */
document.querySelectorAll("nav button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("on"));
    $(`p-${b.dataset.tab}`).classList.add("on");
    if (b.dataset.tab === "debrief" && app.analysis) drawChart();
  });
});

/* ---------- live stream ---------- */
const BANDS = ["delta", "theta", "alpha", "beta", "gamma"];
$("bandBars").innerHTML = BANDS.map(() => `<div class="bar" style="height:2px"></div>`).join("");

function renderFrame(f) {
  app.lastFrame = f;
  $("mFocus").textContent = f.focus.toFixed(3);
  $("mCalm").textContent = f.calm.toFixed(3);
  $("bFocus").style.width = `${Math.min(100, f.focus * 100)}%`;
  $("bCalm").style.width = `${Math.min(100, f.calm * 100)}%`;

  const max = Math.max(...BANDS.map((b) => f.bands[b]), 0.01);
  document.querySelectorAll("#bandBars .bar").forEach((el, i) => {
    el.style.height = `${Math.max(2, (f.bands[BANDS[i]] / max) * 100)}%`;
  });

  const q = f.quality || {};
  $("elec").innerHTML = Object.entries(q).map(([name, status]) => {
    const cls = status === "noContact" ? "bad" : status === "bad" ? "mid" : "";
    return `<span class="el ${cls}" title="${name}: ${status}">${name}</span>`;
  }).join("");
  const problems = Object.entries(q).filter(([, s]) => s === "bad" || s === "noContact");
  $("elecNote").textContent = problems.length
    ? `${problems.length} electrode${problems.length > 1 ? "s" : ""} not reading properly — readings from this window are excluded.`
    : "All electrodes reading normally.";

  app.engine.push({ t: f.t, focus: f.focus, calm: f.calm, quality: f.signal_quality });
  const shaping = app.engine.shaping;
  $("stateText").textContent = app.engine.state;
  $("guideStateText").textContent = app.engine.state;
  $("shapeNote").textContent = shaping.note;

  $("rawFrame").textContent = JSON.stringify(f, null, 2);
  $("stateDump").textContent = JSON.stringify({
    state: app.engine.state, candidate: app.engine.candidate,
    dwellMs: app.engine.dwellMs, windowMs: app.engine.windowMs,
    bufferedSamples: app.engine.buffer.length, shaping,
  }, null, 2);
}

const es = new EventSource("/api/stream");
es.onmessage = (e) => renderFrame(JSON.parse(e.data));
es.onerror = () => { $("modeChip").textContent = "stream lost — retrying"; };

fetch("/api/status").then((r) => r.json()).then((s) => {
  $("modeChip").textContent = `${s.mode} source`;
  $("serverDump").textContent = JSON.stringify(s, null, 2);
});

/* ---------- sessions ---------- */
async function loadSessions() {
  const { sessions } = await (await fetch("/api/sessions")).json();
  if (!sessions.length) {
    $("sessRows").innerHTML = `<tr><td colspan="5" class="muted">Nothing recorded yet. Run <code>npm run sample</code> for synthetic data, or <code>npm run log</code> to record.</td></tr>`;
    return;
  }
  $("sessRows").innerHTML = sessions.map((s) => `
    <tr class="click" data-name="${s.name}">
      <td>${s.name.replace(/^session-|\.csv$/g, "")}</td>
      <td class="n" data-col="dur">—</td>
      <td class="n" data-col="rows">—</td>
      <td class="n" data-col="cov">—</td>
      <td><button class="act" data-open="${s.name}">Open</button></td>
    </tr>`).join("");

  // Fill the summary columns lazily so the list appears immediately.
  for (const s of sessions) {
    const a = await analyseSession(s.name);
    const tr = document.querySelector(`tr[data-name="${s.name}"]`);
    if (!tr || !a) continue;
    tr.querySelector('[data-col="dur"]').textContent = fmtDuration(a.recordedMs);
    tr.querySelector('[data-col="rows"]').textContent = a.rows.toLocaleString();
    tr.querySelector('[data-col="cov"]').textContent = pct(a.coverage);
  }
}

const csvCache = new Map();
async function analyseSession(name) {
  if (csvCache.has(name)) return csvCache.get(name);
  const text = await (await fetch(`/api/session?name=${encodeURIComponent(name)}`)).text();
  const { rows } = parseCsv(text);
  const a = rows.length ? analyse(rows) : null;
  csvCache.set(name, a);
  return a;
}

document.addEventListener("click", async (e) => {
  const name = e.target.dataset?.open || e.target.closest("tr.click")?.dataset?.name;
  if (!name) return;
  await openSession(name);
});

async function openSession(name) {
  const a = await analyseSession(name);
  if (!a) return;
  app.analysis = a;
  app.sessionName = name;
  const date = new Date(a.startMs).toISOString().slice(0, 10);
  app.notes = (await (await fetch(`/api/notes?date=${date}`)).json()).notes || [];
  $("synthChip").hidden = !a.synthetic;
  renderDebrief();
  document.querySelector('nav button[data-tab="debrief"]').click();
}

/* ---------- debrief ---------- */
function renderDebrief() {
  const a = app.analysis;
  $("debriefEmpty").hidden = true;
  $("debriefBody").hidden = false;

  $("statCards").innerHTML = [
    ["Recorded", fmtDuration(a.recordedMs)],
    ["Usable signal", pct(a.coverage)],
    ["Focus median", a.focus.p50.toFixed(3)],
    ["Your usual range", `${a.focus.p10.toFixed(2)}–${a.focus.p90.toFixed(2)}`],
    ["Calm median", a.calm.p50.toFixed(3)],
    ["Focused time", pct(a.timeInState.focused.share)],
  ].map(([k, v]) => `<div class="card"><div class="stat"><span class="v">${v}</span><span class="k">${k}</span></div></div>`).join("");

  $("narrative").innerHTML = narrative(a).split("\n\n").map((p) => `<p>${escapeHtml(p)}</p>`).join("");

  const s = suggestion(a);
  $("suggestion").innerHTML = s ? `<b>${escapeHtml(s.headline)}</b><p>${escapeHtml(s.body)}</p>` : "";

  const runRows = (list, kind) => list.length
    ? list.map((p) => `<tr><td class="n">${fmtClock(p.startMs)}–${fmtClock(p.endMs)}</td><td class="n">${fmtDuration(p.durationMs)}</td><td class="n">${(kind === "peak" ? p.meanValue : p.lowValue).toFixed(2)}</td></tr>`).join("")
    : `<tr><td class="muted">None found in this session.</td></tr>`;
  $("peakRows").innerHTML = runRows(a.peaks, "peak");
  $("slumpRows").innerHTML = runRows(a.slumps, "slump");

  // Note targets: the moments worth explaining.
  const targets = [
    ...a.peaks.map((p) => ({ ms: p.startMs, label: `peak at ${fmtClock(p.startMs)}` })),
    ...a.slumps.map((p) => ({ ms: p.startMs, label: `dip at ${fmtClock(p.startMs)}` })),
  ];
  if (!targets.length) targets.push({ ms: a.startMs, label: `start of session` });
  $("noteWhen").innerHTML = targets.map((t) => `<option value="${t.ms}">${t.label}</option>`).join("");

  renderNotes();
  drawChart();
}

function renderNotes() {
  $("noteList").innerHTML = app.notes.length
    ? app.notes.sort((x, y) => x.epoch_ms - y.epoch_ms)
        .map((n) => `<div style="padding:7px 0;border-bottom:1px solid var(--line-2)"><span class="n" style="font-family:var(--mono);color:var(--ink)">${fmtClock(n.epoch_ms)}</span> — ${escapeHtml(n.text)}</div>`).join("")
    : `<p class="muted" style="margin:0">No notes yet. The data can tell you when something changed, never why — that's what these are for.</p>`;
}

$("noteAdd").addEventListener("click", async () => {
  const text = $("noteText").value.trim();
  if (!text) return;
  const epoch_ms = Number($("noteWhen").value);
  const r = await fetch("/api/notes", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ epoch_ms, text }),
  });
  const out = await r.json();
  if (out.ok) { app.notes.push(out.note); $("noteText").value = ""; renderNotes(); }
});

$("btnCopy").addEventListener("click", async () => {
  const text = toClipboardSummary(app.analysis, app.notes);
  try { await navigator.clipboard.writeText(text); $("copyNote").textContent = "Copied — paste it into any assistant."; }
  catch { $("copyNote").textContent = "Couldn't reach the clipboard; the summary is in the Diagnostics tab."; $("lastRetrieval").textContent = text; }
  setTimeout(() => ($("copyNote").textContent = ""), 4000);
});

$("btnMd").addEventListener("click", () => {
  const md = toMarkdown(app.analysis, app.notes);
  const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url; a.download = `debrief-${new Date(app.analysis.startMs).toISOString().slice(0, 10)}.md`;
  a.click(); URL.revokeObjectURL(url);
});

/* ---------- chart ---------- */
function drawChart() {
  const a = app.analysis;
  const cv = $("chart");
  if (!a || !cv.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = 230;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const css = getComputedStyle(document.documentElement);
  const line = css.getPropertyValue("--line").trim();
  const ink3 = css.getPropertyValue("--ink-3").trim();
  const fc = css.getPropertyValue("--focus-c").trim();
  const cc = css.getPropertyValue("--calm-c").trim();

  const padL = 34, padR = 40, padT = 12, padB = 22;
  const w = W - padL - padR, h = H - padT - padB;
  const t0 = a.startMs, t1 = a.endMs;
  const x = (t) => padL + ((t - t0) / (t1 - t0)) * w;
  const yMax = Math.max(0.8, a.focus.p90 * 1.35, a.calm.p90 * 1.35);
  const y = (v) => padT + h - (Math.min(v, yMax) / yMax) * h;

  // baseline band
  ctx.fillStyle = fc + "1f";
  ctx.fillRect(padL, y(a.focus.p90), w, Math.max(1, y(a.focus.p10) - y(a.focus.p90)));

  // gridlines
  ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.font = "10px ui-monospace,monospace"; ctx.fillStyle = ink3;
  for (let v = 0; v <= yMax; v += 0.2) {
    const yy = Math.round(y(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
    ctx.fillText(v.toFixed(1), 4, yy + 3);
  }

  // slump / peak shading
  a.slumps.forEach((p) => { ctx.fillStyle = css.getPropertyValue("--stop").trim() + "22"; ctx.fillRect(x(p.startMs), padT, Math.max(1, x(p.endMs) - x(p.startMs)), h); });
  a.peaks.forEach((p) => { ctx.fillStyle = fc + "22"; ctx.fillRect(x(p.startMs), padT, Math.max(1, x(p.endMs) - x(p.startMs)), h); });

  // A break in recording is a gap, not a straight line between two moments hours apart.
  const gapLimit = Math.max(a.medianStepMs * 5, 60_000);
  const drawSeries = (series, colour) => {
    if (!series.length) return;
    // Downsample to roughly one point per pixel so long sessions stay fast.
    const step = Math.max(1, Math.floor(series.length / w));
    ctx.beginPath(); ctx.strokeStyle = colour; ctx.lineWidth = 1.4; ctx.lineJoin = "round";
    let pen = false;
    for (let i = 0; i < series.length; i += step) {
      const p = series[i];
      const prev = series[Math.max(0, i - step)];
      const px = x(p.t), py = y(p.v);
      if (!pen || (i > 0 && p.t - prev.t > gapLimit)) { ctx.moveTo(px, py); pen = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };
  drawSeries(a.calmSeries, cc);
  drawSeries(a.focusSeries, fc);

  // time axis
  ctx.fillStyle = ink3;
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const t = t0 + ((t1 - t0) * i) / ticks;
    const label = fmtClock(t);
    const px = x(t);
    ctx.fillText(label, Math.min(W - 42, Math.max(padL, px - 20)), H - 6);
  }
}
window.addEventListener("resize", () => { if (app.analysis) drawChart(); });

/* ---------- guide ---------- */
fetch("/search-index.json").then((r) => r.json()).then((d) => {
  app.index = buildIndex(d.chunks);
  $("starters").innerHTML = STARTER_QUESTIONS.map((q) => `<button data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join("");
  $("starters").addEventListener("click", (e) => { if (e.target.dataset.q) { $("q").value = e.target.dataset.q; sendQuestion(); } });
  addMsg("Ask me about the headset, the numbers, how to run this, or the session you have loaded. Every answer says where it came from, and if I don't know I'll say so.", []);
});

/** The notes are Markdown, so render the little of it that appears in answers. */
function renderLight(text) {
  const safe = escapeHtml(text);
  return safe
    .split(/\n/)
    .map((line) => {
      const bullet = line.match(/^\s*[-*]\s+(.*)$/);
      return bullet ? `<li>${bullet[1]}</li>` : line;
    })
    .join("\n")
    .replace(/(<li>[\s\S]*?<\/li>)(?!\n<li>)/g, "<ul style=\"margin:6px 0;padding-left:18px\">$1</ul>")
    .replace(/<\/ul>\n<ul[^>]*>/g, "")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function addMsg(text, sources, opts = {}) {
  const div = document.createElement("div");
  div.className = `msg${opts.me ? " me" : ""}`;
  if (opts.me) div.textContent = text;
  else div.innerHTML = renderLight(text);
  if (sources?.length) {
    const s = document.createElement("span");
    s.className = "src";
    s.textContent = "Sources: " + sources.map((x) => `${x.title}${x.section ? " § " + x.section : ""}`).join(" · ");
    div.appendChild(s);
  }
  if (opts.shapingNote) {
    const s = document.createElement("span");
    s.className = "shape";
    s.textContent = opts.shapingNote;
    div.appendChild(s);
  }
  $("chat").appendChild(div);
  $("chat").scrollTop = $("chat").scrollHeight;
}

function sendQuestion() {
  const q = $("q").value.trim();
  if (!q || !app.index) return;
  addMsg(q, [], { me: true });
  $("q").value = "";
  const res = ask(q, {
    index: app.index,
    analysis: app.analysis,
    shaping: app.engine.shaping,
    adaptive: $("adaptive").checked,
  });
  addMsg(res.text, res.sources, { shapingNote: res.shapingNote });
  app.lastRetrieval = res;
  $("lastRetrieval").textContent = JSON.stringify({ question: q, kind: res.kind, adaptive: $("adaptive").checked, state: app.engine.state, sources: res.sources }, null, 2);
}
$("send").addEventListener("click", sendQuestion);
$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") sendQuestion(); });

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

loadSessions();
