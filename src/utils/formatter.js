/**
 * @file formatter.js
 * @description Currency formatting and number helper utilities for Kuditax.
 *              All monetary values in the system are integers (Naira, no kobo decimals).
 *              These helpers are pure functions — no side effects.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

/**
 * Formats an integer Naira amount into a human-readable currency string.
 * e.g. 2500000 → "₦2,500,000"
 *
 * @param {number} amount - Amount in Naira (integer)
 * @returns {string} Formatted currency string with ₦ symbol and commas
 *
 * @example
 * formatNaira(2500000) // "₦2,500,000"
 * formatNaira(800000)  // "₦800,000"
 */
function formatNaira(amount) {
  const rounded = Math.floor(amount);
  return `₦${rounded.toLocaleString('en-NG')}`;
}

/**
 * Parses a user-supplied income string into an integer Naira value.
 * Handles inputs like "3.5m", "3,500,000", "3500000", "₦2m".
 * Returns null if the input cannot be parsed into a valid positive number.
 *
 * @param {string} input - Raw user input string
 * @returns {number|null} Parsed integer Naira value, or null if invalid
 *
 * @example
 * parseNairaInput("3.5m")       // 3500000
 * parseNairaInput("₦2,400,000") // 2400000
 * parseNairaInput("abc")        // null
 */
function parseNairaInput(input) {
  if (typeof input !== 'string') return null;

  // Strip currency symbol, spaces, and commas
  let cleaned = input.replace(/[₦,\s]/g, '').toLowerCase();

  // Handle shorthand multipliers: k = 1,000 | m = 1,000,000 | b = 1,000,000,000
  const MULTIPLIERS = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };
  const multiplierMatch = cleaned.match(/^([\d.]+)([kmb])$/);
  if (multiplierMatch) {
    const [, numPart, suffix] = multiplierMatch;
    const value = parseFloat(numPart) * MULTIPLIERS[suffix];
    return isFinite(value) && value > 0 ? Math.floor(value) : null;
  }

  const value = parseFloat(cleaned);
  return isFinite(value) && value > 0 ? Math.floor(value) : null;
}

/**
 * Masks a phone number for safe logging.
 * e.g. "+2348012345678" → "+234****678"
 *
 * @param {string} phoneNumber - E.164 format phone number
 * @returns {string} Masked phone number string
 */
function maskPhoneNumber(phoneNumber) {
  if (typeof phoneNumber !== 'string' || phoneNumber.length < 7) return '****';
  return phoneNumber.slice(0, 4) + '****' + phoneNumber.slice(-3);
}

/**
 * Formats a number as a percentage string.
 * e.g. 0.15 → "15%"
 *
 * @param {number} rate - Decimal rate (e.g. 0.15 for 15%)
 * @returns {string} Percentage string
 */
function formatRate(rate) {
  return `${Math.round(rate * 100)}%`;
}

/**
 * Checks whether a user's input represents a negative/zero answer to an optional question.
 * Used for optional allowance questions (housing, transport, rent, life assurance) where
 * users naturally reply "no", "none", "nah", etc. instead of typing "0".
 *
 * @param {string} text - Raw user input
 * @returns {boolean} True if the input means "none / zero / not applicable"
 *
 * @example
 * isNegativeAnswer("no")       // true
 * isNegativeAnswer("None")     // true
 * isNegativeAnswer("nah")      // true
 * isNegativeAnswer("mba")      // true  (Igbo)
 * isNegativeAnswer("babu")     // true  (Hausa)
 * isNegativeAnswer("3500000")  // false
 */
function isNegativeAnswer(text) {
  if (typeof text !== 'string') return false;

  const NEGATIVE_ANSWERS = new Set([
    'no', 'none', 'nope', 'nil', 'nill', 'nothing',
    "i don't", "i don't have", 'zero', '0',
    'na', 'nah', 'mba', "a'a", 'bẹ́ẹ̀kọ', 'babu', 'oya no',
  ]);

  return NEGATIVE_ANSWERS.has(text.trim().toLowerCase());
}

export { formatNaira, parseNairaInput, maskPhoneNumber, formatRate, isNegativeAnswer };
