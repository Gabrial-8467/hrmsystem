import { env } from "@/config/env";
import { getAccessToken, getRefreshToken, setTokens } from "@/lib/auth/token-store";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export class NetworkError extends Error {
  constructor(public readonly cause?: unknown) {
    super("Network error. Check your connection and try again.");
    this.name = "NetworkError";
  }
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  /** Retry once after a refresh-token rotation on 401. Defaults to true. */
  retryOnAuthRefresh?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const base = env.API_URL;
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts.
  if (refreshPromise) return refreshPromise;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshPromise = (async () => {
    try {
      const res = await fetch(buildUrl("/api/v1/auth/refresh"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hrms-client": "hrms-frontend",
        },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const payload = (await res.json()) as
        | { success: true; data: { accessToken: string; refreshToken: string } }
        | { success: false }
        | null;
      if (!payload || payload.success !== true || !payload.data) return false;
      const { accessToken, refreshToken: nextRefreshToken } = payload.data;
      if (!accessToken || !nextRefreshToken) return false;
      setTokens(accessToken, nextRefreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    query,
    headers,
    retryOnAuthRefresh = true,
    signal,
  } = options;

  let res: Response;
  const hasBody = body !== undefined;
  const isFormData = hasBody && body instanceof FormData;
  const accessToken = getAccessToken();
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      signal,
      headers: {
        "x-hrms-client": "hrms-frontend",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(hasBody && !isFormData ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(hasBody ? { body: isFormData ? (body as FormData) : JSON.stringify(body) } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new NetworkError(err);
  }

  const payload = (await res.json().catch(() => null)) as
    | ApiSuccess<T>
    | { success: false; error: ApiErrorBody }
    | null;

  if (!res.ok || !payload || payload.success === false) {
    const errorBody = payload && "error" in payload ? payload.error : null;

    // Token expired -> attempt a silent refresh and retry once.
    if (
      res.status === 401 &&
      retryOnAuthRefresh &&
      (errorBody?.code === "TOKEN_INVALID" ||
        errorBody?.code === "TOKEN_MISSING" ||
        errorBody?.code === "SESSION_EXPIRED")
    ) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return apiRequest<T>(path, { ...options, retryOnAuthRefresh: false });
      }
    }

    throw new ApiError(
      res.status,
      errorBody ?? {
        code: "UNKNOWN_ERROR",
        message: payload && "error" in payload ? "Request failed" : res.statusText,
      },
    );
  }

  return payload.data;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  del: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
  /** Fetch a binary file (e.g. a PDF) and return it as a Blob. */
  async download(
    path: string,
    options: { query?: Record<string, QueryValue>; retryOnAuthRefresh?: boolean } = {},
  ): Promise<Blob> {
    const { query, retryOnAuthRefresh = true } = options;
    const accessToken = getAccessToken();
    const res = await fetch(buildUrl(path, query), {
      method: "GET",
      headers: {
        "x-hrms-client": "hrms-frontend",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

    if (!res.ok) {
      const errorBody = (await res.json().catch(() => null)) as { success?: boolean; error?: ApiErrorBody } | null;
      if (
        res.status === 401 &&
        retryOnAuthRefresh &&
        (errorBody?.error?.code === "TOKEN_INVALID" ||
          errorBody?.error?.code === "TOKEN_MISSING" ||
          errorBody?.error?.code === "SESSION_EXPIRED")
      ) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          return api.download(path, { ...options, retryOnAuthRefresh: false });
        }
      }
      throw new ApiError(
        res.status,
        errorBody?.error ?? {
          code: "UNKNOWN_ERROR",
          message: res.statusText || "Download failed",
        },
      );
    }

    return res.blob();
  },
};

/** Trigger a browser save for a Blob (e.g. generated PDF). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Map API error code -> user-facing message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof NetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}