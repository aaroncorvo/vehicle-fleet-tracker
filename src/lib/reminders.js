import { supabase } from './supabase.js'

const DAY = 86400000

// ===== date helpers (all local-midnight, no timezone drift) =====
// Reminder dates are stored as `date` ('YYYY-MM-DD'); parse to LOCAL midnight
// so calendar math matches what the user typed regardless of UTC offset.
function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, m - 1, d)
}
function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function midnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
// Add n calendar months, clamping the day to the target month's last day so
// Jan 31 + 1mo → Feb 28/29 (never rolls into March). Years reuse this (×12),
// which also clamps Feb 29 → Feb 28 on non-leap years.
function addMonths(date, n) {
  const day = date.getDate()
  const first = new Date(date.getFullYear(), date.getMonth() + n, 1)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  first.setDate(Math.min(day, daysInMonth))
  return first
}

// ===== pure logic (tested) =====

// Next due date string after COMPLETING a recurring reminder. Advances by
// recurrence_interval × unit; if the result is still in the past (user knocked
// out something long overdue), keeps advancing until it lands in the future.
// Non-recurring reminders have no next date — returns due_date unchanged.
export function advanceDueDate(reminder, today = new Date()) {
  if (!reminder || reminder.recurrence === 'none' || !reminder.recurrence) return reminder?.due_date
  const interval = Math.max(1, reminder.recurrence_interval || 1)
  const step = (date) => {
    switch (reminder.recurrence) {
      case 'weekly': { const d = new Date(date); d.setDate(d.getDate() + 7 * interval); return d }
      case 'monthly': return addMonths(date, interval)
      case 'yearly': return addMonths(date, 12 * interval)
      default: return date
    }
  }
  const t = midnight(today)
  let d = parseDate(reminder.due_date)
  do { d = step(d) } while (d < t)
  return fmtDate(d)
}

// { status: 'done'|'overdue'|'due-soon'|'ok', daysLeft }
// done: completed_at set (only non-recurring reminders ever set it — recurring
// ones roll due_date forward instead). overdue: due before today. due-soon:
// within remind_days_before of today. ok: further out.
export function reminderStatus(reminder, today = new Date()) {
  if (reminder.completed_at) return { status: 'done', daysLeft: null }
  const t = midnight(today)
  const due = parseDate(reminder.due_date)
  const daysLeft = Math.round((due - t) / DAY)
  const window = reminder.remind_days_before ?? 14
  let status
  if (daysLeft < 0) status = 'overdue'
  else if (daysLeft <= window) status = 'due-soon'
  else status = 'ok'
  return { status, daysLeft }
}

// ===== supabase helpers =====
// All return the raw { data, error } so callers can branch on a missing table
// (0014 may not be applied yet) vs. real failures.
export async function listReminders() {
  return await supabase.from('reminders').select('*').order('due_date', { ascending: true })
}

// user_id carries the FLEET OWNER's id (vehicle.user_id) so member writes land
// on the shared fleet — the same ownership pattern used across the app.
export async function addReminder(fields, ownerId) {
  return await supabase.from('reminders').insert({ ...fields, user_id: ownerId })
}

// Non-recurring: mark done. Recurring: roll due_date to the next occurrence.
export async function completeReminder(reminder) {
  if (reminder.recurrence === 'none' || !reminder.recurrence) {
    return await supabase.from('reminders')
      .update({ completed_at: new Date().toISOString() }).eq('id', reminder.id)
  }
  return await supabase.from('reminders')
    .update({ due_date: advanceDueDate(reminder) }).eq('id', reminder.id)
}

export async function deleteReminder(id) {
  return await supabase.from('reminders').delete().eq('id', id)
}
