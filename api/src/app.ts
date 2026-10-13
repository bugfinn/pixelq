import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { config } from "./config.js";
import { jobRoutes } from "./routes/jobs.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1 },
  });
  app.register(jobRoutes);

  app.get("/api/health", async () => {
    return { status: "ok" };
  });

  return app;
}
