import { describe, it, expect } from 'vitest'
import { extractionToService, extractionToFuel, isMissingFuelLogIdColumn } from './receipts.js'

// Fixture modeled on the real Discount Tire receipt (GX460, 06/30/26)
const discountTire = {
  vendor: 'Discount Tire',
  location: '3601 N Interstate 35, Round Rock TX 78664',
  receipt_date: '2026-06-30',
  total: 1095.71,
  tax: 64.35,
  odometer: 90582,
  vehicle_hint: '2015 Lexus GX460 Base, plate YCB5551',
  service_type: 'Tires',
  line_items: [
    { description: '265/70 R17 115T SL BSW FAL Rubitrek A/T', part_number: '173364', quantity: 4, amount: 764.00 },
    { description: 'TPMS RBK Basic Kit 1100K', part_number: '98188', quantity: 4, amount: 0 },
    { description: 'Certificates for refund, replacement', part_number: '80017', quantity: 4, amount: 151.36 },
    { description: 'Waste tire disposal fee', part_number: '80224', quantity: 4, amount: 16.00 },
    { description: 'Installation & life of tire maintenance', part_number: '80219', quantity: 4, amount: 100.00 },
  ],
  payment_method: 'AMX 2000',
  notes: 'Tire mileage warranty: 55000. Recommended pressure 27 psi. Method wheels — use sensors & black lugs.',
}

describe('extractionToService', () => {
  const svc = extractionToService(discountTire)

  it('maps the core service-log fields', () => {
    expect(svc.serviced_at).toBe('2026-06-30')
    expect(svc.odometer).toBe('90582')
    expect(svc.service_type).toBe('Tires')
    expect(svc.cost).toBe('1095.71')
    expect(svc.shop).toBe('Discount Tire')
  })

  it('joins line items with part numbers and quantities', () => {
    expect(svc.parts).toContain('FAL Rubitrek A/T (173364) x4')
    expect(svc.parts).toContain('TPMS RBK Basic Kit 1100K (98188) x4')
    expect(svc.parts.split('; ')).toHaveLength(5)
  })

  it('keeps warranty/pressure notes and payment method', () => {
    expect(svc.notes).toContain('55000')
    expect(svc.notes).toContain('Paid: AMX 2000')
  })

  it('degrades to sensible defaults on a sparse extraction', () => {
    const s = extractionToService({ vendor: null, receipt_date: null, total: null, odometer: null, service_type: null, line_items: [], payment_method: null, notes: null })
    expect(s.serviced_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(s.service_type).toBe('Other')
    expect(s.odometer).toBe('')
    expect(s.cost).toBe('')
    expect(s.parts).toBe('')
    expect(s.notes).toBe('')
  })
})

// Fixture modeled on a typical gas-pump receipt (QuikTrip, GX460)
const gasPump = {
  vendor: 'QuikTrip',
  location: '1601 S I-35 Frontage Rd, Round Rock TX 78664',
  receipt_date: '2026-07-15',
  total: 78.42,
  tax: 0,
  odometer: 91240,
  service_type: null,
  line_items: [
    { description: 'Unleaded 87 — 18.671 gal @ $4.199', amount: 78.42 },
  ],
  payment_method: 'AMX 2000',
  notes: 'Pump 6',
}

describe('extractionToFuel', () => {
  const fuel = extractionToFuel(gasPump)

  it('maps date, odometer, total, brand, and location', () => {
    expect(fuel.filled_at).toBe('2026-07-15')
    expect(fuel.odometer).toBe('91240')
    expect(fuel.total_cost).toBe('78.42')
    expect(fuel.brand).toBe('QuikTrip')
    expect(fuel.location).toBe('1601 S I-35 Frontage Rd, Round Rock TX 78664')
  })

  it('never guesses gallons or $/gal — those are left to the form auto-derive', () => {
    expect(fuel).not.toHaveProperty('gallons')
    expect(fuel).not.toHaveProperty('cost_per_gallon')
  })

  it('returns string-shaped values ready for form state', () => {
    expect(typeof fuel.odometer).toBe('string')
    expect(typeof fuel.total_cost).toBe('string')
  })

  it('preserves a zero total as "0" rather than dropping it', () => {
    expect(extractionToFuel({ total: 0 }).total_cost).toBe('0')
    expect(extractionToFuel({ odometer: 0 }).odometer).toBe('0')
  })

  it('degrades to sensible empties on a sparse extraction', () => {
    const f = extractionToFuel({ vendor: null, location: null, receipt_date: null, total: null, odometer: null })
    expect(f.filled_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(f.odometer).toBe('')
    expect(f.total_cost).toBe('')
    expect(f.brand).toBe('')
    expect(f.location).toBe('')
  })

  it('handles a completely empty extraction object', () => {
    const f = extractionToFuel({})
    expect(f.filled_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(f.odometer).toBe('')
    expect(f.total_cost).toBe('')
    expect(f.brand).toBe('')
    expect(f.location).toBe('')
  })
})

describe('isMissingFuelLogIdColumn', () => {
  it('detects the PostgREST schema-cache miss for the new column', () => {
    expect(isMissingFuelLogIdColumn({
      message: "Could not find the 'fuel_log_id' column of 'receipts' in the schema cache",
    })).toBe(true)
  })

  it('detects a Postgres "column does not exist" error', () => {
    expect(isMissingFuelLogIdColumn({
      message: 'column "fuel_log_id" does not exist',
    })).toBe(true)
  })

  it('does not misfire on unrelated errors', () => {
    expect(isMissingFuelLogIdColumn({ message: 'new row violates row-level security policy' })).toBe(false)
    expect(isMissingFuelLogIdColumn({ message: 'permission denied for table receipts' })).toBe(false)
    expect(isMissingFuelLogIdColumn(null)).toBe(false)
    expect(isMissingFuelLogIdColumn({})).toBe(false)
  })
})
