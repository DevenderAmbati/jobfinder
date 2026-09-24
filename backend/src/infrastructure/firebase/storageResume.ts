import type { Firestore } from 'firebase-admin/firestore';
import { getStorage } from './admin.js';

/**
 * Upload a resume PDF buffer to Cloud Storage and return a gs:// path.
 */
export async function uploadResumePdf(input: {
  userId: string;
  buffer: Buffer;
  originalName: string;
  bucket?: string;
}): Promise<string> {
  const storage = getStorage();
  const bucketName =
    input.bucket?.trim() ||
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    undefined;
  const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
  const safe = input.originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = `resumes/${input.userId}/${Date.now()}-${safe}`;
  const file = bucket.file(objectPath);
  await file.save(input.buffer, {
    contentType: 'application/pdf',
    resumable: false,
    metadata: { cacheControl: 'private, max-age=0' },
  });
  return `gs://${bucket.name}/${objectPath}`;
}

export type { Firestore };
