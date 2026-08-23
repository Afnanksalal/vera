import { applySelector, calibrate, type Calibration, type Labelled, type SelectiveReport } from "../conformal";
import { buildMatchFixture } from "./fixture";
import { labelScored, scoreCredits } from "./fuzzy";

export type RiskControlledReport = {
  alpha: number;
  delta: number;
  calibration: Calibration;
  test: SelectiveReport;
  calibrationSeeds: number[];
  testSeeds: number[];
};

/**
 * End-to-end risk-controlled reconciliation. The fuzzy matcher runs over many
 * seeded books; conformal calibration on one split picks an acceptance
 * threshold; the held-out split measures the guaranteed match rate. The result:
 * "accept a match only when its risk is low enough that the accepted mismatch
 * rate is provably <= alpha."
 */
export function riskControlledReconcile(opts?: {
  alpha?: number;
  delta?: number;
  calibrationSeeds?: number[];
  testSeeds?: number[];
}): RiskControlledReport {
  const alpha = opts?.alpha ?? 0.1;
  const delta = opts?.delta ?? 0.1;
  const calibrationSeeds = opts?.calibrationSeeds ?? range(1, 40);
  const testSeeds = opts?.testSeeds ?? range(101, 140);

  const calLabels = collect(calibrationSeeds);
  const testLabels = collect(testSeeds);

  const calibration = calibrate(calLabels, alpha, delta);
  const test = applySelector(testLabels, calibration.threshold);

  return { alpha, delta, calibration, test, calibrationSeeds, testSeeds };
}

function collect(seeds: number[]): Labelled[] {
  const labels: Labelled[] = [];
  for (const seed of seeds) {
    const { problem, key } = buildMatchFixture({ seed });
    labels.push(...labelScored(scoreCredits(problem), key));
  }
  return labels;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
