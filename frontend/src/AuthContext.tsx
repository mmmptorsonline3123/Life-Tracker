import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setToken } from './api';

type User = { user_id: string; email: string; name?: string | null; picture?: string | null };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setSessionToken: (token: string, user: User) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const u: any = await api.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If we're on the auth callback URL, let that screen handle auth
    if (typeof window !== 'undefined' && window.location?.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch {}
    await setToken(null);
    setUser(null);
  }, []);

  const setSessionToken = useCallback(async (token: string, u: User) => {
    await setToken(token);
    setUser(u);
    setLoading(false);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, refresh, signOut, setSessionToken }}>
      {children}
    </Ctx.Provider>
  );
}
