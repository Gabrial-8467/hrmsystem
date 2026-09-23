import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { sendError } from '../utils/response';

/**
 * Centralized error handling. Converts all thrown errors into the standard
 * `{ success: false, error: { code, message, details } }` envelope.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (reply.sent) return;

    // Request validation errors raised by Fastify (schema, serializer).
    if (
      typeof error === 'object' &&
      error !== null &&
      'validation' in error &&
      Array.isArray((error as { validation?: unknown }).validation)
    ) {
      const details = (error as { validation: unknown[] }).validation;
      return sendError(
        reply,
        'VALIDATION_ERROR',
        'Request validation failed',
        422,
        details,
      );
    }

    if (error instanceof ZodError) {
      const details = error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return sendError(reply, 'VALIDATION_ERROR', 'Validation failed', 422, details);
    }

    if (error instanceof AppError) {
      if (!error.expose) {
        logger.error({ err: error }, 'Unhandled application error');
        return sendError(reply, 'INTERNAL_ERROR', 'An unexpected error occurred', 500);
      }
      return sendError(reply, error.code, error.message, error.statusCode, error.details);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002': {
          const target = error.meta?.target;
          return sendError(
            reply,
            'DUPLICATE_RESOURCE',
            'A record with the same unique value already exists',
            409,
            { field: Array.isArray(target) ? target : undefined },
          );
        }
        case 'P2025':
          return sendError(reply, 'NOT_FOUND', 'Record not found', 404);
        case 'P2003':
          return sendError(reply, 'REFERENCE_CONSTRAINT', 'Referenced record does not exist', 409);
        default:
          break;
      }
    }

    // Fastify transport/parser errors (empty or invalid JSON body, body too
    // large, etc.) carry their own client statusCode. Surface them as such
    // instead of masking them behind a generic 500.
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number' &&
      (error as { statusCode: number }).statusCode >= 400 &&
      (error as { statusCode: number }).statusCode < 500
    ) {
      const statusCode = (error as { statusCode: number }).statusCode;
      return sendError(
        reply,
        'INVALID_REQUEST',
        (error as { message?: string }).message ?? 'Request could not be processed',
        statusCode,
      );
    }

    logger.error(
      {
        err: error,
        method: request.method,
        url: request.url,
        userId: request.user?.id,
      },
      'Unhandled error',
    );
    return sendError(reply, 'INTERNAL_ERROR', 'An unexpected error occurred', 500);
  });

  app.setNotFoundHandler((request, reply) => {
    sendError(reply, 'ROUTE_NOT_FOUND', `Route ${request.method} ${request.url} not found`, 404);
  });
}