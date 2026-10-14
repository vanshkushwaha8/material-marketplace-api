// Spam trap, profile validation and upload re-encoding added for launch.
const sharp = require('sharp');
const { honeypot, HONEYPOT_FIELD } = require('../middleware/honeypot.middleware');
const authValidation = require('../validation/app/auth.validation');

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('honeypot middleware', () => {
  test('empty trap: removes the field and continues', () => {
    const req = { body: { email: 'a@b.in', [HONEYPOT_FIELD]: '' } };
    const next = jest.fn();
    honeypot(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ email: 'a@b.in' });
  });

  test('no trap field at all (older clients): continues', () => {
    const next = jest.fn();
    honeypot({ body: { email: 'a@b.in' } }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('filled trap: generic 400, handler never runs', () => {
    const res = mockRes();
    const next = jest.fn();
    honeypot({ body: { email: 'a@b.in', [HONEYPOT_FIELD]: 'http://spam.example' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('profile update validation', () => {
  const update = (body) => authValidation.validateUpdate(body).error;

  test.each(['+919571234567', '+91 98765 43210', '98765-43210', ''])('accepts phone %p', (phoneNumber) => {
    expect(update({ phoneNumber })).toBeUndefined();
  });

  test.each(['12', 'abc', '+91 9876', '+9198765432101234'])('rejects phone %p', (phoneNumber) => {
    expect(update({ phoneNumber })).toBeDefined();
  });

  test('rejects a blank or 1-character name', () => {
    expect(update({ fullName: '' })).toBeDefined();
    expect(update({ fullName: 'A' })).toBeDefined();
    expect(update({ fullName: 'Asha Rao' })).toBeUndefined();
  });
});

describe('uploaded image re-encoding', () => {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  test('a 4000px photo is stored as ≤1600px WebP', async () => {
    jest.resetModules();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-upload-'));
    jest.doMock('../service/upload/tempUploadPathResolver', () => ({ getTempUploadWriteDir: async () => dir }));
    const imageService = require('../service/upload/image.service');

    const data = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#c08040' } })
      .jpeg().toBuffer();
    const name = await imageService.singleImage({ files: { tempImage: { name: 'site.jpg', size: data.length, data } } });

    // read as a buffer: sharp holds an open handle on a path (blocks cleanup on Windows)
    const meta = await sharp(fs.readFileSync(path.join(dir, name))).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width, meta.height)).toBe(1600);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
