# Session Debrief — handoff notes — GFT Labs Digital Innovation Lab

Written for someone picking this up cold, with no background in EEG and no prior contact with the project.

---

## 1. What this is, in one paragraph

A Neurosity Crown is an eight-electrode EEG headset. A small Node tool records what it streams — two ready-made scores called focus and calm, plus power in five frequency bands — into a CSV every two seconds. This project reads those CSVs and does two things: it writes a plain-English report on a session, and it answers questions about the data and the project. Nothing here requires the headset to be present: a mock mode generates realistic data so the whole system can be run, tested, and demonstrated with no hardware.

## 2. Running it

    npm run sample
    npm start

That's the whole thing. No dependency installation, no API key, no account, no network. Node is the only requirement. `npm test` runs 75 checks.

If you want to record from a real Crown, `npm install` pulls the Neurosity SDK and `npm run log:live` records against credentials in `.env`.

## 3. How the synthetic data works, and why it exists

The Crown was uncharged and offline during the build, so the entire system was written against generated data. That constraint turned out to be worth keeping.

`scripts/make-sample-data.js` produces a week of sessions. It is not random noise. Focus follows the shape of a working day — a rise through the morning, a late-morning peak, a post-lunch dip, a partial afternoon recovery, an evening fade — with mean-reverting drift on top, so attention wanders the way attention does rather than teleporting between readings. Band power is derived to be internally consistent with the metrics: gamma tracks focus and alpha tracks calm, because that is how Neurosity computes them, and overall magnitude falls off with frequency so delta is largest. Occasional windows are marked as poor signal, so the quality filter has something to filter.

The generator is seeded, so the same week comes out every run and a bug is always reproducible.

**Every synthetic row carries `mode=mock`, and the interface labels the session as synthetic wherever it appears.** Nothing generated can be mistaken for a real recording.

The value beyond convenience: the project can be cloned and run by anyone, tests can run in CI, and a demo never depends on someone having a charged headset.

## 4. What the numbers mean

Read `knowledge/eeg-primer.md` first — it is written for exactly this audience and takes about five minutes.

The two things that catch everyone out:

**Focus and calm are model outputs, not measurements.** Neurosity derives focus from gamma (30–44 Hz) and calm from alpha (7.5–12.5 Hz). A focus of 0.42 means a classifier put the probability at 0.42, not that 42% of something was measured.

**Above 0.3 is already significant**, per Neurosity's own documentation. Anyone reading 0.35 as a failing grade has misread the scale. This is why the app reports everything against a personal baseline learned from the data rather than against a fixed threshold.

Third, less obvious: **a poor signal produces confident-looking numbers.** An electrode sitting on hair still emits values. The app therefore discards readings from poor-signal windows and reports coverage as a headline figure. Below 75% coverage, treat the rest as provisional.

## 5. Why the debrief uses no AI model

Two reasons, and the second matters more.

A public site cannot ship an API key — anyone can read it. And a research tool that stops working when a paid service is down or a free tier is exhausted is fragile in a lab.

So the debrief is computed and then written from sentence templates driven by those computations. The useful side effect is auditability: every claim traces back to a number in the CSV, and you can check any of them. That is a stronger position for research than "the model said so".

Where a model genuinely helps — rewriting the report in more natural prose, answering open-ended questions — the integration is optional, local-only, and receives the computed summary rather than raw EEG. One function builds that summary and it is the only path from recorded data to any external service.

## 6. Rules the code follows

These are constraints, not preferences, and they should survive future changes.

**A poor signal never produces a confident state.** The live state engine reports `unreadable` rather than guessing. A loose electrode must never be laundered into a plausible-looking reading.

**Adaptation changes shape, never substance.** The guide may shorten or scaffold an answer when your readings suggest you are scattered. It must never soften, hedge, or withhold something true because it decided you couldn't handle it.

**No clinical claims.** This is a consumer headset, not a medical device. The app describes what the data did and stops. Statements of the form "your theta indicates a deficiency" are not supported by anything measured here.

**The guide cites everything, and refuses rather than guesses.** If retrieval finds nothing, the answer says so. There is a test asserting this.

**No credentials in browsers.** There is no bring-your-own-key input and there should never be one — beyond the technical exposure, it trains people to paste credentials into web pages.

## 7. Publishing it without a server

The intended handoff is a static site: the same `core/` modules, published as files, with no backend. A visitor drops in a CSV, it is read inside their own browser, and the full debrief renders. Nothing uploads. The guide answers from a search index built at publish time by `scripts/build-index.js`, so no server is needed for that either.

This works because every module in `core/` runs unmodified in both Node and a browser. Turning the dev panel into the static site is a matter of a different entry point, not a rewrite. It is not built yet; it is the next task.

If the lab later wants model-written answers on the open web, the correct shape is a small service the lab owns, holding a key the lab controls and pays for. That is deliberately not built here.

## 8. Where this could go — and how far it actually is

The stated long-term ambition is thinking a thought to move a robotic arm. It is worth being precise about the distance.

Focus and calm are **state** signals: how you are. Motor imagery — imagining a movement — is an **intent** signal: what you want. The second cannot be derived from the first. They are different phenomena and no amount of focus logging produces an arm command.

What is genuinely promising is the hardware. Imagining a left- or right-hand movement suppresses rhythms over the opposite sensorimotor cortex, and the Crown's C3 and C4 electrodes sit exactly there — the standard montage for this work. What's missing is not sensors but **labelled data**: many trials of cue, imagine, rest, each tagged with what was imagined.

This project does not build that. What it does build is the recording discipline it would need — consistent timestamped files, a quality gate applied before anything is trusted, a person identifier, and a notes format that attaches meaning to a moment in time. The session notes feature is the same primitive a training pipeline would use, arrived at from the useful end rather than the theoretical one.

A realistic sequence from here: extend the collector to run cue-based trials, collect labelled motor-imagery data from one person, train and honestly evaluate a two-class classifier, and only then consider actuation — with a hardware kill switch, a confidence floor, a dwell requirement, and a rule that unreadable signal means stop rather than repeat the last command.

## 8b. How to read the interface

**Today** answers "how did that go" with one figure: deep work, the time spent meaningfully above that person's own normal. It is expressed in minutes rather than as a score on purpose — minutes are a unit people already understand, they cannot be misread as a percentage, and counting them does not grade anyone's brain.

**Session** shows the recording as a ribbon of named states rather than as line charts. Four states carry colour — focused, settled, steady, drifting — and two conditions deliberately do not: poor signal is drawn as a hatch and a break in recording as a faint gap. Absence must never look like a state, which is the one rule that palette exists to enforce.

**Detail** holds everything an engineer might want and a user should not be shown first.

## 9. Known limitations

- The Live tab runs on a mock source. Wiring the real Crown into the dev panel's stream is not done; the collector does talk to real hardware.
- Personal baselines are computed per session. Cross-session baselines are more meaningful and are not implemented.
- `hour of day` analysis is reported from a single session, which is not enough to be a pattern. The interface says so.
- Retrieval is keyword-based. It handles the questions in the test suite well and will miss paraphrases that share no vocabulary with the notes.
- The static site is designed for but not built.
- The baseline uses the ten most recent sessions with no seasonal or day-of-week weighting beyond the phrase in the delta chip.
- Activity tags are applied per event, not by dragging a range on the ribbon.
- No data from a real headset has passed through this system yet. Every number seen so far is synthetic.

## 10. Where to look first

`knowledge/eeg-primer.md` for the domain. `README.md` for running it. `core/stats.js` is where every figure in the debrief is computed, and `test/run-tests.js` documents the behaviour that is meant to hold.
