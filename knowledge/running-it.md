# Running Session Debrief

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

- `MODE`: `mock` or `live`. Defaults to `mock`.
- `LOG_INTERVAL_MS`: how often a row is written. Defaults to 2000.
- `OUT_FILE`: where to write. Defaults to `focus-log.csv`.
- `DURATION_SEC`: stop automatically after this many seconds. Defaults to 0, meaning run until you press Ctrl+C.

For the dev panel, `PORT` changes the port. It defaults to 5273, deliberately not 5173, which Vite and most front-end dev servers use.

## The three screens

**Today** answers "how did that go" in a sentence, followed by how it compares with your own normal, a suggestion, and a place to ask questions. Anything with a dashed underline explains itself when you tap it.

**Session** shows the recording as a ribbon of named states over time, with a deviation strip and an activity lane below it sharing the same scale. Move the pointer across it for a readout; drag across it to select a window, which recomputes everything for that window.

**How it works** is the guided version, where the data comes from, how to record a real session, how to read one, and what to do when something breaks.

There is also a quiet **Detail view** link for the live stream, band power, electrode contact and the internals. It is for building and debugging, not for reading a session, watching a live focus score while you work reliably lowers it.

## If something looks wrong

Run `npm test`. It runs 116 checks across two suites: 75 cover the parsing, the quality gate, the statistics, the cross-session baseline, the fixed vocabulary and the state engine, and 41 more run the interpreter against a real Crown recording and check that it reproduces the console's own figures. If those pass and the numbers still look strange, the problem is more likely the headset fit than the code, check the session's coverage on the Session screen first.
