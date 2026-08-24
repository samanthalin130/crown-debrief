// Builds the search index the guide uses. Run at publish time so the static
// site can answer questions with no server: the browser fetches this one file.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkMarkdown } from "../core/search.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(join(ROOT, "knowledge")).filter((f) => f.endsWith(".md"));
const chunks = files.flatMap((f) => chunkMarkdown(f, readFileSync(join(ROOT, "knowledge", f), "utf8")));

mkdirSync(join(ROOT, "web"), { recursive: true });
writeFileSync(join(ROOT, "web", "search-index.json"), JSON.stringify({ chunks }, null, 0));
console.log(`Indexed ${chunks.length} sections from ${files.length} notes -> web/search-index.json`);
