import { describe, it, expect } from 'vitest'
import { describeDtc } from './dtc.js'
import { decodeDtcs } from './obd.js'

describe('describeDtc', () => {
  it('returns curated descriptions for common codes', () => {
    expect(describeDtc('P0301')).toMatch(/Cylinder 1 misfire/)
    expect(describeDtc('P0420')).toMatch(/Catalyst/)
    expect(describeDtc('p0455')).toMatch(/gas cap/)
    expect(describeDtc('P1135')).toMatch(/Toyota/)
    expect(describeDtc('C1201')).toMatch(/ABS\/VSC/)
  })

  it('falls back to SAE subsystem ranges for unknown codes', () => {
    expect(describeDtc('P0399')).toMatch(/misfire|Ignition/i)
    expect(describeDtc('P1604')).toMatch(/Manufacturer-specific/)
    expect(describeDtc('U0299')).toMatch(/Network/)
    expect(describeDtc('B1234')).toMatch(/Body/)
  })
})

describe('decodeDtcs mode 07 (pending)', () => {
  it('decodes pending codes with the 47 marker', () => {
    expect(decodeDtcs('4701030100 00>', '47')).toEqual(['P0103', 'P0100'])
  })
  it('stored marker still default', () => {
    expect(decodeDtcs('43010300 00 00 00>')).toEqual(['P0103'])
  })
})
