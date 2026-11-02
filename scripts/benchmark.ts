import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus, totalmem } from "node:os";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { renderChart } from "./bench-chart.ts";
import {
  mean,
  parseMemoryMiB,
  parsePercent,
  percentile,
  summarizeByWorkers,
  toCsv,
} from "./bench-stats.ts";
import type { RunResult } from "./bench-stats.ts";

// Usage (from anywhere in the repo):
//   node scripts/benchmark.ts
// Options (environment variables):
//   WORKERS=1,2,4  worker counts to test       IMAGES=60   images per run
//   REPEATS=3      runs per worker count       OUT_DIR=docs  where the CSV and chart go
//   API_URL=http://127.0.0.1:3000              TIMEOUT_SECONDS=600  per run
// If you stop it with Ctrl+C, run "docker compose up -d --wait" to restore the normal stack.

const execFileAsync = promisify(execFile);

// Work from the repository root, wherever the script is started from.
process.chdir(resolve(import.meta.dirname, ".."));

function readCount(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a whole number of at least 1 (got "${raw}").`);
  }
  return value;
}

const IMAGES = readCount("IMAGES", 60);
const REPEATS = readCount("REPEATS", 3);
const TIMEOUT_SECONDS = readCount("TIMEOUT_SECONDS", 600);
const WORKER_COUNTS = (process.env.WORKERS ?? "1,2,4").split(",").map((part) => Number(part.trim()));
if (WORKER_COUNTS.some((n) => !Number.isInteger(n) || n < 1 || n > 8)) {
  throw new Error('WORKERS must be a comma-separated list of whole numbers from 1 to 8, for example "1,2,4".');
}
const API_URL = process.env.API_URL ?? "http://127.0.0.1:3000";
const OUT_DIR = resolve(process.env.OUT_DIR ?? "docs");

// Three sizes in megapixels: 1.9, 3.8 and 6.
const SIZES: Array<[number, number]> = [
  [1600, 1200],
  [2400, 1600],
  [3000, 2000],
];
const MAX_IMAGE_MB = 9;
const UPLOAD_LANES = 4;

const BENCH_ENV = { ...process.env, COMPOSE_FILE: "docker-compose.yml:docker-compose.bench.yml" };
const BASE_ENV = { ...process.env, COMPOSE_FILE: "docker-compose.yml" };

async function compose(args: string[], env = BENCH_ENV): Promise<string> {
  const { stdout } = await execFileAsync("docker", ["compose", ...args], {
    env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout.trim();
}

async function psql(sql: string): Promise<string> {
  return compose(["exec", "-T", "postgres", "psql", "-U", "pixelq", "-d", "pixelq", "-tAc", sql]);
}

async function makeImagePool(): Promise<Buffer[]> {
  const sharp = createRequire(resolve("worker/package.json"))("sharp");
  const pool: Buffer[] = [];
  for (const [width, height] of SIZES) {
    const buffer: Buffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
        noise: { type: "gaussian", mean: 128, sigma: 20 },
      },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    const megabytes = buffer.length / 1_000_000;
    if (megabytes > MAX_IMAGE_MB) {
      throw new Error(`The ${width}x${height} test image is ${megabytes.toFixed(1)} MB, too close to the upload limit.`);
    }
    console.log(`  test image ${width}x${height}: ${megabytes.toFixed(1)} MB`);
    pool.push(buffer);
  }
  return pool;
}

async function upload(buffer: Buffer, name: string): Promise<void> {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "image/jpeg" }), name);
  const response = await fetch(`${API_URL}/api/jobs`, { method: "POST", body: form });
  if (response.status !== 202) {
    throw new Error(`Upload returned HTTP ${response.status}: ${await response.text()}`);
  }
}

async function uploadAll(pool: Buffer[], count: number, prefix: string): Promise<void> {
  let next = 0;
  async function lane(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= count) {
        return;
      }
      await upload(pool[index % pool.length], `${prefix}-${index}.jpg`);
    }
  }
  await Promise.all(Array.from({ length: UPLOAD_LANES }, () => lane()));
}

async function waitForJobs(since: string, expected: number): Promise<{ done: number; failed: number }> {
  const deadline = Date.now() + TIMEOUT_SECONDS * 1000;
  while (Date.now() < deadline) {
    const line = await psql(
      `select count(*) filter (where status = 'done'), count(*) filter (where status in ('failed', 'enqueue_failed')) from jobs where created_at >= '${since}'`,
    );
    const [done, failed] = line.split("|").map(Number);
    if (done + failed >= expected) {
      return { done, failed };
    }
    await sleep(1000);
  }
  throw new Error(`Not all ${expected} jobs finished within ${TIMEOUT_SECONDS} s.`);
}

type Sample = { service: string; cpu: number; memMiB: number };

function serviceOf(containerName: string): string {
  // Container names look like "<project>-<service>-<number>".
  const parts = containerName.split("-");
  return parts[parts.length - 2] ?? containerName;
}

async function sampleOnce(ids: string[]): Promise<Sample[]> {
  const { stdout } = await execFileAsync("docker", ["stats", "--no-stream", "--format", "{{json .}}", ...ids], {
    maxBuffer: 20 * 1024 * 1024,
  });
  const samples: Sample[] = [];
  for (const line of stdout.split("\n")) {
    const start = line.indexOf("{");
    if (start < 0) {
      continue;
    }
    const item = JSON.parse(line.slice(start));
    samples.push({
      service: serviceOf(String(item.Name)),
      cpu: parsePercent(String(item.CPUPerc)),
      memMiB: parseMemoryMiB(String(item.MemUsage).split("/")[0]),
    });
  }
  return samples;
}

function startSampler(ids: string[]) {
  const samples: Sample[][] = [];
  let running = true;
  const loop = (async () => {
    while (running) {
      try {
        samples.push(await sampleOnce(ids));
      } catch (error) {
        console.error("  docker stats failed:", error instanceof Error ? error.message : String(error));
        await sleep(1000);
      }
    }
  })();
  return {
    async stop(): Promise<Sample[][]> {
      running = false;
      await loop;
      return samples;
    },
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function summarizeSamples(samples: Sample[][]) {
  const workersOnly = (s: Sample[]) => s.filter((x) => x.service === "worker");
  return {
    workerCpuAvgPct: mean(samples.map((s) => sum(workersOnly(s).map((x) => x.cpu)))),
    allCpuAvgPct: mean(samples.map((s) => sum(s.map((x) => x.cpu)))),
    workerMemPeakMiB: Math.max(0, ...samples.flatMap((s) => workersOnly(s).map((x) => x.memMiB))),
    allMemPeakMiB: Math.max(0, ...samples.map((s) => sum(s.map((x) => x.memMiB)))),
  };
}

async function startStack(workers: number): Promise<string[]> {
  console.log(`  starting the stack with ${workers} worker(s)...`);
  await compose(["up", "-d", "--scale", `worker=${workers}`, "--wait", "--wait-timeout", "300"]);
  const ids = (await compose(["ps", "-q"])).split("\n").filter(Boolean);
  await sleep(5000);
  return ids;
}

async function warmUp(pool: Buffer[], workers: number): Promise<void> {
  const count = Math.max(3, workers * 2);
  console.log(`  warm-up with ${count} images (not counted)...`);
  const since = await psql("select clock_timestamp()");
  await uploadAll(pool, count, "warmup");
  await waitForJobs(since, count);
}

async function runOnce(pool: Buffer[], ids: string[], workers: number, repeat: number): Promise<RunResult> {
  const since = await psql("select clock_timestamp()");
  const sampler = startSampler(ids);
  await uploadAll(pool, IMAGES, `bench-w${workers}-r${repeat}`);
  const { done, failed } = await waitForJobs(since, IMAGES);
  const samples = await sampler.stop();

  const total = Number(
    await psql(
      `select extract(epoch from (max(finished_at) - min(created_at))) from jobs where created_at >= '${since}' and status = 'done'`,
    ),
  );
  const lines = (
    await psql(
      `select extract(epoch from (finished_at - created_at)), extract(epoch from (finished_at - started_at)) from jobs where created_at >= '${since}' and status = 'done'`,
    )
  )
    .split("\n")
    .filter(Boolean);

  const latencies: number[] = [];
  const processing: number[] = [];
  for (const line of lines) {
    const [latency, work] = line.split("|").map(Number);
    latencies.push(latency);
    processing.push(work);
  }
  if (latencies.length === 0) {
    throw new Error("No job finished, so there is nothing to measure.");
  }

  return {
    workers,
    repeat,
    images: IMAGES,
    failed,
    totalSeconds: total,
    jobsPerSecond: done / total,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    processingP50: percentile(processing, 50),
    processingP95: percentile(processing, 95),
    ...summarizeSamples(samples),
  };
}

async function main(): Promise<void> {
  const cores = cpus().length;
  const memoryGiB = totalmem() / 1024 ** 3;
  console.log(`PixelQ benchmark: workers ${WORKER_COUNTS.join(", ")}, ${IMAGES} images, ${REPEATS} runs each`);
  console.log(`Machine: ${cores} CPU cores, ${memoryGiB.toFixed(1)} GiB RAM`);

  console.log("\nGenerating test images...");
  const pool = await makeImagePool();

  const results: RunResult[] = [];
  try {
    for (const workers of WORKER_COUNTS) {
      console.log(`\n=== ${workers} worker(s) ===`);
      const ids = await startStack(workers);
      await warmUp(pool, workers);
      for (let repeat = 1; repeat <= REPEATS; repeat++) {
        const result = await runOnce(pool, ids, workers, repeat);
        results.push(result);
        console.log(
          `  run ${repeat}/${REPEATS}: ${result.jobsPerSecond.toFixed(2)} jobs/s, ` +
            `latency p50 ${result.latencyP50.toFixed(1)} s / p95 ${result.latencyP95.toFixed(1)} s, ` +
            `processing p50 ${result.processingP50.toFixed(2)} s, ` +
            `worker CPU avg ${result.workerCpuAvgPct.toFixed(0)}%, ` +
            `worker memory peak ${result.workerMemPeakMiB.toFixed(0)} MiB` +
            (result.failed > 0 ? `, FAILED JOBS: ${result.failed}` : ""),
        );
        await sleep(3000);
      }
    }
  } finally {
    console.log("\nRestoring the normal stack (base compose file only, one worker)");
    await compose(["up", "-d", "--wait", "--wait-timeout", "300"], BASE_ENV).catch(() => {
      console.error("WARNING: could not restore the normal stack. Run: docker compose up -d --wait");
    });
  }

  if (results.length === 0) {
    return;
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(resolve(OUT_DIR, "benchmark.csv"), toCsv(results));

  const summary = summarizeByWorkers(results);
  const subtitle = `${IMAGES} generated JPEGs (1.9, 3.8 and 6 megapixels) per run, ${cores} CPU cores, ${memoryGiB.toFixed(1)} GiB RAM`;
  const caption = `Median of ${REPEATS} run(s) per worker count. Uploads go straight to the API. Each worker is limited to 1 CPU and 512 MB.`;
  await writeFile(resolve(OUT_DIR, "benchmark.svg"), renderChart(summary, subtitle, caption));

  console.log("\nSummary (median per worker count):");
  console.table(
    summary.map((row) => ({
      workers: row.workers,
      "jobs/s": Number(row.jobsPerSecond.toFixed(2)),
      "latency p50 (s)": Number(row.latencyP50.toFixed(1)),
      "latency p95 (s)": Number(row.latencyP95.toFixed(1)),
      "processing p50 (s)": Number(row.processingP50.toFixed(2)),
      "worker CPU avg (%)": Math.round(row.workerCpuAvgPct),
      "worker mem peak (MiB)": Math.round(row.workerMemPeakMiB),
      failed: row.failed,
    })),
  );
  console.log(`\nWrote ${resolve(OUT_DIR, "benchmark.csv")} and ${resolve(OUT_DIR, "benchmark.svg")}`);
}

await main();