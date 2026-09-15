const path = require("path");
const sharp = require("sharp");
const fs = require("fs/promises");
const crypto = require("crypto");
const { getTempUploadWriteDir } = require("./tempUploadPathResolver");

const imageService = {};

const MIN_FILE_SIZE_BYTES = 1024; 
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; 

// Was `Date.now() + "___" + originalName` — millisecond-resolution
// timestamps collide under real concurrent load (two users uploading
// "photo.jpg" in the same millisecond overwrite one another silently, no
// error). Adding a random hex segment closes that off completely, while
// keeping the same flat, timestamp-led filename SHAPE — this is what lets
// tempUploadPathResolver.js derive the date-folder from old *and* new
// filenames with the same parsing logic, and what keeps every existing
// consumer (Mongo storage, the frontend, toBareFilename()) working
// unmodified, since the returned string still looks like what they
// already expect.
const uniqueName = (originalName, ext) => {
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString("hex");
  return `${ts}_${rand}___${path.parse(originalName).name}${ext}`;
};

imageService.singleImage = async (request) => {
  const file = request.files.tempImage;
  const uploadDir = await getTempUploadWriteDir();
  const ext = path.extname(file.name).toLowerCase();
  if (file.size <= MIN_FILE_SIZE_BYTES) {
    throw new Error("File size must be greater than 1 KB");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File size must be less than or equal to 50 MB");
  }
  if (ext === ".pdf") {
    const pdfName = uniqueName(file.name, ext);
    const pdfPath = path.join(uploadDir, pdfName);
    await fs.writeFile(pdfPath, file.data);
    return pdfName;
  } else if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
    const tempImageName = uniqueName(file.name, ".webp");
    const imagePath = path.join(uploadDir, tempImageName);
    await sharp(file.data).webp().toFile(imagePath);
    return tempImageName;
  } else {
    throw new Error("Unsupported file type. Only images (.jpg, .jpeg, .png, .gif, .webp) and PDFs are allowed.");
  }
};

imageService.multiImage = async (request) => {
  const tempImages = Array.isArray(request.files.tempImage)
    ? request.files.tempImage
    : [request.files.tempImage];
  const uploadDir = await getTempUploadWriteDir();

  // Was a sequential for-await loop — an N-image gallery upload took ~N×
  // a single image's latency for no reason; sharp's encode + disk write
  // per file is independent I/O/CPU work, exactly what Promise.all is for.
  const fileNames = await Promise.all(
    tempImages.map(async (image) => {
      const ext = path.extname(image.name).toLowerCase();
      if (image.size <= MIN_FILE_SIZE_BYTES) {
        throw new Error(`File ${image.name} size must be greater than 1 KB`);
      }
      if (image.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(`File ${image.name} size must be less than or equal to 50 MB`);
      }
      if (ext === ".pdf") {
        const pdfName = uniqueName(image.name, ext);
        await fs.writeFile(path.join(uploadDir, pdfName), image.data);
        return pdfName;
      } else if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
        const imageName = uniqueName(image.name, ".webp");
        await sharp(image.data).webp().toFile(path.join(uploadDir, imageName));
        return imageName;
      } else {
        throw new Error(`Unsupported file type: ${image.name}`);
      }
    })
  );

  return fileNames;
};

module.exports = imageService;