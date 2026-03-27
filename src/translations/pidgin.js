/**
 * @file pidgin.js
 * @description Nigerian Pidgin language strings for Kuditax.
 * @author Kuditax Engineering
 * @updated 2026-03-28
 */

const pidgin = {
  welcome:
    "Hello! Na me be Kuditax 🇳🇬 — your Nigerian tax helper.\n\nAbeg choose the language wey you want:\n1️⃣ English\n2️⃣ Pidgin\n3️⃣ Igbo\n4️⃣ Hausa\n5️⃣ Yoruba",

  privacyNotice:
    "🔒 *Privacy Notice:* Kuditax no dey save your data. Everything wey you share for this chat na only to answer your question — e no go save after the chat end.",

  languageSelected: "Welcome! Make we sort your tax together, no stress. 😊",

  mainMenu:
    "Wetin you wan do today?\n\n1️⃣ Calculate my tax\n2️⃣ Learn how to file my tax return\n3️⃣ Get my Tax Identification Number (TIN)\n4️⃣ Understand my tax reliefs & deductions\n5️⃣ Tax-saving tips\n6️⃣ Ask tax question",

  askUserType:
    "You be:\n1️⃣ Employee (your oga dey pay your salary)\n2️⃣ Self-employed / Freelancer\n3️⃣ Business owner",

  askGrossIncome:   "Wetin be your *total annual salary*? (All the money wey your oga dey pay you for one year, before anything comot)",
  askMonthlyBasic:  "Wetin be your *monthly basic salary*? (The fixed part, no include allowances)",
  askHousing:       "You dey collect *housing allowance*? If yes, how much per month? (Put 0 if no)",
  askTransport:     "You dey collect *transport allowance*? If yes, how much per month? (Put 0 if no)",
  askRent:          "You dey *pay rent*? If yes, how much you dey pay per year? (Put 0 if no)",
  askPension:       "Your oga dey *cut pension* from your salary? (Usually 8% of basic + housing + transport)\n\nReply *yes* or *no*.",
  askNhf:           "You don register with *National Housing Fund (NHF)*? (2.5% of basic salary dey cut)\n\nReply *yes* or *no*.",
  askLifeAssurance: "You get *life insurance*? If yes, how much you dey pay per year? (Put 0 if no)",

  askSelfEmployedIncome:   "Wetin be your *total income for the whole year* from all your work? (Your best guess dey fine)",
  askBusinessExpenses:     "How much you spend on *business expenses* per year? (Tools, data, transport, rent, etc.) (Put 0 if no)",
  askSelfEmployedRent:     "You dey pay *rent for office or work from home*? If yes, how much per year? (Put 0 if no)",
  askSelfEmployedPension:  "You dey contribute to *pension*? If yes, how much per year? (Put 0 if no)",

  askRevenue:      "Wetin be your business *total revenue for the year*?",
  askBizExpenses:  "How much your business spend as *expenses* for the year? (Staff salary, rent, utilities, etc.)",
  askVat:          "Your business don *register for VAT*? Reply *yes* or *no*.",
  askEmployees:    "You get *employees*? If yes, how many?",

  businessOwnerNote:
    "As business owner, you go pay both Company Income Tax and personal tax on wetin you collect.\n\nI go only estimate your *personal income tax* part. For full business tax, abeg work with accountant.\n\nYou wan make I continue with personal income estimate? Reply *yes* to go on.",

  taxSummaryHeader: "Here na your tax summary 📊",
  taxDisclaimer:    "⚠️ *Disclaimer:* This na estimate only. For official filing, use NRS TaxPro-Max portal or consult certified accountant.",

  filingGuide:
    "*How to File Your Tax Return* 📋\n\n*Step 1 — Get Your TIN:*\n• Go https://tinverification.jtb.gov.ng or nearest FIRS/NRS office\n• Bring: your name, BVN or NIN, date of birth, address\n• E dey free — no pay anybody\n\n*Step 2 — File for TaxPro-Max:*\n• Go https://taxpromax.firs.gov.ng\n• Log in with your TIN\n• Choose: File Returns → Personal Income Tax Annual Return\n• Enter your income, check your tax, pay via Remita\n• Download your tax clearance\n\n📅 *Deadline:* 31 March every year.\n\nYou want make I explain any step more? Just ask!",

  tinGuide:
    "*How to Get Your TIN* 🪪\n\n1️⃣ Go https://tinverification.jtb.gov.ng\n   OR go your nearest FIRS or NRS office\n\n2️⃣ Bring:\n   • Your name\n   • BVN or NIN\n   • Date of birth\n   • Address\n\n3️⃣ E go give you TIN immediately online or few days for office\n\n✅ *E dey free o.* No pay anybody.\n\nAnything else I fit help you with?",

  reliefsGuide:
    "*Your Tax Reliefs & Deductions (NTA 2025)* 💡\n\nUnder the new Nigeria Tax Act 2025, these things fit reduce your taxable income:\n\n• *Pension:* 8% of (basic + housing + transport) × 12 months\n• *NHF:* 2.5% of your annual basic (if you don register)\n• *Rent Relief:* 20% of annual rent — max ₦500,000\n• *Life Assurance:* Full annual premium\n\nAll these go reduce your chargeable income — that means less tax!\n\nYou want make I calculate your tax with all the reliefs? Reply *yes* to start.",

  errorFallback:    "Sorry, something do me for back-end. Try again small time. 🙏",
  invalidInput:     "I no understand that reply. Abeg put correct number or answer. 😊",
  invalidAmount:    "Abeg enter valid Naira amount. Example: *3500000* or *3.5m* or *₦3,500,000*.",

  escalation:       "This matter don pass my hand small — I recommend you talk to registered accountant. You want make I connect you? *(Coming soon 🔜)*",

  backToMenu:       "Anything else I fit help you? Reply *menu* to see all options.",
  unknownChoice:    "I no understand that. Abeg reply with number from the menu, or type *menu* to see options again.",
};

export default pidgin;
