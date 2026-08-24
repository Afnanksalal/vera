/**
 * Split-conformal selective prediction (CIC-style). Given a labelled calibration
 * set of (score, correct) pairs, pick the most permissive acceptance threshold
 * whose simultaneous Clopper-Pearson upper bound on accepted error stays at or
 * below alpha. Bonferroni correction covers data-driven threshold selection,
 * so the full threshold search has confidence at least 1 - delta.
 *
 * Lower score = more confident. We accept when score <= threshold.
 */

function betacf(x: number, a: number, b: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function gammaln(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularized incomplete beta function I_x(a, b). */
export function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(x, a, b)) / a;
  return 1 - (bt * betacf(1 - x, b, a)) / b;
}

/** Inverse of I_x(a,b) in x, by bisection. */
function betaInv(p: number, a: number, b: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (regIncBeta(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * One-sided Clopper-Pearson upper confidence bound (level 1 - delta) on the
 * true error probability given `errors` errors out of `n` accepted trials.
 */
export function clopperPearsonUpper(errors: number, n: number, delta: number): number {
  if (n === 0) return 1;
  if (errors >= n) return 1;
  return betaInv(1 - delta, errors + 1, n - errors);
}

export type Labelled = { score: number; correct: boolean };

export type Calibration = {
  threshold: number | null; // null => abstain on everything (cannot meet alpha)
  alpha: number;
  delta: number;
  accepted: number;
  errors: number;
  coverage: number; // fraction accepted
  ub_error: number; // Clopper-Pearson upper bound at the chosen threshold
};

/**
 * Choose the largest threshold (max coverage) whose accepted-error upper bound
 * is <= alpha. Returns null threshold when no threshold satisfies the bound.
 */
export function calibrate(labelled: Labelled[], alpha: number, delta: number): Calibration {
  const candidates = [...new Set(labelled.map((l) => l.score))].sort((a, b) => a - b);
  const perThresholdDelta = delta / Math.max(1, candidates.length);
  let best: Calibration = {
    threshold: null,
    alpha,
    delta,
    accepted: 0,
    errors: 0,
    coverage: 0,
    ub_error: 0,
  };
  for (const tau of candidates) {
    const accepted = labelled.filter((l) => l.score <= tau);
    const errors = accepted.filter((l) => !l.correct).length;
    const ub = clopperPearsonUpper(errors, accepted.length, perThresholdDelta);
    if (ub <= alpha && accepted.length >= best.accepted) {
      best = {
        threshold: tau,
        alpha,
        delta,
        accepted: accepted.length,
        errors,
        coverage: accepted.length / labelled.length,
        ub_error: ub,
      };
    }
  }
  return best;
}

export type SelectiveReport = {
  coverage: number;
  accepted: number;
  abstained: number;
  errors_among_accepted: number;
  empirical_error: number;
};

/** Apply a calibrated threshold to a fresh labelled set and measure the risk. */
export function applySelector(labelled: Labelled[], threshold: number | null): SelectiveReport {
  const accepted = threshold === null ? [] : labelled.filter((l) => l.score <= threshold);
  const errors = accepted.filter((l) => !l.correct).length;
  return {
    coverage: labelled.length ? accepted.length / labelled.length : 0,
    accepted: accepted.length,
    abstained: labelled.length - accepted.length,
    errors_among_accepted: errors,
    empirical_error: accepted.length ? errors / accepted.length : 0,
  };
}
