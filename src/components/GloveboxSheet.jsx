import React, { useState } from 'react'
import { docUrl, docExpiry } from '../lib/docs.js'

// Emergency-speed document access: insurance card at a traffic stop, AAA card
// at a breakdown. One tap from the header, one tap to the document itself.
const KIND_ORDER = ['Insurance Card', 'Roadside / AAA', 'Registration', 'Inspection', 'Warranty', 'Membership', 'Other']

export default function GloveboxSheet({ open, onClose, docs, vehicles, vid, goTab }) {
  const [viewer, setViewer] = useState(null)   // { url, title } for full-screen image
  const [busy, setBusy] = useState(null)
  if (!open) return null

  const vehicle = vehicles.find(v => v.id === vid)
  const relevant = (docs || [])
    .filter(d => !d.vehicle_id || d.vehicle_id === vid)
    .sort((a, b) => {
      const ka = KIND_ORDER.indexOf(a.kind), kb = KIND_ORDER.indexOf(b.kind)
      return (ka < 0 ? 99 : ka) - (kb < 0 ? 99 : kb)
    })

  const show = async (d) => {
    setBusy(d.id)
    try {
      const url = await docUrl(d)
      if (d.file_path.endsWith('.pdf')) window.open(url, '_blank')
      else setViewer({ url, title: d.label || d.kind })
    } catch (e) { alert('Could not open document: ' + e.message) }
    setBusy(null)
  }

  return (
    <div className="gbsheet" role="dialog" aria-label="Glovebox">
      {viewer ? (
        <div className="gbviewer" onClick={() => setViewer(null)}>
          <div className="gbviewer-title">{viewer.title} — tap to close</div>
          <img src={viewer.url} alt={viewer.title} />
        </div>
      ) : (
        <>
          <div className="gbsheet-head">
            <div>
              <div className="gbsheet-title">GLOVEBOX</div>
              <div className="gbsheet-sub">{vehicle ? `${vehicle.nickname || vehicle.name} + fleet-wide documents` : 'Fleet documents'}</div>
            </div>
            <button className="gbclose" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {relevant.length === 0 ? (
            <div className="empty" style={{ paddingTop: 60 }}>
              NO DOCUMENTS YET
              <div className="note" style={{ marginTop: 12 }}>
                Add your insurance card, AAA card, and registration from the Vehicle tab → Glovebox.
              </div>
              <div style={{ marginTop: 20 }}>
                <button className="btn2" onClick={() => { onClose(); goTab('Vehicle') }}>OPEN VEHICLE TAB</button>
              </div>
            </div>
          ) : relevant.map(d => {
            const exp = docExpiry(d)
            return (
              <button key={d.id} className="gbdoc" onClick={() => show(d)} disabled={busy === d.id}>
                <div className="gbdoc-kind">{d.kind}</div>
                <div className="gbdoc-label">{d.label || '—'}</div>
                <div className="gbdoc-meta">
                  {d.holder}{!d.vehicle_id && ' · fleet-wide'}
                  {d.expires_on && (
                    <span className={exp === 'expired' ? 'bad' : exp === 'expiring' ? 'warn' : ''}>
                      {' · '}{exp === 'expired' ? 'EXPIRED ' : 'exp '}{d.expires_on}
                    </span>
                  )}
                </div>
                <span className="gbdoc-go">{busy === d.id ? '…' : 'VIEW ›'}</span>
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}
