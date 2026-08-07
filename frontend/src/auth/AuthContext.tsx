import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setUnauthorizedHandler, type AuthUserDto } from '../lib/api';
import {
  clearSession,
  getStoredToken,
  getStoredUser,
  persistSession,
  type AuthUser,
} from '../lib/auth';

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setReady(true);
      return;
    }

    let cancelled = false;
    void api<{ data: AuthUserDto }>('/auth/me')
      .then((res) => {
        if (cancelled) {
          return;
        }
        const next = res.data;
        persistSession(token, next);
        setUser(next);
      })
      .catch(() => {
        if (!cancelled) {
          clearSession();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ data: { user: AuthUserDto; token: string } }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    );
    persistSession(res.data.token, res.data.user);
    setUser(res.data.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const res = await api<{ data: { user: AuthUserDto; token: string } }>(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({ email, password, name }),
        },
      );
      persistSession(res.data.token, res.data.user);
      setUser(res.data.user);
    },
    [],
  );

  const value = useMemo(
    () => ({ user, ready, login, register, logout }),
    [user, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
