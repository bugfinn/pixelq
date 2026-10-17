import { randomUUID } from "node:crypto";
import { enqueueImageJob, imageQueue, redis } from "./queue.js";

const id = process.argv[2] ?? randomUUID();

try {
  await enqueueImageJob(id);
  console.log(`Added job ${id} to the queue.`);
} catch (err) {
  console.error("Could not add the job:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await imageQueue.close().catch(() => { });
  redis.disconnect();
}
