import { supabase } from './supabase.js'
import { downscaleImage } from './images.js'

export const DOC_KINDS = [
  'Insurance Card', 'Registration', 'Roadside / AAA', 'Warranty', 'Inspection', 'Membership', 'Other',
]

export async function uploadDoc(file, { ownerId, holder, kind, label, vehicleId, expiresOn }) {
  let blob = file, ext = 'pdf', mime = 'application/pdf'
  if (file.type !== 'application/pdf') {
    blob = await downscaleImage(file, 2048)
    ext = 'jpg'; mime = 'image/jpeg'
  }
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user.id}/docs/${Date.now()}.${ext}`
  const { error: uerr } = await supabase.storage.from('documents')
    .upload(path, blob, { contentType: mime })
  if (uerr) throw uerr
  const { error } = await supabase.from('driver_docs').insert({
    user_id: ownerId, holder, kind, label: label || null,
    vehicle_id: vehicleId || null, expires_on: expiresOn || null, file_path: path,
  })
  if (error) throw error
}

export async function docUrl(doc) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 300)
  if (error) throw error
  return data.signedUrl
}

export async function deleteDoc(doc) {
  await supabase.storage.from('documents').remove([doc.file_path])
  const { error } = await supabase.from('driver_docs').delete().eq('id', doc.id)
  if (error) throw error
}

// null = no expiry; 'expired' | 'expiring' (≤30 days) | 'ok'
export function docExpiry(doc, today = new Date()) {
  if (!doc.expires_on) return null
  const days = Math.round((new Date(doc.expires_on) - today) / 86400000)
  return days < 0 ? 'expired' : days <= 30 ? 'expiring' : 'ok'
}
