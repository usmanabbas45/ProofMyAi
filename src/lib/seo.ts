/** Public site URL used for canonical links, sitemaps and social previews. */
export const SITE_URL = (process.env.APP_URL || "https://proofmyai.com").replace(/\/+$/, "");
export const SITE_NAME = "ProofMyAI";
/** Official profiles of the brand (YouTube, LinkedIn, X, GitHub, Product Hunt…) for search and AI engines. Set ORG_SAME_AS as a comma list. */
export const SAME_AS = [
  ...(process.env.ORG_SAME_AS ?? "").split(",").map((s) => s.trim()).filter((s) => /^https:\/\//.test(s)),
];
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "contact@usmanabbas.dev";
export const SITE_DESCRIPTION =
  "ProofMyAI tests and monitors AI chatbots, AI agents, voice bots, n8n/Make workflows, Google Sheets and CRMs, catches hallucinations and silent failures, and shows what to fix.";

export const FAQS: { q: string; a: string }[] = [
  { q: "What does ProofMyAI do?", a: "ProofMyAI is a quality monitor for AI and automations. It checks every answer your AI chatbot gives against your own help docs, watches AI agents for loops, errors and runaway costs, lets you approve risky agent actions with one click, and monitors n8n and Make workflows, Google Sheets and CRMs like HubSpot and Salesforce for failures and silent failures. A trust report shows where your AI can decide alone, and when something breaks you get an alert and a clear fix list." },
  { q: "Which chatbots and tools does it work with?", a: "Any of them, on any AI model: Grok, ChatGPT, Claude, Gemini, Llama and others. Connect Intercom Fin directly, WhatsApp bots through WAHA or Twilio, or upload chat exports from Zendesk, Tidio, Crisp, Chatbase or your own bot. Send AI agent runs from LangChain, OpenAI Agents, Claude or CrewAI with one API call, connect n8n or Make with an API key, watch Google Sheets with a link, and connect HubSpot, Salesforce, Pipedrive, Zoho, GoHighLevel and other CRMs read-only." },
  { q: "How does it detect AI hallucinations?", a: "An AI judge (Claude or Google Gemini) compares each answer with your knowledge base and labels it correct, not in the docs, made up, should escalate to a human, off policy or unclear. Rule-based checks catch invented prices, missed escalations and over-promises even without an AI key." },
  { q: "Do I need to write code?", a: "No. Chatbot audits only need a file upload, n8n, Make and CRMs connect with an API key or token, Google Sheets with a link, and alerts go to WhatsApp, Slack, Discord, Teams or email. Developers can use the API for live tracking, the pre-send check and approvals." },
  { q: "Is my customers' data safe?", a: "Personal data such as emails, phone numbers, card numbers, IBANs, UK postcodes, number plates and names is masked automatically before anything is stored or sent to an AI model, and you can add your own words to mask. Each project can keep results only (no conversation text), delete data automatically after 7 to 365 days, or switch the AI provider off. A GDPR / UK GDPR Data Processing Agreement is available, and self-hosting is possible for regulated businesses." },
  { q: "Can agencies use it for clients?", a: "Yes. Create one project per client, share read-only client reports with your own agency name, export PDF and CSV, and send weekly summary emails. The Agency plan covers up to 20 client projects." },
  { q: "How much does it cost?", a: "ProofMyAI is free for 50 conversations a month. Paid plans start at $29 per month, and the Compliance plan for regulated businesses is $249. Pay yearly and get 2 months free (12 months for the price of 10). Every paid plan has a 14-day free trial and a 14-day money-back guarantee." },
  { q: "How do I test my AI chatbot?", a: "Write real customer questions with the facts a correct answer must contain, ask your bot each one after every change, and also check live conversations against your help docs, because no test set covers everything customers ask. ProofMyAI writes the test questions from your docs and past mistakes, runs them every night and in CI, and checks every live answer." },
  { q: "Which platforms monitor AI answers to real customer questions?", a: "Developer platforms such as Langfuse, LangSmith and Braintrust log and score answers inside your code. ProofMyAI is built for the business running the chatbot: every real customer answer is checked against your help docs without code, with the evidence, an alert and the article to fix. It also checks AI voice agent calls." },
  { q: "Which tools alert you when an AI agent's tool calls start failing in production?", a: "ProofMyAI checks every agent run for tool errors, loops, runaway costs, empty output and destructive actions like deleting data, alerts when tools fail and only work after retries, and alerts when an agent goes quiet or starts runs that never finish. Send each run with one HTTP call or OpenTelemetry." },
  { q: "What is a silent failure in n8n or Make?", a: "A silent failure is a workflow run that reports success but produced nothing, for example an order sync that returned zero orders because an API changed. ProofMyAI flags these, along with failed runs, slow runs, error spikes and workflows that stopped running." },
];

export interface Solution {
  slug: string;
  /** Page language when not English (headings and buttons are translated). */
  lang?: "de";
  title: string; // <title> and H1
  description: string; // meta description
  kicker: string;
  intro: string;
  problems: string[];
  steps: { title: string; text: string }[];
  features: string[];
  faqs: { q: string; a: string }[];
  /** "What is …?" answer: the first sentence is a stand-alone definition that search and AI engines can quote. */
  definition?: string;
  metrics?: { name: string; text: string }[];
  objectives?: { name: string; text: string }[];
  /** Neutral overview of other tools in the category, so the page answers "which tool should I use?". */
  tools?: { name: string; text: string }[];
}

export const SOLUTIONS: Solution[] = [
  {
    slug: "ai-chatbot-monitoring",
    title: "AI Chatbot Monitoring & Hallucination Checker",
    description: "Monitor your AI chatbot's answers 24/7. ProofMyAI checks every reply against your help docs, catches hallucinations and missed escalations, and tells you which article to fix.",
    kicker: "AI chatbot monitoring",
    intro: "Your support chatbot answers customers day and night. ProofMyAI checks every answer against your own help docs so made-up prices, wrong policies and missed hand-overs are caught before they cost you refunds or customers.",
    problems: [
      "Bots confidently invent prices, delivery times and policies that are not in your docs",
      "Angry customers and legal threats are not handed over to a human",
      "Nobody has time to read thousands of transcripts",
      "Bot platforms have no independent quality control",
    ],
    steps: [
      { title: "Upload or connect", text: "Upload chat exports from Intercom, Tidio, Crisp or Zendesk, or send conversations live with one API call." },
      { title: "Every answer graded", text: "An AI judge compares each reply with your knowledge base: correct, made up, not in docs, should escalate or off policy." },
      { title: "Fix what matters", text: "A fix list groups wrong answers by the help article that caused them, and alerts reach Slack or email." },
    ],
    features: ["Hallucination detection against your own docs", "Missed-escalation and frustration detection", "Your own rules: “never say…”, “always hand over when…”", "Nightly regression tests for your bot", "Live tracking and instant alerts", "Client-ready reports and CSV export"],
    definition: "AI chatbot monitoring is the practice of tracking and checking every answer an AI chatbot gives customers, in real time, for accuracy, safety, cost and customer outcome. It shows when the bot makes things up, breaks your policies, fails to hand over to a human or leaks personal data, so you can fix the cause before customers are affected.",
    metrics: [
      { name: "Hallucination rate", text: "How often the bot gives answers that are made up or not supported by your help docs." },
      { name: "Resolution rate", text: "The share of conversations where the customer's question was actually answered." },
      { name: "Escalation rate", text: "How often the bot hands a conversation to a human, and how often it should have but didn't." },
      { name: "Accuracy per topic", text: "Correct answers per topic (shipping, refunds, pricing…), which shows which help article to fix first." },
      { name: "Response latency", text: "The delay between a customer's message and the bot's reply, including replies that never came." },
      { name: "Cost per conversation", text: "Model and API cost for each conversation, so spend spikes are caught early." },
      { name: "Customer satisfaction", text: "Thumbs up/down or star ratings, overall and per topic." },
      { name: "Knowledge gaps", text: "Questions your help docs don't answer yet." },
    ],
    objectives: [
      { name: "Quality assurance", text: "Check every answer for accuracy against your own docs, tone and helpfulness." },
      { name: "Security & compliance", text: "Catch leaked personal or card data, prompt injection, jailbreak attempts and policy breaches." },
      { name: "Continuous improvement", text: "Find knowledge gaps and the articles or prompts causing wrong answers, then fix them." },
    ],
    tools: [
      { name: "ProofMyAI", text: "No-code monitoring for support chatbots, AI agents and n8n/Make workflows. Checks every answer against your help docs and writes the fix. Built for businesses and agencies." },
      { name: "Langfuse", text: "Open-source LLM engineering platform for developers: tracing, prompt management, evaluations and cost tracking. Needs code integration." },
      { name: "LangSmith", text: "Debugging, testing and monitoring suite from the LangChain team, aimed at developers building LLM apps and agents." },
      { name: "MaestroQA", text: "Customer support QA platform covering human agents and chatbots, focused on conversation scoring, compliance and tone." },
    ],
    faqs: [
      { q: "What is AI chatbot monitoring?", a: "AI chatbot monitoring is the practice of tracking and checking every answer an AI chatbot gives customers, in real time, for accuracy, safety, cost and customer outcome. It catches made-up answers, policy breaches, missed hand-overs and data leaks so you can fix them before customers are affected." },
      { q: "Which metrics should I monitor for an AI chatbot?", a: "The key chatbot metrics are hallucination rate, resolution rate, escalation rate, accuracy per topic, response latency, cost per conversation, customer satisfaction and knowledge gaps. ProofMyAI tracks all of them on its Analytics page." },
      { q: "What is the best AI chatbot monitoring tool?", a: "It depends on who runs the bot. Developers building LLM apps often use Langfuse or LangSmith for tracing. Support QA teams use MaestroQA. Businesses and agencies that want every customer answer checked against their help docs, without code, use ProofMyAI." },
      { q: "How do I check if my chatbot is giving wrong answers?", a: "Upload a transcript export to ProofMyAI together with your help articles. Every answer is graded against your docs within minutes, and wrong or made-up answers are listed with the reason and the article to update." },
      { q: "Does it work with Intercom Fin, Tidio Lyro and Chatbase?", a: "Yes. Any chatbot works: export conversations as CSV or JSON, or send them live through the API or an n8n/Make webhook." },
      { q: "Does it work with bots built on Grok, ChatGPT, Claude or Gemini?", a: "Yes. ProofMyAI checks the question and the answer, not the model, so a bot on any AI model connects the same way. The Connect page has a ready-made example for Grok (xAI)." },
    ],
  },
  {
    slug: "n8n-workflow-monitoring",
    title: "n8n & Make Workflow Monitoring and Alerts",
    description: "Get alerted when n8n or Make workflows fail, silently return nothing, slow down or stop running. Connect in two minutes with an API key or webhook.",
    kicker: "n8n & Make monitoring",
    intro: "n8n and Make don't warn you when an automation quietly stops working. ProofMyAI watches every execution and alerts you about failures, silent failures and workflows that simply stopped running.",
    problems: [
      "Workflows fail at night and nobody notices until a customer complains",
      "Runs report success but process zero orders or leads",
      "Triggers break and a workflow silently stops running",
      "Error emails are noisy and easy to miss",
    ],
    steps: [
      { title: "Connect", text: "Paste your n8n URL and API key, or your Make API token and scenario IDs. Or send executions by webhook." },
      { title: "Automatic checks", text: "Every 15 minutes ProofMyAI checks for failures, silent failures, slow runs, error-rate spikes and missing runs." },
      { title: "Fast alerts", text: "Get one clear alert in Slack, Discord, Teams or email within minutes (seconds with the optional webhook), and it resolves itself when the workflow recovers." },
    ],
    features: ["Failed and crashed execution alerts", "Silent failure detection (success with 0 output)", "“Stopped running” heartbeat alerts", "Error-rate spike detection", "Slow run detection vs. normal duration", "Per-workflow success rates"],
    faqs: [
      { q: "How do I get alerts when an n8n workflow fails?", a: "Connect n8n to ProofMyAI with an API key (n8n → Settings → n8n API). ProofMyAI checks executions every 15 minutes and alerts you on Slack or email. For instant alerts, add an Error Trigger workflow that posts to the ProofMyAI webhook." },
      { q: "Does it work with self-hosted n8n?", a: "Yes, as long as your n8n public API is reachable from the internet. You can also push executions to ProofMyAI with a webhook." },
      { q: "Can I check a workflow before connecting anything?", a: "Yes. The free n8n workflow checker at proofmyai.com/tools/n8n-workflow-checker scans a pasted workflow for exposed API keys, open webhooks, errors that pass as success, missing retries and a missing error workflow. It runs in your browser and nothing is uploaded." },
    ],
  },
  {
    slug: "crm-monitoring",
    title: "CRM Monitoring: Alerts When Leads Stop, Duplicate or Break",
    description: "Read-only monitoring for HubSpot, Salesforce, Pipedrive, Zoho, GoHighLevel and more. Get a WhatsApp, Slack or email alert when leads stop arriving, come in without an email or owner, get duplicated, change in bulk or aren't followed up.",
    kicker: "CRM monitoring",
    intro: "Forms, ad integrations, n8n flows and AI agents all write into your CRM. When one of them breaks, nothing errors: leads just stop, or arrive broken. ProofMyAI watches the CRM itself and tells you within 15 minutes.",
    definition: "CRM monitoring is automatically checking the records arriving in a CRM (leads, contacts, deals) for problems such as no new records, missing required fields, duplicates, mass changes and leads nobody contacted, so broken integrations are caught before leads are lost.",
    problems: [
      "A website form or Facebook Lead Ads connection breaks and leads stop for days",
      "A sync mapping changes and new leads arrive with no email, phone or owner",
      "An automation runs twice and creates duplicate contacts",
      "A runaway workflow or AI agent edits hundreds of records at once",
      "New leads sit untouched because the follow-up automation stopped",
    ],
    steps: [
      { title: "Connect read-only", text: "Paste a read-only token for HubSpot, Salesforce, Pipedrive, Zoho CRM, GoHighLevel, Freshsales, Close, ActiveCampaign or Dynamics 365, or send records from n8n, Make or Zapier for any other CRM." },
      { title: "It learns your normal", text: "ProofMyAI learns how often new records usually arrive (nights and weekends included) and how complete they normally are." },
      { title: "Alerts that matter", text: "Get one clear alert on WhatsApp, Slack, Teams or email when something is off, and a note when it's fixed." },
    ],
    features: ["New leads stopped arriving (learned rhythm)", "New records missing email, phone or owner", "Duplicate record detection", "Bulk-change detection", "Leads not contacted in time", "Connection-lost alerts", "Read-only, no names, emails or phone numbers stored"],
    faqs: [
      { q: "Which CRMs does ProofMyAI support?", a: "Direct read-only connections for HubSpot, Salesforce, Pipedrive, Zoho CRM, GoHighLevel, Freshsales, Close, ActiveCampaign and Microsoft Dynamics 365. Any other CRM (Monday, Attio, Copper, Keap, Bitrix24, Odoo…) works by sending records from n8n, Make or Zapier." },
      { q: "Can ProofMyAI change or delete my CRM data?", a: "No. Connections are read-only and ProofMyAI never writes to your CRM. It stores only scrambled hashes of emails and phone numbers (to spot duplicates), filled/empty flags and timestamps, never names, emails or phone numbers." },
      { q: "How fast will I know when leads stop?", a: "CRMs are checked every 15 minutes. The alert fires when the current gap is clearly longer than any normal gap for your CRM, so a quiet night doesn't cause a false alarm." },
    ],
  },
  {
    slug: "grok-chatbot-monitoring",
    title: "Grok Chatbot Monitoring: Check Every Grok (xAI) Answer",
    description: "Built a support bot or AI agent on Grok? ProofMyAI checks every Grok answer against your help docs and policies, blocks wrong replies before customers see them, and alerts you on WhatsApp, Slack or email.",
    kicker: "Grok (xAI) monitoring",
    intro: "Grok is built to answer directly and with personality. That's great for engagement, but in customer support a confident answer that isn't in your policy turns into a refund, a complaint or a screenshot. ProofMyAI checks every answer your Grok bot gives, against your own help docs and rules, and tells you the moment one is wrong.",
    definition: "Grok chatbot monitoring is checking every answer a chatbot or AI agent built on xAI's Grok models gives your customers, for accuracy against your own documentation, policy breaks, unsafe content and missed hand-overs, so mistakes are caught and fixed before they cost you.",
    problems: [
      "A Grok bot promises a refund, discount or delivery date your policy doesn't allow",
      "Answers sound sure even when the fact isn't in your help docs",
      "A tone that works on social media is wrong for an upset customer",
      "A model update changes how your bot answers and nobody notices",
      "Nobody has time to read every conversation",
    ],
    steps: [
      { title: "Add one call", text: "After your bot gets Grok's reply, send the conversation to ProofMyAI in the background (fire-and-forget, 2-second limit). No code? Use one HTTP step in n8n, Make or Zapier, or upload a chat export." },
      { title: "Every answer checked", text: "Each reply is compared with your help articles and your rules: correct, made up, not in docs, off policy or should escalate. Safety checks flag leaked personal data and a bot claiming to be human." },
      { title: "Block, alert and fix", text: "Ask ProofMyAI before sending and get allow, review or block. Problems reach WhatsApp, Slack or email, and the fix list shows which help article to correct." },
    ],
    features: ["Works with any Grok model through xAI's OpenAI-compatible API", "Answers checked against your own help docs", "Pre-send check: allow, review or block", "Your rules: \u201cnever promise…\u201d, \u201calways hand over when…\u201d", "Nightly tests that catch changes after a model update", "One-click approval for refunds and other risky agent actions", "Alerts on WhatsApp, Slack, Teams or email"],
    faqs: [
      { q: "Can I connect a Grok chatbot to ProofMyAI?", a: "Yes. ProofMyAI checks the question and the answer, not the model, so a bot built on Grok connects the same way as any other: one HTTP call after each reply, an HTTP step in n8n, Make or Zapier, or a chat export upload. The Connect page has a ready-made Grok code example." },
      { q: "Does ProofMyAI need my xAI API key?", a: "No. Your xAI key stays in your own code. ProofMyAI only receives the conversation you send it. The only exception is optional nightly testing directly against xAI's API, where the key is stored encrypted." },
      { q: "Can ProofMyAI test my Grok bot automatically?", a: "Yes. Nightly tests send real customer questions to your bot's URL, or straight to xAI's chat completions endpoint with your bot's system prompt, and alert you when answers get worse, for example after a model update." },
      { q: "Does it also work for ChatGPT, Claude, Gemini or Llama bots?", a: "Yes. The checks are the same for any model, so you can switch models and compare quality on the same questions." },
    ],
  },
  {
    slug: "ai-agent-human-approval",
    title: "Human Approval for AI Agents: Approve Risky Actions in One Click",
    description: "Let AI agents prepare refunds, payments and customer emails while a person approves the risky ones with one click. First-time actions, irreversible steps and promises wait; rejected actions stay blocked; every decision is logged.",
    kicker: "Human in the loop",
    intro: "\"Automate the draft, never the send.\" ProofMyAI lets your agent do the work and asks a person only for the steps that matter: anything that moves money, messages a customer or can't be undone.",
    definition: "Human-in-the-loop approval for AI agents means the agent prepares an action but a person must approve it before it runs when the action is risky, for example irreversible, above an amount, the first of its kind, or a promise to a customer.",
    problems: [
      "An agent sends a refund, discount or promise nobody approved",
      "Agents quietly retry an action a person already rejected",
      "Nobody can say who approved a decision, or why",
      "Approving everything by hand doesn't scale",
    ],
    steps: [
      { title: "Agent submits the action", text: "Before acting, the agent sends one HTTP request (n8n, Make, LangChain or any code) with the action, amount, category and draft." },
      { title: "ProofMyAI decides who decides", text: "Routine, reversible actions are approved straight away. Irreversible ones, first-time categories, amounts over your limit and drafts that promise refunds, discounts or deadlines wait for a person." },
      { title: "One click, then a rule", text: "Approve or reject from the Approvals page after an alert. \"Approve & always allow\" turns your decision into a rule, so the queue shrinks as trust builds." },
    ],
    features: ["One-click approve or reject with a note", "Rules learned from your decisions", "Rejected actions blocked on retry", "Amount limits and irreversible-action holds", "Promise detection in drafts", "Decision log: who, when and why", "Callback or polling for your agent"],
    faqs: [
      { q: "How does my agent wait for the decision?", a: "It either polls GET /api/v1/approvals/{id} or gives a callback_url, which ProofMyAI calls with the decision. In n8n, use a Wait node that resumes on the webhook." },
      { q: "Will this slow everything down?", a: "No. Routine, reversible actions are approved instantly. Only the risky ones wait, and \"Ready to trust\" suggests turning categories you always approve into automatic rules." },
    ],
  },
  {
    slug: "ai-agent-monitoring",
    title: "AI Agent Monitoring: Loops, Errors & Costs",
    description: "Monitor AI agents built with LangChain, OpenAI, Claude or CrewAI. Catch loops, tool errors, runaway costs, empty outputs and answers the tools never supported.",
    kicker: "AI agent monitoring",
    intro: "AI agents can loop, fail silently or burn through your budget. Send each run to ProofMyAI with one HTTP call and get a reliability score, clear issues and alerts.",
    problems: [
      "Agents get stuck calling the same tool again and again",
      "Tool errors hide behind a “success” status",
      "Costs per run creep up without anyone noticing",
      "Final answers claim results the tools never returned",
    ],
    steps: [
      { title: "One API call", text: "Send the run, with goal, steps, tool calls, costs and final output, when your agent finishes. Any framework works." },
      { title: "Checked instantly", text: "Loops, tool errors, empty output, budget, step and time limits, plus an AI review of whether the goal was met." },
      { title: "Score & alerts", text: "Each run gets a 0–100 score; problem runs raise incidents and alerts." },
    ],
    features: ["Loop detection", "Tool error and “ended on error” detection", "Cost, step and latency budgets", "Empty and ungrounded output checks", "Per-agent reliability and cost reports", "Works with any framework via HTTP"],
    faqs: [
      { q: "How do I monitor a LangChain or OpenAI agent in production?", a: "At the end of each run, POST the run (goal, steps and final output) to the ProofMyAI API. Copy-paste snippets for JavaScript, Python and cURL are in the dashboard." },
      { q: "Can it stop my agent from overspending?", a: "ProofMyAI flags every run that goes over your cost, step or time budget and alerts you, so you can fix prompts or tools before costs grow." },
    ],
  },
];

SOLUTIONS.push({
  slug: "ai-chatbot-compliance-monitoring",
  title: "AI Chatbot Compliance Monitoring for Dealers, Finance & Insurance",
  description: "Catch the chatbot answers that create liability: wrong cover and warranty claims, missed complaints and legal threats, unsafe advice and unanswered customers. Built for regulated businesses, with DPA, masking and results-only storage.",
  kicker: "Regulated businesses",
  intro: "When a car dealer's, broker's or insurer's chatbot gets it wrong, it's not just a bad answer. It can be a mis-sold warranty, an ignored complaint or a stranded customer told to drive. ProofMyAI catches the answers that could create legal or financial exposure, and keeps customer data under your control.",
  problems: [
    "The bot tells customers something is covered when your terms exclude it",
    "Complaints and legal threats get an ordinary reply instead of a hand-over",
    "Customers are asked again for their registration or details, or get no reply at all",
    "A bot contradicts safety advice it gave a minute earlier",
  ],
  steps: [
    { title: "Add your terms and rules", text: "Upload your policy wording and add rules like “windscreen => not covered” or “always hand over when a customer mentions complaint or solicitor”." },
    { title: "Connect safely", text: "Upload anonymised exports, connect WhatsApp/SMS through Twilio read-only, or send events. Masking, results-only storage and auto-delete are set per project." },
    { title: "Get a risk report", text: "See how many answers could have created legal or financial exposure, which rules were broken, unanswered customers and response times, with alerts for anything high-risk." },
  ],
  features: [
    "“Must say / never say” rules for cover, exclusions and promises",
    "Missed complaint, legal-threat and vulnerable-customer hand-overs",
    "Unanswered-message and failed-delivery alerts (WhatsApp/SMS)",
    "Re-asking, contradiction and fallback detection",
    "Masking of names, postcodes, number plates and your own terms",
    "Signed DPA, results-only storage, auto-delete, AI-off or self-hosted",
  ],
  faqs: [
    { q: "Can we use ProofMyAI under UK GDPR?", a: "Yes. You stay the data controller and ProofMyAI acts as your processor under our Data Processing Agreement. You can mask personal data, keep results only (no conversation text), delete data automatically and switch the AI provider off, or run ProofMyAI on your own server." },
    { q: "Does it replace our compliance review?", a: "No. It is an automated first line that flags risky answers quickly so your team can review and fix them. Results can be wrong, so high-risk findings should always be checked by a person." },
  ],
});

SOLUTIONS.push({
  slug: "ai-chatbot-monitoring-for-agencies",
  title: "AI Chatbot & Automation Monitoring for Agencies",
  description: "For agencies that build chatbots, AI agents and n8n/Make automations for clients: monitor every client's AI in one place, catch problems before the client does, and send branded monthly quality reports.",
  kicker: "Agencies",
  intro: "You build the bots and automations; when one gives a wrong answer or a workflow silently stops, your client blames you. ProofMyAI watches every client project, alerts you first, and gives you branded reports that prove the work is paying off, so retainers renew.",
  problems: [
    "Clients find bot mistakes before you do, and trust drops",
    "n8n and Make workflows break quietly and nobody notices for days",
    "It's hard to show clients ongoing value, so retainers get cancelled",
    "Checking every client's chats by hand doesn't scale",
  ],
  steps: [
    { title: "One project per client", text: "Connect each client's chatbot, WhatsApp bot, AI agents and n8n/Make workflows in minutes. Invite the client as a viewer if you like." },
    { title: "Alerts reach you first", text: "Wrong answers, missed hand-overs, failed or silent workflows and downtime go to your Slack, Teams or email, per client." },
    { title: "Branded client reports", text: "Send a monthly report with your agency's name: answers checked, problems fixed, uptime and workflow success. Proof your retainer is working." },
  ],
  features: ["Up to 20 client projects on the Agency plan", "White-label share links and PDF reports", "Client viewer access, no shared passwords", "Per-client alert channels", "✨ Fix with AI: corrected articles and safer prompts to send clients", "n8n, Make, agents, chatbots and uptime in one dashboard"],
  faqs: [
    { q: "Can I put my agency's name on the reports?", a: "Yes. Client reports and share links show your agency's name, and you can save them as PDF to send each month." },
    { q: "How much does it cost for an agency?", a: "The Agency plan is $199 a month for up to 20 client projects and 15,000 audited conversations, with a 14-day free trial. Many agencies add it to their monthly retainer." },
    { q: "Can my clients log in?", a: "Yes. Invite a client as a viewer or editor of their own project only. They never see your other clients." },
  ],
});

// ---- Pages for the searches people actually make (Search Console, November 2026) ----

SOLUTIONS.push({
  slug: "ai-chatbot-testing",
  title: "AI Chatbot Testing Tool: Automated QA for Chatbots and AI Agents",
  description: "Test your AI chatbot automatically: test questions written from your help docs and past mistakes, nightly and CI regression runs, and every live answer checked. No code needed.",
  kicker: "AI chatbot testing",
  intro: "Testing a chatbot once before launch isn't enough: a new prompt, model or help article can break answers that worked yesterday. ProofMyAI writes the test questions for you, asks your bot every night and in your deploy pipeline, and checks every live answer against your own docs.",
  definition: "AI chatbot testing is checking that a chatbot gives correct, safe and helpful answers before and after it goes live. It combines test questions with the facts a right answer must contain, regression runs after every change, adversarial tests (prompt injection, \"let me talk to a human\"), and monitoring of real customer conversations, because no test set covers everything customers ask.",
  metrics: [
    { name: "Test pass rate", text: "The share of test questions whose answer contains the required facts and avoids the forbidden ones." },
    { name: "Regressions", text: "Questions that passed before and fail now, usually after a prompt, model or help-article change." },
    { name: "Hallucination rate in production", text: "Live answers that are made up or not supported by your docs, the gaps no test set covered." },
    { name: "Escalation accuracy", text: "Whether complaints, legal threats and requests for a person reach a human." },
    { name: "Safety failures", text: "Prompt injection that worked, leaked personal data, a bot claiming to be human, rude replies." },
    { name: "Coverage", text: "How many of your help topics have at least one test question." },
  ],
  problems: [
    "Chatbots are tested once before launch, then every prompt or model change goes live untested",
    "Writing and maintaining test questions by hand takes days, so nobody does it",
    "Answers change from run to run, so exact-match tests fail on good answers",
    "Real customers ask questions no test set ever covered",
  ],
  steps: [
    { title: "Tests written for you", text: "AI writes test questions from your help articles, your rules and the questions your bot already got wrong, including prompt-injection and \"talk to a human\" cases. You review them before they run. Any wrong answer found in a real chat becomes a test with one click." },
    { title: "Run them every night and in CI", text: "ProofMyAI asks your bot every night and checks each answer includes the facts that matter and avoids what it must never say. Call POST /api/v1/test-runs from a GitHub Action to fail a deploy when answers get worse." },
    { title: "Check live answers too", text: "Every real conversation is graded against your docs, with the exact sentence as evidence, so the questions your tests missed are caught as well. Alerts reach Slack, WhatsApp or email." },
  ],
  features: ["AI-written test questions from your docs and past mistakes", "Facts a right answer must include, and things it must never say", "Nightly regression runs against any HTTP chatbot endpoint", "CI / GitHub Actions: fail the build when answers get worse", "Prompt-injection, data-leak and hand-over tests", "Live answer checking with evidence from your docs", "Voice bot calls checked too (Vapi, Retell)", "No code needed for chatbot audits"],
  tools: [
    { name: "ProofMyAI", text: "No-code chatbot testing and live answer checking against your help docs, plus AI agent and n8n/Make monitoring. Built for businesses and agencies." },
    { name: "Botium (Cyara)", text: "Enterprise conversational AI testing: functional, regression, performance and security tests for chatbots and voice bots, with connectors for many bot platforms. Has an open-source core." },
    { name: "Promptfoo", text: "Open-source command-line tool for developers to evaluate and red-team prompts and models in code and CI." },
    { name: "Bespoken", text: "Testing and monitoring for IVR, voice and chat, focused on contact centers, including load testing." },
    { name: "Braintrust", text: "Evaluation and observability platform for AI engineering teams: datasets, experiments, scorers and production logging." },
  ],
  faqs: [
    { q: "How do I test my AI chatbot?", a: "Write 20 to 50 real customer questions with the facts a correct answer must contain, ask your bot each one, and check the answers contain those facts and nothing you forbid. Add prompt-injection and \"talk to a human\" questions, re-run the whole set after every change, and also check live conversations against your help docs. ProofMyAI does all of this automatically." },
    { q: "What is the best chatbot testing tool?", a: "It depends on who you are. Enterprises testing many bot platforms and voice channels often use Botium by Cyara. Developers who test prompts in code use Promptfoo or Braintrust. Businesses and agencies that want tests written for them, nightly runs and live answers checked against their help docs without code use ProofMyAI." },
    { q: "How do you test a chatbot when answers change every time?", a: "Don't compare exact text. Check meaning: the facts a right answer must include (\"30 days\", \"original payment method\") and the claims it must never make (\"lifetime warranty\"). ProofMyAI checks each answer this way, so a reworded correct answer still passes." },
    { q: "Can I run chatbot tests in CI before deploying?", a: "Yes. Save your test questions in ProofMyAI and call POST /api/v1/test-runs from your pipeline (for example a GitHub Action) against a preview URL. The run fails when answers get worse, so a broken prompt never reaches customers." },
    { q: "What should a chatbot testing checklist include?", a: "Your most common questions with their correct facts, prices and numbers, questions your docs don't cover (the bot should say it doesn't know), complaints and legal threats that must reach a human, prompt-injection attempts, personal data handling, other languages, and a re-test after every change. See the full 25-point chatbot QA checklist on the ProofMyAI blog." },
    { q: "Does it work with Intercom Fin, Chatbase, Voiceflow or a custom bot?", a: "Yes. Nightly tests call any HTTP endpoint that returns the bot's answer, and live answers can come from Intercom, WhatsApp, chat exports or one API call from any bot." },
  ],
});

SOLUTIONS.push({
  slug: "ai-hallucination-detection",
  title: "AI Hallucination Detection: Monitor Chatbot Answers Live",
  description: "Detect AI chatbot hallucinations in real time. Every answer is checked against your own help docs, made-up prices and policies are flagged with evidence, and wrong replies can be blocked before sending.",
  kicker: "AI hallucination detection",
  intro: "A hallucinating chatbot doesn't look broken: it sounds sure of itself while promising refunds, prices and deadlines you never offered. ProofMyAI checks each live answer against your own help docs, shows the exact sentence it contradicts, and can block it before the customer sees it.",
  definition: "AI hallucination detection is checking whether an AI's answer is supported by a trusted source, such as your help articles and policies, and flagging answers that are made up, contradict the source or go beyond it. For customer-facing chatbots it has to run on every live answer, because hallucinations depend on the exact question and change when prompts, models or docs change.",
  metrics: [
    { name: "Hallucination rate", text: "The share of answers that are made up or contradict your docs." },
    { name: "Stated as fact", text: "Wrong answers said with full confidence, the ones customers act on without double-checking." },
    { name: "Not in docs", text: "Answers that go beyond what your help articles say, often the first sign of a knowledge gap." },
    { name: "Accuracy per topic", text: "Which topics (refunds, shipping, pricing) the bot gets wrong most, so you fix the right article first." },
  ],
  problems: [
    "The bot invents prices, discounts, deadlines and policies, and says them confidently",
    "Nobody can read thousands of conversations to find the wrong ones",
    "A policy changes on the website and the bot keeps quoting the old version",
    "Wrong answers are discovered only when a customer complains",
  ],
  steps: [
    { title: "Add your source of truth", text: "Import your help center or policy pages in one click (they're re-read daily, so policy changes are caught) or upload files." },
    { title: "Every answer checked", text: "Each reply is graded: correct, not in docs, made up, should escalate or off policy, with the exact sentence from your docs as evidence and a \"stated as fact\" flag for confident wrong answers." },
    { title: "Block, alert and fix", text: "The pre-send check returns allow, review or block before a reply goes out. Alerts reach Slack, WhatsApp or email, and Fix with AI writes the corrected help article." },
  ],
  features: ["Live hallucination detection against your own docs", "Evidence: the exact sentence the answer contradicts", "\"Stated as fact\" flag for confident wrong answers", "Pre-send check: allow, review or block", "Daily re-check of your policy pages for changes", "Fix with AI: corrected articles and a safer system prompt", "Works with any model: GPT, Claude, Gemini, Grok, Llama"],
  faqs: [
    { q: "How do I monitor an AI chatbot for hallucinations in real time?", a: "Send each conversation to a checker that compares the answer with your trusted docs as it happens. With ProofMyAI that's one API call (or a no-code connection for Intercom and WhatsApp); every answer is graded within seconds and problems alert you. To stop them reaching customers, call the pre-send check before replying." },
    { q: "Which platforms monitor AI answers to real customer questions?", a: "Developer platforms such as Langfuse, LangSmith and Braintrust log and score answers inside your code. ProofMyAI is built for the business running the chatbot: it checks every real customer answer against your help docs without code, shows the evidence, and tells you which article to fix." },
    { q: "Can hallucinations be detected without an AI model?", a: "Partly. Rule-based checks catch prices, numbers and promises that appear nowhere in your docs, missed escalations and broken business rules. An AI judge is needed to catch subtle contradictions. ProofMyAI uses both." },
    { q: "Does it detect harmful or toxic chatbot outputs too?", a: "Yes. Safety checks flag rude or offensive replies, prompt-injection attacks that worked, leaked personal or card data, a bot claiming to be human, and a bot changing account login details without verification." },
  ],
});

SOLUTIONS.push({
  slug: "voice-bot-qa",
  title: "Voice Bot QA & Monitoring: Check Every AI Phone Call",
  description: "QA for AI voice agents and phone bots (Vapi, Retell or any provider): every answer in every call is checked, and callers who asked for a person but weren't transferred are flagged.",
  kicker: "Voice bot QA",
  intro: "AI phone agents fail in ways staff testing rarely catches: a caller asks for a person and the transfer number is wrong, or the bot promises a call back nobody makes. ProofMyAI checks every finished call, not just the ones you test.",
  definition: "Voice bot QA is checking the quality of an AI voice agent's calls: whether its answers are correct and on policy, whether callers who need a person reach one, and whether the call ended the way it should. Because callers can't scroll back or re-read, a wrong answer or a failed transfer on a phone call costs more than in chat.",
  problems: [
    "Callers ask for a person and the transfer fails, or never happens",
    "The bot says \"transferring you now\" and the call simply ends",
    "Answers on calls are never reviewed because listening takes too long",
    "Problems only surface when people complain in public",
  ],
  steps: [
    { title: "Connect your voice platform", text: "Point a Vapi server URL (end-of-call report) or a Retell webhook at ProofMyAI, or send any provider's transcript with one API call." },
    { title: "Every call checked", text: "Every bot answer is graded against your docs like a chat reply, and the call is checked for a person requested but no transfer, including transfers the bot promised that never happened." },
    { title: "Alert and fix", text: "Failed transfers alert you straight away, with the call id and what the caller said." },
  ],
  features: ["Vapi and Retell webhooks, plus a generic API", "Every answer in every call checked against your docs", "\"Asked for a person, not transferred\" alerts", "Promised transfers that never happened", "Promised call-backs tracked until done", "One dashboard with your chatbots, agents and workflows"],
  tools: [
    { name: "ProofMyAI", text: "Checks every finished call's answers and transfers from Vapi, Retell or any provider. No code for Vapi and Retell." },
    { name: "Bespoken", text: "Testing and monitoring for IVR, voice and chat in contact centers, including functional and load testing." },
    { name: "Cyara", text: "Enterprise CX assurance for contact centers: testing and monitoring voice, IVR and digital channels." },
  ],
  faqs: [
    { q: "How do I QA an AI voice agent?", a: "Test it before launch with scripted calls, then check real calls continuously: is each answer correct, did callers who asked for a person get transferred, and did promised call-backs happen? ProofMyAI checks every finished call from Vapi, Retell or any provider automatically." },
    { q: "Can ProofMyAI tell if a call transfer failed?", a: "Yes. When the caller asked for a person and the call ended without a transfer, it raises an alert, including when the bot said it was transferring them. Vapi and Retell report how the call ended; other providers can send transferred: true/false." },
    { q: "Which voice platforms does it support?", a: "Vapi (end-of-call report) and Retell (call_ended webhook) connect without code. Any other provider can POST the transcript to /api/v1/calls." },
  ],
});

SOLUTIONS.push({
  slug: "chatbot-qualitaetssicherung",
  lang: "de",
  title: "KI-Chatbot Qualitätssicherung: jede Antwort automatisch prüfen",
  description: "Qualitätssicherung für KI-Chatbots und KI-Agenten: Jede Antwort wird gegen Ihre eigenen Hilfeartikel geprüft, erfundene Preise und Richtlinien werden erkannt, nächtliche Tests inklusive. Ohne Code.",
  kicker: "KI-Chatbot Qualitätssicherung",
  intro: "Ihr Kundenservice-Chatbot antwortet rund um die Uhr. ProofMyAI prüft jede Antwort gegen Ihre eigenen Hilfeartikel und Richtlinien, damit erfundene Preise, falsche Rückgaberegeln und fehlende Übergaben an einen Menschen auffallen, bevor Kunden sich beschweren.",
  definition: "KI-Chatbot Qualitätssicherung bedeutet, systematisch zu prüfen, ob ein Chatbot korrekte, sichere und hilfreiche Antworten gibt: vor dem Start mit Testfragen und danach laufend für echte Kundengespräche. Geprüft werden Fakten gegen die eigenen Dokumente, die Übergabe an Menschen, Datenschutz, Sicherheit gegen Manipulation und Regressionen nach jeder Änderung.",
  metrics: [
    { name: "Halluzinationsrate", text: "Anteil der Antworten, die erfunden sind oder Ihren Dokumenten widersprechen." },
    { name: "Bestehensrate der Tests", text: "Anteil der Testfragen, deren Antwort die nötigen Fakten enthält." },
    { name: "Eskalationsquote", text: "Wie oft Beschwerden und Anfragen nach einem Menschen wirklich weitergeleitet werden." },
    { name: "Genauigkeit pro Thema", text: "Welche Themen (Versand, Rückgabe, Preise) am häufigsten falsch beantwortet werden." },
  ],
  problems: [
    "Der Bot erfindet Preise, Fristen und Rückgaberegeln, und zwar selbstbewusst",
    "Verärgerte Kunden und rechtliche Drohungen werden nicht an einen Menschen übergeben",
    "Niemand hat Zeit, Tausende Gesprächsverläufe zu lesen",
    "Nach Änderungen an Prompt, Modell oder Hilfeartikeln wird nicht erneut getestet",
  ],
  steps: [
    { title: "Wissensbasis anlegen", text: "Importieren Sie Ihr Hilfecenter oder Ihre Richtlinienseiten mit einem Klick, oder laden Sie Dateien hoch. Die Seiten werden täglich auf Änderungen geprüft." },
    { title: "Jede Antwort geprüft", text: "Jede Antwort wird bewertet: korrekt, nicht in den Dokumenten, erfunden, hätte eskalieren müssen oder richtlinienwidrig, mit dem genauen Satz aus Ihren Dokumenten als Beleg." },
    { title: "Testen, warnen, beheben", text: "Nächtliche Regressionstests, Warnungen per E-Mail, Slack oder WhatsApp und eine Liste, welcher Artikel korrigiert werden muss." },
  ],
  features: ["Prüfung jeder Antwort gegen Ihre Hilfeartikel", "Erkennung erfundener Preise und Richtlinien", "Nächtliche Regressionstests und Tests in der CI", "Erkennung fehlender Übergaben an Menschen", "Personenbezogene Daten werden vor der Speicherung maskiert", "Prüft auch, ob der Bot in der Sprache des Kunden antwortet"],
  faqs: [
    { q: "Was ist KI-Chatbot Qualitätssicherung?", a: "Die systematische Prüfung, ob ein KI-Chatbot korrekte, sichere und hilfreiche Antworten gibt: vor dem Start mit Testfragen und danach laufend für echte Gespräche, gegen die eigenen Hilfeartikel und Richtlinien." },
    { q: "Wie teste ich einen KI-Chatbot?", a: "Sammeln Sie 20 bis 50 echte Kundenfragen mit den Fakten, die eine richtige Antwort enthalten muss, fragen Sie den Bot regelmäßig und nach jeder Änderung, und prüfen Sie zusätzlich die echten Gespräche gegen Ihre Hilfeartikel. ProofMyAI erstellt die Testfragen auf Wunsch automatisch." },
    { q: "Funktioniert ProofMyAI mit deutschsprachigen Chats?", a: "Ja. Deutsche Gespräche werden gegen deutsche Hilfeartikel geprüft, und es wird erkannt, wenn der Bot in einer anderen Sprache antwortet als der Kunde. Die Oberfläche von ProofMyAI ist derzeit auf Englisch." },
    { q: "Ist ProofMyAI DSGVO-konform nutzbar?", a: "Personenbezogene Daten wie E-Mail-Adressen, Telefonnummern, Kartennummern und IBANs werden vor der Speicherung und vor jeder KI-Prüfung maskiert, Aufbewahrungsfristen sind einstellbar, und ein Auftragsverarbeitungsvertrag (DPA) ist verfügbar. Die Server stehen in den USA." },
  ],
});

export function jsonLd(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

export interface Video { id: string; title: string; description: string; duration: string; uploadDate: string }

export const VIDEOS = {
  marketing: {
    id: "Z4oiiTvkL2A",
    title: "Is Your AI Quietly Failing? ProofMyAI Checks Chatbots, AI Agents, n8n & Your CRM",
    description: "ProofMyAI checks every AI chatbot answer against your own help docs and shows the fix, monitors AI agents, n8n, Make, Google Sheets and CRMs (HubSpot, Salesforce, Pipedrive, Zoho, GoHighLevel), shows where your AI can decide on its own in the trust report, lets you approve risky agent actions with one click, and alerts you on WhatsApp, Slack or email.",
    duration: "PT1M35S",
    uploadDate: "2026-10-19",
  },
  tutorial: {
    id: "YryNJFoh9DI",
    title: "ProofMyAI Setup Tutorial 2026: Monitor Chatbots, AI Agents, n8n, Google Sheets & Your CRM",
    description: "Step-by-step setup: add help articles, check your chatbot, Fix with AI, nightly tests, AI agents, n8n and Make with heartbeats, Google Sheets, CRM monitoring, one-click approvals for agent actions, the AI trust report, live tracking and alerts.",
    duration: "PT3M25S",
    uploadDate: "2026-10-19",
  },
  live: {
    id: "h8HYUrIBQiw",
    title: "ProofMyAI Live Demo: Watch It Catch a Wrong AI Answer, a Risky Refund & a Missed Job in Real Time",
    description: "Everything happens in the real app, live: a wrong chatbot answer flagged in seconds, the alert on WhatsApp and Slack, the pre-send check blocking a bad reply, an AI agent's refund approved with one click, duplicate CRM leads caught, and a missed nightly job alerted and then auto-resolved.",
    duration: "PT1M46S",
    uploadDate: "2026-10-19",
  },
} satisfies Record<string, Video>;

/** schema.org VideoObject so Google can show the video in search results. */
/** Self-hosted 95-second product demo (public/video). */
export const DEMO_VIDEO = {
  src: "/video/proofmyai-demo-2026-10.mp4",
  webm: "/video/proofmyai-demo-2026-10.webm",
  poster: "/video/proofmyai-demo-2026-10-poster.jpg",
  title: "Is your AI chatbot lying to your customers? ProofMyAI in 95 seconds",
  description: "See how ProofMyAI checks every chatbot answer and shows the fix, monitors AI agents, n8n, Make, Google Sheets and CRMs like HubSpot and Salesforce, shows where your AI can decide alone in the trust report, lets you approve risky agent actions with one click, and alerts you on WhatsApp, Slack or email.",
  duration: "PT1M35S",
  uploadDate: "2026-10-19",
};

export function demoVideoJsonLd() {
  return {
    "@type": "VideoObject",
    name: DEMO_VIDEO.title,
    description: DEMO_VIDEO.description,
    thumbnailUrl: [`${SITE_URL}${DEMO_VIDEO.poster}`],
    uploadDate: DEMO_VIDEO.uploadDate,
    duration: DEMO_VIDEO.duration,
    contentUrl: `${SITE_URL}${DEMO_VIDEO.src}`,
  };
}

export function videoJsonLd(v: Video) {
  return {
    "@type": "VideoObject",
    name: v.title,
    description: v.description,
    thumbnailUrl: [`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`],
    uploadDate: v.uploadDate,
    duration: v.duration,
    embedUrl: `https://www.youtube.com/embed/${v.id}`,
    contentUrl: `https://www.youtube.com/watch?v=${v.id}`,
  };
}
