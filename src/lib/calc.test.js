import { describe, it, expect } from 'vitest'
import { computeMpg, fuelStats, currentOdometer, maintenanceStatus, tco } from './calc.js'
import { seedFuel } from './seed.js'

// Build fuel logs from the real seed data so the tests regress against the
// exact GX460 entries the verified reference values came from (see CLAUDE.md).
const logs = seedFuel.map((f, i) => ({ ...f, id: i + 1, vehicle_id: f.key }))
const gx460 = logs.filter(l => l.vehicle_id === 'gx460')

describe('computeMpg — verified GX460 reference sequence', () => {
  it('matches the per-fill MPG sequence: null, 13.81, 12.96, 12.60, 15.06, 12.52', () => {
    const mpg = computeMpg(logs)
    const seq = gx460.map(l => {
      const v = mpg.get(l.id).mpg
      return v == null ? null : Number(v.toFixed(2))
    })
    expect(seq).toEqual([null, 13.81, 12.96, 12.60, 15.06, 12.52])
  })

  it('reset rows produce no MPG and set the baseline', () => {
    const mpg = computeMpg(logs)
    expect(mpg.get(gx460[0].id)).toEqual({ mpg: null, miles: null })
    // first full after reset uses the reset odometer as baseline
    expect(mpg.get(gx460[1].id).miles).toBe(90449 - 90191)
  })

  it('partial fills accumulate gallons into the next full fill', () => {
    const synthetic = [
      { id: 'a', vehicle_id: 'x', odometer: 1000, fill_type: 'reset', gallons: 10 },
      { id: 'b', vehicle_id: 'x', odometer: 1100, fill_type: 'partial', gallons: 4 },
      { id: 'c', vehicle_id: 'x', odometer: 1200, fill_type: 'full', gallons: 6 },
    ]
    const mpg = computeMpg(synthetic)
    expect(mpg.get('b').mpg).toBeNull()
    // 200 mi since last full-baseline / (4 partial + 6 this fill) = 20 MPG
    expect(mpg.get('c').mpg).toBeCloseTo(20, 5)
  })

  it('processes entries by odometer order regardless of input order', () => {
    const shuffled = [...logs].reverse()
    const mpg = computeMpg(shuffled)
    expect(Number(mpg.get(gx460[1].id).mpg.toFixed(2))).toBe(13.81)
  })
})

describe('fuelStats — verified GX460 aggregates', () => {
  const s = fuelStats(logs, 'gx460')

  it('1061 mi on 78.351 gal = 13.54 MPG aggregate', () => {
    expect(s.miles).toBe(1061)
    expect(s.galUsed).toBeCloseTo(78.351, 3)
    expect(Number(s.aggMpg.toFixed(2))).toBe(13.54)
  })

  it('total spend $397.01, avg $4.150/gal, $0.306/mi', () => {
    expect(s.totalSpend).toBeCloseTo(397.01, 2)
    expect(Number(s.avgCpg.toFixed(3))).toBe(4.150)
    expect(Number(s.costPerMile.toFixed(3))).toBe(0.306)
  })

  it('returns null for a vehicle with no logs', () => {
    expect(fuelStats(logs, 'nope')).toBeNull()
  })
})

describe('currentOdometer — always derived, never stored', () => {
  const vehicle = { id: 'gx460', base_odometer: 90191 }

  it('takes the max across base, fuel logs, and service logs', () => {
    expect(currentOdometer(vehicle, logs, [])).toBe(91252)
    const svc = [{ vehicle_id: 'gx460', odometer: 91500 }]
    expect(currentOdometer(vehicle, logs, svc)).toBe(91500)
  })

  it('falls back to base_odometer with no logs', () => {
    expect(currentOdometer(vehicle, [], [])).toBe(90191)
  })
})

describe('maintenanceStatus thresholds', () => {
  const today = new Date('2026-07-20')

  it('baseline when no last_done set', () => {
    expect(maintenanceStatus({ interval_miles: 7500 }, 91252, today).status).toBe('baseline')
  })

  it('overdue when miles-remaining <= 0', () => {
    const item = { interval_miles: 7500, last_done_miles: 83000 }
    const r = maintenanceStatus(item, 91252, today)
    expect(r.status).toBe('overdue')
    expect(r.remainMiles).toBe(83000 + 7500 - 91252)
  })

  it('due-soon when <= 1000 mi remaining', () => {
    const item = { interval_miles: 7500, last_done_miles: 84500 }
    expect(maintenanceStatus(item, 91252, today).status).toBe('due-soon')
  })

  it('due-soon when <= 30 days remaining', () => {
    const item = { interval_months: 12, last_done_date: '2025-08-01' }
    expect(maintenanceStatus(item, 91252, today).status).toBe('due-soon')
  })

  it('overdue by date wins over ok-by-miles', () => {
    const item = { interval_miles: 7500, last_done_miles: 91000, interval_months: 1, last_done_date: '2026-05-01' }
    expect(maintenanceStatus(item, 91252, today).status).toBe('overdue')
  })

  it('ok when comfortably inside both windows', () => {
    const item = { interval_miles: 7500, last_done_miles: 91000, interval_months: 6, last_done_date: '2026-07-01' }
    expect(maintenanceStatus(item, 91252, today).status).toBe('ok')
  })
})

describe('tco', () => {
  it('sums fuel + service spend and derives cost per mile over logged miles', () => {
    const svc = [{ vehicle_id: 'gx460', cost: 100 }]
    const t = tco({ id: 'gx460' }, logs, svc)
    expect(t.fuelSpend).toBeCloseTo(397.01, 2)
    expect(t.svcSpend).toBe(100)
    expect(t.totalSpend).toBeCloseTo(497.01, 2)
    expect(t.miles).toBe(1061)
    // cost/mi excludes the baseline fill's cost (it bought no logged miles)
    expect(t.costPerMile).toBeCloseTo((397.01 + 100 - 65.46) / 1061, 4)
  })
})
