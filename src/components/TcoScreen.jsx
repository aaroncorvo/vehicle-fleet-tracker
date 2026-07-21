import React, { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { tcoRollup, fmt } from '../lib/calc.js'
import VehicleSelect from './VehicleSelect.jsx'

export default function TcoScreen({ vehicles, fuelLogs, serviceLogs, fixedCosts, fixedCostsError, vid, setVid, refresh, showToast }) {
  const [editCost, setEditCost] = useState(null)
  const [adding, setAdding] = useState(false)
  const vehicle = vehicles.find(v => v.id === vid)
  if (!vehicle) return null

  const t = tcoRollup(vehicle, fuelLogs, serviceLogs, fixedCosts)
  const vCosts = fixedCosts.filter(c => c.vehicle_id === vid)

  return (
    <>
      <VehicleSelect vehicles={vehicles} vid={vid}
        setVid={id => { setVid(id); setEditCost(null); setAdding(false) }} />

      <div className="statgrid">
        <div className="stat"><div className="sv">{fmt.cpm(t.totalCPM)}</div><div className="sl">Total $/mi</div></div>
        <div className="stat"><div className="sv">{t.annualEst != null ? fmt.money0(t.annualEst) : '—'}</div><div className="sl">Est $/yr</div></div>
      </div>

      <div className="section-label">Cost per mile — {vehicle.name}</div>
      <CpmRow label="Fuel" cpm={t.fuelCPM} detail={`${fmt.money(t.fuelSpend)} over ${fmt.num(t.miles)} mi logged`} />
      <CpmRow label="Service" cpm={t.svcCPM} detail={t.svcSpend > 0 ? `${fmt.money(t.svcSpend)} logged` : 'No service costs logged'} />
      <CpmRow label="Fixed" cpm={t.fixedCPM}
        detail={t.fixedAnnual > 0
          ? `${fmt.money0(t.fixedAnnual)}/yr` + (t.milesPerYear ? ` ÷ ${fmt.num(Math.round(t.milesPerYear))} mi/yr` : ' — need miles/yr rate')
          : 'No fixed costs entered'} />
      {t.milesPerYear == null && (
        <div className="note" style={{ marginTop: 8 }}>
          Miles/yr rate needs ≥14 days of fuel history — fixed $/mi and annual estimate unlock as fills accumulate.
        </div>
      )}

      <div className="section-label">Fixed costs — {vehicle.name}</div>
      {fixedCostsError ? (
        <div className="note">
          fixed_costs table not found — run supabase/migrations/0002_fixed_costs.sql in the
          SQL Editor (project fxycfrtycqxdlhrpfeiv), then reload.
        </div>
      ) : (
        <>
          {(editCost || adding) ? (
            <CostForm cost={editCost} vehicleId={vid}
              onDone={async (saved) => {
                setEditCost(null); setAdding(false)
                if (saved) { showToast('SAVED'); await refresh() }
              }} />
          ) : (
            <button className="btn2" onClick={() => setAdding(true)} style={{ marginBottom: 8 }}>+ ADD FIXED COST</button>
          )}
          {vCosts.map(c => (
            <div className="logrow" key={c.id} onClick={() => { setAdding(false); setEditCost(c) }} style={{ cursor: 'pointer' }}>
              <div className="lmain">
                <div className="lt">{c.name}</div>
                {c.notes && <div className="ls">{c.notes}</div>}
              </div>
              <div className="lnum">
                <div className="ln1">{fmt.money(c.amount)}</div>
                <div className="ln2">per {c.period}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}

function CpmRow({ label, cpm, detail }) {
  return (
    <div className="logrow">
      <div className="lmain">
        <div className="lt">{label}</div>
        <div className="ls">{detail}</div>
      </div>
      <div className="lnum">
        <div className="ln1">{fmt.cpm(cpm)}</div>
        <div className="ln2">$/mi</div>
      </div>
    </div>
  )
}

function CostForm({ cost, vehicleId, onDone }) {
  const [f, setF] = useState({
    name: cost?.name || '',
    amount: cost?.amount ?? '',
    period: cost?.period || 'year',
    notes: cost?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    setBusy(true)
    const payload = {
      name: f.name,
      amount: parseFloat(f.amount),
      period: f.period,
      notes: f.notes || null,
    }
    let error
    if (cost) ({ error } = await supabase.from('fixed_costs').update(payload).eq('id', cost.id))
    else ({ error } = await supabase.from('fixed_costs').insert({ ...payload, vehicle_id: vehicleId }))
    setBusy(false)
    if (error) { alert(error.message); return }
    onDone(true)
  }

  const del = async () => {
    if (!confirm('Delete this fixed cost?')) return
    await supabase.from('fixed_costs').delete().eq('id', cost.id)
    onDone(true)
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="field">
        <label>Name</label>
        <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Insurance" />
      </div>
      <div className="frow">
        <div className="field">
          <label>Amount ($)</label>
          <input type="number" inputMode="decimal" step="0.01" value={f.amount} onChange={e => set('amount', e.target.value)} />
        </div>
        <div className="field">
          <label>Period</label>
          <div className="seg">
            {['month', 'year'].map(p => (
              <button key={p} className={f.period === p ? 'on' : ''} onClick={() => set('period', p)}>{p}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} />
      </div>
      <button className="btn" onClick={save} disabled={busy || !f.name || f.amount === '' || isNaN(parseFloat(f.amount))}>
        {busy ? 'SAVING…' : 'SAVE'}
      </button>
      <div style={{ height: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn2" style={{ flex: 1 }} onClick={() => onDone(false)}>CANCEL</button>
        {cost && <button className="btn2" style={{ flex: 1, borderColor: 'rgba(255,77,77,0.4)', color: 'var(--red)' }} onClick={del}>DELETE</button>}
      </div>
    </div>
  )
}
