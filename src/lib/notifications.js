import { supabase } from './supabase.js'

// In-app notification inbox (migration 0014). The table may not exist yet in a
// given deployment, so every network call degrades gracefully: reads surface the
// error for the caller to hide the UI, writes swallow it entirely.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Pure: compact relative time. "just now" | "5m" | "3h" | "2d" | "Jun 30".
// `now` accepts a Date or an epoch-ms number (defaults to now).
export function relativeTime(iso, now = Date.now()) {
  const t = new Date(iso).getTime()
  const n = now instanceof Date ? now.getTime() : now
  if (!Number.isFinite(t)) return ''
  const sec = Math.floor((n - t) / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  const d = new Date(t)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

// Pure: count rows without a read_at timestamp.
export function unreadCount(rows) {
  return (rows || []).reduce((c, r) => c + (r && !r.read_at ? 1 : 0), 0)
}

// Newest first. Returns { data, error } — a non-null error means the table is
// missing (or unreachable), which the bell uses to hide itself.
export async function fetchNotifications(limit = 30) {
  if (!supabase) return { data: [], error: null }
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data: data || [], error }
}

// Mark every unread row read. Swallows errors (table may be missing).
export async function markAllRead() {
  if (!supabase) return { error: null }
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
    return { error }
  } catch (error) {
    return { error }
  }
}

// Insert a notification, deduped on dedupe_key. ignoreDuplicates so re-runs are
// no-ops; errors swallowed entirely so callers (e.g. the recall sweep) never break.
export async function pushNotification({ ownerId, vehicleId, kind, dedupeKey, message }) {
  if (!supabase) return
  try {
    await supabase.from('notifications').upsert(
      {
        user_id: ownerId,
        vehicle_id: vehicleId ?? null,
        kind,
        dedupe_key: dedupeKey,
        message,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true }
    )
  } catch { /* table may not exist yet — never surface */ }
}
