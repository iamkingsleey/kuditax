/**
 * @file firestore.js
 * @description Firebase Admin SDK initialisation and Firestore client.
 *              Provides the db instance used by profileStore.js.
 *              Falls back gracefully if credentials are missing or invalid —
 *              the server continues running in memory-only mode.
 *
 * Firebase Setup (one-time):
 *  1. Go to https://console.firebase.google.com
 *  2. Create a new project called "kuditax"
 *  3. Go to Project Settings → Service Accounts
 *  4. Click "Generate New Private Key" — download the JSON file
 *  5. Place it in the project root as "firebase-service-account.json"
 *  6. Go to Firestore Database → Create Database → Start in test mode
 *  7. Set FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json in .env
 *
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import logger from '../utils/logger.js';
import config from '../config.js';

/** @type {import('firebase-admin').firestore.Firestore | null} */
let db = null;

/**
 * Returns a Firestore server timestamp sentinel value.
 * Falls back to the current Date when Firestore is not initialised —
 * this fallback path is never reached in practice because all writes in
 * profileStore.js are guarded by `if (!db) return`.
 *
 * @returns {import('firebase-admin').firestore.FieldValue | Date}
 */
function serverTimestamp() {
  if (!db) return new Date();
  return admin.firestore.FieldValue.serverTimestamp();
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

const serviceAccountPath = config.firebase.serviceAccountPath;

if (!serviceAccountPath) {
  logger.warn('Firebase not configured — running in memory-only mode (FIREBASE_SERVICE_ACCOUNT_PATH not set)');
} else {
  const absolutePath = resolve(serviceAccountPath);

  if (!existsSync(absolutePath)) {
    logger.warn('Firebase not configured — service account file not found', {
      path: absolutePath,
    });
  } else {
    try {
      // Read and parse the service account JSON from disk
      const serviceAccount = JSON.parse(readFileSync(absolutePath, 'utf-8'));

      // Guard against re-initialisation in hot-reload or test environments
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      db = admin.firestore();
      logger.info('Firebase Firestore connected');
    } catch (err) {
      // Non-fatal — bot continues in memory-only mode
      logger.warn('Firebase initialisation failed — running in memory-only mode', {
        error: err.message,
      });
      db = null;
    }
  }
}

export { db, serverTimestamp };
