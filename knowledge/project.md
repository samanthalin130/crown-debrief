# What this project is

## In one paragraph

Session Debrief does two things with data from a Neurosity Crown EEG headset. It reads a recorded session and tells you what happened, when you peaked, when you crashed, how long your best stretch lasted. And it answers questions about the project and about your own numbers, for someone who has never encountered EEG before.

It is independent research using hardware loaned by the GFT Labs Digital Innovation Lab.

## Where it came from

The starting point was `crown-focus-logger`, a small Node tool that records focus, calm, and band power to a CSV every two seconds, with a mock mode so the pipeline can be built without hardware. That collector is included here unchanged. This project adds the half that was missing: making sense of what was collected.

## How the pieces fit

The collector writes CSV files. A set of plain JavaScript modules in `core/` read those files and compute everything, the quality filter, your personal baseline, peaks, slumps, time in each state, band averages. The debrief and the guide are both built on top of those computed facts.

Those core modules run in Node and in a browser without modification, which is what allows the same code to power the local dev panel and a static site with no server behind it.

## Why the debrief uses no AI model

Two reasons. A public site cannot ship an API key, and a research tool that stops working when an external service is down is fragile. So every sentence in the debrief is assembled from a computed number, which has a useful side effect: any claim can be checked against the CSV. That is a stronger position than "the model said so".


## The longer-term direction: thinking a thought to move a robotic arm

The stated long-term goal is a system where an imagined movement triggers a physical action: thinking a thought to move a robotic arm, or switch on a light. It is worth being precise about the distance between this project and that.

Focus and calm are **state** signals, how you are. Motor imagery is an **intent** signal, what you want. The second cannot be derived from the first; they are different phenomena. What is genuinely relevant is that the Crown's C3 and C4 electrodes sit over left and right sensorimotor cortex, which is the standard montage for motor imagery work, and that any future classifier would need labelled trials: a cue, an imagined movement, a rest, repeated many times.

This project does not build a robotic arm, an intent classifier, or anything that moves. What it does build is the recording discipline it would depend on, consistent timestamped files, a quality gate, a person identifier, and a notes format that attaches meaning to a moment in time. That is the honest description of the contribution, and the handoff document says the same thing.
