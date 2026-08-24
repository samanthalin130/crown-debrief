// Crown Debrief — three screens.
//   Today   (tier 1) one number, one comparison, one sentence
//   Session (tier 2) the session as named states over time
//   Detail  (tier 3) raw instrument readouts, reached deliberately
//
// Everything imports from /core/, the same modules Node runs.

import { parseCsv } from "/core/csv.js";
import { analyse, classify, zScore } from "/core/stats.js";
import { narrative, suggestion, fmtClock, fmtDuration } from "/core/debrief.js";
import { toMarkdown, toClipboardSummary } from "/core/format.js";
import { buildIndex } from "/core/search.js";
import { ask, STARTER_QUESTIONS } from "/core/guide.js";
import { StateEngine } from "/core/state.js";
import { describe, deltaPhrase, MIN_SESSIONS_FOR_BASELINE } from "/core/vocab.js";
import { zForHour } from "/core/baseline.js";
import { binSession, drawRibbon, drawDeviation, STATE_LABEL } from "/ribbon.js";

const $ = (id) => document.getElementById(id);
const pctS = (x) => `${Math.round(x * 100)}%`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const app = {
  sessions: [], name: null, rows: [], full: null, view: null,
  base: null, notes: [], activities: [], tags: [],
  index: null, engine: new StateEngine({ dwellMs: 6000 }),
  cells: [], range: "all", sel: null,
};

/* ---------------- screens ---------------- */
function show(tab) {
  document.querySelectorAll("nav button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("on", p.id === `p-${tab}`));
  if (tab === "session") requestAnimationFrame(renderStage);
}
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
$("detailLink").addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelector('nav button[data-tab="detail"]').hidden = false;
  show("detail");
});

// Copy buttons on the How it works screen — handy when demonstrating to a room.
document.addEventListener("click", async (e) => {
  const text = e.target.dataset?.copy;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    e.target.dataset.done = "1";
    const was = e.target.textContent;
    e.target.textContent = "Copied";
    setTimeout(() => { e.target.textContent = was; delete e.target.dataset.done; }, 1600);
  } catch {
    e.target.textContent = "Select it manually";
  }
});

/* ---------------- loading ---------------- */
async function boot() {
  const [sess, base, tags] = await Promise.all([
    fetch("/api/sessions").then((r) => r.json()),
    fetch("/api/baseline").then((r) => r.json()),
    fetch("/api/tags").then((r) => r.json()),
  ]);
  app.sessions = sess.sessions || [];
  app.base = base;
  app.tags = tags.tags || [];
  $("baseDump").textContent = JSON.stringify({ ...base, byHour: `${Object.keys(base.byHour || {}).length} hours` }, null, 2);

  if (!app.sessions.length) {
    $("heroVerdict").textContent = "No sessions recorded yet.";
    $("heroDetail").textContent = "Run npm run sample for synthetic data, or npm run log to record one.";
    return;
  }
  $("sessPick").innerHTML = app.sessions.map((s) => {
    const d = s.name.replace(/^session-|\.csv$/g, "");
    const label = new Date(d + "T12:00:00").toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    return `<option value="${s.name}">${label}</option>`;
  }).join("");
  $("sessPick").addEventListener("change", () => openSession($("sessPick").value));
  await openSession(app.sessions[0].name);
}

async function openSession(name) {
  app.name = name;
  const text = await (await fetch(`/api/session?name=${encodeURIComponent(name)}`)).text();
  app.rows = parseCsv(text).rows;
  const crossBase = app.base?.ready ? { focus: app.base.focus, calm: app.base.calm } : null;
  app.full = analyse(app.rows, { baseline: crossBase });
  $("synthChip").hidden = !app.full.synthetic;

  const date = new Date(app.full.startMs).toISOString().slice(0, 10);
  const [n, a] = await Promise.all([
    fetch(`/api/notes?date=${date}`).then((r) => r.json()).catch(() => ({ notes: [] })),
    fetch(`/api/activities?date=${date}`).then((r) => r.json()).catch(() => ({ activities: [] })),
  ]);
  app.notes = n.notes || [];
  app.activities = a.activities || [];
  app.range = "all"; app.sel = null;
  document.querySelectorAll(".filters button[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === "all")));
  $("clearSel").hidden = true;
  applyRange();
}

/* ---------------- range / view ---------------- */
function windowFor() {
  const a = app.full;
  if (app.sel) return app.sel;
  if (app.range === "am") return { from: a.startMs, to: noonOf(a.startMs) };
  if (app.range === "pm") return { from: noonOf(a.startMs), to: a.endMs };
  return { from: a.startMs, to: a.endMs };
}
function noonOf(ms) { const d = new Date(ms); d.setHours(12, 0, 0, 0); return d.getTime(); }

function applyRange() {
  const w = windowFor();
  const rows = app.rows.filter((r) => r.epoch_ms >= w.from && r.epoch_ms <= w.to);
  const crossBase = app.base?.ready ? { focus: app.base.focus, calm: app.base.calm } : null;
  app.view = rows.length > 10 ? analyse(rows, { baseline: crossBase }) : app.full;
  buildCells();
  renderToday();
  renderEvents();
  renderStage();
  const whole = !app.sel && app.range === "all";
  $("selNote").textContent = whole ? "" : ` · ${fmtClock(w.from)}–${fmtClock(w.to)}`;
}

document.querySelectorAll(".filters button[data-range]").forEach((b) => {
  b.addEventListener("click", () => {
    if (b.dataset.range === "clear") { app.sel = null; app.range = "all"; $("clearSel").hidden = true; }
    else { app.range = b.dataset.range; app.sel = null; $("clearSel").hidden = true; }
    document.querySelectorAll(".filters button[data-range]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.range === app.range)));
    applyRange();
  });
});

/* ---------------- tier 1 ---------------- */
function renderToday() {
  const a = app.view, ready = Boolean(app.base?.ready);
  const dayName = new Date(app.full.startMs).toLocaleDateString([], { weekday: "long" });

  $("heroNum").textContent = fmtDuration(a.deepWorkMs);
  $("heroLab").textContent = `Deep work · ${new Date(app.full.startMs).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}`;

  if (ready) {
    const mean = app.base.metrics.deepWorkMs.mean;
    const z = app.base.metrics.deepWorkMs.sd ? (a.deepWorkMs - mean) / app.base.metrics.deepWorkMs.sd : 0;
    const d = describe(z, true);
    $("heroDelta").innerHTML = `<span class="delta d-${d.token.replace("st-", "")}">${esc(deltaPhrase(a.deepWorkMs - mean, true, dayName))}</span>`;
  } else $("heroDelta").innerHTML = "";

  const s = suggestion(a);
  const parts = narrative(a).split("\n\n");
  $("heroVerdict").textContent = verdictLine(a, ready);
  const longest = parts.find((p) => p.startsWith("Your longest")) || parts[2] || "";
  $("heroDetail").textContent = longest.split(/(?<=\.)\s+/)[0];

  $("learning").innerHTML = ready ? "" : `
    <div class="learning">
      <b>Learning what's normal for you</b>
      <p>${app.base.sessionCount} of ${MIN_SESSIONS_FOR_BASELINE} sessions recorded. Comparisons switch on once there's enough to compare against — until then this session is measured against itself.</p>
      <div class="bar"><i style="width:${Math.min(100, (app.base.sessionCount / MIN_SESSIONS_FOR_BASELINE) * 100)}%"></i></div>
    </div>`;

  $("gauges").innerHTML = [
    ["Deep work", "deepWorkMs", a.deepWorkMs, fmtDuration(a.deepWorkMs), "st-focus"],
    ["Settled time", "settledMs", a.settledMs, fmtDuration(a.settledMs), "st-settle"],
    ["Longest unbroken stretch", "longestStretchMs", a.longestStretchMs, fmtDuration(a.longestStretchMs), "st-focus"],
  ].map(([name, key, value, shown, tok]) => gauge(name, key, value, shown, tok, ready)).join("");

  $("suggestion").innerHTML = s ? `<b>${esc(s.headline)}</b><p>${esc(s.body)}</p>` : "";
}

function verdictLine(a, ready) {
  if (!a.peaks.length && !a.slumps.length) return "A level session, with nothing standing out.";
  const am = a.peaks.filter((p) => new Date(p.startMs).getHours() < 13).length;
  const pmDip = a.slumps.filter((p) => new Date(p.startMs).getHours() >= 12).length;
  if (am && pmDip) return "A strong morning, a heavier afternoon.";
  if (a.peaks.length && !a.slumps.length) return "Steady focus, no real dips.";
  if (!a.peaks.length && a.slumps.length) return "Never really got going.";
  return "A mixed session.";
}

function gauge(name, key, value, shown, tok, ready) {
  const m = app.base?.metrics?.[key];
  if (!ready || !m || !m.sd) {
    return `<div class="gauge">
      <div class="g-top"><span class="g-name">${name}</span><span class="g-val">${shown} <span class="delta d-none" style="margin-left:6px">not enough data yet</span></span></div>
      <div class="g-track"><div class="g-hatch"></div></div>
      <div class="g-foot"><span></span><span>needs ${MIN_SESSIONS_FOR_BASELINE} sessions</span><span></span></div>
    </div>`;
  }
  const z = (value - m.mean) / m.sd;
  const d = describe(z, true);
  const lo = m.mean - m.sd, hi = m.mean + m.sd;
  const span = Math.max(hi - lo, 1) * 3;
  const axisLo = m.mean - span / 2;
  const pos = (v) => Math.max(1, Math.min(99, ((v - axisLo) / span) * 100));
  return `<div class="gauge">
    <div class="g-top"><span class="g-name">${name}</span><span class="g-val">${shown} <span class="delta d-${d.token.replace("st-", "")}" style="margin-left:6px">${d.word.toLowerCase()}</span></span></div>
    <div class="g-track">
      <div class="g-band" style="left:${pos(lo)}%;width:${pos(hi) - pos(lo)}%"></div>
      <div class="g-mark" style="left:${pos(value)}%;background:var(--${tok})"></div>
    </div>
    <div class="g-foot"><span>less</span><span>your usual range · last ${app.base.windowCount} sessions</span><span>more</span></div>
  </div>`;
}

/* ---------------- tier 2 ---------------- */
function buildCells() {
  const a = app.full;
  const fBase = a.focus, cBase = a.calm;
  const w = windowFor();
  const bins = [];
  for (const r of app.rows) {
    if (r.epoch_ms < w.from || r.epoch_ms > w.to) continue;
    const fz = zScore(r.focus, fBase), cz = zScore(r.calm, cBase);
    const hourZ = app.base?.ready ? zForHour(app.base, new Date(r.epoch_ms).getHours(), r.focus) : fz;
    bins.push({ t: r.epoch_ms, state: classify(r, fz, cz), z: Number.isFinite(hourZ) ? hourZ : fz, focus: r.focus, calm: r.calm });
  }
  app.bins = bins;
  app.win = w;
}

function renderStage() {
  const cv = $("ribbon");
  if (!cv.clientWidth || !app.bins?.length) return;
  const width = Math.max(80, Math.floor(cv.clientWidth));
  app.cells = binSession(app.bins, app.win.from, app.win.to, width);
  drawRibbon(cv, app.cells);
  drawDeviation($("devstrip"), app.cells);

  // activity lane
  const span = app.win.to - app.win.from || 1;
  $("lane").innerHTML = app.activities
    .filter((x) => x.endMs > app.win.from && x.startMs < app.win.to)
    .map((x) => {
      const l = Math.max(0, ((x.startMs - app.win.from) / span) * 100);
      const r = Math.min(100, ((x.endMs - app.win.from) / span) * 100);
      return `<i style="left:${l}%;width:${Math.max(3, r - l)}%" title="${esc(x.tag)}">${esc(x.tag)}</i>`;
    }).join("");

  // 24-hour on the axis: unambiguous, compact, and the usual convention for a time scale.
  const axisTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const ticks = Math.max(4, Math.min(8, Math.round(span / 3_600_000)));
  $("axis").innerHTML = Array.from({ length: ticks + 1 }, (_, i) =>
    `<span>${axisTime(app.win.from + (span * i) / ticks)}</span>`).join("");
}
window.addEventListener("resize", () => { if (app.bins?.length) renderStage(); });

/* scrub + drag-select */
const stage = $("stage");
let pill = null, line = null, selbox = null, dragFrom = null;

function stageX(e) {
  const cv = $("ribbon");
  const r = cv.getBoundingClientRect();
  return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), r };
}

stage.addEventListener("pointermove", (e) => {
  if (!app.cells.length) return;
  const { x, r } = stageX(e);
  const i = Math.min(app.cells.length - 1, Math.floor((x / r.width) * app.cells.length));
  const c = app.cells[i];
  if (!pill) {
    pill = document.createElement("div"); pill.className = "pill"; stage.appendChild(pill);
    line = document.createElement("div"); line.className = "scrubline"; stage.appendChild(line);
  }
  const stageRect = stage.getBoundingClientRect();
  const offX = r.left - stageRect.left, offY = r.top - stageRect.top;
  line.style.left = `${offX + x}px`; line.style.top = `${offY}px`; line.style.height = `${r.height + 32}px`;

  const label = c.state === "gap" ? "Recording stopped" : STATE_LABEL[c.state];
  let dev = "";
  if (c.state !== "gap" && c.state !== "unreadable" && Number.isFinite(c.z) && app.base?.ready) {
    const d = describe(c.z, true);
    dev = `<span class="p-d" style="color:var(--${d.token})">${esc(d.word)} for this hour</span>`;
  }
  pill.innerHTML = `<span class="p-t">${fmtClock(c.t)}</span><span class="p-s">${label}</span>${dev}`;
  pill.style.top = `${Math.max(0, offY - pill.offsetHeight - 9)}px`;
  const pw = pill.offsetWidth || 140;
  pill.style.left = `${Math.max(0, Math.min(stageRect.width - pw - 4, offX + x - pw / 2))}px`;

  if (dragFrom !== null) {
    if (!selbox) { selbox = document.createElement("div"); selbox.className = "selbox"; stage.appendChild(selbox); }
    const a = Math.min(dragFrom, x), b = Math.max(dragFrom, x);
    selbox.style.left = `${offX + a}px`; selbox.style.width = `${b - a}px`;
    selbox.style.top = `${offY}px`; selbox.style.height = `${r.height + 32}px`;
  }
});
stage.addEventListener("pointerleave", () => {
  pill?.remove(); line?.remove(); pill = null; line = null;
});
stage.addEventListener("pointerdown", (e) => { dragFrom = stageX(e).x; stage.setPointerCapture(e.pointerId); });
stage.addEventListener("pointerup", (e) => {
  if (dragFrom === null) return;
  const { x, r } = stageX(e);
  const a = Math.min(dragFrom, x), b = Math.max(dragFrom, x);
  dragFrom = null; selbox?.remove(); selbox = null;
  if (b - a < 12) return;                       // a click, not a drag
  const span = app.win.to - app.win.from;
  app.sel = { from: app.win.from + (a / r.width) * span, to: app.win.from + (b / r.width) * span };
  $("clearSel").hidden = false;
  document.querySelectorAll(".filters button[data-range]").forEach((x) => x.setAttribute("aria-pressed", "false"));
  applyRange();
});

/* ---------------- events ---------------- */
function renderEvents() {
  const a = app.view;
  // A five-minute blip is noise, not an event worth asking someone to explain.
  const MIN_EVENT_MS = 8 * 60_000;
  const items = [
    ...a.peaks.map((p) => ({ ...p, kind: "peak" })),
    ...a.slumps.map((p) => ({ ...p, kind: "slump" })),
  ].filter((p) => p.durationMs >= MIN_EVENT_MS).sort((x, y) => x.startMs - y.startMs);

  if (!items.length) { $("events").innerHTML = `<p class="muted" style="margin:0">Nothing stood out in this window.</p>`; return; }

  $("events").innerHTML = items.map((p, i) => {
    const peak = p.kind === "peak";
    const note = app.notes.find((n) => n.epoch_ms >= p.startMs - 60000 && n.epoch_ms <= p.endMs + 60000);
    const act = app.activities.find((x) => x.startMs <= p.startMs && x.endMs >= p.endMs);
    return `<div class="ev" data-i="${i}">
      <div class="r1"><span class="t">${peak ? "Focused stretch" : "Dip"}</span><span class="m">${fmtClock(p.startMs)}–${fmtClock(p.endMs)} · ${fmtDuration(p.durationMs)}</span></div>
      <p class="why">${peak
        ? `Sustained focus above your usual level, averaging ${p.meanValue.toFixed(2)}.`
        : `Focus stayed below your usual level, bottoming out at ${p.lowValue.toFixed(2)}.`}</p>
      ${note ? `<div class="noted">${esc(note.text)}</div>` : ""}
      ${note ? "" : `<div class="evrow">
        <input class="note-in" data-note="${i}" placeholder="What was happening? e.g. back-to-back meetings">
        <button class="act" data-savenote="${i}">Save</button>
      </div>`}
      ${act
        ? `<div class="tags"><button data-tag="${esc(act.tag)}" data-ev="${i}" aria-pressed="true">${esc(act.tag)}</button></div>`
        : `<div class="tags"><button data-expand="${i}">+ what were you doing?</button></div>
           <div class="tags" data-tagrow="${i}" hidden>
             ${app.tags.map((t) => `<button data-tag="${esc(t)}" data-ev="${i}">${esc(t)}</button>`).join("")}
           </div>`}
    </div>`;
  }).join("");

  app._events = items;
}

$("events").addEventListener("click", async (e) => {
  const saveI = e.target.dataset.savenote;
  if (saveI !== undefined) {
    const input = document.querySelector(`input[data-note="${saveI}"]`);
    const text = input.value.trim(); if (!text) return;
    const p = app._events[Number(saveI)];
    const r = await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ epoch_ms: p.startMs, text }) });
    const out = await r.json();
    if (out.ok) { app.notes.push(out.note); renderEvents(); }
    return;
  }
  const exp = e.target.dataset.expand;
  if (exp !== undefined) {
    document.querySelector(`[data-tagrow="${exp}"]`).hidden = false;
    e.target.closest(".tags").hidden = true;
    return;
  }
  const tag = e.target.dataset.tag;
  if (tag) {
    const p = app._events[Number(e.target.dataset.ev)];
    const r = await fetch("/api/activities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startMs: p.startMs, endMs: p.endMs, tag }) });
    const out = await r.json();
    if (out.ok) { app.activities.push(out.activity); renderEvents(); renderStage(); }
  }
});

/* ---------------- exports ---------------- */
$("btnCopy").addEventListener("click", async () => {
  const text = toClipboardSummary(app.view, app.notes);
  try { await navigator.clipboard.writeText(text); $("copyNote").textContent = "Copied — paste it into any assistant."; }
  catch { $("copyNote").textContent = "Clipboard unavailable; use Download instead."; }
  setTimeout(() => ($("copyNote").textContent = ""), 4000);
});
$("btnMd").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([toMarkdown(app.view, app.notes)], { type: "text/markdown" }));
  const el = document.createElement("a");
  el.href = url; el.download = `debrief-${new Date(app.full.startMs).toISOString().slice(0, 10)}.md`;
  el.click(); URL.revokeObjectURL(url);
});

/* ---------------- guide ---------------- */
fetch("/search-index.json").then((r) => r.json()).then((d) => {
  app.index = buildIndex(d.chunks);
  $("starters").innerHTML = STARTER_QUESTIONS.map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join("");
  $("starters").addEventListener("click", (e) => { if (e.target.dataset.q) { $("q").value = e.target.dataset.q; sendQ(); } });
  addMsg("Ask me about the headset, the numbers, or this session. Every answer says where it came from, and if I don't know I'll say so.", []);
});
function light(t) {
  return esc(t).split(/\n/).map((l) => { const b = l.match(/^\s*[-*]\s+(.*)$/); return b ? `<li>${b[1]}</li>` : l; }).join("\n")
    .replace(/(<li>[\s\S]*?<\/li>)(?!\n<li>)/g, "<ul>$1</ul>").replace(/<\/ul>\n<ul>/g, "")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
}
function addMsg(text, sources, opts = {}) {
  const div = document.createElement("div");
  div.className = `msg${opts.me ? " me" : ""}`;
  if (opts.me) div.textContent = text; else div.innerHTML = light(text);
  if (sources?.length) {
    const s = document.createElement("span");
    s.className = "src";
    s.textContent = `From: ${sources[0].title}${sources.length > 1 ? ` and ${sources.length - 1} more` : ""}`;
    div.appendChild(s);
  }
  $("chat").appendChild(div);
  $("chat").scrollTop = $("chat").scrollHeight;
}
function sendQ() {
  const q = $("q").value.trim();
  if (!q || !app.index) return;
  addMsg(q, [], { me: true }); $("q").value = "";
  const res = ask(q, { index: app.index, analysis: app.view, shaping: app.engine.shaping, adaptive: true });
  addMsg(res.text, res.sources);
  $("lastRetrieval").textContent = JSON.stringify({ question: q, kind: res.kind, state: app.engine.state, sources: res.sources }, null, 2);
}
$("send").addEventListener("click", sendQ);
$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") sendQ(); });

/* ---------------- tier 3 live ---------------- */
const BANDS = ["delta", "theta", "alpha", "beta", "gamma"];
$("bandBars").innerHTML = BANDS.map(() => `<i style="height:2px"></i>`).join("");
const es = new EventSource("/api/stream");
es.onmessage = (e) => {
  const f = JSON.parse(e.data);
  $("mFocus").textContent = f.focus.toFixed(3);
  $("mCalm").textContent = f.calm.toFixed(3);
  $("bFocus").style.width = `${Math.min(100, f.focus * 100)}%`;
  $("bCalm").style.width = `${Math.min(100, f.calm * 100)}%`;
  const max = Math.max(...BANDS.map((b) => f.bands[b]), 0.01);
  document.querySelectorAll("#bandBars i").forEach((el, i) => { el.style.height = `${Math.max(2, (f.bands[BANDS[i]] / max) * 100)}%`; });
  $("elec").innerHTML = Object.entries(f.quality || {}).map(([n, s]) =>
    `<span class="el ${s === "noContact" ? "off" : s === "bad" ? "bad" : ""}" title="${n}: ${s}">${n}</span>`).join("");
  const bad = Object.values(f.quality || {}).filter((s) => s === "bad" || s === "noContact").length;
  $("elecNote").textContent = bad ? `${bad} sensor${bad > 1 ? "s" : ""} not reading — those windows are excluded.` : "All sensors reading normally.";
  app.engine.push({ t: f.t, focus: f.focus, calm: f.calm, quality: f.signal_quality });
  $("stateText").textContent = app.engine.state;
  $("stateDump").textContent = JSON.stringify({ state: app.engine.state, candidate: app.engine.candidate, buffered: app.engine.buffer.length, shaping: app.engine.shaping }, null, 2);
};

boot();
