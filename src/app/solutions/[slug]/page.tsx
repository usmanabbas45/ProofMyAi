import { metaDescription, metaTitle } from "@/lib/meta";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site";
import { YouTube } from "@/components/video";
import { Meteors } from "@/components/illustrations";
import { jsonLd, SITE_URL, SOLUTIONS, VIDEOS, videoJsonLd } from "@/lib/seo";

export function generateStaticParams() {
  return SOLUTIONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = SOLUTIONS.find((x) => x.slug === slug);
  if (!s) return {};
  return {
    title: metaTitle(s.title),
    description: metaDescription(s.description),
    alternates: { canonical: `/solutions/${s.slug}` },
    openGraph: { title: `${s.title} · ProofMyAI`, description: metaDescription(s.description, 200), url: `/solutions/${s.slug}`, ...(s.lang === "de" ? { locale: "de_DE" } : {}) },
  };
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = SOLUTIONS.find((x) => x.slug === slug);
  if (!s) notFound();
  // Where each topic begins in the tutorial (chatbot pages play from the start).
  const de = s.lang === "de";
  const L = de
    ? { badge: "Lösung", start: "Kostenlos starten →", pricing: "Preise ansehen", what: `Was ist ${s.kicker}?`, metrics: "Wichtige Kennzahlen", objectives: "Hauptziele", problem: "Das Problem", how: "So löst ProofMyAI das", video: "So richten Sie es ein (Video auf Englisch)", videoLead: "Die komplette Einrichtung in 3 Minuten, Klick für Klick.", get: "Was Sie bekommen", tools: "Beliebte Tools", toolsLead: "Welches passt, hängt davon ab, wer den Bot betreibt und ob Sie programmieren möchten.", faq: "Häufige Fragen", cta: "Heute kostenlos testen", ctaSub: "In wenigen Minuten eingerichtet. Kostenloser Plan verfügbar.", ctaBtn: "Kostenlos starten →", also: "Siehe auch: " }
    : { badge: "Solution", start: "Start free →", pricing: "See pricing", what: `What is ${s.kicker}?`, metrics: "Key metrics to monitor", objectives: "Main objectives", problem: "The problem", how: "How ProofMyAI solves it", video: "Watch how to set it up", videoLead: "", get: "What you get", tools: `Popular ${s.kicker} tools`, toolsLead: "Which one fits depends on who runs your bot and whether you want to write code.", faq: "Questions", cta: "Try it free today", ctaSub: "Set up in minutes. Free plan available.", ctaBtn: "Get your free AI audit →", also: "Also see: " };
  const start = ({ "ai-agent-monitoring": 86, "n8n-workflow-monitoring": 100, "crm-monitoring": 130, "ai-agent-human-approval": 146 } as Record<string, number>)[s.slug];
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "ProofMyAI", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: s.kicker, item: `${SITE_URL}/solutions/${s.slug}` },
      ] },
      ...(s.definition ? [{ "@type": "DefinedTerm", name: s.kicker, description: s.definition, url: `${SITE_URL}/solutions/${s.slug}#what-is` }] : []),
      ...(s.metrics ? [{ "@type": "ItemList", name: `Key ${s.kicker} metrics`, itemListElement: s.metrics.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.name, description: m.text })) }] : []),
      { "@type": "FAQPage", ...(de ? { inLanguage: "de" } : {}), mainEntity: s.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      videoJsonLd(VIDEOS.tutorial),
    ],
  };
  return (
    <div className="lp-page">
      <SiteHeader />
      <main lang={s.lang}>
        <section className="lp-hero lp-hero-fx">
          <div className="hero-spotlight" aria-hidden />
          <span className="shiny-pill"><span className="shiny-pill-new">{L.badge}</span><span className="shiny-text">{s.kicker}</span></span>
          <h1 style={{ marginTop: 18 }}><span className="gradient-anim">{s.title}</span></h1>
          <p>{s.intro}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/signup" className="btn btn-lg btn-shimmer">{L.start}</Link>
            <Link href="/#pricing" className="btn btn-ghost btn-lg">{L.pricing}</Link>
          </div>
        </section>

        {s.definition ? (
          <section className="lp-section reveal" id="what-is">
            <h2>{L.what}</h2>
            <p className="lp-lead definition">{s.definition}</p>
          </section>
        ) : null}

        {s.metrics ? (
          <section className="lp-section reveal" id="metrics">
            <h2>{L.metrics}</h2>
            <ol className="metric-list">
              {s.metrics.map((m) => <li key={m.name} className="card"><strong>{m.name}:</strong> {m.text}</li>)}
            </ol>
          </section>
        ) : null}

        {s.objectives ? (
          <section className="lp-section reveal" id="objectives">
            <h2>{L.objectives}</h2>
            <div className="grid grid-3" style={{ marginTop: 20 }}>
              {s.objectives.map((o) => <div key={o.name} className="card"><h3>{o.name}</h3><p className="sub" style={{ margin: 0 }}>{o.text}</p></div>)}
            </div>
          </section>
        ) : null}

        <section className="lp-section reveal">
          <h2>{L.problem}</h2>
          <div className="grid grid-2" style={{ marginTop: 20 }}>
            {s.problems.map((p) => <div key={p} className="card problem-card"><p style={{ margin: 0 }}>⚠️ {p}</p></div>)}
          </div>
        </section>

        <section className="lp-section reveal">
          <h2>{L.how}</h2>
          <div className="grid grid-3" style={{ marginTop: 20 }}>
            {s.steps.map((st, i) => (
              <div key={st.title} className="card">
                <div className="feature-icon" style={{ fontWeight: 800 }}>{i + 1}</div>
                <h3>{st.title}</h3>
                <p className="sub" style={{ margin: 0 }}>{st.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section reveal">
          <h2>{L.video}</h2>
          <p className="lp-lead">{L.videoLead || start ? (L.videoLead || `The video starts at the ${s.kicker} part of the full 3-minute tutorial.`) : "The full setup in 3 minutes, click by click."}</p>
          <div className="video-wrap">
            <YouTube id={VIDEOS.tutorial.id} title={VIDEOS.tutorial.title} start={start} />
          </div>
        </section>

        <section className="lp-section reveal">
          <h2>{L.get}</h2>
          <ul className="grid grid-2" style={{ listStyle: "none", padding: 0, marginTop: 20 }}>
            {s.features.map((f) => <li key={f} className="card">✅ {f}</li>)}
          </ul>
        </section>

        {s.tools ? (
          <section className="lp-section reveal" id="tools">
            <h2>{L.tools}</h2>
            <p className="lp-lead">{L.toolsLead}</p>
            <ul className="tool-list">
              {s.tools.map((t) => <li key={t.name} className="card"><strong>{t.name}</strong><span>{t.text}</span></li>)}
            </ul>
          </section>
        ) : null}

        <section className="lp-section faq reveal">
          <h2>{L.faq}</h2>
          <div style={{ maxWidth: 820, margin: "20px auto 0" }}>
            {s.faqs.map((f) => <details key={f.q}><summary>{f.q}</summary><p className="sub" style={{ margin: 0 }}>{f.a}</p></details>)}
          </div>
        </section>

        <section className="lp-section" style={{ textAlign: "center" }}>
          <div className="cta-banner">
            <Meteors />
            <h2>{L.cta}</h2>
            <p>{L.ctaSub}</p>
            <Link href="/signup" className="btn btn-lg btn-white btn-glow">{L.ctaBtn}</Link>
          </div>
          <p className="sub" style={{ marginTop: 18 }}>
            {L.also}{SOLUTIONS.filter((x) => x.slug !== s.slug).map((x, i) => <span key={x.slug}>{i ? " · " : ""}<Link href={`/solutions/${x.slug}`}>{x.kicker}</Link></span>)}
          </p>
        </section>
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} />
    </div>
  );
}
