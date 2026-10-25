import { metaDescription } from "@/lib/meta";
import { PLAN_FEATURES, PLANS as PLANS_BY_ID, priceId, yearlyAvailable, yearlyMonthly, yearlyPrice, type PlanId } from "@/lib/billing";
import { planSignupHref } from "@/lib/next-path";
import Link from "next/link";
import { ScoreRing } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/site";
import { BeamDiagram, CatchDemo, HeroMockup, IntegrationMarquee, Meteors, StepArt } from "@/components/illustrations";
import { YouTube } from "@/components/video";
import { CopyBox, NumberTicker, ProductTour, ScrollVideo, ShortcutLink, StartTabs, WordRotate, type TourTab } from "@/components/landing";
import { foundingSpotsLeft } from "@/lib/founding";
import { FOUNDING_OFFER, publishedTestimonials, ratingSummary } from "@/lib/testimonials";
import { LEGAL_NAME } from "@/lib/legal";
import { DEVELOPER_URL } from "@/lib/support";
import { FAQS, jsonLd, SAME_AS, SUPPORT_EMAIL, SITE_DESCRIPTION, SITE_NAME, SITE_URL, VIDEOS, DEMO_VIDEO, demoVideoJsonLd, videoJsonLd } from "@/lib/seo";

const FEATURES = [
  { icon: "💬", title: "Chatbot audits", text: "Upload transcripts from Intercom, Tidio, Crisp, Zendesk or any bot. Every answer is graded against your help docs: correct, made up, not in docs, should have escalated, off-policy." },
  { icon: "🧪", title: "Nightly bot tests", text: "AI writes test questions from your help docs and past mistakes, or add your own. ProofMyAI asks your bot every night and alerts you the moment an answer gets worse." },
  { icon: "🤖", title: "AI agent monitoring", text: "Send each agent run with one HTTP call. Catch loops, tool errors, runaway costs, empty outputs and answers the tools never supported." },
  { icon: "⚙️", title: "n8n & Make monitoring", text: "Connect n8n or Make in two minutes. Get alerted on failures, silent failures (success with zero output), stuck runs, workflows switched off or stopped, error spikes, sudden drops in output, and an expired API key." },
  { icon: "🔔", title: "Watch for anything, in your own words", text: "Type what you care about, like \"tell me if the Order sync workflow runs fewer than 10 times a day\" or \"alert me for any refund over £200\". ProofMyAI shows how it understood you, how often it would have alerted last week, then watches and notifies you." },
  { icon: "🔍", title: "Step-by-step traces", text: "Follow one request from chatbot reply to agent, workflow, approval and result check on one timeline, with the first step that broke marked. Simulate a failure in one click to test your alerts." },
  { icon: "🎯", title: "Accuracy you can check", text: "Every verdict quotes the exact sentence it is based on. Our test cases and results are public on the benchmark page, so you can check the numbers yourself." },
  { icon: "✨", title: "Fix with AI, not just a score", text: "Problems are grouped by the help article that caused them. One click writes the corrected article and a safe system prompt for your bot." },
  { icon: "📈", title: "Chatbot analytics", text: "See what customers ask about, accuracy per topic, resolution and escalation rates, response times, 👍/👎 satisfaction and the questions your help docs don't answer yet." },
  { icon: "📡", title: "Live tracking", text: "Chatbot answers, agent runs and webhook events are checked within seconds; n8n/Make, Google Sheets and CRMs are read every 15 minutes (or instantly with a webhook). Each connection shows when data last arrived and when the next check is due." },
  { icon: "🔒", title: "Privacy built in", text: "Emails, phone numbers, card numbers and IBANs are masked before anything is stored or checked by AI. Your own rules (\"never say…\") are enforced on every answer." },
  { icon: "🏆", title: "Proof of value for clients", text: "Show clients their own numbers: wrong replies blocked before reaching a customer, risky actions stopped, silent failures caught and how fast they were fixed, compared with last month. Emailed to your client automatically every week or month, with your agency's name on it." },
  { icon: "🛡️", title: "Safety & security checks", text: "Catch prompt-injection and jailbreak attempts, leaked system prompts, exposed card numbers, rude replies and answers in the wrong language." },
  { icon: "🛡️", title: "AI trust report", text: "See, topic by topic, where your AI can decide on its own and where a person should still check, backed by proven accuracy. Plus a pre-send check that blocks a made-up answer before a customer sees it." },
  { icon: "✋", title: "Human approval for agents", text: "Agents prepare refunds, emails and payments; you approve the ones that matter with one click. Rejected actions stay blocked on retry, decisions become rules, every decision is logged." },
  { icon: "💓", title: "Heartbeats & result checks", text: "Know when a scheduled job never ran, and when an agent says \"done\" but the CRM record isn't there. Plus alerts when quality drops after a model or prompt change." },
  { icon: "🗂️", title: "CRM monitoring", text: "HubSpot, Salesforce, Pipedrive, Zoho, GoHighLevel and more, read-only. Know when leads stop arriving, come in without an email or owner, get duplicated, change in bulk or never get a follow-up." },
  { icon: "📗", title: "Google Sheets watch", text: "Get an alert when a sheet your automations fill stops updating, shows #REF! or #N/A errors, or a key column comes in empty." },
  { icon: "🟢", title: "Uptime & speed", text: "Monitor your chatbot, website or API every minute. Get an alert when it goes down or slows down, and when it's back." },
  { icon: "👥", title: "Team & client access", text: "Invite teammates or clients as viewers or editors. Perfect for agencies sharing results without sharing passwords." },
  { icon: "🧠", title: "Learns your business", text: "Mark any verdict right or wrong. A neural network trained on your own feedback re-ranks risk so the answers that matter rise to the top." },
];

const TOUR: TourTab[] = [
  { id: "overview", name: "Overview", subtitle: "One health score for your chatbot, agents, workflows, sheets and CRM, plus your trust score and approvals waiting.", img: "/tour/overview.webp", alt: "ProofMyAI overview: AI health score 66, 14-day chart, accuracy cards, AI trust score, approvals waiting, CRM and Google Sheets status" },
  { id: "audit", name: "Chatbot audit", subtitle: "Every answer graded against your help docs: correct, made up, not in docs, should escalate.", img: "/tour/audit.webp", alt: "Chatbot audit report with verdict counts and the answers that were made up" },
  { id: "fixes", name: "Fix list", subtitle: "Problems grouped by the help article that caused them, worst first.", img: "/tour/fixes.webp", alt: "Fix list grouping wrong answers by help article: returns, warranty, shipping and missing documentation" },
  { id: "fix-ai", name: "Fix with AI", subtitle: "One click writes the corrected article and a safe system prompt for your bot.", img: "/tour/fixres.webp", alt: "Fix with AI result showing a corrected help article ready to copy" },
  { id: "analytics", name: "Analytics", subtitle: "Topics customers ask about, accuracy per topic, resolution, satisfaction and gaps in your docs.", img: "/tour/analytics.webp", alt: "Chatbot analytics: topics, accuracy per topic, resolution rate and customer satisfaction" },
  { id: "trust", name: "Trust report", subtitle: "Topic by topic: where your AI can decide alone, where to spot-check and where a person must approve.", img: "/tour/trust.webp", alt: "AI trust report: trust score 85, 44% of decisions can be made alone, recommendations per topic" },
  { id: "approvals", name: "Approvals", subtitle: "Agents prepare refunds, payments and emails. You approve the risky ones with one click.", img: "/tour/approvals.webp", alt: "Approvals inbox with a refund and an invoice payment waiting for one-click approval" },
  { id: "crm", name: "CRM", subtitle: "HubSpot, Salesforce, Pipedrive, Zoho, GoHighLevel and more: duplicates, missing fields, leads not followed up.", img: "/tour/crm.webp", alt: "CRM monitoring for HubSpot showing duplicates and leads not followed up" },
  { id: "watches", name: "Watches", subtitle: "Write what to watch in plain English. ProofMyAI shows how it understood you and alerts you when it happens.", img: "/tour/watches.webp", alt: "Watch for anything box on the n8n page with plain-English watches, how each was understood and when it last alerted" },
  { id: "traces", name: "Traces", subtitle: "One request on one timeline, from chatbot to agent, workflow and approval, with the first broken step marked.", img: "/tour/traces.webp", alt: "Trace timeline showing each agent step and the first step that went wrong" },
  { id: "live", name: "Live tracking", subtitle: "Answers, agent runs and webhooks checked within seconds; n8n/Make, Sheets and CRMs every 15 minutes, with each connection's freshness shown.", img: "/tour/live.webp", alt: "Live tracking with status cards for chatbots, agents, n8n, Google Sheets and CRM, and a live feed" },
  { id: "connect", name: "Connect", subtitle: "Intercom, WhatsApp, Zendesk, n8n, Make or one HTTP call. Each takes 2 to 5 minutes.", img: "/tour/connect.webp", alt: "Connect page with no-code options for chatbots, AI agents and workflows" },
];

const WHY = [
  { icon: "⚖️", title: "Independent auditor", text: "Works with every bot platform, so you are not trusting the vendor to mark its own homework." },
  { icon: "✨", title: "Fixes, not just scores", text: "You get the corrected help article and a safer bot prompt, ready to paste." },
  { icon: "🧩", title: "One place for all your AI", text: "Chatbots, AI agents and n8n/Make workflows checked side by side." },
  { icon: "⏱️", title: "No code, minutes to start", text: "Upload a chat export or connect Intercom, WhatsApp or n8n in 2 to 5 minutes." },
  { icon: "🔒", title: "Privacy first", text: "Emails, phone and card numbers are masked before storage. Results-only mode, auto-delete and self-hosting available." },
  { icon: "🔔", title: "Alerts where you work", text: "Slack, Teams, Discord, Telegram, Google Chat, WhatsApp, email or any webhook." },
  { icon: "🧠", title: "Learns your business", text: "Mark a verdict right or wrong and the risk ranking adapts to what matters to you." },
  { icon: "📄", title: "Agency ready", text: "Branded client reports, read-only share links and viewer access for clients." },
  { icon: "🤝", title: "A real person behind it", text: "Talk directly to the developer on WhatsApp. New improvements ship every week." },
];

const AGENT_PROMPT = `Add ProofMyAI monitoring to this app (docs: ${SITE_URL}/docs).
1. Read the API key from the environment variable PROOFMYAI_KEY. Never hard-code it or expose it to the browser.
2. After each AI chatbot reply, send a fire-and-forget POST to ${SITE_URL}/api/v1/chat-events with the header "Authorization: Bearer <key>" and JSON { conversation_id, question, answer, latency_ms }.
3. When an AI agent run finishes, POST to ${SITE_URL}/api/v1/agent-runs with { run_id, agent_name, goal, status, final_output, steps }.
4. Use a short timeout and catch every error, so the app never slows down or fails because of monitoring.`;

const CURL_SNIPPET = `curl -X POST ${SITE_URL}/api/v1/chat-events \\
  -H "Authorization: Bearer $PROOFMYAI_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"conversation_id": "chat-8841",
       "question": "How much is shipping to Germany?",
       "answer": "Shipping to Germany is free on all orders."}'`;

function StatsStrip() {
  const left = foundingSpotsLeft();
  const items = [
    <>Every answer checked against <b>your own docs</b></>,
    <><b>15+ integrations</b>, no code needed</>,
    <>Set up in <b>2 minutes</b></>,
    <><b>Free</b> for 50 conversations a month</>,
    ...(left > 0 ? [<>🔥 <b>{left} of {FOUNDING_OFFER.spots}</b> founding spots left</>] : []),
  ];
  const row = (copy: number) => (
    <div className="stats-track" key={copy} aria-hidden={copy === 1}>
      {items.map((it, i) => <span key={i} className="stat-item">{it}<span className="stat-dot" aria-hidden>•</span></span>)}
    </div>
  );
  return <div className="stats-strip">{row(0)}{row(1)}</div>;
}

function GetStarted() {
  return (
    <section className="lp-section reveal" id="get-started" aria-labelledby="start-title">
      <h2 id="start-title">Get started in minutes</h2>
      <p className="lp-lead">Pick the way that suits you. Your first results arrive the moment data does.</p>
      <StartTabs tabs={[
        { id: "nocode", label: "🧩 No code", body: (
          <ol className="start-steps">
            <li><b>Create a free account</b>, no install needed.</li>
            <li><b>Connect your AI</b>: upload a chat export, paste an Intercom token, add the WhatsApp webhook or connect n8n/Make.</li>
            <li><b>Add your help articles</b> so answers are checked against your real policies.</li>
            <li><b>Get your audit</b> and fix list in minutes, then turn on alerts.</li>
          </ol>
        ) },
        { id: "api", label: "💻 Developer API", body: (
          <>
            <p className="sub">Send each conversation with one HTTP call. Agents and workflows work the same way.</p>
            <CopyBox label="cURL example" text={CURL_SNIPPET} />
            <p className="faint" style={{ marginTop: 8 }}>Full reference: <Link href="/docs#chat-events">chat events</Link> · <Link href="/docs#agent-runs">agent runs</Link> · <Link href="/docs#workflow-runs">workflow runs</Link></p>
          </>
        ) },
        { id: "agent", label: "✨ Set up with AI", body: (
          <>
            <p className="sub">Using Cursor, Claude Code or Copilot? Paste this prompt into your coding agent and it adds ProofMyAI for you.</p>
            <CopyBox label="coding agent prompt" text={AGENT_PROMPT} />
          </>
        ) },
      ]} />
      <div className="row" style={{ justifyContent: "center", marginTop: 22 }}>
        <Link href="/signup" className="btn btn-lg">Create free account →</Link>
        <Link href="/docs" className="btn btn-ghost btn-lg">Read the docs</Link>
      </div>
    </section>
  );
}

function WhyProofMyAI() {
  return (
    <section className="lp-section reveal" id="why" aria-labelledby="why-title">
      <h2 id="why-title">Why businesses choose ProofMyAI</h2>
      <p className="lp-lead">Built for teams that rely on AI to talk to customers but don&apos;t have time to read every chat.</p>
      <div className="why-grid">
        {WHY.map((w) => (
          <div className="why-item spot" key={w.title}>
            <span className="why-icon" aria-hidden>{w.icon}</span>
            <div><h3>{w.title}</h3><p>{w.text}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

const PLANS: { id: PlanId; name: string; price: number; featured: boolean; items: string[] }[] = [
  { id: "starter", name: "Starter", price: PLANS_BY_ID.starter.price, featured: false, items: PLAN_FEATURES.starter },
  { id: "growth", name: "Growth", price: PLANS_BY_ID.growth.price, featured: true, items: PLAN_FEATURES.growth },
  { id: "agency", name: "Agency", price: PLANS_BY_ID.agency.price, featured: false, items: PLAN_FEATURES.agency },
  { id: "compliance", name: "Compliance", price: PLANS_BY_ID.compliance.price, featured: false, items: PLAN_FEATURES.compliance },
];

/**
 * Starter begins on the Free plan; Growth and Agency go through sign-up straight to a
 * 14-day trial checkout for the chosen billing period; Compliance is sold by talking to us.
 */
function PlanButton({ p, yearly }: { p: (typeof PLANS)[number]; yearly: boolean }) {
  const cls = `btn ${p.featured ? "btn-shimmer" : "btn-ghost"}`;
  if (p.id === "compliance") return <Link href="/contact" className={cls} style={{ width: "100%" }}>Talk to us</Link>;
  if (p.id === "starter") {
    return (
      <>
        <Link href="/signup" className={cls} style={{ width: "100%" }}>Start free</Link>
        <p className="price-note plan-fine">Begin on the Free plan, upgrade to Starter any time</p>
      </>
    );
  }
  const yearlyTotal = `$${yearlyPrice(p.id).toLocaleString("en-US")}/year`;
  return (
    <>
      <Link href={planSignupHref(p.id, "month")} className={`${cls} when-monthly-inline`} style={{ width: "100%" }}>Start 14-day free trial</Link>
      {yearly ? <Link href={planSignupHref(p.id, "year")} className={`${cls} when-yearly-inline`} style={{ width: "100%" }}>Start 14-day free trial</Link> : null}
      <p className="price-note plan-fine">
        <span className="when-monthly-inline">Then ${p.price}/month</span>
        {yearly ? <span className="when-yearly-inline">Then {yearlyTotal}</span> : null} · cancel before day 14 and pay nothing
      </p>
    </>
  );
}

export const dynamic = "force-dynamic"; // approved testimonials appear without a redeploy

export const metadata = {
  title: { absolute: "ProofMyAI · AI Chatbot, AI Agent & n8n Workflow Monitoring" },
  description: metaDescription(SITE_DESCRIPTION),
  alternates: { canonical: "/" },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization", "@id": `${SITE_URL}/#org`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icon.png`,
      description: SITE_DESCRIPTION,
      founder: { "@type": "Person", name: LEGAL_NAME, url: DEVELOPER_URL, jobTitle: "Founder and AI automation developer" },
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: SUPPORT_EMAIL, url: `${SITE_URL}/support`, availableLanguage: ["English", "Urdu"] },
      sameAs: SAME_AS,
    },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: SITE_NAME, url: SITE_URL, publisher: { "@id": `${SITE_URL}/#org` } },
    {
      "@type": "SoftwareApplication", name: SITE_NAME, url: SITE_URL, applicationCategory: "BusinessApplication", operatingSystem: "Web",
      description: SITE_DESCRIPTION,
      offers: PLANS.map((p) => ({ "@type": "Offer", name: p.name, price: p.price, priceCurrency: "USD" })),
    },
    { "@type": "FAQPage", mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    demoVideoJsonLd(),
    videoJsonLd(VIDEOS.marketing),
    videoJsonLd(VIDEOS.tutorial),
    videoJsonLd(VIDEOS.live),
  ],
};

function FoundingOffer() {
  const left = foundingSpotsLeft();
  if (left <= 0) return null;
  return (
    <section className="lp-section" id="founding">
      <div className="card founding">
        <div className="founding-icon" aria-hidden>🚀</div>
        <h2>Become a founding customer</h2>
        <p className="lp-lead" style={{ marginTop: 8 }}>
          ProofMyAI is new, so our first {FOUNDING_OFFER.spots} businesses running AI chatbots, agents or n8n/Make automations get
          <strong> {FOUNDING_OFFER.reward}</strong> and direct WhatsApp access to the developer. No automatic charge. We ask for {FOUNDING_OFFER.ask}.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          <Link href="/signup?founding=1" className="btn">🎉 Claim a founding spot</Link>
        </div>
        <p className="faint" style={{ marginTop: 10 }}>{left} of {FOUNDING_OFFER.spots} spots left · activates instantly</p>
      </div>
    </section>
  );
}

function SocialProof() {
  const quotes = publishedTestimonials(6);
  const rating = ratingSummary();
  if (quotes.length === 0) return <FoundingOffer />;
  return (
    <>
      <section className="lp-section" id="customers" aria-labelledby="customers-title">
        <h2 id="customers-title">💬 What customers say</h2>
        <p className="lp-lead">
          Real feedback from ProofMyAI users, shown with their permission.
          {rating ? <> Average rating <strong>{rating.avg.toFixed(1)} / 5</strong> from {rating.count} customers.</> : null}
        </p>
        <div className="testimonials">
          {quotes.map((t) => (
            <figure key={t.id} className="card testimonial">
              <div className="stars" aria-label={`${t.rating} out of 5`}>{"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}</div>
              <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
              {t.result ? <div className="result">✓ {t.result}</div> : null}
              <figcaption>
                <strong>{t.name}</strong>
                <div className="faint">
                  {[t.role, t.company].filter(Boolean).join(", ")}
                  {t.website ? <> · <a href={t.website} target="_blank" rel="noopener nofollow">{t.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></> : null}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <FoundingOffer />
    </>
  );
}

export default function Landing() {
  return (
    <div className="lp-page">
      <SiteHeader />

      <main>
      <StatsStrip />
      <section className="lp-hero lp-hero-split">
        <div className="hero-spotlight" aria-hidden />
        <div className="lp-hero-copy">
          <Link href="/changelog" className="shiny-pill"><span className="shiny-pill-new">New</span><span className="shiny-text">CRM monitoring, one-click approvals &amp; Grok support</span> →</Link>
          <h1 style={{ marginTop: 18 }}>Your AI talks to customers 24/7.<br /><span className="gradient-text gradient-anim">Know when it</span> <WordRotate words={["gets things wrong.", "makes things up.", "breaks your policy.", "leaks card data.", "misses a hand-over."]} /></h1>
          <p>ProofMyAI checks your chatbot&apos;s answers, your AI agents, your n8n/Make workflows, Google Sheets and CRM, then shows what broke with the evidence, how to fix it, and tells you when the problem has stopped, before your customers notice.</p>
          <div className="row lp-hero-ctas">
            <ShortcutLink href="/signup" k="s" className="btn btn-lg btn-shimmer" event="hero_start">Get your free AI audit →</ShortcutLink>
            <ShortcutLink href="#tour" k="d" className="btn btn-ghost btn-lg" event="hero_demo">▶ See it in action</ShortcutLink>
          </div>
          <p className="hero-alt">Not ready to sign up? <Link href="/tools/n8n-workflow-checker">Scan an n8n workflow free</Link>, <Link href="/tools/ai-chatbot-checker">check one chatbot answer</Link> or <Link href="/free-audit">get a done-for-you audit</Link>.</p>
          <ul className="lp-trust">
            <li>✓ Free for 50 conversations a month</li>
            <li>✓ Cancel any time</li>
            <li>✓ Set up in 5 minutes</li>
          </ul>
        </div>
        <HeroMockup />
      </section>

      <section className="lp-section reveal" id="tour" aria-labelledby="tour-title">
        <h2 id="tour-title">Take the 30-second tour</h2>
        <p className="lp-lead">Real screens from ProofMyAI with sample data. Click a tab, or just watch.</p>
        <ProductTour tabs={TOUR} video={DEMO_VIDEO.src} poster={DEMO_VIDEO.poster} />
      </section>

      <section className="lp-section lp-works" aria-label="Works with">
        <p className="lp-works-title">Works with the tools you already use</p>
        <IntegrationMarquee />
        <p className="sub" style={{ textAlign: "center", marginTop: 10 }}>Works with any AI model: Grok, ChatGPT, Claude, Gemini, Llama, Mistral or DeepSeek. <Link href="/solutions/grok-chatbot-monitoring">Using Grok? →</Link></p>
      </section>

      <section className="lp-section reveal" id="flow" aria-labelledby="flow-title">
        <h2 id="flow-title">Plug in once. Every answer gets checked.</h2>
        <p className="lp-lead">Your chatbots, WhatsApp, help desk, automations and agents stream into ProofMyAI. You get alerts, a fix list and reports.</p>
        <BeamDiagram />
      </section>

      <section className="lp-section lp-band reveal" id="how-it-catches" aria-labelledby="catch-title">
        <h2 id="catch-title">See a wrong answer caught in seconds</h2>
        <p className="lp-lead">Your bot sounds confident even when it&apos;s wrong. ProofMyAI checks every answer against your own help docs and tells you what to fix.</p>
        <CatchDemo />
      </section>

      <section className="lp-section reveal" id="video" aria-labelledby="video-title">
        <h2 id="video-title">See ProofMyAI in 95 seconds</h2>
        <p className="lp-lead">Connect in 2 minutes, catch wrong answers with the exact fix, and get alerted before your customers notice.</p>
        <div className="video-wrap">
          <ScrollVideo src={DEMO_VIDEO.src} webm={DEMO_VIDEO.webm} poster={DEMO_VIDEO.poster} title={DEMO_VIDEO.title} />
          <p className="sub" style={{ textAlign: "center", marginTop: 14 }}>
            <a href={`https://www.youtube.com/watch?v=${VIDEOS.marketing.id}`} target="_blank" rel="noopener">Watch on YouTube ↗</a> · Ready to set it up? <a href={`https://www.youtube.com/watch?v=${VIDEOS.tutorial.id}`} target="_blank" rel="noopener">Watch the 3-minute setup tutorial ↗</a>
          </p>
        </div>
      </section>

      <section className="lp-section lp-band reveal" id="live-demo" aria-labelledby="live-demo-title">
        <h2 id="live-demo-title">Watch it catch problems live</h2>
        <p className="lp-lead">No slides. A wrong answer flagged in seconds, the alert on WhatsApp and Slack, a risky refund approved with one click, duplicate CRM leads and a missed job, all in the real app.</p>
        <div className="video-wrap">
          <YouTube id={VIDEOS.live.id} title={VIDEOS.live.title} />
        </div>
      </section>

      <section className="lp-section">
        <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 28, alignItems: "center" }}>
          <ScoreRing score={72} size={150} />
          <div style={{ flex: "1 1 280px" }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span className="badge badge-warn">Illustrative example</span>
              <span className="faint">Sample numbers, not a real customer</span>
            </div>
            <h3>What a first audit report looks like for an online store</h3>
            <p className="sub"><b><NumberTicker value={412} /></b> chatbot answers checked · <b><NumberTicker value={31} /></b> made-up answers (mostly shipping prices) · <b><NumberTicker value={9} /></b> refund disputes never handed to a human · 1 n8n order-sync workflow silently returning zero orders for 3 days.</p>
            <p className="sub" style={{ margin: 0 }}>Top fix: <strong>update the &quot;Shipping rates&quot; article</strong>. It caused 22 of the 31 wrong answers.</p>
            <p className="faint" style={{ margin: "8px 0 0" }}>These figures show the format of a ProofMyAI report. <Link href="/signup">Run a free audit</Link> to see your own numbers.</p>
          </div>
        </div>
      </section>

      <section className="lp-section lp-band lp-band-alt reveal" id="features">
        <h2>Everything your AI does, checked in one place</h2>
        <p className="lp-lead">Customers are losing trust in support bots, and most bot platforms have no built-in quality control. ProofMyAI is the independent auditor that works with all of them.</p>
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <div className="card feature-card spot" key={f.title}>
              <div className="feature-icon" aria-hidden>{f.icon}</div>
              <h3>{f.title}</h3>
              <p className="sub" style={{ margin: 0 }}>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section reveal">
        <h2>Set up in 3 steps</h2>
        <p className="lp-lead">No code needed for chatbots and workflows. Agents need one HTTP call.</p>
        <div className="grid grid-3 steps" style={{ marginTop: 24 }}>
          {([
            [1, "Connect", "Upload a chat export, paste your bot's URL, add an n8n/Make key, or add one HTTP call to your agent."],
            [2, "Check", "AI grades every answer and run against your own docs and limits. Results in minutes."],
            [3, "Fix & relax", "Follow the fix list. Nightly tests and live monitoring alert you on Slack or email if anything breaks again."],
          ] as const).map(([n, t, d]) => (
            <div className="card step-card spot" key={n}>
              <StepArt step={n} />
              <div className="row" style={{ gap: 10, marginTop: 16 }}><span className="step-num">{n}</span><h3 style={{ margin: 0 }}>{t}</h3></div>
              <p className="sub" style={{ margin: "8px 0 0" }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <WhyProofMyAI />

      <GetStarted />

      <SocialProof />

      <section className="lp-section lp-band reveal" id="pricing">
        <h2>Simple pricing</h2>
        <p className="lp-lead"><strong>Free forever for 50 conversations a month</strong>. Every paid plan includes a 14-day free trial and a 14-day money-back guarantee.</p>
        {yearlyAvailable() ? (
          <div className="period-toggle lp-period" role="radiogroup" aria-label="Billing period">
            <input type="radio" name="lp-period" id="lp-month" defaultChecked />
            <label htmlFor="lp-month">Monthly</label>
            <input type="radio" name="lp-period" id="lp-year" />
            <label htmlFor="lp-year">Yearly <span className="badge badge-ok">2 months free</span></label>
          </div>
        ) : null}
        <div className="grid grid-4 lp-plans">
          {PLANS.map((p) => (
            <div className={`card plan ${p.featured ? "featured" : ""}`} key={p.name}>
              <div className="row between">
                <h3>{p.name}</h3>
                {p.featured ? <span className="badge badge-brand">Most popular</span> : p.name === "Compliance" ? <span className="badge badge-info">Regulated</span> : null}
              </div>
              <div className="price">${p.price}<small>/month</small></div>
              {yearlyAvailable() && priceId(p.id, "year") ? (
                <div className="when-yearly">
                  <div className="price">${yearlyPrice(p.id).toLocaleString("en-US")}<small>/year</small></div>
                  <p className="price-note">Works out at ${yearlyMonthly(p.id)}/month · save ${p.price * 12 - yearlyPrice(p.id)}</p>
                </div>
              ) : null}
              <ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
              <PlanButton p={p} yearly={yearlyAvailable() && Boolean(priceId(p.id, "year"))} />
            </div>
          ))}
        </div>
        <p className="sub" style={{ textAlign: "center", marginTop: 14 }}>Strict data rules? Results-only storage, auto-delete, AI provider off, a signed DPA or a <strong>self-hosted</strong> ProofMyAI. <Link href="/security">See the Trust Center</Link>.</p>
      </section>

      <section className="lp-section faq faq-split reveal" id="faq">
        <div className="faq-side">
          <h2>Frequently asked questions</h2>
          <p className="lp-lead">Everything you need to know before your first AI audit.</p>
          <p className="faint">Still unsure? <Link href="/support">Ask the developer</Link>, usually answered the same day.</p>
        </div>
        <div className="faq-list">
          {FAQS.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p className="sub" style={{ margin: 0 }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <div className="cta-banner">
          <Meteors />
          <h2>Is your AI telling customers the truth?</h2>
          <p>Find out in 5 minutes with a free AI audit.</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/signup" className="btn btn-lg btn-white btn-glow">Get your free AI audit →</Link>
            <a href="#pricing" className="btn btn-lg btn-outline-white">See pricing</a>
          </div>
        </div>
      </section>
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structuredData)} />
    </div>
  );
}
