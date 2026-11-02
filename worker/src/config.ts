import { resolve } from "node:path";

function readUrl(name: string, value: string | undefined, protocols: string[]): string {
  if (!value) {
    throw new Error(`${name} is not set.`);
  }

  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    throw new Error(`${name} is not a valid URL.`);
  }

  if (!protocols.includes(protocol)) {
    throw new Error(`${name} must start with ${protocols.map((p) => `${p}//`).join(" or ")}`);
  }

  return value;
}

function readInterval(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const ms = Number(value);
  if (!Number.isInteger(ms) || ms < 1000) {
    throw new Error(`Invalid ${name} "${value}". Use a whole number of milliseconds, at least 1000.`);
  }

  return ms;
}

function readDelay(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const ms = Number(value);
  if (!Number.isInteger(ms) || ms < 0 || ms > 600_000) {
    throw new Error(`Invalid ${name} "${value}". Use a whole number of milliseconds from 0 to 600000.`);
  }

  return ms;
}

export const config = {
  redisUrl: readUrl("REDIS_URL", process.env.REDIS_URL, ["redis:", "rediss:"]),
  databaseUrl: readUrl("DATABASE_URL", process.env.DATABASE_URL, ["postgres:", "postgresql:"]),
  uploadDir: resolve(process.env.UPLOAD_DIR ?? "../data/uploads"),
  outputDir: resolve(process.env.OUTPUT_DIR ?? "../data/outputs"),
  reconcileEveryMs: readInterval("RECONCILE_EVERY_MS", process.env.RECONCILE_EVERY_MS, 60_000),
  cleanupEveryMs: readInterval("CLEANUP_EVERY_MS", process.env.CLEANUP_EVERY_MS, 10 * 60_000),
  // BullMQ's own defaults are 30 s for both. A job whose worker died is noticed
  // after the lock has expired and the next stalled check has run.
  lockDurationMs: readInterval("WORKER_LOCK_DURATION_MS", process.env.WORKER_LOCK_DURATION_MS, 30_000),
  stalledIntervalMs: readInterval("WORKER_STALLED_INTERVAL_MS", process.env.WORKER_STALLED_INTERVAL_MS, 30_000),
  // Demo only (scripts/kill-demo.sh): keeps a job busy long enough to be killed. 0 = off.
  demoJobDelayMs: readDelay("DEMO_JOB_DELAY_MS", process.env.DEMO_JOB_DELAY_MS, 0),
};