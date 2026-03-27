/**
 * @file taxCalculator.js
 * @description Pure tax calculation engine based on the Nigeria Tax Act 2025.
 *              Applies progressive tax bands to chargeable income after all reliefs.
 *              This module has zero side effects — no imports from services, no API calls.
 *              If tax law changes, only this file should need updating.
 *
 *              Effective date: 1 January 2026 (NTA 2025 commencement)
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

// ---------------------------------------------------------------------------
// NTA 2025 Tax Bands (§ Progressive Rate Schedule)
// Each band specifies: the upper income boundary and the marginal rate
// applied to income falling within that band.
// "Infinity" marks the top band — no upper limit.
// ---------------------------------------------------------------------------

/** @typedef {{ upTo: number, rate: number, label: string }} TaxBand */

/**
 * NTA 2025 progressive tax bands applied to chargeable income.
 * Rates are marginal — each rate applies only to income within its band.
 *
 * NTA 2025 §Tax Rate Schedule:
 * - First ₦800,000 is exempt (0%)
 * - ₦800,001 – ₦3,000,000 @ 15%
 * - ₦3,000,001 – ₦12,000,000 @ 18%
 * - ₦12,000,001 – ₦25,000,000 @ 21%
 * - ₦25,000,001 – ₦50,000,000 @ 23%
 * - Above ₦50,000,000 @ 25%
 */
const TAX_BANDS = [
  { upTo: 800_000,    rate: 0.00, label: 'First ₦800,000 (tax-free)' },
  { upTo: 3_000_000,  rate: 0.15, label: '₦800,001 – ₦3,000,000 @ 15%' },
  { upTo: 12_000_000, rate: 0.18, label: '₦3,000,001 – ₦12,000,000 @ 18%' },
  { upTo: 25_000_000, rate: 0.21, label: '₦12,000,001 – ₦25,000,000 @ 21%' },
  { upTo: 50_000_000, rate: 0.23, label: '₦25,000,001 – ₦50,000,000 @ 23%' },
  { upTo: Infinity,   rate: 0.25, label: 'Above ₦50,000,000 @ 25%' },
];

// ---------------------------------------------------------------------------
// NTA 2025 Relief Constants
// ---------------------------------------------------------------------------

/** NTA 2025: Pension contribution — 8% of (basic + housing + transport) × 12 */
const PENSION_RATE = 0.08;

/** NTA 2025: NHF contribution — 2.5% of annual basic salary */
const NHF_RATE = 0.025;

/** NTA 2025: Rent relief — 20% of annual rent paid, capped at ₦500,000 */
const RENT_RELIEF_RATE = 0.20;
const RENT_RELIEF_CAP = 500_000;

// ---------------------------------------------------------------------------
// Calculation Helpers
// ---------------------------------------------------------------------------

/**
 * Calculates the pension deduction for a salaried employee.
 * NTA 2025: 8% of (monthly basic + housing allowance + transport allowance) × 12
 *
 * @param {number} monthlyBasic - Monthly basic salary (Naira)
 * @param {number} monthlyHousing - Monthly housing allowance (Naira)
 * @param {number} monthlyTransport - Monthly transport allowance (Naira)
 * @returns {number} Annual pension deduction (Naira, integer)
 */
function calculatePensionDeduction(monthlyBasic, monthlyHousing, monthlyTransport) {
  const pensionableMonthly = monthlyBasic + monthlyHousing + monthlyTransport;
  return Math.floor(pensionableMonthly * PENSION_RATE * 12);
}

/**
 * Calculates the NHF (National Housing Fund) deduction.
 * NTA 2025: 2.5% of annual basic salary.
 *
 * @param {number} annualBasic - Annual basic salary (Naira)
 * @returns {number} Annual NHF deduction (Naira, integer)
 */
function calculateNhfDeduction(annualBasic) {
  return Math.floor(annualBasic * NHF_RATE);
}

/**
 * Calculates the rent relief deduction.
 * NTA 2025: 20% of annual rent paid, capped at ₦500,000.
 *
 * @param {number} annualRent - Annual rent paid by the taxpayer (Naira)
 * @returns {number} Allowable rent relief deduction (Naira, integer)
 */
function calculateRentRelief(annualRent) {
  const relief = Math.floor(annualRent * RENT_RELIEF_RATE);
  return Math.min(relief, RENT_RELIEF_CAP);
}

// ---------------------------------------------------------------------------
// Core Tax Engine
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TaxBandResult
 * @property {string} label - Human-readable band description
 * @property {number} taxableInBand - Amount of income falling in this band (Naira)
 * @property {number} rate - Marginal rate applied to this band (decimal)
 * @property {number} taxInBand - Tax owed for income in this band (Naira)
 */

/**
 * @typedef {Object} TaxResult
 * @property {number} totalTax - Total annual income tax owed (Naira, integer)
 * @property {number} monthlyTax - Estimated monthly PAYE deduction (Naira, integer)
 * @property {TaxBandResult[]} breakdown - Band-by-band tax breakdown
 */

/**
 * Calculates annual personal income tax based on NTA 2025 progressive bands.
 * Uses marginal rate logic — each band rate applies only to the income in that band.
 *
 * @param {number} chargeableIncome - Annual income after all deductions (Naira, integer)
 * @returns {TaxResult} Total tax, monthly PAYE estimate, and band-by-band breakdown
 *
 * @example
 * calculateIncomeTax(2_500_000)
 * // { totalTax: 255000, monthlyTax: 21250, breakdown: [...] }
 */
function calculateIncomeTax(chargeableIncome) {
  if (chargeableIncome <= 0) {
    return { totalTax: 0, monthlyTax: 0, breakdown: [] };
  }

  let remaining = chargeableIncome;
  let totalTax = 0;
  const breakdown = [];
  let previousBandTop = 0;

  for (const band of TAX_BANDS) {
    if (remaining <= 0) break;

    const bandSize = band.upTo === Infinity ? remaining : band.upTo - previousBandTop;
    const taxableInBand = Math.min(remaining, bandSize);
    const taxInBand = Math.floor(taxableInBand * band.rate);

    // Only include bands where income actually falls
    if (taxableInBand > 0) {
      breakdown.push({
        label: band.label,
        taxableInBand,
        rate: band.rate,
        taxInBand,
      });
      totalTax += taxInBand;
    }

    remaining -= taxableInBand;
    previousBandTop = band.upTo === Infinity ? 0 : band.upTo;
  }

  const monthlyTax = Math.floor(totalTax / 12);
  return { totalTax, monthlyTax, breakdown };
}

/**
 * @typedef {Object} SalaryReliefs
 * @property {number} monthlyBasic - Monthly basic salary (Naira)
 * @property {number} monthlyHousing - Monthly housing allowance (Naira)
 * @property {number} monthlyTransport - Monthly transport allowance (Naira)
 * @property {number} annualRent - Annual rent paid (Naira)
 * @property {number} lifeAssurancePremium - Annual life assurance premium (Naira)
 * @property {boolean} hasNhf - Whether the employee is registered with NHF
 * @property {number} [customPension] - Override pension amount (for self-employed, Naira)
 */

/**
 * @typedef {Object} FullTaxCalculation
 * @property {number} grossIncome - Annual gross income before deductions (Naira)
 * @property {number} pensionDeduction - Annual pension deduction (Naira)
 * @property {number} nhfDeduction - Annual NHF deduction (Naira)
 * @property {number} rentRelief - Annual rent relief (Naira)
 * @property {number} lifeAssuranceDeduction - Annual life assurance premium (Naira)
 * @property {number} totalDeductions - Sum of all deductions (Naira)
 * @property {number} chargeableIncome - Income after all deductions (Naira)
 * @property {TaxResult} tax - Tax calculation result
 */

/**
 * Performs a full tax calculation for a salaried (PAYE) employee.
 * Computes all applicable reliefs and deductions, then calculates the tax on the net income.
 *
 * @param {number} annualGrossIncome - Total annual gross salary (Naira)
 * @param {SalaryReliefs} reliefs - Relief and deduction inputs
 * @returns {FullTaxCalculation} Complete tax summary with all components
 *
 * @example
 * calculateSalaryTax(3_600_000, {
 *   monthlyBasic: 200_000, monthlyHousing: 50_000, monthlyTransport: 30_000,
 *   annualRent: 600_000, lifeAssurancePremium: 100_000, hasNhf: true
 * })
 */
function calculateSalaryTax(annualGrossIncome, reliefs) {
  const {
    monthlyBasic = 0,
    monthlyHousing = 0,
    monthlyTransport = 0,
    annualRent = 0,
    lifeAssurancePremium = 0,
    hasNhf = false,
    customPension = null,
  } = reliefs;

  const annualBasic = monthlyBasic * 12;

  const pensionDeduction = customPension !== null
    ? Math.floor(customPension)
    : calculatePensionDeduction(monthlyBasic, monthlyHousing, monthlyTransport);

  const nhfDeduction = hasNhf ? calculateNhfDeduction(annualBasic) : 0;
  const rentRelief = calculateRentRelief(annualRent);
  const lifeAssuranceDeduction = Math.floor(lifeAssurancePremium);

  const totalDeductions = pensionDeduction + nhfDeduction + rentRelief + lifeAssuranceDeduction;

  // Chargeable income cannot be negative
  const chargeableIncome = Math.max(0, annualGrossIncome - totalDeductions);
  const tax = calculateIncomeTax(chargeableIncome);

  return {
    grossIncome: annualGrossIncome,
    pensionDeduction,
    nhfDeduction,
    rentRelief,
    lifeAssuranceDeduction,
    totalDeductions,
    chargeableIncome,
    tax,
  };
}

export {
  calculateIncomeTax,
  calculateSalaryTax,
  calculatePensionDeduction,
  calculateNhfDeduction,
  calculateRentRelief,
  TAX_BANDS,
  PENSION_RATE,
  NHF_RATE,
  RENT_RELIEF_RATE,
  RENT_RELIEF_CAP,
};
