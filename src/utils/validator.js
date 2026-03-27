/**
 * @file validator.js
 * @description Input validation helpers for Kuditax.
 *              Used to sanitise user messages before processing or passing to the AI agent.
 *              All functions are pure — they take input and return a result with no side effects.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import config from '../config.js';

/**
 * Sanitises raw user message text before it is processed or forwarded to the AI.
 * - Trims leading/trailing whitespace
 * - Strips HTML tags (prevents injection via web-to-WhatsApp bridges)
 * - Strips ASCII control characters (except newlines which may be intentional)
 * - Truncates to the configured max input length
 *
 * @param {string} text - Raw user message text
 * @returns {string} Sanitised message text
 */
function sanitiseUserInput(text) {
  if (typeof text !== 'string') return '';

  return text
    .trim()
    // Strip HTML tags
    .replace(/<[^>]*>/g, '')
    // Strip ASCII control characters (except \n \r \t)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Truncate to max allowed length
    .slice(0, config.message.maxUserInputLength);
}

/**
 * Checks whether a WhatsApp phone number is in valid E.164 format.
 * E.164: starts with +, followed by 7–15 digits.
 *
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if valid E.164 format
 *
 * @example
 * isValidPhoneNumber('+2348012345678') // true
 * isValidPhoneNumber('08012345678')    // false (missing country code +)
 */
function isValidPhoneNumber(phoneNumber) {
  return /^\+[1-9]\d{6,14}$/.test(phoneNumber);
}

/**
 * Checks whether a string is non-empty after trimming whitespace.
 *
 * @param {string} value - Value to check
 * @returns {boolean} True if non-empty
 */
function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validates an incoming WhatsApp webhook payload from Meta.
 * Checks for the expected shape without trusting any field values.
 *
 * @param {object} body - Parsed request body from the webhook POST
 * @returns {boolean} True if the payload has the expected structure
 */
function isValidWebhookPayload(body) {
  return (
    body !== null &&
    typeof body === 'object' &&
    body.object === 'whatsapp_business_account' &&
    Array.isArray(body.entry) &&
    body.entry.length > 0
  );
}

/**
 * Extracts the first text message from a Meta webhook payload.
 * Returns null if the payload does not contain a text message.
 *
 * @param {object} body - Parsed webhook request body
 * @returns {{ from: string, text: string, messageId: string } | null}
 */
function extractTextMessage(body) {
  try {
    const changes = body.entry[0]?.changes;
    if (!Array.isArray(changes) || changes.length === 0) return null;

    const value = changes[0]?.value;
    if (!value) return null;

    const messages = value.messages;
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const message = messages[0];

    // Only handle text messages in this version
    if (message.type !== 'text') return null;

    const text = message.text?.body;
    if (!isNonEmpty(text)) return null;

    return {
      from: message.from,
      text: sanitiseUserInput(text),
      messageId: message.id,
    };
  } catch {
    return null;
  }
}

export { sanitiseUserInput, isValidPhoneNumber, isNonEmpty, isValidWebhookPayload, extractTextMessage };
