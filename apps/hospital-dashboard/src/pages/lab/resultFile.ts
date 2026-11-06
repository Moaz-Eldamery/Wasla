import { RESULT_FILE_MAX_BYTES, RESULT_FILE_TYPES } from '../../lib/api.ts'

/** A file size people can read, e.g. "182 KB" or "4.2 MB". */
export function formatBytes(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Checks a file against the API's rules before anything is sent. Returns an error message key, or null. */
export function checkResultFile(file: File): 'lab.wrongType' | 'lab.tooLarge' | null {
  if (!(RESULT_FILE_TYPES as readonly string[]).includes(file.type)) return 'lab.wrongType'
  if (file.size > RESULT_FILE_MAX_BYTES) return 'lab.tooLarge'
  return null
}
