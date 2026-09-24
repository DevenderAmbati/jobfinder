import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  type Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function readConfig(): FirebaseWebConfig {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? '';
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? '';
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '';
  const storageBucket =
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() ?? '';
  const messagingSenderId =
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '';
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? '';

  if (!apiKey || !projectId || !appId) {
    throw new Error(
      'Missing VITE_FIREBASE_* env vars. Copy frontend/.env.example to frontend/.env.local',
    );
  }

  return {
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: storageBucket || `${projectId}.appspot.com`,
    messagingSenderId,
    appId,
  };
}

export function getFirebaseAuth(): Auth {
  if (auth) {
    return auth;
  }
  app = initializeApp(readConfig());
  auth = getAuth(app);
  return auth;
}

export async function firebaseLogin(
  email: string,
  password: string,
): Promise<User> {
  const result = await signInWithEmailAndPassword(
    getFirebaseAuth(),
    email.trim(),
    password,
  );
  return result.user;
}

export async function firebaseRegister(
  email: string,
  password: string,
  name?: string,
): Promise<User> {
  const result = await createUserWithEmailAndPassword(
    getFirebaseAuth(),
    email.trim(),
    password,
  );
  if (name?.trim()) {
    await updateProfile(result.user, { displayName: name.trim() });
  }
  return result.user;
}

export async function firebaseLogout(): Promise<void> {
  await signOut(getFirebaseAuth());
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = getFirebaseAuth().currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken(forceRefresh);
}

export function onFirebaseAuth(
  handler: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(getFirebaseAuth(), handler);
}

export function toAuthUser(user: User): {
  id: string;
  email: string;
  name: string | null;
} {
  return {
    id: user.uid,
    email: user.email ?? '',
    name: user.displayName ?? null,
  };
}
