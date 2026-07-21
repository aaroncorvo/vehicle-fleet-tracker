import React, { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { computeMpg, fuelStats, fmt } from '../lib/calc.js'
import VehicleSelect from './VehicleSelect.jsx'

export default function FuelScreen({ vehicles, fuelLogs, vid, setVid, refresh, showToast }) {
  const [showForm, setShowForm] = useState(false)
  const mpgMap = useMemo(() => computeMpg(fuelLogs), [fuelLogs])
  const vlogs = fuelLogs.filter(l => l.vehicle_id === vid).sort((a, b) => b.odometer - a.odometer)
  const fs = fuelStats(fuelLogs, vid)
  const vehicle = vehicles.find(v => v.id === vid)

  return (
    <>
      <VehicleSelect vehicles={vehicles} vid={vid} setVid={setVid} />

      {!showForm && (
        <button className="btn" onClick={() => setShowForm(true)} style={{ marginBottom: 16 }}>
          + LOG FILL-UP
        </button>
      )}
      {showForm && (
        <FuelForm vehicle={vehicle} lastOdo={vlogs[0]?.odometer}
          onDone={async (saved) => { setShowForm(false); if (saved) { showToast('FILL LOGGED'); await refresh() } }} />
      )}

      {fs && (
        <div className="statgrid">
          <div className="stat"><div className="sv">{fmt.mpg(fs.aggMpg)}</div><div className="sl">Aggregate MPG</div></div>
          <div className="stat"><div className="sv">{fmt.money(fs.avgCpg)}</div><div className="sl">Avg $/Gal</div></div>
          <div className="stat"><div className="sv">{fmt.cpm(fs.costPerMile)}</div><div className="sl">Fuel Cost/Mi</div></div>
          <div className="stat"><div className="sv">{fmt.money0(fs.totalSpend)}</div><div className="sl">Total Spend</div></div>
        </div>
      )}

      <div className="section-label">Fill History</div>
      {vlogs.length === 0 && <div className="empty">NO FILLS LOGGED</div>}
      {vlogs.map(l => {
        const c = mpgMap.get(l.id)
        return (
          <div className="logrow" key={l.id}>
            <div className="lmain">
              <div className="lt">{fmt.num(l.odometer)} mi
                {l.fill_type !== 'full' && <span style={{ color: 'var(--text-faint)', fontSize: 12 }}> · {l.fill_type.toUpperCase()}</span>}
              </div>
              <div className="ls">
                {l.filled_at}{l.brand ? ' · ' + l.brand : ''}{l.total_cost ? ' · ' + fmt.money(l.total_cost) : ''}
                {' · '}{fmt.gal(l.gallons)} gal{l.cost_per_gallon ? ' @ ' + fmt.money(l.cost_per_gallon) : ''}
              </div>
            </div>
            <div className="lnum">
              <div className="ln1">{c?.mpg ? c.mpg.toFixed(1) : '—'}</div>
              <div className="ln2">MPG{c?.miles ? ' · ' + c.miles + ' mi' : ''}</div>
            </div>
          </div>
        )
      })}
    </>
  )
}

function FuelForm({ vehicle, lastOdo, onDone }) {
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({
    filled_at: today, odometer: '', fill_type: 'full',
    gallons: '', cost_per_gallon: '', total_cost: '',
    octane: vehicle?.fuel_octane || '', brand: '', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  // auto-derive: any two of (gallons, $/gal, total) fill the third
  const autoTotal = () => {
    const g = parseFloat(f.gallons), c = parseFloat(f.cost_per_gallon), t = parseFloat(f.total_cost)
    if (g && c && !t) set('total_cost', (g * c).toFixed(2))
    else if (g && t && !c) set('cost_per_gallon', (t / g).toFixed(3))
    else if (c && t && !g) set('gallons', (t / c).toFixed(3))
  }

  const save = async () => {
    setBusy(true)
    const { error } = await supabase.from('fuel_logs').insert({
      vehicle_id: vehicle.id,
      user_id: vehicle.user_id,   // fleet owner, so shared members write to the same fleet
      filled_at: f.filled_at,
      odometer: parseInt(f.odometer),
      fill_type: f.fill_type,
      gallons: parseFloat(f.gallons),
      cost_per_gallon: f.cost_per_gallon ? parseFloat(f.cost_per_gallon) : null,
      total_cost: f.total_cost ? parseFloat(f.total_cost) : null,
      octane: f.octane || null,
      brand: f.brand || null,
      notes: f.notes || null,
    })
    setBusy(false)
    if (error) { alert(error.message); return }
    onDone(true)
  }

  const valid = f.odometer && f.gallons && parseInt(f.odometer) > 0
  const odoWarn = lastOdo && f.odometer && parseInt(f.odometer) <= lastOdo && f.fill_type !== 'reset'

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="frow">
        <div className="field">
          <label>Odometer {lastOdo ? `(last ${lastOdo.toLocaleString()})` : ''}</label>
          <input type="number" inputMode="numeric" value={f.odometer} onChange={e => set('odometer', e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Gallons</label>
          <input type="number" inputMode="decimal" step="0.001" value={f.gallons}
            onChange={e => set('gallons', e.target.value)} onBlur={autoTotal} />
        </div>
      </div>
      {odoWarn && <div className="note" style={{ color: 'var(--red)', marginBottom: 10 }}>
        ⚠ Odometer ≤ last logged reading — double-check.
      </div>}
      <div className="frow">
        <div className="field">
          <label>$/Gallon</label>
          <input type="number" inputMode="decimal" step="0.001" value={f.cost_per_gallon}
            onChange={e => set('cost_per_gallon', e.target.value)} onBlur={autoTotal} />
        </div>
        <div className="field">
          <label>Total $</label>
          <input type="number" inputMode="decimal" step="0.01" value={f.total_cost}
            onChange={e => set('total_cost', e.target.value)} onBlur={autoTotal} />
        </div>
      </div>
      <div className="field">
        <label>Fill Type</label>
        <div className="seg">
          {['full', 'partial', 'reset'].map(t => (
            <button key={t} className={f.fill_type === t ? 'on' : ''} onClick={() => set('fill_type', t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="frow">
        <div className="field">
          <label>Date</label>
          <input type="date" value={f.filled_at} onChange={e => set('filled_at', e.target.value)} />
        </div>
        <div className="field">
          <label>Brand</label>
          <input value={f.brand} onChange={e => set('brand', e.target.value)} placeholder="QuikTrip" />
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <input value={f.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <button className="btn" onClick={save} disabled={!valid || busy}>{busy ? 'SAVING…' : 'SAVE FILL'}</button>
      <div style={{ height: 8 }} />
      <button className="btn2" onClick={() => onDone(false)}>CANCEL</button>
    </div>
  )
}
