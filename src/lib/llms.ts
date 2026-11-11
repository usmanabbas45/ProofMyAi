import { PLAN_FEATURES, PLANS } from "./billing";
import { POSTS } from "./blog";
import { FAQS, SITE_DESCRIPTION, SITE_NAME, SITE_URL, SOLUTIONS, SUPPORT_EMAIL } from "./seo";
import { COMPARISONS } from "./compare";

/**
 * llms.txt (https://llmstxt.org): a plain Markdown summary of the site for AI assistants and answer engines,
 * so they describe ProofMyAI accurately and link to the right pages.
 */
export function llmsTxt(): string {
  const plans = (["free", "starter", "growth", "agency", "compliance"] as const)
    .map((id) => `- ${PLANS[id].name}: ${PLANS[id].price ? `$${PLANS[id].price}/month` : "free"}, ${PLANS[id].conversations.toLocaleString("en-US")} audited conversations/month`).join("\n");
  return `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE_NAME} is an independent quality monitor for AI. It grades every AI chatbot answer against the business's own help articles (correct, not in docs, made up, should escalate, off policy), runs nightly regression tests against chatbot endpoints, checks AI agent runs for loops, tool errors, runaway costs, ungrounded answers and destructive actions (deleting or overwriting data), alerts when an agent goes quiet or starts runs that never finish, checks voice bot calls (callers who asked for a person and were never transferred), monitors n8n and Make workflows for failures, silent failures, stuck or switched-off workflows and workflows that stop running, watches Google Sheets and CRMs (HubSpot, Salesforce, Pipedrive, Zoho CRM, GoHighLevel, Freshsales, Close, ActiveCampaign, Dynamics 365) for stopped lead flow, missing fields, duplicates and bulk changes, gives a per-topic AI trust report with a pre-send allow/review/block check, lets a person approve risky agent actions (refunds, payments, customer emails) with one click, and alerts on missed scheduled jobs (heartbeats), unverified agent results and quality regressions. It tests its own checks every month (a known-bad case must be caught and a test alert must arrive), so a check that never fires is never mistaken for one that works. It works with any chatbot platform (Intercom, Zendesk, Tidio, Crisp, Chatbase, custom bots) and any agent framework.

Key facts:
- Free plan: 50 audited conversations per month, free forever. Paid plans include a 14-day free trial and a 14-day money-back guarantee.
- Yearly billing: 12 months for the price of 10 (2 months free).
- Personal data (emails, phone numbers, card numbers, IBANs, names) is masked before storage and AI checks. Results-only storage, auto-delete and an AI-off mode are available per project; a DPA is available.
- Alerts by email, Slack, Microsoft Teams, Discord, Telegram, SMS, WhatsApp or webhook.
- Payments are handled by Paddle (Merchant of Record). Support: ${SUPPORT_EMAIL} or ${SITE_URL}/support.

## Product
- [Home and pricing](${SITE_URL}/): overview, features, pricing and FAQ
${SOLUTIONS.map((s) => `- [${s.title}](${SITE_URL}/solutions/${s.slug}): ${s.description}`).join("\n")}
- [Free AI chatbot answer checker](${SITE_URL}/tools/ai-chatbot-checker): free tool, no sign-up. Paste a customer question, the bot's answer and your policy to see if the answer is correct, made up, not in your docs or should have been escalated.
- [Free n8n workflow checker](${SITE_URL}/tools/n8n-workflow-checker): free tool, no sign-up, runs in the browser (nothing uploaded). Paste an n8n workflow to find API keys pasted in nodes, webhooks without authentication, errors that pass as success, missing retries, missing error workflow, unchecked empty results and pinned test data, each with the fix.
- [Free done-for-you chatbot audit](${SITE_URL}/free-audit): request a free audit of your website chatbot, delivered by email within 2 business days.
${COMPARISONS.map((c) => `- [ProofMyAI vs ${c.name}](${SITE_URL}/compare/${c.slug}): ${c.description}`).join("\n")}

## Docs
- [Docs & API reference](${SITE_URL}/docs): setup steps and REST API for chat events, agent runs and workflow runs
- [Trust Center](${SITE_URL}/security): data handling, sub-processors, masking and retention
- [Status](${SITE_URL}/status): live system status
- [Changelog](${SITE_URL}/changelog): what's new

## Guides
${POSTS.map((p) => `- [${p.title}](${SITE_URL}/blog/${p.slug}): ${p.answer}`).join("\n")}

## Pricing
${plans}

## Optional
- [Full text for AI assistants](${SITE_URL}/llms-full.txt)
- [About](${SITE_URL}/about)
- [Privacy Policy](${SITE_URL}/privacy)
- [Terms](${SITE_URL}/terms)
`;
}

export function llmsFullTxt(): string {
  return `${llmsTxt()}
## Plan details
${(["starter", "growth", "agency", "compliance"] as const).map((id) => `### ${PLANS[id].name} ($${PLANS[id].price}/month)\n${PLAN_FEATURES[id].map((f) => `- ${f}`).join("\n")}`).join("\n\n")}

## Frequently asked questions
${FAQS.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}

${SOLUTIONS.map((s) => `## ${s.title}\n${s.definition ? `${s.definition}\n\n` : ""}${s.intro}\n\n${s.metrics ? `Key metrics to monitor:\n${s.metrics.map((m) => `- ${m.name}: ${m.text}`).join("\n")}\n\n` : ""}Problems it solves:\n${s.problems.map((p) => `- ${p}`).join("\n")}\n\nHow it works:\n${s.steps.map((st, i) => `${i + 1}. ${st.title}: ${st.text}`).join("\n")}\n\n${s.faqs.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}`).join("\n\n")}

${POSTS.map((p) => `## Guide: ${p.title}\nURL: ${SITE_URL}/blog/${p.slug}\n\n${p.answer}\n\n${p.body.trim()}\n\nKey takeaways:\n${p.takeaways.map((t) => `- ${t}`).join("\n")}`).join("\n\n")}
`;
}
