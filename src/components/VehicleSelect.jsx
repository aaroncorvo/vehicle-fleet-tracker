import React, { useEffect, useState } from 'react'
import { photoUrls, primaryPhoto } from '../lib/vehiclePhotos.js'

// Global vehicle switcher — a visible row of photo chips, one tap to swap.
export default function VehicleSelect({ vehicles, vid, setVid, photos }) {
  const [thumbs, setThumbs] = useState({})
  const primaries = vehicles.map(v => primaryPhoto(photos || [], v.id)).filter(Boolean)
  useEffect(() => {
    let live = true
    photoUrls(primaries).then(m => { if (live) setThumbs(m) }).catch(() => {})
    return () => { live = false }
  }, [photos]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="vswitch" role="tablist" aria-label="Select vehicle">
      {vehicles.map(v => {
        const p = primaryPhoto(photos || [], v.id)
        const on = v.id === vid
        return (
          <button key={v.id} role="tab" aria-selected={on}
            className={'vsw' + (on ? ' on' : '')} onClick={() => setVid(v.id)}>
            {p && thumbs[p.file_path]
              ? <img src={thumbs[p.file_path]} alt="" />
              : <span className="vsw-ph" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M4 16v-2.2c0-.9.5-1.7 1.3-2L7 11l1.6-3.2A2 2 0 0 1 10.4 6.5h3.2a2 2 0 0 1 1.8 1.3L17 11l1.7.8c.8.3 1.3 1.1 1.3 2V16" /><circle cx="7.5" cy="16.5" r="1.8" /><circle cx="16.5" cy="16.5" r="1.8" /></svg>
                </span>}
            <span className="vsw-name">{v.nickname || v.name}</span>
            <span className="vsw-sub">{v.year} {v.model}</span>
          </button>
        )
      })}
    </div>
  )
}
