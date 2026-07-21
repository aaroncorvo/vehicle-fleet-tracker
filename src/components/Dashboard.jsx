import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { fuelStats, currentOdometer, maintenanceStatus, fmt } from '../lib/calc.js'
import { photoUrls, primaryPhoto } from '../lib/vehiclePhotos.js'
import { decodeVin } from '../lib/vin.js'

export default function Dashboard({ vehicles, fuelLogs, serviceLogs, maintItems, photos, recalls, setVid, refresh, showToast, goTab }) {
  const [thumbs, setThumbs] = useState({})
  const [addOpen, setAddOpen] = useState(false)

  // one signed-URL batch for the dashboard thumbnails
  const primaries = vehicles.map(v => primaryPhoto(photos || [], v.id)).filter(Boolean)
  useEffect(() => {
    let live = true
    photoUrls(primaries).then(m => { if (live) setThumbs(m) }).catch(() => {})
    return () => { live = false }
  }, [photos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fleet-level totals
  let fleetFuel = 0, fleetSvc = 0
  for (const l of fuelLogs) fleetFuel += Number(l.total_cost || 0)
  for (const s of serviceLogs) fleetSvc += Number(s.cost || 0)

  return (
    <>
      <div className="statgrid">
        <div className="stat"><div className="sv">{fmt.money0(fleetFuel)}</div><div className="sl">Fuel Spend</div></div>
        <div className="stat"><div className="sv">{fmt.money0(fleetSvc)}</div><div className="sl">Service Spend</div></div>
      </div>

      <div className="section-label">Vehicles</div>
      {vehicles.map(v => {
        const p = primaryPhoto(photos || [], v.id)
        const openRecalls = (recalls || []).filter(r => r.vehicle_id === v.id && r.status === 'open').length
        return <VehicleCard key={v.id} v={v} thumb={p ? thumbs[p.file_path] : null} openRecalls={openRecalls}
          fuelLogs={fuelLogs} serviceLogs={serviceLogs} maintItems={maintItems}
          onOpen={() => { setVid(v.id); goTab('Profile') }} />
      })}

      {addOpen ? (
        <AddVehicleForm ownerId={vehicles[0]?.user_id} nextSort={vehicles.length + 1}
          onDone={async (saved) => { setAddOpen(false); if (saved) { showToast('VEHICLE ADDED'); await refresh() } }} />
      ) : (
        <button className="btn2" onClick={() => setAddOpen(true)}>+ ADD VEHICLE BY VIN</button>
      )}
    </>
  )
}

function AddVehicleForm({ ownerId, nextSort, onDone }) {
  const [vin, setVin] = useState('')
  const [decoded, setDecoded] = useState(null)
  const [f, setF] = useState({ name: '', nickname: '', base_odometer: '', fuel_octane: '87 Regular' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const decode = async () => {
    setBusy(true)
    try {
      const d = await decodeVin(vin.trim().toUpperCase())
      setDecoded(d)
      if (!f.name) set('name', (d.model || '').replace(/\s+/g, ''))
    } catch (e) { alert('Decode failed: ' + e.message) }
    setBusy(false)
  }

  const save = async () => {
    setBusy(true)
    const s = decoded.specs || {}
    const engine = [s['Engine'], s['Displacement (L)'] ? s['Displacement (L)'] + 'L' : null].filter(Boolean).join(' ')
    const { error } = await supabase.from('vehicles').insert({
      ...(ownerId ? { user_id: ownerId } : {}),
      name: f.name, nickname: f.nickname || null,
      year: decoded.year, make: decoded.make, model: decoded.model,
      vin: vin.trim().toUpperCase(), engine: engine || null,
      base_odometer: f.base_odometer ? parseInt(f.base_odometer) : 0,
      fuel_octane: f.fuel_octane || null, sort_order: nextSort,
      vin_decode: decoded,
    })
    setBusy(false)
    if (error) { alert(error.message); return }
    onDone(true)
  }

  return (
    <div className="card">
      <div className="field">
        <label>VIN</label>
        <input value={vin} onChange={e => setVin(e.target.value)} placeholder="17-character VIN"
          maxLength={17} style={{ textTransform: 'uppercase' }} />
      </div>
      {!decoded ? (
        <button className="btn" onClick={decode} disabled={busy || vin.trim().length < 11}>
          {busy ? 'DECODING…' : '⌕ DECODE VIN'}
        </button>
      ) : (
        <>
          <div className="note" style={{ margin: '4px 0 12px', color: 'var(--green)' }}>
            ✓ {decoded.year} {decoded.make} {decoded.model}
            {decoded.specs['Engine'] ? ` · ${decoded.specs['Engine']}` : ''} — {Object.keys(decoded.specs).length} specs pulled
          </div>
          <div className="frow">
            <div className="field">
              <label>Display Name</label>
              <input value={f.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="field">
              <label>Nickname</label>
              <input value={f.nickname} onChange={e => set('nickname', e.target.value)} />
            </div>
          </div>
          <div className="frow">
            <div className="field">
              <label>Current Odometer</label>
              <input type="number" inputMode="numeric" value={f.base_odometer} onChange={e => set('base_odometer', e.target.value)} />
            </div>
            <div className="field">
              <label>Fuel Octane</label>
              <input value={f.fuel_octane} onChange={e => set('fuel_octane', e.target.value)} />
            </div>
          </div>
          <button className="btn" onClick={save} disabled={busy || !f.name}>{busy ? 'SAVING…' : 'ADD VEHICLE'}</button>
        </>
      )}
      <div style={{ height: 8 }} />
      <button className="btn2" onClick={() => onDone(false)}>CANCEL</button>
    </div>
  )
}

function VehicleCard({ v, thumb, openRecalls, fuelLogs, serviceLogs, maintItems, onOpen }) {
  const fs = fuelStats(fuelLogs, v.id)
  const odo = currentOdometer(v, fuelLogs, serviceLogs)
  const items = maintItems.filter(m => m.vehicle_id === v.id)
  const flagged = items
    .map(m => ({ m, st: maintenanceStatus(m, odo) }))
    .filter(x => x.st.status === 'overdue' || x.st.status === 'due-soon')
    .sort((a, b) => (a.st.status === 'overdue' ? 0 : 1) - (b.st.status === 'overdue' ? 0 : 1))

  const annualFuel = (fs?.milesPerYear && fs?.costPerMile) ? fs.milesPerYear * fs.costPerMile : null

  return (
    <div className="card vcard" onClick={onOpen}>
      {thumb && (
        <img src={thumb} alt={v.name} style={{
          float: 'right', width: 56, height: 56, objectFit: 'cover',
          borderRadius: 3, border: '1px solid var(--line-bright)', marginLeft: 10,
        }} />
      )}
      <div className="vname">
        <b>{v.name}</b>
        {v.nickname && <span className="nick">"{v.nickname}"</span>}
      </div>
      <div className="vmeta">{v.year} {v.make} {v.model} · {v.engine}</div>
      <div className="gauges">
        <div className="gauge">
          <div className="gv">{fmt.num(odo)}</div>
          <div className="gl">Odometer</div>
        </div>
        <div className="gauge">
          <div className="gv amber">{fmt.mpg(fs?.aggMpg)}</div>
          <div className="gl">Avg MPG</div>
        </div>
        <div className="gauge">
          <div className="gv">{fmt.cpm(fs?.costPerMile)}</div>
          <div className="gl">Fuel $/mi</div>
        </div>
        <div className="gauge">
          <div className="gv">{annualFuel ? fmt.money0(annualFuel) : '—'}</div>
          <div className="gl">Fuel /yr est</div>
        </div>
      </div>
      {(flagged.length > 0 || openRecalls > 0) && (
        <div className="flagrow">
          {openRecalls > 0 && (
            <span className="flag overdue">⚠ {openRecalls} OPEN RECALL{openRecalls > 1 ? 'S' : ''}</span>
          )}
          {flagged.slice(0, 4).map(({ m, st }) => (
            <span key={m.id} className={'flag ' + st.status}>
              {st.status === 'overdue' ? '● ' : '◐ '}{m.name}
            </span>
          ))}
          {flagged.length > 4 && <span className="flag due-soon">+{flagged.length - 4} more</span>}
        </div>
      )}
    </div>
  )
}
