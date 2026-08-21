import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearSessionToken, readSessionToken, writeSessionToken } from '../storage/secure-storage';
import { planetApi } from '../api/planet-api';
import { setUnauthorizedHandler } from '../network/api-client';
import { ApiError } from '../network/api-client';
import { queryClient } from '../query/query-client';

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

type SessionContextValue = {
  status: SessionStatus;
  token: string | null;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: React.PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSessionToken();
      queryClient.clear();
      setToken(null);
      setStatus('unauthenticated');
    });
    return () => setUnauthorizedHandler();
  }, []);

  useEffect(() => {
    let mounted = true;
    void readSessionToken().then((savedToken) => {
      if (!mounted) return;
      if (!savedToken) {
        setStatus('unauthenticated');
        return;
      }
      // A token in Secure Store is only a candidate session. Validate it
      // against the API before opening protected screens so expired/revoked
      // sessions cannot leave the app in a half-authenticated state.
      void planetApi.me.get().then(() => {
        if (!mounted) return;
        setToken(savedToken);
        setStatus('authenticated');
      }).catch(async (error) => {
        if (!mounted) return;
        if (error instanceof ApiError && error.status === 401) {
          await clearSessionToken();
          setToken(null);
          setStatus('unauthenticated');
          return;
        }
        // A timeout, offline device, or 5xx does not invalidate a session.
        // Keep the token and let protected screens show their retry state.
        setToken(savedToken);
        setStatus('authenticated');
      });
    });
    return () => { mounted = false; };
  }, []);

  const signIn = useCallback(async (nextToken: string) => {
    await writeSessionToken(nextToken);
    queryClient.clear();
    setToken(nextToken);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    try { await planetApi.auth.logout(); } catch { /* Local sign-out must still complete if the API is offline. */ }
    await clearSessionToken();
    queryClient.clear();
    setToken(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo(() => ({ status, token, signIn, signOut }), [signIn, signOut, status, token]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}
