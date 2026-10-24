import { isActive, percentChange } from './format'
import type { Job } from './types'

// A job that never got queued is shown as an upload error message, not as a card.
export function visibleJobs(jobs: Job[]): Job[] {
  return jobs.filter((job) => job.status !== 'enqueue_failed')
}

export function summarizeJobs(jobs: Job[]): { inProgress: number; failed: number } {
  const shown = visibleJobs(jobs)
  return {
    inProgress: shown.filter((job) => isActive(job.status)).length,
    failed: shown.filter((job) => job.status === 'failed').length,
  }
}

// "4.2 MB -> 610 KB (-86%)": original size against the biggest output (full).
export function sizeSummary(job: Job): { from: number; to: number; change: number | null } | null {
  const full = job.outputs.find((output) => output.variant === 'full')
  if (job.status !== 'done' || !full || job.originalSizeBytes === null) return null
  return {
    from: job.originalSizeBytes,
    to: full.sizeBytes,
    change: percentChange(job.originalSizeBytes, full.sizeBytes),
  }
}