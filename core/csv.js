// Reading and writing the CSV format that logger.js produces.
// Deliberately tolerant: older files without a person_id column still load.

export const COLUMNS = [
  "timestamp_iso", "epoch_ms", "mode", "focus", "calm",
  "alpha", "beta", "delta", "theta", "gamma", "signal_quality", "person_id",
];

const NUMERIC = new Set(["epoch_ms", "focus", "calm", "alpha", "beta", "delta", "theta", "gamma"]);

/** Parse a CSV string into row objects. Returns { rows, warnings }. */
export function parseCsv(text) {
  const warnings = [];
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows: [], warnings: ["The file is empty."] };

  const header = splitLine(lines[0]).map((h) => h.trim());
  if (!header.includes("focus")) {
    return { rows: [], warnings: ["This doesn't look like a Crown log — no 'focus' column found."] };
  }
  if (!header.includes("person_id")) {
    warnings.push("No person_id column — treating the whole file as one person ('me').");
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitLine(lines[i]);
    if (parts.length < 3) continue;
    const row = {};
    header.forEach((key, j) => {
      const raw = parts[j] === undefined ? "" : parts[j].trim();
      row[key] = NUMERIC.has(key) ? Number(raw) : raw;
    });
    if (!Number.isFinite(row.epoch_ms)) {
      const t = Date.parse(row.timestamp_iso);
      if (Number.isFinite(t)) row.epoch_ms = t;
    }
    if (!Number.isFinite(row.epoch_ms) || !Number.isFinite(row.focus)) continue;
    row.person_id = row.person_id || "me";
    row.signal_quality = row.signal_quality || "unknown";
    rows.push(row);
  }
  if (rows.length === 0) warnings.push("No readable rows in this file.");
  rows.sort((a, b) => a.epoch_ms - b.epoch_ms);
  return { rows, warnings };
}

function splitLine(line) {
  // Our own writer never quotes, but be safe about quoted fields anyway.
  if (!line.includes('"')) return line.split(",");
  const out = [];
  let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function toCsv(rows) {
  const head = COLUMNS.join(",");
  const body = rows.map((r) => COLUMNS.map((c) => (r[c] === undefined ? "" : r[c])).join(","));
  return [head, ...body].join("\n") + "\n";
}
