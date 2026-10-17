import { UnrecoverableError } from "bullmq";
import { InvalidImageError, type ProcessedVariant } from "./image.js";

export type StartResult =
  | { kind: "started"; storedPath: string }
  | { kind: "missing" }
  | { kind: "finished"; status: string };

export type JobStore = {
  startJob(jobId: string): Promise<StartResult>;
  completeJob(jobId: string, variants: ProcessedVariant[]): Promise<boolean>;
  markJobFailed(jobId: string, message: string): Promise<void>;
  markJobRetrying(jobId: string, message: string): Promise<void>;
};

export type ProcessJobContext = {
  jobId: unknown;
  attemptNumber: number;
  maxAttempts: number;
};

export type ProcessJobDeps = {
  store: JobStore;
  processImage: (
    inputPath: string,
    outputDir: string,
    jobId: string,
  ) => Promise<ProcessedVariant[]>;
  outputDir: string;
};

export const FAILED_MESSAGE = "Processing failed. Please try uploading the image again.";
export const RETRY_MESSAGE = "Processing failed, retrying.";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function processJob(ctx: ProcessJobContext, deps: ProcessJobDeps): Promise<void> {
  const { store } = deps;

  if (typeof ctx.jobId !== "string" || !UUID_PATTERN.test(ctx.jobId)) {
    throw new UnrecoverableError("The queue job has no valid jobId.");
  }
  const jobId = ctx.jobId;

  const start = await store.startJob(jobId);

  if (start.kind === "missing") {
    throw new UnrecoverableError(`Job ${jobId} does not exist in the database.`);
  }

  if (start.kind === "finished") {
    console.log(`Job ${jobId} is already ${start.status}, skipping.`);
    return;
  }

  try {
    const variants = await deps.processImage(start.storedPath, deps.outputDir, jobId);
    const applied = await store.completeJob(jobId, variants);

    if (!applied) {
      console.log(`Job ${jobId} was no longer waiting to be completed, nothing was saved.`);
    }
    return;
  } catch (err) {
    if (err instanceof InvalidImageError) {
      await store.markJobFailed(jobId, err.message);
      throw new UnrecoverableError(err.message);
    }

    console.error(`Job ${jobId} failed on attempt ${ctx.attemptNumber}:`, err);

    try {
      if (ctx.attemptNumber >= ctx.maxAttempts) {
        await store.markJobFailed(jobId, FAILED_MESSAGE);
      } else {
        await store.markJobRetrying(jobId, RETRY_MESSAGE);
      }
    } catch (recordError) {
      console.error(`Could not record the failure of job ${jobId}:`, recordError);
    }

    throw err;
  }
}