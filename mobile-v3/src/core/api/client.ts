import { ApiError } from "./errors";
import { safeStorage } from "../storage";

const API_URL =
  (import.meta.env.VITE_PLANET_API_URL as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? "/api/v1";
let onUnauthorized: (() => void) | undefined;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
};

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorFromResponse(response: Response, body: unknown) {
  const envelope =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const details =
    envelope.error && typeof envelope.error === "object"
      ? (envelope.error as Record<string, unknown>)
      : envelope;
  return new ApiError({
    status: response.status,
    code:
      typeof details.code === "string"
        ? details.code
        : `HTTP_${response.status}`,
    message:
      typeof details.message === "string"
        ? details.message
        : response.statusText || "Request failed",
    requestId:
      typeof details.request_id === "string" ? details.request_id : undefined,
    current: envelope.current,
    log: envelope.log,
    usage: envelope.usage,
    retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
  });
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15000,
  );
  const token = safeStorage.get("planet.session");
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.idempotencyKey)
    headers.set("Idempotency-Key", options.idempotencyKey);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      headers,
      signal: options.signal ?? controller.signal,
    });
    const body = await parseBody(response);
    if (!response.ok) {
      const error = errorFromResponse(response, body);
      if (response.status === 401) onUnauthorized?.();
      throw error;
    }
    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ApiError({
        status: 0,
        code: "NETWORK_TIMEOUT",
        message: "请求超时了,请重试。",
      });
    if (error instanceof TypeError)
      throw new ApiError({
        status: 0,
        code: "NETWORK_OFFLINE",
        message: "当前网络不可用,改动不会丢失。",
      });
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "DELETE", body }),
};
