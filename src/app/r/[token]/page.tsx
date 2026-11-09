import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print";
import { HBars, ScoreRing, SeverityBadge, VerdictBadge } from "@/components/ui";
import { fixList, riskSummary } from "@/lib/audit/run";
import { all, get } from "@/lib/db";
import { VERDICT_LABELS, VERDICTS, type Verdict } from "@/lib/judge/types";

export const metadata: Metadata = { title: "AI quality report", robots: { index: false, follow: false } };

const COLOR: Record<Verdict, string> = {
  correct: "var(--ok)", unsupported: "var(--warn)", hallucination: "var(--bad)", should_escalate: "var(--bad)", off_policy: "var(--brand)", unclear: "var(--info)",
};

/** Read-only, shareable client report (agencies send this to their clients; print to PDF). */
export default async function SharedReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{16,64}$/.test(token)) notFound();
  const audit = get<{ id: number; name: string; score: number | null; judge: string | null; created_at: string; project: string; brand: string | null }>(
    `SELECT a.id, a.name, a.score, a.judge, a.created_at, p.name AS project, p.report_brand AS brand
       FROM audits a JOIN projects p ON p.id = a.project_id WHERE a.share_token = ?`, token,
  );
  if (!audit) notFound();
  const counts = all<{ verdict: Verdict; n: number }>(
    "SELECT COALESCE(corrected_verdict, verdict) AS verdict, COUNT(*) AS n FROM audit_items WHERE audit_id = ? GROUP BY 1", audit.id,
  );
  const total = counts.reduce((s, c) => s + c.n, 0);
  const problems = total - (counts.find((c) => c.verdict === "correct")?.n ?? 0);
  const frustrated = get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_items WHERE audit_id = ? AND frustrated = 1", audit.id)?.n ?? 0;
  const items = all<{ id: number; question: string; answer: string; verdict: Verdict; severity: string; reason: string }>(
    `SELECT id, question, answer, COALESCE(corrected_verdict, verdict) AS verdict, severity, reason FROM audit_items
      WHERE audit_id = ? AND COALESCE(corrected_verdict, verdict) <> 'correct'
      ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, COALESCE(risk, 0) DESC LIMIT 40`, audit.id,
  );
  const fixes = fixList(audit.id);
  const risk = riskSummary(audit.id);
  const flagTotal = Object.values(risk.flags).reduce((a, b) => a + b, 0);
  const brand = audit.brand || "ProofMyAI";

  return (
    <div className="report">
      <div className="content" style={{ margin: "0 auto", maxWidth: 1000 }}>
        <div className="row between" style={{ marginBottom: 20 }}>
          <div className="logo" style={{ padding: 0 }}><span className="logo-mark">✓</span>{brand}</div>
          <PrintButton />
        </div>
        <h1>AI chatbot quality report</h1>
        <p className="sub">{audit.project} · {audit.name} · {new Date(`${audit.created_at.replace(" ", "T")}Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · {total} answers checked{audit.judge ? ` · graded by ${audit.judge}` : ""}</p>

        <div className="grid grid-3" style={{ marginTop: 16 }}>
          <div className="card" style={{ display: "grid", placeItems: "center" }}><ScoreRing score={audit.score == null ? null : Math.round(audit.score)} label="Accuracy score" /></div>
          <div className="card"><h3>Verdicts</h3><HBars rows={VERDICTS.map((v) => ({ label: VERDICT_LABELS[v], value: counts.find((c) => c.verdict === v)?.n ?? 0, color: COLOR[v] }))} /></div>
          <div className="card stack">
            <div className="stat"><span className="stat-label">Problem answers</span><span className="stat-value">{problems}</span></div>
            <div className="stat"><span className="stat-label">Frustrated customers</span><span className="stat-value">{frustrated}</span></div>
          </div>
        </div>

        {risk.high + risk.medium > 0 ? (
          <div className="card">
            <h3>⚠️ Risk avoided by catching these</h3>
            <p style={{ margin: 0 }}>
              <strong>{risk.high}</strong> answer{risk.high === 1 ? "" : "s"} could have created legal or financial exposure, and <strong>{risk.medium}</strong> misled or frustrated customers.{risk.statedAsFact ? <> <strong>{risk.statedAsFact}</strong> wrong answer{risk.statedAsFact === 1 ? " was" : "s were"} stated as fact, with nothing to make a customer double-check.</> : null}
              {flagTotal ? ` ${flagTotal} conversation problem${flagTotal === 1 ? "" : "s"} (asking again, restarting, fallbacks or contradictions) were also found.` : ""}
            </p>
          </div>
        ) : null}

        <div className="card">
          <h3>📋 What to fix first</h3>
          {fixes.length === 0 ? <p className="sub">No problems found. 🎉</p> : (
            <ol>
              {fixes.slice(0, 10).map((f) => (
                <li key={f.doc} style={{ marginBottom: 8 }}>
                  <strong>{f.doc}</strong>: {f.count} problem answer{f.count > 1 ? "s" : ""}{f.high ? ` (${f.high} high risk)` : ""}
                  {f.examples[0] ? <div className="sub">e.g. “{f.examples[0].question.slice(0, 120)}” → {f.examples[0].reason}</div> : null}
                </li>
              ))}
            </ol>
          )}
        </div>

        {items.length > 0 ? (
          <div className="card">
            <h3>Problem answers</h3>
            <div className="stack">
              {items.map((it) => (
                <div key={it.id} className="report-item">
                  <div className="row"><VerdictBadge verdict={it.verdict} /><SeverityBadge severity={it.severity} /></div>
                  <div className="grid grid-2" style={{ marginTop: 8 }}>
                    <div><div className="stat-label">Customer</div>{it.question}</div>
                    <div><div className="stat-label">Bot answer</div>{it.answer}</div>
                  </div>
                  <p className="sub" style={{ marginTop: 6 }}><strong>Why:</strong> {it.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <p className="faint" style={{ textAlign: "center", marginTop: 24 }}>Report prepared by {brand}{audit.brand ? " · powered by ProofMyAI" : ""}</p>
      </div>
    </div>
  );
}
