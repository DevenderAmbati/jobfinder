import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { AppError } from '../../shared/errors/AppError.js';

const uploadsDir = path.resolve(process.cwd(), 'uploads', 'resumes');

function ensureUploadsDir(): void {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureUploadsDir();
    cb(null, uploadsDir);
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const resumeUpload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (!ok) {
      cb(new AppError('VALIDATION_ERROR', 'Only PDF uploads are allowed', 400));
      return;
    }
    cb(null, true);
  },
});
