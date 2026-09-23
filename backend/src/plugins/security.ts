import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { allowedOrigins } from '../config/env';

const COOKIE_SIGNING_SECRET =
  process.env.COOKIE_SIGNING_SECRET ??
  (process.env.NODE_ENV === 'production'
    ? undefined
    : 'dev-cookie-signing-secret-not-for-production');

/**
 * Security plugins: CORS (credentialed), Helmet headers, cookie parsing and
 * signing, global rate limiting. Login-specific throttling is configured on the
 * auth routes on top of the global limit.
 */
export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(cors, {
      origin: (origin, cb) => {
        const origins = allowedOrigins();
        // Chrome/Firefox resolve `localhost` to 127.0.0.1 or ::1, so the local
        // dashboard origin can arrive in any of those forms. Local dev origins
        // are allowed on any port; production still honors the strict list.
        const isLocalhost =
          process.env.NODE_ENV !== 'production' &&
          /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin ?? '');
        if (
          !origin ||
          origins.includes(origin) ||
          isLocalhost
        ) {
          return cb(null, true);
        }
        return cb(new Error('Origin not allowed'), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-hrms-client'],
      maxAge: 86400,
    });

    await fastify.register(helmet, {
      contentSecurityPolicy: true,
      crossOriginResourcePolicy: true,
    });

    await fastify.register(cookie, {
      secret: COOKIE_SIGNING_SECRET,
      // NOTE: parseOptions is merged into EVERY setCookie/clearCookie call
      // (see node_modules/@fastify/cookie setCookie). Enabling `signed: true`
      // here would sign the auth cookies on write but never unsign them on
      // read, so keep parseOptions unsigned. `secret` stays wired for signed
      // cookies and for request.unsignCookie() verification when needed.
      parseOptions: { httpOnly: true },
    });

    await fastify.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
      ban: 3,
      continueExceeding: true,
      errorResponseBuilder: (_req, context) => ({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Retry in ${context.after}`,
        },
      }),
    });
  },
  { name: 'hrms.security' },
);