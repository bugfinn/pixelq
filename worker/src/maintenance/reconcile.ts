import { FAILED_MESSAGE } from "../process-job.js";

export type ReconcileAction = "leave" | "readd" | "mark-failed" | "report-inconsistent";

export const MISSING_FILE_MESSAGE = "The uploaded file is missing. Please upload the image again.";

export function decideReconcileAction(bullState: string): ReconcileAction {
  switch (bullState) {
    case "unknown":
      return "readd";
    case "failed":
      return "mark-failed";
    case "completed":
      return "report-inconsistent";
    default:
      return "leave";
  }
}

export type StaleJob = {
  id: string;
  status: string;
  storedPath: string;
};

export type ReconcileDeps = {
  listStaleJobs(limit: number): Promise<StaleJob[]>;
  getJobState(jobId: string): Promise<string>;
  enqueueImageJob(jobId: string): Promise<unknown>;
  markJobFailed(jobId: string, message: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  limit: number;
};

export type ReconcileSummary = {
  checked: number;
  left: number;
  readded: number;
  markedFailed: number;
  missingFile: number;
  inconsistent: number;
  errors: number;
};

export async function runReconcile(deps: ReconcileDeps): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = {
    checked: 0,
    left: 0,
    readded: 0,
    markedFailed: 0,
    missingFile: 0,
    inconsistent: 0,
    errors: 0,
  };

  const jobs = await deps.listStaleJobs(deps.limit);

  for (const job of jobs) {
    summary.checked++;

    try {
      const state = await deps.getJobState(job.id);

      switch (decideReconcileAction(state)) {
        case "leave":
          summary.left++;
          break;

        case "readd":
          if (await deps.fileExists(job.storedPath)) {
            await deps.enqueueImageJob(job.id);
            summary.readded++;
          } else {
            await deps.markJobFailed(job.id, MISSING_FILE_MESSAGE);
            summary.missingFile++;
          }
          break;

        case "mark-failed":
          await deps.markJobFailed(job.id, FAILED_MESSAGE);
          summary.markedFailed++;
          break;

        case "report-inconsistent":
          console.error(
            `Reconcile: job ${job.id} is "${job.status}" in Postgres but "completed" in BullMQ. Leaving it alone.`,
          );
          summary.inconsistent++;
          break;
      }
    } catch (err) {
      summary.errors++;
      console.error(`Reconcile: could not check job ${job.id}:`, err);
    }
  }

  return summary;
}