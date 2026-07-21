import React, { useRef, useState } from 'react'
import { fmt } from '../lib/calc.js'
import VehicleSelect from './VehicleSelect.jsx'
import VehicleDetail from './VehicleDetail.jsx'
import { DOC_KINDS, uploadDoc, docUrl, deleteDoc, docExpiry } from '../lib/docs.js'

// Dedicated per-vehicle page: photos, profile fields, glovebox docs, recent work.
export default function ProfileScreen({ vehicles, vid, setVid, fuelLogs, serviceLogs, receipts, photos, photosError, recalls, recallsError, docs, docsError, refresh, showToast, goTab }) {
  const vehicle = vehicles.find(v => v.id === vid) || vehicles[0]
  if (!vehicle) return null
  const recent = serviceLogs.filter(s => s.vehicle_id === vehicle.id).slice(0, 5)
  const vreceipts = (receipts || []).filter(r => r.vehicle_id === vehicle.id)
  const vdocs = (docs || []).filter(d => !d.vehicle_id || d.vehicle_id === vehicle.id)

  return (
    <>
      <VehicleSelect vehicles={vehicles} vid={vehicle.id} setVid={setVid} />

      <VehicleDetail vehicle={vehicle} fuelLogs={fuelLogs} serviceLogs={serviceLogs}
        photos={photos || []} photosError={photosError} recalls={recalls || []} recallsError={recallsError}
        refresh={refresh} showToast={showToast} />

      <div className="section-label">Glovebox</div>
      {docsError ? (
        <div className="note">Document storage not set up — run supabase/migrations/0009_glovebox.sql, then reload.</div>
      ) : (
        <Glovebox vehicle={vehicle} vdocs={vdocs} refresh={refresh} showToast={showToast} />
      )}

      <div className="section-label">Updates & Repairs</div>
      {recent.length === 0 && (
        <div className="empty" style={{ padding: '18px 0' }}>NO WORK LOGGED YET</div>
      )}
      {recent.map(s => (
        <div className="logrow" key={s.id}>
          <div className="lmain">
            <div className="lt">
              {s.service_type}
              {vreceipts.some(r => r.service_log_id === s.id) && <span style={{ color: 'var(--amber)' }}> ⌁</span>}
            </div>
            <div className="ls">
              {s.serviced_at}{s.odometer ? ' · ' + fmt.num(s.odometer) + ' mi' : ''}
              {s.shop ? ' · ' + s.shop : ''}
            </div>
          </div>
          <div className="lnum">
            <div className="ln1">{s.cost ? fmt.money0(s.cost) : '—'}</div>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn2" style={{ flex: 1 }} onClick={() => goTab('Service')}>LOG WORK / SCAN RECEIPT</button>
        <button className="btn2" style={{ flex: 1 }} onClick={() => goTab('Maint')}>INTERVALS</button>
      </div>
    </>
  )
}

function Glovebox({ vehicle, vdocs, refresh, showToast }) {
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ holder: vehicle.primary_driver || '', kind: 'Insurance Card', label: '', expires_on: '', thisVehicle: true })
  const fileRef = useRef(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      await uploadDoc(file, {
        ownerId: vehicle.user_id, holder: f.holder || 'Family', kind: f.kind, label: f.label,
        vehicleId: f.thisVehicle ? vehicle.id : null, expiresOn: f.expires_on,
      })
      showToast('DOCUMENT SAVED')
      setAdding(false)
      await refresh()
    } catch (e) { showToast('UPLOAD FAILED: ' + e.message) }
    setBusy(false)
  }

  const view = async (d) => {
    try { window.open(await docUrl(d), '_blank') }
    catch (e) { showToast('ERROR: ' + e.message) }
  }

  return (
    <>
      {vdocs.map(d => {
        const exp = docExpiry(d)
        return (
          <div className="logrow" key={d.id}>
            <div className="lmain">
              <div className="lt" style={{ fontSize: 15 }}>{d.label || d.kind}</div>
              <div className="ls">
                {d.kind} · {d.holder}{!d.vehicle_id && ' · fleet-wide'}
                {d.expires_on && (
                  <span style={{ color: exp === 'expired' ? 'var(--red)' : exp === 'expiring' ? 'var(--amber-hi)' : undefined }}>
                    {' · '}{exp === 'expired' ? 'EXPIRED ' : 'expires '}{d.expires_on}
                  </span>
                )}
              </div>
            </div>
            <div className="lnum" style={{ display: 'flex', gap: 6 }}>
              <button className="btn-sm" onClick={() => view(d)}>VIEW</button>
              <button className="btn-sm danger" onClick={async () => {
                if (!confirm(`Delete "${d.label || d.kind}"?`)) return
                await deleteDoc(d); await refresh(); showToast('DELETED')
              }}>✕</button>
            </div>
          </div>
        )
      })}
      <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment"
        style={{ display: 'none' }} onChange={e => { save(e.target.files[0]); e.target.value = '' }} />
      {!adding ? (
        <button className="btn2" onClick={() => setAdding(true)} style={{ marginTop: 8 }}>+ ADD DOCUMENT</button>
      ) : (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="frow">
            <div className="field">
              <label>Holder</label>
              <input value={f.holder} onChange={e => set('holder', e.target.value)} placeholder="Aaron" />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={f.kind} onChange={e => set('kind', e.target.value)}>
                {DOC_KINDS.map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
          </div>
          <div className="frow">
            <div className="field">
              <label>Label (optional)</label>
              <input value={f.label} onChange={e => set('label', e.target.value)} placeholder="State Farm 84-XX-1234" />
            </div>
            <div className="field">
              <label>Expires (optional)</label>
              <input type="date" value={f.expires_on} onChange={e => set('expires_on', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', fontSize: 12 }}>
              <input type="checkbox" checked={f.thisVehicle} onChange={e => set('thisVehicle', e.target.checked)} style={{ width: 'auto' }} />
              This vehicle only (uncheck for fleet-wide, e.g. AAA card)
            </label>
          </div>
          <button className="btn" onClick={() => fileRef.current.click()} disabled={busy}>
            {busy ? 'UPLOADING…' : '⌁ SNAP / CHOOSE FILE & SAVE'}
          </button>
          <div style={{ height: 8 }} />
          <button className="btn2" onClick={() => setAdding(false)}>CANCEL</button>
          <div className="note" style={{ marginTop: 10 }}>
            Stored privately (owner-only access, encrypted at rest, links expire in 5 minutes).
            Good for insurance/registration cards — keep driver's licenses in Apple Wallet instead.
          </div>
        </div>
      )}
    </>
  )
}
