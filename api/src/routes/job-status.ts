import type { FastifyInstance } from "fastify";
import type { JobRepository } from "../job-repository.js";
import { toJobResponse } from "../job-view.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function jobStatusRoutes(app: FastifyInstance, options: { repository: JobRepository }) {
  const { repository } = options;

  app.get<{ Params: { id: string } }>(
    "/api/jobs/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const found = await repository.getJob(request.params.id);
      if (!found) {
        return reply.code(404).send({ error: "Job not found." });
      }

      return toJobResponse(found);
    },
  );

  app.get<{ Querystring: { limit: number } }>(
    "/api/jobs",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
          },
        },
      },
    },
    async (request) => {
      const found = await repository.listJobs(request.query.limit);
      return { jobs: found.map(toJobResponse) };
    },
  );
}