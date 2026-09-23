import type { FastifyReply } from 'fastify';
import { env } from '../config/env';

export const ACCESS_COOKIE = 'hrms_at';
export const REFRESH_COOKIE = 'hrms_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';

export interface HrmsCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  domain?: string;
  maxAge?: number;
}

function baseOptions(path: string, maxAge?: number): HrmsCookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path,
    ...(maxAge !== undefined ? { maxAge } : {}),
    ...(env.NODE_ENV === 'production' ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function accessCookieOptions(ttlSeconds: number): HrmsCookieOptions {
  return baseOptions('/', ttlSeconds);
}

export function refreshCookieOptions(ttlSeconds: number): HrmsCookieOptions {
  return baseOptions(REFRESH_COOKIE_PATH, ttlSeconds);
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
  accessTtlSeconds: number,
  refreshTtlSeconds: number,
): void {
  reply.setCookie(ACCESS_COOKIE, accessToken, accessCookieOptions(accessTtlSeconds));
  reply.setCookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(refreshTtlSeconds));
}