import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { db } from "../db.js";
import { detectImageType } from "../file-type.js";
import { jobs } from "../schema.js";

const extensions = { jpeg: "jpg", png: "png", webp: "webp" } as const;

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
        storedPath,
      });
    } catch (err) {
      await unlink(storedPath).catch(() => {});
      throw err;
    }

    return reply.code(202).send({ id, status: "queued" });
  });
}
