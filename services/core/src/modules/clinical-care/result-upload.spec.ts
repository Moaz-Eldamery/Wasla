import {
  MAX_RESULT_BYTES,
  validateResultUpload,
  type ResultUpload,
} from './result-upload.js';

const pdf = (size = 20): ResultUpload => ({
  buffer: Buffer.concat([
    Buffer.from('%PDF-1.7\n'),
    Buffer.alloc(Math.max(0, size - 9)),
  ]),
  size,
  mimetype: 'application/pdf',
  originalname: 'result.pdf',
});

describe('result uploads', () => {
  it('requires a non-empty file', () => {
    expect(() => validateResultUpload()).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
    expect(() =>
      validateResultUpload({ ...pdf(), buffer: Buffer.alloc(0) }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('accepts exactly 10 MB, and refuses one byte over', () => {
    expect(validateResultUpload(pdf(MAX_RESULT_BYTES)).size).toBe(
      MAX_RESULT_BYTES,
    );
    expect(() => validateResultUpload(pdf(MAX_RESULT_BYTES + 1))).toThrow(
      expect.objectContaining({ code: 'FILE_TOO_LARGE' }),
    );
  });

  it.each([
    [
      'image/png',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
  ])('accepts %s signatures', (mimetype, buffer) => {
    expect(validateResultUpload({ ...pdf(), mimetype, buffer }).mimetype).toBe(
      mimetype,
    );
  });

  it('rejects disallowed types, empty signatures and MIME spoofing', () => {
    for (const file of [
      { ...pdf(), mimetype: 'text/html' },
      { ...pdf(), mimetype: 'image/png' },
      { ...pdf(), buffer: Buffer.from('<script>bad</script>') },
      { ...pdf(), buffer: Buffer.from('%P') },
    ])
      expect(() => validateResultUpload(file)).toThrow(
        expect.objectContaining({ code: 'FILE_TYPE_NOT_ALLOWED' }),
      );
  });

  it('removes paths and control characters from file names', () => {
    expect(
      validateResultUpload({ ...pdf(), originalname: '..\\folder/a\r\nb.pdf' })
        .originalname,
    ).toBe('ab.pdf');
  });
});
