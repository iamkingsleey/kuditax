/**
 * @file whatsapp.js
 * @description Meta Cloud API client for sending WhatsApp messages.
 *              Handles message splitting for responses > 4,000 characters,
 *              enforces the 500ms delay between split messages, and validates
 *              messages before sending to avoid empty message errors.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import axios from 'axios';
import config from '../config.js';
import logger from '../utils/logger.js';
import { maskPhoneNumber } from '../utils/formatter.js';

const { whatsapp, message: msgConfig } = config;

/**
 * Builds the Meta Graph API endpoint URL for sending messages.
 *
 * @returns {string} Full API endpoint URL
 */
function getApiUrl() {
  return `${whatsapp.baseUrl}/${whatsapp.apiVersion}/${whatsapp.phoneNumberId}/messages`;
}

/**
 * Builds the axios request headers required for Meta Cloud API calls.
 *
 * @returns {object} Headers object with Authorization and Content-Type
 */
function getApiHeaders() {
  return {
    Authorization: `Bearer ${whatsapp.accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Splits a long message string into chunks that fit within the WhatsApp
 * character limit. Splits on newline boundaries where possible to avoid
 * cutting sentences mid-way.
 *
 * @param {string} text - Full message text to split
 * @returns {string[]} Array of message chunks, each within maxLength
 */
function splitMessage(text) {
  if (text.length <= msgConfig.maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > msgConfig.maxLength) {
    // Try to split on a newline within the last 200 chars of the allowed length
    const slice = remaining.slice(0, msgConfig.maxLength);
    const lastNewline = slice.lastIndexOf('\n');
    const splitAt = lastNewline > msgConfig.maxLength - 200 ? lastNewline : msgConfig.maxLength;

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Sends a single text message to a WhatsApp user via the Meta Cloud API.
 * This is the low-level send function — prefer sendMessage for most use cases.
 *
 * @param {string} to - Recipient phone number (E.164, without +)
 * @param {string} text - Message text to send (must be non-empty, <= 4096 chars)
 * @returns {Promise<void>}
 * @throws Will log and not rethrow — errors are handled gracefully
 */
async function sendSingleMessage(to, text) {
  // Guard: never send an empty message
  if (!text || text.trim().length === 0) {
    logger.warn('Attempted to send empty message — skipped', { to: maskPhoneNumber(to) });
    return;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  };

  try {
    await axios.post(getApiUrl(), payload, { headers: getApiHeaders() });
    logger.info('Message sent', {
      to: maskPhoneNumber(to),
      length: text.length,
    });
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data?.error?.message || error.message;
    logger.error('Failed to send WhatsApp message', {
      to: maskPhoneNumber(to),
      status,
      detail,
    });
    // Re-throw so the caller (messageRouter) can send a fallback if needed
    throw error;
  }
}

/**
 * Sends a message to a WhatsApp user. If the text exceeds the character limit,
 * it is automatically split and sent as sequential messages with a 500ms delay.
 * Never sends more than the configured max messages per response.
 *
 * @param {string} to - Recipient phone number (E.164, without +)
 * @param {string} text - Full message text (will be split if necessary)
 * @returns {Promise<void>}
 */
async function sendMessage(to, text) {
  if (!text || text.trim().length === 0) {
    logger.warn('sendMessage called with empty text — skipped', { to: maskPhoneNumber(to) });
    return;
  }

  const chunks = splitMessage(text);

  // Enforce the max messages per response cap
  const capped = chunks.slice(0, msgConfig.maxMessagesPerResponse);

  if (capped.length < chunks.length) {
    logger.warn('Response truncated to max message limit', {
      to: maskPhoneNumber(to),
      total: chunks.length,
      sent: capped.length,
    });
  }

  for (let i = 0; i < capped.length; i++) {
    if (i > 0) {
      // Delay between messages to avoid overwhelming the user
      await delay(msgConfig.splitDelayMs);
    }
    await sendSingleMessage(to, capped[i]);
  }
}

/**
 * Marks an incoming message as "read" via the Meta Cloud API.
 * This triggers the double blue tick on the user's device.
 *
 * @param {string} messageId - The WhatsApp message ID to mark as read
 * @returns {Promise<void>}
 */
async function markMessageAsRead(messageId) {
  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };

  try {
    await axios.post(getApiUrl(), payload, { headers: getApiHeaders() });
  } catch (error) {
    // Non-fatal — do not crash the response cycle for a failed read receipt
    logger.warn('Failed to mark message as read', {
      messageId,
      detail: error.response?.data?.error?.message || error.message,
    });
  }
}

/**
 * Simple promise-based delay helper.
 *
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { sendMessage, markMessageAsRead, splitMessage };
