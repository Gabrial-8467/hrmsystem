import argon2 from 'argon2';
import { env } from '../config/env';

const ARGON_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Enforce shared password policy across registration & resets. */
export function validatePasswordPolicy(plain: string): string | null {
  if (plain.length < env.PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${env.PASSWORD_MIN_LENGTH} characters long`;
  }
  if (!/[a-zA-Z]/.test(plain)) {
    return 'Password must contain at least one letter';
  }
  if (!/[0-9]/.test(plain)) {
    return 'Password must contain at least one number';
  }
  return null;
}