import type { PrismaClient } from '@prisma/client';
import { BadRequestError, NotFoundError, UnauthorizedError, UnprocessableError } from '../../utils/errors';
import { hashPassword, validatePasswordPolicy, verifyPassword } from '../../utils/password';
import {
  accessTokenExpirySeconds,
  generateOpaqueToken,
  passwordResetTtlMinutes,
  refreshTokenTtlDays,
  signAccessToken,
} from '../../utils/tokens';
import { AuthRepository, TokenHasher } from './repository';
import type { AuthContext, AuthSession, CurrentUser } from './types';
import { loadUserAuthorization } from '../../services/permissions';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface LoginResult {
  data: AuthSession;
  refreshToken: string;
}

export class AuthService {
  private readonly prisma: PrismaClient;
  private readonly repo: AuthRepository;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.repo = new AuthRepository(prisma);
  }

  private async buildSession(
    userId: string,
    refreshTtlSeconds: number,
  ): Promise<AuthSession> {
    const auth = await loadUserAuthorization(this.prisma, userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        organizationId: true,
        status: true,
        mustChangePassword: true,
      },
    });

    const accessToken = signAccessToken({
      sub: user.id,
      orgId: user.organizationId,
      roles: auth.roles.map((r) => r.code),
      type: 'access',
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        organizationId: user.organizationId,
        status: user.status,
        roles: auth.roles,
        permissions: Array.from(auth.permissions),
        isSuperAdmin: auth.isSuperAdmin,
        mustChangePassword: user.mustChangePassword,
      },
      accessToken,
      accessTokenExpiresIn: accessTokenExpirySeconds(),
      refreshTokenExpiresIn: refreshTtlSeconds,
    };
  }

  private async issueRefreshToken(
    userId: string,
    ttlSeconds: number,
    ctx: AuthContext,
  ): Promise<string> {
    const refreshToken = generateOpaqueToken();
    await this.repo.createRefreshToken({
      userId,
      tokenHash: TokenHasher.hash(refreshToken),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      ip: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return refreshToken;
  }

  async login(email: string, password: string, ctx: AuthContext): Promise<LoginResult> {
    const user = await this.repo.findByEmail(email);
    const now = Date.now();

    if (user?.lockedUntil && user.lockedUntil.getTime() > now) {
      const minsLeft = Math.ceil((user.lockedUntil.getTime() - now) / 60000);
      throw new UnprocessableError(
        `Account is temporarily locked. Try again in ${minsLeft} minute(s).`,
        'ACCOUNT_LOCKED',
      );
    }

    // Always run a hash comparison to keep timing uniform for unknown emails.
    const valid = user
      ? await verifyPassword(user.passwordHash, password)
      : await hashPassword(password);

    if (!user || !valid) {
      if (user) {
        const attempts = user.failedLoginAttempts + 1;
        const maxAttempts = env.LOGIN_MAX_ATTEMPTS;
        const shouldLock = attempts >= maxAttempts;
        await this.repo.incrementFailedAttempts(
          user.id,
          attempts,
          shouldLock ? new Date(Date.now() + env.LOGIN_LOCKOUT_MINUTES * 60_000) : null,
        );
        if (shouldLock) {
          throw new UnprocessableError(
            `Too many failed attempts. Account locked for ${env.LOGIN_LOCKOUT_MINUTES} minutes.`,
            'ACCOUNT_LOCKED',
          );
        }
      }
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account is not active. Contact your administrator.', 'ACCOUNT_INACTIVE');
    }

    await this.repo.recordLogin(user.id, ctx.ipAddress);

    const refreshTtl = refreshTokenTtlDays() * 24 * 60 * 60;
    const data = await this.buildSession(user.id, refreshTtl);
    const refreshToken = await this.issueRefreshToken(user.id, refreshTtl, ctx);

    return { data, refreshToken };
  }

  async refresh(
    refreshCookie: string,
    ctx: AuthContext,
  ): Promise<LoginResult | null> {
    if (!refreshCookie) return null;

    const stored = await this.repo.findRefreshToken(TokenHasher.hash(refreshCookie));
    if (!stored) return null;

    if (stored.revokedAt) {
      // Possible token reuse: revoke the entire token family for this user.
      await this.repo.revokeAllForUser(stored.userId);
      throw new UnauthorizedError('Session has been terminated. Please sign in again.', 'TOKEN_REUSE_DETECTED');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      await this.repo.revokeRefreshToken(stored.id);
      return null;
    }

    const refreshTtl = refreshTokenTtlDays() * 24 * 60 * 60;

    // Rotate: create the replacement token, then revoke the presented token.
    const replacement = await this.issueRefreshToken(stored.userId, refreshTtl, ctx);
    const created = await this.repo.findRefreshToken(TokenHasher.hash(replacement));
    await this.repo.revokeRefreshToken(stored.id, created?.id);

    const data = await this.buildSession(stored.userId, refreshTtl);
    return { data, refreshToken: replacement };
  }

  async logout(refreshCookie: string | undefined): Promise<void> {
    if (!refreshCookie) return;
    const stored = await this.repo.findRefreshToken(TokenHasher.hash(refreshCookie));
    if (stored && !stored.revokedAt) {
      await this.repo.revokeRefreshToken(stored.id);
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.repo.revokeAllForUser(userId);
  }

  async requestPasswordReset(email: string, ctx: AuthContext): Promise<void> {
    const user = await this.repo.findByEmail(email);
    if (!user || user.status !== 'ACTIVE') {
      // Deliberately identical outcome to avoid account enumeration.
      logger.info({ ip: ctx.ipAddress }, 'Password reset requested for unknown/inactive account');
      return;
    }

    await this.repo.revokeAllForUser(user.id);

    const token = generateOpaqueToken();
    const ttlSec = passwordResetTtlMinutes() * 60;
    await this.repo.createPasswordResetToken({
      userId: user.id,
      tokenHash: TokenHasher.hash(token),
      expiresAt: new Date(Date.now() + ttlSec * 1000),
    });

    logger.info({ userId: user.id, ip: ctx.ipAddress }, 'Password reset token issued');
    // TODO(phase hardening): deliver via notification/email service.
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      throw new BadRequestError(policyError, 'WEAK_PASSWORD');
    }

    const stored = await this.repo.findPasswordResetToken(TokenHasher.hash(token));
    if (!stored || stored.usedAt !== null || stored.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestError('Password reset token is invalid or has expired', 'INVALID_RESET_TOKEN');
    }

    const user = await this.repo.findById(stored.userId);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    const passwordHash = await hashPassword(newPassword);
    await this.repo.updatePassword(user.id, passwordHash);
    await this.repo.markResetTokenUsed(stored.id);
    await this.repo.revokeAllForUser(user.id);
  }

  async currentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            status: true,
            timezone: true,
            currency: true,
            logoUrl: true,
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }
    const auth = await loadUserAuthorization(this.prisma, userId);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      title: user.title,
      locale: user.locale,
      emailVerified: user.emailVerifiedAt !== null,
      organization: user.organization,
      roles: auth.roles,
      permissions: Array.from(auth.permissions).sort(),
      isSuperAdmin: auth.isSuperAdmin,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    const policyError = validatePasswordPolicy(next);
    if (policyError) {
      throw new BadRequestError(policyError, 'WEAK_PASSWORD');
    }

    if (!(await verifyPassword(user.passwordHash, current))) {
      throw new BadRequestError('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
    }

    if (await verifyPassword(user.passwordHash, next)) {
      throw new BadRequestError('New password must be different from the current password', 'PASSWORD_UNCHANGED');
    }

    const passwordHash = await hashPassword(next);
    await this.repo.updatePassword(userId, passwordHash);
    await this.repo.revokeAllForUser(userId);
  }
}