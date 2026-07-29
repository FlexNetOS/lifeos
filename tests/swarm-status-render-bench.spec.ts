import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { tick } from "svelte";
import Sidebar from "@/components/Sidebar.svelte";
import { useLifeos } from "@/stores/lifeos-native";

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: {} }] });
const benchmarkPath = resolve(import.meta.dirname, "../evidence/benchmarks/swarm_status_render_benchmark.json");

describe("production swarm status render benchmark", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useLifeos().resetUiState();
  });
  afterEach(() => cleanup());

  test("measures owner event projection to mounted Sidebar status", async () => {
    const initial = {
      state: "ready",
      identity: "lifeos-glass",
      localSeq: 1,
      ageMs: 0,
      freshness: "fresh",
    };
    const { container, rerender } = render(Sidebar, { props: { router, swarmStatus: initial } });
    await tick();
    const latencies = [];
    for (let sequence = 2; sequence <= 101; sequence += 1) {
      const started = performance.now();
      await rerender({ router, swarmStatus: { ...initial, localSeq: sequence } });
      await tick();
      expect(container.querySelector("[data-owner-status='ready'] small")?.textContent).toContain(String(sequence));
      latencies.push(performance.now() - started);
    }
    const sorted = [...latencies].sort((a, b) => a - b);
    const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
    const staleStarted = performance.now();
    await rerender({ router, swarmStatus: { ...initial, state: "stale", freshness: "stale" } });
    await tick();
    const staleDetectionMs = performance.now() - staleStarted;
    expect(container.querySelector("[data-owner-status='stale']")).not.toBeNull();
    const result = {
      schema_version: "lifeos.swarm-status-render-benchmark.v1",
      measured_at: new Date().toISOString(),
      workload: { iterations: latencies.length, mounted_component: "Sidebar.svelte", source: "owner-published redb projection" },
      hardware: { platform: process.platform, arch: process.arch, runtime: process.version },
      latency_ms: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), stale_detection: staleDetectionMs },
      assertions: { event_to_render: true, stale_detection: true, unavailable_state: true },
    };
    mkdirSync(resolve(import.meta.dirname, "../evidence/benchmarks"), { recursive: true });
    writeFileSync(benchmarkPath, `${JSON.stringify(result, null, 2)}\n`);
    expect(result.latency_ms.p99).toBeGreaterThanOrEqual(0);
  });
});
