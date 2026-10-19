import type { FastifyError, FastifyInstance } from "fastify";

export function registerErrorHandling(app: FastifyInstance, options: { maxUploadBytes: number }) {
  const maxUploadMb = Math.round(options.maxUploadBytes / (1024 * 1024));

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: "Not found." });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply
        .code(413)
        .send({ error: `The file is too large. The maximum size is ${maxUploadMb} MB.` });
    }

    const status = error.statusCode ?? 500;

    if (status >= 500) {
      request.log.error({ err: error }, "Unhandled error");
      return reply
        .code(status)
        .send({ error: "Something went wrong on our side. Please try again." });
    }

    const message = error.validation ? `Invalid request: ${error.message}` : error.message;
    return reply.code(status).send({ error: message });
  });
}