import { appConfig } from '../config';
import { readSessionToken } from '../storage/secure-storage';

let unauthorizedHandler: (() => void) | undefined;

export function setUnauthorizedHandler(handler?: () => void) {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => '');
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, appConfig.requestTimeoutMs);
  const callerSignal = options.signal;
  const abortFromCaller = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const token = await readSessionToken();
  const headers = new Headers(options.headers);

  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  try {
    const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
      // Always use the combined signal so the request timeout still applies
      // when a caller also supplies an AbortSignal.
      signal: controller.signal,
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      if (response.status === 401) unauthorizedHandler?.();
      const body = payload as { error?: { code?: string; message?: string }; message?: string } | null;
      const retryRaw = response.headers.get('Retry-After');
      const retryAfterSeconds = retryRaw ? Number.parseInt(retryRaw, 10) : undefined;
      throw new ApiError(
        body?.error?.message ?? body?.message ?? `Request failed (${response.status})`,
        response.status,
        body?.error?.code,
        payload,
        Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // React Native has no DOMException, so detect an aborted request via the
    // AbortController signal rather than `error instanceof DOMException`.
    if (timedOut) throw new ApiError('The request timed out. Please try again.', 0, 'TIMEOUT');
    if (callerSignal?.aborted) throw new ApiError('The request was cancelled.', 0, 'ABORTED');
    throw new ApiError('Unable to connect. Please check your connection.', 0, 'NETWORK_ERROR', error);
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) => request<T>(path, { ...options, method: 'DELETE' }),
};
