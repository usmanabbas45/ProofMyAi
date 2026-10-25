/** Public changelog. Add a new entry at the top when you ship something customers will notice. */
export interface Release {
  date: string; // YYYY-MM-DD
  title: string;
  tag: "New" | "Improved" | "Fixed";
  items: string[];
}

export const RELEASES: Release[] = [
  {
    date: "2026-10-25", title: "Client reports that send themselves", tag: "New",
    items: [
      "📬 On the Proof of value page, add your client's email addresses and pick weekly (every Monday) or monthly (on the 1st). ProofMyAI emails them the report automatically: what was blocked, caught and fixed, with a link to the full report.",
      "🏷️ The email carries your agency's name, not ProofMyAI's, and your client's replies come straight to you.",
      "🧪 \"Send me a test first\" shows you exactly what your client will receive.",
    ],
  },
  {
    date: "2026-10-24", title: "Proof of value: a client report in their own numbers", tag: "New",
    items: [
      "🏆 New \"Proof of value\" page: wrong replies blocked before reaching a customer, replies held for a person, risky AI actions stopped (and what they were worth), silent failures caught, problems fixed and how fast, all compared with the period before.",
      "🔗 Send it to a client as a read-only link with your agency's name on it, or save it as a PDF. Pick the last 30 days or any recent month.",
      "📏 Every number is a count of real events. Nothing is estimated.",
    ],
  },
  {
    date: "2026-10-23", title: "Free n8n Workflow Checker", tag: "New",
    items: [
      "🧩 New check (suggested by a reader): AI steps whose output is used without a Structured Output Parser or a check node, the \"200 OK but broken JSON\" gap that no retry catches.",
      "🔍 Paste any n8n workflow at /tools/n8n-workflow-checker and get a risk score in seconds: API keys pasted in nodes, webhooks anyone can call, errors that pass as success, missing retries, no error workflow, unchecked empty results and pinned test data, each with the exact fix.",
      "🔒 It runs entirely in your browser. The workflow is never uploaded or stored, and there's no sign-up.",
      "🛡️ Saved keys and 2FA now survive a full secret-key rotation, after our hosting provider's security incident on 21 October.",
    ],
  },
  {
    date: "2026-10-21", title: "Watch for anything, in your own words", tag: "New",
    items: [
      "🔔 Every feature page (chatbot, AI agents, n8n & Make, approvals, CRM, Google Sheets, uptime) now has a \"Watch for…\" box. Write what to watch and when to be told, e.g. \"Alert me if the Order sync workflow runs fewer than 10 times a day\" or \"Tell me when an agent run costs more than $1\".",
      "🧠 ProofMyAI turns your sentence into a precise rule, shows exactly how it understood it, and tells you how many times it would have alerted in the last 7 days, before it starts watching.",
      "⚡ Watches are checked as soon as new data arrives and every 15 minutes, so \"fewer than…\" and \"hasn't run for…\" watches fire even when nothing arrives. Alerts go to your WhatsApp, Slack, email or other channels and close by themselves when things are back to normal.",
    ],
  },
  {
    date: "2026-10-21", title: "Traces, failure simulator, retrieval diagnosis and custom AI checks", tag: "New",
    items: [
      "🔗 End-to-end traces: send the same trace_id with your chatbot, agent, workflow, approval and result-check calls, and see the whole request on one timeline with the first failing step highlighted (Live tracking → Traces).",
      "🧪 Simulate a failure: one click sends a realistic broken event (a workflow that returns 0 items, an agent stuck in a loop, a bot claiming to be human) through the real checks, so you see exactly what's detected and how the alert arrives.",
      "🔎 RAG bots: send the chunks your bot retrieved, and every wrong answer is labelled a retrieval problem (the right fact wasn't fetched), a generation problem (it was fetched and ignored) or missing documentation.",
      "🧠 Custom AI checks: write your own checks in plain English (e.g. \"pricing answers must mention the free trial\") and the AI checker applies them to every answer.",
      "✋ Approval guarantees, each covered by an automated test: duplicate and simultaneous requests become one, rejected actions stay blocked on every retry, expired requests can never be approved, decisions survive a failed callback.",
      "💾 Every daily backup is now restored into a scratch database and checked automatically; the result and a 30-day incident history are on the status page.",
      "📏 Benchmark v2: 28 harder cases (subtle details, half-right answers, multi-turn contradictions, trick questions) added to the public benchmark.",
    ],
  },
  {
    date: "2026-10-20", title: "Evidence on every verdict, CI tests and OpenTelemetry", tag: "New",
    items: [
      "📄 Every checked answer now shows the exact sentence from your help docs behind the verdict. A quote is only kept if it really appears in your docs, so the evidence is never made up. Also in the CSV export and the /check API.",
      "🧪 POST /api/v1/test-runs: run your chatbot tests from GitHub Actions or any CI against a preview URL, and fail the build when an answer breaks.",
      "📡 OpenTelemetry: point an OTLP exporter at ProofMyAI and every agent trace (LangChain, CrewAI, OpenAI Agents, LlamaIndex…) becomes a checked agent run with step timing, tokens and errors.",
      "📏 Public accuracy benchmark: how many wrong answers ProofMyAI catches and how many false alarms it raises, on a labelled dataset you can download and rerun (/benchmark).",
      "📶 Live tracking shows how fresh each connection is: live (instant) or scheduled, last data, last and next check, and an alert when a scheduled check is overdue.",
      "🧪 Add to tests: turn any real customer question into a nightly/CI test in one click, with the fact from your help docs as the expected answer.",
      "🛠️ Fewer false alarms: \"Can I speak to a real person?\" followed by a hand-over is no longer flagged by the AI-disclosure check, and basic mode now spots a wrong number for the topic (e.g. £30 instead of £50).",
    ],
  },
  {
    date: "2026-10-19", title: "Grok support, live demo video and new screenshots", tag: "New",
    items: [
      "✖️ Grok (xAI) chatbots: Connect → Grok has ready-made JavaScript and Python examples and a nightly-test recipe. Bots on ChatGPT, Claude, Gemini or Llama connect the same way.",
      "🎥 New live demo video: watch a wrong answer get flagged, the WhatsApp and Slack alert arrive, a reply blocked before sending, a refund approved with one click, CRM duplicates caught and a missed job alerted.",
      "📊 The Overview now shows your AI trust score, approvals waiting, CRM and Sheets & heartbeats status at a glance.",
    ],
  },
  {
    date: "2026-10-18", title: "CRM monitoring", tag: "New",
    items: [
      "🗂️ Connect HubSpot, Salesforce, Pipedrive, Zoho CRM, GoHighLevel, Freshsales, Close, ActiveCampaign or Dynamics 365 (read-only), or any other CRM through n8n, Make or Zapier.",
      "Alerts when new leads stop arriving, new records miss an email/phone or owner, duplicates appear, hundreds of records change at once, or leads aren't contacted in time.",
      "Privacy first: only hashes and filled/empty flags are stored, never names, emails or phone numbers.",
    ],
  },
  {
    date: "2026-10-18", title: "Verify results, heartbeats, regression alerts and AI disclosure", tag: "New",
    items: [
      "🔎 Verify results: when an agent or workflow says it's done, ProofMyAI checks the real system (the CRM record, the order) and alerts if the result isn't there.",
      "💓 Heartbeats: a URL your scheduled jobs call when they finish. Get an alert when a job never ran, the failure no error handler sees.",
      "📉 Regression alerts: chatbot accuracy or agent scores dropping after a model, prompt or help-doc change, and agents that stop calling a tool or whose tool starts failing.",
      "🇪🇺 EU AI Act check: flags replies where the bot claims to be human or dodges \"am I talking to a person?\" (Article 50, in force since 2 August 2026).",
    ],
  },
  {
    date: "2026-10-18", title: "AI trust report and pre-send check", tag: "New",
    items: [
      "🛡️ New Trust report: topic by topic, see where your AI can decide alone, where to spot-check and where a person must approve, backed by proven accuracy (95% confidence), not guesses.",
      "✋ Who checks the checker: see how often your team agrees with ProofMyAI's verdicts.",
      "🛑 POST /api/v1/check: get allow, review or block before your chatbot sends a reply or your agent acts, so customers never see a made-up answer.",
      "✋ Approvals: agents prepare the action, a person approves what matters with one click (money, customer messages, anything irreversible, first-time categories, promises). Rejected actions stay blocked on retry, decisions become rules, and every decision is logged with who, when and why.",
    ],
  },
  {
    date: "2026-10-18", title: "Catch every automation failure", tag: "New",
    items: [
      "🔌 Alert when ProofMyAI can't reach your n8n or Make (expired API key, server down), so monitoring never silently stops.",
      "⏸️ Each workflow's own rhythm is learned automatically: get alerted when one workflow stops running, even while others keep going, without false alarms for normal nights and weekends.",
      "⏳ Stuck runs: executions still \"running\" long after they should have finished. 🔴 Workflows switched off in n8n or Make, and new Make incomplete executions.",
      "⚠️ Runs that finish with warnings (errors swallowed), items that went in but didn't come out, and output far below or far above normal (partial data, loops, duplicates).",
      "🧠 Empty runs are judged against each workflow's history, and you can send input_items to separate a quiet day from a broken workflow.",
      "📗 Google Sheets: freshness check on a date column, alerts when a column is removed or renamed, and when duplicate rows suddenly appear.",
    ],
  },
  {
    date: "2026-10-04", title: "Chatbot analytics", tag: "New",
    items: [
      "📈 New Analytics page: conversations, answer accuracy, resolution rate, how often customers needed a human, response times and trends over 7, 30 or 90 days.",
      "🗂️ Topics: see what customers ask about most and how well your bot handles each topic.",
      "👍👎 Customer feedback: send thumbs up/down or star ratings to /api/v1/feedback and see satisfaction overall and per topic.",
      "❓ A list of questions your help docs don't answer yet, with one click to Fix with AI.",
    ],
  },
  {
    date: "2026-10-03", title: "Auto test generator", tag: "New",
    items: [
      "✨ On the Chatbot tests page, AI now writes test questions for you from your help articles, your rules and the questions your bot already got wrong, including prompt-injection and “talk to a human” checks.",
      "Review the suggestions and add them in one click. Paid plans get fresh suggestions every week when something changes.",
    ],
  },
  {
    date: "2026-10-03", title: "Invite & earn: give a month, get a month", tag: "New",
    items: ["Share your invite link from the new 🎁 Invite & earn page. When a friend becomes a paying customer, you both get your next month free."],
  },
  {
    date: "2026-10-03", title: "Yearly plans: 2 months free", tag: "New",
    items: [
      "Pay yearly and get 12 months for the price of 10. Switch between monthly and yearly any time on the Billing page; you only pay the difference.",
      "Clear prices before checkout: yearly plans show the full yearly amount, and every trial shows what you'll pay when it ends.",
      "Reminder emails 3 days before a free trial ends and 30 days before a yearly plan renews.",
    ],
  },
  {
    date: "2026-10-03", title: "Try ProofMyAI with demo data", tag: "New",
    items: [
      "✨ Try with demo data: open a sample online-shop project with audits, safety findings, a Fix with AI result, agent runs, workflow failures and uptime, before connecting anything.",
      "New accounts get three short getting-started emails (one-click unsubscribe). They stop as soon as you connect something.",
    ],
  },
  {
    date: "2026-10-03", title: "Email confirmation and daily backups", tag: "Improved",
    items: [
      "New accounts confirm their email address with one click, so alerts always reach a real inbox. Until then, alerts to other addresses and team invitations are paused.",
      "Your data is now backed up automatically every day, encrypted, with copies kept off the server.",
    ],
  },
  {
    date: "2026-10-03", title: "Fix with AI", tag: "New",
    items: [
      "Every fix-list item now has a ✨ Fix with AI button that writes the corrected help article from the real wrong answers, ready to paste into your bot.",
      "Save the corrected article to your ProofMyAI knowledge base in one click, so future checks use it.",
      "🛡️ Safe system prompt: a ready-to-paste prompt for your bot with prompt-injection protection, no made-up prices, human hand-over and language rules, built from what ProofMyAI found.",
    ],
  },
  {
    date: "2026-10-03", title: "Safety checks, uptime monitoring, team access and Intercom", tag: "New",
    items: [
      "Every answer is now checked for prompt-injection and jailbreak attempts, leaked system prompts, exposed card or bank numbers, rude replies and replies in the wrong language.",
      "Uptime & speed: add any chatbot, website or API URL and get an alert when it goes down, gets slow or comes back.",
      "Team: invite teammates or clients as viewers or editors. Viewers never see your API key.",
      "Intercom (Fin): connect with an access token and every bot reply is checked automatically, with no n8n or Make needed.",
    ],
  },
  {
    date: "2026-10-02", title: "One place to connect everything", tag: "New",
    items: [
      "New Connect page: pick your chatbot, AI agent or workflow tool and follow 3 numbered steps with copy buttons.",
      "A live status box turns green the moment your first data arrives, so you know it worked.",
      "New projects start with a simple “Connect your first AI” panel.",
    ],
  },
  {
    date: "2026-09-30", title: "Two-factor login, CAPTCHA and stronger passwords", tag: "New",
    items: [
      "Turn on two-factor authentication in Account with any authenticator app, with 10 one-time recovery codes.",
      "Sign-up, login and password reset are protected by a CAPTCHA that runs automatically in your browser.",
      "New passwords must be strong and are checked against known data breaches.",
      "You get an email when your account signs in from a new device, or when your password or 2FA changes.",
    ],
  },
  {
    date: "2026-09-30", title: "WhatsApp bot live monitoring", tag: "New",
    items: [
      "WAHA users can monitor every real WhatsApp conversation by adding one webhook, with reply-time and missing-reply alerts.",
      "Customer phone numbers used as chat ids are now replaced with anonymous codes.",
    ],
  },
  {
    date: "2026-09-30", title: "Guides for AI chatbot and automation quality", tag: "New",
    items: [
      "New guides: testing chatbot accuracy, catching hallucinations, monitoring n8n, Make and AI agents, and a chatbot QA checklist.",
      "An llms.txt summary so AI assistants describe ProofMyAI accurately.",
    ],
  },
  {
    date: "2026-09-30", title: "Your must-say rules count as approved information", tag: "Improved",
    items: [
      "Statements your \"must include\" rules require (for example \"Prices include VAT\") are now treated as approved company information, so a bot that follows your rule is never marked \"not in docs\" for it.",
      "The Privacy Policy and Trust Center now name only the AI provider actually in use.",
    ],
  },
  {
    date: "2026-09-30", title: "Stronger account protection and fair-use monitoring", tag: "Improved",
    items: [
      "Behind the scenes: AI usage is now tracked per account, which keeps plans affordable and lets us spot abuse quickly.",
      "Abusive or fake sign-ups can be blocked by email or domain, so spam accounts can't come back.",
    ],
  },
  {
    date: "2026-09-30", title: "AI checks now run on Claude Opus 5.5", tag: "Improved",
    items: ["Chatbot answers, agent runs and bot tests are graded by Anthropic's newest Opus model by default."],
  },
  {
    date: "2026-09-29", title: "Must-say rules and faster missing-reply alerts", tag: "Fixed",
    items: [
      "\"When a topic comes up, the answer must include\" rules now understand alternatives (\"pricing or plans\"), word forms and everyday wording, and are checked on every answer, even when the AI already flagged it for something else.",
      "Missing-reply alerts are now checked every minute, so you hear about an unanswered customer about a minute after your reply-time limit.",
    ],
  },
  {
    date: "2026-09-29", title: "Redesigned emails and instant founding offer", tag: "Improved",
    items: [
      "Every email (alerts, weekly summary, password reset, support replies) has a new clear, branded design with the key facts at a glance and a one-click button.",
      "Support tickets now get an instant confirmation email.",
      "Founding customers can claim their free Growth plan in one click. It starts right away and ends automatically, with a reminder a week before.",
    ],
  },
  {
    date: "2026-09-29", title: "Docs, status page, cookie choices and customer stories", tag: "New",
    items: [
      "Public docs and API reference at /docs.",
      "Live status page at /status showing the app, database, background checks, email and AI checking.",
      "Cookie banner: Google Analytics only loads after you accept, and you can change your choice any time.",
      "Customers can now share feedback from the dashboard. Approved stories appear on the homepage.",
    ],
  },
  {
    date: "2026-09-29", title: "Support center", tag: "New",
    items: [
      "Report an issue from /support or from Help & support in the dashboard, and track every ticket and reply.",
      "WhatsApp support button on every public page.",
    ],
  },
  {
    date: "2026-09-28", title: "Auto-renew switch", tag: "Improved",
    items: ["Turn auto-renew on or off from Plan & billing. It stays on by default, and turning it off keeps your plan until the end of the paid period."],
  },
  {
    date: "2026-09-28", title: "Smarter conversation checks and alert channels", tag: "New",
    items: [
      "Catches customers re-asking the same question, restarting the chat, fallback replies and contradictions.",
      "Missing-reply alerts when a customer writes and the bot never answers.",
      "Read-only Twilio connector for SMS and WhatsApp bots.",
      "\"Must say\" rules: require facts or disclaimers whenever a topic comes up.",
      "Notification channels (email, Slack, Microsoft Teams, Discord, Telegram, webhook) with severity and module filters.",
      "Latency, cost and error tracking for every bot reply.",
      "A free plan (50 conversations a month) and a Compliance plan for regulated businesses.",
    ],
  },
  {
    date: "2026-09-28", title: "Trust and privacy controls", tag: "New",
    items: [
      "Trust Center, Data Processing Agreement (GDPR) and About page.",
      "Per-project retention with auto-delete, results-only storage and an AI-off switch.",
      "Stronger masking: UK postcodes, number plates, names and your own custom words.",
    ],
  },
  {
    date: "2026-09-28", title: "Plans and billing", tag: "New",
    items: [
      "Paid plans with a 14-day free trial and a 14-day money-back guarantee, handled by Paddle.",
      "Manage your card, invoices and cancellation from the billing page.",
    ],
  },
  {
    date: "2026-09-27", title: "Accounts and client reports", tag: "Improved",
    items: [
      "Forgot password, account settings and one-click account deletion.",
      "Custom rules, frustration detection and white-label client reports (share link + PDF).",
      "Google Gemini available as an alternative AI checker.",
    ],
  },
  {
    date: "2026-09-27", title: "Live tracking", tag: "New",
    items: ["Watch every chatbot answer, agent run and workflow checked in real time with a clear working / problem feed."],
  },
  {
    date: "2026-09-27", title: "ProofMyAI launches", tag: "New",
    items: [
      "Chatbot audits against your own help articles, nightly bot tests, AI agent monitoring and n8n/Make monitoring.",
      "Fix list grouped by the help article that caused each problem.",
      "Neural risk model that learns from your own feedback.",
    ],
  },
];
