# Skill: Conversation Design

## Purpose
This skill governs how the Kuditax WhatsApp bot conducts conversations. It covers message structure, flow design, error recovery, and the rules that make the bot feel natural, helpful, and trustworthy to everyday Nigerians.

Apply these rules whenever you are writing conversation flows, message templates, or any logic that determines what the bot says to users.

---

## Core Principles

**1. One question at a time.**
Never ask two questions in a single message. Users on WhatsApp respond to one prompt at a time. Asking multiple questions causes confusion and drop-off.

```
❌ "What is your annual salary and do you pay rent?"
✅ "What is your annual gross salary? (Your total pay before any deductions)"
```

**2. Plain language always.**
Write at a reading level accessible to someone with secondary school education. Avoid Latin, legal jargon, acronyms without explanation, and unnecessarily long words.

```
❌ "Please specify your consolidated emoluments for the fiscal year."
✅ "What is your total income for the year? Include your salary and any other money you earn."
```

**3. Give context with every question.**
Users don't know what "annual gross salary" means if they've never seen a payslip. Always add a brief clarification in brackets.

```
✅ "What is your monthly basic salary?
(This is the fixed base amount — not including allowances like housing or transport)"
```

**4. Acknowledge before proceeding.**
After a user answers a question, briefly acknowledge it before asking the next one. This makes the conversation feel human.

```
User: "1,800,000"
Bot: "Got it — ₦1,800,000 annual salary. 👍

Next question: Do you receive a housing allowance? If yes, how much per month?"
```

**5. Always show a next step.**
Every message must end with either a question, a numbered menu, or a clear instruction. Users should never be left wondering what to do.

---

## Message Format Rules

### Length Limits
- Standard response: Maximum 300 characters
- Calculation result: Maximum 600 characters (split into 2 messages if needed)
- Guide steps (TIN, TaxPro-Max): Maximum 3 steps per message, paginate the rest

### Splitting Long Messages
If a response exceeds 600 characters, split it and send sequentially with a 500ms delay:

```js
// Split long responses to stay within WhatsApp readability limits
const sendLongResponse = async (phone, parts) => {
  for (const part of parts) {
    await sendMessage(phone, part);
    await delay(500); // 500ms between messages to prevent out-of-order delivery
  }
};
```

### Emoji Usage
Use emoji sparingly to aid scanning and add warmth. Recommended set:

| Emoji | Use for |
|-------|---------|
| 🇳🇬 | National identity / welcome |
| ✅ | Confirmation / correct answer |
| ❌ | Invalid input |
| 💰 | Income / money topics |
| 📋 | Filing / documents |
| 💡 | Tax tips |
| 🔒 | Privacy / security |
| ⚠️ | Disclaimer / warning |
| 👍 | Acknowledgement |
| 😊 | Friendly tone |
| 📊 | Results / calculations |

Never use more than 2 emoji per message.

### Numbers and Currency
Always format Naira amounts with commas and the ₦ symbol:

```js
// ✅ ₦1,800,000 not N1800000 or NGN 1800000
const formatNaira = (amount) => `₦${amount.toLocaleString('en-NG')}`;
```

---

## Conversation States

Every session must be in exactly one state at a time. Define all states as string constants:

```js
const STATES = {
  // Onboarding
  INIT: 'INIT',
  LANGUAGE_SELECTION: 'LANGUAGE_SELECTION',
  PRIVACY_NOTICE: 'PRIVACY_NOTICE',
  RETURNING_USER_CHECK: 'RETURNING_USER_CHECK',
  MAIN_MENU: 'MAIN_MENU',

  // Tax type selection
  USER_TYPE_SELECTION: 'USER_TYPE_SELECTION',

  // PAYE flow
  PAYE_Q_GROSS: 'PAYE_Q_GROSS',
  PAYE_Q_BASIC: 'PAYE_Q_BASIC',
  PAYE_Q_HOUSING: 'PAYE_Q_HOUSING',
  PAYE_Q_TRANSPORT: 'PAYE_Q_TRANSPORT',
  PAYE_Q_RENT: 'PAYE_Q_RENT',
  PAYE_Q_PENSION: 'PAYE_Q_PENSION',
  PAYE_Q_NHF: 'PAYE_Q_NHF',
  PAYE_Q_LIFE_ASSURANCE: 'PAYE_Q_LIFE_ASSURANCE',
  PAYE_RESULT: 'PAYE_RESULT',

  // Self-employed flow
  SE_Q_INCOME: 'SE_Q_INCOME',
  SE_Q_EXPENSES: 'SE_Q_EXPENSES',
  SE_Q_RENT: 'SE_Q_RENT',
  SE_Q_PENSION: 'SE_Q_PENSION',
  SE_RESULT: 'SE_RESULT',

  // Guide flows
  TIN_GUIDE: 'TIN_GUIDE',
  FILING_GUIDE: 'FILING_GUIDE',

  // Post-result
  TAX_TIPS: 'TAX_TIPS',
  RECALCULATE: 'RECALCULATE',

  // AI freeform
  AI_CONVERSATION: 'AI_CONVERSATION',
};
```

### State Transition Rules
- Every state handler must always set `session.currentState` to the next state before returning
- If user input is invalid, stay in the current state and re-prompt (do not advance)
- If user types "menu" or "home" at any point, return to `MAIN_MENU`
- If user types "help" at any point, explain the current step in simpler terms

---

## Input Handling

### Parsing Monetary Amounts
Users will type numbers in many formats. The parser must handle all of them:

```js
/**
 * Parses a user-typed monetary amount into an integer (Naira).
 * Handles formats: "1800000", "1,800,000", "1.8m", "1.8 million", "₦1,800,000"
 *
 * @param {string} input - Raw user input
 * @returns {number|null} Integer Naira amount, or null if unparseable
 */
const parseMoneyInput = (input) => {
  const cleaned = input.replace(/[₦,\s]/g, '').toLowerCase();

  // Handle "1.8m" or "1.8 million"
  if (cleaned.includes('m')) {
    const num = parseFloat(cleaned.replace('m', '').replace('illion', ''));
    return isNaN(num) ? null : Math.floor(num * 1_000_000);
  }

  // Handle "500k"
  if (cleaned.includes('k')) {
    const num = parseFloat(cleaned.replace('k', ''));
    return isNaN(num) ? null : Math.floor(num * 1_000);
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.floor(num);
};
```

### Handling "No" or "None" Answers
Many questions have optional components (rent, NHF, life insurance). If the user answers negatively, treat the value as zero and continue:

Negative answer triggers: "no", "none", "nope", "i don't", "i don't have", "nothing", "nil", "0", "zero"

```js
const isNegativeAnswer = (input) => {
  const negatives = ['no', 'none', 'nope', "i don't", "i don't have", 'nothing', 'nil', 'nill'];
  return negatives.some(n => input.toLowerCase().includes(n)) || input.trim() === '0';
};
```

### Handling Unexpected Input
When a user sends something that doesn't match expected input for the current state:

```
Bot: "I didn't quite get that. 😊

[Repeat the question clearly with an example]

Example: Type 1800000 for ₦1,800,000"
```

Do not advance state. Do not show an error code. Maximum 2 reprompts before routing to AI freeform mode.

---

## AI Freeform Mode

When a user:
- Asks a question outside the scripted flow
- Sends a message the bot can't parse after 2 attempts
- Explicitly asks a tax question in natural language

Route to `AI_CONVERSATION` state and pass the message to the Claude agent. The Claude agent handles the response. After the AI responds, offer to return to the menu:

```
[AI response here]

---
Need anything else? Type *menu* to go back to the main menu.
```

---

## Error Recovery Patterns

### Invalid Number Input
```
❌ User sends: "I earn well"
✅ Bot responds:
"Please type your annual income as a number.
For example: 2400000 (for ₦2,400,000)
Or: 2.4m"
```

### Suspiciously Low Amount
If a user enters an annual income below ₦120,000 (below minimum wage territory):

```
"Just to confirm — did you mean ₦[X] as your annual income?
(That's about ₦[X/12] per month)

If yes, type *yes*. If you meant a different amount, type the correct figure."
```

### Suspiciously High Amount
If income exceeds ₦500,000,000 (₦500 million):

```
"That's a large figure! Just to confirm — did you mean
₦[formatted amount] for the full year?

Type *yes* to confirm or enter the correct amount."
```

### Session Timeout Recovery
When a user resumes a conversation after the session has expired:

```
"Welcome back to Kuditax! 🇳🇬

It looks like our previous session ended. No worries —
let's start fresh. What would you like to do?

[Show main menu]"
```

---

## Language-Specific Conversation Rules

### Pidgin
- Use contractions and informal phrasing: "no worry", "make we", "how e go be"
- Numbers should still be formatted formally: ₦1,800,000
- Avoid overly formal punctuation

### Igbo
- Use proper diacritical marks where possible (ị, ọ, ụ, ṅ)
- Tone is respectful but warm
- Note for developers: Have translations reviewed by a native Igbo speaker before launch

### Hausa
- Hausa is written left-to-right
- Use appropriate honorifics: "ku" for plural/respectful second person
- Note for developers: Have translations reviewed by a native Hausa speaker before launch

### Yoruba
- Use proper tonal marks where possible (à, á, â, ọ, ẹ)
- Note for developers: Have translations reviewed by a native Yoruba speaker before launch

---

## Exit and Reset Commands

These must work at any point in any conversation:

| User Input | Action |
|---|---|
| "menu" / "home" | Return to main menu |
| "restart" / "start over" | Clear session data, restart from language selection |
| "help" | Explain current step in simpler terms |
| "cancel" | Cancel current flow, return to main menu |
| "delete my data" / "forget me" | Clear session, send NDPR erasure confirmation |
| "language" / "change language" | Return to language selection |

---

## Tone by Situation

| Situation | Tone |
|---|---|
| Welcome / onboarding | Warm, welcoming, reassuring |
| Asking questions | Clear, patient, encouraging |
| Calculation result | Informative, neutral, clear |
| Tax tips | Enthusiastic, helpful, actionable |
| Error / invalid input | Gentle, non-blaming, helpful |
| Escalation to accountant | Empathetic, professional |
| Disclaimer | Matter-of-fact, brief |
| Abusive user | Calm, firm, non-combative |
