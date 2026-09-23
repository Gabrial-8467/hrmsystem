import type { FastifyReply } from 'fastify';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  message?: string,
): void {
  void reply.send({ success: true, data, message } satisfies ApiSuccess<T>);
}

export function sendPaginated<T>(
  reply: FastifyReply,
  items: T[],
  total: number,
  page: number,
  limit: number,
): void {
  const pages = Math.ceil(total / limit) || 1;
  void reply.send({
    success: true,
    data: {
      items,
      meta: { total, page, limit, pages },
    },
  });
}

export function sendError(
  reply: FastifyReply,
  code: string,
  message: string,
  statusCode: number,
  details?: unknown,
): void {
  void reply.status(statusCode).send({
    success: false,
    error: { code, message, details },
  } satisfies ApiFailure);
}