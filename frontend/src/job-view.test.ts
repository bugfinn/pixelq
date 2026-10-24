import { describe, expect, it } from 'vitest'
import { sizeSummary, summarizeJobs, visibleJobs } from './job-view'
import type { Job } from './types'

function makeJob(over: Partial<Job> = {}): Job {
  return {
    id: '1',
    originalName: 'a.jpg',
    originalSizeBytes: 1000,
    status: 'done',
    attempts: 1,
    error: null,
    createdAt: '2026-10-24T09:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    expiresAt: null,
    outputs: [],
    ...over,
  }
}

describe('visibleJobs', () => {
  it('hides jobs that could not be queued', () => {
    const jobs = [makeJob({ id: 'a' }), makeJob({ id: 'b', status: 'enqueue_failed' })]
    expect(visibleJobs(jobs).map((j) => j.id)).toEqual(['a'])
  })
})

describe('summarizeJobs', () => {
  it('counts queued and processing together, and failed separately', () => {
    const jobs = [
      makeJob({ status: 'queued' }),
      makeJob({ status: 'processing' }),
      makeJob({ status: 'done' }),
      makeJob({ status: 'failed' }),
      makeJob({ status: 'failed' }),
      makeJob({ status: 'enqueue_failed' }),
    ]
    expect(summarizeJobs(jobs)).toEqual({ inProgress: 2, failed: 2 })
  })
})

describe('sizeSummary', () => {
  const full = { variant: 'full' as const, width: 10, height: 10, sizeBytes: 250, url: '/x' }

  it('compares the original with the full variant', () => {
    expect(sizeSummary(makeJob({ outputs: [full] }))).toEqual({ from: 1000, to: 250, change: -75 })
  })
  it('is null when it cannot be worked out', () => {
    expect(sizeSummary(makeJob({ status: 'processing', outputs: [full] }))).toBeNull()
    expect(sizeSummary(makeJob({ outputs: [] }))).toBeNull()
    expect(sizeSummary(makeJob({ originalSizeBytes: null, outputs: [full] }))).toBeNull()
  })
})