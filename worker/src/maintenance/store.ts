import { pool } from "../db.js";
import type { ExpiredJob } from "./cleanup.js";
import type { StaleJob } from "./reconcile.js";

export const STALE_QUEUED_SECONDS = 60;
export const STALE_PROCESSING_SECONDS = 5 * 60;

export async function listStaleJobs(limit: number): Promise<StaleJob[]> {
  const result = await pool.query<{ id: string; status: string; stored_path: string }>(
    `SELECT id, status, stored_path
       FROM jobs
      WHERE (status = 'queued'
             AND created_at < now() - make_interval(secs => $1::int))
         OR (status = 'processing'
             AND started_at < now() - make_interval(secs => $2::int))
      ORDER BY created_at ASC
      LIMIT $3`,
    [STALE_QUEUED_SECONDS, STALE_PROCESSING_SECONDS, limit],
  );

  return result.rows.map((row) => ({ id: row.id, status: row.status, storedPath: row.stored_path }));
}

export async function findExpiredJobs(limit: number): Promise<ExpiredJob[]> {
  const result = await pool.query<{ id: string; stored_path: string }>(
    `SELECT id, stored_path
       FROM jobs
      WHERE status IN ('done', 'failed', 'enqueue_failed')
        AND expires_at IS NOT NULL
        AND expires_at < now()
      ORDER BY expires_at ASC
      LIMIT $1`,
    [limit],
  );

  return result.rows.map((row) => ({ id: row.id, storedPath: row.stored_path }));
}

export async function deleteJob(jobId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM jobs
      WHERE id = $1
        AND status IN ('done', 'failed', 'enqueue_failed')`,
    [jobId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function findExistingJobIds(ids: string[]): Promise<Set<string>> {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM jobs WHERE id = ANY($1::uuid[])",
    [ids],
  );

  return new Set(result.rows.map((row) => row.id));
}