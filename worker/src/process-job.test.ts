import { UnrecoverableError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidImageError, type ProcessedVariant } from "./image.js";
import {
  FAILED_MESSAGE,
  RETRY_MESSAGE,
  processJob,
  type JobStore,
  type StartResult,
} from "./process-job.js";

const JOB_ID = "11111111-2222-4333-8444-555555555555";

const VARIANTS: ProcessedVariant[] = [
  { variant: "thumbnail", path: "/out/thumbnail.webp", sizeBytes: 10, width: 320, height: 213 },
  { variant: "medium", path: "/out/medium.webp", sizeBytes: 20, width: 1280, height: 853 },
  { variant: "full", path: "/out/full.webp", sizeBytes: 30, width: 2048, height: 1365 },
];

function setup(
  overrides: Partial<JobStore> = {},
  start: StartResult = { kind: "started", storedPath: "/uploads/a.jpg" },
) {
  const store = {
    startJob: vi.fn().mockResolvedValue(start),
    completeJob: vi.fn().mockResolvedValue(true),
    markJobFailed: vi.fn().mockResolvedValue(undefined),
    markJobRetrying: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const processImage = vi.fn().mockResolvedValue(VARIANTS);
  const deps = { store: store as JobStore, processImage, outputDir: "/out" };
  return { store, processImage, deps };
}

const first = { jobId: JOB_ID, attemptNumber: 1, maxAttempts: 3 };
const last = { jobId: JOB_ID, attemptNumber: 3, maxAttempts: 3 };

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("processJob", () => {
  it("processes the stored file and completes the job with its variants", async () => {
    const { store, processImage, deps } = setup();

    await processJob(first, deps);

    expect(processImage).toHaveBeenCalledWith("/uploads/a.jpg", "/out", JOB_ID);
    expect(store.completeJob).toHaveBeenCalledWith(JOB_ID, VARIANTS);
    expect(store.markJobFailed).not.toHaveBeenCalled();
    expect(store.markJobRetrying).not.toHaveBeenCalled();
  });

  it("skips a job that is already finished", async () => {
    const { store, processImage, deps } = setup({}, { kind: "finished", status: "done" });

    await processJob(first, deps);

    expect(processImage).not.toHaveBeenCalled();
    expect(store.completeJob).not.toHaveBeenCalled();
  });

  it("gives up at once when the job row does not exist", async () => {
    const { processImage, deps } = setup({}, { kind: "missing" });

    await expect(processJob(first, deps)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(processImage).not.toHaveBeenCalled();
  });

  it("gives up at once when the queue job has no valid job id", async () => {
    const { store, deps } = setup();

    await expect(
      processJob({ jobId: "not-a-uuid", attemptNumber: 1, maxAttempts: 3 }, deps),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(store.startJob).not.toHaveBeenCalled();
  });

  it("marks an invalid image as failed and does not retry it", async () => {
    const { store, deps } = setup();
    deps.processImage.mockRejectedValue(new InvalidImageError("Animated or multi-page images are not supported."));

    await expect(processJob(first, deps)).rejects.toBeInstanceOf(UnrecoverableError);

    expect(store.markJobFailed).toHaveBeenCalledWith(
      JOB_ID,
      "Animated or multi-page images are not supported.",
    );
    expect(store.markJobRetrying).not.toHaveBeenCalled();
    expect(store.completeJob).not.toHaveBeenCalled();
  });

  it("puts the job back to queued and rethrows when attempts remain", async () => {
    const { store, deps } = setup();
    const boom = new Error("disk exploded at /secret/path");
    deps.processImage.mockRejectedValue(boom);

    await expect(processJob(first, deps)).rejects.toBe(boom);

    expect(store.markJobRetrying).toHaveBeenCalledWith(JOB_ID, RETRY_MESSAGE);
    expect(store.markJobFailed).not.toHaveBeenCalled();
  });

  it("marks the job failed on the last attempt without leaking the internal error", async () => {
    const { store, deps } = setup();
    deps.processImage.mockRejectedValue(new Error("disk exploded at /secret/path"));

    await expect(processJob(last, deps)).rejects.toThrow("disk exploded");

    expect(store.markJobFailed).toHaveBeenCalledWith(JOB_ID, FAILED_MESSAGE);
    expect(FAILED_MESSAGE).not.toContain("secret");
    expect(store.markJobRetrying).not.toHaveBeenCalled();
  });

  it("treats a database error while saving the result like any other failure", async () => {
    const dbError = new Error("connection lost");
    const { store, deps } = setup({ completeJob: vi.fn().mockRejectedValue(dbError) });

    await expect(processJob(first, deps)).rejects.toBe(dbError);

    expect(store.markJobRetrying).toHaveBeenCalledWith(JOB_ID, RETRY_MESSAGE);
  });

  it("still throws the original error when recording the failure also fails", async () => {
    const { deps } = setup({ markJobRetrying: vi.fn().mockRejectedValue(new Error("db down")) });
    const boom = new Error("sharp crashed");
    deps.processImage.mockRejectedValue(boom);

    await expect(processJob(first, deps)).rejects.toBe(boom);
  });

  it("throws a retryable error when it cannot record an invalid image", async () => {
    const dbError = new Error("db down");
    const { deps } = setup({ markJobFailed: vi.fn().mockRejectedValue(dbError) });
    deps.processImage.mockRejectedValue(new InvalidImageError("The file is not a valid image."));

    const result = processJob(first, deps);

    await expect(result).rejects.toBe(dbError);
    await expect(result).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it("does nothing more when the job is no longer waiting to be completed", async () => {
    const { store, deps } = setup({ completeJob: vi.fn().mockResolvedValue(false) });

    await expect(processJob(first, deps)).resolves.toBeUndefined();

    expect(store.markJobFailed).not.toHaveBeenCalled();
    expect(store.markJobRetrying).not.toHaveBeenCalled();
  });
});