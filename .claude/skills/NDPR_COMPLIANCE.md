# Skill: NDPR Compliance

## Purpose
This skill governs how Kuditax handles all user data in compliance with the **Nigeria Data Protection Regulation (NDPR) 2019** and the **Nigeria Data Protection Act (NDPA) 2023**, enforced by the Nigeria Data Protection Commission (NDPC).

Read and apply these rules whenever you are writing any code, prompt, or logic that touches user data — collection, processing, storage, transmission, or deletion.

---

## What is NDPR/NDPA?

The NDPR (2019) and its successor the NDPA (2023) are Nigeria's primary data privacy laws. They govern how personal data of Nigerian citizens must be handled. Key obligations for Kuditax:

- Users must be **informed** about what data is collected and why
- Only **necessary data** may be collected (data minimisation)
- Data must not be kept longer than needed (storage limitation)
- Users have the right to **access, correct, and delete** their data
- A **Privacy Policy** must exist and be accessible
- Processing of **sensitive data** (financial information) requires clear legal basis

---

## Data Classification for Kuditax

| Data Type | Classification | Handling Rule |
|---|---|---|
| WhatsApp phone number | Personal Identifier | Mask in logs, never store persistently in v1 |
| Annual income figures | Sensitive Financial | In-session only, never log, never transmit to third parties |
| Allowance breakdowns | Sensitive Financial | In-session only |
| Employment type | General Personal | In-session only |
| Language preference | General Personal | In-session, reset on new conversation |
| Rent amount | Sensitive Financial | In-session only, do not log |

---

## Rules to Apply in All Code

### Rule 1 — Informed Consent Notice
Every new conversation session MUST display the following privacy notice before collecting any user data. This is a legal requirement under NDPA 2023 §2.

Display exactly once per session, immediately after language selection:

```
🔒 Privacy Notice
Kuditax does not store your personal or financial data.
Everything you share in this conversation is used only to
answer your questions and is deleted when this chat ends.

By continuing, you agree to this. To learn more, visit:
[privacy policy URL]
```

When writing the session initialisation code, add a `privacyNoticeSent` flag to the session object and only display the notice once:

```js
// Track whether the privacy notice has been shown this session
// Required by NDPA 2023 — users must be informed before data collection begins
if (!session.privacyNoticeSent) {
  await sendMessage(phone, getPrivacyNotice(session.language));
  session.privacyNoticeSent = true;
}
```

### Rule 2 — Data Minimisation
Only collect what is strictly necessary for the tax calculation. The following must NEVER be requested from users:

- Full legal name
- Home address
- Bank Verification Number (BVN)
- National Identification Number (NIN)
- Bank account details
- Date of birth
- Email address
- Employer name or address

If a user volunteers any of the above, do NOT store it. Log a warning and discard the value:

```js
// NDPR: Discard PII volunteered by user — we have no legal basis to collect it
logger.warn('User volunteered PII — discarding', { field: 'full_name', sessionId });
```

### Rule 3 — Financial Data Sensitivity
Income and allowance figures are sensitive financial data. Apply these rules:

```js
// ❌ Never log raw financial data
logger.info(`User income: ₦${income}`); // PROHIBITED

// ✅ Log only that data was received, not the value
logger.info('Income data received', { step: 'PAYE_Q1', sessionId: maskedId });
```

Never include income values in:
- Error messages returned to users
- Logs at any level
- API request bodies beyond the immediate Claude API call
- Any analytics or monitoring payload

### Rule 4 — Session Expiry = Data Deletion
In-memory sessions ARE the data store in v1. When a session expires, the data is gone. This is the intended behaviour and must be preserved.

Implement session cleanup:

```js
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes — NDPA storage limitation principle

// Purge expired sessions on a regular interval
setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of sessions.entries()) {
    if (now - session.lastActivityAt > SESSION_TIMEOUT_MS) {
      sessions.delete(phone);
      // Log with masked phone only
      logger.info('Session expired and purged', { phone: maskPhone(phone) });
    }
  }
}, 5 * 60 * 1000); // Run cleanup every 5 minutes
```

### Rule 5 — Right to Erasure
If a user says any of the following, immediately clear their session and confirm:

Trigger phrases: "delete my data", "forget me", "clear my data", "remove my information", "I want my data deleted"

Response:
```
✅ Done. I've cleared everything from this conversation.
Kuditax doesn't store data beyond your chat session,
so there's nothing else to delete.
```

Implementation:
```js
// NDPA 2023 §XX: Right to erasure — honour immediately on user request
sessions.delete(userPhone);
logger.info('Session cleared on user request', { phone: maskPhone(userPhone) });
```

### Rule 6 — No Third-Party Data Sharing
User financial data must NEVER be shared with:
- FIRS / Nigeria Revenue Service (unless user explicitly initiates filing themselves)
- Advertisers or analytics platforms
- Accountant partners (without explicit opt-in per session)
- Any external API other than Anthropic (for AI processing) and Meta (for WhatsApp delivery)

When calling the Anthropic Claude API, ensure the system prompt instructs Claude not to retain conversation data. Always set `metadata` appropriately and avoid sending more context than necessary.

### Rule 7 — Children
If there is any indication a user is under 18 (they say they are a student, mention secondary school, or state their age), immediately stop collecting financial data and respond:

```
Tax filing in Nigeria is for adults (18 and over).
If you're under 18, please ask a parent or guardian
to use this service on your behalf. 😊
```

---

## Privacy Policy Requirement

Before launch, Kuditax must publish a Privacy Policy that covers:
1. What data is collected (phone number for session only)
2. How it is processed (in-memory, not stored)
3. That it is not shared with third parties
4. User rights under NDPA 2023
5. Contact information for the Data Controller

The Privacy Policy URL must appear in the onboarding notice and WhatsApp Business profile.

---

## Compliance Checklist (Before Each Release)

Before shipping any new feature, verify:

- [ ] New feature does not collect new categories of personal data
- [ ] If it does, is there a clear legal basis and user consent mechanism?
- [ ] Financial data is not logged at any level
- [ ] Session cleanup still works correctly
- [ ] Privacy notice still appears for new sessions
- [ ] Right to erasure still functions
- [ ] No new third-party services introduced without privacy review
