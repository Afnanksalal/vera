import assert from "node:assert/strict";
import { test } from "node:test";
import { applySelector, calibrate, clopperPearsonUpper, regIncBeta } from "./conformal";
import { Rng } from "./rng";
import { riskControlledReconcile } from "./matching/riskcontrol";

test("regularized incomplete beta hits known values", () => {
  assert.ok(Math.abs(regIncBeta(0.5, 1, 1) - 0.5) < 1e-6);
  assert.equal(regIncBeta(0, 2, 3), 0);
  assert.equal(regIncBeta(1, 2, 3), 1);
});

test("Clopper-Pearson upper bound is sane and monotone", () => {
  assert.equal(clopperPearsonUpper(0, 0, 0.05), 1);
  const noErrors = clopperPearsonUpper(0, 100, 0.05);
  assert.ok(noErrors > 0 && noErrors < 0.05, `0/100 upper bound ~ ${noErrors}`);
  const some = clopperPearsonUpper(5, 100, 0.05);
  assert.ok(some > noErrors);
  assert.equal(clopperPearsonUpper(10, 10, 0.05), 1);
});

test("conformal calibration controls accepted error on held-out data", () => {
  // Generate labels where a lower score means more likely correct.
  const gen = (seed: number, n: number) => {
    const rng = new Rng(seed);
    const out = [];
    for (let i = 0; i < n; i++) {
      const score = rng.next();
      const correct = rng.next() > score; // higher score -> more errors
      out.push({ score, correct });
    }
    return out;
  };
  const alpha = 0.2;
  const delta = 0.05;
  const cal = calibrate(gen(1, 4000), alpha, delta);
  assert.notEqual(cal.threshold, null, "a threshold should be found");
  assert.ok(cal.ub_error <= alpha, "calibration upper bound within alpha");
  assert.ok(cal.coverage > 0, "some coverage");

  const test = applySelector(gen(2, 4000), cal.threshold);
  assert.ok(test.empirical_error <= alpha, `held-out accepted error ${test.empirical_error} <= ${alpha}`);
  assert.ok(test.coverage > 0.2, "keeps meaningful coverage");
});

test("risk-controlled reconciliation guarantees the accepted mismatch rate", () => {
  const alpha = 0.1;
  const report = riskControlledReconcile({ alpha, delta: 0.1 });
  assert.notEqual(report.calibration.threshold, null);
  assert.ok(report.calibration.ub_error <= alpha, "calibrated bound within alpha");
  assert.ok(
    report.test.empirical_error <= alpha,
    `held-out accepted mismatch ${report.test.empirical_error} <= ${alpha}`
  );
  assert.ok(report.test.coverage > 0, "matches are still accepted");
});
