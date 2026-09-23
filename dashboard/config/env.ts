export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Hrmsify";

export const APP_TAGLINE = process.env.NEXT_PUBLIC_APP_TAGLINE ?? "HR operations, simplified";

/** Comma separated list of bootstrapped demo credentials shown on the login screen (dev only). */
export const DEMO_EMAILS = (process.env.NEXT_PUBLIC_DEMO_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const env = {
  API_URL,
  APP_NAME,
  APP_TAGLINE,
  DEMO_EMAILS,
} as const;