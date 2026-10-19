import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { config } from "./config.js";
import { registerErrorHandling } from "./errors.js";
import type { JobRepository, QueueStatsSource } from "./job-repository.js";
import { fileRoutes } from "./routes/files.js";
import { jobStatusRoutes } from "./routes/job-status.js";
import { jobRoutes } from "./routes/jobs.js";
import { statsRoutes } from "./routes/stats.js";

export type AppDependencies = {
  repository: JobRepository;
  queueStats: QueueStatsSource;
};

export function buildApp(deps: AppDependencies) {
  const app = Fastify({ logger: true });

  registerErrorHandling(app, { maxUploadBytes: config.maxUploadBytes });

  app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1 },
  });
  app.register(jobRoutes);
  app.register(jobStatusRoutes, { repository: deps.repository });
  app.register(fileRoutes, { repository: deps.repository, outputDir: config.outputDir });
  app.register(statsRoutes, { repository: deps.repository, queueStats: deps.queueStats });

  app.get("/api/health", async () => {
    return { status: "ok" };
  });

  return app;
}