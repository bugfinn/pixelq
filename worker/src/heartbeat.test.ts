import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startHeartbeat } from './heartbeat.js'

describe('startHeartbeat', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    vi.useFakeTimers()
    dir = mkdtempSync(join(tmpdir(), 'pixelq-heartbeat-'))
    file = join(dir, 'heartbeat')
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  // The file holds the time of the last beat. (Fake timers also fake Date.now,
  // so the content is a reliable thing to check.)
  const stamp = () => readFileSync(file, 'utf8')

  it('writes the file right away', () => {
    const hb = startHeartbeat({ path: file, intervalMs: 10_000, onError: vi.fn() })
    expect(existsSync(file)).toBe(true)
    expect(stamp()).toBe(String(Date.now()))
    hb.stop()
  })

  it('writes again after every interval', () => {
    const hb = startHeartbeat({ path: file, intervalMs: 10_000, onError: vi.fn() })
    const first = stamp()
    vi.advanceTimersByTime(10_000)
    expect(stamp()).not.toBe(first)
    expect(stamp()).toBe(String(Date.now()))
    hb.stop()
  })

  it('stops writing after stop()', () => {
    const hb = startHeartbeat({ path: file, intervalMs: 10_000, onError: vi.fn() })
    hb.stop()
    const before = stamp()
    vi.advanceTimersByTime(30_000)
    expect(stamp()).toBe(before)
  })

  it('does not throw when the file cannot be written, and reports the problem only once', () => {
    const onError = vi.fn()
    const missing = join(dir, 'missing-folder', 'heartbeat')
    expect(() => startHeartbeat({ path: missing, intervalMs: 10_000, onError })).not.toThrow()
    expect(onError).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_000)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('recovers by itself when the folder appears later', () => {
    const onError = vi.fn()
    const laterDir = join(dir, 'later')
    const laterFile = join(laterDir, 'heartbeat')
    const hb = startHeartbeat({ path: laterFile, intervalMs: 10_000, onError })
    expect(existsSync(laterFile)).toBe(false)
    mkdirSync(laterDir)
    vi.advanceTimersByTime(10_000)
    expect(existsSync(laterFile)).toBe(true)
    hb.stop()
  })
})