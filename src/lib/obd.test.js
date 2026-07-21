import { describe, it, expect } from 'vitest'
import { cleanElm, parsePid, decodeDtcs } from './obd.js'

describe('cleanElm', () => {
  it('strips echoes, prompts, SEARCHING and whitespace', () => {
    expect(cleanElm('SEARCHING...\r\n41 0C 1A F8\r\n>')).toBe('410C1AF8')
    expect(cleanElm('410c1af8>')).toBe('410C1AF8')
  })
})

describe('parsePid — mode 01 decoders', () => {
  it('0C RPM: ((A*256)+B)/4', () => {
    // 0x1AF8 = 6904 → 1726 rpm
    expect(parsePid('410C1AF8>', '0C')).toBe(1726)
  })
  it('0D speed km/h → mph', () => {
    expect(parsePid('410D64>', '0D')).toBe(62)   // 100 km/h
  })
  it('05 coolant A-40°C → °F', () => {
    expect(parsePid('41057B>', '05')).toBe(181)  // 0x7B=123 → 83°C → 181.4°F
  })
  it('2F fuel level percent', () => {
    expect(parsePid('412FFF>', '2F')).toBe(100)
    expect(parsePid('412F80>', '2F')).toBe(50)
  })
  it('42 module voltage', () => {
    expect(parsePid('414236B0>', '42')).toBe(14) // 0x36B0=14000 mV → 14 V
  })
  it('returns null on NO DATA / garbage / wrong pid echo', () => {
    expect(parsePid('NO DATA>', '0C')).toBeNull()
    expect(parsePid('?>', '0C')).toBeNull()
    expect(parsePid('410D64>', '0C')).toBeNull()
  })
})

describe('decodeDtcs — mode 03', () => {
  it('decodes CAN framing with count byte', () => {
    // 43 02 0143 0196 → two codes
    expect(decodeDtcs('4302014301 96>')).toEqual(['P0143', 'P0196'])
  })
  it('decodes legacy framing with zero padding', () => {
    expect(decodeDtcs('43 01 43 00 00 00 00>')).toEqual(['P0143'])
  })
  it('maps the first two bits to P/C/B/U', () => {
    expect(decodeDtcs('43 01 D3 91 16 C1 23>')).toEqual(['P01D3', 'B1116', 'U0123'])
  })
  it('empty when no codes', () => {
    expect(decodeDtcs('43 00 00 00 00 00 00>')).toEqual([])
    expect(decodeDtcs('NO DATA>')).toEqual([])
  })
})
