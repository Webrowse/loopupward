"use client";

/** Client for the LoopUpward Rust API (backend/). */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export function apiConfigured(): boolean {
  return API_URL.length > 0;
}

const TOKEN_KEY = "lifeos-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export interface ApiUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "user" | "owner";
  premium: boolean;
  premiumUntil: string | null;
  plan: string | null;
  limits: Record<string, number>;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let code = "error";
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      code = data.code ?? code;
      message = data.error ?? message;
    } catch {}
    throw new ApiRequestError(res.status, code, message);
  }
  return (await res.json()) as T;
}
