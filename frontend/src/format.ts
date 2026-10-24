import type { JobStatus } from './types'

// 214 -> "214 B", 624640 -> "610 KB", 4404019 -> "4.2 MB"
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// How much bigger or smaller the output is, as a whole number. null if we can't tell.
export function percentChange(original: number | null, output: number): number | null {
  if (original === null || original <= 0) return null
  return Math.round(((output - original) / original) * 100)
}

// -86 -> "-86%", 5 -> "+5%", 0 -> "0%", null -> ""
export function formatPercent(value: number | null): string {
  if (value === null) return ''
  return value > 0 ? `+${value}%` : `${value}%`
}

export function statusLabel(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'processing':
      return 'Processing'
    case 'done':
      return 'Done'
    case 'failed':
      return 'Failed'
    case 'enqueue_failed':
      return 'Not queued'
  }
}

// The page only needs to keep polling while a job can still change.
export function isActive(status: JobStatus): boolean {
  return status === 'queued' || status === 'processing'
}