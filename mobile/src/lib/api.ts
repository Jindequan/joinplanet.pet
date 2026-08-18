/**
 * API client for planet-api (API-CONTRACT v2).
 * Base: `${EXPO_PUBLIC_API_BASE || http://localhost:8081}/api/v1`
 * Auth: Bearer token stored per platform — expo-secure-store on native
 * (Keychain/Keystore), localStorage on web (secure-store has no web impl).
 *
 * 错误契约（v2，冻结）：
 *   { "error": { "code": "...", "message": "...", "request_id": "..." }, ...extras }
 * extras：TASK_LOG_EXISTS 附权威 `log`；QUOTA_* 附 `usage`。
 * 客户端宽容策略：未知 code 也有 message 可显示；未知字段一律忽略。
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'planet_token';

const env = process.env as Record<string, string | undefined>;
const RAW_BASE = env.EXPO_PUBLIC_API_BASE || 'http://localhost:8081';
export const API_BASE = `${RAW_BASE.replace(/\/+$/, '')}/api/v1`;

/** 分享查看页（Web）基址：接收方免装 App；dev 指向本地 landing。 */
export const WEB_SHARE_BASE = (env.EXPO_PUBLIC_WEB_SHARE_BASE || 'https://www.joinplanet.pet').replace(/\/+$/, '');
export const shareURL = (token: string) => `${WEB_SHARE_BASE}/s/${token}`;

export class ApiError extends Error {
  readonly status: number;
  /** 契约错误码（如 QUOTA_PETS_EXCEEDED / TASK_LOG_EXISTS）；0 = 网络不可用 */
  readonly code: string;
  /** 原始响应体（含 extras：log / usage / current） */
  readonly data: unknown;

  constructor(status: number, code: string, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }

  /** 409 权威任务记录（契约：客户端静默采用） */
  get authoritativeLog(): unknown | null {
    return (this.data as { log?: unknown } | null)?.log ?? null;
  }

  /** 配额错误的用量载荷（驱动配额文案，不写死数字） */
  get usage(): Record<string, unknown> | null {
    return (this.data as { usage?: Record<string, unknown> } | null)?.usage ?? null;
  }
}

/** 401 — token is cleared before this is thrown; caller should route to /welcome. */
export class AuthError extends ApiError {
  constructor(message = 'Session expired') {
    super(401, 'UNAUTHENTICATED', message, null);
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
  /** JSON-serializable body. */
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
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network unavailable');
  }

  if (res.status === 401 && auth) {
    await clearToken();
    throw new AuthError();
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    const err = data?.error;
    throw new ApiError(
      res.status,
      err?.code ?? `HTTP_${res.status}`,
      err?.message?.length ? err.message : `Request failed (${res.status})`,
      data,
    );
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
  opts?: Omit<ApiOptions, 'method'>,
): Promise<T> {
  return api<T>(path, { ...opts, method: 'DELETE' });
}
