import { resolve } from "node:path";

function readPort(value: string | undefined): number {
  const raw = value ?? "3000";
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${raw}". Use a whole number from 1 to 65535.`);
  }

  return port;
}

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
  port: readPort(process.env.PORT),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: readUrl("DATABASE_URL", process.env.DATABASE_URL, ["postgres:", "postgresql:"]),
  redisUrl: readUrl("REDIS_URL", process.env.REDIS_URL, ["redis:", "rediss:"]),
  uploadDir: resolve(process.env.UPLOAD_DIR ?? "../data/uploads"),
  outputDir: resolve(process.env.OUTPUT_DIR ?? "../data/outputs"),
  maxUploadBytes: 10 * 1024 * 1024,
};
