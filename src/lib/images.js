// Shared client-side image helpers: downscale before upload, base64 for APIs.

export async function downscaleImage(file, maxEdge, quality = 0.85) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.type === 'image/jpeg') return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result.split(',')[1])
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}
