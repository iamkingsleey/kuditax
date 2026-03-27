# Kuditax — Claude Development Guidelines

You are a senior software engineer helping build **Kuditax**, a hybrid WhatsApp tax assistant bot for Nigeria. This is a production-bound product targeting millions of everyday Nigerians. Every line of code you write must reflect that responsibility.

Read this file fully before writing any code. These rules are non-negotiable.

---

## Project Context

**Product:** Kuditax — A multilingual WhatsApp bot (hybrid scripted + AI agent) that helps Nigerians understand and file taxes under the Nigeria Tax Act 2025.

**Stack:**
- Runtime: Node.js (v20+)
- Framework: Express.js
- WhatsApp: Meta Cloud API (WhatsApp Business Platform)
- AI Agent: Anthropic Claude API (claude-sonnet-4-6)
- Session storage: In-memory (Map) — no database in v1
- Language: JavaScript (ESM or CommonJS, be consistent throughout)
- Hosting: Render free tier (initial) → production TBD

**Key constraints:**
- No database in v1 — all session data lives in memory
- No PII storage — do not persist names, BVN, NIN, or financial data
- WhatsApp message length limit: 4,096 characters per message
- Free tier hosting: server may cold-start — handle gracefully

---

## 1. Code Structure

Always follow this folder structure. Never deviate without documenting why.

```
kuditax/
├── src/
│   ├── index.js                   # Express app entry point
│   ├── routes/
│   │   └── webhook.js             # POST /webhook + GET /webhook (verification)
│   ├── services/
│   │   ├── whatsapp.js            # Meta Cloud API — send messages
│   │   ├── claudeAgent.js         # Anthropic API — AI conversation layer
│   │   ├── taxCalculator.js       # Pure NTA 2025 tax calculation engine
│   │   ├── taxTips.js             # Tax-saving tips generator
│   │   └── sessionManager.js      # In-memory session store (Map-based)
│   ├── flows/
│   │   └── messageRouter.js       # Routes incoming messages to correct handler
│   ├── translations/
│   │   ├── index.js               # Language loader and resolver
│   │   ├── en.js                  # English strings
│   │   ├── pidgin.js              # Nigerian Pidgin strings
│   │   ├── igbo.js                # Igbo strings
│   │   ├── hausa.js               # Hausa strings
│   │   └── yoruba.js              # Yoruba strings
│   └── utils/
│       ├── formatter.js           # Currency formatting, number helpers
│       ├── validator.js           # Input validation helpers
│       └── logger.js              # Structured logger (Winston)
├── tests/
│   ├── taxCalculator.test.js
│   └── taxTips.test.js
├── .env.example                   # Template — never commit real .env
├── .gitignore
└── package.json
```

**Rules:**
- One concern per file. Never put routing logic inside a service.
- Services must be stateless pure functions where possible.
- No business logic in route handlers — delegate to services.

---

## 2. Code Quality Rules

### Naming
- Variables and functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Files: `camelCase.js`
- Use descriptive names. `calculateAnnualTax` not `calc`. `userPhoneNumber` not `ph`.

### Functions
- Every function must do exactly one thing.
- Maximum function length: 30 lines. If longer, extract logic into helpers.
- Prefer pure functions — same input always produces same output.
- Avoid side effects inside calculation functions.

### Variables
- Use `const` by default. Use `let` only when reassignment is needed. Never use `var`.
- Declare variables at the top of their scope.
- Avoid magic numbers — use named constants.

```js
// ❌ Bad
const tax = income * 0.15;

// ✅ Good
const SECOND_BAND_RATE = 0.15;
const tax = income * SECOND_BAND_RATE;
```

---

## 3. Annotation Standards

Every file, function, and non-obvious logic block must be annotated.

### File Header
Every file must start with a header comment:

```js
/**
 * @file taxCalculator.js
 * @description Pure tax calculation engine based on Nigeria Tax Act 2025.
 *              Applies progressive tax bands to chargeable income after reliefs.
 *              No side effects — takes input, returns output.
 * @author Kuditax Engineering
 * @updated 2026-03-27
 */
```

### Function JSDoc
Every exported function must have a JSDoc block:

```js
/**
 * Calculates annual personal income tax based on NTA 2025 progressive bands.
 *
 * @param {number} chargeableIncome - Annual income after all deductions (in Naira)
 * @returns {{ totalTax: number, breakdown: TaxBand[] }} Tax amount and band-by-band breakdown
 *
 * @example
 * calculateIncomeTax(2_500_000)
 * // returns { totalTax: 255000, breakdown: [...] }
 */
```

### Inline Comments
- Explain WHY, not WHAT. The code shows what — the comment explains the reasoning.
- Comment any non-obvious logic, edge case handling, or regulatory reference.

```js
// NTA 2025 §X: First ₦800,000 of chargeable income is exempt from tax.
// This replaces the old CRA (Consolidated Relief Allowance) from PITA.
const TAX_FREE_THRESHOLD = 800_000;
```

### TODO Comments
Use structured TODO comments for incomplete work:

```js
// TODO(kingsley): Add Redis-backed session store when moving off free tier
// TODO(v2): Persist tax profiles to PostgreSQL for returning users
```

---

## 4. Security Rules

These are mandatory. No exceptions.

- **Never hardcode credentials.** All secrets go in `.env`. If you see a key, token, or password in code, stop and move it to `.env` immediately.
- **Validate all incoming webhook payloads.** Verify the `X-Hub-Signature-256` header on every POST from Meta before processing.
- **Sanitise user input before passing to the AI agent.** Strip HTML, control characters, and excessively long inputs (max 500 characters per user message).
- **Rate limit the webhook endpoint.** Use `express-rate-limit` — max 30 requests per minute per IP.
- **Never log sensitive data.** Do not log: phone numbers (mask them), income figures, or any user-provided financial data.
- **Never return raw error objects to the client.** Always return a sanitised, structured error response.

Phone number masking in logs:
```js
// ❌ Bad
logger.info(`Message received from ${phoneNumber}`);

// ✅ Good
const masked = phoneNumber.slice(0, 4) + '****' + phoneNumber.slice(-3);
logger.info(`Message received from ${masked}`);
```

---

## 5. Error Handling

- Use try/catch in all async functions.
- Never let an unhandled error crash the server — it will affect all active sessions.
- Log errors with context (function name, error code, sanitised input excerpt).
- Return a friendly fallback message to the user when an error occurs:

```js
// Send this to the user when something goes wrong internally
const ERROR_FALLBACK_MESSAGE = "Sorry, something went wrong on my end. Please try again in a moment. 🙏";
```

- Distinguish between recoverable errors (bad user input) and fatal errors (API failures). Handle them differently.

---

## 6. Logging

Use Winston for all logging. Never use `console.log` in production code.

Log levels:
- `info` — Normal operations (message received, session created)
- `warn` — Unexpected but non-fatal situations (unknown state, API retry)
- `error` — Failures requiring attention (API down, webhook signature fail)
- `debug` — Detailed traces for development only (never enabled in production)

Always include structured context:

```js
logger.info('Incoming WhatsApp message', {
  from: maskedPhone,
  sessionState: session.currentState,
  language: session.language,
  messageType: message.type,
});
```

Never log:
- Raw phone numbers
- Income or financial figures
- Full message content (log message type and length only)

---

## 7. Tax Calculation Rules

The tax engine is the most critical part of the codebase. Treat it accordingly.

- All monetary values are stored and calculated in **Naira (₦) as integers** (no decimals, no floating point). Use `Math.floor()` for final results.
- The tax engine must be a **pure module** — no imports from services, no side effects, no API calls.
- Every tax band, rate, and threshold must be defined as a **named constant** with a comment referencing the relevant NTA 2025 provision.
- Write unit tests for the tax calculator covering: zero income, boundary values (₦800k, ₦3m, ₦12m, ₦25m, ₦50m), and high incomes above ₦50m.
- If tax law changes, only `taxCalculator.js` should need updating — no other files.

---

## 8. WhatsApp Message Rules

- Every outgoing message must be under 4,000 characters (leave buffer).
- If a response would exceed 4,000 characters, split it into multiple messages and send them sequentially with a 500ms delay between each.
- Never send more than 3 messages in a single response.
- Always end messages with a clear action or question so the user knows what to do next.
- Avoid sending empty messages — validate before every `sendMessage` call.

---

## 9. Session Management Rules

- Session key: user's WhatsApp phone number (E.164 format, e.g. `+2348012345678`)
- Session object must contain at minimum: `{ currentState, language, userType, taxData, createdAt, lastActivityAt }`
- Sessions expire after 30 minutes of inactivity — implement a cleanup interval.
- Never store income figures beyond what is needed for the current calculation step.
- Log session creation and expiry (with masked phone number) at `info` level.

---

## 10. Environment Variables

Always use `.env.example` to document every required variable. Never commit `.env`.

Required variables:
```
PORT=3000
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
ANTHROPIC_API_KEY=
NODE_ENV=development
```

Access them only through a central config module — never call `process.env` directly in service files.

---

## 11. Git Hygiene

- Commit messages: `type(scope): short description` — e.g. `feat(tax): add NTA 2025 band calculations`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Never commit: `.env`, `node_modules/`, generated files
- `.gitignore` must include: `.env`, `node_modules/`, `*.log`, `.DS_Store`

---

## 12. What Not to Do

- Do not use `any` types or untyped objects where JSDoc can add structure
- Do not mix async/await and `.then()/.catch()` in the same codebase
- Do not write clever one-liners that junior developers can't read
- Do not add dependencies without a clear reason — check if the standard library handles it first
- Do not ignore linter warnings — fix them
- Do not write code that only works on your local machine (no absolute paths, no OS-specific commands)
