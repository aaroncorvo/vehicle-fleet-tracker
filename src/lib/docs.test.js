import { describe, it, expect } from 'vitest'
import { extractionToDocForm, docExpiry, DOC_KINDS } from './docs.js'

const insuranceCard = {
  doc_type: 'Insurance Card',
  holder_name: 'Aaron Crow',
  issuer: 'State Farm',
  policy_or_id: '84-XX-1234-5',
  effective_date: '2026-03-01',
  expiration_date: '2026-09-01',
  vehicle_hint: '2015 Lexus GX460',
  phone: '800-782-8332',
  notes: 'NAIC 25178',
}

describe('extractionToDocForm', () => {
  const f = extractionToDocForm(insuranceCard)

  it('maps holder, kind, and expiration', () => {
    expect(f.holder).toBe('Aaron Crow')
    expect(f.kind).toBe('Insurance Card')
    expect(f.expires_on).toBe('2026-09-01')
  })

  it('builds a label from issuer + policy + contact details', () => {
    expect(f.label).toContain('State Farm 84-XX-1234-5')
    expect(f.label).toContain('Ph: 800-782-8332')
  })

  it('falls back to Other for unknown doc types and empty fields', () => {
    const g = extractionToDocForm({ doc_type: 'Pay Stub', holder_name: null, issuer: null, policy_or_id: null, expiration_date: null, phone: null, notes: null })
    expect(g.kind).toBe('Other')
    expect(DOC_KINDS).toContain(g.kind)
    expect(g.holder).toBe('')
    expect(g.expires_on).toBe('')
  })
})

describe('docExpiry', () => {
  const today = new Date('2026-07-21')
  it('classifies expired / expiring / ok', () => {
    expect(docExpiry({ expires_on: '2026-07-01' }, today)).toBe('expired')
    expect(docExpiry({ expires_on: '2026-08-01' }, today)).toBe('expiring')
    expect(docExpiry({ expires_on: '2027-01-01' }, today)).toBe('ok')
    expect(docExpiry({ expires_on: null }, today)).toBeNull()
  })
})
