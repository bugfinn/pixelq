import { QueueEvents } from "bullmq";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { config } from "./config.js";
import { db } from "./db.js";
import { messageForFailedJob } from "./failure-message.js";
import { IMAGE_QUEUE } from "./queue.js";
import { jobs } from "./schema.js";

const RETENTION_HOURS = 24;

type Logger = {
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

async function recordFinalFailure(jobId: string, failedReason: string | undefined, log: Logger) {
  try {
    const updated = await db
      .update(jobs)
      .set({
        status: "failed",
        error: messageForFailedJob(failedReason),
        finishedAt: sql`now()`,
        expiresAt: sql`now() + make_interval(hours => ${RETENTION_HOURS}::int)`,
      })
      .where(and(eq(jobs.id, jobId), inArray(jobs.status, ["queued", "processing"])))
      .returning({ id: jobs.id });

    if (updated.length > 0) {
      log.warn({ jobId, failedReason }, "Marked a job as failed from a queue event");
    }
  } catch (err) {
    log.error({ err, jobId }, "Could not record a failed job from a queue event");
  }
}

export function startQueueEvents(log: Logger) {
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

  connection.on("error", (err) => {
    log.error({ err }, "Queue events Redis connection error");
  });

  const events = new QueueEvents(IMAGE_QUEUE, { connection });

  events.on("failed", ({ jobId, failedReason }) => {
    void recordFinalFailure(jobId, failedReason, log);
  });

  events.on("error", (err) => {
    log.error({ err }, "Queue events error");
  });

  return {
    async close() {
      await events.close();
      connection.disconnect();
    },
  };
}