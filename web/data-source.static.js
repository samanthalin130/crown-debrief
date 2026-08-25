// Where the app gets its data with no server behind it at all.
//
// Sessions are files the visitor drops onto the page. They are read inside their
// own browser and never uploaded -- there is nowhere to upload them to. Notes and
// activity tags are kept in this browser's local storage, so they stay on the
// visitor's own machine too.
//
// No API key, no model, no backend, nothing to keep running.

import { parseCsv } from "./core/csv.js";
import { analyse } from "./core/stats.js";
import { buildBaseline, addHourlyNorms } from "./core/baseline.js";

const files = new Map();          // name -> csv text
const analyses = new Map();       // name -> analysis
const DEFAULT_TAGS = ["deep work", "meetings", "email", "reading", "admin", "break", "after lunch", "tired"];

/** localStorage can throw outright in a private window or with site data blocked. */
function readStore(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function addFiles(list) {
  const added = [];
  for (const { name, text } of list) {
    const { rows } = parseCsv(text);
    if (!rows.length) continue;
    const a = analyse(rows);
    if (!a.ok) continue;
    files.set(name, text);
    analyses.set(name, a);
    added.push(name);
  }
  return added;
}

export function hasFiles() { return files.size > 0; }

export const source = {
  kind: "static",
  live: false,
  privacyNote: "Your file is read inside this browser and never uploaded. Notes stay in this browser too.",

  async listSessions() {
    return [...files.keys()]
      .map((name) => ({ name, bytes: files.get(name).length, modified: analyses.get(name).startMs }))
      .sort((a, b) => b.modified - a.modified);
  },
  async readSession(name) { return files.get(name) || ""; },

  async getBaseline() {
    const all = [...analyses.values()];
    const store = addHourlyNorms(buildBaseline(all), all);
    const light = {
      ready: store.ready, sessionCount: store.sessionCount, windowCount: store.windowCount,
      needed: store.needed, byHour: store.byHour,
      metrics: Object.fromEntries(Object.entries(store.metrics).map(([k, v]) => [k, { n: v.n, mean: v.mean, sd: v.sd }])),
      focus: { mean: null, sd: null }, calm: { mean: null, sd: null },
    };
    if (store.ready) {
      const recent = all.sort((x, y) => y.startMs - x.startMs).slice(0, 10);
      const f = recent.flatMap((a) => a.focusSeries.map((p) => p.v));
      const c = recent.flatMap((a) => a.calmSeries.map((p) => p.v));
      const m = (xs) => xs.reduce((x, y) => x + y, 0) / (xs.length || 1);
      const sd = (xs) => { const mu = m(xs); return Math.sqrt(xs.reduce((x, y) => x + (y - mu) ** 2, 0) / Math.max(1, xs.length - 1)); };
      light.focus = { mean: m(f), sd: sd(f) };
      light.calm = { mean: m(c), sd: sd(c) };
    }
    return light;
  },

  async getNotes(date) { return readStore(`crown.notes.${date}`, []); },
  async saveNote(note) {
    const date = new Date(note.epoch_ms).toISOString().slice(0, 10);
    const row = { ...note, text: String(note.text).slice(0, 500), person_id: "me", created_ms: Date.now() };
    const all = readStore(`crown.notes.${date}`, []);
    all.push(row);
    return writeStore(`crown.notes.${date}`, all) ? row : null;
  },

  async getActivities(date) { return readStore(`crown.acts.${date}`, []); },
  async saveActivity(act) {
    const date = new Date(act.startMs).toISOString().slice(0, 10);
    const row = { ...act, tag: String(act.tag).slice(0, 40), person_id: "me", created_ms: Date.now() };
    const all = readStore(`crown.acts.${date}`, []);
    all.push(row);
    if (!writeStore(`crown.acts.${date}`, all)) return null;
    const tags = readStore("crown.tags", DEFAULT_TAGS);
    if (!tags.includes(row.tag)) writeStore("crown.tags", [...tags, row.tag]);
    return row;
  },

  async getTags() { return readStore("crown.tags", DEFAULT_TAGS); },
  subscribeLive() { return null; },   // no headset on a static page, and nothing to stream
};
