import { access } from "node:fs/promises";
import { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import { config } from "../config.js";
import { jobStore } from "../jobs.js";
import { runCleanup, runSweep } from "./cleanup.js";
import { runReconcile } from "./reconcile.js";
import { deleteJob, findExistingJobIds, findExpiredJobs, listStaleJobs } from "./store.js";

const IMAGE_QUEUE = "images";
const MAINTENANCE_QUEUE = "maintenance";

const BATCH_LIMIT = 100;
const SWEEP_LIMIT = 500;
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function startMaintenance(connection: Redis) {
  const imageQueue = new Queue(IMAGE_QUEUE, { connection });

  // Keep these options in sync with enqueueImageJob in api/src/queue.ts.
  const enqueueImageJob = (jobId: string) =>
    imageQueue.add(
      "process-image",
      { jobId },
      {
        jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    );

  const maintenanceQueue = new Queue(MAINTENANCE_QUEUE, { connection });
  const keepFewRuns = { removeOnComplete: { count: 5 }, removeOnFail: { count: 20 } };

  await maintenanceQueue.upsertJobScheduler(
    "reconcile",
    { every: config.reconcileEveryMs },
    { name: "reconcile", opts: keepFewRuns },
  );
  await maintenanceQueue.upsertJobScheduler(
    "cleanup",
    { every: config.cleanupEveryMs },
    { name: "cleanup", opts: keepFewRuns },
  );

  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async (job) => {
      if (job.name === "reconcile") {
        const summary = await runReconcile({
          listStaleJobs,
          getJobState: (id) => imageQueue.getJobState(id),
          enqueueImageJob,
          markJobFailed: jobStore.markJobFailed,
          fileExists,
          limit: BATCH_LIMIT,
        });

        const acted =
          summary.readded + summary.markedFailed + summary.missingFile + summary.inconsistent + summary.errors;
        if (acted > 0) {
          console.log("Reconcile:", JSON.stringify(summary));
        }
      } else if (job.name === "cleanup") {
        const cleanup = await runCleanup({
          uploadDir: config.uploadDir,
          outputDir: config.outputDir,
          findExpiredJobs,
          deleteJob,
          limit: BATCH_LIMIT,
        });
        const sweep = await runSweep({
          uploadDir: config.uploadDir,
          outputDir: config.outputDir,
          findExistingJobIds,
          minAgeMs: ORPHAN_MIN_AGE_MS,
          limit: SWEEP_LIMIT,
        });

        if (cleanup.expired > 0 || sweep.candidates > 0) {
          console.log("Cleanup:", JSON.stringify(cleanup), "Sweep:", JSON.stringify(sweep));
        }
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on("failed", (job, err) => {
    console.error(`Maintenance job ${job?.name} failed: ${err.message}`);
  });
  worker.on("error", (err) => {
    console.error("Maintenance worker error:", err.message);
  });

  return {
    async close() {
      await worker.close();
      await maintenanceQueue.close();
      await imageQueue.close();
    },
  };
}