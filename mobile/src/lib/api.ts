/**
 * API client for the PLANET backend (API contract v1).
 * Base: `${EXPO_PUBLIC_API_BASE || http://localhost:8080}/api/v1`
 * Auth: Bearer token stored per platform — expo-secure-store on native
 * (Keychain/Keystore), localStorage on web (secure-store has no web impl).
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'planet_token';

const env = process.env as Record<string, string | undefined>;
const RAW_BASE = env.EXPO_PUBLIC_API_BASE || 'http://localhost:8080';
export const API_BASE = `${RAW_BASE.replace(/\/+$/, '')}/api/v1`;

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/** 401 — token is cleared before this is thrown; caller should route to /welcome. */
export class AuthError extends ApiError {
  constructor(message = 'Session expired') {
    super(401, message, null);
    this.name = 'AuthError';
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // storage unavailable — session lives in memory only
    }
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // already gone
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // already gone — nothing to do
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON-serializable body, or FormData for multipart uploads. */
  body?: unknown;
  /** Attach Authorization header (default true). */
  auth?: boolean;
  headers?: Record<string, string>;
}

/**
 * Core request helper. Throws ApiError on non-2xx; on 401 clears the stored
 * token and throws AuthError so the app can fall back to /welcome.
 */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  const isFormData = body instanceof FormData;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network unavailable');
  }

  if (res.status === 401 && auth) {
    await clearToken();
    throw new AuthError();
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    const message =
      data && typeof data.error === 'string' && data.error.length > 0
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) return (await res.json()) as T;
  return undefined as T;
}

export function get<T = unknown>(path: string, opts?: Omit<ApiOptions, 'method' | 'body'>): Promise<T> {
  return api<T>(path, { ...opts, method: 'GET' });
}

export function post<T = unknown>(
  path: string,
  body?: unknown,
  opts?: Omit<ApiOptions, 'method' | 'body'>,
): Promise<T> {
  return api<T>(path, { ...opts, method: 'POST', body });
}

export function patch<T = unknown>(
  path: string,
  body?: unknown,
  opts?: Omit<ApiOptions, 'method' | 'body'>,
): Promise<T> {
  return api<T>(path, { ...opts, method: 'PATCH', body });
}

export function del<T = unknown>(
  path: string,
  opts?: Omit<ApiOptions, 'method' | 'body'>,
): Promise<T> {
  return api<T>(path, { ...opts, method: 'DELETE' });
}

/** Multipart upload — pass a prepared FormData; Content-Type is set by the transport. */
export function upload<T = unknown>(
  path: string,
  form: FormData,
  opts?: Omit<ApiOptions, 'method' | 'body'>,
): Promise<T> {
  return api<T>(path, { ...opts, method: 'POST', body: form });
}
