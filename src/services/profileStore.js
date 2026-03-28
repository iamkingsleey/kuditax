/**
 * @file profileStore.js
 * @description Firestore read/write operations for user preference profiles.
 *              This is the ONLY module that communicates with Firestore directly.
 *
 *              NDPR/NDPA Compliance:
 *              - Document IDs use only the last 4 digits of the phone number
 *                (e.g. "user_****0678") — never the full number.
 *              - Documents store only language, userType, and boolean deduction
 *                preferences. No income figures, no tax amounts, no PII.
 *              - All operations are wrapped in try/catch and return null on
 *                failure so the bot never stops working due to a DB error.
 *
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import { db, serverTimestamp } from './firestore.js';
import logger from '../utils/logger.js';
import { maskPhoneNumber } from '../utils/formatter.js';

// Firestore collection that holds all user preference profiles
const COLLECTION_NAME = 'userProfiles';

// Tax year this profile corresponds to (NTA 2025 rules)
const CURRENT_TAX_YEAR = 2025;

/**
 * Derives the Firestore document key from a raw E.164 phone number.
 * Uses only the last 4 digits to avoid storing a full identifier.
 * NDPA 2023 — data minimisation principle.
 *
 * @param {string} phone - Raw E.164 phone number (e.g. "+2348012345678")
 * @returns {string} Document key (e.g. "user_5678")
 */
function buildProfileKey(phone) {
  return 'user_' + phone.slice(-4);
}

/**
 * Saves a user's language preference and deduction profile to Firestore.
 * Only called after a successful tax calculation.
 * Never stores income figures or any sensitive financial data.
 *
 * @param {string} phone - Raw E.164 phone number (masked before storage)
 * @param {object} profile - Profile fields to save
 * @param {string} profile.language - Language code
 * @param {string} profile.userType - Employment type
 * @param {object} profile.deductionProfile - Boolean deduction flags
 * @param {number} [profile.lastTaxYear] - Tax year (defaults to CURRENT_TAX_YEAR)
 * @returns {Promise<void>}
 */
async function saveProfile(phone, profile) {
  if (!db) return; // Firebase not configured — memory-only mode

  const key = buildProfileKey(phone);

  try {
    await db.collection(COLLECTION_NAME).doc(key).set({
      language:          profile.language,
      userType:          profile.userType,
      lastTaxYear:       profile.lastTaxYear ?? CURRENT_TAX_YEAR,
      lastCalculatedAt:  serverTimestamp(),
      deductionProfile:  {
        hasNhf:           profile.deductionProfile.hasNhf           ?? false,
        hasPension:       profile.deductionProfile.hasPension        ?? false,
        hasLifeAssurance: profile.deductionProfile.hasLifeAssurance  ?? false,
        hasRentRelief:    profile.deductionProfile.hasRentRelief     ?? false,
      },
    });

    logger.info('Profile saved to Firestore', { key });
  } catch (err) {
    logger.error('Failed to save profile to Firestore', {
      from: maskPhoneNumber(phone),
      error: err.message,
    });
    // Never throw — Firestore errors must not affect the bot response
  }
}

/**
 * Retrieves a saved preference profile for a returning user.
 * Returns null if no profile exists or if Firestore is unavailable.
 *
 * @param {string} phone - Raw E.164 phone number
 * @returns {Promise<object|null>} Saved profile or null
 */
async function getProfile(phone) {
  if (!db) return null;

  const key = buildProfileKey(phone);

  try {
    const doc = await db.collection(COLLECTION_NAME).doc(key).get();

    if (!doc.exists) return null;

    logger.info('Profile loaded from Firestore', { key });
    return doc.data();
  } catch (err) {
    logger.error('Failed to read profile from Firestore', {
      from: maskPhoneNumber(phone),
      error: err.message,
    });
    return null;
  }
}

/**
 * Deletes a user's preference profile from Firestore.
 * Called when the user invokes their NDPA 2023 right to erasure.
 *
 * @param {string} phone - Raw E.164 phone number
 * @returns {Promise<void>}
 */
async function deleteProfile(phone) {
  if (!db) return;

  const key = buildProfileKey(phone);

  try {
    await db.collection(COLLECTION_NAME).doc(key).delete();
    logger.info('Profile deleted from Firestore (right to erasure)', { key });
  } catch (err) {
    logger.error('Failed to delete profile from Firestore', {
      from: maskPhoneNumber(phone),
      error: err.message,
    });
    // Never throw — erasure errors must not leave the user without a response
  }
}

export { saveProfile, getProfile, deleteProfile };
