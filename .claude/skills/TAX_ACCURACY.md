# Skill: Tax Accuracy

## Purpose
This skill defines the rules for maintaining the correctness, reliability, and legal accuracy of all tax calculations within Kuditax. Tax errors are not just bugs — they are a breach of trust and potential legal liability. Treat the tax engine with the same rigour you would apply to financial transaction code.

---

## Governing Law

All calculations must comply with the **Nigeria Tax Act (NTA) 2025**, signed into law on 26 June 2025 by President Bola Ahmed Tinubu, effective **1 January 2026**.

Reference sources:
- Nigeria Tax Act 2025 (NTA 2025) — NIPC publication
- KPMG Flash Alert 2025-168 — PIT regime changes
- EY Tax Alert — NTA 2025 highlights
- PwC Nigeria — The Nigerian Tax Reform Acts

---

## NTA 2025 — Complete Personal Income Tax Reference

### Tax Bands (Progressive — Applied to Chargeable Income)

```js
const TAX_BANDS = [
  // NTA 2025: First ₦800,000 of chargeable income is exempt (0%)
  { min: 0,          max: 800_000,    rate: 0.00, label: 'Tax-Free Band' },

  // NTA 2025: ₦800,001 to ₦3,000,000 taxed at 15%
  { min: 800_001,    max: 3_000_000,  rate: 0.15, label: 'Band 2 (15%)' },

  // NTA 2025: ₦3,000,001 to ₦12,000,000 taxed at 18%
  { min: 3_000_001,  max: 12_000_000, rate: 0.18, label: 'Band 3 (18%)' },

  // NTA 2025: ₦12,000,001 to ₦25,000,000 taxed at 21%
  { min: 12_000_001, max: 25_000_000, rate: 0.21, label: 'Band 4 (21%)' },

  // NTA 2025: ₦25,000,001 to ₦50,000,000 taxed at 23%
  { min: 25_000_001, max: 50_000_000, rate: 0.23, label: 'Band 5 (23%)' },

  // NTA 2025: Above ₦50,000,000 taxed at 25%
  { min: 50_000_001, max: Infinity,   rate: 0.25, label: 'Band 6 (25%)' },
];
```

### Allowable Deductions & Reliefs

| Relief | Rule | Cap |
|--------|------|-----|
| Pension contribution | 8% of (Basic + Housing + Transport) × 12 | None |
| NHF contribution | 2.5% of annual basic salary | None |
| Life assurance premium | Full annual premium | None |
| Rent relief | 20% of annual rent paid | ₦500,000 |

### Chargeable Income Formula

```
Chargeable Income = Gross Annual Income
                  − Pension Contribution
                  − NHF Contribution
                  − Life Assurance Premium
                  − Rent Relief (min of [20% × annual rent] and ₦500,000)
```

### Progressive Tax Calculation

Apply each band to the portion of chargeable income that falls within it:

```
If Chargeable Income = ₦4,000,000:

Band 1 (0%):  ₦800,000 × 0.00  = ₦0
Band 2 (15%): ₦2,200,000 × 0.15 = ₦330,000   (₦800,001 to ₦3,000,000)
Band 3 (18%): ₦1,000,000 × 0.18 = ₦180,000   (₦3,000,001 to ₦4,000,000)

Total Tax = ₦510,000
```

---

## Key Changes from Old PITA (for Reference)

Do NOT apply old PITA rules. Do NOT apply the Consolidated Relief Allowance (CRA) formula (₦200,000 + 20% of gross). That has been replaced by the ₦800,000 tax-free band in the NTA 2025.

| Old PITA | NTA 2025 |
|---|---|
| CRA: ₦200,000 + 20% of gross | Replaced by ₦800,000 tax-free band |
| Top rate: 24% | Top rate: 25% (above ₦50m) |
| Loss of office exemption: ₦10m | Loss of office exemption: ₦50m |
| 6 bands (7%, 11%, 15%, 19%, 21%, 24%) | 6 bands (0%, 15%, 18%, 21%, 23%, 25%) |

---

## Calculation Rules

### Rule 1 — Integer Arithmetic Only
All monetary values are integers in Naira. No floating point in the calculation engine.

```js
// ❌ Bad — floating point imprecision
const tax = income * 0.15; // Can produce 12999.999999 instead of 13000

// ✅ Good — use Math.floor for final results
const tax = Math.floor(income * TAX_RATE_BAND_2);
```

### Rule 2 — Named Constants Only
Never use raw numbers in tax calculations:

```js
// ❌ Bad
const rentRelief = Math.min(annualRent * 0.2, 500000);

// ✅ Good
const RENT_RELIEF_RATE = 0.20;           // NTA 2025: 20% of annual rent
const RENT_RELIEF_CAP = 500_000;         // NTA 2025: maximum ₦500,000
const rentRelief = Math.min(annualRent * RENT_RELIEF_RATE, RENT_RELIEF_CAP);
```

### Rule 3 — Band-by-Band Breakdown Always
The tax engine must always return a breakdown by band, not just a total. This is needed for transparency in the bot's response and for debugging.

Return shape:
```js
{
  grossIncome: number,
  totalDeductions: number,
  chargeableIncome: number,
  totalTax: number,
  monthlyTax: number,        // Math.floor(totalTax / 12)
  effectiveRate: number,     // (totalTax / grossIncome) * 100, rounded to 2dp
  deductionBreakdown: {
    pension: number,
    nhf: number,
    lifeAssurance: number,
    rentRelief: number,
  },
  bandBreakdown: [
    { band: string, income: number, rate: number, tax: number },
    ...
  ],
}
```

### Rule 4 — Input Validation Before Calculation
Never run a calculation on unvalidated input:

```js
// All inputs must be validated before reaching the tax engine
const validateTaxInput = (input) => {
  if (typeof input !== 'number') throw new Error('Income must be a number');
  if (input < 0) throw new Error('Income cannot be negative');
  if (!Number.isFinite(input)) throw new Error('Income must be a finite number');
  if (input > 10_000_000_000) throw new Error('Income exceeds maximum supported value'); // ₦10B cap
};
```

### Rule 5 — Zero-Income Handling
A user may have zero taxable income (e.g. their deductions exceed their gross). Handle gracefully:

```js
// Chargeable income cannot go below zero
const chargeableIncome = Math.max(0, grossIncome - totalDeductions);
```

### Rule 6 — Always Show Disclaimer
Every tax result returned to the user MUST include this disclaimer (translated to their language):

```
⚠️ This is an estimate for guidance only.
Actual tax may vary based on your employer's payroll
setup or specific FIRS/NRS rulings. For official
filing, use TaxPro-Max or consult a certified accountant.
```

---

## Test Cases Required

The following test cases MUST pass before any update to the tax calculator is merged:

| Test | Input | Expected Total Tax |
|---|---|---|
| Zero income | ₦0 | ₦0 |
| Below tax-free threshold | ₦500,000 | ₦0 |
| Exactly at threshold | ₦800,000 | ₦0 |
| Band 2 only | ₦1,500,000 | ₦105,000 |
| Band 2 + Band 3 | ₦5,000,000 | ₦690,000 |
| Band 3 boundary | ₦12,000,000 | ₦2,196,000 |
| Band 4 | ₦20,000,000 | ₦4,572,000 |
| Band 5 | ₦30,000,000 | ₦7,012,000 |
| Band 6 | ₦60,000,000 | ₦14,012,000 |

Verify calculations manually before adding to test suite. Cross-reference with https://fiscalreforms.ng/index.php/pit-calculator/

---

## When Tax Law Changes

1. Update constants in `taxCalculator.js` only
2. Update this skill file with the new values and effective date
3. Update the system prompt (`kuditax_system_prompt.md`)
4. Rerun all test cases against new values
5. Update the `@updated` header in `taxCalculator.js`
6. Add a changelog comment at the top of `taxCalculator.js`:

```js
/**
 * CHANGELOG:
 * 2026-01-01 — Updated to NTA 2025 bands (effective Jan 1 2026)
 * [future date] — Updated to [future act]
 */
```

---

## What NOT to Do

- Do not apply CRA (old PITA formula) — it no longer applies from Jan 1, 2026
- Do not round income figures provided by users — use them as-is
- Do not attempt to calculate corporate/company income tax — refer to accountant
- Do not calculate state-level development levy (varies by state) — flag it as "may apply" and advise user to check with their state IRS
- Do not guarantee a result — always show the disclaimer
