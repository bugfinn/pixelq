import { desc, eq, and, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { JobRecord, JobWithOutputs, OutputRecord, Variant } from "./job-view.js";
import { jobs, outputs } from "./schema.js";

export type OutputFile = {
  path: string;
  originalName: string;
  expiresAt: Date | null;
};

export type QueueStats = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

export type JobRepository = {
  getJob(id: string): Promise<JobWithOutputs | null>;
  listJobs(limit: number): Promise<JobWithOutputs[]>;
  getOutputFile(jobId: string, variant: Variant): Promise<OutputFile | null>;
  countJobsByStatus(): Promise<Record<string, number>>;
};

export type QueueStatsSource = () => Promise<QueueStats | null>;

const jobColumns = {
  id: jobs.id,
  originalName: jobs.originalName,
  originalSizeBytes: jobs.originalSizeBytes,
  status: jobs.status,
  attempts: jobs.attempts,
  error: jobs.error,
  createdAt: jobs.createdAt,
  startedAt: jobs.startedAt,
  finishedAt: jobs.finishedAt,
  expiresAt: jobs.expiresAt,
};

const outputColumns = {
  jobId: outputs.jobId,
  variant: outputs.variant,
  sizeBytes: outputs.sizeBytes,
  width: outputs.width,
  height: outputs.height,
};

export function createJobRepository(db: NodePgDatabase): JobRepository {
  async function withOutputs(jobRows: JobRecord[]): Promise<JobWithOutputs[]> {
    if (jobRows.length === 0) {
      return [];
    }

    const outputRows: OutputRecord[] = await db
      .select(outputColumns)
      .from(outputs)
      .where(inArray(outputs.jobId, jobRows.map((job) => job.id)));

    return jobRows.map((job) => ({
      job,
      outputs: outputRows.filter((output) => output.jobId === job.id),
    }));
  }

  return {
    async getJob(id) {
      const rows: JobRecord[] = await db.select(jobColumns).from(jobs).where(eq(jobs.id, id));
      const [found] = await withOutputs(rows);
      return found ?? null;
    },

    async listJobs(limit) {
      const rows: JobRecord[] = await db
        .select(jobColumns)
        .from(jobs)
        .orderBy(desc(jobs.createdAt))
        .limit(limit);
      return withOutputs(rows);
    },

    async getOutputFile(jobId, variant) {
      const rows = await db
        .select({
          path: outputs.path,
          originalName: jobs.originalName,
          expiresAt: jobs.expiresAt,
        })
        .from(outputs)
        .innerJoin(jobs, eq(jobs.id, outputs.jobId))
        .where(and(eq(outputs.jobId, jobId), eq(outputs.variant, variant)));

      return rows[0] ?? null;
    },

    async countJobsByStatus() {
      const rows = await db
        .select({ status: jobs.status, count: sql<number>`count(*)::int` })
        .from(jobs)
        .groupBy(jobs.status);

      return Object.fromEntries(rows.map((row) => [row.status, row.count]));
    },
  };
}