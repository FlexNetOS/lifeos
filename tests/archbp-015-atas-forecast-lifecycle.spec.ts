import { describe, expect, test } from "vitest";

import { forecast, ReservoirForecaster, temporalMetrics } from "../scripts/atas-forecast-lifecycle.mjs";

const series = Array.from({ length: 48 }, (_, i) => Math.sin(i / 4) + i * 0.015);

describe("ARCHBP-015 ATAS temporal forecasting", () => {
  test("runs a deterministic reservoir fit and calibrated forecast", () => {
    const result = forecast(series, { horizon: 6, reservoirSize: 16, seed: 7 });
    expect(result.schemaVersion).toBe("lifeos.atas.forecast.v1");
    expect(result.model.kind).toBe("echo-state-reservoir");
    expect(result.calibration.holdoutCount).toBeGreaterThan(0);
    expect(result.uncertainty.calibrated).toBe(true);
    expect(result.forecast).toHaveLength(6);
    expect(result.forecast.every((point) => point.lower < point.value && point.value < point.upper)).toBe(true);
    expect(result.promotion).toEqual({ status: "database-gated", selfPromoted: false });
    expect(result.runtimeMs).toBeGreaterThan(0);
  });

  test("rejects unbounded input and invalid prediction horizon", () => {
    expect(() => forecast([1, 2, 3])).toThrow(/at least 12/);
    const model = new ReservoirForecaster({ reservoirSize: 8 });
    model.fit(series);
    expect(() => model.predict(series.at(-1), 0)).toThrow(/horizon/);
  });

  test("emits measured temporal regime metrics", () => {
    const metrics = temporalMetrics(series);
    expect(Number.isFinite(metrics.divergence)).toBe(true);
    expect(["stable", "volatile"]).toContain(metrics.regime);
  });
});
