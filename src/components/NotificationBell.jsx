import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { fetchNotifications, unreadCount, markAllRead, relativeTime } from '../lib/notifications.js'
import '../styles/notifications.css'

// Kind -> glyph + label. Falls back to 'system' for anything unmapped.
const KIND = {
  recall:      { icon: '⚠', label: 'RECALL' },
  maintenance: { icon: '🔧', label: 'MAINTENANCE' },
  reminder:    { icon: '⏰', label: 'REMINDER' },
  document:    { icon: '📄', label: 'DOCUMENT' },
  system:      { icon: '///', label: 'SYSTEM' },
}

const POLL_MS = 90_000
const READ_DELAY_MS = 1_500

// "What happened since I last looked." A header bell + a full-screen inbox sheet.
// Renders nothing at all if the notifications table is missing (fetch errors),
// so the feature is invisible until migration 0014 is applied.
export default function NotificationBell({ vehicles }) {
  const [rows, setRows] = useState([])
  const [missing, setMissing] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await fetchNotifications(30)
    if (error) { setMissing(true); return }
    setMissing(false)
    setRows(data)
  }, [])

  // Fetch on mount + every 90s; clear the interval on unmount.
  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  // On open, after a beat, mark everything read (locally + server).
  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      const now = new Date().toISOString()
      setRows(rs => rs.map(r => (r.read_at ? r : { ...r, read_at: now })))
      await markAllRead()
    }, READ_DELAY_MS)
    return () => clearTimeout(t)
  }, [open])

  if (missing) return null

  const unread = unreadCount(rows)

  return (
    <>
      <button className="nbell" onClick={() => setOpen(true)} aria-label="Notifications">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8.5a6 6 0 0 0-12 0c0 6-2.4 7.5-2.4 7.5h16.8S18 14.5 18 8.5Z" />
          <path d="M10.2 20a2 2 0 0 0 3.6 0" />
        </svg>
        {unread > 0 && <span className="nbadge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && <NotificationSheet rows={rows} vehicles={vehicles} onClose={() => setOpen(false)} />}
    </>
  )
}

function NotificationSheet({ rows, vehicles, onClose }) {
  const vname = (id) => {
    const v = (vehicles || []).find(x => x.id === id)
    return v ? (v.nickname || v.name) : null
  }

  const sheet = (
    <div className="nbsheet" role="dialog" aria-label="Notifications">
      <div className="nbsheet-head">
        <div>
          <div className="nbsheet-title">INBOX</div>
          <div className="nbsheet-sub">What happened since you last looked</div>
        </div>
        <button className="nbclose" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {rows.length === 0 ? (
        <div className="nbempty">Nothing new. You're caught up.</div>
      ) : rows.map(n => {
        const k = KIND[n.kind] || KIND.system
        const vn = vname(n.vehicle_id)
        return (
          <div key={n.id} className={'nbitem' + (n.read_at ? '' : ' unread')}>
            <div className="nbicon">{k.icon}</div>
            <div className="nbmain">
              <div className="nbtop">
                <span className="nbkind">{k.label}</span>
                {vn && <span className="nbveh">{vn}</span>}
                <span className="nbtime">{relativeTime(n.created_at)}</span>
              </div>
              <div className="nbmsg">{n.message}</div>
            </div>
          </div>
        )
      })}
    </div>
  )

  // Portal to body so the fixed sheet escapes the header's stacking context.
  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet
}
