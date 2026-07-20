import { supabase } from './supabase.js'
import { downscaleImage, blobToBase64 } from './images.js'

// Downscale images before OCR/upload: receipts photographed at 12MP waste
// tokens and storage. ~1600px long edge is plenty for receipt text.
const MAX_EDGE = 1600

// Normalize the file once: returns { blob, mediaType, ext }
export async function prepareReceiptFile(file) {
  if (file.type === 'application/pdf') {
    return { blob: file, mediaType: 'application/pdf', ext: 'pdf' }
  }
  const blob = await downscaleImage(file, MAX_EDGE)
  return { blob, mediaType: 'image/jpeg', ext: 'jpg' }
}

export async function uploadReceipt(prepared, vehicleId) {
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user.id}/${vehicleId}/${Date.now()}.${prepared.ext}`
  const { error } = await supabase.storage.from('receipts')
    .upload(path, prepared.blob, { contentType: prepared.mediaType })
  if (error) throw error
  return path
}

export async function ocrReceipt(prepared) {
  const data = await blobToBase64(prepared.blob)
  const { data: result, error } = await supabase.functions.invoke('ocr-receipt', {
    body: { media_type: prepared.mediaType, data },
  })
  if (error) throw error
  if (result?.error) throw new Error(result.error)
  return result
}

export async function receiptUrl(path) {
  const { data, error } = await supabase.storage.from('receipts')
    .createSignedUrl(path, 300)
  if (error) throw error
  return data.signedUrl
}

// Map an OCR extraction to the service-log form fields. Pure — regression-tested.
export function extractionToService(x) {
  const parts = (x.line_items || [])
    .filter(li => li.description)
    .map(li => {
      let s = li.description
      if (li.part_number) s += ` (${li.part_number})`
      if (li.quantity && li.quantity > 1) s += ` x${li.quantity}`
      return s
    })
    .join('; ')
  return {
    serviced_at: x.receipt_date || new Date().toISOString().slice(0, 10),
    odometer: x.odometer != null ? String(x.odometer) : '',
    service_type: x.service_type || 'Other',
    parts,
    cost: x.total != null ? String(x.total) : '',
    shop: x.vendor || '',
    notes: [x.notes, x.payment_method ? `Paid: ${x.payment_method}` : null]
      .filter(Boolean).join(' · '),
  }
}
