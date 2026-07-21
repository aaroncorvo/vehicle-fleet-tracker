import React, { useEffect, useState, useCallback } from 'react'
import { supabase, configMissing } from './lib/supabase.js'
import { loadSeed } from './lib/seed.js'
import Dashboard from './components/Dashboard.jsx'
import FuelScreen from './components/FuelScreen.jsx'
import ServiceScreen from './components/ServiceScreen.jsx'
import MaintenanceScreen from './components/MaintenanceScreen.jsx'
import DataScreen from './components/DataScreen.jsx'
import TcoScreen from './components/TcoScreen.jsx'
import ProfileScreen from './components/ProfileScreen.jsx'

const TABS = ['Fleet', 'Profile', 'Fuel', 'Service', 'Maint', 'TCO', 'Data']

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [tab, setTab] = useState('Fleet')
  const [vid, setVid] = useState(null)          // globally selected vehicle
  const [vehicles, setVehicles] = useState([])
  const [fuelLogs, setFuelLogs] = useState([])
  const [serviceLogs, setServiceLogs] = useState([])
  const [maintItems, setMaintItems] = useState([])
  const [fixedCosts, setFixedCosts] = useState([])
  const [fixedCostsError, setFixedCostsError] = useState(false)
  const [receipts, setReceipts] = useState([])
  const [receiptsError, setReceiptsError] = useState(false)
  const [photos, setPhotos] = useState([])
  const [photosError, setPhotosError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }, [])

  useEffect(() => {
    if (configMissing) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    const [v, f, s, m, fc, rc, ph] = await Promise.all([
      supabase.from('vehicles').select('*').eq('archived', false).order('sort_order'),
      supabase.from('fuel_logs').select('*').order('odometer'),
      supabase.from('service_logs').select('*').order('serviced_at', { ascending: false }),
      supabase.from('maintenance_items').select('*').order('name'),
      supabase.from('fixed_costs').select('*').order('name'),
      supabase.from('receipts').select('*').order('receipt_date', { ascending: false }),
      supabase.from('vehicle_photos').select('*').order('created_at'),
    ])
    setVehicles(v.data || [])
    setFuelLogs(f.data || [])
    setServiceLogs(s.data || [])
    setMaintItems(m.data || [])
    setFixedCosts(fc.data || [])
    setFixedCostsError(!!fc.error)   // table missing until migration 0002 is applied
    setReceipts(rc.data || [])
    setReceiptsError(!!rc.error)     // table missing until migration 0003 is applied
    setPhotos(ph.data || [])
    setPhotosError(!!ph.error)       // table missing until migration 0004 is applied
    setLoading(false)
  }, [])

  useEffect(() => { if (session) refresh() }, [session, refresh])

  // keep the global selection valid as vehicles load/change
  useEffect(() => {
    if (vehicles.length && !vehicles.some(v => v.id === vid)) setVid(vehicles[0].id)
  }, [vehicles, vid])

  // Google Drive OAuth redirect: ?code=...&state=... lands back on the app root
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code'), state = params.get('state')
    if (!session || !code) return
    window.history.replaceState({}, '', window.location.pathname)
    if (state !== sessionStorage.getItem('gdrive_state')) { showToast('DRIVE CONNECT FAILED: state mismatch'); return }
    sessionStorage.removeItem('gdrive_state')
    supabase.functions.invoke('google-drive', {
      body: { action: 'exchange', code, redirect_uri: window.location.origin + '/' },
    }).then(({ data, error }) => {
      if (error || data?.error) showToast('DRIVE CONNECT FAILED: ' + (data?.error || error.message))
      else { showToast('GOOGLE DRIVE CONNECTED — ' + (data.email || '')); setTab('Data') }
    })
  }, [session, showToast])

  if (configMissing) return (
    <div className="empty" style={{ paddingTop: '30vh' }}>
      VITE_SUPABASE_URL / VITE_SUPABASE_KEY not set.<br />Configure environment variables and rebuild.
    </div>
  )
  if (!authReady) return <div className="spin" style={{ marginTop: '40vh' }} />
  if (!session) return <AuthGate />

  const commonProps = { vehicles, fuelLogs, serviceLogs, maintItems, vid, setVid, refresh, showToast }

  return (
    <>
      <header className="hdr">
        <div>
          <h1><span className="tick">///</span> FLEET</h1>
          <div className="sub">{vehicles.length} VEHICLES · TRACKED</div>
        </div>
        <button onClick={() => supabase.auth.signOut()}>SIGN OUT</button>
      </header>

      <div className="wrap">
        {loading ? <div className="spin" /> : (
          vehicles.length === 0 ? <EmptyFleet refresh={refresh} showToast={showToast} /> :
          tab === 'Fleet' ? <Dashboard {...commonProps} photos={photos} goTab={setTab} /> :
          tab === 'Profile' ? <ProfileScreen {...commonProps} receipts={receipts} photos={photos} photosError={photosError} goTab={setTab} /> :
          tab === 'Fuel' ? <FuelScreen {...commonProps} /> :
          tab === 'Service' ? <ServiceScreen {...commonProps} receipts={receipts} receiptsError={receiptsError} /> :
          tab === 'Maint' ? <MaintenanceScreen {...commonProps} /> :
          tab === 'TCO' ? <TcoScreen {...commonProps} fixedCosts={fixedCosts} fixedCostsError={fixedCostsError} /> :
          <DataScreen {...commonProps} />
        )}
      </div>

      <nav className="nav">
        {TABS.map(t => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

function EmptyFleet({ refresh, showToast }) {
  const [busy, setBusy] = useState(false)
  const seed = async () => {
    setBusy(true)
    try {
      await loadSeed(supabase)
      showToast('FLEET LOADED')
      await refresh()
    } catch (e) {
      showToast('ERROR: ' + e.message)
      setBusy(false)
    }
  }
  return (
    <div className="empty">
      NO VEHICLES YET
      <div style={{ marginTop: 24 }}>
        <button className="btn" onClick={seed} disabled={busy}>
          {busy ? 'LOADING…' : 'LOAD MY FLEET (4 VEHICLES + HISTORY)'}
        </button>
      </div>
      <div style={{ marginTop: 14 }} className="note">
        Loads: GX460 · IS350 · GX470 · Land Cruiser "Ghost"<br />
        with fuel history and maintenance intervals pre-configured
      </div>
    </div>
  )
}

function AuthGate() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setErr(null); setMsg(null); setBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password: pw })
        if (error) throw error
        setMsg('Account created. If email confirmation is on, check your inbox — otherwise sign in.')
        setMode('signin')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
        if (error) throw error
      }
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div className="auth">
      <h1><span className="tick">///</span> FLEET</h1>
      <div className="tag">FUEL · SERVICE · MAINTENANCE — GX460 / IS350 / GX470 / FJ80</div>
      <div className="field">
        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
      </div>
      <div className="field">
        <label>Password</label>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          onKeyDown={e => e.key === 'Enter' && go()} />
      </div>
      {err && <div className="err">{err}</div>}
      {msg && <div className="ok">{msg}</div>}
      <button className="btn" onClick={go} disabled={busy || !email || !pw}>
        {busy ? '…' : mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}
      </button>
      <div className="swap">
        <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(null) }}>
          {mode === 'signin' ? 'First time? Create the account' : 'Have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
