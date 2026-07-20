import { describe, it, expect } from 'vitest'
import { extractionToService } from './receipts.js'

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
