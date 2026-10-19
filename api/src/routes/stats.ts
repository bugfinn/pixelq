import type { FastifyInstance } from "fastify";
import type { JobRepository, QueueStatsSource } from "../job-repository.js";

const STATUSES = ["queued", "processing", "done", "failed", "enqueue_failed"] as const;
const QUEUE_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export async function statsRoutes(
  app: FastifyInstance,
  options: { repository: JobRepository; queueStats: QueueStatsSource },
) {
  const { repository, queueStats } = options;

  app.get("/api/stats", async () => {
    const [counts, queue] = await Promise.all([
      repository.countJobsByStatus(),
      withTimeout(queueStats(), QUEUE_TIMEOUT_MS),
    ]);

    return {
      jobs: Object.fromEntries(STATUSES.map((status) => [status, counts[status] ?? 0])),
      queue,
    };
  });
}