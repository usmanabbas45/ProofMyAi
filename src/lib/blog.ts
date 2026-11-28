/**
 * Blog guides. Written answer-first (the first paragraph answers the title's question directly) so search
 * engines can use it as a snippet and AI answer engines can quote it. Body uses the Markdown subset in
 * components/prose.tsx. Add new posts at the top.
 */
export interface Post {
  slug: string;
  title: string;
  /** Shorter title for Google (about 60 characters) when the headline is longer. */
  seoTitle?: string;
  description: string;
  date: string;
  updated?: string;
  readMins: number;
  tags: string[];
  /** One- or two-sentence direct answer shown first and used in llms.txt. */
  answer: string;
  body: string;
  takeaways: string[];
  faqs: { q: string; a: string }[];
  cta: { text: string; href: string };
}

export const POSTS: Post[] = [
  {
    slug: "n8n-workflow-risks-study",
    title: "We Scanned 375 Public n8n Workflows: 29% Have Open Webhooks, 96% Have No Retries",
    seoTitle: "375 n8n Workflows Scanned: The Most Common Silent Failure Risks",
    description: "What a scan of 375 publicly shared n8n workflows found: open webhooks, API calls with no retry, no empty-result checks, pinned test data and pasted API keys. With the fix for each.",
    date: "2026-11-28",
    readMins: 5,
    tags: ["n8n", "Research", "Workflow monitoring"],
    answer: "In a scan of 375 publicly shared n8n workflows, 96% had API or AI calls with no retry, 29% had webhooks anyone could call, 22% never checked for empty results, 11% still contained pinned test data, and 5 had real-looking API keys pasted into nodes. None of these show up as errors in n8n, which is why they fail silently.",
    body: `
## What we scanned

We ran 375 n8n workflows that people share publicly (templates and community examples) through the free [n8n Workflow Checker](/tools/n8n-workflow-checker). It reads the workflow JSON only: it doesn't run anything or connect to any service. These are shared workflows, not production systems, so treat the numbers as patterns rather than a census, but they're the patterns people copy into production.

## The results

| Risk | Share of workflows | Why it fails silently |
|---|---|---|
| API or AI calls with no retry | 96% | One timeout or rate limit and the run fails, or worse, continues with nothing |
| Webhooks with no authentication | 29% | Anyone who finds the URL can trigger it: fake leads, spam orders, an AI bill |
| No check for empty results | 22% | The run "succeeds" with 0 items, so nothing alerts |
| Pinned test data left in | 11% | Old sample data, sometimes with real emails, ships with the workflow |
| Real-looking API keys pasted into nodes | 5 workflows | Anyone who sees the workflow JSON gets the key |

## Why none of this shows as an error

n8n marks a run as failed when a node throws an error. Every risk above can produce a run that ends as **success**: a webhook that processed a spam request, an HTTP node set to "never error", or a step that returned zero rows. That's what a silent failure is: the dashboard is green and the work didn't happen.

## How to fix each one

- **No retry:** open the node → Settings → turn on **Retry On Fail** (3 tries, a few seconds apart) for HTTP Request and AI nodes. Then watch how often it retries: a step that needs retries every day is flaky and will fail for real.
- **Open webhook:** set **Authentication** on the Webhook node to Header Auth and send that header from the app that calls it.
- **Empty results:** add an IF node after the fetch: "number of items is 0" → alert, instead of continuing quietly.
- **Pinned data:** unpin all data before activating (right-click the node → Unpin).
- **Pasted keys:** move every key into an n8n Credential, then rotate the exposed key, because it has already been shared.

## Checking the design isn't enough

A scan checks how a workflow is built. It can't see a run that "succeeds" with 0 items at 3am, a trigger that quietly stopped firing, or an API key that expires next week. For that you need monitoring from outside the workflow: [n8n workflow monitoring](/solutions/n8n-workflow-monitoring) watches every execution and alerts you on failures, silent failures and workflows that stop running.
`,
    takeaways: [
      "96% of the scanned workflows called APIs or AI models with no retry",
      "29% had webhooks with no authentication",
      "22% never checked for empty results, the most common cause of silent failures",
      "None of these risks show up as errors in n8n",
      "Scan the design for free, and monitor the runs for what a scan can't see",
    ],
    faqs: [
      { q: "What is the most common risk in n8n workflows?", a: "API and AI calls with no retry: 96% of the 375 public workflows we scanned had at least one. A single timeout or rate limit then stops the run or lets it continue with nothing." },
      { q: "How do I check my own n8n workflow for these risks?", a: "Paste it into the free n8n Workflow Checker at proofmyai.com/tools/n8n-workflow-checker. It runs in your browser, nothing is uploaded, and every problem comes with the fix." },
      { q: "What is a silent failure in n8n?", a: "A run that n8n marks as successful but that didn't do its job, for example it processed 0 items, handled a spam webhook or swallowed an error. No error alert fires, so it goes unnoticed until someone asks why a lead or order is missing." },
      { q: "How were the 375 workflows chosen?", a: "They are publicly shared n8n workflows (templates and community examples). They aren't production systems, so the numbers show common patterns rather than how every company's workflows look." },
    ],
    cta: { text: "Scan your n8n workflow free →", href: "/tools/n8n-workflow-checker" },
  },
  {
    slug: "catch-live-ai-chatbot-agent-workflow-errors",
    title: "Best Tools to Catch Live Errors in AI Chatbots, Agents and Workflows (2026)",
    seoTitle: "Best Tools to Catch Live AI Chatbot, Agent & Workflow Errors",
    description: "An honest guide to tools that catch live errors in AI chatbots, AI agents and n8n/Make workflows: Langfuse, LangSmith, Braintrust, Helicone, n8n error workflows and ProofMyAI. Who each is for.",
    date: "2026-10-20",
    readMins: 7,
    tags: ["AI monitoring", "AI agents", "n8n"],
    answer: "No single tool catches every kind of AI failure. Developer observability tools (Langfuse, LangSmith, Braintrust, Helicone) trace model calls, costs and evaluations inside your own code. n8n and Make error workflows catch failed executions. ProofMyAI is the no-code option that checks whether live chatbot answers match your own help docs, watches AI agents, n8n/Make, Google Sheets and CRMs for failures and silent failures, and alerts you on WhatsApp, Slack or email. Most teams combine a developer tool with live business monitoring.",
    body: `
## Three kinds of live AI errors

Before choosing a tool, separate the problems, because each tool sees a different one:

- **Technical errors:** an API call failed, a tool timed out, a model returned an error, costs spiked. Logs and traces catch these.
- **Wrong answers:** everything ran fine, but the chatbot promised a refund your policy doesn't allow, or an agent made up an order status. Only a check against your own docs and rules catches these.
- **Silent failures:** a workflow reports "success" but did nothing. Zero orders synced, a Google Sheet stopped updating, leads stopped reaching the CRM, a nightly job never ran. No error is ever thrown.

## The options

| Tool | Best for | Catches wrong answers vs your docs | Watches workflows, sheets, CRMs | Needs code |
|---|---|---|---|---|
| Langfuse | Open-source tracing for your own LLM app | With custom evaluators | No | Yes |
| LangSmith | Debugging LangChain / LangGraph agents | With custom evaluators | No | Yes |
| Braintrust | Evals and experiments for AI product teams | With custom scorers | No | Yes |
| Helicone | Request logging, cost and caching gateway | No | No | Small change |
| n8n / Make error workflows | Alerts when an execution fails | No | Failed runs only | No |
| ProofMyAI | Live checks for the business running the AI | Built in, with evidence quotes | Yes, incl. silent failures | No (API and OpenTelemetry optional) |

### Langfuse

Open-source LLM observability: nested traces of every model and tool call, cost and latency, prompt management and evaluations. Ideal when engineers instrument their own app. See [ProofMyAI vs Langfuse](/compare/langfuse-alternative).

### LangSmith

LangChain's platform for tracing, debugging and evaluating agents, with datasets and evaluators. The natural choice if you build with LangChain or LangGraph. See [ProofMyAI vs LangSmith](/compare/langsmith-alternative).

### Braintrust

An evaluation and observability platform for teams building AI products: experiments, prompt comparisons, scored production logs. Strong for iterating on prompts and models. See [ProofMyAI vs Braintrust](/compare/braintrust-alternative).

### Helicone

An open-source gateway in front of your model provider that logs every request with cost and latency, plus caching and rate limits. Great for cost control; it doesn't judge whether answers are right. See [ProofMyAI vs Helicone](/compare/helicone-alternative).

### n8n and Make error workflows

Free and built in: an Error Trigger (n8n) or error handler (Make) can post to Slack or email when an execution fails. They don't notice a run that "succeeded" with zero items, a workflow that stopped running, or a wrong AI answer inside the flow.

### ProofMyAI

Built for the business running the AI rather than the engineer building it:

- every live chatbot answer checked against your help docs and rules, with the **exact sentence from your docs** as evidence;
- a **pre-send check** that blocks a wrong reply before the customer sees it, and **one-click approval** for risky agent actions such as refunds;
- AI agent runs with a step-by-step timeline (send them by API or point an **OpenTelemetry** exporter at ProofMyAI);
- n8n and Make failures, **silent failures**, stopped and stuck workflows; Google Sheets and CRMs (HubSpot, Salesforce, Pipedrive, Zoho, GoHighLevel) watched for missing leads, duplicates and broken data; heartbeats for scheduled jobs;
- nightly and CI regression tests, a trust report showing where your AI can decide alone, and alerts on WhatsApp, Slack, Teams or email.

It's newer than the developer platforms above and doesn't do prompt management or experiments.

## How to choose

- **You build the AI in code and need to debug it:** Langfuse or LangSmith, plus Braintrust if you run systematic evals.
- **You mainly need cost and request logs:** Helicone.
- **You run a chatbot, agent or automations for a business (or for clients) and need to know when something is wrong:** live monitoring with ProofMyAI, which you can [start free](/signup).
- **Engineering teams:** many use both: a tracing tool for debugging, and live business checks for wrong answers and silent failures.

## Test any tool before you trust it

Whatever you pick, break things on purpose before relying on it: make a workflow return zero items, expire an API key, give your bot a wrong help article, and pause a scheduled job. A good monitor alerts you on all four, says why, and tells you when it's fixed.
`,
    takeaways: [
      "Live AI errors come in three kinds: technical errors, wrong answers and silent failures",
      "Developer tools (Langfuse, LangSmith, Braintrust, Helicone) trace and evaluate your own code",
      "n8n/Make error workflows only catch runs that fail loudly",
      "ProofMyAI checks live answers against your docs and catches silent failures in workflows, sheets and CRMs, without code",
      "Test any monitor by breaking things on purpose before you rely on it",
    ],
    faqs: [
      { q: "What is the best tool to catch live AI chatbot errors?", a: "If you need to know when a live chatbot gives a wrong answer, you need answers checked against your own help docs and policies: ProofMyAI does this without code. If you build the bot yourself and need traces of every model call, add Langfuse or LangSmith." },
      { q: "How do I catch silent failures in n8n or Make?", a: "Error workflows only fire on failed executions. To catch runs that succeed but do nothing, workflows that stop running and stuck executions, use a monitor that learns each workflow's normal volume and rhythm, such as ProofMyAI." },
      { q: "Does ProofMyAI support OpenTelemetry?", a: "Yes. Point an OTLP/HTTP JSON exporter at ProofMyAI and each finished trace becomes an agent run, with LLM, tool and retrieval steps, timing, tokens and errors." },
      { q: "Can I use ProofMyAI with Langfuse or LangSmith?", a: "Yes. They solve different problems: tracing for developers, and live answer and workflow checks with alerts for the business. Many teams run both." },
    ],
    cta: { text: "Catch your first live error free", href: "/signup" },
  },
  {
    slug: "grok-chatbot-customer-support",
    title: "Building a Support Bot on Grok? How to Check Every Answer Before It Costs You",
    seoTitle: "Grok Support Bot: How to Check Every Answer",
    description: "Using xAI's Grok for a support chatbot or AI agent? The 5 mistakes to watch for, how to connect monitoring in 5 minutes, and how to block a wrong answer before customers see it.",
    date: "2026-10-19",
    readMins: 5,
    tags: ["Grok", "Chatbots", "Monitoring"],
    answer: "To run a Grok support bot safely, check every answer against your own help docs and policies, not just the model's confidence. Send each conversation to a monitor after Grok replies, add rules for promises the bot must never make, block wrong answers before sending when the risk is high, and run the same test questions every night so a model update can't silently change your bot.",
    body: `
## Why Grok bots need checking

Grok is fast, capable and built to answer directly. Those are good traits in a chatbot. But every large language model, Grok included, can sound certain about something that isn't true for *your* business. In support, that shows up as:

- **Promises you can't keep.** "Yes, sale items get a full refund." Your policy says store credit only.
- **Facts that aren't in your docs.** Delivery times, prices or opening hours the bot filled in itself.
- **The wrong tone.** A witty reply to a customer who has been charged twice.
- **Missed hand-overs.** An angry customer or a legal question the bot keeps answering instead of passing to a person.
- **Silent changes.** A new model version answers the same question differently and nobody notices for weeks.

None of these show up as an error. Your bot keeps running, and the only signal is a refund request or a bad review.

## Connect a Grok bot in 5 minutes

xAI's API is OpenAI-compatible: you call \`https://api.x.ai/v1\` with the standard OpenAI client. After you get Grok's reply, send the conversation to ProofMyAI in the background:

- **Your own code:** one fire-and-forget HTTP call with a 2-second limit, so your bot never waits or breaks. The Connect page in ProofMyAI gives you a ready-made JavaScript and Python example with your key filled in.
- **n8n, Make or Zapier:** add one HTTP step after the Grok step.
- **No code at all:** export your chats as CSV and upload them.

Your xAI key stays in your own code. ProofMyAI only sees the conversation you send.

## What gets checked

Each answer is graded against your help articles: **correct**, **made up**, **not in docs**, **off policy** or **should escalate**. Safety checks also flag leaked personal data and a bot claiming to be human. Add your own rules in plain English, for example "never promise a refund on sale items".

Wrong answers are grouped by the help article that caused them, so you fix the cause once instead of reading transcripts.

## Block a wrong answer before the customer sees it

For high-risk replies, ask ProofMyAI *before* sending. It returns **allow**, **review** or **block** in about a second. A blocked answer can be replaced with a safe hand-over message. If your Grok bot is an agent that issues refunds or sends emails, route those actions through one-click approval instead.

## Test it every night

Add 10 to 20 real customer questions and ProofMyAI asks your bot every night. You can point it at your bot's URL, or straight at xAI's chat completions endpoint with your bot's system prompt. If answers get worse after a model update, you get an alert the next morning.

[See how Grok monitoring works](/solutions/grok-chatbot-monitoring) or [start free](/signup).
`,
    takeaways: [
      "Grok, like every model, can sound sure about things that aren't true for your business",
      "Send each conversation to a monitor after Grok replies: one fire-and-forget call",
      "Check answers against your own help docs and plain-English rules",
      "Block high-risk wrong answers before sending; approve risky agent actions with one click",
      "Run the same questions nightly so a model update can't change your bot silently",
    ],
    faqs: [
      { q: "Does ProofMyAI work with Grok?", a: "Yes. It checks the question and answer, so any Grok-based bot connects with one HTTP call, an n8n/Make/Zapier step or a chat export." },
      { q: "Do I have to share my xAI API key?", a: "No. Only for optional nightly tests run directly against xAI's API, and then it's stored encrypted." },
      { q: "Will monitoring slow my bot down?", a: "No. The report is sent in the background with a 2-second limit and never blocks the reply. Only the optional pre-send check waits, about a second." },
    ],
    cta: { text: "Check your Grok bot free", href: "/signup" },
  },
  {
    slug: "crm-leads-stopped-coming-in",
    title: "Leads Stopped Coming Into Your CRM? 6 Silent Failures and How to Get Alerted",
    seoTitle: "Leads Stopped Coming Into Your CRM? Get Alerted",
    description: "Why leads silently stop reaching HubSpot, Salesforce, Pipedrive, Zoho or GoHighLevel, the 6 CRM failures that never show an error, and how to get a WhatsApp or Slack alert automatically.",
    date: "2026-10-19",
    readMins: 6,
    tags: ["CRM", "HubSpot", "Monitoring"],
    answer: "Leads usually stop reaching a CRM because an integration broke quietly: an expired Facebook Lead Ads or form connection, a changed field mapping, or an n8n/Make flow that stopped. Nothing shows an error, so watch the CRM itself: alert when no new records arrive for longer than normal, when new records miss an email or owner, when duplicates or bulk changes appear, and when new leads aren't contacted in time.",
    body: `
## Why leads stop reaching your CRM

Your CRM rarely breaks. What breaks is everything that writes into it:

- **An expired connection.** Facebook Lead Ads, Google Ads and form tools connect with a login that expires or gets revoked. Leads stop, with no error in the CRM.
- **A changed field mapping.** Someone renames a form field or a CRM property, and new leads arrive with an empty email, phone or owner.
- **A stopped automation.** An n8n or Make flow is switched off, hits a limit, or fails after an API change.
- **A double trigger.** Two automations (or a retry) create the same contact twice.
- **A runaway update.** A bulk import, a buggy workflow or an AI agent edits hundreds of records at once.
- **No follow-up.** The leads arrive, but the routing or follow-up step stopped, so nobody calls them.

## The 6 checks every CRM needs

1. **No new records for longer than normal.** Learn the normal gap between new leads (including nights and weekends) and alert when the current gap is clearly longer.
2. **Required fields filled.** Compare the share of new records missing an email/phone or owner with the usual share.
3. **Duplicates.** Flag new records whose email or phone matches an existing one.
4. **Bulk changes.** Alert when far more records change between checks than usual.
5. **Follow-up time.** Count new leads with no activity after your target time (for example 4 hours).
6. **Connection health.** Alert when the CRM can't be read, so monitoring never silently stops.

## How to set it up in ProofMyAI

1. Open **CRM** in ProofMyAI and pick your CRM: HubSpot, Salesforce, Pipedrive, Zoho CRM, GoHighLevel, Freshsales, Close, ActiveCampaign or Dynamics 365.
2. Create a **read-only** token with the steps shown and paste it. For any other CRM, send records from n8n, Make or Zapier.
3. Click **Edit checks** to choose required fields and the follow-up time.
4. Pick where alerts go: WhatsApp, Slack, Microsoft Teams, Discord, Telegram or email.

ProofMyAI checks every 15 minutes, never writes to your CRM, and stores only hashes and filled/empty flags, never names, emails or phone numbers. See [CRM monitoring](/solutions/crm-monitoring).

## Prevent it from happening again

- Use a shared integration account, not a personal login that leaves with an employee.
- Lock important CRM properties so they can't be renamed casually.
- Add an error branch to your n8n or Make lead flows, and watch them with [n8n and Make monitoring](/solutions/n8n-workflow-monitoring).
`,
    takeaways: [
      "CRMs rarely break; the forms, ad connections and automations that write into them do, and they fail without an error.",
      "Watch the CRM itself: new-record rhythm, required fields, duplicates, bulk changes, follow-up time and connection health.",
      "Read-only monitoring every 15 minutes catches a broken lead flow the same day instead of next week.",
    ],
    faqs: [
      { q: "Does CRM monitoring need write access?", a: "No. ProofMyAI uses read-only tokens and never changes your CRM." },
      { q: "Will a quiet weekend trigger a false alarm?", a: "No. ProofMyAI learns your CRM's longest normal gap, weekends included, and only alerts when the current gap is clearly longer." },
      { q: "My CRM isn't on the list. Can I still use it?", a: "Yes. Send new and updated records from n8n, Make or Zapier to ProofMyAI's /api/v1/crm-records endpoint and the same checks run." },
    ],
    cta: { text: "Watch your CRM free", href: "/signup" },
  },
  {
    slug: "google-sheets-not-updating-alerts",
    title: "Google Sheet Not Updating From n8n, Make or Zapier? How to Get an Alert Automatically",
    seoTitle: "Google Sheet Not Updating? Get an Automatic Alert",
    description: "Why Google Sheets that n8n, Make or Zapier write to stop updating, how to spot #REF! and empty columns early, and how to get a WhatsApp, Slack or email alert the moment it happens.",
    date: "2026-10-17",
    readMins: 6,
    tags: ["Google Sheets", "n8n", "Monitoring"],
    answer: "A Google Sheet fed by n8n, Make or Zapier usually stops updating because the automation failed quietly: an expired Google connection, a renamed column or tab, an API rate limit, or a workflow that was switched off. To catch it, watch the sheet itself: alert when it has had no changes for longer than normal, when cells show #REF! or #N/A, or when a key column comes in empty. ProofMyAI does this every 15 minutes with a read-only link and alerts you on WhatsApp, Slack or email.",
    body: `
## Why your automated Google Sheet stopped updating

Most "silent" sheet failures come from a handful of causes:

- **The Google connection expired.** n8n, Make and Zapier use a Google login that can expire or be revoked. The workflow then fails on the Sheets step, or never runs.
- **Someone renamed a column or a tab.** The automation writes to "Email", the sheet now says "E-mail", and the data goes nowhere or into the wrong place.
- **Rate limits.** Google Sheets limits how many requests an app can make per minute. Big batches get rejected.
- **The workflow was switched off or its trigger broke.** A webhook URL changed, a form was replaced, or a scenario ran out of operations.
- **Formulas broke.** A deleted column turns lookups into **#REF!**, and a missing value turns them into **#N/A**. The sheet updates, but the numbers are wrong.

Your workflow tool often shows an error only if you open it. The sheet just stays quiet, and you find out when a report looks wrong or a lead was never called.

## How to check it by hand

1. Open the sheet and look at the newest row. Is the time recent?
2. Press Ctrl+F and search for **#REF!**, **#N/A** and **#VALUE!**.
3. Filter your key column (for example Email) for empty cells in the latest rows.
4. Open **File → Version history** to see when the sheet last changed.
5. In n8n or Make, open the execution history and look for failed runs on the Google Sheets step.

This works, but nobody does it every hour.

## How to get an alert automatically

[ProofMyAI](/solutions/n8n-workflow-monitoring) watches the sheet itself, so it catches problems no matter which tool writes to it.

1. In Google Sheets, click **Share** and set **General access** to **Anyone with the link** (Viewer). For private data, use **File → Share → Publish to web** for just the tab you want watched.
2. In ProofMyAI, open **Google Sheets**, paste the link and choose how long the sheet may go without changes (for example 6 hours for a lead sheet, 24 hours for a daily report).
3. Optionally name a column that must never be empty, such as Email or Order ID.
4. Choose where alerts go: WhatsApp, Slack, Microsoft Teams, Discord, Telegram or email.

Every 15 minutes ProofMyAI reads the sheet and alerts you when:

- it has had **no changes** for longer than your limit,
- cells show **#REF!, #N/A, #VALUE!, #DIV/0!** or other errors (with the cell address),
- your required column is **empty** in recent rows, or the column disappeared,
- **most rows vanish** at once (the sheet was cleared or overwritten).

It also tells you when the problem is fixed. ProofMyAI only reads the sheet and never changes it.

## Prevent it from happening again

- Lock the header row (**Data → Protect sheets and ranges**) so columns can't be renamed by accident.
- Add an error branch in n8n or Make that notifies you when the Sheets step fails.
- Reconnect Google accounts in your automation tool before they expire, and use a shared account rather than a personal one.
- Watch the workflow too: ProofMyAI's [n8n and Make monitoring](/solutions/n8n-workflow-monitoring) alerts on failed and silently skipped runs.
`,
    takeaways: [
      "Automated sheets usually stop updating because of an expired Google connection, a renamed column or tab, rate limits or a switched-off workflow.",
      "Watch the sheet itself: time since the last change, error cells, and empty required columns.",
      "A read-only link is enough to check a sheet every 15 minutes and alert on WhatsApp, Slack or email.",
      "Protect the header row and add an error branch in your workflow to prevent repeats.",
    ],
    faqs: [
      { q: "Does ProofMyAI need edit access to my Google Sheet?", a: "No. A view-only link or a published tab is enough, and ProofMyAI never writes to the sheet." },
      { q: "My sheet is private. Can I still watch it?", a: "Yes. Use File → Share → Publish to web for just the tab you want watched, as CSV, and paste that link. Only that tab is shared, not the whole file." },
      { q: "How quickly will I be alerted?", a: "Sheets are checked every 15 minutes. Error cells and empty required columns are reported on the next check; a stopped sheet is reported once it has gone longer than the limit you set without changes." },
    ],
    cta: { text: "Watch your first Google Sheet for free", href: "/signup" },
  },
  {
    slug: "intercom-fin-accuracy-monitoring",
    title: "How to Check Intercom Fin's Answers for Accuracy (Without Reading Every Chat)",
    seoTitle: "How to Check Intercom Fin Answer Accuracy (2026)",
    description: "Intercom Fin answers from your help center, but outdated articles and gaps still produce wrong answers. How to check every Fin reply against your own policies, find the article to fix, and get alerts.",
    date: "2026-10-16",
    readMins: 7,
    tags: ["Intercom", "AI chatbots", "Accuracy"],
    answer: "To check Intercom Fin's answers for accuracy, compare every Fin reply with the help center articles and policies it should follow, label each one (correct, not in the docs, made up, should have gone to a human) and fix the article behind each wrong answer. You can do it by sampling conversations by hand, or connect Intercom read-only to a monitoring tool such as ProofMyAI, which grades every Fin reply automatically and alerts you when one is wrong.",
    body: `
## Why Fin still gets answers wrong

Fin builds its answers from your help center and other content you give it. That makes it far more reliable than a bot with no sources, but it does not make it right every time. The common causes of wrong answers are:

- **Outdated articles.** You changed the returns window from 30 to 14 days, but one article still says 30. Fin quotes it.
- **Conflicting articles.** Two articles say different things about the same policy, and Fin picks one.
- **Gaps.** The customer asks something your docs never cover, and Fin answers from the closest article it can find.
- **Missed hand-offs.** An angry customer or a refund dispute should go to a person, and the conversation stays with the bot.

Intercom's own reports focus on resolutions and customer satisfaction. They tell you **how many** conversations Fin handled, not whether a specific answer matched your policy. A conversation can count as resolved even though the customer left with the wrong refund rule.

## Option 1: Check Fin by hand (free, slow)

1. In Intercom, open the Inbox and filter to conversations Fin handled in the last week.
2. Pick 30 to 50 conversations at random, plus every conversation with a bad rating.
3. For each Fin reply, find the help article it should be based on and compare. Label it: **correct**, **not in the docs**, **made up** (contradicts the docs), **should have gone to a human**, or **off policy** (promises you never make).
4. Group the wrong answers by help article. The articles with the most wrong answers are the ones to fix first.
5. Repeat every week, and after every change to your help center.

This works, but it covers only a sample, and it takes a few hours each week.

## Option 2: Check every Fin reply automatically

[ProofMyAI](/solutions/ai-chatbot-monitoring) connects to Intercom **read-only**. Every 15 minutes it reads new conversations, grades each Fin reply against your own help articles, and ignores replies written by your human team. Nothing is ever written back to Intercom.

1. **Create an Intercom access token.** In Intercom, go to Settings, open the Developer Hub, create an app for your workspace and copy its access token from the Authentication page.
2. **Add your help center to ProofMyAI.** Paste your help center address and ProofMyAI imports the articles, so it knows what the right answers are.
3. **Connect Intercom.** In ProofMyAI, open **Connect**, choose **Intercom (Fin)**, choose your data region (US, EU or Australia) and paste the token.
4. **Turn on alerts.** Choose WhatsApp, Slack, Microsoft Teams or email for high-risk answers, such as a made-up refund or price.

From then on, each Fin reply gets a verdict and a plain-English reason. The fix list groups wrong answers by the help article that caused them, and **Fix with AI** drafts the corrected article for you to paste into Intercom.

## What to fix first

- **Money topics:** refunds, prices, discounts, cancellation fees.
- **Legal and safety topics:** warranties, data requests, medical or safety questions.
- **High-volume topics:** delivery times, opening hours, account access.

One corrected article usually fixes many wrong answers at once.

## Keep it accurate over time

- Re-check after every help center change.
- Add a test question each time a customer finds a wrong answer, and run the test set every night.
- Review the "not in the docs" list monthly. Those are the articles you still need to write.
`,
    takeaways: [
      "Fin answers from your help center, so outdated, conflicting or missing articles cause most wrong answers.",
      "Resolution rate does not tell you whether an answer matched your policy; you need to grade the answers themselves.",
      "Group wrong answers by help article and fix the article, not the single conversation.",
      "A read-only connection can grade every Fin reply automatically and alert you to high-risk mistakes.",
    ],
    faqs: [
      { q: "Does connecting ProofMyAI change anything in Intercom?", a: "No. The connection is read-only. ProofMyAI reads conversations to grade Fin's replies and never sends messages, edits articles or changes settings in Intercom." },
      { q: "Are my human agents' replies graded too?", a: "No. Only bot replies are graded. Replies written by your team are skipped." },
      { q: "Can I try it without connecting Intercom?", a: "Yes. Export a set of conversations as CSV and upload them in Chatbot audits, or paste one question and answer into the free AI chatbot checker." },
    ],
    cta: { text: "Check your Intercom Fin answers for free", href: "/free-audit" },
  },
  {
    slug: "ai-chatbot-testing-tools",
    title: "AI Chatbot Testing Tools: 6 Options Compared for 2026",
    seoTitle: "AI Chatbot Testing Tools: 6 Options Compared (2026)",
    description: "The main ways to test an AI chatbot in 2026, from scripted test frameworks to LLM evaluation and observability platforms to no-code accuracy monitoring, and how to choose the right one.",
    date: "2026-10-16",
    readMins: 8,
    tags: ["AI chatbots", "Testing", "Tools"],
    answer: "AI chatbot testing tools fall into three groups: scripted conversation testing frameworks (such as Botium, now part of Cyara), developer tools for LLM evaluation and observability (such as Promptfoo, Langfuse and LangSmith), and no-code accuracy monitoring that grades live answers against your own help docs (such as ProofMyAI). Developers building their own LLM app usually pick the second group; support and operations teams running a bot like Intercom Fin, Zendesk AI or Tidio usually need the third.",
    body: `
## What you actually need to test

Before picking a tool, decide what "working" means for your bot. For a customer-facing AI chatbot it usually means:

- **Accuracy:** answers match your own help articles and policies.
- **Safety:** no made-up promises, no leaked data, no unsafe advice.
- **Hand-off:** the bot passes angry customers and disputes to a person.
- **Regression:** an answer that was right last week is still right after a change.
- **Live quality:** real customers ask questions your test set never covered.

Most tools are strong at one or two of these. The table below shows where each fits.

## The 6 options

| Tool | Type | Best for | Needs code? |
|---|---|---|---|
| Spreadsheet + manual review | Manual | First audit, very small bots | No |
| Botium / Cyara | Scripted conversation testing | Enterprise teams with test scripts and voice/IVR | Some setup |
| Promptfoo | Open-source LLM evaluation | Developers testing prompts and models before release | Yes |
| Langfuse | Open-source LLM observability | Developers tracing their own LLM app | Yes |
| LangSmith | LLM tracing and evaluation | Teams building with LangChain or LangGraph | Yes |
| ProofMyAI | No-code accuracy monitoring | Support teams running Fin, Zendesk AI, Tidio, WhatsApp or custom bots | No |

### 1. Spreadsheet and manual review

List 30 to 50 real customer questions with the facts a correct answer must contain, ask the bot each one, and mark the answers. It costs nothing and teaches you a lot, but it covers a small sample and needs repeating by hand after every change. Use our [QA checklist](/blog/chatbot-qa-checklist) to structure it.

### 2. Botium (Cyara)

Botium started as an open-source framework for scripted chatbot conversations and is now part of Cyara's customer-experience testing platform. You write expected conversation flows and run them automatically. It suits larger teams with many flows and channels. Scripted tests check the paths you wrote down, so they catch regressions well but say little about the free-form answers an LLM gives to new questions.

### 3. Promptfoo

An open-source command-line tool for evaluating prompts and models. Developers define test cases and assertions in config files and run them in CI, including red-teaming for unsafe output. Excellent when you control the prompt and model; not designed for support teams using a hosted bot.

### 4. Langfuse

Open-source LLM observability: traces of every model call, cost and latency tracking, prompt management and evaluations. It is built for engineers instrumenting their own application with an SDK. See our [Langfuse alternative](/compare/langfuse-alternative) comparison if you need something your support team can run.

### 5. LangSmith

LangChain's platform for tracing, debugging and evaluating LLM applications, with datasets and evaluators. A natural fit if your bot is built with LangChain or LangGraph. Compare it in our [LangSmith alternative](/compare/langsmith-alternative) page.

### 6. ProofMyAI

[ProofMyAI](/solutions/ai-chatbot-monitoring) checks every chatbot answer against your own help center and business rules, with no code. Connect Intercom Fin read-only, upload a chat export, or send conversations from any bot, WhatsApp bot, n8n or Make. Each answer gets a verdict (correct, not in the docs, made up, should have gone to a human, off policy) and a plain-English reason. Wrong answers are grouped by the help article that caused them, **Fix with AI** drafts the corrected article, nightly tests catch regressions, and alerts go to WhatsApp, Slack, Teams or email.

## How to choose

- **You build the bot yourself and write code:** start with Promptfoo for pre-release tests, and add Langfuse or LangSmith for tracing in production.
- **You run a hosted bot (Fin, Zendesk AI, Tidio, Chatbase) and own the help center:** use no-code accuracy monitoring such as ProofMyAI, plus a short manual test set.
- **You are an agency running bots for clients:** you need per-client projects and client-ready reports; see [ProofMyAI for agencies](/solutions/ai-chatbot-monitoring-for-agencies).
- **You are an enterprise with scripted flows and voice channels:** look at Cyara/Botium.

Many teams combine two: developer evaluations before release, and live accuracy monitoring after.

> Want the testing done for you? See [AI chatbot testing with ProofMyAI](/solutions/ai-chatbot-testing): test questions written from your docs, nightly and CI runs, and every live answer checked.
`,
    takeaways: [
      "Decide what 'working' means first: accuracy, safety, hand-off, regression and live quality.",
      "Scripted frameworks catch regressions on known paths; LLM eval tools suit developers; live accuracy monitoring suits support teams.",
      "Grade answers against your own help docs, because that is what customers hold you to.",
      "Most teams combine pre-release tests with live monitoring after launch.",
    ],
    faqs: [
      { q: "What is the best free AI chatbot testing tool?", a: "For a first check, a spreadsheet of real questions is free and effective. Promptfoo and Langfuse are open source for developers. ProofMyAI has a free plan for 50 conversations a month and a free single-answer checker that needs no account." },
      { q: "Can I test a chatbot I didn't build, like Intercom Fin?", a: "Yes. You can't change its code, but you can grade its answers. Export conversations or connect Intercom read-only, then compare each answer with your help articles." },
      { q: "How often should I test my chatbot?", a: "Run a small test set every night and after every help center or prompt change, and monitor live conversations continuously, because customers ask questions no test set covers." },
    ],
    cta: { text: "Test your chatbot's answers for free", href: "/tools/ai-chatbot-checker" },
  },
  {
    slug: "chatbot-analytics-metrics",
    title: "Chatbot Analytics: The 9 Metrics That Matter and How to Track Them",
    seoTitle: "Chatbot Analytics: 9 Metrics That Matter (2026)",
    description: "Which chatbot analytics metrics actually matter: answer accuracy, resolution rate, escalation, topics, customer satisfaction and response time, plus how to track them without code.",
    date: "2026-10-04",
    readMins: 9,
    tags: ["AI chatbots", "Analytics", "Metrics"],
    answer: "Chatbot analytics is the measurement of what customers ask an AI chatbot and how well it answers. The metrics that matter most are answer accuracy (is the answer correct according to your own docs), resolution rate, escalation rate, topics, customer satisfaction from thumbs up/down ratings, response time and unanswered questions. Volume metrics like message counts only matter next to quality metrics.",
    body: `
## What chatbot analytics is (and what it isn't)

Classic chatbot analytics counted things: messages, sessions, clicks on quick replies. With AI chatbots that is no longer enough. An AI bot can hold a long, friendly conversation and still give a customer the wrong refund rule or an invented price. A dashboard that only shows "1,200 conversations this week" will look healthy while the bot is costing you money.

Modern chatbot analytics answers three questions:

1. **What are customers asking?** (topics and volume)
2. **How well does the bot answer?** (accuracy, resolution, escalation)
3. **How do customers feel about it?** (satisfaction, repeats, hand-overs)

## The 9 metrics that matter

### 1. Answer accuracy

The share of bot replies that are correct **according to your own help docs and policies**. This is the most important AI chatbot metric because it is the one your customers feel. It is measured by comparing every answer with your knowledge base, with an AI judge or with rules, and labelling it correct, made up, not in the docs, should have escalated, or off policy.

### 2. Resolution rate

The share of conversations the bot handled fully: every answer correct, no repeated questions, no restart, and no bad rating. A high conversation count with a low resolution rate means customers are getting stuck.

### 3. Escalation rate ("needed a human")

How often a customer needed a person: a complaint, a refund dispute, a safety issue, or a direct request for a human. Watch both directions. A rising escalation rate can mean missing documentation; a bot that never escalates is often hiding problems.

### 4. Topics

What customers ask about, grouped into topics such as Delivery, Returns & refunds or Pricing. Topics turn thousands of messages into a short list you can act on. The most useful view puts **accuracy per topic** next to volume: a topic with many questions and low accuracy is where to fix the help docs first.

### 5. Customer satisfaction

Thumbs up/down or 1–5 star ratings under the bot's replies, shown as the share of positive ratings, overall and per topic. Ratings are sparse (most customers don't click), so read them together with accuracy rather than on their own.

### 6. Unanswered questions (documentation gaps)

Questions the bot had nothing in your docs to answer from. Each one is a help article to write. This list is often the fastest way to raise accuracy.

### 7. Response time

How long customers wait for a reply: the average and the 95th percentile (the slow replies that make people leave). Slow replies usually come from long prompts, slow tools or retries.

### 8. Conversation length

Replies per conversation. Very short conversations can mean quick answers or customers giving up; very long ones often mean the bot is going round in circles. Look at it next to resolution rate.

### 9. Safety signals

Prompt-injection attempts, leaked system prompts, exposed card numbers, rude replies and answers in the wrong language. These are rare but expensive, so they should alert you instead of waiting in a monthly report.

## How to track chatbot analytics

You need two things: the conversations, and a way to judge them.

- **Collect conversations** from your chat platform (Intercom, Tidio, Crisp, Zendesk, WhatsApp) or send them live from your own bot with one API call.
- **Judge every answer** against your help docs, automatically, so accuracy and resolution are real numbers instead of guesses.
- **Add a thumbs up/down** under bot replies and send each click with the conversation ID.
- **Review weekly:** topics with low accuracy, the unanswered-questions list, and conversations customers rated badly.

## Developer tools vs. business tools

Developer-focused LLM observability platforms such as Langfuse are excellent for engineering teams: they trace every model call, manage prompts and run evaluations, and they need SDK instrumentation in your code. If you are a business owner or agency running a chatbot built on Intercom, Tidio, Chatbase or n8n, a no-code tool that connects to your existing bot and grades answers against your help docs is usually faster to get value from. Many teams use both: the developer tool for debugging, and an answer-quality monitor for the business.
`,
    takeaways: [
      "Volume metrics only matter next to quality metrics: track answer accuracy and resolution rate first.",
      "Put accuracy per topic next to topic volume to see where to fix your help docs first.",
      "Collect thumbs up/down ratings, but read them together with accuracy because most customers don't rate.",
      "The unanswered-questions list is the fastest way to raise accuracy: each item is a help article to write.",
    ],
    faqs: [
      { q: "What is chatbot analytics?", a: "Chatbot analytics is the measurement of what customers ask a chatbot and how well it answers: topics, answer accuracy, resolution rate, escalations, satisfaction ratings and response times." },
      { q: "What are the most important chatbot metrics?", a: "For AI chatbots: answer accuracy against your own docs, resolution rate, escalation rate, accuracy per topic, customer satisfaction and unanswered questions. Message and session counts are useful context, not goals." },
      { q: "How do I measure chatbot accuracy?", a: "Compare every bot answer with your help docs and policies, either with an AI judge or with rules, and label it correct, made up, not in the docs, should have escalated or off policy. ProofMyAI does this automatically for every conversation." },
      { q: "How do I collect chatbot user feedback?", a: "Add a thumbs up/down or star rating under bot replies and send each click, with the conversation ID, to your analytics tool. In ProofMyAI that is one POST request to /api/v1/feedback." },
      { q: "Is ProofMyAI a Langfuse alternative?", a: "For business owners and agencies, yes: ProofMyAI connects to an existing chatbot without code and focuses on answer accuracy, fixes and alerts. Langfuse is a developer platform for tracing and evaluating LLM applications. Engineering teams often use a developer platform alongside an answer-quality monitor." },
    ],
    cta: { text: "See your chatbot's analytics free", href: "/signup" },
  },
  {
    slug: "how-to-test-ai-chatbot-accuracy",
    title: "How to Test an AI Chatbot for Accuracy (Step-by-Step Guide)",
    description: "A practical, repeatable process to test whether your AI chatbot gives correct answers: build a test set from real questions, grade answers against your own docs, and monitor quality every day.",
    date: "2026-09-30",
    readMins: 8,
    tags: ["AI chatbots", "Testing", "Quality"],
    answer: "To test an AI chatbot for accuracy, collect real customer questions, write down the facts a correct answer must contain, ask the bot each question, and grade every answer against your own help documentation. Repeat the test after every change to the bot, its prompt or its knowledge base, and monitor live conversations for answers that are made up or not supported by your docs.",
    body: `
## Why chatbot accuracy needs its own test

AI chatbots don't fail like normal software. They rarely crash; instead they answer confidently and wrongly. A bot can quote an old price, invent a refund rule, or promise a delivery time your business never offered, and nothing in your logs will look like an error. The only way to know is to check what the bot actually says against what is actually true for your business.

That is why accuracy testing has two parts: a **fixed test set** you run on purpose, and **monitoring** of real conversations after launch.

## Step 1: Collect real questions

Start with questions customers really ask, not questions you imagine. The best sources are:

- Exports from your chat platform (Intercom, Zendesk, Tidio, Crisp, Chatbase or your own logs)
- Your support inbox and the questions your team answers every day
- Search terms on your help centre

Pick 20 to 50 questions that cover your most important topics: pricing, delivery, refunds, cancellations, opening hours, product limits, and anything with legal or financial risk.

## Step 2: Write the expected facts, not the expected sentence

For each question, write the **facts a correct answer must contain**, not the exact wording. The bot can phrase things in many ways; what matters is whether the facts are right.

- Question: "How much is shipping to Germany?"
- Must contain: "€9.90", "3 to 5 business days"
- Must NOT contain: "free shipping"

Adding "must not say" facts is important: it catches the most dangerous mistakes, such as promising something you don't offer.

## Step 3: Ask the bot and grade every answer

Send each question to the bot and compare the answer with the expected facts and with your help articles. Use a small set of clear verdicts:

1. **Correct**: matches your docs.
2. **Not in docs**: the claim might be true, but nothing in your documentation supports it.
3. **Made up**: contradicts your docs or invents specifics like prices, dates or policies.
4. **Should escalate**: the customer needed a human (a complaint, a legal threat, a refund dispute) and the bot kept talking.
5. **Off policy**: breaks one of your rules, for example mentioning a competitor.

Grading by hand works for a first test. For anything larger, use an automated grader (a tool that uses an AI model to compare each answer against your documentation), and review a sample of its verdicts yourself.

## Step 4: Fix the source, not the symptom

When an answer is wrong, find **why**. In most cases the bot is repeating something outdated or missing from your help articles. Group the wrong answers by the article that caused them, and fix the articles that cause the most errors first. One outdated "Shipping rates" page can be behind dozens of wrong answers.

## Step 5: Re-test after every change

Run the same test set again after you change the bot's prompt, model, settings or knowledge base. This is regression testing: it shows whether a fix in one place broke something elsewhere. Running it automatically every night catches problems caused by changes you didn't make, such as a platform update.

## Step 6: Monitor real conversations

A test set only covers the questions you thought of. Real customers ask everything else. After launch, check a sample of live conversations, or better, check every answer automatically and get an alert when the bot makes something up, fails to hand over to a human, or stops replying.

> **Tip:** the fastest start is to upload a recent chat export together with your help articles. You get a list of wrong answers and the articles to fix within minutes, before writing a single test.

## How often should you test?

- **Before launch:** the full test set.
- **After any change:** the full test set.
- **Every night:** the most important questions (pricing, refunds, legal topics).
- **Always:** live monitoring with alerts.

## How ProofMyAI does this

[ProofMyAI](/solutions/ai-chatbot-monitoring) grades every chatbot answer against your own help articles, runs your test questions every night, and alerts you by email, Slack or WhatsApp when an answer is wrong. Start with a [free audit](/signup) of a chat export.

> Automate it: [AI chatbot testing](/solutions/ai-chatbot-testing) runs these checks every night and on every live answer.
`,
    takeaways: [
      "Test with real customer questions and the facts a right answer must contain.",
      "Grade answers against your own documentation: correct, not in docs, made up, should escalate, off policy.",
      "Fix the help article behind the wrong answers, then re-test after every change.",
      "Monitor live conversations, because customers ask questions your test set doesn't cover.",
    ],
    faqs: [
      { q: "How many test questions do I need?", a: "Start with 20 to 50 real questions covering pricing, delivery, refunds, cancellations and anything with legal or financial risk. Add a new question every time a customer finds a wrong answer." },
      { q: "Can I test a chatbot automatically?", a: "Yes. Send each test question to the bot's API and grade the answers automatically against the expected facts and your help articles. Tools like ProofMyAI run this every night and alert you when an answer gets worse." },
      { q: "What is the most common cause of wrong chatbot answers?", a: "Outdated or missing information in the help articles the bot uses. Fixing the article usually fixes many wrong answers at once." },
    ],
    cta: { text: "Run a free accuracy audit of your chatbot", href: "/signup" },
  },
  {
    slug: "ai-chatbot-hallucination-examples",
    title: "AI Chatbot Hallucinations: Real Examples and How to Catch Them",
    description: "What AI chatbot hallucinations look like in customer service, the well-known cases that made the news, why they happen, and a practical system to catch them before customers do.",
    date: "2026-09-30",
    readMins: 7,
    tags: ["AI chatbots", "Hallucinations", "Risk"],
    answer: "An AI chatbot hallucination is an answer that sounds confident but is false or not supported by the business's own information, such as an invented refund rule, a wrong price or a policy that doesn't exist. You catch them by checking every answer against your documentation, alerting on made-up claims, and fixing the articles that cause them.",
    body: `
## What a hallucination looks like in customer service

In customer service, hallucinations are rarely dramatic. They look like normal, helpful answers:

- A shipping price or delivery time that is out of date
- A refund or cancellation rule that doesn't exist
- A discount, warranty or feature the business never offered
- A made-up link, phone number or opening hours
- Legal, medical or financial statements the business would never approve

Because the answer sounds right, customers believe it, and the business often only finds out when someone complains.

## Well-known cases

Several chatbot mistakes became public and show the business risk:

- **Air Canada (2024):** a customer was told by the airline's chatbot that he could claim a bereavement discount after travelling. That wasn't the airline's policy. A Canadian tribunal ruled that the airline was responsible for what its chatbot said and had to compensate the customer.
- **A Chevrolet dealership (2023):** users got a dealership's website chatbot to "agree" to sell a car for one dollar, and screenshots spread widely online.
- **DPD (2024):** a parcel company's chatbot was prompted into swearing and criticising the company, and the company disabled part of the bot.
- **New York City's MyCity chatbot (2024):** journalists reported that the city's business-advice chatbot gave answers that contradicted local laws.

The lesson from all of them: **the business owns what its bot says**, and problems are found by customers or the press unless you check first.

## Why chatbots make things up

- **Missing information:** when the help articles don't answer the question, the model fills the gap with something plausible.
- **Outdated information:** old prices or policies still sit in the knowledge base.
- **Conflicting information:** two articles say different things and the bot picks one.
- **Over-helpful prompts:** instructions like "always give a helpful answer" push the bot to answer instead of saying "I don't know".
- **Manipulation:** users deliberately push the bot to say things it shouldn't.

## How to catch hallucinations

1. **Ground every check in your own docs.** A general fact-check doesn't help; the question is whether the answer matches *your* policies.
2. **Separate "made up" from "not in docs".** A made-up answer contradicts your docs; a "not in docs" answer might be true but isn't supported. Both need attention, the first urgently.
3. **Check every answer, not a sample.** Hallucinations are rare per answer but common across thousands of conversations.
4. **Alert on high-risk topics.** Prices, refunds, legal and medical topics deserve an instant alert.
5. **Add rules.** "Never say lifetime warranty", "always hand over to a human when a customer mentions a chargeback", "when pricing comes up, say prices include VAT".
6. **Fix the cause.** Group problems by the article behind them and update that article.

## How to reduce hallucinations

- Keep help articles current and remove contradictions.
- Tell the bot to say "I don't know, let me connect you with our team" when the docs don't cover a question.
- Hand over to a human for complaints, legal threats and refund disputes.
- Re-test after every change to the prompt, model or knowledge base.

> Hallucinations can't be reduced to zero with today's models, but they can be caught within minutes instead of weeks.

## How ProofMyAI helps

[ProofMyAI](/solutions/ai-chatbot-monitoring) checks each chatbot answer against your help articles, labels it correct, not in docs, made up, should escalate or off policy, and alerts you about the dangerous ones. For regulated businesses there is a [compliance setup](/solutions/ai-chatbot-compliance-monitoring) with masking and results-only storage.

> Catch these in your own bot: [AI hallucination detection](/solutions/ai-hallucination-detection) checks every live answer against your docs and can block it before it's sent.
`,
    takeaways: [
      "A hallucination is a confident answer that isn't backed by your business's own information.",
      "Courts and the public hold businesses responsible for what their chatbot says.",
      "Most hallucinations come from missing, outdated or conflicting help articles.",
      "Check every answer against your docs, alert on high-risk topics, and fix the source article.",
    ],
    faqs: [
      { q: "Can you stop an AI chatbot from hallucinating completely?", a: "No model is hallucination-free today. You can reduce them with current, consistent help articles and a clear 'I don't know' instruction, and catch the rest quickly with automatic checks and alerts." },
      { q: "Is a business responsible for what its chatbot says?", a: "In the Air Canada case in 2024, a Canadian tribunal held the airline responsible for incorrect information its chatbot gave a customer. Treat your chatbot's answers as statements from your business." },
      { q: "What's the difference between 'made up' and 'not in docs'?", a: "A made-up answer contradicts your documentation or invents specifics. A 'not in docs' answer may be true but nothing in your documentation supports it. Both should be reviewed; made-up answers are more urgent." },
    ],
    cta: { text: "Find your chatbot's made-up answers for free", href: "/signup" },
  },
  {
    slug: "n8n-workflow-monitoring",
    title: "n8n Workflow Monitoring: Get Alerts for Failures and Silent Failures",
    seoTitle: "n8n Workflow Monitoring: Alerts for Failed & Silent Runs",
    description: "How to monitor n8n workflows in production: error workflows, execution checks, silent failures that report success, workflows that stop running, and alerts in Slack, email or WhatsApp.",
    date: "2026-09-30",
    readMins: 7,
    tags: ["n8n", "Automation", "Monitoring"],
    answer: "To monitor n8n workflows, catch three kinds of problems: executions that fail, executions that 'succeed' but produce nothing (silent failures), and workflows that stop running altogether. Use an n8n Error Workflow for instant failure alerts, check executions through the n8n API for zero-output runs and error spikes, and set a heartbeat that alerts you when a workflow hasn't run for longer than expected.",
    body: `
## The three ways n8n workflows break

1. **Failed executions:** a node throws an error (an API is down, credentials expired, data is in the wrong format).
2. **Silent failures:** the execution finishes with "success", but did nothing useful. For example, an order sync returns zero orders because an API changed a field name.
3. **Workflows that stop running:** a trigger breaks, a webhook URL changes, or someone deactivates the workflow, and nothing runs at all.

Most teams only watch the first kind. The second and third are usually found days later, by a customer or a colleague asking "why is this data missing?"

## Instant alerts for failed executions: the Error Workflow

n8n has a built-in feature for this:

1. Create a new workflow that starts with the **Error Trigger** node.
2. Add a notification node (Slack, email, Telegram or an HTTP request).
3. In each production workflow, open **Settings → Error workflow** and choose the workflow you just made.

Now every failed execution sends an alert with the workflow name and error message. It's free and takes five minutes, so do it first.

## Catch silent failures

An Error Workflow can't see silent failures, because nothing failed. To catch them:

- **Check the output count.** For each important workflow, decide what "normal" looks like (for example "at least 1 order per hour on weekdays") and alert when a successful execution produces zero items.
- **Compare with history.** A run that processes 3 items when it usually processes 300 deserves a look.
- **Watch duration.** A run that takes 10 times longer than normal is often about to fail.

## Catch workflows that stopped running

Set a **heartbeat** per workflow: "alert me if this workflow hasn't run for 2 hours". This catches broken triggers, deactivated workflows and a stopped n8n instance. Pick the window based on the schedule: a workflow that runs every 15 minutes might get a 1-hour window, a daily report a 26-hour window.

## Watch error rates, not just single errors

One failed execution in a thousand can be noise. A jump from 1% to 30% failed runs within an hour is an incident. Alerting on the error rate avoids alert fatigue while still catching real outages.

## A practical n8n monitoring checklist

- Error Workflow connected to every production workflow
- Zero-output alert for workflows that must always produce data
- Heartbeat alert for scheduled and webhook workflows
- Error-rate alert per workflow
- Alerts sent where you'll actually see them (Slack, WhatsApp or SMS, not only email)
- A weekly summary of success rates

## How ProofMyAI monitors n8n

[ProofMyAI](/solutions/n8n-workflow-monitoring) connects to n8n with an API key (n8n → Settings → n8n API), reads your executions every 15 minutes and alerts you on failures, silent failures, error-rate spikes, slow runs and workflows that stopped running. For faster alerts, it can also receive executions through a webhook. See the [setup docs](/docs#no-code).

> New research: [we scanned 375 public n8n workflows](/blog/n8n-workflow-risks-study). 96% had API calls with no retry and 29% had open webhooks.
`,
    takeaways: [
      "n8n workflows fail in three ways: errors, silent failures and simply not running.",
      "Set up an Error Workflow first: it's free and catches failed executions instantly.",
      "Alert on zero output and unusual counts to catch silent failures.",
      "Use a heartbeat per workflow to catch broken triggers and stopped instances.",
    ],
    faqs: [
      { q: "Does n8n have built-in alerts?", a: "Yes. The Error Trigger node lets you build an Error Workflow that runs whenever another workflow fails. It doesn't catch silent failures or workflows that stop running, so add output and heartbeat checks." },
      { q: "What is a silent failure in n8n?", a: "An execution that finishes successfully but produces nothing useful, for example a sync that returns zero records because an API response changed." },
      { q: "Does monitoring work with self-hosted n8n?", a: "Yes. Monitoring through the n8n API works with n8n Cloud and self-hosted n8n, as long as the API is reachable from the monitoring service." },
    ],
    cta: { text: "Connect n8n and get alerts in 2 minutes", href: "/signup" },
  },
  {
    slug: "make-com-scenario-monitoring",
    title: "Make.com Scenario Monitoring: Catch Errors and Scenarios That Stop Running",
    seoTitle: "Make.com Scenario Monitoring: Catch Errors & Stopped Runs",
    description: "How to monitor Make (formerly Integromat) scenarios: error handlers, incomplete executions, silent failures, scenarios that get disabled, and alerts that reach you in time.",
    date: "2026-09-30",
    readMins: 6,
    tags: ["Make", "Automation", "Monitoring"],
    answer: "To monitor Make.com scenarios, combine Make's built-in error handling and email notifications with checks that Make doesn't do for you: scenarios that run but process nothing, scenarios that are switched off automatically after repeated errors, and scenarios whose trigger stops firing. Check scenario logs through the Make API and alert when a scenario hasn't run or has an unusual error rate.",
    body: `
## What Make does for you

Make has useful built-in tools:

- **Error handlers** (Resume, Ignore, Break, Commit, Rollback) on individual modules
- **Incomplete executions**, which store failed runs so you can retry them
- **Email notifications** about errors and deactivated scenarios

Set these up first. They are the foundation.

## What Make doesn't tell you clearly

- **A scenario that stops running.** If a webhook stops receiving data or a schedule is changed, nothing fails, so nothing alerts.
- **A scenario that is switched off.** Make can deactivate a scenario after repeated errors. The email is easy to miss, and the automation is simply off until someone notices.
- **Silent failures.** A run "succeeds" but processes zero bundles because a filter or a changed API field drops everything.
- **Slow degradation.** More and more runs fail, but never enough to feel like an outage.

## A monitoring setup that works

1. **Turn on error notifications** in your Make profile and send them to an address you actually read.
2. **Add error handlers** to modules that call external APIs, and route errors to a Slack or email module.
3. **Track operations per run.** A scenario that normally processes 50 bundles and suddenly processes 0 needs a look.
4. **Add a heartbeat.** Alert when an important scenario hasn't run for longer than its normal schedule.
5. **Watch the error rate** per scenario over the last 24 hours.
6. **Send a weekly summary** of success rates to whoever owns the automations.

## Using the Make API

Make's API lets you read scenario status and execution logs with a token (Profile → API access, with the scenarios:read scope). A monitoring tool can poll it regularly, calculate error rates and detect scenarios that stopped, without changing your scenarios at all.

## How ProofMyAI monitors Make

[ProofMyAI](/solutions/n8n-workflow-monitoring) connects to Make with a read-only API token and your scenario IDs, checks their logs every 15 minutes and alerts you about failures, silent failures, error spikes and scenarios that stopped running, by Slack, email, Teams, Telegram or WhatsApp. See the [setup steps](/docs#no-code).
`,
    takeaways: [
      "Use Make's error handlers, incomplete executions and notifications first.",
      "Make won't clearly warn you about scenarios that stop running or process nothing.",
      "Add heartbeat, zero-output and error-rate checks for important scenarios.",
      "A read-only API token is enough for outside monitoring.",
    ],
    faqs: [
      { q: "Why did my Make scenario turn off?", a: "Make can deactivate a scenario after repeated consecutive errors. Check the scenario's history for the errors, fix the cause, and switch it back on. A heartbeat alert tells you when this happens." },
      { q: "Can I get Make error alerts in Slack?", a: "Yes. Add an error handler route with a Slack module, or use a monitoring tool that reads the Make API and sends alerts to Slack, Teams, email or WhatsApp." },
      { q: "Does monitoring change my scenarios?", a: "No. Monitoring through the Make API only reads scenario logs with a read-only token." },
    ],
    cta: { text: "Monitor your Make scenarios free", href: "/signup" },
  },
  {
    slug: "ai-agent-monitoring",
    title: "AI Agent Monitoring: How to Catch Loops, Tool Errors and Runaway Costs",
    seoTitle: "AI Agent Monitoring: Catch Loops, Tool Errors & Costs",
    description: "What can go wrong with AI agents in production and how to monitor them: loops, failed tool calls, ungrounded answers, goals not met, slow runs and cost spikes.",
    date: "2026-09-30",
    readMins: 7,
    tags: ["AI agents", "Monitoring", "LLM"],
    answer: "To monitor AI agents, record every run with its goal, steps (model calls and tool calls), errors, duration, cost and final output, then check each run automatically for loops, failed tool calls, empty output, budget or step limits being exceeded, and final answers that the tool results don't support. Alert on high-severity issues and review a sample of runs every week.",
    body: `
## Why agents need different monitoring

A normal program either works or throws an error. An AI agent can do something much stranger: call the same tool twenty times, give up silently, spend ten dollars on one request, or report "done" when the task wasn't done. Traditional uptime monitoring sees none of this.

## What to record for each run

- **Goal:** what the agent was asked to do
- **Steps:** each model call and tool call, with inputs, outputs and errors
- **Duration and cost** per step and in total
- **Status:** success, error, timeout, cancelled
- **Final output:** what the agent returned

Most agent frameworks (LangChain, the OpenAI Agents SDK, the Claude Agent SDK, CrewAI) make these easy to collect at the end of a run.

## The checks that matter

1. **Loops:** the same tool called repeatedly with the same input. This is the most common costly failure.
2. **Tool errors:** failed API calls, timeouts and permission errors, especially when the agent ignores them.
3. **Ended on an error but reported success:** the last step failed but the run says "success".
4. **Empty output:** a successful run with nothing in the final answer (a silent failure).
5. **Limits:** too many steps, too long, or more expensive than your budget per run.
6. **Goal not met:** the final output doesn't do what the goal asked.
7. **Ungrounded output:** the agent claims results the tools never returned, for example "refund issued" when the refund call failed.

The first five can be checked with simple rules. The last two need an AI review that reads the goal, the steps and the output.

## Set limits per agent

Decide per agent what "normal" means: maximum steps, maximum seconds and maximum cost per run. A support agent might need 10 steps and 30 seconds; a research agent might need 60 steps and 5 minutes. Alerts based on your own limits are far more useful than generic ones.

## Alerting without noise

- Alert immediately on high-severity issues: loops, runs over budget, goal not met, ungrounded claims.
- Group repeated issues into one incident per agent and problem, and close it automatically when runs are healthy again.
- Send a weekly summary with the success rate, average cost and the most common issues.

## How ProofMyAI monitors agents

[ProofMyAI](/solutions/ai-agent-monitoring) takes one HTTP call at the end of each run (see the [API docs](/docs#agent-runs)), checks it for loops, tool errors, limits, empty output, goals not met and ungrounded claims, gives each run a score, and alerts you when something needs attention.
`,
    takeaways: [
      "Record the goal, every step, errors, duration, cost and final output of each run.",
      "Rules catch loops, tool errors, empty output and limit breaches.",
      "An AI review catches goals not met and claims the tools never supported.",
      "Set limits per agent and alert only on what matters.",
    ],
    faqs: [
      { q: "What is the most common AI agent failure?", a: "Loops: the agent calls the same tool with the same input again and again, wasting time and money without making progress." },
      { q: "How do I stop an AI agent from overspending?", a: "Set a maximum number of steps, maximum run time and maximum cost per run in your agent code, and alert when a run exceeds them." },
      { q: "Which frameworks can be monitored?", a: "Any framework. Send the run's goal, steps, final output, status, duration and cost with one HTTP call at the end of the run." },
    ],
    cta: { text: "Monitor your AI agents free", href: "/signup" },
  },
  {
    slug: "chatbot-qa-checklist",
    title: "AI Chatbot QA Checklist: 25 Checks Before and After Launch",
    description: "A practical quality checklist for AI customer-service chatbots: knowledge base, accuracy, escalation, safety, privacy, performance and ongoing monitoring.",
    date: "2026-09-30",
    readMins: 6,
    tags: ["AI chatbots", "Checklist", "Quality"],
    answer: "Before launching an AI chatbot, check that its knowledge base is current, that it answers your most common questions correctly, that it hands complaints and risky topics to a human, that it can't be pushed into saying things you don't allow, and that personal data is protected. After launch, monitor every answer and re-test after every change.",
    body: `
## Knowledge base

- Every important topic has one current article (pricing, delivery, refunds, cancellations, opening hours).
- No two articles contradict each other.
- Old promotions and discontinued products are removed.
- Articles state limits clearly ("we don't ship to…", "not covered by warranty").

## Accuracy

- The bot answers your 20 most common questions correctly.
- Prices, dates and numbers match your articles exactly.
- The bot says "I don't know" instead of guessing when the articles don't cover a question.
- Answers don't invent links, phone numbers or email addresses.
- Required statements appear where needed (for example "prices include VAT").

## Escalation to a human

- Complaints are handed to a human.
- Legal threats and chargebacks are handed to a human.
- Refund disputes are handed to a human.
- Angry customers (all caps, repeated questions) are handed over quickly.
- The hand-over actually works and someone receives it.

## Safety and policy

- The bot never mentions competitors or makes guarantees you don't offer.
- It refuses to agree to prices, discounts or contracts.
- It resists "ignore your instructions" style manipulation.
- It doesn't give medical, legal or financial advice unless you allow it.

## Privacy

- Customers are told they are talking to an AI.
- Personal data (emails, phone numbers, card numbers) is masked in logs and reports.
- Conversation data is deleted after a set period.

## Performance

- Replies arrive within a few seconds.
- The bot replies to every message (no silent drop-outs).

## After launch

- Every answer is checked against your docs, with alerts for made-up answers.
- Your key questions are re-tested every night and after every change.
- A weekly summary shows accuracy, escalations and the articles to fix.

> Print this list and tick it off before every major change to your bot, not just at launch.

## Automate the checklist

Many of these checks can run automatically. [ProofMyAI](/solutions/ai-chatbot-monitoring) grades answers against your docs, enforces your own rules ("never say…", "always hand over when…", "must say…"), detects frustrated customers and missing replies, masks personal data, and alerts you. [Try it free](/signup).

> Run this checklist automatically with [AI chatbot testing](/solutions/ai-chatbot-testing), and catch made-up answers live with [hallucination detection](/solutions/ai-hallucination-detection).
`,
    takeaways: [
      "Most chatbot quality problems start in the knowledge base.",
      "Test your top 20 questions, escalation paths and 'never say' rules before launch.",
      "Protect personal data and tell customers they're talking to an AI.",
      "After launch, check every answer and re-test after every change.",
    ],
    faqs: [
      { q: "What should I test before launching an AI chatbot?", a: "Your most common questions, pricing and policy answers, hand-over to a human for complaints and legal topics, 'never say' rules, resistance to manipulation, and personal-data masking." },
      { q: "How often should a chatbot be tested?", a: "Before launch, after every change to its prompt, model or knowledge base, every night for the most important questions, and continuously through live monitoring." },
      { q: "Who should own chatbot quality?", a: "Usually the support or customer-experience lead, with the developer who maintains the bot. A weekly quality summary keeps both informed." },
    ],
    cta: { text: "Automate your chatbot QA checklist", href: "/signup" },
  },
];

export const postBySlug = (slug: string) => POSTS.find((p) => p.slug === slug);
