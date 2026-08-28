# Session Debrief

Two tools for reading what a [Neurosity Crown](https://neurosity.co/) EEG headset
recorded, built for people who have never encountered EEG before.

Independent research using hardware loaned by the GFT Labs Digital Innovation Lab.

---

## What I built

Two separate tools that read two different files, for two different situations.
They share their statistics and their vocabulary, and nothing else.

**The interpreter** reads a **CSV exported from the Neurosity console**. That file
is raw voltage and nothing else: 256 rows a second, one column per electrode, no
header row, and no focus, calm or band power, because the console does not write
them into an export. So the interpreter computes them. It works out how much each
of the eight electrodes was swinging, throws out the ones that were picking up
muscle rather than brain rhythm, measures band power per electrode in 2 second
windows, and reports minute by minute what the readable channels did. Then it says
so in plain English. It runs entirely inside the browser, with no server, no
account and no key, and the file never leaves the machine it was dropped on.

**The debrief** reads a **CSV written by the focus logger**, a small recorder
included here as `collector/logger.js`. That is a different file: one row every two
seconds, with focus and calm already computed on the headset and band power
averaged across all eight electrodes before it was written. Because those numbers
are already there, the debrief does no signal processing. It does the things the
interpreter cannot: how a session compares with your own normal learned across ten
sessions, your longest focused stretches with clock times, how the session split
across named states, and a guide that answers questions from a set of notes and
says where every answer came from.

**No AI model writes any of it.** Every sentence in either tool is assembled from a
number the code computed, which means both work with no key, no network and no
cost, and any claim either makes can be checked against the file. There is a **Copy
summary** button for exactly this reason: it puts a compact, labelled summary on
your clipboard, ready to paste into whichever assistant you prefer. The tools own
the numbers; a model can own the words.

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

## Try it

You need Node. You do not need the headset, an API key, or `npm install`.

```bash
npm run sample     # writes a synthetic week into data/, for the debrief
npm start          # open the address it prints
```

- The debrief is at `/`.
- The interpreter is at `/interpret.html`, and needs a console CSV export to read.

The synthetic data is labelled as synthetic everywhere it appears, so it cannot be
mistaken for a real reading. It exists for the debrief, which needs ten sessions
before it will compare anything. The interpreter does not use it and cannot read it.

To build the interpreter as a folder of files with no server behind it:

```bash
npm run build      # writes dist/, eight files, deployable anywhere static
```

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
collector/logger.js   records the focus logger CSV (unchanged from crown-focus-logger)

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
test/run-raw-tests.js     41 checks on the interpreter
```

Live telemetry in the debrief uses Server-Sent Events rather than WebSockets.
Telemetry only travels one way, which is what SSE is for; it needs no library and
reconnects on its own.

## Tests

```bash
npm test           # both suites, 116 checks
npm run test:raw   # the interpreter only
```

The interpreter's suite includes checks against a real recording. Those files are
not in version control, so those checks **skip** rather than fail on a fresh clone,
and say why. The figures they check against are committed, in `test/expected/`,
because those are already-published numbers rather than raw brain data.

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
