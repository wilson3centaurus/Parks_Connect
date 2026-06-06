import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const maxUploadBytes = Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
const isVercelRuntime = Boolean(process.env.VERCEL);

const configuredUploadDir = process.env.FILE_UPLOAD_DIR
  ? path.resolve(process.cwd(), process.env.FILE_UPLOAD_DIR)
  : isVercelRuntime
    ? path.join(os.tmpdir(), 'parks-connect-uploads')
  : path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(configuredUploadDir)) {
  fs.mkdirSync(configuredUploadDir, { recursive: true });
}

function safeExtension(originalName = '') {
  const ext = path.extname(originalName).toLowerCase();
  if (allowedExtensions.has(ext)) return ext;
  return '.jpg';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, configuredUploadDir),
  filename: (_req, file, cb) => {
    const ext = safeExtension(path.basename(file.originalname || 'upload.jpg'));
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  }
});

function fileFilter(_req, file, cb) {
  if (!allowedMimeTypes.has((file.mimetype || '').toLowerCase())) {
    return cb(new Error('Unsupported file type'));
  }
  return cb(null, true);
}

export function createImageUpload(fieldName = 'photo') {
  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxUploadBytes,
      files: 1
    }
  }).single(fieldName);
}

export const uploadsDir = configuredUploadDir;
