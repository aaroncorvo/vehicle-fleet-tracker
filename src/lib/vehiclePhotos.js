import { supabase } from './supabase.js'
import { downscaleImage } from './images.js'

// Vehicle photos get more resolution than receipts — they're for looking at.
const MAX_EDGE = 2048

export async function uploadVehiclePhoto(file, vehicle, makePrimary) {
  const blob = await downscaleImage(file, MAX_EDGE)
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user.id}/${vehicle.id}/${Date.now()}.jpg`
  const { error: uerr } = await supabase.storage.from('vehicle-photos')
    .upload(path, blob, { contentType: 'image/jpeg' })
  if (uerr) throw uerr
  const { error } = await supabase.from('vehicle_photos').insert({
    vehicle_id: vehicle.id, user_id: vehicle.user_id, file_path: path, is_primary: !!makePrimary,
  })
  if (error) throw error
  return path
}

export async function deleteVehiclePhoto(photo) {
  await supabase.storage.from('vehicle-photos').remove([photo.file_path])
  const { error } = await supabase.from('vehicle_photos').delete().eq('id', photo.id)
  if (error) throw error
}

export async function setPrimaryPhoto(photo) {
  await supabase.from('vehicle_photos').update({ is_primary: false })
    .eq('vehicle_id', photo.vehicle_id)
  const { error } = await supabase.from('vehicle_photos').update({ is_primary: true })
    .eq('id', photo.id)
  if (error) throw error
}

// Signed URLs, batched per render. 1h expiry — plenty for a session.
export async function photoUrls(photos) {
  if (!photos.length) return {}
  const { data, error } = await supabase.storage.from('vehicle-photos')
    .createSignedUrls(photos.map(p => p.file_path), 3600)
  if (error) throw error
  const map = {}
  data.forEach((d, i) => { if (d.signedUrl) map[photos[i].file_path] = d.signedUrl })
  return map
}

export function primaryPhoto(photos, vehicleId) {
  const vp = photos.filter(p => p.vehicle_id === vehicleId)
  return vp.find(p => p.is_primary) || vp[0] || null
}
