// A live mock stream for the dev panel, so the Live tab works with no headset.
// Same drifting-random-walk shape as the sample generator, and the same band
// relationships: gamma tracks focus, alpha tracks calm.

export function createMockSource({ intervalMs = 1000 } = {}) {
  // Mean-reverting drift (Ornstein-Uhlenbeck): the level is pulled back toward a
  // personal centre, so focus wanders like attention does instead of walking off
  // to 0 or 1 and staying there.
  const F_MU = 0.34, C_MU = 0.44, PULL = 0.02, KICK = 0.011, SMOOTH = 0.82;
  let focus = F_MU, calm = C_MU, fv = 0, cv = 0, badUntil = 0;
  let listeners = [];
  let timer = null;

  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  function frame() {
    const now = Date.now();
    fv = fv * SMOOTH + (Math.random() - 0.5) * KICK;
    cv = cv * SMOOTH + (Math.random() - 0.5) * KICK;
    focus = clamp01(focus + fv + (F_MU - focus) * PULL);
    calm = clamp01(calm + cv + (C_MU - calm) * PULL);

    if (now > badUntil && Math.random() < 0.004) badUntil = now + 8000 + Math.random() * 12000;
    const bad = now < badUntil;

    const j = () => (Math.random() - 0.5) * 0.05;
    const channels = ["CP3", "C3", "F5", "PO3", "PO4", "F6", "C4", "CP4"];
    const quality = {};
    channels.forEach((c, i) => {
      quality[c] = bad && i === 7 ? "noContact" : bad && i === 2 ? "bad" : "mock";
    });

    return {
      t: now,
      mode: "mock",
      focus, calm,
      bands: {
        delta: Math.max(0.01, 0.80 + (1 - focus) * 0.35 + j()),
        theta: Math.max(0.01, 0.42 + calm * 0.30 - focus * 0.12 + j()),
        alpha: Math.max(0.01, 0.26 + calm * 0.70 + j()),
        beta:  Math.max(0.01, 0.20 + focus * 0.35 + j()),
        gamma: Math.max(0.01, 0.10 + focus * 0.42 + j()),
      },
      quality,
      signal_quality: bad ? "bad" : "mock",
    };
  }

  return {
    mode: "mock",
    subscribe(fn) {
      listeners.push(fn);
      if (!timer) timer = setInterval(() => { const f = frame(); listeners.forEach((l) => l(f)); }, intervalMs);
      return () => {
        listeners = listeners.filter((l) => l !== fn);
        if (!listeners.length && timer) { clearInterval(timer); timer = null; }
      };
    },
    stop() { if (timer) clearInterval(timer); timer = null; listeners = []; },
  };
}
