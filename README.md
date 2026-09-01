# Crown Debrief

Reads what a [Neurosity Crown](https://neurosity.co/) EEG headset recorded and says what happened in it, in plain English, with no AI model anywhere in the loop.

This is one half of independent research on a Crown headset loaned by the GFT Labs Digital Innovation Lab: 219 training trials audited and 248,320 samples of raw voltage read from the samples up. The write-up of what that produced is at [crown-analysis-tawny.vercel.app](https://crown-analysis-tawny.vercel.app/), and the tool in this repository runs live in a browser at [crown-debrief.vercel.app](https://crown-debrief.vercel.app/).

**[Try it now](https://crown-debrief.vercel.app/)** with no install: drop in a CSV exported from the Neurosity console and read the session, or ask the built-in guide how any of it works. Nothing uploads, because there is nowhere for it to go.

| | |
| --- | --- |
| Checks | **120** across two suites, all green |
| Agreement with the Neurosity console | **within 0.1%** on per-channel signal quality, on a real five-minute recording |
| Network calls in the deployed build | **zero**: no fetch, no XHR, no WebSocket, no beacon |
| Dependencies to run it | **none**; the interpreter and its guide are plain JavaScript on Node |

## Quickstart

Every command below was run from a fresh `git clone` into an empty directory before it was written here.

```
git clone https://github.com/samanthalin130/crown-debrief.git
cd crown-debrief
npm test      # 75 + 41 checks pass; 4 skip, see below
npm run build # writes dist/, a static site with no backend
```

Open `dist/index.html` through any static file server and the interpreter is there, guide included. There is nothing to install for any of that: it runs on Node alone.

Four checks skip on a clean clone. They run the pipeline against a real Crown recording, and real recordings are deliberately not in version control, so the checks say so and step aside rather than failing. With the recordings present the raw suite runs 45 rather than 41, for 120 in total.

To see the debrief rather than the interpreter, `npm run sample` writes a synthetic week, labelled synthetic everywhere it appears, and `npm start` serves the dev panel.

## The two things that catch everyone out

**Focus and calm are model outputs, not measurements.** Neurosity derives focus
from gamma and calm from alpha, and both come out as a probability between 0 and 1.
A focus of 0.42 means a classifier put the probability at 0.42, not that 42 per cent
of something was measured.

**Above 0.3 is already significant**, per Neurosity's own documentation. Anyone
reading 0.35 as a failing grade has misread the scale. It is why neither tool uses
a fixed threshold and why both compare you against your own data instead.

And a third that matters more than either: **a poor signal produces confident-looking
numbers.** An electrode sitting on hair still emits values. Both tools check signal
quality before anything else, and the interpreter will refuse to read a recording in
which no electrode was quiet enough to trust.

## Is the interpreter verified?

Partly, and it is worth being exact about which parts.

**The signal processing is verified against known answers.** A sine of amplitude A
has power A squared over two, so a spectrum that disagrees is wrong and there is
nothing to argue about. The tests check exactly that, along with two rhythms keeping
their ratio, total power matching the variance, and a 5,000 µV drift leaving a
small alpha rhythm untouched. Eyeballing a plot of real EEG would confirm anything;
this does not.

**The pipeline is verified against the device itself.** Signal quality per channel,
computed here from a real five-minute recording, against what the Neurosity console
reported for the same file:

| Channel | This project | Console |
| --- | --- | --- |
| C3 | 4060 µV | 4063 µV |
| F6 | 4013 µV | 4014 µV |
| C4 | 4789 µV | 4793 µV |
| PO3 | 238 µV | 231 µV |
| PO4 | 142 µV | 129 µV |

The loud channels agree to within 0.1 per cent, which confirms the parse, the
filter and the statistics all at once. That is the strongest check available with
no headset to hand.

**The reading of that session is reproduced independently.** Six channels land
between 2,192 and 4,789 µV of artifact and are left out; PO3 and PO4 survive;
posterior alpha rises steeply and peaks in the third of five minutes, then eases
back. That shape holds under every preprocessing variant tried.

**What is not verified: anything about what the recordings mean.** See below.

Full detail, including two places where this disagrees with figures published
earlier, is in [docs/WHAT-THE-INTERPRETER-FOUND.md](docs/WHAT-THE-INTERPRETER-FOUND.md).

## Honest limits

- **No live Crown has ever been connected to this.** The collector's live mode is
  written but has not been run against a headset. Everything verified above comes
  from files exported earlier, not from a device this code has spoken to.
- **The interpreter's calm and focus figures are indicators, not scores.** Neurosity's
  focus and calm come from trained models that run on the headset and are not written
  into an export. They cannot be recovered from raw voltage. What the interpreter
  computes are documented band-power indicators, labelled as such everywhere they
  appear, and they are not comparable with a number the console showed you.
- **Exact percentages move with preprocessing choices.** Removing slow drift first
  or not, and averaging a window's share one way or another, changes posterior alpha
  in one session from 2.5 to 5.8 per cent of total power. The direction and the
  timing of a change survive all of those choices. The decimals do not. Read the
  shape.
- **Three recordings, one person, no protocol.** Nothing here is a pattern, and no
  session was recorded under conditions designed to test anything.
- **Six of eight electrodes were unusable in the best recording.** That is normal
  for dry consumer electrodes near the jaw and brow, and it is also a hard ceiling
  on what any of it can support.
- **EDF is not supported.** The console offers it and it is the right format for
  handing data to a researcher, but there is no EDF file here to test a parser
  against, and shipping an unverified binary parser would be worse than shipping
  none.
- **Delta is mostly not brain rhythm.** In a waking recording it is drift and
  movement, and it dominates every channel even after filtering. Band shares are
  only ever compared between windows, never read as absolutes.
- **Nothing here is diagnostic.** The Crown is a consumer wellness device. The honest
  ceiling of eight dry electrodes is state, not condition.
- The debrief's own limits are unchanged: keyword retrieval that will miss
  paraphrases, activity tags applied per event rather than by dragging a range, and
  baselines with no day-of-week weighting.

## What a professional should verify with a real Crown next

None of the following can be done without hardware, and none of it has been done.

1. **Confirm the export path end to end.** Record a known session, export it, and
   check that the interpreter's parse matches the console's own metadata on a file
   nobody has seen before. The three files here were all exported months ago.
2. **Confirm signal quality against a live reading.** Wear the headset, read the
   console's live signal quality, record, export, and check the interpreter's
   per-channel figures against what was on screen at the time. The agreement shown
   above is against a screenshot of a recording's summary, not against a live
   session.
3. **Run the eyes-open, eyes-closed test.** Closing the eyes produces a large,
   well-established rise in posterior alpha. It is the standard sanity check for any
   EEG pipeline, it takes two minutes, and it would confirm the whole chain is
   measuring what it claims to. This is the single highest-value thing on this list.
4. **Establish how much of the artifact is fixable.** Six of eight channels were
   unusable. Find out whether careful preparation, parting hair under each sensor
   and waiting for contact to settle, moves that to five or six usable channels, or
   whether it is a hard limit of the hardware on this person's head.
5. **Check the indicators against the console's own scores.** Record while watching
   the live focus and calm readouts, note them, then compare the recording's
   indicators against them. They will not match, and that is expected. What matters
   is finding out whether they at least move in the same direction, which would tell
   you what the indicators are worth.
6. **Repeat one protocol several times.** Any claim about what a session meant needs
   more than one session. The same five-minute meditation, recorded on several days,
   would establish whether the minute-three alpha peak is a property of the practice
   or of that afternoon.
7. **Recompute or remove the published whole-session band table.** One table in the
   case studies could not be reproduced here and is inconsistent with its own
   surrounding prose. See the findings document.

## How it is put together

```
collector/logger.js   records the focus logger CSV (vendored from crown-focus-logger,
                      with its imports changed for this repo: see the note at the top of
                      the file. The CSV schema it writes is identical.)

core/                 all the real logic, as plain modules that run in Node and a browser
  raw-csv.js          the console's eleven-column export, and its quirks
  dsp.js              FFT, Welch PSD, band power, a 1 Hz zero-phase high-pass
  bandpower.js        per-electrode band power per 2 second epoch, rolled into windows
  interpret.js        the reading, in English, with labelled indicators
  csv.js              the focus logger's format, tolerant of older files
  stats.js            quality gate, session baseline, peaks, slumps, states
  baseline.js         cross-session norms, per metric and per hour of day
  vocab.js            the fixed five-word scale and its thresholds
  debrief.js          the written report and the suggestion
  format.js           Markdown export and clipboard summary
  search.js           BM25 keyword search over knowledge/
  guide.js            question answering, from notes or from your data
  state.js            live state with hysteresis and a quality gate

web/
  interpret.html      the interpreter: drop a recording, read it. No server.
  interpret.css       Console Decoded palette, scoped under .cd
  interpret.js        the interpreter's interface
  index.html, app.js  the debrief's three screens
  ribbon.js           state ribbon and deviation strip, on canvas

scripts/build-static.js   gathers the interpreter into dist/, with a completeness check
server.js                 zero-dependency dev server, needed by the debrief only
test/run-tests.js         75 checks on the debrief
test/run-raw-tests.js     45 checks on the interpreter, 4 needing a real recording
```

Live telemetry in the debrief uses Server-Sent Events rather than WebSockets.
Telemetry only travels one way, which is what SSE is for; it needs no library and
reconnects on its own.

## Recording your own sessions

```bash
npm run log        # focus logger, mock mode, no headset needed
npm install        # only needed for live mode
npm run log:live   # real Crown; requires .env
```

Copy `.env.example` to `.env` for live mode. Live mode has not been run against a
real headset. To get a file the interpreter can read, export a recording from the
Neurosity console as CSV instead.

## Privacy

Recorded sessions and notes are files on your own machine and are never uploaded.
The interpreter reads a dropped CSV inside the visitor's browser and sends it
nowhere; there is nowhere for it to go, because the page has no backend. There is no
"paste your API key" box and there should never be one. See
`knowledge/safety-and-privacy.md`.

Real recordings are excluded from version control by `.gitignore`.

## Documentation

- [How to use the interpreter](docs/USING-THE-INTERPRETER.md), in plain language
- [Putting the interpreter on the Astro site](docs/PORTING-TO-THE-SITE.md)
- [What the interpreter found](docs/WHAT-THE-INTERPRETER-FOUND.md), including where
  it disagrees with figures published earlier
- [HANDOFF.md](HANDOFF.md), for someone picking the project up cold

---

*Built by Samantha Lin as part of an independent exploration of brain-computer
interfaces and AI.*

## What this deliberately does not do

- **It does not use an AI model.** Every sentence is assembled from a number the code computed, so any claim it makes can be checked against the file it read. The guide retrieves a passage from the project notes and names it; when it finds nothing it says so instead of answering.
- **It does not upload anything.** There is no account, no key and no server, and the deployed build contains no network primitive at all.
- **It does not diagnose.** Eight dry electrodes on a consumer headset report state, not condition.
- **It has never seen a live headset.** Everything verified here came from exported files. The collector's live mode is written and unrun.

## How this was built

Designed, specified, and verified by Samantha Lin. Implementation was AI-assisted under her direction, with adversarial review and automated checks gating every shipped claim.

## Related

- [crown-focus-logger](https://github.com/samanthalin130/crown-focus-logger), the recorder that writes the CSV the debrief reads.
- [The research write-up](https://crown-analysis-tawny.vercel.app/), including the session analyses and the findings.

## License

MIT. See [LICENSE](LICENSE).
