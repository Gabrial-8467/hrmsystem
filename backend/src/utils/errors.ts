/**
 * Centralized application errors. Fastify error handler maps these to the
 * standard API error envelope.
 */

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(options: {
    message: string;
    code: string;
    statusCode: number;
    details?: unknown;
    expose?: boolean;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
    this.expose = options.expose ?? true;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST', details?: unknown) {
    super({ message, code, statusCode: 400, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED', details?: unknown) {
    super({ message, code, statusCode: 401, details });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', code = 'FORBIDDEN', details?: unknown) {
    super({ message, code, statusCode: 403, details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', details?: unknown) {
    super({ message, code, statusCode: 404, details });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', code = 'CONFLICT', details?: unknown) {
    super({ message, code, statusCode: 409, details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later', code = 'RATE_LIMITED') {
    super({ message, code, statusCode: 429 });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super({ message, code: 'VALIDATION_ERROR', statusCode: 422, details });
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Request could not be processed', code = 'UNPROCESSABLE', details?: unknown) {
    super({ message, code, statusCode: 422, details });
  }
}