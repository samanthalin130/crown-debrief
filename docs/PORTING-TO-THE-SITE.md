# Putting the interpreter on the Astro site

For `crown-site-v2`. Short, because there is genuinely not much to it: the
interpreter is plain HTML, one stylesheet, one script, and four ES modules, and it
already uses the Console Decoded palette and markup patterns.

Nothing needs a server. Do **not** add a Netlify Function for this. It was checked
against a plain static file server with no backend at all and produced identical
output, and there is no `fetch`, `XMLHttpRequest`, `EventSource` or `WebSocket`
anywhere in the shipped code.

---

## What you are copying

Run this in `crown-debrief` first:

```bash
npm run build
```

That writes `dist/` with exactly the eight files the interpreter needs. It fails
loudly if a module ever grows an import that is not included, so a broken static
build is caught here rather than in someone's browser.

## Where each file goes

| From `crown-debrief` | To `crown-site-v2` |
| --- | --- |
| `dist/core/raw-csv.js` | `public/interpreter/core/raw-csv.js` |
| `dist/core/dsp.js` | `public/interpreter/core/dsp.js` |
| `dist/core/bandpower.js` | `public/interpreter/core/bandpower.js` |
| `dist/core/interpret.js` | `public/interpreter/core/interpret.js` |
| `dist/interpret.js` | `public/interpreter/interpret.js` |

The modules go in `public/` rather than `src/` on purpose. They are already valid
ES modules that browsers load directly, so they should be served as-is rather than
put through Vite, and `public/` is the folder Astro copies verbatim.

The stylesheet and the markup do **not** get copied as files. They go into the page.

## The page

Create `src/pages/interpreter.astro`:

```astro
---
import Base from "@/layouts/Base.astro";
---

<Base
  title="Session Interpreter"
  meta_title="Session Interpreter"
  description="Drop a Neurosity Crown recording and read what the console threw away: band power per electrode, signal quality, and what the session actually did."
>
  <div class="cd">
    <!-- paste the contents of crown-debrief/web/interpret.html
         from <nav class="nav"> down to and including </footer>,
         but NOT the <script> tag at the bottom -->
  </div>
</Base>

<script src="/interpreter/interpret.js" type="module"></script>

<style is:global>
  /* paste the whole of crown-debrief/web/interpret.css here */
</style>
```

Three things about that, each of which matters.

**The wrapper must be `<div class="cd">`.** Every style in the interpreter is
scoped under `.cd`, the same scope Console Decoded uses. That is what makes the two
pages read as one document and what stops the interpreter's styles leaking into the
rest of the site.

**The stylesheet needs `is:global`.** Astro scopes `<style>` blocks to the component
by default, which would strip the styles off the markup the script injects at
runtime. `is:global` is required, and the `.cd` scope is what keeps it safe.

**The script tag must stay outside the `<style>` and use `type="module"`.** Point it
at `/interpreter/interpret.js`, the copy in `public/`.

## One import path to change

`dist/interpret.js` begins with three imports written for a folder layout where
`core/` sits next to the page:

```js
import { parseRawCsv, looksLikeRawExport, CROWN_CHANNELS } from "./core/raw-csv.js";
import { analyseRecording, BAND_KEYS, BANDS } from "./core/bandpower.js";
import { interpret, INDICATORS } from "./core/interpret.js";
```

Served from `public/interpreter/interpret.js`, `./core/` already resolves correctly
to `public/interpreter/core/`. **If you put the modules anywhere else, these three
lines are the only thing to change.** Nothing else in the codebase hardcodes a path.

## Client-side navigation is already handled

The site runs Astro's `ClientRouter`, so a page can be mounted again after a
client-side navigation. The interpreter uses the same guard Console Decoded uses: a
`dataset.wired` flag, an `initInterpreter()` function, and

```js
initInterpreter();
document.addEventListener("astro:page-load", initInterpreter);
```

This was tested by firing `astro:page-load` twice on a live page. It re-initialises
without double-binding: one render, eight electrode chips rather than sixteen.

## Linking it in

Add it to `src/config/menu.json`, and link it from `console-decoded.astro`. The
natural place is the worked-session section, which walks through interpreting one
recording by hand: the interpreter does the same thing to any recording the reader
brings.

Two links worth adding in the other direction too. The interpreter's explainer
panels cover the same terms as Console Decoded, so anything on the interpreter page
that mentions a band or signal quality can point at the matching entry there.

## Checking it worked

1. `npm run dev`, open `/interpreter`.
2. Drop a console CSV export on it. A five-minute recording takes about three
   seconds and should produce a headline, eight electrode chips, two charts and a
   band table.
3. Navigate away to another page and back using a site link, not a reload, then
   drop a file again. This is the ClientRouter check: if it still works, the
   re-initialisation is fine.
4. Open DevTools, Network tab, and drop a file. **Nothing should be requested.**
   If anything is, something has been wired to a backend that should not be.

## What not to do

Do not copy `web/index.html`, `web/app.js`, `web/styles.css`, `server.js`, or
anything in `collector/`. Those belong to the session debrief, which is a separate
tool that reads a different file format and does need the dev server.
