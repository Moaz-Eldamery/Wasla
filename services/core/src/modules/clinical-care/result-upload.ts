import { ApiError } from '../../shared/api-error.js';

export const MAX_RESULT_BYTES = 10 * 1024 * 1024;

export interface ResultUpload {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

/** Check bytes as well as the caller-supplied MIME type. Never trust a file extension. */
export function validateResultUpload(file?: ResultUpload): ResultUpload {
  if (!file || file.buffer.length === 0) {
    throw new ApiError(
      400,
      'VALIDATION_FAILED',
      'A non-empty result file is required.',
    );
  }
  if (file.buffer.length > MAX_RESULT_BYTES || file.size > MAX_RESULT_BYTES) {
    throw new ApiError(
      413,
      'FILE_TOO_LARGE',
      'Result files must be at most 10 MB.',
    );
  }
  const signatures: Record<string, Buffer> = {
    'application/pdf': Buffer.from('%PDF-'),
    'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
    'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  };
  const signature = signatures[file.mimetype];
  if (
    !signature ||
    !file.buffer.subarray(0, signature.length).equals(signature)
  ) {
    throw new ApiError(
      400,
      'FILE_TYPE_NOT_ALLOWED',
      'Upload a PDF, JPEG or PNG with matching file content.',
    );
  }
  return {
    ...file,
    size: file.buffer.length,
    originalname:
      file.originalname
        .split(/[\\/]/)
        .pop()!
        // eslint-disable-next-line no-control-regex -- Strip unsafe filename control characters.
        .replace(/[\x00-\x1f\x7f]/g, '')
        .slice(0, 255) || 'result',
  };
}
