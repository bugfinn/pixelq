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

export const config = {
  redisUrl: readUrl("REDIS_URL", process.env.REDIS_URL, ["redis:", "rediss:"]),
  databaseUrl: readUrl("DATABASE_URL", process.env.DATABASE_URL, ["postgres:", "postgresql:"]),
  uploadDir: resolve(process.env.UPLOAD_DIR ?? "../data/uploads"),
  outputDir: resolve(process.env.OUTPUT_DIR ?? "../data/outputs"),
  reconcileEveryMs: readInterval("RECONCILE_EVERY_MS", process.env.RECONCILE_EVERY_MS, 60_000),
  cleanupEveryMs: readInterval("CLEANUP_EVERY_MS", process.env.CLEANUP_EVERY_MS, 10 * 60_000),
};