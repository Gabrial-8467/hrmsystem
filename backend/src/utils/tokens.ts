import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string; // userId
  orgId: string;
  roles: string[]; // role codes
  type: 'access';
}

export interface ResetTokenPayload {
  sub: string;
  type: 'reset';
  purpose: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: 'hrms-backend',
    audience: 'hrms-frontend',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'hrms-backend',
    audience: 'hrms-frontend',
  });
  if (typeof decoded === 'string') {
    throw new Error('Invalid token payload');
  }
  const payload = decoded as jwt.JwtPayload & Partial<AccessTokenPayload>;
  if (payload.type !== 'access' || !payload.sub || !payload.orgId) {
    throw new Error('Invalid token kind');
  }
  return {
    sub: payload.sub,
    orgId: payload.orgId,
    roles: payload.roles ?? [],
    type: 'access',
  };
}

/** Generate an opaque high-entropy token (refresh tokens, reset tokens). */
export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function accessTokenExpirySeconds(): number {
  return env.JWT_ACCESS_TTL;
}

export function refreshTokenTtlDays(): number {
  return env.REFRESH_TOKEN_TTL_DAYS;
}

export function passwordResetTtlMinutes(): number {
  return env.PASSWORD_RESET_TTL_MINUTES;
}