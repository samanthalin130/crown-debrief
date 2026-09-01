// A small keyword search over the project's own notes. About sixty lines, no
// dependencies, no network -- which is what lets the public site answer questions
// with no server and no model behind it.
//
// It scores with BM25: a word counts for more when it's rare across all the notes
// and appears often in one of them, with longer notes discounted so they don't win
// on length alone.

const STOP = new Set(("a about an and any are as at be been but by can could did do does for from get give got has have how i if in into is it its like make may me mine my need of on or should so some tell that the their them then there these this those to us use was we were what when where which who why will with would you your"
  ).split(" "));

export function tokenize(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

/**
 * Crude suffix trimming so "bands" finds "band" and "running" finds "run".
 * Doubled consonants are collapsed after -ing/-ed so "runn" becomes "run".
 */
function stem(w) {
  let s = w;
  if (/ies$/.test(s) && s.length > 4) return s.slice(0, -3) + "y";
  if (/ing$/.test(s) && s.length > 5) s = collapse(s.slice(0, -3));
  else if (/ed$/.test(s) && s.length > 4) s = collapse(s.slice(0, -2));
  else if (/sses$/.test(s)) s = s.slice(0, -2);
  else if (/es$/.test(s) && s.length > 4) s = s.slice(0, -1);
  else if (/s$/.test(s) && !/ss$/.test(s) && s.length > 3) s = s.slice(0, -1);
  return s;
}

function collapse(s) {
  return /([bdfglmnprt])\1$/.test(s) ? s.slice(0, -1) : s;
}

/** Words in a heading say what a section is about, so they count for more than words in the body. */
const HEADING_WEIGHT = 4;

export function buildIndex(chunks) {
  const docs = chunks.map((c) => {
    const heading = tokenize(`${c.title} ${c.section || ""}`);
    const terms = [...tokenize(c.text)];
    for (let i = 0; i < HEADING_WEIGHT; i++) terms.push(...heading);
    const tf = new Map();
    terms.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    return { ...c, tf, len: terms.length };
  });
  const df = new Map();
  docs.forEach((d) => new Set(d.tf.keys()).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / (docs.length || 1);
  return { docs, df, avgLen, N: docs.length };
}

/**
 * How much of the question the notes actually know about. BM25 ranks whatever is
 * least bad, so on its own it will always return something: "what will the stock
 * market do next quarter" matched a section because "next" happens to appear in
 * it once. Rarity cannot separate those, since "next" is rarer here than "alpha".
 * What separates them is coverage. A question about these notes has most of its
 * content words somewhere in them; an off-topic one has almost none. Below half,
 * the guide has nothing to say and should say so rather than answer anyway.
 */
const MIN_QUERY_COVERAGE = 0.5;

export function search(index, query, limit = 4) {
  const qTerms = tokenize(query);
  if (!qTerms.length) return [];

  const known = qTerms.filter((t) => index.df.has(t)).length;
  if (known / qTerms.length < MIN_QUERY_COVERAGE) return [];

  const k1 = 1.4, b = 0.75;

  const scored = index.docs.map((d) => {
    let score = 0;
    for (const term of qTerms) {
      const f = d.tf.get(term);
      if (!f) continue;
      const n = index.df.get(term) || 0;
      const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / index.avgLen)));
    }
    return { ...d, score };
  });

  return scored
    .filter((d) => d.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, limit)
    .map(({ tf, ...rest }) => rest);
}

/** Split a markdown note into one chunk per heading, so answers can cite a section. */
export function chunkMarkdown(filename, markdown) {
  const chunks = [];
  const lines = markdown.split(/\r?\n/);
  let title = filename, section = null, buf = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) {
      chunks.push({
        id: `${filename}#${(section || "intro").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        file: filename, title, section: section || "Introduction", text,
      });
    }
    buf = [];
  };
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##+\s+(.*)/);
    if (h1) { flush(); title = h1[1].trim(); section = null; }
    else if (h2) { flush(); section = h2[1].trim(); }
    else buf.push(line);
  }
  flush();
  return chunks;
}
