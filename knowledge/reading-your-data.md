# Reading your own data

## Why there is no "good" score

Focus and calm are personal. One person may sit between 0.2 and 0.5 all day while another sits between 0.4 and 0.8. A fixed rule like "0.7 means focused" would be wrong for almost everyone, and would be especially wrong given that Neurosity considers anything above 0.3 significant.

So this app learns your range from your own data and reports everything relative to that. When it says a stretch was "above your usual level", it means above your own typical level, not above some universal standard.

## What each number in the debrief means

**Coverage** is the share of readings where the electrodes were making decent contact. Below about 75% and the rest of the debrief should be treated as provisional. Below 50% and the honest advice is to fix the fit and record again.

**Focus median** is your middle reading, half the session was above it, half below. It is used instead of the average because a few extreme readings cannot drag it around.

**p10 and p90** are the range you spent most of the session in. Ten percent of readings fell below p10 and ten percent above p90, so the span between them is your normal working range.

**Peaks** are stretches where focus stayed meaningfully above your usual level for at least three minutes. The app looks for sustained stretches rather than instants, because a single high reading is noise and three minutes of them is a pattern.

**Slumps** are the same idea downwards: at least four minutes meaningfully below your usual level.

**Time in state** splits the session into focused, calm, steady, drifting, and unreadable. Unreadable is not a brain state, it means the signal was too poor to say.

## What the app will not tell you

It will not tell you why anything happened. EEG records when something changed and is permanently silent on the cause. That is the gap session notes fill: your own one-line note against a peak or a slump is the only thing that can supply the why.

It also will not give health or clinical advice. A focus score is weak evidence about attention in general and no evidence at all about anything medical. Suggestions in this app stay behavioural, protect the window you were actually sharp in, record for longer next time, and stop there.

## Session notes

A note is a timestamp plus a sentence: "back-to-back meetings", "slept badly", "deep work on the parser". After a few weeks these turn the chart into an explanation, slumps cluster after meetings, peaks are all before eleven.

Notes are stored separately from the recording, so the raw data stays raw. They never leave your machine, they are not included in the public site, and they are not sent to any model unless you explicitly choose to.
