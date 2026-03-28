/**
 * @file en.js
 * @description English language strings for Kuditax.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

const en = {
  welcome:
    "Hello! I'm Kuditax 🇳🇬 — your Nigerian tax assistant.\n\nPlease reply with the number for your preferred language:\n1️⃣ English\n2️⃣ Pidgin\n3️⃣ Igbo\n4️⃣ Hausa\n5️⃣ Yoruba",

  privacyNotice:
    "🔒 *Privacy Notice:* Kuditax does not store your data. Everything you share in this chat is used only to answer your questions and is not saved after this conversation ends.",

  languageSelected: "Welcome! Let's sort out your taxes together. 😊",

  mainMenu:
    "What would you like to do today?\n\n1️⃣ Calculate my tax\n2️⃣ Learn how to file my tax return\n3️⃣ Get my Tax Identification Number (TIN)\n4️⃣ Understand my tax reliefs & deductions\n5️⃣ Tax-saving tips\n6️⃣ Ask a tax question",

  askUserType:
    "Are you:\n1️⃣ Employed (your employer pays your salary)\n2️⃣ Self-employed / Freelancer\n3️⃣ Business owner",

  // Flow A — Salaried
  askGrossIncome:   "What is your *annual gross salary*? (Total yearly salary before any deductions)",
  askMonthlyBasic:  "What is your *monthly basic salary*? (The fixed base part, not including allowances)",
  askHousing:       "Do you receive a *housing allowance*? If yes, how much per month? (Reply 0 if none)",
  askTransport:     "Do you receive a *transport allowance*? If yes, how much per month? (Reply 0 if none)",
  askRent:          "Do you *pay rent*? If yes, how much do you pay annually (per year)? (Reply 0 if none)",
  askPension:       "Does your *employer deduct pension* from your salary? (Usually 8% of basic + housing + transport)\n\nReply *yes* or *no*.",
  askNhf:           "Are you registered with the *National Housing Fund (NHF)*? (2.5% of basic salary deductible)\n\nReply *yes* or *no*.",
  askLifeAssurance: "Do you have a *life insurance policy*? If yes, what is your annual premium? (Reply 0 if none)",

  // Flow B — Self-employed
  askSelfEmployedIncome:   "What is your *total annual income* from all your work or contracts? (Your best estimate is fine)",
  askBusinessExpenses:     "What are your *annual business expenses*? (Tools, data, transport, rent, etc.) (Reply 0 if none)",
  askSelfEmployedRent:     "Do you pay *rent for a workspace or home office*? If yes, how much annually? (Reply 0 if none)",
  askSelfEmployedPension:  "Do you make any *pension contributions*? If yes, how much annually? (Reply 0 if none)",

  // Flow C — Business owner
  askRevenue:      "What is your business's *total annual revenue*?",
  askBizExpenses:  "What are your *total annual business expenses*? (Staff salaries, rent, utilities, supplies, etc.)",
  askVat:          "Is your business *registered for VAT*? Reply *yes* or *no*.",
  askEmployees:    "Do you have *employees*? If yes, how many?",

  businessOwnerNote:
    "As a business owner, you face both Company Income Tax (CIT) and potentially personal income tax on drawings.\n\nI'll estimate your *personal income* portion only. For full business tax filing, I strongly recommend working with a registered accountant.\n\nWould you like me to proceed with your personal income estimate? Reply *yes* to continue.",

  // Result
  taxSummaryHeader: "Here's your tax summary 📊",
  taxDisclaimer:    "⚠️ *Disclaimer:* This is an estimate for guidance only. For official filing, use the NRS TaxPro-Max portal or consult a certified accountant.",

  // Filing guide
  filingGuide:
    "*How to File Your Tax Return* 📋\n\n*Step 1 — Get Your TIN:*\n• Visit https://tinverification.jtb.gov.ng or your nearest FIRS/NRS office\n• Provide: Full name, BVN or NIN, Date of birth, Address\n• TIN is issued free — do not pay anyone\n\n*Step 2 — File on TaxPro-Max:*\n• Go to https://taxpromax.firs.gov.ng\n• Log in with your TIN (create account if first time)\n• Select: File Returns → Personal Income Tax Annual Return\n• Enter your income details, review your computed tax\n• Pay via the generated Remita reference\n• Download your tax clearance certificate\n\n📅 *Deadline:* 31 March each year.\n\nWant me to walk you through any step in detail? Just ask!",

  tinGuide:
    "*How to Get Your TIN* 🪪\n\n1️⃣ Visit https://tinverification.jtb.gov.ng\n   OR go to your nearest FIRS or NRS office\n\n2️⃣ Provide:\n   • Full name\n   • BVN or NIN\n   • Date of birth\n   • Address\n\n3️⃣ TIN is issued immediately online or within a few days at the office\n\n✅ *It is completely free.* Do not pay anyone to get your TIN.\n\nIs there anything else I can help you with?",

  reliefsGuide:
    "*Your Tax Reliefs & Deductions (NTA 2025)* 💡\n\nUnder the Nigeria Tax Act 2025, you can legally reduce your taxable income with these:\n\n• *Pension:* 8% of (basic + housing + transport) × 12 months\n• *NHF:* 2.5% of your annual basic salary (if registered)\n• *Rent Relief:* 20% of annual rent paid — max ₦500,000\n• *Life Assurance:* Full annual premium amount\n\nAll of these reduce your *chargeable income*, which directly lowers your tax bill.\n\nWould you like me to calculate your tax with all reliefs applied? Reply *yes* to start.",

  // Errors & fallback
  errorFallback:    "Sorry, something went wrong on my end. Please try again in a moment. 🙏",
  invalidInput:     "I didn't quite catch that. Please reply with a valid number or answer. 😊",
  invalidAmount:    "Please enter a valid amount in Naira. For example: *3500000* or *3.5m* or *₦3,500,000*.",

  // Escalation
  escalation:       "This situation is a bit complex and I want to make sure you get it right. I'd recommend speaking to a registered accountant. Would you like me to connect you to one? *(Coming soon 🔜)*",

  // Filing Pack offer (sent immediately after the tax result + disclaimer)
  filingPackOffer:
    "Would you like your *Filing Pack*? 📋\nI'll send you a PDF summary of your tax figures plus a step-by-step guide to file on TaxPro-Max.\n\nReply *yes* to get it or *menu* to go back.",

  // Step-by-step TaxPro-Max guide (sent as a follow-up after the PDF)
  taxProMaxGuide:
    "*How to file on TaxPro-Max* 📋\n\n1️⃣ Go to taxpromax.firs.gov.ng\n2️⃣ Log in with your TIN and password\n   (First time? Click Register and use your TIN)\n3️⃣ Click *File Returns*\n4️⃣ Select *Personal Income Tax Annual Return*\n5️⃣ Enter the figures from your PDF\n6️⃣ Review the computed tax\n7️⃣ Pay via the Remita reference generated\n8️⃣ Download your receipt ✅\n\n📅 Deadline: 31 March each year\n\nNeed your TIN? Reply *tin* and I'll guide you.",

  // Navigation
  backToMenu:       "What else can I help you with? Reply *menu* to see all options.",
  unknownChoice:    "I didn't understand that choice. Please reply with a number from the menu, or type *menu* to see the options again.",
};

export default en;
