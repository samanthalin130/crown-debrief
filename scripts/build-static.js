// Builds the interpreter as a folder of plain files with no server behind it.
//
// There is nothing to compile here. The interpreter already runs in a browser,
// so this only gathers the files it imports into one directory that any static
// host will serve: the page, its stylesheet, its script, and the core/ modules
// it imports. That is the whole reason core/ avoids anything Node-specific.
//
// Output: dist/ , which can be dropped on Netlify, or copied into an Astro
// site's public/ folder, or opened through any static file server.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkMarkdown } from "../core/search.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist");

// The modules the interpreter page actually imports, directly or transitively.
// raw-csv/dsp/bandpower/interpret read the recording; search/guide/debrief answer
// questions about the project notes. Both halves run unmodified in a browser.
const CORE = ["raw-csv.js", "dsp.js", "bandpower.js", "interpret.js", "search.js", "guide.js", "debrief.js"];
const WEB = ["interpret.html", "interpret.css", "interpret.js", "guide-panel.js"];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "core"), { recursive: true });

for (const f of CORE) writeFileSync(join(OUT, "core", f), readFileSync(join(ROOT, "core", f)));
for (const f of WEB) writeFileSync(join(OUT, f), readFileSync(join(ROOT, "web", f)));

// index.html, so the folder works when served at a bare path.
writeFileSync(join(OUT, "index.html"), readFileSync(join(ROOT, "web", "interpret.html")));

// The search index ships as a SCRIPT TAG GLOBAL, deliberately not as JSON pulled
// over HTTP. The demo's serverless guarantee is verified by grepping the built
// output for every network primitive, and requesting the index would break a claim
// that is made in writing on the website. A global costs one script tag instead.
const notes = readdirSync(join(ROOT, "knowledge")).filter((f) => f.endsWith(".md"));
const chunks = notes.flatMap((f) =>
  chunkMarkdown(f, readFileSync(join(ROOT, "knowledge", f), "utf8")),
);
writeFileSync(
  join(OUT, "search-index.js"),
  `window.CROWN_SEARCH_INDEX = ${JSON.stringify({ chunks })};\n`,
);

// A guard rather than a comment: if a core module ever grows an import of
// something not copied here, the static build is broken and should say so now
// rather than in someone's browser.
const missing = [];
for (const f of readdirSync(join(OUT, "core"))) {
  const src = readFileSync(join(OUT, "core", f), "utf8");
  for (const m of src.matchAll(/from\s+"\.\/([\w.-]+\.js)"/g)) {
    if (!CORE.includes(m[1])) missing.push(`core/${f} imports ${m[1]}, which is not in the static build`);
  }
}
if (missing.length) {
  console.error("Static build is incomplete:");
  missing.forEach((m) => console.error(`  ${m}`));
  process.exit(1);
}

const files = [...WEB, "index.html", "search-index.js", ...CORE.map((f) => `core/${f}`)];
console.log(`Built dist/ with ${files.length} files and no server:`);
files.forEach((f) => console.log(`  dist/${f}`));
console.log(`\nIndexed ${chunks.length} sections from ${notes.length} notes into search-index.js.`);
console.log("Serve that folder from anything static. Nothing in it calls a backend.");
