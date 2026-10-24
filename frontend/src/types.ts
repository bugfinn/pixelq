export type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'enqueue_failed'
export type Variant = 'thumbnail' | 'medium' | 'full'

export interface JobOutput {
  variant: Variant
  width: number
  height: number
  sizeBytes: number
  url: string
}

export interface Job {
  id: string
  originalName: string
  originalSizeBytes: number | null
  status: JobStatus
  attempts: number
  error: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  expiresAt: string | null
  outputs: JobOutput[]
}