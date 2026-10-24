import { describe, expect, it } from 'vitest'
import { formatBytes, formatPercent, isActive, percentChange, statusLabel } from './format'

describe('formatBytes', () => {
  it('shows small sizes in bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(214)).toBe('214 B')
  })
  it('shows KB without decimals', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(624640)).toBe('610 KB')
  })
  it('shows MB with one decimal', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB')
    expect(formatBytes(4404019)).toBe('4.2 MB')
  })
})

describe('percentChange', () => {
  it('is negative when the output is smaller', () => {
    expect(percentChange(4404019, 624640)).toBe(-86)
  })
  it('is positive when the output is bigger', () => {
    expect(percentChange(100, 105)).toBe(5)
  })
  it('is null when the original size is unknown or zero', () => {
    expect(percentChange(0, 5)).toBeNull()
    expect(percentChange(null, 5)).toBeNull()
  })
})

describe('formatPercent', () => {
  it('adds a plus sign only for increases', () => {
    expect(formatPercent(-86)).toBe('-86%')
    expect(formatPercent(5)).toBe('+5%')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(null)).toBe('')
  })
})

describe('statusLabel', () => {
  it('gives a readable label for every status', () => {
    expect(statusLabel('queued')).toBe('Queued')
    expect(statusLabel('processing')).toBe('Processing')
    expect(statusLabel('done')).toBe('Done')
    expect(statusLabel('failed')).toBe('Failed')
    expect(statusLabel('enqueue_failed')).toBe('Not queued')
  })
})

describe('isActive', () => {
  it('is true only while a job can still change', () => {
    expect(isActive('queued')).toBe(true)
    expect(isActive('processing')).toBe(true)
    expect(isActive('done')).toBe(false)
    expect(isActive('failed')).toBe(false)
    expect(isActive('enqueue_failed')).toBe(false)
  })
})