import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { pool } from "./db.js";
import { processImage } from "./image.js";
import { jobStore } from "./jobs.js";
import { processJob } from "./process-job.js";

const IMAGE_QUEUE = "images";
const SHUTDOWN_TIMEOUT_MS = 10_000;
const DUPLICATE_SIGNAL_WINDOW_MS = 1_000;

const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

connection.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

const worker = new Worker(
  IMAGE_QUEUE,
  async (job) => {
    console.log(`Processing job ${job.id} (attempt ${job.attemptsMade + 1})`);

    await processJob(
      {
        jobId: job.data?.jobId,
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1,
      },
      { store: jobStore, processImage, outputDir: config.outputDir },
    );
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
console.log(`Writing outputs to ${config.outputDir}`);

let firstSignalAt = 0;

async function shutdown(signal: string) {
  const now = Date.now();

  if (firstSignalAt !== 0) {
    // Tools like "tsx watch" deliver one Ctrl+C twice, so ignore repeats in the first second.
    if (now - firstSignalAt > DUPLICATE_SIGNAL_WINDOW_MS) {
      console.log("Second signal received, exiting now.");
      process.exit(1);
    }
    return;
  }
  firstSignalAt = now;

  console.log(`${signal} received, finishing the current job and shutting down...`);

  setTimeout(() => {
    console.log("Shutdown took too long, exiting now.");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  await worker.close();
  await pool.end();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));