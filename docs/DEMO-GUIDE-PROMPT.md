# Ship the guide in the static demo (for the crown-debrief Claude Code session)

The word is given: the guide ships in the demo. This is the build-static.js change you offered,
scoped to stay simple and to keep every verified claim true.

## Why this is small
The architecture already supports it. HANDOFF section 7: the static site's guide answers from a
search index built at publish time, no server needed. Every core/ module runs unmodified in the
browser. scripts/build-index.js already produces the index. You are wiring existing parts.

## The one trap: keep the zero-fetch verification true
The demo's serverless claim was verified as zero fetch/XHR/WebSocket/sendBeacon. Loading
search-index.json via fetch() would break that. Ship the index as a SCRIPT TAG instead: have the
build emit search-index.js that assigns the index to a global (window.CROWN_SEARCH_INDEX = ...)
and include it with a script src tag. No fetch API anywhere. Re-run the serverless verification
after and confirm it still passes.

## Scope (v1, simple)
1. build-static.js additionally bundles core/search.js and the guide answer logic, runs
   scripts/build-index.js at build time, and emits the index as the script-tag global above.
2. UI: a guide panel, either a section on the demo's main page or a linked guide.html, whichever
   is lighter in this codebase. Contents: a search box, the existing starter questions, answers
   rendered with their source citations (which note, which section), and the existing
   refuses-rather-than-guesses behavior preserved exactly. Console Decoded palette, consistent
   with the interpreter page.
3. If wiring "answers about the loaded session" is trivial with the existing guide.js, include
   it; if it drags, ship knowledge-Q&A only and note it. Do not let this stall the round.
4. Tests: add one check that the static build contains the index and that the built guide
   answers one known question and refuses one unknown one. Both suites stay green.
5. Constraints: no em or en dashes in anything you write (context-aware, ranges stay ranges, you
   know this one now); no network beyond same-origin static files; nothing uploads, ever.

## After it deploys
Give Samantha the sentence for the website session, exactly this: "Drop in a Crown CSV and read
the session, then ask the guide about it, entirely in your browser. Nothing uploads." (If v1
shipped knowledge-only Q&A, use: "Drop in a Crown CSV and read the session, and ask the guide
how it all works, entirely in your browser. Nothing uploads.") The website session puts that
sentence under the Try-it button on /what-i-built and the case-study interpretation-layer link.

## Fallback if time runs out before her presentation
Ship the interpreter-only demo now with your original sentence ("drop in a Crown CSV and read
the session, entirely in your browser") and add the guide after. A live smaller demo beats a
pending bigger one.
