import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { apiGet, apiPost, clearToken, getToken, setToken } from './api';

type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  onboarded: boolean;
  goal?: string;
  experience?: string;
  frequency?: number;
  equipment?: string[];
  injuries?: string;
  units?: 'kg' | 'lbs';
  streak?: number;
  is_premium?: boolean;
  subscription_tier?: string | null;
  subscription_interval?: 'month' | 'year' | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsDemo: () => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setUserLocal: (u: User | null) => void;
};

const AuthCtx = createContext<AuthState>({} as any);

export function useAuth() {
  return useContext(AuthCtx);
}

async function exchangeSessionToken(token: string) {
  return apiPost<{ session_token: string; user: User }>('/auth/google/session', { session_token: token });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        return;
      }
      const u = await apiGet<User>('/auth/me');
      setUser(u);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  // On mount: check existing session OR handle web hash session_id
  useEffect(() => {
    (async () => {
      try {
        // Web: handle session_id in URL fragment first
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const hash = window.location.hash || '';
          const search = window.location.search || '';
          let sessionId = '';
          if (hash.includes('session_id=')) {
            sessionId = hash.split('session_id=')[1].split('&')[0];
          } else if (search.includes('session_id=')) {
            sessionId = search.split('session_id=')[1].split('&')[0];
          }
          if (sessionId) {
            try {
              const out = await exchangeSessionToken(sessionId);
              await setToken(out.session_token);
              window.history.replaceState(null, '', window.location.pathname);
              setUser(out.user);
              setLoading(false);
              return;
            } catch (e) {
              console.warn('web session exchange failed', e);
            }
          }
        }
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  // Mobile: listen for deep link with session_id (cold start + hot)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handle = async (url: string | null) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const sid = (parsed.queryParams?.session_id as string) || '';
      if (sid) {
        try {
          const out = await exchangeSessionToken(sid);
          await setToken(out.session_token);
          setUser(out.user);
        } catch (e) {
          console.warn('mobile session exchange failed', e);
        }
      }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectUrl =
      Platform.OS === 'web'
        ? (typeof window !== 'undefined' ? window.location.origin + '/' : '')
        : Linking.createURL('auth');
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.href = authUrl;
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === 'success' && result.url) {
      const parsed = Linking.parse(result.url);
      const sid = (parsed.queryParams?.session_id as string) || '';
      if (sid) {
        const out = await exchangeSessionToken(sid);
        await setToken(out.session_token);
        setUser(out.user);
      }
    }
  }, []);

  // Demo sign-in for sandbox without Google: creates session via Emergent demo session-data.
  // We hit our backend with a fake demo email by routing through the same /auth/google/session path
  // by injecting a synthetic user — handled with a dev endpoint fallback.
  const signInAsDemo = useCallback(async () => {
    try {
      const out = await apiPost<{ session_token: string; user: User }>('/auth/demo/login', {});
      await setToken(out.session_token);
      setUser(out.user);
    } catch (e) {
      console.warn('demo login failed', e);
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } catch {}
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, signInWithGoogle, signInAsDemo, refresh, signOut, setUserLocal: setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
