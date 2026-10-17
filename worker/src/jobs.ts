import type { ProcessedVariant } from "./image.js";
import { pool, withTransaction } from "./db.js";
import type { JobStore, StartResult } from "./process-job.js";

const RETENTION_HOURS = 24;

async function startJob(jobId: string): Promise<StartResult> {
  const started = await pool.query<{ stored_path: string }>(
    `UPDATE jobs
        SET status = 'processing',
            attempts = attempts + 1,
            started_at = now(),
            error = NULL
      WHERE id = $1
        AND status IN ('queued', 'processing')
  RETURNING stored_path`,
    [jobId],
  );

  const row = started.rows[0];
  if (row) {
    return { kind: "started", storedPath: row.stored_path };
  }

  const existing = await pool.query<{ status: string }>(
    "SELECT status FROM jobs WHERE id = $1",
    [jobId],
  );

  const current = existing.rows[0];
  if (!current) {
    return { kind: "missing" };
  }

  return { kind: "finished", status: current.status };
}

async function completeJob(jobId: string, variants: ProcessedVariant[]): Promise<boolean> {
  return withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE jobs
          SET status = 'done',
              finished_at = now(),
              expires_at = now() + make_interval(hours => $2::int),
              error = NULL
        WHERE id = $1
          AND status IN ('queued', 'processing')`,
      [jobId, RETENTION_HOURS],
    );

    if (updated.rowCount === 0) {
      return false;
    }

    for (const v of variants) {
      await client.query(
        `INSERT INTO outputs (job_id, variant, path, size_bytes, width, height)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (job_id, variant)
         DO UPDATE SET path = EXCLUDED.path,
                       size_bytes = EXCLUDED.size_bytes,
                       width = EXCLUDED.width,
                       height = EXCLUDED.height`,
        [jobId, v.variant, v.path, v.sizeBytes, v.width, v.height],
      );
    }

    return true;
  });
}

async function markJobFailed(jobId: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE jobs
        SET status = 'failed',
            error = $2,
            finished_at = now(),
            expires_at = now() + make_interval(hours => $3::int)
      WHERE id = $1
        AND status IN ('queued', 'processing')`,
    [jobId, message, RETENTION_HOURS],
  );
}

async function markJobRetrying(jobId: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE jobs
        SET status = 'queued',
            error = $2
      WHERE id = $1
        AND status = 'processing'`,
    [jobId, message],
  );
}

export const jobStore: JobStore = { startJob, completeJob, markJobFailed, markJobRetrying };