import { supabase } from './supabase.js'

// Identity string for the parts lookup — engine code is the discriminator
// that matters (1UR-FE vs 2UZ-FE changes every fluid and filter).
export function vehicleDescriptor(v) {
  return [v.year, v.make, v.model, v.engine, v.vin ? `VIN ${v.vin}` : null]
    .filter(Boolean).join(' ')
}

// Map an AI suggestion to editable part rows. Pure — tested.
// Uncertain items get a visible "(verify)" tag so nobody orders blind.
export function suggestionToParts(result) {
  return (result?.parts || []).map(p => ({
    name: p.name || '',
    spec: [p.spec, p.uncertain ? '(verify PN)' : null].filter(Boolean).join(' '),
    qty: p.qty || '',
    part_number: p.part_number || '',
    url: '',
  }))
}

export async function suggestParts(vehicle, service) {
  const { data, error } = await supabase.functions.invoke('ocr-receipt', {
    body: { mode: 'parts', vehicle: vehicleDescriptor(vehicle), service },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}
