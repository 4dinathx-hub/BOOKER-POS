import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setTokens, clearTokens } from '../api/client';

interface AuthUser {
  sub: string;
  actorType: 'OWNER' | 'EMPLOYEE' | 'SUPER_ADMIN';
  role: string;
  companyId: string | null;
  restaurantId: string | null;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginOwner: (email: string, password: string) => Promise<void>;
  loginEmployee: (restaurantId: string, code: string, pin: string) => Promise<void>;
  logout: () => void;
  switchBranch: (restaurantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (localStorage.getItem('booker_access_token')) loadMe();
    else setLoading(false);
  }, []);

  async function loginOwner(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    setTokens(data.accessToken, data.refreshToken);
    await loadMe();
  }

  async function loginEmployee(restaurantId: string, code: string, pin: string) {
    const { data } = await api.post('/auth/employee-login', { restaurantId, code, pin });
    setTokens(data.accessToken, data.refreshToken);
    await loadMe();
  }

  async function switchBranch(restaurantId: string) {
    const { data } = await api.post('/auth/switch-branch', { restaurantId });
    setTokens(data.accessToken);
    await loadMe();
  }

  function logout() {
    api.post('/auth/logout').catch(() => {});
    clearTokens();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginOwner, loginEmployee, logout, switchBranch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
