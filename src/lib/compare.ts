/**
 * "ProofMyAI vs …" comparison pages. Kept factual and fair: competitors are described from their own
 * public positioning (checked October 2026), and each page says who the other tool is better for.
 */

export interface Comparison {
  slug: string;
  name: string;
  title: string;
  description: string;
  summary: string;
  rows: [feature: string, us: string, them: string][];
  chooseUs: string[];
  chooseThem: string[];
  faqs: { q: string; a: string }[];
  /** When this comparison was last checked, if later than COMPARE_REVIEWED. */
  reviewed?: string;
}

export const COMPARE_REVIEWED = "October 2026";

export const COMPARISONS: Comparison[] = [
  {
    slug: "langfuse-alternative",
    name: "Langfuse",
    title: "ProofMyAI vs Langfuse: a no-code Langfuse alternative for chatbot monitoring",
    description: "Langfuse is an open-source LLM engineering platform for developers. ProofMyAI is no-code chatbot, agent, n8n/Make, Sheets and CRM monitoring for businesses and agencies. Compare features, setup and who each is for.",
    summary: "Langfuse is an excellent open-source platform for engineering teams who instrument their own LLM code with tracing, prompt management and evaluations. ProofMyAI is built for the people who run a support chatbot or automations and don't want to write code: it checks every customer answer against your help docs, tells you what to fix, and also watches n8n/Make workflows, Google Sheets and CRMs.",
    rows: [
      ["Built for", "Business owners, support teams and agencies", "Developers and AI engineering teams"],
      ["Setup", "No code: upload chat exports, paste an Intercom token, add a WhatsApp webhook or n8n/Make key", "Add the SDK or OpenTelemetry instrumentation to your application code"],
      ["Checks chatbot answers against your help docs", "Built in and automatic for every answer", "Possible by setting up your own LLM-as-a-judge evaluators"],
      ["Tells you what to fix", "Fix list per help article, plus ✨ corrected article and safer system prompt", "Not a focus: you analyse traces and scores"],
      ["n8n & Make workflow monitoring", "Yes: failures, silent failures, stopped workflows", "Not a focus"],
      ["Tracing, prompt management, experiments", "Agent runs with step-by-step timing, tokens and errors; accepts OpenTelemetry traces; no prompt management", "Yes, extensive"],
      ["Open source / self-hosting", "Self-hosted option for regulated businesses", "Open source (MIT) and self-hostable"],
      ["Alerts", "Slack, Teams, Discord, Telegram, Google Chat, WhatsApp, email, webhooks", "Configurable via the platform"],
      ["Pricing", "Free plan; paid from $29/month", "Free tier and free self-hosting; paid cloud plans"],
    ],
    chooseUs: ["You run a support chatbot (Intercom Fin, Tidio, Zendesk, WhatsApp…) and want every answer checked without code", "You want a plain-English fix list, not traces", "You also run n8n or Make automations", "You're an agency reporting to clients"],
    chooseThem: ["You're a developer building your own LLM app and want deep tracing", "You need prompt management and experiments in your engineering workflow", "You want a fully open-source stack"],
    faqs: [
      { q: "Is ProofMyAI a Langfuse alternative?", a: "For businesses that want to monitor a customer-facing chatbot without code, yes. For engineering teams that need tracing, prompt management and experiments inside their own code, Langfuse is the better fit. Some teams use both." },
      { q: "Do I need to write code to use ProofMyAI?", a: "No. Chatbot audits need a file upload or a no-code connection. Developers can optionally use the API for live tracking." },
    ],
  },
  {
    slug: "langsmith-alternative",
    name: "LangSmith",
    title: "ProofMyAI vs LangSmith: a no-code LangSmith alternative for businesses",
    description: "LangSmith is LangChain's developer platform for tracing, testing and evaluating LLM apps. ProofMyAI is no-code monitoring for support chatbots, AI agents, n8n/Make workflows and CRMs. See the differences.",
    summary: "LangSmith, from the LangChain team, helps developers debug, test and evaluate LLM applications and agents. ProofMyAI is for businesses and agencies who run chatbots and automations: connect without code, get every customer answer checked against your own docs, and receive a fix list and alerts.",
    rows: [
      ["Built for", "Business owners, support teams and agencies", "Developers building LLM apps and agents"],
      ["Setup", "No code for chatbots and workflows; one HTTP call for agents", "SDK / tracing integration in your code"],
      ["Checks chatbot answers against your help docs", "Built in and automatic", "Possible with custom evaluators and datasets"],
      ["Tells you what to fix", "Fix list per article, ✨ corrected articles and safer prompts", "Not a focus: you inspect traces and evaluation results"],
      ["n8n & Make workflow monitoring", "Yes", "Not a focus"],
      ["Debugging, datasets, prompt hub", "Agent step timeline and OpenTelemetry traces; CI regression tests via API; no prompt hub", "Yes, extensive"],
      ["Client reports for agencies", "White-label share links and PDFs", "Not a focus"],
      ["Pricing", "Free plan; paid from $29/month", "Free developer tier; paid plans (see their site)"],
    ],
    chooseUs: ["You want to know which customer answers are wrong, without code", "You run Intercom, Tidio, Zendesk, WhatsApp or a custom bot", "You also need n8n/Make monitoring", "You report to clients"],
    chooseThem: ["You build with LangChain or LangGraph and debug in code", "You need datasets, evaluations and prompt management for engineering", "Your team is mainly developers"],
    faqs: [
      { q: "Is ProofMyAI a LangSmith alternative?", a: "For non-developers monitoring a customer-facing chatbot or automations, yes. Developers who need deep tracing and evaluation tooling for LangChain apps will prefer LangSmith." },
      { q: "Can I use ProofMyAI with a LangChain agent?", a: "Yes. Send each agent run to ProofMyAI with one HTTP call and it checks for loops, tool errors, runaway costs and unsupported answers." },
    ],
  },
  {
    slug: "braintrust-alternative",
    name: "Braintrust",
    title: "ProofMyAI vs Braintrust: no-code AI monitoring vs an AI evals platform",
    description: "Braintrust is an evaluation and observability platform for teams building AI products. ProofMyAI is no-code monitoring for live chatbots, AI agents, n8n/Make, Sheets and CRMs. Compare.",
    summary: "Braintrust is built for AI product and engineering teams: run evaluations, compare prompts and models, log production traces and score them. ProofMyAI is built for the business running the AI: every live customer answer checked against your own help docs, a fix list, pre-send blocking, one-click approvals, and monitoring for the automations, sheets and CRMs around the AI.",
    rows: [
      ["Built for", "Business owners, support teams, automation builders and agencies", "AI product and engineering teams"],
      ["Setup", "No code for chatbots, n8n/Make, Sheets and CRMs; one HTTP call or OpenTelemetry for agents", "SDK and logging in your code"],
      ["Checks live answers against your help docs", "Built in, with the exact quote from your docs as evidence", "Possible with custom scorers"],
      ["Pre-send check and human approvals", "Built in: allow / review / block, and one-click approval for risky agent actions", "Not a focus"],
      ["Evaluations, experiments, prompt playground", "Nightly and CI regression tests on your own questions", "Yes, extensive"],
      ["n8n, Make, Google Sheets and CRM monitoring", "Yes: failures, silent failures, stopped workflows, missing leads", "Not a focus"],
      ["Alerts", "WhatsApp, Slack, Teams, Discord, Telegram, email, webhooks", "Configurable via the platform"],
      ["Pricing", "Free plan; paid from $29/month", "Free tier; paid plans (see their site)"],
    ],
    chooseUs: ["You run a customer-facing chatbot or agent and want every answer checked without building evals", "You want plain-English fixes and alerts on WhatsApp or Slack", "Your AI sits inside n8n, Make, Sheets or a CRM", "You're an agency reporting to clients"],
    chooseThem: ["You're building an AI product and iterate on prompts and models with experiments", "You need a full evaluation workflow with datasets and custom scorers", "Your users are mainly engineers"],
    faqs: [
      { q: "Is ProofMyAI a Braintrust alternative?", a: "For businesses that want live monitoring and fixes without building an evaluation pipeline, yes. Teams that run systematic experiments on prompts and models will prefer Braintrust, and some use both." },
      { q: "Can ProofMyAI run regression tests before I deploy?", a: "Yes. Save your important questions with the facts a right answer must include, and call POST /api/v1/test-runs from CI (for example a GitHub Action) against a preview URL. The build fails if answers get worse." },
    ],
  },
  {
    slug: "helicone-alternative",
    name: "Helicone",
    title: "ProofMyAI vs Helicone: answer quality monitoring vs LLM request logging",
    description: "Helicone is an open-source LLM observability gateway for logging requests, costs and latency. ProofMyAI checks whether live AI answers and automations are actually right. Compare.",
    summary: "Helicone sits between your app and the model provider and logs every request: cost, latency, errors and usage, with caching and rate limiting. ProofMyAI looks at what the AI said and did: whether each answer matches your help docs and policies, whether an agent did the job, and whether the workflows, sheets and CRMs around it still work.",
    rows: [
      ["Built for", "Business owners, support teams and agencies", "Developers who want request logging and cost control"],
      ["Setup", "No code for chatbots and workflows; one HTTP call or OpenTelemetry for agents", "Change the model base URL or add headers in your code"],
      ["Logs every model request, cost and latency", "Per reply and per agent step when you send them", "Yes, core feature"],
      ["Checks answers against your help docs", "Built in, with the exact quote from your docs as evidence", "Not a focus"],
      ["Blocks wrong answers before they're sent", "Yes: POST /check returns allow, review or block", "Not a focus"],
      ["n8n, Make, Google Sheets and CRM monitoring", "Yes", "Not a focus"],
      ["Open source / self-hosting", "Self-hosted option for regulated businesses", "Open source and self-hostable"],
      ["Pricing", "Free plan; paid from $29/month", "Free tier; paid plans (see their site)"],
    ],
    chooseUs: ["You care whether answers are right, not only how much they cost", "You want alerts and a fix list without code", "You also run automations, sheets or a CRM"],
    chooseThem: ["You mainly need request logs, cost tracking, caching and rate limits", "You want an open-source gateway in front of your model provider"],
    faqs: [
      { q: "Is ProofMyAI a Helicone alternative?", a: "They solve different problems and work well together: Helicone logs and controls model requests; ProofMyAI checks whether the answers and actions were correct and alerts you when they weren't." },
      { q: "Does ProofMyAI track AI costs?", a: "Yes, per reply (send cost_usd) and per agent step, with alerts on runaway agent costs. It is not a proxy, so it doesn't cache or rate-limit requests." },
    ],
  },
  {
    slug: "botium-alternative",
    name: "Botium",
    reviewed: "November 2026",
    title: "ProofMyAI vs Botium: a no-code Botium alternative for chatbot testing",
    description: "Botium (by Cyara) is enterprise conversational AI testing for chatbots and voice bots. ProofMyAI tests and monitors chatbots, AI agents and n8n/Make without code. Compare features and fit.",
    summary: "Botium, part of Cyara since 2022, is an enterprise platform for testing conversational AI: functional, regression, performance and security tests across dozens of chatbot and voice platforms, with an open-source core. ProofMyAI is for businesses and agencies that want their chatbot tested and every live answer checked against their own help docs without writing test scripts, plus monitoring for the AI agents and automations around it.",
    rows: [
      ["Built for", "Business owners, support teams, automation builders and agencies", "Enterprise QA and contact-center teams"],
      ["Writing tests", "AI writes test questions from your docs and past mistakes; you review them", "Test scripts and conversation flows, with test data generation"],
      ["Checks live customer answers against your help docs", "Every answer, with the exact sentence as evidence", "Not the focus: built for testing before release"],
      ["Regression and CI testing", "Nightly runs and POST /test-runs from CI", "Yes, extensive, including performance and load testing"],
      ["Voice bots", "Finished calls from Vapi, Retell or any provider checked for answers and failed transfers", "Voice and IVR testing as part of Cyara's platform"],
      ["AI agents, n8n/Make, Sheets and CRMs", "Yes: loops, destructive actions, silent failures, missing leads", "Not a focus"],
      ["Setup", "No code; one HTTP call for custom bots", "Enterprise onboarding and connectors"],
      ["Pricing", "Free plan; paid from $29/month", "Enterprise pricing (see their site)"],
    ],
    chooseUs: ["You want your chatbot tested without writing test scripts", "You want every real customer answer checked, not only test cases", "You also run AI agents or n8n/Make automations", "You're a small team or an agency"],
    chooseThem: ["You're an enterprise testing many bot platforms and channels", "You need load and performance testing at scale", "You already use Cyara for contact-center assurance"],
    faqs: [
      { q: "Is ProofMyAI a Botium alternative?", a: "For businesses and agencies that want chatbot tests written for them and every live answer checked without code, yes. Enterprises that need load testing and scripted tests across many platforms are better served by Botium." },
      { q: "Is Botium still open source?", a: "Its core library is open source and still maintained under Cyara, which bought Botium in 2022. The commercial platform is sold by Cyara." },
    ],
  },
  {
    slug: "cyara-alternative",
    name: "Cyara",
    reviewed: "November 2026",
    title: "ProofMyAI vs Cyara: AI chatbot and agent monitoring for smaller teams",
    description: "Cyara is enterprise CX assurance for contact centers: voice, IVR and chatbot testing. ProofMyAI is no-code monitoring for chatbots, AI agents, voice bots and n8n/Make. Compare who each is for.",
    summary: "Cyara is a customer experience assurance platform for large contact centers: it tests and monitors voice, IVR and digital channels, and includes Botium for chatbot testing. ProofMyAI is built for small and mid-size businesses and agencies: connect without code, check every chatbot or voice-bot answer against your own docs, and monitor the AI agents and automations behind it, from a free plan.",
    rows: [
      ["Built for", "Small and mid-size businesses, automation builders and agencies", "Large enterprises and contact centers"],
      ["Chatbot answers checked against your help docs", "Every live answer, with evidence and a fix list", "Testing-focused, via Botium"],
      ["Voice and IVR", "AI voice agent calls (Vapi, Retell, any provider): answers and failed transfers", "Extensive voice and IVR testing and monitoring"],
      ["AI agents, n8n/Make, Sheets and CRMs", "Yes", "Not a focus"],
      ["Setup", "Self-serve in minutes, no code", "Enterprise onboarding"],
      ["Pricing", "Free plan; paid from $29/month", "Enterprise pricing (see their site)"],
    ],
    chooseUs: ["You want to start today, without a sales process", "Your bot runs on Intercom, WhatsApp, Vapi, Retell or your own code", "You also run AI agents and automations", "You're an agency managing several clients"],
    chooseThem: ["You run a large contact center with IVR and many channels", "You need enterprise load testing and telecom-level assurance", "You need vendor support contracts at enterprise scale"],
    faqs: [
      { q: "Is ProofMyAI a Cyara alternative?", a: "For small and mid-size businesses and agencies running AI chatbots, voice agents and automations, yes: it's self-serve, starts free and checks every live answer. Large contact centers that need IVR and load testing across channels should look at Cyara." },
      { q: "Does ProofMyAI test IVR systems?", a: "No. It checks AI voice agent calls (for example from Vapi or Retell) after they finish: the answers and whether callers who asked for a person were transferred. Traditional IVR testing is Cyara's and Bespoken's area." },
    ],
  },
];