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
} from '../services/sessionManager.js';
import { sendMessage } from '../services/whatsapp.js';
import { getAgentReply } from '../services/claudeAgent.js';
import { calculateSalaryTax } from '../services/taxCalculator.js';
import { buildTipsMessage } from '../services/taxTips.js';
import { t, resolveLanguageFromInput } from '../translations/index.js';
import { parseNairaInput, formatNaira } from '../utils/formatter.js';
import logger from '../utils/logger.js';
import { maskPhoneNumber } from '../utils/formatter.js';

// Friendly fallback for unhandled errors
const ERROR_FALLBACK = "Sorry, something went wrong on my end. Please try again in a moment. 🙏";

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
  // Global override: "menu" keyword always returns to main menu
  if (text.toLowerCase() === 'menu' && session.currentState !== STATES.AWAITING_LANGUAGE) {
    return handleMenuReset(from, session);
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
    // Send the welcome message again with the language menu
    await sendMessage(from, t('welcome', 'en'));
    return;
  }

  updateSession(from, { language: lang });

  // Send language confirmation + privacy notice
  await sendMessage(from, t('languageSelected', lang));
  await sendMessage(from, t('privacyNotice', lang));

  updateSession(from, { currentState: STATES.AWAITING_PRIVACY_ACK });
  await sendMessage(from, t('mainMenu', lang));
  updateSession(from, { currentState: STATES.AWAITING_MENU_CHOICE });
}

/** Privacy acknowledgement (currently auto-proceeds, shown as info) */
async function handlePrivacyAck(from, text, session) {
  const { language: lang } = session;
  await sendMessage(from, t('mainMenu', lang));
  updateSession(from, { currentState: STATES.AWAITING_MENU_CHOICE });
}

/** Main menu choice dispatcher */
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
      await sendMessage(from, t('unknownChoice', lang));
  }
}

/** Employment type selection — routes to correct calculation flow */
async function handleUserTypeSelection(from, text, session) {
  const { language: lang } = session;
  const choice = text.trim();

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
    default:
      await sendMessage(from, t('invalidInput', lang));
  }
}

// ---------------------------------------------------------------------------
// Flow A — Salaried
// ---------------------------------------------------------------------------

/**
 * Generic handler for numeric input steps in Flow A.
 * Parses the amount, saves to session.taxData, and advances to the next state.
 */
async function handleFlowAStep(from, text, session, fieldName) {
  const { language: lang } = session;
  const amount = parseNairaInput(text);

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
  const amount = parseNairaInput(text);

  if (amount === null && text.trim() !== '0') {
    await sendMessage(from, t('invalidAmount', lang));
    return;
  }

  const lifeAssurancePremium = amount ?? 0;
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

  updateSession(from, { taxData: { lastResult: result }, currentState: STATES.RESULT_DISPLAYED });

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
  await sendMessage(from, t('taxDisclaimer', lang));
}

// ---------------------------------------------------------------------------
// Flow B — Self-employed
// ---------------------------------------------------------------------------

async function handleFlowBStep(from, text, session, fieldName) {
  const { language: lang } = session;
  const amount = parseNairaInput(text);

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
  const amount = parseNairaInput(text);
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

  updateSession(from, { taxData: { lastResult: result }, currentState: STATES.RESULT_DISPLAYED });

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
  await sendMessage(from, t('taxDisclaimer', lang));
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
  await sendMessage(from, t('taxDisclaimer', lang));
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
  const { language: lang } = session;
  const lower = text.toLowerCase().trim();

  // User wants to recalculate with tips applied → restart flow
  if (['yes', 'yeah', 'yep', 'ee', 'eh', 'bẹ́ẹ̀ni'].includes(lower)) {
    updateSession(from, { currentState: STATES.AWAITING_USER_TYPE });
    await sendMessage(from, t('askUserType', lang));
    return;
  }

  // Otherwise treat as a free-form question
  updateSession(from, { currentState: STATES.AI_CONVERSATION });
  await handleAiConversation(from, text, getOrCreateSession(from));
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
