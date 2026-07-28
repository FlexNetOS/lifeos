// ARCHBP-015 — bounded ATAS temporal forecasting lifecycle.
//
// This is an executable local reservoir forecaster, not forecast prose. It
// accepts observed scalar series, fits a deterministic echo-state reservoir,
// emits a horizon with uncertainty, measures holdout calibration, and marks
// the result as a database-gated candidate. Promotion is intentionally not a
// local side effect.

import { createHash, randomUUID } from "node:crypto";

const finite = (value) => typeof value === "number" && Number.isFinite(value);

function assertSeries(series) {
  if (!Array.isArray(series) || series.length < 12 || !series.every(finite)) {
    throw new Error("ARCHBP-015: forecast input requires at least 12 finite observations");
  }
}

function tanh(value) {
  return Math.tanh(value);
}

function dot(left, right) {
  let total = 0;
  for (let i = 0; i < left.length; i += 1) total += left[i] * right[i];
  return total;
}

function solve(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error("ARCHBP-015: singular reservoir readout");
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= scale;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function rmse(actual, predicted) {
  const n = Math.min(actual.length, predicted.length);
  return Math.sqrt(actual.slice(0, n).reduce((sum, value, i) => sum + (value - predicted[i]) ** 2, 0) / n);
}

export class ReservoirForecaster {
  constructor({ reservoirSize = 32, spectralRadius = 0.85, leakRate = 0.35, ridge = 1e-3, seed = 15 } = {}) {
    if (!Number.isInteger(reservoirSize) || reservoirSize < 4) throw new Error("ARCHBP-015: reservoir is too small");
    this.reservoirSize = reservoirSize;
    this.spectralRadius = spectralRadius;
    this.leakRate = leakRate;
    this.ridge = ridge;
    const random = seeded(seed);
    this.inputWeights = Array.from({ length: reservoirSize }, () => (random() * 2 - 1) * 0.7);
    this.weights = Array.from({ length: reservoirSize }, () =>
      Array.from({ length: reservoirSize }, () => (random() < 0.12 ? random() * 2 - 1 : 0)),
    );
    this.readout = null;
    this.residualStd = null;
  }

  step(input, previous) {
    const next = this.weights.map((row, i) => {
      const activation = tanh(input * this.inputWeights[i] + dot(row, previous));
      return (1 - this.leakRate) * previous[i] + this.leakRate * activation;
    });
    return next;
  }

  features(value, state) {
    return [1, value, ...state];
  }

  fit(series) {
    assertSeries(series);
    const split = Math.max(8, Math.floor(series.length * 0.75));
    const state = Array(this.reservoirSize).fill(0);
    const rows = [];
    const targets = [];
    for (let i = 0; i < split - 1; i += 1) {
      const features = this.features(series[i], state);
      rows.push(features);
      targets.push(series[i + 1]);
      const next = this.step(series[i], state);
      state.splice(0, state.length, ...next);
    }
    const width = rows[0].length;
    const gram = Array.from({ length: width }, () => Array(width).fill(0));
    const rhs = Array(width).fill(0);
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = 0; j < width; j += 1) {
        rhs[j] += rows[i][j] * targets[i];
        for (let k = 0; k < width; k += 1) gram[j][k] += rows[i][j] * rows[i][k];
      }
    }
    for (let i = 0; i < width; i += 1) gram[i][i] += this.ridge;
    this.readout = solve(gram, rhs);

    const holdoutActual = series.slice(split);
    const holdoutPredicted = [];
    let holdoutState = state;
    let value = series[split - 1];
    for (const actual of holdoutActual) {
      holdoutState = this.step(value, holdoutState);
      const predicted = dot(this.readout, this.features(value, holdoutState));
      holdoutPredicted.push(predicted);
      value = actual;
    }
    const errors = holdoutActual.map((actual, i) => actual - holdoutPredicted[i]);
    this.residualStd = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / Math.max(1, errors.length));
    return {
      trainCount: rows.length,
      holdoutCount: holdoutActual.length,
      holdoutRmse: rmse(holdoutActual, holdoutPredicted),
      residualStd: this.residualStd,
    };
  }

  predict(seedValue, horizon) {
    if (!this.readout) throw new Error("ARCHBP-015: fit the reservoir before prediction");
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 256) throw new Error("ARCHBP-015: invalid forecast horizon");
    let value = seedValue;
    let state = Array(this.reservoirSize).fill(0);
    const points = [];
    for (let stepNo = 1; stepNo <= horizon; stepNo += 1) {
      state = this.step(value, state);
      value = dot(this.readout, this.features(value, state));
      const spread = this.residualStd * Math.sqrt(stepNo);
      points.push({ step: stepNo, value, lower: value - 1.96 * spread, upper: value + 1.96 * spread });
    }
    return points;
  }
}

export function temporalMetrics(series) {
  assertSeries(series);
  const deltas = series.slice(1).map((value, i) => value - series[i]);
  const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const variance = deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / deltas.length;
  const divergence = series.slice(2).reduce((sum, value, i) => sum + Math.abs(value - series[i]), 0) / Math.max(1, series.length - 2);
  return { meanDelta: mean, deltaVariance: variance, divergence, regime: variance > 0.25 ? "volatile" : "stable" };
}

export function forecast(series, { horizon = 8, ...options } = {}) {
  assertSeries(series);
  const started = process.hrtime.bigint();
  const model = new ReservoirForecaster(options);
  const calibration = model.fit(series);
  const points = model.predict(series.at(-1), horizon);
  const metrics = temporalMetrics(series);
  const result = {
    schemaVersion: "lifeos.atas.forecast.v1",
    candidateId: randomUUID(),
    branchKind: "forecast-local-candidate",
    model: { kind: "echo-state-reservoir", reservoirSize: model.reservoirSize, spectralRadius: model.spectralRadius, leakRate: model.leakRate },
    input: { count: series.length, lastObserved: series.at(-1), digest: createHash("sha256").update(JSON.stringify(series)).digest("hex") },
    metrics,
    calibration,
    forecast: points,
    uncertainty: { method: "holdout-residual-95-percent-interval", calibrated: calibration.holdoutCount > 0 },
    promotion: { status: "database-gated", selfPromoted: false },
    runtimeMs: Number(process.hrtime.bigint() - started) / 1e6,
  };
  return result;
}

if (import.meta.main) {
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const outputPath = outputArg?.slice("--output=".length);
  const series = Array.from({ length: 48 }, (_, i) => Math.sin(i / 4) + i * 0.015);
  const result = forecast(series, { horizon: 8 });
  if (outputPath) await Bun.write(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
