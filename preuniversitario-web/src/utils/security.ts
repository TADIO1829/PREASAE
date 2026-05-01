const SAFE_FILE_NAME = /[^a-zA-Z0-9._-]/g
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024
export const MAX_UPLOAD_SIZE_BYTES = MAX_PDF_SIZE_BYTES

export function sanitizeFileName(name: string) {
  return name.replace(SAFE_FILE_NAME, '_')
}

export function isPdfFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return file.type === 'application/pdf' || lowerName.endsWith('.pdf')
}

export function isImageFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

export function isPdfOrImageFile(file: File) {
  return isPdfFile(file) || isImageFile(file)
}

export function isImageResource(value: string) {
  const lowerValue = value.trim().toLowerCase()
  return IMAGE_EXTENSIONS.some((extension) => lowerValue.endsWith(extension))
}

export function isSafeHttpUrl(value: string) {
  if (!value) return false

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}
