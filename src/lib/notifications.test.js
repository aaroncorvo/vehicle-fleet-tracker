import { describe, it, expect } from 'vitest'
import { relativeTime, unreadCount } from './notifications.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const NOW = new Date('2026-07-22T12:00:00Z')
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString()
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H

describe('relativeTime — boundaries', () => {
  it('under a minute is "just now"', () => {
    expect(relativeTime(ago(0), NOW)).toBe('just now')
    expect(relativeTime(ago(59 * S), NOW)).toBe('just now')
  })

  it('60s flips to minutes', () => {
    expect(relativeTime(ago(60 * S), NOW)).toBe('1m')
    expect(relativeTime(ago(5 * M), NOW)).toBe('5m')
    expect(relativeTime(ago(59 * M), NOW)).toBe('59m')
  })

  it('60m flips to hours', () => {
    expect(relativeTime(ago(60 * M), NOW)).toBe('1h')
    expect(relativeTime(ago(3 * H), NOW)).toBe('3h')
    expect(relativeTime(ago(23 * H), NOW)).toBe('23h')
  })

  it('24h flips to days', () => {
    expect(relativeTime(ago(24 * H), NOW)).toBe('1d')
    expect(relativeTime(ago(2 * D), NOW)).toBe('2d')
    expect(relativeTime(ago(6 * D), NOW)).toBe('6d')
  })

  it('7d+ flips to an absolute month/day', () => {
    const d = new Date(NOW.getTime() - 7 * D)
    const expected = `${MONTHS[d.getMonth()]} ${d.getDate()}`
    expect(relativeTime(ago(7 * D), NOW)).toBe(expected)
    expect(relativeTime(ago(7 * D), NOW)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
  })

  it('accepts an epoch-ms `now` as well as a Date', () => {
    expect(relativeTime(ago(5 * M), NOW.getTime())).toBe('5m')
  })

  it('returns empty string for an unparseable timestamp', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('')
  })
})

describe('unreadCount', () => {
  it('counts rows with no read_at', () => {
    const rows = [
      { id: 1, read_at: null },
      { id: 2, read_at: '2026-07-22T00:00:00Z' },
      { id: 3, read_at: null },
      { id: 4 },
    ]
    expect(unreadCount(rows)).toBe(3)
  })

  it('is zero when all read', () => {
    expect(unreadCount([{ read_at: 'x' }, { read_at: 'y' }])).toBe(0)
  })

  it('handles empty / nullish input', () => {
    expect(unreadCount([])).toBe(0)
    expect(unreadCount(null)).toBe(0)
    expect(unreadCount(undefined)).toBe(0)
  })
})
