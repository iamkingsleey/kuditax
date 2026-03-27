/**
 * @file index.js
 * @description Express application entry point for Kuditax.
 *              Sets up middleware, rate limiting, routes, and starts the server.
 *              Handles graceful shutdown and uncaught exceptions to prevent
 *              session data loss and ensure clean process exit.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import config from './config.js';
import logger from './utils/logger.js';
import webhookRouter from './routes/webhook.js';
import { getActiveSessionCount } from './services/sessionManager.js';

const app = express();

// ---------------------------------------------------------------------------
// Raw body capture middleware (must come before express.json)
// Meta's signature verification requires access to the raw request body.
// We attach it to req.rawBody before JSON parsing.
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  let data = [];
  req.on('data', (chunk) => data.push(chunk));
  req.on('end', () => {
    req.rawBody = Buffer.concat(data);
    next();
  });
  req.on('error', (err) => {
    logger.error('Error reading request body', { error: err.message });
    res.sendStatus(400);
  });
});

// Parse the raw body as JSON for route handlers
app.use((req, res, next) => {
  try {
    if (req.rawBody && req.rawBody.length > 0) {
      req.body = JSON.parse(req.rawBody.toString('utf-8'));
    } else {
      req.body = {};
    }
    next();
  } catch {
    res.sendStatus(400);
  }
});

// ---------------------------------------------------------------------------
// Rate Limiting
// Protects the webhook endpoint from abuse — max 30 requests/min/IP
// ---------------------------------------------------------------------------
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please slow down.' },
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', { ip: req.ip });
    res.status(429).json(options.message);
  },
});

app.use('/webhook', limiter);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/webhook', webhookRouter);

// Health check endpoint — used by Render and uptime monitors
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    activeSessions: getActiveSessionCount(),
    timestamp: new Date().toISOString(),
  });
});

// 404 handler — catch-all for unknown routes
app.use((req, res) => {
  res.sendStatus(404);
});

// Global error handler — never return raw error objects to the client
app.use((err, req, res, next) => {
  logger.error('Unhandled Express error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Server Start
// ---------------------------------------------------------------------------

const server = app.listen(config.port, () => {
  logger.info('Kuditax server started', {
    port: config.port,
    env: config.nodeEnv,
  });
});

// ---------------------------------------------------------------------------
// Graceful Shutdown
// Handles SIGTERM (Render sends this on deploy/shutdown) and SIGINT (Ctrl+C)
// ---------------------------------------------------------------------------

function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Log uncaught exceptions and rejections without crashing
// (crashing would drop all active sessions)
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

export default app;
