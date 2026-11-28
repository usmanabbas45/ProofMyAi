import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site";
import { Meteors } from "@/components/illustrations";
import { metaDescription } from "@/lib/meta";
import { COMPARE_REVIEWED, COMPARISONS } from "@/lib/compare";
import { jsonLd, SITE_URL } from "@/lib/seo";

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = COMPARISONS.find((x) => x.slug === slug);
  if (!c) return {};
  return { title: { absolute: `${c.name} Alternative (No Code) · ProofMyAI vs ${c.name}` }, description: metaDescription(c.description), alternates: { canonical: `/compare/${c.slug}` } };
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = COMPARISONS.find((x) => x.slug === slug);
  if (!c) notFound();
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "ProofMyAI", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: `${c.name} alternative`, item: `${SITE_URL}/compare/${c.slug}` },
      ] },
      { "@type": "FAQPage", mainEntity: c.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
  return (
    <div className="lp-page">
      <SiteHeader />
      <main>
        <section className="lp-hero lp-hero-fx">
          <div className="hero-spotlight" aria-hidden />
          <span className="shiny-pill"><span className="shiny-pill-new">Compare</span><span className="shiny-text">ProofMyAI vs {c.name}</span></span>
          <h1 style={{ marginTop: 18 }}>{c.title.split(":")[0]}: <span className="gradient-anim">{c.title.split(":").slice(1).join(":").trim()}</span></h1>
          <p>{c.summary}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href={`/signup?utm_source=compare_${c.slug}`} className="btn btn-lg btn-shimmer">Try ProofMyAI free →</Link>
            <Link href="/tools/ai-chatbot-checker" className="btn btn-ghost btn-lg">Check an answer now</Link>
          </div>
        </section>

        <section className="lp-section reveal">
          <h2>Side by side</h2>
          <div className="card compare-table-wrap">
            <table className="compare-table">
              <thead><tr><th scope="col">Feature</th><th scope="col">ProofMyAI</th><th scope="col">{c.name}</th></tr></thead>
              <tbody>{c.rows.map(([f, us, them]) => <tr key={f}><th scope="row">{f}</th><td>{us}</td><td>{them}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="faint" style={{ textAlign: "center", marginTop: 10 }}>Based on each product&apos;s public information, reviewed {c.reviewed ?? COMPARE_REVIEWED}. {c.name} is a trademark of its owner; check their website for current features and pricing.</p>
        </section>

        <section className="lp-section reveal">
          <div className="grid grid-2">
            <div className="card"><h3>Choose ProofMyAI if…</h3><ul className="compare-list ok">{c.chooseUs.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div className="card"><h3>Choose {c.name} if…</h3><ul className="compare-list">{c.chooseThem.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
        </section>

        <section className="lp-section faq reveal">
          <h2>Questions</h2>
          <div style={{ maxWidth: 820, margin: "20px auto 0" }}>
            {c.faqs.map((f) => <details key={f.q}><summary>{f.q}</summary><p className="sub" style={{ margin: 0 }}>{f.a}</p></details>)}
          </div>
        </section>

        <section className="lp-section">
          <div className="cta-banner">
            <Meteors />
            <h2>See what your chatbot gets wrong</h2>
            <p>Free plan. No code. Set up in 5 minutes.</p>
            <Link href={`/signup?utm_source=compare_${c.slug}`} className="btn btn-lg btn-white btn-glow">Get your free AI audit →</Link>
          </div>
          <p className="sub" style={{ textAlign: "center", marginTop: 18 }}>
            Also compare: {COMPARISONS.filter((x) => x.slug !== c.slug).map((x) => <Link key={x.slug} href={`/compare/${x.slug}`}>ProofMyAI vs {x.name}</Link>)}
          </p>
        </section>
      </main>
      <SiteFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} />
    </div>
  );
}
