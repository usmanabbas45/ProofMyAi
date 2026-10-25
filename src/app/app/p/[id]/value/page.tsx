import { CopyBox } from "@/components/landing";
import { Flash, PageHeader } from "@/components/ui";
import { ValueReportView } from "@/components/value-report";
import { requireUser } from "@/lib/auth";
import { projectAccess } from "@/lib/projects";
import { clientReportSettings, nextSendAt } from "@/lib/clientreport";
import { recentMonths, valueReport, valueShareToken } from "@/lib/valuereport";
import { clientReportAction, shareValueReportAction } from "../actions";

export const metadata = { title: "Proof of value" };

export default async function ValuePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string; ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { project: p, role } = projectAccess(user.id, Number((await params).id));
  const sp = await searchParams;
  const month = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : undefined;
  const r = valueReport(p.id, month);
  const brand = p.report_brand || "ProofMyAI";
  const token = valueShareToken(p.id, false);
  const auto = clientReportSettings(p.id);
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

      {role !== "viewer" ? (
        <div className="card">
          <div className="card-head">
            <div>
              <h3>📬 Send this report to your client automatically</h3>
              <span className="sub">No need to check anything or remember to send it. ProofMyAI emails the report to your client, with {brand === "ProofMyAI" ? "your brand (set it in Settings)" : brand} on it. Replies come to you.</span>
            </div>
            <span className={auto.freq ? "badge badge-ok" : "badge"}>{auto.freq === "weekly" ? "Every Monday" : auto.freq === "monthly" ? "1st of every month" : "Off"}</span>
          </div>
          <form action={clientReportAction} className="stack" style={{ gap: 10 }}>
            <input type="hidden" name="projectId" value={p.id} />
            <div className="field">
              <label htmlFor="emails">Client email addresses (up to 5, separated by commas)</label>
              <input id="emails" name="emails" type="text" defaultValue={auto.emails.join(", ")} placeholder="owner@client.com, ops@client.com" maxLength={1200} />
            </div>
            <div className="field">
              <label htmlFor="freq">How often</label>
              <select id="freq" name="freq" defaultValue={auto.freq ?? ""} style={{ width: "auto", minWidth: 260 }}>
                <option value="">Off</option>
                <option value="weekly">Weekly: every Monday, last 7 days</option>
                <option value="monthly">Monthly: on the 1st, the month before</option>
              </select>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-sm">Save</button>
              <button className="btn btn-ghost btn-sm" name="test" value="1">Send me a test first</button>
            </div>
            {auto.freq ? <p className="hint" style={{ margin: 0 }}>Next report: {nextSendAt(auto.freq, auto.lastAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}, in the morning. Urgent problems still reach your own alert channels straight away.</p> : null}
          </form>
        </div>
      ) : null}

      <ValueReportView r={r} brand={brand} project={p.name} />
    </div>
  );
}
