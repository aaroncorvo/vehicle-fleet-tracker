import React from 'react'

// Global vehicle selector — one dropdown, shared selection across every tab.
export default function VehicleSelect({ vehicles, vid, setVid }) {
  return (
    <div className="field" style={{ marginBottom: 14 }}>
      <select value={vid || ''} onChange={e => setVid(e.target.value)}
        style={{ color: 'var(--amber)', fontWeight: 600, letterSpacing: '0.04em' }}>
        {vehicles.map(v => (
          <option key={v.id} value={v.id}>
            {v.name}{v.nickname ? ` "${v.nickname}"` : ''} — {v.year} {v.make} {v.model}
          </option>
        ))}
      </select>
    </div>
  )
}
