// The guide, as it runs in the static demo.
//
// The dev panel builds this same index by requesting search-index.json over
// HTTP. The static build must not: the demo's serverless guarantee is verified
// by grepping the built output for every network primitive, so the index is
// handed over as a global set by a plain script tag instead. Everything below
// is the same core/ code the dev panel runs.

import { buildIndex } from "./core/search.js";
import { ask, STARTER_QUESTIONS } from "./core/guide.js";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const raw = window.CROWN_SEARCH_INDEX;
if (raw?.chunks?.length) {
  const index = buildIndex(raw.chunks);

  // Light markdown, matching the dev panel: lists, bold, code. Nothing else.
  const light = (t) =>
    esc(t)
      .split(/\n/)
      .map((l) => {
        const b = l.match(/^\s*[-*]\s+(.*)$/);
        return b ? `<li>${b[1]}</li>` : l;
      })
      .join("\n")
      .replace(/(<li>[\s\S]*?<\/li>)(?!\n<li>)/g, "<ul>$1</ul>")
      .replace(/<\/ul>\n<ul>/g, "")
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`(.+?)`/g, "<code>$1</code>");

  function addMsg(text, sources, opts = {}) {
    const div = document.createElement("div");
    div.className = `gmsg${opts.me ? " me" : ""}`;
    if (opts.me) div.textContent = text;
    else div.innerHTML = light(text);
    if (sources?.length) {
      const s = document.createElement("span");
      s.className = "gsrc";
      s.textContent = `From: ${sources[0].title}${sources[0].section ? `, ${sources[0].section}` : ""}${
        sources.length > 1 ? ` and ${sources.length - 1} more` : ""
      }`;
      div.appendChild(s);
    }
    $("gchat").appendChild(div);
    div.scrollIntoView({ block: "nearest" });
  }

  function sendQ() {
    const q = $("gq").value.trim();
    if (!q) return;
    addMsg(q, [], { me: true });
    $("gq").value = "";
    // No session is loaded into the guide in this build, so it answers from the
    // project notes and says so plainly when a question needs data it does not have.
    const res = ask(q, { index, analysis: null, shaping: { depth: "full" }, adaptive: true });
    addMsg(res.text, res.sources);
  }

  $("gstarters").innerHTML = STARTER_QUESTIONS.map(
    (q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`,
  ).join("");
  $("gstarters").addEventListener("click", (e) => {
    const q = e.target.dataset.q;
    if (q) {
      $("gq").value = q;
      sendQ();
    }
  });
  $("gsend").addEventListener("click", sendQ);
  $("gq").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendQ();
  });

  addMsg(
    "Ask me about the headset, the bands, reading your own data, or how this project works. Every answer names the note it came from, and when I cannot find something I say so rather than guessing.",
    [],
  );
  $("guide").hidden = false;
}
