/**
 * @file taxCalculator.test.js
 * @description Unit tests for the NTA 2025 tax calculation engine.
 *              Covers: zero income, tax-free threshold boundary, all band boundaries,
 *              high incomes, relief calculations, and full salary tax calculations.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import {
  calculateIncomeTax,
  calculateSalaryTax,
  calculatePensionDeduction,
  calculateNhfDeduction,
  calculateRentRelief,
  RENT_RELIEF_CAP,
} from '../src/services/taxCalculator.js';

// ---------------------------------------------------------------------------
// calculateIncomeTax — Progressive band engine
// ---------------------------------------------------------------------------

describe('calculateIncomeTax', () => {
  test('zero income returns zero tax', () => {
    const result = calculateIncomeTax(0);
    expect(result.totalTax).toBe(0);
    expect(result.monthlyTax).toBe(0);
    expect(result.breakdown).toHaveLength(0);
  });

  test('negative income returns zero tax', () => {
    const result = calculateIncomeTax(-500_000);
    expect(result.totalTax).toBe(0);
  });

  test('income within tax-free band (₦800,000) pays zero tax', () => {
    const result = calculateIncomeTax(800_000);
    expect(result.totalTax).toBe(0);
  });

  test('₦1 above tax-free threshold triggers 15% band', () => {
    const result = calculateIncomeTax(800_001);
    // Tax on ₦1 at 15% = ₦0 (Math.floor)
    expect(result.totalTax).toBe(0);
  });

  test('₦1,000,000 income — tax on ₦200,000 at 15%', () => {
    // Chargeable: ₦1,000,000
    // Band 1: ₦800,000 @ 0% = ₦0
    // Band 2: ₦200,000 @ 15% = ₦30,000
    const result = calculateIncomeTax(1_000_000);
    expect(result.totalTax).toBe(30_000);
    expect(result.monthlyTax).toBe(2_500);
  });

  test('exactly ₦3,000,000 — top of 15% band', () => {
    // Band 1: ₦800,000 @ 0% = ₦0
    // Band 2: ₦2,200,000 @ 15% = ₦330,000
    const result = calculateIncomeTax(3_000_000);
    expect(result.totalTax).toBe(330_000);
  });

  test('₦3,000,001 — enters 18% band', () => {
    // ₦3,000,000 tax = ₦330,000 + ₦1 @ 18% = ₦0 (floor) = ₦330,000
    const result = calculateIncomeTax(3_000_001);
    expect(result.totalTax).toBe(330_000);
  });

  test('₦5,000,000 income', () => {
    // Band 1: ₦800,000 @ 0% = ₦0
    // Band 2: ₦2,200,000 @ 15% = ₦330,000
    // Band 3: ₦2,000,000 @ 18% = ₦360,000
    // Total: ₦690,000
    const result = calculateIncomeTax(5_000_000);
    expect(result.totalTax).toBe(690_000);
  });

  test('exactly ₦12,000,000 — top of 18% band', () => {
    // Band 1: ₦800,000 @ 0% = ₦0
    // Band 2: ₦2,200,000 @ 15% = ₦330,000
    // Band 3: ₦9,000,000 @ 18% = ₦1,620,000
    // Total: ₦1,950,000
    const result = calculateIncomeTax(12_000_000);
    expect(result.totalTax).toBe(1_950_000);
  });

  test('exactly ₦25,000,000 — top of 21% band', () => {
    // Band 1: ₦800,000 @ 0% = ₦0
    // Band 2: ₦2,200,000 @ 15% = ₦330,000
    // Band 3: ₦9,000,000 @ 18% = ₦1,620,000
    // Band 4: ₦13,000,000 @ 21% = ₦2,730,000
    // Total: ₦4,680,000
    const result = calculateIncomeTax(25_000_000);
    expect(result.totalTax).toBe(4_680_000);
  });

  test('exactly ₦50,000,000 — top of 23% band', () => {
    // Band 1: ₦800,000 @ 0% = ₦0
    // Band 2: ₦2,200,000 @ 15% = ₦330,000
    // Band 3: ₦9,000,000 @ 18% = ₦1,620,000
    // Band 4: ₦13,000,000 @ 21% = ₦2,730,000
    // Band 5: ₦25,000,000 @ 23% = ₦5,750,000
    // Total: ₦10,430,000
    const result = calculateIncomeTax(50_000_000);
    expect(result.totalTax).toBe(10_430_000);
  });

  test('₦100,000,000 — into top 25% band', () => {
    // Up to ₦50m: ₦10,430,000
    // Band 6: ₦50,000,000 @ 25% = ₦12,500,000
    // Total: ₦22,930,000
    const result = calculateIncomeTax(100_000_000);
    expect(result.totalTax).toBe(22_930_000);
  });

  test('monthly tax is annual tax divided by 12 (floored)', () => {
    const result = calculateIncomeTax(5_000_000);
    expect(result.monthlyTax).toBe(Math.floor(result.totalTax / 12));
  });

  test('breakdown only contains bands with taxable income', () => {
    const result = calculateIncomeTax(800_000);
    // Only the tax-free band should appear
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].taxInBand).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculatePensionDeduction
// ---------------------------------------------------------------------------

describe('calculatePensionDeduction', () => {
  test('calculates 8% of (basic + housing + transport) × 12', () => {
    // (200,000 + 50,000 + 30,000) × 12 × 0.08 = 268,800
    const result = calculatePensionDeduction(200_000, 50_000, 30_000);
    expect(result).toBe(268_800);
  });

  test('returns 0 when all inputs are 0', () => {
    expect(calculatePensionDeduction(0, 0, 0)).toBe(0);
  });

  test('floors the result to an integer', () => {
    const result = calculatePensionDeduction(100_001, 0, 0);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateNhfDeduction
// ---------------------------------------------------------------------------

describe('calculateNhfDeduction', () => {
  test('calculates 2.5% of annual basic salary', () => {
    // ₦2,400,000 × 0.025 = ₦60,000
    expect(calculateNhfDeduction(2_400_000)).toBe(60_000);
  });

  test('returns 0 for zero basic salary', () => {
    expect(calculateNhfDeduction(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateRentRelief
// ---------------------------------------------------------------------------

describe('calculateRentRelief', () => {
  test('calculates 20% of annual rent', () => {
    // ₦600,000 × 0.20 = ₦120,000
    expect(calculateRentRelief(600_000)).toBe(120_000);
  });

  test('caps relief at ₦500,000', () => {
    // ₦5,000,000 × 0.20 = ₦1,000,000 → capped at ₦500,000
    expect(calculateRentRelief(5_000_000)).toBe(RENT_RELIEF_CAP);
  });

  test('exactly at the cap threshold', () => {
    // ₦2,500,000 × 0.20 = ₦500,000 — exactly at cap
    expect(calculateRentRelief(2_500_000)).toBe(RENT_RELIEF_CAP);
  });

  test('returns 0 for zero rent', () => {
    expect(calculateRentRelief(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateSalaryTax — Full integration
// ---------------------------------------------------------------------------

describe('calculateSalaryTax', () => {
  test('calculates a typical salaried employee correctly', () => {
    // Annual gross: ₦3,600,000
    // Monthly basic: ₦200,000, housing: ₦50,000, transport: ₦30,000
    // Pension: (200k + 50k + 30k) × 12 × 0.08 = ₦268,800
    // NHF: ₦200k × 12 × 0.025 = ₦60,000
    // Rent: ₦600k × 0.20 = ₦120,000
    // Life assurance: ₦100,000
    // Total deductions: ₦548,800
    // Chargeable: ₦3,600,000 - ₦548,800 = ₦3,051,200
    const result = calculateSalaryTax(3_600_000, {
      monthlyBasic:         200_000,
      monthlyHousing:       50_000,
      monthlyTransport:     30_000,
      annualRent:           600_000,
      lifeAssurancePremium: 100_000,
      hasNhf:               true,
    });

    expect(result.grossIncome).toBe(3_600_000);
    expect(result.pensionDeduction).toBe(268_800);
    expect(result.nhfDeduction).toBe(60_000);
    expect(result.rentRelief).toBe(120_000);
    expect(result.lifeAssuranceDeduction).toBe(100_000);
    expect(result.totalDeductions).toBe(548_800);
    expect(result.chargeableIncome).toBe(3_051_200);
    expect(result.tax.totalTax).toBeGreaterThan(0);
  });

  test('chargeable income cannot be negative', () => {
    const result = calculateSalaryTax(100_000, {
      monthlyBasic: 100_000,
      monthlyHousing: 0,
      monthlyTransport: 0,
      annualRent: 0,
      lifeAssurancePremium: 500_000,
      hasNhf: false,
    });
    expect(result.chargeableIncome).toBeGreaterThanOrEqual(0);
  });

  test('customPension = 0 overrides automatic pension calculation', () => {
    const result = calculateSalaryTax(3_600_000, {
      monthlyBasic: 200_000,
      monthlyHousing: 50_000,
      monthlyTransport: 30_000,
      customPension: 0,
    });
    expect(result.pensionDeduction).toBe(0);
  });

  test('no NHF when hasNhf is false', () => {
    const result = calculateSalaryTax(3_600_000, {
      monthlyBasic: 200_000,
      hasNhf: false,
    });
    expect(result.nhfDeduction).toBe(0);
  });

  test('all deductions zero — chargeable income equals gross income', () => {
    const result = calculateSalaryTax(5_000_000, {
      monthlyBasic: 0, monthlyHousing: 0, monthlyTransport: 0,
      annualRent: 0, lifeAssurancePremium: 0, hasNhf: false, customPension: 0,
    });
    expect(result.chargeableIncome).toBe(5_000_000);
  });
});
