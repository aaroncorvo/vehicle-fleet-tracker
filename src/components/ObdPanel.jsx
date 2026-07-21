import React, { useEffect, useRef, useState } from 'react'
import { bleSupported, ObdConnection, PIDS } from '../lib/obd.js'

const LIVE_PIDS = ['0C', '0D', '05', '2F', '42']

// Live OBD-II link over BLE. Works today in Chrome (desktop/Android);
// iPhone support arrives with the Capacitor app via the same protocol layer.
export default function ObdPanel({ vehicle }) {
  const [state, setState] = useState('idle')   // idle | connecting | live | error
  const [deviceName, setDeviceName] = useState(null)
  const [vals, setVals] = useState({})
  const [dtcs, setDtcs] = useState(null)       // null = not read yet
  const [err, setErr] = useState(null)
  const connRef = useRef(null)
  const pollRef = useRef(null)

  const stop = () => {
    clearInterval(pollRef.current)
    connRef.current?.disconnect()
    connRef.current = null
    setState('idle'); setVals({}); setDtcs(null); setDeviceName(null)
  }
  useEffect(() => stop, [])                    // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { stop() }, [vehicle.id])    // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setState('connecting'); setErr(null)
    try {
      const conn = new ObdConnection()
      const name = await conn.connect()
      connRef.current = conn
      setDeviceName(name)
      setState('live')
      let busy = false
      pollRef.current = setInterval(async () => {
        if (busy || !connRef.current) return
        busy = true
        try { setVals(await connRef.current.readPids(LIVE_PIDS)) }
        catch { /* transient read miss; keep polling */ }
        busy = false
      }, 1200)
    } catch (e) {
      setErr(e.message)
      setState(e.name === 'NotFoundError' ? 'idle' : 'error')  // user cancelled chooser
    }
  }

  const readCodes = async () => {
    try { setDtcs(await connRef.current.readDtcs()) }
    catch (e) { setErr('Code read failed: ' + e.message) }
  }

  if (!bleSupported()) {
    return (
      <div className="card">
        <div className="note">
          Bluetooth OBD-II works in Chrome or Edge (computer / Android phone) today —
          iPhone support ships with the App Store version. Use a BLE dongle:
          Vgate iCar Pro BLE 4.0, OBDLink CX, or Veepeak BLE+.
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      {state !== 'live' ? (
        <>
          <button className="btn" onClick={connect} disabled={state === 'connecting'}>
            {state === 'connecting' ? 'CONNECTING…' : '⌁ CONNECT OBD-II DONGLE'}
          </button>
          <div className="note" style={{ marginTop: 10 }}>
            Plug a BLE dongle (Vgate iCar Pro BLE, OBDLink CX, Veepeak BLE+) into the
            OBD port, turn the ignition on, then connect. Live data + check-engine codes.
          </div>
          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="note" style={{ margin: 0, color: 'var(--green)' }}>● {deviceName}</span>
            <button className="btn-sm" onClick={stop}>DISCONNECT</button>
          </div>
          <div className="gauges">
            {LIVE_PIDS.map(pid => (
              <div className="gauge" key={pid}>
                <div className={'gv' + (pid === '0C' ? ' amber' : '')}>
                  {vals[pid] != null ? vals[pid] : '—'}
                  {vals[pid] != null && PIDS[pid].unit && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}> {PIDS[pid].unit}</span>}
                </div>
                <div className="gl">{PIDS[pid].label}</div>
              </div>
            ))}
          </div>
          <div style={{ height: 12 }} />
          <button className="btn2" onClick={readCodes}>READ CHECK-ENGINE CODES</button>
          {dtcs !== null && (
            dtcs.length === 0
              ? <div className="note" style={{ marginTop: 8, color: 'var(--green)' }}>No stored codes.</div>
              : <div className="flagrow">
                  {dtcs.map(c => <span className="flag overdue" key={c}>● {c}</span>)}
                </div>
          )}
          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
        </>
      )}
    </div>
  )
}
