// Turns the computed facts into English. No model involved: every sentence here
// is assembled from a number, which is why a GFT engineer can check any claim
// against the CSV. If a Mistral key is configured, the local dev panel can ask
// a model to rewrite this more naturally -- but it is complete without one.

const MIN = 60_000;

export function fmtClock(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDuration(ms) {
  const mins = Math.round(ms / MIN);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

const pct = (x) => `${Math.round(x * 100)}%`;

/** Ranked list of observations; the narrative and the suggestion both read from this. */
export function findings(a) {
  const out = [];

  if (a.coverage < 0.75) {
    out.push({
      key: "coverage",
      severity: a.coverage < 0.5 ? "high" : "medium",
      text: `Only ${pct(a.coverage)} of this session had a usable signal, so treat everything below as provisional. That usually means the electrodes weren't reaching your scalp. The fix is a snugger fit and parting hair under the sensors.`,
    });
  }
  if (a.recordedMs < 20 * MIN) {
    out.push({
      key: "short",
      severity: "high",
      text: `This session is only ${fmtDuration(a.recordedMs)} long. That's too short to say much about patterns, and an hour or more gives the numbers something to work with.`,
    });
  }
  if (a.gaps.length) {
    out.push({
      key: "gaps",
      severity: "low",
      text: `Recording stopped and restarted ${a.gaps.length} time${a.gaps.length > 1 ? "s" : ""}, so the session covers ${fmtDuration(a.recordedMs)} spread across ${fmtDuration(a.wallMs)}.`,
    });
  }
  return out;
}

export function narrative(a) {
  if (!a.ok) return "There's nothing readable in this file yet.";
  const p = [];

  const date = new Date(a.startMs).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  p.push(
    `${date}, ${fmtClock(a.startMs)} to ${fmtClock(a.endMs)}, ${fmtDuration(a.recordedMs)} recorded, ` +
    `${a.rows.toLocaleString()} readings, ${pct(a.coverage)} of them with a signal worth trusting.`
  );

  // What "normal" looked like today.
  p.push(
    `Your focus readings sat around ${a.focus.p50.toFixed(2)} for most of it, mostly between ${a.focus.p10.toFixed(2)} ` +
    `and ${a.focus.p90.toFixed(2)}. Everything here is measured against that range, ` +
    `rather than against a fixed number, because what counts as high focus differs enormously between people.`
  );

  // Peaks.
  if (a.peaks.length) {
    const best = a.peaks[0];
    // "Baseline" is jargon and a raw reading like 0.55 means nothing on its own,
    // so the headline sentence carries neither.
    let s = `Your longest unbroken stretch of focus ran ${fmtClock(best.startMs)} to ${fmtClock(best.endMs)} \u2014 ` +
            `${fmtDuration(best.durationMs)} of it, well above your usual level.`;
    if (a.peaks.length > 1) {
      s += ` There ${a.peaks.length === 2 ? "was one other" : `were ${a.peaks.length - 1} others`}: ` +
           a.peaks.slice(1).map((k) => `${fmtClock(k.startMs)} to ${fmtClock(k.endMs)} (${fmtDuration(k.durationMs)})`).join(", ") + ".";
    }
    p.push(s);
  } else {
    p.push(`Nothing held above your usual level long enough to count as a focused stretch, and the session stayed fairly flat.`);
  }

  // Slumps.
  if (a.slumps.length) {
    const worst = a.slumps[0];
    p.push(
      `The clearest dip was ${fmtClock(worst.startMs)} to ${fmtClock(worst.endMs)}, ${fmtDuration(worst.durationMs)} ` +
      `below your usual, bottoming out at ${worst.lowValue.toFixed(2)}` +
      (a.slumps.length > 1 ? `, and there ${a.slumps.length === 2 ? "was one more" : `were ${a.slumps.length - 1} more`} like it.` : ".")
    );
  } else {
    p.push(`No sustained dips. Nothing dropped below your usual level for long enough to count.`);
  }

  // Time in state.
  const t = a.timeInState;
  p.push(
    `Roughly ${pct(t.focused.share)} of the session read as focused, ${pct(t.calm.share)} as calm, ` +
    `${pct(t.drifting.share)} as drifting, and ${pct(t.unreadable.share)} couldn't be read at all.`
  );

  // Bands, described rather than interpreted.
  const b = a.bands;
  const alphaDir = b.alpha.drift > 0.02 ? "rose" : b.alpha.drift < -0.02 ? "fell" : "held steady";
  p.push(
    `Across the bands, alpha ${alphaDir} through the session (${b.alpha.firstHalf.toFixed(2)} → ${b.alpha.secondHalf.toFixed(2)}). ` +
    `Alpha is the rhythm that rises when you're relaxed or idling, and it's what Neurosity's calm score is built from. ` +
    `Gamma, which their focus score comes from, averaged ${b.gamma.mean.toFixed(2)}.`
  );

  if (a.bestHour) {
    p.push(`Hour by hour, your strongest was ${String(a.bestHour.hour).padStart(2, "0")}:00 (averaging ${a.bestHour.meanFocus.toFixed(2)}).`);
  }

  const f = findings(a);
  if (f.length) p.push(f.map((x) => x.text).join(" "));

  if (a.synthetic) {
    p.unshift(`Note: this session is synthetic sample data, not a real recording. It's here so the app has something to work on before the headset is back online.`);
  }
  return p.join("\n\n");
}

/** One suggestion, chosen by rules, kept behavioural. No health claims, no pseudo-neuroscience. */
export function suggestion(a) {
  if (!a.ok) return null;
  const f = findings(a);

  const cov = f.find((x) => x.key === "coverage");
  if (cov && cov.severity === "high") {
    return { headline: "Fix the fit before reading anything into this", body: "Over half the session had no usable signal. Reseat the headset, part your hair under the electrodes, and check the signal indicator before your next run. The numbers can't mean much until that's solid." };
  }
  if (f.some((x) => x.key === "short")) {
    return { headline: "Record for longer next time", body: "Under twenty minutes doesn't give the patterns room to appear. Try wearing it through a full work block." };
  }
  if (a.peaks.length) {
    const best = a.peaks[0];
    return {
      headline: `Protect ${fmtClock(best.startMs)} to ${fmtClock(best.endMs)}`,
      body: `That was your longest good stretch today, ${fmtDuration(best.durationMs)} of it. If you can put your hardest task there tomorrow and keep meetings out of it, you're working with your own pattern instead of against it.`,
    };
  }
  if (a.slumps.length) {
    const worst = a.slumps[0];
    return {
      headline: `Something happened around ${fmtClock(worst.startMs)}`,
      body: `That's your clearest dip. Add a note saying what you were doing then. After a few sessions those notes are what turn a chart into an explanation.`,
    };
  }
  return { headline: "Nothing stood out today", body: "The session stayed fairly level throughout. That's a perfectly normal result, and more sessions will give it something to compare against." };
}
