import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../utils/errors';
import { verifyAccessToken } from '../utils/tokens';
import { loadUserAuthorization } from '../services/permissions';
import { ACCESS_COOKIE, accessCookieOptions } from '../utils/cookies';

/**
 * PreHandler: extracts and verifies the access token (HTTP-only cookie or
 * Authorization: Bearer header), loads roles/permissions and attaches the
 * authenticated user to `request.user`.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = extractToken(request);
  if (!token) {
    throw new UnauthorizedError('Authentication required', 'TOKEN_MISSING');
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    reply.clearCookie(ACCESS_COOKIE, accessCookieOptions(0));
    throw new UnauthorizedError('Session expired, please sign in again', 'TOKEN_INVALID');
  }

  let auth;
  try {
    auth = await loadUserAuthorization(request.server.prisma, payload.sub);
  } catch (err) {
    const code = err instanceof Error ? err.message : 'USER_NOT_FOUND';
    if (code === 'USER_NOT_FOUND') {
      throw new UnauthorizedError('Account no longer exists', 'TOKEN_INVALID');
    }
    throw err;
  }

  const dbUser = await request.server.prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      status: true,
    },
  });

  if (!dbUser || dbUser.status !== 'ACTIVE') {
    throw new UnauthorizedError('Account is not active', 'ACCOUNT_INACTIVE');
  }

  request.isAdmin = auth.isSuperAdmin;
  request.user = {
    id: auth.userId,
    organizationId: auth.organizationId,
    email: dbUser.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    status: dbUser.status,
    roles: auth.roles,
    permissions: auth.permissions,
    isSuperAdmin: auth.isSuperAdmin,
  };
}

export function extractBareToken(request: FastifyRequest): string | null {
  return extractToken(request);
}

function extractToken(request: FastifyRequest): string | null {
  const fromCookie = request.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;

  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return null;
}