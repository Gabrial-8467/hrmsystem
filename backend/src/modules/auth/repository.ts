import type { PrismaClient } from '@prisma/client';
import { sha256Hex } from '../../utils/tokens';

/**
 * Data-access layer for the auth domain. Keeps all Prisma calls isolated from
 * business logic.
 */
export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        userRoles: { select: { role: { select: { id: true, code: true, name: true } } } },
      },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: { select: { role: { select: { id: true, code: true, name: true } } } },
      },
    });
  }

  recordLogin(
    userId: string,
    ip?: string | null,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip ?? null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  incrementFailedAttempts(userId: string, attempts: number, lockedUntil: Date | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        ...(lockedUntil ? { lockedUntil } : {}),
      },
    });
  }

  resetFailedAttempts(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    return this.prisma.refreshToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        ipAddress: data.ip ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  }

  findRefreshToken(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
  }

  revokeRefreshToken(id: string, replacedById?: string) {
    return this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedById: replacedById ?? null },
    });
  }

  revokeAllForUser(userId: string, exceptIds?: string[]) {
    return this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptIds && exceptIds.length > 0 ? { id: { notIn: exceptIds } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  createPasswordResetToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.passwordResetToken.create({ data });
  }

  findPasswordResetToken(tokenHash: string) {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
  }

  markResetTokenUsed(id: string) {
    return this.prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
  }
}

export class TokenHasher {
  static hash(raw: string): string {
    return sha256Hex(raw);
  }
}