import type { Job } from './types'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const UNREACHABLE = "Can't reach the server. Please try again in a moment."

// Prefer the API's own { error } text. Nginx errors are HTML, so fall back by status code.
async function readError(res: Response): Promise<ApiError> {
  try {
    const body: unknown = await res.json()
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return new ApiError(body.error, res.status)
    }
  } catch {
    // body was not JSON; use the fallback below
  }
  if (res.status === 413) return new ApiError('The file is too large. The maximum size is 10 MB.', 413)
  if (res.status === 429) return new ApiError('Too many uploads. Please wait a moment and try again.', 429)
  if (res.status >= 500) return new ApiError(UNREACHABLE, res.status)
  return new ApiError('Something went wrong. Please try again.', res.status)
}

async function request(input: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch {
    throw new ApiError(UNREACHABLE, 0)
  }
  if (!res.ok) throw await readError(res)
  return res
}

export async function uploadFile(file: File): Promise<{ id: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await request('/api/jobs', { method: 'POST', body: form })
  return (await res.json()) as { id: string }
}

export async function getJob(id: string): Promise<Job> {
  const res = await request(`/api/jobs/${id}`)
  return (await res.json()) as Job
}

export async function listJobs(limit = 20): Promise<Job[]> {
  const res = await request(`/api/jobs?limit=${limit}`)
  const data = (await res.json()) as { jobs: Job[] }
  return data.jobs
}