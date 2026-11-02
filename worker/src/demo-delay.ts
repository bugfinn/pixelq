/**
 * Demo only (scripts/kill-demo.sh): how long a job waits before it is processed.
 * Only the first start of a job waits, so a job that is picked up again after
 * its worker was killed finishes quickly.
 */
export function demoDelayMs(attemptsStarted: number, configuredMs: number): number {
  if (configuredMs <= 0) {
    return 0;
  }
  return attemptsStarted <= 1 ? configuredMs : 0;
}