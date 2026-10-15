import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";

const IMAGE_QUEUE = "images";
const SHUTDOWN_TIMEOUT_MS = 10_000;

const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

connection.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

const worker = new Worker(
  IMAGE_QUEUE,
  async (job) => {
    console.log(`Processing job ${job.id} (attempt ${job.attemptsMade + 1})`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return { ok: true };
  },
  { connection, concurrency: 1 },
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} failed: ${err.message}`);
});

worker.on("error", (err) => {
  console.error("Worker error:", err.message);
});

console.log(`Worker is waiting for jobs on queue "${IMAGE_QUEUE}".`);

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) {
    console.log("Second signal received, exiting now.");
    process.exit(1);
  }
  shuttingDown = true;

  console.log(`${signal} received, finishing the current job and shutting down...`);

  setTimeout(() => {
    console.log("Shutdown took too long, exiting now.");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
