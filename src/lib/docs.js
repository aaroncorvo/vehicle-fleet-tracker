import { supabase } from './supabase.js'
import { downscaleImage, blobToBase64 } from './images.js'

export const DOC_KINDS = [
  'Insurance Card', 'Registration', 'Roadside / AAA', 'Warranty', 'Inspection', 'Membership', 'Other',
]

// Normalize once so scan + upload share the same bytes.
export async function prepareDocFile(file) {
  if (file.type === 'application/pdf') return { blob: file, mediaType: 'application/pdf', ext: 'pdf' }
  const blob = await downscaleImage(file, 2048)
  return { blob, mediaType: 'image/jpeg', ext: 'jpg' }
}

export async function ocrDocument(prepared) {
  const data = await blobToBase64(prepared.blob)
  const { data: result, error } = await supabase.functions.invoke('ocr-receipt', {
    body: { media_type: prepared.mediaType, data, mode: 'document' },
  })
  if (error) throw error
  if (result?.error) throw new Error(result.error)
  return result
}

// Map a document extraction to Glovebox form fields. Pure — tested.
export function extractionToDocForm(x) {
  const kind = DOC_KINDS.includes(x.doc_type) ? x.doc_type : 'Other'
  const label = [x.issuer, x.policy_or_id].filter(Boolean).join(' ') || ''
  const notes = [x.phone ? `Ph: ${x.phone}` : null, x.notes].filter(Boolean).join(' · ')
  return {
    holder: x.holder_name || '',
    kind,
    label: notes ? `${label}${label ? ' — ' : ''}${notes}`.slice(0, 140) : label,
    expires_on: x.expiration_date || '',
  }
}

export async function uploadDoc(prepared, { ownerId, holder, kind, label, vehicleId, expiresOn }) {
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user.id}/docs/${Date.now()}.${prepared.ext}`
  const { error: uerr } = await supabase.storage.from('documents')
    .upload(path, prepared.blob, { contentType: prepared.mediaType })
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
