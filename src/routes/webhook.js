/**
 * @file webhook.js
 * @description Express route handlers for the Meta WhatsApp webhook.
 *              GET  /webhook — Meta verification challenge (one-time setup)
 *              POST /webhook — Incoming messages and delivery events
 *
 *              Security:
 *              - POST requests are verified against the X-Hub-Signature-256 header
 *                using HMAC-SHA256 with the app secret before any processing.
 *              - Rate limiting is applied at the app level (see index.js).
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { Router } from 'express';
import config from '../config.js';
import logger from '../utils/logger.js';
import { isValidWebhookPayload, extractTextMessage } from '../utils/validator.js';
import { markMessageAsRead } from '../services/whatsapp.js';
import { routeMessage } from '../flows/messageRouter.js';
import { maskPhoneNumber } from '../utils/formatter.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /webhook — Meta webhook verification
// ---------------------------------------------------------------------------

/**
 * Meta calls this endpoint once during webhook setup to verify ownership.
 * We must echo back the hub.challenge parameter if the verify token matches.
 *
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.warn('Webhook verification failed', { mode, tokenMatch: token === config.whatsapp.verifyToken });
  return res.sendStatus(403);
});

// ---------------------------------------------------------------------------
// POST /webhook — Incoming message events
// ---------------------------------------------------------------------------

/**
 * Receives incoming WhatsApp message events from Meta.
 * Validates the HMAC signature, extracts text messages, and dispatches
 * them to the message router.
 *
 * We return 200 OK immediately after validation — processing is async.
 * Meta will retry if it receives a non-2xx response.
 */
router.post('/', async (req, res) => {
  // Step 1: Verify HMAC signature before touching any payload data
  if (!isValidSignature(req)) {
    logger.warn('Invalid webhook signature — request rejected');
    return res.sendStatus(401);
  }

  const body = req.body;

  // Step 2: Validate payload structure
  if (!isValidWebhookPayload(body)) {
    // Could be a status update (read receipts, delivery) — not an error
    logger.info('Received non-message webhook event — ignored');
    return res.sendStatus(200);
  }

  // Step 3: Acknowledge immediately — Meta requires a fast 200 response
  res.sendStatus(200);

  // Step 4: Extract and process the message asynchronously
  const message = extractTextMessage(body);

  if (!message) {
    // Non-text message types (image, audio, etc.) — not supported in v1
    logger.info('Received non-text message — ignored');
    return;
  }

  const { from, text, messageId } = message;

  logger.info('Processing incoming message', {
    from: maskPhoneNumber(from),
    messageType: 'text',
    length: text.length,
  });

  // Mark as read (fires-and-forgets — non-fatal if it fails)
  markMessageAsRead(messageId).catch(() => {});

  // Route to the conversation handler
  try {
    await routeMessage(from, text);
  } catch (error) {
    // routeMessage handles its own errors internally and sends a fallback message.
    // This outer catch is a last-resort safety net.
    logger.error('Unhandled error in routeMessage', {
      from: maskPhoneNumber(from),
      error: error.message,
    });
  }
});

// ---------------------------------------------------------------------------
// Signature Verification
// ---------------------------------------------------------------------------

/**
 * Validates the X-Hub-Signature-256 header on incoming POST requests.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * The signature is: sha256=HMAC(app_secret, raw_body)
 * We use the raw body buffer (attached by express.json verify callback).
 *
 * @param {import('express').Request} req - Express request object
 * @returns {boolean} True if the signature is valid
 */
function isValidSignature(req) {
  const signature = req.headers['x-hub-signature-256'];

  if (!signature) {
    // In development mode, allow unsigned requests for easier local testing
    if (config.nodeEnv === 'development') {
      logger.warn('No signature header — allowing in development mode');
      return true;
    }
    return false;
  }

  // The raw body buffer must be attached by the express.json middleware
  const rawBody = req.rawBody;
  if (!rawBody) {
    logger.error('rawBody not available — signature cannot be verified');
    return false;
  }

  // Compute the expected HMAC using the WhatsApp app secret
  // Note: In production this should be the Meta App Secret, not the access token.
  // TODO(v2): Add WHATSAPP_APP_SECRET as a separate env variable for signature verification.
  const appSecret = process.env.WHATSAPP_APP_SECRET || config.whatsapp.accessToken;
  const expectedHash = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;

  try {
    // timing-safe comparison prevents timing side-channel attacks
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHash));
  } catch {
    // Lengths differ — definitely not a match
    return false;
  }
}

export default router;
