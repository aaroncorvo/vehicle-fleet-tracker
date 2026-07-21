import React from 'react'
import { fmt } from '../lib/calc.js'
import VehicleSelect from './VehicleSelect.jsx'
import VehicleDetail from './VehicleDetail.jsx'

// Dedicated per-vehicle page: photos, profile fields, and recent work.
export default function ProfileScreen({ vehicles, vid, setVid, fuelLogs, serviceLogs, receipts, photos, photosError, refresh, showToast, goTab }) {
  const vehicle = vehicles.find(v => v.id === vid) || vehicles[0]
  if (!vehicle) return null
  const recent = serviceLogs.filter(s => s.vehicle_id === vehicle.id).slice(0, 5)
  const vreceipts = (receipts || []).filter(r => r.vehicle_id === vehicle.id)

  return (
    <>
      <VehicleSelect vehicles={vehicles} vid={vehicle.id} setVid={setVid} />

      <VehicleDetail vehicle={vehicle} fuelLogs={fuelLogs} serviceLogs={serviceLogs}
        photos={photos || []} photosError={photosError} refresh={refresh} showToast={showToast} />

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
