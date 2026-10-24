import { CopyBox } from "@/components/landing";
import { Flash, PageHeader } from "@/components/ui";
import { ValueReportView } from "@/components/value-report";
import { requireUser } from "@/lib/auth";
import { projectAccess } from "@/lib/projects";
import { recentMonths, valueReport, valueShareToken } from "@/lib/valuereport";
import { shareValueReportAction } from "../actions";

export const metadata = { title: "Proof of value" };

export default async function ValuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string; ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { project: p, role } = projectAccess(user.id, Number((await params).id));
  const sp = await searchParams;
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : undefined;
  const r = valueReport(p.id, month);
  const brand = p.report_brand || "ProofMyAI";
  const token = valueShareToken(p.id, false);
  const shareUrl = token ? `${process.env.APP_URL || ""}/v/${token}${month ? `?m=${month}` : ""}` : null;

  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} />
      <PageHeader title="Proof of value" subtitle="What was caught, blocked and fixed, in your client's own numbers. Send it as a read-only link or save it as a PDF." />

      <div className="card">
        <form className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label htmlFor="m" style={{ margin: 0 }}>Period</label>
          <select id="m" name="m" defaultValue={month ?? ""} style={{ width: "auto", minWidth: 200 }}>
            <option value="">Last 30 days</option>
            {recentMonths().map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn btn-sm">Show</button>
        </form>
        {role !== "viewer" ? (
          <div style={{ marginTop: 12 }}>
            {shareUrl ? (
              <>
                <CopyBox text={shareUrl} label="Client link (read-only)" />
                <form action={shareValueReportAction} style={{ marginTop: 8 }}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <input type="hidden" name="revoke" value="1" />
                  <button className="btn btn-ghost btn-sm">Turn off client link</button>
                </form>
              </>
            ) : (
              <form action={shareValueReportAction}>
                <input type="hidden" name="projectId" value={p.id} />
                <button className="btn btn-primary btn-sm">Create client link</button>
                <span className="sub" style={{ marginLeft: 8 }}>Shows this report with {brand === "ProofMyAI" ? "your brand (set it in Settings)" : brand} on it, read-only.</span>
              </form>
            )}
          </div>
        ) : null}
      </div>

      <ValueReportView r={r} brand={brand} project={p.name} />
    </div>
  );
}
