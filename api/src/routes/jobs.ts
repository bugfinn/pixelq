import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { db } from "../db.js";
import { detectImageType } from "../file-type.js";
import { enqueueImageJob } from "../queue.js";
import { jobs } from "../schema.js";

const extensions = { jpeg: "jpg", png: "png", webp: "webp" } as const;

const RETENTION_HOURS = 24;
const ENQUEUE_FAILED_MESSAGE =
  "The processing queue was unavailable. Please upload the image again.";

async function markEnqueueFailed(id: string) {
  await db
    .update(jobs)
    .set({
      status: "enqueue_failed",
      error: ENQUEUE_FAILED_MESSAGE,
      expiresAt: sql`now() + make_interval(hours => ${RETENTION_HOURS}::int)`,
    })
    .where(and(eq(jobs.id, id), eq(jobs.status, "queued")));
}

export async function jobRoutes(app: FastifyInstance) {
  app.post("/api/jobs", async (request, reply) => {
    const part = await request.file();
    if (!part) {
      return reply
        .code(400)
        .send({ error: "No file was uploaded. Send a multipart form with a file." });
    }

    const data = await part.toBuffer();

    const type = detectImageType(data);
    if (!type) {
      return reply
        .code(415)
        .send({ error: "Only JPEG, PNG and WebP images are accepted." });
    }

    const id = randomUUID();
    const storedPath = join(config.uploadDir, `${id}.${extensions[type]}`);

    await mkdir(config.uploadDir, { recursive: true });
    await writeFile(storedPath, data, { flag: "wx" });

    try {
      await db.insert(jobs).values({
        id,
        originalName: basename(part.filename).slice(0, 255) || "upload",
        originalSizeBytes: data.length,
        storedPath,
      });
    } catch (err) {
      await unlink(storedPath).catch(() => { });
      throw err;
    }

    try {
      await enqueueImageJob(id);
    } catch (err) {
      request.log.error({ err, jobId: id }, "Could not add the job to the queue");

      try {
        await markEnqueueFailed(id);
      } catch (markError) {
        request.log.error(
          { err: markError, jobId: id },
          "Could not mark the job as enqueue_failed",
        );
      }

      return reply
        .code(503)
        .send({ error: "The processing queue is unavailable. Please try again shortly." });
    }

    return reply.code(202).send({ id, status: "queued" });
  });
}