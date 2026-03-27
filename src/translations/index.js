/**
 * @file index.js
 * @description Translation loader and resolver for Kuditax.
 *              Provides a single `t()` function that returns the correct
 *              string key for a given language, with English as the fallback.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import en from './en.js';
import pidgin from './pidgin.js';
import igbo from './igbo.js';
import hausa from './hausa.js';
import yoruba from './yoruba.js';

/**
 * Supported language codes and their display names.
 * The keys match what is stored in session.language.
 */
const SUPPORTED_LANGUAGES = {
  en:     'English',
  pidgin: 'Pidgin',
  igbo:   'Igbo',
  hausa:  'Hausa',
  yoruba: 'Yoruba',
};

/**
 * Map of language code → translation object.
 * English is also the fallback for any missing keys in other languages.
 */
const translations = { en, pidgin, igbo, hausa, yoruba };

/**
 * Maps user menu choices (1–5) to language codes.
 * This is used in the AWAITING_LANGUAGE state to resolve the user's selection.
 */
const LANGUAGE_MENU_MAP = {
  '1': 'en',
  '2': 'pidgin',
  '3': 'igbo',
  '4': 'hausa',
  '5': 'yoruba',
};

/**
 * Resolves a translation string for a given key and language.
 * Falls back to English if the key is not found in the target language.
 * Falls back to the key itself if not found in English either (prevents crashes).
 *
 * @param {string} key - The translation key (e.g. 'mainMenu', 'askGrossIncome')
 * @param {string} [lang='en'] - Language code (e.g. 'en', 'yoruba', 'hausa')
 * @returns {string} The resolved translation string
 *
 * @example
 * t('mainMenu', 'pidgin') // Returns Pidgin menu text
 * t('mainMenu', 'xx')     // Falls back to English (unknown language)
 */
function t(key, lang = 'en') {
  const langStrings = translations[lang] || translations.en;
  return langStrings[key] ?? translations.en[key] ?? key;
}

/**
 * Resolves a language code from a user's menu selection number.
 * Returns null if the input does not match any option.
 *
 * @param {string} input - User's raw input (e.g. "1", "2")
 * @returns {string | null} Language code or null
 */
function resolveLanguageFromInput(input) {
  return LANGUAGE_MENU_MAP[input?.trim()] ?? null;
}

export { t, resolveLanguageFromInput, SUPPORTED_LANGUAGES, LANGUAGE_MENU_MAP };
