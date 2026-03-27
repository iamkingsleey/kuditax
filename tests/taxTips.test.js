/**
 * @file taxTips.test.js
 * @description Unit tests for the personalised tax tips generator.
 *              Verifies that each tip triggers only for the correct conditions
 *              and that irrelevant tips are suppressed.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import { generateTaxTips, getBandProximityTip } from '../src/services/taxTips.js';

// Helper: build a data object with all reliefs applied (no tips should fire)
function fullReliefsData() {
  return {
    grossIncome:            5_000_000,
    pensionDeduction:       300_000,
    nhfDeduction:           60_000,
    rentRelief:             120_000,
    lifeAssuranceDeduction: 100_000,
    chargeableIncome:       4_420_000,
    isSelfEmployed:         false,
    annualRent:             600_000,
  };
}

describe('generateTaxTips', () => {
  test('returns no tips when all reliefs are already applied', () => {
    const tips = generateTaxTips(fullReliefsData());
    // Band proximity: chargeable = ₦4,420,000, next boundary is ₦12,000,000 — not close
    expect(tips).toHaveLength(0);
  });

  test('pension tip fires when pensionDeduction is zero (PAYE)', () => {
    const tips = generateTaxTips({ ...fullReliefsData(), pensionDeduction: 0 });
    const keys = tips.map((t) => t.key);
    expect(keys).toContain('pension_paye');
  });

  test('self-employed pension tip fires when pensionDeduction is zero and isSelfEmployed', () => {
    const tips = generateTaxTips({ ...fullReliefsData(), pensionDeduction: 0, isSelfEmployed: true });
    const keys = tips.map((t) => t.key);
    expect(keys).toContain('pension_self_employed');
    expect(keys).not.toContain('pension_paye');
  });

  test('NHF tip fires when nhfDeduction is zero', () => {
    const tips = generateTaxTips({ ...fullReliefsData(), nhfDeduction: 0 });
    const keys = tips.map((t) => t.key);
    expect(keys).toContain('nhf');
  });

  test('rent relief tip fires when user pays rent but has zero relief', () => {
    const tips = generateTaxTips({ ...fullReliefsData(), rentRelief: 0, annualRent: 600_000 });
    const keys = tips.map((t) => t.key);
    expect(keys).toContain('rent_relief_none');
  });

  test('rent relief tip does NOT fire when user pays no rent', () => {
    const tips = generateTaxTips({ ...fullReliefsData(), rentRelief: 0, annualRent: 0 });
    const keys = tips.map((t) => t.key);
    expect(keys).not.toContain('rent_relief_none');
  });

  test('life assurance tip fires when lifeAssuranceDeduction is zero', () => {
    const tips = generateTaxTips({ ...fullReliefsData(), lifeAssuranceDeduction: 0 });
    const keys = tips.map((t) => t.key);
    expect(keys).toContain('life_assurance');
  });

  test('all four non-proximity tips fire when no reliefs applied and rent paid', () => {
    const tips = generateTaxTips({
      grossIncome:            5_000_000,
      pensionDeduction:       0,
      nhfDeduction:           0,
      rentRelief:             0,
      lifeAssuranceDeduction: 0,
      chargeableIncome:       5_000_000,
      isSelfEmployed:         false,
      annualRent:             600_000,
    });
    const keys = tips.map((t) => t.key);
    expect(keys).toContain('pension_paye');
    expect(keys).toContain('nhf');
    expect(keys).toContain('rent_relief_none');
    expect(keys).toContain('life_assurance');
  });

  test('each tip has a non-empty key and message', () => {
    const tips = generateTaxTips({
      pensionDeduction: 0, nhfDeduction: 0, rentRelief: 0, lifeAssuranceDeduction: 0,
      chargeableIncome: 1_000_000, annualRent: 600_000,
    });
    for (const tip of tips) {
      expect(typeof tip.key).toBe('string');
      expect(tip.key.length).toBeGreaterThan(0);
      expect(typeof tip.message).toBe('string');
      expect(tip.message.length).toBeGreaterThan(0);
    }
  });
});

describe('getBandProximityTip', () => {
  test('fires when income is within ₦200,000 below ₦800,000 boundary', () => {
    const tip = getBandProximityTip(650_000);
    expect(tip).not.toBeNull();
    expect(tip.key).toBe('band_proximity');
    expect(tip.message).toContain('15%');
  });

  test('fires when income is within ₦200,000 below ₦3,000,000 boundary', () => {
    const tip = getBandProximityTip(2_850_000);
    expect(tip).not.toBeNull();
    expect(tip.message).toContain('18%');
  });

  test('fires when income is within ₦200,000 below ₦12,000,000 boundary', () => {
    const tip = getBandProximityTip(11_900_000);
    expect(tip).not.toBeNull();
    expect(tip.message).toContain('21%');
  });

  test('does NOT fire when income is exactly at the boundary', () => {
    // At the boundary you're already IN the next band — tip not needed
    const tip = getBandProximityTip(800_000);
    expect(tip).toBeNull();
  });

  test('does NOT fire when income is more than ₦200,000 below a boundary', () => {
    const tip = getBandProximityTip(2_500_000);
    expect(tip).toBeNull();
  });

  test('does NOT fire for very high incomes above ₦50,000,000', () => {
    const tip = getBandProximityTip(80_000_000);
    expect(tip).toBeNull();
  });

  test('returns null for zero income', () => {
    expect(getBandProximityTip(0)).toBeNull();
  });
});
