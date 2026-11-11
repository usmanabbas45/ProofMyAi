import { SubmitButton } from "@/components/client";
import { Badge, Flash, PageHeader, timeAgo } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { projectAccess } from "@/lib/projects";
import { checkHealth, lastSelfTest } from "@/lib/selftest";
import { runSelfTestAction } from "../actions";

export const metadata = { title: "Check health" };

const ICON = { pass: "✅", fail: "❌", skip: "⏭️" } as const;
const UNPROVEN_DAYS = 90;

export default async function ChecksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { project: p, role } = projectAccess(user.id, Number((await params).id));
  const flash = await searchParams;
  const last = lastSelfTest(p.id);
  const health = checkHealth(p.id);
  const ageDays = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`)) / 86400000 : Infinity);
  const unproven = health.filter((h) => h.connected && ageDays(h.lastFired) > UNPROVEN_DAYS);

  return (
    <div>
      <Flash ok={flash.ok} error={flash.error} />
      <PageHeader title="Check health" subtitle="A check that has never fired hasn't been proven to work. ProofMyAI tests its own checks every month, like pressing a smoke alarm's test button." />

      <div className="card">
        <div className="card-head">
          <div>
            <h3>🧪 Self-test</h3>
            <span className="sub">Feeds each check a known-bad case: a made-up chatbot answer, a looping agent that drops a production table, and a test message to every alert channel. Runs automatically every 30 days. Costs nothing and stores no customer data.</span>
          </div>
          {last ? <Badge tone={last.ok ? "ok" : "bad"}>{last.ok ? "Passed" : "Failed"} {timeAgo(last.at)}</Badge> : <Badge tone="warn">Never run</Badge>}
        </div>
        {last ? (
          <div className="stack" style={{ marginTop: 12 }}>
            {last.results.map((r) => (
              <div key={r.id} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{ICON[r.status]}</span>
                <div><strong>{r.name}</strong><div className="sub">{r.detail}</div></div>
              </div>
            ))}
          </div>
        ) : <p className="sub" style={{ marginTop: 12 }}>No self-test yet. Run one now to prove your checks and alerts work.</p>}
        {role !== "viewer" ? (
          <form action={runSelfTestAction} className="row" style={{ marginTop: 16, gap: 12, flexWrap: "wrap" }}>
            <input type="hidden" name="projectId" value={p.id} />
            <label className="row" style={{ gap: 6 }}><input type="checkbox" name="send_alert" value="1" defaultChecked /> Also send a test message to my alert channels</label>
            <SubmitButton className="btn" pendingText="Testing…">Run self-test now</SubmitButton>
          </form>
        ) : null}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>🔔 When each check last caught something</h3>
            <span className="sub">If a connected check hasn&apos;t fired in {UNPROVEN_DAYS} days, either everything is perfect or the check isn&apos;t seeing your data. The self-test tells you which.</span>
          </div>
          {unproven.length ? <Badge tone="warn">{unproven.length} unproven</Badge> : null}
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Check</th><th>Catches</th><th>Last caught something</th><th>Last 30 days</th><th>Status</th></tr></thead>
            <tbody>
              {health.map((h) => (
                <tr key={h.name}>
                  <td><strong>{h.name}</strong></td>
                  <td className="sub">{h.what}</td>
                  <td>{h.connected ? timeAgo(h.lastFired) : "–"}</td>
                  <td>{h.connected ? h.fired30 : "–"}</td>
                  <td>{!h.connected ? <Badge tone="muted">Not connected</Badge>
                    : ageDays(h.lastFired) > UNPROVEN_DAYS ? <Badge tone="warn">Unproven</Badge>
                    : <Badge tone="ok">Proven</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
