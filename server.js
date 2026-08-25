// The dev panel server. Zero dependencies -- plain Node, no framework.
//
// It does four things: serve the web/ and core/ folders to the browser, list and
// read the CSVs in data/, read and append session notes, and push live telemetry.
//
// Live telemetry uses Server-Sent Events rather than WebSockets. Telemetry only
// ever travels one way (server to browser), which is exactly what SSE is for, and
// it needs no library, reconnects on its own, and is far easier to explain in a
// handoff. If two-way messaging is ever needed, a WebSocket can be added then.

import { createServer } from "node:http";
import { readFile, readdir, appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, dirname, basename, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createMockSource } from "./core/mock-source.js";
import { parseCsv } from "./core/csv.js";
import { analyse } from "./core/stats.js";
import { buildBaseline, addHourlyNorms } from "./core/baseline.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
// 5273, not 5173: Vite and most front-end dev servers default to 5173, and a
// collision there is the most likely reason this fails to start on a dev machine.
const PORT = Number(process.env.PORT || 5273);

// .env is read by hand so the project keeps its zero-dependency promise.
const env = { ...process.env };
if (existsSync(join(ROOT, ".env"))) {
  for (const line of (await readFile(join(ROOT, ".env"), "utf8")).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8", ".svg": "image/svg+xml",
};

const source = createMockSource({ intervalMs: 1000 });

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

/** Only ever serve files from inside the project, whatever the request says. */
function safePath(base, rel) {
  const p = normalize(join(base, rel));
  return p.startsWith(base) ? p : null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (path === "/api/status") {
      return json(res, 200, {
        mode: source.mode,
        hasMistralKey: Boolean(env.MISTRAL_API_KEY),
        device: env.NEUROSITY_DEVICE_ID || null,
        note: "Live Crown data is not connected in this build; the Live tab runs on a mock source.",
      });
    }

    // The cross-session baseline. Computed here because it needs every CSV, and a
    // browser shouldn't download 70MB to work out what your normal Tuesday is.
    if (path === "/api/baseline") {
      const dir = join(ROOT, "data");
      await mkdir(dir, { recursive: true });
      const names = (await readdir(dir)).filter((f) => f.endsWith(".csv"));
      const analyses = [];
      for (const name of names) {
        const { rows } = parseCsv(await readFile(join(dir, name), "utf8"));
        if (!rows.length) continue;
        const a = analyse(rows);
        if (a.ok) analyses.push(a);
      }
      const store = addHourlyNorms(buildBaseline(analyses), analyses);
      // Strip the heavy series before sending.
      const light = {
        ready: store.ready, sessionCount: store.sessionCount, windowCount: store.windowCount,
        needed: store.needed, byHour: store.byHour,
        metrics: Object.fromEntries(Object.entries(store.metrics).map(([k, v]) => [k, { n: v.n, mean: v.mean, sd: v.sd }])),
        focus: { mean: null, sd: null }, calm: { mean: null, sd: null },
      };
      // Row-level norms, so a session can be classified against your normal.
      const allFocus = analyses.flatMap((a) => a.focusSeries.map((p) => p.v));
      const allCalm = analyses.flatMap((a) => a.calmSeries.map((p) => p.v));
      const m = (xs) => xs.reduce((x, y) => x + y, 0) / (xs.length || 1);
      const sdv = (xs) => { const mu = m(xs); return Math.sqrt(xs.reduce((x, y) => x + (y - mu) ** 2, 0) / Math.max(1, xs.length - 1)); };
      if (store.ready && allFocus.length) {
        light.focus = { mean: m(allFocus), sd: sdv(allFocus) };
        light.calm = { mean: m(allCalm), sd: sdv(allCalm) };
      }
      return json(res, 200, light);
    }

    if (path === "/api/tags") {
      const p = join(ROOT, "notes", "tags.json");
      const DEFAULTS = ["deep work", "meetings", "email", "reading", "admin", "break", "after lunch", "tired"];
      if (!existsSync(p)) return json(res, 200, { tags: DEFAULTS });
      try { return json(res, 200, { tags: JSON.parse(await readFile(p, "utf8")) }); }
      catch { return json(res, 200, { tags: DEFAULTS }); }
    }

    if (path === "/api/activities" && req.method === "GET") {
      const date = (url.searchParams.get("date") || "").slice(0, 10);
      const p = join(ROOT, "notes", `activities-${date}.jsonl`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !existsSync(p)) return json(res, 200, { activities: [] });
      const activities = (await readFile(p, "utf8")).split(/\r?\n/).filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      return json(res, 200, { activities });
    }

    if (path === "/api/activities" && req.method === "POST") {
      let body = "";
      for await (const c of req) { body += c; if (body.length > 10_000) return json(res, 413, { error: "Too long." }); }
      let act;
      try { act = JSON.parse(body); } catch { return json(res, 400, { error: "Could not read that." }); }
      if (!Number.isFinite(act.startMs) || !Number.isFinite(act.endMs) || !act.tag) {
        return json(res, 400, { error: "An activity needs a start, an end, and a tag." });
      }
      const date = new Date(act.startMs).toISOString().slice(0, 10);
      await mkdir(join(ROOT, "notes"), { recursive: true });
      const row = { startMs: act.startMs, endMs: act.endMs, tag: String(act.tag).slice(0, 40), person_id: act.person_id || "me", created_ms: Date.now() };
      await appendFile(join(ROOT, "notes", `activities-${date}.jsonl`), JSON.stringify(row) + "\n");

      // Keep the reusable tag vocabulary up to date. Free text every session would
      // make cross-session comparison impossible, so tags accumulate instead.
      const tp = join(ROOT, "notes", "tags.json");
      let tags = ["deep work", "meetings", "email", "reading", "admin", "break", "after lunch", "tired"];
      if (existsSync(tp)) { try { tags = JSON.parse(await readFile(tp, "utf8")); } catch {} }
      if (!tags.includes(row.tag)) { tags.push(row.tag); await writeFile(tp, JSON.stringify(tags, null, 2)); }
      return json(res, 200, { ok: true, activity: row });
    }

    if (path === "/api/sessions") {
      const dir = join(ROOT, "data");
      await mkdir(dir, { recursive: true });
      const names = (await readdir(dir)).filter((f) => f.endsWith(".csv"));
      const out = [];
      for (const name of names) {
        const s = await stat(join(dir, name));
        out.push({ name, bytes: s.size, modified: s.mtimeMs });
      }
      // Newest session first, by the date in the filename rather than file mtime —
      // a batch of generated files all share an mtime and would sort arbitrarily.
      out.sort((a, b) => b.name.localeCompare(a.name));
      return json(res, 200, { sessions: out });
    }

    if (path === "/api/session") {
      const name = basename(url.searchParams.get("name") || "");
      const p = safePath(join(ROOT, "data"), name);
      if (!p || !name.endsWith(".csv") || !existsSync(p)) return json(res, 404, { error: "No such session." });
      res.writeHead(200, { "content-type": MIME[".csv"], "cache-control": "no-store" });
      return res.end(await readFile(p));
    }

    if (path === "/api/notes" && req.method === "GET") {
      const date = (url.searchParams.get("date") || "").slice(0, 10);
      const p = join(ROOT, "notes", `notes-${date}.jsonl`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !existsSync(p)) return json(res, 200, { notes: [] });
      const notes = (await readFile(p, "utf8")).split(/\r?\n/).filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      return json(res, 200, { notes });
    }

    if (path === "/api/notes" && req.method === "POST") {
      let body = "";
      for await (const c of req) { body += c; if (body.length > 10_000) return json(res, 413, { error: "Note too long." }); }
      let note;
      try { note = JSON.parse(body); } catch { return json(res, 400, { error: "Could not read that note." }); }
      if (!Number.isFinite(note.epoch_ms) || !note.text) return json(res, 400, { error: "A note needs a time and some text." });
      const date = new Date(note.epoch_ms).toISOString().slice(0, 10);
      await mkdir(join(ROOT, "notes"), { recursive: true });
      const row = { epoch_ms: note.epoch_ms, text: String(note.text).slice(0, 500), tag: String(note.tag || "").slice(0, 40), person_id: note.person_id || "me", created_ms: Date.now() };
      await appendFile(join(ROOT, "notes", `notes-${date}.jsonl`), JSON.stringify(row) + "\n");
      return json(res, 200, { ok: true, note: row });
    }

    // Live telemetry as Server-Sent Events.
    if (path === "/api/stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      res.write(`retry: 2000\n\n`);
      const unsubscribe = source.subscribe((frame) => {
        res.write(`data: ${JSON.stringify(frame)}\n\n`);
      });
      req.on("close", unsubscribe);
      return;
    }

    // Static files: the page, plus core/ so the browser imports the same modules Node does.
    let rel = path === "/" ? "/index.html" : path;
    let base = join(ROOT, "web");
    if (rel.startsWith("/core/")) { base = ROOT; }
    const file = safePath(base, rel.startsWith("/core/") ? rel.slice(1) : rel);
    if (file && existsSync(file) && (await stat(file)).isFile()) {
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      return res.end(await readFile(file));
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (err) {
    console.error(err);
    json(res, 500, { error: "Something broke on the server. Check the terminal for details." });
  }
});

const sessionCount = (await readdirSafe(join(ROOT, "data"))).filter((f) => f.endsWith(".csv")).length;

// A stack trace is not a useful answer to "the port is busy".
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use.\n`);
    console.error(`  Something else is listening there — often another dev server, or an`);
    console.error(`  earlier run of this one still going in another terminal tab.\n`);
    console.error(`  See what it is:   lsof -i :${PORT}`);
    console.error(`  Stop it:          lsof -ti:${PORT} | xargs kill`);
    console.error(`  Or use another:   PORT=${PORT + 1} npm start\n`);
    console.error(`  If it is an older copy of this server, restart it rather than reusing it —`);
    console.error(`  the page would load but the newer endpoints would be missing.\n`);
  } else if (err.code === "EACCES") {
    console.error(`\n  Not allowed to open port ${PORT}. Ports below 1024 need elevated permissions;`);
    console.error(`  try PORT=5273 npm start.\n`);
  } else {
    console.error(`\n  The server could not start: ${err.message}\n`);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`\n  Session Debrief — dev panel`);
  console.log(`  http://localhost:${PORT}`);
  console.log(sessionCount ? `  ${sessionCount} session${sessionCount === 1 ? "" : "s"} in data/\n` : `  No sessions yet — run:  npm run sample\n`);
});

async function readdirSafe(dir) { try { return await readdir(dir); } catch { return []; } }
