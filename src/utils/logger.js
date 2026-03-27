/**
 * @file logger.js
 * @description Structured logger built on Winston.
 *              Use this everywhere — never use console.log in production code.
 *              Log levels: error > warn > info > debug
 *              Debug is disabled in production to avoid log noise.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, colorize, errors } = format;

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Custom log line format for development: colorised, human-readable.
 * Production uses JSON for structured log aggregation (e.g. Render, Datadog).
 */
const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} [${level}]: ${message}${metaStr}`;
  }),
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  format.json(),
);

const logger = createLogger({
  // Debug is silenced in production
  level: IS_PRODUCTION ? 'info' : 'debug',
  format: IS_PRODUCTION ? prodFormat : devFormat,
  transports: [
    new transports.Console(),
  ],
  // Prevent Winston from crashing the process on uncaught transport errors
  exitOnError: false,
});

export default logger;
