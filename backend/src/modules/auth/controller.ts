import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './service';
import { sendSuccess } from '../../utils/response';
import { contextFromReq } from '../../services/audit';
import type {
  ChangePasswordInput,
  LoginInput,
  RefreshInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './schema';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  async login(request: FastifyRequest, reply: FastifyReply, body: LoginInput) {
    const ctx = contextFromReq(request);
    const result = await this.service.login(body.email, body.password, ctx);
    await request.server.audit.record({
      ...ctx,
      organizationId: result.data.user.organizationId,
      action: 'auth.login',
      entity: 'user',
      entityId: result.data.user.id,
      metadata: { email: body.email },
    });
    return sendSuccess(
      reply,
      { ...result.data, refreshToken: result.refreshToken },
      'Signed in successfully',
    );
  }

  async refresh(request: FastifyRequest, reply: FastifyReply, body: RefreshInput) {
    const ctx = contextFromReq(request);
    const result = await this.service.refresh(body.refreshToken, ctx);
    if (!result) {
      return sendSuccess(reply, null, 'Session is no longer valid');
    }
    return sendSuccess(
      reply,
      { ...result.data, refreshToken: result.refreshToken },
      'Session refreshed',
    );
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const ctx = contextFromReq(request);
    const refreshToken = (request.body as { refreshToken?: string } | undefined)?.refreshToken;
    await this.service.logout(refreshToken);
    if (request.user) {
      await this.service.logoutAll(request.user.id);
      await request.server.audit.record({
        ...ctx,
        action: 'auth.logout',
        entity: 'user',
        entityId: request.user.id,
      });
    }
    return sendSuccess(reply, null, 'Signed out successfully');
  }

  async me(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user;
    if (!user) {
      throw new Error('Authenticated route required');
    }
    const current = await this.service.currentUser(user.id);
    return sendSuccess(reply, current);
  }

  async requestPasswordReset(request: FastifyRequest, reply: FastifyReply, body: RequestPasswordResetInput) {
    const ctx = contextFromReq(request);
    await this.service.requestPasswordReset(body.email, ctx);
    return sendSuccess(reply, null, 'If that email exists, a reset link has been sent');
  }

  async resetPassword(request: FastifyRequest, reply: FastifyReply, body: ResetPasswordInput) {
    await this.service.resetPassword(body.token, body.password);
    return sendSuccess(reply, null, 'Password has been reset. Please sign in.');
  }

  async changePassword(request: FastifyRequest, reply: FastifyReply, body: ChangePasswordInput) {
    const ctx = contextFromReq(request);
    await this.service.changePassword(request.user!.id, body.currentPassword, body.newPassword);
    await request.server.audit.record({
      ...ctx,
      action: 'auth.change_password',
      entity: 'user',
      entityId: request.user!.id,
    });
    return sendSuccess(reply, null, 'Password changed successfully');
  }

  async verifyEmail(_request: FastifyRequest, reply: FastifyReply, _body: VerifyEmailInput) {
    // Placeholder for the email-verification architecture, wired in Phase 10
    // hardening together with the notification service.
    return sendSuccess(reply, null, 'Email verification flow is not yet enabled');
  }
}