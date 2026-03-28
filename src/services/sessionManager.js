/**
 * @file sessionManager.js
 * @description In-memory session store for Kuditax.
 *              Sessions are keyed by WhatsApp phone number (E.164 format).
 *              Each session expires after 24 hours of inactivity.
 *              A background cleanup interval sweeps expired sessions every 5 minutes.
 *
 *              IMPORTANT: No PII is persisted beyond this process.
 *              Sessions live only in memory — a server restart clears all sessions.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import config from '../config.js';
import logger from '../utils/logger.js';
import { maskPhoneNumber } from '../utils/formatter.js';
import { saveProfile, getProfile } from './profileStore.js';

/**
 * @typedef {Object} TaxData
 * @property {string|null} userType - 'salaried' | 'self_employed' | 'business_owner' | null
 * @property {number|null} annualGrossIncome - Annual gross income (Naira)
 * @property {number|null} monthlyBasic - Monthly basic salary (Naira)
 * @property {number|null} monthlyHousing - Monthly housing allowance (Naira)
 * @property {number|null} monthlyTransport - Monthly transport allowance (Naira)
 * @property {number|null} annualRent - Annual rent paid (Naira)
 * @property {boolean|null} hasNhf - Whether registered with NHF
 * @property {number|null} lifeAssurancePremium - Annual life assurance premium (Naira)
 * @property {number|null} customPension - Manual pension override (Naira)
 * @property {object|null} lastResult - Most recent full tax calculation result
 */

/**
 * @typedef {Object} Session
 * @property {string} phoneNumber - E.164 phone number (session key)
 * @property {string} currentState - Current conversation state (e.g. 'AWAITING_LANGUAGE')
 * @property {string|null} language - Selected language code: 'en' | 'pidgin' | 'igbo' | 'hausa' | 'yoruba'
 * @property {string|null} userType - Employment type selected by user
 * @property {TaxData} taxData - Collected tax input data for the current flow
 * @property {Array<{role: string, content: string}>} conversationHistory - Full Claude chat history
 * @property {number} createdAt - Unix timestamp (ms) when session was created
 * @property {number} lastActivityAt - Unix timestamp (ms) of last user message
 * @property {string|null} pendingMessage - Message queued before language was selected (fresh session fast-path)
 */

// ---------------------------------------------------------------------------
// Conversation States
// These constants define every valid state the bot conversation can be in.
// ---------------------------------------------------------------------------

const STATES = {
  AWAITING_LANGUAGE:      'AWAITING_LANGUAGE',
  AWAITING_PRIVACY_ACK:   'AWAITING_PRIVACY_ACK',
  AWAITING_MENU_CHOICE:   'AWAITING_MENU_CHOICE',
  AWAITING_USER_TYPE:     'AWAITING_USER_TYPE',

  // Salaried flow (Flow A)
  FLOW_A_GROSS_INCOME:    'FLOW_A_GROSS_INCOME',
  FLOW_A_MONTHLY_BASIC:   'FLOW_A_MONTHLY_BASIC',
  FLOW_A_HOUSING:         'FLOW_A_HOUSING',
  FLOW_A_TRANSPORT:       'FLOW_A_TRANSPORT',
  FLOW_A_RENT:            'FLOW_A_RENT',
  FLOW_A_PENSION:         'FLOW_A_PENSION',
  FLOW_A_NHF:             'FLOW_A_NHF',
  FLOW_A_LIFE_ASSURANCE:  'FLOW_A_LIFE_ASSURANCE',

  // Self-employed flow (Flow B)
  FLOW_B_TOTAL_INCOME:    'FLOW_B_TOTAL_INCOME',
  FLOW_B_EXPENSES:        'FLOW_B_EXPENSES',
  FLOW_B_RENT:            'FLOW_B_RENT',
  FLOW_B_PENSION:         'FLOW_B_PENSION',

  // Business owner flow (Flow C) — advisory only
  FLOW_C_REVENUE:         'FLOW_C_REVENUE',
  FLOW_C_EXPENSES:        'FLOW_C_EXPENSES',
  FLOW_C_VAT:             'FLOW_C_VAT',
  FLOW_C_EMPLOYEES:       'FLOW_C_EMPLOYEES',

  // AI-driven free-form Q&A
  AI_CONVERSATION:        'AI_CONVERSATION',

  // Result displayed — awaiting next action
  RESULT_DISPLAYED:       'RESULT_DISPLAYED',

  // Filing pack offer sent — awaiting user's yes/no response
  AWAITING_FILING_PACK:   'AWAITING_FILING_PACK',

  // Returning user detected — awaiting confirmation to use saved profile or update
  AWAITING_PROFILE_CONFIRM: 'AWAITING_PROFILE_CONFIRM',
};

// ---------------------------------------------------------------------------
// Session Store
// ---------------------------------------------------------------------------

/** @type {Map<string, Session>} */
const sessions = new Map();

/**
 * Creates a new session for a given phone number.
 * If a session already exists for this number, it is replaced.
 *
 * @param {string} phoneNumber - E.164 format phone number
 * @returns {Session} The newly created session
 */
function createSession(phoneNumber) {
  const now = Date.now();
  const session = {
    phoneNumber,
    currentState: STATES.AWAITING_LANGUAGE,
    language: null,
    userType: null,
    taxData: {
      userType: null,
      annualGrossIncome: null,
      monthlyBasic: null,
      monthlyHousing: null,
      monthlyTransport: null,
      annualRent: null,
      hasNhf: null,
      lifeAssurancePremium: null,
      customPension: null,
      lastResult: null,
    },
    conversationHistory: [],
    createdAt: now,
    lastActivityAt: now,
    pendingMessage: null,
  };

  sessions.set(phoneNumber, session);
  logger.info('Session created', { from: maskPhoneNumber(phoneNumber) });
  return session;
}

/**
 * Retrieves an existing session or creates a new one if none exists.
 * Updates lastActivityAt on retrieval.
 *
 * @param {string} phoneNumber - E.164 format phone number
 * @returns {Session} The session for this user
 */
function getOrCreateSession(phoneNumber) {
  const existing = sessions.get(phoneNumber);
  if (existing) {
    existing.lastActivityAt = Date.now();
    return existing;
  }
  return createSession(phoneNumber);
}

/**
 * Updates fields on an existing session. Merges taxData shallowly.
 * Automatically updates lastActivityAt.
 *
 * @param {string} phoneNumber - E.164 format phone number
 * @param {Partial<Session>} updates - Fields to update on the session
 * @returns {Session | null} Updated session, or null if session does not exist
 */
function updateSession(phoneNumber, updates) {
  const session = sessions.get(phoneNumber);
  if (!session) return null;

  if (updates.taxData) {
    session.taxData = { ...session.taxData, ...updates.taxData };
    delete updates.taxData;
  }

  Object.assign(session, updates, { lastActivityAt: Date.now() });
  return session;
}

/**
 * Deletes a session for a given phone number.
 *
 * @param {string} phoneNumber - E.164 format phone number
 * @returns {boolean} True if a session was deleted
 */
function deleteSession(phoneNumber) {
  const deleted = sessions.delete(phoneNumber);
  if (deleted) {
    logger.info('Session deleted', { from: maskPhoneNumber(phoneNumber) });
  }
  return deleted;
}

/**
 * Returns the number of currently active sessions.
 * Useful for health checks and metrics.
 *
 * @returns {number} Active session count
 */
function getActiveSessionCount() {
  return sessions.size;
}

// ---------------------------------------------------------------------------
// Session Expiry Cleanup
// ---------------------------------------------------------------------------

/**
 * Sweeps through all sessions and removes any that have been inactive
 * beyond the configured TTL (24 hours by default).
 * Called on an interval — not meant to be called manually.
 */
function sweepExpiredSessions() {
  const now = Date.now();
  let expiredCount = 0;

  for (const [phoneNumber, session] of sessions.entries()) {
    const idleMs = now - session.lastActivityAt;
    if (idleMs > config.session.ttlMs) {
      sessions.delete(phoneNumber);
      expiredCount++;
      logger.info('Session expired', { from: maskPhoneNumber(phoneNumber) });
    }
  }

  if (expiredCount > 0) {
    logger.info('Session sweep complete', { expired: expiredCount, active: sessions.size });
  }
}

// Start the background cleanup interval
const cleanupInterval = setInterval(sweepExpiredSessions, config.session.cleanupIntervalMs);

// Prevent the interval from keeping the Node process alive when tests finish
cleanupInterval.unref();

// ---------------------------------------------------------------------------
// Firestore Profile Integration
// ---------------------------------------------------------------------------

/**
 * Loads a returning user's saved Firestore profile into their in-memory session.
 * Pre-fills language, userType, and deductionProfile so the bot can offer a
 * faster path through the flow on repeat visits.
 *
 * Silently returns false if no profile exists or Firestore is unavailable —
 * the caller should treat this as a first-time user.
 *
 * @param {string} phone - E.164 phone number
 * @param {Session} session - The newly created session to populate
 * @returns {Promise<boolean>} True if a profile was found and loaded
 */
async function loadProfileIntoSession(phone, session) {
  const profile = await getProfile(phone);
  if (!profile) return false;

  // Pre-fill non-financial preferences from the saved profile
  session.language = profile.language;
  session.userType = profile.userType;
  session.taxData.userType = profile.userType;

  // Store the saved deduction booleans so the flow can reference them
  session.taxData.savedDeductionProfile = profile.deductionProfile ?? null;

  logger.info('Returning user profile loaded into session', {
    from: maskPhoneNumber(phone),
    userType: profile.userType,
  });

  return true;
}

/**
 * Extracts non-financial profile data from the session and saves it to Firestore.
 * Called after a successful tax calculation (fire-and-forget — never awaited by
 * the caller so it cannot delay the WhatsApp response).
 *
 * Only saves boolean deduction choices — never income figures or tax amounts.
 *
 * @param {string} phone - E.164 phone number
 * @param {Session} session - Current session with completed taxData
 * @returns {Promise<void>}
 */
async function persistSessionProfile(phone, session) {
  const { language, userType, taxData } = session;

  // Do not persist incomplete sessions — both fields are required for a useful profile
  if (!language || !userType) return;

  // Derive boolean flags from taxData — NEVER include income amounts
  const deductionProfile = {
    // customPension: null = auto-calculated (yes), 0 = opted out (no)
    hasPension:       taxData.customPension !== 0,
    hasNhf:           taxData.hasNhf === true,
    hasLifeAssurance: (taxData.lifeAssurancePremium ?? 0) > 0,
    hasRentRelief:    (taxData.annualRent ?? 0) > 0,
  };

  await saveProfile(phone, { language, userType, deductionProfile });
}

export {
  STATES,
  createSession,
  getOrCreateSession,
  updateSession,
  deleteSession,
  getActiveSessionCount,
  sweepExpiredSessions,
  loadProfileIntoSession,
  persistSessionProfile,
};
