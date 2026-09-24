import multer from 'multer';
import { AppError } from '../../shared/errors/AppError.js';

/**
 * Keep resume PDFs in memory so they can be uploaded to Cloud Storage.
 */
export const resumeUpload = multer({
  storage: multer.memoryStorage(),
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
