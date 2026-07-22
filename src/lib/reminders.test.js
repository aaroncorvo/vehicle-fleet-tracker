import { describe, it, expect } from 'vitest'
import { advanceDueDate, reminderStatus } from './reminders.js'

const r = (over = {}) => ({
  recurrence: 'none', recurrence_interval: 1, remind_days_before: 14,
  due_date: '2026-07-01', completed_at: null, ...over,
})

describe('advanceDueDate', () => {
  it('non-recurring returns the due_date unchanged', () => {
    expect(advanceDueDate(r({ recurrence: 'none', due_date: '2026-07-01' }))).toBe('2026-07-01')
  })

  it('weekly adds 7 × interval days', () => {
    const today = new Date(2026, 6, 1)
    expect(advanceDueDate(r({ recurrence: 'weekly', recurrence_interval: 1, due_date: '2026-07-01' }), today)).toBe('2026-07-08')
    expect(advanceDueDate(r({ recurrence: 'weekly', recurrence_interval: 2, due_date: '2026-07-01' }), today)).toBe('2026-07-15')
  })

  it('monthly advances by calendar month', () => {
    const today = new Date(2026, 2, 20) // 2026-03-20, just past the due date
    expect(advanceDueDate(r({ recurrence: 'monthly', due_date: '2026-03-15' }), today)).toBe('2026-04-15')
  })

  it('yearly advances by year', () => {
    const today = new Date(2026, 0, 1)
    expect(advanceDueDate(r({ recurrence: 'yearly', due_date: '2026-11-15' }), today)).toBe('2027-11-15')
  })

  it('clamps month-end: Jan 31 + 1 month → Feb 28 (non-leap)', () => {
    const today = new Date(2026, 0, 1)
    expect(advanceDueDate(r({ recurrence: 'monthly', due_date: '2026-01-31' }), today)).toBe('2026-02-28')
  })

  it('clamps month-end: Jan 31 + 1 month → Feb 29 (leap year)', () => {
    const today = new Date(2024, 0, 1)
    expect(advanceDueDate(r({ recurrence: 'monthly', due_date: '2024-01-31' }), today)).toBe('2024-02-29')
  })

  it('clamps yearly Feb 29 → Feb 28 on the next non-leap year', () => {
    const today = new Date(2024, 5, 1)
    expect(advanceDueDate(r({ recurrence: 'yearly', due_date: '2024-02-29' }), today)).toBe('2025-02-28')
  })

  it('keeps advancing past a long-overdue date until it is in the future', () => {
    const today = new Date(2026, 6, 22) // 2026-07-22
    // yearly registration last set in 2020 → next future occurrence is Nov 2026
    expect(advanceDueDate(r({ recurrence: 'yearly', due_date: '2020-11-15' }), today)).toBe('2026-11-15')
  })

  it('advances at least one interval even when due_date is already future', () => {
    const today = new Date(2026, 6, 1)
    expect(advanceDueDate(r({ recurrence: 'monthly', due_date: '2026-12-01' }), today)).toBe('2027-01-01')
  })
})

describe('reminderStatus', () => {
  const today = new Date(2026, 6, 22) // 2026-07-22

  it('done when completed_at is set, regardless of date', () => {
    const s = reminderStatus(r({ due_date: '2026-07-01', completed_at: '2026-07-02T00:00:00Z' }), today)
    expect(s.status).toBe('done')
  })

  it('overdue when due_date is before today', () => {
    const s = reminderStatus(r({ due_date: '2026-07-01' }), today)
    expect(s.status).toBe('overdue')
    expect(s.daysLeft).toBe(-21)
  })

  it('due-soon when within remind_days_before', () => {
    const s = reminderStatus(r({ due_date: '2026-08-01', remind_days_before: 14 }), today)
    expect(s.status).toBe('due-soon')
    expect(s.daysLeft).toBe(10)
  })

  it('ok when beyond remind_days_before', () => {
    const s = reminderStatus(r({ due_date: '2026-08-01', remind_days_before: 7 }), today)
    expect(s.status).toBe('ok')
    expect(s.daysLeft).toBe(10)
  })

  it('due today counts as due-soon (daysLeft 0)', () => {
    const s = reminderStatus(r({ due_date: '2026-07-22' }), today)
    expect(s.status).toBe('due-soon')
    expect(s.daysLeft).toBe(0)
  })

  it('exactly remind_days_before away is still due-soon (inclusive boundary)', () => {
    const s = reminderStatus(r({ due_date: '2026-08-05', remind_days_before: 14 }), today)
    expect(s.daysLeft).toBe(14)
    expect(s.status).toBe('due-soon')
  })
})
