import React, { useEffect, useState } from 'react'
import { listReminders, addReminder, completeReminder, deleteReminder, reminderStatus } from '../lib/reminders.js'
import '../styles/reminders.css'

const RECUR = [
  { v: 'none', l: 'One-time' },
  { v: 'weekly', l: 'Weekly' },
  { v: 'monthly', l: 'Monthly' },
  { v: 'yearly', l: 'Yearly' },
]

function fmtDue(s) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function recurLabel(rem) {
  if (rem.recurrence === 'none') return null
  const n = rem.recurrence_interval || 1
  const unit = { weekly: 'wk', monthly: 'mo', yearly: 'yr' }[rem.recurrence]
  return n > 1 ? `every ${n} ${unit}` : { weekly: 'weekly', monthly: 'monthly', yearly: 'yearly' }[rem.recurrence]
}

// Self-fetching reminders panel for a vehicle. Shows this vehicle's reminders
// plus fleet-wide (vehicle_id null) ones. Degrades to a setup note if 0014
// hasn't been applied. Props: { vehicle, ownerId, refreshKey? }
export default function RemindersPanel({ vehicle, ownerId, refreshKey }) {
  const [rows, setRows] = useState([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [note, setNote] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await listReminders()
    if (error) {
      // 42P01 = undefined_table; anything select-breaking → show migration hint
      setMissing(true); setRows([])
    } else {
      setMissing(false); setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="spin" />

  if (missing) {
    return (
      <div className="note">
        Reminders need supabase/migrations/0014_reminders_notifications.sql — paste it in the SQL Editor, then reload.
      </div>
    )
  }

  const today = new Date()
  const mine = rows
    .filter(r => r.vehicle_id === vehicle.id || r.vehicle_id == null)
    .filter(r => showDone || !(r.completed_at && r.recurrence === 'none'))
    .map(r => ({ r, st: reminderStatus(r, today) }))
    .sort((a, b) => a.r.due_date < b.r.due_date ? -1 : a.r.due_date > b.r.due_date ? 1 : 0)

  const hiddenDone = rows.filter(r =>
    (r.vehicle_id === vehicle.id || r.vehicle_id == null) && r.completed_at && r.recurrence === 'none'
  ).length

  const done = async (rem) => {
    await completeReminder(rem)
    setNote(rem.recurrence === 'none' ? 'MARKED DONE' : 'ROLLED TO NEXT DATE')
    await load()
    setTimeout(() => setNote(null), 2400)
  }

  const remove = async (rem) => {
    if (!confirm(`Delete reminder "${rem.title}"?`)) return
    await deleteReminder(rem.id)
    await load()
  }

  return (
    <>
      {note && <div className="note" style={{ color: 'var(--amber)', marginBottom: 8 }}>{note}</div>}

      {mine.length === 0 && !adding && (
        <div className="empty" style={{ padding: '18px 0' }}>NO REMINDERS SET</div>
      )}

      {mine.map(({ r, st }) => (
        <div className="rmrow" key={r.id}>
          <div className={'dot ' + (st.status === 'done' ? 'ok' : st.status)} />
          <div className="rmmain">
            <div className="rmt">
              {r.title}
              {recurLabel(r) && <span className="rmrec">{recurLabel(r)}</span>}
              {r.vehicle_id == null && <span className="rmrec">fleet</span>}
            </div>
            <div className="rms">
              <DueLine r={r} st={st} />
              {r.notes && <><br />{r.notes}</>}
            </div>
          </div>
          <div className="rmactions">
            {st.status !== 'done' && <button className="btn-sm" onClick={() => done(r)}>✓ DONE</button>}
            <button className="btn-sm danger" onClick={() => remove(r)}>✕</button>
          </div>
        </div>
      ))}

      {hiddenDone > 0 && (
        <button className="rm-toggle" onClick={() => setShowDone(s => !s)}>
          {showDone ? '▾ hide completed' : `▸ show ${hiddenDone} completed`}
        </button>
      )}

      {adding ? (
        <ReminderForm vehicle={vehicle} ownerId={ownerId}
          onDone={async (saved) => { setAdding(false); if (saved) { setNote('REMINDER ADDED'); await load(); setTimeout(() => setNote(null), 2400) } }} />
      ) : (
        <button className="btn2" onClick={() => setAdding(true)} style={{ marginTop: 8 }}>+ ADD REMINDER</button>
      )}
    </>
  )
}

function DueLine({ r, st }) {
  if (st.status === 'done') return <span>Completed{r.completed_at ? ' · ' + fmtDue(r.completed_at.slice(0, 10)) : ''}</span>
  const due = `Due ${fmtDue(r.due_date)}`
  if (st.status === 'overdue') return <span className="warn">{due} · OVERDUE {Math.abs(st.daysLeft)} day{Math.abs(st.daysLeft) === 1 ? '' : 's'}</span>
  const tail = st.daysLeft === 0 ? 'today' : `in ${st.daysLeft} day${st.daysLeft === 1 ? '' : 's'}`
  return <span className={st.status === 'due-soon' ? 'soon' : ''}>{due} · {tail}</span>
}

function ReminderForm({ vehicle, ownerId, onDone }) {
  const [f, setF] = useState({
    title: '', due_date: '', remind_days_before: '14',
    recurrence: 'none', recurrence_interval: '1', notes: '', scope: 'vehicle',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    setBusy(true)
    const fields = {
      title: f.title.trim(),
      due_date: f.due_date,
      remind_days_before: f.remind_days_before ? parseInt(f.remind_days_before) : 14,
      recurrence: f.recurrence,
      recurrence_interval: f.recurrence !== 'none' && f.recurrence_interval ? Math.max(1, parseInt(f.recurrence_interval)) : 1,
      notes: f.notes.trim() || null,
      vehicle_id: f.scope === 'vehicle' ? vehicle.id : null,
    }
    const { error } = await addReminder(fields, ownerId)
    setBusy(false)
    if (error) { alert(error.message); return }
    onDone(true)
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="field">
        <label>Title</label>
        <input value={f.title} onChange={e => set('title', e.target.value)} placeholder="Registration renewal" />
      </div>
      <div className="frow">
        <div className="field">
          <label>Due Date</label>
          <input type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} />
        </div>
        <div className="field">
          <label>Remind Days Before</label>
          <input type="number" inputMode="numeric" value={f.remind_days_before} onChange={e => set('remind_days_before', e.target.value)} />
        </div>
      </div>
      <div className={f.recurrence !== 'none' ? 'frow' : ''}>
        <div className="field">
          <label>Repeats</label>
          <select value={f.recurrence} onChange={e => set('recurrence', e.target.value)}>
            {RECUR.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
        {f.recurrence !== 'none' && (
          <div className="field">
            <label>Every N {({ weekly: 'weeks', monthly: 'months', yearly: 'years' })[f.recurrence]}</label>
            <input type="number" inputMode="numeric" min="1" value={f.recurrence_interval} onChange={e => set('recurrence_interval', e.target.value)} />
          </div>
        )}
      </div>
      <div className="field">
        <label>Applies To</label>
        <div className="seg">
          <button className={f.scope === 'vehicle' ? 'on' : ''} onClick={() => set('scope', 'vehicle')}>This Vehicle</button>
          <button className={f.scope === 'fleet' ? 'on' : ''} onClick={() => set('scope', 'fleet')}>Whole Fleet</button>
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <button className="btn" onClick={save} disabled={busy || !f.title.trim() || !f.due_date}>{busy ? 'SAVING…' : 'SAVE REMINDER'}</button>
      <div style={{ height: 8 }} />
      <button className="btn2" onClick={() => onDone(false)}>CANCEL</button>
    </div>
  )
}
