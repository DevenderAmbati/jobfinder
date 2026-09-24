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
  getStoredUser,
  persistUser,
  type AuthUser,
} from '../lib/auth';
import {
  firebaseLogin,
  firebaseLogout,
  firebaseRegister,
  onFirebaseAuth,
  toAuthUser,
} from '../lib/firebase';

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function syncProfile(): Promise<AuthUser> {
  const res = await api<{ data: AuthUserDto }>('/auth/me');
  persistUser(res.data);
  return res.data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    void firebaseLogout();
    clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const unsub = onFirebaseAuth((fbUser) => {
      void (async () => {
        try {
          if (!fbUser) {
            clearSession();
            setUser(null);
            return;
          }
          persistUser(toAuthUser(fbUser));
          const profile = await syncProfile();
          setUser(profile);
        } catch {
          if (fbUser) {
            setUser(toAuthUser(fbUser));
          } else {
            clearSession();
            setUser(null);
          }
        } finally {
          setReady(true);
        }
      })();
    });
    return unsub;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const fbUser = await firebaseLogin(email, password);
    persistUser(toAuthUser(fbUser));
    const profile = await syncProfile();
    setUser(profile);
  }, []);

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const fbUser = await firebaseRegister(email, password, name);
      persistUser(toAuthUser(fbUser));
      const profile = await syncProfile();
      setUser(profile);
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
