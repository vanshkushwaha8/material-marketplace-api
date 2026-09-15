const path = require('path');
const fs = require('fs');
const { mkdir } = require('node:fs/promises');

const ROOT_DIR = path.resolve();
const TEMP_ROOT = path.join(ROOT_DIR, 'public', 'tempUploads');

/**
 * Both the old filename format (`{timestamp}___{originalName}.ext`) and the
 * new one (`{timestamp}_{randomHex}___{originalName}.ext`) lead with a
 * plain millisecond Unix timestamp before the first `_`/`___`. Parsing it
 * back out is how the date-folder a file lives in is *computed*, never
 * stored or searched for — this is what keeps moveFileFromFolder() O(1)
 * (Critical #1 from the review) without changing what gets returned to the
 * frontend or written to Mongo (still a flat filename string, exactly as
 * today).
 *
 * @returns {string|null} 'YYYY-MM-DD', or null if the filename doesn't
 *   start with a parseable timestamp (defensive — treated as "unknown
 *   date", caller falls back to the flat root).
 */
function dateFolderFromFilename(filename) {
  const match = /^(\d{10,13})/.exec(filename);
  if (!match) return null;
  const ts = Number(match[1]);
  if (!Number.isFinite(ts)) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Where a brand-new upload should be WRITTEN. Always today's date-folder;
 * creates it if it doesn't exist yet. Called once per upload, not once per
 * file-lookup, so the mkdir cost is negligible relative to the actual
 * image encode it's paired with.
 */
async function getTempUploadWriteDir() {
  const folder = new Date().toISOString().slice(0, 10);
  const dir = path.join(TEMP_ROOT, folder);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Where an EXISTING tempUploads filename should be READ from / moved out
 * of. Tries the date-folder computed from the filename's own timestamp
 * first (O(1) — no directory scan); falls back to the flat root for any
 * file that predates this change (uploaded before date-sharding shipped)
 * or whose timestamp couldn't be parsed. Returns the sharded path even if
 * neither exists, so existing ENOENT-tolerant callers (moveFileFromFolder,
 * scanTempFile, etc.) keep behaving exactly as they did with their old
 * fs.existsSync guards — "file's not there" is still just a no-op, not a
 * thrown error.
 */
function resolveTempUploadPath(filename) {
  const folder = dateFolderFromFilename(filename);
  if (folder) {
    const shardedPath = path.join(TEMP_ROOT, folder, filename);
    if (fs.existsSync(shardedPath)) return shardedPath;
  }
  const flatPath = path.join(TEMP_ROOT, filename);
  if (fs.existsSync(flatPath)) return flatPath;
  // Neither exists — return the sharded path as the "expected" location;
  // callers already treat a missing file as a safe no-op.
  return folder ? path.join(TEMP_ROOT, folder, filename) : flatPath;
}

module.exports = {
  TEMP_ROOT,
  dateFolderFromFilename,
  getTempUploadWriteDir,
  resolveTempUploadPath,
};