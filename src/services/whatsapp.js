/**
 * @file whatsapp.js
 * @description Meta Cloud API client for sending WhatsApp messages and documents.
 *              Handles message splitting for responses > 4,000 characters,
 *              enforces the 500ms delay between split messages, and validates
 *              messages before sending to avoid empty message errors.
 *              Also handles PDF document upload via the Meta media endpoint
 *              and sends them as document messages.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import axios from 'axios';
import { readFileSync } from 'fs';
import { unlink } from 'fs/promises';
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

// ---------------------------------------------------------------------------
// Document Sending (PDF Filing Pack)
// ---------------------------------------------------------------------------

/**
 * Uploads a local file to the Meta media endpoint and returns its media ID.
 * Uses Node 20's built-in fetch + FormData — no extra dependencies needed.
 *
 * @param {string} filePath - Absolute path to the file to upload
 * @param {string} filename - The filename to use in the multipart upload
 * @returns {Promise<string>} The media ID returned by Meta
 * @throws {Error} On upload failure
 */
async function uploadMediaFile(filePath, filename) {
  const fileBuffer = readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });

  const form = new FormData();
  form.append('file', blob, filename);
  form.append('type', 'application/pdf');
  form.append('messaging_product', 'whatsapp');

  const url = `${whatsapp.baseUrl}/${whatsapp.apiVersion}/${whatsapp.phoneNumberId}/media`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${whatsapp.accessToken}` },
    body: form,
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(`Media upload failed (${response.status}): ${errBody.error?.message ?? 'unknown'}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Sends a document message to a WhatsApp user using an already-uploaded media ID.
 *
 * @param {string} to - Recipient phone number (E.164, without +)
 * @param {string} mediaId - Media ID returned by the Meta upload endpoint
 * @param {string} filename - Filename shown to the recipient (e.g. "kuditax-tax-summary-2025.pdf")
 * @param {string} caption - Caption text displayed below the document
 * @returns {Promise<void>}
 */
async function sendDocumentMessage(to, mediaId, filename, caption) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'document',
    document: { id: mediaId, caption, filename },
  };
  await axios.post(getApiUrl(), payload, { headers: getApiHeaders() });
}

/**
 * Deletes a temp file silently. Non-fatal — logs a warning on failure.
 *
 * @param {string} filePath - Absolute path of the file to delete
 * @returns {Promise<void>}
 */
async function deleteTempFile(filePath) {
  try {
    await unlink(filePath);
  } catch (err) {
    logger.warn('Failed to delete temp PDF file', { error: err.message });
  }
}

/**
 * Uploads a local PDF file to the Meta media endpoint, sends it as a
 * WhatsApp document message to the recipient, and then deletes the temp file.
 * The file is always deleted in the finally block — even if sending fails.
 *
 * NDPR: The filePath is never logged. The recipient's phone number is masked.
 *
 * @param {string} to - Recipient phone number (E.164, without +)
 * @param {string} filePath - Absolute path to the PDF file to send
 * @param {string} filename - Filename shown to the recipient
 * @param {string} caption - Caption text displayed below the document
 * @returns {Promise<void>}
 * @throws {Error} On upload or send failure (after cleanup)
 */
async function sendDocument(to, filePath, filename, caption) {
  try {
    const mediaId = await uploadMediaFile(filePath, filename);
    await sendDocumentMessage(to, mediaId, filename, caption);
    logger.info('Document sent successfully', { to: maskPhoneNumber(to), filename });
  } catch (error) {
    logger.error('Failed to send document', {
      to: maskPhoneNumber(to),
      filename,
      error: error.message,
    });
    throw error;
  } finally {
    // Always clean up — temp files must never persist (NDPR storage limitation)
    await deleteTempFile(filePath);
  }
}

export { sendMessage, markMessageAsRead, splitMessage, sendDocument };
