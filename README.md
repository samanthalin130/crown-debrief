# Crown Debrief

Reads a recorded session from a [Neurosity Crown](https://neurosity.co/) EEG headset and tells you what actually happened — when you peaked, when you crashed, how long your best stretch lasted — and answers questions about the data for someone who has never encountered EEG before.

Built on top of [crown-focus-logger](https://github.com/samanthalin130/crown-focus-logger), which is included here unchanged as `collector/logger.js`. That project solved recording; this one solves making sense of what was recorded.

Independent research using hardware loaned by the GFT Labs Digital Innovation Lab.

---

## Try it in thirty seconds

You need Node. You do **not** need the headset, an API key, or `npm install`.

    npm run sample     # writes a synthetic week into data/
    npm start          # open the address it prints

The synthetic data is labelled as synthetic everywhere it appears, so it can't be mistaken for a real reading.

## What it does

**The debrief** loads a session and reports on it: how much of the recording had a usable signal, what your personal focus range was, your longest focused stretches and clearest dips with clock times, how the session split across states, and how the frequency bands moved. Then it writes that up in plain English and offers one behavioural suggestion.

**The guide** answers questions — about the headset, about the numbers, about how to run things, and about the session you have open. Every answer says where it came from. When it doesn't know, it says so rather than guessing.

## Two things worth knowing before you read your numbers

**Focus and calm are scores, not measurements.** Neurosity derives focus from gamma (30–44 Hz) and calm from alpha (7.5–12.5 Hz), and both come out as a probability between 0 and 1. They are the output of models trained in advance — interpretations of the signal, not physical quantities.

**Anything above 0.3 is already significant.** That's Neurosity's own guidance, and it is the single most common misreading: 0.35 is not "barely a third", it's a meaningful reading. This is also why the app never uses a fixed threshold and instead learns your own range from your own data.

## No AI model is involved in the debrief

Every sentence in the debrief is assembled from a computed number. That's deliberate. It means the debrief works with no API key, no network, and no cost — and it means any claim it makes can be checked against the CSV. A model can optionally rewrite the same facts more naturally when running locally, but it is polish on something already complete.

There is a **Copy summary** button for exactly this reason: it puts a compact, labelled summary of the session on your clipboard, ready to paste into whichever assistant you prefer. The app owns the numbers; the model owns the words.

## The five tabs

| Tab | What's on it |
| --- | --- |
| **Live** | The current stream — focus and calm, band power, per-electrode contact, and the state the app thinks you're in. Runs on a mock source unless a Crown is connected. |
| **Sessions** | Every CSV in `data/`, with its length and how much survived the quality filter. |
| **Debrief** | The full report for the loaded session, plus session notes and export. |
| **Guide** | Questions and answers, with sources. |
| **Diagnostics** | Raw incoming frames, which knowledge sections matched a question and how strongly, the state engine's internals, and server status. |

## Recording your own sessions

    npm run log        # mock mode, no headset needed
    npm install        # only needed for live mode
    npm run log:live   # real Crown; requires .env

Copy `.env.example` to `.env` and fill in your Neurosity credentials for live mode. `.env` and everything in `data/` and `notes/` are excluded from version control.

## How it's put together

    collector/logger.js   records CSV (unchanged from crown-focus-logger)
    core/                 all the real logic, as plain modules
      csv.js              parsing, tolerant of older files
      stats.js            quality gate, baseline, peaks, slumps, states
      debrief.js          the written report and the suggestion
      format.js           Markdown export and clipboard summary
      search.js           BM25 keyword search over knowledge/
      guide.js            question answering, from notes or from your data
      state.js            live state with hysteresis and a quality gate
      mock-source.js      the live mock stream
    knowledge/            the notes the guide answers from
    web/                  the dev panel
    server.js             zero-dependency dev server
    test/run-tests.js     53 checks, no test framework

Everything in `core/` runs unmodified in both Node and a browser. That's what allows the same code to power this dev panel and, later, a static site with no server behind it.

Live telemetry uses Server-Sent Events rather than WebSockets. Telemetry only travels one way, which is what SSE is for; it needs no library and reconnects on its own.

## Tests

    npm test

53 checks covering parsing, the quality gate, the statistics, the written output, retrieval, the guide's refusal to guess, and the state engine.

## Roadmap

- [x] Focus logger — reliable capture *(crown-focus-logger)*
- [x] Session analysis and written debrief
- [x] Guide with retrieval and sources
- [x] Session notes format
- [ ] Retrospective note capture on peaks and dips
- [ ] Static site for GFT Labs — no server, no keys
- [ ] Optional Mistral integration for model-written answers, local only
- [ ] Multi-day comparison

## Privacy

Recorded sessions and notes are files on your own machine and are never uploaded. The published static site will read a dropped CSV inside the visitor's browser and send it nowhere. There is no "paste your API key" box and there should never be one — see `knowledge/safety-and-privacy.md`.

---

*Built by Samantha Lin as part of an independent exploration of brain–computer interfaces and AI.*
