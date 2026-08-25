// Every term the interface uses, defined in plain words.
//
// This file exists because of one piece of feedback: opening the app and not
// knowing what you are looking at. The fix is not a glossary somewhere else --
// it is that every number and every label in the interface can be clicked to
// explain itself, in place, without leaving the screen.
//
// Rules for writing these:
//   - "what" is one sentence a person with no background can read
//   - "how" says where the number comes from, concretely
//   - "why" is optional, and only earns its place if the choice is surprising
//   - "caveat" is where honesty goes, and it is never omitted to look tidier
//   - no term may be explained using another undefined term

export const EXPLAIN = {
  deepWork: {
    term: "focused work",
    what: "Time when your focus reading sat clearly above your own usual level.",
    how: "The headset produces a focus reading every two seconds. This adds up all the time those readings were meaningfully above your normal.",
    why: "It's counted in minutes rather than scored out of 100 on purpose. Minutes are a unit you already understand, they can't be mistaken for a percentage, and counting them doesn't put a grade on your brain.",
  },
  recorded: {
    term: "recorded",
    what: "How long the headset was actually collecting data.",
    how: "Measured from the first reading to the last, with any breaks — taking it off, closing the laptop — subtracted rather than counted.",
  },
  vsUsual: {
    term: "vs your usual",
    what: "How this session compares with your own recent ones.",
    how: "Your last ten sessions set what normal looks like for you. This is the difference between today and that.",
    caveat: "It needs ten sessions before it can say anything at all. Until then the app tells you it's still learning rather than inventing a comparison.",
  },
  settled: {
    term: "settled time",
    what: "Time you read as calm and settled, rather than actively concentrating.",
    how: "Neurosity works calm out from alpha waves, which rise when you relax or close your eyes. This is the time those sat clearly above your usual.",
    why: "Settled isn't the opposite of focused and it isn't worse. A session with plenty of both is a normal, healthy-looking day.",
  },
  longestStretch: {
    term: "longest unbroken stretch",
    what: "Your single longest continuous run of focus.",
    how: "The longest period that stayed above your usual level without dropping back for more than a moment.",
    why: "Total focused time can be made of one deep run or twenty scattered bursts. This is what tells the two apart.",
  },
  usualRange: {
    term: "your usual range",
    what: "The shaded band is where you normally land. The marker is today.",
    how: "Worked out from your last ten sessions. Inside the band is an ordinary day for you.",
    why: "There is no target here and nothing to hit. Focus readings differ enormously between people, so the only comparison that means anything is you against yourself.",
  },
  coverage: {
    term: "usable signal",
    what: "How much of the recording had a good enough signal to be worth trusting.",
    how: "The Crown reports how well each of its eight sensors is touching your scalp. Readings from moments when they weren't are thrown away rather than averaged in.",
    caveat: "Below about three quarters, treat everything else as rough. A sensor resting on hair still produces numbers — they just don't mean anything.",
  },
  focusScore: {
    term: "the focus reading",
    what: "A number between 0 and 1 that Neurosity produces from your brainwaves.",
    how: "They run your gamma waves — the fastest ones, above 30 cycles a second — through a model they trained in advance. It outputs a probability.",
    caveat: "It is a model's opinion, not a measurement. Neurosity's own documentation says anything above 0.3 is already significant, so 0.35 is not 'barely a third' — that's the most common way people misread it.",
  },
  calmScore: {
    term: "the calm reading",
    what: "A number between 0 and 1, produced the same way as focus but from different brainwaves.",
    how: "Neurosity derives it from alpha waves, between roughly 8 and 12 cycles a second, which rise when you're relaxed and rise most reliably when you close your eyes.",
    caveat: "Single readings are noisy — Neurosity recommends looking at calm averaged over time rather than at any one moment.",
  },
  session: {
    term: "session",
    what: "One recording, usually a work block or a day, saved as a file.",
    how: "The logger writes a row every two seconds while you wear the headset. Stopping it ends the session and the file appears in this list.",
  },
  synthetic: {
    term: "synthetic sample data",
    what: "This session was made up. No brain produced it.",
    how: "Generated so the app has something realistic to work with before any real recording exists. It's shaped like a working day — a morning rise, a lunch break, an afternoon dip — but it is invented.",
    caveat: "It is labelled everywhere it appears, and it always will be. Nothing generated is ever presented as a real reading.",
  },
  st_focused: {
    term: "Focused",
    what: "You were concentrating, above your own usual level.",
    how: "Your focus reading sat clearly above your normal for this stretch of time.",
  },
  st_settled: {
    term: "Settled",
    what: "You were calm and relaxed rather than concentrating hard.",
    how: "Your calm reading was clearly above your normal while focus was not.",
  },
  st_steady: {
    term: "Steady",
    what: "An ordinary stretch — nothing unusual in either direction.",
    how: "Both readings sat inside your normal range. Most of most days looks like this.",
  },
  st_drifting: {
    term: "Drifting",
    what: "Attention was below your usual level.",
    how: "Your focus reading sat clearly below your normal for this stretch.",
    caveat: "This isn't a failure state. Nobody concentrates for seven hours, and a day with no drifting in it would be more suspicious than one with plenty.",
  },
  st_none: {
    term: "No reading",
    what: "The signal was too poor here to say anything at all.",
    how: "One or more sensors weren't making proper contact, so these moments are excluded rather than guessed at.",
    why: "It's drawn as a hatch rather than a colour on purpose. This is the absence of a reading, and it must never look like one of the states.",
  },
  st_gap: {
    term: "Recording stopped",
    what: "Nothing was recorded during this time.",
    how: "You took the headset off, or the logger was stopped. The gap is left empty rather than drawn across.",
  },
};

/** Every key, for tests and for building a glossary. */
export const EXPLAIN_KEYS = Object.keys(EXPLAIN);
