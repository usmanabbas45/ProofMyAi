import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print";
import { ValueReportView } from "@/components/value-report";
import { get } from "@/lib/db";
import { valueReport } from "@/lib/valuereport";

export const metadata: Metadata = { title: "Proof of value report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Read-only "Proof of value" report that agencies send to their clients (print to PDF). */
export default async function SharedValueReport({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ m?: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) notFound();
  const p = get<{ id: number; name: string; brand: string | null }>("SELECT id, name, report_brand AS brand FROM projects WHERE value_share_token = ?", token);
  if (!p) notFound();
  const m = (await searchParams).m;
  const r = valueReport(p.id, m && /^\d{4}-\d{2}$/.test(m) ? m : undefined);
  const brand = p.brand || "ProofMyAI";
  return (
    <div className="report">
      <div className="content" style={{ margin: "0 auto", maxWidth: 1000 }}>
        <div className="row between" style={{ marginBottom: 20 }}>
          <div className="logo" style={{ padding: 0 }}><span className="logo-mark">✓</span>{brand}</div>
          <PrintButton />
        </div>
        <h1>AI &amp; automation report</h1>
        <ValueReportView r={r} brand={brand} project={p.name} />
      </div>
    </div>
  );
}
