/**
 * @file config.js
 * @description Central configuration module. All environment variables are accessed here.
 *              No other file should call process.env directly — import from this module instead.
 *              Validates required variables at startup to fail fast if misconfigured.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import 'dotenv/config';

/**
 * Validates that all required environment variables are present.
 * Throws on startup if any are missing so the server never silently runs misconfigured.
 *
 * @param {string[]} required - Array of required env var names
 * @throws {Error} If any required variable is missing
 */
function validateEnv(required) {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

const REQUIRED_VARS = [
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_VERIFY_TOKEN',
  'ANTHROPIC_API_KEY',
];

// Validate only in production — allow partial config in dev/test
if (process.env.NODE_ENV === 'production') {
  validateEnv(REQUIRED_VARS);
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    apiVersion: 'v19.0',
    baseUrl: 'https://graph.facebook.com',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
  },

  session: {
    // Sessions expire after 30 minutes of inactivity (in milliseconds)
    ttlMs: 30 * 60 * 1000,
    // Cleanup interval — sweep expired sessions every 5 minutes
    cleanupIntervalMs: 5 * 60 * 1000,
  },

  rateLimit: {
    windowMs: 60 * 1000, // 1 minute window
    max: 30,             // max 30 requests per window per IP
  },

  message: {
    maxLength: 4000,           // WhatsApp hard limit is 4096; we leave a buffer
    maxUserInputLength: 500,   // Max characters accepted from a user message
    splitDelayMs: 500,         // Delay between multi-part messages (ms)
    maxMessagesPerResponse: 3, // Never send more than 3 messages in one response
  },

  firebase: {
    // Path to the Firebase service account JSON file.
    // If absent, the app runs in memory-only mode — no profile persistence.
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || null,
  },
};

export default config;
