import React, { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'
import { computeMpg, fuelStats, maintenanceStatus, fmt } from '../lib/calc.js'
import VehicleSelect from './VehicleSelect.jsx'
import MpgChart from './MpgChart.jsx'

export default function FuelScreen({ vehicles, fuelLogs, maintItems, vid, setVid, refresh, showToast }) {
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
          maintItems={(maintItems || []).filter(m => m.vehicle_id === vid)}
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

      <div className="section-label">MPG Trend</div>
      <div className="card">
        <MpgChart points={
          [...vlogs].sort((a, b) => a.odometer - b.odometer)
            .map(l => ({ odometer: l.odometer, mpg: mpgMap.get(l.id)?.mpg, date: l.filled_at }))
            .filter(p => p.mpg != null)
        } />
      </div>

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
                {l.tire_psi && <><br />PSI {['fl', 'fr', 'rl', 'rr'].map(k => l.tire_psi[k] ?? '—').join(' / ')}</>}
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

function FuelForm({ vehicle, lastOdo, maintItems, onDone }) {
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({
    filled_at: today, odometer: '', fill_type: 'full',
    gallons: '', cost_per_gallon: '', total_cost: '',
    octane: vehicle?.fuel_octane || '', brand: '', notes: '',
  })
  const [psi, setPsi] = useState({ fl: '', fr: '', rl: '', rr: '' })
  const [showPsi, setShowPsi] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  // live "what's coming due" at the odometer being entered
  const odoNum = parseInt(f.odometer)
  const upcoming = odoNum > 0 ? maintItems
    .map(m => ({ m, st: maintenanceStatus(m, odoNum) }))
    .filter(x => x.st.status === 'overdue' || x.st.status === 'due-soon')
    .sort((a, b) => (a.st.status === 'overdue' ? 0 : 1) - (b.st.status === 'overdue' ? 0 : 1))
    : []

  // auto-derive: any two of (gallons, $/gal, total) fill the third
  const autoTotal = () => {
    const g = parseFloat(f.gallons), c = parseFloat(f.cost_per_gallon), t = parseFloat(f.total_cost)
    if (g && c && !t) set('total_cost', (g * c).toFixed(2))
    else if (g && t && !c) set('cost_per_gallon', (t / g).toFixed(3))
    else if (c && t && !g) set('gallons', (t / c).toFixed(3))
  }

  const save = async () => {
    setBusy(true)
    const psiVals = Object.fromEntries(Object.entries(psi).filter(([, v]) => v !== '').map(([k, v]) => [k, parseFloat(v)]))
    const { error } = await supabase.from('fuel_logs').insert({
      vehicle_id: vehicle.id,
      user_id: vehicle.user_id,   // fleet owner, so shared members write to the same fleet
      tire_psi: Object.keys(psiVals).length ? psiVals : null,
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
      {upcoming.length > 0 && (
        <div className="card" style={{ background: 'rgba(255,176,0,0.05)', borderColor: 'rgba(255,176,0,0.3)', padding: 12, marginBottom: 12 }}>
          <div className="gl" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 6 }}>
            At {odoNum.toLocaleString()} mi — coming due
          </div>
          {upcoming.slice(0, 5).map(({ m, st }) => (
            <div key={m.id} className="ms" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.7 }}>
              <span className={st.status === 'overdue' ? 'warn' : 'soon'} style={{ color: st.status === 'overdue' ? 'var(--red)' : 'var(--amber-hi)' }}>
                {st.status === 'overdue' ? '● ' : '◐ '}{m.name}
              </span>
              {' — '}
              {st.remainMiles != null && (st.remainMiles <= 0 ? `${Math.abs(st.remainMiles).toLocaleString()} mi overdue` : `${st.remainMiles.toLocaleString()} mi left`)}
              {st.remainMiles != null && st.remainDays != null && ' · '}
              {st.remainDays != null && (st.remainDays <= 0 ? `${Math.abs(st.remainDays)} days overdue` : `${st.remainDays} days left`)}
            </div>
          ))}
        </div>
      )}
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
      {!showPsi ? (
        <button className="btn-sm" onClick={() => setShowPsi(true)} style={{ marginBottom: 12 }}>+ TIRE PSI</button>
      ) : (
        <div className="field">
          <label>Tire PSI — FL / FR / RL / RR</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {['fl', 'fr', 'rl', 'rr'].map(k => (
              <input key={k} type="number" inputMode="decimal" placeholder={k.toUpperCase()}
                value={psi[k]} onChange={e => setPsi(p => ({ ...p, [k]: e.target.value }))}
                style={{ textAlign: 'center', padding: '10px 4px' }} />
            ))}
          </div>
        </div>
      )}
      <button className="btn" onClick={save} disabled={!valid || busy}>{busy ? 'SAVING…' : 'SAVE FILL'}</button>
      <div style={{ height: 8 }} />
      <button className="btn2" onClick={() => onDone(false)}>CANCEL</button>
    </div>
  )
}
