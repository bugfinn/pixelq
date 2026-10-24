import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, listJobs, uploadFile } from './api'
import { isActive } from './format'
import type { Job } from './types'

const POLL_MS = 2000

export interface Notice {
  id: number
  text: string
}

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loaded, setLoaded] = useState(false)
  const [offline, setOffline] = useState(false)
  const [uploadingName, setUploadingName] = useState<string | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [tick, setTick] = useState(0)
  const nextNoticeId = useRef(1)

  const hasActive = jobs.some((job) => isActive(job.status))

  const refresh = useCallback(async () => {
    try {
      setJobs(await listJobs())
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setLoaded(true)
    }
  }, [])

   // Load the recent jobs once, so cards survive a page refresh.
  // The state updates happen inside promise callbacks, after the response arrives.
  useEffect(() => {
    let cancelled = false
    listJobs()
      .then((latest) => {
        if (cancelled) return
        setJobs(latest)
        setOffline(false)
      })
      .catch(() => {
        if (!cancelled) setOffline(true)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  // Poll every 2 seconds, but only while some job can still change.
  // "tick" makes the effect run again after every round, so it works as a loop
  // (and keeps trying if one request fails).
  useEffect(() => {
    if (!hasActive) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const latest = await listJobs()
        if (!cancelled) {
          setJobs(latest)
          setOffline(false)
        }
      } catch {
        if (!cancelled) setOffline(true)
      } finally {
        if (!cancelled) setTick((t) => t + 1)
      }
    }, POLL_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [hasActive, tick])

  const addNotice = useCallback((text: string) => {
    setNotices((prev) => [...prev, { id: nextNoticeId.current++, text }])
  }, [])

  const dismissNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((notice) => notice.id !== id))
  }, [])

  // Upload files one at a time, in order (simple, and it avoids rate-limit errors).
  const addFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        setUploadingName(file.name)
        let stop = false
        try {
          await uploadFile(file)
        } catch (err) {
          addNotice(`${file.name}: ${messageOf(err)}`)
          stop = err instanceof ApiError && err.status === 429
        }
        await refresh()
        if (stop) {
          addNotice('The remaining files were skipped.')
          break
        }
      }
      setUploadingName(null)
    },
    [addNotice, refresh],
  )

  return { jobs, loaded, offline, uploadingName, notices, addFiles, dismissNotice }
}