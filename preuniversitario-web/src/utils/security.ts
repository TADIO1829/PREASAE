const SAFE_FILE_NAME = /[^a-zA-Z0-9._-]/g

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024

export function sanitizeFileName(name: string) {
  return name.replace(SAFE_FILE_NAME, '_')
}

export function isPdfFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return file.type === 'application/pdf' || lowerName.endsWith('.pdf')
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
