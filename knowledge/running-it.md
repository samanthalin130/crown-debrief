# Running Crown Debrief

## The short version

    npm run sample     # writes a synthetic week into data/ so there is something to look at
    npm start          # starts the dev panel, then open the address it prints

There are no dependencies to install for any of that. It runs on Node alone.

## Recording your own sessions

The collector is `collector/logger.js`, unchanged from the original crown-focus-logger project.

    npm run log        # mock mode: invents plausible data, no headset needed
    npm run log:live   # live mode: connects to a real Crown

Live mode needs credentials. Copy `.env.example` to `.env` and fill in your Neurosity email, password, and device ID. The `.env` file is excluded from version control and should never be committed.

Live mode also needs the Neurosity SDK, which is the only real dependency in the project:

    npm install

## Configuration

Set these as environment variables when running the logger.

- `MODE` — `mock` or `live`. Defaults to `mock`.
- `LOG_INTERVAL_MS` — how often a row is written. Defaults to 2000.
- `OUT_FILE` — where to write. Defaults to `focus-log.csv`.
- `DURATION_SEC` — stop automatically after this many seconds. Defaults to 0, meaning run until you press Ctrl+C.

For the dev panel, `PORT` changes the port (default 5273 — deliberately not 5173, which Vite and most front-end dev servers use) and `MISTRAL_API_KEY` enables the optional model-written answers.

## The five tabs

**Live** shows the current stream — focus and calm against your baseline, band power, and per-electrode contact. It runs on a mock source unless a Crown is connected.

**Sessions** lists every CSV in the data folder, with its length and how much of it survived the quality filter.

**Debrief** is the end-of-day report for whichever session is loaded.

**Guide** answers questions about the project and your data, with sources.

**Diagnostics** shows the raw incoming readings, which knowledge chunks matched a question and how strongly, and the current state engine settings.

## If something looks wrong

Run `npm test`. Thirty-seven checks cover the parsing, the quality gate, the statistics, and the state engine. If those pass and the numbers still look strange, the problem is more likely the headset fit than the code — check coverage on the Debrief tab first.
