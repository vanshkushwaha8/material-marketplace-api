/**
 * Profile photo lifecycle (buyer / seller / admin).
 * Regression: the old code looked for the temp upload at a flat path while
 * uploads are date-sharded, so new photos were silently dropped.
 */
jest.mock('../service/upload/tempUploadPathResolver', () => ({ resolveTempUploadPath: jest.fn((f) => `/tmp/2026-10-01/${f}`) }));
jest.mock('../helper/helper', () => ({ moveFileFromFolder: jest.fn().mockResolvedValue(undefined) }));

const fs = require('fs');
const helper = require('../helper/helper');
const { applyProfileImageChange } = require('../helper/profileImage.helper');

const NEW = '1700000000_ab12___me.webp';
let exists;

beforeEach(() => {
  jest.clearAllMocks();
  exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

test('undefined leaves the photo unchanged', async () => {
  await expect(applyProfileImageChange({ current: 'old.webp', next: undefined, folder: 'profile' })).resolves.toBeUndefined();
  expect(helper.moveFileFromFolder).not.toHaveBeenCalled();
});

test('new upload is moved out of the date-sharded temp folder and the old file deleted', async () => {
  await expect(applyProfileImageChange({ current: 'old.webp', next: NEW, folder: 'profile' })).resolves.toBe(NEW);
  expect(exists).toHaveBeenCalledWith(`/tmp/2026-10-01/${NEW}`);
  expect(helper.moveFileFromFolder).toHaveBeenCalledWith(NEW, 'profile');
  expect(fs.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('old.webp'));
});

test('empty string removes the photo', async () => {
  await expect(applyProfileImageChange({ current: 'old.webp', next: '', folder: 'adminProfile' })).resolves.toBe('');
  expect(fs.promises.unlink).toHaveBeenCalled();
});

test('expired / missing temp upload is an error, not a silent no-op', async () => {
  exists.mockReturnValue(false);
  await expect(applyProfileImageChange({ current: '', next: NEW, folder: 'profile' })).rejects.toMatchObject({ statusCode: 400 });
});

test.each(['../../etc/passwd.png', 'a/b.webp', 'x\\y.jpg', 'script.js', '..webp.png'])('rejects unsafe name %p', async (next) => {
  await expect(applyProfileImageChange({ current: '', next, folder: 'profile' })).rejects.toMatchObject({ statusCode: 400 });
  expect(helper.moveFileFromFolder).not.toHaveBeenCalled();
});
