/**
 * @file taxTips.js
 * @description Personalised tax-saving tips generator for Kuditax.
 *              Analyses the user's tax calculation result and returns only
 *              tips that are directly relevant to their specific situation.
 *              Pure module — no side effects, no API calls.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import { RENT_RELIEF_CAP } from './taxCalculator.js';

// The income proximity threshold for the "you're close to the next band" tip
const BAND_PROXIMITY_THRESHOLD = 200_000;

// NTA 2025 band boundaries (used to detect band proximity)
const BAND_BOUNDARIES = [800_000, 3_000_000, 12_000_000, 25_000_000, 50_000_000];

// Rates corresponding to the band above each boundary
const BAND_RATES_ABOVE = { 800_000: 15, 3_000_000: 18, 12_000_000: 21, 25_000_000: 23, 50_000_000: 25 };

/**
 * @typedef {Object} TaxCalculationData
 * @property {number} grossIncome - Annual gross income (Naira)
 * @property {number} pensionDeduction - Pension deduction applied (Naira)
 * @property {number} nhfDeduction - NHF deduction applied (Naira)
 * @property {number} rentRelief - Rent relief applied (Naira)
 * @property {number} lifeAssuranceDeduction - Life assurance deduction applied (Naira)
 * @property {number} chargeableIncome - Income after all deductions (Naira)
 * @property {boolean} [isSelfEmployed] - Whether the user is self-employed
 * @property {number} [annualRent] - Annual rent actually paid (Naira)
 */

/**
 * @typedef {Object} TaxTip
 * @property {string} key - Unique identifier for the tip (for deduplication)
 * @property {string} message - The tip message to display to the user
 */

/**
 * Generates a list of personalised, actionable tax-saving tips based on
 * the user's specific tax data. Only returns tips that apply to the user.
 *
 * @param {TaxCalculationData} data - The user's tax calculation inputs and results
 * @returns {TaxTip[]} Array of relevant tips (empty if none apply)
 *
 * @example
 * generateTaxTips({ pensionDeduction: 0, nhfDeduction: 0, chargeableIncome: 2_900_000, ... })
 * // Returns pension tip, NHF tip, and possibly band proximity tip
 */
function generateTaxTips(data) {
  const {
    pensionDeduction = 0,
    nhfDeduction = 0,
    rentRelief = 0,
    lifeAssuranceDeduction = 0,
    chargeableIncome = 0,
    isSelfEmployed = false,
    annualRent = 0,
  } = data;

  const tips = [];

  // --- Pension tip ---
  // Trigger if no pension deduction was applied, or for self-employed with no RSA contributions
  if (pensionDeduction === 0) {
    if (isSelfEmployed) {
      tips.push({
        key: 'pension_self_employed',
        message:
          '💡 *Self-Employed Pension:* You can voluntarily contribute to a Retirement Savings Account (RSA) with any licensed PFA. This is fully deductible and reduces your taxable income.',
      });
    } else {
      tips.push({
        key: 'pension_paye',
        message:
          '💡 *Pension Tip:* You can make voluntary pension contributions above the mandatory 8%. Every extra naira you contribute reduces your taxable income — and grows your retirement savings.',
      });
    }
  }

  // --- NHF tip ---
  // Trigger if no NHF deduction was applied
  if (nhfDeduction === 0) {
    tips.push({
      key: 'nhf',
      message:
        '💡 *NHF Tip:* Registering with the National Housing Fund (NHF) means 2.5% of your basic salary is deductible from your taxable income. It also qualifies you for low-interest Federal Mortgage Bank loans.',
    });
  }

  // --- Rent relief tip ---
  // Trigger if the user pays rent but claimed no rent relief,
  // OR if they claimed some but are not at the cap yet (meaning they could claim more)
  if (annualRent > 0 && rentRelief === 0) {
    tips.push({
      key: 'rent_relief_none',
      message:
        `💡 *Rent Relief:* Under the NTA 2025, you can deduct 20% of your annual rent (up to ${formatNairaSimple(RENT_RELIEF_CAP)}) from your taxable income. Make sure this is captured in your tax filing.`,
    });
  }

  // --- Life assurance tip ---
  // Trigger if no life assurance premium was declared
  if (lifeAssuranceDeduction === 0) {
    tips.push({
      key: 'life_assurance',
      message:
        '💡 *Life Insurance:* Premiums on a qualifying life assurance policy are fully deductible from your taxable income. This is a legal way to reduce your tax bill while protecting your family.',
    });
  }

  // --- Band proximity tip ---
  // Trigger if chargeable income is within ₦200,000 below the next higher tax band
  const proximityTip = getBandProximityTip(chargeableIncome);
  if (proximityTip) {
    tips.push(proximityTip);
  }

  return tips;
}

/**
 * Checks if the user's chargeable income is close to crossing into the next tax band.
 * Returns a tip if they are within BAND_PROXIMITY_THRESHOLD Naira below a band boundary.
 *
 * @param {number} chargeableIncome - Annual chargeable income (Naira)
 * @returns {TaxTip | null} Band proximity tip, or null if not close to any boundary
 */
function getBandProximityTip(chargeableIncome) {
  for (const boundary of BAND_BOUNDARIES) {
    const gap = boundary - chargeableIncome;
    if (gap > 0 && gap <= BAND_PROXIMITY_THRESHOLD) {
      const nextRate = BAND_RATES_ABOVE[boundary];
      return {
        key: 'band_proximity',
        message:
          `💡 *Band Tip:* You're only ${formatNairaSimple(gap)} away from the ${nextRate}% tax band. Increasing your pension contribution or taking a qualifying life policy could keep your income in the lower band and reduce your tax.`,
      };
    }
  }
  return null;
}

/**
 * Builds the full tips section text to be appended after a tax calculation result.
 * Returns an empty string if no tips are relevant.
 *
 * @param {TaxCalculationData} data - Tax calculation data
 * @returns {string} Formatted tips block ready for WhatsApp, or empty string
 */
function buildTipsMessage(data) {
  const tips = generateTaxTips(data);
  if (tips.length === 0) return '';

  const lines = ['📋 *Tax-Saving Tips for You:*', ''];
  for (const tip of tips) {
    lines.push(tip.message);
    lines.push('');
  }
  lines.push('💬 Want me to recalculate with any of these applied? Just say yes!');

  return lines.join('\n');
}

/**
 * Simple Naira formatter for use within this module (avoids circular imports).
 * @param {number} amount - Naira amount
 * @returns {string} Formatted string e.g. "₦500,000"
 */
function formatNairaSimple(amount) {
  return `₦${Math.floor(amount).toLocaleString('en-NG')}`;
}

export { generateTaxTips, buildTipsMessage, getBandProximityTip };
