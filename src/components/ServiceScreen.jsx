import React, { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { fmt } from '../lib/calc.js'

const COMMON_SERVICES = [
  'Oil Change', 'Tire Rotation', 'Engine Air Filter', 'Cabin Air Filter',
  'Brake Pads - Front', 'Brake Pads - Rear', 'Brake Fluid Flush',
  'Transmission Fluid', 'Differential Fluid', 'Transfer Case Fluid',
  'Coolant', 'Spark Plugs', 'Battery', 'Alignment', 'Inspection', 'Repair', 'Other',
]

export default function ServiceScreen({ vehicles, serviceLogs, maintItems, refresh, showToast }) {
  const [vid, setVid] = useState(vehicles[0]?.id)
  const [showForm, setShowForm] = useState(false)
  const vlogs = serviceLogs.filter(s => s.vehicle_id === vid)
  const vehicle = vehicles.find(v => v.id === vid)
  const totalSpend = vlogs.reduce((s, x) => s + Number(x.cost || 0), 0)

  return (
    <>
      <div className="vchips">
        {vehicles.map(v => (
          <button key={v.id} className={'vchip' + (v.id === vid ? ' on' : '')} onClick={() => setVid(v.id)}>
            {v.name}
          </button>
        ))}
      </div>

      {!showForm && (
        <button className="btn" onClick={() => setShowForm(true)} style={{ marginBottom: 16 }}>
          + LOG SERVICE
        </button>
      )}
      {showForm && (
        <ServiceForm vehicle={vehicle} maintItems={maintItems.filter(m => m.vehicle_id === vid)}
          onDone={async (saved) => { setShowForm(false); if (saved) { showToast('SERVICE LOGGED'); await refresh() } }} />
      )}

      <div className="statgrid">
        <div className="stat"><div className="sv">{vlogs.length}</div><div className="sl">Services</div></div>
        <div className="stat"><div className="sv">{fmt.money0(totalSpend)}</div><div className="sl">Total Spend</div></div>
      </div>

      <div className="section-label">Service History</div>
      {vlogs.length === 0 && <div className="empty">NO SERVICES LOGGED</div>}
      {vlogs.map(s => (
        <div className="logrow" key={s.id}>
          <div className="lmain">
            <div className="lt">{s.service_type}</div>
            <div className="ls">
              {s.serviced_at}{s.odometer ? ' · ' + fmt.num(s.odometer) + ' mi' : ''}
              {s.shop ? ' · ' + s.shop : ''}{s.parts ? ' · ' + s.parts : ''}
            </div>
            {s.notes && <div className="ls">{s.notes}</div>}
          </div>
          <div className="lnum">
            <div className="ln1">{s.cost ? fmt.money0(s.cost) : '—'}</div>
          </div>
        </div>
      ))}
    </>
  )
}

function ServiceForm({ vehicle, maintItems, onDone }) {
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ serviced_at: today, odometer: '', service_type: 'Oil Change', parts: '', cost: '', shop: 'DIY', notes: '' })
  const [updateMaint, setUpdateMaint] = useState(true)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  // find a maintenance item whose name loosely matches the service type
  const matchMaint = () => {
    const t = f.service_type.toLowerCase()
    return maintItems.find(m => {
      const n = m.name.toLowerCase()
      if (t === 'oil change') return n.includes('engine oil')
      if (t.includes('air filter') && t.includes('engine')) return n.includes('engine air') || n.includes('air filter')
      if (t.includes('cabin')) return n.includes('cabin')
      if (t.includes('tire rotation')) return n.includes('tire rotation')
      if (t.includes('brake fluid')) return n.includes('brake fluid')
      if (t.includes('transmission')) return n.includes('transmission')
      if (t.includes('differential')) return n.includes('differential') || n.includes('diff')
      if (t.includes('transfer')) return n.includes('transfer')
      if (t.includes('coolant')) return n.includes('coolant')
      if (t.includes('spark')) return n.includes('spark')
      return n === t
    })
  }
  const matched = matchMaint()

  const save = async () => {
    setBusy(true)
    const { error } = await supabase.from('service_logs').insert({
      vehicle_id: vehicle.id,
      serviced_at: f.serviced_at,
      odometer: f.odometer ? parseInt(f.odometer) : null,
      service_type: f.service_type,
      parts: f.parts || null,
      cost: f.cost ? parseFloat(f.cost) : null,
      shop: f.shop || null,
      notes: f.notes || null,
    })
    if (error) { setBusy(false); alert(error.message); return }

    // roll the maintenance baseline forward
    if (updateMaint && matched) {
      await supabase.from('maintenance_items').update({
        last_done_miles: f.odometer ? parseInt(f.odometer) : matched.last_done_miles,
        last_done_date: f.serviced_at,
      }).eq('id', matched.id)
    }
    setBusy(false)
    onDone(true)
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="field">
        <label>Service Type</label>
        <select value={f.service_type} onChange={e => set('service_type', e.target.value)}>
          {COMMON_SERVICES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="frow">
        <div className="field">
          <label>Date</label>
          <input type="date" value={f.serviced_at} onChange={e => set('serviced_at', e.target.value)} />
        </div>
        <div className="field">
          <label>Odometer</label>
          <input type="number" inputMode="numeric" value={f.odometer} onChange={e => set('odometer', e.target.value)} />
        </div>
      </div>
      <div className="frow">
        <div className="field">
          <label>Cost $</label>
          <input type="number" inputMode="decimal" value={f.cost} onChange={e => set('cost', e.target.value)} />
        </div>
        <div className="field">
          <label>Shop / DIY</label>
          <input value={f.shop} onChange={e => set('shop', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Parts / Part Numbers</label>
        <input value={f.parts} onChange={e => set('parts', e.target.value)} placeholder="04152-YZZA5 + 8qt 0W-20" />
      </div>
      <div className="field">
        <label>Notes</label>
        <input value={f.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      {matched && (
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', fontSize: 12, color: 'var(--amber)' }}>
            <input type="checkbox" checked={updateMaint} onChange={e => setUpdateMaint(e.target.checked)}
              style={{ width: 'auto' }} />
            Reset "{matched.name}" interval to this service
          </label>
        </div>
      )}
      <button className="btn" onClick={save} disabled={busy || !f.service_type}>{busy ? 'SAVING…' : 'SAVE SERVICE'}</button>
      <div style={{ height: 8 }} />
      <button className="btn2" onClick={() => onDone(false)}>CANCEL</button>
    </div>
  )
}
