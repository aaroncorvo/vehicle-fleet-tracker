import React, { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { currentOdometer, maintenanceStatus, fmt } from '../lib/calc.js'
import VehicleSelect from './VehicleSelect.jsx'

const ORDER = { overdue: 0, 'due-soon': 1, baseline: 2, ok: 3 }

export default function MaintenanceScreen({ vehicles, fuelLogs, serviceLogs, maintItems, vid, setVid, refresh, showToast }) {
  const [editItem, setEditItem] = useState(null)
  const [adding, setAdding] = useState(false)
  const vehicle = vehicles.find(v => v.id === vid)
  const odo = vehicle ? currentOdometer(vehicle, fuelLogs, serviceLogs) : 0

  const items = maintItems
    .filter(m => m.vehicle_id === vid)
    .map(m => ({ m, st: maintenanceStatus(m, odo) }))
    .sort((a, b) => (ORDER[a.st.status] - ORDER[b.st.status]) || a.m.name.localeCompare(b.m.name))

  const counts = { overdue: 0, 'due-soon': 0 }
  for (const { st } of items) if (counts[st.status] != null) counts[st.status]++

  return (
    <>
      <VehicleSelect vehicles={vehicles} vid={vid}
        setVid={id => { setVid(id); setEditItem(null) }} />

      <div className="statgrid">
        <div className="stat"><div className="sv">{fmt.num(odo)}</div><div className="sl">Current Odo</div></div>
        <div className="stat">
          <div className="sv" style={{ color: counts.overdue ? 'var(--red)' : 'var(--green)' }}>
            {counts.overdue}
          </div>
          <div className="sl">Overdue</div>
        </div>
      </div>

      {(editItem || adding) ? (
        <MaintForm item={editItem} vehicleId={vid} ownerId={vehicle?.user_id} currentOdo={odo}
          onDone={async (saved) => {
            setEditItem(null); setAdding(false)
            if (saved) { showToast('SAVED'); await refresh() }
          }} />
      ) : (
        <button className="btn2" onClick={() => setAdding(true)} style={{ marginBottom: 8 }}>+ ADD ITEM</button>
      )}

      <div className="section-label">Intervals — {vehicle?.name}</div>
      {items.map(({ m, st }) => (
        <div className="mrow" key={m.id} onClick={() => { setAdding(false); setEditItem(m) }} style={{ cursor: 'pointer' }}>
          <div className={'dot ' + st.status} />
          <div className="mmain">
            <div className="mt">{m.name}</div>
            <div className="ms">
              <StatusLine m={m} st={st} />
              {m.part_number && <><br />PN {m.part_number}</>}
              {m.notes && <><br />{m.notes}</>}
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

function StatusLine({ m, st }) {
  if (st.status === 'baseline') {
    return <span>No baseline — tap to set last-done{m.interval_miles ? ` (every ${m.interval_miles.toLocaleString()} mi${m.interval_months ? ` / ${m.interval_months} mo` : ''})` : m.interval_months ? ` (every ${m.interval_months} mo)` : ''}</span>
  }
  const parts = []
  if (st.remainMiles != null) {
    const cls = st.remainMiles <= 0 ? 'warn' : st.remainMiles <= 1000 ? 'soon' : ''
    parts.push(<span key="mi" className={cls}>
      {st.remainMiles <= 0
        ? `OVERDUE ${Math.abs(st.remainMiles).toLocaleString()} mi`
        : `${st.remainMiles.toLocaleString()} mi remaining`}
      {' '}(due {st.dueMiles.toLocaleString()})
    </span>)
  }
  if (st.remainDays != null) {
    const cls = st.remainDays <= 0 ? 'warn' : st.remainDays <= 30 ? 'soon' : ''
    parts.push(<span key="dt" className={cls}>
      {parts.length > 0 && ' · '}
      {st.remainDays <= 0 ? `OVERDUE ${Math.abs(st.remainDays)} days` : `${st.remainDays} days remaining`}
    </span>)
  }
  if (parts.length === 0) parts.push(<span key="x">Tracked</span>)
  return <>{parts}</>
}

function MaintForm({ item, vehicleId, ownerId, currentOdo, onDone }) {
  const [f, setF] = useState({
    name: item?.name || '',
    interval_miles: item?.interval_miles ?? '',
    interval_months: item?.interval_months ?? '',
    last_done_miles: item?.last_done_miles ?? '',
    last_done_date: item?.last_done_date ?? '',
    part_number: item?.part_number ?? '',
    notes: item?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    setBusy(true)
    const payload = {
      name: f.name,
      interval_miles: f.interval_miles ? parseInt(f.interval_miles) : null,
      interval_months: f.interval_months ? parseInt(f.interval_months) : null,
      last_done_miles: f.last_done_miles !== '' ? parseInt(f.last_done_miles) : null,
      last_done_date: f.last_done_date || null,
      part_number: f.part_number || null,
      notes: f.notes || null,
    }
    let error
    if (item) ({ error } = await supabase.from('maintenance_items').update(payload).eq('id', item.id))
    else ({ error } = await supabase.from('maintenance_items').insert({ ...payload, vehicle_id: vehicleId, user_id: ownerId }))
    setBusy(false)
    if (error) { alert(error.message); return }
    onDone(true)
  }

  const markDoneNow = () => {
    set('last_done_miles', String(currentOdo))
    set('last_done_date', new Date().toISOString().slice(0, 10))
  }

  const del = async () => {
    if (!confirm('Delete this maintenance item?')) return
    await supabase.from('maintenance_items').delete().eq('id', item.id)
    onDone(true)
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="field">
        <label>Item Name</label>
        <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Transfer Case Fluid" />
      </div>
      <div className="frow">
        <div className="field">
          <label>Interval (miles)</label>
          <input type="number" inputMode="numeric" value={f.interval_miles} onChange={e => set('interval_miles', e.target.value)} />
        </div>
        <div className="field">
          <label>Interval (months)</label>
          <input type="number" inputMode="numeric" value={f.interval_months} onChange={e => set('interval_months', e.target.value)} />
        </div>
      </div>
      <div className="frow">
        <div className="field">
          <label>Last Done (miles)</label>
          <input type="number" inputMode="numeric" value={f.last_done_miles} onChange={e => set('last_done_miles', e.target.value)} />
        </div>
        <div className="field">
          <label>Last Done (date)</label>
          <input type="date" value={f.last_done_date} onChange={e => set('last_done_date', e.target.value)} />
        </div>
      </div>
      <button className="btn-sm" onClick={markDoneNow} style={{ marginBottom: 12 }}>
        MARK DONE TODAY @ {currentOdo.toLocaleString()} MI
      </button>
      <div className="field">
        <label>Part Number</label>
        <input value={f.part_number} onChange={e => set('part_number', e.target.value)} />
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <button className="btn" onClick={save} disabled={busy || !f.name}>{busy ? 'SAVING…' : 'SAVE'}</button>
      <div style={{ height: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn2" style={{ flex: 1 }} onClick={() => onDone(false)}>CANCEL</button>
        {item && <button className="btn2" style={{ flex: 1, borderColor: 'rgba(255,77,77,0.4)', color: 'var(--red)' }} onClick={del}>DELETE</button>}
      </div>
    </div>
  )
}
