import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderChart } from "./bench-chart.ts";
import {
  mean,
  median,
  parseMemoryMiB,
  parsePercent,
  percentile,
  summarizeByWorkers,
  toCsv,
} from "./bench-stats.ts";
import type { RunResult } from "./bench-stats.ts";

function row(overrides: Partial<RunResult>): RunResult {
  return {
    workers: 1,
    repeat: 1,
    images: 60,
    failed: 0,
    totalSeconds: 30,
    jobsPerSecond: 2,
    latencyP50: 15,
    latencyP95: 28,
    processingP50: 0.5,
    processingP95: 0.8,
    workerCpuAvgPct: 90,
    allCpuAvgPct: 120,
    workerMemPeakMiB: 200,
    allMemPeakMiB: 600,
    ...overrides,
  };
}

describe("percentile", () => {
  it("returns the middle value for p50", () => {
    assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  });

  it("interpolates between values for p95", () => {
    assert.ok(Math.abs(percentile([1, 2, 3, 4, 5], 95) - 4.8) < 1e-9);
  });

  it("returns the smallest and largest value for p0 and p100", () => {
    assert.equal(percentile([5, 1, 3], 0), 1);
    assert.equal(percentile([5, 1, 3], 100), 5);
  });

  it("does not depend on the order of the input", () => {
    assert.equal(percentile([5, 1, 4, 2, 3], 50), 3);
  });

  it("works with one value", () => {
    assert.equal(percentile([7], 95), 7);
  });

  it("throws on an empty list", () => {
    assert.throws(() => percentile([], 50));
  });
});

describe("median and mean", () => {
  it("median of an even count is the average of the two middle values", () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  it("mean averages the values", () => {
    assert.equal(mean([1, 2, 3]), 2);
  });

  it("mean of an empty list is 0", () => {
    assert.equal(mean([]), 0);
  });
});

describe("docker stats parsing", () => {
  it("reads a percentage", () => {
    assert.equal(parsePercent("12.5%"), 12.5);
  });

  it("treats an unreadable percentage as 0", () => {
    assert.equal(parsePercent("--"), 0);
  });

  it("reads memory in MiB, GiB and KiB", () => {
    assert.equal(parseMemoryMiB("512MiB"), 512);
    assert.equal(parseMemoryMiB("1GiB"), 1024);
    assert.equal(parseMemoryMiB("2048KiB"), 2);
  });

  it("throws on an unreadable memory value", () => {
    assert.throws(() => parseMemoryMiB("lots"));
  });
});

describe("toCsv", () => {
  it("writes a header and one line per run, rounding decimals", () => {
    const csv = toCsv([row({ jobsPerSecond: 2.123456 })]);
    const lines = csv.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.ok(lines[0].startsWith("workers,repeat,images"));
    assert.ok(lines[1].includes("2.123"));
    assert.ok(!lines[1].includes("2.1234"));
  });
});

describe("summarizeByWorkers", () => {
  it("takes the median per worker count and sorts by workers", () => {
    const summary = summarizeByWorkers([
      row({ workers: 2, repeat: 1, jobsPerSecond: 3 }),
      row({ workers: 1, repeat: 1, jobsPerSecond: 2 }),
      row({ workers: 1, repeat: 2, jobsPerSecond: 4 }),
      row({ workers: 1, repeat: 3, jobsPerSecond: 9 }),
    ]);
    assert.deepEqual(
      summary.map((s) => s.workers),
      [1, 2],
    );
    assert.equal(summary[0].jobsPerSecond, 4);
    assert.equal(summary[1].jobsPerSecond, 3);
  });

  it("reports the highest failure count of the repeats", () => {
    const summary = summarizeByWorkers([
      row({ workers: 1, repeat: 1, failed: 0 }),
      row({ workers: 1, repeat: 2, failed: 3 }),
    ]);
    assert.equal(summary[0].failed, 3);
  });
});

describe("renderChart", () => {
  it("draws an SVG with a label for each worker count", () => {
    const svg = renderChart(
      summarizeByWorkers([row({ workers: 1 }), row({ workers: 2 })]),
      "subtitle",
      "caption",
    );
    assert.ok(svg.includes("<svg"));
    assert.ok(svg.includes("1 worker<"));
    assert.ok(svg.includes("2 workers<"));
  });
});