const TOKEN_KEY = 'jobfinder_auth_token';
const USER_KEY = 'jobfinder_auth_user';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
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

export function persistSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
