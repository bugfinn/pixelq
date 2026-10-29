import { writeFileSync } from 'node:fs'

// The Docker healthcheck in docker-compose.yml reads this same path. Keep them in sync.
export const HEARTBEAT_PATH = '/tmp/heartbeat'
export const HEARTBEAT_EVERY_MS = 10_000

export interface HeartbeatOptions {
  path?: string
  intervalMs?: number
  onError?: (err: unknown) => void
}

// Writes the current time into a small file, now and then every few seconds.
// Docker's healthcheck looks at the file's age: a fresh file means the worker is alive.
export function startHeartbeat(options: HeartbeatOptions = {}): { stop: () => void } {
  const path = options.path ?? HEARTBEAT_PATH
  const intervalMs = options.intervalMs ?? HEARTBEAT_EVERY_MS
  const onError = options.onError ?? ((err: unknown) => console.error('heartbeat write failed', err))

  // Report a problem when it starts, not on every beat.
  let failing = false

  const beat = (): void => {
    try {
      writeFileSync(path, String(Date.now()))
      failing = false
    } catch (err) {
      if (!failing) {
        failing = true
        onError(err)
      }
    }
  }

  beat()
  const timer = setInterval(beat, intervalMs)
  timer.unref() // this timer alone never keeps the process alive
  return { stop: () => clearInterval(timer) }
}