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

export const config = {
  redisUrl: readUrl("REDIS_URL", process.env.REDIS_URL, ["redis:", "rediss:"]),
  databaseUrl: readUrl("DATABASE_URL", process.env.DATABASE_URL, ["postgres:", "postgresql:"]),
  outputDir: resolve(process.env.OUTPUT_DIR ?? "../data/outputs"),
};