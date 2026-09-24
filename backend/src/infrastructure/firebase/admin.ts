import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth as getFirebaseAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore as getFirebaseFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage as getFirebaseStorage, type Storage } from 'firebase-admin/storage';

let app: App | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;
let storage: Storage | null = null;

/**
 * Initialize Firebase Admin once (ADC on Cloud Run, or GOOGLE_APPLICATION_CREDENTIALS locally).
 */
export function initFirebaseAdmin(projectId?: string): {
  app: App;
  db: Firestore;
  auth: Auth;
  storage: Storage;
} {
  if (app && firestore && auth && storage) {
    return { app, db: firestore, auth, storage };
  }

  if (!getApps().length) {
    const resolved =
      projectId?.trim() ||
      process.env.FIREBASE_PROJECT_ID?.trim() ||
      process.env.GCLOUD_PROJECT?.trim() ||
      process.env.GOOGLE_CLOUD_PROJECT?.trim();

    initializeApp({
      credential: applicationDefault(),
      ...(resolved ? { projectId: resolved } : {}),
      ...(process.env.FIREBASE_STORAGE_BUCKET?.trim()
        ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET.trim() }
        : resolved
          ? { storageBucket: `${resolved}.appspot.com` }
          : {}),
    });
  }

  app = getApps()[0]!;
  firestore = getFirebaseFirestore();
  auth = getFirebaseAuth();
  storage = getFirebaseStorage();

  firestore.settings({ ignoreUndefinedProperties: true });

  return { app, db: firestore, auth, storage };
}

export function getFirestore(): Firestore {
  if (!firestore) {
    return initFirebaseAdmin().db;
  }
  return firestore;
}

export function getAuth(): Auth {
  if (!auth) {
    return initFirebaseAdmin().auth;
  }
  return auth;
}

export function getStorage(): Storage {
  if (!storage) {
    return initFirebaseAdmin().storage;
  }
  return storage;
}

export function newId(): string {
  return getFirestore().collection('_').doc().id;
}

export function asDate(value: unknown): Date | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function asDateRequired(value: unknown, fallback = new Date()): Date {
  return asDate(value) ?? fallback;
}
