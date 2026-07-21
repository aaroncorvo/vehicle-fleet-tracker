import { describe, it, expect } from 'vitest'
import { modelVariants } from './recalls.js'

describe('modelVariants — NHTSA model-name matching', () => {
  it('tries the no-space form first (our "GX 460" vs NHTSA "GX460")', () => {
    expect(modelVariants('GX 460')).toEqual(['GX460', 'GX 460', 'GX'])
    expect(modelVariants('IS 350')[0]).toBe('IS350')
  })

  it('falls back to dropping the trailing token (Land Cruiser FJ80 → Land Cruiser)', () => {
    expect(modelVariants('Land Cruiser FJ80')).toContain('Land Cruiser')
  })

  it('deduplicates single-word models', () => {
    expect(modelVariants('Tacoma')).toEqual(['Tacoma'])
  })
})
