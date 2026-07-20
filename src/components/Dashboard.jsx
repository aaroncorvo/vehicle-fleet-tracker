import React from 'react'
import { fuelStats, currentOdometer, maintenanceStatus, fmt } from '../lib/calc.js'

export default function Dashboard({ vehicles, fuelLogs, serviceLogs, maintItems, goTab }) {
  // Fleet-level totals
  let fleetFuel = 0, fleetSvc = 0
  for (const l of fuelLogs) fleetFuel += Number(l.total_cost || 0)
  for (const s of serviceLogs) fleetSvc += Number(s.cost || 0)

  return (
    <>
      <div className="statgrid">
        <div className="stat"><div className="sv">{fmt.money0(fleetFuel)}</div><div className="sl">Fuel Spend</div></div>
        <div className="stat"><div className="sv">{fmt.money0(fleetSvc)}</div><div className="sl">Service Spend</div></div>
      </div>

      <div className="section-label">Vehicles</div>
      {vehicles.map(v => <VehicleCard key={v.id} v={v}
        fuelLogs={fuelLogs} serviceLogs={serviceLogs} maintItems={maintItems} goTab={goTab} />)}
    </>
  )
}

function VehicleCard({ v, fuelLogs, serviceLogs, maintItems, goTab }) {
  const fs = fuelStats(fuelLogs, v.id)
  const odo = currentOdometer(v, fuelLogs, serviceLogs)
  const items = maintItems.filter(m => m.vehicle_id === v.id)
  const flagged = items
    .map(m => ({ m, st: maintenanceStatus(m, odo) }))
    .filter(x => x.st.status === 'overdue' || x.st.status === 'due-soon')
    .sort((a, b) => (a.st.status === 'overdue' ? 0 : 1) - (b.st.status === 'overdue' ? 0 : 1))

  const annualFuel = (fs?.milesPerYear && fs?.costPerMile) ? fs.milesPerYear * fs.costPerMile : null

  return (
    <div className="card vcard" onClick={() => goTab('Maint')}>
      <div className="vname">
        <b>{v.name}</b>
        {v.nickname && <span className="nick">"{v.nickname}"</span>}
      </div>
      <div className="vmeta">{v.year} {v.make} {v.model} · {v.engine}</div>
      <div className="gauges">
        <div className="gauge">
          <div className="gv">{fmt.num(odo)}</div>
          <div className="gl">Odometer</div>
        </div>
        <div className="gauge">
          <div className="gv amber">{fmt.mpg(fs?.aggMpg)}</div>
          <div className="gl">Avg MPG</div>
        </div>
        <div className="gauge">
          <div className="gv">{fmt.cpm(fs?.costPerMile)}</div>
          <div className="gl">Fuel $/mi</div>
        </div>
        <div className="gauge">
          <div className="gv">{annualFuel ? fmt.money0(annualFuel) : '—'}</div>
          <div className="gl">Fuel /yr est</div>
        </div>
      </div>
      {flagged.length > 0 && (
        <div className="flagrow">
          {flagged.slice(0, 4).map(({ m, st }) => (
            <span key={m.id} className={'flag ' + st.status}>
              {st.status === 'overdue' ? '● ' : '◐ '}{m.name}
            </span>
          ))}
          {flagged.length > 4 && <span className="flag due-soon">+{flagged.length - 4} more</span>}
        </div>
      )}
    </div>
  )
}
