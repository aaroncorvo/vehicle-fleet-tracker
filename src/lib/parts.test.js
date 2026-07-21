import { describe, it, expect } from 'vitest'
import { vehicleDescriptor, suggestionToParts } from './parts.js'

describe('vehicleDescriptor', () => {
  it('joins year/make/model/engine/VIN, skipping blanks', () => {
    expect(vehicleDescriptor({
      year: 2015, make: 'Lexus', model: 'GX 460', engine: '1UR-FE 4.6L V8', vin: 'JTJBM7FX6F5091083',
    })).toBe('2015 Lexus GX 460 1UR-FE 4.6L V8 VIN JTJBM7FX6F5091083')
    expect(vehicleDescriptor({ year: 1991, make: 'Toyota', model: 'Land Cruiser' }))
      .toBe('1991 Toyota Land Cruiser')
  })
})

describe('suggestionToParts', () => {
  it('maps suggestions to editable rows with empty url', () => {
    const rows = suggestionToParts({
      parts: [
        { name: 'Engine Oil', spec: '0W-20 Full Synthetic', qty: '8.0 qt with filter', part_number: null, uncertain: false },
        { name: 'Oil Filter', spec: 'cartridge type', qty: '1', part_number: '04152-YZZA1', uncertain: true },
      ],
      notes: null,
    })
    expect(rows).toEqual([
      { name: 'Engine Oil', spec: '0W-20 Full Synthetic', qty: '8.0 qt with filter', part_number: '', url: '' },
      { name: 'Oil Filter', spec: 'cartridge type (verify PN)', qty: '1', part_number: '04152-YZZA1', url: '' },
    ])
  })

  it('tolerates an empty or missing result', () => {
    expect(suggestionToParts(null)).toEqual([])
    expect(suggestionToParts({ parts: [] })).toEqual([])
  })
})
