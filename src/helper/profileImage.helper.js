const fs = require('fs');
const path = require('path');
const helper = require('./helper');
const { resolveTempUploadPath } = require('../service/upload/tempUploadPathResolver');

// Shared profile-photo lifecycle for buyers, sellers and admins.
//
// Root cause this replaces: auth.service.js#update checked
// `public/tempUploads/<file>` (flat, relative to the process cwd) but
// uploads are written to the DATE-SHARDED `public/tempUploads/YYYY-MM-DD/`
// folder (tempUploadPathResolver.js). The check always failed, the new
// photo was silently dropped, and the API still answered 200 — so the user
// saw their old/default avatar after "successfully" changing it. Admin
// profiles had no photo support at all.

class ProfileImageError extends Error {
  constructor(message) { super(message); this.name = 'ProfileImageError'; this.statusCode = 400; this.isOperational = true; }
}

// Filenames come from POST /upload/singleImage (always `<ts>_<hex>___<name>.webp`
// for images). Anything with a path separator or `..` is rejected — the
// value is used to build filesystem paths.
const SAFE_NAME = /^[^\\/]+\.(webp|png|jpe?g|gif)$/i;
function assertSafeFilename(name) {
  if (typeof name !== 'string' || name.length > 255 || !SAFE_NAME.test(name) || name.includes('..') || path.basename(name) !== name) {
    throw new ProfileImageError('Invalid image reference. Please upload the image again.');
  }
}

async function removeStored(folder, filename) {
  if (!filename || typeof filename !== 'string' || path.basename(filename) !== filename) return;
  try {
    await fs.promises.unlink(path.join(__dirname, '../../public', folder, filename));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[profile image] could not delete old file:', err.message);
  }
}

/**
 * @param {object} p
 * @param {string|undefined|null} p.current - stored filename
 * @param {string|undefined|null} p.next - undefined = unchanged, '' / null = remove, filename = new temp upload
 * @param {string} p.folder - permanent folder under /public ('profile' | 'adminProfile')
 * @returns {Promise<string|undefined>} value to store (undefined = leave field alone)
 */
async function applyProfileImageChange({ current, next, folder }) {
  if (next === undefined) return undefined;
  if (next === '' || next === null) {
    await removeStored(folder, current);
    return '';
  }
  if (next === current) return current;
  assertSafeFilename(next);
  if (!fs.existsSync(resolveTempUploadPath(next))) {
    throw new ProfileImageError('That upload has expired. Please choose the image again.');
  }
  await helper.moveFileFromFolder(next, folder);
  if (!fs.existsSync(path.join(__dirname, '../../public', folder, next))) {
    throw new ProfileImageError('Could not save the image. Please try again.');
  }
  if (current && current !== next) await removeStored(folder, current);
  return next;
}

module.exports = { applyProfileImageChange, ProfileImageError };
