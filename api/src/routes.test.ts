import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerErrorHandling } from "./errors.js";
import type { JobRepository, QueueStats } from "./job-repository.js";
import type { JobWithOutputs } from "./job-view.js";
import { fileRoutes } from "./routes/files.js";
import { jobStatusRoutes } from "./routes/job-status.js";
import { statsRoutes } from "./routes/stats.js";

const ID = "11111111-2222-4333-8444-555555555555";
const OTHER_ID = "99999999-8888-4777-8666-555555555555";
const FILE_BYTES = Buffer.from("RIFF....WEBPfake image bytes");

let outputDir: string;

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), "pixelq-api-"));
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

const finishedJob = (id = ID): JobWithOutputs => ({
  job: {
    id,
    originalName: "my photo.jpg",
    originalSizeBytes: 5000,
    status: "done",
    attempts: 1,
    error: null,
    createdAt: new Date("2026-10-20T10:00:00.000Z"),
    startedAt: new Date("2026-10-20T10:00:01.000Z"),
    finishedAt: new Date("2026-10-20T10:00:02.000Z"),
    expiresAt: new Date(Date.now() + 3_600_000),
  },
  outputs: [{ jobId: id, variant: "full", sizeBytes: 100, width: 2048, height: 1365 }],
});

function fakeRepository(overrides: Partial<JobRepository> = {}): JobRepository {
  return {
    getJob: vi.fn(async (id: string) => (id === ID ? finishedJob() : null)),
    listJobs: vi.fn(async () => [finishedJob()]),
    getOutputFile: vi.fn(async () => null),
    countJobsByStatus: vi.fn(async () => ({})),
    ...overrides,
  };
}

async function build(
  repository: JobRepository,
  queueStats: () => Promise<QueueStats | null> = async () => null,
) {
  const app = Fastify();
  registerErrorHandling(app, { maxUploadBytes: 10 * 1024 * 1024 });
  await app.register(jobStatusRoutes, { repository });
  await app.register(fileRoutes, { repository, outputDir });
  await app.register(statsRoutes, { repository, queueStats });
  await app.ready();
  return app;
}

describe("GET /api/jobs/:id", () => {
  it("returns the job with its outputs", async () => {
    const app = await build(fakeRepository());

    const response = await app.inject({ method: "GET", url: `/api/jobs/${ID}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: ID,
      status: "done",
      outputs: [{ variant: "full", url: `/api/files/${ID}/full` }],
    });
  });

  it("answers 404 for a job that does not exist", async () => {
    const app = await build(fakeRepository());

    const response = await app.inject({ method: "GET", url: `/api/jobs/${OTHER_ID}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Job not found." });
  });

  it("answers 400 for an id that is not a UUID", async () => {
    const repository = fakeRepository();
    const app = await build(repository);

    const response = await app.inject({ method: "GET", url: "/api/jobs/not-a-uuid" });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/^Invalid request:/);
    expect(repository.getJob).not.toHaveBeenCalled();
  });
});

describe("GET /api/jobs", () => {
  it("lists recent jobs with a default limit of 20", async () => {
    const repository = fakeRepository();
    const app = await build(repository);

    const response = await app.inject({ method: "GET", url: "/api/jobs" });

    expect(response.statusCode).toBe(200);
    expect(response.json().jobs).toHaveLength(1);
    expect(repository.listJobs).toHaveBeenCalledWith(20);
  });

  it("passes a valid limit through", async () => {
    const repository = fakeRepository();
    const app = await build(repository);

    await app.inject({ method: "GET", url: "/api/jobs?limit=5" });

    expect(repository.listJobs).toHaveBeenCalledWith(5);
  });

  it.each(["0", "101", "abc", "-3", "2.5"])("rejects the limit %s", async (limit) => {
    const repository = fakeRepository();
    const app = await build(repository);

    const response = await app.inject({ method: "GET", url: `/api/jobs?limit=${limit}` });

    expect(response.statusCode).toBe(400);
    expect(repository.listJobs).not.toHaveBeenCalled();
  });
});

describe("GET /api/files/:job/:variant", () => {
  async function withFile(overrides: Partial<{ path: string; expiresAt: Date | null; originalName: string }> = {}) {
    const folder = join(outputDir, ID);
    await mkdir(folder, { recursive: true });
    const path = join(folder, "full.webp");
    await writeFile(path, FILE_BYTES);

    return build(
      fakeRepository({
        getOutputFile: vi.fn(async () => ({
          path,
          originalName: "my photo.jpg",
          expiresAt: new Date(Date.now() + 3_600_000),
          ...overrides,
        })),
      }),
    );
  }

  it("streams the file with the right headers", async () => {
    const app = await withFile();

    const response = await app.inject({ method: "GET", url: `/api/files/${ID}/full` });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(FILE_BYTES)).toBe(true);
    expect(response.headers["content-type"]).toBe("image/webp");
    expect(response.headers["content-length"]).toBe(String(FILE_BYTES.length));
    expect(response.headers["content-disposition"]).toBe("inline");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("forces a download with a safe file name when asked", async () => {
    const app = await withFile({ originalName: 'bad"name\r\n.jpg' });

    const response = await app.inject({ method: "GET", url: `/api/files/${ID}/full?download=1` });

    expect(response.headers["content-disposition"]).toBe('attachment; filename="bad_name-full.webp"');
  });

  it("answers 404 when there is no such output", async () => {
    const app = await build(fakeRepository());

    const response = await app.inject({ method: "GET", url: `/api/files/${ID}/medium` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "File not found." });
  });

  it("answers 404 once the job has expired, even if the file is still on disk", async () => {
    const app = await withFile({ expiresAt: new Date(Date.now() - 1000) });

    const response = await app.inject({ method: "GET", url: `/api/files/${ID}/full` });

    expect(response.statusCode).toBe(404);
  });

  it("answers 404 when the file has already been removed from disk", async () => {
    const app = await withFile({ path: join(outputDir, ID, "missing.webp") });

    const response = await app.inject({ method: "GET", url: `/api/files/${ID}/full` });

    expect(response.statusCode).toBe(404);
  });

  it("refuses a stored path that points outside the output folder", async () => {
    const outside = join(await mkdtemp(join(tmpdir(), "pixelq-secret-")), "secret.txt");
    await writeFile(outside, "top secret");
    const app = await withFile({ path: outside });

    const response = await app.inject({ method: "GET", url: `/api/files/${ID}/full` });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("top secret");
  });

  it("rejects an unknown variant and a malformed job id", async () => {
    const repository = fakeRepository();
    const app = await build(repository);

    const badVariant = await app.inject({ method: "GET", url: `/api/files/${ID}/huge` });
    const badJob = await app.inject({ method: "GET", url: "/api/files/..%2F..%2Fetc/full" });

    expect(badVariant.statusCode).toBe(400);
    expect(badJob.statusCode).toBe(400);
    expect(repository.getOutputFile).not.toHaveBeenCalled();
  });
});

describe("GET /api/stats", () => {
  it("combines job counts with the queue counts, filling in missing statuses with 0", async () => {
    const app = await build(
      fakeRepository({ countJobsByStatus: vi.fn(async () => ({ done: 7, failed: 2 })) }),
      async () => ({ waiting: 3, active: 1, delayed: 0, failed: 2 }),
    );

    const response = await app.inject({ method: "GET", url: "/api/stats" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      jobs: { queued: 0, processing: 0, done: 7, failed: 2, enqueue_failed: 0 },
      queue: { waiting: 3, active: 1, delayed: 0, failed: 2 },
    });
  });

  it("still answers when Redis cannot be reached", async () => {
    const app = await build(fakeRepository(), async () => null);

    const response = await app.inject({ method: "GET", url: "/api/stats" });

    expect(response.statusCode).toBe(200);
    expect(response.json().queue).toBeNull();
  });

  it("still answers when the queue lookup throws or hangs", async () => {
    vi.useFakeTimers();
    const hanging = await build(fakeRepository(), () => new Promise(() => {}));
    const throwing = await build(fakeRepository(), async () => {
      throw new Error("redis down");
    });

    const pending = hanging.inject({ method: "GET", url: "/api/stats" });
    await vi.advanceTimersByTimeAsync(2000);
    const slow = await pending;
    const failed = await throwing.inject({ method: "GET", url: "/api/stats" });
    vi.useRealTimers();

    expect(slow.json().queue).toBeNull();
    expect(failed.json().queue).toBeNull();
  });
});

describe("error handling", () => {
  it("answers unknown routes with the same error format", async () => {
    const app = await build(fakeRepository());

    const response = await app.inject({ method: "GET", url: "/api/nothing-here" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found." });
  });

  it("hides the details of unexpected errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = await build(
      fakeRepository({
        getJob: vi.fn(async () => {
          throw new Error("password=hunter2 connection refused at 10.0.0.5");
        }),
      }),
    );

    const response = await app.inject({ method: "GET", url: `/api/jobs/${ID}` });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "Something went wrong on our side. Please try again." });
    expect(response.body).not.toContain("hunter2");
  });

  it("turns an oversized upload into a readable 413", async () => {
    const app = Fastify();
    registerErrorHandling(app, { maxUploadBytes: 10 * 1024 * 1024 });
    app.get("/boom", async () => {
      const error = new Error("request file too large") as Error & { code: string; statusCode: number };
      error.code = "FST_REQ_FILE_TOO_LARGE";
      error.statusCode = 413;
      throw error;
    });

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: "The file is too large. The maximum size is 10 MB." });
  });
});