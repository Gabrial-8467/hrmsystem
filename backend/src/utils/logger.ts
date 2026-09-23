import pino, { type Logger } from 'pino';
import { env } from '../config/env';

const devTargets = env.NODE_ENV !== 'production'
  ? [
      {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
    ]
  : [];

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: devTargets.length > 0 ? { targets: devTargets } : undefined,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.tokenHash',
      '*.refreshToken',
      '*.oldPassword',
      '*.newPassword',
    ],
    censor: '[redacted]',
  },
});