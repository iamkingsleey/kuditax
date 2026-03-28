/**
 * @file messageRouter.js
 * @description Routes incoming WhatsApp messages to the correct handler
 *              based on the user's current conversation state.
 *              This is the central dispatcher — no business logic lives here.
 *              Each state maps to a handler function that processes the input
 *              and returns an updated session + reply message(s).
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

import {
  STATES,
  getOrCreateSession,
  updateSession,
  deleteSession,
  loadProfileIntoSession,
  persistSessionProfile,
} from '../services/sessionManager.js';
import { deleteProfile } from '../services/profileStore.js';
import { sendMessage, sendDocument } from '../services/whatsapp.js';
import { getAgentReply } from '../services/claudeAgent.js';
import { calculateSalaryTax } from '../services/taxCalculator.js';
import { buildTipsMessage } from '../services/taxTips.js';
import { t, resolveLanguageFromInput } from '../translations/index.js';
import { generateTaxSummaryPdf } from '../services/pdfGenerator.js';
import { parseNairaInput, formatNaira, maskPhoneNumber, isNegativeAnswer } from '../utils/formatter.js';
import logger from '../utils/logger.js';

// Friendly fallback for unhandled errors
const ERROR_FALLBACK = "Sorry, something went wrong on my end. Please try again in a moment. 🙏";

// ---------------------------------------------------------------------------
// Filing Pack Intent Detectors
// ---------------------------------------------------------------------------

/**
 * Returns true if the user's message indicates they want their filing pack / PDF.
 * Uses substring matching so partial phrases like "send me the pdf" still match.
 *
 * @param {string} text - Raw user input (any case)
 * @returns {boolean}
 */
function isFilingPackRequest(text) {
  const lower = text.toLowerCase().trim();
  const KEYWORDS = [
    'yes', 'yeah', 'yep', 'ok', 'okay', 'send', 'pdf', 'share',
    'download', 'filing', 'pack', 'summary', 'report', 'sure',
    'go ahead', 'ee', 'eh', 'bẹ́ẹ̀ni', 'oya', 'abeg send',
  ];
  return KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Returns true if the user's message indicates they do NOT want their filing pack.
 * Uses substring matching for natural phrasing like "no thanks", "cancel it".
 *
 * @param {string} text - Raw user input (any case)
 * @returns {boolean}
 */
function isFilingPackRejection(text) {
  const lower = text.toLowerCase().trim();
  const KEYWORDS = ['no', 'nope', 'cancel', 'menu', 'skip', 'later', 'mba', 'babu', 'bẹ́ẹ̀kọ'];
  return KEYWORDS.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Processes an incoming WhatsApp text message and sends the appropriate reply.
 * Retrieves or creates a session, routes to the correct state handler, and
 * delivers the response via the WhatsApp service.
 *
 * @param {string} from - Sender's phone number (E.164 without +, as sent by Meta)
 * @param {string} text - Sanitised user message text
 * @returns {Promise<void>}
 */
async function routeMessage(from, text) {
  const session = getOrCreateSession(from);

  logger.info('Routing message', {
    from: maskPhoneNumber(from),
    state: session.currentState,
    inputLength: text.length,
  });

  try {
    await dispatchToHandler(from, text, session);
  } catch (error) {
    logger.error('Error in message router', {
      from: maskPhoneNumber(from),
      state: session.currentState,
      error: error.message,
    });
    await sendMessage(from, ERROR_FALLBACK);
  }
}

// ---------------------------------------------------------------------------
// State Dispatcher
// ---------------------------------------------------------------------------

/**
 * Routes the message to the correct handler based on the session's current state.
 *
 * @param {string} from - Sender phone number
 * @param {string} text - Sanitised user message
 * @param {object} session - Current session object
 * @returns {Promise<void>}
 */
async function dispatchToHandler(from, text, session) {
  // Lowercase once — reused by all global overrides below
  const lower = text.toLowerCase();

  // Global override: "menu" keyword always returns to main menu
  if (lower === 'menu' && session.currentState !== STATES.AWAITING_LANGUAGE) {
    return handleMenuReset(from, session);
  }

  // Global override: NDPA 2023 right to erasure — honour immediately on any request
  const ERASURE_PHRASES = ['delete my data', 'forget me', 'remove my data', 'clear my data'];
  if (
    ERASURE_PHRASES.some((phrase) => lower.includes(phrase)) &&
    session.currentState !== STATES.AWAITING_LANGUAGE
  ) {
    return handleErasureRequest(from);
  }

  // Global PDF/filing pack intercept — fires at any state where the user has a
  // completed calculation. Allows "send pdf", "filing pack", "share summary" etc.
  // at any point in the conversation without needing to re-run the flow.
  const PDF_STATES_EXCLUDED = [STATES.AWAITING_LANGUAGE, STATES.AWAITING_PRIVACY_ACK];
  const isPdfKeyword = lower.includes('pdf') || lower.includes('filing pack') || lower.includes('share summary');
  if (
    isPdfKeyword &&
    !PDF_STATES_EXCLUDED.includes(session.currentState) &&
    session.taxData?.lastResult
  ) {
    return deliverFilingPack(from, session.language, session.taxData.lastResult);
  }

  switch (session.currentState) {
    case STATES.AWAITING_LANGUAGE:     return handleLanguageSelection(from, text, session);
    case STATES.AWAITING_PRIVACY_ACK:  return handlePrivacyAck(from, text, session);
    case STATES.AWAITING_MENU_CHOICE:  return handleMenuChoice(from, text, session);
    case STATES.AWAITING_USER_TYPE:    return handleUserTypeSelection(from, text, session);

    // Flow A — Salaried
    case STATES.FLOW_A_GROSS_INCOME:   return handleFlowAStep(from, text, session, 'grossIncome');
    case STATES.FLOW_A_MONTHLY_BASIC:  return handleFlowAStep(from, text, session, 'monthlyBasic');
    case STATES.FLOW_A_HOUSING:        return handleFlowAStep(from, text, session, 'monthlyHousing');
    case STATES.FLOW_A_TRANSPORT:      return handleFlowAStep(from, text, session, 'monthlyTransport');
    case STATES.FLOW_A_RENT:           return handleFlowAStep(from, text, session, 'annualRent');
    case STATES.FLOW_A_PENSION:        return handleFlowAPension(from, text, session);
    case STATES.FLOW_A_NHF:            return handleFlowANhf(from, text, session);
    case STATES.FLOW_A_LIFE_ASSURANCE: return handleFlowAFinalStep(from, text, session);

    // Flow B — Self-employed
    case STATES.FLOW_B_TOTAL_INCOME:   return handleFlowBStep(from, text, session, 'annualGrossIncome');
    case STATES.FLOW_B_EXPENSES:       return handleFlowBStep(from, text, session, 'businessExpenses');
    case STATES.FLOW_B_RENT:           return handleFlowBStep(from, text, session, 'annualRent');
    case STATES.FLOW_B_PENSION:        return handleFlowBFinalStep(from, text, session);

    // Flow C — Business owner (advisory + personal income estimation)
    case STATES.FLOW_C_REVENUE:        return handleFlowCStep(from, text, session, 'revenue');
    case STATES.FLOW_C_EXPENSES:       return handleFlowCStep(from, text, session, 'bizExpenses');
    case STATES.FLOW_C_VAT:            return handleFlowCVat(from, text, session);
    case STATES.FLOW_C_EMPLOYEES:      return handleFlowCFinalStep(from, text, session);

    // AI free-form Q&A
    case STATES.AI_CONVERSATION:       return handleAiConversation(from, text, session);

    // After result is shown — handle follow-up actions
    case STATES.RESULT_DISPLAYED:      return handlePostResult(from, text, session);

    // Filing pack offer sent — awaiting user choice
    case STATES.AWAITING_FILING_PACK:  return handleFilingPackChoice(from, text, session);

    // Returning user — awaiting confirmation to use saved profile or update
    case STATES.AWAITING_PROFILE_CONFIRM: return handleProfileConfirm(from, text, session);

    default:
      logger.warn('Unknown session state — resetting', {
        from: maskPhoneNumber(from),
        state: session.currentState,
      });
      return handleMenuReset(from, session);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** Language selection — first message ever */
async function handleLanguageSelection(from, text, session) {
  const lang = resolveLanguageFromInput(text);

  if (!lang) {
    await sendMessage(from, t('welcome', 'en'));
    return;
  }

  updateSession(from, { language: lang });

  // Always show privacy notice — required by NDPA 2023 at the start of every session
  await sendMessage(from, t('languageSelected', lang));
  await sendMessage(from, t('privacyNotice', lang));

  // Check Firestore for a returning user's saved profile
  const profileFound = await loadProfileIntoSession(from, getOrCreateSession(from));

  if (profileFound) {
    return sendReturningUserPrompt(from, lang, getOrCreateSession(from));
  }

  // New user — show main menu
  await sendMessage(from, t('mainMenu', lang));
  updateSession(from, { currentState: STATES.AWAITING_MENU_CHOICE });
}

/** Privacy acknowledgement (currently auto-proceeds, shown as info) */
async function handlePrivacyAck(from, text, session) {
  const { language: lang } = session;
  await sendMessage(from, t('mainMenu', lang));
  updateSession(from, { currentState: STATES.AWAITING_MENU_CHOICE });
}

/**
 * Main menu choice dispatcher.
 * Accepts numbered options 1–6 for structured navigation.
 * Any other input is treated as a free-form tax question and routed directly
 * to the AI agent — this prevents the bot feeling rigid when users type
 * naturally instead of picking a number.
 */
async function handleMenuChoice(from, text, session) {
  const { language: lang } = session;
  const choice = text.trim();

  switch (choice) {
    case '1':
      updateSession(from, { currentState: STATES.AWAITING_USER_TYPE });
      await sendMessage(from, t('askUserType', lang));
      break;
    case '2':
      await sendMessage(from, t('filingGuide', lang));
      await sendMessage(from, t('backToMenu', lang));
      break;
    case '3':
      await sendMessage(from, t('tinGuide', lang));
      await sendMessage(from, t('backToMenu', lang));
      break;
    case '4':
      await sendMessage(from, t('reliefsGuide', lang));
      await sendMessage(from, t('backToMenu', lang));
      break;
    case '5':
      // Tax-saving tips without a calculation — send to AI
      updateSession(from, { currentState: STATES.AI_CONVERSATION });
      await handleAiConversation(from, 'Give me general tax-saving tips under NTA 2025.', session);
      break;
    case '6':
      updateSession(from, { currentState: STATES.AI_CONVERSATION });
      await sendMessage(from, lang === 'en'
        ? "Sure! What's your tax question? I'm here to help. 😊"
        : t('languageSelected', lang));
      break;
    default:
      // Free-form question or statement typed at the menu — answer it via AI.
      // Users shouldn't need to pick a number to get help; any tax question works.
      updateSession(from, { currentState: STATES.AI_CONVERSATION });
      await handleAiConversation(from, text, getOrCreateSession(from));
      await sendMessage(from, "Type *menu* to go back to the main menu anytime. 😊");
  }
}

/**
 * Starts the correct tax calculation flow for a given user type.
 * Extracted so both the numeric and the natural-language inference paths
 * share identical setup logic — single source of truth.
 *
 * @param {string} from - Sender phone number
 * @param {'1'|'2'|'3'} choice - The user type choice
 * @param {object} session - Current session
 */
async function startUserTypeFlow(from, choice, session) {
  const { language: lang } = session;

  switch (choice) {
    case '1': // Salaried
      updateSession(from, { userType: 'salaried', taxData: { userType: 'salaried' }, currentState: STATES.FLOW_A_GROSS_INCOME });
      await sendMessage(from, t('askGrossIncome', lang));
      break;
    case '2': // Self-employed
      updateSession(from, { userType: 'self_employed', taxData: { userType: 'self_employed' }, currentState: STATES.FLOW_B_TOTAL_INCOME });
      await sendMessage(from, t('askSelfEmployedIncome', lang));
      break;
    case '3': // Business owner
      updateSession(from, { userType: 'business_owner', taxData: { userType: 'business_owner' }, currentState: STATES.FLOW_C_REVENUE });
      await sendMessage(from, t('businessOwnerNote', lang));
      break;
  }
}

/**
 * Infers a user's employment type from natural-language text.
 * Used when the user describes their work situation instead of picking a number.
 * Returns the inferred menu option string ('1', '2', or '3'), or null if unclear.
 *
 * @param {string} text - Raw user input (any case)
 * @returns {'1'|'2'|'3'|null}
 */
function inferUserTypeFromText(text) {
  const lower = text.toLowerCase();

  // Option 1 — salaried / PAYE employee
  const SALARIED_KEYWORDS = [
    'salary', 'salaried', 'employed', 'work for company', 'work for a company',
    '9-5', 'nine to five', 'paye', 'my employer', 'i work for',
  ];
  if (SALARIED_KEYWORDS.some((kw) => lower.includes(kw))) return '1';

  // Option 2 — self-employed / freelancer / contractor
  const SELF_EMPLOYED_KEYWORDS = [
    'freelance', 'freelancer', 'self employed', 'self-employed',
    'contract', 'myself', 'my own', 'i work for myself', 'i do contract',
  ];
  if (SELF_EMPLOYED_KEYWORDS.some((kw) => lower.includes(kw))) return '2';

  // Option 3 — business owner / director / entrepreneur
  const BUSINESS_OWNER_KEYWORDS = [
    'business', 'owner', 'company', 'ceo', 'entrepreneur',
    'oga', 'i own', 'my business', 'director',
  ];
  if (BUSINESS_OWNER_KEYWORDS.some((kw) => lower.includes(kw))) return '3';

  return null;
}

/**
 * Employment type selection — routes to the correct calculation flow.
 * Accepts numeric choices 1–3 and natural-language descriptions.
 * Keyword inference handles "I am a salary earner" or "I work for myself".
 * Falls back to the AI agent if the input is ambiguous.
 */
async function handleUserTypeSelection(from, text, session) {
  const { language: lang } = session;
  const choice = text.trim();

  // Numeric choice — direct dispatch
  if (['1', '2', '3'].includes(choice)) {
    return startUserTypeFlow(from, choice, session);
  }

  // Natural language — try to infer the employment type from keywords
  const inferred = inferUserTypeFromText(text);
  if (inferred) {
    return startUserTypeFlow(from, inferred, session);
  }

  // Ambiguous input — route to AI to clarify and guide the user
  updateSession(from, { currentState: STATES.AI_CONVERSATION });
  await handleAiConversation(from, text, getOrCreateSession(from));
  await sendMessage(from, "Type *menu* to go back to the main menu anytime. 😊");
}

// ---------------------------------------------------------------------------
// Flow A — Salaried
// ---------------------------------------------------------------------------

/**
 * Generic handler for numeric input steps in Flow A.
 * Accepts a Naira amount OR a negative/zero answer (e.g. "no", "none", "nah").
 * Negative answers are treated as zero — valid for optional allowance fields.
 */
async function handleFlowAStep(from, text, session, fieldName) {
  const { language: lang } = session;

  // Treat "no / none / nah / 0 / mba / babu / …" as zero for optional fields
  const amount = isNegativeAnswer(text) ? 0 : parseNairaInput(text);

  if (amount === null) {
    await sendMessage(from, t('invalidAmount', lang));
    return;
  }

  const FLOW_A_PROGRESSION = {
    grossIncome:      { save: 'annualGrossIncome',  next: STATES.FLOW_A_MONTHLY_BASIC,  nextKey: 'askMonthlyBasic' },
    monthlyBasic:     { save: 'monthlyBasic',       next: STATES.FLOW_A_HOUSING,        nextKey: 'askHousing' },
    monthlyHousing:   { save: 'monthlyHousing',     next: STATES.FLOW_A_TRANSPORT,      nextKey: 'askTransport' },
    monthlyTransport: { save: 'monthlyTransport',   next: STATES.FLOW_A_RENT,           nextKey: 'askRent' },
    annualRent:       { save: 'annualRent',         next: STATES.FLOW_A_PENSION,        nextKey: 'askPension' },
  };

  const step = FLOW_A_PROGRESSION[fieldName];
  updateSession(from, { taxData: { [step.save]: amount }, currentState: step.next });
  await sendMessage(from, t(step.nextKey, lang));
}

/** Flow A: Pension yes/no question */
async function handleFlowAPension(from, text, session) {
  const { language: lang } = session;
  const lower = text.toLowerCase().trim();

  if (!['yes', 'no', 'yep', 'yeah', 'nope', 'na', 'ee', 'mba', 'a\'a', 'eh', 'bẹ́ẹ̀ni', 'bẹ́ẹ̀kọ'].includes(lower)) {
    await sendMessage(from, t('invalidInput', lang));
    return;
  }

  const hasPension = ['yes', 'yep', 'yeah', 'ee', 'eh', 'bẹ́ẹ̀ni'].includes(lower);

  // If no pension, set customPension = 0 to override the default calculation
  updateSession(from, {
    taxData: { customPension: hasPension ? null : 0 },
    currentState: STATES.FLOW_A_NHF,
  });
  await sendMessage(from, t('askNhf', lang));
}

/** Flow A: NHF yes/no question */
async function handleFlowANhf(from, text, session) {
  const { language: lang } = session;
  const lower = text.toLowerCase().trim();

  const hasNhf = ['yes', 'yep', 'yeah', 'ee', 'eh', 'bẹ́ẹ̀ni'].includes(lower);

  updateSession(from, {
    taxData: { hasNhf },
    currentState: STATES.FLOW_A_LIFE_ASSURANCE,
  });
  await sendMessage(from, t('askLifeAssurance', lang));
}

/** Flow A: Final step — life assurance → calculate and show result */
async function handleFlowAFinalStep(from, text, session) {
  const { language: lang, taxData } = session;
  const amount = isNegativeAnswer(text) ? 0 : parseNairaInput(text);

  if (amount === null) {
    await sendMessage(from, t('invalidAmount', lang));
    return;
  }

  const lifeAssurancePremium = amount;
  updateSession(from, { taxData: { lifeAssurancePremium } });

  // Re-read updated session
  const updatedSession = getOrCreateSession(from);
  const { taxData: td } = updatedSession;

  const result = calculateSalaryTax(td.annualGrossIncome, {
    monthlyBasic:       td.monthlyBasic ?? 0,
    monthlyHousing:     td.monthlyHousing ?? 0,
    monthlyTransport:   td.monthlyTransport ?? 0,
    annualRent:         td.annualRent ?? 0,
    lifeAssurancePremium: td.lifeAssurancePremium ?? 0,
    hasNhf:             td.hasNhf ?? false,
    customPension:      td.customPension,
  });

  updateSession(from, { taxData: { lastResult: result } });

  await sendMessage(from, formatTaxResult(result, lang));

  const tips = buildTipsMessage({
    grossIncome:            result.grossIncome,
    pensionDeduction:       result.pensionDeduction,
    nhfDeduction:           result.nhfDeduction,
    rentRelief:             result.rentRelief,
    lifeAssuranceDeduction: result.lifeAssuranceDeduction,
    chargeableIncome:       result.chargeableIncome,
    annualRent:             td.annualRent ?? 0,
    isSelfEmployed:         false,
  });

  if (tips) await sendMessage(from, tips);

  // Disclaimer + filing pack offer combined — respects the 3-message cap
  await sendFilingPackOffer(from, lang);
}

// ---------------------------------------------------------------------------
// Flow B — Self-employed
// ---------------------------------------------------------------------------

async function handleFlowBStep(from, text, session, fieldName) {
  const { language: lang } = session;
  const amount = isNegativeAnswer(text) ? 0 : parseNairaInput(text);

  if (amount === null) {
    await sendMessage(from, t('invalidAmount', lang));
    return;
  }

  const FLOW_B_PROGRESSION = {
    annualGrossIncome: { next: STATES.FLOW_B_EXPENSES, nextKey: 'askBusinessExpenses' },
    businessExpenses:  { next: STATES.FLOW_B_RENT,     nextKey: 'askSelfEmployedRent' },
    annualRent:        { next: STATES.FLOW_B_PENSION,  nextKey: 'askSelfEmployedPension' },
  };

  const step = FLOW_B_PROGRESSION[fieldName];
  updateSession(from, { taxData: { [fieldName]: amount }, currentState: step.next });
  await sendMessage(from, t(step.nextKey, lang));
}

/** Flow B: Final step — pension → calculate and show result */
async function handleFlowBFinalStep(from, text, session) {
  const { language: lang, taxData } = session;
  const amount = isNegativeAnswer(text) ? 0 : parseNairaInput(text);
  const pension = amount ?? 0;

  updateSession(from, { taxData: { customPension: pension } });
  const updated = getOrCreateSession(from);
  const { taxData: td } = updated;

  // Self-employed: chargeable income = revenue - expenses - rent relief - pension
  const netIncome = Math.max(0, (td.annualGrossIncome ?? 0) - (td.businessExpenses ?? 0));

  const result = calculateSalaryTax(netIncome, {
    monthlyBasic: 0,
    monthlyHousing: 0,
    monthlyTransport: 0,
    annualRent:  td.annualRent ?? 0,
    lifeAssurancePremium: 0,
    hasNhf: false,
    customPension: pension,
  });

  updateSession(from, { taxData: { lastResult: result } });

  await sendMessage(from, formatTaxResult(result, lang));

  const tips = buildTipsMessage({
    grossIncome:      result.grossIncome,
    pensionDeduction: result.pensionDeduction,
    nhfDeduction:     result.nhfDeduction,
    rentRelief:       result.rentRelief,
    chargeableIncome: result.chargeableIncome,
    annualRent:       td.annualRent ?? 0,
    isSelfEmployed:   true,
  });

  if (tips) await sendMessage(from, tips);
  await sendFilingPackOffer(from, lang);
}

// ---------------------------------------------------------------------------
// Flow C — Business owner (advisory)
// ---------------------------------------------------------------------------

async function handleFlowCStep(from, text, session, fieldName) {
  const { language: lang } = session;
  const amount = parseNairaInput(text);

  if (amount === null) {
    await sendMessage(from, t('invalidAmount', lang));
    return;
  }

  const FLOW_C_PROGRESSION = {
    revenue:     { next: STATES.FLOW_C_EXPENSES, nextKey: 'askBizExpenses' },
    bizExpenses: { next: STATES.FLOW_C_VAT,      nextKey: 'askVat' },
  };

  const step = FLOW_C_PROGRESSION[fieldName];
  updateSession(from, { taxData: { [fieldName]: amount }, currentState: step.next });
  await sendMessage(from, t(step.nextKey, lang));
}

async function handleFlowCVat(from, text, session) {
  const { language: lang } = session;
  updateSession(from, {
    taxData: { vatRegistered: text.toLowerCase().includes('yes') || text.toLowerCase().includes('eh') },
    currentState: STATES.FLOW_C_EMPLOYEES,
  });
  await sendMessage(from, t('askEmployees', lang));
}

async function handleFlowCFinalStep(from, text, session) {
  const { language: lang, taxData: td } = session;

  updateSession(from, {
    taxData: { employeeCount: parseInt(text, 10) || 0 },
    currentState: STATES.RESULT_DISPLAYED,
  });

  // Estimate personal drawings as revenue - expenses (simplified)
  const estimatedDrawings = Math.max(0, (td.revenue ?? 0) - (td.bizExpenses ?? 0));
  const result = calculateSalaryTax(estimatedDrawings, {
    monthlyBasic: 0, monthlyHousing: 0, monthlyTransport: 0,
    annualRent: 0, lifeAssurancePremium: 0, hasNhf: false, customPension: 0,
  });

  updateSession(from, { taxData: { lastResult: result } });

  await sendMessage(from, formatTaxResult(result, lang));
  await sendMessage(from, t('escalation', lang));
  await sendFilingPackOffer(from, lang);
}

// ---------------------------------------------------------------------------
// AI Conversation
// ---------------------------------------------------------------------------

async function handleAiConversation(from, text, session) {
  const { language: lang, conversationHistory } = session;

  const reply = await getAgentReply(conversationHistory, text);

  // Update conversation history with this turn
  const updatedHistory = [
    ...conversationHistory,
    { role: 'user', content: text },
    { role: 'assistant', content: reply },
  ];

  updateSession(from, { conversationHistory: updatedHistory });
  await sendMessage(from, reply);
}

// ---------------------------------------------------------------------------
// Post-Result
// ---------------------------------------------------------------------------

async function handlePostResult(from, text, session) {
  const { language: lang, taxData } = session;

  // Check if the user is asking for their filing pack before falling through to AI.
  // This catches users who reply with "pdf", "send it", "yes" etc. after viewing results.
  if (isFilingPackRequest(text)) {
    if (taxData?.lastResult) {
      return deliverFilingPack(from, lang, taxData.lastResult);
    }

    // No calculation on record — tell the user and show the menu
    await sendMessage(from, "I don't have a recent tax calculation for you. Let's calculate your tax first.");
    return handleMenuReset(from, session);
  }

  // Anything else — route to AI free-form conversation
  updateSession(from, { currentState: STATES.AI_CONVERSATION });
  await handleAiConversation(from, text, getOrCreateSession(from));
}

// ---------------------------------------------------------------------------
// Filing Pack
// ---------------------------------------------------------------------------

/**
 * Sends the filing pack offer message and advances state to AWAITING_FILING_PACK.
 * Combined with the disclaimer to stay within the 3-message-per-response cap.
 *
 * @param {string} from - Sender phone number
 * @param {string} lang - Language code
 */
async function sendFilingPackOffer(from, lang) {
  // Combine disclaimer + filing pack offer into one message to respect the 3-msg cap
  const combined = `${t('taxDisclaimer', lang)}\n\n${t('filingPackOffer', lang)}`;
  await sendMessage(from, combined);
  updateSession(from, { currentState: STATES.AWAITING_FILING_PACK });
}

/**
 * Handles the user's response to the filing pack offer.
 * - "yes / yeah / yep / send it / ok / ee / eh" → generate PDF, send it, send guide
 * - "no / menu / cancel / nope / mba / babu" → return to main menu
 * - anything else → AI conversation
 *
 * @param {string} from - Sender phone number
 * @param {string} text - User's reply
 * @param {object} session - Current session
 */
async function handleFilingPackChoice(from, text, session) {
  const { language: lang, taxData } = session;
  const lower = text.toLowerCase().trim();

  if (isFilingPackRequest(lower)) {
    await deliverFilingPack(from, lang, taxData.lastResult);
    return;
  }

  if (isFilingPackRejection(lower)) {
    return handleMenuReset(from, session);
  }

  // Unrecognised input — route to AI for help
  updateSession(from, { currentState: STATES.AI_CONVERSATION });
  await handleAiConversation(from, text, getOrCreateSession(from));
}

/**
 * Generates the PDF, sends it as a WhatsApp document, then sends the
 * TaxPro-Max step-by-step guide. Falls back to a formatted text message
 * if PDF generation fails so the user is never left without their figures.
 *
 * @param {string} from - Sender phone number
 * @param {string} lang - Language code
 * @param {import('../services/taxCalculator.js').FullTaxCalculation} taxResult
 */
async function deliverFilingPack(from, lang, taxResult) {
  const TAX_YEAR     = 2025;
  const PDF_FILENAME = `kuditax-tax-summary-${TAX_YEAR}.pdf`;
  const PDF_CAPTION  = 'Your Kuditax Tax Summary 📊 Use these figures to file your return at taxpromax.firs.gov.ng';

  try {
    const filePath = await generateTaxSummaryPdf(taxResult, lang);
    await sendDocument(from, filePath, PDF_FILENAME, PDF_CAPTION);
  } catch (pdfError) {
    // PDF failed — send a text fallback so the user still gets their figures
    logger.error('PDF generation/send failed — sending text fallback', { error: pdfError.message });
    await sendMessage(from, formatTaxResult(taxResult, lang));
  }

  // Always send the filing guide after the PDF (or fallback)
  await sendMessage(from, t('taxProMaxGuide', lang));
  updateSession(from, { currentState: STATES.AWAITING_MENU_CHOICE });
  await sendMessage(from, t('backToMenu', lang));

  // Fire-and-forget: persist the user's preference profile to Firestore.
  // Never awaited — must not delay the WhatsApp response under any circumstance.
  persistSessionProfile(from, getOrCreateSession(from)).catch(() => {});
}

// ---------------------------------------------------------------------------
// Returning User Flow
// ---------------------------------------------------------------------------

/**
 * Human-readable label for each userType, used in the returning-user prompt.
 * Centralised here so it's easy to update.
 */
const USER_TYPE_LABELS = {
  salaried:       'a salaried employee',
  self_employed:  'a freelancer / self-employed',
  business_owner: 'a business owner',
};

/**
 * Sends the welcome-back prompt to a returning user.
 * Called from handleLanguageSelection when a saved profile is found.
 *
 * @param {string} from - Sender phone number
 * @param {string} lang - Language code
 * @param {object} session - Session pre-populated by loadProfileIntoSession
 */
async function sendReturningUserPrompt(from, lang, session) {
  const typeLabel = USER_TYPE_LABELS[session.userType] ?? 'a returning user';
  const message = [
    `Welcome back! 👋 I have your profile saved from last time.`,
    ``,
    `You were *${typeLabel}*.`,
    ``,
    `Has anything changed?`,
    `Reply *yes* to start fresh or *no* to continue.`,
  ].join('\n');

  await sendMessage(from, message);
  updateSession(from, { currentState: STATES.AWAITING_PROFILE_CONFIRM });
}

/**
 * Handles the returning user's yes/no reply to the profile-confirm prompt.
 * - "yes" → clear saved userType, go to user type selection (start fresh)
 * - "no"  → keep pre-filled userType, go to main menu (continue)
 *
 * @param {string} from - Sender phone number
 * @param {string} text - User's reply
 * @param {object} session - Current session
 */
async function handleProfileConfirm(from, text, session) {
  const { language: lang } = session;
  const lower = text.toLowerCase().trim();

  // "yes" — user wants to start fresh, reset their saved profile choices
  const wantsUpdate = ['yes', 'yeah', 'yep', 'ok', 'okay', 'sure', 'ee', 'eh', 'bẹ́ẹ̀ni', 'oya'].some(
    (kw) => lower.includes(kw),
  );

  if (wantsUpdate) {
    updateSession(from, {
      userType: null,
      taxData:  { userType: null },
      currentState: STATES.AWAITING_USER_TYPE,
    });
    await sendMessage(from, t('askUserType', lang));
    return;
  }

  // "no" — continue with the pre-filled profile; go to main menu
  // userType is already set on the session by loadProfileIntoSession
  return handleMenuReset(from, session);
}

// ---------------------------------------------------------------------------
// Right to Erasure
// ---------------------------------------------------------------------------

/**
 * Handles a user's NDPA 2023 right-to-erasure request.
 * Deletes their Firestore profile (fire-and-forget) and their in-memory session,
 * then sends a confirmation message.
 *
 * @param {string} from - Sender phone number
 * @returns {Promise<void>}
 */
async function handleErasureRequest(from) {
  // NDPA 2023 — right to erasure: delete both persistent and in-memory data
  deleteProfile(from).catch(() => {}); // fire-and-forget, never let it crash

  deleteSession(from);

  logger.info('User data erased on request', { from: maskPhoneNumber(from) });

  await sendMessage(
    from,
    '✅ Done. Your saved profile has been permanently deleted from Kuditax. We no longer hold any information about you.',
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Resets user to the main menu */
async function handleMenuReset(from, session) {
  const { language: lang } = session;
  updateSession(from, { currentState: STATES.AWAITING_MENU_CHOICE });
  await sendMessage(from, t('mainMenu', lang));
}

/**
 * Formats a full tax calculation result into a WhatsApp-ready message.
 *
 * @param {import('../services/taxCalculator.js').FullTaxCalculation} result
 * @param {string} lang - Language code
 * @returns {string} Formatted tax summary string
 */
function formatTaxResult(result, lang) {
  const lines = [
    t('taxSummaryHeader', lang),
    '',
    `💰 Annual Gross Income: ${formatNaira(result.grossIncome)}`,
    `➖ Total Deductions: ${formatNaira(result.totalDeductions)}`,
  ];

  if (result.pensionDeduction > 0) {
    lines.push(`   • Pension: ${formatNaira(result.pensionDeduction)}`);
  }
  if (result.nhfDeduction > 0) {
    lines.push(`   • NHF: ${formatNaira(result.nhfDeduction)}`);
  }
  if (result.rentRelief > 0) {
    lines.push(`   • Rent Relief: ${formatNaira(result.rentRelief)}`);
  }
  if (result.lifeAssuranceDeduction > 0) {
    lines.push(`   • Life Assurance: ${formatNaira(result.lifeAssuranceDeduction)}`);
  }

  lines.push(`📌 Chargeable Income: ${formatNaira(result.chargeableIncome)}`);
  lines.push(`🧾 Estimated Annual Tax: ${formatNaira(result.tax.totalTax)}`);
  lines.push(`📅 Estimated Monthly PAYE: ${formatNaira(result.tax.monthlyTax)}`);

  return lines.join('\n');
}

export { routeMessage };
