import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { computeMpg } from '../lib/calc.js'
import { downscaleImage } from '../lib/images.js'

export default function DataScreen({ vehicles, fuelLogs, serviceLogs, maintItems, theme, setTheme, refresh, showToast }) {
  const fileRef = useRef(null)
  const [importVid, setImportVid] = useState(vehicles[0]?.id)
  const [importBusy, setImportBusy] = useState(false)
  const [drive, setDrive] = useState({ loading: true })
  const [backupBusy, setBackupBusy] = useState(false)

  const driveCall = async (body) => {
    const { data, error } = await supabase.functions.invoke('google-drive', { body })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    return data
  }

  const loadDriveStatus = async () => {
    try { setDrive({ loading: false, ...(await driveCall({ action: 'status' })) }) }
    catch { setDrive({ loading: false, unavailable: true }) }
  }
  useEffect(() => { loadDriveStatus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const connectDrive = async () => {
    try {
      const state = crypto.randomUUID()
      sessionStorage.setItem('gdrive_state', state)
      const { url } = await driveCall({ action: 'auth-url', redirect_uri: location.origin + '/', state })
      location.href = url
    } catch (e) { showToast('ERROR: ' + e.message) }
  }

  const backupNow = async () => {
    setBackupBusy(true)
    try {
      const r = await driveCall({ action: 'backup' })
      showToast(`BACKED UP ${r.files} FILES TO DRIVE`)
      await loadDriveStatus()
    } catch (e) { showToast('BACKUP FAILED: ' + e.message) }
    setBackupBusy(false)
  }

  const disconnectDrive = async () => {
    if (!confirm('Disconnect Google Drive? Daily backups will stop. Files already in Drive stay.')) return
    try { await driveCall({ action: 'disconnect' }); await loadDriveStatus(); showToast('DISCONNECTED') }
    catch (e) { showToast('ERROR: ' + e.message) }
  }

  // ---- family sharing ----
  const [members, setMembers] = useState(null)   // null = table missing (migration 0006)
  const [newMember, setNewMember] = useState('')
  const [me, setMe] = useState(null)
  const loadMembers = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setMe(user)
    const { data, error } = await supabase.from('fleet_members').select('*').order('created_at')
    setMembers(error ? null : data)
  }
  useEffect(() => { loadMembers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const addMember = async () => {
    const email = newMember.trim().toLowerCase()
    if (!email || !email.includes('@')) { showToast('ENTER AN EMAIL'); return }
    const { error } = await supabase.from('fleet_members').insert({ member_email: email })
    if (error) { showToast('ERROR: ' + error.message); return }
    setNewMember(''); showToast('MEMBER ADDED'); await loadMembers()
  }
  const removeMember = async (m) => {
    if (!confirm(`Remove ${m.member_email} from the fleet?`)) return
    await supabase.from('fleet_members').delete().eq('id', m.id)
    await loadMembers(); showToast('REMOVED')
  }

  // ---- alert preferences ----
  const ownerId = vehicles[0]?.user_id
  const isOwner = me?.id === ownerId
  const [prefs, setPrefs] = useState({ frequency: 'weekly', recipients: {} })
  const [prefsMissing, setPrefsMissing] = useState(false)
  const [prefsBusy, setPrefsBusy] = useState(false)
  useEffect(() => {
    supabase.from('alert_prefs').select('*').then(({ data, error }) => {
      if (error) { setPrefsMissing(true); return }
      if (data?.[0]) setPrefs({ frequency: data[0].frequency, recipients: data[0].recipients || {} })
    })
  }, [])

  const FREQS = [
    ['urgent', 'Urgent only', 'Email only when something new goes overdue, a recall appears, or a document hits expiry'],
    ['weekly', 'Weekly', 'Monday morning summary — only if anything needs attention'],
    ['monthly', 'Monthly', '1st of the month summary'],
    ['daily', 'Daily', 'Every morning anything is due (skips exact repeats)'],
    ['off', 'Off', 'No emails — in-app flags only'],
  ]
  const recipientEmails = [
    ...(isOwner && me?.email ? [me.email] : []),
    ...members?.filter(m => m.owner_user_id === ownerId).map(m => m.member_email) ?? [],
  ]
  // recipient value: false | true | { enabled, vehicles: null|[vehicle ids] }
  const normRecip = (e) => {
    const r = prefs.recipients?.[e.toLowerCase()]
    if (r === false) return { enabled: false, vehicles: null }
    if (r === true || r == null) return { enabled: true, vehicles: null }
    return { enabled: r.enabled !== false, vehicles: r.vehicles ?? null }
  }
  const setRecip = (e, next) =>
    savePrefs({ ...prefs, recipients: { ...prefs.recipients, [e.toLowerCase()]: next } })

  const savePrefs = async (next) => {
    setPrefs(next)
    if (!isOwner) return
    setPrefsBusy(true)
    const { error } = await supabase.from('alert_prefs').upsert({
      user_id: ownerId, frequency: next.frequency, recipients: next.recipients,
      updated_at: new Date().toISOString(),
    })
    setPrefsBusy(false)
    if (error) showToast('SAVE FAILED: ' + error.message)
    else showToast('ALERT SETTINGS SAVED')
  }

  // ---- user profile (name, avatar, theme) ----
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const avatarRef = useRef(null)
  useEffect(() => {
    if (!me) return
    setDisplayName(me.user_metadata?.display_name || '')
    const p = me.user_metadata?.avatar_path
    if (p) supabase.storage.from('documents').createSignedUrl(p, 3600)
      .then(({ data }) => data && setAvatarUrl(data.signedUrl))
  }, [me])

  const saveName = async () => {
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayName.trim() } })
    if (error) showToast('ERROR: ' + error.message)
  }
  const uploadAvatar = async (file) => {
    if (!file) return
    try {
      const blob = await downscaleImage(file, 512)
      const path = `${me.id}/avatar/${Date.now()}.jpg`
      const { error } = await supabase.storage.from('documents').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      await supabase.auth.updateUser({ data: { avatar_path: path } })
      const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
      setAvatarUrl(data?.signedUrl)
      showToast('AVATAR UPDATED')
    } catch (e) { showToast('ERROR: ' + e.message) }
  }

  const sendTest = async () => {
    setPrefsBusy(true)
    try {
      const r = await (async () => {
        const { data, error } = await supabase.functions.invoke('alerts', { body: {} })
        if (error) throw error
        return data
      })()
      showToast(r.sent ? `SENT TO ${r.to.length} RECIPIENT${r.to.length > 1 ? 'S' : ''}` : `NOT SENT: ${r.reason || r.error}`)
    } catch (e) { showToast('ERROR: ' + e.message) }
    setPrefsBusy(false)
  }

  const vName = id => vehicles.find(v => v.id === id)?.name || id

  const downloadCsv = (rows, filename) => {
    if (rows.length === 0) { showToast('NOTHING TO EXPORT'); return }
    const cols = Object.keys(rows[0])
    const esc = v => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v)
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const exportFuel = () => {
    const mpgMap = computeMpg(fuelLogs)
    downloadCsv(fuelLogs.map(l => ({
      vehicle: vName(l.vehicle_id), date: l.filled_at, odometer: l.odometer,
      fill_type: l.fill_type, gallons: l.gallons, cost_per_gallon: l.cost_per_gallon,
      total_cost: l.total_cost, mpg: mpgMap.get(l.id)?.mpg?.toFixed(2) || '',
      octane: l.octane, brand: l.brand, location: l.location, notes: l.notes,
    })), 'fuel_logs.csv')
  }
  const exportService = () => downloadCsv(serviceLogs.map(s => ({
    vehicle: vName(s.vehicle_id), date: s.serviced_at, odometer: s.odometer,
    service_type: s.service_type, parts: s.parts, cost: s.cost, shop: s.shop, notes: s.notes,
  })), 'service_logs.csv')
  const exportMaint = () => downloadCsv(maintItems.map(m => ({
    vehicle: vName(m.vehicle_id), name: m.name,
    interval_miles: m.interval_miles, interval_months: m.interval_months,
    last_done_miles: m.last_done_miles, last_done_date: m.last_done_date,
    part_number: m.part_number, notes: m.notes,
  })), 'maintenance_items.csv')

  // ---- Fuelly CSV import ----
  // Expected Fuelly export headers include: Type, MPG, Date, Time, Vehicle, Odometer,
  // Filled Up, Cost/Gallon, Gallons, Total Cost, Octane, Gas Brand, Location, Payment Type, Notes
  const parseCsv = (text) => {
    const rows = []
    let row = [], cur = '', inQ = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ',') { row.push(cur); cur = '' }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        row.push(cur); cur = ''
        if (row.some(c => c !== '')) rows.push(row)
        row = []
      } else cur += ch
    }
    if (cur !== '' || row.length) { row.push(cur); if (row.some(c => c !== '')) rows.push(row) }
    return rows
  }

  const importFuelly = async (file) => {
    setImportBusy(true)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      const hdr = rows[0].map(h => h.trim().toLowerCase())
      const col = name => hdr.indexOf(name)
      const iDate = col('date'), iOdo = col('odometer'), iFill = col('filled up'),
        iCpg = col('cost/gallon'), iGal = col('gallons'), iTot = col('total cost'),
        iOct = col('octane'), iBrand = col('gas brand'), iLoc = col('location'),
        iPay = col('payment type'), iNotes = col('notes'), iTime = col('time')
      if (iDate < 0 || iOdo < 0 || iGal < 0) throw new Error('Not a Fuelly export — need Date, Odometer, Gallons columns')

      const cleanMoney = v => v ? parseFloat(String(v).replace(/[$,]/g, '')) : null
      const inserts = []
      for (const r of rows.slice(1)) {
        const odo = parseInt(String(r[iOdo]).replace(/,/g, ''))
        const gal = parseFloat(r[iGal])
        if (!odo || !gal) continue
        const fillRaw = (iFill >= 0 ? r[iFill] : 'Full').trim().toLowerCase()
        inserts.push({
          vehicle_id: importVid,
          filled_at: r[iDate],
          fill_time: iTime >= 0 ? r[iTime] : null,
          odometer: odo,
          fill_type: fillRaw.includes('reset') ? 'reset' : fillRaw.includes('partial') ? 'partial' : 'full',
          gallons: gal,
          cost_per_gallon: iCpg >= 0 ? cleanMoney(r[iCpg]) : null,
          total_cost: iTot >= 0 ? cleanMoney(r[iTot]) : null,
          octane: iOct >= 0 ? (r[iOct] || null) : null,
          brand: iBrand >= 0 ? (r[iBrand] || null) : null,
          location: iLoc >= 0 ? (r[iLoc] || null) : null,
          payment: iPay >= 0 ? (r[iPay] || null) : null,
          notes: iNotes >= 0 ? (r[iNotes] || null) : null,
        })
      }
      if (inserts.length === 0) throw new Error('No valid rows found')
      // skip duplicates: same vehicle + odometer already present
      const existing = new Set(fuelLogs.filter(l => l.vehicle_id === importVid).map(l => l.odometer))
      const fresh = inserts.filter(i => !existing.has(i.odometer))
      if (fresh.length === 0) throw new Error('All ' + inserts.length + ' rows already imported')
      const { error } = await supabase.from('fuel_logs').insert(fresh)
      if (error) throw error
      showToast(`IMPORTED ${fresh.length} FILLS` + (inserts.length - fresh.length ? ` (${inserts.length - fresh.length} dupes skipped)` : ''))
      await refresh()
    } catch (e) {
      alert('Import failed: ' + e.message)
    }
    setImportBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
      <div className="section-label">Your Profile</div>
      <div className="card">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
          <div onClick={() => avatarRef.current.click()}
            style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--amber)',
              cursor: 'pointer', background: 'var(--panel-2)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0 }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color: 'var(--amber)' }}>
                  {(displayName || me?.email || '?')[0].toUpperCase()}
                </span>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 600 }}>{displayName || 'Set your name'}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.email}</div>
          </div>
        </div>
        <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { uploadAvatar(e.target.files[0]); e.target.value = '' }} />
        <div className="frow">
          <div className="field">
            <label>Display name</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} onBlur={saveName} placeholder="Aaron" />
          </div>
          <div className="field">
            <label>Appearance</label>
            <div className="seg">
              {['dark', 'light'].map(t => (
                <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>{t}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="note">Tap the circle to set your photo. Name and photo are yours; theme is per device.</div>
      </div>

      <div className="section-label">Google Drive Backup</div>
      <div className="card">
        {drive.loading ? <div className="spin" style={{ margin: '10px auto' }} /> :
        drive.connected ? (
          <>
            <div className="ls" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', marginBottom: 4 }}>
              ● CONNECTED — {drive.email}
            </div>
            <div className="note" style={{ marginBottom: 12 }}>
              Backing up to "{drive.folder_name}" in Drive, automatically every night at 2:00 AM CT.
              {drive.last_backup_at && <><br />Last backup: {new Date(drive.last_backup_at).toLocaleString()} ({drive.last_backup_result})</>}
            </div>
            <button className="btn" onClick={backupNow} disabled={backupBusy}>
              {backupBusy ? 'BACKING UP…' : '⇪ BACKUP NOW'}
            </button>
            <div style={{ height: 8 }} />
            <button className="btn2" onClick={disconnectDrive}>DISCONNECT</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={connectDrive} disabled={drive.unavailable}>CONNECT GOOGLE DRIVE</button>
            <div className="note" style={{ marginTop: 10 }}>
              {drive.unavailable
                ? 'Backup service not deployed yet — see supabase/functions/google-drive + migration 0005.'
                : 'One-time Google sign-in. Creates a "Fleet Records" folder in your Drive with per-vehicle records, photos, and receipts — refreshed nightly and on demand. The app can only touch files it creates.'}
            </div>
          </>
        )}
      </div>

      <div className="section-label">Family Sharing</div>
      <div className="card">
        {members === null ? (
          <div className="note">Sharing not set up yet — run supabase/migrations/0006_family_sharing.sql, then reload.</div>
        ) : (
          <>
            {members.filter(m => m.owner_user_id === me?.id).map(m => (
              <div className="logrow" key={m.id}>
                <div className="lmain"><div className="lt" style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>{m.member_email}</div></div>
                <button className="btn-sm danger" onClick={() => removeMember(m)}>REMOVE</button>
              </div>
            ))}
            {members.some(m => m.owner_user_id !== me?.id) && (
              <div className="note" style={{ margin: '8px 0' }}>
                You also have access to a fleet shared with you.
              </div>
            )}
            <div className="field" style={{ marginTop: 10 }}>
              <label>Add family member by email</label>
              <input type="email" inputMode="email" value={newMember} onChange={e => setNewMember(e.target.value)}
                placeholder="kary@example.com" onKeyDown={e => e.key === 'Enter' && addMember()} />
            </div>
            <button className="btn2" onClick={addMember}>+ ADD MEMBER</button>
            <div className="note" style={{ marginTop: 10 }}>
              They create their own account with that exact email (sign-up link on the login screen),
              and your whole fleet appears for them — entries they add land on the shared fleet.
            </div>
          </>
        )}
      </div>

      <div className="section-label">Alerts & Notifications</div>
      <div className="card">
        {prefsMissing ? (
          <div className="note">Alert settings not set up — run supabase/migrations/0010_alert_prefs.sql, then reload.</div>
        ) : (
          <>
            <div className="field">
              <label>Email frequency</label>
              <select value={prefs.frequency} disabled={!isOwner}
                onChange={e => savePrefs({ ...prefs, frequency: e.target.value })}>
                {FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="note" style={{ marginBottom: 12 }}>
              {FREQS.find(([v]) => v === prefs.frequency)?.[2]}
            </div>
            <div className="field">
              <label>Who receives alerts — and for which vehicles</label>
              {recipientEmails.length === 0 && <div className="note">Recipients appear here once members are added.</div>}
              {recipientEmails.map(e => {
                const r = normRecip(e)
                const chip = { fontSize: 11, padding: '5px 10px' }
                return (
                  <div key={e} style={{ padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 9, textTransform: 'none', fontSize: 13, fontFamily: 'var(--font-mono)', letterSpacing: 0, color: r.enabled ? 'var(--text)' : 'var(--text-faint)' }}>
                      <input type="checkbox" checked={r.enabled} disabled={!isOwner}
                        onChange={ev => setRecip(e, { ...r, enabled: ev.target.checked })} />
                      {e}{me?.email === e && ' (you)'}
                    </label>
                    {r.enabled && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 2px 28px' }}>
                        <button className={'vchip' + (r.vehicles == null ? ' on' : '')} style={chip} disabled={!isOwner}
                          onClick={() => setRecip(e, { ...r, vehicles: null })}>ALL CARS</button>
                        {vehicles.map(v => {
                          const sel = r.vehicles?.includes(v.id)
                          return (
                            <button key={v.id} className={'vchip' + (sel ? ' on' : '')} style={chip} disabled={!isOwner}
                              onClick={() => {
                                const list = r.vehicles == null ? [v.id]
                                  : sel ? r.vehicles.filter(x => x !== v.id) : [...r.vehicles, v.id]
                                setRecip(e, { ...r, vehicles: list.length ? list : null })
                              }}>{v.name}</button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button className="btn2" onClick={sendTest} disabled={prefsBusy}>
              {prefsBusy ? 'WORKING…' : 'SEND TEST ALERT NOW'}
            </button>
            {!isOwner && <div className="note" style={{ marginTop: 8 }}>Only the account holder can change alert settings.</div>}
          </>
        )}
      </div>

      <div className="section-label">Export</div>
      <div className="card">
        <div style={{ display: 'grid', gap: 8 }}>
          <button className="btn2" onClick={exportFuel}>FUEL LOGS → CSV ({fuelLogs.length})</button>
          <button className="btn2" onClick={exportService}>SERVICE LOGS → CSV ({serviceLogs.length})</button>
          <button className="btn2" onClick={exportMaint}>MAINTENANCE → CSV ({maintItems.length})</button>
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          Your data lives in your own Supabase Postgres. These exports are for backups or spreadsheet analysis.
        </div>
      </div>

      <div className="section-label">Import from Fuelly</div>
      <div className="card">
        <div className="field">
          <label>Import into vehicle</label>
          <select value={importVid} onChange={e => setImportVid(e.target.value)}>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} — {v.year} {v.make} {v.model}</option>)}
          </select>
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
          onChange={e => e.target.files[0] && importFuelly(e.target.files[0])} />
        <button className="btn2" onClick={() => fileRef.current?.click()} disabled={importBusy}>
          {importBusy ? 'IMPORTING…' : 'CHOOSE FUELLY CSV EXPORT'}
        </button>
        <div className="note" style={{ marginTop: 10 }}>
          Fuelly → Vehicle → Export Fuel-ups. Duplicate odometer readings are skipped automatically,
          so re-importing is safe. Import one vehicle's file at a time.
        </div>
      </div>

      <div className="section-label">Vehicles</div>
      {vehicles.map(v => (
        <div className="logrow" key={v.id}>
          <div className="lmain">
            <div className="lt">{v.name}{v.nickname ? ` "${v.nickname}"` : ''}</div>
            <div className="ls">{v.year} {v.make} {v.model} · VIN {v.vin || '—'}</div>
          </div>
        </div>
      ))}
    </>
  )
}
