import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { fuelStats, currentOdometer, fmt } from '../lib/calc.js'
import { uploadVehiclePhoto, deleteVehiclePhoto, setPrimaryPhoto, photoUrls } from '../lib/vehiclePhotos.js'

export default function VehicleDetail({ vehicle, fuelLogs, serviceLogs, photos, photosError, refresh, showToast, onBack }) {
  const vphotos = photos.filter(p => p.vehicle_id === vehicle.id)
    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.created_at.localeCompare(b.created_at))
  const [urls, setUrls] = useState({})
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const fileRef = useRef(null)
  const odo = currentOdometer(vehicle, fuelLogs, serviceLogs)
  const fs = fuelStats(fuelLogs, vehicle.id)

  useEffect(() => {
    let live = true
    photoUrls(vphotos).then(m => { if (live) setUrls(m) }).catch(() => {})
    return () => { live = false }
  }, [photos, vehicle.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const addPhoto = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      await uploadVehiclePhoto(file, vehicle.id, vphotos.length === 0)
      showToast('PHOTO ADDED')
      await refresh()
    } catch (e) { showToast('UPLOAD FAILED: ' + e.message) }
    setBusy(false)
  }

  const hero = vphotos[0]

  return (
    <>
      <button className="btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>← FLEET</button>

      {hero && urls[hero.file_path] && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <img src={urls[hero.file_path]} alt={vehicle.name}
            style={{ width: '100%', display: 'block', maxHeight: 260, objectFit: 'cover' }} />
        </div>
      )}

      <div className="card vcard" style={{ cursor: 'default' }}>
        <div className="vname">
          <b>{vehicle.name}</b>
          {vehicle.nickname && <span className="nick">"{vehicle.nickname}"</span>}
        </div>
        <div className="vmeta">{vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.engine}</div>
        <div className="gauges">
          <div className="gauge"><div className="gv">{fmt.num(odo)}</div><div className="gl">Odometer</div></div>
          <div className="gauge"><div className="gv amber">{fmt.mpg(fs?.aggMpg)}</div><div className="gl">Avg MPG</div></div>
          <div className="gauge"><div className="gv">{fmt.cpm(fs?.costPerMile)}</div><div className="gl">Fuel $/mi</div></div>
          <div className="gauge"><div className="gv">{vehicle.fuel_octane || '—'}</div><div className="gl">Octane</div></div>
        </div>
      </div>

      <div className="section-label">Photos</div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { addPhoto(e.target.files[0]); e.target.value = '' }} />
      {photosError ? (
        <div className="note">
          Photo storage not set up — run supabase/migrations/0004_vehicle_profiles.sql in the
          SQL Editor, then reload.
        </div>
      ) : (
        <>
          <button className="btn2" onClick={() => fileRef.current.click()} disabled={busy} style={{ marginBottom: 10 }}>
            {busy ? 'UPLOADING…' : '+ ADD PHOTO'}
          </button>
          {vphotos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
              {vphotos.map(p => (
                <div key={p.id} style={{ position: 'relative' }}>
                  {urls[p.file_path] ? (
                    <img src={urls[p.file_path]} alt={p.caption || ''}
                      onClick={() => window.open(urls[p.file_path], '_blank')}
                      style={{
                        width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 3, cursor: 'pointer',
                        border: p.is_primary ? '1px solid var(--amber)' : '1px solid var(--line)',
                      }} />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '1', background: 'var(--panel-2)', borderRadius: 3 }} />
                  )}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {!p.is_primary && (
                      <button className="btn-sm" style={{ flex: 1, padding: '3px 0' }}
                        onClick={async () => { await setPrimaryPhoto(p); await refresh() }}>★</button>
                    )}
                    <button className="btn-sm danger" style={{ flex: 1, padding: '3px 0' }}
                      onClick={async () => {
                        if (!confirm('Delete this photo?')) return
                        await deleteVehiclePhoto(p); await refresh()
                      }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="section-label">Profile</div>
      {editing ? (
        <ProfileForm vehicle={vehicle}
          onDone={async (saved) => { setEditing(false); if (saved) { showToast('SAVED'); await refresh() } }} />
      ) : (
        <div className="card">
          <ProfileRow label="Primary Driver" value={vehicle.primary_driver} />
          <ProfileRow label="Plate" value={vehicle.plate} />
          <ProfileRow label="Color" value={vehicle.color} />
          <ProfileRow label="Purchased" value={vehicle.purchase_date
            ? `${vehicle.purchase_date}${vehicle.purchase_price ? ' · ' + fmt.money0(vehicle.purchase_price) : ''}`
            : null} />
          <ProfileRow label="VIN" value={vehicle.vin} />
          <ProfileRow label="Engine" value={vehicle.engine} />
          {vehicle.notes && (
            <div style={{ marginTop: 10 }}>
              <div className="gl" style={{ fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 4 }}>Specs / Quick Reference</div>
              <div className="ls" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{vehicle.notes}</div>
            </div>
          )}
          <button className="btn2" onClick={() => setEditing(true)} style={{ marginTop: 12 }}>EDIT PROFILE</button>
        </div>
      )}
    </>
  )
}

function ProfileRow({ label, value }) {
  return (
    <div className="logrow" style={{ padding: '8px 0' }}>
      <div className="ls" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'right' }}>{value || '—'}</div>
    </div>
  )
}

function ProfileForm({ vehicle, onDone }) {
  const [f, setF] = useState({
    nickname: vehicle.nickname ?? '',
    primary_driver: vehicle.primary_driver ?? '',
    plate: vehicle.plate ?? '',
    color: vehicle.color ?? '',
    purchase_date: vehicle.purchase_date ?? '',
    purchase_price: vehicle.purchase_price ?? '',
    fuel_octane: vehicle.fuel_octane ?? '',
    notes: vehicle.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    setBusy(true)
    const { error } = await supabase.from('vehicles').update({
      nickname: f.nickname || null,
      primary_driver: f.primary_driver || null,
      plate: f.plate || null,
      color: f.color || null,
      purchase_date: f.purchase_date || null,
      purchase_price: f.purchase_price !== '' ? parseFloat(f.purchase_price) : null,
      fuel_octane: f.fuel_octane || null,
      notes: f.notes || null,
    }).eq('id', vehicle.id)
    setBusy(false)
    if (error) { alert(error.message); return }
    onDone(true)
  }

  return (
    <div className="card">
      <div className="frow">
        <div className="field">
          <label>Primary Driver</label>
          <input value={f.primary_driver} onChange={e => set('primary_driver', e.target.value)} placeholder="Aaron" />
        </div>
        <div className="field">
          <label>Nickname</label>
          <input value={f.nickname} onChange={e => set('nickname', e.target.value)} placeholder="Ghost" />
        </div>
      </div>
      <div className="frow">
        <div className="field">
          <label>Plate</label>
          <input value={f.plate} onChange={e => set('plate', e.target.value)} placeholder="YCB5551" />
        </div>
        <div className="field">
          <label>Color</label>
          <input value={f.color} onChange={e => set('color', e.target.value)} />
        </div>
      </div>
      <div className="frow">
        <div className="field">
          <label>Purchase Date</label>
          <input type="date" value={f.purchase_date} onChange={e => set('purchase_date', e.target.value)} />
        </div>
        <div className="field">
          <label>Purchase Price $</label>
          <input type="number" inputMode="decimal" value={f.purchase_price} onChange={e => set('purchase_price', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Fuel Octane</label>
        <input value={f.fuel_octane} onChange={e => set('fuel_octane', e.target.value)} placeholder="93 Premium" />
      </div>
      <div className="field">
        <label>Specs / Quick Reference</label>
        <textarea rows={5} value={f.notes} onChange={e => set('notes', e.target.value)}
          placeholder={'Oil: 0W-20, 8.2 qt, filter 04152-YZZA5\nDrain plug 30 ft-lb, cap 18 ft-lb'} />
      </div>
      <button className="btn" onClick={save} disabled={busy}>{busy ? 'SAVING…' : 'SAVE PROFILE'}</button>
      <div style={{ height: 8 }} />
      <button className="btn2" onClick={() => onDone(false)}>CANCEL</button>
    </div>
  )
}
