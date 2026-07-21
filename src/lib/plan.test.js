import { describe, it, expect } from 'vitest'
import { planStatus } from './plan.js'

const LIMITS = [
  { tier: 'free', max_vehicles: 2, max_members: 0, features: { ocr: false, drive_backup: false } },
  { tier: 'family', max_vehicles: 10, max_members: 5, features: { ocr: true, drive_backup: true } },
]

describe('planStatus', () => {
  it('gates by the resolved tier limits', () => {
    const s = planStatus({ ready: true, tier: 'family', limits: LIMITS }, { vehicles: 4, members: 2 })
    expect(s).toMatchObject({
      ready: true, tier: 'family', maxVehicles: 10, maxMembers: 5,
      canAddVehicle: true, canAddMember: true,
    })
    expect(s.features.ocr).toBe(true)
  })

  it('blocks adds at the cap', () => {
    const s = planStatus({ ready: true, tier: 'free', limits: LIMITS }, { vehicles: 2, members: 0 })
    expect(s.canAddVehicle).toBe(false)
    expect(s.canAddMember).toBe(false)
    expect(s.features.ocr).toBe(false)
  })

  it('fails open before migration 0012 is applied', () => {
    const s = planStatus({ ready: false }, { vehicles: 99, members: 99 })
    expect(s.ready).toBe(false)
    expect(s.canAddVehicle).toBe(true)
    expect(s.canAddMember).toBe(true)
  })

  it('fails open on an unknown tier', () => {
    const s = planStatus({ ready: true, tier: 'mystery', limits: LIMITS }, { vehicles: 1, members: 0 })
    expect(s.ready).toBe(false)
    expect(s.canAddVehicle).toBe(true)
  })
})
