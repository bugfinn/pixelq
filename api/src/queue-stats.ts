import { imageQueue, waitForRedis } from "./queue.js";
import type { QueueStats } from "./job-repository.js";

export async function getQueueStats(): Promise<QueueStats | null> {
  try {
    await waitForRedis(1000);
    const counts = await imageQueue.getJobCounts("waiting", "active", "delayed", "failed");

    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
  } catch {
    return null;
  }
}