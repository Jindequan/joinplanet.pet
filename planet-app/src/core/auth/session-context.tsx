import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, setUnauthorizedHandler } from "../api/client";
import { queryKeys } from "../query/keys";

export type User = {
  id: string;
  email: string;
  display_name: string;
  locale?: string;
  created_at: string;
};
export type MeResponse = {
  user: User;
  entitlements: Array<Record<string, unknown>>;
};

type SessionContextValue = {
  token: string | null;
  user: User | null;
  me: MeResponse | undefined;
  meError: unknown;
  isLoading: boolean;
  retryMe: () => Promise<unknown>;
  signIn: (token: string) => void;
  signOut: (remote?: boolean) => Promise<void>;
  clearSession: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() =>
    localStorage.getItem("planet.session"),
  );
  const meQuery = useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => api.get<MeResponse>("/me"),
    enabled: Boolean(token),
  });

  const clearSession = useCallback(() => {
    localStorage.removeItem("planet.session");
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => setUnauthorizedHandler(clearSession), [clearSession]);

  const value = useMemo<SessionContextValue>(
    () => ({
      token,
      user: meQuery.data?.user ?? null,
      me: meQuery.data,
      meError: meQuery.error,
      isLoading: Boolean(token) && meQuery.isPending,
      retryMe: meQuery.refetch,
      signIn: (nextToken) => {
        localStorage.setItem("planet.session", nextToken);
        setToken(nextToken);
        void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      },
      signOut: async (remote = true) => {
        try {
          if (remote && token) await api.delete("/auth/session");
        } finally {
          clearSession();
        }
      },
      clearSession,
    }),
    [clearSession, meQuery.data, meQuery.error, meQuery.isPending, meQuery.refetch, queryClient, token],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error("useSession must be used inside SessionProvider");
  return context;
}
