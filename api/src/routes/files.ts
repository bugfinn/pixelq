import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { downloadName } from "../download-name.js";
import type { JobRepository } from "../job-repository.js";
import { VARIANTS, type Variant } from "../job-view.js";
import { isInside } from "../paths.js";

export async function fileRoutes(
  app: FastifyInstance,
  options: { repository: JobRepository; outputDir: string },
) {
  const { repository, outputDir } = options;

  app.get<{ Params: { job: string; variant: Variant }; Querystring: { download?: string } }>(
    "/api/files/:job/:variant",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            job: { type: "string", format: "uuid" },
            variant: { type: "string", enum: [...VARIANTS] },
          },
          required: ["job", "variant"],
        },
        querystring: {
          type: "object",
          properties: { download: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      const { job, variant } = request.params;
      const notFound = () => reply.code(404).send({ error: "File not found." });

      const record = await repository.getOutputFile(job, variant);
      if (!record) {
        return notFound();
      }

      if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
        return notFound();
      }

      if (!isInside(outputDir, record.path)) {
        request.log.error({ jobId: job, variant }, "Output path is outside the output folder");
        return notFound();
      }

      let size: number;
      try {
        size = (await stat(record.path)).size;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return notFound();
        }
        throw err;
      }

      const disposition =
        request.query.download === "1"
          ? `attachment; filename="${downloadName(record.originalName, variant)}"`
          : "inline";

      return reply
        .header("Content-Type", "image/webp")
        .header("Content-Length", size)
        .header("Content-Disposition", disposition)
        .header("Cache-Control", "private, max-age=3600")
        .header("X-Content-Type-Options", "nosniff")
        .send(createReadStream(record.path));
    },
  );
}