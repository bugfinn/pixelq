import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";

export const IMAGE_QUEUE = "images";
export const PROCESS_IMAGE_JOB = "process-image";

export const redis = new Redis(config.redisUrl, {
  enableOfflineQueue: false,
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

export const imageQueue = new Queue(IMAGE_QUEUE, { connection: redis });

imageQueue.on("error", () => {
  // Connection problems are already logged by the redis client above.
});

export function waitForRedis(timeoutMs = 3000): Promise<void> {
  if (redis.status === "ready") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      redis.off("ready", onReady);
      reject(new Error("Redis is not reachable."));
    }, timeoutMs);
    redis.once("ready", onReady);
  });
}

export async function enqueueImageJob(jobId: string) {
  await waitForRedis();

  return imageQueue.add(
    PROCESS_IMAGE_JOB,
    { jobId },
    {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 60 * 60, count: 1000 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  );
}
