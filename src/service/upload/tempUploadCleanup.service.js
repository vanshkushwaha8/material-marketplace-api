const fs = require('fs');
const path = require('path');
const logger = require('../../logger/error.logger');
const configenv = require('../../config/env.config');

/**
 * OPL production-grade improvement #4 — every project document/image
 * upload (uploadDocument/uploadKiisFile in issuerProjectWizard.service.js,
 * and the generic /upload/singleImage /multiImage endpoints used for
 * project images) writes into public/tempUploads/ immediately, before the
 * issuer has necessarily saved or submitted anything. If they abandon the
 * wizard, close the tab, or just never finish, that file sits there
 * permanently — nothing ever revisits tempUploads to clean it up. Repeated
 * across many users over time, this is unbounded disk growth with zero
 * signal that anything's wrong until the disk actually fills up.
 *
 * This is a straightforward age-based sweep: anything in tempUploads older
 * than TEMP_UPLOAD_MAX_AGE_HOURS (default 24h — comfortably longer than
 * any realistic "upload it, then save the step" gap, including someone
 * stepping away mid-form) gets deleted. A file that's actually part of a
 * saved project is never at risk: moveFileFromFolder/moveSingleDocumentField
 * relocate it to public/images or public/documents (a different directory)
 * the moment the containing step is actually saved, so a legitimately
 * in-use file is never sitting in tempUploads for more than the few
 * seconds between "chosen" and "step saved" — nowhere close to 24h.
 */

const TEMP_UPLOAD_DIR = path.join(__dirname, '../../../public/tempUploads');
const MAX_AGE_HOURS = Number(configenv.TEMP_UPLOAD_MAX_AGE_HOURS) || 24;
const MAX_AGE_MS = MAX_AGE_HOURS * 60 * 60 * 1000;

const DATE_FOLDER_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @returns {Promise<{scanned: number, deleted: number, deletedBytes: number, errors: Array<{file:string, message:string}>}>}
 */
async function sweepOrphanedTempUploads() {
  const result = { scanned: 0, deleted: 0, deletedBytes: 0, errors: [] };

  let entries;
  try {
    entries = await fs.promises.readdir(TEMP_UPLOAD_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Nothing has ever been uploaded on this environment yet — not an error.
      return result;
    }
    logger.error('[tempUploadCleanup] could not read tempUploads directory', { message: err.message });
    result.errors.push({ file: TEMP_UPLOAD_DIR, message: err.message });
    return result;
  }

  const now = Date.now();

  for (const entry of entries) {
    result.scanned += 1;
    const fullPath = path.join(TEMP_UPLOAD_DIR, entry.name);

    // Date-sharded subfolder (image.service.js writes into today's folder
    // going forward) — a whole expired folder is deleted in one recursive
    // rm() rather than stat-ing every file inside it individually. The
    // FOLDER's own name/date already tells you everything in it is
    // expired, since nothing ever gets written into a folder other than
    // "today's" at write time.
    if (entry.isDirectory() && DATE_FOLDER_PATTERN.test(entry.name)) {
      const folderAgeMs = now - new Date(entry.name).getTime();
      if (folderAgeMs > MAX_AGE_MS) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const sizeBefore = await folderSizeBytes(fullPath);
          // eslint-disable-next-line no-await-in-loop
          await fs.promises.rm(fullPath, { recursive: true, force: true });
          result.deleted += 1;
          result.deletedBytes += sizeBefore;
        } catch (err) {
          logger.error('[tempUploadCleanup] failed to remove an expired date-folder', { file: entry.name, message: err.message });
          result.errors.push({ file: entry.name, message: err.message });
        }
      }
      continue; // eslint-disable-line no-continue
    }

    if (!entry.isFile()) continue; // skip anything else unexpected (e.g. a non-date subdirectory)

    // Legacy flat file (uploaded before date-sharding shipped, or any
    // straggler) — same per-file age check as before this change.
    try {
      // eslint-disable-next-line no-await-in-loop
      const stats = await fs.promises.stat(fullPath);
      const ageMs = now - stats.mtimeMs;
      if (ageMs > MAX_AGE_MS) {
        // eslint-disable-next-line no-await-in-loop
        await fs.promises.unlink(fullPath);
        result.deleted += 1;
        result.deletedBytes += stats.size;
      }
    } catch (err) {
      // A file that's mid-write (rare, but possible right as an upload
      // lands) can transiently fail stat/unlink — log and move on rather
      // than aborting the whole sweep over one file.
      logger.error('[tempUploadCleanup] failed to process a file', { file: entry.name, message: err.message });
      result.errors.push({ file: entry.name, message: err.message });
    }
  }

  return result;
}

/** Best-effort recursive size sum, used only for the deletedBytes metric — never blocks the actual delete on failure. */
async function folderSizeBytes(dir) {
  let total = 0;
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      // eslint-disable-next-line no-await-in-loop
      total += entry.isDirectory() ? await folderSizeBytes(p) : (await fs.promises.stat(p)).size;
    }
  } catch (_err) {
    // Metric-only — if this fails, the delete still proceeds, deletedBytes just under-reports.
  }
  return total;
}

module.exports = { sweepOrphanedTempUploads, TEMP_UPLOAD_DIR, MAX_AGE_HOURS };