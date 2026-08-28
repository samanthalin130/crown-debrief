# A plain-English EEG primer

## What the headset actually measures

The Neurosity Crown has eight small electrodes that rest against your scalp. Each one measures a very faint voltage, millionths of a volt, produced by large groups of neurons firing roughly in time with one another. That is all it measures. There is no thought in the signal; there is a wobbling voltage, sampled 256 times a second on each electrode.

Everything else in this app is arithmetic performed on those wobbles.

## Brainwave bands: delta, theta, alpha, beta, gamma

The wobbles have rhythms, and the rhythms are named by speed. A "band" is just a speed range.

- **Delta**, 0.5 to 4 Hz. Slowest. Associated with deep sleep.
- **Theta**, 4 to 8 Hz. Drowsiness, drifting, and some memory processes.
- **Alpha**, 8 to 12 Hz. Relaxed and idling. Rises reliably when you close your eyes.
- **Beta**, 13 to 30 Hz. Alert, engaged, sometimes tense.
- **Gamma**, 30 Hz and above. Fast activity, and also where muscle movement artifacts tend to show up.

"Power by band" means how much energy sits in each of those speed ranges. Bigger numbers appear at the slower end for almost everyone, so delta will normally look larger than gamma. That is expected and does not mean you are asleep.

## Focus and calm scores: what they measure

This distinction matters more than any other in this document.

Neurosity publishes two ready-made scores. **Focus** is derived from gamma between 30 and 44 Hz. **Calm** is derived from alpha between 7.5 and 12.5 Hz. Both come out as a probability between 0 and 1.

They are the output of models Neurosity trained in advance, on many people. They are interpretations of the signal, not physical quantities. When this app says your focus was 0.42, it means "a model looking at your gamma activity put the probability at 0.42", not "42% of a thing was measured."

Two practical consequences:

- **Above 0.3 is already significant.** Neurosity's own documentation says so, for both focus and calm. Someone seeing 0.35 and reading it as "barely a third, that's terrible" has misread the scale. This is the single most common misunderstanding.
- **Both take about 16 seconds to initialise** after the stream starts, so the first few readings of any session are not meaningful.

Neurosity also recommends taking a rolling average of calm rather than trusting any individual reading, because single readings are noisy.

## Signal quality and electrode contact

Each electrode reports how well it is making contact. If an electrode has drifted off your scalp or is sitting on hair, it still produces numbers, they just do not mean anything.

This is why the app throws away readings from any window where the signal was poor, and tells you what percentage of the session survived. A loose electrode produces confident-looking garbage, and ignoring that is the difference between a debrief that rings true and one that is noise.

## The eyes-closed test: checking the data is real

Close your eyes and alpha rises. This has been known since the 1920s and holds for almost everyone, which makes it the one thing you can test that has a known right answer.

Thirty seconds with your eyes open, thirty with them closed, then compare the alpha. If it does not rise, something is wrong, the fit, the connection, or the code, and you have found out in a minute rather than after a day of confusing results. Because calm is computed from alpha, the same check validates the calm score too.

## Where to read more

The official API reference is at [docs.neurosity.co](https://docs.neurosity.co), see the [Focus](https://docs.neurosity.co/docs/api/focus/) and [Calm](https://docs.neurosity.co/docs/api/calm/) pages. Those pages document the shape of the data. They deliberately do not tell you what to make of your own numbers, which is what this app is for.
