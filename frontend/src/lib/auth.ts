export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

const USER_KEY = 'jobfinder_auth_user';

/** @deprecated Token comes from Firebase Auth; kept for clearSession compatibility. */
export function getStoredToken(): string | null {
  return null;
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.id || !parsed?.email) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** @deprecated Use persistUser — Firebase holds the ID token. */
export function persistSession(_token: string, user: AuthUser): void {
  persistUser(user);
}

export function clearSession(): void {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('jobfinder_auth_token');
}
