import { supabase } from './supabase.js'

// NHTSA recalls API has no CORS — proxied via netlify.toml (/nhtsa/* -> api.nhtsa.gov/*).
// Model naming differs from ours ("GX 460" vs "GX460"), so try variants until one hits.
export function modelVariants(model) {
  const m = model.trim()
  const words = m.split(/\s+/)
  const v = [m.replace(/\s+/g, ''), m]
  if (words.length > 1) v.push(words.slice(0, -1).join(' '))
  return [...new Set(v)]
}

async function fetchRecalls(vehicle) {
  for (const model of modelVariants(vehicle.model)) {
    const u = `/nhtsa/recalls/recallsByVehicle?make=${encodeURIComponent(vehicle.make)}&model=${encodeURIComponent(model)}&modelYear=${vehicle.year}`
    try {
      const r = await fetch(u)
      if (!r.ok) continue
      const d = await r.json()
      if (d.Count > 0) return d.results || []
    } catch { /* try next variant */ }
  }
  return []
}

// Fetch + upsert campaigns we haven't seen. Returns count of new ones.
export async function syncRecalls(vehicle, existing) {
  const found = await fetchRecalls(vehicle)
  const known = new Set(existing.filter(r => r.vehicle_id === vehicle.id).map(r => r.campaign))
  const fresh = found.filter(r => r.NHTSACampaignNumber && !known.has(r.NHTSACampaignNumber))
  if (!fresh.length) return 0
  const { error } = await supabase.from('recalls').insert(fresh.map(r => ({
    vehicle_id: vehicle.id,
    user_id: vehicle.user_id,
    campaign: r.NHTSACampaignNumber,
    component: r.Component || null,
    summary: r.Summary || null,
    consequence: r.Consequence || null,
    remedy: r.Remedy || null,
    report_date: r.ReportReceivedDate || null,
    raw: r,
  })))
  if (error) throw error
  return fresh.length
}

// Daily sweep across the fleet (gated by localStorage so it runs once per day).
export async function dailyRecallCheck(vehicles, existingRecalls) {
  const today = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem('recall_checked') === today) return null
  let added = 0
  for (const v of vehicles) {
    try { added += await syncRecalls(v, existingRecalls) } catch { /* offline / table missing */ }
  }
  localStorage.setItem('recall_checked', today)
  return added
}
