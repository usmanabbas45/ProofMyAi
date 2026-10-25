import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site";
import { jsonLd, SITE_URL } from "@/lib/seo";
import { Scanner } from "./Scanner";

export const metadata: Metadata = {
  title: { absolute: "Free n8n Workflow Checker · Find Silent Failures & Exposed Keys | ProofMyAI" },
  description: "Free n8n workflow risk scanner. Paste a workflow and see in seconds: API keys pasted in nodes, open webhooks, errors that pass as success, no retries, no error workflow. Runs in your browser, nothing is uploaded.",
  alternates: { canonical: "/tools/n8n-workflow-checker" },
};

const CHECKS = [
  ["🔴 Keys pasted in nodes", "OpenAI, Anthropic, Google, Slack, Stripe, GitHub and AWS keys, bearer tokens and secrets typed into headers instead of Credentials."],
  ["🔴 Open webhooks", "Webhook nodes anyone can call: fake leads, fake orders and a surprise AI bill."],
  ["🔴 Errors passed as success", "\"On Error: Continue\" nodes that let a failed step end the run green."],
  ["🟠 No retries", "AI and API steps that fail the whole run on one 429 or 502."],
  ["🟠 Unchecked AI output", "AI steps whose answer goes straight on with no Structured Output Parser or check, so a \"200 OK\" with broken JSON slips through."],
  ["🟠 Silent empty results", "Data steps with no check for 0 items, the classic \"success, but nothing happened\"."],
  ["🟠 No error workflow", "Failures that only reach the execution log, never you."],
  ["🟠 Pinned test data", "Customer data that travels with every export and share."],
  ["🟡 Timezone, switched-off and unreachable nodes", "Schedules on the server's clock, forgotten disabled steps and nodes that never run."],
];

const FAQ = [
  { q: "Is my workflow uploaded anywhere?", a: "No. The scanner runs entirely in your browser. The workflow you paste is never sent to ProofMyAI or anyone else, and nothing is stored. You can even disconnect from the internet after the page loads and it still works." },
  { q: "How do I copy an n8n workflow?", a: "Open the workflow in n8n, click on the canvas, press Ctrl+A (Cmd+A on Mac) and then Ctrl+C. Paste it here. For the full check, including the error workflow and timezone, use the ⋯ menu → Download and paste the file's contents." },
  { q: "Why do n8n workflows fail silently?", a: "n8n marks a run as success when every node finishes, even if a step returned 0 items, an HTTP call answered with an error that was set to never fail, or a node was set to continue on error. Without an error workflow, failures only appear in the execution log." },
  { q: "Does this replace monitoring?", a: "No. The scanner checks how a workflow is built. To catch what actually happens on each run (empty results, expired keys, workflows that stop running), connect n8n to ProofMyAI with a read-only API key. The free plan covers it." },
  { q: "Is it free?", a: "Yes, free with no sign-up and no limit." },
];

export default function N8nCheckerPage() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebApplication", name: "n8n Workflow Checker", url: `${SITE_URL}/tools/n8n-workflow-checker`, applicationCategory: "DeveloperApplication", operatingSystem: "Web",
        offers: { "@type": "Offer", price: 0, priceCurrency: "USD" }, publisher: { "@id": `${SITE_URL}/#org` },
        description: "Scans an n8n workflow for exposed API keys, open webhooks, swallowed errors, missing retries, missing error workflows and silent empty results. Runs in the browser." },
      { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
  return (
    <div className="lp-page">
      <SiteHeader />
      <main>
        <section className="lp-hero lp-hero-fx">
          <div className="hero-spotlight" aria-hidden />
          <span className="shiny-pill"><span className="shiny-pill-new">Free tool</span><span className="shiny-text">No sign-up · runs in your browser</span></span>
          <h1 style={{ marginTop: 18 }}>n8n Workflow Checker: <span className="gradient-anim">will it fail without telling you?</span></h1>
          <p>Paste a workflow and see in seconds what could break silently or leak: keys pasted in nodes, open webhooks, errors that pass as success, missing retries and more. Each problem comes with the exact fix.</p>
        </section>

        <section className="lp-section" style={{ paddingTop: 0 }}>
          <Scanner />
        </section>

        <section className="lp-section reveal">
          <h2>What the checker looks for</h2>
          <div className="grid grid-3" style={{ marginTop: 20 }}>
            {CHECKS.map(([t, d]) => <div key={t} className="card"><h3>{t}</h3><p className="sub" style={{ margin: 0 }}>{d}</p></div>)}
          </div>
          <p className="sub" style={{ textAlign: "center", marginTop: 16 }}>Fixed rules, no AI guessing: the same workflow always gets the same result.</p>
        </section>

        <section className="lp-section faq reveal">
          <h2>Questions</h2>
          <div style={{ maxWidth: 820, margin: "20px auto 0" }}>
            {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p className="sub" style={{ margin: 0 }}>{f.a}</p></details>)}
          </div>
          <p className="sub" style={{ textAlign: "center", marginTop: 18 }}>Learn more: <Link href="/solutions/n8n-workflow-monitoring">n8n monitoring</Link> · <Link href="/tools/ai-chatbot-checker">Free chatbot answer checker</Link> · <Link href="/blog">Guides</Link></p>
        </section>
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} />
    </div>
  );
}
