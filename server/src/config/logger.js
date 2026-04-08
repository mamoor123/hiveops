/**
 * Copyright (c) 2026 mamoor123
 * Licensed under the GNU Affero General Public License v3.0
 * See LICENSE for details.
 */

/**
 * Structured Logger (pino)
 *
 * JSON logs in production, pretty-printed in development.
 * Usage:
 *   const log = require('./config/logger');
 *   log.info('Server started');
 *   log.error({ err }, 'Something broke');
 *   log.debug({ userId: 42 }, 'User action');
 */

const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'password', 'password_hash', 'token', 'apiKey', 'api_key', 'secret'],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
