# What the interpreter found, and where it disagrees with what was published

Written after building the raw-export pipeline and running it over the three real
Crown recordings. It is here because two of the published pages describe the same
five minutes differently, and an interpreter that could not settle that would not
be worth much.

## What was verified

**The parse.** The meditation export holds 76,832 samples across 8 channels at
exactly 256.00 Hz, which is 300.13 seconds. That matches the console's own metadata.
Zero lines in the file were malformed. The timestamps step backwards 4 times, as
the Console Decoded page warns, and there are no gaps over 100 ms.

**The signal processing, against the console itself.** Signal quality is a standard
deviation per channel taken after a 1 Hz high-pass. Computed independently here, on
the same file:

| Channel | This project | Console |
| --- | --- | --- |
| C3 | 4060 µV | 4063 µV |
| F6 | 4013 µV | 4014 µV |
| C4 | 4789 µV | 4793 µV |
| PO3 | 238 µV | 231 µV |
| PO4 | 142 µV | 129 µV |

The three loud channels agree with the device to within 0.1 per cent. The two quiet
ones are 7 and 13 µV out, which is a large percentage of a small number and reflects
the exact high-pass design rather than a disagreement about the data. This is the
strongest check available without hardware: it confirms the parse, the filter, and
the statistics against figures the device itself produced.

**The channel verdict.** Six channels land between 2,192 and 4,789 µV, matching the
published description of "six channels swing by 2,200 to 4,800 µV of artifact".
PO3 and PO4 survive. The interpreter reads the session through those two only.

**The shape of the session.** Posterior alpha rises steeply, peaks in the third
minute, and eases back through minutes four and five. That holds under every
preprocessing variant tried: with and without the 1 Hz high-pass, and with the
window share computed power-weighted or as a mean of 2-second epochs. The direction
and the timing are robust.

## Where the published pages disagree with each other

The two accounts of this recording do not match, and the difference is not small.

**The case study** ("Session 01: the meditation that peaked at minute three") reports
PO4 alpha at 6.1, 13.5, 29.7, 26.4, 18.6 per cent across the five minutes: a steep
rise, more than quadrupling, peaking at minute three.

**The Console Decoded worked session** reports posterior alpha drifting "from about
0.06 in the first minute to 0.08 in the last, roughly a third higher, peaking near
the four minute mark", and calls the trend weak enough to hold loosely.

Recomputed here, PO4 alpha runs 3.9, 14.9, 36.1, 31.0, 17.1 per cent, and the
posterior pair averaged runs 3.5 to a peak of 28.0 in minute three, back to 13.7.

**The case study is the account this data supports.** The rise is large, not modest,
and it peaks in minute three, not near minute four. The Console Decoded worked
session understates it. That paragraph is worth revising: its methodological
restraint is right, but the specific numbers under-report what is in the file.

## One figure that could not be reproduced

The case study's whole-session band-share table gives PO4 as 71.9 delta, 9.4 theta,
11.7 alpha, 5.6 beta, 1.3 gamma. Recomputed here the same channel gives roughly
84.5, 6.5, 5.8, 2.6, 0.6 with the high-pass, or 93.3, 2.8, 2.5, 1.1, 0.3 without it.

That table is also inconsistent with the case study's own prose, which says an
average over the whole five minutes "would have reported about 19%" for PO4 alpha
against the table's 11.7 per cent. Something different was computed for that table
and the method is not recorded, so it cannot be checked. The minute-by-minute
figures next to it do reproduce; the whole-session table does not.

This does not affect the case study's conclusion, which rests on the minute-by-minute
curve. It does mean the table should be recomputed or removed before anyone quotes
it.

## Two smaller corrections

The case study's front matter records the rate as 254.06 Hz. Measured across the
file it is 256.00 Hz, and the console reports 256 Hz. The lower figure is what you
get if the backward timestamp steps are included in a span-based calculation.

It also records 7 timing gaps. Counting steps over 100 ms there are none, and the
largest step in the file is 7.9 ms. A different gap threshold would produce a
different count, so this is a definition worth stating rather than an error.

## What none of this establishes

Every figure above describes what is in three files. It does not establish that the
recordings measured what they were named for. That would need a controlled protocol,
repeat sessions, and a real headset to run them on. See the "what a professional
should verify next" section of the README.
