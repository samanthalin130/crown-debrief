// The guide answers in two ways: from the project's own notes (search), and from
// the session you have loaded (computed facts). Every answer carries its source.
// Nothing here invents information -- if the search finds nothing, it says so.

import { search } from "./search.js";
import { fmtClock, fmtDuration } from "./debrief.js";

const pct = (x) => `${Math.round(x * 100)}%`;

/** Questions that should be answered from the loaded session rather than the notes. */
const DATA_PATTERNS = [
  { key: "peak",     re: /\b(peak|best|sharpest|most focus|focused most|good stretch)\b/i },
  { key: "slump",    re: /\b(slump|dip|crash|worst|drop|zoned? out|distracted)\b/i },
  { key: "coverage", re: /\b(coverage|signal|quality|electrode|contact|trust)\b/i },
  { key: "hour",     re: /\b(hour|time of day|morning|afternoon|when am i|when do i)\b/i },
  { key: "overall",  re: /\b(how did i do|summar|overall|my (focus|calm)|today|this session)\b/i },
  { key: "bands",    re: /\b(alpha|beta|theta|delta|gamma|band)\b.*\b(my|mine|session|today)\b/i },
];

function answerFromData(key, a) {
  if (!a || !a.ok) return null;
  const src = { id: "your session", title: "Your loaded session", section: new Date(a.startMs).toDateString() };

  switch (key) {
    case "peak": {
      if (!a.peaks.length) return { text: `Nothing in this session held above your baseline long enough to count as a focused stretch — it stayed fairly level throughout.`, sources: [src] };
      const p = a.peaks[0];
      return {
        text: `Your longest focused stretch ran ${fmtClock(p.startMs)} to ${fmtClock(p.endMs)} — ${fmtDuration(p.durationMs)}, averaging ${p.meanValue.toFixed(2)} against a session median of ${a.focus.p50.toFixed(2)}.` +
              (a.peaks.length > 1 ? ` There were ${a.peaks.length - 1} shorter ones as well.` : ""),
        sources: [src],
      };
    }
    case "slump": {
      if (!a.slumps.length) return { text: `No sustained dips in this session — nothing stayed below your baseline for long enough to flag.`, sources: [src] };
      const p = a.slumps[0];
      return {
        text: `The clearest dip was ${fmtClock(p.startMs)} to ${fmtClock(p.endMs)} — ${fmtDuration(p.durationMs)} below your usual level, bottoming out at ${p.lowValue.toFixed(2)}. The data can tell you when, but not why; a session note against that time is what supplies the why.`,
        sources: [src],
      };
    }
    case "coverage":
      return {
        text: `${pct(a.coverage)} of this session had a signal worth trusting (${a.usableRows.toLocaleString()} of ${a.rows.toLocaleString()} readings). ` +
              (a.coverage >= 0.75 ? `That's solid — the rest of the numbers can be taken at face value.` : `That's low enough that everything else should be treated as provisional. It usually means the electrodes weren't reaching your scalp.`),
        sources: [src],
      };
    case "hour":
      if (!a.bestHour) return null;
      return {
        text: `In this session your strongest hour was ${String(a.bestHour.hour).padStart(2, "0")}:00, averaging ${a.bestHour.meanFocus.toFixed(2)}` +
              (a.worstHour ? `, and your weakest was ${String(a.worstHour.hour).padStart(2, "0")}:00 at ${a.worstHour.meanFocus.toFixed(2)}` : "") +
              `. One session isn't a pattern though — that needs a week or two before it means anything.`,
        sources: [src],
      };
    case "bands": {
      const b = a.bands;
      return {
        text: `Band averages for this session — delta ${b.delta.mean.toFixed(2)}, theta ${b.theta.mean.toFixed(2)}, alpha ${b.alpha.mean.toFixed(2)}, beta ${b.beta.mean.toFixed(2)}, gamma ${b.gamma.mean.toFixed(2)}. Larger numbers at the slow end are normal for everyone. Alpha is what the calm score is built from; gamma is what focus is built from.`,
        sources: [src],
      };
    }
    case "overall":
      return {
        text: `This session ran ${fmtClock(a.startMs)} to ${fmtClock(a.endMs)} — ${fmtDuration(a.recordedMs)} recorded, ${pct(a.coverage)} usable. Focus sat around ${a.focus.p50.toFixed(2)} (normally ${a.focus.p10.toFixed(2)}–${a.focus.p90.toFixed(2)}), calm around ${a.calm.p50.toFixed(2)}. ${a.peaks.length} focused stretch${a.peaks.length === 1 ? "" : "es"} and ${a.slumps.length} dip${a.slumps.length === 1 ? "" : "s"} stood out. The full write-up is on the Debrief tab.`,
        sources: [src],
      };
    default: return null;
  }
}

/** Trim a passage to the first N sentences, for the shortened shape. */
function shorten(text, sentences = 3) {
  const parts = text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/);
  return parts.slice(0, sentences).join(" ");
}

/**
 * @param {object} opts
 *   index      - built search index over knowledge/
 *   analysis   - result of analyse(), or null if no session is loaded
 *   shaping    - { depth: "full" | "short" | "normal", note } from the state engine
 *   adaptive   - whether shaping should be applied at all
 */
export function ask(question, { index, analysis = null, shaping = null, adaptive = true } = {}) {
  const q = String(question || "").trim();
  if (!q) return { text: "Ask me something about the project, or about the session you have loaded.", sources: [], kind: "empty" };

  // Session questions first — they're more specific than anything in the notes.
  for (const p of DATA_PATTERNS) {
    if (p.re.test(q)) {
      const fromData = answerFromData(p.key, analysis);
      if (fromData) return { ...fromData, kind: "data", shapingNote: adaptive ? shaping?.note : null };
      if (!analysis) {
        return {
          text: "That's a question about your own data, but no session is loaded yet. Open one from the Sessions tab and ask me again.",
          sources: [], kind: "needs-session",
        };
      }
    }
  }

  const hits = search(index, q, 3);
  if (!hits.length) {
    return {
      text: "I can't find anything about that in the project notes, and I'd rather say so than guess. The notes cover the headset and the bands, reading your own data, running the app, and the safety and privacy rules. If it's about your session, load one from the Sessions tab first.",
      sources: [], kind: "no-answer",
    };
  }

  const top = hits[0];
  const depth = adaptive ? (shaping?.depth || "normal") : "normal";
  let text = top.text.trim();
  if (depth === "short") {
    text = shorten(text, 3);
    text += "\n\nThat's the short version — ask me to go deeper and I'll give you the whole thing.";
  } else if (depth === "normal") {
    text = shorten(text, 6);
  }

  return {
    text,
    sources: hits.map((h) => ({ id: h.id, title: h.title, section: h.section, score: Math.round(h.score * 100) / 100 })),
    kind: "notes",
    shapingNote: adaptive ? shaping?.note : null,
  };
}

export const STARTER_QUESTIONS = [
  "What is alpha and why does it matter?",
  "What do focus and calm actually measure?",
  "Is 0.35 focus good or bad?",
  "When was my best stretch today?",
  "How much of my session can I trust?",
  "How do I record a real session?",
];
