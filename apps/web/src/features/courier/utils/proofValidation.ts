import { formatBytes } from './format'

/** Mirrors the API's proof validation in courier.service.ts. */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024

const ALLOWED_TYPES: Readonly<Record<string, readonly string[]>> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}

/** Value for the file input's `accept` attribute. */
export const PROOF_ACCEPT = Object.keys(ALLOWED_TYPES).join(',')

/** Returns a user-facing error, or null when the file can be uploaded. */
export function validateProofFile(file: File): string | null {
  const extensions = ALLOWED_TYPES[file.type]
  if (!extensions) return 'Only JPEG, PNG or WebP images are accepted.'
  const dot = file.name.lastIndexOf('.')
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  if (!extensions.includes(extension)) {
    return `The file extension does not match its type. Use ${extensions.join(' or ')} for this image.`
  }
  if (file.size === 0) return 'The selected image is empty.'
  if (file.size > MAX_PROOF_BYTES) return `Image is ${formatBytes(file.size)}. The maximum size is 5 MB.`
  return null
}
